import { formatBigIntInBase } from './convert';
import { getAlphabet, normalizeAlphabetForRadix } from './presets';
import type {
  AlphabetId,
  ConversionSteps,
  DivisionStep,
  FractionStep,
  ParsedNumber,
  PolyTerm,
} from './types';

const MAX_POLY_TERMS = 16;
const MAX_DIV_STEPS = 24;
const MAX_FRAC_STEPS = 12;

function isPowerOfTwo(n: number): boolean {
  return n >= 2 && (n & (n - 1)) === 0;
}

/**
 * If both source and target radices are powers of 2 (e.g. 2 <-> 16, 2 <-> 8),
 * returns the number of bits per digit of the larger base (or null otherwise).
 */
export function getPowerOfTwoGrouping(sourceRadix: number, targetRadix: number): number | null {
  if (sourceRadix === targetRadix) return null;
  if (!isPowerOfTwo(sourceRadix) || !isPowerOfTwo(targetRadix)) return null;
  const hi = Math.max(sourceRadix, targetRadix);
  const lo = Math.min(sourceRadix, targetRadix);
  const hiBits = Math.round(Math.log2(hi));
  const loBits = Math.round(Math.log2(lo));
  if (hiBits % loBits !== 0) return null;
  return hiBits / loBits;
}

export function buildConversionSteps(
  parsed: ParsedNumber,
  sourceRadix: number,
  targetRadix: number,
  sourceAlphabet: AlphabetId = 'standard',
  targetAlphabet: AlphabetId = 'standard',
): ConversionSteps {
  const effSrc = normalizeAlphabetForRadix(sourceRadix, sourceAlphabet);
  const effDst = normalizeAlphabetForRadix(targetRadix, targetAlphabet);
  const srcAlpha = getAlphabet(sourceRadix, effSrc);
  const dstAlpha = getAlphabet(targetRadix, effDst);

  const srcDigits = formatBigIntInBase(parsed.intPart, sourceRadix, effSrc, 'upper');
  const srcBig = BigInt(sourceRadix);
  const polyTerms: PolyTerm[] = [];
  let polyTruncated = false;

  if (srcDigits.length <= MAX_POLY_TERMS) {
    for (let i = 0; i < srcDigits.length; i++) {
      const ch = srcDigits[i];
      const digitValue = srcAlpha.indexOf(ch);
      const power = srcDigits.length - 1 - i;
      const contrib = BigInt(digitValue) * srcBig ** BigInt(power);
      polyTerms.push({
        digit: ch,
        digitValue,
        power,
        contribution: contrib.toString(10),
      });
    }
  } else {
    polyTruncated = true;
    // Show most significant 8 terms
    for (let i = 0; i < 8; i++) {
      const ch = srcDigits[i];
      const digitValue = srcAlpha.indexOf(ch);
      const power = srcDigits.length - 1 - i;
      const contrib = BigInt(digitValue) * srcBig ** BigInt(power);
      polyTerms.push({
        digit: ch,
        digitValue,
        power,
        contribution: contrib.toString(10),
      });
    }
  }

  // Repeated Euclidean division from decimal integer to target radix
  const divisionSteps: DivisionStep[] = [];
  let divisionTruncated = false;
  const dstBig = BigInt(targetRadix);

  if (parsed.intPart === 0n) {
    divisionSteps.push({
      dividend: '0',
      quotient: '0',
      remainder: 0,
      digit: dstAlpha[0],
    });
  } else {
    let n = parsed.intPart;
    while (n > 0n) {
      if (divisionSteps.length >= MAX_DIV_STEPS) {
        divisionTruncated = true;
        break;
      }
      const q = n / dstBig;
      const r = Number(n % dstBig);
      divisionSteps.push({
        dividend: n.toString(10),
        quotient: q.toString(10),
        remainder: r,
        digit: dstAlpha[r],
      });
      n = q;
    }
  }

  // Fractional repeated multiplication steps
  const fractionSteps: FractionStep[] = [];
  let fractionExact = true;
  if (parsed.fracNum > 0n) {
    let rem = parsed.fracNum;
    const den = parsed.fracDen;
    for (let s = 0; s < MAX_FRAC_STEPS && rem > 0n; s++) {
      const inDecimal = formatRationalApprox(rem, den);
      const multiplied = rem * dstBig;
      const intPart = Number(multiplied / den);
      const nextRem = multiplied % den;
      fractionSteps.push({
        input: inDecimal,
        product: formatRationalApprox(multiplied, den),
        integerPart: intPart,
        digit: dstAlpha[intPart],
        nextFraction: formatRationalApprox(nextRem, den),
      });
      rem = nextRem;
    }
    if (rem > 0n) {
      fractionExact = false;
    }
  }

  return {
    sourceRadix,
    targetRadix,
    negative: parsed.negative,
    decimalInteger: parsed.intPart.toString(10),
    polyTerms,
    polyTruncated,
    divisionSteps,
    divisionTruncated,
    fractionSteps,
    fractionExact,
    powerOfTwoGroup: getPowerOfTwoGrouping(sourceRadix, targetRadix),
  };
}

function formatRationalApprox(num: bigint, den: bigint): string {
  if (num === 0n) return '0';
  const intPart = num / den;
  let rem = num % den;
  if (rem === 0n) return intPart.toString(10);
  const digits: string[] = [];
  for (let i = 0; i < 6 && rem > 0n; i++) {
    rem *= 10n;
    digits.push(String(rem / den));
    rem %= den;
  }
  return `${intPart.toString(10)}.${digits.join('')}${rem > 0n ? '…' : ''}`;
}
