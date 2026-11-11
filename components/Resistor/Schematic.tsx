import React from 'react';

import { CircuitId } from '../../lib/resistor';
import css from '../../styles/ResistorDesign.module.css';

// The schematic of a circuit of the design mode: resistors as IEC rectangles, as in the drawings of the
// Combinations section, with the quantities of the circuit beside them. `q` has the text of each quantity by the id
// of its field (an empty text for one that is not given); the target is set in the accent colour.

const BOX = 26;
const THICK = 11;

function Across({ x, y, name }: { x: number; y: number; name: string }) {
  return (
    <>
      <rect x={x - BOX / 2} y={y - THICK / 2} width={BOX} height={THICK} rx={1} className={css.schPart} />
      <text x={x} y={y - THICK / 2 - 4.5} textAnchor="middle" className={css.schName}>{name}</text>
    </>
  );
}

function Down({ x, y, name, left }: { x: number; y: number; name: string; left?: boolean }) {
  return (
    <>
      <rect x={x - THICK / 2} y={y - BOX / 2} width={THICK} height={BOX} rx={1} className={css.schPart} />
      <text x={left ? x - THICK / 2 - 6 : x + THICK / 2 + 6} y={y + 3.5} textAnchor={left ? 'end' : 'start'} className={css.schName}>{name}</text>
    </>
  );
}

const Ground = ({ x, y }: { x: number; y: number }) => <path d={`M${x - 9} ${y}H${x + 9}M${x - 5.5} ${y + 4}H${x + 5.5}M${x - 2} ${y + 8}H${x + 2}`} />;
const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={2.2} className={css.schDot} />;
const Pin = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={2.6} className={css.schPin} />;
// An arrow head at (x, y) that points right, left, up or down.
function Head({ x, y, to }: { x: number; y: number; to: 'r' | 'l' | 'u' | 'd' }) {
  const d = { r: `M${x - 6} ${y - 3.5}L${x} ${y}L${x - 6} ${y + 3.5}`, l: `M${x + 6} ${y - 3.5}L${x} ${y}L${x + 6} ${y + 3.5}`, u: `M${x - 3.5} ${y + 6}L${x} ${y}L${x + 3.5} ${y + 6}`, d: `M${x - 3.5} ${y - 6}L${x} ${y}L${x + 3.5} ${y - 6}` }[to];
  return <path d={d} />;
}

function Label({ x, y, anchor = 'start', target, children }: { x: number; y: number; anchor?: 'start' | 'middle' | 'end'; target?: boolean; children: React.ReactNode }) {
  return <text x={x} y={y} textAnchor={anchor} className={target ? css.schTarget : css.schText}>{children}</text>;
}

// An amplifier with its inputs at y − 15 and y + 15 and its output at x + 58; `plusTop` puts the + input above.
const Amp = ({ x, y, plusTop }: { x: number; y: number; plusTop?: boolean }) => {
  const plus = plusTop ? y - 15 : y + 15;
  const minus = plusTop ? y + 15 : y - 15;
  return (
    <>
      <path d={`M${x} ${y - 30}V${y + 30}L${x + 58} ${y}Z`} className={css.schPart} />
      <path d={`M${x + 6} ${minus}h7M${x + 6} ${plus}h7M${x + 9.5} ${plus - 3.5}v7`} strokeWidth={1} />
    </>
  );
};

export default function Schematic({ circuit, q }: { circuit: CircuitId; q: Record<string, string> }) {
  const named = (name: string, text: string) => (text ? `${name} = ${text}` : name);
  const width = 250;
  let height = 120;
  let body: React.ReactNode = null;
  let texts: React.ReactNode = null;

  if (circuit === 'single-current') {
    height = 104;
    const drop = !!q.drop;
    body = (
      <>
        <path d={`M14 34H${78 - BOX / 2}M${78 + BOX / 2} 34H${drop ? 138 : 206}${drop ? 'M154 34H206' : ''}M206 34V78`} />
        <Across x={78} y={34} name="R" />
        {drop && <path d="M138 26V42L154 34ZM154 26V42" className={css.schPart} />}
        <Ground x={206} y={78} />
        <path d="M100 58H128" /><Head x={128} y={58} to="r" />
        <Pin x={14} y={34} />
      </>
    );
    texts = (
      <>
        <Label x={8} y={20}>{q.volts || 'V'}</Label>
        {drop && <Label x={146} y={18} anchor="middle">{q.drop}</Label>}
        <Label x={134} y={61.5} target>{named('I', q.target)}</Label>
      </>
    );
  } else if (circuit === 'single-voltage') {
    height = 124;
    body = (
      <>
        <path d={`M14 24H104V${62 - BOX / 2}M104 ${62 + BOX / 2}V100`} />
        <path d="M40 24H62" /><Head x={66} y={24} to="r" />
        <Down x={104} y={62} name="R" left />
        <Ground x={104} y={100} />
        <path d="M134 30V94" strokeDasharray="2 3" /><Head x={134} y={28} to="u" />
        <Pin x={14} y={24} />
      </>
    );
    texts = (
      <>
        <Label x={8} y={42}>{named('I', q.amps)}</Label>
        <Label x={142} y={65.5} target>{named('V', q.target)}</Label>
      </>
    );
  } else if (circuit === 'divider' || circuit === 'feedback') {
    height = 152;
    const load = circuit === 'divider' && !!q.load;
    const pin = circuit === 'feedback' && !!q.ifb;
    body = (
      <>
        <path d={`M14 18H92V${44 - BOX / 2}M92 ${44 + BOX / 2}V${100 - BOX / 2}M92 ${100 + BOX / 2}V130M92 72H${load ? 196 : 168}`} />
        {load && <path d={`M150 72V${100 - BOX / 2}M150 ${100 + BOX / 2}V130`} />}
        <Down x={92} y={44} name="R1" left />
        <Down x={92} y={100} name="R2" left />
        {load && <Down x={150} y={100} name={q.load} />}
        <Ground x={92} y={130} />
        {load && <Ground x={150} y={130} />}
        {pin && <Head x={116} y={72} to="l" />}
        <Dot x={92} y={72} />
        {load && <Dot x={150} y={72} />}
        <Pin x={14} y={18} />
        <Pin x={load ? 196 : 168} y={72} />
      </>
    );
    texts = circuit === 'divider' ? (
      <>
        <Label x={8} y={36}>{named('Vin', q.vin)}</Label>
        <Label x={load ? 240 : 176} y={load ? 60 : 75.5} anchor={load ? 'end' : 'start'} target>{load ? named('Vout', q.target) : q.target || 'Vout'}</Label>
      </>
    ) : (
      <>
        <Label x={8} y={36} target>{named('Vout', q.target)}</Label>
        <Label x={176} y={69}>FB pin</Label>
        <Label x={176} y={82}>{q.vref || 'Vref'}</Label>
        {pin && <Label x={128} y={62} anchor="middle">{q.ifb}</Label>}
      </>
    );
  } else if (circuit === 'noninverting') {
    height = 168;
    body = (
      <>
        <path d={`M14 33H88M146 48H214M88 63H62V104H${118 - BOX / 2}M${118 + BOX / 2} 104H176V48M62 104V${130 - BOX / 2}M62 ${130 + BOX / 2}V152`} />
        <Amp x={88} y={48} plusTop />
        <Across x={118} y={104} name="R1" />
        <Down x={62} y={130} name="R2" left />
        <Ground x={62} y={152} />
        <Dot x={176} y={48} />
        <Dot x={62} y={104} />
        <Pin x={14} y={33} />
        <Pin x={214} y={48} />
      </>
    );
    texts = (
      <>
        <Label x={8} y={22}>{q.vin || 'Vin'}</Label>
        <Label x={244} y={36} anchor="end">Vout</Label>
        <Label x={130} y={136} target>{named('G', q.target)}</Label>
      </>
    );
  } else if (circuit === 'inverting') {
    height = 136;
    body = (
      <>
        <path d={`M14 62H${52 - BOX / 2}M${52 + BOX / 2} 62H104M88 62V22H${132 - BOX / 2}M${132 + BOX / 2} 22H188V77M162 77H222M104 92H88V112`} />
        <Amp x={104} y={77} />
        <Across x={52} y={62} name="R1" />
        <Across x={132} y={22} name="R2" />
        <Ground x={88} y={112} />
        <Dot x={88} y={62} />
        <Dot x={188} y={77} />
        <Pin x={14} y={62} />
        <Pin x={222} y={77} />
      </>
    );
    texts = (
      <>
        <Label x={8} y={82}>{q.vin || 'Vin'}</Label>
        <Label x={244} y={66} anchor="end">Vout</Label>
        <Label x={150} y={126} target>{named('G', q.target)}</Label>
      </>
    );
  } else {
    height = 108;
    body = (
      <>
        <path d={`M14 30H${120 - BOX / 2}M${120 + BOX / 2} 30H232M86 30V70M154 30V70`} />
        <path d="M36 30H58" /><Head x={62} y={30} to="r" />
        <Across x={120} y={30} name="R" />
        <Dot x={86} y={30} />
        <Dot x={154} y={30} />
        <Pin x={14} y={30} />
        <Pin x={232} y={30} />
        <Pin x={86} y={72} />
        <Pin x={154} y={72} />
      </>
    );
    texts = (
      <>
        <Label x={8} y={48}>{named('I', q.amps)}</Label>
        <Label x={238} y={48} anchor="end">load</Label>
        <Label x={120} y={92} anchor="middle" target>{named('Vsense', q.target)}</Label>
      </>
    );
  }

  return (
    <svg className={css.schematic} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Schematic of the circuit">
      <g fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">{body}</g>
      {texts}
    </svg>
  );
}
