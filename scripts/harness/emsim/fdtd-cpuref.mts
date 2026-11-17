// A CPU reference run for check-fdtd-gpu.mjs (M6.3), run as a child process so the references run in parallel with
// each other and with the WebGPU runs: `tsx fdtd-cpuref.mts <case> <mode> <f32|f64> <maxSteps|-> <out.json>`.
// Writes the records (arrays as base64) and the run time. Not part of the site.
import { writeFileSync } from 'node:fs';
import { caseProblem, packRecords, Ru } from './webgpu/cases.mts';

const [name, mode, precision, max, out] = process.argv.slice(2);
const p = caseProblem(name, precision as 'f32' | 'f64');
const t0 = performance.now();
const r = Ru.runProblem(p, mode as 'full' | 'tdr', { maxSteps: max === '-' ? undefined : Number(max) });
const ms = performance.now() - t0;
writeFileSync(out, JSON.stringify({ name, mode, precision, cells: p.N, ms, records: packRecords(r) }));
