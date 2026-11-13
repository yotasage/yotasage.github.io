// Parsers for contacts (vCard 2.1, 3.0 and 4.0, MeCard, BIZCARD) and calendar events (iCalendar VEVENT).

import { base64Bytes } from './bytes';
import { splitFields } from './network';
import { Field, Parsed, parsed, safeHref } from './types';

interface Prop {
  name: string;
  params: Record<string, string[]>;
  /** The raw value, still escaped. */
  raw: string;
}

/** Joins folded lines (RFC 6350 3.2, RFC 5545 3.1) and quoted-printable soft line breaks (vCard 2.1). */
function unfold(text: string): string[] {
  const lines: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const prev = lines.length - 1;
    if (prev >= 0 && /^[ \t]/.test(line)) lines[prev] += line.slice(1);
    else if (prev >= 0 && /QUOTED-PRINTABLE/i.test(lines[prev].split(':')[0]) && lines[prev].endsWith('=')) lines[prev] = lines[prev].slice(0, -1) + line;
    else lines.push(line);
  }
  return lines.filter((l) => l.trim() !== '');
}

function readProps(text: string): Prop[] {
  const out: Prop[] = [];
  for (const line of unfold(text)) {
    // The name and parameters end at the first colon outside quotes.
    let quoted = false;
    let colon = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') quoted = !quoted;
      else if (line[i] === ':' && !quoted) { colon = i; break; }
    }
    if (colon < 0) continue;
    const [nameWithGroup, ...paramParts] = line.slice(0, colon).split(';');
    const name = nameWithGroup.replace(/^.*\./, '').toUpperCase();
    const params: Record<string, string[]> = {};
    for (const part of paramParts) {
      const eq = part.indexOf('=');
      const key = (eq < 0 ? 'TYPE' : part.slice(0, eq)).toUpperCase();
      const values = (eq < 0 ? part : part.slice(eq + 1)).split(',').map((v) => v.replace(/^"|"$/g, ''));
      (params[key] ??= []).push(...values);
    }
    out.push({ name, params, raw: line.slice(colon + 1) });
  }
  return out;
}

const param = (p: Prop, key: string) => p.params[key]?.[0];

function unescapeText(s: string) {
  return s.replace(/\\([nN,;:\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** Splits a structured value at unescaped semicolons. */
function components(raw: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\' && i + 1 < raw.length) { cur += raw[i] + raw[++i]; continue; }
    if (raw[i] === ';') { out.push(cur); cur = ''; continue; }
    cur += raw[i];
  }
  out.push(cur);
  return out;
}

function quotedPrintable(raw: string, charset = 'utf-8'): string {
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '=' && /^[0-9A-F]{2}$/i.test(raw.slice(i + 1, i + 3))) { bytes.push(parseInt(raw.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(raw.charCodeAt(i) & 0xff);
  }
  try { return new TextDecoder(charset).decode(Uint8Array.from(bytes)); } catch { return new TextDecoder().decode(Uint8Array.from(bytes)); }
}

/** The text of a property, decoded: quoted-printable, escapes. For structured values, each component. */
function textOf(p: Prop): string[] {
  const enc = (param(p, 'ENCODING') ?? '').toUpperCase();
  const parts = components(p.raw);
  if (enc === 'QUOTED-PRINTABLE') return parts.map((c) => unescapeText(quotedPrintable(c, param(p, 'CHARSET'))));
  return parts.map(unescapeText);
}

const joined = (parts: string[], sep = ', ') => parts.map((s) => s.trim()).filter(Boolean).join(sep);

function types(p: Prop): string {
  const t = (p.params.TYPE ?? []).map((v) => v.toLowerCase()).filter((v) => !['internet', 'voice', 'pref', 'x400'].includes(v));
  return t.length ? ` (${t.join(', ')})` : '';
}

/** An embedded picture: data: URI (vCard 4) or Base64 with ENCODING=b/BASE64 (vCard 2.1 and 3). */
function pictureOf(p: Prop): { bytes: Uint8Array; mime: string } | null {
  const data = /^data:(image\/[a-z0-9.+-]+)?(;[^,]*)?,(.*)$/is.exec(p.raw);
  if (data) {
    const bytes = /;base64/i.test(data[2] ?? '') ? base64Bytes(data[3]) : null;
    return bytes ? { bytes, mime: data[1] ?? 'image/jpeg' } : null;
  }
  const enc = (param(p, 'ENCODING') ?? '').toUpperCase();
  if (enc === 'B' || enc === 'BASE64') {
    const bytes = base64Bytes(p.raw);
    const type = (param(p, 'TYPE') ?? 'jpeg').toLowerCase();
    return bytes ? { bytes, mime: `image/${type.replace(/^image\//, '')}` } : null;
  }
  return null;
}

function fileName(name: string, ext: string) {
  return `${(name || 'contact').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 60) || 'contact'}.${ext}`;
}

const SKIP = new Set(['BEGIN', 'END', 'VERSION', 'PRODID', 'REV', 'N', 'FN', 'UID', 'PHOTO', 'LOGO', 'SOUND', 'KEY', 'CLIENTPIDMAP', 'KIND']);
const LABELS: Record<string, string> = {
  ORG: 'Organisation', TITLE: 'Title', ROLE: 'Role', NICKNAME: 'Nickname', BDAY: 'Birthday', ANNIVERSARY: 'Anniversary',
  NOTE: 'Note', GEO: 'Location', TZ: 'Time zone', LABEL: 'Address label', IMPP: 'Messaging', LANG: 'Language',
  CATEGORIES: 'Categories', GENDER: 'Gender', RELATED: 'Related', MEMBER: 'Member', SOURCE: 'Source', CALURI: 'Calendar',
  FBURL: 'Free/busy', 'X-SOCIALPROFILE': 'Social profile', 'X-ABLABEL': 'Label',
};

export function parseVcard(text: string): Parsed | null {
  if (!/^\s*BEGIN:VCARD/i.test(text)) return null;
  const props = readProps(text);
  const version = props.find((p) => p.name === 'VERSION')?.raw ?? '';
  const fn = props.find((p) => p.name === 'FN');
  const n = props.find((p) => p.name === 'N');
  const nParts = n ? textOf(n) : [];
  const name = fn ? textOf(fn).join(';') : joined([nParts[3], nParts[1], nParts[2], nParts[0], nParts[4]], ' ');
  const p = parsed('contact', 'Contact', { subtitle: name || undefined });
  if (name) p.fields.push({ label: 'Name', value: name });

  for (const prop of props) {
    if (SKIP.has(prop.name)) continue;
    const parts = textOf(prop);
    switch (prop.name) {
      case 'TEL': {
        const number = parts.join(';').replace(/^tel:/i, '');
        p.fields.push({ label: `Phone${types(prop)}`, value: number, mono: true, href: `tel:${number.replace(/\s/g, '')}` });
        break;
      }
      case 'EMAIL': {
        const mail = parts.join(';');
        p.fields.push({ label: `Email${types(prop)}`, value: mail, mono: true, href: `mailto:${mail}` });
        break;
      }
      case 'ADR':
        p.fields.push({ label: `Address${types(prop)}`, value: joined(parts) });
        break;
      case 'URL': {
        const url = parts.join(';');
        p.fields.push({ label: `Web${types(prop)}`, value: url, mono: true, href: safeHref(url) && /^https?:/i.test(url) ? url : undefined });
        break;
      }
      case 'ORG':
        p.fields.push({ label: 'Organisation', value: joined(parts) });
        break;
      default:
        if (prop.name.startsWith('X-') && !LABELS[prop.name]) {
          p.fields.push({ label: prop.name.slice(2).toLowerCase().replace(/(^|-)./g, (c) => c.toUpperCase()), value: parts.join(';') });
        } else {
          p.fields.push({ label: LABELS[prop.name] ?? prop.name, value: parts.join(';') });
        }
    }
  }
  for (const prop of props.filter((q) => q.name === 'PHOTO' || q.name === 'LOGO')) {
    const picture = pictureOf(prop);
    if (picture && !p.image) p.image = picture;
    else if (!picture) p.fields.push({ label: prop.name === 'PHOTO' ? 'Photo' : 'Logo', value: prop.raw, mono: true, note: 'a link; not loaded from here' });
  }
  if (version) p.notes.push(`vCard version ${version}.`);
  p.actions.push({ label: 'Save contact (.vcf)', download: { name: fileName(name, 'vcf'), mime: 'text/vcard', data: text.replace(/\r?\n/g, '\r\n') }, hint: 'Your phone or computer adds it to the contacts when you open the file' });
  return p;
}

/** A vCard 3.0 for a contact read from MeCard or BIZCARD, so it can be saved. */
function toVcard(c: { name: string; family?: string; given?: string; org?: string; title?: string; tels: string[]; emails: string[]; adr?: string; url?: string; note?: string; bday?: string }) {
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(c.family ?? c.name)};${esc(c.given ?? '')};;;`, `FN:${esc(c.name)}`];
  if (c.org) lines.push(`ORG:${esc(c.org)}`);
  if (c.title) lines.push(`TITLE:${esc(c.title)}`);
  for (const t of c.tels) lines.push(`TEL:${t}`);
  for (const e of c.emails) lines.push(`EMAIL:${e}`);
  if (c.adr) lines.push(`ADR:;;${esc(c.adr)};;;;`);
  if (c.url) lines.push(`URL:${c.url}`);
  if (c.note) lines.push(`NOTE:${esc(c.note)}`);
  if (c.bday) lines.push(`BDAY:${c.bday}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

function contactFields(p: Parsed, c: Parameters<typeof toVcard>[0]) {
  if (c.name) p.fields.push({ label: 'Name', value: c.name });
  if (c.org) p.fields.push({ label: 'Organisation', value: c.org });
  if (c.title) p.fields.push({ label: 'Title', value: c.title });
  for (const t of c.tels) p.fields.push({ label: 'Phone', value: t, mono: true, href: `tel:${t.replace(/\s/g, '')}` });
  for (const e of c.emails) p.fields.push({ label: 'Email', value: e, mono: true, href: `mailto:${e}` });
  if (c.adr) p.fields.push({ label: 'Address', value: c.adr });
  if (c.url) p.fields.push({ label: 'Web', value: c.url, mono: true, href: /^https?:/i.test(c.url) ? c.url : undefined });
  if (c.bday) p.fields.push({ label: 'Birthday', value: c.bday.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') });
  if (c.note) p.body = c.note;
  p.actions.push({ label: 'Save contact (.vcf)', download: { name: fileName(c.name, 'vcf'), mime: 'text/vcard', data: toVcard(c) }, hint: 'Made from this code as a vCard 3.0' });
}

/** MeCard (NTT Docomo): MECARD:N:Family,Given;TEL:…;EMAIL:…;; */
export function parseMecard(text: string): Parsed | null {
  if (!/^MECARD:/i.test(text)) return null;
  const pairs = splitFields(text.slice(7));
  const all = (k: string) => pairs.filter(([key]) => key === k).map(([, v]) => v);
  const one = (k: string) => all(k)[0];
  const [family = '', given = ''] = (one('N') ?? '').split(',');
  const name = joined([given, family], ' ');
  const p = parsed('contact', 'Contact (MeCard)', { subtitle: name || undefined });
  contactFields(p, {
    name, family, given, org: one('ORG'), title: one('TITLE'), tels: [...all('TEL'), ...all('TEL-AV')], emails: all('EMAIL'),
    adr: one('ADR'), url: one('URL'), note: one('NOTE'), bday: one('BDAY'),
  });
  const reading = one('SOUND');
  if (reading) p.fields.splice(1, 0, { label: 'Reading of the name', value: reading });
  if (one('NICKNAME')) p.fields.push({ label: 'Nickname', value: one('NICKNAME') });
  return p;
}

/** BIZCARD: N first name, X last name, T title, C company, A address, B phone, M mobile, F fax, E email. */
export function parseBizcard(text: string): Parsed | null {
  if (!/^BIZCARD:/i.test(text)) return null;
  const pairs = splitFields(text.slice(8));
  const one = (k: string) => pairs.find(([key]) => key === k)?.[1];
  const name = joined([one('N'), one('X')], ' ');
  const p = parsed('contact', 'Contact (BIZCARD)', { subtitle: name || undefined });
  contactFields(p, {
    name, given: one('N'), family: one('X'), title: one('T'), org: one('C'), adr: one('A'),
    tels: [one('B'), one('M')].filter(Boolean), emails: [one('E')].filter(Boolean),
  });
  if (one('F')) p.fields.push({ label: 'Fax', value: one('F'), mono: true });
  return p;
}

// ---------------------------------------------------------------------------------------------------------------

/** "When" of an iCalendar date or date-time, in words. */
export function icalWhen(p: Prop | undefined, endOfAllDay = false): string | null {
  if (!p) return null;
  const v = p.raw.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date) {
    const d = new Date(Date.UTC(+date[1], +date[2] - 1, +date[3] - (endOfAllDay ? 1 : 0)));
    return `${d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })} (all day)`;
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!dt) return v;
  const [, y, mo, d, h, mi, s, z] = dt;
  if (z) {
    const t = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    return `${t.toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })} your time (${h}:${mi} UTC)`;
  }
  const tz = param(p, 'TZID');
  return `${y}-${mo}-${d} ${h}:${mi}${s !== '00' ? `:${s}` : ''} ${tz ? `(${tz} time)` : '(local time wherever you are)'}`;
}

function duration(v: string) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return v;
  const parts = [[m[2], 'week'], [m[3], 'day'], [m[4], 'hour'], [m[5], 'minute'], [m[6], 'second']]
    .filter(([n]) => n && n !== '0').map(([n, unit]) => `${n} ${unit}${n === '1' ? '' : 's'}`);
  return parts.join(' ') || '0';
}

export function parseEvent(text: string): Parsed | null {
  if (!/^\s*BEGIN:(VEVENT|VCALENDAR)/i.test(text)) return null;
  const props = readProps(text);
  // The properties of the first VEVENT (or of the whole text when it has none).
  const begin = props.findIndex((p) => p.name === 'BEGIN' && /^VEVENT$/i.test(p.raw));
  const end = props.findIndex((p, i) => i > begin && p.name === 'END' && /^VEVENT$/i.test(p.raw));
  const event = begin >= 0 ? props.slice(begin + 1, end < 0 ? undefined : end) : props;
  const count = props.filter((p) => p.name === 'BEGIN' && /^VEVENT$/i.test(p.raw)).length;
  const get = (k: string) => event.find((p) => p.name === k);
  const str = (k: string) => { const p = get(k); return p ? textOf(p).join(';') : undefined; };
  const summary = str('SUMMARY');
  const p = parsed('event', 'Calendar event', { subtitle: summary });
  if (summary) p.fields.push({ label: 'Title', value: summary });
  const start = get('DTSTART');
  const allDay = /^\d{8}$/.test(start?.raw.trim() ?? '');
  const startText = icalWhen(start);
  if (startText) p.fields.push({ label: 'Starts', value: startText });
  const endText = icalWhen(get('DTEND'), allDay);
  if (endText) p.fields.push({ label: 'Ends', value: endText });
  if (get('DURATION')) p.fields.push({ label: 'Lasts', value: duration(get('DURATION').raw) });
  if (str('LOCATION')) p.fields.push({ label: 'Location', value: str('LOCATION') });
  const url = str('URL');
  if (url) p.fields.push({ label: 'Web', value: url, mono: true, href: /^https?:/i.test(url) ? url : undefined });
  const organizer = get('ORGANIZER');
  if (organizer) p.fields.push({ label: 'Organiser', value: param(organizer, 'CN') ?? organizer.raw.replace(/^mailto:/i, '') });
  if (str('RRULE')) p.fields.push({ label: 'Repeats', value: str('RRULE'), mono: true });
  if (str('STATUS')) p.fields.push({ label: 'Status', value: str('STATUS') });
  if (str('GEO')) p.fields.push({ label: 'Coordinates', value: str('GEO').replace(';', ', '), mono: true });
  if (str('DESCRIPTION')) p.body = str('DESCRIPTION');
  if (count > 1) p.notes.push(`The code has ${count} events; the first is shown. The saved file has them all.`);
  const ics = /^\s*BEGIN:VCALENDAR/i.test(text)
    ? text
    : ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//yotasage.github.io//QR code reader//EN', text.trim(), 'END:VCALENDAR'].join('\n');
  p.actions.push({ label: 'Save event (.ics)', download: { name: fileName(summary ?? 'event', 'ics'), mime: 'text/calendar', data: ics.replace(/\r?\n/g, '\r\n') }, hint: 'Your calendar app adds it when you open the file' });
  return p;
}

export type { Field };
