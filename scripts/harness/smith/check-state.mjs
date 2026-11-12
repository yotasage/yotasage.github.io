// Checks of lib/smith/state.ts (step M3.1), run by check.mjs with its counters: the link round trip on 10,000 random
// circuits to the bit (values spread over 1e-15…1e15, random doubles from their bits, 0 and ∞), only characters a
// query holds unescaped; numText's form; 1,000 broken links (each with at least one defect) and 1,000 random strings
// read without throwing, every result a usable circuit and every broken one with a reason; the start state D16 at the
// centre (|Γin| < 1e-9) by an independent impedance computation; the three value forms of every kind back and forth.

import * as importedState from '../../../lib/smith/state.ts';
import * as importedParts from '../../../lib/smith/parts.ts';

const S = importedState.default ?? importedState;
const P = importedParts.default ?? importedParts;
const {
  encodeCircuit, decodeCircuit, defaultCircuit, sameCircuit, circuitProblem, numText, readNum, KIND_CODES, MAX_PARTS,
  formsOf, formValue, withForm, readForm, newPart, circuitInputGamma, movePart, insertPart, removePart,
} = S;
const { LINE, STUB_OPEN, STUB_SHORT, QUARTER, SERIES_C, SHUNT_L } = P;

const hasZc = (k) => k === LINE || k === STUB_OPEN || k === STUB_SHORT;
const view = new DataView(new ArrayBuffer(8));

export function runStateChecks({ section, ok, random }) {
  const rnd = random ?? Math.random;
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
}
