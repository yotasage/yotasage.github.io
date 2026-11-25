import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import {
  assembleLinesFromTextItems,
  computePixelDiff,
  diffTextLines,
  formatTextDiffSummary,
  PageTextComparison,
  PixelDiffResult,
  TextDiffResult,
  TextItemPos,
} from '../../lib/pdf/compare';
import {
  baseName,
  canvasToBytes,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  nextFrame,
  OutputFile,
  readBytes,
  safeFileName,
  uid,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { openPdf, renderPage } from '../../lib/pdf/pdfjs';
import { COMPARE } from '../../lib/pdf/tools';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/PdfCompare.module.css';
import shared from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';
import { ContinueWith } from './ContinueWith';
import { PasswordPrompt } from './PasswordPrompt';
import { DropTarget, FilePickerButton, Progress } from './ToolPage';

type SlotKey = 'A' | 'B';
type ViewMode = 'overlay' | 'side-by-side' | 'swipe' | 'text';
type OverlayStyle = 'overlay' | 'diff-only';
type PageStatus = 'pending' | 'identical' | 'changed' | 'only-a' | 'only-b';

interface LoadedSlot {
  id: string;
  name: string;
  bytes: Uint8Array;
  password?: string;
  doc: PDFDocumentProxy;
  close: () => Promise<void>;
  numPages: number;
}

interface LockedSlot {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

interface PageScanEntry {
  page: number;
  status: PageStatus;
  changedPercent: number;
  changedRegions: number;
  textDiff: TextDiffResult | null;
}

interface RenderedPageRgba {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  pointWidth: number;
  pointHeight: number;
}

interface ActivePageCache {
  page: number;
  a: RenderedPageRgba | null;
  b: RenderedPageRgba | null;
  textDiff: TextDiffResult;
}

const VIEW_MODES: { id: ViewMode; labelKey: TranslationKey }[] = [
  { id: 'overlay', labelKey: 'pdf.cmp.modeOverlay' },
  { id: 'side-by-side', labelKey: 'pdf.cmp.modeSide' },
  { id: 'swipe', labelKey: 'pdf.cmp.modeSwipe' },
  { id: 'text', labelKey: 'pdf.cmp.modeText' },
];

async function extractPageTextLines(doc: PDFDocumentProxy, pageNum: number): Promise<string[]> {
  if (pageNum < 1 || pageNum > doc.numPages) return [];
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  const positions: TextItemPos[] = [];
  for (const raw of content.items) {
    if (!raw || typeof raw !== 'object' || !('str' in raw) || !('transform' in raw)) continue;
    const item = raw as { str: string; transform: number[]; width?: number; height?: number };
    if (!item.str) continue;
    const t = item.transform;
    const h =
      typeof item.height === 'number' && item.height > 0
        ? item.height
        : Math.hypot(t[2] ?? 0, t[3] ?? 0) || Math.hypot(t[0] ?? 0, t[1] ?? 0) || 10;
    positions.push({
      str: item.str,
      x: t[4] ?? 0,
      y: t[5] ?? 0,
      width: typeof item.width === 'number' ? item.width : 0,
      height: h,
    });
  }
  return assembleLinesFromTextItems(positions);
}

async function renderPageToRgba(
  doc: PDFDocumentProxy,
  pageNum: number,
  targetScale: number,
  maxDim: number,
): Promise<RenderedPageRgba> {
  const page = await doc.getPage(pageNum);
  const vp1 = page.getViewport({ scale: 1 });
  const longest = Math.max(vp1.width, vp1.height, 1);
  const scale = Math.min(targetScale, maxDim / longest);
  const canvas = await renderPage(page, Math.max(0.2, scale));
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D context is unavailable.');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return {
      rgba: imgData.data,
      width: imgData.width,
      height: imgData.height,
      pointWidth: vp1.width,
      pointHeight: vp1.height,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function paintRgba(
  canvas: HTMLCanvasElement | null,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (!canvas || width <= 0 || height <= 0) return;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(width, height);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
}

function paintPaddedRgba(
  canvas: HTMLCanvasElement | null,
  src: RenderedPageRgba | null,
  targetW: number,
  targetH: number,
): void {
  if (!canvas || targetW <= 0 || targetH <= 0) return;
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  if (!src || src.width <= 0 || src.height <= 0) return;
  const img = ctx.createImageData(src.width, src.height);
  img.data.set(src.rgba);
  ctx.putImageData(img, 0, 0);
}

function clearCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

export function PdfCompareView() {
  const { t } = useI18n();
  const [docA, setDocA] = React.useState<LoadedSlot | null>(null);
  const [docB, setDocB] = React.useState<LoadedSlot | null>(null);
  const [lockedA, setLockedA] = React.useState<LockedSlot | null>(null);
  const [lockedB, setLockedB] = React.useState<LockedSlot | null>(null);
  const [loadingA, setLoadingA] = React.useState(false);
  const [loadingB, setLoadingB] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [viewMode, setViewMode] = React.useState<ViewMode>('overlay');
  const [overlayStyle, setOverlayStyle] = React.useState<OverlayStyle>('overlay');
  const [threshold, setThreshold] = React.useState(24);
  const [showBoxes, setShowBoxes] = React.useState(true);
  const [textChangesOnly, setTextChangesOnly] = React.useState(false);
  const [changedPagesOnly, setChangedPagesOnly] = React.useState(false);
  const [splitPercent, setSplitPercent] = React.useState(50);

  const [activePage, setActivePage] = React.useState(1);
  const [scanEntries, setScanEntries] = React.useState<PageScanEntry[]>([]);
  const [scanning, setScanning] = React.useState(false);
  const [scanDoneCount, setScanDoneCount] = React.useState(0);

  const [renderingPage, setRenderingPage] = React.useState(false);
  const [activeRenderVer, setActiveRenderVer] = React.useState(0);
  const [activeTextDiff, setActiveTextDiff] = React.useState<TextDiffResult | null>(null);
  const [activePixelSummary, setActivePixelSummary] = React.useState<{
    changedPercent: number;
    changedPixels: number;
    boxes: PixelDiffResult['changedBoxes'];
    hasA: boolean;
    hasB: boolean;
  } | null>(null);

  const [exportBusy, setExportBusy] = React.useState(false);
  const [exportProgress, setExportProgress] = React.useState({ fraction: 0, label: '' });
  const [diffPdfOutput, setDiffPdfOutput] = React.useState<OutputFile | null>(null);

  const docARef = React.useRef<LoadedSlot | null>(null);
  const docBRef = React.useRef<LoadedSlot | null>(null);
  const loadSeqRef = React.useRef({ A: 0, B: 0 });
  const scanGenRef = React.useRef(0);
  const renderGenRef = React.useRef(0);
  const mountedRef = React.useRef(true);

  const activeCacheRef = React.useRef<ActivePageCache | null>(null);
  const textCacheRef = React.useRef<{ pairKey: string; pages: Map<number, TextDiffResult> }>({
    pairKey: '',
    pages: new Map(),
  });

  const overlayCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const sideACanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const sideBCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const swipeACanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const swipeBCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const swipeStageRef = React.useRef<HTMLDivElement | null>(null);
  const draggingSwipeRef = React.useRef(false);

  const disposeSlotDoc = React.useCallback((slot: LoadedSlot | null) => {
    if (!slot) return;
    void slot.close().catch(() => undefined);
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      scanGenRef.current += 1;
      renderGenRef.current += 1;
      disposeSlotDoc(docARef.current);
      disposeSlotDoc(docBRef.current);
      docARef.current = null;
      docBRef.current = null;
      clearCanvas(overlayCanvasRef.current);
      clearCanvas(sideACanvasRef.current);
      clearCanvas(sideBCanvasRef.current);
      clearCanvas(swipeACanvasRef.current);
      clearCanvas(swipeBCanvasRef.current);
    };
  }, [disposeSlotDoc]);

  const openIntoSlot = React.useCallback(
    async (slot: SlotKey, name: string, bytes: Uint8Array, password?: string) => {
      const seq = ++loadSeqRef.current[slot];
      const setLoading = slot === 'A' ? setLoadingA : setLoadingB;
      const setLocked = slot === 'A' ? setLockedA : setLockedB;
      const setDoc = slot === 'A' ? setDocA : setDocB;
      const docRef = slot === 'A' ? docARef : docBRef;

      setError(null);
      setDiffPdfOutput(null);
      setLoading(true);
      if (password !== undefined) {
        setLocked((prev) => (prev ? { ...prev, busy: true, error: null } : null));
      }

      try {
        const handle = await openPdf(bytes, password);
        if (!mountedRef.current || loadSeqRef.current[slot] !== seq) {
          void handle.close().catch(() => undefined);
          return;
        }
        const loaded: LoadedSlot = {
          id: uid(),
          name,
          bytes,
          password,
          doc: handle.doc,
          close: handle.close,
          numPages: handle.doc.numPages,
        };
        const prev = docRef.current;
        docRef.current = loaded;
        setLocked(null);
        setDoc(loaded);
        disposeSlotDoc(prev);
      } catch (e) {
        if (!mountedRef.current || loadSeqRef.current[slot] !== seq) return;
        if (isPasswordError(e)) {
          setLocked({
            name,
            bytes,
            error: password !== undefined ? t('pdf.ff.wrongPw') : null,
            busy: false,
          });
        } else {
          setLocked(null);
          setError(`${name}: ${errorMessage(e)}`);
        }
      } finally {
        if (mountedRef.current && loadSeqRef.current[slot] === seq) {
          setLoading(false);
        }
      }
    },
    [disposeSlotDoc, t],
  );

  const handleFilesForSlot = React.useCallback(
    async (slot: SlotKey, files: File[]) => {
      const pdfs = files.filter(isPdf);
      if (pdfs.length === 0) {
        setNotice(t('pdf.cmp.pickPdfs'));
        return;
      }
      if (pdfs.length < files.length) {
        setNotice(t('pdf.cmp.skipped', { count: files.length - pdfs.length }));
      } else {
        setNotice(null);
      }

      // Dropping 2+ PDFs at once fills both Document A and Document B.
      if (pdfs.length >= 2) {
        const [bytesA, bytesB] = await Promise.all([readBytes(pdfs[0]), readBytes(pdfs[1])]);
        await Promise.all([
          openIntoSlot('A', pdfs[0].name, bytesA),
          openIntoSlot('B', pdfs[1].name, bytesB),
        ]);
        if (pdfs.length > 2) {
          setNotice(t('pdf.cmp.loadedTwo'));
        }
        return;
      }

      const bytes = await readBytes(pdfs[0]);
      await openIntoSlot(slot, pdfs[0].name, bytes);
    },
    [openIntoSlot, t],
  );

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (!handoff || handoff.length === 0) return;
    const files = handoffToFiles(handoff);
    if (files.length >= 2) {
      void handleFilesForSlot('A', files.slice(0, 2));
    } else {
      void handleFilesForSlot('A', files.slice(0, 1));
    }
  }, [handleFilesForSlot]);

  function clearSlot(slot: SlotKey) {
    loadSeqRef.current[slot] += 1;
    setDiffPdfOutput(null);
    if (slot === 'A') {
      disposeSlotDoc(docARef.current);
      docARef.current = null;
      setDocA(null);
      setLockedA(null);
      setLoadingA(false);
    } else {
      disposeSlotDoc(docBRef.current);
      docBRef.current = null;
      setDocB(null);
      setLockedB(null);
      setLoadingB(false);
    }
  }

  function clearBoth() {
    clearSlot('A');
    clearSlot('B');
    setNotice(null);
    setError(null);
    setActivePage(1);
    setScanEntries([]);
    setActiveTextDiff(null);
    setActivePixelSummary(null);
    activeCacheRef.current = null;
  }

  function swapDocs() {
    const curA = docARef.current;
    const curB = docBRef.current;
    docARef.current = curB;
    docBRef.current = curA;
    setDocA(curB);
    setDocB(curA);
    setLockedA(lockedB);
    setLockedB(lockedA);
    setDiffPdfOutput(null);
  }

  const totalPages = docA && docB ? Math.max(docA.numPages, docB.numPages) : 0;
  const pairKey = docA && docB ? `${docA.id}:${docB.id}` : '';

  // Clamp activePage when documents change.
  React.useEffect(() => {
    if (totalPages === 0) {
      setActivePage(1);
      return;
    }
    setActivePage((p) => Math.max(1, Math.min(totalPages, p)));
  }, [totalPages]);

  // Background scan across all pages whenever both documents are loaded.
  React.useEffect(() => {
    if (!docA || !docB) {
      scanGenRef.current += 1;
      setScanEntries([]);
      setScanning(false);
      setScanDoneCount(0);
      return;
    }

    const gen = ++scanGenRef.current;
    const maxPages = Math.max(docA.numPages, docB.numPages);
    const key = `${docA.id}:${docB.id}`;
    if (textCacheRef.current.pairKey !== key) {
      textCacheRef.current = { pairKey: key, pages: new Map() };
    }

    const initial: PageScanEntry[] = Array.from({ length: maxPages }, (_, idx) => {
      const page = idx + 1;
      const status: PageStatus =
        page > docA.numPages ? 'only-b' : page > docB.numPages ? 'only-a' : 'pending';
      return {
        page,
        status,
        changedPercent: status === 'pending' ? 0 : 100,
        changedRegions: status === 'pending' ? 0 : 1,
        textDiff: null,
      };
    });
    setScanEntries(initial);
    setScanDoneCount(0);
    setScanning(true);

    void (async () => {
      for (let p = 1; p <= maxPages; p++) {
        if (!mountedRef.current || scanGenRef.current !== gen) return;
        const inA = p <= docA.numPages;
        const inB = p <= docB.numPages;

        try {
          let textDiff = textCacheRef.current.pages.get(p);
          if (!textDiff) {
            const [linesA, linesB] = await Promise.all([
              inA ? extractPageTextLines(docA.doc, p) : Promise.resolve([]),
              inB ? extractPageTextLines(docB.doc, p) : Promise.resolve([]),
            ]);
            if (!mountedRef.current || scanGenRef.current !== gen) return;
            textDiff = diffTextLines(linesA, linesB);
            textCacheRef.current.pages.set(p, textDiff);
          }

          let entry: PageScanEntry;
          if (!inA) {
            entry = {
              page: p,
              status: 'only-b',
              changedPercent: 100,
              changedRegions: 1,
              textDiff,
            };
          } else if (!inB) {
            entry = {
              page: p,
              status: 'only-a',
              changedPercent: 100,
              changedRegions: 1,
              textDiff,
            };
          } else {
            const [thumbA, thumbB] = await Promise.all([
              renderPageToRgba(docA.doc, p, 1, 420),
              renderPageToRgba(docB.doc, p, 1, 420),
            ]);
            if (!mountedRef.current || scanGenRef.current !== gen) return;
            const px = computePixelDiff(
              thumbA.rgba,
              thumbA.width,
              thumbA.height,
              thumbB.rgba,
              thumbB.width,
              thumbB.height,
              { threshold, mode: 'diff-only' },
            );
            const hasDiff = textDiff.hasChanges || px.changedPixels > 0;
            entry = {
              page: p,
              status: hasDiff ? 'changed' : 'identical',
              changedPercent: px.changedPercent,
              changedRegions: px.changedBoxes.length,
              textDiff,
            };
          }

          if (!mountedRef.current || scanGenRef.current !== gen) return;
          setScanEntries((prev) => {
            if (prev.length < p) return prev;
            const next = prev.slice();
            next[p - 1] = entry;
            return next;
          });
          setScanDoneCount(p);
        } catch {
          if (!mountedRef.current || scanGenRef.current !== gen) return;
          setScanDoneCount(p);
        }

        await nextFrame();
      }
      if (mountedRef.current && scanGenRef.current === gen) {
        setScanning(false);
      }
    })();

    return () => {
      scanGenRef.current += 1;
    };
  }, [docA, docB, threshold]);

  // High-resolution rendering + text extraction for the active page.
  React.useEffect(() => {
    if (!docA || !docB || totalPages === 0) {
      renderGenRef.current += 1;
      activeCacheRef.current = null;
      setActiveTextDiff(null);
      setActivePixelSummary(null);
      setRenderingPage(false);
      return;
    }

    const gen = ++renderGenRef.current;
    const pageNum = Math.max(1, Math.min(totalPages, activePage));
    setRenderingPage(true);

    void (async () => {
      try {
        const inA = pageNum <= docA.numPages;
        const inB = pageNum <= docB.numPages;

        const [imgA, imgB] = await Promise.all([
          inA ? renderPageToRgba(docA.doc, pageNum, 150 / 72, 1500) : Promise.resolve(null),
          inB ? renderPageToRgba(docB.doc, pageNum, 150 / 72, 1500) : Promise.resolve(null),
        ]);
        if (!mountedRef.current || renderGenRef.current !== gen) return;

        let textDiff = textCacheRef.current.pages.get(pageNum);
        if (!textDiff) {
          const [linesA, linesB] = await Promise.all([
            inA ? extractPageTextLines(docA.doc, pageNum) : Promise.resolve([]),
            inB ? extractPageTextLines(docB.doc, pageNum) : Promise.resolve([]),
          ]);
          if (!mountedRef.current || renderGenRef.current !== gen) return;
          textDiff = diffTextLines(linesA, linesB);
          if (textCacheRef.current.pairKey === pairKey) {
            textCacheRef.current.pages.set(pageNum, textDiff);
          }
        }

        activeCacheRef.current = {
          page: pageNum,
          a: imgA,
          b: imgB,
          textDiff,
        };
        setActiveTextDiff(textDiff);
        setActiveRenderVer((v) => v + 1);
      } catch (e) {
        if (!mountedRef.current || renderGenRef.current !== gen) return;
        setError(t('pdf.cmp.renderErr', { n: pageNum, error: errorMessage(e) }));
      } finally {
        if (mountedRef.current && renderGenRef.current === gen) {
          setRenderingPage(false);
        }
      }
    })();

    return () => {
      renderGenRef.current += 1;
    };
  }, [docA, docB, activePage, totalPages, pairKey]);

  // Paint active canvases whenever rendered RGBA buffers or visual controls change.
  React.useEffect(() => {
    const cache = activeCacheRef.current;
    if (!cache || !docA || !docB) return;

    const empty = new Uint8ClampedArray(0);
    const wA = cache.a?.width ?? 0;
    const hA = cache.a?.height ?? 0;
    const wB = cache.b?.width ?? 0;
    const hB = cache.b?.height ?? 0;

    const diff = computePixelDiff(
      cache.a?.rgba ?? empty,
      wA,
      hA,
      cache.b?.rgba ?? empty,
      wB,
      hB,
      { threshold, mode: overlayStyle },
    );

    setActivePixelSummary({
      changedPercent: diff.changedPercent,
      changedPixels: diff.changedPixels,
      boxes: diff.changedBoxes,
      hasA: cache.a !== null,
      hasB: cache.b !== null,
    });

    if (viewMode === 'overlay') {
      paintRgba(overlayCanvasRef.current, diff.rgba, diff.width, diff.height);
    } else if (viewMode === 'side-by-side') {
      if (cache.a) paintRgba(sideACanvasRef.current, cache.a.rgba, cache.a.width, cache.a.height);
      else clearCanvas(sideACanvasRef.current);
      if (cache.b) paintRgba(sideBCanvasRef.current, cache.b.rgba, cache.b.width, cache.b.height);
      else clearCanvas(sideBCanvasRef.current);
    } else if (viewMode === 'swipe') {
      const targetW = Math.max(wA, wB);
      const targetH = Math.max(hA, hB);
      paintPaddedRgba(swipeBCanvasRef.current, cache.b, targetW, targetH);
      paintPaddedRgba(swipeACanvasRef.current, cache.a, targetW, targetH);
    }
  }, [activeRenderVer, viewMode, overlayStyle, threshold, docA, docB]);

  const changedPageNumbers = React.useMemo(
    () =>
      scanEntries
        .filter((e) => e.status === 'changed' || e.status === 'only-a' || e.status === 'only-b')
        .map((e) => e.page),
    [scanEntries],
  );

  const visiblePageEntries = React.useMemo(() => {
    if (!changedPagesOnly) return scanEntries;
    return scanEntries.filter(
      (e) => e.status === 'changed' || e.status === 'only-a' || e.status === 'only-b' || e.page === activePage,
    );
  }, [scanEntries, changedPagesOnly, activePage]);

  function jumpChanged(dir: -1 | 1) {
    if (changedPageNumbers.length === 0) return;
    if (dir > 0) {
      const next = changedPageNumbers.find((p) => p > activePage);
      setActivePage(next ?? changedPageNumbers[0]);
    } else {
      const prev = [...changedPageNumbers].reverse().find((p) => p < activePage);
      setActivePage(prev ?? changedPageNumbers[changedPageNumbers.length - 1]);
    }
  }

  function updateSwipeFromClientX(clientX: number) {
    const el = swipeStageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPercent(Math.max(0, Math.min(100, Math.round(pct))));
  }

  async function handleDownloadTextDiff() {
    if (!docA || !docB) return;
    setExportBusy(true);
    setError(null);
    setExportProgress({ fraction: 0, label: t('pdf.cmp.buildingText') });

    try {
      const maxPages = Math.max(docA.numPages, docB.numPages);
      const comparisons: PageTextComparison[] = [];

      for (let p = 1; p <= maxPages; p++) {
        let diff = textCacheRef.current.pages.get(p);
        if (!diff) {
          const [linesA, linesB] = await Promise.all([
            p <= docA.numPages ? extractPageTextLines(docA.doc, p) : Promise.resolve([]),
            p <= docB.numPages ? extractPageTextLines(docB.doc, p) : Promise.resolve([]),
          ]);
          diff = diffTextLines(linesA, linesB);
          if (textCacheRef.current.pairKey === pairKey) {
            textCacheRef.current.pages.set(p, diff);
          }
        }
        comparisons.push({
          page: p,
          addedLines: diff.addedLines,
          removedLines: diff.removedLines,
          hasChanges: diff.hasChanges,
          diff,
        });
        setExportProgress({
          fraction: p / maxPages,
          label: t('pdf.cmp.comparingText', { p, total: maxPages }),
        });
        await nextFrame();
      }

      const report = formatTextDiffSummary(docA.name, docB.name, comparisons);
      const bytes = new TextEncoder().encode(report);
      const outName = safeFileName(
        `${baseName(docA.name)}-vs-${baseName(docB.name)}-diff.txt`,
        'pdf-diff.txt',
      );
      download(bytes, outName, 'text/plain;charset=utf-8');
    } catch (e) {
      setError(t('pdf.cmp.errTextDiff', { error: errorMessage(e) }));
    } finally {
      setExportBusy(false);
      setExportProgress({ fraction: 0, label: '' });
    }
  }

  async function handleDownloadDiffPdf() {
    if (!docA || !docB) return;
    setExportBusy(true);
    setError(null);
    setDiffPdfOutput(null);

    try {
      const maxPages = Math.max(docA.numPages, docB.numPages);
      const targetPages =
        !scanning && changedPageNumbers.length > 0
          ? changedPageNumbers
          : Array.from({ length: maxPages }, (_, idx) => idx + 1);

      const { PDFDocument } = await import('@cantoo/pdf-lib');
      const outDoc = await PDFDocument.create();
      const empty = new Uint8ClampedArray(0);
      const offscreen = document.createElement('canvas');

      try {
        for (let i = 0; i < targetPages.length; i++) {
          const p = targetPages[i];
          setExportProgress({
            fraction: i / targetPages.length,
            label: t('pdf.cmp.renderingDiff', { p, i: i + 1, total: targetPages.length }),
          });
          await nextFrame();

          const [imgA, imgB] = await Promise.all([
            p <= docA.numPages ? renderPageToRgba(docA.doc, p, 150 / 72, 1600) : Promise.resolve(null),
            p <= docB.numPages ? renderPageToRgba(docB.doc, p, 150 / 72, 1600) : Promise.resolve(null),
          ]);

          const diff = computePixelDiff(
            imgA?.rgba ?? empty,
            imgA?.width ?? 0,
            imgA?.height ?? 0,
            imgB?.rgba ?? empty,
            imgB?.width ?? 0,
            imgB?.height ?? 0,
            { threshold, mode: overlayStyle },
          );

          paintRgba(offscreen, diff.rgba, diff.width, diff.height);
          const pngBytes = await canvasToBytes(offscreen, 'image/png');
          const embedded = await outDoc.embedPng(pngBytes);

          const ptW = Math.max(imgA?.pointWidth ?? 0, imgB?.pointWidth ?? 0, 1);
          const ptH = Math.max(imgA?.pointHeight ?? 0, imgB?.pointHeight ?? 0, 1);
          const page = outDoc.addPage([ptW, ptH]);
          page.drawImage(embedded, { x: 0, y: 0, width: ptW, height: ptH });
        }
      } finally {
        offscreen.width = 0;
        offscreen.height = 0;
      }

      setExportProgress({ fraction: 0.96, label: t('pdf.cmp.savingDiff') });
      const pdfBytes = await outDoc.save();
      const outName = safeFileName(
        `${baseName(docA.name)}-vs-${baseName(docB.name)}-diff.pdf`,
        'pdf-visual-diff.pdf',
      );
      const file: OutputFile = { name: outName, bytes: pdfBytes };
      setDiffPdfOutput(file);
      download(pdfBytes, outName);
    } catch (e) {
      setError(t('pdf.cmp.errDiffPdf', { error: errorMessage(e) }));
    } finally {
      setExportBusy(false);
      setExportProgress({ fraction: 0, label: '' });
    }
  }

  const activeScan = scanEntries[activePage - 1] ?? null;
  const bothLoaded = Boolean(docA && docB);

  const displayedTextLines = React.useMemo(() => {
    if (!activeTextDiff) return [];
    if (!textChangesOnly) return activeTextDiff.lines;
    return activeTextDiff.lines.filter((l) => l.type !== 'same');
  }, [activeTextDiff, textChangesOnly]);

  function renderSlotCard(
    slot: SlotKey,
    label: string,
    loaded: LoadedSlot | null,
    locked: LockedSlot | null,
    loading: boolean,
  ) {
    return (
      <DropTarget
        onFiles={(files) => void handleFilesForSlot(slot, files)}
        className={[styles.slotCard, loaded ? styles.slotLoaded : ''].join(' ')}
        overClassName={styles.slotOver}
      >
        <div className={styles.slotHead}>
          <span className={slot === 'A' ? styles.slotBadgeA : styles.slotBadgeB}>{slot}</span>
          <h2 className={styles.slotTitle}>{label}</h2>
        </div>

        {locked ? (
          <PasswordPrompt
            fileName={locked.name}
            error={locked.error}
            busy={locked.busy}
            onSubmit={(pw) => openIntoSlot(slot, locked.name, locked.bytes, pw)}
            onCancel={() => clearSlot(slot)}
          />
        ) : loaded ? (
          <div className={styles.slotBody}>
            <div className={styles.slotFileName}>{loaded.name}</div>
            <div className={styles.slotMeta}>
              {loaded.numPages === 1 ? t('pdf.ff.pagesOne') : t('pdf.ff.pagesMany', { count: loaded.numPages })} · {formatBytes(loaded.bytes.length)}
            </div>
            <div className={styles.slotActions}>
              <FilePickerButton
                accept="application/pdf,.pdf"
                multiple
                onFiles={(files) => void handleFilesForSlot(slot, files)}
                className={shared.buttonSmall}
              >
                {t('pdf.cmp.replaceSlot', { slot })}
              </FilePickerButton>
              <button type="button" className={shared.buttonSmall} onClick={() => clearSlot(slot)}>
                {t('pdf.ff.clear')}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.slotBody}>
            <FilePickerButton
              accept="application/pdf,.pdf"
              multiple
              onFiles={(files) => void handleFilesForSlot(slot, files)}
              className={shared.button}
            >
              {loading ? t('pdf.cmp.loadingPdf') : t('pdf.cmp.selectDoc', { slot })}
            </FilePickerButton>
            <span className={styles.slotHint}>{t('pdf.cmp.slotHint')}</span>
          </div>
        )}
      </DropTarget>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.dualGrid}>
        {renderSlotCard('A', t('pdf.cmp.docA'), docA, lockedA, loadingA)}
        {renderSlotCard('B', t('pdf.cmp.docB'), docB, lockedB, loadingB)}
      </div>

      {notice && <p className={fieldStyles.warning}>{notice}</p>}
      {error && <div className={shared.error}>{error}</div>}

      {(docA || docB) && (
        <div className={styles.swapBar}>
          <div className={styles.swapStats}>
            {bothLoaded ? (
              <>
                <span
                  className={[
                    styles.statPill,
                    changedPageNumbers.length > 0 ? styles.statPillChanged : styles.statPillSame,
                  ].join(' ')}
                >
                  {scanning
                    ? t('pdf.cmp.scanning', { done: scanDoneCount, total: totalPages, changed: changedPageNumbers.length })
                    : changedPageNumbers.length > 0
                      ? totalPages === 1
                        ? t('pdf.cmp.changedOne', { changed: changedPageNumbers.length })
                        : t('pdf.cmp.changedMany', { changed: changedPageNumbers.length, total: totalPages })
                      : totalPages === 1
                        ? t('pdf.cmp.identicalOne')
                        : t('pdf.cmp.identicalMany', { total: totalPages })}
                </span>
                {docA && docB && docA.numPages !== docB.numPages && (
                  <span className={styles.statPill}>
                    {t('pdf.cmp.pageCounts', { a: docA.numPages, b: docB.numPages })}
                  </span>
                )}
              </>
            ) : (
              <span>{t('pdf.cmp.loadSecond')}</span>
            )}
          </div>
          <div className={styles.swapActions}>
            <button
              type="button"
              className={shared.buttonSmall}
              onClick={swapDocs}
              disabled={!docA && !docB}
            >
              {t('pdf.cmp.swap')}
            </button>
            <button type="button" className={shared.buttonSmall} onClick={clearBoth}>
              {t('pdf.cmp.clearBoth')}
            </button>
          </div>
        </div>
      )}

      {bothLoaded && (
        <>
          <div className={styles.toolbar}>
            <div className={styles.toolbarGroup}>
              <div className={styles.modeTabs} role="tablist" aria-label={t('pdf.cmp.viewModeAria')}>
                {VIEW_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={viewMode === m.id}
                    className={[styles.modeTab, viewMode === m.id ? styles.modeTabActive : ''].join(' ')}
                    onClick={() => setViewMode(m.id)}
                  >
                    {t(m.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.toolbarGroup}>
              <button
                type="button"
                className={shared.buttonSmall}
                disabled={activePage <= 1}
                onClick={() => setActivePage((p) => Math.max(1, p - 1))}
              >
                {t('pdf.vec.prev')}
              </button>
              <span className={styles.pageReadout}>
                {t('pdf.vec.pageOf', { current: activePage, total: totalPages })}
              </span>
              <button
                type="button"
                className={shared.buttonSmall}
                disabled={activePage >= totalPages}
                onClick={() => setActivePage((p) => Math.min(totalPages, p + 1))}
              >
                {t('pdf.vec.next')}
              </button>
              <button
                type="button"
                className={shared.buttonSmall}
                disabled={changedPageNumbers.length === 0}
                onClick={() => jumpChanged(-1)}
              >
                {t('pdf.cmp.prevChange')}
              </button>
              <button
                type="button"
                className={shared.buttonSmall}
                disabled={changedPageNumbers.length === 0}
                onClick={() => jumpChanged(1)}
              >
                {t('pdf.cmp.nextChange')}
              </button>
            </div>

            <div className={styles.toolbarGroup}>
              {viewMode !== 'text' && (
                <label className={styles.sliderWrap}>
                  <span>{t('pdf.cmp.sensitivity', { n: threshold })}</span>
                  <input
                    type="range"
                    className={styles.sliderInput}
                    min={5}
                    max={80}
                    step={1}
                    value={threshold}
                    aria-label={t('pdf.cmp.sensitivityAria')}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                  />
                </label>
              )}

              {viewMode === 'overlay' && (
                <div className={styles.modeTabs} role="group" aria-label={t('pdf.cmp.overlayBgAria')}>
                  <button
                    type="button"
                    aria-pressed={overlayStyle === 'overlay'}
                    className={[
                      styles.modeTab,
                      overlayStyle === 'overlay' ? styles.modeTabActive : '',
                    ].join(' ')}
                    onClick={() => setOverlayStyle('overlay')}
                  >
                    {t('pdf.cmp.overlay')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={overlayStyle === 'diff-only'}
                    className={[
                      styles.modeTab,
                      overlayStyle === 'diff-only' ? styles.modeTabActive : '',
                    ].join(' ')}
                    onClick={() => setOverlayStyle('diff-only')}
                  >
                    {t('pdf.cmp.diffOnly')}
                  </button>
                </div>
              )}

              {viewMode === 'side-by-side' && (
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={showBoxes}
                    onChange={(e) => setShowBoxes(e.target.checked)}
                  />
                  {t('pdf.cmp.highlightRegions')}
                </label>
              )}

              {viewMode === 'text' && (
                <label className={styles.toggleLabel}>
                  <input
                    type="checkbox"
                    checked={textChangesOnly}
                    onChange={(e) => setTextChangesOnly(e.target.checked)}
                  />
                  {t('pdf.cmp.changesOnly')}
                </label>
              )}

              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={changedPagesOnly}
                  onChange={(e) => setChangedPagesOnly(e.target.checked)}
                />
                {t('pdf.cmp.changedPagesOnly')}
              </label>
            </div>
          </div>

          <div className={styles.pageStripWrap}>
            <div className={styles.pageStrip} role="navigation" aria-label={t('pdf.cmp.pageStripAria')}>
              {visiblePageEntries.map((entry) => {
                const dotClass =
                  entry.status === 'changed'
                    ? styles.dotChanged
                    : entry.status === 'identical'
                      ? styles.dotSame
                      : entry.status === 'only-a'
                        ? styles.dotOnlyA
                        : entry.status === 'only-b'
                          ? styles.dotOnlyB
                          : styles.dotPending;
                const statusTitle =
                  entry.status === 'changed'
                    ? t('pdf.cmp.statusChanged')
                    : entry.status === 'identical'
                      ? t('pdf.cmp.statusIdentical')
                      : entry.status === 'only-a'
                        ? t('pdf.cmp.statusOnlyA')
                        : entry.status === 'only-b'
                          ? t('pdf.cmp.statusOnlyB')
                          : t('pdf.cmp.statusScanning');
                return (
                  <button
                    key={entry.page}
                    type="button"
                    title={t('pdf.cmp.pageStatusTitle', { n: entry.page, status: statusTitle })}
                    className={[
                      styles.pagePill,
                      entry.page === activePage ? styles.pagePillActive : '',
                    ].join(' ')}
                    onClick={() => setActivePage(entry.page)}
                  >
                    <span className={[styles.dot, dotClass].join(' ')} aria-hidden />
                    <span>{t('pdf.cmp.pagePill', { n: entry.page })}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <section className={styles.stageCard} aria-label={t('pdf.cmp.viewAria')}>
            <div className={styles.stageMetaRow}>
              <div className={styles.legend}>
                {viewMode === 'overlay' && (
                  <>
                    <span className={styles.legendItem}>
                      <span className={[styles.swatch, styles.swatchRemoved].join(' ')} />
                      {t('pdf.cmp.removedA')}
                    </span>
                    <span className={styles.legendItem}>
                      <span className={[styles.swatch, styles.swatchAdded].join(' ')} />
                      {t('pdf.cmp.addedB')}
                    </span>
                    <span className={styles.legendItem}>
                      <span className={[styles.swatch, styles.swatchModified].join(' ')} />
                      {t('pdf.cmp.modified')}
                    </span>
                  </>
                )}
                {viewMode === 'text' && activeTextDiff && (
                  <>
                    <span>{t('pdf.cmp.textAdded', { n: activeTextDiff.addedLines })}</span>
                    <span>{t('pdf.cmp.textRemoved', { n: activeTextDiff.removedLines })}</span>
                    <span>{t('pdf.cmp.textUnchanged', { n: activeTextDiff.unchangedLines })}</span>
                  </>
                )}
                {(viewMode === 'side-by-side' || viewMode === 'swipe') && (
                  <span>
                    {t('pdf.ff.pageN', { n: activePage })}
                    {activeScan?.status === 'only-a'
                      ? t('pdf.cmp.onlyInA')
                      : activeScan?.status === 'only-b'
                        ? t('pdf.cmp.onlyInB')
                        : ''}
                  </span>
                )}
              </div>

              <div>
                {renderingPage
                  ? t('pdf.canvas.renderingPage')
                  : activePixelSummary
                    ? activePixelSummary.boxes.length === 1
                      ? t('pdf.cmp.pxSummaryOne', { pct: activePixelSummary.changedPercent.toFixed(2) })
                      : t('pdf.cmp.pxSummaryMany', {
                          pct: activePixelSummary.changedPercent.toFixed(2),
                          count: activePixelSummary.boxes.length,
                        })
                    : ''}
              </div>
            </div>

            {viewMode === 'overlay' && (
              <div className={styles.canvasStage}>
                <canvas
                  ref={overlayCanvasRef}
                  className={styles.canvasPaper}
                  aria-label={t('pdf.cmp.overlayAria', { n: activePage })}
                />
              </div>
            )}

            {viewMode === 'side-by-side' && (
              <div className={styles.sideGrid}>
                <div className={styles.sidePane}>
                  <div className={styles.sidePaneHeader}>
                    <span className={styles.slotBadgeA}>A</span>
                    <span className={styles.sidePaneName}>
                      {docA?.name} — {t('pdf.ff.pageN', { n: activePage })}
                    </span>
                  </div>
                  <div className={styles.sideCanvasWrap}>
                    {docA && activePage <= docA.numPages ? (
                      <div className={styles.sideCanvasInner}>
                        <canvas
                          ref={sideACanvasRef}
                          className={styles.canvasPaper}
                          aria-label={t('pdf.cmp.docAPage', { n: activePage })}
                        />
                        {showBoxes && activePixelSummary && activePixelSummary.boxes.length > 0 && (
                          <svg
                            className={styles.boxOverlaySvg}
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            aria-hidden
                          >
                            {activePixelSummary.boxes.map((box, idx) => (
                              <rect
                                key={idx}
                                x={box.x * 100}
                                y={box.y * 100}
                                width={box.width * 100}
                                height={box.height * 100}
                                fill="rgba(224, 52, 52, 0.12)"
                                stroke="rgba(224, 52, 52, 0.9)"
                                strokeWidth={0.45}
                                strokeDasharray="1.5 1"
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
                          </svg>
                        )}
                      </div>
                    ) : (
                      <div className={styles.missingPageBox}>{t('pdf.cmp.missingA', { n: activePage })}</div>
                    )}
                  </div>
                </div>

                <div className={styles.sidePane}>
                  <div className={styles.sidePaneHeader}>
                    <span className={styles.slotBadgeB}>B</span>
                    <span className={styles.sidePaneName}>
                      {docB?.name} — {t('pdf.ff.pageN', { n: activePage })}
                    </span>
                  </div>
                  <div className={styles.sideCanvasWrap}>
                    {docB && activePage <= docB.numPages ? (
                      <div className={styles.sideCanvasInner}>
                        <canvas
                          ref={sideBCanvasRef}
                          className={styles.canvasPaper}
                          aria-label={t('pdf.cmp.docBPage', { n: activePage })}
                        />
                        {showBoxes && activePixelSummary && activePixelSummary.boxes.length > 0 && (
                          <svg
                            className={styles.boxOverlaySvg}
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            aria-hidden
                          >
                            {activePixelSummary.boxes.map((box, idx) => (
                              <rect
                                key={idx}
                                x={box.x * 100}
                                y={box.y * 100}
                                width={box.width * 100}
                                height={box.height * 100}
                                fill="rgba(30, 128, 232, 0.12)"
                                stroke="rgba(30, 128, 232, 0.9)"
                                strokeWidth={0.45}
                                strokeDasharray="1.5 1"
                                vectorEffect="non-scaling-stroke"
                              />
                            ))}
                          </svg>
                        )}
                      </div>
                    ) : (
                      <div className={styles.missingPageBox}>{t('pdf.cmp.missingB', { n: activePage })}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'swipe' && (
              <div className={styles.canvasStage}>
                <div className={styles.swipeOuter}>
                  <div
                    ref={swipeStageRef}
                    className={styles.swipeStage}
                    onPointerDown={(e) => {
                      draggingSwipeRef.current = true;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      updateSwipeFromClientX(e.clientX);
                    }}
                    onPointerMove={(e) => {
                      if (!draggingSwipeRef.current) return;
                      updateSwipeFromClientX(e.clientX);
                    }}
                    onPointerUp={(e) => {
                      draggingSwipeRef.current = false;
                      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                    }}
                  >
                    <canvas
                      ref={swipeBCanvasRef}
                      className={styles.swipeCanvasBase}
                      aria-label={t('pdf.cmp.swipeBaseAria', { n: activePage })}
                    />
                    <canvas
                      ref={swipeACanvasRef}
                      className={styles.swipeCanvasTop}
                      style={{ clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }}
                      aria-label={t('pdf.cmp.swipeTopAria', { n: activePage })}
                    />
                    <span className={styles.swipeTagA}>{t('pdf.cmp.tagA')}</span>
                    <span className={styles.swipeTagB}>{t('pdf.cmp.tagB')}</span>
                    <div className={styles.swipeDivider} style={{ left: `${splitPercent}%` }}>
                      <div className={styles.swipeHandle} aria-hidden>
                        ↔
                      </div>
                    </div>
                  </div>
                  <div className={styles.swipeSliderRow}>
                    <span>A</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={splitPercent}
                      className={styles.swipeSliderInput}
                      aria-label={t('pdf.cmp.swipeSliderAria')}
                      onChange={(e) => setSplitPercent(Number(e.target.value))}
                    />
                    <span>B ({splitPercent}%)</span>
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'text' && (
              <div className={styles.textDiffWrap}>
                {!activeTextDiff ? (
                  <div className={styles.emptyTextDiff}>{t('pdf.cmp.extractingText', { n: activePage })}</div>
                ) : displayedTextLines.length === 0 ? (
                  <div className={styles.emptyTextDiff}>
                    {activeTextDiff.lines.length === 0
                      ? t('pdf.cmp.noSelectableText')
                      : t('pdf.cmp.noTextDiff')}
                  </div>
                ) : (
                  displayedTextLines.map((line, idx) => {
                    const rowClass =
                      line.type === 'removed'
                        ? styles.diffLineRemoved
                        : line.type === 'added'
                          ? styles.diffLineAdded
                          : styles.diffLineSame;
                    const gutter = line.type === 'removed' ? '-' : line.type === 'added' ? '+' : ' ';
                    return (
                      <div key={idx} className={[styles.diffLine, rowClass].join(' ')}>
                        <span className={styles.diffLineNum}>{line.lineA ?? ''}</span>
                        <span className={styles.diffLineNum}>{line.lineB ?? ''}</span>
                        <span className={styles.diffGutter}>{gutter}</span>
                        <span className={styles.diffText}>
                          {line.chunks && line.chunks.length > 0
                            ? line.chunks.map((chunk, cIdx) =>
                                chunk.type === 'removed' ? (
                                  <mark key={cIdx} className={styles.markRemoved}>
                                    {chunk.text}
                                  </mark>
                                ) : chunk.type === 'added' ? (
                                  <mark key={cIdx} className={styles.markAdded}>
                                    {chunk.text}
                                  </mark>
                                ) : (
                                  <React.Fragment key={cIdx}>{chunk.text}</React.Fragment>
                                ),
                              )
                            : line.text}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            <div className={styles.exportRow}>
              <button
                type="button"
                className={shared.primary}
                disabled={exportBusy}
                onClick={() => void handleDownloadDiffPdf()}
              >
                {exportBusy ? t('pdf.cmp.working') : t('pdf.cmp.dlDiffPdf')}
              </button>
              <button
                type="button"
                className={shared.button}
                disabled={exportBusy}
                onClick={() => void handleDownloadTextDiff()}
              >
                {t('pdf.cmp.dlTextDiff')}
              </button>
            </div>

            {exportBusy && <Progress fraction={exportProgress.fraction} label={exportProgress.label} />}

            {diffPdfOutput && !exportBusy && (
              <div className={shared.result}>
                <h3>{t('pdf.cmp.diffReady')}</h3>
                <p>
                  {diffPdfOutput.name} ({formatBytes(diffPdfOutput.bytes.length)})
                </p>
                <button
                  type="button"
                  className={shared.primary}
                  onClick={() => download(diffPdfOutput.bytes, diffPdfOutput.name)}
                >
                  {t('pdf.cmp.dlAgain', { name: diffPdfOutput.name })}
                </button>
                <ContinueWith currentToolId={COMPARE.id} files={[diffPdfOutput]} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
