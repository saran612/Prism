from fastapi import APIRouter, HTTPException, status
from backend.modules.social.schemas import ExtractCaptionRequest, ExtractCaptionResponse
from backend.modules.social.services import fetch_instagram_caption, extract_instagram_shortcode

router = APIRouter(prefix="/social", tags=["Social"])


@router.post("/extract-caption", response_model=ExtractCaptionResponse)
async def extract_caption(request: ExtractCaptionRequest):
    try:
        shortcode = extract_instagram_shortcode(request.url)
        caption = await fetch_instagram_caption(request.url)
        return ExtractCaptionResponse(
            url=request.url,
            shortcode=shortcode,
            caption=caption
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
