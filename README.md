# AI Summerizer

A policy document summarization and query assistant built with FastAPI, LangChain, FAISS embeddings, and a Streamlit/React frontend.

## Overview

This repository contains a prototype AI pipeline for:
- Parsing PDF-based policy or legal documents
- Cleaning and segmenting text
- Generating embeddings and indexing with FAISS
- Summarizing documents and extracting key points
- Answering user questions over the document content

## Repository Structure

- `backend/` - Python backend and API logic
  - `backend/api/server.py` - FastAPI application for upload, summarization, and query
  - `backend/main.py` - example pipeline runner for local testing
  - `backend/modules/` - document parser, embeddings, retrieval, summarization, and LLM components
  - `backend/config.py` - configuration values such as raw documents directory
- `frontend/` - Streamlit application for uploading PDFs and chatting with the model
  - `frontend/streamlit_app.py` - Streamlit UI connected to the backend API
- `frontend-react/` - React + Vite frontend scaffold
- `requirements.txt` - Python dependency list for backend and Streamlit frontend
- `legal_docs/` - placeholder folder for legal documents or sample PDFs

## Prerequisites

- Python 3.11+ (recommended)
- `pip`
- `node` and `npm`/`pnpm`/`yarn` if using the React frontend

## Setup

1. Create and activate a virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install Python dependencies:

```powershell
pip install --upgrade pip
pip install -r requirements.txt
```

## Running the Backend

The API server is defined in `backend/api/server.py`. Run it with Uvicorn:

```powershell
uvicorn backend.api.server:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`.

### Environment Variables

`backend/api/server.py` loads values from `backend/api/.env` via `python-dotenv`.
If you use OAuth, add your credentials there:

- `CLIENT_ID`
- `CLIENT_SECRET`

If you do not use OAuth, the backend will still start, but any auth routes will depend on your configuration.

## Running the Streamlit Frontend

From the repository root:

```powershell
cd frontend
streamlit run streamlit_app.py
```

By default, the Streamlit app will call `http://localhost:8000` for backend API requests.
Set `POLICY_AI_API_BASE` to a different backend address if needed.

## Running the React Frontend

The React app lives in `frontend-react/`.

```powershell
cd frontend-react
npm install
npm run dev
```

The React app is configured for Vite and can be served locally on the default Vite port.

## Notes

- Upload PDF files through the Streamlit UI and click `Process Document` to build embeddings.
- Once a document is processed, use the chat interface to ask questions about the content.
- The backend uses FAISS for vector search and a custom LLM client for query responses.

## Troubleshooting

- If PDF upload fails, verify the uploaded file is a valid PDF.
- If the frontend cannot reach the backend, confirm `POLICY_AI_API_BASE` matches the running API URL.
- If model or embedding download performance is slow, allow extra time on first run.

## License

This project does not include a license file. Add one if you intend to share or distribute the code.
