// Checks of lib/smith/explain.ts (step M5.4, "Explain this move"), run by check.mjs with its counters: for every part
// kind on 200 random circuits (the part at a random place among 0–4 random others, random loads with some opens,
// shorts and loads on the rim), the explanation's numbers against the engine (network.evaluate's nodes through
// convert.ts, parts.added; a series part keeps r and adds its x, a shunt part keeps g and adds its b), its circle
// against geometry.ts (partArc's centre and radius, and partLocus's circle), its sense against partArc's sweep (and a
// line's full turns), every equation id in the registry and the derivation with steps; then a random change of the
// value: explainMove's sense against the direction geometry travels (the signed angle summed about the locus circle's
// centre while the value walks from the old to the new one) and its |Γ| change against the engine.

import * as importedExplain from '../../../lib/smith/explain.ts';
import * as importedGeometry from '../../../lib/smith/geometry.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import * as importedEquations from '../../../lib/smith/equations.ts';

const X = importedExplain.default ?? importedExplain;
const G = importedGeometry.default ?? importedGeometry;
const P = importedParts.default ?? importedParts;
const N = importedNetwork.default ?? importedNetwork;
const cv = importedConvert.default ?? importedConvert;
const EQ = importedEquations.default ?? importedEquations;
const { explainPart, explainMove, movePath, withValue, CW, CCW, STRAIGHT } = X;
const { SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER, PART_KINDS, packParts, added, isSeries, isShunt } = P;
const { evaluate, nodeGamma, NODE_STRIDE } = N;
const { zFromGamma, yFromGamma } = cv;
const { partArcs, partLocus, locusPoint, circleCentre, LOCUS_STRIDE, L_A, L_MODE, LOCUS_MOBIUS, LOCUS_LINE, ARC_STRIDE, ARC_CX, ARC_CY, ARC_R, ARC_SWEEP, ARC_TURNS } = G;
const { EQUATION_BY_ID } = EQ;

const TAU = 2 * Math.PI;
const NAMES = ['series R', 'series L', 'series C', 'shunt R', 'shunt L', 'shunt C', 'line', 'open stub', 'short stub', 'λ/4'];
const PER_KIND = 200;

export function runExplainChecks({ section, ok, random }) {
  const logU = (lo, hi) => 10 ** (lo + (hi - lo) * random());
  const pick = (a) => a[Math.floor(random() * a.length)];
  const w = new Float64Array(8), cc = new Float64Array(3), loc = new Float64Array(LOCUS_STRIDE);
  const rel = (a, b, scale = 1) => Math.abs(a - b) / Math.max(scale, Math.abs(a), Math.abs(b));

  function valueOf(kind, z0, f0) {
    const w0 = TAU * f0, a = logU(-1.5, 1.5);
    switch (kind) {
      case SERIES_R: return { value: a * z0, zc: 0 };
      case SERIES_L: return { value: (a * z0) / w0, zc: 0 };
      case SERIES_C: return { value: 1 / (w0 * a * z0), zc: 0 };
      case SHUNT_R: return { value: z0 / a, zc: 0 };
      case SHUNT_L: return { value: z0 / (w0 * a), zc: 0 };
      case SHUNT_C: return { value: a / (w0 * z0), zc: 0 };
      case QUARTER: return { value: z0 * logU(-0.5, 0.5), zc: 0 };
      default: return { value: 1.5 * random(), zc: random() < 0.25 ? z0 : z0 * logU(-0.5, 0.5) };
    }
  }

  function circuitWith(kind) {
    const z0 = pick([50, 75, 1, 300]), f0 = logU(5, 10), n = Math.floor(random() * 5), at = Math.floor(random() * (n + 1));
    const parts = [];
    for (let k = 0; k < n; k++) { const kk = Math.floor(random() * PART_KINDS); parts.push({ kind: kk, ...valueOf(kk, z0, f0) }); }
    parts.splice(at, 0, { kind, ...valueOf(kind, z0, f0) });
    const u = random();
    const loadR = u < 0.04 ? Infinity : u < 0.08 ? 0 : u < 0.12 ? 0 : z0 * logU(-1.5, 1.5);
    const loadX = u >= 0.08 && u < 0.12 ? z0 * logU(-1, 1) : u < 0.08 ? 0 : z0 * (random() - 0.5) * 4;
    return { c: { z0, f0, loadR, loadX, parts }, at };
  }

  // The engine's node k: Γ, z, y.
  function nodeOf(nodes, k) {
    nodeGamma(w, 0, nodes, k * NODE_STRIDE);
    const gr = w[0], gi = w[1];
    zFromGamma(w, 2, gr, gi); yFromGamma(w, 4, gr, gi);
    return { gr, gi, zr: w[2], zi: w[3], yr: w[4], yi: w[5], mag: Math.hypot(gr, gi) };
  }

  const samePoint = (a, b) => ['gr', 'gi', 'mag'].every((k) => a[k] === b[k] || Math.abs(a[k] - b[k]) <= 1e-12)
    && ['zr', 'zi', 'yr', 'yi'].every((k) => a[k] === b[k] || (a[k] !== a[k] && b[k] !== b[k]) || rel(a[k], b[k]) <= 1e-9 || !(Math.abs(b[k]) < 1e12));

  section('explain: parts');
  let ids = 0, numbers = 0, circles = 0, senses = 0, stills = 0, straights = 0;
  let worstCircle = 0;
  const moves = { checked: 0, still: 0 };
  const stuck = [];
  for (let kind = 0; kind < PART_KINDS; kind++) {
    let bad = 0;
    for (let t = 0; t < PER_KIND; t++) {
      const { c, at } = circuitWith(kind);
      const count = c.parts.length, packed = packParts(c.parts), nodes = new Float64Array((count + 1) * NODE_STRIDE);
      evaluate(nodes, packed, count, c.loadR, c.loadX, c.z0, c.f0, c.f0);
      const arcs = new Float64Array(count * ARC_STRIDE);
      partArcs(arcs, nodes, packed, count, c.z0, c.f0, c.f0);
      const e = explainPart(c, at), p = c.parts[at], a = at * ARC_STRIDE;
      const zc = kind === QUARTER ? p.value : p.zc ?? c.z0;
      const where = `${NAMES[kind]} #${t} at ${at} of ${count}`;
      // Equation ids and the derivation.
      if (!e.equations.every((id) => EQUATION_BY_ID.has(id))) { bad++; stuck.push(`${where}: unknown equation id in ${e.equations}`); }
      if (!(EQUATION_BY_ID.get(e.derivation)?.steps.length > 0)) { bad++; stuck.push(`${where}: derivation ${e.derivation} has no steps`); }
      ids++;
      // Numbers: the nodes and what the part adds.
      const s = nodeOf(nodes, at), en = nodeOf(nodes, at + 1);
      const ad = added(kind, p.value, zc, c.f0, c.f0, c.z0);
      let good = samePoint(e.start, s) && samePoint(e.end, en) && (e.added === ad || (ad !== ad && e.added !== e.added));
      good &&= Math.abs(e.dMag - (en.mag - s.mag)) <= 1e-12;
      if (!e.still && Number.isFinite(s.zr) && Number.isFinite(en.zr) && Math.abs(s.zr) < 1e6 && Math.abs(en.zr) < 1e6 && Math.abs(ad) < 1e6) {
        const tol = 1e-7 * Math.max(1, Math.abs(s.zr), Math.abs(s.zi), Math.abs(en.zr), Math.abs(en.zi), Math.abs(s.yr), Math.abs(s.yi), Math.abs(en.yr), Math.abs(en.yi));
        if (kind === SERIES_L || kind === SERIES_C) good &&= Math.abs(e.kept - s.zr) <= tol && Math.abs(en.zr - e.kept) <= tol && Math.abs(e.to - e.from - ad) <= tol;
        if (kind === SERIES_R) good &&= Math.abs(e.kept - s.zi) <= tol && Math.abs(en.zi - e.kept) <= tol && Math.abs(e.to - e.from - ad) <= tol;
        if (kind === SHUNT_L || kind === SHUNT_C || kind === STUB_OPEN || kind === STUB_SHORT) good &&= Math.abs(e.kept - s.yr) <= tol && Math.abs(en.yr - e.kept) <= tol && Math.abs(e.to - e.from - ad) <= tol;
        if (kind === SHUNT_R) good &&= Math.abs(e.kept - s.yi) <= tol && Math.abs(en.yi - e.kept) <= tol && Math.abs(e.to - e.from - ad) <= tol;
      }
      if (!good) { bad++; stuck.push(`${where}: numbers differ from the engine`); }
      numbers++;
      if (e.still) {
        stills++;
        if (arcs[a + ARC_R] !== 0 && !(arcs[a + ARC_SWEEP] === 0 && arcs[a + ARC_TURNS] === 0)) { bad++; stuck.push(`${where}: still, but geometry moves`); }
        continue;
      }
      // The circle against the arc's own and the locus's.
      const R = arcs[a + ARC_R], ci = e.circle;
      if (R === Infinity || ci.radius === Infinity) {
        straights++;
        if (!(R === Infinity && ci.radius === Infinity)) { bad++; stuck.push(`${where}: straight ${R} vs ${ci.radius}`); }
        if (e.sense !== STRAIGHT) { bad++; stuck.push(`${where}: a straight piece has a sense`); }
        circles++;
        continue;
      }
      const scale = Math.max(1, R);
      const dc = Math.max(Math.abs(ci.cx - arcs[a + ARC_CX]), Math.abs(ci.cy - arcs[a + ARC_CY]), Math.abs(ci.radius - R)) / scale;
      let dl = 0;
      if (kind !== QUARTER) {
        partLocus(loc, 0, kind, zc, s.gr, s.gi, c.z0, c.f0, c.f0);
        if (loc[L_MODE] === LOCUS_MOBIUS || loc[L_MODE] === LOCUS_LINE) {
          circleCentre(cc, 0, loc, L_A);
          dl = Math.max(Math.abs(ci.cx - cc[0]), Math.abs(ci.cy - cc[1]), Math.abs(ci.radius - cc[2])) / Math.max(1, cc[2]);
        }
      }
      worstCircle = Math.max(worstCircle, dc, dl);
      if (!(dc <= 1e-7 && dl <= 1e-7)) { bad++; stuck.push(`${where}: circle off by ${dc.toExponential(2)} / ${dl.toExponential(2)}`); }
      circles++;
      // The sense from no effect against the arc's sweep (> 0 anticlockwise) and full turns.
      const sweep = arcs[a + ARC_SWEEP], turns = arcs[a + ARC_TURNS];
      const geo = sweep < 0 || (sweep === 0 && turns > 0) ? CW : sweep > 0 ? CCW : STRAIGHT;
      let sOk = geo === e.sense;
      if (kind === LINE || kind === QUARTER) sOk &&= turns === Math.floor(e.turns + 1e-12) || Math.abs(e.turns - Math.round(e.turns)) < 1e-9;
      if (!sOk) { bad++; stuck.push(`${where}: sense ${e.sense}, geometry ${geo} (sweep ${sweep}, turns ${turns}/${e.turns})`); }
      senses++;

      // A change of the value: from a random old value to this one.
      const old = valueOf(kind, c.z0, c.f0).value;
      const mv = explainMove(c, at, old);
      const cOld = withValue(c, at, old), pOld = packParts(cOld.parts), nOld = new Float64Array(nodes.length);
      evaluate(nOld, pOld, count, c.loadR, c.loadX, c.z0, c.f0, c.f0);
      const before = nodeOf(nOld, at + 1);
      if (!(samePoint(mv.before.end, before) && Math.abs(mv.dMag - (en.mag - before.mag)) <= 1e-12)) { bad++; stuck.push(`${where}: move numbers differ`); }
      // Geometry's direction: the signed angle about the locus circle's centre while the value walks old → new.
      let cx = ci.cx, cy = ci.cy;
      if (kind === QUARTER) {
        partLocus(loc, 0, QUARTER, 0, s.gr, s.gi, c.z0, c.f0, c.f0);
        if (loc[L_MODE] !== LOCUS_MOBIUS) continue;
        circleCentre(cc, 0, loc, L_A); cx = cc[0]; cy = cc[1];
        if (cc[2] === Infinity) continue;
      } else if (kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT || ci.kind === 'r' || ci.kind === 'g' || ci.kind === 'x' || ci.kind === 'b') {
        partLocus(loc, 0, kind, zc, s.gr, s.gi, c.z0, c.f0, c.f0);
      }
      // Geometry's direction of travel: the turn about the circle's centre of a small step of the value in the move's
      // direction, at nine places from the old value to the new one (a part's point moves round its circle in one
      // sense as its value grows: a Möbius image of a monotonic parameter); they must agree with each other.
      const lin = kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT;
      const q = new Float64Array(2);
      const valueAt = (f) => (f === 1 ? p.value : lin ? old + (p.value - old) * f : old * (p.value / old) ** f);
      const up = p.value > old ? 1 : -1;
      let geoMove = 2, agree = true, tiny = 0;
      for (let j = 0; j <= 8; j++) {
        const v = valueAt(j / 8), v2 = lin ? v + up * 1e-7 : v * (1 + up * 1e-7);
        locusPoint(q, 0, loc, 0, v); const a0 = Math.atan2(q[1] - cy, q[0] - cx);
        locusPoint(q, 0, loc, 0, v2); let d = Math.atan2(q[1] - cy, q[0] - cx) - a0;
        d -= TAU * Math.round(d / TAU);
        if (!(Math.abs(d) > 1e-13)) { tiny++; continue; }
        const g = d < 0 ? CW : CCW;
        if (geoMove === 2) geoMove = g; else if (g !== geoMove) agree = false;
      }
      if (geoMove === 2 || !agree || p.value === old) { moves.still++; continue; }
      if (geoMove !== mv.sense) { bad++; stuck.push(`${where}: move ${old} → ${p.value}: sense ${mv.sense}, geometry ${geoMove} (circle ${ci.radius})`); }
      moves.checked++;
      // The trace starts and ends on the nodes.
      const path = movePath(c, at, old, p.value, 16);
      const endOk = Math.hypot(path[0] - before.gr, path[1] - before.gi) < 1e-9 && Math.hypot(path[32] - en.gr, path[33] - en.gi) < 1e-9;
      if (!endOk) { bad++; stuck.push(`${where}: trace ends off the nodes`); }
    }
    ok(bad === 0, `${NAMES[kind]}: ${PER_KIND} random circuits explained as the engine and geometry say (${bad} wrong)`);
  }
  for (const s of stuck.slice(0, 12)) ok(false, s);
  ok(senses > 1500 && moves.checked > 1500, `enough moving cases: ${senses} arcs, ${moves.checked} changes`);
  console.log(`explain: ${ids} explanations, ${numbers} with numbers, ${circles} circles (worst ${worstCircle.toExponential(2)}), ${senses} senses, ${stills} still, ${straights} straight, ${moves.checked} changes (${moves.still} undecided: no move or a step at a pole)`);

  section('explain: start circuit');
  // theory.md §4 "Live numbers": series C keeps r = 0.5, x from 0.5 to −0.5, counter-clockwise; shunt L keeps g = 1, b from 1 to 0, counter-clockwise.
  const start = { z0: 50, f0: 1e8, loadR: 25, loadX: 25, parts: [{ kind: SERIES_C, value: 31.830988618379067e-12 }, { kind: SHUNT_L, value: 79.57747154594767e-9 }] };
  const e1 = explainPart(start, 0), e2 = explainPart(start, 1);
  ok(Math.abs(e1.kept - 0.5) < 1e-9 && Math.abs(e1.from - 0.5) < 1e-9 && Math.abs(e1.to + 0.5) < 1e-9 && e1.sense === CCW, `part 1 keeps r = 0.5, x 0.5 → −0.5, counter-clockwise (${e1.kept}, ${e1.from}, ${e1.to}, ${e1.sense})`);
  ok(Math.abs(e2.kept - 1) < 1e-9 && Math.abs(e2.from - 1) < 1e-9 && Math.abs(e2.to) < 1e-9 && e2.sense === CCW, `part 2 keeps g = 1, b 1 → 0, counter-clockwise (${e2.kept}, ${e2.from}, ${e2.to}, ${e2.sense})`);
  ok(isSeries(SERIES_C) && isShunt(SHUNT_L), 'kinds');
}
