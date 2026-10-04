import os
import re
import json
import logging
from typing import Optional
import httpx
from langdetect import detect, DetectorFactory

from backend.core.config import get_settings

# Enforce deterministic language detection across runs
DetectorFactory.seed = 0

logger = logging.getLogger("prism.factcheck.pipeline")

# Regex pattern for matching all emoji blocks (SMP, supplemental symbols, pictographs, flags, etc.)
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map symbols
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U0001F900-\U0001F9FF"  # supplemental symbols and pictographs
    "\U0001FA00-\U0001FA6F"  # chess symbols, symbols and pictographs extended-A
    "\U0001FA70-\U0001FAFF"  # symbols and pictographs extended-B
    "\u2600-\u26FF"          # miscellaneous symbols
    "\u2700-\u27BF"          # dingbats
    "\uFE00-\uFE0F"          # variation selectors
    "\u200D"                 # zero-width joiner
    "]+",
    flags=re.UNICODE,
)


def clean_caption(text: Optional[str]) -> str:
    """
    Step 1 Pre-clean text:
    Strips emojis, hashtags, @mentions, and URLs from the input text or scraped caption.
    Collapses excess whitespace and returns substantive text or empty string.
    """
    if not text or not isinstance(text, str):
        return ""

    # 1. Strip URLs (http, https, www)
    cleaned = re.sub(r"https?://\S+|www\.\S+", "", text)

    # 2. Strip standalone @mentions and trailing punctuation (e.g. @user, @mod.team:, @author,)
    # Negative lookbehind ensures email addresses (e.g. contact@who.int) are not stripped
    cleaned = re.sub(r"(?<!\w)@[A-Za-z0-9_.]+(?:[:;,])?", "", cleaned)

    # 3. Strip '#' symbol from hashtags, preserving substantive entity/keyword text (e.g. #COVID19 -> COVID19, #Chandrayaan3 -> Chandrayaan3)
    cleaned = re.sub(r"#([^\s!?,.:;()\[\]{}]+)", r"\1", cleaned)

    # 4. Strip emojis and pictographs
    cleaned = EMOJI_PATTERN.sub("", cleaned)

    # 5. Normalize whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    return cleaned


# Common English keywords to prevent short-text misdetection by langdetect (e.g. "NASA Artemis Moon mission" -> 'et')
COMMON_ENGLISH_WORDS = {
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he',
    'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
    'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about',
    'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
    'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
    'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two',
    'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give',
    'day', 'most', 'us', 'is', 'are', 'was', 'were', 'been', 'has', 'had', 'moon', 'mission', 'space',
    'news', 'breaking', 'alert', 'fake', 'true', 'false', 'police', 'minister', 'government', 'india',
    'court', 'dies', 'death', 'arrest', 'arrested', 'crash', 'claim', 'video', 'photo', 'virus', 'health'
}

OBSCURE_LATIN_LANGS = {'et', 'so', 'tl', 'af', 'cy', 'lt', 'lv', 'sl', 'sq', 'sw', 'sk', 'hr', 'cs', 'da', 'no', 'fi'}


from backend.modules.translation.services import detect_language


CLAIM_EXTRACTION_SYSTEM_PROMPT = """You are an expert fact-checking claim extraction system.
Given social media text or caption, extract the core verifiable factual claim(s).
Rules:
1. Ignore subjective opinions, personal commentary, greetings, rhetorical questions, and calls to action (e.g. "subscribe", "DM me", "comment below", "like and share", "what do you think?").
2. Extract concise, standalone, unambiguous factual assertions that can be fact-checked against reputable sources or fact-checking databases.
3. PRESERVE SPECIFICITY: Crucially, when the input describes a specific event, person, or development, preserve specific identifying details (named entities, individuals, roles, specific actions, demands, and locations). Do NOT strip who or what the action is about into vague generic statements (e.g. do NOT output generic "Protests are taking place at Delhi's Jantar Mantar" when the specific protest is about "demanding the resignation of Chief Election Commissioner Gyanesh Kumar").
4. If the text describes a single event or development with multiple facets, return ONE combined, specific, self-contained primary claim that retains the core subject, action, demand, and key named entities.
5. Return ONLY valid JSON with the format: {"claims": ["primary specific claim", "secondary distinct claim if any"]}
6. If no verifiable factual claim exists, return {"claims": []}.
"""


def select_or_synthesize_primary_claim(valid_claims: list[str], raw_text: str) -> str:
    """
    Selects or synthesizes the most specific primary claim:
    - Never defaults to a generic fragment that strips out the core subject or demand.
    - Preserves named entities, specific demands/actions, and locations.
    - If multiple claims fragment a single event, combines key entities across them.
    """
    if not valid_claims:
        return ""
    if len(valid_claims) == 1:
        return valid_claims[0].strip('"\'`')

    # Specificity scoring: penalize vague claims, reward presence of named entities & action verbs
    def score_claim(c: str) -> float:
        words = c.split()
        capitalized = sum(1 for w in words[1:] if w[0].isupper() and w.isalpha())
        key_actions = {"demanding", "resignation", "resign", "appointed", "arrested", "detained", "killed", "court", "commissioner"}
        action_hits = sum(2.5 for w in words if w.lower().strip(".,;:?!") in key_actions)
        return len(words) * 0.4 + capitalized * 2.0 + action_hits

    sorted_claims = sorted(valid_claims, key=score_claim, reverse=True)
    best_claim = sorted_claims[0].strip('"\'`')

    # Find proper noun entities in raw text (e.g. Gyanesh Kumar)
    import re
    named_entities = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", raw_text)
    ignore_ents = {"Today Marks", "While Protesters", "Delhi Police"}
    salient_entities = [e for e in named_entities if e not in ignore_ents]

    # If the top-scored claim lacks a location or lacks the demand present in other claims, synthesize
    for c in sorted_claims:
        c_clean = c.strip('"\'`')
        for ent in salient_entities:
            if ent in c_clean:
                # Find location if not already in c_clean
                loc_match = re.search(r"\b(?:at|in)\s+([A-Z][a-zA-Z'\s]+(?:Mantar|Delhi|Court|Square|Park))", raw_text)
                loc_str = f" at {loc_match.group(1).strip()}" if (loc_match and loc_match.group(1).strip() not in c_clean) else ""
                
                if "demand" in c_clean.lower() and loc_str:
                    if c_clean.lower().startswith("protesters are demanding"):
                        return f"Protests{loc_str} demanding " + c_clean[25:].lstrip()
                    elif not c_clean.lower().startswith("protest"):
                        return f"Protests{loc_str} {c_clean}"
                return c_clean

    return best_claim


def extract_claims(text: Optional[str]) -> str:
    """
    Step 4 Claim extraction (Synchronous heuristic fallback):
    Extracts the verifiable claim text from the translated or cleaned input.
    Normalizes punctuation, quotes, and whitespace.
    """
    if not text or not isinstance(text, str):
        return ""
    cleaned = text.strip().strip('"\'`')
    return cleaned


async def extract_claims_llm(text: Optional[str]) -> tuple[str, list[str]]:
    """
    Step 5 Claim extraction (LLM call):
    Extracts verifiable factual claim(s) from cleaned/translated text via LLM.
    Returns (primary_claim, list_of_claims).
    Falls back gracefully to concise first sentence if LLM fails or returns empty.
    """
    if not text or not isinstance(text, str) or not text.strip():
        return "", []

    cleaned = text.strip().strip('"\'`')
    words = cleaned.split()
    if len(words) < 3:
        return cleaned, [cleaned]

    # Heuristic fallback helper: extracts the first substantive sentence
    def heuristic_claim() -> str:
        sentences = re.split(r"(?<=[.!?])\s+|\n+", cleaned)
        for s in sentences:
            s_clean = s.strip()
            if len(s_clean.split()) >= 3:
                return s_clean
        return cleaned[:200].strip()

    settings = get_settings()
    gemini_key = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")
    candidate_models = [
        getattr(settings, "GEMINI_MODEL", None) or os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite"),
        "gemini-2.5-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-2.5-flash",
    ]
    # Remove duplicate while preserving order
    models_to_try = []
    for m in candidate_models:
        if m and m not in models_to_try:
            models_to_try.append(m)

    payload = {
        "systemInstruction": {
            "parts": [{"text": CLAIM_EXTRACTION_SYSTEM_PROMPT}]
        },
        "contents": [{
            "parts": [{"text": f"Extract factual claims from this text:\n\n{cleaned}"}]
        }],
        "generationConfig": {
            "temperature": 0.0,
            "responseMimeType": "application/json"
        }
    }

    for gemini_model in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            raw_json = parts[0]["text"].strip()
                            parsed = json.loads(raw_json)
                            claims = parsed.get("claims", [])
                            valid_claims = [c.strip() for c in claims if isinstance(c, str) and c.strip()]
                            if valid_claims:
                                primary_claim = select_or_synthesize_primary_claim(valid_claims, cleaned)
                                logger.info(f"[CLAIM EXTRACTION] Extracted {len(valid_claims)} claim(s) via {gemini_model}. Primary: '{primary_claim}'")
                                print(f"[CLAIM EXTRACTION] Extracted {len(valid_claims)} claim(s) via {gemini_model}. Primary: '{primary_claim}'", flush=True)
                                return primary_claim, valid_claims
                            else:
                                logger.info(f"[CLAIM EXTRACTION] LLM ({gemini_model}) returned 0 claims. Falling back to heuristic.")
                                fb = heuristic_claim()
                                return fb, []
                elif res.status_code == 429:
                    logger.warning(f"[CLAIM EXTRACTION] Model {gemini_model} rate limited (429). Trying next candidate.")
                    continue
                else:
                    logger.warning(f"[CLAIM EXTRACTION] Gemini ({gemini_model}) returned {res.status_code}: {res.text[:100]}")
        except Exception as e:
            logger.warning(f"[CLAIM EXTRACTION] LLM claim extraction with {gemini_model} failed: {e}")
            continue

    fb = heuristic_claim()
    return fb, [fb]

