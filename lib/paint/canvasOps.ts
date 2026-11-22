import { rgbaToCss } from './color';
import { computeAnchoredOffset, computeRotatedDimensions } from './geometry';
import type {
  AnchorPosition,
  BlendMode,
  LayerSnapshot,
  PaintLayer,
  Point,
  Rect,
  ResampleQuality,
  RGBA,
  ShapeFillMode,
} from './types';

let layerCounter = 1;

export function nextLayerId(): string {
  layerCounter += 1;
  return `layer-${Date.now().toString(36)}-${layerCounter}`;
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

export function createLayer(
  width: number,
  height: number,
  name: string,
  fillColor?: string,
): PaintLayer {
  const canvas = createCanvas(width, height);
  if (fillColor) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = fillColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }
  return {
    id: nextLayerId(),
    name,
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    locked: false,
    canvas,
  };
}

export function cloneLayer(layer: PaintLayer, newName?: string): PaintLayer {
  const canvas = createCanvas(layer.canvas.width, layer.canvas.height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(layer.canvas, 0, 0);
  }
  return {
    id: nextLayerId(),
    name: newName ?? `${layer.name} Copy`,
    visible: layer.visible,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    locked: false,
    canvas,
  };
}

export function snapshotLayers(layers: readonly PaintLayer[]): LayerSnapshot[] {
  return layers.map((layer) => {
    const ctx = layer.canvas.getContext('2d', { willReadFrequently: true });
    const w = layer.canvas.width;
    const h = layer.canvas.height;
    const imageData = ctx
      ? ctx.getImageData(0, 0, w, h)
      : new ImageData(w, h);
    return {
      id: layer.id,
      name: layer.name,
      visible: layer.visible,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      locked: layer.locked,
      imageData,
    };
  });
}

export function restoreLayers(snapshots: readonly LayerSnapshot[]): PaintLayer[] {
  return snapshots.map((snap) => {
    const canvas = createCanvas(snap.imageData.width, snap.imageData.height);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(snap.imageData, 0, 0);
    }
    return {
      id: snap.id,
      name: snap.name,
      visible: snap.visible,
      opacity: snap.opacity,
      blendMode: snap.blendMode,
      locked: snap.locked,
      canvas,
    };
  });
}

export interface FloatingPastePreview {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Composites all visible layers bottom-to-top onto a target 2D context,
 * optionally overlaying an active floating selection directly onto the active layer.
 */
export function compositeLayers(
  layers: readonly PaintLayer[],
  targetCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background?: string,
  floating?: { activeLayerId: string; item: FloatingPastePreview } | null,
): void {
  targetCtx.save();
  targetCtx.globalAlpha = 1;
  targetCtx.globalCompositeOperation = 'source-over';
  targetCtx.clearRect(0, 0, width, height);
  if (background) {
    targetCtx.fillStyle = background;
    targetCtx.fillRect(0, 0, width, height);
  }
  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    targetCtx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
    targetCtx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
    targetCtx.drawImage(layer.canvas, 0, 0);
    if (floating && floating.activeLayerId === layer.id) {
      targetCtx.drawImage(floating.item.canvas, floating.item.x, floating.item.y);
    }
  }
  targetCtx.restore();
}

export function renderCompositeCanvas(
  layers: readonly PaintLayer[],
  width: number,
  height: number,
  background?: string,
): HTMLCanvasElement {
  const out = createCanvas(width, height);
  const ctx = out.getContext('2d');
  if (ctx) {
    compositeLayers(layers, ctx, width, height, background);
  }
  return out;
}

/**
 * High-quality multi-step mipmap resample for crisp downscaling without aliasing,
 * or nearest-neighbor for crisp pixel art.
 */
export function resampleCanvas(
  source: HTMLCanvasElement,
  targetW: number,
  targetH: number,
  quality: ResampleQuality = 'smooth',
): HTMLCanvasElement {
  const w = Math.max(1, Math.round(targetW));
  const h = Math.max(1, Math.round(targetH));

  if (quality === 'pixelated') {
    const out = createCanvas(w, h);
    const ctx = out.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source, 0, 0, w, h);
    }
    return out;
  }

  // Multi-step halving when downscaling by more than 2x prevents Moiré/aliasing
  let cur: HTMLCanvasElement = source;
  let curW = source.width;
  let curH = source.height;

  while (curW * 0.5 > w && curH * 0.5 > h) {
    const nextW = Math.max(w, Math.round(curW * 0.5));
    const nextH = Math.max(h, Math.round(curH * 0.5));
    const step = createCanvas(nextW, nextH);
    const sCtx = step.getContext('2d');
    if (sCtx) {
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = 'high';
      sCtx.drawImage(cur, 0, 0, nextW, nextH);
    }
    cur = step;
    curW = nextW;
    curH = nextH;
  }

  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, w, h);
  }
  return out;
}

export function cropCanvas(source: HTMLCanvasElement, rect: Rect): HTMLCanvasElement {
  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));
  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, Math.round(rect.x), Math.round(rect.y), w, h, 0, 0, w, h);
  }
  return out;
}

export function resizeCanvasBounds(
  source: HTMLCanvasElement,
  newW: number,
  newH: number,
  anchor: AnchorPosition,
  fillBg?: string,
): HTMLCanvasElement {
  const out = createCanvas(newW, newH);
  const ctx = out.getContext('2d');
  if (ctx) {
    if (fillBg) {
      ctx.fillStyle = fillBg;
      ctx.fillRect(0, 0, out.width, out.height);
    }
    const offset = computeAnchoredOffset(source.width, source.height, out.width, out.height, anchor);
    ctx.drawImage(source, offset.x, offset.y);
  }
  return out;
}

export function rotateCanvas(
  source: HTMLCanvasElement,
  angleDeg: number,
  expandCanvas = true,
  quality: ResampleQuality = 'smooth',
): HTMLCanvasElement {
  const dims = expandCanvas
    ? computeRotatedDimensions(source.width, source.height, angleDeg)
    : { width: source.width, height: source.height };

  const out = createCanvas(dims.width, dims.height);
  const ctx = out.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = quality === 'smooth';
    if (quality === 'smooth') ctx.imageSmoothingQuality = 'high';
    ctx.translate(dims.width / 2, dims.height / 2);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
  }
  return out;
}

export function flipCanvas(
  source: HTMLCanvasElement,
  direction: 'horizontal' | 'vertical',
): HTMLCanvasElement {
  const out = createCanvas(source.width, source.height);
  const ctx = out.getContext('2d');
  if (ctx) {
    if (direction === 'horizontal') {
      ctx.translate(source.width, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, source.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(source, 0, 0);
  }
  return out;
}

export function drawBrushSegment(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  size: number,
  hardness: number,
  color: RGBA,
  opacityPercent: number,
  isEraser: boolean,
): void {
  const r = Math.max(0.5, size / 2);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(1, r * 0.28);
  const steps = Math.max(1, Math.ceil(dist / step));

  ctx.save();
  ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
  const alpha = (color.a / 255) * (opacityPercent / 100);

  if (hardness >= 95 || size <= 2) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, size);
    ctx.strokeStyle = isEraser
      ? `rgba(0,0,0,${alpha.toFixed(4)})`
      : rgbaToCss(color, opacityPercent / 100);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const innerStop = Math.max(0, Math.min(0.95, hardness / 100));
  const rgbStr = isEraser ? '0,0,0' : `${color.r},${color.g},${color.b}`;

  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const grad = ctx.createRadialGradient(x, y, r * innerStop, x, y, r);
    grad.addColorStop(0, `rgba(${rgbStr},${alpha.toFixed(4)})`);
    grad.addColorStop(1, `rgba(${rgbStr},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  size: number,
  color: RGBA,
): void {
  let x0 = Math.floor(from.x);
  let y0 = Math.floor(from.y);
  const x1 = Math.floor(to.x);
  const y1 = Math.floor(to.y);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  const s = Math.max(1, Math.round(size));
  const half = Math.floor(s / 2);

  ctx.save();
  ctx.fillStyle = rgbaToCss(color);
  while (true) {
    ctx.fillRect(x0 - half, y0 - half, s, s);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
  ctx.restore();
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  kind: 'line' | 'rect' | 'ellipse',
  start: Point,
  end: Point,
  strokeColor: RGBA,
  fillColor: RGBA,
  strokeWidth: number,
  mode: ShapeFillMode,
  arrowHead = false,
): void {
  ctx.save();
  ctx.lineWidth = Math.max(1, strokeWidth);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgbaToCss(strokeColor);
  ctx.fillStyle = rgbaToCss(fillColor);

  if (kind === 'line') {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    if (arrowHead) {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headLen = Math.max(10, strokeWidth * 3.5);
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLen * Math.cos(angle - Math.PI / 6),
        end.y - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLen * Math.cos(angle + Math.PI / 6),
        end.y - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
    }
  } else if (kind === 'rect') {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    if (mode === 'fill' || mode === 'both') {
      ctx.fillRect(x, y, w, h);
    }
    if (mode === 'stroke' || mode === 'both') {
      ctx.strokeRect(x, y, w, h);
    }
  } else if (kind === 'ellipse') {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    if (rx > 0 && ry > 0) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (mode === 'fill' || mode === 'both') ctx.fill();
      if (mode === 'stroke' || mode === 'both') ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Generates a vibrant multi-layer demo composition so visitors can immediately
 * test layers, blend modes, crop, rotate, scale down, and B&W color styles.
 */
export function createSampleDocument(width = 960, height = 640): PaintLayer[] {
  const bg = createLayer(width, height, 'Background');
  const bgCtx = bg.canvas.getContext('2d');
  if (bgCtx) {
    const sky = bgCtx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#0f172a');
    sky.addColorStop(0.55, '#1d4ed8');
    sky.addColorStop(0.85, '#f97316');
    sky.addColorStop(1, '#fef08a');
    bgCtx.fillStyle = sky;
    bgCtx.fillRect(0, 0, width, height);
  }

  const shapes = createLayer(width, height, 'Landscape');
  const sCtx = shapes.canvas.getContext('2d');
  if (sCtx) {
    // Sun disc
    sCtx.fillStyle = '#fef08a';
    sCtx.beginPath();
    sCtx.arc(width * 0.68, height * 0.34, Math.min(width, height) * 0.13, 0, Math.PI * 2);
    sCtx.fill();

    // Far mountains
    sCtx.fillStyle = '#1e293b';
    sCtx.beginPath();
    sCtx.moveTo(0, height * 0.72);
    sCtx.lineTo(width * 0.22, height * 0.42);
    sCtx.lineTo(width * 0.44, height * 0.64);
    sCtx.lineTo(width * 0.64, height * 0.48);
    sCtx.lineTo(width * 0.85, height * 0.68);
    sCtx.lineTo(width, height * 0.56);
    sCtx.lineTo(width, height);
    sCtx.lineTo(0, height);
    sCtx.closePath();
    sCtx.fill();

    // Near ridge
    sCtx.fillStyle = '#0f172a';
    sCtx.beginPath();
    sCtx.moveTo(0, height * 0.8);
    sCtx.lineTo(width * 0.3, height * 0.62);
    sCtx.lineTo(width * 0.58, height * 0.82);
    sCtx.lineTo(width * 0.84, height * 0.66);
    sCtx.lineTo(width, height * 0.76);
    sCtx.lineTo(width, height);
    sCtx.lineTo(0, height);
    sCtx.closePath();
    sCtx.fill();
  }

  const accents = createLayer(width, height, 'Annotations');
  const aCtx = accents.canvas.getContext('2d');
  if (aCtx) {
    // Color calibration strip to showcase Color Styles (B&W, Dither, Grayscale, Sepia)
    const swatches = ['#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#f8fafc', '#18181b'];
    const sw = 32;
    const startX = 40;
    const startY = 40;
    swatches.forEach((col, i) => {
      aCtx.fillStyle = col;
      aCtx.fillRect(startX + i * (sw + 6), startY, sw, sw);
      aCtx.strokeStyle = 'rgba(255,255,255,0.65)';
      aCtx.lineWidth = 2;
      aCtx.strokeRect(startX + i * (sw + 6), startY, sw, sw);
    });

    aCtx.fillStyle = '#ffffff';
    aCtx.font = '600 26px Inter Variable, sans-serif';
    aCtx.fillText('Multi-Layer Sample', 40, 114);
    aCtx.fillStyle = 'rgba(255,255,255,0.82)';
    aCtx.font = '400 15px Inter Variable, sans-serif';
    aCtx.fillText('Try Layers, Crop, Rotate, Scale Down, B&W Color Styles, or Ctrl+C / Ctrl+V', 40, 140);
  }

  return [bg, shapes, accents];
}

export interface SerializedProjectV1 {
  format: 'yotasage-paint-v1';
  width: number;
  height: number;
  layers: {
    id: string;
    name: string;
    visible: boolean;
    opacity: number;
    blendMode: BlendMode;
    locked: boolean;
    dataUrl: string;
  }[];
}

export function serializeProject(
  layers: readonly PaintLayer[],
  width: number,
  height: number,
): string {
  const payload: SerializedProjectV1 = {
    format: 'yotasage-paint-v1',
    width,
    height,
    layers: layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      blendMode: l.blendMode,
      locked: l.locked,
      dataUrl: l.canvas.toDataURL('image/png'),
    })),
  };
  return JSON.stringify(payload);
}

export async function deserializeProject(
  jsonText: string,
): Promise<{ width: number; height: number; layers: PaintLayer[] }> {
  const parsed = JSON.parse(jsonText) as Partial<SerializedProjectV1>;
  if (parsed.format !== 'yotasage-paint-v1' || !Array.isArray(parsed.layers) || parsed.layers.length === 0) {
    throw new Error('Invalid Paint project file.');
  }
  const width = Math.max(1, Math.round(Number(parsed.width) || 800));
  const height = Math.max(1, Math.round(Number(parsed.height) || 600));

  const layers: PaintLayer[] = [];
  for (const item of parsed.layers) {
    const canvas = createCanvas(width, height);
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = () => reject(new Error('Could not decode project layer.'));
      img.src = item.dataUrl;
    });
    layers.push({
      id: item.id || nextLayerId(),
      name: item.name || 'Layer',
      visible: Boolean(item.visible),
      opacity: typeof item.opacity === 'number' ? item.opacity : 1,
      blendMode: item.blendMode || 'source-over',
      locked: Boolean(item.locked),
      canvas,
    });
  }
  return { width, height, layers };
}
