import pdfplumber
import os


class DocumentParser:
    def __init__(self):
        """Initializes the DocumentParser."""
        pass

    def extract_text(self, file_path: str) -> str:
        """
        Extracts raw text from a PDF document while preserving paragraph structure.
        Text cleaning is handled by the dedicated text_cleaner module.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found at: {file_path}")

        extracted_pages = []

        try:
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text(layout=False)
                    if page_text:
                        extracted_pages.append(page_text)

            # Join pages with double newlines to separate them clearly
            full_text = "\n\n".join(extracted_pages)
            return full_text

        except Exception as e:
            print(f"Error parsing PDF {file_path}: {e}")
            return ""


# Quick Test (Optional)
if __name__ == "__main__":
    parser = DocumentParser()
    # sample_text = parser.extract_text("path/to/your/document.pdf")
    # print(sample_text[:500])