import React from 'react';

import { download, errorMessage, safeFileName } from '../../lib/pdf/files';
import { boardImageBox, Cancelled, exportPng, imageSize } from '../../lib/pcb/export/png';
import { exportSvg } from '../../lib/pcb/export/svg';
import { Board } from '../../lib/pcb/model';
import { RealisticColors } from '../../lib/pcb/render/paint';
import { BACKGROUND, BoardView, LayerStyle, ViewMode } from '../../lib/pcb/render/view';
import styles from '../../styles/PcbViewer.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import { Checkbox, Field, Select } from '../QrGen/fields';

type What = 'screen' | 'board';

const RESOLUTIONS: [string, string][] = [
  ['10', '10 px/mm (254 dpi)'],
  ['20', '20 px/mm (508 dpi)'],
  ['40', '40 px/mm (1016 dpi)'],
  ['80', '80 px/mm (2032 dpi)'],
];

// Saves the picture as PNG (what is on screen, or the whole board at a resolution) or SVG (the whole board as
// vectors), in the view that is shown: the shown layers, or the realistic view of the side in view.
export default function SaveCard({ view, board, mode, flipped, layerStyles, colors, highlighted }: {
  view: BoardView;
  board: Board;
  mode: ViewMode;
  flipped: boolean;
  // Passed so the card follows changes of the picture (sizes, file names).
  layerStyles: Map<string, LayerStyle>;
  colors: RealisticColors;
  // What is highlighted ("net GND", "R12"), if anything: the images show it as on screen.
  highlighted?: string;
}) {
  const [what, setWhat] = React.useState<What>('board');
  const [resolution, setResolution] = React.useState('20');
  const [transparent, setTransparent] = React.useState(false);
  const [busy, setBusy] = React.useState<{ kind: 'PNG' | 'SVG'; progress: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abort.current?.abort(), []);

  const pxPerMm = Number(resolution);
  // The size changes with the shown layers (layer view) and the board (realistic view).
  const box = React.useMemo(() => boardImageBox(board, mode, layerStyles), [mode, layerStyles, board]);
  const size = box ? imageSize(box, pxPerMm) : null;
  const side = flipped ? 'bottom' : 'top';
  // A board named after its only file (sample.gbr) saves as sample-layers.png, not sample.gbr-layers.png.
  const name = board.layers.some((l) => l.name === board.name) ? board.name.replace(/\.[^.]+$/, '') : board.name;
  const base = safeFileName(`${name}-${mode === 'realistic' ? `realistic-${side}` : `layers${flipped ? '-bottom' : ''}`}`, 'board');

  async function run(kind: 'PNG' | 'SVG', make: (signal: AbortSignal, progress: (f: number) => void) => Promise<Blob>, name: string) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setBusy({ kind, progress: 0 });
    let last = 0;
    try {
      const blob = await make(controller.signal, (f) => {
        // A few updates a second are enough.
        if (f - last >= 0.01 || f === 1) {
          last = f;
          setBusy({ kind, progress: f });
        }
      });
      if (!controller.signal.aborted) download(blob, name, blob.type);
    } catch (e) {
      if (!(e instanceof Cancelled)) setError(`Could not save the ${kind}: ${errorMessage(e)}`);
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(null);
      }
    }
  }

  const savePng = () => run('PNG', (signal, onProgress) => exportPng(view, { what, box, pxPerMm, transparent, signal, onProgress }), `${base}${what === 'screen' ? '-screen' : ''}.png`);

  const saveSvg = () => run('SVG', (signal, onProgress) => {
    // The whole board, or the part of it on screen.
    const area = what === 'screen' ? view.screenBox() : box;
    if (!area) throw new Error('There is nothing to save.');
    const title = `${board.name} – ${mode === 'realistic' ? `realistic view, ${side}` : `layers${flipped ? ', seen from the bottom' : ''}`}${highlighted ? `, ${highlighted} highlighted` : ''}`;
    const background = transparent ? null : BACKGROUND;
    if (mode === 'realistic') {
      const lit = view.exportHighlight();
      return exportSvg({
        title, flipped, box: area, background, signal, onProgress,
        realistic: { side: view.sideLayers(), colors, outline: board.outline ?? [], ...(lit ? { dim: lit.dim, highlight: lit.layers } : {}) },
      });
    }
    return exportSvg({ title, flipped, box: area, background, layers: view.exportLayers(), signal, onProgress });
  }, `${base}${what === 'screen' ? '-screen' : ''}.svg`);

  return (
    <>
      <p className={qrStyles.help}>
        {mode === 'realistic' ? `The realistic view of the ${side}` : `The shown layers${flipped ? ', seen from the bottom' : ''}`}, as an image (PNG) or as vectors in
        millimetres at 1:1 (SVG).{highlighted && ` With ${highlighted} highlighted, as on screen.`}
      </p>
      <div className={styles.saveFields}>
        <Field label="Area">
          <Select<What> value={what} onChange={setWhat} options={[['board', 'The whole board'], ['screen', 'What is on screen']]} />
        </Field>
        {what === 'board' && (
          <Field label="Resolution">
            <Select<string> value={resolution} onChange={setResolution} options={RESOLUTIONS} />
          </Field>
        )}
      </div>
      {what === 'board' && size && (
        <p className={size.fits ? styles.detailNote : qrStyles.warning}>
          {size.width.toLocaleString('en-US')} × {size.height.toLocaleString('en-US')} pixels{size.fits ? '' : ': too large, choose a lower resolution'}.
        </p>
      )}
      <Checkbox label="Transparent background" checked={transparent} onChange={setTransparent} />
      <div className={qrStyles.buttonRow}>
        <button type="button" className={qrStyles.buttonSmall} disabled={Boolean(busy) || (what === 'board' && !size?.fits)} onClick={savePng}>Save PNG</button>
        <button type="button" className={qrStyles.buttonSmall} disabled={Boolean(busy) || !box} onClick={saveSvg}>Save SVG</button>
        {busy && <button type="button" className={qrStyles.buttonSmall} onClick={() => abort.current?.abort()}>Cancel</button>}
      </div>
      {busy && (
        <div className={styles.progress} role="status" aria-label={`Saving the ${busy.kind}`}>
          <span>Saving the {busy.kind}… {Math.round(busy.progress * 100)}%</span>
          <div className={styles.progressBar}><div style={{ width: `${Math.round(busy.progress * 100)}%` }} /></div>
        </div>
      )}
      {error && <p className={qrStyles.warning}>{error}</p>}
    </>
  );
}
