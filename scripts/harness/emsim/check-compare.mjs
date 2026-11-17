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
  t.ok(o.format === 'emsim-fullwave-verification' && o.version === 2 && o.step === 'M6.5', 'compare.json: format, version, step');
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
      const md = L.modelAtPlanes(S.st, S.vias[v.id], f, feeds, S.trace);
      const r10 = L.sDiff(f, md.S, O.S, refl, 0, 10e9);
      t.ok(Math.abs(r10 - v.dS.model.refl10) < 1e-4, () => `${v.id}: the model's |ΔS11| to 10 GHz ${r10.toFixed(4)} as stored (${v.dS.model.refl10})`);
    } else t.ok(v.flags.includes('no-return'), `${v.id}: the model refuses (${v.flags})`);
  }
  // The corrected via model (step M6.5: the feeds' runs over the antipads, the band from the plane cavity) against
  // openEMS and FDTD, held to the frozen FDTD ↔ openEMS limits where it reaches them; the rest is the stated gap.
  const by = Object.fromEntries(o.vias.map((v) => [v.id, v]));
  const c44 = by['via-c44'], c45 = by['via-c45'];
  const rel = (a, b) => a / b - 1;
  t.ok(Math.abs(rel(c44.section.model.z, c44.section.openems.z)) <= LIMITS.sectionZ && Math.abs(rel(c44.section.model.delay, c44.section.openems.delay)) <= LIMITS.sectionDelay,
    () => `C44 model section ${c44.section.model.z.toFixed(1)} Ω ${(c44.section.model.delay * 1e12).toFixed(1)} ps against openEMS ${c44.section.openems.z.toFixed(1)} Ω ${(c44.section.openems.delay * 1e12).toFixed(1)} ps (limit ${LIMITS.sectionZ * 100} %)`);
  t.ok(c44.tdrDiff.model <= LIMITS.tdr, () => `C44 model TDR |Δz| over 0–100 ps ${c44.tdrDiff.model.toFixed(2)} Ω against openEMS (limit ${LIMITS.tdr})`);
  t.ok(Math.abs(rel(c44.section.model.z, c44.section.fdtd.z)) <= LIMITS.sectionZ, () => `C44 model section Z ${c44.section.model.z.toFixed(1)} against FDTD ${c44.section.fdtd.z.toFixed(1)} Ω`);
  for (const v of [c44, c45]) {
    t.ok(Math.abs(v.tdr.model.zMax - v.tdr.openems.zMax) <= LIMITS.tdr, () => `${v.id}: model TDR peak ${v.tdr.model.zMax.toFixed(2)} Ω against openEMS ${v.tdr.openems.zMax.toFixed(2)}, FDTD ${v.tdr.fdtd.zMax.toFixed(2)} (limit ${LIMITS.tdr} Ω)`);
    t.ok(v.dS.model.refl10 <= LIMITS.s10 && v.dS.model.trans10 <= LIMITS.s10, () => `${v.id}: model |ΔS| to 10 GHz ${v.dS.model.refl10.toFixed(3)}, ${v.dS.model.trans10.toFixed(3)} (limit ${LIMITS.s10})`);
    t.ok(v.dS.model.fLeave > 2 * v.dS.modelM64.fLeave || v.dS.model.fLeave >= 20e9, () => `${v.id}: the model leaves openEMS at ${v.dS.model.fLeave / 1e9} GHz, M6.4c's at ${v.dS.modelM64.fLeave / 1e9}`);
  }
  t.ok(c45.dS.model.refl20 <= LIMITS.s20 && c45.dS.model.trans20 <= LIMITS.s20, () => `C45 model |ΔSdd| to 20 GHz ${c45.dS.model.refl20.toFixed(3)} ${c45.dS.model.trans20.toFixed(3)}`);
  for (const id of ['via-c44-stub', 'via-c44-bd']) { // the exit stripline on L3 also runs under L2's opening, not modelled (no trace for it: BL168)
    const v = by[id];
    t.ok(v.tdrDiff.model < v.tdrDiff.modelM64, () => `${id}: model TDR |Δz| ${v.tdrDiff.model.toFixed(2)} Ω (M6.4c ${v.tdrDiff.modelM64.toFixed(2)}), |ΔS21| to 10 GHz ${v.dS.model.trans10.toFixed(3)}`);
  }
  t.ok(Math.abs(by['via-c44-stub'].notch.model.f / by['via-c44-stub'].notch.openems.f - 1) <= LIMITS.notch, 'stub: the model notch within the notch limit of openEMS');
  // The band: with the run over the antipad short (antipad 0.8), where the model leaves FDTD by 0.1 follows the plane
  // cavity's band within 25 % at every return distance.
  for (const x of o.sweeps.filter((y) => Math.abs(y.ap - 0.8) < 1e-9)) {
    t.ok(Math.abs(x.valid.cavity / x.fLeave.model - 1) <= 0.25 && x.valid.fMax === Math.min(x.valid.cavity, x.valid.lumped), () => `sweep ap 0.8 ret ${x.ret}: cavity band ${(x.valid.cavity / 1e9).toFixed(1)} GHz, the model leaves FDTD at ${(x.fLeave.model / 1e9).toFixed(1)} GHz`);
  }
  t.ok(c44.valid.fMax === c44.valid.cavity && c44.valid.cavity < 0.8 * c44.valid.lumped, () => `C44: band ${(c44.valid.fMax / 1e9).toFixed(1)} GHz from the cavity (lumped parts ${(c44.valid.lumped / 1e9).toFixed(1)})`);
  t.note(`model (M6.5) against openEMS: C44 section ${c44.section.model.z.toFixed(1)} / ${c44.section.openems.z.toFixed(1)} Ω, TDR peak ${c44.tdr.model.zMax.toFixed(1)} / ${c44.tdr.openems.zMax.toFixed(1)} Ω, leaves at ${c44.dS.model.fLeave / 1e9} GHz (M6.4c ${c44.dS.modelM64.fLeave / 1e9}); C45 Sdd TDR ${c45.tdr.model.zMin.toFixed(1)}–${c45.tdr.model.zMax.toFixed(1)} / ${c45.tdr.openems.zMin.toFixed(1)}–${c45.tdr.openems.zMax.toFixed(1)} Ω`);
  // the FDTD within the frozen limits
  const ver = L.verdicts(o, LIMITS);
  for (const x of ver) t.ok(x.ok, () => `${x.what}: ${x.value.toFixed(4)} (limit ${x.bar})`);
  t.note(`${ver.length} limits held; worst share of its limit: ${Math.max(...ver.map((x) => Math.abs(x.value) / x.bar)).toFixed(2)}`);
  // RETURN_NEAR_MM from the sweep (antipad 0.8, the feed over the antipad nearly out)
  const sw = o.sweeps.filter((x) => Math.abs(x.ap - 0.8) < 1e-9).sort((a, b) => a.ret - b.ret);
  // M6.4c's model (no run over the antipad), whose error here is the return path's alone: M6.5's run over the 0.1 mm of
  // antipad (an upper bound, BL168) adds about +7 % to every point of this sweep.
  const err = sw.map((x) => x.section.modelM64.z / x.section.fdtd.z - 1), fl = sw.map((x) => x.fLeave.modelM64);
  const R = L.VM.RETURN_NEAR_MM, k = sw.findIndex((x) => x.ret > R);
  const w = (R - sw[k - 1].ret) / (sw[k].ret - sw[k - 1].ret);
  const eR = err[k - 1] + w * (err[k] - err[k - 1]), fR = fl[k - 1] + w * (fl[k] - fl[k - 1]);
  const f3 = L.TD.edgeF3(L.VM.VIA_TR);
  t.ok(Math.abs(eR) <= 0.045 && fR >= 1.15 * f3, () => `RETURN_NEAR_MM ${R}: the model's Z ${(100 * eR).toFixed(1)} % off FDTD, within |ΔS| 0.1 to ${(fR / 1e9).toFixed(1)} GHz (f3 ${(f3 / 1e9).toFixed(1)})`);
  t.ok(err.every((e, i) => sw[i].ret <= R || Math.abs(e) > 0.045 || fl[i] < 1.15 * f3), 'RETURN_NEAR_MM: beyond it every sweep point is out of the model\'s range');
  t.note(`sweep (antipad 0.8): ${sw.map((x, i) => `${x.ret.toFixed(1)} mm ${(100 * err[i]).toFixed(1)} % ${(fl[i] / 1e9).toFixed(1)} GHz`).join(', ')}`);
}
