from typing import Optional, Any, Literal
from pydantic import BaseModel


class CheckRequest(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None


class CheckResponse(BaseModel):
    state: Literal["True", "False", "Unverified"]
    score: int
    source: Literal["known_factcheck", "llm_inferred", "llm_direct_guess"]
    text: Optional[str] = None
    input_text: Optional[str] = None
    detected_language: Optional[str] = None
    translated_text: Optional[str] = None
    thumbnail_url: Optional[str] = None
    author: Optional[str] = None
    source_url: Optional[str] = None
    fact_check_results: Optional[dict[str, Any]] = None
    timings: Optional[dict[str, Any]] = None
    claim: Optional[str] = None
    extracted_claims: Optional[list[str]] = None


class FactCheckHistoryItem(BaseModel):
    id: int
    source_url: Optional[str] = None
    input_text: str
    detected_language: Optional[str] = None
    translated_text: Optional[str] = None
    fact_check_results: Optional[dict[str, Any]] = None
    created_at: Optional[str] = None
    thumbnail_url: Optional[str] = None
    state: Optional[str] = None
    score: Optional[int] = None
    source: Optional[str] = None
    claim: Optional[str] = None
    author: Optional[str] = None
    publisher: Optional[str] = None


class ClaimItem(BaseModel):
    id: int
    claim: str
    text: str
    translated_text: Optional[str] = None
    state: str
    score: int
    source: str
    publisher: Optional[str] = None
    url: Optional[str] = None
    evidence: Optional[list[dict[str, Any]]] = None
    source_url: Optional[str] = None
    detected_language: Optional[str] = None
    thumbnail_url: Optional[str] = None
    author: Optional[str] = None
    created_at: Optional[str] = None

