import type { PDFDocumentProxy } from 'pdfjs-dist';
import Link from 'next/link';
import React from 'react';

import { FigureBox } from '../../components/PdfTools/FigureCanvas';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import {
  BoxExportFormat,
  DetectCropPanel,
  DetectCropSidebar,
  EmbeddedVectorsPanel,
  EmbeddedVectorsSidebar,
  exportAllBoxes,
  exportSingleBox,
  FormVectorItem,
  scanSourceFormVectors,
  SourcePdf,
} from '../../components/PdfTools/VectorTabs';
import { Checkbox, Field, NumberInput } from '../../components/QrGen/fields';
import {
  analyzePageVectors,
  detectFiguresOnPage,
  PageVectorIndex,
  tightenRegionToContent,
} from '../../lib/pdf/detectFigures';
import { ExtractedImage } from '../../lib/pdf/extractImages';
import type { ViewportRect } from '../../lib/pdf/extractVectors';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  nextFrame,
  readBytes,
  safeFileName,
  uid,
  zipFiles,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { formatPageRanges } from '../../lib/pdf/pages';
import { openPdf } from '../../lib/pdf/pdfjs';
import { EXTRACT_IMAGES } from '../../lib/pdf/tools';
import { runExtractImagesFromPdf } from '../../lib/pdf/workerClient';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

type ActiveTab = 'raster' | 'vectors' | 'crop';

interface ImageCardItem extends ExtractedImage {
  sourceId: string;
  sourceName: string;
  url: string;
}

interface OpenDocHandle {
  sourceId: string;
  doc: PDFDocumentProxy;
  close: () => Promise<void>;
}

const MIN_BOX_PT = 8;

export default function ExtractImagesPage() {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('raster');
  const [sources, setSources] = React.useState<SourcePdf[]>([]);

  // Tab 1: Raster images state
  const [images, setImages] = React.useState<ImageCardItem[]>([]);
  const [skipTiny, setSkipTiny] = React.useState(true);
  const [minPx, setMinPx] = React.useState(16);
  const [appliedMinSize, setAppliedMinSize] = React.useState(16);
  const [zipName, setZipName] = React.useState('extracted-images');
  const [zipNameEdited, setZipNameEdited] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  // Tab 2: Embedded vector Form XObjects state
  const [vectors, setVectors] = React.useState<FormVectorItem[]>([]);
  const [vectorBusy, setVectorBusy] = React.useState(false);
  const [vectorProgress, setVectorProgress] = React.useState({ fraction: 0, label: '' });
  const [vectorZipName, setVectorZipName] = React.useState('extracted-vectors');
  const [vectorZipEdited, setVectorZipEdited] = React.useState(false);

  // Tab 3: Detect & crop figures state
  const [activeSourceId, setActiveSourceId] = React.useState('');
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageCount, setPageCount] = React.useState(0);
  const [activeDoc, setActiveDoc] = React.useState<PDFDocumentProxy | null>(null);
  const [boxes, setBoxes] = React.useState<FigureBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = React.useState<string | null>(null);
  const [mergeGapPt, setMergeGapPt] = React.useState(14);
  const [minSizePt, setMinSizePt] = React.useState(36);
  const [paddingPt, setPaddingPt] = React.useState(4);
  const [exportFormat, setExportFormat] = React.useState<BoxExportFormat>('svg');
  const [pngDpi, setPngDpi] = React.useState(300);
  const [cropBusy, setCropBusy] = React.useState(false);
  const [cropProgress, setCropProgress] = React.useState({ fraction: 0, label: '' });
  const [cropNotice, setCropNotice] = React.useState<string | null>(null);

  const urlsRef = React.useRef<Set<string>>(new Set());
  const epochRef = React.useRef(0);
  const vectorEpochRef = React.useRef(0);
  const activeScansRef = React.useRef(0);
  const activeVectorScansRef = React.useRef(0);
  const sourcesRef = React.useRef<SourcePdf[]>(sources);
  sourcesRef.current = sources;

  const openDocRef = React.useRef<OpenDocHandle | null>(null);
  const vectorIndexCacheRef = React.useRef<Map<string, PageVectorIndex>>(new Map());
  const pageSizesRef = React.useRef<Map<string, { width: number; height: number }>>(new Map());

  const createUrl = React.useCallback((bytes: Uint8Array, mime: string) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    urlsRef.current.add(url);
    return url;
  }, []);

  const revokeUrl = React.useCallback((url: string) => {
    if (urlsRef.current.delete(url)) URL.revokeObjectURL(url);
  }, []);

  const revokeAllUrls = React.useCallback(() => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current.clear();
  }, []);

  const closeOpenDoc = React.useCallback(async () => {
    const handle = openDocRef.current;
    openDocRef.current = null;
    setActiveDoc(null);
    setPageCount(0);
    if (handle) {
      await handle.close().catch(() => undefined);
    }
  }, []);

  React.useEffect(() => () => {
    epochRef.current += 1;
    vectorEpochRef.current += 1;
    revokeAllUrls();
    const handle = openDocRef.current;
    openDocRef.current = null;
    if (handle) void handle.close().catch(() => undefined);
    vectorIndexCacheRef.current.clear();
    pageSizesRef.current.clear();
  }, [revokeAllUrls]);

  // Debounce numeric threshold edits for raster extraction.
  React.useEffect(() => {
    const target = skipTiny ? minPx : 1;
    if (target === appliedMinSize) return;
    const timer = setTimeout(() => setAppliedMinSize(target), skipTiny ? 220 : 0);
    return () => clearTimeout(timer);
  }, [skipTiny, minPx, appliedMinSize]);

  const scanVectorsForSources = React.useCallback(async (targets: SourcePdf[]) => {
    const scannable = targets.filter((s) => !s.locked && !s.error);
    if (!scannable.length) return;

    const epoch = vectorEpochRef.current;
    activeVectorScansRef.current += 1;
    setVectorBusy(true);
    setVectorProgress({ fraction: 0, label: 'Scanning vector Form XObjects…' });

    try {
      for (let i = 0; i < scannable.length; i++) {
        if (vectorEpochRef.current !== epoch) return;
        const src = scannable[i];
        const current = sourcesRef.current.find((s) => s.id === src.id);
        if (!current || current.locked || current.error) continue;

        const createdUrls: string[] = [];
        const trackedCreateUrl = (bytes: Uint8Array, mime: string) => {
          const url = createUrl(bytes, mime);
          createdUrls.push(url);
          return url;
        };

        try {
          const found = await scanSourceFormVectors(
            current,
            trackedCreateUrl,
            () => vectorEpochRef.current !== epoch || !sourcesRef.current.some((s) => s.id === src.id),
            (f, label) => {
              if (vectorEpochRef.current === epoch) {
                setVectorProgress({
                  fraction: (i + f) / scannable.length,
                  label: `${current.name}: ${label}`,
                });
              }
            },
          );
          if (vectorEpochRef.current !== epoch || !sourcesRef.current.some((s) => s.id === src.id)) {
            for (const u of createdUrls) revokeUrl(u);
            continue;
          }
          if (found.length) {
            setVectors((prev) => [...prev, ...found]);
          }
        } catch {
          for (const u of createdUrls) revokeUrl(u);
          // Password or parse failures are already surfaced by the raster scan.
        }
      }
    } finally {
      activeVectorScansRef.current = Math.max(0, activeVectorScansRef.current - 1);
      if (activeVectorScansRef.current === 0) setVectorBusy(false);
    }
  }, [createUrl, revokeUrl]);

  const scanSources = React.useCallback(
    async (targets: SourcePdf[], minSize: number, replaceExisting: boolean, alsoScanVectors: boolean) => {
      const scannable = targets.filter((s) => !s.locked);
      if (!scannable.length) return;
      if (replaceExisting) {
        epochRef.current += 1;
        setImages((prev) => {
          for (const it of prev) revokeUrl(it.url);
          return [];
        });
        setSources((prev) =>
          prev.map((s) =>
            s.locked ? s : { ...s, scanning: true, error: null, imageCount: 0, skipped: 0 },
          ),
        );
      }

      const epoch = epochRef.current;
      activeScansRef.current += 1;
      setBusy(true);
      setProgress({ fraction: 0, label: 'Scanning PDFs…' });

      const unlockedForVectors: SourcePdf[] = [];

      try {
        for (let i = 0; i < scannable.length; i++) {
          if (epochRef.current !== epoch) return;
          const src = scannable[i];
          const currentSrc = sourcesRef.current.find((s) => s.id === src.id);
          if (!currentSrc || currentSrc.locked) continue;
          try {
            const res = await runExtractImagesFromPdf(
              src.bytes,
              { sourceName: src.name, minSize, password: currentSrc.password },
              (f, label) => {
                if (epochRef.current === epoch) {
                  setProgress({
                    fraction: (i + f) / scannable.length,
                    label: `${src.name}: ${label}`,
                  });
                }
              },
            );
            if (epochRef.current !== epoch || !sourcesRef.current.some((s) => s.id === src.id)) continue;
            const cards: ImageCardItem[] = res.images.map((img) => ({
              ...img,
              sourceId: src.id,
              sourceName: src.name,
              url: createUrl(img.bytes, img.mime),
            }));
            setImages((prev) => [...prev, ...cards]);
            setSources((prev) =>
              prev.map((s) =>
                s.id === src.id
                  ? { ...s, scanning: false, locked: false, error: null, imageCount: cards.length, skipped: res.skipped }
                  : s,
              ),
            );
            unlockedForVectors.push({ ...currentSrc, scanning: false, locked: false, error: null });
          } catch (e) {
            if (epochRef.current !== epoch) return;
            if (isPasswordError(e)) {
              setSources((prev) =>
                prev.map((s) =>
                  s.id === src.id
                    ? { ...s, scanning: false, locked: true, error: null, imageCount: 0, skipped: 0 }
                    : s,
                ),
              );
              setPasswordQueue((q) => (q.includes(src.id) ? q : [...q, src.id]));
            } else {
              setSources((prev) =>
                prev.map((s) =>
                  s.id === src.id
                    ? { ...s, scanning: false, error: errorMessage(e), imageCount: 0, skipped: 0 }
                    : s,
                ),
              );
            }
          }
        }
      } finally {
        activeScansRef.current = Math.max(0, activeScansRef.current - 1);
        if (activeScansRef.current === 0) setBusy(false);
      }

      if (alsoScanVectors && unlockedForVectors.length > 0 && epochRef.current === epoch) {
        void scanVectorsForSources(unlockedForVectors);
      }
    },
    [createUrl, revokeUrl, scanVectorsForSources],
  );

  // Re-scan currently loaded PDFs whenever the applied raster min-size filter changes.
  const prevMinSizeRef = React.useRef(appliedMinSize);
  React.useEffect(() => {
    if (prevMinSizeRef.current === appliedMinSize) return;
    prevMinSizeRef.current = appliedMinSize;
    if (sourcesRef.current.length > 0) {
      void scanSources(sourcesRef.current, appliedMinSize, true, false);
    }
  }, [appliedMinSize, scanSources]);

  // Keep Tab 3's active source valid whenever sources list changes.
  const unlockedSources = React.useMemo(
    () => sources.filter((s) => !s.locked && !s.error),
    [sources],
  );

  React.useEffect(() => {
    if (!unlockedSources.length) {
      if (activeSourceId) setActiveSourceId('');
      return;
    }
    if (!unlockedSources.some((s) => s.id === activeSourceId)) {
      setActiveSourceId(unlockedSources[0].id);
      setPageIndex(0);
    }
  }, [unlockedSources, activeSourceId]);

  // Open one PDFDocumentProxy for the active Tab 3 source when Tab 3 is active (or close when cleared/switched).
  React.useEffect(() => {
    if (activeTab !== 'crop' || !activeSourceId) return;
    const src = unlockedSources.find((s) => s.id === activeSourceId);
    if (!src) return;
    if (openDocRef.current?.sourceId === src.id) {
      setActiveDoc(openDocRef.current.doc);
      setPageCount(openDocRef.current.doc.numPages);
      return;
    }

    let cancelled = false;
    (async () => {
      await closeOpenDoc();
      if (cancelled) return;
      try {
        const opened = await openPdf(src.bytes, src.password);
        if (cancelled) {
          await opened.close().catch(() => undefined);
          return;
        }
        openDocRef.current = { sourceId: src.id, doc: opened.doc, close: opened.close };
        setActiveDoc(opened.doc);
        setPageCount(opened.doc.numPages);
        setPageIndex((p) => Math.min(p, Math.max(0, opened.doc.numPages - 1)));
      } catch (e) {
        if (!cancelled) setCropNotice(errorMessage(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, activeSourceId, unlockedSources, closeOpenDoc]);

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(
      pdfs.length < files.length
        ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.`
        : null,
    );
    if (!pdfs.length) return;

    const added: SourcePdf[] = await Promise.all(
      pdfs.map(async (file) => ({
        id: uid(),
        name: file.name,
        bytes: await readBytes(file),
        imageCount: 0,
        skipped: 0,
        error: null,
        scanning: true,
      })),
    );

    const wasEmpty = sourcesRef.current.length === 0;
    const nextSources = [...sourcesRef.current, ...added];
    sourcesRef.current = nextSources;
    setSources(nextSources);
    if (wasEmpty) {
      const stem = added.length === 1 ? baseName(added[0].name) : null;
      if (!zipNameEdited) setZipName(stem ? `${stem}-images` : 'extracted-images');
      if (!vectorZipEdited) setVectorZipName(stem ? `${stem}-vectors` : 'extracted-vectors');
    }

    await scanSources(added, appliedMinSize, false, true);
  }

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (handoff?.length) void addFiles(handoffToFiles(handoff));
  }, []);

  const activeLocked = React.useMemo(
    () => passwordQueue.map((id) => sources.find((s) => s.id === id && s.locked)).find(Boolean) ?? null,
    [passwordQueue, sources],
  );
  const remainingLocked = React.useMemo(
    () =>
      passwordQueue.filter(
        (id) => id !== activeLocked?.id && sources.some((s) => s.id === id && s.locked),
      ).length,
    [passwordQueue, sources, activeLocked],
  );

  async function unlockActive(password: string) {
    if (!activeLocked) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const res = await runExtractImagesFromPdf(activeLocked.bytes, {
        sourceName: activeLocked.name,
        minSize: appliedMinSize,
        password,
      });
      const cards: ImageCardItem[] = res.images.map((img) => ({
        ...img,
        sourceId: activeLocked.id,
        sourceName: activeLocked.name,
        url: createUrl(img.bytes, img.mime),
      }));
      setImages((prev) => [...prev, ...cards]);
      const unlockedSrc: SourcePdf = {
        ...activeLocked,
        password,
        locked: false,
        scanning: false,
        error: null,
        imageCount: cards.length,
        skipped: res.skipped,
      };
      const updated = sourcesRef.current.map((s) => (s.id === activeLocked.id ? unlockedSrc : s));
      sourcesRef.current = updated;
      setSources(updated);
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      void scanVectorsForSources([unlockedSrc]);
    } catch (e) {
      if (isPasswordError(e)) {
        setPwError('Incorrect password. Try again.');
      } else {
        const updated = sourcesRef.current.map((s) =>
          s.id === activeLocked.id
            ? { ...s, locked: false, scanning: false, error: errorMessage(e), imageCount: 0, skipped: 0 }
            : s,
        );
        sourcesRef.current = updated;
        setSources(updated);
        setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      }
    } finally {
      setPwBusy(false);
    }
  }

  function cancelUnlock() {
    if (!activeLocked) return;
    const updated = sourcesRef.current.map((s) =>
      s.id === activeLocked.id
        ? { ...s, locked: false, scanning: false, error: 'Password required to open this PDF.' }
        : s,
    );
    sourcesRef.current = updated;
    setSources(updated);
    setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    setPwError(null);
  }

  function removeSource(id: string) {
    sourcesRef.current = sourcesRef.current.filter((s) => s.id !== id);
    setSources((prev) => prev.filter((s) => s.id !== id));
    setPasswordQueue((q) => q.filter((x) => x !== id));

    setImages((prev) => {
      const kept: ImageCardItem[] = [];
      for (const it of prev) {
        if (it.sourceId === id) revokeUrl(it.url);
        else kept.push(it);
      }
      return kept;
    });

    setVectors((prev) => {
      const kept: FormVectorItem[] = [];
      for (const it of prev) {
        if (it.sourceId === id) revokeUrl(it.svgUrl);
        else kept.push(it);
      }
      return kept;
    });

    setBoxes((prev) => {
      const next = prev.filter((b) => b.sourceId !== id);
      if (selectedBoxId && !next.some((b) => b.id === selectedBoxId)) {
        setSelectedBoxId(null);
      }
      return next;
    });

    for (const key of Array.from(vectorIndexCacheRef.current.keys())) {
      if (key.startsWith(`${id}:`)) vectorIndexCacheRef.current.delete(key);
    }
    for (const key of Array.from(pageSizesRef.current.keys())) {
      if (key.startsWith(`${id}:`)) pageSizesRef.current.delete(key);
    }
    if (openDocRef.current?.sourceId === id) {
      void closeOpenDoc();
    }
  }

  function clearAll() {
    epochRef.current += 1;
    vectorEpochRef.current += 1;
    revokeAllUrls();
    void closeOpenDoc();
    vectorIndexCacheRef.current.clear();
    pageSizesRef.current.clear();
    sourcesRef.current = [];
    setSources([]);
    setImages([]);
    setVectors([]);
    setBoxes([]);
    setSelectedBoxId(null);
    setActiveSourceId('');
    setPageIndex(0);
    setPasswordQueue([]);
    setPwError(null);
    setBusy(false);
    setVectorBusy(false);
    setCropBusy(false);
    setNotice(null);
    setCropNotice(null);
    setZipName('extracted-images');
    setZipNameEdited(false);
    setVectorZipName('extracted-vectors');
    setVectorZipEdited(false);
    setActiveTab('raster');
  }

  // Tab 1 metrics & download
  const jpgCount = React.useMemo(() => images.filter((img) => img.mime === 'image/jpeg').length, [images]);
  const pngCount = images.length - jpgCount;
  const totalBytes = React.useMemo(() => images.reduce((sum, img) => sum + img.bytes.length, 0), [images]);
  const totalSkipped = React.useMemo(() => sources.reduce((sum, s) => sum + s.skipped, 0), [sources]);

  function downloadAllRaster() {
    if (!images.length) return;
    if (images.length === 1) {
      download(images[0].bytes, images[0].name, images[0].mime);
      return;
    }
    const zip = zipFiles(images.map((img) => ({ name: img.name, bytes: img.bytes })));
    const outName = `${safeFileName(zipName, 'extracted-images').replace(/\.zip$/i, '')}.zip`;
    download(zip, outName, 'application/zip');
  }

  // Tab 3 helpers: cached page vector index, auto-detect, tighten, CRUD, export
  const getPageVectorIndex = React.useCallback(
    async (sourceId: string, doc: PDFDocumentProxy, pIndex: number): Promise<PageVectorIndex> => {
      const key = `${sourceId}:${pIndex}`;
      const cached = vectorIndexCacheRef.current.get(key);
      if (cached) return cached;
      const page = await doc.getPage(pIndex + 1);
      try {
        const idx = await analyzePageVectors(page);
        vectorIndexCacheRef.current.set(key, idx);
        pageSizesRef.current.set(key, { width: idx.pageWidth, height: idx.pageHeight });
        return idx;
      } finally {
        try {
          page.cleanup();
        } catch {
          // Ignore cleanup errors.
        }
      }
    },
    [],
  );

  const handlePageSize = React.useCallback(
    (size: { width: number; height: number }) => {
      if (!activeSourceId) return;
      pageSizesRef.current.set(`${activeSourceId}:${pageIndex}`, size);
    },
    [activeSourceId, pageIndex],
  );

  const handleAddBox = React.useCallback(
    (rect: ViewportRect) => {
      if (!activeSourceId) return;
      setCropNotice(null);
      const id = uid();
      setBoxes((prev) => {
        const countOnPage = prev.filter(
          (b) => b.sourceId === activeSourceId && b.pageIndex === pageIndex,
        ).length;
        const nextBox: FigureBox = {
          id,
          sourceId: activeSourceId,
          pageIndex,
          rect,
          label: `Fig p${pageIndex + 1}-${countOnPage + 1}`,
        };
        return [...prev, nextBox];
      });
      setSelectedBoxId(id);
    },
    [activeSourceId, pageIndex],
  );

  const handleUpdateBox = React.useCallback((id: string, rect: ViewportRect) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, rect } : b)));
  }, []);

  const handleDeleteBox = React.useCallback((id: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setSelectedBoxId((curr) => (curr === id ? null : curr));
  }, []);

  const handleLabelChange = React.useCallback((id: string, label: string) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, label } : b)));
  }, []);

  const handlePadBox = React.useCallback((id: string, deltaPt: number) => {
    setBoxes((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const size = pageSizesRef.current.get(`${b.sourceId}:${b.pageIndex}`);
        const maxW = size ? size.width : b.rect.x + b.rect.width + Math.max(0, deltaPt);
        const maxH = size ? size.height : b.rect.y + b.rect.height + Math.max(0, deltaPt);

        let x = b.rect.x - deltaPt;
        let y = b.rect.y - deltaPt;
        let x2 = b.rect.x + b.rect.width + deltaPt;
        let y2 = b.rect.y + b.rect.height + deltaPt;

        x = Math.max(0, x);
        y = Math.max(0, y);
        x2 = Math.min(maxW, x2);
        y2 = Math.min(maxH, y2);

        if (x2 - x < MIN_BOX_PT) {
          const cx = (b.rect.x + b.rect.x + b.rect.width) / 2;
          x = Math.max(0, Math.min(maxW - MIN_BOX_PT, cx - MIN_BOX_PT / 2));
          x2 = x + MIN_BOX_PT;
        }
        if (y2 - y < MIN_BOX_PT) {
          const cy = (b.rect.y + b.rect.y + b.rect.height) / 2;
          y = Math.max(0, Math.min(maxH - MIN_BOX_PT, cy - MIN_BOX_PT / 2));
          y2 = y + MIN_BOX_PT;
        }
        return { ...b, rect: { x, y, width: x2 - x, height: y2 - y } };
      }),
    );
  }, []);

  const handleDuplicateBox = React.useCallback((id: string) => {
    const newId = uid();
    setBoxes((prev) => {
      const target = prev.find((b) => b.id === id);
      if (!target) return prev;
      const size = pageSizesRef.current.get(`${target.sourceId}:${target.pageIndex}`);
      const maxX = size ? Math.max(0, size.width - target.rect.width) : target.rect.x + 12;
      const maxY = size ? Math.max(0, size.height - target.rect.height) : target.rect.y + 12;
      const copy: FigureBox = {
        ...target,
        id: newId,
        label: `${target.label} copy`,
        auto: false,
        rect: {
          ...target.rect,
          x: Math.min(maxX, target.rect.x + 12),
          y: Math.min(maxY, target.rect.y + 12),
        },
      };
      return [...prev, copy];
    });
    setSelectedBoxId(newId);
  }, []);

  const handleTightenBox = React.useCallback(
    async (id: string) => {
      const target = boxes.find((b) => b.id === id);
      if (!target) return;
      const doc = openDocRef.current?.sourceId === target.sourceId ? openDocRef.current.doc : null;
      if (!doc) return;

      setCropNotice(null);
      setCropBusy(true);
      setCropProgress({ fraction: 0.4, label: 'Analyzing vector bounds…' });
      try {
        const idx = await getPageVectorIndex(target.sourceId, doc, target.pageIndex);
        const tight = tightenRegionToContent(idx, target.rect, paddingPt);
        if (!tight) {
          setCropNotice('No vector paths, images, or text were found inside that box.');
        } else {
          setBoxes((prev) => prev.map((b) => (b.id === id ? { ...b, rect: tight } : b)));
        }
      } catch (e) {
        setCropNotice(errorMessage(e));
      } finally {
        setCropBusy(false);
      }
    },
    [boxes, getPageVectorIndex, paddingPt],
  );

  const handleDetectPage = React.useCallback(async () => {
    if (!activeDoc || !activeSourceId) return;
    setCropNotice(null);
    setCropBusy(true);
    setCropProgress({ fraction: 0.3, label: `Detecting figures on page ${pageIndex + 1}…` });
    try {
      const idx = await getPageVectorIndex(activeSourceId, activeDoc, pageIndex);
      const detected = detectFiguresOnPage(idx, { mergeGapPt, minSizePt, paddingPt });
      const newBoxes: FigureBox[] = detected.map((d, i) => ({
        id: uid(),
        sourceId: activeSourceId,
        pageIndex,
        rect: d.rect,
        label: `Fig p${pageIndex + 1}-${i + 1}`,
        auto: true,
      }));
      setBoxes((prev) => [
        ...prev.filter((b) => !(b.sourceId === activeSourceId && b.pageIndex === pageIndex && b.auto)),
        ...newBoxes,
      ]);
      if (newBoxes.length > 0) {
        setSelectedBoxId(newBoxes[0].id);
      } else {
        setCropNotice(`No figures detected on page ${pageIndex + 1}. Try lowering Min size or draw a box manually.`);
      }
    } catch (e) {
      setCropNotice(errorMessage(e));
    } finally {
      setCropBusy(false);
    }
  }, [activeDoc, activeSourceId, pageIndex, getPageVectorIndex, mergeGapPt, minSizePt, paddingPt]);

  const handleDetectAllPages = React.useCallback(async () => {
    if (!activeDoc || !activeSourceId) return;
    setCropNotice(null);
    setCropBusy(true);
    const total = activeDoc.numPages;
    const collected: FigureBox[] = [];
    try {
      for (let p = 0; p < total; p++) {
        setCropProgress({
          fraction: (p + 0.2) / Math.max(1, total),
          label: `Analyzing page ${p + 1} of ${total}…`,
        });
        await nextFrame();
        const idx = await getPageVectorIndex(activeSourceId, activeDoc, p);
        const detected = detectFiguresOnPage(idx, { mergeGapPt, minSizePt, paddingPt });
        detected.forEach((d, i) => {
          collected.push({
            id: uid(),
            sourceId: activeSourceId,
            pageIndex: p,
            rect: d.rect,
            label: `Fig p${p + 1}-${i + 1}`,
            auto: true,
          });
        });
      }
      setBoxes((prev) => [
        ...prev.filter((b) => !(b.sourceId === activeSourceId && b.auto)),
        ...collected,
      ]);
      if (collected.length > 0) {
        setSelectedBoxId(collected[0].id);
        setPageIndex(collected[0].pageIndex);
      } else {
        setCropNotice('No figures were auto-detected in this PDF. Try adjusting Min size or draw boxes directly.');
      }
    } catch (e) {
      setCropNotice(errorMessage(e));
    } finally {
      setCropBusy(false);
    }
  }, [activeDoc, activeSourceId, getPageVectorIndex, mergeGapPt, minSizePt, paddingPt]);

  const handleJumpToBox = React.useCallback((box: FigureBox) => {
    setActiveSourceId(box.sourceId);
    setPageIndex(box.pageIndex);
    setSelectedBoxId(box.id);
    setCropNotice(null);
  }, []);

  const handleDownloadBox = React.useCallback(
    async (box: FigureBox, format: 'svg' | 'pdf' | 'png') => {
      const src = sourcesRef.current.find((s) => s.id === box.sourceId);
      if (!src) return;
      setCropNotice(null);
      setCropBusy(true);
      setCropProgress({ fraction: 0.4, label: `Exporting ${box.label} (${format.toUpperCase()})…` });
      try {
        await exportSingleBox(box, src, format, pngDpi, openDocRef.current);
      } catch (e) {
        setCropNotice(errorMessage(e));
      } finally {
        setCropBusy(false);
      }
    },
    [pngDpi],
  );

  const handleDownloadAllBoxes = React.useCallback(async () => {
    if (!boxes.length) return;
    setCropNotice(null);
    setCropBusy(true);
    setCropProgress({ fraction: 0.05, label: 'Preparing figure export…' });
    try {
      await exportAllBoxes(boxes, sourcesRef.current, exportFormat, pngDpi, openDocRef.current, (f, label) => {
        setCropProgress({ fraction: f, label });
      });
    } catch (e) {
      setCropNotice(errorMessage(e));
    } finally {
      setCropBusy(false);
    }
  }, [boxes, exportFormat, pngDpi]);

  const selectedBox = React.useMemo(
    () => boxes.find((b) => b.id === selectedBoxId) ?? null,
    [boxes, selectedBoxId],
  );

  const pageBoxesCount = React.useMemo(
    () => boxes.filter((b) => b.sourceId === activeSourceId && b.pageIndex === pageIndex).length,
    [boxes, activeSourceId, pageIndex],
  );

  const rasterSidebar = (
    <>
      <div className={styles.options}>
        <Checkbox
          label="Skip tiny images (spacers & icons)"
          checked={skipTiny}
          onChange={setSkipTiny}
        />
        {skipTiny && (
          <Field
            label="Minimum dimension (px)"
            help="Images narrower or shorter than this are ignored."
          >
            <NumberInput value={minPx} onChange={setMinPx} min={1} max={1000} />
          </Field>
        )}
        {images.length > 1 && (
          <Field label="ZIP file name">
            <input
              className={qrStyles.input}
              value={zipName}
              onChange={(e) => {
                setZipName(e.target.value);
                setZipNameEdited(true);
              }}
            />
          </Field>
        )}
      </div>

      <div className={styles.summaryBox}>
        <div className={styles.summaryRow}>
          <span>Extracted images</span>
          <span>{images.length}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Original JPG</span>
          <span>{jpgCount}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Lossless PNG</span>
          <span>{pngCount}</span>
        </div>
        <div className={styles.summaryRow}>
          <span>Total size</span>
          <span>{formatBytes(totalBytes)}</span>
        </div>
      </div>

      {totalSkipped > 0 && (
        <p className={styles.note}>
          {totalSkipped} unsupported image{totalSkipped === 1 ? '' : 's'} (e.g. CMYK, JPEG 2000, JBIG2 or 1-bit masks) {totalSkipped === 1 ? 'was' : 'were'} skipped.
        </p>
      )}
      {notice && <p className={qrStyles.warning}>{notice}</p>}

      <button
        type="button"
        className={styles.primary}
        disabled={busy || images.length === 0}
        onClick={downloadAllRaster}
      >
        {images.length === 1
          ? 'Download image'
          : `Download all (${images.length} images, ZIP)`}
      </button>

      {busy && <Progress fraction={progress.fraction} label={progress.label} />}
    </>
  );

  const activeSidebar =
    activeTab === 'raster' ? (
      rasterSidebar
    ) : activeTab === 'vectors' ? (
      <EmbeddedVectorsSidebar
        vectors={vectors}
        zipName={vectorZipName}
        onZipNameChange={(v) => {
          setVectorZipName(v);
          setVectorZipEdited(true);
        }}
        busy={vectorBusy}
        progress={vectorProgress}
      />
    ) : (
      <DetectCropSidebar
        boxes={boxes}
        selectedBox={selectedBox}
        mergeGapPt={mergeGapPt}
        minSizePt={minSizePt}
        paddingPt={paddingPt}
        exportFormat={exportFormat}
        pngDpi={pngDpi}
        notice={cropNotice}
        busy={cropBusy}
        progress={cropProgress}
        onMergeGapChange={setMergeGapPt}
        onMinSizeChange={setMinSizePt}
        onPaddingChange={setPaddingPt}
        onExportFormatChange={setExportFormat}
        onPngDpiChange={setPngDpi}
        onLabelChange={handleLabelChange}
        onTightenBox={(id) => void handleTightenBox(id)}
        onPadBox={handlePadBox}
        onDuplicateBox={handleDuplicateBox}
        onDeleteBox={handleDeleteBox}
        onJumpToBox={handleJumpToBox}
        onDownloadBox={(box, fmt) => void handleDownloadBox(box, fmt)}
        onClearPage={() => {
          setBoxes((prev) =>
            prev.filter((b) => !(b.sourceId === activeSourceId && b.pageIndex === pageIndex)),
          );
          setSelectedBoxId(null);
        }}
        onClearAll={() => {
          setBoxes([]);
          setSelectedBoxId(null);
        }}
        onDownloadAll={() => void handleDownloadAllBoxes()}
        pageBoxesCount={pageBoxesCount}
      />
    );

  return (
    <PdfPage
      title={EXTRACT_IMAGES.title}
      showHub
      lead="Extract embedded raster images (original JPGs or lossless PNGs), standalone vector Form XObjects (SVG/PDF), or auto-detect and crop inline vector figures right from the page."
    >
      <ToolWorkspace
        tool={EXTRACT_IMAGES}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop PDFs here"
        addLabel="+ Add PDFs"
        hasFiles={sources.length > 0}
        onFiles={addFiles}
        toolbar={<button type="button" className={styles.buttonSmall} onClick={clearAll}>Remove all</button>}
        sidebar={activeSidebar}
      >
        {activeLocked && (
          <PasswordPrompt
            fileName={activeLocked.name}
            error={pwError}
            busy={pwBusy}
            remaining={remainingLocked}
            onSubmit={unlockActive}
            onCancel={cancelUnlock}
          />
        )}

        <div className={styles.sourceChipList}>
          {sources.map((src) => (
            <div key={src.id} className={[styles.sourceChip, src.error ? styles.sourceChipError : ''].join(' ')}>
              <span className={styles.sourceChipName} title={src.name}>{src.name}</span>
              <span className={styles.sourceChipMeta}>
                {src.scanning
                  ? 'Scanning…'
                  : src.locked
                    ? 'Password protected'
                    : src.error
                      ? src.error
                      : `${src.imageCount} image${src.imageCount === 1 ? '' : 's'}`}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                title={`Remove ${src.name}`}
                aria-label={`Remove ${src.name}`}
                onClick={() => removeSource(src.id)}
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        <div className={styles.tabBar} role="tablist" aria-label="Extraction mode">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'raster'}
            className={[styles.tab, activeTab === 'raster' ? styles.tabActive : ''].join(' ')}
            onClick={() => setActiveTab('raster')}
          >
            Raster images
            <span className={styles.tabBadge}>{images.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'vectors'}
            className={[styles.tab, activeTab === 'vectors' ? styles.tabActive : ''].join(' ')}
            onClick={() => setActiveTab('vectors')}
          >
            Embedded vectors
            <span className={styles.tabBadge}>{vectors.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'crop'}
            className={[styles.tab, activeTab === 'crop' ? styles.tabActive : ''].join(' ')}
            onClick={() => setActiveTab('crop')}
          >
            Detect &amp; crop figures
            {boxes.length > 0 && <span className={styles.tabBadge}>{boxes.length}</span>}
          </button>
        </div>

        {activeTab === 'raster' && (
          <>
            {!busy && images.length === 0 && (
              <p className={styles.note}>
                No extractable images were found{skipTiny ? ` at least ${appliedMinSize} px on each side` : ''}.
                {totalSkipped > 0 ? ' Some embedded images use unsupported encodings (such as CMYK or JPEG 2000).' : ''}
                {' '}To rasterize entire pages instead, use{' '}
                <Link href="/pdf/pdf-to-images" className={styles.textLink}>PDF to images</Link>.
              </p>
            )}

            {images.length > 0 && (
              <ul className={styles.fileGrid}>
                {images.map((item) => {
                  const pageList = formatPageRanges(item.pages.map((p) => p - 1));
                  const isJpeg = item.mime === 'image/jpeg';
                  return (
                    <li key={item.id} className={styles.fileCard}>
                      <div className={[styles.thumb, isJpeg ? '' : styles.thumbCheckered].join(' ')}>
                        <img src={item.url} alt={item.name} loading="lazy" />
                      </div>
                      <span className={isJpeg ? styles.badgeJpg : styles.badgePng}>
                        {isJpeg ? 'Original JPG' : 'Lossless PNG'}
                      </span>
                      <div className={styles.fileName} title={item.name}>{item.name}</div>
                      <div className={styles.fileMeta}>
                        {item.width} &times; {item.height} &middot; {formatBytes(item.bytes.length)}
                      </div>
                      <div className={styles.fileMeta}>
                        {item.pages.length === 1 ? `Page ${pageList}` : `Pages ${pageList}`}
                        {sources.length > 1 ? ` · ${item.sourceName}` : ''}
                      </div>
                      <div className={styles.cardFooter}>
                        <button
                          type="button"
                          className={styles.buttonSmall}
                          style={{ width: '100%' }}
                          onClick={() => download(item.bytes, item.name, item.mime)}
                        >
                          Download
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {activeTab === 'vectors' && (
          <EmbeddedVectorsPanel
            vectors={vectors}
            sourcesCount={sources.length}
            scanning={vectorBusy}
            onSwitchToCrop={() => setActiveTab('crop')}
          />
        )}

        {activeTab === 'crop' && (
          <DetectCropPanel
            unlockedSources={unlockedSources}
            activeSourceId={activeSourceId}
            onSelectSource={(id) => {
              setActiveSourceId(id);
              setPageIndex(0);
              setSelectedBoxId(null);
            }}
            doc={activeDoc}
            pageIndex={pageIndex}
            pageCount={pageCount}
            onPageChange={(nextIdx) => {
              setPageIndex(nextIdx);
              setSelectedBoxId(null);
            }}
            boxes={boxes}
            selectedId={selectedBoxId}
            onSelectBox={setSelectedBoxId}
            onAddBox={handleAddBox}
            onUpdateBox={handleUpdateBox}
            onDeleteBox={handleDeleteBox}
            onTightenBox={(id) => void handleTightenBox(id)}
            onPageSize={handlePageSize}
            onDetectPage={() => void handleDetectPage()}
            onDetectAllPages={() => void handleDetectAllPages()}
            busy={cropBusy}
          />
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
