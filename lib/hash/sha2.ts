function rotr32(val: number, shift: number): number {
  return ((val >>> shift) | (val << (32 - shift))) >>> 0;
}

// ---------------------------------------------------------------------------
// SHA-256 & SHA-224 (FIPS 180-4)
// ---------------------------------------------------------------------------

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const SHA256_IV = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const SHA224_IV = [
  0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,
  0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4,
] as const;

function sha256Core(input: Uint8Array, iv: readonly number[], outBytes: number): Uint8Array {
  let h0 = iv[0];
  let h1 = iv[1];
  let h2 = iv[2];
  let h3 = iv[3];
  let h4 = iv[4];
  let h5 = iv[5];
  let h6 = iv[6];
  let h7 = iv[7];

  const W = new Uint32Array(64);

  const processBlocks = (src: Uint8Array, limit: number) => {
    for (let offset = 0; offset < limit; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const p = offset + (i << 2);
        W[i] = ((src[p] << 24) | (src[p + 1] << 16) | (src[p + 2] << 8) | src[p + 3]) >>> 0;
      }
      for (let i = 16; i < 64; i++) {
        const w15 = W[i - 15];
        const w2 = W[i - 2];
        const s0 = rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3);
        const s1 = rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;
      let f = h5;
      let g = h6;
      let h = h7;

      for (let i = 0; i < 64; i++) {
        const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (h + S1 + ch + SHA256_K[i] + W[i]) >>> 0;
        const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (S0 + maj) >>> 0;

        h = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }

      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
      h5 = (h5 + f) >>> 0;
      h6 = (h6 + g) >>> 0;
      h7 = (h7 + h) >>> 0;
    }
  };

  const fullBytes = input.length & ~63;
  if (fullBytes > 0) processBlocks(input, fullBytes);

  const rem = input.length - fullBytes;
  const tailLen = rem < 56 ? 64 : 128;
  const tail = new Uint8Array(tailLen);
  if (rem > 0) tail.set(input.subarray(fullBytes), 0);
  tail[rem] = 0x80;

  const bitLen = input.length * 8;
  const tailView = new DataView(tail.buffer);
  tailView.setUint32(tailLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);
  tailView.setUint32(tailLen - 4, bitLen >>> 0, false);
  processBlocks(tail, tailLen);

  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  const out = new Uint8Array(outBytes);
  const outView = new DataView(out.buffer);
  const wordCount = outBytes / 4;
  for (let i = 0; i < wordCount; i++) {
    outView.setUint32(i * 4, words[i], false);
  }
  return out;
}

export function sha256Bytes(input: Uint8Array): Uint8Array {
  return sha256Core(input, SHA256_IV, 32);
}

export function sha224Bytes(input: Uint8Array): Uint8Array {
  return sha256Core(input, SHA224_IV, 28);
}

// ---------------------------------------------------------------------------
// SHA-512 & SHA-384 (FIPS 180-4) using 32-bit split (hi, lo) arithmetic
// ---------------------------------------------------------------------------

const SHA512_K_H = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  0xca273ece, 0xd186b8c7, 0xeada7dd6, 0xf57d4f7f, 0x06f067aa, 0x0a637dc5, 0x113f9804, 0x1b710b35,
  0x28db77f5, 0x32caab7b, 0x3c9ebe0a, 0x431d67c4, 0x4cc5d4be, 0x597f299c, 0x5fcb6fab, 0x6c44198c,
]);

const SHA512_K_L = new Uint32Array([
  0xd728ae22, 0x23ef65cd, 0xec4d3b2f, 0x8189dbbc, 0xf348b538, 0xb605d019, 0xaf194f9b, 0xda6d8118,
  0xa3030242, 0x45706fbe, 0x4ee4b28c, 0xd5ffb4e2, 0xf27b896f, 0x3b1696b1, 0x25c71235, 0xcf692694,
  0x9ef14ad2, 0x384f25e3, 0x8b8cd5b5, 0x77ac9c65, 0x592b0275, 0x6ea6e483, 0xbd41fbd4, 0x831153b5,
  0xee66dfab, 0x2db43210, 0x98fb213f, 0xbeef0ee4, 0x3da88fc2, 0x930aa725, 0xe003826f, 0x0a0e6e70,
  0x46d22ffc, 0x5c26c926, 0x5ac42aed, 0x9d95b3df, 0x8baf63de, 0x3c77b2a8, 0x47edaee6, 0x1482353b,
  0x4cf10364, 0xbc423001, 0xd0f89791, 0x0654be30, 0xd6ef5218, 0x5565a910, 0x5771202a, 0x32bbd1b8,
  0xb8d2d0c8, 0x5141ab53, 0xdf8eeb99, 0xe19b48a8, 0xc5c95a63, 0xe3418acb, 0x7763e373, 0xd6b2b8a3,
  0x5defb2fc, 0x43172f60, 0xa1f0ab72, 0x1a6439ec, 0x23631e28, 0xde82bde9, 0xb2c67915, 0xe372532b,
  0xea26619c, 0x21c0c207, 0xcde0eb1e, 0xee6ed178, 0x72176fba, 0xa2c898a6, 0xbef90dae, 0x131c471b,
  0x23047d84, 0x40c72493, 0x15c9bebc, 0x9c100d4c, 0xcb3e42b6, 0xfc657e2a, 0x3ad6faec, 0x4a475817,
]);

const SHA512_IV_H = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const SHA512_IV_L = [
  0xf3bcc908, 0x84caa73b, 0xfe94f82b, 0x5f1d36f1,
  0xade682d1, 0x2b3e6c1f, 0xfb41bd6b, 0x137e2179,
] as const;

const SHA384_IV_H = [
  0xcbbb9d5d, 0x629a292a, 0x9159015a, 0x152fecd8,
  0x67332667, 0x8eb44a87, 0xdb0c2e0d, 0x47b5481d,
] as const;

const SHA384_IV_L = [
  0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939,
  0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4,
] as const;

function sha512Core(
  input: Uint8Array,
  ivH: readonly number[],
  ivL: readonly number[],
  outBytes: number,
): Uint8Array {
  let h0H = ivH[0], h0L = ivL[0];
  let h1H = ivH[1], h1L = ivL[1];
  let h2H = ivH[2], h2L = ivL[2];
  let h3H = ivH[3], h3L = ivL[3];
  let h4H = ivH[4], h4L = ivL[4];
  let h5H = ivH[5], h5L = ivL[5];
  let h6H = ivH[6], h6L = ivL[6];
  let h7H = ivH[7], h7L = ivL[7];

  const wH = new Uint32Array(80);
  const wL = new Uint32Array(80);

  const processBlocks = (src: Uint8Array, limit: number) => {
    for (let offset = 0; offset < limit; offset += 128) {
      for (let i = 0; i < 16; i++) {
        const p = offset + (i << 3);
        wH[i] = ((src[p] << 24) | (src[p + 1] << 16) | (src[p + 2] << 8) | src[p + 3]) >>> 0;
        wL[i] = ((src[p + 4] << 24) | (src[p + 5] << 16) | (src[p + 6] << 8) | src[p + 7]) >>> 0;
      }

      for (let i = 16; i < 80; i++) {
        const aH = wH[i - 15];
        const aL = wL[i - 15];
        const s0H = ((aH >>> 1) | (aL << 31)) ^ ((aH >>> 8) | (aL << 24)) ^ (aH >>> 7);
        const s0L = ((aL >>> 1) | (aH << 31)) ^ ((aL >>> 8) | (aH << 24)) ^ ((aL >>> 7) | (aH << 25));

        const bH = wH[i - 2];
        const bL = wL[i - 2];
        // rotr(19), rotr(61) == rotl(3), shr(6)
        const s1H = ((bH >>> 19) | (bL << 13)) ^ ((bH << 3) | (bL >>> 29)) ^ (bH >>> 6);
        const s1L = ((bL >>> 19) | (bH << 13)) ^ ((bL << 3) | (bH >>> 29)) ^ ((bL >>> 6) | (bH << 26));

        const sumL = (wL[i - 16] >>> 0) + (s0L >>> 0) + (wL[i - 7] >>> 0) + (s1L >>> 0);
        wL[i] = sumL >>> 0;
        wH[i] = (wH[i - 16] + s0H + wH[i - 7] + s1H + Math.floor(sumL / 0x100000000)) >>> 0;
      }

      let aH = h0H, aL = h0L;
      let bH = h1H, bL = h1L;
      let cH = h2H, cL = h2L;
      let dH = h3H, dL = h3L;
      let eH = h4H, eL = h4L;
      let fH = h5H, fL = h5L;
      let gH = h6H, gL = h6L;
      let hhH = h7H, hhL = h7L;

      for (let i = 0; i < 80; i++) {
        // S1 = rotr(e,14) ^ rotr(e,18) ^ rotr(e,41) [rotr(41) = swap + rotr(9)]
        const S1H = ((eH >>> 14) | (eL << 18)) ^ ((eH >>> 18) | (eL << 14)) ^ ((eL >>> 9) | (eH << 23));
        const S1L = ((eL >>> 14) | (eH << 18)) ^ ((eL >>> 18) | (eH << 14)) ^ ((eH >>> 9) | (eL << 23));
        const chH = (eH & fH) ^ (~eH & gH);
        const chL = (eL & fL) ^ (~eL & gL);

        const t1SumL =
          (hhL >>> 0) + (S1L >>> 0) + (chL >>> 0) + (SHA512_K_L[i] >>> 0) + (wL[i] >>> 0);
        const t1L = t1SumL >>> 0;
        const t1H =
          (hhH + S1H + chH + SHA512_K_H[i] + wH[i] + Math.floor(t1SumL / 0x100000000)) >>> 0;

        // S0 = rotr(a,28) ^ rotr(a,34) [swap+rotr(2)] ^ rotr(a,39) [swap+rotr(7)]
        const S0H = ((aH >>> 28) | (aL << 4)) ^ ((aL >>> 2) | (aH << 30)) ^ ((aL >>> 7) | (aH << 25));
        const S0L = ((aL >>> 28) | (aH << 4)) ^ ((aH >>> 2) | (aL << 30)) ^ ((aH >>> 7) | (aL << 25));
        const majH = (aH & bH) ^ (aH & cH) ^ (bH & cH);
        const majL = (aL & bL) ^ (aL & cL) ^ (bL & cL);

        const t2SumL = (S0L >>> 0) + (majL >>> 0);
        const t2L = t2SumL >>> 0;
        const t2H = (S0H + majH + (t2SumL > 0xffffffff ? 1 : 0)) >>> 0;

        hhH = gH; hhL = gL;
        gH = fH; gL = fL;
        fH = eH; fL = eL;

        const neSumL = (dL >>> 0) + t1L;
        eL = neSumL >>> 0;
        eH = (dH + t1H + (neSumL > 0xffffffff ? 1 : 0)) >>> 0;

        dH = cH; dL = cL;
        cH = bH; cL = bL;
        bH = aH; bL = aL;

        const naSumL = t1L + t2L;
        aL = naSumL >>> 0;
        aH = (t1H + t2H + (naSumL > 0xffffffff ? 1 : 0)) >>> 0;
      }

      let s = (h0L >>> 0) + (aL >>> 0); h0L = s >>> 0; h0H = (h0H + aH + (s > 0xffffffff ? 1 : 0)) >>> 0;
      s = (h1L >>> 0) + (bL >>> 0); h1L = s >>> 0; h1H = (h1H + bH + (s > 0xffffffff ? 1 : 0)) >>> 0;
      s = (h2L >>> 0) + (cL >>> 0); h2L = s >>> 0; h2H = (h2H + cH + (s > 0xffffffff ? 1 : 0)) >>> 0;
      s = (h3L >>> 0) + (dL >>> 0); h3L = s >>> 0; h3H = (h3H + dH + (s > 0xffffffff ? 1 : 0)) >>> 0;
      s = (h4L >>> 0) + (eL >>> 0); h4L = s >>> 0; h4H = (h4H + eH + (s > 0xffffffff ? 1 : 0)) >>> 0;
      s = (h5L >>> 0) + (fL >>> 0); h5L = s >>> 0; h5H = (h5H + fH + (s > 0xffffffff ? 1 : 0)) >>> 0;
      s = (h6L >>> 0) + (gL >>> 0); h6L = s >>> 0; h6H = (h6H + gH + (s > 0xffffffff ? 1 : 0)) >>> 0;
      s = (h7L >>> 0) + (hhL >>> 0); h7L = s >>> 0; h7H = (h7H + hhH + (s > 0xffffffff ? 1 : 0)) >>> 0;
    }
  };

  const fullBytes = input.length & ~127;
  if (fullBytes > 0) processBlocks(input, fullBytes);

  const rem = input.length - fullBytes;
  const tailLen = rem < 112 ? 128 : 256;
  const tail = new Uint8Array(tailLen);
  if (rem > 0) tail.set(input.subarray(fullBytes), 0);
  tail[rem] = 0x80;

  const bitLen = input.length * 8;
  const tailView = new DataView(tail.buffer);
  tailView.setUint32(tailLen - 16, 0, false);
  tailView.setUint32(tailLen - 12, 0, false);
  tailView.setUint32(tailLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);
  tailView.setUint32(tailLen - 4, bitLen >>> 0, false);
  processBlocks(tail, tailLen);

  const hiWords = [h0H, h1H, h2H, h3H, h4H, h5H, h6H, h7H];
  const loWords = [h0L, h1L, h2L, h3L, h4L, h5L, h6L, h7L];
  const out = new Uint8Array(outBytes);
  const outView = new DataView(out.buffer);
  const wordCount = outBytes / 8;
  for (let i = 0; i < wordCount; i++) {
    outView.setUint32(i * 8, hiWords[i], false);
    outView.setUint32(i * 8 + 4, loWords[i], false);
  }
  return out;
}

export function sha512Bytes(input: Uint8Array): Uint8Array {
  return sha512Core(input, SHA512_IV_H, SHA512_IV_L, 64);
}

export function sha384Bytes(input: Uint8Array): Uint8Array {
  return sha512Core(input, SHA384_IV_H, SHA384_IV_L, 48);
}
