import React, { useState, useEffect } from 'react';
import './App.css';

const INDIC_LANGUAGES = [
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'en', name: 'English', native: 'English' }
];

const PRESET_SAMPLES = [
  {
    type: 'text',
    label: 'Lunar Discovery (Hindi)',
    text: 'वैज्ञानिकों ने चंद्रमा के ध्रुवों पर नए जल बर्फ भंडार की खोज की।'
  },
  {
    type: 'text',
    label: 'Viral Currency Claim (English)',
    text: 'Government has announced that old 500 rupee notes will be banned from tomorrow.'
  },
  {
    type: 'url',
    label: 'NASA Space Mission (X / Twitter)',
    url: 'https://x.com/NASA/status/1894238573928172635'
  },
  {
    type: 'url',
    label: 'Facebook Post Sample',
    url: 'https://www.facebook.com/share/p/101584920202020/'
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('studio'); // 'studio' | 'lab' | 'history' | 'specs'
  const [backendStatus, setBackendStatus] = useState({ online: false, version: '0.1.0' });

  // Verification Studio State
  const [inputType, setInputType] = useState('text'); // 'text' | 'url'
  const [claimText, setClaimText] = useState('');
  const [claimUrl, setClaimUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);

  // Translation Lab State
  const [labText, setLabText] = useState('');
  const [labDetectedLang, setLabDetectedLang] = useState(null);
  const [labTranslated, setLabTranslated] = useState('');
  const [labLoading, setLabLoading] = useState(false);

  // Audit History State
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  // Ping Backend Health
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

  // Fetch History on tab switch
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/v1/history');
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(data);
      }
    } catch (e) {
      console.error('History fetch failed:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  // Execute Fact Check
  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setVerificationResult(null);

    const payload = {};
    if (inputType === 'text') {
      if (!claimText.trim()) {
        setError('Please enter a claim statement or text to analyze.');
        return;
      }
      payload.text = claimText.trim();
    } else {
      if (!claimUrl.trim()) {
        setError('Please enter a valid social media URL (X, Instagram, Facebook).');
        return;
      }
      payload.url = claimUrl.trim();
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
        throw new Error(data.error || data.detail || 'Verification service encountered an error.');
      }
      setVerificationResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Run Translation Lab
  const handleRunLab = async () => {
    if (!labText.trim()) return;
    setLabLoading(true);
    setLabDetectedLang(null);
    setLabTranslated('');

    try {
      const detRes = await fetch('/api/v1/translation/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: labText })
      });
      const detData = await detRes.json();
      setLabDetectedLang(detData.detected_language);

      const transRes = await fetch('/api/v1/translation/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: labText,
          source_language: detData.detected_language,
          target_language: 'en'
        })
      });
      const transData = await transRes.json();
      setLabTranslated(transData.translated_text);
    } catch (e) {
      console.error(e);
    } finally {
      setLabLoading(false);
    }
  };

  const getLanguageMeta = (code) => {
    if (!code) return { name: 'Unknown', native: '' };
    const found = INDIC_LANGUAGES.find((l) => l.code === code.toLowerCase());
    return found ? found : { name: code.toUpperCase(), native: '' };
  };

  const computeVerdict = (results) => {
    if (!results || !results.claims || results.claims.length === 0) {
      return {
        rating: 'Unverified / No Registry Match',
        type: 'unverified',
        description: 'No debunking records or registered fact checks matched this claim in official databases.'
      };
    }

    const review = results.claims[0]?.claimReview?.[0];
    const textRating = review?.textualRating || '';
    const lower = textRating.toLowerCase();

    if (lower.includes('false') || lower.includes('fake') || lower.includes('debunk') || lower.includes('misleading') || lower.includes('incorrect')) {
      return {
        rating: textRating || 'Debunked / False',
        type: 'false',
        description: `Flagged as false or misleading by verified fact-checking organizations.`
      };
    }

    if (lower.includes('true') || lower.includes('correct') || lower.includes('accurate')) {
      return {
        rating: textRating || 'Verified True',
        type: 'true',
        description: `Corroborated as verified truth by credible fact checkers.`
      };
    }

    return {
      rating: textRating || 'Claim Reviewed',
      type: 'unverified',
      description: `Rating recorded: "${textRating}".`
    };
  };

  return (
    <div className="apple-app">
      {/* Apple Frosted Navigation Bar */}
      <nav className="apple-nav">
        <div className="apple-nav-inner">
          <div className="apple-brand" onClick={() => setActiveTab('studio')}>
            <div className="apple-brand-icon">
              {/* Apple-style Geometric Prism Emblem */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 22 22 22" />
                <line x1="12" y1="2" x2="12" y2="22" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
              </svg>
            </div>
            <span className="apple-brand-title">Prism</span>
            <span className="apple-brand-pill">Intelligence</span>
          </div>

          <div className="apple-nav-actions">
            <div className={`apple-status-capsule ${backendStatus.online ? 'online' : 'offline'}`} id="backend-status-pill">
              <span className="apple-status-indicator"></span>
              <span>{backendStatus.online ? `Engine v${backendStatus.version}` : 'Connecting Engine...'}</span>
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
          <div className="apple-eyebrow">Prism Intelligence • Multi-Lingual Fact System</div>
          <h1 className="apple-hero-title">Truth, in every tongue.</h1>
          <p className="apple-hero-sub">
            The real-time verification engine engineered for Indian social media streams. Instant language identification, neural translation, and multi-publisher credibility analysis.
          </p>

          {/* Indic Language Strip */}
          <div className="apple-indic-strip">
            {INDIC_LANGUAGES.map((l) => (
              <span key={l.code} className="apple-indic-chip">
                {l.native} • {l.name}
              </span>
            ))}
          </div>
        </header>

        {/* Apple Segmented Control */}
        <div className="apple-segmented-nav">
          <div className="apple-segmented-container" role="tablist">
            <button
              className={`apple-segment-item ${activeTab === 'studio' ? 'active' : ''}`}
              onClick={() => setActiveTab('studio')}
              id="segment-studio"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Verification Studio
            </button>

            <button
              className={`apple-segment-item ${activeTab === 'lab' ? 'active' : ''}`}
              onClick={() => setActiveTab('lab')}
              id="segment-lab"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m5 8 6 6" />
                <path d="m4 14 6-6 2-3" />
                <path d="M2 5h12" />
                <path d="M7 2h1" />
                <path d="m22 22-5-10-5 10" />
                <path d="M14 18h6" />
              </svg>
              Translation Lab
            </button>

            <button
              className={`apple-segment-item ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
              id="segment-history"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Audit History
            </button>

            <button
              className={`apple-segment-item ${activeTab === 'specs' ? 'active' : ''}`}
              onClick={() => setActiveTab('specs')}
              id="segment-specs"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Engine Specs
            </button>
          </div>
        </div>

        {/* TAB 1: VERIFICATION STUDIO */}
        {activeTab === 'studio' && (
          <div className="apple-fade-in">
            {/* Input Surface */}
            <div className="apple-card">
              <div className="apple-card-header">
                <div className="apple-card-title-group">
                  <h2>Verify Social Post or Claim</h2>
                  <p>Paste any social URL or type a claim in Hindi, Tamil, Telugu, or English.</p>
                </div>

                {/* Text vs URL switch */}
                <div className="apple-input-picker">
                  <button
                    type="button"
                    className={`apple-picker-btn ${inputType === 'text' ? 'active' : ''}`}
                    onClick={() => setInputType('text')}
                    id="picker-text"
                  >
                    Claim Text
                  </button>
                  <button
                    type="button"
                    className={`apple-picker-btn ${inputType === 'url' ? 'active' : ''}`}
                    onClick={() => setInputType('url')}
                    id="picker-url"
                  >
                    Social Media Link
                  </button>
                </div>
              </div>

              {/* Sample Shortcuts */}
              <div className="apple-samples-container">
                <span className="apple-samples-label">Presets:</span>
                {PRESET_SAMPLES.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="apple-sample-pill"
                    onClick={() => {
                      setInputType(sample.type);
                      if (sample.type === 'text') setClaimText(sample.text);
                      else setClaimUrl(sample.url);
                    }}
                    id={`preset-${idx}`}
                  >
                    {sample.label}
                  </button>
                ))}
              </div>

              {/* Form Input */}
              <form onSubmit={handleVerify}>
                <div className="apple-input-field-wrap">
                  {inputType === 'text' ? (
                    <textarea
                      id="apple-claim-input"
                      className="apple-textarea"
                      placeholder="Type or paste any viral statement, news claim, or post caption in any Indian language..."
                      value={claimText}
                      onChange={(e) => setClaimText(e.target.value)}
                    />
                  ) : (
                    <input
                      id="apple-url-input"
                      type="url"
                      className="apple-input"
                      placeholder="https://x.com/... or https://www.instagram.com/reel/... or https://facebook.com/..."
                      value={claimUrl}
                      onChange={(e) => setClaimUrl(e.target.value)}
                    />
                  )}
                </div>

                {error && (
                  <div className="apple-error-banner" id="verification-error">
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
                    disabled={loading}
                    id="btn-apple-verify"
                  >
                    {loading ? (
                      <>
                        <svg className="apple-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="16" />
                        </svg>
                        <span>Analyzing Credibility...</span>
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        <span>Verify Claim</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="apple-btn-secondary"
                    onClick={() => {
                      setClaimText('');
                      setClaimUrl('');
                      setVerificationResult(null);
                      setError(null);
                    }}
                    id="btn-apple-clear"
                  >
                    Clear
                  </button>
                </div>
              </form>
            </div>

            {/* Results Inspection Surface */}
            {verificationResult && (
              <div className="apple-results apple-fade-in" id="apple-verification-results">
                {/* Verdict Island */}
                {(() => {
                  const verdict = computeVerdict(verificationResult.fact_check_results);
                  return (
                    <div className={`apple-verdict-island ${verdict.type}`}>
                      <div className="apple-verdict-info">
                        <span className="apple-verdict-eyebrow">Verification Classification</span>
                        <div className="apple-verdict-title">{verdict.rating}</div>
                        <div className="apple-verdict-desc">{verdict.description}</div>
                      </div>

                      <div className={`apple-verdict-badge ${verdict.type}`}>
                        <span>{verdict.rating}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Dual Pane Language & Translation */}
                <div className="apple-dual-pane">
                  <div className="apple-pane">
                    <div className="apple-pane-header">
                      <span>Source Query</span>
                      <span className="apple-pane-badge">
                        {getLanguageMeta(verificationResult.detected_language).native} (
                        {getLanguageMeta(verificationResult.detected_language).name})
                      </span>
                    </div>
                    <div className="apple-pane-text">
                      {verificationResult.text}
                    </div>
                  </div>

                  <div className="apple-pane">
                    <div className="apple-pane-header">
                      <span>Neural English Representation</span>
                      <span className="apple-pane-badge" style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#fff', borderColor: 'rgba(255, 255, 255, 0.15)' }}>
                        Standardized EN
                      </span>
                    </div>
                    <div className="apple-pane-text">
                      {verificationResult.translated_text || verificationResult.text}
                    </div>
                  </div>
                </div>

                {/* Published Fact-Checks */}
                <div className="apple-card">
                  <div className="apple-card-header">
                    <div className="apple-card-title-group">
                      <h2>Registry Findings & Reviews</h2>
                      <p>Authoritative debunking records retrieved from Google Fact Check Tools.</p>
                    </div>
                  </div>

                  {verificationResult.fact_check_results?.claims && verificationResult.fact_check_results.claims.length > 0 ? (
                    <div className="apple-findings-list">
                      {verificationResult.fact_check_results.claims.map((claim, idx) => {
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
                              <strong style={{ color: 'var(--apple-label-primary)' }}>Claim: </strong>
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
                      <div style={{ fontWeight: 600, color: 'var(--apple-label-primary)' }}>No Published Debunking Records Found</div>
                      <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
                        This statement has no indexed reviews in the verification database.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TRANSLATION LAB */}
        {activeTab === 'lab' && (
          <div className="apple-fade-in">
            <div className="apple-card">
              <div className="apple-card-header">
                <div className="apple-card-title-group">
                  <h2>Indic Language & Translation Lab</h2>
                  <p>Direct access to Prism's neural script detection and machine translation pipeline.</p>
                </div>
              </div>

              <div className="apple-input-field-wrap">
                <textarea
                  id="apple-lab-input"
                  className="apple-textarea"
                  placeholder="Enter text in Hindi, Tamil, Telugu, Bengali, Kannada, Marathi, Gujarati, or Punjabi..."
                  value={labText}
                  onChange={(e) => setLabText(e.target.value)}
                />
              </div>

              <div className="apple-action-bar" style={{ marginBottom: '24px' }}>
                <button
                  type="button"
                  className="apple-btn-primary"
                  onClick={handleRunLab}
                  disabled={labLoading || !labText.trim()}
                  id="btn-apple-lab-run"
                >
                  {labLoading ? 'Processing Pipeline...' : 'Detect Script & Translate'}
                </button>
              </div>

              {(labDetectedLang || labTranslated) && (
                <div className="apple-dual-pane apple-fade-in">
                  <div className="apple-pane">
                    <div className="apple-pane-header">
                      <span>Detected Script</span>
                      <span className="apple-pane-badge">
                        {getLanguageMeta(labDetectedLang).native} ({getLanguageMeta(labDetectedLang).name})
                      </span>
                    </div>
                    <div className="apple-pane-text">{labText}</div>
                  </div>

                  <div className="apple-pane">
                    <div className="apple-pane-header">
                      <span>Neural English Translation</span>
                      <span className="apple-pane-badge" style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#fff', borderColor: 'rgba(255, 255, 255, 0.15)' }}>
                        Target: EN
                      </span>
                    </div>
                    <div className="apple-pane-text">{labTranslated || 'Translating...'}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT HISTORY */}
        {activeTab === 'history' && (
          <div className="apple-fade-in">
            <div className="apple-card">
              <div className="apple-card-header">
                <div className="apple-card-title-group">
                  <h2>Verification Audit Log</h2>
                  <p>Complete historical trace of verified claims and social extractions.</p>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Search records..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="apple-input"
                    style={{ width: '200px', padding: '8px 14px', fontSize: '0.82rem' }}
                  />
                  <button
                    type="button"
                    className="apple-btn-secondary"
                    onClick={fetchHistory}
                    disabled={historyLoading}
                    style={{ padding: '8px 14px' }}
                  >
                    ↻
                  </button>
                </div>
              </div>

              {historyLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--apple-label-secondary)' }}>
                  Loading verification records...
                </div>
              ) : historyItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--apple-label-secondary)' }}>
                  No historical records logged yet. Verify a claim in the Studio to record it.
                </div>
              ) : (
                <div className="apple-history-list">
                  {historyItems
                    .filter((item) =>
                      !historySearch ||
                      item.input_text?.toLowerCase().includes(historySearch.toLowerCase()) ||
                      item.translated_text?.toLowerCase().includes(historySearch.toLowerCase())
                    )
                    .map((item) => (
                      <div
                        key={item.id}
                        className="apple-history-item"
                        onClick={() => {
                          setActiveTab('studio');
                          setVerificationResult({
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
                            <span className="apple-pane-badge" style={{ padding: '2px 7px', fontSize: '0.68rem' }}>
                              {getLanguageMeta(item.detected_language).name}
                            </span>
                            {item.source_url && <span>Source: {item.source_url}</span>}
                            {item.created_at && <span>{new Date(item.created_at).toLocaleString()}</span>}
                          </div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--apple-label-tertiary)' }}>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: ENGINE SPECS */}
        {activeTab === 'specs' && (
          <div className="apple-fade-in">
            <div className="apple-specs-grid">
              <div className="apple-spec-box">
                <div className="apple-spec-number">10+</div>
                <div className="apple-spec-title">Indian Languages</div>
                <div className="apple-spec-desc">
                  Native support for Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, and English.
                </div>
              </div>

              <div className="apple-spec-box">
                <div className="apple-spec-number">&lt;200ms</div>
                <div className="apple-spec-title">Language Inference</div>
                <div className="apple-spec-desc">
                  Sub-second script identification using character n-gram profiles and statistical language models.
                </div>
              </div>

              <div className="apple-spec-box">
                <div className="apple-spec-number">3 Platforms</div>
                <div className="apple-spec-title">Social Extraction</div>
                <div className="apple-spec-desc">
                  Automated caption, post ID, and author extraction for X / Twitter, Instagram Reels, and Facebook Shares.
                </div>
              </div>

              <div className="apple-spec-box">
                <div className="apple-spec-number">Global</div>
                <div className="apple-spec-title">Fact Check Registry</div>
                <div className="apple-spec-desc">
                  Direct integration with Google Fact Check Tools API aggregating reviews from certified global and Indian fact checkers.
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Apple Footer */}
      <footer className="apple-footer">
        <div>Prism Intelligence Platform • Precision Fact Verification for Indic Social Media</div>
        <div style={{ marginTop: '6px' }}>
          <a href="/docs" target="_blank" rel="noreferrer">OpenAPI Documentation</a>
          •
          <a href="https://github.com/saran612/Prism" target="_blank" rel="noreferrer">Repository</a>
          •
          <span>Built for Truth & Integrity</span>
        </div>
      </footer>
    </div>
  );
}
