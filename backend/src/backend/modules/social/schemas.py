from pydantic import BaseModel, HttpUrl
from typing import Optional


class ExtractCaptionRequest(BaseModel):
    url: str


class ExtractCaptionResponse(BaseModel):
    url: str
    shortcode: str
    caption: str
