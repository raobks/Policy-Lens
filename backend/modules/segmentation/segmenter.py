from typing import List

try:
    from langchain.text_splitter import RecursiveCharacterTextSplitter  # type: ignore
    TEXT_SPLITTER_SOURCE = "langchain"
except Exception as _e_langchain:
    try:
        from langchain_text_splitters import RecursiveCharacterTextSplitter  # type: ignore
        TEXT_SPLITTER_SOURCE = "langchain_text_splitters"
    except Exception as _e_splitters:
        TEXT_SPLITTER_SOURCE = "fallback"

        # region agent log
        try:
            import json as _json
            import time as _time

            log_entry = {
                "sessionId": "4be1db",
                "runId": "pre-fix",
                "hypothesisId": "H1",
                "location": "backend/modules/segmentation/segmenter.py:1",
                "message": "Failed to import LangChain text splitter; using fallback",
                "data": {
                    "langchain_error": str(_e_langchain),
                    "splitters_error": str(_e_splitters),
                },
                "timestamp": int(_time.time() * 1000),
            }
            with open("debug-4be1db.log", "a", encoding="utf-8") as _f:
                _f.write(_json.dumps(log_entry) + "\n")
        except Exception:
            pass
        # endregion agent log

        class RecursiveCharacterTextSplitter:  # type: ignore
            def __init__(
                self,
                chunk_size: int = 1000,
                chunk_overlap: int = 150,
                length_function=len,
                separators=None,
            ):
                self.chunk_size = chunk_size
                self.chunk_overlap = chunk_overlap
                self.length_function = length_function
                self.separators = separators or ["\n\n", "\n", ". ", " ", ""]

            def split_text(self, text: str):
                if not text:
                    return []
                chunks = []
                start = 0
                length = len(text)
                while start < length:
                    end = min(start + self.chunk_size, length)
                    chunks.append(text[start:end])
                    start = end - self.chunk_overlap
                    if start <= 0:
                        start = end
                return chunks


class DocumentSegmenter:
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 150):
        """
        Initializes the segmenter with specific chunking parameters.

        Args:
            chunk_size (int): Maximum number of characters per chunk.
            chunk_overlap (int): Number of characters to overlap between chunks
                                 to maintain context.
        """
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def split_text(self, text: str) -> List[str]:
        """
        Splits a single string of text into a list of smaller strings (chunks).

        Args:
            text (str): The full text extracted from the document.

        Returns:
            List[str]: A list of text chunks.
        """
        if not text:
            return []

        # We use split_text to get a list of strings directly
        chunks = self.splitter.split_text(text)
        return chunks


# Quick Test (Optional)
if __name__ == "__main__":
    segmenter = DocumentSegmenter()
    # sample_text = "Clause 1. Data Sharing... [long text] ... Clause 2. Termination."
    # chunks = segmenter.split_text(sample_text)
    # print(f"Created {len(chunks)} chunks.")