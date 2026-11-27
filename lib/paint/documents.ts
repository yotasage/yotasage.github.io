import {
  cloneLayer,
  compositeLayers,
  createCanvas,
  createLayer,
  type FloatingPastePreview,
  snapshotLayers,
} from './canvasOps';
import type { HistorySnapshot, ImageDocMeta, PaintLayer, Rect } from './types';

export interface ImageDocRuntime {
  width: number;
  height: number;
  layers: PaintLayer[];
  activeLayerId: string;
  history: HistorySnapshot[];
  historyIdx: number;
  selection: Rect | null;
  cropRect: Rect | null;
  floating: FloatingPastePreview | null;
  zoom: number;
  /** True only for the initial blank canvas before any edits are made. */
  isPristineBlank: boolean;
}

let docCounter = 1;

export function nextDocId(): string {
  docCounter += 1;
  return `imgdoc-${Date.now().toString(36)}-${docCounter}`;
}

export function stripFileExtension(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/\.(paint|img)\.json$/i, '')
    .replace(/\.[^.]+$/, '')
    .trim();
}

export function makeUniqueDocName(baseName: string, existingNames: readonly string[]): string {
  const clean = baseName.trim() || 'Untitled';
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  if (!taken.has(clean.toLowerCase())) return clean;
  let n = 2;
  while (taken.has(`${clean} (${n})`.toLowerCase())) {
    n += 1;
  }
  return `${clean} (${n})`;
}

export function nextUntitledName(existingNames: readonly string[], baseLabel = 'Untitled'): string {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  let n = 1;
  while (taken.has(`${baseLabel} ${n}`.toLowerCase())) {
    n += 1;
  }
  return `${baseLabel} ${n}`;
}

export function makeDuplicateName(
  sourceName: string,
  existingNames: readonly string[],
  copySuffix = 'copy',
): string {
  const base = `${sourceName.trim() || 'Untitled'} ${copySuffix}`;
  return makeUniqueDocName(base, existingNames);
}

/**
 * Renders a small aspect-preserving preview thumbnail of a document's composited layers.
 * Safe to call only in browser environments; returns '' if offscreen canvas is unavailable.
 */
export function renderDocumentThumbnail(
  layers: readonly PaintLayer[],
  width: number,
  height: number,
  maxW = 144,
  maxH = 96,
): string {
  if (typeof document === 'undefined' || width <= 0 || height <= 0 || layers.length === 0) {
    return '';
  }
  const scale = Math.min(maxW / width, maxH / height, 1);
  const tw = Math.max(1, Math.round(width * scale));
  const th = Math.max(1, Math.round(height * scale));

  const comp = createCanvas(width, height);
  const compCtx = comp.getContext('2d');
  if (!compCtx) return '';
  compositeLayers(layers, compCtx, width, height);

  const thumb = createCanvas(tw, th);
  const tCtx = thumb.getContext('2d');
  if (!tCtx) return '';
  tCtx.imageSmoothingEnabled = true;
  tCtx.imageSmoothingQuality = 'medium';
  tCtx.drawImage(comp, 0, 0, width, height, 0, 0, tw, th);

  try {
    return thumb.toDataURL('image/png');
  } catch {
    return '';
  }
}

export function createRuntimeFromLayers(
  layers: PaintLayer[],
  width: number,
  height: number,
  activeLayerId: string,
  label: string,
  zoom = 1,
  isPristineBlank = false,
): ImageDocRuntime {
  const snap: HistorySnapshot = {
    label,
    width,
    height,
    activeLayerId,
    layers: snapshotLayers(layers),
  };
  return {
    width,
    height,
    layers,
    activeLayerId,
    history: [snap],
    historyIdx: 0,
    selection: null,
    cropRect: null,
    floating: null,
    zoom,
    isPristineBlank,
  };
}

export function createBlankDocumentRuntime(
  width: number,
  height: number,
  bg: 'white' | 'transparent' | 'black',
  backgroundLayerName: string,
  isPristineBlank = false,
): ImageDocRuntime {
  const fill = bg === 'white' ? '#ffffff' : bg === 'black' ? '#000000' : undefined;
  const base = createLayer(width, height, backgroundLayerName, fill);
  const top = createLayer(width, height, 'Layer 2');
  return createRuntimeFromLayers([base, top], width, height, top.id, 'New Canvas', 1, isPristineBlank);
}

export function cloneDocumentRuntime(source: ImageDocRuntime): ImageDocRuntime {
  const clonedLayers = source.layers.map((l) => {
    const c = cloneLayer(l);
    return { ...c, name: l.name };
  });
  const activeIdx = source.layers.findIndex((l) => l.id === source.activeLayerId);
  const nextActiveId =
    (activeIdx >= 0 ? clonedLayers[activeIdx]?.id : clonedLayers[clonedLayers.length - 1]?.id) ?? '';
  return createRuntimeFromLayers(
    clonedLayers,
    source.width,
    source.height,
    nextActiveId,
    'Duplicate',
    source.zoom,
    false,
  );
}

export function buildDocMeta(
  id: string,
  name: string,
  runtime: ImageDocRuntime,
  pinned = false,
): ImageDocMeta {
  return {
    id,
    name,
    pinned,
    width: runtime.width,
    height: runtime.height,
    layerCount: runtime.layers.length,
    zoom: runtime.zoom,
    thumbDataUrl: renderDocumentThumbnail(runtime.layers, runtime.width, runtime.height),
    updatedAt: Date.now(),
  };
}
