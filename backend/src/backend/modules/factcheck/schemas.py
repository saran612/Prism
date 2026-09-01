from pydantic import BaseModel
from typing import Optional, Any


class CheckRequest(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None


class CheckResponse(BaseModel):
    text: str
    detected_language: str
    translated_text: str
    fact_check_results: dict[str, Any]


class FactCheckHistoryItem(BaseModel):
    id: int
    source_url: Optional[str] = None
    input_text: str
    detected_language: Optional[str] = None
    translated_text: Optional[str] = None
    fact_check_results: Optional[dict[str, Any]] = None
    created_at: Optional[str] = None
