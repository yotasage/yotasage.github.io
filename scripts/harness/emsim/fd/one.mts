// One fuzz structure in detail (for outliers): tsx fd/one.mts <index> ['{"hMinDiv":12,...}'] [seed]
// Prints the structure, the FD levels and every quantity of both solvers.
import { compareOne, randomCase, SEED } from './fuzz.mts';
import { setupSection, solveSetup } from '../../../../lib/emsim/lines';
import { fdSolve, inputFromSection } from './solve.mts';

const i = Number(process.argv[2]);
const opts = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const seed = Number(process.argv[4] ?? SEED);
const c = randomCase(i, seed);
console.log(`#${i} ${c.desc} [${c.tags.join(', ')}] opts ${JSON.stringify(opts)}`);
const r = fdSolve(inputFromSection(setupSection(c.setup) as any), opts);
for (const l of r.levels) console.log(`  level ${l.nu}x${l.nz} iters ${l.iters} ${l.ms.toFixed(0)} ms C11 ${l.C[0][0].toExponential(9)} C0_11 ${l.C0[0][0].toExponential(9)}`);
console.log(`  R C11 ${r.C[0][0].toExponential(9)} ± ${r.err.C[0][0].toExponential(2)}, C0_11 ${r.C0[0][0].toExponential(9)} ± ${r.err.C0[0][0].toExponential(2)}, p ${r.order.toFixed(2)}, flagged ${r.flagged}`);
const res = compareOne(i, seed, opts);
console.log(`  BEM ${res.bemStatus} ${res.bemMs.toFixed(0)} ms`);
for (const x of res.rows) console.log(`  ${x.q.padEnd(6)} FD ${x.fd.toPrecision(9)} ± ${x.eF.toExponential(1)}  BEM ${x.bem.toPrecision(9)} ± ${x.eB.toExponential(1)}  ratio ${x.ratio.toFixed(2)} rel ${x.rel.toExponential(2)}`);
const b: any = solveSetup(c.setup, { M: 2 });
const n = r.n;
for (const key of ['C', 'C0'] as const) for (let p = 0; p < n; p += 1) for (let q = p; q < n; q += 1) {
  const f = r[key][p][q], ef = r.err[key][p][q], bb = b.bem[key][p][q], eb = b.bem[key === 'C' ? 'errC' : 'errC0'][p][q];
  console.log(`  ${key}${p + 1}${q + 1}`.padEnd(8) + ` FD ${f.toExponential(8)} ± ${ef.toExponential(1)}  BEM ${bb.toExponential(8)} ± ${eb.toExponential(1)}  rel ${((f - bb) / Math.abs(bb)).toExponential(2)}`);
}
