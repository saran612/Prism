/**
 * Prism Internal Routing Schemas & Route Definitions
 * Central registry for client-side pages, navigation bars, breadcrumbs,
 * dynamic titles, and Vercel edge rewrite mappings.
 */

export const ROUTE_DEFINITIONS = [
  {
    id: 'verifier',
    path: '/',
    aliases: ['/verifier'],
    title: 'Social Link Verifier Studio',
    navLabel: 'Verifier',
    description: 'Verify public Instagram, X (Twitter), and Facebook URLs with Indic script translation & fact checks.',
    category: 'Studio',
    navbar: true,
    icon: 'verifier',
    vercelRewrite: '/index.html',
    badge: null
  },
  {
    id: 'api-studio',
    path: '/api-studio',
    aliases: ['/api', '/console', '/playground'],
    title: 'API Call Console & Code Playground',
    navLabel: 'API Studio',
    description: 'Interactive API request builder, multi-language code snippets (cURL, Python, JS), and schemas.',
    category: 'Developer',
    navbar: true,
    icon: 'api',
    vercelRewrite: '/index.html',
    badge: 'v1'
  },
  {
    id: 'history',
    path: '/history',
    aliases: ['/audit', '/records'],
    title: 'Verification Audit Trail & Archive',
    navLabel: 'History',
    description: 'Searchable ledger of all processed social media posts, extracted claims, and registry verdicts.',
    category: 'Studio',
    navbar: true,
    icon: 'history',
    vercelRewrite: '/index.html',
    badge: null
  }
];

export const VERCEL_EDGE_REWRITES = [
  {
    source: '/api/(.*)',
    destination: '/api/$1',
    type: 'serverless_function',
    runtime: 'Python 3.12 (ASGI FastAPI)',
    description: 'Routes all backend API calls to the serverless FastAPI ASGI handler in api/index.py'
  },
  {
    source: '/docs',
    destination: '/api/docs',
    type: 'documentation',
    runtime: 'FastAPI Swagger UI',
    description: 'Interactive OpenAPI swagger documentation generated from FastAPI'
  },
  {
    source: '/openapi.json',
    destination: '/api/openapi.json',
    type: 'schema',
    runtime: 'FastAPI Schema',
    description: 'Standard OpenAPI 3.1 specification schema for Prism endpoints'
  },
  {
    source: '/(.*)',
    destination: '/index.html',
    type: 'spa_fallback',
    runtime: 'Vercel Edge Network',
    description: 'Single Page Application (SPA) rewrite fallback ensuring internal routes render seamlessly'
  }
];

export const VERCEL_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff', desc: 'Prevents MIME sniffing attacks' },
  { key: 'X-Frame-Options', value: 'DENY', desc: 'Protects against clickjacking' },
  { key: 'X-XSS-Protection', value: '1; mode=block', desc: 'Cross-site scripting filter' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin', desc: 'Controls referrer information transmission' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()', desc: 'Restricts sensitive browser APIs' }
];

/**
 * Match a pathname to its registered route definition
 */
export function matchRoute(pathname) {
  if (!pathname) return ROUTE_DEFINITIONS[0];
  const normalized = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  
  for (const route of ROUTE_DEFINITIONS) {
    if (route.path === normalized) return route;
    if (route.aliases && route.aliases.includes(normalized)) return route;
  }
  
  return null; // 404
}

/**
 * Get breadcrumbs for a given pathname
 */
export function getBreadcrumbs(pathname) {
  const route = matchRoute(pathname);
  if (!route || route.path === '/') {
    return [{ label: 'Home', path: '/' }];
  }
  return [
    { label: 'Home', path: '/' },
    { label: route.navLabel, path: route.path, active: true }
  ];
}
