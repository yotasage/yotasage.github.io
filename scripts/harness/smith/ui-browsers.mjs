// Drives /smith-chart/main in Edge (or Chrome), Firefox and WebKit (step M9.2, milestones.md M9) and walks the main
// tasks in each, the way ui-a11y.mjs walks them by keyboard:
// - by mouse at 1440 px: load, edit a circuit (add a part, type a value), drag a handle, wheel zoom and a click that
//   reads, undo and redo, solve and Apply, sweep with a marker and the plot (trace drawn, pointing at it), the
//   Equations panel and a derivation (MathML present and laid out: every visible <math> has a size, fractions
//   stacked, no KaTeX or MathML error), Explain, Learn (an example played to "finished"), the report (Print, the print
//   media DOM; page.pdf() only in Chromium), export (SVG, PNG, TikZ, CSVs, .s1p and the project saved as files),
//   theory topics and a citation; no console errors;
// - by touch at 390 px (contexts with hasTouch; page.tap in every browser): the same tasks by taps, and a one-finger
//   drag of a handle: real touch events by CDP in Chromium; in Firefox and WebKit, whose Playwright drivers can only
//   tap, the drag is sent as touch PointerEvents to the chart (our handlers, not the browser's gesture);
// - no horizontal scroll at 320 and 390 px (the start, a sweep, a derivation open);
// - a screenshot per browser of the chart with a sweep and of a derivation (argument 1, default the temp folder's
//   smith-browsers);
// - touch through every task in Chromium's emulation (CDP Input.dispatchTouchEvent): taps, a one-finger drag on a
//   handle (the page does not scroll), a two-finger pinch on the chart (3×, the page not zoomed), one finger off the
//   handles scrolls the page past the chart (the view unchanged), a finger along the plot, and every task of the walk.
//   tsx ui-browsers.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, firefox, webkit } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedExamples from '../../../lib/smith/examples.ts';

const S = importedState.default ?? importedState;
const X = importedExamples.default ?? importedExamples;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : join(tmpdir(), 'smith-browsers');
const base = process.argv[3] ?? 'http://localhost:3020';
mkdirSync(shots, { recursive: true });

const up = async () => { try { return (await fetch(`${base}/smith-chart/main`)).ok; } catch { return false; } };
let server = null;
const agentsBefore = existsSync(join(repo, 'AGENTS.md'));
if (!(await up())) {
  server = spawn('npm', ['run', 'dev'], { cwd: repo, shell: true, stdio: 'ignore' });
  const until = Date.now() + 180000;
  while (!(await up())) {
    if (Date.now() > until) { console.error('The dev server did not start.'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
const stopServer = () => {
  if (server) {
    try { execSync(process.platform === 'win32' ? `taskkill /pid ${server.pid} /T /F` : `kill ${server.pid}`, { stdio: 'ignore' }); } catch { /* gone */ }
  }
  if (!agentsBefore && existsSync(join(repo, 'AGENTS.md'))) rmSync(join(repo, 'AGENTS.md'));
};

let passed = 0, failed = 0;
const failures = [];
let where = '';
const ok = (condition, what) => {
  if (condition) passed++;
  else { if (failed < 80) failures.push(`${where}: ${typeof what === 'function' ? what() : what}`); failed++; }
};
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};

const START = S.encodeCircuit(S.defaultCircuit());
const SOLVE = `${START}&u=1,2&g=pt:50:0`;
const SWEEP = `${START}&sw=60e6:160e6:301&mk=95e6,120e6`;

async function open(context, search = START) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed ?? 0) + 1; }; });
  await page.goto(`${base}/smith-chart/main?${search}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-handle="0"]', { state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await page.bringToFront();
  await frame(page);
  return page;
}
const query = (page) => page.evaluate(() => window.location.search.slice(1));
const linked = async (page) => S.decodeCircuit(await query(page)).circuit;
const changed = (page, before) => page.waitForFunction((b) => window.location.search.slice(1) !== b, before, { timeout: 5000 }).then(() => true).catch(() => false);
const has = async (page, sel) => (await page.$(sel)) !== null;
const noScroll = (page) => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
const view = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-chart]'), v = box.smithChart, r = box.getBoundingClientRect();
  return { cx: v.cx, cy: v.cy, k: v.k, left: r.left, top: r.top, w: r.width, h: r.height, scrollY: window.scrollY, scale: window.visualViewport?.scale ?? 1 };
});
const centre = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s);
  if (!e) return null;
  const b = e.getBoundingClientRect();
  return [b.left + b.width / 2, b.top + b.height / 2];
}, sel);

/** A press of `sel`: a mouse click or a tap. */
async function press(page, how, sel) {
  await hit(page, how, page.locator(sel).first());
  await frame(page);
}

/**
 * A click or tap on `el` at its centre, after scrolling it to the middle of the screen ourselves and checking that
 * nothing covers it and it is enabled. Not Playwright's `click()`/`tap()`: their own scroll-into-view runs again inside
 * the action, and in WebKit it lands by a wrong amount on this page (the Theory, Report and Equations parts are
 * `content-visibility: auto` with placeholder heights, which change as they enter the screen, and WebKit has no
 * scroll anchoring): the press then hit the chart or <main> and the Learn example or an export button got nothing
 * (one WebKit failure in about every run, at a different place each time; M9.4).
 */
async function hit(page, how, el) {
  await el.waitFor({ state: 'visible', timeout: 15000 });
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
      const covered = !t || !(t === e || e.contains(t) || [...(e.labels ?? [])].some((l) => l.contains(t)));
      return { x, y, top: b.top, covered, disabled: e.disabled === true, inView: y > 0 && y < window.innerHeight && x > 0 && x < window.innerWidth };
    });
    // Still for two frames (a lazily rendered part above it did not move it), in view, uncovered and enabled.
    if (a && Math.abs(a.y - last.top) < 0.5 && last.inView && !last.covered && !last.disabled) {
      if (how === 'touch') await page.touchscreen.tap(last.x, last.y); else await page.mouse.click(last.x, last.y);
      return;
    }
    await sleep(100);
  }
  throw new Error(`could not press ${el}: ${JSON.stringify(last)}`);
}

/** MathML inside `sel`: present, every visible <math> laid out with a size, a fraction stacked, no error node. */
async function mathml(page, sel, what) {
  const m = await page.evaluate((s) => {
    const root = document.querySelector(s);
    if (!root) return null;
    const maths = [...root.querySelectorAll('math')];
    let shown = 0, empty = 0, fracs = 0, flat = 0;
    for (const e of maths) {
      // Only maths whose box is shown (not in a closed <details> or a collapsed row).
      const host = e.parentElement;
      if (!host || host.getClientRects().length === 0 || getComputedStyle(host).visibility === 'hidden') continue;
      shown++;
      const r = e.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) empty++;
      for (const f of e.querySelectorAll('mfrac')) {
        const [a, b] = f.children;
        if (!a || !b) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        if (ra.height === 0 || rb.height === 0) continue;
        fracs++;
        if (!(rb.top >= ra.bottom - 2)) flat++;
      }
    }
    return { maths: maths.length, shown, empty, fracs, flat, errors: root.querySelectorAll('merror, .katex-error').length };
  }, sel);
  ok(m && m.maths > 0 && m.shown > 0, () => `${what}: MathML present (${JSON.stringify(m)})`);
  if (!m) return m;
  ok(m.empty === 0, `${what}: every shown <math> has a size (${m.empty} of ${m.shown} empty)`);
  ok(m.flat === 0, `${what}: fractions stacked (${m.flat} of ${m.fracs} flat)`);
  ok(m.errors === 0, `${what}: no MathML or KaTeX error (${m.errors})`);
  return m;
}

/** A one-finger drag from p by (dx, dy): CDP touch events in Chromium, touch PointerEvents on the chart elsewhere. */
async function touchDrag(page, cdp, p, dx, dy, n = 12) {
  if (cdp) {
    const touch = (type, q) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q[0], y: q[1], id: 0 }] : [] });
    await touch('touchStart', p);
    for (let i = 1; i <= n; i++) { await sleep(16); await touch('touchMove', [p[0] + (dx * i) / n, p[1] + (dy * i) / n]); }
    await sleep(16);
    await touch('touchEnd', null);
  } else {
    await page.evaluate(async ([x, y, dx, dy, n]) => {
      // Every event goes to the element under the start (pointer capture of a synthetic pointer is not possible).
      const target = document.elementFromPoint(x, y);
      const at = (type, i) => {
        const cx = x + (dx * i) / n, cy = y + (dy * i) / n;
        target.dispatchEvent(new PointerEvent(type, { pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy,
          button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, composed: true }));
      };
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      at('pointerdown', 0);
      for (let i = 1; i <= n; i++) { await raf(); at('pointermove', i); }
      await raf();
      at('pointerup', n);
    }, [p[0], p[1], dx, dy, n]);
  }
  await sleep(80);
  await frame(page);
}

/** Every task in one browser: `how` is 'mouse' (1440 px) or 'touch' (390 px, hasTouch). */
async function walk(name, ctx, how, cdpFor) {
  const tag = `${name} ${how}`;
  const done = [];
  // Load, edit, drag, the chart, undo and redo.
  {
    where = `${tag} circuit`;
    const page = await open(ctx, START);
    const cdp = cdpFor ? await cdpFor(page) : null;
    const n0 = (await linked(page)).parts.length;
    let q = await query(page);
    await press(page, how, '[data-add]');
    await changed(page, q);
    ok((await linked(page)).parts.length === n0 + 1, 'Add adds a part');
    await press(page, how, `[data-tile="${n0}"]`);
    const input = page.locator('[data-card] input:not([type])').first();
    if (await input.count()) {
      const text = await input.inputValue();
      const m = text.match(/^([\d.]+)\s*(.*)$/);
      q = await query(page);
      await hit(page, how, input);
      await input.fill(m ? `${Number(m[1]) * 2} ${m[2]}` : '2');
      await input.press('Enter');
      ok(await changed(page, q), `a typed value (${text} → ×2) changes the circuit`);
    } else ok(false, 'the part card has a value field');
    // Drag a handle.
    await page.evaluate(() => document.querySelector('[data-chart]').scrollIntoView({ block: 'center' }));
    await frame(page);
    const h = await centre(page, '[data-handle="0"]');
    q = await query(page);
    const y0 = await page.evaluate(() => window.scrollY);
    if (how === 'mouse') {
      await page.mouse.move(h[0], h[1]);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) { await page.mouse.move(h[0] + 3 * i, h[1] - 3 * i); await sleep(16); }
      await page.mouse.up();
    } else await touchDrag(page, cdp, h, 36, -36);
    ok(await changed(page, q), `a ${how === 'mouse' ? 'mouse' : cdp ? 'touch (CDP)' : 'touch (PointerEvent)'} drag of a handle changes its part`);
    ok((await page.evaluate(() => window.scrollY)) === y0, 'the drag does not scroll the page');
    // The chart: zoom by wheel (mouse) and a read by click or tap.
    const v0 = await view(page);
    const mx = v0.left + v0.w * 0.3, my = v0.top + v0.h * 0.75;
    if (how === 'mouse') {
      await page.mouse.move(mx, my);
      await page.mouse.wheel(0, -200);
      await sleep(250);
      await frame(page);
      ok((await view(page)).k > v0.k * 1.2, 'the wheel zooms the chart');
      ok((await page.evaluate(() => window.scrollY)) === y0, 'the wheel does not scroll the page');
    }
    const before = await page.textContent('[data-readout]');
    // A new point: hover already reads the point under the mouse.
    if (how === 'mouse') await page.mouse.click(mx + 25, my - 25); else await page.touchscreen.tap(mx + 25, my - 25);
    await sleep(100);
    await frame(page);
    ok((await page.textContent('[data-readout]')) !== before, `a ${how === 'mouse' ? 'click' : 'tap'} on the chart reads its point`);
    // Undo and redo.
    q = await query(page);
    await press(page, how, '[data-undo]');
    ok(await changed(page, q), 'Undo undoes');
    await press(page, how, '[data-redo]');
    await sleep(50);
    ok((await query(page)) === q, 'Redo redoes');
    // Explain.
    await press(page, how, '[data-tile="0"]');
    if (await has(page, '[data-explain-open]')) {
      await press(page, how, '[data-explain-open]');
      await page.waitForSelector('[data-explain]', { timeout: 3000 }).catch(() => {});
      ok(await has(page, '[data-explain]'), 'Explain shows the explanation');
      await mathml(page, '[data-explain]', 'the explanation');
    } else ok(false, 'the part card has Explain');
    // The Equations panel and a derivation.
    // The panel is folded on a phone: open it by its summary.
    const folded = await page.evaluate(() => {
      const d = document.querySelector('[data-math-eq]').closest('details');
      d.setAttribute('data-browsers-panel', '');
      return !d.open;
    });
    if (folded) await press(page, how, '[data-browsers-panel] > summary');
    ok(await page.evaluate(() => document.querySelector('[data-browsers-panel]').open), 'the Equations panel is open');
    await page.locator('[data-browsers-panel] [data-math-eq]').first().scrollIntoViewIfNeeded();
    await mathml(page, '[data-browsers-panel]', 'the Equations panel');
    await press(page, how, '[data-browsers-panel] [data-derive-open]:visible');
    await page.waitForSelector('dialog[open]', { timeout: 3000 }).catch(() => {});
    ok(await has(page, 'dialog[open]'), 'Derive opens the derivation');
    if (await has(page, '[data-derive-all]')) await press(page, how, '[data-derive-all]');
    await frame(page);
    await mathml(page, 'dialog[open]', 'the derivation');
    const dlg = await page.evaluate(() => { const r = document.querySelector('dialog[open]').getBoundingClientRect(); return { l: r.left, r: r.right, w: window.innerWidth }; });
    ok(dlg.l >= -1 && dlg.r <= dlg.w + 1, () => `the derivation fits the screen (${JSON.stringify(dlg)})`);
    if (how === 'mouse') await page.locator('dialog[open]').screenshot({ path: join(shots, `${name}-derivation.png`) }).catch((e) => ok(false, `derivation screenshot: ${e.message}`));
    else {
      const s = await noScroll(page);
      ok(s.sw <= s.cw, `no horizontal scroll with the derivation open (${s.sw} > ${s.cw})`);
    }
    await press(page, how, '[data-derive-close]');
    ok(!(await has(page, 'dialog[open]')), 'Close closes the derivation');
    // The report.
    await press(page, how, '[data-print-report]');
    await sleep(200);
    ok(await page.evaluate(() => window.__printed === 1), 'Print report prints');
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const vp = page.viewportSize();
    await page.setViewportSize({ width: Math.round(186 * 96 / 25.4), height: vp.height }); // A4's content width, as ui-report.mjs
    await page.emulateMedia({ media: 'print' });
    await frame(page);
    const pr = await page.evaluate(() => {
      const shown = (s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      return { report: shown('[data-report]'), chart: shown('[data-report-chart]'), add: shown('[data-add]'), live: shown('[data-chart]'), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    });
    ok(pr.report && pr.chart && !pr.add && !pr.live && pr.sw <= pr.cw, () => `in print media only the report shows (${JSON.stringify(pr)})`);
    if (name === 'chromium' && how === 'mouse') {
      const pdf = await page.pdf({ format: 'A4' });
      ok(pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 20000, `page.pdf() makes a PDF (${pdf.length} bytes)`);
    }
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize(vp);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    ok(page.errors.length === 0, () => `no errors: ${page.errors.slice(0, 3).join(' | ')}`);
    await page.close();
    done.push('load', 'edit', 'drag', 'chart', 'undo', 'explain', 'equations', 'derivation', 'report');
  }
  // Solve and Apply.
  {
    where = `${tag} solve`;
    const page = await open(ctx, SOLVE);
    await page.waitForFunction(() => document.querySelector('[data-solve-status]')?.getAttribute('data-solve-status') === 'solved', null, { timeout: 10000 }).catch(() => {});
    const q = await query(page);
    await press(page, how, '[data-apply]');
    ok(await changed(page, q), 'Apply applies a solution');
    ok(page.errors.length === 0, () => `no errors: ${page.errors.slice(0, 3).join(' | ')}`);
    await page.close();
    done.push('solve');
  }
  // Sweep: on, a marker, the trace, the plot.
  {
    where = `${tag} sweep`;
    const page = await open(ctx, START);
    const cdp = cdpFor ? await cdpFor(page) : null;
    let q = await query(page);
    await press(page, how, '[data-sweep-on]');
    await changed(page, q);
    ok((await query(page)).includes('sw='), 'the switch turns the sweep on');
    q = await query(page);
    await press(page, how, '[data-sweep-add]');
    await changed(page, q);
    ok((await query(page)).includes('mk='), 'Add marker adds a marker');
    await page.waitForSelector('[data-plot-trace]', { timeout: 5000 }).catch(() => {});
    const tr = await page.evaluate(() => {
      const t = document.querySelector('[data-sweep-trace]'), p = document.querySelector('[data-plot-trace]');
      return { trace: (t?.getAttribute('d') ?? t?.getAttribute('points') ?? '').length, plot: (p?.getAttribute('d') ?? '').length,
        markers: document.querySelectorAll('[data-sweep-marker]').length };
    });
    ok(tr.trace > 50 && tr.plot > 50 && tr.markers >= 1, () => `the trace, the plot and the marker are drawn (${JSON.stringify(tr)})`);
    // Laid out where its points are: the path's box on screen against its points mapped by the screen CTM (Firefox
    // clamped path coordinates over 2^24 to one corner: notes-M9.2.md).
    await page.waitForFunction(() => document.querySelector('[data-sweep-trace]')?.getAttribute('data-state') === 'full', null, { timeout: 8000 }).catch(() => {});
    for (const sel of ['[data-sweep-trace]', '[data-plot-trace]']) {
      const b = await page.evaluate((s) => {
        const e = document.querySelector(s), m = e.getScreenCTM(), v = e.getAttribute('d').match(/-?\d+(\.\d+)?/g).map(Number);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (let i = 0; i + 1 < v.length; i += 2) {
          const x = m.a * v[i] + m.c * v[i + 1] + m.e, y = m.b * v[i] + m.d * v[i + 1] + m.f;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
        const r = e.getBoundingClientRect();
        return { want: [x1 - x0, y1 - y0].map((n) => +n.toFixed(1)), got: [r.width, r.height].map((n) => +n.toFixed(1)) };
      }, sel);
      ok(Math.abs(b.got[0] - b.want[0]) < 4 && Math.abs(b.got[1] - b.want[1]) < 4, () => `${sel} is drawn where its points are (box ${b.got} against ${b.want})`);
    }
    // No SVG coordinate on the page (the theory's figures, the report's copies included) at or over 2^24.
    const big = await page.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll('[d], [points]')) {
        const v = (e.getAttribute('d') ?? e.getAttribute('points')).match(/-?\d+(\.\d+)?(e[-+]?\d+)?/gi) ?? [];
        if (v.some((n) => Math.abs(Number(n)) >= 2 ** 24)) out.push(e.getAttributeNames().filter((a) => a.startsWith('data-')).join(' ') || e.tagName);
      }
      return { n: document.querySelectorAll('[d], [points]').length, out };
    });
    ok(big.out.length === 0, () => `no path coordinate ≥ 2^24 among ${big.n} (${big.out.slice(0, 5).join(' | ')})`);
    // Point at the plot.
    await page.locator('[data-plot]').scrollIntoViewIfNeeded();
    const pb = await page.evaluate(() => { const r = document.querySelector('[data-plot-svg], [data-plot]').getBoundingClientRect(); return [r.left + r.width * 0.4, r.top + r.height * 0.5, r.width * 0.2]; });
    const plot0 = await page.innerHTML('[data-plot]');
    if (how === 'mouse') { await page.mouse.move(pb[0], pb[1]); await page.mouse.move(pb[0] + pb[2], pb[1]); } else await touchDrag(page, cdp, [pb[0], pb[1]], pb[2], 0, 8);
    await frame(page);
    ok((await page.innerHTML('[data-plot]')) !== plot0, `the ${how === 'mouse' ? 'pointer' : 'finger'} points at a frequency on the plot`);
    if (how === 'mouse') {
      await page.evaluate(() => document.querySelector('[data-chart]').scrollIntoView({ block: 'center' }));
      await frame(page);
      const box = await page.locator('[data-chart]').boundingBox();
      if (box && box.width <= 1000) await page.locator('[data-chart]').screenshot({ path: join(shots, `${name}-sweep-chart.png`) });
      else await page.screenshot({ path: join(shots, `${name}-sweep-chart.png`), clip: { x: box.x, y: box.y, width: Math.min(1000, box.width), height: Math.min(1000, box.height) } });
    }
    ok(page.errors.length === 0, () => `no errors: ${page.errors.slice(0, 3).join(' | ')}`);
    await page.close();
    done.push('sweep', 'plot');
  }
  // Export: every file.
  {
    where = `${tag} export`;
    const page = await open(ctx, SWEEP);
    let downloads = 0;
    const names = [];
    page.on('download', (d) => { downloads++; names.push(d.suggestedFilename()); });
    // The figure is built only when the section comes near the screen (its buttons are disabled until then).
    await page.evaluate(() => document.querySelector('[data-export]')?.scrollIntoView({ block: 'start' }));
    ok(await page.waitForFunction(() => document.querySelector('[data-export]')?.smithExport?.builds > 0, null, { timeout: 8000 }).then(() => true, () => false), 'the export figure is built near the screen');
    const files = ['[data-export-svg]', '[data-export-png]', '[data-export-tex-save]', '[data-export-csv="nodes"]', '[data-export-csv="trace"]', '[data-export-csv="markers"]', '[data-export-s1p]', '[data-export-project]'];
    for (const sel of files) {
      const n = downloads;
      const wait = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
      await press(page, how, sel);
      await wait;
      await sleep(30);
      ok(downloads > n, `${sel} saves a file`);
    }
    console.log(`  ${tag}: saved ${names.join(', ')}`);
    ok(page.errors.length === 0, () => `no errors: ${page.errors.slice(0, 3).join(' | ')}`);
    await page.close();
    done.push('export');
  }
  // Learn: an example to done; the theory's topics and a citation.
  {
    where = `${tag} learn`;
    const page = await open(ctx, START);
    const id = 'reading-a-match', ex = X.exampleById(id);
    await press(page, how, `[data-example="${id}"]`);
    await page.waitForSelector('[data-guide]', { timeout: 5000 }).catch(() => {});
    for (let i = 0; i < ex.steps.length; i++) {
      const s = ex.steps[i], ans = X.answerCheck(s);
      if (s.reach) {
        const T = S.decodeCircuit(s.reach).circuit;
        const f = page.locator('[data-name="loadR"] input');
        await hit(page, how, f);
        await f.fill(String(T.loadR));
        await f.press('Enter');
        await frame(page);
      }
      if (ans) {
        const f = page.locator('#smith-guide-answer');
        await hit(page, how, f);
        await f.fill(String(ans.value));
        await press(page, how, '[data-guide-check]');
      }
      const done1 = await page.evaluate(() => document.querySelector('[data-guide]')?.hasAttribute('data-done'));
      ok(done1, `${id} step ${i + 1} done`);
      if (i < ex.steps.length - 1) await press(page, how, '[data-guide-next]');
    }
    ok(/finished/.test(await page.textContent('[data-guide-state]').catch(() => '')), `${id} finished`);
    await press(page, how, '[data-guide-close]');
    // A topic folded and a citation followed.
    const id0 = await page.evaluate(() => [...document.querySelectorAll('#theory [data-topic]')].find((t) => t.querySelector('a[href^="#ref-"]'))?.id);
    const sum = `[id="${id0}"] > summary`;
    const open0 = await page.evaluate((i) => document.getElementById(i).open, id0);
    await press(page, how, sum);
    ok(await page.evaluate(([i, o]) => document.getElementById(i).open !== o, [id0, open0]), `a topic folds or opens (${id0})`);
    if (!(await page.evaluate((i) => document.getElementById(i).open, id0))) await press(page, how, sum);
    const cite = page.locator(`[id="${id0}"] a[href^="#ref-"]:visible`).first();
    await hit(page, how, cite);
    await sleep(200);
    ok((await page.evaluate(() => window.location.hash)).startsWith('#ref'), 'a citation goes to its reference');
    ok(page.errors.length === 0, () => `no errors: ${page.errors.slice(0, 3).join(' | ')}`);
    await page.close();
    done.push('learn', 'theory');
  }
  return done;
}

/** No horizontal scroll at 320 and 390 px: the start, a sweep. */
async function narrow(name, type) {
  for (const width of [320, 390]) {
    where = `${name} ${width} px`;
    const ctx = await type.newContext({ viewport: { width, height: 800 }, hasTouch: true, ...(name === 'chromium' ? { isMobile: true, deviceScaleFactor: 2 } : {}) });
    for (const search of [START, SWEEP]) {
      const page = await open(ctx, search);
      await page.waitForTimeout(300);
      const s = await noScroll(page);
      ok(s.sw <= s.cw, `no horizontal scroll (${search === START ? 'start' : 'sweep'}: ${s.sw} > ${s.cw})`);
      ok(page.errors.length === 0, () => `no errors: ${page.errors.slice(0, 3).join(' | ')}`);
      await page.close();
    }
    await ctx.close();
  }
}

/** Chromium's touch emulation: gestures that need real touch events (CDP). */
async function gestures(browser) {
  where = 'chromium gestures';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const page = await open(ctx, START);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const gesture = async (from, to, n = 13) => {
    await touch('touchStart', from);
    for (let i = 1; i <= n; i++) { await sleep(16); await touch('touchMove', from.map(([x, y], j) => [x + ((to[j][0] - x) * i) / n, y + ((to[j][1] - y) * i) / n])); }
    await sleep(16);
    await touch('touchEnd', []);
    await sleep(250);
    await frame(page);
  };
  await page.evaluate(() => { document.querySelector('[data-chart]').scrollIntoView({ block: 'start' }); });
  await frame(page);
  // One finger on a handle drags it; the page stays.
  let q = await query(page);
  let s = await view(page);
  const h = await centre(page, '[data-handle="0"]');
  await gesture([h], [[h[0] + 30, h[1] + 30]]);
  ok(await changed(page, q), 'one finger on a handle drags it');
  let t = await view(page);
  ok(t.scrollY === s.scrollY && t.k === s.k, `the handle drag neither scrolls nor zooms (${t.scrollY - s.scrollY}, ${t.k / s.k})`);
  // Two fingers pinch about their midpoint, the page not zoomed.
  s = t;
  const mx = Math.round(s.left + s.w / 2), my = Math.round(s.top + s.h * 0.85);
  await gesture([[mx - 40, my], [mx + 40, my]], [[mx - 120, my], [mx + 120, my]]);
  t = await view(page);
  ok(Math.abs(t.k / s.k - 3) < 0.05, `a pinch zooms the chart 3× (${t.k / s.k})`);
  ok(t.scale === 1 && t.scrollY === s.scrollY, `the pinch zooms or scrolls nothing else (scale ${t.scale}, scroll ${t.scrollY - s.scrollY})`);
  await page.evaluate(() => document.querySelector('[data-chart]').smithChart.fit());
  await frame(page);
  // One finger up, off the handles (the box's corner, outside the disc), scrolls the page and leaves the view.
  s = await view(page);
  const cx = s.left + 8, cy = s.top + s.h - 8;
  await gesture([[cx, cy]], [[cx, cy - 250]]);
  t = await view(page);
  ok(t.scrollY - s.scrollY >= 100, `one finger up off the handles scrolls the page past the chart (${t.scrollY - s.scrollY} px)`);
  ok(t.cx === s.cx && t.cy === s.cy && t.k === s.k, 'and leaves the view');
  ok(page.errors.length === 0, () => `no errors: ${page.errors.slice(0, 3).join(' | ')}`);
  await page.close();
  await ctx.close();
}

// SMITH_BROWSERS=webkit (or a comma list) runs only those browsers, for chasing one browser's failure.
const only = process.env.SMITH_BROWSERS?.split(',').map((s) => s.trim()).filter(Boolean);
const BROWSERS = [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]].filter(([n]) => !only?.length || only.includes(n));
try {
  for (const [name, type] of BROWSERS) {
    let browser = null;
    if (name === 'chromium') {
      for (const channel of ['msedge', 'chrome']) { try { browser = await chromium.launch({ channel }); break; } catch { /* next */ } }
    } else {
      try { browser = await type.launch(); } catch (e) { console.log(`${name}: not installed (npx playwright-core install ${name}): ${e.message.split('\n')[0]}`); }
    }
    if (!browser) { where = name; ok(false, 'the browser starts'); continue; }
    const t0 = Date.now(), f0 = failed;
    console.log(`${name} ${browser.version()}`);
    const mouse = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', acceptDownloads: true });
    const byMouse = await walk(name, mouse, 'mouse', null);
    await mouse.close();
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: 'dark', acceptDownloads: true,
      ...(name === 'chromium' ? { isMobile: true, deviceScaleFactor: 2 } : {}) });
    const byTouch = await walk(name, phone, 'touch', name === 'chromium' ? (p) => phone.newCDPSession(p) : null);
    await phone.close();
    await narrow(name, browser);
    if (name === 'chromium') await gestures(browser);
    results[name] = { mouse: byMouse.length, touch: byTouch.length, failed: failed - f0, s: ((Date.now() - t0) / 1000).toFixed(0) };
    console.log(`  ${name}: ${byMouse.length} tasks by mouse, ${byTouch.length} by touch, ${failed - f0} failed, ${results[name].s} s`);
    await browser.close();
  }
} catch (e) {
  ok(false, `threw: ${e.stack}`);
} finally {
  stopServer();
}
console.log(`Screenshots in ${shots}`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`\n${passed} of ${passed + failed} browser checks passed.`);
process.exit(failed ? 1 : 0);
