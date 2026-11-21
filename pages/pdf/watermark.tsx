import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { FilePickerButton, PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, NumberInput, Select } from '../../components/UI/Fields';
import {
  baseName,
  canvasToBytes,
  download,
  errorMessage,
  formatBytes,
  isImage,
  isPasswordError,
  isPdf,
  readBytes,
  safeFileName,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { parsePageRanges } from '../../lib/pdf/merge';
import { openPdf, renderPage } from '../../lib/pdf/pdfjs';
import { WATERMARK } from '../../lib/pdf/tools';
import {
  WatermarkFont,
  WatermarkLayer,
  WatermarkLayout,
  WatermarkOptions,
  WatermarkPosition,
} from '../../lib/pdf/watermark';
import { runAddWatermark } from '../../lib/pdf/workerClient';
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

interface UploadedWatermarkImage {
  name: string;
  bytes: Uint8Array;
  imageType: 'png' | 'jpeg';
  width: number;
  height: number;
  previewUrl: string;
}

const POSITIONS_9: Array<{ value: WatermarkPosition; label: string }> = [
  { value: 'top-left', label: 'TL' },
  { value: 'top-center', label: 'TC' },
  { value: 'top-right', label: 'TR' },
  { value: 'middle-left', label: 'ML' },
  { value: 'center', label: 'C' },
  { value: 'middle-right', label: 'MR' },
  { value: 'bottom-left', label: 'BL' },
  { value: 'bottom-center', label: 'BC' },
  { value: 'bottom-right', label: 'BR' },
];

function cssFontFor(font: WatermarkFont): { fontFamily: string; fontWeight: number } {
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

function normalizeHex(raw: string): string {
  const s = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return '#888888';
}

function computePreviewCenters(
  layout: WatermarkLayout,
  position: WatermarkPosition,
  visW: number,
  visH: number,
  stampW: number,
  stampH: number,
  rotDeg: number,
  margin: number,
  tileGapX: number,
  tileGapY: number,
): Array<[number, number]> {
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const rotBoundW = stampW * c + stampH * s;
  const rotBoundH = stampW * s + stampH * c;

  if (layout === 'single') {
    let cx = visW / 2;
    if (position.endsWith('-left')) cx = margin + rotBoundW / 2;
    else if (position.endsWith('-right')) cx = visW - margin - rotBoundW / 2;

    let cy = visH / 2;
    if (position.startsWith('top-')) cy = visH - margin - rotBoundH / 2;
    else if (position.startsWith('bottom-')) cy = margin + rotBoundH / 2;
    return [[cx, cy]];
  }

  const stepX = Math.max(24, rotBoundW + Math.max(0, tileGapX));
  const stepY = Math.max(24, rotBoundH + Math.max(0, tileGapY));
  const centers: Array<[number, number]> = [];
  const startX = (visW % stepX) / 2;
  const startY = (visH % stepY) / 2;

  for (let row = -1; startY + row * stepY <= visH + stepY; row++) {
    const cy = startY + row * stepY;
    const stagger = Math.abs(row) % 2 === 1 ? stepX / 2 : 0;
    for (let col = -1; startX + col * stepX - stagger <= visW + stepX; col++) {
      const cx = startX + col * stepX + stagger;
      if (cx + rotBoundW / 2 < 0 || cx - rotBoundW / 2 > visW) continue;
      if (cy + rotBoundH / 2 < 0 || cy - rotBoundH / 2 > visH) continue;
      centers.push([cx, cy]);
    }
  }
  return centers.length ? centers : [[visW / 2, visH / 2]];
}

async function decodeImageFile(file: File): Promise<UploadedWatermarkImage> {
  const previewUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode this image file.'));
      el.src = previewUrl;
    });
    const width = Math.max(1, img.naturalWidth || img.width);
    const height = Math.max(1, img.naturalHeight || img.height);

    const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
    const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name);

    if (isPng || isJpeg) {
      const bytes = await readBytes(file);
      return {
        name: file.name,
        bytes,
        imageType: isPng ? 'png' : 'jpeg',
        width,
        height,
        previewUrl,
      };
    }

    // Convert WebP / GIF / BMP / SVG etc. to PNG via offscreen canvas.
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is unavailable.');
    ctx.drawImage(img, 0, 0, width, height);
    const bytes = await canvasToBytes(canvas, 'image/png');
    canvas.width = 0;
    canvas.height = 0;
    return {
      name: file.name,
      bytes,
      imageType: 'png',
      width,
      height,
      previewUrl,
    };
  } catch (e) {
    URL.revokeObjectURL(previewUrl);
    throw e;
  }
}

export default function WatermarkPdfPage() {
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

  const [kind, setKind] = React.useState<'text' | 'image'>('text');
  const [text, setText] = React.useState('CONFIDENTIAL');
  const [font, setFont] = React.useState<WatermarkFont>('helvetica-bold');
  const [fontSize, setFontSize] = React.useState(48);
  const [color, setColor] = React.useState('#888888');

  const [wmImage, setWmImage] = React.useState<UploadedWatermarkImage | null>(null);
  const [imageScale, setImageScale] = React.useState(0.4);
  const [imageError, setImageError] = React.useState<string | null>(null);

  const [layout, setLayout] = React.useState<WatermarkLayout>('single');
  const [position, setPosition] = React.useState<WatermarkPosition>('center');
  const [tileGapX, setTileGapX] = React.useState(120);
  const [tileGapY, setTileGapY] = React.useState(120);
  const [rotation, setRotation] = React.useState(-45);
  const [opacity, setOpacity] = React.useState(0.25);
  const [layer, setLayer] = React.useState<WatermarkLayer>('over');
  const [margin, setMargin] = React.useState(36);
  const [pageRange, setPageRange] = React.useState('');
  const [fileName, setFileName] = React.useState('');

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Uint8Array | null>(null);

  const wmImageUrlRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const prev = wmImageUrlRef.current;
    wmImageUrlRef.current = wmImage?.previewUrl ?? null;
    if (prev && prev !== wmImage?.previewUrl) URL.revokeObjectURL(prev);
  }, [wmImage]);
  React.useEffect(() => () => {
    if (wmImageUrlRef.current) URL.revokeObjectURL(wmImageUrlRef.current);
  }, []);

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
    kind,
    text,
    font,
    fontSize,
    color,
    wmImage,
    imageScale,
    layout,
    position,
    tileGapX,
    tileGapY,
    rotation,
    opacity,
    layer,
    margin,
    pageRange,
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
        // Ignore transient render errors when switching files.
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
      setFileName(`${baseName(name)}-watermarked`);
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
    setNotice(files.length > 1 ? 'Only the first PDF was opened. Add watermark works on one file at a time.' : null);
    setLocked(null);
    try {
      const bytes = await readBytes(pdf);
      await openBytes(pdf.name, bytes);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleWatermarkImageFiles(files: File[]) {
    const imgFile = files.find(isImage);
    if (!imgFile) {
      setImageError('Please choose an image file (PNG, JPG, WebP, etc.).');
      return;
    }
    setImageError(null);
    try {
      const decoded = await decodeImageFile(imgFile);
      setWmImage(decoded);
    } catch (e) {
      setImageError(errorMessage(e));
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

  const targetState = React.useMemo<{ set: Set<number>; error: string | null }>(() => {
    if (!doc) return { set: new Set(), error: null };
    if (!pageRange.trim()) {
      return { set: new Set(Array.from({ length: pageCount }, (_, i) => i)), error: null };
    }
    try {
      return { set: new Set(parsePageRanges(pageRange, pageCount)), error: null };
    } catch (e) {
      return { set: new Set(), error: errorMessage(e) };
    }
  }, [doc, pageRange, pageCount]);

  const isCurrentPageTargeted = targetState.set.has(pageIndex);
  const visW = pageSize?.width ?? 595.28;
  const visH = pageSize?.height ?? 841.89;
  const safeColor = normalizeHex(color);
  const fontStyle = cssFontFor(font);

  const lines = React.useMemo(() => text.split(/\r?\n/), [text]);
  const lineHeight = fontSize * 1.25;
  const capHeight = fontSize * 0.72;

  const stampDimensions = React.useMemo(() => {
    if (kind === 'text') {
      const longest = Math.max(1, ...lines.map((l) => l.length));
      const estW = Math.max(12, longest * fontSize * 0.6);
      const estH = lines.length === 1 ? capHeight : (lines.length - 1) * lineHeight + capHeight;
      return { w: estW, h: estH };
    }
    if (!wmImage) return { w: 100, h: 100 };
    const aspect = wmImage.width > 0 ? wmImage.height / wmImage.width : 1;
    const w = Math.max(4, visW * imageScale);
    const h = Math.max(4, w * aspect);
    return { w, h };
  }, [kind, lines, fontSize, capHeight, lineHeight, wmImage, visW, imageScale]);

  const centers = React.useMemo(() => {
    if (!pageSize || !isCurrentPageTargeted) return [];
    if (kind === 'text' && !text.trim()) return [];
    if (kind === 'image' && !wmImage) return [];
    return computePreviewCenters(
      layout,
      position,
      visW,
      visH,
      stampDimensions.w,
      stampDimensions.h,
      rotation,
      margin,
      tileGapX,
      tileGapY,
    );
  }, [
    pageSize,
    isCurrentPageTargeted,
    kind,
    text,
    wmImage,
    layout,
    position,
    visW,
    visH,
    stampDimensions,
    rotation,
    margin,
    tileGapX,
    tileGapY,
  ]);

  const cssDisplayW = pageSize ? Math.min(stageWidth, Math.min(pageSize.width * 2, 780)) : undefined;
  const cssDisplayH = pageSize && cssDisplayW ? (cssDisplayW / Math.max(1, pageSize.width)) * pageSize.height : undefined;

  const canApply =
    !!doc &&
    !targetState.error &&
    targetState.set.size > 0 &&
    (kind === 'text' ? text.trim().length > 0 : wmImage !== null);

  const outputName = `${safeFileName(fileName, 'watermarked').replace(/\.pdf$/i, '')}.pdf`;

  async function applyWatermark() {
    if (!doc || !canApply) return;
    setBusy(true);
    setError(null);
    try {
      const base = {
        layout,
        position,
        tileGapX,
        tileGapY,
        margin,
        rotation,
        opacity,
        layer,
        pageRange: pageRange.trim() || undefined,
      };
      const opts: WatermarkOptions =
        kind === 'text'
          ? {
              ...base,
              kind: 'text',
              text,
              font,
              fontSize,
              color: safeColor,
            }
          : {
              ...base,
              kind: 'image',
              imageBytes: wmImage!.bytes,
              imageType: wmImage!.imageType,
              imageScale,
            };
      const bytes = await runAddWatermark(doc.bytes, opts, doc.password);
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

  return (
    <PdfPage
      title={WATERMARK.title}
      showHub
      lead="Place single or tiled text and image watermarks over or under PDF content with instant visual preview."
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
        tool={WATERMARK}
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
            <div className={styles.tabBar} style={{ marginBottom: '0.2rem', paddingBottom: '0.5rem' }}>
              <button
                type="button"
                className={[styles.tab, kind === 'text' ? styles.tabActive : ''].join(' ')}
                onClick={() => setKind('text')}
              >
                Text
              </button>
              <button
                type="button"
                className={[styles.tab, kind === 'image' ? styles.tabActive : ''].join(' ')}
                onClick={() => setKind('image')}
              >
                Image
              </button>
            </div>

            {kind === 'text' ? (
              <>
                <Field label="Watermark text">
                  <textarea
                    className={fieldStyles.input}
                    rows={2}
                    value={text}
                    placeholder="CONFIDENTIAL"
                    onChange={(e) => setText(e.target.value)}
                    style={{ resize: 'vertical' }}
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
                    <NumberInput value={fontSize} min={6} max={240} step={2} onChange={setFontSize} />
                  </Field>
                  <Field label="Color">
                    <div className={styles.colorRow}>
                      <input
                        type="color"
                        className={styles.colorSwatch}
                        aria-label="Watermark color"
                        value={safeColor}
                        onChange={(e) => setColor(e.target.value)}
                      />
                      <input
                        type="text"
                        className={fieldStyles.input}
                        aria-label="Watermark hex color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                      />
                    </div>
                  </Field>
                </div>
              </>
            ) : (
              <>
                <Field label="Watermark image" help="PNG, JPG, WebP, GIF or SVG (non-PNG/JPG auto-converted to PNG).">
                  <div className={styles.imageUploadRow}>
                    <FilePickerButton
                      accept="image/png,image/jpeg,image/webp,image/*"
                      multiple={false}
                      onFiles={handleWatermarkImageFiles}
                      className={styles.buttonSmall}
                    >
                      {wmImage ? 'Change image' : 'Choose image'}
                    </FilePickerButton>
                    {wmImage && (
                      <>
                        <img
                          src={wmImage.previewUrl}
                          alt="Watermark preview"
                          className={[styles.imageUploadThumb, styles.thumbCheckered].join(' ')}
                        />
                        <span className={styles.fileBannerMeta}>
                          {wmImage.width}×{wmImage.height} ({wmImage.imageType.toUpperCase()})
                        </span>
                      </>
                    )}
                  </div>
                </Field>
                {imageError && <p className={fieldStyles.warning}>{imageError}</p>}
                <label className={styles.sliderField}>
                  <span className={styles.sliderHeader}>
                    <span>Width scale (% of page width)</span>
                    <strong>{Math.round(imageScale * 100)}%</strong>
                  </span>
                  <input
                    type="range"
                    className={styles.rangeSlider}
                    min={0.05}
                    max={1.5}
                    step={0.05}
                    value={imageScale}
                    onChange={(e) => setImageScale(Number(e.target.value))}
                  />
                </label>
              </>
            )}

            <div className={styles.optionRow}>
              <Field label="Placement">
                <Select
                  value={layout}
                  onChange={setLayout}
                  options={[
                    ['single', 'Single anchor'],
                    ['tiled', 'Tiled across page'],
                  ]}
                />
              </Field>
              <Field label="Layer">
                <Select
                  value={layer}
                  onChange={setLayer}
                  options={[
                    ['over', 'Over content'],
                    ['under', 'Under content'],
                  ]}
                />
              </Field>
            </div>

            {layout === 'single' ? (
              <>
                <Field label="Anchor position">
                  <div className={styles.posPageFrame}>
                    <div className={styles.posGrid9} role="radiogroup" aria-label="Watermark anchor position">
                      {POSITIONS_9.map((p) => (
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
                <Field label="Edge margin (pt)">
                  <NumberInput value={margin} min={0} max={240} step={4} onChange={setMargin} />
                </Field>
              </>
            ) : (
              <>
                <label className={styles.sliderField}>
                  <span className={styles.sliderHeader}>
                    <span>Horizontal tile gap</span>
                    <strong>{tileGapX} pt</strong>
                  </span>
                  <input
                    type="range"
                    className={styles.rangeSlider}
                    min={0}
                    max={360}
                    step={10}
                    value={tileGapX}
                    onChange={(e) => setTileGapX(Number(e.target.value))}
                  />
                </label>
                <label className={styles.sliderField}>
                  <span className={styles.sliderHeader}>
                    <span>Vertical tile gap</span>
                    <strong>{tileGapY} pt</strong>
                  </span>
                  <input
                    type="range"
                    className={styles.rangeSlider}
                    min={0}
                    max={360}
                    step={10}
                    value={tileGapY}
                    onChange={(e) => setTileGapY(Number(e.target.value))}
                  />
                </label>
              </>
            )}

            <label className={styles.sliderField}>
              <span className={styles.sliderHeader}>
                <span>Rotation</span>
                <strong>{rotation}°</strong>
              </span>
              <input
                type="range"
                className={styles.rangeSlider}
                min={-180}
                max={180}
                step={5}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
              />
            </label>
            <div className={styles.presetRow}>
              {[-45, 0, 45].map((deg) => (
                <button
                  key={deg}
                  type="button"
                  className={[styles.presetBtn, rotation === deg ? styles.presetBtnActive : ''].join(' ')}
                  onClick={() => setRotation(deg)}
                >
                  {deg > 0 ? `+${deg}°` : `${deg}°`}
                </button>
              ))}
            </div>

            <label className={styles.sliderField}>
              <span className={styles.sliderHeader}>
                <span>Opacity</span>
                <strong>{Math.round(opacity * 100)}%</strong>
              </span>
              <input
                type="range"
                className={styles.rangeSlider}
                min={0.05}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
              />
            </label>

            <Field label="Page range" help="Optional 1-based range (e.g. 1-3, 5). Blank = all pages.">
              <input
                className={fieldStyles.input}
                value={pageRange}
                placeholder="All pages"
                onChange={(e) => setPageRange(e.target.value)}
              />
            </Field>
            {targetState.error && <p className={fieldStyles.warning}>{targetState.error}</p>}

            <Field label="File name">
              <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>

            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            {error && <div className={styles.error}>{error}</div>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !canApply}
              onClick={applyWatermark}
            >
              {busy
                ? 'Applying watermark…'
                : `Watermark ${targetState.set.size} page${targetState.set.size === 1 ? '' : 's'}`}
            </button>

            {result && (
              <div className={styles.result}>
                <h3>Watermark added</h3>
                <p>
                  Applied to {targetState.set.size} of {pageCount} page{pageCount === 1 ? '' : 's'} ({layer} content) ·{' '}
                  {formatBytes(result.length)}.
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => download(result, outputName)}
                >
                  Download {outputName}
                </button>
                <ContinueWith currentToolId={WATERMARK.id} files={[{ name: outputName, bytes: result }]} />
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
              {!isCurrentPageTargeted ? (
                <span className={[styles.previewBadge, styles.previewBadgeWarn].join(' ')}>
                  Page {pageIndex + 1} outside range
                </span>
              ) : (
                <span
                  className={[
                    styles.previewBadge,
                    layer === 'under' ? styles.previewBadgeWarn : styles.previewBadgeInfo,
                  ].join(' ')}
                >
                  {layer === 'under' ? 'Under page content' : 'Over page content'} ·{' '}
                  {layout === 'tiled' ? `Tiled (${centers.length})` : 'Single'}
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
                {pageSize && centers.length > 0 && (
                  <svg
                    viewBox={`0 0 ${visW} ${visH}`}
                    className={[styles.previewOverlaySvg, layer === 'under' ? styles.previewOverlayUnder : ''].join(' ')}
                    aria-hidden
                  >
                    {centers.map(([cx, cy], idx) => {
                      const svgX = cx;
                      const svgY = visH - cy;
                      return (
                        <g
                          key={idx}
                          transform={`translate(${svgX}, ${svgY}) rotate(${-rotation})`}
                          opacity={opacity}
                        >
                          {kind === 'text' ? (
                            lines.map((line, lineIdx) => {
                              const ly = -stampDimensions.h / 2 + capHeight + lineIdx * lineHeight;
                              return (
                                <text
                                  key={lineIdx}
                                  x={0}
                                  y={ly}
                                  textAnchor="middle"
                                  fill={safeColor}
                                  fontFamily={fontStyle.fontFamily}
                                  fontWeight={fontStyle.fontWeight}
                                  fontSize={fontSize}
                                >
                                  {line}
                                </text>
                              );
                            })
                          ) : wmImage ? (
                            <image
                              href={wmImage.previewUrl}
                              x={-stampDimensions.w / 2}
                              y={-stampDimensions.h / 2}
                              width={stampDimensions.w}
                              height={stampDimensions.h}
                              preserveAspectRatio="none"
                            />
                          ) : null}
                        </g>
                      );
                    })}
                  </svg>
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
