import React from 'react';

import type { LoadedFile } from '../../lib/pcb/load';
import { COLUMN_NAMES, defaultMapping, PnpColumn, PnpMapping, PnpUnits } from '../../lib/pcb/pnp';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PcbViewer.module.css';
import fieldStyles from '../../styles/Fields.module.css';
import { Checkbox, Field, NumberInput, Select } from '../UI/Fields';

const FROM_KEYS: Record<'file' | 'guess' | 'user', TranslationKey> = {
  file: 'pcb.pnp.fromFile',
  guess: 'pcb.pnp.fromGuess',
  user: 'pcb.pnp.fromUser',
};

const COLUMNS: PnpColumn[] = ['ref', 'x', 'y', 'rot', 'side', 'value', 'footprint'];

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

// One pick-and-place file: what it is, how it is read, and fields to choose its columns, units, sides and offset.
function PlacementFile({ file, onChange }: { file: LoadedFile; onChange: (mapping: PnpMapping | null) => void }) {
  const { t, locale } = useI18n();
  const tab = file.pnp;
  const st = file.pnpState;
  if (!tab || !st) return null;
  const m = st.mapping;
  const set = (change: Partial<PnpMapping>) => onChange({ ...m, ...change });
  const setColumn = (col: PnpColumn, value: string) => {
    const columns = { ...m.columns };
    if (value === '') delete columns[col];
    else columns[col] = Number(value);
    set({ columns, ...(col === 'side' ? { side: value === '' ? 'top' : 'column' } : {}) });
  };
  const options: [string, string][] = tab.header.map((h, i) => [String(i), h || t('pcb.pnp.colNum', { n: i + 1 })]);
  const optional = (col: PnpColumn) => col === 'value' || col === 'footprint' || col === 'rot';
  const foundCols = COLUMNS.filter((c) => tab.found[c] !== undefined)
    .map((c) => t('pcb.pnp.colFrom', { col: COLUMN_NAMES[c].toLowerCase(), hdr: tab.header[tab.found[c]] }))
    .join(', ');
  const unitsText = tab.units
    ? t('pcb.pnp.unitsIn', { u: tab.units === 'in' ? t('pcb.layer.inches').toLowerCase() : tab.units })
    : t('pcb.pnp.unitsAssumed');
  const sideText = tab.side
    ? t('pcb.pnp.allSide', { side: tab.side === 'bottom' ? t('pcb.ws.bottom').toLowerCase() : t('pcb.ws.top').toLowerCase() })
    : '';
  return (
    <div className={styles.pnpFile}>
      <p className={styles.boardName} title={file.source.path}>{file.source.name}</p>
      <p className={st.from === 'guess' ? fieldStyles.warning : styles.detailNote}>
        {t('pcb.pnp.summary', {
          fmt: tab.format,
          parts: st.parts.toLocaleString(locale === 'nb' ? 'nb-NO' : 'en-US'),
          from: t(FROM_KEYS[st.from]),
          change: st.change ? ` (${st.change})` : '',
          onPads: st.onPads !== undefined ? t('pcb.pnp.onPads', { pct: percent(st.onPads) }) : '',
          skipped: st.skipped ? t('pcb.pnp.skipped', { n: st.skipped }) : '',
        })}
      </p>
      <details className={styles.pnpDetails}>
        <summary>{t('pcb.pnp.details')}</summary>
        <div className={styles.detailFields}>
          {COLUMNS.map((col) => {
            const value = col === 'side' && m.side !== 'column' ? `side:${m.side}` : m.columns[col] !== undefined ? String(m.columns[col]) : '';
            const extra: [string, string][] = col === 'side'
              ? [['side:top', t('pcb.pnp.allTop')], ['side:bottom', t('pcb.pnp.allBottom')]]
              : optional(col)
                ? [['', t('pcb.pnp.none')]]
                : [];
            return (
              <Field key={col} label={COLUMN_NAMES[col]}>
                <Select<string>
                  value={value}
                  onChange={(v) => {
                    if (v.startsWith('side:')) {
                      const columns = { ...m.columns };
                      delete columns.side;
                      set({ columns, side: v.slice(5) as 'top' | 'bottom' });
                    } else setColumn(col, v);
                  }}
                  options={[...extra, ...options]}
                />
              </Field>
            );
          })}
          <Field label={t('pcb.layer.units')}>
            <Select<PnpUnits> value={m.units} onChange={(units) => set({ units })} options={[['mm', t('pcb.layer.mm')], ['mil', t('pcb.layer.mils')], ['in', t('pcb.layer.inches')]]} />
          </Field>
          <Field label={t('pcb.pnp.bottomAngles')}>
            <Select<PnpMapping['bottomAngles']>
              value={m.bottomAngles}
              onChange={(bottomAngles) => set({ bottomAngles })}
              options={[['kicad', t('pcb.pnp.angKicad')], ['mirrored', t('pcb.pnp.angMirrored')]]}
            />
          </Field>
          <Field label={t('pcb.pnp.offsetX')}>
            <NumberInput value={m.offset.x} onChange={(x) => set({ offset: { ...m.offset, x } })} min={-10000} max={10000} step="any" />
          </Field>
          <Field label={t('pcb.pnp.offsetY')}>
            <NumberInput value={m.offset.y} onChange={(y) => set({ offset: { ...m.offset, y } })} min={-10000} max={10000} step="any" />
          </Field>
        </div>
        <Checkbox label={t('pcb.pnp.negateX')} checked={m.negateBottomX} onChange={(negateBottomX) => set({ negateBottomX })} />
        {st.from === 'user' && (
          <div className={fieldStyles.buttonRow}>
            <button type="button" className={fieldStyles.buttonSmall} onClick={() => onChange(null)}>{t('pcb.pnp.reset')}</button>
          </div>
        )}
        <p className={styles.detailNote}>
          {t('pcb.pnp.ownReading', {
            cols: foundCols || t('pcb.pnp.noCols'),
            units: unitsText,
            side: sideText,
            eagleNote: defaultMapping(tab).bottomAngles === 'mirrored' ? t('pcb.pnp.eagleNote') : '',
          })}
        </p>
      </details>
    </div>
  );
}

// The pick-and-place files laid over a Gerber set: each file, how it is read, and its settings.
export default function PlacementCard({ files, onChange }: { files: LoadedFile[]; onChange: (path: string, mapping: PnpMapping | null) => void }) {
  const { t } = useI18n();
  const list = files.filter((f) => f.pnp && f.pnpState);
  return (
    <>
      <p className={fieldStyles.help}>{t('pcb.pnp.help')}</p>
      {list.map((f) => <PlacementFile key={f.source.path} file={f} onChange={(m) => onChange(f.source.path, m)} />)}
    </>
  );
}
