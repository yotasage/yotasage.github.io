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
} as const;

// Every file that was opened, with what it is: a layer, the job file, or why it is not read.
export default function FileList({ files, layers }: { files: LoadedFile[]; layers: Layer[] }) {
  const byFile = new Map(layers.map((l) => [l.file, l]));
  const archives = files.filter((f) => f.detected.id === 'zip').map((f) => `${f.source.path}/`);
  return (
    <ul className={styles.fileList} aria-label="Files">
      {files.map((f) => {
        const status = f.error ? 'error' : f.detected.status;
        const layer = byFile.get(f.source.path);
        const [badge, badgeClass] = BADGES[status];
        const archive = archives.find((a) => f.source.path.startsWith(a));
        const shown = archive ? f.source.path.slice(archive.length) : f.source.path;
        const what = layer ? `${f.detected.name}: ${layerTitle(layer)}` : f.job ? 'Gerber job file: layer functions and stackup' : f.detected.name;
        return (
          <li key={f.source.path} className={[styles.fileItem, archive ? styles.fileNested : ''].join(' ')}>
            <div className={styles.fileHead}>
              <span className={styles.fileName} title={f.source.path}>{shown}</span>
              <span className={[styles.badge, badgeClass].join(' ')}>{f.gerber || f.drill || f.job ? (f.job ? 'Read' : 'Layer') : badge}</span>
            </div>
            <div className={styles.fileMeta}>
              {what}
              {f.detected.id !== 'zip' && ` · ${formatBytes(f.source.size)}`}
              {f.drillState && ` · ${f.drillState.holes.toLocaleString('en-US')} holes, format ${f.drillState.from === 'guess' ? 'guessed' : f.drillState.from === 'user' ? 'chosen by you' : 'from the file'}`}
              {(f.error || f.detected.message) && <><br />{f.error ?? f.detected.message}</>}
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
