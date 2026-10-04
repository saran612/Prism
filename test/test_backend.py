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
    assert data["state"] in ["True", "False", "Unverified"]
    assert isinstance(data["score"], int)
    assert 0 <= data["score"] <= 100
    assert data["source"] in ["known_factcheck", "llm_inferred"]
    assert {"state", "score", "source"}.issubset(set(data.keys()))


def test_api_check_invalid_url():
    # Test the API check endpoint with an invalid/non-existent Instagram URL
    response = client.post("/check", json={"url": "https://www.instagram.com/p/invalid_shortcode_here/"})
    assert response.status_code == 400
    assert "could not fetch" in response.json().get("error", "").lower()


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
    assert data["state"] in ["True", "False", "Unverified"]
    assert isinstance(data["score"], int)
    assert data["source"] in ["known_factcheck", "llm_inferred"]
    assert {"state", "score", "source"}.issubset(set(data.keys()))


@patch("backend.modules.factcheck.services.fetch_social_caption", new_callable=AsyncMock)
def test_api_check_facebook_url(mock_fetch):
    mock_fetch.return_value = "Breaking news announcement regarding environmental policies."
    response = client.post("/check", json={"url": "https://www.facebook.com/share/p/101584920202020/"})
    assert response.status_code == 200
    data = response.json()
    assert data["state"] in ["True", "False", "Unverified"]
    assert isinstance(data["score"], int)
    assert data["source"] in ["known_factcheck", "llm_inferred"]
    assert {"state", "score", "source"}.issubset(set(data.keys()))


@pytest.mark.anyio
async def test_query_google_fact_check_stub(monkeypatch):
    # Ensure GOOGLE_API_KEY is not set
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    from backend.core.config import get_settings
    monkeypatch.setattr(get_settings(), "GOOGLE_API_KEY", "")
    
    result = await query_google_fact_check("claim to check", "en")
    assert "claims" in result
    assert result["claims"][0]["claimReview"][0]["publisher"]["name"] == "Google Fact Check API (Stub)"
    assert "GOOGLE_API_KEY environment variable is missing" in result["note"]


@pytest.mark.anyio
async def test_query_google_fact_check_api(monkeypatch):
    # Set a dummy API key
    monkeypatch.setenv("GOOGLE_API_KEY", "dummy_key")
    from backend.core.config import get_settings
    monkeypatch.setattr(get_settings(), "GOOGLE_API_KEY", "dummy_key")
    
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


def test_normalize_factcheck_rating():
    from backend.modules.factcheck.services import normalize_factcheck_rating

    # 1. "mostly false", "misleading", "exaggerated" → "False", score 60-75
    state, score = normalize_factcheck_rating("Mostly False")
    assert state == "False" and 60 <= score <= 75

    state, score = normalize_factcheck_rating("Misleading claim")
    assert state == "False" and 60 <= score <= 75

    # 2. "false", "pants on fire", "fabricated", "incorrect" → "False", score 85-100
    state, score = normalize_factcheck_rating("False")
    assert state == "False" and 85 <= score <= 100

    state, score = normalize_factcheck_rating("Pants on Fire!")
    assert state == "False" and 85 <= score <= 100

    # 3. "half true", "mixture", "partly true", "unproven" → "Unverified", score 40-55
    state, score = normalize_factcheck_rating("Half True")
    assert state == "Unverified" and 40 <= score <= 55

    state, score = normalize_factcheck_rating("Partly true")
    assert state == "Unverified" and 40 <= score <= 55

    # 4. "mostly true", "largely true" → "True", score 65-80
    state, score = normalize_factcheck_rating("Mostly True")
    assert state == "True" and 65 <= score <= 80

    # 5. "true", "correct", "accurate" → "True", score 90-100
    state, score = normalize_factcheck_rating("Correct")
    assert state == "True" and 90 <= score <= 100

    state, score = normalize_factcheck_rating("Accurate")
    assert state == "True" and 90 <= score <= 100

    # 6. Unrecognized → "Unverified", score 50
    state, score = normalize_factcheck_rating("Random unmapped text")
    assert state == "Unverified" and score == 50


def test_parse_llm_verdict():
    from backend.modules.factcheck.fallback import parse_llm_verdict

    # Clean JSON
    state, score = parse_llm_verdict('{"state": "True", "score": 90}')
    assert state == "True" and score == 90

    # Markdown wrapped JSON
    state, score = parse_llm_verdict('```json\n{"state": "False", "score": 85}\n```')
    assert state == "False" and score == 85

    # Malformed / Defensive fallback
    state, score = parse_llm_verdict("This is not valid json")
    assert state == "Unverified" and score == 0


@pytest.mark.anyio
async def test_fallback_fact_check_zero_evidence():
    from backend.modules.factcheck.fallback import fallback_fact_check

    with patch("backend.modules.factcheck.fallback.scrape_google_search", new_callable=AsyncMock) as mock_scrape, \
         patch("backend.modules.factcheck.fallback.retrieve_evidence") as mock_retrieve:
        mock_scrape.return_value = []
        mock_retrieve.return_value = ([], 0)
        res = await fallback_fact_check("completely fictional claim")
        assert res["state"] == "Unverified"
        assert res["score"] == 0
        assert res["source"] == "llm_inferred"
        assert res["_internal"]["llm_skipped"] is True


