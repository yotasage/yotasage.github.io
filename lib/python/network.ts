// Network policy model, strict URL parsing, hostname validation, and CSP header builders.
// Contract: these rules MUST stay in exact sync with public/python/coi-sw.js.

export type NetworkMode = 'off' | 'pkg' | 'hosts' | 'all';

export interface NetworkPolicy {
  readonly mode: NetworkMode;
  readonly hosts: readonly string[];
}

export type HostValidationResult =
  | { readonly ok: true; readonly host: string }
  | { readonly ok: false; readonly reason: string };

export const PYTHON_PKG_HOSTS = ['pypi.org', 'files.pythonhosted.org'] as const;
export const PYTHON_MAX_SELECTED_HOSTS = 5;

// Plain DNS hostname: lowercase ASCII letters/digits/hyphens, >= 2 labels,
// TLD starts with a letter (rejects dotted-quad IPv4), no wildcards/ports/schemes, <= 253 chars.
export const DNS_HOST_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]?$/;

export const PYTHON_PERMISSIONS_POLICY = [
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

export const PYTHON_REFERRER_POLICY = 'no-referrer';

// Exact prefix allow-list mirrored in public/python/coi-sw.js.
export const PYTHON_SW_ALLOWED_PREFIXES = [
  '/python/',
  '/pyodide/',
  '/monaco/',
  '/fonts/',
  '/flags/',
  '/_next/',
  '/favicon.ico',
  '/og/',
  '/pdfjs/',
] as const;

export const OFF_NETWORK_POLICY: NetworkPolicy = Object.freeze({
  mode: 'off',
  hosts: Object.freeze([]),
});

/**
 * Validates a user-supplied selected host. Accepts either a bare DNS hostname
 * ("api.example.com") or an explicit "https://" host ("https://api.example.com"),
 * rejecting http://, wildcards, IPv4/IPv6, ports, paths, query/fragment, creds,
 * and single-label names (such as localhost).
 */
export function validateSelectedHost(raw: string): HostValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'Hostname is empty' };
  }

  let candidate = trimmed.toLowerCase();
  if (candidate.includes('://')) {
    if (!candidate.startsWith('https://')) {
      return { ok: false, reason: 'Only https:// hostnames are allowed' };
    }
    candidate = candidate.slice('https://'.length);
    // Allow a single trailing slash from pasted origins like "https://api.example.com/"
    if (candidate.endsWith('/')) {
      candidate = candidate.slice(0, -1);
    }
  }

  if (candidate.includes('*')) {
    return { ok: false, reason: 'Wildcard hostnames are not allowed' };
  }
  if (/[/?#@\\:\s[\]]/.test(candidate)) {
    return { ok: false, reason: 'Ports, paths, credentials, and IPv6 literals are not allowed' };
  }
  if (candidate === 'localhost' || candidate.endsWith('.localhost')) {
    return { ok: false, reason: 'localhost is not allowed as a selected host' };
  }
  if (!DNS_HOST_RE.test(candidate)) {
    return { ok: false, reason: 'Must be a valid plain DNS hostname (no IP addresses)' };
  }
  return { ok: true, host: candidate };
}

/** Parses a comma-separated host list (as carried in `?net=hosts&hosts=...`) strictly. */
export function parseSelectedHosts(raw: string): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];
  for (const part of raw.split(',')) {
    const h = part.trim().toLowerCase();
    if (!h || seen.has(h) || !DNS_HOST_RE.test(h)) continue;
    if (h === 'localhost' || h.endsWith('.localhost')) continue;
    seen.add(h);
    hosts.push(h);
    if (hosts.length >= PYTHON_MAX_SELECTED_HOSTS) break;
  }
  return hosts;
}

export function parseNetworkPolicyFromSearch(search: string): NetworkPolicy {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const net = params.get('net');
  if (net === 'pkg') return { mode: 'pkg', hosts: [] };
  if (net === 'all') return { mode: 'all', hosts: [] };
  if (net === 'hosts') {
    const hosts = parseSelectedHosts(params.get('hosts') ?? '');
    if (hosts.length > 0) return { mode: 'hosts', hosts };
  }
  return { mode: 'off', hosts: [] };
}

export function parseNetworkPolicyFromUrl(urlString: string): NetworkPolicy {
  try {
    const url = new URL(urlString);
    return parseNetworkPolicyFromSearch(url.search);
  } catch {
    return { mode: 'off', hosts: [] };
  }
}

export function buildNetworkPolicyUrl(pathname: string, policy: NetworkPolicy): string {
  const cleanPath = pathname.split('?')[0] || '/python/main';
  if (policy.mode === 'off') return cleanPath;
  if (policy.mode === 'pkg') return `${cleanPath}?net=pkg`;
  if (policy.mode === 'all') return `${cleanPath}?net=all`;
  const validHosts: string[] = [];
  const seen = new Set<string>();
  for (const h of policy.hosts) {
    const res = validateSelectedHost(h);
    if (res.ok && !seen.has(res.host)) {
      seen.add(res.host);
      validHosts.push(res.host);
      if (validHosts.length >= PYTHON_MAX_SELECTED_HOSTS) break;
    }
  }
  if (validHosts.length === 0) return cleanPath;
  return `${cleanPath}?net=hosts&hosts=${encodeURIComponent(validHosts.join(','))}`;
}

export function buildConnectSrc(policy: NetworkPolicy, forWorker: boolean): string | null {
  switch (policy.mode) {
    case 'pkg':
      return `'self' ${PYTHON_PKG_HOSTS.map((h) => `https://${h}`).join(' ')}`;
    case 'hosts': {
      const valid = parseSelectedHosts(policy.hosts.join(','));
      if (valid.length === 0) return "'self'";
      return `'self' ${valid.map((h) => `https://${h}`).join(' ')}`;
    }
    case 'all':
      // Page has no default-src (omitting connect-src leaves it unrestricted).
      // Worker has default-src 'none', so connect-src must be explicit in 'all' mode.
      return forWorker ? "'self' https: http: wss: ws: data: blob:" : null;
    case 'off':
    default:
      return "'self'";
  }
}

export function buildPageCsp(policy: NetworkPolicy): string {
  const parts: string[] = [];
  const connect = buildConnectSrc(policy, false);
  if (connect) parts.push(`connect-src ${connect}`);
  parts.push("form-action 'self'");
  parts.push("base-uri 'self'");
  parts.push("frame-ancestors 'none'");
  return parts.join('; ');
}

export function buildWorkerCsp(policy: NetworkPolicy): string {
  const connect = buildConnectSrc(policy, true) ?? "'self'";
  return [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    `connect-src ${connect}`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "worker-src 'none'",
  ].join('; ');
}
