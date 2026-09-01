import logging
from langdetect import detect
from deep_translator import GoogleTranslator

logger = logging.getLogger("prism.translation")

# Supported non-English target languages for translation to English:
# hi (Hindi), ta (Tamil), kn (Kannada), te (Telugu), ml (Malayalam)
SUPPORTED_LANGUAGES = {"hi", "ta", "kn", "te", "ml"}


def detect_language(text: str) -> str:
    """Detects the language of the text, falling back to 'unknown' on error."""
    if not text or not text.strip():
        return "unknown"
    try:
        return detect(text)
    except Exception as e:
        logger.warning(f"Language detection failed: {e}")
        return "unknown"


def translate_to_english(text: str, source_lang: str) -> str:
    """Translates text from Hindi, Tamil, Kannada, Telugu, or Malayalam to English.
    
    If language is English or not in the supported list, returns the original text.
    """
    if not text or not text.strip():
        return text
    
    if source_lang == "en":
        return text
        
    if source_lang not in SUPPORTED_LANGUAGES:
        logger.info(f"Language '{source_lang}' is not in the translation-supported list. Skipping translation.")
        return text

    try:
        logger.info(f"Translating text from '{source_lang}' to 'en'...")
        translated = GoogleTranslator(source=source_lang, target="en").translate(text)
        return translated
    except Exception as e:
        logger.error(f"Error during translation from '{source_lang}' to 'en': {e}")
        return text


def translate_stub(text: str, source_lang: str) -> str:
    """Backward compatibility alias for translate_to_english."""
    return translate_to_english(text, source_lang)
