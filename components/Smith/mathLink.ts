// The links between the Smith chart's equation panel and the rest of the page (step M5.2, docs/smith-chart/learning.md
// §3), framework-free. One object for the page's lifetime (`mathLink`), as `followTopic` is for the theory links.
//
// Equation → page: a variable of the panel carries its target tokens (`data-mt`, from mathRows.ts's sentinels:
// `p<i>` a part, `n<k>` a node, `goal`, `r<field>` a readout row). Pointing at it (hover, focus with the arrow keys
// inside a row, or a tap, which stays) marks what it stands for with `data-lit`: the part's arc, arrow and handle
// (pathLayer.light, drawn in the chart's next frame), its tile and card; the node's marker, its row of the node table
// and, for the input, the circuit input; the goal's ring, mark and line; the readout's row. The same variable's other
// places in the panel are lit with it.
//
// Page → equation: the chart's own hover (pathLayer.onHot) and a hover or focus on a tile or a node row light the
// variables of that part or node in the panel (a query over the panel's rows: also when it is out of view, so it is
// right when scrolled to).
//
// "Show equation" (`ShowEq` in MathPanel.tsx): sets the panel's subject (the page's selection, or the readout's
// point), opens the panel, focuses the wanted row and offers a way back to the control it was asked from.
//
// Everything here is attribute toggles on existing elements on a pointer, focus or key event; nothing in a frame loop
// except what pathLayer draws in its own frame, and no render of the panel or the chart.

import { SEL_NODE, SEL_NONE, SEL_PART } from './pathLayer';
import type { PathLayer } from './pathLayer';
import type { Subject } from './mathRows';

/** A "show equation" request: the subject, the registry id of the row to focus ('' the first) and the way back. */
export interface ShowRequest {
  subject: Subject;
  row: string;
  /** The control it was asked from (`data-show-eq` finds it again when React has replaced it) and its name. */
  from: HTMLElement | null;
  key: string;
  back: string;
}

/** Where a readout field's equation is: the point subject's row of each READOUT_FIELDS field. */
export const READOUT_ROWS: Readonly<Record<string, string>> = {
  z: 'z-gamma', Z: 'z-norm', y: 'y-norm', Y: 'y-norm', gamma: 'z-gamma', gammaRect: 'z-gamma', vswr: 'vswr', rl: 'return-loss',
};

const LIT = 'data-lit';

export class MathLink {
  /** The tool's element (queries stay out of the theory's MathML), the chart's path and the page's selection. */
  scope: ParentNode | null = null;
  path: PathLayer | null = null;
  select: ((s: Subject) => void) | null = null;
  /** The panel's handler of a request (MathPanel registers it) and its rows' list. */
  shower: ((r: ShowRequest) => void) | null = null;
  rows: HTMLElement | null = null;
  /** M5.3: the derivation dialog while it is open; its variables are lit with the panel's. */
  extra: HTMLElement | null = null;

  /** What the panel points at: by hover, by focus (a row, or its variables with the arrow keys), by a tap (stays). */
  private hover = '';
  private focus = '';
  private pin = '';
  /** What the page points at (a part or a node): its variables are lit in the panel. */
  private page = '';
  private pageLit: Element[] = [];
  private panelLit: Element[] = [];
  private shownPage = '';
  private shownPanel = '';

  /** The panel's own pointing; '' ends it. */
  point(how: 'hover' | 'focus' | 'pin', tokens: string): void {
    if (how === 'hover') this.hover = tokens;
    else if (how === 'focus') this.focus = tokens;
    else this.pin = tokens === this.pin ? '' : tokens;
    this.apply();
  }

  /** The tap's tokens, and their end (a step with the arrow keys, Escape). */
  get pinned(): string { return this.pin; }
  unpin(): void { if (this.pin) { this.pin = ''; this.apply(); } }

  /** A part (SEL_PART) or a node (SEL_NODE) pointed at on the chart, a tile or a node row; SEL_NONE ends it. */
  fromPage(kind: number, index: number): void {
    const t = kind === SEL_PART && index >= 0 ? `p${index}` : kind === SEL_NODE && index >= 0 ? `n${index}` : '';
    if (t === this.page) return;
    this.page = t;
    this.apply();
  }

  /** A new subject or circuit: what was pointed at in the panel is gone. */
  reset(): void {
    this.hover = this.focus = this.pin = '';
    // The panel's elements are new: marked again even when the tokens stay (the page's hover).
    this.shownPanel = '\0';
    this.apply();
  }

  /** The variables written again by MathLive (its innerHTML): light those of the current tokens. */
  mark(el: Element): void {
    if (!this.shownPanel) return;
    for (const t of this.shownPanel.split(' ')) {
      if (t === 'goal') continue;
      el.querySelectorAll(`[data-mt~="${t}"]`).forEach((e) => { e.setAttribute(LIT, ''); this.panelLit.push(e); });
    }
  }

  show(r: ShowRequest): void {
    if (r.subject.t !== 'point') this.select?.(r.subject);
    this.shower?.(r);
  }

  private apply(): void {
    // A tap stays over the focus a tap also gives its row.
    const own = this.hover || this.pin || this.focus;
    if (own !== this.shownPage) { this.shownPage = own; this.lightPage(own); }
    const panel = own || this.page;
    if (panel !== this.shownPanel) {
      for (const e of this.panelLit) e.removeAttribute(LIT);
      this.panelLit.length = 0;
      this.shownPanel = panel;
      if (this.rows) this.mark(this.rows);
      if (this.extra) this.mark(this.extra);
    }
  }

  private lightPage(tokens: string): void {
    for (const e of this.pageLit) e.removeAttribute(LIT);
    this.pageLit.length = 0;
    let kind = SEL_NONE, index = -1;
    const s = this.scope;
    if (tokens && s) {
      const add = (sel: string) => s.querySelectorAll(sel).forEach((e) => { e.setAttribute(LIT, ''); this.pageLit.push(e); });
      for (const t of tokens.split(' ')) {
        const c = t[0], v = t.slice(1);
        if (t === 'goal') add('[data-goal-ring], [data-layer="path-marks"] [data-goal], [data-goal-line], [data-goal-text]');
        else if (c === 'p') { kind = SEL_PART; index = Number(v); add(`[data-tile="${v}"], [data-card="${v}"]`); }
        else if (c === 'n') {
          kind = SEL_NODE; index = Number(v);
          add(`[data-node-row="${v}"]`);
          // The input: the node past the last part (no tile of its index).
          if (s.querySelector(`[data-tile="${v}"]`) === null) add('[data-input-box]');
        } else if (c === 'r') {
          add(`[data-read-row="${v}"]`);
          if (v === 'gamma') add('[data-read-row="gammaRect"]');
        }
      }
    }
    this.path?.light(kind, index);
  }
}

/** The page's link (one Smith chart page at a time). */
export const mathLink = new MathLink();
