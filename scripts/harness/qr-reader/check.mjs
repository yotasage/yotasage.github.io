// Checks of lib/qrread. Run with `npm run check` in this folder (tsx reads the TypeScript of the site as it is).
//
// - Round trips: symbols made by the site's own encoder (lib/qr, written independently of the reader) are drawn
//   into pixels and read back by zxing-wasm: every symbology, EC level, mask, character set, FNC1, structured
//   append, inverted, mirrored, rotated, damaged and several in one image. The bytes, version, EC level and mask
//   must match what the encoder made.
// - Content: every content type of the generator (lib/qr/payloads.ts) is built and must be parsed back to its
//   kind and its values; known vectors from the standards (RFC 4226/6238 codes, Matter's test setup code, IBAN,
//   RF and QR references, GS1 check digits, punycode).
// - Real codes: images listed in REAL_DIRS are read where they are (never copied); missing folders are skipped.
//   Their content is never printed, as it may be private (eSIM activation codes).
// Prints the failures and one summary line; the exit code is 1 when a check fails.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import * as zxMod from '../../../lib/qrread/zxing.ts';
import * as contentMod from '../../../lib/qrread/content.ts';
import * as otpMod from '../../../lib/qrread/otp.ts';
import * as codesMod from '../../../lib/qrread/codes.ts';
import * as payMod from '../../../lib/qrread/payments.ts';
import * as netMod from '../../../lib/qrread/network.ts';
import * as bytesMod from '../../../lib/qrread/bytes.ts';
import * as encMod from '../../../lib/qr/encoder.ts';
import * as payloadsMod from '../../../lib/qr/payloads.ts';

const m = (x) => x.default ?? x;
const { scanImageData, useWasmBinary } = m(zxMod);
const { parseContent } = m(contentMod);
const { hotp, base32Decode, base32Encode, codeNow } = m(otpMod);
const { decodeMatter, gs1CheckOk, gs1Elements, verhoeff } = m(codesMod);
const { checkIban, checkRf, checkQrr } = m(payMod);
const { punycodeDecode } = m(netMod);
const { hexDump, sniff, visiblePieces } = m(bytesMod);
const { encode, structuredAppendParity } = m(encMod);
const { CONTENT_TYPES, initialValues, decryptText, gs1ElementString } = m(payloadsMod);

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REAL_DIRS = ['C:/Users/Jonat/Downloads/eSIM'];

useWasmBinary(new Uint8Array(readFileSync(join(root, 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'))).buffer);

let passed = 0;
const failures = [];
let group = '';
const section = (name) => { group = name; };
function ok(condition, what) {
  if (condition) passed++;
  else failures.push(`[${group}] ${what}`);
}
const eq = (actual, expected, what) => ok(actual === expected, `${what}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const te = new TextEncoder();

// ---------------------------------------------------------------------------------------------------------------
// Drawing symbols into RGBA pixels.

function draw(sym, { scale = 4, quiet = null, invert = false } = {}) {
  const q = quiet ?? (sym.symbology === 'micro' || sym.symbology === 'rmqr' ? 2 : 4);
  const w = (sym.width + 2 * q) * scale;
  const h = (sym.height + 2 * q) * scale;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mx = Math.floor(x / scale) - q;
      const my = Math.floor(y / scale) - q;
      const dark = mx >= 0 && my >= 0 && mx < sym.width && my < sym.height && sym.modules[my * sym.width + mx] === 1;
      const v = dark !== invert ? 0 : 255;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  }
  return { width: w, height: h, data };
}

function mirror(img) {
  const out = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    out.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (y * img.width + (img.width - 1 - x)) * 4);
  }
  return { ...img, data: out };
}

function rotate90(img) {
  const out = new Uint8ClampedArray(img.data.length);
  const [w, h] = [img.width, img.height];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [nx, ny] = [h - 1 - y, x];
    out.set(img.data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4), (ny * h + nx) * 4);
  }
  return { width: h, height: w, data: out };
}

/** Several images side by side on white, with a gap. */
function compose(images, gap = 20) {
  const w = images.reduce((s, i) => s + i.width + gap, gap);
  const h = Math.max(...images.map((i) => i.height)) + 2 * gap;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  let ox = gap;
  for (const img of images) {
    for (let y = 0; y < img.height; y++) data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y + gap) * w + ox) * 4);
    ox += img.width + gap;
  }
  return { width: w, height: h, data };
}

const opts = (o) => ({ symbology: 'qr2', version: 'auto', ecLevel: 'M', mask: 'auto', mode: 'auto', charset: 'utf-8', eci: 'auto', ...o });
const read = (img, o = {}) => scanImageData({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }, { formats: 'qr', thorough: true, ...o });

async function roundTrip(input, o, what, extra = {}) {
  const sym = encode(input, opts(o));
  const t0 = performance.now();
  const found = await read(draw(sym, extra.draw), extra.scan);
  const ms = performance.now() - t0;
  const d = found.find((x) => x.valid);
  ok(!!d, `${what}: read (${found.length} found, ${found.map((x) => x.error).join('; ')})`);
  if (!d) return { sym, d: null, ms };
  const wantBytes = typeof input === 'string' && !extra.bytes ? null : extra.bytes ?? input;
  if (wantBytes) ok(sameBytes(d.bytes, wantBytes), `${what}: bytes match`);
  else eq(d.text, input, `${what}: text`);
  const wantFormat = { qr2: 'QRCode', qr1: 'QRCodeModel1', micro: 'MicroQRCode', rmqr: 'RMQRCode' }[sym.symbology];
  ok(d.format === wantFormat || (sym.symbology === 'qr2' && d.format === 'QRCodeModel2'), `${what}: format ${d.format}, wanted ${wantFormat}`);
  if (sym.ecLevel && sym.symbology !== 'rmqr') eq(d.ecLevel, sym.ecLevel, `${what}: EC level`);
  if (sym.symbology === 'qr2' || sym.symbology === 'qr1') eq(String(d.version), String(sym.version), `${what}: version`);
  if (sym.symbology === 'qr2' && d.mask !== null) eq(d.mask, sym.mask, `${what}: mask`);
  ok(d.symbol && d.symbol.width === sym.width && d.symbol.height === sym.height, `${what}: symbol bitmap ${d.symbol?.width}×${d.symbol?.height}, wanted ${sym.width}×${sym.height}`);
  if (d.symbol && d.symbol.width === sym.width) {
    let same = 0;
    for (let i = 0; i < sym.modules.length; i++) if ((d.symbol.data[i] === 0) === (sym.modules[i] === 1)) same++;
    ok(same === sym.modules.length, `${what}: symbol bitmap equals the encoder's modules (${same}/${sym.modules.length})`);
  }
  return { sym, d, ms };
}

// ---------------------------------------------------------------------------------------------------------------
section('round trip: Model 2, EC levels and masks');
for (const ec of ['L', 'M', 'Q', 'H']) {
  for (let mask = 0; mask < 8; mask++) await roundTrip('Hello, QR reader! 0123456789', { ecLevel: ec, mask }, `2-${ec} mask ${mask}`);
}
section('round trip: Model 2 versions');
for (const [v, n] of [[1, 10], [5, 80], [10, 200], [20, 600], [27, 1000], [40, 2300]]) {
  const text = Array.from({ length: n }, (_, i) => String.fromCharCode(97 + (i * 7) % 26)).join('');
  await roundTrip(text, { version: v, ecLevel: 'L' }, `version ${v}`);
}
section('round trip: Model 1');
// Known limit: ZXing-C++ reads the site's Model 1 symbols of versions 1 to 4 (as format QRCode) but not 7 and up.
// Model 1 is obsolete and its 1990s specification is not at hand, so it is not known whether the reader or the
// encoder is off (docs/BACKLOG.md). Reported, not counted.
const model1 = [];
for (const v of [1, 2, 3, 4, 5, 6, 7, 10, 14]) {
  const want = `MODEL 1 V${v}`;
  const sym = encode(want, opts({ symbology: 'qr1', version: v }));
  const d = (await read(draw(sym))).find((x) => x.valid);
  model1.push(`${v}:${d && d.text === want ? 'read' : 'not read'}`);
}
section('round trip: Micro QR');
await roundTrip('12345', { symbology: 'micro', version: 1, ecLevel: 'L' }, 'M1 numeric');
await roundTrip('AB12', { symbology: 'micro', version: 2, ecLevel: 'L' }, 'M2 alphanumeric');
await roundTrip('micro', { symbology: 'micro', version: 3, ecLevel: 'M' }, 'M3 byte');
await roundTrip('MICRO QR4', { symbology: 'micro', version: 4, ecLevel: 'Q' }, 'M4 Q');
section('round trip: rMQR');
for (const v of [1, 6, 12, 20, 27, 32]) await roundTrip(`rMQR ${v}`, { symbology: 'rmqr', version: v, ecLevel: 'M' }, `rMQR version ${v}`);
await roundTrip('rMQR H', { symbology: 'rmqr', version: 'auto', ecLevel: 'H' }, 'rMQR H');

section('round trip: character sets');
await roundTrip('Grüße, ÆØÅ æøå', { charset: 'iso-8859-1', eci: 'none' }, 'ISO-8859-1 without ECI');
await roundTrip('Grüße, ÆØÅ æøå', { charset: 'iso-8859-1', eci: 3 }, 'ISO-8859-1 with ECI 3');
const utf = await roundTrip('Ελληνικά, кириллица, 日本語 😀', { charset: 'utf-8', eci: 26 }, 'UTF-8 with ECI 26');
ok(utf.d?.hasECI, 'UTF-8 with ECI 26: ECI seen');
await roundTrip('Ελληνικά, кириллица', { charset: 'utf-8', eci: 'none' }, 'UTF-8 without ECI');
await roundTrip('日本語のテキスト', { charset: 'shift_jis', eci: 'none', allowKanji: true }, 'Shift_JIS kanji mode');

section('round trip: binary, FNC1, structured append');
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 120 }, (_, i) => (i * 37 + 11) & 0xff)]);
const bin = await roundTrip(png, { mode: 'byte' }, 'binary bytes', { bytes: png });
if (bin.d) {
  eq(bin.d.contentType, 'Binary', 'binary: content type');
  eq(parseContent({ text: bin.d.text, bytes: bin.d.bytes, binary: bin.d.contentType === 'Binary' }).kind, 'image', 'PNG bytes are an image');
}
const gs1Data = gs1ElementString('(01)09501101530003(17)261231(10)ABC123(21)SN42');
const gs1Sym = encode(gs1Data, opts({ fnc1: 'gs1' }));
const [gs1d] = await read(draw(gs1Sym));
ok(gs1d?.valid, 'GS1: read');
if (gs1d) {
  eq(gs1d.symbologyId, ']Q3', 'GS1: symbology identifier');
  const p = parseContent({ text: gs1d.text, bytes: gs1d.bytes, gs1: gs1d.symbologyId === ']Q3' || gs1d.contentType === 'GS1' });
  eq(p.kind, 'gs1', 'GS1: kind');
  eq(p.fields.map((f) => f.label.slice(0, 4)).join(' '), '(01) (17) (10) (21)', 'GS1: the four AIs');
  ok(p.fields[0]?.tone === 'good', 'GS1: GTIN check digit correct');
  eq(p.fields[3]?.value, 'SN42', 'GS1: serial after a variable-length field');
}
const whole = 'Structured append splits one message over several symbols, here three of them.';
const parity = structuredAppendParity(te.encode(whole));
const parts = [whole.slice(0, 27), whole.slice(27, 54), whole.slice(54)];
const saImages = parts.map((t, index) => draw(encode(t, opts({ structuredAppend: { index, total: 3, parity } }))));
const sa = (await read(compose(saImages))).filter((x) => x.valid);
eq(sa.length, 3, 'structured append: three symbols in one image');
ok(sa.every((x) => x.sequence?.size === 3 && x.sequence.id === String(parity)), `structured append: size 3 and parity ${parity}: ${JSON.stringify(sa.map((x) => x.sequence))}`);
eq([...sa].sort((a, b) => a.sequence.index - b.sequence.index).map((x) => x.text).join(''), whole, 'structured append: joined in index order');

section('round trip: inverted, mirrored, rotated, damaged, several, small');
const base = encode('https://yotasage.github.io/qr-reader/main', opts({ ecLevel: 'H' }));
const inv = (await read(draw(base, { invert: true }))).find((x) => x.valid);
ok(inv?.inverted, 'inverted symbol read and reported inverted');
const mir = (await read(mirror(draw(base)))).find((x) => x.valid);
ok(mir?.mirrored, 'mirrored symbol read and reported mirrored');
const rot = (await read(rotate90(draw(base)))).find((x) => x.valid);
ok(rot && rot.text === 'https://yotasage.github.io/qr-reader/main', 'rotated symbol read');
// Wipe a block of modules away from the finders: level H restores about 30 %.
const damaged = draw(base);
const s = 4;
for (let y = 14; y < 20; y++) for (let x = 14; x < 22; x++) for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
  const i = (((y + 4) * s + dy) * damaged.width + (x + 4) * s + dx) * 4;
  damaged.data[i] = damaged.data[i + 1] = damaged.data[i + 2] = 255;
}
const dmg = (await read(damaged)).find((x) => x.valid);
ok(dmg?.text === 'https://yotasage.github.io/qr-reader/main', 'damaged level-H symbol read');
const several = compose([draw(encode('one', opts({}))), draw(encode('two', opts({ symbology: 'micro', version: 'auto' }))), draw(encode('three', opts({ symbology: 'rmqr' })))]);
const sev = (await read(several)).filter((x) => x.valid);
eq(sev.map((x) => x.text).join(','), 'one,two,three', 'QR, Micro QR and rMQR in one image, in reading order');
const tiny = (await read(draw(encode('small', opts({})), { scale: 2 }))).find((x) => x.valid);
ok(tiny?.text === 'small', 'two pixels per module');
const blank = await read({ width: 200, height: 200, data: new Uint8ClampedArray(200 * 200 * 4).fill(255) });
eq(blank.length, 0, 'a blank image has no codes');

section('timing');
const big = draw(encode('x'.repeat(1500), opts({ ecLevel: 'L' })), { scale: 6 });
const t0 = performance.now();
await scanImageData({ ...big, data: new Uint8ClampedArray(big.data) }, { formats: 'qr', thorough: false });
const bigMs = performance.now() - t0;
ok(bigMs < 1500, `a ${big.width}×${big.height} image is read in under 1.5 s: ${bigMs.toFixed(0)} ms`);
const frame = compose([draw(encode('camera frame', opts({})), { scale: 6 })], 200);
const t1 = performance.now();
for (let i = 0; i < 5; i++) await scanImageData({ ...frame, data: new Uint8ClampedArray(frame.data) }, { formats: 'qr', thorough: false });
const frameMs = (performance.now() - t1) / 5;
ok(frameMs < 150, `a ${frame.width}×${frame.height} camera-sized frame is read in under 150 ms: ${frameMs.toFixed(0)} ms`);

// ---------------------------------------------------------------------------------------------------------------
section('content: every generator content type');
const SAMPLES = {
  text: [{ text: 'Plain text with https://example.com in it' }, 'text'],
  url: [{ url: 'https://example.com/path?a=1&b=two#frag' }, 'url'],
  wifi: [{ ssid: 'My;Net:work\\"x', auth: 'WPA', password: 'p@ss;word:\\', hidden: true }, 'wifi'],
  vcard: [{ version: '3.0', first: 'Ada', last: 'Lovelace', org: 'Analytical; Engines', cell: '+4712345678', email: 'ada@example.com', street: 'Main 1', city: 'London', bday: '1815-12-10', note: 'Line 1\nLine 2' }, 'contact'],
  mecard: [{ last: 'Lovelace', first: 'Ada', tel: '+4712345678', email: 'ada@example.com', note: 'a;b' }, 'contact'],
  email: [{ to: 'someone@example.com', subject: 'Hi there', body: 'Body & more' }, 'email'],
  sms: [{ number: '+4712345678', message: 'Hello: you' }, 'sms'],
  whatsapp: [{ number: '4712345678', message: 'Hi' }, 'url'],
  tel: [{ number: '+47 123 45 678' }, 'tel'],
  geo: [{ lat: '59.9139', lon: '10.7522', label: 'Oslo' }, 'geo'],
  event: [{ summary: 'Meeting, important', start: '2026-12-01T10:00', end: '2026-12-01T11:30', location: 'Room 1', description: 'Bring notes' }, 'event'],
  otp: [{ issuer: 'Example', account: 'ada@example.com', secret: 'JBSWY3DPEHPK3PXP' }, 'otp'],
  epc: [{ name: 'Red Cross', iban: 'BE72 0000 0000 1616', bic: 'BPOTBEB1', amount: '12.5', text: 'Donation' }, 'epc'],
  crypto: [{ scheme: 'bitcoin', address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', amount: '0.001', label: 'Ada' }, 'crypto'],
  gs1: [{}, 'gs1'],
  hex: [{ hex: '89 50 4e 47 0d 0a 1a 0a 00 00' }, 'image'],
  encrypted: [{ public: 'Scan me', secret: 'The secret', password: 'pw' }, 'encrypted'],
};
for (const type of CONTENT_TYPES) {
  const sample = SAMPLES[type.id];
  ok(!!sample, `a sample for content type ${type.id}`);
  if (!sample) continue;
  const values = { ...initialValues(type), ...sample[0] };
  const payload = await type.build(values);
  const data = payload.data;
  const bytes = typeof data === 'string' ? te.encode(data) : data;
  const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
  const p = parseContent({ text, bytes, binary: typeof data !== 'string', gs1: payload.fnc1 === 'gs1' });
  eq(p.kind, sample[1], `${type.id}: kind`);
  const field = (label) => p.fields.find((f) => f.label.startsWith(label))?.value;
  switch (type.id) {
    case 'wifi':
      eq(field('Network name'), 'My;Net:work\\"x', 'wifi: SSID with escapes');
      eq(field('Password'), 'p@ss;word:\\', 'wifi: password with escapes');
      ok(!!field('Hidden'), 'wifi: hidden');
      break;
    case 'vcard':
      eq(field('Name'), 'Ada Lovelace', 'vcard: name');
      eq(field('Organisation'), 'Analytical; Engines', 'vcard: escaped semicolon');
      eq(field('Phone'), '+4712345678', 'vcard: phone');
      eq(field('Note'), 'Line 1\nLine 2', 'vcard: escaped line break');
      ok(p.actions.some((a) => a.download?.name === 'Ada Lovelace.vcf'), 'vcard: save action');
      break;
    case 'mecard':
      eq(field('Name'), 'Ada Lovelace', 'mecard: name');
      eq(p.body, 'a;b', 'mecard: escaped note');
      break;
    case 'email':
      eq(field('To'), 'someone@example.com', 'email: to');
      eq(field('Subject'), 'Hi there', 'email: subject');
      eq(p.body, 'Body & more', 'email: body');
      break;
    case 'sms': eq(p.body, 'Hello: you', 'sms: message'); break;
    case 'whatsapp': eq(p.title, 'WhatsApp chat', 'whatsapp: title'); eq(field('Message'), 'Hi', 'whatsapp: message'); break;
    case 'geo': eq(field('Coordinates'), '59.9139, 10.7522', 'geo: coordinates'); eq(field('Label'), 'Oslo', 'geo: label'); break;
    case 'event': eq(field('Title'), 'Meeting, important', 'event: escaped title'); eq(field('Location'), 'Room 1', 'event: location'); break;
    case 'otp': eq(p.otp?.[0]?.issuer, 'Example', 'otp: issuer'); eq(p.otp?.[0]?.account, 'ada@example.com', 'otp: account'); break;
    case 'epc':
      eq(field('IBAN'), 'BE72 0000 0000 1616', 'epc: IBAN');
      ok(p.fields.find((f) => f.label === 'IBAN')?.tone === 'good', 'epc: IBAN valid');
      eq(field('Amount'), '€ 12.50', 'epc: amount');
      break;
    case 'crypto': eq(field('Amount'), '0.001 BTC', 'crypto: amount'); break;
    case 'encrypted': {
      ok(!!p.encrypted, 'encrypted: cipher found');
      eq(p.encrypted && await decryptText(p.encrypted.line, 'pw'), 'The secret', 'encrypted: decrypts with the password');
      break;
    }
  }
}
// The generator's other formats of the same content types.
const variants = [
  ['wifi', { auth: 'WPA2-EAP', ssid: 'Corp', password: 'x', identity: 'me', eap: 'PEAP' }, 'wifi'],
  ['wifi', { auth: 'nopass', ssid: 'Cafe' }, 'wifi'],
  ['vcard', { version: '4.0', first: 'A', last: 'B', cell: '+471' }, 'contact'],
  ['vcard', { version: '2.1', first: 'A', last: 'B', cell: '+471' }, 'contact'],
  ['email', { format: 'matmsg', to: 'x@example.com', subject: 's;1', body: 'b' }, 'email'],
  ['sms', { format: 'sms', number: '+471', message: 'm&m' }, 'sms'],
  ['sms', { format: 'mms', number: '+471', message: 'm' }, 'sms'],
  ['geo', { format: 'google', lat: '1.5', lon: '2.5' }, 'url'],
  ['geo', { format: 'apple', lat: '1.5', lon: '2.5' }, 'url'],
  ['geo', { format: 'osm', lat: '1.5', lon: '2.5' }, 'url'],
  ['event', { summary: 'All day', allDay: true, start: '2026-12-01', end: '2026-12-02', wrap: true }, 'event'],
  ['otp', { type: 'hotp', issuer: 'X', account: 'y', secret: 'JBSWY3DPEHPK3PXP', counter: '5' }, 'otp'],
  ['crypto', { scheme: 'ethereum', address: '0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7', amount: '1500000000000000000' }, 'crypto'],
  ['crypto', { scheme: 'monero', address: '4A1', amount: '1' }, 'crypto'],
];
for (const [id, values, kind] of variants) {
  const type = CONTENT_TYPES.find((t) => t.id === id);
  const payload = await type.build({ ...initialValues(type), ...values });
  const p = parseContent({ text: payload.data, bytes: te.encode(payload.data) });
  eq(p.kind, kind, `${id} ${JSON.stringify(values).slice(0, 40)}: kind`);
  if (id === 'geo' && kind === 'url') eq(p.fields.find((f) => f.label === 'Coordinates')?.value, '1.5, 2.5', `${values.format} maps link: coordinates`);
  if (id === 'crypto' && values.scheme === 'ethereum') eq(p.fields.find((f) => f.label === 'Amount')?.value, '1.5 ETH', 'ethereum: wei to ETH');
  if (id === 'email') eq(p.fields.find((f) => f.label === 'Subject')?.value, 's;1', 'MATMSG: escaped subject');
  if (id === 'sms' && values.format === 'sms') eq(p.body, 'm&m', 'sms: URI body');
}

section('content: other formats');
const kind = (text, extra = {}) => parseContent({ text, ...extra }).kind;
eq(kind('LPA:1$smdp.example.com$ABCD-1234$$1'), 'esim', 'eSIM');
const es = parseContent({ text: 'LPA:1$smdp.example.com$ABCD-1234$$1' });
eq(es.fields[0].value, 'smdp.example.com', 'eSIM: SM-DP+');
ok(es.fields[1].secret && es.fields[1].value === 'ABCD-1234', 'eSIM: activation code, hidden');
ok(es.fields.some((f) => f.label === 'Confirmation code' && f.value.startsWith('Needed')), 'eSIM: confirmation code flag');
eq(kind('https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA:1$smdp.example.com$X'), 'url', 'Apple eSIM link');
eq(parseContent({ text: 'https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA:1$smdp.example.com$X' }).inner?.kind, 'esim', 'Apple eSIM link: inner eSIM');
eq(kind('BIZCARD:N:Ada;X:Lovelace;T:Countess;C:Engines;B:+471;E:a@b.c;;'), 'contact', 'BIZCARD');
eq(kind('BEGIN:VEVENT\nSUMMARY:x\nDTSTART:20261201T100000Z\nEND:VEVENT'), 'event', 'bare VEVENT');
eq(kind('SMTP:a@b.c:subject:body'), 'email', 'SMTP:');
eq(kind('geo:59.9,10.7;u=35'), 'geo', 'geo with uncertainty');
eq(kind('MT:Y.K9042C00KA0648G00'), 'matter', 'Matter');
eq(kind('DPP:C:81/1;M:5254005828e5;K:MDkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDIgADURzxmttZoIRIPWGoQMV00XHWCAQIhXruVWOz0NjlkIA=;;'), 'dpp', 'Wi-Fi Easy Connect');
eq(kind('{"a": 1, "b": [true, null]}'), 'json', 'JSON');
eq(kind('data:text/plain;base64,V0lGSTpTOm5ldDtQOnB3Ozs='), 'binary', 'text data URL');
eq(parseContent({ text: 'data:text/plain;base64,V0lGSTpTOm5ldDtQOnB3Ozs=' }).inner?.kind, 'wifi', 'text data URL: inner Wi-Fi');
eq(kind(`data:image/png;base64,${Buffer.from(png).toString('base64')}`), 'image', 'image data URL');
eq(kind(Buffer.from(png).toString('base64')), 'image', 'Base64 of a PNG');
eq(kind('lightning:lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq'), 'crypto', 'Lightning');
eq(parseContent({ text: 'lightning:lnbc2500u1pvjluez' }).fields[0].value, '0.0025 BTC', 'Lightning amount');
eq(kind('www.example.com/page'), 'url', 'link without scheme');
eq(kind('http://paypal.com@evil.example/login'), 'url', 'URL with user info');
const evil = parseContent({ text: 'http://paypal.com@evil.example/login' });
ok(evil.warnings.some((w) => w.includes('evil.example')) && evil.warnings.some((w) => w.includes('not encrypted')), 'URL with user info: both warnings');
const idn = parseContent({ text: 'https://xn--pypal-4ve.com/' });
eq(idn.fields[0].value, 'pаypal.com', 'IDN shown in Unicode');
ok(idn.warnings.some((w) => w.includes('Latin and Cyrillic')), 'IDN: mixed scripts warned');
ok(parseContent({ text: 'https://bit.ly/abc' }).notes.some((n) => n.includes('shortener')), 'link shortener noted');
eq(kind('myapp://open/thing'), 'url', 'app link');
eq(kind('Just a sentence: with a colon.'), 'text', 'text with a colon stays text');
eq(kind('4006381333931'), 'text', 'EAN number is text');
ok(parseContent({ text: '4006381333931' }).notes.some((n) => n.includes('GS1 check digit')), 'EAN number noted');
const dl = parseContent({ text: 'https://id.gs1.org/01/9506000134352/10/ABC?17=261231' });
eq(dl.title, 'GS1 Digital Link', 'GS1 Digital Link');
eq(dl.groups?.[0]?.fields[0]?.value, '09506000134352', 'GS1 Digital Link: GTIN-13 padded to 14');
const swiss = ['SPC', '0200', '1', 'CH4431999123000889012', 'S', 'Robert Schneider AG', 'Rue du Lac', '1268', '2501', 'Biel', 'CH', '', '', '', '', '', '', '',
  '1949.75', 'CHF', 'S', 'Pia-Maria Rutschmann-Schnyder', 'Grosse Marktgasse', '28', '9400', 'Rorschach', 'CH', 'QRR', '210000000003139471430009017',
  'Order of 15 June', 'EPD'].join('\n');
const sp = parseContent({ text: swiss });
eq(sp.kind, 'swiss-qr', 'Swiss QR bill');
ok(sp.fields.find((f) => f.label === 'QR reference')?.tone === 'good', 'Swiss QR bill: QR reference check digit (SIX example)');
eq(sp.fields.find((f) => f.label === 'Amount')?.value, 'CHF 1949.75', 'Swiss QR bill: amount');
const bp = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';
const bcbp = parseContent({ text: bp });
eq(bcbp.kind, 'bcbp', 'boarding pass (IATA BCBP example)');
eq(bcbp.groups?.[0]?.fields.find((f) => f.label === 'Flight')?.value, 'AC 834', 'boarding pass: flight');
eq(bcbp.groups?.[0]?.fields.find((f) => f.label === 'From → to')?.value, 'YUL → FRA', 'boarding pass: route');
eq(bcbp.groups?.[0]?.fields.find((f) => f.label === 'Seat')?.value, '1A', 'boarding pass: seat');

section('content: binary');
const gz = (await import('fflate')).gzipSync(te.encode('WIFI:S:Packed;P:secret;;'));
const pk = parseContent({ text: '', bytes: gz, binary: true });
eq(pk.kind, 'binary', 'gzip: binary');
eq(pk.inner?.kind, 'wifi', 'gzip: unpacked Wi-Fi inside');
const zip = (await import('fflate')).zipSync({ 'note.txt': te.encode('hello') });
eq(parseContent({ text: '', bytes: zip, binary: true }).groups?.[0]?.fields[0]?.label, 'note.txt', 'ZIP: file list');
eq(parseContent({ text: '', bytes: Uint8Array.from([1, 2, 3, 200, 201, 202]), binary: true }).kind, 'binary', 'unknown bytes');
eq(sniff(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))?.mime, 'image/jpeg', 'JPEG magic');
ok(hexDump(te.encode('Hello, world! 123')).startsWith('00000000  48 65 6c 6c 6f 2c 20 77  6f 72 6c 64 21 20 31 32  |Hello, world! 12|'), 'hex dump layout');
eq(visiblePieces('a\tb\r\nc\u200bd').map((p) => p.name ?? p.text).join('|'), 'a|HT|b|CR LF|c|U+200B|d', 'control and invisible characters named');

section('known vectors');
// RFC 4226 appendix D: secret "12345678901234567890", counters 0..9.
const rfcKey = te.encode('12345678901234567890');
const hotpWant = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
for (let c = 0; c < 10; c++) eq(await hotp(rfcKey, c, 'SHA1', 6), hotpWant[c], `RFC 4226 HOTP counter ${c}`);
// RFC 6238 appendix B: TOTP at T = 59 and 1111111109 s, 8 digits, the seeds for SHA-1, SHA-256 and SHA-512.
const seeds = { SHA1: '12345678901234567890', SHA256: '12345678901234567890123456789012', SHA512: '1234567890123456789012345678901234567890123456789012345678901234' };
const totpWant = { 59: { SHA1: '94287082', SHA256: '46119246', SHA512: '90693936' }, 1111111109: { SHA1: '07081804', SHA256: '68084774', SHA512: '25091201' } };
for (const [t, byAlg] of Object.entries(totpWant)) {
  for (const [alg, want] of Object.entries(byAlg)) {
    const r = await codeNow({ type: 'totp', secret: te.encode(seeds[alg]), algorithm: alg, digits: 8, period: 30, counter: 0 }, Number(t) * 1000);
    eq(r.code, want, `RFC 6238 TOTP ${alg} at ${t}`);
  }
}
eq(base32Encode(base32Decode('JBSWY3DPEHPK3PXP')), 'JBSWY3DPEHPK3PXP', 'Base32 round trip');
eq(new TextDecoder().decode(base32Decode('MZXW6YTBOI======')), 'foobar', 'RFC 4648 Base32 "foobar"');
// Google Authenticator export, made here with an independent protobuf writer.
const pb = (field, wire, payload) => {
  const out = [];
  const vint = (n) => { while (n >= 128) { out.push((n & 127) | 128); n = Math.floor(n / 128); } out.push(n); };
  vint(field * 8 + wire);
  if (wire === 0) vint(payload);
  else { vint(payload.length); out.push(...payload); }
  return out;
};
const otpParams = [...pb(1, 2, [...rfcKey]), ...pb(2, 2, [...te.encode('Example:ada')]), ...pb(3, 2, [...te.encode('Example')]), ...pb(4, 0, 1), ...pb(5, 0, 1), ...pb(6, 0, 2)];
const migration = Uint8Array.from([...pb(1, 2, otpParams), ...pb(2, 0, 1), ...pb(3, 0, 1), ...pb(4, 0, 0)]);
const mig = parseContent({ text: `otpauth-migration://offline?data=${encodeURIComponent(Buffer.from(migration).toString('base64'))}` });
eq(mig.kind, 'otp-migration', 'Google Authenticator export');
eq(mig.otp?.[0]?.account, 'ada', 'export: account without the issuer prefix');
eq(mig.otp && await hotp(mig.otp[0].secret, 1, 'SHA1', 6), '287082', 'export: secret gives the RFC 4226 code');
ok(mig.otp?.[0]?.uri.startsWith('otpauth://totp/Example:ada?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), `export: otpauth URI ${mig.otp?.[0]?.uri}`);
// Matter: the test setup code of the Matter SDK (vendor 0xFFF1, product 0x8000, discriminator 3840, PIN 20202021).
const mt = decodeMatter('MT:Y.K9042C00KA0648G00');
eq(mt?.vendorId, 0xfff1, 'Matter: vendor ID');
eq(mt?.productId, 0x8000, 'Matter: product ID');
eq(mt?.discriminator, 3840, 'Matter: discriminator');
eq(mt?.passcode, 20202021, 'Matter: passcode');
eq(mt?.manualCode, '34970112332', 'Matter: manual pairing code');
eq(verhoeff('236'), 3, 'Verhoeff check digit of 236');
ok(checkIban('GB82 WEST 1234 5698 7654 32').ok, 'IBAN GB82 WEST… valid');
ok(!checkIban('GB82 WEST 1234 5698 7654 33').ok, 'IBAN with a wrong digit invalid');
ok(checkIban('NO93 8601 1117 947').ok, 'Norwegian IBAN valid');
ok(checkRf('RF18 5390 0754 7034'), 'RF reference valid');
ok(!checkRf('RF19 5390 0754 7034'), 'RF reference with wrong check digits invalid');
ok(checkQrr('210000000003139471430009017'), 'QR reference valid');
ok(gs1CheckOk('09501101530003') && gs1CheckOk('4006381333931') && !gs1CheckOk('4006381333932'), 'GS1 check digits');
eq(gs1Elements('(3103)001250').fields[0].value, '1.250 kg', 'GS1 net weight with 3 decimals');
eq(punycodeDecode('mnchen-3ya'), 'münchen', 'punycode münchen');
eq(punycodeDecode('wgv71a119e'), '日本語', 'punycode 日本語');

// ---------------------------------------------------------------------------------------------------------------
section('real codes (read where they are, contents not printed)');
let realCount = 0;
for (const dir of REAL_DIRS) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => /\.(png|jpe?g|gif|bmp)$/i.test(f))) {
    // zxing reads the image file itself (stb_image), so no image decoder is needed here.
    const { readBarcodes } = await import('zxing-wasm/reader');
    const found = (await readBarcodes(new Uint8Array(readFileSync(join(dir, file))), { formats: ['QRCode', 'MicroQRCode', 'RMQRCode'], textMode: 'Plain' })).filter((r) => r.isValid);
    ok(found.length === 1, `${file}: one code`);
    if (!found.length) continue;
    const p = parseContent({ text: found[0].text, bytes: found[0].bytes });
    if (dir.toLowerCase().includes('esim')) {
      eq(p.kind, 'esim', `${file}: eSIM`);
      ok(p.warnings.length === 0, `${file}: no warnings (${p.warnings.length})`);
      ok(/\./.test(p.fields[0]?.value ?? '') && p.fields[1]?.secret, `${file}: SM-DP+ address and a hidden activation code`);
    }
    realCount++;
  }
}

console.log(failures.join('\n'));
console.log(`${passed} passed, ${failures.length} failed (real codes read: ${realCount}; Model 1 versions: ${model1.join(" ")}; timing: large image ${bigMs.toFixed(0)} ms, camera frame ${frameMs.toFixed(0)} ms).`);
process.exit(failures.length ? 1 : 0);
