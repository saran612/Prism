import re
import logging
from typing import Optional
from langdetect import detect, DetectorFactory

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

    # 2. Strip @mentions (e.g. @user, @mod.team)
    cleaned = re.sub(r"@[^\s!?,.:;()\[\]{}]+", "", cleaned)

    # 3. Strip hashtags (supports Unicode words, e.g. #ISRO, #भारत)
    cleaned = re.sub(r"#[^\s!?,.:;()\[\]{}]+", "", cleaned)

    # 4. Strip emojis and pictographs
    cleaned = EMOJI_PATTERN.sub("", cleaned)

    # 5. Normalize whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    return cleaned


def detect_language(text: Optional[str]) -> str:
    """
    Step 2 Language detection:
    Detects language using langdetect on substantive cleaned text,
    falling back to 'unknown' if detection fails or text is empty.
    """
    if not text or not text.strip():
        return "unknown"
    try:
        lang = detect(text)
        return lang
    except Exception as e:
        logger.warning(f"Language detection failed for text '{text[:40]}...': {e}")
        return "unknown"
