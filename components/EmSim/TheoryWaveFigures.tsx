// The full-wave topic's static figures (step M7.2d, theory-waves.md §14 "Figures"): one Yee cell with E on its edges and
// η₀·H on its faces, the leapfrog of E and H in time, and a round barrel on the grid staircased beside conformal. Plain
// SVG on the theme's tokens (both themes), scaled to the column (phone width). The run's own pictures are the live
// player's in the Waves section, which the topic links to.

import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import css from '../../styles/EmSimTheory.module.css';

/** An arrow from (x1, y1) to (x2, y2) with a filled head, in the class's colour. */
function Arrow({ x1, y1, x2, y2, cls, head = 7 }: { x1: number; y1: number; x2: number; y2: number; cls: string; head?: number }) {
  const a = Math.atan2(y2 - y1, x2 - x1), w = head * 0.55;
  const bx = x2 - head * Math.cos(a), by = y2 - head * Math.sin(a);
  const px = -Math.sin(a) * w, py = Math.cos(a) * w;
  return (
    <g className={cls}>
      <path d={`M${x1.toFixed(1)} ${y1.toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)}`} />
      <path className={css.fwHead} d={`M${x2.toFixed(1)} ${y2.toFixed(1)} L${(bx + px).toFixed(1)} ${(by + py).toFixed(1)} L${(bx - px).toFixed(1)} ${(by - py).toFixed(1)} Z`} />
    </g>
  );
}

/** Figure 1: one cell of Yee's grid, E along three edges and η₀·H normal to three faces, half a cell apart. */
export function YeeCellFigure() {
  const { t } = useI18n();
  const s = 140, ox = 150, oy = 228;
  // an oblique view: x to the right, y into the page (up and right), z up
  const P = (x: number, y: number, z: number): [number, number] => [ox + s * (x + 0.55 * y), oy - s * (z + 0.38 * y)];
  const seg = (a: [number, number, number], b: [number, number, number]) => { const p = P(...a), q = P(...b); return `M${p[0].toFixed(1)} ${p[1].toFixed(1)} L${q[0].toFixed(1)} ${q[1].toFixed(1)}`; };
  const front = [seg([0, 0, 0], [1, 0, 0]), seg([1, 0, 0], [1, 0, 1]), seg([1, 0, 1], [0, 0, 1]), seg([0, 0, 1], [0, 0, 0]),
    seg([1, 0, 0], [1, 1, 0]), seg([1, 1, 0], [1, 1, 1]), seg([1, 1, 1], [1, 0, 1]), seg([0, 0, 1], [0, 1, 1]), seg([0, 1, 1], [1, 1, 1])];
  const hidden = [seg([0, 0, 0], [0, 1, 0]), seg([0, 1, 0], [1, 1, 0]), seg([0, 1, 0], [0, 1, 1])];
  const L = 0.32; // arrow length in cells
  const arrow = (c: [number, number, number], d: [number, number, number], cls: string, label: string, dx: number, dy: number) => {
    const a = P(c[0] - (d[0] * L) / 2, c[1] - (d[1] * L) / 2, c[2] - (d[2] * L) / 2), b = P(c[0] + (d[0] * L) / 2, c[1] + (d[1] * L) / 2, c[2] + (d[2] * L) / 2);
    const m = P(...c);
    return (
      <g key={label}>
        <Arrow x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} cls={cls} />
        <text x={m[0] + dx} y={m[1] + dy} className={`${css.svgText} ${cls === css.fwE ? css.fwEText : css.fwHText}`}>{label}</text>
      </g>
    );
  };
  const lab = (x: number, y: number, z: number, txt: string, dx = 0, dy = 0) => { const p = P(x, y, z); return <text x={p[0] + dx} y={p[1] + dy} className={css.svgText} textAnchor="middle">{txt}</text>; };
  return (
    <figure className={css.figure} data-figure="fw-yee-cell">
      <svg className={`${css.svg} ${css.fwSvg}`} viewBox="0 0 440 270" role="img" aria-label={t('em.th2.wf.yeeAria')}>
        <g className={css.svgAxis}><path d={hidden.join(' ')} strokeDasharray="4 4" /></g>
        <g className={css.svgLine}><path d={front.join(' ')} /></g>
        {arrow([0.5, 0, 0], [1, 0, 0], css.fwE, 'Ex', -8, 18)}
        {arrow([0, 0, 0.5], [0, 0, 1], css.fwE, 'Ez', -24, 4)}
        {arrow([1, 0.5, 0], [0, 1, 0], css.fwE, 'Ey', 10, 12)}
        {arrow([0.5, 0, 0.5], [0, 1, 0], css.fwH, 'Hy', 16, 14)}
        {arrow([1, 0.5, 0.5], [1, 0, 0], css.fwH, 'Hx', 6, -12)}
        {arrow([0.5, 0.5, 1], [0, 0, 1], css.fwH, 'Hz', 10, -4)}
        {lab(0.5, 0, 0, 'Δx', 0, 34)}
        {lab(0, 0, 0.5, 'Δz', -44, 20)}
        <text x={8} y={20} className={`${css.svgText} ${css.fwEText}`}>{t('em.th2.wf.yeeE')}</text>
        <text x={8} y={38} className={`${css.svgText} ${css.fwHText}`}>{t('em.th2.wf.yeeH')}</text>
      </svg>
      <figcaption>{t('em.th2.wf.yeeCap')}</figcaption>
    </figure>
  );
}

/** Figure 2: E at whole steps and η₀·H at half steps, each computed from the other. */
export function LeapfrogFigure() {
  const { t } = useI18n();
  const x0 = 66, dx = 128, yE = 46, yH = 106, n = 6;
  const tick = (k: number) => x0 + k * (dx / 2);
  const steps = ['n−1', 'n−½', 'n', 'n+½', 'n+1', 'n+3⁄2'];
  const parts: React.ReactNode[] = [];
  for (let k = 0; k < n; k++) {
    const x = tick(k), isE = k % 2 === 0;
    parts.push(<text key={`t${k}`} x={x} y={150} className={css.svgNum} textAnchor="middle">{steps[k]}</text>);
    parts.push(<path key={`k${k}`} className={css.svgAxis} d={`M${x} 132 V138`} />);
    if (isE) parts.push(<circle key={`e${k}`} cx={x} cy={yE} r={7} className={css.fwEDot} />);
    else parts.push(<rect key={`h${k}`} x={x - 7} y={yH - 7} width={14} height={14} className={css.fwHDot} />);
    if (k < n - 1) {
      const xa = x + 9, xb = tick(k + 1) - 9;
      parts.push(isE
        ? <Arrow key={`a${k}`} x1={xa} y1={yE + 6} x2={xb} y2={yH - 8} cls={css.fwE} head={6} />
        : <Arrow key={`a${k}`} x1={xa} y1={yH - 6} x2={xb} y2={yE + 8} cls={css.fwH} head={6} />);
    }
  }
  return (
    <figure className={css.figure} data-figure="fw-leapfrog">
      <svg className={`${css.svg} ${css.fwSvg}`} viewBox="0 0 440 158" role="img" aria-label={t('em.th2.wf.leapAria')}>
        <path className={css.svgAxis} d={`M${x0 - 14} 135 H${tick(n - 1) + 30}`} />
        <text x={tick(n - 1) + 4} y={124} className={css.svgText}>t / Δt</text>
        <text x={8} y={yE + 4} className={`${css.svgText} ${css.fwEText}`}>E</text>
        <text x={8} y={yH + 4} className={`${css.svgText} ${css.fwHText}`}>η₀·H</text>
        {parts}
      </svg>
      <figcaption>{t('em.th2.wf.leapCap')}</figcaption>
    </figure>
  );
}

/** Figure 3: a barrel's circle on a few cells, staircased (whole cells copper) beside conformal (each cut edge counts with
 *  its part outside the copper). */
export function ConformalFigure() {
  const { t } = useI18n();
  const N = 8, c = 24, pad = 14, cx = pad + 4.1 * c, cy = pad + 3.95 * c, r = 2.75 * c;
  const inside = (x: number, y: number) => (x - cx) ** 2 + (y - cy) ** 2 < r * r;
  const grid: string[] = [];
  for (let i = 0; i <= N; i++) grid.push(`M${pad + i * c} ${pad} V${pad + N * c}`, `M${pad} ${pad + i * c} H${pad + N * c}`);
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (inside(pad + (i + 0.5) * c, pad + (j + 0.5) * c)) cells.push(<rect key={`${i}.${j}`} x={pad + i * c} y={pad + j * c} width={c} height={c} className={css.fwCopper} />);
  }
  // the outside parts of the edges the circle cuts, horizontal and vertical
  const cut: string[] = [];
  let nCut = 0;
  const outside = (a: number, b: number, at: number, centreA: number, centreB: number): [number, number][] => {
    const d = at - centreB;
    if (Math.abs(d) >= r) return [[a, b]];
    const w = Math.sqrt(r * r - d * d), lo = centreA - w, hi = centreA + w;
    const out: [number, number][] = [];
    if (lo > a) out.push([a, Math.min(b, lo)]);
    if (hi < b) out.push([Math.max(a, hi), b]);
    return out.filter(([p, q]) => q > p + 0.01);
  };
  for (let j = 0; j <= N; j++) for (let i = 0; i < N; i++) {
    const y = pad + j * c, a = pad + i * c, b = a + c, o = outside(a, b, y, cx, cy);
    const len = o.reduce((s, [p, q]) => s + q - p, 0);
    if (len > 0.01 && len < c - 0.01) { nCut++; for (const [p, q] of o) cut.push(`M${p.toFixed(1)} ${y} H${q.toFixed(1)}`); }
  }
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
    const x = pad + i * c, a = pad + j * c, b = a + c, o = outside(a, b, x, cy, cx);
    const len = o.reduce((s, [p, q]) => s + q - p, 0);
    if (len > 0.01 && len < c - 0.01) { nCut++; for (const [p, q] of o) cut.push(`M${x} ${p.toFixed(1)} V${q.toFixed(1)}`); }
  }
  const W = 2 * pad + N * c;
  const box = (body: React.ReactNode, label: string, name: string) => (
    <div className={css.figPart}>
      <div className={css.figLabel}>{name}</div>
      <svg className={css.svg} viewBox={`0 0 ${W} ${W}`} role="img" aria-label={label} style={{ maxWidth: 260 }}>{body}</svg>
    </div>
  );
  return (
    <figure className={css.figure} data-figure="fw-conformal" data-cut-edges={nCut}>
      <div className={css.figTwo}>
        {box(<>
          {cells}
          <path className={css.fwGrid} d={grid.join(' ')} />
          <circle cx={cx} cy={cy} r={r} className={css.fwCircle} />
        </>, t('em.th2.wf.stairAria'), t('em.th2.wf.stairName'))}
        {box(<>
          <circle cx={cx} cy={cy} r={r} className={css.fwCopper} />
          <path className={css.fwGrid} d={grid.join(' ')} />
          <path className={css.fwCut} d={cut.join(' ')} />
        </>, t('em.th2.wf.confAria'), t('em.th2.wf.confName'))}
      </div>
      <figcaption>{t('em.th2.wf.confCap')}</figcaption>
    </figure>
  );
}
