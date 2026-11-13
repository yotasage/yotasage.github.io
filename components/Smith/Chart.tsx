import React, { ReactNode, useEffect, useLayoutEffect, useRef } from 'react';

import styles from '../../styles/Smith.module.css';
import { ChartView } from './chartView';
import { READOUT_ROWS } from './mathLink';
import { DIGIT_CHOICES, READOUT_FIELDS, writeReadout } from './readout';
import { ShowEq } from './ShowEq';
import { Why } from './Why';

export interface ChartProps {
  mode: number;  // MODE_Z, MODE_Y or MODE_ZY
  /** Reference impedance in Ω (real, positive). */
  z0?: number;
  /** Controls at the start of the chart's toolbar (the grid switch). */
  tools?: ReactNode;
  /** The side panel's content above the readout (M3: the circuit strip and the part cards). */
  side?: ReactNode;
  /** Receives the controller once it exists (M3 adds its layers and handles through it). */
  onView?: (view: ChartView) => void;
  /** The side panel's content below the readout (M5.1: the equation panel). */
  after?: ReactNode;
  /** The readout's point in each of its frames (NaN when there is none; M5.1: the equation panel follows it). */
  onReadout?: (gr: number, gi: number) => void;
  /** The digits setting (readout.ts shownDigits, already set by the page) and its change. */
  digits?: number;
  onDigits?: (digits: number) => void;
  /** No readout at all (M6.3b: a "read this point" challenge; the grid and its labels stay). */
  noReadout?: boolean;
}

const LABELS: Record<(typeof READOUT_FIELDS)[number], string> = {
  z: 'z', Z: 'Z', y: 'y', Y: 'Y', gamma: 'Γ', gammaRect: 'Γ', vswr: 'VSWR', rl: 'Return loss', note: '',
};
/** What a readout row's "show equation" names (M5.2). */
const WHATS: Record<(typeof READOUT_FIELDS)[number], string> = {
  z: 'z', Z: 'Z', y: 'y', Y: 'Y', gamma: 'Γ', gammaRect: 'Γ', vswr: 'the VSWR', rl: 'the return loss', note: '',
};
const POINT = { t: 'point' } as const;
const HINTS: Partial<Record<(typeof READOUT_FIELDS)[number], string>> = {
  z: 'normalised', y: 'normalised', gamma: 'polar', gammaRect: 'Cartesian',
};

/**
 * The chart's workspace: the toolbar (grid switch, Fit, Reset, zoom), the focusable box with the grid's <svg> and the
 * top <svg>, the gesture hint, and the side panel with the readout (beside the chart on wide screens, below it on
 * phones). Everything that changes with the pointer is written by ChartView in its frame loop; React renders this once.
 */
export default function Chart({ mode, z0 = 50, tools, side, onView, after, onReadout, digits, onDigits, noReadout }: ChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const gridSvg = useRef<SVGSVGElement>(null);
  const top = useRef<SVGSVGElement>(null);
  const zoomText = useRef<HTMLSpanElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const values = useRef<(HTMLElement | null)[]>([]);
  const view = useRef<ChartView | null>(null);
  const z0Ref = useRef(z0);
  const readRef = useRef(onReadout);
  readRef.current = onReadout;

  useLayoutEffect(() => {
    const v = new ChartView(box.current, gridSvg.current, top.current);
    v.mode = mode;
    view.current = v;
    (box.current as HTMLDivElement & { smithChart?: ChartView }).smithChart = v;
    v.onReadout = (gr, gi) => {
      writeReadout(values.current, gr, gi, z0Ref.current);
      frame.current?.toggleAttribute('data-read', gr === gr);
      readRef.current?.(gr, gi);
    };
    let shown = '';
    v.onFrame = () => {
      const z = v.zoom, text = `${z < 9.995 ? z.toFixed(2) : z < 99.95 ? z.toFixed(1) : Math.round(z)}×`;
      if (text !== shown && zoomText.current) zoomText.current.textContent = shown = text;
    };
    onView?.(v);
    return () => { v.destroy(); view.current = null; };
    // The controller lives as long as the component; mode and z0 are passed on below.
  }, []);

  useEffect(() => { view.current?.setMode(mode); }, [mode]);
  useEffect(() => {
    z0Ref.current = z0;
    const v = view.current;
    if (v) v.onReadout?.(v.readX, v.readY);
  }, [z0, digits]);

  return (
    <div className={styles.work} ref={frame}>
      <section className={styles.stage} aria-label="Chart">
        <div className={styles.toolbar}>
          {tools}
          <span className={styles.toolSpace} />
          <div className={styles.viewTools}>
            <span className={styles.zoom} ref={zoomText} aria-label="Zoom" title="Zoom">1.00×</span>
            <button type="button" className={styles.button} onClick={() => view.current?.fit()} title="Show the whole chart (0 or Home)">Fit</button>
            <button type="button" className={styles.button} onClick={() => view.current?.reset()} title="Whole chart, no read point">Reset</button>
            <Why k="zoom" />
          </div>
        </div>
        <div ref={box} className={styles.chart} tabIndex={0} role="group" data-chart=""
          aria-label="Smith chart. Arrow keys pan, plus and minus zoom, 0 or Home fits; the readout shows the point at the centre."
          aria-describedby="smith-chart-keys">
          <svg ref={gridSvg} className={styles.grid} aria-hidden="true" />
          <svg ref={top} className={styles.top} aria-hidden="true" />
        </div>
        <div className={styles.hintRow}>
          <p className={styles.hint} id="smith-chart-keys">
            <span className={styles.hintFine}>Wheel or pinch to zoom, drag to pan, drag a ring to set its part (Alt: no snapping), hover to read · keys: arrows, + −, 0</span>
            <span className={styles.hintTouch}>Pinch to zoom, two fingers or a sideways swipe to pan, drag a ring to set its part, tap to read</span>
          </p>
          <span className={styles.hintWhys}><Why k="ring" label="Rings" /><Why k="rim" label="Rim scales" /></span>
        </div>
      </section>
      <aside className={styles.side}>
        {side}
        {!noReadout && <section className={styles.panel} aria-labelledby="smith-readout" data-readout="">
          <h2 className={styles.panelTitle} id="smith-readout">
            <span>Readout<Why k="show-eq" /></span>
            {onDigits && (
              <label className={styles.digits} title="Significant digits of the readout, the node table, the circuit input and the equations">
                <span>Digits</span>
                <select value={digits} data-digits="" onChange={(e) => onDigits(Number(e.currentTarget.value))}>
                  {DIGIT_CHOICES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
            )}
            <span className={styles.panelNote}>Z0 = {z0} Ω</span>
          </h2>
          <dl className={styles.readout}>
            {READOUT_FIELDS.map((f, i) => f !== 'note' && (
              <div key={f} className={styles.readRow} data-read-row={f}>
                <dt>{LABELS[f]}{HINTS[f] && <span className={styles.readHint}> {HINTS[f]}</span>}{(f === 'Z' || f === 'Y') && <span className={styles.readHint}> in {f === 'Z' ? 'Ω' : 'S'}</span>}<Why k={`read-${f}`} />
                  <ShowEq subject={POINT} row={READOUT_ROWS[f]} k={`read:${f}`} what={`${WHATS[f]} at the readout's point`} back="the readout" /></dt>
                <dd data-field={f} ref={(el) => { values.current[i] = el; }}>–</dd>
              </div>
            ))}
          </dl>
          <p className={styles.readNote} data-field="note" ref={(el) => { values.current[READOUT_FIELDS.indexOf('note')] = el; }} />
          <p className={styles.readEmpty}>Hover, tap or use the arrow keys on the chart to read a point.</p>
        </section>}
        {after}
      </aside>
    </div>
  );
}
