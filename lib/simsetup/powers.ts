// Powers of 2 for whole numbers of any size, using BigInt.

/** Number of binary digits in n (n ≥ 1). */
export function bitLength(n: bigint): number {
  return n.toString(2).length;
}

export function isPowerOfTwo(n: bigint): boolean {
  return n > 0n && (n & (n - 1n)) === 0n;
}

/** The smallest power of 2 larger than n. */
export function nextPowerOfTwo(n: bigint): bigint {
  if (n < 1n) return 1n;
  return 1n << BigInt(bitLength(n));
}

/** The largest power of 2 smaller than n, or null when there is none (n ≤ 1). */
export function prevPowerOfTwo(n: bigint): bigint | null {
  if (n <= 1n) return null;
  const highest = 1n << BigInt(bitLength(n) - 1);
  return highest === n ? highest >> 1n : highest;
}

/** log2(n) as a float, also for numbers too large for a double. */
export function log2(n: bigint): number {
  const bits = bitLength(n);
  if (bits <= 53) return Math.log2(Number(n));
  const shift = bits - 53;
  return Math.log2(Number(n >> BigInt(shift))) + shift;
}
