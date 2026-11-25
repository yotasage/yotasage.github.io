import React from 'react';

import { Board } from '../../lib/pcb/model';
import { shapeBox } from '../../lib/pcb/outline';
import {
  Finish,
  FINISHES,
  MASK_COLORS,
  MaskColor,
  RealisticStyle,
  SILK_COLORS,
  SilkColor,
} from '../../lib/pcb/render/colors';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import fieldStyles from '../../styles/Fields.module.css';
import styles from '../../styles/PcbViewer.module.css';
import { Field, Select } from '../UI/Fields';
import { formatLength, Units } from './Workspace';

const UNIT_NAME: Record<Units, string> = { mm: 'mm', in: 'in' };

const SIZE_FROM_KEYS: Record<NonNullable<Board['outlineFrom']>, TranslationKey> = {
  outline: 'pcb.info.size',
  design: 'pcb.info.size',
  frame: 'pcb.info.size',
  copper: 'pcb.info.sizeCopper',
  extent: 'pcb.info.sizeExtent',
};

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.card}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function BoardInfo({ board, units, shown }: { board: Board; units: Units; shown: number }) {
  const { t } = useI18n();
  const box = board.outline?.length ? shapeBox(board.outline) : null;
  const copper = board.layers.filter((l) => l.kind === 'copper').length;
  const s = board.stackup ?? {};
  const d = board.design;
  return (
    <>
      <p className={styles.boardName} title={board.name}>{board.name}</p>
      <table className={[fieldStyles.infoTable, styles.info].join(' ')}>
        <tbody>
          {d && <tr><th>{t('pcb.info.file')}</th><td>{d.format}</td></tr>}
          {box && (
            <tr>
              <th>{t(SIZE_FROM_KEYS[board.outlineFrom ?? 'outline'])}</th>
              <td>{formatLength(box.maxX - box.minX, units)} × {formatLength(box.maxY - box.minY, units)} {UNIT_NAME[units]}</td>
            </tr>
          )}
          {copper > 0 && <tr><th>{t('pcb.info.copperLayers')}</th><td>{s.copperLayers && s.copperLayers !== copper ? t('pcb.info.jobSays', { n: copper, job: s.copperLayers }) : copper}</td></tr>}
          {s.thickness !== undefined && <tr><th>{t('pcb.info.thickness')}</th><td>{formatLength(s.thickness, units, units === 'in' ? 4 : 3)} {UNIT_NAME[units]}</td></tr>}
          {s.mask && <tr><th>{t('pcb.info.solderMask')}</th><td>{s.mask}</td></tr>}
          {s.silk && <tr><th>{t('pcb.info.silkscreen')}</th><td>{s.silk}</td></tr>}
          {s.finish && <tr><th>{t('pcb.info.finish')}</th><td>{s.finish}</td></tr>}
          {d && <tr><th>{t('pcb.info.components')}</th><td>{d.components.length.toLocaleString('en-US')}</td></tr>}
          {d && d.nets.length > 1 && <tr><th>{t('pcb.info.nets')}</th><td>{(d.nets.length - 1).toLocaleString('en-US')}</td></tr>}
          <tr><th>{t('pcb.info.layers')}</th><td>{t('pcb.info.layersVal', { total: board.layers.length, shown })}</td></tr>
        </tbody>
      </table>
      {board.outlineFrom === 'copper' && <p className={styles.detailNote}>{t('pcb.info.noOutlineNote')}</p>}
      {board.warnings.map((w) => <p key={w} className={fieldStyles.warning}>{w}</p>)}
    </>
  );
}

// The colours of the realistic view, from the job file at first.
export function RealisticFields({
  value,
  onChange,
  board,
}: {
  value: RealisticStyle;
  onChange: (v: RealisticStyle) => void;
  board: Board;
}) {
  const { t } = useI18n();
  const s = board.stackup ?? {};
  const fromJob = [
    s.mask && t('pcb.real.fromMask', { v: s.mask }),
    s.silk && t('pcb.real.fromSilk', { v: s.silk }),
    s.finish && t('pcb.real.fromFinish', { v: s.finish }),
  ].filter(Boolean);
  const source = board.design ? t('pcb.real.boardFile') : t('pcb.real.jobFile');
  return (
    <>
      <div className={styles.detailFields}>
        <Field label={t('pcb.info.solderMask')}>
          <Select<MaskColor> value={value.mask} onChange={(mask) => onChange({ ...value, mask })} options={Object.entries(MASK_COLORS).map(([k, v]) => [k as MaskColor, v.label])} />
        </Field>
        <Field label={t('pcb.info.silkscreen')}>
          <Select<SilkColor> value={value.silk} onChange={(silk) => onChange({ ...value, silk })} options={Object.entries(SILK_COLORS).map(([k, v]) => [k as SilkColor, v.label])} />
        </Field>
        <Field label={t('pcb.info.finish')}>
          <Select<Finish> value={value.finish} onChange={(finish) => onChange({ ...value, finish })} options={Object.entries(FINISHES).map(([k, v]) => [k as Finish, v.label])} />
        </Field>
      </div>
      <p className={fieldStyles.help}>
        {fromJob.length
          ? t('pcb.real.sourceSays', { source, list: fromJob.join(', ') })
          : (board.design ? t('pcb.real.noColorsBoard') : t('pcb.real.noColorsJob'))}
        {' '}{t('pcb.real.layersNote')}
      </p>
    </>
  );
}
