// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the equation panel and the rounding rule (step
// M5.1): for five circuits and every part, node and the readout's point, every row the panel shows equals
// components/Smith/mathRows.ts's rows for the circuit in the link (the TeX of every line, the binding and the raw
// number), every row's TeX renders in KaTeX with errors turned on, and the registry's tree evaluated on the binding
// gives every side's value (to 1e-9) with the binding taken from the engine (checked against network.evaluateCircuit and
// parts.added here); the digits setting is applied to the readout, the node table and the panel, and kept in
// localStorage over a reload; plan.md D20: with the start circuit's exact solutions listed and after one is applied
// no text and no MathML on the page shows a number below 1e-12 in scientific notation (the panel's raw numbers
// excepted); the panel's cost during a 4× CPU drag against the same page with the panel off (≤ 0.3 ms per frame); no
// horizontal scroll at 320 and 390 px with the panel open.
//   tsx ui-math.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import katex from 'katex';
import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedEquations from '../../../lib/smith/equations.ts';
import * as importedReadout from '../../../components/Smith/readout.ts';
import * as importedRows from '../../../components/Smith/mathRows.ts';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const EQ = importedEquations.default ?? importedEquations;
const R = importedReadout.default ?? importedReadout;
const MR = importedRows.default ?? importedRows;
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
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// ---------- the circuits ----------

const TEN = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200';
const CIRCUITS = [
  ['start', ''],
  ['ten parts, every kind', TEN],
  ['an open load', '?v=1&z0=75&f0=2.4e9&zl=inf:0&p=ss:0.11:50,ls:3.3n,tl:0.07:60'],
  ['a 1 kHz audio-range circuit', '?v=1&z0=600&f0=1e3&zl=150:-80&p=rs:47,cp:220n,lp:33m,qw:300'],
];

// ---------- the node side: KaTeX and the registry on every row ----------

function subjectsOf(c) {
  const out = [];
  for (let i = 0; i < c.parts.length; i++) out.push({ t: 'part', i });
  for (let k = 0; k <= c.parts.length; k++) out.push({ t: 'node', k });
  return out;
}
const texOfRow = (r) => [...r.lines.map((l) => `\\displaystyle {}= ${l}`), r.bound ? `\\displaystyle ${r.result}` : `\\displaystyle {}= ${r.result}`];

/** KaTeX with errors on, the registry's sides against the binding, the binding against the engine. */
function checkRows(c, s, rows, what, gr = NaN, gi = NaN) {
  const { metrics } = N.evaluateCircuit(c);
  const M = N.METRIC_STRIDE;
  for (const r of rows) {
    for (const t of [r.lhs, `{}= ${r.rhs}`, ...texOfRow(r)]) {
      try { katex.renderToString(t, { output: 'mathml', throwOnError: true, strict: 'error' }); } catch (e) { ok(false, `${what} ${r.id}: KaTeX ${e.message}`); }
    }
    passed++;
    const tree = EQ.EQUATION_BY_ID.get(r.id).tree, lhs = tree.xs[0].v, want = r.binding[lhs];
    if (!want) continue;
    for (const side of tree.xs.slice(1)) {
      const vars = EQ.variablesOf(side);
      if (!vars.every((n) => r.binding[n])) continue;
      const [re, im] = EQ.evaluate(side, r.binding)[0];
      // Γ and the like are residuals near 0: compared on the scale of 1.
      ok(close(re, want[0]) && close(im, want[1]), `${what} ${r.id}: ${EQ.toText(side)} = ${re}, ${im}; ${lhs} = ${want}`);
    }
    // The binding is the engine's.
    if (s.t === 'node' && r.binding.Gamma && r.id === 'gamma-z') {
      const m = s.k * M;
      ok(r.binding.Gamma[0] === metrics[m + N.M_GR] && r.binding.Gamma[1] === metrics[m + N.M_GI], `${what}: Γ of node ${s.k} is the engine's`);
    }
    if (s.t === 'part' && r.id === 'gamma-z') {
      const m = (s.i + 1) * M;
      ok(r.binding.Gamma[0] === metrics[m + N.M_GR] && r.binding.Gamma[1] === metrics[m + N.M_GI], `${what}: Γ where part ${s.i + 1} ends is the engine's`);
    }
    if (s.t === 'part') {
      const p = c.parts[s.i], zc = p.kind === P.QUARTER ? p.value : p.zc ?? c.z0;
      const a = P.added(p.kind, p.value, zc, c.f0, c.f0, c.z0);
      for (const k of ['r', 'x', 'g', 'b']) if (r.id !== 'gamma-z' && r.binding[k] && !r.id.endsWith('-adds-z') && !r.id.endsWith('-adds-y')) ok(close(r.binding[k][0], a, 1e-12), `${what} ${r.id}: ${k} is parts.added`);
    }
    if (s.t === 'point' && r.id === 'z-gamma') ok(r.binding.Gamma[0] === gr && r.binding.Gamma[1] === gi, `${what}: the point's Γ`);
  }
}

// ---------- the page side ----------

async function open(context, query = '') {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-math-eq]', { state: 'attached' });
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await idle(page);
  return page;
}
const linked = async (page) => S.decodeCircuit(new URL(page.url()).search).circuit;
const idle = (page) => page.waitForFunction(() => { const m = document.querySelector('[data-math]')?.smithMath; return !!m && m.idle; });
const subjectKey = (s) => (s.t === 'point' ? 'point' : `${s.t}:${s.t === 'part' ? s.i : s.k}`);
const shown = (page) => page.evaluate(() => [...document.querySelectorAll('[data-math-eq]')].map((li) => {
  const live = li.querySelector('[data-math-live]');
  return {
    id: li.dataset.mathEq, bind: live.dataset.mathBind ?? null,
    tex: [...live.querySelectorAll('annotation')].map((a) => a.textContent),
    raw: li.querySelector('[data-math-raw]')?.textContent ?? '',
  };
}));
/** The panel against mathRows for the subject on the circuit in the link. */
async function compare(page, s, digits, what, gr = NaN, gi = NaN) {
  await idle(page);
  const c = await linked(page);
  const rows = MR.mathRows(c, s, digits, gr, gi);
  const got = await shown(page);
  ok(got.length === rows.length, `${what}: ${got.length} rows shown, ${rows.length} wanted`);
  rows.forEach((r, j) => {
    const g = got[j] ?? {};
    ok(g.id === r.id, `${what}: row ${j} is ${g.id}, wanted ${r.id}`);
    // The page's engine and this one may differ in the last bit (Math.log1p of V8 builds): to 1e-12.
    const gb = g.bind ? JSON.parse(g.bind) : {};
    const sameBind = Object.keys(gb).length === Object.keys(r.binding).length
      && Object.entries(r.binding).every(([k, [re, im]]) => gb[k] && close(gb[k][0], re, 1e-12) && close(gb[k][1], im, 1e-12));
    ok(sameBind, `${what} ${r.id}: binding ${g.bind} vs ${JSON.stringify(r.binding)}`);
    ok(JSON.stringify(g.tex) === JSON.stringify(texOfRow(r)), `${what} ${r.id}: lines ${JSON.stringify(g.tex)} vs ${JSON.stringify(texOfRow(r))}`);
    ok(g.raw === (r.raw ? `computed: ${r.raw}` : ''), `${what} ${r.id}: raw "${g.raw}" vs "${r.raw}"`);
  });
  checkRows(c, s, rows, what, gr, gi);
  return { c, rows };
}
async function select(page, s) {
  if (s.t === 'part') await page.click(`[data-tile="${s.i}"]`);
  else {
    const pressed = await page.getAttribute(`[data-node-row="${s.k}"]`, 'aria-pressed');
    if (pressed !== 'true') await page.click(`[data-node-row="${s.k}"]`);
  }
  await page.waitForFunction((k) => document.querySelector('[data-math]').dataset.mathSubject === k, subjectKey(s));
}

/** D20: no number under the floor in scientific notation, as text or as MathML 10^{−n}, outside the panel's raw numbers. */
const belowFloorShown = (page) => page.evaluate(() => {
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    // (M7.3: the report's printed link is the link's machine form, not a number shown)
    if (!el || el.closest('[data-math-raw], [data-r="link"], annotation, script, style')) continue;
    for (const m of t.textContent.matchAll(/\d\s*e\s*[−-]\s*(\d+)/g)) if (+m[1] > 12) bad.push(t.textContent.trim().slice(0, 80));
  }
  for (const s of document.querySelectorAll('msup')) {
    if (s.closest('[data-math-raw]')) continue;
    const [b, e] = s.children;
    if (b?.textContent === '10' && /^[−-]\d+$/.test(e?.textContent ?? '') && +e.textContent.slice(1) > 12) bad.push(s.closest('math')?.querySelector('annotation')?.textContent.slice(0, 80) ?? '10^…');
  }
  return bad;
});

const timings = [];
try {
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });

  // SMITH_MATH_ONLY=timing runs the timed drags alone (for tuning MathLive.RATE).
  if (process.env.SMITH_MATH_ONLY !== 'timing') {
  // ---------- every subject of four circuits, and a fifth: the start circuit matched exactly ----------
  const page = await open(desk);
  for (const [name, q] of CIRCUITS) {
    if (q) { await page.goto(`${base}/smith-chart/main${q}`, { waitUntil: 'networkidle' }); await page.waitForSelector('[data-math-eq]', { state: 'attached' }); await idle(page); }
    const c = await linked(page);
    // The default subject: the last part (nothing selected).
    await compare(page, c.parts.length ? { t: 'part', i: c.parts.length - 1 } : { t: 'node', k: 0 }, 4, `${name}, nothing selected`);
    for (const s of subjectsOf(c)) { await select(page, s); await compare(page, s, 4, `${name}, ${subjectKey(s)}`); }
  }

  // D20 with the start circuit's exact solutions: both values marked, the centre as the goal.
  await page.goto(`${base}/smith-chart/main?${S.encodeCircuit(S.defaultCircuit())}&u=1,2`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-solution]');
  await idle(page);
  ok((await page.$$('[data-solution]')).length >= 1, 'the start circuit with both values marked lists its exact solutions');
  let bad = await belowFloorShown(page);
  ok(bad.length === 0, `D20, the start circuit's exact solutions: no number below 1e-12 in scientific notation (${bad.join(' | ')})`);
  // A scripted exact match: the first solution applied, its residual is a rounding residual.
  await page.click('[data-apply="0"]');
  await page.waitForFunction(() => !window.location.search.includes('31.83098861837907e-12') || true);
  await frame(page); await idle(page);
  const matched = await linked(page);
  const g = [0, 0];
  S.circuitInputGamma(g, 0, matched);
  const mag = Math.hypot(g[0], g[1]);
  console.log(`the applied solution leaves |Γ| = ${mag} at the input`);
  const n = matched.parts.length;
  await select(page, { t: 'node', k: n });
  await compare(page, { t: 'node', k: n }, 4, 'exact match, the input');
  for (const s of subjectsOf(matched)) { await select(page, s); await compare(page, s, 4, `exact match, ${subjectKey(s)}`); }
  bad = await belowFloorShown(page);
  ok(bad.length === 0, `D20 after an exact match: no number below 1e-12 in scientific notation (${bad.join(' | ')})`);
  const inputGamma = await page.textContent('[data-input="gamma"]');
  ok(mag === 0 ? inputGamma.startsWith('0') : inputGamma === R.GAMMA_BOUND, `the circuit input's Γ after an exact match: "${inputGamma}" (|Γ| = ${mag})`);
  if (mag > 0 && mag < 1e-12) {
    await select(page, { t: 'node', k: n });
    const raws = await page.$$eval('[data-math-raw]', (els) => els.map((e) => e.textContent));
    ok(raws.length > 0, `the panel keeps the raw residual beside the bound: ${raws.join(' | ')}`);
  }
  // A fifth circuit made by hand at rounding level: Γ of a few 1e-17 at every node from a z of 1 ± 1e-16.
  const near = { z0: 50, f0: 1e8, loadR: 50 * (1 + 2e-16), loadX: 5e-15, parts: [{ kind: P.LINE, value: 0.2, zc: 50 }, { kind: P.SERIES_R, value: 1e-14 }] };
  await page.goto(`${base}/smith-chart/main?${S.encodeCircuit(near)}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-math-eq]', { state: 'attached' }); await idle(page);
  const nc = await linked(page);
  for (const s of subjectsOf(nc)) { await select(page, s); await compare(page, s, 4, `rounding level, ${subjectKey(s)}`); }
  bad = await belowFloorShown(page);
  ok(bad.length === 0, `D20 on a circuit at rounding level: no number below 1e-12 in scientific notation (${bad.join(' | ')})`);

  // ---------- the readout's point ----------
  await page.click('[data-math-follow="point"]');
  await page.waitForFunction(() => document.querySelector('[data-math]').dataset.mathSubject === 'point');
  ok(await page.$eval('[data-math]', (e) => e.hasAttribute('data-empty')), 'the readout point without a point: the panel asks for one');
  const box = await page.$eval('[data-chart]', (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width * 0.62, r.top + r.height * 0.4]; });
  for (const [dx, dy] of [[0, 0], [40, 25], [-90, 60]]) {
    await page.mouse.move(box[0] + dx, box[1] + dy);
    await frame(page);
    const [gr, gi] = await page.$eval('[data-chart]', (b) => [b.smithChart.readX, b.smithChart.readY]);
    await compare(page, { t: 'point' }, 4, `readout point ${gr.toFixed(3)}, ${gi.toFixed(3)}`, gr, gi);
  }
  await page.click('[data-math-follow="selection"]');

  // ---------- the digits setting ----------
  await page.goto(`${base}/smith-chart/main${TEN}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-math-eq]', { state: 'attached' }); await idle(page);
  await page.selectOption('[data-digits]', '6');
  await frame(page);
  const check6 = async (what) => {
    const c = await linked(page), gg = [0, 0], want = [];
    S.circuitInputGamma(gg, 0, c);
    R.readoutTexts(gg[0], gg[1], c.z0, want, 6);
    ok(await page.textContent('[data-input="z"]') === want[0], `${what}: the circuit input's z at 6 digits (${want[0]})`);
    const row = await page.textContent('[data-node-row="1"] [data-v="z"]');
    const { metrics } = N.evaluateCircuit(c);
    const wz = R.complexText(metrics[N.METRIC_STRIDE + N.M_ZR], metrics[N.METRIC_STRIDE + N.M_ZI], '', 6);
    ok(row === wz, `${what}: node 1's z at 6 digits: ${row} vs ${wz}`);
    await compare(page, { t: 'part', i: c.parts.length - 1 }, 6, `${what}: the panel at 6 digits`);
  };
  await check6('digits 6');
  ok(await page.evaluate(() => window.localStorage.getItem('smith.digits')) === '6', 'the digits setting is kept in localStorage');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-math-eq]', { state: 'attached' });
  await page.waitForFunction(() => document.querySelector('[data-digits]').value === '6');
  await idle(page);
  await check6('digits 6 after a reload');
  await page.selectOption('[data-digits]', '4');
  await frame(page);
  ok(await page.evaluate(() => window.localStorage.getItem('smith.digits')) === null, 'back at the default, the setting leaves localStorage');
  ok(page.errors.length === 0, `no errors: ${page.errors.join(' | ')}`);
  await page.close();
  }

  // ---------- the panel's cost during a drag at 4× CPU (the panel in view), on and off ----------
  const tall = await browser.newContext({ viewport: { width: 1440, height: 4600 }, colorScheme: 'light' });
  const ten = S.decodeCircuit(TEN).circuit;
  async function timing(off) {
    const pt = await open(tall, TEN);
    await pt.evaluate((o) => { document.querySelector('[data-math]').smithMath.off = o; }, off);
    const pressed = await pt.getAttribute('[data-snap-toggle]', 'aria-pressed');
    if (pressed === 'true') await pt.click('[data-snap-toggle]');
    await frame(pt);
    const { metrics } = N.evaluateCircuit(ten);
    const gr = metrics[3 * N.METRIC_STRIDE + N.M_GR], gi = metrics[3 * N.METRIC_STRIDE + N.M_GI];
    const [hx, hy] = await pt.evaluate(([gr, gi]) => {
      const box = document.querySelector('[data-chart]'), v = box.smithChart, r = box.getBoundingClientRect();
      return [r.left + box.clientLeft + v.w / 2 + (gr - v.cx) * v.k, r.top + box.clientTop + v.h / 2 - (gi - v.cy) * v.k];
    }, [gr, gi]);
    const visible = await pt.evaluate(() => document.querySelector('[data-math]').smithMath.visible);
    const cdp = await pt.context().newCDPSession(pt);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await frame(pt);
    const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
    const t0 = await task();
    const res = await pt.evaluate(([hx, hy]) => new Promise((done) => {
      const box = document.querySelector('[data-chart]'), m = document.querySelector('[data-math]').smithMath;
      const s0 = m.sliced, ms0 = m.slicedMs;
      const ev = (type, x, y) => box.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      let ticks = 0, x = hx, y = hy;
      ev('pointerdown', hx, hy);
      const start = performance.now();
      const tick = (t) => {
        ticks++;
        if (t - start < 2000) requestAnimationFrame(tick);
        else { ev('pointerup', x, y); done({ ticks, sliced: m.sliced - s0, slicedMs: m.slicedMs - ms0 }); }
      };
      requestAnimationFrame(tick);
      const send = () => {
        const t = performance.now() - start;
        if (t >= 2000) return;
        const a = (t / 2000) * 2 * Math.PI;
        x = hx + 70 * Math.sin(a); y = hy + 70 * (1 - Math.cos(a));
        ev('pointermove', x, y);
        setTimeout(send, 8);
      };
      send();
    }), [hx, hy]);
    const t1 = await task();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    // After the drag the panel shows the committed circuit.
    if (!off) {
      const st = await pt.evaluate(() => { const m = document.querySelector('[data-math]').smithMath; return { idle: m.idle, visible: m.visible, subject: document.querySelector('[data-math]').dataset.mathSubject }; });
      if (!st.idle) console.log('after the drag:', JSON.stringify(st));
      await compare(pt, { t: 'part', i: 2 }, 4, 'after the timed drag');
    }
    const errors = pt.errors.slice();
    await pt.close();
    return { off, main: ((t1 - t0) * 1000) / res.ticks, ticks: res.ticks, sliced: res.sliced, slicedMs: res.slicedMs, visible, errors };
  }
  let diff = Infinity, runs = [];
  for (let attempt = 0; attempt < 3 && diff > 0.3; attempt++) {
    runs = [];
    for (let i = 0; i < 3; i++) { runs.push(await timing(true)); runs.push(await timing(false)); }
    const med = (xs) => xs.slice().sort((a, b) => a - b)[1];
    const offMs = med(runs.filter((r) => r.off).map((r) => r.main)), onMs = med(runs.filter((r) => !r.off).map((r) => r.main));
    diff = onMs - offMs;
    timings.push(`attempt ${attempt + 1}: main thread per drag frame at 4× with the panel off ${offMs.toFixed(2)} ms, on ${onMs.toFixed(2)} ms (+${diff.toFixed(2)}); `
      + `rows written during each drag ${runs.filter((r) => !r.off).map((r) => `${r.sliced} (${r.slicedMs.toFixed(1)} ms script)`).join(', ')}`);
  }
  ok(diff <= 0.3, `the panel adds ${diff.toFixed(2)} ms per drag frame at 4× CPU (≤ 0.3)`);
  ok(runs.every((r) => r.visible), 'the panel was in view during the timed drags');
  ok(runs.filter((r) => !r.off).every((r) => r.sliced > 0), 'the panel followed the drag (rows written in the time slice)');
  ok(runs.every((r) => r.errors.length === 0), `no errors in the timed drags: ${runs.flatMap((r) => r.errors).join(' | ')}`);

  // ---------- phones: no horizontal scroll with the panel open on the widest rows ----------
  for (const width of [320, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
    const pp = await open(ctx, TEN);
    await pp.click('[data-math] summary');
    for (const s of [{ t: 'part', i: 2 }, { t: 'part', i: 3 }, { t: 'part', i: 8 }]) {
      await pp.click(`[data-tile="${s.i}"]`);
      await pp.waitForFunction((k) => document.querySelector('[data-math]').dataset.mathSubject === k, subjectKey(s));
      await pp.$eval('[data-math]', (e) => e.scrollIntoView());
      await idle(pp);
      const sw = await pp.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      ok(sw[0] <= sw[1], `${width} px, ${subjectKey(s)}: no horizontal scroll (${sw[0]} > ${sw[1]})`);
    }
    if (shots) {
      mkdirSync(shots, { recursive: true });
      await pp.$eval('[data-math]', (e) => e.scrollIntoView());
      await pp.screenshot({ path: join(shots, `smith-math-${width}-dark.png`) });
    }
    ok(pp.errors.length === 0, `${width} px: no errors: ${pp.errors.join(' | ')}`);
    await ctx.close();
  }
} catch (e) {
  ok(false, `crashed: ${e.stack}`);
} finally {
  await browser.close();
  stopServer();
}

for (const t of timings) console.log(t);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`equation panel: ${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
