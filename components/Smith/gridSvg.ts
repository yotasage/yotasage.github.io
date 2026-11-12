// The grid layer of the Smith chart: draws a Grid of lib/smith/grid.ts into its own <svg>, imperatively (no React
// children), and rebuilds the DOM only when gridFor returns a new grid (a new density level, a window that left what
// the grid covers, or new options). Every other view change sets one transform.
//
// Coordinates: the grid's user units are pixels at the grid's own k (grid.k = levelK(level)), with the origin at the
// centre of the window it was built for and y pointing down (Γ's y is flipped here, the arcs' flags already include
// the flip). The view transform is then a uniform scale k / grid.k and a translation, so strokes
// (vector-effect: non-scaling-stroke) keep their width and text grows by at most K_SPAN (1.34) before the next level.

import { ARC_CX, ARC_CY, ARC_EX, ARC_EY, ARC_R, ARC_STRIDE, ARC_SWEEP, ARC_SX, ARC_SY, ARC_TURNS } from '../../lib/smith/geometry';
import {
  CLS_MAJOR, FAM_AXIS, FAM_RIM, FAM_RING, FAM_X, Grid, GridOptions, GridWindow, LBL_B, LBL_G, LBL_R, LBL_X, MODE_Z, gridFor, scaleLayout,
  GRID_DEFAULTS,
} from '../../lib/smith/grid';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The paths of the layer, one per kind of line; `data-part` on each is what the styles select. */
export const PART_NAMES = ['axis', 'z-major', 'z-minor', 'y-major', 'y-minor', 'scale'] as const;
const P_AXIS = 0, P_Z_MAJOR = 1, P_Z_MINOR = 2, P_Y_MAJOR = 3, P_Y_MINOR = 4, P_SCALE = 5;

/** Label kinds (`data-kind`): z for r and x, y for g and b, scale for the perimeter scales. */
const kindOf = (kind: number): string => (kind === LBL_R || kind === LBL_X ? 'z' : kind === LBL_G || kind === LBL_B ? 'y' : 'scale');

/** An arc flatter than this (sagitta in px at grid.k) is drawn as a straight segment: SVG engines compute the
 * centre of an `A` command in single precision, which puts the arcs of very large circles off their ends. */
const FLAT_PX = 0.02;

/** Room the chart needs outside the unit circle for the perimeter scales, in px. */
export const SCALE_ROOM_PX = scaleLayout(GRID_DEFAULTS.fontPx).outer;

/** k (px per unit Γ) at which the whole chart, its scales and a small margin fit a box of w × h px. */
export const fitK = (w: number, h: number, marginPx = 6): number => Math.max(24, Math.min(w, h) / 2 - SCALE_ROOM_PX - marginPx);

export class GridLayer {
  readonly svg: SVGSVGElement;
  readonly root: SVGGElement;
  readonly paths: SVGPathElement[] = [];
  readonly labels: SVGGElement;
  grid: Grid | null = null;
  /** Where the grid's user units sit: Γ = (x / kq + ox, oy − y / kq). */
  ox = 0; oy = 0; kq = 1;
  /** Time of the last rebuild: the grid's data and the DOM writes, in ms; number of rebuilds. */
  buildMs = 0; domMs = 0; builds = 0;
  private options: GridOptions = { mode: MODE_Z };
  private view: GridWindow = { x0: 0, y0: 0, x1: 0, y1: 0 };

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
    this.root = document.createElementNS(SVG_NS, 'g');
    for (const name of PART_NAMES) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('data-part', name);
      this.paths.push(p);
      this.root.appendChild(p);
    }
    this.labels = document.createElementNS(SVG_NS, 'g');
    this.root.appendChild(this.labels);
    svg.replaceChildren(this.root);
  }

  /**
   * Shows the chart centred on Γ = (cx, cy) at k px per unit Γ in a box of w × h px. Returns whether the grid was
   * rebuilt. Cheap when the density level and the covered window stay: one setAttribute.
   */
  update(cx: number, cy: number, k: number, w: number, h: number, mode: number): boolean {
    if (!(w > 0 && h > 0 && k > 0)) return false;
    const hw = w / (2 * k), hh = h / (2 * k), v = this.view;
    v.x0 = cx - hw; v.x1 = cx + hw; v.y0 = cy - hh; v.y1 = cy + hh;
    if (this.options.mode !== mode) this.options = { mode };
    const g = gridFor(v, k, this.grid, this.options);
    const rebuilt = g !== this.grid;
    if (rebuilt) this.draw(g);
    const s = k / this.kq;
    this.root.setAttribute('transform', `matrix(${s} 0 0 ${s} ${w / 2 + (this.ox - cx) * k} ${h / 2 - (this.oy - cy) * k})`);
    return rebuilt;
  }

  /**
   * Whether the grid already built can still be shown, stretched, for this view: for the frames of a gesture, which
   * stretch the layer as a whole and call update when it ends. False when there is no grid, the mode differs, the
   * scale is more than 2× off the grid's or part of the chart in view lies outside what the grid holds.
   */
  holds(cx: number, cy: number, k: number, w: number, h: number, mode: number): boolean {
    const g = this.grid;
    if (!g || this.options.mode !== mode || !(w > 0 && h > 0 && k > 0)) return false;
    const s = k / this.kq;
    if (s < 0.5 || s > 2) return false;
    // Only the chart and its scale ring need to be held: the view clipped to their square.
    const R = 1 + (SCALE_ROOM_PX + 2) / this.kq, hw = w / (2 * k), hh = h / (2 * k), c = g.covers;
    const x0 = Math.max(cx - hw, -R), x1 = Math.min(cx + hw, R), y0 = Math.max(cy - hh, -R), y1 = Math.min(cy + hh, R);
    return !(x0 < x1 && y0 < y1 && (x0 < c.x0 || x1 > c.x1 || y0 < c.y0 || y1 > c.y1));
  }

  private draw(g: Grid): void {
    const t0 = performance.now();
    this.grid = g;
    const ox = (g.view.x0 + g.view.x1) / 2, oy = (g.view.y0 + g.view.y1) / 2, kq = g.k;
    this.ox = ox; this.oy = oy; this.kq = kq;
    const arcs = g.arcs, fam = g.family, cls = g.cls, flags = g.flags;
    let dAxis = '', dZMaj = '', dZMin = '', dYMaj = '', dYMin = '', dScale = '';
    for (let a = 0, o = 0; a < g.count; a++, o += ARC_STRIDE) {
      const f = fam[a];
      const sx = (arcs[o + ARC_SX] - ox) * kq, sy = (oy - arcs[o + ARC_SY]) * kq;
      let seg: string;
      if (f === FAM_AXIS) {
        seg = `M${sx} ${sy}L${(arcs[o + ARC_EX] - ox) * kq} ${(oy - arcs[o + ARC_EY]) * kq}`;
      } else if (arcs[o + ARC_TURNS]) {
        // a full circle: two half circles through the point opposite S
        const r = arcs[o + ARC_R] * kq, px = 2 * (arcs[o + ARC_CX] - ox) * kq - sx, py = 2 * (oy - arcs[o + ARC_CY]) * kq - sy;
        seg = `M${sx} ${sy}A${r} ${r} 0 0 1 ${px} ${py}A${r} ${r} 0 0 1 ${sx} ${sy}`;
      } else {
        const r = arcs[o + ARC_R] * kq, ex = (arcs[o + ARC_EX] - ox) * kq, ey = (oy - arcs[o + ARC_EY]) * kq;
        if (r * (1 - Math.cos(0.5 * arcs[o + ARC_SWEEP])) < FLAT_PX) seg = `M${sx} ${sy}L${ex} ${ey}`;
        else seg = `M${sx} ${sy}A${r} ${r} 0 ${flags[a] >> 1} ${flags[a] & 1} ${ex} ${ey}`;
      }
      if (f === FAM_RING) dScale += seg;
      else if (f === FAM_RIM || f === FAM_AXIS) dAxis += seg;
      else if (f <= FAM_X) { if (cls[a] === CLS_MAJOR) dZMaj += seg; else dZMin += seg; }
      else if (cls[a] === CLS_MAJOR) dYMaj += seg; else dYMin += seg;
    }
    const t = g.ticks;
    for (let i = 0, o = 0; i < g.tickCount; i++, o += 4) {
      dScale += `M${(t[o] - ox) * kq} ${(oy - t[o + 1]) * kq}L${(t[o + 2] - ox) * kq} ${(oy - t[o + 3]) * kq}`;
    }
    const p = this.paths;
    p[P_AXIS].setAttribute('d', dAxis);
    p[P_Z_MAJOR].setAttribute('d', dZMaj);
    p[P_Z_MINOR].setAttribute('d', dZMin);
    p[P_Y_MAJOR].setAttribute('d', dYMaj);
    p[P_Y_MINOR].setAttribute('d', dYMin);
    p[P_SCALE].setAttribute('d', dScale);

    const frag = document.createDocumentFragment();
    for (const l of g.labels) {
      const el = document.createElementNS(SVG_NS, 'text');
      const x = (l.x - ox) * kq, y = (oy - l.y) * kq;
      el.setAttribute('x', String(x));
      el.setAttribute('y', String(y));
      if (l.rotate) el.setAttribute('transform', `rotate(${l.rotate} ${x} ${y})`);
      el.setAttribute('data-kind', kindOf(l.kind));
      el.textContent = l.text;
      frag.appendChild(el);
    }
    this.labels.replaceChildren(frag);

    this.builds++;
    this.buildMs = g.buildMs;
    this.domMs = performance.now() - t0;
    const ds = this.svg.dataset;
    ds.level = String(g.level);
    ds.kq = String(kq);
    ds.ox = String(ox);
    ds.oy = String(oy);
    ds.builds = String(this.builds);
    ds.buildMs = String(this.buildMs);
    ds.domMs = String(this.domMs);
  }
}
