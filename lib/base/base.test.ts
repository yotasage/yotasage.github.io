import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inspectBits,
  invertBits,
  pickSuggestedWidth,
  shiftBitsLeft,
  shiftBitsRight,
  toggleBit,
} from './bits';
import {
  convertBaseString,
  detectPrefixRadix,
  formatInBase,
  parseInBase,
} from './convert';
import {
  ALL_PRESETS,
  getAlphabet,
  isCaseSensitive,
} from './presets';
import { buildConversionSteps, getPowerOfTwoGrouping } from './steps';
import type { FormatOptions } from './types';

const PLAIN_OPTS: FormatOptions = {
  grouping: 'none',
  letterCase: 'upper',
  includePrefix: false,
  maxFracDigits: 16,
};

test('core integer conversions across Base 2, 8, 10, 16', () => {
  const resHex = convertBaseString('255', 10, 16, PLAIN_OPTS);
  assert.equal(resHex.ok, true);
  if (resHex.ok) {
    assert.equal(resHex.output.raw, 'FF');
    assert.equal(resHex.output.formatted, 'FF');
  }

  const resBin = convertBaseString('DEADBEEF', 16, 2, {
    ...PLAIN_OPTS,
    grouping: 'space',
  });
  assert.equal(resBin.ok, true);
  if (resBin.ok) {
    assert.equal(resBin.output.raw, '11011110101011011011111011101111');
    assert.equal(resBin.output.formatted, '1101 1110 1010 1101 1011 1110 1110 1111');
  }

  const resDec = convertBaseString('DEADBEEF', 16, 10, PLAIN_OPTS);
  assert.equal(resDec.ok, true);
  if (resDec.ok) {
    assert.equal(resDec.output.raw, '3735928559');
  }

  const resOct = convertBaseString('11111111', 2, 8, {
    ...PLAIN_OPTS,
    includePrefix: true,
  });
  assert.equal(resOct.ok, true);
  if (resOct.ok) {
    assert.equal(resOct.output.raw, '377');
    assert.equal(resOct.output.formatted, '0o377');
  }
});

test('arbitrary bases 2 through 64 and named alphabets round-trip cleanly', () => {
  const value = 987654321012345678901234567890n;
  const parsed = parseInBase(value.toString(10), 10);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  // Test every integer base from 2 to 64
  for (let radix = 2; radix <= 64; radix++) {
    const formatted = formatInBase(parsed, radix, 'standard', PLAIN_OPTS);
    const back = parseInBase(formatted.raw, radix, 'standard');
    assert.equal(back.ok, true, `Failed round-trip for base ${radix}`);
    if (back.ok) {
      assert.equal(back.intPart, value, `Mismatch for base ${radix}`);
    }
  }

  // Test Base58 (Bitcoin), Crockford Base32, RFC 4648 Base64
  for (const preset of ALL_PRESETS) {
    const out = formatInBase(parsed, preset.radix, preset.alphabetId, PLAIN_OPTS);
    const back = parseInBase(out.raw, preset.radix, preset.alphabetId);
    assert.equal(back.ok, true, `Preset ${preset.id} failed round-trip`);
    if (back.ok) {
      assert.equal(back.intPart, value, `Preset ${preset.id} value mismatch`);
    }
  }
});

test('Crockford Base32 accepts ambiguous alias letters O/I/L and hyphens', () => {
  const res = parseInBase('1O-IL', 32, 'crockford32');
  assert.equal(res.ok, true);
  if (res.ok) {
    // 1*32^3 + 0*32^2 + 1*32 + 1 = 32768 + 33 = 32801
    assert.equal(res.intPart, 32801n);
  }
});

test('Base58 omits 0, O, I, l and rejects 0', () => {
  const alpha = getAlphabet(58, 'base58');
  assert.equal(alpha.length, 58);
  assert.equal(alpha.includes('0'), false);
  assert.equal(alpha.includes('O'), false);
  assert.equal(alpha.includes('I'), false);
  assert.equal(alpha.includes('l'), false);
  assert.equal(isCaseSensitive(58, 'base58'), true);

  const zeroInBase58 = parseInBase('0', 58, 'base58');
  assert.equal(zeroInBase58.ok, false);
  if (!zeroInBase58.ok) {
    assert.equal(zeroInBase58.code, 'invalidChar');
    assert.equal(zeroInBase58.char, '0');
  }
});

test('exact rational fractional conversions and repeating detection', () => {
  // 31.625 in base 10 === 1F.A in base 16 === 11111.101 in base 2 (exact)
  const p = parseInBase('31.625', 10);
  assert.equal(p.ok, true);
  if (!p.ok) return;

  const hex = formatInBase(p, 16, 'standard', PLAIN_OPTS);
  assert.equal(hex.raw, '1F.A');
  assert.equal(hex.exact, true);
  assert.equal(hex.truncated, false);

  const bin = formatInBase(p, 2, 'standard', PLAIN_OPTS);
  assert.equal(bin.raw, '11111.101');
  assert.equal(bin.exact, true);

  // 0.1 in base 10 is non-terminating in base 2
  const tenth = parseInBase('0.1', 10);
  assert.equal(tenth.ok, true);
  if (!tenth.ok) return;
  const tenthBin = formatInBase(tenth, 2, 'standard', { ...PLAIN_OPTS, maxFracDigits: 12 });
  assert.equal(tenthBin.raw, '0.000110011001');
  assert.equal(tenthBin.exact, false);
  assert.equal(tenthBin.truncated, true);

  // 0.1 in base 3 is 1/3, which is 0.4 in base 12 (exact!)
  const third = parseInBase('0.1', 3);
  assert.equal(third.ok, true);
  if (!third.ok) return;
  const thirdBase12 = formatInBase(third, 12, 'standard', PLAIN_OPTS);
  assert.equal(thirdBase12.raw, '0.4');
  assert.equal(thirdBase12.exact, true);
});

test('prefixes, grouping separators, negative numbers, and zero handling', () => {
  assert.deepEqual(detectPrefixRadix('0xFF'), { radix: 16, prefix: '0x' });
  assert.deepEqual(detectPrefixRadix('-0b1010'), { radix: 2, prefix: '0b' });
  assert.equal(detectPrefixRadix('255'), null);

  const negHex = convertBaseString('-0x1_00', 16, 10, {
    ...PLAIN_OPTS,
    grouping: 'underscore',
  });
  assert.equal(negHex.ok, true);
  if (negHex.ok) {
    assert.equal(negHex.output.raw, '-256');
    assert.equal(negHex.output.formatted, '-256');
  }

  const negZero = parseInBase('-0', 10);
  assert.equal(negZero.ok, true);
  if (negZero.ok) {
    assert.equal(negZero.negative, false);
    assert.equal(negZero.isZero, true);
  }

  const lowercaseHex = convertBaseString('48879', 10, 16, {
    ...PLAIN_OPTS,
    letterCase: 'lower',
    includePrefix: true,
  });
  assert.equal(lowercaseHex.ok, true);
  if (lowercaseHex.ok) {
    assert.equal(lowercaseHex.output.formatted, '0xbeef');
  }
});

test('invalid digit errors report character and 1-based position', () => {
  const err = parseInBase('1284', 8);
  assert.equal(err.ok, false);
  if (!err.ok) {
    assert.equal(err.code, 'invalidChar');
    assert.equal(err.char, '8');
    assert.equal(err.position, 3);
  }

  const dotsErr = parseInBase('1.2.3', 10);
  assert.equal(dotsErr.ok, false);
  if (!dotsErr.ok) {
    assert.equal(dotsErr.code, 'multipleDots');
  }
});

test('bit inspector two-complement, endian bytes, and bitwise operations', () => {
  const state = inspectBits(-42n, 8);
  assert.equal(state.fits, true);
  assert.equal(state.unsignedValue, 214n); // 256 - 42 = 214 = 0xD6
  assert.equal(state.signedValue, -42n);
  assert.deepEqual(state.hexBigEndian, ['D6']);
  assert.equal(state.bits.join(''), '11010110');

  const big = inspectBits(0x1234n, 16);
  assert.deepEqual(big.hexBigEndian, ['12', '34']);
  assert.deepEqual(big.hexLittleEndian, ['34', '12']);

  assert.equal(toggleBit(0n, 0, 8), 1n);
  assert.equal(toggleBit(0xffn, 7, 8), 0x7fn);
  assert.equal(shiftBitsLeft(0x81n, 8), 0x02n);
  assert.equal(shiftBitsRight(0x81n, 8), 0x40n);
  assert.equal(invertBits(0x0fn, 8), 0xf0n);
  assert.equal(pickSuggestedWidth(255n), 8);
  assert.equal(pickSuggestedWidth(256n), 16);
  assert.equal(pickSuggestedWidth(-129n), 16);
});

test('step-by-step conversion breakdown matches exact input and output', () => {
  const p = parseInBase('1F.A', 16);
  assert.equal(p.ok, true);
  if (!p.ok) return;

  const steps = buildConversionSteps(p, 16, 2);
  assert.equal(steps.decimalInteger, '31');
  assert.equal(steps.polyTerms.length, 2);
  assert.equal(steps.polyTerms[0].contribution, '16');
  assert.equal(steps.polyTerms[1].contribution, '15');
  assert.equal(steps.divisionSteps.map((s) => s.digit).reverse().join(''), '11111');
  assert.equal(steps.fractionSteps.map((s) => s.digit).join(''), '101');
  assert.equal(steps.fractionExact, true);
  assert.equal(steps.powerOfTwoGroup, 4);
  assert.equal(getPowerOfTwoGrouping(8, 2), 3);
  assert.equal(getPowerOfTwoGrouping(10, 16), null);
});
