// Reads Excellon drill files (NC drill). There is no single standard, so this follows what CAD programs write
// (KiCad, Altium, EAGLE, PADS, OrCAD and others) and Ucamco's XNC specification: the header (M48 … % or M95) with
// METRIC/INCH, LZ/TZ, FMAT, format comments (KiCad's "; FORMAT={2:4/ absolute / inch / …}", Altium's
// ";FILE_FORMAT=2:5"), KiCad's X2 comments ("; #@! TF.FileFunction,Plated,1,6,PTH", "; #@! TA.AperFunction,…") and
// Altium's ";TYPE=PLATED"; tools with their diameters, also defined in the body; drill hits, repeats (R), drilled
// slots (G85), routed paths (G00 to G03 with M15/M16/M17), G90/G91 and ICI, G93 origins, M71/M72 in the body,
// patterns (M25, M01, M02, M08) and coordinates with or without a decimal point.
//
// Reading is done in two steps: the file is read once into a program whose coordinates are kept as written, and the
// program is plotted with a format (units, zeros, digits). A file without a header can then be plotted with several
// formats to find the one that puts the holes on the pads (lib/pcb/load.ts), and the user can correct it.
import { addArc, addPoint, DEG } from './geometry';
import { ArtItem, Box, emptyBox, Pt } from './model';

export type DrillUnits = 'mm' | 'inch';

// Which zeros coordinates without a decimal point leave out: the leading ones (Excellon "TZ": trailing zeros are
// kept) or the trailing ones ("LZ": leading zeros are kept).
export type DrillZeros = 'leading' | 'trailing';

export interface DrillFormat {
  units: DrillUnits;
  zeros: DrillZeros;
  // Digits before and after the decimal point.
  int: number;
  dec: number;
}

// What a file says about its format. `zeros: 'none'` is a file that writes every digit (KiCad's "keep zeros").
export interface StatedFormat {
  units?: DrillUnits;
  zeros?: DrillZeros | 'none';
  int?: number;
  dec?: number;
}

export interface DrillTool {
  // The diameter as written, in the units of the file (or with a format if it has no decimal point).
  d?: string;
  plated?: boolean;
  // X2 aperture function from KiCad's comments, e.g. "Plated,PTH,ViaDrill".
  fn?: string;
}

// A line of the program body. Coordinates are kept as written.
interface Line {
  g: number[];
  m?: number;
  t?: number;
  x?: string;
  y?: string;
  i?: string;
  j?: string;
  a?: string;
  // The end of a drilled slot (G85).
  x2?: string;
  y2?: string;
  r?: number;
  // A unit change in the body (M71, M72, METRIC, INCH).
  units?: DrillUnits;
  // A tool defined in the body (T1C0.5): its number.
  define?: number;
}

export interface DrillProgram {
  stated: StatedFormat;
  // The header said ICI,ON: coordinates are incremental from the start.
  incremental: boolean;
  tools: Map<number, DrillTool>;
  lines: Line[];
  // X2 file attributes from KiCad's comments, with the dot, e.g. '.FileFunction': 'Plated,1,6,PTH'.
  attrs: Record<string, string>;
  // Plating the file states for all holes (X2 file function, or Altium's TYPE comments when all tools agree).
  plated?: boolean;
  hasHeader: boolean;
  // Every coordinate has a decimal point, so only the units matter.
  allDecimal: boolean;
  // The numbers without a decimal point, as written (without sign), to tell which zeros are left out.
  digitSamples: string[];
  hits: number;
  // Whether the file plunges the tool with M15 in routed paths; files that never do cut with every G01.
  usesM15: boolean;
  warnings: string[];
}

export interface PlottedDrill {
  items: ArtItem[];
  bbox: Box;
  // Number of holes and slots.
  holes: number;
  warnings: string[];
}

const INCH = 25.4;

function unitScale(units: DrillUnits): number {
  return units === 'inch' ? INCH : 1;
}

// --- Reading ---

function parseFormatComment(text: string, stated: StatedFormat) {
  // KiCad: "FORMAT={2:4/ absolute / inch / suppress trailing zeros}" or "{-:-/ absolute / metric / decimal}".
  const kicad = /FORMAT\s*=\s*\{\s*([\d-]+)\s*:\s*([\d-]+)\s*\/([^}]*)\}/i.exec(text);
  if (kicad) {
    if (/^\d+$/.test(kicad[1])) stated.int = Number(kicad[1]);
    if (/^\d+$/.test(kicad[2])) stated.dec = Number(kicad[2]);
    const rest = kicad[3].toLowerCase();
    if (/\binch\b/.test(rest)) stated.units = 'inch';
    else if (/\bmetric\b|\bmm\b/.test(rest)) stated.units = 'mm';
    if (/suppress\s+leading/.test(rest)) stated.zeros = 'leading';
    else if (/suppress\s+trailing/.test(rest)) stated.zeros = 'trailing';
    else if (/keep\s+zeros/.test(rest)) stated.zeros = 'none';
    return;
  }
  // Altium: ";FILE_FORMAT=2:5".
  const altium = /FILE_FORMAT\s*=\s*(\d)\s*:\s*(\d)/i.exec(text);
  if (altium) {
    stated.int = Number(altium[1]);
    stated.dec = Number(altium[2]);
  }
}

// "METRIC", "INCH,LZ", "METRIC,TZ,000.000", "INCH,00.0000".
function parseUnitsLine(line: string, stated: StatedFormat): boolean {
  const m = /^(METRIC|INCH)\b(.*)$/i.exec(line);
  if (!m) return false;
  stated.units = m[1].toUpperCase() === 'INCH' ? 'inch' : 'mm';
  for (const part of m[2].split(',').map((s) => s.trim().toUpperCase())) {
    if (part === 'LZ') stated.zeros = 'trailing';
    else if (part === 'TZ') stated.zeros = 'leading';
    else if (/^0*\.0*$/.test(part)) {
      const [a, b] = part.split('.');
      stated.int = a.length;
      stated.dec = b.length;
    }
  }
  return true;
}

// The words of a line: a letter and the number after it, e.g. "X12.5Y-3G85X14Y-3" → X, Y, G, X, Y.
function words(line: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /([A-Z])([+-]?[\d.]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push([m[1], m[2]]);
  return out;
}

function toolDefinition(rest: [string, string][], tool: DrillTool) {
  for (const [letter, value] of rest) if (letter === 'C' && value) tool.d = value;
}

function platingFromFunction(fn: string): boolean | undefined {
  if (/^\s*NonPlated/i.test(fn)) return false;
  if (/^\s*Plated/i.test(fn)) return true;
  return undefined;
}

export function readExcellon(text: string): DrillProgram {
  const stated: StatedFormat = {};
  const tools = new Map<number, DrillTool>();
  const lines: Line[] = [];
  const attrs: Record<string, string> = {};
  const warnings = new Set<string>();
  const warn = (w: string) => {
    if (warnings.size < 30) warnings.add(w);
  };
  let inHeader = false;
  let hasHeader = false;
  let incremental = false;
  // Plating and X2 aperture function for the tools defined next (Altium's TYPE comments, KiCad's TA comments).
  let pendingPlated: boolean | undefined;
  let pendingFn: string | undefined;
  const typeComments = new Set<boolean>();
  let allDecimal = true;
  let anyCoordinate = false;
  let usesM15 = false;
  let hits = 0;
  const digitSamples: string[] = [];
  const noteNumber = (v: string | undefined) => {
    if (v === undefined || v === '') return;
    anyCoordinate = true;
    if (v.includes('.')) return;
    allDecimal = false;
    if (digitSamples.length < 4000) digitSamples.push(v.replace(/^[+-]/, ''));
  };

  const defineTool = (t: number, rest: [string, string][]) => {
    const tool: DrillTool = tools.get(t) ?? {};
    toolDefinition(rest, tool);
    if (pendingFn !== undefined) {
      tool.fn = pendingFn;
      tool.plated = platingFromFunction(pendingFn);
      pendingFn = undefined;
    } else if (pendingPlated !== undefined) {
      tool.plated = pendingPlated;
    }
    tools.set(t, tool);
  };

  for (const raw of text.split(/\r?\n|\r/)) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith(';')) {
      const c = line.slice(1).trim();
      const x2 = /^#@!\s*T([FA])\s*(\.[A-Za-z]+)\s*,(.*)$/.exec(c);
      if (x2) {
        if (x2[1] === 'F') attrs[x2[2]] = x2[3].trim();
        else if (x2[2] === '.AperFunction') pendingFn = x2[3].trim();
        continue;
      }
      const type = /^TYPE\s*=\s*(NON_PLATED|NONPLATED|PLATED|MIXED)/i.exec(c);
      if (type) {
        const t = type[1].toUpperCase();
        pendingPlated = t === 'PLATED' ? true : t === 'MIXED' ? undefined : false;
        if (pendingPlated !== undefined) typeComments.add(pendingPlated);
        continue;
      }
      parseFormatComment(c, stated);
      continue;
    }
    // Comments in brackets, block delete and sequence numbers.
    line = line.replace(/\([^)]*\)/g, '').replace(/^\//, '').trim();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (upper === 'M48') {
      inHeader = true;
      hasHeader = true;
      continue;
    }
    if (upper === '%' || upper === 'M95') {
      inHeader = false;
      continue;
    }
    if (/^(METRIC|INCH)\b/.test(upper)) {
      // Units in the body before any coordinate count as the file's own; later ones switch units.
      if (inHeader || !anyCoordinate || !stated.units) parseUnitsLine(upper, stated);
      else {
        const s: StatedFormat = {};
        parseUnitsLine(upper, s);
        lines.push({ g: [], units: s.units });
      }
      continue;
    }
    if (/^ICI\s*,\s*ON/.test(upper)) {
      incremental = true;
      continue;
    }
    if (/^(FMAT|VER|ICI|DETECT|ATC|BLKD|SBK|SG|TCST|RSB|NCSL|OM48|AFS|CP|RUN|PCB|R,|Z[+-]?\d*$)/.test(upper) || /^[A-Z]{2,},/.test(upper)) continue;
    const ws = words(upper.replace(/^N\d+/, ''));
    if (!ws.length) continue;

    if (inHeader) {
      // Tool definitions and unit codes; anything else in the header is a setting that does not matter here.
      const [first, value] = ws[0];
      if (first === 'T' && value) defineTool(Number(value), ws.slice(1));
      else if (first === 'M' && value === '71') stated.units = 'mm';
      else if (first === 'M' && value === '72') stated.units = 'inch';
      continue;
    }

    const l: Line = { g: [] };
    let afterG85 = false;
    for (let k = 0; k < ws.length; k += 1) {
      const [letter, value] = ws[k];
      switch (letter) {
        case 'G': {
          const g = Number(value);
          l.g.push(g);
          if (g === 85) afterG85 = true;
          break;
        }
        case 'M': {
          const m = Number(value);
          if (m === 71 || m === 72) {
            if (!anyCoordinate && !stated.units) stated.units = m === 71 ? 'mm' : 'inch';
            else l.units = m === 71 ? 'mm' : 'inch';
          } else l.m = m;
          if (m === 15 || m === 14) usesM15 = true;
          break;
        }
        case 'T': {
          const t = Number(value);
          l.t = t;
          // A tool defined in the body: T1C0.5F200S5.
          const rest: [string, string][] = [];
          while (k + 1 < ws.length && 'CFSBHZ'.includes(ws[k + 1][0])) rest.push(ws[(k += 1)]);
          if (rest.some(([c]) => c === 'C')) {
            defineTool(t, rest);
            l.define = t;
          }
          break;
        }
        case 'X':
          if (afterG85) l.x2 = value;
          else l.x = value;
          noteNumber(value);
          break;
        case 'Y':
          if (afterG85) l.y2 = value;
          else l.y = value;
          noteNumber(value);
          break;
        case 'I':
          l.i = value;
          break;
        case 'J':
          l.j = value;
          break;
        case 'A':
          l.a = value;
          break;
        case 'R':
          l.r = Number(value) || 0;
          break;
        case 'F':
        case 'S':
        case 'B':
        case 'H':
        case 'Z':
        case 'N':
        case 'D':
        case 'C':
          // Feed, speed, depth and the like.
          break;
        default:
          warn(`Unknown code "${letter}${value}" in "${line.slice(0, 40)}" was ignored.`);
      }
    }
    if ((l.x !== undefined || l.y !== undefined) && !l.g.some((g) => g <= 3 || g === 93)) hits += l.r || 1;
    lines.push(l);
  }

  // Which plating the file states for all its holes.
  const fn = attrs['.FileFunction'];
  let plated = fn ? platingFromFunction(fn) : undefined;
  if (plated === undefined && typeComments.size === 1) plated = [...typeComments][0];
  // Tools without their own plating take the file's.
  if (plated !== undefined) for (const t of tools.values()) if (t.plated === undefined) t.plated = plated;
  return {
    stated,
    incremental,
    tools,
    lines,
    attrs,
    plated,
    hasHeader,
    allDecimal: anyCoordinate && allDecimal,
    digitSamples,
    hits,
    usesM15,
    warnings: [...warnings],
  };
}

// --- Formats ---

// Whether the file says enough about its format to plot it without guessing.
export function formatComplete(p: DrillProgram): boolean {
  const s = p.stated;
  if (!s.units) return false;
  if (p.allDecimal) return true;
  // Every number written with all the digits the file states (as Altium's ";FILE_FORMAT=2:5" with "INCH").
  if (s.zeros === undefined && s.int !== undefined && s.dec !== undefined && zerosFromDigits(p.digitSamples) === 'none'
    && p.digitSamples.every((d) => d.length === s.int + s.dec)) return true;
  return s.zeros !== undefined && (s.zeros === 'none' || (s.zeros === 'leading' ? s.dec !== undefined : s.int !== undefined));
}

// Which zeros the numbers leave out, from how they are written: numbers of different lengths that start with a zero
// keep their leading zeros, so they leave out trailing ones; numbers that end with a zero keep the trailing ones.
// Null when the numbers do not tell (all of one length, or both kinds).
export function zerosFromDigits(samples: string[]): DrillZeros | 'none' | null {
  if (!samples.length) return null;
  const lengths = new Set(samples.map((s) => s.length));
  if (lengths.size === 1 && samples.length > 3) return 'none';
  let lead = 0;
  let trail = 0;
  for (const s of samples) {
    if (s.length < 2) continue;
    if (s[0] === '0') lead += 1;
    if (s[s.length - 1] === '0') trail += 1;
  }
  if (lead && !trail) return 'trailing';
  if (trail && !lead) return 'leading';
  return null;
}

// The default format for what the file leaves open: 2.4 for inch, 3.3 for millimetres.
export function completeFormat(s: StatedFormat, units: DrillUnits, zeros: DrillZeros): DrillFormat {
  return {
    units,
    zeros,
    int: s.int ?? (units === 'inch' ? 2 : 3),
    dec: s.dec ?? (units === 'inch' ? 4 : 3),
  };
}

// The most likely units from the tool diameters, if they tell: drills are between about 0.1 and 8 mm.
export function unitsFromTools(p: DrillProgram): DrillUnits | null {
  const values = [...p.tools.values()].map((t) => (t.d && t.d.includes('.') ? Number(t.d) : NaN)).filter((v) => v > 0).sort((a, b) => a - b);
  if (!values.length) return null;
  const median = values[Math.floor(values.length / 2)];
  if (median < 0.075) return 'inch';
  if (median > 0.4) return 'mm';
  return null;
}

// The formats worth trying for a file whose format is not complete, the most likely first.
export function candidateFormats(p: DrillProgram): DrillFormat[] {
  const s = p.stated;
  const toolUnits = unitsFromTools(p);
  const units: DrillUnits[] = s.units ? [s.units] : toolUnits ? [toolUnits, toolUnits === 'inch' ? 'mm' : 'inch'] : ['inch', 'mm'];
  const out: DrillFormat[] = [];
  const add = (f: DrillFormat) => {
    if (!out.some((o) => o.units === f.units && o.zeros === f.zeros && o.int === f.int && o.dec === f.dec)) out.push(f);
  };
  if (p.allDecimal) {
    for (const u of units) add(completeFormat(s, u, 'leading'));
    return out;
  }
  const fromDigits = zerosFromDigits(p.digitSamples);
  const statedZeros = s.zeros ?? fromDigits;
  for (const u of units) {
    const base = completeFormat(s, u, 'leading');
    if (statedZeros === 'none') {
      // Every digit is written: only where the decimal point goes is open.
      const width = Math.max(...p.digitSamples.map((d) => d.length), base.int + base.dec);
      const ints = s.int !== undefined ? [s.int] : [base.int, 1, 2, 3, 4, 5].filter((n) => n < width);
      for (const int of ints) add({ units: u, zeros: 'leading', int, dec: width - int });
      continue;
    }
    const zeros: DrillZeros[] = statedZeros ? [statedZeros] : ['trailing', 'leading'];
    for (const z of zeros) {
      if (z === 'leading') {
        const decs = s.dec !== undefined ? [s.dec] : [base.dec, 2, 3, 4, 5, 6];
        for (const dec of decs) add({ units: u, zeros: z, int: s.int ?? base.int, dec });
      } else {
        const ints = s.int !== undefined ? [s.int] : [base.int, 1, 2, 3, 4];
        for (const int of ints) add({ units: u, zeros: z, int, dec: s.dec ?? base.dec });
      }
    }
  }
  return out;
}

// The format the file states, completed with the defaults, without looking at any other file.
export function defaultFormat(p: DrillProgram): DrillFormat {
  return candidateFormats(p)[0] ?? completeFormat(p.stated, p.stated.units ?? 'inch', 'leading');
}

export function formatKey(f: DrillFormat): string {
  return `${f.units}|${f.zeros}|${f.int}|${f.dec}`;
}

// "inch, 2.4, trailing zeros left out".
export function describeFormat(f: DrillFormat, p?: DrillProgram): string {
  if (p?.allDecimal) return `${f.units === 'inch' ? 'inch' : 'mm'}, decimal point`;
  return `${f.units === 'inch' ? 'inch' : 'mm'}, ${f.int}.${f.dec}, ${f.zeros} zeros left out`;
}

// --- Plotting ---

// A number as written, in millimetres.
function makeReader(f: DrillFormat) {
  const decScale = 10 ** f.dec;
  return (raw: string, units: DrillUnits): number => {
    const scale = unitScale(units);
    if (raw.includes('.')) return Number(raw) * scale;
    let s = raw;
    let sign = 1;
    if (s[0] === '-') {
      sign = -1;
      s = s.slice(1);
    } else if (s[0] === '+') s = s.slice(1);
    if (!s) return 0;
    const n = Number(s);
    if (f.zeros === 'trailing') return sign * n * 10 ** (f.int - s.length) * scale;
    return (sign * n * scale) / decScale;
  };
}

// The centre of an arc from a to b with radius r (Excellon's A word): the one that makes the shorter arc in the
// given direction.
function centerFromRadius(a: Pt, b: Pt, r: number, ccw: boolean): Pt | null {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const half = Math.hypot(dx, dy) / 2;
  if (half === 0) return null;
  const h = Math.sqrt(Math.max(0, r * r - half * half));
  // Left of the chord for a counter-clockwise minor arc.
  const nx = -dy / (2 * half);
  const ny = dx / (2 * half);
  return ccw ? { x: mx + nx * h, y: my + ny * h } : { x: mx - nx * h, y: my - ny * h };
}

export interface PlotOptions {
  // Plating of holes whose tool does not say (from the file name, or plated).
  plated: boolean;
  // Stop after this many holes (to score a format quickly).
  maxHoles?: number;
}

export function plotExcellon(p: DrillProgram, format: DrillFormat, options: PlotOptions): PlottedDrill {
  const read = makeReader(format);
  const items: ArtItem[] = [];
  const bbox = emptyBox();
  const warnings = new Set<string>(p.warnings);
  const warn = (w: string) => {
    if (warnings.size < 40) warnings.add(w);
  };
  let units: DrillUnits = format.units;
  let absolute = !p.incremental;
  let x = 0;
  let y = 0;
  let origin = { x: 0, y: 0 };
  let mode: 'drill' | 'rout' = 'drill';
  let interp = 0;
  let down = false;
  let tool: number | null = null;
  let holes = 0;
  // Patterns: the items of the pattern being recorded, or of the last one.
  let patternStart: number | null = null;
  let pattern: ArtItem[] = [];
  const diameters = new Map<number, number>();
  const missing = new Set<number>();

  const diameter = (t: number | null): number => {
    if (t === null) return 0;
    let d = diameters.get(t);
    if (d !== undefined) return d;
    const def = p.tools.get(t) ?? (t > 100 ? p.tools.get(Math.floor(t / 100)) : undefined);
    if (def?.d) d = read(def.d, units);
    if (!(d > 0)) {
      if (!missing.has(t)) {
        missing.add(t);
        warn(`Tool T${t} has no diameter in the file; its holes are shown 0.5 mm wide.`);
      }
      d = 0.5;
    }
    diameters.set(t, d);
    return d;
  };
  const platedOf = (t: number | null): boolean => (t !== null ? p.tools.get(t)?.plated : undefined) ?? options.plated;
  const coord = (raw: string | undefined, axis: 'x' | 'y', base: number): number => {
    if (raw === undefined || raw === '') return base;
    const v = read(raw, units);
    if (absolute) return v + (axis === 'x' ? origin.x : origin.y);
    return base + v;
  };
  const push = (item: ArtItem) => {
    items.push(item);
    if (item.k === 'hole') {
      addPoint(bbox, item.at.x, item.at.y, item.d / 2);
      if (item.to) addPoint(bbox, item.to.x, item.to.y, item.d / 2);
    } else if (item.k === 'arc') {
      addArc(bbox, item.c, item.r, item.start, item.sweep, item.w);
    }
    holes += 1;
  };
  const hit = (hx: number, hy: number) => {
    if (tool === null) {
      warn('Holes before any tool was selected were left out.');
      return;
    }
    push({ k: 'hole', at: { x: hx, y: hy }, d: diameter(tool), plated: platedOf(tool), dark: true });
  };

  for (const l of p.lines) {
    if (options.maxHoles !== undefined && holes >= options.maxHoles) break;
    // Unit changes in the body count only when the format follows the file's units (not a guess or the user's).
    if (l.units && format.units === p.stated.units) {
      units = l.units;
      diameters.clear();
    }
    for (const g of l.g) {
      if (g === 90) absolute = true;
      else if (g === 91) absolute = false;
      else if (g === 5 || g === 81) {
        mode = 'drill';
        down = false;
      } else if (g >= 0 && g <= 3) {
        mode = 'rout';
        interp = g;
        if (g === 0) down = false;
      } else if (g === 93) {
        // G93: a new origin for the coordinates that follow.
        origin = { x: l.x !== undefined ? read(l.x, units) : origin.x, y: l.y !== undefined ? read(l.y, units) : origin.y };
      } else if (g !== 85 && g !== 40 && g !== 41 && g !== 42 && g !== 4 && g !== 7) {
        warn(`G${String(g).padStart(2, '0')} is not supported and was ignored.`);
      }
    }
    if (l.g.includes(93)) continue;
    if (l.t !== undefined) tool = l.t === 0 ? null : l.t;
    if (l.m !== undefined) {
      switch (l.m) {
        case 14:
        case 15:
          down = true;
          break;
        case 16:
        case 17:
          down = false;
          break;
        case 30:
        case 0:
          break;
        case 25:
          patternStart = items.length;
          break;
        case 1:
          if (patternStart !== null) pattern = items.slice(patternStart);
          patternStart = null;
          break;
        case 2: {
          // Repeat the last pattern, moved by X and Y.
          if (patternStart !== null) {
            pattern = items.slice(patternStart);
            patternStart = null;
          }
          const dx = l.x !== undefined ? read(l.x, units) : 0;
          const dy = l.y !== undefined ? read(l.y, units) : 0;
          for (const it of pattern) {
            if (it.k === 'hole') push({ ...it, at: { x: it.at.x + dx, y: it.at.y + dy }, ...(it.to ? { to: { x: it.to.x + dx, y: it.to.y + dy } } : {}) });
            else if (it.k === 'arc') push({ ...it, c: { x: it.c.x + dx, y: it.c.y + dy } });
          }
          continue;
        }
        case 8:
          pattern = [];
          break;
        case 70:
        case 80:
        case 90:
          warn('Mirrored or swapped patterns (M70, M80, M90) are not supported; they are shown unmirrored.');
          break;
        case 97:
        case 98:
          warn('Drilled text (M97, M98) is not shown.');
          break;
        default:
          break;
      }
    }
    const hasXY = l.x !== undefined || l.y !== undefined;
    if (!hasXY) continue;
    if (l.r && mode === 'drill') {
      // R: the last hole is repeated r times, each moved by X and Y (always a spacing, not a position).
      const dx = l.x !== undefined ? read(l.x, units) : 0;
      const dy = l.y !== undefined ? read(l.y, units) : 0;
      for (let n = 0; n < l.r; n += 1) {
        x += dx;
        y += dy;
        hit(x, y);
      }
      continue;
    }
    const nx = coord(l.x, 'x', x);
    const ny = coord(l.y, 'y', y);

    if (l.g.includes(85)) {
      // A drilled slot from (nx, ny) to the second point.
      const ex = l.x2 !== undefined ? (absolute ? read(l.x2, units) + origin.x : nx + read(l.x2, units)) : nx;
      const ey = l.y2 !== undefined ? (absolute ? read(l.y2, units) + origin.y : ny + read(l.y2, units)) : ny;
      if (tool !== null) push({ k: 'hole', at: { x: nx, y: ny }, to: { x: ex, y: ey }, d: diameter(tool), plated: platedOf(tool), dark: true });
      x = ex;
      y = ey;
      continue;
    }

    if (mode === 'rout') {
      const cutting = (down || (!p.usesM15 && interp !== 0)) && interp !== 0 && tool !== null;
      if (cutting && (nx !== x || ny !== y || interp > 1)) {
        const d = diameter(tool);
        if (interp === 1) {
          push({ k: 'hole', at: { x, y }, to: { x: nx, y: ny }, d, plated: platedOf(tool), dark: true });
        } else {
          const ccw = interp === 3;
          let c: Pt | null = null;
          if (l.a !== undefined) c = centerFromRadius({ x, y }, { x: nx, y: ny }, read(l.a, units), ccw);
          else if (l.i !== undefined || l.j !== undefined) c = { x: x + (l.i ? read(l.i, units) : 0), y: y + (l.j ? read(l.j, units) : 0) };
          if (!c) {
            push({ k: 'hole', at: { x, y }, to: { x: nx, y: ny }, d, plated: platedOf(tool), dark: true });
          } else {
            const r = Math.hypot(x - c.x, y - c.y);
            const start = Math.atan2(y - c.y, x - c.x) / DEG;
            let sweep = Math.atan2(ny - c.y, nx - c.x) / DEG - start;
            const closed = Math.abs(nx - x) < 1e-9 && Math.abs(ny - y) < 1e-9;
            if (closed) sweep = ccw ? 360 : -360;
            else if (ccw) {
              while (sweep <= 0) sweep += 360;
            } else {
              while (sweep >= 0) sweep -= 360;
            }
            if (r > 0) push({ k: 'arc', c, r, start, sweep, w: d, dark: true });
          }
        }
      }
      x = nx;
      y = ny;
      continue;
    }

    // Drill mode: a hit.
    x = nx;
    y = ny;
    hit(nx, ny);
  }
  if (patternStart !== null) warn('A pattern (M25) was not closed.');
  return { items, bbox, holes, warnings: [...warnings] };
}

// The plating of the holes of a file from its name, when the file does not say: "NPTH", "NonPlated", "unplated".
export function platedFromName(name: string): boolean | undefined {
  const n = name.toLowerCase();
  if (/(^|[^a-z])(npth|non[-_ ]?plated|unplated|not[-_ ]?plated|nplt)([^a-z]|$)/.test(n) || /[-_.]np[-_.]/.test(n)) return false;
  if (/(^|[^a-z])(pth|plated)([^a-z]|$)/.test(n)) return true;
  return undefined;
}
