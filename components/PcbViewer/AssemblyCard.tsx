import React from 'react';

import { download, safeFileName } from '../../lib/pdf/files';
import { AssemblyOptions, bomCsv, LeftOut, originPoint, PlaceOrigin, placementCsv } from '../../lib/pcb/export/csv';
import { Board } from '../../lib/pcb/model';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale } from '../../lib/ui/translations';
import styles from '../../styles/PcbViewer.module.css';
import fieldStyles from '../../styles/Fields.module.css';
import { Checkbox, Field, Select } from '../UI/Fields';

function mm(v: number): string {
  return (Math.round(v * 1000) / 1000).toString().replace('-', '−');
}

function leftOutText(l: LeftOut, locale: Locale): string {
  if (!l.total) return '';
  return translate(locale, 'pcb.asm.leftOut', { items: l.reasons.map(([why, n]) => `${n} ${why}`).join(', ') });
}

// The BOM and the pick-and-place file of a design, as CSV.
export default function AssemblyCard({ board }: { board: Board }) {
  const { t, locale } = useI18n();
  const [origin, setOrigin] = React.useState<PlaceOrigin>('file');
  const [leaveOutDnp, setLeaveOutDnp] = React.useState(true);
  const place = originPoint(board, 'place');
  const corner = originPoint(board, 'board');
  // A choice the board does not have falls back to the file's origin.
  const chosen: PlaceOrigin = (origin === 'place' && !place) || (origin === 'board' && !corner) ? 'file' : origin;
  const o: AssemblyOptions = { origin: chosen, leaveOutDnp };
  const pos = React.useMemo(() => placementCsv(board, o), [board, chosen, leaveOutDnp]);
  const bom = React.useMemo(() => bomCsv(board, o), [board, leaveOutDnp]);
  const name = safeFileName(board.name, 'board');
  const options: [PlaceOrigin, string][] = [['file', t('pcb.asm.originFile')]];
  // KiCad's drill/place file origin, Altium's board origin (Edit → Origin).
  const placeName = board.source === 'altium' ? t('pcb.asm.originBoard') : t('pcb.asm.originDrill');
  if (place) options.push(['place', `${placeName} (${mm(place.x)}, ${mm(place.y)} mm)`]);
  if (corner) options.push(['board', t('pcb.asm.originCorner', { x: mm(corner.x), y: mm(corner.y) })]);
  return (
    <>
      <p className={fieldStyles.help}>{t('pcb.asm.help')}</p>
      <div className={styles.saveFields}>
        <Field label={t('pcb.asm.posFrom')}>
          <Select<PlaceOrigin> value={chosen} onChange={setOrigin} options={options} />
        </Field>
      </div>
      <Checkbox label={t('pcb.asm.leaveOutDnp')} checked={leaveOutDnp} onChange={setLeaveOutDnp} />
      <div className={fieldStyles.buttonRow}>
        <button type="button" className={fieldStyles.buttonSmall} disabled={!bom.parts} onClick={() => download(bomCsv(board, o).blob, `${name}-bom.csv`)}>{t('pcb.asm.saveBom')}</button>
        <button type="button" className={fieldStyles.buttonSmall} disabled={!pos.rows} onClick={() => download(placementCsv(board, o).blob, `${name}-pos.csv`)}>{t('pcb.asm.savePos')}</button>
      </div>
      <p className={styles.detailNote}>
        {t('pcb.asm.bomSummary', {
          parts: bom.parts.toLocaleString('en-US'),
          lines: bom.lines.toLocaleString('en-US'),
          leftOut: leftOutText(bom.leftOut, locale),
        })}
        <br />
        {t('pcb.asm.posSummary', {
          parts: pos.rows.toLocaleString('en-US'),
          leftOut: leftOutText(pos.leftOut, locale),
        })}
      </p>
    </>
  );
}
