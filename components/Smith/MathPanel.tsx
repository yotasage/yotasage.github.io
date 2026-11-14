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
//
// From M5.2 each variable carries what it stands for (`data-mt`, from the sentinels' second index): pointing at one
// (hover, a tap, or the arrow keys in a focused row) lights it on the page, and the page's pointing lights it here
// (components/Smith/mathLink.ts); "show equation" requests (ShowEq.tsx) set the subject, focus a row and offer a way back.

import katex from 'katex';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { goalNode } from '../../lib/smith/goal';
import type { Circuit } from '../../lib/smith/network';
import { askOf } from '../../lib/smith/state';
import type { Circuit as StateCircuit } from '../../lib/smith/state';
import styles from '../../styles/Smith.module.css';
import css from '../../styles/SmithMath.module.css';
import { openDerivation } from './Derivation';
import { hasDerivation } from './derive';
import { mathLink } from './mathLink';
import type { ShowRequest } from './mathLink';
import { COLOUR_KEYS, MathRow, Spec, Subject, rowOf, specsFor, subjectName } from './mathRows';
import { Why } from './Why';
import { markWide, watchWide } from './wide';

// The sentinel colours of the TeX become a colour's class and the variable's target in the MathML (learning.md §2:
// \htmlClass is dropped in MathML output): `#0a` + colour + the variable's index in its row.
const CLASS_OF: readonly string[] = ['', ...COLOUR_KEYS.map((k) => css[k])];
/** An equation's box in a row: it scrolls sideways when wider than the panel (wide.ts). */
const WIDE = `.${css.grid}`;
const SENTINEL = /mathcolor="#0a([0-9a-f]{2})([0-9a-f]{2})"/g;

/**
 * TeX as MathML with the sentinels as classes and targets (`data-mt`, the row's `targets` by index); in display style
 * unless `inline` (maths within a sentence: a derivation's reasons).
 */
export function mathHtml(tex: string, targets: readonly string[] = [], inline = false): string {
  return katex.renderToString(inline ? tex : `\\displaystyle ${tex}`, { output: 'mathml' }).replace(SENTINEL, (_, c: string, v: string) => {
    const t = targets[parseInt(v, 16)];
    return `class="${CLASS_OF[parseInt(c, 16)] ?? ''}"${t ? ` data-mt="${t}"` : ''}`;
  });
}

/** The HTML of a row's lines with numbers: each "= …" line, the result (or its bound) and the raw number of D20. */
function liveHtml(r: MathRow): string {
  let h = '';
  const t = r.targets;
  for (const l of r.lines) h += `<span class="${css.line}">${mathHtml(`{}= ${l}`, t)}</span>`;
  h += `<span class="${css.line} ${css.result}" data-math-result="">${mathHtml(r.bound ? r.result : `{}= ${r.result}`, t)}</span>`;
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

  /** The readout's point (NaN when there is none): a derivation opened from the point's rows takes it. */
  get readPoint(): [number, number] { return [this.gr, this.gi]; }

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
    mathLink.mark(el);
  }
}

export interface MathPanelProps {
  circuit: Circuit;
  /** The page's selection: a part or a node. */
  subject: Subject;
  digits: number;
  live: MathLive;
}

/** A subject as `data-math-subject` writes it. */
const subjectKey = (s: Subject): string => (s.t === 'point' ? 'point' : `${s.t}:${s.t === 'part' ? s.i : s.k}`);

/** The target tokens under a pointer or a tap: the variable's, else its row's left side's ('' outside the rows). */
function tokensAt(target: EventTarget | null): string {
  const e = target as Element | null;
  if (!e?.closest) return '';
  const v = e.closest('[data-mt]');
  if (v) return v.getAttribute('data-mt') ?? '';
  return e.closest('[data-math-eq]')?.getAttribute('data-math-t') ?? '';
}

function MathPanel({ circuit, subject: selected, digits, live }: MathPanelProps) {
  const [follow, setFollow] = useState<'selection' | 'point'>('selection');
  const subject: Subject = follow === 'point' ? { t: 'point' } : selected;
  // The goal's node and kind: which variables also stand for the goal (mathRows' targets).
  const goal = askOf(circuit as StateCircuit).goal;
  const goalKey = `${goal.kind}${goalNode(goal, circuit.parts.length)}`;
  // The rows' frames: the symbolic lines from the committed circuit (they do not depend on the numbers).
  const rows = useMemo(() => specsFor(circuit, subject, 0, 0).map((s) => rowOf(s, digits)),
    // The shape changes with the subject, the selected part's kind and the goal only.
    [subject.t, subject.t === 'part' ? subject.i : subject.t === 'node' ? subject.k : -1, subject.t === 'part' ? circuit.parts[subject.i]?.kind : -1, circuit.parts.length, goalKey]);
  const sKey = subjectKey(subject);
  const key = rows.map((r) => r.id).join(',') + `|${sKey}|${goalKey}`;
  const symbolic = useMemo(() => rows.map((r) => ({ lhs: mathHtml(r.lhs, r.targets), rhs: mathHtml(`{}= ${r.rhs}`, r.targets) })), [key]);
  // Each row's distinct targets, in order: the arrow keys step through them in a focused row.
  const stops = useMemo(() => rows.map((r) => [...new Set(r.targets.filter(Boolean))]), [key]);

  // Open beside the chart, closed on phones (read after mount, as the node table does).
  const [open, setOpen] = useState(true);
  useEffect(() => { if (window.matchMedia('(max-width: 599px)').matches) setOpen(false); }, []);

  // "Show equation" (ShowEq.tsx): the subject (the page has set its selection), the panel open, the row focused and
  // brought into view once rendered, and a way back to the control in that row.
  const [req, setReq] = useState<(ShowRequest & { n: number }) | null>(null);
  useEffect(() => {
    mathLink.shower = (r) => {
      setFollow(r.subject.t === 'point' ? 'point' : 'selection');
      setOpen(true);
      setReq((was) => ({ ...r, n: (was?.n ?? 0) + 1 }));
    };
    return () => { mathLink.shower = null; };
  }, []);
  const list = useRef<HTMLOListElement>(null);
  const reqKey = req ? subjectKey(req.subject) : '';
  const backAt = req && reqKey === sKey ? Math.max(0, rows.findIndex((r) => r.id === req.row)) : -1;
  useEffect(() => {
    if (!req) return undefined;
    // After the commit and the details' opening: the row is laid out.
    const raf = requestAnimationFrame(() => {
      const li = list.current?.children[backAt] as HTMLElement | undefined;
      if (!li) return;
      li.scrollIntoView({ block: 'center' });
      li.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [req?.n]);
  const goBack = () => {
    const r = req;
    setReq(null);
    if (!r) return;
    const el = r.from?.isConnected ? r.from : document.querySelector<HTMLElement>(`[data-show-eq="${r.key}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
  };

  // A new subject: what was pointed at in the panel is gone.
  useLayoutEffect(() => { mathLink.reset(); }, [key]);
  useEffect(() => {
    mathLink.rows = list.current;
    return () => { mathLink.rows = null; };
  }, [open]);
  // M5.3: a row's derivation, with the panel's subject (and the readout's point).
  const derive = (id: string, from: HTMLElement) => openDerivation(id, from, subject, ...live.readPoint);
  // The arrow keys in a focused row: its targets one by one (the row's own when the stop is −1).
  const stop = useRef(-1);
  const onKey = (j: number) => (e: React.KeyboardEvent<HTMLLIElement>) => {
    if (e.target !== e.currentTarget) return;
    const s = stops[j];
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!s.length) return;
      const step = e.key === 'ArrowRight' ? 1 : -1;
      stop.current = stop.current < 0 ? (step > 0 ? 0 : s.length - 1) : (stop.current + step + s.length) % s.length;
      mathLink.unpin();
      mathLink.point('focus', s[stop.current]);
    } else if (e.key === 'Enter' && hasDerivation(rows[j].id)) {
      e.preventDefault();
      derive(rows[j].id, e.currentTarget);
    } else if (e.key === 'Escape' && (stop.current >= 0 || mathLink.pinned)) {
      e.preventDefault();
      stop.current = -1;
      mathLink.unpin();
      mathLink.point('focus', rows[j].target);
    }
  };

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
  // An equation wider than a phone scrolls sideways in its row with a Tab stop (wide.ts): checked after a render (the
  // lines are written just above) and when the panel's width changes, never in a drag's frames.
  useLayoutEffect(() => { if (open && section.current) markWide(section.current, WIDE); });
  useEffect(() => (section.current ? watchWide(section.current, WIDE) : undefined), []);

  const name = subjectName(circuit, subject);
  return (
    <section className={styles.panel} data-math="" data-math-subject={sKey} ref={section}>
      <details className={css.box} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className={`${styles.panelTitle} ${css.summary}`}>
          <span>Equations</span>
          <span className={css.summaryWhy}><Why k="math" /></span>
          <span className={styles.panelNote}>{name}</span>
        </summary>
        <div className={css.follow} role="group" aria-label="Show the equations of">
          <button type="button" aria-pressed={follow === 'selection'} data-math-follow="selection" onClick={() => setFollow('selection')}>Selected part or node</button>
          <button type="button" aria-pressed={follow === 'point'} data-math-follow="point" onClick={() => setFollow('point')}>Readout point</button>
        </div>
        <p className={css.empty}>Hover, tap or use the arrow keys on the chart to read a point.</p>
        <p className={css.keys} id="smith-math-keys">Point at or tap a variable to light up what it stands for; in a focused equation, ← and → step through them, and Enter shows its derivation.</p>
        <p className={css.keys}>Derive shows where an equation comes from, one step at a time. <Why k="derive" /></p>
        <ol className={css.rows} ref={list}
          onPointerOver={(e) => { if (e.pointerType !== 'touch') mathLink.point('hover', tokensAt(e.target)); }}
          onPointerLeave={() => mathLink.point('hover', '')}
          onClick={(e) => { if (!(e.target as Element).closest('button')) mathLink.point('pin', tokensAt(e.target)); }}>
          {rows.map((r, j) => (
            <li key={`${key}:${j}`} className={css.row} data-math-eq={r.id} data-math-t={r.target} tabIndex={0}
              aria-label={r.title} aria-describedby="smith-math-keys" onKeyDown={onKey(j)}
              onFocus={(e) => { if (e.target === e.currentTarget) { stop.current = -1; mathLink.point('focus', r.target); } }}
              onBlur={(e) => { if (e.target === e.currentTarget) mathLink.point('focus', ''); }}>
              <div className={css.grid}>
                <span className={css.lhs} dangerouslySetInnerHTML={{ __html: symbolic[j].lhs }} />
                <span dangerouslySetInnerHTML={{ __html: symbolic[j].rhs }} />
                <div className={css.live} data-math-live="" ref={(el) => live.attach(j, el)} />
              </div>
              <span className={css.title}>{r.title}</span>
              {/* The way back is the next Tab stop after a shown row (M5.2); Derive follows it. */}
              {j === backAt && <button type="button" className={css.back} data-math-back="" onClick={goBack}>↩ Back to {req.back}</button>}
              {hasDerivation(r.id) && <button type="button" className={css.derive} data-derive-open={r.id} onClick={(e) => derive(r.id, e.currentTarget)}>Derive</button>}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export default React.memo(MathPanel);
