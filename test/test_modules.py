import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from backend.main import app
from backend.modules.social import (
    extract_instagram_shortcode,
    extract_twitter_post_id,
    extract_facebook_post_id,
    detect_platform,
)
from backend.modules.translation import detect_language, translate_to_english

client = TestClient(app)


def test_modular_social_extract_shortcode():
    assert extract_instagram_shortcode("https://www.instagram.com/p/DF2N8w7M_vN/") == "DF2N8w7M_vN"
    assert extract_instagram_shortcode("https://instagram.com/reel/Co94Pz3A-aD") == "Co94Pz3A-aD"


def test_modular_social_extract_twitter_and_facebook_ids():
    assert extract_twitter_post_id("https://x.com/user/status/1894238573928172635") == "1894238573928172635"
    assert extract_twitter_post_id("https://twitter.com/elonmusk/status/1234567890123456789") == "1234567890123456789"
    assert extract_facebook_post_id("https://www.facebook.com/zuck/posts/101148888998822") == "101148888998822"
    assert extract_facebook_post_id("https://fb.watch/xyz12345/") == "xyz12345"


def test_modular_social_detect_platform():
    assert detect_platform("https://www.instagram.com/p/DF2N8w7M_vN/") == "instagram"
    assert detect_platform("https://x.com/user/status/1894238573928172635") == "twitter"
    assert detect_platform("https://twitter.com/user/status/1894238573928172635") == "twitter"
    assert detect_platform("https://www.facebook.com/posts/123456789") == "facebook"


@patch("backend.modules.social.router.fetch_social_post", new_callable=AsyncMock)
def test_modular_social_extract_caption_endpoint(mock_fetch):
    mock_fetch.return_value = {
        "platform": "twitter",
        "post_id": "1894238573928172635",
        "shortcode": "1894238573928172635",
        "caption": "This is an extracted tweet from X!",
        "author": "SampleUser"
    }
    res = client.post("/api/v1/social/extract-caption", json={"url": "https://x.com/user/status/1894238573928172635"})
    assert res.status_code == 200
    data = res.json()
    assert data["platform"] == "twitter"
    assert data["post_id"] == "1894238573928172635"
    assert data["caption"] == "This is an extracted tweet from X!"
    assert data["author"] == "SampleUser"


def test_modular_translation_detect():
    res = client.post("/api/v1/translation/detect", json={"text": "Hello world this is english"})
    assert res.status_code == 200
    assert res.json()["detected_language"] == "en"


def test_modular_translation_translate():
    res = client.post("/api/v1/translation/translate", json={"text": "test sentence", "source_language": "en"})
    assert res.status_code == 200
    assert res.json()["translated_text"] == "test sentence"


def test_modular_factcheck_api():
    res = client.post("/api/v1/check", json={"text": "Verified claim text for modular test"})
    assert res.status_code == 200
    assert "fact_check_results" in res.json()


def test_modular_history_api():
    res = client.get("/api/v1/history")
    assert res.status_code == 200
    assert isinstance(res.json(), list)
