// Drives /smith-chart/main in the installed Edge (or Chrome) and checks dragging the handles (step M3.3a): for every
// part kind (series and shunt R, L, C, a line, open and short stubs, λ/4) a mouse drag at 1280 px and a touch drag at
// 390 px (CDP touch emulation), snapping off, must commit the value that geometry.ts's `project` gives for the pointer
// positions the page received (replayed here with the grab offset and the length tracked over the moves) to 1e-9
// relative; a line dragged 2.3 turns round keeps its turns; typing a value and dragging to where its handle was agree
// to the shown digits; edit → drag back gives the value before to 1e-9; snapping lands exactly on an E24 value or on the
// grid circle it names (r, x, g, b of the end node to 1e-9), within SNAP_PX of the unsnapped point, and Alt or the Snap
// switch turns it off; the side panel follows during a drag and equals React's render after it; the link is written
// once per drag; a finger off the handles still scrolls the page; no horizontal scroll at 320 and 390 px; the drag
// frame's cost with 10 parts at 1× and 4× CPU.
//   tsx ui-drag.mjs [screenshot folder] [base URL]      (SMITH_SHOTS also names the folder; part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import { budgetFor, buildOf } from './timing.mjs';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedGeometry from '../../../lib/smith/geometry.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedQuantity from '../../../lib/quantity.ts';
import * as importedGrid from '../../../lib/smith/grid.ts';
import * as importedSeries from '../../../lib/resistor/eseries.ts';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const G = importedGeometry.default ?? importedGeometry;
const P = importedParts.default ?? importedParts;
const Q = importedQuantity.default ?? importedQuantity;
const GR = importedGrid.default ?? importedGrid;
const E = importedSeries.default ?? importedSeries;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.env.SMITH_SHOTS || (process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null);
const base = process.argv[3] ?? 'http://localhost:3020';

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

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); stopServer(); process.exit(1); }

let passed = 0, failed = 0;
const failures = [];
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(b), 1e-300));
const TOL = 1e-9;
const SNAP_PX = 8;

// Timing checks on a busy machine: a rate whose checks fail is measured again, up to twice, and passes if any attempt
// passes (every attempt is reported). `measure` returns the counted run and its checks as [condition, text] pairs.
async function timed(measure) {
  const attempts = [];
  for (let a = 0; a < 3; a++) {
    const m = await measure();
    attempts.push(m);
    if (m.checks.every(([c]) => c)) break;
  }
  const good = attempts.find((m) => m.checks.every(([c]) => c)) ?? attempts[attempts.length - 1];
  const note = attempts.length > 1 ? ` [attempt ${attempts.indexOf(good) + 1} of ${attempts.length}; main thread per run: ${attempts.map((m) => m.t.runs).join(' | ')}]` : '';
  for (const [c, what] of good.checks) ok(c, what + note);
  good.t.attempts = attempts.length;
  good.t.allRuns = attempts.map((m) => m.t.runs).join(' | ');
  return good.t;
}

// ---------- the engine's side ----------

function engine(c) {
  const n = c.parts.length, parts = P.packParts(c.parts);
  const nodes = new Float64Array((n + 1) * N.NODE_STRIDE);
  N.evaluate(nodes, parts, n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
  const gamma = [], g = [0, 0];
  for (let k = 0; k <= n; k++) { N.nodeGamma(g, 0, nodes, k * N.NODE_STRIDE); gamma.push([g[0], g[1]]); }
  return { n, nodes, parts, gamma };
}
function locusOf(c, i) {
  const e = engine(c), loc = new Float64Array(G.LOCUS_STRIDE);
  G.nodeLocus(loc, 0, e.nodes, e.parts, i, c.z0, c.f0, c.f0);
  return loc;
}
const pointAt = (loc, v) => { const o = new Float64Array(2); G.locusPoint(o, 0, loc, 0, v); return [o[0], o[1]]; };
/** The end node of part i: z (r, x) and y (g, b), normalised. */
function endNode(c, i) {
  const [gr, gi] = engine(c).gamma[i + 1];
  const dr = 1 - gr, di = -gi, d = dr * dr + di * di;
  const zr = ((1 + gr) * dr + gi * di) / d, zi = (gi * dr - (1 + gr) * di) / d;
  const m = zr * zr + zi * zi;
  return { gr, gi, r: zr, x: zi, g: zr / m, b: -zi / m };
}
/**
 * Replays a drag of part i from the pointer events the page received (rec) in the view vs: the grab offset at the
 * press, then geometry.ts's project for every move, the length tracked from the value before.
 */
function replay(c, i, vs, rec) {
  const e = engine(c), loc = locusOf(c, i), [hr, hi] = e.gamma[i + 1];
  const d = rec.findIndex((r) => r[0] === 'pointerdown');
  const offX = rec[d][1] - vs.left - (vs.w / 2 + (hr - vs.cx) * vs.k), offY = rec[d][2] - vs.top - (vs.h / 2 - (hi - vs.cy) * vs.k);
  let prev = c.parts[i].value, moves = 0;
  const out = new Float64Array(4);
  for (let j = d + 1; j < rec.length && rec[j][0] === 'pointermove'; j++) {
    const x = rec[j][1] - vs.left, y = rec[j][2] - vs.top;
    prev = G.project(out, 0, loc, 0, vs.cx + (x - offX - vs.w / 2) / vs.k, vs.cy - (y - offY - vs.h / 2) / vs.k, prev);
    moves++;
  }
  return { value: prev, moves, px: [out[0], out[1]] };
}
const E24 = E.series('E24').mantissas;
const isE24 = (v) => { const dec = Math.floor(Math.log10(v)); for (const d of [dec - 1, dec, dec + 1]) for (const m of E24) if (E.standardValue(m, d) === v) return true; return false; };
const formText = (form, v) => (form.unit === 'λ' ? `${Q.formatAmount(v, '', 4)} λ` : form.unit === '°' ? `${Q.formatAmount(v, '', 4)}°` : Q.formatAmount(v, form.unit, 4));

// ---------- the page's side ----------

async function load(page, c, vl = '') {
  // A value-list text (vl, M4.3b) goes into the link; without one the page reads localStorage, which nothing here writes.
  await page.goto(`${base}/smith-chart/main${c ? `?${S.encodeCircuit(c)}${vl ? `&vl=${vl}` : ''}` : ''}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-circuit]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
  await page.evaluate(() => {
    window.__rec = [];
    const on = (e) => window.__rec.push([e.type, e.clientX, e.clientY, e.altKey]);
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(t, on, true);
    window.__links = 0;
    const rs = history.replaceState.bind(history);
    history.replaceState = (...a) => { window.__links++; return rs(...a); };
  });
}
async function open(context, c) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await load(page, c);
  return page;
}
const linked = async (page) => S.decodeCircuit(new URL(page.url()).search).circuit;
const viewState = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-chart]'), v = box.smithChart, r = box.getBoundingClientRect();
  return { cx: v.cx, cy: v.cy, k: v.k, w: v.w, h: v.h, left: r.left + box.clientLeft, top: r.top + box.clientTop, scrollY: window.scrollY };
});
const client = (vs, [gr, gi]) => [vs.left + vs.w / 2 + (gr - vs.cx) * vs.k, vs.top + vs.h / 2 - (gi - vs.cy) * vs.k];
const steps = (a, b, n = 12) => Array.from({ length: n }, (_, j) => [a[0] + ((b[0] - a[0]) * (j + 1)) / n, a[1] + ((b[1] - a[1]) * (j + 1)) / n]);
async function setSnap(page, on) {
  const pressed = await page.getAttribute('[data-snap-toggle]', 'aria-pressed');
  if ((pressed === 'true') !== on) await page.click('[data-snap-toggle]');
  await frame(page);
}
const snapState = (page) => page.evaluate(() => {
  const l = document.querySelector('[data-chart]').smithPath, m = document.querySelector('[data-snap]');
  return { part: l.dragPart, code: l.snapCode, family: l.snapFamily, gv: l.snapGridValue, label: l.snapLabel, shown: !m.hidden, text: m.textContent };
});
async function mouseDrag(page, from, pts, { alt = false, hold = null } = {}) {
  await page.mouse.move(from[0], from[1]);
  await page.evaluate(() => { window.__rec = []; window.__links = 0; });
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.down();
  for (const [x, y] of pts) await page.mouse.move(x, y);
  const held = hold ? await hold() : null;
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
  await frame(page); await frame(page);
  return { rec: await page.evaluate(() => window.__rec), held };
}
async function touchDrag(page, cdp, from, pts, hold = null) {
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 0 }] : [] });
  await page.evaluate(() => { window.__rec = []; window.__links = 0; });
  await touch('touchStart', from);
  for (const p of pts) { await sleep(16); await touch('touchMove', p); }
  await sleep(16);
  await frame(page);
  const held = hold ? await hold() : null;
  await touch('touchEnd', null);
  await sleep(60);
  await frame(page); await frame(page);
  return { rec: await page.evaluate(() => window.__rec), held };
}

// ---------- the circuits ----------

const KINDS = [
  { name: 'series R', kind: P.SERIES_R, v: 20, to: (v) => v * 1.8 },
  { name: 'series L', kind: P.SERIES_L, v: 30e-9, to: (v) => v * 1.7 },
  { name: 'series C', kind: P.SERIES_C, v: 40e-12, to: (v) => v * 0.6 },
  { name: 'shunt R', kind: P.SHUNT_R, v: 100, to: (v) => v * 0.5 },
  { name: 'shunt L', kind: P.SHUNT_L, v: 80e-9, to: (v) => v * 0.6 },
  { name: 'shunt C', kind: P.SHUNT_C, v: 15e-12, to: (v) => v * 1.8 },
  { name: 'line', kind: P.LINE, v: 0.1, zc: 75, to: (v) => v + 0.12 },
  { name: 'open stub', kind: P.STUB_OPEN, v: 0.07, zc: 50, to: (v) => v + 0.08 },
  { name: 'short stub', kind: P.STUB_SHORT, v: 0.2, zc: 60, to: (v) => v + 0.06 },
  { name: 'λ/4', kind: P.QUARTER, v: 35, to: (v) => v * 1.4 },
];
const part = (s, v = s.v) => (s.zc ? { kind: s.kind, value: v, zc: s.zc } : { kind: s.kind, value: v });
const circuitFor = (s, v) => ({ z0: 50, f0: 100e6, loadR: 30, loadX: -20, parts: [part(s, v), { kind: P.SERIES_L, value: 20e-9 }] });
/** A drag target for part 0: the point of value `to`, moved off the locus by `off` px (and along it by `along`). */
function target(vs, c, v, off = 5, along = 0) {
  const loc = locusOf(c, 0), a = pointAt(loc, v), b = pointAt(loc, v * (1 + 1e-6) + 1e-9);
  const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
  const [x, y] = client(vs, a);
  return [x + (ty / l) * off + (tx / l) * along, y + (tx / l) * off - (ty / l) * along];
}

const timesOut = [];
let build = 'development';
try {
  // ---------- mouse, 1280 px ----------
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const page = await open(desk);

  // The handle: 44 px, the cursor, a click on it still picks (M3.2).
  {
    const r = await page.evaluate(() => { const b = document.querySelector('[data-handle="0"]').getBoundingClientRect(); return { w: b.width, h: b.height, x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    ok(r.w >= 44 && r.h >= 44, `a handle is a 44 px target: ${r.w} × ${r.h}`);
    await page.mouse.move(r.x + 2, r.y + 1);
    await frame(page);
    const cur = await page.evaluate(() => { const b = document.querySelector('[data-chart]'); return { hot: b.hasAttribute('data-handle-hot'), cursor: getComputedStyle(b).cursor, h: document.querySelector('[data-handle="0"]').hasAttribute('data-hot') }; });
    ok(cur.hot && cur.h && cur.cursor === 'grab', `hovering a handle: ${JSON.stringify(cur)}`);
    await page.mouse.down(); await page.mouse.up();
    await frame(page); await frame(page);
    const t = await page.evaluate(() => ({ row: document.querySelector('[data-node-row][aria-pressed="true"]')?.getAttribute('data-node-row'), links: window.__links }));
    ok(t.row === '1' && t.links === 0, `a click on a handle picks its node and changes nothing: ${JSON.stringify(t)}`);
  }

  // Every kind: drag to a target 5 px off the locus, snapping off; the committed value is the replayed projection's.
  for (const s of KINDS) {
    const c = circuitFor(s);
    await load(page, c);
    await setSnap(page, false);
    const vs = await viewState(page), h = client(vs, engine(c).gamma[1]);
    const from = [h[0] + 3, h[1] - 2];
    const { rec, held } = await mouseDrag(page, from, steps(from, target(vs, c, s.to(s.v))), {
      hold: async () => {
        // The panel's halves and the readout take turns per frame (pathLayer.ts writeLive): four frames show all.
        for (let j = 0; j < 3; j++) await frame(page);
        return page.evaluate(() => ({ tile: document.querySelector('[data-tile="0"] [data-tile-value]').textContent, z: document.querySelector('[data-node-row="2"] [data-v="z"]').textContent,
          input: document.querySelector('[data-input="gamma"]').textContent, card: document.querySelector('[data-card="0"] input')?.value, links: window.__links, drag: document.querySelector('[data-chart]').smithPath.dragPart }));
      },
    });
    const exp = replay(c, 0, vs, rec), got = (await linked(page)).parts[0].value;
    ok(exp.moves >= 10 && rel(got, exp.value) <= TOL && rel(got, s.v) > 1e-3, `mouse, ${s.name}: ${got} vs ${exp.value} (${exp.moves} moves, from ${s.v})`);
    const after = await page.evaluate(() => ({ tile: document.querySelector('[data-tile="0"] [data-tile-value]').textContent, z: document.querySelector('[data-node-row="2"] [data-v="z"]').textContent,
      input: document.querySelector('[data-input="gamma"]').textContent, card: document.querySelector('[data-card="0"] input')?.value, links: window.__links }));
    ok(held.drag === 0 && held.links === 0 && after.links === 1, `mouse, ${s.name}: the link is written once, on release (${held.links} during, ${after.links} after)`);
    ok(held.tile === after.tile && held.z === after.z && held.input === after.input && held.card === after.card,
      `mouse, ${s.name}: the panel during the drag equals React's render after it: ${JSON.stringify(held)} vs ${JSON.stringify(after)}`);
    const t = await page.evaluate(() => document.querySelector('[data-handle="0"]').style.transform);
    const m = /translate\(([-\d.e+]+)px,\s*([-\d.e+]+)px\)/.exec(t), vs2 = await viewState(page), hp = client(vs2, engine(await linked(page)).gamma[1]);
    ok(m && Math.abs(Number(m[1]) + vs2.left - hp[0]) < 0.01 && Math.abs(Number(m[2]) + vs2.top - hp[1]) < 0.01, `mouse, ${s.name}: the handle sits on the end node (${t})`);
  }

  // A line dragged 2.3 turns round (clockwise, towards the source) keeps the turns.
  {
    const s = { name: 'line', kind: P.LINE, v: 0.1, zc: 50 }, c = circuitFor(s);
    await load(page, c);
    await setSnap(page, false);
    const vs = await viewState(page), [gr, gi] = engine(c).gamma[1], rho = Math.hypot(gr, gi), a0 = Math.atan2(gi, gr);
    const pts = [];
    for (let j = 1; j <= 166; j++) pts.push(client(vs, [rho * Math.cos(a0 - (2 * Math.PI * 2.3 * j) / 166), rho * Math.sin(a0 - (2 * Math.PI * 2.3 * j) / 166)]));
    const from = client(vs, [gr, gi]);
    const { rec } = await mouseDrag(page, from, pts);
    const exp = replay(c, 0, vs, rec), got = (await linked(page)).parts[0].value;
    ok(rel(got, exp.value) <= TOL && Math.abs(got - (0.1 + 2.3 * 0.5)) < 0.01, `a line dragged 2.3 turns: ${got} λ (replayed ${exp.value})`);
  }

  // Typing a value and dragging to where its handle was agree to the shown digits; edit → drag back gives the value before.
  for (const s of KINDS) {
    const c = circuitFor(s), form = S.formsOf(s.kind)[0], v1 = s.to(s.v), text = formText(form, v1);
    await load(page, c);
    await setSnap(page, false);
    await page.click('[data-tile="0"]');
    await page.fill(`[data-card="0"] [data-name="p1-${form.id}"] input`, text);
    await frame(page); await frame(page);
    const typed = (await linked(page)).parts[0].value;
    const hp = await page.evaluate(() => { const m = /translate\(([-\d.e+]+)px,\s*([-\d.e+]+)px\)/.exec(document.querySelector('[data-handle="0"]').style.transform); return [Number(m[1]), Number(m[2])]; });
    // Drag back to the start point (the engine's node 1 of the circuit before) through the drag API: 1e-9.
    const g0 = engine(c).gamma[1];
    await page.evaluate(([x, y]) => { const l = document.querySelector('[data-chart]').smithPath; l.beginDrag(0); l.dragTo(x, y, true); l.endDrag(true); }, g0);
    await frame(page); await frame(page);
    const back = (await linked(page)).parts[0].value;
    ok(rel(back, s.v) <= TOL, `${s.name}: typed ${text}, dragged back: ${back} vs ${s.v}`);
    // Now from the start value, by mouse, to where the typed value's handle was.
    await load(page, c);
    await setSnap(page, false);
    const vs = await viewState(page), h = client(vs, engine(c).gamma[1]), from = [h[0] + 2, h[1] + 3];
    const to = [vs.left + hp[0] + 2, vs.top + hp[1] + 3];
    await mouseDrag(page, from, steps(from, to));
    const dragged = (await linked(page)).parts[0].value;
    ok(formText(form, dragged) === formText(form, typed), `${s.name}: typed ${text}, dragged to its handle: ${formText(form, dragged)}`);
  }

  // Snapping: an E24 value exactly, with the mark shown; the panel's switch and Alt turn it off.
  {
    const s = KINDS[2], c = circuitFor(s);
    await load(page, c);
    await setSnap(page, true);
    const vs = await viewState(page), h = client(vs, engine(c).gamma[1]), from = [h[0] - 2, h[1] + 2];
    const tg = target(vs, c, 33e-12, 3, 0);
    const { held } = await mouseDrag(page, from, steps(from, [tg[0] - 2, tg[1] + 2]), { hold: async () => { await frame(page); return snapState(page); } });
    const got = (await linked(page)).parts[0].value;
    ok(got === 33e-12 && held.code === 2 && held.shown && /33(\.0)?\s*pF/.test(held.text), `series C snaps to 33 pF exactly: ${got} (${JSON.stringify(held)})`);
    const after = await snapState(page);
    ok(!after.shown && after.part === -1, 'the snap mark goes with the drag');
  }
  // The classic match points: a line from 25 + j25 Ω onto z = 1 + j1 (r = 1 and x = 1 cross there), with and without Alt.
  for (const alt of [false, true]) {
    const c = { z0: 50, f0: 100e6, loadR: 25, loadX: 25, parts: [{ kind: P.LINE, value: 0.01, zc: 50 }] };
    await load(page, c);
    await setSnap(page, true);
    const vs = await viewState(page), [gr, gi] = engine(c).gamma[1], rho = Math.hypot(gr, gi), a0 = Math.atan2(gi, gr), a1 = Math.atan2(0.4, 0.2) - 2 / (rho * vs.k);
    const pts = [];
    for (let j = 1; j <= 20; j++) { const a = a0 + ((a1 - a0) * j) / 20; pts.push(client(vs, [(rho + 3 / vs.k) * Math.cos(a), (rho + 3 / vs.k) * Math.sin(a)])); }
    const { rec, held } = await mouseDrag(page, client(vs, [gr, gi]), pts, { alt, hold: async () => { await frame(page); return snapState(page); } });
    const done = await linked(page), got = done.parts[0].value, z = endNode(done, 0), raw = replay(c, 0, vs, rec);
    if (alt) ok(held.code === 0 && !held.shown && rel(got, raw.value) <= TOL, `Alt: no snapping (${got} vs ${raw.value}, ${JSON.stringify(held)})`);
    else ok(held.code === 1 && Math.abs(z.r - 1) <= TOL && Math.abs(z.x - 1) <= TOL, `a line snaps onto z = 1 + j1: z = ${z.r} + j${z.x} (${held.label})`);
  }
  // Every kind towards three targets with snapping on: whatever it snapped to holds exactly, within SNAP_PX.
  let grids = 0, standards = 0, nones = 0;
  for (const s of KINDS) {
    for (const f of [0.83, 1.31, 2.2]) {
      const c = circuitFor(s);
      await load(page, c);
      const vs = await viewState(page), h = client(vs, engine(c).gamma[1]), from = [h[0] + 1, h[1] + 1];
      const v = s.kind === P.LINE || s.kind === P.STUB_OPEN || s.kind === P.STUB_SHORT ? s.v + 0.1 * f : s.v * f;
      const { rec, held } = await mouseDrag(page, from, steps(from, target(vs, c, v, 2, 0)), { hold: async () => snapState(page) });
      const done = await linked(page), got = done.parts[0].value, raw = replay(c, 0, vs, rec), end = endNode(done, 0);
      const px = Math.hypot(end.gr - raw.px[0], end.gi - raw.px[1]) * vs.k;
      const what = `${s.name} → ${v}: ${JSON.stringify(held)}, value ${got}`;
      if (held.code === 2) { standards++; ok(isE24(got) && px <= SNAP_PX + 0.01, `${what}: E24 within ${px.toFixed(2)} px`); }
      else if (held.code === 1) {
        grids++;
        const q = held.family === GR.FAM_R ? end.r : held.family === GR.FAM_X ? end.x : held.family === GR.FAM_G ? end.g : held.family === GR.FAM_B ? end.b : held.family === GR.FAM_AXIS ? end.gi : NaN;
        const gv = held.family === GR.FAM_AXIS ? 0 : held.gv;
        ok(Math.abs(q - gv) <= TOL * Math.max(1, Math.abs(gv)) && px <= SNAP_PX + 0.01, `${what}: on the grid circle (${q} vs ${gv}) within ${px.toFixed(2)} px`);
      } else { nones++; ok(rel(got, raw.value) <= TOL, `${what}: unsnapped value ${raw.value}`); }
    }
  }
  ok(grids >= 5 && standards >= 3, `snapping met grid circles ${grids}×, E24 values ${standards}×, nothing ${nones}×`);

  // M4.3b: snapping and the keys follow the value list of the part's kind (vl in the link; D17): E24 by default for C,
  // E12, an own list, any value; λ/4's Zt on any value by default, on E24 when chosen.
  {
    const inList = (v, id) => E.series(id).mantissas.some((m) => [-14, -13, -12, -11, -10, 0, 1, 2, 3].some((d) => E.same(Number(`${m}e${d}`), v)));
    const listDrag = async (vl, s, v, off = 2) => {
      const c = circuitFor(s);
      await load(page, c, vl);
      await setSnap(page, true);
      const vs = await viewState(page), h = client(vs, engine(c).gamma[1]), from = [h[0] - 2, h[1] + 2];
      const tg = target(vs, c, v, off, 0);
      const { held } = await mouseDrag(page, from, steps(from, [tg[0] - 2, tg[1] + 2]), { hold: async () => { await frame(page); return snapState(page); } });
      return { got: (await linked(page)).parts[0].value, held, query: new URL(page.url()).search };
    };
    const C = KINDS[2], Q4 = KINDS[9];
    let r = await listDrag('', C, 36e-12);
    ok(r.got === 36e-12 && r.held.code === 2 && /36(\.0)?\s*pF · E24/.test(r.held.text), `C on E24 (default): snaps to 36 pF (${r.got}, ${JSON.stringify(r.held)})`);
    r = await listDrag('C12', C, 36e-12);
    ok(r.got !== 36e-12 && (r.held.code !== 2 || (inList(r.got, 'E12') && /· E12$/.test(r.held.text))) && /vl=C12/.test(r.query), `C on E12: no 36 pF, only E12 values (${r.got}, ${JSON.stringify(r.held)})`);
    r = await listDrag('C12', C, 39e-12);
    ok(r.got === 39e-12 && r.held.code === 2 && /39(\.0)?\s*pF · E12/.test(r.held.text), `C on E12: snaps to 39 pF (${r.got}, ${r.held.text})`);
    r = await listDrag('Co3.5e-11_4.4e-11', C, 35e-12);
    ok(r.got === 35e-12 && r.held.code === 2 && /35(\.0)?\s*pF · own list/.test(r.held.text), `C on an own list: snaps to 35 pF (${r.got}, ${r.held.text})`);
    r = await listDrag('Ca', C, 36e-12);
    ok(r.held.code !== 2, `C on any value: no value snapping (${r.got}, ${JSON.stringify(r.held)})`);
    r = await listDrag('', Q4, 51);
    ok(r.held.code !== 2, `λ/4 on any value (default): no value snapping (${r.got}, ${JSON.stringify(r.held)})`);
    r = await listDrag('Z24', Q4, 51);
    ok(r.got === 51 && r.held.code === 2 && /51(\.0)?\s*Ω · E24/.test(r.held.text), `λ/4 on E24: snaps to 51 Ω (${r.got}, ${r.held.text})`);
    // The keys: C on E12 steps 33 pF → 39 pF; on an own list to its next entry; on any value by 1 %.
    for (const [vl, want] of [['C12', 39e-12], ['Co3.3e-11_3.5e-11_4.4e-11', 35e-12], ['Ca', 33e-12 * 1.01]]) {
      await load(page, circuitFor(C, 33e-12), vl);
      await setSnap(page, true);
      await page.focus('[data-handle-key="0"]');
      await page.keyboard.press('ArrowUp');
      await frame(page);
      const got = (await linked(page)).parts[0].value;
      ok(rel(got, want) <= 1e-12, `keys with vl=${vl}: 33 pF → ${got} (want ${want})`);
    }
  }
  ok(page.errors.length === 0, `no errors (mouse): ${page.errors.join(' | ')}`);

  // ---------- drag frame cost with 10 parts ----------
  const TEN = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200&u=1,5';
  // M4.3a: two unknowns marked (parts 1 and 5), so the Solve panel solves on every commit while the line is dragged.
  const ten = S.decodeCircuit(TEN).circuit;
  async function timing(pt, rate) {
    await load(pt, ten);
    // Snapping off: the value then changes on every move (the costly case; snapped values often stay put).
    await setSnap(pt, false);
    const vs = await viewState(pt), [hx, hy] = client(vs, engine(ten).gamma[3]);
    const cdp = await pt.context().newCDPSession(pt);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await frame(pt);
    const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
    const t0 = await task();
    const res = await pt.evaluate(([hx, hy]) => new Promise((done) => {
      const box = document.querySelector('[data-chart]'), v = box.smithChart, layer = box.smithPath;
      const ev = (type, x, y) => box.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      const stamps = [], works = [], f0 = v.frames, b0 = v.grid.builds;
      let seen = layer.frames, events = 0, x = hx, y = hy;
      ev('pointerdown', hx, hy);
      const start = performance.now();
      const tick = (t) => {
        stamps.push(t);
        if (layer.frames !== seen) { works.push(layer.lastMs); seen = layer.frames; }
        if (t - start < 2000) requestAnimationFrame(tick);
        else { ev('pointerup', x, y); done({ stamps, works, frames: v.frames - f0, builds: v.grid.builds - b0, events, part: layer.dragPart }); }
      };
      requestAnimationFrame(tick);
      const send = () => {
        const t = performance.now() - start;
        if (t >= 2000) return;
        const a = (t / 2000) * 2 * Math.PI;
        x = hx + 70 * Math.sin(a); y = hy + 70 * (1 - Math.cos(a));
        ev('pointermove', x, y);
        events++;
        setTimeout(send, 8);
      };
      send();
    }), [hx, hy]);
    const t1 = await task();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    const iv = res.stamps.slice(1).map((t, i) => t - res.stamps[i]);
    const ws = res.works.slice().sort((a, b) => a - b);
    const q = (xs, f) => xs[Math.min(xs.length - 1, Math.floor(f * xs.length))];
    return { rate, ticks: res.stamps.length, frames: res.frames, layerFrames: res.works.length, events: res.events, builds: res.builds,
      lost: iv.reduce((a, t) => a + Math.max(0, Math.round(t / (1000 / 60)) - 1), 0), p50: q(ws, 0.5), p95: q(ws, 0.95), main: ((t1 - t0) * 1000) / res.stamps.length };
  }
  const pt = await open(desk);
  build = await buildOf(pt);
  for (const rate of [1, 4]) timesOut.push(await timed(async () => {
    const runs = [], checks = [];
    for (let i = 0; i < 3; i++) runs.push(await timing(pt, rate));
    runs.sort((a, b) => a.main - b.main);
    const t = runs[1];
    t.runs = runs.map((r) => r.main.toFixed(2)).join(', ');
    checks.push([t.layerFrames > 0.8 * t.ticks, `CPU ${rate}×: the drag was drawn in ${t.layerFrames} of ${t.ticks} frames`]);
    checks.push([t.lost <= t.builds + (rate === 1 ? 0 : 1), `CPU ${rate}×: ${t.lost} frames lost while dragging (${t.builds} grid rebuilds)`]);
    checks.push([t.p95 <= (rate === 1 ? 1 : 4), `CPU ${rate}×: drag script p95 ${t.p95.toFixed(2)} ms`]);
    // engine.md §9: the frame fits 16 ms at 4×; timing.mjs's guard below it is for a production build, × devFactor on
    // a dev server (M9.3: 9.9–11.5 ms on production, 12.0–12.7 on a fresh dev server; notes-M9.3.md).
    const lim = budgetFor(build, 'drag', rate).main;
    checks.push([rate === 1 || t.main <= lim, `CPU ${rate}×: main thread ${t.main.toFixed(2)} ms per drag frame (${build} build, at most ${lim.toFixed(1)})`]);
    return { t, checks };
  }));
  const tc = (await linked(pt)).parts[2].value;
  ok(tc !== 0.3 && pt.errors.length === 0, `the timed drag committed (line ${tc} λ), no errors: ${pt.errors.join(' | ')}`);
  await desk.close();

  // ---------- touch, 390 px (and 320 px) ----------
  for (const width of [390, 320]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const p = await open(ctx);
    const cdp = await ctx.newCDPSession(p);
    if (width === 390) {
      for (const s of KINDS) {
        const c = circuitFor(s);
        await load(p, c);
        await setSnap(p, false);
        const vs = await viewState(p), h = client(vs, engine(c).gamma[1]), from = [Math.round(h[0]) + 2, Math.round(h[1]) - 3];
        const { rec } = await touchDrag(p, cdp, from, steps(from, target(vs, c, s.to(s.v)), 10));
        const exp = replay(c, 0, vs, rec), got = (await linked(p)).parts[0].value, vs2 = await viewState(p);
        ok(exp.moves >= 5 && rel(got, exp.value) <= TOL && rel(got, s.v) > 1e-3, `touch, ${s.name}: ${got} vs ${exp.value} (${exp.moves} moves)`);
        ok(vs2.scrollY === vs.scrollY && vs2.cx === vs.cx && vs2.cy === vs.cy && vs2.k === vs.k, `touch, ${s.name}: neither the page nor the chart moved`);
      }
      // One finger off the handles scrolls the page; nothing is dragged.
      await load(p);
      await p.evaluate(() => { document.body.style.paddingBottom = '1500px'; window.scrollTo(0, 0); });
      await frame(p);
      const vs = await viewState(p), hs = engine(S.defaultCircuit()).gamma.slice(1).map((g) => client(vs, g));
      let at = [vs.left + vs.w * 0.5, vs.top + vs.h * 0.75];
      for (const fx of [0.5, 0.3, 0.7, 0.2, 0.8]) { at = [vs.left + vs.w * fx, vs.top + vs.h * 0.75]; if (hs.every((q) => Math.hypot(q[0] - at[0], q[1] - at[1]) > 40)) break; }
      const touch = (type, q) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q[0], y: q[1], id: 0 }] : [] });
      await touch('touchStart', at);
      for (let j = 1; j <= 13; j++) { await sleep(16); await touch('touchMove', [at[0], at[1] - (200 * j) / 13]); }
      await sleep(16); await touch('touchEnd', null); await sleep(250); await frame(p);
      const sc = await p.evaluate(() => ({ y: window.scrollY, links: window.__links }));
      ok(sc.y >= 60 && sc.links === 0, `one finger off the handles scrolls the page: ${JSON.stringify(sc)}`);
      await p.evaluate(() => { window.scrollTo(0, 0); });
      await frame(p);
      // The start circuit's series C to 33 pF by finger, the snap mark shown (screenshot mid-drag).
      const c0 = S.defaultCircuit(), vs3 = await viewState(p), h0 = client(vs3, engine(c0).gamma[1]);
      const loc = locusOf(c0, 0), tg = client(vs3, pointAt(loc, 33e-12)), from = [Math.round(h0[0]), Math.round(h0[1])];
      // Out and back (a finger that moves less than the tap slop within 600 ms is a tap and changes nothing).
      const out = [from[0] + 10, from[1] - 40], to = [tg[0] + from[0] - h0[0], tg[1] + from[1] - h0[1]];
      const { held } = await touchDrag(p, cdp, from, [...steps(from, out, 4), ...steps(out, to, 6)], async () => {
        const st = await snapState(p);
        if (shots) { mkdirSync(shots, { recursive: true }); await p.screenshot({ path: join(shots, 'drag-390-dark.png') }); }
        return st;
      });
      const got = (await linked(p)).parts[0].value;
      ok(got === 33e-12 && held.shown && held.code === 2, `touch: the start circuit's C snaps to 33 pF: ${got} (${JSON.stringify(held)})`);
    }
    const sw = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    ok(sw.s <= sw.c, `${width} px: no horizontal scroll (${sw.s} > ${sw.c})`);
    ok(p.errors.length === 0, `${width} px: no errors: ${p.errors.join(' | ')}`);
    await ctx.close();
  }

  if (shots) {
    const wide = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', deviceScaleFactor: 1000 / 1440 });
    const p = await open(wide);
    await p.mouse.move(...(await (async () => { const vs = await viewState(p); return client(vs, engine(S.defaultCircuit()).gamma[1]); })()));
    await frame(p);
    await p.screenshot({ path: join(shots, 'drag-1440-light.png') });
    await wide.close();
  }
} catch (e) {
  ok(false, `the run stopped: ${e.stack ?? e}`);
}

await browser.close();
stopServer();
for (const failure of failures) console.log(`FAIL ${failure}`);
for (const t of timesOut) {
  console.log(`drag 2 s with 10 parts at CPU ${t.rate}× (headless): ${t.events} moves, ${t.ticks} frames, drawn in ${t.layerFrames}, ${t.lost} lost, ${t.builds} grid rebuilds; `
    + `drag script p50 ${t.p50.toFixed(3)} / p95 ${t.p95.toFixed(3)} ms; main thread ${t.main.toFixed(2)} ms per frame (runs ${t.allRuns}${t.attempts > 1 ? `; ${t.attempts} attempts` : ''})`);
}
console.log(`timed on a ${build} build`);
console.log(`dragging: ${passed} of ${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
