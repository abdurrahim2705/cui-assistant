import os

import bcrypt
import psycopg2
from dotenv import load_dotenv

# Load environment variables (.env contains DATABASE_URL, keys, etc.)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
DATABASE_URL = os.getenv("DATABASE_URL")


def init_database():
    """Initializes tables, seeds admin, policy documents, and 4 pending students with FA26 session-accurate reg numbers and pre-assigned courses."""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("--- Initializing Enhanced Database Schema (Fall 2026 Intake Mapping) ---")

    # Drop existing tables
    cur.execute("""
        DROP TABLE IF EXISTS policy_documents CASCADE;
        DROP TABLE IF EXISTS tasks CASCADE;
        DROP TABLE IF EXISTS enrollments CASCADE;
        DROP TABLE IF EXISTS courses CASCADE;
        DROP TABLE IF EXISTS students CASCADE;
        DROP TABLE IF EXISTS admins CASCADE;
    """)

    # 1. Admins Table
    cur.execute("""
        CREATE TABLE admins (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 2. Students Table
    cur.execute("""
        CREATE TABLE students (
            id SERIAL PRIMARY KEY,
            registration_no VARCHAR(50) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            password_hash VARCHAR(255),
            department VARCHAR(100) NOT NULL,
            semester INT DEFAULT 1,
            cgpa NUMERIC(3, 2) DEFAULT 0.00,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 3. Courses Table
    cur.execute("""
        CREATE TABLE courses (
            id SERIAL PRIMARY KEY,
            code VARCHAR(20) UNIQUE NOT NULL,
            title VARCHAR(150) NOT NULL,
            credit_hours INT NOT NULL,
            department VARCHAR(100) DEFAULT 'General'
        );
    """)

    # 4. Enrollments Table
    cur.execute("""
        CREATE TABLE enrollments (
            id SERIAL PRIMARY KEY,
            student_id INT REFERENCES students(id) ON DELETE CASCADE,
            course_id INT REFERENCES courses(id) ON DELETE CASCADE,
            attendance_pct NUMERIC(5, 2) DEFAULT 100.0,
            UNIQUE(student_id, course_id)
        );
    """)

    # 5. Tasks Table (Empty by default for user/AI management)
    cur.execute("""
        CREATE TABLE tasks (
            id SERIAL PRIMARY KEY,
            student_id INT REFERENCES students(id) ON DELETE CASCADE,
            course_id INT REFERENCES courses(id) ON DELETE SET NULL,
            title VARCHAR(255) NOT NULL,
            task_type VARCHAR(50) DEFAULT 'assignment',
            due_date DATE,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 6. Policy Documents Table
    cur.execute("""
        CREATE TABLE policy_documents (
            id SERIAL PRIMARY KEY,
            category VARCHAR(100) UNIQUE NOT NULL,
            title VARCHAR(200) NOT NULL,
            content TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    conn.commit()

    # =========================================================================
    # SEED 1: Admin Account (admin / admin123)
    # =========================================================================
    admin_pw_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode("utf-8")
    cur.execute("""
        INSERT INTO admins (username, password_hash, name)
        VALUES ('admin', %s, 'Super Admin')
        ON CONFLICT (username) DO NOTHING;
    """, (admin_pw_hash,))

    # =========================================================================
    # SEED 2: 4 Pending Students (Matched to FA26 Current Session)
    # =========================================================================
    students = [
        # (Reg No, Name, Department, Semester, CGPA)
        ('FA24-ELC-007', 'AbdurRahim Qayyum', 'Electronics and Computing', 5, 2.97),
        ('SP25-BCS-042', 'Danish Ahmed', 'Computer Science', 4, 3.20),
        ('FA25-BSE-019', 'Bilal Tariq', 'Software Engineering', 3, 2.85),
        ('SP26-BEE-055', 'Usman Raza', 'Electrical Engineering', 2, 3.10),
    ]

    for reg, name, dept, sem, cgpa in students:
        cur.execute("""
            INSERT INTO students (registration_no, name, password_hash, department, semester, cgpa, status)
            VALUES (%s, %s, NULL, %s, %s, %s, 'pending')
            ON CONFLICT (registration_no) DO NOTHING;
        """, (reg, name, dept, sem, cgpa))

    # =========================================================================
    # SEED 3: Master Course Catalog
    # =========================================================================
    courses = [
        ('ELC310', 'Embedded Systems & Microcontrollers', 4, 'Electronics and Computing'),
        ('ELC320', 'Digital Signal Processing', 4, 'Electronics and Computing'),
        ('ELC211', 'Digital Logic Design & Verilog', 4, 'Electronics and Computing'),
        ('CSC301', 'Data Structures and Algorithms', 3, 'Computer Science'),
        ('CSC339', 'Artificial Intelligence & Machine Learning', 3, 'Computer Science'),
        ('SWE302', 'Software Design Patterns & Architecture', 3, 'Software Engineering'),
        ('SWE205', 'Database Systems & SQL', 4, 'Software Engineering'),
        ('MTH231', 'Linear Algebra & Differential Equations', 3, 'General'),
        ('HUM100', 'English Comprehension & Composition', 3, 'General'),
    ]

    for code, title, credits, dept in courses:
        cur.execute("""
            INSERT INTO courses (code, title, credit_hours, department)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (code) DO NOTHING;
        """, (code, title, credits, dept))

    # =========================================================================
    # SEED 4: Pre-assigned Enrolled Courses
    # =========================================================================
    enrollments = [
        # Student 1: FA24-ELC-007 (Semester 5 - AbdurRahim Qayyum)
        ('FA24-ELC-007', 'ELC310', 91.5),
        ('FA24-ELC-007', 'ELC320', 84.0),
        ('FA24-ELC-007', 'ELC211', 88.0),
        ('FA24-ELC-007', 'CSC339', 95.0),
        ('FA24-ELC-007', 'MTH231', 82.5),
        # Student 2: SP25-BCS-042 (Semester 4 - Danish Ahmed)
        ('SP25-BCS-042', 'CSC301', 78.5),
        ('SP25-BCS-042', 'CSC339', 85.0),
        ('SP25-BCS-042', 'SWE205', 90.0),
        ('SP25-BCS-042', 'HUM100', 81.0),
        # Student 3: FA25-BSE-019 (Semester 3 - Bilal Tariq)
        ('FA25-BSE-019', 'SWE302', 89.0),
        ('FA25-BSE-019', 'SWE205', 93.5),
        ('FA25-BSE-019', 'CSC301', 87.0),
        ('FA25-BSE-019', 'HUM100', 79.5),
        # Student 4: SP26-BEE-055 (Semester 2 - Usman Raza)
        ('SP26-BEE-055', 'ELC211', 86.0),
        ('SP26-BEE-055', 'MTH231', 90.5),
        ('SP26-BEE-055', 'HUM100', 88.0),
    ]

    for reg, c_code, att in enrollments:
        cur.execute("""
            INSERT INTO enrollments (student_id, course_id, attendance_pct)
            SELECT s.id, c.id, %s
            FROM students s, courses c
            WHERE s.registration_no = %s AND c.code = %s
            ON CONFLICT (student_id, course_id) DO NOTHING;
        """, (att, reg, c_code))

    # =========================================================================
    # SEED 5: Categorized RAG Policy Documents
    # =========================================================================
    policies = [
        (
            "Attendance Policy",
            "COMSATS Attendance Regulation 2026",
            "Students must maintain a minimum of 80% attendance in every registered course (lectures and labs) to be eligible to appear in the terminal/final examination. Failure to meet 80% results in being dropped from the course with an 'F' grade."
        ),
        (
            "Course Add/Drop Policy",
            "Course Registration & Withdrawal Guidelines",
            "Students may add or drop registered courses within the first two weeks of the semester via the student portal. Courses dropped after the second week and before the midterm will be marked as 'W' (Withdrawn) on the transcript without impacting CGPA."
        ),
        (
            "Grading & Probation Policy",
            "Academic Standing & Probation Rules",
            "COMSATS follows a 4.0 GPA scale. A student whose CGPA drops below 2.00 is placed on Academic Probation 1 (P1). If the CGPA remains below 2.00 for two consecutive semesters, they are placed on P2, which may lead to academic dismissal."
        )
    ]

    for category, title, content in policies:
        cur.execute("""
            INSERT INTO policy_documents (category, title, content)
            VALUES (%s, %s, %s)
            ON CONFLICT (category) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content;
        """, (category, title, content))

    conn.commit()
    cur.close()
    conn.close()
    print("Database re-initialized: Registration numbers aligned with FA26 current session.")


if __name__ == "__main__":
    init_database()