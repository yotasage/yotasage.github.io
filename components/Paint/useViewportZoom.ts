import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 16;

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 1000) / 1000));
}

export function computeWheelZoom(currentZoom: number, deltaY: number, deltaMode: number): number {
  let dy = deltaY;
  if (deltaMode === 1) dy *= 20;
  else if (deltaMode === 2) dy *= 200;
  const clampedDy = Math.max(-180, Math.min(180, dy));
  const factor = Math.exp(-clampedDy * 0.0018);
  return clampZoom(currentZoom * factor);
}

interface ScrollAnchor {
  canvasX: number;
  canvasY: number;
  cursorVpX: number;
  cursorVpY: number;
}

export function useViewportZoom(
  viewportRef: React.RefObject<HTMLDivElement | null>,
  displayCanvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const pendingAnchorRef = useRef<ScrollAnchor | null>(null);

  const setZoom = useCallback((next: number | ((prev: number) => number)) => {
    setZoomState((prev) => {
      const resolved = clampZoom(typeof next === 'function' ? next(prev) : next);
      zoomRef.current = resolved;
      return resolved;
    });
  }, []);

  const fitZoom = useCallback(
    (docWidth: number, docHeight: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const availW = Math.max(200, vp.clientWidth - 48);
      const availH = Math.max(160, vp.clientHeight - 48);
      const scale = Math.min(availW / docWidth, availH / docHeight, 2);
      setZoom(Math.max(MIN_ZOOM, Math.round(scale * 20) / 20));
    },
    [setZoom, viewportRef],
  );

  // Attach a native non-passive wheel listener so Ctrl+Wheel and trackpad pinch zoom the image
  // instead of zooming the browser page.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();

      const oldZoom = zoomRef.current;
      const nextZoom = computeWheelZoom(oldZoom, e.deltaY, e.deltaMode);
      if (Math.abs(nextZoom - oldZoom) < 0.0005) return;

      const canvas = displayCanvasRef.current;
      if (canvas) {
        const vpRect = vp.getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        pendingAnchorRef.current = {
          canvasX: (e.clientX - canvasRect.left) / oldZoom,
          canvasY: (e.clientY - canvasRect.top) / oldZoom,
          cursorVpX: e.clientX - vpRect.left,
          cursorVpY: e.clientY - vpRect.top,
        };
      }

      setZoom(nextZoom);
    };

    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [displayCanvasRef, setZoom, viewportRef]);

  // Keep the image point under the mouse cursor anchored after zoom changes.
  useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current;
    if (!anchor) return;
    pendingAnchorRef.current = null;

    const vp = viewportRef.current;
    const canvas = displayCanvasRef.current;
    if (!vp || !canvas) return;

    const vpRect = vp.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const currentOffsetX = canvasRect.left - vpRect.left + anchor.canvasX * zoom;
    const currentOffsetY = canvasRect.top - vpRect.top + anchor.canvasY * zoom;

    vp.scrollLeft += currentOffsetX - anchor.cursorVpX;
    vp.scrollTop += currentOffsetY - anchor.cursorVpY;
  }, [displayCanvasRef, viewportRef, zoom]);

  return {
    zoom,
    zoomRef,
    setZoom,
    fitZoom,
  };
}
