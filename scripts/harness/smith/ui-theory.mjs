// Drives /smith-chart/main in the installed Edge (or Chrome) and checks step M3.5b: the Theory and References sections.
// Every live number of the theory (the elements with data-live) equals, character for character, the text of the same
// figure computed here from the engine (network.evaluateCircuit, parts, convert, state) with the page's formatter
// (quantity.formatAmount and readout.complexText, four digits), for the start circuit and for two circuits typed
// through the link, and follows a load typed in its field and an undo. Every equation of theory.md §1–7 is on the page
// in its topic's order and renders (a math element, no KaTeX error), with lines of live numbers; every citation links
// to an entry of the reference list, numbered by first citation over the page; every topic id is an anchor in the
// contents and a #link opens it and lights it up (useReplayHighlight restarts it on a second click); topics fold by
// click, Enter and Space, start open at 1280 px and folded at 390 px; no horizontal scroll at 320 and 390 px with every
// topic open, in both themes; no errors in the console (hydration included).
//   tsx ui-theory.mjs [screenshot folder] [base URL]      (SMITH_SHOTS also names the folder; part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import * as importedQuantity from '../../../lib/quantity.ts';
import * as importedReadout from '../../../components/Smith/readout.ts';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const cv = importedConvert.default ?? importedConvert;
const Q = importedQuantity.default ?? importedQuantity;
const R = importedReadout.default ?? importedReadout;
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
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(typeof what === 'function' ? what() : what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- what theory.md §1–7 asks for ----------

const TOPICS = ['how-to-use', 'gamma-z-y', 'reading-the-chart', 'moving-on-the-chart', 'transmission-lines', 'how-good-is-a-match', 'matching-with-two-parts'];
const EQUATIONS = {
  'how-to-use': [],
  'gamma-z-y': ['z-norm', 'y-norm', 'gamma-z', 'z-gamma', 'gamma-y', 'y-gamma'],
  'reading-the-chart': ['gamma-parts-z', 'r-gamma', 'x-gamma', 'circle-r', 'circle-x', 'gamma-parts-y', 'g-gamma', 'b-gamma', 'circle-g', 'circle-b'],
  'moving-on-the-chart': ['series-adds-z', 'x-series-l', 'x-series-c', 'r-series', 'circle-r', 'shunt-adds-y', 'b-shunt-c', 'b-shunt-l', 'g-shunt', 'circle-g', 'gamma-z', 'abcd-zin', 'mobius', 'line-rotation'],
  'transmission-lines': ['line-theta', 'beta', 'line-rotation', 'line-zin', 'line-circle-b', 'line-circle-centre', 'line-circle-radius', 'quarter-wave', 'quarter-wave-match', 'stub-short-z', 'stub-open-z', 'stub-open-b', 'stub-short-b', 'stub-short-l', 'stub-open-c'],
  'how-good-is-a-match': ['power-reflected', 'power-delivered', 'vswr', 'gamma-vswr', 'z-max', 'z-min', 'return-loss', 'mismatch-loss'],
  'matching-with-two-parts': ['series-adds-z', 'shunt-adds-y', 'circle-r', 'circle-g', 'x-series-c', 'b-shunt-l', 'b-shunt-c', 'q-node', 'q-l-network'],
};
const CITED = ['Ellingson2018', 'WikiSmith', 'SteerVol2', 'SteerVol3', 'WikiMobius'];
const GOAL_VSWR = 1.5;

// ---------- the engine's side: every live number by name ----------

const num = (v) => Q.formatAmount(v, '', 4, true);
const amt = (v, unit) => Q.formatAmount(v, unit, 4, true);
const cx = (re, im, unit = '') => R.complexText(re, im, unit);
const { M_GR, M_GI, M_MAG, M_ANGLE, M_VSWR, M_RL, M_ML, M_Q, M_ZR, M_ZI, M_YR, M_YI, METRIC_STRIDE } = N;
const TURNING = [P.SERIES_L, P.SERIES_C, P.SHUNT_L, P.SHUNT_C, P.STUB_OPEN, P.STUB_SHORT];

function expected(c) {
  const out = new Map();
  const put = (key, text) => out.set(key, text);
  const { metrics } = N.evaluateCircuit(c);
  const m = (k, s) => metrics[k * METRIC_STRIDE + s];
  const n = c.parts.length, z0 = c.z0, f0 = c.f0;
  const zr = m(0, M_ZR), zi = m(0, M_ZI), yr = m(0, M_YR), yi = m(0, M_YI), gr = m(0, M_GR), gi = m(0, M_GI);
  // 1 · 2
  put('input-mag', num(m(n, M_MAG)));
  put('load-Z', cx(zr * z0, zi * z0, 'Ω')); put('load-z', cx(zr, zi)); put('load-y', cx(yr, yi)); put('load-gamma', cx(gr, gi));
  put('load-gamma-polar', `${num(m(0, M_MAG))} ∠ ${num(m(0, M_ANGLE) * 180 / Math.PI)}°`);
  // 3: the circles' centres and radii from their equations
  put('load-r', num(zr)); put('load-x', num(zi)); put('load-g', num(yr)); put('load-b', num(yi));
  put('r-centre', num(zr / (1 + zr))); put('r-radius', num(1 / (1 + zr)));
  put('x-centre', num(1 / zi)); put('x-radius', num(1 / Math.abs(zi)));
  put('g-centre', num(-yr / (1 + yr))); put('g-radius', num(1 / (1 + yr)));
  put('b-centre', num(-1 / yi)); put('b-radius', num(1 / Math.abs(yi)));
  // 4: what each part keeps and changes
  c.parts.forEach((p, i) => {
    const k = p.kind, a = P.added(k, p.value, p.zc ?? z0, f0, f0, z0);
    const turn = a > 0 ? 'clockwise' : a < 0 ? 'counter-clockwise' : 'not at all';
    let kept, from, to, sense = TURNING.includes(k) ? turn : null;
    if (k === P.SERIES_L || k === P.SERIES_C) [kept, from, to] = [num(m(i, M_ZR)), num(m(i, M_ZI)), num(m(i + 1, M_ZI))];
    else if (k === P.SERIES_R) [kept, from, to, sense] = [num(m(i, M_ZI)), num(m(i, M_ZR)), num(m(i + 1, M_ZR)), 'towards Γ = +1'];
    else if (k === P.SHUNT_R) [kept, from, to, sense] = [num(m(i, M_YI)), num(m(i, M_YR)), num(m(i + 1, M_YR)), 'towards Γ = −1'];
    else if (TURNING.includes(k)) [kept, from, to] = [num(m(i, M_YR)), num(m(i, M_YI)), num(m(i + 1, M_YI))];
    else {
      const zc = k === P.QUARTER ? p.value : p.zc ?? z0, Z = [m(i, M_ZR) * z0, m(i, M_ZI) * z0];
      // |Γ| against Zc, written out: |Z − Zc| / |Z + Zc| (1 for the open).
      const mag = Number.isFinite(Z[0]) && Number.isFinite(Z[1]) ? Math.hypot(Z[0] - zc, Z[1]) / Math.hypot(Z[0] + zc, Z[1]) : 1;
      [kept, from, to, sense] = [num(mag), cx(m(i, M_GR), m(i, M_GI)), cx(m(i + 1, M_GR), m(i + 1, M_GI)), 'clockwise'];
      put(`part-${i}-zc`, amt(zc, 'Ω'));
    }
    put(`part-${i}-kept`, kept); put(`part-${i}-from`, from); put(`part-${i}-to`, to); put(`part-${i}-sense`, sense);
  });
  // 5: a λ/8 line of Z0 on the load, the first line or stub, the λ/4 match
  const eg = N.evaluateCircuit({ ...c, parts: [{ kind: P.LINE, value: 0.125, zc: z0 }] }).metrics;
  put('eg-gamma-l', cx(gr, gi)); put('eg-gamma-in', cx(eg[METRIC_STRIDE + M_GR], eg[METRIC_STRIDE + M_GI]));
  put('eg-z-l', cx(zr, zi)); put('eg-z-in', cx(eg[METRIC_STRIDE + M_ZR], eg[METRIC_STRIDE + M_ZI]));
  const li = c.parts.findIndex((p) => p.kind >= P.LINE);
  if (li >= 0) {
    const p = c.parts[li], zc = p.kind === P.QUARTER ? p.value : p.zc ?? z0;
    put('line-part', String(li + 1));
    put('line-theta', num((p.kind === P.QUARTER ? 0.25 : p.value) * 360));
    put('line-zc', amt(zc, 'Ω'));
    put('line-before', cx(m(li, M_GR), m(li, M_GI))); put('line-after', cx(m(li + 1, M_GR), m(li + 1, M_GI)));
    if (p.kind === P.STUB_OPEN || p.kind === P.STUB_SHORT) {
      const t = 2 * Math.PI * p.value;
      put('line-b', num(p.kind === P.STUB_OPEN ? (z0 / zc) * Math.tan(t) : -(z0 / zc) / Math.tan(t)));
    }
  }
  put('qw-rl', amt(c.loadR, 'Ω')); put('qw-z0', amt(z0, 'Ω')); put('qw-zt', amt(Math.sqrt(z0 * c.loadR), 'Ω'));
  // 6: the load and the input; the goal circle
  for (const [k, key] of [[0, 'load'], [n, 'input']]) {
    const mag = m(k, M_MAG), s = (1 + mag) / (1 - mag);
    put(`m-${key}-mag`, num(mag)); put(`m-${key}-vswr`, num(m(k, M_VSWR)));
    put(`m-${key}-rl`, amt(-20 * Math.log10(mag), 'dB')); put(`m-${key}-ml`, amt(-10 * Math.log10(1 - mag * mag), 'dB'));
    put(`m-${key}-ref`, num(mag * mag * 100)); put(`m-${key}-del`, num((1 - mag * mag) * 100));
    put(`m-${key}-zmax`, amt(z0 * s, 'Ω')); put(`m-${key}-zmin`, amt(z0 / s, 'Ω'));
  }
  const goal = (GOAL_VSWR - 1) / (GOAL_VSWR + 1);
  put('goal-mag', num(goal)); put('goal-rl', amt(-20 * Math.log10(goal), 'dB')); put('goal-ref', num(goal * goal * 100));
  put('goal-ml', amt(-10 * Math.log10(1 - goal * goal), 'dB'));
  // 7: the path node by node, the routes, the parts, Q; the start circuit worked through
  for (let k = 0; k <= n; k++) { put(`node-${k}-z`, cx(m(k, M_ZR), m(k, M_ZI))); put(`node-${k}-y`, cx(m(k, M_YR), m(k, M_YI))); }
  put('route-series', zr <= 1 ? 'open' : 'closed'); put('route-shunt', yr <= 1 ? 'open' : 'closed');
  c.parts.forEach((p, i) => {
    const k = p.kind;
    put(`part-${i}-value`, k === P.SERIES_R || k === P.SHUNT_R || k === P.QUARTER ? amt(p.value, 'Ω')
      : k === P.SERIES_L || k === P.SHUNT_L ? amt(p.value, 'H') : k === P.SERIES_C || k === P.SHUNT_C ? amt(p.value, 'F') : `${num(p.value)} λ`);
    if (k <= P.SHUNT_C || k === P.STUB_OPEN || k === P.STUB_SHORT) put(`part-${i}-added`, num(P.added(k, p.value, p.zc ?? z0, f0, f0, z0)));
  });
  put('load-q', num(Math.abs(zi) / zr));
  const st = S.defaultCircuit(), sm = N.evaluateCircuit(st).metrics, w = 2 * Math.PI * st.f0;
  const s = (k, slot) => sm[k * METRIC_STRIDE + slot];
  put('start-load-z', cx(s(0, M_ZR), s(0, M_ZI))); put('start-load-y', cx(s(0, M_YR), s(0, M_YI)));
  put('start-x', num(-1 / (w * st.parts[0].value * st.z0))); put('start-b', num(-st.z0 / (w * st.parts[1].value)));
  put('start-node1-z', cx(s(1, M_ZR), s(1, M_ZI))); put('start-node1-y', cx(s(1, M_YR), s(1, M_YI))); put('start-input-y', cx(s(2, M_YR), s(2, M_YI)));
  put('start-c', amt(st.parts[0].value, 'F')); put('start-l', amt(st.parts[1].value, 'H'));
  put('start-shunt-c', amt(1 / (w * st.z0), 'F')); put('start-q', num(Math.abs(s(0, M_ZI)) / s(0, M_ZR)));
  return out;
}

// ---------- the page's side ----------

async function open(context, c, hash = '') {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') page.errors.push(msg.text()); });
  await page.goto(`${base}/smith-chart/main${c ? `?${S.encodeCircuit(c)}` : ''}${hash}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-theory]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
  return page;
}
const linked = async (page) => S.decodeCircuit(new URL(page.url()).search).circuit;
const lives = (page) => page.$$eval('[data-live]', (els) => els.map((e) => [e.getAttribute('data-live'), e.textContent]));

async function checkLive(page, c, what) {
  const want = expected(c), got = await lives(page), seen = new Set();
  for (const [key, text] of got) {
    seen.add(key);
    ok(want.has(key), `${what}: live number ${key} is one the harness knows`);
    if (want.has(key)) ok(text === want.get(key), () => `${what}: ${key} shows "${text}", the engine gives "${want.get(key)}"`);
  }
  for (const key of want.keys()) ok(seen.has(key), `${what}: live number ${key} is on the page`);
  return got.length;
}

async function checkEquations(page, what) {
  const found = await page.evaluate(() => [...document.querySelectorAll('[data-topic]')].map((t) => ({
    id: t.id,
    eqs: [...t.querySelectorAll('[data-eq]')].map((e) => ({ id: e.getAttribute('data-eq'), maths: e.querySelectorAll('math').length, live: !!e.querySelector('[data-eq-live]') })),
  })));
  const errors = await page.evaluate(() => document.querySelectorAll('[data-theory] .katex-error, [data-theory] merror').length);
  ok(errors === 0, `${what}: no KaTeX error nodes (${errors})`);
  let lines = 0;
  for (const t of found) {
    ok(JSON.stringify(t.eqs.map((e) => e.id)) === JSON.stringify(EQUATIONS[t.id]), () => `${what}: topic ${t.id} shows ${t.eqs.map((e) => e.id).join(', ')}`);
    for (const e of t.eqs) { ok(e.maths === (e.live ? 2 : 1), `${what}: ${t.id} ${e.id} renders as MathML`); if (e.live) lines++; }
  }
  return lines;
}

const typeLoad = async (page, field, text) => {
  await page.fill(`[data-name="${field}"] input`, text);
  await page.keyboard.press('Tab');
  await frame(page);
};
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const openState = (page) => page.$$eval('[data-topic]', (els) => els.map((e) => e.open));
const animated = (page, id) => page.evaluate((i) => {
  const a = document.getElementById(i).getAnimations();
  return a.length ? a[0].currentTime : -1;
}, id);

const C1 = {
  z0: 75, f0: 2.4e9, loadR: 120, loadX: -60,
  parts: [{ kind: P.SERIES_L, value: 5e-9 }, { kind: P.LINE, value: 0.1, zc: 60 }, { kind: P.SHUNT_C, value: 1e-12 }, { kind: P.STUB_SHORT, value: 0.2, zc: 50 }],
};
const C2 = {
  z0: 50, f0: 1e9, loadR: 10, loadX: 5,
  parts: [{ kind: P.QUARTER, value: 30 }, { kind: P.SHUNT_R, value: 200 }, { kind: P.SERIES_R, value: 15 }, { kind: P.STUB_OPEN, value: 0.3, zc: 70 }, { kind: P.SERIES_C, value: 4e-12 }, { kind: P.SHUNT_L, value: 12e-9 }],
};

const counts = {};
try {
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });

  // ---------- the start circuit: live numbers, equations, citations, topics ----------
  const p0 = await open(desk);
  ok(S.sameCircuit(await linked(p0), S.defaultCircuit()), 'a fresh visit shows the start circuit');
  counts.live = await checkLive(p0, S.defaultCircuit(), 'start');
  counts.lines = await checkEquations(p0, 'start');
  ok(JSON.stringify(await p0.$$eval('[data-topic]', (els) => els.map((e) => e.id))) === JSON.stringify(TOPICS), 'the seven topics in the order of theory.md');
  ok((await openState(p0)).every(Boolean), 'at 1280 px every topic starts open');
  const contents = await p0.$$eval('[data-theory] ol a[href^="#"]', (els) => els.map((e) => e.getAttribute('href')));
  ok(JSON.stringify(contents.slice(0, 7)) === JSON.stringify(TOPICS.map((t) => `#${t}`)), 'the contents link every topic id');
  const nav = await p0.$$eval('nav[aria-label="Sections"] a', (els) => els.map((e) => [e.getAttribute('href'), e.textContent]));
  ok(JSON.stringify(nav) === JSON.stringify([['#tool', 'Tool'], ['#theory', 'Theory'], ['#references', 'References']]), 'the bar has the section nav');
  for (const [href] of nav) ok(await p0.$(href) !== null, `section ${href} exists`);

  // Citations: every link resolves to an entry; numbered by first citation; the list in that order.
  const cites = await p0.$$eval('[data-theory] a[data-cite]', (els) => els.map((e) => [e.getAttribute('data-cite'), e.getAttribute('href'), e.textContent]));
  const order = [];
  for (const [key, href, text] of cites) {
    ok(href === `#ref-${key}`, `citation of ${key} links to its entry`);
    if (!order.includes(key)) order.push(key);
    ok(text.startsWith(`[${order.indexOf(key) + 1}, `), () => `citation "${text}" of ${key} has number ${order.indexOf(key) + 1}`);
  }
  ok(JSON.stringify([...order].sort()) === JSON.stringify([...CITED].sort()), () => `the theory cites ${order.join(', ')}`);
  const refs = await p0.$$eval('[data-references] li', (els) => els.map((e) => [e.id, e.querySelector('span').textContent]));
  ok(JSON.stringify(refs) === JSON.stringify(order.map((k, i) => [`ref-${k}`, `[${i + 1}]`])), () => `the reference list follows the first citations (${refs.map((r) => r[0]).join(', ')})`);
  for (const key of order) ok(await p0.$(`[data-references] #ref-${key}`) !== null, `#ref-${key} resolves`);
  counts.cites = cites.length;

  // A citation's link jumps to its entry.
  await p0.click('[data-theory] a[data-cite="WikiMobius"]');
  await frame(p0);
  ok(await p0.evaluate(() => window.location.hash === '#ref-WikiMobius' && document.querySelector('#ref-WikiMobius:target') !== null), 'a citation link makes its entry the target');
  ok(p0.errors.length === 0, () => `start: no errors in the console (${p0.errors.join(' | ')})`);
  await p0.close();

  // ---------- two circuits through the link; a load typed and an undo ----------
  for (const [name, c] of [['C1', C1], ['C2', C2]]) {
    const p = await open(desk, c);
    ok(S.sameCircuit(await linked(p), c), `${name}: the link gives the circuit`);
    await checkLive(p, c, name);
    await checkEquations(p, name);
    ok(p.errors.length === 0, () => `${name}: no errors in the console (${p.errors.join(' | ')})`);
    if (name === 'C1') {
      await typeLoad(p, 'loadR', '40');
      const after = await linked(p);
      ok(after.loadR === 40, 'C1: the typed load is in the link');
      await checkLive(p, after, 'C1 with R = 40 Ω');
      await typeLoad(p, 'loadX', '35');
      await checkLive(p, await linked(p), 'C1 with X = 35 Ω');
      await p.keyboard.press('Control+z');
      await frame(p);
      await checkLive(p, await linked(p), 'C1 after an undo');
      ok((await linked(p)).loadX === -60, 'C1: the undo took the reactance back');
    }
    await p.close();
  }

  // ---------- folding at 390 px; #links; no horizontal scroll ----------
  for (const scheme of ['light', 'dark']) {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    const p = await open(phone);
    ok((await openState(p)).every((o) => !o), `${scheme} 390 px: every topic starts folded`);
    await p.click('#gamma-z-y > summary');
    ok((await openState(p))[1] === true, `${scheme} 390 px: a click opens a topic`);
    await p.click('#gamma-z-y > summary');
    ok((await openState(p))[1] === false, `${scheme} 390 px: a second click folds it`);
    await p.focus('#reading-the-chart > summary');
    await p.keyboard.press('Enter');
    ok((await openState(p))[2] === true, `${scheme} 390 px: Enter opens a topic`);
    await p.keyboard.press('Space');
    ok((await openState(p))[2] === false, `${scheme} 390 px: Space folds it`);
    // A contents link opens its topic, makes it the target and lights it up; a second click replays the light.
    await p.click('[data-theory] ol a[href="#transmission-lines"]');
    await frame(p);
    ok((await openState(p))[4] === true, `${scheme} 390 px: a contents link opens its topic`);
    ok(await p.evaluate(() => window.location.hash === '#transmission-lines' && !!document.querySelector('#transmission-lines:target')), `${scheme}: the topic is the target`);
    ok(await animated(p, 'transmission-lines') >= 0, `${scheme}: the topic lights up`);
    await sleep(1200);
    await p.click('[data-theory] ol a[href="#transmission-lines"]');
    await frame(p);
    const t = await animated(p, 'transmission-lines');
    ok(t >= 0 && t < 600, () => `${scheme}: a second click replays the light (time ${t})`);
    // Every topic open: no horizontal scroll at 390 and 320 px.
    await p.click('[data-open-all]');
    await frame(p);
    ok((await openState(p)).every(Boolean), `${scheme}: Open all opens every topic`);
    ok(await noScroll(p), `${scheme} 390 px: no horizontal scroll with every topic open`);
    await p.setViewportSize({ width: 320, height: 700 });
    await frame(p);
    ok(await noScroll(p), `${scheme} 320 px: no horizontal scroll with every topic open`);
    await p.click('[data-fold-all]');
    ok((await openState(p)).every((o) => !o), `${scheme}: Fold all folds every topic`);
    ok(p.errors.length === 0, () => `${scheme} phone: no errors in the console (${p.errors.join(' | ')})`);
    await p.close();

    // A #link from elsewhere opens only its topic, lit up.
    const q = await open(phone, null, '#moving-on-the-chart');
    const states = await openState(q);
    ok(states[3] === true && states.filter(Boolean).length === 1, () => `${scheme} 390 px: #moving-on-the-chart opens only that topic (${states})`);
    ok(await animated(q, 'moving-on-the-chart') >= 0, `${scheme}: the linked topic lights up`);
    ok(await q.evaluate(() => { const r = document.getElementById('moving-on-the-chart').getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; }), `${scheme}: the linked topic is in view`);
    // A link to another topic while the page is open (hashchange) opens it too.
    await q.evaluate(() => { window.location.hash = '#how-good-is-a-match'; });
    await frame(q);
    ok((await openState(q))[5] === true, `${scheme}: a hash change opens its topic`);
    await q.close();
    await phone.close();
  }

  if (shots) {
    mkdirSync(shots, { recursive: true });
    const wide = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', deviceScaleFactor: 1000 / 1440 });
    const w = await open(wide, null, '#moving-on-the-chart');
    await sleep(3200);
    await w.locator('#moving-on-the-chart').screenshot({ path: join(shots, 'theory-moving-1440-light.png') });
    await wide.close();
    const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const d = await open(dark, null, '#moving-on-the-chart');
    await sleep(3200);
    await d.locator('#moving-on-the-chart').screenshot({ path: join(shots, 'theory-moving-390-dark.png') });
    await dark.close();
  }
  await desk.close();
} catch (e) {
  ok(false, `the run stopped: ${e.stack ?? e}`);
}

await browser.close();
stopServer();
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`theory: ${counts.live} live numbers, ${counts.lines} equation lines with live numbers and ${counts.cites} citations on the start circuit`);
console.log(`theory: ${passed} of ${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
