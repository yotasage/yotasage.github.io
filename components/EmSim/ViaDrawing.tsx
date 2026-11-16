// The Via section's two drawings to scale (step M3.1a): the side view (the stackup cut along the section line, with
// copper, laminate and mask, the barrel, pads, the antipads cut into the planes, the stub or backdrill, the feeds and
// the return vias behind the cut) and the top view (pads, antipad shapes, the pair's pitch, return vias numbered as
// their rows, the feeds' directions and the section line). Geometry from viaGeom.ts in mm; here only the mapping to
// px (one scale per view, the same in x and y) and the SVG. No handles yet (M3.1b).

import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { Stackup } from '../../lib/emsim/stackup';
import type { ViaStructure } from '../../lib/emsim/via';
import type { LengthUnit } from '../../lib/emsim/units';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import { lenText } from './format';
import { niceStep } from './traceGeom';
import { fitK, sideGeom, topGeom } from './viaGeom';
import type { Box } from './viaGeom';
import { Why } from './Why';

const LABEL_W = 58; // px for the side view's layer labels
const PAD = 8;
const LABEL_GAP = 12;

function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.floor(el.clientWidth));
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Scale({ k, unit, digits }: { k: number; unit: LengthUnit; digits: number }) {
  const mm = niceStep(56 / k, unit);
  return <span className={css.scale} data-via-scale={mm}><span className={css.scaleBar} style={{ width: `${Math.round(mm * k)}px` }} />{lenText(mm, unit, Math.min(digits, 3))}</span>;
}

// Labels pushed apart to at least LABEL_GAP px, in order.
function spread(want: number[], lo: number, hi: number): number[] {
  const y = want.slice();
  for (let i = 1; i < y.length; i++) y[i] = Math.max(y[i], y[i - 1] + LABEL_GAP);
  if (y.length && y[y.length - 1] > hi) {
    y[y.length - 1] = hi;
    for (let i = y.length - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] - LABEL_GAP);
  }
  return y.map((v) => Math.max(lo, v));
}

const layerFill = (kind: string, role: string) => (kind === 'mask' ? 'var(--mask)' : role === 'core' ? 'var(--core)' : 'var(--prepreg)');

function SideView({ s, v, traceW, W, unit, digits }: { s: Stackup; v: ViaStructure; traceW: number; W: number; unit: LengthUnit; digits: number }) {
  const g = useMemo(() => sideGeom(s, v, traceW), [s, v, traceW]);
  if (!g.ok) return <p className={css.noDrawing}>The via cannot be drawn: its barrel or drill is not set.</p>;
  const k = fitK(g.box, W - LABEL_W, 420, PAD);
  const bw = (g.box.x1 - g.box.x0) * k;
  const H = Math.ceil((g.box.y1 - g.box.y0) * k + 2 * PAD);
  const X = (x: number) => PAD + (x - g.box.x0) * k;
  const Y = (y: number) => PAD + (y - g.box.y0) * k;
  const rect = (b: Box, key: string, fill: string, extra: React.SVGProps<SVGRectElement> = {}) => (
    <rect key={key} x={X(b.x0)} y={Y(b.y0)} width={Math.max(0, (b.x1 - b.x0) * k)} height={Math.max(0.6, (b.y1 - b.y0) * k)} fill={fill} {...extra} />
  );
  const cu = g.layers.filter((l) => l.kind === 'copper');
  const ly = spread(cu.map((l) => Y(0.5 * (l.y0 + l.y1)) + 4), 11, H - 2);
  const right = PAD + bw;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Side view of the via, cut along the section line, ${(k / 1).toFixed(0)} px per mm`} data-via-side data-px-per-mm={k.toFixed(3)}>
      <rect x={PAD} y={PAD} width={bw} height={H - 2 * PAD} fill="var(--air)" />
      {g.layers.map((l) => rect({ x0: g.box.x0, x1: g.box.x1, y0: l.y0, y1: l.y1 }, `l${l.i}`, layerFill(l.kind, l.role)))}
      {g.returns.map((r) => rect({ x0: r.s - r.d / 2, x1: r.s + r.d / 2, y0: r.y0, y1: r.y1 }, `r${r.k}`, 'var(--copper)', { opacity: r.inCut ? 1 : 0.38, 'data-via-side-return': r.k + 1 } as React.SVGProps<SVGRectElement>))}
      {g.copper.map((c, i) => rect(c, `c${i}`, 'var(--copper)', c.what === 'return-pad' ? { opacity: 0.38 } : c.what === 'feed' ? { 'data-via-side-feed': c.layer } as React.SVGProps<SVGRectElement> : {}))}
      {g.drilled.map((d, i) => rect(d, `d${i}`, 'var(--air)', { stroke: 'var(--ink-3)', strokeDasharray: '3 2', strokeWidth: 1, 'data-via-backdrill': true } as React.SVGProps<SVGRectElement>))}
      {g.barrels.map((b, i) => (
        <g key={`b${i}`} opacity={b.inCut ? 1 : 0.4} data-via-barrel={b.name || 'A'}>
          {rect({ x0: b.s - b.d / 2, x1: b.s + b.d / 2, y0: b.y0, y1: b.y1 }, 'h', 'var(--air)')}
          {rect({ x0: b.s - b.d / 2, x1: b.s - b.d / 2 + b.wall, y0: b.y0, y1: b.y1 }, 'w1', 'var(--copper)')}
          {rect({ x0: b.s + b.d / 2 - b.wall, x1: b.s + b.d / 2, y0: b.y0, y1: b.y1 }, 'w2', 'var(--copper)')}
          {rect({ x0: b.s - b.d / 2, x1: b.s + b.d / 2, y0: b.y0, y1: b.y1 }, 'o', 'none', { stroke: 'var(--copper-edge)', strokeWidth: 0.75 })}
        </g>
      ))}
      {g.stubs.map((t, i) => (
        <line key={`s${i}`} x1={X(t.s)} x2={X(t.s)} y1={Y(t.y0)} y2={Y(t.y1)} stroke="var(--warn)" strokeWidth={3} strokeLinecap="round" data-via-stub={t.side} />
      ))}
      <g className={css.svgLabels}>
        {cu.map((l, i) => (
          <React.Fragment key={l.id}>
            <line x1={right} x2={right + 8} y1={Y(0.5 * (l.y0 + l.y1))} y2={ly[i] - 4} stroke="var(--ink-4)" strokeWidth={1} />
            <text x={right + 10} y={ly[i]} data-via-label={l.id}>{l.name}{l.signal === 'entry' ? ' in' : l.signal === 'exit' ? ' out' : l.plane ? ' ⏚' : ''}</text>
          </React.Fragment>
        ))}
        {g.barrels.length > 1 && g.barrels.map((b) => <text key={b.name} x={X(b.s)} y={PAD + 10} textAnchor="middle" className={css.sigNum}>{b.name}</text>)}
      </g>
    </svg>
  );
}

function TopView({ s, v, traceW, W }: { s: Stackup; v: ViaStructure; traceW: number; W: number }) {
  const g = useMemo(() => topGeom(s, v, traceW), [s, v, traceW]);
  const side = Math.min(W, 380);
  const k = fitK(g.box, side, side, PAD);
  const w = Math.ceil((g.box.x1 - g.box.x0) * k + 2 * PAD), H = Math.ceil((g.box.y1 - g.box.y0) * k + 2 * PAD);
  const tf = `translate(${PAD - g.box.x0 * k} ${PAD - g.box.y0 * k}) scale(${k})`;
  const X = (x: number) => PAD + (x - g.box.x0) * k;
  const Y = (y: number) => PAD + (y - g.box.y0) * k;
  const hair = { vectorEffect: 'non-scaling-stroke' as const };
  return (
    <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`Top view of the via, ${k.toFixed(0)} px per mm`} data-via-top data-px-per-mm={k.toFixed(3)} data-returns={g.returns.length}>
      <rect x={PAD} y={PAD} width={w - 2 * PAD} height={H - 2 * PAD} fill="var(--core)" />
      <g transform={tf}>
        <rect x={g.box.x0} y={g.box.y0} width={g.box.x1 - g.box.x0} height={g.box.y1 - g.box.y0} fill="var(--copper)" opacity={g.antipads.length ? 0.42 : 0} />
        {g.antipads.map((a) => <path key={a.layer} d={a.d} fill="var(--core)" data-via-antipad={a.layer} />)}
        {g.antipads.map((a) => <path key={`o${a.layer}`} d={a.d} fill="none" stroke="var(--copper-edge)" strokeWidth={1} strokeDasharray="4 3" {...hair} />)}
        <line x1={g.cut.x0} y1={g.cut.y0} x2={g.cut.x1} y2={g.cut.y1} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="6 4" {...hair} data-via-cut />
        {g.feeds.map((f, i) => (
          <line key={`f${i}`} x1={f.x0} y1={f.y0} x2={f.x1} y2={f.y1} stroke="var(--copper)" strokeWidth={f.w} strokeLinecap="butt" opacity={f.side === 'entry' ? 1 : 0.6} data-via-feed={f.side} />
        ))}
        {g.barrels.map((b) => (
          <g key={b.name || 'A'}>
            <circle cx={b.x} cy={b.y} r={b.pad / 2} fill="var(--copper)" stroke="var(--copper-edge)" strokeWidth={1} {...hair} data-via-pad={b.name || 'A'} />
            <circle cx={b.x} cy={b.y} r={b.drill / 2} fill="var(--air)" stroke="var(--copper-edge)" strokeWidth={1} {...hair} />
          </g>
        ))}
        {g.returns.map((r) => (
          <g key={`r${r.k}`} data-via-return={r.k + 1}>
            <circle cx={r.x} cy={r.y} r={r.pad / 2} fill="var(--copper)" stroke="var(--copper-edge)" strokeWidth={1} {...hair} />
            <circle cx={r.x} cy={r.y} r={r.drill / 2} fill="var(--ink-3)" />
          </g>
        ))}
      </g>
      <g className={css.svgLabels}>
        {g.returns.map((r) => <text key={r.k} x={X(r.x) + (r.pad / 2) * k + 2} y={Y(r.y) - (r.pad / 2) * k + 2} fontSize={10}>{r.k + 1}</text>)}
        {g.barrels.length > 1 && g.barrels.map((b) => <text key={b.name} x={X(b.x) - (b.pad / 2) * k - 4} y={Y(b.y) + 4} textAnchor="end" className={css.sigNum}>{b.name}</text>)}
        {g.feeds.filter((f, i) => g.feeds.findIndex((h) => h.side === f.side) === i).map((f) => (
          <text key={f.side} x={X(f.x1)} y={Y(f.y1) + (f.y1 > f.y0 ? -4 : 12)} textAnchor={f.x1 > f.x0 + 1e-6 ? 'end' : f.x1 < f.x0 - 1e-6 ? 'start' : 'middle'} fontSize={10}>{f.side === 'entry' ? `in ${f.layer}` : `out ${f.layer}`}</text>
        ))}
      </g>
    </svg>
  );
}

export default React.memo(function ViaDrawing({ s, v, traceW, unit, digits }: { s: Stackup; v: ViaStructure; traceW: number; unit: LengthUnit; digits: number }) {
  const [ref, W] = useWidth();
  const sideK = useMemo(() => { const g = sideGeom(s, v, traceW); return g.ok && W ? fitK(g.box, W - LABEL_W, 420, PAD) : 0; }, [s, v, traceW, W]);
  const topK = useMemo(() => { const g = topGeom(s, v, traceW); return W ? fitK(g.box, Math.min(W, 380), Math.min(W, 380), PAD) : 0; }, [s, v, traceW, W]);
  return (
    <div className={vcss.views} ref={ref}>
      <figure className={css.figure}>
        <div className={vcss.view}>{W > 0 && <SideView s={s} v={v} traceW={traceW} W={W} unit={unit} digits={digits} />}</div>
        <figcaption className={css.caption}>
          Side view, cut along the dashed line of the top view; return vias behind the cut are pale. {sideK > 0 && <Scale k={sideK} unit={unit} digits={digits} />}
        </figcaption>
        <Why k="via-side" bare />
      </figure>
      <figure className={css.figure}>
        <div className={vcss.view}>{W > 0 && <TopView s={s} v={v} traceW={traceW} W={W} />}</div>
        <figcaption className={css.caption}>
          Top view: pads, antipads (dashed) in the planes, return vias numbered as in the list, feeds (pale: the exit side). {topK > 0 && <Scale k={topK} unit={unit} digits={digits} />}
        </figcaption>
        <Why k="via-top" bare />
      </figure>
    </div>
  );
});
