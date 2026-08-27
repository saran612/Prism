import re
import logging
import anyio
import instaloader

logger = logging.getLogger(__name__)

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

def fetch_instagram_caption_sync(shortcode: str) -> str:
    """Synchronous fetch of Instagram post caption using Instaloader."""
    L = instaloader.Instaloader()
    post = instaloader.Post.from_shortcode(L.context, shortcode)
    return post.caption if post.caption else ""

async def fetch_instagram_caption(url: str) -> str:
    """Asynchronously calls the sync Instaloader function in a threadpool."""
    try:
        shortcode = extract_instagram_shortcode(url)
        # Run blocking Instaloader call in a thread pool to avoid blocking the event loop
        caption = await anyio.to_thread.run_sync(fetch_instagram_caption_sync, shortcode)
        return caption
    except Exception as e:
        logger.error(f"Error fetching Instagram post: {e}")
        raise ValueError("could not fetch post content")
