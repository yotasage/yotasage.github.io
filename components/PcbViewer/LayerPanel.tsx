import React from 'react';

import { KIND_OPTIONS, layerTitle, SIDE_OPTIONS } from '../../lib/pcb/identify';
import { Layer, LayerKind, Side } from '../../lib/pcb/model';
import type { LayerStyle } from '../../lib/pcb/render/view';
import styles from '../../styles/PcbViewer.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import { Field, Select } from '../QrGen/fields';

const IDENTIFIED: Record<string, string> = {
  x2: 'the X2 file function in the file',
  job: 'the Gerber job file',
  name: 'the file name',
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
}

function count(n: number): string {
  return n.toLocaleString('en-US');
}

function Details({ layer, style, index, total, actions }: { layer: Layer; style: LayerStyle; index: number; total: number; actions: LayerActions }) {
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
      <p className={styles.detailNote}>
        Type and side from {IDENTIFIED[layer.identifiedBy ?? 'none']}{layer.identifiedBy === 'x2' && fn ? ` (${fn})` : ''}.
        {' '}{count(layer.items.length)} objects, {count(layer.apertures.length)} apertures{layer.negative ? ', negative image' : ''}.
        {negativeFile && ' The file draws where the material is not, so what is shown are the openings.'}
        {software && ` Made by ${software.split(',').join(' ')}.`}
      </p>
      <p className={styles.detailNote} title={layer.file}>{layer.file}</p>
    </div>
  );
}

export default function LayerPanel({ layers, styles: layerStyles, actions }: {
  // In list order: the top of the list is drawn on top.
  layers: Layer[];
  styles: Map<string, LayerStyle>;
  actions: LayerActions;
}) {
  const [open, setOpen] = React.useState<string | null>(null);
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
          return (
            <li key={layer.id} className={[styles.layerItem, style.visible ? '' : styles.layerHidden].join(' ')}>
              <div className={styles.layerRow}>
                <input type="checkbox" checked={style.visible} aria-label={`Show ${title}`} onChange={() => actions.toggle(layer.id)} />
                <span className={styles.swatch} style={{ background: style.color }}>
                  <input type="color" value={style.color} aria-label={`Colour of ${title}`} onChange={(e) => actions.color(layer.id, e.target.value)} />
                </span>
                <button type="button" className={styles.layerText} onClick={() => actions.toggle(layer.id)} title={`${title}: ${layer.file}`}>
                  <span className={styles.layerTitle}>{title}</span>
                  <span className={styles.layerFile}>{layer.name}</span>
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
              {expanded && <Details layer={layer} style={style} index={i} total={layers.length} actions={actions} />}
            </li>
          );
        })}
      </ul>
    </>
  );
}
