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
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PcbViewer.module.css';
import fieldStyles from '../../styles/Fields.module.css';
import { Checkbox, Field, Select } from '../UI/Fields';

type Format = 'png' | 'svg' | 'pdf' | 'dxf' | 'kicad';
type What = 'screen' | 'board';

const FORMATS: [Format, string, TranslationKey][] = [
  ['png', 'PNG', 'pcb.save.pngTip'],
  ['svg', 'SVG', 'pcb.save.svgTip'],
  ['pdf', 'PDF', 'pcb.save.pdfTip'],
  ['dxf', 'DXF', 'pcb.save.dxfTip'],
  ['kicad', 'KiCad', 'pcb.save.kicadTip'],
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

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
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
  const { t, locale } = useI18n();
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

  const clearKinds = (layers: Layer[]): string => {
    const kinds = new Set<string>();
    for (const l of layers) {
      if (l.negative) kinds.add(t('pcb.save.clrNeg'));
      if (board.source === 'eagle' && l.kind === 'copper') kinds.add(t('pcb.save.clrEagle'));
      else if (board.design?.planes?.some((p) => p.layer === l.id)) kinds.add(board.source === 'pads' ? t('pcb.save.clrPlanesPads') : t('pcb.save.clrPlanes'));
      else if (board.source === 'gerber') kinds.add(t('pcb.save.clrGerber'));
      else kinds.add(t('pcb.save.clrKnockout'));
    }
    return [...kinds].join(', ');
  };

  const pxPerMm = Number(resolution);
  // The size changes with the shown layers (layer view) and the board (realistic view).
  const box = React.useMemo(() => boardImageBox(board, mode, layerStyles), [mode, layerStyles, board]);
  const layerBox = React.useMemo(() => boardImageBox(board, 'layers', layerStyles), [layerStyles, board]);
  const size = box ? imageSize(box, pxPerMm) : null;
  const side = flipped ? 'bottom' : 'top';
  const sideLabel = flipped ? t('pcb.ws.bottom').toLowerCase() : t('pcb.ws.top').toLowerCase();
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
      if (!(e instanceof Cancelled)) setError(t('pcb.save.err', { kind, msg: errorMessage(e) }));
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
    if (!area) throw new Error(t('pcb.save.nothing'));
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
    if (!layerBox) throw new Error(t('pcb.save.nothing'));
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

  const saveKicad = () => run('KiCad', async (signal, onProgress) => {
    // The writer (with the stroke font and the polygon booleans) is loaded only now.
    // @ts-expect-error TS2835: TypeScript wants an extension that the bundler does not resolve (see CLAUDE.md).
    const kicad = (await import('../../lib/pcb/export/kicad')) as { exportKicad: typeof exportKicad };
    return kicad.exportKicad(board, { signal, onProgress });
  }, `${safeFileName(board.name, 'board')}.kicad_pcb`);

  const originOptions: [DxfOrigin, string][] = [['file', t('pcb.asm.originFile')]];
  if (placeOrigin) {
    originOptions.push(['place', `${board.source === 'altium' ? t('pcb.asm.originBoard') : t('pcb.asm.originDrill')} (${mm(placeOrigin.x)}, ${mm(placeOrigin.y)} mm)`]);
  }
  if (corner) originOptions.push(['board', t('pcb.asm.originCorner', { x: mm(corner.minX), y: mm(corner.minY) })]);
  const holes = board.layers.filter((l) => l.kind === 'drill').reduce((s, l) => s + l.items.filter((i) => i.k === 'hole').length, 0);
  const box1: Box | null = layerBox;
  const clearNote = clear.length
    ? t(clear.length === 1 ? 'pcb.save.clearOne' : 'pcb.save.clearMany', {
        n: clear.length,
        kinds: clearKinds(clear),
        names: clear.map(layerTitle).join(', '),
      })
    : '';
  const fmtInt = (n: number) => n.toLocaleString(locale === 'nb' ? 'nb-NO' : 'en-US');
  const paperName = paper === 'fit' ? t('pcb.save.paperFit') : paperLabel(paper);
  const dxfOutlinePart = board.outline?.length
    ? (board.outlineFrom === 'copper' || board.outlineFrom === 'extent'
      ? t('pcb.save.dxfNoOutCopper')
      : t('pcb.save.dxfOutShapes', { shapes: count(board.outline.length, t('pcb.save.shapeOne'), t('pcb.save.shapeMany')) }))
    : t('pcb.save.dxfNoOut');

  return (
    <>
      <div className={styles.segmented} role="group" aria-label={t('pcb.save.formatAria')}>
        {FORMATS.filter(([f]) => f !== 'kicad' || toKicad).map(([f, label, tipKey]) => (
          <button key={f} type="button" className={styles.toolButton} aria-pressed={format === f} onClick={() => setFormat(f)} title={t(tipKey)}>{label}</button>
        ))}
      </div>

      {(format === 'png' || format === 'svg') && (
        <>
          <p className={fieldStyles.help}>
            {mode === 'realistic'
              ? t('pcb.save.realSide', { side: sideLabel })
              : `${t('pcb.save.shownLayers')}${flipped ? t('pcb.save.seenBottom') : ''}`}
            {format === 'png' ? t('pcb.save.asImage') : t('pcb.save.asVectors')}
            {highlighted && t('pcb.save.withHl', { hl: highlighted })}
          </p>
          <div className={styles.saveFields}>
            <Field label={t('pcb.save.area')}>
              <Select<What> value={what} onChange={setWhat} options={[['board', t('pcb.save.wholeBoard')], ['screen', t('pcb.save.onScreen')]]} />
            </Field>
            {format === 'png' && what === 'board' && (
              <Field label={t('pcb.save.resolution')}>
                <Select<string> value={resolution} onChange={setResolution} options={RESOLUTIONS} />
              </Field>
            )}
          </div>
          {format === 'png' && what === 'board' && size && (
            <p className={size.fits ? styles.detailNote : fieldStyles.warning}>
              {t('pcb.save.pixels', { w: fmtInt(size.width), h: fmtInt(size.height), tooLarge: size.fits ? '' : t('pcb.save.tooLarge') })}
            </p>
          )}
          <Checkbox label={t('pcb.save.transparent')} checked={transparent} onChange={setTransparent} />
          <div className={fieldStyles.buttonRow}>
            {format === 'png'
              ? <button type="button" className={fieldStyles.buttonSmall} disabled={Boolean(busy) || (what === 'board' && !size?.fits)} onClick={savePng}>{t('pcb.save.savePng')}</button>
              : <button type="button" className={fieldStyles.buttonSmall} disabled={Boolean(busy) || !box} onClick={saveSvg}>{t('pcb.save.saveSvg')}</button>}
            {busy && <button type="button" className={fieldStyles.buttonSmall} onClick={() => abort.current?.abort()}>{t('pcb.save.cancel')}</button>}
          </div>
        </>
      )}

      {format === 'pdf' && (
        <>
          <p className={fieldStyles.help}>
            {t('pcb.save.pdfHelp', { notReal: mode === 'realistic' ? t('pcb.save.notReal') : '' })}
          </p>
          <div className={styles.saveFields}>
            <Field label={t('pcb.save.pages')}>
              <Select<'one' | 'each'> value={pages} onChange={setPages} options={[['one', t('pcb.save.pagesOne')], ['each', t('pcb.save.pagesEach')]]} />
            </Field>
            <Field label={t('pcb.save.paper')}>
              <Select<PdfPaper> value={paper} onChange={setPaper} options={[['a4', 'A4'], ['a3', 'A3'], ['letter', 'Letter'], ['fit', t('pcb.save.paperFit')]]} />
            </Field>
            <Field label={t('pcb.save.seenFrom')}>
              <Select<PdfMirror>
                value={pages === 'one' && pdfMirror === 'own' ? 'top' : pdfMirror}
                onChange={setMirror}
                options={[['top', t('pcb.save.fromTop')], ['bottom', t('pcb.save.fromBottom')], ...(pages === 'each' ? [['own', t('pcb.save.fromOwn')] as [PdfMirror, string]] : [])]}
              />
            </Field>
            <Field label={t('pcb.save.colours')}>
              <Select<PdfColors> value={pdfColors} onChange={setPdfColors} options={[['white', t('pcb.save.colWhite')], ['screen', t('pcb.save.colScreen')], ['black', t('pcb.save.colBlack')]]} />
            </Field>
          </div>
          {outline && <Checkbox label={t('pcb.save.outlineEach')} checked={outlineEach} onChange={setOutlineEach} />}
          {layout && box1 && (
            <p className={layout.fits ? styles.detailNote : fieldStyles.warning}>
              {layout.fits
                ? t('pcb.save.pdfFits', { w: mm(box1.maxX - box1.minX), h: mm(box1.maxY - box1.minY), paper: paperName, pw: mm(layout.w), ph: mm(layout.h) })
                : t('pcb.save.pdfNoFit', { w: mm(box1.maxX - box1.minX), h: mm(box1.maxY - box1.minY), paper: paperName })}
            </p>
          )}
          <p className={styles.detailNote}>
            {clearNote}
            {clear.length ? t('pcb.save.pdfClear') : t('pcb.save.pdfVectors')}
            {pages === 'one' && highlighted ? t('pcb.save.pdfHl', { hl: `${highlighted[0].toUpperCase()}${highlighted.slice(1)}` }) : ''}
          </p>
          <div className={fieldStyles.buttonRow}>
            <button type="button" className={fieldStyles.buttonSmall} disabled={Boolean(busy) || !layerBox || !shown.length} onClick={savePdf}>{t('pcb.save.savePdf')}</button>
            {busy && <button type="button" className={fieldStyles.buttonSmall} onClick={() => abort.current?.abort()}>{t('pcb.save.cancel')}</button>}
          </div>
        </>
      )}

      {format === 'dxf' && (
        <>
          <p className={fieldStyles.help}>{t('pcb.save.dxfHelp')}</p>
          <div className={styles.saveFields}>
            <Field label={t('pcb.save.what')}>
              <Select<'outline' | 'layers'> value={dxfKind} onChange={setDxfKind} options={[['outline', t('pcb.save.dxfOutline')], ['layers', t('pcb.save.dxfLayers')]]} />
            </Field>
            <Field label={t('pcb.save.origin')}>
              <Select<DxfOrigin> value={originOptions.some(([o]) => o === dxfOrigin) ? dxfOrigin : 'file'} onChange={setDxfOrigin} options={originOptions} />
            </Field>
            {dxfKind === 'outline' && (
              <Field label={t('pcb.save.holes')}>
                <Select<DxfHoles> value={dxfHoles} onChange={setDxfHoles} options={[['all', t('pcb.save.holesAll')], ['large', t('pcb.save.holesLarge')], ['none', t('pcb.save.holesNone')]]} />
              </Field>
            )}
          </div>
          <p className={styles.detailNote}>
            {dxfKind === 'outline'
              ? t('pcb.save.dxfOutNote', { outline: dxfOutlinePart, holes: count(holes, t('pcb.save.holeOne'), t('pcb.save.holeMany')) })
              : `${clearNote}${t('pcb.save.dxfLayersNote')}${clear.length ? t('pcb.save.dxfClear') : ''}`}
          </p>
          <div className={fieldStyles.buttonRow}>
            <button type="button" className={fieldStyles.buttonSmall} disabled={Boolean(busy) || (dxfKind === 'layers' ? !shown.length : !board.outline?.length && !holes)} onClick={saveDxf}>{t('pcb.save.saveDxf')}</button>
            {busy && <button type="button" className={fieldStyles.buttonSmall} onClick={() => abort.current?.abort()}>{t('pcb.save.cancel')}</button>}
          </div>
        </>
      )}

      {format === 'kicad' && (
        <>
          <p className={fieldStyles.help}>{t('pcb.save.kicadHelp')}</p>
          <div className={styles.kicadWarning} role="note">
            <p><strong>{t('pcb.save.kicadWarnStrong')}</strong>{t('pcb.save.kicadWarnBody')}</p>
            <ul>
              {notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
          <div className={fieldStyles.buttonRow}>
            <button type="button" className={fieldStyles.buttonSmall} disabled={Boolean(busy)} onClick={saveKicad}>{t('pcb.save.saveKicad')}</button>
            {busy && <button type="button" className={fieldStyles.buttonSmall} onClick={() => abort.current?.abort()}>{t('pcb.save.cancel')}</button>}
          </div>
        </>
      )}

      {busy && (
        <div className={styles.progress} role="status" aria-label={t('pcb.save.savingAria', { kind: busy.kind })}>
          <span>{t('pcb.save.savingPct', { kind: busy.kind, pct: Math.round(busy.progress * 100) })}</span>
          <div className={styles.progressBar}><div style={{ width: `${Math.round(busy.progress * 100)}%` }} /></div>
        </div>
      )}
      {error && <p className={fieldStyles.warning}>{error}</p>}
    </>
  );
}
