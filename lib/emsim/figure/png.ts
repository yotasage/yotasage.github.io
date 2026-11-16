// PNG files and data URIs without a canvas (step M8.1a): the field maps' images for the SVG (as data URIs) and for
// TikZ (as files beside the document). Compressed with fflate (already a dependency, MIT) at its default level;
// filter 0 per row (the maps are smooth, but the files stay small at grid sizes, and filtering would cost time).

import { zlibSync } from 'fflate';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

function crc32(b: Uint8Array, from: number, to: number): number {
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A PNG of RGBA bytes (w × h, row 0 at the top); `alpha: false` writes RGB, `grey` writes grey (+ alpha) from R. */
export function encodePng(rgba: ArrayLike<number>, w: number, h: number, opt: { alpha?: boolean; grey?: boolean } = {}): Uint8Array {
  const alpha = opt.alpha !== false, grey = !!opt.grey;
  const ch = (grey ? 1 : 3) + (alpha ? 1 : 0);
  const raw = new Uint8Array(h * (1 + w * ch));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (grey) raw[o++] = rgba[i]; else { raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2]; }
      if (alpha) raw[o++] = rgba[i + 3];
    }
  }
  const idat = zlibSync(raw, { level: 6 });
  const type = grey ? (alpha ? 4 : 0) : (alpha ? 6 : 2);
  const chunks: [string, Uint8Array][] = [
    ['IHDR', new Uint8Array([w >>> 24, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255, 8, type, 0, 0, 0])],
    ['IDAT', idat],
    ['IEND', new Uint8Array(0)],
  ];
  const size = 8 + chunks.reduce((n, [, d]) => n + 12 + d.length, 0);
  const out = new Uint8Array(size);
  out.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let p = 8;
  for (const [name, d] of chunks) {
    const n = d.length;
    out[p] = n >>> 24; out[p + 1] = (n >>> 16) & 255; out[p + 2] = (n >>> 8) & 255; out[p + 3] = n & 255;
    for (let k = 0; k < 4; k++) out[p + 4 + k] = name.charCodeAt(k);
    out.set(d, p + 8);
    const c = crc32(out, p + 4, p + 8 + n);
    out[p + 8 + n] = c >>> 24; out[p + 9 + n] = (c >>> 16) & 255; out[p + 10 + n] = (c >>> 8) & 255; out[p + 11 + n] = c & 255;
    p += 12 + n;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 of bytes (no btoa, so it runs the same in a worker, the page and Node). */
export function base64(b: Uint8Array): string {
  const parts: string[] = [];
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + (i + 1 < b.length ? B64[(n >>> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
    if (s.length > 8192) { parts.push(s); s = ''; }
  }
  parts.push(s);
  return parts.join('');
}

export const pngDataUri = (png: Uint8Array): string => `data:image/png;base64,${base64(png)}`;
