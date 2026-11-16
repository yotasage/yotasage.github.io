// The figures' paint per role and colour mode (step M8.1a). Colour: the page's light theme (styles/EmSim.module.css:
// --copper, --core, --prepreg, --mask, --air, --accent). Greyscale: greys only, the materials told apart by lightness
// (copper darkest, then mask, core, prepreg, air). Black and white: #000000 and #ffffff only; copper solid black,
// core and prepreg hatched at 45° and 135°, mask outlined and hatched upright, air white; contours dashed, plot series by dash pattern.
// Widths and dashes are in mm and the same in every mode except where a mode needs a line the others draw as a fill.

import type { ColourMode } from './model';

export type Role =
  | 'paper' | 'air' | 'core' | 'prepreg' | 'mask' | 'copper' | 'plane' | 'hole' | 'faded' | 'edge'
  | 'cut' | 'leader' | 'ink' | 'muted' | 'dim' | 'frame' | 'grid' | 'series' | 'ref'
  | 'contour' | 'contourHalo' | 'fieldline' | 'fieldlineHalo' | 'map';

export interface Hatch { angle: number; gap: number; width: number; colour: string }
export interface Paint {
  fill: string | null;
  stroke: string | null;
  width: number; // mm
  dash: number[] | null; // mm, on/off
  hatch: Hatch | null; // lines over the fill, cut to the shape
}

const P = (fill: string | null, stroke: string | null = null, width = 0, dash: number[] | null = null, hatch: Hatch | null = null): Paint => ({ fill, stroke, width, dash, hatch });

export const SERIES_COLOURS = ['#0b6a5f', '#c8773a', '#3b5ba5', '#9c3d54', '#6a7f1f', '#7a4fa0', '#2b8cbe', '#5f5f5f'];
const SERIES_GREYS = ['#000000', '#4d4d4d', '#000000', '#7f7f7f', '#262626', '#595959', '#000000', '#7f7f7f'];
export const SERIES_DASH: (number[] | null)[] = [null, [1.6, 0.8], [0.5, 0.6], [1.6, 0.6, 0.4, 0.6], [3, 1], [0.3, 0.3], [2.4, 0.6, 0.6, 0.6, 0.6, 0.6], [1, 1.2]];

const COLOUR: Record<Exclude<Role, 'series'>, Paint> = {
  paper: P('#ffffff'),
  air: P('#e8eff4'),
  core: P('#d6c688'),
  prepreg: P('#e9dfb2'),
  mask: P('#2f7d4f', '#1f5a37', 0.1),
  copper: P('#c8773a', '#8e4b16', 0.1),
  plane: P('#c8773a'),
  hole: P('#ffffff'),
  faded: P('#e4bb9d'),
  edge: P(null, '#ad9d62', 0.1),
  cut: P(null, '#0b6a5f', 0.25, [1.2, 0.8]),
  leader: P(null, '#8a8a8a', 0.12),
  ink: P('#1f1f1f'),
  muted: P('#5f7282'),
  dim: P(null, '#1f1f1f', 0.15),
  frame: P(null, '#1f1f1f', 0.2),
  grid: P(null, '#e3e3e3', 0.1),
  ref: P(null, '#8a8a8a', 0.2, [1, 0.8]),
  contour: P(null, '#ffffff', 0.15, [0.6, 0.45]),
  contourHalo: P(null, '#262626', 0.35),
  fieldline: P(null, '#ffffff', 0.18),
  fieldlineHalo: P(null, '#262626', 0.38),
  map: P(null),
};

const GREY: Record<Exclude<Role, 'series'>, Paint> = {
  ...COLOUR,
  air: P('#f2f2f2'),
  core: P('#bdbdbd'),
  prepreg: P('#dcdcdc'),
  mask: P('#8c8c8c', '#4d4d4d', 0.1),
  copper: P('#595959', '#262626', 0.1),
  plane: P('#595959'),
  faded: P('#acacac'),
  edge: P(null, '#8c8c8c', 0.1),
  cut: P(null, '#000000', 0.25, [1.2, 0.8]),
  leader: P(null, '#8c8c8c', 0.12),
  ink: P('#000000'),
  muted: P('#4d4d4d'),
  dim: P(null, '#000000', 0.15),
  frame: P(null, '#000000', 0.2),
  grid: P(null, '#e0e0e0', 0.1),
  ref: P(null, '#7f7f7f', 0.2, [1, 0.8]),
};

const HB = (angle: number): Hatch => ({ angle, gap: 0.8, width: 0.1, colour: '#000000' });
const BW: Record<Exclude<Role, 'series'>, Paint> = {
  paper: P('#ffffff'),
  air: P('#ffffff'),
  core: P('#ffffff', null, 0, null, HB(45)),
  prepreg: P('#ffffff', null, 0, null, HB(135)),
  mask: P('#ffffff', '#000000', 0.12, null, { angle: 90, gap: 0.45, width: 0.08, colour: '#000000' }), // upright lines: not white like the air (M8.1b)
  copper: P('#000000', '#000000', 0.1),
  plane: P('#000000'),
  hole: P('#ffffff'),
  faded: P('#ffffff', '#000000', 0.12, [0.5, 0.4]),
  edge: P(null, '#000000', 0.1),
  cut: P(null, '#000000', 0.25, [1.2, 0.8]),
  leader: P(null, '#000000', 0.1),
  ink: P('#000000'),
  muted: P('#000000'),
  dim: P(null, '#000000', 0.15),
  frame: P(null, '#000000', 0.2),
  grid: P(null),
  ref: P(null, '#000000', 0.2, [1, 0.8]),
  contour: P(null, '#000000', 0.15, [0.6, 0.45]),
  contourHalo: P(null),
  fieldline: P(null, '#000000', 0.18),
  fieldlineHalo: P(null),
  map: P(null),
};

const TABLE: Record<ColourMode, Record<Exclude<Role, 'series'>, Paint>> = { colour: COLOUR, grey: GREY, bw: BW };

/** The paint of a role in a colour mode (`index`: a plot series). */
export function paintOf(mode: ColourMode, role: Role, index = 0): Paint {
  if (role === 'series') {
    const k = ((index % 8) + 8) % 8;
    if (mode === 'colour') return P(null, SERIES_COLOURS[k], 0.35, index >= 8 ? SERIES_DASH[k] : null);
    return P(null, mode === 'bw' ? '#000000' : SERIES_GREYS[k], 0.35, SERIES_DASH[k]);
  }
  return TABLE[mode][role];
}

/** Is a colour a grey (r = g = b)? */
export const isGrey = (c: string): boolean => c.length === 7 && c.slice(1, 3) === c.slice(3, 5) && c.slice(3, 5) === c.slice(5, 7);
