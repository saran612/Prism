from pydantic import BaseModel
from typing import Optional


class ExtractCaptionRequest(BaseModel):
    url: str


class ExtractCaptionResponse(BaseModel):
    url: str
    platform: str
    post_id: str
    shortcode: Optional[str] = None
    caption: str
    author: Optional[str] = None
