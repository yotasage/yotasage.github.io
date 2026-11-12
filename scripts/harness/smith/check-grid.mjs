// Checks of lib/smith/grid.ts (step M2.1a), run by check.mjs with its counters: every arc against the circle equations
// of facts.md (eqs. 8–11) with its ends on the unit circle or on the circle it is clipped by, ends of lines on drawn
// lines, label boxes that never overlap (an independent polygon test), line spacing on screen within the band at five
// zoom levels around several centres and at three aspect ratios, a stable choice under small zooms, the perimeter
// scales against θ = ∠Γ and θ = π ∓ 4πd/λ, a fuzz, and the time to build a grid.

import * as importedGrid from '../../../lib/smith/grid.ts';

const G = importedGrid.default ?? importedGrid;
const {
  buildGrid, gridFor, densityLevel, levelK, K_SPAN, GRID_DEFAULTS, MODE_Z, MODE_Y, MODE_ZY, FAM_R, FAM_X, FAM_G, FAM_B,
  FAM_RIM, FAM_AXIS, FAM_RING, CLS_MAJOR, LBL_R, LBL_X, LBL_G, LBL_B, LBL_ANGLE, LBL_WTG, LBL_WTL, SCALE_ANGLE, SCALE_WAVE,
} = G;

// arc layout of geometry.ts
const SX = 0, SY = 1, EX = 2, EY = 3, MX = 4, MY = 5, CX = 6, CY = 7, RR = 8, SW = 9, TU = 10, STRIDE = 11;
const TAU = 2 * Math.PI;
// The upper end of the spacing band, as a multiple of minPx at the level's k (the documented band is
// [minPx, BAND·K_SPAN·minPx] at any k a level is shown at). M2.3 cut each step's region to whole blocks of the next
// step (outlines on whole circles, not stairs of cells), which leaves wider gaps where a block is dropped: 7 → 9.
const BAND = 9;
// Around Γ = 1, where every line meets, the last lines stop at most HOLE·minPx from it (at the level's k).
const HOLE = 11;

// Γ of z = r + jx, written independently of convert.ts.
const gam = (r, x) => { const d = (r + 1) * (r + 1) + x * x; return [(r * r + x * x - 1) / d, 2 * x / d]; };
const zOf = (gr, gi) => { const d = (1 - gr) * (1 - gr) + gi * gi; return [(1 - gr * gr - gi * gi) / d, 2 * gi / d]; };
// facts.md eqs. 8–11 (centre, radius); x = 0 / b = 0 is the real axis (null)
function circleOf(fam, v) {
  if (fam === FAM_R) return [v / (1 + v), 0, 1 / (1 + v)];
  if (fam === FAM_X) return v === 0 ? null : [1, 1 / v, 1 / Math.abs(v)];
  if (fam === FAM_G) return [-v / (1 + v), 0, 1 / (1 + v)];
  return v === 0 ? null : [-1, -1 / v, 1 / Math.abs(v)];
}
const OTHER = { [FAM_R]: FAM_X, [FAM_X]: FAM_R, [FAM_G]: FAM_B, [FAM_B]: FAM_G };
const inWin = (w, x, y, m = 0) => x >= w.x0 + m && x <= w.x1 - m && y >= w.y0 + m && y <= w.y1 - m;

// Corners of a label box in screen px (y down).
function corners(l, k) {
  const a = l.rotate * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), cx = l.x * k, cy = -l.y * k;
  const hw = l.w / 2 - 1e-6, hh = l.h / 2 - 1e-6;
  return [[cx + ux * hw - uy * hh, cy + uy * hw + ux * hh], [cx - ux * hw - uy * hh, cy - uy * hw + ux * hh],
    [cx - ux * hw + uy * hh, cy - uy * hw - ux * hh], [cx + ux * hw + uy * hh, cy + uy * hw - ux * hh]];
}
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function insideQuad(p, q) { let pos = 0, neg = 0; for (let i = 0; i < 4; i++) { const c = cross(q[i], q[(i + 1) % 4], p); if (c > 0) pos++; else if (c < 0) neg++; } return pos === 4 || neg === 4; }
function segCross(a, b, c, d) { const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d); return d1 * d2 < 0 && d3 * d4 < 0; }
function quadsOverlap(p, q) {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (segCross(p[i], p[(i + 1) % 4], q[j], q[(j + 1) % 4])) return true;
  return insideQuad(p[0], q) || insideQuad(q[0], p);
}

export function runGridChecks({ section, ok, random }) {
  const minPx = GRID_DEFAULTS.minPx;
  const stats = { holeMax: 0, ratioMax: 0, ratioMin: Infinity, gaps: 0, arcs: 0, labels: 0, inner: 0, corners: '' };

  // Lines of a grid in one plane: { r: [[v, lo, hi]], x: [[w, lo, hi]] } with the rim and the axis.
  function linesOf(g, famR) {
    const r = [[0, -Infinity, Infinity]], x = [[0, 0, Infinity]];
    for (let a = 0; a < g.count; a++) {
      const f = g.family[a];
      if (f === famR) r.push([g.value[a], g.ends[2 * a], g.ends[2 * a + 1]]);
      else if (f === OTHER[famR]) x.push([g.value[a], g.ends[2 * a], g.ends[2 * a + 1]]);
    }
    return { r, x };
  }

  function checkArcs(g, what) {
    const lines = { [FAM_R]: null, [FAM_G]: null };
    for (let a = 0; a < g.count; a++) {
      const o = a * STRIDE, f = g.family[a], v = g.value[a], A = g.arcs;
      const S = [A[o + SX], A[o + SY]], E = [A[o + EX], A[o + EY]];
      if (f === FAM_RIM || f === FAM_RING) { ok(A[o + TU] === 1 && A[o + CX] === 0 && A[o + CY] === 0 && Math.abs(Math.hypot(...S) - A[o + RR]) < 1e-15, `${what}: full circle ${f}`); continue; }
      if (f === FAM_AXIS) { ok(A[o + RR] === Infinity && S[1] === 0 && E[1] === 0 && S[0] >= -1 && E[0] <= 1 && S[0] < E[0], `${what}: real axis`); continue; }
      stats.arcs++;
      const [cx, cy, R] = circleOf(f, v);
      ok(Math.abs(A[o + CX] - cx) <= 1e-9 * Math.max(1, Math.abs(cx)) && Math.abs(A[o + CY] - cy) <= 1e-9 * Math.max(1, Math.abs(cy)) && Math.abs(A[o + RR] - R) <= 1e-9 * R,
        `${what}: arc ${f} ${v} centre (${A[o + CX]}, ${A[o + CY]}) r ${A[o + RR]} vs (${cx}, ${cy}) ${R}`);
      const sw = A[o + SW];
      ok(Number.isFinite(sw) && Math.abs(sw) < TAU && sw !== 0, `${what}: sweep ${sw}`);
      let worst = 0;
      for (const P of [S, E, [A[o + MX], A[o + MY]]]) worst = Math.max(worst, Math.abs(Math.hypot(P[0] - cx, P[1] - cy) - R), Math.hypot(...P) - 1);
      ok(worst <= 1e-9, `${what}: ends of ${f} ${v} on its circle and in the disc (${worst})`);
      // each end on the circle of the other family's value at it (r = 0: the unit circle; x = 0: the real axis)
      for (let e = 0; e < 2; e++) {
        const ev = g.ends[2 * a + e], P = e ? E : S, oc = circleOf(OTHER[f], ev);
        const res = oc ? Math.abs(Math.hypot(P[0] - oc[0], P[1] - oc[1]) - oc[2]) : Math.abs(P[1]);
        ok(res <= 1e-9, `${what}: end ${e} of ${f} ${v} on ${OTHER[f]} ${ev} (${res})`);
      }
      // S turned by the sweep about C gives E, by half of it M; the flags of geometry.ts's arcFlags
      const turn = (t) => { const ax = S[0] - cx, ay = S[1] - cy, c = Math.cos(t), s = Math.sin(t); return [cx + ax * c - ay * s, cy + ax * s + ay * c]; };
      const e1 = turn(sw), m1 = turn(sw / 2);
      ok(Math.hypot(e1[0] - E[0], e1[1] - E[1]) <= 1e-9 && Math.hypot(m1[0] - A[o + MX], m1[1] - A[o + MY]) <= 1e-9, `${what}: sweep of ${f} ${v} turns S into E`);
      ok(g.flags[a] === ((Math.abs(sw) > Math.PI ? 2 : 0) | (sw < 0 ? 1 : 0)), `${what}: flags of ${f} ${v}`);
      // the point at the middle value lies on the arc (within the sweep from S)
      const sg = f >= FAM_G ? -1 : 1, mid = 0.5 * (g.ends[2 * a] + g.ends[2 * a + 1]);
      const P = f === FAM_R || f === FAM_G ? gam(v, mid) : gam(mid, v);
      P[0] *= sg; P[1] *= sg;
      const ax = S[0] - cx, ay = S[1] - cy, bx = P[0] - cx, by = P[1] - cy;
      let phi = Math.atan2(ax * by - ay * bx, ax * bx + ay * by); if (sw < 0) phi = -phi; if (phi < 0) phi += TAU;
      ok(phi <= Math.abs(sw) + 1e-9, `${what}: the middle value of ${f} ${v} is on the arc`);
      // in the region the grid covers: some point of the arc within it
      let seen = false;
      for (let s = 0; s <= 64 && !seen; s++) { const p = turn(sw * s / 64); seen = inWin(g.covers, p[0], p[1], -Math.abs(sw) * R / 32); }
      ok(seen, `${what}: arc ${f} ${v} meets the window`);
      // an end strictly inside the window and off the rim lies on a drawn line of the other family
      const fr = f === FAM_R || f === FAM_X ? FAM_R : FAM_G;
      if (!lines[fr]) lines[fr] = linesOf(g, fr);
      for (let e = 0; e < 2; e++) {
        const P2 = e ? E : S, ev = g.ends[2 * a + e];
        if (!inWin(g.covers, P2[0], P2[1], 1e-9) || Math.hypot(...P2) > 1 - 1e-9) continue;
        const isR = f === FAM_R || f === FAM_G, list = isR ? lines[fr].x : lines[fr].r;
        const hit = list.some(([w, lo, hi]) => w === ev && lo <= v + 1e-12 * Math.abs(lo) && v <= hi + 1e-12 * Math.abs(hi));
        ok(hit, `${what}: end ${e} of ${f} ${v} (at ${ev}) lies on a drawn line`);
      }
    }
  }

  function checkLabels(g, what) {
    const L = g.labels, Q = L.map((l) => corners(l, g.k));
    let bad = 0;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (quadsOverlap(Q[i], Q[j])) { bad++; if (bad < 3) ok(false, `${what}: labels ${L[i].text} and ${L[j].text} overlap`); }
    ok(bad === 0, `${what}: no two of ${L.length} labels overlap`);
    stats.labels += L.length;
    for (const l of L) {
      ok(Number.isFinite(l.x) && Number.isFinite(l.y) && l.rotate >= -90 && l.rotate < 90 && l.w > 0, `${what}: label ${l.text} is finite`);
      ok(Math.abs(Number(l.text.replace('−', '-')) - l.value) <= 1e-9 * Math.max(1, Math.abs(l.value)) + (l.kind >= LBL_ANGLE ? 0.5 * 10 ** -((l.text.split('.')[1] ?? '').length) : 0), `${what}: label text ${l.text} is ${l.value}`);
      if (l.inner) {
        // a label in the field: centred on its own line, inside the disc and the window, repeatPx from the line's others
        const a = l.arc, [cx, cy, R] = circleOf(l.kind, l.value); // already in the Γ plane (g, b turned by π)
        ok(g.family[a] === l.kind && g.value[a] === l.value && g.cls[a] === CLS_MAJOR, `${what}: inner label ${l.text} names its arc`);
        ok(Math.abs(Math.hypot(l.x - cx, l.y - cy) - R) <= 1e-9 * Math.max(1, R) && Math.hypot(l.x, l.y) < 1 && inWin(g.covers, l.x, l.y),
          `${what}: inner label ${l.text} on its line in the disc`);
        const tang = Math.atan2(-(l.x - cx), -(l.y - cy)) * 180 / Math.PI; // screen tangent, y down
        let dr = (l.rotate - tang) % 180; if (dr > 90) dr -= 180; if (dr < -90) dr += 180;
        ok(Math.abs(dr) < 1e-6, `${what}: inner label ${l.text} turned along its line (${dr})`);
        for (const m of L) if (m !== l && m.arc === a && Math.hypot(m.x - l.x, m.y - l.y) * g.k < g.settings.repeatPx * (1 - 1e-9)) ok(false, `${what}: two labels of ${l.text} closer than repeatPx`);
      } else if (l.kind <= LBL_B) {
        const a = l.arc, sg = l.kind >= LBL_G ? -1 : 1;
        ok(g.family[a] === l.kind && g.value[a] === l.value && g.cls[a] === CLS_MAJOR, `${what}: label ${l.text} names its arc`);
        const P = l.kind === LBL_R || l.kind === LBL_G ? gam(l.value, 0) : gam(0, l.value);
        const dpx = Math.hypot(sg * P[0] - l.x, sg * P[1] - l.y) * g.k;
        ok(dpx <= l.w / 2 + l.h + 4 && inWin(g.covers, l.x, l.y), `${what}: label ${l.text} beside its line (${dpx.toFixed(1)} px)`);
      } else {
        const th = Math.atan2(l.y, l.x);
        const want = l.kind === LBL_ANGLE ? l.value * Math.PI / 180 : l.kind === LBL_WTG ? Math.PI - 4 * Math.PI * l.value : Math.PI + 4 * Math.PI * l.value;
        let d = (th - want) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
        ok(Math.abs(d) <= 1e-9, `${what}: scale label ${l.kind} ${l.text} at its angle (${d})`);
      }
    }
  }

  function checkTicks(g, what) {
    const per = [[], []];
    for (let t = 0; t < g.tickCount; t++) {
      const o = 4 * t, th = Math.atan2(g.ticks[o + 1], g.ticks[o]), v = g.tickValue[t];
      const want = g.tickScale[t] === SCALE_ANGLE ? v * Math.PI / 180 : Math.PI - 4 * Math.PI * v;
      let d = (th - want) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
      const th2 = Math.atan2(g.ticks[o + 3], g.ticks[o + 2]);
      ok(Math.abs(d) <= 1e-9 && Math.abs(th2 - th) <= 1e-12 && Math.hypot(g.ticks[o + 2], g.ticks[o + 3]) > Math.hypot(g.ticks[o], g.ticks[o + 1]), `${what}: tick ${g.tickScale[t]} ${v} at its angle (${d})`);
      if (g.tickScale[t] === SCALE_ANGLE) ok(v > -180 && v <= 180, `${what}: angle ${v} in (−180, 180]`); else ok(v >= 0 && v < 0.5, `${what}: wavelength ${v} in [0, 0.5)`);
      per[g.tickScale[t]].push([th, Math.hypot(g.ticks[o], g.ticks[o + 1])]);
    }
    for (const list of per) {
      list.sort((a, b) => a[0] - b[0]);
      let gap = Infinity;
      for (let i = 1; i < list.length; i++) gap = Math.min(gap, (list[i][0] - list[i - 1][0]) * list[i][1] * g.k);
      ok(gap >= g.settings.tickMinPx * (1 - 1e-9), `${what}: ticks ${gap.toFixed(2)} px apart`);
    }
  }

  // Spacing at points of the view: the neighbouring drawn lines on each side, along r and along x.
  function checkSpacing(g, k, what, samples = 200) {
    const planes = [];
    if (g.settings.mode & MODE_Z) planes.push([linesOf(g, FAM_R), 1]);
    if (g.settings.mode & MODE_Y) planes.push([linesOf(g, FAM_G), -1]);
    const v = g.view;
    let lowWorst = Infinity, highWorst = 0, holeWorst = 0, tries = 0, done = 0;
    while (done < samples && tries < samples * 50) {
      tries++;
      const px = v.x0 + (v.x1 - v.x0) * random(), py = v.y0 + (v.y1 - v.y0) * random();
      if (px * px + py * py >= 1 || Math.hypot(px - 1, py) * k < 1e-6) continue;
      done++;
      for (const [lines, sg] of planes) {
        const [r, x] = zOf(sg * px, sg * py);
        let rl = -1, ru = Infinity, xl = -Infinity, xu = Infinity;
        for (const [w, lo, hi] of lines.r) if (lo <= x && x <= hi) { if (w <= r && w > rl) rl = w; if (w > r && w < ru) ru = w; }
        for (const [w, lo, hi] of lines.x) if (lo <= r && r <= hi) { if (w <= x && w > xl) xl = w; if (w > x && w < xu) xu = w; }
        const chord = (a, b) => (b[0] === 1 && b[1] === 0 ? Math.hypot(a[0] - 1, a[1]) : Math.hypot(a[0] - b[0], a[1] - b[1]));
        const one = [1, 0];
        const gr = chord(gam(rl, x), ru === Infinity ? one : gam(ru, x));
        const gx = chord(xl === -Infinity ? one : gam(r, xl), xu === Infinity ? one : gam(r, xu));
        for (const [c, finite] of [[gr, ru !== Infinity], [gx, xl !== -Infinity && xu !== Infinity]]) {
          if (finite) { lowWorst = Math.min(lowWorst, c * g.k); highWorst = Math.max(highWorst, c * g.k); } else holeWorst = Math.max(holeWorst, c * g.k);
          stats.gaps++;
        }
      }
    }
    stats.holeMax = Math.max(stats.holeMax, holeWorst / minPx);
    ok(holeWorst <= HOLE * minPx, `${what}: the last lines before Γ = 1 ${holeWorst.toFixed(1)} px from it at the level's k (≤ ${HOLE * minPx})`);
    ok(lowWorst >= minPx * (1 - 1e-9), `${what}: neighbouring lines ${lowWorst.toFixed(2)} px apart at the level's k (≥ ${minPx})`);
    ok(highWorst <= BAND * minPx, `${what}: widest gap ${highWorst.toFixed(1)} px at the level's k (≤ ${BAND * minPx})`);
    ok(highWorst * k / g.k <= BAND * K_SPAN * minPx && lowWorst * k / g.k >= minPx * (1 - 1e-9), `${what}: spacing at k = ${k.toFixed(0)} within the band`);
    stats.ratioMax = Math.max(stats.ratioMax, highWorst / minPx);
    stats.ratioMin = Math.min(stats.ratioMin, lowWorst / minPx);
  }

  const viewAt = (cx, cy, k, W, H) => ({ x0: cx - W / 2 / k, x1: cx + W / 2 / k, y0: cy - H / 2 / k, y1: cy + H / 2 / k });
  const K0 = 200; // whole chart: 460 px for Γ in [−1.15, 1.15]
  const sizes = [[460, 460], [1000, 400], [300, 800]];
  const centres = [[0, 0], [0, 0.97], [0.97, 0], [1, 0], [-0.96, 0.1], [0.6, -0.75]];

  // ------------------------------------------------------------------------------------------------------------
  section('grid: circles and ends');
  const zoomGrids = [];
  for (const [W, H] of sizes) for (const [cx, cy] of centres) for (const Z of [1, 4, 16, 64, 256]) {
    if (Z === 1 && (cx || cy)) continue;
    const k = K0 * Z, view = viewAt(Z === 1 ? 0 : cx, Z === 1 ? 0 : cy, k, W, H);
    for (const mode of W === 460 ? [MODE_Z, MODE_Y, MODE_ZY] : [MODE_Z]) {
      const g = buildGrid(view, densityLevel(k), { mode, inner: Z > 1 });
      const what = `${W}×${H} ${mode === 1 ? 'Z' : mode === 2 ? 'Y' : 'ZY'} ${Z}× at (${cx}, ${cy})`;
      zoomGrids.push([g, k, what]);
      checkArcs(g, what);
      let nan = false;
      for (const x of g.arcs) if (x !== x) nan = true;
      ok(!nan, `${what}: no NaN`);
    }
  }

  section('grid: labels');
  for (const [g, , what] of zoomGrids) checkLabels(g, what);
  for (const [mode, famR, famX] of [[MODE_Z, LBL_R, LBL_X], [MODE_Y, LBL_G, LBL_B]]) {
    const g = buildGrid(viewAt(0, 0, K0, 460, 460), densityLevel(K0), { mode });
    for (const v of [0.2, 0.5, 1, 2, 5]) {
      ok(g.labels.some((l) => l.kind === famR && l.value === v), `whole chart labels ${famR === LBL_R ? 'r' : 'g'} = ${v}`);
      for (const s of [1, -1]) ok(g.labels.some((l) => l.kind === famX && l.value === s * v), `whole chart labels ${famX === LBL_X ? 'x' : 'b'} = ${s * v}`);
    }
  }

  {
    // zoomed into the field, away from the axis and the rim, lines of both families are labelled inside the view
    for (const [cx, cy] of [[0.3, 0.25], [-0.4, -0.5], [0.5, 0.6]]) for (const Z of [3, 16, 64, 256]) for (const mode of [MODE_Z, MODE_Y]) {
      const k = K0 * Z, view = viewAt(cx, cy, k, 390, 520), g = buildGrid(view, densityLevel(k), { mode, inner: true });
      const what = `inner labels ${Z}× at (${cx}, ${cy}) ${mode === MODE_Z ? 'Z' : 'Y'}`;
      checkLabels(g, what);
      const seen = [0, 0];
      for (const l of g.labels) if (l.inner && inWin(view, l.x, l.y)) seen[l.kind & 1]++;
      ok(seen[0] + seen[1] >= 2 && (Z < 16 || (seen[0] >= 1 && seen[1] >= 1)), `${what}: ${seen[0]} ${mode === MODE_Z ? 'r' : 'g'} and ${seen[1]} ${mode === MODE_Z ? 'x' : 'b'} labels in the view`);
      stats.inner += seen[0] + seen[1];
    }
    // the whole chart has none
    ok(!buildGrid(viewAt(0, 0, K0, 460, 460), densityLevel(K0), { inner: false }).labels.some((l) => l.inner), 'whole chart: no inner labels');
  }

  section('grid: region outlines');
  {
    // Stairs in the outline of the fine regions: three neighbouring drawn lines of one family, equally spaced, whose
    // outer ends (inside the window, off the rim) step down at each line. Single cells make such steps along every
    // outline; with whole blocks the lines inside a block end together and a block's bounding line is a coarser one.
    // Counted for the default rule and for single cells (blocks: Infinity) on the same views, away from Γ = 1 (Γ = −1
    // for g and b), where every line meets and the last few cells of each step cannot form whole blocks.
    const NEAR_TIP_PX = 150;
    const corners = (g, famR, famX) => {
      let c = 0, ends = 0;
      for (const fam of [famR, famX]) {
        const list = [];
        for (let a = 0; a < g.count; a++) {
          if (g.family[a] !== fam || g.value[a] <= 0) continue;
          const o = a * STRIDE, ex = g.arcs[o + EX], ey = g.arcs[o + EY];
          const tip = fam === FAM_G || fam === FAM_B ? -1 : 1;
          const real = inWin(g.covers, ex, ey, 1e-9) && Math.hypot(ex, ey) < 1 - 1e-9 && Math.hypot(ex - tip, ey) * g.k >= NEAR_TIP_PX;
          list.push([g.value[a], real ? g.ends[2 * a + 1] : NaN]);
        }
        list.sort((p, q) => p[0] - q[0]);
        for (let i = 2; i < list.length; i++) {
          const [v1, e1] = list[i - 2], [v2, e2] = list[i - 1], [v3, e3] = list[i];
          if (!(e1 === e1 && e2 === e2 && e3 === e3) || Math.abs((v3 - v2) - (v2 - v1)) > 1e-9 * v3) continue;
          ends++;
          if (e1 > e2 * (1 + 1e-12) && e2 > e3 * (1 + 1e-12)) c++;
        }
      }
      return [c, ends];
    };
    let cb = 0, cc = 0, eb = 0, ec = 0;
    for (const [W, H] of sizes) for (const [cx, cy] of [[0, 0], ...centres, [0.3, 0.25], [-0.4, -0.5]]) for (const Z of [1, 3, 16, 64, 256]) {
      const k = K0 * Z, view = viewAt(Z === 1 ? 0 : cx, Z === 1 ? 0 : cy, k, W, H);
      const [c1, e1] = corners(buildGrid(view, densityLevel(k)), FAM_R, FAM_X);
      const [c2, e2] = corners(buildGrid(view, densityLevel(k), { blocks: Infinity }), FAM_R, FAM_X);
      cb += c1; eb += e1; cc += c2; ec += e2;
    }
    stats.corners = `${cb} stairs in ${eb} triples of ending lines with whole blocks, ${cc} in ${ec} with single cells`;
    ok(cb <= 0.4 * cc, `region outlines: ${stats.corners} (≤ 40 %; the rest are steps whose region is under four blocks deep)`);
  }

  section('grid: spacing');
  for (const [g, k, what] of zoomGrids) checkSpacing(g, k, what);
  {
    // finer values appear when zooming in: the finest step between r lines near r = 1 at the centre
    const steps = [];
    for (const Z of [1, 4, 16, 64, 256]) {
      const k = K0 * Z, g = buildGrid(viewAt(0, 0, k, 460, 460), densityLevel(k));
      const vals = [];
      for (let a = 0; a < g.count; a++) if (g.family[a] === FAM_R && g.value[a] > 0.8 && g.value[a] < 1.25) vals.push(g.value[a]);
      vals.sort((p, q) => p - q);
      let st = Infinity;
      for (let i = 1; i < vals.length; i++) st = Math.min(st, vals[i] - vals[i - 1]);
      steps.push(st);
    }
    ok(steps.every((st, i) => i === 0 || (st <= steps[i - 1] && (i < 2 || st < steps[i - 2]))), `finer r lines near r = 1 at every 16× of zoom, never coarser (${steps.map((x) => x.toPrecision(2)).join(', ')})`);
  }

  section('grid: stability');
  {
    let flicker = 0;
    for (let t = 0; t < 3000; t++) {
      const k = 2 ** (5 + 12 * random());
      let L = densityLevel(k);
      const seq = [];
      for (let c = 0; c < 3; c++) for (const f of [1.05, 1.05 * 1.05, 1.05, 1]) { L = densityLevel(k * f, L); seq.push(L); }
      for (let i = 4; i < 12; i++) if (seq[i] !== seq[3]) flicker++;
      ok(levelK(L) <= k * 1.05 * 1.05 && k <= levelK(L) * K_SPAN * (1 + 1e-12), `level ${L} serves k = ${k}`);
    }
    ok(flicker === 0, `zooming 1.05× twice to and fro keeps the level after the first pass (${flicker} flips)`);
    // the same set from gridFor after zooming to and fro; same build twice
    const view = viewAt(0.3, 0.2, K0 * 4, 460, 460);
    let g = null; const seen = [];
    for (const f of [1, 1.05, 1.05 * 1.05, 1.05, 1, 1.05, 1.05 * 1.05, 1.05, 1]) { g = gridFor(view, K0 * 4 * f, g); seen.push(g); }
    const same = (a, b) => a.level === b.level && a.count === b.count && a.arcs.every((x, i) => x === b.arcs[i]) && a.labels.length === b.labels.length;
    ok(same(seen[4], seen[8]) && same(seen[3], seen[7]), 'gridFor gives the same grid after zooming 1.05× twice to and fro');
    const b1 = buildGrid(view, 37), b2 = buildGrid(view, 37);
    ok(same(b1, b2) && b1.labels.every((l, i) => l.text === b2.labels[i].text && l.x === b2.labels[i].x), 'the same build twice is identical');
    ok(gridFor(viewAt(0.3 + 0.1 / (K0 * 4), 0.2, K0 * 4, 460, 460), K0 * 4, seen[8]) === seen[8], 'a small pan reuses the grid');
    // panning never changes a line: lines whose ends lie inside both windows are identical
    let compared = 0, differ = 0;
    for (const [cx, cy, Z] of [[0.1, 0.1, 16], [-0.5, 0.4, 16], [0.9, 0.05, 16], [0, 0.3, 2], [0.5, -0.3, 4], [0.97, 0.01, 64]]) {
      const k = K0 * Z, L = densityLevel(k), A = buildGrid(viewAt(cx, cy, k, 460, 460), L), B = buildGrid(viewAt(cx + 0.3 * 460 / k, cy, k, 460, 460), L);
      const index = new Map();
      for (let a = 0; a < B.count; a++) index.set(`${B.family[a]} ${B.value[a]}`, a);
      for (let a = 0; a < A.count; a++) {
        const o = a * STRIDE, b = index.get(`${A.family[a]} ${A.value[a]}`);
        if (A.family[a] > FAM_B || b === undefined) continue;
        const ins = (g, x, y) => inWin(g.covers, x, y, 1e-9);
        for (let e = 0; e < 2; e++) {
          if (!ins(A, A.arcs[o + 2 * e], A.arcs[o + 2 * e + 1]) || !ins(B, A.arcs[o + 2 * e], A.arcs[o + 2 * e + 1])) continue;
          compared++;
          if (A.ends[2 * a + e] !== B.ends[2 * b + e]) differ++;
        }
      }
    }
    ok(compared > 20 && differ === 0, `panning: ${compared} line ends inside both windows, ${differ} differ`);
  }

  section('grid: scales');
  for (const [g, , what] of zoomGrids) checkTicks(g, what);
  {
    const g = buildGrid(viewAt(0, 0, K0, 460, 460), densityLevel(K0));
    const kinds = new Set(g.labels.map((l) => l.kind));
    ok(kinds.has(LBL_ANGLE) && kinds.has(LBL_WTG) && kinds.has(LBL_WTL), 'whole chart has angle, WTG and WTL labels');
    ok(g.labels.some((l) => l.kind === LBL_WTG && l.value === 0.25) && g.labels.some((l) => l.kind === LBL_ANGLE && l.value === 90), 'labels 0.25 λ and 90°');
    ok(g.family.includes(FAM_RING) && g.family.includes(FAM_RIM) && g.family.includes(FAM_AXIS), 'rim, axis and wavelength ring');
    const none = buildGrid(viewAt(0, 0, K0, 460, 460), densityLevel(K0), { scales: false });
    ok(none.tickCount === 0 && none.labels.every((l) => l.kind <= LBL_B), 'scales: false draws no scales');
  }

  section('grid: fuzz');
  for (let t = 0; t < 300; t++) {
    const Z = 2 ** (10 * random()), k = K0 * Z, W = 200 + 1000 * random(), H = 200 + 1000 * random();
    const cx = -1.3 + 2.6 * random(), cy = -1.3 + 2.6 * random(), mode = 1 + Math.floor(3 * random());
    const g = buildGrid(viewAt(cx, cy, k, W, H), densityLevel(k), { mode });
    let nan = false;
    for (const x of g.arcs) if (x !== x) nan = true;
    for (const l of g.labels) if (!(Number.isFinite(l.x) && Number.isFinite(l.y))) nan = true;
    ok(!nan, `fuzz ${t}: no NaN`);
    const what = `fuzz ${t} (${cx.toFixed(3)}, ${cy.toFixed(3)}) ${Z.toFixed(1)}× ${W.toFixed(0)}×${H.toFixed(0)} mode ${mode}`;
    checkArcs(g, what); checkLabels(g, what); checkTicks(g, what); checkSpacing(g, k, what, 40);
  }

  section('grid: timing');
  {
    const time = (view, k, mode, inner = false) => {
      const L = densityLevel(k), ms = [];
      for (let i = 0; i < 40; i++) { const t0 = performance.now(); buildGrid(view, L, { mode, inner }); ms.push(performance.now() - t0); }
      ms.sort((a, b) => a - b);
      return ms[20];
    };
    const rows = [
      ['whole chart Z', viewAt(0, 0, K0, 460, 460), K0, MODE_Z], ['whole chart ZY', viewAt(0, 0, K0, 460, 460), K0, MODE_ZY],
      ['whole chart ZY 1000×400', viewAt(0, 0, K0, 1000, 400), K0, MODE_ZY],
      ['256× centre ZY', viewAt(0, 0, K0 * 256, 460, 460), K0 * 256, MODE_ZY], ['256× near Γ = 1 ZY', viewAt(0.995, 0.002, K0 * 256, 460, 460), K0 * 256, MODE_ZY],
      ['256× near the rim ZY', viewAt(0, 0.995, K0 * 256, 460, 460), K0 * 256, MODE_ZY],
      ['3× field ZY 1440×900 inner labels', viewAt(0.3, 0.25, K0 * 3, 1440, 900), K0 * 3, MODE_ZY, true],
      ['16× field ZY 1440×900 inner labels', viewAt(0.3, 0.25, K0 * 16, 1440, 900), K0 * 16, MODE_ZY, true],
    ];
    const out = [];
    for (const [name, view, k, mode, inner] of rows) {
      const ms = time(view, k, mode, inner);
      out.push(`${name} ${ms.toFixed(3)} ms`);
      ok(ms < 2, `${name}: grid built in ${ms.toFixed(3)} ms (< 2)`);
    }
    console.log(`grid: build ${out.join(', ')}`);
    console.log(`grid: ${stats.arcs} arcs and ${stats.labels} labels checked; spacing over ${stats.gaps} gaps ${stats.ratioMin.toFixed(2)}–${stats.ratioMax.toFixed(2)} × minPx at the level's k (band ${minPx}–${BAND * minPx} px, ≤ ${(BAND * K_SPAN * minPx).toFixed(0)} px at any k shown), last lines up to ${stats.holeMax.toFixed(2)} × minPx from Γ = 1`);
    console.log(`grid: ${stats.inner} inner labels in the views checked; region outlines: ${stats.corners}`);
  }
}
