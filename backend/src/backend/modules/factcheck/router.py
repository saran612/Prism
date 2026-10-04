from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.modules.factcheck.schemas import CheckRequest, CheckResponse, FactCheckHistoryItem, ClaimItem
from backend.modules.factcheck.services import FactCheckService

import json
import logging
from fastapi.responses import JSONResponse, StreamingResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Fact Check"])


@router.post("/check", response_model=CheckResponse)
async def check_claim(request: CheckRequest, db: Session = Depends(get_db)):
    service = FactCheckService(db)
    try:
        return await service.process_check(request)
    except ValueError as e:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": str(e)}
        )


@router.post("/check/stream")
async def check_claim_stream(request: CheckRequest, db: Session = Depends(get_db)):
    service = FactCheckService(db)

    async def event_generator():
        try:
            async for event in service.process_check_stream(request):
                yield f"data: {json.dumps(event)}\n\n"
        except ValueError as e:
            yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"
        except Exception as e:
            logger.exception("Error during check stream")
            yield f"data: {json.dumps({'event': 'error', 'error': 'Internal server error occurred.'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/claims", response_model=list[ClaimItem])
def get_claims(limit: int = 50, db: Session = Depends(get_db)):
    service = FactCheckService(db)
    return service.get_claims(limit=limit)


@router.get("/history", response_model=list[FactCheckHistoryItem])
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    service = FactCheckService(db)
    claims = service.get_claims(limit=limit)
    items = []
    for c in claims:
        items.append(
            FactCheckHistoryItem(
                id=c["id"],
                source_url=c["source_url"],
                input_text=c["text"],
                detected_language=c["detected_language"],
                translated_text=c["translated_text"],
                fact_check_results=c.get("fact_check_results") if isinstance(c.get("fact_check_results"), dict) else None,
                created_at=c["created_at"],
                thumbnail_url=c["thumbnail_url"],
                state=c["state"],
                score=c["score"],
                source=c["source"],
                claim=c["claim"],
                author=c.get("author"),
                publisher=c.get("publisher"),
            )
        )
    return items


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    service = FactCheckService(db)
    records = service.get_history(limit=500)
    total = len(records)

    platforms = {"instagram": 0, "twitter": 0, "facebook": 0, "other": 0}
    languages = {}
    verdicts = {"false": 0, "misleading": 0, "verified": 0, "unverified": 0}

    fast_path_count = 0
    total_timings = []

    for r in records:
        url = (r.source_url or "").lower()
        if "instagram" in url or "instagr.am" in url:
            platforms["instagram"] += 1
        elif "twitter" in url or "x.com" in url:
            platforms["twitter"] += 1
        elif "facebook" in url or "fb." in url:
            platforms["facebook"] += 1
        else:
            platforms["other"] += 1

        lang = (r.detected_language or "unknown").lower()
        languages[lang] = languages.get(lang, 0) + 1

        # Check response_payload state first
        payload = r.response_payload if isinstance(r.response_payload, dict) else {}
        state = payload.get("state")
        source = payload.get("source")
        if not source:
            claims = (r.fact_check_results or {}).get("claims", []) if isinstance(r.fact_check_results, dict) else []
            source = "known_factcheck" if claims else "llm_inferred"

        if source == "known_factcheck":
            fast_path_count += 1

        timings = payload.get("timings") or payload.get("_timings")
        if timings and isinstance(timings, dict) and "total" in timings and timings["total"] > 0:
            total_timings.append(timings["total"])

        if state == "False":
            verdicts["false"] += 1
        elif state == "True":
            verdicts["verified"] += 1
        elif state == "Unverified":
            verdicts["unverified"] += 1
        else:
            # Legacy records fallback
            claims = (r.fact_check_results or {}).get("claims", []) if isinstance(r.fact_check_results, dict) else []
            if not claims:
                verdicts["unverified"] += 1
            else:
                rating = (claims[0].get("claimReview", [{}])[0].get("textualRating", "") or "").lower()
                if "false" in rating or "fake" in rating or "incorrect" in rating:
                    verdicts["false"] += 1
                elif "mislead" in rating or "dispute" in rating:
                    verdicts["misleading"] += 1
                else:
                    verdicts["verified"] += 1

    fast_path_rate = round((fast_path_count / total * 100), 1) if total > 0 else 0.0
    avg_response_time = round(sum(total_timings) / len(total_timings), 1) if total_timings else None

    return {
        "total_checks": total,
        "platforms": platforms,
        "languages": languages,
        "verdicts": verdicts,
        "fast_path_count": fast_path_count,
        "fast_path_rate": fast_path_rate,
        "avg_response_time": avg_response_time,
    }

