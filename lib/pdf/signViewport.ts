// Pure viewport pan/zoom math for the PDF Sign interactive page canvas.
// Decoupled from DOM/React so zoom stepping, pinch scaling, focal-point anchoring,
// and pan clamping are deterministic and unit-tested.

export const MIN_SIGN_ZOOM = 0.5;
export const MAX_SIGN_ZOOM = 4;

export const SIGN_ZOOM_STEPS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];

export interface PanOffset {
  x: number;
  y: number;
}

export function clampZoom(zoom: number, min = MIN_SIGN_ZOOM, max = MAX_SIGN_ZOOM): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(min, Math.min(max, zoom));
}

export function stepZoom(current: number, direction: 'in' | 'out'): number {
  const z = clampZoom(current);
  const eps = 0.01;
  if (direction === 'in') {
    for (const step of SIGN_ZOOM_STEPS) {
      if (step > z + eps) return step;
    }
    return SIGN_ZOOM_STEPS[SIGN_ZOOM_STEPS.length - 1];
  }
  for (let i = SIGN_ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (SIGN_ZOOM_STEPS[i] < z - eps) return SIGN_ZOOM_STEPS[i];
  }
  return SIGN_ZOOM_STEPS[0];
}

export function computePinchZoom(
  startZoom: number,
  startDistance: number,
  currentDistance: number,
  min = MIN_SIGN_ZOOM,
  max = MAX_SIGN_ZOOM,
): number {
  if (!Number.isFinite(startDistance) || startDistance <= 1 || !Number.isFinite(currentDistance) || currentDistance <= 0) {
    return clampZoom(startZoom, min, max);
  }
  return clampZoom(startZoom * (currentDistance / startDistance), min, max);
}

/**
 * Computes the new pan offset so the page point currently under `focal`
 * (measured in viewport coordinates) remains stationary when zoom changes
 * from `oldZoom` to `newZoom`. The content is centered in the viewport at
 * `viewportCenter` before applying `pan`.
 */
export function computeZoomedPan(
  pan: PanOffset,
  focal: { x: number; y: number },
  viewportCenter: { x: number; y: number },
  oldZoom: number,
  newZoom: number,
): PanOffset {
  if (!Number.isFinite(oldZoom) || oldZoom <= 0 || !Number.isFinite(newZoom) || newZoom <= 0) {
    return pan;
  }
  const ratio = newZoom / oldZoom;
  const dx = focal.x - viewportCenter.x;
  const dy = focal.y - viewportCenter.y;
  return {
    x: dx - (dx - pan.x) * ratio,
    y: dy - (dy - pan.y) * ratio,
  };
}

/**
 * Clamps pan offset so the zoomed page can be inspected edge-to-edge with a
 * small breathing margin, without ever drifting completely off-screen.
 */
export function clampPan(
  pan: PanOffset,
  contentW: number,
  contentH: number,
  viewportW: number,
  viewportH: number,
  margin = 40,
): PanOffset {
  const maxX = contentW > viewportW ? (contentW - viewportW) / 2 + margin : 0;
  const maxY = contentH > viewportH ? (contentH - viewportH) / 2 + margin : 0;
  return {
    x: Math.max(-maxX, Math.min(maxX, Number.isFinite(pan.x) ? pan.x : 0)) + 0,
    y: Math.max(-maxY, Math.min(maxY, Number.isFinite(pan.y) ? pan.y : 0)) + 0,
  };
}

/**
 * Computes the PDF.js render scale for a given CSS width and device pixel ratio,
 * capping the resulting raster dimensions to avoid excessive memory usage on mobile.
 */
export function computeRenderScale(
  displayWidthCss: number,
  pageWidthPt: number,
  pageHeightPt: number,
  dpr: number,
  maxCanvasDim = 2400,
): number {
  const safePageW = Math.max(1, pageWidthPt);
  const safePageH = Math.max(1, pageHeightPt);
  const safeDpr = Math.max(1, Math.min(dpr || 1, 2.5));
  const desired = (Math.max(120, displayWidthCss) / safePageW) * safeDpr;
  const maxByW = maxCanvasDim / safePageW;
  const maxByH = maxCanvasDim / safePageH;
  return Math.max(0.25, Math.min(desired, maxByW, maxByH));
}
