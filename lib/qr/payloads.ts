// Content types: builders that turn form fields into the de facto payload formats understood by
// phone cameras and barcode apps (Wi-Fi, vCard, MeCard, calendar events, payments, ...).

export type FieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'datetime-local' | 'date' | 'password';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: [string, string][];
  placeholder?: string;
  initial?: string | boolean;
  help?: string;
  showIf?: (values: Values) => boolean;
}

export type Values = Record<string, string | boolean>;

export interface Payload {
  data: string | Uint8Array;
  fnc1?: 'gs1';
  note?: string;
}

export interface ContentType {
  id: string;
  label: string;
  description: string;
  fields: FieldDef[];
  build: (v: Values) => Payload | Promise<Payload>;
}

const str = (v: Values, k: string) => String(v[k] ?? '');
const bool = (v: Values, k: string) => v[k] === true;

// Escaping for the MECARD / WIFI "key:value;" syntax.
function escapeMe(s: string) {
  return s.replace(/([\\;,:"])/g, '\\$1');
}

// vCard text value escaping (RFC 6350 3.4).
function escapeVcard(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

// iCalendar text value escaping (RFC 5545 3.3.11).
function escapeIcal(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

// Interprets \n, \r, \t, \\, \xHH and \u{H...} escape sequences.
export function parseEscapes(s: string): string {
  return s.replace(/\\(x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]{1,6}\}|u[0-9a-fA-F]{4}|[nrt\\0])/g, (_, e: string) => {
    if (e === 'n') return '\n';
    if (e === 'r') return '\r';
    if (e === 't') return '\t';
    if (e === '0') return '\0';
    if (e === '\\') return '\\';
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    const hex = e[1] === '{' ? e.slice(2, -1) : e.slice(1);
    return String.fromCodePoint(parseInt(hex, 16));
  });
}

function query(params: [string, string][]) {
  const q = params.filter(([, v]) => v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return q ? `?${q}` : '';
}

function icalDate(value: string, allDay: boolean, utc: boolean) {
  if (!value) return '';
  if (allDay) return value.slice(0, 10).replace(/-/g, '');
  const d = new Date(value);
  if (utc) return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return value.replace(/[-:]/g, '').padEnd(13, '0') + '00';
}

// GS1 Application Identifiers whose data has a predefined length, so they need no FNC1 separator.
// Keyed by the first two digits of the AI, value is the total length of AI + data.
const GS1_PREDEFINED: Record<string, number> = {
  '00': 20, '01': 16, '02': 16, '03': 16, '04': 18, '11': 8, '12': 8, '13': 8, '14': 8, '15': 8, '16': 8, '17': 8,
  '18': 8, '19': 8, '20': 4, '31': 10, '32': 10, '33': 10, '34': 10, '35': 10, '36': 10, '41': 16,
};

// Converts "(01)09501101530003(10)ABC123(21)XYZ" to the raw element string, with GS (0x1D) after
// every variable-length field that is not the last one.
export function gs1ElementString(hri: string): string {
  const parts = [...hri.trim().matchAll(/\((\d{2,4})\)([^(]*)/g)];
  if (parts.length === 0) throw new Error('Write the GS1 data as (AI)value pairs, for example (01)09501101530003(10)ABC123.');
  const consumed = parts.map((p) => p[0]).join('');
  if (consumed.replace(/\s/g, '') !== hri.replace(/\s/g, '')) throw new Error('Could not parse the GS1 data; every value must start with an AI in parentheses.');
  let out = '';
  parts.forEach(([, ai, value], i) => {
    const field = ai + value.trim();
    out += field;
    const fixed = GS1_PREDEFINED[ai.slice(0, 2)];
    if (fixed !== undefined && field.length !== fixed) throw new Error(`AI (${ai}) has a fixed length; expected ${fixed - ai.length} characters of data.`);
    if (fixed === undefined && i < parts.length - 1) out += '\x1d';
  });
  return out;
}

function hexBytes(s: string): Uint8Array {
  const clean = s.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error('Only hexadecimal digits (0-9, A-F) are allowed.');
  if (clean.length % 2) throw new Error('An odd number of hex digits was given.');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

function base64(bytes: Uint8Array) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export const ENCRYPTED_PREFIX = 'QRENC1:';
const PBKDF2_ITERATIONS = 250000;

async function deriveKey(password: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptText(plain: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  const all = new Uint8Array(salt.length + iv.length + ct.length);
  all.set(salt, 0);
  all.set(iv, salt.length);
  all.set(ct, salt.length + iv.length);
  return ENCRYPTED_PREFIX + base64(all);
}

export async function decryptText(payload: string, password: string): Promise<string> {
  const body = payload.trim().replace(ENCRYPTED_PREFIX, '');
  const all = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  const key = await deriveKey(password, all.slice(0, 16));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(16, 28) }, key, all.slice(28));
  return new TextDecoder().decode(plain);
}

export const CONTENT_TYPES: ContentType[] = [
  {
    id: 'text',
    label: 'Text',
    description: 'Free text, encoded exactly as written.',
    fields: [
      { key: 'text', label: 'Text', type: 'textarea', initial: 'Hello, world!' },
      { key: 'escapes', label: 'Interpret escape sequences (\\n, \\t, \\\\, \\xHH, \\u{HHHH})', type: 'checkbox', initial: false },
    ],
    build: (v) => ({ data: bool(v, 'escapes') ? parseEscapes(str(v, 'text')) : str(v, 'text') }),
  },
  {
    id: 'url',
    label: 'URL / link',
    description: 'A web address. Phone cameras offer to open it.',
    fields: [{ key: 'url', label: 'URL', type: 'text', initial: 'https://yotasage.github.io/', placeholder: 'https://example.com' }],
    build: (v) => {
      const url = str(v, 'url').trim();
      const note = url && !/^[a-z][a-z0-9+.-]*:/i.test(url) ? 'No scheme (https://) is given, so many readers will treat this as plain text.' : undefined;
      return { data: url, note };
    },
  },
  {
    id: 'wifi',
    label: 'Wi-Fi network',
    description: 'Joins a wireless network when scanned (WIFI: format, supported by Android and iOS cameras).',
    fields: [
      { key: 'ssid', label: 'Network name (SSID)', type: 'text', initial: '' },
      { key: 'auth', label: 'Security', type: 'select', initial: 'WPA', options: [
        ['WPA', 'WPA / WPA2 / WPA3 Personal (T:WPA)'], ['SAE', 'WPA3 Personal only (T:SAE)'], ['WEP', 'WEP (T:WEP)'], ['nopass', 'Open network (T:nopass)'], ['WPA2-EAP', 'WPA2 / WPA3 Enterprise (T:WPA2-EAP)'],
      ] },
      { key: 'password', label: 'Password', type: 'password', initial: '', showIf: (v) => v.auth !== 'nopass' },
      { key: 'eap', label: 'EAP method', type: 'select', initial: 'PEAP', options: [['PEAP', 'PEAP'], ['TTLS', 'TTLS'], ['TLS', 'TLS'], ['PWD', 'PWD'], ['SIM', 'SIM'], ['AKA', 'AKA']], showIf: (v) => v.auth === 'WPA2-EAP' },
      { key: 'phase2', label: 'Phase 2 authentication', type: 'select', initial: 'MSCHAPV2', options: [['', '(none)'], ['MSCHAPV2', 'MSCHAPV2'], ['GTC', 'GTC'], ['PAP', 'PAP'], ['MSCHAP', 'MSCHAP']], showIf: (v) => v.auth === 'WPA2-EAP' },
      { key: 'identity', label: 'Identity', type: 'text', initial: '', showIf: (v) => v.auth === 'WPA2-EAP' },
      { key: 'anon', label: 'Anonymous identity', type: 'text', initial: '', showIf: (v) => v.auth === 'WPA2-EAP' },
      { key: 'hidden', label: 'Hidden network (H:true)', type: 'checkbox', initial: false },
      { key: 'transition', label: 'Transition disable (R:1, WPA3 only)', type: 'checkbox', initial: false, showIf: (v) => v.auth === 'WPA' || v.auth === 'SAE' },
    ],
    build: (v) => {
      const auth = str(v, 'auth');
      let s = `WIFI:T:${auth};S:${escapeMe(str(v, 'ssid'))};`;
      if (auth === 'WPA2-EAP') {
        s += `E:${str(v, 'eap')};`;
        if (str(v, 'phase2')) s += `PH2:${str(v, 'phase2')};`;
        if (str(v, 'anon')) s += `A:${escapeMe(str(v, 'anon'))};`;
        if (str(v, 'identity')) s += `I:${escapeMe(str(v, 'identity'))};`;
      }
      if (auth !== 'nopass') s += `P:${escapeMe(str(v, 'password'))};`;
      if (bool(v, 'hidden')) s += 'H:true;';
      if (bool(v, 'transition') && (auth === 'WPA' || auth === 'SAE')) s += 'R:1;';
      return { data: s + ';', note: str(v, 'ssid') ? undefined : 'The network name is empty.' };
    },
  },
  {
    id: 'vcard',
    label: 'Contact (vCard)',
    description: 'A contact card that phones offer to save to the address book.',
    fields: [
      { key: 'version', label: 'vCard version', type: 'select', initial: '3.0', options: [['3.0', '3.0 (best supported)'], ['4.0', '4.0'], ['2.1', '2.1']] },
      { key: 'first', label: 'First name', type: 'text', initial: '' },
      { key: 'last', label: 'Last name', type: 'text', initial: '' },
      { key: 'org', label: 'Organisation', type: 'text', initial: '' },
      { key: 'title', label: 'Job title', type: 'text', initial: '' },
      { key: 'cell', label: 'Mobile phone', type: 'text', initial: '' },
      { key: 'work', label: 'Work phone', type: 'text', initial: '' },
      { key: 'email', label: 'E-mail', type: 'text', initial: '' },
      { key: 'url', label: 'Website', type: 'text', initial: '' },
      { key: 'street', label: 'Street', type: 'text', initial: '' },
      { key: 'city', label: 'City', type: 'text', initial: '' },
      { key: 'region', label: 'Region / state', type: 'text', initial: '' },
      { key: 'zip', label: 'Postal code', type: 'text', initial: '' },
      { key: 'country', label: 'Country', type: 'text', initial: '' },
      { key: 'bday', label: 'Birthday', type: 'date', initial: '' },
      { key: 'note', label: 'Note', type: 'textarea', initial: '' },
    ],
    build: (v) => {
      const ver = str(v, 'version');
      const e = (k: string) => escapeVcard(str(v, k));
      const lines = ['BEGIN:VCARD', `VERSION:${ver}`, `N:${e('last')};${e('first')};;;`, `FN:${escapeVcard([str(v, 'first'), str(v, 'last')].filter(Boolean).join(' '))}`];
      const tel = (type: string, value: string) => (ver === '4.0' ? `TEL;TYPE=${type.toLowerCase()},voice;VALUE=uri:tel:${value}` : ver === '2.1' ? `TEL;${type}:${value}` : `TEL;TYPE=${type}:${value}`);
      if (str(v, 'org')) lines.push(`ORG:${e('org')}`);
      if (str(v, 'title')) lines.push(`TITLE:${e('title')}`);
      if (str(v, 'cell')) lines.push(tel('CELL', str(v, 'cell')));
      if (str(v, 'work')) lines.push(tel('WORK', str(v, 'work')));
      if (str(v, 'email')) lines.push(`EMAIL:${str(v, 'email')}`);
      if (str(v, 'url')) lines.push(`URL:${str(v, 'url')}`);
      if (['street', 'city', 'region', 'zip', 'country'].some((k) => str(v, k))) {
        lines.push(`ADR${ver === '2.1' ? '' : ';TYPE=WORK'}:;;${e('street')};${e('city')};${e('region')};${e('zip')};${e('country')}`);
      }
      if (str(v, 'bday')) lines.push(`BDAY:${ver === '4.0' ? str(v, 'bday').replace(/-/g, '') : str(v, 'bday')}`);
      if (str(v, 'note')) lines.push(`NOTE:${e('note')}`);
      lines.push('END:VCARD');
      return { data: lines.join('\r\n') };
    },
  },
  {
    id: 'mecard',
    label: 'Contact (MeCard)',
    description: 'A compact contact format from NTT Docomo. Shorter than a vCard, so it gives a smaller symbol.',
    fields: [
      { key: 'last', label: 'Last name', type: 'text', initial: '' },
      { key: 'first', label: 'First name', type: 'text', initial: '' },
      { key: 'reading', label: 'Name reading (SOUND)', type: 'text', initial: '' },
      { key: 'tel', label: 'Phone', type: 'text', initial: '' },
      { key: 'email', label: 'E-mail', type: 'text', initial: '' },
      { key: 'url', label: 'Website', type: 'text', initial: '' },
      { key: 'adr', label: 'Address', type: 'text', initial: '' },
      { key: 'bday', label: 'Birthday', type: 'date', initial: '' },
      { key: 'nickname', label: 'Nickname', type: 'text', initial: '' },
      { key: 'note', label: 'Note', type: 'text', initial: '' },
    ],
    build: (v) => {
      const e = (k: string) => escapeMe(str(v, k));
      let s = `MECARD:N:${[e('last'), e('first')].filter(Boolean).join(',')};`;
      if (str(v, 'reading')) s += `SOUND:${e('reading')};`;
      if (str(v, 'tel')) s += `TEL:${e('tel')};`;
      if (str(v, 'email')) s += `EMAIL:${e('email')};`;
      if (str(v, 'url')) s += `URL:${e('url')};`;
      if (str(v, 'adr')) s += `ADR:${e('adr')};`;
      if (str(v, 'bday')) s += `BDAY:${str(v, 'bday').replace(/-/g, '')};`;
      if (str(v, 'nickname')) s += `NICKNAME:${e('nickname')};`;
      if (str(v, 'note')) s += `NOTE:${e('note')};`;
      return { data: s + ';' };
    },
  },
  {
    id: 'email',
    label: 'E-mail',
    description: 'Opens a new e-mail with recipient, subject and body filled in.',
    fields: [
      { key: 'format', label: 'Format', type: 'select', initial: 'mailto', options: [['mailto', 'mailto: URI (RFC 6068)'], ['matmsg', 'MATMSG (Docomo)']] },
      { key: 'to', label: 'To', type: 'text', initial: '' },
      { key: 'cc', label: 'Cc', type: 'text', initial: '', showIf: (v) => v.format === 'mailto' },
      { key: 'bcc', label: 'Bcc', type: 'text', initial: '', showIf: (v) => v.format === 'mailto' },
      { key: 'subject', label: 'Subject', type: 'text', initial: '' },
      { key: 'body', label: 'Body', type: 'textarea', initial: '' },
    ],
    build: (v) => {
      if (str(v, 'format') === 'matmsg') return { data: `MATMSG:TO:${escapeMe(str(v, 'to'))};SUB:${escapeMe(str(v, 'subject'))};BODY:${escapeMe(str(v, 'body'))};;` };
      return { data: `mailto:${str(v, 'to')}${query([['cc', str(v, 'cc')], ['bcc', str(v, 'bcc')], ['subject', str(v, 'subject')], ['body', str(v, 'body')]])}` };
    },
  },
  {
    id: 'sms',
    label: 'SMS',
    description: 'Opens the messaging app with a number and message.',
    fields: [
      { key: 'format', label: 'Format', type: 'select', initial: 'smsto', options: [['smsto', 'SMSTO:number:message'], ['sms', 'sms:number?body=message (RFC 5724)'], ['mms', 'MMSTO:number:message']] },
      { key: 'number', label: 'Phone number', type: 'text', initial: '', placeholder: '+4712345678' },
      { key: 'message', label: 'Message', type: 'textarea', initial: '' },
    ],
    build: (v) => {
      const f = str(v, 'format');
      if (f === 'sms') return { data: `sms:${str(v, 'number')}${query([['body', str(v, 'message')]])}` };
      return { data: `${f === 'mms' ? 'MMSTO' : 'SMSTO'}:${str(v, 'number')}:${str(v, 'message')}` };
    },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp message',
    description: 'Starts a WhatsApp chat (wa.me link).',
    fields: [
      { key: 'number', label: 'Phone number in international format, digits only', type: 'text', initial: '', placeholder: '4712345678' },
      { key: 'message', label: 'Message', type: 'textarea', initial: '' },
    ],
    build: (v) => ({ data: `https://wa.me/${str(v, 'number').replace(/[^0-9]/g, '')}${query([['text', str(v, 'message')]])}` }),
  },
  {
    id: 'tel',
    label: 'Phone call',
    description: 'Dials a number (tel: URI).',
    fields: [{ key: 'number', label: 'Phone number', type: 'text', initial: '', placeholder: '+4712345678' }],
    build: (v) => ({ data: `tel:${str(v, 'number').replace(/\s/g, '')}` }),
  },
  {
    id: 'geo',
    label: 'Location',
    description: 'A point on a map.',
    fields: [
      { key: 'format', label: 'Format', type: 'select', initial: 'geo', options: [['geo', 'geo: URI (RFC 5870)'], ['google', 'Google Maps link'], ['apple', 'Apple Maps link'], ['osm', 'OpenStreetMap link']] },
      { key: 'lat', label: 'Latitude', type: 'text', initial: '59.9139' },
      { key: 'lon', label: 'Longitude', type: 'text', initial: '10.7522' },
      { key: 'alt', label: 'Altitude (m, optional)', type: 'text', initial: '', showIf: (v) => v.format === 'geo' },
      { key: 'label', label: 'Label (optional)', type: 'text', initial: '', showIf: (v) => v.format === 'geo' || v.format === 'apple' },
      { key: 'zoom', label: 'Zoom level', type: 'number', initial: '15', showIf: (v) => v.format === 'apple' || v.format === 'osm' },
    ],
    build: (v) => {
      const lat = str(v, 'lat').trim();
      const lon = str(v, 'lon').trim();
      const label = str(v, 'label');
      switch (str(v, 'format')) {
        case 'google': return { data: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` };
        case 'apple': return { data: `https://maps.apple.com/?ll=${lat},${lon}&z=${str(v, 'zoom')}${label ? `&q=${encodeURIComponent(label)}` : ''}` };
        case 'osm': return { data: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${str(v, 'zoom')}/${lat}/${lon}` };
        default: {
          // The "?q=lat,lon(label)" form is the Android convention for showing a labelled pin.
          const q = label ? `?q=${lat},${lon}(${encodeURIComponent(label)})` : '';
          return { data: `geo:${lat},${lon}${str(v, 'alt') ? ',' + str(v, 'alt') : ''}${q}` };
        }
      }
    },
  },
  {
    id: 'event',
    label: 'Calendar event',
    description: 'An iCalendar VEVENT that phones offer to add to the calendar.',
    fields: [
      { key: 'summary', label: 'Title', type: 'text', initial: '' },
      { key: 'allDay', label: 'All-day event', type: 'checkbox', initial: false },
      { key: 'start', label: 'Start', type: 'datetime-local', initial: '' },
      { key: 'end', label: 'End', type: 'datetime-local', initial: '' },
      { key: 'utc', label: 'Convert times to UTC (otherwise floating local time)', type: 'checkbox', initial: true, showIf: (v) => !v.allDay },
      { key: 'location', label: 'Location', type: 'text', initial: '' },
      { key: 'description', label: 'Description', type: 'textarea', initial: '' },
      { key: 'wrap', label: 'Wrap in BEGIN:VCALENDAR', type: 'checkbox', initial: false },
    ],
    build: (v) => {
      const allDay = bool(v, 'allDay');
      const prop = allDay ? ';VALUE=DATE' : '';
      const lines = ['BEGIN:VEVENT', `SUMMARY:${escapeIcal(str(v, 'summary'))}`];
      if (str(v, 'start')) lines.push(`DTSTART${prop}:${icalDate(str(v, 'start'), allDay, bool(v, 'utc'))}`);
      if (str(v, 'end')) lines.push(`DTEND${prop}:${icalDate(str(v, 'end'), allDay, bool(v, 'utc'))}`);
      if (str(v, 'location')) lines.push(`LOCATION:${escapeIcal(str(v, 'location'))}`);
      if (str(v, 'description')) lines.push(`DESCRIPTION:${escapeIcal(str(v, 'description'))}`);
      lines.push('END:VEVENT');
      const body = bool(v, 'wrap') ? ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//yotasage.github.io//QR//EN', ...lines, 'END:VCALENDAR'] : lines;
      return { data: body.join('\r\n') };
    },
  },
  {
    id: 'otp',
    label: 'One-time password (2FA)',
    description: 'An otpauth:// URI for authenticator apps (Google Authenticator key URI format).',
    fields: [
      { key: 'type', label: 'Type', type: 'select', initial: 'totp', options: [['totp', 'TOTP (time based)'], ['hotp', 'HOTP (counter based)']] },
      { key: 'issuer', label: 'Issuer', type: 'text', initial: '' },
      { key: 'account', label: 'Account name', type: 'text', initial: '' },
      { key: 'secret', label: 'Secret (Base32)', type: 'text', initial: '' },
      { key: 'algorithm', label: 'Algorithm', type: 'select', initial: 'SHA1', options: [['SHA1', 'SHA1'], ['SHA256', 'SHA256'], ['SHA512', 'SHA512']] },
      { key: 'digits', label: 'Digits', type: 'select', initial: '6', options: [['6', '6'], ['8', '8']] },
      { key: 'period', label: 'Period (s)', type: 'number', initial: '30', showIf: (v) => v.type === 'totp' },
      { key: 'counter', label: 'Initial counter', type: 'number', initial: '0', showIf: (v) => v.type === 'hotp' },
    ],
    build: (v) => {
      const secret = str(v, 'secret').replace(/[\s=]/g, '').toUpperCase();
      const note = /^[A-Z2-7]*$/.test(secret) ? undefined : 'The secret contains characters outside the Base32 alphabet (A-Z, 2-7).';
      const label = encodeURIComponent(str(v, 'issuer') ? `${str(v, 'issuer')}:${str(v, 'account')}` : str(v, 'account'));
      const params: [string, string][] = [['secret', secret], ['issuer', str(v, 'issuer')], ['algorithm', str(v, 'algorithm')], ['digits', str(v, 'digits')]];
      params.push(str(v, 'type') === 'totp' ? ['period', str(v, 'period')] : ['counter', str(v, 'counter')]);
      return { data: `otpauth://${str(v, 'type')}/${label}${query(params)}`, note };
    },
  },
  {
    id: 'epc',
    label: 'SEPA payment (EPC / GiroCode)',
    description: 'European Payments Council credit transfer (EPC069-12). The standard asks for EC level M and version 13 or lower.',
    fields: [
      { key: 'version', label: 'EPC version', type: 'select', initial: '002', options: [['002', '002 (BIC optional in the EEA)'], ['001', '001 (BIC required)']] },
      { key: 'name', label: 'Beneficiary name', type: 'text', initial: '' },
      { key: 'iban', label: 'IBAN', type: 'text', initial: '' },
      { key: 'bic', label: 'BIC', type: 'text', initial: '' },
      { key: 'amount', label: 'Amount (EUR)', type: 'text', initial: '', placeholder: '12.50' },
      { key: 'purpose', label: 'Purpose code (4 letters, optional)', type: 'text', initial: '' },
      { key: 'reference', label: 'Structured creditor reference (RF...)', type: 'text', initial: '' },
      { key: 'text', label: 'Unstructured remittance text', type: 'text', initial: '', help: 'Use either the structured reference or the text, not both.' },
      { key: 'info', label: 'Note to the payer', type: 'text', initial: '' },
    ],
    build: (v) => {
      const amount = str(v, 'amount').replace(',', '.').trim();
      const lines = ['BCD', str(v, 'version'), '1', 'SCT', str(v, 'bic').trim(), str(v, 'name'), str(v, 'iban').replace(/\s/g, '').toUpperCase(),
        amount ? `EUR${Number(amount).toFixed(2)}` : '', str(v, 'purpose'), str(v, 'reference'), str(v, 'text'), str(v, 'info')];
      while (lines.length > 10 && lines[lines.length - 1] === '') lines.pop();
      const note = str(v, 'reference') && str(v, 'text') ? 'EPC allows either a structured reference or remittance text, not both.' : undefined;
      return { data: lines.join('\n'), note };
    },
  },
  {
    id: 'crypto',
    label: 'Cryptocurrency payment',
    description: 'BIP 21 style payment URI.',
    fields: [
      { key: 'scheme', label: 'Currency', type: 'select', initial: 'bitcoin', options: [['bitcoin', 'Bitcoin'], ['litecoin', 'Litecoin'], ['bitcoincash', 'Bitcoin Cash'], ['dogecoin', 'Dogecoin'], ['monero', 'Monero'], ['ethereum', 'Ethereum (EIP-681, amount in wei)']] },
      { key: 'address', label: 'Address', type: 'text', initial: '' },
      { key: 'amount', label: 'Amount', type: 'text', initial: '' },
      { key: 'label', label: 'Label', type: 'text', initial: '', showIf: (v) => v.scheme !== 'ethereum' },
      { key: 'message', label: 'Message', type: 'text', initial: '', showIf: (v) => v.scheme !== 'ethereum' },
    ],
    build: (v) => {
      const scheme = str(v, 'scheme');
      if (scheme === 'ethereum') return { data: `ethereum:${str(v, 'address')}${query([['value', str(v, 'amount')]])}` };
      const amountKey = scheme === 'monero' ? 'tx_amount' : 'amount';
      const labelKey = scheme === 'monero' ? 'recipient_name' : 'label';
      const messageKey = scheme === 'monero' ? 'tx_description' : 'message';
      return { data: `${scheme}:${str(v, 'address')}${query([[amountKey, str(v, 'amount')], [labelKey, str(v, 'label')], [messageKey, str(v, 'message')]])}` };
    },
  },
  {
    id: 'gs1',
    label: 'GS1 element string',
    description: 'GS1 Application Identifier data, encoded with FNC1 in first position (GS1 QR Code).',
    fields: [{ key: 'hri', label: 'Data as (AI)value pairs', type: 'textarea', initial: '(01)09501101530003(17)261231(10)ABC123', help: 'Separators (FNC1) are inserted automatically after variable-length fields.' }],
    build: (v) => ({ data: gs1ElementString(str(v, 'hri')), fnc1: 'gs1' }),
  },
  {
    id: 'hex',
    label: 'Raw bytes (hex)',
    description: 'Arbitrary binary data, given as hexadecimal. Bytes are not interpreted as text.',
    fields: [{ key: 'hex', label: 'Hex bytes', type: 'textarea', initial: '48 65 6c 6c 6f', help: 'Spaces, commas, colons, dashes and 0x prefixes are ignored.' }],
    build: (v) => ({ data: hexBytes(str(v, 'hex')) }),
  },
  {
    id: 'encrypted',
    label: 'Password-protected text',
    description: 'Text encrypted in the browser with AES-256-GCM (key from PBKDF2-SHA-256, 250 000 iterations). Ordinary readers only see the cipher text; decrypt it with the tool further down this page.',
    fields: [
      { key: 'public', label: 'Public text shown before the cipher text (optional)', type: 'text', initial: '' },
      { key: 'secret', label: 'Secret text', type: 'textarea', initial: '' },
      { key: 'password', label: 'Password', type: 'password', initial: '' },
    ],
    build: async (v) => {
      if (!str(v, 'password')) return { data: str(v, 'public'), note: 'Enter a password to include the encrypted text.' };
      const sealed = await encryptText(str(v, 'secret'), str(v, 'password'));
      return { data: str(v, 'public') ? `${str(v, 'public')}\n${sealed}` : sealed, note: 'A new random salt and IV are used every time, so the symbol changes on each edit.' };
    },
  },
];

export function initialValues(type: ContentType): Values {
  const v: Values = {};
  for (const f of type.fields) v[f.key] = f.initial ?? (f.type === 'checkbox' ? false : f.type === 'select' ? f.options[0][0] : '');
  return v;
}
