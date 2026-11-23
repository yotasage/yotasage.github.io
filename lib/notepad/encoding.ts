import { EncodingConfidence, FileEncoding } from './types';

export interface EncodingOption {
  id: FileEncoding;
  label: string;
  shortLabel: string;
}

export const SUPPORTED_ENCODINGS: readonly EncodingOption[] = [
  { id: 'utf-8', label: 'UTF-8', shortLabel: 'UTF-8' },
  { id: 'utf-8-bom', label: 'UTF-8-BOM', shortLabel: 'UTF-8-BOM' },
  { id: 'utf-16le-bom', label: 'UTF-16 LE BOM', shortLabel: 'UTF-16 LE BOM' },
  { id: 'utf-16be-bom', label: 'UTF-16 BE BOM', shortLabel: 'UTF-16 BE BOM' },
  { id: 'windows-1252', label: 'ANSI (Windows-1252)', shortLabel: 'ANSI' },
  { id: 'iso-8859-1', label: 'ISO-8859-1 (Latin-1)', shortLabel: 'ISO-8859-1' },
] as const;

// Windows-1252 mapping for byte range 0x80..0x9F (all other bytes 0x00..0xFF match Unicode code points)
const CP1252_80_9F: readonly number[] = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
  0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
  0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

const CP1252_REVERSE = new Map<number, number>();
CP1252_80_9F.forEach((cp, idx) => {
  if (cp > 0xff) CP1252_REVERSE.set(cp, 0x80 + idx);
});

export function getEncodingShortLabel(encoding: FileEncoding): string {
  return SUPPORTED_ENCODINGS.find((e) => e.id === encoding)?.shortLabel ?? 'UTF-8';
}

export function getEncodingLabel(encoding: FileEncoding): string {
  return SUPPORTED_ENCODINGS.find((e) => e.id === encoding)?.label ?? 'UTF-8';
}

export interface DetectedEncoding {
  encoding: FileEncoding;
  confidence: EncodingConfidence;
  hasBom: boolean;
}

/**
 * Detects file encoding from raw bytes:
 * - Exact when a BOM (UTF-8, UTF-16 LE, UTF-16 BE) is present.
 * - Likely when inferred via UTF-16 null-byte distribution, strict UTF-8 validation, or ANSI fallback.
 */
export function detectEncodingFromBytes(bytes: Uint8Array): DetectedEncoding {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8-bom', confidence: 'exact', hasBom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le-bom', confidence: 'exact', hasBom: true };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be-bom', confidence: 'exact', hasBom: true };
  }

  if (bytes.length === 0) {
    return { encoding: 'utf-8', confidence: 'likely', hasBom: false };
  }

  // Heuristic check for BOM-less UTF-16 (high proportion of zero bytes on even or odd indices)
  const sampleLen = Math.min(bytes.length, 4096);
  if (sampleLen >= 4) {
    let evenZeros = 0;
    let oddZeros = 0;
    for (let i = 0; i < sampleLen; i++) {
      if (bytes[i] === 0) {
        if (i % 2 === 0) evenZeros++;
        else oddZeros++;
      }
    }
    const half = sampleLen / 2;
    if (oddZeros > half * 0.3 && evenZeros < half * 0.05) {
      return { encoding: 'utf-16le-bom', confidence: 'likely', hasBom: false };
    }
    if (evenZeros > half * 0.3 && oddZeros < half * 0.05) {
      return { encoding: 'utf-16be-bom', confidence: 'likely', hasBom: false };
    }
  }

  // Validate strict UTF-8
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { encoding: 'utf-8', confidence: 'likely', hasBom: false };
  } catch {
    return { encoding: 'windows-1252', confidence: 'likely', hasBom: false };
  }
}

export function decodeBytesWithEncoding(bytes: Uint8Array, encoding: FileEncoding): string {
  if (encoding === 'utf-8' || encoding === 'utf-8-bom') {
    const slice =
      bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
        ? bytes.subarray(3)
        : bytes;
    return new TextDecoder('utf-8', { fatal: false }).decode(slice);
  }

  if (encoding === 'utf-16le-bom') {
    const slice =
      bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2) : bytes;
    return new TextDecoder('utf-16le', { fatal: false }).decode(slice);
  }

  if (encoding === 'utf-16be-bom') {
    const slice =
      bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff ? bytes.subarray(2) : bytes;
    return new TextDecoder('utf-16be', { fatal: false }).decode(slice);
  }

  if (encoding === 'iso-8859-1') {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      out += String.fromCharCode(bytes[i]);
    }
    return out;
  }

  // ANSI (Windows-1252)
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x80 && b <= 0x9f) {
      out += String.fromCharCode(CP1252_80_9F[b - 0x80]);
    } else {
      out += String.fromCharCode(b);
    }
  }
  return out;
}

export interface EncodeTextResult {
  bytes: Uint8Array;
  lossyCount: number;
}

export function encodeTextWithEncoding(text: string, encoding: FileEncoding): EncodeTextResult {
  if (encoding === 'utf-8') {
    return { bytes: new TextEncoder().encode(text), lossyCount: 0 };
  }

  if (encoding === 'utf-8-bom') {
    const body = new TextEncoder().encode(text);
    const out = new Uint8Array(3 + body.length);
    out[0] = 0xef;
    out[1] = 0xbb;
    out[2] = 0xbf;
    out.set(body, 3);
    return { bytes: out, lossyCount: 0 };
  }

  if (encoding === 'utf-16le-bom' || encoding === 'utf-16be-bom') {
    const le = encoding === 'utf-16le-bom';
    const out = new Uint8Array(2 + text.length * 2);
    out[0] = le ? 0xff : 0xfe;
    out[1] = le ? 0xfe : 0xff;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const pos = 2 + i * 2;
      if (le) {
        out[pos] = code & 0xff;
        out[pos + 1] = (code >>> 8) & 0xff;
      } else {
        out[pos] = (code >>> 8) & 0xff;
        out[pos + 1] = code & 0xff;
      }
    }
    return { bytes: out, lossyCount: 0 };
  }

  // Single-byte encodings (Windows-1252 or ISO-8859-1)
  const out = new Uint8Array(text.length);
  let lossyCount = 0;
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (encoding === 'iso-8859-1') {
      if (cp <= 0xff) {
        out[i] = cp;
      } else {
        out[i] = 0x3f; // '?'
        lossyCount++;
      }
    } else {
      // Windows-1252
      if (cp <= 0x7f || (cp >= 0xa0 && cp <= 0xff)) {
        out[i] = cp;
      } else {
        const mapped = CP1252_REVERSE.get(cp);
        if (mapped !== undefined) {
          out[i] = mapped;
        } else if (cp >= 0x80 && cp <= 0x9f) {
          out[i] = cp;
        } else {
          out[i] = 0x3f; // '?'
          lossyCount++;
        }
      }
    }
  }
  return { bytes: out, lossyCount };
}
