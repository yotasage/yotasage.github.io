// Series-parallel networks of resistors: a tree whose leaves are resistors and whose groups are in series or in
// parallel. Value, formula, a key that is the same however the network is written, and a layout to draw it from.

import { formatOhms } from './format';

export type Network =
  | { kind: 'r'; ohms: number }
  | { kind: 'series' | 'parallel'; parts: Network[] };

export type GroupKind = 'series' | 'parallel';

export function resistorNet(ohms: number): Network {
  return { kind: 'r', ohms };
}

// A group. A group inside a group of the same kind is taken into it, and a group of one part is that part.
function group(kind: GroupKind, parts: Network[]): Network {
  const flat: Network[] = [];
  for (const part of parts) {
    if (part.kind === kind) flat.push(...part.parts);
    else flat.push(part);
  }
  if (flat.length === 1) return flat[0];
  return { kind, parts: flat };
}

export function seriesNet(parts: Network[]): Network {
  return group('series', parts);
}

export function parallelNet(parts: Network[]): Network {
  return group('parallel', parts);
}

// The resistance: a sum in series, the reciprocal of the sum of reciprocals in parallel.
export function networkValue(net: Network): number {
  if (net.kind === 'r') return net.ohms;
  let sum = 0;
  if (net.kind === 'series') {
    for (const part of net.parts) sum += networkValue(part);
    return sum;
  }
  for (const part of net.parts) sum += 1 / networkValue(part);
  return 1 / sum;
}

// The resistors from left to right, as the formula names them (R1, R2, …).
export function networkLeaves(net: Network): number[] {
  if (net.kind === 'r') return [net.ohms];
  const out: number[] = [];
  for (const part of net.parts) out.push(...networkLeaves(part));
  return out;
}

export interface NetworkStats {
  // Number of resistors.
  parts: number;
  // Number of different values among them.
  distinct: number;
  // 0 for one resistor, 1 for a plain series or parallel group, 2 and 3 for groups inside groups.
  depth: number;
}

function depthOf(net: Network): number {
  if (net.kind === 'r') return 0;
  let deepest = 0;
  for (const part of net.parts) deepest = Math.max(deepest, depthOf(part));
  return deepest + 1;
}

// A value as text that hides the rounding of floating point.
function valueText(ohms: number): string {
  return String(Number(ohms.toPrecision(9)));
}

export function networkStats(net: Network): NetworkStats {
  const leaves = networkLeaves(net);
  return { parts: leaves.length, distinct: new Set(leaves.map(valueText)).size, depth: depthOf(net) };
}

// The same network with its groups flattened and their parts in a fixed order: resistors first, by value, then
// groups by their number of resistors, their value and their key.
export function canonicalNetwork(net: Network): Network {
  if (net.kind === 'r') return net;
  const flat = group(net.kind, net.parts.map(canonicalNetwork));
  if (flat.kind === 'r') return flat;
  const rows = flat.parts.map((part) => ({
    part,
    leaves: part.kind === 'r' ? 0 : networkLeaves(part).length,
    value: networkValue(part),
    key: writeKey(part),
  }));
  rows.sort((a, b) => a.leaves - b.leaves || a.value - b.value || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { kind: flat.kind, parts: rows.map((row) => row.part) };
}

function writeKey(net: Network): string {
  if (net.kind === 'r') return valueText(net.ohms);
  return `${net.kind === 'series' ? 's' : 'p'}(${net.parts.map(writeKey).join(',')})`;
}

// A text that is the same for every way of writing one network: `s(1000,p(2200,3300))`.
export function networkKey(net: Network): string {
  return writeKey(canonicalNetwork(net));
}

export interface FormulaOptions {
  // R1, R2, … in place of the values.
  names?: boolean;
  // How a value is written; `formatOhms` by default.
  write?: (ohms: number) => string;
}

// `1 kΩ + (2.2 kΩ ∥ 3.3 kΩ)`, or `R1 + (R2 ∥ R3)` with names.
export function networkFormula(net: Network, options: FormulaOptions = {}): string {
  const write = options.write ?? ((ohms: number) => formatOhms(ohms));
  let index = 0;
  const text = (node: Network, inner: boolean): string => {
    if (node.kind === 'r') {
      index += 1;
      return options.names ? `R${index}` : write(node.ohms);
    }
    const joined = node.parts.map((part) => text(part, true)).join(node.kind === 'series' ? ' + ' : ' ∥ ');
    return inner ? `(${joined})` : joined;
  };
  return text(net, false);
}

export interface NetworkLayout {
  // The size of the drawing in units: a resistor is 1 long, a row is 1 high.
  width: number;
  height: number;
  // The network is connected at (0, height / 2) and (width, height / 2).
  // A resistor lies on a horizontal line from (x, y) to (x + 1, y); `index` counts from 0 as R1, R2, ….
  resistors: { index: number; ohms: number; x: number; y: number }[];
  // Wires as x1, y1, x2, y2: horizontal leads and the vertical rails of parallel groups.
  wires: [number, number, number, number][];
}

// The room a parallel group keeps on each side for its rails; a rail is in the middle of it.
const RAIL = 0.5;

function sizeOf(net: Network): { w: number; h: number } {
  if (net.kind === 'r') return { w: 1, h: 1 };
  let w = 0;
  let h = 0;
  for (const part of net.parts) {
    const size = sizeOf(part);
    if (net.kind === 'series') {
      w += size.w;
      h = Math.max(h, size.h);
    } else {
      w = Math.max(w, size.w);
      h += size.h;
    }
  }
  return net.kind === 'series' ? { w, h } : { w: w + 2 * RAIL, h };
}

// Where each resistor and wire goes: series parts side by side, parallel parts stacked between two rails. Every
// part is connected at the middle of its left and right edge.
export function networkLayout(net: Network): NetworkLayout {
  const total = sizeOf(net);
  const layout: NetworkLayout = { width: total.w, height: total.h, resistors: [], wires: [] };
  const wire = (x1: number, y1: number, x2: number, y2: number) => {
    if (x1 !== x2 || y1 !== y2) layout.wires.push([x1, y1, x2, y2]);
  };
  // Draws `node` in the box at (x, y) of the given width and of the node's own height.
  const place = (node: Network, x: number, y: number, width: number) => {
    const size = sizeOf(node);
    const middle = y + size.h / 2;
    if (node.kind === 'parallel') {
      const left = x + RAIL / 2;
      const right = x + width - RAIL / 2;
      let top = y;
      let first = middle;
      let last = middle;
      node.parts.forEach((part, i) => {
        const h = sizeOf(part).h;
        const line = top + h / 2;
        if (i === 0) first = line;
        last = line;
        wire(left, line, x + RAIL, line);
        place(part, x + RAIL, top, width - 2 * RAIL);
        wire(x + width - RAIL, line, right, line);
        top += h;
      });
      wire(x, middle, left, middle);
      wire(left, first, left, last);
      wire(right, first, right, last);
      wire(right, middle, x + width, middle);
      return;
    }
    // A resistor or a series group narrower than its box sits in the middle of it, with a lead on each side.
    const margin = (width - size.w) / 2;
    wire(x, middle, x + margin, middle);
    wire(x + margin + size.w, middle, x + width, middle);
    if (node.kind === 'r') {
      layout.resistors.push({ index: layout.resistors.length, ohms: node.ohms, x: x + margin, y: middle });
      return;
    }
    let at = x + margin;
    for (const part of node.parts) {
      const partSize = sizeOf(part);
      place(part, at, middle - partSize.h / 2, partSize.w);
      at += partSize.w;
    }
  };
  place(net, 0, 0, total.w);
  return layout;
}
