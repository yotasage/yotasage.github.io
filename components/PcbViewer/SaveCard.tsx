import React from 'react';

import { download, errorMessage, safeFileName } from '../../lib/pdf/files';
import { exportDxf } from '../../lib/pcb/export/dxf';
import { hasClearItems } from '../../lib/pcb/export/flatten';
import type { exportKicad } from '../../lib/pcb/export/kicad';
import { kicadExportable, kicadNotes } from '../../lib/pcb/export/kicadnotes';
import { exportPdf, pageLayout, paperLabel, PdfColors, PdfMirror, PdfPaper } from '../../lib/pcb/export/pdf';
import { boardImageBox, Cancelled, exportPng, imageSize } from '../../lib/pcb/export/png';
import { exportSvg } from '../../lib/pcb/export/svg';
import { layerTitle } from '../../lib/pcb/identify';
import { Board, Box, Layer, Pt } from '../../lib/pcb/model';
import { shapeBox } from '../../lib/pcb/outline';
import { RealisticColors } from '../../lib/pcb/render/paint';
import { BACKGROUND, BoardView, LayerStyle, ViewMode } from '../../lib/pcb/render/view';
import styles from '../../styles/PcbViewer.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import { Checkbox, Field, Select } from '../QrGen/fields';

type Format = 'png' | 'svg' | 'pdf' | 'dxf' | 'kicad';
type What = 'screen' | 'board';

const FORMATS: [Format, string, string][] = [
  ['png', 'PNG', 'An image'],
  ['svg', 'SVG', 'Vectors at 1:1'],
  ['pdf', 'PDF', 'Vectors at 1:1, for printing'],
  ['dxf', 'DXF', 'For CAD programs'],
  ['kicad', 'KiCad', 'The design as a KiCad board'],
];

const RESOLUTIONS: [string, string][] = [
  ['10', '10 px/mm (254 dpi)'],
  ['20', '20 px/mm (508 dpi)'],
  ['40', '40 px/mm (1016 dpi)'],
  ['80', '80 px/mm (2032 dpi)'],
];

type DxfOrigin = 'file' | 'place' | 'board';
type DxfHoles = 'all' | 'large' | 'none';

function mm(v: number): string {
  return (Math.round(v * 10) / 10).toString();
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// What the layers with clear items are, in a few words, from what they hold.
function clearKinds(board: Board, layers: Layer[]): string {
  const kinds = new Set<string>();
  for (const l of layers) {
    if (l.negative) kinds.add('negative images');
    if (board.source === 'eagle' && l.kind === 'copper') kinds.add('EAGLE polygons with their cuts');
    else if (board.design?.planes?.some((p) => p.layer === l.id)) kinds.add(board.source === 'pads' ? 'plane areas' : 'internal planes');
    else if (board.source === 'gerber') kinds.add('Gerber clear polarity');
    else kinds.add('knockout text');
  }
  return [...kinds].join(', ');
}

// Saves the board: the picture on screen or the whole board as PNG, the shown layers or the realistic view as SVG,
// the shown layers as a PDF at 1:1 (one page or one per layer), a DXF of the board outline and holes or of the
// shown layers, or an Altium, PADS or EAGLE design as a KiCad board, with a warning first.
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
  const [chosenFormat, setFormat] = React.useState<Format>('png');
  const toKicad = kicadExportable(board);
  // KiCad only for a design from another program; another board falls back to PNG.
  const format: Format = chosenFormat === 'kicad' && !toKicad ? 'png' : chosenFormat;
  const notes = React.useMemo(() => (toKicad ? kicadNotes(board) : []), [board, toKicad]);
  const [what, setWhat] = React.useState<What>('board');
  const [resolution, setResolution] = React.useState('20');
  const [transparent, setTransparent] = React.useState(false);
  const [pages, setPages] = React.useState<'one' | 'each'>('one');
  const [paper, setPaper] = React.useState<PdfPaper>('a4');
  const [mirror, setMirror] = React.useState<PdfMirror | null>(null);
  const [pdfColors, setPdfColors] = React.useState<PdfColors>('white');
  const [outlineEach, setOutlineEach] = React.useState(true);
  const [dxfKind, setDxfKind] = React.useState<'outline' | 'layers'>('outline');
  const [dxfOrigin, setDxfOrigin] = React.useState<DxfOrigin>('file');
  const [dxfHoles, setDxfHoles] = React.useState<DxfHoles>('all');
  const [busy, setBusy] = React.useState<{ kind: string; progress: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abort.current?.abort(), []);

  const pxPerMm = Number(resolution);
  // The size changes with the shown layers (layer view) and the board (realistic view).
  const box = React.useMemo(() => boardImageBox(board, mode, layerStyles), [mode, layerStyles, board]);
  const layerBox = React.useMemo(() => boardImageBox(board, 'layers', layerStyles), [layerStyles, board]);
  const size = box ? imageSize(box, pxPerMm) : null;
  const side = flipped ? 'bottom' : 'top';
  // A board named after its only file (sample.gbr) saves as sample-layers.png, not sample.gbr-layers.png.
  const name = board.layers.some((l) => l.name === board.name) ? board.name.replace(/\.[^.]+$/, '') : board.name;
  const base = safeFileName(`${name}-${mode === 'realistic' ? `realistic-${side}` : `layers${flipped ? '-bottom' : ''}`}`, 'board');
  const shown = board.layers.filter((l) => layerStyles.get(l.id)?.visible);
  const clear = shown.filter(hasClearItems);
  const outline = board.outline?.length && board.outlineFrom !== 'copper' && board.outlineFrom !== 'extent' ? board.outline : undefined;
  const pdfMirror: PdfMirror = mirror ?? (flipped ? 'bottom' : 'top');
  const layout = layerBox ? pageLayout(layerBox, paper) : null;

  async function run(kind: string, make: (signal: AbortSignal, progress: (f: number) => void) => Promise<Blob>, fileName: string) {
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
      if (!controller.signal.aborted) download(blob, fileName, blob.type);
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

  const savePdf = () => run('PDF', (signal, onProgress) => {
    if (!layerBox) throw new Error('There is nothing to save.');
    const fromBelow = pdfMirror === 'bottom';
    // One page: as on screen (with the highlight), in drawing order; one per layer: the list from the top down.
    const layers = pages === 'one' ? view.exportLayers(fromBelow) : view.exportLayers(fromBelow, true).reverse();
    return exportPdf({
      title: board.name, layers, pages, paper, mirror: pages === 'one' && pdfMirror === 'own' ? 'top' : pdfMirror, colors: pdfColors, box: layerBox,
      outline: outlineEach ? outline : undefined, note: pages === 'one' && highlighted ? `${highlighted} highlighted` : undefined, signal, onProgress,
    });
  }, `${safeFileName(`${name}-${pages === 'one' ? 'layers' : 'layer-pages'}${pdfMirror === 'bottom' ? '-bottom' : ''}`, 'board')}.pdf`);

  const placeOrigin = board.design?.placeOrigin;
  const corner = board.outline?.length ? shapeBox(board.outline) : null;
  const originPoint = (o: DxfOrigin): Pt => (o === 'place' && placeOrigin ? placeOrigin : o === 'board' && corner ? { x: corner.minX, y: corner.minY } : { x: 0, y: 0 });
  const saveDxf = () => run('DXF', (signal, onProgress) => {
    const origin = originPoint(dxfOrigin);
    if (dxfKind === 'outline') {
      const drills = board.layers.filter((l) => l.kind === 'drill');
      const minHole = dxfHoles === 'none' ? Infinity : dxfHoles === 'large' ? 0.5 : 0;
      return exportDxf({ kind: 'outline', outline: board.outline ?? [], drills, minHole, origin, signal, onProgress });
    }
    // The shown layers from the top of the list down.
    const layers = view.exportLayers(false, true).reverse().map(({ layer, color }) => ({ layer, color }));
    return exportDxf({ kind: 'layers', layers, origin, signal, onProgress });
  }, `${safeFileName(`${name}-${dxfKind === 'outline' ? 'outline' : 'layers'}`, 'board')}.dxf`);

  const saveKicad = () => run('KiCad board', async (signal, onProgress) => {
    // The writer (with the stroke font and the polygon booleans) is loaded only now.
    // @ts-expect-error TS2835: TypeScript wants an extension that the bundler does not resolve (see CLAUDE.md).
    const kicad = (await import('../../lib/pcb/export/kicad')) as { exportKicad: typeof exportKicad };
    return kicad.exportKicad(board, { signal, onProgress });
  }, `${safeFileName(board.name, 'board')}.kicad_pcb`);

  const originOptions: [DxfOrigin, string][] = [['file', 'The file’s origin']];
  if (placeOrigin) originOptions.push(['place', `${board.source === 'altium' ? 'The board origin' : 'The drill/place file origin'} (${mm(placeOrigin.x)}, ${mm(placeOrigin.y)} mm)`]);
  if (corner) originOptions.push(['board', `The bottom-left corner of the board (${mm(corner.minX)}, ${mm(corner.minY)} mm)`]);
  const holes = board.layers.filter((l) => l.kind === 'drill').reduce((s, l) => s + l.items.filter((i) => i.k === 'hole').length, 0);
  const box1: Box | null = layerBox;
  const clearNote = clear.length
    ? `${clear.length === 1 ? 'One of the shown layers has' : `${clear.length} of the shown layers have`} clear areas (${clearKinds(board, clear)}: ${clear.map(layerTitle).join(', ')}). `
    : '';

  return (
    <>
      <div className={styles.segmented} role="group" aria-label="Format">
        {FORMATS.filter(([f]) => f !== 'kicad' || toKicad).map(([f, label, title]) => (
          <button key={f} type="button" className={styles.toolButton} aria-pressed={format === f} onClick={() => setFormat(f)} title={title}>{label}</button>
        ))}
      </div>

      {(format === 'png' || format === 'svg') && (
        <>
          <p className={qrStyles.help}>
            {mode === 'realistic' ? `The realistic view of the ${side}` : `The shown layers${flipped ? ', seen from the bottom' : ''}`}
            {format === 'png' ? ', as an image.' : ', as vectors in millimetres at 1:1.'}
            {highlighted && ` With ${highlighted} highlighted, as on screen.`}
          </p>
          <div className={styles.saveFields}>
            <Field label="Area">
              <Select<What> value={what} onChange={setWhat} options={[['board', 'The whole board'], ['screen', 'What is on screen']]} />
            </Field>
            {format === 'png' && what === 'board' && (
              <Field label="Resolution">
                <Select<string> value={resolution} onChange={setResolution} options={RESOLUTIONS} />
              </Field>
            )}
          </div>
          {format === 'png' && what === 'board' && size && (
            <p className={size.fits ? styles.detailNote : qrStyles.warning}>
              {size.width.toLocaleString('en-US')} × {size.height.toLocaleString('en-US')} pixels{size.fits ? '' : ': too large, choose a lower resolution'}.
            </p>
          )}
          <Checkbox label="Transparent background" checked={transparent} onChange={setTransparent} />
          <div className={qrStyles.buttonRow}>
            {format === 'png'
              ? <button type="button" className={qrStyles.buttonSmall} disabled={Boolean(busy) || (what === 'board' && !size?.fits)} onClick={savePng}>Save PNG</button>
              : <button type="button" className={qrStyles.buttonSmall} disabled={Boolean(busy) || !box} onClick={saveSvg}>Save SVG</button>}
            {busy && <button type="button" className={qrStyles.buttonSmall} onClick={() => abort.current?.abort()}>Cancel</button>}
          </div>
        </>
      )}

      {format === 'pdf' && (
        <>
          <p className={qrStyles.help}>
            The layers shown in the layer list{mode === 'realistic' ? ' (not the realistic view)' : ''}, at exactly 1:1, with a title and a scale bar. Each layer can be
            shown and hidden in the PDF viewer. Print it at actual size (100 %).
          </p>
          <div className={styles.saveFields}>
            <Field label="Pages">
              <Select<'one' | 'each'> value={pages} onChange={setPages} options={[['one', 'All layers on one page'], ['each', 'One page per layer']]} />
            </Field>
            <Field label="Paper">
              <Select<PdfPaper> value={paper} onChange={setPaper} options={[['a4', 'A4'], ['a3', 'A3'], ['letter', 'Letter'], ['fit', 'Fitted to the board']]} />
            </Field>
            <Field label="Seen from">
              <Select<PdfMirror>
                value={pages === 'one' && pdfMirror === 'own' ? 'top' : pdfMirror}
                onChange={setMirror}
                options={[['top', 'The top'], ['bottom', 'The bottom (mirrored)'], ...(pages === 'each' ? [['own', 'Each layer from its side'] as [PdfMirror, string]] : [])]}
              />
            </Field>
            <Field label="Colours">
              <Select<PdfColors> value={pdfColors} onChange={setPdfColors} options={[['white', 'Layer colours on white'], ['screen', 'As on screen (dark)'], ['black', 'Black on white']]} />
            </Field>
          </div>
          {outline && <Checkbox label="Board outline on every page" checked={outlineEach} onChange={setOutlineEach} />}
          {layout && box1 && (
            <p className={layout.fits ? styles.detailNote : qrStyles.warning}>
              {`The shown layers are ${mm(box1.maxX - box1.minX)} × ${mm(box1.maxY - box1.minY)} mm with a margin`}
              {layout.fits ? `; on ${paperLabel(paper)} (${mm(layout.w)} × ${mm(layout.h)} mm).` : `: at 1:1 they do not fit on ${paperLabel(paper)} and are cut off. Choose a larger paper or “Fitted to the board”.`}
            </p>
          )}
          <p className={styles.detailNote}>
            {clearNote}
            {clear.length ? 'PDF has no clear polarity, so these layers are flattened with polygon booleans into filled outlines (curves within 2.5 µm), and the PDF stays all vectors.' : 'Everything is drawn as vectors: lines, arcs and pads as they are.'}
            {pages === 'one' && highlighted ? ` ${highlighted[0].toUpperCase()}${highlighted.slice(1)} is highlighted, as on screen.` : ''}
          </p>
          <div className={qrStyles.buttonRow}>
            <button type="button" className={qrStyles.buttonSmall} disabled={Boolean(busy) || !layerBox || !shown.length} onClick={savePdf}>Save PDF</button>
            {busy && <button type="button" className={qrStyles.buttonSmall} onClick={() => abort.current?.abort()}>Cancel</button>}
          </div>
        </>
      )}

      {format === 'dxf' && (
        <>
          <p className={qrStyles.help}>
            A drawing in millimetres for CAD programs: the board outline and its holes (for an enclosure or a mechanical drawing), or the layers shown in the layer
            list, each on a DXF layer of its own.
          </p>
          <div className={styles.saveFields}>
            <Field label="What">
              <Select<'outline' | 'layers'> value={dxfKind} onChange={setDxfKind} options={[['outline', 'Board outline and holes'], ['layers', 'The shown layers']]} />
            </Field>
            <Field label="Origin">
              <Select<DxfOrigin> value={originOptions.some(([o]) => o === dxfOrigin) ? dxfOrigin : 'file'} onChange={setDxfOrigin} options={originOptions} />
            </Field>
            {dxfKind === 'outline' && (
              <Field label="Holes">
                <Select<DxfHoles> value={dxfHoles} onChange={setDxfHoles} options={[['all', 'All holes'], ['large', 'Holes from 0.5 mm (no vias)'], ['none', 'No holes']]} />
              </Field>
            )}
          </div>
          <p className={styles.detailNote}>
            {dxfKind === 'outline'
              ? `${board.outline?.length ? (board.outlineFrom === 'copper' || board.outlineFrom === 'extent' ? 'There is no board outline, so the rectangle around the copper stands in for it' : `The outline: ${count(board.outline.length, 'closed shape')}, arcs as arcs`) : 'There is no board outline'}; ${count(holes, 'hole')} as circles (slots as their outlines), plated and non-plated on layers of their own.`
              : `${clearNote}Lines as polylines with their width, arcs as arcs of polylines, pads and regions as closed outlines, holes as circles.${clear.length ? ' DXF has no clear polarity, so the layers with clear areas are flattened with polygon booleans and written as the outlines of what remains.' : ''}`}
          </p>
          <div className={qrStyles.buttonRow}>
            <button type="button" className={qrStyles.buttonSmall} disabled={Boolean(busy) || (dxfKind === 'layers' ? !shown.length : !board.outline?.length && !holes)} onClick={saveDxf}>Save DXF</button>
            {busy && <button type="button" className={qrStyles.buttonSmall} onClick={() => abort.current?.abort()}>Cancel</button>}
          </div>
        </>
      )}

      {format === 'kicad' && (
        <>
          <p className={qrStyles.help}>
            The design as a KiCad board (.kicad_pcb in KiCad 9’s format, which KiCad 9 and 10 open), to work on in KiCad: the layers with their names,
            nets, footprints with their pads, graphics and texts, tracks, vias, zones and the board outline.
          </p>
          <div className={styles.kicadWarning} role="note">
            <p><strong>The conversion may be incomplete or wrong.</strong> Check the board in KiCad (its layers, footprints and a DRC) before you use it.</p>
            <ul>
              {notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
          <div className={qrStyles.buttonRow}>
            <button type="button" className={qrStyles.buttonSmall} disabled={Boolean(busy)} onClick={saveKicad}>Save KiCad board</button>
            {busy && <button type="button" className={qrStyles.buttonSmall} onClick={() => abort.current?.abort()}>Cancel</button>}
          </div>
        </>
      )}

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
