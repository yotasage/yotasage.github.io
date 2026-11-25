// Part B (6): E1a built-in examples (lib/python/examples/) across Edge, Firefox, and WebKit.
// Every example's files are written into a fresh worker's /workspace and its entry is run in
// Off mode on /python/harness, feeding stdin (input example) and pressing Stop (Soft Stop example),
// with assertions on stable output markers, the plots streamed and the files written.
// The network probe runs in Off mode with every non-localhost request routed to an abort that
// counts it (0 expected: the CSP blocks before the network), and once in ?net=pkg mode with
// pypi.org answered by a canned CORS response, so the real internet is never contacted. Playwright's
// WebKit does not route requests made by a dedicated worker, so there the request count covers the
// page only and the ?net=pkg check is skipped.
import { waitHarnessReady } from './corpus-checks.mjs';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

function isExternal(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ws:' || u.protocol === 'wss:')
      && !LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Opens /python/harness (with `search`) in a fresh context that aborts and counts external requests. */
async function openHarness(browser, primaryOrigin, search, { fulfill } = {}) {
  const ctx = await browser.newContext();
  const routed = [];
  const seen = [];
  ctx.on('request', (req) => {
    if (isExternal(req.url())) seen.push(req.url());
  });
  await ctx.route((url) => isExternal(url.href), async (route) => {
    const url = route.request().url();
    routed.push(url);
    const canned = fulfill ? fulfill(url) : null;
    if (canned) {
      await route.fulfill(canned);
    } else {
      await route.abort();
    }
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto(`${primaryOrigin}/python/harness${search}`, { waitUntil: 'domcontentloaded' });
  await waitHarnessReady(page, { expectIsolated: true });
  await page.evaluate(async () => {
    const client = window.__pythonHarness.createClient();
    const plots = [];
    window.__pythonHarness.onPlot(client, (p) => plots.push(p));
    window.__exTest = { client, plots };
    await client.start();
  });
  return { ctx, page, routed, seen, pageErrors };
}

/** Runs one example's entry with its files; returns stdout/stderr, the run result and plot summaries. */
function runExample(page, id, { stdinLines = [], stopAfterMs = 0 } = {}) {
  return page.evaluate(
    async ({ exId, lines, stopMs }) => {
      const { client, plots } = window.__exTest;
      const ex = window.__pythonHarness.examples.find((e) => e.id === exId);
      if (!ex) return { missing: true };
      plots.length = 0;
      let stdout = '';
      let stderr = '';
      let turn = 0;
      const prompts = [];
      const unsub = client.subscribe({
        stdout: (t) => { stdout += t; },
        stderr: (t) => { stderr += t; },
        stdinRequest: () => {
          prompts.push(stdout.slice(-80));
          if (turn < lines.length) {
            client.sendStdin(lines[turn]);
            turn += 1;
          } else {
            client.sendStdinEof();
          }
        },
      });
      let stopPromise = null;
      const timer = stopMs > 0 ? setTimeout(() => { stopPromise = client.stop(); }, stopMs) : null;
      try {
        const res = await client.run(undefined, { filename: ex.entry, files: ex.files });
        if (stopPromise) await stopPromise;
        const plotInfo = plots.map((p) => ({
          source: p.source,
          width: p.width,
          height: p.height,
          bytes: p.pngBytes.byteLength,
          png: p.pngBytes[0] === 0x89 && p.pngBytes[1] === 0x50 && p.pngBytes[2] === 0x4e && p.pngBytes[3] === 0x47,
        }));
        return { res, stdout, stderr, prompts, plots: plotInfo };
      } finally {
        if (timer) clearTimeout(timer);
        unsub();
      }
    },
    { exId: id, lines: stdinLines, stopMs: stopAfterMs },
  );
}

/** Reads facts about workspace files with a helper script (never the example's own files). */
async function inspectFiles(page, paths) {
  const out = await page.evaluate(async (list) => {
    const { client } = window.__exTest;
    let stdout = '';
    const unsub = client.subscribe({ stdout: (t) => { stdout += t; } });
    try {
      const code = [
        'import json, os',
        `paths = ${JSON.stringify(list)}`,
        'info = {}',
        'for p in paths:',
        '    full = "/workspace/" + p',
        '    if not os.path.isfile(full):',
        '        info[p] = None',
        '        continue',
        '    with open(full, "rb") as fh:',
        '        data = fh.read()',
        '    info[p] = {"size": len(data), "head": data[:8].hex(), "text": data[:4000].decode("utf-8", "replace")}',
        'print("FILES=" + json.dumps(info))',
      ].join('\n');
      const res = await client.run(code, { filename: '_harness/inspect.py' });
      return { res, stdout };
    } finally {
      unsub();
    }
  }, paths);
  const line = out.stdout.split('\n').find((l) => l.startsWith('FILES='));
  if (!out.res.ok || !line) throw new Error(`inspect failed: ${JSON.stringify(out)}`);
  return JSON.parse(line.slice('FILES='.length));
}

function expectOk(r, id) {
  if (r.missing) return `example "${id}" not found in window.__pythonHarness.examples`;
  if (!r.res.ok || r.res.exitCode !== 0) {
    return `run failed (exit ${r.res.exitCode}): ${r.stderr.slice(-400)}`;
  }
  return null;
}

function expectMarkers(text, markers) {
  for (const m of markers) {
    const hit = m instanceof RegExp ? m.test(text) : text.includes(m);
    if (!hit) return `missing ${String(m)} in ${JSON.stringify(text.slice(0, 600))}`;
  }
  return null;
}

const PROBE_LINE = {
  same: /^PASS\s+this site\s/m,
  pypiPass: /^PASS\s+package index\s+pypi\.org\s+HTTP 200/m,
  pypiBlocked: /^BLOCKED\s+package index\s+pypi\.org\s/m,
  hostBlocked: /^BLOCKED\s+selected host\s+api\.github\.com\s/m,
  otherBlocked: /^BLOCKED\s+other host\s+jsonplaceholder\.typicode\.com\s/m,
};

export async function runExamplesChecks(browserName, browser, { primaryOrigin, record }) {
  const name = (s) => `E1a Examples: ${s}`;
  // Whether Playwright's context.route sees requests made by the Python worker (not in WebKit).
  const workerRouting = browserName !== 'webkit';
  const off = await openHarness(browser, primaryOrigin, '');
  const { page } = off;

  try {
    const ids = await page.evaluate(() => window.__pythonHarness.examples.map((e) => e.id));

    await record(browserName, name('12 examples exposed on /python/harness'), async () => {
      if (ids.length !== 12) return `expected 12 examples, got ${ids.length}: ${ids.join(', ')}`;
      return true;
    });

    await record(browserName, name('hello prints greeting & squares'), async () => {
      const r = await runExample(page, 'hello');
      return expectOk(r, 'hello')
        || expectMarkers(r.stdout, [/Hello from Python 3\.\d+/, '5 squared is 25'])
        || true;
    });

    await record(browserName, name('input_colors reads 2 lines & prints ANSI colours'), async () => {
      const r = await runExample(page, 'input_colors', { stdinLines: ['Ada', '21'] });
      if (r.prompts.length !== 2) return `expected 2 stdin requests, got ${r.prompts.length}`;
      return expectOk(r, 'input_colors')
        || expectMarkers(r.stdout, ['What is your name?', 'Pick a whole number:', '\x1b[1m\x1b[32mHello, Ada!\x1b[0m', '21 x 2 = 42', '\x1b[36m'])
        || true;
    });

    await record(browserName, name('soft_stop ticks until Stop at 1.5 s, then ends tidily'), async () => {
      const r = await runExample(page, 'soft_stop', { stopAfterMs: 1500 });
      if (r.res.forceStopped) return `needed Force Stop: ${JSON.stringify(r.res)}`;
      const ticks = (r.stdout.match(/^tick \d+/gm) || []).length;
      if (ticks < 2 || ticks > 6) return `expected 2..6 ticks in 1.5 s, got ${ticks}`;
      return expectOk(r, 'soft_stop') || expectMarkers(r.stdout, [`Stopped after ${ticks} ticks.`]) || true;
    });

    await record(browserName, name('modules imports helpers.py from its own folder'), async () => {
      const r = await runExample(page, 'modules');
      return expectOk(r, 'modules')
        || expectMarkers(r.stdout, ['Samples: 12.00, 14.50', 'Smoothed signal: 13.17, 14.67, 15.83, 17.33'])
        || true;
    });

    await record(browserName, name('science: NumPy solve, SciPy quad, SymPy diff/solve'), async () => {
      const r = await runExample(page, 'science');
      return expectOk(r, 'science')
        || expectMarkers(r.stdout, [
          'x = 2.000, y = 3.000',
          'quad : 0.886227',
          'd/dt : 3*t**2 - 12*t + 9',
          'roots: [1, 3]',
        ])
        || true;
    });

    await record(browserName, name('matplotlib_plot streams one PNG figure'), async () => {
      const r = await runExample(page, 'matplotlib_plot');
      const err = expectOk(r, 'matplotlib_plot') || expectMarkers(r.stdout, ['Figure sent to the Plots tab.']);
      if (err) return err;
      if (r.plots.length !== 1) return `expected 1 plot, got ${r.plots.length}`;
      const p = r.plots[0];
      if (!p.png || p.bytes < 5000 || p.width < 400) return `bad plot ${JSON.stringify(p)}`;
      return true;
    });

    await record(browserName, name('pillow_image shows a plot & writes out/image.png'), async () => {
      const r = await runExample(page, 'pillow_image');
      const err = expectOk(r, 'pillow_image') || expectMarkers(r.stdout, ['Saved out/image.png (240 x 160 pixels)']);
      if (err) return err;
      if (r.plots.length !== 1 || !r.plots[0].png || r.plots[0].width !== 240 || r.plots[0].height !== 160) {
        return `expected one 240x160 PNG plot, got ${JSON.stringify(r.plots)}`;
      }
      const f = await inspectFiles(page, ['out/image.png']);
      if (!f['out/image.png'] || f['out/image.png'].head !== '89504e470d0a1a0a') {
        return `out/image.png missing or not PNG: ${JSON.stringify(f['out/image.png'])}`;
      }
      return true;
    });

    await record(browserName, name('pdf_report writes out/report.pdf (%PDF), no plot'), async () => {
      const r = await runExample(page, 'pdf_report');
      const err = expectOk(r, 'pdf_report') || expectMarkers(r.stdout, ['Saved out/report.pdf']);
      if (err) return err;
      if (r.plots.length !== 0) return `expected no plot, got ${r.plots.length}`;
      const f = (await inspectFiles(page, ['out/report.pdf']))['out/report.pdf'];
      if (!f || !f.head.startsWith('255044462d') || f.size < 2000) return `bad PDF: ${JSON.stringify(f && { size: f.size, head: f.head })}`;
      return true;
    });

    await record(browserName, name('csv_json writes out/weather.csv & out/weather.json'), async () => {
      const r = await runExample(page, 'csv_json');
      const err = expectOk(r, 'csv_json') || expectMarkers(r.stdout, ['Wrote 3 rows']);
      if (err) return err;
      const f = await inspectFiles(page, ['out/weather.csv', 'out/weather.json']);
      const csv = f['out/weather.csv'];
      const json = f['out/weather.json'];
      if (!csv || !csv.text.startsWith('city,temp_c,rain_mm\r\nOslo,6.2,12.4')) return `bad CSV: ${JSON.stringify(csv)}`;
      let rows = null;
      try { rows = JSON.parse(json.text); } catch { /* reported below */ }
      if (!Array.isArray(rows) || rows.length !== 3 || rows[1].city !== 'Bergen') return `bad JSON: ${JSON.stringify(json)}`;
      return true;
    });

    await record(browserName, name('html_preview writes static out/page.html (no scripts, no URLs)'), async () => {
      const r = await runExample(page, 'html_preview');
      const err = expectOk(r, 'html_preview') || expectMarkers(r.stdout, ['Wrote out/page.html']);
      if (err) return err;
      const f = (await inspectFiles(page, ['out/page.html']))['out/page.html'];
      if (!f || !f.text.startsWith('<!doctype html>') || !f.text.includes('<td>Mars</td><td>1.52</td><td>687</td>')) {
        return `bad HTML: ${JSON.stringify(f)}`;
      }
      if (/<script|https?:|src=|@import|url\(/i.test(f.text)) return 'HTML has a script or an external resource';
      return true;
    });

    await record(browserName, name('asyncio_gather finishes b, a, c and returns results'), async () => {
      const r = await runExample(page, 'asyncio_gather');
      const err = expectOk(r, 'asyncio_gather') || expectMarkers(r.stdout, ["results ['A', 'B', 'C'] in 0."]);
      if (err) return err;
      const order = [...r.stdout.matchAll(/^finish (\w)/gm)].map((m) => m[1]).join('');
      if (order !== 'bac') return `finish order ${order}, expected bac`;
      return true;
    });

    await record(browserName, name('network_probe in Off: same-origin PASS, 3 hosts BLOCKED, 0 external requests'), async () => {
      off.routed.length = 0;
      const r = await runExample(page, 'network_probe');
      const err = expectOk(r, 'network_probe')
        || expectMarkers(r.stdout, [
          PROBE_LINE.same,
          PROBE_LINE.pypiBlocked,
          PROBE_LINE.hostBlocked,
          PROBE_LINE.otherBlocked,
          'Results match network mode: Off',
        ]);
      if (err) return err;
      if (off.routed.length > 0) return `external requests reached the network layer: ${off.routed.join(', ')}`;
      return true;
    }, workerRouting ? '' : 'request count from page only; WebKit routing misses worker requests, the CSP block is shown by BLOCKED');

    await record(browserName, name('no external requests & no page errors during the run'), async () => {
      if (off.routed.length > 0) return `external requests: ${off.routed.join(', ')}`;
      if (off.pageErrors.length > 0) return `page errors: ${off.pageErrors.join(' | ')}`;
      return true;
    });
  } finally {
    await off.ctx.close().catch(() => {});
  }

  // Package index mode: pypi.org answered by a canned CORS response; nothing else may leave.
  // Playwright's WebKit does not route a dedicated worker's requests, so there the probe would
  // reach the real pypi.org: skipped (the CSP side of ?net=pkg is covered by security-checks.mjs).
  if (!workerRouting) {
    await record(browserName, name('network_probe in ?net=pkg (canned PyPI): PyPI PASS, others BLOCKED'), async () => true,
      'skipped: WebKit cannot route worker requests, so it would contact the real pypi.org');
    return;
  }
  const pkg = await openHarness(browser, primaryOrigin, '?net=pkg', {
    fulfill: (url) => (new URL(url).hostname === 'pypi.org'
      ? {
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '{"info": {"name": "rich"}}',
      }
      : null),
  });
  try {
    await record(browserName, name('network_probe in ?net=pkg (canned PyPI): PyPI PASS, others BLOCKED'), async () => {
      const mode = await pkg.page.evaluate(() => window.__pythonHarness.policy.mode);
      if (mode !== 'pkg') return `harness policy mode is ${mode}`;
      const r = await runExample(pkg.page, 'network_probe');
      const err = expectOk(r, 'network_probe')
        || expectMarkers(r.stdout, [
          PROBE_LINE.same,
          PROBE_LINE.pypiPass,
          PROBE_LINE.hostBlocked,
          PROBE_LINE.otherBlocked,
          'Results match network mode: Package index',
        ]);
      if (err) return err;
      const hosts = pkg.routed.map((u) => new URL(u).hostname);
      if (hosts.length !== 1 || hosts[0] !== 'pypi.org') return `expected one routed pypi.org request, got ${hosts.join(', ')}`;
      return true;
    });
  } finally {
    await pkg.ctx.close().catch(() => {});
  }
}
