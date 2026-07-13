from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from contextlib import asynccontextmanager
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from llama_index.core import SimpleDirectoryReader
import json
import os
import shutil
import asyncio
import time

from llama_index.core import StorageContext, VectorStoreIndex
from llama_index.vector_stores.lancedb import LanceDBVectorStore
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.core import Settings
from llama_index.readers.file import PyMuPDFReader

from src.models import init_db, SessionLocal, ChatSession, ChatMessage

init_db()

def configure_sqlite_wal():
    db = SessionLocal()
    db.execute(text("PRAGMA journal_mode=WAL;"))
    db.execute(text("PRAGMA synchronous=NORMAL;"))
    db.commit()
    db.close()

configure_sqlite_wal()

# ==============================================================================
# HARDWARE-SAFE AI CONFIGURATION (Optimized for 6GB VRAM)
# ==============================================================================
Settings.embed_model = OllamaEmbedding(model_name="nomic-embed-text")

# 1. Increased timeout to 5 minutes so it doesn't arbitrarily abort on heavy queries
Settings.llm = Ollama(model="qwen3.5:4b", request_timeout=300.0) 

# 2. Cut chunk size in half (512). This physically prevents the AI from loading 
#    too much text into the RTX 4050's memory at once, preventing crashes.
Settings.chunk_size = 512 

db_dir = os.path.join(os.path.dirname(__file__), '..', 'storage', 'lancedb')
vector_store = LanceDBVectorStore(uri=db_dir, table_name="enterprise_rag")
storage_context = StorageContext.from_defaults(vector_store=vector_store)
index = VectorStoreIndex.from_vector_store(vector_store=vector_store, storage_context=storage_context)

# 3. Pull the top 2 highly precise chunks instead of 3 broad ones (Saves VRAM)
query_engine = index.as_query_engine(similarity_top_k=2, streaming=True, response_mode="compact")

def get_custom_extractors():
    return {".pdf": PyMuPDFReader()}

class AutoSyncHandler(FileSystemEventHandler):
    def wait_for_file(self, file_path):
        historical_size = -1
        retries = 0
        while retries < 10:
            try:
                current_size = os.path.getsize(file_path)
                if current_size == historical_size and current_size > 0:
                    return True
                historical_size = current_size
                time.sleep(1)
                retries += 1
            except Exception:
                time.sleep(1)
        return False

    def process_file(self, file_path):
        if os.path.basename(file_path).startswith('.') or "lancedb" in file_path:
            return
        if not self.wait_for_file(file_path):
            return
            
        try:
            print(f"[Watchdog] Deep-scanning document: {file_path}")
            reader = SimpleDirectoryReader(
                input_files=[file_path], 
                file_extractor=get_custom_extractors()
            )
            documents = reader.load_data()
            if documents and len(documents[0].text.strip()) > 50:
                for doc in documents:
                    index.insert(doc)
                print(f"[Watchdog] Successfully integrated {file_path} into neural map.")
        except Exception as e:
            print(f"[Watchdog Error] Failed to read {file_path}: {e}")

    def on_created(self, event):
        if not event.is_directory: self.process_file(event.src_path)

    def on_modified(self, event):
        if not event.is_directory: self.process_file(event.src_path)

@asynccontextmanager
async def lifespan(app: FastAPI):
    target_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'private_data'))
    os.makedirs(target_dir, exist_ok=True)
    
    event_handler = AutoSyncHandler()
    observer = Observer()
    observer.schedule(event_handler, target_dir, recursive=True)
    observer.start()
    print(f"\n[System] Watchdog Daemon active. Monitoring {target_dir} for any file changes in real-time...\n")
    
    yield
    observer.stop()
    observer.join()

app = FastAPI(title="Nexus AI Core API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

@app.get("/api/sessions")
def get_sessions(db: Session = Depends(get_db)):
    return db.query(ChatSession).order_by(ChatSession.updated_at.desc()).all()

@app.get("/api/sessions/{session_id}/messages")
def get_messages(session_id: str, db: Session = Depends(get_db)):
    return db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at.asc()).all()

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)):
    db.query(ChatMessage).filter(ChatMessage.session_id == session_id).delete()
    db.query(ChatSession).filter(ChatSession.id == session_id).delete()
    db.commit()
    return {"status": "success"}

@app.post("/api/sync")
async def sync_directory():
    target_dir = os.path.join(".", "private_data")
    os.makedirs(target_dir, exist_ok=True)
    try:
        reader = SimpleDirectoryReader(
            input_dir=target_dir, 
            recursive=True,
            file_extractor=get_custom_extractors()
        )
        documents = reader.load_data()
        
        valid_docs = 0
        for doc in documents:
            if len(doc.text.strip()) > 50:
                index.insert(doc)
                valid_docs += 1
            
        return {"status": "success", "message": f"Successfully mapped and indexed {valid_docs} document pieces from local storage."}
    except Exception as e:
        return {"status": "error", "message": f"Sync failed: {str(e)}"}

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...), 
    project_name: str = Form(...)
):
    target_dir = os.path.join(".", "private_data", project_name)
    os.makedirs(target_dir, exist_ok=True)
    file_path = os.path.join(target_dir, file.filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"status": "success", "fileName": file.filename}

@app.post("/api/chat/stream")
async def stream_chat(data: dict, db: Session = Depends(get_db)):
    session_id = data.get("session_id")
    prompt = data.get("prompt", "").strip()
    project_id = data.get("project_id", "IT-Codebase")
    title = data.get("title", "New Chat")
    
    session_record = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session_record:
        session_record = ChatSession(id=session_id, project_id=project_id, title=title)
        db.add(session_record)
        db.commit()

    user_msg = ChatMessage(session_id=session_id, role="user", content=prompt)
    db.add(user_msg)
    db.commit()

    routing_prompt = f"""You are an intent classification system.
    User Message: "{prompt}"
    If the user is making a casual greeting, small talk, or general statement, output exactly: CHAT
    If the user is asking a specific question that requires searching an internal codebase or document database, output exactly: SEARCH
    Output ONLY one word: CHAT or SEARCH."""
    
    try:
        intent_decision = Settings.llm.complete(routing_prompt, max_tokens=2).text.strip().upper()
    except Exception:
        intent_decision = "SEARCH" 

    async def event_generator():
        full_response = ""
        try:
            if "SEARCH" in intent_decision:
                response = query_engine.query(prompt)
                for text_chunk in response.response_gen:
                    if text_chunk: 
                        yield f"data: {json.dumps({'type': 'token', 'content': text_chunk})}\n\n"
                        full_response += text_chunk
                        await asyncio.sleep(0.01) 
            else:
                response = Settings.llm.stream_complete(prompt)
                for text_chunk in response:
                    if text_chunk.delta: 
                        yield f"data: {json.dumps({'type': 'token', 'content': text_chunk.delta})}\n\n"
                        full_response += text_chunk.delta
                        await asyncio.sleep(0.01) 
            
        except asyncio.CancelledError:
            pass
        except Exception as e:
            # We now safely catch Out-Of-Memory errors without crashing the server
            print(f"Ollama Engine Error: {e}")
            error_msg = "\n\n[System Notice: The local AI engine ran out of memory. Try asking a more specific question instead of a broad summary.]"
            yield f"data: {json.dumps({'type': 'token', 'content': error_msg})}\n\n"
            full_response += error_msg
        finally:
            try:
                final_text = full_response if full_response.strip() else "[Process Interrupted]"
                ai_msg = ChatMessage(session_id=session_id, role="assistant", content=final_text)
                db.add(ai_msg)
                db.commit()
            except Exception:
                pass 
                
            yield f"data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


