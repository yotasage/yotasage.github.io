// The solver on the chart (step M4.3b, solver.md "On the chart"): framework-free, beside pathLayer.ts in ChartView's
// top layer and under the path. In the `world` group (Γ frame), as exact SVG arcs cut to the unit disk (goalView.ts
// diskArc, drawn by pathLayer.ts arcPath): the goal's ring (a point target's close-enough circle, or the goal's own
// circle), the two circles of the construction (SolveResult.circles at circleNode: A′ in the first unknown's colour,
// B in the second's, or the goal carried back in the goal's colour) and the preview of a solution's path (dashed, the
// colour of text). In an HTML box over the chart (constant size, moved by a CSS transform when the view changes): the
// pole a circle goal cannot reach (goal.ts goalPole, crossed out), the crossings of the two circles (the solutions)
// and the preview's point at the goal's node. Everything is computed when the goal, the outcome or the preview
// changes and written again only when the controller sets its world frame again; a drag frame costs one comparison.

import { goalPole } from '../../lib/smith/goal';
import { diskArc, goalGamma, goalRing } from '../../lib/smith/goalView';
import { ARC_R, ARC_STRIDE, ARC_TURNS, circleIntersect, partArcs } from '../../lib/smith/geometry';
import { NODE_STRIDE, evaluate } from '../../lib/smith/network';
import { packParts } from '../../lib/smith/parts';
import type { SolveResult } from '../../lib/smith/solve';
import { askOf } from '../../lib/smith/state';
import type { Circuit } from '../../lib/smith/state';
import { ChartView, DIRTY_CONTENT, DIRTY_VIEW } from './chartView';
import { arcPath, partColour } from './pathLayer';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The goal's ring is dashed up to this radius in px, solid beyond (dashes cost per dash, also off screen). */
const RING_DASH_PX = 600;
/** Marks are hidden this far outside the box. */
const EDGE_PX = 24;

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
const span = (attr: string): HTMLSpanElement => {
  const e = document.createElement('span');
  e.setAttribute(attr, '');
  e.hidden = true;
  return e;
};

export class SolveLayer {
  readonly view: ChartView;

  /** What is drawn (also read by the harness): the goal's ring (its circle) and the construction's circles. */
  ring = new Float64Array(4);
  ringShown = false;
  circles = new Float64Array(8);
  circleNode = -1;
  shownCircles = 0; // bit k: circle k has a part inside the disk
  /** The crossings drawn (Γ, two numbers each) and how many. */
  crossings = new Float64Array(4);
  crossCount = 0;
  /** The pole drawn (±1, 0 none). */
  pole = 0;
  /** The previewed circuit (null none), its arcs and the point at its goal node. */
  preview: Circuit | null = null;
  previewArcs = new Float64Array(0);
  previewCount = 0;
  readonly previewEnd = new Float64Array(2);

  private readonly group: SVGGElement;
  private readonly ringEl: SVGPathElement;
  private readonly circleEls: SVGPathElement[];
  private readonly previewEl: SVGPathElement;
  private readonly overlay: HTMLDivElement;
  private readonly poleEl: HTMLSpanElement;
  private readonly crossEls: HTMLSpanElement[];
  private readonly endEl: HTMLSpanElement;
  private readonly ringArc = new Float64Array(ARC_STRIDE);
  private readonly circleArcs = new Float64Array(2 * ARC_STRIDE);
  private nodes = new Float64Array(NODE_STRIDE);
  private parts: Float64Array = new Float64Array(0);
  private goalOf: unknown = null;
  private z0Of = NaN;
  private stale = true;
  private marksStale = true;
  private drawnFrame = -1;

  constructor(view: ChartView) {
    this.view = view;
    this.group = el('g', { 'data-layer': 'solve' });
    this.ringEl = el('path', { 'data-goal-ring': '', d: '' });
    this.circleEls = [el('path', { 'data-solve-circle': '0', d: '' }), el('path', { 'data-solve-circle': '1', d: '' })];
    this.previewEl = el('path', { 'data-preview': '', d: '' });
    this.group.append(this.ringEl, ...this.circleEls, this.previewEl);
    // Under the path's arcs.
    view.world.insertBefore(this.group, view.world.firstChild);

    this.overlay = document.createElement('div');
    this.overlay.setAttribute('data-layer', 'solve-marks');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.poleEl = span('data-goal-pole');
    this.crossEls = [span('data-crossing'), span('data-crossing')];
    this.endEl = span('data-preview-end');
    this.overlay.append(this.poleEl, ...this.crossEls, this.endEl);
    view.box.insertBefore(this.overlay, view.box.querySelector('[data-layer="path-marks"]'));

    const before = view.onFrame;
    view.onFrame = (dirty) => { before?.(dirty); this.frame(dirty); };
  }

  /** The goal of the committed circuit: its ring and pole, computed again only when the goal or Z0 changed. */
  setGoal(c: Circuit): void {
    const goal = askOf(c).goal;
    if (goal === this.goalOf && c.z0 === this.z0Of) return;
    this.goalOf = goal; this.z0Of = c.z0;
    goalRing(this.ring, 0, goal, c.z0);
    this.ringShown = diskArc(this.ringArc, 0, this.ring, 0);
    this.ringEl.toggleAttribute('data-open', this.ringShown && this.ringArc[ARC_TURNS] === 0);
    this.ringEl.setAttribute('data-ring-kind', goal.kind);
    this.pole = goalPole(goal);
    this.touch();
  }

  /** The solver's outcome: its two circles (none when it has none) and the crossings of a solved pair. */
  setResult(r: SolveResult | null, c: Circuit | null): void {
    this.shownCircles = 0;
    this.crossCount = 0;
    this.circleNode = r && c ? r.circleNode : -1;
    if (r && c && r.circleNode >= 0) {
      this.circles.set(r.circles);
      for (let k = 0; k < 2; k++) if (diskArc(this.circleArcs, k * ARC_STRIDE, this.circles, 4 * k)) this.shownCircles |= 1 << k;
      const u = r.unknowns, first = u[0]?.part ?? -1;
      // B is the second unknown's locus for a point target; the goal carried back for one unknown and for a family.
      const second = u.length === 2 && r.status !== 'family' && askOf(c).goal.kind === 'point' ? u[1].part : -2;
      this.circleEls[0].style.stroke = first >= 0 ? partColour(first) : 'var(--ink-3)';
      this.circleEls[1].style.stroke = second >= 0 ? partColour(second) : second === -1 ? 'var(--ink-3)' : 'var(--accent)';
      if (r.status === 'solved' && this.shownCircles === 3) {
        const n = circleIntersect(this.crossings, 0, this.circles, 0, this.circles, 4);
        for (let j = 0; j < n; j++) {
          const x = this.crossings[2 * j], y = this.crossings[2 * j + 1];
          if (Math.hypot(x, y) <= 1 + 1e-9) { this.crossings[2 * this.crossCount] = x; this.crossings[2 * this.crossCount + 1] = y; this.crossCount++; }
        }
      }
    }
    this.touch();
  }

  /** A solution's circuit drawn as a preview (null: none). */
  setPreview(c: Circuit | null): void {
    if (c === this.preview) return;
    this.preview = c;
    if (c) {
      const n = c.parts.length;
      if (this.nodes.length < (n + 1) * NODE_STRIDE) this.nodes = new Float64Array((n + 1) * NODE_STRIDE);
      if (this.previewArcs.length < n * ARC_STRIDE) this.previewArcs = new Float64Array(n * ARC_STRIDE);
      this.parts = packParts(c.parts, this.parts);
      evaluate(this.nodes, this.parts, n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
      partArcs(this.previewArcs, this.nodes, this.parts, n, c.z0, c.f0, c.f0);
      this.previewCount = n;
      goalGamma(this.previewEnd, 0, c, askOf(c).goal);
    } else this.previewCount = 0;
    this.view.box.toggleAttribute('data-previewing', !!c);
    this.touch();
  }

  private touch(): void {
    this.stale = true;
    this.marksStale = true;
    this.view.request(DIRTY_CONTENT);
  }

  private frame(dirty: number): void {
    if (!(dirty & (DIRTY_VIEW | DIRTY_CONTENT))) return;
    const v = this.view;
    if (this.stale || this.drawnFrame !== v.frameId) {
      this.writeWorld();
      this.stale = false;
      this.drawnFrame = v.frameId;
    }
    if (this.marksStale || (dirty & DIRTY_VIEW)) { this.writeMarks(); this.marksStale = false; }
  }

  private writeWorld(): void {
    const { fx, fy, fk } = this.view;
    const put = (e: SVGPathElement, d: string) => { if (e.getAttribute('d') !== d) e.setAttribute('d', d); };
    put(this.ringEl, this.ringShown ? arcPath(this.ringArc, 0, fx, fy, fk) : '');
    // Dashes are generated along the whole stroke, visible or not: a ring larger than the view is drawn solid.
    this.ringEl.toggleAttribute('data-solid', this.ringShown && this.ringArc[ARC_R] * fk > RING_DASH_PX);
    for (let k = 0; k < 2; k++) put(this.circleEls[k], this.shownCircles & (1 << k) ? arcPath(this.circleArcs, k * ARC_STRIDE, fx, fy, fk) : '');
    let d = '';
    for (let i = 0; i < this.previewCount; i++) d += arcPath(this.previewArcs, i * ARC_STRIDE, fx, fy, fk);
    put(this.previewEl, d);
  }

  private writeMarks(): void {
    const v = this.view;
    const place = (e: HTMLSpanElement, x: number, y: number, on: boolean) => {
      const sx = v.screenX(x), sy = v.screenY(y);
      const show = on && sx >= -EDGE_PX && sx <= v.w + EDGE_PX && sy >= -EDGE_PX && sy <= v.h + EDGE_PX;
      if (show) e.style.transform = `translate(${sx}px,${sy}px)`;
      if (e.hidden === show) e.hidden = !show;
    };
    place(this.poleEl, this.pole, 0, this.pole !== 0 && this.ringShown);
    for (let j = 0; j < 2; j++) place(this.crossEls[j], this.crossings[2 * j], this.crossings[2 * j + 1], j < this.crossCount);
    place(this.endEl, this.previewEnd[0], this.previewEnd[1], this.previewCount > 0 || (this.preview !== null && this.preview.parts.length === 0));
  }
}
