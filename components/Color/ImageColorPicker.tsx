import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { pickReadableInk } from '../../lib/color/accessibility';
import { clamp } from '../../lib/color/convert';
import { formatHex, formatRgb } from '../../lib/color/parse';
import { extractDominantColors, sampleRegionRgba } from '../../lib/color/quantize';
import type { DominantColor, ImagePin, RGBA } from '../../lib/color/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Color.module.css';

export interface ImageColorPickerProps {
  uppercaseHex: boolean;
  onPickColor: (color: RGBA) => void;
  onSaveColors: (colors: readonly RGBA[]) => void;
  onUseInConverter: (color: RGBA) => void;
}

interface LoadedImageState {
  name: string;
  width: number;
  height: number;
  sourceCanvas: HTMLCanvasElement;
  imageData: ImageData;
}

const SAMPLE_SIZES: readonly (1 | 3 | 5 | 9)[] = [1, 3, 5, 9];

/**
 * Generates a vibrant, deterministic studio-style geometric & botanical still-life
 * entirely on an offscreen Canvas so users can test the image picker in 1 click offline.
 */
function buildStudioSampleCanvas(): HTMLCanvasElement {
  const w = 960;
  const h = 600;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Warm sunset sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
  sky.addColorStop(0, '#1e3a5f');
  sky.addColorStop(0.45, '#3b6ea5');
  sky.addColorStop(0.82, '#e07a5f');
  sky.addColorStop(1, '#f4c06f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Glowing sun disc
  ctx.beginPath();
  ctx.arc(690, 170, 74, 0, Math.PI * 2);
  ctx.fillStyle = '#fde68a';
  ctx.fill();

  // Distant mountain range (indigo / plum)
  ctx.beginPath();
  ctx.moveTo(0, 390);
  ctx.lineTo(180, 240);
  ctx.lineTo(350, 340);
  ctx.lineTo(540, 210);
  ctx.lineTo(750, 325);
  ctx.lineTo(960, 235);
  ctx.lineTo(960, 600);
  ctx.lineTo(0, 600);
  ctx.closePath();
  ctx.fillStyle = '#312e59';
  ctx.fill();

  // Midground hills (emerald / forest teal)
  ctx.beginPath();
  ctx.moveTo(0, 420);
  ctx.quadraticCurveTo(220, 310, 460, 405);
  ctx.quadraticCurveTo(710, 495, 960, 360);
  ctx.lineTo(960, 600);
  ctx.lineTo(0, 600);
  ctx.closePath();
  ctx.fillStyle = '#0f766e';
  ctx.fill();

  // Foreground lake reflection
  const lake = ctx.createLinearGradient(0, 430, 0, 600);
  lake.addColorStop(0, '#0c4a6e');
  lake.addColorStop(0.55, '#0284c7');
  lake.addColorStop(1, '#082f49');
  ctx.fillStyle = lake;
  ctx.fillRect(0, 435, w, 165);

  // Color-calibration studio cards on bottom-left dock (crisp flat swatches)
  const dockColors = ['#e11d48', '#f59e0b', '#10b981', '#0ea5e9', '#8b5cf6', '#f8fafc'];
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(42, 466, 368, 92);
  dockColors.forEach((hex, idx) => {
    ctx.fillStyle = hex;
    ctx.fillRect(54 + idx * 58, 478, 48, 68);
  });

  // Sailboat accent on the lake
  ctx.beginPath();
  ctx.moveTo(640, 458);
  ctx.lineTo(680, 360);
  ctx.lineTo(685, 458);
  ctx.closePath();
  ctx.fillStyle = '#fffbeb';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(690, 458);
  ctx.lineTo(690, 385);
  ctx.lineTo(725, 458);
  ctx.closePath();
  ctx.fillStyle = '#fb7185';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(626, 462);
  ctx.lineTo(738, 462);
  ctx.lineTo(722, 482);
  ctx.lineTo(642, 482);
  ctx.closePath();
  ctx.fillStyle = '#7c2d12';
  ctx.fill();

  return canvas;
}

export default function ImageColorPicker({
  uppercaseHex,
  onPickColor,
  onSaveColors,
  onUseInConverter,
}: ImageColorPickerProps) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<LoadedImageState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [toolMode, setToolMode] = useState<'pick' | 'pan'>('pick');
  const [sampleSize, setSampleSize] = useState<1 | 3 | 5 | 9>(1);
  const [dominantCount, setDominantCount] = useState<number>(6);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [pins, setPins] = useState<ImagePin[]>([]);
  const [hoverSample, setHoverSample] = useState<{ px: number; py: number; color: RGBA } | null>(null);
  const [savedPaletteFeedback, setSavedPaletteFeedback] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeRef = useRef<HTMLCanvasElement | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const dominantColors = useMemo<DominantColor[]>(() => {
    if (!loaded) return [];
    return extractDominantColors(loaded.imageData.data, loaded.width, loaded.height, dominantCount);
  }, [loaded, dominantCount]);

  const loadFromCanvas = useCallback((sourceCanvas: HTMLCanvasElement, name: string) => {
    const ctx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    setLoaded({
      name,
      width: sourceCanvas.width,
      height: sourceCanvas.height,
      sourceCanvas,
      imageData,
    });
    setErrorMsg(null);
    setPins([]);
    setHoverSample(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const loadImageFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        setErrorMsg(t('color.image.errorLoad'));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        // Cap working copy at 2400px max dimension so pixel reads stay instantaneous
        const maxDim = 2400;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          setErrorMsg(t('color.image.errorLoad'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        loadFromCanvas(off, file.name || 'image');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setErrorMsg(t('color.image.errorLoad'));
      };
      img.src = url;
    },
    [loadFromCanvas, t],
  );

  const handleLoadSample = () => {
    const sample = buildStudioSampleCanvas();
    loadFromCanvas(sample, 'studio-landscape.png');
  };

  // Global clipboard paste support when the Image Picker is mounted
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const f = items[i].getAsFile();
          if (f) {
            e.preventDefault();
            loadImageFile(f);
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadImageFile]);

  // Compute fitted image draw rect inside viewport CSS dimensions
  const getDrawMetrics = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || !loaded) return null;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    if (vw <= 0 || vh <= 0) return null;
    const fitScale = Math.min((vw - 16) / loaded.width, (vh - 16) / loaded.height);
    const scale = fitScale * zoom;
    const drawW = loaded.width * scale;
    const drawH = loaded.height * scale;
    const ox = (vw - drawW) / 2 + pan.x;
    const oy = (vh - drawH) / 2 + pan.y;
    return { vw, vh, scale, drawW, drawH, ox, oy };
  }, [loaded, pan.x, pan.y, zoom]);

  // Render image + numbered pins onto viewport canvas
  const renderViewport = useCallback(() => {
    const canvas = canvasRef.current;
    const metrics = getDrawMetrics();
    if (!canvas || !loaded || !metrics) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const cw = Math.round(metrics.vw * dpr);
    const ch = Math.round(metrics.vh * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, metrics.vw, metrics.vh);
    ctx.imageSmoothingEnabled = zoom < 3;
    ctx.drawImage(loaded.sourceCanvas, metrics.ox, metrics.oy, metrics.drawW, metrics.drawH);

    // Draw numbered pins
    pins.forEach((pin, idx) => {
      const px = metrics.ox + pin.nx * metrics.drawW;
      const py = metrics.oy + pin.ny * metrics.drawH;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, 11, 0, Math.PI * 2);
      ctx.fillStyle = pin.hex;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(px, py, 12.2, 0, Math.PI * 2);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.stroke();

      ctx.fillStyle = pickReadableInk(pin.color);
      ctx.font = '700 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), px, py + 0.5);
      ctx.restore();
    });
  }, [getDrawMetrics, loaded, pins, zoom]);

  useEffect(() => {
    renderViewport();
  }, [renderViewport]);

  useEffect(() => {
    const onResize = () => renderViewport();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [renderViewport]);

  // Render 11×11 pixel magnifier loupe
  useEffect(() => {
    const loupe = loupeRef.current;
    if (!loupe || !loaded) return;
    const ctx = loupe.getContext('2d');
    if (!ctx) return;
    const grid = 11;
    const cell = 9;
    loupe.width = grid * cell;
    loupe.height = grid * cell;
    ctx.clearRect(0, 0, loupe.width, loupe.height);

    const cx = hoverSample ? hoverSample.px : Math.floor(loaded.width / 2);
    const cy = hoverSample ? hoverSample.py : Math.floor(loaded.height / 2);
    const half = Math.floor(grid / 2);
    const data = loaded.imageData.data;

    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const px = cx + dx;
        const py = cy + dy;
        const gx = (dx + half) * cell;
        const gy = (dy + half) * cell;
        if (px >= 0 && px < loaded.width && py >= 0 && py < loaded.height) {
          const off = (py * loaded.width + px) * 4;
          ctx.fillStyle = `rgba(${data[off]}, ${data[off + 1]}, ${data[off + 2]}, ${data[off + 3] / 255})`;
          ctx.fillRect(gx, gy, cell, cell);
        } else {
          ctx.fillStyle = (dx + dy) % 2 === 0 ? '#cbd5e1' : '#e2e8f0';
          ctx.fillRect(gx, gy, cell, cell);
        }
      }
    }

    // Subtle pixel grid lines
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < grid; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, loupe.height);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(loupe.width, i * cell);
      ctx.stroke();
    }

    // Center highlight box matching sampleSize
    const boxCells = Math.min(grid, sampleSize);
    const boxOff = Math.floor((grid - boxCells) / 2) * cell;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxOff + 1, boxOff + 1, boxCells * cell - 2, boxCells * cell - 2);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxOff, boxOff, boxCells * cell, boxCells * cell);
  }, [hoverSample, loaded, sampleSize]);

  const clientToImagePixel = useCallback(
    (clientX: number, clientY: number): { px: number; py: number; nx: number; ny: number } | null => {
      const vp = viewportRef.current;
      const metrics = getDrawMetrics();
      if (!vp || !loaded || !metrics) return null;
      const rect = vp.getBoundingClientRect();
      const lx = clientX - rect.left;
      const ly = clientY - rect.top;
      const ix = (lx - metrics.ox) / metrics.scale;
      const iy = (ly - metrics.oy) / metrics.scale;
      if (ix < 0 || iy < 0 || ix >= loaded.width || iy >= loaded.height) return null;
      const px = Math.floor(ix);
      const py = Math.floor(iy);
      return { px, py, nx: (px + 0.5) / loaded.width, ny: (py + 0.5) / loaded.height };
    },
    [getDrawMetrics, loaded],
  );

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    if (toolMode === 'pan' || e.button === 1) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      panDragRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y };
      return;
    }
    if (e.button !== 0) return;
    const hit = clientToImagePixel(e.clientX, e.clientY);
    if (!hit) return;
    const sampled = sampleRegionRgba(loaded.imageData.data, loaded.width, loaded.height, hit.px, hit.py, sampleSize);
    const hex = formatHex(sampled, { uppercase: uppercaseHex });
    setHoverSample({ px: hit.px, py: hit.py, color: sampled });
    onPickColor(sampled);
    setPins((prev) => [
      ...prev.slice(-19),
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        nx: hit.nx,
        ny: hit.ny,
        px: hit.px,
        py: hit.py,
        color: sampled,
        hex,
      },
    ]);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    if (panDragRef.current) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      setPan({ x: panDragRef.current.origX + dx, y: panDragRef.current.origY + dy });
      return;
    }
    const hit = clientToImagePixel(e.clientX, e.clientY);
    if (!hit) return;
    const sampled = sampleRegionRgba(loaded.imageData.data, loaded.width, loaded.height, hit.px, hit.py, sampleSize);
    setHoverSample({ px: hit.px, py: hit.py, color: sampled });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panDragRef.current) {
      panDragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!loaded) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    setZoom((z) => clamp(Math.round(z * factor * 100) / 100, 0.5, 16));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) loadImageFile(f);
  };

  const activeHoverColor =
    hoverSample?.color ??
    (loaded
      ? sampleRegionRgba(
          loaded.imageData.data,
          loaded.width,
          loaded.height,
          Math.floor(loaded.width / 2),
          Math.floor(loaded.height / 2),
          sampleSize,
        )
      : { r: 59, g: 130, b: 246, a: 1 });

  return (
    <section className={styles.card} aria-labelledby="image-picker-heading">
      <div className={styles.cardHeader}>
        <h2 id="image-picker-heading" className={styles.cardTitle}>
          {t('color.image.heading')}
        </h2>
        <div className={styles.toolbarGroup}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className={styles.hiddenFileInput}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadImageFile(f);
              e.target.value = '';
            }}
          />
          {loaded && (
            <>
              <button type="button" className={styles.buttonSmall} onClick={() => fileInputRef.current?.click()}>
                {t('color.image.replace')}
              </button>
              <button
                type="button"
                className={styles.buttonSmall}
                onClick={() => {
                  setLoaded(null);
                  setPins([]);
                  setHoverSample(null);
                }}
              >
                {t('color.image.clear')}
              </button>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <p className={styles.errorText} role="alert" style={{ marginBottom: 10 }}>
          {errorMsg}
        </p>
      )}

      {!loaded ? (
        <div
          className={[styles.imageDropZone, isDragOver ? styles.imageDropZoneActive : ''].filter(Boolean).join(' ')}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <p className={styles.dropTitle}>{t('color.image.dropTitle')}</p>
          <p className={styles.dropSub}>{t('color.image.dropSub')}</p>
          <div className={styles.dropActions}>
            <button type="button" className={styles.primaryButton} onClick={() => fileInputRef.current?.click()}>
              {t('color.image.browse')}
            </button>
            <button type="button" className={styles.button} onClick={handleLoadSample}>
              {t('color.image.loadSample')}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.imageWorkbench}>
          {/* Left: Interactive Zoom/Pan Image Canvas */}
          <div>
            <div className={styles.imageToolbar}>
              <div className={styles.toolbarGroup}>
                <div className={styles.segmented} role="group" aria-label={t('color.image.modePick')}>
                  <button
                    type="button"
                    aria-pressed={toolMode === 'pick'}
                    className={[styles.segBtn, toolMode === 'pick' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setToolMode('pick')}
                  >
                    {t('color.image.modePick')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={toolMode === 'pan'}
                    className={[styles.segBtn, toolMode === 'pan' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setToolMode('pan')}
                  >
                    {t('color.image.modePan')}
                  </button>
                </div>

                <div className={styles.segmented} role="group" aria-label={t('color.image.sampleSize')}>
                  {SAMPLE_SIZES.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      aria-pressed={sampleSize === sz}
                      className={[styles.segBtn, sampleSize === sz ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setSampleSize(sz)}
                    >
                      {sz}×{sz}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.toolbarGroup}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setZoom((z) => clamp(Math.round((z / 1.35) * 100) / 100, 0.5, 16))}
                  aria-label={t('color.image.zoomOut')}
                >
                  −
                </button>
                <span className={styles.metaMuted}>{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setZoom((z) => clamp(Math.round(z * 1.35 * 100) / 100, 0.5, 16))}
                  aria-label={t('color.image.zoomIn')}
                >
                  +
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => {
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                  }}
                >
                  {t('color.image.zoomFit')}
                </button>
              </div>
            </div>

            <div
              ref={viewportRef}
              className={styles.imageViewport}
              onWheel={handleWheel}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <canvas
                ref={canvasRef}
                className={styles.imageCanvas}
                style={{ cursor: toolMode === 'pan' ? 'grab' : 'crosshair' }}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                aria-label={t('color.image.canvasAria')}
                data-testid="image-picker-canvas"
              />
            </div>

            <div className={styles.imageHintBar}>
              <span>{t('color.image.hoverHint')}</span>
              <span className={styles.metaMuted}>
                {loaded.name} · {loaded.width}×{loaded.height}px
              </span>
            </div>
          </div>

          {/* Right: Loupe + Dominant Palette + Pinned Samples */}
          <div>
            {/* 11x11 Pixel Magnifier Loupe */}
            <div className={styles.loupeCard}>
              <canvas ref={loupeRef} className={styles.loupeCanvas} aria-label={t('color.image.loupeHeading')} />
              <div className={styles.loupeInfo}>
                <span className={styles.subHeading} style={{ margin: 0 }}>
                  {t('color.image.loupeHeading')}
                </span>
                <div className={styles.loupeSwatchRow}>
                  <span
                    className={styles.loupeSwatch}
                    style={{ backgroundColor: formatHex(activeHoverColor, { uppercase: uppercaseHex }) }}
                  />
                  <span className={styles.loupeHex}>
                    {formatHex(activeHoverColor, { uppercase: uppercaseHex })}
                  </span>
                </div>
                <span className={styles.loupeMeta}>{formatRgb(activeHoverColor)}</span>
                <span className={styles.metaMuted}>
                  {t('color.image.coords', {
                    x: hoverSample?.px ?? Math.floor(loaded.width / 2),
                    y: hoverSample?.py ?? Math.floor(loaded.height / 2),
                  })}
                </span>
              </div>
            </div>

            {/* Dominant Palette Extracted via Median-Cut */}
            <div className={styles.swatchGroupHeader} style={{ marginBottom: 8 }}>
              <h3 className={styles.subHeading} style={{ margin: 0 }}>
                {t('color.image.dominantHeading')}
              </h3>
              <div className={styles.toolbarGroup}>
                <div className={styles.segmented} role="group" aria-label={t('color.image.dominantCount')}>
                  {[5, 6, 8, 10].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={dominantCount === n}
                      className={[styles.segBtn, dominantCount === n ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                      onClick={() => setDominantCount(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={[styles.buttonSmall, savedPaletteFeedback ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
                  onClick={() => {
                    onSaveColors(dominantColors.map((d) => d.color));
                    setSavedPaletteFeedback(true);
                    window.setTimeout(() => setSavedPaletteFeedback(false), 1200);
                  }}
                >
                  {savedPaletteFeedback ? t('color.picker.saved') : t('color.image.addAllSwatches')}
                </button>
              </div>
            </div>

            <ul className={styles.dominantList} data-testid="dominant-palette-list">
              {dominantColors.map((item) => {
                const hex = formatHex(item.color, { uppercase: uppercaseHex });
                const pct = Math.max(1, Math.round(item.share * 100));
                return (
                  <li key={hex} className={styles.dominantRow}>
                    <span className={styles.swatchTile} style={{ backgroundColor: hex }} aria-hidden="true" />
                    <div className={styles.dominantBarWrap}>
                      <div className={styles.dominantTop}>
                        <span className={styles.nearestName}>{hex}</span>
                        <span className={styles.metaMuted}>{pct}%</span>
                      </div>
                      <div className={styles.dominantBar}>
                        <div
                          className={styles.dominantBarFill}
                          style={{ width: `${pct}%`, backgroundColor: hex }}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => onUseInConverter(item.color)}
                    >
                      {t('color.image.useInConverter')}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Pinned Image Samples */}
            <div className={styles.swatchGroupHeader} style={{ marginBottom: 8 }}>
              <h3 className={styles.subHeading} style={{ margin: 0 }}>
                {t('color.image.pinsHeading')} ({pins.length})
              </h3>
              {pins.length > 0 && (
                <button type="button" className={styles.buttonSmall} onClick={() => setPins([])}>
                  {t('color.image.clearPins')}
                </button>
              )}
            </div>

            {pins.length === 0 ? (
              <p className={styles.emptyHint}>{t('color.image.pinsEmpty')}</p>
            ) : (
              <ul className={styles.pinList} data-testid="image-pins-list">
                {pins.map((pin, idx) => {
                  const hex = formatHex(pin.color, { uppercase: uppercaseHex });
                  return (
                    <li key={pin.id} className={styles.pinRow}>
                      <span className={styles.pinBadge}>{idx + 1}</span>
                      <span className={styles.swatchTile} style={{ backgroundColor: hex }} aria-hidden="true" />
                      <button
                        type="button"
                        className={styles.swatchChipBtn}
                        onClick={() => onUseInConverter(pin.color)}
                        title={t('color.image.useInConverter')}
                      >
                        <span>{hex}</span>
                        <span className={styles.metaMuted}>
                          ({pin.px}, {pin.py})
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.swatchRemoveBtn}
                        aria-label={t('color.image.removePinAria', { index: idx + 1 })}
                        onClick={() => setPins((prev) => prev.filter((p) => p.id !== pin.id))}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
