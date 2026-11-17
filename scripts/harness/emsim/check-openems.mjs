// Checks of the committed openEMS fixtures (steps M0.4b and M6.4a, docs/em-sim/fullwave.md §14, notes-M6.4a.md).
// Reads openems/fixtures/*.json only; openEMS is never run here (it lives on the owner's PC, `npm run openems`).
// Per fixture: the format (§14.2), its provenance (script, commit, date, run time, threads; M6.4a: the scripts'
// SHA-256, compared with the scripts as they are now, a note when they differ), the mesh's cell count, the size
// (< 200 kB), finite S-parameters and TDR, passivity recomputed from the stored S (σmax ≤ 1.01 from 0.1 to 40 GHz:
// the closed forms of each fixture's symmetry pattern), reciprocity of the full 2-ports, and the sanity numbers the
// script stored against the bars in BAR (feeds' Z within 4 % and εeff within 3 % of the 2D solver, notes-M6.4a.md; the pair's Zdiff and Zcm, the
// probes' tail ≤ 10⁻³, the symmetry misfit of the pair's two runs). The 2D solver's numbers the fixtures quote are
// recomputed here with lines.ts on the default setup.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import * as Su0 from '../../../lib/emsim/setup.ts';
import * as St0 from '../../../lib/emsim/structure.ts';
import * as Li0 from '../../../lib/emsim/lines.ts';

const d = (m) => m.default ?? m;
const Su = d(Su0), St = d(St0), Li = d(Li0);
const DIR = new URL('./openems/fixtures/', import.meta.url);
const SCRIPTS = new URL('./openems/', import.meta.url);
const M64A = ['via-c44', 'via-c44-coarse', 'via-c44-noret', 'via-c44-stub', 'via-c44-bd', 'via-c45', 'msl-c41'];
// the bars are the check's own (a fixture's sanity.bars records what its script used)
const PASSIVE = 1.01;
// recip: the stub cases' |S12 − S21| grows with f to 0.018 near 22 GHz (the L3 stripline's port reads V to L2 only while
// L2 and L5 are joined only by the via's returns: a parallel-plate mode; notes-M6.4a.md)
const BAR = { tail: 1e-3, recip: 0.025, sym: 0.02, feedZ: 0.04, feedEeff: 0.03, pairZ: 0.03 };

const fin = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => x === null || Number.isFinite(x));
const cx = (s, k) => [s.re[k], s.im[k]];
const add = (a, b, sb = 1) => [a[0] + sb * b[0], a[1] + sb * b[1]];
const abs = (a) => Math.hypot(a[0], a[1]);

/** Largest singular value per stored frequency, from the fixture's symmetry pattern (null where a value is missing). */
function sigmaMax(sp) {
  const n = sp.f_Hz.length;
  const out = [];
  const pat = JSON.stringify(sp.pattern);
  for (let k = 0; k < n; k++) {
    const g = (name) => (sp[name] && sp[name].re[k] !== null && sp[name].im[k] !== null ? cx(sp[name], k) : null);
    if (pat === JSON.stringify([[0, 1], [1, 0]])) {
      const a = g('s11'), b = g('s21');
      out.push(a && b ? Math.max(abs(add(a, b)), abs(add(a, b, -1))) : null); // [[a, b], [b, a]]: |a ± b|
    } else if (pat === JSON.stringify([[0, 1], [2, 3]])) {
      const a = g('s11'), b = g('s12'), c = g('s21'), e = g('s22');
      if (!(a && b && c && e)) { out.push(null); continue; }
      // SᴴS = [[p, q], [q*, r]]: λmax = (p + r)/2 + sqrt(((p − r)/2)² + |q|²)
      const p = abs(a) ** 2 + abs(c) ** 2, r = abs(b) ** 2 + abs(e) ** 2;
      const q = [a[0] * b[0] + a[1] * b[1] + c[0] * e[0] + c[1] * e[1], a[0] * b[1] - a[1] * b[0] + c[0] * e[1] - c[1] * e[0]];
      out.push(Math.sqrt((p + r) / 2 + Math.sqrt(((p - r) / 2) ** 2 + abs(q) ** 2)));
    } else {
      // S_ij = p[i xor j] (Klein group): normal, eigenvalues a ± b ± c ± d with the group's characters
      const a = g('s11'), b = g('s21'), c = g('s31'), e = g('s41');
      if (!(a && b && c && e)) { out.push(null); continue; }
      const l = [[1, 1, 1], [-1, 1, -1], [1, -1, -1], [-1, -1, 1]].map(([x, y, z]) => abs(add(add(add(a, b, x), c, y), e, z)));
      out.push(Math.max(...l));
    }
  }
  return out;
}

function line2d() {
  const s = Su.defaultSetup();
  const r1 = Li.solveSetup(s);
  const r3 = Li.solveSetup({ ...s, trace: { ...s.trace, kind: 'stripline', layer: 'L3', above: 'L2', below: 'L5', signals: [], grounds: [] } });
  const p = St.presetStructure('pair-microstrip', s.stackup, 0.11);
  p.s = { ...p.s, v: 0.2 };
  const rp = Li.solveSetup({ ...s, trace: p });
  return {
    L1: [r1.lines[0].z0.v, r1.lines[0].eeff.v], L6: [r1.lines[0].z0.v, r1.lines[0].eeff.v],
    L3: [r3.lines[0].z0.v, r3.lines[0].eeff.v], zdiff: rp.pair.zdiff.v, zcm: rp.pair.zcm.v,
  };
}

const sha = (name) => createHash('sha256').update(readFileSync(new URL(name, SCRIPTS), 'utf8').replace(/\r\n/g, '\n')).digest('hex');

export function run(t) {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  const ids = files.map((f) => f.slice(0, -5));
  for (const id of M64A) t.ok(ids.includes(id), `fixture ${id}.json is there`);
  const ref = line2d();
  const rows = [];
  for (const file of files) {
    const id = file.slice(0, -5);
    const url = new URL(file, DIR);
    const size = statSync(url).size;
    const fx = JSON.parse(readFileSync(url, 'utf8'));
    const w = (s) => `${id}: ${s}`;
    t.ok(size < 200 * 1024, () => w(`size ${(size / 1024).toFixed(1)} kB (bar 200)`));
    t.ok(fx.format === 'emsim-openems-fixture' && fx.formatVersion === 1 && (fx.id === id || (!M64A.includes(id) && fx.id === id.replace(/-coarse$/, ''))), w('format, version and id'));
    t.ok(typeof fx.description === 'string' && typeof fx.case === 'string' && ['via', 'trace'].includes(fx.structure?.kind), w('description, case, structure kind'));
    t.ok(/^0\.37\./.test(fx.openems?.version ?? ''), w(`openEMS version ${fx.openems?.version}`));
    const c = fx.mesh?.cells ?? {};
    t.ok(c.total === c.x * c.y * c.z && c.total > 1e5, w(`mesh cells ${c.total}`));
    t.ok(fx.mesh?.timestep_s > 0 && fx.run?.steps > 0 && fx.run?.maxTime_s > 0, w('time step, steps, end time'));
    const pv = fx.provenance ?? {};
    t.ok(typeof pv.script === 'string' && /^[0-9a-f]{7,}$/.test(pv.gitCommit ?? '') && /^\d{4}-\d\d-\d\d$/.test(pv.date ?? '') && pv.runTime_s > 0 && pv.threads > 0, w('provenance: script, commit, date, run time, threads'));
    const sp = fx.results?.sParameters;
    const n = sp?.f_Hz?.length ?? 0;
    t.ok(n >= 400 && sp.f_Hz[n - 1] === 40e9 && sp.zRef_ohm === 50, w('S-parameters 0–40 GHz at 50 Ω'));
    const names = Object.keys(sp ?? {}).filter((k) => /^s\d\d$/.test(k));
    t.ok(names.length >= 2 && names.every((k) => fin(sp[k].re) && fin(sp[k].im) && sp[k].re.length === n), w(`S lists ${names.join(', ')} finite, ${n} points`));
    const tdr = fx.results?.tdr;
    t.ok(tdr && fin(tdr.t_s) && fin(tdr.z_ohm) && tdr.t_s.length === tdr.z_ohm.length && tdr.riseTime_s === 35e-12, w('TDR finite at 35 ps'));
    if (!M64A.includes(id)) continue; // M0.4b's fixtures: the format only (their sanity is fullwave.md §14.5)
    t.ok(Array.isArray(sp.pattern) && Array.isArray(sp.ports) && sp.ports.length === sp.pattern.length, w('S symmetry pattern and port names'));
    const hs = pv.scriptSha256 ?? {};
    const script = pv.script.split('/').pop();
    t.ok(/^[0-9a-f]{64}$/.test(hs[script] ?? '') && /^[0-9a-f]{64}$/.test(hs['common.py'] ?? ''), w('provenance: SHA-256 of the script and common.py'));
    if (hs[script] !== sha(script) || hs['common.py'] !== sha('common.py')) t.note(w(`made by an earlier version of ${script} or common.py (hash differs); re-make it with npm run openems ${id.replace(/-coarse$/, '')}${id.endsWith('-coarse') ? ' --coarse' : ''}`));
    // passivity from the stored S
    const sv = sigmaMax(sp);
    let smax = 0;
    sp.f_Hz.forEach((f, k) => { if (f >= 0.1e9 && sv[k] !== null) smax = Math.max(smax, sv[k]); });
    t.ok(smax > 0.5 && smax <= PASSIVE, () => w(`passivity: σmax ${smax.toFixed(5)} (bar ${PASSIVE})`));
    const sn = fx.sanity;
    t.ok(sn.probeTailMax <= BAR.tail, () => w(`probe tail ${sn.probeTailMax.toExponential(2)} (bar ${BAR.tail})`));
    t.ok(Math.abs(sn.passivityMax - smax) <= 2e-3, () => w(`stored passivity ${sn.passivityMax} against ${smax.toFixed(5)} from the stored S (every second point)`));
    if (sp.s12) {
      let rec = 0;
      sp.f_Hz.forEach((f, k) => { if (f >= 0.1e9) rec = Math.max(rec, abs(add(cx(sp.s12, k), cx(sp.s21, k), -1))); });
      t.ok(rec <= BAR.recip, () => w(`reciprocity |S12 − S21| ${rec.toExponential(2)} (bar ${BAR.recip})`));
    }
    if (fx.structure.kind === 'via') {
      t.ok(sn.symmetryResidualMax <= BAR.sym, () => w(`symmetry misfit ${sn.symmetryResidualMax} (bar ${BAR.sym})`));
      for (const fd of sn.feedsVs2D) {
        const r = ref[fd.layer];
        t.near(fd.z2d_ohm, r[0], w(`2D solver's Z of the ${fd.layer} feed as quoted`), 1e-5);
        t.near(fd.eeff2d, r[1], w(`2D solver's εeff of the ${fd.layer} feed as quoted`), 1e-5);
        t.ok(Math.abs(fd.dz) <= BAR.feedZ && Math.abs(fd.deeff) <= BAR.feedEeff, () => w(`feed ${fd.port} (${fd.layer}) against the 2D solver: Z ${(100 * fd.dz).toFixed(2)} %, εeff ${(100 * fd.deeff).toFixed(2)} % (bars ${100 * BAR.feedZ} %, ${100 * BAR.feedEeff} %)`));
      }
      t.ok(Number.isFinite(tdr.viaWindow?.zMin_ohm) && Number.isFinite(tdr.viaWindow?.zMax_ohm), w('TDR via window'));
      const r = fx.results;
      const sum = r.viaDeembedded ? `Z ${r.viaDeembedded.z_ohm} Ω, ${(r.viaDeembedded.delay_s * 1e12).toFixed(2)} ps` : r.stub ? `S21 ${r.stub.s21At10GHz_dB} dB at 10 GHz, dip ${r.stub.s21MinInBand_dB} dB at ${(r.stub.fS21Min_Hz / 1e9).toFixed(2)} GHz` : `Sdd21 ${r.mixedMode.sdd21At10GHz_dB} dB at 10 GHz`;
      rows.push(`${id}: ${c.total} cells, ${fx.run.runs} run(s), ${pv.runTime_s} s; feeds ${sn.feedsVs2D.map((x) => `${(100 * x.dz).toFixed(1)}/${(100 * x.deeff).toFixed(1)} %`).join(', ')}; σmax ${smax.toFixed(4)}; ${sum}`);
    } else {
      t.near(sn.zdiff2D_ohm, ref.zdiff, w("2D solver's Zdiff as quoted"), 1e-5);
      t.near(sn.zcm2D_ohm, ref.zcm, w("2D solver's Zcm as quoted"), 1e-5);
      const L = fx.results.line;
      t.ok(Math.abs(L.zdiff_ohm / ref.zdiff - 1) <= BAR.pairZ && Math.abs(L.zcm_ohm / ref.zcm - 1) <= BAR.pairZ, () => w(`Zdiff ${L.zdiff_ohm} against ${ref.zdiff.toFixed(3)}, Zcm ${L.zcm_ohm} against ${ref.zcm.toFixed(3)} (bar ${100 * BAR.pairZ} %)`));
      t.ok(Math.abs(L.eeffOdd / L.eeffOddFromSdd21 - 1) <= 0.01 && Math.abs(L.eeffEven / L.eeffEvenFromScc21 - 1) <= 0.01, w('modal εeff from the probe planes and from the S21 phase within 1 %'));
      rows.push(`${id}: ${c.total} cells, ${pv.runTime_s} s; Zdiff ${L.zdiff_ohm} (${(100 * (L.zdiff_ohm / ref.zdiff - 1)).toFixed(2)} %), Zcm ${L.zcm_ohm} (${(100 * (L.zcm_ohm / ref.zcm - 1)).toFixed(2)} %), εeff odd ${L.eeffOdd} even ${L.eeffEven}; σmax ${smax.toFixed(4)}`);
    }
  }
  for (const r of rows) t.note(r);
}
