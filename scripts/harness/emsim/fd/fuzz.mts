// The fuzz of step M1.4a: seeded random trace structures, each solved by the engine's boundary-element solver (only
// through solveSetup and setupSection, plan.md D11) and by the harness's finite-difference solver, compared on every
// line quantity with the bar |FD − BEM| ≤ e_FD + e_BEM.
//
// CLI (npm run check:fd): tsx fd/fuzz.mts [count=500] [seed=20261116] [levels=4]. Prints one table by structure kind,
// then every quantity over the bar with its structure.

import { availableParallelism } from 'node:os';
import { Worker, isMainThread } from 'node:worker_threads';
import { solveSetup, setupSection } from '../../../../lib/emsim/lines';
import { defaultSetup } from '../../../../lib/emsim/setup';
import { presetStructure } from '../../../../lib/emsim/structure';
import { PRESET_IDS, presetStackup } from '../../../../lib/emsim/presets';
import { cloneStackup, val } from '../../../../lib/emsim/stackup';
import { fdSolve, inputFromSection } from './solve.mts';
import type { FdOptions } from './solve.mts';
import { fdQuantities } from './lines.mts';

export const SEED = 20261116;
// Physical cores rather than logical ones: the solves are memory-bound, so extra SMT threads only add contention.
export const defaultThreads = () => Number(process.env.FD_THREADS) || Math.max(1, Math.floor(availableParallelism() / 2));

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS = ['microstrip', 'embedded', 'stripline', 'stripline2', 'cpw', 'cpwg', 'pair-microstrip', 'pair-stripline', 'pair-cpw', 'broadside', 'asym-microstrip', 'asym-stripline'] as const;

export interface Case { setup: any; kind: string; tags: string[]; desc: string }

// The i-th random structure of a seed (deterministic).
export function randomCase(i: number, seed = SEED): Case | null {
  const rnd = mulberry32((seed * 2654435761) ^ (i * 40503 + 17));
  const U = (a: number, b: number) => a + (b - a) * rnd();
  const logU = (a: number, b: number) => a * (b / a) ** rnd();
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const kind = KINDS[(i + attempt) % KINDS.length];
    const stackup = cloneStackup(presetStackup(pick(PRESET_IDS)));
    const tags: string[] = [];
    const homog = rnd() < 0.1;
    const er0 = U(2, 10);
    const etched = rnd() < 0.2;
    if (etched) tags.push('etch');
    if (homog) tags.push('one εr');
    for (const l of stackup.layers as any[]) {
      if (l.kind === 'dielectric') { l.t = val(logU(0.05, 0.5)); l.er = val(homog ? er0 : U(2, 10)); }
      if (l.kind === 'copper') {
        l.t = val(U(0.012, 0.07));
        l.etch = etched ? { kind: 'offset', side: val(U(0.1, 0.4) * l.t.v) } : { kind: 'none' };
      }
      if (l.kind === 'mask') {
        l.er = val(homog ? er0 : U(3, 4.5));
        const f = U(0.5, 1.5);
        l.onLaminate = val(0.0305 * f); l.onCopper = val(0.0152 * f); l.between = val(0.0305 * f);
      }
    }
    const w = logU(0.05, 1);
    const base = kind.startsWith('asym-') ? (kind === 'asym-microstrip' ? 'pair-microstrip' : 'pair-stripline') : kind;
    const st: any = presetStructure(base as any, stackup, w);
    if (!st) continue;
    st.s = val(kind === 'broadside' ? U(0, 1.5) * w : logU(0.05, 1));
    st.g = val(logU(0.05, 0.5));
    st.gw = rnd() < 0.5 ? null : val(logU(0.1, 1));
    st.masked = rnd() < 0.6;
    if (kind.startsWith('asym-')) {
      const w2 = w * logU(1.3, 4) ** (rnd() < 0.5 ? 1 : -1);
      const s = st.s.v;
      st.kind = 'general';
      st.signals = [{ layer: st.layer, w: val(w), u: val(-s / 2 - w / 2) }, { layer: st.layer, w: val(w2), u: val(s / 2 + w2 / 2) }];
      st.grounds = [];
      if (rnd() < 0.4) {
        const g = st.g.v;
        st.grounds = [{ layer: st.layer, a: null, b: val(-s / 2 - w - g) }, { layer: st.layer, a: val(s / 2 + w2 + g), b: null }];
        tags.push('coplanar');
      }
    }
    if (['cpw', 'cpwg', 'pair-cpw'].includes(kind)) tags.push(st.gw ? 'coplanar' : 'coplanar to edge');
    const setup = { ...defaultSetup(), stackup, trace: st };
    const sec = setupSection(setup as any);
    if (typeof sec === 'string') continue;
    if (sec.wall) continue;
    const outer = (sec.materials as any[]).some((m) => m.kind === 'mask');
    if (outer) tags.push('mask');
    const desc = `${kind} on ${stackup.id} L=${st.layer}${st.layer2 ? '+' + st.layer2 : ''} w=${w.toFixed(4)}${st.kind === 'general' ? ` w2=${st.signals[1].w.v.toFixed(4)}` : ''} s=${st.s.v.toFixed(4)} g=${st.g.v.toFixed(4)} gw=${st.gw ? st.gw.v.toFixed(3) : 'edge'} masked=${st.masked}`;
    return { setup, kind, tags, desc };
  }
  return null;
}

export interface Row { q: string; fd: number; bem: number; eF: number; eB: number; ratio: number; rel: number }
export interface Result { i: number; skip?: string; kind?: string; tags?: string[]; desc?: string; rows?: Row[]; fdMs?: number; bemMs?: number; bemStatus?: string; fdFlagged?: boolean; order?: number; nodes?: number; symmetric?: boolean; dC?: number; dC0?: number; contrast?: number }

export function compareOne(i: number, seed = SEED, opts: FdOptions = {}): Result {
  const c = randomCase(i, seed);
  if (!c) return { i, skip: 'no valid structure in 30 attempts' };
  const sec: any = setupSection(c.setup);
  const t0 = performance.now();
  const b: any = solveSetup(c.setup, { M: 2 });
  const bemMs = performance.now() - t0;
  if (!b.ok) return { i, skip: `BEM: ${b.reason}`, kind: c.kind, desc: c.desc };
  const r = fdSolve(inputFromSection(sec), opts);
  const { v, e } = fdQuantities(r);
  const B: Record<string, [number, number]> = {};
  b.lines.forEach((l: any, k: number) => { B[`z0_${k + 1}`] = [l.z0.v, l.z0.e]; B[`eeff_${k + 1}`] = [l.eeff.v, l.eeff.e]; });
  [...b.modes].sort((x: any, y: any) => x.eeff.v - y.eeff.v).forEach((m: any, k: number) => { B[`mode_${k + 1}`] = [m.eeff.v, m.eeff.e]; });
  if (b.n > 1) for (let p = 0; p < b.n; p += 1) for (let q = p; q < b.n; q += 1) B[`Zc${p + 1}${q + 1}`] = [b.Zc[p][q], b.errZc[p][q]];
  if (b.pair) {
    B.zdiff = [b.pair.zdiff.v, b.pair.zdiff.e]; B.zcm = [b.pair.zcm.v, b.pair.zcm.e];
    if (b.pair.symmetric) { B.zodd = [b.pair.zodd.v, b.pair.zodd.e]; B.zeven = [b.pair.zeven.v, b.pair.zeven.e]; }
  }
  const rows: Row[] = [];
  for (const [q, [bv, be]] of Object.entries(B)) {
    if (!(q in v)) continue;
    const d = Math.abs(v[q] - bv);
    rows.push({ q, fd: v[q], bem: bv, eF: e[q], eB: be, ratio: d / (e[q] + be), rel: d / Math.max(Math.abs(bv), 1e-300) });
  }
  const last = r.levels[r.levels.length - 1];
  // Where the two differ: the largest relative difference of C's and C0's diagonal, and the dielectric contrast.
  let dC = 0, dC0 = 0;
  for (let k = 0; k < r.n; k += 1) {
    dC = Math.max(dC, Math.abs(r.C[k][k] - b.bem.C[k][k]) / b.bem.C[k][k]);
    dC0 = Math.max(dC0, Math.abs(r.C0[k][k] - b.bem.C0[k][k]) / b.bem.C0[k][k]);
  }
  const ers = (sec.materials as any[]).map((m) => m.er);
  const contrast = Math.max(...ers) / Math.min(...ers);
  return { dC, dC0, contrast, i, kind: c.kind, tags: c.tags, desc: c.desc, rows, fdMs: r.ms, bemMs, bemStatus: b.status, fdFlagged: r.flagged, order: r.order, nodes: last.nu * last.nz, symmetric: b.pair ? b.pair.symmetric : undefined };
}

// Runs cases over worker threads; every worker is ended before returning.
export async function runPool(idx: number[], seed: number, opts: FdOptions, threads = defaultThreads(), timeoutMs = 3_600_000): Promise<Result[]> {
  const out: Result[] = [];
  const queue = idx.slice();
  const workers: Worker[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`fuzz timed out after ${timeoutMs} ms`)), timeoutMs);
      let busy = 0;
      const next = (w: Worker) => {
        const i = queue.shift();
        if (i === undefined) { if (busy === 0) { clearTimeout(timer); resolve(); } return; }
        busy += 1;
        w.postMessage({ i, seed, opts });
      };
      for (let k = 0; k < Math.min(threads, idx.length); k += 1) {
        const w = new Worker(new URL('./worker.mts', import.meta.url));
        workers.push(w);
        w.on('message', (res: Result) => { busy -= 1; out.push(res); next(w); });
        w.on('error', (err) => { clearTimeout(timer); reject(err); });
        next(w);
      }
      if (!idx.length) { clearTimeout(timer); resolve(); }
    });
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
  return out.sort((a, b) => a.i - b.i);
}

const median = (a: number[]) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };

export function summarise(res: Result[]): { lines: string[]; failures: string[]; stats: { n: number; quantities: number; over: number; medRatio: number; maxRatio: number; medRel: number; maxRel: number } } {
  const done = res.filter((r) => r.rows);
  const groups = new Map<string, Result[]>();
  for (const r of done) { const k = r.kind; groups.set(k, [...(groups.get(k) ?? []), r]); }
  const lines = ['kind               cases  quant  over  med ratio  max ratio   med rel    max rel   FD s/case'];
  const fmt = (name: string, rs: Result[]) => {
    const rows = rs.flatMap((r) => r.rows);
    const ra = rows.map((x) => x.ratio), rl = rows.filter((x) => !/^Zc12$/.test(x.q)).map((x) => x.rel);
    const over = rows.filter((x) => !(x.ratio <= 1)).length;
    lines.push(`${name.padEnd(18)} ${String(rs.length).padStart(5)} ${String(rows.length).padStart(6)} ${String(over).padStart(5)} ${median(ra).toFixed(3).padStart(10)} ${Math.max(...ra).toFixed(3).padStart(10)} ${median(rl).toExponential(2).padStart(9)} ${Math.max(...rl).toExponential(2).padStart(10)} ${(rs.reduce((a, r) => a + r.fdMs, 0) / rs.length / 1000).toFixed(2).padStart(10)}`);
    return { rows, ra, rl, over };
  };
  for (const k of KINDS) if (groups.has(k)) fmt(k, groups.get(k));
  const all = fmt('all', done);
  const failures: string[] = [];
  for (const r of done) for (const x of r.rows) if (!(x.ratio <= 1)) {
    failures.push(`#${r.i} ${r.desc} [${r.tags.join(', ')}] BEM ${r.bemStatus}${r.fdFlagged ? ', FD order flagged' : ''}, εr contrast ${r.contrast.toFixed(2)}, ΔC ${r.dC.toExponential(1)}, ΔC0 ${r.dC0.toExponential(1)}: ${x.q} FD ${x.fd.toPrecision(8)} ± ${x.eF.toExponential(1)}, BEM ${x.bem.toPrecision(8)} ± ${x.eB.toExponential(1)}, ratio ${x.ratio.toFixed(2)}, rel ${x.rel.toExponential(2)}`);
  }
  // Relative differences of C (with dielectrics) and C0 (vacuum) by dielectric contrast
  const bins = [[1, 1.0001], [1.0001, 2], [2, 3], [3, 1e9]];
  lines.push('εr contrast   cases  med ΔC     max ΔC     med ΔC0    max ΔC0');
  for (const [a, z] of bins) {
    const rs = done.filter((r) => r.contrast >= a && r.contrast < z);
    if (!rs.length) continue;
    const c = rs.map((r) => r.dC), c0 = rs.map((r) => r.dC0);
    lines.push(`${`${a}–${z >= 1e9 ? '∞' : z}`.padEnd(12)} ${String(rs.length).padStart(6)}  ${median(c).toExponential(2)}  ${Math.max(...c).toExponential(2)}  ${median(c0).toExponential(2)}  ${Math.max(...c0).toExponential(2)}`);
  }
  const skipped = res.filter((r) => r.skip);
  if (skipped.length) lines.push(`skipped ${skipped.length}: ${[...new Set(skipped.map((r) => r.skip))].slice(0, 4).join('; ')}`);
  return { lines, failures, stats: { n: done.length, quantities: all.rows.length, over: all.over, medRatio: median(all.ra), maxRatio: Math.max(...all.ra), medRel: median(all.rl), maxRel: Math.max(...all.rl) } };
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('fd/fuzz.mts')) {
  const count = Number(process.argv[2] ?? 500), seed = Number(process.argv[3] ?? SEED), levels = Number(process.argv[4] ?? 4);
  const t0 = performance.now();
  const res = await runPool(Array.from({ length: count }, (_, k) => k), seed, { levels });
  const s = summarise(res);
  for (const l of s.lines) console.log(l);
  if (s.failures.length) { console.log(`\nOver the bar (${s.failures.length}):`); for (const f of s.failures) console.log(`  ${f}`); }
  console.log(`\n${s.stats.n} structures, ${s.stats.quantities} quantities, ${s.stats.over} over the bar; ${((performance.now() - t0) / 1000).toFixed(1)} s on ${defaultThreads()} threads.`);
  process.exitCode = s.stats.over || s.stats.n < count ? 1 : 0;
}
