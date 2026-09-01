from pydantic import BaseModel
from typing import Optional


class DetectLanguageRequest(BaseModel):
    text: str


class DetectLanguageResponse(BaseModel):
    text: str
    detected_language: str


class TranslateRequest(BaseModel):
    text: str
    source_language: Optional[str] = None
    target_language: str = "en"


class TranslateResponse(BaseModel):
    original_text: str
    source_language: str
    target_language: str
    translated_text: str
