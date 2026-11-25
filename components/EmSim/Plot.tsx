// A plot of lib/emsim/plot.ts drawn as SVG (step M2.3a): several series over one x axis, each with an optional band
// (the solver's error, or a tolerance), 1-2-5 ticks, a dashed marker at the current value and a cursor shared with the
// other plots of the same x (the parent holds it). The plot follows its box's width (ResizeObserver) and works from
// 320 px. The cursor moves by pointer (hover or tap; touch-action pan-y keeps the page's vertical scroll), and by the
// arrow keys on the focused plot (a slider for screen readers: Shift moves ten points, Home and End go to the ends);
// the readout under the plot is text (read out by Calm.tsx once the cursor rests, M9.1a) and never only on hover.
// M3.2a: an x axis in another unit than its labels (`xScale`: seconds labelled in ps or ns), dashed reference lines
// across the plot (`lines`, kept inside the y range), a faded range from `fadeFrom` on (where the model no longer
// holds), dimmed while `stale`, and the series' exact values at the cursor in the readout's `data-values`.

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { PLOT_U, bandPath, extent, frac, linePath, niceAxis, readAt, stepCursor, tickText, ticks, valueAt } from '../../lib/emsim/plot';
import type { Axis, Scale } from '../../lib/emsim/plot';
import { useI18n } from '../../lib/ui/i18n';
import css from '../../styles/EmSimTools.module.css';
import Calm from './Calm';

export interface PlotSeries { name: string; ys: number[]; lo?: number[]; hi?: number[] }

/** The series' colours: theme variables of the page. */
export const SERIES_COLOURS = ['var(--accent)', 'var(--copper)', 'var(--mask)', 'var(--warn)'];

interface Props {
  name: string; // data-plot
  title: string; // the quantity and its unit, above the plot
  xs: number[]; // shown units, ascending
  series: PlotSeries[];
  xDomain: [number, number];
  xLabel: string; // the input and its unit, under the plot
  marker?: number; // the current value of the input
  cursor: number; // shared; NaN for none
  onCursor: (x: number) => void;
  readout: (x: number) => string;
  xScale?: Scale; // tick labels of x times k (the readout and the label say the unit)
  lines?: { y: number; name: string }[]; // dashed reference lines, labelled at the right
  fadeFrom?: number; // x from which the plot is faded
  stale?: boolean;
}

const H = 168, ML = 50, MR = 12, MT = 8, MB = 22;

function Plot({ name, title, xs, series, xDomain, xLabel, marker, cursor, onCursor, readout, xScale, lines, fadeFrom, stale }: Props) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el);
    setW(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const pw = Math.max(40, w - ML - MR), ph = H - MT - MB;
  const ax: Axis = useMemo(() => ({ min: xDomain[0], max: xDomain[1] }), [xDomain]);
  const mostX = Math.max(2, Math.floor(pw / 72)), mostY = Math.max(2, Math.floor(ph / 34));
  const ay = useMemo(() => {
    const [lo, hi] = extent(...series.flatMap((s) => [s.ys, s.lo, s.hi]), lines ? lines.map((l) => l.y) : undefined);
    return niceAxis(lo, hi, mostY, { pad: 0.04 });
  }, [series, mostY, lines]);
  const xt = useMemo(() => ticks(ax, mostX), [ax, mostX]);
  const yt = useMemo(() => ticks(ay, mostY), [ay, mostY]);
  const paths = useMemo(() => series.map((s) => ({
    line: linePath(xs, s.ys, ax, ay),
    band: s.lo && s.hi ? bandPath(xs, s.lo, s.hi, ax, ay) : '',
  })), [series, xs, ax, ay]);
  const px = (v: number) => ML + frac(v, ax) * pw;
  const py = (v: number) => MT + (1 - frac(v, ay)) * ph;
  const inside = (v: number) => Number.isFinite(v) && v >= ax.min && v <= ax.max;

  const fromPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left - ML) / pw));
    onCursor(valueAt(f, ax));
  };
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let x = NaN;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') x = stepCursor(xs, cursor, e.shiftKey ? 10 : 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') x = stepCursor(xs, cursor, e.shiftKey ? -10 : -1);
    else if (e.key === 'Home') x = xs[0];
    else if (e.key === 'End') x = xs[xs.length - 1];
    else return;
    e.preventDefault();
    if (Number.isFinite(x)) onCursor(x);
  };
  const text = readout(cursor);
  const values = series.map((s) => readAt(xs, s.ys, cursor));
  const tf = `translate(${ML} ${MT}) scale(${pw / PLOT_U} ${ph / PLOT_U})`;
  return (
    <figure className={css.plot} data-plot={name} data-stale={stale ? 'true' : undefined}>
      <figcaption className={css.plotTitle}>
        {title}
        {series.length > 1 && (
          <span className={css.legend}>
            {series.map((s, i) => <span key={s.name} className={css.legendItem}><i style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }} />{s.name}</span>)}
          </span>
        )}
      </figcaption>
      <div
        ref={box}
        className={css.plotBox}
        tabIndex={0}
        role="slider"
        aria-label={t('em.plot.cursorAria', { title })}
        aria-valuemin={xs[0]}
        aria-valuemax={xs[xs.length - 1]}
        aria-valuenow={Number.isFinite(cursor) ? cursor : undefined}
        aria-valuetext={text}
        onKeyDown={onKey}
        data-plot-box
      >
        {w > 0 && (
          <svg width={w} height={H} className={css.plotSvg} onPointerMove={fromPointer} onPointerDown={fromPointer} aria-hidden="true">
            <defs><clipPath id={`clip-${name}`}><rect x={ML} y={MT} width={pw} height={ph} /></clipPath></defs>
            {yt.map((v) => (
              <g key={`y${v}`}>
                <line x1={ML} x2={ML + pw} y1={py(v)} y2={py(v)} className={css.grid} />
                <text x={ML - 5} y={py(v)} className={css.tickY}>{tickText(v, yt)}</text>
              </g>
            ))}
            {xt.map((v) => (
              <g key={`x${v}`}>
                <line x1={px(v)} x2={px(v)} y1={MT} y2={MT + ph} className={css.grid} />
                <text x={px(v)} y={MT + ph + 15} className={css.tickX}>{tickText(v, xt, false, xScale ? xScale.k : 1)}</text>
              </g>
            ))}
            <rect x={ML} y={MT} width={pw} height={ph} className={css.frame} />
            <g clipPath={`url(#clip-${name})`}>
              {lines && lines.map((l) => (
                <g key={l.name} data-ref-line={l.name} data-y={l.y}>
                  <line x1={ML} x2={ML + pw} y1={py(l.y)} y2={py(l.y)} className={css.refLine} />
                  <text x={ML + pw - 4} y={py(l.y) - 3} className={css.refText}>{l.name}</text>
                </g>
              ))}
              <g transform={tf}>
                {paths.map((p, i) => p.band && <path key={`b${i}`} d={p.band} className={css.band} style={{ fill: SERIES_COLOURS[i % SERIES_COLOURS.length] }} data-band={i} />)}
                {paths.map((p, i) => <path key={`l${i}`} d={p.line} className={css.line} style={{ stroke: SERIES_COLOURS[i % SERIES_COLOURS.length] }} data-series={i} />)}
              </g>
              {fadeFrom !== undefined && fadeFrom < ax.max && (
                <rect x={px(Math.max(ax.min, fadeFrom))} y={MT} width={ML + pw - px(Math.max(ax.min, fadeFrom))} height={ph} className={css.fade} data-fade={fadeFrom} />
              )}
              {marker !== undefined && inside(marker) && <line x1={px(marker)} x2={px(marker)} y1={MT} y2={MT + ph} className={css.marker} data-marker />}
              {inside(cursor) && (
                <g data-cursor={cursor}>
                  <line x1={px(cursor)} x2={px(cursor)} y1={MT} y2={MT + ph} className={css.cursor} />
                  {series.map((s, i) => {
                    const v = readAt(xs, s.ys, cursor);
                    return Number.isFinite(v) ? <circle key={i} cx={px(cursor)} cy={py(v)} r={3.5} className={css.dot} style={{ fill: SERIES_COLOURS[i % SERIES_COLOURS.length] }} /> : null;
                  })}
                </g>
              )}
            </g>
          </svg>
        )}
      </div>
      <p className={css.xLabel}>{xLabel}</p>
      <p className={css.readout} data-plot-readout data-cursor={cursor} data-values={values.join(' ')}>{text}</p>
      <Calm text={text} name="plot" />
    </figure>
  );
}

export default React.memo(Plot);
