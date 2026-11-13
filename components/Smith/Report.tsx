// The report (step M7.3): the circuit as text, its figures at f0 (Z0, f0, the load, every part and value, the input's
// z, Z, Γ, VSWR and return loss), the node table, and with a sweep the band, the band figures and the marker table,
// then the link that opens all of it again. On screen it is a panel after the tool; printed, it is the whole page
// (Smith.module.css hides the rest under @media print): light whatever the theme, nothing interactive, the chart and the
// sweep's plot as vectors. The two figures are made only when the page is printed (beforeprint, or the Print report
// button): a copy of the chart's box as it is shown, cut to the chart's disc and scaled to the paper, and the plot laid
// out again at print size by plotView.ts `printCopy`. afterprint drops them.

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';

import { ROUNDING_FLOOR, formatAmount, formatReturnLoss } from '../../lib/quantity';
import { M_ANGLE, M_MAG, M_RL, M_VSWR, M_ZI, M_ZR, METRIC_STRIDE, evaluateCircuit } from '../../lib/smith/network';
import type { Circuit } from '../../lib/smith/network';
import { KIND_NAMES, SWEEP_LIMIT_DB, formValue, formsOf } from '../../lib/smith/state';
import type { SweepSetting } from '../../lib/smith/state';
import type { BandFigures } from '../../lib/smith/sweep';
import { toDegrees } from '../../lib/smith/convert';
import styles from '../../styles/Smith.module.css';
import css from '../../styles/SmithSweep.module.css';
import rc from '../../styles/SmithReport.module.css';
import { hzText } from './bandText';
import type { ChartView } from './chartView';
import MarkerTable from './MarkerTable';
import { nodeName } from './pathLayer';
import type { PlotView } from './plotView';
import { complexText, gammaPolarText } from './readout';
import { Figures } from './SweepPlot';
import type { TraceLayer } from './traceLayer';
import { Why } from './Why';

export interface ReportProps {
  circuit: Circuit;
  sweep: SweepSetting | null;
  digits: number;
  /** The page's link search (without "?"), as the address bar has it. */
  search: string;
  layer: () => TraceLayer | null;
  chart: () => ChartView | null;
}

/** A part's values in words: every form of its card but the normalised ones ("C = 31.83 pF, X = −50 Ω"). */
export function partText(c: Circuit, i: number, d: number): string {
  const p = c.parts[i];
  const vals = formsOf(p.kind).filter((f) => f.id !== 'n').map((f) => {
    const v = formValue(f.id, p, c);
    const t = f.unit === 'λ' ? `${formatAmount(v, '', d)} λ` : f.unit === '°' ? `${formatAmount(v, '', d)}°` : formatAmount(v, f.unit, d);
    return `${f.label} = ${t}`;
  });
  return `${KIND_NAMES[p.kind]}: ${vals.join(', ')}`;
}

/** A node's texts: z (normalised), Z in Ω, Γ (polar), VSWR, return loss, at f0. */
export function reportNodeTexts(c: Circuit, d: number): string[][] {
  const { metrics } = evaluateCircuit(c);
  const out: string[][] = [];
  for (let k = 0, m = 0; k <= c.parts.length; k++, m += METRIC_STRIDE) {
    const zr = metrics[m + M_ZR], zi = metrics[m + M_ZI];
    out.push([
      complexText(zr, zi, '', d),
      complexText(zr * c.z0, zi * c.z0, 'Ω', d, ROUNDING_FLOOR * c.z0),
      gammaPolarText(metrics[m + M_MAG], toDegrees(metrics[m + M_ANGLE]), d),
      formatAmount(metrics[m + M_VSWR], '', d, true),
      formatReturnLoss(metrics[m + M_RL], d),
    ]);
  }
  return out;
}

const NODE_HEADS = ['z', 'Z', 'Γ', 'VSWR', 'Return loss'];
/** The plot's print size in px (its viewBox): about the width of A4 or Letter inside the margins. */
const PLOT_W = 680, PLOT_H = 240;
/** Room kept around the chart's disc for the rim's scales and labels (box px). */
const RIM_PX = 44;
/** The printed chart's width: 150 mm in CSS px (rc.chartFrame's width). */
const CHART_PRINT_PX = (150 * 96) / 25.4;
/** What of the chart's box is not printed: handles, their keys, snapping, the draw tool, the read point, the cursor. */
const DROP = '[data-handle],[data-layer="handle-keys"],[data-snap],[data-snap-label],[data-draw-start],[data-part="read"],[data-sweep-cursor],[hidden]';

/** The chart as shown, cut to its disc (and the box), in a frame whose CSS scales it to the paper; null without a view. */
function chartCopy(v: ChartView): HTMLElement | null {
  const x0 = Math.max(0, v.screenX(-1) - RIM_PX), x1 = Math.min(v.w, v.screenX(1) + RIM_PX);
  const y0 = Math.max(0, v.screenY(1) - RIM_PX), y1 = Math.min(v.h, v.screenY(-1) + RIM_PX);
  const cw = x1 - x0, ch = y1 - y0;
  if (!(cw > 1 && ch > 1)) return null;
  const copy = v.box.cloneNode(true) as HTMLElement;
  for (const e of copy.querySelectorAll(DROP)) e.remove();
  for (const e of [copy, ...copy.querySelectorAll('*')]) {
    for (const a of [...e.attributes]) if (a.name === 'id' || a.name === 'tabindex' || a.name === 'role' || a.name.startsWith('aria-')) e.removeAttribute(a.name);
  }
  copy.removeAttribute('data-chart');
  copy.setAttribute('data-print-chart', '');
  // The copy keeps its px and is scaled to the frame's 150 mm.
  copy.style.cssText = `position:absolute;left:0;top:0;width:${v.w}px;height:${v.h}px;border:0;border-radius:0;transform-origin:0 0;`
    + `transform:scale(${CHART_PRINT_PX / cw}) translate(${-x0}px, ${-y0}px)`;
  const frame = document.createElement('div');
  frame.className = rc.chartFrame;
  frame.style.aspectRatio = `${cw} / ${ch}`;
  frame.appendChild(copy);
  return frame;
}

function Report({ circuit, sweep, digits, search, layer, chart }: ReportProps) {
  const chartBox = useRef<HTMLDivElement>(null);
  const plotBox = useRef<HTMLDivElement>(null);
  const stamp = useRef<HTMLSpanElement>(null);
  const [fig, setFig] = useState<BandFigures | null>(null);
  const [where, setWhere] = useState('/smith-chart/main');
  const hasSweep = !!sweep;

  // The band figures, from the same listener set as the plot's.
  useEffect(() => {
    if (!hasSweep) { setFig(null); return undefined; }
    let raf = 0, l: TraceLayer | null = null;
    const join = () => {
      l = layer();
      if (!l) { raf = requestAnimationFrame(join); return; }
      l.figureListeners.add(setFig);
      setFig(l.figures);
    };
    join();
    return () => { cancelAnimationFrame(raf); l?.figureListeners.delete(setFig); };
  }, [hasSweep, layer]);

  useEffect(() => { setWhere(`${window.location.origin}${window.location.pathname}`); }, []);
  // Rendered once in full, so contain-intrinsic-size remembers its real size, then skipped while off screen (rc.lazy).
  const [lazy, setLazy] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setLazy(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);

  // The figures for print: made just before, dropped after.
  const prepare = useRef<() => void>(null);
  prepare.current = () => {
    const v = chart();
    // In print media the chart's box is hidden and its view has no size: a copy made before (beforeprint, the button)
    // is kept then (Chromium's own beforeprint for a PDF comes in print media).
    const copy = v ? chartCopy(v) : null;
    if (copy || !v) chartBox.current?.replaceChildren(...(copy ? [copy] : []));
    const plot = sweep ? (layer()?.plot as PlotView | null) : null;
    plotBox.current?.replaceChildren(...(plot && plot.shown ? [plot.printCopy(PLOT_W, PLOT_H)] : []));
    if (stamp.current) stamp.current.textContent = new Date().toLocaleString();
  };
  useEffect(() => {
    const before = () => prepare.current();
    const after = () => { chartBox.current?.replaceChildren(); plotBox.current?.replaceChildren(); };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  const d = digits, n = circuit.parts.length;
  const nodes = useMemo(() => reportNodeTexts(circuit, d), [circuit, d]);
  const parts = useMemo(() => circuit.parts.map((_, i) => partText(circuit, i, d)), [circuit, d]);
  const input = nodes[n];
  const band = sweep?.band;
  const link = `${where}?${search}`;

  return (
    <section className={rc.report} aria-labelledby="smith-report" data-report="">
      <h2 className={`${styles.panelTitle} ${rc.title}`} id="smith-report">
        <span className={rc.head}><span className={rc.screen}>Report</span><span className={rc.print}>Smith chart report</span> <Why k="report" /></span>
        <span className={rc.print} ref={stamp} data-report-stamp="" />
        <button type="button" className={`${styles.button} ${rc.printButton}`} data-print-report="" onClick={() => { prepare.current(); window.print(); }}>Print report</button>
      </h2>

      {/* The body is skipped off screen (rc.lazy); the head and the link stay outside it: a fixed short-line bubble
          inside containment would be placed in the body's frame, not the screen's. */}
      <div className={lazy ? `${rc.body} ${rc.lazy}` : rc.body}>
      <div className={rc.figs}>
        <div ref={chartBox} className={rc.chartBox} data-report-chart="" />
      </div>

      <div className={rc.grid}>
        <div className={rc.block} data-report-circuit="">
          <h3 className={css.sub}>Circuit</h3>
          <dl className={rc.list}>
            <div><dt>Z0</dt><dd data-r="z0">{formatAmount(circuit.z0, 'Ω', d)}</dd></div>
            <div><dt>f0</dt><dd data-r="f0">{hzText(circuit.f0, d)}</dd></div>
            <div><dt>Load</dt><dd data-r="load">{complexText(circuit.loadR, circuit.loadX, 'Ω', d, ROUNDING_FLOOR * circuit.z0)}</dd></div>
          </dl>
          <p className={rc.note}>{n === 0 ? 'No parts: the input is the load.' : `${n} part${n === 1 ? '' : 's'}, from the load to the input:`}</p>
          {n > 0 && <ol className={rc.parts}>{parts.map((t, i) => <li key={i} data-r-part={i}>{t}</li>)}</ol>}
        </div>
        <div className={rc.block} data-report-input="">
          <h3 className={css.sub}>The input at f0</h3>
          <dl className={rc.list}>
            <div><dt>z</dt><dd data-r="z">{input[0]}</dd></div>
            <div><dt>Z</dt><dd data-r="Z">{input[1]}</dd></div>
            <div><dt>Γ</dt><dd data-r="gamma">{input[2]}</dd></div>
            <div><dt>VSWR</dt><dd data-r="vswr">{input[3]}</dd></div>
            <div><dt>Return loss</dt><dd data-r="rl">{input[4]}</dd></div>
          </dl>
        </div>
      </div>

      <div className={rc.block} data-report-nodes="">
        <h3 className={css.sub}>Nodes at f0</h3>
        <div className={css.tableWrap} tabIndex={0} role="region" aria-label="Node table">
          <table className={css.table}>
            <thead><tr><th scope="col">Node</th>{NODE_HEADS.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {nodes.map((r, k) => (
                <tr key={k} data-r-node={k}>
                  <th scope="row">{nodeName(k, n)}</th>
                  {r.map((t, j) => <td key={j} data-label={NODE_HEADS[j]}>{t}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {sweep && (
        <div className={rc.sweep} data-report-sweep="">
          <h3 className={css.sub}>Sweep</h3>
          <p className={rc.note} data-r="band">
            {hzText(band.start, d)} to {hzText(band.stop, d)}, {band.points} points, {band.log ? 'logarithmic' : 'linear'} steps;
            {' '}limit {formatAmount(sweep.limit ?? SWEEP_LIMIT_DB, 'dB', 4)} return loss; the plot shows {sweep.vswr ? 'VSWR' : 'return loss'}.
          </p>
          <div ref={plotBox} className={`${css.plot} ${rc.plotBox}`} data-report-plot="" />
          <div className={`${rc.grid} ${rc.stack}`}>
            <div className={rc.block}>
              <h3 className={css.sub}>Band figures</h3>
              <Figures fig={fig} sweep={sweep} f0={circuit.f0} digits={d} report />
            </div>
            <div className={rc.block}><MarkerTable circuit={circuit} markers={sweep.markers} digits={d} report /></div>
          </div>
        </div>
      )}

      </div>

      <div className={rc.block} data-report-link="">
        <h3 className={css.sub}>Link <Why k="report-link" /></h3>
        <p className={rc.link} data-r="link">{link}</p>
      </div>
    </section>
  );
}

export default memo(Report);
