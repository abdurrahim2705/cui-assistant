import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Explicitly load .env from project root
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)


def ingest_document(text_content: str, doc_title: str, category: str = "General") -> int:
    """
    Takes plain text pasted by an admin, splits it into small chunks,
    generates vector embeddings via Google Gemini, and saves them into Pinecone.
    
    Returns the total number of chunks created and stored.
    """
    
    # 1. Clean up input and prevent empty submissions
    clean_text = text_content.strip()
    if not clean_text:
        raise ValueError("Document content cannot be empty.")

    # 2. Retrieve & validate API keys
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    index_name = os.getenv("PINECONE_INDEX_NAME", "cui-assistant")
    pinecone_key = os.getenv("PINECONE_API_KEY")

    if not gemini_key:
        raise ValueError("GEMINI_API_KEY / GOOGLE_API_KEY is missing from environment variables.")
    if not pinecone_key:
        raise ValueError("PINECONE_API_KEY is missing from environment variables.")

    # 3. Text Splitting:
    # 500 characters provides optimal semantic granularity for policy rules and FAQs
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=100,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    
    docs = splitter.create_documents(
        texts=[clean_text],
        metadatas=[{
            "title": doc_title,
            "category": category,
            "source": "admin_text_paste"
        }]
    )

    # 4. Embedding Model
    embeddings = GoogleGenerativeAIEmbeddings(
        model="gemini-embedding-001",
        google_api_key=gemini_key,
        output_dimensionality=768,
    )

    # 5. Pinecone Vector Storage
    PineconeVectorStore.from_documents(
        documents=docs,
        embedding=embeddings,
        index_name=index_name,
    )

    return len(docs)