function rotr32(val: number, shift: number): number {
  return ((val >>> shift) | (val << (32 - shift))) >>> 0;
}

// ---------------------------------------------------------------------------
// SHA-3 (FIPS 202 — Keccak-f[1600]) using 32-bit split (lo, hi) lanes
// ---------------------------------------------------------------------------

const KECCAK_RC_L = new Uint32Array([
  0x00000001, 0x00008082, 0x0000808a, 0x80008000,
  0x0000808b, 0x80000001, 0x80008081, 0x00008009,
  0x0000008a, 0x00000088, 0x80008009, 0x8000000a,
  0x8000808b, 0x0000008b, 0x00008089, 0x00008003,
  0x00008002, 0x00000080, 0x0000800a, 0x8000000a,
  0x80008081, 0x00008080, 0x80000001, 0x80008008,
]);

const KECCAK_RC_H = new Uint32Array([
  0x00000000, 0x00000000, 0x80000000, 0x80000000,
  0x00000000, 0x00000000, 0x80000000, 0x80000000,
  0x00000000, 0x00000000, 0x00000000, 0x00000000,
  0x00000000, 0x80000000, 0x80000000, 0x80000000,
  0x80000000, 0x80000000, 0x00000000, 0x80000000,
  0x80000000, 0x80000000, 0x00000000, 0x80000000,
]);

const KECCAK_RHO = new Uint8Array([
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
]);

const KECCAK_PI = new Uint8Array([
  0, 10, 20, 5, 15,
  16, 1, 11, 21, 6,
  7, 17, 2, 12, 22,
  23, 8, 18, 3, 13,
  14, 24, 9, 19, 4,
]);

function keccakF1600(
  sL: Uint32Array,
  sH: Uint32Array,
  cL: Uint32Array,
  cH: Uint32Array,
  dL: Uint32Array,
  dH: Uint32Array,
  bL: Uint32Array,
  bH: Uint32Array,
): void {
  for (let round = 0; round < 24; round++) {
    // Theta
    for (let x = 0; x < 5; x++) {
      cL[x] = sL[x] ^ sL[x + 5] ^ sL[x + 10] ^ sL[x + 15] ^ sL[x + 20];
      cH[x] = sH[x] ^ sH[x + 5] ^ sH[x + 10] ^ sH[x + 15] ^ sH[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const prev = x === 0 ? 4 : x - 1;
      const next = x === 4 ? 0 : x + 1;
      const nL = cL[next];
      const nH = cH[next];
      dL[x] = cL[prev] ^ ((nL << 1) | (nH >>> 31));
      dH[x] = cH[prev] ^ ((nH << 1) | (nL >>> 31));
    }
    for (let y = 0; y < 25; y += 5) {
      sL[y] ^= dL[0];
      sH[y] ^= dH[0];
      sL[y + 1] ^= dL[1];
      sH[y + 1] ^= dH[1];
      sL[y + 2] ^= dL[2];
      sH[y + 2] ^= dH[2];
      sL[y + 3] ^= dL[3];
      sH[y + 3] ^= dH[3];
      sL[y + 4] ^= dL[4];
      sH[y + 4] ^= dH[4];
    }

    // Rho and Pi
    for (let i = 0; i < 25; i++) {
      const lo = sL[i];
      const hi = sH[i];
      const r = KECCAK_RHO[i];
      const dst = KECCAK_PI[i];
      if (r === 0) {
        bL[dst] = lo;
        bH[dst] = hi;
      } else if (r < 32) {
        const inv = 32 - r;
        bL[dst] = (lo << r) | (hi >>> inv);
        bH[dst] = (hi << r) | (lo >>> inv);
      } else {
        const k = r - 32;
        const inv = 32 - k;
        bL[dst] = (hi << k) | (lo >>> inv);
        bH[dst] = (lo << k) | (hi >>> inv);
      }
    }

    // Chi
    for (let y = 0; y < 25; y += 5) {
      const l0 = bL[y];
      const l1 = bL[y + 1];
      const l2 = bL[y + 2];
      const l3 = bL[y + 3];
      const l4 = bL[y + 4];
      sL[y] = l0 ^ (~l1 & l2);
      sL[y + 1] = l1 ^ (~l2 & l3);
      sL[y + 2] = l2 ^ (~l3 & l4);
      sL[y + 3] = l3 ^ (~l4 & l0);
      sL[y + 4] = l4 ^ (~l0 & l1);

      const h0 = bH[y];
      const h1 = bH[y + 1];
      const h2 = bH[y + 2];
      const h3 = bH[y + 3];
      const h4 = bH[y + 4];
      sH[y] = h0 ^ (~h1 & h2);
      sH[y + 1] = h1 ^ (~h2 & h3);
      sH[y + 2] = h2 ^ (~h3 & h4);
      sH[y + 3] = h3 ^ (~h4 & h0);
      sH[y + 4] = h4 ^ (~h0 & h1);
    }

    // Iota
    sL[0] ^= KECCAK_RC_L[round];
    sH[0] ^= KECCAK_RC_H[round];
  }
}

function sha3Core(input: Uint8Array, rateBytes: number, outBytes: number): Uint8Array {
  const sL = new Uint32Array(25);
  const sH = new Uint32Array(25);
  const cL = new Uint32Array(5);
  const cH = new Uint32Array(5);
  const dL = new Uint32Array(5);
  const dH = new Uint32Array(5);
  const bL = new Uint32Array(25);
  const bH = new Uint32Array(25);
  const block = new Uint8Array(rateBytes);
  const laneCount = rateBytes >>> 3;

  let offset = 0;
  const len = input.length;
  while (offset + rateBytes <= len) {
    for (let i = 0; i < laneCount; i++) {
      const p = offset + (i << 3);
      sL[i] ^= input[p] | (input[p + 1] << 8) | (input[p + 2] << 16) | (input[p + 3] << 24);
      sH[i] ^= input[p + 4] | (input[p + 5] << 8) | (input[p + 6] << 16) | (input[p + 7] << 24);
    }
    keccakF1600(sL, sH, cL, cH, dL, dH, bL, bH);
    offset += rateBytes;
  }

  // Final padded block with SHA-3 domain suffix 0x06 ... 0x80
  block.fill(0);
  const rem = len - offset;
  if (rem > 0) {
    block.set(input.subarray(offset), 0);
  }
  block[rem] ^= 0x06;
  block[rateBytes - 1] ^= 0x80;

  for (let i = 0; i < laneCount; i++) {
    const p = i << 3;
    sL[i] ^= block[p] | (block[p + 1] << 8) | (block[p + 2] << 16) | (block[p + 3] << 24);
    sH[i] ^= block[p + 4] | (block[p + 5] << 8) | (block[p + 6] << 16) | (block[p + 7] << 24);
  }
  keccakF1600(sL, sH, cL, cH, dL, dH, bL, bH);

  const out = new Uint8Array(outBytes);
  const outLanes = outBytes >>> 3;
  for (let i = 0; i < outLanes; i++) {
    const p = i << 3;
    const lo = sL[i];
    const hi = sH[i];
    out[p] = lo & 0xff;
    out[p + 1] = (lo >>> 8) & 0xff;
    out[p + 2] = (lo >>> 16) & 0xff;
    out[p + 3] = (lo >>> 24) & 0xff;
    out[p + 4] = hi & 0xff;
    out[p + 5] = (hi >>> 8) & 0xff;
    out[p + 6] = (hi >>> 16) & 0xff;
    out[p + 7] = (hi >>> 24) & 0xff;
  }
  return out;
}

export function sha3_256Bytes(input: Uint8Array): Uint8Array {
  return sha3Core(input, 136, 32);
}

export function sha3_512Bytes(input: Uint8Array): Uint8Array {
  return sha3Core(input, 72, 64);
}

// ---------------------------------------------------------------------------
// BLAKE2b & BLAKE2s (RFC 7693) using 32-bit arithmetic
// ---------------------------------------------------------------------------

const BLAKE2_SIGMA: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
];

const BLAKE2B_IV_L = new Uint32Array([
  0xf3bcc908, 0x84caa73b, 0xfe94f82b, 0x5f1d36f1,
  0xade682d1, 0x2b3e6c1f, 0xfb41bd6b, 0x137e2179,
]);

const BLAKE2B_IV_H = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function blake2bG(
  vL: Uint32Array,
  vH: Uint32Array,
  a: number,
  b: number,
  c: number,
  d: number,
  xL: number,
  xH: number,
  yL: number,
  yH: number,
): void {
  let aL = vL[a];
  let aH = vH[a];
  let bL = vL[b];
  let bH = vH[b];
  let cL = vL[c];
  let cH = vH[c];
  let dL = vL[d];
  let dH = vH[d];

  // v[a] = v[a] + v[b] + x
  let sum = (aL >>> 0) + (bL >>> 0) + (xL >>> 0);
  aL = sum >>> 0;
  aH = (aH + bH + xH + Math.floor(sum / 0x100000000)) >>> 0;

  // v[d] = rotr64(v[d] ^ v[a], 32)
  let tL = dL ^ aL;
  let tH = dH ^ aH;
  dL = tH >>> 0;
  dH = tL >>> 0;

  // v[c] = v[c] + v[d]
  sum = (cL >>> 0) + (dL >>> 0);
  cL = sum >>> 0;
  cH = (cH + dH + (sum > 0xffffffff ? 1 : 0)) >>> 0;

  // v[b] = rotr64(v[b] ^ v[c], 24)
  tL = bL ^ cL;
  tH = bH ^ cH;
  bL = ((tL >>> 24) | (tH << 8)) >>> 0;
  bH = ((tH >>> 24) | (tL << 8)) >>> 0;

  // v[a] = v[a] + v[b] + y
  sum = (aL >>> 0) + (bL >>> 0) + (yL >>> 0);
  aL = sum >>> 0;
  aH = (aH + bH + yH + Math.floor(sum / 0x100000000)) >>> 0;

  // v[d] = rotr64(v[d] ^ v[a], 16)
  tL = dL ^ aL;
  tH = dH ^ aH;
  dL = ((tL >>> 16) | (tH << 16)) >>> 0;
  dH = ((tH >>> 16) | (tL << 16)) >>> 0;

  // v[c] = v[c] + v[d]
  sum = (cL >>> 0) + (dL >>> 0);
  cL = sum >>> 0;
  cH = (cH + dH + (sum > 0xffffffff ? 1 : 0)) >>> 0;

  // v[b] = rotr64(v[b] ^ v[c], 63)  == rotl64(..., 1)
  tL = bL ^ cL;
  tH = bH ^ cH;
  bL = ((tL << 1) | (tH >>> 31)) >>> 0;
  bH = ((tH << 1) | (tL >>> 31)) >>> 0;

  vL[a] = aL;
  vH[a] = aH;
  vL[b] = bL;
  vH[b] = bH;
  vL[c] = cL;
  vH[c] = cH;
  vL[d] = dL;
  vH[d] = dH;
}

function blake2bCompress(
  hL: Uint32Array,
  hH: Uint32Array,
  src: Uint8Array,
  byteOffset: number,
  mL: Uint32Array,
  mH: Uint32Array,
  vL: Uint32Array,
  vH: Uint32Array,
  t0L: number,
  t0H: number,
  isLast: boolean,
): void {
  for (let i = 0; i < 16; i++) {
    const p = byteOffset + (i << 3);
    mL[i] = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0;
    mH[i] = (src[p + 4] | (src[p + 5] << 8) | (src[p + 6] << 16) | (src[p + 7] << 24)) >>> 0;
  }

  for (let i = 0; i < 8; i++) {
    vL[i] = hL[i];
    vH[i] = hH[i];
    vL[i + 8] = BLAKE2B_IV_L[i];
    vH[i + 8] = BLAKE2B_IV_H[i];
  }
  vL[12] = (vL[12] ^ t0L) >>> 0;
  vH[12] = (vH[12] ^ t0H) >>> 0;
  if (isLast) {
    vL[14] = (~vL[14]) >>> 0;
    vH[14] = (~vH[14]) >>> 0;
  }

  for (let r = 0; r < 12; r++) {
    const s = BLAKE2_SIGMA[r % 10];
    blake2bG(vL, vH, 0, 4, 8, 12, mL[s[0]], mH[s[0]], mL[s[1]], mH[s[1]]);
    blake2bG(vL, vH, 1, 5, 9, 13, mL[s[2]], mH[s[2]], mL[s[3]], mH[s[3]]);
    blake2bG(vL, vH, 2, 6, 10, 14, mL[s[4]], mH[s[4]], mL[s[5]], mH[s[5]]);
    blake2bG(vL, vH, 3, 7, 11, 15, mL[s[6]], mH[s[6]], mL[s[7]], mH[s[7]]);
    blake2bG(vL, vH, 0, 5, 10, 15, mL[s[8]], mH[s[8]], mL[s[9]], mH[s[9]]);
    blake2bG(vL, vH, 1, 6, 11, 12, mL[s[10]], mH[s[10]], mL[s[11]], mH[s[11]]);
    blake2bG(vL, vH, 2, 7, 8, 13, mL[s[12]], mH[s[12]], mL[s[13]], mH[s[13]]);
    blake2bG(vL, vH, 3, 4, 9, 14, mL[s[14]], mH[s[14]], mL[s[15]], mH[s[15]]);
  }

  for (let i = 0; i < 8; i++) {
    hL[i] = (hL[i] ^ vL[i] ^ vL[i + 8]) >>> 0;
    hH[i] = (hH[i] ^ vH[i] ^ vH[i + 8]) >>> 0;
  }
}

export function blake2bBytes(input: Uint8Array, outBytes: 32 | 64 = 32): Uint8Array {
  const hL = new Uint32Array(BLAKE2B_IV_L);
  const hH = new Uint32Array(BLAKE2B_IV_H);
  hL[0] = (hL[0] ^ (0x01010000 ^ outBytes)) >>> 0; // fanout=1, depth=1, keyLen=0, outLen=outBytes

  const mL = new Uint32Array(16);
  const mH = new Uint32Array(16);
  const vL = new Uint32Array(16);
  const vH = new Uint32Array(16);
  const block = new Uint8Array(128);
  let offset = 0;
  let total = 0;

  if (input.length === 0) {
    blake2bCompress(hL, hH, block, 0, mL, mH, vL, vH, 0, 0, true);
  } else {
    while (offset + 128 < input.length) {
      total += 128;
      blake2bCompress(
        hL,
        hH,
        input,
        offset,
        mL,
        mH,
        vL,
        vH,
        total >>> 0,
        Math.floor(total / 0x100000000) >>> 0,
        false,
      );
      offset += 128;
    }
    block.fill(0);
    const rem = input.length - offset;
    block.set(input.subarray(offset), 0);
    total += rem;
    blake2bCompress(
      hL,
      hH,
      block,
      0,
      mL,
      mH,
      vL,
      vH,
      total >>> 0,
      Math.floor(total / 0x100000000) >>> 0,
      true,
    );
  }

  const out = new Uint8Array(outBytes);
  const words = outBytes >>> 3;
  for (let i = 0; i < words; i++) {
    const p = i << 3;
    const lo = hL[i];
    const hi = hH[i];
    out[p] = lo & 0xff;
    out[p + 1] = (lo >>> 8) & 0xff;
    out[p + 2] = (lo >>> 16) & 0xff;
    out[p + 3] = (lo >>> 24) & 0xff;
    out[p + 4] = hi & 0xff;
    out[p + 5] = (hi >>> 8) & 0xff;
    out[p + 6] = (hi >>> 16) & 0xff;
    out[p + 7] = (hi >>> 24) & 0xff;
  }
  return out;
}

export function blake2b256Bytes(input: Uint8Array): Uint8Array {
  return blake2bBytes(input, 32);
}

const BLAKE2S_IV: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function blake2sMix(v: Uint32Array, a: number, b: number, c: number, d: number, x: number, y: number): void {
  v[a] = (v[a] + v[b] + x) >>> 0;
  v[d] = rotr32(v[d] ^ v[a], 16);
  v[c] = (v[c] + v[d]) >>> 0;
  v[b] = rotr32(v[b] ^ v[c], 12);
  v[a] = (v[a] + v[b] + y) >>> 0;
  v[d] = rotr32(v[d] ^ v[a], 8);
  v[c] = (v[c] + v[d]) >>> 0;
  v[b] = rotr32(v[b] ^ v[c], 7);
}

function blake2sCompress(
  h: Uint32Array,
  src: Uint8Array,
  byteOffset: number,
  m: Uint32Array,
  v: Uint32Array,
  tLow: number,
  tHigh: number,
  isLast: boolean,
): void {
  for (let i = 0; i < 16; i++) {
    const p = byteOffset + (i << 2);
    m[i] = (src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24)) >>> 0;
  }

  for (let i = 0; i < 8; i++) {
    v[i] = h[i];
    v[i + 8] = BLAKE2S_IV[i];
  }
  v[12] = (v[12] ^ tLow) >>> 0;
  v[13] = (v[13] ^ tHigh) >>> 0;
  if (isLast) {
    v[14] = (v[14] ^ 0xffffffff) >>> 0;
  }

  for (let r = 0; r < 10; r++) {
    const s = BLAKE2_SIGMA[r];
    blake2sMix(v, 0, 4, 8, 12, m[s[0]], m[s[1]]);
    blake2sMix(v, 1, 5, 9, 13, m[s[2]], m[s[3]]);
    blake2sMix(v, 2, 6, 10, 14, m[s[4]], m[s[5]]);
    blake2sMix(v, 3, 7, 11, 15, m[s[6]], m[s[7]]);
    blake2sMix(v, 0, 5, 10, 15, m[s[8]], m[s[9]]);
    blake2sMix(v, 1, 6, 11, 12, m[s[10]], m[s[11]]);
    blake2sMix(v, 2, 7, 8, 13, m[s[12]], m[s[13]]);
    blake2sMix(v, 3, 4, 9, 14, m[s[14]], m[s[15]]);
  }

  for (let i = 0; i < 8; i++) {
    h[i] = (h[i] ^ v[i] ^ v[i + 8]) >>> 0;
  }
}

export function blake2s256Bytes(input: Uint8Array): Uint8Array {
  const h = new Uint32Array(BLAKE2S_IV);
  h[0] = (h[0] ^ 0x01010020) >>> 0; // fanout=1, depth=1, keyLen=0, outLen=32

  const m = new Uint32Array(16);
  const v = new Uint32Array(16);
  const block = new Uint8Array(64);
  let offset = 0;
  let total = 0;

  if (input.length === 0) {
    blake2sCompress(h, block, 0, m, v, 0, 0, true);
  } else {
    while (offset + 64 < input.length) {
      total += 64;
      blake2sCompress(h, input, offset, m, v, total >>> 0, Math.floor(total / 0x100000000) >>> 0, false);
      offset += 64;
    }
    block.fill(0);
    const rem = input.length - offset;
    block.set(input.subarray(offset), 0);
    total += rem;
    blake2sCompress(h, block, 0, m, v, total >>> 0, Math.floor(total / 0x100000000) >>> 0, true);
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    outView.setUint32(i * 4, h[i], true);
  }
  return out;
}
