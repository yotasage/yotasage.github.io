// The figure's three palettes (step M8.1a, plan.md D18): per role a colour, a grey, and a black-and-white dash
// pattern, line width and marker shape. Framework-free, shared by the SVG (figureSvg.ts), the TikZ (M8.1b) and the
// preview (M8.3a), so they draw the same strokes. Lengths are in mm; colours are opaque #rrggbb (the page's
// translucent grid colours mixed over white, since a paper figure has no CSS variables and TikZ no alpha by default).
//
// The rules the harness holds (check-figure.mjs):
// - colour: the parts take the page's light-theme --part-1 … --part-8 in order (index mod 8), like the chart;
// - black and white: only #000000 and #ffffff; every pair of roles shown (each part its own role) differs in dash
//   pattern, line width or marker shape;
// - greyscale: the b&w dashes, widths and markers with greys; any two roles with the same dash pattern and the same
//   marker differ by at least 20 % in lightness.
// Parts beyond eight repeat the first eight's styles, as the page's colours do.

export const ROLE_GRID = 0;
export const ROLE_SCALE = 1;
export const ROLE_PART = 2;
export const ROLE_NODE = 3;
export const ROLE_GOAL = 4;
export const ROLE_CONSTRUCTION = 5;
export const ROLE_SOLUTION = 6;
export const ROLE_TRACE = 7;
export const ROLE_MARKER = 8;
export const ROLE_LEGEND = 9;
export const ROLE_NAMES: readonly string[] = ['grid', 'scale', 'part', 'node', 'goal', 'construction', 'solution', 'trace', 'marker', 'legend'];

// Sub-kinds within a role.
export const SUB_AXIS = 0;     // grid: the rim and the real axis
export const SUB_Z_MAJOR = 1;  // grid: labelled r and x lines
export const SUB_Z_MINOR = 2;
export const SUB_Y_MAJOR = 3;  // grid: labelled g and b lines
export const SUB_Y_MINOR = 4;
export const SUB_PATH = 0;     // part: its arc from node k to node k + 1
export const SUB_LOCUS = 1;    // part: the whole circle it moves on, inside the disk ("part arcs")
export const SUB_RING = 0;     // goal: the goal's circle (or a point target's close-enough circle)
export const SUB_TARGET = 1;   // goal: the point target's mark

export type ColourMode = 'colour' | 'grey' | 'bw';
export const COLOUR_MODES: readonly ColourMode[] = ['colour', 'grey', 'bw'];

export const MARK_NONE = '';
export type MarkShape = '' | 'dot' | 'target' | 'cross' | 'triangle';

export interface Stroke {
  colour: string;        // #rrggbb
  width: number;         // mm
  dash: readonly number[]; // mm, on/off pairs; [] solid
  mark: MarkShape;       // the shape of a mark of this role ('' for lines)
  fill: string;          // a mark's fill ('' none)
}

/** The page's light-theme part colours (styles/Smith.module.css --part-1 … --part-8). */
export const PART_COLOURS: readonly string[] = ['#1971c2', '#d9480f', '#c2255c', '#2b8a3e', '#7048e8', '#9c7a00', '#0c8599', '#c92a2a'];
export const PART_STYLES = PART_COLOURS.length;

// Mixed over white: rgba(29, 28, 25, 0.44) and 0.14, rgba(11, 106, 95, 0.55) and 0.18, --ink at 0.72.
const INK = '#1d1c19';
const INK_3 = '#736f67';
const ACCENT = '#0b6a5f';
const C_GRID: readonly string[] = ['#6e6a61', '#9c9b9a', '#dfdfdf', '#79ada7', '#d3e4e2'];
const C_TRACE = '#555452';
const C_SCALE = '#9a958a';
const C_MARKER = '#c2255c';

// b&w dash patterns of the parts: all different, none equal to another role's.
const PART_DASH: readonly (readonly number[])[] = [
  [], [1.6, 0.6], [0.45, 0.45], [2.4, 0.6, 0.45, 0.6], [3.2, 1.2], [0.9, 0.9], [2.4, 0.6, 0.45, 0.6, 0.45, 0.6], [4, 0.8, 1.2, 0.8],
];
const Y_DASH: readonly number[] = [0.6, 0.4];
const GOAL_DASH: readonly number[] = [1.2, 0.45, 0.3, 0.45];
const CONSTRUCTION_DASH: readonly number[] = [0.8, 0.8];
const COLOUR_GOAL_DASH: readonly number[] = [1.3, 1.05];

// Widths (mm), the same in every mode so the three modes keep one layout.
const W_AXIS = 0.25, W_MAJOR = 0.15, W_MINOR = 0.07, W_SCALE = 0.1, W_PATH = 0.6, W_LOCUS = 0.18;
const W_GOAL = 0.3, W_CONSTRUCTION = 0.25, W_TRACE = 0.3, W_MARK = 0.25;

/** The size (mm) of a mark of each role across. */
export const MARK_SIZE: readonly number[] = [0, 0, 0, 1.4, 1.8, 0, 1.6, 0, 1.6, 0];

const grey = (l: number): string => { const v = Math.round(255 * l).toString(16).padStart(2, '0'); return `#${v}${v}${v}`; };
// Grey lightness: parts 0, trace 0.22, scale 0.44, grid (major) 0.66, part arcs 0.88 (solid ones ≥ 20 % apart).
const G_GRID: readonly string[] = [grey(0.35), grey(0.66), grey(0.86), grey(0.66), grey(0.86)];

const SOLID: readonly number[] = [];
const stroke = (colour: string, width: number, dash: readonly number[] = SOLID, mark: MarkShape = MARK_NONE, fill = ''): Stroke => ({ colour, width, dash, mark, fill });

// Tables per mode, built once: [role][sub] for most roles, [sub][index mod 8] for parts.
function table(mode: ColourMode) {
  const bw = mode === 'bw', gr = mode === 'grey', c = mode === 'colour';
  const k = bw ? '#000000' : gr ? grey(0) : INK;
  const gridC = (s: number): string => (bw ? '#000000' : gr ? G_GRID[s] : C_GRID[s]);
  const gridDash = (s: number): readonly number[] => (s >= SUB_Y_MAJOR && !c ? Y_DASH : SOLID);
  const grid = [W_AXIS, W_MAJOR, W_MINOR, W_MAJOR, W_MINOR].map((w, s) => stroke(gridC(s), w, gridDash(s)));
  const parts: Stroke[][] = [[], []];
  for (let i = 0; i < PART_STYLES; i++) {
    const dash = c ? SOLID : PART_DASH[i];
    parts[SUB_PATH].push(stroke(c ? PART_COLOURS[i] : k, W_PATH, dash));
    parts[SUB_LOCUS].push(stroke(c ? mix(PART_COLOURS[i], 0.5) : bw ? '#000000' : grey(0.88), W_LOCUS, dash));
  }
  return {
    grid,
    scale: stroke(bw ? '#000000' : gr ? grey(0.44) : C_SCALE, W_SCALE),
    parts,
    node: stroke(k, W_MARK, SOLID, 'dot', k),
    goal: [stroke(bw ? '#000000' : gr ? grey(0.3) : ACCENT, W_GOAL, c ? COLOUR_GOAL_DASH : GOAL_DASH),
      stroke(bw ? '#000000' : gr ? grey(0.3) : ACCENT, W_GOAL, SOLID, 'target', bw ? '#000000' : gr ? grey(0.3) : ACCENT)],
    construction: stroke(bw ? '#000000' : gr ? grey(0.5) : INK_3, W_CONSTRUCTION, CONSTRUCTION_DASH),
    solution: stroke(k, W_GOAL, SOLID, 'cross'),
    trace: stroke(bw ? '#000000' : gr ? grey(0.22) : C_TRACE, W_TRACE),
    marker: stroke(bw ? '#000000' : gr ? grey(0.22) : C_MARKER, W_MARK, SOLID, 'triangle', bw ? '#000000' : gr ? grey(0.22) : C_MARKER),
    ink: {
      grid: bw ? '#000000' : gr ? grey(0.25) : '#4a4741',
      gridY: bw ? '#000000' : gr ? grey(0.25) : ACCENT,
      scale: bw ? '#000000' : gr ? grey(0.4) : '#7a766d',
      text: k,
    },
  };
}

/** Mixes #rrggbb with white: t = 0 keeps the colour, 1 is white. */
export function mix(hex: string, t: number): string {
  let out = '#';
  for (let i = 1; i < 7; i += 2) {
    const v = parseInt(hex.slice(i, i + 2), 16);
    out += Math.round(v + (255 - v) * t).toString(16).padStart(2, '0');
  }
  return out;
}

const TABLES = { colour: table('colour'), grey: table('grey'), bw: table('bw') };

/**
 * The stroke of a primitive: role, sub-kind and index (a part's index; for a construction circle the part of the
 * unknown it belongs to, −1 for a circle of no part, −2 for the goal carried back).
 */
export function strokeOf(mode: ColourMode, role: number, sub: number, index: number): Stroke {
  const t = TABLES[mode];
  switch (role) {
    case ROLE_GRID: return t.grid[sub] ?? t.grid[SUB_Z_MINOR];
    case ROLE_SCALE: return t.scale;
    case ROLE_PART: return t.parts[sub === SUB_LOCUS ? SUB_LOCUS : SUB_PATH][((index % PART_STYLES) + PART_STYLES) % PART_STYLES];
    case ROLE_NODE: return t.node;
    case ROLE_GOAL: return t.goal[sub === SUB_TARGET ? 1 : 0];
    case ROLE_CONSTRUCTION:
      // Colour: in the colour of the unknown's part (the goal's colour for the goal carried back), as the page.
      if (mode === 'colour' && index !== -1) return { ...t.construction, colour: index >= 0 ? PART_COLOURS[index % PART_STYLES] : ACCENT };
      return t.construction;
    case ROLE_SOLUTION: return t.solution;
    case ROLE_TRACE: return t.trace;
    case ROLE_MARKER: return t.marker;
  }
  return t.scale;
}

/** The text colour of a role (grid labels of the Y grid with sub SUB_Y_MAJOR). */
export function inkOf(mode: ColourMode, role: number, sub: number): string {
  const t = TABLES[mode].ink;
  if (role === ROLE_GRID) return sub === SUB_Y_MAJOR || sub === SUB_Y_MINOR ? t.gridY : t.grid;
  if (role === ROLE_SCALE) return t.scale;
  return t.text;
}

/** HSL lightness (0…1) of #rrggbb. */
export function lightness(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
}

/** A key of a stroke's b&w distinctions: dash pattern, width and mark. */
export const strokeKey = (s: Stroke): string => `${s.dash.join(',')}|${s.width}|${s.mark}`;
