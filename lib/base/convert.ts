import {
  describeAllowedDigits,
  getAlphabet,
  getDefaultGroupSize,
  getPrefixForRadix,
  isCaseSensitive,
  isValidRadix,
  normalizeAlphabetForRadix,
} from './presets';
import type {
  AlphabetId,
  FormatOptions,
  FormattedBaseValue,
  GroupingMode,
  ParsedNumber,
  ParseResult,
} from './types';

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

export function detectPrefixRadix(raw: string): { radix: number; prefix: string } | null {
  const trimmed = raw.trim().replace(/^[+-]/, '');
  if (trimmed.length < 3) return null;
  const p = trimmed.slice(0, 2).toLowerCase();
  if (p === '0b') return { radix: 2, prefix: trimmed.slice(0, 2) };
  if (p === '0o') return { radix: 8, prefix: trimmed.slice(0, 2) };
  if (p === '0x') return { radix: 16, prefix: trimmed.slice(0, 2) };
  if (p === '0d') return { radix: 10, prefix: trimmed.slice(0, 2) };
  return null;
}

/**
 * Parse a string in any radix 2..64 into an exact sign + BigInt integer + reduced BigInt fraction.
 */
export function parseInBase(
  input: string,
  radix: number,
  alphabetId: AlphabetId = 'standard',
): ParseResult {
  if (!isValidRadix(radix)) {
    return {
      ok: false,
      code: 'invalidRadix',
      radix,
      allowedPreview: '2–64',
    };
  }

  const effectiveAlphabet = normalizeAlphabetForRadix(radix, alphabetId);
  const alphabet = getAlphabet(radix, effectiveAlphabet);
  const caseSensitive = isCaseSensitive(radix, effectiveAlphabet);
  const allowedPreview = describeAllowedDigits(radix, effectiveAlphabet);

  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, code: 'empty', radix, allowedPreview };
  }

  let cursor = 0;
  let negative = false;
  if (trimmed[0] === '-') {
    negative = true;
    cursor = 1;
  } else if (trimmed[0] === '+') {
    cursor = 1;
  }

  // Strip matching literal prefix (0b for base 2, 0o for base 8, 0x for base 16, 0d for base 10)
  let detectedPrefix: string | undefined;
  const rest = trimmed.slice(cursor);
  if (rest.length >= 2 && rest[0] === '0') {
    const second = rest[1].toLowerCase();
    if (
      (radix === 2 && second === 'b') ||
      (radix === 8 && second === 'o') ||
      (radix === 16 && second === 'x') ||
      (radix === 10 && second === 'd')
    ) {
      detectedPrefix = rest.slice(0, 2);
      cursor += 2;
    }
  }

  // Build character lookup map
  const charToVal = new Map<string, number>();
  for (let i = 0; i < alphabet.length; i++) {
    const ch = alphabet[i];
    charToVal.set(ch, i);
    if (!caseSensitive) {
      charToVal.set(ch.toLowerCase(), i);
    }
  }
  // Crockford Base32 accepts O/o -> 0, I/i/L/l -> 1
  if (effectiveAlphabet === 'crockford32') {
    charToVal.set('O', 0);
    charToVal.set('o', 0);
    charToVal.set('I', 1);
    charToVal.set('i', 1);
    charToVal.set('L', 1);
    charToVal.set('l', 1);
  }

  let seenDot = false;
  const intDigits: number[] = [];
  const fracDigits: number[] = [];

  for (let i = cursor; i < trimmed.length; i++) {
    const ch = trimmed[i];

    // Grouping separators: whitespace and underscore are always allowed; comma allowed as thousands sep
    if (ch === ' ' || ch === '\t' || ch === '_' || ch === ',') {
      continue;
    }

    // Hyphen allowed as visual separator in Crockford Base32
    if (ch === '-' && effectiveAlphabet === 'crockford32') {
      continue;
    }

    if (ch === '.') {
      if (seenDot) {
        return {
          ok: false,
          code: 'multipleDots',
          char: ch,
          position: i + 1,
          radix,
          allowedPreview,
        };
      }
      seenDot = true;
      continue;
    }

    const digitVal = charToVal.get(ch);
    if (digitVal === undefined) {
      return {
        ok: false,
        code: 'invalidChar',
        char: ch,
        position: i + 1,
        radix,
        allowedPreview,
      };
    }

    if (seenDot) {
      fracDigits.push(digitVal);
    } else {
      intDigits.push(digitVal);
    }
  }

  if (intDigits.length === 0 && fracDigits.length === 0) {
    return { ok: false, code: 'noDigits', radix, allowedPreview };
  }

  const baseBig = BigInt(radix);
  let intPart = 0n;
  for (const d of intDigits) {
    intPart = intPart * baseBig + BigInt(d);
  }

  // Trim trailing zeros from fractional digits to keep denominator small
  let effectiveFracLen = fracDigits.length;
  while (effectiveFracLen > 0 && fracDigits[effectiveFracLen - 1] === 0) {
    effectiveFracLen--;
  }

  let fracNum = 0n;
  let fracDen = 1n;
  if (effectiveFracLen > 0) {
    for (let i = 0; i < effectiveFracLen; i++) {
      fracNum = fracNum * baseBig + BigInt(fracDigits[i]);
      fracDen = fracDen * baseBig;
    }
    const g = gcdBigInt(fracNum, fracDen);
    fracNum /= g;
    fracDen /= g;
  }

  const isZero = intPart === 0n && fracNum === 0n;

  return {
    ok: true,
    negative: isZero ? false : negative,
    intPart,
    fracNum,
    fracDen,
    isZero,
    hasFraction: fracNum > 0n,
    detectedPrefix,
  };
}

function groupIntegerDigits(digits: string, groupSize: number, mode: GroupingMode): string {
  if (mode === 'none' || groupSize <= 0 || digits.length <= groupSize) {
    return digits;
  }
  const sep = mode === 'space' ? ' ' : '_';
  const parts: string[] = [];
  let idx = digits.length;
  while (idx > 0) {
    const start = Math.max(0, idx - groupSize);
    parts.push(digits.slice(start, idx));
    idx = start;
  }
  parts.reverse();
  return parts.join(sep);
}

function groupFractionDigits(digits: string, groupSize: number, mode: GroupingMode): string {
  if (mode === 'none' || groupSize <= 0 || digits.length <= groupSize) {
    return digits;
  }
  const sep = mode === 'space' ? ' ' : '_';
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += groupSize) {
    parts.push(digits.slice(i, i + groupSize));
  }
  return parts.join(sep);
}

export function formatBigIntInBase(
  value: bigint,
  radix: number,
  alphabetId: AlphabetId = 'standard',
  letterCase: 'upper' | 'lower' = 'upper',
): string {
  const effective = normalizeAlphabetForRadix(radix, alphabetId);
  const alphabet = getAlphabet(radix, effective);
  const caseSensitive = isCaseSensitive(radix, effective);

  const absVal = value < 0n ? -value : value;
  const baseBig = BigInt(radix);
  if (absVal === 0n) {
    const zeroChar = alphabet[0];
    return !caseSensitive && letterCase === 'lower' ? zeroChar.toLowerCase() : zeroChar;
  }

  const chars: string[] = [];
  let n = absVal;
  while (n > 0n) {
    const rem = Number(n % baseBig);
    chars.push(alphabet[rem]);
    n = n / baseBig;
  }
  chars.reverse();
  const out = chars.join('');
  return !caseSensitive && letterCase === 'lower' ? out.toLowerCase() : out;
}

/**
 * Format an exact ParsedNumber into any target radix 2..64 with optional grouping, prefix, and case.
 */
export function formatInBase(
  parsed: ParsedNumber,
  radix: number,
  alphabetId: AlphabetId = 'standard',
  options: FormatOptions,
): FormattedBaseValue {
  const effective = normalizeAlphabetForRadix(radix, alphabetId);
  const alphabet = getAlphabet(radix, effective);
  const caseSensitive = isCaseSensitive(radix, effective);

  const intDigits = formatBigIntInBase(parsed.intPart, radix, effective, options.letterCase);

  let fracDigits = '';
  let exact = true;
  let truncated = false;

  if (parsed.fracNum > 0n && options.maxFracDigits > 0) {
    const baseBig = BigInt(radix);
    let rem = parsed.fracNum;
    const den = parsed.fracDen;
    const fChars: string[] = [];

    for (let step = 0; step < options.maxFracDigits && rem > 0n; step++) {
      rem *= baseBig;
      const digit = Number(rem / den);
      rem = rem % den;
      const ch = alphabet[digit];
      fChars.push(!caseSensitive && options.letterCase === 'lower' ? ch.toLowerCase() : ch);
    }

    if (rem > 0n) {
      exact = false;
      truncated = true;
    }
    fracDigits = fChars.join('');
  } else if (parsed.fracNum > 0n && options.maxFracDigits <= 0) {
    exact = false;
    truncated = true;
  }

  const sign = parsed.negative ? '-' : '';
  const prefix = options.includePrefix ? getPrefixForRadix(radix) : '';
  const groupSize = options.groupSizeOverride ?? getDefaultGroupSize(radix);

  const groupedInt = groupIntegerDigits(intDigits, groupSize, options.grouping);
  const groupedFrac = fracDigits ? groupFractionDigits(fracDigits, groupSize, options.grouping) : '';

  const rawBody = fracDigits ? `${intDigits}.${fracDigits}` : intDigits;
  const formattedBody = groupedFrac ? `${groupedInt}.${groupedFrac}` : groupedInt;

  return {
    raw: `${sign}${rawBody}`,
    formatted: `${sign}${prefix}${formattedBody}`,
    intDigits,
    fracDigits,
    exact,
    truncated,
    prefix,
    digitCount: intDigits.length + fracDigits.length,
  };
}

export function convertBaseString(
  input: string,
  fromRadix: number,
  toRadix: number,
  options: FormatOptions,
  fromAlphabet: AlphabetId = 'standard',
  toAlphabet: AlphabetId = 'standard',
): { ok: true; parsed: ParsedNumber; output: FormattedBaseValue } | { ok: false; error: Extract<ParseResult, { ok: false }> } {
  const parsed = parseInBase(input, fromRadix, fromAlphabet);
  if (!parsed.ok) {
    return { ok: false, error: parsed };
  }
  const output = formatInBase(parsed, toRadix, toAlphabet, options);
  return { ok: true, parsed, output };
}
