import os
import sys
from typing import Annotated, Literal

from dotenv import load_dotenv
from langchain_core.documents import Document
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from pinecone import Pinecone
from pydantic import BaseModel

# Add current directory to path for local module imports
sys.path.append(os.path.dirname(__file__))
from db import get_db_connection

# Load environment keys
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "comsats-ai-assistant")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Initialize Gemini Embeddings (768 dimensions for Pinecone index)
embeddings = GoogleGenerativeAIEmbeddings(
    model="gemini-embedding-001",
    google_api_key=GOOGLE_API_KEY,
    output_dimensionality=768,
)

# Connect to Pinecone Vector Index
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(INDEX_NAME)
vector_store = PineconeVectorStore(index=index, embedding=embeddings)


def sync_all_policies_to_pinecone():
    """Fetches all categorized documents from PostgreSQL and syncs them into Pinecone for dynamic RAG."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT category, title, content FROM policy_documents;")
    docs_db = cur.fetchall()
    cur.close()
    conn.close()

    documents = [
        Document(
            page_content=f"[{d['category']}] {d['title']}: {d['content']}",
            metadata={"category": d["category"], "title": d["title"]},
        )
        for d in docs_db
    ]
    if documents:
        vector_store.add_documents(documents)
    return len(documents)


def get_cgpa_grade_standing(cgpa: float) -> str:
    """Derives academic standing and distinction label based on CGPA."""
    if cgpa >= 3.67:
        return "A (Excellent / High Honors)"
    if cgpa >= 3.33:
        return "A- / B+ (High Distinction)"
    if cgpa >= 2.67:
        return "B (Good Standing)"
    if cgpa >= 2.33:
        return "B- / C+ (Satisfactory)"
    if cgpa >= 2.00:
        return "C (Pass / Minimum Required)"
    return "Academic Probation (< 2.00)"


def get_student_record(reg_no: str) -> dict | None:
    """Retrieves full student profile, registered courses, attendance, and tasks from PostgreSQL."""
    conn = get_db_connection()
    cur = conn.cursor()

    # 1. Fetch Student Info
    cur.execute(
        "SELECT id, registration_no, name, department, semester, cgpa, status FROM students WHERE LOWER(registration_no) = LOWER(%s);",
        (reg_no,),
    )
    student = cur.fetchone()
    if not student:
        cur.close()
        conn.close()
        return None

    student["academic_standing"] = get_cgpa_grade_standing(float(student["cgpa"]))

    # 2. Fetch Enrolled Courses with Attendance
    cur.execute(
        """
        SELECT c.code, c.title, c.credit_hours, e.attendance_pct
        FROM enrollments e
        JOIN courses c ON e.course_id = c.id
        WHERE e.student_id = %s;
        """,
        (student["id"],),
    )
    courses = cur.fetchall()

    # 3. Fetch Student Tasks
    cur.execute(
        """
        SELECT t.id, t.title, t.task_type, t.due_date, t.status, c.code AS course_code
        FROM tasks t
        LEFT JOIN courses c ON t.course_id = c.id
        WHERE t.student_id = %s
        ORDER BY t.created_at DESC;
        """,
        (student["id"],),
    )
    tasks = cur.fetchall()

    cur.close()
    conn.close()
    return {"student": student, "courses": courses, "tasks": tasks}


def add_student_task(reg_no: str, title: str, task_type: str = "assignment", course_code: str | None = None, due_date: str | None = None) -> dict:
    """Inserts a new assignment/task for a student into PostgreSQL."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM students WHERE LOWER(registration_no) = LOWER(%s);", (reg_no,))
    student = cur.fetchone()
    if not student:
        cur.close()
        conn.close()
        return {"error": "Student not found."}

    course_id = None
    if course_code:
        cur.execute("SELECT id FROM courses WHERE LOWER(code) = LOWER(%s);", (course_code,))
        course = cur.fetchone()
        if course:
            course_id = course["id"]

    cur.execute(
        """
        INSERT INTO tasks (student_id, course_id, title, task_type, due_date, status)
        VALUES (%s, %s, %s, %s, %s, 'pending')
        RETURNING id, title, task_type, due_date, status;
        """,
        (student["id"], course_id, title, task_type, due_date),
    )
    new_task = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Task created successfully", "task": new_task}


def update_student_task(task_id: int, reg_no: str, status: str | None = None) -> dict:
    """Updates a student's task status (completed or pending)."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE tasks 
        SET status = COALESCE(%s, status) 
        WHERE id = %s AND student_id = (SELECT id FROM students WHERE LOWER(registration_no) = LOWER(%s))
        RETURNING id, status;
        """,
        (status, task_id, reg_no),
    )
    updated = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return {"message": "Task updated", "task": updated}


def delete_student_task(task_id: int, reg_no: str) -> dict:
    """Deletes a student task by ID."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        """
        DELETE FROM tasks 
        WHERE id = %s AND student_id = (SELECT id FROM students WHERE LOWER(registration_no) = LOWER(%s))
        RETURNING id;
        """,
        (task_id, reg_no),
    )
    deleted = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return {"message": f"Task #{task_id} deleted successfully"} if deleted else {"error": "Task not found."}


# =============================================================================
# Agentic Tools for LangGraph
# =============================================================================
@tool
def search_university_policies(query: str) -> str:
    """Search official COMSATS policies, attendance criteria, grading scales, and regulations from Pinecone."""
    docs = vector_store.similarity_search(query, k=2)
    return "\n\n".join([f"- {d.page_content}" for d in docs])


@tool
def create_academic_task(reg_no: str, title: str, task_type: str = "assignment", course_code: str | None = None, due_date: str | None = None) -> str:
    """Create a new task, assignment, or quiz for the student."""
    return str(add_student_task(reg_no, title, task_type, course_code, due_date))


@tool
def update_academic_task_status(task_id: int, reg_no: str, status: str) -> str:
    """Update task status to 'completed' or 'pending'."""
    return str(update_student_task(task_id, reg_no, status))


@tool
def delete_academic_task(task_id: int, reg_no: str) -> str:
    """Delete a task by task ID."""
    return str(delete_student_task(task_id, reg_no))


tools = [search_university_policies, create_academic_task, update_academic_task_status, delete_academic_task]

# Bind tools to Gemini
llm = ChatGoogleGenerativeAI(model="gemini-3.5-flash-lite", google_api_key=GOOGLE_API_KEY)
llm_with_tools = llm.bind_tools(tools)


class AgentState(BaseModel):
    messages: Annotated[list[BaseMessage], add_messages]
    reg_no: str


def assistant_node(state: AgentState) -> dict:
    """State node that injects live student database context and queries the LLM."""
    student_data = get_student_record(state.reg_no)
    db_context = f"Student Profile, Courses & Current Tasks: {student_data}" if student_data else "No record found."
    system_instruction = f"""You are the COMSATS University Islamabad (CUI) AI Academic Assistant.
Current Student: {state.reg_no}

SCOPE & GUIDELINES:
1. Assist with all aspects of COMSATS University life, including academics, official policies, grading, attendance, enrolled courses, student tasks, campus facilities, hostel accommodation (on-campus & private options), and extra-curricular activities (sports, student week, societies, events).
2. Use the retrieved Knowledge Base / RAG context to provide accurate and specific details regarding campus guidelines, hostel rules, fees, and student life.
3. You can manage tasks (create, update, complete, or delete) automatically using your available tools when requested.
4. If the user asks about pending tasks or courses, summarize them clearly based on the provided live student context below.
5. For unrelated non-university questions, politely decline and guide the student back to COMSATS-related academic or campus topics.
6. If specific official policy details are missing or unavailable in the retrieved context, advise consulting the relevant department coordinator or campus office.

Live Student Context:
{db_context}"""
    response = llm_with_tools.invoke([SystemMessage(content=system_instruction)] + list(state.messages))
    return {"messages": [response]}


def should_continue(state: AgentState) -> Literal["tools", "__end__"]:
    """Determines whether the LLM produced a tool call or a final conversational response."""
    last_message = state.messages[-1]
    return "tools" if hasattr(last_message, "tool_calls") and last_message.tool_calls else "__end__"


# Build the LangGraph workflow
workflow = StateGraph(AgentState)
workflow.add_node("agent", assistant_node)
workflow.add_node("tools", ToolNode(tools))
workflow.add_edge(START, "agent")
workflow.add_conditional_edges("agent", should_continue, {"tools": "tools", "__end__": END})
workflow.add_edge("tools", "agent")
app_graph = workflow.compile()


def ask_assistant(query: str, reg_no: str) -> str:
    """Helper invoked by FastAPI /chat endpoint."""
    output = app_graph.invoke({"messages": [HumanMessage(content=query)], "reg_no": reg_no})
    final_message = output["messages"][-1]
    if isinstance(final_message.content, list):
        return "\n".join([p.get("text", "") for p in final_message.content if isinstance(p, dict) and "text" in p]).strip()
    return str(final_message.content).strip()