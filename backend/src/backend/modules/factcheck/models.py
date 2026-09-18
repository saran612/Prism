import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.dialects.postgresql import JSONB

from backend.core.database import Base


class FactCheckRecord(Base):
    __tablename__ = "fact_check_records"

    id = Column(Integer, primary_key=True, index=True)
    source_url = Column(String, nullable=True)
    input_text = Column(Text, nullable=False)
    detected_language = Column(String(10), nullable=True)
    translated_text = Column(Text, nullable=True)
    fact_check_results = Column(JSON().with_variant(JSONB, "postgresql"), nullable=True)
    response_payload = Column(JSON().with_variant(JSONB, "postgresql"), nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
