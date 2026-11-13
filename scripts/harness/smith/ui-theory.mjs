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
import * as importedSolve from '../../../lib/smith/solve.ts';
import * as importedValues from '../../../lib/smith/values.ts';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const cv = importedConvert.default ?? importedConvert;
const Q = importedQuantity.default ?? importedQuantity;
const R = importedReadout.default ?? importedReadout;
const SV = importedSolve.default ?? importedSolve;
const V = importedValues.default ?? importedValues;
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

const TOPICS = ['how-to-use', 'gamma-z-y', 'reading-the-chart', 'moving-on-the-chart', 'transmission-lines', 'how-good-is-a-match', 'matching-with-two-parts',
  'two-one-or-none', 'one-value-and-a-point', 'realisable-values'];
const EQUATIONS = {
  'how-to-use': [],
  'gamma-z-y': ['z-norm', 'y-norm', 'gamma-z', 'z-gamma', 'gamma-y', 'y-gamma'],
  'reading-the-chart': ['gamma-parts-z', 'r-gamma', 'x-gamma', 'circle-r', 'circle-x', 'z-parts', 'gamma-parts-y', 'y-parts', 'g-gamma', 'b-gamma', 'circle-g', 'circle-b'],
  'moving-on-the-chart': ['series-adds-z', 'x-series-l', 'x-series-c', 'r-series', 'circle-r', 'shunt-adds-y', 'b-shunt-c', 'b-shunt-l', 'g-shunt', 'circle-g', 'gamma-z', 'abcd-zin', 'mobius', 'line-rotation'],
  'transmission-lines': ['line-theta', 'beta', 'line-rotation', 'line-zin', 'line-circle-b', 'line-circle-centre', 'line-circle-radius', 'quarter-wave', 'quarter-wave-match', 'stub-short-z', 'stub-open-z', 'stub-open-b', 'stub-short-b', 'stub-short-l', 'stub-open-c'],
  'how-good-is-a-match': ['power-reflected', 'power-delivered', 'vswr', 'gamma-vswr', 'z-max', 'z-min', 'return-loss', 'mismatch-loss'],
  'matching-with-two-parts': ['series-adds-z', 'shunt-adds-y', 'circle-r', 'circle-g', 'match-two-parts', 'x-series-c', 'b-shunt-l', 'b-shunt-c', 'q-node', 'q-l-network'],
  // M4.3c: theory-solver.md §9–§11, in the order of the page.
  'two-one-or-none': ['series-adds-z', 'shunt-adds-y', 'circle-r', 'circle-g', 'mobius', 'x-series-c', 'b-shunt-c', 'b-shunt-l'],
  'one-value-and-a-point': ['gamma-z', 'circle-r', 'mismatch-to-target', 'x-series-c', 'gamma-vswr'],
  'realisable-values': ['x-series-l', 'x-series-c', 'b-shunt-l', 'b-shunt-c', 'quarter-wave', 'line-rotation', 'line-theta', 'beta', 'vswr', 'return-loss'],
};
const CITED = ['Ellingson2018', 'WikiSmith', 'SteerVol2', 'SteerVol3', 'WikiMobius', 'WikiE', 'JohansonHighQ', 'WurthWEKI'];
const GOAL_VSWR = 1.5;

// ---------- the engine's side: every live number by name ----------

// Residuals at rounding level as the bound of plan.md D20 (the page's rule in lib/quantity.ts).
const num = (v) => Q.formatResidual(v, '', 4);
const amt = (v, unit) => Q.formatResidual(v, unit, 4);
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
    put(`m-${key}-rl`, Q.formatReturnLoss(-20 * Math.log10(mag), 4)); put(`m-${key}-ml`, amt(-10 * Math.log10(1 - mag * mag), 'dB'));
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
  for (const [key, text] of solverExpected(c)) put(key, text);
  return out;
}

// ---------- M4.3c: the solver's topics (theory-solver.md §9–§11), from solve.ts and values.ts ----------

const KIND_WORDS = ['series R', 'series L', 'series C', 'shunt R', 'shunt L', 'shunt C', 'line', 'open stub', 'short stub', 'λ/4 transformer'];
const unitValue = (k, v) => (k === P.SERIES_R || k === P.SHUNT_R || k === P.QUARTER ? amt(v, 'Ω') : k === P.SERIES_L || k === P.SHUNT_L ? amt(v, 'H')
  : k === P.SERIES_C || k === P.SHUNT_C ? amt(v, 'F') : `${num(v)} λ`);
const gammaWords = (g) => num(g);
function valueWords(c, v) {
  if (v.param === 'f0') return `f0 ${amt(v.value, 'Hz')}`;
  if (v.param === 'zc') return `part ${v.part + 1}’s Zc ${amt(v.value, 'Ω')}`;
  const k = v.kind;
  const sym = k === P.SERIES_R ? 'r' : k === P.SHUNT_R ? 'g' : k === P.SERIES_L || k === P.SERIES_C ? 'x' : k === P.LINE || k === P.QUARTER ? '' : 'b';
  const series = k <= P.SERIES_C || k === P.LINE || k === P.QUARTER;
  const what = !sym ? '' : v.added === 0 ? ` (${sym} = 0: ${series ? 'a plain connection' : 'no part'})` : ` (${sym} = ${num(v.added)})`;
  return `part ${v.part + 1}: ${KIND_WORDS[k]} ${unitValue(k, v.value)}${what}${k !== c.parts[v.part].kind ? ' as the other kind' : ''}${v.swapped ? ', true at this frequency only' : ''}${v.period > 0 ? ', + λ/2 gives the same at f0' : ''}`;
}
// A generalised circle [a, bx, by, c]: a(x² + y²) − 2(bx·x + by·y) + c = 0 has centre (bx, by)/a.
// A centre within 1e-12 (relative) of an axis is on it (rounding).
function circ(k, o) {
  if (!(Math.abs(k[o]) > 1e-12)) return null;
  const x = k[o + 1] / k[o], y = k[o + 2] / k[o], r = Math.sqrt(Math.max(0, k[o + 1] ** 2 + k[o + 2] ** 2 - k[o] * k[o + 3])) / Math.abs(k[o]);
  const tiny = 1e-12 * Math.max(1, Math.abs(x), r);
  return { x: Math.abs(x) <= tiny ? 0 : x, y: Math.abs(y) <= tiny ? 0 : y, r };
}
const circleWords = (k, o) => { const q = circ(k, o); return q ? `centre ${cx(q.x, q.y)}, radius ${num(q.r)}` : 'a straight line'; };
function statusWords(r) {
  if (r.status === 'solved') return r.solutions.length === 1 ? 'one solution' : `${r.solutions.length === 2 ? 'two' : r.solutions.length} solutions`;
  if (r.status === 'none') return r.sameJob ? 'none: the two parts do the same job' : 'no solution';
  if (r.status === 'coincident') return r.sameJob ? 'the two parts do the same job: any value of one has one of the other' : 'every value works';
  return r.status;
}
function rangeWords(c, r, g) {
  const u = r.unknowns[0];
  if (u.param === 'f0') return `f0 from ${amt(g.min, 'Hz')} to ${amt(g.max, 'Hz')}`;
  if (u.param === 'zc') return `Zc from ${amt(g.min, 'Ω')} to ${amt(g.max, 'Ω')}`;
  const k = g.kind >= 0 ? g.kind : c.parts[u.part].kind;
  return `${KIND_WORDS[k]} from ${unitValue(k, g.min)} to ${unitValue(k, g.max)}${g.swapped ? ', true at this frequency only' : ''}`;
}
const variantWords = (s, v) => v.values.map((x, j) => (s.values[j].param === 'f0' ? amt(x, 'Hz') : s.values[j].param === 'zc' ? amt(x, 'Ω') : unitValue(s.values[j].kind, x))).join(' · ');
const vswrOf = (m) => (1 + m) / (1 - m);
const distinct = (list) => list.filter((s, i) => !list.slice(0, i).some((t) => t.values.every((v, j) => v.kind === s.values[j].kind && Object.is(v.value, s.values[j].value))));

function solverExpected(c) {
  const out = new Map(), put = (k, t) => out.set(k, t);
  const st = S.defaultCircuit(), both = [{ part: 0, param: 'value' }, { part: 1, param: 'value' }], first = [{ part: 0, param: 'value' }];
  const centre = { kind: 'point' }, vs = { kind: 'vswr', value: 1.5, within: true };
  const ask = S.askOf(c);
  const r = ask.unknowns.length ? SV.solve(c, ask.unknowns, ask.goal) : null;
  // §9, the start example's text.
  const two = SV.solve(st, both, centre), c1 = circ(two.circles, 0), c2 = circ(two.circles, 4);
  put('sv9-c1-centre', num(c1.x)); put('sv9-c1-radius', num(c1.r)); put('sv9-c2-centre', num(c2.x)); put('sv9-c2-radius', num(c2.r));
  put('sv9-d', num(Math.hypot(c1.x - c2.x, c1.y - c2.y))); put('sv9-diff', num(Math.abs(c1.r - c2.r))); put('sv9-sum', num(c1.r + c2.r));
  const [s1, s2] = two.solutions;
  put('sv9-s1-c', amt(s1.values[0].value, 'F')); put('sv9-s1-l', amt(s1.values[1].value, 'H'));
  put('sv9-s2-x', num(s2.values[0].added)); put('sv9-s2-b', num(s2.values[1].added)); put('sv9-s2-c', amt(s2.values[1].value, 'F'));
  put('sv9-s1-gamma', gammaWords(s1.gamma));
  const r50 = SV.solve({ ...st, loadR: 50 }, both, centre);
  put('sv9-r50-c', amt(r50.solutions[0].values[0].value, 'F')); put('sv9-r50-l', amt(r50.solutions[0].values[1].value, 'H'));
  put('sv9-r100', statusWords(SV.solve({ ...st, loadR: 100 }, both, centre)));
  const fam = SV.solve(st, both, vs), ft = Math.atan(P.added(st.parts[0].kind, st.parts[0].value, st.z0, st.f0, st.f0, st.z0)), mem = fam.family.at(ft);
  put('sv9-fam-c', amt(mem[0].values[0].value, 'F')); put('sv9-fam-l0', amt(mem[0].values[1].value, 'H')); put('sv9-fam-l1', amt(mem[1].values[1].value, 'H'));
  put('sv9-fam-min', amt(fam.ranges[0].min, 'F')); put('sv9-fam-max', amt(fam.ranges[0].max, 'F'));
  // §9 boxes: the visitor's two unknowns and a point target, or the start example; the family likewise.
  const twoMine = r && r.unknowns.length === 2 && ask.goal.kind === 'point' && r.circleNode >= 0;
  const tr = twoMine ? r : two, tc = twoMine ? c : st;
  put('b9-status', statusWords(tr)); put('b9-c1', circleWords(tr.circles, 0)); put('b9-c2', circleWords(tr.circles, 4));
  const p1 = circ(tr.circles, 0), p2 = circ(tr.circles, 4);
  if (p1 && p2) {
    const dd = Math.hypot(p1.x - p2.x, p1.y - p2.y), sum = p1.r + p2.r, diff = Math.abs(p1.r - p2.r), tol = 1e-9 * Math.max(1, sum);
    put('b9-d', num(dd)); put('b9-sum', num(sum)); put('b9-diff', num(diff));
    put('b9-case', Math.abs(dd - sum) <= tol || Math.abs(dd - diff) <= tol ? 'they touch: one point' : dd < sum && dd > diff ? 'they cross twice' : 'they miss');
  }
  tr.solutions.forEach((s, k) => { s.values.forEach((v, j) => put(`b9-s${k}-v${j}`, valueWords(tc, v))); put(`b9-s${k}-gamma`, gammaWords(s.gamma)); });
  const famMine = r && r.status === 'family' && r.family && r.ranges.length > 0;
  const fr = famMine ? r : fam, fc = famMine ? c : st, fm = famMine ? r.family.at(0.5 * (r.ranges[0].t0 + r.ranges[0].t1)) : mem;
  if (fm.length) { put('b9f-first', valueWords(fc, fm[0].values[0])); fm.forEach((s, i) => put(`b9f-m${i}`, valueWords(fc, s.values[1]))); } else put('b9f-none', 'No member at this value.');
  fr.ranges.forEach((g, k) => put(`b9f-r${k}`, rangeWords(fc, fr, g)));
  // §10.
  const best = SV.solve(st, first, { kind: 'point', node: 1 }), b0 = best.solutions[0];
  put('sv10-x', num(b0.values[0].added)); put('sv10-c', amt(b0.values[0].value, 'F')); put('sv10-m', num(b0.mismatch)); put('sv10-vswr', num(vswrOf(b0.mismatch)));
  const range = SV.solve(st, first, vs);
  put('sv10-min', amt(range.ranges[0].min, 'F')); put('sv10-max', amt(range.ranges[0].max, 'F'));
  SV.solve(st, first, { kind: 'g', value: 1, node: 1 }).solutions.forEach((s, k) => put(`sv10-g${k}`, valueWords(st, s.values[0])));
  const bestMine = r && r.status === 'best' && r.solutions.length > 0;
  const br = bestMine ? r : best, bc = bestMine ? c : st;
  put('b10-v', valueWords(bc, br.solutions[0].values[0])); put('b10-m', num(br.solutions[0].mismatch)); put('b10-vswr', num(vswrOf(br.solutions[0].mismatch)));
  if (br.circleNode >= 0) { put('b10-c1', circleWords(br.circles, 0)); put('b10-c2', circleWords(br.circles, 4)); }
  const rangeMine = r && r.status === 'range';
  const rr = rangeMine ? r : range, rc = rangeMine ? c : st;
  if (rr.ranges.length) rr.ranges.forEach((g, k) => put(`b10r-r${k}`, rangeWords(rc, rr, g))); else put('b10r-none', 'No value keeps the goal.');
  // §11: the E24 variants of the start match; the box with the visitor's solutions and the page's lists (the default here).
  const vars = V.standardVariants(st, centre, s1, V.defaultChoice());
  put('sv11-s2-c', amt(s2.values[1].value, 'F'));
  for (const [j, key] of [[0, 'c'], [1, 'l']]) {
    const xs = vars.map((v) => v.values[j]), u = j ? 'H' : 'F';
    put(`sv11-${key}-lo`, amt(Math.min(...xs), u)); put(`sv11-${key}-hi`, amt(Math.max(...xs), u));
  }
  vars.forEach((v, j) => { put(`sv11-v${j}`, variantWords(s1, v)); put(`sv11-v${j}-gamma`, num(v.gamma)); });
  put('sv11-v0-vswr', num(vswrOf(vars[0].gamma))); put('sv11-v0-rl', amt(-20 * Math.log10(vars[0].gamma), 'dB'));
  put(`sv11-v${vars.length - 1}-vswr`, num(vswrOf(vars[vars.length - 1].gamma)));
  const mine = r ? (r.status === 'family' && r.family ? distinct(r.family.ends) : r.solutions) : [];
  const ls = mine.length ? mine : two.solutions, lc = mine.length ? c : st, lg = mine.length ? ask.goal : centre;
  ls.forEach((s, k) => s.values.forEach((v, j) => put(`b11-s${k}-v${j}`, valueWords(lc, v))));
  put('b11-lists', 'R E24 · L E24 · C E24 · Zt, Zc any value');
  const lv = V.standardVariants(lc, lg, ls[0], V.defaultChoice()).filter((v) => !v.exact);
  if (lv.length) lv.forEach((v, j) => { put(`b11-v${j}`, variantWords(ls[0], v)); put(`b11-v${j}-gamma`, num(v.gamma)); });
  else put('b11-none', 'No standard values differ from the solution’s own.');
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
  // The theory renders deferred (and its solver topics after the Solve panel's outcome): wait up to 3 s for it to agree.
  const want = expected(c), same = (g) => g.length === want.size && g.every(([k, t]) => want.get(k) === t);
  let got = await lives(page);
  for (let i = 0; i < 30 && !same(got); i++) { await sleep(100); got = await lives(page); }
  const seen = new Set();
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
    eqs: [...t.querySelectorAll('[data-eq]')].map((e) => ({ id: e.getAttribute('data-eq'), maths: e.querySelectorAll('math').length, live: e.querySelectorAll('[data-eq-live]').length })),
  })));
  const errors = await page.evaluate(() => document.querySelectorAll('[data-theory] .katex-error, [data-theory] merror').length);
  ok(errors === 0, `${what}: no KaTeX error nodes (${errors})`);
  let lines = 0;
  for (const t of found) {
    ok(JSON.stringify(t.eqs.map((e) => e.id)) === JSON.stringify(EQUATIONS[t.id]), () => `${what}: topic ${t.id} shows ${t.eqs.map((e) => e.id).join(', ')}`);
    // With numbers: the equation and one line per substitution (aligned rows: the symbol, its right side, the lines).
    for (const e of t.eqs) { ok(e.live ? e.maths === e.live + 1 || e.maths === e.live + 2 : e.maths === 1, `${what}: ${t.id} ${e.id} renders as MathML`); if (e.live) lines++; }
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
  // M4.3c: two unknowns and the centre (the solver topics' "Your circuit" for the circles and the standard values).
  ask: { unknowns: [{ part: 0, param: 'value' }, { part: 2, param: 'value' }], goal: { kind: 'point' } },
};
const C2 = {
  z0: 50, f0: 1e9, loadR: 10, loadX: 5,
  parts: [{ kind: P.QUARTER, value: 30 }, { kind: P.SHUNT_R, value: 200 }, { kind: P.SERIES_R, value: 15 }, { kind: P.STUB_OPEN, value: 0.3, zc: 70 }, { kind: P.SERIES_C, value: 4e-12 }, { kind: P.SHUNT_L, value: 12e-9 }],
  // M4.3c: one unknown and VSWR ≤ 2 at the input (the range box).
  ask: { unknowns: [{ part: 4, param: 'value' }], goal: { kind: 'vswr', value: 2, within: true } },
};
// M4.3c: the start network with one unknown and a point target (the nearest value) and with two and a circle (a family).
const C3 = { ...S.defaultCircuit(), loadR: 30, loadX: 40, ask: { unknowns: [{ part: 1, param: 'value' }], goal: { kind: 'point' } } };
const C4 = { ...S.defaultCircuit(), loadR: 20, loadX: -10, ask: { unknowns: [{ part: 0, param: 'value' }, { part: 1, param: 'value' }], goal: { kind: 'mag', value: 0.2, within: true } } };

const counts = {};
try {
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });

  // ---------- the start circuit: live numbers, equations, citations, topics ----------
  const p0 = await open(desk);
  ok(S.sameCircuit(await linked(p0), S.defaultCircuit()), 'a fresh visit shows the start circuit');
  counts.live = await checkLive(p0, S.defaultCircuit(), 'start');
  counts.lines = await checkEquations(p0, 'start');
  ok(JSON.stringify(await p0.$$eval('[data-topic]', (els) => els.map((e) => e.id))) === JSON.stringify(TOPICS), 'the ten topics in the order of theory.md and theory-solver.md');
  ok((await openState(p0)).every(Boolean), 'at 1280 px every topic starts open');
  const contents = await p0.$$eval('[data-theory] ol a[href^="#"]', (els) => els.map((e) => e.getAttribute('href')));
  ok(JSON.stringify(contents.slice(0, TOPICS.length)) === JSON.stringify(TOPICS.map((t) => `#${t}`)), 'the contents link every topic id');
  const nav = await p0.$$eval('nav[aria-label="Sections"] a', (els) => els.map((e) => [e.getAttribute('href'), e.textContent]));
  ok(JSON.stringify(nav) === JSON.stringify([['#tool', 'Tool'], ['#learn', 'Learn'], ['#theory', 'Theory'], ['#references', 'References']]), 'the bar has the section nav (M6.3a: with Learn)');
  for (const [href] of nav) ok(await p0.$(href) !== null, `section ${href} exists`);

  // Citations: every link resolves to an entry; numbered by first citation; the list in that order.
  const cites = await p0.$$eval('[data-theory] a[data-cite]', (els) => els.map((e) => [e.getAttribute('data-cite'), e.getAttribute('href'), e.textContent.replace(/ /g, ' ')]));
  const order = [];
  for (const [key, href, text] of cites) {
    ok(href === `#ref-${key}`, `citation of ${key} links to its entry`);
    if (!order.includes(key)) order.push(key);
    ok(text.startsWith(`[${order.indexOf(key) + 1}, `) || text === `[${order.indexOf(key) + 1}]`, () => `citation "${text}" of ${key} has number ${order.indexOf(key) + 1}`);
  }
  ok(JSON.stringify([...order].sort()) === JSON.stringify([...CITED].sort()), () => `the theory cites ${order.join(', ')}`);
  const refs = await p0.$$eval('[data-references] li', (els) => els.map((e) => [e.id, e.querySelector('span').textContent]));
  ok(JSON.stringify(refs) === JSON.stringify(order.map((k, i) => [`ref-${k}`, `[${i + 1}]`])), () => `the reference list follows the first citations (${refs.map((r) => r[0]).join(', ')})`);
  for (const key of order) ok(await p0.$(`[data-references] #ref-${key}`) !== null, `#ref-${key} resolves`);
  counts.cites = cites.length;

  // Every in-page link of the page (the tool's short lines, the contents, citations, the nav) has its target, and the
  // short lines' links lead to topics.
  const anchors = await p0.$$eval('a[href^="#"]', (els) => els.map((e) => [e.getAttribute('href'), !!document.getElementById(decodeURIComponent(e.getAttribute('href').slice(1)))]));
  ok(anchors.length > 0 && anchors.every(([, found]) => found), () => `every #link resolves (${anchors.filter(([, f]) => !f).map(([h]) => h).join(', ')})`);
  const whyLinks = await p0.$$eval('a[data-why-link]', (els) => els.map((e) => e.getAttribute('href')));
  ok(whyLinks.length > 0 && whyLinks.every((h) => TOPICS.includes(h.slice(1))), () => `the short lines link topics (${whyLinks.join(', ')})`);
  counts.anchors = anchors.length;

  // A citation's link jumps to its entry.
  await p0.click('[data-theory] a[data-cite="WikiMobius"]');
  await frame(p0);
  ok(await p0.evaluate(() => window.location.hash === '#ref-WikiMobius' && document.querySelector('#ref-WikiMobius:target') !== null), 'a citation link makes its entry the target');
  ok(p0.errors.length === 0, () => `start: no errors in the console (${p0.errors.join(' | ')})`);
  await p0.close();

  // ---------- two circuits through the link; a load typed and an undo ----------
  for (const [name, c] of [['C1', C1], ['C2', C2], ['C3', C3], ['C4', C4]]) {
    const p = await open(desk, c);
    ok(S.sameCircuit(await linked(p), c), `${name}: the link gives the circuit`);
    // The theory's solver topics follow the Solve panel's outcome (a deferred render after it).
    await p.waitForSelector('[data-solve-status]:not([data-solve-status="solving"])');
    await frame(p);
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
console.log(`theory: ${counts.live} live numbers, ${counts.lines} equation lines with live numbers, ${counts.cites} citations and ${counts.anchors} #links on the start circuit`);
console.log(`theory: ${passed} of ${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
