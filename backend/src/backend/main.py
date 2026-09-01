import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv, find_dotenv

# Load environment variables from .env file
load_dotenv(find_dotenv())

from fastapi import FastAPI, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.database import Base, engine, get_db
from backend.models import FactCheckRecord
from backend.schemas import CheckRequest
from backend.services.instagram import fetch_instagram_caption
from backend.services.pipeline import detect_language, translate_stub
from backend.services.factcheck import query_google_fact_check

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Automatically create tables if they don't exist
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing database tables: {e}")
    yield


app = FastAPI(title="Prism API", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Hello from Prism FastAPI backend"}


@app.post("/check")
async def check_claim(request: CheckRequest, db: Session = Depends(get_db)):
    # Determine the text to check
    if request.url:
        try:
            logger.info(f"Fetching Instagram post caption from: {request.url}")
            text_to_check = await fetch_instagram_caption(request.url)
        except ValueError:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"error": "could not fetch post content"}
            )
    elif request.text:
        text_to_check = request.text
    else:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"error": "Either 'text' or 'url' must be provided."}
        )
    
    # 1. Language detect
    detected_lang = detect_language(text_to_check)
    
    # 2. Translate stub
    translated_text = translate_stub(text_to_check, detected_lang)
    
    # 3. Google Fact Check API search
    fact_check_results = await query_google_fact_check(translated_text, detected_lang)
    
    response_payload = {
        "text": text_to_check,
        "detected_language": detected_lang,
        "translated_text": translated_text,
        "fact_check_results": fact_check_results
    }

    # Save to PostgreSQL database
    try:
        db_record = FactCheckRecord(
            source_url=request.url,
            input_text=text_to_check,
            detected_language=detected_lang,
            translated_text=translated_text,
            fact_check_results=fact_check_results,
            response_payload=response_payload
        )
        db.add(db_record)
        db.commit()
        db.refresh(db_record)
        logger.info(f"Saved fact-check record id={db_record.id} to PostgreSQL database.")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to persist fact check record to database: {e}")

    return response_payload


@app.get("/history")
def get_history(limit: int = 50, db: Session = Depends(get_db)):
    records = db.query(FactCheckRecord).order_by(FactCheckRecord.created_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "source_url": r.source_url,
            "input_text": r.input_text,
            "detected_language": r.detected_language,
            "translated_text": r.translated_text,
            "fact_check_results": r.fact_check_results,
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in records
    ]
