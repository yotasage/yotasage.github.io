// Part B (7): P5a packages engine (lib/python/rt/packages.py, the worker's pkg.* operations and the
// client's installPackages/listPackages/restart) across Edge, Firefox and WebKit.
// The real internet is never contacted. Pure-Python wheels are built here with fflate. In Edge and
// Firefox, pypi.org and files.pythonhosted.org are answered by context routes with canned PEP 691
// JSON and those wheels, and every other external request is aborted and counted. WebKit does not
// route a dedicated worker's requests, so there micropip is pointed (from the console, as user code
// could) at a same-origin canned index served by servers.mjs under /__mock-pypi/; the CSP side of
// ?net=pkg stays covered by security-checks.mjs. Every package call has its own timeout.
// Part 2 (P5b) is packages-restore-checks.mjs; PYTHON_PKG_ONLY=restore runs only that part.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { strToU8, zipSync } from 'fflate';

import { waitHarnessReady } from './corpus-checks.mjs';
import { runPackageRestoreChecks } from './packages-restore-checks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LOCK_INFO = JSON.parse(readFileSync(resolve(here, '../../../public/pyodide/pyodide-lock.json'), 'utf8')).info;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
export const PYPI_HOSTS = new Set(['pypi.org', 'files.pythonhosted.org']);
const CALL_MS = 20000;

export function isExternal(url) {
  try {
    const u = new URL(url);
    return /^(https?|wss?):$/.test(u.protocol) && !LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const b64 = (bytes) => Buffer.from(bytes).toString('base64');

/** A pure-Python wheel: `<mod>/__init__.py` with hello(), METADATA (with Requires-Dist), WHEEL, RECORD. */
export function buildWheel(name, version, { tag = 'py3-none-any', requires = [], body = '' } = {}) {
  const dist = name.replace(/-/g, '_');
  const info = `${dist}-${version}.dist-info`;
  const files = {
    [`${dist}/__init__.py`]: body || `def hello():\n    return "${name}-ok"\n`,
    [`${info}/METADATA`]: `Metadata-Version: 2.1\nName: ${name}\nVersion: ${version}\n${requires.map((r) => `Requires-Dist: ${r}\n`).join('')}`,
    [`${info}/WHEEL`]: `Wheel-Version: 1.0\nGenerator: harness\nRoot-Is-Purelib: true\nTag: ${tag}\n`,
    [`${info}/top_level.txt`]: `${dist}\n`,
  };
  files[`${info}/RECORD`] = `${Object.keys(files).map((p) => `${p},,`).join('\n')}\n${info}/RECORD,,\n`;
  const zip = {};
  for (const [p, text] of Object.entries(files)) zip[p] = strToU8(text);
  const bytes = zipSync(zip, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') });
  return { name, version, fileName: `${dist}-${version}-${tag}.whl`, bytes, sha256: sha256(bytes) };
}

export const W = {
  tinypkg: buildWheel('tinypkg', '1.0.0'),
  native: buildWheel('nativex', '1.0.0', { tag: 'cp311-cp311-manylinux_2_17_x86_64' }),
  needs: buildWheel('tinyneeds', '1.0.0', { requires: ['notbundledxyz'] }),
  tinyt2: buildWheel('tinyt2', '1.0.0'),
  // Canned PyPI projects.
  tinypkg2: buildWheel('tinypkg2', '1.0.0', {
    requires: ['tinydep'],
    body: 'import tinydep\n\ndef hello():\n    return "tinypkg2-ok+" + tinydep.hello()\n',
  }),
  tinydep: buildWheel('tinydep', '1.0.0'),
  tinypkg3: buildWheel('tinypkg3', '1.0.0'),
  nativepkg: buildWheel('nativepkg', '1.0.0', { tag: 'cp314-cp314-manylinux_2_17_x86_64' }),
  badhash: buildWheel('badhash', '1.0.0'),
  codepkg: buildWheel('codepkg', '1.0.0'),
};
const INDEX = ['tinypkg2', 'tinydep', 'tinypkg3', 'nativepkg', 'badhash', 'codepkg'];

/** PEP 691 JSON for `name` with absolute wheel URLs under `fileBase`; null → 404. */
function simpleJson(name, fileBase) {
  if (!INDEX.includes(name)) return null;
  const w = W[name];
  const hash = name === 'badhash' ? '0'.repeat(64) : w.sha256;
  return JSON.stringify({
    meta: { 'api-version': '1.1' },
    name,
    versions: [w.version],
    files: [{ filename: w.fileName, url: `${fileBase}${w.fileName}`, hashes: { sha256: hash } }],
  });
}

const JSON_HEADERS = { 'Content-Type': 'application/vnd.pypi.simple.v1+json', 'Access-Control-Allow-Origin': '*' };
const WHEEL_HEADERS = { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' };

function wheelByFile(fileName) {
  return Object.values(W).find((w) => w.fileName === fileName) || null;
}

/** Route reply for the real PyPI hosts (Edge/Firefox). */
export function fulfillPypi(url) {
  const u = new URL(url);
  if (u.hostname === 'pypi.org') {
    const m = /^\/simple\/([^/]+)\/$/.exec(u.pathname);
    const body = m ? simpleJson(m[1], 'https://files.pythonhosted.org/packages/aa/bb/') : null;
    return body ? { status: 200, headers: JSON_HEADERS, body } : { status: 404, headers: WHEEL_HEADERS, body: 'nf' };
  }
  if (u.hostname === 'files.pythonhosted.org') {
    const w = wheelByFile(u.pathname.split('/').pop());
    return w ? { status: 200, headers: WHEEL_HEADERS, body: Buffer.from(w.bytes) } : { status: 404, body: 'nf' };
  }
  return null;
}

/** Same-origin mock index for WebKit (servers.mjs /__mock-pypi/simple/<name>/ and /files/<file>). */
function mockPypi(primaryOrigin) {
  return (pathname) => {
    let m = /^\/__mock-pypi\/simple\/([^/]+)\/$/.exec(pathname);
    if (m) {
      const body = simpleJson(m[1], `${primaryOrigin}/__mock-pypi/files/`);
      return body ? { headers: JSON_HEADERS, body } : null;
    }
    m = /^\/__mock-pypi\/files\/([^/]+)$/.exec(pathname);
    const w = m ? wheelByFile(m[1]) : null;
    return w ? { headers: WHEEL_HEADERS, body: Buffer.from(w.bytes) } : null;
  };
}

async function openPkgHarness(browser, primaryOrigin, search, { fulfill = null, expectIsolated = true } = {}) {
  const ctx = await browser.newContext();
  const routed = [];
  await ctx.route((url) => isExternal(url.href), async (route) => {
    const url = route.request().url();
    routed.push(url);
    const canned = fulfill ? fulfill(url) : null;
    if (canned) await route.fulfill(canned);
    else await route.abort();
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto(`${primaryOrigin}/python/harness${search}`, { waitUntil: 'domcontentloaded' });
  await waitHarnessReady(page, { expectIsolated });
  await page.evaluate(async () => {
    const st = window.__pythonHarness.createStorageClient();
    await st.open();
    const client = window.__pythonHarness.createClient({ storageClient: st });
    const dropped = [];
    client.subscribe({ droppedMessage: (r) => dropped.push(r) });
    const withTimeout = (p, ms, what) => Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms)),
    ]);
    const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    window.__pk = { st, client, dropped, withTimeout, fromB64 };
    await client.start();
  });
  return { ctx, page, routed, pageErrors };
}

/** Pushes console lines; returns each line's status/error/ms plus all stdout and stderr. */
export function repl(page, lines, ms = CALL_MS) {
  return page.evaluate(async ({ lines: ls, ms: limit }) => {
    const { client, withTimeout } = window.__pk;
    let out = '';
    let err = '';
    const unsub = client.subscribe({ stdout: (t) => { out += t; }, stderr: (t) => { err += t; } });
    const results = [];
    try {
      for (const line of ls) {
        const t0 = performance.now();
        const r = await withTimeout(client.replPush(line), limit, `console line ${line.slice(0, 40)}`);
        results.push({ status: r.status, type: r.error?.type, message: r.error?.message, ms: performance.now() - t0 });
      }
    } finally {
      unsub();
    }
    return { results, out, err };
  }, { lines, ms });
}

export function run(page, code, opts = {}, ms = CALL_MS) {
  return page.evaluate(async ({ code: src, opts: o, ms: limit }) => {
    const { client, withTimeout } = window.__pk;
    let out = '';
    let err = '';
    const unsub = client.subscribe({ stdout: (t) => { out += t; }, stderr: (t) => { err += t; } });
    try {
      const res = await withTimeout(client.run(src, o), limit, 'run');
      return { res, out, err };
    } finally {
      unsub();
    }
  }, { code, opts, ms });
}

/** pkg.install; wheel items carry `b64` instead of bytes (decoded in the page). */
export function install(page, items, ms = CALL_MS) {
  return page.evaluate(async ({ items: its, ms: limit }) => {
    const { client, withTimeout, fromB64 } = window.__pk;
    const real = its.map(({ b64: data, ...rest }) => (data ? { ...rest, bytes: fromB64(data) } : rest));
    const t0 = performance.now();
    const r = await withTimeout(client.installPackages(real, 'user'), limit, 'pkg.install');
    return { ...r, ms: performance.now() - t0 };
  }, { items, ms });
}

const wheelItem = (w, sha = w.sha256) => ({ kind: 'wheel', fileName: w.fileName, sha256: sha, b64: b64(w.bytes) });
const kinds = (r) => r.failed.map((f) => f.kind).join(',');
const find = (list, name) => list.find((p) => p.name === name);

function expectFailure(r, kind, infoIncludes = null) {
  if (r.installed.length > 0 && kind !== 'any') return `unexpected installs: ${r.installed.map((p) => p.name)}`;
  if (r.failed.length !== 1 || r.failed[0].kind !== kind) return `expected one ${kind}, got ${JSON.stringify(r.failed).slice(0, 500)}`;
  if (!r.failed[0].message || r.failed[0].message.length < 20) return 'missing friendly message';
  if (infoIncludes && !(r.failed[0].info || '').includes(infoIncludes)) return `info "${r.failed[0].info}" lacks ${infoIncludes}`;
  return null;
}

const VIOLATION_LINE = 'import js; from pyodide.ffi import create_proxy; _yv = []; _yh = create_proxy(lambda e: _yv.append(str(e.violatedDirective))); js.self.addEventListener("securitypolicyviolation", _yh)';

export async function runPackagesChecks(browserName, browser, { primaryOrigin, setMockPypi, record }) {
  const name = (s) => `P5a Packages: ${s}`;
  const workerRouting = browserName !== 'webkit';
  setMockPypi(mockPypi(primaryOrigin));
  if (process.env.PYTHON_PKG_ONLY === 'restore') {
    // Iterating on part 2 only (P5b).
    await runPackageRestoreChecks(browserName, browser, { primaryOrigin, record });
    return;
  }

  // --- Off mode (default), Tier 1 -------------------------------------------------------------
  const off = await openPkgHarness(browser, primaryOrigin, '');
  const { page } = off;
  try {
    await record(browserName, name('ready carries abiVersion & platform from the lock'), async () => {
      const info = await page.evaluate(() => window.__pk.client.readyInfo);
      if (info.abiVersion !== LOCK_INFO.abi_version || info.platform !== LOCK_INFO.platform) {
        return `got ${info.abiVersion}/${info.platform}, lock ${LOCK_INFO.abi_version}/${LOCK_INFO.platform}`;
      }
      return info.tier === 1 ? true : `expected Tier 1, got ${info.tier}`;
    });

    await record(browserName, name('auto-load: a run imports numpy; a console line imports pytz'), async () => {
      const r = await run(page, 'import numpy\nprint("NP", numpy.arange(4).sum())\n');
      if (!r.res.ok || !r.out.includes('NP 6')) return `run: ${r.err.slice(-300)}`;
      const c = await repl(page, ['import pytz; print("PYTZ", pytz.utc.zone)']);
      return c.results[0].status === 'complete' && c.out.includes('PYTZ UTC') ? true : `console: ${JSON.stringify(c)}`;
    });

    await record(browserName, name('missed dynamic import → clear error + run.end.missingPackages; load & rerun works'), async () => {
      const code = 'import importlib\nm = importlib.import_module("sym" + "py")\nprint("SYM", m.__name__)\n';
      const r1 = await run(page, code);
      if (r1.res.ok) return 'expected the first run to fail';
      if (JSON.stringify(r1.res.missingPackages) !== '["sympy"]') return `missingPackages ${JSON.stringify(r1.res.missingPackages)}`;
      if (!/sympy is bundled with this playground/.test(r1.err)) return `error text: ${r1.err.slice(-300)}`;
      const ins = await install(page, [{ kind: 'bundled', name: 'sympy' }]);
      const sym = find(ins.installed, 'sympy');
      if (ins.failed.length || !sym || sym.source !== 'bundled') return `install: ${JSON.stringify(ins).slice(0, 400)}`;
      const r2 = await run(page, code);
      return r2.res.ok && r2.out.includes('SYM sympy') && !r2.res.missingPackages ? true : `rerun: ${r2.err.slice(-300)}`;
    });

    await record(browserName, name('Off: console micropip.install("rich") fails fast with our text, 0 requests, 0 CSP violations'), async () => {
      const before = off.routed.length;
      const c = await repl(page, [VIOLATION_LINE, 'import micropip', 'await micropip.install("rich")', 'print("VIOL", len(_yv))']);
      const inst = c.results[2];
      if (inst.status !== 'error' || inst.type !== 'PackageInstallError') return `got ${JSON.stringify(inst)}`;
      if (!inst.message.startsWith('Network access is off')) return `message: ${inst.message}`;
      if (inst.ms > 3000) return `took ${inst.ms.toFixed(0)} ms`;
      if (!c.out.includes('VIOL 0')) return `violations: ${c.out}`;
      if (off.routed.length !== before) return `routed ${off.routed.slice(before).join(', ')}`;
      return true;
    }, '');

    await record(browserName, name('Off: pkg.install of a PyPI requirement → network-off, no request'), async () => {
      const r = await install(page, [{ kind: 'pypi', requirement: 'rich>=13' }]);
      return expectFailure(r, 'network-off') || (off.routed.length ? `routed ${off.routed}` : true);
    });

    await record(browserName, name('Off: uploaded wheel installs from MEMFS (source wheel, sha256) and imports'), async () => {
      const r = await install(page, [wheelItem(W.tinypkg)]);
      const p = find(r.installed, 'tinypkg');
      if (r.failed.length || !p) return `install: ${JSON.stringify(r).slice(0, 400)}`;
      if (p.source !== 'wheel' || p.sha256 !== W.tinypkg.sha256 || p.fileName !== W.tinypkg.fileName) return `info ${JSON.stringify(p)}`;
      const x = await run(page, 'import tinypkg\nprint(tinypkg.hello())\n');
      return x.out.includes('tinypkg-ok') ? true : x.err.slice(-300);
    }, `${W.tinypkg.bytes.length} B wheel`);

    await record(browserName, name('Off: manylinux wheel → incompatible-wheel'), async () => {
      const r = await install(page, [wheelItem(W.native)]);
      return expectFailure(r, 'incompatible-wheel', 'manylinux_2_17_x86_64') || true;
    });

    await record(browserName, name('Off: wheel needing an unbundled package → missing-dependency (no hang)'), async () => {
      const r = await install(page, [wheelItem(W.needs)]);
      return expectFailure(r, 'missing-dependency', 'notbundledxyz') || true;
    });

    await record(browserName, name('Off: wheel bytes that miss their hash → hash-mismatch'), async () => {
      const r = await install(page, [wheelItem(W.tinyt2, W.tinypkg.sha256)]);
      return expectFailure(r, 'hash-mismatch') || true;
    });

    await record(browserName, name('Tier 1 script: micropip.install raises in-script at once (< 50 ms)'), async () => {
      const code = [
        'import time, micropip',
        't = time.perf_counter()',
        'try:',
        '    micropip.install("rich")',
        'except Exception as e:',
        '    print("ERR", type(e).__name__, getattr(e, "kind", ""), round((time.perf_counter() - t) * 1000, 2))',
      ].join('\n');
      const r = await run(page, code);
      const m = /ERR PackageInstallError in-script ([\d.]+)/.exec(r.out);
      if (!m) return `output: ${r.out} ${r.err.slice(-300)}`;
      return Number(m[1]) < 50 ? true : `took ${m[1]} ms`;
    });

    await record(browserName, name('pkg.install is refused while a run is active'), async () => {
      const r = await page.evaluate(async () => {
        const { client, withTimeout } = window.__pk;
        const runP = client.run('import time\ntime.sleep(1.5)\nprint("SLEPT")\n');
        await new Promise((res) => setTimeout(res, 400));
        const ins = await withTimeout(client.installPackages([{ kind: 'bundled', name: 'six' }]), 10000, 'install');
        const res = await withTimeout(runP, 15000, 'run');
        return { ins, ok: res.ok };
      });
      if (r.ins.refused !== 'run-active' || r.ins.installed.length) return `got ${JSON.stringify(r.ins)}`;
      return r.ok ? true : 'run failed';
    });

    await record(browserName, name('pkg.list lists bundled & uploaded packages with their sources'), async () => {
      const r = await page.evaluate(() => window.__pk.withTimeout(window.__pk.client.listPackages(), 10000, 'list'));
      const want = { numpy: 'bundled', sympy: 'bundled', pytz: 'bundled', micropip: 'bundled', tinypkg: 'wheel' };
      for (const [n, src] of Object.entries(want)) {
        const p = find(r.packages, n);
        if (!p || p.source !== src) return `${n}: ${JSON.stringify(p)}`;
      }
      if (find(r.packages, 'six')) return 'six was installed although refused';
      return true;
    });

    await record(browserName, name('forged pkg.* messages from the worker are dropped'), async () => {
      const before = await page.evaluate(() => window.__pk.dropped.length);
      const code = [
        'import js',
        'from pyodide.ffi import to_js',
        'def post(d):',
        '    js.self.postMessage(to_js(d, dict_converter=js.Object.fromEntries))',
        'ok = {"name": "x", "version": "1", "source": "pypi", "depends": [], "imports": []}',
        'post({"type": "pkg.result", "id": 987654, "installed": [ok], "failed": []})',
        'post({"type": "pkg.list.result", "id": 1, "packages": [dict(ok, url="https://evil.example/x.whl")]})',
        'post({"type": "pkg.result", "id": 1, "installed": [dict(ok, name="<script>")], "failed": []})',
        'post({"type": "pkg.result", "id": 1, "installed": [], "failed": [{"requirement": "x", "kind": "pwned", "message": "m", "detail": "d"}]})',
        'post({"type": "pkg.result", "id": 1, "installed": [], "failed": [], "refused": "always"})',
        'post({"type": "pkg.install", "id": 1, "items": [], "reason": "user"})',
      ].join('\n');
      const r = await run(page, code);
      if (!r.res.ok) return r.err.slice(-300);
      await page.waitForTimeout(200);
      const dropped = await page.evaluate((n) => window.__pk.dropped.slice(n), before);
      const want = ['mismatched pkg.result', 'Invalid pkg.list.result packages', 'Invalid pkg.result installed',
        'Invalid pkg.result failed', 'Invalid pkg.result refused', 'Unknown worker message type "pkg.install"'];
      const missing = want.filter((w) => !dropped.some((d) => d.includes(w)));
      return missing.length ? `not dropped: ${missing.join('; ')} (got ${dropped.join(' | ')})` : true;
    });

    await record(browserName, name('idle restart() gives a working worker; workspace kept, session packages gone'), async () => {
      const r = await page.evaluate(async () => {
        const { st, client, withTimeout } = window.__pk;
        await st.write('keep.txt', 'kept-across-restart');
        const old = client.readyInfo;
        const t0 = performance.now();
        const info = await withTimeout(client.restart(), 30000, 'restart');
        const ms = performance.now() - t0;
        let out = '';
        const unsub = client.subscribe({ stdout: (t) => { out += t; } });
        const res = await withTimeout(client.run([
          'print(open("keep.txt").read())',
          'try:',
          '    import tinypkg',
          '    print("STILL")',
          'except ImportError:',
          '    print("GONE")',
        ].join('\n')), 20000, 'run');
        unsub();
        return { same: info === old, state: client.state, ms, ok: res.ok, out };
      });
      if (r.same) return 'restart() returned the old ReadyInfo';
      if (!r.ok || !r.out.includes('kept-across-restart') || !r.out.includes('GONE')) return `out: ${r.out}`;
      return true;
    });

    await record(browserName, name('idle forceStop() gives a working worker and keeps workspace files'), async () => {
      const r = await page.evaluate(async () => {
        const { client, withTimeout } = window.__pk;
        const old = client.readyInfo;
        await withTimeout(client.forceStop(), 30000, 'forceStop');
        let out = '';
        const unsub = client.subscribe({ stdout: (t) => { out += t; } });
        const res = await withTimeout(client.run('print(open("keep.txt").read())'), 20000, 'run');
        unsub();
        return { same: client.readyInfo === old, ok: res.ok, out };
      });
      if (r.same) return 'forceStop() kept the old ReadyInfo';
      return r.ok && r.out.includes('kept-across-restart') ? true : `out: ${r.out}`;
    });

    await record(browserName, name('Off: no external request & no page error in the whole session'), async () => {
      if (off.routed.length) return `routed: ${off.routed.join(', ')}`;
      if (off.pageErrors.length) return off.pageErrors.slice(0, 3).join(' | ');
      return true;
    }, workerRouting ? '' : 'page only: WebKit does not route worker requests');
  } finally {
    await page.evaluate(() => window.__pk?.client.dispose()).catch(() => {});
    await off.ctx.close().catch(() => {});
  }

  // --- Package index mode (?net=pkg) against canned PyPI replies -----------------------------
  const pkg = await openPkgHarness(browser, primaryOrigin, '?net=pkg', { fulfill: fulfillPypi });
  const p2 = pkg.page;
  try {
    if (!workerRouting) {
      const c = await repl(p2, ['import micropip', `micropip.set_index_urls(["${primaryOrigin}/__mock-pypi/simple/{package_name}/"])`]);
      if (c.results.some((x) => x.status !== 'complete')) throw new Error(`mock index setup: ${JSON.stringify(c)}`);
    }
    const via = workerRouting ? 'routed pypi.org' : 'same-origin mock index';

    await record(browserName, name('PyPI: install with a dependency chain (source pypi, hashes) and import'), async () => {
      const r = await install(p2, [{ kind: 'pypi', requirement: 'tinypkg2' }]);
      const a = find(r.installed, 'tinypkg2');
      const b = find(r.installed, 'tinydep');
      if (r.failed.length || !a || !b) return `install: ${JSON.stringify(r).slice(0, 500)}`;
      if (a.source !== 'pypi' || b.source !== 'pypi') return `sources ${a.source}/${b.source}`;
      if (a.sha256 !== W.tinypkg2.sha256 || b.sha256 !== W.tinydep.sha256) return 'sha256 mismatch';
      if (workerRouting && !(a.url || '').startsWith('https://files.pythonhosted.org/')) return `url ${a.url}`;
      if (!workerRouting && a.url !== undefined) return `non-PyPI url leaked: ${a.url}`;
      if (JSON.stringify(a.depends) !== '["tinydep"]') return `depends ${JSON.stringify(a.depends)}`;
      const x = await run(p2, 'import tinypkg2\nprint(tinypkg2.hello())\n');
      return x.out.includes('tinypkg2-ok+tinydep-ok') ? true : x.err.slice(-300);
    }, via);

    const cases = [
      ['not found (404) → not-found', 'nopkg', 'not-found', null],
      ['no version matches → version-not-found with the versions', 'tinypkg3==9.9', 'version-not-found', '1.0.0'],
      ['only a manylinux wheel → no-browser-wheel', 'nativepkg', 'no-browser-wheel', null],
      ['index hash differs → hash-mismatch', 'badhash', 'hash-mismatch', null],
      ['URL on another host → host-blocked', 'x @ https://example.com/x-1.0-py3-none-any.whl', 'host-blocked', 'example.com'],
    ];
    for (const [label, requirement, kind, info] of cases) {
      await record(browserName, name(`PyPI: ${label}`), async () => {
        const r = await install(p2, [{ kind: 'pypi', requirement }]);
        return expectFailure(r, kind, info) || true;
      });
    }

    await record(browserName, name('console: micropip.install from another host → host-blocked at once, no request'), async () => {
      const before = pkg.routed.length;
      const c = await repl(p2, ['import micropip', 'await micropip.install("https://example.com/x-1.0-py3-none-any.whl")']);
      const r = c.results[1];
      if (r.type !== 'PackageInstallError' || !r.message.includes('example.com')) return JSON.stringify(r);
      const other = pkg.routed.slice(before).filter((u) => !PYPI_HOSTS.has(new URL(u).hostname));
      return other.length ? `routed ${other}` : (r.ms < 3000 ? true : `took ${r.ms} ms`);
    });

    await record(browserName, name('console install by code → listed with source code (D23)'), async () => {
      const c = await repl(p2, ['import micropip', 'await micropip.install("codepkg")', 'import codepkg; print(codepkg.hello())']);
      if (!c.out.includes('codepkg-ok')) return `console: ${JSON.stringify(c).slice(0, 400)}`;
      const r = await p2.evaluate(() => window.__pk.withTimeout(window.__pk.client.listPackages(), 10000, 'list'));
      const p = find(r.packages, 'codepkg');
      const q = find(r.packages, 'tinypkg2');
      if (!p || p.source !== 'code') return `codepkg: ${JSON.stringify(p)}`;
      return q && q.source === 'pypi' ? true : `tinypkg2: ${JSON.stringify(q)}`;
    });

    await record(browserName, name('?net=pkg: only pypi.org / files.pythonhosted.org requested'), async () => {
      const other = pkg.routed.filter((u) => !PYPI_HOSTS.has(new URL(u).hostname));
      if (other.length) return `other hosts: ${other.join(', ')}`;
      if (workerRouting && !pkg.routed.length) return 'no PyPI request was routed';
      return pkg.pageErrors.length ? pkg.pageErrors.slice(0, 3).join(' | ') : true;
    }, `${pkg.routed.length} routed`);
  } finally {
    await p2.evaluate(() => window.__pk?.client.dispose()).catch(() => {});
    await pkg.ctx.close().catch(() => {});
  }

  // --- Tier 2 (?nosw=1: no service worker, so no isolation) -----------------------------------
  const t2 = await openPkgHarness(browser, primaryOrigin, '?nosw=1', { expectIsolated: false });
  try {
    const tier = await t2.page.evaluate(() => window.__pk.client.readyInfo.tier);
    await record(browserName, name('Tier 2 script: run_sync(micropip.install(emfs wheel)); finder loads a dynamic import'), async () => {
      if (tier !== 2) return true;
      const code = [
        'import base64, os',
        'from pyodide.ffi import run_sync',
        'import micropip',
        'os.makedirs("/tmp/t2", exist_ok=True)',
        `open("/tmp/t2/${W.tinyt2.fileName}", "wb").write(base64.b64decode("${b64(W.tinyt2.bytes)}"))`,
        `run_sync(micropip.install("emfs:/tmp/t2/${W.tinyt2.fileName}"))`,
        'import tinyt2',
        'print("T2", tinyt2.hello())',
        'import importlib',
        'print("DYN", importlib.import_module("py" + "tz").__name__)',
      ].join('\n');
      const r = await run(t2.page, code, { allowUnconfirmed: true });
      if (!r.res.ok || !r.out.includes('T2 tinyt2-ok') || !r.out.includes('DYN pytz')) return `out ${r.out} ${r.err.slice(-300)}`;
      return r.res.missingPackages ? `missingPackages ${r.res.missingPackages}` : true;
    }, tier === 2 ? '' : `skipped: Tier ${tier} (no JSPI)`);
  } finally {
    await t2.page.evaluate(() => window.__pk?.client.dispose()).catch(() => {});
    await t2.ctx.close().catch(() => {});
  }

  // --- Part 2 (P5b): manifest, saved wheels, restore, tampering, removal, Clear all data ----------
  await runPackageRestoreChecks(browserName, browser, { primaryOrigin, record });
}
