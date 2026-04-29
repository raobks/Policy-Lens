import os
import time
from typing import Optional
from google import genai
from dotenv import load_dotenv

load_dotenv()


class LlamaClient:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")

        if not self.api_key:
            print("[LLM] ❌ Missing API key")
            self.client = None
            return

        try:
            self.client = genai.Client(api_key=self.api_key)
            self.model = "models/gemini-2.5-flash"
            print("[LLM] ✅ Gemini (new SDK) ready")

        except Exception as e:
            print("[LLM] ❌ Failed to initialize Gemini:", e)
            self.client = None

    def ask(self, prompt: str, retries: int = 2) -> str:
        """
        Send prompt to Gemini and return response.
        Includes retry + safe parsing.
        """

        if not self.client:
            return "LLM not initialized"

        for attempt in range(retries):
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=[
                        {
                            "role": "user",
                            "parts": [{"text": prompt}]
                        }
                    ]
                )

                # 🔥 Safe extraction (prevents crashes)
                if (
                    response
                    and response.candidates
                    and len(response.candidates) > 0
                    and response.candidates[0].content.parts
                ):
                    return response.candidates[0].content.parts[0].text.strip()

                return "No response generated"

            except Exception as e:
                print(f"[Gemini ERROR][Attempt {attempt+1}]:", e)

                if attempt < retries - 1:
                    time.sleep(1)  # retry delay
                else:
                    return "Gemini failed"

    def health_check(self) -> bool:
        """
        Quick check to verify LLM is working.
        """

        try:
            test = self.ask("Say OK")
            return "ok" in test.lower()

        except:
            return False