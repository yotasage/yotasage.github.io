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
import { useI18n } from '../../lib/ui/i18n';
import type { TFunc } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import { errorText, jlcLoaded, loadJlc } from './jlcData';
import Calm from './Calm';
import { lenText } from './format';
import { Whys } from './Why';

type Menu = 'layers' | 'thickness' | 'outer' | 'inner' | 'offer';
type Choice = Record<Menu, string> & { withdrawn: boolean };

const ANY: Choice = { layers: '', thickness: '', outer: '', inner: '', offer: '', withdrawn: false };
let kept: Choice = ANY; // the filter outlives the panel for this visit

const HAND = new Set(Object.values(PRESET_KEYS));
const oz = (x: number) => (x === 0.5 ? '½ oz' : `${x} oz`);
const MENUS: readonly Menu[] = ['layers', 'thickness', 'outer', 'inner', 'offer'];

// '' any; otherwise the value's text ('none' for null / no offer).
const asText = (x: string | number | null) => (x === null ? 'none' : String(x));
function shown(m: Menu, x: string, t: TFunc): string {
  if (m === 'layers') return x;
  if (m === 'thickness') return `${x} mm`;
  if (m === 'offer') return x === 'none' ? t('em.jlc.notNamed') : x;
  if (x === 'none') return m === 'inner' ? t('em.jlc.none2l') : x;
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
  const { t: tr } = useI18n();
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
          {HAND.has(k) && <span className={css.edited}>{tr('em.jlc.quickPreset')}</span>}
          {e.noReq && <span className={css.jlcTag} title={tr('em.jlc.noReqTitle')}>{tr('em.jlc.noReq')}</span>}
          {e.offer && <span className={css.jlcTag} data-offer={e.offer}>{e.offer}</span>}
        </span>
        <span className={css.jlcMeta}>
          {tr('em.jlc.rowMeta', { layers: e.layers, outer: oz(e.outer) })}{e.inner !== null && <>{tr('em.jlc.rowInner', { inner: oz(e.inner) })}</>} ·{' '}
          {stated ? <>{tr('em.jlc.finished', { val: lenText(t, unit, digits) })}{tolShown && ` ${tolShown}`}</> : <>{tr('em.jlc.nominal', { val: lenText(t, unit, digits) })}</>}
          {off && <span className={css.jlcOff}>{tr('em.jlc.pressed', { val: lenText(pressed, unit, digits) })}</span>}
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
  const { t } = useI18n();
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
    for (const m of MENUS) {
      const vals = jlcValues(jlcFilter(rigid, toFilter(c, m)), m as JlcField).map(asText);
      if (c[m] && !vals.includes(c[m])) vals.push(c[m]);
      out[m] = vals;
    }
    return out;
  }, [rigid, c]);
  const list = useMemo(() => jlcSort(jlcFilter(rigid, toFilter(c))), [rigid, c]);
  const countText = list.length === 1 ? t('em.jlc.countOne') : t('em.jlc.countMany', { n: list.length });

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
        <h3 id="jlc-h" className={base.h3}>{t('em.jlc.title')}</h3>
        <button type="button" className={base.button} onClick={onClose} data-jlc-close>{t('em.jlc.close')}</button>
      </div>
      {!data && !error && <p className={css.layerNote} role="status" data-jlc-loading>{t('em.jlc.loading')}</p>}
      {error && <p className={css.reason} role="alert" data-jlc-error>{t('em.jlc.error', { error })}</p>}
      {data && (
        <>
          <p className={css.layerNote}>{t('em.jlc.note', { date: data.fetched.to })}</p>
          <div className={css.jlcFilters}>
            {MENUS.map((m, i) => (
              <label key={m} className={css.toolLabel}>
                {t(`em.jlc.filter.${m}` as TranslationKey)}
                <select ref={i === 0 ? first : undefined} className={base.select} data-jlc-filter={m} value={c[m]} onChange={(e) => set(m, e.target.value)}>
                  <option value="">{t('em.jlc.any')}</option>
                  {menus[m].map((v) => <option key={v} value={v}>{shown(m, v, t)}</option>)}
                </select>
              </label>
            ))}
            <label className={css.jlcCheck}>
              <input type="checkbox" checked={c.withdrawn} data-jlc-withdrawn onChange={(e) => setC((x) => ({ ...x, withdrawn: e.target.checked }))} />
              {t('em.jlc.showWithdrawn')}
            </label>
            <button type="button" className={base.button} onClick={() => setC(ANY)} disabled={JSON.stringify(c) === JSON.stringify(ANY)} data-jlc-reset>{t('em.jlc.clearFilters')}</button>
          </div>
          <Whys ks="jlc-filter jlc-withdrawn jlc-row" />
          <p className={css.layerNote} data-jlc-count={list.length}>{countText}</p>
          <Calm text={countText} name="jlc-count" />
          <ul className={css.jlcList} aria-label={t('em.jlc.matchingAria')}>
            {list.map((e) => <Row key={jlcKey(e)} e={e} current={jlcKey(e) === current} unit={unit} digits={digits} onPick={(x) => onPick(x, data)} />)}
          </ul>
        </>
      )}
    </div>
  );
}
