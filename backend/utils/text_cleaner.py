import re
from typing import List


def _remove_page_numbers(lines: List[str]) -> List[str]:
    cleaned = []
    for line in lines:
        stripped = line.strip()
        # Drop lines that are just numbers (common for page numbers)
        if stripped.isdigit():
            continue
        cleaned.append(line)
    return cleaned


def clean_text(text: str) -> str:
    """
    Normalize extracted document text:
    - remove obvious page numbers
    - collapse excessive whitespace
    - keep paragraph breaks reasonable
    """
    if not text:
        return ""

    # Split into lines and trim whitespace
    lines = [line.rstrip() for line in text.split("\n")]
    lines = _remove_page_numbers(lines)

    # Re-join lines
    joined = "\n".join(lines)

    # Replace 3+ newlines with exactly 2 (paragraph break)
    while "\n\n\n" in joined:
        joined = joined.replace("\n\n\n", "\n\n")

    # Collapse multiple spaces
    joined = re.sub(r"[ \t]+", " ", joined)

    return joined.strip()

