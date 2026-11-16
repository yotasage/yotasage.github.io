// Checks of "as JLCPCB's calculator" (step M2.3b, lib/emsim/jlcCalc.ts): the rules (εr 4.3 on every prepreg, cores
// kept; outer 1 oz copper 1.6 mil with 0.25 mil etch per side, inner copper kept; mask 1.0/0.6/1.0 mil at εr 3.8),
// each changed value citing ref S, idempotence, parts that add up to the whole, no new stackup issue, the link round
// trip, every preset; then notes-M1.4c.md's numbers reproduced through the helper (C39 at Si9000's 5.421875 mil:
// 50.056 ± 0.058 Ω; C41 at 4.35625 / 8: 99.999 ± 0.524, at 4.36 / 8: 99.96, at 0.11 / 0.2 mm: 100.01) within the
// solver's error, the target width for 50 Ω on the variant, and `jlcpcbStated` on the owner's cases only.

import * as J0 from '../../../lib/emsim/jlcCalc.ts';
import * as LN0 from '../../../lib/emsim/lines.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as ST0 from '../../../lib/emsim/structure.ts';
import * as P0 from '../../../lib/emsim/presets.ts';
import * as IV0 from '../../../lib/emsim/inverse.ts';

const J = J0.default ?? J0, LN = LN0.default ?? LN0, SU = SU0.default ?? SU0, S = S0.default ?? S0;
const ST = ST0.default ?? ST0, P = P0.default ?? P0, IV = IV0.default ?? IV0;
const MIL = 0.0254;

const withTrace = (base, f) => { const s = { ...base, trace: { ...base.trace } }; f(s.trace, s.stackup); return s; };
const pairAt = (base, w, sp) => withTrace(base, (tr, st) => { Object.assign(tr, ST.presetStructure('pair-microstrip', st, w)); tr.s = S.val(sp); });
const msAt = (base, w) => withTrace(base, (tr) => { tr.w = S.val(w); });

export async function run(t) {
  const def = SU.defaultSetup();
  const before = JSON.stringify(def);
  const v = J.asJlcpcbCalculator(def);
  t.ok(JSON.stringify(def) === before, 'the argument is not changed');
  const st = v.setup.stackup;
  // ---- the rules ----
  const preset = def.stackup;
  let good = true;
  st.layers.forEach((l, i) => {
    const o = preset.layers[i];
    const isS = (x) => x.src.kind === 'preset' && x.src.ref === 'S' && x.src.date === '2026-11-16' && x.src.id === st.id && x.src.url === P.REFS.S.url;
    if (l.kind === 'dielectric') {
      if (l.role === 'prepreg') { if (!(l.er.v === 4.3 && isS(l.er))) good = false; }
      else if (!S.sameLayer(l, o)) good = false;
      if (!S.sameVal(l.t, o.t)) good = false;
    } else if (l.kind === 'copper') {
      if (S.isOuter(st, i)) {
        if (!(Math.abs(l.t.v - 1.6 * MIL) < 1e-15 && isS(l.t) && l.etch.kind === 'offset' && Math.abs(l.etch.side.v - 0.25 * MIL) < 1e-15 && isS(l.etch.side))) good = false;
      } else if (!S.sameLayer(l, o)) good = false;
    } else if (l.kind === 'mask') {
      const m = [[l.er, 3.8], [l.onLaminate, 1.0 * MIL], [l.onCopper, 0.6 * MIL], [l.between, 1.0 * MIL]];
      for (const [x, want] of m) if (!(Math.abs(x.v - want) < 1e-15)) good = false;
      for (const x of [l.onLaminate, l.between]) if (!isS(x)) good = false;
      if (!S.sameVal(l.onCopper, o.onCopper) || !S.sameVal(l.er, o.er)) good = false; // equal already: source kept
    }
  });
  t.ok(good, 'JLC061611-3313A as the calculator: prepregs εr 4.3, cores and inner copper kept, outer 1.6 mil and 0.25 mil, mask 1.0/0.6/1.0 at 3.8, each change citing ref S');
  t.ok(v.kept.some((k) => /Cores/.test(k)) && v.kept.some((k) => /Inner copper/.test(k)), () => `kept names cores and inner copper: ${JSON.stringify(v.kept)}`);
  t.ok(v.changed.length > 0 && ST.sameStructure(v.setup.trace, def.trace), 'changes listed, trace kept');
  t.ok(J.asJlcpcbCalculator(v.setup).changed.length === 0 && J.isJlcpcbCalculator(v.setup) && !J.isJlcpcbCalculator(def), 'idempotent; isJlcpcbCalculator');
  // parts one after another give the whole
  let acc = def;
  for (const p of J.JLC_PARTS) acc = J.asJlcpcbCalculator(acc, [p]).setup;
  t.ok(S.sameStackup(acc.stackup, st), 'the four parts applied one by one equal the whole');
  t.eq(J.jlcPartsThatChange(def).join(','), 'er,copper,etch,mask', 'every part changes the preset');
  for (const p of J.JLC_PARTS) t.ok(J.asJlcpcbCalculator(J.jlcAllBut(def, p), [p]).changed.length > 0 && S.sameStackup(J.asJlcpcbCalculator(J.jlcAllBut(def, p), [p]).setup.stackup, st), `all but ${p}, then ${p}, is the whole`);
  // no new issue; link round trip
  const iss = (s) => S.stackupIssues(s).map((x) => `${x.level}:${x.code}:${x.where}`).sort().join('|');
  t.eq(iss(st), iss(preset), 'no stackup issue added');
  const back = SU.fromPlain(JSON.parse(JSON.stringify(SU.toPlain(v.setup, true))));
  t.ok(back.issues.length === 0 && S.sameStackup(back.setup.stackup, st), () => `link round trip of the variant: ${JSON.stringify(back.issues)}`);
  // every preset
  for (const id of P.PRESET_IDS) {
    const s0 = SU.defaultSetup(); s0.stackup = P.presetStackup(id);
    const x = J.asJlcpcbCalculator(s0);
    t.ok(iss(x.setup.stackup) === iss(s0.stackup) && J.isJlcpcbCalculator(x.setup), `${id}: issues unchanged, idempotent`);
  }

  // ---- notes-M1.4c.md reproduced ----
  const solve = (s) => LN.solveSetup(s, { M: 2 });
  const z0 = (s) => { const r = solve(s); return r.ok ? { v: r.lines[0].z0.v, e: r.lines[0].z0.e, x: r.lines[0].eeff.v } : { v: NaN, e: NaN, x: NaN }; };
  const zd = (s) => { const r = solve(s); return r.ok && r.pair ? { v: r.pair.zdiff.v, e: r.pair.zdiff.e } : { v: NaN, e: NaN }; };
  const jl = v.setup;
  const c39 = z0(msAt(jl, 5.421875 * MIL));
  t.ok(Math.abs(c39.v - 50.056) <= 0.006 && Math.abs(c39.e - 0.058) <= 0.006 && Math.abs(c39.x - 3.3631) <= 2e-4, () => `C39 at 5.421875 mil as the calculator: ${c39.v} ± ${c39.e}, εeff ${c39.x} (50.056 ± 0.058, 3.3631)`);
  t.ok(Math.abs(c39.v - 49.958) / 49.958 <= 0.005, 'C39 within 0.5 % of Si9000\'s 49.958');
  const c39d = z0(msAt(jl, 0.1377));
  const c41a = zd(pairAt(jl, 4.35625 * MIL, 8 * MIL));
  const c41b = zd(pairAt(jl, 4.36 * MIL, 8 * MIL));
  const c41c = zd(pairAt(jl, 0.11, 0.2));
  t.ok(Math.abs(c41a.v - 99.999) <= Math.max(0.01, 0.02 * c41a.e), () => `C41 at 4.35625 / 8: ${c41a.v} ± ${c41a.e} (99.999 ± 0.524)`);
  t.ok(Math.abs(c41b.v - 99.96) <= c41b.e, () => `C41 at 4.36 / 8: ${c41b.v} ± ${c41b.e} (99.96)`);
  t.ok(Math.abs(c41c.v - 100.01) <= c41c.e, () => `C41 at 0.11 / 0.2 mm: ${c41c.v} ± ${c41c.e} (100.01)`);
  t.ok(Math.abs(c41a.v - 99.951) / 99.951 <= 0.005, 'C41 within 0.5 % of Si9000\'s 99.951');
  // the target on the variant
  const iv = IV.inverse(jl, 'z0', 50, 'w', { M: 2 });
  t.ok(iv.reached && Math.abs(iv.w / MIL - 5.42) <= 0.03, () => `Target 50 Ω as the calculator: ${iv.w / MIL} mil (about 5.42)`);
  const ivp = IV.inverse(pairAt(jl, 0.11, 0.2), 'zdiff', 100, 'w', { M: 2 });
  t.note(`as JLCPCB's calculator (M = 2): C39 5.421875 mil ${c39.v.toFixed(3)} ± ${c39.e.toFixed(3)} Ω εeff ${c39.x.toFixed(4)}, at 0.1377 mm ${c39d.v.toFixed(2)} ± ${c39d.e.toFixed(2)}; C41 4.35625/8 ${c41a.v.toFixed(3)} ± ${c41a.e.toFixed(3)}, 4.36/8 ${c41b.v.toFixed(2)} ± ${c41b.e.toFixed(2)}, 0.11/0.2 mm ${c41c.v.toFixed(2)} ± ${c41c.e.toFixed(2)}; Target 50 Ω ${(iv.w / MIL).toFixed(3)} mil (${iv.w.toFixed(4)} mm), 100 Ω at 0.2 gap ${(ivp.w / MIL).toFixed(3)} mil`);

  // ---- breakdown one part at a time (facts-cases.md: +0.94 / +0.51 / +0.25 / −0.27 at C39) ----
  const base39 = msAt(def, 5.421875 * MIL);
  const j39 = z0(J.asJlcpcbCalculator(base39).setup).v;
  const want39 = { er: 0.94, copper: 0.51, etch: 0.25, mask: -0.27 };
  for (const p of J.JLC_PARTS) {
    const d = z0(J.jlcAllBut(base39, p)).v - j39;
    t.ok(Math.abs(d - want39[p]) <= 0.02, () => `C39 breakdown ${p}: ${d.toFixed(3)} Ω (${want39[p]})`);
  }

  // ---- what JLCPCB states, owner's cases only ----
  const pre = P.presetStackup(P.DEFAULT_PRESET);
  t.eq(J.jlcpcbStated(def, pre)?.case, 'C39', 'stated on the default (0.1377 mm = 5.42 mil)');
  t.eq(J.jlcpcbStated(jl, pre)?.case, 'C39', 'stated on the variant');
  t.eq(J.jlcpcbStated(pairAt(def, 0.11, 0.2), pre)?.case, 'C41', 'stated on the pair 0.11 / 0.2');
  t.eq(J.jlcpcbStated(pairAt(jl, 4.36 * MIL, 8 * MIL), pre)?.case, 'C41', 'stated on the pair 4.36 / 8 mil as the calculator');
  t.eq(J.jlcpcbStated(msAt(def, 0.15), pre), null, 'nothing stated at another width');
  const er = { ...def, stackup: S.cloneStackup(def.stackup) }; er.stackup.layers[2].er = S.val(4.5);
  t.eq(J.jlcpcbStated(er, pre), null, 'nothing stated on an edited stackup');
}
