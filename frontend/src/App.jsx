import React, { useState, useEffect } from 'react';
import './App.css';

const INDIAN_LANGUAGES = [
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'bn', name: 'Bengali (বাংলা)' },
  { code: 'mr', name: 'Marathi (मराठी)' },
  { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
  { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'ml', name: 'Malayalam (മലയാളം)' },
  { code: 'pa', name: 'Punjabi (ਪੰਜਾਬੀ)' },
  { code: 'en', name: 'English' }
];

const SAMPLE_CLAIMS = [
  {
    type: 'text',
    label: 'Viral Moon Discovery (Hindi)',
    text: 'वैज्ञानिकों ने चंद्रमा के ध्रुवों पर नए जल बर्फ भंडार की खोज की।'
  },
  {
    type: 'text',
    label: 'Claim: Fake Currency (English)',
    text: 'Government has announced that old 500 rupee notes will be banned from tomorrow.'
  },
  {
    type: 'url',
    label: 'Twitter Post Sample',
    url: 'https://x.com/NASA/status/1894238573928172635'
  },
  {
    type: 'url',
    label: 'Facebook Post Sample',
    url: 'https://www.facebook.com/share/p/101584920202020/'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('checker'); // 'checker' | 'translation' | 'history'
  const [backendOnline, setBackendOnline] = useState(false);
  const [backendVersion, setBackendVersion] = useState('0.1.0');

  // Checker State
  const [inputType, setInputType] = useState('text'); // 'text' | 'url'
  const [textInput, setTextInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Translation Sandbox State
  const [transInput, setTransInput] = useState('');
  const [detectedLang, setDetectedLang] = useState(null);
  const [translatedText, setTranslatedText] = useState('');
  const [transLoading, setTransLoading] = useState(false);

  // History State
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('');

  // Check backend health
  const checkHealth = async () => {
    try {
      const res = await fetch('/');
      if (res.ok) {
        const data = await res.json();
        setBackendOnline(true);
        if (data.version) setBackendVersion(data.version);
      } else {
        setBackendOnline(false);
      }
    } catch {
      setBackendOnline(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
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
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  // Handle Fact Check Submit
  const handleCheck = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setResult(null);

    const payload = {};
    if (inputType === 'text') {
      if (!textInput.trim()) {
        setError('Please enter a claim statement or news caption to check.');
        return;
      }
      payload.text = textInput.trim();
    } else {
      if (!urlInput.trim()) {
        setError('Please enter a social media post URL.');
        return;
      }
      payload.url = urlInput.trim();
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Verification request failed');
      }
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Translation Sandbox
  const handleTranslateSandbox = async () => {
    if (!transInput.trim()) return;
    setTransLoading(true);
    setDetectedLang(null);
    setTranslatedText('');

    try {
      const detRes = await fetch('/api/v1/translation/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transInput })
      });
      const detData = await detRes.json();
      setDetectedLang(detData.detected_language);

      const transRes = await fetch('/api/v1/translation/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: transInput,
          source_language: detData.detected_language,
          target_language: 'en'
        })
      });
      const transData = await transRes.json();
      setTranslatedText(transData.translated_text);
    } catch (err) {
      console.error(err);
    } finally {
      setTransLoading(false);
    }
  };

  // Helper to load sample
  const applySample = (sample) => {
    setInputType(sample.type);
    if (sample.type === 'text') {
      setTextInput(sample.text);
    } else {
      setUrlInput(sample.url);
    }
  };

  // Get Language Label
  const getLanguageLabel = (code) => {
    if (!code) return 'Unknown';
    const found = INDIAN_LANGUAGES.find((l) => l.code === code.toLowerCase());
    return found ? found.name : code.toUpperCase();
  };

  // Determine Verdict style
  const getVerdictInfo = (results) => {
    if (!results || !results.claims || results.claims.length === 0) {
      return {
        label: 'No Debunking Found / Unverified',
        type: 'unverified',
        description: 'No prior fact checks matched this claim in the verification registry.'
      };
    }

    const firstReview = results.claims[0]?.claimReview?.[0];
    const rating = firstReview?.textualRating?.toLowerCase() || '';

    if (rating.includes('false') || rating.includes('fake') || rating.includes('incorrect') || rating.includes('misleading') || rating.includes('debunked')) {
      return {
        label: 'Debunked / False Claim',
        type: 'false',
        description: `Flagged as: "${firstReview?.textualRating || 'False'}" by fact-checking organizations.`
      };
    } else if (rating.includes('true') || rating.includes('correct') || rating.includes('verified')) {
      return {
        label: 'Verified True / Credible',
        type: 'true',
        description: `Verified by fact checkers as: "${firstReview?.textualRating}".`
      };
    }

    return {
      label: firstReview?.textualRating || 'Claim Reviewed',
      type: 'unverified',
      description: `Rating: ${firstReview?.textualRating || 'Uncategorized'}`
    };
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="brand-logo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div className="brand-text">
            <h1>PRISM</h1>
            <p>Real-Time Multi-Lingual Social Media Fact-Check Engine</p>
          </div>
        </div>

        <div className="header-actions">
          <div className={`status-badge ${backendOnline ? 'online' : 'offline'}`} id="backend-status">
            <span className="status-dot"></span>
            <span>{backendOnline ? `API Live (v${backendVersion})` : 'Connecting to API...'}</span>
          </div>
          <a href="/docs" target="_blank" rel="noreferrer" className="docs-link" id="api-docs-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            API Docs
          </a>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="nav-tabs" role="tablist">
        <button
          className={`nav-tab-btn ${activeTab === 'checker' ? 'active' : ''}`}
          onClick={() => setActiveTab('checker')}
          id="tab-checker"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Fact Checker
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'translation' ? 'active' : ''}`}
          onClick={() => setActiveTab('translation')}
          id="tab-translation"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m5 8 6 6" />
            <path d="m4 14 6-6 2-3" />
            <path d="M2 5h12" />
            <path d="M7 2h1" />
            <path d="m22 22-5-10-5 10" />
            <path d="M14 18h6" />
          </svg>
          Translation Studio
        </button>

        <button
          className={`nav-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
          id="tab-history"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Verification History
        </button>
      </nav>

      {/* TAB 1: FACT CHECKER */}
      {activeTab === 'checker' && (
        <div className="animate-fade-in">
          {/* Supported Languages */}
          <div className="languages-banner">
            <span className="lang-label">Supported Languages:</span>
            {INDIAN_LANGUAGES.map((l) => (
              <span key={l.code} className="lang-tag">
                {l.name}
              </span>
            ))}
          </div>

          <div className="prism-card">
            {/* Input Type Switcher */}
            <div className="input-switch">
              <button
                type="button"
                className={`switch-pill ${inputType === 'text' ? 'active' : ''}`}
                onClick={() => setInputType('text')}
                id="switch-mode-text"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Claim Text / Headline
              </button>

              <button
                type="button"
                className={`switch-pill ${inputType === 'url' ? 'active' : ''}`}
                onClick={() => setInputType('url')}
                id="switch-mode-url"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                Social Media URL (X, Instagram, Facebook)
              </button>
            </div>

            {/* Quick Samples */}
            <div className="samples-bar">
              <span className="samples-title">Try Example:</span>
              {SAMPLE_CLAIMS.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="sample-chip"
                  onClick={() => applySample(s)}
                  id={`sample-btn-${idx}`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Form */}
            <form onSubmit={handleCheck}>
              {inputType === 'text' ? (
                <div className="input-group">
                  <label className="input-label" htmlFor="claim-text-input">
                    <span>Enter Claim or Social Post Text</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>Auto-Detects Indian Languages</span>
                  </label>
                  <textarea
                    id="claim-text-input"
                    className="text-area"
                    placeholder="Type or paste any claim text in Hindi, Tamil, Telugu, English or any supported language..."
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                  />
                </div>
              ) : (
                <div className="input-group">
                  <label className="input-label" htmlFor="claim-url-input">
                    <span>Paste Social Media Post URL</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>Supports X / Twitter, Instagram & Facebook</span>
                  </label>
                  <input
                    id="claim-url-input"
                    type="url"
                    className="text-input"
                    placeholder="https://x.com/username/status/... or https://www.instagram.com/p/..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                  />
                </div>
              )}

              {error && (
                <div style={{ padding: '12px 16px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: 'var(--radius-sm)', color: '#fb7185', fontSize: '0.88rem', marginBottom: '16px' }}>
                  {error}
                </div>
              )}

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  id="btn-verify"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="2" x2="12" y2="6" />
                        <line x1="12" y1="18" x2="12" y2="22" />
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                        <line x1="2" y1="12" x2="6" y2="12" />
                        <line x1="18" y1="12" x2="22" y2="12" />
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                      </svg>
                      Verifying Claim...
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      Verify Fact
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setTextInput('');
                    setUrlInput('');
                    setResult(null);
                    setError(null);
                  }}
                  id="btn-clear"
                >
                  Clear
                </button>
              </div>
            </form>
          </div>

          {/* Results Display */}
          {result && (
            <div className="results-container animate-fade-in" id="factcheck-results">
              {/* Verdict Header */}
              {(() => {
                const verdict = getVerdictInfo(result.fact_check_results);
                return (
                  <div className="verdict-header">
                    <div className="verdict-meta">
                      <h3>Verification Analysis</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                        {verdict.description}
                      </p>
                    </div>
                    <div className={`verdict-pill ${verdict.type}`}>
                      <span>{verdict.label}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Language & Translation Compare */}
              <div className="compare-grid">
                <div className="compare-card">
                  <div className="compare-header">
                    <span>Input Content</span>
                    <span className="lang-badge">
                      {getLanguageLabel(result.detected_language)}
                    </span>
                  </div>
                  <div className="compare-body">
                    {result.text}
                  </div>
                </div>

                <div className="compare-card">
                  <div className="compare-header">
                    <span>Standardized English Translation</span>
                    <span className="lang-badge" style={{ background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-primary)', borderColor: 'rgba(99, 102, 241, 0.3)' }}>
                      EN Query
                    </span>
                  </div>
                  <div className="compare-body">
                    {result.translated_text || result.text}
                  </div>
                </div>
              </div>

              {/* Matched Claims */}
              <div className="claims-section">
                <h4 className="section-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  Fact Check Findings & Publisher Reviews
                </h4>

                {result.fact_check_results?.claims && result.fact_check_results.claims.length > 0 ? (
                  result.fact_check_results.claims.map((claim, cIdx) => (
                    <div key={cIdx} className="claim-item">
                      <div className="claim-top">
                        <div className="publisher-info">
                          <span className="publisher-name">
                            {claim.claimReview?.[0]?.publisher?.name || 'Fact Check Review'}
                          </span>
                          {claim.claimReview?.[0]?.publisher?.site && (
                            <span className="publisher-site">
                              ({claim.claimReview[0].publisher.site})
                            </span>
                          )}
                        </div>
                        {claim.claimReview?.[0]?.textualRating && (
                          <span className={`rating-badge ${claim.claimReview[0].textualRating.toLowerCase().includes('false') ? 'false' : 'true'}`}>
                            {claim.claimReview[0].textualRating}
                          </span>
                        )}
                      </div>

                      <div className="claim-content-text">
                        <strong>Claim Reviewed: </strong>
                        {claim.text}
                      </div>

                      {claim.claimReview?.[0]?.title && (
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                          <em>{claim.claimReview[0].title}</em>
                        </div>
                      )}

                      <div className="claim-footer">
                        <span>
                          {claim.claimant ? `Claimant: ${claim.claimant}` : 'Social Media Stream'}
                          {claim.claimReview?.[0]?.reviewDate && ` • ${new Date(claim.claimReview[0].reviewDate).toLocaleDateString()}`}
                        </span>

                        {claim.claimReview?.[0]?.url && (
                          <a
                            href={claim.claimReview[0].url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="article-link"
                          >
                            Read Full Fact Check
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <p style={{ fontWeight: 600 }}>No published fact checks found in registry</p>
                    <p style={{ fontSize: '0.84rem', marginTop: '6px' }}>
                      This claim does not have matching entries in the Google Fact Check Tools database.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TRANSLATION STUDIO */}
      {activeTab === 'translation' && (
        <div className="animate-fade-in">
          <div className="prism-card">
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
              Multi-Lingual Translation & Detection Sandbox
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '20px' }}>
              Test Prism's internal language identification and machine translation pipeline directly.
            </p>

            <div className="input-group">
              <label className="input-label" htmlFor="trans-input">
                Indian Language Text Input
              </label>
              <textarea
                id="trans-input"
                className="text-area"
                placeholder="Enter text in Hindi, Tamil, Telugu, Bengali, Kannada, Marathi, or Gujarati..."
                value={transInput}
                onChange={(e) => setTransInput(e.target.value)}
              />
            </div>

            <div className="form-actions" style={{ marginBottom: '24px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleTranslateSandbox}
                disabled={transLoading || !transInput.trim()}
                id="btn-run-translate"
              >
                {transLoading ? 'Processing...' : 'Detect & Translate to English'}
              </button>
            </div>

            {(detectedLang || translatedText) && (
              <div className="compare-grid animate-fade-in">
                <div className="compare-card">
                  <div className="compare-header">
                    <span>Detected Language</span>
                    <span className="lang-badge">{getLanguageLabel(detectedLang)} ({detectedLang})</span>
                  </div>
                  <div className="compare-body">
                    {transInput}
                  </div>
                </div>

                <div className="compare-card">
                  <div className="compare-header">
                    <span>English Translation</span>
                    <span className="lang-badge" style={{ background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-primary)', borderColor: 'rgba(99, 102, 241, 0.3)' }}>Target: EN</span>
                  </div>
                  <div className="compare-body">
                    {translatedText || 'Translation empty'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: HISTORY */}
      {activeTab === 'history' && (
        <div className="animate-fade-in">
          <div className="prism-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Verification Audit Log</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Persisted queries processed through Prism fact checking pipeline
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  className="text-input"
                  style={{ width: '220px', padding: '8px 12px', fontSize: '0.85rem' }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={fetchHistory}
                  disabled={historyLoading}
                  style={{ padding: '8px 14px' }}
                >
                  ↻ Refresh
                </button>
              </div>
            </div>

            {historyLoading ? (
              <div className="empty-state">
                <p>Loading historical records...</p>
              </div>
            ) : historyItems.length === 0 ? (
              <div className="empty-state">
                <p>No verification history found yet.</p>
                <p style={{ fontSize: '0.82rem', marginTop: '4px' }}>Run a fact check to see it recorded here.</p>
              </div>
            ) : (
              <div className="history-list">
                {historyItems
                  .filter((item) =>
                    !historyFilter ||
                    (item.input_text && item.input_text.toLowerCase().includes(historyFilter.toLowerCase())) ||
                    (item.translated_text && item.translated_text.toLowerCase().includes(historyFilter.toLowerCase()))
                  )
                  .map((item) => (
                    <div
                      key={item.id}
                      className="history-card"
                      onClick={() => {
                        setActiveTab('checker');
                        setResult({
                          text: item.input_text,
                          detected_language: item.detected_language || 'en',
                          translated_text: item.translated_text || item.input_text,
                          fact_check_results: item.fact_check_results || { claims: [] }
                        });
                      }}
                    >
                      <div className="history-info">
                        <div className="history-text">{item.input_text}</div>
                        <div className="history-sub">
                          <span className="lang-badge" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>
                            {getLanguageLabel(item.detected_language)}
                          </span>
                          {item.source_url && <span>Source: {item.source_url}</span>}
                          {item.created_at && <span>{new Date(item.created_at).toLocaleString()}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>View &rarr;</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
