// The records of an Altium PCB document as the reader uses them: the fields of each record (as altiumts gives them for
// ASCII and binary files alike) in a map, and the values read from them: lengths in mil (ASCII "4249.4417mil", or a
// bare number, which is mil too) turned into millimetres, angles, flags, the indices of nets, components and polygons
// (65535 or -1: none), text with Altium's encodings, and the contours of regions, polygons and the board shape.
import { angleOf, DEG } from '../geometry';
import { Contour, ContourSeg, Pt } from '../model';

export const MIL = 0.0254;

export interface Rec {
  // RECORD: Pad, Track, Text, Board…
  kind: string;
  // The fields; the first of fields with the same key wins (as altiumts reads them).
  f: Map<string, string>;
  // The binary payload of a primitive, for what altiumts does not decode.
  payload?: Uint8Array;
}

export function fieldMap(fields: { key: string; value: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const { key, value } of fields) if (!m.has(key)) m.set(key, value);
  return m;
}

// Altium writes text that is not plain ASCII as %UTF8%KEY with the UTF-8 bytes as Latin-1 characters.
function utf8Field(raw: string): string {
  const bytes: number[] = [];
  for (const ch of raw) {
    const c = ch.codePointAt(0) ?? 0;
    if (c > 255) return raw;
    bytes.push(c);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    return raw;
  }
}

export function str(r: Rec, key: string): string | undefined {
  const utf8 = r.f.get(`%UTF8%${key}`);
  return utf8 !== undefined ? utf8Field(utf8) : r.f.get(key);
}

// A list of character codes ("66,111,116") as Altium stores wide strings (always) and some names in binary files. A
// name is taken as codes only when it has several and they are printable, so that a pad or net named "1" stays "1".
export function codes(s: string | undefined, always = false): string | undefined {
  if (s === undefined || !/^\d+(,\d+)*$/.test(s) || (!always && !s.includes(','))) return s;
  const list = s.split(',').map(Number);
  if (!always && list.some((c) => c < 32 && c !== 10 && c !== 13)) return s;
  try {
    return String.fromCodePoint(...list);
  } catch {
    return s;
  }
}

// Text as shown: \r and \n each start a line (Altium breaks lines at both), other control characters (as the U+0001
// some exporters write) are left out.
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\r/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '');
}

export function num(r: Rec, key: string, fallback = 0): number {
  const v = r.f.get(key);
  if (v === undefined) return fallback;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : fallback;
}

// A length in millimetres: "12.5mil", "0.3mm", "1in", or a bare number (mil).
export function lengthOf(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const m = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case 'mm':
      return n;
    case 'cm':
      return n * 10;
    case 'in':
    case 'inch':
      return n * 25.4;
    default:
      return n * MIL;
  }
}

export function mm(r: Rec, key: string, fallback = 0): number {
  return lengthOf(r.f.get(key)) ?? fallback;
}

// The first of several keys that the record has, as a length.
export function mmOf(r: Rec, keys: string[], fallback = 0): number {
  for (const k of keys) {
    const v = lengthOf(r.f.get(k));
    if (v !== undefined) return v;
  }
  return fallback;
}

export function bool(r: Rec, key: string, fallback = false): boolean {
  const v = r.f.get(key)?.trim().toUpperCase();
  if (v === 'TRUE' || v === 'T') return true;
  if (v === 'FALSE' || v === 'F') return false;
  return fallback;
}

export function has(r: Rec, key: string): boolean {
  return r.f.has(key);
}

// An index into the nets, components or polygons; undefined for none (65535 in binary files, -1 or missing).
export function index(r: Rec, key: string): number | undefined {
  const v = r.f.get(key);
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < 65535 ? n : undefined;
}

export function point(r: Rec, xKey: string, yKey: string): Pt {
  return { x: mm(r, xKey), y: mm(r, yKey) };
}

// --- Contours ---

// The vertices of a contour: KIND{i} (1: the side from this vertex is an arc around CX, CY with radius R from angle
// SA to EA), VX{i}, VY{i}. The arc runs counter-clockwise from SA to EA when the vertex is at SA, and the other way
// when it is at EA (as KiCad reads them). The list may repeat the first vertex at the end.
export function contourOf(r: Rec, prefix = ''): Contour | null {
  const count = num(r, 'MAINCONTOURVERTEXCOUNT', NaN);
  const pts: { p: Pt; arc?: { c: Pt; r: number; sa: number; ea: number } }[] = [];
  for (let i = 0; i < 100000; i += 1) {
    if (Number.isFinite(count) && i >= count) break;
    const vx = r.f.get(`${prefix}VX${i}`);
    const vy = r.f.get(`${prefix}VY${i}`);
    if (vx === undefined || vy === undefined) break;
    const p = { x: lengthOf(vx) ?? 0, y: lengthOf(vy) ?? 0 };
    const kind = num(r, `${prefix}KIND${i}`, 0);
    const radius = mm(r, `${prefix}R${i}`, 0);
    if (kind === 1 && radius > 0) {
      pts.push({ p, arc: { c: point(r, `${prefix}CX${i}`, `${prefix}CY${i}`), r: radius, sa: num(r, `${prefix}SA${i}`), ea: num(r, `${prefix}EA${i}`) } });
    } else {
      pts.push({ p });
    }
  }
  if (pts.length < 2) return null;
  return buildContour(pts);
}

// Hole contours of a binary region: HOLE{n}COUNT, HOLE{n}VX{j}, HOLE{n}VY{j} (straight sides).
export function holeContours(r: Rec): Contour[] {
  const out: Contour[] = [];
  const holes = num(r, 'HOLECOUNT', 0);
  for (let n = 0; n < holes; n += 1) {
    const count = num(r, `HOLE${n}COUNT`, 0);
    const pts: Pt[] = [];
    for (let j = 0; j < count; j += 1) pts.push({ x: mm(r, `HOLE${n}VX${j}`), y: mm(r, `HOLE${n}VY${j}`) });
    if (pts.length >= 3) out.push({ start: pts[0], segs: [...pts.slice(1).map((to) => ({ to })), { to: pts[0] }] });
  }
  return out;
}

const NEAR = 1e-4;

function near(a: Pt, b: Pt, tol = NEAR): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;
}

function onCircle(c: Pt, r: number, deg: number): Pt {
  return { x: c.x + r * Math.cos(deg * DEG), y: c.y + r * Math.sin(deg * DEG) };
}

function buildContour(pts: { p: Pt; arc?: { c: Pt; r: number; sa: number; ea: number } }[]): Contour | null {
  const segs: ContourSeg[] = [];
  let start: Pt | null = null;
  let last: Pt | null = null;
  const lineTo = (to: Pt) => {
    if (!start) {
      start = to;
      last = to;
      return;
    }
    if (!near(last, to)) segs.push({ to });
    last = to;
  };
  for (const v of pts) {
    if (!v.arc) {
      lineTo(v.p);
      continue;
    }
    const { c, r, sa, ea } = v.arc;
    const a = onCircle(c, r, sa);
    const b = onCircle(c, r, ea);
    // The vertex is at one end of the arc; it runs from there to the other end.
    const fromStart = Math.hypot(a.x - v.p.x, a.y - v.p.y) <= Math.hypot(b.x - v.p.x, b.y - v.p.y);
    const from = fromStart ? a : b;
    const to = fromStart ? b : a;
    let sweep = (((ea - sa) % 360) + 360) % 360;
    if (sweep < 1e-9) sweep = 360;
    lineTo(v.p);
    if (!near(last, from)) segs.push({ to: from });
    last = from;
    if (sweep >= 360 - 1e-9) {
      // A full circle: two halves, so that the contour stays closed.
      const mid = onCircle(c, r, angleOf(c, from) + 180);
      segs.push({ to: mid, arc: { c, ccw: fromStart } }, { to: from, arc: { c, ccw: fromStart } });
    } else {
      segs.push({ to, arc: { c, ccw: fromStart } });
      last = to;
    }
  }
  if (!start) return null;
  if (!near(last, start)) segs.push({ to: start });
  else if (segs.length && !segs[segs.length - 1].arc) segs[segs.length - 1] = { to: start };
  else if (segs.length) segs[segs.length - 1] = { ...segs[segs.length - 1], to: start };
  return segs.length >= 2 ? { start, segs } : null;
}

// A rectangle (fills: two corners and a rotation about the centre) as a contour.
export function rectContour(a: Pt, b: Pt, rotation: number): Contour {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const hw = Math.abs(b.x - a.x) / 2;
  const hh = Math.abs(b.y - a.y) / 2;
  const cos = Math.cos(rotation * DEG);
  const sin = Math.sin(rotation * DEG);
  const corner = (x: number, y: number): Pt => ({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos });
  const pts = [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)];
  return { start: pts[0], segs: [{ to: pts[1] }, { to: pts[2] }, { to: pts[3] }, { to: pts[0] }] };
}
