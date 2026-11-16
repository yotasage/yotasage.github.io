// TDR and TDT from a network's S11 and S21 (engine.md §6.6, step M1.7). The incident wave is a periodic square wave of
// period T with Gaussian edges of the chosen 10–90 % rise time (facts-formulas.md §8: f3·tr = 0.3396): up at t = 0,
// down at T/2. Its Fourier series has only DC and the odd harmonics fₖ = k/T, each weighted by the edge's spectrum
// G(f) = exp(−(2πfσ)²/2), σ = tr/(2·1.28155); the reflected and transmitted waves are the same series times S11(fₖ) and
// S21(fₖ), read on the first half period, where they are the step responses once the network has settled within T/2.
//   r(t) = ½·Re S(0) + Σ_{k odd} (2·G(fₖ)/(πk))·(Re S(fₖ)·sin 2πfₖt + Im S(fₖ)·cos 2πfₖt).
// This is the inverse FFT of the cascade on the grid fₖ evaluated at the chosen times directly (no zero padding, no
// interpolation); the edge's own Gaussian is the window (no other window). Errors stated: the truncation (the series'
// tail beyond f_max, where G = `level`) and the settling (the response's spread over the last quarter of the half
// period). t = 0 is the edge's 50 % point at the port's reference plane; t is the round-trip time for the TDR.
// No Node APIs.

export const EDGE_Z90 = 1.2815515655446004; // the normal quantile of 0.9: tr(10–90 %) = 2·1.28155·σ
export const TDR_LEVEL = 1e-7; // the edge spectrum's amplitude at f_max

export const edgeSigma = (tr: number): number => tr / (2 * EDGE_Z90);
// The frequency where the Gaussian edge's spectrum has fallen to `level` (1/√2: f3 = 0.3396/tr; 0.1: 2.58·f3).
export const edgeFrequency = (tr: number, level: number): number => Math.sqrt(2 * Math.log(1 / level)) / (2 * Math.PI * edgeSigma(tr));
export const edgeF3 = (tr: number): number => edgeFrequency(tr, Math.SQRT1_2);

export interface TdrOptions {
  tr: number; // s, 10–90 %
  zRef?: number; // Ω, the port's reference (default 50)
  half?: number; // s, T/2 (default: max(1 ns, 40 × `span`, 20·tr))
  span?: number; // s, the network's one-way delay (sets the defaults of half and t1)
  t0?: number; t1?: number; dt?: number; // s, the time record (defaults −3·tr … 2·span + 6·tr, min(1 ps, tr/20))
  level?: number; // the edge spectrum's amplitude at f_max (default 10⁻⁷)
}
export interface TdrGrid { half: number; T: number; df: number; fmax: number; nf: number; level: number }
export interface TdrResult {
  tr: number;
  zRef: number;
  grid: TdrGrid;
  t: Float64Array; // s
  rho: Float64Array; // reflected step (incident step 1)
  z: Float64Array; // Ω: zRef·(1 + ρ)/(1 − ρ)
  tdt: Float64Array | null; // transmitted step
  err: { truncation: number; settle: number; rho: number; z: number }; // bounds of ρ and z over the record
  method: string;
  ms: number;
}
// S11 (and S21) as complex arrays (re, im interleaved) at the frequencies f (f[0] = 0).
export type SEval = (f: Float64Array) => { s11: Float64Array; s21: Float64Array | null };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// The frequencies (DC, then the odd harmonics up to f_max) and the weights of the series.
export function tdrGrid(tr: number, half: number, level = TDR_LEVEL): { grid: TdrGrid; f: Float64Array; w: Float64Array; tail: number } {
  const T = 2 * half, df = 1 / T, sg = edgeSigma(tr), fmax = edgeFrequency(tr, level);
  const K = Math.max(1, Math.floor((fmax * T + 1) / 2)); // harmonics 1, 3, …, 2K − 1 ≤ f_max·T
  const f = new Float64Array(K + 1), w = new Float64Array(K + 1);
  w[0] = 0.5;
  for (let i = 1; i <= K; i++) {
    const k = 2 * i - 1;
    f[i] = k * df;
    w[i] = (2 * Math.exp(-0.5 * (2 * Math.PI * f[i] * sg) ** 2)) / (Math.PI * k);
  }
  let tail = 0; // Σ of the weights left out (|S| ≤ 1 for a passive network)
  for (let k = 2 * K + 1; ; k += 2) {
    const g = Math.exp(-0.5 * (2 * Math.PI * k * df * sg) ** 2);
    tail += (2 * g) / (Math.PI * k);
    if (g < 1e-18) break;
  }
  return { grid: { half, T, df, fmax, nf: K + 1, level }, f, w, tail };
}

// The series at times t0 + m·dt (m < nt), by rotating each harmonic's phasor.
export function synth(f: Float64Array, w: Float64Array, S: Float64Array, t0: number, dt: number, nt: number, out: Float64Array = new Float64Array(nt)): Float64Array {
  out.fill(w[0] * S[0]);
  for (let i = 1; i < f.length; i++) {
    const om = 2 * Math.PI * f[i], wa = w[i] * S[2 * i], wb = w[i] * S[2 * i + 1];
    if (wa === 0 && wb === 0) continue;
    let c = Math.cos(om * t0), s = Math.sin(om * t0);
    const cd = Math.cos(om * dt), sd = Math.sin(om * dt);
    for (let m = 0; m < nt; m++) {
      out[m] += wa * s + wb * c;
      const c2 = c * cd - s * sd;
      s = s * cd + c * sd;
      c = c2;
    }
  }
  return out;
}

export function tdr(evalS: SEval, opt: TdrOptions): TdrResult {
  const t0ms = now();
  const tr = opt.tr, zRef = opt.zRef ?? 50, span = opt.span ?? 0;
  const half = opt.half ?? Math.max(1e-9, 40 * span, 20 * tr);
  const { grid, f, w, tail } = tdrGrid(tr, half, opt.level ?? TDR_LEVEL);
  const dt = opt.dt ?? Math.min(1e-12, tr / 20);
  const t0 = opt.t0 ?? -3 * tr, t1 = opt.t1 ?? 2 * span + 6 * tr;
  const nt = Math.max(2, Math.floor((t1 - t0) / dt + 1e-9) + 1);
  const { s11, s21 } = evalS(f);
  const rho = synth(f, w, s11, t0, dt, nt);
  const tdt = s21 ? synth(f, w, s21, t0, dt, nt) : null;
  // Settling: the spread over the last quarter of the half period (before the falling edge's own tail).
  const sg = edgeSigma(tr), a = 0.75 * half, b = half - 6 * sg;
  let settle = 0;
  if (b > a) {
    for (const S of s21 ? [s11, s21] : [s11]) {
      const r = synth(f, w, S, a, (b - a) / 15, 16);
      let lo = Infinity, hi = -Infinity;
      for (const x of r) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      settle = Math.max(settle, hi - lo);
    }
  } else settle = NaN;
  const eRho = tail + settle;
  const t = new Float64Array(nt), z = new Float64Array(nt);
  let eZ = 0;
  for (let m = 0; m < nt; m++) {
    t[m] = t0 + m * dt;
    z[m] = (zRef * (1 + rho[m])) / (1 - rho[m]);
    eZ = Math.max(eZ, (2 * zRef * eRho) / (1 - rho[m]) ** 2);
  }
  return {
    tr, zRef, grid, t, rho, z, tdt, err: { truncation: tail, settle, rho: eRho, z: eZ },
    method: `periodic Gaussian-edged square wave: DC and ${grid.nf - 1} odd harmonics of ${(grid.df / 1e9).toPrecision(4)} GHz to ${(grid.fmax / 1e9).toPrecision(4)} GHz (edge spectrum ${grid.level}), T/2 = ${(half * 1e12).toPrecision(4)} ps, no other window`,
    ms: now() - t0ms,
  };
}

// Extremes of a TDR's impedance between two times (s).
export function tdrExtremes(r: TdrResult, ta: number, tb: number): { zMin: number; tMin: number; zMax: number; tMax: number } {
  let zMin = Infinity, zMax = -Infinity, tMin = NaN, tMax = NaN;
  for (let m = 0; m < r.t.length; m++) {
    if (r.t[m] < ta || r.t[m] > tb) continue;
    if (r.z[m] < zMin) { zMin = r.z[m]; tMin = r.t[m]; }
    if (r.z[m] > zMax) { zMax = r.z[m]; tMax = r.t[m]; }
  }
  return { zMin, tMin, zMax, tMax };
}

// Linear interpolation of a TDR trace at time t (s).
export function tdrAt(r: TdrResult, y: Float64Array, t: number): number {
  const x = (t - r.t[0]) / (r.t[1] - r.t[0]);
  const i = Math.max(0, Math.min(r.t.length - 2, Math.floor(x)));
  const u = x - i;
  return y[i] * (1 - u) + y[i + 1] * u;
}
