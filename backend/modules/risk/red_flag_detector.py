"""
red_flag_detector.py
────────────────────────────────────────────────────────────────────────
Place this file at:  backend/modules/risk/red_flag_detector.py

Two-stage detection per chunk:
  Stage 1 — Fast regex/keyword scan (zero LLM cost, runs on every chunk)
  Stage 2 — Llama confirmation + plain-English explanation (only on hits)

RedFlag schema returned to the API:
  {
    "chunk_index":   int,
    "severity":      "critical" | "high" | "medium",
    "category":      str,          # e.g. "Auto-Renewal Trap"
    "trigger":       str,          # matched keyword/phrase
    "excerpt":       str,          # ≤220-char excerpt from the chunk
    "explanation":   str,          # Llama plain-English explanation
    "source_paragraph": str        # full original chunk
  }
────────────────────────────────────────────────────────────────────────
"""

import re
from dataclasses import dataclass, field, asdict
from typing import List, Optional

# ── Pattern library ─────────────────────────────────────────────────────
# Each entry: (category, severity, [regex patterns])
# Patterns are case-insensitive and match anywhere in the chunk.

FLAG_PATTERNS = [
    # ── CRITICAL ────────────────────────────────────────────────────────
    (
        "Unlimited Liability",
        "critical",
        [
            r"unlimited\s+liabilit",
            r"personally\s+liable\s+for\s+all",
            r"joint\s+and\s+several\s+liabilit",
            r"liable\s+for\s+any\s+and\s+all\s+(damages|losses|claims)",
        ],
    ),
    (
        "Irrevocable Rights Transfer",
        "critical",
        [
            r"irrevocabl[ey]\s+(assign|transfer|grant|license)",
            r"perpetual[,\s]+irrevocable",
            r"waive[sd]?\s+all\s+(moral\s+)?rights",
            r"assign[s]?\s+all\s+(intellectual\s+property|ip|rights)\s+to",
        ],
    ),
    (
        "Unilateral Contract Modification",
        "critical",
        [
            r"(may|can|reserves?\s+the\s+right)\s+to\s+(amend|modify|change|update)\s+(this\s+)?(agreement|contract|terms)\s+(at\s+any\s+time|without\s+notice)",
            r"without\s+prior\s+notice\s+(to\s+you|to\s+the\s+user)",
            r"sole\s+discretion\s+to\s+(amend|change|modify)",
        ],
    ),
    (
        "Data Sale / Third-Party Sharing",
        "critical",
        [
            r"sell[s]?\s+(your|user|personal)\s+(data|information)",
            r"share[sd]?\s+(your|user|personal)\s+(data|information)\s+with\s+third.part",
            r"transfer[s]?\s+(your|personal)\s+data\s+to\s+(partner|affiliate|advertiser)",
            r"disclose[sd]?\s+personal\s+information\s+to\s+third.part",
        ],
    ),
    (
        "Mandatory Arbitration / No Class Action",
        "critical",
        [
            r"waive[sd]?\s+(your\s+)?right\s+to\s+(a\s+)?jury\s+trial",
            r"class\s+action\s+waiver",
            r"waive[sd]?\s+(the\s+)?right\s+to\s+(participate\s+in\s+)?class\s+action",
            r"binding\s+arbitration",
            r"disputes?\s+shall\s+be\s+resolved\s+(solely\s+)?by\s+arbitration",
        ],
    ),

    # ── HIGH ────────────────────────────────────────────────────────────
    (
        "Auto-Renewal Trap",
        "high",
        [
            r"automatically\s+renew",
            r"auto.?renewal",
            r"renew[s]?\s+automatically",
            r"unless\s+(you\s+)?(cancel|opt.?out)\s+(at\s+least\s+\d+\s+days?\s+)?before",
        ],
    ),
    (
        "Hidden Fees / Price Change",
        "high",
        [
            r"(may|can|reserves?\s+the\s+right)\s+to\s+(increase|change|modify)\s+(the\s+)?(price|fee|rate|charge)",
            r"additional\s+fees?\s+may\s+apply",
            r"subject\s+to\s+(price|fee)\s+(change|increase|adjustment)",
            r"without\s+refund",
        ],
    ),
    (
        "One-Sided Termination",
        "high",
        [
            r"terminate\s+(this\s+agreement|your\s+account|access)\s+(at\s+any\s+time|immediately|without\s+(cause|notice|reason))",
            r"suspend\s+(your\s+account|access|service)\s+at\s+(our\s+)?sole\s+discretion",
            r"without\s+liability\s+to\s+you",
        ],
    ),
    (
        "Broad Indemnification",
        "high",
        [
            r"indemnif(y|ies|ied)\s+.{0,60}\s+(from|against)\s+(any\s+and\s+all|all)\s+(claims|damages|losses)",
            r"hold\s+(us|the\s+company|licensor)\s+harmless",
            r"defend\s+(and\s+)?indemnif",
        ],
    ),
    (
        "Sweeping Warranty Disclaimer",
        "high",
        [
            r"(provided\s+)?[\"']?as.is[\"']?\s+(and\s+)?[\"']?as.available[\"']?",
            r"no\s+warrant(y|ies)\s+(of\s+any\s+kind|express\s+or\s+implied)",
            r"disclaim[s]?\s+all\s+warrant",
            r"without\s+any\s+warranty",
        ],
    ),
    (
        "Non-Compete / Restrictive Covenant",
        "high",
        [
            r"non.compete",
            r"shall\s+not\s+(directly\s+or\s+indirectly\s+)?(work\s+for|engage\s+with|be\s+employed\s+by)\s+(any\s+)?competitor",
            r"restrictive\s+covenant",
            r"non.solicit(ation)?",
        ],
    ),

    # ── MEDIUM ──────────────────────────────────────────────────────────
    (
        "Vague Force Majeure",
        "medium",
        [
            r"force\s+majeure",
            r"(beyond\s+our\s+reasonable\s+control|act\s+of\s+god)",
            r"circumstances\s+beyond\s+(our|its)\s+control",
        ],
    ),
    (
        "Governing Law / Jurisdiction Clause",
        "medium",
        [
            r"governed\s+by\s+(the\s+laws?\s+of|and\s+construed)",
            r"exclusive\s+jurisdiction\s+of\s+the\s+courts?\s+of",
            r"submit\s+to\s+the\s+(personal\s+)?jurisdiction",
        ],
    ),
    (
        "Confidentiality Trap",
        "medium",
        [
            r"shall\s+keep\s+(confidential|secret)",
            r"not\s+disclose\s+(any|the)\s+confidential\s+information",
            r"confidentiality\s+obligation[s]?\s+(survive[s]?|shall\s+survive)",
            r"perpetual\s+confidentiality",
        ],
    ),
    (
        "Surveillance / Monitoring",
        "medium",
        [
            r"monitor\s+(your\s+)?(activity|usage|communications|content)",
            r"record[s]?\s+(your\s+)?(calls?|communications?|sessions?)",
            r"(track|log)\s+(your\s+)?(location|device|browsing|activity)",
            r"access\s+your\s+(device|camera|microphone|contacts|location)",
        ],
    ),
    (
        "Limitation of Liability Cap",
        "medium",
        [
            r"liabilit(y|ies)\s+(shall\s+not|will\s+not)\s+exceed",
            r"maximum\s+liabilit(y|ies)\s+(is|shall\s+be|will\s+be)\s+limited",
            r"in\s+no\s+event\s+shall\s+.{0,40}\s+be\s+liable",
            r"aggregate\s+liabilit(y|ies)\s+(is|shall\s+be)\s+limited\s+to",
        ],
    ),
]

# Pre-compile all regexes
_COMPILED = [
    (cat, sev, [re.compile(p, re.IGNORECASE | re.DOTALL) for p in pats])
    for cat, sev, pats in FLAG_PATTERNS
]


@dataclass
class RedFlag:
    chunk_index: int
    severity: str          # "critical" | "high" | "medium"
    category: str
    trigger: str           # the matched keyword/phrase
    excerpt: str           # ≤220 char excerpt
    explanation: str       # Llama plain-English explanation
    source_paragraph: str  # full chunk text

    def to_dict(self):
        return asdict(self)


def _extract_excerpt(chunk: str, match_start: int, match_end: int, window: int = 110) -> str:
    """Return a ≤220-char window centred on the match."""
    start = max(0, match_start - window)
    end = min(len(chunk), match_end + window)
    excerpt = chunk[start:end].replace("\n", " ").strip()
    if start > 0:
        excerpt = "…" + excerpt
    if end < len(chunk):
        excerpt = excerpt + "…"
    return excerpt[:220]


def scan_chunk(chunk: str, chunk_index: int) -> List[dict]:
    """
    Stage 1: Run all regex patterns against a single chunk.
    Returns a list of raw hits (no LLM yet).
    """
    hits = []
    seen_categories = set()  # one hit per category per chunk

    for category, severity, compiled_pats in _COMPILED:
        if category in seen_categories:
            continue
        for pat in compiled_pats:
            m = pat.search(chunk)
            if m:
                excerpt = _extract_excerpt(chunk, m.start(), m.end())
                hits.append({
                    "chunk_index": chunk_index,
                    "severity": severity,
                    "category": category,
                    "trigger": m.group(0)[:80],
                    "excerpt": excerpt,
                    "source_paragraph": chunk,
                })
                seen_categories.add(category)
                break

    return hits


def explain_flag(hit: dict, llama_client) -> RedFlag:
    """
    Stage 2: Ask Llama to explain the flag in plain English (1-2 sentences).
    Falls back to a generic explanation if Llama fails.
    """
    prompt = (
        f"You are a legal risk analyst reviewing a document clause.\n\n"
        f"CATEGORY: {hit['category']}\n"
        f"FLAGGED EXCERPT:\n\"{hit['excerpt']}\"\n\n"
        f"In 1-2 plain-English sentences, explain specifically why this clause is risky "
        f"for the person signing or agreeing to it. Be direct and specific. "
        f"Do not use legal jargon. Do not repeat the category name."
    )
    try:
        explanation = llama_client.ask(prompt).strip()
        # Truncate if Llama gets verbose
        sentences = [s.strip() for s in explanation.split(".") if len(s.strip()) > 10]
        explanation = ". ".join(sentences[:2]) + ("." if sentences else "")
    except Exception:
        explanation = (
            f"This clause contains language typical of '{hit['category']}' "
            f"which may disadvantage you. Review carefully before signing."
        )

    return RedFlag(
        chunk_index=hit["chunk_index"],
        severity=hit["severity"],
        category=hit["category"],
        trigger=hit["trigger"],
        excerpt=hit["excerpt"],
        explanation=explanation,
        source_paragraph=hit["source_paragraph"],
    )


def detect_red_flags(chunks: List[str], llama_client, max_flags: int = 12) -> List[dict]:
    """
    Full pipeline:
      1. Scan all chunks with regex (fast)
      2. Send each hit to Llama for a plain-English explanation
      3. Deduplicate by category (keep highest-severity per category)
      4. Sort: critical → high → medium
      5. Return as list of dicts, capped at max_flags

    Args:
        chunks:       list of text chunks from the segmenter
        llama_client: instance of LlamaClient
        max_flags:    maximum number of flags to return (default 12)
    """
    # Stage 1 — regex scan all chunks
    all_hits: List[dict] = []
    for i, chunk in enumerate(chunks):
        hits = scan_chunk(chunk, i)
        all_hits.extend(hits)

    if not all_hits:
        return []

    # Deduplicate — keep one hit per category, prefer highest severity chunk
    severity_order = {"critical": 0, "high": 1, "medium": 2}
    best_per_category: dict = {}
    for hit in all_hits:
        cat = hit["category"]
        if cat not in best_per_category:
            best_per_category[cat] = hit
        else:
            if severity_order[hit["severity"]] < severity_order[best_per_category[cat]["severity"]]:
                best_per_category[cat] = hit

    deduped = list(best_per_category.values())

    # Sort by severity
    deduped.sort(key=lambda h: severity_order[h["severity"]])

    # Cap
    deduped = deduped[:max_flags]

    # Stage 2 — Llama explanation for each hit
    flags = [explain_flag(hit, llama_client) for hit in deduped]

    return [f.to_dict() for f in flags]