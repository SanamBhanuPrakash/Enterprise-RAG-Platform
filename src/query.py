import os
from llama_index.core import StorageContext, VectorStoreIndex
from llama_index.vector_stores.lancedb import LanceDBVectorStore
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.core import Settings

# ==============================================================================
# 1. CONNECT TO LOCAL AI ENGINE (Matches our ingestion setup)
# ==============================================================================
Settings.embed_model = OllamaEmbedding(model_name="nomic-embed-text")
Settings.llm = Ollama(model="qwen3.5:4b", request_timeout=300.0)

def ask_rag(question):
    # Point to the exact folder where LanceDB saved our vectors
    db_dir = os.path.join(os.path.dirname(__file__), '..', 'storage', 'lancedb')
    
    # Connect to the existing LanceDB table
    vector_store = LanceDBVectorStore(uri=db_dir, table_name="enterprise_rag")
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    
    # Load the indexed vectors from the database
    index = VectorStoreIndex.from_vector_store(vector_store=vector_store, storage_context=storage_context)
    
    # Convert the index into a production-ready Query Engine
    # similarity_top_k=3 means it will grab the top 3 closest matching chunks
    query_engine = index.as_query_engine(similarity_top_k=3)
    
    print("\n[RAG Engine] Searching database and reasoning context...")
    response = query_engine.query(question)
    
    print("\n==================== ANSWER ====================")
    print(response)
    print("================================================\n")

if __name__ == "__main__":
    # Get user input directly in the terminal
    user_question = input("Ask your RAG system a question: ")
    ask_rag(user_question)