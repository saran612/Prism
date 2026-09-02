from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.modules.social.services import (
    extract_instagram_shortcode,
    extract_twitter_post_id,
    extract_facebook_post_id,
    detect_platform,
    fetch_twitter_post,
    fetch_facebook_post,
    fetch_social_post,
)
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


def test_extract_twitter_post_id():
    assert extract_twitter_post_id("https://twitter.com/NASA/status/1894238573928172635") == "1894238573928172635"
    assert extract_twitter_post_id("https://x.com/OpenAI/status/1234567890123456789?s=20") == "1234567890123456789"
    assert extract_twitter_post_id("1894238573928172635") == "1894238573928172635"
    with pytest.raises(ValueError):
        extract_twitter_post_id("https://twitter.com/explore")


def test_extract_facebook_post_id():
    assert extract_facebook_post_id("https://www.facebook.com/username/posts/101584920202020") == "101584920202020"
    assert extract_facebook_post_id("https://www.facebook.com/permalink.php?story_fbid=99887766&id=12345") == "99887766"
    assert extract_facebook_post_id("https://www.facebook.com/share/p/12AbCdEfGh/") == "12AbCdEfGh"
    assert extract_facebook_post_id("https://www.facebook.com/reel/9876543210") == "9876543210"
    assert extract_facebook_post_id("https://fb.watch/mG789xyz/") == "mG789xyz"


def test_detect_platform():
    assert detect_platform("https://www.instagram.com/reel/Co94Pz3A-aD") == "instagram"
    assert detect_platform("https://x.com/user/status/1894238573928172635") == "twitter"
    assert detect_platform("https://twitter.com/user/status/1894238573928172635") == "twitter"
    assert detect_platform("https://www.facebook.com/posts/123456789") == "facebook"
    assert detect_platform("https://fb.watch/mG789xyz/") == "facebook"
    assert detect_platform("https://example.com/some/article") == "unknown"


@pytest.mark.anyio
async def test_fetch_twitter_post_oembed():
    import httpx
    sample_oembed = {
        "html": "<blockquote class=\"twitter-tweet\"><p lang=\"en\" dir=\"ltr\">Mars rover landed successfully on red planet.<br>Historic day!</p>&mdash; NASA (@NASA) <a href=\"https://twitter.com/NASA/status/1234567890123456789\">February 28, 2026</a></blockquote>",
        "author_name": "NASA"
    }
    
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = httpx.Response(status_code=200, json=sample_oembed, request=httpx.Request("GET", "https://publish.twitter.com/oembed"))
        res = await fetch_twitter_post("https://x.com/NASA/status/1234567890123456789")
        assert res["platform"] == "twitter"
        assert res["post_id"] == "1234567890123456789"
        assert "Mars rover landed successfully on red planet." in res["caption"]
        assert res["author"] == "NASA"


@pytest.mark.anyio
async def test_fetch_facebook_post_opengraph():
    import httpx
    sample_html = """
    <html>
      <head>
        <meta property="og:title" content="Verified News Post" />
        <meta property="og:description" content="Official announcement: New clean energy initiative launched worldwide today." />
      </head>
      <body><div>Content</div></body>
    </html>
    """
    
    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = httpx.Response(status_code=200, text=sample_html, request=httpx.Request("GET", "https://facebook.com/post/12345"))
        res = await fetch_facebook_post("https://www.facebook.com/share/p/1234567890/")
        assert res["platform"] == "facebook"
        assert res["post_id"] == "1234567890"
        assert "New clean energy initiative launched worldwide" in res["caption"]


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
    
    with patch("backend.modules.translation.services.GoogleTranslator") as mock_translator:
        mock_instance = mock_translator.return_value
        mock_instance.translate.return_value = "Is the earth flat?"
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


@patch("backend.modules.factcheck.services.fetch_social_caption", new_callable=AsyncMock)
def test_api_check_twitter_url(mock_fetch):
    mock_fetch.return_value = "Scientists discover new water ice deposits on Moon poles."
    response = client.post("/check", json={"url": "https://x.com/NASA/status/1894238573928172635"})
    assert response.status_code == 200
    data = response.json()
    assert "Scientists discover new water ice deposits" in data["text"]
    assert data["detected_language"] == "en"


@patch("backend.modules.factcheck.services.fetch_social_caption", new_callable=AsyncMock)
def test_api_check_facebook_url(mock_fetch):
    mock_fetch.return_value = "Breaking news announcement regarding environmental policies."
    response = client.post("/check", json={"url": "https://www.facebook.com/share/p/101584920202020/"})
    assert response.status_code == 200
    data = response.json()
    assert "Breaking news announcement" in data["text"]


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
