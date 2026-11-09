// Default colours and visibility of layers in the layer view, close to KiCad's default theme so the colours are
// familiar: red top copper, blue bottom copper, a colour per inner layer.
import { Layer } from '../model';
import type { LayerStyle } from './view';

const INNER = ['#c2c200', '#c200c2', '#00c2c2', '#e0874a', '#7fc87f', '#8c8cff', '#ff8cc8', '#c8a050', '#50b4c8', '#b4c850'];

export function defaultColor(layer: Layer): string {
  const top = layer.side === 'top';
  // The markers of a pick-and-place file stand out from the board.
  if (layer.markers) return top ? '#ffb02e' : '#5ad2ff';
  switch (layer.kind) {
    case 'copper':
      if (top) return '#c83434';
      if (layer.side === 'bottom') return '#4d7fc4';
      return INNER[((layer.copper ?? 2) - 2 + INNER.length) % INNER.length];
    case 'mask':
      return top ? '#d864ff' : '#02c8b4';
    case 'paste':
      return top ? '#b4a0a0' : '#00b0b0';
    case 'silk':
      return top ? '#f2eda1' : '#e8b2a7';
    case 'outline':
      return '#d0d2cd';
    case 'drill':
      return layer.plated === false ? '#9aa0a8' : '#e3e3e3';
    case 'fab':
      return top ? '#afafaf' : layer.side === 'bottom' ? '#8890c0' : '#b0b0b0';
    case 'courtyard':
      return top ? '#ff26e2' : '#26e9ff';
    case 'keepout':
      return '#ff6b6b';
    case 'mechanical':
      return '#c8c896';
    default:
      return '#9aa5b4';
  }
}

// Shown at first: what makes up the board, and the markers of pick-and-place files. Paste, documentation and other
// layers start hidden.
export function defaultVisible(layer: Layer): boolean {
  return Boolean(layer.markers) || ['copper', 'mask', 'silk', 'outline', 'drill'].includes(layer.kind);
}

export function defaultOpacity(layer: Layer): number {
  return layer.kind === 'mask' ? 0.55 : layer.markers ? 1 : 0.85;
}

export function defaultStyle(layer: Layer): LayerStyle {
  return { visible: defaultVisible(layer), color: defaultColor(layer), opacity: defaultOpacity(layer) };
}

// --- Realistic view ---

export type MaskColor = 'green' | 'red' | 'blue' | 'black' | 'white' | 'yellow' | 'purple';
export type SilkColor = 'white' | 'black' | 'yellow';
export type Finish = 'enig' | 'hasl' | 'copper';

export interface RealisticStyle {
  mask: MaskColor;
  silk: SilkColor;
  finish: Finish;
}

// Solder mask over bare substrate, and over copper, which shows through lighter as on real boards.
export const MASK_COLORS: Record<MaskColor, { label: string; substrate: string; copper: string }> = {
  green: { label: 'Green', substrate: '#0d4a24', copper: '#2a7a3a' },
  red: { label: 'Red', substrate: '#7c1016', copper: '#b02a26' },
  blue: { label: 'Blue', substrate: '#10296e', copper: '#24489e' },
  black: { label: 'Black', substrate: '#121214', copper: '#262629' },
  white: { label: 'White', substrate: '#d6d6d0', copper: '#edede6' },
  yellow: { label: 'Yellow', substrate: '#b8950c', copper: '#d8b82a' },
  purple: { label: 'Purple', substrate: '#3a1460', copper: '#58288a' },
};

export const SILK_COLORS: Record<SilkColor, { label: string; color: string }> = {
  white: { label: 'White', color: '#f2f2ee' },
  black: { label: 'Black', color: '#161616' },
  yellow: { label: 'Yellow', color: '#f0d23a' },
};

export const FINISHES: Record<Finish, { label: string; color: string }> = {
  enig: { label: 'ENIG (gold)', color: '#d6b54e' },
  hasl: { label: 'HASL (tin)', color: '#c4c7cc' },
  copper: { label: 'Bare copper', color: '#c47a48' },
};

// FR-4 where neither mask nor copper covers it.
export const SUBSTRATE = '#9c9468';

function colorWords(name: string | undefined): string {
  return (name ?? '').toLowerCase();
}

// A colour written as #RRGGBB or #RRGGBBAA (KiCad's own stackup colours) as hue (degrees), saturation and lightness
// (0 to 1).
function hexColor(name: string): { h: number; s: number; l: number } | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(name.trim());
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s, l };
}

// The mask colour nearest to a colour given as #RRGGBB: black, white, or by hue.
function maskFromHex(c: { h: number; s: number; l: number }): MaskColor {
  if (c.l < 0.18 || (c.s < 0.15 && c.l < 0.45)) return 'black';
  if (c.s < 0.15) return 'white';
  if (c.h < 20 || c.h >= 330) return 'red';
  if (c.h < 70) return 'yellow';
  if (c.h < 170) return 'green';
  if (c.h < 260) return 'blue';
  return 'purple';
}

// A mask colour from what a job file or a design calls it ("Green", "Matte black", "Light Blue", "#1A4D2EFF",
// "R0G0B255"…), green if unknown.
export function maskFromName(name: string | undefined): MaskColor {
  const n = colorWords(name);
  const hex = hexColor(n);
  if (hex) return maskFromHex(hex);
  for (const c of ['green', 'red', 'blue', 'black', 'white', 'yellow', 'purple'] as MaskColor[]) if (n.includes(c)) return c;
  if (/orange/.test(n)) return 'red';
  if (/violet|magenta/.test(n)) return 'purple';
  if (/gr[ae]y/.test(n)) return /light/.test(n) ? 'white' : 'black';
  return 'green';
}

export function silkFromName(name: string | undefined): SilkColor {
  const n = colorWords(name);
  const hex = hexColor(n);
  if (hex) return hex.l < 0.35 ? 'black' : hex.s > 0.4 && hex.h >= 30 && hex.h < 75 ? 'yellow' : 'white';
  if (n.includes('black')) return 'black';
  if (n.includes('yellow')) return 'yellow';
  return 'white';
}

// A finish from the job file's name for it (KiCad: "ENIG", "HAL SnPb", "HAL lead-free", "OSP", "None"…). Unknown and
// "None" give ENIG, as KiCad's 3D view shows them.
export function finishFromName(name: string | undefined): Finish {
  const n = colorWords(name);
  if (/hal|hasl|tin|lead|solder|silver|sn/.test(n)) return 'hasl';
  if (/osp|bare|copper|entek/.test(n)) return 'copper';
  return 'enig';
}

export function realisticColors(s: RealisticStyle): { substrate: string; maskSubstrate: string; maskCopper: string; finish: string; silk: string } {
  const mask = MASK_COLORS[s.mask];
  return { substrate: SUBSTRATE, maskSubstrate: mask.substrate, maskCopper: mask.copper, finish: FINISHES[s.finish].color, silk: SILK_COLORS[s.silk].color };
}
