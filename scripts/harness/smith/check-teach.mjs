// Checks of the teaching engine (step M6.2), run by check.mjs with its counters:
// - examples.ts: every link decodes with no issue to the circuit examples.md states and round-trips; every topic is a
//   theory anchor; the texts are plain; each example played step by step (each step's `reach` circuit, the stated
//   answer typed, the Y grid where asked) is done at every step, and not before (answers off by twice their tolerance,
//   an answer the screen contradicts, `away` from the same solution); every solution meets a step; every stated figure
//   is reproduced by the engine and by an independent hand formula (plain complex arithmetic in ohms) to its digits;
//   the solver's E8 "none", E16's two solutions and E15's four E24 pairs.
// - challenge.ts: 1,000 seeds per kind (and 200 random seeds up to 2³² − 1) drawn within their ranges and solvable,
//   the same seed the same problem (JSON), the start state never reached, every revealed solution reached (e24: its E24
//   variants, not the exact values), hints finite; the time per generated challenge.
// - lesson.ts and state.ts: lesson links round-trip (every lock and panel, random texts of any characters with emoji,
//   &, =, %, +, newlines, 500 and 501 code points), old links read as before, broken parameters give issues and never
//   throw, keepLocks keeps every locked value against random edits.

import { readFileSync } from 'node:fs';
import * as importedExamples from '../../../lib/smith/examples.ts';
import * as importedChallenge from '../../../lib/smith/challenge.ts';
import * as importedLesson from '../../../lib/smith/lesson.ts';
import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedSolve from '../../../lib/smith/solve.ts';
import * as importedValues from '../../../lib/smith/values.ts';
import * as importedQuantity from '../../../lib/quantity.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import { retried } from './timing.mjs';

const EX = importedExamples.default ?? importedExamples;
const CH = importedChallenge.default ?? importedChallenge;
const LS = importedLesson.default ?? importedLesson;
const ST = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const SV = importedSolve.default ?? importedSolve;
const VL = importedValues.default ?? importedValues;
const Q = importedQuantity.default ?? importedQuantity;
const P = importedParts.default ?? importedParts;

const { EXAMPLES, exampleById, stepDone, nodeGammas, quantityOf, answerCheck } = EX;
const { makeChallenge, reached, hintLadder, readAnswer, challengeTask, CHALLENGE_KINDS, challengeText, readChallenge, L_RANGE, C_RANGE, ZT_RANGE, READ_R, READ_X, READ_ASKS, READ_TOL } = CH;
const { readLesson, lessonParams, keepLocks, lockText, TEXT_MAX } = LS;
const { decodeCircuit, encodeCircuit, sameCircuit, sameNetwork, defaultCircuit, newPart, movePart, KIND_CODES } = ST;
const { evaluateCircuit, METRIC_STRIDE, M_ML } = N;
const { solve } = SV;
const { standardVariants, defaultChoice, around } = VL;
const { readAmount } = Q;
const { SERIES_L, SERIES_C, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER, PART_KINDS } = P;

const ROOT = new URL('../../../', import.meta.url);
const TAU = 2 * Math.PI;

// The circuit each example's link states (examples.md: Z0, f0, load, number of parts).
const STATED = {
  'reading-a-match': [50, 100e6, 75, 0, 0], 'reading-a-point': [50, 100e6, 25, 25, 0], admittance: [50, 100e6, 25, 25, 0],
  'series-or-shunt': [50, 100e6, 25, 0, 0], 'one-shunt-part': [50, 100e6, 25, 25, 0], 'l-match-up': [50, 100e6, 25, 0, 0],
  'l-match-down': [50, 100e6, 100, 0, 0], 'l-match-none': [50, 100e6, 100, 0, 2], 'line-turns': [50, 100e6, 25, 25, 0],
  'quarter-wave': [50, 100e6, 100, 0, 0], 'line-and-quarter-wave': [50, 100e6, 25, 25, 0], 'open-stub': [50, 100e6, 100, 0, 0],
  'short-stub': [50, 100e6, 60, -80, 0], 'three-part-ladder': [50, 100e6, 10, 0, 0], 'e24-values': [50, 100e6, 25, 0, 2],
  'sub-ghz-load': [50, 868e6, 20, -35, 0],
};

// ---------------------------------------------------------------------------------------------------------------
// An independent evaluation: plain complex arithmetic in ohms, part by part from the load (no network.ts).

const c = (re, im = 0) => ({ re, im });
const add = (a, b) => c(a.re + b.re, a.im + b.im);
const sub = (a, b) => c(a.re - b.re, a.im - b.im);
const mul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return c((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
const inv = (a) => div(c(1), a);
const abs = (a) => Math.hypot(a.re, a.im);

/** Z in ohms at every node (the load first) of a circuit at f0. */
function handNodes(k) {
  const w = TAU * k.f0;
  let Z = c(k.loadR, k.loadX);
  const out = [Z];
  for (const p of k.parts) {
    switch (p.kind) {
      case SERIES_L: Z = add(Z, c(0, w * p.value)); break;
      case SERIES_C: Z = add(Z, c(0, -1 / (w * p.value))); break;
      case SHUNT_L: Z = inv(add(inv(Z), c(0, -1 / (w * p.value)))); break;
      case SHUNT_C: Z = inv(add(inv(Z), c(0, w * p.value))); break;
      case LINE: { const t = Math.tan(TAU * p.value), Zc = c(p.zc); Z = mul(Zc, div(add(Z, c(0, p.zc * t)), add(Zc, mul(c(0, t), Z)))); break; }
      case STUB_OPEN: Z = inv(add(inv(Z), c(0, Math.tan(TAU * p.value) / p.zc))); break;
      case STUB_SHORT: Z = inv(add(inv(Z), c(0, -1 / (Math.tan(TAU * p.value) * p.zc)))); break;
      case QUARTER: Z = div(c(p.value * p.value), Z); break;
      default: throw new Error(`hand: kind ${p.kind}`);
    }
    out.push(Z);
  }
  return out;
}

/** A figure of a node from Z (hand). */
function handFigure(q, Z, z0) {
  const G = div(sub(Z, c(z0)), add(Z, c(z0))), m = abs(G), z = div(Z, c(z0)), y = inv(z);
  switch (q) {
    case 'mag': return m;
    case 'angle': return Math.atan2(G.im, G.re) * 180 / Math.PI;
    case 'vswr': return (1 + m) / (1 - m);
    case 'rl': return -20 * Math.log10(m);
    case 'ml': return -10 * Math.log10(1 - m * m);
    case 'gr': return G.re;
    case 'gi': return G.im;
    case 'r': return z.re;
    case 'x': return z.im;
    case 'g': return y.re;
    case 'b': return y.im;
    case 'R': return Z.re;
    case 'Q': return Math.abs(z.im) / z.re;
  }
  throw new Error(q);
}

/** The value and half a unit of the last written decimal of a stated text ("39.79 nH", "-0.3333", "13.98"). */
function statedNumber(text, unit) {
  const [mant, suffix] = text.split(' ');
  const dot = mant.indexOf('.');
  const decimals = dot < 0 ? 0 : mant.length - dot - 1;
  const value = suffix ? readAmount(text, unit) : Number(mant);
  const scale = suffix ? value / Number(mant) : 1;
  return { value, half: 0.5 * 10 ** -decimals * Math.abs(scale) * (1 + 1e-9) };
}
const UNIT_OF = (kind) => (kind === SERIES_L || kind === SHUNT_L ? 'H' : kind === SERIES_C || kind === SHUNT_C ? 'F' : kind === QUARTER ? 'Ω' : '');

export function runTeachChecks({ section, ok, random }) {
  const rint = (n) => Math.floor(random() * n);

  // -------------------------------------------------------------------------------------------------------------
  section('teach: examples');
  {
    const theory = readFileSync(new URL('components/Smith/Theory.tsx', ROOT), 'utf8');
    const topics = new Set([...theory.matchAll(/\{ id: '([a-z-]+)', title:/g)].map((m) => m[1]));
    ok(EXAMPLES.length === 16 && new Set(EXAMPLES.map((e) => e.id)).size === 16, `16 examples with distinct ids: ${EXAMPLES.length}`);
    ok(EXAMPLES.every((e) => exampleById(e.id) === e) && exampleById('nope') === undefined, 'exampleById finds every example and nothing else');
    const plain = (s) => typeof s === 'string' && s.length > 0 && s === s.trim() && !/[<>⟨⟩]/.test(s);
    let links = 0, badLinks = [], texts = 0, badTexts = [];
    const read = (link, what) => {
      links++;
      const d = decodeCircuit(link);
      const back = decodeCircuit(encodeCircuit(d.circuit));
      if (d.issues.length || !d.linked || !new URLSearchParams(link).has('p') || !sameCircuit(back.circuit, d.circuit)) badLinks.push(`${what}: ${link} ${d.issues.join('; ')}`);
      return d.circuit;
    };
    for (const e of EXAMPLES) {
      const start = read(e.link, e.id);
      const [z0, f0, R, X, n] = STATED[e.id];
      ok(start.z0 === z0 && start.f0 === f0 && start.loadR === R && start.loadX === X && start.parts.length === n,
        `${e.id}: the link is the stated circuit (${encodeCircuit(start)})`);
      for (const s of e.solutions) read(s, `${e.id} solution`);
      for (const st of e.stated) if (typeof st.at === 'string') read(st.at, `${e.id} stated`);
      for (const t of [e.title, e.intro]) { texts++; if (!plain(t)) badTexts.push(t); }
      ok(e.steps.length >= 2 && e.claims.length >= 1 && e.claims.every((n) => n >= 191 && n <= 225), `${e.id}: steps and claims 191–225`);
      for (const step of e.steps) {
        if (step.reach) read(step.reach, `${e.id} reach`);
        for (const t of [step.do, step.hint]) { texts++; if (!plain(t) || !/[.)]$/.test(t)) badTexts.push(t); }
        ok(topics.has(step.topic), `${e.id}: topic ${step.topic} is a theory anchor`);
        ok(step.done.length >= 1 && step.done.every((g) => g.length >= 1), `${e.id}: every step has a done state`);
      }
    }
    ok(badLinks.length === 0, `${links} example links decode with no issue, linked, with p=, and round-trip: ${badLinks.slice(0, 3).join(' | ')}`);
    ok(badTexts.length === 0, `${texts} texts are plain (no HTML, no ⟨n⟩), end a sentence: ${badTexts.slice(0, 3).join(' | ')}`);
    ok(new Set(EXAMPLES.flatMap((e) => e.claims)).size === 35, 'the examples carry claims 191–225, each once');

    // Played through: each step's reach, the stated answer, the Y grid; and not done before.
    let played = 0, notBefore = 0;
    const playLog = [];
    const doneAtOf = new Map();
    for (const e of EXAMPLES) {
      let circuit = decodeCircuit(e.link).circuit, grid = 'Z';
      const doneAt = [];
      for (let i = 0; i < e.steps.length; i++) {
        const step = e.steps[i], a = answerCheck(step);
        const wantsGrid = step.done.some((g) => g.some((ch) => ch.k === 'grid'));
        // Not done before it is played: an answer not yet typed, the Z grid, or the circuit before the step's reach
        // (E8's last step excepted: moving the L there already gives E7's first solution).
        const fresh = { grid: 'Z', answer: null, doneAt };
        const reachNew = step.reach && !sameNetwork(decodeCircuit(step.reach).circuit, circuit) && !(e.id === 'l-match-none' && i === 2);
        if (a || wantsGrid || reachNew) {
          if (stepDone(step, circuit, fresh)) playLog.push(`${e.id} step ${i + 1} done before it was played`); else notBefore++;
        }
        if (step.reach) circuit = decodeCircuit(step.reach).circuit;
        if (wantsGrid) grid = 'ZY';
        const ctx = { grid, answer: a ? a.value : null, doneAt };
        if (stepDone(step, circuit, ctx)) played++; else playLog.push(`${e.id} step ${i + 1} not done when played`);
        if (a) {
          if (stepDone(step, circuit, { ...ctx, answer: a.value + 2 * a.tol }) || stepDone(step, circuit, { ...ctx, answer: a.value - 2 * a.tol })) playLog.push(`${e.id} step ${i + 1}: an answer 2 tol off is accepted`);
          if (stepDone(step, circuit, { ...ctx, answer: NaN })) playLog.push(`${e.id} step ${i + 1}: NaN accepted`);
        }
        if (wantsGrid && stepDone(step, circuit, { ...ctx, grid: 'Z' })) playLog.push(`${e.id} step ${i + 1}: done on the Z grid`);
        doneAt.push(nodeGammas(circuit));
      }
      doneAtOf.set(e.id, doneAt);
    }
    const steps = EXAMPLES.reduce((s, e) => s + e.steps.length, 0);
    ok(played === steps && playLog.length === 0, `every example played through: ${played} of ${steps} steps done, ${notBefore} not before; ${playLog.slice(0, 4).join(' | ')}`);

    // An answer must also agree with the screen: E1's |Γ| = 0.2 typed after the load became 25 Ω.
    const e1 = exampleById('reading-a-match');
    ok(!stepDone(e1.steps[0], decodeCircuit(`${e1.link.replace('75:0', '25:0')}`).circuit, { grid: 'Z', answer: 0.2, doneAt: [] }), 'E1: |Γ| = 0.2 is not accepted where the screen shows 1/3');
    ok(stepDone(e1.steps[1], decodeCircuit(e1.link).circuit, { grid: 'Z', answer: 1.509, doneAt: [] }) && !stepDone(e1.steps[1], decodeCircuit(e1.link).circuit, { grid: 'Z', answer: 1.511, doneAt: [] }), 'E1: VSWR within ±0.01 only');
    // away: the other solution, not the same one again.
    for (const id of ['line-and-quarter-wave', 'open-stub', 'short-stub']) {
      const e = exampleById(id), d = doneAtOf.get(id);
      const sol0 = decodeCircuit(e.solutions[0]).circuit, sol1 = decodeCircuit(e.solutions[1]).circuit;
      const ctx = { grid: 'Z', answer: null, doneAt: d };
      ok(!stepDone(e.steps[2], sol0, ctx) && stepDone(e.steps[2], sol1, ctx), `${id}: the other solution counts, the same one again does not`);
      const swapped = { grid: 'Z', answer: null, doneAt: [d[0], nodeGammas(sol1)] };
      ok(stepDone(e.steps[2], sol0, swapped), `${id}: either solution may come first`);
      ok(!stepDone(e.steps[2], sol1, { grid: 'Z', answer: null, doneAt: [] }), `${id}: away without a done step 2 does not hold`);
    }
    // Every solution meets some step (with the play's done-time Γs and the stated answers).
    let solOk = 0, solAll = 0;
    for (const e of EXAMPLES) {
      for (const s of e.solutions) {
        solAll++;
        const k = decodeCircuit(s).circuit;
        if (e.steps.some((step) => step.done.every((g) => g.every((ch) => ch.k !== 'next')) && stepDone(step, k, { grid: 'ZY', answer: answerCheck(step)?.value ?? null, doneAt: doneAtOf.get(e.id) }))) solOk++;
        else ok(false, `${e.id}: solution ${s} meets no step`);
      }
    }
    ok(solOk === solAll, `every solution link meets a step: ${solOk} of ${solAll}`);
    const e8 = exampleById('l-match-none');
    ok(e8.solutions.every((s) => stepDone(e8.steps[2], decodeCircuit(s).circuit, { grid: 'Z', answer: null, doneAt: [] })), 'E8: either of E7’s solutions is done at the last step');

    // Every stated figure, by the engine and by hand, at its digits.
    let figures = 0;
    const figLog = [];
    for (const e of EXAMPLES) {
      for (const st of e.stated) {
        const link = typeof st.at === 'string' ? st.at : st.at < 0 ? e.link : e.solutions[st.at];
        const k = decodeCircuit(link).circuit;
        figures++;
        if ('part' in st) {
          const p = k.parts[st.part - 1];
          const { value, half } = statedNumber(st.text, UNIT_OF(p.kind));
          if (!(Math.abs(p.value - value) <= half)) figLog.push(`${e.id} part ${st.part}: ${p.value} against ${st.text}`);
          continue;
        }
        const n = k.parts.length, node = st.node === 'in' ? n : st.node;
        const { metrics } = evaluateCircuit(k);
        const o = node * METRIC_STRIDE;
        const engine = st.q === 'ml' ? metrics[o + M_ML] : st.q === 'gr' ? metrics[o] : st.q === 'gi' ? metrics[o + 1] : quantityOf(st.q, metrics, o, k.z0);
        const hand = handFigure(st.q, handNodes(k)[node], k.z0);
        const { value, half } = statedNumber(st.text, '');
        if (!(Math.abs(engine - value) <= half) || !(Math.abs(hand - value) <= half) || !(Math.abs(engine - hand) <= 1e-9 * Math.max(1, Math.abs(hand)))) {
          figLog.push(`${e.id} ${st.q}@${st.node}: engine ${engine}, hand ${hand}, stated ${st.text}`);
        }
      }
    }
    ok(figLog.length === 0, `${figures} stated figures reproduced by the engine and by hand at their digits: ${figLog.slice(0, 4).join(' | ')}`);

    // The solver's answers the examples quote.
    const e8c = decodeCircuit(e8.link).circuit;
    const none = solve(e8c, e8c.ask.unknowns, e8c.ask.goal);
    ok(none.status === 'none' && none.reason === 'the two circles do not cross: no values of these two parts reach the target', `E8: the solver says none, as quoted (${none.status}: ${none.reason})`);
    const moved = movePart(e8c, 0, 1);
    const two = solve(moved, moved.ask.unknowns, moved.ask.goal);
    ok(encodeCircuit(moved).endsWith('&u=2lc,1lc') && two.status === 'solved' && two.solutions.length === 2, `E8 moved: the marks follow (u=2lc,1lc) and two solutions (${two.status}, ${two.solutions.length})`);
    const e16 = decodeCircuit('v=1&z0=50&f0=868e6&zl=20:-35&p=ls:10e-9,cp:4e-12&u=1lc,2lc').circuit;
    const s16 = solve(e16, e16.ask.unknowns, e16.ask.goal).solutions;
    const has = (k1, v1, k2, v2) => s16.some((s) => s.values[0].kind === k1 && s.values[1].kind === k2
      && Math.abs(s.values[0].value - v1) <= 0.0005 * v1 && Math.abs(s.values[1].value - v2) <= 0.0005 * v2);
    ok(s16.length === 2 && has(SERIES_L, 10.91e-9, SHUNT_C, 4.491e-12) && has(SERIES_L, 1.926e-9, SHUNT_L, 7.486e-9), 'E16: the solver’s two solutions, 10.91 nH with 4.491 pF and 1.926 nH with 7.486 nH');
    const e15 = decodeCircuit('v=1&z0=50&f0=100e6&zl=25:0&p=ls:40e-9,cp:30e-12&u=1,2').circuit;
    const s15 = solve(e15, e15.ask.unknowns, e15.ask.goal).solutions.find((s) => Math.abs(s.values[0].value - 39.79e-9) < 0.01e-9);
    const vars = s15 ? standardVariants(e15, e15.ask.goal, s15, defaultChoice()) : [];
    const want = [[39e-9, 33e-12, 0.0208], [39e-9, 30e-12, 0.0300], [43e-9, 33e-12, 0.0453], [43e-9, 30e-12, 0.0492]];
    ok(vars.length === 4 && want.every(([l, cc, g], i) => vars[i].values[0] === l && vars[i].values[1] === cc && Math.abs(vars[i].gamma - g) <= 0.00005),
      `E15: the four E24 pairs, nearest first (${vars.map((v) => v.gamma.toFixed(4)).join(', ')})`);
    const dc = defaultCircuit();
    const tl = newPart(LINE, dc), qw = newPart(QUARTER, dc);
    ok(tl.value === 0.125 && tl.zc === 50 && qw.value === 50, 'E9, E10: a new line is λ/8 of Z0, a new λ/4 has Zt = Z0');
  }

  // -------------------------------------------------------------------------------------------------------------
  section('teach: challenges');
  {
    const SEEDS = 1000;
    const isLCk = (k) => k === SERIES_L || k === SERIES_C || k === SHUNT_L || k === SHUNT_C;
    const inB = (k, v) => (k === SERIES_L || k === SHUNT_L ? v >= L_RANGE[0] && v <= L_RANGE[1]
      : k === SERIES_C || k === SHUNT_C ? v >= C_RANGE[0] && v <= C_RANGE[1] : k === QUARTER ? v >= ZT_RANGE[0] && v <= ZT_RANGE[1] : v >= 0 && v < Infinity);
    const loadMag = (k) => Math.hypot(k.loadR - 50, k.loadX) / Math.hypot(k.loadR + 50, k.loadX);
    const isWhole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    for (const kind of CHALLENGE_KINDS) {
      const log = [];
      let maxDraws = 0, revealedAll = 0, standardAll = 0, hintsChecked = 0, sameOk = 0;
      const seeds = Array.from({ length: SEEDS }, (_, i) => i);
      for (let i = 0; i < 200; i++) seeds.push(Math.floor(random() * 4294967296));
      seeds.push(4294967295);
      for (const seed of seeds) {
        const ch = makeChallenge(kind, seed);
        const k = ch.circuit;
        maxDraws = Math.max(maxDraws, ch.draws);
        if (ch.draws > 64) log.push(`${seed}: ${ch.draws} draws`);
        if (k.z0 !== 50 || k.parts.length !== 0 || ch.seed !== seed) log.push(`${seed}: not a 50 Ω circuit with no parts`);
        // Ranges (§1).
        const m = loadMag(k);
        if (kind === 'two' || kind === 'e24') {
          if (!(k.f0 >= 10e6 && k.f0 <= 3e9 && Number(k.f0.toPrecision(3)) === k.f0) || !isWhole(k.loadR, 5, 250) || !isWhole(k.loadX, -150, 150) || m < 0.3) log.push(`${seed}: out of range ${encodeCircuit(k)}`);
          if (kind === 'e24' && !(ch.e24 && ch.goal.within && (ch.goal.value === 0.1 || ch.goal.value === 0.2))) log.push(`${seed}: e24 goal`);
          if (kind === 'two' && (ch.goal.value !== 0.05 || ch.e24)) log.push(`${seed}: two goal`);
        } else if (kind === 'stub') {
          if (k.f0 !== 100e6 || !isWhole(k.loadR, 10, 250) || !isWhole(k.loadX, -150, 150) || m < 0.3 || !(ch.allowed[0] === LINE && (ch.allowed[1] === STUB_OPEN || ch.allowed[1] === STUB_SHORT)) || !ch.zcIsZ0) log.push(`${seed}: out of range ${encodeCircuit(k)}`);
        } else if (kind === 'qw') {
          const okRange = ch.complex ? isWhole(k.loadR, 10, 200) && isWhole(k.loadX, -150, 150) && m >= 0.3 && ch.maxParts === 2
            : isWhole(k.loadR, 10, 500) && k.loadX === 0 && m >= 0.2 && ch.maxParts === 1;
          if (k.f0 !== 100e6 || !okRange) log.push(`${seed}: out of range ${encodeCircuit(k)}`);
        } else {
          const { ask, r, x } = ch.read;
          if (!READ_R.includes(r) || !READ_X.includes(x) || !READ_ASKS.includes(ask) || m > 0.9 || (r === 1 && x === 0) || k.loadR !== 50 * r || k.loadX !== 50 * x || ch.maxParts !== 0) log.push(`${seed}: read out of range`);
        }
        // The same seed, the same problem.
        if (JSON.stringify(makeChallenge(kind, seed)) === JSON.stringify(ch)) sameOk++;
        // Never reached at the start; reached by the reveal.
        if (kind === 'read') {
          const want = readAnswer(ch);
          if (reached(ch, k).reached || !reached(ch, k, want).reached) log.push(`${seed}: read reached wrongly`);
          const ask = ch.read.ask;
          const off = ask === 'z' || ask === 'y' ? [want[0] + 0.5, want[1] + 0.5] : ask === 'mag' ? [want[0] + 2 * READ_TOL.mag] : ask === 'vswr' ? [want[0] * (1 + 2 * READ_TOL.vswr)] : [want[0] + 2 * READ_TOL.rl];
          const near = ask === 'z' || ask === 'y' ? want : ask === 'mag' ? [want[0] + 0.5 * READ_TOL.mag] : ask === 'vswr' ? [want[0] * (1 + 0.5 * READ_TOL.vswr)] : [want[0] - 0.5 * READ_TOL.rl];
          if (reached(ch, k, off).reached || !reached(ch, k, near).reached) log.push(`${seed}: read tolerance (${ask})`);
        } else {
          if (reached(ch, k).reached) log.push(`${seed}: the start state is reached`);
          if (!ch.revealed.length) log.push(`${seed}: nothing revealed`);
          for (const r of ch.revealed) {
            revealedAll++;
            if (!r.circuit.parts.every((p) => ch.allowed.includes(p.kind) && inB(p.kind, p.value))) log.push(`${seed}: revealed out of bounds ${encodeCircuit(r.circuit)}`);
            if (ch.e24) {
              if (!r.standard?.length) log.push(`${seed}: an e24 reveal without a variant`);
              for (const s of r.standard ?? []) {
                standardAll++;
                if (!reached(ch, s.circuit).reached || !s.circuit.parts.every((p) => around(p.value, { id: 'E24' })?.exact && inB(p.kind, p.value))) log.push(`${seed}: an E24 variant does not reach ${encodeCircuit(s.circuit)}: ${reached(ch, s.circuit).why}`);
              }
              if (r.circuit.parts.every((p) => around(p.value, { id: 'E24' })?.exact) !== reached(ch, r.circuit).reached) log.push(`${seed}: exact values reached without being E24`);
            } else if (!reached(ch, r.circuit).reached) log.push(`${seed}: the revealed solution is not reached (${reached(ch, r.circuit).why})`);
          }
          // Rules: one part too many, a forbidden kind, a changed load, Zc ≠ Z0.
          const r0 = ch.revealed[0].circuit;
          if (reached(ch, { ...r0, parts: [...r0.parts, { kind: SERIES_L, value: 0 }, { kind: SERIES_L, value: 0 }] }).reached) log.push(`${seed}: too many parts reached`);
          if (reached(ch, { ...r0, loadR: r0.loadR + 1 }).reached) log.push(`${seed}: a changed load reached`);
          if (kind === 'stub' && reached(ch, { ...r0, parts: r0.parts.map((p) => ({ ...p, zc: 75 })) }).reached) log.push(`${seed}: Zc 75 reached`);
        }
        // Hints: 200 seeds per kind, from the start and from the revealed circuit.
        if (seed < 200) {
          for (const from of kind === 'read' ? [k] : [k, ch.revealed[ch.revealed.length - 1].circuit]) {
            const h = hintLadder(ch, from);
            hintsChecked++;
            const circlesOk = h[0].circles && h[0].circles.length >= 4 && h[0].circles.every(Number.isFinite) && h[0].circles.some((v) => v !== 0);
            if (h.length !== 4 || !h.every((x) => typeof x.text === 'string' && x.text.length > 4 && !/NaN|undefined|Infinity/.test(x.text)) || !circlesOk
              || (kind === 'read' ? !(h[3].answer && h[3].equation) : !(h[3].revealed?.length))) log.push(`${seed}: hints ${JSON.stringify(h.map((x) => x.text))}`);
          }
        }
      }
      ok(log.length === 0, `${kind}: ${seeds.length} seeds drawn within range, solvable, start never reached, reveal reached; ${log.slice(0, 3).join(' | ')}`);
      ok(sameOk === seeds.length, `${kind}: the same seed gives the same problem (${sameOk} of ${seeds.length})`);
      ok(maxDraws <= 8, `${kind}: at most ${maxDraws} draws per problem (M6.1: 4)`);
      ok(hintsChecked >= 200, `${kind}: ${hintsChecked} hint ladders of four, circles finite${kind === 'read' ? '' : `; ${revealedAll} solutions revealed${kind === 'e24' ? `, ${standardAll} E24 variants reached` : ''}`}`);
      ok(typeof challengeTask(makeChallenge(kind, 1)) === 'string', `${kind}: a task sentence`);
    }
    // The hint follows the visitor's parts: an L-match started the other way round.
    const ch = makeChallenge('two', 48213);
    const mine = { ...ch.circuit, parts: [{ kind: SHUNT_C, value: 1e-12 }, { kind: SERIES_L, value: 1e-9 }] };
    const h = hintLadder(ch, mine);
    ok(/^A shunt [LC]:/.test(h[1].text), `two.48213: hint 2 follows the visitor's order, a shunt part first (${h[1].text})`);
    // The link text.
    let textOk = 0;
    for (let i = 0; i < 200; i++) {
      const kind = CHALLENGE_KINDS[rint(5)], seed = Math.floor(random() * 4294967296);
      const r = readChallenge(challengeText(kind, seed));
      if (typeof r !== 'string' && r.kind === kind && r.seed === seed) textOk++;
    }
    ok(textOk === 200, `challengeText ↔ readChallenge: ${textOk} of 200`);
    ok(['', 'two', 'two.', 'two.-1', 'two.4294967296', 'four.1', 'two.1.2', 'two.1e3'].every((t) => typeof readChallenge(t) === 'string'), 'broken challenge texts give a reason');
    // Timing: generation per challenge, every kind.
    for (const kind of CHALLENGE_KINDS) {
      const budget = 0.5;
      const t = retried(() => { const t0 = performance.now(); for (let s = 0; s < 400; s++) makeChallenge(kind, 7919 * s + 13); return (performance.now() - t0) / 400; }, (v) => v <= budget);
      ok(t.value <= budget, `${kind}: ${t.value.toFixed(3)} ms per generated challenge (budget ${budget} ms)${t.note}`);
    }
    const hb = 5;
    const ht = retried(() => { const t0 = performance.now(); for (let s = 0; s < 100; s++) { const c2 = makeChallenge('e24', s); hintLadder(c2, c2.circuit); } return (performance.now() - t0) / 100; }, (v) => v <= hb);
    ok(ht.value <= hb, `e24: ${ht.value.toFixed(3)} ms per challenge with its hint ladder (budget ${hb} ms)${ht.note}`);
  }

  // -------------------------------------------------------------------------------------------------------------
  section('teach: lesson links');
  {
    const POOLS = [
      [0x20, 0x7e], [0xa0, 0x2ff], [0x391, 0x3c9], [0x2000, 0x22ff], [0x4e00, 0x4fff], [0x1f300, 0x1f64f], [0x1f900, 0x1f9ff], [0x10000, 0x1007f],
    ];
    const SPECIAL = ['&', '=', '%', '+', '#', '?', '\n', '\r\n', '\t', ' ', '%20', '&lk=z0', '\u0000', '﻿', '👩‍👩‍👧', 'Γ', '≤', '|'];
    const randomText = (len) => {
      let s = '';
      for (let i = 0; i < len; i++) {
        if (random() < 0.2) { s += SPECIAL[rint(SPECIAL.length)]; continue; }
        const [lo, hi] = POOLS[rint(POOLS.length)];
        s += String.fromCodePoint(lo + rint(hi - lo + 1));
      }
      return s;
    };
    const points = (s) => [...s].length;
    const randomCircuit = () => {
      const k = { z0: [50, 75, 100][rint(3)], f0: 10 ** (6 + 3 * random()), loadR: 200 * random(), loadX: 200 * random() - 100, parts: [] };
      const n = rint(6);
      for (let i = 0; i < n; i++) { const p = newPart(rint(PART_KINDS), k); p.value *= 0.5 + random(); k.parts.push(p); }
      return k;
    };
    const randomLesson = (n) => {
      const all = ['z0', 'f0', 'zl', 'parts'];
      for (let i = 0; i < n; i++) all.push({ kind: i }, { value: i });
      const locks = all.filter(() => random() < 0.4).sort(() => random() - 0.5);
      const hidden = ['solve', 'suggest', 'reveal'].filter(() => random() < 0.5);
      const text = random() < 0.2 ? '' : randomText(rint(80));
      return { locks, hidden, text };
    };
    const sameLesson = (a, b) => !!a && !!b && a.locks.map(lockText).join() === b.locks.map(lockText).join() && a.hidden.join() === b.hidden.join() && a.text === b.text;
    let trips = 0, viaParams = 0, oldOk = 0;
    const tripLog = [];
    for (let i = 0; i < 500; i++) {
      const k = randomCircuit();
      let lesson = randomLesson(k.parts.length);
      if (!lesson.locks.length && !lesson.hidden.length && !lesson.text) lesson = { ...lesson, text: 'x' };
      const chText = random() < 0.5 ? challengeText(CHALLENGE_KINDS[rint(5)], Math.floor(random() * 4294967296)) : null;
      const link = encodeCircuit(k) + lessonParams(lesson) + (chText ? `&ch=${chText}` : '');
      const d = decodeCircuit(`?${link}`);
      if (d.issues.length === 0 && sameCircuit(d.circuit, k) && sameLesson(d.lesson, lesson) && (chText ? d.challenge && challengeText(d.challenge.kind, d.challenge.seed) === chText : d.challenge === null)) trips++;
      else tripLog.push(`${link.slice(0, 120)} → ${JSON.stringify(d.issues)}`);
      const sp = new URLSearchParams(lessonParams(lesson).slice(1));
      if ((sp.get('tx') ?? '') === lesson.text) viaParams++;
      const old = decodeCircuit(encodeCircuit(k));
      if (old.lesson === null && old.challenge === null && old.issues.length === 0 && sameCircuit(old.circuit, k)) oldOk++;
    }
    ok(trips === 500, `500 lesson links round-trip with every lock, panel and random text: ${trips}; ${tripLog.slice(0, 2).join(' | ')}`);
    ok(viaParams === 500, `the text reads back through URLSearchParams: ${viaParams} of 500`);
    ok(oldOk === 500, `links without a lesson read as before (no lesson, no challenge, no issue): ${oldOk} of 500`);
    // Every lock and panel at once, on a 24-part circuit.
    const big = { ...defaultCircuit(), parts: Array.from({ length: 24 }, (_, i) => newPart([SERIES_L, SHUNT_C, LINE, QUARTER][i % 4], defaultCircuit())) };
    const every = { locks: ['z0', 'f0', 'zl', 'parts', ...big.parts.flatMap((_, i) => [{ kind: i }, { value: i }])], hidden: ['solve', 'suggest', 'reveal'], text: 'Every lock.' };
    const dEvery = decodeCircuit(encodeCircuit(big) + lessonParams(every));
    ok(dEvery.issues.length === 0 && sameLesson(dEvery.lesson, every), `every lock (${every.locks.length}) and panel round-trips`);
    // 500 and 501 code points; lone surrogates.
    const t500 = randomText(700);
    const cut500 = [...t500].slice(0, 500).join(''), cut501 = [...t500].slice(0, 501).join('');
    const issues500 = [], issues501 = [];
    const l500 = readLesson(null, null, cut500, 0, issues500), l501 = readLesson(null, null, cut501, 0, issues501);
    ok(l500.text === cut500 && issues500.length === 0, `500 code points are kept whole (${points(cut500)})`);
    ok(l501.text === cut500 && issues501.length === 1 && points(l501.text) === TEXT_MAX, `501 code points are cut at 500 with an issue: ${issues501[0]}`);
    const emoji = '😀'.repeat(501);
    ok(points(readLesson(null, null, emoji, 0, []).text) === 500 && readLesson(null, null, emoji, 0, []).text === '😀'.repeat(500), 'a cut never splits a surrogate pair');
    const lone = `a\ud800b\udc00c`;
    const dl = decodeCircuit(lessonParams({ locks: [], hidden: [], text: lone }).slice(1));
    ok(dl.lesson?.text === 'a�b�c', `lone surrogates are written as U+FFFD instead of throwing: ${JSON.stringify(dl.lesson?.text)}`);
    // The example of examples-challenges.md §2.
    const ex = decodeCircuit('v=1&z0=50&f0=100e6&zl=25:0&p=ls:39e-9,cp:30e-12&lk=z0,f0,zl,parts,k1,k2&hd=solve,suggest&tx=Change%20only%20the%20values%20until%20%7C%CE%93%7C%20%E2%89%A4%200.025.');
    ok(ex.issues.length === 0 && ex.lesson.locks.map(lockText).join() === 'z0,f0,zl,parts,k1,k2' && ex.lesson.hidden.join() === 'solve,suggest'
      && ex.lesson.text === 'Change only the values until |Γ| ≤ 0.025.' && ex.linked, 'the §2 example reads as stated');
    ok(lessonParams(null) === '' && lessonParams({ locks: [], hidden: [], text: '' }) === '' && readLesson('', '', '', 2, []) === null && readLesson(null, null, null, 2, []) === null, 'no lesson: no parameters, null');
    // Broken parameters: issues, never a throw.
    const bad = decodeCircuit('?zl=100:0&p=ls:1e-9&lk=z0,foo,k2,v1,z0,,K1&hd=solve,bar,solve&ch=two.99999999999');
    ok(bad.lesson.locks.map(lockText).join() === 'z0,v1,k1' && bad.lesson.hidden.join() === 'solve' && bad.challenge === null && bad.issues.length === 6,
      `broken lesson parameters are left out with an issue each: ${JSON.stringify(bad.issues)}`);
    let neverThrows = 0;
    const ALPH = 'lkhdtxch=&,.%:0129vkzpfoslreaé😀';
    for (let i = 0; i < 2000; i++) {
      let s = '';
      const n = rint(40);
      for (let j = 0; j < n; j++) s += [...ALPH][rint([...ALPH].length)];
      try { const d = decodeCircuit(s); if (Array.isArray(d.issues)) neverThrows++; } catch (e) { ok(false, `decodeCircuit(${JSON.stringify(s)}) threw ${e}`); }
    }
    ok(neverThrows === 2000, `2000 random queries with lesson parameters never throw: ${neverThrows}`);

    // keepLocks against random edits.
    let kept = 0, same = 0;
    const keepLog = [];
    const edit = (k) => {
      const x = { ...k, parts: k.parts.map((p) => ({ ...p })) };
      const ops = 1 + rint(3);
      for (let i = 0; i < ops; i++) {
        switch (rint(8)) {
          case 0: x.z0 *= 1.5; break;
          case 1: x.f0 *= 2; break;
          case 2: x.loadR += 10; x.loadX -= 5; break;
          case 3: if (x.parts.length) { const j = rint(x.parts.length); x.parts[j] = { ...x.parts[j], value: x.parts[j].value * 1.3 }; } break;
          case 4: if (x.parts.length) { const j = rint(x.parts.length); x.parts[j] = newPart(rint(PART_KINDS), x); } break;
          case 5: x.parts.push(newPart(rint(PART_KINDS), x)); break;
          case 6: if (x.parts.length) x.parts.splice(rint(x.parts.length), 1); break;
          case 7: if (x.parts.length > 1) { const a = rint(x.parts.length), b = rint(x.parts.length); const [p] = x.parts.splice(a, 1); x.parts.splice(b, 0, p); } break;
        }
      }
      return x;
    };
    for (let i = 0; i < 2000; i++) {
      const base = randomCircuit(), lesson = randomLesson(base.parts.length), next = edit(base);
      const out = keepLocks(lesson, base, next);
      let good = true;
      for (const l of lesson.locks) {
        if (l === 'z0') good &&= out.z0 === base.z0;
        else if (l === 'f0') good &&= out.f0 === base.f0;
        else if (l === 'zl') good &&= out.loadR === base.loadR && out.loadX === base.loadX;
        else if (l === 'parts') good &&= out.parts.length === base.parts.length && out.parts.every((p, j) => p.kind === base.parts[j].kind);
        else if ('kind' in l) good &&= !!out.parts[l.kind] && out.parts[l.kind].kind === base.parts[l.kind].kind;
        else good &&= !!out.parts[l.value] && out.parts[l.value].kind === base.parts[l.value].kind && Object.is(out.parts[l.value].value, base.parts[l.value].value) && Object.is(out.parts[l.value].zc, base.parts[l.value].zc);
      }
      // What is not locked keeps the edit.
      if (!lesson.locks.includes('z0')) good &&= out.z0 === next.z0;
      if (!lesson.locks.includes('f0')) good &&= out.f0 === next.f0;
      if (!lesson.locks.includes('zl')) good &&= out.loadR === next.loadR;
      if (good) kept++; else keepLog.push(`${lesson.locks.map(lockText).join(',')}: ${encodeCircuit(base)} → ${encodeCircuit(next)} → ${encodeCircuit(out)}`);
      if (keepLocks(lesson, base, base) === base && keepLocks({ locks: [], hidden: [], text: '' }, base, next) === next) same++;
    }
    ok(kept === 2000, `keepLocks keeps every locked value against 2000 random edits: ${kept}; ${keepLog.slice(0, 2).join(' | ')}`);
    ok(same === 2000, `keepLocks returns the circuit itself when nothing changes or nothing is locked: ${same}`);
    const vLocked = { locks: [{ value: 0 }], hidden: [], text: '' };
    const b0 = decodeCircuit('v=1&z0=50&f0=100e6&zl=25:0&p=ls:39e-9').circuit;
    const added = keepLocks(vLocked, b0, { ...b0, parts: [{ ...b0.parts[0], value: 50e-9 }, { kind: SHUNT_C, value: 30e-12 }] });
    ok(added.parts.length === 2 && added.parts[0].value === 39e-9 && added.parts[1].kind === SHUNT_C, 'a locked value with a part added at the source end: the value kept, the new part too');
  }
}
