import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import {
  extractFormXObjects,
  extractRegionAsPdf,
  extractRegionsAsPdfs,
  ViewportRect,
} from '../../lib/pdf/extractVectors';
import {
  baseName,
  canvasToBytes,
  download,
  formatBytes,
  nextFrame,
  OutputFile,
  safeFileName,
  zipFiles,
} from '../../lib/pdf/files';
import { formatPageRanges } from '../../lib/pdf/pages';
import { openPdf, renderPage } from '../../lib/pdf/pdfjs';
import { pdfBytesToSvg, pdfPageRegionToSvg } from '../../lib/pdf/pdfToSvg';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale } from '../../lib/ui/translations';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';
import { Field, NumberInput, Select } from '../UI/Fields';
import { FigureBox, FigureCanvas } from './FigureCanvas';
import { Progress } from './ToolPage';

export interface SourcePdf {
  id: string;
  name: string;
  bytes: Uint8Array;
  imageCount: number;
  skipped: number;
  error: string | null;
  scanning: boolean;
  password?: string;
  locked?: boolean;
}

export interface FormVectorItem {
  id: string;
  sourceId: string;
  sourceName: string;
  stem: string;
  pdfName: string;
  svgName: string;
  pdfBytes: Uint8Array;
  svgBytes: Uint8Array;
  svgUrl: string;
  widthPt: number;
  heightPt: number;
  pages: number[];
  warnings: string[];
}

export type BoxExportFormat = 'svg' | 'pdf' | 'png' | 'svg+pdf';

const UTF8 = new TextEncoder();

export function svgStringToBytes(svg: string): Uint8Array {
  return UTF8.encode(svg);
}

// Extracts Form XObjects from one PDF and converts each to SVG sequentially.
export async function scanSourceFormVectors(
  source: SourcePdf,
  createUrl: (bytes: Uint8Array, mime: string) => string,
  shouldAbort: () => boolean,
  onProgress?: (fraction: number, label: string) => void,
  locale: Locale = 'en',
): Promise<FormVectorItem[]> {
  const forms = await extractFormXObjects(
    source.bytes,
    { sourceName: source.name, password: source.password },
    (f, label) => onProgress?.(f * 0.5, label),
  );
  if (shouldAbort() || !forms.length) return [];

  const items: FormVectorItem[] = [];
  for (let i = 0; i < forms.length; i++) {
    if (shouldAbort()) return items;
    const form = forms[i];
    onProgress?.(
      0.5 + (i / forms.length) * 0.5,
      translate(locale, 'pdf.vec.convertingVector', { i: i + 1, total: forms.length }),
    );
    await nextFrame();

    const svgRes = await pdfBytesToSvg(form.pdfBytes);
    if (shouldAbort()) return items;

    const svgBytes = svgStringToBytes(svgRes.svg);
    const stem = baseName(form.name);
    items.push({
      id: form.id,
      sourceId: source.id,
      sourceName: source.name,
      stem,
      pdfName: `${stem}.pdf`,
      svgName: `${stem}.svg`,
      pdfBytes: form.pdfBytes,
      svgBytes,
      svgUrl: createUrl(svgBytes, 'image/svg+xml'),
      widthPt: form.widthPt,
      heightPt: form.heightPt,
      pages: form.pages,
      warnings: svgRes.warnings,
    });
  }
  onProgress?.(
    1,
    items.length === 1
      ? translate(locale, 'pdf.vec.foundOne')
      : translate(locale, 'pdf.vec.foundMany', { count: items.length }),
  );
  return items;
}

// Renders a PDF page at the requested DPI (clamped for browser canvas limits) and crops `rect` as PNG.
export async function cropPageRegionToPng(
  doc: PDFDocumentProxy,
  pageIndex: number,
  rect: ViewportRect,
  dpi: number,
): Promise<Uint8Array> {
  const clampedDpi = Math.max(72, Math.min(600, Math.round(dpi) || 300));
  const page = await doc.getPage(pageIndex + 1);
  let fullCanvas: HTMLCanvasElement | null = null;
  let cropCanvas: HTMLCanvasElement | null = null;
  try {
    const baseVp = page.getViewport({ scale: 1 });
    const rawScale = clampedDpi / 72;
    const maxScale = Math.min(8192 / Math.max(1, baseVp.width), 8192 / Math.max(1, baseVp.height));
    const scale = Math.max(0.25, Math.min(rawScale, maxScale));

    fullCanvas = await renderPage(page, scale);

    const sx = Math.max(0, Math.min(fullCanvas.width - 1, Math.round(rect.x * scale)));
    const sy = Math.max(0, Math.min(fullCanvas.height - 1, Math.round(rect.y * scale)));
    const sw = Math.max(1, Math.min(fullCanvas.width - sx, Math.round(rect.width * scale)));
    const sh = Math.max(1, Math.min(fullCanvas.height - sy, Math.round(rect.height * scale)));

    cropCanvas = document.createElement('canvas');
    cropCanvas.width = sw;
    cropCanvas.height = sh;
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not create 2D canvas context for PNG export.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    return await canvasToBytes(cropCanvas, 'image/png');
  } finally {
    if (fullCanvas) {
      fullCanvas.width = 0;
      fullCanvas.height = 0;
    }
    if (cropCanvas) {
      cropCanvas.width = 0;
      cropCanvas.height = 0;
    }
    try {
      page.cleanup();
    } catch {
      // Ignore cleanup errors.
    }
  }
}

export async function exportSingleBox(
  box: FigureBox,
  source: SourcePdf,
  format: 'svg' | 'pdf' | 'png',
  pngDpi: number,
  activeDoc: { sourceId: string; doc: PDFDocumentProxy } | null,
): Promise<void> {
  const stem = safeFileName(box.label, `figure-p${box.pageIndex + 1}`);

  if (format === 'pdf') {
    const bytes = await extractRegionAsPdf(
      source.bytes,
      { pageIndex: box.pageIndex, rect: box.rect },
      { password: source.password },
    );
    download(bytes, `${stem}.pdf`, 'application/pdf');
    return;
  }

  let doc: PDFDocumentProxy;
  let closeDoc: (() => Promise<void>) | null = null;
  if (activeDoc && activeDoc.sourceId === source.id) {
    doc = activeDoc.doc;
  } else {
    const opened = await openPdf(source.bytes, source.password);
    doc = opened.doc;
    closeDoc = opened.close;
  }

  try {
    if (format === 'svg') {
      const page = await doc.getPage(box.pageIndex + 1);
      try {
        const ops = await page.getOperatorList();
        const res = await pdfPageRegionToSvg(page, ops, box.rect);
        download(svgStringToBytes(res.svg), `${stem}.svg`, 'image/svg+xml');
      } finally {
        try {
          page.cleanup();
        } catch {
          // Ignore cleanup errors.
        }
      }
    } else {
      const pngBytes = await cropPageRegionToPng(doc, box.pageIndex, box.rect, pngDpi);
      download(pngBytes, `${stem}.png`, 'image/png');
    }
  } finally {
    if (closeDoc) await closeDoc();
  }
}

export async function exportAllBoxes(
  boxes: FigureBox[],
  sources: SourcePdf[],
  format: BoxExportFormat,
  pngDpi: number,
  activeDoc: { sourceId: string; doc: PDFDocumentProxy } | null,
  onProgress?: (fraction: number, label: string) => void,
  locale: Locale = 'en',
): Promise<void> {
  if (!boxes.length) return;
  const srcById = new Map(sources.map((s) => [s.id, s]));

  // Single file shortcut when exporting 1 box in 1 format.
  if (boxes.length === 1 && format !== 'svg+pdf') {
    const src = srcById.get(boxes[0].sourceId);
    if (!src) return;
    onProgress?.(0.3, translate(locale, 'pdf.vec.exportingBox', { label: boxes[0].label }));
    await exportSingleBox(boxes[0], src, format, pngDpi, activeDoc);
    onProgress?.(1, translate(locale, 'pdf.vec.done'));
    return;
  }

  const outFiles: OutputFile[] = [];
  const bySource = new Map<string, FigureBox[]>();
  for (const box of boxes) {
    const list = bySource.get(box.sourceId) ?? [];
    list.push(box);
    bySource.set(box.sourceId, list);
  }

  const wantPdf = format === 'pdf' || format === 'svg+pdf';
  const wantSvg = format === 'svg' || format === 'svg+pdf';
  const wantPng = format === 'png';

  const totalSteps =
    boxes.length * ((wantPdf ? 1 : 0) + (wantSvg ? 1 : 0) + (wantPng ? 1 : 0));
  let doneSteps = 0;

  for (const [sourceId, srcBoxes] of bySource.entries()) {
    const src = srcById.get(sourceId);
    if (!src) continue;

    if (wantPdf) {
      const pdfs = await extractRegionsAsPdfs(
        src.bytes,
        srcBoxes.map((b, i) => ({
          name: safeFileName(b.label, `figure-${i + 1}`),
          pageIndex: b.pageIndex,
          rect: b.rect,
        })),
        { password: src.password },
        (f, label) => {
          onProgress?.((doneSteps + f * srcBoxes.length) / Math.max(1, totalSteps), label);
        },
      );
      outFiles.push(...pdfs);
      doneSteps += srcBoxes.length;
    }

    if (wantSvg || wantPng) {
      let doc: PDFDocumentProxy;
      let closeDoc: (() => Promise<void>) | null = null;
      if (activeDoc && activeDoc.sourceId === src.id) {
        doc = activeDoc.doc;
      } else {
        const opened = await openPdf(src.bytes, src.password);
        doc = opened.doc;
        closeDoc = opened.close;
      }

      try {
        const byPage = new Map<number, FigureBox[]>();
        for (const b of srcBoxes) {
          const list = byPage.get(b.pageIndex) ?? [];
          list.push(b);
          byPage.set(b.pageIndex, list);
        }

        for (const [pageIdx, pageBoxes] of byPage.entries()) {
          if (wantSvg) {
            const page = await doc.getPage(pageIdx + 1);
            try {
              const ops = await page.getOperatorList();
              for (let i = 0; i < pageBoxes.length; i++) {
                const b = pageBoxes[i];
                onProgress?.(
                  doneSteps / Math.max(1, totalSteps),
                  translate(locale, 'pdf.vec.convertingSvg', { label: b.label }),
                );
                await nextFrame();
                const res = await pdfPageRegionToSvg(page, ops, b.rect);
                const stem = safeFileName(b.label, `figure-p${pageIdx + 1}`);
                outFiles.push({ name: `${stem}.svg`, bytes: svgStringToBytes(res.svg) });
                doneSteps++;
              }
            } finally {
              try {
                page.cleanup();
              } catch {
                // Ignore cleanup errors.
              }
            }
          }

          if (wantPng) {
            for (let i = 0; i < pageBoxes.length; i++) {
              const b = pageBoxes[i];
              onProgress?.(
                doneSteps / Math.max(1, totalSteps),
                translate(locale, 'pdf.vec.renderingPng', { label: b.label }),
              );
              await nextFrame();
              const pngBytes = await cropPageRegionToPng(doc, pageIdx, b.rect, pngDpi);
              const stem = safeFileName(b.label, `figure-p${pageIdx + 1}`);
              outFiles.push({ name: `${stem}.png`, bytes: pngBytes });
              doneSteps++;
            }
          }
        }
      } finally {
        if (closeDoc) await closeDoc();
      }
    }
  }

  if (!outFiles.length) return;
  const firstSrc = sources[0];
  const baseZip = firstSrc ? `${safeFileName(baseName(firstSrc.name), 'document')}-figures` : 'extracted-figures';
  const zip = zipFiles(outFiles);
  download(zip, `${baseZip}.zip`, 'application/zip');
  onProgress?.(
    1,
    outFiles.length === 1
      ? translate(locale, 'pdf.vec.exportedOne')
      : translate(locale, 'pdf.vec.exportedMany', { count: outFiles.length }),
  );
}

/* ---------- Tab 2: Embedded Vectors (Form XObjects) ---------- */

export function EmbeddedVectorsPanel({
  vectors,
  sourcesCount,
  scanning,
  onSwitchToCrop,
}: {
  vectors: FormVectorItem[];
  sourcesCount: number;
  scanning: boolean;
  onSwitchToCrop: () => void;
}) {
  const { t } = useI18n();
  if (!scanning && vectors.length === 0) {
    return (
      <div className={styles.options}>
        <p className={styles.note}>
          {sourcesCount === 1 ? t('pdf.vec.noneOne') : t('pdf.vec.noneMany')}
        </p>
        <div>
          <button type="button" className={styles.buttonSmall} onClick={onSwitchToCrop}>
            {t('pdf.vec.openDetectCrop')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <ul className={styles.fileGrid}>
      {vectors.map((item) => {
        const pageList = formatPageRanges(item.pages.map((p) => p - 1));
        return (
          <li key={item.id} className={styles.fileCard}>
            <div className={[styles.thumb, styles.thumbPaper].join(' ')}>
              <img src={item.svgUrl} alt={item.stem} loading="lazy" />
            </div>
            <span className={styles.badgeVector}>{t('pdf.vec.badgeVector')}</span>
            {item.warnings.length > 0 && (
              <span className={styles.badgeWarn} title={item.warnings.join(' ')}>
                {t('pdf.vec.badgeNote')}
              </span>
            )}
            <div className={styles.fileName} title={item.stem}>{item.stem}</div>
            <div className={styles.fileMeta}>
              {Math.round(item.widthPt)} &times; {Math.round(item.heightPt)} pt
            </div>
            <div className={styles.fileMeta}>
              {item.pages.length === 1
                ? t('pdf.vec.pageOne', { list: pageList })
                : t('pdf.vec.pagesMany', { list: pageList })}
              {sourcesCount > 1 ? ` · ${item.sourceName}` : ''}
            </div>
            <div className={styles.cardFooter}>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => download(item.svgBytes, item.svgName, 'image/svg+xml')}
                >
                  SVG
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => download(item.pdfBytes, item.pdfName, 'application/pdf')}
                >
                  PDF
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function EmbeddedVectorsSidebar({
  vectors,
  zipName,
  onZipNameChange,
  busy,
  progress,
}: {
  vectors: FormVectorItem[];
  zipName: string;
  onZipNameChange: (v: string) => void;
  busy: boolean;
  progress: { fraction: number; label: string };
}) {
  const { t } = useI18n();
  const totalSvgBytes = React.useMemo(
    () => vectors.reduce((sum, v) => sum + v.svgBytes.length, 0),
    [vectors],
  );
  const totalPdfBytes = React.useMemo(
    () => vectors.reduce((sum, v) => sum + v.pdfBytes.length, 0),
    [vectors],
  );

  function downloadAllVectors(kind: 'svg' | 'pdf') {
    if (!vectors.length) return;
    if (vectors.length === 1) {
      const only = vectors[0];
      if (kind === 'svg') download(only.svgBytes, only.svgName, 'image/svg+xml');
      else download(only.pdfBytes, only.pdfName, 'application/pdf');
      return;
    }
    const files: OutputFile[] = vectors.map((v) => ({
      name: kind === 'svg' ? v.svgName : v.pdfName,
      bytes: kind === 'svg' ? v.svgBytes : v.pdfBytes,
    }));
    const zip = zipFiles(files);
    const stem = safeFileName(zipName, 'extracted-vectors').replace(/\.zip$/i, '');
    download(zip, `${stem}-${kind}.zip`, 'application/zip');
  }

  return (
    <>
      {vectors.length > 1 && (
        <div className={styles.options}>
          <Field label={t('pdf.vec.zipName')}>
            <input
              className={fieldStyles.input}
              value={zipName}
              onChange={(e) => onZipNameChange(e.target.value)}
            />
          </Field>
        </div>
      )}

      <div className={styles.summaryBox}>
        <div className={styles.summaryRow}>
          <span>{t('pdf.vec.embeddedVectors')}</span>
          <span>{vectors.length}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>{t('pdf.vec.totalSvgSize')}</span>
          <span>{formatBytes(totalSvgBytes)}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>{t('pdf.vec.totalPdfSize')}</span>
          <span>{formatBytes(totalPdfBytes)}</span>
        </div>
      </div>

      <p className={styles.note}>{t('pdf.vec.losslessNote')}</p>

      <button
        type="button"
        className={styles.primary}
        disabled={busy || vectors.length === 0}
        onClick={() => downloadAllVectors('svg')}
      >
        {vectors.length === 1
          ? t('pdf.vec.downloadSvg')
          : t('pdf.vec.downloadAllSvg', { count: vectors.length })}
      </button>

      <button
        type="button"
        className={styles.button}
        disabled={busy || vectors.length === 0}
        onClick={() => downloadAllVectors('pdf')}
      >
        {vectors.length === 1
          ? t('pdf.vec.downloadVectorPdf')
          : t('pdf.vec.downloadAllVectorPdf', { count: vectors.length })}
      </button>

      {busy && <Progress fraction={progress.fraction} label={progress.label} />}
    </>
  );
}

/* ---------- Tab 3: Detect & Crop Figures ---------- */

export function DetectCropPanel({
  unlockedSources,
  activeSourceId,
  onSelectSource,
  doc,
  pageIndex,
  pageCount,
  onPageChange,
  boxes,
  selectedId,
  onSelectBox,
  onAddBox,
  onUpdateBox,
  onDeleteBox,
  onTightenBox,
  onPageSize,
  onDetectPage,
  onDetectAllPages,
  busy,
}: {
  unlockedSources: SourcePdf[];
  activeSourceId: string;
  onSelectSource: (id: string) => void;
  doc: PDFDocumentProxy | null;
  pageIndex: number;
  pageCount: number;
  onPageChange: (nextIndex: number) => void;
  boxes: FigureBox[];
  selectedId: string | null;
  onSelectBox: (id: string | null) => void;
  onAddBox: (rect: ViewportRect) => void;
  onUpdateBox: (id: string, rect: ViewportRect) => void;
  onDeleteBox: (id: string) => void;
  onTightenBox: (id: string) => void;
  onPageSize: (size: { width: number; height: number }) => void;
  onDetectPage: () => void;
  onDetectAllPages: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  if (!unlockedSources.length) {
    return <p className={styles.note}>{t('pdf.vec.unlockNote')}</p>;
  }

  return (
    <div>
      <div className={styles.canvasToolbar}>
        {unlockedSources.length > 1 && (
          <select
            className={styles.canvasSourceSelect}
            aria-label={t('pdf.vec.activeDocAria')}
            value={activeSourceId}
            onChange={(e) => onSelectSource(e.target.value)}
          >
            {unlockedSources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        <div className={styles.canvasNav}>
          <button
            type="button"
            className={styles.buttonSmall}
            disabled={!doc || pageIndex <= 0}
            onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
          >
            {t('pdf.vec.prev')}
          </button>
          <span className={styles.canvasPageInfo}>
            {t('pdf.vec.pageOf', { current: pageCount > 0 ? pageIndex + 1 : 0, total: pageCount })}
          </span>
          <button
            type="button"
            className={styles.buttonSmall}
            disabled={!doc || pageIndex >= pageCount - 1}
            onClick={() => onPageChange(Math.min(pageCount - 1, pageIndex + 1))}
          >
            {t('pdf.vec.next')}
          </button>
        </div>

        <span className={styles.toolbarSpacer} />

        <button
          type="button"
          className={styles.buttonSmall}
          disabled={!doc || busy}
          onClick={onDetectPage}
        >
          {t('pdf.vec.autoDetectPage')}
        </button>
        <button
          type="button"
          className={styles.buttonSmall}
          disabled={!doc || busy}
          onClick={onDetectAllPages}
        >
          {t('pdf.vec.autoDetectAll')}
        </button>
      </div>

      <p className={styles.canvasTip}>{t('pdf.vec.canvasTip')}</p>

      <FigureCanvas
        doc={doc}
        sourceId={activeSourceId}
        pageIndex={pageIndex}
        boxes={boxes}
        selectedId={selectedId}
        onSelect={onSelectBox}
        onAddBox={onAddBox}
        onUpdateBox={onUpdateBox}
        onDeleteBox={onDeleteBox}
        onTightenBox={onTightenBox}
        onPageSize={onPageSize}
      />
    </div>
  );
}

export function DetectCropSidebar({
  boxes,
  selectedBox,
  mergeGapPt,
  minSizePt,
  paddingPt,
  exportFormat,
  pngDpi,
  notice,
  busy,
  progress,
  onMergeGapChange,
  onMinSizeChange,
  onPaddingChange,
  onExportFormatChange,
  onPngDpiChange,
  onLabelChange,
  onTightenBox,
  onPadBox,
  onDuplicateBox,
  onDeleteBox,
  onJumpToBox,
  onDownloadBox,
  onClearPage,
  onClearAll,
  onDownloadAll,
  pageBoxesCount,
}: {
  boxes: FigureBox[];
  selectedBox: FigureBox | null;
  mergeGapPt: number;
  minSizePt: number;
  paddingPt: number;
  exportFormat: BoxExportFormat;
  pngDpi: number;
  notice: string | null;
  busy: boolean;
  progress: { fraction: number; label: string };
  onMergeGapChange: (v: number) => void;
  onMinSizeChange: (v: number) => void;
  onPaddingChange: (v: number) => void;
  onExportFormatChange: (v: BoxExportFormat) => void;
  onPngDpiChange: (v: number) => void;
  onLabelChange: (id: string, label: string) => void;
  onTightenBox: (id: string) => void;
  onPadBox: (id: string, deltaPt: number) => void;
  onDuplicateBox: (id: string) => void;
  onDeleteBox: (id: string) => void;
  onJumpToBox: (box: FigureBox) => void;
  onDownloadBox: (box: FigureBox, format: 'svg' | 'pdf' | 'png') => void;
  onClearPage: () => void;
  onClearAll: () => void;
  onDownloadAll: () => void;
  pageBoxesCount: number;
}) {
  const { t } = useI18n();
  const formatLabel =
    exportFormat === 'svg'
      ? 'SVG'
      : exportFormat === 'pdf'
        ? t('pdf.vec.vectorPdf')
        : exportFormat === 'png'
          ? 'PNG'
          : 'SVG + PDF';

  return (
    <>
      <div className={styles.options}>
        <h3>{t('pdf.vec.detectionSettings')}</h3>
        <div className={styles.optionRowThree}>
          <Field label={t('pdf.vec.mergeGap')}>
            <NumberInput value={mergeGapPt} onChange={onMergeGapChange} min={0} max={100} />
          </Field>
          <Field label={t('pdf.vec.minSize')}>
            <NumberInput value={minSizePt} onChange={onMinSizeChange} min={8} max={400} />
          </Field>
          <Field label={t('pdf.vec.padding')}>
            <NumberInput value={paddingPt} onChange={onPaddingChange} min={0} max={50} />
          </Field>
        </div>
      </div>

      {selectedBox && (
        <div className={styles.inspectorBox}>
          <div className={styles.inspectorHeader}>
            <span>{t('pdf.vec.selectedFigure')}</span>
            <span className={styles.inspectorMeta}>
              {t('pdf.vec.pageShort', { n: selectedBox.pageIndex + 1 })} · {Math.round(selectedBox.rect.width)} &times; {Math.round(selectedBox.rect.height)} pt
            </span>
          </div>

          <Field label={t('pdf.vec.labelFilename')}>
            <input
              className={fieldStyles.input}
              value={selectedBox.label}
              onChange={(e) => onLabelChange(selectedBox.id, e.target.value)}
            />
          </Field>

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.buttonSmall}
              disabled={busy}
              onClick={() => onTightenBox(selectedBox.id)}
            >
              {t('pdf.vec.snapTighten')}
            </button>
            <button
              type="button"
              className={styles.buttonSmall}
              onClick={() => onPadBox(selectedBox.id, 4)}
            >
              {t('pdf.vec.padPlus')}
            </button>
            <button
              type="button"
              className={styles.buttonSmall}
              onClick={() => onPadBox(selectedBox.id, -4)}
            >
              {t('pdf.vec.shrinkMinus')}
            </button>
          </div>

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.buttonSmall}
              onClick={() => onDuplicateBox(selectedBox.id)}
            >
              {t('pdf.vec.duplicate')}
            </button>
            <button
              type="button"
              className={styles.buttonSmall}
              onClick={() => onDeleteBox(selectedBox.id)}
            >
              {t('pdf.vec.delete')}
            </button>
          </div>

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.buttonSmall}
              disabled={busy}
              onClick={() => onDownloadBox(selectedBox, 'svg')}
            >
              {t('pdf.vec.downloadSvg')}
            </button>
            <button
              type="button"
              className={styles.buttonSmall}
              disabled={busy}
              onClick={() => onDownloadBox(selectedBox, 'pdf')}
            >
              {t('pdf.vec.downloadPdf')}
            </button>
            <button
              type="button"
              className={styles.buttonSmall}
              disabled={busy}
              onClick={() => onDownloadBox(selectedBox, 'png')}
            >
              {t('pdf.vec.downloadPng')}
            </button>
          </div>
        </div>
      )}

      {notice && <p className={fieldStyles.warning}>{notice}</p>}

      <div className={styles.options}>
        <h3>{t('pdf.vec.figuresHeading', { count: boxes.length })}</h3>
        {boxes.length === 0 ? (
          <p className={styles.note}>
            {t('pdf.vec.noFiguresPrefix')}
            <strong>{t('pdf.vec.autoDetectPage')}</strong>
            {t('pdf.vec.noFiguresSuffix')}
          </p>
        ) : (
          <div className={styles.boxList}>
            {boxes.map((box) => {
              const isSelected = selectedBox?.id === box.id;
              return (
                <div
                  key={box.id}
                  className={[
                    styles.boxListItem,
                    isSelected ? styles.boxListItemSelected : '',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    className={styles.boxListMain}
                    onClick={() => onJumpToBox(box)}
                  >
                    <span className={styles.boxListTitle} title={box.label}>{box.label}</span>
                    <span className={styles.boxListMeta}>
                      {t('pdf.vec.pageShort', { n: box.pageIndex + 1 })} · {Math.round(box.rect.width)} &times; {Math.round(box.rect.height)} pt
                    </span>
                  </button>
                  <div className={styles.boxListActions}>
                    <button
                      type="button"
                      className={styles.miniBtn}
                      disabled={busy}
                      title={t('pdf.vec.downloadSvg')}
                      onClick={() => onDownloadBox(box, 'svg')}
                    >
                      SVG
                    </button>
                    <button
                      type="button"
                      className={styles.miniBtn}
                      disabled={busy}
                      title={t('pdf.vec.downloadPdf')}
                      onClick={() => onDownloadBox(box, 'pdf')}
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      className={[styles.miniBtn, styles.miniBtnDanger].join(' ')}
                      title={t('pdf.canvas.deleteNamed', { label: box.label })}
                      aria-label={t('pdf.canvas.deleteNamed', { label: box.label })}
                      onClick={() => onDeleteBox(box.id)}
                    >
                      &times;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {boxes.length > 0 && (
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.buttonSmall}
              disabled={pageBoxesCount === 0}
              onClick={onClearPage}
            >
              {t('pdf.vec.clearPage')}
            </button>
            <button
              type="button"
              className={styles.buttonSmall}
              onClick={onClearAll}
            >
              {t('pdf.vec.clearAll')}
            </button>
          </div>
        )}
      </div>

      <div className={styles.options}>
        <div className={styles.optionRow}>
          <Field label={t('pdf.vec.exportFormat')}>
            <Select
              value={exportFormat}
              onChange={onExportFormatChange}
              options={[
                ['svg', 'SVG'],
                ['pdf', t('pdf.vec.vectorPdf')],
                ['png', 'PNG'],
                ['svg+pdf', 'SVG + PDF'],
              ]}
            />
          </Field>
          <Field label={t('pdf.vec.pngDpi')}>
            <NumberInput value={pngDpi} onChange={onPngDpiChange} min={72} max={600} />
          </Field>
        </div>
      </div>

      <button
        type="button"
        className={styles.primary}
        disabled={busy || boxes.length === 0}
        onClick={onDownloadAll}
      >
        {boxes.length === 1 && exportFormat !== 'svg+pdf'
          ? t('pdf.vec.downloadFigure', { format: formatLabel })
          : boxes.length === 1
            ? t('pdf.vec.downloadAllOne')
            : t('pdf.vec.downloadAllMany', { count: boxes.length })}
      </button>

      {busy && <Progress fraction={progress.fraction} label={progress.label} />}
    </>
  );
}
