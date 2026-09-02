import re
import html
import logging
from typing import Dict, Any
import httpx

logger = logging.getLogger("prism.social.facebook")

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def extract_facebook_post_id(url: str) -> str:
    """Extracts post/reel/story identifier from a Facebook URL."""
    patterns = [
        r'/posts/([a-zA-Z0-9_\.\-]+)',
        r'/permalink\.php\?[^#]*story_fbid=([a-zA-Z0-9_\.\-]+)',
        r'/share/[pvr]/([a-zA-Z0-9_\.\-]+)',
        r'/reel/([a-zA-Z0-9_\.\-]+)',
        r'/watch/\?[^#]*v=([a-zA-Z0-9_\.\-]+)',
        r'fb\.watch/([a-zA-Z0-9_\.\-]+)',
        r'/videos/([a-zA-Z0-9_\.\-]+)',
        r'/photos/[^/]+/([a-zA-Z0-9_\.\-]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
            
    cleaned = url.strip().strip('/')
    if '/' not in cleaned and len(cleaned) >= 5:
        return cleaned

    # Fallback to last non-empty path segment if it looks like an ID
    path_segments = [seg for seg in cleaned.split('/') if seg and not seg.startswith('?')]
    if path_segments:
        last_seg = path_segments[-1].split('?')[0]
        if last_seg and len(last_seg) >= 4:
            return last_seg

    raise ValueError("Invalid Facebook URL format")


def _clean_facebook_caption(caption: str) -> str:
    """Cleans standard Facebook boilerplate text from OpenGraph descriptions."""
    if not caption:
        return ""
    
    cleaned = caption.strip()
    
    boilerplate_patterns = [
        r"^Log into Facebook.*",
        r"^See more of .* on Facebook",
        r"^Log in or sign up to view",
        r"^Facebook helps you connect and share with the people in your life\.",
    ]
    for bp in boilerplate_patterns:
        if re.search(bp, cleaned, re.IGNORECASE):
            return ""

    social_stat_match = re.match(
        r'^(?:\d+[\w\.,\s]+(?:likes|comments|shares|views)[^\n:]*:\s*)"?(.*?)"?$',
        cleaned,
        re.IGNORECASE | re.DOTALL
    )
    if social_stat_match:
        extracted = social_stat_match.group(1).strip()
        if extracted:
            return extracted

    return cleaned


async def fetch_facebook_post(url: str) -> Dict[str, Any]:
    """Fetches post content and metadata from Facebook via OpenGraph metadata parsing."""
    post_id = extract_facebook_post_id(url)
    
    headers = {
        "User-Agent": (
            "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php) "
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                # Try with standard browser UA
                resp = await client.get(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"})

            html_content = resp.text
            caption = ""
            author = None
            
            # 1. Look for meta property="og:description" or name="description"
            desc_match = re.search(
                r'<meta\s+(?:property|name)=["\'](?:og:description|description)["\']\s+content=["\'](.*?)["\']',
                html_content,
                re.DOTALL | re.IGNORECASE
            ) or re.search(
                r'<meta\s+content=["\'](.*?)["\']\s+(?:property|name)=["\'](?:og:description|description)["\']',
                html_content,
                re.DOTALL | re.IGNORECASE
            )
            
            if desc_match:
                caption = html.unescape(desc_match.group(1))

            # 2. Look for og:title or author
            title_match = re.search(
                r'<meta\s+(?:property|name)=["\']og:title["\']\s+content=["\'](.*?)["\']',
                html_content,
                re.DOTALL | re.IGNORECASE
            )
            if title_match:
                author = html.unescape(title_match.group(1))

            cleaned_caption = _clean_facebook_caption(caption)
            if not cleaned_caption and author and not _clean_facebook_caption(author).startswith("Facebook"):
                cleaned_caption = _clean_facebook_caption(author)

            if cleaned_caption:
                return {
                    "post_id": post_id,
                    "platform": "facebook",
                    "author": author,
                    "caption": cleaned_caption
                }

    except Exception as e:
        logger.error(f"Error fetching Facebook post: {e}")

    raise ValueError("could not fetch post content")
