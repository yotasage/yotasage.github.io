// The estimator's static part (step M6.1, docs/em-sim/fullwave.md §11.1, §11.4, §9.1): cells, the Courant time step,
// the steps for the band and settling, the memory per buffer and in total, the run time at a given rate, and the
// refusal rules with the coarser-mesh offer. Runs on the mesh's counts alone, before anything is allocated.

import { C0_MM, COURANT } from './model';
import { slabCellsOf, tableEntries } from './cpml';
import { pulseOf } from './ports';

export const OVERHEAD = 1.5; // CPML, ports and records over the bare update (§11.1)
export const RING = 64; // steps of the port record (§9.1)
export const RECORD_PER_PORT = 6; // values per port and step: the port's v and i, and v, i at its two planes
export const RATES = { webgpu: 6e9, js: 3e7 } as const; // cell updates per second before the calibration (§9.6, §10)
export const MiB = 1024 * 1024;
/** The calibration (§11.2, M6.3): warm-up and timed steps on the real problem, and the margin on its time. */
export const CALIB_WARMUP = 10, CALIB_STEPS = 30, CALIB_MARGIN = 1.1;
/** When the timed steps take less than CALIB_MIN_MS (a GPU: 30 steps are a few ms, mostly the submit and read-back
 *  latency), as many more as fill CALIB_MIN_MS are timed (at most CALIB_MAX_STEPS) and give the rate (M6.3). */
export const CALIB_MIN_MS = 50, CALIB_MAX_STEPS = 2000;
/** The estimator's rate (a bare update's, × OVERHEAD in `estimate`) from a calibrated rate of the whole loop, so the
 *  estimate is the calibrated time × CALIB_MARGIN. */
export const rateFromCalibration = (loopRate: number): number => (loopRate * OVERHEAD) / CALIB_MARGIN;

/** Δt of §2 from the smallest cells (mm): 0.95/(c0·√(dx⁻² + dy⁻² + dz⁻²)). */
export function courantDt(dx: number, dy: number, dz: number): number {
  return COURANT / (C0_MM * Math.sqrt(1 / (dx * dx) + 1 / (dy * dy) + 1 / (dz * dz)));
}

/** T = 10σ + 3·τrt (§11.1); τrt = 2·Σ len·√εeff / c0 over the longest port-to-port path (mm). */
export function runTime(trMin: number, path: { len: number; er: number }[]): { T: number; tauRt: number } {
  const tauRt = (2 * path.reduce((a, p) => a + p.len * Math.sqrt(p.er), 0)) / C0_MM;
  return { T: 10 * pulseOf(trMin).sigma + 3 * tauRt, tauRt };
}

export interface EstimateIn {
  n: [number, number, number]; // grid nodes per axis (ghost included)
  cpml: [number, number, number]; // CPML cells per side per axis
  minCell: [number, number, number]; // mm
  ports: number;
  trMin: number; path: { len: number; er: number }[];
  bytes?: 4 | 8; // the run's precision (4: f32)
  rate?: number; // cell updates per second (default: WebGPU's table value)
}
export interface Estimate {
  cells: number; slabCells: number; dt: number; T: number; tauRt: number; steps: number;
  memory: { E: number; H: number; CA: number; CB: number; lines: number; psi: number; cpmlTables: number; record: number; total: number };
  largestBuffer: number; seconds: number; rate: number;
}

export function estimate(e: EstimateIn): Estimate {
  const b = e.bytes ?? 4;
  const [nx, ny, nz] = e.n;
  const N = nx * ny * nz;
  const dt = courantDt(...e.minCell);
  const { T, tauRt } = runTime(e.trMin, e.path);
  const steps = Math.ceil(T / dt);
  const slab = slabCellsOf(e.n, e.cpml);
  const mem = {
    E: 3 * N * b, H: 3 * N * b, CA: 3 * N * b, CB: 3 * N * b,
    lines: 2 * (nx + ny + nz) * b, psi: 4 * slab * b, cpmlTables: tableEntries(e.n, e.cpml) * b,
    record: RING * e.ports * RECORD_PER_PORT * b, total: 0,
  };
  mem.total = mem.E + mem.H + mem.CA + mem.CB + mem.lines + mem.psi + mem.cpmlTables + mem.record;
  const rate = e.rate ?? RATES.webgpu;
  return { cells: N, slabCells: slab, dt, T, tauRt, steps, memory: mem, largestBuffer: mem.E, seconds: (N * steps * OVERHEAD) / rate, rate };
}

export interface Env {
  backend: 'webgpu' | 'js';
  maxBufferSize?: number; maxStorageBufferBindingSize?: number;
  mobile?: boolean; deviceMemory?: number; // GiB, navigator.deviceMemory
}
export interface Verdict { level: 'refuse' | 'warn'; code: string; message: string }
export interface Offer { s: number; limitedBy: '' | 'barrel' | 'dielectric'; seconds: number }

/** The refusal rules of §11.4 and, when one fires on size or time, the offer of a coarser mesh: every cell × s
 *  (time ∝ s⁻⁴) to reach 5 min, never above 4 cells per drill (`drill`, `hBarrel`) or 2 per dielectric (`thinnest`, `hZ`). */
export function verdicts(est: Estimate, env: Env, lim: { drill?: number; hBarrel?: number; thinnest?: number; hZ?: number } = {}): { verdicts: Verdict[]; offer: Offer | null } {
  const out: Verdict[] = [];
  const mb = (x: number) => `${(x / MiB).toFixed(0)} MiB`;
  if (env.maxBufferSize && est.largestBuffer > env.maxBufferSize) out.push({ level: 'refuse', code: 'buffer', message: `A field buffer of ${mb(est.largestBuffer)} is over the adapter's largest buffer (${mb(env.maxBufferSize)}).` });
  if (env.maxStorageBufferBindingSize && est.largestBuffer > env.maxStorageBufferBindingSize) out.push({ level: 'refuse', code: 'binding', message: `A field buffer of ${mb(est.largestBuffer)} is over the adapter's largest binding (${mb(env.maxStorageBufferBindingSize)}).` });
  let cap: number;
  if (env.backend === 'webgpu') cap = (env.maxBufferSize && env.maxBufferSize <= 256 * MiB) || env.mobile ? 256 * MiB : 1024 * MiB;
  else cap = env.mobile || (env.deviceMemory && env.deviceMemory <= 4) ? 300e6 : 1024 * MiB;
  if (est.memory.total > cap) out.push({ level: 'refuse', code: 'memory', message: `The run needs ${mb(est.memory.total)}, more than the ${mb(cap)} allowed here.` });
  if (est.seconds > 3600) out.push({ level: 'refuse', code: 'time', message: `The run would take about ${(est.seconds / 60).toFixed(0)} min (over 60 min).` });
  else if (est.seconds > 300) out.push({ level: 'warn', code: 'time', message: `The run would take about ${(est.seconds / 60).toFixed(1)} min (over 5 min).` });
  let offer: Offer | null = null;
  if (out.length) {
    let s = Math.max(1, (est.seconds / 300) ** 0.25);
    s = Math.max(s, (est.memory.total / cap) ** (1 / 3) * 1.01);
    let limitedBy: Offer['limitedBy'] = '';
    if (lim.drill && lim.hBarrel) { const smax = lim.drill / 4 / lim.hBarrel; if (s > smax) { s = Math.max(1, smax); limitedBy = 'barrel'; } }
    if (lim.thinnest && lim.hZ) { const smax = lim.thinnest / 2 / lim.hZ; if (s > smax) { s = Math.max(1, smax); limitedBy = 'dielectric'; } }
    offer = { s, limitedBy, seconds: est.seconds / s ** 4 };
  }
  return { verdicts: out, offer };
}
