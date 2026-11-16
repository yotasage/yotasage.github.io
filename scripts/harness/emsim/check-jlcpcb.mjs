// JLCPCB stackups (M1.8b): every entry of lib/emsim/jlcpcbStackups.json made into a Stackup by jlcStackup: no issues,
// one copper layer per layer, positive thicknesses, εr in the FR-4 range, the pressed sum against the finished
// thickness JLCPCB states, mirror symmetry kept, unique keys; every hand preset of presets.ts equal layer by layer to
// its entry; jlcpcb.ts and presets.ts never import the data (it is loaded with `await import` by the page).

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as P0 from '../../../lib/emsim/presets.ts';
import * as J0 from '../../../lib/emsim/jlcpcb.ts';

const S = S0.default ?? S0;
const P = P0.default ?? P0;
const J = J0.default ?? J0;
const LIB = join(dirname(fileURLToPath(import.meta.url)), '../../../lib/emsim');

// εr of JLCPCB's FR-4 family (Nan Ya NP-155F, Shengyi S1000-2M; 3.88–4.59 in the data): a value outside 3.5–5 is a
// misread column, not a material.
const ER_MIN = 3.5;
const ER_MAX = 5;

export function run(t) {
  const data = JSON.parse(readFileSync(join(LIB, 'jlcpcbStackups.json'), 'utf8'));
  t.ok(/^\d{4}-\d{2}-\d{2}$/.test(data.fetched.from) && /^\d{4}-\d{2}-\d{2}$/.test(data.fetched.to), 'fetch dates in the head');
  t.ok(data.source === P.REFS.A.url, 'the head names the calculator that ref A cites');
  t.ok(data.stackups.length > 1000, () => `${data.stackups.length} stackups`);

  const keys = new Set();
  const byLayers = {};
  let misses = 0;
  let worst = { d: 0, id: '' };
  let noFinished = 0;
  let asym = 0;
  for (const e of data.stackups) {
    const key = J.jlcKey(e);
    t.ok(!keys.has(key), `${key}: key unique`);
    keys.add(key);
    t.ok(/^[A-Za-z0-9._-]+$/.test(key), `${key}: key link-safe`);
    t.eq(J.jlcFind(data, key), e, `${key}: found by its key`);
    byLayers[e.layers] = (byLayers[e.layers] || 0) + 1;
    const s = J.jlcStackup(e, data);
    const issues = S.stackupIssues(s);
    t.ok(issues.length === 0, () => `${key}: ${JSON.stringify(issues)}`);
    const inner = s.layers.slice(1, -1);
    t.eq(inner.filter((l) => l.kind === 'copper').length, e.layers, `${key}: copper layers = layer count`);
    t.eq(inner.length, e.stack.length, `${key}: one layer per row`);
    let sum = 0;
    let good = true;
    for (const l of inner) {
      sum += l.t.v;
      if (!(l.t.v > 0)) good = false;
      if (l.kind === 'dielectric' && !(l.er.v >= ER_MIN && l.er.v <= ER_MAX)) good = false;
      for (const x of [l.t, l.kind === 'dielectric' ? l.er : l.calc ?? l.t]) {
        if (!(x.src.kind === 'preset' && x.src.id === key && P.REFS[x.src.ref] && x.src.date === data.fetched.to && x.src.url === P.refUrl(x.src.ref, key))) good = false;
      }
    }
    t.ok(good, `${key}: positive thicknesses, εr ${ER_MIN}–${ER_MAX}, every number cites JLCPCB with the fetch date`);
    const er = e.stack.filter((l) => l[0] !== 'cu').map((l) => l[2]);
    t.ok(inner.filter((l) => l.kind === 'dielectric').every((l, i) => l.er.v === er[i]), `${key}: εr as the entry states`);
    // Pressed sum against the finished thickness (or, without one, the nominal) ± its tolerance (or ±10 %).
    const target = e.finished ?? e.thickness;
    const tol = e.tol ? ('rel' in e.tol ? e.tol.rel * target : e.tol.abs) : 0.1 * target;
    if (e.finished === undefined) noFinished += 1;
    const d = sum - target;
    if (Math.abs(d) > tol + 1e-9) {
      misses += 1;
      if (Math.abs(d) > Math.abs(worst.d)) worst = { d, id: `${key} (sum ${sum.toFixed(4)}, ${e.finished === undefined ? 'nominal' : 'finished'} ${target})` };
    }
    // Mirror symmetry where the data is symmetric.
    const sym = e.stack.every((l, i) => JSON.stringify(l.slice(0, 4)) === JSON.stringify(e.stack[e.stack.length - 1 - i].slice(0, 4)));
    if (!sym) asym += 1;
    else {
      const mirrors = inner.every((a, i) => {
        const b = inner[inner.length - 1 - i];
        return a.kind === b.kind && a.t.v === b.t.v && (a.kind !== 'dielectric' || (a.er.v === b.er.v && a.role === b.role && a.material === b.material))
          && (a.kind !== 'copper' || (a.calc?.v ?? null) === (b.calc?.v ?? null));
      });
      t.ok(mirrors, `${key}: symmetric entry gives a mirrored stackup`);
    }
  }
  // Misses of the finished thickness are JLCPCB's own data (2-layer templates whose core does not follow the board
  // thickness), not the conversion: a miss is a failure only for the 4- to 64-layer boards.
  const multi = data.stackups.filter((e) => e.layers > 2).length;
  t.note(`${data.stackups.length} stackups (${Object.entries(byLayers).map(([k, n]) => `${k}L ${n}`).join(', ')}); ${asym} not mirror-symmetric in the data; ${noFinished} without a finished thickness (checked against the nominal ±10 %)`);
  t.note(`pressed sum outside finished ± tol: ${misses} of ${data.stackups.length}${misses ? `, worst ${worst.d.toFixed(4)} mm at ${worst.id}` : ''}`);
  let multiMiss = 0;
  for (const e of data.stackups) {
    if (e.layers <= 2) continue;
    const sum = e.stack.reduce((a, l) => a + l[1], 0);
    const target = e.finished ?? e.thickness;
    const tol = e.tol ? ('rel' in e.tol ? e.tol.rel * target : e.tol.abs) : 0.1 * target;
    if (Math.abs(sum - target) > tol + 1e-9) multiMiss += 1;
  }
  t.eq(multiMiss, 0, `pressed sum within finished ± tol for all ${multi} stackups of 4 layers and more`);

  // Every hand preset equal, layer by layer, to jlcStackup of its entry.
  t.eq(Object.keys(P.PRESET_KEYS).length, P.PRESET_IDS.length, 'every preset names its entry');
  for (const id of P.PRESET_IDS) {
    const key = P.PRESET_KEYS[id];
    const e = J.jlcFind(data, key);
    if (!t.ok(e, `${id}: entry ${key} exists`)) continue;
    const a = P.presetStackup(id);
    const b = J.jlcStackup(e, data);
    t.eq(a.layers.length, b.layers.length, `${id}: layer count`);
    const ref = (x) => (x ? `${x.v}|${x.src.ref}|${x.src.date}` : null);
    for (let i = 0; i < Math.min(a.layers.length, b.layers.length); i += 1) {
      const x = a.layers[i];
      const y = b.layers[i];
      const what = `${id} ${x.id}`;
      t.ok(x.kind === y.kind && x.id === y.id && x.name === y.name, () => `${what}: ${x.kind} ${x.id} "${x.name}" vs ${y.kind} ${y.id} "${y.name}"`);
      if (x.kind !== y.kind) continue;
      if (x.kind === 'mask') {
        t.ok(['er', 'onLaminate', 'onCopper', 'between'].every((f) => ref(x[f]) === ref(y[f])), `${what}: mask equal`);
      } else {
        t.ok(Math.abs(x.t.v - y.t.v) <= 1e-9 && x.t.src.ref === y.t.src.ref, () => `${what}: t ${x.t.v} vs ${y.t.v}`);
        if (x.kind === 'dielectric') {
          t.ok(x.er.v === y.er.v && x.role === y.role && x.material === y.material && x.er.src.ref === y.er.src.ref,
            () => `${what}: ${x.role} ${x.material} εr ${x.er.v} vs ${y.role} ${y.material} εr ${y.er.v}`);
        } else {
          t.ok(ref(x.calc) === ref(y.calc) && ref(x.etch.side) === ref(y.etch.side), `${what}: calculator copper and etch equal`);
        }
      }
    }
  }
  // JLC06161H-3313A: withdrawn by JLCPCB, yet its "No requirement" choice.
  const w = J.jlcFind(data, P.PRESET_KEYS['JLC06161H-3313A']);
  t.ok(w && w.note === 'withdrawn' && w.noReq, 'JLC06161H-3313A is marked withdrawn and is the "No requirement" choice');

  // The list helpers.
  const six = J.jlcFilter(data.stackups, { layers: 6, thickness: 1.6, outer: 1, inner: 0.5 });
  t.ok(six.length > 5 && six.every((e) => e.layers === 6 && e.thickness === 1.6 && e.outer === 1 && e.inner === 0.5), `filter: ${six.length} of 6 layers 1.6 mm 1/½ oz`);
  t.ok(J.jlcFilter(six, { withdrawn: false }).length === six.length - six.filter((e) => e.note === 'withdrawn').length, 'filter leaves out withdrawn ones');
  const sorted = J.jlcSort(data.stackups);
  t.eq(sorted.length, data.stackups.length, 'sort keeps every entry');
  t.eq(sorted.slice(0, P.PRESET_IDS.length).map(J.jlcKey).join(' '), Object.values(P.PRESET_KEYS).join(' '), 'sort: hand presets first, in their order');
  t.eq(J.jlcSort(sorted).map(J.jlcKey).join(' '), sorted.map(J.jlcKey).join(' '), 'sort is stable');
  const layers = J.jlcValues(data.stackups, 'layers');
  t.ok(layers[0] === 2 && layers.every((x, i) => i === 0 || x > layers[i - 1]), 'values: layer counts ascending');
  const groups = J.jlcGroup(data.stackups, 'layers');
  t.eq([...groups.values()].reduce((a, g) => a + g.length, 0), data.stackups.length, 'groups hold every entry once');
  t.eq(J.jlcValues(data.stackups, 'inner').at(-1), null, 'values: no inner copper (2 layers) last');

  // The data is never imported by lib/emsim (the page loads it with `await import`).
  for (const file of readdirSync(LIB).filter((x) => x.endsWith('.ts'))) {
    const text = readFileSync(join(LIB, file), 'utf8');
    t.ok(!/^\s*import[^;]*jlcpcbStackups/m.test(text) && !/require\([^)]*jlcpcbStackups/.test(text), `lib/emsim/${file} does not import the data`);
  }
}
