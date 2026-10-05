import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './Dashboard';
import VerifierSkeleton from './VerifierSkeleton';
import { ROUTE_DEFINITIONS, matchRoute } from './routes/schema';
import { NotFoundPage } from './routes/Router';


const INDIC_LANG_MAP = {
  hi: { name: 'Hindi', native: 'हिन्दी' },
  ta: { name: 'Tamil', native: 'தமிழ்' },
  te: { name: 'Telugu', native: 'తెలుగు' },
  bn: { name: 'Bengali', native: 'বাংলা' },
  mr: { name: 'Marathi', native: 'मराठी' },
  gu: { name: 'Gujarati', native: 'ગુજરાતી' },
  kn: { name: 'Kannada', native: 'ಕನ್ನಡ' },
  ml: { name: 'Malayalam', native: 'മലയാളം' },
  pa: { name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  en: { name: 'English', native: 'English' }
};

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    return typeof window !== 'undefined' ? (window.location.pathname || '/') : '/';
  });

  const navigateTo = (path) => {
    if (typeof window !== 'undefined') {
      const target = path.startsWith('/') ? path : `/${path}`;
      window.history.pushState({}, '', target);
      setCurrentPath(target);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [activeTab, setActiveTab] = useState(() => {
    const p = typeof window !== 'undefined' ? window.location.pathname : '/';
    if (p === '/api-studio') return 'api-studio';
    if (p === '/history') return 'history';
    if (p === '/verifier' || p === '/verify') return 'verifier';
    return 'dashboard';
  });

  // Synchronize activeTab and document title on currentPath change
  useEffect(() => {
    if (currentPath === '/api-studio') {
      setActiveTab('api-studio');
    } else if (currentPath === '/history') {
      setActiveTab('history');
    } else if (currentPath === '/verifier' || currentPath === '/verify') {
      setActiveTab('verifier');
    } else if (currentPath === '/' || currentPath === '/dashboard') {
      setActiveTab('dashboard');
    }

    document.title = 'Prism';
  }, [currentPath]);
  const [backendStatus, setBackendStatus] = useState({ online: false, version: '0.1.0' });

  // Theme State ('light' | 'dark')
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('prism_theme_v2') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('prism_theme_v2', theme);
  }, [theme]);

  // Main Social Link State
  const [socialUrl, setSocialUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamStage, setStreamStage] = useState(0); // 0: init, 1: content extracted, 2: translated, 3: claim extracted, 4: fallback started, 5: complete
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [rawResponseJson, setRawResponseJson] = useState(null);
  const [viewMode, setViewMode] = useState('visual'); // 'visual' | 'json'
  const [translating, setTranslating] = useState(false);

  // API Studio State
  const [apiCodeTab, setApiCodeTab] = useState('curl'); // 'curl' | 'python' | 'javascript'
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedReqSchema, setCopiedReqSchema] = useState(false);
  const [copiedResSchema, setCopiedResSchema] = useState(false);

  // History State
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const [historyPlatform, setHistoryPlatform] = useState('all');

  // Check Backend Health
  const checkHealth = async () => {
    try {
      let res;
      try {
        res = await fetch('/api/health');
      } catch {
        res = await fetch('http://127.0.0.1:8000/api/health');
      }
      if (res && res.ok) {
        const data = await res.json();
        setBackendStatus({ online: true, version: data.version || '0.1.0' });
      } else {
        setBackendStatus((prev) => ({ ...prev, online: false }));
      }
    } catch {
      setBackendStatus((prev) => ({ ...prev, online: false }));
    }
  };

  useEffect(() => {
    checkHealth();
    const timer = setInterval(checkHealth, 8000);
    return () => clearInterval(timer);
  }, []);

  // Fetch History
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/v1/history?limit=50');
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(data);
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  // Client-side Platform Detection
  const detectPlatformFromUrl = (url) => {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('twitter.com') || lower.includes('x.com')) {
      return { id: 'twitter', name: 'X / Twitter', icon: '𝕏', class: 'twitter' };
    }
    if (lower.includes('instagram.com') || lower.includes('instagr.am')) {
      return { id: 'instagram', name: 'Instagram', icon: '📸', class: 'instagram' };
    }
    if (lower.includes('facebook.com') || lower.includes('fb.com') || lower.includes('fb.watch')) {
      return { id: 'facebook', name: 'Facebook', icon: '👥', class: 'facebook' };
    }
    return null;
  };

  const detectedPlatform = detectPlatformFromUrl(socialUrl);

  // Execute Verification API Call
  const handleVerifyLink = async (e) => {
    if (e) e.preventDefault();
    const raw = socialUrl.trim();
    if (!raw) {
      setError('Please provide a social media post URL or enter a claim statement to verify.');
      return;
    }

    setError(null);
    setResult(null);
    setRawResponseJson(null);
    setLoading(true);
    setStreamStage(0);

    try {
      let cleanInput = raw;
      if (cleanInput.startsWith('x.com/') || cleanInput.startsWith('twitter.com/') || cleanInput.startsWith('instagram.com/') || cleanInput.startsWith('facebook.com/') || cleanInput.startsWith('fb.com/') || cleanInput.startsWith('www.')) {
        cleanInput = `https://${cleanInput}`;
      }
      const isUrl = cleanInput.startsWith('http://') || cleanInput.startsWith('https://');
      const payload = isUrl ? { url: cleanInput } : { text: cleanInput };

      const res = await fetch('/api/v1/check/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errJson = null;
        try {
          errJson = await res.json();
        } catch (_) {}
        throw new Error(errJson?.error || errJson?.detail || 'Could not verify post content.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Retain incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);
            if (data.event === 'error') {
              throw new Error(data.error || 'Verification pipeline encountered an error.');
            }

            if (data.event === 'content_extracted') {
              setResult((prev) => ({
                ...(prev || {}),
                text: data.text,
                input_text: data.input_text || data.text,
                thumbnail_url: data.thumbnail_url,
                platform: data.platform,
                author: data.author,
                source_url: data.source_url,
              }));
              setStreamStage(1);
            } else if (data.event === 'translated') {
              setResult((prev) => ({
                ...(prev || {}),
                detected_language: data.detected_language,
                translated_text: data.translated_text,
              }));
              setStreamStage(2);
            } else if (data.event === 'claim_extracted') {
              setResult((prev) => ({
                ...(prev || {}),
                claim: data.claim,
                extracted_claims: data.extracted_claims,
              }));
              setStreamStage(3);
            } else if (data.event === 'fallback_started') {
              setStreamStage(4);
            } else if (data.event === 'complete') {
              setResult((prev) => ({
                ...(prev || {}),
                ...data.result,
                claim: data.result?.claim || prev?.claim || '',
                extracted_claims: data.result?.extracted_claims || prev?.extracted_claims || [],
              }));
              setRawResponseJson(data.result);
              setStreamStage(5);
              setLoading(false);
              fetchHistory();
            }
          } catch (parseErr) {
            console.error('Error parsing SSE event chunk:', parseErr);
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  // On-demand manual or recovery translation
  const handleManualTranslate = async () => {
    if (!result) return;
    const textToTranslate = result.text || result.input_text || '';
    if (!textToTranslate) return;

    setTranslating(true);
    try {
      const res = await fetch('/api/v1/translation/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToTranslate,
          source_language: result.detected_language !== 'unknown' ? result.detected_language : undefined,
          target_language: 'en'
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.translated_text) {
          setResult((prev) => ({
            ...prev,
            translated_text: data.translated_text
          }));
        }
      }
    } catch (err) {
      console.error('Failed to translate:', err);
    } finally {
      setTranslating(false);
    }
  };

  // Auto-translate on Verifier page if result is non-English but translation is missing or equals original text
  useEffect(() => {
    if (
      result &&
      !loading &&
      result.detected_language &&
      result.detected_language !== 'en' &&
      result.detected_language !== 'unknown' &&
      (!result.translated_text || result.translated_text === (result.text || result.input_text)) &&
      !translating
    ) {
      handleManualTranslate();
    }
  }, [result?.text, result?.input_text, result?.translated_text, result?.detected_language, loading]);

  // Unified inspector: Redirects to Verifier page with pre-populated, verified claim details
  const handleInspectClaim = (item) => {
    if (!item) return;

    if (item.source_url) {
      setSocialUrl(item.source_url);
    } else {
      setSocialUrl(item.text || item.input_text || item.claim || '');
    }

    const claimFindings = item.fact_check_results || {
      claims: item.source === 'known_factcheck' && item.publisher ? [{
        text: item.claim || item.text || item.input_text,
        claimReview: [{
          publisher: { name: item.publisher },
          textualRating: item.state,
          url: item.url || item.source_url
        }]
      }] : [],
      evidence: Array.isArray(item.evidence) ? item.evidence : []
    };

    setResult({
      id: item.id,
      state: item.state || 'Unverified',
      score: typeof item.score === 'number' ? item.score : 0,
      source: item.source || 'llm_inferred',
      text: item.text || item.input_text || item.claim || '',
      input_text: item.input_text || item.text || item.claim || '',
      claim: item.claim || item.text || item.input_text || '',
      detected_language: item.detected_language || 'en',
      translated_text: item.translated_text || item.text || item.input_text || '',
      fact_check_results: claimFindings,
      thumbnail_url: item.thumbnail_url || null,
      author: item.author || null,
      source_url: item.source_url || null
    });

    setStreamStage(5);
    setLoading(false);
    setError(null);
    navigateTo('/verifier');
  };

  // Helper for Language Meta
  const getLangMeta = (code) => {
    if (!code) return { name: 'Unknown', native: '' };
    const lower = code.toLowerCase();
    return INDIC_LANG_MAP[lower] || { name: code.toUpperCase(), native: '' };
  };

  // Helper for Truthfulness Verdict
  const getVerdict = (res) => {
    if (!res) {
      return {
        label: 'Unverified',
        type: 'unverified',
        description: 'No verification data available.'
      };
    }

    // Direct 3-field schema: { state: "True"|"False"|"Unverified", score: 0-100, source: "known_factcheck"|"llm_inferred" }
    if (res.state) {
      if (res.state === 'False') {
        return {
          label: `False (${res.score}%)`,
          type: 'false',
          description: res.claim || res.text || res.input_text || 'Identified as false.'
        };
      }
      if (res.state === 'True') {
        return {
          label: `True (${res.score}%)`,
          type: 'true',
          description: res.claim || res.text || res.input_text || 'Verified as accurate.'
        };
      }
      return {
        label: `Unverified (${res.score}%)`,
        type: 'unverified',
        description: res.claim || res.text || res.input_text || 'Insufficient conclusive evidence.'
      };
    }

    const factCheckResults = res.fact_check_results || res;
    if (!factCheckResults || !factCheckResults.claims || factCheckResults.claims.length === 0) {
      return {
        label: 'Unverified / No Registry Match',
        type: 'unverified',
        description: 'No debunking records found in Google Fact Check database for this extracted post content.'
      };
    }

    const review = factCheckResults.claims[0]?.claimReview?.[0];
    const rating = review?.textualRating?.toLowerCase() || '';

    if (rating.includes('false') || rating.includes('fake') || rating.includes('misleading') || rating.includes('incorrect') || rating.includes('debunk')) {
      return {
        label: review?.textualRating || 'Debunked / False Claim',
        type: 'false',
        description: 'Flagged as false or misleading by verified independent fact checkers.'
      };
    }

    if (rating.includes('true') || rating.includes('correct') || rating.includes('accurate')) {
      return {
        label: review?.textualRating || 'Verified True',
        type: 'true',
        description: 'Verified as accurate by credible fact-checking publishers.'
      };
    }

    return {
      label: review?.textualRating || 'Claim Reviewed',
      type: 'unverified',
      description: `Review recorded: "${review?.textualRating || 'Uncategorized'}".`
    };
  };

  // Generate Code Snippets
  const getSnippet = () => {
    const targetUrl = socialUrl.trim() || 'https://x.com/NASA/status/1894238573928172635';
    if (apiCodeTab === 'curl') {
      return `curl -X POST "http://localhost:8000/api/v1/check" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "${targetUrl}"}'`;
    }
    if (apiCodeTab === 'python') {
      return `import httpx

api_url = "http://localhost:8000/api/v1/check"
payload = {
    "url": "${targetUrl}"
}

with httpx.Client(timeout=15.0) as client:
    response = client.post(api_url, json=payload)
    result = response.json()
    print("Detected Language:", result.get("detected_language"))
    print("Extracted Caption:", result.get("text"))
    print("English Translation:", result.get("translated_text"))
    print("Thumbnail URL:", result.get("thumbnail_url"))
    print("Fact Checks:", result.get("fact_check_results"))`;
    }
    if (apiCodeTab === 'javascript') {
      return `const response = await fetch("http://localhost:8000/api/v1/check", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    url: "${targetUrl}"
  })
});

const data = await response.json();
console.log("Extracted Caption:", data.text);
console.log("Language:", data.detected_language);
console.log("Thumbnail URL:", data.thumbnail_url);
console.log("Fact Check Results:", data.fact_check_results);`;
    }
    return '';
  };

  const copySnippet = () => {
    navigator.clipboard.writeText(getSnippet());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyReqSchema = () => {
    const json = JSON.stringify({ url: "https://x.com/NASA/status/1894238573928172635" }, null, 2);
    navigator.clipboard.writeText(json);
    setCopiedReqSchema(true);
    setTimeout(() => setCopiedReqSchema(false), 2000);
  };

  const copyResSchema = () => {
    const json = JSON.stringify({
      text: "string",
      detected_language: "string",
      translated_text: "string",
      fact_check_results: {}
    }, null, 2);
    navigator.clipboard.writeText(json);
    setCopiedResSchema(true);
    setTimeout(() => setCopiedResSchema(false), 2000);
  };

  return (
    <div className="apple-app">
      {/* Apple Frosted Navigation Bar */}
      <nav className="apple-nav">
        <div className="apple-nav-inner">
          <div className="apple-brand" onClick={() => navigateTo('/')} style={{ cursor: 'pointer' }}>
            <div className="apple-brand-icon">
              <img src="/logo.png" alt="Prism Logo" className="apple-brand-logo-img" />
            </div>
            <span className="apple-brand-title">Prism</span>
          </div>

          <div className="apple-nav-center">
            <button
              type="button"
              className={`apple-nav-tab ${currentPath === '/' || currentPath === '/dashboard' ? 'active' : ''}`}
              onClick={() => navigateTo('/')}
              id="nav-link-dashboard"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="9" />
                <rect x="14" y="3" width="7" height="5" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="16" width="7" height="5" />
              </svg>
              <span>Dashboard</span>
            </button>

            <button
              type="button"
              className={`apple-nav-tab ${currentPath === '/verifier' || currentPath === '/verify' ? 'active' : ''}`}
              onClick={() => navigateTo('/verifier')}
              id="nav-link-verifier"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>Verifier</span>
            </button>

            <button
              type="button"
              className={`apple-nav-tab ${currentPath === '/api-studio' ? 'active' : ''}`}
              onClick={() => navigateTo('/api-studio')}
              id="nav-link-api-studio"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span>API Studio</span>
            </button>

            <button
              type="button"
              className={`apple-nav-tab ${currentPath === '/history' ? 'active' : ''}`}
              onClick={() => navigateTo('/history')}
              id="nav-link-history"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>History</span>
            </button>
          </div>

          <div className="apple-nav-actions">
            <button
              type="button"
              className="apple-theme-toggle"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              id="theme-toggle-btn"
            >
              {theme === 'dark' ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="apple-docs-btn"
              id="apple-docs-link"
            >
              <span>API Specs</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M7 17l9.2-9.2M17 17V8H8" />
              </svg>
            </a>

            <div
              className={`apple-status-capsule ${backendStatus.online ? 'online' : 'offline'}`}
              id="backend-status-pill"
              title={backendStatus.online ? `API Live (v${backendStatus.version})` : 'Connecting API...'}
            >
              <span className="apple-status-indicator"></span>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className={`apple-main ${currentPath === '/' || currentPath === '/dashboard' ? 'apple-main-fullwidth' : ''}`}>
        {currentPath === '/' || currentPath === '/dashboard' ? (
          <Dashboard
            onNavigate={navigateTo}
            onInspectClaim={handleInspectClaim}
            INDIC_LANG_MAP={INDIC_LANG_MAP}
            detectPlatformFromUrl={detectPlatformFromUrl}
          />
        ) : matchRoute(currentPath) === null ? (
          <NotFoundPage currentPath={currentPath} onNavigate={navigateTo} />
        ) : (
          <>
        {/* TAB 1: SOCIAL LINK VERIFIER */}
        {activeTab === 'verifier' && (
          <div className={`apple-settle-in apple-verifier-stage ${result || loading ? 'has-results' : ''}`}>
            {/* Apple Hero Header */}
            <header className="apple-hero">
              <h1 className="apple-hero-title">
                Verify any <span className="apple-hero-highlight">social</span>
              </h1>
            </header>

            <div className="apple-verifier-wrapper">
              {/* Input Surface */}
              <div className="apple-card apple-verifier-card">
                <div className="apple-card-header">
                  <div className="apple-card-title-group">
                    <h2>Verify Social Media URL</h2>
                  </div>
                </div>

              {/* Spotlight Input Bar */}
              <form onSubmit={handleVerifyLink}>
                <div className="apple-spotlight-bar">
                  <div className="apple-spotlight-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>

                  <input
                    type="text"
                    id="social-url-input"
                    className="apple-spotlight-input"
                    placeholder="Paste social media URL or enter any claim statement..."
                    value={socialUrl}
                    onChange={(e) => setSocialUrl(e.target.value)}
                  />

                  {socialUrl && (
                    <button
                      type="button"
                      onClick={() => setSocialUrl('')}
                      style={{ color: 'var(--apple-label-tertiary)', padding: '4px', fontSize: '0.9rem' }}
                      title="Clear URL"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {error && (
                  <div className="apple-error-banner" id="error-message">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{error}</span>
                  </div>
                )}

                <div className="apple-action-bar">
                  <button
                    type="submit"
                    className="apple-btn-primary"
                    disabled={loading || !socialUrl.trim()}
                    id="btn-verify-link"
                  >
                    {loading ? (
                      <>
                        <svg className="apple-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="16" />
                        </svg>
                        <span>Extracting & Verifying...</span>
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Check</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="apple-btn-secondary"
                    onClick={() => {
                      setSocialUrl('');
                      setResult(null);
                      setRawResponseJson(null);
                      setError(null);
                      setStreamStage(0);
                    }}
                    id="btn-clear-all"
                  >
                    Reset
                  </button>
                </div>
              </form>
            </div>

            {/* Live Pipeline Telemetry Skeleton during check (only before first layer arrives) */}
            {loading && !result && <VerifierSkeleton socialUrl={socialUrl} />}

            {/* Results Inspection Surface (Loads progressively layer-by-layer) */}
            {result && (
              <div className="apple-results apple-settle-in" id="results-display">

                {/* View Switcher: Visual vs Raw JSON */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.86rem', color: 'var(--apple-label-secondary)' }}>
                    {!result.source_url && (
                      <>
                        <span>Claim Text: </span>
                        <span style={{ color: 'var(--apple-label-primary)', fontWeight: 600 }}>
                          {result.input_text || result.text || socialUrl}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="apple-segmented-container" style={{ padding: '2px' }}>
                    <button
                      type="button"
                      className={`apple-segment-item ${viewMode === 'visual' ? 'active' : ''}`}
                      onClick={() => setViewMode('visual')}
                      style={{ padding: '4px 12px', fontSize: '0.76rem' }}
                    >
                      Visual Inspection
                    </button>
                    <button
                      type="button"
                      className={`apple-segment-item ${viewMode === 'json' ? 'active' : ''}`}
                      onClick={() => setViewMode('json')}
                      style={{ padding: '4px 12px', fontSize: '0.76rem' }}
                    >
                      API JSON Response
                    </button>
                  </div>
                </div>

                {viewMode === 'visual' ? (
                  <>
                    {/* Apple Verdict Island Banner */}
                    {(() => {
                      if (loading && !result.state) {
                        return (
                          <div className="apple-verdict-island analyzing apple-settle-in" style={{ marginBottom: '20px' }}>
                            <div className="apple-verdict-info">
                              <span className="apple-verdict-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="prism-skeleton-pulse-dot" />
                                PIPELINE IN PROGRESS
                              </span>
                              <div className="apple-verdict-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span>Analyzing Veracity...</span>
                                <div className="prism-skeleton-mini-spinner" style={{ width: '16px', height: '16px', borderWidth: '2.5px' }} />
                              </div>
                              <div className="apple-verdict-desc">
                                {result.claim || result.text || result.input_text || 'Evaluating factual accuracy against authoritative registries...'}
                              </div>
                            </div>
                            <div className="apple-verdict-badge unverified" style={{ background: 'rgba(100, 210, 255, 0.15)', color: '#64d2ff', borderColor: 'rgba(100, 210, 255, 0.3)' }}>
                              Analyzing...
                            </div>
                          </div>
                        );
                      }

                      const verdict = getVerdict(result);
                      return (
                        <div className={`apple-verdict-island ${verdict.type}`} style={{ marginBottom: '20px' }}>
                          <div className="apple-verdict-info">
                            <span className="apple-verdict-eyebrow">
                              VERIFICATION VERDICT
                            </span>
                            <div className="apple-verdict-title">{verdict.label}</div>
                            <div className="apple-verdict-desc">
                              {result.claim || result.text || result.input_text || verdict.description}
                            </div>
                          </div>
                          <div className={`apple-verdict-badge ${verdict.type}`}>
                            {result.state || 'Unverified'} • {result.score ?? 0}%
                          </div>
                        </div>
                      );
                    })()}

                    {/* Social Post Extraction Details or Direct Input Card */}
                    {result.source_url ? (
                      <div className="apple-post-card">
                        <div className="apple-post-top">
                          <div className="apple-post-author-box">
                            <div className="apple-post-avatar">
                              {detectedPlatform ? detectedPlatform.icon : '🔗'}
                            </div>
                            <div className="apple-post-meta-lines">
                              <div className="apple-post-author">
                                {result.author ? `@${result.author}` : (detectedPlatform ? detectedPlatform.name : 'Social Post Extraction')}
                              </div>
                              <div className="apple-post-id-tag">
                                Extracted URL: {result.source_url}
                              </div>
                            </div>
                          </div>

                          <a
                            href={result.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="apple-safari-link"
                            style={{ fontSize: '0.82rem' }}
                          >
                            <span>Open Original Post</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        </div>

                        {result.thumbnail_url && (
                          <div className="apple-post-media-preview">
                            <img
                              src={result.thumbnail_url}
                              alt="Post Media Thumbnail"
                              className="apple-post-thumbnail-img"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.parentElement.style.display = 'none';
                              }}
                            />
                            <div className="apple-post-thumbnail-badge">
                              <span>📸 Media Thumbnail</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="apple-post-card" style={{ padding: '16px 20px' }}>
                        <div className="apple-post-top">
                          <div className="apple-post-author-box">
                            <div className="apple-post-avatar" style={{ fontSize: '1.2rem' }}>
                              💬
                            </div>
                            <div className="apple-post-meta-lines">
                              <div className="apple-post-author">
                                Direct Claim Analysis
                              </div>
                              <div className="apple-post-id-tag">
                                Detected Language: {getLangMeta(result.detected_language).name} {getLangMeta(result.detected_language).native ? `(${getLangMeta(result.detected_language).native})` : ''}
                              </div>
                            </div>
                          </div>
                          <span className="apple-pane-badge" style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'var(--apple-label-secondary)' }}>
                            Raw Text Input
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Dual Pane Language & Translation */}
                    <div className="apple-dual-pane">
                      <div className="apple-pane">
                        <div className="apple-pane-header">
                          <span>{result.source_url ? 'Extracted Social Caption' : 'Original Claim Statement'}</span>
                          <span className="apple-pane-badge">
                            {getLangMeta(result.detected_language).native} ({getLangMeta(result.detected_language).name})
                          </span>
                        </div>
                        <div className="apple-pane-text">
                          {result.text || result.input_text || 'No caption text was extracted.'}
                        </div>
                      </div>

                      <div className="apple-pane">
                        <div className="apple-pane-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>Neural English Translation</span>
                            {(translating || (loading && !result.translated_text)) && (
                              <svg className="apple-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--apple-accent)' }}>
                                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="16" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <div className="apple-pane-text">
                          {loading && !result.translated_text && (!result.detected_language || result.detected_language !== 'en') ? (
                            <div className="prism-skeleton-text-block apple-settle-in" style={{ padding: '4px 0' }}>
                              <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '96%', height: '14px', marginBottom: '10px' }} />
                              <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '88%', height: '14px', marginBottom: '10px' }} />
                              <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '60%', height: '14px' }} />
                            </div>
                          ) : translating ? (
                            <span style={{ color: 'var(--apple-label-secondary)', fontStyle: 'italic' }}>
                              Translating statement with Neural Indian Language engine...
                            </span>
                          ) : result.detected_language !== 'en' && (!result.translated_text || result.translated_text === (result.text || result.input_text)) ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <span style={{ color: 'var(--apple-label-secondary)' }}>
                                {result.translated_text || result.text || result.input_text}
                              </span>
                              <div>
                                <button
                                  type="button"
                                  className="apple-btn-secondary"
                                  onClick={handleManualTranslate}
                                  style={{ fontSize: '0.78rem', padding: '6px 14px' }}
                                >
                                  🔄 Translate to English
                                </button>
                              </div>
                            </div>
                          ) : (
                            result.translated_text || result.text || result.input_text
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Published Fact-Checks (only when external fact check registry records exist) */}
                    {result.fact_check_results?.claims && result.fact_check_results.claims.length > 0 && (
                      <div className="apple-card" style={{ marginTop: '20px' }}>
                        <div className="apple-card-header">
                          <div className="apple-card-title-group">
                            <h2 style={{ margin: 0 }}>Fact Check Findings & Reviews</h2>
                            <p>Authoritative debunking records retrieved from Google Fact Check Tools.</p>
                          </div>
                        </div>

                        <div className="apple-findings-list">
                          {result.fact_check_results.claims.map((claim, idx) => {
                            const review = claim.claimReview?.[0];
                            const isFalse = review?.textualRating?.toLowerCase().includes('false');
                            return (
                              <div key={idx} className="apple-finding-card">
                                <div className="apple-finding-top">
                                  <div className="apple-publisher-name">
                                    {review?.publisher?.name || 'Fact Check Review'}
                                    {review?.publisher?.site && (
                                      <span style={{ fontWeight: 400, color: 'var(--apple-label-tertiary)', marginLeft: '6px' }}>
                                        ({review.publisher.site})
                                      </span>
                                    )}
                                  </div>

                                  {review?.textualRating && (
                                    <span className={`apple-rating-pill ${isFalse ? 'false' : 'true'}`}>
                                      {review.textualRating}
                                    </span>
                                  )}
                                </div>

                                <div className="apple-finding-body">
                                  <strong style={{ color: 'var(--apple-label-primary)' }}>Claim Evaluated: </strong>
                                  {claim.text}
                                </div>

                                {review?.title && (
                                  <div style={{ fontSize: '0.86rem', color: 'var(--apple-label-secondary)' }}>
                                    <em>{review.title}</em>
                                  </div>
                                )}

                                <div className="apple-finding-footer">
                                  <span>
                                    {claim.claimant ? `Claimant: ${claim.claimant}` : 'Social Stream'}
                                    {review?.reviewDate && ` • ${new Date(review.reviewDate).toLocaleDateString()}`}
                                  </span>

                                  {review?.url && (
                                    <a
                                      href={review.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="apple-safari-link"
                                    >
                                      <span>Read Review in Safari</span>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                      </svg>
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Fallback Evidence Sources (when web/news evidence was retrieved via Jina or DDG) */}
                    {Array.isArray(result.fact_check_results?.evidence) && result.fact_check_results.evidence.length > 0 && (
                      <div className="apple-card" style={{ marginTop: '20px' }}>
                        <div className="apple-card-header">
                          <div className="apple-card-title-group">
                            <h2 style={{ margin: 0 }}>Evidence Retrieved ({result.fact_check_results.evidence.length})</h2>
                            <p>Corroborating web and news articles retrieved via live search engine verification.</p>
                          </div>
                        </div>

                        <div className="apple-findings-list">
                          {result.fact_check_results.evidence.map((ev, idx) => (
                            <div key={idx} className="apple-finding-card">
                              <div className="apple-finding-top">
                                <div className="apple-publisher-name">
                                  🌐 {ev.domain || 'News Source'}
                                </div>
                                <span className="apple-rating-pill true" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                                  Live Web Evidence
                                </span>
                              </div>

                              <div className="apple-finding-body" style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--apple-label-primary)' }}>
                                {ev.title}
                              </div>

                              {ev.snippet && (
                                <div style={{ fontSize: '0.88rem', color: 'var(--apple-label-secondary)', lineHeight: 1.5, marginTop: '6px' }}>
                                  "{ev.snippet}"
                                </div>
                              )}

                              <div className="apple-finding-footer">
                                <span>Organic Search Result</span>
                                {ev.url && (
                                  <a
                                    href={ev.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="apple-safari-link"
                                  >
                                    <span>Read Source Article</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                      <polyline points="15 3 21 3 21 9" />
                                      <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="apple-card">
                    <div className="apple-card-header">
                      <div className="apple-card-title-group">
                        <h2>Raw JSON API Payload</h2>
                        <p>Complete response object returned by `POST /api/v1/check`.</p>
                      </div>
                    </div>
                    <div className="apple-json-viewer">
                      {JSON.stringify(rawResponseJson, null, 2)}
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        )}

        {/* TAB 2: API CALL CONSOLE */}
        {activeTab === 'api-studio' && (
          <div className="apple-settle-in apple-api-studio-view">
            <div className="apple-card">
              <div className="apple-card-header">
                <div className="apple-card-title-group">
                  <h2>Link Verification via API Call</h2>
                  <p>Call the Prism verification engine programmatically by passing any social media URL.</p>
                </div>
              </div>

              {/* Endpoint Spec Pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <span style={{ padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(48, 209, 88, 0.15)', color: '#30d158', fontWeight: 700, fontSize: '0.78rem' }}>
                  POST
                </span>
                <code style={{ fontFamily: 'var(--sf-mono)', fontSize: '0.9rem', color: '#fff', background: 'rgba(255, 255, 255, 0.06)', padding: '4px 10px', borderRadius: '6px' }}>
                  http://localhost:8000/api/v1/check
                </code>
                <span style={{ fontSize: '0.78rem', color: 'var(--apple-label-tertiary)' }}>Content-Type: application/json</span>
              </div>

              {/* Code Box */}
              <div className="apple-code-box">
                <div className="apple-code-header">
                  <div className="apple-code-tabs">
                    <button
                      type="button"
                      className={`apple-code-tab-btn ${apiCodeTab === 'curl' ? 'active' : ''}`}
                      onClick={() => setApiCodeTab('curl')}
                    >
                      cURL
                    </button>
                    <button
                      type="button"
                      className={`apple-code-tab-btn ${apiCodeTab === 'python' ? 'active' : ''}`}
                      onClick={() => setApiCodeTab('python')}
                    >
                      Python
                    </button>
                    <button
                      type="button"
                      className={`apple-code-tab-btn ${apiCodeTab === 'javascript' ? 'active' : ''}`}
                      onClick={() => setApiCodeTab('javascript')}
                    >
                      JavaScript
                    </button>
                  </div>

                  <button
                    type="button"
                    className="apple-copy-btn"
                    onClick={copySnippet}
                  >
                    {copiedCode ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="apple-code-content">
                  {getSnippet()}
                </div>
              </div>

              {/* Request & Response Schema Documentation */}
              <div style={{ marginTop: '28px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '12px' }}>Request Body Schema</h3>
                <div className="apple-schema-card">
                  <div className="apple-schema-header">
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontFamily: 'var(--sf-mono)', fontWeight: 600 }}>JSON (application/json)</span>
                    <button
                      type="button"
                      className="apple-copy-btn"
                      onClick={copyReqSchema}
                    >
                      {copiedReqSchema ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          <span>Copy Schema</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="apple-schema-body">
                    <div style={{ color: 'var(--apple-label-secondary)' }}>// POST JSON Payload</div>
                    <div>&#123;</div>
                    <div style={{ paddingLeft: '20px' }}>
                      <span style={{ color: '#64d2ff' }}>"url"</span>: <span style={{ color: '#a7f3d0' }}>"https://x.com/NASA/status/1894238573928172635"</span> <span style={{ color: 'var(--apple-label-tertiary)' }}>// Required: Social media URL</span>
                    </div>
                    <div>&#125;</div>
                  </div>
                </div>

                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '24px 0 12px 0' }}>Response Payload Schema</h3>
                <div className="apple-schema-card">
                  <div className="apple-schema-header">
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontFamily: 'var(--sf-mono)', fontWeight: 600 }}>JSON (application/json)</span>
                    <button
                      type="button"
                      className="apple-copy-btn"
                      onClick={copyResSchema}
                    >
                      {copiedResSchema ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          <span>Copy Schema</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="apple-schema-body">
                    <div style={{ color: 'var(--apple-label-secondary)' }}>// 200 OK Response</div>
                    <div>&#123;</div>
                    <div style={{ paddingLeft: '20px' }}>
                      <div><span style={{ color: '#64d2ff' }}>"text"</span>: <span style={{ color: 'var(--apple-label-tertiary)' }}>string</span>, <span style={{ color: 'var(--apple-label-secondary)' }}>// Extracted post caption in native language</span></div>
                      <div><span style={{ color: '#64d2ff' }}>"detected_language"</span>: <span style={{ color: 'var(--apple-label-tertiary)' }}>string</span>, <span style={{ color: 'var(--apple-label-secondary)' }}>// ISO language code (e.g. 'hi', 'ta', 'te', 'en')</span></div>
                      <div><span style={{ color: '#64d2ff' }}>"translated_text"</span>: <span style={{ color: 'var(--apple-label-tertiary)' }}>string</span>, <span style={{ color: 'var(--apple-label-secondary)' }}>// Translated English statement</span></div>
                      <div><span style={{ color: '#64d2ff' }}>"fact_check_results"</span>: <span style={{ color: 'var(--apple-label-tertiary)' }}>object</span> <span style={{ color: 'var(--apple-label-secondary)' }}>// Google Fact Check API claims & review ratings</span></div>
                    </div>
                    <div>&#125;</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT HISTORY */}
        {activeTab === 'history' && (
          <div className="apple-settle-in apple-history-view">
            <div className="apple-card">
              <div className="apple-card-header">
                <div className="apple-card-title-group">
                  <h2>Verified Social Posts Log</h2>
                  <p>Historical archive of social media links audited through the Prism API.</p>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* Platform Filter */}
                  <select
                    className="apple-input"
                    value={historyPlatform}
                    onChange={(e) => setHistoryPlatform(e.target.value)}
                    style={{ padding: '7px 12px', fontSize: '0.8rem', width: 'auto', background: 'rgba(28, 28, 30, 0.8)' }}
                  >
                    <option value="all">All Platforms</option>
                    <option value="twitter">X / Twitter</option>
                    <option value="instagram">Instagram</option>
                    <option value="facebook">Facebook</option>
                  </select>

                  <input
                    type="text"
                    placeholder="Search caption or URL..."
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value)}
                    className="apple-input"
                    style={{ width: '180px', padding: '7px 12px', fontSize: '0.8rem' }}
                  />

                  <button
                    type="button"
                    className="apple-btn-secondary"
                    onClick={fetchHistory}
                    disabled={historyLoading}
                    style={{ padding: '7px 12px' }}
                    title="Refresh Log"
                  >
                    ↻
                  </button>
                </div>
              </div>

              {historyLoading ? (
                <div className="apple-history-list apple-settle-in">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="apple-history-item prism-skeleton-history-row" style={{ pointerEvents: 'none' }}>
                      <div className="prism-skeleton-thumb prism-skeleton-shimmer" style={{ width: '48px', height: '48px', borderRadius: '8px', flexShrink: 0 }} />
                      <div className="apple-history-content" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                        <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: `${65 + ((i * 11) % 30)}%`, height: '15px' }} />
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div className="prism-skeleton-pill prism-skeleton-shimmer" style={{ width: '80px', height: '18px' }} />
                          <div className="prism-skeleton-pill prism-skeleton-shimmer" style={{ width: '65px', height: '18px' }} />
                          <div className="prism-skeleton-pill prism-skeleton-shimmer" style={{ width: '38px', height: '18px' }} />
                          <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '140px', height: '12px' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : historyItems.length === 0 ? (
                <div className="apple-settle-in" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--apple-label-secondary)' }}>
                  No historical social post verifications found yet. Execute an API verification above to record it.
                </div>
              ) : (
                <div className="apple-history-list apple-settle-in">
                  {historyItems
                    .filter((item) => {
                      if (historyPlatform !== 'all') {
                        const url = (item.source_url || '').toLowerCase();
                        if (historyPlatform === 'twitter' && !url.includes('twitter') && !url.includes('x.com')) return false;
                        if (historyPlatform === 'instagram' && !url.includes('instagram')) return false;
                        if (historyPlatform === 'facebook' && !url.includes('facebook') && !url.includes('fb.')) return false;
                      }
                      if (!historyFilter) return true;
                      const q = historyFilter.toLowerCase();
                      return (
                        (item.input_text && item.input_text.toLowerCase().includes(q)) ||
                        (item.source_url && item.source_url.toLowerCase().includes(q))
                      );
                    })
                    .map((item) => {
                      const plat = detectPlatformFromUrl(item.source_url);
                      return (
                        <div
                          key={item.id}
                          className="apple-history-item"
                          onClick={() => handleInspectClaim(item)}
                        >
                          {item.thumbnail_url && (
                            <img
                              src={item.thumbnail_url}
                              alt="Thumbnail"
                              className="apple-history-thumb"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          <div className="apple-history-content">
                            <div className="apple-history-text">{item.claim || item.input_text}</div>
                            <div className="apple-history-meta">
                              {plat && (
                                <span className={`apple-platform-pill-detected ${plat.class}`} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                                  {plat.icon} {plat.name}
                                </span>
                              )}
                              {item.state && (
                                <span className={`prism-badge-tag ${item.state.toLowerCase()}`} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                                  {item.state}
                                </span>
                              )}
                              {item.score !== undefined && item.score !== null && (
                                <span className="prism-badge-score" style={{ fontSize: '0.7rem' }}>
                                  {item.score}
                                </span>
                              )}
                              <span className="apple-pane-badge" style={{ padding: '2px 7px', fontSize: '0.68rem' }}>
                                {getLangMeta(item.detected_language).name}
                              </span>
                              {item.source_url && (
                                <span style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.source_url}
                                </span>
                              )}
                              {item.created_at && <span>{new Date(item.created_at).toLocaleString()}</span>}
                            </div>
                          </div>

                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--apple-label-tertiary)' }}>
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}
          </>
        )}
      </main>

      {/* Apple Footer */}
      <footer className="apple-footer">
        <div>Prism 2026</div>
      </footer>
    </div>
  );
}
