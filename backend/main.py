import time
from backend.modules.parser.document_parser import DocumentParser
from backend.utils.text_cleaner import clean_text
from backend.modules.segmentation.segmenter import DocumentSegmenter
from backend.modules.embeddings.embedding_models import EmbeddingEngine
from backend.modules.vector_store.Faiss_index import FaissIndex
from backend.modules.summarization.summarizer import PolicySummarizer
from backend.modules.retrieval.retriever import PolicyRetriever
from backend.modules.llm.llama_client import LlamaClient
from backend.modules.query_engine.query_handler import QueryHandler
from backend.modules.memory.hierarchy import answer_with_hierarchy
from backend.config import RAW_DOCS_DIR
from fastapi import FastAPI

app = FastAPI(title="Policy-AI API")


@app.get("/")
def root():
    return {"message": "Policy-AI backend is running"}


def run_pipeline(pdf_path, query):
    print("--- 🚀 Starting Policy-AI Pipeline ---")
    start_time = time.time()

    # 1. Parse & Clean
    parser = DocumentParser()
    raw_text = parser.extract_text(pdf_path)
    text = clean_text(raw_text)

    # 2. Segment
    segmenter = DocumentSegmenter()
    chunks = segmenter.split_text(text)

    # 3. Embed & Index
    embedder = EmbeddingEngine()
    vectors = embedder.get_embeddings(chunks)

    vector_store = FaissIndex(dimension=384)
    vector_store.add_vectors(vectors)

    # 4. Summarize
    summarizer = PolicySummarizer()
    summary = summarizer.generate_summary(text[:3000])

    # 5. Setup Retrieval, LLM & Query Engine
    retriever = PolicyRetriever(vector_store, chunks)
    llama = LlamaClient()
    handler = QueryHandler(embedder, retriever, llama)

    # 6. Process Query via memory-inspired hierarchy
    print(f"🧐 Querying: {query}")
    answer, sources = answer_with_hierarchy(query, summary, handler, llama)

    end_time = time.time()

    print("\n--- 📝 RESULT ---")
    print(answer)
    if sources:
        print("\n--- 📄 SOURCE CLAUSES ---")
        for i, src in enumerate(sources, start=1):
            text = src.get("text", "")
            idx = src.get("index", 0)
            print(f"\n[{i}] (chunk {idx}) {text[:500]}...")
    print(f"\n⏱️ Pipeline took: {round(end_time - start_time, 2)} seconds")


if __name__ == "__main__":
    # Test with one of your legal docs in the RAW_DOCS_DIR folder
    sample_file = RAW_DOCS_DIR / "your_sample_file.pdf"
    test_query = "Can the company terminate my account without notice?"
    run_pipeline(str(sample_file), test_query)