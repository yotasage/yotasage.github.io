import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, Select } from '../../components/QrGen/fields';
import { InvertMode, transformRgbaPixels } from '../../lib/pdf/color';
import { rasterTransformPdf } from '../../lib/pdf/colorRaster';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  nextFrame,
  OutputFile,
  readBytes,
  uid,
  zipFiles,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { parsePageRanges } from '../../lib/pdf/merge';
import { openPdf, pdfPreview, renderPage } from '../../lib/pdf/pdfjs';
import { INVERT } from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

type RasterFormat = 'jpeg' | 'png';
type DpiChoice = '100' | '150' | '200' | '300';

interface Item {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
  password?: string;
  locked?: boolean;
}

interface ItemResult {
  bytes?: Uint8Array;
  error?: string;
}

interface OriginalPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface ModePresetInfo {
  id: InvertMode;
  title: string;
  description: string;
  bg: string;
  fg: string;
  accent?: string;
}

const MODE_PRESETS: ModePresetInfo[] = [
  {
    id: 'smart-dark',
    title: 'Smart dark mode',
    description: 'Dark charcoal paper (#171717) with hue preservation so links and charts keep their colours.',
    bg: '#171717',
    fg: '#ededed',
    accent: '#4da3ff',
  },
  {
    id: 'warm-dark',
    title: 'Warm dark',
    description: 'Low-glare dark sepia paper (#1e1b17) with warm cream text for comfortable night reading.',
    bg: '#1e1b17',
    fg: '#e8dec8',
    accent: '#e59a3a',
  },
  {
    id: 'invert',
    title: 'Classic invert',
    description: 'Exact RGB colour inversion (255 − c) producing pure black backgrounds and white text.',
    bg: '#000000',
    fg: '#ffffff',
  },
  {
    id: 'custom',
    title: 'Custom colours',
    description: 'Pick any background and ink colour pair, with optional hue preservation for coloured elements.',
    bg: '#1b2230',
    fg: '#dce7f7',
    accent: '#7c8cf8',
  },
];

function normalizeHex(raw: string, fallback: string): string {
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return fallback;
}

export default function InvertPdfPage() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [mode, setMode] = React.useState<InvertMode>('smart-dark');
  const [backgroundHex, setBackgroundHex] = React.useState('#171717');
  const [foregroundHex, setForegroundHex] = React.useState('#ededed');
  const [preserveHue, setPreserveHue] = React.useState(true);
  const [dpi, setDpi] = React.useState<DpiChoice>('150');
  const [format, setFormat] = React.useState<RasterFormat>('jpeg');
  const [jpegQuality, setJpegQuality] = React.useState(88);
  const [pageRange, setPageRange] = React.useState('');

  const [previewItemId, setPreviewItemId] = React.useState<string | null>(null);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [showOriginal, setShowOriginal] = React.useState(false);

  const [pdfProxy, setPdfProxy] = React.useState<PDFDocumentProxy | null>(null);
  const closeProxyRef = React.useRef<(() => Promise<void>) | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const originalPixelsRef = React.useRef<OriginalPixels | null>(null);
  const [stageWidth, setStageWidth] = React.useState(580);
  const [renderWidth, setRenderWidth] = React.useState(580);
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [renderTick, setRenderTick] = React.useState(0);

  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const safeBg = normalizeHex(backgroundHex, '#171717');
  const safeFg = normalizeHex(foregroundHex, '#ededed');

  const ids = items.map((it) => it.id).join();
  React.useEffect(() => {
    setResults({});
  }, [ids, mode, safeBg, safeFg, preserveHue, dpi, format, jpegQuality, pageRange]);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.` : null);
    const added = await Promise.all(
      pdfs.map(async (file): Promise<Item> => ({
        id: uid(),
        name: file.name,
        bytes: await readBytes(file),
        pageCount: null,
        thumb: null,
        error: null,
      })),
    );
    setItems((list) => [...list, ...added]);
    for (const item of added) {
      pdfPreview(item.bytes, 240)
        .then((p) => update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
        .catch((e) => {
          if (isPasswordError(e)) {
            update(item.id, { locked: true, error: null });
            setPasswordQueue((q) => (q.includes(item.id) ? q : [...q, item.id]));
          } else {
            update(item.id, { error: errorMessage(e) });
          }
        });
    }
  }

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (handoff?.length) void addFiles(handoffToFiles(handoff));
  }, []);

  const activeLocked = React.useMemo(
    () => passwordQueue.map((id) => items.find((it) => it.id === id && it.locked)).find(Boolean) ?? null,
    [passwordQueue, items],
  );
  const remainingLocked = React.useMemo(
    () => passwordQueue.filter((id) => id !== activeLocked?.id && items.some((it) => it.id === id && it.locked)).length,
    [passwordQueue, items, activeLocked],
  );

  async function unlockActive(password: string) {
    if (!activeLocked) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const p = await pdfPreview(activeLocked.bytes, 240, password);
      update(activeLocked.id, {
        pageCount: p.pageCount,
        thumb: p.thumbnail,
        password,
        locked: false,
        error: null,
      });
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    } catch (e) {
      if (isPasswordError(e)) {
        setPwError('Incorrect password. Try again.');
      } else {
        update(activeLocked.id, { locked: false, error: errorMessage(e) });
        setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      }
    } finally {
      setPwBusy(false);
    }
  }

  function cancelUnlock() {
    if (!activeLocked) return;
    update(activeLocked.id, { locked: false, error: 'Password required to open this PDF.' });
    setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    setPwError(null);
  }

  const ready = React.useMemo(
    () => items.filter((it) => !it.error && !it.locked && it.pageCount !== null),
    [items],
  );

  const previewItem = React.useMemo(() => {
    if (!ready.length) return null;
    return ready.find((it) => it.id === previewItemId) ?? ready[0];
  }, [ready, previewItemId]);

  const closeCurrentProxy = React.useCallback(() => {
    const closer = closeProxyRef.current;
    closeProxyRef.current = null;
    setPdfProxy(null);
    originalPixelsRef.current = null;
    if (closer) void closer().catch(() => undefined);
  }, []);

  React.useEffect(() => () => closeCurrentProxy(), [closeCurrentProxy]);

  React.useEffect(() => {
    let cancelled = false;
    if (!previewItem) {
      closeCurrentProxy();
      setPageSize(null);
      setPageIndex(0);
      return;
    }
    setPageIndex(0);
    (async () => {
      try {
        const handle = await openPdf(previewItem.bytes, previewItem.password);
        if (cancelled) {
          void handle.close().catch(() => undefined);
          return;
        }
        closeCurrentProxy();
        closeProxyRef.current = handle.close;
        setPdfProxy(handle.doc);
      } catch {
        if (!cancelled) closeCurrentProxy();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewItem?.id, previewItem?.password, closeCurrentProxy]);

  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const inner = Math.max(180, Math.floor(el.clientWidth - padX));
      setStageWidth((prev) => (Math.abs(prev - inner) > 2 ? inner : prev));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewItem?.id]);

  React.useEffect(() => {
    const t = setTimeout(() => setRenderWidth(stageWidth), 120);
    return () => clearTimeout(t);
  }, [stageWidth]);

  // Render the selected preview page once per (doc, pageIndex, width) and cache original RGBA pixels.
  React.useEffect(() => {
    let cancelled = false;
    if (!pdfProxy) {
      setPageSize(null);
      setRendering(false);
      originalPixelsRef.current = null;
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      return;
    }

    const pageNum = Math.max(1, Math.min(pdfProxy.numPages, pageIndex + 1));
    setRendering(true);

    (async () => {
      let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null;
      let offscreen: HTMLCanvasElement | null = null;
      try {
        page = await pdfProxy.getPage(pageNum);
        if (cancelled) return;
        const baseVp = page.getViewport({ scale: 1 });
        setPageSize({ width: baseVp.width, height: baseVp.height });

        const maxCssW = Math.min(renderWidth, 680);
        const displayScale = Math.min(maxCssW / Math.max(1, baseVp.width), 1.8);
        const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
        offscreen = await renderPage(page, Math.max(0.25, displayScale * dpr));
        if (cancelled) return;

        const offCtx = offscreen.getContext('2d');
        if (!offCtx) return;
        const img = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
        originalPixelsRef.current = {
          width: img.width,
          height: img.height,
          data: new Uint8ClampedArray(img.data),
        };
        setRenderTick((n) => n + 1);
      } catch {
        // Ignore transient render errors while switching files.
      } finally {
        if (offscreen) {
          offscreen.width = 0;
          offscreen.height = 0;
        }
        try {
          page?.cleanup();
        } catch {
          // Ignore cleanup errors.
        }
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfProxy, pageIndex, renderWidth]);

  React.useEffect(() => () => {
    if (canvasRef.current) {
      canvasRef.current.width = 0;
      canvasRef.current.height = 0;
    }
  }, []);

  const rangeState = React.useMemo<{ set: Set<number> | null; error: string | null }>(() => {
    if (items.length !== 1 || !ready[0]?.pageCount || !pageRange.trim()) {
      return { set: null, error: null };
    }
    try {
      return { set: new Set(parsePageRanges(pageRange, ready[0].pageCount)), error: null };
    } catch (e) {
      return { set: null, error: errorMessage(e) };
    }
  }, [items.length, ready, pageRange]);

  const previewPageSkippedByRange =
    items.length === 1 && rangeState.set !== null && !rangeState.set.has(pageIndex);

  // Immediately repaint preview whenever mode, custom colours, preserveHue, or toggle changes.
  React.useEffect(() => {
    const src = originalPixelsRef.current;
    const canvas = canvasRef.current;
    if (!src || !canvas) return;
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const copy = new Uint8ClampedArray(src.data);
    if (!showOriginal && !previewPageSkippedByRange) {
      transformRgbaPixels(copy, mode, {
        backgroundHex: safeBg,
        foregroundHex: safeFg,
        preserveHue,
      });
    }
    ctx.putImageData(new ImageData(copy, src.width, src.height), 0, 0);
  }, [renderTick, showOriginal, previewPageSkippedByRange, mode, safeBg, safeFg, preserveHue]);

  const previewPageCount = previewItem?.pageCount ?? 0;
  const cssDisplayW = pageSize ? Math.min(stageWidth, Math.min(pageSize.width * 1.8, 680)) : undefined;
  const cssDisplayH = pageSize && cssDisplayW ? (cssDisplayW / Math.max(1, pageSize.width)) * pageSize.height : undefined;

  const activePreset = MODE_PRESETS.find((p) => p.id === mode) ?? MODE_PRESETS[0];
  const previewPaperBg = showOriginal || previewPageSkippedByRange
    ? '#ffffff'
    : mode === 'custom'
      ? safeBg
      : activePreset.bg;

  const canRun = ready.length > 0 && !rangeState.error;

  async function runTransform() {
    if (!canRun) return;
    setBusy(true);
    setResults({});
    const out: Record<string, ItemResult> = {};
    const parsedDpi = Number(dpi);

    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      setProgress({ fraction: i / ready.length, label: item.name });
      await nextFrame();
      try {
        const bytes = await rasterTransformPdf(
          item.bytes,
          {
            mode,
            dpi: parsedDpi,
            format,
            quality: jpegQuality,
            pageRange: items.length === 1 && pageRange.trim() ? pageRange.trim() : undefined,
            backgroundHex: mode === 'custom' ? safeBg : undefined,
            foregroundHex: mode === 'custom' ? safeFg : undefined,
            preserveHue: mode === 'custom' ? preserveHue : undefined,
          },
          item.password,
          (p) => {
            const fileFrac = p.total > 0 ? p.done / p.total : 0;
            setProgress({
              fraction: (i + fileFrac) / ready.length,
              label: `${item.name} — page ${p.done}/${p.total}`,
            });
          },
        );
        out[item.id] = { bytes };
      } catch (e) {
        out[item.id] = { error: errorMessage(e) };
      }
      setResults({ ...out });
    }
    setBusy(false);
  }

  const fileSuffix = mode === 'invert' ? 'inverted' : mode === 'custom' ? 'recolored' : 'dark';
  const succeeded = ready.filter((it) => results[it.id]?.bytes);
  const outputs: OutputFile[] = succeeded.map((it) => ({
    name: `${baseName(it.name)}-${fileSuffix}.pdf`,
    bytes: results[it.id].bytes!,
  }));
  const done = !busy && outputs.length > 0;

  return (
    <PdfPage
      title={INVERT.title}
      showHub
      lead="Convert bright PDFs into comfortable dark-mode documents with smart hue preservation, warm sepia, classic invert or custom colours."
    >
      <ToolWorkspace
        tool={INVERT}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop PDFs here"
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => {
              setItems([]);
              setPreviewItemId(null);
            }}
          >
            Remove all
          </button>
        }
        sidebar={
          <>
            <div className={qrStyles.field}>
              <span>Colour mode</span>
              <div className={styles.modeCardList} role="radiogroup" aria-label="Dark mode preset">
                {MODE_PRESETS.map((preset) => {
                  const selected = mode === preset.id;
                  const swatchBg = preset.id === 'custom' ? safeBg : preset.bg;
                  const swatchFg = preset.id === 'custom' ? safeFg : preset.fg;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={[styles.modeCard, selected ? styles.modeCardSelected : ''].join(' ')}
                      onClick={() => setMode(preset.id)}
                    >
                      <span
                        className={styles.modeSwatch}
                        style={{ backgroundColor: swatchBg, color: swatchFg }}
                        aria-hidden
                      >
                        Aa
                        {preset.accent && (
                          <span className={styles.modeSwatchDot} style={{ backgroundColor: preset.accent }} />
                        )}
                      </span>
                      <span className={styles.modeCardBody}>
                        <strong>{preset.title}</strong>
                        <small>{preset.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {mode === 'custom' && (
              <>
                <div className={styles.optionRow}>
                  <Field label="Background">
                    <div className={styles.colorRow}>
                      <input
                        type="color"
                        className={styles.colorSwatch}
                        aria-label="Custom background colour"
                        value={safeBg}
                        onChange={(e) => setBackgroundHex(e.target.value)}
                      />
                      <input
                        type="text"
                        className={qrStyles.input}
                        aria-label="Custom background hex"
                        value={backgroundHex}
                        onChange={(e) => setBackgroundHex(e.target.value)}
                      />
                    </div>
                  </Field>
                  <Field label="Ink / foreground">
                    <div className={styles.colorRow}>
                      <input
                        type="color"
                        className={styles.colorSwatch}
                        aria-label="Custom foreground colour"
                        value={safeFg}
                        onChange={(e) => setForegroundHex(e.target.value)}
                      />
                      <input
                        type="text"
                        className={qrStyles.input}
                        aria-label="Custom foreground hex"
                        value={foregroundHex}
                        onChange={(e) => setForegroundHex(e.target.value)}
                      />
                    </div>
                  </Field>
                </div>
                <Checkbox
                  label="Preserve saturated hues (links, charts, highlights)"
                  checked={preserveHue}
                  onChange={setPreserveHue}
                />
              </>
            )}

            <div className={styles.optionRow}>
              <Field label="Resolution (DPI)">
                <Select
                  value={dpi}
                  onChange={setDpi}
                  options={[
                    ['100', '100 DPI (small)'],
                    ['150', '150 DPI (balanced)'],
                    ['200', '200 DPI (crisp)'],
                    ['300', '300 DPI (print)'],
                  ]}
                />
              </Field>
              <Field label="Page image format">
                <Select
                  value={format}
                  onChange={setFormat}
                  options={[
                    ['jpeg', 'JPEG (smaller)'],
                    ['png', 'PNG (lossless)'],
                  ]}
                />
              </Field>
            </div>

            {format === 'jpeg' && (
              <label className={styles.sliderField}>
                <span className={styles.sliderHeader}>
                  <span>JPEG quality</span>
                  <strong>{jpegQuality}%</strong>
                </span>
                <input
                  type="range"
                  className={styles.rangeSlider}
                  min={50}
                  max={100}
                  step={2}
                  value={jpegQuality}
                  onChange={(e) => setJpegQuality(Number(e.target.value))}
                />
              </label>
            )}

            {items.length === 1 && (
              <Field label="Page range (optional)" help="e.g. 1-3, 5. Unselected pages stay unchanged.">
                <input
                  className={qrStyles.input}
                  value={pageRange}
                  placeholder="All pages"
                  onChange={(e) => setPageRange(e.target.value)}
                />
              </Field>
            )}

            <p className={styles.infoNote}>
              Each selected page is rendered at {dpi} DPI so text, graphics and images transform uniformly while
              preserving page dimensions.
            </p>

            {rangeState.error && <p className={qrStyles.warning}>{rangeState.error}</p>}
            {notice && <p className={qrStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !canRun}
              onClick={runTransform}
            >
              {busy
                ? 'Transforming…'
                : `Apply ${activePreset.title.toLowerCase()} to ${ready.length > 1 ? `${ready.length} PDFs` : 'PDF'}`}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {outputs.length === 1
                    ? 'Your transformed PDF is ready'
                    : `${outputs.length} transformed PDFs are ready`}
                </h3>
                <p>
                  {activePreset.title} · {dpi} DPI ({format.toUpperCase()}
                  {format === 'jpeg' ? `, ${jpegQuality}% quality` : ''}).
                </p>
                {outputs.length === 1 ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(outputs[0].bytes, outputs[0].name)}
                  >
                    Download {outputs[0].name}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(zipFiles(outputs), 'dark-mode-pdfs.zip', 'application/zip')}
                  >
                    Download all (ZIP)
                  </button>
                )}
                <ContinueWith currentToolId={INVERT.id} files={outputs} />
              </div>
            )}
          </>
        }
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

        {previewItem && (
          <div className={styles.compareCard}>
            <div className={styles.compareBar}>
              <div className={styles.compareTitleRow}>
                <h3>Live preview</h3>
                {ready.length > 1 ? (
                  <select
                    className={styles.canvasSourceSelect}
                    aria-label="Preview file"
                    value={previewItem.id}
                    onChange={(e) => setPreviewItemId(e.target.value)}
                  >
                    {ready.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={styles.fileBannerMeta}>{previewItem.name}</span>
                )}
                {previewPageSkippedByRange && (
                  <span className={[styles.previewBadge, styles.previewBadgeWarn].join(' ')}>
                    Page {pageIndex + 1} unchanged by range
                  </span>
                )}
              </div>

              <div className={styles.compareControls}>
                <div className={styles.canvasNav}>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    disabled={pageIndex <= 0}
                    onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                  >
                    &larr; Prev
                  </button>
                  <span className={styles.canvasPageInfo}>
                    {pageIndex + 1} / {Math.max(1, previewPageCount)}
                  </span>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    disabled={pageIndex >= previewPageCount - 1}
                    onClick={() => setPageIndex((i) => Math.min(previewPageCount - 1, i + 1))}
                  >
                    Next &rarr;
                  </button>
                </div>

                <div className={styles.compareToggle} role="group" aria-label="Compare result and original">
                  <button
                    type="button"
                    className={[styles.compareToggleBtn, !showOriginal ? styles.compareToggleBtnActive : ''].join(' ')}
                    aria-pressed={!showOriginal}
                    onClick={() => setShowOriginal(false)}
                  >
                    Result
                  </button>
                  <button
                    type="button"
                    className={[styles.compareToggleBtn, showOriginal ? styles.compareToggleBtnActive : ''].join(' ')}
                    aria-pressed={showOriginal}
                    onClick={() => setShowOriginal(true)}
                  >
                    Original
                  </button>
                </div>
              </div>
            </div>

            <div ref={stageRef} className={styles.previewStage}>
              <div
                className={styles.previewWrap}
                style={{
                  backgroundColor: previewPaperBg,
                  ...(cssDisplayW && cssDisplayH ? { width: `${cssDisplayW}px`, height: `${cssDisplayH}px` } : {}),
                }}
              >
                <canvas
                  ref={canvasRef}
                  className={styles.previewCanvas}
                  style={cssDisplayW && cssDisplayH ? { width: `${cssDisplayW}px`, height: `${cssDisplayH}px` } : undefined}
                />
                {rendering && <div className={styles.figureLoading}>Rendering page…</div>}
              </div>
            </div>
          </div>
        )}

        <FileGrid
          items={items}
          onChange={setItems}
          sortable={false}
          renderCard={(item, _index, controls) => {
            const r = results[item.id];
            const output = outputs[succeeded.indexOf(item)];
            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${
                  item.locked
                    ? 'Password protected'
                    : item.pageCount === null
                      ? '…'
                      : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`
                } · ${formatBytes(r?.bytes ? r.bytes.length : item.bytes.length)}`}
                error={item.error ?? r?.error}
                controls={controls}
                actions={
                  output && (
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => download(output.bytes, output.name)}
                    >
                      Download
                    </button>
                  )
                }
              >
                {r?.bytes && (
                  <div className={styles.fileMeta}>
                    <span className={styles.saved}>
                      {activePreset.title} ({dpi} DPI)
                    </span>
                  </div>
                )}
              </FileCard>
            );
          }}
        />
      </ToolWorkspace>
    </PdfPage>
  );
}
