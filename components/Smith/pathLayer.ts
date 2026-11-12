// The circuit's path on the chart (step M3.2, engine.md §5 and §9, D10): framework-free, written into the chart
// controller's top layer at most once per frame. In ChartView's `world` group (Γ frame, one transform per frame): the
// goal's "close enough" circle, a halo under the selected arc and every part's arc from its node towards the source,
// as exact SVG arcs from geometry.ts's arc layout (full turns of long lines as pairs of half circles), rewritten only
// when the circuit changes or the controller sets its frame again. In the `screen` group (box px, placed every frame
// the view changed): the goal mark and a dashed line from the input to it, an arrow on every arc in its direction of
// travel (load → source) and a numbered marker at every node, all of constant size. Picking (hover, tap, click) is a
// geometric test against the same data, so no DOM hit testing is involved.
// Step M3.3a adds a handle at the end of every arc (node k + 1 for part k, a ring of the part's colour under the node
// marker, a 44 px touch target found geometrically) and dragging it (engine.md §6): the pointer, less where it grabbed
// the handle, goes to Γ through the view, is projected onto what the part can reach (geometry.ts `project`, lengths
// tracked over turns from the value before), snapped to a grid circle drawn now or a standard value within SNAP_PX
// (not with Alt or with snapping switched off), and the value re-evaluates the ladder; the arcs, marks and readout are
// written in the next frame and the side panel through `onLive`, all outside React. The page's `commit` gets the
// circuit once, on release (`onCommit`). A press that does not move is a tap (the pick of M3.2), a cancel restores.
// Step M3.3b: the draw tool (`arm(kind)`: a dashed ring at the input; a press there appends state.ts's `startPart` at
// the source end and drags its end like a handle; release commits it once, a tap, Escape or a cancel takes it away) and
// the handles' keys: a slider per part (`data-handle-key`) in a still, visually hidden list in the strip's order (source
// first), so neither the tab order nor assistive technology follows elements that move every frame; the focused one
// marks its ring (`data-focus`), and its arrow keys step the value (state.ts `stepValue`; one commit per key, grouped
// per handle by the page's history).

import { formatAmount } from '../../lib/quantity';
import { SeriesId, series, standardValue } from '../../lib/resistor/eseries';
import { magFromVswr } from '../../lib/smith/convert';
import {
  ARC_CX, ARC_CY, ARC_EX, ARC_EY, ARC_MX, ARC_MY, ARC_R, ARC_STRIDE, ARC_SWEEP, ARC_SX, ARC_SY, ARC_TURNS,
  L_A, L_KIND, L_MODE, LOCUS_FIXED, LOCUS_STRIDE, locusPoint, locusValue, nodeLocus, partArcs, project,
} from '../../lib/smith/geometry';
import { FAM_AXIS, FAM_B, FAM_G, FAM_R, FAM_X, MODE_Y } from '../../lib/smith/grid';
import { NODE_STRIDE, evaluate, nodeGamma } from '../../lib/smith/network';
import type { Circuit } from '../../lib/smith/network';
import { PART_STRIDE, PartKind, SHUNT_C, packParts } from '../../lib/smith/parts';
import { KIND_NAMES, MAX_PARTS, insertPart, startPart, stepValue, withPart } from '../../lib/smith/state';
import { ChartView, DIRTY_CONTENT, DIRTY_VIEW, TAP_MS, TAP_SLOP } from './chartView';

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
/** A handle's hit radius in px: a 44 px touch target at any zoom. */
export const HANDLE_PX = 22;
/** A drag snaps to a grid circle or a standard value whose point on the part's locus is this close in px. */
export const SNAP_PX = 8;
/** A mouse press on a handle that moves less than this (L1, px) and ends within TAP_MS is a click (a finger: TAP_SLOP). */
const MOUSE_SLOP = 3;
/**
 * The series a dragged R, L or C snaps to. E24 for all three: the owner's choice of a series for inductors is still
 * open (milestones.md M3.3), and this constant is the one place to change it.
 */
export const SNAP_SERIES: SeriesId = 'E24';
const SNAP_MANTISSAS = series(SNAP_SERIES).mantissas;
const SNAP_UNIT = ['Ω', 'H', 'F', 'Ω', 'H', 'F'];
const FAM_NAME = ['r', 'x', 'g', 'b'];
const KEY_UNIT = ['Ω', 'H', 'F', 'Ω', 'H', 'F', 'λ', 'λ', 'λ', 'Ω'];
/** What a drag snapped to: nothing, a grid circle, a standard value. */
export const SNAP_NONE = 0;
export const SNAP_GRID = 1;
export const SNAP_STANDARD = 2;
const gridNum = (v: number): string => String(Number(v.toPrecision(6))).replace('-', '−');

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
  /** Called when the visitor picks an arc or a node on the chart (tap or click), and with SEL_PART when a drag starts. */
  onPick: ((kind: number, index: number) => void) | null = null;
  /** The circuit at the end of a drag that changed it: the page's single commit point (once per drag). */
  onCommit: ((c: Circuit, group?: string) => void) | null = null;
  /** The end of a draw gesture: the new part's index once committed, -1 when it was taken away. */
  onDraw: ((index: number) => void) | null = null;
  /** In frames of a drag (and once on a cancel, half −1): the circuit as dragged, for the side panel's texts (half 0
   * or 1 in turn: see writeLive). */
  onLive: ((c: Circuit, part: number, half: number) => void) | null = null;
  /** Snapping (the page's switch; Alt turns it off for one drag move). */
  snap = true;
  /** The part being dragged (−1 none) and what the last move snapped to (harness and M3.3b). */
  dragPart = -1;
  snapCode = SNAP_NONE; snapFamily = -1; snapGridValue = NaN; snapX = NaN; snapY = NaN; snapLabel = '';

  /** The evaluated circuit at f0: count parts, nodes (network.ts), arcs (geometry.ts), Γ of every node (re, im). */
  count = 0;
  nodes = new Float64Array(NODE_STRIDE);
  arcs = new Float64Array(0);
  gamma = new Float64Array(2);
  private parts: Float64Array = new Float64Array(0);
  private circuit: Circuit | null = null;

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
  private handleEls: HTMLSpanElement[] = [];
  private keyEls: HTMLSpanElement[] = [];
  private readonly keyBox: HTMLDivElement;
  private focusKey = -1;
  private hshown = new Uint8Array(0);
  private readonly snapEl: HTMLSpanElement;
  private readonly snapText: HTMLSpanElement;
  private snapShown = false;
  private hotHandle = -1;
  private hotAny = false;
  /** The armed kind of the draw tool (-1: off), the circuit before a draw in progress and the input's ring. */
  drawKind = -1;
  private drawFrom: Circuit | null = null;
  private readonly drawEl: HTMLSpanElement;
  private drawShown = false;
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

  // The drag: the circuit it started from, the locus of the part (from its start node), the value tracked without
  // snapping (lines and stubs follow it over turns), the value shown, the grab offset and the press for tap detection.
  private base: Circuit | null = null;
  private readonly loc = new Float64Array(LOCUS_STRIDE);
  private readonly pt = new Float64Array(4);
  private raw = 0;
  private value = 0;
  private live: Circuit | null = null;
  private offX = 0; private offY = 0;
  private downX = 0; private downY = 0; private downT = 0; private slop = 0; private moved = false;
  private best = 0;
  private bestValue = NaN;
  private liveDirty = 0; // bit h: half h of the side panel's texts is behind
  private readDirty = false;
  private livePhase = 0;

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
    this.snapEl = span({ 'data-snap': '' });
    this.snapEl.hidden = true;
    this.drawEl = span({ 'data-draw-start': '' });
    this.drawEl.hidden = true;
    this.snapText = span({ 'data-snap-label': '' });
    this.snapEl.appendChild(this.snapText);
    this.overlay.append(this.goalLine, this.goal);
    this.keyBox = document.createElement('div');
    this.keyBox.setAttribute('data-layer', 'handle-keys');
    this.keyBox.setAttribute('role', 'group');
    this.keyBox.setAttribute('aria-label', 'Part values, from the source to the load');
    view.box.append(this.overlay, this.keyBox);
    this.build(0);
    // Keys on a focused slider stop here (the box's own keys pan); Ctrl/Cmd and Alt chords go on to the page.
    this.keyBox.addEventListener('keydown', this.keyDown);
    this.keyBox.addEventListener('focusin', (e) => {
      const a = (e.target as Element).getAttribute('data-handle-key');
      if (a === null) return;
      this.markFocus(Number(a));
      this.onPick?.(SEL_PART, Number(a));
    });
    this.keyBox.addEventListener('focusout', () => this.markFocus(-1));

    const before = view.onFrame;
    view.onFrame = (dirty) => { before?.(dirty); this.frame(dirty); };
    view.onHover = (px, py) => {
      const ds = px === px && this.drawAt(px, py);
      const h = px === px && !ds ? this.handleAt(px, py) : -1;
      if (h !== this.hotHandle) {
        this.handleEls[this.hotHandle]?.removeAttribute('data-hot');
        this.handleEls[h]?.setAttribute('data-hot', '');
        this.hotHandle = h;
      }
      if (ds || h >= 0) { if (!this.hotAny) { this.hotAny = true; view.box.setAttribute('data-handle-hot', ''); } }
      else if (this.hotAny) { this.hotAny = false; view.box.removeAttribute('data-handle-hot'); }
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
    view.handles = {
      hit: (px, py) => this.drawAt(px, py) || this.handleAt(px, py) >= 0,
      down: (_id, px, py, touch, _alt, time) => {
        let i: number;
        if (this.drawAt(px, py)) {
          if (!this.beginDraw(this.drawKind)) return;
          i = this.dragPart;
        } else {
          i = this.handleAt(px, py);
          if (!this.beginDrag(i)) return;
        }
        this.offX = px - view.screenX(this.gamma[2 * i + 2]);
        this.offY = py - view.screenY(this.gamma[2 * i + 3]);
        this.downX = px; this.downY = py; this.downT = time; this.moved = false;
        this.slop = touch ? TAP_SLOP : MOUSE_SLOP;
      },
      move: (_id, px, py, alt) => {
        const i = this.dragPart;
        if (i < 0) return;
        if (!this.moved && Math.abs(px - this.downX) + Math.abs(py - this.downY) > this.slop) {
          this.moved = true;
          // A drawn part is selected once it is committed (React has no such part before).
          if (!this.drawFrom) this.onPick?.(SEL_PART, i);
        }
        this.dragTo(view.gammaX(px - this.offX), view.gammaY(py - this.offY), alt);
      },
      up: (_id, px, py, cancelled, time) => {
        if (this.dragPart < 0) return;
        const tap = !cancelled && !this.moved && time - this.downT <= TAP_MS, drawing = this.drawFrom !== null;
        // A draw that did not move (a tap or a long press in place) is taken away.
        this.endDrag(!cancelled && !tap && (this.moved || !drawing));
        if (tap && !drawing) {
          view.setRead(view.gammaX(px), view.gammaY(py));
          const code = this.pickCode(px, py);
          if (code) this.onPick?.(codeKind(code), codeIndex(code));
        }
      },
    };
  }

  // ---------- input from the page ----------

  /** Evaluates the circuit at f0 and redraws the path in the next frame. */
  setCircuit(c: Circuit): void {
    if (c === this.circuit && this.dragPart < 0) return;
    // A circuit from elsewhere during a drag (the link, a field) ends the drag without a commit.
    if (this.dragPart >= 0) {
      const drawing = this.drawFrom !== null;
      this.drawFrom = null;
      this.stopDrag();
      if (drawing) this.onDraw?.(-1);
    }
    this.circuit = c;
    const n = c.parts.length;
    this.parts = packParts(c.parts, this.parts);
    if (this.nodes.length < (n + 1) * NODE_STRIDE) {
      this.nodes = new Float64Array((n + 1) * NODE_STRIDE);
      this.arcs = new Float64Array(n * ARC_STRIDE);
      this.gamma = new Float64Array(2 * (n + 1));
    }
    if (n !== this.count || this.nodeEls.length !== n + 1) this.build(n);
    this.count = n;
    for (let i = 0; i < n; i++) {
      const p = c.parts[i], hd = this.keyEls[i];
      const label = `Part ${i + 1}, ${KIND_NAMES[p.kind]}: arrow keys change the value, Shift in larger steps`;
      if (hd.getAttribute('aria-label') !== label) hd.setAttribute('aria-label', label);
      const t = formatAmount(p.value, KEY_UNIT[p.kind], 4);
      if (hd.getAttribute('aria-valuetext') !== t) hd.setAttribute('aria-valuetext', t);
    }
    this.evaluate(c);
  }

  /** The committed circuit as the layer has it (the page's, or a key step's before React renders it). */
  get committed(): Circuit | null { return this.circuit; }

  private evaluate(c: Circuit): void {
    const n = this.count;
    evaluate(this.nodes, this.parts, n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
    partArcs(this.arcs, this.nodes, this.parts, n, c.z0, c.f0, c.f0);
    for (let k = 0; k <= n; k++) nodeGamma(this.gamma, 2 * k, this.nodes, k * NODE_STRIDE);
    this.stale = true;
    this.touch();
  }

  // ---------- dragging (engine.md §6) ----------

  /** The handle at box px (px, py): the part whose end node is nearest within HANDLE_PX and in the box, else −1. */
  handleAt(px: number, py: number): number {
    const v = this.view, g = this.gamma;
    if (!(px >= 0 && py >= 0 && px <= v.w && py <= v.h)) return -1;
    let best = -1, bestD = HANDLE_PX;
    // From the source end: of handles that coincide (parts of no effect) the one nearer the source is taken.
    for (let i = this.count - 1; i >= 0; i--) {
      const d = Math.hypot(v.screenX(g[2 * i + 2]) - px, v.screenY(g[2 * i + 3]) - py);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Starts a drag of part i's handle (pointer; from M3.3b also the keyboard). False when there is no such part. */
  beginDrag(i: number): boolean {
    const c = this.circuit;
    if (!c || !(i >= 0 && i < this.count) || this.dragPart >= 0) return false;
    this.dragPart = i;
    this.base = c;
    this.raw = this.value = c.parts[i].value;
    this.live = null;
    nodeLocus(this.loc, 0, this.nodes, this.parts, i, c.z0, c.f0, c.f0);
    this.snapCode = SNAP_NONE;
    this.view.box.setAttribute('data-handle-drag', '');
    this.handleEls[i]?.setAttribute('data-drag', '');
    return true;
  }

  /**
   * Moves the dragged part's end towards Γ = (gr, gi): projected onto its reach (lengths tracked from the value before),
   * snapped unless `free` or snapping is off. Returns the part's new value. The DOM follows in the next frame.
   */
  dragTo(gr: number, gi: number, free: boolean): number {
    const i = this.dragPart;
    if (i < 0) return NaN;
    const raw = project(this.pt, 0, this.loc, 0, gr, gi, this.raw);
    this.raw = raw;
    let value = raw;
    this.snapCode = SNAP_NONE;
    if (this.snap && !free) {
      const s = this.findSnap(this.pt[0], this.pt[1], raw);
      if (s === s) value = s;
    }
    if (value !== this.value) {
      this.value = value;
      this.parts[i * PART_STRIDE + 1] = value;
      const b = this.base!;
      this.live = withPart(b, i, { ...b.parts[i], value });
      this.evaluate(b);
      this.liveDirty = 3;
      this.readDirty = true;
    } else this.touch();
    return value;
  }

  /**
   * Ends the drag: `commit` hands a changed circuit to onCommit (once); otherwise the circuit before it comes back. A
   * draw commits its new part even when its value did not change, or takes it away (onDraw in both cases).
   */
  endDrag(commit: boolean): Circuit | null {
    const i = this.dragPart, b = this.base;
    if (i < 0 || !b) return null;
    const from = this.drawFrom;
    const changed = this.value !== b.parts[i].value;
    const next = this.live ?? b;
    this.drawFrom = null;
    this.stopDrag();
    if (from) {
      if (commit) {
        this.circuit = next;
        this.view.setRead(this.gamma[2 * i + 2], this.gamma[2 * i + 3]);
        // The panel shows the last frame's texts, which need not be the final value's, and React rewrites only the texts
        // that differ from its own render before the drag: all of them are written for the committed circuit first.
        this.onLive?.(next, i, -1);
        this.onCommit?.(next);
        this.onDraw?.(i);
        return next;
      }
      this.setCircuit(from);
      this.onLive?.(from, i, -1);
      const n = this.count;
      this.view.setRead(this.gamma[2 * n], this.gamma[2 * n + 1]);
      this.onDraw?.(-1);
      return null;
    }
    // Back on the value it had: the texts of the frames in between go too.
    if (!changed) { if (next !== b) this.onLive?.(b, i, -1); return null; }
    if (commit && next) {
      this.circuit = next;
      this.view.setRead(this.gamma[2 * i + 2], this.gamma[2 * i + 3]);
      this.onLive?.(next, i, -1);
      this.onCommit?.(next);
      return next;
    }
    this.parts[i * PART_STRIDE + 1] = b.parts[i].value;
    this.evaluate(b);
    this.onLive?.(b, i, -1);
    this.view.setRead(this.gamma[2 * i + 2], this.gamma[2 * i + 3]);
    return null;
  }

  /**
   * The side panel's two halves (onLive) and the readout (the read point at the dragged end) take turns, one per frame
   * in the order half 0, readout, half 1, readout: at 4× CPU all the panel's texts in one frame cost 3–5 ms of layout
   * and paint (measured, notes-M3.3a.md), so a drag frame pays for a share; the readout follows at 30 Hz, each half at 15.
   */
  private writeLive(): void {
    const i = this.dragPart;
    for (let tries = 0; tries < 4; tries++) {
      const ph = this.livePhase;
      this.livePhase = (ph + 1) & 3;
      if (ph & 1) {
        if (!this.readDirty) continue;
        this.view.setRead(this.gamma[2 * i + 2], this.gamma[2 * i + 3]);
        this.readDirty = false;
      } else {
        const bit = ph === 0 ? 1 : 2;
        if (!(this.liveDirty & bit)) continue;
        if (this.live) this.onLive?.(this.live, i, ph >> 1);
        this.liveDirty &= ~bit;
      }
      break;
    }
    if (this.liveDirty || this.readDirty) this.view.request(DIRTY_CONTENT);
  }

  // ---------- the draw tool and keys (M3.3b) ----------

  /** Arms the draw tool with a part kind (-1: off). A draw in progress is not touched (Escape: cancelDraw). */
  arm(kind: number): void {
    if (kind === this.drawKind) return;
    this.drawKind = kind;
    this.view.box.toggleAttribute('data-draw-armed', kind >= 0);
    this.touch();
  }

  /** Whether a press at box px (px, py) starts a draw: armed, room for a part, within HANDLE_PX of the input. */
  drawAt(px: number, py: number): boolean {
    if (this.drawKind < 0 || this.dragPart >= 0 || this.count >= MAX_PARTS) return false;
    const v = this.view, n = this.count;
    if (!(px >= 0 && py >= 0 && px <= v.w && py <= v.h)) return false;
    return Math.hypot(v.screenX(this.gamma[2 * n]) - px, v.screenY(this.gamma[2 * n + 1]) - py) < HANDLE_PX;
  }

  /** Appends a part of `kind` (startPart: no effect where possible) at the source end and starts dragging its end. */
  beginDraw(kind: number): boolean {
    const c = this.circuit;
    if (!c || kind < 0 || this.dragPart >= 0 || c.parts.length >= MAX_PARTS) return false;
    const n = c.parts.length;
    this.setCircuit(insertPart(c, n, startPart(kind as PartKind, c)));
    if (!this.beginDrag(n)) { this.setCircuit(c); return false; }
    this.drawFrom = c;
    return true;
  }

  /** Takes a draw in progress away (Escape). True when there was one. */
  cancelDraw(): boolean {
    if (!this.drawFrom) return false;
    this.endDrag(false);
    return true;
  }

  get drawing(): boolean { return this.drawFrom !== null; }

  /** One arrow-key step of part i's value (stepValue; E24 when snapping is on), committed with the group `key:i`. */
  keyStep(i: number, up: boolean, coarse: boolean): void {
    const c = this.circuit;
    if (!c || this.dragPart >= 0 || !(i >= 0 && i < this.count)) return;
    const p = c.parts[i], v = stepValue(p.kind, p.value, up, coarse, this.snap ? SNAP_MANTISSAS : null, c);
    if (v === p.value) return;
    const next = withPart(c, i, { ...p, value: v });
    this.setCircuit(next);
    this.view.setRead(this.gamma[2 * i + 2], this.gamma[2 * i + 3]);
    this.onCommit?.(next, `key:${i}`);
  }

  private readonly keyDown = (e: KeyboardEvent): void => {
    const a = (e.target as Element).getAttribute?.('data-handle-key');
    if (a == null || e.altKey || e.ctrlKey || e.metaKey) return;
    const i = Number(a);
    switch (e.key) {
      case 'ArrowUp': case 'ArrowRight': this.keyStep(i, true, e.shiftKey); break;
      case 'ArrowDown': case 'ArrowLeft': this.keyStep(i, false, e.shiftKey); break;
      case 'PageUp': this.keyStep(i, true, true); break;
      case 'PageDown': this.keyStep(i, false, true); break;
      case 'Enter': case ' ': this.onPick?.(SEL_PART, i); break;
      // Back to the chart (its keys pan again); the page also hears Escape (the draw tool).
      case 'Escape': this.view.box.focus(); return;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  /** The ring of the part whose slider has the focus shows it (`data-focus`); −1: none. */
  private markFocus(i: number): void {
    if (i === this.focusKey) return;
    this.handleEls[this.focusKey]?.removeAttribute('data-focus');
    this.handleEls[i]?.setAttribute('data-focus', '');
    this.focusKey = i;
  }

  private stopDrag(): void {
    this.handleEls[this.dragPart]?.removeAttribute('data-drag');
    this.view.box.removeAttribute('data-handle-drag');
    this.dragPart = -1;
    this.base = this.live = null;
    this.snapCode = SNAP_NONE;
    this.touch();
  }

  /**
   * The value to snap to near the locus point (qx, qy) (raw: the value there), or NaN: the nearest within SNAP_PX of
   * a standard value (R, L, C) or of a crossing of the locus with a grid circle drawn now (r, x, g, b of the density
   * level, and the real axis), taken only where the part can reach it.
   */
  private findSnap(qx: number, qy: number, raw: number): number {
    const v = this.view, loc = this.loc, kind = loc[L_KIND], p = this.pt;
    this.best = SNAP_PX / v.k;
    this.bestValue = NaN;
    if (kind <= SHUNT_C && raw > 0 && raw < Infinity) {
      const dec = Math.floor(Math.log10(raw)), x = raw * 10 ** (2 - dec), ms = SNAP_MANTISSAS;
      let j = 0;
      while (j < ms.length && ms[j] <= x) j++;
      for (let s = 0; s < 2; s++) {
        const c = s === 0
          ? (j > 0 ? standardValue(ms[j - 1], dec) : standardValue(ms[ms.length - 1], dec - 1))
          : (j < ms.length ? standardValue(ms[j], dec) : standardValue(ms[0], dec + 1));
        locusPoint(p, 2, loc, 0, c);
        const d = Math.hypot(p[2] - qx, p[3] - qy);
        if (d < this.best) {
          this.best = d; this.bestValue = c; this.snapX = p[2]; this.snapY = p[3];
          this.snapCode = SNAP_STANDARD; this.snapFamily = -1; this.snapGridValue = NaN;
          this.snapLabel = `${formatAmount(c, SNAP_UNIT[kind], 3)} · ${SNAP_SERIES}`;
        }
      }
    }
    const g = v.grid.grid;
    if (g && loc[L_MODE] !== LOCUS_FIXED) {
      const A = loc[L_A], Dr = loc[L_A + 1], Di = loc[L_A + 2], C = loc[L_A + 3], arcs = g.arcs, fam = g.family;
      for (let e = 0, a = 0; e < g.count; e++, a += ARC_STRIDE) {
        const f = fam[e];
        if (f !== FAM_R && f !== FAM_X && f !== FAM_G && f !== FAM_B && f !== FAM_AXIS) continue;
        const R = arcs[a + ARC_R];
        if (R === Infinity) {
          // The real axis from S to E: A·t² − 2·Dr·t + C = 0 at Γ = t.
          if (!(Math.abs(qy) < this.best)) continue;
          const lo = Math.min(arcs[a + ARC_SX], arcs[a + ARC_EX]), hi = Math.max(arcs[a + ARC_SX], arcs[a + ARC_EX]);
          if (A === 0) {
            if (Dr !== 0) this.tryGrid(C / (2 * Dr), 0, lo, hi, qx, qy, raw, f, g.value[e]);
            continue;
          }
          const disc = Dr * Dr - A * C;
          if (!(disc >= 0)) continue;
          const q = Dr + (Dr < 0 ? -1 : 1) * Math.sqrt(disc);
          this.tryGrid(q / A, 0, lo, hi, qx, qy, raw, f, g.value[e]);
          if (q !== 0) this.tryGrid(C / q, 0, lo, hi, qx, qy, raw, f, g.value[e]);
          continue;
        }
        const cx = arcs[a + ARC_CX], cy = arcs[a + ARC_CY];
        if (!(Math.abs(Math.hypot(qx - cx, qy - cy) - R) < this.best)) continue;
        // Points c + R·e^(jθ) of the grid circle on the locus: ca·cos θ + cb·sin θ = cd.
        const ca = 2 * R * (A * cx - Dr), cb = 2 * R * (A * cy - Di);
        const cd = -(A * (cx * cx + cy * cy + R * R) - 2 * (Dr * cx + Di * cy) + C), m = Math.hypot(ca, cb);
        if (!(m > 0) || !(Math.abs(cd) <= m)) continue;
        const phi = Math.atan2(cb, ca), dt = Math.acos(cd / m), turns = arcs[a + ARC_TURNS], sweep = arcs[a + ARC_SWEEP];
        const a0 = Math.atan2(arcs[a + ARC_SY] - cy, arcs[a + ARC_SX] - cx);
        for (let s = -1; s <= 1; s += 2) {
          const t = phi + s * dt;
          if (turns > 0 || within(t - a0, sweep)) this.tryGrid(cx + R * Math.cos(t), cy + R * Math.sin(t), -Infinity, Infinity, qx, qy, raw, f, g.value[e]);
        }
      }
    }
    return this.bestValue;
  }

  private tryGrid(x: number, y: number, lo: number, hi: number, qx: number, qy: number, raw: number, fam: number, gv: number): void {
    if (!(x >= lo && x <= hi)) return;
    const d = Math.hypot(x - qx, y - qy);
    if (!(d < this.best)) return;
    const loc = this.loc, p = this.pt, val = locusValue(loc, 0, x, y, raw);
    // Only where the part can be: the value's own point must be the crossing (a lumped part's far side is not).
    locusPoint(p, 2, loc, 0, val);
    if (!(Math.hypot(p[2] - x, p[3] - y) * this.view.k < 0.5)) return;
    this.best = d; this.bestValue = val; this.snapX = x; this.snapY = y;
    this.snapCode = SNAP_GRID; this.snapFamily = fam; this.snapGridValue = gv;
    this.snapLabel = fam === FAM_AXIS ? (this.view.mode === MODE_Y ? 'b = 0' : 'x = 0') : `${FAM_NAME[fam]} = ${gridNum(gv)}`;
  }

  /** The selection (strip, table or a pick on the chart): SEL_PART or SEL_NODE with its index, or SEL_NONE. */
  select(kind: number, index: number): void {
    // A drag selects its part: the card React then mounts shows the committed value until written again.
    if (this.dragPart >= 0) this.liveDirty = 3;
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
    const arcs: SVGPathElement[] = [], arrows: HTMLSpanElement[] = [], nodes: HTMLSpanElement[] = [], handles: HTMLSpanElement[] = [];
    const keys: HTMLSpanElement[] = [];
    for (let i = 0; i < n; i++) {
      // The handle of part i (at node i + 1) and its slider for the keys (keyDown).
      const hd = span({ 'data-handle': String(i) });
      hd.hidden = true;
      keys.push(span({ 'data-handle-key': String(i), role: 'slider', tabindex: '0' }));
      hd.style.color = partColour(i);
      handles.push(hd);
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
    for (const e of this.handleEls) e.remove();
    // Handles over the goal, arrows over them, markers over the arrows (a handle is a ring round its marker), the
    // input over the nodes it may cover, the draw tool's ring and the snap mark on top. Sliders from the source end
    // first: their tab order follows the strip.
    this.overlay.append(...handles, ...arrows, ...nodes, this.drawEl, this.snapEl);
    this.keyBox.replaceChildren(...keys.reverse());
    keys.reverse();
    this.arcEls = arcs; this.arrowEls = arrows; this.nodeEls = nodes; this.handleEls = handles; this.keyEls = keys;
    this.focusKey = -1;
    this.hotHandle = -1;
    this.hotAny = false;
    this.view.box.removeAttribute('data-handle-hot');
    this.d = new Array(n).fill('');
    this.shown = new Uint8Array(n + 1);
    this.hshown = new Uint8Array(n);
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
    if (this.dragPart >= 0) this.writeLive();
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
      if (j > 0) {
        const hd = this.handleEls[j - 1];
        if (on) hd.style.transform = `translate(${x}px,${y}px)`;
        if (this.hshown[j - 1] !== on) { this.hshown[j - 1] = on; hd.hidden = !on; }
      }
    }
    const snapOn = this.dragPart >= 0 && this.snapCode !== SNAP_NONE;
    if (snapOn) {
      this.snapEl.style.transform = `translate(${v.screenX(this.snapX)}px,${v.screenY(this.snapY)}px)`;
      if (this.snapText.textContent !== this.snapLabel) this.snapText.textContent = this.snapLabel;
    }
    if (snapOn !== this.snapShown) { this.snapShown = snapOn; this.snapEl.hidden = !snapOn; }
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
    let ds = false;
    if (this.drawKind >= 0 && this.dragPart < 0 && n < MAX_PARTS) {
      const x = v.screenX(g[2 * n]), y = v.screenY(g[2 * n + 1]);
      ds = x === x && y === y && inBox(x, y);
      if (ds) this.drawEl.style.transform = `translate(${x}px,${y}px)`;
    }
    if (ds !== this.drawShown) { this.drawShown = ds; this.drawEl.hidden = !ds; }
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
