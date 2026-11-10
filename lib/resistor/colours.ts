// The colour code of IEC 60062:2016: the table, bands to value and value to bands, and colour names as typed.

import { decompose, same } from './eseries';
import { formatOhms, formatTolerance, pow10Text } from './format';

export type Colour = 'none' | 'pink' | 'silver' | 'gold' | 'black' | 'brown' | 'red' | 'orange' | 'yellow' | 'green'
  | 'blue' | 'violet' | 'grey' | 'white';

export interface ColourInfo {
  name: Colour;
  // The two-letter code of IEC 60757.
  code: string;
  // A flat colour for swatches; the drawings of S2 may shade it.
  hex: string;
  digit?: number;
  // The multiplier is 10^exp.
  exp?: number;
  // Tolerance in percent with its letter.
  tolerance?: number;
  toleranceLetter?: string;
  // Temperature coefficient in ppm/K with its letter.
  tcr?: number;
  tcrLetter?: string;
}

export const COLOURS: ColourInfo[] = [
  { name: 'none', code: '', hex: 'transparent', tolerance: 20, toleranceLetter: 'M' },
  { name: 'pink', code: 'PK', hex: '#f2a3c0', exp: -3 },
  { name: 'silver', code: 'SR', hex: '#b8bcc4', exp: -2, tolerance: 10, toleranceLetter: 'K' },
  { name: 'gold', code: 'GD', hex: '#c8a13a', exp: -1, tolerance: 5, toleranceLetter: 'J' },
  { name: 'black', code: 'BK', hex: '#161616', digit: 0, exp: 0, tcr: 250, tcrLetter: 'U' },
  { name: 'brown', code: 'BN', hex: '#7a4a2a', digit: 1, exp: 1, tolerance: 1, toleranceLetter: 'F', tcr: 100, tcrLetter: 'S' },
  { name: 'red', code: 'RD', hex: '#d62f2f', digit: 2, exp: 2, tolerance: 2, toleranceLetter: 'G', tcr: 50, tcrLetter: 'R' },
  { name: 'orange', code: 'OG', hex: '#ee8420', digit: 3, exp: 3, tolerance: 0.05, toleranceLetter: 'W', tcr: 15, tcrLetter: 'P' },
  { name: 'yellow', code: 'YE', hex: '#f2cf1d', digit: 4, exp: 4, tolerance: 0.02, toleranceLetter: 'P', tcr: 25, tcrLetter: 'Q' },
  { name: 'green', code: 'GN', hex: '#2f9a4f', digit: 5, exp: 5, tolerance: 0.5, toleranceLetter: 'D', tcr: 20, tcrLetter: 'Z' },
  { name: 'blue', code: 'BU', hex: '#2c63d2', digit: 6, exp: 6, tolerance: 0.25, toleranceLetter: 'C', tcr: 10, tcrLetter: 'Z' },
  { name: 'violet', code: 'VT', hex: '#8748c4', digit: 7, exp: 7, tolerance: 0.1, toleranceLetter: 'B', tcr: 5, tcrLetter: 'M' },
  { name: 'grey', code: 'GY', hex: '#8b8d90', digit: 8, exp: 8, tolerance: 0.01, toleranceLetter: 'L', tcr: 1, tcrLetter: 'K' },
  { name: 'white', code: 'WH', hex: '#f6f5f1', digit: 9, exp: 9 },
];

const BY_NAME = new Map(COLOURS.map((c) => [c.name, c]));

export function colour(name: Colour): ColourInfo {
  return BY_NAME.get(name);
}

// Failure rate in percent per 1000 h: a fifth band on four-band military parts (unverified, see facts.md).
export const FAILURE_RATE: Partial<Record<Colour, number>> = { brown: 1, red: 0.1, orange: 0.01, yellow: 0.001 };

export type BandRole = 'digit' | 'multiplier' | 'tolerance' | 'tcr' | 'failure';

export interface Band {
  colour: Colour;
  role: BandRole;
  // What the band says: "4", "× 100", "±5 %", "50 ppm/K".
  meaning: string;
}

export interface BandCode {
  ok: true;
  ohms: number;
  // Percent; 20 for three bands.
  tolerance?: number;
  // ppm/K, from a sixth band.
  tcr?: number;
  bands: Band[];
  // "47 × 10² Ω"
  formula: string;
  note?: string;
}

export interface BandError {
  ok: false;
  error: string;
}

const cap = (text: string) => text[0].toUpperCase() + text.slice(1);

export function multiplierText(exp: number): string {
  if (exp < 0) return `× ${Number(`1e${exp}`)}`;
  if (exp < 3) return `× ${10 ** exp}`;
  return `× ${10 ** (exp % 3)} ${'kMG'[Math.floor(exp / 3) - 1]}`;
}

function digitBand(c: Colour): Band { return { colour: c, role: 'digit', meaning: String(colour(c).digit) }; }
function multiplierBand(c: Colour): Band { return { colour: c, role: 'multiplier', meaning: multiplierText(colour(c).exp) }; }
function toleranceBand(c: Colour): Band { return { colour: c, role: 'tolerance', meaning: formatTolerance(colour(c).tolerance) }; }
function tcrBand(c: Colour): Band { return { colour: c, role: 'tcr', meaning: `${colour(c).tcr} ppm/K` }; }

function formula(mantissa: number, digits: number, exp: number): string {
  const text = String(mantissa).padStart(digits, '0');
  return exp === 0 ? `${text} Ω` : `${text} × ${pow10Text(exp)} Ω`;
}

// Bands in reading order to a value. One black band is a 0 Ω link; otherwise 3 to 6 bands.
export function decodeBands(colours: Colour[]): BandCode | BandError {
  const n = colours.length;
  if (n === 1 && colours[0] === 'black') {
    return { ok: true, ohms: 0, bands: [{ colour: 'black', role: 'digit', meaning: '0 Ω link' }], formula: '0 Ω' };
  }
  if (n < 3) return { ok: false, error: `${n} band${n === 1 ? '' : 's'} so far: a colour code has 3 to 6 bands (one black band alone is a 0 Ω link).` };
  if (n > 6) return { ok: false, error: `${n} bands: a colour code has at most 6.` };
  const digits = n <= 4 ? 2 : 3;
  const bands: Band[] = [];
  let mantissa = 0;
  for (let i = 0; i < digits; i++) {
    const info = colour(colours[i]);
    if (info.digit === undefined) {
      return {
        ok: false,
        error: i === 0
          ? `${cap(info.name)} cannot be the first band: it has no digit.`
          : `${cap(info.name)} cannot be band ${i + 1} of ${n}: it has no digit.`,
      };
    }
    mantissa = mantissa * 10 + info.digit;
    bands.push(digitBand(info.name));
  }
  if (mantissa === 0) return { ok: false, error: 'Every digit band is black, which is no value: a 0 Ω link has one black band alone.' };
  const mult = colour(colours[digits]);
  if (mult.exp === undefined) return { ok: false, error: `${cap(mult.name)} is not a multiplier.` };
  bands.push(multiplierBand(mult.name));
  const code: BandCode = { ok: true, ohms: Number(`${mantissa}e${mult.exp}`), tolerance: 20, bands, formula: formula(mantissa, digits, mult.exp) };
  if (n >= 4) {
    const tol = colour(colours[digits + 1]);
    if (tol.tolerance === undefined) return { ok: false, error: `${cap(tol.name)} is not a tolerance, so it cannot be band ${digits + 2} of ${n}.` };
    code.tolerance = tol.tolerance;
    bands.push(toleranceBand(tol.name));
    if (tol.name === 'grey') code.note = 'Older EIA tables read a grey tolerance band as ±0.05 %; IEC 60062:2016 says ±0.01 %. On high-voltage parts grey can also stand for ±10 %.';
    else if (tol.name === 'yellow') code.note = 'A yellow tolerance band is ±0.02 % since IEC 60062:2016; on high-voltage parts it stands for ±5 %, in place of gold.';
    else if (tol.name === 'orange') code.note = 'An orange tolerance band (±0.05 %) dates from IEC 60062:2016 and is missing from many tables.';
  }
  if (n === 6) {
    const tcr = colour(colours[5]);
    if (tcr.tcr === undefined) return { ok: false, error: `${cap(tcr.name)} is not a temperature coefficient, so it cannot be the sixth band.` };
    code.tcr = tcr.tcr;
    bands.push(tcrBand(tcr.name));
  }
  if (mult.name === 'pink' && !code.note) code.note = 'A pink multiplier (× 0.001) dates from IEC 60062:2016 and is missing from many tables.';
  return code;
}

export function toleranceColour(pct: number): Colour | undefined {
  return COLOURS.find((c) => c.tolerance !== undefined && same(c.tolerance, pct))?.name;
}

export function tcrColour(ppm: number): Colour | undefined {
  return COLOURS.find((c) => c.tcr === ppm)?.name;
}

// A value as 3, 4, 5 or 6 bands. Three bands carry no tolerance (±20 %); six need a temperature coefficient.
// The error says why when the value cannot be shown with that many bands.
export function encodeBands(ohms: number, count: 3 | 4 | 5 | 6, tolerancePct = 20, tcr?: number): BandCode | BandError {
  if (!(ohms >= 0) || !Number.isFinite(ohms)) return { ok: false, error: 'Not a resistance.' };
  if (ohms === 0) return { ...(decodeBands(['black']) as BandCode), note: 'A 0 Ω link has a single black band.' };
  const digits = count <= 4 ? 2 : 3;
  let { mantissa, exp, exact } = decompose(ohms, digits);
  // Below the smallest multiplier, a leading zero can still carry the value (0.05 Ω as 05 × 0.01).
  while (exact && exp < -3 && mantissa % 10 === 0) { mantissa /= 10; exp += 1; }
  const many = digits === 2 ? 'two' : 'three';
  if (!exact) return { ok: false, error: `${formatOhms(ohms)} has more than ${many} digits, and ${count} bands hold ${many}.` };
  if (exp < -3) return { ok: false, error: `${formatOhms(ohms)} is too small: the smallest multiplier is × 0.001.` };
  if (exp > 9) return { ok: false, error: `${formatOhms(ohms)} is too large: the largest multiplier is × ${pow10Text(9)}.` };
  const names: Colour[] = String(mantissa).padStart(digits, '0').split('').map((d) => COLOURS.find((c) => c.digit === Number(d)).name);
  names.push(COLOURS.find((c) => c.exp === exp).name);
  let note: string | undefined;
  if (count >= 4) {
    const tol = toleranceColour(tolerancePct);
    if (!tol) return { ok: false, error: `There is no band colour for ${formatTolerance(tolerancePct)}.` };
    if (tol === 'none') {
      if (count > 4) return { ok: false, error: `±20 % has no band colour, and ${count} bands need one.` };
      note = '±20 % is shown by leaving the tolerance band out, so the part has three bands.';
    } else names.push(tol);
  }
  if (count === 6) {
    const t = tcr === undefined ? undefined : tcrColour(tcr);
    if (!t) return { ok: false, error: tcr === undefined ? 'Six bands need a temperature coefficient.' : `There is no band colour for ${tcr} ppm/K.` };
    names.push(t);
  }
  const code = decodeBands(names);
  if (code.ok && note) code.note = note;
  return code;
}

// Names as people type them. Unique beginnings of the full names also work ("yell", "vio").
const ALIASES: Record<string, Colour> = {
  black: 'black', bk: 'black', blk: 'black', blck: 'black',
  brown: 'brown', bn: 'brown', brn: 'brown', br: 'brown',
  red: 'red', rd: 'red',
  orange: 'orange', og: 'orange', org: 'orange', orn: 'orange', or: 'orange',
  yellow: 'yellow', ye: 'yellow', yel: 'yellow', yw: 'yellow', ylw: 'yellow',
  green: 'green', gn: 'green', grn: 'green',
  blue: 'blue', bu: 'blue', blu: 'blue',
  violet: 'violet', vt: 'violet', vio: 'violet', vi: 'violet', purple: 'violet', pur: 'violet', ppl: 'violet',
  grey: 'grey', gray: 'grey', gy: 'grey', gry: 'grey',
  white: 'white', wh: 'white', wht: 'white',
  gold: 'gold', gd: 'gold', gld: 'gold', au: 'gold',
  silver: 'silver', sr: 'silver', slv: 'silver', sil: 'silver', ag: 'silver',
  pink: 'pink', pk: 'pink', pnk: 'pink',
};

const FULL_NAMES = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'purple', 'grey', 'gray', 'white', 'gold', 'silver', 'pink'];

// One typed word to a colour, or the reason it is not one.
export function colourFromWord(word: string): Colour | { error: string } {
  const w = word.toLowerCase();
  if (ALIASES[w]) return ALIASES[w];
  const hits = [...new Set(FULL_NAMES.filter((name) => w.length >= 2 && name.startsWith(w)).map((name) => ALIASES[name]))];
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return { error: `“${word}” could be ${hits.join(' or ')}.` };
  return { error: `“${word}” is not a colour of the code.` };
}

// Words separated by spaces, commas, hyphens or slashes to colours.
export function coloursFromText(text: string): { colours: Colour[] } | { error: string } {
  const words = text.split(/[\s,;/\\|\-–—]+/).filter(Boolean);
  const colours: Colour[] = [];
  for (const word of words) {
    const c = colourFromWord(word);
    if (typeof c !== 'string') return c;
    colours.push(c);
  }
  return { colours };
}
