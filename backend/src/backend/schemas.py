from pydantic import BaseModel
from typing import Optional

class CheckRequest(BaseModel):
    text: Optional[str] = None
    url: Optional[str] = None
