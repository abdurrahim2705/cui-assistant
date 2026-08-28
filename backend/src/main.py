import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import bcrypt
import jwt
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pinecone import Pinecone
from pydantic import BaseModel, ValidationError

# Add current directory to path so local modules import reliably
sys.path.append(os.path.dirname(__file__))
from assistant import ask_assistant, get_student_record, sync_all_policies_to_pinecone
from db import get_db_connection
from rag_loader import ingest_document

# Load environment configuration (.env contains JWT secrets and database URLs)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "cui-super-secret-key-2026")
ALGORITHM = "HS256"

app = FastAPI(title="COMSATS AI Assistant API")

# Enable CORS so the React frontend running on port 5173 can make API requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# HTTPBearer extracts the "Bearer <token>" header automatically from incoming requests
security = HTTPBearer()


# =============================================================================
# Pydantic Request Models (Validates incoming JSON payloads)
# =============================================================================

class StudentRegisterRequest(BaseModel):
    registration_no: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TaskCreateRequest(BaseModel):
    title: str
    task_type: str = "assignment"
    course_code: str | None = None
    due_date: str | None = None


class TaskUpdateRequest(BaseModel):
    status: str


class StudentStatusUpdateRequest(BaseModel):
    status: Literal["approved", "rejected", "pending"]


class PolicyDocUpdateRequest(BaseModel):
    content: str


class RAGDocumentCreateRequest(BaseModel):
    title: str
    category: str = "General"
    content: str


class ChatRequest(BaseModel):
    message: str


# =============================================================================
# Authentication Helpers
# =============================================================================

def create_access_token(data: dict, expires_delta: timedelta = timedelta(days=7)) -> str:
    """Generates a signed JWT access token valid for 7 days."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)]) -> dict:
    """Decodes and validates the JWT Bearer token from the Authorization header."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except (jwt.PyJWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        )


CurrentUser = Annotated[dict, Depends(get_current_user)]


# =============================================================================
# Authentication Routes
# =============================================================================

@app.post("/auth/register")
def register_student(req: StudentRegisterRequest):
    """Allows pre-seeded students to set their password and queue for admin approval."""
    reg_no = req.registration_no.strip()
    conn = get_db_connection()
    cur = conn.cursor()

    # 1. Verify student registration number exists in university records
    cur.execute("SELECT id, status, password_hash FROM students WHERE LOWER(registration_no) = LOWER(%s);", (reg_no,))
    student = cur.fetchone()

    if not student:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Registration number not found in university records.")

    # 2. Block registration if student already has a password and is active
    if student["password_hash"] is not None and student["status"] == "approved":
        cur.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Account already registered and active. Please log in.")

    # 3. Hash password and reset status to 'pending'
    pw_hash = bcrypt.hashpw(req.password.strip().encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    cur.execute(
        "UPDATE students SET password_hash = %s, status = 'pending' WHERE id = %s;",
        (pw_hash, student["id"]),
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Registration submitted! Please wait for Admin approval before logging in."}


@app.post("/auth/login")
def login(req: LoginRequest):
    """Authenticates both Admin and Student accounts, enforcing the approval gate."""
    identifier = req.username.strip()
    password = req.password.strip()

    conn = get_db_connection()
    cur = conn.cursor()

    # 1. Check if user is Admin
    cur.execute("SELECT id, username, password_hash, name FROM admins WHERE username = %s;", (identifier,))
    admin = cur.fetchone()
    if admin and bcrypt.checkpw(password.encode("utf-8"), admin["password_hash"].encode("utf-8")):
        cur.close()
        conn.close()
        token = create_access_token({"sub": admin["username"], "role": "admin", "name": admin["name"]})
        return {"access_token": token, "token_type": "bearer", "role": "admin", "name": admin["name"]}

    # 2. Check if user is Student
    cur.execute(
        "SELECT id, registration_no, password_hash, name, status FROM students WHERE LOWER(registration_no) = LOWER(%s);",
        (identifier,),
    )
    student = cur.fetchone()
    cur.close()
    conn.close()

    if not student:
        raise HTTPException(status_code=401, detail="Invalid username/registration number or password.")

    if not student["password_hash"]:
        raise HTTPException(status_code=400, detail="Account not registered yet. Please click 'Register here' first.")

    if not bcrypt.checkpw(password.encode("utf-8"), student["password_hash"].encode("utf-8")):
        raise HTTPException(status_code=401, detail="Invalid username/registration number or password.")

    # 3. Enforce Pending Approval gate
    if student["status"] == "pending":
        raise HTTPException(status_code=403, detail="Your registration is currently pending admin approval.")
    if student["status"] == "rejected":
        raise HTTPException(status_code=403, detail="Your registration was rejected. Please contact the administrator.")

    # Issue token for approved student
    token = create_access_token({"sub": student["registration_no"], "role": "student", "name": student["name"]})
    return {"access_token": token, "token_type": "bearer", "role": "student", "name": student["name"]}


# =============================================================================
# Student Feature Routes
# =============================================================================

@app.get("/student/me")
def get_my_profile(current_user: CurrentUser):
    """Fetches the logged-in student's profile, enrolled courses, attendance, and tasks."""
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Access denied.")
    record = get_student_record(current_user["sub"])
    if not record:
        raise HTTPException(status_code=404, detail="Student profile not found.")
    return record


@app.post("/tasks")
def create_task(req: TaskCreateRequest, current_user: CurrentUser):
    """Creates a new assignment or study task for the authenticated student."""
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Access denied.")
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM students WHERE LOWER(registration_no) = LOWER(%s);", (current_user["sub"],))
    student = cur.fetchone()

    # Match course code to ID if provided
    course_id = None
    if req.course_code:
        cur.execute("SELECT id FROM courses WHERE LOWER(code) = LOWER(%s);", (req.course_code,))
        course = cur.fetchone()
        if course:
            course_id = course["id"]

    cur.execute(
        """
        INSERT INTO tasks (student_id, course_id, title, task_type, due_date, status)
        VALUES (%s, %s, %s, %s, %s, 'pending')
        RETURNING id, title, task_type, due_date, status;
        """,
        (student["id"], course_id, req.title, req.task_type, req.due_date),
    )
    task = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return {"task": task}


@app.put("/tasks/{task_id}")
def update_task(task_id: int, req: TaskUpdateRequest, current_user: CurrentUser):
    """Updates status ('completed' or 'pending') of a student's own task."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE tasks SET status = %s 
        WHERE id = %s AND student_id = (SELECT id FROM students WHERE LOWER(registration_no) = LOWER(%s))
        RETURNING id, status;
        """,
        (req.status, task_id, current_user["sub"]),
    )
    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not updated:
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"task": updated}


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, current_user: CurrentUser):
    """Deletes a task belonging to the student."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        DELETE FROM tasks 
        WHERE id = %s AND student_id = (SELECT id FROM students WHERE LOWER(registration_no) = LOWER(%s))
        RETURNING id;
        """,
        (task_id, current_user["sub"]),
    )
    deleted = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"message": "Task deleted"}


@app.post("/chat")
def chat_with_copilot(req: ChatRequest, current_user: CurrentUser):
    """Interacts with the LangGraph academic copilot with dynamic Pinecone RAG and tool access."""
    if current_user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Chat is available for students.")
    bot_reply = ask_assistant(req.message, current_user["sub"])
    return {"response": bot_reply}


# =============================================================================
# Admin Management Routes
# =============================================================================

@app.get("/admin/students")
def list_students(current_user: CurrentUser):
    """Returns all students for admin verification and status tracking."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, registration_no, name, department, semester, cgpa, status FROM students ORDER BY id ASC;")
    students = cur.fetchall()
    cur.close()
    conn.close()
    return {"students": students}


@app.put("/admin/students/{student_id}/status")
def change_student_status(student_id: int, req: StudentStatusUpdateRequest, current_user: CurrentUser):
    """Approves or rejects a student registration."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("UPDATE students SET status = %s WHERE id = %s RETURNING id, status;", (req.status, student_id))
    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    if not updated:
        raise HTTPException(status_code=404, detail="Student not found.")
    return {"message": f"Student status updated to {req.status}"}


@app.get("/admin/documents")
def list_documents(current_user: CurrentUser):
    """Retrieves all university policy documents stored in PostgreSQL."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, category, title, content, updated_at FROM policy_documents ORDER BY id ASC;")
    docs = cur.fetchall()
    cur.close()
    conn.close()
    return {"documents": docs}


@app.put("/admin/documents/{doc_id}")
def update_policy_document(doc_id: int, req: PolicyDocUpdateRequest, current_user: CurrentUser):
    """Updates a policy document and automatically re-indexes vectors into Pinecone."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE policy_documents SET content = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING id;",
        (req.content, doc_id),
    )
    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    if not updated:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Synchronize updated text to Pinecone vector store
    sync_all_policies_to_pinecone()
    return {"message": "Document updated and Pinecone vectors synchronized."}


@app.post("/admin/rag/add-document")
def add_rag_document(req: RAGDocumentCreateRequest, current_user: CurrentUser):
    """
    Saves a new document into PostgreSQL and indexes its chunks directly into Pinecone.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")

    # 1. Save document to PostgreSQL policy_documents table
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO policy_documents (category, title, content, updated_at)
        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
        RETURNING id;
        """,
        (req.category.strip(), req.title.strip(), req.content.strip()),
    )
    new_doc = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()

    # 2. Split, embed, and upsert chunks into Pinecone
    try:
        chunks_count = ingest_document(
            text_content=req.content,
            doc_title=req.title,
            category=req.category,
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Database saved, but Pinecone indexing failed: {e!s}",
        ) from e

    return {
        "status": "success",
        "document_id": new_doc["id"],
        "message": f"Document '{req.title}' saved to database and indexed into Pinecone.",
        "chunks_indexed": chunks_count,
    }


@app.delete("/admin/documents/{doc_id}")
def delete_policy_document(doc_id: int, current_user: CurrentUser):
    """
    Deletes a policy document from PostgreSQL and removes corresponding vectors from Pinecone.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")

    conn = get_db_connection()
    cur = conn.cursor()

    # 1. Check if document exists and get its title for Pinecone metadata filtering
    cur.execute("SELECT title FROM policy_documents WHERE id = %s;", (doc_id,))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found.")

    doc_title = row["title"]

    # 2. Delete from PostgreSQL
    cur.execute("DELETE FROM policy_documents WHERE id = %s;", (doc_id,))
    conn.commit()
    cur.close()
    conn.close()

    # 3. Delete matching vectors from Pinecone
    try:
        pinecone_key = os.getenv("PINECONE_API_KEY")
        index_name = os.getenv("PINECONE_INDEX_NAME", "cui-assistant")
        if pinecone_key:
            pc = Pinecone(api_key=pinecone_key)
            index = pc.Index(index_name)
            index.delete(filter={"title": {"$eq": doc_title}})
    except Exception as e:  # noqa: BLE001
        print(f"Warning: Failed to delete Pinecone vectors for '{doc_title}': {e}")

    return {"message": f"Document '{doc_title}' deleted successfully from database and Pinecone."}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)