import os

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

# Load environment variables (.env file containing DATABASE_URL)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
DATABASE_URL = os.getenv("DATABASE_URL")


def get_db_connection():
    """Establishes and returns a connection to PostgreSQL.

    Uses RealDictCursor so queries return dictionaries (key-value pairs)
    instead of plain tuples, ensuring FastAPI can serialize responses to JSON.
    """
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)