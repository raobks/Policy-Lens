from typing import Tuple, List


def should_answer_from_summary(question: str, summary: str) -> bool:
    """
    Heuristic: if the question is very general and the summary is non-empty,
    we can try to answer from the summary alone.
    """
    if not summary:
        return False

    # Very simple heuristic for the prototype: short questions -> summary
    return len(question.split()) <= 8


def build_llm_prompt_from_summary(question: str, summary: str) -> str:
    return f"""
You are a legal assistant analyzing a policy document.
Use ONLY the following summary to answer the user's question.
If the answer is not clearly in the summary, say you don't know.

SUMMARY:
{summary}

QUESTION: {question}

ANSWER:
"""


def answer_with_hierarchy(
    question: str,
    summary: str,
    query_handler,
    llama_client,
) -> Tuple[str, List[str]]:
    """
    Memory-inspired query flow:
    1) Try to answer from the high-level summary for very general questions.
    2) Otherwise, fall back to full vector retrieval via QueryHandler.
    """
    if should_answer_from_summary(question, summary):
        prompt = build_llm_prompt_from_summary(question, summary)
        answer = llama_client.ask(prompt)
        # No specific clause sources when answering from summary only
        return answer, []

    # Fallback: normal RAG pipeline via QueryHandler (embeddings + FAISS)
    return query_handler.handle_query(question)

