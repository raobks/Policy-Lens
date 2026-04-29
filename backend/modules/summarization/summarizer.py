from transformers import pipeline
from modules.llm.llama_client import LlamaClient


class PolicySummarizer:
    def __init__(self, model_name: str = "facebook/bart-large-cnn"):
        """
        Primary: Gemini (better quality)
        Fallback: Local BART model
        """

        # 🔥 Gemini client
        self.llm = LlamaClient()

        # 🔁 Local fallback
        try:
            self.summarizer = pipeline("summarization", model=model_name)
            self._use_summarization = True
        except Exception:
            self.summarizer = pipeline("text-generation", model=model_name)
            self._use_summarization = False

    def generate_summary(self, text: str, max_l: int = 150, min_l: int = 50) -> str:
        if not text or len(text) < 100:
            return text

        # 🔥 Trim input for safety
        input_text = text[:2000]

        # =========================
        # 🧠 GEMINI (PRIMARY)
        # =========================
        try:
            prompt = f"""
You are an expert legal analyst.

Analyze the following policy document and generate a structured summary.

Focus on:
- Key risks (highlight anything harmful or unfair)
- Important clauses (termination, liability, data usage, etc.)
- User obligations
- Anything unusual or hidden

Keep the summary:
- Clear
- Concise
- Easy to understand

Document:
{input_text}
"""

            result = self.llm.ask(prompt)

            if result and "failed" not in result.lower():
                return result.strip()

        except Exception as e:
            print("[Summarizer Gemini Fallback Triggered]:", e)

        # =========================
        # 🔁 LOCAL MODEL (FALLBACK)
        # =========================
        try:
            if self._use_summarization:
                result = self.summarizer(
                    input_text[:900],  # BART safe limit
                    max_length=max_l,
                    min_length=min_l,
                    do_sample=False,
                )
                return result[0]["summary_text"].strip()
        except Exception:
            pass

        # =========================
        # 🧾 FINAL FALLBACK
        # =========================
        sents = [
            s.strip()
            for s in input_text.replace("\n", " ").split(". ")
            if len(s.strip()) > 30
        ]

        return ". ".join(sents[:4]) + "." if sents else input_text[:500]