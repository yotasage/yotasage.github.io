// The Theory section's figures (step M2.4c, in the Theory chunk), drawn by the page's own code: the cross-sections
// with their fields are TraceDrawing (still: no handles) with the field view, solved and mapped in the worker on a
// channel of their own and mounted only when the figure comes near the window; the L–C ladder, the calculator's parts
// and the tolerance ranking are small SVGs of the numbers the page has (or the default example's, said so).

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { section } from '../../lib/emsim/geometry';
import { defaultSetup } from '../../lib/emsim/setup';
import type { Setup } from '../../lib/emsim/setup';
import { val } from '../../lib/emsim/stackup';
import { presetStructure } from '../../lib/emsim/structure';
import type { LengthUnit } from '../../lib/emsim/units';
import type { CornersResult } from '../../lib/emsim/vary';
import { JLC_PART_LABEL } from '../../lib/emsim/jlcCalc';
import type { JlcPart } from '../../lib/emsim/jlcCalc';
import css from '../../styles/EmSimTheory.module.css';
import { FIELD_DEFAULT } from './fieldTypes';
import type { FieldSettings } from './fieldTypes';
import TraceDrawing from './TraceDrawing';
import type { HandleEdit } from './TraceDrawing';
import { getClient } from './TraceSection';
import { withPlaceholders } from './tools';
import type { FedCalc } from './theoryFeed';

const NO_EDIT: HandleEdit = { begin() {}, move: () => null, end() {}, key: () => null };

// The fixed setups the figures show: the default microstrip, without its mask, and the default pair (0.11 / 0.2 mm).
const D = defaultSetup();
const D_BARE: Setup = { ...D, trace: { ...D.trace, masked: false } };
const P: Setup = { ...D, trace: { ...presetStructure('pair-microstrip', D.stackup, 0.11), s: val(0.2) } };
export const FIGURE_SETUPS = { D, D_BARE, P };

/** Mounts its children once the box comes within a screen of the window. */
function Near({ children, minH }: { children: React.ReactNode; minH: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (on || !box.current) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setOn(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setOn(true); }, { rootMargin: '600px 0px' });
    io.observe(box.current);
    return () => io.disconnect();
  }, [on]);
  return <div ref={box} style={on ? undefined : { minHeight: minH }}>{on ? children : null}</div>;
}

function FieldFigure({ setup, fields, channel, label, unit, digits }: { setup: Setup; fields: Partial<FieldSettings>; channel: string; label: string; unit: LengthUnit; digits: number }) {
  const sec = useMemo(() => { try { return section(setup.stackup, setup.trace); } catch { return null; } }, [setup]);
  const f = useMemo<FieldSettings>(() => ({ ...FIELD_DEFAULT, ...fields, on: true }), [fields]);
  const env = useMemo(() => ({ client: getClient, via: setup.via, channel }), [setup, channel]);
  return (
    <div className={css.figPart} data-figure-part={channel}>
      <div className={css.figLabel}>{label}</div>
      <Near minH={220}>
        <TraceDrawing s={setup.stackup} st={setup.trace} sec={sec} reason="" unit={unit} digits={digits} widen={false} edit={NO_EDIT} fields={f} fieldEnv={env} still />
      </Near>
    </div>
  );
}

const LINES: Partial<FieldSettings> = { qty: 'lines', drive: 'line', line: 1 };
const ODD: Partial<FieldSettings> = { qty: 'lines', drive: 'odd' };
const EVEN: Partial<FieldSettings> = { qty: 'lines', drive: 'even' };
const E_LIN: Partial<FieldSettings> = { qty: 'E', drive: 'line', line: 1, scale: 'linear' };

type FigProps = { unit: LengthUnit; digits: number };

export const FieldLinesFigure = ({ unit, digits }: FigProps) => (
  <figure className={css.figure} data-figure="field-lines">
    <FieldFigure setup={D} fields={LINES} channel="theory-lines" label="Default microstrip, field lines and equipotentials" unit={unit} digits={digits} />
    <figcaption>The field of the default microstrip: most of it in the laminate, some in the mask and the air above.</figcaption>
  </figure>
);

export const PairFigure = ({ unit, digits }: FigProps) => (
  <figure className={css.figure} data-figure="pair-modes">
    <div className={css.figTwo}>
      <FieldFigure setup={P} fields={ODD} channel="theory-odd" label="Odd (+1, −1)" unit={unit} digits={digits} />
      <FieldFigure setup={P} fields={EVEN} channel="theory-even" label="Even (all +1)" unit={unit} digits={digits} />
    </div>
    <figcaption>Odd: the field crowds into the gap. Even: the gap is nearly field-free and the traces push their field down to the plane.</figcaption>
  </figure>
);

export const MaskFigure = ({ unit, digits }: FigProps) => (
  <figure className={css.figure} data-figure="mask">
    <div className={css.figTwo}>
      <FieldFigure setup={D} fields={E_LIN} channel="theory-mask" label="|E| with solder mask" unit={unit} digits={digits} />
      <FieldFigure setup={D_BARE} fields={E_LIN} channel="theory-bare" label="|E| without" unit={unit} digits={digits} />
    </div>
    <figcaption>With mask, part of the field above the trace runs in the mask instead of the air. Each picture has its own colour scale, shown under it.</figcaption>
  </figure>
);

/** Four sections of series L·Δz and shunt C·Δz between a trace and its plane. */
export function LadderFigure() {
  const W = 520, H = 130, x0 = 30, dx = 115, yT = 34, yB = 104;
  const parts: React.ReactNode[] = [];
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * dx;
    // the coil: four bumps
    let d = `M${x} ${yT} h12`;
    for (let k = 0; k < 4; k++) d += ` a7 7 0 0 1 14 0`;
    d += ` h${dx - 12 - 56}`;
    parts.push(<path key={`l${i}`} d={d} />);
    parts.push(<text key={`tl${i}`} x={x + 40} y={yT - 12} className={css.svgText} textAnchor="middle">L·Δz</text>);
    const xc = x + dx - 18;
    parts.push(<path key={`c${i}`} d={`M${xc} ${yT} V${(yT + yB) / 2 - 5} M${xc - 12} ${(yT + yB) / 2 - 5} h24 M${xc - 12} ${(yT + yB) / 2 + 5} h24 M${xc} ${(yT + yB) / 2 + 5} V${yB}`} />);
    parts.push(<text key={`tc${i}`} x={xc + 16} y={(yT + yB) / 2 + 4} className={css.svgText}>C·Δz</text>);
  }
  return (
    <figure className={css.figure} data-figure="ladder">
      <svg className={css.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A ladder of series inductors along the trace and capacitors to the plane">
        <g className={css.svgLine}>
          {parts}
          <path d={`M${x0 - 20} ${yB} H${x0 + 4 * dx + 10}`} />
          <path d={`M${x0 - 20} ${yT} H${x0}`} />
        </g>
        <text x={x0 - 20} y={yT - 12} className={css.svgText}>trace</text>
        <text x={x0 - 20} y={yB + 18} className={css.svgText}>plane</text>
      </svg>
      <figcaption>A short piece Δz of line: the inductance of the loop in series, the capacitance to the plane across. Many such pieces make the line.</figcaption>
    </figure>
  );
}

/** Horizontal bars on one signed axis (Ω), labels on the left, values on the right. */
function Bars({ rows, label, extra }: { rows: { k: string; label: string; d: number; tag?: string; strong?: boolean }[]; label: string; extra?: React.ReactNode }) {
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.d)));
  const W = 560, L = 170, R = 70, rowH = 24, H = rows.length * rowH + 22;
  const span = W - L - R, mid = L + span / 2, k = span / 2 / max;
  return (
    <svg className={css.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <path className={css.svgAxis} d={`M${mid} 4 V${H - 16}`} />
      {rows.map((r, i) => {
        const y = 6 + i * rowH, w = Math.abs(r.d) * k;
        return (
          <g key={r.k} data-bar={r.k} data-d={r.d}>
            <text x={L - 8} y={y + 13} className={css.svgText} textAnchor="end">{r.label}{r.tag ? ` ${r.tag}` : ''}</text>
            <rect x={r.d < 0 ? mid - w : mid} y={y + 2} width={Math.max(1, w)} height={rowH - 8} className={r.strong ? css.barSum : r.d < 0 ? css.barNeg : css.barPos} />
            <text x={W - 4} y={y + 13} className={css.svgNum} textAnchor="end">{r.d > 0 ? '+' : r.d < 0 ? '−' : ''}{Math.abs(r.d).toFixed(2)} Ω</text>
          </g>
        );
      })}
      {extra}
    </svg>
  );
}

// The default example's numbers (theory-2.md, checked against the engine in notes-M2.4a.md).
const DEFAULT_PARTS: Record<JlcPart, number> = { er: 0.94, copper: 0.51, etch: 0.25, mask: -0.27 };

export function PartsFigure({ calc, shown }: { calc: FedCalc | null; shown: boolean }) {
  const parts = shown && calc ? calc.parts : DEFAULT_PARTS;
  const rows: { k: string; label: string; d: number; strong?: boolean }[] = (Object.keys(DEFAULT_PARTS) as JlcPart[]).filter((p) => parts[p] !== undefined).map((p) => ({ k: p, label: JLC_PART_LABEL[p] ?? p, d: parts[p]! }));
  rows.push({ k: 'sum', label: 'together', d: rows.reduce((a, r) => a + r.d, 0), strong: true });
  return (
    <figure className={css.figure} data-figure="parts" data-source={shown && calc ? 'calculators' : 'default'}>
      <Bars rows={rows} label="Change of the impedance per input, from JLCPCB's calculator inputs to the stackup's own" />
      <figcaption>
        From JLCPCB’s calculator inputs to this stackup’s own, one at a time
        {shown && calc ? ` (your structure: ${calc.calculator.toFixed(2)} → ${calc.stackup.toFixed(2)} Ω).` : ' (the default microstrip; open Calculators in the Trace section for your structure).'}
      </figcaption>
    </figure>
  );
}

const DEFAULT_RANK = [
  { k: 'prepreg-t', label: 'prepreg thickness', d: 2.87 }, { k: 'w', label: 'width', d: -2.42 },
  { k: 'prepreg-er', label: 'prepreg εr', d: -0.98 }, { k: 'mask', label: 'mask on laminate', d: -0.49 },
  { k: 'cu', label: 'copper thickness', d: -0.34 },
];

export function RankingFigure({ corners, setup, sd }: { corners: CornersResult | null; setup: Setup | null; sd: number | null }) {
  const filled = useMemo(() => (corners && setup ? withPlaceholders(setup).filled : new Set<string>()), [corners, setup]);
  const live = !!(corners && corners.ok && corners.inputs.length);
  const rows = live
    ? corners!.inputs.slice(0, 8).map((x) => ({ k: x.id, label: x.label, d: x.d[corners!.key], tag: filled.has(x.id) ? '*' : undefined }))
    : DEFAULT_RANK;
  const c = live ? corners!.corners.find((x) => x.key === corners!.key) : null;
  const nom = live ? corners!.nominal[corners!.key] : 51.5;
  const lo = c ? c.lo : 44.54, hi = c ? c.hi : 59.37;
  const sigma = sd ?? (live ? Math.sqrt(corners!.inputs.reduce((a, x) => a + x.d[corners!.key] ** 2, 0)) / 3 : 1.31);
  // the band: worst case and ±2σ on one axis
  const W = 560, H = 54, L = 20, R = 20, span = W - L - R;
  const a = Math.min(lo, nom - 2 * sigma), b = Math.max(hi, nom + 2 * sigma), pad = (b - a) * 0.06;
  const X = (z: number) => L + ((z - (a - pad)) / (b - a + 2 * pad)) * span;
  return (
    <figure className={css.figure} data-figure="ranking" data-source={live ? 'tolerance' : 'default'}>
      <Bars rows={rows} label="How far each input moves the impedance at the ends of its tolerance" />
      <svg className={css.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Worst case ${lo.toFixed(2)} to ${hi.toFixed(2)} Ω, ±2σ ${(nom - 2 * sigma).toFixed(2)} to ${(nom + 2 * sigma).toFixed(2)} Ω`}>
        <rect x={X(lo)} y={8} width={X(hi) - X(lo)} height={10} className={css.bandWide} data-corners={`${lo} ${hi}`} />
        <rect x={X(nom - 2 * sigma)} y={22} width={4 * sigma * (span / (b - a + 2 * pad))} height={10} className={css.bandNarrow} />
        <path className={css.svgAxis} d={`M${X(nom)} 4 V36`} />
        <text x={X(lo)} y={50} className={css.svgNum} textAnchor="start">{lo.toFixed(2)}</text>
        <text x={X(nom)} y={50} className={css.svgNum} textAnchor="middle">{nom.toFixed(2)} Ω</text>
        <text x={X(hi)} y={50} className={css.svgNum} textAnchor="end">{hi.toFixed(2)}</text>
      </svg>
      <figcaption>
        Each input alone at the ends of its tolerance; below, the worst-case corners (wide band) and ±2σ (narrow band).
        {live ? ` From the Tolerance tool’s last run${filled.size ? '; * marks a placeholder tolerance' : ''}${sd !== null ? ', σ from its Monte Carlo' : ', σ from the ranking'}.` : ' The default microstrip with the placeholders; open Tolerance in the Trace section for your structure.'}
      </figcaption>
    </figure>
  );
}
