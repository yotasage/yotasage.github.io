// Part B (3): security.md §8 checks across Edge, Firefox, and WebKit.
import {
  PYTHON_PERMISSIONS_POLICY,
  PYTHON_REFERRER_POLICY,
  buildPageCsp,
  buildWorkerCsp,
  parseNetworkPolicyFromSearch,
} from '../../../lib/python/network.ts';
import { waitHarnessReady } from './corpus-checks.mjs';

export async function runSecurityChecks(
  browserName,
  browser,
  { primaryOrigin, secondaryOrigin, getHits, resetHits, record },
) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    // Capture response headers for Mode = Off
    let docHeaders = null;
    let workerHeaders = null;
    const onResp = (res) => {
      const u = new URL(res.url());
      if (u.origin === primaryOrigin && u.pathname === '/python/harness') {
        docHeaders = res.headers();
      } else if (u.origin === primaryOrigin && u.pathname === '/python/python-worker.js') {
        workerHeaders = res.headers();
      }
    };
    page.on('response', onResp);

    await page.goto(`${primaryOrigin}/python/harness`, { waitUntil: 'domcontentloaded' });
    await waitHarnessReady(page, { expectIsolated: true });

    // Boot worker in Off mode
    await page.evaluate(async () => {
      const client = window.__pythonHarness.createClient();
      window.__secClient = client;
      await client.start();
    });

    // 1. Mode = Off: 0 hits on 127.0.0.1:3024 across Worker JS + Python APIs; same-origin succeeds
    await record(browserName, 'Security Off: 0 exfil hits (JS + Python APIs) & same-origin ok', async () => {
      resetHits();
      const popups = [];
      page.on('popup', (p) => popups.push(p));

      const out = await page.evaluate(
        async ({ secOrigin }) => {
          const client = window.__secClient;
          let stdout = '';
          let stderr = '';
          const linkRequests = [];
          const unsub = client.subscribe({
            stdout: (t) => { stdout += t; },
            stderr: (t) => { stderr += t; },
            linkRequest: (url) => { linkRequests.push(url); },
          });

          const code = [
            'import asyncio, json, urllib.request, webbrowser, js, pyodide_js, pyodide.http',
            'from pyodide.ffi import to_js',
            'sec = ' + JSON.stringify(secOrigin),
            'ws_url = sec.replace("http://", "ws://") + "/ws"',
            'report = {}',
            '',
            'async def _as_coro(p):',
            '    return await p',
            'async def _aw(p, t=1.5):',
            '    return await asyncio.wait_for(_as_coro(p), timeout=t)',
            '',
            'async def probe_all():',
            '    # 0. Same-origin must succeed',
            '    same_res = await _aw(js.fetch("/python/rt/manifest.json"), 2.0)',
            '    report["same_origin_ok"] = bool(same_res.ok)',
            '',
            '    # 1. Cross-origin fetch',
            '    try:',
            '        await _aw(js.fetch(sec + "/ping"), 1.5)',
            '        report["fetch_blocked"] = False',
            '    except Exception:',
            '        report["fetch_blocked"] = True',
            '',
            '    # 2. XMLHttpRequest',
            '    try:',
            '        xhr = js.XMLHttpRequest.new()',
            '        xhr.open("GET", sec + "/ping", False)',
            '        xhr.send()',
            '        report["xhr_blocked"] = (xhr.status == 0)',
            '    except Exception:',
            '        report["xhr_blocked"] = True',
            '',
            '    # 3. WebSocket',
            '    try:',
            '        ws_blocked = False',
            '        try:',
            '            ws = js.WebSocket.new(ws_url)',
            '            fut = asyncio.get_running_loop().create_future()',
            '            def on_open(_e):',
            '                if not fut.done(): fut.set_result(False)',
            '            def on_err(_e):',
            '                if not fut.done(): fut.set_result(True)',
            '            ws.onopen = on_open',
            '            ws.onerror = on_err',
            '            ws.onclose = on_err',
            '            try:',
            '                ws_blocked = await asyncio.wait_for(fut, timeout=0.6)',
            '            except asyncio.TimeoutError:',
            '                ws_blocked = True',
            '            try: ws.close()',
            '            except Exception: pass',
            '        except Exception:',
            '            ws_blocked = True',
            '        report["ws_blocked"] = ws_blocked',
            '    except Exception:',
            '        report["ws_blocked"] = True',
            '',
            '    # 4. EventSource',
            '    if hasattr(js, "EventSource"):',
            '        try:',
            '            es_blocked = False',
            '            try:',
            '                es = js.EventSource.new(sec + "/sse")',
            '                fut = asyncio.get_running_loop().create_future()',
            '                def on_msg(_e):',
            '                    if not fut.done(): fut.set_result(False)',
            '                def on_err(_e):',
            '                    if not fut.done(): fut.set_result(True)',
            '                es.onmessage = on_msg',
            '                es.onerror = on_err',
            '                try:',
            '                    es_blocked = await asyncio.wait_for(fut, timeout=0.6)',
            '                except asyncio.TimeoutError:',
            '                    es_blocked = True',
            '                try: es.close()',
            '                except Exception: pass',
            '            except Exception:',
            '                es_blocked = True',
            '            report["sse_blocked"] = es_blocked',
            '        except Exception:',
            '            report["sse_blocked"] = True',
            '    else:',
            '        report["sse_blocked"] = True',
            '',
            '    # 5. FontFace',
            '    if hasattr(js, "FontFace"):',
            '        try:',
            '            ff = js.FontFace.new("LeakFont", f"url({sec}/font.woff2)")',
            '            await _aw(ff.load(), 1.5)',
            '            report["font_blocked"] = False',
            '        except Exception:',
            '            report["font_blocked"] = True',
            '    else:',
            '        report["font_blocked"] = True',
            '',
            '    # 6. Dynamic import() via Pyodide loader',
            '    try:',
            '        await _aw(pyodide_js._api.loadScript(sec + "/script.js"), 1.5)',
            '        report["dynamic_import_blocked"] = False',
            '    except Exception:',
            '        report["dynamic_import_blocked"] = True',
            '',
            '    # 7. Nested new Worker(...)',
            '    try:',
            '        nw_blocked = False',
            '        try:',
            '            w = js.Worker.new("/python/python-worker.js", to_js({"type": "module"}, dict_converter=js.Object.fromEntries))',
            '            fut = asyncio.get_running_loop().create_future()',
            '            def on_err(_e):',
            '                if not fut.done(): fut.set_result(True)',
            '            w.onerror = on_err',
            '            try:',
            '                nw_blocked = await asyncio.wait_for(fut, timeout=0.6)',
            '            except asyncio.TimeoutError:',
            '                nw_blocked = False',
            '            try: w.terminate()',
            '            except Exception: pass',
            '        except Exception:',
            '            nw_blocked = True',
            '        report["nested_worker_blocked"] = nw_blocked',
            '    except Exception:',
            '        report["nested_worker_blocked"] = True',
            '',
            '    # 8. eval() & new Function()',
            '    try:',
            '        js.eval("1+1")',
            '        report["eval_blocked"] = False',
            '    except Exception:',
            '        report["eval_blocked"] = True',
            '    try:',
            '        js.Function.new("return 1")',
            '        report["function_blocked"] = False',
            '    except Exception:',
            '        report["function_blocked"] = True',
            '',
            '    # 9. WebRTC stripped',
            '    report["webrtc_absent"] = (',
            '        not hasattr(js.self, "RTCPeerConnection")',
            '        and not hasattr(js.self, "webkitRTCPeerConnection")',
            '        and not hasattr(js.self, "RTCDataChannel")',
            '    )',
            '',
            '    # 10. Python pyfetch',
            '    try:',
            '        await _aw(pyodide.http.pyfetch(sec + "/ping"), 1.5)',
            '        report["pyfetch_blocked"] = False',
            '    except Exception:',
            '        report["pyfetch_blocked"] = True',
            '',
            '    # 11. Python urllib.request.urlopen',
            '    try:',
            '        urllib.request.urlopen(sec + "/ping", timeout=1.0)',
            '        report["urllib_blocked"] = False',
            '    except Exception:',
            '        report["urllib_blocked"] = True',
            '',
            '    # 12. Python micropip.install external PyPI package (not in local lockfile)',
            '    import micropip',
            '    try:',
            '        await _aw(micropip.install("rich"), 2.0)',
            '        report["micropip_blocked"] = False',
            '    except Exception:',
            '        report["micropip_blocked"] = True',
            '',
            '    # 13. Python webbrowser.open disabled in Off mode',
            '    try:',
            '        webbrowser.open("https://example.com")',
            '        report["webbrowser_blocked"] = False',
            '    except RuntimeError:',
            '        report["webbrowser_blocked"] = True',
            '',
            '    print("SEC_REPORT:" + json.dumps(report))',
          ].join('\n');

          try {
            const defRes = await client.run(code);
            if (!defRes.ok) return { res: defRes, stdout, stderr, linkRequests };
            const replRes = await client.replPush('await probe_all()');
            return {
              res: { ok: replRes.status === 'complete', error: replRes.error },
              stdout,
              stderr,
              linkRequests,
            };
          } finally {
            unsub();
          }
        },
        { secOrigin: secondaryOrigin },
      );

      if (!out.res.ok) return `probe script failed: ${out.stderr}`;
      const line = out.stdout.split('\n').find((l) => l.startsWith('SEC_REPORT:'));
      if (!line) return `missing SEC_REPORT in stdout: ${out.stdout.slice(-300)}`;
      const rep = JSON.parse(line.slice('SEC_REPORT:'.length));
      const failedKeys = Object.entries(rep)
        .filter(([, v]) => v !== true)
        .map(([k, v]) => `${k}=${v}`);
      if (failedKeys.length > 0) return `failed checks: ${failedKeys.join(', ')}`;
      if (out.linkRequests.length > 0) return `unexpected linkRequests: ${JSON.stringify(out.linkRequests)}`;
      if (popups.length > 0) return `unexpected popup count: ${popups.length}`;
      const hits = getHits();
      if (hits.length > 0) return `127.0.0.1:3024 received ${hits.length} hits: ${JSON.stringify(hits)}`;
      return true;
    });

    // 2. Forged & malformed worker messages
    await record(browserName, 'Security: forged & malformed worker messages handled safely', async () => {
      const popups = [];
      page.on('popup', (p) => popups.push(p));

      const res = await page.evaluate(async () => {
        const client = window.__secClient;
        const dropped = [];
        const links = [];
        const secEvents = [];
        const beforeUrl = window.location.href;
        const unsub = client.subscribe({
          droppedMessage: (reason) => dropped.push(reason),
          linkRequest: (url) => links.push(url),
          security: (st) => secEvents.push(st),
        });

        const code = [
          'import js',
          'from pyodide.ffi import to_js',
          'def obj(d): return to_js(d, dict_converter=js.Object.fromEntries)',
          'js.self.postMessage(None)',
          'js.self.postMessage(12345)',
          'js.self.postMessage(obj({"type": "stdout", "text": 999}))',
          'js.self.postMessage(obj({"type": "stdout", "text": "A" * 300000}))',
          'js.self.postMessage(obj({"type": "network.set", "mode": "all"}))',
          'js.self.postMessage(obj({"type": "security.status", "status": {"cspConfirmed": True, "mode": "all", "violationDirective": None}}))',
          'js.self.postMessage(obj({"type": "link.request", "url": "javascript:alert(1)"}))',
          'js.self.postMessage(obj({"type": "link.request", "url": "https://example.com/passive-only"}))',
          'print("FORGE_DONE")',
        ].join('\n');

        let stdout = '';
        const unsubOut = client.subscribe({ stdout: (t) => { stdout += t; } });
        try {
          const runRes = await client.run(code);
          // Give message queue a tick to settle
          await new Promise((r) => setTimeout(r, 50));
          const afterRes = await client.run('print("STILL_WORKS")');
          return {
            runRes,
            afterRes,
            stdout,
            droppedCount: dropped.length,
            links,
            secEventsCount: secEvents.length,
            secMode: client.securityStatus?.mode,
            urlUnchanged: window.location.href === beforeUrl,
          };
        } finally {
          unsub();
          unsubOut();
        }
      });

      if (!res.runRes.ok || !res.afterRes.ok) return `client broke after malformed msgs`;
      if (res.droppedCount < 7) return `expected >= 7 dropped msgs, got ${res.droppedCount}`;
      if (res.secEventsCount !== 0 || res.secMode !== 'off') {
        return `forged security.status altered client: events=${res.secEventsCount}, mode=${res.secMode}`;
      }
      if (res.links.length !== 1 || res.links[0] !== 'https://example.com/passive-only') {
        return `unexpected links: ${JSON.stringify(res.links)}`;
      }
      if (!res.urlUnchanged || popups.length > 0) return 'forged link.request navigated or opened popup!';
      return true;
    });

    // 3. Headers & Framing check (Permissions-Policy, Referrer-Policy, frame-ancestors 'none')
    await record(browserName, 'Security: Permissions-Policy, Referrer-Policy & frame-ancestors', async () => {
      if (!docHeaders) return 'missing document headers';
      if (docHeaders['permissions-policy'] !== PYTHON_PERMISSIONS_POLICY) {
        return `Permissions-Policy mismatch: ${docHeaders['permissions-policy']}`;
      }
      if (docHeaders['referrer-policy'] !== PYTHON_REFERRER_POLICY) {
        return `Referrer-Policy mismatch: ${docHeaders['referrer-policy']}`;
      }
      if (docHeaders['content-security-policy'] !== buildPageCsp({ mode: 'off', hosts: [] })) {
        return `Off page CSP mismatch: ${docHeaders['content-security-policy']}`;
      }
      if (!workerHeaders || workerHeaders['content-security-policy'] !== buildWorkerCsp({ mode: 'off', hosts: [] })) {
        return `Off worker CSP mismatch: ${workerHeaders?.['content-security-policy']}`;
      }

      // Open framing page on 127.0.0.1:3024 attempting to iframe localhost:3023/python/harness
      const framePage = await ctx.newPage();
      try {
        const frameUrl = `${secondaryOrigin}/frame-test?src=${encodeURIComponent(`${primaryOrigin}/python/harness`)}`;
        await framePage.goto(frameUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await new Promise((r) => setTimeout(r, 800));
        const framedHarnessLoaded = await Promise.all(
          framePage.frames().map(async (f) => {
            if (f === framePage.mainFrame()) return false;
            try {
              const text = await Promise.race([
                f.evaluate(() => document.body?.innerText || ''),
                new Promise((resolve) => setTimeout(() => resolve(''), 1500)),
              ]);
              return text.includes('Python Engine Harness');
            } catch {
              return false;
            }
          }),
        );
        if (framedHarnessLoaded.some(Boolean)) {
          return 'iframe loaded /python/harness despite frame-ancestors none!';
        }
      } finally {
        await framePage.close();
      }
      return true;
    });

    // 4. URL Modes (?net=pkg, ?net=hosts&hosts=example.com, ?net=all) exact CSP headers + pkg blocks 127.0.0.1
    await record(browserName, 'Security: URL modes (?net=pkg, hosts, all) exact CSP headers', async () => {
      await page.evaluate(() => window.__secClient?.dispose());
      page.off('response', onResp);

      const modeSearches = ['?net=pkg', '?net=hosts&hosts=example.com', '?net=all'];
      for (const search of modeSearches) {
        let modeDocHeaders = null;
        let modeWorkerHeaders = null;
        const policy = parseNetworkPolicyFromSearch(search);
        const modePage = await ctx.newPage();
        modePage.on('response', (res) => {
          const u = new URL(res.url());
          if (u.origin === primaryOrigin && u.pathname === '/python/harness') {
            modeDocHeaders = res.headers();
          } else if (u.origin === primaryOrigin && u.pathname === '/python/python-worker.js') {
            modeWorkerHeaders = res.headers();
          }
        });

        try {
          await modePage.goto(`${primaryOrigin}/python/harness${search}`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          });
          await waitHarnessReady(modePage, { expectIsolated: true });

          if (search === '?net=pkg') {
            await modePage.evaluate(async () => {
              const c = window.__pythonHarness.createClient();
              window.__modeClient = c;
              await c.start();
            });
          } else {
            // Spawn worker and verify security.status + worker CSP header without full redundant Pyodide boot
            await modePage.evaluate(async () => {
              const w = window.__pythonHarness.spawnRawWorker();
              const gotStatus = new Promise((resolve) => {
                const onMsg = (ev) => {
                  if (ev.data && ev.data.type === 'security.status') {
                    w.removeEventListener('message', onMsg);
                    resolve(ev.data.status);
                  }
                };
                w.addEventListener('message', onMsg);
                setTimeout(() => resolve(null), 10000);
              });
              w.postMessage({
                type: 'init',
                id: 1,
                payload: {
                  controlSab: null,
                  stdinSab: null,
                  networkMode: window.__pythonHarness.policy.mode,
                  pyodideIndexUrl: new URL('/pyodide/', window.location.origin).href,
                  pyodideLockUrl: new URL('/pyodide/pyodide-lock.json', window.location.origin).href,
                  runtimeBaseUrl: new URL('/python/rt/', window.location.origin).href,
                },
              });
              await gotStatus;
              w.terminate();
            });
          }

          const expectedPageCsp = buildPageCsp(policy);
          const expectedWorkerCsp = buildWorkerCsp(policy);

          if (!modeDocHeaders || modeDocHeaders['content-security-policy'] !== expectedPageCsp) {
            return `${search} page CSP mismatch: got "${modeDocHeaders?.['content-security-policy']}", want "${expectedPageCsp}"`;
          }
          if (!modeWorkerHeaders || modeWorkerHeaders['content-security-policy'] !== expectedWorkerCsp) {
            return `${search} worker CSP mismatch: got "${modeWorkerHeaders?.['content-security-policy']}", want "${expectedWorkerCsp}"`;
          }

          if (search === '?net=pkg') {
            resetHits();
            const pkgBlocked = await modePage.evaluate(async (secOrigin) => {
              const c = window.__modeClient;
              let stdout = '';
              let stderr = '';
              const unsub = c.subscribe({
                stdout: (t) => { stdout += t; },
                stderr: (t) => { stderr += t; },
              });
              const code = [
                'import asyncio, js',
                'async def _as_coro(p): return await p',
                'async def test_pkg_exfil():',
                '    try:',
                `        await asyncio.wait_for(_as_coro(js.fetch("${secOrigin}/ping")), timeout=2.0)`,
                '        print("PKG_EXFIL_LEAKED")',
                '    except Exception:',
                '        print("PKG_EXFIL_BLOCKED")',
              ].join('\n');
              const r1 = await c.run(code);
              const r2 = await c.replPush('await test_pkg_exfil()');
              unsub();
              return { stdout, stderr, r1, r2 };
            }, secondaryOrigin);
            if (!pkgBlocked.stdout.includes('PKG_EXFIL_BLOCKED') || getHits().length > 0) {
              return `?net=pkg allowed 127.0.0.1:3024! out=${JSON.stringify(pkgBlocked)} hits=${getHits().length}`;
            }
            await modePage.evaluate(() => window.__modeClient?.dispose());
          }
        } finally {
          await modePage.close().catch(() => {});
        }
      }
      await page.close().catch(() => {});
      return true;
    });

    // Fresh page in Mode = Off for Offline, Cache Storage & SW-unregister tests
    const page2 = await ctx.newPage();
    await page2.goto(`${primaryOrigin}/python/harness`, { waitUntil: 'domcontentloaded' });
    await waitHarnessReady(page2, { expectIsolated: true });

    // 5. Offline fail-closed self-test (context.setOffline(true)) -> cspConfirmed === true
    await record(browserName, 'Security: offline fail-closed self-test (no false W7)', async () => {
      // Spawn worker online so the script is loaded, then toggle offline before running the CSP probe
      await page2.evaluate(() => {
        window.__offlineWorker = window.__pythonHarness.spawnRawWorker();
      });
      // Give the browser a moment to load the worker script before switching offline
      await new Promise((r) => setTimeout(r, 250));
      await ctx.setOffline(true);
      try {
        const secStatus = await page2.evaluate(async () => {
          const w = window.__offlineWorker;
          const statusPromise = new Promise((resolve) => {
            const onMsg = (ev) => {
              if (ev.data && ev.data.type === 'security.status') {
                w.removeEventListener('message', onMsg);
                resolve(ev.data.status);
              }
            };
            w.addEventListener('message', onMsg);
            setTimeout(() => resolve(null), 5000);
          });
          w.postMessage({
            type: 'init',
            id: 1,
            payload: {
              controlSab: null,
              stdinSab: null,
              networkMode: 'off',
              pyodideIndexUrl: '/pyodide/',
              pyodideLockUrl: '/pyodide/pyodide-lock.json',
              runtimeBaseUrl: '/python/rt/',
            },
          });
          const st = await statusPromise;
          w.terminate();
          window.__offlineWorker = null;
          return st;
        });
        if (!secStatus || secStatus.cspConfirmed !== true) {
          return `offline cspConfirmed was not true: ${JSON.stringify(secStatus)}`;
        }
        return true;
      } finally {
        await ctx.setOffline(false);
      }
    });

    // 6. Cache Storage poisoning ignored
    await record(browserName, 'Security: Cache Storage poisoning ignored on reload', async () => {
      await page2.evaluate(async () => {
        const cache = await caches.open('poison-test');
        await cache.put(
          '/python/harness',
          new Response('<!doctype html><html><body>POISONED_CACHE</body></html>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }),
        );
        await cache.put(
          '/python/python-worker.js',
          new Response('/* POISONED_WORKER */', {
            headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
          }),
        );
      });
      await page2.reload({ waitUntil: 'domcontentloaded' });
      await waitHarnessReady(page2, { expectIsolated: true });
      const check = await page2.evaluate(async () => {
        const body = document.body.innerText;
        const c = window.__pythonHarness.createClient();
        const ready = await c.start();
        c.dispose();
        await caches.delete('poison-test');
        return { body, pyodideVersion: ready.pyodideVersion };
      });
      if (check.body.includes('POISONED_CACHE') || !check.body.includes('Python Engine Harness')) {
        return `served poisoned cache HTML! body=${check.body.slice(0, 120)}`;
      }
      if (!check.pyodideVersion) return 'worker did not boot genuinely';
      return true;
    });

    // 7. SW unregister from worker (Firefox & WebKit expose navigator.serviceWorker in workers)
    await record(browserName, 'Security: SW unregister from worker -> next load fails closed', async () => {
      const unreg = await page2.evaluate(async () => {
        const c = window.__pythonHarness.createClient();
        await c.start();
        let stdout = '';
        const unsub = c.subscribe({ stdout: (t) => { stdout += t; } });
        const code = [
          'import js, json',
          'async def unreg():',
          '    if not hasattr(js.navigator, "serviceWorker"):',
          '        print("UNREG:" + json.dumps({"exposed": False, "count": 0}))',
          '        return',
          '    regs = await js.navigator.serviceWorker.getRegistrations()',
          '    count = 0',
          '    for r in regs:',
          '        ok = await r.unregister()',
          '        if ok: count += 1',
          '    print("UNREG:" + json.dumps({"exposed": True, "count": count}))',
        ].join('\n');
        await c.run(code);
        await c.replPush('await unreg()');
        unsub();
        c.dispose();
        return stdout;
      });

      const line = unreg.split('\n').find((l) => l.startsWith('UNREG:'));
      if (!line) return `missing UNREG output: ${unreg}`;
      const info = JSON.parse(line.slice('UNREG:'.length));

      if (!info.exposed) {
        // Edge does not expose navigator.serviceWorker in workers (even stronger isolation!).
        return true;
      }
      if (info.count < 1) return `expected >= 1 SW unregistered, got ${info.count}`;

      // Close page2 so the unregistered SW is fully torn down before loading the next page
      await page2.close().catch(() => {});
      await new Promise((r) => setTimeout(r, 200));

      // Open a fresh page with ?nosw=1 so we observe the immediate unprotected next load before any repair
      const nextPage = await ctx.newPage();
      try {
        await nextPage.goto(`${primaryOrigin}/python/harness?nosw=1`, {
          waitUntil: 'domcontentloaded',
        });
        await nextPage.waitForFunction(() => Boolean(window.__pythonHarness), { timeout: 15000 });
        const failClosed = await nextPage.evaluate(async () => {
          const c = window.__pythonHarness.createClient();
          await c.start();
          const sec = c.securityStatus;
          const state = c.state;
          let blocked = false;
          try {
            await c.run('print(1)');
          } catch {
            blocked = true;
          }
          c.dispose();
          return { sec, state, blocked, coi: window.crossOriginIsolated };
        });
        if (failClosed.sec?.cspConfirmed !== false || !failClosed.blocked || failClosed.state !== 'blocked') {
          return `next load did not fail closed after SW unregister: ${JSON.stringify(failClosed)}`;
        }
      } finally {
        await nextPage.close();
      }
      return true;
    });

    await page2.close().catch(() => {});
  } finally {
    await ctx.close();
  }
}
