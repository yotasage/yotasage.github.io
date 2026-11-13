// Checks of lib/smith/suggest.ts and the worker's core lib/smith/solveJob.ts (step M4.4a), run by check.mjs with its
// counters, on a random stream of their own (so the solver groups after them keep their problems):
// - every suggestion re-evaluated here with network.ts reaches its stated |Γ|, residual and mismatch, and meets the
//   goal when it says so; its variants are there;
// - single changes against a 1-D scan of each part's coordinate (20,000 points): no root (circle goal), no point
//   inside the goal (inequality) and no smaller mismatch (point target) of the same realisability nearer than the
//   suggestion, and none missed for a part that has one;
// - pairs against solve(): every exact solution of every pair that changes both parts is among the suggestions;
// - the order is the ranking, deterministic (the same JSON twice), and a cap is the uncapped list's prefix;
// - runJob (what the worker runs) answers as solve() and suggest() do, and its replies survive structured cloning;
// - BL57 through the page's path (runJob);
// - timings: the start circuit and ten parts (medians).

import * as importedSuggest from '../../../lib/smith/suggest.ts';
import * as importedJob from '../../../lib/smith/solveJob.ts';
import * as importedSolve from '../../../lib/smith/solve.ts';
import * as importedGoal from '../../../lib/smith/goal.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedState from '../../../lib/smith/state.ts';
import { retried } from './timing.mjs';

const SG = importedSuggest.default ?? importedSuggest;
const J = importedJob.default ?? importedJob;
const S = importedSolve.default ?? importedSolve;
const GL = importedGoal.default ?? importedGoal;
const P = importedParts.default ?? importedParts;
const N = importedNetwork.default ?? importedNetwork;
const ST = importedState.default ?? importedState;
const { suggest, rankSuggestions, MAX_SUGGESTIONS } = SG;
const { solve, ACCEPT } = S;
const { SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER, packParts } = P;
const TAU = 2 * Math.PI, HALF_PI = Math.PI / 2;

export function runSuggestChecks({ section, ok }) {
  let seed = 0x4a4a1;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (a) => a[Math.floor(random() * a.length)];
  const logU = (lo, hi) => 10 ** (lo + (hi - lo) * random());

  // ---- an independent evaluation -------------------------------------------------------------------------------
  const nodes = new Float64Array(64 * N.NODE_STRIDE), g = new Float64Array(2);
  function gammaOf(c, node) {
    N.evaluate(nodes, packParts(c.parts), c.parts.length, c.loadR, c.loadX, c.z0, c.f0, c.f0);
    N.nodeGamma(g, 0, nodes, node * N.NODE_STRIDE);
    return [g[0], g[1]];
  }
  function applied(c, sol) {
    const parts = c.parts.map((p) => ({ ...p }));
    for (const v of sol.values) {
      if (v.param === 'zc') parts[v.part].zc = v.value;
      else parts[v.part] = { kind: v.kind, value: v.value, zc: v.zc };
    }
    return { ...c, parts };
  }
  const goalNode = (goal, c) => goal.node ?? c.parts.length;

  // ---- random problems ------------------------------------------------------------------------------------------
  const KINDS = [SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER];
  function randomPart(kind, z0, w0) {
    switch (kind) {
      case SERIES_R: return { kind, value: z0 * logU(-1.5, 1) };
      case SHUNT_R: return { kind, value: z0 * logU(-1, 1.5) };
      case SERIES_L: case SHUNT_L: return { kind, value: (z0 * logU(-1, 1)) / w0 * (kind === SHUNT_L ? 1 : 1) };
      case SERIES_C: case SHUNT_C: return { kind, value: 1 / (w0 * z0 * logU(-1, 1)) };
      case QUARTER: return { kind, value: z0 * logU(-0.5, 0.5) };
      default: return { kind, value: 0.02 + 0.45 * random(), zc: z0 * logU(-0.4, 0.4) };
    }
  }
  function randomCircuit(n) {
    const z0 = pick([50, 75, 1, 300]), f0 = logU(5, 10), w0 = TAU * f0;
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(randomPart(pick(KINDS), z0, w0));
    return { z0, f0, loadR: z0 * logU(-1.3, 1.3), loadX: z0 * (random() - 0.5) * 4, parts };
  }
  function randomGoal(c) {
    const r = random();
    let goal;
    if (r < 0.35) goal = { kind: 'point' };
    else if (r < 0.5) { const R = c.z0 * logU(-0.7, 0.7), X = c.z0 * (random() - 0.5); goal = { kind: 'point', targetR: R, targetX: X }; }
    else if (r < 0.7) goal = pick([{ kind: 'vswr', value: 1.2 + 2 * random(), within: true }, { kind: 'mag', value: 0.1 + 0.4 * random(), within: true }, { kind: 'rl', value: 6 + 14 * random(), within: true }]);
    else goal = pick([{ kind: 'r', value: logU(-0.5, 0.5) }, { kind: 'g', value: logU(-0.5, 0.5) }, { kind: 'x', value: (random() - 0.5) * 3 }, { kind: 'b', value: (random() - 0.5) * 3 }, { kind: 'vswr', value: 1.5 }]);
    if (random() < 0.2 && c.parts.length > 1) goal.node = 1 + Math.floor(random() * c.parts.length);
    return goal;
  }

  // ---- the 1-D scan of one part ---------------------------------------------------------------------------------
  // A part's value at scan coordinate u, and the solver's coordinate of that value (Domain: atan of the added
  // quantity, unrolled stubs; lengths for a line) with its period; `real` whether the value is of the part's own kind.
  const M = 20000;
  function scanPart(c, k) {
    const out = [];
    for (let i = 0; i < M; i++) out.push(partAt(c, k, (i + 0.5) / M));
    return out;
  }
  function partAt(c, k, u) {
    const p = c.parts[k], w0 = TAU * c.f0, z0 = c.z0;
    {
      let part, coord, real = true, per = Math.PI;
      switch (p.kind) {
        case SERIES_R: { const t = u * HALF_PI; part = { kind: p.kind, value: z0 * Math.tan(t) }; coord = t; per = 0; break; }
        case SHUNT_R: { const t = u * HALF_PI; part = { kind: p.kind, value: z0 / Math.tan(t) }; coord = t; per = 0; break; }
        case QUARTER: { const t = u * HALF_PI; part = { kind: p.kind, value: z0 * Math.sqrt(Math.tan(t)) }; coord = t; per = 0; break; }
        case SERIES_L: case SERIES_C: {
          const t = -HALF_PI + u * Math.PI, x = Math.tan(t);
          part = x >= 0 ? { kind: SERIES_L, value: (x * z0) / w0 } : { kind: SERIES_C, value: -1 / (w0 * x * z0) };
          real = part.kind === p.kind; coord = t; break;
        }
        case SHUNT_L: case SHUNT_C: {
          const t = -HALF_PI + u * Math.PI, b = Math.tan(t);
          part = b >= 0 ? { kind: SHUNT_C, value: b / (w0 * z0) } : { kind: SHUNT_L, value: -z0 / (w0 * b) };
          real = part.kind === p.kind; coord = t; break;
        }
        case LINE: { const len = 0.5 * u; part = { kind: LINE, value: len, zc: p.zc }; coord = TAU * len; per = Math.PI; break; }
        default: {
          // Stubs: the length over [0, λ/2); the coordinate is atan of the stub's b (mod π).
          const len = 0.5 * u, th = TAU * len, zn = p.zc / z0;
          const b = p.kind === STUB_OPEN ? Math.tan(th) / zn : -1 / (Math.tan(th) * zn);
          part = { kind: p.kind, value: len, zc: p.zc }; coord = Math.atan(b);
        }
      }
      return { part, coord, real, per };
    }
  }
  // The solver's coordinate of the part as it is.
  function coordNow(c, k) {
    const p = c.parts[k], w0 = TAU * c.f0, z0 = c.z0;
    switch (p.kind) {
      case SERIES_R: return Math.atan(p.value / z0);
      case SHUNT_R: return Math.atan(z0 / p.value);
      case QUARTER: return Math.atan((p.value / z0) ** 2);
      case SERIES_L: return Math.atan((w0 * p.value) / z0);
      case SERIES_C: return Math.atan(-1 / (w0 * p.value * z0));
      case SHUNT_C: return Math.atan(w0 * p.value * z0);
      case SHUNT_L: return Math.atan(-z0 / (w0 * p.value));
      case LINE: return TAU * (p.value % 0.5);
      default: { const th = TAU * p.value, zn = p.zc / z0; return Math.atan(p.kind === STUB_OPEN ? Math.tan(th) / zn : -1 / (Math.tan(th) * zn)); }
    }
  }
  const dist = (a, b, per) => { let d = Math.abs(a - b); if (per) { d %= per; d = Math.min(d, per - d); } return d; };

  // ==============================================================================================================
  section('suggest: re-evaluated, singles vs scan, pairs vs solve');
  const timesStart = [], timesTen = [];
  {
    let problems = 0, sugs = 0, singlesChecked = 0, scanBetter = 0, pairsChecked = 0, holds = 0, statuses = {};
    const START = 300;
    while (problems < START) {
      const c = randomCircuit(1 + Math.floor(random() * 5));
      const goal = randomGoal(c);
      if (GL.goalProblem(goal, c.parts.length)) continue;
      problems++;
      const res = suggest(c, goal, { max: Infinity });
      statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      const desc = JSON.stringify({ c, goal });
      const node = goalNode(goal, c), point = goal.kind === 'point', within = GL.isWithin(goal);
      if (res.status === 'holds') {
        holds++;
        const [gr, gi] = gammaOf(c, node);
        ok(within ? GL.goalSigned(goal, gr, gi) <= 0 : GL.goalResidual(goal, gr, gi, c.z0) <= ACCEPT, `holds, re-evaluated: ${desc}`);
        continue;
      }
      // Every suggestion re-evaluated.
      for (const s of res.list) {
        sugs++;
        const [gr, gi] = gammaOf(applied(c, s.solution), node);
        const gm = Math.hypot(gr, gi), resid = GL.goalResidual(goal, gr, gi, c.z0), mis = GL.goalMismatch(goal, gr, gi, c.z0);
        const tol = 1e-9 * Math.max(1, gm);
        ok(Math.abs(gm - s.solution.gamma) <= tol && Math.abs(mis - s.solution.mismatch) <= 1e-9 * Math.max(1, mis), `|Γ| ${gm} / mismatch ${mis} re-evaluated vs stated ${s.solution.gamma} / ${s.solution.mismatch}: ${desc}`);
        if (s.meets) ok(within ? GL.goalSigned(goal, gr, gi) <= 1e-9 : resid <= 1e-9, `meets, re-evaluated (residual ${resid}): ${desc}`);
        ok(s.variants.length >= 1 && s.variants.every((v) => v.values.length === s.solution.values.length), `variants: ${desc}`);
        ok(s.unknowns.length === s.solution.values.length && s.solution.changed === s.unknowns.length, `changed parts: ${desc}`);
      }
      // Sorted by the ranking.
      for (let i = 1; i < res.list.length; i++) ok(rankSuggestions(res.list[i - 1], res.list[i]) <= 0, `ranking at ${i}: ${desc}`);
      // Singles vs the scan.
      for (let k = 0; k < node; k++) {
        const single = res.list.find((s) => s.unknowns.length === 1 && s.unknowns[0].part === k);
        const scan = scanPart(c, k), t0 = coordNow(c, k);
        const values = scan.map(({ part }) => {
          const cc = { ...c, parts: c.parts.map((p, j) => (j === k ? part : p)) };
          const [gr, gi] = gammaOf(cc, node);
          return { gr, gi, s: GL.goalSigned(goal, gr, gi), m: GL.goalMismatch(goal, gr, gi, c.z0) };
        });
        // Per realisability: the nearest root (circle), nearest point inside (inequality), smallest mismatch (point).
        const best = { true: Infinity, false: Infinity };
        for (let i = 0; i < M; i++) {
          const v = values[i], sc = scan[i];
          if (!(Math.abs(v.gr) < Infinity && Math.abs(v.gi) < Infinity)) continue;
          if (point) { if (v.m < best[sc.real]) best[sc.real] = v.m; continue; }
          const pole = GL.goalPole(goal);
          if (pole && Math.hypot(v.gr - pole, v.gi) < 1e-6) continue;
          if (within) { if (v.s <= 0) { const d = dist(sc.coord, t0, sc.per); if (d < best[sc.real]) best[sc.real] = d; } continue; }
          const j = i + 1;
          if (j < M && values[j].s * v.s <= 0 && scan[j].real === sc.real) {
            // Bisect the sign change; a jump through the goal's pole (the short or open) is no root.
            const at = (u) => { const q = partAt(c, k, u); const [gr, gi] = gammaOf({ ...c, parts: c.parts.map((p, m) => (m === k ? q.part : p)) }, node); return { q, gr, gi, s: GL.goalSigned(goal, gr, gi) }; };
            let lo = (i + 0.5) / M, hi = (j + 0.5) / M, slo = v.s;
            for (let it = 0; it < 60; it++) { const mid = 0.5 * (lo + hi), e = at(mid); if ((e.s < 0) === (slo < 0)) { lo = mid; slo = e.s; } else hi = mid; }
            const e = at(0.5 * (lo + hi));
            if (GL.goalResidual(goal, e.gr, e.gi, c.z0) > 1e-9 || (pole && Math.hypot(e.gr - pole, e.gi) < 1e-6)) continue;
            const d = dist(e.q.coord, t0, sc.per);
            if (d < best[sc.real]) best[sc.real] = d;
          }
        }
        if (!single) {
          // None for this part: the scan finds nothing to offer either (a point target always has a best value unless the part is stuck).
          const any = point ? false : best.true < Infinity || best.false < Infinity;
          if (any) { scanBetter++; ok(false, `part ${k + 1}: the scan reaches the goal at ${Math.min(best.true, best.false)} but no single is suggested: ${desc}`); }
          continue;
        }
        singlesChecked++;
        const s = single.solution, real = s.realisable;
        if (point) {
          const ref = real ? best.true : Math.min(best.true, best.false);
          if (!(s.mismatch <= ref + 1e-7)) { scanBetter++; ok(false, `part ${k + 1}: the scan's mismatch ${ref} beats the suggestion's ${s.mismatch}: ${desc}`); } else ok(true);
        } else {
          const ref = real ? best.true : best.false;
          if (!(s.change <= ref + 1e-7)) { scanBetter++; ok(false, `part ${k + 1}: the scan reaches the goal at distance ${ref}, the suggestion at ${s.change}: ${desc}`); } else ok(true);
          if (!real) ok(!(best.true < Infinity), `part ${k + 1}: a swapped single while the scan has a realisable value: ${desc}`);
        }
      }
      // Pairs vs solve().
      if (point) {
        for (let a = 0; a < node; a++) for (let b = a + 1; b < node; b++) {
          const r = solve(c, [{ part: a }, { part: b }], goal);
          if (r.status !== 'solved') continue;
          for (const s of r.solutions) {
            if (s.changed !== 2 || !(s.residual <= ACCEPT)) continue;
            pairsChecked++;
            ok(res.list.some((x) => x.unknowns.length === 2 && x.unknowns[0].part === a && x.unknowns[1].part === b
              && x.solution.values.every((v, i) => v.coord === s.values[i].coord)), `pair ${a + 1}, ${b + 1}: solve's solution is not suggested: ${desc}`);
          }
        }
      }
      // Deterministic, and a cap is a prefix.
      const again = suggest(c, goal, { max: Infinity });
      ok(JSON.stringify(again) === JSON.stringify(res), `the same suggestions twice: ${desc}`);
      const capped = suggest(c, goal);
      ok(capped.list.length === Math.min(MAX_SUGGESTIONS, res.list.length)
        && capped.list.every((s, i) => JSON.stringify(s.solution) === JSON.stringify(res.list[i].solution)), `the cap keeps the first ${MAX_SUGGESTIONS}: ${desc}`);
    }
    ok(singlesChecked > 150 && pairsChecked > 50, `enough singles (${singlesChecked}) and pairs (${pairsChecked}) checked`);
    console.log(`  suggest: ${problems} problems (${JSON.stringify(statuses)}), ${sugs} suggestions re-evaluated, ${singlesChecked} singles against the scan (${scanBetter} worse), ${pairsChecked} pairs against solve(), ${holds} already held`);
  }

  // ==============================================================================================================
  section('suggest: cases');
  {
    // A start circuit whose load moved: an exact L-match exists (the pair), and singles give their best values.
    const c = { ...ST.defaultCircuit(), loadR: 30, loadX: 10 };
    const res = suggest(c, { kind: 'point' });
    ok(res.status === 'some' && res.list[0].meets && res.list[0].unknowns.length === 2 && res.list[0].solution.realisable,
      `start circuit, load 30 + j10 Ω: an exact realisable pair first (${res.list[0] && JSON.stringify(res.list[0].unknowns)})`);
    ok(res.list.filter((s) => s.unknowns.length === 1).every((s) => !s.meets), 'start circuit: no single part reaches the centre');
    ok(suggest(ST.defaultCircuit(), { kind: 'point' }).status === 'holds', 'the start circuit already matches: holds');
    ok(suggest(c, { kind: 'point', node: 9 }).status === 'rejected', 'a goal node past the input: rejected');
    ok(suggest({ ...c, parts: [] }, { kind: 'point' }).status === 'none', 'no parts: none');
    const v = suggest(c, { kind: 'vswr', value: 1.5, within: true });
    ok(v.status === 'some' && v.list.every((s) => s.unknowns.length === 1 && s.meets && s.ranges.length >= 1), 'VSWR ≤ 1.5: singles with their ranges, no pairs');
    ok(suggest(c, { kind: 'point' }, { singlesOnly: true }).list.every((s) => s.unknowns.length === 1), 'singlesOnly: no pairs');
    ok(suggest(c, { kind: 'point' }, { max: 2 }).list.length === 2, 'max 2');
  }

  // ==============================================================================================================
  section('solver worker core');
  {
    const ask = (c, unknowns, goal) => ({ ...c, ask: { unknowns, goal } });
    const strip = (r) => JSON.stringify({ ...r, family: null }, (k, v) => (v instanceof Float64Array ? Array.from(v) : v));
    const cases = [
      ask({ z0: 50, f0: 1e8, loadR: 100, loadX: 50, parts: [{ kind: LINE, value: 0.3, zc: 75 }] }, [{ part: 0, param: 'zc' }, { part: 0, param: 'f0' }], { kind: 'point' }),
      ask({ z0: 50, f0: 1e8, loadR: 100, loadX: 50, parts: [{ kind: LINE, value: 0.2, zc: 75 }, { kind: QUARTER, value: 60 }] }, [{ part: 1 }, { part: 0, param: 'f0' }], { kind: 'point' }),
      ask({ z0: 50, f0: 1e8, loadR: 25, loadX: 25, parts: [{ kind: SERIES_C, value: 3e-11 }, { kind: SHUNT_L, value: 8e-8 }] }, [{ part: 0 }, { part: 0, param: 'f0' }], { kind: 'vswr', value: 1.5 }),
      ask({ z0: 50, f0: 1e8, loadR: 25, loadX: 25, parts: [{ kind: SERIES_C, value: 3e-11 }, { kind: SHUNT_L, value: 8e-8 }] }, [{ part: 1 }], { kind: 'mag', value: 0.2, within: true }),
      ask({ z0: 50, f0: 1e8, loadR: 25, loadX: 25, parts: [{ kind: SERIES_C, value: 3e-11 }, { kind: SHUNT_L, value: 8e-8 }] }, [{ part: 0 }, { part: 1 }], { kind: 'g', value: 1 }),
    ];
    for (const c of cases) {
      const reply = J.runJob({ kind: 'solve', circuit: c });
      const direct = solve(c, c.ask.unknowns, c.ask.goal);
      ok(reply.kind === 'solve' && strip(reply.result) === strip(direct), `runJob solve equals solve(): ${JSON.stringify(c.ask)}`);
      ok(reply.result.family === null, 'runJob: no family closure crosses to the page');
      let cloned = null;
      try { cloned = structuredClone(reply); } catch { /* fails below */ }
      ok(cloned && strip(cloned.result) === strip(direct), `runJob's reply survives structured cloning: ${JSON.stringify(c.ask)}`);
      const sj = J.runJob({ kind: 'suggest', circuit: { ...c, ask: { unknowns: [], goal: c.ask.goal } } });
      const sd = suggest(c, c.ask.goal);
      ok(sj.kind === 'suggest' && JSON.stringify(sj.suggestions) === JSON.stringify(sd), 'runJob suggest equals suggest()');
      let sc = null;
      try { sc = structuredClone(sj); } catch { /* fails below */ }
      ok(sc && JSON.stringify(sc.suggestions) === JSON.stringify(sd), 'runJob suggest survives structured cloning');
    }
    // BL57 through the page's path: a shunt R of 0 Ω onto x = 0.
    const bl57 = ask({ z0: 0.01, f0: 347640.8933728079, loadR: 0.00035465564922237464, loadX: -0.00822924286978905, parts: [{ kind: STUB_SHORT, value: 0.30427571006119253, zc: 0.016679042058429527 }, { kind: SHUNT_C, value: 0.00014943687403592176 }, { kind: SHUNT_R, value: 0.0007411742279090949 }] }, [{ part: 1 }, { part: 2 }], { kind: 'x', value: 0 });
    const r57 = J.runJob({ kind: 'solve', circuit: bl57 }).result;
    ok(r57.status === 'family' && r57.ranges.length === 2, `BL57 via runJob: a family over every C (${r57.status}, ${r57.ranges.length})`);
  }

  // ==============================================================================================================
  section('suggest: timing');
  {
    const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
    const start = { ...ST.defaultCircuit(), loadR: 30, loadX: 10 };
    const startMedian = () => { timesStart.length = 0; for (let i = 0; i < 300; i++) { const t = performance.now(); suggest(start, { kind: 'point' }); timesStart.push(performance.now() - t); } return median(timesStart); };
    const ten = { z0: 50, f0: 1e8, loadR: 18, loadX: -30, parts: [
      { kind: SERIES_L, value: 2e-8 }, { kind: SHUNT_C, value: 1.5e-11 }, { kind: LINE, value: 0.11, zc: 60 }, { kind: STUB_OPEN, value: 0.07, zc: 50 },
      { kind: SERIES_C, value: 4e-11 }, { kind: QUARTER, value: 45 }, { kind: SHUNT_L, value: 9e-8 }, { kind: SERIES_R, value: 2 },
      { kind: STUB_SHORT, value: 0.2, zc: 70 }, { kind: SERIES_L, value: 1e-8 }] };
    const tenMedian = () => { timesTen.length = 0; for (let i = 0; i < 100; i++) { const t = performance.now(); suggest(ten, { kind: 'point' }); timesTen.push(performance.now() - t); } return median(timesTen); };
    const tenCircle = [];
    for (let i = 0; i < 100; i++) { const t = performance.now(); suggest(ten, { kind: 'vswr', value: 1.5, within: true }); tenCircle.push(performance.now() - t); }
    const { value: ms, note: startNote } = retried(startMedian, (x) => x < 1);
    const { value: mt, note: tenNote } = retried(tenMedian, (x) => x < 10);
    const mc = median(tenCircle);
    console.log(`  suggest timing (medians): start circuit ${ms.toFixed(3)} ms, ten parts point target ${mt.toFixed(2)} ms (55 solves), ten parts VSWR ≤ 1.5 ${mc.toFixed(3)} ms`);
    ok(ms < 1, `start circuit under 1 ms (${ms.toFixed(3)} ms)${startNote}`);
    ok(mt < 10, `ten parts under 10 ms in the worker (${mt.toFixed(2)} ms)${tenNote}`);
  }
}
