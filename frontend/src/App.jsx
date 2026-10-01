import React, { useState, useEffect } from 'react';
import './App.css';

const PRESET_SOCIAL_LINKS = [
  {
    platform: 'twitter',
    label: 'X (Twitter) Post',
    icon: '𝕏',
    url: 'https://x.com/jack/status/20',
    desc: 'Twitter status post via public oEmbed'
  },
  {
    platform: 'twitter',
    label: 'NASA Science Tweet',
    icon: '𝕏',
    url: 'https://x.com/NASA/status/1894238573928172635',
    desc: 'News statement with Indic translation'
  },
  {
    platform: 'instagram',
    label: 'Instagram Reel',
    icon: '📸',
    url: 'https://www.instagram.com/reel/Co94Pz3A-aD',
    desc: 'Instagram video caption extraction'
  },
  {
    platform: 'facebook',
    label: 'Facebook Post',
    icon: '👥',
    url: 'https://www.facebook.com/share/p/101584920202020/',
    desc: 'OpenGraph metadata & post text'
  }
];

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
  const [activeTab, setActiveTab] = useState('verifier'); // 'verifier' | 'api-studio' | 'history'
  const [backendStatus, setBackendStatus] = useState({ online: false, version: '0.1.0' });

  // Main Social Link State
  const [socialUrl, setSocialUrl] = useState('https://x.com/jack/status/20');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [rawResponseJson, setRawResponseJson] = useState(null);
  const [viewMode, setViewMode] = useState('visual'); // 'visual' | 'json'

  // API Studio State
  const [apiCodeTab, setApiCodeTab] = useState('curl'); // 'curl' | 'python' | 'javascript'
  const [copiedCode, setCopiedCode] = useState(false);

  // History State
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');
  const [historyPlatform, setHistoryPlatform] = useState('all');

  // Check Backend Health
  const checkHealth = async () => {
    try {
      const res = await fetch('/');
      if (res.ok) {
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
      const res = await fetch('/api/v1/history');
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
    if (!socialUrl.trim()) {
      setError('Please provide a social media post URL (X/Twitter, Instagram, or Facebook).');
      return;
    }

    setError(null);
    setResult(null);
    setRawResponseJson(null);
    setLoading(true);

    try {
      const res = await fetch('/api/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: socialUrl.trim() })
      });

      const data = await res.json();
      setRawResponseJson(data);

      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Could not verify social media post content.');
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Helper for Language Meta
  const getLangMeta = (code) => {
    if (!code) return { name: 'Unknown', native: '' };
    const lower = code.toLowerCase();
    return INDIC_LANG_MAP[lower] || { name: code.toUpperCase(), native: '' };
  };

  // Helper for Truthfulness Verdict
  const getVerdict = (factCheckResults) => {
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
console.log("Fact Check Results:", data.fact_check_results);`;
    }
    return '';
  };

  const copySnippet = () => {
    navigator.clipboard.writeText(getSnippet());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="apple-app">
      {/* Apple Frosted Navigation Bar */}
      <nav className="apple-nav">
        <div className="apple-nav-inner">
          <div className="apple-brand" onClick={() => setActiveTab('verifier')}>
            <div className="apple-brand-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 22 22 22" />
                <line x1="12" y1="2" x2="12" y2="22" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
              </svg>
            </div>
            <span className="apple-brand-title">Prism</span>
            <span className="apple-brand-pill">Social API</span>
          </div>

          <div className="apple-nav-actions">
            <div className={`apple-status-capsule ${backendStatus.online ? 'online' : 'offline'}`} id="backend-status-pill">
              <span className="apple-status-indicator"></span>
              <span>{backendStatus.online ? `API Live (v${backendStatus.version})` : 'Connecting API...'}</span>
            </div>

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
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="apple-main">
        {/* Apple Hero Header */}
        <header className="apple-hero">
          <h1 className="apple-hero-title">Verify any social link.</h1>
        </header>

        {/* Apple Segmented Control */}
        <div className="apple-segmented-nav">
          <div className="apple-segmented-container" role="tablist">
            <button
              className={`apple-segment-item ${activeTab === 'verifier' ? 'active' : ''}`}
              onClick={() => setActiveTab('verifier')}
              id="tab-verifier"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              Social Link Verifier
            </button>

            <button
              className={`apple-segment-item ${activeTab === 'api-studio' ? 'active' : ''}`}
              onClick={() => setActiveTab('api-studio')}
              id="tab-api-studio"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              API Call Console
            </button>

            <button
              className={`apple-segment-item ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
              id="tab-history"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Verification History
            </button>
          </div>
        </div>

        {/* TAB 1: SOCIAL LINK VERIFIER */}
        {activeTab === 'verifier' && (
          <div className="apple-fade-in">
            {/* Input Surface */}
            <div className="apple-card">
              <div className="apple-card-header">
                <div className="apple-card-title-group">
                  <h2>Verify Social Media URL</h2>
                  <p>Input a post link to extract caption, translate Indian scripts, and execute real-time fact checking.</p>
                </div>
              </div>

              {/* Presets */}
              <div className="apple-samples-container">
                <span className="apple-samples-label">Preset Links:</span>
                {PRESET_SOCIAL_LINKS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="apple-sample-pill"
                    onClick={() => setSocialUrl(preset.url)}
                    id={`preset-link-${idx}`}
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.label}</span>
                  </button>
                ))}
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
                    type="url"
                    id="social-url-input"
                    className="apple-spotlight-input"
                    placeholder="Paste X / Twitter, Instagram, or Facebook link..."
                    value={socialUrl}
                    onChange={(e) => setSocialUrl(e.target.value)}
                  />

                  {detectedPlatform && (
                    <div className={`apple-platform-pill-detected ${detectedPlatform.class}`}>
                      <span>{detectedPlatform.icon}</span>
                      <span>{detectedPlatform.name}</span>
                    </div>
                  )}

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
                        <span>Execute API Verification</span>
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
                    }}
                    id="btn-clear-all"
                  >
                    Reset
                  </button>
                </div>
              </form>
            </div>

            {/* Results Inspection Surface */}
            {result && (
              <div className="apple-results apple-fade-in" id="results-display">
                {/* View Switcher: Visual vs Raw JSON */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.86rem', color: 'var(--apple-label-secondary)' }}>
                    <span>Target URL: </span>
                    <a href={socialUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--apple-blue)', textDecoration: 'underline' }}>
                      {socialUrl}
                    </a>
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
                    {/* Verdict Island */}
                    {(() => {
                      const verdict = getVerdict(result.fact_check_results);
                      return (
                        <div className={`apple-verdict-island ${verdict.type}`}>
                          <div className="apple-verdict-info">
                            <span className="apple-verdict-eyebrow">Verification Classification</span>
                            <div className="apple-verdict-title">{verdict.label}</div>
                            <div className="apple-verdict-desc">{verdict.description}</div>
                          </div>

                          <div className={`apple-verdict-badge ${verdict.type}`}>
                            <span>{verdict.label}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Social Post Extraction Details */}
                    <div className="apple-post-card">
                      <div className="apple-post-top">
                        <div className="apple-post-author-box">
                          <div className="apple-post-avatar">
                            {detectedPlatform ? detectedPlatform.icon : '🔗'}
                          </div>
                          <div className="apple-post-meta-lines">
                            <div className="apple-post-author">
                              {detectedPlatform ? detectedPlatform.name : 'Social Post Extraction'}
                            </div>
                            <div className="apple-post-id-tag">
                              Extracted URL: {socialUrl}
                            </div>
                          </div>
                        </div>

                        <a
                          href={socialUrl}
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
                    </div>

                    {/* Dual Pane Language & Translation */}
                    <div className="apple-dual-pane">
                      <div className="apple-pane">
                        <div className="apple-pane-header">
                          <span>Extracted Social Caption</span>
                          <span className="apple-pane-badge">
                            {getLangMeta(result.detected_language).native} ({getLangMeta(result.detected_language).name})
                          </span>
                        </div>
                        <div className="apple-pane-text">
                          {result.text || 'No caption text was extracted.'}
                        </div>
                      </div>

                      <div className="apple-pane">
                        <div className="apple-pane-header">
                          <span>Neural English Translation</span>
                          <span className="apple-pane-badge" style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#fff', borderColor: 'rgba(255, 255, 255, 0.15)' }}>
                            Standardized Query
                          </span>
                        </div>
                        <div className="apple-pane-text">
                          {result.translated_text || result.text}
                        </div>
                      </div>
                    </div>

                    {/* Published Fact-Checks */}
                    <div className="apple-card">
                      <div className="apple-card-header">
                        <div className="apple-card-title-group">
                          <h2>Fact Check Findings & Reviews</h2>
                          <p>Authoritative debunking records retrieved from Google Fact Check Tools.</p>
                        </div>
                      </div>

                      {result.fact_check_results?.claims && result.fact_check_results.claims.length > 0 ? (
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
                      ) : (
                        <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--apple-label-secondary)' }}>
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.4, margin: '0 auto 12px auto' }}>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <div style={{ fontWeight: 600, color: 'var(--apple-label-primary)' }}>No Published Fact Checks Found</div>
                          <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                            This post statement has no indexed reviews in the Google Fact Check Tools database.
                          </div>
                        </div>
                      )}
                    </div>
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
        )}

        {/* TAB 2: API CALL CONSOLE */}
        {activeTab === 'api-studio' && (
          <div className="apple-fade-in">
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
                <div style={{ background: 'rgba(18, 18, 20, 0.6)', border: '1px solid var(--apple-border-light)', borderRadius: 'var(--radius-sm)', padding: '16px', fontFamily: 'var(--sf-mono)', fontSize: '0.84rem' }}>
                  <div style={{ color: 'var(--apple-label-secondary)' }}>// POST JSON Payload</div>
                  <div>&#123;</div>
                  <div style={{ paddingLeft: '20px' }}>
                    <span style={{ color: '#64d2ff' }}>"url"</span>: <span style={{ color: '#a7f3d0' }}>"https://x.com/NASA/status/1894238573928172635"</span> <span style={{ color: 'var(--apple-label-tertiary)' }}>// Required: Social media URL</span>
                  </div>
                  <div>&#125;</div>
                </div>

                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '24px 0 12px 0' }}>Response Payload Schema</h3>
                <div style={{ background: 'rgba(18, 18, 20, 0.6)', border: '1px solid var(--apple-border-light)', borderRadius: 'var(--radius-sm)', padding: '16px', fontFamily: 'var(--sf-mono)', fontSize: '0.84rem' }}>
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
        )}

        {/* TAB 3: AUDIT HISTORY */}
        {activeTab === 'history' && (
          <div className="apple-fade-in">
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
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--apple-label-secondary)' }}>
                  Loading verification archive...
                </div>
              ) : historyItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--apple-label-secondary)' }}>
                  No historical social post verifications found yet. Execute an API verification above to record it.
                </div>
              ) : (
                <div className="apple-history-list">
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
                          onClick={() => {
                            if (item.source_url) setSocialUrl(item.source_url);
                            setActiveTab('verifier');
                            setResult({
                              text: item.input_text,
                              detected_language: item.detected_language || 'en',
                              translated_text: item.translated_text || item.input_text,
                              fact_check_results: item.fact_check_results || { claims: [] }
                            });
                          }}
                        >
                          <div className="apple-history-content">
                            <div className="apple-history-text">{item.input_text}</div>
                            <div className="apple-history-meta">
                              {plat && (
                                <span className={`apple-platform-pill-detected ${plat.class}`} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                                  {plat.icon} {plat.name}
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
      </main>

      {/* Apple Footer */}
      <footer className="apple-footer">
        <div>Prism Intelligence Platform • Social Media Verification & Multi-Lingual Fact-Checking API</div>
        <div style={{ marginTop: '6px' }}>
          <a href="/docs" target="_blank" rel="noreferrer">OpenAPI Documentation</a>
          •
          <a href="https://github.com/saran612/Prism" target="_blank" rel="noreferrer">GitHub Repository</a>
          •
          <span>Strictly Social Link API Processing</span>
        </div>
      </footer>
    </div>
  );
}
