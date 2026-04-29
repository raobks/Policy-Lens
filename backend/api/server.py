import os
from pathlib import Path
from dotenv import load_dotenv
from authlib.integrations.starlette_client import OAuth
from fastapi.responses import RedirectResponse
from fastapi import Request
from starlette.middleware.sessions import SessionMiddleware

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)



from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import shutil
import numpy as np

from backend.config import RAW_DOCS_DIR
from backend.modules.parser.document_parser import DocumentParser
from backend.utils.text_cleaner import clean_text
from backend.modules.segmentation.segmenter import DocumentSegmenter
from backend.modules.embeddings.embedding_models import EmbeddingEngine
from backend.modules.vector_store.Faiss_index import FaissIndex
from backend.modules.retrieval.retriever import PolicyRetriever
from backend.modules.llm.llama_client import LlamaClient
from backend.modules.risk.red_flag_detector import detect_red_flags
from backend.database.mongo_client import MongoClientWrapper


app = FastAPI(title="Policy-AI API")

app.add_middleware(
    SessionMiddleware,
    secret_key="super-secret-key"
)

oauth = OAuth()

oauth.register(
    name='google',
    client_id=os.getenv("CLIENT_ID"),
    client_secret=os.getenv("CLIENT_SECRET"),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)

# ── CORS ─────────────────────────────────────────────────────────────
# Add your Vercel frontend URL here once deployed
# e.g. "https://policylens.vercel.app"
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:8501",
    "http://127.0.0.1:8501",
    # ↓ ADD YOUR VERCEL URL HERE when you deploy frontend
    # "https://YOUR-APP-NAME.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mongo_client = MongoClientWrapper()
llama_client = LlamaClient()

_sessions: dict = {}


class ChatMessage(BaseModel):
    role: str
    content: str

class QueryRequest(BaseModel):
    question: str
    filename: str
    history: Optional[List[ChatMessage]] = []

class SummarizeRequest(BaseModel):
    filename: str
    depth: str = "Standard"


DEPTH_CONFIG = {
    "Brief": {
        "max_chars": 2000, "max_key_points": 3, "max_summary_items": 3,
        "instruction": "Write a concise 2-3 sentence executive summary. Mention only the single most critical purpose and outcome. No bullet points — pure prose only.",
    },
    "Standard": {
        "max_chars": 5000, "max_key_points": 7, "max_summary_items": 7,
        "instruction": "Write a clear 5-7 sentence summary covering: the main purpose, primary provisions, key stakeholders, and major outcomes. Use plain flowing prose.",
    },
    "Detailed": {
        "max_chars": 12000, "max_key_points": 15, "max_summary_items": 15,
        "instruction": "Write a thorough multi-paragraph summary covering: (1) purpose and background, (2) all major provisions and clauses, (3) stakeholders and affected parties, (4) specific figures, dates, and timelines, (5) implementation requirements, (6) broader implications. Be comprehensive.",
    },
}


def _build_depth_summary(text: str, depth: str) -> str:
    cfg = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["Standard"])
    prompt = (
        f"You are a senior government policy analyst.\n\n"
        f"INSTRUCTION: {cfg['instruction']}\n\n"
        f"DOCUMENT TEXT:\n{text[:cfg['max_chars']]}\n\nSUMMARY:"
    )
    return llama_client.ask(prompt).strip()


@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    depth: str = Form("Standard"),
):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = RAW_DOCS_DIR / file.filename
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 1. Parse
    parser = DocumentParser()
    raw_text = parser.extract_text(str(file_path))
    if not raw_text:
        raise HTTPException(status_code=400, detail="Failed to extract text from PDF.")
    text = clean_text(raw_text)

    # 2. Segment
    segmenter = DocumentSegmenter()
    chunks = segmenter.split_text(text)

    # 3. Embed + FAISS
    embedder = EmbeddingEngine()
    vectors = embedder.get_embeddings(chunks)
    vector_store = FaissIndex(dimension=384)
    vector_store.add_vectors(vectors)
    retriever = PolicyRetriever(vector_store, chunks)

    _sessions[file.filename] = {
        "embedder": embedder, "retriever": retriever,
        "chunks": chunks, "text": text,
    }

    # 4. Red flag detection
    red_flags = detect_red_flags(chunks, llama_client, max_flags=12)

    # 5. Depth-calibrated summary
    cfg = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["Standard"])
    summary = _build_depth_summary(text, depth)
    summary_sentences = [s.strip() for s in summary.split(".") if len(s.strip()) > 20]

    # 6. Map summary → source
    summary_map = []
    for sentence in summary_sentences[: cfg["max_summary_items"]]:
        emb = embedder.get_embeddings([sentence])[0]
        results = retriever.get_relevant_context(emb, top_k=1)
        if results:
            summary_map.append({
                "summary_sentence": sentence,
                "chunk_index": results[0]["index"],
                "source_paragraph": results[0]["text"],
            })

    # 7. Key points
    key_points = []
    if len(vectors) > 0:
        vecs = np.array(vectors)
        centroid = vecs.mean(axis=0)
        norms = np.linalg.norm(vecs, axis=1) * (np.linalg.norm(centroid) + 1e-8)
        sims = (vecs @ centroid) / norms
        top_k = min(cfg["max_key_points"], len(chunks))
        top_indices = np.argsort(sims)[-top_k:][::-1]

        for idx in top_indices:
            idx_int = int(idx)
            clause = chunks[idx_int]
            preview = clause.replace("\n", " ").strip()
            if len(preview) > 220:
                preview = preview[:217] + "..."

            summary_sentence = ""
            if summary_map:
                bullet_emb = embedder.get_embeddings([preview[:500]])[0]
                best_idx, best_sim = 0, -1.0
                for i, sm in enumerate(summary_map):
                    sent_emb = embedder.get_embeddings([sm["summary_sentence"]])[0]
                    sim = np.dot(bullet_emb, sent_emb) / (
                        np.linalg.norm(bullet_emb) * np.linalg.norm(sent_emb) + 1e-8
                    )
                    if sim > best_sim:
                        best_sim = sim
                        best_idx = i
                summary_sentence = summary_map[best_idx]["summary_sentence"]

            key_points.append({
                "chunk_index": idx_int,
                "preview": preview,
                "source_paragraph": clause,
                "summary_sentence": summary_sentence,
            })

    # 8. Store in MongoDB
    mongo_client.store_document(
        filename=file.filename, summary=summary, chunks=chunks,
        metadata={"path": str(file_path), "depth": depth, "red_flag_count": len(red_flags)},
    )

    return {
        "message": f"Successfully uploaded {file.filename}",
        "path": str(file_path),
        "summary": summary,
        "summary_map": summary_map,
        "key_points": key_points,
        "red_flags": red_flags,
        "depth": depth,
    }


@app.post("/query")
async def query_document(req: QueryRequest):
    session = _sessions.get(req.filename)
    if not session:
        raise HTTPException(status_code=404, detail=f"Document '{req.filename}' not in session. Re-upload first.")

    embedder  = session["embedder"]
    retriever = session["retriever"]
    query_vec = embedder.get_embeddings([req.question])[0]
    sources   = retriever.get_relevant_context(query_vec, top_k=3)
    context_text = "\n\n---\n\n".join(src["text"] for src in sources)

    history_str = ""
    if req.history:
        history_str = "\nCONVERSATION HISTORY:\n" + "\n".join(
            f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}"
            for m in req.history[-6:]
        ) + "\n"

    prompt = (
        f"You are PolicyBot, an expert legal assistant.\n"
        f"Use ONLY the retrieved clauses to answer. If not found, say so.\n"
        f"{history_str}\nRETRIEVED CLAUSES:\n{context_text}\n\n"
        f"USER QUESTION: {req.question}\n\nANSWER:"
    )
    answer = llama_client.ask(prompt)

    # Log query to MongoDB
    mongo_client.log_query(
        filename=req.filename,
        question=req.question,
        answer=answer.strip(),
        sources=[src["text"][:200] for src in sources],
    )

    return {
        "answer": answer.strip(),
        "sources": [{"index": src["index"], "text": src["text"]} for src in sources],
    }


@app.post("/summarize")
async def summarize_depth(req: SummarizeRequest):
    session = _sessions.get(req.filename)
    if not session:
        raise HTTPException(status_code=404, detail=f"Document '{req.filename}' not in session.")

    text      = session["text"]
    embedder  = session["embedder"]
    retriever = session["retriever"]
    cfg       = DEPTH_CONFIG.get(req.depth, DEPTH_CONFIG["Standard"])
    summary   = _build_depth_summary(text, req.depth)
    summary_sentences = [s.strip() for s in summary.split(".") if len(s.strip()) > 20]

    summary_map = []
    for sentence in summary_sentences[: cfg["max_summary_items"]]:
        emb = embedder.get_embeddings([sentence])[0]
        results = retriever.get_relevant_context(emb, top_k=1)
        if results:
            summary_map.append({
                "summary_sentence": sentence,
                "chunk_index": results[0]["index"],
                "source_paragraph": results[0]["text"],
            })

    return {"summary": summary, "summary_map": summary_map, "depth": req.depth}


@app.get("/health")
def health_check():
    return {
        "status": "online",
        "sessions": list(_sessions.keys()),
        "mongodb": mongo_client.enabled,
        "llm_model": llama_client.model,
    }

@app.get("/auth/google")
async def login(request: Request):
    redirect_uri = "http://127.0.0.1:8000/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)


@app.get("/auth/google/callback")
async def auth_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    user = token.get("userinfo")

    email = user.get("email")
    name = user.get("name")

    # Save in Mongo (optional but recommended)
    try:
        mongo_client.db.users.update_one(
            {"email": email},
            {"$set": {"email": email, "name": name}},
            upsert=True
        )
    except:
        pass

    return RedirectResponse(
        url=f"http://localhost:5173?email={email}&name={name}"
    )
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)