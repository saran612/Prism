import re
import logging
from typing import Dict, Any
import anyio
import anyio.to_thread
import instaloader

logger = logging.getLogger("prism.social.instagram")


def extract_instagram_shortcode(url: str) -> str:
    """Extracts shortcode from an Instagram post, reel, or TV URL."""
    match = re.search(r'/(?:p|reel|tv)/([A-Za-z0-9-_]+)', url)
    if match:
        return match.group(1)
    
    # Fallback: if it's already a clean shortcode (8 to 15 characters of base64url)
    cleaned = url.strip().strip('/')
    if '/' not in cleaned and 8 <= len(cleaned) <= 15:
        return cleaned
    
    raise ValueError("Invalid Instagram URL format")


def fetch_instagram_data_sync(shortcode: str) -> Dict[str, Any]:
    """Synchronous fetch of Instagram post data (caption, thumbnail_url, author) using Instaloader."""
    loader = instaloader.Instaloader()
    post = instaloader.Post.from_shortcode(loader.context, shortcode)
    return {
        "caption": post.caption if post.caption else "",
        "thumbnail_url": getattr(post, "url", None),
        "author": getattr(post, "owner_username", None),
    }


def fetch_instagram_caption_sync(shortcode: str) -> str:
    """Synchronous fetch of Instagram post caption using Instaloader."""
    data = fetch_instagram_data_sync(shortcode)
    return data.get("caption", "")


async def fetch_instagram_caption(url: str) -> str:
    """Asynchronously calls the sync Instaloader function in a threadpool."""
    try:
        shortcode = extract_instagram_shortcode(url)
        data = await anyio.to_thread.run_sync(fetch_instagram_data_sync, shortcode)
        return data.get("caption", "")
    except Exception as e:
        logger.error(f"Error fetching Instagram post: {e}")
        raise ValueError(f"Could not fetch Instagram post: {e}")


async def fetch_instagram_post(url: str) -> Dict[str, Any]:
    """Fetches full post metadata dictionary for Instagram including thumbnail_url."""
    try:
        shortcode = extract_instagram_shortcode(url)
        data = await anyio.to_thread.run_sync(fetch_instagram_data_sync, shortcode)
        return {
            "platform": "instagram",
            "post_id": shortcode,
            "shortcode": shortcode,
            "caption": data.get("caption", ""),
            "author": data.get("author"),
            "thumbnail_url": data.get("thumbnail_url"),
        }
    except Exception as e:
        logger.error(f"Error fetching Instagram post: {e}")
        raise ValueError(f"Could not fetch Instagram post: {e}")

