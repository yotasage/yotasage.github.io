# Python Playground: S1 Isolation & Network Policy Spike Notes

Verified empirically on branch `python` against a real Next.js static export (`npm run build:export`, served from `out/` on `http://localhost:3023` with **zero** server-added COOP/COEP/CSP/Permissions-Policy/Referrer-Policy headers, matching GitHub Pages) and a second-origin local server (`http://127.0.0.1:3024`, HTTP/CORS + RFC 6455 WebSocket + SSE + framing + referrer echo) across **Edge** (`msedge`), **Firefox** (`firefox-1572`), and **WebKit** (`webkit-2388`) via Playwright. All temporary spike files were removed after measurement.

---

## 1. Headline Findings & Architectural Decisions

1. **CRITICAL — Turbopack-bundled workers CANNOT be used directly under `/python/`-scoped COEP/COOP.**
   - `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` failed to start (`worker error`) in **all 3 browsers (Edge, Firefox, WebKit)**.
   - Two independent root causes observed in `out/_next/static/chunks/`:
     1. Turbopack emits the worker entry at `/_next/static/chunks/turbopack-worker-<hash>.js` (outside `/python/`). Per the Service Worker specification, a dedicated worker's script fetch is matched against SW scopes using the **worker's own script URL**, not the parent window URL. Confirmed in Firefox response logs: `coi-sw.js` (`scope: '/python/'`) **never intercepted** `turbopack-worker-*.js` (`coop: null, coep: null, csp: null, swVersion: null`), so the browser blocked the worker under the page's `COEP: require-corp` and delivered no worker CSP.
     2. Turbopack strips `{ type: 'module' }` (`{...o, type: void 0}`) and emits a classic `importScripts()` wrapper instead of an ES module worker.
   - **Mandatory rule for S2 / P1:** The Python worker entry script **must live under `/python/`** (e.g. `public/python/python-worker.js`, spawned with `new Worker('/python/python-worker.js', { type: 'module' })`). Verified in Edge, Firefox, and WebKit: an in-scope `/python/` module worker is intercepted by `coi-sw.js`, gets `COOP`/`COEP` + worker CSP + `crossOriginIsolated === true` + `SharedArrayBuffer` + `Atomics.wait`, and its own subresource fetches (`/python/...`, `/pyodide/...`) are controlled by `coi-sw.js` (`client.type === 'worker'`).
2. **Service worker `clients.get(event.clientId)` works across all 3 browsers for module and classic workers.**
   - Window-spawned `/python/*.js` workers reliably resolve to `client.type === 'window'` with the exact page URL (`?net=...`) in Edge, Firefox, and WebKit.
   - Worker-spawned nested workers resolve to `client.type === 'worker'` (Edge, WebKit) or non-window (Firefox) and are unconditionally downgraded to **Off** (`connect-src 'self'`), even when the page is on `?net=all`.
3. **Worker CSP `all` mode MUST specify explicit `connect-src`.**
   - Because the worker CSP includes `default-src 'none'`, omitting `connect-src` in `?net=all` would inherit `'none'` and block everything. In `all` mode, the **page** omits `connect-src` (no `default-src`), while the **worker** explicitly sends `connect-src 'self' https: http: wss: ws: data: blob:`.
4. **Fail-closed self-test (`securitypolicyviolation`) works BOTH online AND offline in all 3 browsers.**
   - Probing `fetch('https://csp-probe.invalid/', { mode: 'no-cors', cache: 'no-store' })` inside the worker fires `securitypolicyviolation` (`effectiveDirective: 'connect-src'`) **even when `context.setOffline(true)`** in Edge, Firefox, and WebKit (all 3 engines evaluate CSP before checking network/offline state).
   - When `coi-sw.js` is unregistered or blocked (`serviceWorkers: 'block'`), `fetch()` throws `TypeError` with **0** `securitypolicyviolation` events in both online and offline states.
   - Therefore, the `securitypolicyviolation` probe cleanly detects missing protection (triggering W7) with **zero false lockouts for offline visitors**, whereas a same-origin `HEAD` header probe fails offline and must NOT be relied on as the primary gate.
5. **Untrusted worker code CAN unregister `coi-sw.js` in Firefox and WebKit.**
   - `navigator.serviceWorker` is `undefined` in Edge workers, but **is exposed (`"object"`) in Firefox and WebKit workers**. Calling `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))` inside a worker succeeded (`unregistered: 1`) in both Firefox and WebKit, causing the next load to lose isolation and fail the CSP self-test (caught cleanly by W7).
6. **Bug caught when service workers are blocked (`serviceWorkers: 'block'`):**
   - `navigator.serviceWorker.register('/python/coi-sw.js', { scope: '/python/' })` resolves to **`undefined`** (rather than throwing) in Edge, Firefox, and WebKit when service workers are blocked. Registration code must guard `if (!reg)` before accessing `reg.active` / `reg.installing` and never trigger an auto-reload when blocked.
7. **SPA `<Link>` leaks isolation/CSP when leaving `/python/main` in all 3 browsers.**
   - Entering `/python/` via plain `<a href="/python/main">` lands directly in Tier 1 (`1` server hit, `0` extra reloads once SW is installed).
   - Leaving `/python/` via Next.js `<Link href="/">` leaves `crossOriginIsolated: true`, `swController: true`, and Python's page CSP (`connect-src 'self'`) active on `/` in Edge, Firefox, and WebKit. Both entry AND exit links must be plain `<a href>`.
8. **Cache Storage decision (`security.md` §3): use browser HTTP cache only (no Cache Storage precache) for v1.**
   - `coi-sw.js` never reads `caches`, so worker-poisoned Cache Storage entries under `/python/*` are completely ignored (404 / real server content in all 3 browsers).
   - `crypto.subtle.digest('SHA-256', 15 MB)` takes 9.0 ms (Edge), 21.5 ms (Firefox), 43.4 ms (WebKit) — fast enough if offline precache is ever added later, but HTTP cache alone is simpler, avoids worker-writable storage entirely, and avoids extra storage quota pressure for v1.

---

## 2. Exact Working Service Worker (`public/python/coi-sw.js`)

Production-ready service worker (scope `/python/`). Never reads from Cache Storage; enforces strict DNS host validation, nested-worker downgrade to Off, and defense-in-depth headers.

```js
/* eslint-disable no-restricted-globals */
// Cross-origin isolation (COOP/COEP) + CSP network policy Service Worker
// Scope: /python/

const SW_VERSION = '1';
const PKG_HOSTS = 'https://pypi.org https://files.pythonhosted.org';
const MAX_HOSTS = 5;

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

  event.respondWith(handleSameOriginFetch(event, req, url));
});

async function handleSameOriginFetch(event, req, url) {
  // Always use network / browser HTTP cache — NEVER Cache Storage.
  const response = await fetch(req);
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
    const policy = await resolveWorkerPolicy(event);
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
```

### Build-time allow-list note (`security.md` §3)
Because `coi-sw.js` **never calls `caches.match()`**, an attacker writing fake entries into Cache Storage under `/python/fake-script.js`, `/python/ping.json`, or `/python/main` cannot hijack any response (verified in all 3 browsers: 404 for fake paths, real origin response for real paths). Optionally, P1 may also add a small `ALLOWED_PREFIXES = ['/python/', '/pyodide/', '/monaco/', '/pdfjs/', '/fonts/', '/og/', '/samples/', '/_next/static/', '/favicon.ico']` check so `coi-sw.js` passes unknown paths straight through untouched.

---

## 3. Exact Headers Per Mode

All same-origin responses intercepted by `coi-sw.js` receive `Cross-Origin-Resource-Policy: same-origin`.

| Mode | URL | Page `Content-Security-Policy` | Worker `Content-Security-Policy` |
|---|---|---|---|
| **Off** (default) | `/python/main` | `connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'` | `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self' blob: data:; font-src 'self'; worker-src 'none'` |
| **Package index** | `/python/main?net=pkg` | `connect-src 'self' https://pypi.org https://files.pythonhosted.org; form-action 'self'; base-uri 'self'; frame-ancestors 'none'` | `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://pypi.org https://files.pythonhosted.org; img-src 'self' blob: data:; font-src 'self'; worker-src 'none'` |
| **Selected hosts** | `/python/main?net=hosts&hosts=a.com,b.org` | `connect-src 'self' https://a.com https://b.org; form-action 'self'; base-uri 'self'; frame-ancestors 'none'` | `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://a.com https://b.org; img-src 'self' blob: data:; font-src 'self'; worker-src 'none'` |
| **Everything** | `/python/main?net=all` | `form-action 'self'; base-uri 'self'; frame-ancestors 'none'` | `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https: http: wss: ws: data: blob:; img-src 'self' blob: data:; font-src 'self'; worker-src 'none'` |

Additional headers added by `coi-sw.js`:
- **Page (`/python/*` navigations):**
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), midi=(), payment=(), display-capture=(), autoplay=(), fullscreen=(self)` *(verified 0 console warnings in Edge, Firefox, WebKit)*
  - `Referrer-Policy: no-referrer` *(verified `Referer: ""` on outbound cross-origin links in all 3 browsers)*
- **Worker (`destination === 'worker' | 'sharedworker'`):**
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
- **Host validator test (`?net=hosts&hosts=api.example.com,b.org,*.bad.com,127.0.0.1,http://x.com,c.org,d.org,e.org,f.org`):**
  - Wildcards (`*.bad.com`), IPv4 (`127.0.0.1`), schemes (`http://x.com`), and the 6th host (`f.org`) were all rejected; resulting `connect-src` was `'self' https://api.example.com https://b.org https://c.org https://d.org https://e.org` across all 3 browsers.

---

## 4. Entry-Link, Exit-Link & Registration Rules

### Navigation matrix (measured across Edge, Firefox, WebKit)

| Transition | Edge | Firefox | WebKit |
|---|---|---|---|
| First visit to `/python/spike` (no SW yet) | 1 auto-reload (`serverHits: 2`), ends Tier 1 (`coi: true`) | 1 auto-reload (`serverHits: 2`), ends Tier 1 (`coi: true`) | 1 auto-reload (`serverHits: 2`), ends Tier 1 (`coi: true`) |
| SPA `<Link>` `/python-entry` → `/python/spike` (no auto-reload) | `coi: false`, `swControlled: false` (Tier 2) | `coi: false`, `swControlled: false` (Tier 2) | `coi: false`, `swControlled: false` (Tier 2) |
| SPA `<Link>` `/python-entry` → `/python/spike` (with auto-reload) | Hard-reloads once → `coi: true` (Tier 1) | Hard-reloads once → `coi: true` (Tier 1) | Hard-reloads once → `coi: true` (Tier 1) |
| Plain `<a href>` `/python-entry` → `/python/spike` (SW installed) | Immediately `coi: true`, `serverHits: 1` (0 extra reloads) | Immediately `coi: true`, `serverHits: 1` (0 extra reloads) | Immediately `coi: true`, `serverHits: 1` (0 extra reloads) |
| SPA `<Link>` `/python/spike` → `/python-entry` | **LEAKS** `coi: true`, `swController: true` | **LEAKS** `coi: true`, `swController: true` | **LEAKS** `coi: true`, `swController: true` |
| Plain `<a href>` `/python/spike` → `/python-entry` | Clean exit (`coi: false`, `swController: false`) | Clean exit (`coi: false`, `swController: false`) | Clean exit (`coi: false`, `swController: false`) |
| SW blocked (`serviceWorkers: 'block'`) | `register()` resolves `undefined`, 0 reload loop, Tier 2, W7 triggered | `register()` resolves `undefined`, 0 reload loop, Tier 2, W7 triggered | `register()` resolves `undefined`, 0 reload loop, Tier 2, W7 triggered |
| SW update (`v1` → `v2` + `reg.update()` + reload) | Cleanly serves `v2` | Cleanly serves `v2` | Cleanly serves `v2` |

### Rules for P2 / P4
1. **Home card (`pages/index.tsx`):** Add `hardNavigation?: boolean` to `SiteTool`, set `hardNavigation: true` on `/python/main`, and render `<a href={tool.href} className={styles.cardLink}>` instead of `<Link>` (satisfies `scripts/check-repo.mjs:423`).
2. **Exit links (`components/UI/ToolHeader.tsx`, `SiteFooter.tsx`):** Add `hardHomeLink?: boolean` on `ToolHeader` so returning to `/` from `/python/main` uses `<a href="/">` and exits isolation cleanly. Avoid SPA `router.push` out of `/python/main` (including `lib/pdf/handoff.ts` in P4 — use Download + hard navigation unless `/pdf/reader` is explicitly verified under COEP + Python's page CSP).
3. **Guarded single-reload fallback on `/python/main`:** Always register `/python/coi-sw.js` on mount, guard `if (!reg)` for blocked-SW environments, and if `!window.crossOriginIsolated` after activation, reload at most once using `sessionStorage` key `python:coi-reloaded` (cleared once `window.crossOriginIsolated === true`).

---

## 5. Tier-Detection & SW Registration Code

```ts
// lib/python/capabilities.ts
export type CapabilityTier = 1 | 2 | 3;

export interface CapabilityInfo {
  tier: CapabilityTier;
  crossOriginIsolated: boolean;
  hasSab: boolean;
  hasJspi: boolean;
  swSupported: boolean;
  swControlled: boolean;
  secureContext: boolean;
}

export function detectCapabilities(): CapabilityInfo {
  const secureContext = typeof window !== 'undefined' && window.isSecureContext;
  const crossOriginIsolated =
    typeof window !== 'undefined' && window.crossOriginIsolated === true;
  const hasSab = typeof SharedArrayBuffer === 'function';
  const wasm =
    typeof WebAssembly !== 'undefined'
      ? (WebAssembly as unknown as Record<string, unknown>)
      : {};
  const hasJspi =
    typeof wasm.Suspending === 'function' && typeof wasm.promising === 'function';
  const swSupported =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const swControlled = swSupported && Boolean(navigator.serviceWorker.controller);

  let tier: CapabilityTier = 3;
  if (crossOriginIsolated && hasSab) {
    tier = 1;
  } else if (hasJspi) {
    tier = 2; // S3 confirms whether JSPI is reliable per engine before relying on it
  }

  return {
    tier,
    crossOriginIsolated,
    hasSab,
    hasJspi,
    swSupported,
    swControlled,
    secureContext,
  };
}
```

### Guarded SW registration helper (for P1/P2)
```ts
const RELOAD_GUARD_KEY = 'python:coi-reloaded';

export type SwBootResult =
  | { status: 'isolated' }
  | { status: 'reloading' }
  | { status: 'unsupported' | 'blocked' | 'reload-failed'; reason?: string };

export async function ensureCrossOriginIsolation(): Promise<SwBootResult> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { status: 'unsupported' };
  }
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await navigator.serviceWorker.register('/python/coi-sw.js', {
      scope: '/python/',
    });
  } catch (err) {
    return { status: 'blocked', reason: String(err) };
  }
  // CRITICAL (S1): Playwright `serviceWorkers: 'block'` & some strict policies resolve `undefined`.
  if (!reg) {
    return { status: 'blocked', reason: 'registration returned undefined' };
  }

  const sw = reg.installing || reg.waiting || reg.active;
  if (sw && sw.state !== 'activated') {
    await new Promise<void>((resolve) => {
      const onChange = () => {
        if (sw.state === 'activated' || sw.state === 'redundant') {
          sw.removeEventListener('statechange', onChange);
          resolve();
        }
      };
      sw.addEventListener('statechange', onChange);
    });
  }
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 400);
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  if (window.crossOriginIsolated) {
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
    return { status: 'isolated' };
  }
  if (sessionStorage.getItem(RELOAD_GUARD_KEY) !== '1') {
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
    window.location.reload();
    return { status: 'reloading' };
  }
  return { status: 'reload-failed', reason: 'still not crossOriginIsolated after reload' };
}
```

*Note on JSPI:* All three test runtimes (`msedge`, `firefox-1572`, `webkit-2388`) reported `hasJspi === true` (`WebAssembly.Suspending` & `WebAssembly.promising` present). Per `architecture.md` §3, keep Tier 1 (`crossOriginIsolated` + `SharedArrayBuffer`) as the primary path and let S3 verify JSPI reliability before exposing Tier 2 blocking calls on non-Chromium engines.

---

## 6. Fail-Closed Self-Test Design & Verification (Online + Offline)

### Verified worker self-test (`verifyNetworkPolicyInWorker`)
Run inside the worker at boot (before executing any user code) whenever the expected mode is `off`, `pkg`, or `hosts` (skipped only in `all` mode, which already requires W4 confirmation):

```ts
// Inside /python/python-worker.js before running user code:
export async function verifyCspFailClosed(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  let cspBlocked = false;
  const onViolation = (ev: SecurityPolicyViolationEvent) => {
    const dir = ev.effectiveDirective || ev.violatedDirective || '';
    if (dir.startsWith('connect-src')) cspBlocked = true;
  };
  self.addEventListener('securitypolicyviolation', onViolation);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 1500);
  try {
    // RFC 2606 .invalid domain: never allowed by Off, pkg, or hosts; never hits any real host.
    await fetch('https://csp-probe.invalid/', {
      mode: 'no-cors',
      cache: 'no-store',
      signal: ac.signal,
    });
  } catch {
    // Expected: TypeError when blocked by CSP (or offline/network failure).
  } finally {
    clearTimeout(timer);
  }
  // Allow queued SecurityPolicyViolationEvent microtask/task to fire.
  await new Promise((r) => setTimeout(r, 50));
  self.removeEventListener('securitypolicyviolation', onViolation);

  return cspBlocked
    ? { ok: true }
    : { ok: false, reason: 'connect-src securitypolicyviolation did not fire' };
}
```

### Empirical results (online vs offline, with SW vs without SW)

| Scenario | Edge | Firefox | WebKit | Action |
|---|---|---|---|---|
| SW active, mode Off, **online** | `cspFired: true` | `cspFired: true` | `cspFired: true` | **Pass** (Run enabled) |
| SW active, mode Off, **offline** (`setOffline(true)`) | `cspFired: true` (`onLine: false`) | `cspFired: true` | `cspFired: true` (`onLine: false`) | **Pass** (NO false W7!) |
| SW active, mode Off, `HEAD self.location` **offline** | Fails (`TypeError`) | Fails (`NetworkError`) | Fails (`Load failed`) | Do NOT gate on `HEAD` |
| SW unregistered by worker/page → next load | `cspFired: false`, `coi: false` | `cspFired: false`, `coi: false` (unregistered by worker!) | `cspFired: false`, `coi: false` (unregistered by worker!) | **Fail closed** → W7 |
| SW blocked (`serviceWorkers: 'block'`), **online** | `cspFired: false` | `cspFired: false` | `cspFired: false` | **Fail closed** → W7 |
| SW blocked (`serviceWorkers: 'block'`), **offline** | `cspFired: false` | `cspFired: false` | `cspFired: false` | **Fail closed** → W7 |

---

## 7. API × Mode × Browser Matrix

Target cross-origin server: `http://127.0.0.1:3024` (with `Access-Control-Allow-Origin: *`, real WS upgrade, real SSE). Same-origin target: `http://localhost:3023/python/ping.json`.

**Origin-2 server hits during Off mode:** `0` in Edge, `0` in Firefox, `0` in WebKit.

### A. In-scope module worker (`/python/spike-worker.js`) & classic worker (`/python/spike-classic-worker.js`)

| API / Capability | Mode | Edge | Firefox | WebKit | Notes |
|---|---|---|---|---|---|
| `crossOriginIsolated` + `SharedArrayBuffer` + `Atomics.wait` | Off / All | **Pass** | **Pass** | **Pass** | `Atomics.wait(..., 5)` returns `'timed-out'` |
| `WebAssembly.instantiate` (`'wasm-unsafe-eval'`, no `'unsafe-eval'`) | Off / All | **Allowed** (`add(19,23)=42`) | **Allowed** (`42`) | **Allowed** (`42`) | `'unsafe-eval'` NOT needed for WASM (S2 confirms full Pyodide) |
| `eval('1+1')` & `new Function('return 1+1')` | Off / All | **Blocked** (`EvalError`) | **Blocked** (`EvalError`) | **Blocked** (`EvalError`) | Blocked by `script-src 'self' 'wasm-unsafe-eval'` |
| Same-origin `fetch('/python/ping.json')` | Off / All | **Allowed** (200, SW `worker`) | **Allowed** (200, SW `worker`) | **Allowed** (200, SW `worker`) | Confirms SW intercepts worker subresources |
| Same-origin `XMLHttpRequest` | Off / All | **Allowed** (200) | **Allowed** (200) | **Allowed** (200) | — |
| Cross-origin `fetch()` (`127.0.0.1:3024/ping`) | **Off** | **Blocked** (CSP event, 0 hits) | **Blocked** (CSP event, 0 hits) | **Blocked** (CSP event, 0 hits) | — |
| Cross-origin `fetch()` (`127.0.0.1:3024/ping`) | **All** | **Allowed** (200) | **Allowed** (200) | **Allowed** (200) | — |
| Cross-origin `fetch()` (`pypi.org` vs `blocked.invalid`) | **Pkg** | `pypi` no CSP; other **Blocked** | `pypi` no CSP; other **Blocked** | `pypi` no CSP; other **Blocked** | `127.0.0.1:3024` also **Blocked** |
| Cross-origin `fetch()` (`api.example.com` vs 6th host `f.org`) | **Hosts** | 1st–5th no CSP; 6th **Blocked** | 1st–5th no CSP; 6th **Blocked** | 1st–5th no CSP; 6th **Blocked** | Wildcards/IPs/schemes stripped |
| Cross-origin `XMLHttpRequest` | **Off** / **All** | **Blocked** / **Allowed** | **Blocked** / **Allowed** | **Blocked** / **Allowed** | CSP event in Off |
| Cross-origin `WebSocket` (`ws://127.0.0.1:3024/ws`) | **Off** / **All** | **Blocked** / **Allowed** | **Blocked** / **Allowed** | **Blocked** / **Allowed** | `NS_ERROR_CONTENT_BLOCKED` (FF), `SecurityError` (WK) |
| Cross-origin `EventSource` (`127.0.0.1:3024/sse`) | **Off** / **All** | **Blocked** / **Allowed** | **Blocked** / **Allowed** | **Blocked** / **Allowed** | 0 server hits in Off |
| `navigator.sendBeacon` (in worker) | Off | **Not exposed** (`undefined`) | **Not exposed** (`undefined`) | **Not exposed** (`undefined`) | — |
| `navigator.sendBeacon` (on page) | **Off** | **Blocked** (CSP event, 0 hits) | **Blocked** (CSP event, 0 hits) | **Blocked** (CSP event, 0 hits) | Edge/WK return `true` then block async; 0 server hits |
| `importScripts()` (in module worker) | Off | **Throws `TypeError`** | **Throws `TypeError`** | **Throws `TypeError`** | Disallowed in module workers by spec |
| `importScripts()` same-origin / cross-origin (classic worker) | **Off** | **Allowed** / **Blocked** | **Allowed** / **Blocked** | **Allowed** / **Blocked** | CSP event + 0 cross-origin hits |
| Dynamic `import('http://127.0.0.1:3024/test.mjs')` | **Off** & **All** | **Blocked** (CSP event, 0 hits) | **Blocked** (CSP event, 0 hits) | **Blocked** (CSP event, 0 hits) | Blocked by `script-src 'self' 'wasm-unsafe-eval'` in ALL modes |
| `new FontFace(..., 'url(http://127.0.0.1:3024/...)').load()` | **Off** | **Blocked** (CSP event, 0 hits) | **Blocked** (0 hits) | **Blocked** (0 hits) | Blocked by `font-src 'self'` (also blocked in All) |
| Nested `new Worker(...)` (normal worker, `worker-src 'none'`) | **Off** & **All** | **Blocked** (CSP event) | **Blocked** | **Blocked** (CSP event) | Blocked by `worker-src 'none'` |
| Nested worker downgrade (`clients.get(clientId)`) | **All** | **Downgraded to Off** (`clientType: worker`) | **Downgraded to Off** | **Downgraded to Off** (`clientType: worker`) | Parent reached `origin2`; child blocked by `connect-src 'self'` |
| **WebRTC:** `RTCPeerConnection` / `webkitRTCPeerConnection` | Worker | **`undefined`** | **`undefined`** | **`undefined`** | Not exposed in dedicated workers in any tested engine |
| **WebRTC:** `RTCDataChannel` | Worker | `function` (deletable: **yes**) | `function` (deletable: **yes**) | **`undefined`** | Delete before Python starts (defense in depth) |
| `navigator.serviceWorker` in worker | Worker | **`undefined`** | **Exposed (`object`)** | **Exposed (`object`)** | Worker CAN unregister SW in FF & WK; caught on next load by W7 |
| Turbopack-bundled worker (`/_next/static/chunks/...`) | Off | **FAILS to load** | **FAILS to load** | **FAILS to load** | Out of `/python/` SW scope (see §1) |

### Defense-in-depth cleanup at worker startup (before Pyodide boots)
```ts
for (const key of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) {
  if (key in self) {
    try {
      delete (self as unknown as Record<string, unknown>)[key];
    } catch {
      // best effort
    }
  }
}
```
Note: `RTCDataChannel` alone cannot establish a peer connection without `RTCPeerConnection`, and `RTCPeerConnection` is not exposed in dedicated workers in Edge, Firefox, or WebKit. Deleting all three (plus `worker-src 'none'`) still serves as zero-cost defense in depth.

---

## 8. Iframes, Blob URLs, Cache Storage & Defense-in-Depth Headers

| Test | Edge | Firefox | WebKit | Notes |
|---|---|---|---|---|
| Cross-origin framing (`127.0.0.1:3024` → `<iframe src="/python/spike">`) | **Blocked** (`frame-ancestors`) | **Blocked** | **Blocked** (`frame-ancestors`) | Zero rendering of `/python/spike` |
| `Referrer-Policy: no-referrer` on cross-origin link | `Referer: ""` | `Referer: ""` | `Referer: ""` | Verified server-side |
| Same-origin in-scope `<iframe src="/python/iframe-inner.html">` | **Blocked** (`frame-ancestors 'none'`) | **Blocked** | **Blocked** | Expected; `/python/*` cannot be framed |
| Same-origin out-of-scope `<iframe src="/python-entry">` | **Blocked / inaccessible** (COEP) | **Blocked / timeout** (COEP) | **Blocked / inaccessible** (COEP) | Confirms D8: never iframe `/pdf/reader` |
| `<iframe srcdoc="..." sandbox="">` | Loads; script **blocked** | Loads; script **blocked** | Loads; script **blocked** | Default HTML output viewer (`security.md` §4) |
| `<iframe srcdoc="..." sandbox="allow-scripts">` + meta CSP `connect-src 'none'` | Loads (`origin: "null"`); `fetch` **blocked** | Loads (`origin: "null"`); `fetch` **blocked** | Loads (`origin: "null"`); `fetch` **blocked** | Opt-in scripted HTML viewer |
| `<img src="blob:...">` with SVG containing `<script>` | Loads (40×40); script **blocked** | Loads (40×40); script **blocked** | Loads (40×40); script **blocked** | Safe SVG viewer under COEP |
| `<iframe src="blob:...">` | Loads (`coi: true`) | Loads (`coi: true`) | **Timed out** | Do NOT use Blob iframes; use `srcdoc` |
| Blob classic `new Worker(blobUrl)` + `importScripts('/python/...')` | **Works** (`coi: true`, `SAB: true`) | **Works** (`coi: true`, `SAB: true`) | **Works** (`coi: true`, `SAB: true`) | Positive signal for S6 (`monacoLoader.ts` under COEP) |
| Cache Storage poisoning (`/python/fake-script.js`, `/python/ping.json`, `/python/spike`) | **Ignored** (404 / real files) | **Ignored** (404 / real files) | **Ignored** (404 / real files) | `coi-sw.js` never reads `caches` |
| `crypto.subtle.digest('SHA-256', 15 MB)` | 9.0 ms | 21.5 ms | 43.4 ms | Benchmark for future offline precache option |

---

## 9. Handoff Notes for S2, S6, P1, P2 & Harness

- **S2 (Pyodide boot):**
  - Place the worker entrypoint inside `/python/` (`public/python/python-worker.js`, spawned via `new Worker('/python/python-worker.js', { type: 'module' })`), NOT via Turbopack `new URL('./worker.ts', import.meta.url)` — see §1.
  - Verify full Pyodide boot + NumPy/matplotlib/Pillow under the exact S1 worker CSP (`script-src 'self' 'wasm-unsafe-eval'`, without `'unsafe-eval'`). Only add `'unsafe-eval'` if Pyodide itself requires it.
- **S6 (Monaco & xterm):**
  - Classic Blob worker + `importScripts` of a same-origin script passed under COEP `require-corp` in Edge, Firefox, and WebKit, so `lib/notepad/monacoLoader.ts` is likely reusable as-is under `/python/`. Verify full Monaco AMD loader + workers under `/python/`'s `coi-sw.js`.
- **P1 / P2:**
  - Use the exact `coi-sw.js` (§2), `detectCapabilities` + `ensureCrossOriginIsolation` (§5, including the `if (!reg)` guard), `verifyCspFailClosed` (§6), and plain `<a href>` for both entering and leaving `/python/main` (§4).
- **Harness (`scripts/harness/python/`):**
  - Serve `out/` on dual-stack port `3023` (`server.listen(3023)` without `'127.0.0.1'` so Windows IPv6 `localhost` connects immediately) with zero COOP/COEP/CSP headers, plus a second-origin server on `127.0.0.1:3024`.
  - In headless Windows Playwright WebKit (`webkit-2388`), terminating a worker right after CSP-blocked nested-worker / `FontFace` tests and spawning another worker on the same page can crash the WebProcess; run distinct security-test groups on fresh pages in the WebKit harness.
