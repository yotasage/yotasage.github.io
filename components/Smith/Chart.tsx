import React, { ReactNode, useEffect, useLayoutEffect, useRef } from 'react';

import { useI18n } from '../../lib/ui/i18n';
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
  /** Persistent top of the side panel (active lesson/challenge/guide banner and inspector tabs). */
  sideTop?: ReactNode;
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
  /** Non-destructively hides the readout card when another inspector tab is active (keeps DOM refs mounted for live writes). */
  readoutHidden?: boolean;
  /** Under the chart, in its column (M7.2b: the sweep's plot, figures and markers); on wide screens the chart is then lower. */
  below?: ReactNode;
}

const POINT = { t: 'point' } as const;

/**
 * The chart's workspace: the toolbar (grid switch, Fit, Reset, zoom), the focusable box with the grid's <svg> and the
 * top <svg>, the gesture hint, and the side panel with the readout (beside the chart on wide screens, below it on
 * phones). Everything that changes with the pointer is written by ChartView in its frame loop; React renders this once.
 */
export default function Chart({ mode, z0 = 50, tools, sideTop, side, onView, after, onReadout, digits, onDigits, noReadout, readoutHidden, below }: ChartProps) {
  const { t, locale } = useI18n();
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

  const labels: Record<(typeof READOUT_FIELDS)[number], string> = {
    z: 'z', Z: 'Z', y: 'y', Y: 'Y', gamma: 'Γ', gammaRect: 'Γ', vswr: 'VSWR', rl: t('sm.chart.returnLoss'), note: '',
  };
  const whats: Record<(typeof READOUT_FIELDS)[number], string> = {
    z: 'z', Z: 'Z', y: 'y', Y: 'Y', gamma: 'Γ', gammaRect: 'Γ', vswr: t('sm.chart.whatVswr'), rl: t('sm.chart.whatRl'), note: '',
  };
  const hints: Partial<Record<(typeof READOUT_FIELDS)[number], string>> = {
    z: t('sm.chart.hintNorm'), y: t('sm.chart.hintNorm'), gamma: t('sm.chart.hintPolar'), gammaRect: t('sm.chart.hintCart'),
  };

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
  }, [z0, digits, locale]);

  return (
    <div className={styles.work} ref={frame}>
      <section className={styles.stage} aria-label={t('sm.chart.stageAria')} data-below={below ? '' : undefined}>
        <div className={styles.toolbar}>
          {tools}
          <span className={styles.toolSpace} />
          <div className={styles.viewTools}>
            <span className={styles.zoom} ref={zoomText} aria-label={t('sm.chart.zoomAria')} title={t('sm.chart.zoomAria')}>1.00×</span>
            <button type="button" className={styles.button} onClick={() => view.current?.fit()} title={t('sm.chart.fitTitle')}>{t('sm.chart.fit')}</button>
            <button type="button" className={styles.button} onClick={() => view.current?.reset()} title={t('sm.chart.resetTitle')}>{t('sm.chart.reset')}</button>
            <Why k="zoom" />
          </div>
        </div>
        <div ref={box} className={styles.chart} tabIndex={0} role="group" data-chart=""
          aria-label={t('sm.chart.boxAria')}
          aria-describedby="smith-chart-keys">
          <svg ref={gridSvg} className={styles.grid} aria-hidden="true" />
          <svg ref={top} className={styles.top} aria-hidden="true" />
        </div>
        <div className={styles.hintRow}>
          <p className={styles.hint} id="smith-chart-keys">
            <span className={styles.hintFine}>{t('sm.chart.hintFine')}</span>
            <span className={styles.hintTouch}>{t('sm.chart.hintTouch')}</span>
          </p>
          <span className={styles.hintWhys}><Why k="ring" label={t('sm.chart.rings')} /><Why k="rim" label={t('sm.chart.rimScales')} /></span>
        </div>
        {below}
      </section>
      <aside className={styles.side}>
        {sideTop}
        {side}
        {!noReadout && <section className={styles.panel} aria-labelledby="smith-readout" data-readout="" hidden={readoutHidden}>
          <h2 className={styles.panelTitle} id="smith-readout">
            <span>{t('sm.chart.readout')}<Why k="show-eq" /></span>
            {onDigits && (
              <label className={styles.digits} title={t('sm.chart.digitsTitle')}>
                <span>{t('sm.chart.digits')}</span>
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
                <dt>{labels[f]}{hints[f] && <span className={styles.readHint}> {hints[f]}</span>}{(f === 'Z' || f === 'Y') && <span className={styles.readHint}> {t('sm.chart.hintInUnit', { unit: f === 'Z' ? 'Ω' : 'S' })}</span>}<Why k={`read-${f}`} />
                  <ShowEq subject={POINT} row={READOUT_ROWS[f]} k={`read:${f}`} what={t('sm.chart.atReadout', { what: whats[f] })} back={t('sm.chart.backReadout')} /></dt>
                <dd data-field={f} ref={(el) => { values.current[i] = el; }}>–</dd>
              </div>
            ))}
          </dl>
          <p className={styles.readNote} data-field="note" ref={(el) => { values.current[READOUT_FIELDS.indexOf('note')] = el; }} />
          <p className={styles.readEmpty}>{t('sm.chart.readEmpty')}</p>
        </section>}
        {after}
      </aside>
    </div>
  );
}
