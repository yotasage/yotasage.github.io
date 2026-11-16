// The general arrangement's editor in the Trace section (M2.1d): add a trace (up to MAX_SIGNALS) or a coplanar ground on
// a chosen copper layer, remove the selected one, and each trace (layer, position of its base centre, base width) and
// ground (layer, left and right base edge, empty for "to the edge") as a row of typed fields. The selected row is the
// one highlighted in the drawing; a tap there selects too. Every change is an ordinary commit (one undo step).

import React, { useState } from 'react';

import type { Stackup, Val } from '../../lib/emsim/stackup';
import { MAX_SIGNALS } from '../../lib/emsim/structure';
import type { GenGround, GenSignal, Structure } from '../../lib/emsim/structure';
import type { LengthUnit } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import stk from '../../styles/EmSimStackup.module.css';
import css from '../../styles/EmSimTrace.module.css';
import { addGround, addSignal, removeFeature } from './trace';
import type { CopperChoice, GenSel } from './trace';
import ValField from './ValField';
import { Whys } from './Why';

interface Props {
  s: Stackup;
  st: Structure;
  unit: LengthUnit;
  digits: number;
  coppers: CopperChoice[];
  sel: GenSel | null;
  onSelect: (sel: GenSel | null) => void;
  setTrace: (f: (t: Structure) => Structure | null, group?: string) => void;
}

export default function GeneralEditor({ s, st, unit, digits, coppers, sel, onSelect, setTrace }: Props) {
  const [msg, setMsg] = useState('');
  const [pick, setPick] = useState('');
  const selLayer = sel ? (sel.startsWith('sig') ? st.signals[Number(sel.slice(4))] : st.grounds[Number(sel.slice(4))])?.layer : undefined;
  const layer = coppers.some((c) => c.id === pick) ? pick : selLayer ?? st.signals[0]?.layer ?? coppers[0]?.id ?? '';
  const done = (r: { st: Structure } | { reason: string }, next: (t: Structure) => GenSel | null) => {
    if ('reason' in r) { setMsg(r.reason); return; }
    setMsg('');
    setTrace(() => r.st);
    onSelect(next(r.st));
  };
  const setSig = (i: number, f: (g: GenSignal) => GenSignal, group: string) =>
    setTrace((t) => {
      if (!t.signals[i]) return null;
      const signals = t.signals.slice();
      signals[i] = f(signals[i]);
      return { ...t, signals, layer: signals[0].layer };
    }, group);
  const setGnd = (i: number, f: (g: GenGround) => GenGround, group: string) =>
    setTrace((t) => {
      if (!t.grounds[i]) return null;
      const grounds = t.grounds.slice();
      grounds[i] = f(grounds[i]);
      return { ...t, grounds };
    }, group);
  const layerSelect = (value: string, onChange: (v: string) => void, attr: Record<string, string>, label: string) => (
    <label className={css.ctl}>
      {label}
      <select className={base.select} value={value} onChange={(e) => onChange(e.target.value)} {...attr}>
        {coppers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );
  const row = (key: GenSel, title: string, body: React.ReactNode) => (
    <li
      key={key}
      className={css.genRow}
      data-gen-row={key}
      data-selected={sel === key}
      onFocusCapture={() => onSelect(key)}
      onPointerDown={() => onSelect(key)}
    >
      <button type="button" className={css.genPick} aria-pressed={sel === key} data-gen-select={key} onClick={() => onSelect(key)}>{title}</button>
      {body}
    </li>
  );

  return (
    <div className={css.gen} data-gen-editor>
      <div className={css.genTools}>
        {layerSelect(layer, setPick, { 'data-gen-layer': '' }, 'On layer')}
        <button type="button" className={base.button} data-gen-add="signal" aria-disabled={st.signals.length >= MAX_SIGNALS} onClick={() => done(addSignal(s, st, layer), (t) => `sig.${t.signals.length - 1}`)}>Add trace</button>
        <button type="button" className={base.button} data-gen-add="ground" onClick={() => done(addGround(s, st, layer), (t) => `gnd.${t.grounds.length - 1}`)}>Add ground</button>
        <button type="button" className={base.button} data-gen-remove disabled={!sel} onClick={() => sel && done(removeFeature(st, sel), () => null)}>Remove {sel ? (sel.startsWith('sig') ? `trace ${Number(sel.slice(4)) + 1}` : `ground ${Number(sel.slice(4)) + 1}`) : 'selected'}</button>
      </div>
      <Whys ks="gen-layer gen-add gen-remove" />
      {msg && <p className={css.refused} role="alert" data-gen-refused>{msg}</p>}
      <ol className={css.genList}>
        {st.signals.map((g, i) => row(`sig.${i}`, `Trace ${i + 1}`, (
          <div className={stk.fields}>
            {layerSelect(g.layer, (v) => setSig(i, (x) => ({ ...x, layer: v }), ''), { 'data-gen-row-layer': `sig.${i}` }, 'Layer')}
            <ValField name={`gen.sig.${i}.u`} label="Position (centre)" x={g.u} unit={unit} digits={digits} zero negative onChange={(x: Val | null, part) => { if (x) setSig(i, (y) => ({ ...y, u: x }), `gen.sig.${i}.u.${part}`); }} />
            <ValField name={`gen.sig.${i}.w`} label="Width" x={g.w} unit={unit} digits={digits} onChange={(x: Val | null, part) => { if (x) setSig(i, (y) => ({ ...y, w: x }), `gen.sig.${i}.w.${part}`); }} />
          </div>
        )))}
        {st.grounds.map((g, i) => row(`gnd.${i}`, `Ground ${i + 1}`, (
          <div className={stk.fields}>
            {layerSelect(g.layer, (v) => setGnd(i, (x) => ({ ...x, layer: v }), ''), { 'data-gen-row-layer': `gnd.${i}` }, 'Layer')}
            <ValField name={`gen.gnd.${i}.a`} label="Left edge" x={g.a} unit={unit} digits={digits} zero negative nullable placeholder="to the edge" onChange={(x, part) => setGnd(i, (y) => ({ ...y, a: x }), `gen.gnd.${i}.a.${part}`)} />
            <ValField name={`gen.gnd.${i}.b`} label="Right edge" x={g.b} unit={unit} digits={digits} zero negative nullable placeholder="to the edge" onChange={(x, part) => setGnd(i, (y) => ({ ...y, b: x }), `gen.gnd.${i}.b.${part}`)} />
          </div>
        )))}
      </ol>
      <Whys ks="gen-position width gen-edges" />
      <p className={css.small}>
        Positions are the base centres across, 0 in the middle; widths and edges at the base. Grounds are connected to the
        planes; an empty edge runs to the edge of the board. Select a row or tap a conductor in the drawing to highlight it.
      </p>
    </div>
  );
}
