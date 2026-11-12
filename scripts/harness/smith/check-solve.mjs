// Checks of lib/smith/goal.ts and lib/smith/solve.ts (step M4.1a), run by check.mjs with its counters: the L-match,
// single-stub, line + lumped and λ/4 cases of facts-cases.md solved to a residual below 1e-9 with the source's values
// to the digits it gives; 500+ random two-unknown point-target problems against a 400 × 400 brute-force scan of the
// two angle-mapped values (refined by Newton steps; every near-solution found must be one the solver returned);
// random one-unknown circle goals against a 1-D scan of 10,000 values; coincident circles, tangency, wrong-sign
// answers as the other kind, lengths and their λ/2 period, statuses and reasons, the same order on every run; a fuzz
// of 10,000 problems with open, short and rim loads (no NaN); and the time of one solve.

import * as importedSolve from '../../../lib/smith/solve.ts';
import * as importedGoal from '../../../lib/smith/goal.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import * as importedGeometry from '../../../lib/smith/geometry.ts';

const S = importedSolve.default ?? importedSolve;
const GL = importedGoal.default ?? importedGoal;
const P = importedParts.default ?? importedParts;
const N = importedNetwork.default ?? importedNetwork;
const cv = importedConvert.default ?? importedConvert;
const G = importedGeometry.default ?? importedGeometry;
const { solve, ACCEPT } = S;
const { goalResidual, goalSigned, goalCircle, goalTarget } = GL;
const { SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER, PART_KINDS, packParts, valueFor } = P;
const { evaluate, nodeGamma, loadNode, applyPart, NODE_STRIDE } = N;
const { gammaFromZ, zFromGamma } = cv;
const { circleIntersect, CROSS_SAME } = G;

const TAU = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
const isLC = (k) => k === SERIES_L || k === SERIES_C || k === SHUNT_L || k === SHUNT_C;
const isSeriesKind = (k) => k <= SERIES_C;

export function runSolveChecks({ section, ok, near, printed, random }) {
  const logU = (lo, hi) => 10 ** (lo + (hi - lo) * random());
  const pick = (a) => a[Math.floor(random() * a.length)];
  const w2 = new Float64Array(8);

  // ----- evaluation of a solution by network.ts, independent of the solver's maps
  function gammaAt(circuit, parts, n) {
    const packed = packParts(parts), nodes = new Float64Array((parts.length + 1) * NODE_STRIDE);
    evaluate(nodes, packed, parts.length, circuit.loadR, circuit.loadX, circuit.z0, circuit.f0, circuit.f0);
    nodeGamma(w2, 0, nodes, n * NODE_STRIDE);
    return [w2[0], w2[1]];
  }
  function applied(circuit, sol) {
    const parts = circuit.parts.map((p) => ({ ...p }));
    for (const v of sol.values) parts[v.part] = { kind: v.kind, value: v.value, zc: v.zc };
    return parts;
  }
  function residualOf(circuit, goal, sol, res) {
    const g = gammaAt(circuit, applied(circuit, sol), res.goalNode);
    return goalResidual(goal, g[0], g[1], circuit.z0);
  }
  const loadOfGamma = (gr, gi, z0) => { zFromGamma(w2, 0, gr, gi); return [w2[0] * z0, w2[1] * z0]; };

  // ----- a part's value from a coordinate: the angle-mapped added quantity, or a length
  const halfDomain = (k) => k === SERIES_R || k === SHUNT_R || k === QUARTER;
  function partFor(kind, zc, coord, z0, f0) {
    if (kind === LINE) return { kind, value: coord, zc };
    const p = Math.abs(coord) >= HALF_PI ? Infinity : Math.tan(coord);
    if (kind === QUARTER) return { kind, value: z0 * Math.sqrt(p), zc };
    let k = kind;
    if (isLC(kind)) {
      if (isSeriesKind(kind)) k = p >= 0 ? SERIES_L : SERIES_C; else k = p >= 0 ? SHUNT_C : SHUNT_L;
    }
    let value = valueFor(k, p, zc, f0, f0, z0);
    if (p === 0) value = P.noEffect(k, f0, f0);
    return { kind: k, value, zc };
  }
  // A solution value's coordinate and the distance of two coordinates (projective: period π; lengths: λ/2 as π).
  const coordOfValue = (v) => (v.kind === LINE ? v.added : Math.atan(v.added));
  function coordDist(line, a, b) {
    if (line) { let d = Math.abs(a - b) % 0.5; if (d > 0.25) d = 0.5 - d; return TAU * d; }
    let d = Math.abs(a - b) % Math.PI; if (d > HALF_PI) d = Math.PI - d; return d;
  }

  // ----- random parts and problems
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
  // A lossless fixed part (R parts make many problems unreachable, which the scan then has nothing to check).
  const FIXED_KINDS = [SERIES_L, SERIES_C, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER, SERIES_R, SHUNT_R];
  function randomLoad(z0) {
    const mag = Math.sqrt(random()) * 0.97, ang = TAU * random();
    return loadOfGamma(mag * Math.cos(ang), mag * Math.sin(ang), z0);
  }
  function randomTwo() {
    const z0 = pick([50, 75, 1, 300, 0.01, 1e4]), f0 = logU(5, 10), w0 = TAU * f0;
    const [loadR, loadX] = randomLoad(z0);
    const parts = [], unknowns = [];
    const fixed = () => parts.push(randomPart(random() < 0.85 ? pick(FIXED_KINDS.slice(0, 8)) : pick(FIXED_KINDS), z0, w0));
    for (let k = Math.floor(random() * 3); k > 0; k--) fixed();
    for (let u = 0; u < 2; u++) {
      const kind = Math.floor(random() * PART_KINDS);
      unknowns.push({ part: parts.length, free: isLC(kind) && random() < 0.5 });
      parts.push(randomPart(kind, z0, w0));
      for (let k = Math.floor(random() * 3); k > 0; k--) fixed();
    }
    const count = parts.length, b = unknowns[1].part;
    const goal = { kind: 'point' };
    if (random() < 0.2) goal.node = b + 1 + Math.floor(random() * (count - b));
    if (random() < 0.4) {
      const mag = Math.sqrt(random()) * 0.9, ang = TAU * random();
      [goal.targetR, goal.targetX] = loadOfGamma(mag * Math.cos(ang), mag * Math.sin(ang), z0);
    }
    return { circuit: { z0, f0, loadR, loadX, parts }, unknowns, goal };
  }

  // ===============================================================================================================
  section('solve cases');
  {
    const lumpedCase = (z0, f0, loadR, loadX, kinds, goal = { kind: 'point' }, free = [false, false], zc = 0) => {
      const circuit = { z0, f0, loadR, loadX, parts: kinds.map((kind) => (kind >= LINE && kind <= STUB_SHORT ? { kind, value: 0.1, zc } : kind === QUARTER ? { kind, value: z0 } : { kind, value: kind === SERIES_C || kind === SHUNT_L || kind === SHUNT_R ? Infinity : 0 })) };
      const unknowns = kinds.map((_, i) => ({ part: i, free: free[i] }));
      const res = solve(circuit, unknowns, goal);
      ok(res.status === 'solved', `${kinds} on ${loadR}+j${loadX}: solved (${res.status}: ${res.reason})`);
      for (const s of res.solutions) ok(residualOf(circuit, goal, s, res) < 1e-9 && s.residual < 1e-9, `${kinds} on ${loadR}+j${loadX}: residual ${s.residual}`);
      return res;
    };
    const find = (res, fn, what) => { const s = res.solutions.find(fn); ok(!!s, `${what}: a solution as the source's`); return s ?? res.solutions[0]; };

    // C20: single shunt stub, Z0 50, load 33.9 + j17.6, all lines 50 Ω.
    for (const stub of [STUB_OPEN, STUB_SHORT]) {
      const res = lumpedCase(50, 1e9, 33.9, 17.6, [LINE, stub], undefined, undefined, 50);
      eq(res.solutions.length, 2, 'C20 two stub positions');
      const s = find(res, (x) => Math.abs(x.values[0].value - 0.0200672) < 1e-5, 'C20');
      near(s.values[0].value, 0.02006726246, 'C20 ℓ1 (λ)');
      printed(s.values[0].value, '0.020', 'C20 ℓ1 as printed');
      near(s.values[1].value, stub === STUB_OPEN ? 0.08357481879 : 0.3335748188, `C20 ${stub === STUB_OPEN ? 'open' : 'short'} stub (λ)`);
      printed(s.values[1].value, stub === STUB_OPEN ? '0.084' : '0.334', 'C20 stub as printed');
      ok(s.values[0].period === 0.5 && s.values[1].period === 0.5, 'C20 lengths carry the λ/2 period');
    }
    // C21, C22: line + series C, line + shunt C at 1.5 GHz.
    {
      const res = lumpedCase(50, 1.5e9, 33.9, 17.6, [LINE, SERIES_C], undefined, undefined, 50);
      const s = res.solutions[0];
      ok(s.realisable && s.values[1].kind === SERIES_C, 'C21 the realisable solution (a series C) first');
      near(TAU * s.values[0].value, 0.4080555190, 'C21 βℓ');
      near(s.values[1].value, 3.662680493e-12, 'C21 C');
      printed(TAU * s.values[0].value, '0.408', 'C21 βℓ as printed');
      printed(s.values[1].value * 1e12, '3.7', 'C21 C (pF) as printed');
      ok(res.solutions.length === 2 && res.solutions[1].atF0Only && res.solutions[1].values[1].kind === SERIES_L, 'C21 the other line length needs an L: offered as one, true at f0 only');
    }
    {
      const res = lumpedCase(50, 1.5e9, 33.9, 17.6, [LINE, SHUNT_C], undefined, undefined, 50);
      const s = res.solutions[0];
      ok(s.realisable && s.values[1].kind === SHUNT_C, 'C22 the shunt C solution first');
      near(TAU * s.values[0].value, 0.1260863287, 'C22 βℓ');
      near(s.values[1].value, 1.229472165e-12, 'C22 C');
      printed(TAU * s.values[0].value, '0.126', 'C22 βℓ as printed');
      printed(s.values[1].value * 1e12, '1.2', 'C22 C (pF) as printed');
    }
    // C23: L network 100 → 1700 Ω at 900 MHz, shunt C at the load, series L at the source.
    {
      const res = lumpedCase(100, 900e6, 1700, 0, [SHUNT_C, SERIES_L]);
      const s = res.solutions[0];
      ok(s.realisable && s.values[0].kind === SHUNT_C && s.values[1].kind === SERIES_L, 'C23 the realisable L network first');
      near(s.values[1].value, 70.73553026e-9, 'C23 L');
      near(s.values[0].value, 0.4160913545e-12, 'C23 C');
      printed(s.values[1].value * 1e9, '70.7', 'C23 L (nH) as printed');
      printed(s.values[0].value * 1e12, '0.416', 'C23 C (pF) as printed');
      const t = res.solutions[1];
      ok(res.solutions.length === 2 && !t.realisable && t.atF0Only && t.values[0].kind === SHUNT_L && t.values[1].kind === SERIES_C && t.values.every((v) => v.swapped && v.value > 0),
        'C23 the series-C version is offered with both parts swapped to the other kind, positive values, true at f0 only');
    }
    // C24: 50 → 75 Ω, two solutions (free reactance and susceptance).
    {
      const res = lumpedCase(50, 1e8, 75, 0, [SHUNT_C, SERIES_L], undefined, [true, true]);
      eq(res.solutions.length, 2, 'C24 two solutions');
      const xs = res.solutions.map((s) => s.values[1].added * 50), xp = res.solutions.map((s) => -50 / s.values[0].added);
      for (let i = 0; i < 2; i++) {
        near(Math.abs(xs[i]), 35.35533906, 'C24 |X_S|');
        near(Math.abs(xp[i]), 106.0660172, 'C24 |X_P|');
        printed(Math.abs(xs[i]), '35.35', 'C24 |X_S| as printed (the source truncates)', 1);
        printed(Math.abs(xp[i]), '106.1', 'C24 |X_P| as printed');
        ok(Math.sign(xs[i]) === -Math.sign(xp[i]), 'C24 X_S and X_P of opposite signs (low-pass and high-pass)');
        ok(res.solutions[i].realisable, 'C24 free unknowns are realisable with either sign');
      }
      ok(xs[0] * xs[1] < 0, 'C24 both the low-pass and the high-pass solution');
    }
    // C25: 25 → 200 Ω on Z0 = 50 (target z = 0.5).
    {
      const res = lumpedCase(50, 1e8, 200, 0, [SHUNT_C, SERIES_L], { kind: 'point', targetR: 25, targetX: 0 }, [true, true]);
      const s = find(res, (x) => x.values[1].added > 0, 'C25');
      near(s.values[1].added, 1.322875656, 'C25 x_S');
      near(s.values[0].added, 0.6614378278, 'C25 b_P');
      printed(s.values[1].added, '1.323', 'C25 x_S as printed');
      printed(s.values[1].added * 50, '66.1', 'C25 X_S as printed');
      printed(s.values[0].added / 50 * 1e3, '13.22', 'C25 B_P (mS) as printed (the source truncates)', 1);
      printed(-50 / s.values[0].added, '-75.6', 'C25 X_P as printed');
    }
    // C26: between complex impedances: target z_S* = 0.25 − j0.25, load 50 − j50.
    {
      const res = lumpedCase(50, 1e8, 50, -50, [SHUNT_C, SERIES_L], { kind: 'point', targetR: 12.5, targetX: -12.5 });
      const s = find(res, (x) => x.realisable, 'C26');
      near(s.values[0].added, 0.8228756555, 'C26 b_P');
      near(s.values[1].added, 0.4114378278, 'C26 x_S');
      printed(s.values[0].added, '0.823', 'C26 b_P as printed');
      printed(s.values[1].added, '0.411', 'C26 x_S as printed');
      printed(s.values[0].added / 50 * 1e3, '16.5', 'C26 B_P (mS) as printed');
      printed(s.values[1].added * 50, '20.6', 'C26 X_S as printed');
      printed(-50 / s.values[0].added, '-60.8', 'C26 X_P as printed');
    }
    // C27: 800 MHz, load 17.5 Ω + 6.5 nH: line + series C, and line + shunt L.
    {
      const X = TAU * 800e6 * 6.5e-9;
      near(X, 32.67256360, 'C27 jωL');
      const res = lumpedCase(50, 800e6, 17.5, X, [LINE, SERIES_C], undefined, undefined, 50);
      const s = find(res, (x) => x.values[1].kind === SERIES_C && !x.atF0Only, 'C27 series C');
      near(s.values[0].value, 0.07907895786, 'C27 line (λ)');
      near(s.values[1].value, 2.553952630e-12, 'C27 C_m');
      printed(s.values[0].value, '0.079', 'C27 line as printed');
      printed(s.values[1].value * 1e12, '2.6', 'C27 C_m (pF) as printed');
      const r2 = lumpedCase(50, 800e6, 17.5, X, [LINE, SHUNT_L], undefined, undefined, 50);
      const t = find(r2, (x) => x.values[1].kind === SHUNT_L && !x.atF0Only, 'C27 shunt L');
      near(t.values[0].value, 0.3290789579, 'C27 shunt version line (λ)');
      near(t.values[1].value, 6.384881574e-9, 'C27 L_m');
      printed(t.values[0].value, '0.329', 'C27 shunt version line as printed');
    }
    // C15: line to a real point, then λ/4 (Z_A = 35 + j35, 50 Ω).
    {
      const res = lumpedCase(50, 1e9, 35, 35, [LINE, QUARTER], undefined, undefined, 50);
      eq(res.solutions.length, 2, 'C15 two real points per half wavelength');
      const s = find(res, (x) => Math.abs(x.values[0].value - 0.126) < 1e-3, 'C15');
      near(s.values[0].value, 0.1261367437, 'C15 ℓ1 (λ)');
      near(s.values[1].value, 77.69150130, 'C15 Z02');
      printed(s.values[0].value, '0.126', 'C15 ℓ1 as printed');
      printed(s.values[1].value, '77.7', 'C15 Z02 as printed');
    }
    // C14: λ/4 300 → 50 Ω, one unknown, the goal |Γ| = 0 (a point circle the locus touches).
    {
      const circuit = { z0: 50, f0: 10e9, loadR: 300, loadX: 0, parts: [{ kind: QUARTER, value: 100 }] };
      for (const goal of [{ kind: 'mag', value: 0 }, { kind: 'vswr', value: 1 }]) {
        const res = solve(circuit, [{ part: 0 }], goal);
        ok(res.status === 'solved' && res.solutions.length === 1, `C14 one solution for goal ${goal.kind} (${res.status}, ${res.solutions.length})`);
        const s = res.solutions[0];
        near(s.values[0].value, 122.4744871, 'C14 Zt');
        printed(s.values[0].value, '122.5', 'C14 Zt as printed');
        ok(s.residual < 1e-9 && residualOf(circuit, goal, s, res) < 1e-9, 'C14 residual');
      }
    }
  }
  function eq(actual, expected, what) { ok(actual === expected, `${what}: got ${actual}, wanted ${expected}`); }

  // ===============================================================================================================
  section('solve two unknowns');
  const GRID = 400;
  const determinism = [];
  let problems = 0, scanned = 0, foundTotal = 0, solutionsTotal = 0, worstResidual = 0, coincident = 0;
  {
    const nodeA = new Float64Array(GRID * NODE_STRIDE), nd = new Float64Array(NODE_STRIDE), res2 = new Float64Array(GRID * GRID);
    const tg = new Float64Array(2);
    while (problems < 520) {
      const prob = randomTwo();
      const { circuit, unknowns, goal } = prob;
      const res = solve(circuit, unknowns, goal);
      problems++;
      if (problems <= 200) determinism.push(prob);
      if (res.status !== 'solved' && res.status !== 'none') {
        ok(res.status === 'coincident' || res.status === 'degenerate', `random problem ${problems}: status ${res.status} (${res.reason})`);
        coincident++;
        continue;
      }
      for (const s of res.solutions) {
        const r = residualOf(circuit, goal, s, res);
        worstResidual = Math.max(worstResidual, r);
        ok(r < 1e-9, `random problem ${problems}: a solution re-evaluated by network.ts has residual ${r}`);
      }
      solutionsTotal += res.solutions.length;
      // Brute force over the passive domain of each unknown.
      const { z0, f0, parts } = circuit, a = unknowns[0].part, b = unknowns[1].part, g = res.goalNode;
      const ka = parts[a].kind, kb = parts[b].kind, za = parts[a].zc ?? 0, zb = parts[b].zc ?? 0;
      const lineA = ka === LINE, lineB = kb === LINE;
      const coordAt = (kind, i, n) => (kind === LINE ? (0.5 * (i + 0.5)) / n : halfDomain(kind) ? (HALF_PI * (i + 0.5)) / n : -HALF_PI + (Math.PI * (i + 0.5)) / n);
      const packed = packParts(parts);
      goalTarget(tg, 0, goal, z0);
      const goalAt = (ca, cb) => {
        loadNode(nd, 0, circuit.loadR, circuit.loadX, z0);
        for (let k = 0; k < g; k++) {
          let kind = packed[3 * k], value = packed[3 * k + 1];
          if (k === a) ({ kind, value } = partFor(ka, za, ca, z0, f0));
          else if (k === b) ({ kind, value } = partFor(kb, zb, cb, z0, f0));
          applyPart(nd, 0, kind, value, packed[3 * k + 2], f0, f0, z0);
        }
        nodeGamma(w2, 0, nd, 0);
        return Math.hypot(w2[0] - tg[0], w2[1] - tg[1]);
      };
      for (let i = 0; i < GRID; i++) {
        const pa = partFor(ka, za, coordAt(ka, i, GRID), z0, f0);
        loadNode(nd, 0, circuit.loadR, circuit.loadX, z0);
        for (let k = 0; k < b; k++) applyPart(nd, 0, k === a ? pa.kind : packed[3 * k], k === a ? pa.value : packed[3 * k + 1], packed[3 * k + 2], f0, f0, z0);
        nodeA.set(nd, i * NODE_STRIDE);
      }
      const pbs = [];
      for (let j = 0; j < GRID; j++) pbs.push(partFor(kb, zb, coordAt(kb, j, GRID), z0, f0));
      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          nd[0] = nodeA[i * 4]; nd[1] = nodeA[i * 4 + 1]; nd[2] = nodeA[i * 4 + 2]; nd[3] = nodeA[i * 4 + 3];
          applyPart(nd, 0, pbs[j].kind, pbs[j].value, zb, f0, f0, z0);
          for (let k = b + 1; k < g; k++) applyPart(nd, 0, packed[3 * k], packed[3 * k + 1], packed[3 * k + 2], f0, f0, z0);
          nodeGamma(w2, 0, nd, 0);
          const r = Math.hypot(w2[0] - tg[0], w2[1] - tg[1]);
          res2[i * GRID + j] = r === r ? r : Infinity;
        }
      }
      scanned++;
      // Local minima below 0.1 (periodic in a coordinate unless it is R's or Zt's half line), refined by Newton steps.
      const perA = !halfDomain(ka), perB = !halfDomain(kb);
      const found = [];
      for (let i = 0; i < GRID; i++) {
        for (let j = 0; j < GRID; j++) {
          const r = res2[i * GRID + j];
          if (!(r < 0.1)) continue;
          let isMin = true;
          for (let di = -1; di <= 1 && isMin; di++) {
            for (let dj = -1; dj <= 1 && isMin; dj++) {
              if (!di && !dj) continue;
              let ii = i + di, jj = j + dj;
              if (ii < 0 || ii >= GRID) { if (!perA) continue; ii = (ii + GRID) % GRID; }
              if (jj < 0 || jj >= GRID) { if (!perB) continue; jj = (jj + GRID) % GRID; }
              if (res2[ii * GRID + jj] < r) isMin = false;
            }
          }
          if (!isMin) continue;
          let ca = coordAt(ka, i, GRID), cb = coordAt(kb, j, GRID), rr = r;
          const F = (x, y) => {
            goalAt(x, y);
            return [w2[0] - tg[0], w2[1] - tg[1]];
          };
          for (let it = 0; it < 60 && rr > 1e-13; it++) {
            const f0v = F(ca, cb), h = 1e-7;
            const fa = F(ca + h, cb), fb = F(ca, cb + h);
            const A = (fa[0] - f0v[0]) / h, C = (fa[1] - f0v[1]) / h, B = (fb[0] - f0v[0]) / h, D = (fb[1] - f0v[1]) / h;
            const det = A * D - B * C;
            if (!(Math.abs(det) > 0)) break;
            let da = -(D * f0v[0] - B * f0v[1]) / det, db = -(A * f0v[1] - C * f0v[0]) / det;
            const big = Math.max(Math.abs(da), Math.abs(db));
            if (big > 0.05) { da *= 0.05 / big; db *= 0.05 / big; }
            let lam = 1, moved = false;
            for (let k = 0; k < 20; k++, lam *= 0.5) {
              let na = ca + lam * da, nb = cb + lam * db;
              if (!perA) na = Math.min(HALF_PI, Math.max(0, na));
              if (!perB) nb = Math.min(HALF_PI, Math.max(0, nb));
              const nr = goalAt(na, nb);
              if (nr < rr) { ca = na; cb = nb; rr = nr; moved = true; break; }
            }
            if (!moved) break;
          }
          if (rr < 1e-8 && !found.some(([x, y]) => coordDist(lineA, x, ca) < 1e-6 && coordDist(lineB, y, cb) < 1e-6)) found.push([ca, cb, rr]);
        }
      }
      foundTotal += found.length;
      for (const [ca, cb, rr] of found) {
        // Zt of 0 or ∞ is not a part (a λ/4 transformer of Zt = 0 makes every node a short): the solver leaves those limits out.
        if ((ka === QUARTER && (ca < 1e-6 || ca > HALF_PI - 1e-6)) || (kb === QUARTER && (cb < 1e-6 || cb > HALF_PI - 1e-6))) continue;
        const hit = res.solutions.some((s) => coordDist(lineA, coordOfValue(s.values[0]), ca) < 1e-5 && coordDist(lineB, coordOfValue(s.values[1]), cb) < 1e-5);
        ok(hit, `random problem ${problems}: the scan found a solution the solver missed (coords ${ca}, ${cb}, residual ${rr}; kinds ${ka}, ${kb}; solver: ${res.status} ${res.solutions.map((s) => s.values.map(coordOfValue).join('/')).join(', ')}; ${JSON.stringify(prob)})`);
      }
    }
    ok(scanned >= 500, `at least 500 problems scanned (${scanned})`);
    console.log(`solve two unknowns: ${problems} problems, ${scanned} scanned ${GRID}×${GRID}, ${coincident} coincident/degenerate, ${solutionsTotal} solutions, ${foundTotal} distinct solutions found by the scan (each one the solver's), worst residual ${worstResidual.toExponential(2)}`);
  }

  // ===============================================================================================================
  section('solve circle goals');
  {
    const SCAN = 10000;
    let count = 0, sols = 0, found = 0, worst = 0;
    const goals = () => {
      switch (Math.floor(random() * 7)) {
        case 0: return { kind: 'mag', value: 0.05 + 0.9 * random() };
        case 1: return { kind: 'vswr', value: 1.1 + 9 * random() };
        case 2: return { kind: 'rl', value: 1 + 29 * random() };
        case 3: return { kind: 'r', value: logU(-1, 0.7) };
        case 4: return { kind: 'g', value: logU(-1, 0.7) };
        case 5: return { kind: 'x', value: 6 * random() - 3 };
        default: return { kind: 'b', value: 6 * random() - 3 };
      }
    };
    while (count < 400) {
      const z0 = pick([50, 75, 1, 300]), f0 = logU(5, 10), w0 = TAU * f0;
      const [loadR, loadX] = randomLoad(z0);
      const parts = [];
      for (let k = Math.floor(random() * 3); k > 0; k--) parts.push(randomPart(pick(FIXED_KINDS.slice(0, 8)), z0, w0));
      const kind = Math.floor(random() * PART_KINDS), a = parts.length;
      parts.push(randomPart(kind, z0, w0));
      for (let k = Math.floor(random() * 3); k > 0; k--) parts.push(randomPart(pick(FIXED_KINDS.slice(0, 8)), z0, w0));
      const goal = goals();
      if (random() < 0.2) goal.node = a + 1 + Math.floor(random() * (parts.length - a));
      const circuit = { z0, f0, loadR, loadX, parts }, unknowns = [{ part: a, free: isLC(kind) && random() < 0.5 }];
      const res = solve(circuit, unknowns, goal);
      count++;
      if (res.status === 'coincident') continue;
      ok(res.status === 'solved' || res.status === 'none', `circle problem ${count}: status ${res.status} (${res.reason})`);
      for (const s of res.solutions) {
        const r = residualOf(circuit, goal, s, res);
        worst = Math.max(worst, r);
        ok(r < 1e-9, `circle problem ${count}: residual ${r}`);
      }
      sols += res.solutions.length;
      // 1-D scan of the signed distance to the goal circle; sign changes refined by bisection.
      const g = res.goalNode, line = kind === LINE, half = halfDomain(kind), zc = parts[a].zc ?? 0;
      const coord = (i) => (line ? (0.5 * i) / SCAN : half ? (HALF_PI * i) / SCAN : -HALF_PI + (Math.PI * i) / SCAN);
      const f = (c) => {
        const ps = parts.slice(); ps[a] = partFor(kind, zc, c, z0, f0);
        const gm = gammaAt(circuit, ps, g);
        return goalSigned(goal, gm[0], gm[1]);
      };
      const vals = new Float64Array(SCAN + 1);
      for (let i = 0; i <= SCAN; i++) vals[i] = f(coord(i));
      for (let i = 0; i < SCAN; i++) {
        const u = vals[i], v = vals[i + 1];
        if (!(u === u && v === v) || u * v > 0 || (u === 0 && i > 0)) continue;
        let lo = coord(i), hi = coord(i + 1), flo = u;
        for (let k = 0; k < 80; k++) {
          const mid = 0.5 * (lo + hi), fm = f(mid);
          if (fm === 0) { lo = hi = mid; break; }
          if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
        }
        const c = 0.5 * (lo + hi);
        if (!(Math.abs(f(c)) < 1e-9)) continue;
        found++;
        const hit = res.solutions.some((s) => coordDist(line, coordOfValue(s.values[0]), c) < 1e-6);
        ok(hit, `circle problem ${count}: the scan found a value the solver missed (coord ${c}; kind ${kind}, goal ${JSON.stringify(goal)}; ${JSON.stringify(circuit)}; solver ${res.status} ${res.solutions.map((s) => coordOfValue(s.values[0])).join(', ')})`);
      }
    }
    console.log(`solve circle goals: ${count} problems, ${sols} solutions, ${found} crossings found by a ${SCAN}-value scan, worst residual ${worst.toExponential(2)}`);
  }

  // ===============================================================================================================
  section('solve special cases');
  {
    const c = (loadR, loadX, kinds, z0 = 50) => ({ z0, f0: 1e8, loadR, loadX, parts: kinds.map((kind) => ({ kind, value: kind === SERIES_C || kind === SHUNT_L ? Infinity : 0 })) });
    const both = [{ part: 0 }, { part: 1 }], centre = { kind: 'point' };
    // Two series reactances in a row on the target's r circle: coincident; off it: none, the same job.
    let r = solve(c(50, 30, [SERIES_L, SERIES_C]), both, centre);
    ok(r.status === 'coincident' && r.sameJob && /same job/.test(r.reason), `two series reactances on r = 1: coincident (${r.status}: ${r.reason})`);
    r = solve(c(25, 10, [SERIES_L, SERIES_C]), both, centre);
    ok(r.status === 'none' && r.sameJob && /same job/.test(r.reason), `two series reactances off r = 1: none, the same job (${r.status}: ${r.reason})`);
    // Two shunt susceptances on the g = 1 circle: y = 1 + j0.6.
    const zOfY = (g, b) => { const d = g * g + b * b; return [(50 * g) / d, (-50 * b) / d]; };
    r = solve(c(...zOfY(1, 0.6), [SHUNT_C, SHUNT_L]), both, centre);
    ok(r.status === 'coincident' && r.sameJob, `two shunt susceptances on g = 1: coincident (${r.status}: ${r.reason})`);
    r = solve(c(...zOfY(0.4, 0.6), [SHUNT_C, STUB_OPEN]), both, centre);
    ok(r.status === 'none' && r.sameJob, `a shunt C and a stub off g = 1: none, the same job (${r.status}: ${r.reason})`);
    // One unknown whose circle is the goal circle.
    r = solve(c(50, 20, [SERIES_L]), [{ part: 0 }], { kind: 'r', value: 1 });
    ok(r.status === 'coincident', `a series L on r = 1 with the goal r = 1: coincident (${r.status})`);
    // Tangency: a series reactance from r = 3 and VSWR = 3 touch at Γ = 0.5: one solution, x = −0.8.
    r = solve(c(150, 40, [SERIES_L]), [{ part: 0, free: true }], { kind: 'vswr', value: 3 });
    ok(r.status === 'solved' && r.solutions.length === 1, `tangent locus and goal circle: one solution (${r.solutions.length})`);
    near(r.solutions[0]?.values[0].added, -0.8, 'tangent: x = −0.8');
    ok(r.solutions[0]?.values[0].kind === SERIES_C && !r.solutions[0].values[0].swapped, 'tangent: a free reactance of −0.8 is a series C, not swapped');
    // Tangency of two unknowns: the g = 1 and r = 1 circles touch at the centre.
    r = solve(c(...zOfY(1, 0.7), [SHUNT_C, SERIES_L]), [{ part: 0, free: true }, { part: 1, free: true }], centre);
    ok(r.status === 'solved' && r.solutions.length === 1, `g = 1 load, shunt then series: the circles touch, one solution (${r.solutions.length})`);
    near(r.solutions[0]?.values[0].added, -0.7, 'touching: b = −0.7');
    ok(Math.abs(r.solutions[0]?.values[1].added) < 1e-12, 'touching: x = 0');
    // circleIntersect directly: two lines, concentric circles, a point circle on a line.
    const cc = new Float64Array(8), out = new Float64Array(4);
    cc.set([0, 1, 0, 1, 0, 0, 1, 1]);
    ok(circleIntersect(out, 0, cc, 0, cc, 4) === 1 && Math.abs(out[0] - 0.5) < 1e-15 && Math.abs(out[1] - 0.5) < 1e-15, 'two lines meet in one point');
    cc.set([1, 0, 0, -0.25, 1, 0, 0, -0.5]);
    ok(circleIntersect(out, 0, cc, 0, cc, 4) === 0, 'concentric circles do not meet');
    cc.set([1, 0, 0, -0.25, -2, 0, 0, 0.5]);
    ok(circleIntersect(out, 0, cc, 0, cc, 4) === CROSS_SAME, 'a circle and a multiple of it are one');

    // Wrong sign offered as the other kind: 100 Ω on 50 with a shunt L and a series L (fixed kinds).
    r = solve(c(100, 0, [SHUNT_L, SERIES_L]), both, centre);
    ok(r.status === 'solved' && r.solutions.length === 2 && r.solutions.every((s) => s.atF0Only && !s.realisable), 'shunt L + series L for 100 → 50 Ω: both solutions need one swapped part');
    for (const s of r.solutions) {
      ok(s.values.every((v) => v.value > 0 && v.value < Infinity), 'swapped values are positive and finite');
      ok(s.values.some((v) => v.swapped && (v.kind === SHUNT_C || v.kind === SERIES_C)), 'the swapped part is offered as a C');
    }
    // Free unknowns never swap.
    r = solve(c(100, 0, [SHUNT_L, SERIES_L]), [{ part: 0, free: true }, { part: 1, free: true }], centre);
    ok(r.solutions.length === 2 && r.solutions.every((s) => s.realisable && s.values.every((v) => !v.swapped)), 'free unknowns: both solutions realisable, nothing swapped');
    // Negative R: dropped and counted.
    r = solve(c(10, 0, [SERIES_R, SERIES_L]), both, centre);
    ok(r.solutions.every((s) => s.values[0].value >= 0), 'no negative R returned');
    r = solve(c(100, 0, [SERIES_R, SERIES_L]), both, centre);
    ok(r.status === 'none' && r.nonPassive > 0 && /negative/.test(r.reason), `100 Ω with a series R: only a negative R matches (${r.status}, ${r.nonPassive}: ${r.reason})`);

    // Lengths: the shortest, and + λ/2 gives the same Γ at f0.
    r = solve({ z0: 50, f0: 1e9, loadR: 33.9, loadX: 17.6, parts: [{ kind: LINE, value: 1.3, zc: 50 }, { kind: STUB_SHORT, value: 0.9, zc: 50 }] }, both, centre);
    for (const s of r.solutions) {
      ok(s.values.every((v) => v.value >= 0 && v.value < 0.5 && v.period === 0.5), 'lengths in [0, λ/2) with the period λ/2');
      const longer = { ...s, values: s.values.map((v) => ({ ...v, value: v.value + v.period })) };
      const circuit = { z0: 50, f0: 1e9, loadR: 33.9, loadX: 17.6, parts: r.solutions[0].values.map(() => ({ kind: LINE, value: 0, zc: 50 })) };
      ok(residualOf(circuit, centre, longer, r) < 1e-9, 'adding λ/2 to both lengths keeps the match at f0');
    }

    // Statuses and reasons of the questions M4.1a does not answer, or cannot be asked.
    const base = c(25, 25, [SERIES_L, SHUNT_C, LINE]);
    base.parts[2].zc = 50;
    const st = (unk, goal) => solve(base, unk, goal);
    ok(st([{ part: 0 }], centre).status === 'unsupported', 'one unknown, a point target: unsupported (M4.1b)');
    ok(st(both, { kind: 'vswr', value: 1.5 }).status === 'family', 'two unknowns, a circle goal: a family (M4.1b)');
    ok(st([{ part: 2, param: 'zc' }, { part: 0 }], centre).status === 'rejected', 'a line\'s Zc: rejected');
    ok(st([{ part: 0, param: 'f0' }, { part: 1 }], centre).status === 'rejected', 'f0: rejected');
    ok(st([{ part: 0 }, { part: 1 }, { part: 2 }], centre).status === 'rejected', 'three unknowns: rejected');
    ok(st([{ part: 0 }, { part: 0 }], centre).status === 'rejected', 'one part twice: rejected');
    ok(st([{ part: 0 }, { part: 2 }], { kind: 'point', node: 2 }).status === 'rejected', 'a part beyond the goal node: rejected');
    ok(st([{ part: 2, free: true }, { part: 0 }], centre).status === 'rejected', 'a free line: rejected');
    ok(st([{ part: 0 }, { part: 1 }], { kind: 'vswr', value: 0.5 }).status === 'rejected', 'a VSWR below 1: rejected');
    for (const kind of ['point', 'mag', 'vswr', 'rl', 'r', 'g', 'x', 'b']) {
      const circ = new Float64Array(4), ok1 = goalCircle(circ, 0, { kind });
      ok(kind === 'point' ? !ok1 : ok1 && circ.every((v) => v === v), `goal ${kind}: its circle`);
    }
    // An intermediate goal: g = 1 at node 1 with the shunt part's input... a series L to g = 1 from 25 + j25 is not needed: the load is on g = 1.
    r = solve(c(25, 25, [SERIES_L, SHUNT_C]), [{ part: 0, free: true }], { kind: 'g', value: 1, node: 1 });
    ok(r.status === 'solved' && r.solutions.some((s) => Math.abs(s.values[0].added) < 1e-12), 'D16\'s load is on g = 1: x = 0 is a solution of the goal g = 1 at node 1');

    // The same input gives the same order; the order of the unknowns given does not matter.
    let same = 0;
    for (const prob of determinism) {
      const one = JSON.stringify(solve(prob.circuit, prob.unknowns, prob.goal));
      const two = JSON.stringify(solve(prob.circuit, prob.unknowns.slice().reverse(), prob.goal));
      if (one === two) same++;
    }
    ok(same === determinism.length, `the same result on a second run with the unknowns reversed (${same} of ${determinism.length})`);
  }

  // ===============================================================================================================
  section('solve fuzz');
  {
    let bad = 0, solved = 0, total = 0;
    const statuses = {};
    const finiteish = (v) => v === v;
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
      const count = 1 + Math.floor(random() * 10), parts = [];
      for (let k = 0; k < count; k++) {
        const kind = Math.floor(random() * PART_KINDS), part = randomPart(kind, z0, w0);
        if (random() < 0.1 && kind <= SHUNT_C) part.value = random() < 0.5 ? 0 : Infinity;
        parts.push(part);
      }
      const nu = random() < 0.7 ? 2 : 1, unknowns = [];
      for (let i = 0; i < nu; i++) {
        const part = Math.floor(random() * count);
        unknowns.push({ part, free: random() < 0.3, param: random() < 0.03 ? pick(['zc', 'f0']) : undefined });
      }
      let goal;
      if (random() < 0.5) {
        goal = { kind: 'point' };
        if (random() < 0.4) { const t = pick([[Infinity, 0], [0, 0], [0, z0], [z0 * 2, -z0], [0.5 * z0, 0]]); goal.targetR = t[0]; goal.targetX = t[1]; }
      } else {
        goal = pick([{ kind: 'mag', value: random() }, { kind: 'vswr', value: 1 + 5 * random() }, { kind: 'rl', value: 20 * random() }, { kind: 'r', value: pick([0, 1, Infinity]) }, { kind: 'g', value: pick([0, 1, Infinity]) }, { kind: 'x', value: 0 }, { kind: 'b', value: 0 }, { kind: 'mag', value: 1 }]);
      }
      if (random() < 0.2) goal.node = Math.floor(random() * (count + 1));
      const circuit = { z0, f0, loadR, loadX, parts };
      let res;
      try { res = solve(circuit, unknowns, goal); } catch (e) { bad++; ok(false, `fuzz ${n}: threw ${e}`); continue; }
      total++;
      statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      if (res.solutions.length) solved++;
      let fine = typeof res.reason === 'string' && res.circles.every(finiteish) && finiteish(res.nonPassive);
      for (const s of res.solutions) {
        fine &&= Number.isFinite(s.residual) && Number.isFinite(s.gamma) && Number.isFinite(s.change) && s.residual <= ACCEPT;
        for (const v of s.values) {
          // A lumped value may be its kind's 0 or ∞ limit (an open or short), never NaN; lengths and Zt are finite.
          fine &&= finiteish(v.value) && finiteish(v.added) && v.value >= 0 && (v.kind <= SHUNT_C || Number.isFinite(v.value));
        }
        const r = residualOf(circuit, goal, s, res);
        fine &&= r < 1e-9;
      }
      if (!fine) { bad++; ok(false, `fuzz ${n}: NaN, ∞ or a residual in ${JSON.stringify({ circuit, unknowns, goal })} → ${JSON.stringify(res)}`); }
    }
    ok(bad === 0, `fuzz: ${total} problems without NaN (${bad} bad)`);
    console.log(`solve fuzz: ${total} problems, ${solved} with solutions, statuses ${JSON.stringify(statuses)}`);
  }

  // ===============================================================================================================
  section('solve timing');
  {
    const z0 = 50, f0 = 1e8;
    const parts = [
      { kind: SERIES_L, value: 40e-9 }, { kind: SHUNT_C, value: 20e-12 }, { kind: LINE, value: 0.1, zc: 60 }, { kind: STUB_OPEN, value: 0.1, zc: 60 },
      { kind: SERIES_C, value: 30e-12 }, { kind: SHUNT_L, value: 60e-9 }, { kind: STUB_SHORT, value: 0.1, zc: 60 }, { kind: SERIES_L, value: 5e-9 },
      { kind: SHUNT_C, value: 2e-12 }, { kind: QUARTER, value: 70 },
    ];
    const circuit = { z0, f0, loadR: 25, loadX: 25, parts };
    const sets = [[{ part: 1 }, { part: 4 }], [{ part: 2 }, { part: 3 }], [{ part: 0 }, { part: 8 }], [{ part: 5, free: true }, { part: 7, free: true }]];
    const centre = { kind: 'point' };
    let sink = 0;
    for (let k = 0; k < 2000; k++) sink += solve(circuit, sets[k % 4], centre).solutions.length;
    const per = [];
    for (let batch = 0; batch < 60; batch++) {
      const t0 = performance.now();
      for (let k = 0; k < 100; k++) sink += solve(circuit, sets[k % 4], centre).solutions.length;
      per.push(((performance.now() - t0) / 100) * 1000);
    }
    per.sort((x, y) => x - y);
    const median = per[per.length >> 1];
    const circle = { kind: 'vswr', value: 1.5 };
    const t1 = performance.now();
    for (let k = 0; k < 2000; k++) sink += solve(circuit, [{ part: k % 10 }], circle).solutions.length;
    const one = ((performance.now() - t1) / 2000) * 1000;
    ok(sink > 0 && median < 1000, `one solve of a 10-part circuit, two unknowns, well under 1 ms (median ${median.toFixed(1)} µs)`);
    console.log(`solve timing: two unknowns in a 10-part circuit, median ${median.toFixed(1)} µs per solve (of 60 batches of 100); one unknown with a circle goal ${one.toFixed(1)} µs`);
  }
}
