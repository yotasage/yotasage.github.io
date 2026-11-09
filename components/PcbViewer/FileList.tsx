import React from 'react';

import { formatBytes } from '../../lib/pdf/files';
import { layerTitle } from '../../lib/pcb/identify';
import type { LoadedFile } from '../../lib/pcb/load';
import { Layer } from '../../lib/pcb/model';
import styles from '../../styles/PcbViewer.module.css';

const BADGES = {
  read: ['Read', styles.badgeRead],
  later: ['Not supported yet', styles.badgeLater],
  unsupported: ['Cannot be read', styles.badgeUnsupported],
  ignored: ['Ignored', styles.badgeIgnored],
  archive: ['Archive', styles.badgeArchive],
  error: ['Error', styles.badgeError],
  unused: ['Not used', styles.badgeIgnored],
} as const;

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

// What a design file holds, in a few words.
function designSummary(f: LoadedFile): string {
  const d = f.design;
  const b = f.designBoard;
  if (!d || !b) return f.detected.name;
  return `${f.detected.name}, ${d.format}: ${count(b.layers.length, 'layer', 'layers')}, ${count(d.components.length, 'component', 'components')}`;
}

// Every file that was opened, with what it is: a layer, the job file, the design the board comes from, or why it is
// not read or not used.
export default function FileList({ files, layers }: { files: LoadedFile[]; layers: Layer[] }) {
  const byFile = new Map(layers.map((l) => [l.file, l]));
  const archives = files.filter((f) => f.detected.id === 'zip').map((f) => `${f.source.path}/`);
  return (
    <ul className={styles.fileList} aria-label="Files">
      {files.map((f) => {
        const status = f.error ? 'error' : f.unused ? 'unused' : f.detected.status;
        const layer = f.design ? undefined : byFile.get(f.source.path);
        const [badge, badgeClass] = BADGES[status];
        const archive = archives.find((a) => f.source.path.startsWith(a));
        const shown = archive ? f.source.path.slice(archive.length) : f.source.path;
        const parts = f.pnpState ? `${f.detected.name}: ${count(f.pnpState.parts, 'part', 'parts')}` : undefined;
        const what = f.design ? designSummary(f) : layer ? `${f.detected.name}: ${layerTitle(layer)}` : f.job ? 'Gerber job file: layer functions and stackup' : parts ?? f.detected.name;
        const label = f.design ? 'Board' : f.gerber || f.drill ? 'Layer' : f.pnp ? 'Parts' : badge;
        return (
          <li key={f.source.path} className={[styles.fileItem, archive ? styles.fileNested : ''].join(' ')}>
            <div className={styles.fileHead}>
              <span className={styles.fileName} title={f.source.path}>{shown}</span>
              <span className={[styles.badge, badgeClass].join(' ')}>{label}</span>
            </div>
            <div className={styles.fileMeta}>
              {what}
              {f.detected.id !== 'zip' && ` · ${formatBytes(f.source.size)}`}
              {f.drillState && ` · ${f.drillState.holes.toLocaleString('en-US')} holes, format ${f.drillState.from === 'guess' ? 'guessed' : f.drillState.from === 'user' ? 'chosen by you' : 'from the file'}`}
              {(f.error || f.unused || f.detected.message) && <><br />{f.error ?? f.unused ?? f.detected.message}</>}
            </div>
            {f.warnings.length > 0 && (
              <details className={styles.fileWarnings}>
                <summary>{f.warnings.length === 1 ? '1 note on reading' : `${f.warnings.length} notes on reading`}</summary>
                <ul>{f.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
