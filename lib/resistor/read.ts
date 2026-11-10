// Reading what was typed: a value in any notation, an SMD marking or the colours of the bands. A text that reads
// several ways gives several readings, the likeliest first.

import { Band, Colour, FAILURE_RATE, coloursFromText, decodeBands } from './colours';
import { commonness, same } from './eseries';
import { formatOhms, pow10Text } from './format';
import { decodeMarking, flipMarking, MarkingReading } from './smd';

export type ReadingKind = 'value' | 'smd' | 'eia96' | 'bands';

export interface Reading {
  // Stable for a given text, so a link can name the reading that was picked.
  id: string;
  kind: ReadingKind;
  // "Value", "SMD marking", "EIA-96", "Colour bands".
  label: string;
  ohms: number;
  // Percent, where the code gives one.
  tolerance?: number;
  // ppm/K, from a sixth band.
  tcr?: number;
  // One line on how the text was read.
  how: string;
  // Where sources or makers disagree.
  note?: string;
  // In E24, E96 or E192.
  standard: boolean;
  // For colours: the bands in the order they were read.
  bands?: Band[];
}

export interface ReadResult {
  readings: Reading[];
  // Why the text could not be read (no readings), or what is still missing.
  message?: string;
}

// The smallest and largest resistance the tool takes.
export const MIN_OHMS = 1e-6;
export const MAX_OHMS = 1e12;

interface Draft extends Omit<Reading, 'id' | 'standard'> {
  id: string;
  // Sorted last: readings upside down.
  late?: number;
  // The place in the list, in place of how common the value is.
  rank?: number;
}

const NUMBER = '(\\d+\\.?\\d*|\\.\\d+)';

// The power of ten of each letter and what it stands for.
const MULTIPLIERS: Record<string, [number, string]> = {
  u: [-6, 'micro'], m: [-3, 'milli (lower case; upper-case M is mega)'], k: [3, 'kilo'], K: [3, 'kilo'],
  M: [6, 'mega (upper case; lower-case m is milli)'], G: [9, 'giga'], g: [9, 'giga'], T: [12, 'tera'],
  R: [0, 'ohms'], r: [0, 'ohms'], E: [0, 'ohms'], e: [0, 'ohms'], L: [-3, 'milli'], l: [-3, 'milli'],
};

const letterText = (letter: string) => (letter === 'u' ? 'µ' : letter);

const scale = (text: string, exp: number) => Number(`${text}e${exp}`);

// A compact text (no spaces, no unit, decimal point) as a value, in every way it reads.
function valueReadings(t: string): Draft[] {
  const out: Draft[] = [];
  const add = (id: string, ohms: number, how: string) => out.push({ id, kind: 'value', label: 'Value', ohms, how: how[0].toUpperCase() + how.slice(1) });
  let m: RegExpMatchArray | null;

  if (new RegExp(`^${NUMBER}$`).test(t)) add('num', Number(t), 'A number in ohms');

  const sci = t.match(new RegExp(`^${NUMBER}[eE]([+-]?\\d+)$`));
  const addSci = () => { if (sci) add('sci', Number(t), `Scientific notation: ${sci[1]} × ${pow10Text(Number(sci[2]))} Ω`); };
  // Lower-case e is first of all an exponent; upper-case E first of all stands for ohms (4E7 = 4.7 Ω).
  if (sci && /e/.test(t)) addSci();

  // A number and a multiplier: 4.7k, 1M, 1.5Meg, 10m, 22u, 47R, with R for ohms allowed after it (4.7kR).
  m = t.match(new RegExp(`^${NUMBER}(meg|[umkKMGgT])[Rr]?$`, 'i'));
  if (m && /^meg$/i.test(m[2])) add('meg', scale(m[1], 6), 'Meg is mega');
  else if ((m = t.match(new RegExp(`^${NUMBER}([umkKMGgT])[Rr]?$`)))) add('mult', scale(m[1], MULTIPLIERS[m[2]][0]), `A number with ${letterText(m[2])} for ${MULTIPLIERS[m[2]][1]}`);
  else if ((m = t.match(new RegExp(`^${NUMBER}([RrE])$`)))) add('mult', Number(m[1]), `A number with ${m[2]} for ohms`);

  // RKM notation: the letter is the decimal point (4k7, R47, 1M5, 4E7, 5L0).
  m = t.match(/^(\d*)([umkKMGgTRrEeLl])(\d+)$/);
  if (m) {
    const [exp, what] = MULTIPLIERS[m[2]];
    const number = `${m[1] || '0'}.${m[3]}`;
    const letter = m[2];
    add('rkm', scale(number, exp), `RKM notation: ${letterText(letter)} is the decimal point and stands for ${what}`);
    if (letter === 'M') {
      out.push({
        id: 'rkm-milli', kind: 'smd', label: 'Shunt marking', ohms: scale(number, -3),
        how: 'M as the decimal point of a value in milliohms, as some makers of shunts mark them',
      });
    }
  }
  if (sci && !/e/.test(t)) addSci();
  return out;
}

function markingDraft(r: MarkingReading, code: string): Draft {
  const eia = r.form === 'eia96';
  return {
    id: r.form + (r.tolerance !== undefined ? '-tol' : ''),
    kind: eia ? 'eia96' : 'smd',
    label: eia ? 'EIA-96' : r.form === 'link' ? 'Link' : 'SMD marking',
    ohms: r.ohms,
    tolerance: r.tolerance,
    how: r.how[0].toUpperCase() + r.how.slice(1),
    note: eia ? 'EIA-96 is used on 1 % parts.' : undefined,
    // Markings of 100 MΩ and more are rare: a number typed as it is comes first.
    rank: r.ohms > 1e8 ? commonness(r.ohms) + 2.5 : undefined,
  };
}

// A text without unit as a marking: as printed, upside down, and with an underline (typed as _).
function markingReadings(t: string): Draft[] {
  const out: Draft[] = [];
  // 472k is a value: lower-case k, m and g are multipliers, never tolerance letters.
  if (/^\d{3,4}[kmg]$/.test(t)) return out;
  const underlined = t.includes('_');
  const code = t.replace(/_/g, '');
  const straight = decodeMarking(code).map((r) => markingDraft(r, code));

  if (underlined) {
    for (const d of straight) {
      out.push({ ...d, id: `${d.id}-u1`, tolerance: d.tolerance ?? 1, how: `${d.how}. Underline read as: a 1 % part marked with a short code (some makers)` });
      out.push({ ...d, id: `${d.id}-u0`, how: `${d.how}. Underline read as: only a mark for which way up the code is` });
    }
    if (/^\d{2,4}$/.test(code)) {
      out.push({ id: 'u-milli', kind: 'smd', label: 'SMD marking', ohms: scale(code, -3), how: `Underline read as: the value in milliohms (${Number(code)} mΩ), as some makers of low values mark them` });
    }
    for (const d of out) d.note = 'What an underline means depends on the maker: check the datasheet.';
    return out;
  }
  out.push(...straight);

  // Upside down: 601 is 109, and X89 is 68X.
  const flipped = flipMarking(code);
  if (flipped && flipped[0] !== '0' && /^(\d{3,4}|\d\d[ZXSH]|[ZXSH]\d\d)$/i.test(code)) {
    for (const r of decodeMarking(flipped)) {
      const d = markingDraft(r, flipped);
      out.push({ ...d, id: `flip-${d.id}`, how: `Turned upside down it reads ${flipped}. ${d.how}`, note: undefined, rank: undefined, late: 1 });
    }
  }
  return out;
}

const bandList = (bands: Band[]) => bands.map((b) => `${b.colour} ${b.meaning}`).join(', ');

function bandReadings(colours: Colour[]): ReadResult {
  const drafts: Draft[] = [];
  const forward = decodeBands(colours);
  if (forward.ok) {
    drafts.push({
      id: 'bands', kind: 'bands', label: 'Colour bands', ohms: forward.ohms, tolerance: colours.length === 1 ? undefined : forward.tolerance,
      tcr: forward.tcr, bands: forward.bands, note: forward.note,
      how: colours.length === 1 ? 'A single black band is a 0 Ω link' : `${colours.length} bands: ${bandList(forward.bands)}`,
      rank: forward.ohms === 0 || commonness(forward.ohms) < 3 ? 0 : 1,
    });
  }
  const reversed = [...colours].reverse();
  if (reversed.join() !== colours.join()) {
    const back = decodeBands(reversed);
    if (back.ok) {
      drafts.push({
        id: 'bands-rev', kind: 'bands', label: 'From the other end', ohms: back.ohms, tolerance: back.tolerance, tcr: back.tcr,
        bands: back.bands, note: back.note, how: `${colours.length} bands: ${bandList(back.bands)}`,
        // After the forward reading, unless only this one lands on a standard value.
        rank: (commonness(back.ohms) < 3 ? 0 : 1) + 0.5,
      });
    }
  }
  // Four bands and a fifth for the failure rate, on military parts.
  for (const [order, id] of [[colours, 'bands-mil'], [reversed, 'bands-mil-rev']] as [Colour[], string][]) {
    if (order.length !== 5 || FAILURE_RATE[order[4]] === undefined) continue;
    if (id === 'bands-mil-rev' && reversed.join() === colours.join()) continue;
    const four = decodeBands(order.slice(0, 4));
    if (!four.ok || four.tolerance < 1) continue;
    drafts.push({
      id, kind: 'bands', label: 'Military, 4 bands + 1', ohms: four.ohms, tolerance: four.tolerance,
      bands: [...four.bands, { colour: order[4], role: 'failure', meaning: `${FAILURE_RATE[order[4]]} %/1000 h` }],
      how: `Four bands (${bandList(four.bands)}) and ${order[4]} as a failure rate of ${FAILURE_RATE[order[4]]} % per 1000 h`,
      note: 'The failure-rate band of military parts is from secondary sources and not checked against the standard.',
      rank: commonness(four.ohms) < 3 ? 0.7 : 5,
    });
  }
  if (drafts.length) return { readings: finish(drafts) };
  return { readings: [], message: forward.ok === false ? forward.error : undefined };
}

// Sorts, removes readings that say the same, and gives every reading its own id.
function finish(drafts: Draft[]): Reading[] {
  const ranked = drafts
    .filter((d) => Number.isFinite(d.ohms) && d.ohms >= 0 && (d.ohms === 0 || (d.ohms >= MIN_OHMS && d.ohms <= MAX_OHMS)))
    .map((d, i) => ({ d, i, rank: d.rank ?? (d.late ?? 0) * 10 + (d.ohms === 0 ? 0 : commonness(d.ohms)) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i);
  const out: Reading[] = [];
  for (const { d } of ranked) {
    if (out.some((r) => same(r.ohms, d.ohms) && r.tolerance === d.tolerance && r.tcr === d.tcr)) continue;
    let id = d.id;
    for (let n = 2; out.some((r) => r.id === id); n++) id = `${d.id}${n}`;
    const { late, rank, ...rest } = d;
    out.push({ ...rest, id, standard: d.ohms > 0 && commonness(d.ohms) < 3 });
  }
  return out;
}

const EXAMPLES = 'Try a value (4k7, 4.7 kΩ), a marking (472, 01C) or band colours (yellow violet red gold).';

// Everything a typed text can mean.
export function readInput(text: string): ReadResult {
  let t = text.normalize('NFKC').trim()
    .replace(/[ΩΩ]/g, 'Ω').replace(/[µμ]/g, 'u').replace(/[−–]/g, '-');
  if (!t) return { readings: [] };

  // Colours: words only.
  if (/^[a-zA-Z\s,;/\\|\-]+$/.test(t) && /[a-zA-Z]{2}/.test(t)) {
    const parsed = coloursFromText(t);
    if ('error' in parsed) {
      const noColour = !/[\s,;/\\|\-]/.test(t.trim());
      return { readings: [], message: noColour ? `${parsed.error} ${EXAMPLES}` : parsed.error };
    }
    return bandReadings(parsed.colours);
  }
  if (/^-\s*[\d.,]/.test(t)) return { readings: [], message: 'A resistance cannot be negative.' };

  // A tolerance after the value: 4k7 1%, 10k ±0.1 %.
  let tolerance: number | undefined;
  const tol = t.match(/\s*(?:±|\+\/?-)?\s*(\d+(?:[.,]\d+)?)\s*%$/);
  if (tol) {
    tolerance = Number(tol[1].replace(',', '.'));
    t = t.slice(0, tol.index).trim();
  }
  // A unit: Ω, ohm, ohms.
  const unit = t.match(/\s*(Ω|ohms?)$/i);
  if (unit) t = t.slice(0, unit.index);
  const marking = !unit && !tol && !/\s/.test(t.trim());
  t = t.replace(/\s+/g, '');
  if (!t) return { readings: [], message: `There is no number in “${text.trim()}”. ${EXAMPLES}` };

  // A comma is a decimal comma; before exactly three digits it may also separate thousands.
  const variants: [string, string][] = [];
  if (t.includes(',')) {
    if (t.includes('.')) variants.push([t.replace(/,/g, ''), ' (commas as thousands separators)']);
    else {
      if ((t.match(/,/g) || []).length === 1) variants.push([t.replace(',', '.'), ' (decimal comma)']);
      if (/^\d{1,3}(,\d{3})+(?!\d)/.test(t)) variants.push([t.replace(/,/g, ''), ' (comma as thousands separator)']);
    }
  } else variants.push([t, '']);

  const drafts: Draft[] = [];
  for (const [variant, remark] of variants) {
    // Nobody writes 1 Ω as 01E: with a zero in front, a marking is the likelier reading.
    const late = /^0\d/.test(variant) ? 0.5 : undefined;
    for (const d of valueReadings(variant)) drafts.push({ ...d, late, id: remark.includes('thousands') ? `${d.id}-th` : d.id, how: d.how + remark });
  }
  if (marking && !t.includes(',') && !t.includes('.')) drafts.push(...markingReadings(t));
  if (tolerance !== undefined) for (const d of drafts) d.tolerance = tolerance;

  const readings = finish(drafts);
  if (readings.length) return { readings };
  if (drafts.some((d) => d.ohms > MAX_OHMS)) return { readings: [], message: `That is more than ${formatOhms(MAX_OHMS)}, the largest value the tool takes.` };
  if (drafts.some((d) => d.ohms > 0 && d.ohms < MIN_OHMS)) return { readings: [], message: `That is less than ${formatOhms(MIN_OHMS)}, the smallest value the tool takes.` };
  return { readings: [], message: `“${text.trim()}” does not read as a value, a marking or colours. ${EXAMPLES}` };
}
