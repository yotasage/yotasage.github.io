// Helpers for the raw content of a code: hex dumps, recognising files by their first bytes, decoding text in a
// chosen character set and showing control characters.

export function hex(bytes: ArrayLike<number>, sep = ' '): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(sep);
}

/** Classic hex dump: offset, 16 bytes in hex, the printable ASCII. */
export function hexDump(bytes: Uint8Array, width = 16): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += width) {
    const row = bytes.subarray(i, i + width);
    const hexPart = Array.from(row, (b, j) => b.toString(16).padStart(2, '0') + (j === 7 && width === 16 ? ' ' : '')).join(' ');
    const ascii = Array.from(row, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    const pad = width * 3 + (width === 16 ? 1 : 0) - 1;
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hexPart.padEnd(pad)}  |${ascii}|`);
  }
  return lines.join('\n');
}

export interface Sniffed {
  mime: string;
  label: string;
  ext: string;
  /** Images a browser shows. */
  image?: boolean;
  /** Compressed data worth unpacking. */
  packed?: 'gzip' | 'zlib' | 'zip';
}

const at = (b: Uint8Array, offset: number, ...values: number[]) => values.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, offset: number, text: string) => [...text].every((c, i) => b[offset + i] === c.charCodeAt(0));

/** Recognises a file by its first bytes ("magic numbers"), or null. */
export function sniff(b: Uint8Array): Sniffed | null {
  if (b.length < 4) return null;
  if (at(b, 0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', label: 'PNG image', ext: 'png', image: true };
  if (at(b, 0, 0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', label: 'JPEG image', ext: 'jpg', image: true };
  if (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a')) return { mime: 'image/gif', label: 'GIF image', ext: 'gif', image: true };
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return { mime: 'image/webp', label: 'WebP image', ext: 'webp', image: true };
  if (ascii(b, 4, 'ftypavif') || ascii(b, 4, 'ftypavis')) return { mime: 'image/avif', label: 'AVIF image', ext: 'avif', image: true };
  if (ascii(b, 0, 'BM') && b.length > 26) return { mime: 'image/bmp', label: 'BMP image', ext: 'bmp', image: true };
  if (at(b, 0, 0x00, 0x00, 0x01, 0x00)) return { mime: 'image/x-icon', label: 'Icon (ICO)', ext: 'ico', image: true };
  if (ascii(b, 0, 'qoif')) return { mime: 'image/qoi', label: 'QOI image', ext: 'qoi' };
  if (ascii(b, 0, '%PDF-')) return { mime: 'application/pdf', label: 'PDF document', ext: 'pdf' };
  if (at(b, 0, 0x50, 0x4b, 0x03, 0x04) || at(b, 0, 0x50, 0x4b, 0x05, 0x06)) return { mime: 'application/zip', label: 'ZIP archive', ext: 'zip', packed: 'zip' };
  if (at(b, 0, 0x1f, 0x8b, 0x08)) return { mime: 'application/gzip', label: 'gzip-compressed data', ext: 'gz', packed: 'gzip' };
  if (b[0] === 0x78 && (b[0] * 256 + b[1]) % 31 === 0 && [0x01, 0x5e, 0x9c, 0xda].includes(b[1])) {
    return { mime: 'application/zlib', label: 'zlib-compressed data', ext: 'zz', packed: 'zlib' };
  }
  if (ascii(b, 0, 'BZh')) return { mime: 'application/x-bzip2', label: 'bzip2-compressed data', ext: 'bz2' };
  if (at(b, 0, 0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00)) return { mime: 'application/x-xz', label: 'xz-compressed data', ext: 'xz' };
  if (at(b, 0, 0x28, 0xb5, 0x2f, 0xfd)) return { mime: 'application/zstd', label: 'Zstandard-compressed data', ext: 'zst' };
  if (at(b, 0, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return { mime: 'application/x-7z-compressed', label: '7-Zip archive', ext: '7z' };
  if (at(b, 0, 0x7f, 0x45, 0x4c, 0x46)) return { mime: 'application/octet-stream', label: 'ELF executable', ext: 'elf' };
  if (ascii(b, 0, 'MZ')) return { mime: 'application/octet-stream', label: 'Windows executable', ext: 'exe' };
  return null;
}

/** The bytes as UTF-8, or null when they are not valid UTF-8. */
export function utf8OrNull(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Character sets offered to read the bytes as, by their WHATWG labels. */
export const ENCODINGS: [string, string][] = [
  ['utf-8', 'UTF-8'],
  ['iso-8859-1', 'ISO-8859-1 (Latin-1)'],
  ['windows-1252', 'Windows-1252'],
  ['iso-8859-2', 'ISO-8859-2 (Central European)'],
  ['iso-8859-5', 'ISO-8859-5 (Cyrillic)'],
  ['iso-8859-7', 'ISO-8859-7 (Greek)'],
  ['iso-8859-15', 'ISO-8859-15 (Latin-9)'],
  ['shift_jis', 'Shift_JIS (Japanese)'],
  ['euc-kr', 'EUC-KR (Korean)'],
  ['gb18030', 'GB18030 (Chinese)'],
  ['big5', 'Big5 (Chinese)'],
  ['utf-16be', 'UTF-16BE'],
  ['utf-16le', 'UTF-16LE'],
];

/** Decodes bytes in a character set. ISO-8859-1 is decoded exactly (browsers map it to Windows-1252). */
export function decodeAs(bytes: Uint8Array, encoding: string): string {
  if (encoding === 'iso-8859-1') {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return s;
  }
  return new TextDecoder(encoding).decode(bytes);
}

const CONTROL_NAMES = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI',
  'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];

/** A piece of text to show: plain text, or a control or invisible character shown by its name. */
export interface Piece {
  text: string;
  /** Set for a character that is shown by its name, e.g. "LF" or "U+200B". */
  name?: string;
}

const INVISIBLE_RANGES: [number, number][] = [[0xa0, 0xa0], [0xad, 0xad], [0x34f, 0x34f], [0x61c, 0x61c], [0x115f, 0x1160], [0x17b4, 0x17b5], [0x180e, 0x180e], [0x2000, 0x200f], [0x2028, 0x202f], [0x205f, 0x206f], [0x3000, 0x3000], [0xfeff, 0xfeff], [0xfff9, 0xfffb]];
const invisible = (code: number) => INVISIBLE_RANGES.some(([a, b]) => code >= a && code <= b);

/**
 * Splits text into pieces where control characters and invisible or direction-changing characters (which can hide
 * what a text says) are named. Line breaks keep their break after the name.
 */
export function visiblePieces(text: string): Piece[] {
  const out: Piece[] = [];
  let run = '';
  const flush = () => { if (run) { out.push({ text: run }); run = ''; } };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    if (ch === '\r' && text[i + 1] === '\n') {
      flush();
      out.push({ text: '\n', name: 'CR LF' });
      i++;
    } else if (code < 0x20 || code === 0x7f) {
      flush();
      const name = code === 0x7f ? 'DEL' : CONTROL_NAMES[code];
      out.push({ text: ch === '\n' || ch === '\r' ? '\n' : ch === '\t' ? '\t' : '', name });
    } else if (invisible(code)) {
      flush();
      out.push({ text: '', name: `U+${code.toString(16).toUpperCase().padStart(4, '0')}` });
    } else {
      run += ch;
    }
  }
  flush();
  return out;
}

/** Bytes from Base64 or Base64url, or null. Whitespace is ignored. */
export function base64Bytes(text: string): Uint8Array | null {
  let s = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  s = s.replace(/=+$/, '');
  if (s.length % 4 === 1) return null;
  s += '='.repeat((4 - (s.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** A size for people: 1 byte, 820 bytes, 2.4 kB. */
export function formatSize(n: number): string {
  if (n === 1) return '1 byte';
  if (n < 1000) return `${n} bytes`;
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e4 ? 1 : 0)} kB`;
  return `${(n / 1e6).toFixed(1)} MB`;
}
