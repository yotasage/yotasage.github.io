function rotl32(val: number, shift: number): number {
  return ((val << shift) | (val >>> (32 - shift))) >>> 0;
}

function writeUint32LE(out: Uint8Array, offset: number, word: number): void {
  out[offset] = word & 0xff;
  out[offset + 1] = (word >>> 8) & 0xff;
  out[offset + 2] = (word >>> 16) & 0xff;
  out[offset + 3] = (word >>> 24) & 0xff;
}

function writeUint32BE(out: Uint8Array, offset: number, word: number): void {
  out[offset] = (word >>> 24) & 0xff;
  out[offset + 1] = (word >>> 16) & 0xff;
  out[offset + 2] = (word >>> 8) & 0xff;
  out[offset + 3] = word & 0xff;
}

/**
 * Builds the final 1 or 2 padded 64-byte blocks for MD5, SHA-1, and RIPEMD-160
 * without copying the full input buffer.
 */
function buildTailBlocks64(input: Uint8Array, littleEndianLength: boolean): Uint8Array {
  const fullBytes = input.length & ~63;
  const rem = input.length - fullBytes;
  const tailLen = rem < 56 ? 64 : 128;
  const tail = new Uint8Array(tailLen);
  if (rem > 0) {
    tail.set(input.subarray(fullBytes), 0);
  }
  tail[rem] = 0x80;

  const bitLen = input.length * 8;
  const lo = bitLen >>> 0;
  const hi = Math.floor(bitLen / 0x100000000) >>> 0;
  if (littleEndianLength) {
    writeUint32LE(tail, tailLen - 8, lo);
    writeUint32LE(tail, tailLen - 4, hi);
  } else {
    writeUint32BE(tail, tailLen - 8, hi);
    writeUint32BE(tail, tailLen - 4, lo);
  }
  return tail;
}

// ---------------------------------------------------------------------------
// MD5 (RFC 1321)
// ---------------------------------------------------------------------------

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;

const MD5_K: readonly number[] = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0,
);

export function md5Bytes(input: Uint8Array): Uint8Array {
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const M = new Uint32Array(16);

  const processBlocks = (src: Uint8Array, limit: number) => {
    for (let offset = 0; offset < limit; offset += 64) {
      for (let j = 0; j < 16; j++) {
        const p = offset + (j << 2);
        M[j] = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0;
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
          g = (5 * i + 1) & 15;
        } else if (i < 48) {
          F = B ^ C ^ D;
          g = (3 * i + 5) & 15;
        } else {
          F = C ^ (B | ~D);
          g = (7 * i) & 15;
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
  };

  const fullBytes = input.length & ~63;
  if (fullBytes > 0) processBlocks(input, fullBytes);
  const tail = buildTailBlocks64(input, true);
  processBlocks(tail, tail.length);

  const out = new Uint8Array(16);
  writeUint32LE(out, 0, a0);
  writeUint32LE(out, 4, b0);
  writeUint32LE(out, 8, c0);
  writeUint32LE(out, 12, d0);
  return out;
}

// ---------------------------------------------------------------------------
// SHA-1 (FIPS 180-4)
// ---------------------------------------------------------------------------

export function sha1Bytes(input: Uint8Array): Uint8Array {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const W = new Uint32Array(80);

  const processBlocks = (src: Uint8Array, limit: number) => {
    for (let offset = 0; offset < limit; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const p = offset + (i << 2);
        W[i] = ((src[p] << 24) | (src[p + 1] << 16) | (src[p + 2] << 8) | src[p + 3]) >>> 0;
      }
      for (let i = 16; i < 80; i++) {
        W[i] = rotl32(W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16], 1);
      }

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;

      for (let i = 0; i < 80; i++) {
        let f = 0;
        let k = 0;
        if (i < 20) {
          f = (b & c) | (~b & d);
          k = 0x5a827999;
        } else if (i < 40) {
          f = b ^ c ^ d;
          k = 0x6ed9eba1;
        } else if (i < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = 0x8f1bbcdc;
        } else {
          f = b ^ c ^ d;
          k = 0xca62c1d6;
        }
        const temp = (rotl32(a, 5) + f + e + k + W[i]) >>> 0;
        e = d;
        d = c;
        c = rotl32(b, 30);
        b = a;
        a = temp;
      }

      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
    }
  };

  const fullBytes = input.length & ~63;
  if (fullBytes > 0) processBlocks(input, fullBytes);
  const tail = buildTailBlocks64(input, false);
  processBlocks(tail, tail.length);

  const out = new Uint8Array(20);
  writeUint32BE(out, 0, h0);
  writeUint32BE(out, 4, h1);
  writeUint32BE(out, 8, h2);
  writeUint32BE(out, 12, h3);
  writeUint32BE(out, 16, h4);
  return out;
}

// ---------------------------------------------------------------------------
// RIPEMD-160 (Dobbertin, Bosselaers, Preneel 1996)
// ---------------------------------------------------------------------------

const RMD_RL = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
] as const;

const RMD_RR = [
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
] as const;

const RMD_SL = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
] as const;

const RMD_SR = [
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
] as const;

const RMD_KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e] as const;
const RMD_KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000] as const;

function rmdF(j: number, x: number, y: number, z: number): number {
  if (j < 16) return (x ^ y ^ z) >>> 0;
  if (j < 32) return ((x & y) | (~x & z)) >>> 0;
  if (j < 48) return ((x | ~y) ^ z) >>> 0;
  if (j < 64) return ((x & z) | (y & ~z)) >>> 0;
  return (x ^ (y | ~z)) >>> 0;
}

export function ripemd160Bytes(input: Uint8Array): Uint8Array {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const X = new Uint32Array(16);

  const processBlocks = (src: Uint8Array, limit: number) => {
    for (let offset = 0; offset < limit; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const p = offset + (i << 2);
        X[i] = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0;
      }

      let al = h0;
      let bl = h1;
      let cl = h2;
      let dl = h3;
      let el = h4;

      let ar = h0;
      let br = h1;
      let cr = h2;
      let dr = h3;
      let er = h4;

      for (let j = 0; j < 80; j++) {
        const round = j >> 4;
        let t = (al + rmdF(j, bl, cl, dl) + X[RMD_RL[j]] + RMD_KL[round]) >>> 0;
        t = (rotl32(t, RMD_SL[j]) + el) >>> 0;
        al = el;
        el = dl;
        dl = rotl32(cl, 10);
        cl = bl;
        bl = t;

        t = (ar + rmdF(79 - j, br, cr, dr) + X[RMD_RR[j]] + RMD_KR[round]) >>> 0;
        t = (rotl32(t, RMD_SR[j]) + er) >>> 0;
        ar = er;
        er = dr;
        dr = rotl32(cr, 10);
        cr = br;
        br = t;
      }

      const t = (h1 + cl + dr) >>> 0;
      h1 = (h2 + dl + er) >>> 0;
      h2 = (h3 + el + ar) >>> 0;
      h3 = (h4 + al + br) >>> 0;
      h4 = (h0 + bl + cr) >>> 0;
      h0 = t;
    }
  };

  const fullBytes = input.length & ~63;
  if (fullBytes > 0) processBlocks(input, fullBytes);
  const tail = buildTailBlocks64(input, true);
  processBlocks(tail, tail.length);

  const out = new Uint8Array(20);
  writeUint32LE(out, 0, h0);
  writeUint32LE(out, 4, h1);
  writeUint32LE(out, 8, h2);
  writeUint32LE(out, 12, h3);
  writeUint32LE(out, 16, h4);
  return out;
}

// ---------------------------------------------------------------------------
// CRC32 (IEEE 802.3) & Adler-32 (RFC 1950)
// ---------------------------------------------------------------------------

const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

export function crc32Bytes(input: Uint8Array): Uint8Array {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    crc = (CRC32_TABLE[(crc ^ input[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  const final = (crc ^ 0xffffffff) >>> 0;
  const out = new Uint8Array(4);
  writeUint32BE(out, 0, final);
  return out;
}

export function adler32Bytes(input: Uint8Array): Uint8Array {
  const MOD = 65521;
  let s1 = 1;
  let s2 = 0;
  // Defer modulo reduction in 5552-byte chunks (NMAX) for faster execution on large buffers
  let i = 0;
  const len = input.length;
  while (i < len) {
    const chunkEnd = Math.min(i + 5552, len);
    while (i < chunkEnd) {
      s1 += input[i++];
      s2 += s1;
    }
    s1 %= MOD;
    s2 %= MOD;
  }
  const value = (((s2 << 16) | s1) >>> 0);
  const out = new Uint8Array(4);
  writeUint32BE(out, 0, value);
  return out;
}
