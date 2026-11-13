// Two-factor accounts: otpauth:// URIs (Google Authenticator's key URI format), Google Authenticator's export
// (otpauth-migration://, a protocol buffer in Base64), and the codes they make (HOTP, RFC 4226; TOTP, RFC 6238),
// computed with Web Crypto.

import { base64Bytes } from './bytes';
import { OtpAccount, Parsed, parsed } from './types';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(s: string): Uint8Array | null {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const v = B32.indexOf(c);
    if (v < 0) return null;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** The HOTP value for a counter (RFC 4226 5.3), or null for an algorithm Web Crypto does not have (MD5). */
export async function hotp(secret: Uint8Array, counter: number, algorithm: OtpAccount['algorithm'], digits: number): Promise<string | null> {
  const hash = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[algorithm];
  if (!hash) return null;
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash }, false, ['sign']);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c % 256; c = Math.floor(c / 256); }
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o + 1] << 16) | (mac[o + 2] << 8) | mac[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** The code of an account now (TOTP) or at its counter (HOTP), and the seconds the TOTP code has left. */
export async function codeNow(a: OtpAccount, nowMs = Date.now()): Promise<{ code: string | null; left: number }> {
  if (a.type === 'hotp') return { code: await hotp(a.secret, a.counter, a.algorithm, a.digits), left: 0 };
  const t = Math.floor(nowMs / 1000);
  const step = Math.floor(t / a.period);
  return { code: await hotp(a.secret, step, a.algorithm, a.digits), left: a.period - (t % a.period) };
}

function otpauthUri(a: Omit<OtpAccount, 'uri'>) {
  const label = encodeURIComponent(a.issuer ? `${a.issuer}:${a.account}` : a.account).replace(/%3A/g, ':');
  const params = [`secret=${base32Encode(a.secret)}`];
  if (a.issuer) params.push(`issuer=${encodeURIComponent(a.issuer)}`);
  if (a.algorithm !== 'SHA1') params.push(`algorithm=${a.algorithm}`);
  if (a.digits !== 6) params.push(`digits=${a.digits}`);
  params.push(a.type === 'totp' ? `period=${a.period}` : `counter=${a.counter}`);
  return `otpauth://${a.type}/${label}?${params.join('&')}`;
}

function decode(s: string) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function accountFields(p: Parsed, a: OtpAccount) {
  p.fields.push({ label: 'Issuer', value: a.issuer || '(none)' });
  p.fields.push({ label: 'Account', value: a.account || '(none)' });
  p.fields.push({ label: 'Secret (Base32)', value: base32Encode(a.secret), mono: true, secret: true });
  p.fields.push({ label: 'Kind', value: a.type === 'totp' ? `Time based (TOTP), a new code every ${a.period} s` : `Counter based (HOTP), counter ${a.counter}` });
  p.fields.push({ label: 'Algorithm and digits', value: `${a.algorithm}, ${a.digits} digits` });
}

const PRIVATE = 'Anyone who sees this code can make your sign-in codes: keep it private, and add it only to your own authenticator app.';

export function parseOtpauth(text: string): Parsed | null {
  const m = /^otpauth:\/\/(totp|hotp)\/([^?]*)\??(.*)$/i.exec(text.trim());
  if (!m) return null;
  const type = m[1].toLowerCase() as 'totp' | 'hotp';
  const params = new Map<string, string>();
  for (const part of m[3].split('&').filter(Boolean)) {
    const eq = part.indexOf('=');
    params.set(decode(eq < 0 ? part : part.slice(0, eq)).toLowerCase(), decode(eq < 0 ? '' : part.slice(eq + 1)));
  }
  const label = decode(m[2]);
  const colon = label.indexOf(':');
  const issuer = params.get('issuer') ?? (colon >= 0 ? label.slice(0, colon) : '');
  const account = (colon >= 0 ? label.slice(colon + 1) : label).trim();
  const secretText = params.get('secret') ?? '';
  const secret = base32Decode(secretText);
  const algorithm = (params.get('algorithm') ?? 'SHA1').toUpperCase() as OtpAccount['algorithm'];
  const digits = Number(params.get('digits') ?? 6);
  const period = Number(params.get('period') ?? 30);
  const counter = Number(params.get('counter') ?? 0);
  const p = parsed('otp', 'Two-factor sign-in (authenticator)', { subtitle: [issuer, account].filter(Boolean).join(' · ') });
  if (!secret || !secret.length) {
    p.warnings.push('The secret is missing or is not Base32 (A–Z, 2–7), so no codes can be made.');
    p.fields.push({ label: 'Secret', value: secretText, mono: true, secret: true });
    return p;
  }
  const a: OtpAccount = { type, issuer, account, secret, algorithm, digits, period: period > 0 ? period : 30, counter, uri: text.trim() };
  accountFields(p, a);
  p.otp = [a];
  if (!['SHA1', 'SHA256', 'SHA512'].includes(algorithm)) p.warnings.push(`The algorithm ${algorithm} is not one of SHA1, SHA256 and SHA512.`);
  if (!(digits >= 6 && digits <= 8)) p.warnings.push(`${digits} digits; authenticator apps expect 6 to 8.`);
  if (algorithm !== 'SHA1' || digits !== 6 || period !== 30) p.notes.push('Google Authenticator ignores the algorithm, digits and period on some phones; the codes here follow the URI.');
  if (params.get('image')) p.fields.push({ label: 'Icon address', value: params.get('image'), mono: true, note: 'not loaded from here' });
  p.warnings.push(PRIVATE);
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// Google Authenticator export: otpauth-migration://offline?data=<Base64 MigrationPayload>

function varint(b: Uint8Array, pos: number): [number, number] {
  let v = 0;
  let mul = 1;
  for (;;) {
    if (pos >= b.length) throw new Error('Truncated');
    const byte = b[pos++];
    v += (byte & 0x7f) * mul;
    mul *= 128;
    if (!(byte & 0x80)) return [v, pos];
  }
}

/** The fields of a protocol buffer message: number → values (numbers for varints, bytes for the rest). */
function message(b: Uint8Array): Map<number, (number | Uint8Array)[]> {
  const out = new Map<number, (number | Uint8Array)[]>();
  let pos = 0;
  while (pos < b.length) {
    let key: number;
    [key, pos] = varint(b, pos);
    const field = Math.floor(key / 8);
    const wire = key & 7;
    let value: number | Uint8Array;
    if (wire === 0) [value, pos] = varint(b, pos);
    else if (wire === 2) {
      let len: number;
      [len, pos] = varint(b, pos);
      if (pos + len > b.length) throw new Error('Truncated');
      value = b.subarray(pos, pos + len);
      pos += len;
    } else if (wire === 1) { value = b.subarray(pos, pos + 8); pos += 8; }
    else if (wire === 5) { value = b.subarray(pos, pos + 4); pos += 4; }
    else throw new Error('Bad wire type');
    const list = out.get(field) ?? [];
    list.push(value);
    out.set(field, list);
  }
  return out;
}

export function parseMigration(text: string): Parsed | null {
  const m = /^otpauth-migration:\/\/offline\?(.*)$/i.exec(text.trim());
  if (!m) return null;
  const p = parsed('otp-migration', 'Google Authenticator export');
  // '+' is part of Base64 here, not a space, so the value is only percent-decoded.
  const raw = m[1].split('&').find((s) => s.startsWith('data='))?.slice(5) ?? '';
  const bytes = base64Bytes(decode(raw));
  let payload: Map<number, (number | Uint8Array)[]>;
  try {
    if (!bytes) throw new Error('No data');
    payload = message(bytes);
  } catch {
    p.warnings.push('The data could not be read: the code is damaged or not an export.');
    return p;
  }
  const td = new TextDecoder();
  const algorithms: OtpAccount['algorithm'][] = ['SHA1', 'SHA1', 'SHA256', 'SHA512', 'MD5'];
  const accounts: OtpAccount[] = [];
  for (const entry of payload.get(1) ?? []) {
    if (!(entry instanceof Uint8Array)) continue;
    const f = message(entry);
    const num = (k: number) => (typeof f.get(k)?.[0] === 'number' ? f.get(k)[0] as number : 0);
    const bytesOf = (k: number) => (f.get(k)?.[0] instanceof Uint8Array ? f.get(k)[0] as Uint8Array : new Uint8Array());
    const name = td.decode(bytesOf(2));
    const issuer = td.decode(bytesOf(3));
    const colon = name.indexOf(':');
    const account = colon >= 0 && name.slice(0, colon) === issuer ? name.slice(colon + 1) : name;
    const a: Omit<OtpAccount, 'uri'> = {
      type: num(6) === 1 ? 'hotp' : 'totp', issuer, account, secret: new Uint8Array(bytesOf(1)),
      algorithm: algorithms[num(4)] ?? 'SHA1', digits: num(5) === 2 ? 8 : 6, period: 30, counter: num(7),
    };
    accounts.push({ ...a, uri: otpauthUri(a) });
  }
  const batchSize = (payload.get(3)?.[0] as number) ?? 1;
  const batchIndex = (payload.get(4)?.[0] as number) ?? 0;
  p.subtitle = `${accounts.length} account${accounts.length === 1 ? '' : 's'}`;
  if (batchSize > 1) p.subtitle += `, code ${batchIndex + 1} of ${batchSize}`;
  p.otp = accounts;
  p.groups = accounts.map((a, i) => ({
    title: `${i + 1}. ${[a.issuer, a.account].filter(Boolean).join(' · ') || 'Account'}`,
    fields: [
      { label: 'Secret (Base32)', value: base32Encode(a.secret), mono: true, secret: true },
      { label: 'Kind', value: a.type === 'totp' ? 'Time based (TOTP), 30 s' : `Counter based (HOTP), counter ${a.counter}` },
      { label: 'Algorithm and digits', value: `${a.algorithm}, ${a.digits} digits` },
      { label: 'otpauth URI', value: a.uri, mono: true, secret: true },
    ],
  }));
  if (batchSize > 1) p.notes.push(`The export is split over ${batchSize} codes; scan them all to get every account.`);
  p.notes.push('Each account’s otpauth URI can be added to another authenticator app (copy it, or make a QR code of it with the QR code generator).');
  p.warnings.push(PRIVATE);
  return p;
}
