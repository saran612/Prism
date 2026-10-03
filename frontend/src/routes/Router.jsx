import React, { createContext, useContext, useState, useEffect } from 'react';
import { matchRoute, getBreadcrumbs, ROUTE_DEFINITIONS } from './schema';

export const RouterContext = createContext(null);

export function useRouter() {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}

export function RouterProvider({ children }) {
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname || '/';
    }
    return '/';
  });

  const navigate = (to, options = {}) => {
    if (typeof window === 'undefined') return;
    
    const targetPath = to.startsWith('/') ? to : `/${to}`;
    if (currentPath === targetPath && !options.force) return;

    if (options.replace) {
      window.history.replaceState({}, '', targetPath);
    } else {
      window.history.pushState({}, '', targetPath);
    }

    setCurrentPath(targetPath);
    if (!options.noScroll) {
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

  const activeRoute = matchRoute(currentPath);

  // Sync document.title
  useEffect(() => {
    document.title = 'Prism';
  }, [activeRoute, currentPath]);

  const value = {
    currentPath,
    activeRoute,
    navigate,
    isNotFound: !activeRoute
  };

  return (
    <RouterContext.Provider value={value}>
      {children}
    </RouterContext.Provider>
  );
}

/**
 * Modern Apple-styled Link component for internal SPA navigation
 */
export function Link({ to, children, className = '', activeClassName = 'active', style, onClick, ...props }) {
  const { currentPath, navigate } = useRouter();
  const normalizedTarget = to.startsWith('/') ? to : `/${to}`;
  const isActive = currentPath === normalizedTarget;

  const handleClick = (e) => {
    if (onClick) onClick(e);

    // If cmd, ctrl, shift or middle click, allow browser default (open in new tab)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1 || e.defaultPrevented) {
      return;
    }

    e.preventDefault();
    navigate(normalizedTarget);
  };

  const combinedClasses = `${className} ${isActive ? activeClassName : ''}`.trim();

  return (
    <a
      href={normalizedTarget}
      onClick={handleClick}
      className={combinedClasses}
      style={style}
      aria-current={isActive ? 'page' : undefined}
      {...props}
    >
      {children}
    </a>
  );
}

/**
 * Breadcrumbs navigation indicator
 */
export function Breadcrumbs({ currentPath: propPath, onNavigate }) {
  const router = useContext(RouterContext);
  const path = propPath || router?.currentPath || (typeof window !== 'undefined' ? window.location.pathname : '/');
  const nav = onNavigate || router?.navigate || ((to) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', to);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });

  const crumbs = getBreadcrumbs(path);
  if (crumbs.length <= 1) return null;

  return (
    <nav className="apple-breadcrumbs-bar" aria-label="Breadcrumb">
      <ol className="apple-breadcrumbs-list">
        {crumbs.map((crumb, idx) => (
          <li key={crumb.path} className="apple-breadcrumb-item">
            {idx > 0 && <span className="apple-breadcrumb-separator">/</span>}
            {crumb.active ? (
              <span className="apple-breadcrumb-current">{crumb.label}</span>
            ) : (
              <button
                type="button"
                className="apple-breadcrumb-link"
                onClick={() => nav(crumb.path)}
              >
                {crumb.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * 404 Not Found Page Component
 */
export function NotFoundPage({ currentPath: propPath, onNavigate }) {
  const router = useContext(RouterContext);
  const path = propPath || router?.currentPath || (typeof window !== 'undefined' ? window.location.pathname : '/');
  const nav = onNavigate || router?.navigate || ((to) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', to);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });

  return (
    <div className="apple-fade-in" style={{ padding: '60px 20px', textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
      <div className="apple-404-badge">404 ROUTE NOT FOUND</div>
      <h1 style={{ fontSize: '2.4rem', fontWeight: 800, margin: '16px 0 10px', letterSpacing: '-0.03em' }}>
        Lost in the Spectrum.
      </h1>
      <p style={{ color: 'var(--apple-label-secondary)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '24px' }}>
        The requested path <code style={{ fontFamily: 'var(--sf-mono)', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: '6px', color: '#ff453a' }}>{path}</code> does not match any registered client route.
      </p>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '36px' }}>
        <button
          type="button"
          className="apple-btn-primary"
          onClick={() => nav('/')}
        >
          Return to Dashboard
        </button>
      </div>

      <div className="apple-card" style={{ textAlign: 'left', padding: '20px' }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: '10px', color: 'var(--apple-label-tertiary)' }}>
          AVAILABLE INTERNAL ROUTES
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ROUTE_DEFINITIONS.map((r) => (
            <div
              key={r.id}
              onClick={() => nav(r.path)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.03)',
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
            >
              <div>
                <strong style={{ fontSize: '0.88rem', color: 'var(--apple-label-primary)' }}>{r.title}</strong>
                <div style={{ fontSize: '0.76rem', color: 'var(--apple-label-tertiary)' }}>{r.path}</div>
              </div>
              <span className="apple-pane-badge" style={{ fontSize: '0.72rem' }}>{r.category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
