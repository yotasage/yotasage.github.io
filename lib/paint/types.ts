export type ToolId =
  | 'brush'
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'picker'
  | 'select'
  | 'move'
  | 'crop'
  | 'pan';

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'difference';

export type ColorStyleId =
  | 'grayscale'
  | 'bw-threshold'
  | 'bw-dither'
  | 'sepia'
  | 'invert'
  | 'posterize'
  | 'high-contrast'
  | 'warm'
  | 'cool';

export type ResampleQuality = 'smooth' | 'pixelated';

export type ShapeFillMode = 'stroke' | 'fill' | 'both';

export type AnchorPosition =
  | 'tl' | 'tc' | 'tr'
  | 'ml' | 'mc' | 'mr'
  | 'bl' | 'bc' | 'br';

export type DockSide = 'left' | 'right' | 'floating';
export type PanelId = 'files' | 'colors' | 'layers';

export interface PanelLayout {
  dock: DockSide;
  visible: boolean;
  x: number;
  y: number;
  zIndex: number;
}

export interface ImageDocMeta {
  id: string;
  name: string;
  pinned: boolean;
  width: number;
  height: number;
  layerCount: number;
  zoom: number;
  thumbDataUrl: string;
  updatedAt: number;
}

export interface RGBA {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
  a: number; // 0..255
}

export interface HSVA {
  h: number; // 0..360
  s: number; // 0..100
  v: number; // 0..100
  a: number; // 0..255
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PaintLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number; // 0..1
  blendMode: BlendMode;
  locked: boolean;
  canvas: HTMLCanvasElement;
}

export interface LayerSnapshot {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  locked: boolean;
  imageData: ImageData;
}

export interface HistorySnapshot {
  label: string;
  width: number;
  height: number;
  activeLayerId: string;
  layers: LayerSnapshot[];
}

export interface ToolOptions {
  brushSize: number;
  brushHardness: number; // 0..100
  brushOpacity: number; // 1..100
  fillTolerance: number; // 0..100
  shapeMode: ShapeFillMode;
  lineArrow: boolean;
  fontSize: number;
  fontFamily: string;
  fontBold: boolean;
  fontItalic: boolean;
  sampleAllLayers: boolean;
  cropAspect: 'free' | '1:1' | '4:3' | '16:9' | '3:2';
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  brushSize: 12,
  brushHardness: 85,
  brushOpacity: 100,
  fillTolerance: 24,
  shapeMode: 'stroke',
  lineArrow: false,
  fontSize: 32,
  fontFamily: 'Inter Variable, sans-serif',
  fontBold: false,
  fontItalic: false,
  sampleAllLayers: true,
  cropAspect: 'free',
};

export const BLEND_MODES: readonly { id: BlendMode; labelKey: string }[] = [
  { id: 'source-over', labelKey: 'paint.blend.normal' },
  { id: 'multiply', labelKey: 'paint.blend.multiply' },
  { id: 'screen', labelKey: 'paint.blend.screen' },
  { id: 'overlay', labelKey: 'paint.blend.overlay' },
  { id: 'darken', labelKey: 'paint.blend.darken' },
  { id: 'lighten', labelKey: 'paint.blend.lighten' },
  { id: 'difference', labelKey: 'paint.blend.difference' },
];

export const MAX_CANVAS_DIM = 4096;
export const MIN_CANVAS_DIM = 1;
export const MAX_HISTORY = 25;
