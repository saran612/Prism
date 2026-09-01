from fastapi import APIRouter
from backend.modules.translation.schemas import (
    DetectLanguageRequest,
    DetectLanguageResponse,
    TranslateRequest,
    TranslateResponse,
)
from backend.modules.translation.services import detect_language, translate_to_english

router = APIRouter(prefix="/translation", tags=["Translation"])


@router.post("/detect", response_model=DetectLanguageResponse)
def detect_lang(request: DetectLanguageRequest):
    lang = detect_language(request.text)
    return DetectLanguageResponse(text=request.text, detected_language=lang)


@router.post("/translate", response_model=TranslateResponse)
def translate_text(request: TranslateRequest):
    source_lang = request.source_language or detect_language(request.text)
    translated = translate_to_english(request.text, source_lang)
    return TranslateResponse(
        original_text=request.text,
        source_language=source_lang,
        target_language=request.target_language,
        translated_text=translated
    )
