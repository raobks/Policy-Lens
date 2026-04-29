import os
from pathlib import Path

# Base directory (root of the project)
BASE_DIR = Path(__file__).resolve().parent.parent

# Data directory structure
DATA_DIR = BASE_DIR / "backend" / "data"
RAW_DOCS_DIR = DATA_DIR / "raw_docs"
PROCESSED_CHUNKS_DIR = DATA_DIR / "processed_chunks"
SUMMARIES_DIR = DATA_DIR / "summaries"

# Create folders if they don't exist
for folder in [RAW_DOCS_DIR, PROCESSED_CHUNKS_DIR, SUMMARIES_DIR]:
    folder.mkdir(parents=True, exist_ok=True)

# LLM Configuration
OLLAMA_BASE_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "llama3.1:8b"