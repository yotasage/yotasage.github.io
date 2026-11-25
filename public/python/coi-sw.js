/* eslint-disable no-restricted-globals */
// Cross-origin isolation (COOP/COEP) + CSP network policy Service Worker.
// Scope: /python/
// Security contract (docs/python/security.md §2–§3):
// - Never reads from or writes to Cache Storage (browser HTTP cache + network only).
// - Serves only paths matching ALLOWED_PREFIXES; other paths pass through untouched.
// - Enforces identical URL/hostname/CSP rules as lib/python/network.ts.
// - Downgrades nested/non-window workers unconditionally to Off (connect-src 'self').

const SW_VERSION = '1';
const PKG_HOSTS = 'https://pypi.org https://files.pythonhosted.org';
const MAX_HOSTS = 5;

const ALLOWED_PREFIXES = [
  '/python/',
  '/pyodide/',
  '/monaco/',
  '/fonts/',
  '/flags/',
  '/_next/',
  '/favicon.ico',
  '/og/',
  '/pdfjs/',
];

// Plain DNS hostname: lowercase ASCII letters/digits/hyphens, >= 2 labels,
// TLD starts with a letter (rejects dotted-quad IPv4), no wildcards/ports/schemes, <= 253 chars.
const DNS_HOST_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]?$/;

const PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'usb=()',
  'serial=()',
  'hid=()',
  'midi=()',
  'payment=()',
  'display-capture=()',
  'autoplay=()',
  'fullscreen=(self)',
].join(', ');

function isAllowedPath(pathname) {
  for (const prefix of ALLOWED_PREFIXES) {
    if (prefix.endsWith('/')) {
      if (pathname.startsWith(prefix)) return true;
    } else if (pathname === prefix) {
      return true;
    }
  }
  return false;
}

function parseNetworkMode(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return { mode: 'off', hosts: [] };
  }
  const net = url.searchParams.get('net');
  if (net === 'pkg') return { mode: 'pkg', hosts: [] };
  if (net === 'all') return { mode: 'all', hosts: [] };
  if (net === 'hosts') {
    const raw = url.searchParams.get('hosts') || '';
    const seen = new Set();
    const hosts = [];
    for (const part of raw.split(',')) {
      const h = part.trim().toLowerCase();
      if (!h || seen.has(h) || !DNS_HOST_RE.test(h)) continue;
      if (h === 'localhost' || h.endsWith('.localhost')) continue;
      seen.add(h);
      hosts.push(h);
      if (hosts.length >= MAX_HOSTS) break;
    }
    if (hosts.length > 0) return { mode: 'hosts', hosts };
  }
  return { mode: 'off', hosts: [] };
}

function buildConnectSrc(policy, forWorker) {
  switch (policy.mode) {
    case 'pkg':
      return `'self' ${PKG_HOSTS}`;
    case 'hosts':
      return `'self' ${policy.hosts.map((h) => `https://${h}`).join(' ')}`;
    case 'all':
      // Page has no default-src (omitting connect-src leaves it unrestricted).
      // Worker has default-src 'none', so connect-src must be explicit in 'all' mode.
      return forWorker ? "'self' https: http: wss: ws: data: blob:" : null;
    case 'off':
    default:
      return "'self'";
  }
}

function buildPageCsp(policy) {
  const parts = [];
  const connect = buildConnectSrc(policy, false);
  if (connect) parts.push(`connect-src ${connect}`);
  parts.push("form-action 'self'");
  parts.push("base-uri 'self'");
  parts.push("frame-ancestors 'none'");
  return parts.join('; ');
}

function buildWorkerCsp(policy) {
  const connect = buildConnectSrc(policy, true);
  return [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    `connect-src ${connect}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "worker-src 'none'",
  ].join('; ');
}

async function resolveWorkerPolicy(event) {
  if (!event.clientId) return { mode: 'off', hosts: [] };
  try {
    const client = await self.clients.get(event.clientId);
    if (!client || client.type !== 'window') {
      // Missing client or nested worker request -> ALWAYS Off.
      return { mode: 'off', hosts: [] };
    }
    const clientUrl = new URL(client.url);
    if (
      clientUrl.origin !== self.location.origin ||
      !clientUrl.pathname.startsWith('/python/')
    ) {
      return { mode: 'off', hosts: [] };
    }
    return parseNetworkMode(client.url);
  } catch {
    return { mode: 'off', hosts: [] };
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/python/coi-sw.js') return;
  if (!isAllowedPath(url.pathname)) return;

  event.respondWith(handleSameOriginFetch(event, req, url));
});

async function handleSameOriginFetch(event, req, url) {
  // Always use network / browser HTTP cache — NEVER Cache Storage.
  // For /python/pdf-worker.js, serve /pdfjs/pdf.worker.min.mjs directly from this
  // in-scope URL so WebKit/Firefox get COEP/CORP headers without a secondary module import.
  const fetchTarget =
    url.pathname === '/python/pdf-worker.js'
      ? new Request('/pdfjs/pdf.worker.min.mjs', { credentials: 'same-origin' })
      : req;
  const response = await fetch(fetchTarget);
  if (response.status === 0) return response;

  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('X-COI-SW-Version', SW_VERSION);

  const isNav =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    req.destination === 'iframe';
  const isWorker =
    req.destination === 'worker' || req.destination === 'sharedworker';

  if (isNav && url.pathname.startsWith('/python/')) {
    const policy = parseNetworkMode(req.url);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Content-Security-Policy', buildPageCsp(policy));
    headers.set('Permissions-Policy', PERMISSIONS_POLICY);
    headers.set('Referrer-Policy', 'no-referrer');
  } else if (isWorker) {
    const policy =
      url.pathname === '/python/storage-worker.js' ||
      url.pathname === '/python/wheel-worker.js' ||
      url.pathname === '/python/pdf-worker.js'
        ? { mode: 'off', hosts: [] }
        : await resolveWorkerPolicy(event);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Content-Security-Policy', buildWorkerCsp(policy));
  }

  // Re-wrapping clears response.redirected (prevents WebKit SW redirect errors).
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
