// Closed-form impedance formulas (docs/em-sim/facts-formulas.md §1–§6), for the calculator comparison of the page
// (M2.3) and the harness's check of the field solver against them (M1.4b, notes-M1.4b.md). Framework-free.
//
// Units: every length in one unit of the caller's choice (the tool passes mm); εr dimensionless; impedances in Ω.
// Every formula returns its values and its validity: which stated range an input leaves and by how much, the
// published accuracy per value (relative, null where the source states none), and what it leaves out.
//
// `closedForms(setup)` reduces a tool setup to the formulas' inputs and evaluates every formula that applies:
// - the trapezoid becomes its mean width (base − one etch offset; a pair's gap grows by the same offset),
// - the finished copper thickness of the signal layer is t,
// - h is the distance between the copper faces (the sum of the dielectrics and of any empty copper layers between,
//   the latter filled from their fill side), εr of several layers the series value h/Σ(tᵢ/εrᵢ); a stripline with
//   different εr above and below takes the parallel value (εa/ha + εb/hb)/(1/ha + 1/hb),
// - the solder mask is in no formula: it is listed under `neglects` (the field solution includes it).

import { etchOffset, fillSide, layerIndex } from './stackup';
import type { CopperLayer, DielectricLayer, Stackup } from './stackup';
import type { Setup } from './setup';

export const CF_VERSION = 1;
export const ETA0 = 376.730313412; // Ω, μ0·c (CODATA 2022)
const C_LIGHT = 299792458;

export type CfKey = 'z0' | 'eeff' | 'zeven' | 'zodd' | 'eeffEven' | 'eeffOdd' | 'zdiff' | 'zcm';
export type FormulaId =
  | 'ipc-microstrip' | 'ipc-embedded' | 'ipc-stripline' | 'ipc-dual' | 'wheeler' | 'hj' | 'kj'
  | 'cohn-stripline' | 'cohn-exact' | 'cohn-coupled' | 'cpw' | 'cpwg';

// An input outside the stated range: `by` is |value − limit|/|limit| (limit 0: |value|).
export interface Outside { input: string; value: number; limit: number; side: 'below' | 'above'; by: number }
export interface Validity {
  inside: boolean; // every stated range met
  outside: Outside[];
  range: string; // the stated range in words
  accuracy: string; // the published accuracy in words
  acc: Partial<Record<CfKey, number>> | null; // relative accuracy per value, null when not stated
  notes: string[];
}
export interface CfResult {
  id: FormulaId;
  name: string;
  source: string; // bib key(s) of references.bib and where the formula is in facts-formulas.md
  values: Partial<Record<CfKey, number>>;
  validity: Validity;
  neglects: string[]; // what the setup has that the formula leaves out (closedForms only)
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers

function lim(out: Outside[], input: string, value: number, min: number, max: number): void {
  if (value < min) out.push({ input, value, limit: min, side: 'below', by: Math.abs(value - min) / (Math.abs(min) || 1) });
  else if (value > max) out.push({ input, value, limit: max, side: 'above', by: Math.abs(value - max) / (Math.abs(max) || 1) });
}
function validity(outside: Outside[], range: string, accuracy: string, acc: Validity['acc'], notes: string[] = []): Validity {
  return { inside: outside.length === 0, outside, range, accuracy, acc, notes };
}
function result(id: FormulaId, name: string, source: string, values: CfResult['values'], v: Validity): CfResult {
  return { id, name, source, values, validity: v, neglects: [] };
}
const coth = (x: number): number => 1 / Math.tanh(x);
const sech = (x: number): number => 1 / Math.cosh(x);

// The arithmetic–geometric mean, to full precision.
function agm(a: number, b: number): number {
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-16 * a; i++) { const m = (a + b) / 2; b = Math.sqrt(a * b); a = m; }
  return (a + b) / 2;
}
// K(k)/K(k′) with k′ given separately (keeps its digits when k is near 1): K(k) = π/(2·agm(1, k′)).
export function kRatio(k: number, kp: number = Math.sqrt((1 - k) * (1 + k))): number {
  if (k <= 0) return 0;
  if (kp <= 0) return Infinity;
  return agm(1, k) / agm(1, kp);
}
// sinh(a)/sinh(b) without overflow (0 < a ≤ b).
function sinhRatio(a: number, b: number): number {
  return Math.exp(a - b) * (-Math.expm1(-2 * a)) / (-Math.expm1(-2 * b));
}
// tanh(a)/tanh(b)
function tanhRatio(a: number, b: number): number { return Math.tanh(a) / Math.tanh(b); }

// ---------------------------------------------------------------------------------------------------------------
// §1 IPC-2141 (1996), ranges from IPC-2251 as LearnEMC prints them (IPC-2141 states neither ranges nor accuracy)

const IPC_SRC = 'IPC2141 §4.2; ranges LearnEMCPCB (IPC-2251 draft); facts-formulas.md §1';
const IPC_ACC = 'not stated (IPC-2141 refers to IPC-D-317 and asks for empirical checks)';
// εeff from IPC's C0 (pF/inch) and Z0: t_pd = C0·Z0 ps/inch.
const ipcEeff = (c0pFin: number, z0: number): number => (C_LIGHT * c0pFin * z0 * 1e-12 / 0.0254) ** 2;

// Surface microstrip §4.2.1: w width, h dielectric under the strip, t thickness.
export function ipcMicrostrip(w: number, h: number, t: number, er: number): CfResult {
  const L = Math.log(5.98 * h / (0.8 * w + t));
  const z0 = 87 / Math.sqrt(er + 1.41) * L;
  const out: Outside[] = [];
  lim(out, 'w/h', w / h, 0.1, 3.0);
  lim(out, 'εr', er, 1, 15);
  const notes: string[] = [];
  if (!(L > 0)) notes.push('5.98h/(0.8w + t) ≤ 1: the logarithm is not positive, the formula fails.');
  return result('ipc-microstrip', 'IPC-2141 microstrip', IPC_SRC, { z0, eeff: ipcEeff(0.67 * (er + 1.41) / L, z0) },
    validity(out, '0.1 < w/h < 3.0, 1 < εr < 15 (IPC-2251 via LearnEMC; others say w/h < 2.0)', IPC_ACC, null, notes));
}

// Embedded microstrip §4.2.2: h1 = H′, the height of the dielectric's air surface above the plane. IPC-2141 prints
// εr′ = εr·(1 + e^(−1.55·H′/H)), which exceeds εr (unphysical); the usual reproduction has "−". `sign` chooses:
// 'corrected' (default, marked as such) or 'printed'.
export function ipcEmbedded(w: number, h: number, t: number, er: number, h1: number, sign: 'corrected' | 'printed' = 'corrected'): CfResult {
  const x = Math.exp(-1.55 * h1 / h);
  const erp = er * (sign === 'printed' ? 1 + x : 1 - x);
  const L = Math.log(5.98 * h / (0.8 * w + t));
  const z0 = 87 / Math.sqrt(erp + 1.41) * L;
  const out: Outside[] = [];
  lim(out, 'w/h', w / h, 0.1, 3.0);
  lim(out, 'εr', er, 1, 15);
  lim(out, 'cover (H′ − H − t)/H', (h1 - h - t) / h, 0, Infinity);
  const notes = [sign === 'printed'
    ? 'εr′ = εr·(1 + e^(−1.55H′/H)) as printed in IPC-2141 (1996): εr′ > εr, unphysical.'
    : 'εr′ = εr·(1 − e^(−1.55H′/H)): the sign of IPC-2141 (1996) corrected (printed "+").',
  'IPC-2141 (1996) gives this form only for buried traces; without cover it is not the surface formula (εr′ = 0.79εr).'];
  return result('ipc-embedded', `IPC-2141 embedded microstrip (${sign} sign)`, IPC_SRC, { z0, eeff: ipcEeff(0.67 * (erp + 1.41) / L, z0) },
    validity(out, '0.1 < w/h < 3.0, 1 < εr < 15 (IPC-2251 via LearnEMC), a cover above the trace', IPC_ACC, null, notes));
}

// Symmetric stripline §4.2.3: h from the strip to each plane (b = 2h + t).
export function ipcStripline(w: number, h: number, t: number, er: number): CfResult {
  const z0 = 60 / Math.sqrt(er) * Math.log(1.9 * (2 * h + t) / (0.8 * w + t));
  const out: Outside[] = [];
  lim(out, 'w/(h − t)', w / (h - t), 0, 0.35);
  lim(out, 't/h', t / h, 0, 0.25);
  lim(out, 'εr', er, 1, 15);
  return result('ipc-stripline', 'IPC-2141 symmetric stripline', IPC_SRC, { z0, eeff: er },
    validity(out, 'w/(h − t) < 0.35, t/h < 0.25, 1 < εr < 15 (IPC-2251 via LearnEMC)', IPC_ACC, null));
}

// Dual (asymmetric) stripline §4.2.4: h the dielectric to the nearer plane, far = H + C + T the distance from the
// strip's other face to the farther plane (C the dielectric between the two signal layers).
export function ipcDualStripline(w: number, h: number, t: number, er: number, far: number): CfResult {
  const z0 = 80 / Math.sqrt(er) * Math.log(1.9 * (2 * h + t) / (0.8 * w + t)) * (1 - h / (4 * far));
  const out: Outside[] = [];
  lim(out, 'C = far − h − t', far - h - t, 0, Infinity);
  return result('ipc-dual', 'IPC-2141 dual stripline', IPC_SRC, { z0, eeff: er },
    validity(out, 'none stated (the far plane beyond a second signal layer: far ≥ h + t)', IPC_ACC, null));
}

// ---------------------------------------------------------------------------------------------------------------
// §2 Wheeler 1977, microstrip with thickness

export function wheeler1977(w: number, h: number, t: number, er: number): CfResult {
  const dw = t > 0 ? (t / Math.PI) * Math.log(4 * Math.E / Math.sqrt((t / h) ** 2 + ((1 / Math.PI) / (w / t + 1.1)) ** 2)) : 0;
  const wp = w + dw * (1 + 1 / er) / 2;
  const r = 4 * h / wp;
  const phi = ((14 + 8 / er) / 11) * r;
  const z0 = ETA0 / (2 * Math.PI * Math.sqrt(2 * (1 + er))) * Math.log(1 + r * (phi + Math.sqrt(phi * phi + Math.PI * Math.PI * (1 + 1 / er) / 2)));
  const notes = ['The thickness correction assumes t ≪ w and t ≪ h.'];
  return result('wheeler', 'Wheeler 1977', 'Wheeler1977 via Ellingson2018 §3.11, WikiMicrostrip; facts-formulas.md §2', { z0 },
    validity([], 'none stated', 'Z0 within 1 % for most cases, always within 2 %', { z0: 0.02 }, notes));
}

// ---------------------------------------------------------------------------------------------------------------
// §3 Hammerstad–Jensen 1980, microstrip (static)

export function hjZ01(u: number): number {
  const f = 6 + (2 * Math.PI - 6) * Math.exp(-((30.666 / u) ** 0.7528));
  return (ETA0 / (2 * Math.PI)) * Math.log(f / u + Math.sqrt(1 + 4 / (u * u)));
}
export function hjEeff(u: number, er: number): number {
  const a = 1 + Math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49 + Math.log(1 + (u / 18.1) ** 3) / 18.7;
  const b = 0.564 * ((er - 0.9) / (er + 3)) ** 0.053;
  return (er + 1) / 2 + ((er - 1) / 2) * (1 + 10 / u) ** (-a * b);
}
// The single zero-thickness line: { z0, eeff }.
export function hjZero(u: number, er: number): { z0: number; eeff: number } {
  const e = hjEeff(u, er);
  return { z0: hjZ01(u) / Math.sqrt(e), eeff: e };
}

export function hammerstadJensen(w: number, h: number, t: number, er: number): CfResult {
  const u = w / h;
  let z0: number, eeff: number;
  if (t > 0) {
    const T = t / h;
    const du1 = (T / Math.PI) * Math.log(1 + 4 * Math.E / (T * coth(Math.sqrt(6.517 * u)) ** 2));
    const dur = 0.5 * (1 + sech(Math.sqrt(Math.max(er - 1, 0)))) * du1;
    const u1 = u + du1, ur = u + dur;
    const er0 = hjEeff(ur, er);
    z0 = hjZ01(ur) / Math.sqrt(er0);
    eeff = er0 * (hjZ01(u1) / hjZ01(ur)) ** 2;
  } else ({ z0, eeff } = hjZero(u, er));
  const out: Outside[] = [];
  lim(out, 'w/h', u, 0.01, 100);
  lim(out, 'εr', er, 1, 128);
  const notes = t > 0 ? ['The thickness correction (Hammerstad–Jensen) has no stated accuracy.'] : [];
  return result('hj', 'Hammerstad–Jensen', 'HammerstadJensen1980 via QucsTech §11.1; facts-formulas.md §3', { z0, eeff },
    validity(out, '0.01 ≤ w/h ≤ 100, εr ≤ 128', 'zero thickness: Z0 of air 0.03 %, εeff 0.2 % (so Z0 0.13 %); thickness correction not stated',
      t > 0 ? null : { z0: 0.0013, eeff: 0.002 }, notes));
}

// ---------------------------------------------------------------------------------------------------------------
// §4 Kirschning–Jansen 1984 (with the 1985 corrections), coupled microstrip, static, zero thickness

export function kirschningJansen(w: number, s: number, h: number, er: number): CfResult {
  const u = w / h, g = s / h;
  const { z0: zl0, eeff: e0 } = hjZero(u, er);
  const v = u * (20 + g * g) / (10 + g * g) + g * Math.exp(-g);
  const ae = 1 + Math.log((v ** 4 + (v / 52) ** 2) / (v ** 4 + 0.432)) / 49 + Math.log(1 + (v / 18.1) ** 3) / 18.7;
  const be = 0.564 * ((er - 0.9) / (er + 3)) ** 0.053;
  const ee = (er + 1) / 2 + ((er - 1) / 2) * (1 + 10 / v) ** (-ae * be);
  const ao = 0.7287 * (e0 - (er + 1) / 2) * (1 - Math.exp(-0.179 * u));
  const bo = 0.747 * er / (0.15 + er);
  const co = bo - (bo - 0.207) * Math.exp(-0.414 * u);
  const dd = 0.593 + 0.694 * Math.exp(-0.562 * u);
  const eo = ((er + 1) / 2 + ao - e0) * Math.exp(-co * g ** dd) + e0;
  const q1 = 0.8695 * u ** 0.194;
  const q2 = 1 + 0.7519 * g + 0.189 * g ** 2.31;
  const q3 = 0.1975 + (16.6 + (8.4 / g) ** 6) ** -0.387 + Math.log(g ** 10 / (1 + (g / 3.4) ** 10)) / 241;
  const q4 = (2 * q1 / q2) / (Math.exp(-g) * u ** q3 + (2 - Math.exp(-g)) * u ** -q3);
  const q5 = 1.794 + 1.14 * Math.log(1 + 0.638 / (g + 0.517 * g ** 2.43));
  const q6 = 0.2305 + Math.log(g ** 10 / (1 + (g / 5.8) ** 10)) / 281.3 + Math.log(1 + 0.598 * g ** 1.154) / 5.1;
  const q7 = (10 + 190 * g * g) / (1 + 82.3 * g ** 3);
  const q8 = Math.exp(-6.5 - 0.95 * Math.log(g) - (g / 0.15) ** 5);
  const q9 = Math.log(q7) * (q8 + 1 / 16.5);
  const q10 = q4 - (q5 / q2) * u ** (q6 * u ** -q9);
  const k = (zl0 / 377) * Math.sqrt(e0);
  const zeven = zl0 * Math.sqrt(e0 / ee) / (1 - k * q4);
  const zodd = zl0 * Math.sqrt(e0 / eo) / (1 - k * q10);
  const out: Outside[] = [];
  lim(out, 'w/h', u, 0.1, 10);
  lim(out, 's/h', g, 0.1, 10);
  lim(out, 'εr', er, 1, 18);
  return result('kj', 'Kirschning–Jansen coupled microstrip', 'KirschningJansen1984, KirschningJansen1985corr; facts-formulas.md §4',
    { zeven, zodd, eeffEven: ee, eeffOdd: eo, zdiff: 2 * zodd, zcm: zeven / 2 },
    validity(out, '0.1 ≤ w/h ≤ 10, 0.1 ≤ s/h ≤ 10, 1 ≤ εr ≤ 18', 'εeff even 0.7 %, odd 0.5 %, Zeven and Zodd 0.6 % (against the authors\' hybrid-mode data)',
      { eeffEven: 0.007, eeffOdd: 0.005, zeven: 0.006, zodd: 0.006, zdiff: 0.006, zcm: 0.006 },
      ['Zero thickness: copper thickness is not in the model.']));
}

// ---------------------------------------------------------------------------------------------------------------
// §5 Stripline: Cohn 1955 with thickness (b plane spacing), the exact zero-thickness single and coupled lines

export function cohnStripline(w: number, b: number, t: number, er: number): CfResult {
  const x = t / b;
  const wide = w / (b - t) >= 0.35;
  let zr: number;
  const out: Outside[] = [];
  if (wide) {
    const y = 1 / (1 - x);
    const cf = (1 / Math.PI) * (2 * y * Math.log(y + 1) - (x > 0 ? (y - 1) * Math.log(y * y - 1) : 0));
    zr = 94.15 / ((w / b) / (1 - x) + cf);
  } else {
    const d1 = Math.max(w, t), d2 = Math.min(w, t);
    const r = d2 / d1;
    const d0 = r > 0 ? (d1 / 2) * (1 + (r / Math.PI) * (1 + Math.log(4 * Math.PI / r)) + 0.510 * r * r) : d1 / 2;
    zr = 60 * Math.log(4 * b / (Math.PI * d0));
    lim(out, 'min(w, t)/max(w, t)', r, 0, 0.11);
  }
  lim(out, 't/b', x, 0, 0.25);
  return result('cohn-stripline', `Cohn stripline (${wide ? 'wide' : 'narrow'} strip)`, 'Cohn1955problems eqs. 3–5, 21; facts-formulas.md §5',
    { z0: zr / Math.sqrt(er), eeff: er },
    validity(out, wide ? 'w/(b − t) ≥ 0.35, t/b ≤ 0.25' : 'w/(b − t) ≤ 0.35, t/b ≤ 0.25, the smaller of w and t at most 0.11 of the larger',
      'at most −1.24 % (at w/(b − t) = 0.35, t = 0), believed not exceeded up to t/b = 0.25', { z0: 0.0124 }));
}

// Exact zero-thickness stripline (Cohn 1954): Z0 = η/4·K(k′)/K(k), k = tanh(πw/2b).
export function cohnExact(w: number, b: number, er: number): CfResult {
  const a = Math.PI * w / (2 * b);
  const z0 = (ETA0 / (4 * Math.sqrt(er))) / kRatio(Math.tanh(a), sech(a));
  return result('cohn-exact', 'Cohn zero-thickness stripline (exact)', 'Cohn1954; facts.md §8', { z0, eeff: er },
    validity([], 'zero thickness, strip centred', 'exact', { z0: 0, eeff: 0 }));
}

// Exact zero-thickness edge-coupled stripline (Cohn 1955): k from tanh/coth with 1 − k in a stable form.
export function cohnCoupled(w: number, s: number, b: number, er: number): CfResult {
  const a = Math.PI * w / (2 * b), c = Math.PI * (w + s) / (2 * b);
  const ke = Math.tanh(a) * Math.tanh(c), oneMinusKe = Math.cosh(c - a) / (Math.cosh(a) * Math.cosh(c));
  const ko = Math.tanh(a) / Math.tanh(c), oneMinusKo = Math.sinh(c - a) / (Math.cosh(a) * Math.sinh(c));
  const zf = ETA0 / (4 * Math.sqrt(er));
  const zeven = zf / kRatio(ke, Math.sqrt(oneMinusKe * (1 + ke)));
  const zodd = s > 0 ? zf / kRatio(ko, Math.sqrt(oneMinusKo * (1 + ko))) : 0;
  return result('cohn-coupled', 'Cohn coupled stripline (exact)', 'Cohn1955coupled; facts.md §8',
    { zeven, zodd, eeffEven: er, eeffOdd: er, zdiff: 2 * zodd, zcm: zeven / 2 },
    validity([], 'zero thickness, strips centred between the planes', 'exact', { zeven: 0, zodd: 0, zdiff: 0, zcm: 0 }));
}

// ---------------------------------------------------------------------------------------------------------------
// §6 Coplanar waveguide (Gupta et al. via QucsTech; Wen 1969 for the infinite substrate)

function gupta(w: number, g: number, t: number): { w: number; g: number } {
  if (!(t > 0)) return { w, g };
  const d = (1.25 * t / Math.PI) * (1 + Math.log(4 * Math.PI * w / t));
  return { w: w + d, g: g - d };
}
const CPW_NOTES = (t: number): string[] => (t > 0
  ? ['Thickness: Gupta\'s first-order widths w + Δ, g − Δ in the air term; the εeff correction is not available (cut off on the source page), so εeff is the zero-thickness value.']
  : []);

// Without a bottom ground: substrate h (Infinity for a half space), εr; grounds semi-infinite.
export function cpw(w: number, g: number, h: number, er: number, t = 0): CfResult {
  const k1 = w / (w + 2 * g), k1p = 2 * Math.sqrt(g * (w + g)) / (w + 2 * g);
  let q = 0.5;
  if (Number.isFinite(h)) {
    const k2 = sinhRatio(Math.PI * w / (4 * h), Math.PI * (w + 2 * g) / (4 * h));
    q = 0.5 * kRatio(k2) / kRatio(k1, k1p);
  }
  const eeff = 1 + q * (er - 1);
  const e = gupta(w, g, t);
  const ke = e.w / (e.w + 2 * e.g), kep = 2 * Math.sqrt(e.g * (e.w + e.g)) / (e.w + 2 * e.g);
  const out: Outside[] = [];
  if (t > 0) lim(out, 'g − Δ (Gupta)', e.g, 0, Infinity);
  return result('cpw', 'Coplanar waveguide (Gupta / Wen)', 'QucsTech coplanar waveguide; Wen1969; facts-formulas.md §6',
    { z0: (ETA0 / (4 * Math.sqrt(eeff))) / kRatio(ke, kep), eeff },
    validity(out, 'none stated (grounds semi-infinite)', Number.isFinite(h) && t === 0 ? 'not stated (partial capacitances)' : t === 0 ? 'exact (half space)' : 'not stated',
      Number.isFinite(h) || t > 0 ? null : { z0: 0, eeff: 0 }, CPW_NOTES(t)));
}

// With a bottom ground at distance h (grounded CPW); grounds semi-infinite.
export function cpwg(w: number, g: number, h: number, er: number, t = 0): CfResult {
  const k1 = w / (w + 2 * g), k1p = 2 * Math.sqrt(g * (w + g)) / (w + 2 * g);
  const r3 = kRatio(tanhRatio(Math.PI * w / (4 * h), Math.PI * (w + 2 * g) / (4 * h)));
  const r1 = kRatio(k1, k1p);
  const eeff = 1 + (r3 / (r1 + r3)) * (er - 1);
  const e = gupta(w, g, t);
  const r1e = kRatio(e.w / (e.w + 2 * e.g), 2 * Math.sqrt(e.g * (e.w + e.g)) / (e.w + 2 * e.g));
  const out: Outside[] = [];
  if (t > 0) lim(out, 'g − Δ (Gupta)', e.g, 0, Infinity);
  return result('cpwg', 'Grounded coplanar waveguide (Gupta)', 'QucsTech coplanar waveguide; facts-formulas.md §6',
    { z0: (ETA0 / 2) / Math.sqrt(eeff) / (r1e + r3), eeff },
    validity(out, 'none stated (grounds semi-infinite)', 'not stated (partial capacitances)', null, CPW_NOTES(t)));
}

// ---------------------------------------------------------------------------------------------------------------
// The formulas for a tool setup

export interface Reduced {
  w: number; // mean width (base − etch offset)
  t: number; // finished copper thickness of the signal layer
  s: number | null; // pair gap at the mean widths
  g: number | null; // coplanar gap at the mean widths
  h: number; // to the plane (microstrip kinds), the substrate (CPW), the nearer plane (striplines)
  hFar: number | null; // striplines: the farther plane
  cover: number | null; // embedded: dielectric above the trace up to the surface
  er: number; // the series (or, stripline, parallel) εr
  etch: number; // etch offset per side
  masked: boolean; // the field solution has solder mask over the trace
}
export interface ClosedForms {
  kind: string;
  reduced: Reduced | null;
  results: CfResult[];
  notes: string[]; // how the setup was reduced, or why no formula applies
}

// Distance and series εr from copper layer i (exclusive) to layer j (exclusive), walking the stack.
function between(s: Stackup, i: number, j: number): { h: number; er: number } | null {
  const d = j > i ? 1 : -1;
  let h = 0, inv = 0;
  for (let k = i + d; k !== j; k += d) {
    const l = s.layers[k];
    if (!l) return null;
    if (l.kind === 'dielectric') { h += l.t.v; inv += l.t.v / l.er.v; continue; }
    if (l.kind !== 'copper') return null;
    const f = s.layers[fillSide(s, k) === 'up' ? k - 1 : k + 1];
    if (!f || f.kind !== 'dielectric') return null; // an outer copper layer: air on the way
    h += l.t.v; inv += l.t.v / (f as DielectricLayer).er.v;
  }
  return h > 0 ? { h, er: h / inv } : null;
}
// Dielectric from copper layer i outwards (dir −1 up, +1 down) to the outer copper layer (empty, so air there).
function toSurface(s: Stackup, i: number, dir: -1 | 1): { h: number; er: number } | null {
  let k = i + dir;
  let last = -1;
  for (; k >= 0 && k < s.layers.length; k += dir) if (s.layers[k].kind === 'copper') last = k;
  return last < 0 ? null : between(s, i, last);
}

// Formulas that exist above but are not offered for a setup, with the reason (the field-solver comparison of M1.4b).
export const EMBEDDED_LEFT_OUT = 'IPC-2141 (1996) embedded microstrip is left out: its εr′ has a misprinted sign, and with either sign it is up to 15 % above the field solution for covers of 0.1–2 times the height (the surface formula is closer).';
export const DUAL_LEFT_OUT = 'IPC-2141 (1996) dual stripline is left out: it is 10–39 % above the field solution for an off-centre strip; the symmetric formulas are shown, marked as outside their range.';

export function closedForms(setup: Setup): ClosedForms {
  const s = setup.stackup, tr = setup.trace;
  const kind = tr.kind;
  const none = (why: string): ClosedForms => ({ kind, reduced: null, results: [], notes: [why] });
  if (kind === 'broadside' || kind === 'general' || kind === 'pair-cpw') return none('No closed form covers this structure: the field solution is the reference.');
  const i = layerIndex(s, tr.layer);
  if (i < 0 || s.layers[i].kind !== 'copper') return none('The signal layer is not a copper layer.');
  const cu = s.layers[i] as CopperLayer;
  const e = etchOffset(cu);
  const t = cu.t.v;
  const w = tr.w.v - e;
  const below = tr.below ? layerIndex(s, tr.below) : -1;
  const above = tr.above ? layerIndex(s, tr.above) : -1;
  const outerMask = (s.layers[0].kind === 'mask' && i === 1) || (s.layers[s.layers.length - 1].kind === 'mask' && i === s.layers.length - 2);
  const masked = tr.masked && outerMask;
  const notes: string[] = [];
  if (e > 0) notes.push(`Trapezoid (top ${(tr.w.v - 2 * e).toPrecision(4)}, base ${tr.w.v.toPrecision(4)}) taken as its mean width ${w.toPrecision(4)}.`);
  notes.push(`Copper thickness: the finished ${t.toPrecision(4)}${cu.calc ? ` (the fab calculator uses ${cu.calc.v.toPrecision(4)})` : ''}.`);
  const neglects: string[] = [];
  if (masked) neglects.push('solder mask');
  const red: Reduced = { w, t, s: null, g: null, h: 0, hFar: null, cover: null, er: 0, etch: e, masked };
  const results: CfResult[] = [];
  const add = (r: CfResult, extra: string[] = []): void => { r.neglects = [...neglects, ...extra]; results.push(r); };
  const plane = below >= 0 && above < 0 ? below : above >= 0 && below < 0 ? above : -1;

  if (kind === 'microstrip' || kind === 'embedded' || kind === 'pair-microstrip' || kind === 'cpwg') {
    if (plane < 0) return none('This structure needs exactly one reference plane.');
    const d = between(s, i, plane);
    if (!d) return none('No dielectric between the signal and its plane.');
    red.h = d.h; red.er = d.er;
    if (kind === 'microstrip') {
      const cov = toSurface(s, i, plane > i ? -1 : 1);
      if (cov && cov.h > 0) {
        notes.push('The trace has dielectric above it: an embedded microstrip, the surface formulas do not apply.');
      }
      add(ipcMicrostrip(w, d.h, t, d.er)); add(wheeler1977(w, d.h, t, d.er)); add(hammerstadJensen(w, d.h, t, d.er));
    } else if (kind === 'embedded') {
      const c = toSurface(s, i, plane > i ? -1 : 1);
      red.cover = c ? c.h : 0;
      notes.push(EMBEDDED_LEFT_OUT); // ipcEmbedded exists for the harness only (notes-M1.4b.md)
    } else if (kind === 'pair-microstrip') {
      red.s = tr.s.v + e;
      add(kirschningJansen(w, red.s, d.h, d.er), ['copper thickness']);
    } else {
      red.g = tr.g.v + e;
      if (tr.gw) notes.push(`The formulas take the coplanar grounds as unbounded (here ${tr.gw.v} wide).`);
      add(cpwg(w, red.g, d.h, d.er, t), tr.gw ? ['finite ground width'] : []);
    }
  } else if (kind === 'cpw') {
    if (below >= 0 || above >= 0) return none('A coplanar waveguide without ground has no reference plane.');
    const up = toSurface(s, i, -1), dn = toSurface(s, i, 1);
    if (up && dn) return none('The CPW formula needs the signal on an outer layer.');
    const d = up ?? dn;
    if (!d) return none('No substrate under the signal layer.');
    red.h = d.h; red.er = d.er; red.g = tr.g.v + e;
    notes.push(`Substrate: the whole board on the other side of the trace (${d.h.toPrecision(4)}), εr ${d.er.toPrecision(4)} in series.`);
    add(cpw(w, red.g, d.h, d.er, t), tr.gw ? ['finite ground width'] : []);
  } else if (kind === 'stripline' || kind === 'stripline2' || kind === 'pair-stripline') {
    if (below < 0 || above < 0) return none('A stripline needs a plane above and below.');
    const a = between(s, above, i), b = between(s, i, below);
    if (!a || !b) return none('No dielectric between the signal and a plane.');
    const er = (a.er / a.h + b.er / b.h) / (1 / a.h + 1 / b.h);
    if (Math.abs(a.er - b.er) > 1e-9) notes.push(`εr above ${a.er.toPrecision(4)} and below ${b.er.toPrecision(4)}: the formulas take ${er.toPrecision(4)} (the two halves in parallel).`);
    red.h = Math.min(a.h, b.h); red.hFar = Math.max(a.h, b.h); red.er = er;
    const off = Math.abs(a.h - b.h) / (a.h + b.h);
    const centred = off <= 0.01;
    const bb = a.h + t + b.h;
    const offCentre = (r: CfResult): CfResult => {
      if (!centred) { r.validity.outside.push({ input: '|ha − hb|/(ha + hb)', value: off, limit: 0.01, side: 'above', by: off / 0.01 - 1 }); r.validity.inside = false; }
      return r;
    };
    if (kind === 'pair-stripline') {
      red.s = tr.s.v + e;
      add(offCentre(cohnCoupled(w, red.s, bb, er)), ['copper thickness']);
    } else {
      add(offCentre(ipcStripline(w, (a.h + b.h) / 2, t, er)));
      add(offCentre(cohnStripline(w, bb, t, er)));
      if (!centred || kind === 'stripline2') notes.push(DUAL_LEFT_OUT);
    }
  } else return none('No closed form covers this structure.');
  return { kind, reduced: red, results, notes };
}
