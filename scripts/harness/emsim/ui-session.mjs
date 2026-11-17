// A visitor's session on /em-sim/main in the installed Edge with WebGPU, for memory (step M9.2): rounds of what a
// visitor does, again and again: (A, the single via) a typed width and a dielectric's thickness (each undone), the kind
// switched to a pair and back, a trace handle and a via handle dragged (undone), the field map on and off, the via's
// 3D view opened, turned and closed, Z0's equation and its derivation (three steps), a figure and the data saved, a
// full-wave run of the via (every other round first cancelled mid-run), the player played and paused, the waves' 3D
// view opened and closed; (B, the LVDS pair) the pair preset, a pair run cancelled mid-run and one to the end, the
// player's drives (differential, common, single), the 3D views, then the single preset and its run again. Each round
// ends at the same rest state (single via, its run done, views closed, nothing open), and at the first rest state
// after every SAMPLE_S seconds it samples, after two forced collections each: the page's JS heap (CDP
// Runtime.getHeapUsage, and the ArrayBuffers' backing store), the static and the full-wave worker's heaps (through
// CDP's worker targets), DOM nodes, documents and event listeners (Performance.getMetrics), the WebGL contexts the
// page made, still reachable and not lost (getContext wrapped), and the GPU buffers the full-wave worker held at the
// start of each run (gpuHeld() in the run's started info, data-waves-held).
// Done when (notes-M9.2.md): no page error; the GPU buffers held at every run's start are the same from the worker's
// second run on (its first run also calibrates); no WebGL context live (made and not lost) at a rest state (the
// views are closed); the page heap after GC: the last sample within 10 % of the third, and (EMSIM_SESSION_LONG=1,
// 10 minutes) the least-squares slope over the samples from minute 2 on under 1 MiB/min; DOM nodes and listeners
// within 10 % of the third sample; the workers' heaps the same rules.
//   tsx ui-session.mjs [screenshot folder | -] [base URL]      (part of npm run ui: 2 minutes; EMSIM_SESSION_LONG=1:
//   10 minutes; EMSIM_SESSION_MINUTES=n any length)

import { chromium } from 'playwright-core';

const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const LONG = process.env.EMSIM_SESSION_LONG === '1';
const MINUTES = Number(process.env.EMSIM_SESSION_MINUTES ?? (LONG ? 10 : 2));
const SAMPLE_S = 30;
const MiB = 1048576;

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) { pass++; console.log(`ok   ${what}`); } else { fails.push(what); console.log(`FAIL ${what}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge', args: ARGS });
const errors = [];
const counts = {};
const did = (k) => { counts[k] = (counts[k] ?? 0) + 1; };
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', acceptDownloads: true });
  await ctx.addInitScript(() => {
    // Counts only (no reference kept: a WeakRef's deref would keep its context for the rest of the task).
    const n = { made: 0, lost: 0 }, seen = new WeakSet();
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      const c = orig.call(this, type, ...a);
      if (c && /webgl/.test(String(type)) && !seen.has(this)) { seen.add(this); n.made++; this.addEventListener('webglcontextlost', () => { n.lost++; }, { once: true }); }
      return c;
    };
    window.__emsimGl = () => ({ made: n.made, live: n.made - n.lost });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Too many active WebGL|favicon/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');

  // The workers: CDP's worker targets (not flattened), asked through Target.sendMessageToTarget.
  const workers = new Map(); // sessionId → name: the static worker starts with the page, the full-wave worker with the Waves section
  let nWorkers = 0;
  const waiting = new Map();
  let mid = 1;
  cdp.on('Target.attachedToTarget', (ev) => { if (ev.targetInfo.type === 'worker') { nWorkers++; workers.set(ev.sessionId, nWorkers === 1 ? 'static' : nWorkers === 2 ? 'fdtd' : `worker ${nWorkers}`); } });
  cdp.on('Target.detachedFromTarget', (ev) => workers.delete(ev.sessionId));
  cdp.on('Target.receivedMessageFromTarget', (ev) => {
    const m = JSON.parse(ev.message);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  });
  await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
  const ask = (sessionId, method, params = {}) => new Promise((done) => {
    const id = mid++;
    waiting.set(id, done);
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(() => done({ error: 'gone' }));
    setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); done({ error: 'timeout' }); } }, 10000);
  });

  // ---- helpers ----
  // Locators, never element handles: a handle Playwright gives (waitForSelector, $) keeps its element, and with it a
  // closed view's whole tree, alive until it is disposed (M9.2: that alone made the session look like a leak).
  const waitFor = (sel, o = {}) => page.locator(sel).first().waitFor({ state: o.state ?? 'attached', timeout: o.timeout ?? 30000 });
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const attr = (sel, a) => page.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [sel, a]);
  const solved = async () => {
    await page.waitForTimeout(30);
    await waitFor('[data-results]:not([data-stale="true"]):not([data-quick="true"])', { timeout: 30000 });
    await waitFor('[data-dragging="false"]', { timeout: 30000 });
  };
  const viaDone = () => waitFor('[data-via-solves][data-dragging="false"][data-quick="false"] [data-via-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
  const estimate = async () => { await waitFor('[data-waves-estimate="ready"]', { timeout: 60000 }); await sleep(300); };
  const centre = async (sel) => {
    await page.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await frame();
    const b = await page.locator(sel).first().boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const mouseDrag = async (sel, dx, dy, n = 20) => {
    const [x, y] = await centre(sel);
    await page.mouse.move(x, y); await page.mouse.down();
    for (let i = 1; i <= n; i++) { await page.mouse.move(x + (dx * i) / n, y + (dy * i) / n); await sleep(16); }
    await page.mouse.up();
  };
  const click = async (sel) => { await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.locator(sel).first().click(); };
  const undo = async () => { await click('[data-undo]'); };
  let k = 0;

  // A visitor's actions (each returns the page to where it was, except the via preset and the runs).
  const A = {
    async width() { const f = page.locator('[data-field="trace.w"] input').first(); await f.scrollIntoViewIfNeeded(); await f.fill((0.31 + 0.001 * (k++ % 9)).toFixed(3)); await f.press('Enter'); await solved(); await undo(); await solved(); },
    async stackup() { const f = page.locator('[data-field$=".t"] input').first(); await f.scrollIntoViewIfNeeded(); await f.fill((0.2 + 0.001 * (k++ % 7)).toFixed(3)); await f.press('Enter'); await solved(); await undo(); await solved(); },
    async kind() { await page.selectOption('[data-trace-kind]', 'pair-microstrip'); await solved(); await page.selectOption('[data-trace-kind]', 'microstrip'); await solved(); },
    async traceDrag() { await mouseDrag('[data-handle="w"]', 24, 0); await solved(); await undo(); await solved(); },
    async fields() {
      await click('[data-field-on]');
      await page.waitForFunction(() => document.querySelector('[data-trace-view]')?.getAttribute('data-field-state') === 'done', null, { timeout: 30000 });
      await mouseDrag('[data-handle="w"]', -16, 0); await solved(); await undo(); await solved();
      await click('[data-field-on]');
    },
    async viaDrag() { await mouseDrag('[data-via-handle="pad:L1"]', 12, 0); await viaDone(); await undo(); await viaDone(); },
    async via3d() {
      await click('[data-via3d-open]');
      await waitFor('[data-via3d-ready="true"]', { timeout: 30000 });
      await mouseDrag('[data-via3d-host]', 60, 10);
      await click('[data-via3d-open]');
      await waitFor('[data-via3d]', { state: 'detached', timeout: 10000 });
    },
    async equation() {
      await click('[data-results] [data-eq-open="z0"]');
      await click('[data-eq-derive]');
      await waitFor('dialog[open] [data-derive-step]', { timeout: 30000 });
      for (let i = 0; i < 3; i++) if (await page.locator('dialog[open] [data-derive-next]').isEnabled().catch(() => false)) await page.click('dialog[open] [data-derive-next]');
      await page.click('dialog[open] [data-derive-close]');
      await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 5000 });
      await click('[data-eq-close]');
    },
    async save() {
      for (const sel of ['[data-export-save]', '[data-data-save]']) {
        await page.locator(sel).first().scrollIntoViewIfNeeded();
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click(sel)]);
        await dl.delete().catch(() => {});
      }
    },
    async play() {
      if (!(await page.locator('[data-player-play]').count())) return;
      await click('[data-player-play]');
      await sleep(1500);
      if ((await attr('[data-waves-player]', 'data-player-playing')) === 'true') await click('[data-player-play]');
      await click('[data-player-view-set="entry"]'); await sleep(300); await click('[data-player-view-set="side"]');
    },
    async drives() {
      for (const m of ['diff', 'common', 'single', 'diff']) if (await page.locator(`[data-player-mode-set="${m}"]`).count()) { await click(`[data-player-mode-set="${m}"]`); await sleep(400); }
    },
    async waves3d() {
      if (!(await page.locator('[data-waves3d-open]').count())) return;
      await click('[data-waves3d-open]');
      await waitFor('[data-waves3d-ready="true"]', { timeout: 30000 });
      await sleep(1000);
      await click('[data-waves3d-open]');
      await waitFor('[data-waves3d]', { state: 'detached', timeout: 10000 });
    },
  };
  const helds = []; // { h: 'buffers/bytes' the worker holds once a run's are made, kind: the via's preset }
  let viaKind = 'single';
  const fw = [];
  /** A full-wave run: to the end, or cancelled once it is `cancelAt` of the way. */
  async function run(cancelAt = 0) {
    await estimate();
    await click('[data-waves-run]');
    await page.waitForFunction(() => {
      const p = document.querySelector('[data-waves-progress]')?.getAttribute('data-waves-progress');
      return document.querySelector('[data-waves-held]:not([data-waves-held=""])') && (Number(p) > 0.02 || p === 'done');
    }, null, { timeout: 120000 });
    helds.push({ h: await attr('[data-waves-held]', 'data-waves-held'), kind: viaKind });
    if (cancelAt) {
      await page.waitForFunction((c) => { const p = document.querySelector('[data-waves-progress]')?.getAttribute('data-waves-progress'); return Number(p) > c || p === 'done'; }, cancelAt, { timeout: 120000 });
      if (await page.locator('[data-waves-cancel]').count()) { await page.locator('[data-waves-cancel]').click({ timeout: 2000 }).catch(() => {}); did('runs cancelled'); }
      await waitFor('[data-waves-phase="cancelled"], [data-waves-phase="done"]', { timeout: 30000 });
      return;
    }
    await waitFor('[data-waves-results][data-stale="false"] [data-waves-player]', { timeout: 300000 });
    const g = async (a) => Number(await attr('[data-waves-results]', a));
    fw.push({ el: await g('data-elapsed'), est: await g('data-estimate') });
    did('runs to the end');
  }
  const preset = async (kd) => {
    viaKind = kd;
    await click(`[data-via-preset="${kd}"]`);
    await waitFor(`[data-via-results][data-n="${kd === 'pair' ? 2 : 1}"]`, { timeout: 60000 });
    await viaDone();
  };

  // ---- the samples ----
  const samples = [];
  async function sample(t) {
    for (let i = 0; i < 2; i++) await cdp.send('HeapProfiler.collectGarbage');
    const h = await cdp.send('Runtime.getHeapUsage');
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    const w = {};
    for (const [sid, wn] of workers) {
      await ask(sid, 'HeapProfiler.collectGarbage'); await ask(sid, 'HeapProfiler.collectGarbage');
      const r = await ask(sid, 'Runtime.getHeapUsage');
      if (r.result) w[wn] = r.result.usedSize;
    }
    const gl = await page.evaluate(() => window.__emsimGl());
    const s = { t, heap: h.usedSize, backing: h.backingStorageSize ?? NaN, nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents, w, gl, held: helds[helds.length - 1]?.h ?? '' };
    samples.push(s);
    console.log(`${(t / 60000).toFixed(2)} min: heap ${(s.heap / MiB).toFixed(2)} MiB (ArrayBuffers ${(s.backing / MiB).toFixed(1)}), workers ${Object.entries(w).map(([n, v]) => `${n} ${(v / MiB).toFixed(2)}`).join(', ')} MiB, ${s.nodes} nodes, ${s.listeners} listeners, ${s.docs} documents, WebGL made ${gl.made} live ${gl.live}, GPU held ${s.held}`);
  }

  // ---- the session ----
  await page.goto(URL0);
  await waitFor('[data-ready="true"]', { timeout: 30000 });
  await solved();
  for (const id of ['via', 'waves']) {
    await page.evaluate((i) => document.getElementById(i)?.scrollIntoView(), id);
    await waitFor(`#${id}[data-loaded="true"]`, { timeout: 30000 });
  }
  await viaDone();
  await run(); // the worker's first run (it calibrates)
  const t0 = Date.now();
  await sample(0);
  let next = SAMPLE_S * 1000, round = 0;
  const step = async (name, fn) => { try { await fn(); did(name); } catch (e) { errors.push(`${name}: ${String(e).split('\n')[0].slice(0, 160)}`); } };
  const rest = async () => { if (Date.now() - t0 >= next) { await sample(Date.now() - t0); while (next <= Date.now() - t0) next += SAMPLE_S * 1000; } };
  while (Date.now() - t0 < MINUTES * 60000) {
    // (A) the single via
    for (const [n, f] of Object.entries(A)) if (n !== 'drives') await step(n, f);
    await step('single run', () => run(round % 2 === 0 ? 0.3 : 0));
    if (round % 2 === 0) await step('single run', () => run());
    await step('play', A.play);
    await rest();
    if (Date.now() - t0 >= MINUTES * 60000) break;
    // (B) the LVDS pair
    await step('pair preset', () => preset('pair'));
    await step('via3d', A.via3d);
    await step('pair run', () => run(0.3));
    await step('pair run', () => run());
    await step('play', A.play);
    await step('drives', A.drives);
    await step('waves3d', A.waves3d);
    await step('single preset', () => preset('single'));
    await step('single run', () => run());
    await rest();
    round++;
  }
  const tEnd = Date.now() - t0;
  // The page's heap at the end: WebGL context objects and detached DOM nodes still reachable (views closed).
  const snapshot = async () => {
    for (let i = 0; i < 2; i++) await cdp.send('HeapProfiler.collectGarbage');
    const parts = [];
    const on = (e) => parts.push(e.chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk', on);
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    cdp.off('HeapProfiler.addHeapSnapshotChunk', on);
    const h = JSON.parse(parts.join(''));
    const f = h.snapshot.meta.node_fields, NF = f.length, iT = f.indexOf('type'), iN = f.indexOf('name'), iD = f.indexOf('detachedness');
    const types = h.snapshot.meta.node_types[0];
    let gl = 0, detached = 0;
    for (let i = 0; i < h.nodes.length; i += NF) {
      const t = types[h.nodes[i + iT]];
      if (t === 'object' && /^WebGL2?RenderingContext$/.test(h.strings[h.nodes[i + iN]])) gl++;
      if (iD >= 0 && t === 'native' && h.nodes[i + iD] === 2) detached++;
    }
    return { gl, detached };
  };
  const snap = await snapshot();
  console.log(`  heap snapshot at the end: ${snap.gl} WebGL context objects, ${snap.detached} detached DOM nodes`);
  if (samples[samples.length - 1].t < tEnd - 5000) await sample(tEnd);
  console.log(`  ${round} rounds in ${(tEnd / 60000).toFixed(1)} min: ${Object.entries(counts).map(([n, c]) => `${n} ${c}`).join(', ')}`);
  console.log(`  full-wave runs to the end: ${fw.map((r) => `${r.el.toFixed(1)}/${r.est.toFixed(1)} s`).join(', ')} (elapsed / estimate)`);

  // ---- the verdicts ----
  console.log('\n| min | page heap MiB | ArrayBuffers MiB | static worker MiB | full-wave worker MiB | DOM nodes | listeners | documents | WebGL made / live | GPU buffers held |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const mb = (x) => (Number.isFinite(x) ? (x / MiB).toFixed(2) : '–');
  for (const s of samples) console.log(`| ${(s.t / 60000).toFixed(1)} | ${mb(s.heap)} | ${mb(s.backing)} | ${mb(s.w.static)} | ${mb(s.w.fdtd)} | ${s.nodes} | ${s.listeners} | ${s.docs} | ${s.gl.made} / ${s.gl.live} | ${s.held} |`);
  const third = samples[Math.min(2, samples.length - 1)], last = samples[samples.length - 1];
  const within = (a, b, f = 0.1) => Number.isFinite(a) && Number.isFinite(b) ? Math.abs(b - a) <= f * Math.abs(a) : true;
  const slope = (key) => {
    const pts = samples.filter((s) => s.t >= 120000).map((s) => [s.t / 60000, key(s)]).filter(([, y]) => Number.isFinite(y));
    if (pts.length < 3) return NaN;
    const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    return pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  };
  check(samples.length >= 4, `${samples.length} samples over ${(tEnd / 60000).toFixed(1)} minutes`);
  for (const [name, key] of [['page heap', (s) => s.heap], ['static worker heap', (s) => s.w.static], ['full-wave worker heap', (s) => s.w.fdtd]]) {
    const sl = slope(key);
    check(within(key(third), key(last)), `${name} after GC: last ${mb(key(last))} MiB within 10 % of the third sample's ${mb(key(third))} MiB`);
    if (LONG || Number.isFinite(sl)) check(!(sl > 1 * MiB), `${name}: slope from minute 2 on ${Number.isFinite(sl) ? (sl / 1024).toFixed(0) : '–'} kiB/min (under 1 MiB/min)`);
  }
  check(within(third.nodes, last.nodes) && within(third.listeners, last.listeners), `DOM nodes ${third.nodes} → ${last.nodes} and listeners ${third.listeners} → ${last.listeners} within 10 %`);
  check(samples.every((s) => s.docs <= third.docs + 1), `documents stay at ${third.docs}`);
  check(samples.every((s) => s.gl.live === 0), `no WebGL context live at the rest points (views closed): ${samples.map((s) => s.gl.live).join(', ')} (made ${last.gl.made})`);
  check(snap.gl <= 1 && snap.detached <= 50, `the heap at the end holds ${snap.gl} WebGL context objects (≤ 1) and ${snap.detached} detached DOM nodes (≤ 50)`);
  // Held once a run's buffers are made: the same for every run of a structure from the worker's second run on (its
  // first also keeps the calibration's staging buffer), so nothing of an earlier run, finished or cancelled, is left.
  const later = helds.slice(1), byKind = {};
  for (const x of later) (byKind[x.kind] ??= new Set()).add(x.h);
  const n0 = Number(helds[0]?.h.split('/')[0]), n1 = later.length ? Number(later[0].h.split('/')[0]) : NaN;
  check(helds.length >= 4 && Object.values(byKind).every((v) => v.size === 1) && new Set(later.map((x) => x.h.split('/')[0])).size === 1 && n0 <= n1 + 1,
    `GPU buffers held once each of ${helds.length} runs' are made: ${Object.entries(byKind).map(([k, v]) => `${k} ${[...v].join(' | ')}`).join('; ')} (the first run ${helds[0]?.h})`);
  check(fw.every((r) => r.el <= 2 * r.est), `every run to the end within 2× of its estimate (${fw.length} runs)`);
  check(errors.length === 0, `no page errors or failed steps (${errors.slice(0, 4).join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`\nui-session: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log(`FAIL ${f}`);
process.exit(fails.length ? 1 : 0);
