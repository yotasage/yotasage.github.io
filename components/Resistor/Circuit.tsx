import React from 'react';

import { Network, networkLayout, ohmsParts } from '../../lib/resistor';
import css from '../../styles/ResistorCombos.module.css';

// Pixels for one unit of the layout: a resistor with its leads is UNIT long, a row is ROW high.
const UNIT = 46;
const ROW = 30;
const PAD = 8;
const BOX_W = 24;
const BOX_H = 10;
// The line of a row lies a little below its middle, so the value has room above the resistor.
const DROP = 4;

// A small circuit drawing of a network: resistors as IEC rectangles with their values, in the colours of the text.
export default function Circuit({ network, names }: { network: Network; names?: boolean }) {
  const layout = networkLayout(network);
  const width = layout.width * UNIT + 2 * PAD;
  const height = layout.height * ROW;
  const px = (x: number) => PAD + x * UNIT;
  const py = (y: number) => y * ROW + DROP;
  const mid = py(layout.height / 2);
  const label = layout.resistors.map((r) => ohmsParts(r.ohms).join(' ')).join(', ');

  return (
    <svg className={css.circuit} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Circuit: ${label}`}>
      <g fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="square">
        <path d={`M1.5 ${mid}H${PAD}M${width - PAD} ${mid}H${width - 1.5}`} />
        {layout.wires.map(([x1, y1, x2, y2], i) => <path key={i} d={`M${px(x1)} ${py(y1)}L${px(x2)} ${py(y2)}`} />)}
        {layout.resistors.map((r) => {
          const left = px(r.x) + (UNIT - BOX_W) / 2;
          return (
            <React.Fragment key={r.index}>
              <path d={`M${px(r.x)} ${py(r.y)}H${left}M${left + BOX_W} ${py(r.y)}H${px(r.x + 1)}`} />
              <rect x={left} y={py(r.y) - BOX_H / 2} width={BOX_W} height={BOX_H} rx={1} />
            </React.Fragment>
          );
        })}
      </g>
      <circle cx={2.5} cy={mid} r={2} className={css.terminal} />
      <circle cx={width - 2.5} cy={mid} r={2} className={css.terminal} />
      {layout.resistors.map((r) => (
        <text key={r.index} x={px(r.x) + UNIT / 2} y={py(r.y) - BOX_H / 2 - 3.5} textAnchor="middle" className={css.circuitValue}>
          {names ? `R${r.index + 1}` : <>{ohmsParts(r.ohms)[0]}<tspan dx={1.5} className={css.circuitUnit}>{ohmsParts(r.ohms)[1]}</tspan></>}
        </text>
      ))}
    </svg>
  );
}
