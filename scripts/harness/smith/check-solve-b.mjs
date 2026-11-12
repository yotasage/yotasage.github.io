// Checks of the solver's step M4.1b (lib/smith/solve.ts, search.ts, goal.ts), run by check.mjs with its counters:
// the best value of one unknown with a point target against a 100,000-value scan (300 random problems, every part
// kind); the ranges of inequality goals against 10,000 sampled values each (300 problems) and a case worked by hand;
// families of two unknowns with a circle goal (200 problems: members re-evaluated by network.ts, a 2-D scan finds no
// solution outside the ranges); the fallback search (a λ/4 line's Zc = √(Z0·RL), a single-section transformer's Zc and
// length, LC, stub and line resonances in f0; random Zc and f0 problems against a 100,000-point scan; two unknowns
// against a 200 × 200 grid with Newton); the same JSON on a second run; a fuzz of 10,000 problems; timings.
// Every value is computed here from its coordinate with parts.ts and evaluated with network.ts, not with the solver.

import * as importedSolve from '../../../lib/smith/solve.ts';
import * as importedGoal from '../../../lib/smith/goal.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';

const S = importedSolve.default ?? importedSolve;
const GL = importedGoal.default ?? importedGoal;
const P = importedParts.default ?? importedParts;
const N = importedNetwork.default ?? importedNetwork;
const cv = importedConvert.default ?? importedConvert;
const { solve, ACCEPT } = S;
const { goalResidual, goalSigned, goalMismatch, goalMag } = GL;
const { SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER, PART_KINDS, packParts, valueFor, noEffect } = P;
const { evaluate, nodeGamma, loadNode, applyPart, NODE_STRIDE } = N;
const { zFromGamma } = cv;

const TAU = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
const isLC = (k) => k === SERIES_L || k === SERIES_C || k === SHUNT_L || k === SHUNT_C;
const isSeriesKind = (k) => k <= SERIES_C;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

export function runSolveMoreChecks({ section, ok, near, random }) {
  const logU = (lo, hi) => 10 ** (lo + (hi - lo) * random());
  const pick = (a) => a[Math.floor(random() * a.length)];
  const w2 = new Float64Array(8);
  const nd = new Float64Array(NODE_STRIDE), pre = new Float64Array(NODE_STRIDE);

  // ----- independent evaluation
  function gammaOf(circuit, parts, n, f = circuit.f0) {
    const packed = packParts(parts), nodes = new Float64Array((parts.length + 1) * NODE_STRIDE);
    evaluate(nodes, packed, parts.length, circuit.loadR, circuit.loadX, circuit.z0, f, circuit.f0);
    nodeGamma(w2, 0, nodes, n * NODE_STRIDE);
    return [w2[0], w2[1]];
  }
  function applied(circuit, sol) {
    const parts = circuit.parts.map((p) => ({ ...p }));
    let f = circuit.f0;
    for (const v of sol.values) {
      if (v.param === 'f0') f = v.value;
      else if (v.param === 'zc') parts[v.part].zc = v.value;
      else parts[v.part] = { kind: v.kind, value: v.value, zc: v.zc };
    }
    return { parts, f };
  }
  function evalSolution(circuit, goal, sol, node) {
    const { parts, f } = applied(circuit, sol);
    const g = gammaOf(circuit, parts, node, f);
    return { residual: goalResidual(goal, g[0], g[1], circuit.z0), mismatch: goalMismatch(goal, g[0], g[1], circuit.z0), g };
  }

  // A part's value from its coordinate (solve.ts's Domain): the angle-mapped added quantity, a length.
  function partFor(kind, zc, coord, z0, f0) {
    if (kind === LINE) return { kind, value: coord, zc, swapped: false };
    let t = coord;
    if (t > HALF_PI || t < -HALF_PI) t -= Math.PI * Math.round(t / Math.PI);
    const p = Math.abs(t) >= HALF_PI ? Infinity : Math.tan(t);
    if (kind === QUARTER) return { kind, value: z0 * Math.sqrt(p), zc, swapped: false };
    if (kind === STUB_OPEN && coord >= Math.PI) return { kind, value: 0.5, zc, swapped: false };
    let k = kind;
    if (isLC(kind)) {
      if (isSeriesKind(kind)) k = p >= 0 ? SERIES_L : SERIES_C; else k = p >= 0 ? SHUNT_C : SHUNT_L;
    }
    let q = p;
    if (Math.abs(p) === Infinity && isLC(k)) q = P.REACH_HI[k] === Infinity ? Infinity : -Infinity;
    const value = q === 0 ? noEffect(k, f0, f0) : valueFor(k, q, zc, f0, f0, z0);
    return { kind: k, value, zc, swapped: k !== kind };
  }

  function randomPart(kind, z0, w0) {
    const a = logU(-1.5, 1.5);
    switch (kind) {
      case SERIES_R: return { kind, value: a * z0 };
      case SERIES_L: return { kind, value: (a * z0) / w0 };
      case SERIES_C: return { kind, value: 1 / (w0 * a * z0) };
      case SHUNT_R: return { kind, value: z0 / a };
      case SHUNT_L: return { kind, value: z0 / (w0 * a) };
      case SHUNT_C: return { kind, value: a / (w0 * z0) };
      case QUARTER: return { kind, value: z0 * logU(-0.5, 0.5) };
      default: return { kind, value: 0.5 * random(), zc: z0 * logU(-0.5, 0.5) };
    }
  }
  const LOSSLESS = [SERIES_L, SERIES_C, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER];
  function randomLoad(z0) {
    const mag = Math.sqrt(random()) * 0.97, ang = TAU * random();
    zFromGamma(w2, 0, mag * Math.cos(ang), mag * Math.sin(ang));
    return [w2[0] * z0, w2[1] * z0];
  }
  // A ladder with `kinds` unknown parts and 0–2 fixed parts before, between and after.
  function randomLadder(kinds) {
    const z0 = pick([50, 75, 1, 300, 0.01, 1e4]), f0 = logU(5, 10), w0 = TAU * f0;
    const [loadR, loadX] = randomLoad(z0);
    const parts = [], unknowns = [];
    const fixed = () => parts.push(randomPart(random() < 0.9 ? pick(LOSSLESS) : pick([SERIES_R, SHUNT_R]), z0, w0));
    for (let k = Math.floor(random() * 3); k > 0; k--) fixed();
    for (const kind of kinds) {
      unknowns.push({ part: parts.length, free: isLC(kind) && random() < 0.4 });
      parts.push(randomPart(kind, z0, w0));
      for (let k = Math.floor(random() * 3); k > 0; k--) fixed();
    }
    return { circuit: { z0, f0, loadR, loadX, parts }, unknowns };
  }
  function randomTarget(goal, z0) {
    if (random() < 0.4) {
      const mag = Math.sqrt(random()) * 0.9, ang = TAU * random();
      zFromGamma(w2, 0, mag * Math.cos(ang), mag * Math.sin(ang));
      goal.targetR = w2[0] * z0; goal.targetX = w2[1] * z0;
    }
    return goal;
  }
  // The node at the goal from the prefix node before part a (pre) with part a set, then parts a + 1 … g − 1.
  function fromPrefix(packed, a, part, g, z0, f0) {
    nd[0] = pre[0]; nd[1] = pre[1]; nd[2] = pre[2]; nd[3] = pre[3];
    applyPart(nd, 0, part.kind, part.value, part.zc ?? 0, f0, f0, z0);
    for (let k = a + 1; k < g; k++) applyPart(nd, 0, packed[3 * k], packed[3 * k + 1], packed[3 * k + 2], f0, f0, z0);
    nodeGamma(w2, 0, nd, 0);
  }
  function prefix(circuit, packed, a, f = circuit.f0) {
    loadNode(pre, 0, circuit.loadR, circuit.loadX, circuit.z0);
    for (let k = 0; k < a; k++) applyPart(pre, 0, packed[3 * k], packed[3 * k + 1], packed[3 * k + 2], f, circuit.f0, circuit.z0);
  }

  // ===============================================================================================================
  section('solve best value');
  {
    const SCAN = 100000;
    let n = 0, exact = 0, swappedBest = 0, worstRel = 0;
    const kindsSeen = new Set();
    while (n < 300) {
      const kind = n < 10 * PART_KINDS ? n % PART_KINDS : Math.floor(random() * PART_KINDS);
      const { circuit, unknowns } = randomLadder([kind]);
      const a = unknowns[0].part;
      const goal = randomTarget({ kind: 'point' }, circuit.z0);
      if (random() < 0.2) goal.node = a + 1 + Math.floor(random() * (circuit.parts.length - a));
      const res = solve(circuit, unknowns, goal);
      if (res.status === 'none' && /fixed point/.test(res.reason)) continue;
      n++;
      kindsSeen.add(kind);
      ok(res.status === 'best' || res.status === 'solved', `best ${n}: status ${res.status} (${res.reason})`);
      if (!res.solutions.length) continue;
      if (res.status === 'solved') exact++;
      const g = res.goalNode, { z0, f0 } = circuit, part = circuit.parts[a], zc = part.zc ?? 0;
      for (const s of res.solutions) {
        const e = evalSolution(circuit, goal, s, g);
        ok(Math.abs(e.mismatch - s.mismatch) <= 1e-9 * Math.max(1, s.mismatch), `best ${n}: reported mismatch ${s.mismatch}, re-evaluated ${e.mismatch}`);
      }
      const packed = packParts(circuit.parts);
      prefix(circuit, packed, a);
      const d = res.domains[0];
      let scanMin = Infinity, scanReal = Infinity;
      const free = unknowns[0].free;
      for (let i = 0; i <= SCAN; i++) {
        const t = d.lo + ((d.hi - d.lo) * i) / SCAN;
        const pf = partFor(kind, zc, t, z0, f0);
        if (!(pf.value >= 0) || (kind === QUARTER && !(pf.value > 0 && pf.value < Infinity))) continue;
        fromPrefix(packed, a, pf, g, z0, f0);
        const m = goalMismatch(goal, w2[0], w2[1], z0);
        if (!(m === m)) continue;
        if (m < scanMin) scanMin = m;
        if ((free || !pf.swapped) && m < scanReal) scanReal = m;
      }
      const solverMin = Math.min(...res.solutions.map((s) => s.mismatch));
      const realSols = res.solutions.filter((s) => s.realisable);
      const solverReal = realSols.length ? Math.min(...realSols.map((s) => s.mismatch)) : Infinity;
      if (!res.solutions[0].realisable || res.solutions.some((s) => !s.realisable)) swappedBest++;
      worstRel = Math.max(worstRel, (solverMin - scanMin) / Math.max(scanMin, 1e-300));
      ok(solverMin <= scanMin * (1 + 1e-9) + 1e-12, `best ${n} (kind ${kind}): solver ${solverMin} vs scan minimum ${scanMin}`);
      if (res.status === 'best') ok(solverReal <= scanReal * (1 + 1e-9) + 1e-12, `best ${n} (kind ${kind}): best realisable ${solverReal} vs scan ${scanReal}`);
    }
    ok(kindsSeen.size === PART_KINDS, 'every part kind as the unknown');
    console.log(`solve best: 300 problems against ${SCAN} values each, ${exact} exact hits, ${swappedBest} with a swapped best, solver − scan worst ${worstRel.toExponential(2)} (relative)`);
  }

  // ===============================================================================================================
  section('solve ranges');
  {
    // By hand: 25 Ω on Z0 = 50 Ω with a series L, |Γ| ≤ 0.4: x² ≤ (0.16·2.25 − 0.25)/(1 − 0.16).
    const f0 = 1e9, w0 = TAU * f0;
    const circuit = { z0: 50, f0, loadR: 25, loadX: 0, parts: [{ kind: SERIES_L, value: 1e-9 }] };
    const res = solve(circuit, [{ part: 0 }], { kind: 'mag', value: 0.4, within: true });
    const xMax = Math.sqrt((0.16 * 2.25 - 0.25) / 0.84);
    ok(res.status === 'range' && res.ranges.length === 2, `25 Ω, series L, |Γ| ≤ 0.4: two ranges (${res.status}, ${res.ranges.length})`);
    const rc = res.ranges.find((r) => r.kind === SERIES_C), rl = res.ranges.find((r) => r.kind === SERIES_L);
    if (rl && rc) {
      near(rl.min, 0, 'L from 0'); near(rl.max, (xMax * 50) / w0, 'L up to x = 0.3619', 1e-9);
      near(rc.min, 1 / (w0 * xMax * 50), 'C from 1/(ω·x·Z0)', 1e-9); ok(rc.max === Infinity, 'C up to ∞');
      ok(rc.swapped && !rl.swapped, 'the C range is the swapped one');
      ok(res.solutions.length === 2, 'the two edges as solutions');
    }
    // Every value keeps it: a shunt C on a matched load with |Γ| ≤ 1.
    const all = solve({ z0: 50, f0, loadR: 50, loadX: 0, parts: [{ kind: SERIES_R, value: 10 }] }, [{ part: 0 }], { kind: 'mag', value: 1, within: true });
    ok(all.status === 'range' && all.ranges.length === 1 && all.ranges[0].t0 === 0 && all.ranges[0].t1 === HALF_PI, `|Γ| ≤ 1 holds for every R (${all.status})`);

    const SAMPLES = 10000;
    let n = 0, bad = 0, withRanges = 0, rangeCount = 0, skipped = 0;
    while (n < 300) {
      const kind = n < 10 * PART_KINDS ? n % PART_KINDS : Math.floor(random() * PART_KINDS);
      const { circuit, unknowns } = randomLadder([kind]);
      const a = unknowns[0].part;
      const goal = pick([
        () => ({ kind: 'mag', value: 0.05 + 0.85 * random(), within: true }),
        () => ({ kind: 'vswr', value: 1.05 + 4 * random(), within: true }),
        () => ({ kind: 'rl', value: 1 + 25 * random(), within: true }),
      ])();
      if (random() < 0.2) goal.node = a + 1 + Math.floor(random() * (circuit.parts.length - a));
      const res = solve(circuit, unknowns, goal);
      if (res.status === 'none' && /fixed point/.test(res.reason)) continue;
      n++;
      ok(res.status === 'range' || res.status === 'none', `ranges ${n}: status ${res.status} (${res.reason})`);
      if (res.ranges.length) withRanges++;
      rangeCount += res.ranges.length;
      const g = res.goalNode, { z0, f0: fz } = circuit, part = circuit.parts[a], zc = part.zc ?? 0, m = goalMag(goal);
      const d = res.domains[0], edges = [];
      for (const r of res.ranges) {
        edges.push(r.t0, r.t1);
        ok(r.t0 < r.t1 && r.t0 >= d.lo && r.t1 <= d.hi && r.min <= r.max && r.min === r.min && r.max === r.max, `ranges ${n}: a range ${JSON.stringify(r)}`);
      }
      const packed = packParts(circuit.parts);
      prefix(circuit, packed, a);
      let wrong = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const t = d.lo + (d.hi - d.lo) * random();
        if (edges.some((e) => Math.abs(e - t) <= 1e-9 * Math.max(1, Math.abs(t)))) { skipped++; continue; }
        const pf = partFor(kind, zc, t, z0, fz);
        if (kind === QUARTER && !(pf.value > 0 && pf.value < Infinity)) continue;
        fromPrefix(packed, a, pf, g, z0, fz);
        const mag = Math.hypot(w2[0], w2[1]);
        const meets = mag <= m;
        const inside = res.ranges.some((r) => t >= r.t0 && t <= r.t1);
        if (meets !== inside && Math.abs(mag - m) > 1e-12) wrong++;
      }
      if (wrong) { bad++; ok(false, `ranges ${n} (kind ${kind}): ${wrong} of ${SAMPLES} samples disagree with ${JSON.stringify(res.ranges)}`); }
    }
    ok(bad === 0, `ranges: 300 problems × ${SAMPLES} samples agree (${bad} bad)`);
    console.log(`solve ranges: 300 problems, ${withRanges} with ranges (${rangeCount} ranges), ${skipped} samples within 1e-9 of an edge skipped`);
  }

  // ===============================================================================================================
  section('solve families');
  {
    const GA = 300, GB = 400;
    let n = 0, fams = 0, members = 0, worst = 0, outside = 0, emptyInside = 0, insideSamples = 0;
    const GEO = [SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER];
    while (n < 200) {
      const kinds = [pick(GEO), pick(GEO)];
      const { circuit, unknowns } = randomLadder(kinds);
      const b = unknowns[1].part;
      const goal = pick([
        () => ({ kind: 'mag', value: 0.05 + 0.85 * random(), within: random() < 0.3 }),
        () => ({ kind: 'vswr', value: 1.05 + 4 * random() }),
        () => ({ kind: 'rl', value: 1 + 25 * random() }),
        () => ({ kind: 'r', value: pick([1, 0.5, 2]) }),
        () => ({ kind: 'g', value: pick([1, 0.5, 2]) }),
        () => ({ kind: 'x', value: pick([0, 1, -0.5]) }),
        () => ({ kind: 'b', value: pick([0, 1, -0.5]) }),
      ])();
      if (random() < 0.2) goal.node = b + 1 + Math.floor(random() * (circuit.parts.length - b));
      const res = solve(circuit, unknowns, goal);
      if (res.status === 'none' && /fixed point|goal circle itself/.test(res.reason)) continue;
      n++;
      ok(res.status === 'family' || res.status === 'none', `family ${n}: status ${res.status} (${res.reason})`);
      const g = res.goalNode, { z0, f0 } = circuit;
      if (res.status === 'family') {
        fams++;
        for (const r of res.ranges) {
          for (let k = 1; k <= 20; k++) {
            const t = r.t0 + ((r.t1 - r.t0) * k) / 21;
            const sols = res.family.at(t);
            insideSamples++;
            if (!sols.length) emptyInside++;
            for (const s of sols) {
              members++;
              const e = evalSolution(circuit, goal, s, g);
              worst = Math.max(worst, e.residual);
              ok(e.residual <= 1e-9, `family ${n}: a member re-evaluated has residual ${e.residual}`);
            }
          }
        }
        for (const s of res.family.ends) ok(evalSolution(circuit, goal, s, g).residual <= 1e-9, `family ${n}: an end re-evaluated`);
      }
      // 2-D scan: a on a grid of its domain, b's coordinate scanned for sign changes of the goal's signed distance.
      const a = unknowns[0].part, pa = circuit.parts[a], pb = circuit.parts[b];
      const [da, db] = res.domains;
      const packed = packParts(circuit.parts);
      for (let i = 0; i < GA; i++) {
        const ta = da.lo + ((da.hi - da.lo) * (i + 0.5)) / GA;
        const partA = partFor(pa.kind, pa.zc ?? 0, ta, z0, f0);
        if (pa.kind === QUARTER && !(partA.value > 0 && partA.value < Infinity)) continue;
        loadNode(pre, 0, circuit.loadR, circuit.loadX, z0);
        for (let k = 0; k < b; k++) {
          if (k === a) applyPart(pre, 0, partA.kind, partA.value, partA.zc ?? 0, f0, f0, z0);
          else applyPart(pre, 0, packed[3 * k], packed[3 * k + 1], packed[3 * k + 2], f0, f0, z0);
        }
        const fb = (tb) => {
          const partB = partFor(pb.kind, pb.zc ?? 0, tb, z0, f0);
          if (pb.kind === QUARTER && !(partB.value > 0 && partB.value < Infinity)) return NaN;
          fromPrefix(packed, b, partB, g, z0, f0);
          return goalSigned(goal, w2[0], w2[1]);
        };
        let tPrev = db.lo + (db.hi - db.lo) * 0.5 / GB, fPrev = fb(tPrev), found = false;
        for (let j = 1; j < GB && !found; j++) {
          const t = db.lo + ((db.hi - db.lo) * (j + 0.5)) / GB, f = fb(t);
          if (f === f && fPrev === fPrev && (f < 0) !== (fPrev < 0)) {
            let lo = tPrev, hi = t, flo = fPrev;
            for (let it = 0; it < 60; it++) { const mid = 0.5 * (lo + hi), fm = fb(mid); if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid; }
            fb(0.5 * (lo + hi));
            if (goalResidual(goal, w2[0], w2[1], z0) <= 1e-9) found = true;
          }
          tPrev = t; fPrev = f;
        }
        if (found && !res.ranges.some((r) => ta >= r.t0 - 1e-6 && ta <= r.t1 + 1e-6)) {
          outside++;
          ok(false, `family ${n}: the scan finds a solution at a = ${ta} outside the ranges ${JSON.stringify(res.ranges.map((r) => [r.t0, r.t1]))} (${JSON.stringify({ circuit, unknowns, goal })})`);
          break;
        }
      }
    }
    ok(outside === 0, `families: no solution of the 2-D scan outside the ranges (${outside})`);
    ok(emptyInside <= insideSamples * 0.001, `families: a value inside a range has a member (${emptyInside} of ${insideSamples} without)`);
    console.log(`solve families: 200 problems, ${fams} families, ${members} members re-evaluated (worst residual ${worst.toExponential(2)}), ${emptyInside} of ${insideSamples} inside samples without a member`);
  }

  // ===============================================================================================================
  section('solve fallback search');
  const fallbackRuns = [];
  {
    const run = (circuit, unknowns, goal) => { const r = solve(circuit, unknowns, goal); fallbackRuns.push({ circuit, unknowns, goal, json: JSON.stringify(r) }); return r; };
    const allGood = (circuit, goal, res, what) => {
      for (const s of res.solutions) ok(evalSolution(circuit, goal, s, res.goalNode).residual <= 1e-9, `${what}: a solution re-evaluated`);
    };
    // λ/4 line of unknown Zc from 100 Ω to 50 Ω: Zc = √(50·100).
    let c = { z0: 50, f0: 1e9, loadR: 100, loadX: 0, parts: [{ kind: LINE, value: 0.25, zc: 60 }] };
    let r = run(c, [{ part: 0, param: 'zc' }], { kind: 'point' });
    ok(r.status === 'solved' && r.solutions.length === 1, `λ/4 line's Zc: solved once (${r.status}, ${r.solutions.length})`);
    if (r.solutions[0]) near(r.solutions[0].values[0].value, Math.sqrt(5000), 'λ/4 line Zc = √(Z0·RL)', 1e-9);
    r = run(c, [{ part: 0, param: 'zc' }], { kind: 'vswr', value: 1 });
    ok(r.status === 'solved' && r.solutions[0] && Math.abs(r.solutions[0].values[0].value - Math.sqrt(5000)) < 1e-9 * 70.8, `λ/4 line's Zc for VSWR = 1 (${r.status})`);
    // A shorter line misses: the best Zc.
    c = { z0: 50, f0: 1e9, loadR: 100, loadX: 0, parts: [{ kind: LINE, value: 0.1, zc: 60 }] };
    r = run(c, [{ part: 0, param: 'zc' }], { kind: 'point' });
    ok(r.status === 'best' && r.solutions.length === 1, `0.1 λ line's Zc: the best value (${r.status})`);
    // Single-section transformer: 100 + j50 Ω to 50 Ω, Zc = √(Z0(|ZL|² − Z0·RL)/(RL − Z0)) = 86.6025 Ω, ℓ = λ/3.
    c = { z0: 50, f0: 1e9, loadR: 100, loadX: 50, parts: [{ kind: LINE, value: 0.1, zc: 60 }] };
    r = run(c, [{ part: 0, param: 'zc' }, { part: 0 }], { kind: 'point' });
    ok(r.status === 'solved' && r.solutions.length === 1, `single-section transformer: one solution (${r.status}, ${r.solutions.length})`);
    if (r.solutions[0]) {
      const vl = r.solutions[0].values.find((v) => v.param === 'value'), vz = r.solutions[0].values.find((v) => v.param === 'zc');
      near(vz.value, Math.sqrt(7500), 'single-section Zc', 1e-9);
      near(vl.value, 1 / 3, 'single-section length λ/3', 1e-9);
    }
    allGood(c, { kind: 'point' }, r, 'single-section');
    // The same line of a fixed physical length (0.3 λ at f0) with Zc and f0 unknown (the grid with Newton): matched where
    // the length is λ/3 + k·λ/2, so f/f0 = (1/3 + k/2)/0.3 for k = 0…5 in f0/10…10·f0, each with Zc = 86.6025 Ω.
    c = { z0: 50, f0: 1e9, loadR: 100, loadX: 50, parts: [{ kind: LINE, value: 0.3, zc: 60 }] };
    r = run(c, [{ part: 0, param: 'zc' }, { part: 0, param: 'f0' }], { kind: 'point' });
    const ff = r.solutions.map((s) => s.values.find((v) => v.param === 'f0').value / 1e9).sort((x, y) => x - y);
    ok(ff.length === 6 && ff.every((v, k) => Math.abs(v - (1 / 3 + k / 2) / 0.3) < 1e-9 * v), `Zc and f0 of a 0.3 λ line: six frequencies (${ff})`);
    ok(r.solutions.length === 6 && r.solutions.every((s) => Math.abs(s.values.find((v) => v.param === 'zc').value - Math.sqrt(7500)) < 1e-9 * 86.6), 'each with Zc = 86.6025 Ω');
    allGood(c, { kind: 'point' }, r, 'Zc and f0');
    // LC resonance in f0: series L 100 nH and series C 10 pF on 50 Ω, x = 0 at f = 1/(2π√(LC)).
    c = { z0: 50, f0: 1.5e8, loadR: 50, loadX: 0, parts: [{ kind: SERIES_L, value: 100e-9 }, { kind: SERIES_C, value: 10e-12 }] };
    const fr = 1 / (TAU * Math.sqrt(100e-9 * 10e-12));
    r = run(c, [{ part: 0, param: 'f0' }], { kind: 'x', value: 0 });
    ok(r.status === 'solved' && r.solutions.length === 1, `LC resonance: one frequency (${r.status}, ${r.solutions.length})`);
    if (r.solutions[0]) near(r.solutions[0].values[0].value, fr, 'LC resonance f = 1/(2π√(LC))', 1e-9);
    r = run(c, [{ part: 0, param: 'f0' }], { kind: 'point' });
    ok(r.status === 'solved' && r.solutions[0] && Math.abs(r.solutions[0].values[0].value / fr - 1) < 1e-9, `LC resonance as a point target (${r.status})`);
    // A shorted stub of 0.2 λ at f0 = 1 GHz on 50 Ω: matched (b = 0) at f/f0 = 1.25, 3.75, 6.25, 8.75. (The goal
    // b = 0 would also take 2.5, 5, 7.5 and 10, where the stub is a short: the real axis passes through it.)
    c = { z0: 50, f0: 1e9, loadR: 50, loadX: 0, parts: [{ kind: STUB_SHORT, value: 0.2, zc: 50 }] };
    r = run(c, [{ part: 0, param: 'f0' }], { kind: 'point' });
    const fs = r.solutions.map((s) => s.values[0].value / 1e9).sort((x, y) => x - y);
    ok(fs.length === 4 && [1.25, 3.75, 6.25, 8.75].every((v, i) => Math.abs(fs[i] - v) < 1e-9 * v), `short stub resonances at 1.25, 3.75, 6.25, 8.75 GHz (${fs})`);
    ok(r.solutions.length === 4 && r.solutions.every((s, i) => i === 0 || s.change >= r.solutions[i - 1].change), 'nearest f0 first');
    // A 0.3 λ line on 100 Ω: zero reactance where its length is a multiple of λ/4: f/f0 = k·0.25/0.3, k = 1…12.
    c = { z0: 50, f0: 1e9, loadR: 100, loadX: 0, parts: [{ kind: LINE, value: 0.3, zc: 50 }] };
    r = run(c, [{ part: 0, param: 'f0' }], { kind: 'x', value: 0 });
    const fl = r.solutions.map((s) => s.values[0].value / 1e9).sort((x, y) => x - y);
    ok(fl.length === 12 && fl.every((v, i) => Math.abs(v - ((i + 1) * 0.25) / 0.3) < 1e-9 * v), `0.3 λ line: 12 frequencies of zero reactance (${fl.length})`);
    // An inequality goal in f0: the band of |Γ| ≤ 1/3 of the LC circuit.
    c = { z0: 50, f0: 1.5e8, loadR: 50, loadX: 0, parts: [{ kind: SERIES_L, value: 100e-9 }, { kind: SERIES_C, value: 10e-12 }] };
    r = run(c, [{ part: 0, param: 'f0' }], { kind: 'vswr', value: 2, within: true });
    // |Γ| ≤ 1/3 ⇔ |x| ≤ 1/√2 (z = 1 + jx, |Γ|² = x²/(4 + x²)): ωL − 1/(ωC) = ±50/√2.
    const edge = (s) => { const L = 100e-9, C = 10e-12, bq = (-s * 50) / Math.SQRT2; return (-bq + Math.sqrt(bq * bq + (4 * L) / C)) / (2 * L) / TAU; };
    ok(r.status === 'range' && r.ranges.length === 1, `LC band for VSWR ≤ 2: one range (${r.status})`);
    if (r.ranges[0]) { near(r.ranges[0].min, edge(-1), 'band from', 1e-9); near(r.ranges[0].max, edge(1), 'band to', 1e-9); }

    // Random one-unknown problems (a line's Zc, f0) with circle goals against a 100,000-point scan of the coordinate.
    const SCAN = 100000;
    let probs = 0, scanRoots = 0, missed = 0, solverRoots = 0;
    for (let n = 0; n < 200; n++) {
      const z0 = pick([50, 75, 1, 300]), f0 = logU(6, 10), w0 = TAU * f0;
      const [loadR, loadX] = randomLoad(z0);
      const parts = [];
      for (let k = 1 + Math.floor(random() * 4); k > 0; k--) parts.push(randomPart(pick(LOSSLESS), z0, w0));
      const isF = n % 2 === 1;
      let unk;
      if (isF) unk = { part: 0, param: 'f0' };
      else { const k = Math.floor(random() * parts.length); parts[k] = { kind: LINE, value: 0.02 + 0.45 * random(), zc: z0 * logU(-0.5, 0.5) }; unk = { part: k, param: 'zc' }; }
      const goal = pick([{ kind: 'mag', value: 0.1 + 0.8 * random() }, { kind: 'r', value: 1 }, { kind: 'g', value: 1 }, { kind: 'x', value: 0 }, { kind: 'b', value: 0 }]);
      const circuit = { z0, f0, loadR, loadX, parts };
      const res = run(circuit, [unk], goal);
      probs++;
      allGood(circuit, goal, res, `fallback ${n}`);
      solverRoots += res.solutions.length;
      const d = res.domains[0];
      const fcoord = (t) => {
        let ps = parts, f = f0;
        if (isF) f = f0 * Math.exp(t);
        else { ps = parts.map((p) => ({ ...p })); ps[unk.part].zc = z0 * Math.tan(t); }
        const gm = gammaOf(circuit, ps, parts.length, f);
        return goalSigned(goal, gm[0], gm[1]);
      };
      // The scan uses fewer points for the costly copies of a part list: 100,000 for f0 is the bar, Zc 20,000.
      const ns = isF ? SCAN : 20000;
      let tp = d.lo + (d.hi - d.lo) * 0.5 / ns, fp = fcoord(tp);
      for (let i = 1; i < ns; i++) {
        const t = d.lo + ((d.hi - d.lo) * (i + 0.5)) / ns, f = fcoord(t);
        if (f === f && fp === fp && (f < 0) !== (fp < 0)) {
          let lo = tp, hi = t, flo = fp;
          for (let it = 0; it < 70; it++) { const mid = 0.5 * (lo + hi), fm = fcoord(mid); if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid; }
          const root = 0.5 * (lo + hi);
          // A root of the scan is one if the goal's residual there is small (not a pole of the signed distance).
          let ps = parts, ff = f0;
          if (isF) ff = f0 * Math.exp(root); else { ps = parts.map((p) => ({ ...p })); ps[unk.part].zc = z0 * Math.tan(root); }
          const gm = gammaOf(circuit, ps, parts.length, ff);
          if (goalResidual(goal, gm[0], gm[1], z0) <= 1e-9) {
            scanRoots++;
            if (!res.solutions.some((s) => Math.abs(s.values[0].coord - root) <= 1e-6 * Math.max(1, Math.abs(root)))) {
              missed++;
              ok(false, `fallback ${n}: the scan's root at ${root} is not among ${JSON.stringify(res.solutions.map((s) => s.values[0].coord))} (${JSON.stringify({ circuit, unk, goal })})`);
            }
          }
        }
        tp = t; fp = f;
      }
    }
    ok(missed === 0, `fallback: every root of the dense scan found (${scanRoots} roots, ${missed} missed)`);
    console.log(`solve fallback: ${probs} random one-unknown problems, ${solverRoots} solutions, ${scanRoots} roots in the scan, ${missed} missed`);

    // Random two-unknown problems with a line's Zc or f0, a point target: against a 200 × 200 grid with Newton.
    let two = 0, gridFound = 0, gridMissed = 0;
    const F2 = new Float64Array(2), tgt = new Float64Array(2);
    for (let n = 0; n < 50; n++) {
      const z0 = pick([50, 75]), f0 = 1e9, w0 = TAU * f0;
      const [loadR, loadX] = randomLoad(z0);
      const parts = [{ kind: LINE, value: 0.05 + 0.4 * random(), zc: z0 * logU(-0.3, 0.3) }];
      for (let k = Math.floor(random() * 2); k > 0; k--) parts.push(randomPart(pick(LOSSLESS), z0, w0));
      const unks = n % 2 ? [{ part: 0, param: 'zc' }, { part: 0 }] : [{ part: 0, param: 'zc' }, { part: parts.length - 1, free: isLC(parts[parts.length - 1].kind) }];
      const circuit = { z0, f0, loadR, loadX, parts };
      const goal = { kind: 'point' };
      const res = run(circuit, unks, goal);
      two++;
      allGood(circuit, goal, res, `fallback two ${n}`);
      GL.goalTarget(tgt, 0, goal, z0);
      const [d0, d1] = res.domains;
      const sorted = res.unknowns;
      const setAt = (x, y) => {
        const ps = parts.map((p) => ({ ...p }));
        for (const [u, t] of [[sorted[0], x], [sorted[1], y]]) {
          if (u.param === 'zc') ps[u.part].zc = z0 * Math.tan(t);
          else { const pf = partFor(ps[u.part].kind, ps[u.part].zc ?? 0, t, z0, f0); ps[u.part] = { kind: pf.kind, value: pf.value, zc: ps[u.part].zc }; }
        }
        return ps;
      };
      const Fn = (x, y) => { const gm = gammaOf(circuit, setAt(x, y), parts.length); F2[0] = gm[0] - tgt[0]; F2[1] = gm[1] - tgt[1]; return Math.hypot(F2[0], F2[1]); };
      const G = 200;
      const vals = new Float64Array(G * G);
      const X = (i) => d0.lo + ((d0.hi - d0.lo) * (i + 0.5)) / G, Y = (j) => d1.lo + ((d1.hi - d1.lo) * (j + 0.5)) / G;
      for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) { const v = Fn(X(i), Y(j)); vals[i * G + j] = v === v ? v : Infinity; }
      for (let i = 1; i < G - 1; i++) {
        for (let j = 1; j < G - 1; j++) {
          const v = vals[i * G + j];
          let low = v < 0.05;
          for (let di = -1; di <= 1 && low; di++) for (let dj = -1; dj <= 1 && low; dj++) if (di || dj) low = v <= vals[(i + di) * G + j + dj];
          if (!low) continue;
          let x = X(i), y = Y(j), rr = v;
          for (let it = 0; it < 30 && rr > 1e-13; it++) {
            const f0x = F2[0], f0y = F2[1];
            Fn(x, y); const a0 = F2[0], b0 = F2[1];
            const h = 1e-7;
            Fn(x + h, y); const ax = (F2[0] - a0) / h, bx = (F2[1] - b0) / h;
            Fn(x, y + h); const ay = (F2[0] - a0) / h, by = (F2[1] - b0) / h;
            const det = ax * by - ay * bx;
            if (!det) break;
            const dx = -(by * a0 - ay * b0) / det, dy = -(ax * b0 - bx * a0) / det;
            if (!(Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2)) break;
            x += dx; y += dy; rr = Fn(x, y);
            void f0x; void f0y;
          }
          if (!(rr <= 1e-11) || x < d0.lo || x > d0.hi || y < d1.lo || y > d1.hi) continue;
          gridFound++;
          const has = res.solutions.some((s) => {
            const c0 = s.values[0].coord, c1 = s.values[1].coord;
            const dd = (u, a, b) => { if (u.param === 'zc') return Math.abs(a - b); const per = u.part === 0 && parts[0].kind === LINE && u.param !== 'zc' ? 0.5 : Math.PI; let e = Math.abs(a - b) % per; return Math.min(e, per - e); };
            return dd(sorted[0], c0, x) < 1e-6 && dd(sorted[1], c1, y) < 1e-6;
          });
          if (!has) { gridMissed++; ok(false, `fallback two ${n}: the grid's solution (${x}, ${y}) is not among ${JSON.stringify(res.solutions.map((s) => s.values.map((v) => v.coord)))}`); }
        }
      }
    }
    ok(gridMissed === 0, `fallback, two unknowns: every solution of a 200 × 200 grid with Newton found (${gridFound} found, ${gridMissed} missed)`);
    console.log(`solve fallback two: ${two} problems, ${gridFound} grid solutions, ${gridMissed} missed`);

    let same = 0;
    for (const f of fallbackRuns) if (JSON.stringify(solve(f.circuit, f.unknowns.slice().reverse(), f.goal)) === f.json) same++;
    ok(same === fallbackRuns.length, `fallback: the same JSON on a second run (${same} of ${fallbackRuns.length})`);
  }

  // ===============================================================================================================
  section('solve M4.1b fuzz');
  {
    let bad = 0, total = 0;
    const statuses = {};
    const fin = (v) => v === v;
    for (let n = 0; n < 10000; n++) {
      const z0 = pick([50, 75, 1, 300, 0.01, 1e4]), f0 = logU(5, 10), w0 = TAU * f0;
      let loadR, loadX;
      switch (Math.floor(random() * 6)) {
        case 0: loadR = Infinity; loadX = 0; break;
        case 1: loadR = 0; loadX = 0; break;
        case 2: loadR = 0; loadX = z0 * (6 * random() - 3); break;
        case 3: loadR = z0; loadX = 0; break;
        default: [loadR, loadX] = randomLoad(z0);
      }
      const count = 1 + Math.floor(random() * 6), parts = [];
      for (let k = 0; k < count; k++) {
        const kind = Math.floor(random() * PART_KINDS), part = randomPart(kind, z0, w0);
        if (random() < 0.1 && kind <= SHUNT_C) part.value = random() < 0.5 ? 0 : Infinity;
        parts.push(part);
      }
      const nu = random() < 0.5 ? 2 : 1, unknowns = [];
      for (let i = 0; i < nu; i++) {
        const part = Math.floor(random() * count), r = random();
        unknowns.push({ part, free: random() < 0.3, param: r < 0.15 ? 'zc' : r < 0.22 ? 'f0' : undefined });
      }
      const goal = pick([
        () => randomTarget({ kind: 'point' }, z0),
        () => ({ kind: 'point', targetR: pick([Infinity, 0, z0]), targetX: 0 }),
        () => ({ kind: 'mag', value: random(), within: random() < 0.5 }),
        () => ({ kind: 'vswr', value: 1 + 5 * random(), within: random() < 0.5 }),
        () => ({ kind: 'rl', value: 20 * random(), within: random() < 0.5 }),
        () => ({ kind: pick(['r', 'g']), value: pick([0, 1, Infinity]) }),
        () => ({ kind: pick(['x', 'b']), value: pick([0, 1]) }),
        () => ({ kind: 'mag', value: pick([0, 1]), within: random() < 0.5 }),
      ])();
      if (random() < 0.2) goal.node = Math.floor(random() * (count + 1));
      const circuit = { z0, f0, loadR, loadX, parts };
      let res;
      try { res = solve(circuit, unknowns, goal); } catch (e) { bad++; ok(false, `M4.1b fuzz ${n}: threw ${e.stack}`); continue; }
      total++;
      statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      let fine = typeof res.reason === 'string' && res.circles.every(fin);
      const checkSol = (s, mustMeet) => {
        fine &&= Number.isFinite(s.residual) && Number.isFinite(s.mismatch) && Number.isFinite(s.gamma) && Number.isFinite(s.change);
        for (const v of s.values) fine &&= fin(v.value) && fin(v.added) && fin(v.coord) && v.value >= 0;
        const e = evalSolution(circuit, goal, s, res.goalNode);
        fine &&= mustMeet ? e.residual <= 1e-9 : Math.abs(e.residual - s.residual) <= 1e-9;
      };
      for (const s of res.solutions) checkSol(s, res.status !== 'best');
      for (const r of res.ranges) fine &&= r.t0 < r.t1 && fin(r.min) && fin(r.max) && r.min <= r.max && (r.branches === 1 || r.branches === 2);
      if (res.family) {
        const r = res.ranges[0];
        for (const s of res.family.at(0.5 * (r.t0 + r.t1))) checkSol(s, true);
      }
      if (!fine) { bad++; ok(false, `M4.1b fuzz ${n}: NaN, ∞ or a residual in ${JSON.stringify({ circuit, unknowns, goal })} → ${JSON.stringify(res).slice(0, 1500)}`); }
    }
    ok(bad === 0, `M4.1b fuzz: ${total} problems without NaN (${bad} bad)`);
    console.log(`solve M4.1b fuzz: ${total} problems, statuses ${JSON.stringify(statuses)}`);
  }

  // ===============================================================================================================
  section('solve M4.1b timing');
  {
    const z0 = 50, f0 = 1e8;
    const parts = [
      { kind: SERIES_L, value: 40e-9 }, { kind: SHUNT_C, value: 20e-12 }, { kind: LINE, value: 0.1, zc: 60 }, { kind: STUB_OPEN, value: 0.1, zc: 60 },
      { kind: SERIES_C, value: 30e-12 }, { kind: SHUNT_L, value: 60e-9 }, { kind: STUB_SHORT, value: 0.1, zc: 60 }, { kind: SERIES_L, value: 5e-9 },
      { kind: SHUNT_C, value: 2e-12 }, { kind: QUARTER, value: 70 },
    ];
    const circuit = { z0, f0, loadR: 25, loadX: 25, parts };
    const time = (fn, batches, per) => {
      for (let k = 0; k < per; k++) fn(k);
      const out = [];
      for (let b = 0; b < batches; b++) {
        const t0 = performance.now();
        for (let k = 0; k < per; k++) fn(k);
        out.push((performance.now() - t0) / per);
      }
      return median(out);
    };
    let sink = 0;
    const centre = { kind: 'point' };
    const bestT = time((k) => { sink += solve(circuit, [{ part: k % 9 }], centre).solutions.length; }, 30, 100);
    const rangeT = time((k) => { sink += solve(circuit, [{ part: k % 9 }], { kind: 'vswr', value: 1.5, within: true }).ranges.length; }, 30, 100);
    const famT = time((k) => { sink += solve(circuit, [{ part: k % 4 }, { part: 4 + (k % 5) }], { kind: 'vswr', value: 1.5 }).ranges.length; }, 20, 20);
    const zcT = time(() => { sink += solve(circuit, [{ part: 2, param: 'zc' }], { kind: 'vswr', value: 1.5 }).solutions.length; }, 20, 10);
    const zcBestT = time(() => { sink += solve(circuit, [{ part: 2, param: 'zc' }], centre).solutions.length; }, 20, 10);
    const fT = time(() => { sink += solve(circuit, [{ part: 0, param: 'f0' }], { kind: 'vswr', value: 1.5 }).solutions.length; }, 20, 10);
    const twoT = time(() => { sink += solve(circuit, [{ part: 2, param: 'zc' }, { part: 2 }], centre).solutions.length; }, 10, 5);
    const twoFT = time(() => { sink += solve(circuit, [{ part: 0, param: 'f0' }, { part: 4 }], centre).solutions.length; }, 10, 5);
    const ms = (x) => `${x.toFixed(3)} ms`;
    ok(sink > 0, 'timing ran');
    ok(Math.max(zcT, zcBestT, fT, twoT, twoFT) < 5, `fallback search in a 10-part circuit under 5 ms (Zc ${ms(zcT)}, Zc best ${ms(zcBestT)}, f0 ${ms(fT)}, Zc + length ${ms(twoT)}, f0 + C ${ms(twoFT)})`);
    console.log(`solve M4.1b timing (10 parts, medians): best value ${(bestT * 1000).toFixed(1)} µs, ranges ${(rangeT * 1000).toFixed(1)} µs, family ${ms(famT)}, fallback: Zc circle goal ${ms(zcT)}, Zc best ${ms(zcBestT)}, f0 circle goal ${ms(fT)}, Zc + length ${ms(twoT)}, f0 + series C ${ms(twoFT)}`);
  }
}
