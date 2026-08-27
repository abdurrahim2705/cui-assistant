import os

from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Load environment variables from your .env file (e.g., GEMINI_API_KEY, PINECONE_INDEX_NAME)
load_dotenv()


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

    # 2. Text Splitting:
    # LLMs handle smaller text chunks better during vector search.
    # - chunk_size=1000: Each piece will have roughly 1000 characters.
    # - chunk_overlap=150: Keeps 150 characters from the previous chunk to maintain context between splits.
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=150,
        separators=["\n\n", "\n", " ", ""]
    )
    
    # Create document chunks and attach metadata (title, category, upload source)
    docs = splitter.create_documents(
        texts=[clean_text],
        metadatas=[{
            "title": doc_title,
            "category": category,
            "source": "admin_text_paste"
        }]
    )

    # 3. Embedding Model:
    # Converts each text chunk into a high-dimensional mathematical vector (list of numbers).
    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004",
        google_api_key=os.getenv("GEMINI_API_KEY")
    )

    # 4. Pinecone Vector Storage:
    # Uploads the text chunks alongside their vector embeddings into your cloud index.
    index_name = os.getenv("PINECONE_INDEX_NAME")
    PineconeVectorStore.from_documents(
        documents=docs,
        embedding=embeddings,
        index_name=index_name
    )

    # Return the total count so the frontend can notify the admin
    return len(docs)