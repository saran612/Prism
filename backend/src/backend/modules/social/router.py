from fastapi import APIRouter, HTTPException, status
from backend.modules.social.schemas import ExtractCaptionRequest, ExtractCaptionResponse
from backend.modules.social.services import fetch_social_post

router = APIRouter(prefix="/social", tags=["Social"])


@router.post("/extract-caption", response_model=ExtractCaptionResponse)
async def extract_caption(request: ExtractCaptionRequest):
    try:
        post_data = await fetch_social_post(request.url)
        return ExtractCaptionResponse(
            url=request.url,
            platform=post_data.get("platform", "unknown"),
            post_id=post_data.get("post_id", ""),
            shortcode=post_data.get("shortcode", post_data.get("post_id", "")),
            caption=post_data.get("caption", ""),
            author=post_data.get("author")
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
