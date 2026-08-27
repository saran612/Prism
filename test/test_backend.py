import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.instagram import extract_instagram_shortcode
from backend.services.pipeline import detect_language, translate_stub

client = TestClient(app)

def test_extract_instagram_shortcode():
    # Test valid URL formats
    assert extract_instagram_shortcode("https://www.instagram.com/p/DF2N8w7M_vN/") == "DF2N8w7M_vN"
    assert extract_instagram_shortcode("https://instagram.com/reel/Co94Pz3A-aD") == "Co94Pz3A-aD"
    assert extract_instagram_shortcode("https://instagram.com/tv/Co94Pz3A-aD/") == "Co94Pz3A-aD"
    
    # Test clean shortcode input
    assert extract_instagram_shortcode("DF2N8w7M_vN") == "DF2N8w7M_vN"
    assert extract_instagram_shortcode(" DF2N8w7M_vN/ ") == "DF2N8w7M_vN"
    
    # Test invalid format
    with pytest.raises(ValueError):
        extract_instagram_shortcode("https://www.google.com")

def test_detect_language():
    # Test English
    assert detect_language("This is a simple text claim verification test.") == "en"
    # Test Hindi (Devanagari script)
    assert detect_language("क्या पृथ्वी सपाट है?") == "hi"
    # Test empty or none inputs
    assert detect_language("") == "unknown"
    assert detect_language("   ") == "unknown"

def test_translate_stub():
    assert translate_stub("test text", "en") == "test text"
    # Hindi "क्या पृथ्वी सपाट है?" should translate to "Is the earth flat?" or similar.
    translated = translate_stub("क्या पृथ्वी सपाट है?", "hi")
    assert "flat" in translated.lower()


def test_api_check_text():
    # Test the API check endpoint with text
    response = client.post("/check", json={"text": "The moon is made of green cheese"})
    assert response.status_code == 200
    data = response.json()
    assert data["text"] == "The moon is made of green cheese"
    assert data["detected_language"] == "en"
    assert data["translated_text"] == "The moon is made of green cheese"
    assert "fact_check_results" in data

def test_api_check_invalid_url():
    # Test the API check endpoint with an invalid/non-existent Instagram URL
    response = client.post("/check", json={"url": "https://www.instagram.com/p/invalid_shortcode_here/"})
    assert response.status_code == 400
    assert response.json() == {"error": "could not fetch post content"}

def test_api_check_missing_fields():
    # Test the API check endpoint with no arguments
    response = client.post("/check", json={})
    assert response.status_code == 400
    assert response.json() == {"error": "Either 'text' or 'url' must be provided."}
