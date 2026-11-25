// Display panel controller (P8): owns the DisplayRenderer of the playground's worker client, feeds it
// pointer, wheel, touch and key input from the canvas, keeps the canvas element sized to the drawn
// picture (Fit or 100 %), offers new sizes to scale="window" displays, tells the renderer when the
// panel is hidden, and drives Fullscreen. The renderer maps input from CSS pixels inside the canvas
// box, so the element is always exactly the picture (letterboxed by the stage, never inside it).
import { useCallback, useEffect, useRef, useState } from 'react';

import { MAX_DISPLAY_HEIGHT, MAX_DISPLAY_WIDTH } from '../../lib/python/displayProtocol';
import { DisplayRenderer, eventMods } from '../../lib/python/display/renderer';
import type { DisplayInfo, DisplaySource, DisplayStats, PointerKind } from '../../lib/python/display/renderer';

export type DisplayZoom = 'fit' | 'actual';

export interface UseDisplayOptions {
  readonly source: DisplaySource | null;
  /** The Display tab is showing (desktop output tab or phone pane, workbench view). */
  readonly visible: boolean;
  /** Phone layout: the stage takes the canvas height instead of filling a fixed pane. */
  readonly compact: boolean;
  /** A program opened a new display (not a d.resize() of the open one). */
  readonly onOpen?: (info: DisplayInfo) => void;
}

/** Debug read for the harness (the page's own scripts only; a program cannot reach the page). */
export interface DisplayDebugStats extends DisplayStats {
  readonly hidden: boolean;
}

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

/** Phone stage height as a share of the viewport (the page scrolls around it). */
const COMPACT_HEIGHT_SHARE = 0.62;
const RESIZE_DEBOUNCE_MS = 200;

function fullscreenElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** Keys the browser keeps: shortcuts with Ctrl, Meta or Alt (also AltGr) and the function keys. */
function isBrowserShortcut(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey || /^F\d{1,2}$/.test(e.key);
}

/**
 * CSS scale of the canvas element: 1 for 100 %; for Fit the largest that fits the stage, except that
 * scale="pixel" snaps up-scaling to whole numbers and a numeric scale is the program's zoom, capped
 * to the stage.
 */
export function displayCssScale(info: DisplayInfo, zoom: DisplayZoom, availW: number, availH: number): number {
  if (zoom === 'actual' || availW <= 0 || availH <= 0) return 1;
  const fit = Math.min(availW / info.width, availH / info.height);
  if (typeof info.scale === 'number') return Math.min(info.scale, fit);
  if (info.scale === 'pixel' && fit >= 1) return Math.floor(fit);
  return fit;
}

function isWholeUpscale(scale: number): boolean {
  return scale >= 2 && Math.abs(scale - Math.round(scale)) < 1e-6;
}

function bindDisplayInput(r: DisplayRenderer, canvas: HTMLCanvasElement, onEscape: () => void): () => void {
  const held = new Map<string, string>();
  const rel = (e: MouseEvent) => {
    const b = canvas.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top] as const;
  };
  const onPointer = (e: PointerEvent) => {
    if (!r.info?.open) return;
    let kind: PointerKind = 'move';
    if (e.type === 'pointerdown') {
      kind = 'down';
      canvas.focus({ preventScroll: true });
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events cannot be captured.
      }
    } else if (e.type === 'pointerup' || e.type === 'pointercancel') {
      kind = 'up';
    }
    const [x, y] = rel(e);
    const buttons = e.type === 'pointercancel' ? 0 : e.buttons;
    r.pushPointer(kind, x, y, { button: Math.max(0, e.button), buttons, mods: eventMods(e) });
  };
  const onWheel = (e: WheelEvent) => {
    if (!r.info?.open) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const [x, y] = rel(e);
    r.pushWheel(x, y, e.deltaX * unit, e.deltaY * unit, eventMods(e));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (e.type === 'keydown') onEscape();
      return;
    }
    if (!r.info?.open || e.key === 'Tab') return;
    if (!isBrowserShortcut(e)) e.preventDefault();
    const down = e.type === 'keydown';
    const id = e.code || e.key;
    if (down) held.set(id, e.key);
    else held.delete(id);
    r.pushKey(down ? 'down' : 'up', e.key, e.code, eventMods(e), e.repeat);
  };
  // Keys still held when focus leaves would stay down in the program: release them.
  const onBlur = () => {
    for (const [code, key] of held) r.pushKey('up', key, code);
    held.clear();
  };
  const onContextMenu = (e: Event) => {
    if (r.info?.open) e.preventDefault();
  };
  const pointerTypes = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'] as const;
  for (const t of pointerTypes) canvas.addEventListener(t, onPointer);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('keyup', onKey);
  canvas.addEventListener('blur', onBlur);
  canvas.addEventListener('contextmenu', onContextMenu);
  return () => {
    for (const t of pointerTypes) canvas.removeEventListener(t, onPointer);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('keydown', onKey);
    canvas.removeEventListener('keyup', onKey);
    canvas.removeEventListener('blur', onBlur);
    canvas.removeEventListener('contextmenu', onContextMenu);
  };
}

export function useDisplay({ source, visible, compact, onOpen }: UseDisplayOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<DisplayRenderer | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const lastResizeRef = useRef('');

  const [info, setInfo] = useState<DisplayInfo | null>(null);
  const [zoom, setZoom] = useState<DisplayZoom>('fit');
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [focused, setFocused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);

  const exitFullscreen = useCallback(() => {
    const d = document as FsDocument;
    if (!fullscreenElement()) return;
    if (d.exitFullscreen) void d.exitFullscreen().catch(() => {});
    else d.webkitExitFullscreen?.();
  }, []);

  // One renderer per worker client; it outlives worker restarts (the client reports display.close).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!source || !canvas) return undefined;
    let openNow = false;
    const r = new DisplayRenderer(source, canvas, {
      onOpen: (next) => {
        const fresh = !openNow;
        openNow = true;
        setInfo(next);
        if (fresh) {
          lastResizeRef.current = '';
          setZoom('fit');
          onOpenRef.current?.(next);
        }
      },
      onClose: (next) => {
        openNow = false;
        setInfo(next);
      },
    });
    rendererRef.current = r;
    r.setHidden(!visibleRef.current);
    const unbind = bindDisplayInput(r, canvas, () => {
      canvas.blur();
      exitFullscreen();
    });
    const w = window as Window & { __pythonDisplayStats?: () => DisplayDebugStats };
    const debug = (): DisplayDebugStats => ({ ...r.stats(), hidden: r.hidden });
    w.__pythonDisplayStats = debug;
    return () => {
      unbind();
      r.dispose();
      rendererRef.current = null;
      if (w.__pythonDisplayStats === debug) delete w.__pythonDisplayStats;
      setInfo(null);
    };
  }, [source, exitFullscreen]);

  useEffect(() => {
    rendererRef.current?.setHidden(!visible);
  }, [visible]);

  // Stage size (content box) for Fit and for scale="window" offers.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1].contentRect;
      setBox((prev) =>
        prev.w === Math.floor(rect.width) && prev.h === Math.floor(rect.height)
          ? prev
          : { w: Math.floor(rect.width), h: Math.floor(rect.height) },
      );
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Focus state for the "Click the display to type" hint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    canvas.addEventListener('focus', on);
    canvas.addEventListener('blur', off);
    return () => {
      canvas.removeEventListener('focus', on);
      canvas.removeEventListener('blur', off);
    };
  }, []);

  // Fullscreen state; Esc anywhere in the panel leaves it (the browser also does for a real Esc).
  useEffect(() => {
    const d = document as FsDocument;
    setFullscreenAvailable(Boolean(d.fullscreenEnabled ?? d.webkitFullscreenEnabled));
    const sync = () => setFullscreen(fullscreenElement() !== null && fullscreenElement() === panelRef.current);
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    const panel = panelRef.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenElement() === panel) exitFullscreen();
    };
    panel?.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      panel?.removeEventListener('keydown', onKey);
    };
  }, [exitFullscreen]);

  const availH = compact && !fullscreen && typeof window !== 'undefined' ? Math.round(window.innerHeight * COMPACT_HEIGHT_SHARE) : box.h;

  // Offer the panel's size to scale="window" displays (debounced; every offer is an event).
  useEffect(() => {
    if (!info?.open || info.scale !== 'window' || !visible || box.w <= 0 || availH <= 0) return undefined;
    const w = Math.min(MAX_DISPLAY_WIDTH, box.w);
    const h = Math.min(MAX_DISPLAY_HEIGHT, availH);
    const key = `${w}x${h}`;
    if ((w === info.width && h === info.height) || key === lastResizeRef.current) return undefined;
    const timer = window.setTimeout(() => {
      if (rendererRef.current?.requestResize(w, h)) lastResizeRef.current = key;
    }, RESIZE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [info, visible, box.w, availH]);

  const scale = info ? displayCssScale(info, zoom, box.w, availH) : 1;
  const cssWidth = info ? Math.max(1, Math.round(info.width * scale)) : 0;
  const cssHeight = info ? Math.max(1, Math.round(info.height * scale)) : 0;
  const pixelated = info !== null && (info.scale === 'pixel' || typeof info.scale === 'number' || isWholeUpscale(scale));

  const toggleFullscreen = useCallback(() => {
    const panel = panelRef.current as FsElement | null;
    if (!panel) return;
    if (fullscreenElement()) {
      exitFullscreen();
      return;
    }
    if (panel.requestFullscreen) void panel.requestFullscreen().catch(() => {});
    else panel.webkitRequestFullscreen?.();
  }, [exitFullscreen]);

  const close = useCallback(() => {
    rendererRef.current?.requestClose();
  }, []);

  const screenshot = useCallback(async (): Promise<Blob | null> => {
    const r = rendererRef.current;
    return r ? r.screenshot() : null;
  }, []);

  return {
    canvasRef,
    stageRef,
    panelRef,
    info,
    zoom,
    setZoom,
    scale,
    cssWidth,
    cssHeight,
    pixelated,
    focused,
    fullscreen,
    fullscreenAvailable,
    toggleFullscreen,
    close,
    screenshot,
  };
}
