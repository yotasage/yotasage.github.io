// The via cut (M1.6): C03 (coax) through a coaxial ring, the quasi-coaxial barrel with N return vias (C36) against
// the thin-wire formula of facts-formulas.md §7 (exact only in its limits), the segments of the default via (C44) and
// the pair preset (C45-like), and the cut's timing.

import { performance } from 'node:perf_hooks';
import * as VC0 from '../../../lib/emsim/viacut.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as V0 from '../../../lib/emsim/via.ts';

const VC = VC0.default ?? VC0, SU = SU0.default ?? SU0, V = V0.default ?? V0;
const ETA0 = 376.730313412;
const fmt = (x, d = 2) => x.toExponential(d);
const ring = (a, N, b, R) => {
  const c = [{ x: 0, y: 0, r: a, cond: 1 }];
  for (let j = 0; j < N; j++) c.push({ x: R * Math.cos((2 * Math.PI * j) / N), y: R * Math.sin((2 * Math.PI * j) / N), r: b, cond: 0 });
  return c;
};
const thinWire = (a, N, b, R, er) => (ETA0 / (2 * Math.PI * Math.sqrt(er))) * (Math.log(R / a) + Math.log(R / (N * b)) / N);

export async function run(t) {
  const rows = [];
  // C03: coax a 0.15, b 0.5, εr 4.3 → 34.81233450 Ω.
  const zc = [1, 2, 4, 8].map((M) => VC.solveCut([{ x: 0, y: 0, r: 0.15, cond: 1 }, { x: 0, y: 0, r: 0.5, cond: 0 }], { M, estimate: false }).vac.z / Math.sqrt(4.3) / 34.8123345 - 1);
  const o = Math.log2(Math.abs(zc[2] / zc[3]));
  rows.push(`C03 coax as a ring: Z0 errors ${zc.map((e) => fmt(e)).join(' ')} (M 1–8), order ${o.toFixed(2)}`);
  t.ok(Math.abs(zc[1]) < 2e-5 && Math.abs(zc[3]) < 2e-6, `C03 ring: ${zc.map((e) => fmt(e)).join(' ')}`);
  // C36: N returns of b 0.15 on R 1 around a 0.15, εr 4.3, the BEM at level 4 the reference; then thin returns,
  // where the thin-wire formula becomes exact (b ≪ spacing, a ≪ R) and tends to the coax as N grows.
  const zr = VC.solveCut([{ x: 0, y: 0, r: 0.15, cond: 1 }, { x: 0, y: 0, r: 1, cond: 0 }], { M: 2, estimate: false }).vac.z / Math.sqrt(4.3);
  const tws = [];
  for (const [N, b, ref, Mr] of [[4, 0.15, 58.54694837, 4], [8, 0.15, 54.19540656, 4], [16, 0.01, NaN, 2], [32, 0.01, NaN, 2]]) {
    const tw = thinWire(0.15, N, b, 1, 4.3);
    if (!isNaN(ref)) t.near(tw, ref, `C36 thin-wire formula N ${N}`, 1e-9);
    const s1 = VC.solveCut(ring(0.15, N, b, 1), { M: Mr / 2 });
    const sr = VC.solveCut(ring(0.15, N, b, 1), { M: Mr, estimate: false });
    const z1 = s1.vac.z / Math.sqrt(4.3), zR = sr.vac.z / Math.sqrt(4.3);
    const e1 = s1.err.z.e / Math.sqrt(4.3);
    t.ok(Math.abs(z1 - zR) <= e1, `C36 N ${N}: level ${Mr / 2} ${z1} vs level ${Mr} ${zR}, estimate ${e1}`);
    tws.push({ N, b, err: tw / zR - 1 });
    rows.push(`N ${N} returns b ${b} on R 1: BEM ${zR.toFixed(4)} Ω (level ${Mr / 2}: ${z1.toFixed(4)} ± ${e1.toFixed(4)}), thin-wire ${tw.toFixed(4)} Ω (${fmt(tw / zR - 1)}), coax to R ${zr.toFixed(4)} Ω`);
  }
  t.ok(Math.abs(tws[2].err) < 1e-3 && Math.abs(tws[3].err) < 1e-3, `thin returns: thin-wire error ${tws.map((x) => fmt(x.err)).join(' ')}`);
  t.ok(tws[0].err > 0 && tws[0].err < 0.03 && tws[1].err < 0.04, `C36 thin-wire error N 4, 8: ${fmt(tws[0].err)} ${fmt(tws[1].err)}`);

  // The default via and the pair preset: segments.
  const su = SU.defaultSetup();
  const st = su.stackup;
  for (const [name, v] of [['C44 via', su.via], ['pair preset', V.presetVia('pair', st)]]) {
    const r = VC.viaCut(st, v);
    t.ok(r.ok, `${name}: ${r.reason}`);
    if (!r.ok) continue;
    let delay = 0, len = 0;
    for (const s of r.segments) { delay += s.delay; len += s.zTop - s.zBot; t.near(s.z0 * Math.sqrt(s.er), r.vac.z, `${name}: Z·√εr of a segment`, 1e-12); }
    t.near(len, r.segments[0].zTop - r.segments[r.segments.length - 1].zBot, `${name}: segments cover the barrel`, 1e-12);
    const seg = r.segments.map((s) => `${(s.zTop - s.zBot).toFixed(3)}/${s.er}`).join(' ');
    const vals = r.n === 1 ? `Z_vac ${r.vac.z.toFixed(2)} ± ${r.err.z.e.toFixed(3)} Ω` : `vacuum Zdiff ${r.vac.zdiff.toFixed(2)} ± ${r.err.zdiff.e.toFixed(3)}, Zcm ${r.vac.zcm.toFixed(2)}, k12 ${r.vac.k12.toFixed(4)}`;
    rows.push(`${name}: ${vals}; ${r.segments.length} segments (mm/εr) ${seg}; delay ${(delay * 1e12).toFixed(2)} ps; ${r.bem.levels[r.bem.levels.length - 1].panels} panels`);
  }
  const noRet = { ...su.via, returns: [] };
  t.ok(!VC.viaCut(st, noRet).ok, 'a via without returns is refused');
  // Timing: one cut per via (all segments).
  const time = (f, n = 3) => { let best = Infinity; for (let i = 0; i < n; i++) { const t0 = performance.now(); f(); best = Math.min(best, performance.now() - t0); } return best; };
  const t1 = time(() => VC.viaCut(st, su.via));
  const t2 = time(() => VC.viaCut(st, su.via, { estimate: false }));
  const tp = time(() => VC.viaCut(st, V.presetVia('pair', st)));
  rows.push(`budget: the C44 cut (3 circles) ${t1.toFixed(1)} ms with estimate, ${t2.toFixed(1)} ms level 2 alone; the pair (8 circles) ${tp.toFixed(1)} ms; once per via for all segments`);
  t.ok(t1 < 30, `C44 cut ${t1.toFixed(1)} ms`);
  for (const r of rows) t.note(r);
}
