// The via model (M1.7): the N-port conversions, TDR of uniform lines (single and mixed-mode), passivity and
// reciprocity of the cascades, stub resonance, every validity flag on a constructed case and none on good vias, the
// wall choice (the cascade's total C equals the axisymmetric total), the low-frequency L and C, the target, the worker
// jobs, the budget, and the first comparison with openEMS's via fixture (reported, not a pass bar: M6.4 sets it).

import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import * as VM0 from '../../../lib/emsim/viamodel.ts';
import * as NP0 from '../../../lib/emsim/nport.ts';
import * as TD0 from '../../../lib/emsim/tdr.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as ST0 from '../../../lib/emsim/stackup.ts';
import * as SR0 from '../../../lib/emsim/structure.ts';
import * as AX0 from '../../../lib/emsim/axisym.ts';
import * as J0 from '../../../lib/emsim/jobs.ts';
import * as LN0 from '../../../lib/emsim/lines.ts';
import * as BM0 from '../../../lib/emsim/bem2d.ts';
import * as PN0 from '../../../lib/emsim/panels.ts';

const d = (m) => m.default ?? m;
const VM = d(VM0), NP = d(NP0), TD = d(TD0), SU = d(SU0), V = d(V0), ST = d(ST0), SR = d(SR0), AX = d(AX0), J = d(J0), LN = d(LN0), BM = d(BM0), PN = d(PN0);
const C = 299792458;
const fx = (x, n = 2) => x.toExponential(n);
const pick = (S, nf, P, i, j) => { const o = new Float64Array(2 * nf); for (let k = 0; k < nf; k++) { const q = 2 * ((k * P + i) * P + j); o[2 * k] = S[q]; o[2 * k + 1] = S[q + 1]; } return o; };
const time = (f, n = 5) => { let best = Infinity; for (let i = 0; i < n; i++) { const t0 = performance.now(); f(); best = Math.min(best, performance.now() - t0); } return best; };
const flagsOf = (r) => r.flags.map((x) => x.code);

// The openEMS fixture's via (fullwave.md §14.4) as a setup: its stackup (no mask, εr 4.3), 50R_SE feeds 3 mm long.
function fixtureSetup(fix) {
  const L = fix.structure.stackup;
  const layers = L.map((l, k) => l.kind === 'copper'
    ? { kind: 'copper', id: l.id, name: l.id, t: ST.val(l.z1 - l.z0), base: null, plating: null, calc: null, etch: { kind: 'none' }, fill: null }
    : { kind: 'dielectric', id: `d${k}`, name: l.id, role: l.id === 'core' ? 'core' : 'prepreg', material: 'FR4', t: ST.val(l.z1 - l.z0), er: ST.val(l.er), tand: null, freq: null });
  const stackup = { id: '', name: 'openEMS via fixture', layers, finish: '', controlled: false, thickness: null };
  const trace = SR.presetStructure('microstrip', stackup, 0.1377);
  trace.masked = false;
  const vs = fix.structure.via, planes = Object.keys(vs.antipads);
  const via = {
    start: vs.from, end: vs.to, entry: vs.from, exit: vs.to, drill: ST.val(vs.drill), plating: ST.val(0.02), pitch: null,
    pads: Object.entries(vs.pads).map(([layer, dd]) => ({ layer, d: ST.val(dd) })), planes,
    antipads: planes.map((layer) => ({ layer, d: ST.val(vs.antipads[layer]), shape: 'round', bridge: null })), backdrill: null,
    returns: fix.structure.returnVias.map((r) => ({ x: ST.val(r.x), y: ST.val(r.y), drill: ST.val(r.drill), pad: ST.val(0.6), planes: r.joins })),
    feeds: fix.structure.feeds.map((f) => ({ layer: f.layer, length: ST.val(f.referencePlaneDistance), angle: f.to[0] < 0 ? 180 : 0 })),
  };
  return { stackup, trace, via };
}

export async function run(t) {
  const rows = [];
  // 1. N-port conversions against closed forms: a series Z, a shunt Y; the mixed mode of two uncoupled lines.
  {
    const z0 = 50, Zs = [12, -30], T = new Float64Array(8);
    T[0] = 1; T[6] = 1; T[2] = Zs[0]; T[3] = Zs[1];
    const S = new Float64Array(8);
    NP.abcdToS(T, 1, z0, S);
    const den = [Zs[0] + 2 * z0, Zs[1]], dd = den[0] ** 2 + den[1] ** 2;
    const s11 = [(Zs[0] * den[0] + Zs[1] * den[1]) / dd, (Zs[1] * den[0] - Zs[0] * den[1]) / dd];
    t.ok(Math.hypot(S[0] - s11[0], S[1] - s11[1]) < 1e-15 && Math.hypot(S[4] - (1 - s11[0]), S[5] + s11[1]) < 1e-15, `series Z: S11 ${S[0]},${S[1]} vs ${s11}`);
    const els = [{ kind: 'shunt', name: 'C', C: [[1e-12]] }];
    const f = [5e9], w = 2 * Math.PI * f[0], y = w * 1e-12 * z0;
    const Sh = VM.cascadeS(els, 1, f, z0); // S11 = −jy/(2 + jy)
    const e11 = [-(y * y) / (4 + y * y), (-2 * y) / (4 + y * y)];
    t.ok(Math.hypot(Sh[0] - e11[0], Sh[1] - e11[1]) < 1e-15, `shunt C: S11 ${Sh[0]},${Sh[1]} vs ${e11}`);
    const line = { kind: 'line', name: 'l', len: 0.01, spec: VM.homogeneousLine([[1 / (C * 60)]], 3) };
    const two = { kind: 'line', name: 'l2', len: 0.01, spec: VM.homogeneousLine([[1 / (C * 60), 0], [0, 1 / (C * 60)]], 3) };
    const S1 = VM.cascadeS([line], 1, f, z0), S4 = NP.mixedS(VM.cascadeS([two], 2, f, z0), 4, 1, [[0, 1], [2, 3]]);
    const dd21 = pick(S4, 1, 4, 1, 0), dd11 = pick(S4, 1, 4, 0, 0), dc21 = pick(S4, 1, 4, 3, 0);
    // Uncoupled 60 Ω lines: Sdd at 100 Ω equals S of one line at 50 Ω; no conversion.
    t.ok(Math.hypot(dd21[0] - S1[4], dd21[1] - S1[5]) < 1e-14 && Math.hypot(dd11[0] - S1[0], dd11[1] - S1[1]) < 1e-14 && Math.hypot(dc21[0], dc21[1]) < 1e-15, 'mixed mode of two uncoupled lines');
  }
  // 2. TDR of uniform lines: a 60 Ω line of 100 ps into 50 Ω reads 60 Ω on its plateau; a coupled pair (Zodd 45,
  // Zeven 60) reads Zdiff 90 and Zcm 30 in the mixed-mode TDR.
  {
    const els = [{ kind: 'line', name: 'u', len: C * 200e-12, spec: VM.homogeneousLine([[1 / (C * 60)]], 1) }];
    let worst = 0, errZ = 0;
    for (const tr of [35e-12, 15e-12, 60e-12]) {
      const r = TD.tdr((f) => { const S = VM.cascadeS(els, 1, f, 50); return { s11: pick(S, f.length, 2, 0, 0), s21: pick(S, f.length, 2, 1, 0) }; }, { tr, span: 200e-12 });
      for (const tt of [190e-12, 200e-12, 210e-12]) worst = Math.max(worst, Math.abs(TD.tdrAt(r, r.z, tt) - 60));
      const tdt = TD.tdrAt(r, r.tdt, 400e-12) / (2 * 60 / 110) / (2 * 50 / 110); // first transmitted step through both joints
      t.ok(Math.abs(tdt - 1) < 1e-6, `uniform line TDT step ${tdt}`);
      t.ok(Math.abs(TD.tdrAt(r, r.z, -2 * tr) - 50) < 1e-4, () => `TDR before the edge reads z0: ${TD.tdrAt(r, r.z, -2 * tr)}`);
      errZ = Math.max(errZ, r.err.z);
      if (tr === 35e-12) rows.push(`uniform 60 Ω line (200 ps) into 50 Ω: TDR plateau error ${fx(worst)} Ω (at 8σ or more from the edges) at tr 15–60 ps, stated accuracy ${fx(r.err.z)} Ω (truncation ${fx(r.err.truncation)}, settling ${fx(r.err.settle)} of ρ); ${r.method}; ${r.ms.toFixed(1)} ms`);
    }
    t.ok(worst <= errZ + 1e-9 && errZ < 1e-4, `uniform line TDR: ${worst} Ω vs stated ${errZ}`);
    const v = C, zo = 45, ze = 60, c = 0.5 * (1 / (zo * v) + 1 / (ze * v)), cm = 0.5 * (1 / (zo * v) - 1 / (ze * v));
    const pel = [{ kind: 'line', name: 'p', len: C * 200e-12, spec: VM.homogeneousLine([[c, -cm], [-cm, c]], 1) }];
    const mm = (f) => NP.mixedS(VM.cascadeS(pel, 2, f, 50), 4, f.length, [[0, 1], [2, 3]]);
    const rd = TD.tdr((f) => { const S = mm(f); return { s11: pick(S, f.length, 4, 0, 0), s21: null }; }, { tr: 35e-12, span: 200e-12, zRef: 100 });
    const rc = TD.tdr((f) => { const S = mm(f); return { s11: pick(S, f.length, 4, 2, 2), s21: null }; }, { tr: 35e-12, span: 200e-12, zRef: 25 });
    const ed = Math.abs(TD.tdrAt(rd, rd.z, 200e-12) - 90), ec = Math.abs(TD.tdrAt(rc, rc.z, 200e-12) - 30);
    t.ok(ed <= rd.err.z + 1e-9 && ec <= rc.err.z + 1e-9, `pair TDR: Zdiff error ${ed}, Zcm error ${ec}`);
    rows.push(`coupled pair Zodd 45 / Zeven 60: differential TDR reads 90 Ω (error ${fx(ed)}), common 30 Ω (error ${fx(ec)})`);
  }
  // 3. Stub resonance: an open stub of 1.3 mm in εr 4.3 on a through line: c0/(4ℓ√εr) = 27.8 GHz, S21 = 0 there.
  {
    const spec = VM.homogeneousLine([[Math.sqrt(4.3) / (C * 50)]], 4.3);
    const stub = [{ kind: 'line', name: 's', len: 1.3e-3, spec }];
    const fF = VM.stubFormula(1.3, 4.3), fR = VM.stubResonance(stub, 1, 2 * fF);
    t.near(fR, fF, 'stub resonance vs c0/(4ℓ√εr)', 1e-10);
    t.near(fF / 1e9, 27.8, 'facts-formulas.md §7 example 27.8 GHz', 2e-3);
    const S = VM.cascadeS([{ kind: 'line', name: 'a', len: 1e-3, spec }, { kind: 'stub', name: 'st', elements: stub }, { kind: 'line', name: 'b', len: 1e-3, spec }], 1, [fR], 50);
    t.ok(Math.hypot(S[4], S[5]) < 1e-6, `|S21| at the stub's resonance ${Math.hypot(S[4], S[5])}`);
    rows.push(`stub 1.3 mm in εr 4.3: ${(fR / 1e9).toFixed(4)} GHz (formula ${(fF / 1e9).toFixed(4)}), |S21| there ${fx(Math.hypot(S[4], S[5]))}`);
  }
  // 4. The vias: default (C44), the fixture via, the pair preset (C45 with its stadium antipad as round).
  const fix = JSON.parse(readFileSync(new URL('./openems/fixtures/via-th-0p3.json', import.meta.url), 'utf8'));
  const su = SU.defaultSetup(), st = su.stackup;
  const FX = fixtureSetup(fix);
  const pair = V.presetVia('pair', st);
  const c44 = VM.viaModel(st, su.via, su.trace);
  const good = VM.viaModel(FX.stackup, FX.via, FX.trace);
  const c45 = VM.viaModel(st, pair, null);
  for (const [name, r] of [['C44', c44], ['fixture via', good], ['C45 pair', c45]]) {
    if (!t.ok(r.ok, `${name}: ${r.reason}`)) continue;
    const nps = r.mixed ? [r.nport, r.mixed] : [r.nport];
    for (const np of nps) {
      const u = NP.unitarityError(np), rc = NP.reciprocityError(np), px = NP.passivityExcess(np);
      t.ok(u < 1e-12 && rc < 1e-12 && px < 1e-12, `${name} ${np.mixed ? 'mixed-mode' : 'single-ended'}: unitarity ${u}, reciprocity ${rc}, passivity ${px}`);
      rows.push(`${name} ${np.mixed ? 'mixed-mode' : 'single-ended'} ${np.ports}-port, ${np.f.length} f to ${(np.f[np.f.length - 1] / 1e9).toFixed(1)} GHz: |SᴴS − I| ${fx(u)}, |S − Sᵀ| ${fx(rc)}`);
    }
    // The wall: Σ line C′ℓ + Σ ΔC equals the axisymmetric total (one via).
    t.near(r.lumped.lineC + r.lumped.dCsum, r.axiTotal, `${name}: cascade's total C vs the axisymmetric total`, 1e-12);
  }
  // Low-frequency limit of the through section: C and B of the chain at 1 MHz are jωC and jωL of the lumped section.
  {
    const r = VM.buildVia(FX.stackup, FX.via, null, { feeds: 'none' });
    const f = 1e6, w = 2 * Math.PI * f, M = VM.chainAbcd(r.elements, f, 1);
    const eC = M[2 * 2 + 1] / w / r.lumped.C[0][0] - 1, eL = M[2 * 1 + 1] / w / r.lumped.L[0][0] - 1;
    t.ok(Math.abs(eC) < 1e-6 && Math.abs(eL) < 1e-6, `low-frequency C ${eC}, L ${eL}`);
  }
  // 5. The wall choice: C44 with the rule wall (R_w = antipad + 4h) referred to the cut's C′ instead.
  {
    const ax = AX.viaAxisym(st, su.via);
    const lnR = Math.log(ax.Rw / 0.15) / Math.log(c44.wall.Req / 0.15);
    const dRule = ax.crossings.map((c) => c.q - c.line * lnR);
    const dEq = c44.nodes.filter((n) => n.dC).map((n) => n.dC);
    const sumRule = dRule.reduce((a, b) => a + b, 0), sumEq = dEq.reduce((a, b) => a + b, 0);
    rows.push(`wall: C44 R_eq ${c44.wall.Req.toFixed(3)} mm, ΔC ${dEq.map((x) => (x * 1e15).toFixed(2)).join(' ')} fF (Σ ${(sumEq * 1e15).toFixed(1)}), total ${(c44.axiTotal * 1e15).toFixed(1)} fF = cascade; rule wall ${ax.Rw.toFixed(2)} mm referred to the cut's C′: ΔC ${dRule.map((x) => (x * 1e15).toFixed(2)).join(' ')} (Σ ${(sumRule * 1e15).toFixed(1)}), whose window charges assume a barrel line that ends on the planes, not the returns; uncorrected rule ΔC Σ ${(ax.crossings.reduce((a, c) => a + c.dC, 0) * 1e15).toFixed(1)} fF would count barrel charge twice`);
    t.ok(Math.abs(sumRule - sumEq) < 0.5 * sumEq, 'the two walls give ΔC of the same size once referred to the cut');
  }
  // 6. Flags: none on the good vias (fixture via, the pair preset) at 35 ps; each on its constructed case.
  const goodBare = VM.viaModel(FX.stackup, FX.via, null);
  t.ok(goodBare.flags.length === 0, `fixture via (no feeds) flags: ${flagsOf(goodBare)}`);
  t.ok(c45.flags.length === 0, `C45 pair flags at 35 ps: ${flagsOf(c45)}`);
  const cases = [
    ['feed-over-antipad', () => good],
    ['no-return', () => VM.viaModel(FX.stackup, { ...FX.via, returns: [] }, null)],
    ['return-far', () => VM.viaModel(FX.stackup, VM.withReturnDistance(FX.via, 3), null)],
    ['return-in-antipad', () => c44],
    ['pad-overlap', () => VM.viaModel(st, { ...pair, pitch: ST.val(0.45) }, null)],
    ['antipad-overlap', () => VM.viaModel(st, { ...pair, antipads: pair.antipads.map((a) => ({ ...a, shape: 'round', d: ST.val(1.0) })) }, null)],
    ['shared-antipad', () => VM.viaModel(st, pair, null, { tr: 10e-12 })],
    ['lumped-long', () => VM.viaModel(FX.stackup, FX.via, null, { tr: 10e-12 })],
    ['via-lumped', () => VM.viaModel(FX.stackup, FX.via, null, { tr: 10e-12 })],
    ['stub-resonance', () => VM.viaModel(st, { ...su.via, exit: 'L3', feeds: [] }, null)],
    ['wall-rule', () => VM.viaModel(FX.stackup, { ...FX.via, returns: Array.from({ length: 8 }, (_, k) => ({ x: ST.val(0.62 * Math.cos(k * Math.PI / 4)), y: ST.val(0.62 * Math.sin(k * Math.PI / 4)), drill: ST.val(0.2), pad: null, planes: FX.via.planes })) }, null)],
  ];
  const fired = [];
  for (const [code, mk] of cases) {
    const r = mk();
    const f = r.flags.find((x) => x.code === code);
    if (t.ok(!!f, `flag ${code} on its case: got ${flagsOf(r)} ${r.reason}`)) fired.push(`${code} [${f.numbers.map((x) => (Math.abs(x) > 1e6 ? (x / 1e9).toFixed(1) + 'G' : +x.toPrecision(4))).join(', ')}]`);
    if (code === 'stub-resonance' && r.ok) {
      const sb = r.stubs.find((s) => s.side === 'exit');
      rows.push(`stub L3 → L6 of the C44 via: ${sb.length.toFixed(3)} mm, ${(sb.fRes / 1e9).toFixed(2)} GHz with its pads' ΔC, ${(sb.fFormula / 1e9).toFixed(2)} GHz bare (c0/4ℓ√εr per layer); viaStubs ${V.viaStubs(st, { ...su.via, exit: 'L3' }).bottom.toFixed(3)} mm`);
      const bd = VM.viaModel(st, { ...su.via, exit: 'L3', feeds: [], backdrill: { side: 'bottom', depth: ST.val(1.0), d: ST.val(0.5) } }, null);
      t.ok(bd.ok && !bd.flags.some((x) => x.code === 'stub-resonance'), `backdrilled stub: no flag (${flagsOf(bd)}) ${bd.reason}`);
    }
  }
  rows.push(`flags fired: ${fired.join('; ')}`);
  // 7. Target: antipad for a target z, return distance for a target z, the pair's antipad for a target zdiff.
  {
    const ref = VM.buildVia(FX.stackup, VM.withAntipad(FX.via, 1.5), null, { feeds: 'none', estimate: false }).lumped.z;
    const t0 = performance.now();
    const ta = VM.viaTarget(FX.stackup, FX.via, null, 'z', ref, 'antipad', {});
    const ms = performance.now() - t0;
    t.ok(ta.reached && Math.abs(ta.x - 1.5) < 1e-5, `antipad target round trip: ${ta.x} (${ta.reason})`);
    const tr2 = VM.viaTarget(FX.stackup, FX.via, null, 'z', 60, 'returns', {});
    t.ok(tr2.reached && Math.abs(tr2.model.lumped.z - 60) < 1e-3, `return-distance target 60 Ω: ${tr2.x} ${tr2.value} ${tr2.reason}`);
    const tp = VM.viaTarget(st, pair, null, 'zdiff', 100, 'antipad', {});
    const out = VM.viaTarget(FX.stackup, FX.via, null, 'z', 500, 'antipad', {});
    t.ok(!out.reached && out.range, 'an unreachable target says so');
    rows.push(`target: fixture via antipad for its own z at Ø1.5 → Ø${ta.x.toFixed(6)} (${ta.solves} solves, ${ms.toFixed(0)} ms); 60 Ω by the returns at ${tr2.x.toFixed(4)} mm (${tr2.solves} solves); C45 pair Zdiff 100 Ω by the antipad: ${tp.reached ? `Ø${tp.x.toFixed(4)}` : tp.reason}`);
  }
  // 8. Worker jobs.
  {
    const drain = (job) => { const g = J.runJob(job); for (;;) { const s = g.next(); if (s.done) return s.value; } };
    const r = drain({ kind: 'via', setup: su });
    t.ok(r.ok && Math.abs(r.lumped.z - c44.lumped.z) < 1e-12 && structuredClone(r).nport.s.length === c44.nport.s.length, 'via job = viaModel, cloneable');
    const tg = drain({ kind: 'via-target', setup: { ...su, via: FX.via, stackup: FX.stackup, trace: FX.trace }, key: 'z', target: good.lumped.z, vary: 'antipad' });
    t.ok(tg.reached && Math.abs(tg.x - 1.8) < 1e-4, `via-target job: ${tg.value}`);
  }
  // 9. Budget: a whole via with the pads and feeds cached (S at 401 f, TDR), and uncached.
  {
    const tc = time(() => VM.viaModel(st, su.via, su.trace)), tp = time(() => VM.viaModel(st, pair, null));
    const tf = time(() => VM.viaModel(FX.stackup, FX.via, FX.trace));
    const unc = time(() => { AX.clearAxiCache(); VM.clearFeedCache(); VM.viaModel(st, su.via, su.trace); }, 3);
    const p = c44.parts;
    rows.push(`budget (best of 5): C44 with feeds ${tc.toFixed(1)} ms cached (cut ${p.cut.toFixed(1)}, cascade ${p.cascade.toFixed(1)}, TDR ${p.tdr.toFixed(1)}), ${unc.toFixed(1)} ms uncached (pads and feeds solved); fixture via ${tf.toFixed(1)} ms; C45 pair (4-port, mixed, two TDRs) ${tp.toFixed(1)} ms`);
    t.ok(tc <= 30 && tf <= 30 && tp <= 30, `budget: ${tc.toFixed(1)} ${tf.toFixed(1)} ${tp.toFixed(1)} ms`);
  }
  // 10. The openEMS comparison (fullwave.md §14.4–14.5), reported.
  {
    const sp = fix.results.sParameters, fz = Float64Array.from(sp.f_Hz);
    const m = VM.viaModel(FX.stackup, FX.via, FX.trace, { f: fz, tdrOpt: { t0: fix.results.tdr.t_s[0], t1: fix.results.tdr.t_s[fix.results.tdr.t_s.length - 1], dt: 2e-12 } });
    const db = (re, im) => 20 * Math.log10(Math.hypot(re, im));
    const cols = [];
    for (const fg of [1, 5, 10, 20, 30, 40]) {
      const k = sp.f_Hz.findIndex((x) => Math.abs(x - fg * 1e9) < 1);
      if (k < 0) continue;
      const [a, b] = NP.sEntry(m.nport, k, 0, 0), [c, e] = NP.sEntry(m.nport, k, 1, 0);
      const o11 = { re: sp.s11.re[k], im: sp.s11.im[k] }, o21 = { re: sp.s21.re[k], im: sp.s21.im[k] };
      const ph = (x, y) => (Math.atan2(y, x) * 180) / Math.PI;
      cols.push(`${fg} GHz S11 ${db(a, b).toFixed(1)}/${db(o11.re, o11.im).toFixed(1)} dB, S21 ${db(c, e).toFixed(2)}/${db(o21.re, o21.im).toFixed(2)} dB ∠${ph(c, e).toFixed(0)}/${ph(o21.re, o21.im).toFixed(0)}°`);
    }
    const tz = fix.results.tdr, W = tz.viaWindow;
    const ex = TD.tdrExtremes(m.tdr, 20e-12, 60e-12);
    let dz = 0;
    for (let i = 0; i < tz.t_s.length; i++) if (tz.t_s[i] >= 0 && tz.t_s[i] <= 80e-12) dz = Math.max(dz, Math.abs(TD.tdrAt(m.tdr, m.tdr.z, tz.t_s[i]) - tz.z_ohm[i]));
    const de = fix.results.viaDeembedded, L = m.lumped;
    rows.push(`openEMS via-th-0p3 vs model (model/openEMS): feeds ${m.feeds[0].z0.toFixed(2)}/53.94 Ω εeff ${m.feeds[0].eeff.toFixed(3)}/3.007; via section √(L/C) ${L.z.toFixed(1)}/${de.z_ohm.toFixed(1)} Ω, delay ${(L.delay * 1e12).toFixed(2)}/${(de.delay_s * 1e12).toFixed(2)} ps, L ${(L.L[0][0] * 1e9).toFixed(3)}/${de.L_nH.toFixed(3)} nH, C ${(L.C[0][0] * 1e12).toFixed(3)}/${de.C_pF.toFixed(3)} pF; barrel ${(m.barrel.zVac / Math.sqrt(4.3)).toFixed(1)} Ω (thin-wire 65.1); TDR 35 ps peak ${ex.zMax.toFixed(1)} Ω at ${(ex.tMax * 1e12).toFixed(0)} ps / ${W.zMax_ohm.toFixed(1)} Ω at ${(W.tMax_s * 1e12).toFixed(0)} ps, feed plateau ${TD.tdrAt(m.tdr, m.tdr.z, 5e-12).toFixed(2)}/${W.zMin_ohm.toFixed(2)} Ω, largest |ΔZ| 0–80 ps ${dz.toFixed(1)} Ω`);
    rows.push(`openEMS S: ${cols.join('; ')}`);
    // Explanation, not the model: the feed's part over the In1/In4 antipad (pad edge 0.3 to 0.9 mm) as a microstrip
    // over the far outer plane instead of over In1/In4.
    const hole = VM.feedLine(FX.stackup, { ...FX.trace, below: 'B.Cu' }, 1, FX.via);
    if (hole.ok) {
      const els = m.elements.slice();
      const fe = els[0], fo = els[els.length - 1];
      const part = (e, len) => ({ ...e, len, pre: undefined });
      const h = { kind: 'line', name: 'over the antipad', len: 0.6e-3, spec: hole.spec };
      const alt = [part(fe, fe.len - 0.6e-3), h, ...els.slice(1, -1), { ...h }, part(fo, fo.len - 0.6e-3)];
      const S = VM.cascadeS(alt, 1, fz, 50);
      const at = (fg) => { const k = sp.f_Hz.findIndex((x) => Math.abs(x - fg * 1e9) < 1); return db(S[8 * k], S[8 * k + 1]).toFixed(1); };
      const r2 = TD.tdr((ff) => { const Q = VM.cascadeS(alt, 1, ff, 50); return { s11: pick(Q, ff.length, 2, 0, 0), s21: null }; }, { tr: 35e-12, span: m.span });
      const e2 = TD.tdrExtremes(r2, 20e-12, 60e-12);
      rows.push(`openEMS explanation: with 0.6 mm of each feed over the antipad as a ${hole.z0.toFixed(0)} Ω line (microstrip over B.Cu): S11 ${at(5)}/${at(10)}/${at(20)} dB at 5/10/20 GHz, TDR peak ${e2.zMax.toFixed(1)} Ω at ${(e2.tMax * 1e12).toFixed(0)} ps`);
    } else rows.push(`openEMS explanation: the line over the antipad could not be solved: ${hole.reason}`);
    t.ok(m.ok && isFinite(dz), 'openEMS comparison computed');
  }
  // 11. C44 and C45 for facts-cases.md.
  {
    const e = VM.viaModel(st, su.via, null), pz = c45;
    const core = (r) => r.pieces.find((p) => p.part === 'through' && p.zTop - p.zBot > 0.5) ?? r.pieces[0];
    const ex = TD.tdrExtremes(e.tdr, 0, 2 * e.span + 6 * e.tr);
    rows.push(`C44: barrel ${core(e).z0.toFixed(2)} ± ${(e.barrel.zVacErr / Math.sqrt(core(e).er)).toFixed(2)} Ω in εr ${core(e).er}; section √(L/C) ${e.lumped.z.toFixed(2)} Ω, ${(e.lumped.delay * 1e12).toFixed(2)} ps, C ${(e.lumped.C[0][0] * 1e15).toFixed(1)} fF (ΣΔC ${(e.lumped.dCsum * 1e15).toFixed(1)}), L ${(e.lumped.L[0][0] * 1e9).toFixed(3)} nH; TDR 35 ps with 50 Ω ports at the pads: ${ex.zMin.toFixed(2)}–${ex.zMax.toFixed(2)} Ω; with the 2 mm feeds (${c44.feeds[0].z0.toFixed(2)} Ω) the TDR stays within ${TD.tdrExtremes(c44.tdr, 0, 2 * c44.span + 6 * c44.tr).zMin.toFixed(2)}–${TD.tdrExtremes(c44.tdr, 0, 2 * c44.span + 6 * c44.tr).zMax.toFixed(2)} Ω`);
    const exd = TD.tdrExtremes(pz.tdr, 0, 2 * pz.span + 6 * pz.tr);
    rows.push(`C45 (stadium as round Ø1.22): barrel Zdiff ${core(pz).zdiff.toFixed(2)} Ω, Zcm ${core(pz).zcm.toFixed(2)} Ω in εr ${core(pz).er}; section Zdiff ${pz.lumped.zdiff.toFixed(2)} Ω, Zcm ${pz.lumped.zcm.toFixed(2)} Ω, ${(pz.lumped.delay * 1e12).toFixed(2)} ps; ΔC per via ${(pz.lumped.dCsum * 1e15).toFixed(1)} fF; differential TDR 35 ps (100 Ω ports) ${exd.zMin.toFixed(2)}–${exd.zMax.toFixed(2)} Ω`);
  }
  // 12. BL197 (fix after M9.2): the feeds' shortcuts give the numbers of solving each feed on its own.
  {
    // The vacuum problem alone: bit for bit the full solve's finest C0 and L (the line over the next plane's L′).
    let n = 0, same = 0;
    const ids = ST.copperIds(st);
    for (const kind of ['microstrip', 'cpwg', 'pair-microstrip', 'stripline', 'pair-stripline', 'cpw', 'pair-cpw']) {
      const t0 = SR.presetStructure(kind, st, 0.12);
      if (!t0) continue;
      for (const tr of [t0, ...ids.filter((b) => t0.below && ids.indexOf(b) > ids.indexOf(t0.below)).map((b) => ({ ...t0, below: b }))]) {
        const sec = LN.setupSection({ stackup: st, trace: tr });
        if (typeof sec === 'string') continue;
        const full = BM.solveSection(sec);
        if (!full.ok) continue;
        const fin = full.levels[full.levels.length - 1], vl = BM.vacuumLevel(PN.sectionBoundary(sec).boundary, BM.DEFAULT_LEVEL);
        n++;
        if (typeof vl !== 'string' && fin.L.every((x, i) => x === vl.L[i]) && fin.C0.every((x, i) => x === vl.C0[i])) same++;
      }
    }
    t.ok(n >= 20 && same === n, `vacuumLevel = the full solve's finest C0 and L bit for bit: ${same} of ${n} sections`);
    // The exit feed mirrored through the symmetric stackup shares the entry's section key (1 nm wider does not) and its
    // numbers are those of its own solve.
    const mir = VM.feedStructure(st, su.trace, su.via.exit);
    const key = (tr) => PN.sectionKey(LN.setupSection({ stackup: st, trace: tr }));
    t.ok(key(su.trace) === key(mir) && key(su.trace) !== key({ ...su.trace, w: { ...su.trace.w, v: su.trace.w.v + 1e-6 } }), 'sectionKey: the trace mirrored to L6 shares the key of L1; 1 nm wider does not');
    VM.clearFeedCache();
    const m = VM.viaModel(st, su.via, su.trace);
    const own = LN.solveSetup({ stackup: st, trace: mir }), ex = m.feeds.find((f) => f.side === 'exit');
    const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
    t.ok(rel(ex.z0, own.lines[0].z0.v) < 1e-12 && rel(ex.eeff, own.lines[0].eeff.v) < 1e-12, `C44's exit feed (the entry's section) = its own solve: z0 ${ex.z0} / ${own.lines[0].z0.v}`);
    // The run over the antipad: ΔL from the full solves of the trace and of the trace over the next plane, as the model sums it.
    const ov = m.overs.find((o) => o.side === 'entry');
    const La = LN.solveSetup({ stackup: st, trace: { ...su.trace, below: ov.next } }).bem.L[0][0], Lb = LN.solveSetup({ stackup: st, trace: su.trace }).bem.L[0][0];
    const dL = 0 + (La + Lb * -1) * (ov.length * 1e-3);
    t.ok(ov.dL === dL, `C44's ΔL over the antipad from the vacuum solve = from the full solves: ${ov.dL} / ${dL} H`);
    // The worker's via job with the trace's solve in its cache = the model solving every feed.
    const cache = new J.SolveCache();
    const drain = (job) => { const g = J.runJob(job, cache); for (;;) { const x = g.next(); if (x.done) return x.value; } };
    const tw = { ...su.trace, w: { ...su.trace.w, v: 0.1411 } };
    drain({ kind: 'solve', setup: { ...su, trace: tw } });
    VM.clearFeedCache();
    const a = drain({ kind: 'via', setup: { ...su, trace: tw } });
    VM.clearFeedCache();
    const b = VM.viaModel(st, su.via, tw);
    t.ok(a.ok && a.feeds[0].z0 === b.feeds[0].z0 && a.lumped.L[0][0] === b.lumped.L[0][0] && a.nport.s.every((x, i) => x === b.nport.s[i]), "the via job with the trace's solve in the worker's cache = the model solving it (bit for bit)");
    // Timing: after a trace edit (the trace's solve held) and after a new drill, best of 5 (engine.md §10: 30 ms).
    let w = 0.1411, dr = 0.3;
    const tTrace = time(() => { const tr = { ...su.trace, w: { ...su.trace.w, v: (w += 0.0013) } }; drain({ kind: 'solve', setup: { ...su, trace: tr } }); drain({ kind: 'via', setup: { ...su, trace: tr } }); });
    const tDrill = time(() => { drain({ kind: 'via', setup: { ...su, via: { ...su.via, drill: { ...su.via.drill, v: (dr += 0.0021) } } } }); });
    rows.push(`via model C44 in a worker's job (best of 5): ${tTrace.toFixed(1)} ms after a trace edit (the trace's solve included), ${tDrill.toFixed(1)} ms after a new drill`);
    t.ok(tTrace <= 30 && tDrill <= 30, `via model after a trace edit ${tTrace.toFixed(1)} ms, after a new drill ${tDrill.toFixed(1)} ms (≤ 30)`);
  }
  for (const r of rows) t.note(r);
}
