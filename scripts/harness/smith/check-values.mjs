// Checks of lib/smith/values.ts (step M4.1b, plan.md D17), run by check.mjs with its counters: the neighbours of a
// value in E6–E96 across decade edges (from 1e-13 to 1e7, so pF, nH and Ω alike) and in an own list (its ends), own
// lists read for every kind, the per-kind choice through its text form and back (and broken texts), and the
// standard-value variants of solutions re-evaluated here with network.ts.

import * as importedValues from '../../../lib/smith/values.ts';
import * as importedSolve from '../../../lib/smith/solve.ts';
import * as importedGoal from '../../../lib/smith/goal.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedSeries from '../../../lib/resistor/eseries.ts';

const VL = importedValues.default ?? importedValues;
const S = importedSolve.default ?? importedSolve;
const GL = importedGoal.default ?? importedGoal;
const P = importedParts.default ?? importedParts;
const N = importedNetwork.default ?? importedNetwork;
const ES = importedSeries.default ?? importedSeries;
const { around, candidates, parseOwnList, choiceToText, choiceFromText, defaultChoice, standardVariants, valueKindOf, VALUE_KINDS, LIST_IDS } = VL;
const { SERIES_L, SHUNT_C, SERIES_C, SHUNT_L, SERIES_R, LINE, QUARTER, packParts } = P;

export function runValueChecks({ section, ok, near, random }) {
  const pick = (a) => a[Math.floor(random() * a.length)];

  section('values: neighbours');
  {
    let bad = 0, n = 0;
    for (const id of ['E6', 'E12', 'E24', 'E48', 'E96']) {
      const mant = ES.series(id).mantissas;
      // Decade edges: just below and above every power of ten from 1e-13 to 1e7.
      for (let d = -13; d <= 7; d++) {
        const p10 = Number(`1e${d}`);
        const below = around(p10 * 0.999, { id }), above = around(p10 * 1.001, { id });
        const last = Number(`${mant[mant.length - 1]}e${d - 3}`), second = Number(`${mant[1]}e${d - 2}`);
        n += 2;
        if (!(below && ES.same(below.below, last) && ES.same(below.above, p10))) { bad++; ok(false, `${id}: below 10^${d}: ${JSON.stringify(below)}, wanted ${last} and ${p10}`); }
        if (!(above && ES.same(above.below, p10) && ES.same(above.above, second))) { bad++; ok(false, `${id}: above 10^${d}: ${JSON.stringify(above)}`); }
      }
      // Random values: the neighbours bracket the value, are in the series, and nothing of the series lies between.
      for (let k = 0; k < 2000; k++) {
        const v = 10 ** (-13 + 20 * random());
        const a = around(v, { id });
        n++;
        const between = ES.seriesValues(id, a.below, a.above).filter((x) => !ES.same(x, a.below) && !ES.same(x, a.above));
        if (!(a && !a.exact && a.below < v && v < a.above && ES.inSeries(a.below, id) && ES.inSeries(a.above, id) && between.length === 0)) {
          bad++; if (bad < 5) ok(false, `${id}: around ${v}: ${JSON.stringify(a)}, between ${between}`);
        }
      }
      // Exact values.
      const e = Number(`${mant[3]}e-11`);
      const a = around(e, { id });
      n++;
      if (!(a && a.exact && a.below === e && a.above === e)) { bad++; ok(false, `${id}: ${e} is exact`); }
      ok(candidates(e, { id }).length === 1 && candidates(e * 1.01, { id }).length === 2, `${id}: an exact value is its own candidate, another has two`);
    }
    ok(bad === 0, `E6–E96 neighbours across decades (${n} values, ${bad} bad)`);
    // M4.3b: around's fast search (four values round the mantissa's place) equals eseries.ts `neighbours` to the bit,
    // also on standard values, their ±1 ulp and decade edges; and it is cheap enough for every pointer move of a drag.
    {
      let diff = 0, m = 0;
      // A stream of its own: the solver's groups after this one keep their random problems.
      let seed = 4313026;
      const own = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      for (const id of ['E6', 'E12', 'E24', 'E48', 'E96']) {
        const vals = [];
        for (let k = 0; k < 3000; k++) vals.push(10 ** (-14 + 22 * own()));
        for (let d = -13; d <= 7; d++) for (const mt of ES.series(id).mantissas) { const v = Number(`${mt}e${d - 2}`); vals.push(v, v * (1 + 2 ** -52), v * (1 - 2 ** -53), v * (1 + 1e-10), v * (1 - 1e-10)); }
        for (const v of vals) {
          const a = around(v, { id }), b = ES.neighbours(v, id);
          m++;
          const want = b.exact ? { below: v, above: v, exact: true } : { below: b.below, above: b.above, exact: false };
          if (!(a && a.exact === want.exact && Object.is(a.below, want.below) && Object.is(a.above, want.above))) { diff++; if (diff < 4) ok(false, `${id}: around ${v}: ${JSON.stringify(a)} vs neighbours ${JSON.stringify(want)}`); }
        }
      }
      ok(diff === 0, `around equals eseries.ts neighbours (${m} values, ${diff} differ)`);
      const t0 = performance.now();
      let s = 0;
      for (let k = 0; k < 20000; k++) s += around(1e-12 * (1 + k * 0.37), { id: 'E96' }).above;
      const us = ((performance.now() - t0) * 1000) / 20000;
      ok(us < 5 && s > 0, `around in E96: ${us.toFixed(2)} µs per value (budget 5 µs)`);
    }
    // An own list: neighbours inside, the ends, exact.
    const own = { id: 'own', values: [1e-9, 2.2e-9, 4.7e-9, 10e-9] };
    const r1 = around(3e-9, own), r2 = around(0.5e-9, own), r3 = around(20e-9, own), r4 = around(4.7e-9, own);
    ok(r1.below === 2.2e-9 && r1.above === 4.7e-9 && !r1.exact, 'own list: between two values');
    ok(Number.isNaN(r2.below) && r2.above === 1e-9, 'own list: below its first value only one neighbour');
    ok(r3.below === 10e-9 && Number.isNaN(r3.above), 'own list: above its last value only one neighbour');
    ok(r4.exact, 'own list: a value of the list is exact');
    ok(candidates(0.5e-9, own).length === 1 && candidates(0.5e-9, own)[0] === 1e-9, 'own list: one candidate at an end');
    ok(around(3e-9, { id: 'any' }) === null && around(0, { id: 'E24' }) === null && around(Infinity, { id: 'E24' }) === null, 'no neighbours for any value, 0 or ∞');
    ok(valueKindOf(SERIES_L) === 'L' && valueKindOf(SHUNT_C) === 'C' && valueKindOf(SERIES_R) === 'R' && valueKindOf(QUARTER) === 'Z' && valueKindOf(LINE) === 'len' && valueKindOf(LINE, 'zc') === 'Z' && valueKindOf(-1, 'f0') === null, 'the list kind of each part kind');
  }

  section('values: own lists and the text form');
  {
    const l = parseOwnList('1n 1.2n 4n7 10nH 2,2n bogus', 'L');
    ok(JSON.stringify(l.values) === JSON.stringify([1e-9, 1.2e-9, 2.2e-9, 4.7e-9, 1e-8].map((v) => +v.toPrecision(15))) || l.values.length === 5, `an inductor list (${l.values})`);
    near(l.values[2], 2.2e-9, 'a decimal comma in a spaced list'); ok(l.rejected.length === 1 && l.rejected[0] === 'bogus', 'what does not read is rejected');
    const c = parseOwnList('1p,2.2p,4.7p;10pF', 'C');
    ok(c.values.length === 4 && ES.same(c.values[3], 1e-11), `a capacitor list separated by commas (${c.values})`);
    const r = parseOwnList('4k7 10k 22R 1M', 'R');
    ok(JSON.stringify(r.values) === JSON.stringify([22, 4700, 10000, 1e6]), `a resistor list with the resistor tool's reader (${r.values})`);
    const z = parseOwnList('50 75 100Ω', 'Z');
    ok(JSON.stringify(z.values) === JSON.stringify([50, 75, 100]), 'an impedance list');

    ok(choiceToText(defaultChoice()) === '', 'the defaults are the empty text');
    const d = choiceFromText('');
    ok(d.R.id === 'E24' && d.L.id === 'E24' && d.C.id === 'E24' && d.Z.id === 'any' && d.len.id === 'any', 'the defaults of D17');
    let same = 0;
    for (let k = 0; k < 500; k++) {
      const choice = defaultChoice();
      for (const kind of VALUE_KINDS) {
        const id = pick(LIST_IDS);
        if (id === 'own') {
          const values = [];
          for (let j = 1 + Math.floor(random() * 6); j > 0; j--) values.push(10 ** (-13 + 20 * random()));
          choice[kind] = { id, values: values.sort((a, b) => a - b) };
        } else choice[kind] = { id };
      }
      const text = choiceToText(choice), back = choiceFromText(text);
      if (JSON.stringify(back) === JSON.stringify(choice) && choiceToText(back) === text) same++;
      else if (same + 5 > k) ok(false, `round trip: ${JSON.stringify(choice)} → ${text} → ${JSON.stringify(back)}`);
    }
    ok(same === 500, `the choice round-trips through its text (${same} of 500)`);
    let fine = true;
    for (const t of ['R', 'Rx', 'Lo', 'Lo_', 'Co1e-9_x_2e-9', ',,,', 'Z7', 'N24,N12', '%%', 'R6,L96,C48', null, undefined, 'Lo-1_0_NaN']) {
      try { const c2 = choiceFromText(t); fine &&= VALUE_KINDS.every((kind) => LIST_IDS.includes(c2[kind].id)); } catch { fine = false; }
    }
    ok(fine, 'broken texts read without throwing');
    const c3 = choiceFromText('R6,L96,C48,Co1e-9_x_2e-9');
    ok(c3.R.id === 'E6' && c3.L.id === 'E96' && c3.C.id === 'own' && c3.C.values.length === 2, 'the last entry of a kind wins, unreadable values are left out');
  }

  section('values: standard-value variants');
  {
    const w2 = new Float64Array(2);
    const gammaOf = (circuit, parts, node, f) => {
      const nodes = new Float64Array((parts.length + 1) * 4);
      N.evaluate(nodes, packParts(parts), parts.length, circuit.loadR, circuit.loadX, circuit.z0, f, circuit.f0);
      N.nodeGamma(w2, 0, nodes, node * 4);
      return [w2[0], w2[1]];
    };
    let checked = 0, bad = 0, counts = {};
    const choice = defaultChoice();
    for (let k = 0; k < 300; k++) {
      const z0 = 50, f0 = 10 ** (6 + 3 * random()), w0 = 2 * Math.PI * f0;
      const loadR = z0 * 10 ** (2 * random() - 1), loadX = z0 * (4 * random() - 2);
      const kinds = [pick([SERIES_L, SERIES_C, SHUNT_L, SHUNT_C, SERIES_R]), pick([SERIES_L, SERIES_C, SHUNT_L, SHUNT_C])];
      const parts = kinds.map((kind) => ({ kind, value: kind === SERIES_R ? 10 : kind === SERIES_C || kind === SHUNT_L ? 1 / (w0 * 1e-3) : 1e-9 }));
      const circuit = { z0, f0, loadR, loadX, parts };
      const goal = k % 3 === 2 ? { kind: 'vswr', value: 1.5 } : { kind: 'point' };
      const unknowns = k % 3 === 1 ? [{ part: 1 }] : [{ part: 0 }, { part: 1 }];
      const res = S.solve(circuit, unknowns, k % 3 === 2 ? { kind: 'point' } : goal);
      for (const sol of res.solutions.slice(0, 2)) {
        const vars = standardVariants(circuit, goal, sol, choice);
        counts[vars.length] = (counts[vars.length] ?? 0) + 1;
        const node = res.goalNode;
        for (const v of vars) {
          const ps = parts.map((p) => ({ ...p }));
          sol.values.forEach((sv, i) => { ps[sv.part] = { kind: sv.kind, value: v.values[i] }; });
          const g = gammaOf(circuit, ps, node, f0);
          checked++;
          const lists = sol.values.map((sv) => VL.candidates(sv.value, choice[valueKindOf(sv.kind)]));
          const inList = v.values.every((x, i) => lists[i].includes(x));
          if (!(Math.abs(Math.hypot(g[0], g[1]) - v.gamma) <= 1e-12 && Math.abs(GL.goalResidual(goal, g[0], g[1], z0) - v.residual) <= 1e-12 && inList)) bad++;
        }
        const key = (v) => (goal.kind === 'point' ? v.mismatch : v.residual);
        ok(vars.every((v, i) => i === 0 || key(v) >= key(vars[i - 1])), `variants sorted by how near they come (${k})`);
        ok(vars.length === 2 ** sol.values.length || vars.some((v) => v.exact) || sol.values.some((sv) => !(sv.value > 0 && sv.value < Infinity)), `${vars.length} variants for ${sol.values.length} values (${k})`);
      }
    }
    ok(bad === 0, `variants re-evaluated by network.ts (${checked} variants, ${bad} bad)`);
    console.log(`values: ${checked} standard-value variants checked, counts by size ${JSON.stringify(counts)}`);
    // A solution on E24 values already: one exact variant.
    const circuit = { z0: 50, f0: 1e8, loadR: 25, loadX: 0, parts: [{ kind: SERIES_L, value: 47e-9 }] };
    const sol = { values: [{ part: 0, param: 'value', kind: SERIES_L, value: 47e-9, zc: 0 }] };
    const v1 = standardVariants(circuit, { kind: 'point' }, sol, choice);
    ok(v1.length === 1 && v1[0].exact && v1[0].values[0] === 47e-9, 'a value in the list is its own only variant');
    const v2 = standardVariants(circuit, { kind: 'mag', value: 0.5, within: true }, { values: [{ ...sol.values[0], value: 50e-9 }] }, choice);
    ok(v2.length === 2 && ES.same(v2[0].values[0], 47e-9) !== ES.same(v2[1].values[0], 47e-9) && v2.every((v) => v.meets === (v.gamma <= 0.5)), 'an inequality goal: both neighbours, met when |Γ| ≤ m');
    const v3 = standardVariants(circuit, { kind: 'point' }, { values: [{ part: -1, param: 'f0', kind: -1, value: 1.234e8, zc: 0 }] }, choice);
    ok(v3.length === 1 && v3[0].values[0] === 1.234e8, 'f0 has no list');
    void SHUNT_L; void SERIES_C;
  }
}
