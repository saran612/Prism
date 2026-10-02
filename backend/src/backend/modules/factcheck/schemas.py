from typing import Optional, Any, Literal
from pydantic import BaseModel


class CheckRequest(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None


class CheckResponse(BaseModel):
    state: Literal["True", "False", "Unverified"]
    score: int
    source: Literal["known_factcheck", "llm_inferred"]


class FactCheckHistoryItem(BaseModel):
    id: int
    source_url: Optional[str] = None
    input_text: str
    detected_language: Optional[str] = None
    translated_text: Optional[str] = None
    fact_check_results: Optional[dict[str, Any]] = None
    created_at: Optional[str] = None
    thumbnail_url: Optional[str] = None

