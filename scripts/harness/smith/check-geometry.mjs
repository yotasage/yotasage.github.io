// Checks of lib/smith/geometry.ts (step M1.3), run by check.mjs with its counters: Möbius maps of the parts against
// network.ts, generalised circles, every part's locus against the circle formulas of engine.md §1 and facts.md
// eq. 12, arcs on 10,000 random circuits (ends on network.ts's nodes, midpoint on the locus, sweep and centre turning
// S into E), the direction of travel of M1.2, value → point → value for every kind, projection against a brute-force
// nearest point, length tracking, a fuzz with 0, ∞, open, short and rim loads, the polyline sampler and the time
// per drag frame.

import * as importedGeometry from '../../../lib/smith/geometry.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import { retried } from './timing.mjs';

const G = importedGeometry.default ?? importedGeometry;
const P = importedParts.default ?? importedParts;
const N = importedNetwork.default ?? importedNetwork;
const cv = importedConvert.default ?? importedConvert;
const { SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER, PART_KINDS, packParts, added, valueFor, noEffect } = P;
const { evaluate, nodeGamma, inputGamma, NODE_STRIDE } = N;
const { zFromGamma, yFromGamma, gammaFromZ } = cv;
const {
  partMobius, mobApply, mobCompose, mobInvert, circleThrough, circleImage, circleCentre, circleResidual, projectOnCircle,
  partLocus, nodeLocus, locusPoint, locusValue, project, partArcs, trackLength, samplePolyline, arcFlags,
  LOCUS_STRIDE, L_A, L_MODE, LOCUS_MOBIUS, LOCUS_LINE, LOCUS_NUMERIC, ARC_STRIDE, ARC_SX, ARC_SY, ARC_EX, ARC_EY, ARC_MX,
  ARC_MY, ARC_CX, ARC_CY, ARC_R, ARC_SWEEP, ARC_TURNS,
} = G;

const KIND_NAMES = ['series R', 'series L', 'series C', 'shunt R', 'shunt L', 'shunt C', 'line', 'open stub', 'short stub', 'λ/4'];
const TAU = 2 * Math.PI;

export function runGeometryChecks({ section, ok, random }) {
  const logU = (lo, hi) => 10 ** (lo + (hi - lo) * random());
  const pick = (a) => a[Math.floor(random() * a.length)];
  const w2 = new Float64Array(8), loc = new Float64Array(LOCUS_STRIDE), q = new Float64Array(2), circ = new Float64Array(4), cc = new Float64Array(3);
  const gammaOfZ = (r, x) => { gammaFromZ(w2, 0, r, x); return [w2[0], w2[1]]; };
  const zOf = (g) => { zFromGamma(w2, 0, g[0], g[1]); return [w2[0], w2[1]]; };
  const yOf = (g) => { yFromGamma(w2, 0, g[0], g[1]); return [w2[0], w2[1]]; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const rel = (a, b) => dist(a, b) / Math.max(1, Math.hypot(b[0], b[1]));
  const point = (l, v) => { locusPoint(q, 0, l, 0, v); return [q[0], q[1]]; };
  const isLumped = (k) => k <= SHUNT_C;
  const isStub = (k) => k === STUB_OPEN || k === STUB_SHORT;

  function randomCircuit(maxParts = 10) {
    const z0 = pick([50, 75, 1, 300, 0.01, 1e4]), f0 = logU(5, 10), n = 1 + Math.floor(random() * maxParts), w0 = TAU * f0;
    const parts = [];
    for (let k = 0; k < n; k++) {
      const kind = Math.floor(random() * PART_KINDS), a = logU(-1.5, 1.5);
      let value, zc = 0;
      switch (kind) {
        case SERIES_R: value = a * z0; break;
        case SERIES_L: value = (a * z0) / w0; break;
        case SERIES_C: value = 1 / (w0 * a * z0); break;
        case SHUNT_R: value = z0 / a; break;
        case SHUNT_L: value = z0 / (w0 * a); break;
        case SHUNT_C: value = a / (w0 * z0); break;
        case QUARTER: value = z0 * logU(-0.5, 0.5); break;
        default: value = 3 * random(); zc = z0 * logU(-0.5, 0.5);
      }
      parts.push({ kind, value, zc });
    }
    return { z0, f0, loadR: z0 * logU(-2, 2), loadX: (random() < 0.5 ? -1 : 1) * z0 * logU(-2, 2), parts };
  }
  const nodes = new Float64Array(11 * NODE_STRIDE), arcs = new Float64Array(10 * ARC_STRIDE);
  const gammaAt = (k) => { nodeGamma(w2, 0, nodes, k * NODE_STRIDE); return [w2[0], w2[1]]; };
  // The circle a part follows by engine.md §1 (r, x, g, b circles) or facts.md eq. 12 (a line about its Zc), from the
  // start's z and y by convert.ts: coefficients (A, Dr, Di, C) and the radius.
  function formulaCircle(kind, s, zcn) {
    const [zr, zi] = zOf(s), [yr, yi] = yOf(s);
    switch (kind) {
      case SERIES_R: return [[zi, zi, 1, zi], 1 / Math.abs(zi)];
      case SERIES_L: case SERIES_C: return [[1 + zr, zr, 0, zr - 1], 1 / (1 + zr)];
      case SHUNT_R: return [[yi, -yi, -1, yi], 1 / Math.abs(yi)];
      case LINE: case QUARTER: {
        const B = (zcn - 1) / (zcn + 1), rho = Math.hypot(...gammaOfZ(zr / zcn, zi / zcn));
        const c = B === 0 ? 0 : (B - 1 / B) / (1 - B * B * rho * rho) + 1 / B, R = Math.abs(((B * B - 1) * rho) / (1 - B * B * rho * rho));
        return [[1, c, 0, c * c - R * R], R];
      }
      default: return [[1 + yr, -yr, 0, yr - 1], 1 / (1 + yr)];
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('geometry maps and circles');
  {
    const m = new Float64Array(8), total = new Float64Array(8), inv = new Float64Array(8);
    let worstMap = 0, worstTotal = 0, worstInv = 0;
    for (let k = 0; k < 2000; k++) {
      const c = randomCircuit();
      const f = c.f0 * logU(-0.3, 0.3);
      evaluate(nodes, packParts(c.parts), c.parts.length, c.loadR, c.loadX, c.z0, f, c.f0);
      total.fill(0); total[0] = 1; total[6] = 1;
      c.parts.forEach((p, i) => {
        partMobius(m, 0, p.kind, p.value, p.zc, f, c.f0, c.z0);
        const s = gammaAt(i), e = gammaAt(i + 1);
        mobApply(q, 0, m, 0, s[0], s[1]);
        worstMap = Math.max(worstMap, rel([q[0], q[1]], e));
        mobInvert(inv, 0, m, 0);
        mobApply(q, 0, inv, 0, e[0], e[1]);
        worstInv = Math.max(worstInv, rel([q[0], q[1]], s) / Math.max(1e-300, 1 - Math.hypot(...e) ** 2 + 1e-3));
        mobCompose(total, 0, m, 0, total, 0);
      });
      const s = gammaAt(0), e = gammaAt(c.parts.length);
      mobApply(q, 0, total, 0, s[0], s[1]);
      worstTotal = Math.max(worstTotal, rel([q[0], q[1]], e));
    }
    ok(worstMap < 1e-12, `partMobius maps every node to the next as network.ts does (worst ${worstMap.toExponential(2)})`);
    ok(worstTotal < 1e-10, `the composed maps of a circuit map the load to the input (worst ${worstTotal.toExponential(2)})`);
    // The inverse expands what a part compresses (towards the open or short), so it is measured against 1 − |Γ|².
    ok(worstInv < 1e-8, `the inverse maps every node back, relative to 1 − |Γ|² (worst ${worstInv.toExponential(2)})`);
    // Rank-1 maps: a series open and a shunt short give their image point everywhere, also at their kernel.
    partMobius(m, 0, SERIES_C, 0, 0, 1e9, 1e9, 50);
    mobApply(q, 0, m, 0, 1, 0); ok(q[0] === 1 && q[1] === 0, `a series open maps the open to the open (${q[0]}, ${q[1]})`);
    mobApply(q, 0, m, 0, -0.3, 0.2); ok(Math.abs(q[0] - 1) < 1e-15 && Math.abs(q[1]) < 1e-15, `and anything else to the open (${q[0]}, ${q[1]})`);
    partMobius(m, 0, SHUNT_L, 0, 0, 1e9, 1e9, 50);
    mobApply(q, 0, m, 0, -1, 0); ok(q[0] === -1 && q[1] === 0, `a shunt short maps the short to the short (${q[0]}, ${q[1]})`);
    // Circles through three points, their images, projections.
    let through = 0, image = 0, proj = 0, projDist = 0;
    for (let k = 0; k < 5000; k++) {
      const cx = 4 * (random() - 0.5), cy = 4 * (random() - 0.5), R = logU(-3, 3), a = [0, 0, 0].map(() => TAU * random());
      const pts = a.map((t) => [cx + R * Math.cos(t), cy + R * Math.sin(t)]);
      circleThrough(circ, 0, ...pts[0], ...pts[1], ...pts[2]);
      circleCentre(cc, 0, circ, 0);
      through = Math.max(through, Math.hypot(cc[0] - cx, cc[1] - cy) / Math.max(1, R), Math.abs(cc[2] - R) / Math.max(1, R));
      const mm = Array.from({ length: 8 }, () => 2 * (random() - 0.5));
      circleImage(w2, 0, circ, 0, mm, 0);
      const img = w2.slice(0, 4);
      for (const t of [0.1, 2, 4]) {
        mobApply(q, 0, mm, 0, cx + R * Math.cos(t), cy + R * Math.sin(t));
        if (Math.hypot(q[0], q[1]) < 1e6) { circleCentre(cc, 0, img, 0); image = Math.max(image, Math.abs(circleResidual(img, 0, q[0], q[1])) / Math.max(1, Math.min(cc[2], 1e6))); }
      }
      const px = 6 * (random() - 0.5), py = 6 * (random() - 0.5);
      // Against the circle as represented (circleThrough's own rounding is checked above).
      projectOnCircle(q, 0, circ, 0, px, py);
      circleCentre(cc, 0, circ, 0);
      proj = Math.max(proj, Math.abs(circleResidual(circ, 0, q[0], q[1])) / Math.max(1, cc[2]));
      projDist = Math.max(projDist, Math.abs(Math.hypot(q[0] - px, q[1] - py) - Math.abs(Math.hypot(px - cc[0], py - cc[1]) - cc[2])) / Math.max(1, cc[2], Math.hypot(cc[0], cc[1])));
    }
    ok(through < 1e-9, `circleThrough finds centre and radius (worst ${through.toExponential(2)})`);
    ok(image < 1e-9, `circleImage contains the images of the circle's points (worst ${image.toExponential(2)})`);
    ok(proj < 1e-12 && projDist < 1e-12, `projectOnCircle lands on the circle at the nearest distance (worst ${proj.toExponential(2)}, ${projDist.toExponential(2)})`);
    // A straight line: Γi = 0.25.
    circleThrough(circ, 0, -1, 0.25, 0.5, 0.25, 3, 0.25);
    projectOnCircle(q, 0, circ, 0, 0.3, -2);
    ok(circ[0] === 0 && Math.abs(q[0] - 0.3) < 1e-15 && Math.abs(q[1] - 0.25) < 1e-15, `three collinear points give a line, projected onto exactly (${q})`);
    // Every locus circle is the circle of engine.md §1 (r, x, g, b) or facts.md eq. 12 (a line).
    let family = 0;
    for (let k = 0; k < 20000; k++) {
      const kind = k % 10 === QUARTER ? LINE : k % 10, z0 = 50, zc = kind === LINE ? 50 * logU(-1, 1) : 50;
      const s = gammaOfZ(logU(-2, 2), (random() - 0.5) * 20);
      partLocus(loc, 0, kind, zc, s[0], s[1], z0, 1e9, 1e9);
      circleCentre(cc, 0, loc, L_A);
      const [coef, R] = formulaCircle(kind, s, zc / z0);
      const want = new Float64Array(coef);
      circleCentre(w2, 4, want, 0);
      family = Math.max(family, Math.hypot(cc[0] - w2[4], cc[1] - w2[5]) / Math.max(1, R), Math.abs(cc[2] - R) / Math.max(1, R));
    }
    ok(family < 1e-12, `the loci are the r, x, g and b circles of engine.md §1 and the line circles of facts.md eq. 12 (worst ${family.toExponential(2)})`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('geometry arcs');
  {
    let ends = true, endPoint = 0, onLocus = 0, onArc = 0, onFormula = 0, turn = 0, sweepRange = true, turns = true, between = true;
    for (let k = 0; k < 10000; k++) {
      const c = randomCircuit();
      const f = k % 2 === 0 ? c.f0 : c.f0 * logU(-0.3, 0.3);
      const packed = packParts(c.parts), n = c.parts.length;
      evaluate(nodes, packed, n, c.loadR, c.loadX, c.z0, f, c.f0);
      partArcs(arcs, nodes, packed, n, c.z0, f, c.f0);
      for (let i = 0; i < n; i++) {
        const p = c.parts[i], a = i * ARC_STRIDE, s = gammaAt(i), e = gammaAt(i + 1);
        const S = [arcs[a + ARC_SX], arcs[a + ARC_SY]], E = [arcs[a + ARC_EX], arcs[a + ARC_EY]], M = [arcs[a + ARC_MX], arcs[a + ARC_MY]];
        const C = [arcs[a + ARC_CX], arcs[a + ARC_CY]], R = arcs[a + ARC_R], sw = arcs[a + ARC_SWEEP];
        if (S[0] !== s[0] || S[1] !== s[1] || E[0] !== e[0] || E[1] !== e[1]) ends = false;
        partLocus(loc, 0, p.kind, p.zc, s[0], s[1], c.z0, f, c.f0);
        endPoint = Math.max(endPoint, rel(point(loc, p.value), e));
        if (p.kind !== QUARTER && (loc[L_MODE] === LOCUS_MOBIUS || loc[L_MODE] === LOCUS_LINE)) {
          circleCentre(cc, 0, loc, L_A);
          onLocus = Math.max(onLocus, Math.abs(circleResidual(loc, L_A, ...M)) / Math.max(1, cc[2]));
        }
        if (R > 0 && R < Infinity) {
          onArc = Math.max(onArc, Math.abs(dist(M, C) - R) / Math.max(1, R));
          const [coef, Rf] = formulaCircle(p.kind, s, (p.kind === QUARTER ? p.value : p.zc) / c.z0);
          if (Number.isFinite(Rf) && coef.every(Number.isFinite)) {
            const fc = new Float64Array(coef);
            onFormula = Math.max(onFormula, ...[M, E].map((X) => Math.abs(circleResidual(fc, 0, ...X)) / Math.max(1, Rf)));
          }
          if (R < 1e4) {
            for (const [ang, X] of [[sw, E], [0.5 * sw, M]]) {
              const dx = S[0] - C[0], dy = S[1] - C[1], co = Math.cos(ang), si = Math.sin(ang);
              turn = Math.max(turn, Math.hypot(C[0] + dx * co - dy * si - X[0], C[1] + dx * si + dy * co - X[1]) / Math.max(1, R));
            }
          }
        }
        if (!(Math.abs(sw) < TAU)) sweepRange = false;
        const wantTurns = p.kind === LINE || p.kind === QUARTER ? (R > 0 ? Math.floor(2 * (p.kind === QUARTER ? 0.25 : p.value) * (f / c.f0)) : 0) : 0;
        if (arcs[a + ARC_TURNS] !== wantTurns) { turns = false; ok(false, `${KIND_NAMES[p.kind]} turns ${arcs[a + ARC_TURNS]}, wanted ${wantTurns}`); }
        if (isLumped(p.kind) && R > 0 && sw !== 0) {
          const p1 = added(p.kind, p.value, p.zc, f, c.f0, c.z0), pm = added(p.kind, locusValue(loc, 0, M[0], M[1], p.value), p.zc, f, c.f0, c.z0);
          if (!(Math.sign(pm) === Math.sign(p1) && Math.abs(pm) <= Math.abs(p1) * (1 + 1e-9))) { between = false; ok(false, `${KIND_NAMES[p.kind]}: midpoint adds ${pm}, the part ${p1}`); }
        }
      }
    }
    ok(ends, 'every arc starts and ends on its nodes from network.ts');
    ok(endPoint < 1e-12, `the locus at the part's value is network.ts's next node (worst ${endPoint.toExponential(2)})`);
    ok(onLocus < 1e-12, `every arc's midpoint is on the part's locus (worst ${onLocus.toExponential(2)})`);
    ok(onArc < 1e-12, `and on the arc's own circle (worst ${onArc.toExponential(2)})`);
    // The formula's coefficients come from z = (1 + Γ)/(1 − Γ) of the start, which loses digits near the open.
    ok(onFormula < 1e-11, `midpoint and end are on engine.md's circle of the part (worst ${onFormula.toExponential(2)})`);
    ok(turn < 1e-11, `turning S about the centre by the sweep gives E, by half of it M (worst ${turn.toExponential(2)})`);
    ok(sweepRange, 'every sweep is within (−2π, 2π)');
    ok(turns, 'lines and λ/4 transformers count the full turns of their length (floor of 2ℓ/λ at f)');
    ok(between, 'a lumped part\'s midpoint lies between no effect and its value');
    console.log(`geometry arcs: on 10,000 random circuits, end vs network ${endPoint.toExponential(2)}, midpoint on locus ${onLocus.toExponential(2)}, rotation ${turn.toExponential(2)}`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('geometry direction');
  {
    // The step from E further away from no effect turns the same way as the arc (M1.2's cross product test), and the
    // fixed directions of engine.md §1: series L, shunt C and lines clockwise; series C and shunt L anticlockwise; a
    // stub clockwise when it adds b > 0.
    const want = [0, -1, 1, 0, 1, -1, -1, 0, 0, -1];
    for (let kind = 0; kind < PART_KINDS; kind++) {
      let agree = 0, fixed = 0, tried = 0;
      for (let k = 0; k < 1000; k++) {
        const z0 = 50, f0 = 1e9, R = z0 * logU(-1.5, 1.5), X = z0 * (random() - 0.5) * 6, zc = z0 * logU(-0.5, 0.5);
        let v, v2, f2 = f0;
        if (isLumped(kind)) {
          v = valueFor(kind, (kind === SERIES_C || kind === SHUNT_L ? -1 : 1) * logU(-1, 1), 0, f0, f0, z0);
          v2 = v * (noEffect(kind, f0, f0) === 0 ? 1 + 1e-7 : 1 - 1e-7);
        } else if (kind === QUARTER) { v = zc; v2 = v; f2 = f0 * (1 + 1e-7); }
        else {
          v = 0.02 + 0.96 * random() * (kind === LINE ? 1 : 0.5);
          if (Math.abs((4 * v) % 1) < 0.02 || Math.abs((4 * v) % 1) > 0.98) v += 0.03;
          v2 = kind === LINE ? v + 1e-7 : v + 1e-7 * Math.sign(added(kind, v, zc, f0, f0, z0));
        }
        evaluate(nodes, packParts([{ kind, value: v, zc }]), 1, R, X, z0, f0, f0);
        partArcs(arcs, nodes, packParts([{ kind, value: v, zc }]), 1, z0, f0, f0);
        const sw = arcs[ARC_SWEEP], C = [arcs[ARC_CX], arcs[ARC_CY]], E = [arcs[ARC_EX], arcs[ARC_EY]];
        if (sw === 0 || !(arcs[ARC_R] < 1e4)) continue;
        tried++;
        const e2 = new Float64Array(2);
        inputGamma(e2, 0, packParts([{ kind, value: v2, zc }]), 1, R, X, z0, f2, f0);
        // For λ/4 the step is in frequency: the arc at f2 is the line a little longer, from the same start.
        const cross = (E[0] - C[0]) * (e2[1] - E[1]) - (E[1] - C[1]) * (e2[0] - E[0]);
        if (Math.sign(cross) === Math.sign(sw)) agree++;
        const expect = isStub(kind) ? -Math.sign(added(kind, v, zc, f0, f0, z0)) : want[kind];
        if (expect === 0 || Math.sign(sw) === expect) fixed++;
      }
      ok(tried > 900 && agree === tried, `${KIND_NAMES[kind]}: the arc turns the way the part moves the point (${agree} of ${tried})`);
      ok(fixed === tried, `${KIND_NAMES[kind]}: the direction of engine.md §1 (${fixed} of ${tried})`);
    }
    // SVG flags after the flip: an anticlockwise model sweep stays anticlockwise on screen (sweep-flag 0).
    const fa = new Float64Array(ARC_STRIDE);
    fa[ARC_SWEEP] = 0.5; const f1 = arcFlags(fa, 0); fa[ARC_SWEEP] = -4; const f2 = arcFlags(fa, 0);
    ok(f1 === 0 && f2 === 3, `arcFlags: small anticlockwise ${f1}, large clockwise ${f2}`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('geometry values');
  {
    // value → point → value for every kind, from starts with |Γs| ≤ 0.98, over 1e-4 to 1e4 of the part's natural scale
    // (|z_s + 1| for series parts, |y_s + 1| for shunt parts, |z_L| for s = (Zt/Z0)²), lines and stubs over three
    // wavelengths and within 1e-4 λ of their special lengths, tracked from a previous value within 0.2 of a period.
    for (let kind = 0; kind < PART_KINDS; kind++) {
      let worst = 0, worstWhat = '';
      for (let k = 0; k < 4000; k++) {
        const z0 = pick([50, 75, 1]), f0 = 1e9, zc = z0 * logU(-0.5, 0.5);
        const offF0 = kind === QUARTER && k % 2 === 1;
        const f = isLumped(kind) ? f0 * logU(-1, 1) : offF0 ? f0 * (0.6 + 0.8 * random()) : f0;
        let s;
        do { s = [2 * random() - 1, 2 * random() - 1]; } while (Math.hypot(...s) > 0.98);
        partLocus(loc, 0, kind, zc, s[0], s[1], z0, f, f0);
        let value, prev = NaN;
        const period = (0.5 * f0) / f;
        if (isLumped(kind)) {
          const [zr, zi] = zOf(s), [yr, yi] = yOf(s);
          const scale = kind <= SERIES_C ? Math.hypot(zr + 1, zi) : Math.hypot(yr + 1, yi);
          const sign = P.REACH_HI[kind] === 0 ? -1 : 1;
          const u = k % 4 === 0 ? -4 + 0.5 * random() : k % 4 === 1 ? 3.5 + 0.5 * random() : -4 + 8 * random();
          value = valueFor(kind, sign * scale * 10 ** u, 0, f, f0, z0);
        } else if (kind === QUARTER) {
          const [zr, zi] = zOf(s);
          value = offF0 ? z0 * logU(-1, 1) : z0 * Math.sqrt(Math.hypot(zr, zi) * logU(-4, 4));
        } else {
          if (kind === LINE) { cv.gammaFromZ(w2, 0, ...zOf(s).map((x) => x / (zc / z0))); if (Math.hypot(w2[0], w2[1]) < 0.05) continue; }
          value = k % 3 === 0 ? 3 * random() : 0.25 * Math.floor(12 * random()) + (random() < 0.5 ? 1e-4 : -1e-4);
          if (value <= 0) value = 1e-4;
          prev = Math.max(0, value + (random() - 0.4) * 0.4 * period);
        }
        const g = point(loc, value);
        const back = locusValue(loc, 0, g[0], g[1], prev);
        const err = Math.abs(back - value) / value;
        if (!(err <= worst)) { worst = err; worstWhat = `${value} → ${back}`; }
      }
      ok(worst < 1e-9, `${KIND_NAMES[kind]}: value → point → value within 1e-9 (worst ${worst.toExponential(2)}${worst >= 1e-9 ? `: ${worstWhat}` : ''})`);
    }
    // The ends: values 0 and ∞ go to the open or short and back.
    let endsBack = true;
    for (const kind of [SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C]) {
      partLocus(loc, 0, kind, 0, 0.3, -0.4, 50, 1e9, 1e9);
      for (const v of [0, Infinity]) {
        const g = point(loc, v), back = locusValue(loc, 0, g[0], g[1], NaN);
        if (back !== v) { endsBack = false; ok(false, `${KIND_NAMES[kind]} ${v} → (${g}) → ${back}`); }
      }
    }
    ok(endsBack, 'values 0 and ∞ of lumped parts come back exactly');
    ok(trackLength(0.1, 2.33, 0.5) === 2.1 && trackLength(0.45, 0.02, 0.5) === 0 && trackLength(0.3, NaN, 0.5) === 0.3 && trackLength(0.49, 0.6, 0.5) === 0.49,
      'trackLength keeps the turns, stops at 0 going back, takes the candidate without a previous value');
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('geometry projection');
  {
    // Random pointers: the projection is on the locus, its value gives it back, and no point of the reachable arc
    // (5,000 samples of the reach) is nearer.
    for (let kind = 0; kind < PART_KINDS; kind++) {
      let onLoc = 0, back = 0, nearest = 0, ends = 0;
      for (let k = 0; k < 600; k++) {
        const z0 = 50, f0 = 1e9, zc = z0 * logU(-0.5, 0.5), f = kind === QUARTER && k % 2 ? f0 * (0.6 + 0.8 * random()) : f0;
        let s;
        do { s = [2 * random() - 1, 2 * random() - 1]; } while (Math.hypot(...s) > 1);
        partLocus(loc, 0, kind, zc, s[0], s[1], z0, f, f0);
        const px = 3 * (random() - 0.5), py = 3 * (random() - 0.5);
        // No previous value: the nearest point itself (a jump is not a drag; tracking is checked below).
        const prev = kind === QUARTER ? zc : NaN;
        const v = project(q, 0, loc, 0, px, py, prev), Q = [q[0], q[1]];
        if (loc[L_MODE] === LOCUS_MOBIUS || loc[L_MODE] === LOCUS_LINE) { circleCentre(cc, 0, loc, L_A); onLoc = Math.max(onLoc, Math.abs(circleResidual(loc, L_A, ...Q)) / Math.max(1, cc[2])); }
        back = Math.max(back, dist(point(loc, v), Q));
        // Brute force over the reach.
        let best = Infinity;
        for (let j = 0; j <= 5000; j++) {
          const u = j / 5000;
          let val;
          if (isLumped(kind)) {
            const lo = Math.atan(P.REACH_LO[kind]), hi = Math.atan(P.REACH_HI[kind]);
            val = valueFor(kind, Math.tan(lo + (hi - lo) * u), 0, f, f0, z0);
            if (j === 0 || j === 5000) val = (j === 0) === (P.REACH_LO[kind] === 0) ? noEffect(kind, f, f0) : noEffect(kind, f, f0) === 0 ? Infinity : 0;
          } else if (kind === QUARTER) val = j === 5000 ? Infinity : z0 * Math.tan(0.5 * Math.PI * u);
          else val = 0.5 * u;
          best = Math.min(best, dist(point(loc, val), [px, py]));
        }
        nearest = Math.max(nearest, dist(Q, [px, py]) - best);
        if (isLumped(kind) && !(v >= 0)) ends++;
      }
      ok(onLoc < 1e-12, `${KIND_NAMES[kind]}: projections are on the locus (worst ${onLoc.toExponential(2)})`);
      ok(back < 1e-9, `${KIND_NAMES[kind]}: the projected value gives the projected point (worst ${back.toExponential(2)})`);
      ok(nearest < 1e-9, `${KIND_NAMES[kind]}: no reachable point is nearer than the projection (worst excess ${nearest.toExponential(2)})`);
      ok(ends === 0, `${KIND_NAMES[kind]}: values stay in reach (${ends} negative)`);
    }
    // Out of reach goes to the nearer end: a series C from Γs = −0.5 reaches the lower half of the r = 1/3 circle;
    // a pointer above the circle near its left goes to the start (C = ∞), near the open to C = 0.
    partLocus(loc, 0, SERIES_C, 0, -0.5, 0, 50, 1e9, 1e9);
    const left = project(q, 0, loc, 0, -0.45, 0.3, NaN), lq = [q[0], q[1]];
    const right = project(q, 0, loc, 0, 0.9, 0.3, NaN), rq = [q[0], q[1]];
    ok(left === Infinity && lq[0] === -0.5 && lq[1] === 0, `series C: above the start goes to the start, C = ∞ (${left}, ${lq})`);
    ok(right === 0 && rq[0] === 1 && rq[1] === 0, `series C: above the open goes to the open, C = 0 (${right}, ${rq})`);
    // Dragging a line round its circle 2.3 times clockwise accumulates the length, then back past 0 stays at 0.
    partLocus(loc, 0, LINE, 70, 0.4, 0.2, 50, 1e9, 1e9);
    circleCentre(cc, 0, loc, L_A);
    const start = Math.atan2(0.2 - cc[1], 0.4 - cc[0]);
    let v = 0, mono = true;
    for (let j = 1; j <= 460; j++) {
      const nv = project(q, 0, loc, 0, cc[0] + 1.3 * cc[2] * Math.cos(start - (TAU * j) / 200), cc[1] + 1.3 * cc[2] * Math.sin(start - (TAU * j) / 200), v);
      if (!(nv > v)) mono = false;
      v = nv;
    }
    ok(mono && Math.abs(v - 1.15) < 0.02, `a line dragged 2.3 times round grows steadily to ${v.toFixed(4)} λ (2.3 half wavelengths)`);
    for (let j = 459; j >= -40; j--) v = project(q, 0, loc, 0, cc[0] + cc[2] * Math.cos(start - (TAU * j) / 200), cc[1] + cc[2] * Math.sin(start - (TAU * j) / 200), v);
    ok(v === 0 && Math.abs(q[0] - 0.4) < 1e-15 && Math.abs(q[1] - 0.2) < 1e-15, `dragged back past its start it stays at length 0 (${v})`);
    // An open stub dragged 1.5 times round its g circle (clockwise, b growing) reaches 0.75 λ.
    partLocus(loc, 0, STUB_OPEN, 50, -0.2, 0.3, 50, 1e9, 1e9);
    circleCentre(cc, 0, loc, L_A);
    const s0 = Math.atan2(0.3 - cc[1], -0.2 - cc[0]);
    v = 0; mono = true;
    for (let j = 1; j <= 300; j++) {
      const nv = project(q, 0, loc, 0, cc[0] + 0.5 * cc[2] * Math.cos(s0 - (TAU * j) / 200), cc[1] + 0.5 * cc[2] * Math.sin(s0 - (TAU * j) / 200), v);
      if (!(nv > v)) mono = false;
      v = nv;
    }
    // 1.5 turns of the g circle end opposite the start: one half wavelength plus that point's shortest length.
    const opposite = [2 * cc[0] + 0.2, 2 * cc[1] - 0.3], qEnd = [q[0], q[1]];
    const shortest = locusValue(loc, 0, ...opposite, NaN);
    ok(mono && Math.abs(v - (0.5 + shortest)) < 1e-12 && dist(qEnd, opposite) < 1e-12, `an open stub dragged 1.5 times round grows steadily to ${v} λ = λ/2 + ${shortest}`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('geometry fuzz 0 and ∞');
  {
    const loads = [[Infinity, 0], [0, 0], [50, 0], [0, 30], [0, -1e6], [0, 1e-9], [1e-300, 0], [1e300, 1e300], [20, Infinity]];
    let bad = 0;
    const out = new Float64Array(2);
    for (let k = 0; k < 100000; k++) {
      const c = randomCircuit();
      if (random() < 0.6) { const [R, X] = pick(loads); c.loadR = R * (c.z0 / 50); c.loadX = X * (c.z0 / 50); }
      for (const p of c.parts) {
        const u = random();
        if (isLumped(p.kind)) { if (u < 0.25) p.value = 0; else if (u < 0.5) p.value = Infinity; else if (u < 0.55) p.value = 1e-300; else if (u < 0.6) p.value = 1e300; }
        else if (p.kind !== QUARTER && u < 0.6) p.value = pick([0, 0.25, 0.5, 0.125, 0.75, 1, 3.25]);
      }
      const f = random() < 0.5 ? c.f0 : c.f0 * logU(-3, 3), packed = packParts(c.parts), n = c.parts.length;
      evaluate(nodes, packed, n, c.loadR, c.loadX, c.z0, f, c.f0);
      partArcs(arcs, nodes, packed, n, c.z0, f, c.f0);
      let fine = true;
      for (let i = 0; i < n * ARC_STRIDE; i++) if (Number.isNaN(arcs[i])) fine = false;
      const i = Math.floor(random() * n), p = c.parts[i];
      nodeLocus(loc, 0, nodes, packed, i, c.z0, f, c.f0);
      for (let j = 0; j < LOCUS_STRIDE; j++) if (Number.isNaN(loc[j])) fine = false;
      const prev = p.value;
      const v = project(out, 0, loc, 0, 3 * (random() - 0.5), 3 * (random() - 0.5), prev);
      if (Number.isNaN(v) || Number.isNaN(out[0]) || Number.isNaN(out[1])) fine = false;
      locusPoint(out, 0, loc, 0, p.value);
      if (Number.isNaN(out[0]) || Number.isNaN(out[1])) fine = false;
      if (Number.isNaN(locusValue(loc, 0, out[0], out[1], prev))) fine = false;
      if (!fine) { bad++; if (bad < 5) ok(false, `NaN in the geometry of ${JSON.stringify(c)} at ${f} (part ${i})`); }
    }
    ok(bad === 0, `100,000 circuits with 0, ∞, open, short and rim loads: no NaN in arcs, loci, projections or values (${bad} bad)`);
    // Rim and the special points: arcs of parts on the open and short are points or the unit circle.
    evaluate(nodes, packParts([{ kind: SERIES_L, value: 1e-8 }]), 1, Infinity, 0, 50, 1e9, 1e9);
    partArcs(arcs, nodes, packParts([{ kind: SERIES_L, value: 1e-8 }]), 1, 50, 1e9, 1e9);
    ok(arcs[ARC_R] === 0 && arcs[ARC_SWEEP] === 0 && arcs[ARC_EX] === 1, 'a series L on the open is a point at the open');
    evaluate(nodes, packParts([{ kind: LINE, value: 0.1, zc: 30 }]), 1, 0, 0, 50, 1e9, 1e9);
    partArcs(arcs, nodes, packParts([{ kind: LINE, value: 0.1, zc: 30 }]), 1, 50, 1e9, 1e9);
    ok(Math.abs(arcs[ARC_R] - 1) < 1e-15 && Math.abs(arcs[ARC_CX]) < 1e-15, `a line on the short follows the rim (R ${arcs[ARC_R]}, centre ${arcs[ARC_CX]})`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('geometry sampler');
  {
    // A line's locus as a curve of its length: every point on the circle, every chord's sagitta within the tolerance.
    partLocus(loc, 0, LINE, 30, 0.5, 0.3, 50, 1e9, 1e9);
    circleCentre(cc, 0, loc, L_A);
    const out = new Float64Array(2 * 4000);
    const lineFn = (t, o, i) => locusPoint(o, i, loc, 0, t);
    const tol = 1e-4, n1 = samplePolyline(out, 4000, lineFn, 0, 0.5, tol);
    let on = 0, sag = 0;
    for (let i = 0; i < n1; i++) on = Math.max(on, Math.abs(Math.hypot(out[2 * i] - cc[0], out[2 * i + 1] - cc[1]) - cc[2]));
    for (let i = 1; i < n1; i++) { const L = Math.hypot(out[2 * i] - out[2 * i - 2], out[2 * i + 1] - out[2 * i - 1]); sag = Math.max(sag, (L * L) / (8 * cc[2])); }
    ok(on < 1e-14 && sag <= 2 * tol && n1 > 16 && n1 < 4000, `a line's circle sampled with ${n1} points, on it within ${on.toExponential(1)}, sagitta ${sag.toExponential(2)} ≤ 2·tol`);
    // A sweep trace (not a circle): every point of a dense reference is within 2·tol of the polyline.
    const c = randomCircuit(10), packed = packParts(c.parts), n = c.parts.length;
    const traceFn = (t, o, i) => inputGamma(o, i, packed, n, c.loadR, c.loadX, c.z0, c.f0 * (0.5 + t), c.f0);
    const tol2 = 1e-3, n2 = samplePolyline(out, 4000, traceFn, 0, 1, tol2);
    let far = 0;
    const ref = new Float64Array(2);
    for (let j = 0; j <= 20000; j++) {
      traceFn(j / 20000, ref, 0);
      let d = Infinity;
      for (let i = 1; i < n2; i++) {
        const ax = out[2 * i - 2], ay = out[2 * i - 1], dx = out[2 * i] - ax, dy = out[2 * i + 1] - ay, l2 = dx * dx + dy * dy;
        const u = l2 > 0 ? Math.min(1, Math.max(0, ((ref[0] - ax) * dx + (ref[1] - ay) * dy) / l2)) : 0;
        d = Math.min(d, Math.hypot(ref[0] - ax - u * dx, ref[1] - ay - u * dy));
      }
      far = Math.max(far, d);
    }
    traceFn(1, ref, 0);
    ok(far <= 2 * tol2 && out[2 * n2 - 2] === ref[0] && out[2 * n2 - 1] === ref[1], `a sweep trace of ${n2} points stays within ${far.toExponential(2)} of 20,001 reference points and ends at f = 1.5 f0`);
    const n3 = samplePolyline(out, 20, traceFn, 0, 1, 1e-12);
    ok(n3 <= 20 && out[2 * n3 - 2] === ref[0], `the cap holds (${n3} of 20 points, still ending at the end)`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('geometry timing');
  {
    const z0 = 50, f0 = 1e8;
    const parts = [
      { kind: SERIES_L, value: 40e-9 }, { kind: SHUNT_C, value: 20e-12 }, { kind: LINE, value: 0.1, zc: 60 }, { kind: STUB_OPEN, value: 0.1, zc: 60 },
      { kind: SERIES_C, value: 30e-12 }, { kind: SHUNT_L, value: 60e-9 }, { kind: STUB_SHORT, value: 0.1, zc: 60 }, { kind: SERIES_R, value: 5 },
      { kind: SHUNT_R, value: 2000 }, { kind: QUARTER, value: 70 },
    ];
    const packed = packParts(parts), out = new Float64Array(2);
    const frame = (k) => {
      evaluate(nodes, packed, 10, 25, 25, z0, f0, f0);
      partArcs(arcs, nodes, packed, 10, z0, f0, f0);
      nodeLocus(loc, 0, nodes, packed, k % 10, z0, f0, f0);
      return project(out, 0, loc, 0, 0.3 * Math.cos(k), 0.3 * Math.sin(k), packed[(k % 10) * 3 + 1]);
    };
    for (let k = 0; k < 20000; k++) frame(k);
    const runs = 200000;
    let sink = 0;
    const { value: per, note: frameNote } = retried(() => {
      const t0 = performance.now();
      for (let k = 0; k < runs; k++) sink += frame(k);
      return ((performance.now() - t0) / runs) * 1000;
    }, (x) => x < 4000);
    const t1 = performance.now();
    for (let k = 0; k < 20000; k++) partArcs(arcs, nodes, packed, 10, z0, f0, f0);
    const arcsOnly = ((performance.now() - t1) / 20000) * 1000;
    ok(!Number.isNaN(sink) && per < 4000, `a drag frame (nodes, 10 arcs, a locus and a projection) within the 4 ms budget (${per.toFixed(2)} µs)${frameNote}`);
    partLocus(loc, 0, QUARTER, 0, 0.3, 0.2, z0, 1.3 * f0, f0);
    const { value: numeric, note: numericNote } = retried(() => {
      const t2 = performance.now();
      for (let k = 0; k < 2000; k++) project(out, 0, loc, 0, 0.5 * Math.cos(k), 0.5 * Math.sin(k), 70);
      return ((performance.now() - t2) / 2000) * 1000;
    }, (x) => x < 1000);
    ok(numeric < 1000, `the numeric projection of a λ/4 transformer away from f0 within 1 ms (${numeric.toFixed(1)} µs)${numericNote}`);
    console.log(`geometry timing: drag frame of 10 parts (nodes, arcs, locus, projection) ${per.toFixed(2)} µs; 10 arcs alone ${arcsOnly.toFixed(2)} µs; λ/4 projection away from f0 ${numeric.toFixed(1)} µs`);
  }
}
