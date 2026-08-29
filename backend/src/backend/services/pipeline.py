import logging
from langdetect import detect

from backend.services.translation import translate_to_english

logger = logging.getLogger(__name__)

def detect_language(text: str) -> str:
    """Detects the language of the text, falling back to 'unknown' on error."""
    if not text or not text.strip():
        return "unknown"
    try:
        return detect(text)
    except Exception as e:
        logger.warning(f"Language detection failed: {e}")
        return "unknown"

def translate_stub(text: str, source_lang: str) -> str:
    """Translates non-English supported languages (Hindi, Tamil, Telugu, Kannada, Malayalam) to English."""
    return translate_to_english(text, source_lang)

