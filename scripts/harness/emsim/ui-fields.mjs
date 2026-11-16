// The Trace section's field view in the installed Edge (step M2.2): every quantity and every drive on a microstrip,
// an edge-coupled pair and a 3-line general structure draws (a non-empty map canvas, or the contours, field lines or
// surface strips the quantity has), and the scale bar's range equals the one made in Node from the engine's own field
// job (jobs.ts runJob) for the same setup, drive and grid view; the probe (hover, tap, keys) gives φ and |E| equal to
// the engine's fields.ts pointField within 1 % or the grid's own interpolation error at the same point; the keys move
// the probe and do not pan; pan and zoom draw the map again; a width dragged with the field shown: the time from a
// drag frame's edit to its coarse map at 1× and 4× CPU throttle, main-thread work per drag frame (median, 95th
// percentile) and per frame (CDP TaskDuration); the first and the full picture of a 1440 px view; no horizontal
// scroll at 320, 390 and 1440 px in both themes; screenshots (|E| on the pair, field lines on the microstrip) at 390
// and 1440 px in both themes.
//   tsx ui-fields.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedJobs from '../../../lib/emsim/jobs.ts';
import * as importedFields from '../../../lib/emsim/fields.ts';
import * as importedLines from '../../../lib/emsim/lines.ts';
import * as importedMap from '../../../lib/emsim/colormap.ts';
import * as importedStruct from '../../../lib/emsim/structure.ts';

const LK = importedLink.default ?? importedLink;
const JB = importedJobs.default ?? importedJobs;
const FF = importedFields.default ?? importedFields;
const LN = importedLines.default ?? importedLines;
const CM = importedMap.default ?? importedMap;
const SR = importedStruct.default ?? importedStruct;

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const BUDGET = { 1: 8, 4: 12 }; // ms of main-thread work per drag frame (engine.md §10)

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const linked = (p) => LK.decodeLink(new URL(p.url()).search).setup;
const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };

// ---- the engine in Node ----
const QTY = ['phi', 'E', 'lines', 'H', 'charge', 'current'];
const magnetic = (qty) => qty === 'H' || qty === 'current';
const driveOf = (drive, line, n) => (n <= 1 ? { name: 'line', line: 1 } : drive === 'line' ? { name: 'line', line } : { name: drive });
function nodeJob(setup, qty, drive, view) {
  const job = {
    kind: 'field', setup, field: magnetic(qty) ? 'H' : 'E', drive, view,
    contours: qty === 'phi' || qty === 'lines' || qty === 'H' ? 10 : 0, lines: qty === 'lines' ? { count: 24 } : null,
  };
  const g = JB.runJob(job, new JB.SolveCache());
  for (;;) { const s = g.next(); if (s.done) return s.value; }
}
// The scale fieldPaint.ts's prepare makes.
function nodeScale(r, qty, kind) {
  if (qty === 'charge' || qty === 'current') return CM.scaleOf(r.surface.density, 'signed', { clip: 0.98 });
  const values = qty === 'phi' ? r.grid.phi : FF.magnitude(r.grid);
  let sk = kind;
  if (qty === 'phi') {
    let lo = Infinity, hi = -Infinity;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (lo < -1e-3 * (hi - lo) && hi > 1e-3 * (hi - lo)) sk = 'signed';
  }
  return CM.scaleOf(values, sk, { cls: r.grid.cls });
}
function nodeSource(setup, qty, drive) {
  const r = LN.solveSetup(setup);
  const model = FF.fieldModel(r.bem, FF.sectionMedia(LN.setupSection(setup)));
  const d = 'name' in drive ? FF.namedDrive(r.n, drive.name, drive.line ?? 1, magnetic(qty) ? 'H' : 'E') : drive.values;
  return magnetic(qty) ? FF.magnetic(model, d) : FF.electric(model, d);
}
function bilinear(g, x, z) {
  const v = g.view, dx = (v.x1 - v.x0) / (v.nx - 1), dz = (v.z1 - v.z0) / (v.ny - 1);
  const fi = (x - v.x0) / dx, fj = (z - v.z0) / dz;
  const i = Math.min(v.nx - 2, Math.floor(fi)), j = Math.min(v.ny - 2, Math.floor(fj)), a = fi - i, b = fj - j, k = j * v.nx + i;
  const L = (A) => (1 - b) * ((1 - a) * A[k] + a * A[k + 1]) + b * ((1 - a) * A[k + v.nx] + a * A[k + v.nx + 1]);
  const fx = L(g.fx), fz = L(g.fz);
  return { phi: L(g.phi), f: Math.hypot(fx, fz) };
}

// ---- the page ----
const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
async function open(search = '', opt = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', ...opt });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${URL0}${search}`);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved(page);
  return page;
}
async function solved(p) {
  await p.waitForTimeout(30);
  await p.waitForSelector('[data-results]:not([data-stale="true"]):not([data-quick="true"])', { timeout: 30000 });
  await p.waitForSelector('[data-dragging="false"]', { timeout: 30000 });
}
// The full field map in: the scale bar of a done grid for the current view.
async function mapped(p) {
  await solved(p);
  await p.waitForFunction(() => {
    const s = document.querySelector('[data-field-scale]'), b = document.querySelector('[data-trace-view]');
    return s && s.getAttribute('data-done') === 'true' && b.getAttribute('data-field-state') === 'done';
  }, null, { timeout: 30000 });
  await p.waitForTimeout(250); // a view settling after the last input
  await p.waitForFunction(() => document.querySelector('[data-trace-view]').getAttribute('data-field-state') === 'done', null, { timeout: 30000 });
}
async function fieldsOn(p) { if (!(await p.isChecked('[data-field-on]'))) await p.check('[data-field-on]'); await mapped(p); }
const sel = async (p, what, v) => { await p.selectOption(what, String(v)); await mapped(p); };
async function state(p) {
  return p.evaluate(() => {
    const s = document.querySelector('[data-field-scale]'), o = document.querySelector('[data-field-overlay]');
    const c = document.querySelector('[data-field-canvas]');
    let opaque = 0;
    if (c) {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4 * 7) if (d[i] > 0) opaque++;
    }
    return {
      view: JSON.parse(s.getAttribute('data-view')), lo: Number(s.getAttribute('data-lo')), hi: Number(s.getAttribute('data-hi')), kind: s.getAttribute('data-kind'),
      contours: Number(o?.getAttribute('data-contours') ?? 0), lines: Number(o?.getAttribute('data-lines') ?? 0), strips: Number(o?.getAttribute('data-strips') ?? 0), opaque,
    };
  });
}
async function settings(p) {
  return p.evaluate(() => ({
    qty: document.querySelector('[data-field-qty]').value,
    drive: document.querySelector('[data-field-drive]')?.value ?? 'line',
    line: Number(document.querySelector('[data-field-line]')?.value ?? 1),
    scale: document.querySelector('[data-field-scale-kind]').value,
    n: Number(document.querySelector('[data-trace-drawing]').getAttribute('data-conductors')),
  }));
}
// The shown map equals the engine's in Node.
async function drawsLikeNode(p, what, n) {
  const st = await state(p), f = await settings(p), setup = linked(p);
  const drive = driveOf(f.drive, f.line, n);
  const r = nodeJob(setup, f.qty, drive, st.view);
  const sc = nodeScale(r, f.qty, f.scale);
  const surf = f.qty === 'charge' || f.qty === 'current';
  const drawn = surf ? st.strips > 0 : st.opaque > 50;
  const extra = f.qty === 'lines' ? st.lines > 0 && st.contours > 0 : f.qty === 'phi' || f.qty === 'H' ? st.contours > 0 : true;
  check(drawn && extra, `${what} ${f.qty}/${JSON.stringify(drive)}: drawn (${surf ? `${st.strips} strips` : `${st.opaque} opaque samples`}, ${st.contours} contours, ${st.lines} lines)`);
  const span = 0.03 * Math.max(Math.abs(sc.hi), Math.abs(sc.lo));
  check(st.kind === sc.kind && Math.abs(st.lo - sc.lo) <= span && Math.abs(st.hi - sc.hi) <= span, `${what} ${f.qty}/${JSON.stringify(drive)}: scale ${st.kind} ${st.lo.toPrecision(4)} … ${st.hi.toPrecision(4)} equals Node's ${sc.kind} ${sc.lo.toPrecision(4)} … ${sc.hi.toPrecision(4)}`);
  return { st, f, setup, drive };
}
const box = async (p) => p.evaluate(() => {
  const b = document.querySelector('[data-trace-view]'), f = document.querySelector('[data-trace-drawing]'), r = b.getBoundingClientRect();
  return { left: r.left + 1, top: r.top + 1, w: r.width - 2, h: r.height - 2, k: Number(f.getAttribute('data-px-per-mm')), cx: Number(f.getAttribute('data-view-cx')), cy: Number(f.getAttribute('data-view-cy')) };
});
const probeRead = async (p) => p.evaluate(() => {
  const e = document.querySelector('[data-field-probe]');
  return { x: Number(e.getAttribute('data-x')), z: Number(e.getAttribute('data-z')), phi: Number(e.getAttribute('data-phi')), f: Number(e.getAttribute('data-f')), text: e.textContent, kind: e.getAttribute('data-field-probe') };
});
async function probeCheck(p, what, rd, qty, drive, view) {
  const setup = linked(p);
  const src = nodeSource(setup, qty, drive);
  const pf = FF.pointField(src, rd.x, rd.z);
  const g = nodeJob(setup, qty, drive, view).grid;
  const bl = bilinear(g, rd.x, rd.z);
  const tol = (exact, interp) => Math.max(0.01 * Math.abs(exact), 1.05 * Math.abs(interp - exact)) + 1e-9 * Math.max(1, Math.abs(exact));
  check(Math.abs(rd.phi - pf.phi) <= tol(pf.phi, bl.phi), `${what}: probe φ ${rd.phi.toPrecision(5)} V equals pointField's ${pf.phi.toPrecision(5)} (grid ${bl.phi.toPrecision(5)})`);
  check(Math.abs(rd.f - pf.f) <= tol(pf.f, bl.f), `${what}: probe |E| ${rd.f.toPrecision(5)} V/m equals pointField's ${pf.f.toPrecision(5)} (grid ${bl.f.toPrecision(5)}, ${(100 * Math.abs(rd.f / pf.f - 1)).toFixed(2)} % off)`);
}
const kind = async (p, k) => { await p.selectOption('[data-trace-kind]', k); await mapped(p); };

// A 3-line general structure: the default microstrip made general, with three equal traces 0.8 mm apart.
function threeLines() {
  const setup = LK.decodeLink('').setup;
  const g = SR.toGeneral(setup.stackup, setup.trace);
  const s0 = g.signals[0];
  g.signals = [-0.8, 0, 0.8].map((u) => ({ ...s0, u: { ...s0.u, v: u } }));
  return `?${LK.encodeLink({ ...setup, trace: g })}`;
}

const times = [];
try {
  // ---- every quantity and drive ----
  const page = await open();
  await fieldsOn(page);
  for (const qty of QTY) { await sel(page, '[data-field-qty]', qty); await drawsLikeNode(page, 'microstrip', 1); }
  await sel(page, '[data-field-qty]', 'E');
  await sel(page, '[data-field-scale-kind]', 'log');
  await drawsLikeNode(page, 'microstrip log', 1);
  await sel(page, '[data-field-scale-kind]', 'linear');

  await kind(page, 'pair-microstrip');
  for (const qty of QTY) { await sel(page, '[data-field-qty]', qty); await drawsLikeNode(page, 'pair', 2); }
  await sel(page, '[data-field-qty]', 'phi');
  for (const d of ['even', 'odd', 'differential', 'common', 'line']) { await sel(page, '[data-field-drive]', d); await drawsLikeNode(page, 'pair', 2); }
  await sel(page, '[data-field-line]', 2);
  await drawsLikeNode(page, 'pair', 2);

  const gpage = await open(threeLines());
  check(await gpage.getAttribute('[data-trace-drawing]', 'data-conductors') === '3', 'the 3-line general structure has 3 conductors');
  await fieldsOn(gpage);
  for (const qty of QTY) { await sel(gpage, '[data-field-qty]', qty); await drawsLikeNode(gpage, 'general', 3); }
  await sel(gpage, '[data-field-qty]', 'E');
  for (const d of ['even', 'odd', 'differential', 'common', 'line']) { await sel(gpage, '[data-field-drive]', d); await drawsLikeNode(gpage, 'general', 3); }
  await sel(gpage, '[data-field-line]', 3);
  await drawsLikeNode(gpage, 'general', 3);
  await gpage.context().close();

  // ---- the probe: hover, keys, tap ----
  await kind(page, 'microstrip');
  await sel(page, '[data-field-qty]', 'E');
  const setup = linked(page);
  const sec = LN.setupSection(setup);
  let zTop = -Infinity, zBase = Infinity, uMax = -Infinity;
  for (const c of sec.conductors) if (c.id > 0) for (let i = 0; i < c.pts.length; i += 2) { zTop = Math.max(zTop, c.pts[i + 1]); zBase = Math.min(zBase, c.pts[i + 1]); uMax = Math.max(uMax, c.pts[i]); }
  // Two points inside the drawn view: in the air above the trace, and in the laminate beside it.
  const spotsIn = (v) => [['air above the trace', 0, zTop + 0.4 * (v.z1 - zTop)], ['laminate beside the trace', uMax + 0.4 * (v.x1 - uMax), (v.z0 + zBase) / 2]];
  const stE = await state(page);
  const spots = spotsIn(stE.view);
  for (const [what, u, z] of spots) {
    const b = await box(page);
    await page.mouse.move(b.left + b.w / 2 + (u - b.cx) * b.k, b.top + b.h / 2 + (-z - b.cy) * b.k);
    await page.waitForTimeout(120);
    const rd = await probeRead(page);
    check(rd.kind === 'value' && Math.abs(rd.x - u) < 2 / b.k && Math.abs(rd.z - z) < 2 / b.k, `hover probe at ${what} (${rd.x.toFixed(4)}, ${rd.z.toFixed(4)}): ${rd.text}`);
    await probeCheck(page, `hover probe in ${what}`, rd, 'E', { name: 'line', line: 1 }, stE.view);
  }
  // keys: the probe mode, arrows move the probe and do not pan
  await page.click('[data-field-probe-mode]');
  check(await page.getAttribute('[data-field-probe-mode]', 'aria-pressed') === 'true', 'the probe keys are on');
  await page.focus('[data-trace-view]');
  const before = await probeRead(page), b0 = await box(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Shift+ArrowUp');
  await page.waitForTimeout(80);
  const after = await probeRead(page), b1 = await box(page);
  check(Math.abs(after.x - before.x - 24 / b0.k) < 1e-6 * Math.max(1, Math.abs(after.x)) + 1e-9 && Math.abs(after.z - before.z - 9 / b0.k) < 1e-6, `arrows move the probe by 24 px across and 8 + 1 px up (${((after.x - before.x) * b0.k).toFixed(2)}, ${((after.z - before.z) * b0.k).toFixed(2)} px)`);
  check(b1.cx === b0.cx && b1.cy === b0.cy, 'the probe keys do not pan');
  await probeCheck(page, 'key probe', after, 'E', { name: 'line', line: 1 }, stE.view);
  await page.click('[data-field-probe-mode]');
  await page.focus('[data-trace-view]');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check((await box(page)).cx !== b1.cx, 'with the probe keys off the arrows pan again');
  await page.keyboard.press('0');
  await mapped(page);
  // tap (touch) at 390 px
  const tpage = await open('', { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  await fieldsOn(tpage);
  const tStE = await state(tpage), tspot = spotsIn(tStE.view)[1];
  await tpage.evaluate(() => document.querySelector('[data-trace-view]').scrollIntoView({ block: 'center' }));
  const tb2 = await box(tpage);
  await tpage.touchscreen.tap(tb2.left + tb2.w / 2 + (tspot[1] - tb2.cx) * tb2.k, tb2.top + tb2.h / 2 + (-tspot[2] - tb2.cy) * tb2.k);
  await tpage.waitForTimeout(150);
  const trd = await probeRead(tpage);
  check(trd.kind === 'value', `a tap sets the probe (${trd.text})`);
  if (trd.kind === 'value') await probeCheck(tpage, 'tap probe', trd, 'E', { name: 'line', line: 1 }, tStE.view);
  await tpage.context().close();

  // ---- pan and zoom draw the map again ----
  const paints = async () => page.evaluate(() => document.querySelector('[data-trace-view]').emsimField.paints.filter((x) => x.kind === 'done').length);
  const v0 = (await state(page)).view, n0 = await paints();
  const bz = await box(page);
  await page.mouse.move(bz.left + bz.w / 2, bz.top + bz.h / 2);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(400);
  await mapped(page);
  const v1 = (await state(page)).view;
  check((await paints()) > n0 && (v1.x1 - v1.x0) < 0.9 * (v0.x1 - v0.x0), `a zoom draws the map again for the smaller view (${(v0.x1 - v0.x0).toFixed(3)} → ${(v1.x1 - v1.x0).toFixed(3)} mm)`);
  await drawsLikeNode(page, 'zoomed', 1);
  await page.mouse.move(bz.left + bz.w / 2, bz.top + bz.h / 2);
  await page.mouse.down();
  await page.mouse.move(bz.left + bz.w / 2 + 120, bz.top + bz.h / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await mapped(page);
  const v2 = (await state(page)).view;
  check(v2.x0 !== v1.x0, `a pan draws the map again (x0 ${v1.x0.toFixed(4)} → ${v2.x0.toFixed(4)} mm)`);
  await page.keyboard.press('0');
  await mapped(page);

  // ---- first and full picture at 1440 px ----
  // Jobs not seen before (|H| of the pair only had the odd drive so far), so none comes from a cache.
  await kind(page, 'pair-microstrip');
  await sel(page, '[data-field-qty]', 'H');
  const k = 'pair-microstrip';
  for (const d of ['even', 'differential', 'common', 'line']) {
    const m0 = await page.evaluate(() => document.querySelector('[data-trace-view]').emsimField.paints.length);
    await page.selectOption('[data-field-drive]', d);
    await mapped(page);
    const ps = await page.evaluate((m0) => document.querySelector('[data-trace-view]').emsimField.paints.slice(m0), m0);
    const first = ps.find((x) => x.kind === 'partial'), full = ps.find((x) => x.kind === 'done' && !x.cached);
    const st = await state(page);
    if (first && full) times.push({ what: `${k} |H| ${d}`, nx: st.view.nx, ny: st.view.ny, first: first.ms, full: full.ms });
  }
  console.log('\n| 1440 px view | grid | first picture | full map |');
  console.log('|---|---|---|---|');
  for (const t of times) console.log(`| ${t.what} | ${t.nx} × ${t.ny} | ${t.first.toFixed(0)} ms | ${t.full.toFixed(0)} ms |`);
  check(times.length >= 3, `first and full times measured (${times.length})`);
  for (const t of times) {
    check(t.full <= 300, `${t.what}: the full map in ${t.full.toFixed(0)} ms (budget 300)`);
    if (t.first > 50) console.log(`NOTE ${t.what}: first picture ${t.first.toFixed(0)} ms (budget 50)`);
  }

  // ---- a drag with the field shown ----
  const rows = [];
  for (const [k, qty] of [['microstrip', 'E'], ['pair-microstrip', 'lines']]) {
    await kind(page, k);
    await sel(page, '[data-field-qty]', qty);
    for (const rate of [1, 4]) {
      rows.push({ kind: `${k} ${qty}`, ...(await timing(page, 'w', rate)) });
      await page.click('[data-undo]');
      await mapped(page);
    }
  }
  console.log('\n| structure | CPU | drag frames | work p50 | work p95 | task / frame | coarse maps | map latency p50 | p95 | max |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.kind} | ${r.rate}× | ${r.frames} | ${r.p50.toFixed(2)} ms | ${r.p95.toFixed(2)} ms | ${r.task.toFixed(2)} ms | ${r.maps} | ${r.l50.toFixed(0)} ms | ${r.l95.toFixed(0)} ms | ${r.lmax.toFixed(0)} ms |`);
  console.log('');
  for (const r of rows) {
    check(r.frames > 20 && r.maps > 5, `${r.kind} at ${r.rate}×: the drag ran (${r.frames} frames) and the map followed (${r.maps} coarse maps)`);
    const text = `work p95 ${r.p95.toFixed(2)} ms, task ${r.task.toFixed(2)} ms per frame (budget ${BUDGET[r.rate]}), map latency p50 ${r.l50.toFixed(0)} ms, p95 ${r.l95.toFixed(0)} ms`;
    if (r.rate === 1) check(r.p95 <= BUDGET[1] && r.task <= BUDGET[1] && r.l50 <= 100, `${r.kind} at 1×: ${text}`);
    else if (r.p95 > BUDGET[4] || r.task > BUDGET[4] || r.l50 > 100) console.log(`NOTE ${r.kind} at 4× misses a budget: ${text}`);
  }

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
  for (const [k, qty, name] of [['pair-microstrip', 'E', 'pair-E'], ['microstrip', 'lines', 'microstrip-lines']]) {
    await kind(page, k);
    await sel(page, '[data-field-qty]', qty);
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(300);
        await mapped(page);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        check(sw <= width, `${name}: no horizontal scroll at ${width} px, ${scheme} (${sw})`);
        if (shots && width !== 320) {
          const el = page.locator('[data-trace-drawing]');
          await el.scrollIntoViewIfNeeded();
          writeFileSync(join(shots, `emsim-fields-${name}-${width}-${scheme}.png`), await shrink(await el.screenshot()));
        }
      }
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-fields: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);

// A width dragged for 2 s (synthetic pointer moves every 8 ms) with the field shown: the drag frames' own work, all
// main-thread work per frame, and the latency of each coarse map from its request.
async function timing(p, key, rate) {
  await mapped(p);
  const h = p.locator(`[data-handle="${key}"] circle`).first();
  await h.scrollIntoViewIfNeeded();
  const bb = await h.boundingBox();
  const hx = bb.x + bb.width / 2, hy = bb.y + bb.height / 2;
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await p.waitForTimeout(300);
  const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
  const t0 = await task();
  const res = await p.evaluate(([key, hx, hy]) => new Promise((done) => {
    const box = document.querySelector('[data-trace-view]'), stat = box.emsimDrag, fs = box.emsimField;
    const hit = document.querySelector(`[data-handle="${key}"] circle`);
    const ev = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const m0 = stat.ms.length, f0 = stat.frames, p0 = fs.paints.length;
    const stamps = [];
    let x = hx;
    ev(hit, 'pointerdown', hx, hy);
    const start = performance.now();
    const tick = (t) => {
      stamps.push(t);
      if (t - start < 2000) requestAnimationFrame(tick);
      else {
        ev(box, 'pointerup', x, hy);
        done({ stamps, ms: stat.ms.slice(m0), frames: stat.frames - f0, paints: fs.paints.slice(p0).filter((q) => q.drag) });
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
  await mapped(p);
  const lat = res.paints.filter((x) => x.kind === 'done').map((x) => x.ms);
  return {
    rate, frames: res.frames, p50: q(res.ms, 0.5), p95: q(res.ms, 0.95), task: ((t1 - t0) * 1000) / Math.max(1, res.stamps.length),
    maps: lat.length, l50: q(lat, 0.5), l95: q(lat, 0.95), lmax: lat.length ? Math.max(...lat) : NaN,
  };
}
