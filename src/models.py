from sqlalchemy import Column, String, DateTime, ForeignKey, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import datetime
import uuid
import os

SQLALCHEMY_DATABASE_URL = "sqlite:///./storage/sql_memory.db"

# Ensure storage directory exists
os.makedirs('./storage', exist_ok=True)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, nullable=False, default="IT-Codebase")
    title = Column(String, default="New Chat")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("chat_sessions.id"))
    role = Column(String, nullable=False)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)