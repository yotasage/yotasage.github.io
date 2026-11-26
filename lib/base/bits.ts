import type { BitInspectorState, BitWidth } from './types';

export const BIT_WIDTHS: readonly BitWidth[] = [8, 16, 32, 64];

export function minBitLengthForBigInt(value: bigint): number {
  const abs = value < 0n ? -value : value;
  if (abs === 0n) return 1;
  return abs.toString(2).length;
}

export function pickSuggestedWidth(signedOrUnsigned: bigint): BitWidth {
  if (signedOrUnsigned >= 0n) {
    if (signedOrUnsigned <= 0xffn) return 8;
    if (signedOrUnsigned <= 0xffffn) return 16;
    if (signedOrUnsigned <= 0xffffffffn) return 32;
    return 64;
  }
  if (signedOrUnsigned >= -128n) return 8;
  if (signedOrUnsigned >= -32768n) return 16;
  if (signedOrUnsigned >= -2147483648n) return 32;
  return 64;
}

/**
 * Inspect an integer value within a fixed bit width (8, 16, 32, or 64 bits).
 * Negative numbers are represented in standard two's complement within `width`.
 */
export function inspectBits(value: bigint, width: BitWidth): BitInspectorState {
  const maxUnsigned = (1n << BigInt(width)) - 1n;
  const minSigned = -(1n << BigInt(width - 1));
  const fits = value >= minSigned && value <= maxUnsigned;

  const mask = maxUnsigned;
  const wrapped = ((value % (mask + 1n)) + (mask + 1n)) & mask;

  const bits: (0 | 1)[] = new Array(width);
  for (let i = 0; i < width; i++) {
    const shift = BigInt(width - 1 - i);
    bits[i] = ((wrapped >> shift) & 1n) === 1n ? 1 : 0;
  }

  const signBit = 1n << BigInt(width - 1);
  const signedValue = (wrapped & signBit) !== 0n ? wrapped - (mask + 1n) : wrapped;

  const byteCount = width / 8;
  const hexBigEndian: string[] = [];
  for (let b = byteCount - 1; b >= 0; b--) {
    const byteVal = Number((wrapped >> BigInt(b * 8)) & 0xffn);
    hexBigEndian.push(byteVal.toString(16).toUpperCase().padStart(2, '0'));
  }
  const hexLittleEndian = [...hexBigEndian].reverse();

  const minBitLength = minBitLengthForBigInt(value);
  const byteLength = Math.max(1, Math.ceil(minBitLength / 8));

  return {
    fits,
    width,
    bits,
    unsignedValue: wrapped,
    signedValue,
    minBitLength,
    byteLength,
    hexBigEndian,
    hexLittleEndian,
  };
}

/**
 * Toggle bit at `bitIndex` (0 = LSB, width - 1 = MSB) and return new unsigned BigInt.
 */
export function toggleBit(currentUnsigned: bigint, bitIndex: number, width: BitWidth): bigint {
  const mask = (1n << BigInt(width)) - 1n;
  const clamped = currentUnsigned & mask;
  return clamped ^ (1n << BigInt(bitIndex));
}

export function shiftBitsLeft(currentUnsigned: bigint, width: BitWidth): bigint {
  const mask = (1n << BigInt(width)) - 1n;
  return ((currentUnsigned & mask) << 1n) & mask;
}

export function shiftBitsRight(currentUnsigned: bigint, width: BitWidth): bigint {
  const mask = (1n << BigInt(width)) - 1n;
  return (currentUnsigned & mask) >> 1n;
}

export function invertBits(currentUnsigned: bigint, width: BitWidth): bigint {
  const mask = (1n << BigInt(width)) - 1n;
  return (~currentUnsigned) & mask;
}
