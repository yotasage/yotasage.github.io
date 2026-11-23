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
import fieldStyles from '../../styles/Fields.module.css';
import styles from '../../styles/PcbViewer.module.css';
import { Field, Select } from '../UI/Fields';
import { formatLength, Units } from './Workspace';

const UNIT_NAME: Record<Units, string> = { mm: 'mm', in: 'in' };

const SIZE_FROM: Record<NonNullable<Board['outlineFrom']>, string> = {
  outline: 'Size',
  design: 'Size',
  frame: 'Size',
  copper: 'Size of the copper',
  extent: 'Size of the layers',
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
  const box = board.outline?.length ? shapeBox(board.outline) : null;
  const copper = board.layers.filter((l) => l.kind === 'copper').length;
  const s = board.stackup ?? {};
  const d = board.design;
  return (
    <>
      <p className={styles.boardName} title={board.name}>{board.name}</p>
      <table className={[fieldStyles.infoTable, styles.info].join(' ')}>
        <tbody>
          {d && <tr><th>File</th><td>{d.format}</td></tr>}
          {box && (
            <tr>
              <th>{SIZE_FROM[board.outlineFrom ?? 'outline']}</th>
              <td>{formatLength(box.maxX - box.minX, units)} × {formatLength(box.maxY - box.minY, units)} {UNIT_NAME[units]}</td>
            </tr>
          )}
          {copper > 0 && <tr><th>Copper layers</th><td>{s.copperLayers && s.copperLayers !== copper ? `${copper} (the job file says ${s.copperLayers})` : copper}</td></tr>}
          {s.thickness !== undefined && <tr><th>Thickness</th><td>{formatLength(s.thickness, units, units === 'in' ? 4 : 3)} {UNIT_NAME[units]}</td></tr>}
          {s.mask && <tr><th>Solder mask</th><td>{s.mask}</td></tr>}
          {s.silk && <tr><th>Silkscreen</th><td>{s.silk}</td></tr>}
          {s.finish && <tr><th>Finish</th><td>{s.finish}</td></tr>}
          {d && <tr><th>Components</th><td>{d.components.length.toLocaleString('en-US')}</td></tr>}
          {d && d.nets.length > 1 && <tr><th>Nets</th><td>{(d.nets.length - 1).toLocaleString('en-US')}</td></tr>}
          <tr><th>Layers</th><td>{board.layers.length}, {shown} shown</td></tr>
        </tbody>
      </table>
      {board.outlineFrom === 'copper' && <p className={styles.detailNote}>There is no board outline among the files, so the board is taken to be the rectangle around the copper.</p>}
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
  const s = board.stackup ?? {};
  const fromJob = [s.mask && `${s.mask} mask`, s.silk && `${s.silk} silkscreen`, s.finish && `finish ${s.finish}`].filter(Boolean);
  const source = board.design ? 'The board file' : 'The job file';
  return (
    <>
      <div className={styles.detailFields}>
        <Field label="Solder mask">
          <Select<MaskColor> value={value.mask} onChange={(mask) => onChange({ ...value, mask })} options={Object.entries(MASK_COLORS).map(([k, v]) => [k as MaskColor, v.label])} />
        </Field>
        <Field label="Silkscreen">
          <Select<SilkColor> value={value.silk} onChange={(silk) => onChange({ ...value, silk })} options={Object.entries(SILK_COLORS).map(([k, v]) => [k as SilkColor, v.label])} />
        </Field>
        <Field label="Finish">
          <Select<Finish> value={value.finish} onChange={(finish) => onChange({ ...value, finish })} options={Object.entries(FINISHES).map(([k, v]) => [k as Finish, v.label])} />
        </Field>
      </div>
      <p className={fieldStyles.help}>
        {fromJob.length ? `${source} says: ${fromJob.join(', ')}.` : `${board.design ? 'The board file gives no colours' : 'No job file gives the colours'}; green mask, white silkscreen and ENIG are assumed.`}
        {' '}The view uses the copper, solder mask, silkscreen and drill layers of the side in view, whether they are shown in the layer list or not.
      </p>
    </>
  );
}
