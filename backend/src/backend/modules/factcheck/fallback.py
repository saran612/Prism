import logging
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
        try:
            ddgs = DDGS(timeout=int(timeout))
            raw_results = ddgs.text(domain_query, max_results=max_per_domain * 2)
            for item in raw_results:
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
        except Exception as e:
            logger.warning(f"Error querying domain '{domain}' with query '{domain_query}': {e}")
        return domain, found

    from concurrent.futures import ThreadPoolExecutor, as_completed

    with ThreadPoolExecutor(max_workers=min(len(target_domains), 8)) as executor:
        future_to_domain = {
            executor.submit(_query_domain, domain): domain for domain in target_domains
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


LLM_SYSTEM_PROMPT = """You are a rigorous, objective fact-checking assistant. Your sole responsibility is to evaluate the veracity of a user's claim strictly based on the provided evidence snippets from reputable news outlets.

CRITICAL RULES:
1. Base your verdict ONLY on the provided evidence snippets — NEVER rely on prior knowledge, outside memory, or speculation.
2. If the provided evidence clearly confirms or supports the claim, output state "True" with an appropriate confidence score (typically 75-100).
3. If the provided evidence clearly contradicts, disproves, or refutes the claim, output state "False" with an appropriate confidence score (typically 75-100).
4. If the provided evidence does not clearly support or refute the claim, or does not address the core assertion, output state "Unverified" with a low score (typically 0-50).
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
    Call Claude via Anthropic API to evaluate claim strictly from evidence snippets.
    Returns (state, score, raw_response_text).
    """
    import os

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
                temperature=0.0,
                system=LLM_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}]
            )
            raw_text = response.content[0].text
            state, score = parse_llm_verdict(raw_text)
            return state, score, raw_text
        except Exception as e:
            logger.error(f"Anthropic API call failed: {e}. Falling back to defensive default.")
            return "Unverified", 0, str(e)
    else:
        logger.warning("ANTHROPIC_API_KEY not configured. Using evidence heuristic evaluator.")
        # Evidence-grounded heuristic when no Anthropic API key is present
        combined = " ".join([e.get("snippet", "") + " " + e.get("title", "") for e in evidence]).lower()
        refute_words = ["false", "fake", "hoax", "debunk", "incorrect", "denies", "no evidence", "untrue"]
        support_words = ["confirmed", "official", "announced", "verified", "landed", "declared", "success"]

        refute_hits = sum(1 for w in refute_words if w in combined)
        support_hits = sum(1 for w in support_words if w in combined)

        if refute_hits > support_hits and refute_hits >= 1:
            return "False", 85, '{"state": "False", "score": 85, "note": "heuristic_refuted"}'
        elif support_hits > refute_hits and support_hits >= 1:
            return "True", 85, '{"state": "True", "score": 85, "note": "heuristic_supported"}'
        else:
            return "Unverified", 45, '{"state": "Unverified", "score": 45, "note": "heuristic_inconclusive"}'


async def fallback_fact_check(claim_text: str, domains: Optional[List[str]] = None) -> dict:
    """
    STAGE 2: Fallback RAG verification path.

    1. Search allowlist of reputable domains.
    2. If zero results across all domains: skip LLM entirely and return:
       {"state": "Unverified", "score": 0, "source": "llm_inferred"}
    3. Otherwise, call LLM to evaluate strictly grounded in evidence snippets.
    4. Parse defensively and return:
       {"state": ..., "score": ..., "source": "llm_inferred"}
    """
    evidence_list, corroboration_count = retrieve_evidence(claim_text, domains=domains)

    if not evidence_list:
        logger.info(f"Stage 2 (Fallback): Zero evidence found across all domains for '{claim_text}'. Skipping LLM.")
        return {
            "state": "Unverified",
            "score": 0,
            "source": "llm_inferred",
            "_internal": {
                "stage": 2,
                "evidence": [],
                "corroboration_count": 0,
                "domains_searched": domains or REPUTABLE_DOMAINS,
                "llm_skipped": True,
                "reason": "zero_evidence"
            }
        }

    state, score, raw_llm = await generate_llm_verdict(claim_text, evidence_list)

    logger.info(
        f"Stage 2 (Fallback) resolved: state='{state}', score={score}, source='llm_inferred' "
        f"({corroboration_count} corroborating domain(s), {len(evidence_list)} snippet(s))"
    )

    return {
        "state": state,
        "score": score,
        "source": "llm_inferred",
        "_internal": {
            "stage": 2,
            "evidence": evidence_list,
            "corroboration_count": corroboration_count,
            "domains_searched": domains or REPUTABLE_DOMAINS,
            "llm_raw_response": raw_llm
        }
    }

