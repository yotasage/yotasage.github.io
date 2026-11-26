export type AlphabetId = 'standard' | 'base58' | 'rfc4648' | 'crockford32';

export type GroupingMode = 'none' | 'space' | 'underscore';

export type LetterCase = 'upper' | 'lower';

export type BitWidth = 8 | 16 | 32 | 64;

export interface BaseSpec {
  radix: number;
  alphabetId: AlphabetId;
}

export interface BasePreset {
  id: string;
  radix: number;
  alphabetId: AlphabetId;
  shortLabel: string;
  prefix: string;
  groupSize: number;
  tier: 'core' | 'extended';
}

export interface ParsedNumber {
  ok: true;
  negative: boolean;
  intPart: bigint;
  /** Exact numerator of fractional part, 0 <= fracNum < fracDen */
  fracNum: bigint;
  /** Exact denominator of fractional part, >= 1n */
  fracDen: bigint;
  isZero: boolean;
  hasFraction: boolean;
  detectedPrefix?: string;
}

export interface ParseError {
  ok: false;
  code:
    | 'empty'
    | 'invalidRadix'
    | 'multipleDots'
    | 'invalidChar'
    | 'noDigits';
  char?: string;
  position?: number;
  radix: number;
  allowedPreview: string;
}

export type ParseResult = ParsedNumber | ParseError;

export function isParsedNumber(result: ParseResult): result is ParsedNumber {
  return result.ok === true;
}

export function isParseError(result: ParseResult): result is ParseError {
  return result.ok === false;
}

export interface FormatOptions {
  grouping: GroupingMode;
  letterCase: LetterCase;
  includePrefix: boolean;
  maxFracDigits: number;
  groupSizeOverride?: number;
}

export interface FormattedBaseValue {
  raw: string;
  formatted: string;
  intDigits: string;
  fracDigits: string;
  exact: boolean;
  truncated: boolean;
  prefix: string;
  digitCount: number;
}

export interface BitInspectorState {
  fits: boolean;
  width: BitWidth;
  bits: readonly (0 | 1)[];
  unsignedValue: bigint;
  signedValue: bigint;
  minBitLength: number;
  byteLength: number;
  hexBigEndian: readonly string[];
  hexLittleEndian: readonly string[];
}

export interface PolyTerm {
  digit: string;
  digitValue: number;
  power: number;
  contribution: string;
}

export interface DivisionStep {
  dividend: string;
  quotient: string;
  remainder: number;
  digit: string;
}

export interface FractionStep {
  input: string;
  product: string;
  integerPart: number;
  digit: string;
  nextFraction: string;
}

export interface ConversionSteps {
  sourceRadix: number;
  targetRadix: number;
  negative: boolean;
  decimalInteger: string;
  polyTerms: readonly PolyTerm[];
  polyTruncated: boolean;
  divisionSteps: readonly DivisionStep[];
  divisionTruncated: boolean;
  fractionSteps: readonly FractionStep[];
  fractionExact: boolean;
  powerOfTwoGroup: number | null;
}

export interface SampleValue {
  id: string;
  value: string;
  radix: number;
  alphabetId: AlphabetId;
  labelKey: string;
}
