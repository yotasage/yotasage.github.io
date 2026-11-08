import React from 'react';

import { describeFormat, DrillFormat, DrillUnits, DrillZeros } from '../../lib/pcb/excellon';
import { KIND_OPTIONS, layerTitle, SIDE_OPTIONS } from '../../lib/pcb/identify';
import type { LoadedFile } from '../../lib/pcb/load';
import { Layer, LayerKind, Side } from '../../lib/pcb/model';
import type { LayerStyle } from '../../lib/pcb/render/view';
import styles from '../../styles/PcbViewer.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import { Field, Select } from '../QrGen/fields';

const IDENTIFIED: Record<string, string> = {
  x2: 'the X2 file function in the file',
  job: 'the Gerber job file',
  name: 'the file name',
  format: 'the file format',
  user: 'your choice',
  none: 'nothing: the file does not say',
};

export interface LayerActions {
  toggle: (id: string) => void;
  color: (id: string, color: string) => void;
  opacity: (id: string, opacity: number) => void;
  move: (id: string, by: number) => void;
  type: (id: string, kind: LayerKind, side: Side) => void;
  only: (id: string) => void;
  showSet: (which: 'all' | 'none' | 'top' | 'bottom') => void;
  // A format for an Excellon file, or null to go back to the file's (or the guess).
  drillFormat: (id: string, format: DrillFormat | null) => void;
}

function count(n: number): string {
  return n.toLocaleString('en-US');
}

const FROM_TEXT = { file: 'as the file states it', guess: 'guessed: the file does not state it', user: 'your choice' };

// The format of an Excellon file: where it came from, and fields to correct units, zeros and digits.
function DrillFormatFields({ file, actions, id }: { file: LoadedFile; actions: LayerActions; id: string }) {
  const s = file.drillState;
  const p = file.drill;
  if (!s || !p) return null;
  const f = s.format;
  const set = (change: Partial<DrillFormat>) => actions.drillFormat(id, { ...f, ...change });
  const digits = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), String(from + i)] as [string, string]);
  return (
    <div className={styles.drillFormat}>
      <p className={s.from === 'guess' ? qrStyles.warning : styles.detailNote}>
        Format: {describeFormat(f, p)}, {FROM_TEXT[s.from]}
        {s.from === 'guess' && s.onPads !== undefined && ` (${Math.round(s.onPads * 100)}% of the holes land on pads)`}. {count(s.holes)} holes.
        {s.from === 'guess' && ' If the holes do not land on the pads, correct it here.'}
      </p>
      <div className={styles.detailFields}>
        <Field label="Units">
          <Select<DrillUnits> value={f.units} onChange={(units) => set({ units })} options={[['mm', 'Millimetres'], ['inch', 'Inches']]} />
        </Field>
        {!p.allDecimal && (
          <>
            <Field label="Zeros left out">
              <Select<DrillZeros> value={f.zeros} onChange={(zeros) => set({ zeros })} options={[['leading', 'Leading (TZ)'], ['trailing', 'Trailing (LZ)']]} />
            </Field>
            <Field label="Integer digits">
              <Select<string> value={String(f.int)} onChange={(v) => set({ int: Number(v) })} options={digits(1, 6)} />
            </Field>
            <Field label="Decimal digits">
              <Select<string> value={String(f.dec)} onChange={(v) => set({ dec: Number(v) })} options={digits(1, 7)} />
            </Field>
          </>
        )}
      </div>
      {s.from === 'user' && (
        <div className={qrStyles.buttonRow} style={{ marginTop: 0 }}>
          <button type="button" className={qrStyles.buttonSmall} onClick={() => actions.drillFormat(id, null)}>Use the file&apos;s format</button>
        </div>
      )}
    </div>
  );
}

function Details({ layer, style, index, total, actions, file }: { layer: Layer; style: LayerStyle; index: number; total: number; actions: LayerActions; file?: LoadedFile }) {
  const fn = layer.attrs?.['.FileFunction'];
  const software = layer.attrs?.['.GenerationSoftware'];
  // X2 says a file is negative when it draws where the material is not, as the openings of a solder mask.
  const negativeFile = /^negative$/i.test(layer.attrs?.['.FilePolarity'] ?? '');
  return (
    <div className={styles.layerDetails}>
      <div className={styles.detailFields}>
        <Field label="Type">
          <Select<LayerKind> value={layer.kind} onChange={(kind) => actions.type(layer.id, kind, layer.side)} options={KIND_OPTIONS} />
        </Field>
        <Field label="Side">
          <Select<Side> value={layer.side} onChange={(side) => actions.type(layer.id, layer.kind, side)} options={SIDE_OPTIONS} />
        </Field>
      </div>
      <label className={styles.slider}>
        <span>Opacity: {Math.round(style.opacity * 100)}%</span>
        <input type="range" min={10} max={100} value={Math.round(style.opacity * 100)} onChange={(e) => actions.opacity(layer.id, Number(e.target.value) / 100)} />
      </label>
      <div className={qrStyles.buttonRow} style={{ marginTop: 0 }}>
        <button type="button" className={qrStyles.buttonSmall} disabled={index === 0} onClick={() => actions.move(layer.id, -1)}>Move up</button>
        <button type="button" className={qrStyles.buttonSmall} disabled={index === total - 1} onClick={() => actions.move(layer.id, 1)}>Move down</button>
        <button type="button" className={qrStyles.buttonSmall} onClick={() => actions.only(layer.id)}>Show only this</button>
      </div>
      {file?.drill && <DrillFormatFields file={file} actions={actions} id={layer.id} />}
      <p className={styles.detailNote}>
        Type and side from {IDENTIFIED[layer.identifiedBy ?? 'none']}{layer.identifiedBy === 'x2' && fn ? ` (${fn})` : ''}.
        {' '}{count(layer.items.length)} objects{layer.apertures.length ? `, ${count(layer.apertures.length)} apertures` : ''}{layer.negative ? ', negative image' : ''}.
        {negativeFile && ' The file draws where the material is not, so what is shown are the openings.'}
        {software && ` Made by ${software.split(',').join(' ')}.`}
      </p>
      <p className={styles.detailNote} title={layer.file}>{layer.file}</p>
    </div>
  );
}

export default function LayerPanel({ layers, styles: layerStyles, actions, files }: {
  // In list order: the top of the list is drawn on top.
  layers: Layer[];
  styles: Map<string, LayerStyle>;
  actions: LayerActions;
  // The files the layers come from (for the format of drill files).
  files: LoadedFile[];
}) {
  const [open, setOpen] = React.useState<string | null>(null);
  const byPath = React.useMemo(() => new Map(files.map((f) => [f.source.path, f])), [files]);
  return (
    <>
      <div className={styles.layerActions}>
        <button type="button" className={qrStyles.buttonSmall} onClick={() => actions.showSet('all')}>All</button>
        <button type="button" className={qrStyles.buttonSmall} onClick={() => actions.showSet('none')}>None</button>
        <button type="button" className={qrStyles.buttonSmall} onClick={() => actions.showSet('top')}>Top side</button>
        <button type="button" className={qrStyles.buttonSmall} onClick={() => actions.showSet('bottom')}>Bottom side</button>
      </div>
      <ul className={styles.layerList} aria-label="Layers">
        {layers.map((layer, i) => {
          const style = layerStyles.get(layer.id);
          if (!style) return null;
          const title = layerTitle(layer);
          const expanded = open === layer.id;
          const file = byPath.get(layer.id);
          const guessed = file?.drillState?.from === 'guess';
          return (
            <li key={layer.id} className={[styles.layerItem, style.visible ? '' : styles.layerHidden].join(' ')}>
              <div className={styles.layerRow}>
                <input type="checkbox" checked={style.visible} aria-label={`Show ${title}`} onChange={() => actions.toggle(layer.id)} />
                <span className={styles.swatch} style={{ background: style.color }}>
                  <input type="color" value={style.color} aria-label={`Colour of ${title}`} onChange={(e) => actions.color(layer.id, e.target.value)} />
                </span>
                <button type="button" className={styles.layerText} onClick={() => actions.toggle(layer.id)} title={`${title}: ${layer.file}`}>
                  <span className={styles.layerTitle}>{title}</span>
                  <span className={styles.layerFile}>{layer.name}{guessed && <span className={styles.guessBadge}> · format guessed</span>}</span>
                </button>
                <button
                  type="button"
                  className={styles.expandButton}
                  aria-expanded={expanded}
                  aria-label={expanded ? `Close the settings of ${title}` : `Settings of ${title}`}
                  onClick={() => setOpen(expanded ? null : layer.id)}
                >
                  {expanded ? '▴' : '▾'}
                </button>
              </div>
              {expanded && <Details layer={layer} style={style} index={i} total={layers.length} actions={actions} file={file} />}
            </li>
          );
        })}
      </ul>
    </>
  );
}
