import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, NumberInput, Select } from '../../components/UI/Fields';
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
import { PageNumberFont, PageNumberOptions, PageNumberPosition } from '../../lib/pdf/pageNumbers';
import { openPdf, renderPage } from '../../lib/pdf/pdfjs';
import { PAGE_NUMBERS } from '../../lib/pdf/tools';
import { runAddPageNumbers } from '../../lib/pdf/workerClient';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  password?: string;
}

interface LockedFile {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

const POSITIONS_TOP: Array<{ value: PageNumberPosition; label: string }> = [
  { value: 'top-left', label: 'TL' },
  { value: 'top-center', label: 'TC' },
  { value: 'top-right', label: 'TR' },
];

const POSITIONS_BOTTOM: Array<{ value: PageNumberPosition; label: string }> = [
  { value: 'bottom-left', label: 'BL' },
  { value: 'bottom-center', label: 'BC' },
  { value: 'bottom-right', label: 'BR' },
];

const FORMAT_PRESETS: Array<{ label: string; value: string }> = [
  { label: '1', value: '{n}' },
  { label: '1 / 12', value: '{n} / {total}' },
  { label: 'Page 1 of 12', value: 'Page {n} of {total}' },
  { label: '- 1 -', value: '- {n} -' },
];

function cssFontFor(font: PageNumberFont): { fontFamily: string; fontWeight: number } {
  switch (font) {
    case 'helvetica-bold':
      return { fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 700 };
    case 'times':
      return { fontFamily: '"Times New Roman", Times, serif', fontWeight: 400 };
    case 'times-bold':
      return { fontFamily: '"Times New Roman", Times, serif', fontWeight: 700 };
    case 'courier':
      return { fontFamily: '"Courier New", Courier, monospace', fontWeight: 400 };
    case 'courier-bold':
      return { fontFamily: '"Courier New", Courier, monospace', fontWeight: 700 };
    default:
      return { fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 400 };
  }
}

function mirrorPos(pos: PageNumberPosition): PageNumberPosition {
  if (pos === 'top-left') return 'top-right';
  if (pos === 'top-right') return 'top-left';
  if (pos === 'bottom-left') return 'bottom-right';
  if (pos === 'bottom-right') return 'bottom-left';
  return pos;
}

function normalizeHex(raw: string): string {
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return '#222222';
}

export default function PageNumbersPage() {
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [pdfProxy, setPdfProxy] = React.useState<PDFDocumentProxy | null>(null);
  const closeProxyRef = React.useRef<(() => Promise<void>) | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [stageWidth, setStageWidth] = React.useState(620);
  const [renderWidth, setRenderWidth] = React.useState(620);
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = React.useState(false);

  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageJump, setPageJump] = React.useState('1');

  const [position, setPosition] = React.useState<PageNumberPosition>('bottom-center');
  const [format, setFormat] = React.useState('{n}');
  const [font, setFont] = React.useState<PageNumberFont>('helvetica');
  const [fontSize, setFontSize] = React.useState(11);
  const [color, setColor] = React.useState('#222222');
  const [opacity, setOpacity] = React.useState(1);
  const [marginX, setMarginX] = React.useState(36);
  const [marginY, setMarginY] = React.useState(28);
  const [startNumber, setStartNumber] = React.useState(1);
  const [pageRange, setPageRange] = React.useState('');
  const [skipFirstPage, setSkipFirstPage] = React.useState(false);
  const [mirrorEvenPages, setMirrorEvenPages] = React.useState(false);
  const [fileName, setFileName] = React.useState('');

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Uint8Array | null>(null);

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
  }, [
    doc,
    position,
    format,
    font,
    fontSize,
    color,
    opacity,
    marginX,
    marginY,
    startNumber,
    pageRange,
    skipFirstPage,
    mirrorEvenPages,
  ]);

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
  }, [doc]);

  React.useEffect(() => {
    const t = setTimeout(() => setRenderWidth(stageWidth), 120);
    return () => clearTimeout(t);
  }, [stageWidth]);

  React.useEffect(() => {
    let cancelled = false;
    if (!pdfProxy) {
      setPageSize(null);
      setRendering(false);
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

        const maxCssW = Math.min(renderWidth, 780);
        const displayScale = Math.min(maxCssW / Math.max(1, baseVp.width), 2);
        const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.5);
        offscreen = await renderPage(page, Math.max(0.25, displayScale * dpr));
        if (cancelled) return;

        const target = canvasRef.current;
        if (target) {
          target.width = offscreen.width;
          target.height = offscreen.height;
          const ctx = target.getContext('2d');
          if (ctx) ctx.drawImage(offscreen, 0, 0);
        }
      } catch {
        // Ignore transient render errors when switching documents.
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

  async function openBytes(name: string, bytes: Uint8Array, password?: string) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const handle = await openPdf(bytes, password);
      closeCurrentProxy();
      closeProxyRef.current = handle.close;
      setPdfProxy(handle.doc);
      setLocked(null);
      setDoc({ name, bytes, pageCount: handle.doc.numPages, password });
      setPageIndex(0);
      setFileName(`${baseName(name)}-numbered`);
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
    setNotice(files.length > 1 ? 'Only the first PDF was opened. Add page numbers works on one file at a time.' : null);
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

  const pageCount = doc?.pageCount ?? 0;

  const targetState = React.useMemo<{ indices: number[]; error: string | null }>(() => {
    if (!doc) return { indices: [], error: null };
    try {
      let indices: number[];
      if (pageRange.trim()) {
        const seen = new Set<number>();
        indices = [];
        for (const idx of parsePageRanges(pageRange, pageCount)) {
          if (!seen.has(idx)) {
            seen.add(idx);
            indices.push(idx);
          }
        }
      } else {
        indices = Array.from({ length: pageCount }, (_, i) => i);
      }
      if (skipFirstPage) {
        indices = indices.filter((idx) => idx !== 0);
      }
      return { indices, error: null };
    } catch (e) {
      return { indices: [], error: errorMessage(e) };
    }
  }, [doc, pageRange, pageCount, skipFirstPage]);

  const seqOnCurrentPage = targetState.indices.indexOf(pageIndex);
  const physicalPage = pageIndex + 1;
  const effectivePosition = mirrorEvenPages && physicalPage % 2 === 0 ? mirrorPos(position) : position;
  const template = format.length ? format : '{n}';
  const previewLabel =
    seqOnCurrentPage >= 0
      ? template
          .replace(/\{n\}/g, String(Math.trunc(startNumber) + seqOnCurrentPage))
          .replace(/\{total\}/g, String(targetState.indices.length))
          .replace(/\{page\}/g, String(physicalPage))
          .replace(/\{pages\}/g, String(pageCount))
      : null;

  const cssDisplayW = pageSize ? Math.min(stageWidth, Math.min(pageSize.width * 2, 780)) : undefined;
  const cssDisplayH = pageSize && cssDisplayW ? (cssDisplayW / Math.max(1, pageSize.width)) * pageSize.height : undefined;
  const cssScale = pageSize && cssDisplayW ? cssDisplayW / Math.max(1, pageSize.width) : 1;

  const fontStyle = cssFontFor(font);
  const safeColor = normalizeHex(color);

  const outputName = `${safeFileName(fileName, 'numbered').replace(/\.pdf$/i, '')}.pdf`;

  async function applyPageNumbers() {
    if (!doc || targetState.error) return;
    setBusy(true);
    setError(null);
    try {
      const opts: PageNumberOptions = {
        position,
        format: template,
        font,
        fontSize,
        color: safeColor,
        opacity,
        marginX,
        marginY,
        startNumber,
        pageRange: pageRange.trim() || undefined,
        skipFirstPage,
        mirrorEvenPages,
      };
      const bytes = await runAddPageNumbers(doc.bytes, opts, doc.password);
      setResult(bytes);
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

  const overlayPosStyle: React.CSSProperties = React.useMemo(() => {
    const isTop = effectivePosition.startsWith('top-');
    const isLeft = effectivePosition.endsWith('-left');
    const isRight = effectivePosition.endsWith('-right');
    const style: React.CSSProperties = {
      position: 'absolute',
      color: safeColor,
      opacity,
      fontFamily: fontStyle.fontFamily,
      fontWeight: fontStyle.fontWeight,
      fontSize: `${Math.max(4, fontSize * cssScale)}px`,
      lineHeight: 1,
      whiteSpace: 'pre',
      pointerEvents: 'none',
    };
    if (isTop) {
      style.top = `${marginY * cssScale}px`;
    } else {
      style.bottom = `${marginY * cssScale}px`;
    }
    if (isLeft) {
      style.left = `${marginX * cssScale}px`;
    } else if (isRight) {
      style.right = `${marginX * cssScale}px`;
    } else {
      style.left = '50%';
      style.transform = 'translateX(-50%)';
    }
    return style;
  }, [effectivePosition, safeColor, opacity, fontStyle, fontSize, cssScale, marginX, marginY]);

  return (
    <PdfPage
      title={PAGE_NUMBERS.title}
      showHub
      lead="Stamp crisp vector page numbers onto PDF pages with live positioning, custom templates, cover skipping and duplex mirroring."
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
      {loading && !doc && !locked && <Progress fraction={0.45} label="Loading PDF…" />}

      <ToolWorkspace
        tool={PAGE_NUMBERS}
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
                aria-label="Preview page number"
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
            <Field label="Position on page">
              <div className={styles.posPageFrame}>
                <div className={styles.posGrid6} role="radiogroup" aria-label="Page number position">
                  {POSITIONS_TOP.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={position === p.value}
                      aria-label={p.value.replace('-', ' ')}
                      className={[styles.posCell, position === p.value ? styles.posCellActive : ''].join(' ')}
                      onClick={() => setPosition(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                  <div className={styles.posGridDivider}>Page content</div>
                  {POSITIONS_BOTTOM.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={position === p.value}
                      aria-label={p.value.replace('-', ' ')}
                      className={[styles.posCell, position === p.value ? styles.posCellActive : ''].join(' ')}
                      onClick={() => setPosition(p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </Field>

            <Field label="Format template" help="Placeholders: {n} sequence, {total} numbered, {page} physical, {pages} total.">
              <div className={styles.presetRow} style={{ marginBottom: '0.35rem' }}>
                {FORMAT_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={[styles.presetBtn, format === p.value ? styles.presetBtnActive : ''].join(' ')}
                    onClick={() => setFormat(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                className={fieldStyles.input}
                value={format}
                placeholder="{n}"
                onChange={(e) => setFormat(e.target.value)}
              />
            </Field>

            <Field label="Font">
              <Select
                value={font}
                onChange={setFont}
                options={[
                  ['helvetica', 'Helvetica'],
                  ['helvetica-bold', 'Helvetica Bold'],
                  ['times', 'Times Roman'],
                  ['times-bold', 'Times Bold'],
                  ['courier', 'Courier'],
                  ['courier-bold', 'Courier Bold'],
                ]}
              />
            </Field>

            <div className={styles.optionRow}>
              <Field label="Font size (pt)">
                <NumberInput value={fontSize} min={6} max={72} step={1} onChange={setFontSize} />
              </Field>
              <Field label="Color">
                <div className={styles.colorRow}>
                  <input
                    type="color"
                    className={styles.colorSwatch}
                    aria-label="Page number color"
                    value={safeColor}
                    onChange={(e) => setColor(e.target.value)}
                  />
                  <input
                    type="text"
                    className={fieldStyles.input}
                    aria-label="Page number hex color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </div>
              </Field>
            </div>

            <label className={styles.sliderField}>
              <span className={styles.sliderHeader}>
                <span>Opacity</span>
                <strong>{Math.round(opacity * 100)}%</strong>
              </span>
              <input
                type="range"
                className={styles.rangeSlider}
                min={0.1}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
            </label>

            <div className={styles.optionRow}>
              <Field label="X margin (pt)">
                <NumberInput value={marginX} min={0} max={240} step={2} onChange={setMarginX} />
              </Field>
              <Field label="Y margin (pt)">
                <NumberInput value={marginY} min={0} max={240} step={2} onChange={setMarginY} />
              </Field>
            </div>

            <div className={styles.optionRow}>
              <Field label="Start number">
                <NumberInput value={startNumber} min={-999} max={99999} step={1} onChange={setStartNumber} />
              </Field>
              <Field label="Page range" help="Optional, e.g. 2-10">
                <input
                  className={fieldStyles.input}
                  value={pageRange}
                  placeholder="All pages"
                  onChange={(e) => setPageRange(e.target.value)}
                />
              </Field>
            </div>

            <Checkbox label="Skip first page (cover)" checked={skipFirstPage} onChange={setSkipFirstPage} />
            <Checkbox
              label="Mirror left/right on even pages (duplex)"
              checked={mirrorEvenPages}
              onChange={setMirrorEvenPages}
            />

            {targetState.error && <p className={fieldStyles.warning}>{targetState.error}</p>}

            <Field label="File name">
              <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>

            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            {error && <div className={styles.error}>{error}</div>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !doc || !!targetState.error || targetState.indices.length === 0}
              onClick={applyPageNumbers}
            >
              {busy
                ? 'Stamping…'
                : `Add numbers to ${targetState.indices.length} page${targetState.indices.length === 1 ? '' : 's'}`}
            </button>

            {result && (
              <div className={styles.result}>
                <h3>Page numbers added</h3>
                <p>
                  Stamped {targetState.indices.length} of {pageCount} page{pageCount === 1 ? '' : 's'} ·{' '}
                  {formatBytes(result.length)}.
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => download(result, outputName)}
                >
                  Download {outputName}
                </button>
                <ContinueWith currentToolId={PAGE_NUMBERS.id} files={[{ name: outputName, bytes: result }]} />
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
              {previewLabel === null ? (
                <span className={[styles.previewBadge, styles.previewBadgeWarn].join(' ')}>
                  Page {physicalPage} skipped
                </span>
              ) : (
                <span className={[styles.previewBadge, styles.previewBadgeInfo].join(' ')}>
                  Label: “{previewLabel}”
                  {mirrorEvenPages && physicalPage % 2 === 0 && effectivePosition !== position ? ' (mirrored)' : ''}
                </span>
              )}
            </div>

            <div ref={stageRef} className={styles.previewStage}>
              <div
                className={styles.previewWrap}
                style={cssDisplayW && cssDisplayH ? { width: `${cssDisplayW}px`, height: `${cssDisplayH}px` } : undefined}
              >
                <canvas
                  ref={canvasRef}
                  className={styles.previewCanvas}
                  style={cssDisplayW && cssDisplayH ? { width: `${cssDisplayW}px`, height: `${cssDisplayH}px` } : undefined}
                />
                {pageSize && previewLabel !== null && (
                  <div className={styles.previewOverlay} aria-hidden>
                    <span style={overlayPosStyle}>{previewLabel}</span>
                  </div>
                )}
                {rendering && <div className={styles.figureLoading}>Rendering page…</div>}
              </div>
            </div>
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
