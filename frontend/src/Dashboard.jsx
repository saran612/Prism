import React, { useState, useEffect } from 'react';
import ScatterPlotAnalytics from './ScatterPlotAnalytics';

export default function Dashboard({ onNavigate, INDIC_LANG_MAP, detectPlatformFromUrl }) {
  const [stats, setStats] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const [statsRes, historyRes] = await Promise.all([
        fetch('/api/v1/stats'),
        fetch('/api/v1/history?limit=100')
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (historyRes.ok) {
        const historyData = await historyRes.json();
        setHistoryItems(historyData);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const getLangMeta = (code) => {
    if (!code) return { name: 'Unknown', native: '' };
    const lower = code.toLowerCase();
    return INDIC_LANG_MAP?.[lower] || { name: code.toUpperCase(), native: '' };
  };

  const getVerdict = (factCheckResults) => {
    if (!factCheckResults || !factCheckResults.claims || factCheckResults.claims.length === 0) {
      return {
        label: 'Unverified / No Match',
        type: 'unverified',
        description: 'No debunking match found in registry'
      };
    }
    const review = factCheckResults.claims[0]?.claimReview?.[0];
    const rating = review?.textualRating?.toLowerCase() || '';
    if (rating.includes('false') || rating.includes('fake') || rating.includes('incorrect') || rating.includes('hoax')) {
      return {
        label: 'False / Misinformation',
        type: 'false',
        description: review?.textualRating || 'Debunked as False'
      };
    }
    if (rating.includes('mislead') || rating.includes('partly') || rating.includes('dispute') || rating.includes('context')) {
      return {
        label: 'Misleading / Missing Context',
        type: 'misleading',
        description: review?.textualRating || 'Missing Context'
      };
    }
    return {
      label: 'Verified Match',
      type: 'true',
      description: review?.textualRating || 'Verified Claim'
    };
  };

  const totalChecks = stats?.total_checks ?? historyItems.length;
  const instagramCount = stats?.platforms?.instagram ?? historyItems.filter(i => (i.source_url || '').includes('instagram')).length;
  const twitterCount = stats?.platforms?.twitter ?? historyItems.filter(i => (i.source_url || '').includes('twitter') || (i.source_url || '').includes('x.com')).length;
  const facebookCount = stats?.platforms?.facebook ?? historyItems.filter(i => (i.source_url || '').includes('facebook') || (i.source_url || '').includes('fb.')).length;
  const falseCount = stats?.verdicts?.false ?? historyItems.filter(i => getVerdict(i.fact_check_results).type === 'false').length;
  const misleadingCount = stats?.verdicts?.misleading ?? historyItems.filter(i => getVerdict(i.fact_check_results).type === 'misleading').length;

  const flagPercentage = totalChecks > 0 ? Math.round(((falseCount + misleadingCount) / totalChecks) * 100) : 0;

  return (
    <div className="apple-dashboard-view apple-fade-in">
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
      <div className="prism-stat-band">
        <div className="prism-stat-segment hero">
          <span className="prism-stat-label">CLAIMS CHECKED</span>
          <div className="prism-stat-value">1,420</div>
        </div>

        <div className="prism-stat-segment">
          <span className="prism-stat-label">VERIFIED</span>
          <div className="prism-stat-value">894</div>
        </div>

        <div className="prism-stat-segment">
          <span className="prism-stat-label">FAST-PATH RATE</span>
          <div className="prism-stat-value">78.4%</div>
        </div>

        <div className="prism-stat-segment accent">
          <span className="prism-stat-label">AVG RESPONSE</span>
          <div className="prism-stat-value">1.2s</div>
        </div>
      </div>

      {/* Monospace Graph-Paper Scatter Plot Analytics View */}
      <ScatterPlotAnalytics />

      {/* 2-Column Analytics Distribution */}
      <div className="apple-dashboard-split">
        {/* Platform Breakdown */}
        <div className="apple-card">
          <div className="apple-card-header">
            <div className="apple-card-title-group">
              <h2>Social Media Ingestion Breakdown</h2>
              <p>Proportion of verified posts across supported networks.</p>
            </div>
          </div>

          <div className="apple-platform-bars">
            <div className="apple-pbar-item">
              <div className="apple-pbar-info">
                <span className="apple-pbar-name">
                  <span className="apple-pbar-icon">📸</span> Instagram (Reels & Posts)
                </span>
                <span className="apple-pbar-count">{instagramCount} posts</span>
              </div>
              <div className="apple-pbar-track">
                <div
                  className="apple-pbar-fill instagram"
                  style={{ width: `${totalChecks > 0 ? Math.max((instagramCount / totalChecks) * 100, 6) : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="apple-pbar-item">
              <div className="apple-pbar-info">
                <span className="apple-pbar-name">
                  <span className="apple-pbar-icon">𝕏</span> X / Twitter
                </span>
                <span className="apple-pbar-count">{twitterCount} posts</span>
              </div>
              <div className="apple-pbar-track">
                <div
                  className="apple-pbar-fill twitter"
                  style={{ width: `${totalChecks > 0 ? Math.max((twitterCount / totalChecks) * 100, 6) : 0}%` }}
                ></div>
              </div>
            </div>

            <div className="apple-pbar-item">
              <div className="apple-pbar-info">
                <span className="apple-pbar-name">
                  <span className="apple-pbar-icon">👥</span> Facebook
                </span>
                <span className="apple-pbar-count">{facebookCount} posts</span>
              </div>
              <div className="apple-pbar-track">
                <div
                  className="apple-pbar-fill facebook"
                  style={{ width: `${totalChecks > 0 ? Math.max((facebookCount / totalChecks) * 100, 6) : 0}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Indic Languages Supported */}
        <div className="apple-card">
          <div className="apple-card-header">
            <div className="apple-card-title-group">
              <h2>Supported Indic Language Matrix</h2>
              <p>Automated script recognition & neural translation pipeline.</p>
            </div>
          </div>

          <div className="apple-lang-grid">
            {Object.entries(INDIC_LANG_MAP || {}).map(([code, meta]) => (
              <div key={code} className="apple-lang-chip">
                <div className="apple-lang-chip-native">{meta.native}</div>
                <div className="apple-lang-chip-name">{meta.name}</div>
                <span className="apple-lang-chip-code">{code.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
