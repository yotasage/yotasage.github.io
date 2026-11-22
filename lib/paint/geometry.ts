import { AnchorPosition, MAX_CANVAS_DIM, MIN_CANVAS_DIM, Point, Rect } from './types';

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  const x = Math.round(Math.min(x1, x2));
  const y = Math.round(Math.min(y1, y2));
  const w = Math.round(Math.abs(x2 - x1));
  const h = Math.round(Math.abs(y2 - y1));
  return { x, y, w, h };
}

export function clampRect(rect: Rect, canvasW: number, canvasH: number): Rect {
  const x0 = Math.max(0, Math.min(canvasW, Math.round(rect.x)));
  const y0 = Math.max(0, Math.min(canvasH, Math.round(rect.y)));
  const x1 = Math.max(x0, Math.min(canvasW, Math.round(rect.x + rect.w)));
  const y1 = Math.max(y0, Math.min(canvasH, Math.round(rect.y + rect.h)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function constrainRectAspect(
  startX: number,
  startY: number,
  currX: number,
  currY: number,
  aspectRatio: number | null,
): Rect {
  const dx = currX - startX;
  const dy = currY - startY;
  if (!aspectRatio || aspectRatio <= 0) {
    return normalizeRect(startX, startY, currX, currY);
  }
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  let w = absDx;
  let h = absDy;
  if (absDx / aspectRatio >= absDy) {
    h = absDx / aspectRatio;
  } else {
    w = absDy * aspectRatio;
  }
  const endX = startX + (dx >= 0 ? w : -w);
  const endY = startY + (dy >= 0 ? h : -h);
  return normalizeRect(startX, startY, endX, endY);
}

export function parseAspectRatio(aspect: 'free' | '1:1' | '4:3' | '16:9' | '3:2'): number | null {
  switch (aspect) {
    case '1:1': return 1;
    case '4:3': return 4 / 3;
    case '16:9': return 16 / 9;
    case '3:2': return 3 / 2;
    default: return null;
  }
}

export function computeRotatedDimensions(
  width: number,
  height: number,
  angleDeg: number,
): { width: number; height: number } {
  const norm = ((angleDeg % 360) + 360) % 360;
  if (norm === 0 || norm === 180) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  if (norm === 90 || norm === 270) {
    return { width: Math.max(1, Math.round(height)), height: Math.max(1, Math.round(width)) };
  }
  const rad = (norm * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const newW = Math.ceil(width * cos + height * sin);
  const newH = Math.ceil(width * sin + height * cos);
  return {
    width: Math.max(MIN_CANVAS_DIM, Math.min(MAX_CANVAS_DIM, newW)),
    height: Math.max(MIN_CANVAS_DIM, Math.min(MAX_CANVAS_DIM, newH)),
  };
}

export interface ScaleDownOptions {
  percent?: number; // e.g., 50 for 50%
  maxEdge?: number; // e.g., 1280 for longest side <= 1280
  targetWidth?: number;
  targetHeight?: number;
  lockAspect?: boolean;
  preventUpscale?: boolean;
}

export function computeScaledDimensions(
  srcW: number,
  srcH: number,
  opts: ScaleDownOptions,
): { width: number; height: number; scaleFactor: number } {
  const safeW = Math.max(1, Math.round(srcW));
  const safeH = Math.max(1, Math.round(srcH));
  const lock = opts.lockAspect ?? true;
  const noUpscale = opts.preventUpscale ?? false;

  let outW = safeW;
  let outH = safeH;

  if (typeof opts.percent === 'number' && Number.isFinite(opts.percent) && opts.percent > 0) {
    const ratio = opts.percent / 100;
    const clampedRatio = noUpscale ? Math.min(1, ratio) : ratio;
    outW = Math.round(safeW * clampedRatio);
    outH = Math.round(safeH * clampedRatio);
  } else if (typeof opts.maxEdge === 'number' && Number.isFinite(opts.maxEdge) && opts.maxEdge > 0) {
    const longest = Math.max(safeW, safeH);
    const ratio = opts.maxEdge / longest;
    const clampedRatio = noUpscale ? Math.min(1, ratio) : ratio;
    outW = Math.round(safeW * clampedRatio);
    outH = Math.round(safeH * clampedRatio);
  } else {
    const hasW = typeof opts.targetWidth === 'number' && Number.isFinite(opts.targetWidth) && opts.targetWidth > 0;
    const hasH = typeof opts.targetHeight === 'number' && Number.isFinite(opts.targetHeight) && opts.targetHeight > 0;
    if (hasW && hasH && !lock) {
      outW = Math.round(opts.targetWidth!);
      outH = Math.round(opts.targetHeight!);
    } else if (hasW) {
      const ratio = opts.targetWidth! / safeW;
      const clampedRatio = noUpscale ? Math.min(1, ratio) : ratio;
      outW = Math.round(safeW * clampedRatio);
      outH = lock ? Math.round(safeH * clampedRatio) : safeH;
    } else if (hasH) {
      const ratio = opts.targetHeight! / safeH;
      const clampedRatio = noUpscale ? Math.min(1, ratio) : ratio;
      outH = Math.round(safeH * clampedRatio);
      outW = lock ? Math.round(safeW * clampedRatio) : safeW;
    }
  }

  outW = Math.max(MIN_CANVAS_DIM, Math.min(MAX_CANVAS_DIM, outW));
  outH = Math.max(MIN_CANVAS_DIM, Math.min(MAX_CANVAS_DIM, outH));

  if (noUpscale) {
    outW = Math.min(outW, safeW);
    outH = Math.min(outH, safeH);
  }

  const scaleFactor = Math.min(outW / safeW, outH / safeH);
  return { width: outW, height: outH, scaleFactor };
}

export function computeAnchoredOffset(
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
  anchor: AnchorPosition,
): Point {
  const dx = newW - oldW;
  const dy = newH - oldH;

  let x = 0;
  if (anchor.endsWith('c')) x = Math.floor(dx / 2);
  else if (anchor.endsWith('r')) x = dx;

  let y = 0;
  if (anchor.startsWith('m')) y = Math.floor(dy / 2);
  else if (anchor.startsWith('b')) y = dy;

  return { x, y };
}

export function snapAnglePoint(start: Point, end: Point, stepDeg = 15): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return end;
  const angle = Math.atan2(dy, dx);
  const stepRad = (stepDeg * Math.PI) / 180;
  const snapped = Math.round(angle / stepRad) * stepRad;
  return {
    x: Math.round(start.x + Math.cos(snapped) * dist),
    y: Math.round(start.y + Math.sin(snapped) * dist),
  };
}

export function clampFloatingPanel(
  x: number,
  y: number,
  panelW: number,
  panelH: number,
  viewportW: number,
  viewportH: number,
  margin = 8,
): Point {
  const maxX = Math.max(margin, viewportW - Math.min(panelW, viewportW) - margin);
  const maxY = Math.max(margin, viewportH - Math.min(panelH, 120) - margin);
  return {
    x: Math.max(margin, Math.min(maxX, Math.round(x))),
    y: Math.max(margin, Math.min(maxY, Math.round(y))),
  };
}

export function isPointInRect(pt: Point, rect: Rect): boolean {
  return (
    pt.x >= rect.x &&
    pt.x <= rect.x + rect.w &&
    pt.y >= rect.y &&
    pt.y <= rect.y + rect.h
  );
}

export function nudgeRect(rect: Rect, dx: number, dy: number): Rect {
  return {
    x: Math.round(rect.x + dx),
    y: Math.round(rect.y + dy),
    w: rect.w,
    h: rect.h,
  };
}

