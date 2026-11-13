// Parsers for links and for what phones act on: URLs, Wi-Fi networks (WIFI:), eSIM activation codes (LPA:),
// Wi-Fi Easy Connect (DPP:), email, SMS, phone numbers and locations (geo:).

import { Field, Parsed, parsed, safeHref } from './types';

// ---------------------------------------------------------------------------------------------------------------
// Punycode (RFC 3492), to show internationalised domain names as they look.

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;

function adapt(delta: number, points: number, first: boolean) {
  delta = first ? Math.floor(delta / 700) : delta >> 1;
  delta += Math.floor(delta / points);
  let k = 0;
  while (delta > ((BASE - T_MIN) * T_MAX) >> 1) {
    delta = Math.floor(delta / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * delta) / (delta + 38));
}

function digitOf(c: number) {
  if (c >= 48 && c <= 57) return c - 22;
  if (c >= 65 && c <= 90) return c - 65;
  if (c >= 97 && c <= 122) return c - 97;
  return BASE;
}

export function punycodeDecode(input: string): string {
  const out: number[] = [];
  let n = 128;
  let i = 0;
  let bias = 72;
  const b = Math.max(input.lastIndexOf('-'), 0);
  for (let j = 0; j < b; j++) out.push(input.charCodeAt(j));
  for (let idx = b > 0 ? b + 1 : 0; idx < input.length;) {
    const oldi = i;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (idx >= input.length) throw new Error('Bad punycode');
      const digit = digitOf(input.charCodeAt(idx++));
      if (digit >= BASE) throw new Error('Bad punycode');
      i += digit * w;
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < t) break;
      w *= BASE - t;
    }
    const len = out.length + 1;
    bias = adapt(i - oldi, len, oldi === 0);
    n += Math.floor(i / len);
    i %= len;
    out.splice(i++, 0, n);
  }
  return String.fromCodePoint(...out);
}

/** A host name with its xn-- labels shown in Unicode. */
export function unicodeHost(host: string): string {
  return host.split('.').map((label) => {
    if (!/^xn--/i.test(label)) return label;
    try { return punycodeDecode(label.slice(4).toLowerCase()); } catch { return label; }
  }).join('.');
}

const SCRIPTS: [string, RegExp][] = [
  ['Latin', /\p{Script=Latin}/u], ['Cyrillic', /\p{Script=Cyrillic}/u], ['Greek', /\p{Script=Greek}/u],
  ['Armenian', /\p{Script=Armenian}/u], ['Cherokee', /\p{Script=Cherokee}/u],
];

function scriptsIn(label: string) {
  return SCRIPTS.filter(([, re]) => re.test(label)).map(([name]) => name);
}

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at',
  'tiny.cc', 'rb.gy', 'bl.ink', 'qrco.de', 'qr.codes', 's.id', 'v.gd', 'lnkd.in', 'trib.al', 'short.io', 'tiny.one',
  'urlz.fr', 'shorturl.com', 'x.co', 'qrs.ly', 'me-qr.com', 'qr1.be', 'l.ead.me', 'qrfy.io', 'linktr.ee',
]);

function decodeParam(s: string) {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
}

/** Query parameters in order, with repeated keys kept. */
function queryPairs(search: string): [string, string][] {
  return search.replace(/^\?/, '').split('&').filter(Boolean).map((part) => {
    const eq = part.indexOf('=');
    return eq < 0 ? [decodeParam(part), ''] : [decodeParam(part.slice(0, eq)), decodeParam(part.slice(eq + 1))];
  });
}

function coordinate(lat: number, lon: number): Field[] {
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return [];
  return [{ label: 'Coordinates', value: `${lat}, ${lon}`, mono: true, note: dms(lat, lon) }];
}

function dms(lat: number, lon: number) {
  const part = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = ((a - d) * 60 - m) * 60;
    return `${d}°${String(m).padStart(2, '0')}′${s.toFixed(1).padStart(4, '0')}″${v < 0 ? neg : pos}`;
  };
  return `${part(lat, 'N', 'S')} ${part(lon, 'E', 'W')}`;
}

/** Links to open a point on three maps (opened only when clicked). */
function mapActions(lat: number, lon: number) {
  return [
    { label: 'OpenStreetMap', href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`, hint: 'Opens openstreetmap.org' },
    { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`, hint: 'Opens google.com' },
    { label: 'Apple Maps', href: `https://maps.apple.com/?ll=${lat},${lon}&q=${lat},${lon}`, hint: 'Opens maps.apple.com' },
  ];
}

// ---------------------------------------------------------------------------------------------------------------

/** A web link, or a link with another scheme (myapp://…). `inner` content (an eSIM in Apple's setup link) is parsed by the caller. */
export function parseUrl(text: string): Parsed | null {
  const trimmed = text.trim();
  if (/\s/.test(trimmed) || !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  let url: URL;
  try { url = new URL(trimmed); } catch { return null; }
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  const web = scheme === 'http' || scheme === 'https';
  if (!web) {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return null;
    const p = parsed('url', 'App link', { subtitle: `${scheme}://` });
    p.fields.push({ label: 'Link', value: trimmed, mono: true });
    p.notes.push(`Links with the ${scheme}: scheme open an app that has registered it, if one is installed. They are not opened from this page.`);
    p.actions.push({ label: 'Copy link', copy: trimmed });
    return p;
  }

  const host = url.hostname;
  const shown = unicodeHost(host);
  const p = parsed('url', 'Web link', { subtitle: shown });
  p.fields.push({ label: 'Site', value: shown, note: shown !== host ? `written as ${host}` : undefined });
  p.fields.push({ label: 'Address', value: trimmed, mono: true });
  if (url.pathname && url.pathname !== '/') p.fields.push({ label: 'Path', value: decodeParam(url.pathname), mono: true });
  for (const [k, v] of queryPairs(url.search)) p.fields.push({ label: `?${k}`, value: v, mono: true });
  if (url.hash) p.fields.push({ label: 'Fragment', value: decodeParam(url.hash.slice(1)), mono: true });

  // Warnings about where the link really goes.
  if (scheme === 'http') p.warnings.push('The link is not encrypted (http, not https): what you send to the site can be read on the way.');
  const at = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)@/i.exec(trimmed);
  if (at) p.warnings.push(`The part before “@” (${decodeParam(at[1])}) is a user name, not the site: the link goes to ${shown}.`);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')) p.warnings.push('The site is given by a numeric IP address instead of a name.');
  if (shown !== host) {
    const mixed = shown.split('.').find((label) => scriptsIn(label).length > 1);
    if (mixed) p.warnings.push(`“${mixed}” mixes ${scriptsIn(mixed).join(' and ')} letters, as look-alike addresses do.`);
    else p.notes.push('The site name has letters outside A–Z; check it is the site you expect.');
  }
  const bare = host.replace(/^www\./, '');
  if (SHORTENERS.has(bare)) p.notes.push(`${bare} is a link shortener or QR redirect service: where it leads is only known after opening it.`);
  if (url.port) p.notes.push(`The link uses port ${url.port}.`);

  // Links some apps and sites understand.
  if (bare === 'wa.me' || (bare === 'api.whatsapp.com' && url.pathname === '/send')) {
    p.title = 'WhatsApp chat';
    const number = bare === 'wa.me' ? url.pathname.slice(1) : url.searchParams.get('phone') ?? '';
    const message = url.searchParams.get('text');
    p.fields.unshift(...[
      number ? { label: 'Number', value: `+${number}`, mono: true } : null,
      message ? { label: 'Message', value: message } : null,
    ].filter(Boolean) as Field[]);
  }
  if (bare === 'play.google.com' && url.searchParams.get('id')) {
    p.title = 'Google Play app';
    p.fields.unshift({ label: 'App ID', value: url.searchParams.get('id'), mono: true });
  }
  if (bare === 'apps.apple.com' || bare === 'itunes.apple.com') p.title = 'App Store app';
  const ll = mapPoint(url, bare);
  if (ll) {
    p.title = 'Map location';
    p.fields.unshift(...coordinate(ll[0], ll[1]));
  }

  p.actions.push({ label: 'Open link', href: trimmed, hint: `Opens ${shown} in a new tab` });
  p.actions.push({ label: 'Copy link', copy: trimmed });
  return p;
}

function mapPoint(url: URL, host: string): [number, number] | null {
  const pair = (s: string | null) => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(s ?? '');
    return m ? [Number(m[1]), Number(m[2])] as [number, number] : null;
  };
  if (/(^|\.)google\.[a-z.]+$/.test(host) && url.pathname.startsWith('/maps')) {
    const at = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url.pathname);
    return pair(url.searchParams.get('query')) ?? pair(url.searchParams.get('q')) ?? (at ? [Number(at[1]), Number(at[2])] : null);
  }
  if (host === 'maps.apple.com') return pair(url.searchParams.get('ll')) ?? pair(url.searchParams.get('q'));
  if (host === 'openstreetmap.org') {
    const lat = url.searchParams.get('mlat');
    const lon = url.searchParams.get('mlon');
    return lat && lon ? [Number(lat), Number(lon)] : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------

/** Splits "K:v;K:v;;" with backslash escapes into pairs. Keys are upper-cased. */
export function splitFields(body: string, sep = ';'): [string, string][] {
  const out: [string, string][] = [];
  let cur = '';
  const items: string[] = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\' && i + 1 < body.length) { cur += c + body[++i]; continue; }
    if (c === sep) { items.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur) items.push(cur);
  for (const item of items) {
    if (!item) continue;
    let colon = -1;
    for (let i = 0; i < item.length; i++) {
      if (item[i] === '\\') { i++; continue; }
      if (item[i] === ':') { colon = i; break; }
    }
    if (colon < 0) out.push(['', unescapeBackslash(item)]);
    else out.push([item.slice(0, colon).toUpperCase(), unescapeBackslash(item.slice(colon + 1))]);
  }
  return out;
}

export function unescapeBackslash(s: string) {
  return s.replace(/\\(.)/g, '$1');
}

const WIFI_SECURITY: Record<string, string> = {
  WPA: 'WPA/WPA2/WPA3 Personal',
  WPA2: 'WPA2 Personal',
  WPA3: 'WPA3 Personal',
  SAE: 'WPA3 Personal (SAE)',
  WEP: 'WEP',
  NOPASS: 'Open network, no password',
  'WPA2-EAP': 'WPA2/WPA3 Enterprise (802.1X)',
  'WPA-EAP': 'WPA Enterprise (802.1X)',
};

export function parseWifi(text: string): Parsed | null {
  if (!/^WIFI:/i.test(text)) return null;
  const pairs = splitFields(text.slice(5));
  const get = (k: string) => pairs.find(([key]) => key === k)?.[1];
  const strip = (s: string | undefined) => (s && s.length > 1 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);
  const ssid = strip(get('S')) ?? '';
  const password = strip(get('P'));
  const type = (get('T') ?? '').toUpperCase();
  const p = parsed('wifi', 'Wi-Fi network', { subtitle: ssid || '(no name)' });
  p.fields.push({ label: 'Network name (SSID)', value: ssid });
  p.fields.push({ label: 'Security', value: type ? WIFI_SECURITY[type] ?? type : password ? 'Not given (WPA assumed by most phones)' : 'Open network, no password' });
  if (password !== undefined && type !== 'NOPASS') p.fields.push({ label: 'Password', value: password, secret: true, mono: true });
  if (/^true$/i.test(get('H') ?? '')) p.fields.push({ label: 'Hidden network', value: 'Yes: the network does not announce its name' });
  const named: Record<string, string> = { E: 'EAP method', PH2: 'Phase 2 method', A: 'Anonymous identity', I: 'Identity', R: 'Transition disable', K: 'Public key (Easy Connect)' };
  for (const [k, v] of pairs) {
    if (['S', 'P', 'T', 'H'].includes(k)) continue;
    p.fields.push({ label: named[k] ?? `${k || 'Field'}`, value: v, mono: true });
  }
  if (type === 'WEP') p.warnings.push('WEP is broken: anyone nearby can find the key. The network should be moved to WPA2 or WPA3.');
  if (!ssid) p.warnings.push('The code has no network name (S:).');
  p.notes.push('The camera app of an Android phone or an iPhone offers to join this network when it scans the code.');
  if (password) p.actions.push({ label: 'Copy password', copy: password });
  p.actions.push({ label: 'Copy network name', copy: ssid });
  return p;
}

// ---------------------------------------------------------------------------------------------------------------

/** eSIM activation code, GSMA SGP.22 section 4.1: LPA:1$SM-DP+ address$matching ID[$OID[$confirmation code required]]. */
export function parseEsim(text: string): Parsed | null {
  const m = /^LPA:(.*)$/is.exec(text.trim());
  if (!m) return null;
  const parts = m[1].split('$');
  const [format, smdp = '', matching = '', oid = '', confirm = ''] = parts;
  const p = parsed('esim', 'eSIM activation code', { subtitle: smdp || undefined });
  p.fields.push({ label: 'SM-DP+ address', value: smdp, mono: true, note: 'the operator’s server the eSIM is downloaded from' });
  p.fields.push({ label: 'Activation code (matching ID)', value: matching || '(none: the server finds the eSIM by the phone’s EID)', mono: !!matching, secret: !!matching });
  if (oid) p.fields.push({ label: 'SM-DP+ OID', value: oid, mono: true });
  p.fields.push({ label: 'Confirmation code', value: confirm === '1' ? 'Needed: the operator gives it to you separately' : 'Not needed' });
  for (let i = 5; i < parts.length; i++) if (parts[i]) p.fields.push({ label: `Field ${i + 1}`, value: parts[i], mono: true });
  p.fields.push({ label: 'Whole code', value: text.trim(), mono: true, secret: true });
  if (format !== '1') p.warnings.push(`The code says format “${format}”; phones only know format 1.`);
  if (!smdp || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(smdp)) p.warnings.push('The SM-DP+ address does not look like a server name.');
  if (matching && !/^[0-9A-Z-]+$/.test(matching)) p.warnings.push('The matching ID has characters outside 0-9, A-Z and “-”, which SGP.22 allows.');
  p.notes.push('An activation code can usually be used only once and installs the eSIM on the first phone that uses it: keep it private until you install it.');
  p.notes.push('To type it in instead of scanning: on an iPhone, Settings › Mobile Service › Add eSIM › Use QR Code › Enter Details Manually; on Android, Settings › Network › SIMs › Add eSIM › Need help? › Enter it manually (names vary). Give the SM-DP+ address and the activation code, or paste the whole code.');
  if (smdp) p.actions.push({ label: 'Copy SM-DP+ address', copy: smdp });
  if (matching) p.actions.push({ label: 'Copy activation code', copy: matching });
  p.actions.push({ label: 'Copy whole code', copy: text.trim() });
  p.actions.push({
    label: 'Install on this iPhone',
    href: `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(text.trim())}`,
    hint: 'iOS 17.4 or later: opens Apple’s eSIM setup with this code',
    only: 'ios',
  });
  return p;
}

/** Wi-Fi Easy Connect (Device Provisioning Protocol) bootstrapping URI: DPP:C:…;M:…;I:…;K:…;; */
export function parseDpp(text: string): Parsed | null {
  if (!/^DPP:/i.test(text)) return null;
  const names: Record<string, string> = { C: 'Channels', M: 'MAC address', I: 'Information', K: 'Public key', H: 'Host', V: 'Version', B: 'Supported bands' };
  const p = parsed('dpp', 'Wi-Fi Easy Connect device');
  for (const [k, v] of splitFields(text.slice(4))) p.fields.push({ label: names[k] ?? k, value: v, mono: true });
  p.notes.push('A device (often a smart home device) that joins a network with Wi-Fi Easy Connect: scan it with the phone or router that adds it.');
  return p;
}

// ---------------------------------------------------------------------------------------------------------------

export function parseEmail(text: string): Parsed | null {
  let to = '';
  let subject = '';
  let body = '';
  let cc = '';
  let bcc = '';
  if (/^mailto:/i.test(text)) {
    const rest = text.slice(7);
    const q = rest.indexOf('?');
    to = decodeParam(q < 0 ? rest : rest.slice(0, q));
    for (const [k, v] of q < 0 ? [] : queryPairs(rest.slice(q + 1))) {
      const key = k.toLowerCase();
      if (key === 'subject') subject = v;
      else if (key === 'body') body = v;
      else if (key === 'cc') cc = v;
      else if (key === 'bcc') bcc = v;
      else if (key === 'to') to = to ? `${to}, ${v}` : v;
    }
  } else if (/^MATMSG:/i.test(text)) {
    const pairs = splitFields(text.slice(7));
    const get = (k: string) => pairs.find(([key]) => key === k)?.[1] ?? '';
    [to, subject, body] = [get('TO'), get('SUB'), get('BODY')];
  } else if (/^SMTP:/i.test(text)) {
    const [t = '', s = '', ...b] = text.slice(5).split(':');
    [to, subject, body] = [t, s, b.join(':')];
  } else {
    return null;
  }
  const p = parsed('email', 'Email', { subtitle: to || undefined });
  p.fields.push({ label: 'To', value: to, mono: true });
  if (cc) p.fields.push({ label: 'Cc', value: cc, mono: true });
  if (bcc) p.fields.push({ label: 'Bcc', value: bcc, mono: true });
  if (subject) p.fields.push({ label: 'Subject', value: subject });
  if (body) p.body = body;
  const params = [['subject', subject], ['body', body], ['cc', cc], ['bcc', bcc]].filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`);
  p.actions.push({ label: 'Write email', href: `mailto:${to.split(/[,;]\s*/).map(encodeURIComponent).join(',')}${params.length ? `?${params.join('&')}` : ''}`, hint: 'Opens your mail app' });
  p.actions.push({ label: 'Copy address', copy: to });
  return p;
}

export function parseSms(text: string): Parsed | null {
  let number = '';
  let message = '';
  let mms = false;
  const colon = /^(SMSTO|MMSTO):([^:]*):?([\s\S]*)$/i.exec(text);
  if (colon) {
    mms = colon[1].toUpperCase() === 'MMSTO';
    [number, message] = [colon[2], colon[3]];
  } else {
    const uri = /^(sms|smsto|mms|mmsto):([^?;]*)[;]?(\?([\s\S]*))?$/i.exec(text);
    if (!uri) return null;
    mms = /^mms/i.test(uri[1]);
    number = decodeParam(uri[2]);
    for (const [k, v] of queryPairs(uri[4] ?? '')) if (k.toLowerCase() === 'body') message = v;
  }
  const p = parsed('sms', mms ? 'MMS message' : 'Text message', { subtitle: number || undefined });
  p.fields.push({ label: 'To', value: number, mono: true });
  if (message) p.body = message;
  p.actions.push({ label: 'Write message', href: `sms:${number}${message ? `?body=${encodeURIComponent(message)}` : ''}`, hint: 'Opens your messaging app' });
  p.actions.push({ label: 'Copy number', copy: number });
  return p;
}

export function parseTel(text: string): Parsed | null {
  const m = /^tel:(.+)$/i.exec(text.trim());
  if (!m) return null;
  const number = decodeParam(m[1]);
  const p = parsed('tel', 'Phone number', { subtitle: number });
  p.fields.push({ label: 'Number', value: number, mono: true });
  if (/[a-z]/i.test(number.replace(/;.*$/, ''))) p.warnings.push('The number has letters in it.');
  p.actions.push({ label: 'Call', href: `tel:${number.replace(/\s/g, '')}`, hint: 'Opens your phone app' });
  p.actions.push({ label: 'Copy number', copy: number });
  return p;
}

/** geo: URI (RFC 5870), with Android's ?q=lat,lon(label). */
export function parseGeo(text: string): Parsed | null {
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(-?\d+(?:\.\d+)?))?([^?]*)(\?(.*))?$/i.exec(text.trim());
  if (!m) return null;
  const [lat, lon] = [Number(m[1]), Number(m[2])];
  const p = parsed('geo', 'Location', { subtitle: `${lat}, ${lon}` });
  p.fields.push(...coordinate(lat, lon));
  if (m[3]) p.fields.push({ label: 'Altitude', value: `${m[3]} m` });
  for (const param of m[4].split(';').filter(Boolean)) {
    const [k, v = ''] = param.split('=');
    p.fields.push({ label: k === 'u' ? 'Uncertainty' : k === 'crs' ? 'Coordinate system' : k, value: k === 'u' ? `${v} m` : v });
  }
  for (const [k, v] of queryPairs(m[6] ?? '')) {
    const label = /\((.*)\)\s*$/.exec(v);
    p.fields.push({ label: k === 'q' ? (label ? 'Label' : 'Search') : k, value: label ? label[1] : v });
  }
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) p.warnings.push('The coordinates are outside ±90° latitude or ±180° longitude.');
  else p.actions.push(...mapActions(lat, lon));
  p.actions.push({ label: 'Copy coordinates', copy: `${lat}, ${lon}` });
  return p;
}

export { decodeParam, queryPairs, safeHref };
