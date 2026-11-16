// The fuzz with the BEM only, against the FD results saved by fd/cache.mts (M1.4a-fix): tsx fd/bench.mts <cache.json>
// [M] [indices,…]. Prints the structures over the bar and one summary line (the same quantities and bar as fuzz.mts,
// plus the diagonal of C against the BEM's own errC), and the distribution of estimate / true error where the true error is
// resolved (M1.2c). SHOWC=1 lists every C_kk outside it, DUMP=1 its three levels.
import { readFileSync } from 'node:fs';
import { randomCase, SEED } from './fuzz.mts';
import { solveSetup } from '../../../../lib/emsim/lines';
import { MESH_DEFAULTS } from '../../../../lib/emsim/panels';
if (process.env.MESH) Object.assign(MESH_DEFAULTS, JSON.parse(process.env.MESH)); // research knob (M1.2c): mesh parameters as JSON
const cache: any[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const M = Number(process.argv[3] ?? 2);
const only = process.argv[4] ? new Set(process.argv[4].split(',').map(Number)) : null;
let nq = 0, over = 0, maxR = 0, cases = 0, ms = 0; const ratios: number[] = []; const bad: string[] = []; const caseOver = new Map<number, number>();
const cov: number[] = []; const tight: number[] = []; const tightC: number[] = []; const relC: number[] = []; const byKind = new Map<string, number[]>();
// estimate / true error (M1.2c), only where the true error is resolved: over 3 × the FD's own estimate
const tq = (e: number, d: number, fe: number, out: number[]) => { if (d > 3 * fe) out.push(e / d); };
for (const f of cache) {
  if (f.skip || (only && !only.has(f.i))) continue;
  const c = randomCase(f.i, SEED)!;
  const t0 = performance.now();
  const b: any = solveSetup(c.setup, { M });
  ms += performance.now() - t0;
  if (!b.ok) { bad.push(`#${f.i} BEM fails ${b.reason}`); continue; }
  cases++;
  const B: Record<string, [number, number]> = {};
  b.lines.forEach((l: any, k: number) => { B[`z0_${k + 1}`] = [l.z0.v, l.z0.e]; B[`eeff_${k + 1}`] = [l.eeff.v, l.eeff.e]; });
  [...b.modes].sort((x: any, y: any) => x.eeff.v - y.eeff.v).forEach((m: any, k: number) => { B[`mode_${k + 1}`] = [m.eeff.v, m.eeff.e]; });
  if (b.n > 1) for (let p = 0; p < b.n; p += 1) for (let q = p; q < b.n; q += 1) B[`Zc${p + 1}${q + 1}`] = [b.Zc[p][q], b.errZc[p][q]];
  if (b.pair) { B.zdiff = [b.pair.zdiff.v, b.pair.zdiff.e]; B.zcm = [b.pair.zcm.v, b.pair.zcm.e]; if (b.pair.symmetric) { B.zodd = [b.pair.zodd.v, b.pair.zodd.e]; B.zeven = [b.pair.zeven.v, b.pair.zeven.e]; } }
  let worst = 0, wq = '';
  for (const [q, [bv, be]] of Object.entries(B)) {
    if (!(q in f.v)) continue;
    const d = Math.abs(f.v[q] - bv); const r = d / (f.e[q] + be);
    nq++; ratios.push(r); tq(be, d, f.e[q], tight); { const g = q.replace(/_?\d+$/, ''); if (!byKind.has(g)) byKind.set(g, []); tq(be, d, f.e[q], byKind.get(g)!); } if (r > 1) { over++; caseOver.set(f.i, (caseOver.get(f.i) ?? 0) + 1); }
    if (r > worst) { worst = r; wq = `${q} FD ${f.v[q].toPrecision(7)}±${f.e[q].toExponential(1)} BEM ${bv.toPrecision(7)}±${be.toExponential(1)} rel ${(d / Math.abs(bv)).toExponential(1)}`; }
  }
  maxR = Math.max(maxR, worst);
  let dC = 0; for (let k = 0; k < b.n; k++) { const x = (f.C[k][k] - b.bem.C[k][k]) / f.C[k][k]; if (Math.abs(x) > Math.abs(dC)) dC = x; { const rr = Math.abs(f.C[k][k] - b.bem.C[k][k]) / (b.bem.errC[k][k] + f.eC[k][k]); cov.push(rr); relC.push(Math.abs(x)); tq(b.bem.errC[k][k], Math.abs(f.C[k][k] - b.bem.C[k][k]), f.eC[k][k], tightC); if (process.env.DUMP) console.log(`D ${f.i} ${b.bem.levels.map((l: any) => l.C[k * b.n + k]).join(" ")} ${f.C[k][k]} ${f.eC[k][k]}`); if (rr > 1 && process.env.SHOWC) console.log(`  C${k + 1}${k + 1} #${f.i} ${f.kind} ratio ${rr.toFixed(2)} levels ${b.bem.levels.map((l: any) => l.C[k * b.n + k].toExponential(6)).join(" ")} FD ${f.C[k][k].toExponential(6)}`); } }
  if (worst > 1 || only) bad.push(`#${f.i} ${f.kind} ${b.status} ratio ${worst.toFixed(2)} dC ${dC.toExponential(1)}: ${wq}`);
}
ratios.sort((a, b) => a - b); cov.sort((a, b) => a - b); tight.sort((a, b) => a - b); tightC.sort((a, b) => a - b); relC.sort((a, b) => a - b);
const qs = (a: number[]) => a.length ? `${a.length}: min ${a[0].toFixed(2)} p10 ${a[Math.floor(a.length / 10)].toFixed(2)} median ${a[Math.floor(a.length / 2)].toFixed(2)} p90 ${a[Math.floor(a.length * 0.9)].toFixed(2)}` : 'none';
for (const l of bad) console.log(l);
console.log(`M ${M}: ${cases} cases, ${nq} quantities, ${over} over in ${caseOver.size} cases, median ratio ${ratios[Math.floor(ratios.length / 2)].toFixed(2)}, max ${maxR.toFixed(2)}; Cii ratio median ${cov[Math.floor(cov.length / 2)].toFixed(2)} max ${cov[cov.length - 1].toFixed(2)}; BEM ${(ms / 1000).toFixed(1)} s`);
console.log(`estimate/true (true error over 3 × the FD's): Cii ${qs(tightC)}; all quantities ${qs(tight)}; |Cii error| median ${relC[relC.length >> 1].toExponential(1)} p90 ${relC[Math.floor(relC.length * 0.9)].toExponential(1)} max ${relC[relC.length - 1].toExponential(1)}`);
console.log(`median by kind: ${[...byKind].map(([g, a]) => { a.sort((x, y) => x - y); return `${g} ${a.length ? a[a.length >> 1].toFixed(1) : '-'} (min ${a.length ? a[0].toFixed(1) : '-'})`; }).join(', ')}`);
