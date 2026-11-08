import dynamic from 'next/dynamic';
import React from 'react';

import type { PickedFile } from '../../lib/pcb/load';
import styles from '../../styles/PcbViewer.module.css';
import ToolIcon from '../Home/ToolIcon';
import { canPickFolders, DropZone, PickButton } from './pick';
import type WorkspaceComponent from './Workspace';

// The viewer is only downloaded once files are opened. With "module": "node16", TypeScript takes the files of the site
// for CommonJS: it wants a file extension (which Turbopack does not resolve to .tsx) and expects the component one level
// deeper. The bundler gives the ES module.
const Workspace = dynamic(
  // @ts-expect-error TS2835, see above.
  () => import('./Workspace') as Promise<{ default: typeof WorkspaceComponent }>,
  { ssr: false, loading: () => <div className={styles.loadingWorkspace}>Loading the viewer…</div> },
);

const FORMATS: { title: string; formats: string; note?: string }[] = [
  { title: 'Gerber', formats: 'RS-274X and X2 (.gbr, .gtl, .gbl, .gto, .pho, .art and others)', note: 'Including the old commands of older files.' },
  { title: 'Drill', formats: 'Excellon (.drl, .txt, .xln and others) and Gerber drill files', note: 'Slots and routed holes too; a file without a header gets its format from the pads.' },
  { title: 'Gerber job file', formats: '.gbrjob', note: 'Gives each layer its function and order, and the colours.' },
  { title: 'Archives', formats: 'ZIP, also inside other ZIPs and with folders' },
];

export default function PcbViewer() {
  const [files, setFiles] = React.useState<PickedFile[] | null>(null);
  const [folders, setFolders] = React.useState(false);
  React.useEffect(() => setFolders(canPickFolders()), []);

  if (files) return <Workspace initial={files} />;

  return (
    <DropZone onFiles={setFiles} className={styles.hero} overClassName={styles.dropOver}>
      <ToolIcon name="pcb" color="#9ccc3c" size={72} />
      <h2>Open Gerber files</h2>
      <p>
        Select all the Gerber and drill files of a board, the folder they are in, or a ZIP archive of them. See each layer
        in its own colour or the board as it looks, from the top or the bottom; measure it, and save it as PNG or SVG.
      </p>
      <div className={styles.heroButtons}>
        <PickButton onFiles={setFiles} className={styles.heroButton}>Select files</PickButton>
        {folders && <PickButton folder onFiles={setFiles} className={styles.heroButtonSecondary}>Select folder</PickButton>}
      </div>
      <span className={styles.hint}>or drop files or a folder here. Other files of a project can come along: the file list says what each file is.</span>
      <dl className={styles.formatList}>
        {FORMATS.map((g) => (
          <div key={g.title}>
            <dt>{g.title}</dt>
            <dd>{g.formats}{g.note && <small>{g.note}</small>}</dd>
          </div>
        ))}
      </dl>
      <span className={styles.hint}>Your files are read in this browser and are never uploaded.</span>
    </DropZone>
  );
}
