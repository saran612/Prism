import React from 'react';

export default function VerifierSkeleton({ socialUrl = '' }) {
  return (
    <div className="prism-verifier-skeleton apple-settle-in" id="verifier-loading-skeleton">

      {/* Skeleton Social Post Card */}
      <div className="apple-post-card prism-skeleton-card">
        <div className="apple-post-top">
          <div className="apple-post-author-box">
            <div className="prism-skeleton-avatar prism-skeleton-shimmer" />
            <div className="apple-post-meta-lines" style={{ gap: '8px' }}>
              <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '140px', height: '14px' }} />
              <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '260px', height: '11px' }} />
            </div>
          </div>
          <div className="prism-skeleton-pill prism-skeleton-shimmer" style={{ width: '120px', height: '22px' }} />
        </div>

        <div className="prism-skeleton-media-box prism-skeleton-shimmer" />
      </div>

      {/* Skeleton Dual Pane: Original Caption & Translation */}
      <div className="apple-dual-pane" style={{ marginTop: '16px' }}>
        <div className="apple-pane prism-skeleton-pane">
          <div className="apple-pane-header">
            <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '160px', height: '14px' }} />
          </div>
          <div className="prism-skeleton-text-block">
            <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '100%', height: '14px' }} />
            <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '92%', height: '14px' }} />
            <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '78%', height: '14px' }} />
            <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '55%', height: '14px' }} />
          </div>
        </div>

        <div className="apple-pane prism-skeleton-pane">
          <div className="apple-pane-header">
            <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '180px', height: '14px' }} />
          </div>
          <div className="prism-skeleton-text-block">
            <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '100%', height: '14px' }} />
            <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '88%', height: '14px' }} />
            <div className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '64%', height: '14px' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
