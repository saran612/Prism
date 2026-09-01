from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.modules.factcheck.schemas import CheckRequest, FactCheckHistoryItem
from backend.modules.factcheck.services import FactCheckService

from fastapi.responses import JSONResponse

router = APIRouter(tags=["Fact Check"])


@router.post("/check")
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
            created_at=r.created_at.isoformat() if r.created_at else None
        )
        for r in records
    ]
