import React from 'react';

import { describeFormat, DrillFormat, DrillUnits, DrillZeros } from '../../lib/pcb/excellon';
import { KIND_OPTIONS, layerTitle, SIDE_OPTIONS } from '../../lib/pcb/identify';
import type { LoadedFile } from '../../lib/pcb/load';
import { Layer, LayerKind, Side } from '../../lib/pcb/model';
import type { LayerStyle } from '../../lib/pcb/render/view';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PcbViewer.module.css';
import fieldStyles from '../../styles/Fields.module.css';
import { Field, Select } from '../UI/Fields';

const IDENTIFIED_KEYS: Record<string, TranslationKey> = {
  x2: 'pcb.layer.idX2',
  job: 'pcb.layer.idJob',
  name: 'pcb.layer.idName',
  format: 'pcb.layer.idFormat',
  design: 'pcb.layer.idDesign',
  user: 'pcb.layer.idUser',
  none: 'pcb.layer.idNone',
};

const FROM_KEYS: Record<'file' | 'guess' | 'user', TranslationKey> = {
  file: 'pcb.layer.fromFile',
  guess: 'pcb.layer.fromGuess',
  user: 'pcb.layer.fromUser',
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

// The format of an Excellon file: where it came from, and fields to correct units, zeros and digits.
function DrillFormatFields({ file, actions, id }: { file: LoadedFile; actions: LayerActions; id: string }) {
  const { t, locale } = useI18n();
  const s = file.drillState;
  const p = file.drill;
  if (!s || !p) return null;
  const f = s.format;
  const count = (n: number) => n.toLocaleString(locale === 'nb' ? 'nb-NO' : 'en-US');
  const set = (change: Partial<DrillFormat>) => actions.drillFormat(id, { ...f, ...change });
  const digits = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), String(from + i)] as [string, string]);
  const onPads = s.from === 'guess' && s.onPads !== undefined ? t('pcb.layer.onPads', { pct: Math.round(s.onPads * 100) }) : '';
  const guessHint = s.from === 'guess' ? t('pcb.layer.guessHint') : '';
  return (
    <div className={styles.drillFormat}>
      <p className={s.from === 'guess' ? fieldStyles.warning : styles.detailNote}>
        {t('pcb.layer.formatLine', {
          fmt: describeFormat(f, p),
          from: t(FROM_KEYS[s.from]),
          onPads,
          holes: count(s.holes),
          guessHint,
        })}
      </p>
      <div className={styles.detailFields}>
        <Field label={t('pcb.layer.units')}>
          <Select<DrillUnits> value={f.units} onChange={(units) => set({ units })} options={[['mm', t('pcb.layer.mm')], ['inch', t('pcb.layer.inches')]]} />
        </Field>
        {!p.allDecimal && (
          <>
            <Field label={t('pcb.layer.zeros')}>
              <Select<DrillZeros> value={f.zeros} onChange={(zeros) => set({ zeros })} options={[['leading', t('pcb.layer.zerosLead')], ['trailing', t('pcb.layer.zerosTrail')]]} />
            </Field>
            <Field label={t('pcb.layer.intDigits')}>
              <Select<string> value={String(f.int)} onChange={(v) => set({ int: Number(v) })} options={digits(1, 6)} />
            </Field>
            <Field label={t('pcb.layer.decDigits')}>
              <Select<string> value={String(f.dec)} onChange={(v) => set({ dec: Number(v) })} options={digits(1, 7)} />
            </Field>
          </>
        )}
      </div>
      {s.from === 'user' && (
        <div className={fieldStyles.buttonRow} style={{ marginTop: 0 }}>
          <button type="button" className={fieldStyles.buttonSmall} onClick={() => actions.drillFormat(id, null)}>{t('pcb.layer.useFileFmt')}</button>
        </div>
      )}
    </div>
  );
}

function Details({ layer, style, index, total, actions, file }: { layer: Layer; style: LayerStyle; index: number; total: number; actions: LayerActions; file?: LoadedFile }) {
  const { t, locale } = useI18n();
  const count = (n: number) => n.toLocaleString(locale === 'nb' ? 'nb-NO' : 'en-US');
  const fn = layer.attrs?.['.FileFunction'];
  const software = layer.attrs?.['.GenerationSoftware'];
  // X2 says a file is negative when it draws where the material is not, as the openings of a solder mask.
  const negativeFile = /^negative$/i.test(layer.attrs?.['.FilePolarity'] ?? '');
  return (
    <div className={styles.layerDetails}>
      <div className={styles.detailFields}>
        <Field label={t('pcb.layer.type')}>
          <Select<LayerKind> value={layer.kind} onChange={(kind) => actions.type(layer.id, kind, layer.side)} options={KIND_OPTIONS} />
        </Field>
        <Field label={t('pcb.layer.side')}>
          <Select<Side> value={layer.side} onChange={(side) => actions.type(layer.id, layer.kind, side)} options={SIDE_OPTIONS} />
        </Field>
      </div>
      <label className={styles.slider}>
        <span>{t('pcb.layer.opacity', { pct: Math.round(style.opacity * 100) })}</span>
        <input type="range" min={10} max={100} value={Math.round(style.opacity * 100)} onChange={(e) => actions.opacity(layer.id, Number(e.target.value) / 100)} />
      </label>
      <div className={fieldStyles.buttonRow} style={{ marginTop: 0 }}>
        <button type="button" className={fieldStyles.buttonSmall} disabled={index === 0} onClick={() => actions.move(layer.id, -1)}>{t('pcb.layer.moveUp')}</button>
        <button type="button" className={fieldStyles.buttonSmall} disabled={index === total - 1} onClick={() => actions.move(layer.id, 1)}>{t('pcb.layer.moveDown')}</button>
        <button type="button" className={fieldStyles.buttonSmall} onClick={() => actions.only(layer.id)}>{t('pcb.layer.showOnly')}</button>
      </div>
      {file?.drill && <DrillFormatFields file={file} actions={actions} id={layer.id} />}
      <p className={styles.detailNote}>
        {t('pcb.layer.metaLine', {
          id: t(IDENTIFIED_KEYS[layer.identifiedBy ?? 'none'] ?? 'pcb.layer.idNone'),
          fn: layer.identifiedBy === 'x2' && fn ? ` (${fn})` : '',
          objs: count(layer.items.length),
          aps: layer.apertures.length ? t('pcb.layer.apertures', { n: count(layer.apertures.length) }) : '',
          neg: layer.negative ? t('pcb.layer.negImg') : '',
        })}
        {negativeFile && t('pcb.layer.negNote')}
        {software && t('pcb.layer.madeBy', { sw: software.split(',').join(' ') })}
        {layer.identifiedBy === 'design' && layer.kind === 'mask' && t('pcb.layer.maskOpenings')}
      </p>
      {layer.file && <p className={styles.detailNote} title={layer.file}>{layer.file}</p>}
      {!layer.file && layer.name !== layer.id && !layer.id.startsWith('design:') && <p className={styles.detailNote}>{t('pcb.layer.designLayer', { id: layer.id })}</p>}
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
  const { t } = useI18n();
  const [open, setOpen] = React.useState<string | null>(null);
  const byPath = React.useMemo(() => new Map(files.map((f) => [f.source.path, f])), [files]);
  return (
    <>
      <div className={styles.layerActions}>
        <button type="button" className={fieldStyles.buttonSmall} onClick={() => actions.showSet('all')}>{t('pcb.layer.all')}</button>
        <button type="button" className={fieldStyles.buttonSmall} onClick={() => actions.showSet('none')}>{t('pcb.layer.none')}</button>
        <button type="button" className={fieldStyles.buttonSmall} onClick={() => actions.showSet('top')}>{t('pcb.layer.topSide')}</button>
        <button type="button" className={fieldStyles.buttonSmall} onClick={() => actions.showSet('bottom')}>{t('pcb.layer.bottomSide')}</button>
      </div>
      <ul className={styles.layerList} aria-label={t('pcb.info.layers')}>
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
                <input type="checkbox" checked={style.visible} aria-label={t('pcb.layer.showAria', { title })} onChange={() => actions.toggle(layer.id)} />
                <span className={styles.swatch} style={{ background: style.color }}>
                  <input type="color" value={style.color} aria-label={t('pcb.layer.colorAria', { title })} onChange={(e) => actions.color(layer.id, e.target.value)} />
                </span>
                <button type="button" className={styles.layerText} onClick={() => actions.toggle(layer.id)} title={`${title}: ${layer.file ?? layer.name}`}>
                  <span className={styles.layerTitle}>{title}</span>
                  <span className={styles.layerFile}>{layer.name}{guessed && <span className={styles.guessBadge}>{t('pcb.layer.fmtGuessed')}</span>}</span>
                </button>
                <button
                  type="button"
                  className={styles.expandButton}
                  aria-expanded={expanded}
                  aria-label={expanded ? t('pcb.layer.closeSettings', { title }) : t('pcb.layer.openSettings', { title })}
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
