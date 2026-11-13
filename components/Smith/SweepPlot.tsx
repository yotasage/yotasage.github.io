// The sweep's plot, its band figures and the marker table (step M7.2b), under the chart. The plot itself is
// plotView.ts's, drawn and linked with the chart's trace outside React; this component renders its frame once, passes
// the plot's options (return loss or VSWR, the limit) on, and shows the band figures the trace layer hands over with
// each refined trace (sweep.ts bandFigures, worked out in the sweep worker).

import React, { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { formatAmount, formatReturnLoss } from '../../lib/quantity';
import { magFromReturnLoss, vswr } from '../../lib/smith/convert';
import type { Circuit } from '../../lib/smith/network';
import { SWEEP_LIMIT_DB, limitIssue } from '../../lib/smith/state';
import type { SweepSetting } from '../../lib/smith/state';
import type { BandFigures, Interval } from '../../lib/smith/sweep';
import styles from '../../styles/Smith.module.css';
import css from '../../styles/SmithSweep.module.css';
import MarkerTable from './MarkerTable';
import { PlotView } from './plotView';
import { Field } from './Strip';
import type { TraceLayer } from './traceLayer';
import { Why } from './Why';

export interface SweepPlotProps {
  /** The page's trace layer (made with the chart). */
  layer: () => TraceLayer | null;
  sweep: SweepSetting;
  circuit: Circuit;
  digits: number;
  onChange: (next: SweepSetting) => void;
  revision?: number;
}

const hz = (f: number, d: number): string => formatAmount(f, 'Hz', d, true);

/** An interval's text: "95.1 MHz – 104.9 MHz", an open end marked as the band's ("≤ 20 MHz" for an open start). */
function intervalText(iv: Interval, d: number): string {
  return `${iv.openLo ? '≤ ' : ''}${hz(iv.lo, d)} – ${iv.openHi ? '≥ ' : ''}${hz(iv.hi, d)}`;
}

function Figures({ fig, sweep, digits }: { fig: BandFigures | null; sweep: SweepSetting; digits: number }) {
  if (!fig) return <p className={css.hint} data-figures-none="">Working out the band figures…</p>;
  const d = digits, limit = sweep.limit ?? SWEEP_LIMIT_DB, a = fig.atF0, q = fig.q;
  return (
    <dl className={css.figures} data-figures="">
      <div data-fig="worst"><dt>Worst return loss</dt><dd>{formatReturnLoss(fig.worstRL, d)} <span className={css.at}>at {hz(fig.worst.f, d)}</span></dd></div>
      <div data-fig="best"><dt>Best return loss</dt><dd>{formatReturnLoss(fig.bestRL, d)} <span className={css.at}>at {hz(fig.best.f, d)}</span></dd></div>
      <div data-fig="vswr"><dt>Largest VSWR</dt><dd>{formatAmount(fig.maxVswr, '', d, true)}</dd></div>
      <div data-fig="intervals"><dt>Return loss ≥ {formatAmount(limit, 'dB', 4)}</dt>
        <dd>{fig.intervals.length === 0 ? 'nowhere in the band' : fig.intervals.map((iv, i) => <span key={i} className={css.interval} data-lo={iv.lo} data-hi={iv.hi}>{intervalText(iv, d)}</span>)}</dd></div>
      <div data-fig="f0"><dt>Around f0</dt>
        <dd>{a ? <>{intervalText(a, d)} <span className={css.at}>{a.openLo || a.openHi ? '≥ ' : ''}{formatAmount(a.hi - a.lo, 'Hz', d, true)}, {a.openLo || a.openHi ? '≥ ' : ''}{formatAmount(100 * fig.fractional, '%', d, true)} of f0</span></> : 'f0 is not in a part of the band below the limit'}</dd></div>
      <div data-fig="q"><dt>Loaded Q <Why k="sweep-q" /></dt>
        <dd>{q ? <>{q.openLo || q.openHi ? '≤ ' : ''}{formatAmount(q.q, '', d, true)} <span className={css.at}>at {hz(q.f, d)}{q.openLo || q.openHi ? ', the band ends before half power' : ''}</span></> : 'no match to measure'}</dd></div>
    </dl>
  );
}

function SweepPlot({ layer, sweep, circuit, digits, onChange, revision }: SweepPlotProps) {
  const root = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<PlotView | null>(null);
  const [fig, setFig] = useState<BandFigures | null>(() => layer()?.figures ?? null);
  const isVswr = !!sweep.vswr, limit = sweep.limit ?? SWEEP_LIMIT_DB;

  useLayoutEffect(() => {
    let raf = 0;
    const make = () => {
      const l = layer();
      if (!l) { raf = requestAnimationFrame(make); return; }
      const v = new PlotView(box.current, root.current, l);
      view.current = v;
      (box.current as HTMLElement & { smithPlot?: PlotView }).smithPlot = v;
      v.setOptions(isVswr, limit);
      l.onFigures = setFig;
      setFig(l.figures);
    };
    make();
    return () => {
      cancelAnimationFrame(raf);
      const l = layer();
      if (l && l.onFigures === setFig) l.onFigures = null;
      view.current?.destroy();
      view.current = null;
    };
    // The plot lives as long as the component; its options are passed on below.
  }, []);
  useEffect(() => { view.current?.setOptions(isVswr, limit); }, [isVswr, limit]);

  const lim = magFromReturnLoss(limit);
  return (
    <section className={css.results} ref={root} aria-labelledby="smith-plot" data-sweep-results="">
      <div className={css.plotHead}>
        <h2 className={styles.panelTitle} id="smith-plot"><span className={css.head}>Sweep plot <Why k="sweep-plot" /></span></h2>
        <div className={css.pair} role="group" aria-label="The plot shows">
          {[false, true].map((v) => (
            <button key={String(v)} type="button" className={`${styles.button} ${styles.toggle} ${css.btn}`} aria-pressed={isVswr === v}
              data-plot-kind={v ? 'vswr' : 'rl'} onClick={() => { if (isVswr !== v) onChange({ ...sweep, vswr: v || undefined }); }}>
              {v ? 'VSWR' : 'Return loss'}
            </button>
          ))}
        </div>
        <Why k="sweep-plot-kind" />
        <div className={css.limit}>
          <Field name="sweep-limit" label="Limit" hint="return loss" revision={revision} why="sweep-limit" shown={`${formatAmount(limit, '', 6)} dB`}
            edit={(t) => {
              const m = /^\s*[-−]?\s*([0-9.,eE+-]+)\s*(dB)?\s*$/i.exec(t);
              const v = m ? Number(m[1].replace(',', '.')) : NaN;
              if (!t.trim()) return 'empty';
              if (!(v === v)) return `cannot read “${t.trim()}” as a return loss in dB`;
              const why = limitIssue(v);
              if (!why) onChange({ ...sweep, limit: v === SWEEP_LIMIT_DB ? undefined : v });
              return why;
            }} />
          <span className={css.at} data-limit-gamma="">|Γ| &lt; {formatAmount(lim, '', 4, true)}, VSWR &lt; {formatAmount(vswr(lim), '', 4, true)}</span>
        </div>
      </div>
      <div ref={box} className={css.plot} tabIndex={0} role="group" data-plot=""
        aria-label={`Plot of the ${isVswr ? 'VSWR' : 'return loss'} across the band. Left and right arrow keys move the cursor along the trace (Shift: ten points), Home and End go to the band's ends, Enter adds a marker at the cursor.`} />
      <p className={css.hint}>Hover, tap or use the arrow keys on the plot to point at a frequency on both; tap or click the curve to add a marker, drag one along the band.</p>
      <div className={css.under}>
        <div>
          <h3 className={css.sub}>Band figures <Why k="sweep-figures" /></h3>
          <Figures fig={fig} sweep={sweep} digits={digits} />
        </div>
        <MarkerTable circuit={circuit} markers={sweep.markers} digits={digits} />
      </div>
    </section>
  );
}

export default memo(SweepPlot);
