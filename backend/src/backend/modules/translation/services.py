import os
import re
import logging
from typing import Optional
import httpx
from langdetect import detect_langs, DetectorFactory
from deep_translator import MyMemoryTranslator, GoogleTranslator

# Enforce deterministic language detection across runs
DetectorFactory.seed = 0

logger = logging.getLogger("prism.translation")

# Supported non-English target languages for translation to English:
SUPPORTED_LANGUAGES = {
    "hi",  # Hindi
    "ta",  # Tamil
    "te",  # Telugu
    "bn",  # Bengali
    "mr",  # Marathi
    "gu",  # Gujarati
    "kn",  # Kannada
    "ml",  # Malayalam
    "pa",  # Punjabi
    "or",  # Odia
    "as",  # Assamese
    "ur",  # Urdu
}

# Common English keywords to prevent short-text misdetection by langdetect
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

# Locale codes mapping for MyMemory provider
LANG_TO_MYMEMORY = {
    "hi": "hi-IN",
    "ta": "ta-IN",
    "te": "te-IN",
    "bn": "bn-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "mr": "mr-IN",
    "gu": "gu-IN",
    "pa": "pa-IN",
    "or": "or-IN",
    "as": "as-IN",
    "ur": "ur-PK",
}

GEMINI_TRANSLATION_MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash"
]


def detect_language(text: Optional[str]) -> str:
    """Detects language with script checks for Indic scripts and vocabulary heuristics."""
    if not text or not text.strip():
        return "unknown"

    raw = text.strip()

    # 1. Unicode script checks for Indic languages (100% precision on Unicode blocks)
    if re.search(r"[\u0900-\u097F]", raw):
        return "hi"  # Devanagari (Hindi/Marathi)
    if re.search(r"[\u0B80-\u0BFF]", raw):
        return "ta"  # Tamil
    if re.search(r"[\u0C00-\u0C7F]", raw):
        return "te"  # Telugu
    if re.search(r"[\u0980-\u09FF]", raw):
        return "bn"  # Bengali
    if re.search(r"[\u0D00-\u0D7F]", raw):
        return "ml"  # Malayalam
    if re.search(r"[\u0C80-\u0CFF]", raw):
        return "kn"  # Kannada
    if re.search(r"[\u0A80-\u0AFF]", raw):
        return "gu"  # Gujarati
    if re.search(r"[\u0A00-\u0A7F]", raw):
        return "pa"  # Gurmukhi (Punjabi)
    if re.search(r"[\u0B00-\u0B7F]", raw):
        return "or"  # Odia
    if re.search(r"[\u0600-\u06FF]", raw):
        return "ur"  # Urdu (Perso-Arabic script)

    # 2. Vocabulary checks for short Latin claims
    words = [re.sub(r"\W+", "", w.lower()) for w in raw.split()]
    words = [w for w in words if w]
    english_matches = sum(1 for w in words if w in COMMON_ENGLISH_WORDS)

    try:
        langs = detect_langs(raw)
        top_lang = langs[0].lang
        if top_lang in OBSCURE_LATIN_LANGS and english_matches > 0:
            return "en"
        if top_lang != "en" and len(words) <= 7 and english_matches >= 1:
            return "en"
        return top_lang
    except Exception as e:
        if english_matches > 0:
            return "en"
        logger.warning(f"Language detection failed for text '{raw[:40]}...': {e}")
        return "unknown"


def _translate_with_gemini(text: str) -> Optional[str]:
    """Attempts translation using Gemini API across prioritized models."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return None

    configured_model = os.environ.get("GEMINI_MODEL")
    candidate_models = []
    if configured_model and configured_model not in GEMINI_TRANSLATION_MODELS:
        candidate_models.append(configured_model)
    candidate_models.extend(GEMINI_TRANSLATION_MODELS)

    payload = {
        "systemInstruction": {
            "parts": [{
                "text": (
                    "You are a professional translator specializing in Indian and regional languages. "
                    "Translate the provided text directly into clear, natural, modern English. "
                    "Preserve all proper names, entities, and factual details. "
                    "Output ONLY the plain English translation with no quotes, formatting, or commentary."
                )
            }]
        },
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {"temperature": 0.0}
    }

    for model in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            with httpx.Client(timeout=8.0) as client:
                res = client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0]:
                        parts = candidates[0]["content"].get("parts", [])
                        if parts and "text" in parts[0]:
                            translated = parts[0]["text"].strip().strip("\"'").strip()
                            if translated:
                                logger.info(f"[TRANSLATION] Gemini ({model}) translated: '{translated[:80]}...'")
                                return translated
                elif res.status_code == 429:
                    logger.warning(f"[TRANSLATION] Gemini model {model} rate limited (429). Trying next candidate.")
                    continue
        except Exception as e:
            logger.debug(f"[TRANSLATION] Gemini {model} attempt failed: {e}")
            continue

    return None


def _translate_with_mymemory(text: str, source_lang: str) -> Optional[str]:
    """Fallback translator using MyMemory API with localized language codes."""
    mem_code = LANG_TO_MYMEMORY.get(source_lang, f"{source_lang}-IN")
    try:
        translated = MyMemoryTranslator(source=mem_code, target="en-US").translate(text)
        if isinstance(translated, str) and not translated.startswith("MYMEMORY WARNING"):
            logger.info(f"[TRANSLATION] MyMemory ({mem_code}) translated: '{translated[:80]}...'")
            return translated
    except Exception as e:
        logger.debug(f"[TRANSLATION] MyMemory translation failed: {e}")
    return None


def _translate_with_google_web(text: str, source_lang: str) -> Optional[str]:
    """Tertiary fallback using GoogleTranslator web endpoint."""
    try:
        translated = GoogleTranslator(source=source_lang, target="en").translate(text)
        if isinstance(translated, str):
            logger.info(f"[TRANSLATION] GoogleTranslator web translated: '{translated[:80]}...'")
            return translated
    except Exception as e:
        logger.debug(f"[TRANSLATION] GoogleTranslator web failed: {e}")
    return None


def translate_to_english(text: str, source_lang: str) -> str:
    """Translates text from Indic or foreign languages to English.
    
    Uses a multi-tier fallback pipeline:
    1. Gemini API (gemini-2.5-flash-lite / gemini-3.5-flash-lite / gemini-flash-lite-latest)
    2. MyMemoryTranslator (with Indic locale mapping)
    3. GoogleTranslator (web scraper fallback)
    4. Original text fallback
    """
    if not text or not text.strip():
        return text

    if source_lang == "en":
        logger.debug("[TRANSLATION] Input language is English ('en'). Translation skipped.")
        return text

    # Tier 1: Gemini Translation
    gemini_result = _translate_with_gemini(text)
    if gemini_result:
        return gemini_result

    # Tier 2: MyMemoryTranslator
    mymemory_result = _translate_with_mymemory(text, source_lang)
    if mymemory_result:
        return mymemory_result

    # Tier 3: GoogleTranslator Web
    google_result = _translate_with_google_web(text, source_lang)
    if google_result:
        return google_result

    logger.warning(
        f"[TRANSLATION WARNING] All translation providers failed for '{source_lang}' text: '{text[:60]}...'. "
        "Falling back to original text."
    )
    return text


def translate_stub(text: str, source_lang: str) -> str:
    """Backward compatibility alias for translate_to_english."""
    return translate_to_english(text, source_lang)
