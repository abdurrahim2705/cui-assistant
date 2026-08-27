import os
import sys

from dotenv import load_dotenv
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone

# Ensure project modules resolve and load environment variables from backend/.env
sys.path.append(os.path.dirname(__file__))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Pinecone & Google Gemini configuration values
INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "comsats-ai-assistant")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# Seed knowledge base documents for COMSATS University policies
docs = [
    Document(
        page_content="COMSATS University Islamabad follows a 4.00 CGPA scale. The minimum passing grade for undergraduate courses is 'D' (50%), while 'A' corresponds to 85% and above.",
        metadata={"category": "grading"},
    ),
    Document(
        page_content="A minimum of 80% attendance in lectures and laboratory sessions is mandatory to be eligible to appear in the terminal examinations at COMSATS.",
        metadata={"category": "academic_rules"},
    ),
    Document(
        page_content="Students can add or drop courses within the first two weeks of the semester via the student portal. Withdrawing from a course with a 'W' grade is permitted up to the 10th week.",
        metadata={"category": "registration"},
    ),
    Document(
        page_content="An undergraduate student is placed on academic probation if their semester GPA or CGPA falls below 2.00. Serious academic dismissal rules apply after consecutive probations.",
        metadata={"category": "academic_rules"},
    ),
]


def ingest_knowledge():
    """Generates dense vector embeddings and indexes documents into Pinecone."""
    print("Initializing LangChain embeddings and Pinecone vector store...")

    # Force 768 dimensions to match your existing Pinecone index configuration
    embeddings = GoogleGenerativeAIEmbeddings(
        model="gemini-embedding-001",
        google_api_key=GOOGLE_API_KEY,
        output_dimensionality=768,
    )

    # Connect to the target Pinecone index
    pc = Pinecone(api_key=PINECONE_API_KEY)
    index = pc.Index(INDEX_NAME)

    # Wrap the Pinecone index with LangChain's vector store
    vector_store = PineconeVectorStore(index=index, embedding=embeddings)

    # Convert document chunks into vectors and upload to Pinecone
    print("Uploading document chunks to Pinecone...")
    vector_store.add_documents(documents=docs)
    print("Knowledge base successfully embedded and indexed via LangChain!")


if __name__ == "__main__":
    ingest_knowledge()