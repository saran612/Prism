import logging
from typing import List, Optional
from sqlalchemy.orm import Session

from backend.modules.factcheck.models import FactCheckRecord

logger = logging.getLogger("prism.factcheck.repository")


class FactCheckRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        input_text: str,
        detected_language: Optional[str],
        translated_text: Optional[str],
        fact_check_results: Optional[dict],
        response_payload: dict,
        source_url: Optional[str] = None,
    ) -> FactCheckRecord:
        record = FactCheckRecord(
            source_url=source_url,
            input_text=input_text,
            detected_language=detected_language,
            translated_text=translated_text,
            fact_check_results=fact_check_results,
            response_payload=response_payload,
        )
        try:
            self.db.add(record)
            self.db.commit()
            self.db.refresh(record)
            logger.info(f"Persisted fact-check record id={record.id} to DB.")
            return record
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error persisting fact check record: {e}")
            raise

    def get_history(self, limit: int = 50) -> List[FactCheckRecord]:
        return (
            self.db.query(FactCheckRecord)
            .order_by(FactCheckRecord.created_at.desc())
            .limit(limit)
            .all()
        )

    def get_by_id(self, record_id: int) -> Optional[FactCheckRecord]:
        return self.db.query(FactCheckRecord).filter(FactCheckRecord.id == record_id).first()
