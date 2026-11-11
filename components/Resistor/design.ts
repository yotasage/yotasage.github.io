// What the Design section works with: the circuit, its quantities as typed, the parts, the temperatures and the
// limits. All of it is part of the link. Also what the section says in words (the answer, a candidate as text), so
// that the harness can compare the page with the engine. No React here.

import {
  Candidate, Circuit, CircuitFamily, CircuitId, DESIGN_TEMPERATURES, DriftModel, LINK_LIST_MAX, LIST_MAX_OHMS, LIST_MIN_OHMS, MAX_LIST_NAME, MINUS,
  Network, PartSpec, SERIES, SeriesId, SuggestOptions, Suggestions, TECHNOLOGIES, TechnologyId, chipSize, circuitDef, circuitProblem, formatAmount,
  formatError, formatPct, formatRkm, formatTolerance, listFromLink, listToLink, networkFormula, readAmount, readValue, technology,
} from '../../lib/resistor';

export interface Design {
  circuit: CircuitId;
  // What was typed, by `${circuit}.${field}` (the field is an input of the circuit or `target`); a field that is
  // not here has the circuit's starting text.
  texts: Record<string, string>;
  // The allowed deviation of the output, ± percent, as typed.
  allowed: string;
  // The parts: a technology whose usual tolerance and TCR fill the two fields, which can then be changed.
  tech: TechnologyId;
  tol: string;
  tcr: string;
  // °C, in rising order.
  temps: number[];
  drift: DriftModel;
  // With parts that track: how far apart their TCRs can be, in ppm/K, as typed.
  spread: string;
  // The values to choose from: a series (null follows the tolerance) over a range (null: the usual one for the
  // circuit), or a list of the visitor's own. `listId` is that list in this browser and is not in the link.
  series: SeriesId | null;
  min: number | null;
  max: number | null;
  list: { name: string; values: number[] } | null;
  listId: string | null;
  // One resistance: the largest number of resistors in it (1 to 3). Two resistances: the values in each (1 or 2).
  maxParts: number;
  legParts: number;
  // Two resistances: the limits of their sum in ohms, and of the current the circuit draws as typed (empty: none).
  totalMin: number;
  totalMax: number;
  currentMin: string;
  currentMax: string;
  // The chip size the power is checked against, by its imperial name.
  chip: string;
}

export const DEFAULT_DESIGN: Design = {
  circuit: 'single-current', texts: {}, allowed: '5', tech: 'thick-film', tol: '1', tcr: '100', temps: DESIGN_TEMPERATURES, drift: 'independent',
  spread: '', series: null, min: null, max: null, list: null, listId: null, maxParts: 2, legParts: 1, totalMin: 1e3, totalMax: 1e6,
  currentMin: '', currentMax: '', chip: '0603',
};

// How many candidates the engine keeps for each number of parts.
export const DESIGN_KEEP = 20;
// Two values in each resistance are offered up to this many values (E24∪E96 over seven decades has about 800): with
// more, the comparison of all pairs of legs takes a second and longer.
export const PAIR_LEG_LIMIT = 900;
export const MAX_TEMPERATURES = 8;
export const TEMPERATURE_LIMITS = [-65, 300];

export const FAMILIES: { id: CircuitFamily; label: string; title: string; circuits: CircuitId[] }[] = [
  { id: 'single', label: 'Resistor', title: 'A single resistance: for a current from a voltage, or for a voltage from a current', circuits: ['single-current', 'single-voltage'] },
  { id: 'divider', label: 'Divider', title: 'A voltage divider, with an optional load', circuits: ['divider'] },
  { id: 'ratio', label: 'Ratio', title: 'Two resistors that set a ratio: the feedback of a regulator, the gain of an amplifier', circuits: ['feedback', 'noninverting', 'inverting'] },
  { id: 'shunt', label: 'Shunt', title: 'A current-sense shunt', circuits: ['shunt'] },
];

export const VARIANTS: Record<CircuitId, string> = {
  'single-current': 'For a current', 'single-voltage': 'For a voltage', divider: 'Voltage divider', feedback: 'Feedback',
  noninverting: 'Non-inverting', inverting: 'Inverting', shunt: 'Current-sense shunt',
};

// The texts a circuit starts with.
const INITIAL: Record<string, string> = {
  'single-current.volts': '5', 'single-current.target': '10m',
  'single-voltage.amps': '1m', 'single-voltage.target': '2.5',
  'divider.vin': '12', 'divider.target': '3.3',
  'feedback.vref': '0.8', 'feedback.target': '3.3',
  'noninverting.target': '11', 'inverting.target': '-10',
  'shunt.amps': '5', 'shunt.target': '50m',
};

export interface Field {
  id: string;
  label: string;
  unit: string;
  optional: boolean;
  hint: string;
  placeholder: string;
}

const LABELS: Record<string, [string, string, string]> = {
  volts: ['Supply', 'across the resistor and the drop', 'e.g. 5'],
  drop: ['Drop in series', 'optional: an LED, a diode, a transistor', 'e.g. 2.1'],
  amps: ['Current', 'through the resistor', 'e.g. 10m'],
  vin: ['Input', 'across the divider', 'e.g. 12'],
  load: ['Load', 'optional: a resistance across R2', 'e.g. 100k'],
  vref: ['Reference', 'what the regulator holds across R2', 'e.g. 0.8'],
  ifb: ['Pin current', 'optional: positive when it flows through R1', 'e.g. 50n'],
};

const TARGETS: Record<CircuitId, string> = {
  'single-current': 'the current wanted', 'single-voltage': 'the voltage wanted across the resistor', divider: 'the output voltage wanted',
  feedback: 'the output voltage wanted', noninverting: 'the gain wanted, above 1', inverting: 'the gain wanted, negative',
  shunt: 'the sense voltage at that current',
};

// The fields of a circuit: its inputs, then the target.
export function designFields(id: CircuitId): { inputs: Field[]; target: Field } {
  const def = circuitDef(id);
  const gain = id === 'noninverting' || id === 'inverting';
  const inputs = def.inputs.map((input) => {
    const [label, hint, placeholder] = LABELS[input.id];
    if (input.id === 'vin' && gain) return { id: input.id, label: 'Signal', unit: 'V', optional: true, hint: 'optional: for the current and power in the parts', placeholder: 'e.g. 100m' };
    if (input.id === 'amps' && id === 'shunt') return { id: input.id, label, unit: 'A', optional: false, hint: 'the current to measure', placeholder: 'e.g. 5' };
    return { id: input.id, label, unit: input.unit, optional: input.optional, hint, placeholder: input.optional ? placeholder : '' };
  });
  return { inputs, target: { id: 'target', label: 'Target', unit: def.output.unit, optional: false, hint: TARGETS[id], placeholder: '' } };
}

export function fieldText(design: Design, id: string, circuit: CircuitId = design.circuit): string {
  return design.texts[`${circuit}.${id}`] ?? INITIAL[`${circuit}.${id}`] ?? '';
}

export const isTwoLegs = (id: CircuitId) => circuitDef(id).legs.length === 2;

// The range of a series when none is chosen: a shunt is milliohms.
export function designRange(design: Design): [number, number] {
  const usual: [number, number] = design.circuit === 'shunt' ? [0.001, 1] : [LIST_MIN_OHMS, LIST_MAX_OHMS];
  return [design.min ?? usual[0], design.max ?? usual[1]];
}

// --- From the fields to the engine ---------------------------------------------------------------------------

export interface ParsedDesign {
  circuit: Circuit;
  target: number;
  spec: PartSpec;
  allowedPct: number;
  trackingPpm: number;
  current: { min?: number; max?: number };
  // Why a field cannot be used, by its id (`target`, `allowed`, `tol`, `tcr`, `spread`, `currentMin`, `currentMax`).
  errors: Record<string, string>;
  // What to say in place of results: a field is missing, or the circuit cannot give the target.
  problem: string | null;
}

export function parseDesign(design: Design): ParsedDesign {
  const { inputs } = designFields(design.circuit);
  const errors: Record<string, string> = {};
  const values: Record<string, number> = {};
  for (const field of inputs) {
    const text = fieldText(design, field.id).trim();
    if (!text) {
      if (!field.optional) errors[field.id] = 'needed';
      continue;
    }
    const value = field.unit === 'Ω' ? readValue(text) : readAmount(text);
    if (value === null) errors[field.id] = 'not a number';
    else if (!field.optional && value === 0) errors[field.id] = 'not zero';
    else if (field.id === 'drop' && value < 0) errors[field.id] = 'not negative';
    else values[field.id] = value;
  }
  const number = (id: string, text: string, min: number, max: number, empty?: number): number => {
    if (!text.trim() && empty !== undefined) return empty;
    const value = readAmount(text);
    if (value === null) errors[id] = text.trim() ? 'not a number' : 'needed';
    else if (value < min || value > max) errors[id] = value < min ? (min > 0 ? 'too small' : 'not negative') : 'too large';
    return value ?? NaN;
  };
  const target = readAmount(fieldText(design, 'target'));
  if (target === null) errors.target = fieldText(design, 'target').trim() ? 'not a number' : 'needed';
  else if (target === 0) errors.target = 'not zero';
  const allowedPct = number('allowed', design.allowed, 1e-6, 100);
  const spec = { tolerancePct: number('tol', design.tol, 0, 50), tcrPpm: number('tcr', design.tcr, 0, 20000) };
  const trackingPpm = number('spread', design.spread, 0, 20000, 0);
  const current: { min?: number; max?: number } = {};
  if (design.currentMin.trim()) current.min = number('currentMin', design.currentMin, 1e-12, 1e3);
  if (design.currentMax.trim()) current.max = number('currentMax', design.currentMax, 1e-12, 1e3);
  if (current.min >= current.max) errors.currentMax = 'below the smallest';
  const circuit: Circuit = { id: design.circuit, inputs: values };
  const problem = Object.keys(errors).length ? 'Fill in the marked fields: the suggestions appear as soon as every number can be read.' : circuitProblem(circuit, target);
  return { circuit, target: target ?? NaN, spec, allowedPct, trackingPpm, current, errors, problem };
}

// The options of `suggestParts` for a design; `count` is the number of values to choose from.
export function designOptions(design: Design, parsed: ParsedDesign, count: number): SuggestOptions {
  const options: SuggestOptions = {
    spec: parsed.spec, temperatures: design.temps, drift: design.drift, trackingPpm: design.drift === 'tracking' ? parsed.trackingPpm : 0,
    allowedPct: parsed.allowedPct, chipSize: design.chip, keep: DESIGN_KEEP,
  };
  if (isTwoLegs(design.circuit)) {
    options.legParts = design.legParts === 2 && count <= PAIR_LEG_LIMIT ? 2 : 1;
    options.ranges = { total: { min: design.totalMin, max: design.totalMax } };
    if (parsed.current.min !== undefined || parsed.current.max !== undefined) options.ranges.current = parsed.current;
  } else {
    options.maxParts = design.maxParts;
  }
  return options;
}

// The technology whose usual range has this tolerance and TCR: the current one when it has, else the first.
export function technologyFor(spec: PartSpec, current: TechnologyId): TechnologyId {
  const fits = (id: TechnologyId) => {
    const t = technology(id);
    return spec.tolerancePct >= t.tolerances[0] && spec.tolerancePct <= t.tolerances[1] && spec.tcrPpm >= t.tcrs[0] && spec.tcrPpm <= t.tcrs[1];
  };
  return fits(current) ? current : TECHNOLOGIES.find((t) => fits(t.id))?.id ?? current;
}

// --- In words ------------------------------------------------------------------------------------------------

export const temperatureText = (t: number) => `${t < 0 ? MINUS : ''}${Math.abs(t)} °C`;

// "from −40 to 125 °C", "at 25 °C"
export function temperaturesText(temps: number[]): string {
  const low = Math.min(...temps);
  const high = Math.max(...temps);
  return low === high ? `at ${temperatureText(low)}` : `from ${low < 0 ? MINUS : ''}${Math.abs(low)} to ${temperatureText(high)}`;
}

export const specText = (spec: PartSpec) => `${formatTolerance(spec.tolerancePct)}, ${formatPct(spec.tcrPpm).replace(' %', '')} ppm/K`;
// A signed error; one within 1e-9 % (the rounding of the arithmetic) is none, as in the engine's ranking.
export const errorText = (pct: number) => formatError(Math.abs(pct) < 1e-9 ? 0 : pct);
export const spanText = (minPct: number, maxPct: number) => `${errorText(minPct)} to ${errorText(maxPct)}`;
export const outputText = (id: CircuitId, value: number, digits = 4) => formatAmount(value, circuitDef(id).output.unit, digits);
export const legFormula = (leg: Network) => networkFormula(leg);

// "499 Ω", "12 kΩ over 4.7 kΩ" (a divider: R1 over R2), "R1 = 31.6 kΩ, R2 = 10 kΩ"
export function legsText(id: CircuitId, legs: Network[]): string {
  if (legs.length === 1) return networkFormula(legs[0]);
  const [a, b] = legs.map((leg) => (leg.kind === 'r' ? networkFormula(leg) : `(${networkFormula(leg)})`));
  return id === 'divider' ? `${a} over ${b}` : `R1 = ${a}, R2 = ${b}`;
}

// A candidate as text, for the clipboard.
export function candidateText(id: CircuitId, c: Candidate, allowedPct: number, temps: number[]): string {
  const where = c.passes ? `within ±${formatPct(allowedPct)}` : `outside ±${formatPct(allowedPct)}`;
  return `${legsText(id, c.legs)}: ${outputText(id, c.output)} (${errorText(c.errorPct)}), worst case ${spanText(c.minPct, c.maxPct)} ${temperaturesText(temps)}, ${where}`;
}

export interface Answer {
  // 'pass': the first candidate stays inside; 'fail': nothing does; 'none': there is nothing to show.
  kind: 'pass' | 'fail' | 'none';
  text: string;
  // The parts that would make the closest candidate pass.
  apply?: PartSpec;
}

// The sentence at the top of the results. `source` names the values ("E96, 1 Ω to 10 MΩ").
// A sentence in which numbers stay with their units and brackets when it wraps: "2.5 V", "(0 %)", "125 °C".
export function unbroken(text: string): string {
  return text.replace(/(\d) (?=(?:%|°C|ppm\/K|[pnµmkMG]?[ΩVAW])(?![A-Za-z]))/g, '$1\u00A0').replace(/(±[\d.]+) (?=%)/g, '$1\u00A0');
}

export function answerText(id: CircuitId, result: Suggestions, options: SuggestOptions, source: string): Answer {
  const allowed = `±${formatPct(options.allowedPct)}`;
  const over = temperaturesText(options.temperatures);
  const first = result.candidates[0];
  if (!first) return { kind: 'none', text: result.note ?? 'No values within the limits come near the target.' };
  if (first.passes) {
    return {
      kind: 'pass',
      text: `${legsText(id, first.legs)} stays within ${allowed} ${over}: ${outputText(id, first.output)} nominal (${errorText(first.errorPct)}), worst case ${spanText(first.minPct, first.maxPct)}.`,
    };
  }
  const start = `Nothing from ${source} at ${specText(options.spec)} stays within ${allowed} ${over}`;
  const needed = result.needed;
  if (!needed) return { kind: 'fail', text: `${start}.` };
  const closest = `the closest, ${legsText(id, needed.candidate.legs)}`;
  if (needed.why === 'tighter') return { kind: 'fail', text: `${start}: ${closest}, needs about ${specText(needed.spec)}.`, apply: needed.spec };
  if (needed.why === 'nominal') {
    const more = isTwoLegs(id)
      ? (options.legParts === 2 ? 'Use a finer series or wider limits.' : 'Allow two values in each resistance, or use a finer series.')
      : 'Allow more resistors, or use a finer series.';
    return { kind: 'fail', text: `${start}: ${closest}, is ${errorText(needed.candidate.errorPct)} off before any tolerance, so no parts help. ${more}` };
  }
  if (needed.why === 'fixed') return { kind: 'fail', text: `${start}: the tracking spread alone takes ${closest}, outside.` };
  return { kind: 'fail', text: `${start}: ${closest}, would need parts tighter than ±0.005 % and 1 ppm/K.` };
}

// --- The link ------------------------------------------------------------------------------------------------

const CIRCUIT_PARAM: Record<CircuitId, string> = {
  'single-current': 'i', 'single-voltage': 'v', divider: 'div', feedback: 'fb', noninverting: 'ni', inverting: 'inv', shunt: 'sh',
};
const INPUT_PARAM: Record<string, string> = { volts: 'dv', vin: 'dv', vref: 'dv', amps: 'da', drop: 'dd', load: 'dl', ifb: 'df', target: 'dt' };
const seriesParam = (id: SeriesId) => id.toLowerCase().replace('+', '');
const sameTemps = (a: number[], b: number[]) => a.length === b.length && a.every((t, i) => t === b[i]);

export function cleanTemperatures(temps: number[]): number[] {
  const usable = temps.filter((t) => Number.isFinite(t) && t >= TEMPERATURE_LIMITS[0] && t <= TEMPERATURE_LIMITS[1]).map((t) => Math.round(t * 10) / 10);
  return [...new Set(usable)].sort((a, b) => a - b).slice(0, MAX_TEMPERATURES);
}

// dc circuit (i, v, div, fb, ni, inv, sh), dt target and dv, da, dd, dl, df inputs as typed, dp allowed deviation,
// dk technology with dtol and dtcr when they are not its usual ones, dtemp temperatures (-40_25_85_125), dm=t parts
// track with dts their spread, ds series, dr range (1R-10M), dvl the list's values with dvn its name, dn resistors in
// one resistance, dg=2 two values in each of two, dtr limits of R1 + R2 (1k-1M), dcr of the current (10u-1m, an end
// may be empty), dz chip size.
export function designFromParams(params: URLSearchParams): Design {
  const design: Design = { ...DEFAULT_DESIGN, texts: {} };
  const circuit = (Object.keys(CIRCUIT_PARAM) as CircuitId[]).find((id) => CIRCUIT_PARAM[id] === params.get('dc'));
  if (circuit) design.circuit = circuit;
  const fields = designFields(design.circuit);
  for (const field of [...fields.inputs, fields.target]) {
    const name = INPUT_PARAM[field.id];
    if (params.has(name)) design.texts[`${design.circuit}.${field.id}`] = params.get(name).slice(0, 24);
  }
  if (params.get('dp')) design.allowed = params.get('dp').slice(0, 12);
  const tech = technology(params.get('dk') ?? '');
  if (tech) {
    design.tech = tech.id;
    design.tol = String(tech.tolerancePct);
    design.tcr = String(tech.tcrPpm);
  }
  if (params.get('dtol')) design.tol = params.get('dtol').slice(0, 12);
  if (params.get('dtcr')) design.tcr = params.get('dtcr').slice(0, 12);
  if (params.get('dtemp')) {
    const temps = cleanTemperatures(params.get('dtemp').split('_').map(Number));
    if (temps.length) design.temps = temps;
  }
  if (params.get('dm') === 't') design.drift = 'tracking';
  if (params.get('dts')) design.spread = params.get('dts').slice(0, 12);
  const chosen = SERIES.find((s) => seriesParam(s.id) === params.get('ds'));
  if (chosen) design.series = chosen.id;
  const [min, max] = (params.get('dr') ?? '').split('-').map((part) => readValue(part));
  if (min && max && min < max) {
    design.min = min;
    design.max = max;
  }
  if (params.has('dvl')) design.list = { name: (params.get('dvn') ?? '').slice(0, MAX_LIST_NAME) || 'Shared list', values: listFromLink(params.get('dvl')) };
  const parts = Number(params.get('dn'));
  if (parts >= 1 && parts <= 3 && Number.isInteger(parts)) design.maxParts = parts;
  if (params.get('dg') === '2') design.legParts = 2;
  const [low, high] = (params.get('dtr') ?? '').split('-').map((part) => readValue(part));
  if (low && high && low < high) {
    design.totalMin = low;
    design.totalMax = high;
  }
  if (params.has('dcr')) [design.currentMin = '', design.currentMax = ''] = params.get('dcr').split('-').map((part) => part.slice(0, 12));
  if (chipSize(params.get('dz') ?? '')) design.chip = params.get('dz');
  return design;
}

export function designToParams(design: Design, params: URLSearchParams): void {
  if (design.circuit !== DEFAULT_DESIGN.circuit) params.set('dc', CIRCUIT_PARAM[design.circuit]);
  const fields = designFields(design.circuit);
  for (const field of [...fields.inputs, fields.target]) {
    const key = `${design.circuit}.${field.id}`;
    const text = design.texts[key];
    if (text !== undefined && text.trim() !== (INITIAL[key] ?? '')) params.set(INPUT_PARAM[field.id], text.trim());
  }
  if (design.allowed.trim() !== DEFAULT_DESIGN.allowed) params.set('dp', design.allowed.trim());
  const tech = technology(design.tech);
  if (design.tech !== DEFAULT_DESIGN.tech) params.set('dk', design.tech);
  if (design.tol.trim() !== String(tech.tolerancePct)) params.set('dtol', design.tol.trim());
  if (design.tcr.trim() !== String(tech.tcrPpm)) params.set('dtcr', design.tcr.trim());
  if (!sameTemps(design.temps, DESIGN_TEMPERATURES)) params.set('dtemp', design.temps.join('_'));
  if (design.drift === 'tracking') {
    params.set('dm', 't');
    if (design.spread.trim()) params.set('dts', design.spread.trim());
  }
  if (design.list && design.list.values.length <= LINK_LIST_MAX) {
    params.set('dvl', listToLink(design.list.values));
    params.set('dvn', design.list.name);
  }
  if (design.series) params.set('ds', seriesParam(design.series));
  if (design.min !== null && design.max !== null) params.set('dr', `${formatRkm(design.min, 9)}-${formatRkm(design.max, 9)}`);
  if (isTwoLegs(design.circuit)) {
    if (design.legParts === 2) params.set('dg', '2');
    if (design.totalMin !== DEFAULT_DESIGN.totalMin || design.totalMax !== DEFAULT_DESIGN.totalMax) params.set('dtr', `${formatRkm(design.totalMin, 9)}-${formatRkm(design.totalMax, 9)}`);
    if (design.currentMin.trim() || design.currentMax.trim()) params.set('dcr', `${design.currentMin.trim()}-${design.currentMax.trim()}`);
  } else if (design.maxParts !== DEFAULT_DESIGN.maxParts) params.set('dn', String(design.maxParts));
  if (design.chip !== DEFAULT_DESIGN.chip) params.set('dz', design.chip);
}
