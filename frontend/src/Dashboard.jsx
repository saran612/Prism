import React, { useState, useEffect } from 'react';
import ScatterPlotAnalytics from './ScatterPlotAnalytics';
import RecentClaimsPanel from './RecentClaimsPanel';
import ClaimDetailPanel from './ClaimDetailPanel';

export default function Dashboard({ onNavigate, onInspectClaim = null }) {
  const [stats, setStats] = useState(null);
  const [claims, setClaims] = useState([]);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, claimsRes] = await Promise.all([
        fetch('/api/v1/stats').catch(() => null),
        fetch('/api/v1/claims?limit=50').catch(() => fetch('/claims?limit=50')).catch(() => null)
      ]);

      if (statsRes && statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (claimsRes && claimsRes.ok) {
        const claimsData = await claimsRes.json();
        setClaims(claimsData);
        if (claimsData.length > 0) {
          setSelectedClaim(claimsData[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setClaimsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div className="apple-dashboard-view apple-settle-in">
      {/* Dashboard Top Header */}
      <div className="apple-dashboard-header">
        <div className="apple-dashboard-header-text">
          <h1 className="apple-dashboard-title">Misinformation Detection Analytics</h1>
          <p className="apple-dashboard-subtitle">
            Real-time ingestion monitoring and veracity analytics for Instagram, X (Twitter), and Facebook claims with Indic script identification.
          </p>
        </div>

        <div className="apple-dashboard-actions">

          <button
            type="button"
            className="apple-dashboard-btn-primary"
            onClick={() => onNavigate('/verifier')}
            id="dashboard-verify-new-btn"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Verify Social Link</span>
          </button>
        </div>
      </div>

      {/* Horizontal Continuous Stat Band */}
      <div className="prism-stat-band apple-settle-in">
        <div className="prism-stat-segment hero">
          <span className="prism-stat-label">CLAIMS CHECKED</span>
          <div className="prism-stat-value">
            {stats?.total_checks !== undefined ? (
              stats.total_checks.toLocaleString()
            ) : loading ? (
              <span className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '56px', height: '24px', display: 'inline-block' }} />
            ) : (
              '0'
            )}
          </div>
        </div>

        <div className="prism-stat-segment">
          <span className="prism-stat-label">VERIFIED</span>
          <div className="prism-stat-value">
            {stats?.verdicts?.verified !== undefined ? (
              stats.verdicts.verified.toLocaleString()
            ) : loading ? (
              <span className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '48px', height: '24px', display: 'inline-block' }} />
            ) : (
              '0'
            )}
          </div>
        </div>

        <div className="prism-stat-segment">
          <span className="prism-stat-label">FAST-PATH RATE</span>
          <div className="prism-stat-value">
            {stats?.fast_path_rate !== undefined ? (
              `${stats.fast_path_rate}%`
            ) : loading ? (
              <span className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '48px', height: '24px', display: 'inline-block' }} />
            ) : (
              '0%'
            )}
          </div>
        </div>

        <div className="prism-stat-segment accent">
          <span className="prism-stat-label">AVG RESPONSE</span>
          <div className="prism-stat-value">
            {stats?.avg_response_time !== undefined && stats.avg_response_time !== null ? (
              `${stats.avg_response_time}s`
            ) : loading ? (
              <span className="prism-skeleton-line prism-skeleton-shimmer" style={{ width: '52px', height: '24px', display: 'inline-block' }} />
            ) : (
              '—'
            )}
          </div>
        </div>
      </div>

      {/* 3-Column Dashboard Grid: [Recent Claims] [Scatter Plot] [Claim Detail] */}
      <div className="prism-dashboard-grid apple-settle-in">
        <RecentClaimsPanel
          claims={claims}
          selectedClaim={selectedClaim}
          onSelectClaim={setSelectedClaim}
          onInspectClaim={onInspectClaim}
          loading={claimsLoading}
        />
        <ScatterPlotAnalytics
          customData={claims}
          onSelectPoint={setSelectedClaim}
          onInspectPoint={onInspectClaim}
        />
        <ClaimDetailPanel
          claim={selectedClaim}
          onInspectClaim={onInspectClaim}
        />
      </div>
    </div>
  );
}
