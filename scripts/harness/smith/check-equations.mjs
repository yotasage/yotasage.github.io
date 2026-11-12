// Checks of lib/smith/equations.ts (step M1.4), run by check.mjs with its counters: every entry and every derivation
// step parses, prints back to text that parses to the same tree, renders with KaTeX (MathML, strict: 'error', so a
// warning fails) symbolic, with live numbers and with highlight colours, and evaluates on at least 200 random points
// to the value the engine (convert, parts, network, geometry) gives, every side of every `=` chain within 1e-12 of
// the largest side. Each entry has a binding below made from the engine; an entry without one fails.
//
// Random points keep 0.05 ≤ |Γ| ≤ 0.9 and line lengths 0.01 turn away from multiples of λ/8 where tan or cot is 0 or
// ∞: there the arithmetic of the check itself (1 − |Γ|² near the rim, Γ near 0 as a relative error, tan βℓ near a pole
// with βℓ rounded) loses digits that the equations do not lose; the engine's own edge cases are checked elsewhere.

import { createRequire } from 'node:module';
import * as importedEquations from '../../../lib/smith/equations.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import * as importedGeometry from '../../../lib/smith/geometry.ts';
import * as importedGoal from '../../../lib/smith/goal.ts';

const katex = createRequire(import.meta.url)('../../../node_modules/katex');
const Q = importedEquations.default ?? importedEquations;
const P = importedParts.default ?? importedParts;
const N = importedNetwork.default ?? importedNetwork;
const cv = importedConvert.default ?? importedConvert;
const G = importedGeometry.default ?? importedGeometry;
const { goalMismatch } = importedGoal.default ?? importedGoal;
const { EQUATIONS, PARSE_MS, parse, toText, tex, valueTex, compile, bind, symbolOf, nameTex } = Q;
const { SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER, packParts, added, valueFor, partMatrix, turnsFromMetres, metresFromTurns, C0 } = P;
const { evaluate, applyPart, nodeMetrics, inputGamma, M_ZR, M_ZI, M_YR, M_YI, M_GR, M_GI } = N;
const { zFromGamma, yFromGamma, impedanceFromGamma, admittanceFromGamma, gammaFromImpedance, gammaMag, vswr, returnLoss, reflectedPower, deliveredPower, mismatchLoss, qFromZ } = cv;
const { partLocus, circleCentre, partMobius, L_A, LOCUS_STRIDE } = G;

const TAU = 2 * Math.PI;
const POINTS = 200;
const TOL = 1e-12;
// Looser only with a reason: the centre of a line's circle, (B − 1/B)/(1 − |BΓ_c|²) + 1/B, subtracts two terms of
// size 1/|B| to give a centre of size ≤ 1, so it keeps about 1e-16/|B|² of relative accuracy (|B| ≥ 0.05 here).
const TOLS = { 'line-circle-centre': 1e-11 };
let mismatchSeed = 0x4d3c5;

export function runEquationChecks({ section, ok, random }) {
  const rnd = (a, b) => a + (b - a) * random();
  const out = new Float64Array(8);
  const metrics = new Float64Array(12);
  const nodes = new Float64Array(64);
  const loc = new Float64Array(LOCUS_STRIDE);
  const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cdivp = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const scale = (a, s) => [a[0] * s, a[1] * s];
  const cplx = () => [rnd(-2, 2), rnd(-2, 2)];

  // A length in turns away from the zeros and poles of tan (multiples of 1/4 turn) and of cot βℓ/2 (1/8).
  function turns() {
    for (;;) { const t = rnd(0.01, 0.99), m = (t * 8) % 1; if (m > 0.08 && m < 0.92) return t; }
  }

  // A point of the chart with everything convert.ts gives for it.
  function point() {
    const z0 = rnd(10, 200), m = rnd(0.05, 0.9), a = rnd(-Math.PI, Math.PI), gr = m * Math.cos(a), gi = m * Math.sin(a);
    zFromGamma(out, 0, gr, gi); const z = [out[0], out[1]];
    yFromGamma(out, 0, gr, gi); const y = [out[0], out[1]];
    impedanceFromGamma(out, 0, gr, gi, z0); const Z = [out[0], out[1]];
    admittanceFromGamma(out, 0, gr, gi, z0); const Y = [out[0], out[1]];
    return {
      z0, mag: gammaMag(gr, gi),
      b: { Z_0: z0, Y_0: 1 / z0, Gamma: [gr, gi], Gamma_r: gr, Gamma_i: gi, z, y, Z, Y, r: z[0], x: z[1], g: y[0], b: y[1] },
    };
  }

  // A part of any kind with a moderate value: lumped parts adding |a| in [0.05, 20], lines and stubs of turns().
  function randomPart(kinds) {
    const kind = kinds[Math.floor(random() * kinds.length)];
    const zc = rnd(20, 150), f0 = rnd(1e7, 1e10), z0 = rnd(10, 200);
    let value;
    if (kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT) value = turns();
    else if (kind === QUARTER) value = rnd(20, 150);
    else {
      const mag = Math.exp(rnd(Math.log(0.05), Math.log(20)));
      const a = kind === SERIES_C || kind === SHUNT_L ? -mag : mag;
      value = valueFor(kind, a, zc, f0, f0, z0);
    }
    return { kind, value, zc, f0, z0 };
  }

  // The ABCD matrix of a part in ohms and siemens as partMatrix writes it (up to a factor), optionally divided by A.
  function abcd(p, byA = false) {
    partMatrix(out, 0, p.kind, p.value, p.zc, p.f0, p.f0, p.z0);
    let A = [out[0], out[1]], B = scale([out[2], out[3]], p.z0), C = scale([out[4], out[5]], 1 / p.z0), D = [out[6], out[7]];
    if (byA) { const k = A; A = cdivp(A, k); B = cdivp(B, k); C = cdivp(C, k); D = cdivp(D, k); }
    return { A, B, C, D };
  }

  // Applies a part to a node (V, I) in ohms: returns the node at its input.
  function applyTo(p, V, I) {
    nodes[0] = V[0]; nodes[1] = V[1]; nodes[2] = I[0] * p.z0; nodes[3] = I[1] * p.z0;
    applyPart(nodes, 0, p.kind, p.value, p.zc, p.f0, p.f0, p.z0);
    return { V: [nodes[0], nodes[1]], I: [nodes[2] / p.z0, nodes[3] / p.z0] };
  }

  // Z_in in ohms of one part on a load R + jX (R = Infinity for the open).
  function zinOf(kind, value, zc, R, X, z0, f0) {
    evaluate(nodes, packParts([{ kind, value, zc }]), 1, R, X, z0, f0, f0);
    nodeMetrics(metrics, 0, nodes, 1);
    return { Z: [metrics[M_ZR] * z0, metrics[M_ZI] * z0], Y: [metrics[M_YR] / z0, metrics[M_YI] / z0], G: [metrics[M_GR], metrics[M_GI]] };
  }

  function lineBinding() {
    const lambda = rnd(0.05, 3), t = turns();
    return { t, lambda, beta: TAU / lambda, ell: t * lambda, theta: TAU * t };
  }

  const PT = () => point().b;
  // Each entry's binding, made from the engine. `solve` names a variable taken from the other side and `verify`
  // checks it with the engine (the formulas that give a design value rather than describe one).
  const CHECKS = {
    'z-norm': PT, 'y-norm': PT, 'gamma-z': PT, 'z-gamma': PT, 'gamma-y': PT, 'y-gamma': PT, 'gamma-parts-z': PT, 'gamma-parts-y': PT,
    'z-parts': PT, 'y-parts': PT, 'r-gamma': PT, 'x-gamma': PT, 'g-gamma': PT, 'b-gamma': PT,
    'circle-r': PT, 'circle-x': PT, 'circle-g': PT, 'circle-b': PT,
    'line-circle-b': lineCircle, 'line-circle-centre': lineCircle, 'line-circle-radius': lineCircle,
    vswr: figures, 'gamma-vswr': figures, 'return-loss': figures, 'power-reflected': figures, 'power-delivered': figures, 'mismatch-loss': figures,
    // M4.3c: the mismatch to an off-centre point target, m from goal.goalMismatch (a target inside the chart). Its
    // points come from a generator of its own, so adding the entry left the shared stream (and every later check's
    // random problems, check-validate's among them) as it was.
    'mismatch-to-target': () => {
      const own = () => {
        mismatchSeed = (mismatchSeed + 0x6d2b79f5) | 0;
        let t = Math.imul(mismatchSeed ^ (mismatchSeed >>> 15), 1 | mismatchSeed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const at = () => {
        const m = 0.05 + 0.85 * own(), a = Math.PI * (2 * own() - 1), gr = m * Math.cos(a), gi = m * Math.sin(a);
        zFromGamma(out, 0, gr, gi);
        return { G: [gr, gi], z: [out[0], out[1]] };
      };
      const z0 = 10 + 190 * own(), p = at(), t = at();
      const [tr, ti] = [t.z[0] * z0, t.z[1] * z0];
      const m = goalMismatch({ kind: 'point', targetR: tr, targetX: ti }, p.G[0], p.G[1], z0);
      return { m, Gamma: p.G, z: p.z, Gamma_t: t.G, z_t: t.z };
    },
    'z-max': () => { const p = point(); impedanceFromGamma(out, 0, p.mag, 0, p.z0); return { Z_max: out[0], Z_0: p.z0, VSWR: vswr(p.mag) }; },
    'z-min': () => { const p = point(); impedanceFromGamma(out, 0, -p.mag, 0, p.z0); return { Z_min: out[0], Z_0: p.z0, VSWR: vswr(p.mag) }; },
    'q-node': () => { const p = point(); return { ...p.b, Q: qFromZ(p.b.r, p.b.x) }; },
    'q-l-network': {
      bind: () => { const lo = rnd(2, 100); return { R_low: lo, R_high: lo * Math.exp(rnd(Math.log(1.1), Math.log(50))), Q: 0 }; },
      solve: 'Q',
      verify: (b) => {
        // Series L of X = Q·R_low next to the load, then shunt C of B = Q/R_high, on Z0 = R_high.
        const f = 1e8, w = TAU * f;
        const parts = packParts([{ kind: SERIES_L, value: (b.Q * b.R_low) / w }, { kind: SHUNT_C, value: b.Q / b.R_high / w }]);
        inputGamma(out, 0, parts, 2, b.R_low, 0, b.R_high, f, f);
        return Math.hypot(out[0], out[1]) <= 1e-12 ? null : `|Γ_in| = ${Math.hypot(out[0], out[1])}`;
      },
    },
    'line-zin': () => {
      const z0 = rnd(10, 200), zc = rnd(20, 150), R = rnd(1, 300), X = rnd(-300, 300), f0 = rnd(1e7, 1e10), l = lineBinding();
      gammaFromImpedance(out, 0, R, X, zc);
      return { ...l, Z_in: zinOf(LINE, l.t, zc, R, X, z0, f0).Z, Z_c: zc, Z_L: [R, X], Gamma_c: [out[0], out[1]] };
    },
    'line-rotation': () => {
      const p = point(), l = lineBinding();
      return { Gamma_L: p.b.Gamma, Gamma_in: zinOf(LINE, l.t, p.z0, p.b.Z[0], p.b.Z[1], p.z0, 1e9).G, theta: l.theta };
    },
    'line-theta': () => {
      const f = Math.exp(rnd(Math.log(1e6), Math.log(1e10))), e = rnd(1, 12), ell = rnd(0.001, 2);
      return { theta: TAU * turnsFromMetres(ell, f, e), beta: TAU * turnsFromMetres(1, f, e), ell, lambda: metresFromTurns(1, f, e) };
    },
    beta: () => {
      const f = Math.exp(rnd(Math.log(1e6), Math.log(1e10))), e = rnd(1, 12);
      return { beta: TAU * turnsFromMetres(1, f, e), lambda: metresFromTurns(1, f, e), omega: added(SERIES_L, 1, 0, f, f, 1), v_p: C0 / Math.sqrt(e) };
    },
    omega: () => { const f = Math.exp(rnd(Math.log(1e3), Math.log(1e11))); return { omega: added(SERIES_L, 1, 0, f, f, 1), f }; },
    'quarter-wave': () => {
      const z0 = rnd(10, 200), zt = rnd(20, 150), ZL = [rnd(1, 300), rnd(-300, 300)], lambda = rnd(0.05, 3);
      return { Z_in: zinOf(QUARTER, zt, 0, ZL[0], ZL[1], z0, 1e9).Z, Z_t: zt, Z_L: ZL, beta: TAU / lambda, ell: lambda / 4 };
    },
    'quarter-wave-match': {
      bind: () => ({ Z_0: rnd(10, 200), R_L: rnd(1, 500), Z_t: 0 }),
      solve: 'Z_t',
      verify: (b) => {
        inputGamma(out, 0, packParts([{ kind: QUARTER, value: b.Z_t }]), 1, b.R_L, 0, b.Z_0, 1e9, 1e9);
        return Math.hypot(out[0], out[1]) <= 1e-12 ? null : `|Γ_in| = ${Math.hypot(out[0], out[1])}`;
      },
    },
    'stub-short-z': () => stubZ(0),
    'stub-open-z': () => stubZ(Infinity),
    'stub-short-b': () => stubB(STUB_SHORT),
    'stub-open-b': () => stubB(STUB_OPEN),
    'stub-short-l': () => { const s = stubZ(0); return { ...s, L_s: s.Z_in[1] / s.omega }; },
    'stub-open-c': () => { const s = stubZ(Infinity); return { ...s, C_o: s.Y_in[1] / s.omega }; },
    'r-series': () => lumped(SERIES_R), 'g-shunt': () => lumped(SHUNT_R), 'x-series-l': () => lumped(SERIES_L), 'x-series-c': () => lumped(SERIES_C),
    'b-shunt-c': () => lumped(SHUNT_C), 'b-shunt-l': () => lumped(SHUNT_L),
    'z-inductor': () => lumped(SERIES_L), 'z-capacitor': () => lumped(SERIES_C), 'y-capacitor': () => lumped(SHUNT_C), 'y-inductor': () => lumped(SHUNT_L),
    'series-adds-z': () => addsBinding([SERIES_R, SERIES_L, SERIES_C], true),
    'shunt-adds-y': () => addsBinding([SHUNT_R, SHUNT_L, SHUNT_C, STUB_OPEN, STUB_SHORT], false),
    abcd: () => {
      const p = randomPart([SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER]);
      const V_2 = cplx(), I_2 = cplx(), at = applyTo(p, V_2, I_2);
      return { ...abcd(p), V_1: at.V, I_1: at.I, V_2, I_2 };
    },
    'abcd-cascade': () => {
      const all = [SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER];
      const p1 = randomPart(all), p2 = randomPart(all);
      p2.z0 = p1.z0; p2.f0 = p1.f0;
      if (p2.kind !== LINE && p2.kind !== QUARTER && !(p2.kind === STUB_OPEN || p2.kind === STUB_SHORT)) p2.value = randomPartValue(p2);
      const m1 = abcd(p1), m2 = abcd(p2);
      // Columns of the cascade: the node (1, 0) and (0, 1) through part 2 (towards the load) and then part 1.
      const c1 = applyTo(p1, ...Object.values(applyTo(p2, [1, 0], [0, 0])));
      const c2 = applyTo(p1, ...Object.values(applyTo(p2, [0, 0], [1, 0])));
      return {
        A: c1.V, C: c1.I, B: c2.V, D: c2.I,
        A_1: m1.A, B_1: m1.B, C_1: m1.C, D_1: m1.D, A_2: m2.A, B_2: m2.B, C_2: m2.C, D_2: m2.D,
      };
    },
    'abcd-reciprocal': () => {
      const p = randomPart([SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER]);
      return abcd(p, !(p.kind === LINE || p.kind === QUARTER));
    },
    'abcd-series': () => {
      const p = randomPart([SERIES_R, SERIES_L, SERIES_C]), a = added(p.kind, p.value, 0, p.f0, p.f0, p.z0);
      return { ...abcd(p, true), Z: p.kind === SERIES_R ? [a * p.z0, 0] : [0, a * p.z0] };
    },
    'abcd-shunt': () => {
      const p = randomPart([SHUNT_R, SHUNT_L, SHUNT_C]), a = added(p.kind, p.value, 0, p.f0, p.f0, p.z0);
      return { ...abcd(p, true), Y: p.kind === SHUNT_R ? [a / p.z0, 0] : [0, a / p.z0] };
    },
    'abcd-line': () => {
      const p = randomPart([LINE, QUARTER]), l = lineBinding(), t = p.kind === QUARTER ? 0.25 : p.value, zc = p.kind === QUARTER ? p.value : p.zc;
      return { ...abcd(p), beta: TAU / l.lambda, ell: t * l.lambda, Z_c: zc, Y_c: 1 / zc };
    },
    'abcd-stub-short': () => { const p = randomPart([STUB_SHORT]); return { ...abcd(p, true), theta: TAU * p.value, Z_c: p.zc }; },
    'abcd-stub-open': () => { const p = randomPart([STUB_OPEN]); return { ...abcd(p, true), theta: TAU * p.value, Z_c: p.zc }; },
    'abcd-zin': () => {
      const p = randomPart([SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER]);
      const ZL = [rnd(1, 300), rnd(-300, 300)], I_2 = cplx(), V_2 = cmul(ZL, I_2), at = applyTo(p, V_2, I_2);
      return { ...abcd(p), Z_in: zinOf(p.kind, p.value, p.zc, ZL[0], ZL[1], p.z0, p.f0).Z, Z_L: ZL, V_1: at.V, I_1: at.I, V_2, I_2 };
    },
    // a, b, c, d from geometry.partMobius of a random part; Γ_in from network.evaluate of the part on the load Γ_L.
    'mobius': () => {
      const p = randomPart([SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER]);
      const pt = point(), ZL = scale(pt.b.z, p.z0), m = new Float64Array(8);
      partMobius(m, 0, p.kind, p.value, p.zc, p.f0, p.f0, p.z0);
      return {
        ...abcd(p), Z_0: p.z0, a: [m[0], m[1]], b: [m[2], m[3]], c: [m[4], m[5]], d: [m[6], m[7]],
        Gamma_L: pt.b.Gamma, Gamma_in: zinOf(p.kind, p.value, p.zc, ZL[0], ZL[1], p.z0, p.f0).G,
      };
    },
    'node-z': () => {
      const all = [SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER];
      const z0 = rnd(10, 200), f0 = 1e9, count = 1 + Math.floor(random() * 5), parts = [];
      for (let k = 0; k < count; k++) { const p = randomPart(all); p.z0 = z0; p.f0 = f0; if (p.kind <= SHUNT_C) p.value = randomPartValue(p); parts.push(p); }
      evaluate(nodes, packParts(parts), count, rnd(1, 300), rnd(-300, 300), z0, f0, f0);
      const k = Math.floor(random() * (count + 1));
      nodeMetrics(metrics, 0, nodes, k);
      return { z: [metrics[M_ZR], metrics[M_ZI]], V: [nodes[4 * k], nodes[4 * k + 1]], I: [nodes[4 * k + 2] / z0, nodes[4 * k + 3] / z0], Z_0: z0 };
    },
  };

  function randomPartValue(p) {
    const mag = Math.exp(rnd(Math.log(0.05), Math.log(20)));
    return valueFor(p.kind, p.kind === SERIES_C || p.kind === SHUNT_L ? -mag : mag, p.zc, p.f0, p.f0, p.z0);
  }

  function lineCircle() {
    const p = point(), zc = rnd(20, 150);
    if (Math.abs((zc - p.z0) / (zc + p.z0)) < 0.05) return lineCircle();
    gammaFromImpedance(out, 0, p.b.Z[0], p.b.Z[1], zc);
    const Gamma_c = [out[0], out[1]];
    partLocus(loc, 0, LINE, zc, p.b.Gamma_r, p.b.Gamma_i, p.z0, 1e9, 1e9);
    circleCentre(out, 0, loc, L_A);
    return { B: (zc - p.z0) / (zc + p.z0), Z_c: zc, Z_0: p.z0, Gamma_c, c: [out[0], out[1]], rho: out[2] };
  }

  function figures() {
    const p = point(), P_inc = rnd(1e-3, 10), V_inc = rnd(0.1, 10);
    return {
      Gamma: p.b.Gamma, VSWR: vswr(p.mag), V_inc, V_max: V_inc * (1 + p.mag), V_min: V_inc * (1 - p.mag), RL: returnLoss(p.mag), ML: mismatchLoss(p.mag),
      P_inc, P_ref: reflectedPower(p.mag) * P_inc, P_load: deliveredPower(p.mag) * P_inc,
    };
  }

  function stubZ(load) {
    const z0 = rnd(10, 200), zc = rnd(20, 150), f0 = Math.exp(rnd(Math.log(1e7), Math.log(1e10))), l = lineBinding();
    const s = zinOf(LINE, l.t, zc, load, 0, z0, f0);
    return { ...l, Z_in: s.Z, Y_in: s.Y, Z_c: zc, omega: TAU * f0 };
  }

  function stubB(kind) {
    const z0 = rnd(10, 200), zc = rnd(20, 150), l = lineBinding(), b = added(kind, l.t, zc, 1e9, 1e9, z0);
    return { ...l, b, B: b / z0, Z_0: z0, Z_c: zc, Y_c: 1 / zc };
  }

  function lumped(kind) {
    const p = randomPart([kind]), a = added(kind, p.value, 0, p.f0, p.f0, p.z0), w = TAU * p.f0;
    const b = { Z_0: p.z0, omega: w, R: p.value, L: p.value, C: p.value };
    if (kind === SERIES_R) b.r = a;
    else if (kind === SHUNT_R) b.g = a;
    else if (kind === SERIES_L || kind === SERIES_C) { b.x = a; b.X = a * p.z0; b.Z = [0, added(kind, p.value, 0, p.f0, p.f0, 1)]; }
    else { b.b = a; b.B = a / p.z0; b.Y = [0, added(kind, p.value, 0, p.f0, p.f0, 1)]; }
    return b;
  }

  function addsBinding(kinds, series) {
    const p = randomPart(kinds), pt = point();
    p.z0 = pt.z0;
    if (p.kind <= SHUNT_C) p.value = randomPartValue(p);
    const a = added(p.kind, p.value, p.zc, p.f0, p.f0, p.z0);
    const resistive = p.kind === SERIES_R || p.kind === SHUNT_R;
    const own = resistive ? [a, 0] : [0, a];
    const I_2 = cplx(), V_2 = cmul(scale(pt.b.z, p.z0), I_2);
    nodes[0] = V_2[0]; nodes[1] = V_2[1]; nodes[2] = I_2[0] * p.z0; nodes[3] = I_2[1] * p.z0;
    nodes[4] = nodes[0]; nodes[5] = nodes[1]; nodes[6] = nodes[2]; nodes[7] = nodes[3];
    applyPart(nodes, 4, p.kind, p.value, p.zc, p.f0, p.f0, p.z0);
    nodeMetrics(metrics, 0, nodes, 1);
    const V_1 = [nodes[4], nodes[5]], I_1 = [nodes[6] / p.z0, nodes[7] / p.z0];
    return series
      ? { z_in: [metrics[M_ZR], metrics[M_ZI]], z_L: pt.b.z, z_s: own, Z_s: scale(own, p.z0), V_1, I_1, V_2, I_2, Z_0: p.z0 }
      : { y_in: [metrics[M_YR], metrics[M_YI]], y_L: pt.b.y, y_p: own, Y_p: scale(own, 1 / p.z0), V_1, I_1, V_2, I_2, Z_0: p.z0 };
  }

  const renderOk = (s) => { try { katex.renderToString(s, { output: 'mathml', throwOnError: true, strict: 'error' }); return null; } catch (e) { return e.message; } };
  const allTrees = (eq) => [{ text: eq.text, tree: eq.tree, label: eq.id }, ...eq.steps.map((s, k) => ({ text: s.text, tree: s.tree, label: `${eq.id} step ${k + 1}` }))];

  // -------------------------------------------------------------------------------------------------------------
  section('equations registry');
  {
    const ids = new Set();
    for (const eq of EQUATIONS) {
      ok(!ids.has(eq.id), `id ${eq.id} is unique`); ids.add(eq.id);
      ok(eq.sources.length > 0 || !!eq.derivation, `${eq.id} has a source or a derivation`);
      ok(typeof eq.engine === 'string' && eq.engine.length > 0, `${eq.id} names the engine function it equals`);
      ok(eq.steps.every((s) => s.why.length > 0), `${eq.id}: every step has a reason`);
      for (const v of eq.variables) ok(!!symbolOf(eq, v), `${eq.id}: variable ${v} has a meaning, unit and chart object`);
      ok(eq.id in CHECKS, `${eq.id} has an engine check in the harness`);
    }
    for (const id of Object.keys(CHECKS)) ok(ids.has(id), `harness check ${id} belongs to a registry entry`);
    for (const key of ['Ellingson2018', 'SteerVol2', 'SteerVol3', 'WikiSmith']) ok(EQUATIONS.some((e) => e.sources.some((s) => s.key === key)), `source ${key} is cited`);
  }

  section('equations parse and print');
  {
    let trees = 0;
    for (const eq of EQUATIONS) for (const t of allTrees(eq)) {
      trees++;
      const text = toText(t.tree);
      let again = null;
      try { again = parse(text); } catch (e) { ok(false, `${t.label}: "${text}" does not parse: ${e.message}`); continue; }
      ok(JSON.stringify(again) === JSON.stringify(t.tree), `${t.label}: parse → print → parse gives the same tree ("${t.text}" → "${text}")`);
      ok(toText(again) === text, `${t.label}: printing is stable`);
    }
    // Grammar cases of learning.md §1 and the printer rules of M0.3.
    const cases = [
      ['-2*x/y', '-\\frac{2 x}{y}'], ['j*2*Gamma_i', 'j2 \\Gamma_{i}'], ['Z_0*(A/B)', 'Z_{0} \\frac{A}{B}'], ['a + (-b)', 'a + (-b)'],
      ['((1 - Gamma_r) - j*Gamma_i)', '(1 - \\Gamma_{r}) - j \\Gamma_{i}'], ['2*3', '2 \\cdot 3'], ['(a/b)^2', '\\left(\\frac{a}{b}\\right)^{2}'],
      ['tan(beta*ell)', '\\tan \\beta \\ell'], ['VSWR', '\\mathrm{VSWR}'], ['Z_in', 'Z_{\\mathrm{in}}'], ['a*(b + c)', 'a (b + c)'],
      ['x*(-y)', 'x (-y)'], ['a - (b - c)', 'a - (b - c)'], ['exp(-j*2*theta)', 'e^{-j2 \\theta}'], ['abs(Gamma)^2', '|\\Gamma|^{2}'],
      ['-10*log10(1 - abs(Gamma)^2)', '-10 \\log_{10}(1 - |\\Gamma|^{2})'], ['1e-9', '1 \\times 10^{-9}'], ['[a, b; c, d]', '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}'],
    ];
    for (const [text, want] of cases) { const got = tex(parse(text)); ok(got === want, `tex("${text}") = ${got}, wanted ${want}`); }
    for (const bad of ['a +', '(a', 'foo(x)', 'a $ b', '[a, b; c]', 'a = ']) {
      let threw = false; try { parse(bad); } catch { threw = true; }
      ok(threw, `"${bad}" is rejected`);
    }
    console.log(`equations: ${EQUATIONS.length} entries, ${trees} trees (with steps); parsed at module load in ${PARSE_MS.toFixed(2)} ms`);
  }

  section('equations TeX');
  {
    const colour = (name, s) => `\\textcolor{#${(name.length * 4099 % 0xffffff).toString(16).padStart(6, '0')}}{${s}}`;
    for (const eq of EQUATIONS) {
      const check = CHECKS[eq.id];
      const binding = typeof check === 'function' ? check() : { ...check.bind(), [check.solve]: 1.5 };
      for (const t of allTrees(eq)) {
        const plain = tex(t.tree);
        let err = renderOk(plain);
        ok(err === null, `${t.label} renders: ${plain}: ${err}`);
        ok(!plain.includes('\\left(') || plain.includes('\\frac'),`${t.label}: \\left( only around a fraction`);
        err = renderOk(tex(t.tree, { variable: colour }));
        ok(err === null, `${t.label} renders with colours: ${err}`);
        const live = (polar) => (name) => {
          const v = binding[name];
          if (v === undefined) return undefined;
          const unit = symbolOf(eq, name)?.unit ?? '';
          return typeof v === 'number' ? valueTex(v, 0, unit, 4) : valueTex(v[0], v[1], unit, 4, polar && name.startsWith('Gamma'));
        };
        for (const polar of [false, true]) {
          const s = tex(t.tree, { value: live(polar) });
          err = renderOk(s);
          ok(err === null, `${t.label} renders with live numbers${polar ? ' (polar Γ)' : ''}: ${s}: ${err}`);
        }
      }
    }
    for (const [re, im, unit] of [[25, 25, 'Ω'], [25, -25, 'Ω'], [0, 0.5, ''], [-3, 0, ''], [1200, 3.3, 'Ω'], [Infinity, 0, 'Ω'], [NaN, 0, 'S'], [1e-7, 2e-9, 'H'], [0.25, 0, '°']]) {
      const v = valueTex(re, im, unit, 4), err = renderOk(v.s);
      ok(err === null, `valueTex(${re}, ${im}, ${unit}) = ${v.s} renders: ${err}`);
    }
    ok(valueTex(25, 25, '', 4).s === '25 + j25' && valueTex(25, -25, '', 4).s === '25 - j25' && valueTex(0, 0.5, '', 4).s === 'j0.5', 'complex values the engineering way');
    ok(valueTex(0.2, 0.4, '', 4, true).s === '0.4472\\angle 63.43^{\\circ}', `polar form (${valueTex(0.2, 0.4, '', 4, true).s})`);
    ok(tex(parse('2*x'), { value: (n) => (n === 'x' ? valueTex(25, 25) : undefined) }) === '2 (25 + j25)', 'a complex value is bracketed when multiplied');
    ok(tex(parse('x^2'), { value: (n) => (n === 'x' ? valueTex(-3) : undefined) }) === '(-3)^{2}', 'a negative value is bracketed when raised');
    ok(nameTex('Gamma_in') === '\\Gamma_{\\mathrm{in}}' && nameTex('ell') === '\\ell' && nameTex('Z_0') === 'Z_{0}', 'names print as the textbook writes them');
  }

  section('equations vs engine');
  {
    let worst = 0, worstAt = '', points = 0, steps = 0;
    for (const eq of EQUATIONS) {
      const check = CHECKS[eq.id];
      if (!check) continue;
      const progs = allTrees(eq).map((t) => ({ ...t, prog: compile(t.tree) }));
      let entryWorst = 0, fails = 0, verifyFail = null, unbound = null;
      for (let k = 0; k < POINTS; k++) {
        let binding;
        if (typeof check === 'function') binding = check();
        else {
          binding = check.bind();
          const pr = progs[0].prog;
          bind(pr, binding); pr.run();
          const side = pr.sides[pr.sides.length - 1];
          binding[check.solve] = pr.regs[side.o];
          const err = check.verify(binding);
          if (err && !verifyFail) verifyFail = err;
        }
        for (const { prog, label } of progs) {
          try { bind(prog, binding); } catch (e) { unbound ??= `${label}: ${e.message}`; continue; }
          prog.run();
          const d = sideSpread(prog);
          if (label !== eq.id) steps++;
          if (!(d <= (TOLS[eq.id] ?? TOL))) fails++;
          if (!(d <= entryWorst)) entryWorst = d;
        }
        points++;
      }
      ok(unbound === null, `${eq.id}: every variable bound by the engine (${unbound})`);
      ok(fails === 0, `${eq.id}: every side and step equal at ${POINTS} random points within ${TOLS[eq.id] ?? TOL} (worst ${entryWorst.toExponential(2)}, ${fails} over)`);
      if (!(typeof check === 'function')) ok(verifyFail === null, `${eq.id}: the network built from it is matched (${verifyFail})`);
      if (!(entryWorst <= worst)) { worst = entryWorst; worstAt = eq.id; }
    }
    console.log(`equations vs engine: ${EQUATIONS.length} entries at ${POINTS} points (${steps} step evaluations); worst relative spread ${worst.toExponential(2)} (${worstAt})`);
  }

  section('equations timing');
  {
    const reps = 50;
    let t0 = performance.now();
    for (let k = 0; k < reps; k++) for (const eq of EQUATIONS) for (const s of [eq.text, ...eq.steps.map((x) => x.text)]) parse(s);
    const parseMs = (performance.now() - t0) / reps;
    t0 = performance.now();
    let len = 0;
    for (let k = 0; k < reps; k++) for (const eq of EQUATIONS) { len += tex(eq.tree).length; for (const s of eq.steps) len += tex(s.tree).length; }
    const texMs = (performance.now() - t0) / reps;
    const progs = EQUATIONS.map((e) => compile(e.tree));
    const bindings = EQUATIONS.map((e) => { const c = CHECKS[e.id]; return typeof c === 'function' ? c() : { ...c.bind(), [c.solve]: 1.5 }; });
    progs.forEach((p, k) => bind(p, bindings[k]));
    t0 = performance.now();
    const runs = 2000;
    for (let k = 0; k < runs; k++) for (const p of progs) p.run();
    const evalUs = ((performance.now() - t0) / runs / progs.length) * 1000;
    ok(parseMs < 5 && texMs < 5 && evalUs < 5 && len > 0, `parse ${parseMs.toFixed(3)} ms and TeX ${texMs.toFixed(3)} ms of the whole registry, ${evalUs.toFixed(3)} µs per evaluation`);
    console.log(`equations timing: parse of the registry with steps ${parseMs.toFixed(3)} ms, TeX of all ${texMs.toFixed(3)} ms, one evaluation ${evalUs.toFixed(3)} µs`);
  }
}

// The largest difference between any side and side 0, relative to the largest side (per entry of a matrix, relative
// to the largest entry of all sides).
function sideSpread(prog) {
  const r = prog.regs, sides = prog.sides, n = 2 * sides[0].rows * sides[0].cols;
  let big = 0, diff = 0;
  for (const s of sides) for (let k = 0; k < n; k += 2) big = Math.max(big, Math.hypot(r[s.o + k], r[s.o + k + 1]));
  for (let i = 1; i < sides.length; i++) for (let k = 0; k < n; k += 2) {
    diff = Math.max(diff, Math.hypot(r[sides[i].o + k] - r[sides[0].o + k], r[sides[i].o + k + 1] - r[sides[0].o + k + 1]));
  }
  return big === 0 ? diff : diff / big;
}
