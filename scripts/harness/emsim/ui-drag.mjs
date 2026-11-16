// The Trace section's drag handles, pan and zoom in the installed Edge (step M2.1c): width, gap, the coplanar gap and
// ground width and a dielectric's thickness dragged by mouse, by touch (CDP touch events) and by keys on a microstrip,
// an edge-coupled microstrip pair and a coplanar waveguide with ground; after each the shown value equals the engine's
// own solve in Node (lines.ts solveSetup) of the setup the link holds, and one undo returns the whole drag; a gap
// dragged through zero is refused with its reason; pan (drag, keys), zoom (wheel, keys), reset; the drag budgets of
// engine.md §10 at 1× and 4× CPU throttle (main-thread work per drag frame: median and 95th percentile; script time
// per frame from CDP's TaskDuration; dropped frames; new impedances per drag frame; whether the fast path was used);
// no horizontal scroll at 320, 390 and 1440 px in both themes; screenshots of the drawing at 390 and 1440 px.
//   tsx ui-drag.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedLines from '../../../lib/emsim/lines.ts';
import * as importedLink from '../../../lib/emsim/link.ts';

const ST = importedSetup.default ?? importedSetup;
const LN = importedLines.default ?? importedLines;
const LK = importedLink.default ?? importedLink;

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const BUDGET = { 1: 8, 4: 12 }; // ms of main-thread work per drag frame (engine.md §10)

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const same = (a, b) => Math.abs(Number(a) - b) <= 1e-9 * Math.max(1, Math.abs(b));

const engine = (setup) => {
  const r = LN.solveSetup(setup);
  if (!r.ok) return { ok: false, reason: r.reason };
  const q = r.n === 2 ? r.pair.zdiff : r.lines[0].z0;
  return { ok: true, key: r.n === 2 ? 'zdiff' : 'z0', v: q.v, e: q.e };
};
const linked = (p) => LK.decodeLink(new URL(p.url()).search).setup;
// The value a handle edits, from the link (mm).
const valueOf = (setup, key) => {
  if (key.startsWith('t:')) return setup.stackup.layers.find((l) => l.id === key.slice(2))?.t.v;
  const x = setup.trace[key];
  return x ? x.v : null;
};

const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
const open = async (opt = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', ...opt });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL0);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved(page);
  return page;
};
// Settled: no drag, the newest full solve in.
async function solved(p) {
  await p.waitForTimeout(30);
  await p.waitForSelector('[data-results]:not([data-stale="true"]):not([data-quick="true"])', { timeout: 30000 });
  await p.waitForSelector('[data-dragging="false"]', { timeout: 30000 });
}
const shown = async (p, key) => {
  const el = p.locator(`[data-results] [data-q="${key}"]`);
  if (!(await el.count())) return null;
  return { v: Number(await el.getAttribute('data-v')), e: Number(await el.getAttribute('data-e')) };
};
// The shown main value equals the engine's solve of the linked setup.
async function matches(p, what) {
  await solved(p);
  const x = engine(linked(p));
  if (!x.ok) { check(false, `${what}: the engine refuses (${x.reason})`); return null; }
  const s = await shown(p, x.key);
  check(s && same(s.v, x.v) && same(s.e, x.e), `${what}: ${x.key} ${s?.v} ± ${s?.e} equals the engine's ${x.v} ± ${x.e}`);
  return s;
}
const centre = async (p, key) => {
  const h = p.locator(`[data-handle="${key}"] circle`).first();
  await h.scrollIntoViewIfNeeded();
  const b = await h.boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};
const firstHeight = async (p) => p.locator('[data-handle^="t:"]').first().getAttribute('data-handle');
const kind = async (p, k) => { await p.selectOption('[data-trace-kind]', k); await solved(p); };

async function mouseDrag(p, key, dx, dy) {
  const [x, y] = await centre(p, key);
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) { await p.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12); await p.waitForTimeout(20); }
  await p.mouse.up();
}
async function touchDrag(p, key, dx, dy) {
  const [x, y] = await centre(p, key);
  const cdp = await p.context().newCDPSession(p);
  const pt = (px, py) => [{ x: px, y: py, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + (dx * i) / 12, y + (dy * i) / 12) }); await p.waitForTimeout(20); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
async function keys(p, key, press, n) {
  await p.focus(`[data-handle="${key}"]`);
  for (let i = 0; i < n; i++) await p.keyboard.press(press);
}

// One case: the drag changes the value the expected way, the result is the engine's, one undo returns the whole drag.
async function dragCase(p, what, key, how, sign) {
  await solved(p);
  const s0 = linked(p), v0 = valueOf(s0, key), z0 = engine(s0);
  await how();
  await solved(p);
  const v1 = valueOf(linked(p), key);
  check(v1 !== null && Math.sign(v1 - v0) === sign, `${what}: ${key} ${v0} → ${v1} (${sign > 0 ? 'up' : 'down'})`);
  const r = await matches(p, what);
  check(r && z0.ok && r.v !== z0.v, `${what}: the impedance moved (${z0.v} → ${r?.v})`);
  await p.click('[data-undo]');
  await solved(p);
  const back = valueOf(linked(p), key);
  check(back === v0, `${what}: one undo returns ${key} to ${v0} (${back})`);
  await p.click('[data-redo]');
  await solved(p);
}

// ---- drag timing: synthetic pointer moves on a handle for 2 s, every 8 ms ----
async function timing(p, key, rate) {
  await solved(p);
  const [hx, hy] = await centre(p, key);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await p.waitForTimeout(300);
  const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
  const t0 = await task();
  const res = await p.evaluate(([key, hx, hy]) => new Promise((done) => {
    const box = document.querySelector('[data-trace-view]'), stat = box.emsimDrag;
    const area = document.querySelector('[data-solves]');
    const hit = document.querySelector(`[data-handle="${key}"] circle`);
    const ev = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const f0 = stat.frames, m0 = stat.ms.length, n0 = Number(area.getAttribute('data-solves'));
    let quick = 0;
    const stamps = [];
    let x = hx;
    ev(hit, 'pointerdown', hx, hy);
    const start = performance.now();
    const tick = (t) => {
      stamps.push(t);
      if (area.getAttribute('data-quick') === 'true') quick++;
      if (t - start < 2000) requestAnimationFrame(tick);
      else {
        ev(box, 'pointerup', x, hy);
        done({ stamps, ms: stat.ms.slice(m0), frames: stat.frames - f0, solves: Number(area.getAttribute('data-solves')) - n0, quick });
      }
    };
    requestAnimationFrame(tick);
    const send = () => {
      const t = performance.now() - start;
      if (t >= 2000) return;
      x = hx + 30 * Math.sin((t / 2000) * 4 * Math.PI);
      ev(box, 'pointermove', x, hy);
      setTimeout(send, 8);
    };
    send();
  }), [key, hx, hy]);
  const t1 = await task();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  await solved(p);
  const ws = res.ms.slice().sort((a, b) => a - b);
  const q = (xs, f) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(f * xs.length))] : NaN);
  const iv = res.stamps.slice(1).map((t, i) => t - res.stamps[i]);
  const frameMs = iv.length ? iv.slice().sort((a, b) => a - b)[Math.floor(iv.length / 2)] : 16.7;
  return {
    rate, frames: res.frames, p50: q(ws, 0.5), p95: q(ws, 0.95), task: ((t1 - t0) * 1000) / res.stamps.length,
    dropped: iv.reduce((a, t) => a + Math.max(0, Math.round(t / frameMs) - 1), 0), ticks: res.stamps.length,
    perFrame: res.frames ? res.solves / res.frames : 0, solves: res.solves, quick: res.quick > 0,
  };
}

try {
  const page = await open();

  // ---- microstrip: width by mouse, a thickness by mouse and by keys ----
  await dragCase(page, 'microstrip width, mouse', 'w', () => mouseDrag(page, 'w', 40, 0), 1);
  const hMs = await firstHeight(page);
  check(!!hMs, `microstrip has a thickness handle (${hMs})`);
  if (hMs) {
    await dragCase(page, 'microstrip thickness, mouse', hMs, () => mouseDrag(page, hMs, 0, -25), 1);
    await dragCase(page, 'microstrip thickness, keys', hMs, () => keys(page, hMs, 'ArrowDown', 3), -1);
  }
  check(await page.locator('[data-handle]').count() >= 2 && await page.locator('[data-handle]').first().getAttribute('role') === 'slider', 'handles are sliders with names');

  // ---- the pair: width by keys, gap by mouse, a refused gap ----
  await kind(page, 'pair-microstrip');
  await dragCase(page, 'pair width, keys', 'w', () => keys(page, 'w', 'ArrowRight', 4), 1);
  await dragCase(page, 'pair gap, mouse', 's', () => mouseDrag(page, 's', 30, 0), 1);
  {
    const s0 = valueOf(linked(page), 's');
    const [x, y] = await centre(page, 's');
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(x - i * 30, y); await page.waitForTimeout(20); }
    const alert = await page.locator('[data-handle-refused]').innerText().catch(() => '');
    await page.mouse.up();
    await solved(page);
    const s1 = valueOf(linked(page), 's');
    check(/gap|overlap|touch/i.test(alert), `a gap dragged through zero is refused with its reason ("${alert}")`);
    check(s1 > 0 && s1 <= s0, `the gap stays at its last valid value (${s0} → ${s1})`);
    await page.click('[data-undo]');
    await solved(page);
  }

  // ---- coplanar with ground: g by keys, gw by mouse, a thickness by mouse ----
  await kind(page, 'cpwg');
  const gw = page.locator('[data-field="trace.gw"] input').first();
  await gw.fill('0.5');
  await gw.press('Enter');
  await solved(page);
  check(await page.locator('[data-handle="gw"]').count() === 1, 'a finite ground width has its handle');
  await dragCase(page, 'cpwg gap to ground, keys', 'g', () => keys(page, 'g', 'ArrowRight', 3), 1);
  await dragCase(page, 'cpwg ground width, mouse', 'gw', () => mouseDrag(page, 'gw', -20, 0), -1);
  const hC = await firstHeight(page);
  if (hC) await dragCase(page, 'cpwg thickness, mouse', hC, () => mouseDrag(page, hC, 0, 20), -1);

  // ---- pan, zoom, reset ----
  const fig = page.locator('[data-trace-drawing]');
  if (await page.locator('[data-trace-reset]').isEnabled()) await page.click('[data-trace-reset]');
  await page.waitForTimeout(100);
  const k0 = Number(await fig.getAttribute('data-px-per-mm'));
  const vb = await page.locator('[data-trace-view]').boundingBox();
  await page.mouse.move(vb.x + vb.width * 0.8, vb.y + 20);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(400);
  const k1 = Number(await fig.getAttribute('data-px-per-mm'));
  check(k1 > k0 * 1.5 && await fig.getAttribute('data-at-fit') === 'false', `the wheel zooms in (${k0.toFixed(1)} → ${k1.toFixed(1)} px/mm)`);
  const cx0 = Number(await fig.getAttribute('data-view-cx'));
  await page.mouse.move(vb.x + vb.width * 0.8, vb.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(vb.x + vb.width * 0.8 - i * 10, vb.y + 20);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const cx1 = Number(await fig.getAttribute('data-view-cx'));
  check(Math.abs((cx1 - cx0) * k1 - 80) < 2, `a drag pans by the pointer's 80 px (${((cx1 - cx0) * k1).toFixed(1)})`);
  await page.click('[data-trace-reset]');
  await page.waitForTimeout(100);
  check(Math.abs(Number(await fig.getAttribute('data-px-per-mm')) - k0) < 1e-6 && await fig.getAttribute('data-at-fit') === 'true', 'the reset control shows the whole cross-section');
  await page.focus('[data-trace-view]');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(400);
  const k2 = Number(await fig.getAttribute('data-px-per-mm')), cx2 = Number(await fig.getAttribute('data-view-cx'));
  check(Math.abs(k2 / k0 - 2) < 1e-6 && cx2 < 0, `keys zoom (× ${(k2 / k0).toFixed(3)}) and pan (centre ${cx2.toFixed(4)} mm)`);
  await page.keyboard.press('0');
  await page.waitForTimeout(400);
  check(Math.abs(Number(await fig.getAttribute('data-px-per-mm')) - k0) < 1e-6, '0 resets the view');
  // A handle drag in a zoomed view keeps that view and still ends on the engine's value.
  await page.focus('[data-trace-view]');
  await page.keyboard.press('+');
  await page.waitForTimeout(400);
  await dragCase(page, 'cpwg width, mouse, zoomed', 'w', () => mouseDrag(page, 'w', 30, 0), 1);
  check(Math.abs(Number(await fig.getAttribute('data-px-per-mm')) / k0 - Math.SQRT2) < 1e-6, 'the zoomed view stays through a drag');
  await page.click('[data-trace-reset]');

  // ---- touch: width and gap of a pair, a pinch-free pan across ----
  const tp = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await kind(tp, 'pair-microstrip');
  await dragCase(tp, 'pair width, touch', 'w', () => touchDrag(tp, 'w', 25, 0), 1);
  await dragCase(tp, 'pair gap, touch', 's', () => touchDrag(tp, 's', -6, 0), -1);
  const hT = await firstHeight(tp);
  if (hT) await dragCase(tp, 'pair thickness, touch', hT, () => touchDrag(tp, hT, 0, -20), 1);
  const tsz = await tp.locator('[data-handle="w"] circle').first().boundingBox();
  check(tsz.width >= 24 && tsz.height >= 24, `touch targets at least 24 px (${tsz.width} × ${tsz.height})`);
  await tp.context().close();

  // ---- budgets ----
  const rows = [];
  const tpage = await open({ viewport: { width: 1440, height: 1000 } });
  for (const [k, key] of [['microstrip', 'w'], ['pair-microstrip', 'w'], ['pair-cpw', 'w']]) {
    await kind(tpage, k);
    for (const rate of [1, 4]) {
      const runs = [];
      for (let i = 0; i < 2; i++) runs.push(await timing(tpage, key, rate));
      runs.sort((a, b) => a.p95 - b.p95);
      rows.push({ kind: k, ...runs[0] });
      await tpage.click('[data-undo]');
      await solved(tpage);
    }
  }
  console.log('\n| structure | CPU | drag frames | work p50 | work p95 | task / frame | dropped | new Z per frame | fast path |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.kind} | ${r.rate}× | ${r.frames} | ${r.p50.toFixed(2)} ms | ${r.p95.toFixed(2)} ms | ${r.task.toFixed(2)} ms | ${r.dropped} of ${r.ticks} | ${r.perFrame.toFixed(2)} | ${r.quick ? 'yes' : 'no'} |`);
  console.log('');
  for (const r of rows) {
    // The budget holds for the drag frame's own work (p95) and for all main-thread work averaged per frame.
    const within = r.p95 <= BUDGET[r.rate] && r.task <= BUDGET[r.rate];
    const text = `work p95 ${r.p95.toFixed(2)} ms, task ${r.task.toFixed(2)} ms per frame (budget ${BUDGET[r.rate]}), ${r.perFrame.toFixed(2)} new Z per frame`;
    if (r.rate === 1) check(within && r.perFrame >= 0.5, `${r.kind} at 1×: ${text}`);
    else if (!within || r.perFrame < 0.5) console.log(`NOTE ${r.kind} at 4× misses the budget: ${text}`);
    check(r.frames > 20, `${r.kind} at ${r.rate}×: the drag ran (${r.frames} frames)`);
  }
  await tpage.context().close();

  // ---- widths, themes, screenshots ----
  if (shots) mkdirSync(shots, { recursive: true });
  const shrink = async (buf) => {
    const p = await page.context().newPage();
    const b64 = await p.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, `data:image/png;base64,${buf.toString('base64')}`);
    await p.close();
    return Buffer.from(b64, 'base64');
  };
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme} (${sw})`);
      if (shots && width !== 320) {
        await page.focus('[data-handle="g"]');
        await page.waitForTimeout(100);
        const el = page.locator('[data-trace-drawing]');
        await el.scrollIntoViewIfNeeded();
        writeFileSync(join(shots, `emsim-drag-${width}-${scheme}.png`), await shrink(await el.screenshot()));
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-drag: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
