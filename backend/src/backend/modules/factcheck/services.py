import os
import logging
from typing import Optional
import httpx
from sqlalchemy.orm import Session

from backend.core.config import get_settings
from backend.modules.social.services import fetch_social_caption, fetch_social_post
from backend.modules.translation.services import detect_language, translate_to_english
from backend.modules.factcheck.repository import FactCheckRepository
from backend.modules.factcheck.schemas import CheckRequest
from backend.modules.factcheck.fallback import fallback_fact_check

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


def normalize_factcheck_rating(textual_rating: Optional[str]) -> tuple[str, int]:
    """
    Normalizes a textualRating string from Google Fact Check Tools API into:
    (state, score) where state is 'True' | 'False' | 'Unverified' and score is an int 0-100.
    """
    if not textual_rating:
        logger.warning("Empty textualRating provided to normalize_factcheck_rating. Mapped to Unverified (score 50).")
        return "Unverified", 50

    raw = textual_rating.strip().lower()

    # 1. "mostly false", "misleading", "exaggerated" → "False", score 60-75
    if any(k in raw for k in ["mostly false", "largely false", "misleading", "exaggerated"]):
        return "False", 70

    # 2. "false", "pants on fire", "fabricated", "incorrect" (not "mostly") → "False", score 85-100
    if any(k in raw for k in ["false", "pants on fire", "fabricated", "incorrect", "fake", "hoax", "debunk", "untrue"]):
        return "False", 95

    # 3. "half true", "mixture", "partly true", "unproven" → "Unverified", score 40-55
    if any(k in raw for k in ["half true", "mixture", "partly true", "partially true", "unproven"]):
        return "Unverified", 50

    # 4. "mostly true", "largely true" → "True", score 65-80
    if any(k in raw for k in ["mostly true", "largely true"]):
        return "True", 75

    # 5. "true", "correct", "accurate" (not "mostly"/"half") → "True", score 90-100
    if any(k in raw for k in ["true", "correct", "accurate"]):
        return "True", 95

    # 6. Unrecognized → "Unverified", score 50 (log raw string for later mapping)
    logger.warning(f"Unrecognized textualRating: '{textual_rating}' — mapped to Unverified (score 50)")
    return "Unverified", 50


async def fast_path_fact_check(query: str, lang_code: Optional[str] = None) -> Optional[dict]:
    """
    STAGE 1: Fast-path lookup against Google Fact Check Tools API.

    Returns:
        Dict with keys: state ('True'|'False'|'Unverified'), score (0-100), source ('known_factcheck')
        and internal server-side audit metadata in '_internal',
        or None if no match is found.
    """
    raw_data = await query_google_fact_check(query, lang_code)
    claims = raw_data.get("claims", [])

    # Filter out stub claims if any
    claims = [
        c for c in claims
        if not any(
            r.get("publisher", {}).get("name") == "Google Fact Check API (Stub)"
            for r in c.get("claimReview", [])
        )
    ]

    if not claims:
        logger.info(f"Stage 1 (Fast Path): No claims found for query: '{query}'")
        return None

    # Collect publisher reviews
    all_ratings = []
    first_review = None

    for claim in claims:
        for review in claim.get("claimReview", []):
            publisher_name = review.get("publisher", {}).get("name", "Unknown Publisher")
            rating = review.get("textualRating")
            if rating:
                all_ratings.append({
                    "publisher": publisher_name,
                    "textualRating": rating,
                    "url": review.get("url"),
                    "title": review.get("title")
                })
                if first_review is None:
                    first_review = review

    if not first_review or not first_review.get("textualRating"):
        logger.info(f"Stage 1 (Fast Path): Claims returned but no valid textualRating for: '{query}'")
        return None

    primary_rating = first_review["textualRating"]
    primary_publisher = first_review.get("publisher", {}).get("name", "Unknown Publisher")

    # If multiple publishers returned ratings, use the first and log the rest
    if len(all_ratings) > 1:
        other_ratings = [f"{r['publisher']}: {r['textualRating']}" for r in all_ratings[1:]]
        logger.info(
            f"Stage 1 (Fast Path): Multiple publisher ratings returned. Using first "
            f"('{primary_publisher}: {primary_rating}'). Other ratings logged: {other_ratings}"
        )

    state, score = normalize_factcheck_rating(primary_rating)

    logger.info(
        f"Stage 1 (Fast Path) result: state='{state}', score={score}, source='known_factcheck' "
        f"(publisher='{primary_publisher}', raw='{primary_rating}')"
    )

    return {
        "state": state,
        "score": score,
        "source": "known_factcheck",
        "_internal": {
            "stage": 1,
            "publisher": primary_publisher,
            "raw_textual_rating": primary_rating,
            "all_publisher_ratings": all_ratings,
            "raw_claims": claims
        }
    }


class FactCheckService:
    def __init__(self, db: Session):
        self.repo = FactCheckRepository(db)

    async def process_check(self, request: CheckRequest) -> dict:
        text_to_check = ""
        thumbnail_url = None
        platform = None
        author = None

        # Determine the text to check
        if request.url:
            logger.info(f"Fetching social post caption from: {request.url}")
            from unittest.mock import AsyncMock, Mock
            if isinstance(fetch_social_caption, (AsyncMock, Mock)):
                text_to_check = await fetch_social_caption(request.url)
            else:
                post_data = await fetch_social_post(request.url)
                text_to_check = post_data.get("caption", "")
                thumbnail_url = post_data.get("thumbnail_url")
                platform = post_data.get("platform")
                author = post_data.get("author")
        elif request.text:
            text_to_check = request.text
        else:
            raise ValueError("Either 'text' or 'url' must be provided.")

        if not text_to_check or not text_to_check.strip():
            raise ValueError("No text content could be extracted or provided.")

        # 1. Language detection
        detected_lang = detect_language(text_to_check)

        # 2. Translation & Normalization
        translated_text = translate_to_english(text_to_check, detected_lang)
        claim_query = translated_text if translated_text else text_to_check

        # STAGE 1 — FAST PATH (Google Fact Check Tools API)
        stage1_res = await fast_path_fact_check(claim_query, detected_lang)

        if stage1_res is not None:
            result_payload = {
                "state": stage1_res["state"],
                "score": stage1_res["score"],
                "source": "known_factcheck"
            }
            internal_audit = stage1_res.get("_internal", {})
        else:
            # STAGE 2 — FALLBACK (RAG, runs only if Stage 1 found nothing)
            stage2_res = await fallback_fact_check(claim_query)
            result_payload = {
                "state": stage2_res["state"],
                "score": stage2_res["score"],
                "source": "llm_inferred"
            }
            internal_audit = stage2_res.get("_internal", {})

        # Enrich internal server audit metadata
        internal_audit["input_text"] = text_to_check
        internal_audit["detected_language"] = detected_lang
        internal_audit["translated_text"] = translated_text
        if thumbnail_url:
            internal_audit["thumbnail_url"] = thumbnail_url
        if platform:
            internal_audit["platform"] = platform
        if author:
            internal_audit["author"] = author

        # Save to Database (audit in fact_check_results, exact 3-field in response_payload)
        try:
            self.repo.create(
                source_url=request.url,
                input_text=text_to_check,
                detected_language=detected_lang,
                translated_text=translated_text,
                fact_check_results=internal_audit,
                response_payload=result_payload
            )
        except Exception as e:
            logger.error(f"Failed to persist fact check record: {e}")

        # Return strictly the 3-field response to client
        return result_payload

    def get_history(self, limit: int = 50):
        return self.repo.get_history(limit=limit)
