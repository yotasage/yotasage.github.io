// Base64 (RFC 4648) and data URLs (RFC 2397): writing them for a file, and reading them back from whatever was pasted.

export type Alphabet = 'standard' | 'url';

export interface Base64Options {
  alphabet: Alphabet;
  padding: boolean;
  // Characters per line, 0 for a single line.
  lineLength: number;
}

export class DecodeError extends Error {}

export interface Decoded {
  bytes: Uint8Array;
  // The MIME type a data URL declared, or null for raw Base64.
  declaredType: string | null;
  notes: string[];
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // String.fromCharCode takes the bytes as arguments, so they are passed in chunks that fit on the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function formatBase64(base64: string, { alphabet, padding, lineLength }: Base64Options): string {
  let s = base64;
  if (alphabet === 'url') s = s.replace(/\+/g, '-').replace(/\//g, '_');
  if (!padding) s = s.replace(/=+$/, '');
  if (lineLength > 0) s = s.match(new RegExp(`.{1,${lineLength}}`, 'g'))?.join('\n') ?? s;
  return s;
}

export function base64DataUrl(mime: string, base64: string): string {
  return `data:${mime};base64,${base64}`;
}

// SVG is text, so it can go in a data URL as it is, with only the characters that would break the URL (or the HTML
// or CSS around it) percent-encoded. That is usually shorter than Base64 and stays readable.
export function percentDataUrl(mime: string, text: string): string {
  return `data:${mime},${text.replace(/[\0-\x1f"%#<>\\^`{|}\x7f-\u{10ffff}]/gu, (c) => encodeURIComponent(c))}`;
}

function context(s: string, at: number): string {
  const from = Math.max(0, at - 12);
  return `${from > 0 ? '…' : ''}${s.slice(from, at + 13)}${at + 13 < s.length ? '…' : ''}`;
}

export function base64ToBytes(input: string): { bytes: Uint8Array; notes: string[] } {
  const notes: string[] = [];
  let s = input;
  if (/%[0-9a-f]{2}/i.test(s)) {
    s = s.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    notes.push('Percent-encoded characters (such as %2B, %2F and %3D) were decoded first.');
  }
  // Line breaks and escapes from JSON strings (\n, \r, \/) and from wrapped Base64.
  s = s.replace(/\\[nrt]/g, '').replace(/\\\//g, '/').replace(/\s+/g, '');

  const bad = s.search(/[^A-Za-z0-9+/=_-]/);
  if (bad >= 0) throw new DecodeError(`"${s[bad]}" is not a Base64 character (at ${context(s, bad)}).`);
  if (/[-_]/.test(s)) {
    if (/[+/]/.test(s)) throw new DecodeError('The text mixes the standard (+ /) and the URL-safe (- _) Base64 alphabets.');
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    notes.push('Uses the URL-safe alphabet (- and _ instead of + and /).');
  }
  const pad = s.indexOf('=');
  if (pad >= 0 && /[^=]/.test(s.slice(pad))) {
    throw new DecodeError(`There is padding (=) before the end, at ${context(s, pad)}. It may be several Base64 texts joined together.`);
  }
  s = s.replace(/=+$/, '');
  if (!s) throw new DecodeError('There is no Base64 data.');
  if (s.length % 4 === 1) throw new DecodeError(`The length is wrong (${s.length} characters without padding): one character is missing or extra, or the text was cut off.`);
  s += '='.repeat((4 - (s.length % 4)) % 4);

  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, notes };
}

// Percent-decodes to bytes; other characters are taken as UTF-8.
function percentToBytes(s: string): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let last = 0;
  for (const m of s.matchAll(/%([0-9a-f]{2})/gi)) {
    parts.push(encoder.encode(s.slice(last, m.index)), Uint8Array.of(parseInt(m[1], 16)));
    last = m.index + 3;
  }
  parts.push(encoder.encode(s.slice(last)));
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.length;
  }
  return bytes;
}

// Reads a data URL, or raw Base64, from pasted text. A data URL may sit inside HTML, CSS, Markdown or JSON, as in
// <img src="data:…">, url(data:…) or ![](data:…). Returns null for empty text.
export function decodeInput(text: string): Decoded | null {
  const t = text.trim();
  if (!t) return null;

  const at = t.search(/data:/i);
  if (at < 0) {
    const { bytes, notes } = base64ToBytes(t.replace(/^(["'])([\s\S]*)\1$/, '$2'));
    return { bytes, declaredType: null, notes };
  }

  const comma = t.indexOf(',', at);
  if (comma < 0) throw new DecodeError('The data URL has no comma between the type and the data.');
  const params = t.slice(at + 5, comma).split(';').map((p) => p.trim());
  const isBase64 = params.slice(1).some((p) => p.toLowerCase() === 'base64');
  const declaredType = params[0] || 'text/plain';

  // The data ends at the quote or bracket that opened it, or else at the first character that cannot be part of it.
  const before = t[at - 1];
  const close = before === '"' || before === "'" ? before : before === '(' ? ')' : null;
  let end = -1;
  if (close) end = t.indexOf(close, comma + 1);
  else if (at > 0 || isBase64) end = t.slice(comma + 1).search(/["'<>()]/) + comma + 1;
  if (end <= comma) end = t.length;
  const data = t.slice(comma + 1, end).replace(/[\s;]+$/, '');

  const notes = at > 0 ? ['The data URL was taken from the surrounding text.'] : [];
  if (isBase64) {
    const decoded = base64ToBytes(data);
    return { bytes: decoded.bytes, declaredType, notes: [...notes, ...decoded.notes] };
  }
  notes.push('The data URL is percent-encoded text, not Base64.');
  return { bytes: percentToBytes(data), declaredType, notes };
}
