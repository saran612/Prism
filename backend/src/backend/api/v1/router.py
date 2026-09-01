from fastapi import APIRouter

from backend.modules.factcheck.router import router as factcheck_router
from backend.modules.social.router import router as social_router
from backend.modules.translation.router import router as translation_router

api_v1_router = APIRouter(prefix="/api/v1")

# Include module routers in v1 API
api_v1_router.include_router(factcheck_router)
api_v1_router.include_router(social_router)
api_v1_router.include_router(translation_router)
