// The frequency sweep's controls (step M7.2a): on or off, the band (start, stop, points, linear or logarithmic) and the
// markers as a list with Remove; the trace and the markers on the chart are traceLayer.ts's. Neither is part of the
// circuit or the undo history; both are in the link (state.ts sw, mk).

import React, { memo, useRef } from 'react';

import { formatAmount, readAmount } from '../../lib/quantity';
import { MAX_MARKERS, SWEEP_MAX_POINTS, bandIssue } from '../../lib/smith/state';
import type { SweepSetting } from '../../lib/smith/state';
import { defaultBand } from '../../lib/smith/sweep';
import type { Band } from '../../lib/smith/sweep';
import styles from '../../styles/Smith.module.css';
import css from '../../styles/SmithSweep.module.css';
import { Field } from './Strip';
import { Why } from './Why';

export interface SweepPanelProps {
  sweep: SweepSetting | null;
  f0: number;
  onChange: (next: SweepSetting | null) => void;
  /** Drops typed texts (undo, redo, a new link). */
  revision?: number;
}

const DIGITS = 6;
const hz = (f: number): string => formatAmount(f, 'Hz', 4);

/** A new band with the markers that are still inside it. */
const withBand = (s: SweepSetting, band: Band): SweepSetting => ({ band, markers: s.markers.filter((f) => f >= band.start && f <= band.stop) });

/** Where "Add marker" puts one: f0 when it is in the band and free, else the middle of the widest gap. */
export function newMarker(s: SweepSetting, f0: number): number {
  const { start, stop, log } = s.band;
  if (f0 >= start && f0 <= stop && !s.markers.includes(f0)) return f0;
  const at = [start, ...s.markers.filter((f) => f > start && f < stop).sort((a, b) => a - b), stop];
  let best = 0, bi = 0;
  for (let i = 0; i + 1 < at.length; i++) {
    const w = log ? Math.log(at[i + 1] / at[i]) : at[i + 1] - at[i];
    if (w > best) { best = w; bi = i; }
  }
  return log ? Math.sqrt(at[bi] * at[bi + 1]) : 0.5 * (at[bi] + at[bi + 1]);
}

function SweepPanel({ sweep, f0, onChange, revision }: SweepPanelProps) {
  // The band before the sweep was turned off comes back with it.
  const last = useRef<Band | null>(null);
  if (sweep) last.current = sweep.band;
  const on = sweep !== null;
  const band = sweep?.band;

  const freqField = (name: 'start' | 'stop', label: string) => (
    <Field name={`sweep-${name}`} label={label} revision={revision} why="sweep-band" shown={formatAmount(band![name], 'Hz', DIGITS)}
      edit={(t) => {
        const v = readAmount(t, 'Hz');
        if (v === null) return t.trim() ? `cannot read “${t.trim()}” as hertz` : 'empty';
        const next = { ...band!, [name]: v };
        const why = bandIssue(next);
        if (!why) onChange(withBand(sweep!, next));
        return why;
      }} />
  );

  return (
    <section className={styles.panel} aria-labelledby="smith-sweep" data-sweep="">
      <h2 className={styles.panelTitle} id="smith-sweep">
        <span className={css.head}>Sweep <Why k="sweep" /></span>
        <span className={styles.panelNote}>Γ(f) at the input</span>
      </h2>
      <div className={css.row}>
        <label className={css.check}>
          <input type="checkbox" data-sweep-on="" checked={on}
            onChange={(e) => onChange(e.target.checked ? { band: last.current ?? defaultBand(f0), markers: [] } : null)} />
          Show the trace on the chart
        </label>
        <Why k="sweep-trace" />
      </div>
      {sweep && band && (
        <>
          <div className={styles.params}>
            {freqField('start', 'Start')}
            {freqField('stop', 'Stop')}
            <Field name="sweep-points" label="Points" revision={revision} why="sweep-points" shown={String(band.points)}
              edit={(t) => {
                const v = Number(t.trim().replace(/[ ,_]/g, ''));
                const next = { ...band, points: v };
                const why = t.trim() === '' ? 'empty' : Number.isFinite(v) ? bandIssue(next) : `cannot read “${t.trim()}” as a whole number`;
                if (!why) onChange(withBand(sweep, next));
                return why;
              }} />
            <div className={styles.field}>
              <span className={css.label} id="smith-sweep-spacing">Spacing <Why k="sweep-log" /></span>
              <div className={css.pair} role="group" aria-labelledby="smith-sweep-spacing">
                {[false, true].map((log) => (
                  <button key={String(log)} type="button" className={`${styles.button} ${styles.toggle} ${css.btn}`} aria-pressed={band.log === log}
                    data-sweep-log={log ? 'log' : 'lin'} title={log ? 'Even steps in log f' : 'Even steps in f'}
                    onClick={() => {
                      if (band.log === log) return;
                      const next = { ...band, log };
                      // A logarithmic band cannot start at 0 Hz: it starts a decade per 1,000 points below the stop.
                      if (log && next.start === 0) next.start = next.stop / 1000;
                      if (!bandIssue(next)) onChange(withBand(sweep, next));
                    }}>
                    {log ? 'Log' : 'Linear'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={css.row}>
            <button type="button" className={`${styles.button} ${css.btn}`} data-sweep-f0=""
              onClick={() => onChange(withBand(sweep, defaultBand(f0, 0.5, band.points)))}>
              ±50 % around f0
            </button>
            <button type="button" className={`${styles.button} ${css.btn}`} data-sweep-add="" disabled={sweep.markers.length >= MAX_MARKERS}
              onClick={() => onChange({ band, markers: [...sweep.markers, newMarker(sweep, f0)] })}>
              Add marker
            </button>
            <Why k="sweep-marker" />
          </div>
          <p className={css.hint}>
            {sweep.markers.length < MAX_MARKERS
              ? 'Tap or click the trace to add a marker; drag one along the trace, or focus it and use the arrow keys.'
              : `${MAX_MARKERS} markers at most: remove one to add another.`}
          </p>
          {sweep.markers.length > 0 && (
            <ol className={css.markers} data-sweep-markers="" aria-label="Markers">
              {sweep.markers.map((f, i) => (
                <li key={i} className={css.marker} data-sweep-chip={i}>
                  <span className={css.markerName}>M{i + 1}</span>
                  <span className={css.markerF} data-raw={String(f)}>{hz(f)}</span>
                  <button type="button" className={`${styles.button} ${css.remove}`} data-sweep-remove={i}
                    aria-label={`Remove marker ${i + 1} at ${hz(f)}`}
                    onClick={() => onChange({ band, markers: sweep.markers.filter((_, j) => j !== i) })}>
                    ×
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className={css.hint}>Up to {SWEEP_MAX_POINTS.toLocaleString('en-US')} points; the trace adds points where it bends.</p>
        </>
      )}
    </section>
  );
}

export default memo(SweepPanel);
