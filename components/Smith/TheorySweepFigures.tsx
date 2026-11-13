// The figures of the sweep's theory topics (step M7.4b; docs/smith-chart/theory-sweep.md §12–13): mini charts with
// frequency traces and small return-loss plots, in the units and tokens of TheoryFigures.tsx so both themes follow.
// The traces are the example circuits of notes-M7.4a.md swept by lib/smith/sweep.ts (runSweep, refined); they are
// worked out once, when a figure first comes near the view (an open topic scrolled to) and the browser is idle (about
// 2 ms in all), so neither the static page, its hydration, a folded topic nor a drag pays for them.

import React, { useEffect, useRef, useState } from 'react';

import { magFromReturnLoss, returnLoss } from '../../lib/smith/convert';
import type { Circuit } from '../../lib/smith/network';
import { LINE, SERIES_C, SERIES_L, SHUNT_L, STUB_OPEN } from '../../lib/smith/parts';
import { Band, Trace, bandFigures, markerAt, runSweep, sweepCircuit } from '../../lib/smith/sweep';
import { defaultCircuit } from '../../lib/smith/state';
import css from '../../styles/SmithTheory.module.css';
import { Disc, Dot, Figure, Label, P, Ring, f, head } from './TheoryFigures';

const F0 = 1e8, W0 = 2 * Math.PI * F0;
const circuit = (loadR: number, loadX: number, parts: Circuit['parts']): Circuit => ({ z0: 50, f0: F0, loadR, loadX, parts });
const rlc = (x: number): Circuit => circuit(50, 0, [{ kind: SERIES_L, value: (x * 50) / W0 }, { kind: SERIES_C, value: 1 / (W0 * x * 50) }]);
const lSection = (lo: number, hi: number): Circuit['parts'] => {
  const q = Math.sqrt(hi / lo - 1);
  return [{ kind: SERIES_C, value: 1 / (W0 * q * lo) }, { kind: SHUNT_L, value: hi / (W0 * q) }];
};
const MID = Math.sqrt(500);
const STUB: Circuit['parts'][number] = { kind: STUB_OPEN, value: 0.125, zc: 50 };
const EX = {
  rlc2: rlc(2),
  rlc5: rlc(5),
  stub: circuit(25, 25, [STUB]),
  half: circuit(25, 25, [{ kind: LINE, value: 0.5, zc: 50 }, STUB]),
  start: defaultCircuit(),
  two: circuit(10, 0, [...lSection(10, MID), ...lSection(MID, 50)]),
};
const LOG: Band = { start: 1e7, stop: 1e9, points: 401, log: true };
const DEF: Band = { start: 5e7, stop: 1.5e8, points: 401, log: false };
const R10 = magFromReturnLoss(10), R20 = magFromReturnLoss(20);

/** A swept example: the trace's path in chart units, Γ at chosen frequencies, the plot's points and the band edges. */
interface Swept {
  d: string;
  at: (fq: number) => P;
  /** Return loss (dB) per trace point and the frequencies. */
  freqs: Float64Array;
  rl: Float64Array;
  edges: { lo: number; hi: number }[];
  /** A point at 65 MHz and the trace’s direction there (for the arrow of rising f). */
  arrow: { p: P; d: P };
}

function sweep(c: Circuit, band: Band, limit: number): Swept {
  const sc = sweepCircuit(c), tr = new Trace(1024);
  runSweep(tr, band, sc);
  const n = tr.n, g = tr.gamma;
  let d = '';
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${f(g[2 * i])} ${f(-g[2 * i + 1])}`;
  const rl = new Float64Array(n);
  for (let i = 0; i < n; i++) rl[i] = returnLoss(Math.hypot(g[2 * i], g[2 * i + 1]));
  const fig = bandFigures(tr, sc, limit);
  const at = (fq: number): P => { const m = markerAt(sc, fq); return [m.gr, m.gi]; };
  const a = at(F0 * 0.645), b = at(F0 * 0.65), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { d, at, freqs: tr.freqs.slice(0, n), rl, edges: fig.intervals, arrow: { p: b, d: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] } };
}

interface All { rlc2: Swept; rlc5: Swept; stub: Swept; half: Swept; start: Swept; two: Swept }
let cache: All | null = null;
const compute = (): All => (cache ??= {
  rlc2: sweep(EX.rlc2, LOG, R10), rlc5: sweep(EX.rlc5, LOG, R10), stub: sweep(EX.stub, DEF, R10), half: sweep(EX.half, DEF, R10),
  start: sweep(EX.start, DEF, R10), two: sweep(EX.two, DEF, R20),
});

/** The traces (null before): swept when the figure comes near the view (an open topic scrolled to), in an idle moment. */
function useSwept(box: React.RefObject<HTMLDivElement | null>): All | null {
  const [all, setAll] = useState<All | null>(cache);
  useEffect(() => {
    const el = box.current;
    if (all || !el) return undefined;
    const w = window as Window & { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    let idle = 0, timer = 0;
    const run = () => setAll(compute());
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      if (w.requestIdleCallback) idle = w.requestIdleCallback(run, { timeout: 500 });
      else timer = window.setTimeout(run, 50);
    }, { rootMargin: '400px 0px' });
    io.observe(el);
    return () => { io.disconnect(); if (idle) w.cancelIdleCallback?.(idle); window.clearTimeout(timer); };
  }, [all, box]);
  return all;
}

const Trace1 = ({ s, cls }: { s: Swept | undefined; cls: string }) => (s ? <g className={cls}><path d={s.d} className={css.figThin} /></g> : null);
const Ticks = ({ s, cls, at }: { s: Swept | undefined; cls: string; at: number[] }) => (s ? <>{at.map((fq) => <Dot key={fq} p={s.at(fq)} cls={cls} r={0.035} />)}</> : null);
const Limit = ({ mag }: { mag: number }) => <g className={css.figAccent}><Ring c={[0, 0]} R={mag} cls={css.figDash} /></g>;
const Arrow = ({ s, cls }: { s: Swept | undefined; cls: string }) => (s ? <g className={cls}><polygon points={head(s.arrow.p, s.arrow.d, 0.09)} className={css.figHead} /></g> : null);

// ------------------------------------------------------------------------------------------------------------------
// Topic 11: series resonators on r = 1; the start load with the λ/8 stub alone and behind λ/2 of line.

export function QBandFigure() {
  const box = useRef<HTMLDivElement>(null);
  const s = useSwept(box);
  return (
    <div ref={box}>
    <Figure wide caption={<>Ticks at 90 and 110 MHz; dashed, 10 dB of return loss. Left, series resonators on 50 Ω along r = 1: <span className={css.key1}>x = ±2</span> and <span className={css.key2}>x = ±5</span>, whose ticks lie further out (10 MHz to 1 GHz). Right, the start load with <span className={css.key1}>the λ/8 open stub alone</span> and <span className={css.key2}>behind λ/2 of line</span>: longer, its ticks outside the circle (50 to 150 MHz).</>}>
      <Disc label="Traces of two series resonators on the r = 1 circle, with ticks at 90 and 110 MHz" clip>
        <Ring c={[0.5, 0]} R={0.5} cls={css.figZ} />
        <Limit mag={R10} />
        <g className={css.figPart2}>{s && <path d={s.rlc5.d} className={css.figStroke} />}</g>
        <Trace1 s={s?.rlc2} cls={css.figPart1} />
        <Ticks s={s?.rlc2} cls={css.figPart1} at={[9e7, 1.1e8]} />
        <Ticks s={s?.rlc5} cls={css.figPart2} at={[9e7, 1.1e8]} />
        <Label p={[0.5, 0.58]}>r = 1</Label>
      </Disc>
      <Disc label="The start load matched by a λ/8 open stub, alone and behind λ/2 of line, with ticks at 90 and 110 MHz" clip>
        <Ring c={[-0.5, 0]} R={0.5} cls={css.figY} />
        <Limit mag={R10} />
        <Trace1 s={s?.half} cls={css.figPart2} />
        <Trace1 s={s?.stub} cls={css.figPart1} />
        <Ticks s={s?.half} cls={css.figPart2} at={[9e7, 1.1e8]} />
        <Ticks s={s?.stub} cls={css.figPart1} at={[9e7, 1.1e8]} />
        <Dot p={[-0.2, 0.4]} cls={css.figLoad} r={0.045} />
        <Label p={[-0.3, 0.52]} cls={css.figBold}>L</Label>
      </Disc>
    </Figure>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Topic 12: a trace and its return-loss plot, linked by the frequencies marked on both.

/** The plot's frame in chart-like units (so the figures' stroke widths and text sizes apply): x 0…W, return loss 0…top dB down. */
const PW = 2.4, PH = 1.5, PX = 0.4, PY = 0.08, PB = 0.22;
function Plot({ s, band, top, limit, marks, cls, label }: { s: Swept | undefined; band: Band; top: number; limit: number; marks: number[]; cls: string; label: string }) {
  const w = PW - PX - 0.06, h = PH - PY - PB;
  const x = (fq: number) => PX + ((fq - band.start) / (band.stop - band.start)) * w;
  const y = (rl: number) => PY + (Math.min(rl, top) / top) * h;
  let d = '';
  if (s) for (let i = 0; i < s.freqs.length; i++) d += `${i ? 'L' : 'M'}${f(x(s.freqs[i]))} ${f(y(s.rl[i]))}`;
  const rlAt = (fq: number) => (s ? returnLoss(Math.hypot(...s.at(fq))) : 0);
  const ticks = [0, top / 2, top];
  return (
    <svg viewBox={`0 0 ${PW} ${PH}`} className={css.disc} role="img" aria-label={label}>
      <rect x={PX} y={PY} width={w} height={h} className={css.figBack} />
      {s?.edges.map((e, i) => <rect key={i} x={f(x(e.lo))} y={PY} width={f(x(e.hi) - x(e.lo))} height={h} className={css.figShade} />)}
      {ticks.map((t) => (
        <React.Fragment key={t}>
          <line x1={PX} x2={PX + w} y1={f(y(t))} y2={f(y(t))} className={css.figAxis} />
          <text x={PX - 0.04} y={f(y(t))} textAnchor="end" dominantBaseline="middle">{t === top ? `${t} dB` : t}</text>
        </React.Fragment>
      ))}
      <g className={css.figAccent}><line x1={PX} x2={PX + w} y1={f(y(limit))} y2={f(y(limit))} className={css.figDash} /></g>
      <g className={cls}><path d={d} className={css.figThin} /></g>
      {marks.map((m) => <Dot key={m} p={[x(m), -y(rlAt(m))]} cls={css.figLoad} r={0.035} />)}
      <text x={PX} y={PH - 0.05}>{band.start / 1e6}</text>
      <text x={PX + w / 2} y={PH - 0.05} textAnchor="middle">return loss</text>
      <text x={PX + w} y={PH - 0.05} textAnchor="end">{band.stop / 1e6} MHz</text>
    </svg>
  );
}

export function ReadTraceFigure() {
  const box = useRef<HTMLDivElement>(null);
  const s = useSwept(box);
  const st = s?.start, two = s?.two;
  const START_MARKS = [5e7, 79_495_746, 1e8, 1.5e8];
  return (
    <div ref={box}>
      <Figure wide stack caption={<>(a) <span className={css.key1}>The start circuit</span> from 50 to 150 MHz, the arrow for rising f, dots at 50, 79.50 (where it enters the dashed 10 dB circle), 100 and 150 MHz; beside it the same band as return loss, the matched stretch shaded.</>}>
        <Disc label="The start circuit's trace from 50 to 150 MHz with the 10 dB circle" clip
          outside={st && <><Label p={[st.at(5e7)[0] + 0.08, st.at(5e7)[1]]} anchor="start">50</Label><Label p={[st.at(1.5e8)[0] - 0.08, st.at(1.5e8)[1] - 0.1]} anchor="end">150</Label></>}>
          <Limit mag={R10} />
          <Trace1 s={st} cls={css.figPart1} />
          <Arrow s={st} cls={css.figPart1} />
          {st && START_MARKS.map((fq) => <Dot key={fq} p={st.at(fq)} cls={css.figLoad} r={0.035} />)}
        </Disc>
        <Plot s={st} band={DEF} top={30} limit={10} marks={START_MARKS} cls={css.figPart1} label="Return loss of the start circuit from 50 to 150 MHz with the 10 dB line" />
      </Figure>
      <Figure wide stack caption={<>(b) <span className={css.key2}>The two-section match of 10 Ω</span>: its trace loops through the centre at 61.80 and 100 MHz, and its plot dips twice; dashed, 20 dB.</>}>
        <Disc label="The two-section match's trace with its loop through the centre and the 20 dB circle" clip>
          <Limit mag={R20} />
          <Trace1 s={two} cls={css.figPart2} />
          <Arrow s={two} cls={css.figPart2} />
          <Dot p={[0, 0]} cls={css.figLoad} r={0.03} />
        </Disc>
        <Plot s={two} band={DEF} top={40} limit={20} marks={[61_803_399, 1e8]} cls={css.figPart2} label="Return loss of the two-section match from 50 to 150 MHz with the 20 dB line" />
      </Figure>
    </div>
  );
}
