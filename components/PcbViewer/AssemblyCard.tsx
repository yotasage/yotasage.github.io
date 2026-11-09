import React from 'react';

import { download, safeFileName } from '../../lib/pdf/files';
import { AssemblyOptions, bomCsv, LeftOut, originPoint, PlaceOrigin, placementCsv } from '../../lib/pcb/export/csv';
import { Board } from '../../lib/pcb/model';
import styles from '../../styles/PcbViewer.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import { Checkbox, Field, Select } from '../QrGen/fields';

function mm(v: number): string {
  return (Math.round(v * 1000) / 1000).toString().replace('-', '−');
}

function leftOutText(l: LeftOut): string {
  if (!l.total) return '';
  return ` Left out: ${l.reasons.map(([why, n]) => `${n} ${why}`).join(', ')}.`;
}

// The BOM and the pick-and-place file of a design, as CSV.
export default function AssemblyCard({ board }: { board: Board }) {
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
  const options: [PlaceOrigin, string][] = [['file', 'The file’s origin']];
  if (place) options.push(['place', `The drill/place file origin (${mm(place.x)}, ${mm(place.y)} mm)`]);
  if (corner) options.push(['board', `The bottom-left corner of the board (${mm(corner.x)}, ${mm(corner.y)} mm)`]);
  return (
    <>
      <p className={qrStyles.help}>
        The components of the design as CSV files. The BOM has a line per value, footprint and part number with the designators and the
        fields; the pick-and-place file has the position, rotation and side of each part, in mm, as KiCad writes it.
      </p>
      <div className={styles.saveFields}>
        <Field label="Positions from">
          <Select<PlaceOrigin> value={chosen} onChange={setOrigin} options={options} />
        </Field>
      </div>
      <Checkbox label="Leave out DNP parts (do not populate)" checked={leaveOutDnp} onChange={setLeaveOutDnp} />
      <div className={qrStyles.buttonRow}>
        <button type="button" className={qrStyles.buttonSmall} disabled={!bom.parts} onClick={() => download(bomCsv(board, o).blob, `${name}-bom.csv`)}>Save BOM</button>
        <button type="button" className={qrStyles.buttonSmall} disabled={!pos.rows} onClick={() => download(placementCsv(board, o).blob, `${name}-pos.csv`)}>Save pick-and-place</button>
      </div>
      <p className={styles.detailNote}>
        {`BOM: ${bom.parts.toLocaleString('en-US')} parts in ${bom.lines.toLocaleString('en-US')} lines.${leftOutText(bom.leftOut)}`}
        <br />
        {`Pick-and-place: ${pos.rows.toLocaleString('en-US')} parts.${leftOutText(pos.leftOut)}`}
      </p>
    </>
  );
}
