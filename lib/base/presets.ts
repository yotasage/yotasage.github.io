import type { AlphabetId, BasePreset, BaseSpec, SampleValue } from './types';

export const MIN_RADIX = 2;
export const MAX_RADIX = 64;

/** Standard positional alphabet up to base 64: 0-9, A-Z, a-z, +, / */
export const STANDARD_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/';

/** Bitcoin / IPFS Base58 alphabet (omits 0, O, I, l) */
export const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** RFC 4648 Base64 digit order: A-Z, a-z, 0-9, +, / */
export const RFC4648_BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Crockford Base32 alphabet (omits I, L, O, U) */
export const CROCKFORD32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const CORE_PRESETS: readonly BasePreset[] = [
  {
    id: 'bin',
    radix: 2,
    alphabetId: 'standard',
    shortLabel: 'BIN',
    prefix: '0b',
    groupSize: 4,
    tier: 'core',
  },
  {
    id: 'oct',
    radix: 8,
    alphabetId: 'standard',
    shortLabel: 'OCT',
    prefix: '0o',
    groupSize: 3,
    tier: 'core',
  },
  {
    id: 'dec',
    radix: 10,
    alphabetId: 'standard',
    shortLabel: 'DEC',
    prefix: '',
    groupSize: 3,
    tier: 'core',
  },
  {
    id: 'hex',
    radix: 16,
    alphabetId: 'standard',
    shortLabel: 'HEX',
    prefix: '0x',
    groupSize: 4,
    tier: 'core',
  },
];

export const EXTENDED_PRESETS: readonly BasePreset[] = [
  {
    id: 'base3',
    radix: 3,
    alphabetId: 'standard',
    shortLabel: 'TER',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base4',
    radix: 4,
    alphabetId: 'standard',
    shortLabel: 'QTR',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base5',
    radix: 5,
    alphabetId: 'standard',
    shortLabel: 'QUI',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base6',
    radix: 6,
    alphabetId: 'standard',
    shortLabel: 'SEN',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base12',
    radix: 12,
    alphabetId: 'standard',
    shortLabel: 'DUO',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base20',
    radix: 20,
    alphabetId: 'standard',
    shortLabel: 'VIG',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base32',
    radix: 32,
    alphabetId: 'standard',
    shortLabel: 'B32',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'crockford32',
    radix: 32,
    alphabetId: 'crockford32',
    shortLabel: 'C32',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base36',
    radix: 36,
    alphabetId: 'standard',
    shortLabel: 'B36',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base58',
    radix: 58,
    alphabetId: 'base58',
    shortLabel: 'B58',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base60',
    radix: 60,
    alphabetId: 'standard',
    shortLabel: 'B60',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base62',
    radix: 62,
    alphabetId: 'standard',
    shortLabel: 'B62',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
  {
    id: 'base64',
    radix: 64,
    alphabetId: 'rfc4648',
    shortLabel: 'B64',
    prefix: '',
    groupSize: 4,
    tier: 'extended',
  },
];

export const ALL_PRESETS: readonly BasePreset[] = [...CORE_PRESETS, ...EXTENDED_PRESETS];

export const DEFAULT_BOARD_BASES: readonly BaseSpec[] = [
  { radix: 2, alphabetId: 'standard' },
  { radix: 8, alphabetId: 'standard' },
  { radix: 10, alphabetId: 'standard' },
  { radix: 16, alphabetId: 'standard' },
  { radix: 36, alphabetId: 'standard' },
  { radix: 62, alphabetId: 'standard' },
  { radix: 64, alphabetId: 'rfc4648' },
];

export const SAMPLE_VALUES: readonly SampleValue[] = [
  { id: 'byte', value: '255', radix: 10, alphabetId: 'standard', labelKey: 'base.sample.byte' },
  { id: 'deadbeef', value: 'DEADBEEF', radix: 16, alphabetId: 'standard', labelKey: 'base.sample.deadbeef' },
  { id: 'fraction', value: '42.625', radix: 10, alphabetId: 'standard', labelKey: 'base.sample.fraction' },
  { id: 'u64max', value: '18446744073709551615', radix: 10, alphabetId: 'standard', labelKey: 'base.sample.u64max' },
  { id: 'neg', value: '-42', radix: 10, alphabetId: 'standard', labelKey: 'base.sample.neg' },
  { id: 'binmask', value: '10101100', radix: 2, alphabetId: 'standard', labelKey: 'base.sample.binmask' },
];

export function isValidRadix(radix: number): boolean {
  return Number.isInteger(radix) && radix >= MIN_RADIX && radix <= MAX_RADIX;
}

export function normalizeAlphabetForRadix(radix: number, alphabetId: AlphabetId): AlphabetId {
  if (alphabetId === 'base58' && radix === 58) return 'base58';
  if (alphabetId === 'rfc4648' && radix === 64) return 'rfc4648';
  if (alphabetId === 'crockford32' && radix === 32) return 'crockford32';
  return 'standard';
}

export function getAlphabet(radix: number, alphabetId: AlphabetId = 'standard'): string {
  const effective = normalizeAlphabetForRadix(radix, alphabetId);
  if (effective === 'base58') return BASE58_ALPHABET;
  if (effective === 'rfc4648') return RFC4648_BASE64_ALPHABET;
  if (effective === 'crockford32') return CROCKFORD32_ALPHABET;
  return STANDARD_ALPHABET.slice(0, Math.min(Math.max(radix, MIN_RADIX), MAX_RADIX));
}

export function isCaseSensitive(radix: number, alphabetId: AlphabetId = 'standard'): boolean {
  const effective = normalizeAlphabetForRadix(radix, alphabetId);
  if (effective === 'base58' || effective === 'rfc4648') return true;
  if (effective === 'crockford32') return false;
  return radix > 36;
}

export function getPrefixForRadix(radix: number): string {
  if (radix === 2) return '0b';
  if (radix === 8) return '0o';
  if (radix === 16) return '0x';
  return '';
}

export function getDefaultGroupSize(radix: number): number {
  if (radix === 10 || radix === 8) return 3;
  return 4;
}

export function describeAllowedDigits(radix: number, alphabetId: AlphabetId = 'standard'): string {
  const effective = normalizeAlphabetForRadix(radix, alphabetId);
  if (effective === 'base58') return '1–9, A–Z, a–z (no 0, O, I, l)';
  if (effective === 'rfc4648') return 'A–Z, a–z, 0–9, +, /';
  if (effective === 'crockford32') return '0–9, A–Z (no I, L, O, U)';
  if (radix <= 10) return `0–${radix - 1}`;
  if (radix <= 36) return `0–9, A–${STANDARD_ALPHABET[radix - 1]}`;
  if (radix <= 62) return `0–9, A–Z, a–${STANDARD_ALPHABET[radix - 1]}`;
  if (radix === 63) return '0–9, A–Z, a–z, +';
  return '0–9, A–Z, a–z, +, /';
}

export function baseSpecKey(spec: BaseSpec): string {
  const eff = normalizeAlphabetForRadix(spec.radix, spec.alphabetId);
  return `${spec.radix}:${eff}`;
}

export function findPresetForSpec(spec: BaseSpec): BasePreset | undefined {
  const eff = normalizeAlphabetForRadix(spec.radix, spec.alphabetId);
  return ALL_PRESETS.find((p) => p.radix === spec.radix && p.alphabetId === eff);
}
