import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { CropCanvas } from '../../components/PdfTools/CropCanvas';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, NumberInput, Select } from '../../components/QrGen/fields';
import { CropOptions, NormalizedCropRect, PageBoxInfo } from '../../lib/pdf/crop';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  readBytes,
  safeFileName,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { parsePageRanges } from '../../lib/pdf/merge';
import { openPdf } from '../../lib/pdf/pdfjs';
import { CROP } from '../../lib/pdf/tools';
import { runCropPdf, runGetPageBoxes } from '../../lib/pdf/workerClient';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

type CropScope = 'all' | 'current' | 'odd' | 'even' | 'range';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  boxes: PageBoxInfo[];
  password?: string;
}

interface LockedFile {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

const FULL_RECT: NormalizedCropRect = { left: 0, top: 0, right: 1, bottom: 1 };
const PT_TO_MM = 25.4 / 72;

function fmtPt(v: number): string {
  return Math.round(v * 10) / 10 === Math.round(v) ? String(Math.round(v)) : v.toFixed(1);
}

function fmtMm(pt: number): string {
  return (pt * PT_TO_MM).toFixed(1);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function isFullRect(r: NormalizedCropRect): boolean {
  return r.left <= 0.0005 && r.top <= 0.0005 && r.right >= 0.9995 && r.bottom >= 0.9995;
}

export default function CropPdfPage() {
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [pdfProxy, setPdfProxy] = React.useState<PDFDocumentProxy | null>(null);
  const closeProxyRef = React.useRef<(() => Promise<void>) | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageJump, setPageJump] = React.useState('1');
  const [scope, setScope] = React.useState<CropScope>('all');
  const [pageRange, setPageRange] = React.useState('');
  const [resetCrop, setResetCrop] = React.useState(false);
  const [uniformRect, setUniformRect] = React.useState<NormalizedCropRect>(FULL_RECT);
  const [perPageCrops, setPerPageCrops] = React.useState<Record<number, NormalizedCropRect>>({});
  const [fileName, setFileName] = React.useState('');

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ bytes: Uint8Array; croppedBoxes: PageBoxInfo[] } | null>(null);

  const closeCurrentProxy = React.useCallback(() => {
    const closer = closeProxyRef.current;
    closeProxyRef.current = null;
    setPdfProxy(null);
    if (closer) void closer().catch(() => undefined);
  }, []);

  React.useEffect(() => () => closeCurrentProxy(), [closeCurrentProxy]);

  React.useEffect(() => {
    setPageJump(String(pageIndex + 1));
  }, [pageIndex]);

  React.useEffect(() => {
    setResult(null);
  }, [doc, scope, pageRange, resetCrop, uniformRect, perPageCrops]);

  async function openBytes(name: string, bytes: Uint8Array, password?: string) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const boxes = await runGetPageBoxes(bytes, password);
      const handle = await openPdf(bytes, password);
      closeCurrentProxy();
      closeProxyRef.current = handle.close;
      setPdfProxy(handle.doc);
      setLocked(null);
      setDoc({ name, bytes, boxes, password });
      setPageIndex(0);
      setScope('all');
      setPageRange('');
      setResetCrop(false);
      setUniformRect(FULL_RECT);
      setPerPageCrops({});
      setFileName(`${baseName(name)}-cropped`);
    } catch (e) {
      if (isPasswordError(e)) {
        setLocked({
          name,
          bytes,
          error: password !== undefined ? 'Incorrect password. Try again.' : null,
          busy: false,
        });
      } else {
        setLocked(null);
        setError(errorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadFile(files: File[]) {
    const pdf = files.find(isPdf);
    if (!pdf) {
      setNotice('Please select a PDF file.');
      return;
    }
    setNotice(files.length > 1 ? 'Only the first PDF was opened. Crop PDF works on one file at a time.' : null);
    setLocked(null);
    try {
      const bytes = await readBytes(pdf);
      await openBytes(pdf.name, bytes);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (handoff?.length) void loadFile(handoffToFiles(handoff));
  }, []);

  function clearDoc() {
    closeCurrentProxy();
    setDoc(null);
    setLocked(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }

  const pageCount = doc?.boxes.length ?? 0;
  const currentPageNum = pageIndex + 1;
  const currentBox = doc?.boxes[pageIndex] ?? null;
  const visW = currentBox?.visualWidth ?? 595.28;
  const visH = currentBox?.visualHeight ?? 841.89;

  const hasPerPageOverride = Object.prototype.hasOwnProperty.call(perPageCrops, currentPageNum);
  const activeRect: NormalizedCropRect = hasPerPageOverride ? perPageCrops[currentPageNum] : uniformRect;
  const customPages = React.useMemo(
    () =>
      Object.keys(perPageCrops)
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= pageCount)
        .sort((a, b) => a - b),
    [perPageCrops, pageCount],
  );

  const updateActiveRect = React.useCallback(
    (next: NormalizedCropRect) => {
      if (scope === 'current') {
        setPerPageCrops((prev) => ({ ...prev, [currentPageNum]: next }));
      } else {
        setUniformRect(next);
        setPerPageCrops((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, currentPageNum)) return prev;
          const copy = { ...prev };
          delete copy[currentPageNum];
          return copy;
        });
      }
    },
    [scope, currentPageNum],
  );

  const marginLeftPt = Math.round(activeRect.left * visW * 10) / 10;
  const marginRightPt = Math.round((1 - activeRect.right) * visW * 10) / 10;
  const marginTopPt = Math.round(activeRect.top * visH * 10) / 10;
  const marginBottomPt = Math.round((1 - activeRect.bottom) * visH * 10) / 10;

  function setMarginPt(edge: 'top' | 'right' | 'bottom' | 'left', pt: number) {
    const minSpan = 0.02;
    const next = { ...activeRect };
    if (edge === 'left') {
      next.left = clamp(pt / Math.max(1, visW), 0, next.right - minSpan);
    } else if (edge === 'right') {
      next.right = clamp(1 - pt / Math.max(1, visW), next.left + minSpan, 1);
    } else if (edge === 'top') {
      next.top = clamp(pt / Math.max(1, visH), 0, next.bottom - minSpan);
    } else {
      next.bottom = clamp(1 - pt / Math.max(1, visH), next.top + minSpan, 1);
    }
    updateActiveRect(next);
  }

  function applyTrimPreset(fraction: number) {
    updateActiveRect({
      left: fraction,
      top: fraction,
      right: 1 - fraction,
      bottom: 1 - fraction,
    });
  }

  function applyCurrentToAll() {
    setUniformRect(activeRect);
    setPerPageCrops({});
    if (scope === 'current') setScope('all');
  }

  const afterW = resetCrop
    ? currentBox
      ? currentBox.rotation === 90 || currentBox.rotation === 270
        ? currentBox.mediaBox.height
        : currentBox.mediaBox.width
      : visW
    : Math.max(1, (activeRect.right - activeRect.left) * visW);
  const afterH = resetCrop
    ? currentBox
      ? currentBox.rotation === 90 || currentBox.rotation === 270
        ? currentBox.mediaBox.width
        : currentBox.mediaBox.height
      : visH
    : Math.max(1, (activeRect.bottom - activeRect.top) * visH);

  const rangeValidation = React.useMemo<{ rangeStr?: string; count: number; error: string | null }>(() => {
    if (!doc) return { count: 0, error: null };
    if (scope === 'all') return { rangeStr: undefined, count: pageCount, error: null };
    if (scope === 'current') {
      if (resetCrop) return { rangeStr: String(currentPageNum), count: 1, error: null };
      const targeted = new Set<number>(customPages);
      if (!isFullRect(activeRect)) targeted.add(currentPageNum);
      return { count: Math.max(1, targeted.size), error: null };
    }
    if (scope === 'odd') {
      const odds: number[] = [];
      for (let p = 1; p <= pageCount; p += 2) odds.push(p);
      return { rangeStr: odds.join(','), count: odds.length, error: odds.length ? null : 'No odd pages.' };
    }
    if (scope === 'even') {
      const evens: number[] = [];
      for (let p = 2; p <= pageCount; p += 2) evens.push(p);
      return {
        rangeStr: evens.join(','),
        count: evens.length,
        error: evens.length ? null : 'This document has no even pages.',
      };
    }
    if (!pageRange.trim()) {
      return { rangeStr: undefined, count: 0, error: 'Enter a page range such as 1-3, 5.' };
    }
    try {
      const indices = Array.from(new Set(parsePageRanges(pageRange, pageCount)));
      return { rangeStr: pageRange.trim(), count: indices.length, error: null };
    } catch (e) {
      return { count: 0, error: errorMessage(e) };
    }
  }, [doc, scope, pageCount, currentPageNum, pageRange, resetCrop, customPages, activeRect]);

  const outputName = `${safeFileName(fileName, 'cropped').replace(/\.pdf$/i, '')}.pdf`;

  async function applyCrop() {
    if (!doc || rangeValidation.error) return;
    setBusy(true);
    setError(null);
    try {
      let opts: CropOptions;
      if (resetCrop) {
        opts = {
          resetCrop: true,
          pageRange: rangeValidation.rangeStr,
        };
      } else if (scope === 'current') {
        const mergedPerPage: Record<number, NormalizedCropRect> = {
          ...perPageCrops,
          [currentPageNum]: activeRect,
        };
        opts = { perPageCrops: mergedPerPage };
      } else {
        opts = {
          cropRect: uniformRect,
          perPageCrops: customPages.length > 0 ? perPageCrops : undefined,
          pageRange: rangeValidation.rangeStr,
        };
      }
      const bytes = await runCropPdf(doc.bytes, opts, doc.password);
      const croppedBoxes = await runGetPageBoxes(bytes);
      setResult({ bytes, croppedBoxes });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function jumpToPage(raw: string) {
    setPageJump(raw);
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= pageCount) {
      setPageIndex(n - 1);
    }
  }

  return (
    <PdfPage
      title={CROP.title}
      showHub
      lead="Drag the crop frame or enter exact point margins to trim PDF pages cleanly via /CropBox without re-encoding vector text or images."
    >
      {locked && (
        <PasswordPrompt
          fileName={locked.name}
          error={locked.error}
          busy={locked.busy}
          onSubmit={(pw) => {
            setLocked((prev) => (prev ? { ...prev, busy: true, error: null } : null));
            return openBytes(locked.name, locked.bytes, pw);
          }}
          onCancel={() => setLocked(null)}
        />
      )}
      {error && !doc && <div className={styles.error} style={{ marginBottom: '1rem' }}>{error}</div>}
      {loading && !doc && !locked && <Progress fraction={0.45} label="Loading PDF pages…" />}

      <ToolWorkspace
        tool={CROP}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel="Select a PDF file"
        dropLabel="or drop a PDF here"
        addLabel="Replace PDF"
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={
          <>
            <div className={styles.canvasNav}>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={pageIndex <= 0}
                onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              >
                &larr; Prev
              </button>
              <input
                type="number"
                className={styles.pageNavInput}
                min={1}
                max={Math.max(1, pageCount)}
                aria-label="Current page number"
                value={pageJump}
                onChange={(e) => jumpToPage(e.target.value)}
                onBlur={() => setPageJump(String(pageIndex + 1))}
              />
              <span className={styles.canvasPageInfo}>/ {pageCount}</span>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={pageIndex >= pageCount - 1}
                onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
              >
                Next &rarr;
              </button>
            </div>
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>
              Close
            </button>
          </>
        }
        sidebar={
          <>
            <Checkbox
              label="Reset PDF CropBox to full MediaBox"
              checked={resetCrop}
              onChange={setResetCrop}
            />

            {!resetCrop && (
              <>
                <div className={styles.presetRow}>
                  <button type="button" className={styles.presetBtn} onClick={() => applyTrimPreset(0.05)}>
                    Trim 5%
                  </button>
                  <button type="button" className={styles.presetBtn} onClick={() => applyTrimPreset(0.1)}>
                    Trim 10%
                  </button>
                  <button type="button" className={styles.presetBtn} onClick={() => updateActiveRect(FULL_RECT)}>
                    Reset selection
                  </button>
                </div>

                <div className={styles.marginGrid4}>
                  <Field label="Top (pt)">
                    <NumberInput
                      value={marginTopPt}
                      min={0}
                      max={Math.max(0, Math.round(visH - 1))}
                      step={0.5}
                      onChange={(v) => setMarginPt('top', v)}
                    />
                  </Field>
                  <Field label="Right (pt)">
                    <NumberInput
                      value={marginRightPt}
                      min={0}
                      max={Math.max(0, Math.round(visW - 1))}
                      step={0.5}
                      onChange={(v) => setMarginPt('right', v)}
                    />
                  </Field>
                  <Field label="Bottom (pt)">
                    <NumberInput
                      value={marginBottomPt}
                      min={0}
                      max={Math.max(0, Math.round(visH - 1))}
                      step={0.5}
                      onChange={(v) => setMarginPt('bottom', v)}
                    />
                  </Field>
                  <Field label="Left (pt)">
                    <NumberInput
                      value={marginLeftPt}
                      min={0}
                      max={Math.max(0, Math.round(visW - 1))}
                      step={0.5}
                      onChange={(v) => setMarginPt('left', v)}
                    />
                  </Field>
                </div>
              </>
            )}

            <Field label="Apply to">
              <Select
                value={scope}
                onChange={setScope}
                options={[
                  ['all', 'All pages'],
                  ['current', 'Current page only (or custom pages)'],
                  ['odd', 'Odd pages (1, 3, 5…)'],
                  ['even', 'Even pages (2, 4, 6…)'],
                  ['range', 'Custom page range'],
                ]}
              />
            </Field>

            {scope === 'range' && (
              <Field label="Page range" help="1-based ranges such as 1-3, 5, 8-end.">
                <input
                  className={qrStyles.input}
                  value={pageRange}
                  placeholder="1-3, 5"
                  onChange={(e) => setPageRange(e.target.value)}
                />
              </Field>
            )}

            {!resetCrop && customPages.length > 0 && (
              <div className={styles.summaryBox}>
                <div className={styles.summaryRow}>
                  <span>Per-page custom crops</span>
                  <span>
                    {customPages.length} page{customPages.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className={styles.note}>
                  Customized: p. {customPages.slice(0, 8).join(', ')}
                  {customPages.length > 8 ? ` +${customPages.length - 8} more` : ''}
                </p>
                <div className={styles.presetRow}>
                  <button type="button" className={styles.presetBtn} onClick={applyCurrentToAll}>
                    Apply current to all
                  </button>
                  <button type="button" className={styles.presetBtn} onClick={() => setPerPageCrops({})}>
                    Clear custom
                  </button>
                </div>
              </div>
            )}

            {rangeValidation.error && <p className={qrStyles.warning}>{rangeValidation.error}</p>}

            <Field label="File name">
              <input className={qrStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>

            {notice && <p className={qrStyles.warning}>{notice}</p>}
            {error && <div className={styles.error}>{error}</div>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !doc || !!rangeValidation.error}
              onClick={applyCrop}
            >
              {busy
                ? 'Cropping…'
                : resetCrop
                  ? `Reset CropBox (${rangeValidation.count} page${rangeValidation.count === 1 ? '' : 's'})`
                  : `Crop ${rangeValidation.count} page${rangeValidation.count === 1 ? '' : 's'}`}
            </button>

            {result && (
              <div className={styles.result}>
                <h3>PDF cropped</h3>
                <p>
                  Page {currentPageNum} is now{' '}
                  <strong>
                    {fmtPt(result.croppedBoxes[pageIndex]?.visualWidth ?? afterW)} ×{' '}
                    {fmtPt(result.croppedBoxes[pageIndex]?.visualHeight ?? afterH)} pt
                  </strong>{' '}
                  ({fmtMm(result.croppedBoxes[pageIndex]?.visualWidth ?? afterW)} ×{' '}
                  {fmtMm(result.croppedBoxes[pageIndex]?.visualHeight ?? afterH)} mm) ·{' '}
                  {formatBytes(result.bytes.length)}.
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => download(result.bytes, outputName)}
                >
                  Download {outputName}
                </button>
                <ContinueWith currentToolId={CROP.id} files={[{ name: outputName, bytes: result.bytes }]} />
              </div>
            )}
          </>
        }
      >
        {doc && (
          <>
            <div className={styles.fileBanner}>
              <strong>{doc.name}</strong>
              <span className={styles.fileBannerMeta}>
                {pageCount} page{pageCount === 1 ? '' : 's'} · {formatBytes(doc.bytes.length)}
              </span>
              {hasPerPageOverride && !resetCrop && (
                <span className={[styles.previewBadge, styles.previewBadgeInfo].join(' ')}>
                  Custom crop on page {currentPageNum}
                </span>
              )}
              {resetCrop && (
                <span className={[styles.previewBadge, styles.previewBadgeWarn].join(' ')}>
                  Resetting to MediaBox
                </span>
              )}
            </div>

            <div className={styles.dimReadout}>
              <span>
                Before: <strong>{fmtPt(visW)} × {fmtPt(visH)} pt</strong> ({fmtMm(visW)} × {fmtMm(visH)} mm)
              </span>
              <span>
                &rarr; After: <strong>{fmtPt(afterW)} × {fmtPt(afterH)} pt</strong> ({fmtMm(afterW)} × {fmtMm(afterH)}{' '}
                mm)
              </span>
            </div>

            <p className={styles.canvasTip}>
              Drag handles or inside the box to adjust the crop. Click the box to nudge with arrow keys (Shift for
              larger steps, Alt+arrows to resize).
            </p>

            <CropCanvas
              doc={pdfProxy}
              pageIndex={pageIndex}
              rect={activeRect}
              onChange={updateActiveRect}
              disabled={resetCrop}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
