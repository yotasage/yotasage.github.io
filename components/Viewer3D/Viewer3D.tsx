import dynamic from 'next/dynamic';
import React from 'react';

import { FORMAT_GROUPS } from '../../lib/viewer3d/formats';
import styles from '../../styles/Viewer3D.module.css';
import ToolIcon from '../Home/ToolIcon';
import { DropTarget, FilePickerButton } from '../PdfTools/ToolPage';
import type WorkspaceComponent from './Workspace';

// three.js and the viewer are only downloaded once a file is opened. With "module": "node16", TypeScript takes the
// files of the site for CommonJS: it wants a file extension (which Turbopack does not resolve to .tsx) and expects the
// component one level deeper. The bundler gives the ES module.
const Workspace = dynamic(
  // @ts-expect-error TS2835, see above.
  () => import('./Workspace') as Promise<{ default: typeof WorkspaceComponent }>,
  { ssr: false, loading: () => <div className={styles.loadingWorkspace}>Loading the viewer…</div> },
);

// No file filter: phones grey out files whose extension they do not know a type for, which is most 3D formats.
const ACCEPT = '';

export default function Viewer3D() {
  const [files, setFiles] = React.useState<File[] | null>(null);

  if (files) return <Workspace files={files} onOpen={setFiles} />;

  return (
    <DropTarget onFiles={setFiles} className={styles.hero} overClassName={styles.dropOver}>
      <ToolIcon name="viewer3d" color="#f08c3c" size={72} />
      <h2>Open a 3D file</h2>
      <p>Turn it, zoom in, cut through it and measure it. Then save it as STL, OBJ, PLY or GLB, or as an image.</p>
      <FilePickerButton accept={ACCEPT} onFiles={setFiles} className={styles.heroButton}>Select 3D file</FilePickerButton>
      <span className={styles.hint}>or drop it here. For OBJ and glTF files with separate materials, buffers or textures, select or drop all the files together.</span>
      <dl className={styles.formatList}>
        {FORMAT_GROUPS.map((g) => (
          <div key={g.title}>
            <dt>{g.title}</dt>
            <dd>{g.formats}{g.note && <small>{g.note}</small>}</dd>
          </div>
        ))}
      </dl>
      <span className={styles.hint}>Your files are read in this browser and are never uploaded.</span>
    </DropTarget>
  );
}
