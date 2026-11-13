// The sweep's plot, its band figures and the marker table (step M7.2b), under the chart. The plot itself is
// plotView.ts's, drawn and linked with the chart's trace outside React; this component renders its frame once, passes
// the plot's options (return loss or VSWR, the limit) on, and shows the band figures the trace layer hands over with
// each refined trace (sweep.ts bandFigures, worked out in the sweep worker).

import React, { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { formatAmount } from '../../lib/quantity';
import { magFromReturnLoss, vswr } from '../../lib/smith/convert';
import type { Circuit } from '../../lib/smith/network';
import { SWEEP_LIMIT_DB, limitIssue } from '../../lib/smith/state';
import type { SweepSetting } from '../../lib/smith/state';
import type { BandFigures } from '../../lib/smith/sweep';
import styles from '../../styles/Smith.module.css';
import css from '../../styles/SmithSweep.module.css';
import { figureTexts } from './bandText';
import type { FigureText } from './bandText';
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

/** The band figures (null: still being worked out), in bandText.ts's words; shared with the report. */
export function Figures({ fig, sweep, f0, digits, report }: { fig: BandFigures | null; sweep: SweepSetting; f0: number; digits: number; report?: boolean }) {
  if (!fig) return <p className={css.hint} {...{ [report ? 'data-r-figures-none' : 'data-figures-none']: '' }}>Working out the band figures…</p>;
  // The report's copy has attributes of its own (data-r-…), so the plot's stay unique on the page.
  const attr = report ? 'data-r-fig' : 'data-fig';
  const t = figureTexts(fig, f0, sweep.limit ?? SWEEP_LIMIT_DB, digits);
  const row = (k: string, label: React.ReactNode, [v, at]: FigureText) => (
    <div {...{ [attr]: k }}><dt>{label}</dt><dd>{v}{at && <> <span className={css.at}>{at}</span></>}</dd></div>
  );
  return (
    <dl className={css.figures} {...{ [report ? 'data-r-figures' : 'data-figures']: '' }}>
      {row('worst', 'Worst return loss', t.worst)}
      {row('best', 'Best return loss', t.best)}
      {row('vswr', 'Largest VSWR', t.vswr)}
      <div {...{ [attr]: 'intervals' }}><dt>{t.limitLabel}</dt>
        <dd>{fig.intervals.length === 0 ? t.intervals[0] : fig.intervals.map((iv, i) => <span key={i} className={css.interval} data-lo={iv.lo} data-hi={iv.hi}>{t.intervals[i]}</span>)}</dd></div>
      {row('f0', 'Around f0', t.f0)}
      {row('q', report ? 'Loaded Q' : <>Loaded Q <Why k="sweep-q" /></>, t.q)}
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
      l.figureListeners.add(setFig);
      setFig(l.figures);
    };
    make();
    return () => {
      cancelAnimationFrame(raf);
      const l = layer();
      l?.figureListeners.delete(setFig);
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
          <Figures fig={fig} sweep={sweep} f0={circuit.f0} digits={digits} />
        </div>
        <MarkerTable circuit={circuit} markers={sweep.markers} digits={digits} />
      </div>
    </section>
  );
}

export default memo(SweepPlot);
