# Enterprise RAG Platform

## Overview
A production-grade Retrieval-Augmented Generation (RAG) platform designed to securely ingest, index, and query enterprise datasets (Codebases, PDFs, Docs) entirely on-premises. This architecture ensures absolute data privacy by executing all embedding and LLM inference locally, eliminating the need for external API transmission.

## Core Architecture
* **Frontend:** React.js (Vite) with Tailwind CSS v4, featuring dynamic markdown parsing, Server-Sent Events (SSE) for streaming tokens, and isolated chat session management.
* **Backend:** FastAPI (Python) orchestrating the LLM pipeline, asynchronous endpoints, and local database connections.
* **Inference Engine:** Ollama (`qwen3.5:4b` for deep reasoning/coding logic, `nomic-embed-text` for vector embeddings).
* **Databases:** 
  * **LanceDB:** Zero-latency, SSD-optimized vector storage for semantic retrieval.
  * **SQLite:** Relational database for persistent chat session memory and metadata mapping.
* **Event-Driven Ingestion:** A background Watchdog daemon that monitors the local file system to instantly index new proprietary data in real-time.

## Project Structure
\`\`\`text
ENTERPRISE-RAG-PLATFORM/
├── enterprise-rag-ui/      # React/Vite Frontend
├── src/                    # Python Backend Logic
│   ├── ingestion.py        # Document parsing & LanceDB indexing
│   ├── models.py           # SQLite SQLAlchemy schemas
│   ├── monitor.py          # Real-time folder watchdog
│   ├── query.py            # CLI-based testing script
│   └── server.py           # FastAPI streaming server & Hybrid Router
├── private_data/           # Secure document drop-zone (Git-ignored)
└── storage/                # LanceDB and SQLite databases (Git-ignored)
\`\`\`

## Quick Start
**1. Start the Local AI Engine**
Ensure Ollama is running, then pull the required models:
\`\`\`bash
ollama pull nomic-embed-text
ollama pull qwen3.5:4b
\`\`\`

**2. Boot the Backend**
\`\`\`bash
# Activate virtual environment
.\.venv\Scripts\Activate.ps1
# Install dependencies
pip install -r requirements.txt
# Launch the API server
uvicorn src.server:app --reload --port 8000
\`\`\`

**3. Launch the Frontend UI**
Open a separate terminal:
\`\`\`bash
cd enterprise-rag-ui
npm install
npm run dev
\`\`\`