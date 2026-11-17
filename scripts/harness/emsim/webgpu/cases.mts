// The full-wave cases of check-fdtd-gpu.mjs (M6.3), built alike in Node (fdtd-cpuref.mts, the CPU references) and in
// the browser (fdtd-gpu.mts, the WebGPU runs). Not part of the site.
import * as Su0 from '../../../../lib/emsim/setup.ts';
import * as Pr0 from '../../../../lib/emsim/fdtd/problem.ts';
import * as V0 from '../../../../lib/emsim/via.ts';
import * as Ru0 from '../../../../lib/emsim/fdtd/run.ts';

const d = (m: any) => m.default ?? m;
export const Su = d(Su0), Pr = d(Pr0), V = d(V0), Ru = d(Ru0);

/** The cases: M6.2b's 6 mm microstrip, a 3 mm one (short checks), the C44 via and the C45 pair. */
export function caseJob(name: string): { setup: any; kind: 'trace' | 'via'; model: any } {
  const su = Su.defaultSetup();
  if (name === 'micro6') return { setup: su, kind: 'trace', model: { length: 6 } };
  if (name === 'micro3') return { setup: su, kind: 'trace', model: { length: 3 } };
  if (name === 'c44') return { setup: su, kind: 'via', model: {} };
  if (name === 'c45') return { setup: { ...su, via: V.presetVia('pair', su.stackup) }, kind: 'via', model: {} };
  throw new Error(`unknown case ${name}`);
}

export function caseProblem(name: string, precision: 'f32' | 'f64' = 'f32') {
  const j = caseJob(name);
  const b = Pr.buildProblem(j.setup, j.kind, { ...j.model, precision });
  if (!b.problem) throw new Error(`${name}: not built (${JSON.stringify(b.verdicts)})`);
  return b.problem;
}

/** Records with their arrays as base64 (plain JSON across processes and page.evaluate). */
export function packRecords(r: any): any {
  return { ...r, runs: r.runs.map((x: any) => ({ ...x, rec: b64(x.rec) })) };
}
export function unpackRecords(r: any): any {
  return { ...r, runs: r.runs.map((x: any) => ({ ...x, rec: unb64(x.rec) })) };
}
function b64(a: Float64Array): string {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Float64Array {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Float64Array(u.buffer);
}
