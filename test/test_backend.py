import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.modules.social.services import extract_instagram_shortcode
from backend.modules.translation.services import detect_language, translate_stub
from backend.modules.factcheck.services import query_google_fact_check

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
    response = client.post("/check", json={"text": "This is a simple english sentence to verify the fact checking API."})
    assert response.status_code == 200
    data = response.json()
    assert "This is a simple english sentence" in data["text"]
    assert data["detected_language"] == "en"
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


@pytest.mark.anyio
async def test_query_google_fact_check_stub(monkeypatch):
    # Ensure GOOGLE_API_KEY is not set
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    
    result = await query_google_fact_check("claim to check", "en")
    assert "claims" in result
    assert result["claims"][0]["claimReview"][0]["publisher"]["name"] == "Google Fact Check API (Stub)"
    assert "GOOGLE_API_KEY environment variable is missing" in result["note"]


@pytest.mark.anyio
async def test_query_google_fact_check_api(monkeypatch):
    # Set a dummy API key
    monkeypatch.setenv("GOOGLE_API_KEY", "dummy_key")
    
    import httpx
    from unittest.mock import AsyncMock, patch
    
    request = httpx.Request("GET", "https://factchecktools.googleapis.com/v1alpha1/claims:search")
    mock_response = httpx.Response(status_code=200, json={"claims": [{"text": "verified claim"}]}, request=request)
    
    # Patch httpx.AsyncClient.get
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = mock_response
        result = await query_google_fact_check("verified claim", "en")
        mock_get.assert_called_once()
        assert result == {"claims": [{"text": "verified claim"}]}
        
        # Verify params sent
        called_args, called_kwargs = mock_get.call_args
        assert called_kwargs["params"]["query"] == "verified claim"
        assert called_kwargs["params"]["key"] == "dummy_key"
        assert called_kwargs["params"]["languageCode"] == "en"


def test_api_history():
    response = client.get("/history")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "input_text" in data[0]
    assert "response_payload" not in data[0] or "created_at" in data[0]

