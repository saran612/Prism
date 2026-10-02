from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.modules.factcheck.schemas import CheckRequest, CheckResponse, FactCheckHistoryItem
from backend.modules.factcheck.services import FactCheckService

from fastapi.responses import JSONResponse

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



@router.get("/history", response_model=list[FactCheckHistoryItem])
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    service = FactCheckService(db)
    records = service.get_history(limit=limit)
    return [
        FactCheckHistoryItem(
            id=r.id,
            source_url=r.source_url,
            input_text=r.input_text,
            detected_language=r.detected_language,
            translated_text=r.translated_text,
            fact_check_results=r.fact_check_results,
            created_at=r.created_at.isoformat() if r.created_at else None,
            thumbnail_url=(
                r.response_payload.get("thumbnail_url")
                if isinstance(r.response_payload, dict) and r.response_payload.get("thumbnail_url")
                else (r.fact_check_results.get("thumbnail_url") if isinstance(r.fact_check_results, dict) else None)
            ),
        )
        for r in records
    ]


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    service = FactCheckService(db)
    records = service.get_history(limit=500)
    total = len(records)

    platforms = {"instagram": 0, "twitter": 0, "facebook": 0, "other": 0}
    languages = {}
    verdicts = {"false": 0, "misleading": 0, "verified": 0, "unverified": 0}

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

    return {
        "total_checks": total,
        "platforms": platforms,
        "languages": languages,
        "verdicts": verdicts,
    }

