// Drives /smith-chart/main in the installed Edge (or Chrome) and checks step M3.3b: undo and redo, the draw tool and
// the handles' keys. 200 random sequences of edits (typed values in the parameter and part fields, add, remove, move,
// a handle's drag, a draw, a handle's arrow keys) each followed by random undo and redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y,
// the buttons) against a model history: every edit that changes the link is one step (a field's keystrokes and a drag
// too), and after any undo or redo the link, the committed circuit of the path layer and the circuit input's readout
// equal what was recorded for that state, to the bit and the character; the history keeps 200 steps. The draw tool:
// every part kind drawn by mouse at 1280 px (snapping off) commits the value that geometry.ts's `project` gives for the
// pointer events the page received, replayed from state.ts's `startPart` with the grab offset (1e-9 relative), as one
// undo step; a tap, Escape and the toolbar's button take a draw away; one finger draws at 390 px (CDP touch). Keyboard
// alone: Tab to Add and add a part, Shift+Tab along the handles in the strip's order, arrows (E24 with Snap) and
// Shift+arrows step the value as stepValue says, focus is visible, Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y. No horizontal scroll
// at 320 and 390 px with the draw tool armed.
//   tsx ui-edit.mjs [screenshot folder] [base URL]      (SMITH_SHOTS also names the folder; part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedGeometry from '../../../lib/smith/geometry.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedQuantity from '../../../lib/quantity.ts';
import * as importedSeries from '../../../lib/resistor/eseries.ts';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const G = importedGeometry.default ?? importedGeometry;
const P = importedParts.default ?? importedParts;
const Q = importedQuantity.default ?? importedQuantity;
const E = importedSeries.default ?? importedSeries;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.env.SMITH_SHOTS || (process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null);
const base = process.argv[3] ?? 'http://localhost:3020';
const SEQUENCES = Number(process.env.SMITH_SEQUENCES || 200);

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
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(typeof what === 'function' ? what() : what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(b), 1e-300));
const TOL = 1e-9;
const E24 = E.series('E24').mantissas;

// A seeded generator, so a failing sequence can be run again (SMITH_SEED).
let seed = Number(process.env.SMITH_SEED || 20261112) >>> 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pickOf = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + (b - a) * rnd();

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
/** Replays a drag of part i of c (for a draw: the circuit with startPart appended) from the pointer events in rec. */
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
  return { value: prev, moves };
}
const formText = (form, v) => (form.unit === 'λ' ? `${Q.formatAmount(v, '', 4)} λ` : form.unit === '°' ? `${Q.formatAmount(v, '', 4)}°` : Q.formatAmount(v, form.unit, 4));
const appended = (c, kind) => ({ ...c, parts: [...c.parts, S.startPart(kind, c)] });

// ---------- the page's side ----------

async function load(page, c) {
  await page.goto(`${base}/smith-chart/main${c ? `?${S.encodeCircuit(c)}` : ''}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-circuit]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
  await page.evaluate(() => {
    window.__rec = [];
    const on = (e) => window.__rec.push([e.type, e.clientX, e.clientY]);
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) window.addEventListener(t, on, true);
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
  return { cx: v.cx, cy: v.cy, k: v.k, w: v.w, h: v.h, left: r.left + box.clientLeft, top: r.top + box.clientTop };
});
const client = (vs, [gr, gi]) => [vs.left + vs.w / 2 + (gr - vs.cx) * vs.k, vs.top + vs.h / 2 - (gi - vs.cy) * vs.k];
const steps = (a, b, n = 12) => Array.from({ length: n }, (_, j) => [a[0] + ((b[0] - a[0]) * (j + 1)) / n, a[1] + ((b[1] - a[1]) * (j + 1)) / n]);
/** What a state is: the link, the circuit the path layer holds, the circuit input's readout, the history buttons. */
const snapshot = (page) => page.evaluate(() => {
  const l = document.querySelector('[data-chart]').smithPath;
  return {
    link: window.location.search,
    committed: l.committed,
    texts: [...document.querySelectorAll('[data-input]')].map((e) => e.textContent),
    undo: !document.querySelector('[data-undo]').disabled,
    redo: !document.querySelector('[data-redo]').disabled,
    armed: document.querySelector('[data-draw]')?.getAttribute('aria-pressed') === 'true',
    drag: l.dragPart,
  };
});
async function setSnap(page, on) {
  const pressed = await page.getAttribute('[data-snap-toggle]', 'aria-pressed');
  if ((pressed === 'true') !== on) await page.click('[data-snap-toggle]');
  await frame(page);
}
async function mouseDrag(page, from, pts, hold = null) {
  await page.mouse.move(from[0], from[1]);
  await page.evaluate(() => { window.__rec = []; });
  await page.mouse.down();
  for (const [x, y] of pts) await page.mouse.move(x, y);
  const held = hold ? await hold() : null;
  await page.mouse.up();
  await frame(page); await frame(page);
  return { rec: await page.evaluate(() => window.__rec), held };
}
async function touchDrag(page, cdp, from, pts) {
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 0 }] : [] });
  await page.evaluate(() => { window.__rec = []; });
  await touch('touchStart', from);
  for (const p of pts) { await sleep(16); await touch('touchMove', p); }
  await sleep(16);
  await touch('touchEnd', null);
  await sleep(60);
  await frame(page); await frame(page);
  return page.evaluate(() => window.__rec);
}
/** Arms the draw tool with a kind through the strip (the kind select, then Draw). */
async function arm(page, kind) {
  await page.selectOption('[data-add-kind]', String(kind));
  if ((await page.getAttribute('[data-draw]', 'aria-pressed')) !== 'true') await page.click('[data-draw]');
  // Reaching Draw low in the side panel may scroll the page, and the input (In) under the sticky bar.
  await page.evaluate(() => window.scrollTo(0, 0));
  await frame(page);
}

const KINDS = [
  { name: 'series R', kind: P.SERIES_R, to: 40 },
  { name: 'series L', kind: P.SERIES_L, to: 30e-9 },
  { name: 'series C', kind: P.SERIES_C, to: 40e-12 },
  { name: 'shunt R', kind: P.SHUNT_R, to: 120 },
  { name: 'shunt L', kind: P.SHUNT_L, to: 80e-9 },
  { name: 'shunt C', kind: P.SHUNT_C, to: 15e-12 },
  { name: 'line', kind: P.LINE, to: 0.1 },
  { name: 'open stub', kind: P.STUB_OPEN, to: 0.07 },
  { name: 'short stub', kind: P.STUB_SHORT, to: 0.18 },
  { name: 'λ/4', kind: P.QUARTER, to: 35 },
];
const BASE = { z0: 50, f0: 100e6, loadR: 30, loadX: -20, parts: [{ kind: P.SERIES_L, value: 20e-9 }] };
/** A target for part i of c: the point of value v moved off the locus by `off` px. */
function target(vs, c, i, v, off = 5) {
  const loc = locusOf(c, i), a = pointAt(loc, v), b = pointAt(loc, v * (1 + 1e-6) + 1e-9);
  const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
  const [x, y] = client(vs, a);
  return [x + (ty / l) * off, y + (tx / l) * off];
}
/** A draw of `kind` from the input to the point of value `to`, by mouse; returns the replayed and committed values. */
async function mouseDraw(page, kind, to, hold = null) {
  const c = await linked(page);
  // The whole chart in view: a draw starts at the input's node, which can lie below the fold when the page above the
  // chart grows (M5.1: a longer status note put sequence 81's start at y = 903 of 900).
  await arm(page, kind);
  // After arming: the click on Draw scrolls its button into view.
  await page.$eval('[data-chart]', (e) => e.scrollIntoView({ block: 'nearest' }));
  const ca = appended(c, kind), n = c.parts.length, vs = await viewState(page);
  const h = client(vs, engine(c).gamma[n]), from = [h[0] + 3, h[1] - 2];
  const { rec, held } = await mouseDrag(page, from, steps(from, target(vs, ca, n, to)), hold);
  const got = await linked(page);
  return { c, ca, n, exp: replay(ca, n, vs, rec), got, held };
}

try {
  // ---------- the draw tool, every kind by mouse, 1280 px ----------
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const page = await open(desk, BASE);
  await setSnap(page, false);
  for (const s of KINDS) {
    await load(page, BASE);
    await setSnap(page, false);
    const before = await snapshot(page);
    const { n, exp, got } = await mouseDraw(page, s.kind, s.to);
    const p = got.parts[n], st = await snapshot(page);
    ok(got.parts.length === n + 1 && p.kind === s.kind && exp.moves >= 10 && rel(p.value, exp.value) <= TOL,
      () => `draw ${s.name}: committed ${p?.value} (kind ${p?.kind}), replayed ${exp.value} over ${exp.moves} moves`);
    ok(p.value !== S.startPart(s.kind, BASE).value, `draw ${s.name}: the value moved from the start`);
    ok(!st.armed && st.undo && !st.redo, () => `draw ${s.name}: disarmed after the draw, one undo step: ${JSON.stringify(st)}`);
    ok(await page.$(`[data-card="${n}"]`) !== null, `draw ${s.name}: the new part is selected`);
    await page.keyboard.press('Control+z');
    await frame(page);
    const u = await snapshot(page);
    ok(u.link === before.link && !u.undo && u.redo && u.texts.join('|') === before.texts.join('|'), () => `draw ${s.name}: one Ctrl+Z takes it away: ${u.link}`);
    await page.keyboard.press('Control+Shift+Z');
    await frame(page);
    ok((await snapshot(page)).link === st.link, `draw ${s.name}: Ctrl+Shift+Z brings it back`);
  }
  // A tap at the input, Escape during a draw and the toolbar's button take the draw away; nothing is committed.
  {
    await load(page, BASE);
    const before = await snapshot(page), vs = await viewState(page), h = client(vs, engine(BASE).gamma[1]);
    await arm(page, P.SERIES_C);
    ok(await page.$('[data-draw-start]:not([hidden])') !== null && await page.$('[data-draw-stop]') !== null, 'armed: the ring at the input and the toolbar button are shown');
    await page.mouse.move(h[0] + 2, h[1] + 2);
    await page.mouse.down(); await page.mouse.up();
    await frame(page);
    let st = await snapshot(page);
    ok(st.link === before.link && !st.undo && !st.armed && st.drag === -1, () => `a tap at the input takes the draw away: ${JSON.stringify(st)}`);
    await arm(page, P.SHUNT_L);
    await page.mouse.move(h[0] + 2, h[1] + 2);
    await page.mouse.down();
    for (const [x, y] of steps([h[0] + 2, h[1] + 2], [h[0] + 80, h[1] + 60], 6)) await page.mouse.move(x, y);
    const mid = await page.evaluate(() => document.querySelectorAll('[data-arc]').length);
    await page.keyboard.press('Escape');
    await page.mouse.move(h[0] + 120, h[1] + 90);
    await page.mouse.up();
    await frame(page);
    st = await snapshot(page);
    const arcs = await page.evaluate(() => document.querySelectorAll('[data-arc]').length);
    ok(mid === 2 && arcs === 1 && st.link === before.link && !st.undo && !st.armed && st.texts.join('|') === before.texts.join('|'),
      () => `Escape during a draw takes it away: arcs ${mid} → ${arcs}, ${JSON.stringify(st)}`);
    await arm(page, P.LINE);
    await page.click('[data-draw-stop]');
    await frame(page);
    st = await snapshot(page);
    ok(!st.armed && await page.$('[data-draw-start]:not([hidden])') === null, 'the toolbar button disarms the draw tool');
  }

  // ---------- typed values and drags are one step each ----------
  {
    await load(page, BASE);
    const before = await snapshot(page);
    await page.click('[data-name="loadR"] input', { clickCount: 3 });
    await page.keyboard.type('47.5 Ω', { delay: 5 });
    await page.keyboard.press('Tab');
    await frame(page);
    const typed = await snapshot(page);
    ok(typed.link.includes('zl=47.5:') && typed.undo, () => `typing 47.5 Ω: ${typed.link}`);
    await page.keyboard.press('Control+z');
    await frame(page);
    ok((await snapshot(page)).link === before.link, 'the six keystrokes of one field are one step');
    await page.keyboard.press('Control+y');
    await frame(page);
    const vs = await viewState(page), h = client(vs, engine(await linked(page)).gamma[1]);
    await mouseDrag(page, [h[0] + 2, h[1]], steps([h[0] + 2, h[1]], [h[0] + 70, h[1] - 50], 15));
    const dragged = await snapshot(page);
    ok(dragged.link !== typed.link, 'the drag changed the circuit');
    await page.keyboard.press('Control+z');
    await frame(page);
    ok((await snapshot(page)).link === typed.link, 'a drag of 15 moves is one step');
    // Ctrl+Z in a field with typed text: the circuit goes back and the field shows it again.
    await page.click('[data-name="loadX"] input', { clickCount: 3 });
    await page.keyboard.type('-33', { delay: 5 });
    await page.keyboard.press('Control+z');
    await frame(page);
    const f = await page.$eval('[data-name="loadX"] input', (e) => e.value);
    ok((await snapshot(page)).link === typed.link && f === Q.formatAmount(-20, 'Ω', 4), () => `Ctrl+Z in a field: ${f}`);
  }

  // ---------- the history keeps 200 steps ----------
  {
    await load(page, S.defaultCircuit());
    let fifth = '';
    for (let j = 1; j <= 205; j++) {
      await page.focus(`[data-handle-key="${j & 1}"]`);
      await page.keyboard.press(j % 4 < 2 ? 'ArrowUp' : 'ArrowDown');
      if (j === 5) { await frame(page); fifth = (await snapshot(page)).link; }
    }
    await page.focus('[data-chart]');
    let undos = 0;
    while (undos < 210 && (await snapshot(page)).undo) { await page.keyboard.press('Control+z'); undos++; }
    const st = await snapshot(page);
    ok(undos === 200 && st.link === fifth, () => `200 steps are kept: ${undos} undos, back to step 5: ${st.link === fifth}`);
  }

  // ---------- random sequences against a model history ----------
  {
    let model = null, edits = 0, travels = 0, steps0 = 0;
    const record = async () => { await frame(page); return snapshot(page); };
    const same = (a, b, what) => {
      ok(a.link === b.link, () => `${what}: link ${a.link} ≠ ${b.link}`);
      ok(a.texts.join('|') === b.texts.join('|'), () => `${what}: readout ${a.texts.join('|')} ≠ ${b.texts.join('|')}`);
      ok(S.sameCircuit(a.committed, S.decodeCircuit(a.link).circuit), () => `${what}: the path layer's circuit is not the link's`);
    };
    const RANDOM_LOADS = () => ({ z0: pickOf([50, 75]), f0: pickOf([100e6, 2.4e9]), loadR: between(5, 200), loadX: between(-150, 150), parts: [{ kind: P.SHUNT_C, value: 4e-12 }, { kind: P.LINE, value: 0.09, zc: 60 }] });
    for (let seq = 0; seq < SEQUENCES; seq++) {
      if (seq % 25 === 0) {
        await load(page, RANDOM_LOADS());
        await setSnap(page, rnd() < 0.5);
        const s0 = await record();
        model = { past: [], future: [], now: s0 };
      }
      for (let e = 0; e < 3; e++) {
        const c = await linked(page), n = c.parts.length;
        const ops = ['type', 'typeParam', 'keys', 'drag'];
        if (n < 6) ops.push('add', 'draw');
        if (n > 1) ops.push('remove', 'move');
        const op = n === 0 ? pickOf(['add', 'draw', 'typeParam']) : pickOf(ops);
        const i = Math.floor(rnd() * n);
        if (op === 'type' || op === 'typeParam') {
          let sel = '', text = '';
          const p = c.parts[i], form = n ? S.formsOf(p.kind)[0] : null, v = n ? S.formValue(form.id, p, c) : NaN;
          if (op === 'type' && v > 0 && v < Infinity) {
            await page.click(`[data-tile="${i}"]`);
            sel = `[data-card="${i}"] [data-name="p${i + 1}-${form.id}"] input`;
            text = formText(form, v * (rnd() < 0.5 ? between(0.6, 0.9) : between(1.1, 1.6)));
          } else {
            const which = pickOf(['loadR', 'loadX', 'z0']);
            sel = `[data-name="${which}"] input`;
            text = which === 'loadR' ? `${between(5, 300).toFixed(1)} Ω` : which === 'loadX' ? `${between(-200, 200).toFixed(2)}` : pickOf([50, 75, 60, 35].filter((z) => z !== c.z0)).toString();
          }
          await page.click(sel, { clickCount: 3 });
          await page.keyboard.type(text, { delay: 2 });
          await page.keyboard.press('Tab');
        } else if (op === 'add') {
          await page.selectOption('[data-add-kind]', String(Math.floor(rnd() * 10)));
          await page.selectOption('[data-add-at]', String(Math.floor(rnd() * (n + 1)) - 1));
          await page.click('[data-add]');
        } else if (op === 'remove') {
          await page.click(`[data-tile="${i}"]`);
          await page.click('[data-remove]');
        } else if (op === 'move') {
          await page.click(`[data-tile="${i}"]`);
          const b = await page.$(`[data-move="${pickOf(['source', 'load'])}"]:not([disabled])`) ?? await page.$('[data-move]:not([disabled])');
          await b.click();
        } else if (op === 'keys') {
          await page.focus(`[data-handle-key="${i}"]`);
          for (let k = 1 + Math.floor(rnd() * 4); k > 0; k--) await page.keyboard.press(`${rnd() < 0.3 ? 'Shift+' : ''}${pickOf(['ArrowUp', 'ArrowDown', 'ArrowRight', 'PageDown'])}`);
          await page.focus('[data-chart]');
        } else if (op === 'drag') {
          const vs = await viewState(page), h = client(vs, engine(c).gamma[i + 1]);
          if (!(h[0] > vs.left + 25 && h[0] < vs.left + vs.w - 25 && h[1] > vs.top + 25 && h[1] < vs.top + vs.h - 25)) continue;
          const p = c.parts[i], line = P.isLine(p.kind) || P.isStub(p.kind);
          const to = line ? p.value + between(-0.05, 0.1) : p.value > 0 && p.value < Infinity ? p.value * between(0.5, 2) : S.newPart(p.kind, c).value;
          const tg = target(vs, c, i, Math.max(to, 1e-6), between(-6, 6));
          await mouseDrag(page, [h[0] + 1, h[1] - 1], steps([h[0] + 1, h[1] - 1], tg, 8));
        } else if (op === 'draw') {
          const kind = Math.floor(rnd() * 10);
          const sp = S.newPart(kind, c);
          await mouseDraw(page, kind, P.isLine(kind) || P.isStub(kind) ? between(0.03, 0.2) : sp.value * between(0.4, 2.5));
        }
        const st = await record();
        edits++;
        ok(st.drag === -1 && !st.armed, () => `sequence ${seq}, ${op}: no drag or draw left over (drag ${st.drag}, armed ${st.armed})`);
        if (st.link !== model.now.link) { model.past.push(model.now); if (model.past.length > 200) model.past.shift(); model.future = []; model.now = st; steps0++; }
        ok(st.undo === model.past.length > 0 && st.redo === model.future.length > 0, () => `sequence ${seq}, ${op}: buttons ${st.undo}/${st.redo}, model ${model.past.length}/${model.future.length}`);
      }
      for (let t = 0; t < 3; t++) {
        const back = rnd() < 0.6, can = back ? model.past.length : model.future.length;
        const way = rnd() < 0.3 && can ? 'button' : back ? 'Control+z' : pickOf(['Control+Shift+Z', 'Control+y']);
        if (way === 'button') await page.click(back ? '[data-undo]' : '[data-redo]');
        else await page.keyboard.press(way);
        if (can) {
          if (back) { model.future.push(model.now); model.now = model.past.pop(); } else { model.past.push(model.now); model.now = model.future.pop(); }
        }
        const st = await record();
        travels++;
        same(st, model.now, `sequence ${seq}, ${back ? 'undo' : 'redo'} by ${way}`);
        ok(st.undo === model.past.length > 0 && st.redo === model.future.length > 0, () => `sequence ${seq}: buttons after ${way}`);
      }
    }
    ok(page.errors.length === 0, `no errors: ${page.errors.join(' | ')}`);
    console.log(`random: ${SEQUENCES} sequences, ${edits} edits (${steps0} steps), ${travels} undo/redo`);
  }

  // ---------- keyboard alone ----------
  {
    await load(page, S.defaultCircuit());
    await setSnap(page, true);
    await page.evaluate(() => document.activeElement?.blur());
    const c0 = S.defaultCircuit(), n = c0.parts.length;
    const active = () => page.evaluate(() => {
      const a = document.activeElement;
      const k = a?.getAttribute('data-handle-key') ?? null, ring = k === null ? null : document.querySelector(`[data-handle="${k}"]`);
      return { handle: k, add: a?.hasAttribute('data-add') ?? false, chart: a?.hasAttribute('data-chart') ?? false, outline: ring && ring.hasAttribute('data-focus') ? getComputedStyle(ring).outlineStyle : '' };
    });
    let presses = 0;
    while (presses < 120 && !(await active()).add) { await page.keyboard.press('Tab'); presses++; }
    ok((await active()).add, `Tab reaches Add (${presses} presses)`);
    await page.keyboard.press('Enter');
    await frame(page);
    const added = await linked(page), np = S.newPart(P.SERIES_L, c0);
    ok(added.parts.length === n + 1 && added.parts[n].kind === P.SERIES_L && added.parts[n].value === np.value, () => `Enter on Add adds a series L at the source end: ${JSON.stringify(added.parts[n])}`);
    const order = [];
    for (let j = 0; j < 40; j++) {
      await page.keyboard.press('Shift+Tab');
      const a = await active();
      if (a.handle !== null) { order.push(Number(a.handle)); if (Number(a.handle) === n) break; }
    }
    ok(order.join() === [...Array(n + 1).keys()].join(), `Shift+Tab walks the handles from the load to the source: ${order.join()}`);
    ok((await active()).outline === 'solid', 'a focused handle shows its focus');
    await page.keyboard.press('Shift+Tab');
    ok((await active()).chart, 'before the handles comes the chart');
    await page.keyboard.press('Tab');
    ok((await active()).handle === String(n), 'Tab goes back to the source end\'s handle');
    let exp = np.value;
    for (let j = 0; j < 3; j++) { await page.keyboard.press('ArrowUp'); exp = S.stepValue(P.SERIES_L, exp, true, false, E24, c0); }
    await page.keyboard.press('Shift+ArrowDown');
    exp = S.stepValue(P.SERIES_L, exp, false, true, E24, c0);
    await frame(page);
    const stepped = await linked(page);
    ok(stepped.parts[n].value === exp && E.series('E24').mantissas.length === 24, () => `arrows step by E24: ${stepped.parts[n].value} vs ${exp}`);
    ok(await page.$(`[data-card="${n}"]`) !== null, 'the focused handle\'s part is selected');
    const link1 = (await snapshot(page)).link;
    await page.keyboard.press('Control+z');
    await frame(page);
    ok((await linked(page)).parts[n]?.value === np.value, 'Ctrl+Z undoes the arrow keys as one step');
    await page.keyboard.press('Control+z');
    await frame(page);
    ok(S.sameCircuit(await linked(page), c0), 'Ctrl+Z again undoes the add');
    await page.keyboard.press('Control+Shift+Z');
    await page.keyboard.press('Control+y');
    await frame(page);
    ok((await snapshot(page)).link === link1, 'Ctrl+Shift+Z and Ctrl+Y redo both');
    // Without snapping: the factor steps; a line by whole degrees.
    await setSnap(page, false);
    await page.focus('[data-handle-key="0"]');
    const v0 = (await linked(page)).parts[0].value;
    await page.keyboard.press('ArrowDown');
    await frame(page);
    ok((await linked(page)).parts[0].value === v0 / S.KEY_FACTOR, 'without Snap, ↓ divides by KEY_FACTOR');
    ok(page.errors.length === 0, `keyboard: no errors: ${page.errors.join(' | ')}`);
  }

  // ---------- touch: one finger draws; no horizontal scroll at 320 and 390 px with the tool armed ----------
  for (const width of [390, 320]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const p = await open(ctx, BASE);
    const cdp = await ctx.newCDPSession(p);
    await setSnap(p, false);
    for (const s of width === 390 ? [KINDS[2], KINDS[6], KINDS[4]] : [KINDS[1]]) {
      await load(p, BASE);
      await setSnap(p, false);
      await arm(p, s.kind);
      await p.evaluate(() => window.scrollTo(0, 0));
      await frame(p);
      const ca = appended(BASE, s.kind), vs = await viewState(p), h = client(vs, engine(BASE).gamma[1]);
      const from = [Math.round(h[0]) + 2, Math.round(h[1]) - 1];
      const rec = await touchDrag(p, cdp, from, steps(from, target(vs, ca, 1, s.to), 10));
      const got = (await linked(p)).parts, exp = replay(ca, 1, vs, rec);
      ok(got.length === 2 && got[1].kind === s.kind && rel(got[1].value, exp.value) <= TOL && exp.moves >= 8,
        () => `${width} px: one finger draws a ${s.name}: ${got[1]?.value} vs ${exp.value} (${exp.moves} moves)`);
    }
    await arm(p, P.LINE);
    const sw = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    ok(sw.s <= sw.c, `${width} px, draw tool armed: no horizontal scroll (${sw.s} > ${sw.c})`);
    ok(p.errors.length === 0, `${width} px: no errors: ${p.errors.join(' | ')}`);
    await ctx.close();
  }

  // ---------- M3.4: the start state, the empty state, Start over, the card on the main page ----------
  {
    const start = S.defaultCircuit(), p = await open(desk);
    const st = await snapshot(p);
    ok(st.link === `?${S.encodeCircuit(start)}`, () => `a fresh visit writes the start circuit's link: ${st.link}`);
    ok(S.sameCircuit(st.committed, start) && S.sameCircuit(await linked(p), start), 'a fresh visit shows the start circuit (D16)');
    const g = engine(start).gamma[start.parts.length];
    ok(Math.hypot(g[0], g[1]) < 1e-9, () => `the start circuit's input is matched: |Γ| = ${Math.hypot(g[0], g[1])}`);
    ok(await p.$('[data-empty]') === null && await p.$('[data-start-over]:disabled') !== null && !st.undo,
      'the start state: no empty note, Start over disabled, nothing to undo');
    ok(!(await p.textContent('[data-circuit]')).includes('could not be read'), 'a fresh visit has no link issues');
    for (let i = start.parts.length; i > 0; i--) { await p.click('[data-remove]'); await frame(p); }
    const empty = await snapshot(p);
    ok(empty.committed.parts.length === 0 && (await linked(p)).parts.length === 0, 'every part removed');
    const note = await p.$('[data-empty]');
    ok(note !== null && await note.isVisible() && /Add/.test(await note.textContent()) && /Draw/.test(await note.textContent()),
      'with no parts the empty note says how to add one (Add and Draw)');
    ok(await p.$('[data-card]') === null && await p.$('[data-add]:not(:disabled)') !== null && await p.$('[data-draw]:not(:disabled)') !== null,
      'with no parts Add and Draw work and no card is shown');
    await p.click('[data-start-over]');
    await frame(p);
    const back = await snapshot(p);
    ok(back.link === st.link && back.texts.join('|') === st.texts.join('|') && S.sameCircuit(back.committed, start),
      () => `Start over restores the start circuit: ${back.link}`);
    ok(await p.$('[data-empty]') === null && await p.$('[data-start-over]:disabled') !== null, 'after Start over: no empty note, the button disabled');
    await p.click('[data-undo]');
    await frame(p);
    ok((await snapshot(p)).link === empty.link && await p.$('[data-empty]') !== null, 'one Undo brings the empty circuit back');
    await p.keyboard.press('Control+z');
    await frame(p);
    ok((await linked(p)).parts.length === 1, 'the next Undo brings the circuit before that back');
    await p.keyboard.press('Control+y');
    await p.keyboard.press('Control+y');
    await frame(p);
    ok((await snapshot(p)).link === st.link, 'Redo twice: Start over again');
    ok(p.errors.length === 0, `start and empty state: no errors: ${p.errors.join(' | ')}`);
    await p.close();

    const home = await desk.newPage();
    await home.goto(`${base}/`, { waitUntil: 'networkidle' });
    const card = await home.$('li:has(a[href="/smith-chart/main"])');
    ok(card !== null && /Smith chart/.test(await card.textContent()) && /Electronics/.test(await card.textContent()), 'the main page has the Smith chart card');
    const icon = card && await card.$('svg');
    const box = icon && await icon.boundingBox();
    ok(box && box.width >= 24 && box.height >= 24 && (await icon.$$('circle')).length === 3 && (await icon.$$('path')).length === 2,
      () => `the card's icon renders: ${JSON.stringify(box)}`);
    await home.close();
    for (const width of [390, 320]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      for (const path of ['/', '/smith-chart/main', `/smith-chart/main?${S.encodeCircuit({ ...start, parts: [] })}`]) {
        const q = await ctx.newPage();
        await q.goto(`${base}${path}`, { waitUntil: 'networkidle' });
        await frame(q);
        const sw = await q.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
        ok(sw.s <= sw.c, `${width} px, ${path}: no horizontal scroll (${sw.s} > ${sw.c})`);
        if (path !== '/') {
          // The status note (components/Smith/Status.tsx): present, under the bar and above the tool, inside the
          // screen, its "More" opening the rest without a horizontal scroll.
          const note = await q.evaluate(() => {
            const n = document.getElementById('status'), t = document.getElementById('tool');
            const bar = document.querySelector('header');
            if (!n || !t || !bar) return null;
            const r = n.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, bar: bar.getBoundingClientRect().bottom,
              tool: t.getBoundingClientRect().top, text: n.textContent, more: !!n.querySelector('details > summary'),
              w: document.documentElement.clientWidth };
          });
          ok(note && note.top >= note.bar - 0.5 && note.bottom <= note.tool + 0.5, () => `${width} px, ${path}: the status note is under the bar and above the tool: ${JSON.stringify(note)}`);
          ok(note && note.left >= 0 && note.right <= note.w + 0.5, () => `${width} px, ${path}: the status note fits the screen: ${JSON.stringify(note)}`);
          ok(note && /not yet used for real design work/.test(note.text) && /another source/.test(note.text) && note.more,
            () => `${width} px, ${path}: the status note says how the tool is checked and has More: ${note?.text}`);
          await q.click('#status summary');
          await frame(q);
          const more = await q.evaluate(() => ({ open: document.querySelector('#status details').open, text: document.getElementById('status').innerText,
            s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
          ok(more.open && /ideal parts, lossless lines and a real Z0/.test(more.text) && /real Z0/.test(more.text) && /Still to come/.test(more.text),
            () => `${width} px, ${path}: More shows the assumptions and what is coming: ${more.text}`);
          ok(more.s <= more.c, `${width} px, ${path}: no horizontal scroll with More open (${more.s} > ${more.c})`);
        }
        await q.close();
      }
      await ctx.close();
    }
  }

  if (shots) {
    const wide = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', deviceScaleFactor: 1000 / 1440 });
    const p = await open(wide);
    await mouseDraw(p, P.SHUNT_C, 9e-12, async () => {
      mkdirSync(shots, { recursive: true });
      await p.screenshot({ path: join(shots, 'draw-1440-light.png') });
    });
    const home = await wide.newPage();
    await home.goto(`${base}/`, { waitUntil: 'networkidle' });
    await home.evaluate(() => document.querySelector('a[href="/smith-chart/main"]').scrollIntoView({ block: 'center' }));
    await frame(home);
    await home.screenshot({ path: join(shots, 'home-1440-light.png') });
    await wide.close();
  }
  await desk.close();
} catch (e) {
  ok(false, `the run stopped: ${e.stack ?? e}`);
}


await browser.close();
stopServer();
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`editing: ${passed} of ${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
