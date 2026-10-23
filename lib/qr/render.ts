// Rendering of encoded symbols to canvas, SVG and PDF, plus helpers for raster export metadata.

import type { QrSymbol } from './encoder';

export type ModuleShape = 'square' | 'rounded' | 'dots';

export interface Logo {
  dataUrl: string;
  image: HTMLImageElement;
  aspect: number;     // width / height
  scale: number;      // logo height as a fraction of the symbol's shorter side
  clear: boolean;     // leave the modules under the logo light
  padding: number;    // extra cleared margin around the logo, in modules
  backdrop: boolean;  // paint the background colour behind the logo
}

export interface RenderOptions {
  quietZone: number;           // modules
  foreground: string;          // #rrggbb
  background: string;          // #rrggbb
  transparent: boolean;
  shape: ModuleShape;
  squareFunctionPatterns: boolean; // draw finder/timing/alignment patterns as plain squares
  logo: Logo | null;
}

interface Rect { x: number; y: number; w: number; h: number }

// Logo rectangle in symbol module coordinates (without quiet zone).
export function logoRect(sym: QrSymbol, logo: Logo): Rect {
  const h = Math.min(sym.width, sym.height) * logo.scale;
  const w = h * logo.aspect;
  return { x: (sym.width - w) / 2, y: (sym.height - h) / 2, w, h };
}

function clearedRect(sym: QrSymbol, logo: Logo | null): Rect | null {
  if (!logo || !logo.clear) return null;
  const r = logoRect(sym, logo);
  return { x: r.x - logo.padding, y: r.y - logo.padding, w: r.w + 2 * logo.padding, h: r.h + 2 * logo.padding };
}

function inside(r: Rect | null, x: number, y: number) {
  return r !== null && x + 0.5 >= r.x && x + 0.5 <= r.x + r.w && y + 0.5 >= r.y && y + 0.5 <= r.y + r.h;
}

// Every dark module to draw, after removing the ones hidden by a cleared logo area.
function visibleModules(sym: QrSymbol, opts: RenderOptions): { x: number; y: number; func: boolean }[] {
  const cleared = clearedRect(sym, opts.logo);
  const out = [];
  for (let y = 0; y < sym.height; y++) {
    for (let x = 0; x < sym.width; x++) {
      const i = y * sym.width + x;
      if (!sym.modules[i]) continue;
      const func = sym.functionModules[i] === 1;
      if (!func && inside(cleared, x, y)) continue;
      out.push({ x, y, func });
    }
  }
  return out;
}

// Statistics about how much of the data area a logo hides.
export function logoCoverage(sym: QrSymbol, logo: Logo | null): { dataModules: number; covered: number; functionCovered: number } {
  let dataModules = 0;
  let covered = 0;
  let functionCovered = 0;
  const r = logo ? (logo.clear ? clearedRect(sym, logo) : logoRect(sym, logo)) : null;
  for (let y = 0; y < sym.height; y++) {
    for (let x = 0; x < sym.width; x++) {
      const func = sym.functionModules[y * sym.width + x] === 1;
      if (!func) dataModules++;
      if (inside(r, x, y)) {
        if (func) functionCovered++;
        else covered++;
      }
    }
  }
  return { dataModules, covered, functionCovered };
}

const ROUND_RADIUS = 0.35;
const DOT_RADIUS = 0.45;

function moduleShape(opts: RenderOptions, func: boolean): ModuleShape {
  return func && opts.squareFunctionPatterns ? 'square' : opts.shape;
}

// ---------------------------------------------------------------------------------------------
// Canvas

export function drawToCanvas(canvas: HTMLCanvasElement, sym: QrSymbol, opts: RenderOptions, scale: number, forceOpaque = false) {
  const q = opts.quietZone;
  canvas.width = Math.round((sym.width + 2 * q) * scale);
  canvas.height = Math.round((sym.height + 2 * q) * scale);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!opts.transparent || forceOpaque) {
    ctx.fillStyle = opts.transparent ? '#ffffff' : opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = opts.foreground;
  ctx.beginPath();
  for (const m of visibleModules(sym, opts)) {
    const x = (m.x + q) * scale;
    const y = (m.y + q) * scale;
    switch (moduleShape(opts, m.func)) {
      case 'square':
        // Integer edges keep neighbouring modules from showing hairline gaps.
        ctx.rect(Math.round(x), Math.round(y), Math.round(x + scale) - Math.round(x), Math.round(y + scale) - Math.round(y));
        break;
      case 'rounded':
        ctx.roundRect(x, y, scale, scale, ROUND_RADIUS * scale);
        break;
      case 'dots':
        ctx.moveTo(x + scale / 2 + DOT_RADIUS * scale, y + scale / 2);
        ctx.arc(x + scale / 2, y + scale / 2, DOT_RADIUS * scale, 0, Math.PI * 2);
        break;
    }
  }
  ctx.fill();

  if (opts.logo) {
    const r = logoRect(sym, opts.logo);
    if (opts.logo.backdrop) {
      const c = clearedRect(sym, opts.logo) ?? r;
      ctx.fillStyle = forceOpaque && opts.transparent ? '#ffffff' : opts.background;
      if (!opts.transparent || forceOpaque) ctx.fillRect((c.x + q) * scale, (c.y + q) * scale, c.w * scale, c.h * scale);
    }
    ctx.drawImage(opts.logo.image, (r.x + q) * scale, (r.y + q) * scale, r.w * scale, r.h * scale);
  }
}

// ---------------------------------------------------------------------------------------------
// SVG

function fmt(n: number) {
  return Number(n.toFixed(4)).toString();
}

export function toSvg(sym: QrSymbol, opts: RenderOptions, physical: { width: string; height: string } | null): string {
  const q = opts.quietZone;
  const W = sym.width + 2 * q;
  const H = sym.height + 2 * q;
  const modules = visibleModules(sym, opts);

  const squares: string[] = [];
  const others: string[] = [];
  // Merge horizontal runs of square modules into single rectangles to keep the file small.
  const squareSet = new Set(modules.filter((m) => moduleShape(opts, m.func) === 'square').map((m) => m.y * sym.width + m.x));
  for (let y = 0; y < sym.height; y++) {
    for (let x = 0; x < sym.width; x++) {
      if (!squareSet.has(y * sym.width + x)) continue;
      let run = 1;
      while (x + run < sym.width && squareSet.has(y * sym.width + x + run)) run++;
      squares.push(`M${x + q} ${y + q}h${run}v1h-${run}z`);
      x += run - 1;
    }
  }
  for (const m of modules) {
    const shape = moduleShape(opts, m.func);
    const x = m.x + q;
    const y = m.y + q;
    if (shape === 'rounded') {
      const r = ROUND_RADIUS;
      others.push(`M${fmt(x + r)} ${y}h${fmt(1 - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${fmt(1 - 2 * r)}a${r} ${r} 0 0 1 -${r} ${r}h-${fmt(1 - 2 * r)}a${r} ${r} 0 0 1 -${r} -${r}v-${fmt(1 - 2 * r)}a${r} ${r} 0 0 1 ${r} -${r}z`);
    } else if (shape === 'dots') {
      const r = DOT_RADIUS;
      others.push(`M${fmt(x + 0.5 - r)} ${fmt(y + 0.5)}a${r} ${r} 0 1 0 ${fmt(2 * r)} 0a${r} ${r} 0 1 0 -${fmt(2 * r)} 0z`);
    }
  }

  const size = physical ? `width="${physical.width}" height="${physical.height}"` : `width="${W * 8}" height="${H * 8}"`;
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" ${size}>`,
  ];
  if (!opts.transparent) parts.push(`<rect width="${W}" height="${H}" fill="${opts.background}"/>`);
  if (squares.length) parts.push(`<path fill="${opts.foreground}" shape-rendering="crispEdges" d="${squares.join('')}"/>`);
  if (others.length) parts.push(`<path fill="${opts.foreground}" d="${others.join('')}"/>`);
  if (opts.logo) {
    const r = logoRect(sym, opts.logo);
    if (opts.logo.backdrop && !opts.transparent) {
      const c = clearedRect(sym, opts.logo) ?? r;
      parts.push(`<rect x="${fmt(c.x + q)}" y="${fmt(c.y + q)}" width="${fmt(c.w)}" height="${fmt(c.h)}" fill="${opts.background}"/>`);
    }
    parts.push(`<image x="${fmt(r.x + q)}" y="${fmt(r.y + q)}" width="${fmt(r.w)}" height="${fmt(r.h)}" preserveAspectRatio="xMidYMid meet" href="${opts.logo.dataUrl}" xlink:href="${opts.logo.dataUrl}"/>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------------------------
// PDF (a single page, vector modules, optional JPEG logo)

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255) as [number, number, number];
}

export interface PdfLogo {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

export function toPdf(sym: QrSymbol, opts: RenderOptions, moduleMm: number, logoJpeg: PdfLogo | null, title: string): Uint8Array {
  const q = opts.quietZone;
  const W = sym.width + 2 * q;
  const H = sym.height + 2 * q;
  const pt = (moduleMm * 72) / 25.4; // points per module
  const pageW = W * pt;
  const pageH = H * pt;
  const n = (v: number) => Number(v.toFixed(4)).toString();
  const color = (hex: string) => hexToRgb(hex).map((c) => n(c)).join(' ');

  // Module units with y pointing down, like the other renderers.
  const ops: string[] = [`${n(pt)} 0 0 ${n(-pt)} 0 ${n(pageH)} cm`];
  if (!opts.transparent) ops.push(`${color(opts.background)} rg 0 0 ${W} ${H} re f`);
  ops.push(`${color(opts.foreground)} rg`);

  const k = 0.5523; // Bezier approximation of a quarter circle
  for (const m of visibleModules(sym, opts)) {
    const x = m.x + q;
    const y = m.y + q;
    const shape = moduleShape(opts, m.func);
    if (shape === 'square') {
      ops.push(`${x} ${y} 1 1 re`);
    } else if (shape === 'dots') {
      const r = DOT_RADIUS;
      const cx = x + 0.5;
      const cy = y + 0.5;
      const c = r * k;
      ops.push(
        `${n(cx + r)} ${n(cy)} m`,
        `${n(cx + r)} ${n(cy + c)} ${n(cx + c)} ${n(cy + r)} ${n(cx)} ${n(cy + r)} c`,
        `${n(cx - c)} ${n(cy + r)} ${n(cx - r)} ${n(cy + c)} ${n(cx - r)} ${n(cy)} c`,
        `${n(cx - r)} ${n(cy - c)} ${n(cx - c)} ${n(cy - r)} ${n(cx)} ${n(cy - r)} c`,
        `${n(cx + c)} ${n(cy - r)} ${n(cx + r)} ${n(cy - c)} ${n(cx + r)} ${n(cy)} c h`,
      );
    } else {
      const r = ROUND_RADIUS;
      const c = r * (1 - k);
      ops.push(
        `${n(x + r)} ${n(y)} m ${n(x + 1 - r)} ${n(y)} l`,
        `${n(x + 1 - c)} ${n(y)} ${n(x + 1)} ${n(y + c)} ${n(x + 1)} ${n(y + r)} c`,
        `${n(x + 1)} ${n(y + 1 - r)} l ${n(x + 1)} ${n(y + 1 - c)} ${n(x + 1 - c)} ${n(y + 1)} ${n(x + 1 - r)} ${n(y + 1)} c`,
        `${n(x + r)} ${n(y + 1)} l ${n(x + c)} ${n(y + 1)} ${n(x)} ${n(y + 1 - c)} ${n(x)} ${n(y + 1 - r)} c`,
        `${n(x)} ${n(y + r)} l ${n(x)} ${n(y + c)} ${n(x + c)} ${n(y)} ${n(x + r)} ${n(y)} c h`,
      );
    }
  }
  ops.push('f');

  if (opts.logo && logoJpeg) {
    const r = logoRect(sym, opts.logo);
    if (opts.logo.backdrop && !opts.transparent) {
      const c = clearedRect(sym, opts.logo) ?? r;
      ops.push(`${color(opts.background)} rg ${n(c.x + q)} ${n(c.y + q)} ${n(c.w)} ${n(c.h)} re f`);
    }
    ops.push(`q ${n(r.w)} 0 0 ${n(-r.h)} ${n(r.x + q)} ${n(r.y + q + r.h)} cm /Logo Do Q`);
  }

  const content = ops.join('\n');
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const write = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length;
    write(`${id} 0 obj\n${body}\n`);
    if (stream) {
      write('stream\n');
      write(stream);
      write('\nendstream\n');
    }
    write('endobj\n');
  };
  const pdfString = (s: string) => `(${s.replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7e]/g, '?')})`;

  write('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const resources = logoJpeg ? '/Resources << /XObject << /Logo 5 0 R >> >>' : '/Resources << >>';
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pageW)} ${n(pageH)}] /Contents 4 0 R ${resources} >>`);
  const contentBytes = enc.encode(content);
  object(4, `<< /Length ${contentBytes.length} >>`, contentBytes);
  if (logoJpeg) {
    object(5, `<< /Type /XObject /Subtype /Image /Width ${logoJpeg.width} /Height ${logoJpeg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoJpeg.jpeg.length} >>`, logoJpeg.jpeg);
  } else {
    object(5, '<< >>');
  }
  object(6, `<< /Title ${pdfString(title)} /Producer (yotasage.github.io QR code generator) >>`);

  const xref = length;
  write(`xref\n0 7\n0000000000 65535 f \n`);
  for (let id = 1; id <= 6; id++) write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Raster metadata

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Inserts a pHYs chunk after IHDR so that the PNG carries its intended print resolution.
export function pngWithDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const ihdrEnd = 8 + 8 + 13 + 4;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(png.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}

// Sets the density fields of the JFIF APP0 segment written by the browser's JPEG encoder.
export function jpegWithDpi(jpeg: Uint8Array, dpi: number): Uint8Array {
  const out = jpeg.slice();
  const isJfif = out[2] === 0xff && out[3] === 0xe0 && String.fromCharCode(out[6], out[7], out[8], out[9]) === 'JFIF';
  if (!isJfif) return out;
  const d = Math.min(65535, Math.round(dpi));
  out[13] = 1; // dots per inch
  out[14] = d >> 8;
  out[15] = d & 255;
  out[16] = d >> 8;
  out[17] = d & 255;
  return out;
}
