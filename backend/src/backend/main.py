import logging
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.schemas import CheckRequest
from backend.services.instagram import fetch_instagram_caption
from backend.services.pipeline import detect_language, translate_stub, query_google_fact_check

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Prism API")

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
async def check_claim(request: CheckRequest):
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
    
    return {
        "text": text_to_check,
        "detected_language": detected_lang,
        "translated_text": translated_text,
        "fact_check_results": fact_check_results
    }


