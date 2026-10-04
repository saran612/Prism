import os
import re
import json
import logging
import time
from typing import Optional, Any, Dict
import httpx
from sqlalchemy.orm import Session

from backend.core.config import get_settings
from backend.modules.social.services import fetch_social_caption, fetch_social_post
from backend.modules.translation.services import translate_to_english
from backend.modules.factcheck.pipeline import clean_caption, detect_language, extract_claims, extract_claims_llm
from backend.modules.factcheck.repository import FactCheckRepository
from backend.modules.factcheck.schemas import CheckRequest
from backend.modules.factcheck.fallback import fallback_fact_check

logger = logging.getLogger("prism.factcheck.services")


async def query_google_fact_check(query: str, lang_code: Optional[str] = None) -> dict:
    """Queries the Google Fact Check Tools API with the given query text."""
    settings = get_settings()
    api_key = settings.GOOGLE_API_KEY or os.environ.get("GOOGLE_API_KEY")

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
            logger.info(f"[FAST PATH API] Query: '{query}' -> Status: {response.status_code}")
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        logger.error(
            f"[FAST PATH API ERROR] Query: '{query}' -> Status: {e.response.status_code}: {e.response.text}"
        )
        return {"error": "Failed to query Google Fact Check API", "status_code": e.response.status_code, "details": e.response.text}
    except Exception as e:
        logger.error(f"[FAST PATH API ERROR] Query: '{query}' -> {type(e).__name__}: {e}")
        return {"error": "Failed to query Google Fact Check API", "details": str(e)}


def normalize_factcheck_rating(textual_rating: Optional[str]) -> tuple[str, int]:
    """
    Normalizes a textualRating string from Google Fact Check Tools API into:
    (state, score) where state is 'True' | 'False' | 'Unverified' and score is an int 0-100.
    Protects against negation inversions (e.g. 'not true', 'inaccurate', 'not correct').
    """
    import re

    if not textual_rating:
        logger.warning("Empty textualRating provided to normalize_factcheck_rating. Mapped to Unverified (score 50).")
        return "Unverified", 50

    raw = textual_rating.strip().lower()

    # 1. Strong False / Explicit Negation patterns
    strong_false_patterns = [
        r"\bnot true\b", r"\bnot accurate\b", r"\bnot correct\b", r"\binaccurate\b",
        r"\bfalse\b", r"\bpants on fire\b", r"\bfabricated\b", r"\bincorrect\b",
        r"\bfake\b", r"\bhoax\b", r"\bdebunk\b", r"\buntrue\b", r"\bdisproven\b",
        r"\bmisattributed\b", r"\bmanipulated\b", r"\bdoctored\b"
    ]
    if any(re.search(p, raw) for p in strong_false_patterns):
        if any(k in raw for k in ["mostly false", "largely false", "partly false", "partially false"]):
            return "False", 75
        return "False", 95

    # 2. Soft False / Misleading
    soft_false_patterns = [
        r"\bmostly false\b", r"\blargely false\b", r"\bmisleading\b",
        r"\bexaggerated\b", r"\bout of context\b", r"\bmissing context\b"
    ]
    if any(re.search(p, raw) for p in soft_false_patterns):
        return "False", 70

    # 3. Inconclusive / Half True / Disputed
    unverified_patterns = [
        r"\bhalf true\b", r"\bmixture\b", r"\bpartly true\b", r"\bpartially true\b",
        r"\bunproven\b", r"\bno evidence\b", r"\bunsubstantiated\b", r"\bdisputed\b",
        r"\bunverified\b", r"\bunclear\b", r"\bunconfirmed\b", r"\bneeds context\b"
    ]
    if any(re.search(p, raw) for p in unverified_patterns):
        return "Unverified", 50

    # 4. Mostly True
    mostly_true_patterns = [r"\bmostly true\b", r"\blargely true\b"]
    if any(re.search(p, raw) for p in mostly_true_patterns):
        return "True", 75

    # 5. True (Strict word boundaries, ensuring not negated)
    true_patterns = [r"\btrue\b", r"\bcorrect\b", r"\baccurate\b", r"\bconfirmed\b", r"\bverified\b"]
    if any(re.search(p, raw) for p in true_patterns):
        if not re.search(r"\b(not|never|no|un|in|hardly|scarcely)\b", raw):
            return "True", 95
        return "False", 90

    # 6. Unrecognized → "Unverified", score 50 (log raw string for tracking)
    logger.warning(f"Unrecognized textualRating: '{textual_rating}' — mapped to Unverified (score 50)")
    return "Unverified", 50


def is_media_artifact_debunk(claim_text: str, review_title: str = "") -> bool:
    """
    Checks if a fact-check claim or review title is primarily debunking a visual artifact
    (e.g., miscaptioned/recycled video or doctored image) rather than verifying an underlying real-world event.
    """
    if not claim_text and not review_title:
        return False
    lower_claim = (claim_text or "").strip().lower()
    lower_title = (review_title or "").strip().lower()

    media_patterns = [
        r"^(this|these|the|a)\s+(video|image|photo|visuals?|clip|footage)\s+(shows?|depicts?|proves?)",
        r"^(old|unrelated|viral|doctored|manipulated|altered)\s+(video|image|photo|visuals?|clip|footage)",
        r"\b(old|unrelated|viral)\s+(video|footage|visuals?|photo|image)\s+falsely (linked|shared|claimed)",
        r"^(video|photo|image|visuals?)\s+(shows?|claims?|clip)\b",
        r"^fact check:?\s+\d{4}\s+video\b",
        r"\bvideo goes viral\b",
        r"\bclip of\s+.*\s+protest\b",
    ]
    for p in media_patterns:
        if re.search(p, lower_claim):
            return True
        if lower_title and re.search(p, lower_title):
            return True
    return False


async def fast_path_fact_check(
    query: str,
    lang_code: Optional[str] = None,
    original_text: Optional[str] = None,
    is_media_submission: bool = False
) -> Optional[dict]:
    """
    STAGE 1: Fast-path lookup against Google Fact Check Tools API.

    Returns:
        Dict with keys: state ('True'|'False'|'Unverified'), score (0-100), source ('known_factcheck')
        and internal server-side audit metadata in '_internal',
        or None if no match is found.
    """
    # 1. Search Google Fact Check with the English claim query (no lang filter to find global/English debunks)
    raw_data = await query_google_fact_check(query)
    claims = raw_data.get("claims", [])

    # Filter out stub claims if any
    claims = [
        c for c in claims
        if not any(
            r.get("publisher", {}).get("name") == "Google Fact Check API (Stub)"
            for r in c.get("claimReview", [])
        )
    ]

    # 2. If no claims found and original text was in a non-English language, also search with original text and lang_code
    if not claims and original_text and lang_code and lang_code not in ("en", "unknown"):
        regional_data = await query_google_fact_check(original_text, lang_code)
        regional_claims = [
            c for c in regional_data.get("claims", [])
            if not any(
                r.get("publisher", {}).get("name") == "Google Fact Check API (Stub)"
                for r in c.get("claimReview", [])
            )
        ]
        if regional_claims:
            claims = regional_claims
            raw_data = regional_data

    if not claims:
        logger.info(f"Stage 1 (Fast Path): No claims found for query: '{query}'")
        return None

    # Collect publisher reviews, filtering out media-debunk matches for plain text submissions
    all_ratings = []
    first_review = None

    for claim in claims:
        claim_text = claim.get("text", "")
        for review in claim.get("claimReview", []):
            publisher_name = review.get("publisher", {}).get("name", "Unknown Publisher")
            rating = review.get("textualRating")
            review_title = review.get("title", "")

            # Fix 2: Filter out visual media debunks if user's input is plain text
            if not is_media_submission and is_media_artifact_debunk(claim_text, review_title):
                logger.info(
                    f"[FAST PATH FILTER] Skipping visual media debunk for plain-text event claim: "
                    f"claim='{claim_text}' | title='{review_title}' | publisher='{publisher_name}' | rating='{rating}'"
                )
                print(
                    f"[FAST PATH FILTER] Skipping visual media debunk for plain-text event claim: "
                    f"claim='{claim_text}' | title='{review_title}'",
                    flush=True
                )
                continue

            if rating:
                all_ratings.append({
                    "publisher": publisher_name,
                    "textualRating": rating,
                    "url": review.get("url"),
                    "title": review_title
                })
                if first_review is None:
                    first_review = review

    if not first_review or not first_review.get("textualRating"):
        logger.info(
            f"Stage 1 (Fast Path): All candidate claims were filtered out (e.g. visual media debunks) "
            f"or had no valid rating for: '{query}'. Falling through to RAG fallback."
        )
        print(
            f"[FAST PATH] All candidate claims were filtered out (e.g. visual media debunks). Falling through to RAG fallback.",
            flush=True
        )
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

    async def process_check_stream(self, request: CheckRequest):
        """
        Asynchronously processes each layer of the verification pipeline and yields
        SSE events progressively as each stage completes:
        1. content_extracted: Scraped metadata, author, thumbnail, caption text
        2. translated: Language detection & English neural translation
        3. claim_extracted: Isolated verifiable claim(s) from LLM
        4. fast_path / fallback_started: Real-time status update
        5. complete: Final verdict state, confidence score, source, and findings
        """
        t_req_start = time.perf_counter()
        text_to_check = ""
        thumbnail_url = None
        platform = None
        author = None

        # 1. content_extraction (instaloader fetching the post)
        t0 = time.perf_counter()
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
        t_content_extraction = time.perf_counter() - t0
        logger.info(f"[TIMING] content_extraction: {t_content_extraction:.4f}s")
        print(f"[TIMING] content_extraction: {t_content_extraction:.4f}s", flush=True)

        if not request.url and (not text_to_check or not text_to_check.strip()):
            raise ValueError("No text content could be extracted or provided.")

        # Yield Stage 1: Content Extraction Complete
        yield {
            "event": "content_extracted",
            "stage": 1,
            "text": text_to_check,
            "input_text": text_to_check,
            "thumbnail_url": thumbnail_url,
            "platform": platform,
            "author": author,
            "source_url": request.url,
            "t_content_extraction": t_content_extraction
        }

        # 2. pre_clean
        input_to_verify: str = ""
        t0 = time.perf_counter()
        cleaned_text = clean_caption(text_to_check)
        t_pre_clean = time.perf_counter() - t0
        logger.info(f"[TIMING] pre_clean: {t_pre_clean:.4f}s")
        print(f"[TIMING] pre_clean: {t_pre_clean:.4f}s", flush=True)

        # Check for no-claim short-circuit path (only if completely empty or purely generic viral tags)
        words = cleaned_text.split() if cleaned_text else []
        is_generic_tag = cleaned_text.strip().lower() in ["fact check", "factcheck", "fact-check", "check", "news", "viral", "#viral", "#news"]
        if not cleaned_text or not cleaned_text.strip() or len(words) == 0 or is_generic_tag:
            logger.info("No substantive claim text found after pre-clean. Taking no-claim short-circuit path.")
            path_taken = "no-claim short-circuit"
            t_lang = 0.0
            t_trans = 0.0
            t_claim = 0.0
            t_fast = 0.0
            t_ev = 0.0
            t_llm = 0.0
            logger.info("[TIMING] language_detection: 0.0000s")
            print("[TIMING] language_detection: 0.0000s", flush=True)
            logger.info("[TIMING] translation: 0.0000s")
            print("[TIMING] translation: 0.0000s", flush=True)
            logger.info("[TIMING] claim_extraction: 0.0000s")
            print("[TIMING] claim_extraction: 0.0000s", flush=True)
            logger.info("[TIMING] fast_path_lookup: 0.0000s")
            print("[TIMING] fast_path_lookup: 0.0000s", flush=True)
            logger.info("[TIMING] fallback_evidence_retrieval: 0.0000s")
            print("[TIMING] fallback_evidence_retrieval: 0.0000s", flush=True)
            logger.info("[TIMING] fallback_llm_verdict: 0.0000s")
            print("[TIMING] fallback_llm_verdict: 0.0000s", flush=True)

            res_state = "Unverified"
            res_score = 0
            res_source = "llm_inferred"
            detected_lang = "unknown"
            translated_text = ""
            claim_query = ""
            input_to_verify = ""
            extracted_claims = []
            internal_audit = {
                "stage": 0,
                "reason": "no_claim_short_circuit",
                "evidence": []
            }

            yield {
                "event": "translated",
                "stage": 2,
                "detected_language": "unknown",
                "translated_text": ""
            }
            yield {
                "event": "claim_extracted",
                "stage": 3,
                "claim": "",
                "extracted_claims": []
            }
        else:
            # 3. language_detection
            t0 = time.perf_counter()
            detected_lang = detect_language(cleaned_text)
            t_lang = time.perf_counter() - t0
            logger.info(f"[TIMING] language_detection: {t_lang:.4f}s")
            print(f"[TIMING] language_detection: {t_lang:.4f}s", flush=True)

            # 4. translation
            t0 = time.perf_counter()
            translated_text = translate_to_english(cleaned_text, detected_lang)
            t_trans = time.perf_counter() - t0
            logger.info(f"[TIMING] translation: {t_trans:.4f}s")
            print(f"[TIMING] translation: {t_trans:.4f}s", flush=True)

            # Yield Stage 2: Language Detected & Translated!
            yield {
                "event": "translated",
                "stage": 2,
                "detected_language": detected_lang,
                "translated_text": translated_text,
                "t_language_detection": t_lang,
                "t_translation": t_trans
            }

            # 5. claim_extraction (LLM call)
            t0 = time.perf_counter()
            base_claim = translated_text if translated_text else cleaned_text
            claim_query, extracted_claims = await extract_claims_llm(base_claim)
            t_claim = time.perf_counter() - t0
            logger.info(f"[TIMING] claim_extraction: {t_claim:.4f}s")
            print(f"[TIMING] claim_extraction: {t_claim:.4f}s", flush=True)

            # Yield Stage 3: Semantic Claim Isolated!
            yield {
                "event": "claim_extracted",
                "stage": 3,
                "claim": claim_query,
                "extracted_claims": extracted_claims,
                "t_claim_extraction": t_claim
            }

            # 6. fast_path_lookup (Google Fact Check API)
            t0 = time.perf_counter()
            is_media = bool(thumbnail_url or (request.url and any(x in request.url.lower() for x in ["instagram.com/reel", "instagram.com/p", "tiktok.com", "youtube.com/shorts"])))
            stage1_res = await fast_path_fact_check(
                claim_query,
                detected_lang,
                original_text=cleaned_text,
                is_media_submission=is_media
            )
            t_fast = time.perf_counter() - t0
            logger.info(f"[TIMING] fast_path_lookup: {t_fast:.4f}s")
            print(f"[TIMING] fast_path_lookup: {t_fast:.4f}s", flush=True)

            if stage1_res is not None:
                path_taken = "fast path"
                t_ev = 0.0
                t_llm = 0.0
                logger.info("[TIMING] fallback_evidence_retrieval: 0.0000s")
                print("[TIMING] fallback_evidence_retrieval: 0.0000s", flush=True)
                logger.info("[TIMING] fallback_llm_verdict: 0.0000s")
                print("[TIMING] fallback_llm_verdict: 0.0000s", flush=True)
                internal_audit = stage1_res.get("_internal", {})
                if "raw_claims" in internal_audit and "claims" not in internal_audit:
                    internal_audit["claims"] = internal_audit["raw_claims"]
                res_state = stage1_res["state"]
                res_score = stage1_res["score"]
                res_source = "known_factcheck"
            else:
                path_taken = "fallback"
                yield {
                    "event": "fallback_started",
                    "stage": 4,
                    "message": "Searching reputable news sources..."
                }
                stage2_res = await fallback_fact_check(claim_query)

                internal_audit = stage2_res.get("_internal", {})
                res_state = stage2_res["state"]
                res_score = stage2_res["score"]
                res_source = stage2_res.get("source", "llm_inferred")
                t_ev = internal_audit.get("t_ev", 0.0)
                t_llm = internal_audit.get("t_llm", 0.0)

        # Enrich internal server audit metadata
        final_claim = claim_query
        internal_audit["input_text"] = text_to_check
        internal_audit["detected_language"] = detected_lang
        internal_audit["translated_text"] = translated_text
        internal_audit["claim_query"] = final_claim
        internal_audit["claim"] = final_claim
        if extracted_claims:
            internal_audit["extracted_claims"] = extracted_claims
        if thumbnail_url:
            internal_audit["thumbnail_url"] = thumbnail_url
        if platform:
            internal_audit["platform"] = platform
        if author:
            internal_audit["author"] = author

        result_payload = {
            "state": res_state,
            "score": res_score,
            "source": res_source,
            "text": text_to_check,
            "claim": final_claim,
            "extracted_claims": extracted_claims,
            "input_text": text_to_check,
            "detected_language": detected_lang,
            "translated_text": translated_text,
            "thumbnail_url": thumbnail_url,
            "author": author,
            "source_url": request.url,
            "fact_check_results": internal_audit
        }

        # Pre-populate timings so they are persisted in DB
        t_now = time.perf_counter() - t_req_start
        result_payload["_timings"] = {
            "content_extraction": t_content_extraction,
            "pre_clean": t_pre_clean,
            "language_detection": t_lang,
            "translation": t_trans,
            "claim_extraction": t_claim,
            "fast_path_lookup": t_fast,
            "fallback_evidence_retrieval": t_ev,
            "fallback_llm_verdict": t_llm,
            "db_persistence": 0.0,
            "total": t_now,
            "path": path_taken
        }
        result_payload["timings"] = result_payload["_timings"]

        # 9. db_persistence
        t0 = time.perf_counter()
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
        t_db = time.perf_counter() - t0
        logger.info(f"[TIMING] db_persistence: {t_db:.4f}s")
        print(f"[TIMING] db_persistence: {t_db:.4f}s", flush=True)

        # 10. TOTAL end-to-end time for the request
        t_total = time.perf_counter() - t_req_start
        logger.info(f"[TIMING] total: {t_total:.4f}s")
        print(f"[TIMING] total: {t_total:.4f}s", flush=True)

        result_payload["_timings"]["db_persistence"] = t_db
        result_payload["_timings"]["total"] = t_total
        result_payload["timings"] = result_payload["_timings"]

        # Yield Stage 5: Verification Complete
        yield {
            "event": "complete",
            "stage": 5,
            "state": res_state,
            "score": res_score,
            "source": res_source,
            "claim": claim_query,
            "fact_check_results": internal_audit,
            "timings": result_payload["timings"],
            "result": result_payload
        }

    async def process_check(self, request: CheckRequest) -> dict[str, Any]:
        """Synchronous wrapper for backward compatibility with existing tests and API callers."""
        final_payload: Optional[dict[str, Any]] = None
        async for event in self.process_check_stream(request):
            if event.get("event") == "complete":
                res = event.get("result")
                if isinstance(res, dict):
                    final_payload = res
        if final_payload is None:
            raise RuntimeError("Verification pipeline finished without complete event.")
        return final_payload


    def get_history(self, limit: int = 50):
        records = self.repo.get_history(limit=limit * 3)
        unique_records = []
        seen_urls = set()
        seen_texts = set()
        for r in records:
            norm_url = r.source_url.strip().rstrip("/").lower() if (r.source_url and r.source_url.strip()) else None
            norm_text = " ".join(r.input_text.strip().lower().split()) if (r.input_text and r.input_text.strip()) else None

            if (norm_url and norm_url in seen_urls) or (norm_text and norm_text in seen_texts):
                continue

            if norm_url:
                seen_urls.add(norm_url)
            if norm_text:
                seen_texts.add(norm_text)

            unique_records.append(r)
            if len(unique_records) >= limit:
                break
        return unique_records

    def get_claims(self, limit: int = 50):
        records = self.get_history(limit=limit)
        items = []
        for r in records:
            payload = r.response_payload
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except Exception:
                    payload = {}
            elif not isinstance(payload, dict):
                payload = {}

            audit = r.fact_check_results
            if isinstance(audit, str):
                try:
                    audit = json.loads(audit)
                except Exception:
                    audit = {}
            elif not isinstance(audit, dict):
                audit = {}

            state = payload.get("state")
            score = payload.get("score")
            source = payload.get("source")

            if not state:
                claims = audit.get("claims", [])
                if not claims:
                    state = "Unverified"
                    score = 0
                    source = "llm_inferred"
                else:
                    first_review = claims[0].get("claimReview", [{}])[0] if claims[0].get("claimReview") else {}
                    state, score = normalize_factcheck_rating(first_review.get("textualRating"))
                    source = "known_factcheck"

            publisher = audit.get("publisher")
            factcheck_url = None
            if not publisher and audit.get("claims"):
                first_review = audit["claims"][0].get("claimReview", [{}])[0] if audit["claims"][0].get("claimReview") else {}
                publisher = first_review.get("publisher", {}).get("name")
                factcheck_url = first_review.get("url")

            if not factcheck_url and audit.get("all_publisher_ratings"):
                first_r = audit["all_publisher_ratings"][0]
                factcheck_url = first_r.get("url")
                if not publisher:
                    publisher = first_r.get("publisher")

            evidence = audit.get("evidence", [])
            thumbnail_url = (
                audit.get("thumbnail_url")
                if isinstance(audit, dict) and audit.get("thumbnail_url")
                else (payload.get("thumbnail_url") if isinstance(payload, dict) else None)
            )
            author = payload.get("author") or (audit.get("author") if isinstance(audit, dict) else None)

            claim_text = (
                payload.get("claim")
                or audit.get("claim_query")
                or r.translated_text
                or r.input_text
            )

            items.append({
                "id": r.id,
                "claim": claim_text,
                "text": r.input_text,
                "translated_text": r.translated_text,
                "state": state or "Unverified",
                "score": score if score is not None else 0,
                "source": source or "llm_inferred",
                "publisher": publisher,
                "url": factcheck_url or r.source_url,
                "evidence": evidence,
                "source_url": r.source_url,
                "detected_language": r.detected_language,
                "thumbnail_url": thumbnail_url,
                "author": author,
                "fact_check_results": audit,
                "created_at": r.created_at.isoformat() if r.created_at else None
            })
        return items

