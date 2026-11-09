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
  { title: 'Pick-and-place', formats: 'KiCad (.csv, .pos), Altium, JLCPCB, EAGLE (.mnt, .mnb), Fusion 360 and other tables', note: 'Opened with Gerber files, the parts are marked on the board; columns, units and origin can be changed.' },
  { title: 'KiCad', formats: 'Boards (.kicad_pcb, KiCad 4 to 10) and footprints (.kicad_mod)', note: 'Drawn as KiCad plots them, zones as last filled; a project folder can be opened as it is.' },
  { title: 'Altium', formats: 'Boards (.PcbDoc, binary and ASCII) and footprint libraries (.PcbLib)', note: 'Pads, polygons as last poured, internal planes; text in a stroke font in the place and size of Altium’s.' },
  { title: 'PADS', formats: 'PADS ASCII boards (.asc, PowerPCB V4.0 to current PADS Layout)', note: 'Pad stacks, pours as last flooded, planes drawn from their outlines; a binary .pcb has to be exported as ASCII in PADS first.' },
  { title: 'EAGLE', formats: 'Boards (.brd of EAGLE 6 to 9 and Fusion 360 exports) and libraries (.lbr)', note: 'Pads by the design rules; polygons drawn from their outlines, as EAGLE stores no pour; a binary .brd from before EAGLE 6 has to be saved as XML first.' },
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
      <h2>Open Gerber files or a KiCad, Altium, PADS or EAGLE board</h2>
      <p>
        Select all the Gerber and drill files of a board, the folder they are in, or a ZIP archive of them, or a KiCad,
        Altium, PADS or EAGLE board file. See each layer in its own colour or the board as it looks, from the top or the
        bottom; click anything to see what it is, highlight a net or a component, measure, and save the view as PNG or
        SVG, the layers as a PDF at 1:1 or as DXF, or a board&apos;s BOM and pick-and-place file.
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
