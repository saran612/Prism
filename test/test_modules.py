import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.modules.social import extract_instagram_shortcode
from backend.modules.translation import detect_language, translate_to_english

client = TestClient(app)


def test_modular_social_extract_shortcode():
    assert extract_instagram_shortcode("https://www.instagram.com/p/DF2N8w7M_vN/") == "DF2N8w7M_vN"
    assert extract_instagram_shortcode("https://instagram.com/reel/Co94Pz3A-aD") == "Co94Pz3A-aD"


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
