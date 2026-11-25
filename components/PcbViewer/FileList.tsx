import React from 'react';

import { formatBytes } from '../../lib/pdf/files';
import { layerTitle } from '../../lib/pcb/identify';
import type { LoadedFile } from '../../lib/pcb/load';
import { Layer } from '../../lib/pcb/model';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/PcbViewer.module.css';

const BADGES: Record<string, readonly [TranslationKey, string]> = {
  read: ['pcb.file.bRead', styles.badgeRead],
  later: ['pcb.file.bLater', styles.badgeLater],
  unsupported: ['pcb.file.bUnsupported', styles.badgeUnsupported],
  ignored: ['pcb.file.bIgnored', styles.badgeIgnored],
  archive: ['pcb.file.bArchive', styles.badgeArchive],
  error: ['pcb.file.bError', styles.badgeError],
  unused: ['pcb.file.bUnused', styles.badgeIgnored],
};

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

// Every file that was opened, with what it is: a layer, the job file, the design the board comes from, or why it is
// not read or not used.
export default function FileList({ files, layers }: { files: LoadedFile[]; layers: Layer[] }) {
  const { t } = useI18n();
  const byFile = new Map(layers.map((l) => [l.file, l]));
  const archives = files.filter((f) => f.detected.id === 'zip').map((f) => `${f.source.path}/`);
  const designSummary = (f: LoadedFile): string => {
    const d = f.design;
    const b = f.designBoard;
    if (!d || !b) return f.detected.name;
    return `${f.detected.name}, ${d.format}: ${count(b.layers.length, t('pcb.file.layerOne'), t('pcb.file.layerMany'))}, ${count(d.components.length, t('pcb.file.compOne'), t('pcb.file.compMany'))}`;
  };
  return (
    <ul className={styles.fileList} aria-label={t('pcb.file.listAria')}>
      {files.map((f) => {
        const status = f.error ? 'error' : f.unused ? 'unused' : f.detected.status;
        const layer = f.design ? undefined : byFile.get(f.source.path);
        const [badgeKey, badgeClass] = BADGES[status];
        const archive = archives.find((a) => f.source.path.startsWith(a));
        const shown = archive ? f.source.path.slice(archive.length) : f.source.path;
        const parts = f.pnpState ? `${f.detected.name}: ${count(f.pnpState.parts, t('pcb.file.partOne'), t('pcb.file.partMany'))}` : undefined;
        const what = f.design ? designSummary(f) : layer ? `${f.detected.name}: ${layerTitle(layer)}` : f.job ? t('pcb.file.jobDesc') : parts ?? f.detected.name;
        const label = f.design ? t('pcb.file.bBoard') : f.gerber || f.drill ? t('pcb.file.bLayer') : f.pnp ? t('pcb.file.bParts') : t(badgeKey);
        return (
          <li key={f.source.path} className={[styles.fileItem, archive ? styles.fileNested : ''].join(' ')}>
            <div className={styles.fileHead}>
              <span className={styles.fileName} title={f.source.path}>{shown}</span>
              <span className={[styles.badge, badgeClass].join(' ')}>{label}</span>
            </div>
            <div className={styles.fileMeta}>
              {what}
              {f.detected.id !== 'zip' && ` · ${formatBytes(f.source.size)}`}
              {f.drillState && t('pcb.file.holesMeta', {
                holes: f.drillState.holes.toLocaleString('en-US'),
                from: f.drillState.from === 'guess' ? t('pcb.file.drillGuessed') : f.drillState.from === 'user' ? t('pcb.file.drillUser') : t('pcb.file.drillFile'),
              })}
              {(f.error || f.unused || f.detected.message) && <><br />{f.error ?? f.unused ?? f.detected.message}</>}
            </div>
            {f.warnings.length > 0 && (
              <details className={styles.fileWarnings}>
                <summary>{f.warnings.length === 1 ? t('pcb.file.noteOne') : t('pcb.file.noteMany', { n: f.warnings.length })}</summary>
                <ul>{f.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
