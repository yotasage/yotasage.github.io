import React from 'react';

import type { LoadedFile } from '../../lib/pcb/load';
import { COLUMN_NAMES, defaultMapping, PnpColumn, PnpMapping, PnpUnits } from '../../lib/pcb/pnp';
import styles from '../../styles/PcbViewer.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import { Checkbox, Field, NumberInput, Select } from '../QrGen/fields';

const FROM_TEXT = {
  file: 'as the file gives them',
  guess: 'as they fit the pads best',
  user: 'with your settings',
};

const COLUMNS: PnpColumn[] = ['ref', 'x', 'y', 'rot', 'side', 'value', 'footprint'];

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

// One pick-and-place file: what it is, how it is read, and fields to choose its columns, units, sides and offset.
function PlacementFile({ file, onChange }: { file: LoadedFile; onChange: (mapping: PnpMapping | null) => void }) {
  const t = file.pnp;
  const st = file.pnpState;
  if (!t || !st) return null;
  const m = st.mapping;
  const set = (change: Partial<PnpMapping>) => onChange({ ...m, ...change });
  const setColumn = (col: PnpColumn, value: string) => {
    const columns = { ...m.columns };
    if (value === '') delete columns[col];
    else columns[col] = Number(value);
    set({ columns, ...(col === 'side' ? { side: value === '' ? 'top' : 'column' } : {}) });
  };
  const options: [string, string][] = t.header.map((h, i) => [String(i), h || `Column ${i + 1}`]);
  const optional = (col: PnpColumn) => col === 'value' || col === 'footprint' || col === 'rot';
  return (
    <div className={styles.pnpFile}>
      <p className={styles.boardName} title={file.source.path}>{file.source.name}</p>
      <p className={st.from === 'guess' ? qrStyles.warning : styles.detailNote}>
        {t.format}: {st.parts.toLocaleString('en-US')} parts, placed {FROM_TEXT[st.from]}
        {st.change ? ` (${st.change})` : ''}
        {st.onPads !== undefined ? `; ${percent(st.onPads)} lie on pads of their side` : ''}.
        {st.skipped ? ` ${st.skipped} rows without a designator or position are left out.` : ''}
      </p>
      <details className={styles.pnpDetails}>
        <summary>Columns, units and position</summary>
        <div className={styles.detailFields}>
          {COLUMNS.map((col) => {
            const value = col === 'side' && m.side !== 'column' ? `side:${m.side}` : m.columns[col] !== undefined ? String(m.columns[col]) : '';
            const extra: [string, string][] = col === 'side' ? [['side:top', 'All on the top'], ['side:bottom', 'All on the bottom']] : optional(col) ? [['', 'None']] : [];
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
          <Field label="Units">
            <Select<PnpUnits> value={m.units} onChange={(units) => set({ units })} options={[['mm', 'Millimetres'], ['mil', 'Mils'], ['in', 'Inches']]} />
          </Field>
          <Field label="Bottom angles">
            <Select<PnpMapping['bottomAngles']>
              value={m.bottomAngles}
              onChange={(bottomAngles) => set({ bottomAngles })}
              options={[['kicad', 'As KiCad and Altium give them'], ['mirrored', 'As EAGLE and Fusion give them']]}
            />
          </Field>
          <Field label="Offset X (mm)">
            <NumberInput value={m.offset.x} onChange={(x) => set({ offset: { ...m.offset, x } })} min={-10000} max={10000} step="any" />
          </Field>
          <Field label="Offset Y (mm)">
            <NumberInput value={m.offset.y} onChange={(y) => set({ offset: { ...m.offset, y } })} min={-10000} max={10000} step="any" />
          </Field>
        </div>
        <Checkbox label="The file gives bottom parts with X negated" checked={m.negateBottomX} onChange={(negateBottomX) => set({ negateBottomX })} />
        {st.from === 'user' && (
          <div className={qrStyles.buttonRow}>
            <button type="button" className={qrStyles.buttonSmall} onClick={() => onChange(null)}>Read it as found at first</button>
          </div>
        )}
        <p className={styles.detailNote}>
          {`The file's own reading: ${COLUMNS.filter((c) => t.found[c] !== undefined).map((c) => `${COLUMN_NAMES[c].toLowerCase()} from “${t.header[t.found[c]]}”`).join(', ') || 'no columns found by name'}`}
          {`, ${t.units ? `in ${t.units === 'in' ? 'inches' : t.units}` : 'units not given (mm assumed)'}`}
          {t.side ? `, all parts on the ${t.side} (from the file name)` : ''}.
          {defaultMapping(t).bottomAngles === 'mirrored' ? ' EAGLE and Fusion give a bottom part the angle of its package before it is mirrored; the markers show it as KiCad does.' : ''}
        </p>
      </details>
    </div>
  );
}

// The pick-and-place files laid over a Gerber set: each file, how it is read, and its settings.
export default function PlacementCard({ files, onChange }: { files: LoadedFile[]; onChange: (path: string, mapping: PnpMapping | null) => void }) {
  const list = files.filter((f) => f.pnp && f.pnpState);
  return (
    <>
      <p className={qrStyles.help}>
        Each part is marked on the layer of its side (a ring, a stroke in the direction of its rotation, and its designator), and listed under Components. Click a
        marker to see the part; highlight it to see its pads where the Gerber files name them.
      </p>
      {list.map((f) => <PlacementFile key={f.source.path} file={f} onChange={(m) => onChange(f.source.path, m)} />)}
    </>
  );
}
