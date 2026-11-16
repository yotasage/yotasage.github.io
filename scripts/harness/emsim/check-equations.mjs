// Checks of the EM theory's equations (step M2.4b, lib/emsim/equations.ts on the shared engine of lib/equations/, the
// numbers from lib/emsim/eqvalues.ts): every entry parses, prints back to the same text, has a meaning for every
// symbol and TeX that KaTeX renders (also its `where` relations, its extra TeX and its substitution lines); every live
// entry evaluates, on the engine's numbers, to the engine's own value on each side (1e-9 relative) on the default
// microstrip (C39 at 0.1377 mm, mask on), the default pair, C41 (0.11 / 0.2 mm), a stripline and a coplanar line with
// ground; the identities (Zdiff = 2·Zodd and Zcm = Zeven/2 for a symmetric pair, the calculator's parts summing to the
// total within their interaction, the shares against tools.ts, σ from the ranking against Monte Carlo); the error
// shown against bem2d.estimateOf; Getsinger at its own limit; and theory.md's numbers to the digits it prints.

import { createRequire } from 'node:module';
import * as EQ0 from '../../../lib/emsim/equations.ts';
import * as EV0 from '../../../lib/emsim/eqvalues.ts';
import * as PA0 from '../../../lib/equations/parse.ts';
import * as CO0 from '../../../lib/equations/compile.ts';
import * as LN0 from '../../../lib/emsim/lines.ts';
import * as BEM0 from '../../../lib/emsim/bem2d.ts';
import * as CF0 from '../../../lib/emsim/closedform.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as ST0 from '../../../lib/emsim/structure.ts';
import * as V0 from '../../../lib/emsim/vary.ts';
import * as TL0 from '../../../components/EmSim/tools.ts';

const d = (m) => m.default ?? m;
const EQ = d(EQ0), EV = d(EV0), PA = d(PA0), CO = d(CO0), LN = d(LN0), BEM = d(BEM0), CF = d(CF0);
const SU = d(SU0), S = d(S0), ST = d(ST0), V = d(V0), TL = d(TL0);
const katex = createRequire(import.meta.url)('../../../node_modules/katex');

const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));
const renders = (s) => { try { katex.renderToString(s, { output: 'mathml', throwOnError: true, strict: 'error' }); return null; } catch (e) { return e.message; } };

const withTrace = (base, f) => { const s = { ...base, trace: { ...base.trace } }; f(s.trace, s.stackup); return s; };
const kindAt = (base, kind, w) => withTrace(base, (tr, st) => { Object.assign(tr, ST.presetStructure(kind, st, w)); });

// Every side of a relation, evaluated on the binding, against the first side (the engine's bound value). Values that
// are zero by symmetry (Zdc, kf in one dielectric, the skew of a stripline) are compared against the entry's scale.
function sidesAgree(tree, b, scale) {
  const sides = CO.evaluate(tree, b).map((a) => a[0]);
  let worst = 0, raw = 0;
  for (const x of sides.slice(1)) {
    if (Math.abs(sides[0]) > 1e-9 * scale) raw = Math.max(raw, rel(x, sides[0]));
    const r = Math.abs(x - sides[0]) <= 1e-12 * scale ? 0 : rel(x, sides[0]);
    worst = Math.max(worst, r);
  }
  return { worst, raw, sides };
}

export async function run(t) {
  const E = EQ.EM_EQUATIONS.slice(0, 33); // the trace's 33 (M2.4b); the via entries and the target in check-teach.mjs (M4.2)
  t.eq(E.length, 33, 'the registry has the 33 equations of notes-M2.4a.md');
  const ids = ['telegraph', 'z0-lc', 'delay-lc', 'eeff-c', 'l-c0', 'v-eeff', 'lambda-eeff', 'getsinger', 'getsinger-limit',
    'charge-potential', 'error-shown', 'order', 'mixed-mode-vars', 'zodd-sym', 'zeven-sym', 'zdiff-zodd', 'zdd-zc', 'zcc-zc',
    'zdc-zc', 'zdiff-b', 'ztdr', 'kb', 'kf', 'fext-pulse', 'eeff-mode', 'mode-skew', 'pct-diff', 'parts-sum', 'sens', 'share',
    'corners', 'rss-sigma', 'mc-normal'];
  t.eq(E.map((e) => e.id).join(','), ids.join(','), 'ids in the order of the theory');
  const topics = new Set(['transmission-lines', 'field-solver', 'pairs', 'calculators', 'tolerances']);

  // ---- parse, print, symbols, TeX ----
  for (const e of E) {
    const rels = [e.tree, ...e.where.map((w) => w.tree)];
    t.ok(rels.every((tr) => PA.toText(PA.parse(PA.toText(tr))) === PA.toText(tr)), `${e.id}: text → tree → text is stable`);
    const unknown = e.variables.filter((v) => !EQ.emSymbolOf(v));
    t.ok(unknown.length === 0, () => `${e.id}: symbols without a meaning: ${unknown.join(', ')}`);
    t.ok(topics.has(e.topic), `${e.id}: topic ${e.topic} is one of theory.md's`);
    for (const tr of rels) {
      const s = EQ.emTex(tr);
      const err = renders(s);
      t.ok(s.length > 0 && !err, () => `${e.id}: TeX "${s}" renders: ${err}`);
    }
    if (e.extra) t.ok(!renders(e.extra), () => `${e.id}: extra TeX renders: ${renders(e.extra)}`);
    t.ok(e.variables.every((v) => !renders(EQ.emNameTex(v))), `${e.id}: every name's TeX renders`);
  }
  const deco = EQ.emTex(EQ.EM_EQUATION_BY_ID.get('zdd-zc').tree, { variable: (n, s) => `\\textcolor{red}{${s}}` });
  t.ok(deco.includes('\\textcolor{red}{Z_{c,11}}'), () => `the page's decoration gets the TEX_NAMES form: ${deco}`);

  // ---- the cases ----
  const def = SU.defaultSetup();
  const pairDef = kindAt(def, 'pair-microstrip');
  const c41 = withTrace(kindAt(def, 'pair-microstrip', 0.11), (tr) => { tr.s = S.val(0.2); });
  const strip = kindAt(def, 'stripline');
  const cpwg = kindAt(def, 'cpwg');
  const cases = [['D (C39 microstrip)', def], ['default pair', pairDef], ['C41 pair 0.11 / 0.2 mm', c41], ['stripline', strip], ['cpwg', cpwg]];

  // the tools' results on D (placeholders as the Tolerance tool), the calculator's parts on D and C41
  const ph = TL.withPlaceholders(def).setup;
  const cr = V.runAll(V.corners(ph));
  const mc = V.runAll(V.monteCarlo(ph, { samples: V.MC_SAMPLES, seed: V.MC_SEED, keys: [cr.key] }));
  const calcD = EV.calculatorParts(def);
  const calcP = EV.calculatorParts(c41);
  t.ok(typeof calcD === 'object' && typeof calcP === 'object', () => `calculatorParts solves D and C41: ${calcD} ${calcP}`);

  const liveCount = {};
  let evaluated = 0, worstAll = 0;
  for (const [name, setup] of cases) {
    const r = LN.solveSetup(setup, { M: 2 });
    if (!t.ok(r.ok, () => `${name}: solves (${r.reason})`)) continue;
    const cfs = CF.closedForms(setup);
    const field = r.n === 2 ? r.pair.zdiff.v : r.lines[0].z0.v;
    const cf = cfs.results.find((x) => Number.isFinite(r.n === 2 ? x.values.zdiff : x.values.z0));
    const isD = setup === def, isP = setup === c41;
    const ctx = {
      result: r, kind: setup.trace.kind, reduced: cfs.reduced,
      formula: cf ? { value: r.n === 2 ? cf.values.zdiff : cf.values.z0, field } : undefined,
      calc: isD ? calcD : isP ? calcP : null, corners: isD ? cr : null, mc: isD ? mc : null,
    };
    const b = EV.emBinding(ctx);
    for (const e of E) {
      const applies = e.applies === 'any' || (e.applies === 'line') === (r.n === 1);
      const bind = EQ.bindingFor(e, b);
      if (!e.live) { t.ok(bind === null, `${e.id}: not live`); continue; }
      if (!applies) continue;
      const must = e.id !== 'error-shown' && (!['getsinger', 'getsinger-limit'].includes(e.id) || ['microstrip', 'embedded'].includes(setup.trace.kind));
      const needsCtx = ['parts-sum'].includes(e.id) ? !!ctx.calc : ['sens', 'share', 'corners', 'rss-sigma', 'mc-normal'].includes(e.id) ? !!ctx.corners : e.id === 'pct-diff' ? !!ctx.formula : true;
      if (must && needsCtx) t.ok(bind !== null, () => `${name}: ${e.id} has a number for every symbol (missing ${e.variables.filter((v) => !Number.isFinite(b[v])).join(', ')})`);
      if (!bind) continue;
      liveCount[e.id] = (liveCount[e.id] ?? 0) + 1;
      const unit0 = EQ.EM_SYMBOLS[e.variables[0]].unit;
      const scale = Math.max(1e-300, ...e.variables.filter((v) => EQ.EM_SYMBOLS[v].unit === unit0).map((v) => Math.abs(bind[v])));
      for (const tr of [e.tree, ...e.where.map((w) => w.tree)]) {
        const { worst, raw, sides } = sidesAgree(tr, bind, scale);
        evaluated += 1; worstAll = Math.max(worstAll, raw);
        t.ok(worst <= 1e-9, () => `${name}: ${e.id} "${PA.toText(tr)}" sides ${sides.join(' / ')} (worst ${worst.toExponential(2)})`);
        // the substitution lines with the numbers render
        const sub = EQ.emSubstitutions(tr, EQ.valuesTex(e, b));
        if (sub) t.ok(sub.lines.every((l) => !renders(l)) && !renders(sub.lhs) && !renders(sub.rhs), () => `${name}: ${e.id} substitution lines render: ${sub.lines.map(renders).filter(Boolean).join('; ')}`);
      }
    }
    // the comparison sees a wrong number: Z0 off by 1 ppm
    if (r.n === 1) {
      const z = EQ.EM_EQUATION_BY_ID.get('z0-lc');
      const off = { ...EQ.bindingFor(z, b), Z_0: b.Z_0 * (1 + 1e-6) };
      t.ok(sidesAgree(z.tree, off, b.Z_0).worst > 5e-7, `${name}: a Z0 off by 1 ppm is caught`);
    }
    // ---- identities and the engine's own rules ----
    if (r.n === 2 && r.pair.symmetric) {
      t.ok(rel(r.pair.zdiff.v, 2 * r.pair.zodd.v) <= 1e-12 && rel(r.pair.zcm.v, r.pair.zeven.v / 2) <= 1e-12, `${name}: Zdiff = 2·Zodd, Zcm = Zeven/2`);
      t.ok(rel(b.Z_odd, Math.sqrt((b.L_11 - b.L_12) / (b.C_11 - b.C_12))) <= 1e-9, `${name}: Zodd from L and C equals the engine's`);
      t.ok(Math.abs(r.pair.zdc.v) <= 1e-9 * r.pair.zdiff.v, `${name}: Zdc = 0 for a symmetric pair`);
    }
    const xs = EV.levelSeries(r);
    if (t.ok(xs.length === 3, `${name}: three levels`)) {
      const est = BEM.estimateOf(xs);
      t.ok(rel(b.p, est.order) <= 1e-12, () => `${name}: the order p = ${b.p} equals estimateOf's ${est.order}`);
      t.ok(b.e >= 1.5 * Math.abs(xs[2] - xs[1]) * (1 - 1e-12), `${name}: the error shown is at least 1.5·|X_M − X_M/2|`);
      const ratio = (xs[1] - xs[0]) / (xs[2] - xs[1]);
      const plain = ratio >= 2 && rel(b.e, est.e) <= 1e-12 && rel(est.e, 1.5 * Math.max(Math.abs(xs[2] - xs[1]), Math.abs(xs[1] - xs[0]) / 4)) <= 1e-12;
      t.ok(plain === (b.D_X !== undefined), `${name}: error-shown is live exactly where the shown error is its rule`);
      if (isD || isP) t.ok(plain, `${name}: the error shown is the printed rule`);
      t.note(`${name}: levels ${xs.map((x) => x.toFixed(4)).join(', ')}, ratio ${ratio.toFixed(2)}, p ${b.p.toFixed(2)}, e ${b.e.toPrecision(3)} (${plain ? 'the rule as printed' : 'another branch of the rule or a floor'})`);
    }
    if (isD) {
      // theory.md's numbers (notes-M2.4a.md) to the digits printed
      const near = (a, want, digits, what) => t.ok(Math.abs(a - want) <= 0.5 * 10 ** -digits * (1 + 1e-9), () => `${what}: ${a} (theory: ${want})`);
      near(b.Z_0, 51.50, 2, 'D Z0'); near(b.C * 1e12, 117.6, 1, 'D C pF/m'); near(b.L * 1e9, 312.0, 1, 'D L nH/m');
      near(b.tau * 1e9, 6.058, 3, 'D delay ps/mm'); near(b.lambda * 1e3, 16.5, 1, 'D λ at 10 GHz mm');
      near(b.h * 1e3, 0.092, 3, 'D h mm'); near(b.varepsilon_r, 4.1, 1, 'D εr'); near(b.f_p / 1e9, 222.7, 1, 'D fp GHz');
      const g10 = EV.getsinger(b.Z_0, b.varepsilon_eff, b.varepsilon_r, b.h, 10e9), g25 = EV.getsinger(b.Z_0, b.varepsilon_eff, b.varepsilon_r, b.h, 25e9);
      near(g10.rise * 100, 0.052, 3, 'D Getsinger rise at 10 GHz %'); near(g25.rise * 100, 0.32, 2, 'D rise at 25 GHz %');
      near(b.f_lim / 1e9, 17.9, 1, 'D f_lim GHz'); near(b.delta * 100, 0.166, 3, 'D δ %');
      t.ok(rel(EV.getsinger(b.Z_0, b.varepsilon_eff, b.varepsilon_r, b.h, b.f_lim).rise, b.delta) <= 1e-9, 'Getsinger at f_lim rises by exactly δ');
      t.ok(rel(b.varepsilon_f, g10.eeffF) <= 1e-15, 'the bound εeff(f) is Getsinger’s own at 10 GHz');
      // calculator parts
      const c = calcD;
      near(c.parts.er, 0.94, 2, 'D part εr'); near(c.parts.copper, 0.51, 2, 'D part copper'); near(c.parts.etch, 0.25, 2, 'D part etch');
      near(c.parts.mask, -0.27, 2, 'D part mask'); near(c.stackup - c.calculator, 1.44, 2, 'D together'); near(c.calculator, 50.06, 2, 'D as the calculator');
      t.ok(Math.abs(b.Delta_Z - b.Delta_sum) <= 0.05 * Math.abs(b.Delta_Z), () => `D: the parts sum to the total within their interaction: ${b.Delta_sum} against ${b.Delta_Z}`);
      t.note(`D: parts ${['er', 'copper', 'etch', 'mask'].map((p) => c.parts[p].toFixed(3)).join(', ')}, sum ${b.Delta_sum.toFixed(3)}, total ${b.Delta_Z.toFixed(3)} Ω`);
      // tolerances
      const sh = TL.shares(cr.inputs.map((x) => x.d[cr.key]));
      t.ok(rel(b.s_i, sh[0]) <= 1e-12, `share s_i equals tools.shares (${sh[0].toFixed(3)})`);
      near(b.d_i, 2.871, 3, 'D d of the first input'); near(sh[0], 0.533, 3, 'D share of the first input');
      near(b.Z_lo, 44.54, 2, 'D lower corner'); near(b.Z_hi, 59.37, 2, 'D upper corner');
      near(b.sigma, 1.310, 3, 'D σ from the ranking'); near(mc.stats[cr.key].sd, 1.313, 3, 'D Monte Carlo sd');
      t.ok(Math.abs(b.sigma - mc.stats[cr.key].sd) <= 0.02 * mc.stats[cr.key].sd, 'σ from the ranking within 2 % of Monte Carlo’s');
      t.ok(rel(b.sigma_i, cr.inputs[0].lim / 3) <= 1e-15, 'σ_i = t_i/3');
    }
    if (isP) {
      const near = (a, want, digits, what) => t.ok(Math.abs(a - want) <= 0.5 * 10 ** -digits * (1 + 1e-9), () => `${what}: ${a} (theory: ${want})`);
      near(b.Z_diff, 103.36, 2, 'P Zdiff'); near(b.Z_cm, 30.91, 2, 'P Zcm'); near(b.Z_odd, 51.68, 2, 'P Zodd'); near(b.Z_even, 61.82, 2, 'P Zeven');
      near(b.Z_c11, 56.75, 2, 'P Zc11'); near(b.k_b, 0.0446, 4, 'P kb'); near(b.k_f * 1e9, -0.163, 3, 'P kf ps/mm');
      near(b.V_FEXT, -0.163, 3, 'P FEXT V'); near(b.Delta_tau * 1e12, 32.7, 1, 'P skew ps at 100 mm');
      near(b.varepsilon_effm, 3.082, 3, 'P εeff of the odd (fastest) mode');
      near(calcP.calculator, 100.01, 2, 'P as the calculator');
    }
  }
  const neverLive = E.filter((e) => e.live && !liveCount[e.id]).map((e) => e.id);
  t.ok(neverLive.length === 0, () => `every live equation evaluated on some case (not: ${neverLive.join(', ')})`);
  t.note(`${evaluated} relations evaluated on 5 cases, worst relative difference between sides (values not zero by symmetry) ${worstAll.toExponential(2)}; not live (definitions): ${E.filter((e) => !e.live).map((e) => e.id).join(', ')}`);
}
