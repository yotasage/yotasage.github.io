// Link and project file: exact round trips (presets, KiCad stackups, ≥ 200 randomised setups with a fixed seed whose
// texts hold every awkward character), the short form of defaults, and reading of broken input that never throws;
// JLCPCB list stackups (M1.8c) by their key through a resolver, an unknown key, an edited one as layers.

import { existsSync, readFileSync } from 'node:fs';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as P0 from '../../../lib/emsim/presets.ts';
import * as T0 from '../../../lib/emsim/structure.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as K0 from '../../../lib/emsim/kicad.ts';
import * as E0 from '../../../lib/emsim/setup.ts';
import * as L0 from '../../../lib/emsim/link.ts';
import * as J0 from '../../../lib/emsim/project.ts';
import * as G0 from '../../../lib/emsim/jlcpcb.ts';
import { mulberry32 } from './check-geometry.mjs';

const S = S0.default ?? S0;
const P = P0.default ?? P0;
const T = T0.default ?? T0;
const V = V0.default ?? V0;
const K = K0.default ?? K0;
const E = E0.default ?? E0;
const L = L0.default ?? L0;
const J = J0.default ?? J0;
const G = G0.default ?? G0;

const SEED = 20261116;
const RANDOM_SETUPS = 250;

function roundTrip(t, x, label) {
  const link = L.encodeLink(x);
  const d = L.decodeLink(link);
  const ok1 = t.ok(d.issues.length === 0 && E.sameSetup(d.setup, x), () => `${label}: link round trip (${JSON.stringify(d.issues.slice(0, 3))}) ${link.slice(0, 300)}`);
  if (ok1) t.eq(L.encodeLink(d.setup), link, `${label}: the link is stable`);
  const url = `https://yotasage.github.io/em-sim/main?${link}#trace`;
  t.ok(E.sameSetup(L.decodeLink(url).setup, x), `${label}: read from a whole URL`);
  const text = J.projectJson(x, '2026-11-16');
  const o = J.openProject(text);
  t.ok(o.setup && !o.message && o.issues.length === 0 && o.version === 1 && E.sameSetup(o.setup, x), () => `${label}: project round trip (${o.message} ${JSON.stringify(o.issues.slice(0, 3))})`);
  t.eq(J.projectJson(o.setup, '2026-11-16'), text, `${label}: the project file is stable`);
  return link;
}

// --- Random setups ---

function randomSetup(rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const chars = ['a', 'Z', '0', ' ', "'", '!', '(', ')', ',', ':', '&', '=', '#', '%', '+', '?', '/', '"', '\\', 'µ', 'ε', '—', '✓', '😀', '-', '.', '_', '~', '\n'];
  const text = () => { let s = ''; const n = Math.floor(rnd() * 9); for (let i = 0; i < n; i += 1) s += pick(chars); return s; };
  const name = () => (rnd() < 0.6 ? pick(['L1', 'F.Cu', 'In1.Cu', 'dielectric 1', 'D3', 'x-y', '_a', '1abc']) + (rnd() < 0.3 ? text() : '') : text());
  const num = () => pick([() => rnd(), () => rnd() * 1e-6, () => -rnd() * 3, () => Math.floor(rnd() * 100), () => 1 / 3, () => 0, () => 1e21 * rnd(), () => 5e-324])();
  const source = () => {
    const r = rnd();
    if (r < 0.4) return { kind: 'typed' };
    if (r < 0.7) {
      const id = pick([...P.PRESET_IDS, text()]);
      const ref = pick(['U1', 'U2', 'U3', 'G', 'X']);
      const s = { kind: 'preset', id, ref, date: rnd() < 0.7 ? P.READ_DATE : text(), url: rnd() < 0.7 ? P.refUrl(ref, id) : `https://e.x/${text()}` };
      if (rnd() < 0.3) s.note = text();
      return s;
    }
    const s = { kind: 'kicad', file: text(), version: pick([20211014, 20260206, 2, 5]) };
    if (rnd() < 0.3) s.absent = true;
    if (rnd() < 0.3) s.placeholder = true;
    return s;
  };
  const val = () => {
    const r = rnd();
    return { v: num(), tol: r < 0.6 ? null : r < 0.8 ? { abs: Math.abs(num()) } : { rel: rnd() }, src: source() };
  };
  const opt = () => (rnd() < 0.5 ? null : val());
  const freq = () => (rnd() < 0.5 ? null : rnd() * 1e10);
  const layers = [];
  const nCu = 2 + Math.floor(rnd() * 7);
  if (rnd() < 0.8) layers.push({ kind: 'mask', id: 'MT', name: rnd() < 0.5 ? 'MT' : text(), material: text(), er: val(), tand: opt(), freq: freq(), onLaminate: val(), onCopper: val(), between: val() });
  for (let c = 0; c < nCu; c += 1) {
    const r = rnd();
    const etch = r < 0.3 ? { kind: 'none' } : r < 0.7 ? { kind: 'offset', side: val() } : { kind: 'factor', f: val() };
    layers.push({ kind: 'copper', id: `C${c}${rnd() < 0.2 ? text() : ''}`, name: name(), t: val(), base: opt(), plating: opt(), calc: opt(), etch, fill: pick([null, 'up', 'down']) });
    if (c < nCu - 1) {
      const nd = 1 + Math.floor(rnd() * 3);
      for (let d = 0; d < nd; d += 1) layers.push({ kind: 'dielectric', id: `D${c}.${d}`, name: name(), role: pick(['core', 'prepreg']), material: text(), t: val(), er: val(), tand: opt(), freq: freq() });
    }
  }
  if (rnd() < 0.8) layers.push({ kind: 'mask', id: 'MB', name: text(), material: '', er: val(), tand: opt(), freq: freq(), onLaminate: val(), onCopper: val(), between: val() });
  const stackup = { id: rnd() < 0.3 ? pick(P.PRESET_IDS) : rnd() < 0.5 ? '' : text(), name: text(), layers, finish: text(), controlled: rnd() < 0.5, thickness: opt() };
  const ids = layers.map((l) => l.id);
  const lid = () => (rnd() < 0.9 ? pick(ids) : text());
  const kind = pick(T.TRACE_KINDS).kind;
  const trace = {
    kind, layer: lid(), layer2: rnd() < 0.5 ? '' : lid(), below: rnd() < 0.3 ? '' : lid(), above: rnd() < 0.5 ? '' : lid(),
    w: val(), s: rnd() < 0.3 ? S.val(T.DEFAULT_S) : val(), g: rnd() < 0.3 ? S.val(T.DEFAULT_G) : val(), gw: opt(), masked: rnd() < 0.7, wall: opt(),
    signals: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ layer: lid(), w: val(), u: val() })),
    grounds: Array.from({ length: Math.floor(rnd() * 3) }, () => ({ layer: lid(), a: opt(), b: opt() })),
  };
  const via = {
    start: lid(), end: lid(), entry: lid(), exit: lid(), drill: val(), plating: val(), pitch: opt(),
    pads: Array.from({ length: Math.floor(rnd() * 5) }, () => ({ layer: lid(), d: opt() })),
    planes: Array.from({ length: Math.floor(rnd() * 3) }, lid),
    antipads: Array.from({ length: Math.floor(rnd() * 3) }, () => { const shape = pick(['round', 'oblong', 'joined']); return { layer: lid(), d: val(), shape, bridge: shape === 'joined' || rnd() < 0.2 ? val() : null }; }),
    backdrill: rnd() < 0.3 ? { side: pick(['top', 'bottom']), depth: val(), d: val() } : null,
    returns: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ x: val(), y: val(), drill: val(), pad: opt(), planes: Array.from({ length: Math.floor(rnd() * 3) }, lid) })),
    feeds: Array.from({ length: Math.floor(rnd() * 3) }, () => ({ layer: lid(), length: val(), angle: num() })),
  };
  return { stackup, trace, via };
}

export function run(t) {
  // The default setup is "v=1".
  const d = E.defaultSetup();
  t.eq(L.encodeLink(d), 'v=1', 'the default setup is the bare version');
  const empty = L.decodeLink('');
  t.ok(!empty.linked && empty.issues.length === 0 && E.sameSetup(empty.setup, d), 'an empty query is the default setup');
  t.ok(d.trace.w.v === 0.1377 && d.trace.layer === 'L1' && d.trace.below === 'L2', 'default: the owner’s 50R_SE microstrip on L1 over L2');
  // Every preset stackup with every structure kind and both vias.
  let n = 0;
  for (const id of P.PRESET_IDS) {
    const s = P.presetStackup(id);
    for (const k of T.TRACE_KINDS) {
      const trace = T.presetStructure(k.kind, s, 0.15);
      if (!trace) continue;
      for (const vk of V.VIA_PRESETS) {
        const x = { stackup: P.presetStackup(id), trace, via: V.presetVia(vk, s) };
        const link = roundTrip(t, x, `${id} ${k.kind} ${vk}`);
        if (n === 0) t.ok(link.includes(`s=${id}`) || id === P.DEFAULT_PRESET, 'a preset stackup is written as its id');
        n += 1;
      }
    }
  }
  // An edited preset is written in full and keeps its sources.
  const ed = E.defaultSetup();
  ed.stackup.layers[2].er = { v: 4.05, tol: { rel: 0.05 }, src: { kind: 'typed' } };
  ed.trace.wall = S.val(1.5);
  ed.via.backdrill = { side: 'bottom', depth: S.val(0.2), d: S.val(0.45) };
  const edLink = roundTrip(t, ed, 'edited preset');
  t.ok(edLink.includes('src=') && edLink.length < 4000, () => `edited preset link: ${edLink.length} characters`);
  t.note(`An edited 6-layer preset's link is ${edLink.length} characters; the default's is ${L.encodeLink(d).length}.`);
  // The owner's KiCad stackups.
  for (const stem of ['E:/OneDrive - NTNU/ULDAC/PCB/ARTI-CARRIER-PICO2/ARTI-CARRIER-PICO2', 'E:/OneDrive - NTNU/ULDAC/PCB/2026_ARTIFICER_TC1/2026_ARTIFICER_TC1']) {
    if (!existsSync(`${stem}.kicad_pcb`)) continue;
    const b = K.readKicadStackup(readFileSync(`${stem}.kicad_pcb`, 'utf8'), stem.split('/').pop() + '.kicad_pcb');
    const x = { stackup: b.stackup, trace: T.presetStructure('pair-microstrip', b.stackup, 0.11), via: V.presetVia('pair', b.stackup) };
    roundTrip(t, x, `${stem.split('/').pop()} KiCad stackup`);
  }
  // Randomised setups.
  const rnd = mulberry32(SEED);
  let good = 0;
  for (let i = 0; i < RANDOM_SETUPS; i += 1) {
    const x = randomSetup(rnd);
    const link = L.encodeLink(x);
    const back = L.decodeLink(link);
    const p = J.openProject(J.projectJson(x, '2026-11-16'));
    const same = back.issues.length === 0 && E.sameSetup(back.setup, x) && L.encodeLink(back.setup) === link && p.setup && E.sameSetup(p.setup, x);
    if (same) good += 1;
    else t.ok(false, `random setup ${i}: round trip differs (${JSON.stringify(back.issues.slice(0, 2))}) ${link.slice(0, 200)}`);
  }
  t.ok(good === RANDOM_SETUPS, `${good} of ${RANDOM_SETUPS} random setups round-trip exactly`);
  t.note(`${n} preset setups and ${good} of ${RANDOM_SETUPS} random setups (seed ${SEED}) round-trip exactly through link and project.`);
  // Broken input: never throws, gives the default with issues.
  const sample = L.encodeLink(ed);
  let threw = 0;
  for (let cut = 0; cut <= sample.length; cut += 1) {
    try { const r = L.decodeLink(sample.slice(0, cut)); if (!r.setup) threw += 1; } catch { threw += 1; }
  }
  const garbage = rnd;
  for (let i = 0; i < 300; i += 1) {
    let s = '';
    for (let k = 0; k < 60; k += 1) s += "v=1&s=t=via=src=()!,:'%abcL1.0-9e+_ "[Math.floor(garbage() * 38)];
    try { const r = L.decodeLink(s); if (!r.setup) threw += 1; } catch { threw += 1; }
    try { const o = J.openProject(s); if (!o) threw += 1; } catch { threw += 1; }
  }
  t.eq(threw, 0, 'no cut link and no garbage throws or loses the setup');
  const bad = L.decodeLink('v=1&s=(n:x,l:!((k:q)))&t=(k:nope)&via=!(1&zz=3&src=%E0%A4%A');
  const keys = bad.issues.map((i) => i.where).sort().join();
  t.ok(['s', 't', 'via', 'zz', 'src'].every((k) => keys.includes(k)) && E.sameSetup(bad.setup, d), () => `bad parts give issues and defaults: ${keys}`);
  t.ok(L.decodeLink('v=2').issues.some((i) => /newer/.test(i.message)), 'a newer link version is reported');
  t.ok(L.decodeLink('?v=1&t=(k:microstrip,l:L1,w:0.3)').setup.trace.w.v === 0.3, 'a hand-written part is read');
  // Project files.
  t.ok(/newer/.test(J.openProject('{"format":"yotasage-emsim","version":9,"setup":{}}').message), 'a newer project is refused');
  t.ok(/not a project/.test(J.openProject('{"format":"other"}').message), 'other JSON is refused');
  t.ok(/not valid JSON/.test(J.openProject('{oops').message), 'broken JSON is refused');
  t.ok(J.openProject(`https://yotasage.github.io/em-sim/main?${edLink}`).version === 0 && E.sameSetup(J.openProject(edLink).setup, ed), 'a pasted link opens as version 0');
  const pj = J.projectJson(ed, '2026-11-16');
  t.ok(JSON.parse(pj).link === edLink && pj.endsWith('\n'), 'the project file carries the link');
  // JLCPCB list stackups: by key with a resolver, as the page does once the list is loaded (M1.8c).
  const data = JSON.parse(readFileSync(new URL('../../../lib/emsim/jlcpcbStackups.json', import.meta.url), 'utf8'));
  const resolve = (key) => { const e = G.jlcFind(data, key); return e ? G.jlcStackup(e, data) : null; };
  const hand = new Set(Object.values(P.PRESET_KEYS));
  const picks = [data.stackups.find((e) => e.layers === 2 && !hand.has(G.jlcKey(e))), data.stackups.find((e) => e.layers === 8 && !hand.has(G.jlcKey(e))),
    data.stackups.find((e) => e.layers >= 16)].filter(Boolean);
  t.eq(picks.length, 3, 'list stackups to check: 2, 8 and 16+ layers');
  t.ok(!P.PRESET_IDS.some((id) => G.isJlcKey(id)) && data.stackups.every((e) => G.isJlcKey(G.jlcKey(e))), 'every list key looks like a key, no hand id does');
  for (const e of picks) {
    const key = G.jlcKey(e);
    const s = G.jlcStackup(e, data);
    const x = { stackup: s, trace: T.presetStructure('microstrip', s, 0.15), via: V.presetVia('single', s) };
    const link = L.encodeLink(x, resolve);
    t.ok(link.includes(`s=${key}&`) && !link.includes('src='), () => `${key}: written as its key (${link.slice(0, 160)})`);
    const back = L.decodeLink(link, resolve);
    t.ok(back.issues.length === 0 && E.sameSetup(back.setup, x) && L.encodeLink(back.setup, resolve) === link, () => `${key}: key round trip (${JSON.stringify(back.issues)})`);
    const pj2 = J.projectJson(x, '2026-11-16', resolve);
    const o = J.openProject(pj2, resolve);
    t.ok(o.setup && o.issues.length === 0 && E.sameSetup(o.setup, x) && JSON.parse(pj2).setup.s === key, `${key}: project round trip by key`);
    const plain = L.encodeLink(x);
    t.ok(!plain.includes(`s=${key}&`) && E.sameSetup(L.decodeLink(plain).setup, x), `${key}: without a resolver written as layers, read back the same`);
    const noList = L.decodeLink(link);
    t.ok(noList.issues.some((i) => i.where === 's' && /not loaded/.test(i.message)) && S.sameStackup(noList.setup.stackup, d.stackup), `${key}: read without the list gives an issue and the default stackup`);
    const ed2 = { ...x, stackup: S.cloneStackup(s) };
    ed2.stackup.layers[1].t = { v: 0.2, tol: null, src: { kind: 'typed' } };
    const el = L.encodeLink(ed2, resolve);
    const eb = L.decodeLink(el, resolve);
    t.ok(!el.includes(`s=${key}&`) && eb.issues.length === 0 && E.sameSetup(eb.setup, ed2), `${key}: edited, written as layers and read back exactly`);
  }
  const unknown = L.decodeLink('v=1&s=rigid_JLC9999_1.6_1_1', resolve);
  t.ok(unknown.issues.some((i) => i.where === 's' && /not in JLCPCB/.test(i.message)) && E.sameSetup(unknown.setup, d), 'an unknown key gives an issue and the default');
  const failing = L.decodeLink(`v=1&s=${G.jlcKey(picks[1])}`, () => { throw new Error('offline'); });
  t.ok(failing.issues.some((i) => /offline/.test(i.message)) && E.sameSetup(failing.setup, d), 'a list that fails to load gives its reason and the default');
  t.ok(L.decodeLink('v=1&s=JLC-2L-1.6', resolve).issues.length === 0 && L.encodeLink(d, resolve) === 'v=1', 'hand presets and the default link are unchanged with a resolver');
}
