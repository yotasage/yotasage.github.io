import React, { ReactNode, useEffect, useLayoutEffect, useRef } from 'react';

import styles from '../../styles/Smith.module.css';
import { ChartView } from './chartView';
import { READOUT_FIELDS, writeReadout } from './readout';

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
}

const LABELS: Record<(typeof READOUT_FIELDS)[number], string> = {
  z: 'z', Z: 'Z', y: 'y', Y: 'Y', gamma: 'Γ', gammaRect: 'Γ', vswr: 'VSWR', rl: 'Return loss', note: '',
};
const HINTS: Partial<Record<(typeof READOUT_FIELDS)[number], string>> = {
  z: 'normalised', y: 'normalised', gamma: 'polar', gammaRect: 'Cartesian',
};

/**
 * The chart's workspace: the toolbar (grid switch, Fit, Reset, zoom), the focusable box with the grid's <svg> and the
 * top <svg>, the gesture hint, and the side panel with the readout (beside the chart on wide screens, below it on
 * phones). Everything that changes with the pointer is written by ChartView in its frame loop; React renders this once.
 */
export default function Chart({ mode, z0 = 50, tools, side, onView }: ChartProps) {
  const box = useRef<HTMLDivElement>(null);
  const gridSvg = useRef<SVGSVGElement>(null);
  const top = useRef<SVGSVGElement>(null);
  const zoomText = useRef<HTMLSpanElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const values = useRef<(HTMLElement | null)[]>([]);
  const view = useRef<ChartView | null>(null);
  const z0Ref = useRef(z0);

  useLayoutEffect(() => {
    const v = new ChartView(box.current, gridSvg.current, top.current);
    v.mode = mode;
    view.current = v;
    (box.current as HTMLDivElement & { smithChart?: ChartView }).smithChart = v;
    v.onReadout = (gr, gi) => {
      writeReadout(values.current, gr, gi, z0Ref.current);
      frame.current?.toggleAttribute('data-read', gr === gr);
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
  }, [z0]);

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
          </div>
        </div>
        <div ref={box} className={styles.chart} tabIndex={0} role="group" data-chart=""
          aria-label="Smith chart. Arrow keys pan, plus and minus zoom, 0 or Home fits; the readout shows the point at the centre."
          aria-describedby="smith-chart-keys">
          <svg ref={gridSvg} className={styles.grid} aria-hidden="true" />
          <svg ref={top} className={styles.top} aria-hidden="true" />
        </div>
        <p className={styles.hint} id="smith-chart-keys">
          <span className={styles.hintFine}>Wheel or pinch to zoom, drag to pan, hover to read · keys: arrows, + −, 0</span>
          <span className={styles.hintTouch}>Pinch to zoom, two fingers or a sideways swipe to pan, tap to read</span>
        </p>
      </section>
      <aside className={styles.side}>
        {side}
        <section className={styles.panel} aria-labelledby="smith-readout">
          <h2 className={styles.panelTitle} id="smith-readout">Readout <span className={styles.panelNote}>Z0 = {z0} Ω</span></h2>
          <dl className={styles.readout}>
            {READOUT_FIELDS.map((f, i) => f !== 'note' && (
              <div key={f} className={styles.readRow}>
                <dt>{LABELS[f]}{HINTS[f] && <span className={styles.readHint}> {HINTS[f]}</span>}{(f === 'Z' || f === 'Y') && <span className={styles.readHint}> in {f === 'Z' ? 'Ω' : 'S'}</span>}</dt>
                <dd data-field={f} ref={(el) => { values.current[i] = el; }}>–</dd>
              </div>
            ))}
          </dl>
          <p className={styles.readNote} data-field="note" ref={(el) => { values.current[READOUT_FIELDS.indexOf('note')] = el; }} />
          <p className={styles.readEmpty}>Hover, tap or use the arrow keys on the chart to read a point.</p>
        </section>
      </aside>
    </div>
  );
}
