import React from 'react';

import { ChipSize, deratedPower } from '../../lib/resistor';
import css from '../../styles/ResistorTheory.module.css';

// The small figures of the Theory section. Every colour is a class of ResistorTheory.module.css, which takes it from
// the theme variables, so the figures follow the light and the dark theme.

const NBSP = ' ';

// A number with an SI prefix and its unit, kept together: "82 mW", "8.8 nV".
export function eng(value: number, unit: string, digits = 3): string {
  if (!Number.isFinite(value)) return '–';
  if (value === 0) return `0${NBSP}${unit}`;
  const steps: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
  const abs = Math.abs(value);
  const [scale, prefix] = steps.find(([s]) => abs >= s * 0.9995) ?? steps[steps.length - 1];
  return `${value < 0 ? '−' : ''}${Number((abs / scale).toPrecision(digits))}${NBSP}${prefix}${unit}`;
}

// A resistor as an IEC rectangle, lying or standing, with its name beside it.
function Res({ x, y, label, upright }: { x: number; y: number; label: string; upright?: boolean }) {
  return upright ? (
    <>
      <rect className={css.figPart} x={x - 7} y={y} width={14} height={36} />
      <text className={css.figText} x={x + 14} y={y + 22}>{label}</text>
    </>
  ) : (
    <>
      <rect className={css.figPart} x={x} y={y - 7} width={36} height={14} />
      <text className={css.figText} x={x + 18} y={y - 13} textAnchor="middle">{label}</text>
    </>
  );
}

export function SeriesFigure() {
  return (
    <svg className={css.fig} viewBox="0 0 150 56" width={150} height={56} role="img" aria-label="Two resistors in series">
      <path className={css.figWire} d="M6 34H26M62 34H88M124 34H144" />
      <Res x={26} y={34} label="R₁" />
      <Res x={88} y={34} label="R₂" />
      <circle className={css.figDot} cx={6} cy={34} r={2.2} />
      <circle className={css.figDot} cx={144} cy={34} r={2.2} />
    </svg>
  );
}

export function ParallelFigure() {
  return (
    <svg className={css.fig} viewBox="0 0 150 76" width={150} height={76} role="img" aria-label="Two resistors in parallel">
      <path className={css.figWire} d="M6 44H34M116 44H144M34 24V64M116 24V64M34 24H57M93 24H116M34 64H57M93 64H116" />
      <Res x={57} y={24} label="R₁" />
      <Res x={57} y={64} label="" />
      <text className={css.figText} x={75} y={51} textAnchor="middle">R₂</text>
      <circle className={css.figDot} cx={6} cy={44} r={2.2} />
      <circle className={css.figDot} cx={144} cy={44} r={2.2} />
      <circle className={css.figDot} cx={34} cy={44} r={2.2} />
      <circle className={css.figDot} cx={116} cy={44} r={2.2} />
    </svg>
  );
}

export function DividerFigure() {
  return (
    <svg className={css.fig} viewBox="0 0 150 132" width={150} height={132} role="img" aria-label="A voltage divider: R1 from the input to the output, R2 from the output to ground">
      <path className={css.figWire} d="M40 8V20M40 56V76M40 112V122M30 122H50M40 66H92" />
      <path className={css.figAccent} d="M92 66H104" />
      <Res x={40} y={20} label="R₁" upright />
      <Res x={40} y={76} label="R₂" upright />
      <circle className={css.figDot} cx={40} cy={8} r={2.2} />
      <circle className={css.figDot} cx={40} cy={66} r={2.2} />
      <text className={css.figText} x={30} y={12} textAnchor="end">Vin</text>
      <text className={css.figTextAccent} x={108} y={70}>Vout</text>
    </svg>
  );
}

// One decade of E12 with the range of each value at ±10 %: the ranges of neighbours just meet.
export function BandsFigure({ values }: { values: number[] }) {
  const all = [...values.map((v) => v / 100), 10];
  // Rounded, so that the page built by Node and the browser agree to the last digit.
  const x = (v: number) => Math.round((14 + (Math.log10(v / 0.88) / Math.log10(11.4 / 0.88)) * 512) * 100) / 100;
  return (
    <svg className={css.figWide} viewBox="0 0 540 62" width={540} height={62} role="img" aria-label="The E12 values of one decade on a logarithmic axis, each with its range at plus and minus 10 percent; the ranges of neighbouring values just meet">
      {all.map((v, i) => (
        <g key={v}>
          <rect className={i % 2 ? css.figBandB : css.figBandA} x={x(v * 0.9)} y={i % 2 ? 19 : 8} width={Math.round((x(v * 1.1) - x(v * 0.9)) * 100) / 100} height={9} rx={1.5} />
          <path className={css.figWire} d={`M${x(v)} 6V38`} />
          <text className={css.figNum} x={x(v)} y={53} textAnchor="middle">{v === 10 ? '10' : v.toFixed(1)}</text>
        </g>
      ))}
      <path className={css.figAxis} d="M8 38H532" />
    </svg>
  );
}

// The rated power of a chip size against the ambient temperature: flat up to 70 °C, then a straight line to zero at
// the maximum temperature (deratedPower), with the points at 85 and 125 °C.
export function DeratingChart({ size }: { size: ChipSize }) {
  const top = size.maxTemperature;
  const span = 165;
  const x = (t: number) => Math.round((46 + (t / span) * 282) * 100) / 100;
  const y = (fraction: number) => Math.round((150 - fraction * 112) * 100) / 100;
  const marks = [85, 125].filter((t) => t < top);
  const ticks = [...new Set([25, 70, ...marks, top])];
  return (
    <svg className={css.figChart} viewBox="0 0 340 190" width={340} height={190} role="img"
      aria-label={`Rated power of a ${size.imperial} chip against the ambient temperature: ${eng(size.power, 'W')} up to 70 °C, falling in a straight line to zero at ${top} °C`}>
      <path className={css.figArea} d={`M${x(0)} ${y(0)}V${y(1)}H${x(70)}L${x(top)} ${y(0)}Z`} />
      {[0.5, 1].map((f) => <path key={f} className={css.figGrid} d={`M${x(0)} ${y(f)}H${x(span)}`} />)}
      {ticks.map((t) => <path key={t} className={css.figGrid} d={`M${x(t)} ${y(0)}V${y(1) - 6}`} />)}
      <path className={css.figAxis} d={`M${x(0)} ${y(1) - 12}V${y(0)}H${x(span)}`} />
      <path className={css.figCurve} d={`M${x(0)} ${y(1)}H${x(70)}L${x(top)} ${y(0)}`} />
      {ticks.map((t) => <text key={t} className={css.figNum} x={x(t)} y={165} textAnchor="middle">{t}</text>)}
      <text className={css.figText} x={x(span)} y={182} textAnchor="end">ambient temperature, °C</text>
      <text className={css.figNum} x={40} y={y(1) + 4} textAnchor="end">{eng(size.power, 'W').replace(NBSP, ' ')}</text>
      <text className={css.figNum} x={40} y={y(0.5) + 4} textAnchor="end">50 %</text>
      <text className={css.figNum} x={40} y={y(0) + 4} textAnchor="end">0</text>
      {marks.map((t) => {
        const fraction = deratedPower(1, t, top);
        return (
          <g key={t}>
            <circle className={css.figPoint} cx={x(t)} cy={y(fraction)} r={3.2} />
            <text className={css.figNumStrong} x={x(t) + 7} y={y(fraction) - 6}>{eng(deratedPower(size.power, t, top), 'W').replace(NBSP, ' ')}</text>
          </g>
        );
      })}
    </svg>
  );
}

// A real resistor at high frequency: an inductance in series, a capacitance across.
export function ParasiticsFigure() {
  return (
    <svg className={css.fig} viewBox="0 0 230 84" width={230} height={84} role="img" aria-label="Equivalent circuit of a resistor at high frequency: the resistance in series with a small inductance, and a small capacitance across both">
      <path className={css.figWire} d="M6 56H38M94 56H120M156 56H224M24 56V20H104M112 20H200V56M104 11V29M112 11V29" />
      <path className={css.figWire} d="M38 56a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0" />
      <Res x={120} y={56} label="" />
      <text className={css.figText} x={66} y={74} textAnchor="middle">L</text>
      <text className={css.figText} x={138} y={78} textAnchor="middle">R</text>
      <text className={css.figText} x={122} y={16}>C</text>
      <circle className={css.figDot} cx={6} cy={56} r={2.2} />
      <circle className={css.figDot} cx={224} cy={56} r={2.2} />
      <circle className={css.figDot} cx={24} cy={56} r={2.2} />
      <circle className={css.figDot} cx={200} cy={56} r={2.2} />
    </svg>
  );
}

// A shunt with a Kelvin connection: the current flows through the wide traces, the voltage is taken by two thin
// traces from the inner edges of the pads.
export function KelvinFigure() {
  return (
    <svg className={css.fig} viewBox="0 0 280 118" width={280} height={118} role="img" aria-label="A current-sense resistor with a Kelvin connection: wide traces carry the current to the pads, two thin traces from the inner edges of the pads take the voltage to the amplifier">
      <rect className={css.figCopper} x={4} y={22} width={100} height={34} rx={2} />
      <rect className={css.figCopper} x={176} y={22} width={100} height={34} rx={2} />
      <rect className={css.figPart} x={92} y={18} width={96} height={42} rx={2} />
      <path className={css.figAccent} d="M112 56V92H128M168 56V92H152" />
      <text className={css.figText} x={140} y={43} textAnchor="middle">shunt</text>
      <text className={css.figText} x={30} y={43} textAnchor="middle">I →</text>
      <text className={css.figText} x={250} y={43} textAnchor="middle">I →</text>
      <text className={css.figTextAccent} x={140} y={96} textAnchor="middle">V</text>
      <text className={css.figText} x={140} y={112} textAnchor="middle">to the amplifier</text>
    </svg>
  );
}
