// What the drawing shows: the choices kept in the link (part, band count, body, size, marking system), how they are
// resolved against the current value, the choices of colour for each band, and the reading from the other end.

import {
  AXIAL_BODIES, AxialBody, BODY_COATS, BandCode, BandError, BodyCoat, CHIP_SIZES, COLOURS, ChipSize, Colour, ReadAs, Reading, bandDoubt, bodyCoat,
  colour, decodeBands, decodeMarking, encodeBands, encodeMarkings, flipMarking, formatOhms, formatTolerance, multiplierText, neighbours, otherEndLabel,
  readInput, toleranceColour,
} from '../../lib/resistor';

export type PartType = 'axial' | 'chip';
export type MarkSystem = 'three' | 'four' | 'eia96';
export type BandCount = 3 | 4 | 5 | 6;

export interface View {
  // null follows what was typed: a marking shows a chip, anything else an axial part.
  type: PartType | null;
  // null is four bands, or five when the value needs three digits, or what was typed.
  bands: BandCount | null;
  // Index into AXIAL_BODIES.
  body: number;
  coat: string;
  // Imperial name of the chip size.
  size: string;
  // null is three characters at 2 % and wider, four at 1 % and tighter, or what was typed.
  mark: MarkSystem | null;
  // ppm/K of a sixth band; null is the typed one, or 50.
  tcr: number | null;
}

export const DEFAULT_VIEW: View = { type: null, bands: null, body: 1, coat: 'beige', size: '0805', mark: null, tcr: null };

export const MARK_LABEL: Record<MarkSystem, string> = { three: '3 digits', four: '4 digits', eia96: 'EIA-96' };
const MARK_PARAM: Record<MarkSystem, string> = { three: '3', four: '4', eia96: 'eia96' };

export function viewFromParams(params: URLSearchParams): View {
  const view = { ...DEFAULT_VIEW };
  const part = params.get('part');
  if (part === 'axial' || part === 'chip') view.type = part;
  const bands = Number(params.get('bands'));
  if (bands >= 3 && bands <= 6 && Number.isInteger(bands)) view.bands = bands as BandCount;
  const body = AXIAL_BODIES.findIndex((b) => String(b.power) === params.get('body'));
  if (body >= 0) view.body = body;
  if (BODY_COATS.some((c) => c.id === params.get('coat'))) view.coat = params.get('coat');
  if (CHIP_SIZES.some((c) => c.imperial === params.get('size'))) view.size = params.get('size');
  const mark = (Object.keys(MARK_PARAM) as MarkSystem[]).find((m) => MARK_PARAM[m] === params.get('mark'));
  if (mark) view.mark = mark;
  const tcr = Number(params.get('tcr'));
  if (params.has('tcr') && COLOURS.some((c) => c.tcr === tcr)) view.tcr = tcr;
  return view;
}

export function viewToParams(view: View, params: URLSearchParams): void {
  if (view.type) params.set('part', view.type);
  if (view.bands) params.set('bands', String(view.bands));
  if (view.body !== DEFAULT_VIEW.body) params.set('body', String(AXIAL_BODIES[view.body].power));
  if (view.coat !== DEFAULT_VIEW.coat) params.set('coat', view.coat);
  if (view.size !== DEFAULT_VIEW.size) params.set('size', view.size);
  if (view.mark) params.set('mark', MARK_PARAM[view.mark]);
  if (view.tcr !== null) params.set('tcr', String(view.tcr));
}

// What a click changes: the value, the tolerance, the choices of the drawing, or the text of the field.
export interface Change {
  ohms?: number;
  tolerance?: number;
  view?: Partial<View>;
  text?: string;
  // With a text: what it is meant as, where it could be a value and a marking.
  readAs?: ReadAs;
}

export interface Fix extends Change {
  label: string;
}

export interface Resolved {
  // True before anything is typed: the drawing then shows 4.7 kΩ.
  example: boolean;
  ohms: number;
  tolerance: number;
  type: PartType;
  // Axial: the band count asked for, the code (or why there is none) and its colours in reading order.
  count: BandCount;
  code: BandCode | BandError;
  colours: Colour[];
  tcr: number | undefined;
  body: AxialBody;
  coat: BodyCoat;
  // Chip: the size, the marking system and the marking (undefined when the system cannot show the value).
  chip: ChipSize;
  system: MarkSystem;
  marking: string | undefined;
  markingHow: string | undefined;
  markingWhy: string | undefined;
  // Parts of this size carry no marking.
  unmarked: boolean;
  // Ways out when the value cannot be shown with the chosen band count or marking system.
  fixes: Fix[];
  // For file names: axial-5-band, chip-0603.
  partName: string;
}

const COLOURED_TOLERANCES = COLOURS.filter((c) => c.tolerance !== undefined && c.name !== 'none').map((c) => c.tolerance);

function nearestTolerance(pct: number): number {
  return COLOURED_TOLERANCES.reduce((best, t) => (Math.abs(Math.log(t / pct)) < Math.abs(Math.log(best / pct)) ? t : best));
}

const rounded = (ohms: number, digits: number, low: number, high: number) => Math.min(high, Math.max(low, Number(ohms.toPrecision(digits))));

export function resolveView(view: View, reading: Reading | undefined, text: string, tolerance: number): Resolved {
  const example = reading === undefined;
  const ohms = reading?.ohms ?? 4700;
  const type: PartType = view.type ?? (reading && (reading.kind === 'smd' || reading.kind === 'eia96') ? 'chip' : 'axial');
  const fixes: Fix[] = [];

  // ---- Axial
  const typedTcr = view.tcr ?? reading?.tcr;
  const tcr6 = typedTcr ?? 50;
  const bands = (o: number, n: BandCount, t: number) => (n === 3 ? encodeBands(o, 3) : encodeBands(o, n, t, n === 6 ? tcr6 : undefined));
  const typedCount = reading?.kind === 'bands' && reading.bands?.length >= 3 ? reading.bands.length as BandCount : null;
  const count: BandCount = view.bands ?? typedCount
    ?? (typedTcr !== undefined ? 6 : bands(ohms, 4, tolerance).ok || !bands(ohms, 5, tolerance).ok ? 4 : 5);
  const code = bands(ohms, count, tolerance);
  const colours = code.ok ? code.bands.map((b) => b.colour) : [];
  if (type === 'axial' && code.ok === false) {
    const digits = count <= 4 ? 2 : 3;
    const near = rounded(ohms, digits, 1e-3, digits === 2 ? 99e9 : 999e9);
    const tol = nearestTolerance(tolerance);
    if (near !== ohms && bands(near, count, tolerance).ok) fixes.push({ label: `Use ${formatOhms(near)}`, ohms: near });
    if (count < 5 && bands(ohms, 5, tolerance).ok) fixes.push({ label: 'Use 5 bands', view: { bands: 5 } });
    if (tol !== tolerance && bands(ohms, count, tol).ok) fixes.push({ label: `Use ${formatTolerance(tol)}`, tolerance: tol });
    if (!fixes.length && bands(near, count, tol).ok) fixes.push({ label: `Use ${formatOhms(near)} at ${formatTolerance(tol)}`, ohms: near, tolerance: tol });
  }

  // ---- Chip
  const chip = CHIP_SIZES.find((c) => c.imperial === view.size) ?? CHIP_SIZES.find((c) => c.imperial === DEFAULT_VIEW.size);
  const m = encodeMarkings(ohms);
  const typed = text.trim().toUpperCase();
  const byTolerance: MarkSystem[] = tolerance <= 1 ? ['four', 'three', 'eia96'] : ['three', 'four', 'eia96'];
  const system: MarkSystem = view.mark
    ?? (reading?.kind === 'eia96' ? 'eia96' : null)
    ?? (reading?.kind === 'smd' ? (['four', 'three'] as MarkSystem[]).find((s) => m[s] && typed.startsWith(m[s])) : null)
    ?? byTolerance.find((s) => m[s]) ?? byTolerance[0];
  const marking = m[system];
  if (type === 'chip' && !marking) {
    const near = system === 'eia96' ? neighbours(ohms, 'E96')?.nearest : rounded(ohms, system === 'three' ? 2 : 3, 0, Infinity);
    if (near !== undefined && near !== ohms && encodeMarkings(near)[system]) fixes.push({ label: `Use ${formatOhms(near)}`, ohms: near });
    for (const other of ['three', 'four', 'eia96'] as MarkSystem[]) {
      if (other !== system && m[other]) fixes.push({ label: `Use ${MARK_LABEL[other]}`, view: { mark: other } });
    }
  }

  return {
    example,
    ohms,
    tolerance,
    type,
    count,
    code,
    colours,
    tcr: count === 6 ? tcr6 : typedTcr,
    body: AXIAL_BODIES[view.body] ?? AXIAL_BODIES[1],
    coat: bodyCoat(view.coat),
    chip,
    system,
    marking,
    markingHow: m.how[system],
    markingWhy: m.why[system],
    unmarked: chip.marked === 'no' || chip.marked === 'rarely',
    fixes,
    partName: type === 'axial' ? `axial-${colours.length || count}-band` : `chip-${chip.imperial}`,
  };
}

export interface BandOption {
  colour: Colour;
  // What the colour means in this position: "4", "× 100", "±5 %", "50 ppm/K".
  meaning: string;
  current: boolean;
  // Why the colour cannot be chosen here.
  disabled?: string;
  change?: Change;
}

const sameCode = (code: BandCode | BandError, colours: Colour[]) => code.ok && code.bands.map((b) => b.colour).join() === colours.join();

// The colours allowed for one band, each with its meaning there and what choosing it does.
export function bandOptions(r: Resolved, index: number): BandOption[] {
  const n = r.colours.length;
  if (r.code.ok === false || n < 3 || !r.code.bands[index]) return [];
  const role = r.code.bands[index].role;
  const allowed = COLOURS.filter((c) => (role === 'digit' ? c.digit !== undefined
    : role === 'multiplier' ? c.exp !== undefined
      : role === 'tolerance' ? c.tolerance !== undefined && (c.name !== 'none' || n === 4)
        : c.tcr !== undefined));
  if (role === 'tolerance') allowed.sort((a, b) => b.tolerance - a.tolerance);
  if (role === 'tcr') allowed.sort((a, b) => b.tcr - a.tcr);

  return allowed.map((info): BandOption => {
    const meaning = role === 'digit' ? String(info.digit)
      : role === 'multiplier' ? multiplierText(info.exp)
        : role === 'tolerance' ? formatTolerance(info.tolerance)
          : `${info.tcr} ppm/K`;
    const option = { colour: info.name, meaning, current: info.name === r.colours[index] };
    if (info.name === 'none') return { ...option, change: { tolerance: 20, view: { type: 'axial', bands: 3 } } };
    const next = r.colours.slice();
    next[index] = info.name;
    const read = decodeBands(next);
    if (read.ok === false) return { ...option, disabled: read.error };
    const again = n === 3 ? encodeBands(read.ohms, 3) : encodeBands(read.ohms, n as BandCount, read.tolerance, read.tcr);
    if (!sameCode(again, next)) {
      return { ...option, disabled: `That would be ${formatOhms(read.ohms)}, which is written ${again.ok ? again.bands.map((b) => b.colour).join(', ') : 'otherwise'}.` };
    }
    return { ...option, change: { ohms: read.ohms, tolerance: n === 3 ? 20 : read.tolerance, view: { type: 'axial', bands: n as BandCount, tcr: read.tcr ?? null } } };
  });
}

export interface OtherEnd {
  // What the part reads from the other end, as text: "120 Ω ±1 %", or why it is no code.
  ok: boolean;
  text: string;
  ohms?: number;
  change?: Change;
  // Why the reading as it is, and the one from the other end, is unusual for a resistor, if it is.
  givenDoubt?: string;
  doubt?: string;
  // Set when only one of the two directions is plausible.
  likely?: 'more likely' | 'unlikely';
}

// The bands read from the other end. A code read backwards is only offered when it is a code as it would be written.
export function otherEnd(r: Resolved): OtherEnd | null {
  const n = r.colours.length;
  if (n < 3) return null;
  const turned = r.colours.slice().reverse();
  const read = decodeBands(turned);
  if (read.ok === false) return { ok: false, text: read.error };
  const again = n === 3 ? encodeBands(read.ohms, 3) : encodeBands(read.ohms, n as BandCount, read.tolerance, read.tcr);
  if (!sameCode(again, turned)) return { ok: false, text: 'A code does not start with a black band that could be left out.' };
  const givenDoubt = r.code.ok ? bandDoubt(r.code.ohms, r.code.tolerance, r.colours) : undefined;
  const doubt = bandDoubt(read.ohms, read.tolerance, turned);
  return {
    ok: true,
    text: `${formatOhms(read.ohms)}${n >= 4 ? ` ${formatTolerance(read.tolerance)}` : ''}`,
    ohms: read.ohms,
    change: { ohms: read.ohms, tolerance: n === 3 ? 20 : read.tolerance, view: { type: 'axial', bands: n as BandCount, tcr: read.tcr ?? null } },
    givenDoubt,
    doubt,
    likely: otherEndLabel(givenDoubt, doubt),
  };
}

// The digits and the multiplier of the code, with the third digit set, added (on a part with two digits, which
// then has five bands) or, with `digit` null, taken away (four bands). The value keeps its size: 4.7 kΩ with a
// third digit 5 is 4.75 kΩ, and 4.75 kΩ without its third digit is 4.7 kΩ.
export function thirdDigit(r: Resolved, digit: number | null): Change | { error: string } {
  if (r.code.ok === false) return { error: r.code.error };
  const digits = r.code.bands.filter((b) => b.role === 'digit').map((b) => colour(b.colour).digit);
  const multiplier = r.code.bands.find((b) => b.role === 'multiplier');
  if (digits.length < 2 || !multiplier) return { error: 'A link has no digits to change.' };
  const exp = colour(multiplier.colour).exp + (digits.length === 3 ? 1 : 0);
  const tolerance = toleranceHasColour(r.tolerance) && r.colours.length > 3 ? r.tolerance : digit === null ? 5 : 1;
  const ohms = digit === null ? Number(`${digits[0]}${digits[1]}e${exp}`) : Number(`${digits[0]}${digits[1]}${digit}e${exp - 1}`);
  const count: BandCount = digit === null ? 4 : r.colours.length === 6 ? 6 : 5;
  const code = encodeBands(ohms, count, tolerance, count === 6 ? r.tcr : undefined);
  if (code.ok === false) return { error: code.error };
  return { ohms, tolerance: tolerance === r.tolerance ? undefined : tolerance, view: { type: 'axial', bands: count, tcr: count === 6 ? r.tcr ?? null : null } };
}

// What a click on an example of a marking does: the code goes into the field, read as a marking, and the drawing
// shows a chip marked in the system of the example, of a size that carries a marking.
export function markingExample(code: string, r: Resolved): Change {
  const first = readInput(code, 'marking').readings[0];
  const eia = first?.kind === 'eia96';
  const length = code.replace(/[A-Za-z]$/, (letter) => (first?.tolerance !== undefined ? '' : letter)).length;
  let mark: MarkSystem = eia ? 'eia96' : length >= 4 ? 'four' : 'three';
  if (first) {
    const m = encodeMarkings(first.ohms);
    if (!m[mark]) mark = (['three', 'four', 'eia96'] as MarkSystem[]).find((s) => m[s]) ?? mark;
  }
  return { text: code, readAs: 'marking', tolerance: eia ? 1 : undefined, view: { type: 'chip', mark, ...markedSize(r) } };
}

// A size that carries a marking, when the chosen one carries none.
export const markedSize = (r: Resolved): Partial<View> => (r.unmarked ? { size: DEFAULT_VIEW.size } : {});

// A marking turned upside down, when that is a marking too.
export function upsideDown(r: Resolved): { code: string; ohms: number; change: Change } | null {
  if (!r.marking) return null;
  const code = flipMarking(r.marking);
  const read = code ? decodeMarking(code)[0] : undefined;
  if (!read) return null;
  const mark: MarkSystem = read.form === 'eia96' ? 'eia96' : code.length >= 4 ? 'four' : 'three';
  return { code, ohms: read.ohms, change: { ohms: read.ohms, view: { type: 'chip', mark } } };
}

// What typing a marking changes, or why it is none.
export function markingChange(code: string, system: MarkSystem): Change | { error: string } {
  const text = code.trim();
  if (!text) return { error: 'Type a marking, such as 472, 4701, 4R7 or 01C.' };
  const readings = decodeMarking(text);
  if (!readings.length) return { error: `${text.toUpperCase()} is not a marking: use three or four digits, R as the decimal point, or an EIA-96 code such as 01C.` };
  // A text that reads two ways (01C is not one, 47R is) is taken in the system that is chosen.
  const read = readings.find((r) => (r.form === 'eia96') === (system === 'eia96')) ?? readings[0];
  const length = text.replace(/[A-Za-z]$/, (letter) => (read.tolerance !== undefined ? '' : letter)).length;
  const mark: MarkSystem = read.form === 'eia96' ? 'eia96' : length >= 4 ? 'four' : 'three';
  return { ohms: read.ohms, tolerance: read.tolerance, view: { type: 'chip', mark } };
}

export const toleranceHasColour = (pct: number) => { const c = toleranceColour(pct); return c !== undefined && c !== 'none'; };
