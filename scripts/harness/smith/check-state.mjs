// Checks of lib/smith/state.ts (step M3.1), run by check.mjs with its counters: the link round trip on 10,000 random
// circuits to the bit (values spread over 1e-15…1e15, random doubles from their bits, 0 and ∞), only characters a
// query holds unescaped; numText's form; 1,000 broken links (each with at least one defect) and 1,000 random strings
// read without throwing, every result a usable circuit and every broken one with a reason; the start state D16 at the
// centre (|Γin| < 1e-9) by an independent impedance computation; the three value forms of every kind back and forth.
// M4.3a: the solver's unknowns and goal (the circuit's ask) through the link, broken u and g, toggles and edits.

import * as importedState from '../../../lib/smith/state.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedValues from '../../../lib/smith/values.ts';

const S = importedState.default ?? importedState;
const VL = importedValues.default ?? importedValues;
const P = importedParts.default ?? importedParts;
const {
  encodeCircuit, decodeCircuit, defaultCircuit, sameCircuit, circuitProblem, numText, readNum, KIND_CODES, MAX_PARTS,
  formsOf, formValue, withForm, readForm, newPart, circuitInputGamma, movePart, insertPart, removePart,
} = S;
const { LINE, STUB_OPEN, STUB_SHORT, QUARTER, SERIES_C, SERIES_L, SHUNT_L } = P;

const hasZc = (k) => k === LINE || k === STUB_OPEN || k === STUB_SHORT;
const view = new DataView(new ArrayBuffer(8));

export function runStateChecks({ section, ok, random }) {
  const rndBox = { f: random ?? Math.random };
  const rnd = () => rndBox.f();
  // A positive double: log-uniform over 1e-15…1e15, or any finite positive double from its bits, or a short decimal.
  const pos = () => {
    const t = rnd();
    if (t < 0.5) return 10 ** (-15 + 30 * rnd());
    if (t < 0.8) {
      view.setUint32(0, Math.floor(rnd() * 0x7fefffff)); view.setUint32(4, Math.floor(rnd() * 2 ** 32));
      const v = view.getFloat64(0);
      return v > 0 && Number.isFinite(v) ? v : 1;
    }
    return Math.round(rnd() * 100000) / [1, 10, 1000, 1e6][Math.floor(rnd() * 4)] || 0.5;
  };
  const value = (kind) => {
    const t = rnd();
    if (kind === QUARTER) return pos();
    if (hasZc(kind)) return t < 0.05 ? 0 : t < 0.5 ? rnd() : pos() % 1e6;
    return t < 0.05 ? 0 : t < 0.1 ? Infinity : pos();
  };
  const circuit = () => {
    const n = Math.floor(rnd() * (MAX_PARTS + 1)), parts = [];
    for (let i = 0; i < n; i++) {
      const kind = Math.floor(rnd() * 10);
      parts.push(hasZc(kind) ? { kind, value: value(kind), zc: pos() } : { kind, value: value(kind) });
    }
    const r = rnd() < 0.05 ? Infinity : rnd() < 0.05 ? 0 : pos();
    const x = r === Infinity ? 0 : (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.05 ? 0 : pos());
    return { z0: pos(), f0: pos(), loadR: r, loadX: x === 0 ? 0 : x, parts };
  };

  section('state: link round trip');
  let exact = 0, clean = 0, quiet = 0, valid = 0;
  const SAFE = /^[A-Za-z0-9.:,=&_-]*$/;
  for (let i = 0; i < 10000; i++) {
    const c = circuit();
    const text = encodeCircuit(c);
    const back = decodeCircuit(`?${text}`);
    if (sameCircuit(c, back.circuit)) exact++; else if (exact + 5 > i) ok(false, `round trip of ${text}`);
    if (SAFE.test(text)) clean++;
    if (back.issues.length === 0 && back.linked) quiet++;
    if (!circuitProblem(c)) valid++;
  }
  ok(exact === 10000, `10,000 random circuits come back from the link to the bit (${exact})`);
  ok(clean === 10000, 'every link holds only characters a query keeps unescaped');
  ok(quiet === 10000, 'no issue is reported for a link the tool wrote');
  ok(valid === 10000, 'the generator makes usable circuits');

  section('state: number text');
  for (const [v, t] of [[1e8, '100e6'], [0.125, '0.125'], [50, '50'], [25e-12, '25e-12'], [1e-3, '0.001'], [999999, '999999'],
    [1e6, '1e6'], [Infinity, 'inf'], [0, '0'], [-1.5e-9, '-1.5e-9'], [123456789, '123.456789e6'], [5e-324, '5e-324'], [0.0001, '100e-6']]) {
    ok(numText(v) === t, `numText(${v}) is ${t} (got ${numText(v)})`);
  }
  let readBack = 0;
  for (let i = 0; i < 20000; i++) {
    view.setUint32(0, Math.floor(rnd() * 0x7fefffff) | (rnd() < 0.5 ? 0x80000000 : 0)); view.setUint32(4, Math.floor(rnd() * 2 ** 32));
    const v = view.getFloat64(0);
    if (!Number.isFinite(v)) { readBack++; continue; }
    if (Object.is(readNum(numText(v)), v === 0 ? 0 : v)) readBack++;
  }
  ok(readBack === 20000, `20,000 doubles from random bits read back exactly (${readBack})`);
  ok(readNum('100M') === 100e6 && Math.abs(readNum('4n7') - 4.7e-9) < 1e-24 && readNum('∞') === Infinity && readNum('1e+21') === 1e21 && readNum('1e 21') === 1e21,
    'readNum takes prefixes, letter decimals, ∞ and an exponent whose + became a space');

  section('state: broken links');
  const base = encodeCircuit(defaultCircuit());
  const breakers = [
    (s) => s.replace('z0=50', 'z0=abc'), (s) => s.replace('z0=50', 'z0=-5'), (s) => s.replace('z0=50', 'z0=0'), (s) => s.replace('z0=50', 'z0=inf'),
    (s) => s.replace('f0=100e6', 'f0=-1'), (s) => s.replace('f0=100e6', 'f0='), (s) => s.replace('zl=25:25', 'zl=25'.concat(':x')),
    (s) => s.replace('zl=25:25', 'zl=-1:0'), (s) => s.replace('zl=25:25', 'zl=1:2:3'), (s) => s.replace('zl=25:25', 'zl=5:inf'),
    (s) => s.replace('p=', 'p=zz:1,'), (s) => s.replace('p=', 'p=ls,'), (s) => s.replace('p=', 'p=ls:-1,'), (s) => s.replace('p=', 'p=tl:0.1,'),
    (s) => s.replace('p=', 'p=tl:0.1:0,'), (s) => s.replace('p=', 'p=qw:0,'), (s) => s.replace('p=', 'p=tl:inf:50,'), (s) => s.replace('p=', 'p=cs:1:2,'),
    (s) => s.replace('v=1', 'v=2'), (s) => s.replace('v=1', 'v=x'), (s) => `${s}&foo=1`, (s) => `${s}&z0=75`,
    (s) => s.replace('p=', `p=${Array(MAX_PARTS + 1).fill('rs:1').join(',')},`), (s) => s.replace('p=', 'p=,'), (s) => s.replace('p=', 'p=ls:%ZZ,'),
    (s) => s.replace('f0=100e6', 'f0=1e999'), (s) => s.replace('p=', 'p=so:nan:50,'),
  ];
  let reasons = 0, usable = 0, thrown = 0;
  for (let i = 0; i < 1000; i++) {
    let s = base;
    const defects = 1 + Math.floor(rnd() * 3);
    for (let d = 0; d < defects; d++) s = breakers[Math.floor(rnd() * breakers.length)](s);
    try {
      const r = decodeCircuit(s);
      if (r.issues.length > 0 && r.issues.every((t) => typeof t === 'string' && t.length > 4)) reasons++;
      else if (reasons + 5 > i) ok(false, `no reason for ${s}`);
      if (!circuitProblem(r.circuit)) usable++;
    } catch (e) { thrown++; if (thrown < 4) ok(false, `${s} threw ${e}`); }
  }
  ok(thrown === 0, '1,000 broken links never throw');
  ok(reasons === 1000, `every broken link says why (${reasons})`);
  ok(usable === 1000, 'every broken link still gives a usable circuit');
  const chars = '?&=:,.-_%+eE0123456789abcdefghijklmnopqrstuvwxyzpvzlinf∞ #';
  let randomOk = 0;
  for (let i = 0; i < 1000; i++) {
    let s = '';
    const len = Math.floor(rnd() * 60);
    for (let j = 0; j < len; j++) s += chars[Math.floor(rnd() * chars.length)];
    if (rnd() < 0.5) s = `v=1&p=${s}`;
    try { const r = decodeCircuit(s); if (!circuitProblem(r.circuit) && (r.issues.length > 0 || r.linked || [...new URLSearchParams(s).keys()].length === 0)) randomOk++; else if (randomOk + 5 > i) ok(false, `random ${s}`); } catch (e) { ok(false, `random ${s} threw ${e}`); }
  }
  ok(randomOk === 1000, `1,000 random strings decode to usable circuits (${randomOk})`);
  const empty = decodeCircuit('');
  ok(!empty.linked && empty.issues.length === 0 && sameCircuit(empty.circuit, defaultCircuit()), 'an empty query is the start state, without issues');
  const partial = decodeCircuit('?zl=100:0');
  ok(partial.circuit.loadR === 100 && partial.circuit.parts.length === 2 && partial.issues.length === 0, 'a missing parameter takes its start value');
  const none = decodeCircuit('?v=1&p=');
  ok(none.circuit.parts.length === 0 && none.issues.length === 0, 'p= is a circuit without parts');

  section('state: start state D16');
  const d = defaultCircuit();
  ok(d.z0 === 50 && d.f0 === 100e6 && d.loadR === 25 && d.loadX === 25 && d.parts.length === 2, 'Z0 50 Ω, f0 100 MHz, load 25 + j25 Ω, two parts');
  ok(d.parts[0].kind === SERIES_C && d.parts[1].kind === SHUNT_L, 'a series C at the load, then a shunt L');
  const g = [0, 0];
  circuitInputGamma(g, 0, d);
  ok(Math.hypot(g[0], g[1]) < 1e-9, `the input |Γ| of the start state is below 1e-9 (${Math.hypot(g[0], g[1])})`);
  // Independently: Z = 25 + j25 + 1/(jωC), then Y = 1/Z + 1/(jωL), Zin = 1/Y.
  const w = 2 * Math.PI * d.f0, C = d.parts[0].value, L = d.parts[1].value;
  const zr = 25, zi = 25 - 1 / (w * C), den = zr * zr + zi * zi;
  const yr = zr / den, yi = -zi / den - 1 / (w * L), yden = yr * yr + yi * yi;
  const Zr = yr / yden, Zi = -yi / yden;
  ok(Math.abs(Zr - 50) < 1e-9 && Math.abs(Zi) < 1e-9, `Zin by hand is 50 Ω (${Zr} + j${Zi})`);
  ok(Math.abs(C - 1 / (w * 50)) <= 1e-25 && Math.abs(L - 50 / w) <= 1e-22, 'C = 1/(ω·50 Ω) and L = 50 Ω/ω');

  section('state: value forms');
  let forms = 0, formsOk = 0;
  for (let i = 0; i < 4000; i++) {
    // Frequencies and Z0 of real circuits: ω must stay finite (a random double can make 2πf overflow).
    const c = { ...circuit(), f0: 10 ** (3 + 9 * rnd()), z0: 1 + 500 * rnd() };
    const kind = Math.floor(rnd() * 10);
    const p = newPart(kind, c);
    if (hasZc(kind)) p.zc = 10 + rnd() * 100;
    if (kind === QUARTER) p.value = 10 + rnd() * 100;
    else if (hasZc(kind)) p.value = 0.01 + rnd() * 0.23;
    else p.value *= 10 ** (rnd() * 4 - 2);
    for (const form of formsOf(kind)) {
      forms++;
      const v = formValue(form.id, p, c);
      const q = withForm(form.id, p, v, c);
      if (typeof q !== 'string' && (q.value === p.value || Math.abs(q.value - p.value) <= 1e-12 * Math.abs(p.value)) && q.zc === p.zc) formsOk++;
      else if (forms - formsOk < 5) ok(false, `${KIND_CODES[kind]} ${form.id}: ${p.value} → ${v} → ${typeof q === 'string' ? q : q.value}`);
    }
  }
  ok(forms === formsOk, `every form of 4,000 random parts gives the value back to 1e-12 (${formsOk} of ${forms})`);
  const c0 = defaultCircuit();
  const ls = newPart(1, c0), cs = newPart(SERIES_C, c0);
  ok(typeof withForm('X', ls, -5, c0) === 'string' && typeof withForm('n', cs, 0.5, c0) === 'string', 'a series L refuses x < 0, a series C x > 0, with a reason');
  const open = withForm('n', cs, 0, c0);
  ok(typeof open !== 'string' && open.value === Infinity, 'x = 0 of a series C is C = ∞');
  ok(Math.abs(readForm(formsOf(SERIES_C)[0], '31.83p') - 31.83e-12) < 1e-24 && readForm(formsOf(SERIES_C)[0], '31.83 pH') === null
    && readForm(formsOf(LINE)[0], '0.125 λ') === 0.125 && readForm(formsOf(LINE)[1], '45°') === 45 && readForm(formsOf(SERIES_C)[2], '2 Ω') === null,
  'fields read their own unit and refuse another');

  section('state: edits');
  const e = defaultCircuit();
  const added = insertPart(e, 1, newPart(LINE, e));
  ok(added.parts.length === 3 && added.parts[1].kind === LINE && e.parts.length === 2, 'insertPart adds at its index and leaves the old circuit');
  const moved = movePart(added, 1, 0);
  ok(moved.parts[0].kind === LINE && moved.parts[1].kind === SERIES_C, 'movePart moves towards the load');
  ok(removePart(moved, 0).parts.length === 2 && removePart(moved, 0).parts[0].kind === SERIES_C, 'removePart removes the part');

  // M3.3b: the draw tool's start part and the handles' arrow-key steps, against values written out by hand.
  section('state: draw and key steps');
  const gIn = (c) => { const g = [0, 0]; S.circuitInputGamma(g, 0, c); return g; };
  for (let r = 0; r < 200; r++) {
    const c = { z0: 50, f0: 1e6 * (1 + 999 * random()), loadR: 200 * random(), loadX: 300 * (random() - 0.5), parts: [newPart(LINE, e)] };
    const before = gIn(c);
    for (let k = 0; k < QUARTER; k++) {
      const after = gIn({ ...c, parts: [...c.parts, S.startPart(k, c)] });
      ok(Math.hypot(after[0] - before[0], after[1] - before[1]) < 1e-12, `startPart(${k}) leaves the input where it was (${after} vs ${before})`);
    }
  }
  ok(S.startPart(QUARTER, e).value === 50, 'a drawn λ/4 starts at Zt = Z0');
  const E24 = [100, 110, 120, 130, 150, 160, 180, 200, 220, 240, 270, 300, 330, 360, 390, 430, 470, 510, 560, 620, 680, 750, 820, 910];
  const step = (k, v, up, coarse = false, ms = E24) => S.stepValue(k, v, up, coarse, ms, e);
  ok(step(1, 79.57747154594767e-9, true) === 82e-9 && step(1, 79.57747154594767e-9, false) === 75e-9, 'E24 steps from 79.58 nH: 82 nH up, 75 nH down');
  ok(step(0, 910, true) === 1000 && step(0, 100, false) === 91 && step(2, 33e-12, true) === 36e-12 && step(2, 33e-12, false) === 30e-12, 'E24 steps cross decades and leave standard values exactly');
  ok(step(0, 47, true, true) === 470 && step(5, 2.2e-12, false, true) === 0.22e-12, 'Shift: a decade of E24 steps');
  ok(step(2, Infinity, false) === newPart(SERIES_C, e).value && step(0, 0, true) === newPart(0, e).value, 'from 0 or ∞ the first step lands on newPart');
  ok(step(0, 100, true, false, null) === 100 * S.KEY_FACTOR && step(0, 100, false, true, null) === 100 / S.KEY_FACTOR_COARSE, 'without standard values: factors');
  ok(step(LINE, 0.125, true) === 46 / 360 && step(LINE, 0.125, false) === 44 / 360 && step(LINE, 0.125, true, true) === 5 / 36 && step(STUB_SHORT, 0.1, false, true) === 3 / 36,
    'lengths step to the next whole degree (Shift: 10°)');
  ok(step(STUB_OPEN, 1 / 720, false) === 0 && step(LINE, 0, false, false, null) === 0 && step(LINE, 0.1, true, false, null) === 0.1 + 1 / 360, 'lengths never go below 0; ±1° without snapping');

  // Its own seeded stream: the groups after this one (the solver's random problems) keep the problems they had.
  let seed = 4302026;
  const own = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const saved = rndBox.f;
  rndBox.f = own;
  try { runAskChecks({ section, ok, rnd: own, circuit, pos }); } finally { rndBox.f = saved; }
  // M4.3b, also on a stream of its own.
  let seed2 = 4312026;
  const own2 = () => { seed2 = (seed2 + 0x6d2b79f5) >>> 0; let t = seed2; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  rndBox.f = own2;
  try { runListsChecks({ section, ok, rnd: own2, circuit }); } finally { rndBox.f = saved; }
}

// M4.3b: the value lists (vl) beside the circuit in the link, as the page writes them (a '+' as %2B).
function runListsChecks({ section, ok, rnd, circuit }) {
  section('state: value lists in the link (M4.3b)');
  const kinds = VL.VALUE_KINDS, ids = VL.LIST_IDS;
  const pageLink = (c, choice) => { const t = VL.choiceToText(choice); return `?${encodeCircuit(c)}${t ? `&${S.LISTS_PARAM}=${t.replace(/\+/g, '%2B')}` : ''}`; };
  let trips = 0, quiet = 0, same = 0;
  for (let i = 0; i < 2000; i++) {
    const choice = VL.defaultChoice();
    for (const k of kinds) {
      if (rnd() < 0.5) continue;
      const id = ids[Math.floor(rnd() * ids.length)];
      if (id !== 'own') { choice[k] = { id }; continue; }
      const values = Array.from({ length: 1 + Math.floor(rnd() * 12) }, () => (rnd() < 0.1 ? 10 ** (300 * rnd() - 150) : 10 ** (-13 + 20 * rnd())) * (1 + rnd()));
      choice[k] = { id: 'own', values: values.sort((a, b) => a - b) };
    }
    const c = circuit(), d = decodeCircuit(pageLink(c, choice));
    const back = VL.choiceFromText(d.lists ?? '');
    // The text holds every value as JavaScript writes it, so equal texts are equal lists to the bit.
    if (VL.choiceToText(back) === VL.choiceToText(choice) && kinds.every((k) => back[k].id === choice[k].id)) trips++;
    if (d.issues.length === 0) quiet++;
    if (sameCircuit(d.circuit, c)) same++;
  }
  ok(trips === 2000 && quiet === 2000 && same === 2000, `2,000 random value-list choices through the link: ${trips} read back, ${quiet} without issues, ${same} circuits unchanged`);
  const only = decodeCircuit('?vl=L12,C6');
  ok(only.lists === 'L12,C6' && !only.linked && only.issues.length === 0, `a link with only vl is no circuit link and has no issue: ${JSON.stringify(only.issues)}`);
  ok(decodeCircuit(`?${encodeCircuit(defaultCircuit())}`).lists === null, 'a link without vl has no lists (the page then reads localStorage)');
  const bad = VL.choiceFromText(decodeCircuit('?vl=Q9,L77,Co,Cx_1').lists);
  ok(VL.choiceToText(bad) === '', `broken vl tokens keep the defaults: ${VL.choiceToText(bad)}`);
  const big = decodeCircuit(`?vl=${'Co1e-12_2.2e+21'.replace(/\+/g, '%2B')}`);
  ok(VL.choiceFromText(big.lists).C.values[1] === 2.2e21, `an exponent's '+' survives the link: ${big.lists}`);

  // M7.2a: the sweep (sw, mk) beside the circuit, as the page writes it (linkSearch appends sweepParams).
  section('state: the sweep in the link (M7.2a)');
  let sTrips = 0, sQuiet = 0, sSame = 0;
  for (let t = 0; t < 2000; t++) {
    const c = circuit();
    const log = rnd() < 0.5, start = log ? 10 ** (3 + 7 * rnd()) : (rnd() < 0.1 ? 0 : 10 ** (3 + 7 * rnd()));
    const stop = (start || 1e3) * (1 + 1e-3 + 100 * rnd()), points = 2 + Math.floor(rnd() * (S.SWEEP_MAX_POINTS - 1));
    const band = { start, stop, points, log };
    if (S.bandIssue(band)) continue;
    const markers = Array.from({ length: Math.floor(rnd() * (S.MAX_MARKERS + 1)) }, () => (rnd() < 0.2 ? (rnd() < 0.5 ? start : stop) : start + (stop - start) * rnd()));
    const d = decodeCircuit(`?${encodeCircuit(c)}${S.sweepParams({ band, markers })}`);
    sTrips++;
    if (d.issues.length === 0) sQuiet++;
    const b = d.sweep?.band;
    if (b && b.start === start && b.stop === stop && b.points === points && b.log === log && d.sweep.markers.length === markers.length
      && d.sweep.markers.every((f, i) => f === markers[i]) && sameCircuit(d.circuit, c)) sSame++;
  }
  ok(sTrips > 1900 && sQuiet === sTrips && sSame === sTrips, `random sweeps through the link: ${sTrips} written, ${sQuiet} without issues, ${sSame} read back to the bit with the circuit unchanged`);
  const none = decodeCircuit(`?${encodeCircuit(defaultCircuit())}`);
  ok(none.sweep === null && none.issues.length === 0, 'an old link (no sw) has no sweep and no issue');
  const swOnly = decodeCircuit('?sw=50e6:150e6:401');
  ok(swOnly.sweep && !swOnly.linked && swOnly.issues.length === 0 && swOnly.sweep.band.points === 401 && !swOnly.sweep.band.log, 'a link with only sw is no circuit link, without issues');
  const bads = ['?sw=1e6:1e9', '?sw=0:1e9:101:log', '?sw=2e6:1e6:101', '?sw=1e6:2e6:1', '?sw=1e6:2e6:10001', '?sw=1e6:2e6:10.5', '?sw=x:2e6:11', '?sw=1e6:2e6:11:lin', '?mk=1e6'];
  for (const q of bads) {
    const d = decodeCircuit(q);
    ok(d.sweep === null && d.issues.length === 1, `${q}: no sweep, one issue: ${JSON.stringify(d.issues)}`);
  }
  const out = decodeCircuit('?sw=1e6:2e6:11&mk=1.5e6,3e6,abc,1M');
  ok(out.sweep && out.sweep.markers.join() === '1500000,1000000' && out.issues.length === 2, `markers outside the band or unreadable are left out: ${JSON.stringify(out)}`);
  const many = decodeCircuit(`?sw=1e6:2e6:11&mk=${Array.from({ length: 12 }, (_, i) => 1e6 + i * 1e4).join(',')}`);
  ok(many.sweep.markers.length === S.MAX_MARKERS && many.issues.length === 1, `at most ${S.MAX_MARKERS} markers: ${many.sweep.markers.length}`);
  ok(S.sweepParams(null) === '' && S.sweepParams({ band: { start: 1e6, stop: 1e9, points: 1001, log: true }, markers: [] }) === '&sw=1e6:1e9:1001:log', 'sweepParams writes the documented form');
}

// M4.3a: what the solver is asked (unknowns and goal) in the circuit, the link, the toggles and the edits.
function runAskChecks({ section, ok, rnd, circuit, pos }) {
  const isLC = (k) => k === 1 || k === 2 || k === 4 || k === 5;
  const randomAsk = (c) => {
    const n = c.parts.length, unknowns = [];
    const want = Math.floor(rnd() * 3);
    for (let t = 0; t < 8 && unknowns.length < want; t++) {
      if (rnd() < 0.15) { if (!unknowns.some((u) => u.param === 'f0')) unknowns.push({ part: -1, param: 'f0' }); continue; }
      if (!n) continue;
      const i = Math.floor(rnd() * n), k = c.parts[i].kind;
      const u = hasZc(k) && rnd() < 0.5 ? { part: i, param: 'zc' } : isLC(k) && rnd() < 0.5 ? { part: i, param: 'value', free: true } : { part: i, param: 'value' };
      if (!unknowns.some((w) => S.sameUnknown(w, u))) unknowns.push(u);
    }
    const kind = ['point', 'point', 'mag', 'vswr', 'rl', 'r', 'g', 'x', 'b'][Math.floor(rnd() * 9)];
    const goal = { kind };
    if (kind === 'point') {
      if (rnd() < 0.6) { goal.targetR = rnd() < 0.1 ? Infinity : rnd() < 0.1 ? 0 : pos(); goal.targetX = goal.targetR === Infinity ? 0 : (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.1 ? 0 : pos()); }
    } else if (rnd() < 0.8) {
      goal.value = kind === 'mag' ? rnd() : kind === 'vswr' ? 1 + pos() : kind === 'rl' ? (rnd() < 0.1 ? Infinity : 40 * rnd()) : kind === 'r' || kind === 'g' ? (rnd() < 0.1 ? Infinity : pos()) : (rnd() - 0.5) * pos();
    }
    if ((kind === 'mag' || kind === 'vswr' || kind === 'rl') && rnd() < 0.5) goal.within = true;
    if (rnd() < 0.4) goal.node = Math.floor(rnd() * (n + 1));
    return { unknowns, goal };
  };

  section('state: unknowns and goal in the link (M4.3a)');
  const SAFE = /^[A-Za-z0-9.:,=&_@-]*$/;
  let trips = 0, quiet = 0, safe = 0, asked = 0;
  for (let i = 0; i < 5000; i++) {
    const c = S.cleanAsk(circuit(), undefined);
    const a = S.cleanAsk(c, randomAsk(c));
    if (a.ask) asked++;
    const text = encodeCircuit(a);
    const back = decodeCircuit(`?${text}`);
    if (sameCircuit(a, back.circuit)) trips++; else if (trips + 5 > i) ok(false, `round trip of ${text} (${JSON.stringify(back.circuit.ask)}; ${back.issues.join('; ')})`);
    if (back.issues.length === 0) quiet++; else if (quiet + 5 > i) ok(false, `issues for ${text}: ${back.issues.join('; ')}`);
    if (SAFE.test(text)) safe++;
  }
  ok(trips === 5000 && asked > 3000, `5,000 random circuits with random unknowns and goals come back from the link (${trips}; ${asked} with an ask)`);
  ok(quiet === 5000 && safe === 5000, `no issues, only characters a query keeps unescaped (${quiet}, ${safe})`);

  const d = defaultCircuit();
  ok(!/[?&](u|g)=/.test(encodeCircuit(d)) && decodeCircuit(`?${encodeCircuit(d)}`).circuit.ask === undefined, 'a link without u and g is written and read as before (no ask)');
  ok(S.cleanAsk(d, { unknowns: [], goal: S.DEFAULT_GOAL }).ask === undefined && S.cleanAsk(d, { unknowns: [], goal: { kind: 'point', node: 2 } }).ask === undefined,
    'nothing marked and the centre at the input is no ask at all');
  const old = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83098861837907e-12,lp:79.57747154594767e-9';
  ok(sameCircuit(decodeCircuit(old).circuit, d) && decodeCircuit(old).issues.length === 0, 'an M3 link still reads the same');
  const ex = decodeCircuit(`${old}&u=1,2lc&g=vswr:1.5:within@1`);
  ok(ex.issues.length === 0 && JSON.stringify(ex.circuit.ask) === JSON.stringify({ unknowns: [{ part: 0, param: 'value' }, { part: 1, param: 'value', free: true }], goal: { kind: 'vswr', value: 1.5, within: true, node: 1 } }),
    () => `a hand-written u and g are read (${JSON.stringify(ex.circuit.ask)})`);
  ok(decodeCircuit(`${old}&g=pt:inf:5`).circuit.ask.goal.targetX === 0 && decodeCircuit(`${old}&g=pt@2`).circuit.ask === undefined, 'the open as a target; @input is the default');
  ok(decodeCircuit(`${old}&g=pt:100:-50@0&u=f0,2`).circuit.ask.unknowns[0].param === 'f0', 'f0 as an unknown, goal at the load');

  section('state: broken unknowns and goals');
  for (const [q, what] of [['u=3', 'no part 3'], ['u=1zc', 'a series C has no Zc'], ['u=2zc', 'a shunt L has no Zc'], ['u=1,1', 'marked twice'],
    ['u=1,2,f0', 'three unknowns'], ['u=x', 'not a token'], ['u=0', 'part 0'], ['g=foo', 'unknown kind'], ['g=vswr:0.5', 'VSWR below 1'], ['g=r:1:within', 'within on r'],
    ['g=pt:1', 'one number for a point'], ['g=vswr@9', 'no node 9'], ['g=mag:2', '|Γ| over 1'], ['g=x:inf', 'x of ∞'], ['g=pt:-1:0', 'negative R'], ['g=r:1:2', 'two numbers'],
    ['g=vswr:abc', 'not a number'], ['g=pt@1.5', 'node 1.5']]) {
    let r;
    try { r = decodeCircuit(`${old}&${q}`); } catch (err) { ok(false, `${q} threw ${err}`); continue; }
    ok(r.issues.length >= 1 && r.circuit.parts.length >= 1 && !circuitProblem(r.circuit), () => `${q} (${what}): an issue, a usable circuit (${r.issues.join('; ')})`);
  }
  let fuzz = 0;
  const CH = 'u=g&,:@0123456789fzclptwithinmagvswrx.-+% ';
  for (let i = 0; i < 2000; i++) {
    let s = `${old}&`;
    const len = Math.floor(rnd() * 30);
    for (let j = 0; j < len; j++) s += CH[Math.floor(rnd() * CH.length)];
    try {
      const r = decodeCircuit(s), a = r.circuit.ask;
      const fine = !circuitProblem(r.circuit) && (!a || (a.unknowns.length <= 2 && a.unknowns.every((u) => u.param === 'f0' || (u.part >= 0 && u.part < r.circuit.parts.length))));
      if (fine) fuzz++; else ok(false, `fuzz ${s}: ${JSON.stringify(a)}`);
    } catch (err) { ok(false, `fuzz ${s} threw ${err}`); }
  }
  ok(fuzz === 2000, `2,000 random u and g texts read without throwing into a usable ask (${fuzz})`);

  section('state: marking and edits keep the unknowns on their parts');
  const mk = (part, param = 'value', free) => (free ? { part, param, free } : { part, param });
  let c3 = { ...d, parts: [...d.parts, newPart(LINE, d)] };
  let t = S.toggleUnknown(c3, mk(0));
  t = S.toggleUnknown(t.circuit, mk(2, 'zc'));
  ok(t.dropped === null && t.circuit.ask.unknowns.length === 2, 'two marks');
  t = S.toggleUnknown(t.circuit, mk(-1, 'f0'));
  ok(t.dropped && t.dropped.part === 0 && t.circuit.ask.unknowns.map((u) => u.param).join() === 'zc,f0', 'a third mark replaces the oldest and says which');
  t = S.toggleUnknown(t.circuit, mk(-1, 'f0'));
  ok(t.dropped === null && t.circuit.ask.unknowns.length === 1, 'a second press unmarks');
  t = S.toggleUnknown(t.circuit, mk(2, 'zc'));
  ok(t.circuit.ask === undefined && sameCircuit(t.circuit, c3), 'unmarking everything leaves no ask');
  const fr = S.withFree(S.toggleUnknown(c3, mk(1)).circuit, 1, true);
  ok(fr.ask.unknowns[0].free === true && S.withFree(fr, 1, false).ask.unknowns[0].free === undefined, '"L or C" on and off');
  ok(S.unknownName(fr, fr.ask.unknowns[0]) === 'part 2’s L or C' && S.unknownName(c3, mk(2, 'zc')) === 'part 3’s Zc' && S.unknownName(c3, mk(-1, 'f0')) === 'f0', 'names of unknowns');
  const lineMarked = S.toggleUnknown(c3, mk(2, 'zc')).circuit;
  ok(S.withPart(lineMarked, 2, newPart(SERIES_C, d)).ask === undefined && S.withPart(lineMarked, 2, { ...lineMarked.parts[2], value: 0.3 }).ask.unknowns.length === 1,
    'a part turned into a kind without Zc drops its Zc mark; a new value keeps it');
  // Random edits: every unknown stays on the same part object; the goal's node stays in the circuit.
  let kept = 0;
  for (let r = 0; r < 1000; r++) {
    let c = S.cleanAsk(circuit(), undefined);
    if (c.parts.length < 2) c = { ...c, parts: [...c.parts, newPart(SERIES_C, c), newPart(LINE, c)] };
    c = S.cleanAsk(c, randomAsk(c));
    const before = (c.ask?.unknowns ?? []).map((u) => [u.param === 'f0' ? null : c.parts[u.part], u.param]);
    const op = Math.floor(rnd() * 3), n = c.parts.length, i = Math.floor(rnd() * n), j = Math.floor(rnd() * n);
    const next = op === 0 && n < MAX_PARTS ? insertPart(c, Math.floor(rnd() * (n + 1)), newPart(SERIES_L, c)) : op === 1 ? removePart(c, i) : movePart(c, i, j);
    const after = (next.ask?.unknowns ?? []).map((u) => [u.param === 'f0' ? null : next.parts[u.part], u.param]);
    const expect = before.filter(([p]) => p === null || next.parts.includes(p));
    const same = expect.length === after.length && expect.every(([p, q], k) => after[k][0] === p && after[k][1] === q);
    const node = next.ask?.goal.node;
    if (same && (node === undefined || (node >= 0 && node < next.parts.length))) kept++;
    else if (kept + 5 > r) ok(false, `edit ${op} ${i} ${j}: ${JSON.stringify(c.ask)} → ${JSON.stringify(next.ask)}`);
  }
  ok(kept === 1000, `1,000 random insert, remove and move edits keep every unknown on its part (${kept})`);
  const g3 = S.withGoal(c3, { kind: 'r', value: 1, node: 2 });
  ok(insertPart(g3, 0, newPart(SERIES_L, g3)).ask.goal.node === 3 && insertPart(g3, 3, newPart(SERIES_L, g3)).ask.goal.node === 2
    && removePart(g3, 0).ask.goal.node === 1 && removePart(g3, 2).ask.goal.node === undefined, 'the goal\'s node follows inserts and removals (the input stays the input)');
}
