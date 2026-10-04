import json
import logging
import re
import time
from typing import List, Dict, Tuple, Optional

try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS  # type: ignore

from backend.core.fallback_config import (
    REPUTABLE_DOMAINS,
    DEFAULT_SEARCH_TIMEOUT,
    MAX_RESULTS_PER_DOMAIN,
    MAX_TOTAL_EVIDENCE,
)

logger = logging.getLogger("prism.factcheck.fallback")


import re

STOPWORDS = {
    'about', 'above', 'after', 'again', 'against', 'all', 'also', 'and', 'any', 'are',
    'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
    'could', 'did', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
    'further', 'had', 'has', 'have', 'having', 'her', 'here', 'hers', 'herself', 'him',
    'himself', 'his', 'how', 'into', 'its', 'itself', 'just', 'more', 'most', 'myself',
    'nor', 'not', 'now', 'off', 'once', 'only', 'other', 'our', 'ours', 'ourselves',
    'out', 'over', 'own', 'same', 'she', 'should', 'some', 'such', 'than', 'that',
    'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
    'this', 'those', 'through', 'too', 'under', 'until', 'very', 'was', 'were', 'what',
    'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'you',
    'your', 'yours'
}


def _is_relevant(claim: str, title: str, snippet: str) -> bool:
    """Check if title or snippet matches core keywords of the claim."""
    tokens = [re.sub(r'\W+', '', w.lower()) for w in claim.split()]
    keywords = [w for w in tokens if len(w) >= 3 and not w.isdigit() and w not in STOPWORDS]
    if not keywords:
        return True
    combined_text = f"{title} {snippet}".lower()
    matches = sum(1 for kw in keywords if kw in combined_text)
    min_required = min(len(keywords), max(2, (len(keywords) + 1) // 2))
    return matches >= min_required


def _extract_domain_from_url(url: str) -> str:
    """Extract clean domain name from URL."""
    try:
        import urllib.parse
        parsed = urllib.parse.urlparse(url)
        netloc = parsed.netloc.lower()
        if netloc.startswith("www."):
            netloc = netloc[4:]
        return netloc
    except Exception:
        return ""


async def scrape_google_search(query: str, max_results: int = 8, timeout: float = 12.0) -> List[Dict[str, str]]:
    """
    Direct web search evidence scraper via Jina AI reader (r.jina.ai).
    1. Attempts Google search via r.jina.ai/https://www.google.com/search?q=<query>.
    2. If Google search serves a CAPTCHA/bot challenge or returns empty,
       immediately queries r.jina.ai/https://html.duckduckgo.com/html/?q=<query>,
       which reliably yields complete organic search results with snippets.
    Returns:
        List of dicts: [{"domain": ..., "title": ..., "url": ..., "snippet": ...}]
    """
    import urllib.parse
    import httpx
    import re

    clean_query = query.strip()
    if not clean_query:
        return []

    encoded_query = urllib.parse.quote_plus(clean_query)
    t0 = time.perf_counter()

    headers = {
        "User-Agent": "PrismFactCheck/1.0",
        "Accept": "text/plain, text/markdown, */*",
    }

    results: List[Dict[str, str]] = []

    # --- ATTEMPT 1: Google Search via r.jina.ai ---
    google_target = f"https://r.jina.ai/https://www.google.com/search?q={encoded_query}"
    logger.info(f"[JINA_SEARCH] Requesting Google search via r.jina.ai for: '{clean_query[:70]}...'")
    print(f"[JINA_SEARCH] Requesting Google search via r.jina.ai for: '{clean_query[:70]}...'", flush=True)

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
            resp = await client.get(google_target)
            body_text = resp.text if resp.status_code == 200 else ""
            is_captcha = (
                "unusual traffic from your computer network" in body_text.lower()
                or "warning: this page maybe requiring captcha" in body_text.lower()
                or len(body_text) < 1500
            )

            if not is_captcha and body_text:
                lines = body_text.split("\n")
                seen_titles = set()
                for i, line in enumerate(lines):
                    if line.startswith("### [") or line.startswith("# ["):
                        m = re.search(r"\[(.*?)\]\((https?://.*?)\)", line)
                        if not m:
                            continue
                        title_part = m.group(1)
                        raw_url = m.group(2)
                        if "gstatic.com" in raw_url or "google.com/search" in raw_url:
                            continue

                        url_match = re.search(r"(https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[^\s\)\]]*)?)", title_part)
                        clean_url = url_match.group(1) if url_match else raw_url

                        clean_title = re.sub(r"!\[[^\]]*\]\(.*?\)", "", title_part)
                        clean_title = re.sub(r"https://\S+", "", clean_title)
                        clean_title = re.sub(r"\s+", " ", clean_title).strip()

                        title_key = clean_title.lower()[:40]
                        if not title_key or title_key in seen_titles:
                            continue
                        seen_titles.add(title_key)

                        domain = _extract_domain_from_url(clean_url)
                        if not domain and "google.com" in clean_url:
                            source_match = re.search(r"\b(The Hindu|BBC|Indian Express|NDTV|Hindustan Times|Al Jazeera|Reuters|ThePrint|Brut|DW|ET Now)\b", clean_title, re.IGNORECASE)
                            domain = source_match.group(1).lower().replace(" ", "") + ".com" if source_match else "news"

                        snippet_lines = []
                        for next_line in lines[i + 1:i + 8]:
                            if next_line.startswith("#") or next_line.startswith("###"):
                                break
                            s_strip = next_line.strip()
                            if s_strip and not s_strip.startswith("![Image") and not s_strip.startswith("http"):
                                snippet_lines.append(s_strip)
                        snippet = " ".join(snippet_lines)

                        results.append({
                            "domain": domain,
                            "url": clean_url,
                            "title": clean_title,
                            "snippet": snippet
                        })
                        if len(results) >= max_results:
                            break

                if results:
                    t_elapsed = time.perf_counter() - t0
                    logger.info(f"[JINA_SEARCH] Extracted {len(results)} results via Google in {t_elapsed:.2f}s.")
                    print(f"[JINA_SEARCH] Extracted {len(results)} results via Google in {t_elapsed:.2f}s.", flush=True)
                    return results

    except Exception as g_err:
        logger.warning(f"[JINA_SEARCH] Google attempt failed: {g_err}. Trying DDG fallback.")
        print(f"[JINA_SEARCH] Google attempt failed: {g_err}. Trying DDG fallback.", flush=True)

    # --- ATTEMPT 2: DuckDuckGo HTML via r.jina.ai (Guaranteed unblocked organic news results) ---
    ddg_target = f"https://r.jina.ai/https://html.duckduckgo.com/html/?q={encoded_query}"
    logger.info(f"[JINA_SEARCH] Querying DuckDuckGo HTML via r.jina.ai for: '{clean_query[:70]}...'")
    print(f"[JINA_SEARCH] Querying DuckDuckGo HTML via r.jina.ai for: '{clean_query[:70]}...'", flush=True)

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
            resp = await client.get(ddg_target)
            if resp.status_code == 200 and resp.text:
                lines = resp.text.split("\n")
                seen_urls = set()

                for i, line in enumerate(lines):
                    if line.startswith("## ["):
                        m = re.search(r"##\s*\[(.*?)\]\((https://duckduckgo\.com/l/\?uddg=[^\)]+)\)", line)
                        if not m:
                            continue
                        title = m.group(1).strip()
                        raw_url = m.group(2)
                        uddg_m = re.search(r"uddg=([^&]+)", raw_url)
                        clean_url = urllib.parse.unquote(uddg_m.group(1)) if uddg_m else raw_url

                        if clean_url in seen_urls:
                            continue
                        seen_urls.add(clean_url)

                        snippet_lines = []
                        for next_l in lines[i + 1:i + 8]:
                            if next_l.startswith("## [") or next_l.startswith("# ["):
                                break
                            s = next_l.strip()
                            link_snippet_m = re.search(r"^\[(.*?)\]\(https?://", s)
                            if link_snippet_m:
                                s = link_snippet_m.group(1)
                            if s and not s.startswith("http") and not s.startswith("[![Image") and not s.startswith("](") and not s.startswith("Feedback"):
                                s_clean = re.sub(r"[*_`]", "", s).strip()
                                if len(s_clean) > 20:
                                    snippet_lines.append(s_clean)
                        snippet = " ".join(snippet_lines)

                        domain = _extract_domain_from_url(clean_url)
                        title_clean = re.sub(r"[*_`]", "", title).strip()

                        results.append({
                            "domain": domain,
                            "title": title_clean,
                            "url": clean_url,
                            "snippet": snippet
                        })

                        if len(results) >= max_results:
                            break

                t_elapsed = time.perf_counter() - t0
                if results:
                    logger.info(f"[JINA_SEARCH] Extracted {len(results)} results via DDG/Jina in {t_elapsed:.2f}s.")
                    print(f"[JINA_SEARCH] Extracted {len(results)} results via DDG/Jina in {t_elapsed:.2f}s.", flush=True)
                    return results

    except Exception as d_err:
        logger.warning(f"[JINA_SEARCH] DDG/Jina attempt failed: {d_err}.")
        print(f"[JINA_SEARCH] DDG/Jina attempt failed: {d_err}.", flush=True)

    return results


def retrieve_evidence(
    claim_text: str,
    domains: Optional[List[str]] = None,
    max_per_domain: int = MAX_RESULTS_PER_DOMAIN,
    total_cap: int = MAX_TOTAL_EVIDENCE,
    timeout: float = DEFAULT_SEARCH_TIMEOUT,
) -> Tuple[List[Dict[str, str]], int]:
    """
    Retrieve evidence from reputable news domains using duckduckgo search.

    Args:
        claim_text: Claim or statement to search evidence for.
        domains: Allowlist of reputable news domains.
        max_per_domain: Maximum results to retrieve per domain.
        total_cap: Cap on total evidence snippets to keep LLM context small.
        timeout: Timeout in seconds per domain query.

    Returns:
        tuple of (evidence_list, corroboration_count)
        where evidence_list is a list of dicts with keys: domain, url, title, snippet.
        If zero results across all domains, returns ([], 0).
    """
    target_domains = domains or REPUTABLE_DOMAINS
    clean_claim = claim_text.strip().replace("\n", " ")

    if not clean_claim:
        logger.warning("Empty claim text provided to retrieve_evidence.")
        return [], 0

    evidence_list: List[Dict[str, str]] = []
    seen_urls = set()
    corroborating_domains = set()
    zero_result_domains = 0

    logger.info(f"Retrieving evidence across {len(target_domains)} domains in parallel for: '{clean_claim[:80]}...'")

    def _query_domain(domain: str) -> Tuple[str, List[Dict[str, str]]]:
        domain_query = f"{clean_claim} site:{domain}"
        found: List[Dict[str, str]] = []
        max_attempts = 2  # 1 initial try + 1 retry for transient rate limits
        for attempt in range(1, max_attempts + 1):
            found = []
            raw_list = []
            try:
                ddgs = DDGS(timeout=int(timeout))
                raw_results = ddgs.text(domain_query, max_results=max_per_domain * 2)
                raw_list = list(raw_results) if raw_results else []
                for item in raw_list:
                    url = (item.get("href") or item.get("url") or "").strip()
                    if not url:
                        continue
                    snippet = (item.get("body") or item.get("snippet") or "").strip()
                    title = (item.get("title") or "").strip()

                    if not _is_relevant(clean_claim, title, snippet):
                        continue

                    found.append({
                        "domain": domain,
                        "url": url,
                        "title": title,
                        "snippet": snippet,
                    })
                    if len(found) >= max_per_domain:
                        break

                log_line = f"[DOMAIN QUERY] query='{domain_query}' | results={len(found)} (raw={len(raw_list)})"
                logger.info(log_line)
                print(log_line, flush=True)
                return domain, found

            except Exception as e:
                err_msg = str(e)
                # Specific retry for "No results found" or transient rate limits on attempt 1
                is_transient = (
                    "No results found" in err_msg
                    or "202" in err_msg
                    or "429" in err_msg
                    or "rate limit" in err_msg.lower()
                )
                if attempt < max_attempts and is_transient:
                    retry_wait = 1.5
                    retry_log = (
                        f"[DOMAIN RETRY] query='{domain_query}' | transient='{type(e).__name__}: {err_msg}' | "
                        f"retrying in {retry_wait}s (attempt {attempt}/{max_attempts})..."
                    )
                    logger.warning(retry_log)
                    print(retry_log, flush=True)
                    time.sleep(retry_wait)
                    continue

                # Final attempt failure
                err_line = f"[DOMAIN QUERY] query='{domain_query}' | exception={type(e).__name__}: {e}"
                logger.error(err_line)
                print(err_line, flush=True)
                return domain, found

        return domain, found

    from concurrent.futures import ThreadPoolExecutor, as_completed

    batch_size = 2  # Bounded concurrency: max 2 concurrent requests
    batches = [target_domains[i:i + batch_size] for i in range(0, len(target_domains), batch_size)]

    for batch_idx, batch in enumerate(batches):
        if batch_idx > 0:
            time.sleep(0.3)  # Brief delay between batches

        with ThreadPoolExecutor(max_workers=len(batch)) as executor:
            future_to_domain = {
                executor.submit(_query_domain, domain): domain for domain in batch
            }
            for future in as_completed(future_to_domain):
                domain, results = future.result()
                if results:
                    corroborating_domains.add(domain)
                    for item in results:
                        if item["url"] not in seen_urls and len(evidence_list) < total_cap:
                            seen_urls.add(item["url"])
                            evidence_list.append(item)
                else:
                    zero_result_domains += 1

    corroboration_count = len(corroborating_domains)

    logger.info(
        f"Evidence retrieval finished: {len(evidence_list)} snippet(s) from "
        f"{corroboration_count} distinct domain(s). {zero_result_domains}/{len(target_domains)} "
        f"domains returned zero results."
    )

    if not evidence_list:
        return [], 0

    return evidence_list, corroboration_count


LLM_SYSTEM_PROMPT = """You are an objective, rigorous fact-checking assistant. Your job is to evaluate the veracity of a user's claim strictly based on the provided evidence snippets from web and news reports.

CRITICAL RULES:
1. Base your verdict strictly on the facts, events, and context described in the provided evidence snippets.
2. SUBSTANTIAL ACCURACY: If the provided evidence confirms the core factual assertion, individuals, event, actions, or circumstances described in the claim (even if the user's wording has slight spelling variations or paraphrasing, e.g. "Captain Smith" vs "Captain Smit Machchhar", or general day count), output state "True" with confidence score 75-100.
3. CONTRADICTION / HOAX: If the provided evidence directly disproves, debunks, or contradicts the claim, output state "False" with confidence score 75-100.
4. INSUFFICIENT / UNRELATED: Only output state "Unverified" (score 0-45) if the provided evidence does not mention or address the events or people in the claim at all.
5. Output STRICT JSON ONLY, exactly two keys, no markdown blocks, no commentary:
{"state": "True" | "False" | "Unverified", "score": <integer 0-100>}"""


def parse_llm_verdict(raw_text: str) -> Tuple[str, int]:
    """Defensively parse LLM response into (state, score)."""
    try:
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        match = re.search(r"\{.*?\}", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(0)

        import json
        data = json.loads(cleaned)

        raw_state = str(data.get("state", "")).strip().capitalize()
        if raw_state not in ("True", "False", "Unverified"):
            logger.warning(f"Unrecognized state '{raw_state}' from LLM. Defaulting to Unverified.")
            return "Unverified", 0

        score = int(data.get("score", 0))
        score = max(0, min(100, score))
        return raw_state, score
    except Exception as e:
        logger.error(f"Defensive JSON parse failed for LLM response: {e} (raw='{raw_text}')")
        return "Unverified", 0


async def generate_llm_verdict(claim_text: str, evidence: List[Dict[str, str]]) -> Tuple[str, int, str]:
    """
    Call Gemini API (or Claude fallback) to evaluate claim strictly from evidence snippets.
    Returns (state, score, raw_response_text).
    """
    import os
    import httpx
    from backend.core.config import get_settings

    settings = get_settings()

    # Format evidence snippets
    formatted_snippets = []
    for idx, item in enumerate(evidence, 1):
        formatted_snippets.append(
            f"[{idx}] Source: {item['domain']}\n"
            f"    Title: {item.get('title', '')}\n"
            f"    URL: {item['url']}\n"
            f"    Snippet: {item['snippet']}"
        )
    evidence_text = "\n\n".join(formatted_snippets)

    user_prompt = (
        f"Claim to evaluate:\n\"{claim_text}\"\n\n"
        f"Retrieved Evidence:\n{evidence_text}\n\n"
        f"Evaluate the claim strictly based on the evidence above. Output JSON with exactly 'state' and 'score'."
    )

    logger.info(f"[FALLBACK LLM] Sending {len(evidence)} evidence snippet(s) to evaluator for claim: '{claim_text[:60]}...'")

    gemini_key = getattr(settings, "GEMINI_API_KEY", None) or os.environ.get("GEMINI_API_KEY")
    candidate_models = [
        getattr(settings, "GEMINI_MODEL", None) or os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite"),
        "gemini-2.5-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-2.5-flash",
    ]
    models_to_try = []
    for m in candidate_models:
        if m and m not in models_to_try:
            models_to_try.append(m)

    # 1. Primary Evaluator: Google Gemini API
    if gemini_key:
        payload = {
            "systemInstruction": {
                "parts": [{"text": LLM_SYSTEM_PROMPT}]
            },
            "contents": [{
                "parts": [{"text": user_prompt}]
            }],
            "generationConfig": {
                "temperature": 0.0,
                "responseMimeType": "application/json"
            }
        }

        for gemini_model in models_to_try:
            try:
                logger.info(f"[FALLBACK GEMINI] Calling Gemini API ({gemini_model}) for claim: '{claim_text[:60]}...'")
                print(f"[FALLBACK GEMINI] Calling Gemini API ({gemini_model}) for claim: '{claim_text[:60]}...'", flush=True)

                url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}"
                async with httpx.AsyncClient(timeout=15.0) as client:
                    res = await client.post(url, json=payload)
                    if res.status_code == 200:
                        data = res.json()
                        candidates = data.get("candidates", [])
                        if candidates and "content" in candidates[0]:
                            parts = candidates[0]["content"].get("parts", [])
                            if parts and "text" in parts[0]:
                                raw_text = parts[0]["text"].strip()
                                logger.info(f"[FALLBACK GEMINI RAW] Raw model response ({gemini_model}): '{raw_text}'")
                                print(f"[FALLBACK GEMINI RAW] Raw model response ({gemini_model}): '{raw_text}'", flush=True)
                                state, score = parse_llm_verdict(raw_text)
                                return state, score, raw_text
                    elif res.status_code == 429:
                        logger.warning(f"[FALLBACK GEMINI] Model {gemini_model} rate limited (429). Trying next candidate.")
                        continue
                    else:
                        logger.warning(f"Gemini API ({gemini_model}) returned {res.status_code}: {res.text[:200]}")
            except Exception as e:
                logger.warning(f"Gemini API ({gemini_model}) call failed: {e}. Trying next candidate.")
                continue

    # 2. Secondary Evaluator: Anthropic Claude (if configured)
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=api_key)
            model = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-haiku-20241022")
            logger.info(f"Calling Anthropic API ({model}) for claim: '{claim_text[:60]}...'")

            response = await client.messages.create(
                model=model,
                max_tokens=120,
                system=LLM_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}]
            )
            raw_text = getattr(response.content[0], "text", "") if response.content else ""
            logger.info(f"[FALLBACK LLM RAW] Raw model response: '{raw_text}'")
            print(f"[FALLBACK LLM RAW] Raw model response: '{raw_text}'", flush=True)
            state, score = parse_llm_verdict(raw_text)
            return state, score, raw_text
        except Exception as e:
            logger.error(f"Anthropic API call failed: {e}. Falling back to defensive default.")

    # 3. Tertiary Evaluator: Heuristic Grounding
    logger.warning("No external LLM responded. Using evidence heuristic evaluator.")
    combined = " ".join([e.get("snippet", "") + " " + e.get("title", "") for e in evidence]).lower()
    refute_words = ["false", "fake", "hoax", "debunk", "incorrect", "denies", "no evidence", "untrue"]
    support_words = ["confirmed", "official", "announced", "verified", "landed", "declared", "success"]

    refute_hits = sum(1 for w in refute_words if w in combined)
    support_hits = sum(1 for w in support_words if w in combined)
    logger.info(f"[FALLBACK HEURISTIC] Evaluated {len(evidence)} snippets: support_hits={support_hits}, refute_hits={refute_hits}")

    if refute_hits > support_hits and refute_hits >= 1:
        return "False", 85, '{"state": "False", "score": 85, "note": "heuristic_refuted"}'
    elif support_hits > refute_hits and support_hits >= 1:
        return "True", 85, '{"state": "True", "score": 85, "note": "heuristic_supported"}'
    else:
        return "Unverified", 45, '{"state": "Unverified", "score": 45, "note": "heuristic_inconclusive"}'


async def fallback_fact_check(claim_text: str, domains: Optional[List[str]] = None) -> dict:
    """
    STAGE 2: Fallback RAG verification path.

    1. Attempt direct Google search scraping for open web organic coverage.
    2. Retrieve evidence from allowlist of reputable news domains via DuckDuckGo.
    3. Combine evidence snippets (deduplicated by URL).
    4. If zero results across both sources: skip LLM entirely and return Unverified/0.
    5. Otherwise, call LLM to evaluate strictly grounded in evidence snippets.
    """
    t0 = time.perf_counter()
    evidence_sources = []
    combined_evidence: List[Dict[str, str]] = []
    seen_urls = set()
    corroborating_domains = set()

    # Step 1: Direct Google Search Scraping Pass
    google_evidence = await scrape_google_search(claim_text, max_results=6)
    if google_evidence:
        evidence_sources.append("google_search")
        for item in google_evidence:
            if item["url"] not in seen_urls:
                seen_urls.add(item["url"])
                combined_evidence.append(item)
                if item.get("domain"):
                    corroborating_domains.add(item["domain"])

    # Step 2: DuckDuckGo Domain Allowlist Pass
    # Always query reputable domains if Google yielded fewer than 3 results or was blocked
    if len(combined_evidence) < 3:
        ddg_evidence, ddg_count = retrieve_evidence(claim_text, domains=domains)
        if ddg_evidence:
            evidence_sources.append("domain_allowlist")
            for item in ddg_evidence:
                if item["url"] not in seen_urls:
                    seen_urls.add(item["url"])
                    combined_evidence.append(item)
                    if item.get("domain"):
                        corroborating_domains.add(item["domain"])

    t_ev = time.perf_counter() - t0
    logger.info(f"[TIMING] fallback_evidence_retrieval: {t_ev:.4f}s")
    print(f"[TIMING] fallback_evidence_retrieval: {t_ev:.4f}s (sources: {evidence_sources}, total snippets: {len(combined_evidence)})", flush=True)

    if not combined_evidence:
        logger.info("[TIMING] fallback_llm_verdict: 0.0000s")
        print("[TIMING] fallback_llm_verdict: 0.0000s", flush=True)
        logger.info(f"Stage 2 (Fallback): Zero evidence found across all sources for '{claim_text}'. Skipping LLM.")
        return {
            "state": "Unverified",
            "score": 0,
            "source": "llm_inferred",
            "_internal": {
                "stage": 2,
                "evidence": [],
                "corroboration_count": 0,
                "evidence_sources": evidence_sources,
                "domains_searched": domains or REPUTABLE_DOMAINS,
                "llm_skipped": True,
                "reason": "zero_evidence",
                "t_ev": t_ev,
                "t_llm": 0.0
            }
        }

    t0_llm = time.perf_counter()
    state, score, raw_llm = await generate_llm_verdict(claim_text, combined_evidence)
    t_llm = time.perf_counter() - t0_llm
    logger.info(f"[TIMING] fallback_llm_verdict: {t_llm:.4f}s")
    print(f"[TIMING] fallback_llm_verdict: {t_llm:.4f}s", flush=True)

    corroboration_count = len(corroborating_domains)
    logger.info(
        f"Stage 2 (Fallback) resolved: state='{state}', score={score}, source='llm_inferred' "
        f"({corroboration_count} distinct domain(s), {len(combined_evidence)} snippet(s), sources={evidence_sources})"
    )

    return {
        "state": state,
        "score": score,
        "source": "llm_inferred",
        "_internal": {
            "stage": 2,
            "evidence": combined_evidence,
            "corroboration_count": corroboration_count,
            "evidence_sources": evidence_sources,
            "domains_searched": domains or REPUTABLE_DOMAINS,
            "llm_raw_response": raw_llm,
            "t_ev": t_ev,
            "t_llm": t_llm
        }
    }



