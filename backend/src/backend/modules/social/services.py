import re
import logging
from typing import Dict, Any

from backend.modules.social.instagram import (
    extract_instagram_shortcode,
    fetch_instagram_caption_sync,
    fetch_instagram_caption,
    fetch_instagram_post,
)
from backend.modules.social.twitter import (
    extract_twitter_post_id,
    fetch_twitter_post,
)
from backend.modules.social.facebook import (
    extract_facebook_post_id,
    fetch_facebook_post,
)

logger = logging.getLogger("prism.social")


def detect_platform(url: str) -> str:
    """Detects social platform from URL."""
    cleaned = url.lower()
    if "instagram.com" in cleaned or "instagr.am" in cleaned:
        return "instagram"
    if "twitter.com" in cleaned or "x.com" in cleaned:
        return "twitter"
    if "facebook.com" in cleaned or "fb.com" in cleaned or "fb.watch" in cleaned:
        return "facebook"
    
    # Fallback heuristics for shortcodes or numeric IDs
    if re.fullmatch(r"[A-Za-z0-9-_]{8,15}", url.strip()):
        return "instagram"
    if re.fullmatch(r"\d{10,22}", url.strip()):
        return "twitter"

    return "unknown"


async def fetch_social_post(url: str) -> Dict[str, Any]:
    """Extracts post content, platform name, and ID across supported social networks."""
    platform = detect_platform(url)
    
    if platform == "instagram":
        return await fetch_instagram_post(url)
    elif platform == "twitter":
        post_data = await fetch_twitter_post(url)
        post_data["shortcode"] = post_data["post_id"]
        return post_data
    elif platform == "facebook":
        post_data = await fetch_facebook_post(url)
        post_data["shortcode"] = post_data["post_id"]
        return post_data
    else:
        raise ValueError(f"Unsupported social media platform or invalid URL: {url}")


async def fetch_social_caption(url: str) -> str:
    """Convenience helper to extract post caption string across Instagram, Twitter/X, and Facebook."""
    result = await fetch_social_post(url)
    return result.get("caption", "")


# Re-exports for backward compatibility
__all__ = [
    "detect_platform",
    "extract_instagram_shortcode",
    "fetch_instagram_caption_sync",
    "fetch_instagram_caption",
    "fetch_instagram_post",
    "extract_twitter_post_id",
    "fetch_twitter_post",
    "extract_facebook_post_id",
    "fetch_facebook_post",
    "fetch_social_post",
    "fetch_social_caption",
]
