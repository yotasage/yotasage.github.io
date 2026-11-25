// Part B (7, part 2): P5b kept packages (lib/python/{packages,packageRestore}.ts, the wheels store of
// storage-worker.js) across Edge, Firefox and WebKit, in one browser context so localStorage and
// IndexedDB last across reloads: v1 → v2 migration, keeping (PyPI saved copies, an uploaded wheel, a
// bundled package; never one installed by code), restore after a full reload in Off with 0 external
// requests (D20), tampering by user code through IndexedDB (swapped bytes → hash-mismatch, extra rows
// and a fake manifest ignored, in Off and in ?net=pkg), a stale entry after a faked Pyodide version
// change, removal → restart, and Clear all data. The real internet is never contacted: external
// requests are routed to canned PyPI replies (page fetches in every browser; the worker's in Edge and
// Firefox only, so the restore-by-URL fallback is checked there only).
import { waitHarnessReady } from './corpus-checks.mjs';
import { b64, buildWheel, fulfillPypi, install, isExternal, PYPI_HOSTS, repl, run, W } from './packages-checks.mjs';

const RESTORE_MS = 30000;
// Built on first use: this module and packages-checks.mjs import each other.
let evil = null;
const EVIL_WHEEL = () => (evil ??= buildWheel('evilpkg', '1.0.0', { body: 'def hello():\n    return "evil"\n' }));

async function newContext(browser) {
  const ctx = await browser.newContext();
  const routed = [];
  await ctx.route((url) => isExternal(url.href), async (route) => {
    const url = route.request().url();
    routed.push(url);
    const canned = fulfillPypi(url);
    if (canned) await route.fulfill(canned);
    else await route.abort();
  });
  return { ctx, routed };
}

/** Opens the harness with a storage client, a worker client and an attached restorer; waits for the restore. */
async function openPage(ctx, primaryOrigin, search, { prepare = null, mockHosted = false } = {}) {
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto(`${primaryOrigin}/python/harness${search}`, { waitUntil: 'domcontentloaded' });
  await waitHarnessReady(page);
  if (prepare) await page.evaluate(prepare);
  await page.evaluate(async ({ ms, mockHosted: mock }) => {
    const h = window.__pythonHarness;
    const withTimeout = (p, limit, what) => Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${limit} ms`)), limit)),
    ]);
    const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const st = h.createStorageClient();
    await st.open();
    const client = h.createClient({ storageClient: st });
    const reports = [];
    const confirm = new Set();
    const restorer = h.createRestorer({
      client,
      storage: st,
      mode: h.policy.mode,
      confirmStale: () => confirm,
      onRestore: (r) => reports.push(r),
      // WebKit: page requests of a service-worker-controlled page may bypass Playwright's routes, so
      // saved copies are fetched from the same-origin mock instead of files.pythonhosted.org.
      ...(mock ? { fetchFn: (url, init) => fetch(String(url).replace(/^https:\/\/files\.pythonhosted\.org\/packages\/aa\/bb\//, '/__mock-pypi/files/'), init) } : {}),
    });
    restorer.attach();
    window.__pk = { st, client, restorer, reports, confirm, withTimeout, fromB64, dropped: [] };
    await client.start();
    await withTimeout(restorer.whenIdle(), ms, 'restore');
  }, { ms: RESTORE_MS, mockHosted });
  return { page, pageErrors };
}

async function closePage(p) {
  if (!p) return;
  await p.page.evaluate(() => window.__pk?.client.dispose()).catch(() => {});
  await p.page.close().catch(() => {});
}

/** The last restore report, summarised. */
function lastReport(page) {
  return page.evaluate(() => {
    const r = window.__pk.reports.at(-1) || null;
    if (!r) return null;
    return {
      installed: r.installed.map((p) => `${p.name}:${p.source}`).sort(),
      failed: r.failed.map((f) => `${f.requirement}:${f.kind}`),
      skipped: Object.fromEntries(r.skipped.map((s) => [s.name, s.reason])),
      error: r.error || null,
      count: window.__pk.reports.length,
    };
  });
}

const manifestNames = (page) =>
  page.evaluate(() => window.__pythonHarness.packages.readManifest().manifest.entries.map((e) => `${e.name}:${e.source}:${e.requested}`).sort());

const savedShas = (page) => page.evaluate(async () => (await window.__pk.st.listWheels()).wheels.map((w) => w.sha256).sort());

/** User code writes into IndexedDB from the console: swapped bytes, an extra row and a fake manifest. */
function tamperLines() {
  const EVIL = EVIL_WHEEL();
  const row = (sha, fileName, w) => `{"sha256": "${sha}", "fileName": "${fileName}", "size": ${w.bytes.length}, "bytes": _u("${b64(w.bytes)}"), "storedAt": 1}`;
  const fake = `{"sha256": "manifest", "fileName": "manifest", "v": 1, "entries": to_js([{"name": "evilpkg", "source": "pypi", "keep": True, "sha256": "${EVIL.sha256}"}], dict_converter=js.Object.fromEntries)}`;
  return [
    'import js, asyncio, base64',
    'from pyodide.ffi import create_proxy, to_js',
    'print("LS", hasattr(js, "localStorage"))',
    '_u = lambda s: (lambda d: (lambda u: (u.assign(d), u)[1])(js.Uint8Array.new(len(d))))(base64.b64decode(s))',
    '_o = lambda d: to_js(d, dict_converter=js.Object.fromEntries)',
    '_f = asyncio.get_event_loop().create_future(); _r = js.indexedDB.open("python-playground"); _p = create_proxy(lambda e: _f.set_result(_r.result)); _r.onsuccess = _p',
    '_db = await _f',
    `_f2 = asyncio.get_event_loop().create_future(); _tx = _db.transaction("wheels", "readwrite"); _st = _tx.objectStore("wheels"); _st.put(_o(${row(W.tinypkg.sha256, W.tinypkg.fileName, EVIL)})); _st.put(_o(${row(EVIL.sha256, EVIL.fileName, EVIL)})); _st.put(_o(${fake})); _p2 = create_proxy(lambda e: _f2.set_result(1)); _tx.oncomplete = _p2`,
    'await _f2; _db.close(); print("TAMPERED")',
  ];
}

export async function runPackageRestoreChecks(browserName, browser, { primaryOrigin, record }) {
  const name = (s) => `P5b Packages: ${s}`;
  const workerRouting = browserName !== 'webkit';
  const { ctx, routed } = await newContext(browser);
  let cur = null;
  const external = (from) => routed.slice(from);
  try {
    // --- v1 → v2 migration (a v1 database made by hand before the storage worker opens it) ---------
    await record(browserName, name('IndexedDB v1 → v2 keeps workspace files and adds the wheels store'), async () => {
      cur = await openPage(ctx, primaryOrigin, '', {
        prepare: async () => {
          const req = indexedDB.open('python-playground', 1);
          req.onupgradeneeded = () => {
            const d = req.result;
            d.createObjectStore('workspaces', { keyPath: 'id' });
            d.createObjectStore('files', { keyPath: ['ws', 'path'] }).createIndex('by_ws', 'ws', { unique: false });
          };
          const d = await new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
          const bytes = new TextEncoder().encode('kept across v2');
          const tx = d.transaction(['files', 'workspaces'], 'readwrite');
          tx.objectStore('files').put({ ws: 'default', path: 'keep.txt', isDir: false, size: bytes.length, mtime: Date.now(), bytes, createdByRun: false });
          tx.objectStore('workspaces').put({ id: 'default', name: 'Default', createdAt: 1, updatedAt: 1, totalBytes: bytes.length, entryCount: 1 });
          await new Promise((res) => { tx.oncomplete = res; });
          d.close();
        },
      });
      const r = await cur.page.evaluate(async () => {
        const text = await window.__pk.st.readText('keep.txt');
        const d = await new Promise((res) => { const q = indexedDB.open('python-playground'); q.onsuccess = () => res(q.result); });
        const out = { text, version: d.version, stores: [...d.objectStoreNames].sort() };
        d.close();
        out.wheels = (await window.__pk.st.listWheels()).wheels.length;
        return out;
      });
      if (r.text !== 'kept across v2') return `file: ${r.text}`;
      if (r.version !== 2 || r.stores.join() !== 'files,wheels,workspaces') return `db ${r.version} ${r.stores}`;
      const py = await run(cur.page, 'print("WS", open("/workspace/keep.txt").read())\n');
      return r.wheels === 0 && py.out.includes('WS kept across v2') ? true : `wheels ${r.wheels} / ${py.err.slice(-200)}`;
    });
    await closePage(cur);

    // --- Keep packages in Package index mode -----------------------------------------------------
    let mark = routed.length;
    cur = await openPage(ctx, primaryOrigin, '?net=pkg', { mockHosted: !workerRouting });
    if (!workerRouting) {
      const c = await repl(cur.page, ['import micropip', `micropip.set_index_urls(["${primaryOrigin}/__mock-pypi/simple/{package_name}/"])`]);
      if (c.results.some((x) => x.status !== 'complete')) throw new Error(`mock index setup: ${JSON.stringify(c)}`);
    }
    await record(browserName, name('keep: PyPI package + dependency (saved copies), uploaded wheel, bundled; code-installed refused (D23)'), async () => {
      const r = await install(cur.page, [{ kind: 'pypi', requirement: 'tinypkg2' }, { kind: 'bundled', name: 'six' }]);
      if (r.failed.length) return `install: ${JSON.stringify(r.failed).slice(0, 300)}`;
      const c = await repl(cur.page, ['import micropip', 'await micropip.install("codepkg")']);
      if (c.results.some((x) => x.status !== 'complete')) return `code install: ${JSON.stringify(c).slice(0, 300)}`;
      const keep = await cur.page.evaluate(async ({ tiny }) => {
        const { client, restorer, fromB64 } = window.__pk;
        const list = (await client.listPackages()).packages.map((p) =>
          // WebKit's worker installs from the same-origin mock index, so its PyPI URL is filled in here.
          p.source === 'pypi' && !p.url ? { ...p, url: `https://files.pythonhosted.org/packages/aa/bb/${p.fileName}` } : p,
        );
        const pick = (n) => list.find((p) => p.name === n);
        const a = await restorer.keepPackages([pick('tinypkg2'), pick('six')], { installed: list });
        const b = await restorer.keepPackages([pick('codepkg')], { installed: list });
        const w = await restorer.installWheelFiles([{ name: tiny.fileName, bytes: fromB64(tiny.b64) }], { keep: true });
        const bad = await restorer.installWheelFiles([{ name: 'nativex-1.0.0-cp311-cp311-manylinux_2_17_x86_64.whl', bytes: new Uint8Array([1]) }], { keep: true });
        return { a, b, w: { kept: w.keep?.kept, failed: w.install?.failed }, bad: bad.rejected };
      }, { tiny: { fileName: W.tinypkg.fileName, b64: b64(W.tinypkg.bytes) } });
      if (keep.a.kept.join() !== 'tinypkg2,six' || keep.a.failed.length) return `keep a: ${JSON.stringify(keep.a)}`;
      if (keep.b.kept.length || keep.b.failed[0]?.reason !== 'code') return `keep code: ${JSON.stringify(keep.b)}`;
      if (keep.w.kept?.join() !== 'tinypkg' || keep.w.failed?.length) return `wheel: ${JSON.stringify(keep.w)}`;
      if (keep.bad[0]?.reason !== 'incompatible-wheel') return `bad wheel: ${JSON.stringify(keep.bad)}`;
      const names = await manifestNames(cur.page);
      if (names.join() !== 'six:bundled:true,tinydep:pypi:false,tinypkg2:pypi:true,tinypkg:wheel:true') return `manifest ${names}`;
      const shas = await savedShas(cur.page);
      const want = [W.tinypkg.sha256, W.tinypkg2.sha256, W.tinydep.sha256].sort();
      if (shas.join() !== want.join()) return `saved ${shas.length}`;
      const other = external(mark).filter((u) => !PYPI_HOSTS.has(new URL(u).hostname));
      return other.length ? `other hosts ${other}` : true;
    });
    await closePage(cur);

    // --- Restore after a full reload in Off ------------------------------------------------------
    mark = routed.length;
    cur = await openPage(ctx, primaryOrigin, '');
    await record(browserName, name('reload in Off: kept PyPI saved copies, wheel and bundled restore; 0 external requests (D20)'), async () => {
      const r = await lastReport(cur.page);
      if (!r || r.failed.length || Object.keys(r.skipped).length || r.error) return `report ${JSON.stringify(r)}`;
      for (const want of ['tinypkg2:pypi', 'tinydep:pypi', 'tinypkg:wheel', 'six:bundled']) {
        if (!r.installed.includes(want)) return `missing ${want} in ${r.installed}`;
      }
      const x = await run(cur.page, 'import tinypkg2, tinypkg, six\nprint("R", tinypkg2.hello(), tinypkg.hello())\n');
      if (!x.out.includes('R tinypkg2-ok+tinydep-ok tinypkg-ok')) return x.err.slice(-300);
      return external(mark).length ? `external ${external(mark)}` : true;
    });

    // --- Tampering by user code ------------------------------------------------------------------
    await record(browserName, name('user code writes IndexedDB (swapped bytes, extra row, fake manifest); has no localStorage'), async () => {
      const c = await repl(cur.page, tamperLines());
      if (c.results.some((x) => x.status !== 'complete')) return JSON.stringify(c).slice(0, 400);
      if (!c.out.includes('LS False') || !c.out.includes('TAMPERED')) return c.out.slice(-200);
      const shas = await savedShas(cur.page);
      return shas.includes(EVIL_WHEEL().sha256) && shas.includes('manifest') ? true : `rows ${shas}`;
    });
    await closePage(cur);

    for (const [label, search] of [['Off', ''], ['?net=pkg', '?net=pkg']]) {
      mark = routed.length;
      cur = await openPage(ctx, primaryOrigin, search);
      await record(browserName, name(`after tampering, reload in ${label}: only manifest entries, swapped bytes refused (hash-mismatch), no requests`), async () => {
        const r = await lastReport(cur.page);
        if (!r || r.error) return `report ${JSON.stringify(r)}`;
        if (r.skipped.tinypkg !== 'hash-mismatch' || Object.keys(r.skipped).length !== 1) return `skipped ${JSON.stringify(r.skipped)}`;
        if (r.installed.some((p) => p.startsWith('evilpkg') || p.startsWith('tinypkg:'))) return `installed ${r.installed}`;
        if (!r.installed.includes('tinypkg2:pypi')) return `installed ${r.installed}`;
        const x = await run(cur.page, 'import importlib.util as u\nprint("E", u.find_spec("evilpkg"), u.find_spec("tinypkg"))\n');
        if (!x.out.includes('E None None')) return `${x.out} ${x.err.slice(-200)}`;
        const ext = external(mark);
        return ext.length ? `external ${ext}` : true;
      });
      await closePage(cur);
    }

    // --- A stale entry after a faked Pyodide version change ----------------------------------------
    mark = routed.length;
    cur = await openPage(ctx, primaryOrigin, '', {
      prepare: () => {
        const p = window.__pythonHarness.packages;
        const { entries } = p.readManifest().manifest;
        p.writeManifest(entries.map((e) => (e.name === 'tinypkg2' ? { ...e, pyodideVersion: '0.0.1' } : e)));
      },
    });
    await record(browserName, name('stale entry (faked Pyodide version change) skipped, not reinstalled; restored after confirmation'), async () => {
      const r = await lastReport(cur.page);
      if (r.skipped.tinypkg2 !== 'stale' || r.installed.includes('tinypkg2:pypi')) return `report ${JSON.stringify(r)}`;
      const x = await run(cur.page, 'import importlib.util as u\nprint("S", u.find_spec("tinypkg2"))\n');
      if (!x.out.includes('S None')) return x.out;
      const after = await cur.page.evaluate(async (ms) => {
        const { client, restorer, confirm, withTimeout } = window.__pk;
        confirm.add('tinypkg2');
        await client.restart();
        await withTimeout(restorer.whenIdle(), ms, 'restore');
        restorer.markCurrent(['tinypkg2']);
        confirm.clear();
        return window.__pythonHarness.packages.readManifest().manifest.entries.find((e) => e.name === 'tinypkg2').pyodideVersion
          === client.readyInfo.pyodideVersion;
      }, RESTORE_MS);
      const r2 = await lastReport(cur.page);
      if (!after || !r2.installed.includes('tinypkg2:pypi')) return `confirmed: ${after} ${JSON.stringify(r2)}`;
      return external(mark).length ? `external ${external(mark)}` : true;
    });
    await closePage(cur);

    // --- Restore by URL when the saved copy is missing (Package index mode; worker routed) -------
    if (workerRouting) {
      mark = routed.length;
      cur = await openPage(ctx, primaryOrigin, '?net=pkg');
      await record(browserName, name('?net=pkg without a saved copy: restore fetches only that files.pythonhosted.org wheel'), async () => {
        await cur.page.evaluate(async ({ sha, ms }) => {
          const { st, client, restorer, withTimeout } = window.__pk;
          await st.deleteWheel(sha);
          await client.restart();
          await withTimeout(restorer.whenIdle(), ms, 'restore');
        }, { sha: W.tinydep.sha256, ms: RESTORE_MS });
        const r = await lastReport(cur.page);
        if (!r.installed.includes('tinydep:pypi') || r.failed.length) return `report ${JSON.stringify(r)}`;
        const ext = external(mark);
        if (ext.length !== 1 || !ext[0].endsWith(`/${W.tinydep.fileName}`) || !PYPI_HOSTS.has(new URL(ext[0]).hostname)) return `requests ${ext}`;
        return true;
      });
      await closePage(cur);
    }

    // --- Removal → restart ---------------------------------------------------------------------------
    cur = await openPage(ctx, primaryOrigin, '');
    await record(browserName, name('remove → restart: package and orphaned dependency gone, unused bytes pruned, workspace file kept'), async () => {
      const r = await cur.page.evaluate(async (ms) => {
        const { restorer, withTimeout } = window.__pk;
        const res = await restorer.removePackage('tinypkg2');
        await withTimeout(restorer.whenIdle(), ms, 'restore');
        return res.removed;
      }, RESTORE_MS);
      if (r.join() !== 'tinypkg2,tinydep') return `removed ${r}`;
      const names = await manifestNames(cur.page);
      if (names.join() !== 'six:bundled:true,tinypkg:wheel:true') return `manifest ${names}`;
      const shas = await savedShas(cur.page);
      if (shas.join() !== W.tinypkg.sha256) return `saved ${shas}`;
      const x = await run(cur.page, 'import importlib.util as u\nprint("G", u.find_spec("tinypkg2"), u.find_spec("tinydep"))\nprint("WS", open("/workspace/keep.txt").read())\n');
      return x.out.includes('G None None') && x.out.includes('WS kept across v2') ? true : `${x.out} ${x.err.slice(-200)}`;
    });

    // --- Clear all data (it unregisters the service worker, so the check reloads the page) ---------
    await record(browserName, name('Clear all data removes the manifest and the wheels store'), async () => {
      if (cur.pageErrors.length) return `page errors: ${cur.pageErrors.slice(0, 3).join(' | ')}`;
      const before = await cur.page.evaluate(async () => {
        const h = window.__pythonHarness;
        const n = (await window.__pk.st.listWheels()).wheels.length;
        window.__pk.client.dispose();
        await h.clearAllPythonData({ reload: false });
        return { n, key: localStorage.getItem(h.packages.PACKAGES_STORAGE_KEY) };
      });
      if (before.n === 0 || before.key !== null) return `before ${JSON.stringify(before)}`;
      await closePage(cur);
      cur = await openPage(ctx, primaryOrigin, '');
      const r = await cur.page.evaluate(async () => {
        const h = window.__pythonHarness;
        return {
          key: localStorage.getItem(h.packages.PACKAGES_STORAGE_KEY),
          wheels: (await window.__pk.st.listWheels()).wheels.length,
          reports: window.__pk.reports.length,
          file: await window.__pk.st.readText('keep.txt'),
        };
      });
      return r.key === null && r.wheels === 0 && r.reports === 0 && r.file === null ? true : JSON.stringify(r);
    });
  } finally {
    await closePage(cur);
    await ctx.close().catch(() => {});
  }
}
