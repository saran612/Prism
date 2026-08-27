import os
import logging
from typing import Optional
import httpx
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


async def query_google_fact_check(query: str, lang_code: Optional[str] = None) -> dict:
    """Queries the Google Fact Check Tools API with the given query text."""
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("GOOGLE_API_KEY environment variable is not set. Returning mock fact check data.")
        return {
            "claims": [
                {
                    "text": query,
                    "claimant": "Social Media Platform",
                    "claimDate": "2026-08-27T00:00:00Z",
                    "claimReview": [
                        {
                            "publisher": {
                                "name": "Google Fact Check API (Stub)",
                                "site": "factchecktools.googleapis.com"
                            },
                            "url": "https://toolbox.google.com/factcheck/explorer",
                            "title": "Stub Claim Review",
                            "reviewDate": "2026-08-27T00:00:00Z",
                            "textualRating": "Google API key not configured in backend.",
                            "languageCode": "en"
                        }
                    ]
                }
            ],
            "note": "GOOGLE_API_KEY environment variable is missing. This is a stub fallback."
        }
    
    url = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
    params = {
        "query": query,
        "key": api_key
    }
    if lang_code and lang_code != "unknown":
        params["languageCode"] = lang_code

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"Error querying Google Fact Check API: {e}")
        return {"error": "Failed to query Google Fact Check API", "details": str(e)}
