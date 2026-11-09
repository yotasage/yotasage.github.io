// Pick-and-place files laid over a Gerber set: recognised by their content, read into a table, and turned into
// Board.placements with a column mapping. Recognised: KiCad's position files (CSV and ASCII .pos), Altium's pick and
// place files (CSV and text, with their preamble; "Center-X(mm)" or "Mid X" in mil), JLCPCB's CPL ("Mid X" with units
// in the values), EAGLE's mount files (mountsmd.ulp: .mnt for the top, .mnb for the bottom, no header) and Fusion 360's
// PnP files (Name, X, Y, Angle, Value, Package; front and back in two files), and any table whose columns can be found
// by name or chosen by hand (designator, X, Y, rotation, side, value, footprint, units).
//
// Placement.rot follows KiCad's convention (lib/pcb/model.ts): EAGLE and Fusion give a bottom part the angle of its
// package before it is mirrored, which is 180° minus KiCad's. Positions can be moved by an offset and, for files that
// write bottom parts with X negated (KiCad's --bottom-negate-x), have X negated back; fitPnp tries units, the board's
// corner as origin and negated X to find the reading that puts the parts on the pads.
import { Box, Layer, Placement, Pt } from './model';
import { nearestPoint, pointIndex } from './points';

export type PnpColumn = 'ref' | 'x' | 'y' | 'rot' | 'side' | 'value' | 'footprint';
export type PnpUnits = 'mm' | 'mil' | 'in';
export type PnpFormatId = 'kicad-csv' | 'kicad-pos' | 'altium' | 'jlc' | 'eagle-mnt' | 'fusion' | 'generic';

export interface PnpTable {
  formatId: PnpFormatId;
  // What the file is, in words.
  format: string;
  // Column names (made up when the file has none).
  header: string[];
  rows: string[][];
  // What the file says about units and the side, if anything.
  units?: PnpUnits;
  side?: 'top' | 'bottom';
  // The columns found by name.
  found: Partial<Record<PnpColumn, number>>;
  // Lines that were not read (comments and the preamble aside).
  skipped: number;
}

export interface PnpMapping {
  columns: Partial<Record<PnpColumn, number>>;
  units: PnpUnits;
  // Where the side comes from: a column, or the whole file is one side.
  side: 'column' | 'top' | 'bottom';
  // Bottom parts' angles as KiCad and Altium write them, or as EAGLE and Fusion do (of the package before mirroring).
  bottomAngles: 'kicad' | 'mirrored';
  // The file writes bottom parts with X negated.
  negateBottomX: boolean;
  // Added to every position (mm), after the units.
  offset: Pt;
}

export const COLUMN_NAMES: Record<PnpColumn, string> = {
  ref: 'Designator',
  x: 'X',
  y: 'Y',
  rot: 'Rotation',
  side: 'Side',
  value: 'Value',
  footprint: 'Footprint',
};

const UNIT_MM: Record<PnpUnits, number> = { mm: 1, mil: 0.0254, in: 25.4 };

// --- Recognising ---

// Column names, without case, spaces and the units in brackets, and what they are; earlier names win.
const NAMES: [PnpColumn, RegExp][] = [
  ['ref', /^(designator|ref|refdes|reference|refdesignator|partdesignator|des)$/],
  ['x', /^(midx|centerx|centrex|posx|x|locationx|xloc|xpos|positionx|mid-x|center-x|centre-x)$/],
  ['y', /^(midy|centery|centrey|posy|y|locationy|yloc|ypos|positiony|mid-y|center-y|centre-y)$/],
  ['rot', /^(rotation|rot|angle|orientation|rotate|rotationdeg)$/],
  ['side', /^(side|layer|tb|topbottom|top\/bottom|mountside|placementside|boardside|pcbside)$/],
  ['value', /^(val|value|comment|partvalue|values)$/],
  ['footprint', /^(package|footprint|pattern|case|pcbfootprint|footprintname|packagename)$/],
];
// Weaker names, used when nothing better is there.
const WEAK: [PnpColumn, RegExp][] = [
  ['ref', /^(name|part|component|comp|partname|item)$/],
  ['x', /^(refx|ref-x|padx|pad-x)$/],
  ['y', /^(refy|ref-y|pady|pad-y)$/],
];

function normalizeName(h: string): { key: string; units?: PnpUnits } {
  const raw = h.trim().replace(/^"|"$/g, '').toLowerCase();
  const u = /[([]\s*(mm|mil|mils|in|inch|inches)\s*[)\]]/.exec(raw);
  const units = u ? unitsOf(u[1]) : undefined;
  const key = raw.replace(/[([][^)\]]*[)\]]/g, '').replace(/[\s_.]/g, '');
  return { key, units };
}

function unitsOf(s: string): PnpUnits | undefined {
  const t = s.toLowerCase();
  if (/^(mm|millimet)/.test(t)) return 'mm';
  if (/^(mil|thou)/.test(t)) return 'mil';
  if (/^(in|inch|")/.test(t)) return 'in';
  return undefined;
}

function findColumns(header: string[]): { found: Partial<Record<PnpColumn, number>>; units?: PnpUnits } {
  const found: Partial<Record<PnpColumn, number>> = {};
  let units: PnpUnits | undefined;
  const keys = header.map(normalizeName);
  for (const list of [NAMES, WEAK]) {
    for (const [col, re] of list) {
      if (found[col] !== undefined) continue;
      const i = keys.findIndex((k, idx) => re.test(k.key) && !Object.values(found).includes(idx));
      if (i >= 0) {
        found[col] = i;
        if ((col === 'x' || col === 'y') && keys[i].units) units = keys[i].units;
      }
    }
  }
  return { found, units };
}

// Splits a line by a delimiter, with quotes (RFC 4180); whitespace when the delimiter is ' '.
function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ' ') return line.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && !field.trim()) {
      quoted = true;
      field = '';
    } else if (c === delimiter) {
      out.push(field.trim());
      field = '';
    } else field += c;
  }
  out.push(field.trim());
  return out;
}

function delimiterOf(line: string): string {
  let best = ' ';
  let bestCount = 0;
  for (const d of [',', ';', '\t']) {
    let count = 0;
    let quoted = false;
    for (const c of line) {
      if (c === '"') quoted = !quoted;
      else if (c === d && !quoted) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

// A number as written in a pick-and-place file: "12.5", "12,5" (with ; as delimiter), "12.5mm", "500mil", "90°".
export function parseNumber(s: string | undefined, decimalComma = false): { v: number; units?: PnpUnits } | null {
  if (s === undefined) return null;
  let t = s.trim().replace(/^"|"$/g, '').replace(/°|deg$/i, '').trim();
  const u = /(mm|mils?|in|inch|")$/i.exec(t);
  const units = u ? unitsOf(u[1]) : undefined;
  if (u) t = t.slice(0, -u[1].length).trim();
  if (decimalComma) t = t.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  return { v: Number(t), units };
}

export function sideOf(s: string | undefined): 'top' | 'bottom' | null {
  const t = (s ?? '').trim().replace(/^"|"$/g, '').toLowerCase().replace(/[\s_-]/g, '');
  if (/^(t|top|toplayer|topside|front|f|component|comp|componentside|1|tl)$/.test(t)) return 'top';
  if (/^(b|bot|bottom|bottomlayer|bottomside|back|solder|solderside|2|bl)$/.test(t)) return 'bottom';
  return null;
}

function sideFromName(name: string): 'top' | 'bottom' | undefined {
  const n = name.toLowerCase();
  if (/\.mnb$/.test(n) || /(^|[^a-z])(back|bottom|bot|bs)([^a-z]|$)/.test(n)) return 'bottom';
  if (/\.mnt$/.test(n) || /(^|[^a-z])(front|top|ts)([^a-z]|$)/.test(n)) return 'top';
  return undefined;
}

// EAGLE's mount files: "name x y angle value package", separated by blanks, no header.
function looksLikeMount(lines: string[]): boolean {
  const data = lines.filter((l) => l.trim()).slice(0, 20);
  if (data.length < 1) return false;
  return data.every((l) => {
    const t = l.trim().split(/\s+/);
    return t.length >= 4 && /^[A-Za-z_$#+\-.[\]/0-9]+$/.test(t[0]) && /[A-Za-z0-9]/.test(t[0]) && [t[1], t[2], t[3]].every((v) => /^[-+]?\d+(\.\d+)?$/.test(v));
  });
}

// The header line of a table: the first of the first lines that has columns for a designator and a position.
function findHeader(lines: string[]): { index: number; delimiter: string; header: string[] } | null {
  for (let i = 0; i < Math.min(lines.length, 80); i += 1) {
    let line = lines[i].trim();
    if (!line) continue;
    // KiCad's ASCII position files put the header in a comment: "# Ref Val Package PosX PosY Rot Side".
    if (/^#\s*ref\b/i.test(line)) line = line.replace(/^#\s*/, '');
    else if (/^[#;]/.test(line)) continue;
    const delimiter = delimiterOf(line);
    const header = splitLine(line, delimiter);
    if (header.length < 3) continue;
    const { found } = findColumns(header);
    if (found.ref !== undefined && found.x !== undefined && found.y !== undefined) return { index: i, delimiter, header };
  }
  return null;
}

export function splitLines(text: string): string[] {
  return text.replace(/^﻿/, '').split(/\r\n|\r|\n/);
}

// What a text file is, if it is a pick-and-place file: its format's name; null otherwise. Cheap enough for detect.ts.
export function pnpFormatName(name: string, text: string): string | null {
  const lines = splitLines(text.slice(0, 20000));
  const head = findHeader(lines);
  if (head) {
    const { found } = findColumns(head.header);
    // A position and a rotation (or a side): a bill of materials has neither.
    if (found.rot === undefined && found.side === undefined) return null;
    return describeFormat(formatOf(head.header, lines, head.index));
  }
  if (/\.(mnt|mnb)$/i.test(name) || looksLikeMount(lines)) return looksLikeMount(lines) ? describeFormat('eagle-mnt') : null;
  return null;
}

function formatOf(header: string[], lines: string[], index: number): PnpFormatId {
  const keys = header.map((h) => normalizeName(h).key).join(',');
  if (/^#/.test(lines[index].trim()) || lines.slice(0, index).some((l) => /^##\s*unit\s*=/i.test(l.trim()))) return 'kicad-pos';
  if (keys === 'ref,val,package,posx,posy,rot,side') return 'kicad-csv';
  if (keys === 'name,x,y,angle,value,package') return 'fusion';
  if (lines.slice(0, index).some((l) => /altium|pick and place locations|units used/i.test(l)) || /(center-?x|centrex).*(center-?y|centrey)/.test(keys) || /^designator,footprint,midx,midy,refx,refy,padx,pady/.test(keys)) return 'altium';
  if (/^designator,midx,midy,layer,rotation/.test(keys) || /^designator,val,package,midx,midy,rotation,side/.test(keys)) return 'jlc';
  return 'generic';
}

const FORMAT_NAMES: Record<PnpFormatId, string> = {
  'kicad-csv': 'KiCad position file (CSV)',
  'kicad-pos': 'KiCad position file (.pos)',
  altium: 'Altium pick and place file',
  jlc: 'Pick-and-place file with JLCPCB\'s columns',
  'eagle-mnt': 'EAGLE mount file (mountsmd.ulp)',
  fusion: 'Fusion 360 pick-and-place file',
  generic: 'Pick-and-place file',
};

export function describeFormat(id: PnpFormatId): string {
  return FORMAT_NAMES[id];
}

// --- Reading ---

export function readPnp(text: string, name: string): PnpTable {
  const lines = splitLines(text);
  const head = findHeader(lines);
  if (!head) {
    // EAGLE's mount files have no header: name, x, y, angle, value, package (a value with blanks in it takes the words
    // between the angle and the last word).
    const rows: string[][] = [];
    let skipped = 0;
    for (const l of lines) {
      if (!l.trim()) continue;
      const t = l.trim().split(/\s+/);
      if (t.length < 4 || ![t[1], t[2], t[3]].every((v) => /^[-+]?\d+(\.\d+)?$/.test(v))) {
        skipped += 1;
        continue;
      }
      rows.push(t.length > 6 ? [t[0], t[1], t[2], t[3], t.slice(4, -1).join(' '), t[t.length - 1]] : t);
    }
    const header = ['Name', 'X', 'Y', 'Angle', 'Value', 'Package'];
    return {
      formatId: 'eagle-mnt', format: describeFormat('eagle-mnt'), header, rows, units: 'mm', side: sideFromName(name) ?? 'top',
      found: { ref: 0, x: 1, y: 2, rot: 3, value: 4, footprint: 5 }, skipped,
    };
  }
  const formatId = formatOf(head.header, lines, head.index);
  const { found, units: headerUnits } = findColumns(head.header);
  // Units from the preamble (Altium's "Units used: mm", KiCad's "## Unit = mm, Angle = deg."), the header, the values.
  let units = headerUnits;
  for (const l of lines.slice(0, head.index)) {
    const m = /units?\s*(?:used)?\s*[:=]\s*(mm|mils?|inch(?:es)?|in)\b/i.exec(l);
    if (m) units = unitsOf(m[1]) ?? units;
  }
  const decimalComma = head.delimiter === ';';
  const rows: string[][] = [];
  let skipped = 0;
  const need = Math.max(found.ref, found.x, found.y);
  for (const l of lines.slice(head.index + 1)) {
    const t = l.trim();
    if (!t || /^[#;]/.test(t) || /^##\s*end/i.test(t)) continue;
    const cells = splitLine(t, head.delimiter);
    if (cells.length <= need || !parseNumber(cells[found.x], decimalComma) || !parseNumber(cells[found.y], decimalComma)) {
      skipped += 1;
      continue;
    }
    rows.push(cells);
  }
  if (!units) {
    for (const r of rows.slice(0, 20)) {
      const u = parseNumber(r[found.x], decimalComma)?.units;
      if (u) {
        units = u;
        break;
      }
    }
  }
  const side = found.side === undefined ? sideFromName(name) : undefined;
  return { formatId, format: describeFormat(formatId), header: head.header.map((h) => h.replace(/^"|"$/g, '')), rows, units, side, found, skipped };
}

// The mapping the file suggests: its columns, its units (mm if it does not say), its side, its angle convention.
export function defaultMapping(t: PnpTable): PnpMapping {
  return {
    columns: { ...t.found },
    units: t.units ?? 'mm',
    side: t.found.side !== undefined ? 'column' : t.side ?? 'top',
    bottomAngles: t.formatId === 'eagle-mnt' || t.formatId === 'fusion' ? 'mirrored' : 'kicad',
    negateBottomX: false,
    offset: { x: 0, y: 0 },
  };
}

export interface PnpResult {
  placements: Placement[];
  // Rows without a designator or a readable position.
  skipped: number;
}

export function pnpPlacements(t: PnpTable, m: PnpMapping, file: string): PnpResult {
  const c = m.columns;
  const decimalComma = t.rows.length > 0 && t.rows.some((r) => /^-?\d+,\d+$/.test(r[c.x ?? 0] ?? ''));
  const scale = UNIT_MM[m.units];
  const placements: Placement[] = [];
  let skipped = 0;
  for (const r of t.rows) {
    const ref = c.ref !== undefined ? (r[c.ref] ?? '').trim() : '';
    const px = parseNumber(r[c.x], decimalComma);
    const py = parseNumber(r[c.y], decimalComma);
    if (!ref || !px || !py) {
      skipped += 1;
      continue;
    }
    const side = m.side === 'column' ? sideOf(r[c.side]) ?? 'top' : m.side;
    const rotText = c.rot !== undefined ? r[c.rot] : undefined;
    const fileRot = parseNumber(rotText)?.v ?? 0;
    // Each value in the file's units unless it carries its own ("12.5mm").
    const mmOf = (p: { v: number; units?: PnpUnits }) => p.v * (p.units ? UNIT_MM[p.units] : scale);
    let x = mmOf(px);
    const y = mmOf(py);
    if (side === 'bottom' && m.negateBottomX) x = -x;
    const rot = side === 'bottom' && m.bottomAngles === 'mirrored' ? 180 - fileRot : fileRot;
    const fields: Record<string, string> = { File: file, 'Position in the file': `${r[c.x]}, ${r[c.y]}` };
    if (rotText !== undefined) fields['Rotation in the file'] = rotText;
    placements.push({
      ref,
      ...(c.value !== undefined && r[c.value] ? { value: r[c.value] } : {}),
      ...(c.footprint !== undefined && r[c.footprint] ? { footprint: r[c.footprint] } : {}),
      at: { x: x + m.offset.x, y: y + m.offset.y },
      rot: ((rot % 360) + 360) % 360,
      side,
      fields,
    });
  }
  return { placements, skipped };
}

// --- Fitting to the board ---

export interface PnpFit {
  mapping: PnpMapping;
  // Share of the parts with a pad or hole centre near them on the copper of their side (undefined without copper).
  onPads?: number;
  // In words, what differs from the file's own reading, and the share of parts on pads with the file's own reading.
  change?: string;
  fileOnPads?: number;
}

// How near (mm) a pad centre must be to a part's position for the part to count as on its pads.
const NEAR = 2.5;

// The share of parts near a pad centre of their side's outer copper (or any copper). Each pad counts for one part
// only, so a reading that crowds the parts together (wrong units) does not score by landing them all on a few pads.
export function pnpScore(placements: Placement[], layers: Layer[]): number | undefined {
  const copper = layers.filter((l) => l.kind === 'copper');
  if (!copper.length || !placements.length) return undefined;
  const top = copper.filter((l) => l.side === 'top');
  const bottom = copper.filter((l) => l.side === 'bottom');
  const index = { top: (top.length ? top : copper).map(pointIndex), bottom: (bottom.length ? bottom : copper).map(pointIndex) };
  const used = new Set<string>();
  for (const p of placements) {
    const hit = nearestPoint(index[p.side], p.at, NEAR);
    if (hit) used.add(`${p.side}|${Math.round(hit.p.x * 1000)}|${Math.round(hit.p.y * 1000)}`);
  }
  return used.size / placements.length;
}

// Tries the units (when the file does not say), the board's bottom-left corner as the origin and bottom X negated,
// and keeps the reading that puts the most parts on pads; the file's own reading wins unless another is clearly better.
export function fitPnp(t: PnpTable, base: PnpMapping, layers: Layer[], board: Box | null, file: string): PnpFit {
  const score = (m: PnpMapping) => pnpScore(pnpPlacements(t, m, file).placements, layers);
  const own = score(base);
  if (own === undefined) return { mapping: base, onPads: undefined };
  const units: PnpUnits[] = t.units ? [t.units] : ['mm', 'mil', 'in'];
  const offsets: Pt[] = [{ x: 0, y: 0 }];
  if (board) offsets.push({ x: board.minX, y: board.minY });
  const hasBottom = pnpPlacements(t, base, file).placements.some((p) => p.side === 'bottom');
  let best = { mapping: base, onPads: own };
  for (const u of units) {
    for (const off of offsets) {
      for (const neg of hasBottom ? [false, true] : [false]) {
        const m: PnpMapping = { ...base, units: u, offset: off, negateBottomX: neg };
        if (m.units === base.units && m.offset.x === base.offset.x && m.offset.y === base.offset.y && m.negateBottomX === base.negateBottomX) continue;
        const s = score(m);
        if (s !== undefined && s > best.onPads) best = { mapping: m, onPads: s };
      }
    }
  }
  // Another reading must put at least half the parts on pads, and 15 % more than the file's own.
  if (best.mapping === base || !(best.onPads >= 0.5 && best.onPads - own >= 0.15)) return { mapping: base, onPads: own };
  const m = best.mapping;
  const change = [
    m.units !== base.units ? `in ${m.units === 'in' ? 'inches' : m.units}` : '',
    m.offset.x !== base.offset.x || m.offset.y !== base.offset.y ? 'from the bottom-left corner of the board' : '',
    m.negateBottomX !== base.negateBottomX ? 'with the X of bottom parts negated' : '',
  ].filter(Boolean).join(', ');
  return { mapping: m, onPads: best.onPads, change, fileOnPads: own };
}
