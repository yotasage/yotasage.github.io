// Parsers for codes on products, devices and tickets: GS1 element strings and GS1 Digital Link URLs (GS1 General
// Specifications), Matter setup codes (Matter Core Specification 5.1) and IATA boarding passes (BCBP, Resolution 792).

import { Field, Parsed, parsed } from './types';

// ---------------------------------------------------------------------------------------------------------------
// GS1

interface AiDef {
  title: string;
  /** Fixed length of the data, or undefined for variable length (ended by GS or the end). */
  fixed?: number;
  max?: number;
  kind?: 'date' | 'check' | 'decimal' | 'datetime' | 'currency';
  unit?: string;
}

const AI2: Record<string, AiDef> = {
  '00': { title: 'Serial shipping container code (SSCC)', fixed: 18, kind: 'check' },
  '01': { title: 'GTIN (product number)', fixed: 14, kind: 'check' },
  '02': { title: 'GTIN of contained items', fixed: 14, kind: 'check' },
  '10': { title: 'Batch or lot', max: 20 },
  '11': { title: 'Production date', fixed: 6, kind: 'date' },
  '12': { title: 'Due date', fixed: 6, kind: 'date' },
  '13': { title: 'Packaging date', fixed: 6, kind: 'date' },
  '15': { title: 'Best before', fixed: 6, kind: 'date' },
  '16': { title: 'Sell by', fixed: 6, kind: 'date' },
  '17': { title: 'Expiry (use by)', fixed: 6, kind: 'date' },
  '20': { title: 'Variant', fixed: 2 },
  '21': { title: 'Serial number', max: 20 },
  '22': { title: 'Consumer product variant', max: 20 },
  '30': { title: 'Count of items', max: 8 },
  '37': { title: 'Count of trade items', max: 8 },
  '90': { title: 'Internal (agreed between partners)', max: 30 },
};
for (let i = 91; i <= 99; i++) AI2[String(i)] = { title: 'Company internal', max: 90 };

const AI3: Record<string, AiDef> = {
  '235': { title: 'Third-party controlled serial (TPX)', max: 28 },
  '240': { title: 'Additional product identification', max: 30 },
  '241': { title: 'Customer part number', max: 30 },
  '242': { title: 'Made-to-order variant', max: 6 },
  '243': { title: 'Packaging component number', max: 20 },
  '250': { title: 'Secondary serial number', max: 30 },
  '251': { title: 'Reference to source entity', max: 30 },
  '253': { title: 'Global document type (GDTI)', max: 30 },
  '254': { title: 'GLN extension', max: 20 },
  '255': { title: 'Global coupon number (GCN)', max: 25 },
  '400': { title: 'Customer’s order number', max: 30 },
  '401': { title: 'Consignment number (GINC)', max: 30 },
  '402': { title: 'Shipment number (GSIN)', fixed: 17, kind: 'check' },
  '403': { title: 'Routing code', max: 30 },
  '410': { title: 'Ship to (GLN)', fixed: 13, kind: 'check' },
  '411': { title: 'Bill to (GLN)', fixed: 13, kind: 'check' },
  '412': { title: 'Purchased from (GLN)', fixed: 13, kind: 'check' },
  '413': { title: 'Ship for (GLN)', fixed: 13, kind: 'check' },
  '414': { title: 'Location (GLN)', fixed: 13, kind: 'check' },
  '415': { title: 'Invoicing party (GLN)', fixed: 13, kind: 'check' },
  '416': { title: 'Production or service location (GLN)', fixed: 13, kind: 'check' },
  '417': { title: 'Party (GLN)', fixed: 13, kind: 'check' },
  '420': { title: 'Ship-to postal code', max: 20 },
  '421': { title: 'Ship-to postal code with country', max: 12 },
  '422': { title: 'Country of origin', fixed: 3 },
  '423': { title: 'Countries of initial processing', max: 15 },
  '424': { title: 'Country of processing', fixed: 3 },
  '425': { title: 'Countries of disassembly', max: 15 },
  '426': { title: 'Country of full process chain', fixed: 3 },
  '427': { title: 'Country subdivision of origin', max: 3 },
};

const AI4: Record<string, AiDef> = {
  '7001': { title: 'NATO stock number', fixed: 13 },
  '7003': { title: 'Expiration date and time', fixed: 10, kind: 'datetime' },
  '7006': { title: 'First freeze date', fixed: 6, kind: 'date' },
  '7007': { title: 'Harvest date', max: 12 },
  '8003': { title: 'Returnable asset (GRAI)', max: 30 },
  '8004': { title: 'Individual asset (GIAI)', max: 30 },
  '8006': { title: 'Trade item piece (ITIP)', fixed: 18 },
  '8017': { title: 'Service relation, provider (GSRN)', fixed: 18, kind: 'check' },
  '8018': { title: 'Service relation, recipient (GSRN)', fixed: 18, kind: 'check' },
  '8020': { title: 'Payment slip reference', max: 25 },
  '8200': { title: 'Extended packaging URL', max: 70 },
};

const MEASURES: Record<string, [string, string]> = {
  '310': ['Net weight', 'kg'], '311': ['Length', 'm'], '312': ['Width', 'm'], '313': ['Depth', 'm'], '314': ['Area', 'm²'],
  '315': ['Net volume', 'l'], '316': ['Net volume', 'm³'], '320': ['Net weight', 'lb'], '330': ['Gross weight', 'kg'],
  '331': ['Length (logistic)', 'm'], '332': ['Width (logistic)', 'm'], '333': ['Depth (logistic)', 'm'],
  '334': ['Area (logistic)', 'm²'], '335': ['Gross volume', 'l'], '336': ['Gross volume', 'm³'],
};

function lookup(s: string, i: number): { ai: string; def: AiDef } | null {
  const two = s.slice(i, i + 2);
  const four = s.slice(i, i + 4);
  if (/^3[1-6]\d\d$/.test(four)) {
    const m = MEASURES[four.slice(0, 3)];
    return { ai: four, def: { title: m ? m[0] : 'Measure', fixed: 6, kind: 'decimal', unit: m ? m[1] : '' } };
  }
  if (/^39[0-3]\d$/.test(four)) {
    const titles = ['Amount payable', 'Amount payable with currency', 'Price', 'Price with currency'];
    return { ai: four, def: { title: titles[Number(four[2])], max: four[2] === '1' || four[2] === '3' ? 18 : 15, kind: four[2] === '1' || four[2] === '3' ? 'currency' : 'decimal' } };
  }
  if (/^(7\d|8\d)$/.test(two)) {
    if (AI4[four]) return { ai: four, def: AI4[four] };
    if (/^\d{4}$/.test(four)) return { ai: four, def: { title: `AI ${four}`, max: 30 } };
  }
  const three = s.slice(i, i + 3);
  if (AI3[three]) return { ai: three, def: AI3[three] };
  if (AI2[two]) return { ai: two, def: AI2[two] };
  return null;
}

/** GS1 mod-10 check digit of the digits before the last. */
export function gs1CheckOk(digits: string) {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(digits[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

function gs1Date(v: string, now = new Date()) {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(v);
  if (!m) return v;
  // GS1 General Specifications 7.12: the century that puts the year within 49 years back and 50 ahead.
  const cy = now.getFullYear();
  let year = Math.floor(cy / 100) * 100 + Number(m[1]);
  if (year - cy > 50) year -= 100;
  else if (cy - year > 49) year += 100;
  const day = m[3] === '00' ? 'end of month' : m[3];
  return m[3] === '00' ? `${year}-${m[2]} (${day})` : `${year}-${m[2]}-${m[3]}`;
}

function describe(ai: string, def: AiDef, value: string): Field {
  const f: Field = { label: `(${ai}) ${def.title}`, value, mono: true };
  if (def.kind === 'check') {
    const good = gs1CheckOk(value);
    f.note = good ? 'check digit correct' : 'check digit wrong';
    f.tone = good ? 'good' : 'bad';
  } else if (def.kind === 'date') {
    f.value = gs1Date(value);
    f.note = value;
  } else if (def.kind === 'datetime') {
    f.value = `${gs1Date(value.slice(0, 6))} ${value.slice(6, 8)}:${value.slice(8, 10)}`;
  } else if (def.kind === 'decimal' || def.kind === 'currency') {
    const decimals = Number(ai[3]);
    const digits = def.kind === 'currency' ? value.slice(3) : value;
    const n = Number(digits) / 10 ** decimals;
    f.value = `${def.kind === 'currency' ? `${value.slice(0, 3)} ` : ''}${n.toFixed(decimals)}${def.unit ? ` ${def.unit}` : ''}`;
    f.note = value;
  }
  return f;
}

const GS = '\u001d';

/** Element strings: raw with GS separators (FNC1), or the human-readable "(01)…(10)…" form. */
export function gs1Elements(input: string): { fields: Field[]; error?: string } | null {
  const fields: Field[] = [];
  if (/^\(\d{2,4}\)/.test(input.trim())) {
    for (const m of input.trim().matchAll(/\((\d{2,4})\)([^(]*)/g)) {
      const found = lookup(m[1] + '000000', 0);
      const def = found && found.ai === m[1] ? found.def : { title: `AI ${m[1]}` };
      fields.push(describe(m[1], def, m[2]));
    }
    return fields.length ? { fields } : null;
  }
  const s = input.replace(/^\]Q3|^\]d2|^\]C1|^\]e0/, '').replace(/^\u001d/, '');
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    const found = lookup(s, i);
    if (!found) return { fields, error: `“${s.slice(i, i + 4)}…” at character ${i + 1} is not an application identifier this reader knows.` };
    const { ai, def } = found;
    i += ai.length;
    let value: string;
    if (def.fixed) {
      value = s.slice(i, i + def.fixed);
      i += def.fixed;
      if (s[i] === GS) i++;
    } else {
      const end = s.indexOf(GS, i);
      value = end < 0 ? s.slice(i) : s.slice(i, end);
      i = end < 0 ? s.length : end + 1;
    }
    fields.push(describe(ai, def, value));
  }
  return { fields };
}

export function parseGs1(text: string, isGs1: boolean): Parsed | null {
  if (!isGs1 && !/^\(\d{2,4}\)\S/.test(text.trim())) return null;
  const r = gs1Elements(text);
  if (!r || !r.fields.length) return null;
  const p = parsed('gs1', 'GS1 product data', { fields: r.fields });
  const gtin = r.fields.find((f) => f.label.startsWith('(01)'));
  if (gtin) p.subtitle = `GTIN ${gtin.value}`;
  if (r.error) p.warnings.push(r.error);
  p.notes.push('GS1 application identifiers, as on product and shipping labels. A GTIN starting with 0 is the EAN-13 or UPC-A number of the product with a 0 in front.');
  return p;
}

/** A GS1 Digital Link: a web address whose path holds application identifiers, e.g. https://id.gs1.org/01/09506000134352/10/ABC. */
export function digitalLinkFields(url: URL): Field[] | null {
  const segments = url.pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const start = segments.findIndex((s, i) => /^(00|01|253|255|401|402|414|417|8003|8004|8006|8010|8013|8017|8018)$/.test(s) && segments[i + 1] !== undefined);
  if (start < 0) return null;
  const fields: Field[] = [];
  const add = (ai: string, value: string) => {
    const found = lookup(ai + '0000000', 0);
    fields.push(describe(ai, found && found.ai === ai ? found.def : { title: `AI ${ai}` }, value));
  };
  for (let i = start; i + 1 < segments.length; i += 2) {
    if (!/^\d{2,4}$/.test(segments[i])) break;
    add(segments[i], segments[i + 1]);
  }
  for (const [k, v] of url.searchParams) if (/^\d{2,4}$/.test(k)) add(k, v);
  const primary = fields[0];
  if (primary && primary.label.startsWith('(01)') && !/^\d{14}$/.test(primary.value)) {
    // GTIN-8, -12 and -13 may be written short in a Digital Link; GS1 pads them to 14.
    if (/^\d{8,13}$/.test(primary.value)) {
      const padded = primary.value.padStart(14, '0');
      fields[0] = describe('01', AI2['01'], padded);
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------------------------------------------
// Matter

const BASE38 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.';

export function base38Decode(s: string): Uint8Array | null {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 5) {
    const chunk = s.slice(i, i + 5);
    const bytes = chunk.length === 5 ? 3 : chunk.length === 4 ? 2 : chunk.length === 2 ? 1 : -1;
    if (bytes < 0) return null;
    let value = 0;
    for (let j = chunk.length - 1; j >= 0; j--) {
      const d = BASE38.indexOf(chunk[j]);
      if (d < 0) return null;
      value = value * 38 + d;
    }
    for (let b = 0; b < bytes; b++) { out.push(value & 0xff); value = Math.floor(value / 256); }
    if (value !== 0) return null;
  }
  return Uint8Array.from(out);
}

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function verhoeff(digits: string) {
  let c = 0;
  const rev = [...digits].reverse();
  for (let i = 0; i < rev.length; i++) c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][Number(rev[i])]];
  return VERHOEFF_INV[c];
}

export interface MatterPayload {
  version: number;
  vendorId: number;
  productId: number;
  flow: number;
  capabilities: number;
  discriminator: number;
  passcode: number;
  /** The 11-digit manual pairing code (without vendor and product ID). */
  manualCode: string;
}

export function decodeMatter(text: string): MatterPayload | null {
  const m = /^MT:([0-9A-Z.-]+)/.exec(text.trim());
  if (!m) return null;
  const bytes = base38Decode(m[1].split('*')[0]);
  if (!bytes || bytes.length < 11) return null;
  let pos = 0;
  const read = (n: number) => {
    let v = 0;
    for (let j = 0; j < n; j++, pos++) v += ((bytes[pos >> 3] >> (pos & 7)) & 1) * 2 ** j;
    return v;
  };
  const version = read(3);
  const vendorId = read(16);
  const productId = read(16);
  const flow = read(2);
  const capabilities = read(8);
  const discriminator = read(12);
  const passcode = read(27);
  const short = discriminator >> 8;
  const body = `${(short >> 2) & 3}${String(((short & 3) << 14) | (passcode & 0x3fff)).padStart(5, '0')}${String(passcode >> 14).padStart(4, '0')}`;
  return { version, vendorId, productId, flow, capabilities, discriminator, passcode, manualCode: body + verhoeff(body) };
}

export function parseMatter(text: string): Parsed | null {
  const m = decodeMatter(text);
  if (!m) return null;
  const p = parsed('matter', 'Matter smart home device');
  const hex4 = (n: number) => `0x${n.toString(16).toUpperCase().padStart(4, '0')}`;
  const manual = `${m.manualCode.slice(0, 4)}-${m.manualCode.slice(4, 7)}-${m.manualCode.slice(7)}`;
  p.subtitle = `Setup code ${manual}`;
  p.fields.push({ label: 'Manual setup code', value: manual, mono: true, note: 'type this in when the app cannot scan' });
  p.fields.push({ label: 'Setup PIN (passcode)', value: String(m.passcode).padStart(8, '0'), mono: true, secret: true });
  p.fields.push({ label: 'Vendor ID', value: `${m.vendorId} (${hex4(m.vendorId)})`, mono: true, note: m.vendorId >= 0xfff1 && m.vendorId <= 0xfff4 ? 'a test vendor ID' : undefined });
  p.fields.push({ label: 'Product ID', value: `${m.productId} (${hex4(m.productId)})`, mono: true });
  p.fields.push({ label: 'Discriminator', value: `${m.discriminator} (${hex4(m.discriminator)})`, mono: true });
  const how = [m.capabilities & 1 ? 'Wi-Fi access point' : '', m.capabilities & 2 ? 'Bluetooth LE' : '', m.capabilities & 4 ? 'on the network' : '', m.capabilities & 8 ? 'Wi-Fi Public Action Frame' : ''].filter(Boolean);
  p.fields.push({ label: 'Found by', value: how.join(', ') || 'not given' });
  p.fields.push({ label: 'Setup flow', value: ['Standard: powering on is enough', 'User action needed first (see the manual)', 'Custom: the maker’s app first', 'Reserved'][m.flow] });
  if (m.version !== 0) p.warnings.push(`Payload version ${m.version}; Matter 1.x uses version 0.`);
  if (text.trim().slice(3).includes('*')) p.notes.push('The code holds several devices (separated by “*”); the first is shown.');
  p.notes.push('Scan the code in the Apple Home, Google Home, Alexa, SmartThings or another Matter app to add the device. Anyone with the setup code can add it while it is in pairing mode.');
  p.actions.push({ label: 'Copy manual code', copy: m.manualCode });
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// IATA boarding pass (BCBP)

const COMPARTMENTS: Record<string, string> = { F: 'First', A: 'First', P: 'First', J: 'Business', C: 'Business', D: 'Business', I: 'Business', Z: 'Business', W: 'Premium economy', Y: 'Economy' };

function julian(dayOfYear: number, year = new Date().getFullYear()) {
  if (!(dayOfYear >= 1 && dayOfYear <= 366)) return null;
  const d = new Date(Date.UTC(year, 0, dayOfYear));
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function parseBcbp(text: string): Parsed | null {
  if (!/^M[1-9].{20}[E ]/.test(text) || text.length < 60) return null;
  const legs = Number(text[1]);
  const name = text.slice(2, 22).trim();
  const [family, given = ''] = name.split('/');
  const p = parsed('bcbp', 'Boarding pass', { subtitle: `${given} ${family}`.trim() });
  p.fields.push({ label: 'Passenger', value: name, note: 'family name / given names, as the airline writes them' });
  p.fields.push({ label: 'Electronic ticket', value: text[22] === 'E' ? 'Yes' : 'No' });
  p.groups = [];
  let pos = 23;
  for (let leg = 0; leg < legs && pos + 37 <= text.length; leg++) {
    const take = (n: number) => { const v = text.slice(pos, pos + n); pos += n; return v; };
    const pnr = take(7).trim();
    const from = take(3);
    const to = take(3);
    const carrier = take(3).trim();
    const flight = take(5).trim().replace(/^0+(?=\d)/, '');
    const day = Number(take(3));
    const compartment = take(1);
    const seat = take(4).trim().replace(/^0+(?=\d)/, '');
    const sequence = take(5).trim().replace(/^0+(?=\d)/, '');
    const status = take(1);
    const size = parseInt(take(2), 16) || 0;
    const conditional = take(size);
    const fields: Field[] = [
      { label: 'Flight', value: `${carrier} ${flight}`, mono: true },
      { label: 'From → to', value: `${from} → ${to}`, mono: true },
      { label: 'Date', value: julian(day) ? `${julian(day)} (day ${day} of the year; the year is not in the code)` : `day ${day}` },
      { label: 'Booking reference', value: pnr, mono: true },
      { label: 'Seat', value: seat || 'not assigned', mono: true },
      { label: 'Class', value: `${COMPARTMENTS[compartment] ?? 'Booking class'} (${compartment})` },
      { label: 'Check-in number', value: sequence, mono: true },
      { label: 'Passenger status', value: status, mono: true },
    ];
    if (conditional.trim()) fields.push({ label: 'More data', value: conditional, mono: true });
    p.groups.push({ title: legs > 1 ? `Flight ${leg + 1}` : 'Flight', fields });
  }
  if (pos < text.length) {
    const rest = text.slice(pos);
    p.fields.push({ label: rest.startsWith('^') ? 'Security data' : 'Rest', value: rest, mono: true });
  }
  p.notes.push('The boarding pass format of IATA (BCBP). The barcode gives away your booking reference, which with your name opens the booking on many airline sites: keep old boarding passes private.');
  return p;
}
