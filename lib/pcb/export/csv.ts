// BOM and pick-and-place files (CSV) from the components of a design (Board.placements), in the conventions of
// KiCad's position files and of the BOM KiCad made for the owner's own boards:
// - pick-and-place: Designator, Val, Package (the footprint without its library), Mid X, Mid Y, Rotation, Side, in mm
//   with six decimals; Y up as on the board; bottom parts keep their X and the angle the file gives (KiCad does not
//   negate them unless asked); angles from −180 to 180;
// - BOM: one line per value, footprint and part number (MPN, manufacturer, LCSC and the like), with the designators,
//   the quantity and the other fields where the parts of the line agree.
// Parts marked "exclude from position files" or "exclude from BOM" are left out of that file, and DNP parts if asked.
// The files are UTF-8 with a byte order mark (so Excel reads "Ω" and "µ" right), lines end with CR LF, and text is
// quoted with quotes doubled inside (RFC 4180).
import { compareNames } from '../inspect';
import { Board, Placement, Pt } from '../model';
import { shapeBox } from '../outline';

export type PlaceOrigin = 'file' | 'place' | 'board';

export interface AssemblyOptions {
  origin: PlaceOrigin;
  // Leave out parts marked "do not populate".
  leaveOutDnp: boolean;
}

// The origin positions are given from, on the board (Y up); null when the board has none of that kind.
export function originPoint(board: Board, origin: PlaceOrigin): Pt | null {
  if (origin === 'file') return { x: 0, y: 0 };
  if (origin === 'place') return board.design?.placeOrigin ?? null;
  if (!board.outline?.length) return null;
  const box = shapeBox(board.outline);
  return { x: box.minX, y: box.minY };
}

function quote(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

// Numbers as KiCad writes them (%f), without "-0.000000".
function fixed(v: number): string {
  const s = v.toFixed(6);
  return /^-0\.0+$/.test(s) ? s.slice(1) : s;
}

function csv(lines: string[]): Blob {
  return new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
}

const has = (p: Placement, attr: string) => Boolean(p.attrs?.[attr]);

// The angle in (−180, 180], as KiCad writes it.
export function placeAngle(rot: number): number {
  let r = ((rot % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return Math.round(r * 1e9) / 1e9;
}

function packageName(footprint: string | undefined): string {
  if (!footprint) return '';
  const colon = footprint.indexOf(':');
  return colon >= 0 ? footprint.slice(colon + 1) : footprint;
}

export interface LeftOut {
  // Why parts were left out, with how many.
  reasons: [string, number][];
  total: number;
}

function leftOut(counts: Map<string, number>): LeftOut {
  const reasons = [...counts].filter(([, n]) => n > 0);
  return { reasons, total: reasons.reduce((s, [, n]) => s + n, 0) };
}

export interface PlacementFile {
  blob: Blob;
  rows: number;
  leftOut: LeftOut;
}

export function placementCsv(board: Board, o: AssemblyOptions): PlacementFile {
  const origin = originPoint(board, o.origin) ?? { x: 0, y: 0 };
  const counts = new Map<string, number>([['excluded from position files', 0], ['marked DNP', 0]]);
  const parts = board.placements.filter((p) => {
    if (has(p, 'exclude_from_pos_files')) counts.set('excluded from position files', counts.get('excluded from position files') + 1);
    else if (o.leaveOutDnp && has(p, 'dnp')) counts.set('marked DNP', counts.get('marked DNP') + 1);
    else return true;
    return false;
  });
  // KiCad's order: the bottom side first, then by designator.
  const sorted = parts.slice().sort((a, b) => Number(a.side === 'top') - Number(b.side === 'top') || compareNames(a.ref, b.ref, true));
  const lines = ['Designator,Val,Package,Mid X,Mid Y,Rotation,Side'];
  for (const p of sorted) {
    lines.push([
      quote(p.ref), quote(p.value ?? ''), quote(packageName(p.footprint)),
      fixed(p.at.x - origin.x), fixed(p.at.y - origin.y), fixed(placeAngle(p.rot)), p.side,
    ].join(','));
  }
  return { blob: csv(lines), rows: sorted.length, leftOut: leftOut(counts) };
}

// Fields that tell parts apart: a BOM line holds parts that agree on all of them.
const PART_NUMBER = /mpn|part|lcsc|jlc|digi-?key|mouser|farnell|newark|arrow|tme|sku|order|mfr|mfg|manufacturer|supplier|vendor/i;
// Fields the BOM has columns for already.
const BUILT_IN = /^(reference|value|footprint|designator|qty|quantity|comment)$/i;

export interface BomFile {
  blob: Blob;
  lines: number;
  parts: number;
  leftOut: LeftOut;
}

export function bomCsv(board: Board, o: AssemblyOptions): BomFile {
  const counts = new Map<string, number>([['excluded from the BOM', 0], ['marked DNP', 0]]);
  const parts = board.placements.filter((p) => {
    if (has(p, 'exclude_from_bom')) counts.set('excluded from the BOM', counts.get('excluded from the BOM') + 1);
    else if (o.leaveOutDnp && has(p, 'dnp')) counts.set('marked DNP', counts.get('marked DNP') + 1);
    else return true;
    return false;
  });
  // The field columns: every field some part has, the most common first.
  const seen = new Map<string, number>();
  for (const p of parts) {
    for (const [k, v] of Object.entries(p.fields ?? {})) {
      if (BUILT_IN.test(k) || !v) continue;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  const fields = [...seen.keys()].sort((a, b) => seen.get(b) - seen.get(a));
  const identity = fields.filter((k) => PART_NUMBER.test(k));
  const groups = new Map<string, Placement[]>();
  for (const p of parts) {
    const key = [p.value ?? '', p.footprint ?? '', ...identity.map((k) => p.fields?.[k] ?? '')].join('\u0001');
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const rows = [...groups.values()].map((g) => g.slice().sort((a, b) => compareNames(a.ref, b.ref)));
  rows.sort((a, b) => compareNames(a[0].ref, b[0].ref));
  const lines = [['Designator', 'Qty', 'Comment', 'Footprint', ...fields].map(quote).join(',')];
  for (const g of rows) {
    const first = g[0];
    // A field shows when every part of the line has the same value.
    const common = fields.map((k) => {
      const v = first.fields?.[k] ?? '';
      return g.every((p) => (p.fields?.[k] ?? '') === v) ? v : '';
    });
    lines.push([g.map((p) => p.ref).join(','), String(g.length), first.value ?? '', first.footprint ?? '', ...common].map(quote).join(','));
  }
  return { blob: csv(lines), lines: rows.length, parts: parts.length, leftOut: leftOut(counts) };
}
