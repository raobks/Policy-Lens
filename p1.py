import os
import requests
from PyPDF2 import PdfReader


PDF_FOLDER = "./legal_docs"
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3.1:8b"  

def get_pdfs():
    """List all PDFs and their titles."""
    files = [f for f in os.listdir(PDF_FOLDER) if f.endswith('.pdf')]
    pdf_list = []
    for f in files:
        path = os.path.join(PDF_FOLDER, f)
        try:
            reader = PdfReader(path)
            title = reader.metadata.title if reader.metadata and reader.metadata.title else f
            pdf_list.append({"filename": f, "title": title, "path": path})
        except:
            pdf_list.append({"filename": f, "title": f, "path": path})
    return pdf_list


def ask_llama(prompt):
    """Sends a request to your local Llama API."""
    payload = {"model": MODEL_NAME, "prompt": prompt, "stream": False}
    try:
        response = requests.post(OLLAMA_URL, json=payload)
        return response.json().get("response", "No response.")
    except Exception as e:
        return f"Error: Ensure Ollama is running ({e})"


def main():
    if not os.path.exists(PDF_FOLDER):
        os.makedirs(PDF_FOLDER)
        print(
            f"Created '{PDF_FOLDER}' folder. Put your PDFs there and restart.")
        return

    pdfs = get_pdfs()
    if not pdfs:
        print("No PDFs found in folder.")
        return

   
    print("\n=== TIERED LEGAL VERIFIER PROTOTYPE ===")
    for i, pdf in enumerate(pdfs):
        print(f"[{i+1}] {pdf['title']}")

    choice = int(input("\nSelect a PDF number to summarize: ")) - 1
    selected = pdfs[choice]


    print(f"\nReading {selected['filename']}...")
    reader = PdfReader(selected['path'])
    
    content = ""
    for page in reader.pages[:3]:
        content += page.extract_text()

    print("Generating Verified Summary (Local LLM)...")
    prompt = f"""
    You are a Legal Verification Agent. 
    Analyze this legal text and provide a 3-sentence summary:
    1. The core subject of the document.
    2. The primary legal argument or statute mentioned.
    3. The current status or conclusion stated.

    TEXT:
    {content[:5000]} 
    """

    summary = ask_llama(prompt)
    print("\n" + "="*30)
    print(f"DOCUMENT: {selected['title']}")
    print("-" * 30)
    print(summary)
    print("="*30)


if __name__ == "__main__":
    main()
