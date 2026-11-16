// SPIKE (M0.4a), not product code.
// `npm run spike:fdtd [barrel|js|gpu|all]` in scripts/harness/emsim: the round-barrel test, the Yee update in
// JavaScript (f32, f64) and WebGPU (f32), their agreement, cells per second, and the estimate of a 2 M-cell via run.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeProblem, JsYee } from './yee.mts';
import { barrelTable } from './barrel2d.mts';
// @ts-ignore plain .mjs module
import { withWebGpuPage } from '../webgpu/runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const what = process.argv[2] ?? 'all';
const GRIDS: [number, number, number][] = [[128, 64, 64], [128, 128, 128], [256, 256, 128]];
const CMP: [number, number, number, number] = [96, 64, 48, 2000];   // agreement test: grid and steps
const fmt = (x: number, d = 3) => x.toPrecision(d);
const M = (x: number) => `${(x / 1e6).toFixed(2)} M`;

function relDiff(a: ArrayLike<number>, b: ArrayLike<number>, ref: ArrayLike<number>) {
  let m = 0, r = 0;
  for (let i = 0; i < a.length; i++) { m = Math.max(m, Math.abs(a[i] - b[i])); r = Math.max(r, Math.abs(ref[i])); }
  return m / r;
}

function jsRate(dims: [number, number, number], f64: boolean, minMs = 1500) {
  const p = makeProblem(...dims, 200);
  const sim = new JsYee(p, f64);
  sim.run(3);
  let steps = 2, ms = 0;
  for (;;) {
    const t0 = performance.now(); sim.run(steps); ms = performance.now() - t0;
    if (ms >= minMs) break;
    steps = Math.ceil(steps * Math.max(2, (1.2 * minMs) / Math.max(ms, 1)));
  }
  return { cells: p.n, steps, ms, cellsPerSecond: (p.n * steps) / (ms / 1000) };
}

const out: any = {};
const t0 = performance.now();

if (what === 'barrel' || what === 'all') {
  out.barrel = barrelTable();
  console.log('\nRound barrel (drill 0.3 mm, antipad 0.7 mm, coax Z0): |error of Z0| over 8 grid offsets, %');
  console.log('cells/drill | staircase mean  max | conformal mean  max');
  for (const r of out.barrel)
    console.log(`${String(r.cellsPerDrill).padStart(11)} | ${(100 * r.stair.mean).toFixed(2).padStart(14)} ${(100 * r.stair.max).toFixed(2).padStart(4)} | ${(100 * r.conf.mean).toFixed(3).padStart(14)} ${(100 * r.conf.max).toFixed(3).padStart(5)}`);
}

if (what === 'gpu' || what === 'all') {
  out.gpu = await withWebGpuPage(path.join(HERE, 'yee-gpu.mts'), async (page: any, mode: string) => {
    const r: any = { mode };
    r.info = await page.evaluate(() => (globalThis as any).spike.info());
    r.compare = await page.evaluate((a: number[]) => (globalThis as any).spike.compare(...a), CMP);
    r.rates = [];
    for (const g of GRIDS) r.rates.push(await page.evaluate((a: number[]) => (globalThis as any).spike.rate(a[0], a[1], a[2], 10), g));
    r.perSubmit = [];
    for (const k of [1, 50]) r.perSubmit.push(await page.evaluate((a: number[]) => (globalThis as any).spike.rate(a[0], a[1], a[2], a[3]), [...GRIDS[1], k]));
    return r;
  }, { log: (s: string) => console.log(s) });
  const hp = out.gpu.info.highPerformance, lp = out.gpu.info.lowPower;
  console.log(`\nWebGPU (${out.gpu.mode} Edge): high-performance adapter ${hp?.vendor} / ${hp?.architecture} / ${hp?.description || hp?.device} (fallback: ${hp?.isFallbackAdapter})`);
  console.log(`  low-power adapter ${lp?.vendor} / ${lp?.architecture} / ${lp?.description || lp?.device}`);
  console.log(`  limits ${JSON.stringify(hp?.limits)}`);
  console.log(`  features ${hp?.features?.join(' ')}`);
  console.log(`  ${out.gpu.info.userAgent}`);
}

if (what === 'js' || what === 'all' || what === 'gpu') {
  const [nx, ny, nz, steps] = CMP;
  const p = makeProblem(nx, ny, nz, steps);
  const s32 = new JsYee(p, false), s64 = new JsYee(p, true);
  s32.run(steps); s64.run(steps);
  const ez32 = s32.E.subarray(2 * p.n), ez64 = s64.E.subarray(2 * p.n);
  console.log(`\nAgreement on ${nx}x${ny}x${nz} (${p.n} cells), ${steps} steps; max |difference| / max |f64 value|:`);
  console.log(`  JS f32 vs JS f64: probe trace ${fmt(relDiff(s32.probeTrace, s64.probeTrace, s64.probeTrace))}, final Ez ${fmt(relDiff(ez32, ez64, ez64))}`);
  if (out.gpu) {
    const g = out.gpu.compare;
    console.log(`  WebGPU f32 vs JS f32: probe ${fmt(relDiff(g.probe, s32.probeTrace, s64.probeTrace))}, final Ez ${fmt(relDiff(g.ez, ez32, ez64))}`);
    console.log(`  WebGPU f32 vs JS f64: probe ${fmt(relDiff(g.probe, s64.probeTrace, s64.probeTrace))}, final Ez ${fmt(relDiff(g.ez, ez64, ez64))}`);
  }
  let peak = 0; for (const x of s64.probeTrace) peak = Math.max(peak, Math.abs(x));
  console.log(`  probe peak (f64) ${fmt(peak)}, at the end ${fmt(s64.probeTrace[steps - 1])}`);
}

if (what === 'js' || what === 'all') {
  out.js = [];
  for (const g of GRIDS) for (const f64 of [false, true]) out.js.push({ f64, ...jsRate(g, f64) });
}

console.log('\nCell updates (E and H) per second');
console.log('backend       |   cells | steps timed |  ms   | cells/s');
for (const r of out.gpu?.rates ?? []) console.log(`WebGPU f32    | ${M(r.cells).padStart(7)} | ${String(r.steps).padStart(11)} | ${r.ms.toFixed(0).padStart(5)} | ${fmt(r.cellsPerSecond)}  (10 steps/submit, longest submit ${r.maxSubmitMs.toFixed(1)} ms, finite ${r.finite})`);
for (const r of out.gpu?.perSubmit ?? []) console.log(`WebGPU f32    | ${M(r.cells).padStart(7)} | ${String(r.steps).padStart(11)} | ${r.ms.toFixed(0).padStart(5)} | ${fmt(r.cellsPerSecond)}  (${r.perSubmit} steps/submit, longest submit ${r.maxSubmitMs.toFixed(1)} ms)`);
for (const r of out.js ?? []) console.log(`JS ${r.f64 ? 'f64' : 'f32'} (Node) | ${M(r.cells).padStart(7)} | ${String(r.steps).padStart(11)} | ${r.ms.toFixed(0).padStart(5)} | ${fmt(r.cellsPerSecond)}`);

// Estimate of a 2 M-cell via run (fullwave.md section 9): smallest cells 50 um (x, y; barrel 0.3 mm at 6 cells)
// and 25 um (z), Courant number 0.95; settling T = excitation (10 sigma, -60 dB at 43 GHz) + 3 round trips of
// 2 x 3 mm feed (eps_eff 3.2) and a 1.6 mm via (eps_r 4.3); CPML and ports cost x1.5 over the bare update.
const c0 = 299792458;
const dt = 0.95 / (c0 * Math.sqrt(2 / 50e-6 ** 2 + 1 / 25e-6 ** 2));
const sigma = Math.sqrt(2 * Math.log(1000)) / (2 * Math.PI * 43e9);
const trip = 2 * (6e-3 * Math.sqrt(3.2) + 1.6e-3 * Math.sqrt(4.3)) / c0;
const T = 10 * sigma + 3 * trip, nSteps = Math.ceil(T / dt), cells = 2e6, overhead = 1.5;
console.log(`\n2 M-cell via run: dt ${fmt(dt * 1e15)} fs, T ${fmt(T * 1e12)} ps (excitation ${fmt(10 * sigma * 1e12)} ps + 3 x ${fmt(trip * 1e12)} ps), ${nSteps} steps, x${overhead} for CPML and ports`);
const est = (rate: number) => (cells * nSteps * overhead) / rate;
const pick = (rows: any[], f: (r: any) => boolean) => rows?.find(f);
const g2 = pick(out.gpu?.rates, r => r.cells === 128 ** 3), j32 = pick(out.js, r => r.cells === 128 ** 3 && !r.f64), j64 = pick(out.js, r => r.cells === 128 ** 3 && r.f64);
if (g2) console.log(`  WebGPU f32: ${fmt(est(g2.cellsPerSecond))} s`);
if (j32) console.log(`  JS f32 worker: ${fmt(est(j32.cellsPerSecond))} s (${fmt(est(j32.cellsPerSecond) / 60)} min)`);
if (j64) console.log(`  JS f64 (harness reference): ${fmt(est(j64.cellsPerSecond))} s`);
console.log(`\ntotal ${((performance.now() - t0) / 1000).toFixed(1)} s`);
