// The text of a PADS ASCII board file (PADS Layout, PowerPCB V4.0 and later): the header line with the version, the
// units and the code page, the lines split into sections, numbers in millimetres, the format details that changed
// between versions, and the nested blocks of the *MISC* sections.
//
// Mentor's "PADS Layout ASCII Format Specification" (PADS 9.4) describes the format; the files say more in their
// *REMARK* lines, which list the fields of each record as that version writes them.

export type PadsUnits = 'basic' | 'mils' | 'mm' | 'inches';

// Millimetres per unit. A basic unit is 2/3 nm: 38,100 to the mil.
export const UNIT_MM: Record<PadsUnits, number> = { basic: 0.0254 / 38100, mils: 0.0254, mm: 1, inches: 25.4 };

export interface PadsHeader {
  // POWERPCB, LAYOUT…
  product: string;
  // As written: "4.0", "2007.0", "9.5", "10.0".
  version: string;
  // The version on one scale: 4.0, 5.0, 2005, 2007, then 9.0 as 2009, 9.5 as 2009.5, 10.0 (VX) as 2010.
  era: number;
  units: PadsUnits;
  // 250-layer mode (else 30 layers).
  layers250: boolean;
  // A TextDecoder label for the code page.
  encoding: string;
}

const CODE_PAGES: Record<string, string> = {
  '932': 'shift_jis', '936': 'gbk', '949': 'euc-kr', '950': 'big5', '1250': 'windows-1250', '1251': 'windows-1251',
  '1252': 'windows-1252', '1253': 'windows-1253', '1254': 'windows-1254', '1257': 'windows-1257',
};

// "!PADS-POWERPCB-V4.0-BASIC! DESIGN DATABASE ASCII FILE 1.0", "!PADS-POWERPCB-V10.0-BASIC-250L!",
// "!PADS-POWERPCB-V9.5-MILS-CP932!".
export function readHeader(line: string): PadsHeader | null {
  const m = /^!PADS-([^!]*)!/i.exec(line.trim());
  if (!m) return null;
  const parts = m[1].split('-');
  const v = parts.findIndex((p) => /^V\d/i.test(p));
  if (v < 0) return null;
  const product = parts.slice(0, v).join('-').toUpperCase();
  if (/^LIBRARY/.test(product)) return null;
  const version = parts[v].slice(1);
  const major = parseInt(version, 10);
  const minor = parseFloat(version) - major;
  const era = major >= 2000 ? parseFloat(version) : major >= 9 ? 2000 + major + minor : major + minor;
  let units: PadsUnits = 'basic';
  let layers250 = false;
  let encoding = 'windows-1252';
  for (const p of parts.slice(v + 1)) {
    const u = p.toUpperCase();
    if (u === 'BASIC') units = 'basic';
    else if (u === 'MILS' || u === 'MIL') units = 'mils';
    else if (u === 'METRIC' || u === 'MM') units = 'mm';
    else if (u === 'INCHES' || u === 'INCH' || u === 'IN') units = 'inches';
    else if (u === '250L') layers250 = true;
    else if (/^CP\d+$/.test(u)) encoding = CODE_PAGES[u.slice(2)] ?? encoding;
    else if (/^UTF-?8$/.test(u)) encoding = 'utf-8';
  }
  return { product, version, era, units, layers250, encoding };
}

// The file as text, in its code page.
export function decodePads(bytes: Uint8Array): { text: string; header: PadsHeader } {
  let end = bytes.indexOf(10);
  if (end < 0) end = Math.min(bytes.length, 512);
  let first = '';
  for (let i = 0; i < end; i += 1) first += String.fromCharCode(bytes[i]);
  const header = readHeader(first.replace(/^﻿|^ï»¿/, ''));
  if (!header) throw new Error('This is not a PADS ASCII board file (its first line has no !PADS-…! header).');
  let text: string;
  try {
    text = new TextDecoder(header.encoding).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return { text, header };
}

// How the records of this version are written. The *REMARK* lines name the fields; without them the version decides.
export interface PadsFormat {
  // Texts and labels have a second line with the font style and face (PADS 2005 and later).
  fontLine: boolean;
  // Terminals end with their pin number (PADS 2007 and later); before, they are numbered in order.
  pinNumbers: boolean;
  // Part type headers have a units field after the decals (before PADS 2007).
  partTypeUnits: boolean;
  // Square and rectangular pads have a corner radius field (PADS 9.0 and later).
  cornerRadius: boolean;
  // Pieces of lines and decals have a line style field before the level (PADS 9.4 and later).
  lineStyle: boolean;
  // Lines items have a flags field after the number of pieces (PADS 2007 and later; the REMARK lines do not say).
  linesFlags: boolean;
}

export function formatOf(header: PadsHeader, remarks: string[]): PadsFormat {
  const has = (re: RegExp) => remarks.some((r) => re.test(r));
  const decide = (yes: RegExp, no: RegExp | null, fallback: boolean) => (has(yes) ? true : no && has(no) ? false : fallback);
  return {
    fontLine: decide(/FONTSTYLE/, /^\*REMARK\* XLOC YLOC ORI LEVEL HEIGHT WIDTH MIRRORED HJUST VJUST\s*$/, header.era >= 2005),
    pinNumbers: decide(/NMYLOC PINNUMBER/, /^\*REMARK\* T XLOC YLOC NMXLOC NMYLOC\s*$/, header.era >= 2007),
    partTypeUnits: decide(/DECALNM UNITS/, /DECALNM TYPE/, header.era < 2007),
    cornerRadius: decide(/CORNER ?RADIUS/, /LEVEL SIZE SHAPE IDIA DRILL/, header.era >= 2009),
    lineStyle: decide(/WIDTHH?G?H?T? LINESTYLE/, /CORNERS WIDTHHGHT LEVEL/, header.era >= 2009.4),
    linesFlags: header.era >= 2007,
  };
}

// A section of the file: its name ("PCB", "PARTDECAL"…) and its lines without the *REMARK* comments.
export interface Section {
  name: string;
  // The rest of the section's first line ("GENERAL PARAMETERS OF THE PCB DESIGN").
  title: string;
  lines: string[];
}

const SECTION = /^\*([A-Z][A-Z_]*)\*(?:\s+(.*))?$/;

// Sections that hold records. *SIGNAL* starts a record inside *ROUTE*, *NET* and *CONN*, *GET* calls a library item
// inside *LINES*, and *STANDARD* follows *PART*: none of them starts a section.
const SECTIONS = new Set([
  'PCB', 'REUSE', 'TEXT', 'LINES', 'CLUSTER', 'VIA', 'JUMPER', 'PARTDECAL', 'PARTTYPE', 'PARTTYPES', 'PART', 'NET', 'NETLIST', 'CONN',
  'CONNECTION', 'ROUTE', 'POUR', 'TESTPOINT', 'MISC', 'END', 'NETDEF', 'NETCLASS', 'DIFFPAIR', 'BOARD',
]);

export function splitSections(text: string): { sections: Section[]; remarks: string[] } {
  const sections: Section[] = [];
  const remarks: string[] = [];
  let current: Section | null = null;
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('*REMARK*')) {
      remarks.push(line);
      continue;
    }
    if (line.startsWith('*')) {
      const m = SECTION.exec(line.trimEnd());
      if (m && SECTIONS.has(m[1])) {
        if (m[1] === 'END') break;
        current = { name: m[1], title: m[2] ?? '', lines: [] };
        sections.push(current);
        continue;
      }
    }
    current?.lines.push(line);
  }
  return { sections, remarks };
}

export function tokens(line: string): string[] {
  const t = line.trim();
  return t ? t.split(/\s+/) : [];
}

export function isNumber(s: string | undefined): boolean {
  return s !== undefined && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s);
}

// Reads the lines of a section one after the other, skipping empty lines where a record starts.
export class Lines {
  i = 0;

  constructor(readonly lines: string[]) {}

  get done(): boolean {
    return this.i >= this.lines.length;
  }

  // The next line that is not empty (a record's first line), or null at the end.
  nextRecord(): string | null {
    while (this.i < this.lines.length && !this.lines[this.i].trim()) this.i += 1;
    return this.i < this.lines.length ? this.lines[this.i++] : null;
  }

  peekRecord(): string | null {
    let j = this.i;
    while (j < this.lines.length && !this.lines[j].trim()) j += 1;
    return j < this.lines.length ? this.lines[j] : null;
  }

  // The next line as it is (a record's later lines; text can be empty).
  next(): string {
    return this.i < this.lines.length ? this.lines[this.i++] : '';
  }
}

// --- *MISC* ---

// A line of a *MISC* section ("LAYER 2", "LAYER_NAME Inner Layer 2", "\"TEXT 1\" INPUT RIPPLE") and the block after it.
export interface MiscNode {
  key: string;
  value: string;
  children: MiscNode[];
}

export function parseMisc(sections: Section[]): MiscNode[] {
  const root: MiscNode = { key: '', value: '', children: [] };
  for (const s of sections) {
    const stack: MiscNode[] = [root];
    let last: MiscNode | null = null;
    for (const raw of s.lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line === '{') {
        if (last) stack.push(last);
        continue;
      }
      if (line === '}') {
        if (stack.length > 1) stack.pop();
        last = null;
        continue;
      }
      let key: string;
      let value: string;
      const q = /^"([^"]*)"\s*(.*)$/.exec(line);
      if (q) {
        key = q[1];
        value = q[2];
      } else {
        const sp = line.search(/\s/);
        key = sp < 0 ? line : line.slice(0, sp);
        value = sp < 0 ? '' : line.slice(sp + 1).trim();
      }
      last = { key, value, children: [] };
      stack[stack.length - 1].children.push(last);
    }
  }
  return root.children;
}

export function child(n: MiscNode | undefined, key: string, value?: string): MiscNode | undefined {
  return n?.children.find((c) => c.key === key && (value === undefined || c.value === value));
}
