// Works out what the content of a code is and parses it for the preview: a Wi-Fi network, an eSIM, a link, a
// contact, an image stored as bytes, and so on. Plain text is the fallback. Each format has its parser in
// network.ts, cards.ts, payments.ts, codes.ts or otp.ts; binary content (images, compressed data, Base64, data
// URLs) is handled here.

import { gunzipSync, unzipSync, unzlibSync, inflateSync } from 'fflate';

import { base64Bytes, formatSize, sniff, utf8OrNull } from './bytes';
import { parseBizcard, parseEvent, parseMecard, parseVcard } from './cards';
import { digitalLinkFields, gs1CheckOk, parseBcbp, parseGs1, parseMatter } from './codes';
import { parseDpp, parseEmail, parseEsim, parseGeo, parseSms, parseTel, parseUrl, parseWifi } from './network';
import { parseMigration, parseOtpauth } from './otp';
import { parseCrypto, parseEpc, parseSwissQr } from './payments';
import { Parsed, parsed } from './types';

export interface ContentInput {
  /** The content as text (the reader's decoding of the bytes, or what was typed). */
  text: string;
  /** The bytes as stored in the code, when the content comes from a code. */
  bytes?: Uint8Array | null;
  /** The reader took the content for binary data rather than text. */
  binary?: boolean;
  /** GS1 data: FNC1 in first position (symbology identifier ]Q3) or the reader's GS1 hint. */
  gs1?: boolean;
}

/** The prefix of the site's own password-protected text (lib/qr/payloads.ts). */
const ENCRYPTED = 'QRENC1:';
const MAX_DEPTH = 3;
const MAX_UNPACKED = 16 * 1024 * 1024;

export function parseContent(input: ContentInput, depth = 0): Parsed {
  const { text, bytes } = input;
  if (bytes && bytes.length && (input.binary || utf8OrNull(bytes) === null)) {
    const fromBytes = parseBinary(bytes, depth, !!input.binary);
    if (fromBytes) return fromBytes;
  }
  return parseText(text, bytes ?? null, !!input.gs1, depth);
}

function parseText(text: string, bytes: Uint8Array | null, gs1: boolean, depth: number): Parsed {
  const t = text.trimStart();
  const found =
    parseEncrypted(text)
    ?? parseWifi(t)
    ?? parseEsim(t)
    ?? parseVcard(t)
    ?? parseMecard(t)
    ?? parseBizcard(t)
    ?? parseEvent(t)
    ?? parseEmail(t)
    ?? parseSms(t)
    ?? parseTel(t)
    ?? parseGeo(t)
    ?? parseOtpauth(t)
    ?? parseMigration(t)
    ?? parseEpc(text, bytes)
    ?? parseSwissQr(text)
    ?? parseMatter(t)
    ?? parseDpp(t)
    ?? parseBcbp(text)
    ?? parseCrypto(t)
    ?? parseGs1(text, gs1)
    ?? parseDataUrl(t, depth)
    ?? parseLink(t, depth)
    ?? parseJson(t)
    ?? parseBase64(t, depth);
  return found ?? plainText(text);
}

function parseLink(t: string, depth: number): Parsed | null {
  let p = parseUrl(t);
  if (!p && /^www\.[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(t.trim())) {
    p = parseUrl(`https://${t.trim()}`);
    p?.notes.unshift('The link has no scheme (https://); most phones open it as https.');
  }
  if (!p) return null;
  let url: URL | null = null;
  try { url = new URL(/^www\./i.test(t.trim()) ? `https://${t.trim()}` : t.trim()); } catch { /* not a URL */ }
  if (url && /^https?:$/.test(url.protocol)) {
    const card = url.hostname === 'esimsetup.apple.com' ? url.searchParams.get('carddata') : null;
    if (card && depth < MAX_DEPTH) {
      p.title = 'eSIM setup link (Apple)';
      p.inner = parseEsim(card) ?? undefined;
    }
    const gs1 = digitalLinkFields(url);
    if (gs1?.length) {
      p.title = 'GS1 Digital Link';
      p.groups = [{ title: 'GS1 data in the link', fields: gs1 }];
    }
  }
  return p;
}

function parseEncrypted(text: string): Parsed | null {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim().startsWith(ENCRYPTED));
  if (at < 0) return null;
  const before = lines.slice(0, at).join('\n').trim();
  const p = parsed('encrypted', 'Password-protected text', { subtitle: before || undefined });
  p.encrypted = { line: lines[at].trim(), before };
  if (before) p.fields.push({ label: 'Public text', value: before });
  p.notes.push('Made with the “Password-protected text” content of this site’s QR code generator: AES-256-GCM with a key from the password (PBKDF2-SHA-256, 250 000 rounds). The password is not in the code.');
  return p;
}

function parseJson(t: string): Parsed | null {
  const s = t.trim();
  if (!/^[[{]/.test(s)) return null;
  try {
    const value = JSON.parse(s);
    const p = parsed('json', 'JSON data', { body: JSON.stringify(value, null, 2) });
    if (Array.isArray(value)) p.subtitle = `A list of ${value.length}`;
    else if (value && typeof value === 'object') p.subtitle = `${Object.keys(value).length} keys: ${Object.keys(value).slice(0, 5).join(', ')}${Object.keys(value).length > 5 ? ', …' : ''}`;
    p.actions.push({ label: 'Save as .json', download: { name: 'content.json', mime: 'application/json', data: JSON.stringify(value, null, 2) } });
    return p;
  } catch {
    return null;
  }
}

/** data:[mime][;charset=…][;base64],data (RFC 2397). */
function parseDataUrl(t: string, depth: number): Parsed | null {
  const m = /^data:([a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+)?((?:;[a-z0-9-]+=[^;,]*)*)(;base64)?,([\s\S]*)$/i.exec(t.trim());
  if (!m) return null;
  const mime = (m[1] ?? 'text/plain').toLowerCase();
  let bytes: Uint8Array | null;
  if (m[3]) bytes = base64Bytes(m[4]);
  else {
    try { bytes = Uint8Array.from(unescape(m[4]), (c) => c.charCodeAt(0)); } catch { bytes = null; }
  }
  const p = parsed('binary', 'Data URL', { subtitle: `${mime}${bytes ? `, ${formatSize(bytes.length)}` : ''}` });
  if (!bytes) {
    p.warnings.push('The data could not be decoded.');
    return p;
  }
  p.fields.push({ label: 'Type', value: mime, mono: true });
  p.fields.push({ label: 'Size', value: formatSize(bytes.length) });
  if (depth < MAX_DEPTH) {
    if (mime.startsWith('text/') || mime === 'application/json') {
      p.inner = parseText(new TextDecoder(/charset=([^;]+)/i.exec(m[2])?.[1] ?? 'utf-8').decode(bytes), bytes, false, depth + 1);
    } else {
      p.inner = parseBinary(bytes, depth + 1, true, mime) ?? undefined;
    }
  }
  if (p.inner?.kind === 'image') {
    p.kind = 'image';
    p.title = 'Image (data URL)';
  }
  return p;
}

function parseBase64(t: string, depth: number): Parsed | null {
  const s = t.trim();
  if (s.length < 24 || depth >= MAX_DEPTH || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(s.replace(/\s+/g, ''))) return null;
  const bytes = base64Bytes(s);
  if (!bytes) return null;
  const kind = sniff(bytes);
  if (!kind) return null;
  const inner = parseBinary(bytes, depth + 1, true);
  if (!inner) return null;
  inner.notes.unshift(`The code holds Base64 text (${s.length} characters) that decodes to this.`);
  return inner;
}

function plainText(text: string): Parsed {
  const p = parsed('text', 'Text', { body: text });
  const chars = [...text].length;
  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  p.subtitle = `${chars} character${chars === 1 ? '' : 's'}${lines > 1 ? `, ${lines} lines` : ''}`;
  const t = text.trim();
  if (/^\d{8}$|^\d{12,14}$/.test(t) && gs1CheckOk(t)) p.notes.push(`${t} has a valid GS1 check digit: it is probably a product number (EAN/UPC/GTIN).`);
  const links = [...new Set(text.match(/https?:\/\/[^\s<>"']+/gi) ?? [])].slice(0, 5);
  for (const link of links) p.actions.push({ label: `Open ${(() => { try { return new URL(link).hostname; } catch { return 'link'; } })()}`, href: link, hint: 'A link in the text' });
  if (text) p.actions.push({ label: 'Copy text', copy: text });
  return p;
}

// ---------------------------------------------------------------------------------------------------------------

function unpack(bytes: Uint8Array, how: 'gzip' | 'zlib' | 'deflate'): Uint8Array | null {
  try {
    const out = how === 'gzip' ? gunzipSync(bytes) : how === 'zlib' ? unzlibSync(bytes) : inflateSync(bytes);
    return out.length && out.length <= MAX_UNPACKED ? out : null;
  } catch {
    return null;
  }
}

/** Parses what unpacked or decoded bytes hold: text (parsed again) or binary. */
function innerOf(out: Uint8Array, depth: number): Parsed | null {
  if (depth >= MAX_DEPTH) return null;
  const text = utf8OrNull(out);
  return text !== null && !/[\x00-\x08\x0e-\x1f]/.test(text) ? parseText(text, out, false, depth + 1) : parseBinary(out, depth + 1, true);
}

/** Binary content: images, compressed data, archives, known files; null when nothing is recognised and `sure` is false. */
function parseBinary(bytes: Uint8Array, depth: number, sure: boolean, mime?: string): Parsed | null {
  const s = sniff(bytes);
  const download = (name: string, type: string) => ({ label: `Save as .${name.split('.').pop()}`, download: { name, mime: type, data: bytes } });
  if (s?.image || (mime?.startsWith('image/') && mime !== 'image/svg+xml')) {
    const type = s?.mime ?? mime;
    const p = parsed('image', s?.label ?? 'Image', { subtitle: formatSize(bytes.length), image: { bytes, mime: type } });
    p.fields.push({ label: 'Format', value: s?.label ?? type });
    p.fields.push({ label: 'Size', value: formatSize(bytes.length) });
    p.actions.push(download(`image.${s?.ext ?? type.split('/')[1]}`, type));
    p.notes.push('The image is stored in the code as bytes; nothing was loaded from elsewhere.');
    return p;
  }
  if (s?.packed === 'gzip' || s?.packed === 'zlib') {
    const out = unpack(bytes, s.packed);
    const p = parsed('binary', s.label, { subtitle: formatSize(bytes.length) });
    if (!out) {
      p.warnings.push('It could not be unpacked: the data is damaged or cut off.');
    } else {
      p.fields.push({ label: 'Unpacked size', value: `${formatSize(out.length)} from ${formatSize(bytes.length)}` });
      p.inner = innerOf(out, depth) ?? undefined;
      p.actions.push({ label: 'Save unpacked', download: { name: 'unpacked.bin', mime: 'application/octet-stream', data: out } });
    }
    p.actions.push(download(`data.${s.ext}`, s.mime));
    return p;
  }
  if (s?.packed === 'zip') {
    const p = parsed('binary', 'ZIP archive', { subtitle: formatSize(bytes.length) });
    try {
      const files = unzipSync(bytes);
      const names = Object.keys(files);
      p.subtitle = `${names.length} file${names.length === 1 ? '' : 's'}, ${formatSize(bytes.length)}`;
      p.groups = [{ title: 'Files', fields: names.map((n) => ({ label: n, value: formatSize(files[n].length), mono: true })) }];
      if (names.length === 1) p.inner = innerOf(files[names[0]], depth) ?? undefined;
    } catch {
      p.warnings.push('The archive could not be opened: it is damaged or cut off.');
    }
    p.actions.push(download('archive.zip', 'application/zip'));
    return p;
  }
  if (s) {
    const p = parsed('binary', s.label, { subtitle: formatSize(bytes.length) });
    p.fields.push({ label: 'Size', value: formatSize(bytes.length) });
    p.actions.push(download(`file.${s.ext}`, s.mime));
    if (s.label.includes('executable')) p.warnings.push('This is a program: do not run it unless you trust where the code came from.');
    return p;
  }
  // Raw deflate has no header to recognise; take it only when it unpacks to text.
  const raw = sure && bytes.length > 4 ? unpack(bytes, 'deflate') : null;
  const rawText = raw ? utf8OrNull(raw) : null;
  if (raw && rawText !== null && !/[\x00-\x08\x0e-\x1f]/.test(rawText) && depth < MAX_DEPTH) {
    const p = parsed('binary', 'Deflate-compressed text', { subtitle: `${formatSize(raw.length)} from ${formatSize(bytes.length)}` });
    p.inner = parseText(rawText, raw, false, depth + 1);
    return p;
  }
  if (!sure) return null;
  const p = parsed('binary', 'Binary data', { subtitle: formatSize(bytes.length) });
  p.fields.push({ label: 'Size', value: formatSize(bytes.length) });
  p.notes.push('The bytes are not text in a known character set and not a file type this reader recognises. The raw view shows them in hex and lets you read them in other character sets.');
  p.actions.push(download('data.bin', 'application/octet-stream'));
  return p;
}
