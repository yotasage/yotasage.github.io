// The small figures of the Smith chart's Theory section (docs/smith-chart/theory.md): mini charts as inline SVG in
// chart coordinates (Γr across, Γi up; the SVG's y is −Γi), coloured by the page's tokens so both themes follow.
// Figures that show the visitor's load take its Γ (and what the engine made of it) as props; the others show the
// start circuit (D16), whose numbers are fixed.

import React from 'react';

import css from '../../styles/SmithTheory.module.css';

type P = readonly [number, number];
const TAU = 2 * Math.PI;
const f = (v: number): number => Math.round(v * 1e4) / 1e4;
const xy = (p: P): string => `${f(p[0])} ${f(-p[1])}`;
const ok = (...v: number[]): boolean => v.every((n) => Number.isFinite(n));
const on = (c: P, R: number, a: number): P => [c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)];
const angle = (c: P, p: P): number => Math.atan2(p[1] - c[1], p[0] - c[0]);

/** The arc of the circle about c from p to q, counter-clockwise on the screen when ccw. */
function arcPath(c: P, R: number, p: P, q: P, ccw: boolean): string {
  let t = ccw ? angle(c, q) - angle(c, p) : angle(c, p) - angle(c, q);
  t = ((t % TAU) + TAU) % TAU;
  return `M${xy(p)}A${f(R)} ${f(R)} 0 ${t > Math.PI ? 1 : 0} ${ccw ? 0 : 1} ${xy(q)}`;
}

/** An arrowhead at tip pointing along the unit direction d (chart coordinates). */
function head(tip: P, d: P, size = 0.075): string {
  const b: P = [tip[0] - d[0] * size, tip[1] - d[1] * size], n: P = [-d[1] * size * 0.5, d[0] * size * 0.5];
  return `${xy(tip)} ${xy([b[0] + n[0], b[1] + n[1]])} ${xy([b[0] - n[0], b[1] - n[1]])}`;
}

/** The arrow along the circle about c from p over the chord-ish length s, with its head; cls colours both. */
function CircleArrow({ c, p, s, ccw, cls, dashed = false }: { c: P; p: P; s: number; ccw: boolean; cls: string; dashed?: boolean }) {
  const R = Math.hypot(p[0] - c[0], p[1] - c[1]);
  if (!(R > 1e-9)) return null;
  const a = angle(c, p) + (ccw ? 1 : -1) * Math.min(s / R, 2.5);
  const q = on(c, R, a);
  const d: P = ccw ? [-Math.sin(a), Math.cos(a)] : [Math.sin(a), -Math.cos(a)];
  return (
    <g className={cls}>
      <path d={arcPath(c, R, p, q, ccw)} className={dashed ? css.figDash : css.figStroke} />
      <polygon points={head(q, d)} className={css.figHead} />
    </g>
  );
}

/** The arc from p to q about c with a head at q. */
function ArcTo({ c, p, q, ccw, cls, dashed = false }: { c: P; p: P; q: P; ccw: boolean; cls: string; dashed?: boolean }) {
  const R = Math.hypot(p[0] - c[0], p[1] - c[1]);
  const a = angle(c, q);
  const d: P = ccw ? [-Math.sin(a), Math.cos(a)] : [Math.sin(a), -Math.cos(a)];
  return (
    <g className={cls}>
      <path d={arcPath(c, R, p, q, ccw)} className={dashed ? css.figDash : css.figStroke} />
      <polygon points={head(q, d)} className={css.figHead} />
    </g>
  );
}

const Dot = ({ p, cls = css.figInk, r = 0.035, hollow = false }: { p: P; cls?: string; r?: number; hollow?: boolean }) => (
  <circle cx={f(p[0])} cy={f(-p[1])} r={r} className={`${cls} ${hollow ? css.figHollow : css.figFill}`} />
);

const Label = ({ p, children, anchor = 'middle', cls = '' }: { p: P; children: React.ReactNode; anchor?: 'start' | 'middle' | 'end'; cls?: string }) => (
  <text x={f(p[0])} y={f(-p[1])} textAnchor={anchor} dominantBaseline="middle" className={cls || undefined}>{children}</text>
);

/** A circle in chart coordinates. */
const Ring = ({ c, R, cls }: { c: P; R: number; cls: string }) => (ok(c[0], c[1], R) && R > 0 ? <circle cx={f(c[0])} cy={f(-c[1])} r={f(R)} className={cls} /> : null);

/** The unit disc with its rim and real axis; the children are clipped to the disc when clip is set. */
function Disc({ label, children, outside, clip = false, box = 1.25 }: { label: string; children?: React.ReactNode; outside?: React.ReactNode; clip?: boolean; box?: number }) {
  // A stable id per figure (the static page and the browser render the figures in the same order).
  const id = React.useId().replace(/:/g, '');
  return (
    <svg viewBox={`${-box} ${-box} ${2 * box} ${2 * box}`} className={css.disc} role="img" aria-label={label}>
      {clip && <defs><clipPath id={`disc${id}`}><circle cx="0" cy="0" r="1" /></clipPath></defs>}
      <circle cx="0" cy="0" r="1" className={css.figBack} />
      <line x1="-1" y1="0" x2="1" y2="0" className={css.figAxis} />
      <g clipPath={clip ? `url(#disc${id})` : undefined}>{children}</g>
      <circle cx="0" cy="0" r="1" className={css.figRim} />
      {outside}
    </svg>
  );
}

function Figure({ caption, children, wide = false }: { caption: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  return (
    <figure className={wide ? `${css.figure} ${css.figureWide}` : css.figure}>
      <div className={css.figRow}>{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Topic 2: the unit disc, the three points to know and the load with its mirror −Γ.

export function GammaFigure({ gr, gi }: { gr: number; gi: number }) {
  const load = ok(gr, gi);
  return (
    <Figure caption={<>The match at the centre, the open at +1, the short at −1, your load L and, hollow, the point −Γ whose z is the load’s y.</>}>
      <Disc label="Unit disc with the match, the open, the short, the load and its mirror point">
        <Dot p={[0, 0]} />
        <Label p={[0, -0.13]}>match</Label>
        <Dot p={[1, 0]} />
        <Label p={[0.98, 0.13]} anchor="end">open</Label>
        <Dot p={[-1, 0]} />
        <Label p={[-0.98, 0.13]} anchor="start">short</Label>
        {load && (
          <>
            <line x1={f(gr)} y1={f(-gi)} x2={f(-gr)} y2={f(gi)} className={`${css.figAccent} ${css.figDot}`} />
            <Dot p={[-gr, -gi]} cls={css.figAccent} hollow />
            <Label p={[-gr * 1.0 + (gr > 0 ? -0.12 : 0.12), -gi - 0.12]} cls={css.figAccentText}>−Γ</Label>
            <Dot p={[gr, gi]} cls={css.figLoad} r={0.045} />
            <Label p={[gr + (gr > 0 ? -0.13 : 0.13), gi + 0.12]} cls={css.figBold}>L</Label>
          </>
        )}
      </Disc>
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Topic 3: the four circles through the load.

export function CirclesFigure({ r, x, g, b, gr, gi }: { r: number; x: number; g: number; b: number; gr: number; gi: number }) {
  // Where the x and b circles meet the rim a second time (z = jx and y = jb on the rim).
  const xr: P = [(x * x - 1) / (x * x + 1), (2 * x) / (x * x + 1)];
  const br: P = [(1 - b * b) / (1 + b * b), (-2 * b) / (1 + b * b)];
  const out = (p: P, k = 1.12): P => [p[0] * k, p[1] * k];
  return (
    <Figure caption={<>The r and x circles (ink) and the g and b circles (teal) that pass through your load L. Each z circle touches +1, each y circle −1.</>}>
      <Disc label="The r, x, g and b circles through the load" clip box={1.3}
        outside={(
          <>
            {ok(x) && x !== 0 && <Label p={out(xr)}>x</Label>}
            {ok(b) && b !== 0 && <Label p={out(br)} cls={css.figAccentText}>b</Label>}
            {ok(r) && <Label p={[r / (1 + r) - 1 / (1 + r) - 0.02, 0.1]} anchor="end">r</Label>}
            {ok(g) && <Label p={[-g / (1 + g) + 1 / (1 + g) + 0.02, -0.1]} anchor="start" cls={css.figAccentText}>g</Label>}
          </>
        )}>
        {ok(r) && <Ring c={[r / (1 + r), 0]} R={1 / (1 + r)} cls={css.figZ} />}
        {ok(x) && x !== 0 && <Ring c={[1, 1 / x]} R={1 / Math.abs(x)} cls={css.figZ} />}
        {ok(g) && <Ring c={[-g / (1 + g), 0]} R={1 / (1 + g)} cls={css.figY} />}
        {ok(b) && b !== 0 && <Ring c={[-1, -1 / b]} R={1 / Math.abs(b)} cls={css.figY} />}
        {ok(gr, gi) && <Dot p={[gr, gi]} cls={css.figLoad} r={0.045} />}
      </Disc>
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Topic 4: (a) the z plane against the chart; (b) the four walks and a line, on the start load.

const START_G: P = [-0.2, 0.4];      // Γ of the start load z = 0.5 + j0.5
const R_HALF: P = [1 / 3, 0];        // centre of the r = 0.5 circle (radius 2/3)
const G_ONE: P = [-0.5, 0];          // centre of the g = 1 circle (radius 0.5)

// The points of the line r = 0.5 that both halves of the plane figure mark: x and where Γ = (z − 1)/(z + 1) puts them.
const gammaOfHalf = (x: number): P => { const d = 2.25 + x * x; return [(x * x - 0.75) / d, (2 * x) / d]; };
const PLANE_MARKS = [-1, 0, 1].map((x) => ({ x, g: gammaOfHalf(x), text: x === 0 ? 'x = 0' : x > 0 ? 'x = 1' : 'x = −1' }));

export function PlaneFigure() {
  // The z plane in the same 2.5 × 2.5 box as the disc beside it, so both draw at one size: r from −0.4, x ±1.25.
  return (
    <Figure wide caption={<>Left: in the z plane a series reactance moves z = 0.5 + j0.5 (L) along the straight line r = 0.5. Right: on the chart that line is the r = 0.5 circle, the same points marked; both ends of the line (x → ±∞) meet at the open, and growing x turns the point clockwise.</>}>
      <svg viewBox="-0.4 -1.25 2.5 2.5" className={css.disc} role="img" aria-label="The z plane with the line r = 0.5, the load and three marked points">
        <rect x="-0.4" y="-1.25" width="2.5" height="2.5" className={css.figBack} />
        <line x1="0" y1="1.2" x2="0" y2="-1.2" className={css.figAxis} />
        <line x1="-0.3" y1="0" x2="2.05" y2="0" className={css.figAxis} />
        <line x1="1" y1="-0.04" x2="1" y2="0.04" className={css.figTick} />
        <line x1="2" y1="-0.04" x2="2" y2="0.04" className={css.figTick} />
        <line x1="-0.04" y1="-1" x2="0.04" y2="-1" className={css.figTick} />
        <line x1="-0.04" y1="1" x2="0.04" y2="1" className={css.figTick} />
        <Label p={[1, -0.13]}>1</Label>
        <Label p={[2, -0.13]}>2</Label>
        <Label p={[1.98, 0.12]} anchor="end">r</Label>
        <Label p={[-0.07, 1]} anchor="end">j1</Label>
        <Label p={[-0.07, -1]} anchor="end">−j1</Label>
        <Label p={[-0.07, 1.16]} anchor="end">x</Label>
        <line x1="0.5" y1="1.12" x2="0.5" y2="-1.12" className={`${css.figPart1} ${css.figStroke}`} />
        <g className={css.figPart1}>
          <polygon points={head([0.5, 1.2], [0, 1], 0.09)} className={css.figHead} />
          <polygon points={head([0.5, -1.2], [0, -1], 0.09)} className={css.figHead} />
        </g>
        {PLANE_MARKS.map(({ x, text }) => (
          <React.Fragment key={x}>
            <Dot p={[0.5, x]} cls={css.figPart1} hollow />
            <Label p={[0.62, x === 0 ? 0.11 : x]} anchor="start">{text}</Label>
          </React.Fragment>
        ))}
        <Dot p={[0.5, 0.5]} cls={css.figLoad} r={0.045} />
        <Label p={[0.38, 0.5]} anchor="end" cls={css.figBold}>L</Label>
        <Label p={[0.62, -0.5]} anchor="start">r = 0.5</Label>
      </svg>
      <Disc label="The chart with the r = 0.5 circle, the load and the same marked points">
        <Ring c={R_HALF} R={2 / 3} cls={`${css.figPart1} ${css.figStroke}`} />
        <CircleArrow c={R_HALF} p={START_G} s={0.5} ccw={false} cls={css.figPart1} />
        {PLANE_MARKS.map(({ x, g, text }) => (
          <React.Fragment key={x}>
            <Dot p={g} cls={css.figPart1} hollow />
            <Label p={x === 0 ? [g[0] - 0.05, g[1] - 0.12] : [g[0], g[1] + (x > 0 ? 0.13 : -0.13)]} anchor={x === 0 ? 'end' : 'middle'}>{text}</Label>
          </React.Fragment>
        ))}
        <Dot p={[1, 0]} cls={css.figPart1} hollow />
        <Label p={[1.04, 0.12]} anchor="start">±∞</Label>
        <Dot p={START_G} cls={css.figLoad} r={0.045} />
        <Label p={[-0.33, 0.47]} cls={css.figBold}>L</Label>
      </Disc>
    </Figure>
  );
}

export function WalksFigure() {
  return (
    <Figure caption={<>From the start load: <span className={css.key1}>series L</span>, <span className={css.key2}>series C</span> along its r circle, <span className={css.key3}>shunt C</span>, <span className={css.key4}>shunt L</span> along its g circle, and, dashed, <span className={css.key5}>a line</span> round the centre.</>}>
      <Disc label="Which way each part moves the start load">
        <Ring c={R_HALF} R={2 / 3} cls={css.figZ} />
        <Ring c={G_ONE} R={0.5} cls={css.figY} />
        <CircleArrow c={R_HALF} p={START_G} s={0.42} ccw={false} cls={css.figPart1} />
        <CircleArrow c={R_HALF} p={START_G} s={0.42} ccw cls={css.figPart2} />
        <CircleArrow c={G_ONE} p={START_G} s={0.42} ccw={false} cls={css.figPart3} />
        <CircleArrow c={G_ONE} p={START_G} s={0.42} ccw cls={css.figPart4} />
        <CircleArrow c={[0, 0]} p={START_G} s={0.42} ccw={false} cls={css.figPart5} dashed />
        <Dot p={START_G} cls={css.figLoad} r={0.045} />
      </Disc>
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Topic 5: a λ/8 line of Z0 on the load, and the wavelength scale towards the generator.

export function LineFigure({ gr, gi, gr2, gi2 }: { gr: number; gi: number; gr2: number; gi2: number }) {
  const mag = Math.hypot(gr, gi);
  const ticks: [number, string][] = [[Math.PI, '0'], [Math.PI / 2, '0.125'], [0, '0.25'], [-Math.PI / 2, '0.375']];
  return (
    <Figure caption={<>A λ/8 line of Z<sub>0</sub> turns your load L a quarter turn clockwise on its circle of constant |Γ|. The rim counts wavelengths towards the generator from the short.</>}>
      <Disc label="A λ/8 line turning the load a quarter turn" box={1.38}
        outside={ticks.map(([a, t]) => {
          const p = on([0, 0], 1, a), q = on([0, 0], 1.07, a), l = on([0, 0], a === Math.PI || a === 0 ? 1.12 : 1.18, a);
          return (
            <g key={t}>
              <line x1={f(p[0])} y1={f(-p[1])} x2={f(q[0])} y2={f(-q[1])} className={css.figTick} />
              <Label p={a === Math.PI ? [l[0] + 0.02, 0.11] : a === 0 ? [l[0] - 0.02, 0.11] : l} anchor={a === Math.PI ? 'start' : a === 0 ? 'end' : 'middle'}>{t}</Label>
            </g>
          );
        })}>
        {ok(gr, gi, gr2, gi2) && mag > 1e-6 && (
          <>
            <Ring c={[0, 0]} R={mag} cls={css.figConst} />
            <ArcTo c={[0, 0]} p={[gr, gi]} q={[gr2, gi2]} ccw={false} cls={css.figPart1} />
            <Dot p={[gr, gi]} cls={css.figLoad} r={0.045} />
            <Label p={[gr * 1.0 + (gr > 0 ? -0.12 : 0.12), gi + 0.12]} cls={css.figBold}>L</Label>
            <Dot p={[gr2, gi2]} cls={css.figPart1} r={0.04} />
          </>
        )}
      </Disc>
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Topic 6: circles of constant VSWR.

export function VswrFigure({ rows }: { rows: { vswr: number; mag: number; label: string }[] }) {
  return (
    <Figure caption={<>Circles of VSWR {rows.map((r) => r.label).join(', ').replace(/, ([^,]*)$/, ' and $1')} about the centre; each crosses the real axis on the right at r = VSWR (dots).</>}>
      <Disc label="Circles of constant VSWR">
        {rows.map((r) => (
          <g key={r.label}>
            <Ring c={[0, 0]} R={r.mag} cls={css.figConst} />
            <Dot p={[r.mag, 0]} r={0.028} />
            <Label p={[0, r.mag + 0.07]}>{r.label}</Label>
          </g>
        ))}
      </Disc>
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Topic 7: the start circuit's two-part match and the one-part route.

export function MatchFigure() {
  const node1: P = [-0.2, -0.4]; // Γ of 0.5 − j0.5
  return (
    <Figure caption={<>The r = 1 and g = 1 circles meet at the centre. The start load L goes down its r circle by <span className={css.key1}>the series C</span> onto g = 1, then <span className={css.key2}>the shunt L</span> takes it to the centre; dashed, a <span className={css.key3}>shunt C</span> alone.</>}>
      <Disc label="The start circuit's match on the r = 1 and g = 1 circles">
        <Ring c={[0.5, 0]} R={0.5} cls={css.figZStrong} />
        <Ring c={G_ONE} R={0.5} cls={css.figYStrong} />
        <ArcTo c={R_HALF} p={START_G} q={node1} ccw cls={css.figPart1} />
        <ArcTo c={G_ONE} p={node1} q={[0, 0]} ccw cls={css.figPart2} />
        <ArcTo c={G_ONE} p={START_G} q={[0, 0]} ccw={false} cls={css.figPart3} dashed />
        <Dot p={START_G} cls={css.figLoad} r={0.045} />
        <Label p={[-0.3, 0.5]} cls={css.figBold}>L</Label>
        <Dot p={node1} r={0.03} />
        <Dot p={[0, 0]} r={0.03} />
        <Label p={[0.5, 0.58]}>r = 1</Label>
        <Label p={[-0.5, 0.58]} cls={css.figAccentText}>g = 1</Label>
      </Disc>
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Topic 8: two solutions, one or none: g = 1 (part 2's colour) against r = 0.5, 1 and 2 (part 1's).

const TWO_ONE_NONE: { r: number; label: string; marks: P[] }[] = [
  { r: 0.5, label: 'two', marks: [[-0.2, 0.4], [-0.2, -0.4]] },
  { r: 1, label: 'one', marks: [[0, 0]] },
  { r: 2, label: 'none', marks: [] },
];

export function TwoOneNoneFigure() {
  return (
    <Figure wide caption={<>The circle <span className={css.key2}>g = 1</span> that part 2 must start on, against <span className={css.key1}>part 1’s r circle</span>; left to right r = 0.5 crosses it twice, r = 1 touches it at the centre, r = 2 misses it.</>}>
      {TWO_ONE_NONE.map(({ r, label, marks }) => (
        <Disc key={label} label={`The g = 1 circle and the r = ${r} circle: ${label}`}>
          <g className={css.figPart2}><Ring c={G_ONE} R={0.5} cls={css.figStroke} /></g>
          <g className={css.figPart1}><Ring c={[r / (1 + r), 0]} R={1 / (1 + r)} cls={css.figStroke} /></g>
          {marks.map((p, i) => <Dot key={i} p={p} cls={css.figLoad} r={0.05} />)}
        </Disc>
      ))}
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Topic 9: the nearest value: r = 0.5 touches the circle |Γ| = 1/3 about the target (the centre) at Γ = −1/3.

export function MismatchFigure() {
  return (
    <Figure caption={<><span className={css.key1}>Part 1’s r = 0.5 circle</span> never reaches the target at the centre (on r = 1, faint). The dashed circle |Γ| = 1/3 about it touches the part’s circle at the nearest point.</>}>
      <Disc label="The r = 0.5 circle, the target at the centre and the circle of the nearest mismatch">
        <Ring c={[0.5, 0]} R={0.5} cls={css.figZ} />
        <g className={css.figPart1}><Ring c={R_HALF} R={2 / 3} cls={css.figStroke} /></g>
        <g className={css.figAccent}><Ring c={[0, 0]} R={1 / 3} cls={css.figDash} /></g>
        <Dot p={[0, 0]} cls={css.figAccent} r={0.04} />
        <Label p={[0.06, 0.1]} anchor="start" cls={css.figAccentText}>target</Label>
        <Dot p={[-1 / 3, 0]} cls={css.figLoad} r={0.045} />
        <Label p={[-0.36, 0.13]} cls={css.figBold}>nearest</Label>
        <Label p={[0.62, 0.56]}>r = 1</Label>
      </Disc>
    </Figure>
  );
}

// ------------------------------------------------------------------------------------------------------------------
// Topic 10: the start match's E24 neighbours near the centre, magnified 4× (|Γ| ≤ 0.25 fills the figure).

const ZOOM = 4;

export function StandardFigure({ points }: { points: { gr: number; gi: number; label: string }[] }) {
  const id = React.useId().replace(/:/g, '');
  const at = (gr: number, gi: number): P => [gr * ZOOM, gi * ZOOM];
  return (
    <Figure caption={<>Near the centre, 4× magnified (the rim is |Γ| = 0.25): the exact match at the centre, the dashed close-enough circle |Γ| = 0.2, and where the E24 pairs put the input: {points.map((q, i) => `${i + 1}: ${q.label}`).join('; ')}.</>}>
      <svg viewBox="-1.25 -1.25 2.5 2.5" className={css.disc} role="img" aria-label="The input points of the E24 pairs near the centre">
        <defs><clipPath id={`zoom${id}`}><circle cx="0" cy="0" r="1" /></clipPath></defs>
        <circle cx="0" cy="0" r="1" className={css.figBack} />
        <g clipPath={`url(#zoom${id})`}>
          <line x1="-1" y1="0" x2="1" y2="0" className={css.figAxis} />
          <line x1="0" y1="-1" x2="0" y2="1" className={css.figAxis} />
          <g className={css.figAccent}><Ring c={[0, 0]} R={0.2 * ZOOM} cls={css.figDash} /></g>
        </g>
        <circle cx="0" cy="0" r="1" className={css.figRim} />
        <Label p={[0.57, 0.62]} cls={css.figAccentText}>0.2</Label>
        <Dot p={[0, 0]} cls={css.figAccent} r={0.045} />
        {points.map(({ gr, gi, label }, i) => {
          if (!ok(gr, gi)) return null;
          // Numbered, the pairs in the caption: the four points lie within a label's width of each other.
          const p = at(gr, gi), right = p[0] >= 0;
          return (
            <g key={label}>
              <Dot p={p} cls={css.figLoad} r={0.04} />
              <Label p={[p[0] + (right ? 0.08 : -0.08), p[1]]} anchor={right ? 'start' : 'end'} cls={css.figBold}>{i + 1}</Label>
            </g>
          );
        })}
      </svg>
    </Figure>
  );
}
