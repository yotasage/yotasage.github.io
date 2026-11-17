// The full-wave verification against openEMS (step M6.4c, docs/em-sim/fullwave-verify.md), the cheap part: reads
// openems/compare.json (written by compare-openems.mjs, which runs our FDTD on the GPU), re-computes from the committed
// fixtures and the quasi-static model what does not need a run (openEMS's de-embedded sections, TDR windows and stub
// notch; the model at the fixtures' planes) and compares with the stored numbers, holds the stored FDTD numbers to the
// frozen limits (compare-openems.mjs LIMITS, also stored in the JSON), and checks the via model's threshold
// RETURN_NEAR_MM against the stored sweep (the model's Z error and range at that distance).
import { readFileSync } from 'node:fs';
import * as L from './compare-lib.mjs';
import { LIMITS } from './compare-openems.mjs';

const relNear = (a, b, tol) => Math.abs(a / b - 1) <= tol;

export function run(t) {
  const o = JSON.parse(readFileSync(L.OUT, 'utf8'));
  t.ok(o.format === 'emsim-fullwave-verification' && o.version === 1 && o.step === 'M6.4c', 'compare.json: format, version, step');
  t.ok(JSON.stringify(o.limits) === JSON.stringify(LIMITS), 'compare.json: the limits as compare-openems.mjs freezes them');
  const S = L.setups();
  // openEMS and the model, re-computed
  for (const v of o.vias) {
    const fx = L.readFixture(v.id), O = L.fixtureS(fx), f = O.f;
    const feeds = Array.from({ length: O.P }, (_, n) => L.fixtureFeed(fx, n));
    const pair = O.P === 4, refl = pair ? L.pk.sdd11 : L.pk.s11, trans = pair ? L.pk.sdd21 : L.pk.s21;
    if (v.section.openems) {
      const s = L.section(O.S, f, feeds);
      t.ok(relNear(s.z, v.section.openems.z, 1e-4) && relNear(s.delay, v.section.openems.delay, 1e-4), () => `${v.id}: openEMS section ${s.z.toFixed(3)} Ω ${(s.delay * 1e12).toFixed(3)} ps as stored`);
      t.ok(relNear(s.z, fx.results.viaDeembedded.z_ohm, 1e-3), () => `${v.id}: openEMS section ${s.z.toFixed(3)} Ω against the fixture's own ${fx.results.viaDeembedded.z_ohm}`);
    }
    const tO = L.tdrStats(L.tdrOf(f, O.S, refl, pair ? 100 : 50), fx.results.tdr.viaWindow.tViaAxis_s);
    t.ok(Math.abs(tO.zMax - v.tdr.openems.zMax) < 1e-3 && Math.abs(tO.zMin - v.tdr.openems.zMin) < 1e-3, () => `${v.id}: openEMS TDR window ${tO.zMin.toFixed(2)}–${tO.zMax.toFixed(2)} Ω as stored`);
    t.ok(Math.abs(tO.zMax - fx.results.tdr.viaWindow.zMax_ohm) < 0.6, () => `${v.id}: our TDR of openEMS's S peaks at ${tO.zMax.toFixed(2)} Ω, the fixture's own ${fx.results.tdr.viaWindow.zMax_ohm} (grids differ)`);
    if (v.notch) {
      const n = L.dip(f, O.S, trans);
      t.ok(n.f === v.notch.openems.f, () => `${v.id}: openEMS notch ${n.f / 1e9} GHz as stored`);
    }
    if (v.modelOk) {
      const md = L.modelAtPlanes(S.st, S.vias[v.id], f, feeds);
      const r10 = L.sDiff(f, md.S, O.S, refl, 0, 10e9);
      t.ok(Math.abs(r10 - v.dS.model.refl10) < 1e-4, () => `${v.id}: the model's |ΔS11| to 10 GHz ${r10.toFixed(4)} as stored (${v.dS.model.refl10})`);
    } else t.ok(v.flags.includes('no-return'), `${v.id}: the model refuses (${v.flags})`);
  }
  // the FDTD within the frozen limits
  const ver = L.verdicts(o, LIMITS);
  for (const x of ver) t.ok(x.ok, () => `${x.what}: ${x.value.toFixed(4)} (limit ${x.bar})`);
  t.note(`${ver.length} limits held; worst share of its limit: ${Math.max(...ver.map((x) => Math.abs(x.value) / x.bar)).toFixed(2)}`);
  // RETURN_NEAR_MM from the sweep (antipad 0.8, so the feed over the antipad, BL90, is out)
  const sw = o.sweeps.filter((x) => Math.abs(x.ap - 0.8) < 1e-9).sort((a, b) => a.ret - b.ret);
  const err = sw.map((x) => x.section.model.z / x.section.fdtd.z - 1), fl = sw.map((x) => x.fLeave.model);
  const R = L.VM.RETURN_NEAR_MM, k = sw.findIndex((x) => x.ret > R);
  const w = (R - sw[k - 1].ret) / (sw[k].ret - sw[k - 1].ret);
  const eR = err[k - 1] + w * (err[k] - err[k - 1]), fR = fl[k - 1] + w * (fl[k] - fl[k - 1]);
  const f3 = L.TD.edgeF3(L.VM.VIA_TR);
  t.ok(Math.abs(eR) <= 0.045 && fR >= 1.15 * f3, () => `RETURN_NEAR_MM ${R}: the model's Z ${(100 * eR).toFixed(1)} % off FDTD, within |ΔS| 0.1 to ${(fR / 1e9).toFixed(1)} GHz (f3 ${(f3 / 1e9).toFixed(1)})`);
  t.ok(err.every((e, i) => sw[i].ret <= R || Math.abs(e) > 0.045 || fl[i] < 1.15 * f3), 'RETURN_NEAR_MM: beyond it every sweep point is out of the model\'s range');
  t.note(`sweep (antipad 0.8): ${sw.map((x, i) => `${x.ret.toFixed(1)} mm ${(100 * err[i]).toFixed(1)} % ${(fl[i] / 1e9).toFixed(1)} GHz`).join(', ')}`);
}
