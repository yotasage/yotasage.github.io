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
