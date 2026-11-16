// Stackup presets: JLCPCB's numbers as facts-fab.md §1 gives them, order and range checks, every number with a
// source, mirror symmetry, sums equal to JLCPCB's pressed thickness. Also: lib/emsim imports nothing of Node.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as P0 from '../../../lib/emsim/presets.ts';

const S = S0.default ?? S0;
const P = P0.default ?? P0;

// JLCPCB's pressed thickness (without mask): the sum of its API's layers (fetched 2026-11-16, M1.8b). Before M1.8b
// (GsuberlandStackups, 2025-05-09) the 6-layer ½ oz ones were 0.0076 mm thicker (centre prepreg) and the 2-layer board
// a 1.53 mm core with 0.035 mm copper (1.6).
const PRESSED = {
  'JLC061611-3313A': 1.637, 'JLC04161H-7628': 1.5862, 'JLC04161H-3313': 1.5642, 'JLC04161H-1080': 1.5182,
  'JLC04161H-2116': 1.5982, 'JLC06161H-3313A': 1.5384, 'JLC06161H-7628': 1.5544, 'JLC06161H-1080': 1.5864,
  'JLC06161H-2116A': 1.5564, 'JLC-2L-1.6': 1.49,
};

export function run(t) {
  const MIL = 0.0254;
  t.eq(P.PRESET_IDS.length, 10, 'ten presets');
  for (const id of P.PRESET_IDS) {
    const s = P.presetStackup(id);
    const issues = S.stackupIssues(s);
    t.ok(issues.length === 0, () => `${id}: ${JSON.stringify(issues)}`);
    // Every number has a preset source with date and URL.
    for (const { where, x } of S.stackupVals(s)) {
      t.ok(x.src && x.src.kind === 'preset' && x.src.id === id && x.src.date === '2026-11-16' && /^https:\/\//.test(x.src.url) && P.REFS[x.src.ref],
        () => `${id} ${where}: source ${JSON.stringify(x.src)}`);
      t.ok(x.tol === null, `${id} ${where}: JLCPCB states no tolerance`);
    }
    const L = s.layers;
    t.ok(L[0].kind === 'mask' && L[L.length - 1].kind === 'mask', `${id}: masks outside`);
    const inner = L.slice(1, -1);
    let sum = 0;
    for (const l of inner) sum += l.t.v;
    t.near(sum, PRESSED[id], `${id}: layers add up to JLCPCB's pressed thickness`, 1e-9);
    // Mirror symmetry of the layers between the masks.
    for (let i = 0; i < inner.length; i += 1) {
      const a = inner[i];
      const b = inner[inner.length - 1 - i];
      t.ok(a.kind === b.kind && a.t.v === b.t.v && (a.kind !== 'dielectric' || (a.er.v === b.er.v && a.material === b.material)), `${id}: layer ${i + 1} mirrors`);
    }
    for (const l of L) {
      if (l.kind === 'dielectric') {
        t.ok(l.er.v >= 3.9 && l.er.v <= 4.6, `${id} ${l.id}: εr ${l.er.v} in JLCPCB's range`);
        t.ok(l.freq === null && l.tand === null, `${id} ${l.id}: frequency and tanδ not stated`);
      }
      if (l.kind === 'mask') {
        t.eq(l.er.v, 3.8, `${id} mask εr`);
        t.near(l.onLaminate.v, 1.2 * MIL, `${id} mask on laminate`);
        t.near(l.onCopper.v, 0.6 * MIL, `${id} mask over copper`);
        t.near(l.between.v, 1.2 * MIL, `${id} mask between`);
        t.ok(l.freq === null && l.tand === null, `${id} mask: frequency and tanδ not stated`);
      }
      if (l.kind === 'copper') {
        t.ok(l.etch.kind === 'offset' && Math.abs(l.etch.side.v - 0.35 * MIL) < 1e-15, `${id} ${l.id}: etch 0.35 mil per side`);
        const outer = S.isOuter(s, L.indexOf(l));
        if (outer) { t.eq(l.t.v, id === 'JLC-2L-1.6' ? 0.03 : 0.035, `${id} ${l.id}: outer copper as the API states it`); t.near(l.calc.v, 1.6 * MIL, `${id} ${l.id}: calculator 1.6 mil`); }
      }
    }
    // stackZ: the top is the total, faces in order.
    const z = S.stackZ(s);
    t.near(z[0], S.totalThickness(s), `${id}: stackZ total`);
    let mono = true;
    for (let i = 0; i < L.length; i += 1) if (!(z[i] > z[i + 1])) mono = false;
    t.ok(mono, `${id}: faces descend`);
  }
  // JLC061611-3313A in full (facts-fab.md §1.3).
  const a = P.presetStackup('JLC061611-3313A');
  const seq = a.layers.slice(1, -1).map((l) => (l.kind === 'copper' ? `Cu${l.t.v}` : `${l.material}:${l.t.v}:${l.er.v}`)).join(' ');
  t.eq(seq, 'Cu0.035 3313:0.092:4.1 Cu0.03 FR-4 core (NP-155F):0.13:4.17 Cu0.03 1080:0.069:3.91 FR-4 core, etched bare (NP-155F):0.865:4.55 1080:0.069:3.91 Cu0.03 FR-4 core (NP-155F):0.13:4.17 Cu0.03 3313:0.092:4.1 Cu0.035', '3313A layer by layer');
  const mid = a.layers.find((l) => l.kind === 'dielectric' && l.t.v === 0.865);
  t.ok(mid && mid.role === 'core' && mid.er.src.ref === 'A' && !mid.er.src.note, '3313A: the centre layer is a core etched bare, εr from the API');
  t.ok(a.layers[1].t.src.ref === 'A' && a.layers[1].t.src.url === P.REFS.A.url && P.refUrl('A', 'JLC061611-3313A') === P.REFS.A.url, '3313A thickness cites the calculator');
  t.ok(P.refUrl('G', 'JLC061611-3313A').endsWith('/raw_json/jlcpcb_6L_1.6mm_outer1oz_inner1oz_JLC061611-3313A.json'), 'refUrl G still gives the former data file (old links)');
  // Copies: editing one changes nothing else.
  a.layers[2].t.v = 9;
  t.eq(P.presetStackup('JLC061611-3313A').layers[2].t.v, 0.092, 'presetStackup returns a copy');
  t.eq(P.presetStackup('nope'), null, 'unknown preset');
  // Order and range checks find what is wrong.
  const bad = P.presetStackup('JLC04161H-7628');
  const L = bad.layers;
  [L[2], L[3]] = [L[3], L[2]];
  t.ok(S.stackupIssues(bad).some((i) => i.code === 'order'), 'swapped layers are an order error');
  const b2 = P.presetStackup('JLC04161H-7628');
  b2.layers[2].er.v = 0.5;
  b2.layers[1].t.v = -1;
  b2.layers.push({ ...b2.layers[0] });
  const codes = S.stackupIssues(b2).map((i) => i.code);
  t.ok(codes.includes('range') && codes.includes('id') && codes.includes('order'), () => `bad numbers and a third mask: ${codes}`);
  const b3 = P.presetStackup('JLC04161H-7628');
  b3.layers[1] = { ...b3.layers[1], base: S.val(0.02), plating: S.val(0.01) };
  t.ok(S.stackupIssues(b3).some((i) => i.code === 'copper'), 'base + plating ≠ finished');
  // Fill side: inner copper faces the prepreg.
  const f = P.presetStackup('JLC061611-3313A');
  const idx = (id) => f.layers.findIndex((l) => l.id === id);
  t.eq(S.fillSide(f, idx('L1')), 'up', 'L1 faces up'); t.eq(S.fillSide(f, idx('L6')), 'down', 'L6 faces down');
  t.eq(S.fillSide(f, idx('L2')), 'up', 'L2 (on its core) faces the 3313 above'); t.eq(S.fillSide(f, idx('L3')), 'down', 'L3 faces the 1080 below');
  // lib/emsim is client-side code: no node: or fs imports.
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../lib/emsim');
  for (const file of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
    const text = readFileSync(join(dir, file), 'utf8');
    t.ok(!/from ['"](node:|fs['"]|path['"])|require\(/.test(text), `lib/emsim/${file} imports nothing of Node`);
  }
}
