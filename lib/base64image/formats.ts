// Recognises file formats from their first bytes, since raw Base64 says nothing about what it holds and the type in a
// data URL can be wrong.

export interface FileFormat {
  mime: string;
  ext: string;
  name: string;
  // False for the few non-image formats that are recognised, so they can be named instead of shown as broken images.
  image: boolean;
}

const PNG: FileFormat = { mime: 'image/png', ext: 'png', name: 'PNG', image: true };
const JPEG: FileFormat = { mime: 'image/jpeg', ext: 'jpg', name: 'JPEG', image: true };
const GIF: FileFormat = { mime: 'image/gif', ext: 'gif', name: 'GIF', image: true };
const WEBP: FileFormat = { mime: 'image/webp', ext: 'webp', name: 'WebP', image: true };
const BMP: FileFormat = { mime: 'image/bmp', ext: 'bmp', name: 'BMP', image: true };
const ICO: FileFormat = { mime: 'image/x-icon', ext: 'ico', name: 'ICO (icon)', image: true };
const CUR: FileFormat = { mime: 'image/x-icon', ext: 'cur', name: 'CUR (cursor)', image: true };
const TIFF: FileFormat = { mime: 'image/tiff', ext: 'tif', name: 'TIFF', image: true };
const AVIF: FileFormat = { mime: 'image/avif', ext: 'avif', name: 'AVIF', image: true };
const HEIC: FileFormat = { mime: 'image/heic', ext: 'heic', name: 'HEIC', image: true };
const HEIF: FileFormat = { mime: 'image/heif', ext: 'heif', name: 'HEIF', image: true };
const JXL: FileFormat = { mime: 'image/jxl', ext: 'jxl', name: 'JPEG XL', image: true };
const SVG: FileFormat = { mime: 'image/svg+xml', ext: 'svg', name: 'SVG', image: true };
const PDF: FileFormat = { mime: 'application/pdf', ext: 'pdf', name: 'PDF', image: false };
const ZIP: FileFormat = { mime: 'application/zip', ext: 'zip', name: 'ZIP', image: false };
const GZIP: FileFormat = { mime: 'application/gzip', ext: 'gz', name: 'gzip', image: false };

const KNOWN = [PNG, JPEG, GIF, WEBP, BMP, ICO, TIFF, AVIF, HEIC, HEIF, JXL, SVG, PDF, ZIP, GZIP];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

// HEIF, HEIC and AVIF are ISO base media files; the brands in the ftyp box tell them apart.
function isoBrands(bytes: Uint8Array): string[] {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') return [];
  const boxSize = Math.min(bytes.length, (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]);
  const brands = [ascii(bytes, 8, 4)];
  for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(bytes, i, 4));
  return brands;
}

function isSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 4096)).trimStart();
  return head.startsWith('<') && /<svg[\s>]/i.test(head);
}

export function detectFormat(bytes: Uint8Array): FileFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return PNG;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return JPEG;
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return GIF;
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return WEBP;
  // "BM" alone is too common, so the size of the header that follows must also be one of the known ones.
  if (ascii(bytes, 0, 2) === 'BM' && bytes.length >= 18 && [12, 40, 52, 56, 64, 108, 124].includes(bytes[14] | (bytes[15] << 8))) return BMP;
  if (startsWith(bytes, [0, 0, 1, 0]) && bytes.length > 6 && bytes[4] + bytes[5] > 0) return ICO;
  if (startsWith(bytes, [0, 0, 2, 0]) && bytes.length > 6 && bytes[4] + bytes[5] > 0) return CUR;
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return TIFF;
  if (startsWith(bytes, [0xff, 0x0a]) || startsWith(bytes, [0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])) return JXL;
  const brands = isoBrands(bytes);
  if (brands.some((b) => b === 'avif' || b === 'avis')) return AVIF;
  if (brands.some((b) => ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs'].includes(b))) return HEIC;
  if (brands.some((b) => b === 'mif1' || b === 'msf1')) return HEIF;
  if (ascii(bytes, 0, 5) === '%PDF-') return PDF;
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return ZIP;
  if (startsWith(bytes, [0x1f, 0x8b])) return GZIP;
  if (isSvg(bytes)) return SVG;
  return null;
}

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/vnd.microsoft.icon': 'image/x-icon',
  'image/ico': 'image/x-icon',
  'image/x-ms-bmp': 'image/bmp',
  'image/svg': 'image/svg+xml',
};

export function normalizeMime(mime: string): string {
  const m = mime.trim().toLowerCase();
  return MIME_ALIASES[m] ?? m;
}

// The format for a MIME type, for data that was not recognised from its bytes.
export function formatForMime(mime: string): FileFormat {
  const m = normalizeMime(mime);
  const known = KNOWN.find((f) => f.mime === m);
  if (known) return known;
  const sub = m.split('/')[1]?.split('+')[0].replace(/[^a-z0-9]/g, '') || 'bin';
  return { mime: m, ext: sub, name: m, image: m.startsWith('image/') };
}
