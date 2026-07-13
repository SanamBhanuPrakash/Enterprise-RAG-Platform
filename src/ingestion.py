import os
from llama_index.core import SimpleDirectoryReader, StorageContext, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter, CodeSplitter
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.vector_stores.lancedb import LanceDBVectorStore
from llama_index.core import Settings

# ==============================================================================
# 1. LOCAL AI ENGINE SETUP (Using 6GB VRAM constraint)
# ==============================================================================
# Set up the Embedding Model (silently converts files to vectors)
Settings.embed_model = OllamaEmbedding(model_name="nomic-embed-text")

# Set up the Chat Brain (reasoning and generation)
Settings.llm = Ollama(model="qwen3.5:4b", request_timeout=120.0)

# ==============================================================================
# 2. THE TRAFFIC COP (Dual-Pronged Chunking Strategy)
# ==============================================================================
def process_documents(documents):
    """
    Routes documents to specialized chunkers based on file type.
    PDFs/Docs -> SentenceSplitter (Text-based)
    Code -> CodeSplitter (AST/Syntax-based)
    """
    processed_nodes = []
    
    # Initialize the splitters
    text_chunker = SentenceSplitter(chunk_size=512, chunk_overlap=50)
    # The CodeSplitter uses the AST (Abstract Syntax Tree) to keep functions intact
    python_chunker = CodeSplitter(language="python", chunk_lines=40, chunk_lines_overlap=15)
    
    for doc in documents:
        # Check the file extension attached to the metadata
        file_ext = doc.metadata.get('file_name', '').lower()
        
        if file_ext.endswith('.py'):
            print(f"--> [Code Detected] Ast-Chunking: {doc.metadata['file_name']}")
            nodes = python_chunker.get_nodes_from_documents([doc])
        else:
            print(f"--> [Text Detected] Semantic-Chunking: {doc.metadata['file_name']}")
            nodes = text_chunker.get_nodes_from_documents([doc])
            
        processed_nodes.extend(nodes)
        
    return processed_nodes

# ==============================================================================
# 3. THE VECTOR DATABASE PIPELINE (LanceDB)
# ==============================================================================
def build_database():
    # Point the reader to the private folder we created
    data_dir = os.path.join(os.path.dirname(__file__), '..', 'private_data')
    db_dir = os.path.join(os.path.dirname(__file__), '..', 'storage', 'lancedb')
    
    print(f"1. Scanning {data_dir} for files...")
    # Load all files (code, txt, pdfs) from the private directory
    documents = SimpleDirectoryReader(data_dir, recursive=True).load_data()
    
    if not documents:
        print("Folder is empty. Please drop a .txt or .py file into 'private_data'!")
        return

    print("2. Routing files through the Traffic Cop...")
    nodes = process_documents(documents)
    
    print("3. Connecting to Enterprise LanceDB engine...")
    # LanceDB runs instantly on the SSD, saving VRAM
    vector_store = LanceDBVectorStore(uri=db_dir, table_name="enterprise_rag")
    storage_context = StorageContext.from_defaults(vector_store=vector_store)
    
    print("4. Embedding files into vectors (This takes a moment)...")
    # This command uses nomic-embed-text to convert all chunks into numbers
    index = VectorStoreIndex(nodes, storage_context=storage_context)
    
    print("========================================")
    print("SUCCESS: Database Built & Synced!")
    print("========================================")

if __name__ == "__main__":
    build_database()