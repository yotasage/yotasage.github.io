// Checks of the export's figure model and standalone SVG (step M8.1a, lib/smith/figure.ts, figureStyle.ts,
// figureSvg.ts), run by check.mjs with its counters:
// - geometry against the engine, to 1e-9 of the radius: grid circles against the circle equations (written here),
//   every arc's ends on its circle and start + sweep at its end; the path's arcs from node k to node k + 1
//   (evaluateCircuit), each part arc's circle through both its nodes, the goal ring, the construction circles through
//   their crossings, trace points against sweep.ts gammaAt at the trace's frequencies, markers against markerAt;
// - density: neighbouring grid lines at least the density's mm apart on paper (sampled as check-grid.mjs does) at
//   88, 160 and 180 mm, and fewer lines on smaller figures;
// - text: every text ≥ 6 pt, no two label boxes overlapping, every preset size × detail × colour mode;
// - palettes: b&w writes only black and white and every pair of roles shown differs in dash, width or mark;
//   greyscale writes only greys and any two roles with the same dash and mark differ by ≥ 20 % in lightness;
// - SVG: well-formed XML (a small parser written here), width and height in mm, the viewBox, every arc read back from
//   the path data on its circle and ending where the model ends (to the 1e-6 mm the writer rounds to);
// - 27 presets × modes and 20 random option sets build and write without error; timing of a Full figure with a
//   10,000-point trace (build and SVG).

import * as importedFigure from '../../../lib/smith/figure.ts';
import * as importedStyle from '../../../lib/smith/figureStyle.ts';
import * as importedSvg from '../../../lib/smith/figureSvg.ts';
import * as importedSweep from '../../../lib/smith/sweep.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedState from '../../../lib/smith/state.ts';
import * as importedSolve from '../../../lib/smith/solve.ts';
import * as importedGrid from '../../../lib/smith/grid.ts';
import { retried } from './timing.mjs';

const F = importedFigure.default ?? importedFigure;
const ST = importedStyle.default ?? importedStyle;
const SV = importedSvg.default ?? importedSvg;
const S = importedSweep.default ?? importedSweep;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const STATE = importedState.default ?? importedState;
const SOLVE = importedSolve.default ?? importedSolve;
const G = importedGrid.default ?? importedGrid;
const { buildFigure, readWidth, resolveDetail, blankDetail, shownStyles, DETAIL_NAMES, SIZE_PRESETS, MIN_PT, DENSITY_MM, PT_MM } = F;
const { strokeOf, strokeKey, lightness, COLOUR_MODES, ROLE_GRID, ROLE_PART, ROLE_NODE, ROLE_GOAL, ROLE_CONSTRUCTION, ROLE_SOLUTION, ROLE_TRACE, ROLE_MARKER, ROLE_NAMES, SUB_PATH, SUB_LOCUS, SUB_RING } = ST;
const { figureSvg } = SV;
const { sweepCircuit, Trace, runSweep, defaultBand, bandFrequencies, sweepBand, gammaAt, markersAt } = S;
const { evaluateCircuit, METRIC_STRIDE, M_GR, M_GI } = N;
const { SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, QUARTER } = P;
const { defaultCircuit } = STATE;
const { solve } = SOLVE;
const { FAM_R, FAM_X, FAM_G, FAM_B, MODE_Z, MODE_Y } = G;
const TAU = 2 * Math.PI;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

// Circles of the grid, written independently (facts.md eqs. 8–11): centre and radius; null for the real axis.
function circleOf(fam, v) {
  if (fam === FAM_R) return [v / (1 + v), 0, 1 / (1 + v)];
  if (fam === FAM_X) return v === 0 ? null : [1, 1 / v, 1 / Math.abs(v)];
  if (fam === FAM_G) return [-v / (1 + v), 0, 1 / (1 + v)];
  return v === 0 ? null : [-1, -1 / v, 1 / Math.abs(v)];
}
const gam = (r, x) => { const d = (r + 1) * (r + 1) + x * x; return [(r * r + x * x - 1) / d, 2 * x / d]; };
const zOf = (gr, gi) => { const d = (1 - gr) * (1 - gr) + gi * gi; return [(1 - gr * gr - gi * gi) / d, 2 * gi / d]; };

// Corners of a text's box (mm, y up) and the overlap of two convex quads, written independently of figure.ts.
function corners(t) {
  const a = t.rotate * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
  const off = t.anchor === 'start' ? t.w / 2 : 0, cx = t.x + ux * off, cy = t.y + uy * off;
  const hw = t.w / 2 - 1e-9, hh = t.h / 2 - 1e-9;
  return [[cx + ux * hw - uy * hh, cy + uy * hw + ux * hh], [cx - ux * hw - uy * hh, cy - uy * hw + ux * hh],
    [cx - ux * hw + uy * hh, cy - uy * hw - ux * hh], [cx + ux * hw + uy * hh, cy + uy * hw - ux * hh]];
}
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function insideQuad(p, q) { let pos = 0, neg = 0; for (let i = 0; i < 4; i++) { const c = cross(q[i], q[(i + 1) % 4], p); if (c > 0) pos++; else if (c < 0) neg++; } return pos === 4 || neg === 4; }
function segCross(a, b, c, d) { const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d); return d1 * d2 < 0 && d3 * d4 < 0; }
function quadsOverlap(p, q) {
  // bounding boxes first (also keeps near-collinear far edges from reading as crossings by rounding)
  const ext = (r, k) => [Math.min(...r.map((v) => v[k])), Math.max(...r.map((v) => v[k]))];
  const [px0, px1] = ext(p, 0), [qx0, qx1] = ext(q, 0), [py0, py1] = ext(p, 1), [qy0, qy1] = ext(q, 1);
  if (px1 <= qx0 || qx1 <= px0 || py1 <= qy0 || qy1 <= py0) return false;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (segCross(p[i], p[(i + 1) % 4], q[j], q[(j + 1) % 4])) return true;
  return insideQuad(p[0], q) || insideQuad(q[0], p);
}

// A small XML well-formedness check: tags nest and close, attributes are quoted and unique, entities are known.
function parseXml(text) {
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g;
  const stack = [], elements = [];
  let m, root = null;
  while ((m = re.exec(text))) {
    if (m[6]) return { error: `stray < at ${m.index}` };
    if (m[5] !== undefined) {
      if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[5])) return { error: `bad entity at ${m.index}` };
      if (!stack.length && m[5].trim()) return { error: 'text outside the root' };
      continue;
    }
    const [, close, name, attrText, self] = m;
    if (close) {
      if (attrText.trim() || self) return { error: `bad end tag ${name}` };
      const top = stack.pop();
      if (!top || top.name !== name) return { error: `</${name}> closes ${top ? top.name : 'nothing'}` };
      continue;
    }
    const attrs = {};
    for (const a of attrText.matchAll(/([\w:-]+)="([^"]*)"/g)) {
      if (a[1] in attrs) return { error: `attribute ${a[1]} twice on ${name}` };
      if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(a[2])) return { error: `bad entity in ${a[1]}` };
      attrs[a[1]] = a[2];
    }
    const el = { name, attrs, parent: stack.length ? stack[stack.length - 1] : null };
    if (!stack.length) { if (root) return { error: 'two roots' }; root = el; }
    elements.push(el);
    if (!self) stack.push(el);
  }
  if (stack.length) return { error: `${stack[stack.length - 1].name} not closed` };
  return { root, elements };
}

// Path data into subpaths of commands (M, L, A only, absolute, as the writer writes them).
function readPath(d) {
  const subs = [];
  const re = /([MLAZ])([^MLAZ]*)/g;
  let m;
  while ((m = re.exec(d))) {
    const nums = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    if (m[1] === 'M') subs.push({ start: [nums[0], nums[1]], cmds: [] });
    else subs[subs.length - 1].cmds.push({ c: m[1], v: nums });
  }
  return subs;
}

export function runFigureChecks({ section, ok, random }) {
  const pick = (a) => a[Math.floor(random() * a.length)];
  const logU = (lo, hi) => lo * (hi / lo) ** random();
  const stats = { prims: 0, labels: 0, gaps: 0, gapMin: Infinity, svgArcs: 0, sets: 0 };

  function randomCircuit(maxParts) {
    const z0 = pick([50, 50, 75, 100]), f0 = logU(1e6, 1e10), w0 = TAU * f0;
    const count = 1 + Math.floor(random() * maxParts), parts = [];
    for (let k = 0; k < count; k++) {
      const kind = Math.floor(random() * 10), a = logU(0.05, 20);
      switch (kind) {
        case SERIES_R: parts.push({ kind, value: a * z0 }); break;
        case SHUNT_R: parts.push({ kind, value: z0 / a }); break;
        case SERIES_L: parts.push({ kind, value: (a * z0) / w0 }); break;
        case SERIES_C: parts.push({ kind, value: 1 / (w0 * a * z0) }); break;
        case SHUNT_L: parts.push({ kind, value: z0 / (w0 * a) }); break;
        case SHUNT_C: parts.push({ kind, value: a / (w0 * z0) }); break;
        case QUARTER: parts.push({ kind, value: 20 + 100 * random() }); break;
        default: parts.push({ kind, value: 0.02 + 0.96 * random(), zc: 20 + 100 * random() });
      }
    }
    return { z0, f0, loadR: logU(1, 500), loadX: (random() - 0.5) * 600, parts };
  }

  /** A circuit with its trace, markers and (for two unknowns of the first parts) a solve. */
  function inputOf(c, points = 401) {
    const sc = sweepCircuit(c), trace = new Trace();
    runSweep(trace, defaultBand(c.f0, 0.5, points), sc);
    const markers = markersAt(sc, [c.f0 * 0.8, c.f0, c.f0 * 1.2]);
    let solveResult = null;
    if (c.parts.length >= 2) {
      const unknowns = [{ part: 0, param: 'value' }, { part: 1, param: 'value' }];
      const goal = { kind: 'point' };
      try { solveResult = solve({ ...c, ask: { unknowns, goal } }, unknowns, goal); } catch { solveResult = null; }
      c = { ...c, ask: { unknowns, goal } };
    }
    return { circuit: c, trace, markers, solve: solveResult, sc };
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('figure geometry');
  {
    const start = defaultCircuit();
    const inputs = [inputOf(start)];
    for (let i = 0; i < 40; i++) inputs.push(inputOf(randomCircuit(6)));
    // A blank-ish circuit with a full-turn line (several turns) and a mag goal.
    inputs.push(inputOf({ z0: 50, f0: 1e9, loadR: 20, loadX: 30, parts: [{ kind: 6, value: 1.37, zc: 50 }, { kind: 6, value: 0.3, zc: 80 }] }));
    let worst = 0;
    const err = (a, b) => Math.abs(a - b);
    for (const [ci, inp] of inputs.entries()) {
      const c = inp.circuit;
      const fig = buildFigure(inp, { width: pick([88, 160, 180]), detail: 'full', colour: 'colour' });
      const s = fig.scale, tol = 1e-9 * s;
      const ev = evaluateCircuit(c), n = c.parts.length;
      const node = (k) => [ev.metrics[k * METRIC_STRIDE + M_GR] * s, ev.metrics[k * METRIC_STRIDE + M_GI] * s];
      // every arc: start on its circle, start + sweep at its end
      for (const p of fig.prims) {
        stats.prims++;
        if (p.type !== 'arc') continue;
        const e1 = Math.abs(Math.hypot(p.x0 - p.cx, p.y0 - p.cy) - p.r), e2 = Math.abs(Math.hypot(p.x1 - p.cx, p.y1 - p.cy) - p.r);
        const ex = p.cx + p.r * Math.cos(p.start + p.sweep), ey = p.cy + p.r * Math.sin(p.start + p.sweep);
        const e3 = Math.hypot(ex - p.x1, ey - p.y1), e4 = Math.hypot(p.cx + p.r * Math.cos(p.start) - p.x0, p.cy + p.r * Math.sin(p.start) - p.y0);
        const e = Math.max(e1, e2, e3, e4) / Math.max(1, p.r / s);
        worst = Math.max(worst, e / s);
        if (!(e <= tol)) ok(false, `circuit ${ci}: ${ROLE_NAMES[p.role]} arc ends off its circle or sweep by ${(e / s).toExponential(2)} of the radius`);
      }
      // grid lines against the circle equations
      let gridBad = 0;
      for (const l of fig.lines) {
        const p = fig.prims[l.prim], circle = circleOf(l.fam, l.value);
        if (!circle) { if (p.type !== 'line' || Math.abs(p.y0) > tol || Math.abs(p.y1) > tol) gridBad++; continue; }
        const [cx, cy, r] = circle;
        if (p.type === 'line') { gridBad++; continue; }
        if (err(p.cx, cx * s) > tol * Math.max(1, Math.abs(cx)) || err(p.cy, cy * s) > tol * Math.max(1, Math.abs(cy)) || err(p.r, r * s) > tol * Math.max(1, r)) gridBad++;
      }
      ok(gridBad === 0, `circuit ${ci}: ${gridBad} grid lines off their circle equations`);
      // the path: part k's arc from node k to node k + 1
      const path = fig.prims.filter((p) => p.role === ROLE_PART && p.sub === SUB_PATH && !p.key);
      for (const p of path) {
        const [ax, ay] = node(p.index), [bx, by] = node(p.index + 1);
        const e = Math.max(Math.hypot(p.x0 - ax, p.y0 - ay), Math.hypot(p.x1 - bx, p.y1 - by));
        if (!(e <= tol * Math.max(1, Math.hypot(ax, ay) / s))) ok(false, `circuit ${ci}: part ${p.index + 1}'s arc ends ${(e / s).toExponential(2)} off its nodes`);
      }
      ok(path.length <= n && path.length >= c.parts.filter((_, k) => Math.hypot(...node(k).map((v, j) => v - node(k + 1)[j])) > tol).length,
        `circuit ${ci}: ${path.length} path pieces for ${n} parts`);
      // part arcs: the circle passes through both nodes of its part
      for (const p of fig.prims) {
        if (p.role !== ROLE_PART || p.sub !== SUB_LOCUS || p.key) continue;
        const [ax, ay] = node(p.index), [bx, by] = node(p.index + 1);
        const cx = p.type === 'circle' || p.type === 'arc' ? p.cx : NaN;
        if (p.type === 'line') continue;
        const e = Math.max(Math.abs(Math.hypot(ax - cx, ay - p.cy) - p.r), Math.abs(Math.hypot(bx - cx, by - p.cy) - p.r));
        if (!(e <= 1e-8 * Math.max(s, p.r))) ok(false, `circuit ${ci}: part ${p.index + 1} (kind ${c.parts[p.index].kind}, ${JSON.stringify(c.parts[p.index])}) circle misses its nodes by ${(e / s).toExponential(2)}`);
      }
      // goal ring: a point target's close-enough circle about the target (|Γ − Γt| / |1 − Γt*Γ| = m on it)
      const ring = fig.prims.find((p) => p.role === ROLE_GOAL && p.sub === SUB_RING && !p.key);
      if (ring && ring.type !== 'line') {
        const gm = importedSolve && 0.2; // GOAL_MAG = magFromVswr(1.5) = 0.2
        let bad = 0;
        for (let j = 0; j < 8; j++) {
          const t = (ring.type === 'arc' ? ring.start + ring.sweep * j / 7 : j * TAU / 8);
          const x = (ring.cx + ring.r * Math.cos(t)) / s, y = (ring.cy + ring.r * Math.sin(t)) / s;
          if (Math.abs(Math.hypot(x, y) - gm) > 1e-9) bad++;
        }
        ok(bad === 0, `circuit ${ci}: the goal ring (match within VSWR 1.5) is |Γ| = 0.2`);
      }
      // construction circles through the solutions
      const cons = fig.prims.filter((p) => p.role === ROLE_CONSTRUCTION && !p.key);
      for (const m of fig.prims.filter((p) => p.role === ROLE_SOLUTION && !p.key)) {
        for (const q of cons) {
          if (q.type === 'line') continue;
          const e = Math.abs(Math.hypot(m.x - q.cx, m.y - q.cy) - q.r);
          if (!(e <= 1e-8 * Math.max(s, q.r))) ok(false, `circuit ${ci}: a solution ${(e / s).toExponential(2)} off a construction circle`);
        }
      }
      // trace against the engine at the trace's own frequencies
      const tr = fig.prims.find((p) => p.type === 'poly' && p.role === ROLE_TRACE);
      const g = new Float64Array(2);
      if (tr) {
        let e = 0;
        ok(tr.n === inp.trace.n, `circuit ${ci}: ${tr.n} trace points of ${inp.trace.n}`);
        for (let i = 0; i < tr.n; i++) {
          gammaAt(g, 0, inp.sc, inp.trace.freqs[i]);
          e = Math.max(e, Math.hypot(tr.pts[2 * i] / s - g[0], tr.pts[2 * i + 1] / s - g[1]));
        }
        ok(e <= 1e-9, `circuit ${ci}: trace ${e.toExponential(2)} off sweep.ts gammaAt`);
      } else ok(false, `circuit ${ci}: no trace`);
      const marks = fig.prims.filter((p) => p.role === ROLE_MARKER && p.type === 'mark' && !p.key);
      ok(marks.length === inp.markers.length && marks.every((m, j) => Math.hypot(m.x / s - inp.markers[j].gr, m.y / s - inp.markers[j].gi) <= 1e-12),
        `circuit ${ci}: markers at markerAt`);
      const nodes = fig.prims.filter((p) => p.role === ROLE_NODE && p.type === 'mark' && !p.key);
      ok(nodes.every((m) => Math.hypot(m.x - node(m.index)[0], m.y - node(m.index)[1]) <= tol), `circuit ${ci}: nodes at evaluateCircuit`);
    }
    ok(worst <= 1e-9, `arcs within 1e-9 of the radius (worst ${worst.toExponential(2)})`);
    stats.arcWorst = worst;

    // the blank chart: the circuit switched off
    const inp = inputs[0];
    const blank = buildFigure(inp, { width: 88, detail: blankDetail(resolveDetail('full')) });
    ok(blank.prims.every((p) => p.role === ROLE_GRID || p.role === ST.ROLE_SCALE), 'a blank chart (BL47) draws only the grid and the scales');
    const none = buildFigure({ circuit: null }, { width: 88, detail: 'full' });
    ok(none.prims.every((p) => p.role === ROLE_GRID || p.role === ST.ROLE_SCALE), 'no circuit: a blank chart');
    // a view: the box is the window × scale, the width the chosen mm
    const view = { x0: -0.4, y0: -0.3, x1: 0.6, y1: 0.5 };
    const vf = buildFigure(inp, { width: 120, view, detail: 'standard' });
    ok(Math.abs(vf.width - 120) < 1e-12 && Math.abs(vf.height - 120 * 0.8) < 1e-9 && Math.abs(vf.scale - 120) < 1e-12, `a view of 1 × 0.8 at 120 mm: ${vf.width} × ${vf.height} mm`);
    ok(!vf.prims.some((p) => p.role === ST.ROLE_SCALE), 'a view has no perimeter scales');
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('figure options');
  {
    const w = (t) => { const r = readWidth(t); return r ? Math.round(r.mm * 1e9) / 1e9 + (r.linewidth ? ' lw' : '') : null; };
    ok(w('88') === '88' && w('88mm') === '88' && w('8.8 cm') === '88' && w('3.5in') === '88.9' && w('\\linewidth') === '160 lw', 'readWidth: mm, cm, in, \\linewidth');
    ok(w('10mm') === null && w('abc') === null && w('5000') === null, 'readWidth refuses too small, too large and unreadable widths');
    ok(resolveDetail('minimal').density === 'coarse' && resolveDetail({ preset: 'full', legend: false }).legend === false && resolveDetail({ trace: false }).density === 'normal',
      'resolveDetail: presets and items on their own');
    const tiny = buildFigure({ circuit: defaultCircuit() }, { width: 88, fontPt: 3 });
    ok(tiny.fontPt === MIN_PT && tiny.prims.every((p) => p.type !== 'text' || p.pt >= MIN_PT), 'a font size under 6 pt is raised to 6 pt');
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('figure density');
  {
    const minMmOf = (fig) => fig.minMm;
    for (const density of ['coarse', 'normal', 'fine']) {
      const counts = [];
      for (const width of [88, 160, 180]) for (const grid of ['z', 'zy']) {
        const fig = buildFigure({ circuit: null }, { width, detail: { preset: 'standard', density, grid } });
        const s = fig.scale, minMm = minMmOf(fig);
        ok(minMm === DENSITY_MM[density], `${density}: ${minMm} mm`);
        if (grid === 'z') counts.push(fig.lines.length);
        // sample the gaps between neighbouring lines of each family (check-grid.mjs's method, in mm)
        const planes = [[FAM_R, FAM_X, 1]];
        if (grid === 'zy') planes.push([FAM_G, FAM_B, -1]);
        let low = Infinity;
        for (let t = 0; t < 400; t++) {
          const rr = Math.sqrt(random()) * 0.999, a = random() * TAU, px = rr * Math.cos(a), py = rr * Math.sin(a);
          for (const [fr, fx, sg] of planes) {
            const [r, x] = zOf(sg * px, sg * py);
            let rl = -1, ru = Infinity, xl = -Infinity, xu = Infinity;
            const lr = [[0, -Infinity, Infinity]], lx = [[0, 0, Infinity]];
            for (const l of fig.lines) { if (l.fam === fr) lr.push([l.value, l.lo, l.hi]); else if (l.fam === fx) lx.push([l.value, l.lo, l.hi]); }
            for (const [v, lo, hi] of lr) if (lo <= x && x <= hi) { if (v <= r && v > rl) rl = v; if (v > r && v < ru) ru = v; }
            for (const [v, lo, hi] of lx) if (lo <= r && r <= hi) { if (v <= x && v > xl) xl = v; if (v > x && v < xu) xu = v; }
            if (ru !== Infinity && rl >= 0) { const [a1, b1] = gam(rl, x), [a2, b2] = gam(ru, x); low = Math.min(low, Math.hypot(a1 - a2, b1 - b2) * s); }
            if (xl !== -Infinity && xu !== Infinity) { const [a1, b1] = gam(r, xl), [a2, b2] = gam(r, xu); low = Math.min(low, Math.hypot(a1 - a2, b1 - b2) * s); }
            stats.gaps += 2;
          }
        }
        stats.gapMin = Math.min(stats.gapMin, low / minMm);
        ok(low >= minMm * (1 - 1e-9), `${density} ${grid} at ${width} mm: neighbouring lines ${low.toFixed(3)} mm apart (≥ ${minMm})`);
      }
      ok(counts[0] < counts[1] && counts[1] <= counts[2], `${density}: fewer lines at 88 than 160 than 180 mm (${counts.join(', ')})`);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('figure text and palettes');
  const svgCheck = (fig, svg, what) => {
    const x = parseXml(svg);
    if (x.error) { ok(false, `${what}: SVG not well-formed: ${x.error}`); return; }
    const root = x.root;
    ok(root.name === 'svg' && root.attrs.width === `${SV.num(fig.width)}mm` && root.attrs.height === `${SV.num(fig.height)}mm`, `${what}: width ${root.attrs.width}, height ${root.attrs.height}`);
    const vb = root.attrs.viewBox.split(' ').map(Number);
    ok(Math.abs(vb[2] - fig.width) <= 1e-6 && Math.abs(vb[3] - fig.height) <= 1e-6 && Math.abs(vb[0] - fig.box.x0) <= 1e-6 && Math.abs(vb[1] + fig.box.y1) <= 1e-6, `${what}: viewBox in mm`);
    ok(!/var\(|style=|class=|<style/.test(svg), `${what}: no CSS variables or stylesheet`);
    const fonts = new Set([...svg.matchAll(/font-family="([^"]*)"/g)].map((m) => m[1]));
    ok(fonts.size === 1 && fonts.has('sans-serif'), `${what}: the generic font family only`);
    // the colours written
    const colours = new Set([...svg.matchAll(/(?:stroke|fill)="(#[0-9a-f]{6})"/g)].map((m) => m[1]));
    if (fig.colour === 'bw') ok([...colours].every((c) => c === '#000000' || c === '#ffffff'), `${what}: b&w writes ${[...colours].join(' ')}`);
    if (fig.colour === 'grey') ok([...colours].every((c) => c.slice(1, 3) === c.slice(3, 5) && c.slice(3, 5) === c.slice(5, 7)), `${what}: greyscale writes ${[...colours].join(' ')}`);
    // part and grid arcs read back
    const prims = fig.prims.filter((p) => !p.key && (p.role === ROLE_PART || p.role === ROLE_GRID) && p.type !== 'text' && p.type !== 'mark');
    const byKey = new Map();
    for (const p of prims) { const k = `${ROLE_NAMES[p.role]} ${p.sub} ${p.index}`; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(p); }
    const paths = x.elements.filter((e) => e.name === 'path' && e.attrs['data-role'] && e.attrs['data-key'] === undefined);
    let bad = 0, count = 0;
    const seen = new Map();
    for (const e of paths) {
      const k = `${e.attrs['data-role']} ${e.attrs['data-sub']} ${e.attrs['data-index']}`;
      const list = byKey.get(k);
      if (!list) continue;
      const subs = readPath(e.attrs.d);
      let at = seen.get(k) ?? 0;
      for (const sp of subs) {
        const p = list[at++];
        if (!p) { bad++; continue; }
        count++;
        const near = (a, b, c, d) => Math.hypot(a - c, b - d) <= 2e-6;
        if (p.type === 'arc' || p.type === 'line') {
          if (!near(sp.start[0], -sp.start[1], p.x0, p.y0)) { bad++; continue; }
          const last = sp.cmds[sp.cmds.length - 1].v;
          if (!near(last[last.length - 2], -last[last.length - 1], p.x1, p.y1)) { bad++; continue; }
        }
        if (p.type === 'arc' || p.type === 'circle') {
          let total = 0;
          for (const c of sp.cmds) {
            if (c.c === 'L') { if (p.r * (1 - Math.cos(Math.min(Math.abs(p.sweep ?? Math.PI), Math.PI) / 2)) >= 1e-5) bad++; continue; }
            const [rx, ry, , large, flag, ex, ey] = c.v;
            if (Math.abs(rx - p.r) > 1e-6 * Math.max(1, p.r) || rx !== ry || large !== 0) bad++;
            if (Math.abs(Math.hypot(ex - p.cx, -ey - p.cy) - p.r) > 2e-6 * Math.max(1, p.r)) bad++;
            total += flag === 0 ? 1 : -1;
          }
          if (p.type === 'arc' && total !== 0 && Math.sign(total) !== Math.sign(p.sweep)) bad++;
        }
      }
      seen.set(k, at);
    }
    for (const [k, list] of byKey) if ((seen.get(k) ?? 0) !== list.length) bad++;
    stats.svgArcs += count;
    ok(bad === 0, `${what}: ${bad} of ${count} paths read back from the SVG differ from the model`);
  };

  const base = inputOf(defaultCircuit(), 401);
  const rich = inputOf({ z0: 50, f0: 1e9, loadR: 12, loadX: -40, parts: [{ kind: SERIES_L, value: 6e-9 }, { kind: SHUNT_C, value: 3e-12 }, { kind: 6, value: 0.21, zc: 70 }, { kind: 8, value: 0.11, zc: 50 }] });
  for (const [ii, inp] of [base, rich].entries()) {
    for (const size of Object.keys(SIZE_PRESETS)) for (const detail of DETAIL_NAMES) for (const colour of COLOUR_MODES) {
      const what = `circuit ${ii} ${size} ${detail} ${colour}`;
      let fig, svg;
      try { fig = buildFigure(inp, { width: SIZE_PRESETS[size], detail, colour }); svg = figureSvg(fig, { id: 'f' }); } catch (e) { ok(false, `${what}: ${e.message}`); continue; }
      stats.sets++;
      ok(Math.abs(fig.width - SIZE_PRESETS[size]) < 1e-12, `${what}: ${fig.width} mm wide`);
      const texts = fig.prims.filter((p) => p.type === 'text');
      stats.labels += texts.length;
      ok(texts.every((t) => t.pt >= 6), `${what}: a text under 6 pt`);
      const quads = texts.map(corners);
      let overlaps = 0;
      for (let i = 0; i < quads.length; i++) for (let j = i + 1; j < quads.length; j++) if (quadsOverlap(quads[i], quads[j])) { overlaps++; if (overlaps < 3) ok(false, `${what}: "${texts[i].text}" over "${texts[j].text}"`); }
      ok(overlaps === 0, `${what}: ${overlaps} label boxes overlap`);
      ok(texts.every((t) => { const q = corners(t); return q.every(([x, y]) => x >= fig.box.x0 - 1e-9 && x <= fig.box.x1 + 1e-9 && y >= fig.box.y0 - 1e-9 && y <= fig.box.y1 + 1e-9); }), `${what}: every label inside the figure`);
      ok(fig.dropped === 0, `${what}: ${fig.dropped} node or marker labels without a place`);
      // palettes over the roles shown
      const shown = shownStyles(fig).filter((r) => r.role !== ROLE_GRID || r.sub === ST.SUB_Z_MAJOR || r.sub === ST.SUB_Y_MAJOR);
      const strokes = shown.map((r) => strokeOf(colour, r.role, r.sub, r.index));
      if (colour === 'bw') {
        let same = 0;
        for (let i = 0; i < strokes.length; i++) for (let j = i + 1; j < strokes.length; j++) if (strokeKey(strokes[i]) === strokeKey(strokes[j])) { same++; ok(false, `${what}: ${ROLE_NAMES[shown[i].role]} ${shown[i].sub}/${shown[i].index} and ${ROLE_NAMES[shown[j].role]} ${shown[j].sub}/${shown[j].index} look alike`); }
        ok(same === 0, `${what}: every pair of ${shown.length} roles differs in dash, width or mark`);
      }
      if (colour === 'grey') {
        let same = 0;
        for (let i = 0; i < strokes.length; i++) for (let j = i + 1; j < strokes.length; j++) {
          const a = strokes[i], b = strokes[j];
          if (a.dash.join() === b.dash.join() && a.mark === b.mark && Math.abs(lightness(a.colour) - lightness(b.colour)) < 0.2 - 1e-9) {
            same++; ok(false, `${what}: ${ROLE_NAMES[shown[i].role]} and ${ROLE_NAMES[shown[j].role]} same dash, lightness ${lightness(a.colour).toFixed(2)} and ${lightness(b.colour).toFixed(2)}`);
          }
        }
        ok(same === 0, `${what}: greys of ${shown.length} roles ≥ 20 % apart or dashed differently`);
      }
      svgCheck(fig, svg, what);
    }
  }
  // b&w over all eight part styles and every other role at once
  {
    const all = [];
    for (let i = 0; i < 8; i++) { all.push([ROLE_PART, SUB_PATH, i]); all.push([ROLE_PART, SUB_LOCUS, i]); }
    for (const r of [[ROLE_GRID, ST.SUB_Z_MAJOR, -1], [ROLE_GRID, ST.SUB_Y_MAJOR, -1], [ST.ROLE_SCALE, 0, -1], [ROLE_NODE, 0, -1], [ROLE_GOAL, SUB_RING, -1], [ROLE_GOAL, ST.SUB_TARGET, -1], [ROLE_CONSTRUCTION, 0, -1], [ROLE_SOLUTION, 0, -1], [ROLE_TRACE, 0, -1], [ROLE_MARKER, 0, -1]]) all.push(r);
    const keys = all.map(([r, s, i]) => strokeKey(strokeOf('bw', r, s, i)));
    ok(new Set(keys).size === keys.length, `b&w: all ${keys.length} styles differ in dash, width or mark`);
    let greyBad = 0;
    const gs = all.map(([r, s, i]) => strokeOf('grey', r, s, i));
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) {
      if (gs[i].dash.join() === gs[j].dash.join() && gs[i].mark === gs[j].mark && Math.abs(lightness(gs[i].colour) - lightness(gs[j].colour)) < 0.2 - 1e-9) greyBad++;
    }
    ok(greyBad === 0, `greyscale: ${greyBad} pairs of all ${gs.length} styles alike`);
    ok(all.every(([r, s, i]) => { const c = strokeOf('bw', r, s, i); return c.colour === '#000000' && (c.fill === '' || c.fill === '#000000'); }), 'b&w strokes are black');
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('figure random options');
  for (let t = 0; t < 20; t++) {
    const inp = random() < 0.15 ? { circuit: null } : inputOf(randomCircuit(8), 101 + Math.floor(random() * 500));
    const detail = { preset: pick(DETAIL_NAMES) };
    for (const k of ['gridLabels', 'scales', 'path', 'nodes', 'nodeLabels', 'loci', 'goal', 'construction', 'solutions', 'trace', 'markers', 'legend']) if (random() < 0.4) detail[k] = random() < 0.5;
    if (random() < 0.5) detail.density = pick(['coarse', 'normal', 'fine']);
    if (random() < 0.5) detail.grid = pick(['z', 'y', 'zy']);
    let view = null;
    if (random() < 0.4) { const cx = random() * 1.6 - 0.8, cy = random() * 1.6 - 0.8, h = logU(0.02, 0.8), a = 0.5 + random(); view = { x0: cx - h * a, x1: cx + h * a, y0: cy - h, y1: cy + h }; }
    const options = { width: logU(40, 300), detail, colour: pick(COLOUR_MODES), fontPt: random() < 0.3 ? 5 + 5 * random() : undefined, view };
    const what = `random set ${t}`;
    let fig, svg;
    try { fig = buildFigure(inp, options); svg = figureSvg(fig); } catch (e) { ok(false, `${what}: ${e.stack}`); continue; }
    stats.sets++;
    ok(Math.abs(fig.width - options.width) < 1e-9, `${what}: ${fig.width} of ${options.width} mm`);
    ok(fig.prims.every((p) => p.type !== 'text' || p.pt >= 6), `${what}: text ≥ 6 pt`);
    ok(fig.prims.every((p) => p.type === 'text' || p.type === 'mark' || p.type === 'poly' || Object.values(p).every((v) => typeof v !== 'number' || Number.isFinite(v) || v === -1)), `${what}: finite geometry`);
    const texts = fig.prims.filter((p) => p.type === 'text'), quads = texts.map(corners);
    let overlaps = 0;
    let pair = '';
    for (let i = 0; i < quads.length; i++) for (let j = i + 1; j < quads.length; j++) if (quadsOverlap(quads[i], quads[j])) { overlaps++; pair = `"${texts[i].text}" (${ROLE_NAMES[texts[i].role]}) and "${texts[j].text}" (${ROLE_NAMES[texts[j].role]})`; }
    ok(overlaps === 0, `${what}: ${overlaps} label boxes overlap, as ${pair} (${JSON.stringify(options)})`);
    svgCheck(fig, svg, what);
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('figure timing');
  {
    const c = defaultCircuit(), sc = sweepCircuit(c), trace = new Trace();
    const band = { start: c.f0 * 0.2, stop: c.f0 * 5, points: 10_000, log: true };
    runSweep(trace, band, sc, null);
    const inp = { circuit: c, trace, markers: markersAt(sc, [c.f0]), solve: inputOf(c).solve };
    ok(trace.n === 10_000, `a 10,000-point trace (${trace.n})`);
    let fig, svg;
    const build = retried(() => { const t = []; for (let i = 0; i < 15; i++) { const t0 = performance.now(); fig = buildFigure(inp, { width: 180, detail: 'full' }); t.push(performance.now() - t0); } return median(t); }, (v) => v <= 15);
    const write = retried(() => { const t = []; for (let i = 0; i < 15; i++) { const t0 = performance.now(); svg = figureSvg(fig); t.push(performance.now() - t0); } return median(t); }, (v) => v <= 25);
    ok(build.value <= 15, `build of a Full figure at 180 mm with a 10,000-point trace: ${build.value.toFixed(2)} ms (≤ 15)${build.note}`);
    ok(write.value <= 25, `its SVG: ${write.value.toFixed(2)} ms (≤ 25), ${(svg.length / 1024).toFixed(0)} kB${write.note}`);
    stats.buildMs = build.value; stats.svgMs = write.value; stats.kB = svg.length / 1024;
  }

  console.log(`figure: ${stats.prims} primitives against the engine (arcs within ${stats.arcWorst.toExponential(1)} of the radius), ${stats.sets} option sets, ${stats.labels} labels, ${stats.svgArcs} paths read back from SVG, line gaps ≥ ${stats.gapMin.toFixed(2)} × the density's mm over ${stats.gaps} samples; Full 180 mm with 10,000 trace points: build ${stats.buildMs.toFixed(2)} ms, SVG ${stats.svgMs.toFixed(2)} ms (${stats.kB.toFixed(0)} kB)`);
}
