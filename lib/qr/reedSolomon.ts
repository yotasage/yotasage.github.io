// Reed-Solomon error correction over GF(256) with the QR code polynomial x^8 + x^4 + x^3 + x^2 + 1,
// plus the BCH codes used for format and version information.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function multiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

const generatorCache = new Map<number, Uint8Array>();

// Coefficients of (x - a^0)(x - a^1)...(x - a^(degree-1)), highest power first, leading 1 omitted.
function generator(degree: number): Uint8Array {
  let cached = generatorCache.get(degree);
  if (cached) return cached;

  const poly = new Uint8Array(degree);
  poly[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      poly[j] = multiply(poly[j], root);
      if (j + 1 < degree) poly[j] ^= poly[j + 1];
    }
    root = multiply(root, 0x02);
  }
  generatorCache.set(degree, poly);
  return poly;
}

export function reedSolomonRemainder(data: ArrayLike<number>, degree: number): Uint8Array {
  const gen = generator(degree);
  const result = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result[0];
    result.copyWithin(0, 1);
    result[degree - 1] = 0;
    for (let j = 0; j < degree; j++) result[j] ^= multiply(gen[j], factor);
  }
  return result;
}

// Returns data << ecBits | remainder, where the remainder is computed with the given BCH generator.
export function bchEncode(data: number, ecBits: number, generatorPoly: number): number {
  let rem = data << ecBits;
  const top = 31 - Math.clz32(generatorPoly);
  for (let bit = 31 - Math.clz32(rem); bit >= top; bit--) {
    if (rem & (1 << bit)) rem ^= generatorPoly << (bit - top);
  }
  return (data << ecBits) | rem;
}
