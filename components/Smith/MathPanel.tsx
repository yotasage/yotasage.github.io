// The equation panel of the Smith chart (step M5.1, docs/smith-chart/learning.md §3): for the selected part or node
// (the page's selection, as the strip, the node table and the chart share it) or the readout's point, the registry's
// equations (components/Smith/mathRows.ts) as a symbolic line with the variables in the chart's colours, the lines with
// the numbers put in and the result, at the digits setting; values at rounding level as plan.md D20 says, with the raw
// number beside the bound.
//
// React renders the frame of each row and its symbolic line (they change only with the subject); the lines with
// numbers are written by `MathLive`, outside React: at once when the page renders (a commit, a new selection, the
// digits), and while a handle is dragged or the readout moves in a time slice that holds the panel's average cost
// per frame to RATE ms (engine.md §9, notes-M0.3.md (a): the MathML costs DOM, style and layout work far beyond the
// 0.04 ms of KaTeX itself, so the visible rows are refreshed round-robin, a few per second at 4× CPU, and every row
// gets its final value once the values stop changing). A closed or scrolled-away panel does no work until it is seen.

import katex from 'katex';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Circuit } from '../../lib/smith/network';
import styles from '../../styles/Smith.module.css';
import css from '../../styles/SmithMath.module.css';
import { COLOUR_KEYS, MathRow, SENTINELS, Spec, Subject, rowOf, specsFor, subjectName } from './mathRows';

// The sentinel colours of the TeX become classes in the MathML (learning.md §2: \htmlClass is dropped in MathML output).
const CLASS_OF: Record<string, string> = Object.fromEntries(COLOUR_KEYS.map((k) => [SENTINELS[k], css[k]]));
const SENTINEL = /mathcolor="(#0a0b[0-9a-f]{2})"/g;

/** TeX as MathML with the sentinel colours as classes. */
export function mathHtml(tex: string): string {
  return katex.renderToString(`\\displaystyle ${tex}`, { output: 'mathml' }).replace(SENTINEL, (_, c: string) => `class="${CLASS_OF[c] ?? ''}"`);
}

/** The HTML of a row's lines with numbers: each "= …" line, the result (or its bound) and the raw number of D20. */
function liveHtml(r: MathRow): string {
  let h = '';
  for (const l of r.lines) h += `<span class="${css.line}">${mathHtml(`{}= ${l}`)}</span>`;
  h += `<span class="${css.line} ${css.result}" data-math-result="">${mathHtml(r.bound ? r.result : `{}= ${r.result}`)}</span>`;
  if (r.raw) h += `<span class="${css.raw}" data-math-raw="">computed: ${r.raw}</span>`;
  return h;
}

/**
 * The lines with numbers of the panel's rows, written outside React. The page makes one for its lifetime and calls
 * `live` from the drag's frames and `point` from the readout's; the panel calls `set` after each render.
 */
export class MathLive {
  /** The panel's average work per frame while values change, in ms (the leaky bucket's rate), and the most it saves up. */
  static RATE = 0.25;
  static CAP = 1.5;
  /**
   * What a row's measured script time is charged as: the style, layout and paint of its new MathML follow outside
   * the measured span and cost about as much again (measured by ui-math.mjs at 4× CPU: 0.25 ms of script per frame
   * added 0.55 ms of main thread), so the bucket's rate holds for the whole of the panel's work.
   */
  static CHARGE = 2.2;
  /** The panel in view and open (an IntersectionObserver keeps it). */
  visible = true;
  /** Turned off (the harness measures the page without the panel's work). */
  off = false;
  /** What the time slice did (for the harness): rows written while values changed, and their ms. */
  sliced = 0;
  slicedMs = 0;

  private els: (HTMLElement | null)[] = [];
  private c: Circuit | null = null;
  private s: Subject = { t: 'node', k: 0 };
  private digits = 4;
  private gr = NaN;
  private gi = NaN;
  private specs: Spec[] | null = null;
  private dirty: boolean[] = [];
  private next = 0;
  private credit = 0;
  private raf = 0;
  private lastLive = -1e9;
  private root: HTMLElement | null = null;

  /** Every row written with the latest values (for the harness). */
  get idle(): boolean { return !this.raf && !this.dirty.some(Boolean); }

  attach(j: number, el: HTMLElement | null): void { this.els[j] = el; }
  setRoot(el: HTMLElement | null): void { this.root = el; }

  /** After a render of the panel: the committed circuit, the subject and the digits. Written at once, or in the slice during a drag. */
  set(c: Circuit, s: Subject, digits: number, count: number): void {
    this.c = c; this.s = s; this.digits = digits;
    this.els.length = count;
    this.specs = null;
    this.dirty = new Array(count).fill(true);
    this.next = 0;
    this.empty();
    // A render in the middle of a drag (the drag's pick selects its part) leaves the work to the slice.
    if (performance.now() - this.lastLive < 150) this.schedule();
    else this.flush();
  }

  /** A drag frame's circuit. */
  live(c: Circuit): void {
    this.lastLive = performance.now();
    if (this.off || this.s.t === 'point' || c === this.c) return;
    this.c = c;
    this.touch();
  }

  /** The readout's point (NaN when there is none). */
  point(gr: number, gi: number): void {
    if (this.gr === gr && this.gi === gi) return;
    this.gr = gr; this.gi = gi;
    if (this.off || this.s.t !== 'point') return;
    this.empty();
    this.touch();
  }

  /** Whether the readout's point is missing while the panel follows it. */
  private empty(): void {
    this.root?.toggleAttribute('data-empty', this.s.t === 'point' && this.gr !== this.gr);
  }

  private touch(): void {
    this.specs = null;
    for (let j = 0; j < this.dirty.length; j++) this.dirty[j] = true;
    this.schedule();
  }

  /** Back in view: whatever changed meanwhile. */
  shown(visible: boolean): void {
    this.visible = visible;
    if (visible && this.dirty.some(Boolean)) this.schedule();
  }

  private schedule(): void {
    if (!this.raf && typeof requestAnimationFrame !== 'undefined') this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (): void => {
    this.raf = 0;
    if (!this.visible) return;
    this.credit = Math.min(this.credit + MathLive.RATE, MathLive.CAP);
    const n = this.dirty.length;
    for (let tries = 0; tries < n && this.credit > 0; tries++) {
      const j = this.next;
      this.next = (j + 1) % n;
      if (!this.dirty[j]) continue;
      const t0 = performance.now();
      this.write(j);
      const dt = performance.now() - t0;
      this.credit -= dt * MathLive.CHARGE;
      this.sliced++;
      this.slicedMs += dt;
    }
    if (this.dirty.some(Boolean)) this.schedule();
  };

  /** Every row now. */
  flush(): void {
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    for (let j = 0; j < this.dirty.length; j++) this.write(j);
  }

  private write(j: number): void {
    this.dirty[j] = false;
    const el = this.els[j];
    if (!el || !this.c) return;
    if (this.s.t === 'point' && this.gr !== this.gr) { if (el.innerHTML) el.innerHTML = ''; return; }
    if (!this.specs) this.specs = specsFor(this.c, this.s, this.gr, this.gi);
    const spec = this.specs[j];
    if (!spec) return;
    const r = rowOf(spec, this.digits);
    el.innerHTML = liveHtml(r);
    el.dataset.mathBind = JSON.stringify(r.binding);
  }
}

export interface MathPanelProps {
  circuit: Circuit;
  /** The page's selection: a part or a node. */
  subject: Subject;
  digits: number;
  live: MathLive;
}

function MathPanel({ circuit, subject: selected, digits, live }: MathPanelProps) {
  const [follow, setFollow] = useState<'selection' | 'point'>('selection');
  const subject: Subject = follow === 'point' ? { t: 'point' } : selected;
  // The rows' frames: the symbolic lines from the committed circuit (they do not depend on the numbers).
  const rows = useMemo(() => specsFor(circuit, subject, 0, 0).map((s) => rowOf(s, digits)),
    // The shape changes with the subject and the selected part's kind only.
    [subject.t, subject.t === 'part' ? subject.i : subject.t === 'node' ? subject.k : -1, subject.t === 'part' ? circuit.parts[subject.i]?.kind : -1, circuit.parts.length]);
  const key = rows.map((r) => r.id).join(',') + `|${subject.t}${subject.t === 'part' ? subject.i : subject.t === 'node' ? subject.k : ''}`;
  const symbolic = useMemo(() => rows.map((r) => ({ lhs: mathHtml(r.lhs), rhs: mathHtml(`{}= ${r.rhs}`) })), [key]);

  // Open beside the chart, closed on phones (read after mount, as the node table does).
  const [open, setOpen] = useState(true);
  useEffect(() => { if (window.matchMedia('(max-width: 599px)').matches) setOpen(false); }, []);

  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = section.current;
    if (!el) return undefined;
    live.setRoot(el);
    (el as HTMLElement & { smithMath?: MathLive }).smithMath = live;
    const io = new IntersectionObserver((entries) => live.shown(entries[entries.length - 1].isIntersecting));
    io.observe(el.querySelector('ol') ?? el);
    return () => { io.disconnect(); live.setRoot(null); };
  }, [live, open]);
  useLayoutEffect(() => { live.set(circuit, subject, digits, rows.length); }, [circuit, key, digits, live]);

  const name = subjectName(circuit, subject);
  return (
    <section className={styles.panel} data-math="" data-math-subject={subject.t === 'point' ? 'point' : `${subject.t}:${subject.t === 'part' ? subject.i : subject.k}`} ref={section}>
      <details className={css.box} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className={`${styles.panelTitle} ${css.summary}`}>
          <span>Equations</span>
          <span className={styles.panelNote}>{name}</span>
        </summary>
        <div className={css.follow} role="group" aria-label="Show the equations of">
          <button type="button" aria-pressed={follow === 'selection'} data-math-follow="selection" onClick={() => setFollow('selection')}>Selected part or node</button>
          <button type="button" aria-pressed={follow === 'point'} data-math-follow="point" onClick={() => setFollow('point')}>Readout point</button>
        </div>
        <p className={css.empty}>Hover, tap or use the arrow keys on the chart to read a point.</p>
        <ol className={css.rows}>
          {rows.map((r, j) => (
            <li key={`${key}:${j}`} className={css.row} data-math-eq={r.id}>
              <div className={css.grid}>
                <span className={css.lhs} dangerouslySetInnerHTML={{ __html: symbolic[j].lhs }} />
                <span dangerouslySetInnerHTML={{ __html: symbolic[j].rhs }} />
                <div className={css.live} data-math-live="" ref={(el) => live.attach(j, el)} />
              </div>
              <span className={css.title}>{r.title}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export default React.memo(MathPanel);
