import React, { useState, useEffect } from 'react';

export default function ClaimDetailPanel({ claim = null, onInspectClaim = null }) {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [claim?.id, claim?.thumbnail_url]);

  if (!claim) {
    return (
      <div className="prism-detail-panel prism-panel-card apple-settle-in">
        <div className="prism-panel-header">
          <div className="prism-panel-title">CLAIM DETAIL</div>
        </div>
        <div className="prism-detail-empty">
          <div className="prism-detail-empty-icon">⌘</div>
          <div className="prism-detail-empty-text">Select a claim from the list to inspect veracity verification & evidence.</div>
        </div>
      </div>
    );
  }

  const state = claim.state || 'Unverified';
  const stateClass = state.toLowerCase();
  const source = claim.source || 'llm_inferred';
  const fullText = claim.claim || claim.text || 'No claim text available.';
  const evidenceList = Array.isArray(claim.evidence) ? claim.evidence : [];
  const publisherName = claim.publisher || 'Verified Fact-Check Publisher';
  const factCheckUrl = claim.url || claim.source_url;
  const createdAtFormatted = claim.created_at ? new Date(claim.created_at).toLocaleString() : null;

  const getPlatformMeta = (url) => {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('twitter.com') || lower.includes('x.com')) return { name: 'X / Twitter', icon: '𝕏' };
    if (lower.includes('instagram.com')) return { name: 'Instagram', icon: '📸' };
    if (lower.includes('facebook.com') || lower.includes('fb.')) return { name: 'Facebook', icon: '👥' };
    return null;
  };
  const platform = getPlatformMeta(claim.source_url || claim.url);

  return (
    <div className="prism-detail-panel prism-panel-card apple-settle-in" key={claim.id}>
      <div className="prism-panel-header">
        <div className="prism-panel-title">CLAIM DETAIL</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onInspectClaim && (
            <button
              type="button"
              className="prism-btn-inspect-verifier"
              onClick={() => onInspectClaim(claim)}
              title="Open full verification report in Verifier page"
            >
              <span>Open in Verifier →</span>
            </button>
          )}
          <span className="prism-detail-source-badge">{source}</span>
        </div>
      </div>

      <div className="prism-detail-body">
        {/* Post Thumbnail Image Box */}
        <div className="prism-detail-section">
          <div className="prism-detail-label">POST THUMBNAIL</div>
          <div className="prism-detail-image-box">
            {claim.thumbnail_url && !imgFailed ? (
              <div className="prism-detail-image-wrapper">
                <img
                  src={claim.thumbnail_url}
                  alt="Post Media Thumbnail"
                  className="prism-detail-thumb-img"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                />
                {platform && (
                  <span className="prism-detail-image-badge">
                    {platform.icon} {platform.name}
                  </span>
                )}
              </div>
            ) : (
              <div className="prism-detail-thumb-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>No media attachment</span>
              </div>
            )}
          </div>
        </div>

        {/* Full Claim Text */}
        <div className="prism-detail-section">
          <div className="prism-detail-label">CLAIM STATEMENT</div>
          <div
            className={`prism-detail-claim-text ${onInspectClaim ? 'prism-clickable-claim' : ''}`}
            onClick={() => onInspectClaim && onInspectClaim(claim)}
            title={onInspectClaim ? 'Click to inspect in Verifier page' : ''}
            style={{ cursor: onInspectClaim ? 'pointer' : 'default' }}
          >
            {fullText}
            {onInspectClaim && (
              <span className="prism-claim-click-hint"> ↗</span>
            )}
          </div>
        </div>

        {/* English Translation (if translated from non-English) */}
        {claim.translated_text && claim.translated_text !== fullText && (
          <div className="prism-detail-section">
            <div className="prism-detail-label">ENGLISH TRANSLATION</div>
            <div className="prism-detail-claim-text" style={{ fontStyle: 'italic', color: '#64d2ff' }}>
              {claim.translated_text}
            </div>
          </div>
        )}

        {/* State & Score Badges */}
        <div className="prism-detail-verdict-row">
          <div className={`prism-detail-state-pill ${stateClass}`}>
            <span className="prism-state-dot"></span>
            <span>{state}</span>
          </div>
          <div className="prism-detail-score-pill">
            <span className="prism-detail-score-num">{claim.score ?? 0}</span>
            <span className="prism-detail-score-unit">/ 100</span>
          </div>
        </div>

        {/* Conditional Source Drill-Down */}
        {source === 'known_factcheck' ? (
          <div className="prism-detail-section">
            <div className="prism-detail-label">FACT-CHECK PUBLISHER</div>
            <div className="prism-detail-publisher-card">
              <div className="prism-detail-publisher-name">{publisherName}</div>
              {factCheckUrl && (
                <a
                  href={factCheckUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="prism-detail-link"
                >
                  <span>View Original Fact-Check</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M7 17l9.2-9.2M17 17V8H8" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        ) : source === 'llm_direct_guess' ? (
          <div className="prism-detail-section">
            <div className="prism-detail-label">VERIFICATION METHOD</div>
            <div className="prism-detail-publisher-card">
              <div className="prism-detail-publisher-name">🤖 Gemini Direct LLM Knowledge</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--apple-label-secondary)', marginTop: '4px' }}>
                Evaluated directly from LLM parametric memory without external web retrieval.
              </div>
            </div>
          </div>
        ) : (
          <div className="prism-detail-section">
            <div className="prism-detail-label">EVIDENCE SOURCES ({evidenceList.length})</div>
            {evidenceList.length === 0 ? (
              <div className="prism-detail-no-evidence">
                No external domain snippets were required or retrieved for this inference.
              </div>
            ) : (
              <div className="prism-detail-evidence-list">
                {evidenceList.map((ev, idx) => (
                  <div key={idx} className="prism-detail-evidence-item">
                    <div className="prism-evidence-domain">
                      {ev.domain || 'reputable-source'}
                    </div>
                    {ev.title && <div className="prism-evidence-title">{ev.title}</div>}
                    {ev.snippet && <div className="prism-evidence-snippet">"{ev.snippet}"</div>}
                    {ev.url && (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="prism-evidence-link"
                      >
                        Read Source Article →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Primary Redirect Action Button */}
        {onInspectClaim && (
          <div className="prism-detail-section" style={{ marginTop: '16px', marginBottom: '8px' }}>
            <button
              type="button"
              className="prism-detail-inspect-btn"
              onClick={() => onInspectClaim(claim)}
              id="detail-inspect-verifier-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </svg>
              <span>Inspect Details in Verifier Page</span>
            </button>
          </div>
        )}

        {/* Timestamp */}
        {createdAtFormatted && (
          <div className="prism-detail-footer">
            <span className="prism-detail-label-sm">RECORDED</span>
            <span className="prism-detail-timestamp">{createdAtFormatted}</span>
          </div>
        )}
      </div>
    </div>
  );
}
