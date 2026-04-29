import os
from typing import Any, Dict, List, Optional
from pathlib import Path
from dotenv import load_dotenv

# Find .env no matter where the server is run from
env_path = Path(__file__).resolve().parent.parent / ".env"
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent.parent / "backend" / "api" / ".env"

load_dotenv(dotenv_path=env_path)

try:
    from pymongo import MongoClient
except Exception:
    MongoClient = None


class MongoClientWrapper:

    def __init__(self, db_name: str = "policylens"):
        self._client = None
        self._db = None

        uri = os.getenv("MONGODB_URL")          # ← matches your .env key exactly
        if uri and MongoClient is not None:
            try:
                self._client = MongoClient(uri)
                self._db = self._client[db_name]
                print(f"[MongoDB] Connected to Atlas — db: {db_name}")
            except Exception as e:
                print(f"[MongoDB] Connection failed: {e}")
                self._client = None
                self._db = None
        else:
            print("[MongoDB] MONGODB_URL not set — running without database.")

    @property
    def enabled(self) -> bool:
        return self._db is not None

    def store_document(
        self,
        filename: str,
        summary: str,
        chunks: List[str],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        if not self.enabled:
            return
        doc = {
            "filename": filename,
            "summary": summary,
            "chunks": chunks,
            "metadata": metadata or {},
        }
        try:
            self._db.documents.insert_one(doc)
        except Exception as e:
            print(f"[MongoDB] store_document failed: {e}")

    def log_query(
        self,
        filename: str,
        question: str,
        answer: str,
        sources: List[str],
    ) -> None:
        if not self.enabled:
            return
        entry = {
            "filename": filename,
            "question": question,
            "answer": answer,
            "sources": sources,
        }
        try:
            self._db.query_logs.insert_one(entry)
        except Exception as e:
            print(f"[MongoDB] log_query failed: {e}")