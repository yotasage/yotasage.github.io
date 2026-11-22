// SI dimensional analysis, unit registry, prefix/compound parsing, smart SI formatting,
// and compatible-unit suggestions for the Smart Calculator engine.
// Framework-free; zero external dependencies; no node:* imports.

/** 7-tuple SI base exponents: [M (kg), L (m), T (s), I (A), Theta (K), N (mol), J (cd)]. */
export type Dim = readonly [
  M: number, L: number, T: number, I: number, Theta: number, N: number, J: number,
];

export type AngleKind = 'rad' | 'deg';
export type LogKind = 'dB' | 'dBm' | 'dBW' | 'dBV' | 'dBuV';
export type TempKind = 'C' | 'F';
export type DataKind = 'data';

export interface UnitSpec {
  symbol: string;
  latex: string;
  dim: Dim;
  /** Factor to convert 1 of this unit to SI base units (or bits for dataKind). */
  scale: number;
  angleKind?: AngleKind;
  logKind?: LogKind;
  tempKind?: TempKind;
  dataKind?: DataKind;
  prefixable?: boolean;
}

export const DIM_ZERO: Dim = [0, 0, 0, 0, 0, 0, 0];
export const DIM_MASS: Dim = [1, 0, 0, 0, 0, 0, 0];
export const DIM_LENGTH: Dim = [0, 1, 0, 0, 0, 0, 0];
export const DIM_TIME: Dim = [0, 0, 1, 0, 0, 0, 0];
export const DIM_CURRENT: Dim = [0, 0, 0, 1, 0, 0, 0];
export const DIM_TEMP: Dim = [0, 0, 0, 0, 1, 0, 0];
export const DIM_AMOUNT: Dim = [0, 0, 0, 0, 0, 1, 0];
export const DIM_LUMINOUS: Dim = [0, 0, 0, 0, 0, 0, 1];
export const DIM_FREQ: Dim = [0, 0, -1, 0, 0, 0, 0];
export const DIM_AREA: Dim = [0, 2, 0, 0, 0, 0, 0];
export const DIM_VOLUME: Dim = [0, 3, 0, 0, 0, 0, 0];
export const DIM_VELOCITY: Dim = [0, 1, -1, 0, 0, 0, 0];
export const DIM_ACCEL: Dim = [0, 1, -2, 0, 0, 0, 0];
export const DIM_FORCE: Dim = [1, 1, -2, 0, 0, 0, 0];
export const DIM_PRESSURE: Dim = [1, -1, -2, 0, 0, 0, 0];
export const DIM_ENERGY: Dim = [1, 2, -2, 0, 0, 0, 0];
export const DIM_POWER: Dim = [1, 2, -3, 0, 0, 0, 0];
export const DIM_CHARGE: Dim = [0, 0, 1, 1, 0, 0, 0];
export const DIM_VOLTAGE: Dim = [1, 2, -3, -1, 0, 0, 0];
export const DIM_CAPACITANCE: Dim = [-1, -2, 4, 2, 0, 0, 0];
export const DIM_RESISTANCE: Dim = [1, 2, -3, -2, 0, 0, 0];
export const DIM_CONDUCTANCE: Dim = [-1, -2, 3, 2, 0, 0, 0];
export const DIM_FLUX: Dim = [1, 2, -2, -1, 0, 0, 0];
export const DIM_FLUX_DENSITY: Dim = [1, 0, -2, -1, 0, 0, 0];
export const DIM_INDUCTANCE: Dim = [1, 2, -2, -2, 0, 0, 0];
export const DIM_PERMITTIVITY: Dim = [-1, -3, 4, 2, 0, 0, 0];
export const DIM_PERMEABILITY: Dim = [1, 1, -2, -2, 0, 0, 0];
export const DIM_EFIELD: Dim = [1, 1, -3, -1, 0, 0, 0];
export const DIM_HFIELD: Dim = [0, -1, 0, 1, 0, 0, 0];
export const DIM_RESISTIVITY: Dim = [1, 3, -3, -2, 0, 0, 0];
export const DIM_CONDUCTIVITY: Dim = [-1, -3, 3, 2, 0, 0, 0];
export const DIM_ENTROPY: Dim = [1, 2, -2, 0, -1, 0, 0];
export const DIM_MOLAR_ENTROPY: Dim = [1, 2, -2, 0, -1, -1, 0];
export const DIM_ACTION: Dim = [1, 2, -1, 0, 0, 0, 0];
export const DIM_INV_AMOUNT: Dim = [0, 0, 0, 0, 0, -1, 0];
export const DIM_DENSITY: Dim = [1, -3, 0, 0, 0, 0, 0];
export const DIM_IRRADIANCE: Dim = [1, 0, -3, 0, 0, 0, 0];

const DIM_EPS = 1e-9;

function cleanExp(x: number): number {
  if (Math.abs(x) < DIM_EPS) return 0;
  const r = Math.round(x);
  return Math.abs(x - r) < DIM_EPS ? r : Math.round(x * 1e6) / 1e6;
}

export function dimEqual(a: Dim, b: Dim): boolean {
  for (let i = 0; i < 7; i++) if (Math.abs(a[i] - b[i]) > DIM_EPS) return false;
  return true;
}

export const dimAdd = (a: Dim, b: Dim): Dim => [
  cleanExp(a[0] + b[0]), cleanExp(a[1] + b[1]), cleanExp(a[2] + b[2]),
  cleanExp(a[3] + b[3]), cleanExp(a[4] + b[4]), cleanExp(a[5] + b[5]), cleanExp(a[6] + b[6]),
];

export const dimSub = (a: Dim, b: Dim): Dim => [
  cleanExp(a[0] - b[0]), cleanExp(a[1] - b[1]), cleanExp(a[2] - b[2]),
  cleanExp(a[3] - b[3]), cleanExp(a[4] - b[4]), cleanExp(a[5] - b[5]), cleanExp(a[6] - b[6]),
];

export const dimScale = (a: Dim, k: number): Dim => [
  cleanExp(a[0] * k), cleanExp(a[1] * k), cleanExp(a[2] * k),
  cleanExp(a[3] * k), cleanExp(a[4] * k), cleanExp(a[5] * k), cleanExp(a[6] * k),
];

export function dimIsZero(a: Dim): boolean {
  for (let i = 0; i < 7; i++) if (Math.abs(a[i]) > DIM_EPS) return false;
  return true;
}

export const dimKey = (a: Dim): string => a.map(cleanExp).join(',');

// ---------------------------------------------------------------------------
// Prefixes & Bare Engineering Multipliers
// ---------------------------------------------------------------------------

interface PrefixDef { symbol: string; latex: string; factor: number; restricted?: boolean }

const pDef = (symbol: string, factor: number, restricted?: boolean): PrefixDef => ({
  symbol,
  latex: symbol === 'µ' ? '\\mu ' : `\\text{${symbol}}`,
  factor,
  restricted,
});

const SI_PREFIX_MAP: Readonly<Record<string, PrefixDef>> = {
  f: pDef('f', 1e-15), p: pDef('p', 1e-12), n: pDef('n', 1e-9),
  u: pDef('µ', 1e-6), 'µ': pDef('µ', 1e-6), 'μ': pDef('µ', 1e-6),
  m: pDef('m', 1e-3), c: pDef('c', 1e-2, true), d: pDef('d', 1e-1, true),
  k: pDef('k', 1e3), M: pDef('M', 1e6), meg: pDef('M', 1e6), Meg: pDef('M', 1e6), MEG: pDef('M', 1e6),
  G: pDef('G', 1e9), T: pDef('T', 1e12), P: pDef('P', 1e15),
};

const BINARY_PREFIX_MAP: Readonly<Record<string, PrefixDef>> = {
  Ki: pDef('Ki', 1024), Mi: pDef('Mi', 1024 ** 2), Gi: pDef('Gi', 1024 ** 3),
  Ti: pDef('Ti', 1024 ** 4), Pi: pDef('Pi', 1024 ** 5),
};

// Bare SI multipliers excluding single-letter units (m, T, s, A, V, F, H, W, J, N, C, K, S, g, h, l, L, b, B).
const BARE_PREFIXES: Readonly<Record<string, number>> = {
  f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6,
  k: 1e3, M: 1e6, meg: 1e6, Meg: 1e6, MEG: 1e6, G: 1e9, P: 1e15,
};

/** Look up a bare SI engineering multiplier (`k`, `M`, `meg`, `G`, `u`/`µ`, `n`, `p`, `f`, `P`). */
export function lookupBarePrefix(token: string): number | null {
  return Object.prototype.hasOwnProperty.call(BARE_PREFIXES, token) ? BARE_PREFIXES[token] : null;
}

// ---------------------------------------------------------------------------
// Base Unit Registry
// ---------------------------------------------------------------------------

interface BaseUnitEntry extends UnitSpec {
  aliases: readonly string[];
  allowRestricted?: boolean;
  allowBinary?: boolean;
}

const u = (
  symbol: string,
  dim: Dim,
  scale: number,
  aliases: readonly string[],
  extra?: Partial<BaseUnitEntry>,
): BaseUnitEntry => ({
  symbol,
  latex: extra?.latex ?? `\\text{${symbol}}`,
  dim,
  scale,
  aliases,
  ...extra,
});

const BASE_UNITS: readonly BaseUnitEntry[] = [
  // Time & frequency
  u('s', DIM_TIME, 1, ['s', 'sec', 'second', 'seconds'], { prefixable: true, allowRestricted: true }),
  u('min', DIM_TIME, 60, ['min', 'minute', 'minutes']),
  u('h', DIM_TIME, 3600, ['h', 'hr', 'hrs', 'hour', 'hours']),
  u('day', DIM_TIME, 86400, ['day', 'days']),
  u('Hz', DIM_FREQ, 1, ['Hz', 'hz', 'HZ'], { prefixable: true }),
  u('rpm', DIM_FREQ, 1 / 60, ['rpm', 'RPM']),
  // Electrical & RF
  u('Ω', DIM_RESISTANCE, 1, ['Ω', 'Ω', 'ohm', 'Ohm', 'OHM', 'ohms', 'Ohms'], { latex: '\\Omega', prefixable: true }),
  u('F', DIM_CAPACITANCE, 1, ['F', 'farad', 'farads'], { prefixable: true }),
  u('H', DIM_INDUCTANCE, 1, ['H', 'henry', 'henries'], { prefixable: true }),
  u('V', DIM_VOLTAGE, 1, ['V', 'volt', 'volts'], { prefixable: true }),
  u('A', DIM_CURRENT, 1, ['A', 'amp', 'amps', 'ampere', 'amperes'], { prefixable: true }),
  u('W', DIM_POWER, 1, ['W', 'watt', 'watts'], { prefixable: true }),
  u('J', DIM_ENERGY, 1, ['J', 'joule', 'joules'], { prefixable: true }),
  u('eV', DIM_ENERGY, 1.602176634e-19, ['eV', 'ev'], { prefixable: true }),
  u('Wh', DIM_ENERGY, 3600, ['Wh'], { prefixable: true }),
  u('C', DIM_CHARGE, 1, ['C', 'coulomb', 'coulombs'], { prefixable: true }),
  u('Ah', DIM_CHARGE, 3600, ['Ah'], { prefixable: true }),
  u('S', DIM_CONDUCTANCE, 1, ['S', 'siemens'], { prefixable: true }),
  u('Wb', DIM_FLUX, 1, ['Wb', 'weber', 'webers'], { prefixable: true }),
  u('T', DIM_FLUX_DENSITY, 1, ['T', 'tesla'], { prefixable: true }),
  // Logarithmic
  u('dB', DIM_ZERO, 1, ['dB', 'db'], { logKind: 'dB' }),
  u('dBm', DIM_ZERO, 1, ['dBm', 'dbm'], { logKind: 'dBm' }),
  u('dBW', DIM_ZERO, 1, ['dBW', 'dbw'], { logKind: 'dBW' }),
  u('dBV', DIM_ZERO, 1, ['dBV', 'dbv'], { logKind: 'dBV' }),
  u('dBµV', DIM_ZERO, 1, ['dBuV', 'dbuv', 'dBµV', 'dBμV'], { latex: '\\text{dB}\\mu\\text{V}', logKind: 'dBuV' }),
  u('Np', DIM_ZERO, 1, ['Np', 'neper']),
  // Length & volume
  u('m', DIM_LENGTH, 1, ['m', 'meter', 'metre', 'meters', 'metres'], { prefixable: true, allowRestricted: true }),
  u('mil', DIM_LENGTH, 2.54e-5, ['mil', 'mils', 'th', 'thou']),
  u('in', DIM_LENGTH, 0.0254, ['in', 'inch', 'inches']),
  u('ft', DIM_LENGTH, 0.3048, ['ft', 'foot', 'feet']),
  u('yd', DIM_LENGTH, 0.9144, ['yd', 'yard', 'yards']),
  u('mi', DIM_LENGTH, 1609.344, ['mi', 'mile', 'miles']),
  u('L', DIM_VOLUME, 1e-3, ['L', 'l', 'liter', 'litre', 'liters', 'litres'], { prefixable: true, allowRestricted: true }),
  // Mass, force, pressure
  u('g', DIM_MASS, 1e-3, ['g', 'gram', 'grams'], { prefixable: true, allowRestricted: true }),
  u('tonne', DIM_MASS, 1000, ['tonne', 'tonnes'], { latex: '\\text{t}' }),
  u('lb', DIM_MASS, 0.45359237, ['lb', 'lbs', 'pound', 'pounds']),
  u('oz', DIM_MASS, 0.028349523125, ['oz', 'ounce', 'ounces']),
  u('N', DIM_FORCE, 1, ['N', 'newton', 'newtons'], { prefixable: true }),
  u('Pa', DIM_PRESSURE, 1, ['Pa', 'pascal', 'pascals'], { prefixable: true }),
  u('bar', DIM_PRESSURE, 1e5, ['bar'], { prefixable: true, allowRestricted: true }),
  u('atm', DIM_PRESSURE, 101325, ['atm']),
  u('psi', DIM_PRESSURE, 6894.757293168361, ['psi']),
  // Temperature, amount, luminous, angle, ratios, data
  u('K', DIM_TEMP, 1, ['K', 'kelvin'], { prefixable: true }),
  u('°C', DIM_TEMP, 1, ['degC', '°C', 'degc'], { latex: '^\\circ\\text{C}', tempKind: 'C' }),
  u('°F', DIM_TEMP, 5 / 9, ['degF', '°F', 'degf'], { latex: '^\\circ\\text{F}', tempKind: 'F' }),
  u('mol', DIM_AMOUNT, 1, ['mol'], { prefixable: true }),
  u('cd', DIM_LUMINOUS, 1, ['cd']),
  u('rad', DIM_ZERO, 1, ['rad', 'radian', 'radians'], { angleKind: 'rad', prefixable: true }),
  u('°', DIM_ZERO, Math.PI / 180, ['deg', '°', 'degree', 'degrees'], { latex: '^\\circ', angleKind: 'deg' }),
  u('%', DIM_ZERO, 1e-2, ['%', 'pct', 'percent'], { latex: '\\%' }),
  u('ppm', DIM_ZERO, 1e-6, ['ppm']),
  u('ppb', DIM_ZERO, 1e-9, ['ppb']),
  u('bit', DIM_ZERO, 1, ['bit', 'bits', 'b'], { dataKind: 'data', prefixable: true, allowBinary: true }),
  u('B', DIM_ZERO, 8, ['B', 'byte', 'bytes'], { dataKind: 'data', prefixable: true, allowBinary: true }),
];

const EXACT_UNIT_MAP = new Map<string, BaseUnitEntry>();
const PREFIXABLE_MAP = new Map<string, BaseUnitEntry>();
for (const entry of BASE_UNITS) {
  for (const alias of entry.aliases) {
    EXACT_UNIT_MAP.set(alias, entry);
    if (entry.prefixable) PREFIXABLE_MAP.set(alias, entry);
  }
}

const toSpec = (e: BaseUnitEntry): UnitSpec => ({
  symbol: e.symbol, latex: e.latex, dim: e.dim, scale: e.scale,
  angleKind: e.angleKind, logKind: e.logKind, tempKind: e.tempKind,
  dataKind: e.dataKind, prefixable: e.prefixable,
});

const makePrefixed = (p: PrefixDef, b: BaseUnitEntry): UnitSpec => ({
  symbol: `${p.symbol}${b.symbol}`, latex: `${p.latex}${b.latex}`,
  dim: b.dim, scale: b.scale * p.factor, angleKind: b.angleKind, dataKind: b.dataKind,
});

/** Look up a single unit token (exact or prefixed: `mm`, `kOhm`, `µm`, `KiB`, `dBm`, `degC`). */
export function parseUnitToken(raw: string): UnitSpec | null {
  const token = raw.trim();
  if (!token) return null;
  const exact = EXACT_UNIT_MAP.get(token);
  if (exact) return toSpec(exact);

  if (token.length >= 3) {
    const bp = BINARY_PREFIX_MAP[token.slice(0, 2)];
    if (bp) {
      const base = PREFIXABLE_MAP.get(token.slice(2));
      if (base?.allowBinary) return makePrefixed(bp, base);
    }
  }
  if (token.length >= 4) {
    const p3 = SI_PREFIX_MAP[token.slice(0, 3)];
    if (p3) {
      const base = PREFIXABLE_MAP.get(token.slice(3));
      if (base) return makePrefixed(p3, base);
    }
  }
  if (token.length >= 2) {
    const p1 = SI_PREFIX_MAP[token[0]];
    if (p1) {
      const base = PREFIXABLE_MAP.get(token.slice(1));
      if (base && (!p1.restricted || base.allowRestricted)) return makePrefixed(p1, base);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Compound Unit Expression Parser (`um^2`, `m/s`, `J/(mol*K)`, `kg*m/s^2`, `pF/mm`)
// ---------------------------------------------------------------------------

const SUP_TO_ASCII: Readonly<Record<string, string>> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-',
};
const ASCII_TO_SUP: Readonly<Record<string, string>> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

function formatSupText(exp: number): string {
  if (exp === 1) return '';
  let out = '';
  for (const c of String(exp)) {
    if (ASCII_TO_SUP[c] === undefined) return `^${exp}`;
    out += ASCII_TO_SUP[c];
  }
  return out;
}

function normalizeUnitExpr(input: string): string {
  let out = '';
  for (let i = 0; i < input.length;) {
    if (SUP_TO_ASCII[input[i]] !== undefined) {
      out += '^';
      while (i < input.length && SUP_TO_ASCII[input[i]] !== undefined) out += SUP_TO_ASCII[input[i++]];
    } else {
      out += input[i++];
    }
  }
  return out.replace(/[·⋅]/g, '*').replace(/[−–]/g, '-').trim();
}

type UTok = { kind: 'id' | 'num' | 'op' | '(' | ')'; text: string };

function tokenizeUnit(src: string): UTok[] | null {
  const out: UTok[] = [];
  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '(' || ch === ')') { out.push({ kind: ch, text: ch }); i++; continue; }
    if (ch === '*' || ch === '/' || ch === '^') { out.push({ kind: 'op', text: ch }); i++; continue; }
    const prev = out[out.length - 1];
    if ((ch === '-' || ch === '+') && prev && (prev.text === '^' || prev.kind === '(')) {
      const s = i++;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      if (i === s + 1) return null;
      out.push({ kind: 'num', text: src.slice(s, i) });
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const s = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      out.push({ kind: 'num', text: src.slice(s, i) });
      continue;
    }
    if (/[A-Za-z%°ΩΩµμ]/.test(ch)) {
      const s = i;
      while (i < src.length && /[A-Za-z%°ΩΩµμ]/.test(src[i])) i++;
      out.push({ kind: 'id', text: src.slice(s, i) });
      continue;
    }
    return null;
  }
  return out;
}

/** Parse a simple or compound unit expression (`um^2`, `m/s`, `J/(mol*K)`, `kg*m/s^2`, `pF/mm`, `dBm`, `°C`). */
export function parseUnitExpr(raw: string): UnitSpec | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const direct = parseUnitToken(trimmed);
  if (direct) return direct;

  const toks = tokenizeUnit(normalizeUnitExpr(trimmed));
  if (!toks || toks.length === 0) return null;
  let pos = 0;

  const parseExp = (): number | null => {
    const grouped = toks[pos]?.kind === '(';
    if (grouped) pos++;
    if (toks[pos]?.kind !== 'num') return null;
    const n = Number(toks[pos++].text);
    if (grouped && toks[pos++]?.kind !== ')') return null;
    return Number.isFinite(n) ? n : null;
  };

  type ParsedNode = { spec: UnitSpec; comp: boolean };

  const parseAtom = (): ParsedNode | null => {
    const t = toks[pos];
    if (!t) return null;
    if (t.kind === '(') {
      pos++;
      const inner = parseProd();
      if (!inner || toks[pos++]?.kind !== ')') return null;
      return inner;
    }
    if (t.kind === 'id') {
      const spec = parseUnitToken(t.text);
      if (!spec) return null;
      pos++;
      return { spec, comp: false };
    }
    if (t.kind === 'num' && t.text === '1') {
      pos++;
      return { spec: { symbol: '1', latex: '1', dim: DIM_ZERO, scale: 1 }, comp: false };
    }
    return null;
  };

  const parsePow = (): ParsedNode | null => {
    const base = parseAtom();
    if (!base) return null;
    if (toks[pos]?.kind === 'op' && toks[pos].text === '^') {
      pos++;
      const exp = parseExp();
      if (exp === null) return null;
      if (exp === 1) return base;
      const b = base.spec;
      return {
        spec: {
          symbol: `${b.symbol}${formatSupText(exp)}`,
          latex: `${b.latex}^{${exp}}`,
          dim: dimScale(b.dim, exp),
          scale: Math.pow(b.scale, exp),
          dataKind: b.dataKind,
        },
        comp: base.comp,
      };
    }
    return base;
  };

  const parseProd = (): ParsedNode | null => {
    let left: ParsedNode | null = parsePow();
    if (!left) return null;
    while (pos < toks.length) {
      const t = toks[pos];
      if (t.kind === 'op' && (t.text === '*' || t.text === '/')) {
        pos++;
        const right: ParsedNode | null = parsePow();
        if (!right) return null;
        const a: UnitSpec = left.spec;
        const b: UnitSpec = right.spec;
        left = t.text === '*'
          ? {
            spec: {
              symbol: `${a.symbol}·${b.symbol}`, latex: `${a.latex}\\cdot ${b.latex}`,
              dim: dimAdd(a.dim, b.dim), scale: a.scale * b.scale, dataKind: a.dataKind ?? b.dataKind,
            },
            comp: true,
          }
          : {
            spec: {
              symbol: `${a.symbol}/${right.comp ? `(${b.symbol})` : b.symbol}`,
              latex: `${a.latex}/${right.comp ? `(${b.latex})` : b.latex}`,
              dim: dimSub(a.dim, b.dim), scale: a.scale / b.scale,
              dataKind: a.dataKind && b.dataKind ? undefined : (a.dataKind ?? b.dataKind),
            },
            comp: true,
          };
      } else if (t.kind === 'id' || t.kind === '(') {
        const right: ParsedNode | null = parsePow();
        if (!right) return null;
        const a: UnitSpec = left.spec;
        const b: UnitSpec = right.spec;
        left = {
          spec: {
            symbol: `${a.symbol}·${b.symbol}`, latex: `${a.latex}\\cdot ${b.latex}`,
            dim: dimAdd(a.dim, b.dim), scale: a.scale * b.scale, dataKind: a.dataKind ?? b.dataKind,
          },
          comp: true,
        };
      } else {
        break;
      }
    }
    return left;
  };

  const res = parseProd();
  return res && pos === toks.length ? res.spec : null;
}

// ---------------------------------------------------------------------------
// Smart SI Auto-Prefixing & Compound Formatting
// ---------------------------------------------------------------------------

interface CanonDef { symbol: string; latex: string; fromSi: number; range: readonly [number, number] | null }

const CANON_ROWS: ReadonlyArray<readonly [Dim, string, string, number, readonly [number, number] | null]> = [
  [DIM_TIME, 's', '\\text{s}', 1, [-15, 0]],
  [DIM_FREQ, 'Hz', '\\text{Hz}', 1, [-3, 15]],
  [DIM_RESISTANCE, 'Ω', '\\Omega', 1, [-6, 12]],
  [DIM_CAPACITANCE, 'F', '\\text{F}', 1, [-15, 0]],
  [DIM_INDUCTANCE, 'H', '\\text{H}', 1, [-12, 3]],
  [DIM_VOLTAGE, 'V', '\\text{V}', 1, [-12, 12]],
  [DIM_CURRENT, 'A', '\\text{A}', 1, [-15, 9]],
  [DIM_POWER, 'W', '\\text{W}', 1, [-15, 12]],
  [DIM_ENERGY, 'J', '\\text{J}', 1, [-15, 12]],
  [DIM_CHARGE, 'C', '\\text{C}', 1, [-15, 6]],
  [DIM_CONDUCTANCE, 'S', '\\text{S}', 1, [-12, 6]],
  [DIM_FLUX, 'Wb', '\\text{Wb}', 1, [-12, 3]],
  [DIM_FLUX_DENSITY, 'T', '\\text{T}', 1, [-12, 3]],
  [DIM_FORCE, 'N', '\\text{N}', 1, [-9, 9]],
  [DIM_PRESSURE, 'Pa', '\\text{Pa}', 1, [-3, 9]],
  [DIM_LENGTH, 'm', '\\text{m}', 1, [-15, 6]],
  [DIM_MASS, 'g', '\\text{g}', 1000, [-12, 3]],
  [DIM_TEMP, 'K', '\\text{K}', 1, null],
  [DIM_AMOUNT, 'mol', '\\text{mol}', 1, [-12, 3]],
  [DIM_LUMINOUS, 'cd', '\\text{cd}', 1, null],
  [DIM_VELOCITY, 'm/s', '\\text{m/s}', 1, null],
  [DIM_ACCEL, 'm/s²', '\\text{m/s}^2', 1, null],
  [DIM_EFIELD, 'V/m', '\\text{V/m}', 1, [-6, 9]],
  [DIM_HFIELD, 'A/m', '\\text{A/m}', 1, [-6, 6]],
  [DIM_RESISTIVITY, 'Ω·m', '\\Omega\\cdot\\text{m}', 1, null],
  [DIM_CONDUCTIVITY, 'S/m', '\\text{S/m}', 1, null],
  [DIM_PERMITTIVITY, 'F/m', '\\text{F/m}', 1, [-15, 0]],
  [DIM_PERMEABILITY, 'H/m', '\\text{H/m}', 1, [-12, 0]],
  [DIM_ENTROPY, 'J/K', '\\text{J/K}', 1, null],
  [DIM_MOLAR_ENTROPY, 'J/(mol·K)', '\\text{J/(mol}\\cdot\\text{K)}', 1, null],
  [DIM_ACTION, 'J·s', '\\text{J}\\cdot\\text{s}', 1, null],
  [DIM_DENSITY, 'kg/m³', '\\text{kg/m}^3', 1, null],
  [DIM_IRRADIANCE, 'W/m²', '\\text{W/m}^2', 1, [-6, 6]],
];

const CANONICAL_SI = new Map<string, CanonDef>(
  CANON_ROWS.map(([d, symbol, latex, fromSi, range]) => [dimKey(d), { symbol, latex, fromSi, range }]),
);

const SI_STEPS = ([
  [15, 'P'], [12, 'T'], [9, 'G'], [6, 'M'], [3, 'k'], [0, ''],
  [-3, 'm'], [-6, 'µ'], [-9, 'n'], [-12, 'p'], [-15, 'f'],
] as const).map(([pow, sym]) => ({
  pow, scale: 10 ** pow, sym, latex: sym === 'µ' ? '\\mu ' : sym ? `\\text{${sym}}` : '',
}));

type StepList = ReadonlyArray<readonly [number, string, string]>;
const AREA_STEPS: StepList = [
  [1e6, 'km²', '\\text{km}^2'], [1, 'm²', '\\text{m}^2'], [1e-4, 'cm²', '\\text{cm}^2'],
  [1e-6, 'mm²', '\\text{mm}^2'], [1e-12, 'µm²', '\\mu\\text{m}^2'], [1e-18, 'nm²', '\\text{nm}^2'],
];
const VOLUME_STEPS: StepList = [
  [1e9, 'km³', '\\text{km}^3'], [1, 'm³', '\\text{m}^3'], [1e-3, 'L', '\\text{L}'],
  [1e-6, 'cm³', '\\text{cm}^3'], [1e-9, 'mm³', '\\text{mm}^3'], [1e-18, 'µm³', '\\mu\\text{m}^3'],
];
const DATA_STEPS: StepList = [
  [8e12, 'TB', '\\text{TB}'], [8e9, 'GB', '\\text{GB}'], [8e6, 'MB', '\\text{MB}'],
  [8e3, 'kB', '\\text{kB}'], [8, 'B', '\\text{B}'], [1, 'bit', '\\text{bit}'],
];

const BASE_SI_SYMS = ['kg', 'm', 's', 'A', 'K', 'mol', 'cd'] as const;

/** Render any dimension vector directly in unprefixed SI base units (e.g. `kg·m²/s³`). */
export function formatDimBaseSI(dim: Dim): { symbol: string; latex: string } {
  if (dimIsZero(dim)) return { symbol: '', latex: '' };
  const numS: string[] = [], denS: string[] = [], numL: string[] = [], denL: string[] = [];
  for (let i = 0; i < 7; i++) {
    const e = cleanExp(dim[i]);
    if (e === 0) continue;
    const b = BASE_SI_SYMS[i];
    if (e > 0) {
      numS.push(e === 1 ? b : `${b}${formatSupText(e)}`);
      numL.push(e === 1 ? `\\text{${b}}` : `\\text{${b}}^{${e}}`);
    } else {
      const ae = -e;
      denS.push(ae === 1 ? b : `${b}${formatSupText(ae)}`);
      denL.push(ae === 1 ? `\\text{${b}}` : `\\text{${b}}^{${ae}}`);
    }
  }
  const nS = numS.length ? numS.join('·') : '1';
  const nL = numL.length ? numL.join('\\cdot ') : '1';
  if (!denS.length) return { symbol: nS, latex: nL };
  const dS = denS.length > 1 ? `(${denS.join('·')})` : denS[0];
  const dL = denL.length > 1 ? `(${denL.join('\\cdot ')})` : denL[0];
  return { symbol: `${nS}/${dS}`, latex: `${nL}/${dL}` };
}

export interface SmartUnitChoice {
  scale: number;
  symbol: string;
  latex: string;
  tempKind?: TempKind;
}

export interface SmartFormatOptions {
  unitHint?: UnitSpec;
  unitForced?: boolean;
  angleKind?: AngleKind;
  logKind?: LogKind;
  tempKind?: TempKind;
  dataKind?: DataKind;
  digits?: number;
}

function pickStep(absSi: number, steps: StepList, zeroDefault: readonly [number, string, string]): SmartUnitChoice {
  if (absSi === 0) return { scale: zeroDefault[0], symbol: zeroDefault[1], latex: zeroDefault[2] };
  for (const [scale, symbol, latex] of steps) {
    if (absSi >= scale) return { scale, symbol, latex };
  }
  const [scale, symbol, latex] = steps[steps.length - 1];
  return { scale, symbol, latex };
}

/** Choose the cleanest display unit and scale factor for a given magnitude and dimension. */
export function chooseSmartUnit(absSi: number, dim: Dim, opts: SmartFormatOptions = {}): SmartUnitChoice {
  if (opts.logKind) {
    const sym = opts.logKind === 'dBuV' ? 'dBµV' : opts.logKind;
    const latex = opts.logKind === 'dBuV' ? '\\text{dB}\\mu\\text{V}' : `\\text{${opts.logKind}}`;
    return { scale: 1, symbol: sym, latex };
  }
  if (opts.tempKind === 'C') return { scale: 1, symbol: '°C', latex: '^\\circ\\text{C}', tempKind: 'C' };
  if (opts.tempKind === 'F') return { scale: 5 / 9, symbol: '°F', latex: '^\\circ\\text{F}', tempKind: 'F' };
  if (opts.unitForced && opts.unitHint) {
    return { scale: opts.unitHint.scale, symbol: opts.unitHint.symbol, latex: opts.unitHint.latex };
  }
  if (opts.angleKind === 'deg') return { scale: Math.PI / 180, symbol: '°', latex: '^\\circ' };
  if (opts.angleKind === 'rad') return { scale: 1, symbol: 'rad', latex: '\\text{rad}' };

  if (opts.dataKind === 'data' && dimIsZero(dim)) {
    if (opts.unitHint) {
      const v = absSi / opts.unitHint.scale;
      if (absSi === 0 || (v >= 0.5 && v < 1e4)) {
        return { scale: opts.unitHint.scale, symbol: opts.unitHint.symbol, latex: opts.unitHint.latex };
      }
    }
    return pickStep(absSi, DATA_STEPS, [8, 'B', '\\text{B}']);
  }

  if (dimEqual(dim, DIM_AREA)) {
    if (opts.unitHint && dimEqual(opts.unitHint.dim, DIM_AREA)) {
      const v = absSi / opts.unitHint.scale;
      if (absSi === 0 || (v >= 1e-3 && v < 1e6)) {
        return { scale: opts.unitHint.scale, symbol: opts.unitHint.symbol, latex: opts.unitHint.latex };
      }
    }
    return pickStep(absSi, AREA_STEPS, [1, 'm²', '\\text{m}^2']);
  }

  if (dimEqual(dim, DIM_VOLUME)) {
    if (opts.unitHint && dimEqual(opts.unitHint.dim, DIM_VOLUME)) {
      const v = absSi / opts.unitHint.scale;
      if (absSi === 0 || (v >= 1e-3 && v < 1e6)) {
        return { scale: opts.unitHint.scale, symbol: opts.unitHint.symbol, latex: opts.unitHint.latex };
      }
    }
    return pickStep(absSi, VOLUME_STEPS, [1, 'm³', '\\text{m}^3']);
  }

  if (dimIsZero(dim)) return { scale: 1, symbol: '', latex: '' };

  const canon = CANONICAL_SI.get(dimKey(dim));
  if (canon) {
    const val = absSi * canon.fromSi;
    if (!canon.range || val === 0 || !Number.isFinite(val)) {
      if (dimEqual(dim, DIM_MASS) && val === 0) return { scale: 1, symbol: 'kg', latex: '\\text{kg}' };
      return { scale: 1 / canon.fromSi, symbol: canon.symbol, latex: canon.latex };
    }
    const [minPow, maxPow] = canon.range;
    const allowed = SI_STEPS.filter((s) => s.pow >= minPow && s.pow <= maxPow);
    let chosen = allowed[allowed.length - 1];
    for (const s of allowed) {
      if (val >= s.scale * 0.9999999) { chosen = s; break; }
    }
    if (val < allowed[allowed.length - 1].scale * 1e-3 || val >= allowed[0].scale * 1e6) {
      chosen = allowed.find((s) => s.pow === 0) ?? chosen;
    }
    return {
      scale: chosen.scale / canon.fromSi,
      symbol: `${chosen.sym}${canon.symbol}`,
      latex: `${chosen.latex}${canon.latex}`,
    };
  }

  const raw = formatDimBaseSI(dim);
  return { scale: 1, symbol: raw.symbol, latex: raw.latex };
}

/** Format a finite number cleanly with up to `digits` significant figures and a real minus sign. */
export function formatRealNumber(n: number, digits = 6): string {
  if (Number.isNaN(n)) return 'NaN';
  if (!Number.isFinite(n)) return n < 0 ? '−∞' : '∞';
  if (n === 0) return '0';
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (abs >= 1e-4 && abs < 1e9) return `${sign}${Number(abs.toPrecision(digits))}`;
  const [mant, exp] = abs.toExponential(Math.max(0, digits - 1)).split('e');
  return `${sign}${mant.replace(/\.?0+$/, '')}e${exp.replace(/^\+/, '').replace('-', '−')}`;
}

/** Format a finite number as KaTeX (scientific notation rendered with `× 10^{n}`). */
export function formatRealLatex(n: number, digits = 6): string {
  if (Number.isNaN(n)) return '\\text{NaN}';
  if (!Number.isFinite(n)) return n < 0 ? '-\\infty' : '\\infty';
  if (n === 0) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e-4 && abs < 1e9) return `${sign}${Number(abs.toPrecision(digits))}`;
  const [mant, exp] = abs.toExponential(Math.max(0, digits - 1)).split('e');
  return `${sign}${mant.replace(/\.?0+$/, '')}\\times 10^{${Number(exp)}}`;
}

/** Format a real SI value with smart auto-prefixing or area/volume/log/temp formatting. */
export function formatWithSmartUnit(siValue: number, dim: Dim, opts: SmartFormatOptions = {}): string {
  const choice = chooseSmartUnit(Math.abs(siValue), dim, opts);
  const val = choice.tempKind === 'C'
    ? siValue - 273.15
    : choice.tempKind === 'F'
      ? (siValue - 273.15) * (9 / 5) + 32
      : siValue / choice.scale;
  const num = formatRealNumber(val, opts.digits ?? 6);
  if (!choice.symbol) return num;
  return choice.symbol === '°' || choice.symbol === '%' ? `${num}${choice.symbol}` : `${num} ${choice.symbol}`;
}

// ---------------------------------------------------------------------------
// Compatible Unit Suggestions
// ---------------------------------------------------------------------------

const SUGGESTIONS_BY_DIM: ReadonlyMap<string, readonly string[]> = new Map([
  [dimKey(DIM_TIME), ['ps', 'ns', 'µs', 'ms', 's', 'min']],
  [dimKey(DIM_FREQ), ['Hz', 'kHz', 'MHz', 'GHz', 'THz', 'rpm']],
  [dimKey(DIM_RESISTANCE), ['mΩ', 'Ω', 'kΩ', 'MΩ']],
  [dimKey(DIM_CAPACITANCE), ['pF', 'nF', 'µF', 'mF', 'F']],
  [dimKey(DIM_INDUCTANCE), ['nH', 'µH', 'mH', 'H']],
  [dimKey(DIM_VOLTAGE), ['µV', 'mV', 'V', 'kV', 'dBV', 'dBµV']],
  [dimKey(DIM_CURRENT), ['µA', 'mA', 'A', 'kA']],
  [dimKey(DIM_POWER), ['dBm', 'dBW', 'µW', 'mW', 'W', 'kW']],
  [dimKey(DIM_ENERGY), ['eV', 'mJ', 'J', 'kJ', 'Wh']],
  [dimKey(DIM_CHARGE), ['nC', 'µC', 'mC', 'C', 'mAh']],
  [dimKey(DIM_CONDUCTANCE), ['µS', 'mS', 'S']],
  [dimKey(DIM_LENGTH), ['µm', 'mm', 'cm', 'm', 'mil', 'in']],
  [dimKey(DIM_AREA), ['µm²', 'mm²', 'cm²', 'm²', 'mil²', 'in²']],
  [dimKey(DIM_VOLUME), ['mm³', 'cm³', 'mL', 'L', 'm³']],
  [dimKey(DIM_MASS), ['mg', 'g', 'kg', 'oz', 'lb']],
  [dimKey(DIM_FORCE), ['mN', 'N', 'kN']],
  [dimKey(DIM_PRESSURE), ['Pa', 'kPa', 'bar', 'atm', 'psi']],
  [dimKey(DIM_TEMP), ['K', '°C', '°F']],
  [dimKey(DIM_VELOCITY), ['mm/s', 'm/s', 'km/h']],
]);

export interface SuggestionInput {
  dim: Dim;
  angleKind?: AngleKind;
  logKind?: LogKind;
  tempKind?: TempKind;
  dataKind?: DataKind;
}

const parseList = (list: readonly string[]): UnitSpec[] =>
  list.map(parseUnitExpr).filter((x): x is UnitSpec => x !== null);

/** Suggest 3–6 useful compatible conversion target units for a quantity. */
export function suggestConversions(input: SuggestionInput): UnitSpec[] {
  if (input.logKind === 'dBm' || input.logKind === 'dBW') return parseList(['dBm', 'dBW', 'µW', 'mW', 'W']);
  if (input.logKind === 'dBV' || input.logKind === 'dBuV') return parseList(['dBV', 'dBµV', 'µV', 'mV', 'V']);
  if (input.logKind === 'dB') return parseList(['dB', 'Np']);
  if (input.angleKind) return parseList(['rad', 'deg']);
  if (input.dataKind === 'data' && dimIsZero(input.dim)) return parseList(['bit', 'B', 'kB', 'KiB', 'MB', 'MiB']);
  if (input.tempKind || dimEqual(input.dim, DIM_TEMP)) return parseList(['K', '°C', '°F']);
  const list = SUGGESTIONS_BY_DIM.get(dimKey(input.dim));
  if (list) return parseList(list);
  return dimIsZero(input.dim) ? parseList(['%', 'ppm', 'ppb']) : [];
}
