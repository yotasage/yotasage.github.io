// Default colours and visibility of layers in the layer view, close to KiCad's default theme so the colours are
// familiar: red top copper, blue bottom copper, a colour per inner layer.
import { Layer } from '../model';
import type { LayerStyle } from './view';

const INNER = ['#c2c200', '#c200c2', '#00c2c2', '#e0874a', '#7fc87f', '#8c8cff', '#ff8cc8', '#c8a050', '#50b4c8', '#b4c850'];

export function defaultColor(layer: Layer): string {
  const top = layer.side === 'top';
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

// Shown at first: what makes up the board. Paste, documentation and other layers start hidden.
export function defaultVisible(layer: Layer): boolean {
  return ['copper', 'mask', 'silk', 'outline', 'drill'].includes(layer.kind);
}

export function defaultOpacity(layer: Layer): number {
  return layer.kind === 'mask' ? 0.55 : 0.85;
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

// A mask colour from what a job file or a design calls it ("Green", "Matte black", "R0G0B255"…), green if unknown.
export function maskFromName(name: string | undefined): MaskColor {
  const n = colorWords(name);
  for (const c of ['green', 'red', 'blue', 'black', 'white', 'yellow', 'purple'] as MaskColor[]) if (n.includes(c)) return c;
  if (/orange/.test(n)) return 'red';
  if (/violet|magenta/.test(n)) return 'purple';
  return 'green';
}

export function silkFromName(name: string | undefined): SilkColor {
  const n = colorWords(name);
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
