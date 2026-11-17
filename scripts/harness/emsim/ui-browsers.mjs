// The EM simulation page in Edge, Firefox and WebKit (step M9.1b, milestones.md M9.1; after the Smith chart's
// ui-browsers.mjs, docs/smith-chart/notes-M9.2.md). Per browser (Edge 'msedge' with WebGPU, Playwright's Firefox and
// WebKit, which have no WebGPU adapter here) the main features, each a row of the table "feature × browser":
// - by mouse at 1440 px (light): the page without errors, the trace's and the via's results (the same text as Edge's),
//   a trace handle and a via handle dragged and a via handle moved by keys, an equation with its derivation dialog
//   and the theory's KaTeX laid out (no error node, every formula sized, fractions with their line), the via's and
//   the waves' 3D views (WebGL; if a view cannot open it must say why), the figure, data and project files saved
//   (the same names as Edge's, not empty), the Waves section's backend (the GPU in Edge; elsewhere the fallback
//   message in friendly words: why the CPU, how long), a full-wave run of the CPU's quickest case (the trace 1 mm at
//   100 ps) cancelled (the focus back on Run) and run to the end within the calibrated estimate × 1.25 (on the CPU),
//   the player (play, pause, End and Home on its time slider);
// - by touch at 390 px (dark, hasTouch): a via handle dragged by a finger (CDP touch in Chromium, touch PointerEvents
//   elsewhere: Playwright has no touch move outside Chromium), taps on the section bar, no sideways scroll, the via's
//   layer labels inside the drawing;
// - then ui-access.mjs in Firefox and WebKit (EMSIM_BROWSER; its tables in the log), its count in the table;
// - screenshots of the Waves section's backend message and of the via's side drawing at 390 px dark and 1440 px light
//   in every browser: `emsim-browsers-<browser>-<what>-<width>-<theme>.png`.
//   tsx ui-browsers.mjs [screenshot folder | -] [base URL]      (part of npm run ui)
// EMSIM_BROWSERS=firefox,webkit runs only those; EMSIM_BROWSERS_ACCESS=0 skips the ui-access runs.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, firefox, webkit } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const WHICH = (process.env.EMSIM_BROWSERS ?? 'chromium,firefox,webkit').split(',');
const ACCESS = process.env.EMSIM_BROWSERS_ACCESS !== '0';
if (shots) mkdirSync(shots, { recursive: true });

let passed = 0, failed = 0;
const failures = [];
const ok = (condition, what) => {
  if (condition) { passed++; return true; }
  failed++; const w = typeof what === 'function' ? what() : what; failures.push(w); console.log(`FAIL ${w}`); return false;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// The table: feature → { browser: 'ok' | 'FAIL …' | text }.
const TABLE = new Map();
const cell = (feature, b, v) => { const r = TABLE.get(feature) ?? {}; r[b] = v; TABLE.set(feature, r); };
/** Runs one feature in one browser: true passes, a string is the reason it failed; `note` is added to the cell. */
async function feature(b, name, fn) {
  let res, note = '';
  try { res = await fn((n) => { note = n; }); } catch (e) { res = `threw ${String(e).split('\n')[0].slice(0, 140)}`; }
  const good = res === true;
  ok(good, `${b}: ${name}${good ? '' : ` (${res})`}`);
  cell(name, b, `${good ? 'ok' : 'FAIL'}${note ? ` (${note})` : ''}`);
  return good;
}
const EDGE = {}; // Edge's values, the others compared with them

async function open(ctx, url = URL0) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text().slice(0, 200)}`); });
  await page.goto(url);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  return page;
}
async function loadAll(page) {
  for (const id of ['via', 'waves', 'export', 'examples', 'theory']) {
    await page.evaluate((i) => document.getElementById(i)?.scrollIntoView(), id);
    await page.waitForSelector(`#${id}[data-loaded="true"]`, { timeout: 30000 });
  }
  await page.waitForSelector('[data-via-results][data-state="done"]', { timeout: 30000 });
  await page.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
}
const linkOf = (page) => page.evaluate(() => window.location.search);
const changed = (page, before, ms = 8000) => page.waitForFunction((b) => window.location.search !== b, before, { timeout: ms }).then(() => true).catch(() => false);

/** A click or tap at the centre of `sel` after scrolling it to the middle ourselves, still for two frames, uncovered
 * and enabled (not Playwright's click(): its own re-scroll lands wrongly in WebKit beside content-visibility: auto
 * parts, as the Smith chart found in M9.4). */
async function hit(page, how, sel) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: 'visible', timeout: 20000 });
  const until = Date.now() + 15000;
  let last = null;
  while (Date.now() < until) {
    await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await frame(page);
    const a = await el.boundingBox();
    await frame(page);
    last = await el.evaluate((e) => {
      const b = e.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
      const t = document.elementFromPoint(x, y);
      return { x, y, top: b.top, covered: !t || !(t === e || e.contains(t)), disabled: e.disabled === true, inView: y > 0 && y < window.innerHeight && x > 0 && x < window.innerWidth };
    });
    if (a && Math.abs(a.y - last.top) < 0.5 && last.inView && !last.covered && !last.disabled) {
      if (how === 'touch') await page.touchscreen.tap(last.x, last.y); else await page.mouse.click(last.x, last.y);
      await frame(page);
      return;
    }
    await sleep(100);
  }
  throw new Error(`could not press ${sel}: ${JSON.stringify(last)}`);
}
const centre = async (page, sel) => {
  await page.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await frame(page);
  const b = await page.locator(sel).first().boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};
async function mouseDrag(page, sel, dx, dy, n = 20) {
  const [x, y] = await centre(page, sel);
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= n; i++) { await page.mouse.move(x + (dx * i) / n, y + (dy * i) / n); await sleep(16); }
  await page.mouse.up();
}
/** A one-finger drag: CDP touch events in Chromium, touch PointerEvents to the element under the finger elsewhere. */
async function touchDrag(page, cr, sel, dx, dy, n = 12) {
  const [x, y] = await centre(page, sel);
  if (cr) {
    const cdp = await page.context().newCDPSession(page);
    const t = (type, q) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q[0], y: q[1], id: 1 }] : [] });
    await t('touchStart', [x, y]);
    for (let i = 1; i <= n; i++) { await sleep(16); await t('touchMove', [x + (dx * i) / n, y + (dy * i) / n]); }
    await t('touchEnd', null);
    await cdp.detach();
    return;
  }
  await page.evaluate(async ([x, y, dx, dy, n]) => {
    // A synthetic pointer cannot be captured: capture is a no-op while the drag runs.
    const cap = Element.prototype.setPointerCapture, rel = Element.prototype.releasePointerCapture;
    Element.prototype.setPointerCapture = function (id) { try { cap.call(this, id); } catch { /* synthetic */ } };
    Element.prototype.releasePointerCapture = function (id) { try { rel.call(this, id); } catch { /* synthetic */ } };
    const target = document.elementFromPoint(x, y);
    const at = (type, i) => target.dispatchEvent(new PointerEvent(type, { pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: x + (dx * i) / n, clientY: y + (dy * i) / n,
      button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, composed: true }));
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    at('pointerdown', 0);
    for (let i = 1; i <= n; i++) { await raf(); at('pointermove', i); }
    await raf();
    at('pointerup', n);
    Element.prototype.setPointerCapture = cap; Element.prototype.releasePointerCapture = rel;
  }, [x, y, dx, dy, n]);
}
const labelsFit = (page) => page.evaluate(() => {
  const bad = [];
  let n = 0;
  for (const svg of document.querySelectorAll('svg[data-via-side]')) {
    const b = svg.getBoundingClientRect();
    for (const t of svg.querySelectorAll('[data-via-label]')) {
      n++;
      const r = t.getBoundingClientRect();
      if (r.width < 1 || r.left < b.left - 0.5 || r.right > b.right + 0.5) bad.push(`${t.firstChild?.textContent} ${r.left.toFixed(0)}–${r.right.toFixed(0)} of ${b.left.toFixed(0)}–${b.right.toFixed(0)}`);
    }
  }
  return n >= 2 && !bad.length ? true : `${n} labels: ${bad.join(' | ')}`;
});
/** A screenshot around `sel` (padding above and below), at most 1000 px wide in device pixels. */
async function shot(page, b, what, w, theme, sel, above = 40, below = 40) {
  if (!shots) return;
  await page.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await sleep(300);
  const r = await page.locator(sel).first().boundingBox();
  const vp = page.viewportSize();
  const y = Math.max(0, r.y - above), h = Math.min(vp.height - y, r.height + above + below);
  await page.screenshot({ path: join(shots, `emsim-browsers-${b}-${what}-${w}-${theme}.png`), clip: { x: 0, y, width: vp.width, height: h } });
}
/** The quickest full-wave case (the trace 1 mm long at 100 ps), by mouse. */
async function smallCase(page) {
  await hit(page, 'mouse', '[data-waves-kind-set="trace"]');
  await page.locator('#waves-length').fill('1');
  await page.locator('#waves-length').press('Enter');
  await hit(page, 'mouse', '[data-waves-tr-set="100"]');
  await sleep(300);
  await page.waitForSelector('[data-waves-estimate="ready"][data-seconds]', { timeout: 60000 });
}

async function walk(b, browser) {
  const cr = b === 'chromium';
  // ---- by mouse at 1440 px, light ----
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  const page = await open(ctx);
  await feature(b, 'trace results (same as Edge)', async (note) => {
    await page.waitForSelector('[data-results][data-state="done"]', { timeout: 30000 });
    const t = (await page.$eval('[data-results] dl', (e) => e.textContent)).replace(/\s+/g, ' ').trim();
    if (cr) EDGE.trace = t;
    note(t.slice(0, 40));
    return !EDGE.trace || t === EDGE.trace || `"${t.slice(0, 80)}" against Edge's "${EDGE.trace.slice(0, 80)}"`;
  });
  await feature(b, 'trace handle by mouse', async () => {
    const q = await linkOf(page);
    await mouseDrag(page, '[data-handle="w"]', 24, 0);
    return (await changed(page, q)) || 'the link did not change';
  });
  await loadAll(page);
  await feature(b, 'via results (same as Edge)', async () => {
    const t = (await page.$eval('[data-via-results] dl', (e) => e.textContent)).replace(/\s+/g, ' ').trim();
    if (cr) EDGE.via = t;
    return !EDGE.via || t === EDGE.via || `"${t.slice(0, 80)}" against Edge's "${EDGE.via.slice(0, 80)}"`;
  });
  await feature(b, 'via handle by mouse and by keys', async () => {
    let q = await linkOf(page);
    await mouseDrag(page, '[data-via-handle="pad:L1"]', 16, 0);
    if (!(await changed(page, q))) return 'a mouse drag did not change the link';
    await page.waitForSelector('[data-via-results][data-state="done"]', { timeout: 30000 });
    q = await linkOf(page);
    await page.focus('[data-via-handle="pad:L1"]');
    await page.keyboard.press('ArrowLeft');
    if (!(await changed(page, q))) return 'ArrowLeft did not change the link';
    const shown = await page.$eval('[data-via-handle="pad:L1"]', (e) => { const o = getComputedStyle(e).outlineStyle; return e.matches(':focus-visible') || o !== 'none'; });
    return shown || 'the focused handle shows no :focus-visible';
  });
  await feature(b, 'via labels inside the drawing (1440)', async () => labelsFit(page));
  await shot(page, b, 'via', 1440, 'light', 'svg[data-via-side]', 20, 20);
  await feature(b, 'equation and derivation dialog', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await hit(page, 'mouse', '[data-results] [data-eq-open="z0"]');
    await hit(page, 'mouse', '[data-eq-derive]');
    await page.waitForSelector('dialog[open]', { timeout: 10000 });
    const k = await page.$eval('dialog[open]', (d) => ({ n: d.querySelectorAll('math').length, err: d.querySelectorAll('merror, .katex-error').length, empty: [...d.querySelectorAll('math')].filter((e) => { const r = e.getBoundingClientRect(); return r.width < 1 || r.height < 1; }).length }));
    await hit(page, 'mouse', 'dialog[open] [data-derive-close]');
    const closed = await page.waitForFunction(() => !document.querySelector('dialog[open]'), null, { timeout: 5000 }).then(() => true).catch(() => false);
    await hit(page, 'mouse', '[data-eq-close]');
    return (k.n > 0 && !k.err && !k.empty && closed) || `KaTeX ${k.n}, errors ${k.err}, unsized ${k.empty}, closed ${closed}`;
  });
  await feature(b, 'theory MathML (KaTeX) laid out', async (note) => {
    await page.evaluate(() => document.getElementById('theory')?.scrollIntoView());
    await page.addStyleTag({ content: '[data-theory] *{content-visibility:visible!important}' });
    await sleep(500);
    // KaTeX writes MathML here (KatexSpan): every shown <math> sized, no error node, each fraction stacked.
    const k = await page.evaluate(() => {
      const open = (e) => e.closest('details:not([open])') === null;
      const all = [...document.querySelectorAll('#theory math')];
      const shown = all.filter(open);
      const unsized = shown.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 1 || r.height < 1; }).length;
      const lines = [...document.querySelectorAll('#theory math mfrac')].filter(open);
      const flat = lines.filter((e) => { const [a, c] = e.children; if (!a || !c) return true; const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect(); return !(ra.bottom <= rc.top + 1); }).length;
      return { n: all.length, shown: shown.length, unsized, err: document.querySelectorAll('#theory merror, #theory .katex-error').length, lines: lines.length, flat };
    });
    note(`${k.shown} formulas, ${k.lines} fractions`);
    return (k.shown > 50 && !k.unsized && !k.err && k.lines > 5 && !k.flat) || JSON.stringify(k);
  });
  await feature(b, 'via 3D view (WebGL)', async (note) => {
    await hit(page, 'mouse', '[data-via3d-open]');
    const r = await page.waitForSelector('[data-via3d-ready="true"], [data-via3d-error]', { timeout: 30000 }).then((e) => e.evaluate((x) => (x.hasAttribute('data-via3d-error') ? `says: ${x.textContent}` : true)));
    if (r === true) {
      const c0 = await page.$eval('[data-via3d-host]', (e) => e.emsimVia3d?.camera?.position.toArray().join(','));
      await mouseDrag(page, '[data-via3d-host]', 60, 10);
      await sleep(300);
      const c1 = await page.$eval('[data-via3d-host]', (e) => e.emsimVia3d?.camera?.position.toArray().join(','));
      note(c0 !== c1 ? 'turns' : 'did not turn');
      await hit(page, 'mouse', '[data-via3d-open]');
      return c0 !== c1 || 'a drag did not turn it';
    }
    return r;
  });
  await feature(b, 'files saved (figure, data, project)', async (note) => {
    const names = [];
    for (const sel of ['[data-export-save]', '[data-data-save]', '[data-project-save]']) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), hit(page, 'mouse', sel)]);
      const p = await dl.path();
      const size = p ? readFileSync(p).length : 0;
      if (!size) return `${sel}: empty file ${dl.suggestedFilename()}`;
      names.push(dl.suggestedFilename());
    }
    if (cr) EDGE.files = names.join(', ');
    note(names.join(', '));
    return !EDGE.files || names.join(', ') === EDGE.files || `names ${names.join(', ')} against Edge's ${EDGE.files}`;
  });
  const gpu = await page.evaluate(async () => { try { return !!(await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })); } catch { return false; } });
  await feature(b, 'WebGPU here', async (note) => {
    const w = await page.evaluate(async () => {
      if (!navigator.gpu) return 'no navigator.gpu';
      const a = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
      if (!a) return 'navigator.gpu, no adapter';
      return `adapter ${a.info?.vendor ?? ''} ${a.info?.architecture ?? ''}, maxBufferSize ${(a.limits.maxBufferSize / 2 ** 30).toFixed(1)} GiB, binding ${(a.limits.maxStorageBufferBindingSize / 2 ** 30).toFixed(1)} GiB, ${a.limits.maxStorageBuffersPerShaderStage} storage buffers`;
    });
    note(w);
    return true;
  });
  await smallCase(page);
  await feature(b, 'Waves: where it runs and why', async (note) => {
    const t = await page.$eval('[data-waves-backend]', (e) => ({ text: e.textContent.replace(/\s+/g, ' ').trim(), bk: e.getAttribute('data-waves-backend'), fb: e.getAttribute('data-waves-fallback') }));
    note(t.text.slice(0, 60));
    console.log(`${b}: ${t.text}`);
    if (gpu) return t.bk === 'webgpu' || `with a GPU adapter it runs on ${t.bk}`;
    return (t.bk === 'js' && !!t.fb && /WebGPU/.test(t.text) && /graphics card/.test(t.text) && /about \d/.test(t.text)) || `the CPU's message: ${t.text}`;
  });
  await shot(page, b, 'waves', 1440, 'light', '[data-waves-estimate]', 260, 90);
  await feature(b, 'full-wave run: cancel, then run', async (note) => {
    const before = Number(await page.$eval('[data-waves-estimate]', (e) => e.getAttribute('data-seconds')));
    await hit(page, 'mouse', '[data-waves-run]');
    await page.waitForSelector('[data-waves-cancel]', { timeout: 20000 });
    let cancelled = 'cancelled';
    if (gpu) {
      // On the GPU this case ends in about a second: Cancel at once if it is still there (ui-access.mjs cancels a
      // longer run in Edge).
      const c = await page.$('[data-waves-cancel]');
      if (c) await c.click().catch(() => {});
      cancelled = await page.waitForSelector('[data-waves-phase="cancelled"], [data-waves-phase="done"]', { timeout: 20000 }).then((e) => e.getAttribute('data-waves-phase'));
    } else {
      await sleep(1500);
      await hit(page, 'mouse', '[data-waves-cancel]');
      await page.waitForSelector('[data-waves-phase="cancelled"]', { timeout: 20000 });
    }
    const onRun = await page.evaluate(() => document.activeElement?.hasAttribute('data-waves-run'));
    if (cancelled === 'cancelled' && !onRun) return 'after Cancel the focus is not on Run';
    const t0 = Date.now();
    await hit(page, 'mouse', '[data-waves-run]');
    await page.waitForSelector('[data-waves-results][data-stale="false"] [data-waves-player]', { timeout: 600000 });
    const wall = (Date.now() - t0) / 1000;
    const r = await page.$eval('[data-waves-results]', (e) => ({ el: Number(e.getAttribute('data-elapsed')), est: Number(e.getAttribute('data-estimate')), bk: e.getAttribute('data-backend') }));
    note(`${cancelled === 'cancelled' ? '' : 'ended before Cancel; '}${r.bk === 'webgpu' ? 'GPU' : 'CPU'} ${r.el.toFixed(1)} s, estimate ${r.est.toFixed(1)} s (${before.toFixed(0)} s before it measured)`);
    console.log(`${b}: run on ${r.bk} in ${r.el.toFixed(2)} s (wall ${wall.toFixed(1)} s), calibrated estimate ${r.est.toFixed(2)} s, shown before the run ${before.toFixed(1)} s`);
    if (r.bk === 'js') return r.el <= r.est * 1.25 || `${r.el.toFixed(1)} s over the estimate × 1.25 (${(r.est * 1.25).toFixed(1)} s)`;
    return r.bk === 'webgpu' || `ran on ${r.bk}`;
  });
  await feature(b, 'player: play, pause, End and Home', async () => {
    const attr = (a) => page.$eval('[data-waves-player]', (e, x) => e.getAttribute(x), a);
    const f0 = await attr('data-player-frame');
    if ((await attr('data-player-playing')) !== 'true') await hit(page, 'mouse', '[data-player-play]');
    await sleep(1200);
    const f1 = await attr('data-player-frame');
    await hit(page, 'mouse', '[data-player-play]');
    if ((await attr('data-player-playing')) === 'true') return 'it does not pause';
    await page.focus('[data-player-time]');
    await page.keyboard.press('End');
    const n = Number(await attr('data-player-frames')), fe = Number(await attr('data-player-frame'));
    await page.keyboard.press('Home');
    const fh = Number(await attr('data-player-frame'));
    return (f1 !== f0 && fe === n - 1 && fh === 0) || `frames ${f0} → ${f1} playing, End ${fe} of ${n}, Home ${fh}`;
  });
  await feature(b, 'waves 3D view (WebGL)', async () => {
    await hit(page, 'mouse', '[data-waves3d-open]');
    const r = await page.waitForSelector('[data-waves3d-ready="true"], [data-waves3d-error]', { timeout: 30000 }).then((e) => e.evaluate((x) => (x.hasAttribute('data-waves3d-error') ? `says: ${x.textContent}` : true)));
    if (r === true) await hit(page, 'mouse', '[data-waves3d-open]');
    return r;
  });
  await feature(b, 'no page or console errors (1440, mouse)', async () => page.errors.length === 0 || page.errors.slice(0, 3).join(' | '));
  await ctx.close();

  // ---- by touch at 390 px, dark ----
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark' });
  const tp = await open(tctx);
  await feature(b, 'taps: a section link in the bar', async () => {
    await hit(tp, 'touch', 'nav a[href="#via"]');
    return (await tp.waitForFunction(() => window.location.hash === '#via', null, { timeout: 5000 }).then(() => true).catch(() => false)) || 'the hash did not become #via';
  });
  await loadAll(tp);
  await feature(b, `via handle by a finger (${cr ? 'CDP touch' : 'touch PointerEvents'})`, async () => {
    const q = await linkOf(tp);
    await touchDrag(tp, cr, '[data-via-handle="pad:L1"]', 14, 0);
    return (await changed(tp, q)) || 'the link did not change';
  });
  await feature(b, 'via labels inside the drawing (390)', async () => labelsFit(tp));
  await shot(tp, b, 'via', 390, 'dark', 'svg[data-via-side]', 20, 20);
  await smallCase(tp);
  await shot(tp, b, 'waves', 390, 'dark', '[data-waves-estimate]', 300, 120);
  await feature(b, 'no sideways scroll (390)', async () => {
    const r = await tp.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
    return r.sw <= r.vw + 1 || `${r.sw} of ${r.vw}`;
  });
  await feature(b, 'no page or console errors (390, touch)', async () => tp.errors.length === 0 || tp.errors.slice(0, 3).join(' | '));
  await tctx.close();
}

for (const b of WHICH) {
  console.log(`=== ${b}`);
  let browser = null;
  try {
    browser = b === 'chromium' ? await chromium.launch({ channel: 'msedge', args: ARGS }) : await (b === 'firefox' ? firefox : webkit).launch();
  } catch (e) { ok(false, `${b}: not installed (npx playwright-core install ${b}): ${String(e).split('\n')[0]}`); continue; }
  console.log(`${b} ${browser.version()}`);
  cell('version', b, browser.version());
  try { await walk(b, browser); } finally { await browser.close(); }
}

// ui-access.mjs in Firefox and WebKit, one after the other (their full-wave runs are on the CPU).
if (ACCESS) {
  for (const b of WHICH.filter((x) => x !== 'chromium')) {
    console.log(`=== ui-access.mjs in ${b}`);
    const out = await new Promise((res) => {
      const p = spawn('npx', ['tsx', 'ui-access.mjs', shots ?? '-', base], { cwd: here, shell: true, env: { ...process.env, EMSIM_BROWSER: b } });
      let text = '';
      p.stdout.on('data', (d) => { text += d; process.stdout.write(d); });
      p.stderr.on('data', (d) => { text += d; process.stdout.write(d); });
      p.on('close', (code) => res({ text, code }));
    });
    const m = /RESULT \S+ (\d+) (\d+)/.exec(out.text);
    const tasks = [...out.text.matchAll(/^\| ([^|]+) \| (ok|FAIL|–) \| (ok|FAIL|–) \|$/gm)];
    const good = tasks.filter((t) => t[2] !== 'FAIL' && t[3] !== 'FAIL').length;
    ok(!!m && m[2] === '0' && out.code === 0, `${b}: ui-access.mjs passes (${m ? `${m[1]} passed, ${m[2]} failed` : `exit ${out.code}`})`);
    cell('ui-access.mjs (contrast, names, Tab, keys, touch, live, motion, layout)', b, m ? `${m[2] === '0' ? 'ok' : 'FAIL'} (${m[1]} of ${Number(m[1]) + Number(m[2])})` : `FAIL (exit ${out.code})`);
    cell('tasks by keys and by touch (ui-access.mjs)', b, `${good} of ${tasks.length}`);
  }
  if (WHICH.includes('chromium')) {
    cell('ui-access.mjs (contrast, names, Tab, keys, touch, live, motion, layout)', 'chromium', 'its own run in npm run ui');
    cell('tasks by keys and by touch (ui-access.mjs)', 'chromium', 'its own run');
  }
}

console.log(`\nFeature × browser:\n| Feature | ${WHICH.map((b) => (b === 'chromium' ? 'Edge' : b[0].toUpperCase() + b.slice(1))).join(' | ')} |\n| --- |${WHICH.map(() => ' --- |').join('')}`);
for (const [f, r] of TABLE) console.log(`| ${f} | ${WHICH.map((b) => r[b] ?? '–').join(' | ')} |`);
console.log(`\n${passed} passed, ${failed} failed.`);
for (const f of failures) console.log(`FAILED ${f}`);
process.exit(failed ? 1 : 0);
