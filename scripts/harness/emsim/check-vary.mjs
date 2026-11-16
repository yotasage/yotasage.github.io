// Checks of the target, sweeps and tolerance (step M1.3): inverse solves that round-trip to 10⁻⁶ of the target (and
// say why when out of reach), sweeps whose fast points (coarse level + interpolated fine correction) stay within
// their stated error of fine solves, corners and sensitivity on C39 and the owner's LVDS pair C41 with the signs
// physics gives, the cost of the fast path against fine solves, Monte Carlo bit-identical for a seed and consistent
// with the sensitivities, and the budgets of engine.md §10 (inverse 0.3 s, sweep of 100 points 2 s, Monte Carlo of
// 1000 samples 20 s) on the microstrip, the symmetric pair with coplanar ground and an asymmetric one.
//
// The tolerances are the harness's own (no preset carries any yet): widths, gaps and thicknesses ±10 %, εr ±0.2,
// mask thicknesses ±30 %.

import * as LN0 from '../../../lib/emsim/lines.ts';
import * as IV0 from '../../../lib/emsim/inverse.ts';
import * as V0 from '../../../lib/emsim/vary.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as ST0 from '../../../lib/emsim/structure.ts';
import { asymSetup } from './check-modes.mjs';

const LN = LN0.default ?? LN0;
const IV = IV0.default ?? IV0;
const V = V0.default ?? V0;
const SU = SU0.default ?? SU0;
const ST = ST0.default ?? ST0;

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const now = () => performance.now();

function pairSetup(kind, w, s, g) {
  const su = SU.defaultSetup();
  const st = ST.presetStructure(kind, su.stackup, w);
  st.s.v = s;
  if (g) st.g.v = g;
  return { ...su, trace: st };
}
function tolSet(s) {
  const c = V.cloneSetup(s);
  const tr = c.trace;
  if (tr.kind === 'general') for (const g of tr.signals) g.w.tol = { rel: 0.1 };
  else { tr.w.tol = { rel: 0.1 }; tr.s.tol = { rel: 0.1 }; tr.g.tol = { rel: 0.1 }; }
  for (const l of c.stackup.layers) {
    if (l.kind === 'dielectric') { l.t.tol = { rel: 0.1 }; l.er.tol = { abs: 0.2 }; }
    else if (l.kind === 'copper') l.t.tol = { rel: 0.1 };
    else { l.onCopper.tol = { rel: 0.3 }; l.onLaminate.tol = { rel: 0.3 }; l.between.tol = { rel: 0.3 }; l.er.tol = { abs: 0.2 }; }
  }
  return c;
}
const C39 = () => tolSet(SU.defaultSetup());
const C41 = () => tolSet(pairSetup('pair-microstrip', 0.11, 0.2));
const CPW = () => tolSet(pairSetup('pair-cpw', 0.1, 0.15, 0.3));
const ASYM = () => tolSet(asymSetup(0.1, 0.12, 0.15, { g: 0.3 }));
const valueOf = (r, key) => (key === 'z0' ? r.lines[0].z0.v : r.pair[key].v);

function inverse(t) {
  const lines = ['Inverse (M = 2): round trip |Z(found) − target|/target by a fresh forward solve with the estimate:'];
  const cases = [
    ['C39 Z0 50 Ω, width', C39(), 'z0', 50, 'w', {}],
    ['C41 Zdiff 100 Ω, width', C41(), 'zdiff', 100, 'w', {}],
    ['C41 Zdiff 100 Ω, gap', C41(), 'zdiff', 100, 's', {}],
    ['C41 Zdiff 90 Ω, width and gap', C41(), 'zdiff', 90, 'ws', {}],
    ['C41 Zcm 30 Ω, width', C41(), 'zcm', 30, 'w', {}],
    ['pair + coplanar ground Zdiff 90 Ω', CPW(), 'zdiff', 90, 'w', {}],
    ['the same solved whole', CPW(), 'zdiff', 90, 'w', { mirror: false }],
    ['pair stripline Zdiff 85 Ω, gap', (() => { const su = SU.defaultSetup(); return { ...su, trace: ST.presetStructure('pair-stripline', su.stackup, 0.1) }; })(), 'zdiff', 85, 's', {}],
  ];
  let worst = 0;
  for (const [what, set, key, target, vary, opt] of cases) {
    const r = IV.inverse(set, key, target, vary, opt);
    if (!t.ok(r.ok && r.reached, `${what}: ${r.reason}`)) continue;
    const back = LN.solveSetup(r.setup, { M: 2, mirror: opt.mirror });
    const e = rel(valueOf(back, key), target);
    worst = Math.max(worst, e);
    t.ok(e <= 1e-6, `${what}: round trip ${e}`);
    t.ok(valueOf(r.result, key) === valueOf(back, key), `${what}: the returned result is the forward solve`);
    lines.push(`  ${what.padEnd(36)} ${vary === 'ws' ? `scale ${r.x.toFixed(6)} (w ${r.w.toFixed(5)}, s ${r.s.toFixed(5)})` : `${vary} ${r.x.toFixed(6)} mm`}  ${e.toExponential(1)}  solves ${r.solves.coarse} coarse + ${r.solves.fine} fine  ${r.ms.toFixed(0)} ms`);
  }
  // many targets: a mesh step must not stop the search
  let missed = 0, n = 0;
  for (let z = 40; z <= 70; z += 1.5) {
    const r = IV.inverse(C39(), 'z0', z, 'w');
    n++;
    if (!r.reached) { missed++; t.ok(false, `C39 Z0 ${z} Ω: ${r.reason}`); continue; }
    worst = Math.max(worst, rel(r.value, z));
  }
  lines.push(`  C39 Z0 40…70 Ω every 1.5 Ω: ${n - missed} of ${n} reached; worst round trip of all ${worst.toExponential(1)}`);
  // out of reach and refusals
  const hi = IV.inverse(C39(), 'z0', 500, 'w');
  t.ok(hi.ok === false && !hi.reached && hi.range && /out of reach/.test(hi.reason), `500 Ω out of reach: ${hi.reason}`);
  const near = IV.inverse(C39(), 'z0', 93, 'w');
  t.ok(near.reached && rel(near.value, 93) <= 1e-6, `93 Ω next to the etch limit (w ≥ 0.01778): ${near.reason} ${near.x}`);
  t.ok(/etch/.test(IV.inverse(C39(), 'z0', 95, 'w').reason), 'beyond the etch limit: the reason names it');
  const lo = IV.inverse(C39(), 'z0', 1, 'w');
  t.ok(!lo.reached && lo.range && /out of reach/.test(lo.reason), `1 Ω out of reach: ${lo.reason}`);
  t.ok(!IV.inverse(C39(), 'zdiff', 100, 'w').reached, 'Zdiff of a single trace refused');
  t.ok(!IV.inverse(C41(), 'zdiff', -5, 'w').reached, 'negative target refused');
  t.ok(!IV.inverse(ASYM(), 'zdiff', 100, 'w').reached, 'general arrangement refused with a reason');
  lines.push(`  out of reach: ${hi.reason}`);
  t.note(lines.join('\n'));
}

function sweeps(t) {
  const lines = ['Sweeps: fast points (coarse level, fine correction interpolated between 3 anchors) against fine solves:'];
  const cases = [
    ['C39 width 0.08…0.2', C39(), 'w', 25, 0.08, 0.2, 'z0'],
    ['C41 gap 0.1…0.4', C41(), 's', 25, 0.1, 0.4, 'zdiff'],
    ['asymmetric pair + ground, D1 εr 3.6…4.6', ASYM(), 'D1.er', 11, 3.6, 4.6, 'zdiff'],
    ['asymmetric pair + ground, signal 2 width 0.1…0.14', ASYM(), 'sig2.w', 11, 0.1, 0.14, 'zdiff'],
  ];
  for (const [what, set, id, N, a, b, key] of cases) {
    const xs = Array.from({ length: N }, (_, i) => a + ((b - a) * i) / (N - 1));
    const r = V.runAll(V.sweep(set, id, xs));
    if (!t.ok(r.ok && r.points.every((p) => p.ok), `${what}: ${r.reason}`)) continue;
    const input = V.inputsOf(set, true).find((i) => i.id === id);
    let dmax = 0, ratio = 0, monotone = true;
    for (let i = 0; i < N; i++) {
      const f = LN.quickValues(V.withValues(set, [input], [xs[i]]), 2, true);
      const p = r.points[i];
      const d = Math.abs(p.values[key] - f[key]);
      dmax = Math.max(dmax, d);
      ratio = Math.max(ratio, d / p.err[key]);
      if (i && (p.values[key] - r.points[i - 1].values[key]) * (r.points[N - 1].values[key] - r.points[0].values[key]) <= 0) monotone = false;
    }
    t.ok(ratio <= 1, `${what}: fast point off a fine solve by ${dmax} Ω, beyond its error (×${ratio.toFixed(2)})`);
    t.ok(monotone, `${what}: ${key} monotonic`);
    lines.push(`  ${what.padEnd(50)} ${r.solves.fine} fine + ${r.solves.coarse} coarse, worst |fast − fine| ${dmax.toExponential(1)} Ω = ${(ratio * 100).toFixed(1)} % of the stated error, ${r.ms.toFixed(0)} ms`);
  }
  // any list of setups, and stopping a sweep half-way
  const list = [C39(), C41(), CPW()];
  const rs = V.runAll(V.sweepSetups(list));
  t.ok(rs.length === 3 && rs.every((r, i) => r.ok && valueOf(r, i ? 'zdiff' : 'z0') === valueOf(LN.solveSetup(list[i], { estimate: false }), i ? 'zdiff' : 'z0')), 'sweepSetups gives the solves of the list');
  const g = V.sweep(C39(), 'w', [0.1, 0.11, 0.12, 0.13, 0.14, 0.15]);
  g.next(); g.next();
  const stop = g.return(null);
  t.ok(stop.done, 'a sweep stops when asked');
  t.ok(!V.runAll(V.sweep(C39(), 'nothing', [1])).ok, 'unknown input refused');
  t.note(lines.join('\n'));
}

function tolerance(t) {
  const lines = ['Corners and sensitivity (fast path; harness tolerances), change per tolerance, ranked:'];
  for (const [what, set, signs] of [['C39', C39(), { w: -1, 'D1.t': 1, 'D1.er': -1, 'L1.t': -1 }], ['C41', C41(), { w: -1, s: 1, 'D1.t': 1, 'D1.er': -1 }]]) {
    const c = V.runAll(V.corners(set));
    if (!t.ok(c.ok, `${what} corners: ${c.reason}`)) continue;
    const k = c.key, nom = c.nominal[k], cor = c.corners[0];
    for (const [id, s] of Object.entries(signs)) {
      const x = c.inputs.find((i) => i.id === id);
      t.ok(x && Math.sign(x.d[k]) === s, `${what}: ${id} moves ${k} ${s > 0 ? 'up' : 'down'} (${x && x.d[k]})`);
    }
    t.ok(cor.lo < nom && nom < cor.hi, `${what}: corners around the nominal`);
    t.ok(Math.abs(cor.hi - cor.lo - (cor.linHi - cor.linLo)) <= 0.1 * (cor.hi - cor.lo), `${what}: corners near the linear sum`);
    t.ok(['w', 'D1.t'].includes(c.inputs[0].id), `${what}: top input ${c.inputs[0].id}`);
    lines.push(`  ${what} ${k} ${nom.toFixed(3)} ± ${c.nominalErr[k].toFixed(3)} Ω, corners ${cor.lo.toFixed(2)} … ${cor.hi.toFixed(2)} (linear ${cor.linLo.toFixed(2)} … ${cor.linHi.toFixed(2)}), ${c.solves} solves ${c.ms.toFixed(0)} ms:`);
    lines.push(`    ${c.inputs.map((i) => `${i.id} ${i.d[k] >= 0 ? '+' : ''}${i.d[k].toFixed(3)}`).join(', ')}`);
  }
  // the fast path's cost: every ±limit point again at the fine level
  lines.push('  Fast path against fine solves at every ±limit point (share of the corner spread):');
  for (const [what, set] of [['C39', C39()], ['C41', C41()], ['asymmetric pair + ground', ASYM()]]) {
    const c = V.runAll(V.corners(set));
    if (!t.ok(c.ok, `${what}: ${c.reason}`)) continue;
    const k = c.key, inputs = V.inputsOf(set), spread = c.corners[0].hi - c.corners[0].lo;
    let d = 0;
    for (const s of c.inputs) {
      const i = inputs.findIndex((x) => x.id === s.id);
      for (const [side, vals] of [[1, s.hi], [-1, s.lo]]) {
        const v = inputs.map((x) => x.v);
        v[i] += side * inputs[i].lim;
        const f = LN.quickValues(V.withValues(set, inputs, v), 2, true);
        d = Math.max(d, Math.abs(vals[k] - f[k]));
      }
    }
    t.ok(d <= 0.01 * spread, `${what}: fast path off by ${d} Ω, over 1 % of the spread ${spread}`);
    lines.push(`    ${what.padEnd(26)} ${k} worst ${d.toExponential(1)} Ω = ${((100 * d) / spread).toFixed(2)} % of ${spread.toFixed(2)} Ω`);
  }
  // Monte Carlo: deterministic, seeds differ, consistent with the sensitivities
  const set = C41();
  const m1 = V.runAll(V.monteCarlo(set));
  const m2 = V.runAll(V.monteCarlo(set));
  const m3 = V.runAll(V.monteCarlo(set, { seed: 7 }));
  if (t.ok(m1.ok && m2.ok && m3.ok, `C41 Monte Carlo: ${m1.reason}`)) {
    let same = true;
    for (const k of Object.keys(m1.stats)) {
      const a = m1.stats[k], b = m2.stats[k];
      for (const f of ['mean', 'sd', 'min', 'max']) if (!Object.is(a[f], b[f])) same = false;
      a.p.forEach((x, i) => { if (!Object.is(x, b.p[i])) same = false; });
    }
    t.ok(same, 'Monte Carlo with the same seed is bit-identical');
    t.ok(m1.stats.zdiff.mean !== m3.stats.zdiff.mean, 'another seed gives other samples');
    const c = V.runAll(V.corners(set));
    const pred = Math.sqrt(c.inputs.reduce((s, i) => s + i.d.zdiff ** 2, 0)) / 3;
    const st = m1.stats.zdiff;
    t.ok(rel(st.sd, pred) <= 0.15, `C41 Monte Carlo sd ${st.sd} vs √Σd²/3 ${pred}`);
    t.ok(Math.abs(st.mean - m1.nominal.zdiff) <= 0.25 * st.sd, `C41 Monte Carlo mean ${st.mean} vs nominal ${m1.nominal.zdiff}`);
    t.ok(st.p[0] < st.p[2] && st.p[2] < st.p[4] && st.min <= st.p[0] && st.p[4] <= st.max, 'percentiles in order');
    const u = V.runAll(V.monteCarlo(set, { dist: 'uniform', samples: 300 }));
    const lim = c.inputs.reduce((s, i) => s + Math.abs(i.d.zdiff), 0);
    t.ok(u.ok && u.stats.zdiff.max - m1.nominal.zdiff <= lim * 1.05 && m1.nominal.zdiff - u.stats.zdiff.min <= lim * 1.05, 'uniform samples inside the worst case');
    lines.push(`  C41 Monte Carlo 1000 (seed ${m1.seed}, normal σ = limit/3): Zdiff ${m1.nominal.zdiff.toFixed(3)} ± ${m1.nominalErr.zdiff.toFixed(3)} Ω, mean ${st.mean.toFixed(3)}, sd ${st.sd.toFixed(3)} (sensitivities: ${pred.toFixed(3)}), 95 % ${st.p[1].toFixed(2)} … ${st.p[3].toFixed(2)}, ±3σ ${st.p[0].toFixed(2)} … ${st.p[4].toFixed(2)} Ω; ${m1.ms.toFixed(0)} ms; seed 7 mean ${m3.stats.zdiff.mean.toFixed(3)}`);
  }
  t.note(lines.join('\n'));
}

function budgets(t) {
  const lines = ['Budgets (engine.md §10; Node, one run each, the inverse a median of 3):'];
  const row = (task, what, ms, budget, extra) => {
    t.ok(ms <= budget, `${task} ${what}: ${ms.toFixed(0)} ms over the budget ${budget} ms`);
    lines.push(`  ${task.padEnd(18)} ${what.padEnd(42)} ${ms.toFixed(0).padStart(6)} ms  budget ${String(budget).padStart(5)}: ${ms <= budget ? 'pass' : 'FAIL'}  ${extra}`);
  };
  for (const [what, set, key, target, opt] of [['microstrip + mask (C39)', C39(), 'z0', 50, {}], ['pair + mask + coplanar ground', CPW(), 'zdiff', 90, {}],
    ['the same solved whole (as asymmetric)', CPW(), 'zdiff', 90, { mirror: false }]]) {
    const runs = [0, 1, 2].map(() => IV.inverse(set, key, target, 'w', opt)).sort((a, b) => a.ms - b.ms);
    row('inverse', what, runs[1].ms, 300, `${runs[1].solves.coarse} coarse + ${runs[1].solves.fine} fine solves`);
  }
  const N = 100, span = (a, b) => Array.from({ length: N }, (_, i) => a + ((b - a) * i) / (N - 1));
  for (const [what, set, id, xs] of [['microstrip + mask (C39)', C39(), 'w', span(0.08, 0.2)], ['pair + mask + coplanar ground', CPW(), 'w', span(0.08, 0.14)],
    ['asymmetric pair + mask + coplanar ground', ASYM(), 'sig2.w', span(0.1, 0.14)]]) {
    const r = V.runAll(V.sweep(set, id, xs));
    t.ok(r.ok, `sweep ${what}: ${r.reason}`);
    row('sweep 100 points', what, r.ms, 2000, `${r.solves.fine} fine + ${r.solves.coarse} coarse`);
  }
  for (const [what, set] of [['microstrip + mask (C39)', C39()], ['pair + mask + coplanar ground', CPW()], ['asymmetric pair + mask + coplanar ground', ASYM()]]) {
    const r = V.runAll(V.monteCarlo(set));
    t.ok(r.ok && r.samples === 1000, `Monte Carlo ${what}: ${r.reason}`);
    row('Monte Carlo 1000', what, r.ms, 20000, `${(r.ms / 1000).toFixed(2)} ms a sample, ${r.inputs.length} inputs`);
  }
  t.note(lines.join('\n'));
}

export function run(t) {
  inverse(t);
  sweeps(t);
  tolerance(t);
  budgets(t);
}
