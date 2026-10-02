"""Configuration for RAG Fallback Verification in Prism."""

# Curated list of reputable news domains for evidence retrieval
REPUTABLE_DOMAINS = [
    "bbc.com",
    "reuters.com",
    "apnews.com",
    "thehindu.com",
    "ndtv.com",
    "indianexpress.com",
    "aljazeera.com"
]

DEFAULT_SEARCH_TIMEOUT = 4.0  # Max seconds per domain query
MAX_RESULTS_PER_DOMAIN = 2
MAX_TOTAL_EVIDENCE = 10
