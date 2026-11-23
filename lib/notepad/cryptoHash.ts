export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512';

export const HASH_ALGORITHMS: readonly HashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'];

// RFC 1321 per-round shift amounts
const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;

const MD5_K: readonly number[] = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0,
);

function rotl32(val: number, shift: number): number {
  return ((val << shift) | (val >>> (32 - shift))) >>> 0;
}

function toHexLittleEndian(word: number): string {
  let s = '';
  for (let i = 0; i < 4; i++) {
    s += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
  }
  return s;
}

/**
 * Pure RFC 1321 MD5 implementation over arbitrary Uint8Array bytes (zero dependencies).
 */
export function computeMd5Hex(input: Uint8Array): string {
  const bitLen = input.length * 8;
  const padLen = ((56 - ((input.length + 1) % 64)) + 64) % 64;
  const totalLen = input.length + 1 + padLen + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(input, 0);
  buf[input.length] = 0x80;

  const view = new DataView(buf.buffer);
  // 64-bit little-endian bit length
  view.setUint32(totalLen - 8, bitLen >>> 0, true);
  view.setUint32(totalLen - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Uint32Array(16);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(offset + j * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F = 0;
      let g = 0;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }

      F = (F + A + MD5_K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl32(F, MD5_SHIFTS[i])) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  return (
    toHexLittleEndian(a0) +
    toHexLittleEndian(b0) +
    toHexLittleEndian(c0) +
    toHexLittleEndian(d0)
  );
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export async function computeDigestHex(algorithm: HashAlgorithm, bytes: Uint8Array): Promise<string> {
  if (algorithm === 'MD5') {
    return computeMd5Hex(bytes);
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is not available in this browser context.');
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await subtle.digest(algorithm, copy.buffer);
  return bytesToHex(new Uint8Array(digest));
}

export async function computeAllDigests(bytes: Uint8Array): Promise<Record<HashAlgorithm, string>> {
  const [md5, sha1, sha256, sha512] = await Promise.all([
    computeDigestHex('MD5', bytes),
    computeDigestHex('SHA-1', bytes),
    computeDigestHex('SHA-256', bytes),
    computeDigestHex('SHA-512', bytes),
  ]);
  return {
    MD5: md5,
    'SHA-1': sha1,
    'SHA-256': sha256,
    'SHA-512': sha512,
  };
}
