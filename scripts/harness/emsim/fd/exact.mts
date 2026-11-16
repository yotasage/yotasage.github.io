// Exact cases of docs/em-sim/facts-cases.md for the FD solver itself (solver-fd.md §7.1): Cohn's zero-thickness
// stripline and coupled stripline, coplanar waveguide (air and half-space substrate), parallel plates between Neumann
// walls. Expected values from the closed forms of facts.md §8 (computed here by the AGM) and the tabled numbers.

import { fdSolve, MU0, C0 } from './solve.mts';
import type { FdInput, FdOptions } from './solve.mts';
import { fdQuantities } from './lines.mts';

const ETA0 = MU0 * C0;
const OPEN_L = 1, OPEN_R = 2, OPEN_UP = 4, OPEN_DOWN = 8;

function agm(a: number, g: number): number {
  for (let i = 0; i < 40 && Math.abs(a - g) > 1e-16 * a; i += 1) { const a2 = 0.5 * (a + g); g = Math.sqrt(a * g); a = a2; }
  return a;
}
// K(k′)/K(k) = M(1, k′)/M(1, k), as K(k) = π/(2·M(1, k′))
const kRatio = (k: number, kp: number) => agm(1, kp) / agm(1, k);

export function cohn(wb: number, er: number): number {
  const x = (Math.PI * wb) / 2;
  return ((ETA0 / Math.sqrt(er)) / 4) * kRatio(Math.tanh(x), 1 / Math.cosh(x));
}
export function cohnCoupled(wb: number, sb: number, er: number): { zeven: number; zodd: number } {
  const a = Math.tanh((Math.PI * wb) / 2), b = Math.tanh((Math.PI * (wb + sb)) / 2);
  const ke = a * b, ko = a / b;
  const eta = ETA0 / Math.sqrt(er);
  return { zeven: (eta / 4) * kRatio(ke, Math.sqrt((1 - ke) * (1 + ke))), zodd: (eta / 4) * kRatio(ko, Math.sqrt((1 - ko) * (1 + ko))) };
}

const rect = (u0: number, z0: number, u1: number, z1: number) => [u0, z0, u1, z0, u1, z1, u0, z1];

function stripline(strips: [number, number][], er: number): FdInput {
  const ext = Math.max(...strips.map((s) => Math.abs(s[1]))) + 2;
  return {
    signals: strips.length,
    conductors: strips.map((s, k) => ({ id: k + 1, pts: [s[0], 0.5, s[1], 0.5], open: 0 })),
    regions: [{ er, pts: rect(-ext, 0, ext, 1), open: OPEN_L | OPEN_R }],
    planeBelow: 0, planeAbove: 1, ext, zLo: 0, zHi: 1,
  };
}

function cpw(w: number, g: number, er: number): FdInput {
  const ext = w / 2 + g + 2;
  const regions = er === 1
    ? [{ er: 1, pts: rect(-ext, -1, ext, 1), open: 15 }]
    : [{ er, pts: rect(-ext, -1, ext, 0), open: OPEN_L | OPEN_R | OPEN_DOWN }, { er: 1, pts: rect(-ext, 0, ext, 1), open: OPEN_L | OPEN_R | OPEN_UP }];
  return {
    signals: 1,
    conductors: [
      { id: 1, pts: [-w / 2, 0, w / 2, 0], open: 0 },
      { id: 0, pts: [w / 2 + g, 0, ext, 0], open: OPEN_R },
      { id: 0, pts: [-ext, 0, -w / 2 - g, 0], open: OPEN_L },
    ],
    regions, planeBelow: null, planeAbove: null, ext, zLo: -1, zHi: 1,
  };
}

function plates(layers: [number, number][]): FdInput {
  const regions = [];
  let z = 0;
  for (const [t, er] of layers) { regions.push({ er, pts: rect(-0.5, z, 0.5, z + t), open: 0 }); z += t; }
  regions.push({ er: 1, pts: rect(-0.5, z, 0.5, z + 0.1), open: OPEN_UP });
  return { signals: 1, conductors: [{ id: 1, pts: [-0.5, z, 0.5, z], open: 0 }], regions, planeBelow: 0, planeAbove: null, ext: 0.5, zLo: 0, zHi: z + 0.1, sideWalls: true };
}

export interface ExactCase { id: string; inp: FdInput; vacuumOnly?: boolean; want: Record<string, number> }

export function exactCases(): ExactCase[] {
  const cs: ExactCase[] = [];
  const sl = (id: string, wb: number, er: number, want?: number) => cs.push({ id, inp: stripline([[-wb / 2, wb / 2]], er), vacuumOnly: er === 1, want: { z0_1: want ?? cohn(wb, er) } });
  sl('C14', 0.1, 1, 194.2262546);
  sl('C15', 0.5, 1, 100.4324507);
  sl('C15r', 0.5, 4.3, 48.43282847);
  sl('C16', 1.0, 1, 65.35362510);
  sl('C17', 2.0, 1, 38.57932255);
  sl('C18', 5.0, 1, 17.30892927);
  const cp = (id: string, wb: number, sb: number, er: number, ze: number, zo: number) =>
    cs.push({ id, inp: stripline([[-sb / 2 - wb, -sb / 2], [sb / 2, sb / 2 + wb]], er), vacuumOnly: er === 1, want: { zeven: ze, zodd: zo } });
  cp('C19', 0.5, 0.1, 1, 122.8856652, 69.86609071);
  cp('C21', 0.5, 0.5, 1, 107.1543785, 93.21719672);
  cp('C23', 0.25, 0.25, 1, 166.5138396, 111.1743647);
  cp('C28', 1.0, 0.2, 1, 72.16242989, 55.94039373);
  cp('C29', 0.3, 0.3, 4.3, 71.93362543, 51.97862642);
  cs.push({ id: 'C27', inp: cpw(1.0, 0.5, 1), vacuumOnly: true, want: { z0_1: 120.4841532 } });
  cs.push({ id: 'C26', inp: cpw(0.3, 0.2, 4.3), want: { z0_1: 80.43498551, eeff_1: 2.65 } });
  cs.push({ id: 'C12', inp: plates([[0.1, 4.3]]), want: { z0_1: 18.16754895 } });
  cs.push({ id: 'C13', inp: plates([[0.092, 4.3], [0.02, 3.8]]), want: { z0_1: 20.58531361, eeff_1: 4.201285583 } });
  return cs;
}

export interface ExactRow { id: string; q: string; want: number; got: number; err: number; rel: number; ratio: number; order: number; nodes: number; ms: number }

export function runExact(c: ExactCase, opts: FdOptions = {}): ExactRow[] {
  const r = fdSolve(c.inp, { ...opts, vacuumOnly: c.vacuumOnly });
  const { v, e } = fdQuantities(r);
  const last = r.levels[r.levels.length - 1];
  return Object.entries(c.want).map(([q, want]) => ({
    id: c.id, q, want, got: v[q], err: e[q], rel: Math.abs(v[q] - want) / want, ratio: Math.abs(v[q] - want) / e[q],
    order: r.order, nodes: last.nu * last.nz, ms: r.ms,
  }));
}

// CLI: tsx fd/exact.mts [levels]
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('fd/exact.mts')) {
  const levels = Number(process.argv[2] ?? 4);
  const only = process.argv[3];
  console.log('case q        want          got           rel err   est rel   |d|/est  p     nodes    ms');
  for (const c of exactCases()) {
    if (only && !only.split(',').includes(c.id)) continue;
    for (const x of runExact(c, { levels })) {
      console.log(`${x.id.padEnd(4)} ${x.q.padEnd(7)} ${x.want.toFixed(7).padStart(12)} ${x.got.toFixed(7).padStart(12)} ${x.rel.toExponential(2).padStart(9)} ${(x.err / x.want).toExponential(2).padStart(9)} ${x.ratio.toFixed(2).padStart(7)}  ${x.order.toFixed(2)} ${String(x.nodes).padStart(8)} ${x.ms.toFixed(0).padStart(6)}`);
    }
  }
}
