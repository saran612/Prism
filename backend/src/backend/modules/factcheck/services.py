import os
import logging
from typing import Optional
import httpx
from sqlalchemy.orm import Session

from backend.core.config import get_settings
from backend.modules.social.services import fetch_instagram_caption
from backend.modules.translation.services import detect_language, translate_to_english
from backend.modules.factcheck.repository import FactCheckRepository
from backend.modules.factcheck.schemas import CheckRequest

logger = logging.getLogger("prism.factcheck.services")


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


class FactCheckService:
    def __init__(self, db: Session):
        self.repo = FactCheckRepository(db)

    async def process_check(self, request: CheckRequest) -> dict:
        # Determine the text to check
        if request.url:
            logger.info(f"Fetching Instagram post caption from: {request.url}")
            text_to_check = await fetch_instagram_caption(request.url)
        elif request.text:
            text_to_check = request.text
        else:
            raise ValueError("Either 'text' or 'url' must be provided.")

        # 1. Language detection
        detected_lang = detect_language(text_to_check)

        # 2. Translation
        translated_text = translate_to_english(text_to_check, detected_lang)

        # 3. Google Fact Check API search
        fact_check_results = await query_google_fact_check(translated_text, detected_lang)

        response_payload = {
            "text": text_to_check,
            "detected_language": detected_lang,
            "translated_text": translated_text,
            "fact_check_results": fact_check_results
        }

        # 4. Save to Database
        try:
            self.repo.create(
                source_url=request.url,
                input_text=text_to_check,
                detected_language=detected_lang,
                translated_text=translated_text,
                fact_check_results=fact_check_results,
                response_payload=response_payload
            )
        except Exception as e:
            logger.error(f"Failed to persist fact check record: {e}")

        return response_payload

    def get_history(self, limit: int = 50):
        return self.repo.get_history(limit=limit)
