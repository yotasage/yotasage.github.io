// The circuit's path on the chart (step M3.2, engine.md §5 and §9, D10): framework-free, written into the chart
// controller's top layer at most once per frame. In ChartView's `world` group (Γ frame, one transform per frame): the
// goal's "close enough" circle, a halo under the selected arc and every part's arc from its node towards the source,
// as exact SVG arcs from geometry.ts's arc layout (full turns of long lines as pairs of half circles), rewritten only
// when the circuit changes or the controller sets its frame again. In the `screen` group (box px, placed every frame
// the view changed): the goal mark and a dashed line from the input to it, an arrow on every arc in its direction of
// travel (load → source) and a numbered marker at every node, all of constant size. Picking (hover, tap, click) is a
// geometric test against the same data, so no DOM hit testing is involved.

import { magFromVswr } from '../../lib/smith/convert';
import {
  ARC_CX, ARC_CY, ARC_EX, ARC_EY, ARC_MX, ARC_MY, ARC_R, ARC_STRIDE, ARC_SWEEP, ARC_SX, ARC_SY, ARC_TURNS, partArcs,
} from '../../lib/smith/geometry';
import { NODE_STRIDE, evaluate, nodeGamma } from '../../lib/smith/network';
import type { Circuit } from '../../lib/smith/network';
import { PART_STRIDE, packParts } from '../../lib/smith/parts';
import { ChartView, DIRTY_CONTENT, DIRTY_VIEW } from './chartView';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAU = 2 * Math.PI;

/** What is selected or hot: nothing, a part (index from the load) or a node (0 the load, n the input). */
export const SEL_NONE = 0;
export const SEL_PART = 1;
export const SEL_NODE = 2;

/** The goal of engine.md §8 until M4 makes it a choice: the match (Γ = 0), close enough within VSWR 1.5. */
export const GOAL_VSWR = 1.5;
export const GOAL_MAG = magFromVswr(GOAL_VSWR);

/** A part's colour, the same for its tile in the strip, its arc and its arrow. */
export const partColour = (index: number): string => `var(--part-${(index % 8) + 1})`;

/** A node's short label on the chart and in the table: L the load, k between parts k and k + 1, In the input. */
export const nodeLabel = (k: number, n: number): string => (k === 0 ? 'L' : k === n ? 'In' : String(k));
/** A node's name in the table. */
export const nodeName = (k: number, n: number): string =>
  k === 0 ? (n === 0 ? 'Load = input' : 'Load') : k === n ? 'Input' : `Between ${k} and ${k + 1}`;

/** An arc flatter than this (sagitta in px) is drawn as its chord. */
const FLAT_PX = 0.02;
/** Above this radius in px, SVG engines (single precision centre) misplace an `A` arc: such arcs become polylines of
 * points on the exact circle, within a quarter px of it (at most a few thousand points, only at deep zoom). */
const BIG_R_PX = 1e5;
const POLY_TOL_PX = 0.25;
const POLY_CAP = 4096;
/** The longest piece of an `A` command (radians); see arcPath. */
const PIECE = 0.6 * Math.PI;
/** Arrows only on arcs at least this long in px; markers and arrows are hidden this far outside the box. */
const ARROW_MIN_PX = 28;
const EDGE_PX = 24;
/** Pick radius in px around a marker (its own radius is 9) and around an arc. */
const PICK_NODE_PX = 13;
const PICK_ARC_PX = 10;
/** The dashed line from the input to the goal is drawn when they are at least this far apart in px. */
const GOAL_LINE_PX = 16;
/** The goal's ring is dashed up to this radius in px, solid beyond. */
const RING_DASH_PX = 600;

// Codes of a pick: part i is i + 1, node k is −(k + 1), nothing 0.
const codeKind = (code: number): number => (code > 0 ? SEL_PART : code < 0 ? SEL_NODE : SEL_NONE);
const codeIndex = (code: number): number => (code > 0 ? code - 1 : code < 0 ? -code - 1 : -1);
const toCode = (kind: number, index: number): number => (kind === SEL_PART && index >= 0 ? index + 1 : kind === SEL_NODE && index >= 0 ? -index - 1 : 0);

const span = (attrs: Record<string, string>): HTMLSpanElement => {
  const e = document.createElement('span');
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

export class PathLayer {
  readonly view: ChartView;
  /** Called when the visitor picks an arc or a node on the chart (tap or click). */
  onPick: ((kind: number, index: number) => void) | null = null;

  /** The evaluated circuit at f0: count parts, nodes (network.ts), arcs (geometry.ts), Γ of every node (re, im). */
  count = 0;
  nodes = new Float64Array(NODE_STRIDE);
  arcs = new Float64Array(0);
  gamma = new Float64Array(2);
  private parts: Float64Array = new Float64Array(0);

  /** Script time of the layer's frames, for the harness. */
  frames = 0; ms = 0; lastMs = 0;

  private readonly worldGroup: SVGGElement;
  private readonly arcGroup: SVGGElement;
  private readonly halo: SVGPathElement;
  private readonly ring: SVGCircleElement;
  private readonly overlay: HTMLDivElement;
  private readonly goal: HTMLSpanElement;
  private readonly goalLine: HTMLSpanElement;
  private arcEls: SVGPathElement[] = [];
  private arrowEls: HTMLSpanElement[] = [];
  private nodeEls: HTMLSpanElement[] = [];
  private d: string[] = [];
  private shown = new Uint8Array(0); // bit 0 node marker shown, bit 1 arrow shown
  private goalShown = 0;

  private sel = 0;
  private chartHot = 0;
  private listHot = 0;
  private drawnHot = 0;
  private drawnSel = 0;
  private stale = true;
  private marks = true;
  private drawnFrame = -1;

  constructor(view: ChartView) {
    this.view = view;
    this.worldGroup = el('g', { 'data-layer': 'path' });
    this.ring = el('circle', { 'data-goal-ring': '' });
    this.halo = el('path', { 'data-halo': '', d: '' });
    this.arcGroup = el('g', { 'data-arcs': '' });
    this.worldGroup.append(this.ring, this.halo, this.arcGroup);
    view.world.appendChild(this.worldGroup);

    // Constant-size marks are HTML elements over the chart, each moved by a CSS transform in one strictly contained
    // box: moving SVG elements costs SVG layout and a repaint of the whole top layer every frame.
    this.overlay = document.createElement('div');
    this.overlay.setAttribute('data-layer', 'path-marks');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.goalLine = span({ 'data-goal-line': '' });
    this.goalLine.hidden = true;
    this.goal = span({ 'data-goal': '' });
    this.overlay.append(this.goalLine, this.goal);
    view.box.appendChild(this.overlay);
    this.build(0);

    const before = view.onFrame;
    view.onFrame = (dirty) => { before?.(dirty); this.frame(dirty); };
    view.onHover = (px, py) => {
      const code = px === px ? this.pickCode(px, py) : 0;
      if (code === this.chartHot) return;
      this.chartHot = code;
      view.box.toggleAttribute('data-pick', code !== 0);
      this.touch();
    };
    view.onTap = (px, py) => {
      const code = this.pickCode(px, py);
      if (code) this.onPick?.(codeKind(code), codeIndex(code));
    };
  }

  // ---------- input from the page ----------

  /** Evaluates the circuit at f0 and redraws the path in the next frame. */
  setCircuit(c: Circuit): void {
    const n = c.parts.length;
    this.parts = packParts(c.parts, this.parts);
    if (this.nodes.length < (n + 1) * NODE_STRIDE) {
      this.nodes = new Float64Array((n + 1) * NODE_STRIDE);
      this.arcs = new Float64Array(n * ARC_STRIDE);
      this.gamma = new Float64Array(2 * (n + 1));
    }
    evaluate(this.nodes, this.parts, n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
    partArcs(this.arcs, this.nodes, this.parts, n, c.z0, c.f0, c.f0);
    for (let k = 0; k <= n; k++) nodeGamma(this.gamma, 2 * k, this.nodes, k * NODE_STRIDE);
    if (n !== this.count || this.nodeEls.length !== n + 1) this.build(n);
    this.count = n;
    this.stale = true;
    this.touch();
  }

  /** The selection (strip, table or a pick on the chart): SEL_PART or SEL_NODE with its index, or SEL_NONE. */
  select(kind: number, index: number): void {
    const code = toCode(kind, index);
    if (code !== this.sel) { this.sel = code; this.touch(); }
  }

  /** A hover or focus in the strip or the table (the chart's own hover takes precedence). */
  hover(kind: number, index: number): void {
    const code = toCode(kind, index);
    if (code !== this.listHot) { this.listHot = code; this.touch(); }
  }

  /** What a tap or click at box px (px, py) would pick: [kind, index]. */
  pick(px: number, py: number): [number, number] {
    const code = this.pickCode(px, py);
    return [codeKind(code), codeIndex(code)];
  }

  private touch(): void {
    this.marks = true;
    this.view.request(DIRTY_CONTENT);
  }

  // ---------- DOM ----------

  private build(n: number): void {
    const arcs: SVGPathElement[] = [], arrows: HTMLSpanElement[] = [], nodes: HTMLSpanElement[] = [];
    for (let i = 0; i < n; i++) {
      const a = el('path', { 'data-arc': String(i), d: '' });
      a.style.stroke = partColour(i);
      arcs.push(a);
      const w = span({ 'data-arrow': String(i) });
      w.hidden = true;
      w.style.color = partColour(i);
      w.innerHTML = ARROW_SVG;
      arrows.push(w);
    }
    for (let k = 0; k <= n; k++) {
      const g = span({ 'data-node': String(k) });
      g.hidden = true;
      if (k === n && n > 0) g.setAttribute('data-end', 'input');
      else if (k === 0) g.setAttribute('data-end', 'load');
      g.textContent = nodeLabel(k, n);
      nodes.push(g);
    }
    this.arcGroup.replaceChildren(...arcs);
    for (const e of this.arrowEls) e.remove();
    for (const e of this.nodeEls) e.remove();
    // Arrows over the goal, markers over the arrows, the input over the nodes it may cover.
    this.overlay.append(...arrows, ...nodes);
    this.arcEls = arcs; this.arrowEls = arrows; this.nodeEls = nodes;
    this.d = new Array(n).fill('');
    this.shown = new Uint8Array(n + 1);
    this.drawnHot = this.drawnSel = 0;
  }

  // ---------- the frame ----------

  private frame(dirty: number): void {
    if (!(dirty & (DIRTY_VIEW | DIRTY_CONTENT))) return;
    const t0 = performance.now();
    const v = this.view;
    if (this.stale || this.drawnFrame !== v.frameId) {
      this.writeWorld();
      this.stale = false;
      this.drawnFrame = v.frameId;
      this.marks = true;
    }
    this.writeScreen();
    if (this.marks) { this.writeMarks(); this.marks = false; }
    this.lastMs = performance.now() - t0;
    this.ms += this.lastMs;
    this.frames++;
  }

  /** The arcs in the world frame: (u, v) = ((Γr − fx)·fk, (fy − Γi)·fk). */
  private writeWorld(): void {
    const { fx, fy, fk } = this.view, arcs = this.arcs;
    for (let i = 0, a = 0; i < this.count; i++, a += ARC_STRIDE) {
      const d = arcPath(arcs, a, fx, fy, fk);
      if (d !== this.d[i]) { this.d[i] = d; this.arcEls[i].setAttribute('d', d); }
    }
    this.ring.setAttribute('cx', String(-fx * fk));
    this.ring.setAttribute('cy', String(fy * fk));
    this.ring.setAttribute('r', String(GOAL_MAG * fk));
    // Dashes are generated along the whole stroke, visible or not: a ring larger than the view is drawn solid.
    this.ring.toggleAttribute('data-solid', GOAL_MAG * fk > RING_DASH_PX);
  }

  /** Markers, arrows and the goal in box px: every frame the view or the circuit changed. */
  private writeScreen(): void {
    const v = this.view, { w, h, k } = v, n = this.count, g = this.gamma, arcs = this.arcs;
    const inBox = (x: number, y: number) => x >= -EDGE_PX && x <= w + EDGE_PX && y >= -EDGE_PX && y <= h + EDGE_PX;
    for (let j = 0; j <= n; j++) {
      const x = v.screenX(g[2 * j]), y = v.screenY(g[2 * j + 1]), e = this.nodeEls[j];
      const on = x === x && y === y && inBox(x, y) ? 1 : 0;
      if (on) e.style.transform = `translate(${x}px,${y}px)`;
      if ((this.shown[j] & 1) !== on) {
        this.shown[j] = (this.shown[j] & 2) | on;
        e.hidden = !on;
      }
    }
    for (let i = 0, a = 0; i < n; i++, a += ARC_STRIDE) {
      let on = 0;
      if (arrowAt(arrow, arcs, a, v.cx, v.cy, k, 0.5 * w, 0.5 * h)) {
        const x = v.screenX(arrow[0]), y = v.screenY(arrow[1]);
        if (inBox(x, y)) {
          on = 2;
          this.arrowEls[i].style.transform = `translate(${x}px,${y}px) rotate(${(Math.atan2(-arrow[3], arrow[2]) * 180) / Math.PI}deg)`;
        }
      }
      if ((this.shown[i] & 2) !== on) {
        this.shown[i] = (this.shown[i] & 1) | on;
        this.arrowEls[i].hidden = !on;
      }
    }
    const x0 = v.screenX(0), y0 = v.screenY(0);
    this.goal.style.transform = `translate(${x0}px,${y0}px)`;
    const xi = v.screenX(g[2 * n]), yi = v.screenY(g[2 * n + 1]);
    let line = xi === xi && yi === yi && Math.hypot(xi - x0, yi - y0) >= GOAL_LINE_PX ? 1 : 0;
    // Only the part inside the box is drawn (a dashed stroke costs per dash, also off screen).
    if (line && clipSegment(seg, xi, yi, x0, y0, -EDGE_PX, -EDGE_PX, w + EDGE_PX, h + EDGE_PX)) {
      const dx = seg[2] - seg[0], dy = seg[3] - seg[1];
      this.goalLine.style.width = `${Math.hypot(dx, dy)}px`;
      this.goalLine.style.transform = `translate(${seg[0]}px,${seg[1]}px) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)`;
    } else line = 0;
    if (line !== this.goalShown) {
      this.goalShown = line;
      this.goalLine.hidden = !line;
    }
  }

  /** The selection and hover attributes and the halo (only when one of them or the arcs changed). */
  private writeMarks(): void {
    const hot = this.chartHot || this.listHot, sel = this.sel;
    if (hot !== this.drawnHot) {
      this.markEl(this.drawnHot, 'data-hot', false);
      this.markEl(hot, 'data-hot', true);
      this.drawnHot = hot;
    }
    if (sel !== this.drawnSel) {
      this.markEl(this.drawnSel, 'data-sel', false);
      this.markEl(sel, 'data-sel', true);
      this.drawnSel = sel;
    }
    const i = sel > 0 && sel <= this.count ? sel - 1 : -1;
    const d = i >= 0 ? this.d[i] : '';
    if (this.halo.getAttribute('d') !== d) this.halo.setAttribute('d', d);
    if (i >= 0) this.halo.style.stroke = partColour(i);
  }

  private markEl(code: number, attr: string, on: boolean): void {
    let e: Element | undefined;
    if (code > 0) e = this.arcEls[code - 1];
    else if (code < 0) e = this.nodeEls[-code - 1];
    if (e) e.toggleAttribute(attr, on);
    if (code > 0 && this.arrowEls[code - 1]) this.arrowEls[code - 1].toggleAttribute(attr, on);
  }

  // ---------- picking ----------

  private pickCode(px: number, py: number): number {
    const v = this.view, n = this.count, g = this.gamma, k = v.k;
    let best = 0, bestD = PICK_NODE_PX;
    // Nodes first (drawn on top), the input before the others when they coincide.
    for (let j = n; j >= 0; j--) {
      const dd = Math.hypot(v.screenX(g[2 * j]) - px, v.screenY(g[2 * j + 1]) - py);
      if (dd < bestD) { bestD = dd; best = -j - 1; }
    }
    if (best) return best;
    bestD = PICK_ARC_PX;
    const gx = v.gammaX(px), gy = v.gammaY(py);
    for (let i = n - 1, a = (n - 1) * ARC_STRIDE; i >= 0; i--, a -= ARC_STRIDE) {
      const dd = arcDistance(this.arcs, a, gx, gy) * k;
      if (dd < bestD) { bestD = dd; best = i + 1; }
    }
    return best;
  }
}

const arrow = new Float64Array(4);
const ARROW_SVG = '<svg viewBox="-7 -7 14 14" width="14" height="14"><path d="M6.5 0L-5 -5.5L-2.5 0L-5 5.5Z"/></svg>';
const seg = new Float64Array(4);

/** The part of the segment (x1, y1)–(x2, y2) inside the rectangle into out (Liang–Barsky); false when none. */
function clipSegment(out: Float64Array, x1: number, y1: number, x2: number, y2: number, l: number, t: number, r: number, b: number): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  let u0 = 0, u1 = 1;
  const edge = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const u = q / p;
    if (p < 0) { if (u > u1) return false; if (u > u0) u0 = u; } else { if (u < u0) return false; if (u < u1) u1 = u; }
    return true;
  };
  if (!(edge(-dx, x1 - l) && edge(dx, r - x1) && edge(-dy, y1 - t) && edge(dy, b - y1))) return false;
  out[0] = x1 + u0 * dx; out[1] = y1 + u0 * dy; out[2] = x1 + u1 * dx; out[3] = y1 + u1 * dy;
  return true;
}

/** The SVG path of arc a in world units. */
export function arcPath(arcs: Float64Array, a: number, fx: number, fy: number, fk: number): string {
  const sx = arcs[a + ARC_SX], sy = arcs[a + ARC_SY], ex = arcs[a + ARC_EX], ey = arcs[a + ARC_EY];
  if (!(Math.abs(sx) < Infinity && Math.abs(sy) < Infinity && Math.abs(ex) < Infinity && Math.abs(ey) < Infinity)) return '';
  const R = arcs[a + ARC_R], sweep = arcs[a + ARC_SWEEP], turns = arcs[a + ARC_TURNS];
  const us = (sx - fx) * fk, vs = (fy - sy) * fk, ue = (ex - fx) * fk, ve = (fy - ey) * fk;
  let d = `M${us} ${vs}`;
  if (!(R > 0) || (sweep === 0 && turns === 0)) return sx !== ex || sy !== ey ? `${d}L${ue} ${ve}` : d;
  const r = R * fk;
  if (r === Infinity || (turns === 0 && 2 * r * Math.sin(0.25 * sweep) ** 2 < FLAT_PX)) return `${d}L${ue} ${ve}`;
  const cx = arcs[a + ARC_CX], cy = arcs[a + ARC_CY];
  if (r > BIG_R_PX) {
    // Points on the exact circle, the angle step keeping each chord within POLY_TOL_PX of it.
    const total = sweep + (sweep < 0 || (sweep === 0 && turns > 0) ? -TAU : TAU) * turns;
    const steps = Math.min(POLY_CAP, Math.max(1, Math.ceil(Math.abs(total) / Math.sqrt((8 * POLY_TOL_PX) / r))));
    const a0 = Math.atan2(sy - cy, sx - cx);
    for (let s = 1; s < steps; s++) {
      const t = a0 + (total * s) / steps;
      d += `L${(cx + R * Math.cos(t) - fx) * fk} ${(fy - cy - R * Math.sin(t)) * fk}`;
    }
    return `${d}L${ue} ${ve}`;
  }
  // Pieces of at most PIECE radians: an `A` command near a half circle has its centre fixed only to √ε of its radius
  // (the endpoints' rounding), so full turns and long arcs are cut into well-conditioned pieces of the exact circle.
  // Lines turn clockwise (towards the generator): sweep-flag 1 in SVG's downward y.
  const a0 = Math.atan2(sy - cy, sx - cx), head = `A${r} ${r} 0 0 `;
  if (turns > 0) {
    for (let t = 0; t < turns; t++) {
      for (let j = 1; j < 3; j++) {
        const ang = a0 - (TAU * j) / 3;
        d += `${head}1 ${(cx + R * Math.cos(ang) - fx) * fk} ${(fy - cy - R * Math.sin(ang)) * fk}`;
      }
      d += `${head}1 ${us} ${vs}`;
    }
  }
  if (sweep !== 0) {
    const m = Math.ceil(Math.abs(sweep) / PIECE), flag = sweep < 0 ? 1 : 0;
    for (let j = 1; j < m; j++) {
      const ang = a0 + (sweep * j) / m;
      d += `${head}${flag} ${(cx + R * Math.cos(ang) - fx) * fk} ${(fy - cy - R * Math.sin(ang)) * fk}`;
    }
    d += `${head}${flag} ${ue} ${ve}`;
  }
  return d;
}

/**
 * Where arc a's arrow goes and which way it points, into out (Γr, Γi, dΓr, dΓi): the arc's midpoint, or, when that is
 * outside the view (centre vx, vy, k px per unit, half sizes hw, hh px), the arc's point nearest the view's centre. False when the arc is
 * shorter than ARROW_MIN_PX or a point.
 */
export function arrowAt(out: Float64Array, arcs: Float64Array, a: number, vx: number, vy: number, k: number, hw: number, hh: number): boolean {
  const sx = arcs[a + ARC_SX], sy = arcs[a + ARC_SY], ex = arcs[a + ARC_EX], ey = arcs[a + ARC_EY];
  const R = arcs[a + ARC_R], sweep = arcs[a + ARC_SWEEP], turns = arcs[a + ARC_TURNS];
  if (!(R > 0) || (sweep === 0 && turns === 0) || R === Infinity) {
    const dx = ex - sx, dy = ey - sy;
    if (!(Math.hypot(dx, dy) * k >= ARROW_MIN_PX)) return false;
    out[0] = 0.5 * (sx + ex); out[1] = 0.5 * (sy + ey); out[2] = dx; out[3] = dy;
    return true;
  }
  if (!((Math.abs(sweep) + TAU * turns) * R * k >= ARROW_MIN_PX)) return false;
  const cx = arcs[a + ARC_CX], cy = arcs[a + ARC_CY];
  let px: number, py: number;
  if (sweep !== 0) { px = arcs[a + ARC_MX]; py = arcs[a + ARC_MY]; } else { px = 2 * cx - sx; py = 2 * cy - sy; }
  // Off the view: the arc's point nearest the view's centre, when the arc passes there.
  if (Math.abs(px - vx) * k > hw || Math.abs(py - vy) * k > hh) {
    const t = Math.atan2(vy - cy, vx - cx);
    if (turns > 0 || within(t - Math.atan2(sy - cy, sx - cx), sweep)) { px = cx + R * Math.cos(t); py = cy + R * Math.sin(t); }
  }
  // The tangent in the direction of travel: anticlockwise for a positive sweep; lines (full turns) go clockwise.
  const s = sweep > 0 ? 1 : -1;
  out[0] = px; out[1] = py; out[2] = -s * (py - cy); out[3] = s * (px - cx);
  return true;
}

/** Whether the angle t (radians, any turn) lies on a sweep from 0 (signed, |sweep| < 2π). */
function within(t: number, sweep: number): boolean {
  t %= TAU;
  if (sweep > 0) { if (t < 0) t += TAU; return t <= sweep; }
  if (t > 0) t -= TAU;
  return t >= sweep;
}

/** Distance in Γ from (gx, gy) to arc a. */
export function arcDistance(arcs: Float64Array, a: number, gx: number, gy: number): number {
  const sx = arcs[a + ARC_SX], sy = arcs[a + ARC_SY], ex = arcs[a + ARC_EX], ey = arcs[a + ARC_EY];
  const R = arcs[a + ARC_R], sweep = arcs[a + ARC_SWEEP], turns = arcs[a + ARC_TURNS];
  if (!(R > 0) || (sweep === 0 && turns === 0) || R > 1e6) {
    const dx = ex - sx, dy = ey - sy, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((gx - sx) * dx + (gy - sy) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(gx - sx - t * dx, gy - sy - t * dy);
  }
  const cx = arcs[a + ARC_CX], cy = arcs[a + ARC_CY];
  if (turns > 0 || within(Math.atan2(gy - cy, gx - cx) - Math.atan2(sy - cy, sx - cx), sweep)) {
    return Math.abs(Math.hypot(gx - cx, gy - cy) - R);
  }
  return Math.min(Math.hypot(gx - sx, gy - sy), Math.hypot(gx - ex, gy - ey));
}
