import re
import html
import logging
from typing import Dict, Any
import httpx

logger = logging.getLogger("prism.social.twitter")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def extract_twitter_post_id(url: str) -> str:
    """Extracts tweet / post ID from an X or Twitter URL."""
    match = re.search(r'/(?:status|statuses)/(\d+)', url)
    if match:
        return match.group(1)
    
    cleaned = url.strip().strip('/')
    if '/' not in cleaned and re.fullmatch(r'\d{10,22}', cleaned):
        return cleaned
    
    raise ValueError("Invalid Twitter/X URL format")


def _clean_html_text(raw_html: str) -> str:
    """Strips HTML tags, handles breaks, and unescapes entities."""
    # Replace <br>, <p> with newlines/spaces
    text = re.sub(r'<br\s*/?>', '\n', raw_html, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = html.unescape(text)
    # Clean multiple spaces and normalize line breaks
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n\s*\n', '\n', text)
    return text.strip()


async def fetch_twitter_post(url: str) -> Dict[str, Any]:
    """Fetches post content and metadata from X (Twitter) via public endpoints."""
    post_id = extract_twitter_post_id(url)
    canonical_url = f"https://twitter.com/x/status/{post_id}"

    # Method 1: Twitter public oEmbed API
    try:
        oembed_url = f"https://publish.twitter.com/oembed?url={canonical_url}&omit_script=true"
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(oembed_url, headers={"User-Agent": USER_AGENT})
            if resp.status_code == 200:
                data = resp.json()
                raw_html = data.get("html", "")
                author_name = data.get("author_name")
                
                p_match = re.search(r'<p[^>]*>(.*?)</p>', raw_html, re.DOTALL | re.IGNORECASE)
                if p_match:
                    caption = _clean_html_text(p_match.group(1))
                else:
                    caption = _clean_html_text(raw_html)

                if caption:
                    return {
                        "post_id": post_id,
                        "platform": "twitter",
                        "author": author_name,
                        "caption": caption,
                        "thumbnail_url": None
                    }
    except Exception as e:
        logger.debug(f"Twitter oEmbed failed, trying fallback: {e}")

    # Method 2: FxTwitter API fallback
    try:
        fxtwitter_url = f"https://api.fxtwitter.com/status/{post_id}"
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(fxtwitter_url, headers={"User-Agent": USER_AGENT})
            if resp.status_code == 200:
                data = resp.json()
                tweet = data.get("tweet", {})
                caption = tweet.get("text", "")
                author = tweet.get("author", {}).get("name")
                media = tweet.get("media", {})
                photos = media.get("photos", []) if isinstance(media, dict) else []
                videos = media.get("videos", []) if isinstance(media, dict) else []
                thumbnail_url = None
                if photos and isinstance(photos, list) and len(photos) > 0:
                    thumbnail_url = photos[0].get("url")
                elif videos and isinstance(videos, list) and len(videos) > 0:
                    thumbnail_url = videos[0].get("thumbnail_url")

                if caption:
                    return {
                        "post_id": post_id,
                        "platform": "twitter",
                        "author": author,
                        "caption": caption,
                        "thumbnail_url": thumbnail_url
                    }
    except Exception as e:
        logger.debug(f"FxTwitter API failed: {e}")

    logger.error(f"Error fetching Twitter/X post for URL: {url}")
    raise ValueError("could not fetch post content")
