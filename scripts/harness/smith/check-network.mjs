// Checks of lib/smith/parts.ts and lib/smith/network.ts (step M1.2), run by check.mjs with its counters:
// facts-cases C12–C28, a second independent computation (impedance arithmetic in ohms, tan for lines, no ABCD) on
// 10,000 random circuits, a fuzz of 100,000 circuits with values 0 and ∞ and open and short loads, the direction of
// travel of each part, λ/8, λ/4 and λ/2 lines, the degenerate rule, and the time of a 2,000-point sweep.

import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';

const P = importedParts.default ?? importedParts;
const N = importedNetwork.default ?? importedNetwork;
const cv = importedConvert.default ?? importedConvert;
const {
  SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER, PART_KINDS,
  packParts, added, valueFor, noEffect, partMatrix, metresFromTurns, turnsFromMetres, REACH_LO, REACH_HI,
} = P;
const {
  evaluate, evaluateCircuit, inputGamma, sweep, nodeGamma, applyPart, loadNode, allMetrics, NODE_STRIDE, METRIC_STRIDE,
  M_GR, M_GI, M_MAG, M_ANGLE, M_VSWR, M_RL, M_ML, M_Q, M_ZR, M_ZI, M_YR, M_YI,
} = N;
const { gammaFromZ, gammaAngle, toDegrees, vswr, returnLoss, mismatchLoss, qFromGamma } = cv;

const KIND_NAMES = ['series R', 'series L', 'series C', 'shunt R', 'shunt L', 'shunt C', 'line', 'open stub', 'short stub', 'λ/4'];
const TAU = 2 * Math.PI;

export function runNetworkChecks({ section, ok, near, printed, random }) {
  // ---- helpers --------------------------------------------------------------------------------------------------
  const run = (z0, f0, loadR, loadX, parts, f = f0) => {
    const { nodes, metrics } = evaluateCircuit({ z0, f0, loadR, loadX, parts }, f);
    const at = (k, m) => metrics[k * METRIC_STRIDE + m];
    return {
      nodes, metrics, last: parts.length, at,
      Z: (k = parts.length) => [at(k, M_ZR) * z0, at(k, M_ZI) * z0],
      Y: (k = parts.length) => [at(k, M_YR) / z0, at(k, M_YI) / z0],
      gamma: (k = parts.length) => [at(k, M_GR), at(k, M_GI)],
      mag: (k = parts.length) => at(k, M_MAG),
    };
  };
  const g2 = new Float64Array(2);
  const gammaOfZ = (r, x) => { gammaFromZ(g2, 0, r, x); return [g2[0], g2[1]]; };
  const logU = (lo, hi) => 10 ** (lo + (hi - lo) * random());
  const pick = (a) => a[Math.floor(random() * a.length)];

  // ---- the second computation: impedances in ohms, series adds Z, shunt adds Y, a line by the tan formula -------
  // Plain complex numbers as [re, im]; written without parts.ts and network.ts.
  const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const cMul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const cDiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const cInv = (a) => cDiv([1, 0], a);
  function reference(z0, f0, loadR, loadX, parts, f) {
    const w = TAU * f;
    let Z = [loadR, loadX];
    for (const p of parts) {
      const v = p.value, zc = p.zc;
      switch (p.kind) {
        case SERIES_R: Z = cAdd(Z, [v, 0]); break;
        case SERIES_L: Z = cAdd(Z, [0, w * v]); break;
        case SERIES_C: Z = cAdd(Z, [0, -1 / (w * v)]); break;
        case SHUNT_R: Z = cInv(cAdd(cInv(Z), [1 / v, 0])); break;
        case SHUNT_L: Z = cInv(cAdd(cInv(Z), [0, -1 / (w * v)])); break;
        case SHUNT_C: Z = cInv(cAdd(cInv(Z), [0, w * v])); break;
        case LINE: case QUARTER: {
          const Zc = p.kind === QUARTER ? v : zc;
          const t = Math.tan(TAU * (p.kind === QUARTER ? 0.25 : v) * (f / f0));
          Z = cMul([Zc, 0], cDiv(cAdd(Z, [0, Zc * t]), cAdd([Zc, 0], cMul([0, t], Z))));
          break;
        }
        case STUB_OPEN: { const t = Math.tan(TAU * v * (f / f0)); Z = cInv(cAdd(cInv(Z), cInv([0, -zc / t]))); break; }
        case STUB_SHORT: { const t = Math.tan(TAU * v * (f / f0)); Z = cInv(cAdd(cInv(Z), cInv([0, zc * t]))); break; }
      }
    }
    return cDiv(cAdd(Z, [-z0, 0]), cAdd(Z, [z0, 0]));
  }

  // A random finite circuit of 1–10 parts of every kind, with normalised immittances 10^±1.5 at f0.
  function randomCircuit(maxParts = 10) {
    const z0 = pick([50, 75, 1, 300, 0.01, 1e4]);
    const f0 = logU(5, 10);
    const n = 1 + Math.floor(random() * maxParts);
    const parts = [];
    const w0 = TAU * f0;
    for (let k = 0; k < n; k++) {
      const kind = Math.floor(random() * PART_KINDS);
      const a = logU(-1.5, 1.5);
      let value, zc = 0;
      switch (kind) {
        case SERIES_R: value = a * z0; break;
        case SERIES_L: value = (a * z0) / w0; break;
        case SERIES_C: value = 1 / (w0 * a * z0); break;
        case SHUNT_R: value = z0 / a; break;
        case SHUNT_L: value = z0 / (w0 * a); break;
        case SHUNT_C: value = a / (w0 * z0); break;
        case QUARTER: value = z0 * logU(-0.5, 0.5); break;
        default: value = random(); zc = z0 * logU(-0.5, 0.5);
      }
      parts.push({ kind, value, zc });
    }
    return { z0, f0, loadR: z0 * logU(-2, 2), loadX: (random() < 0.5 ? -1 : 1) * z0 * logU(-2, 2), parts };
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('network cases C12–C28');
  {
    // C12: 25 Ω on a 50 Ω line seen in a 75 Ω chart: the locus runs between 25 Ω and 100 Ω, centre −0.17857.
    const a = run(75, 1e9, 25, 0, [{ kind: LINE, value: 0, zc: 50 }]);
    const b = run(75, 1e9, 25, 0, [{ kind: LINE, value: 0.25, zc: 50 }]);
    near(a.gamma()[0], -0.5, 'C12 Γ75 of 25 Ω');
    near(b.Z()[0], 100, 'C12 Z_in at λ/4 is 100 Ω', 1e-12);
    near(b.gamma()[0], 0.1428571429, 'C12 Γ75 of 100 Ω');
    const centre = (a.gamma()[0] + b.gamma()[0]) / 2, radius = (b.gamma()[0] - a.gamma()[0]) / 2;
    printed(centre, '-0.17857', 'C12 centre as printed');
    near(centre, -0.1785714286, 'C12 centre');
    // facts eq. 12 with Γ_L in the line's (50 Ω) chart and B = (Zline − Zchart)/(Zline + Zchart) = −0.2.
    const B = (50 - 75) / (50 + 75), gl = (25 - 50) / 75;
    near((B - 1 / B) / (1 - (B * gl) ** 2) + 1 / B, -0.1785714286, 'C12 centre by facts eq. 12');
    near(Math.abs((B * B - 1) * gl / (1 - (B * gl) ** 2)), radius, 'C12 radius by facts eq. 12');
    printed(gl, '-0.3333', 'C12 Γ_L,50'); printed(B, '-0.2', 'C12 B');
    let onCircle = 0;
    for (let k = 0; k < 200; k++) {
      const r = run(75, 1e9, 25, 0, [{ kind: LINE, value: random(), zc: 50 }]);
      const [gr, gi] = r.gamma();
      onCircle = Math.max(onCircle, Math.abs(Math.hypot(gr - centre, gi) - radius));
    }
    ok(onCircle < 1e-14, `C12 every length lies on the circle (worst ${onCircle})`);
  }
  {
    // C13: a shorted 50 Ω stub as 2.2 nH at 6 GHz, v_p = 0.6c.
    const f = 6e9, L = 2.2e-9;
    printed(TAU * f * L, '82.9', 'C13 ωL'); near(TAU * f * L, 82.93804605, 'C13 ωL');
    const t = valueFor(STUB_SHORT, added(SHUNT_L, L, 0, f, f, 50), 50, f, f, 50);
    printed(TAU * t, '1.028', 'C13 βℓ'); near(TAU * t, 1.028276808, 'C13 βℓ');
    printed(TAU * f / (0.6 * 3e8), '209.4', 'C13 β');
    near(metresFromTurns(t, f, 1 / 0.36, 3e8), 4.909660107e-3, 'C13 ℓ with c = 3e8');
    near(metresFromTurns(t, f, 1 / 0.36), 4.906263569e-3, 'C13 ℓ with exact c');
    printed(metresFromTurns(t, f, 1 / 0.36, 3e8) * 1e3, '4.9', 'C13 ℓ (mm)');
    near(turnsFromMetres(metresFromTurns(t, f, 1 / 0.36), f, 1 / 0.36), t, 'C13 metres back to turns', 1e-14);
    for (let k = 0; k < 50; k++) {
      const R = 50 * logU(-1, 1), X = 50 * (random() - 0.5) * 4;
      const s = run(50, f, R, X, [{ kind: STUB_SHORT, value: t, zc: 50 }]).gamma();
      const l = run(50, f, R, X, [{ kind: SHUNT_L, value: L }]).gamma();
      ok(Math.hypot(s[0] - l[0], s[1] - l[1]) < 1e-13, `C13 the stub is the inductor at 6 GHz on ${R} + j${X} Ω`);
    }
  }
  {
    // C14: λ/4 transformer 300 → 50 Ω at 10 GHz, v_p = 0.6c.
    const zt = Math.sqrt(300 * 50);
    printed(zt, '122.5', 'C14 Zt'); near(zt, 122.4744871, 'C14 Zt');
    const r = run(50, 10e9, 300, 0, [{ kind: QUARTER, value: zt }]);
    ok(r.mag() < 1e-15, `C14 matched: |Γ| = ${r.mag()}`);
    near(metresFromTurns(0.25, 10e9, 1 / 0.36), 4.496886870e-3, 'C14 ℓ exact c');
    near(metresFromTurns(0.25, 10e9, 1 / 0.36, 3e8), 4.5e-3, 'C14 ℓ with 3e8', 1e-14);
  }
  {
    // C15: 35 + j35 Ω, a 50 Ω line to the real axis, then a λ/4 section.
    const L0 = run(50, 1e9, 35, 35, []);
    const [gr, gi] = L0.gamma(0);
    printed(gr, '-0.0059', 'C15 Γr'); printed(gi, '0.4142', 'C15 Γi');
    near(gr, -0.005917159763, 'C15 Γr'); near(gi, 0.4142011834, 'C15 Γi');
    const t1 = gammaAngle(gr, gi) / (2 * TAU); // clockwise by 2θ to the positive real axis
    printed(TAU * t1, '0.793', 'C15 β1ℓ1'); near(TAU * t1, 0.7925405347, 'C15 β1ℓ1');
    printed(t1, '0.126', 'C15 ℓ1'); near(t1, 0.1261367437, 'C15 ℓ1');
    const r1 = run(50, 1e9, 35, 35, [{ kind: LINE, value: t1, zc: 50 }]);
    near(r1.Z()[0], 120.7193875, 'C15 Z1'); printed(r1.Z()[0], '120.719', 'C15 Z1');
    ok(Math.abs(r1.Z()[1]) < 1e-9 * 120, `C15 Z1 is real (Im ${r1.Z()[1]})`);
    const z02 = Math.sqrt(50 * r1.Z()[0]);
    near(z02, 77.69150130, 'C15 Z02'); printed(z02, '77.7', 'C15 Z02');
    const r2 = run(50, 1e9, 35, 35, [{ kind: LINE, value: t1, zc: 50 }, { kind: QUARTER, value: z02 }]);
    ok(r2.mag() < 1e-12, `C15 matched after λ/4: |Γ| = ${r2.mag()}`);
    printed(t1 + 0.25, '0.376', 'C15 ℓ1 + ℓ2');
  }
  {
    // C16: stubs for j140 Ω on Z0 = Zc = 100 Ω (as shunt stubs: their input admittance −j/1.4).
    const b = -100 / 140;
    near(valueFor(STUB_SHORT, b, 100, 1e9, 1e9, 100), 0.1512842284, 'C16 short stub');
    near(valueFor(STUB_OPEN, b, 100, 1e9, 1e9, 100), 0.4012842284, 'C16 open stub');
    printed(toDegrees(TAU * valueFor(STUB_SHORT, b, 100, 1e9, 1e9, 100)), '54.4', 'C16 θ (truncated)', 1);
    near(added(STUB_SHORT, 0.1512842284, 100, 1e9, 1e9, 100), b, 'C16 short stub back to b', 1e-9);
    const [gr, gi] = gammaOfZ(0, 1.4);
    near(toDegrees(gammaAngle(gr, gi)), 71.07535558, 'C16 ∠Γ at z = j1.4');
  }
  for (const [kind, theta, deg, thetaText, degText] of [[STUB_SHORT, 1.760784615, 100.8855271, '1.761', '100.9'], [STUB_OPEN, 0.1899882879, 10.88552705, '0.1900', '10.89']]) {
    // C17, C18: a shunt stub of 75 Ω on 75 + j15 Ω leaves 78 Ω.
    const name = kind === STUB_SHORT ? 'C17' : 'C18';
    const L0 = run(75, 1e9, 75, 15, []);
    const [G, B] = L0.Y(0);
    printed(G, '0.01282', `${name} G_L`); printed(B, '-0.002564', `${name} B_L`);
    near(G, 0.01282051282, `${name} G_L`); near(B, -0.002564102564, `${name} B_L`);
    const t = valueFor(kind, -B * 75, 75, 1e9, 1e9, 75);
    near(TAU * t, theta, `${name} βℓ`); printed(TAU * t, thetaText, `${name} βℓ`);
    near(toDegrees(TAU * t), deg, `${name} βℓ°`); printed(toDegrees(TAU * t), degText, `${name} βℓ°`);
    near(1 / (added(kind, t, 75, 1e9, 1e9, 75) / 75), 390, `${name} Z_stub = −j390 Ω`);
    const r = run(75, 1e9, 75, 15, [{ kind, value: t, zc: 75 }]);
    near(r.Z()[0], 78, `${name} Z_X`); ok(Math.abs(r.Z()[1]) < 1e-9, `${name} Z_X is real (${r.Z()[1]})`);
  }
  {
    // C19: a shorted λ/4 stub of 12.28 Ω at 1850 MHz near resonance is C = π/(4ωZc) in parallel with L = 1/(ω²C).
    const fr = 1850e6, zc = 12.28, d = fr * 1e-5;
    const B = (f) => added(STUB_SHORT, 0.25, zc, f, fr, 50) / 50;
    const C = (B(fr + d) - B(fr - d)) / (2 * TAU * d) / 2;
    near(C, 5.502244916e-12, 'C19 C from the stub\'s dB/dω', 1e-8);
    near(Math.PI / (4 * TAU * fr * zc), 5.502244916e-12, 'C19 C closed form');
    printed(C * 1e12, '5.502', 'C19 C (pF)');
    const L = 1 / ((TAU * fr) ** 2 * C);
    near(L, 1.345107173e-9, 'C19 L', 1e-8); printed(L * 1e9, '1.345', 'C19 L (nH)');
    ok(B(fr) === 0, 'C19 the λ/4 shorted stub is an exact open at resonance');
  }
  {
    // C20: single shunt stub match of 33.9 + j17.6 Ω, all 50 Ω.
    const L0 = run(50, 1e9, 33.9, 17.6, []);
    const [gr, gi] = L0.gamma(0);
    near(gr, -0.1416565859, 'C20 Γr'); near(gi, 0.2394893434, 'C20 Γi');
    printed(gr, '-0.142', 'C20 Γr'); printed(gi, '0.239', 'C20 Γi');
    const l1 = 0.02006726246;
    const r1 = run(50, 1e9, 33.9, 17.6, [{ kind: LINE, value: l1, zc: 50 }]);
    const [G, B] = r1.Y();
    near(G, 0.02, 'C20 G1', 1e-9); near(B, -0.01158750217, 'C20 B1', 1e-9);
    printed(G, '0.0200', 'C20 G1'); printed(-B, '0.0116', 'C20 −B1'); printed(l1, '0.020', 'C20 ℓ1');
    for (const [kind, len, text] of [[STUB_OPEN, 0.08357481879, '0.084'], [STUB_SHORT, 0.3335748188, '0.334']]) {
      const t = valueFor(kind, -B * 50, 50, 1e9, 1e9, 50);
      near(t, len, `C20 ${KIND_NAMES[kind]}`); printed(t, text, `C20 ${KIND_NAMES[kind]}`);
      const r = run(50, 1e9, 33.9, 17.6, [{ kind: LINE, value: l1, zc: 50 }, { kind, value: len, zc: 50 }]);
      ok(r.mag() < 1e-9, `C20 matched with the ${KIND_NAMES[kind]}: |Γ| = ${r.mag()}`);
    }
  }
  {
    // C21, C22: line + series C, line + shunt C at 1.5 GHz, v_p = 0.6c.
    const f = 1.5e9, t21 = 0.4080555190 / TAU, t22 = 0.1260863287 / TAU;
    const r1 = run(50, f, 33.9, 17.6, [{ kind: LINE, value: t21, zc: 50 }]);
    near(r1.Z()[0], 50, 'C21 R1', 1e-9); near(r1.Z()[1], 28.96875542, 'C21 X1');
    printed(r1.Z()[0], '50.0', 'C21 R1'); printed(r1.Z()[1], '29.0', 'C21 X1'); printed(TAU * t21, '0.408', 'C21 βℓ');
    const C21 = valueFor(SERIES_C, -r1.Z()[1] / 50, 0, f, f, 50);
    near(C21, 3.662680493e-12, 'C21 C'); printed(C21 * 1e12, '3.7', 'C21 C (pF)');
    printed(TAU * f / (0.6 * 3e8), '52.360', 'C21 β');
    near(metresFromTurns(t21, f, 1 / 0.36, 3e8), 7.793286349e-3, 'C21 ℓ with 3e8');
    near(metresFromTurns(t21, f, 1 / 0.36), 7.787894901e-3, 'C21 ℓ exact c');
    printed(metresFromTurns(t21, f, 1 / 0.36, 3e8) * 1e3, '7.8', 'C21 ℓ (mm)');
    ok(run(50, f, 33.9, 17.6, [{ kind: LINE, value: t21, zc: 50 }, { kind: SERIES_C, value: C21 }]).mag() < 1e-9, 'C21 matched');
    const r2 = run(50, f, 33.9, 17.6, [{ kind: LINE, value: t22, zc: 50 }]);
    printed(r2.Y()[0], '0.0200', 'C22 G1'); printed(r2.Y()[1], '-0.0116', 'C22 B1');
    const C22 = valueFor(SHUNT_C, -r2.Y()[1] * 50, 0, f, f, 50);
    near(C22, 1.229472165e-12, 'C22 C'); printed(C22 * 1e12, '1.2', 'C22 C (pF)');
    near(-1 / (-r2.Y()[1]), -86.29987598, 'C22 1/(jB_p)'); printed(-1 / (-r2.Y()[1]), '-86.3', 'C22 1/(jB_p)');
    near(metresFromTurns(t22, f, 1 / 0.36), 2.406405576e-3, 'C22 ℓ exact c');
    near(metresFromTurns(t22, f, 1 / 0.36, 3e8), 2.408071496e-3, 'C22 ℓ with 3e8');
    ok(run(50, f, 33.9, 17.6, [{ kind: LINE, value: t22, zc: 50 }, { kind: SHUNT_C, value: C22 }]).mag() < 1e-9, 'C22 matched');
  }
  {
    // C23: L network 100 → 1700 Ω at 900 MHz, shunt C at the load, series L at the source.
    const f = 900e6, Q = Math.sqrt(1700 / 100 - 1);
    const L = valueFor(SERIES_L, Q, 0, f, f, 100), C = valueFor(SHUNT_C, Q, 0, f, f, 1700);
    near(L, 70.73553026e-9, 'C23 L'); near(C, 0.4160913545e-12, 'C23 C');
    printed(Q, '4', 'C23 Q'); printed(L * 1e9, '70.7', 'C23 L (nH)'); printed(C * 1e12, '0.416', 'C23 C (pF)');
    const r = run(100, f, 1700, 0, [{ kind: SHUNT_C, value: C }, { kind: SERIES_L, value: L }]);
    near(r.Z()[0], 100, 'C23 input R', 1e-12); ok(Math.abs(r.Z()[1]) < 1e-12, `C23 input X = ${r.Z()[1]}`);
  }
  {
    // C24: 50 → 75 Ω, low-pass and high-pass at 100 MHz.
    const f = 1e8, Q = Math.sqrt(75 / 50 - 1), xs = Q * 50, xp = 75 / Q;
    printed(Q, '0.7071', 'C24 Q'); printed(xs, '35.35', 'C24 |X_S|', 1); printed(xp, '106.1', 'C24 |X_P|');
    near(xs, 35.35533906, 'C24 |X_S|'); near(xp, 106.0660172, 'C24 |X_P|');
    const low = run(50, f, 75, 0, [{ kind: SHUNT_C, value: 1 / (TAU * f * xp) }, { kind: SERIES_L, value: xs / (TAU * f) }]);
    const high = run(50, f, 75, 0, [{ kind: SHUNT_L, value: xp / (TAU * f) }, { kind: SERIES_C, value: 1 / (TAU * f * xs) }]);
    ok(low.mag() < 1e-15 && high.mag() < 1e-15, `C24 both match (|Γ| ${low.mag()}, ${high.mag()})`);
  }
  {
    // C25: 200 Ω → 25 Ω on Z0 = 50 Ω: shunt b_P = 0.661, then series x_S = 1.323.
    const f = 1e9, bp = Math.sqrt(0.4375), xsN = Math.sqrt(1.75);
    near(xsN, 1.322875656, 'C25 x_S'); near(bp, 0.6614378278, 'C25 b_P');
    printed(xsN, '1.323', 'C25 x_S'); printed(xsN * 50, '66.1', 'C25 X_S'); printed(bp, '0.661', 'C25 b_P');
    printed(bp / 50 * 1e3, '13.22', 'C25 B_P (mS)', 1); printed(-50 / bp, '-75.6', 'C25 X_P');
    const parts = [{ kind: SHUNT_C, value: valueFor(SHUNT_C, bp, 0, f, f, 50) }, { kind: SERIES_L, value: valueFor(SERIES_L, xsN, 0, f, f, 50) }];
    const r = run(50, f, 200, 0, parts);
    near(r.at(1, M_ZR), 0.5, 'C25 node 1 r'); near(r.at(1, M_ZI), -xsN, 'C25 node 1 x');
    near(r.Z()[0], 25, 'C25 input 25 Ω', 1e-12); ok(Math.abs(r.Z()[1]) < 1e-12, `C25 input X = ${r.Z()[1]}`);
  }
  {
    // C26: 50 − j50 Ω → conjugate of 12.5 + j12.5 Ω: shunt b_P = 0.823, series x_S = 0.411.
    const f = 1e9, bp = 0.8228756555, xsN = 0.4114378278;
    const r = run(50, f, 50, -50, [{ kind: SHUNT_C, value: valueFor(SHUNT_C, bp, 0, f, f, 50) }, { kind: SERIES_L, value: valueFor(SERIES_L, xsN, 0, f, f, 50) }]);
    near(r.at(0, M_YI), 0.5, 'C26 b_C'); near(r.at(1, M_YI), 1.322875656, 'C26 b_B');
    near(r.at(1, M_ZR), 0.25, 'C26 z_B r'); near(r.at(1, M_ZI), -0.6614378278, 'C26 z_B x');
    near(r.Z()[0], 12.5, 'C26 input R'); near(r.Z()[1], -12.5, 'C26 input X');
    printed(bp, '0.823', 'C26 b_P'); printed(bp / 50 * 1e3, '16.5', 'C26 B_P (mS)'); printed(-50 / bp, '-60.8', 'C26 X_P');
    printed(xsN, '0.411', 'C26 x_S'); printed(xsN * 50, '20.6', 'C26 X_S');
    near(bp / 50 * 1e3, 16.45751311, 'C26 B_P'); near(-50 / bp, -60.76252185, 'C26 X_P'); near(xsN * 50, 20.57189139, 'C26 X_S');
  }
  {
    // C27: 17.5 Ω + 6.5 nH at 800 MHz on 50 Ω: a line then a series C, or a line then a shunt L.
    const f = 800e6, load = [{ kind: SERIES_L, value: 6.5e-9 }];
    const r0 = run(50, f, 17.5, 0, load);
    near(r0.Z()[1], 32.67256360, 'C27 jωL'); printed(r0.Z()[1], '32.7', 'C27 jωL');
    near(r0.at(1, M_ZI), 0.6534512719, 'C27 x_T'); printed(r0.at(1, M_ZR), '0.35', 'C27 r_T'); printed(r0.at(1, M_ZI), '0.65', 'C27 x_T');
    near(metresFromTurns(1, f), 0.3747405725, 'C27 λ'); printed(metresFromTurns(1, f) * 1e3, '375', 'C27 λ (mm)');
    const ta = 0.07907895786, tb = 0.3290789579;
    const ra = run(50, f, 17.5, 0, [...load, { kind: LINE, value: ta, zc: 50 }]);
    near(ra.at(2, M_ZR), 1, 'C27 r after the line', 1e-9); near(ra.at(2, M_ZI), 1.557927712, 'C27 x after the line');
    const Cm = valueFor(SERIES_C, -ra.at(2, M_ZI), 0, f, f, 50);
    near(Cm, 2.553952630e-12, 'C27 C_m'); printed(Cm * 1e12, '2.6', 'C27 C_m (pF)');
    printed(ta, '0.079', 'C27 ℓ'); printed(metresFromTurns(ta, f) * 1e3, '29.6', 'C27 ℓ (mm)');
    near(metresFromTurns(ta, f), 29.63409394e-3, 'C27 ℓ');
    ok(run(50, f, 17.5, 0, [...load, { kind: LINE, value: ta, zc: 50 }, { kind: SERIES_C, value: Cm }]).mag() < 1e-9, 'C27 matched with series C');
    const rb = run(50, f, 17.5, 0, [...load, { kind: LINE, value: tb, zc: 50 }]);
    near(rb.at(2, M_YR), 1, 'C27 g after the line', 1e-9); near(rb.at(2, M_YI), 1.557927712, 'C27 b after the line');
    const Lm = valueFor(SHUNT_L, -rb.at(2, M_YI), 0, f, f, 50);
    near(Lm, 6.384881574e-9, 'C27 L_m'); printed(tb, '0.329', 'C27 ℓ shunt'); printed(metresFromTurns(tb, f) * 1e3, '123', 'C27 ℓ shunt (mm)');
    near(metresFromTurns(tb, f), 123.3192371e-3, 'C27 ℓ shunt');
    ok(run(50, f, 17.5, 0, [...load, { kind: LINE, value: tb, zc: 50 }, { kind: SHUNT_L, value: Lm }]).mag() < 1e-9, 'C27 matched with shunt L');
  }
  {
    // C28: the four conversions at 100 MHz on 50 Ω.
    const f = 1e8;
    for (const [kind, a, ours, text, unit] of [[SERIES_C, -0.8, 39.78873577e-12, '40', 1e12], [SHUNT_L, -1.49, 53.40769902e-9, '53', 1e9], [SERIES_C, -0.23, 138.3956027e-12, '138', 1e12], [SHUNT_C, 1.14, 36.28732702e-12, '36', 1e12]]) {
      const v = valueFor(kind, a, 0, f, f, 50);
      near(v, ours, `C28 ${KIND_NAMES[kind]} for ${a}`); printed(v * unit, text, `C28 ${KIND_NAMES[kind]} for ${a}`);
      near(added(kind, v, 0, f, f, 50), a, `C28 ${KIND_NAMES[kind]} back`, 1e-14);
    }
    near(metresFromTurns(1, f), 2.997924580, 'C28 λ');
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('network vs impedances');
  {
    let worst = 0, worstMatrix = 0;
    const nodes = new Float64Array(11 * NODE_STRIDE), g = new Float64Array(2), m = new Float64Array(8), node = new Float64Array(4);
    for (let k = 0; k < 10000; k++) {
      const c = randomCircuit();
      const f = c.f0 * logU(-0.3, 0.3);
      const packed = packParts(c.parts);
      evaluate(nodes, packed, c.parts.length, c.loadR, c.loadX, c.z0, f, c.f0);
      nodeGamma(g, 0, nodes, c.parts.length * NODE_STRIDE);
      const ref = reference(c.z0, c.f0, c.loadR, c.loadX, c.parts, f);
      const err = Math.hypot(g[0] - ref[0], g[1] - ref[1]) / Math.max(1, Math.hypot(ref[0], ref[1]));
      if (err > worst) worst = err;
      if (!(err <= 1e-12)) ok(false, `circuit ${k} (${c.parts.map((p) => KIND_NAMES[p.kind]).join(', ')}): Γ ${g[0]}, ${g[1]} vs ${ref[0]}, ${ref[1]}`);
      // The same circuit through partMatrix (the reference form of each matrix).
      loadNode(node, 0, c.loadR, c.loadX, c.z0);
      for (const p of c.parts) {
        partMatrix(m, 0, p.kind, p.value, p.zc, f, c.f0, c.z0);
        const [vr, vi, ir, ii] = node;
        node[0] = m[0] * vr - m[1] * vi + m[2] * ir - m[3] * ii; node[1] = m[0] * vi + m[1] * vr + m[2] * ii + m[3] * ir;
        node[2] = m[4] * vr - m[5] * vi + m[6] * ir - m[7] * ii; node[3] = m[4] * vi + m[5] * vr + m[6] * ii + m[7] * ir;
      }
      nodeGamma(g, 0, node, 0);
      worstMatrix = Math.max(worstMatrix, Math.hypot(g[0] - ref[0], g[1] - ref[1]) / Math.max(1, Math.hypot(ref[0], ref[1])));
    }
    ok(worst <= 1e-12, `10,000 random circuits agree with the impedance computation to 1e-12 (worst ${worst.toExponential(2)})`);
    ok(worstMatrix <= 1e-12, `partMatrix agrees too (worst ${worstMatrix.toExponential(2)})`);
    console.log(`network vs impedances: worst |ΔΓ| ${worst.toExponential(2)} (applyPart), ${worstMatrix.toExponential(2)} (partMatrix) on 10,000 circuits of 1–10 parts`);
    // The determinant of every unscaled matrix is 1 (reciprocal): direct forms of lumped parts, lines.
    let det = 0;
    for (let k = 0; k < 2000; k++) {
      const c = randomCircuit(1), p = c.parts[0];
      partMatrix(m, 0, p.kind, p.value, p.zc, c.f0, c.f0, c.z0);
      if (m[0] !== 1 && !(p.kind === LINE || p.kind === QUARTER)) continue;
      const dr = m[0] * m[6] - m[1] * m[7] - (m[2] * m[4] - m[3] * m[5]);
      const di = m[0] * m[7] + m[1] * m[6] - (m[2] * m[5] + m[3] * m[4]);
      det = Math.max(det, Math.hypot(dr - 1, di));
    }
    ok(det < 1e-14, `AD − BC = 1 for unscaled matrices (worst ${det})`);
    // Every node's figures agree with convert.ts on its Γ.
    let figures = true;
    const metrics = new Float64Array(11 * METRIC_STRIDE);
    for (let k = 0; k < 2000 && figures; k++) {
      const c = randomCircuit();
      evaluate(nodes, packParts(c.parts), c.parts.length, c.loadR, c.loadX, c.z0, c.f0, c.f0);
      allMetrics(metrics, nodes, c.parts.length);
      for (let n = 0; n <= c.parts.length; n++) {
        const o = n * METRIC_STRIDE, gr = metrics[o + M_GR], gi = metrics[o + M_GI], mag = Math.hypot(gr, gi);
        const z = gammaOfZ(metrics[o + M_ZR], metrics[o + M_ZI]);
        figures = Math.abs(metrics[o + M_MAG] - mag) < 1e-15 && metrics[o + M_VSWR] === vswr(metrics[o + M_MAG]) &&
          metrics[o + M_RL] === returnLoss(metrics[o + M_MAG]) && metrics[o + M_ML] === mismatchLoss(metrics[o + M_MAG]) &&
          metrics[o + M_Q] === qFromGamma(gr, gi) && Math.abs(metrics[o + M_ANGLE] - Math.atan2(gi, gr)) < 1e-15 &&
          Math.hypot(z[0] - gr, z[1] - gi) < 1e-12 &&
          Math.hypot(metrics[o + M_YR] * metrics[o + M_ZR] - metrics[o + M_YI] * metrics[o + M_ZI] - 1, metrics[o + M_YR] * metrics[o + M_ZI] + metrics[o + M_YI] * metrics[o + M_ZR]) < 1e-12;
        if (!figures) { ok(false, `node figures of circuit ${k} node ${n}: ${[...metrics.subarray(o, o + METRIC_STRIDE)]}`); break; }
      }
    }
    ok(figures, 'every node\'s |Γ|, ∠Γ, VSWR, RL, ML, Q, z and y agree with convert.ts');
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('network fuzz 0 and ∞');
  {
    const loads = [[Infinity, 0], [0, 0], [50, 0], [0, 30], [0, -1e6], [1e-300, 0], [1e300, 1e300], [20, Infinity], [7, -Infinity]];
    const nodes = new Float64Array(11 * NODE_STRIDE), metrics = new Float64Array(11 * METRIC_STRIDE);
    let bad = 0, active = 0;
    for (let k = 0; k < 100000; k++) {
      const c = randomCircuit();
      if (random() < 0.5) { const [R, X] = pick(loads); c.loadR = R * (c.z0 / 50); c.loadX = X * (c.z0 / 50); }
      for (const p of c.parts) {
        const u = random();
        if (p.kind <= SHUNT_C) { if (u < 0.25) p.value = 0; else if (u < 0.5) p.value = Infinity; else if (u < 0.55) p.value = 1e-300; else if (u < 0.6) p.value = 1e300; }
        else if (p.kind !== QUARTER && u < 0.6) p.value = pick([0, 0.25, 0.5, 0.125, 0.75, 1, 3.25]);
      }
      const f = random() < 0.5 ? c.f0 : c.f0 * logU(-3, 3);
      evaluate(nodes, packParts(c.parts), c.parts.length, c.loadR, c.loadX, c.z0, f, c.f0);
      allMetrics(metrics, nodes, c.parts.length);
      for (let i = 0; i < (c.parts.length + 1) * METRIC_STRIDE; i++) if (Number.isNaN(metrics[i])) { bad++; if (bad < 5) ok(false, `NaN in figure ${i % METRIC_STRIDE} of ${JSON.stringify(c)} at ${f}`); break; }
      for (let i = 0; i < (c.parts.length + 1) * NODE_STRIDE; i += NODE_STRIDE) {
        const fine = [0, 1, 2, 3].every((j) => Number.isFinite(nodes[i + j])) && (nodes[i] !== 0 || nodes[i + 1] !== 0 || nodes[i + 2] !== 0 || nodes[i + 3] !== 0);
        if (!fine) { bad++; if (bad < 5) ok(false, `node ${i / NODE_STRIDE} is (0, 0) or not finite in ${JSON.stringify(c)}`); break; }
      }
      for (let n = 0; n <= c.parts.length; n++) if (metrics[n * METRIC_STRIDE + M_MAG] > 1 + 1e-9) { active++; if (active < 5) ok(false, `passive circuit gives |Γ| = ${metrics[n * METRIC_STRIDE + M_MAG]}: ${JSON.stringify(c)}`); break; }
    }
    ok(bad === 0, `100,000 circuits with 0, ∞, open and short: no NaN, no (0, 0) or infinite node (${bad} bad)`);
    ok(active === 0, `and a passive circuit never leaves the unit disc (${active} did)`);
    // The degenerate rule itself (engine.md §4).
    const G = (loadR, loadX, parts) => run(50, 1e8, loadR, loadX, parts).gamma();
    const is = (g, gr, gi, what) => ok(g[0] === gr && g[1] === gi, `${what}: Γ ${g}`);
    is(G(Infinity, 0, [{ kind: SERIES_C, value: 0 }]), 1, 0, 'open then series C of 0 F is the open');
    is(G(Infinity, 0, [{ kind: SERIES_R, value: Infinity }, { kind: SERIES_L, value: Infinity }]), 1, 0, 'open, series R and L of ∞ stay the open');
    is(G(0, 0, [{ kind: SHUNT_L, value: 0 }]), -1, 0, 'short then shunt L of 0 H is the short');
    is(G(0, 0, [{ kind: SHUNT_C, value: Infinity }, { kind: SHUNT_R, value: 0 }]), -1, 0, 'short, shunt C of ∞ and shunt R of 0 stay the short');
    is(G(50, 0, [{ kind: SERIES_C, value: 0 }]), 1, 0, 'a match behind a series open is the open');
    is(G(50, 0, [{ kind: SHUNT_L, value: 0 }]), -1, 0, 'a match behind a shunt short is the short');
    is(G(Infinity, 0, [{ kind: SERIES_C, value: 0 }, { kind: SHUNT_R, value: 50 }]), 0, 0, 'open, series open, then 50 Ω in shunt is the match');
    is(G(0, 0, [{ kind: SHUNT_L, value: 0 }, { kind: SERIES_R, value: 50 }]), 0, 0, 'short, shunt short, then 50 Ω in series is the match');
    is(G(Infinity, 0, [{ kind: STUB_OPEN, value: 0.25, zc: 50 }]), -1, 0, 'an open behind a λ/4 open stub is the short');
    is(G(0, 0, [{ kind: STUB_SHORT, value: 0.25, zc: 70 }]), -1, 0, 'a short behind a λ/4 short stub stays the short');
    is(G(0, 0, [{ kind: LINE, value: 0.25, zc: 70 }]), 1, 0, 'a short behind a λ/4 line is the open');
    is(G(Infinity, 0, [{ kind: LINE, value: 0.5, zc: 70 }]), 1, 0, 'an open behind a λ/2 line stays the open');
    // Values 0 and ∞ are the limits of tiny and huge values.
    let limit = 0;
    for (let k = 0; k < 2000; k++) {
      const kind = Math.floor(random() * 6), R = 50 * logU(-2, 2), X = 50 * (random() - 0.5) * 10;
      for (const [v, near0] of [[0, 1e-30], [Infinity, 1e30]]) {
        const a = G(R, X, [{ kind, value: v }]), b = G(R, X, [{ kind, value: near0 }]);
        limit = Math.max(limit, Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
    }
    ok(limit < 1e-12, `0 and ∞ are the limits of 1e-30 and 1e30 (worst ${limit})`);
    // No effect at the values of noEffect, at f0 and away from it.
    let none = 0;
    for (let k = 0; k < 2000; k++) {
      const kind = k % 9, R = 50 * logU(-2, 2), X = 50 * (random() - 0.5) * 10, f = 1e8 * logU(-1, 1);
      const a = G(R, X, []), b = run(50, 1e8, R, X, [{ kind, value: noEffect(kind, f, 1e8), zc: 50 * logU(-1, 1) }], f).gamma();
      none = Math.max(none, Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
    ok(none < 1e-14, `every part has no effect at noEffect (worst ${none})`);
    ok(Number.isNaN(noEffect(QUARTER, 1, 1)), 'the λ/4 transformer has no value without effect');
    // Reach: the added quantity of random values lies in [REACH_LO, REACH_HI]; stubs reach both signs.
    let reach = true;
    for (let k = 0; k < 5000; k++) {
      const c = randomCircuit(1), p = c.parts[0], a = added(p.kind, p.value, p.zc, c.f0, c.f0, c.z0);
      if (!(a >= REACH_LO[p.kind] && a <= REACH_HI[p.kind])) { reach = false; ok(false, `${KIND_NAMES[p.kind]} adds ${a}`); break; }
      if (p.kind !== QUARTER) {
        const back = valueFor(p.kind, a, p.zc, c.f0, c.f0, c.z0);
        const same = p.kind === LINE || p.kind === STUB_OPEN || p.kind === STUB_SHORT ? Math.abs(added(p.kind, back, p.zc, c.f0, c.f0, c.z0) - a) <= 1e-9 * Math.max(1, Math.abs(a)) : Math.abs(back - p.value) <= 1e-12 * p.value;
        if (!same) { reach = false; ok(false, `${KIND_NAMES[p.kind]} ${p.value} → ${a} → ${back}`); break; }
      }
    }
    ok(reach, 'added stays in the reach and valueFor inverts it');
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('network direction and lines');
  {
    // Clockwise is a negative cross product of (Γ − centre) and the step. The centre is the r circle's for series
    // parts, the g circle's for shunt parts, the centre of the line's own chart (Γ about Zc) for a line.
    const cases = [
      [SERIES_L, 1 + 1e-6, -1, 'series L clockwise on its r circle as L grows'],
      [SERIES_C, 1 - 1e-6, +1, 'series C anticlockwise on its r circle as C shrinks'],
      [SHUNT_C, 1 + 1e-6, -1, 'shunt C clockwise on its g circle as C grows'],
      [SHUNT_L, 1 - 1e-6, +1, 'shunt L anticlockwise on its g circle as L shrinks'],
      [STUB_OPEN, 1 + 1e-6, -1, 'open stub clockwise on its g circle as it grows from 0'],
      [STUB_SHORT, 1 + 1e-6, -1, 'short stub clockwise on its g circle as it grows from λ/4'],
      [LINE, 1 + 1e-6, -1, 'line clockwise about its own chart\'s centre as it grows'],
    ];
    for (const [kind, step, sign, what] of cases) {
      let right = 0, onCircle = 0;
      for (let k = 0; k < 1000; k++) {
        const z0 = 50, f0 = 1e9, R = z0 * logU(-1.5, 1.5), X = z0 * (random() - 0.5) * 6, zc = kind === LINE ? z0 * logU(-0.5, 0.5) : 50;
        let v;
        if (kind === STUB_OPEN) v = 0.24 * random() + 0.001; else if (kind === STUB_SHORT) v = 0.25 + 0.24 * random(); else if (kind === LINE) v = random();
        else v = valueFor(kind, (kind === SERIES_C || kind === SHUNT_L ? -1 : 1) * logU(-1, 1), 0, f0, f0, z0);
        const a = run(z0, f0, R, X, [{ kind, value: v, zc }]), b = run(z0, f0, R, X, [{ kind, value: v * step, zc }]);
        let p0, p1, centre, radius;
        if (kind === LINE) {
          // Γ in the line's own chart: (Z − Zc)/(Z + Zc), centre 0.
          const own = (r) => { const [Zr, Zi] = r.Z(); return gammaOfZ(Zr / zc, Zi / zc); };
          p0 = own(a); p1 = own(b); centre = 0; radius = Math.hypot(...gammaOfZ(R / zc, X / zc));
        } else {
          p0 = a.gamma(); p1 = b.gamma();
          if (kind <= SERIES_C) { const r = R / z0; centre = r / (1 + r); radius = 1 / (1 + r); }
          else { const g = a.at(0, M_YR); centre = -g / (1 + g); radius = 1 / (1 + g); }
        }
        const cross = (p0[0] - centre) * (p1[1] - p0[1]) - p0[1] * (p1[0] - p0[0]);
        if (Math.sign(cross) === sign) right++;
        onCircle = Math.max(onCircle, Math.abs(Math.hypot(p0[0] - centre, p0[1]) - radius), Math.abs(Math.hypot(p1[0] - centre, p1[1]) - radius));
      }
      ok(right === 1000, `${what} (${right} of 1000)`);
      ok(onCircle < 1e-12, `${KIND_NAMES[kind]} stays on its circle (worst ${onCircle})`);
    }
  }
  {
    // λ/8 line of Z0: a short is +jZ0, an open −jZ0, 100 Ω turns by −90° (Γ 1/3 → −j/3).
    const short = run(50, 1e9, 0, 0, [{ kind: LINE, value: 0.125, zc: 50 }]).Z();
    near(short[1], 50, 'λ/8 of a short is +j50 Ω', 1e-15); ok(Math.abs(short[0]) < 1e-15, `and has no R (${short[0]})`);
    const open = run(50, 1e9, Infinity, 0, [{ kind: LINE, value: 0.125, zc: 50 }]).Z();
    near(open[1], -50, 'λ/8 of an open is −j50 Ω', 1e-15);
    const g = run(50, 1e9, 100, 0, [{ kind: LINE, value: 0.125, zc: 50 }]).gamma();
    ok(Math.abs(g[0]) < 1e-15 && Math.abs(g[1] + 1 / 3) < 1e-15, `λ/8 turns Γ = 1/3 to −j/3 (${g})`);
    // λ/4 transformer with Zt ≠ Z0: Z_in = Zt²/Z_L at f0, Z_L at 2f0, a λ/8 line of Zt at f0/2.
    let quarter = 0;
    for (let k = 0; k < 1000; k++) {
      const zt = 50 * logU(-1, 1), R = 50 * logU(-2, 2), X = 50 * (random() - 0.5) * 10;
      const Z = run(50, 1e9, R, X, [{ kind: QUARTER, value: zt }]).Z();
      const want = cDiv([zt * zt, 0], [R, X]);
      quarter = Math.max(quarter, Math.hypot(Z[0] - want[0], Z[1] - want[1]) / Math.hypot(...want));
      const Z2 = run(50, 1e9, R, X, [{ kind: QUARTER, value: zt }], 2e9).Z();
      quarter = Math.max(quarter, Math.hypot(Z2[0] - R, Z2[1] - X) / Math.hypot(R, X));
      const Zh = run(50, 1e9, R, X, [{ kind: QUARTER, value: zt }], 0.5e9).Z(), Zl = run(50, 1e9, R, X, [{ kind: LINE, value: 0.125, zc: zt }]).Z();
      quarter = Math.max(quarter, Math.hypot(Zh[0] - Zl[0], Zh[1] - Zl[1]) / Math.hypot(...Zl));
    }
    ok(quarter < 1e-13, `λ/4 transformer: Zt²/Z_L at f0, Z_L at 2f0, a λ/8 line at f0/2 (worst ${quarter})`);
    // Periodicity: a line or stub of ℓ and ℓ + n·λ/2 gives the same Γ.
    let period = 0;
    for (let k = 0; k < 3000; k++) {
      const kind = pick([LINE, STUB_OPEN, STUB_SHORT]), len = random(), zc = 50 * logU(-1, 1), R = 50 * logU(-2, 2), X = 50 * (random() - 0.5) * 10;
      const a = run(50, 1e9, R, X, [{ kind, value: len, zc }]).gamma();
      for (const n of [1, 2, 7]) {
        const b = run(50, 1e9, R, X, [{ kind, value: len + n * 0.5, zc }]).gamma();
        period = Math.max(period, Math.hypot(a[0] - b[0], a[1] - b[1]));
      }
    }
    ok(period < 1e-13, `lines and stubs repeat every λ/2 (worst ${period})`);
    let exact = true;
    for (let k = 0; k < 500; k++) {
      const R = 50 * logU(-2, 2), X = 50 * (random() - 0.5) * 10;
      const a = run(50, 1e9, R, X, []).nodes, b = run(50, 1e9, R, X, [{ kind: LINE, value: 0.5 * (1 + (k % 5)), zc: 50 * logU(-1, 1) }]).nodes;
      const sign = (1 + (k % 5)) % 2 === 1 ? -1 : 1; // n = 1 + k % 5 half wavelengths: cos θ = (−1)^n
      if (![0, 1, 2, 3].every((j) => b[4 + j] === sign * a[j])) exact = false;
    }
    ok(exact, 'a line of n·λ/2 at f0 gives the load\'s node back exactly (±1)');
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('network timing');
  {
    const z0 = 50, f0 = 1e8, kinds = [SERIES_L, SHUNT_C, LINE, STUB_OPEN, SERIES_C, SHUNT_L, STUB_SHORT, SERIES_R, SHUNT_R, QUARTER];
    const parts = kinds.map((kind) => {
      switch (kind) {
        case SERIES_L: return { kind, value: 40e-9 };
        case SERIES_C: return { kind, value: 30e-12 };
        case SHUNT_L: return { kind, value: 60e-9 };
        case SHUNT_C: return { kind, value: 20e-12 };
        case SERIES_R: return { kind, value: 5 };
        case SHUNT_R: return { kind, value: 2000 };
        case QUARTER: return { kind, value: 70 };
        default: return { kind, value: 0.1, zc: 60 };
      }
    });
    const packed = packParts(parts), nf = 2000, freqs = new Float64Array(nf), gamma = new Float64Array(2 * nf);
    for (let i = 0; i < nf; i++) freqs[i] = f0 * (0.5 + i / (nf - 1));
    for (let k = 0; k < 200; k++) sweep(gamma, freqs, nf, packed, 10, 25, 25, z0, f0);
    const runs = 1000, t0 = performance.now();
    for (let k = 0; k < runs; k++) sweep(gamma, freqs, nf, packed, 10, 25, 25, z0, f0);
    const perSweep = (performance.now() - t0) / runs;
    // Same answer as the one-frequency path.
    const one = new Float64Array(2);
    inputGamma(one, 0, packed, 10, 25, 25, z0, freqs[777], f0);
    ok(one[0] === gamma[1554] && one[1] === gamma[1555], 'sweep equals inputGamma');
    const ref = reference(z0, f0, 25, 25, parts, freqs[777]);
    ok(Math.hypot(one[0] - ref[0], one[1] - ref[1]) < 1e-12, 'the timed circuit agrees with the impedance computation');
    const nodes = new Float64Array(11 * NODE_STRIDE), metrics = new Float64Array(11 * METRIC_STRIDE);
    const t1 = performance.now();
    for (let k = 0; k < 100000; k++) { evaluate(nodes, packed, 10, 25, 25, z0, f0, f0); allMetrics(metrics, nodes, 10); }
    const perEval = ((performance.now() - t1) / 100000) * 1000;
    ok(perSweep < 4, `10 parts at 2,000 frequencies within the 4 ms frame budget (${perSweep.toFixed(3)} ms)`);
    console.log(`network timing: 10 parts at 2,000 frequencies ${perSweep.toFixed(3)} ms per sweep; nodes and figures of 10 parts at one frequency ${perEval.toFixed(2)} µs`);
  }
}
