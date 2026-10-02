from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import get_settings
from backend.core.database import Base, engine
from backend.core.logging import setup_logging, logger
from backend.api.v1.router import api_v1_router
from backend.modules.factcheck.router import router as factcheck_router

settings = get_settings()
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables on application startup
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing database tables: {e}")
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root and health endpoints
@app.get("/")
@app.get("/api/health")
@app.get("/api/v1/health")
def read_root():
    return {
        "message": "Hello from Prism FastAPI backend",
        "version": settings.APP_VERSION,
        "status": "healthy",
        "docs_url": "/docs"
    }

# Mount Top-level factcheck routes for direct backward compatibility (/check, /history)
app.include_router(factcheck_router)

# Mount Modular API Router (/api/v1/...)
app.include_router(api_v1_router)
