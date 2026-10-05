import React from 'react';

export default function RecentClaimsPanel({ claims = [], selectedClaim = null, onSelectClaim, onInspectClaim = null, loading = false }) {
  const handleSelect = (c) => {
    console.log('[RecentClaimsPanel] Selected claim:', c);
    if (onSelectClaim) {
      onSelectClaim(c);
    }
  };

  return (
    <div className="prism-claims-panel prism-panel-card apple-settle-in">
      <div className="prism-panel-header">
        <div className="prism-panel-title">RECENT CLAIMS</div>
        <span className="prism-panel-count">{claims.length}</span>
      </div>

      <div className="prism-claims-list">
        {loading && claims.length === 0 ? (
          <div className="prism-claims-skeleton-list apple-settle-in">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="prism-claim-row prism-skeleton-claim-row" style={{ pointerEvents: 'none' }}>
                <div
                  className="prism-skeleton-line prism-skeleton-shimmer"
                  style={{ width: `${55 + ((n * 13) % 35)}%`, height: '14px', borderRadius: '4px' }}
                />
                <div className="prism-claim-row-meta" style={{ gap: '6px' }}>
                  <div
                    className="prism-skeleton-pill prism-skeleton-shimmer"
                    style={{ width: '58px', height: '16px', borderRadius: '10px' }}
                  />
                  <div
                    className="prism-skeleton-pill prism-skeleton-shimmer"
                    style={{ width: '22px', height: '16px', borderRadius: '10px' }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : claims.length === 0 ? (
          <div className="prism-panel-empty apple-settle-in">No claims recorded yet.</div>
        ) : (
          <div className="apple-settle-in" style={{ display: 'flex', flexDirection: 'column' }}>
            {claims.map((item) => {
              const isSelected = selectedClaim?.id === item.id;
              const state = item.state || 'Unverified';
              const stateClass = state.toLowerCase();
              const displayText = item.claim || item.text || 'Untitled Claim';
              const truncatedText = displayText.length > 40 ? `${displayText.slice(0, 40)}...` : displayText;

              return (
                <div
                  key={item.id}
                  className={`prism-claim-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelect(item)}
                  onDoubleClick={() => onInspectClaim && onInspectClaim(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (onInspectClaim) onInspectClaim(item);
                      else handleSelect(item);
                    } else if (e.key === ' ') {
                      handleSelect(item);
                    }
                  }}
                >
                  <div className="prism-claim-row-text" title={displayText}>
                    {truncatedText}
                  </div>
                  <div className="prism-claim-row-meta">
                    <span className={`prism-badge-tag ${stateClass}`}>
                      {state}
                    </span>
                    <span className="prism-badge-score">
                      {item.score ?? 0}
                    </span>
                    {onInspectClaim && (
                      <button
                        type="button"
                        className="prism-row-inspect-action"
                        title="Open in Verifier page"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectClaim(item);
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
