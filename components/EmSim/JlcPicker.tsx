// Every JLCPCB stackup template (M1.8c): an inline panel under the Stackup section's tools that loads the list on first
// open (jlcData.ts), filters it by layer count, thickness, outer and inner copper and offer (withdrawn ones hidden
// unless asked for) and lists the matches with the hand presets first (jlcSort). A row is a button: Enter, Space, a
// click or a tap chooses it; Escape closes the panel and gives the focus back to the button that opened it.

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { PRESET_KEYS } from '../../lib/emsim/presets';
import { jlcFilter, jlcKey, jlcPressed, jlcSort, jlcTarget, jlcValues } from '../../lib/emsim/jlcpcb';
import type { JlcData, JlcEntry, JlcField, JlcFilter } from '../../lib/emsim/jlcpcb';
import type { LengthUnit } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimStackup.module.css';
import { errorText, jlcLoaded, loadJlc } from './jlcData';
import { lenText } from './format';

type Menu = 'layers' | 'thickness' | 'outer' | 'inner' | 'offer';
type Choice = Record<Menu, string> & { withdrawn: boolean };

const ANY: Choice = { layers: '', thickness: '', outer: '', inner: '', offer: '', withdrawn: false };
let kept: Choice = ANY; // the filter outlives the panel for this visit

const HAND = new Set(Object.values(PRESET_KEYS));
const oz = (x: number) => (x === 0.5 ? '½ oz' : `${x} oz`);
const LABEL: Record<Menu, string> = { layers: 'Layers', thickness: 'Thickness', outer: 'Outer copper', inner: 'Inner copper', offer: 'Offer' };

// '' any; otherwise the value's text ('none' for null / no offer).
const asText = (x: string | number | null) => (x === null ? 'none' : String(x));
function shown(m: Menu, x: string): string {
  if (m === 'layers') return x;
  if (m === 'thickness') return `${x} mm`;
  if (m === 'offer') return x === 'none' ? 'not named' : x;
  if (x === 'none') return m === 'inner' ? 'none (2 layers)' : x;
  return oz(Number(x));
}

function toFilter(c: Choice, leave?: Menu): JlcFilter {
  const f: JlcFilter = { board: 'rigid' };
  const num = (m: Menu) => (m !== leave && c[m] !== '' ? Number(c[m]) : undefined);
  f.layers = num('layers');
  f.thickness = num('thickness');
  f.outer = num('outer');
  if (leave !== 'inner' && c.inner !== '') f.inner = c.inner === 'none' ? null : Number(c.inner);
  if (leave !== 'offer' && c.offer !== '') f.offer = c.offer as JlcFilter['offer'];
  if (!c.withdrawn) f.withdrawn = false;
  return f;
}

function Row({ e, current, unit, digits, onPick }: { e: JlcEntry; current: boolean; unit: LengthUnit; digits: number; onPick: (e: JlcEntry) => void }) {
  const k = jlcKey(e);
  const { t, tol, stated } = jlcTarget(e);
  const pressed = jlcPressed(e);
  const off = Math.abs(pressed - e.thickness) > tol + 1e-9;
  const tolShown = e.tol ? ('rel' in e.tol ? `±${Math.round(e.tol.rel * 1000) / 10} %` : `±${lenText(e.tol.abs, unit, digits)}`) : '';
  return (
    <li>
      <button type="button" className={css.jlcRow} data-jlc-key={k} aria-current={current ? 'true' : undefined} onClick={() => onPick(e)}>
        <span className={css.jlcName}>
          {e.id}
          {HAND.has(k) && <span className={css.edited}>quick preset</span>}
          {e.noReq && <span className={css.jlcTag} title="The stackup JLCPCB uses when you choose “No requirement”">No requirement</span>}
          {e.offer && <span className={css.jlcTag} data-offer={e.offer}>{e.offer}</span>}
        </span>
        <span className={css.jlcMeta}>
          {e.layers} layers · {oz(e.outer)} outer{e.inner !== null && <>, {oz(e.inner)} inner</>} ·{' '}
          {stated ? <>finished {lenText(t, unit, digits)}{tolShown && ` ${tolShown}`}</> : <>nominal {lenText(t, unit, digits)}</>}
          {off && <span className={css.jlcOff}> · pressed {lenText(pressed, unit, digits)}</span>}
          {e.note && <> · {e.note}</>}
        </span>
      </button>
    </li>
  );
}

interface Props {
  current: string; // the shown stackup's id
  unit: LengthUnit;
  digits: number;
  onPick: (e: JlcEntry, data: JlcData) => void;
  onClose: () => void;
  onLoaded: (data: JlcData) => void;
}

export default function JlcPicker({ current, unit, digits, onPick, onClose, onLoaded }: Props) {
  const [data, setData] = useState<JlcData | null>(jlcLoaded());
  const [error, setError] = useState('');
  const [c, setC] = useState<Choice>(kept);
  const first = useRef<HTMLSelectElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    if (!data) {
      loadJlc().then((d) => { if (live) { setData(d); onLoaded(d); } }, (e) => { if (live) setError(errorText(e)); });
    }
    return () => { live = false; };
  }, [data, onLoaded]);
  useEffect(() => { if (data) first.current?.focus(); else panel.current?.focus(); }, [data]);
  useEffect(() => { kept = c; }, [c]);

  const rigid = useMemo(() => (data ? jlcFilter(data.stackups, { board: 'rigid' }) : []), [data]);
  const menus = useMemo(() => {
    const out = {} as Record<Menu, string[]>;
    for (const m of Object.keys(LABEL) as Menu[]) {
      const vals = jlcValues(jlcFilter(rigid, toFilter(c, m)), m as JlcField).map(asText);
      if (c[m] && !vals.includes(c[m])) vals.push(c[m]);
      out[m] = vals;
    }
    return out;
  }, [rigid, c]);
  const list = useMemo(() => jlcSort(jlcFilter(rigid, toFilter(c))), [rigid, c]);

  const set = (m: Menu, v: string) => setC((x) => ({ ...x, [m]: v }));
  return (
    <div
      ref={panel}
      className={`${base.notice} ${css.jlcPanel}`}
      role="region"
      aria-labelledby="jlc-h"
      tabIndex={-1}
      data-jlc-picker
      data-loaded={!!data}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } }}
    >
      <div className={css.jlcHead}>
        <h3 id="jlc-h" className={base.h3}>All JLCPCB stackups</h3>
        <button type="button" className={base.button} onClick={onClose} data-jlc-close>Close</button>
      </div>
      {!data && !error && <p className={css.layerNote} role="status" data-jlc-loading>Loading JLCPCB’s stackup list (about 50 kB)…</p>}
      {error && <p className={css.reason} role="alert" data-jlc-error>JLCPCB’s stackup list could not be loaded: {error}. Close and open the list to try again.</p>}
      {data && (
        <>
          <p className={css.layerNote}>
            The impedance templates JLCPCB lists, read {data.fetched.to}: thicknesses as pressed and εr from its calculator. A
            board thickness is nominal; the finished thickness and its tolerance are JLCPCB’s, and the pressed sum is shown
            where it is off the nominal by more than that.
          </p>
          <div className={css.jlcFilters}>
            {(Object.keys(LABEL) as Menu[]).map((m, i) => (
              <label key={m} className={css.toolLabel}>
                {LABEL[m]}
                <select ref={i === 0 ? first : undefined} className={base.select} data-jlc-filter={m} value={c[m]} onChange={(e) => set(m, e.target.value)}>
                  <option value="">Any</option>
                  {menus[m].map((v) => <option key={v} value={v}>{shown(m, v)}</option>)}
                </select>
              </label>
            ))}
            <label className={css.jlcCheck}>
              <input type="checkbox" checked={c.withdrawn} data-jlc-withdrawn onChange={(e) => setC((x) => ({ ...x, withdrawn: e.target.checked }))} />
              Show withdrawn
            </label>
            <button type="button" className={base.button} onClick={() => setC(ANY)} disabled={JSON.stringify(c) === JSON.stringify(ANY)} data-jlc-reset>Clear filters</button>
          </div>
          <p className={css.layerNote} aria-live="polite" data-jlc-count={list.length}>{list.length} stackup{list.length === 1 ? '' : 's'}</p>
          <ul className={css.jlcList} aria-label="Matching stackups">
            {list.map((e) => <Row key={jlcKey(e)} e={e} current={jlcKey(e) === current} unit={unit} digits={digits} onPick={(x) => onPick(x, data)} />)}
          </ul>
        </>
      )}
    </div>
  );
}
