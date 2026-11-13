// The Smith chart's project file (step M8.2, docs/smith-chart/notes-M8.2.md): versioned JSON with the circuit, what
// the solver is asked (unknowns and goal), the sweep (band, markers, limit, plot), the visitor's value lists (plan.md
// D17) and the export settings (the figure's options of M8.1a, the CSV's digits and form, the Touchstone format).
//
// Versions:
// - 0: a Smith chart link: the whole URL or the query after "?", as plain text, as a JSON string, or as a JSON object
//   `{ "link": … }` (with `"version": 0` or none). What a visitor could keep before project files existed.
// - 1 (PROJECT_VERSION): the JSON written by `projectJson`.
// A newer version is refused with a plain message; an older one is migrated (0: its link is read).
//
// Reading never throws. A version-1 file is turned into the link's parameters and read by state.ts `decodeCircuit`,
// so a project and a link take the same values and say the same things about what they leave out; every value that
// cannot be used takes its start value and comes back as an issue. Numbers are JSON numbers with JavaScript's
// shortest round-trip digits, so every double comes back to the bit; ∞ is written "inf" (JSON has no infinity), and a
// number may also be given as text the link reads ("2.4G", "4n7"). Framework-free.

import { DEFAULT_PT, DETAIL_NAMES, DETAIL_PRESETS, MAX_WIDTH, MIN_PT, MIN_WIDTH, SIZE_PRESETS } from '../figure';
import type { Detail, DetailPreset, Density, FigureOptions, GridKind } from '../figure';
import { COLOUR_MODES } from '../figureStyle';
import type { ColourMode } from '../figureStyle';
import { SITE } from '../figureTikz';
import type { GridWindow } from '../grid';
import { LINE, STUB_OPEN, STUB_SHORT } from '../parts';
import { KIND_CODES, LISTS_PARAM, decodeCircuit, encodeCircuit, numText, sweepParams } from '../state';
import type { Circuit, Goal, SweepSetting, Unknown } from '../state';
import { LIST_IDS, VALUE_KINDS, choiceFromText, choiceToText, defaultChoice } from '../values';
import type { ListId, ValueChoice, ValueList } from '../values';
import { LINK_LIST_MAX } from '../../resistor/lists';
import { cleanValues } from '../../resistor/values';
import { CSV_DIGITS_MAX, NUMBER_FORMS } from './csv';
import type { NumberForm } from './csv';
import { TOUCHSTONE_FORMATS } from './touchstone';
import type { TouchstoneFormat } from './touchstone';

export const PROJECT_FORMAT = 'smith-chart-project';
export const PROJECT_VERSION = 1;
/** The file name's extension the page offers (the content is JSON). */
export const PROJECT_EXTENSION = '.smith.json';
/** A project is a few kB (five lists of LINK_LIST_MAX values are about 60 kB); larger files are refused unread. */
export const PROJECT_MAX_BYTES = 1 << 20;
/** The largest text size the export takes (pt). */
export const MAX_PT = 24;

/** What the Export section is set to: the figure's options (figure.ts), the CSV's numbers, the Touchstone format. */
export interface ExportSettings {
  /** Width in mm (the assumed width when `linewidth`). */
  width: number;
  linewidth: boolean;
  /** A window in Γ (y up), null for the whole chart. */
  view: GridWindow | null;
  detail: DetailPreset | Detail;
  colour: ColourMode;
  fontPt: number;
  /** CSV significant digits, 0 every digit. */
  digits: number;
  form: NumberForm;
  touchstone: TouchstoneFormat;
}

export function defaultExportSettings(): ExportSettings {
  return {
    width: SIZE_PRESETS.column, linewidth: false, view: null, detail: 'standard', colour: 'colour', fontPt: DEFAULT_PT,
    digits: 0, form: 'plain', touchstone: 'RI',
  };
}

/** The figure's options (buildFigure) of the settings. */
export const figureOptions = (e: ExportSettings): FigureOptions => ({
  width: e.width, linewidth: e.linewidth, view: e.view, detail: e.detail, colour: e.colour, fontPt: e.fontPt,
});

/** Everything a project holds. */
export interface Project {
  /** The circuit with its ask (unknowns and goal). */
  circuit: Circuit;
  sweep: SweepSetting | null;
  lists: ValueChoice;
  exports: ExportSettings;
}

/** The project's link (the query after "?"): as the page writes it, the circuit, the value lists and the sweep. */
export function projectLink(p: Project): string {
  const vl = choiceToText(p.lists);
  // A '+' in a number's exponent would read back as a space.
  return `${encodeCircuit(p.circuit)}${vl ? `&${LISTS_PARAM}=${vl.replace(/\+/g, '%2B')}` : ''}${sweepParams(p.sweep)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Writing

/** A number for JSON: itself when finite, else "inf" / "-inf" (link text). */
const jnum = (v: number): number | string => (Number.isFinite(v) ? v : numText(v));
const hasZc = (kind: number): boolean => kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT;

function goalJson(g: Goal): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: g.kind };
  if (g.kind === 'point') {
    if (g.targetR !== undefined) { out.r = jnum(g.targetR); out.x = jnum(g.targetX ?? 0); }
  } else if (g.value !== undefined) out.value = jnum(g.value);
  if (g.within) out.within = true;
  if (g.node !== undefined) out.node = g.node;
  return out;
}

function unknownJson(u: Unknown): Record<string, unknown> {
  const param = u.param ?? 'value';
  if (param === 'f0') return { param: 'f0' };
  const out: Record<string, unknown> = { part: u.part + 1, param };
  if (u.free) out.free = true;
  return out;
}

function listJson(list: ValueList): Record<string, unknown> {
  return list.id === 'own' ? { id: 'own', values: cleanValues(list.values ?? []).slice(0, LINK_LIST_MAX) } : { id: list.id };
}

// JSON.stringify's two-space layout with every array or object that holds no other one on a single line (parts,
// markers, lists), so a project reads well in an editor. Safe: no string written here holds a bracket or brace
// (the link's are percent-encoded).
const INNER = /[[{](?:\s*\n\s*)([^[\]{}]*?)\s*\n\s*([\]}])/g;
const compact = (json: string): string => json.replace(INNER, (m, body: string, close: string) =>
  `${m[0]}${m[0] === '{' ? ' ' : ''}${body.replace(/\s*\n\s*/g, ' ')}${close === '}' ? ' ' : ''}${close}`);

/** The project file's text (JSON, version PROJECT_VERSION). `date` is when it was saved (default now). */
export function projectJson(p: Project, date: Date = new Date()): string {
  const c = p.circuit, e = p.exports;
  const file: Record<string, unknown> = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    tool: SITE,
    saved: date.toISOString(),
    link: `${SITE}?${projectLink(p)}`,
    circuit: {
      z0: jnum(c.z0), f0: jnum(c.f0), load: { r: jnum(c.loadR), x: jnum(c.loadX) },
      parts: c.parts.map((q) => (hasZc(q.kind) ? { kind: KIND_CODES[q.kind], value: jnum(q.value), zc: jnum(q.zc) } : { kind: KIND_CODES[q.kind], value: jnum(q.value) })),
    },
  };
  if (c.ask) file.solve = { unknowns: c.ask.unknowns.map(unknownJson), goal: goalJson(c.ask.goal) };
  const s = p.sweep;
  file.sweep = s ? {
    start: jnum(s.band.start), stop: jnum(s.band.stop), points: s.band.points, log: s.band.log, markers: s.markers.map(jnum),
    ...(s.limit !== undefined ? { limit: jnum(s.limit) } : {}), plot: s.vswr ? 'vswr' : 'rl',
  } : null;
  const lists: Record<string, unknown> = {};
  for (const kind of VALUE_KINDS) lists[kind] = listJson(p.lists[kind]);
  file.lists = lists;
  file.export = {
    width: e.width, linewidth: e.linewidth, view: e.view ? { x0: e.view.x0, y0: e.view.y0, x1: e.view.x1, y1: e.view.y1 } : null,
    detail: typeof e.detail === 'string' ? e.detail : { ...e.detail }, colour: e.colour, fontPt: e.fontPt,
    digits: e.digits, form: e.form, touchstone: e.touchstone,
  };
  return `${compact(JSON.stringify(file, null, 2))}\n`;
}

// ---------------------------------------------------------------------------------------------------------------
// Reading

export interface Opened {
  /** The project; null when the file was refused (`message` says why). */
  project: Project | null;
  /** What could not be used and what was used instead; empty when the file was read as written. */
  issues: string[];
  /** The file's version (0 a link), null when it was refused before one was known. */
  version: number | null;
  /** Why the file was refused, '' when it was read. */
  message: string;
}

const refuse = (message: string, version: number | null = null): Opened => ({ project: null, issues: [], version, message });
const NOT_PROJECT = 'This file is not a Smith chart project or link.';
const quote = (s: string): string => `“${s.length > 40 ? `${s.slice(0, 40)}…` : s}”`;
const show = (v: unknown): string => {
  try { return quote(typeof v === 'string' ? v : String(JSON.stringify(v))); } catch { return '“?”'; }
};
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The project of a file's text (or of a link). Never throws. */
export function openProject(input: string): Opened {
  try {
    return openText(String(input ?? ''));
  } catch {
    // Nothing above should throw; a file that still manages to is refused rather than breaking the page.
    return refuse(NOT_PROJECT);
  }
}

function openText(raw: string): Opened {
  if (raw.length > PROJECT_MAX_BYTES) return refuse('This file is too large to be a Smith chart project (over 1 MB).');
  const text = raw.replace(/^﻿/, '').trim();
  if (!text) return refuse('The file is empty.');
  if (text[0] === '{' || text[0] === '[' || text[0] === '"') {
    let data: unknown;
    try { data = JSON.parse(text); } catch { return refuse(`${NOT_PROJECT} It is not valid JSON.`); }
    if (typeof data === 'string') return openLink(data);
    if (!isObject(data)) return refuse(NOT_PROJECT);
    const version = data.version;
    if (data.format !== undefined && data.format !== PROJECT_FORMAT) return refuse(NOT_PROJECT);
    if (version === undefined || version === 0) {
      if (typeof data.link === 'string') return openLink(data.link);
      return refuse(version === undefined ? NOT_PROJECT : 'This project of version 0 holds no link.', version === 0 ? 0 : null);
    }
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
      return refuse(`This file names an unknown version (${show(version)}); it cannot be read.`);
    }
    if (version > PROJECT_VERSION) {
      return refuse(`This project was saved by a newer version of the Smith chart (file version ${version}); this page reads versions up to ${PROJECT_VERSION}. Reload the page to get the newest version and open the file again.`, version);
    }
    // Future versions: migrate version n to n + 1 here, one step at a time, then read version 1… PROJECT_VERSION.
    return readV1(data);
  }
  return openLink(text);
}

/** Version 0: a link (a URL or its query), or the first line of a text that holds one. */
function openLink(raw: string): Opened {
  let line = raw.trim().split(/\r?\n/).find((l) => l.trim())?.trim() ?? '';
  const q = line.indexOf('?');
  if (q >= 0) line = line.slice(q + 1);
  const hash = line.indexOf('#');
  if (hash >= 0) line = line.slice(0, hash);
  if (!line.includes('=')) return refuse(NOT_PROJECT, 0);
  const read = decodeCircuit(line);
  if (!read.linked && !read.sweep && read.lists === null) return refuse(NOT_PROJECT, 0);
  const issues = read.issues.slice();
  if (read.lesson) issues.push('the link’s lesson (locks, hidden panels, text) is not kept in a project');
  if (read.challenge) issues.push('the link’s challenge is not kept in a project');
  const lists = choiceFromText(read.lists ?? '');
  return { project: { circuit: read.circuit, sweep: read.sweep, lists, exports: defaultExportSettings() }, issues, version: 0, message: '' };
}

const TOP = ['format', 'version', 'tool', 'saved', 'link', 'circuit', 'solve', 'sweep', 'lists', 'export'];

/** A number field as link text: a number's shortest digits, a text as it is (the link reads "inf", "2.4G"); '?' else. */
function numIn(v: unknown): string {
  if (typeof v === 'number') return numText(v);
  // Commas, colons and "@" separate the link's values; a text holding one cannot be a number.
  if (typeof v === 'string') return /[,:@]/.test(v) || !v.trim() ? '?' : v.trim();
  return '?';
}

function readV1(data: Record<string, unknown>): Opened {
  const issues: string[] = [];
  if (data.format === undefined) issues.push(`the file does not name its format (${PROJECT_FORMAT}); read as one`);
  for (const key of Object.keys(data)) if (!TOP.includes(key)) issues.push(`unknown field ${quote(key)} left out`);
  const params = new URLSearchParams();
  params.set('v', '1');

  // The circuit.
  const c = data.circuit;
  if (!isObject(c)) issues.push(c === undefined ? 'the file holds no circuit; the start circuit is used' : 'circuit is not an object; the start circuit is used');
  else {
    const field = (key: string, name: string, v: unknown): void => {
      if (v === undefined) issues.push(`circuit.${name} is missing; the start value is used`);
      else params.set(key, numIn(v));
    };
    field('z0', 'z0', c.z0);
    field('f0', 'f0', c.f0);
    const load = c.load;
    if (load === undefined) issues.push('circuit.load is missing; the start load is used');
    else if (!isObject(load)) params.set('zl', '?');
    else params.set('zl', `${numIn(load.r)}:${load.x === undefined ? '0' : numIn(load.x)}`);
    if (c.parts === undefined) issues.push('circuit.parts is missing; the start parts are used');
    else if (!Array.isArray(c.parts)) { issues.push('circuit.parts is not a list; no parts are used'); params.set('p', ''); }
    else {
      params.set('p', c.parts.map((q) => {
        if (!isObject(q)) return '?';
        const kind = typeof q.kind === 'string' && /^[a-z]{2}$/i.test(q.kind) ? q.kind : '?';
        return `${kind}:${numIn(q.value)}${q.zc !== undefined ? `:${numIn(q.zc)}` : ''}`;
      }).join(','));
    }
  }

  // The ask.
  const solve = data.solve;
  if (solve !== undefined && solve !== null) {
    if (!isObject(solve)) issues.push('solve is not an object; left out');
    else {
      if (solve.unknowns !== undefined) {
        if (!Array.isArray(solve.unknowns)) issues.push('solve.unknowns is not a list; left out');
        else {
          params.set('u', solve.unknowns.map((u) => {
            if (!isObject(u)) return '?';
            if (u.param === 'f0') return 'f0';
            const part = typeof u.part === 'number' && Number.isInteger(u.part) && u.part >= 1 && u.part <= 999 ? String(u.part) : '?';
            const param = u.param ?? 'value';
            return param === 'zc' ? `${part}zc` : param === 'value' ? `${part}${u.free === true ? 'lc' : ''}` : '?';
          }).join(','));
        }
      }
      const g = solve.goal;
      if (g !== undefined && g !== null) {
        if (!isObject(g) || typeof g.kind !== 'string' || !/^[a-z]+$/i.test(g.kind)) params.set('g', '?');
        else {
          let t = g.kind === 'point' ? 'pt' : g.kind;
          if (g.kind === 'point') { if (g.r !== undefined || g.x !== undefined) t += `:${numIn(g.r)}:${g.x === undefined ? '0' : numIn(g.x)}`; }
          else if (g.value !== undefined) t += `:${numIn(g.value)}`;
          if (g.within === true) t += ':within';
          if (g.node !== undefined) t += `@${typeof g.node === 'number' ? numText(g.node) : '?'}`;
          params.set('g', t);
        }
      }
    }
  }

  // The sweep.
  const s = data.sweep;
  if (s !== undefined && s !== null) {
    if (!isObject(s)) issues.push('sweep is not an object; no sweep is shown');
    else {
      const points = typeof s.points === 'number' ? String(s.points) : '?';
      params.set('sw', `${numIn(s.start)}:${numIn(s.stop)}:${points}${s.log === true ? ':log' : ''}`);
      if (s.markers !== undefined) {
        if (Array.isArray(s.markers)) { if (s.markers.length) params.set('mk', s.markers.map(numIn).join(',')); }
        else issues.push('sweep.markers is not a list; left out');
      }
      if (s.limit !== undefined) params.set('sl', numIn(s.limit));
      if (s.plot !== undefined) params.set('sp', typeof s.plot === 'string' ? s.plot : '?');
    }
  }

  const read = decodeCircuit(params.toString());
  issues.push(...read.issues);
  const lists = readLists(data.lists, issues);
  const exports = readExport(data.export, issues);
  return { project: { circuit: read.circuit, sweep: read.sweep, lists, exports }, issues, version: 1, message: '' };
}

function readLists(v: unknown, issues: string[]): ValueChoice {
  const choice = defaultChoice();
  if (v === undefined || v === null) return choice;
  if (!isObject(v)) { issues.push('lists is not an object; the default lists are used'); return choice; }
  for (const key of Object.keys(v)) {
    if (!(VALUE_KINDS as readonly string[]).includes(key)) { issues.push(`lists: unknown kind ${quote(key)} left out`); continue; }
    const kind = key as keyof ValueChoice, list = v[key];
    const id = isObject(list) ? list.id : list;
    if (typeof id !== 'string' || !LIST_IDS.includes(id as ListId)) {
      issues.push(`lists.${key} ${show(list)}: wants one of ${LIST_IDS.join(', ')}; the default is used`);
      continue;
    }
    if (id !== 'own') { choice[kind] = { id: id as ListId }; continue; }
    const raw = isObject(list) && Array.isArray(list.values) ? list.values : [];
    const values = cleanValues(raw.map((x) => (typeof x === 'number' ? x : NaN)));
    if (values.length < raw.length) issues.push(`lists.${key}: ${raw.length - values.length} values that are not positive numbers (or repeat) left out`);
    if (values.length > LINK_LIST_MAX) issues.push(`lists.${key}: more than ${LINK_LIST_MAX} values; the largest are left out`);
    if (!values.length) { issues.push(`lists.${key}: an own list with no values; the default is used`); continue; }
    choice[kind] = { id: 'own', values: values.slice(0, LINK_LIST_MAX) };
  }
  return choice;
}

const DETAIL_KEYS = Object.keys(DETAIL_PRESETS.standard) as (keyof Detail)[];
const DENSITIES: readonly Density[] = ['coarse', 'normal', 'fine'];
const GRIDS: readonly GridKind[] = ['z', 'y', 'zy'];

function readExport(v: unknown, issues: string[]): ExportSettings {
  const e = defaultExportSettings();
  if (v === undefined || v === null) return e;
  if (!isObject(v)) { issues.push('export is not an object; the default export settings are used'); return e; }
  const bad = (key: string, value: unknown, wants: string, used: unknown): void => {
    issues.push(`export.${key} ${show(value)}: ${wants}; ${String(used)} is used`);
  };
  for (const key of Object.keys(v)) {
    const x = v[key];
    switch (key) {
      case 'width':
        if (typeof x === 'number' && x >= MIN_WIDTH && x <= MAX_WIDTH) e.width = x;
        else bad(key, x, `wants a width from ${MIN_WIDTH} to ${MAX_WIDTH} mm`, e.width);
        break;
      case 'linewidth':
        if (typeof x === 'boolean') e.linewidth = x; else bad(key, x, 'wants true or false', e.linewidth);
        break;
      case 'view':
        if (x === null) break;
        if (isObject(x) && [x.x0, x.y0, x.x1, x.y1].every((n) => typeof n === 'number' && Number.isFinite(n))
          && (x.x0 as number) < (x.x1 as number) && (x.y0 as number) < (x.y1 as number)) {
          e.view = { x0: x.x0 as number, y0: x.y0 as number, x1: x.x1 as number, y1: x.y1 as number };
        } else bad(key, x, 'wants a window {x0, y0, x1, y1} in Γ with x0 < x1 and y0 < y1', 'the whole chart');
        break;
      case 'detail':
        e.detail = readDetail(x, issues);
        break;
      case 'colour':
        if (COLOUR_MODES.includes(x as ColourMode)) e.colour = x as ColourMode;
        else bad(key, x, `wants one of ${COLOUR_MODES.join(', ')}`, e.colour);
        break;
      case 'fontPt':
        if (typeof x === 'number' && x >= MIN_PT && x <= MAX_PT) e.fontPt = x;
        else bad(key, x, `wants a size from ${MIN_PT} to ${MAX_PT} pt`, e.fontPt);
        break;
      case 'digits':
        if (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= CSV_DIGITS_MAX) e.digits = x;
        else bad(key, x, `wants a whole number from 0 (every digit) to ${CSV_DIGITS_MAX}`, e.digits);
        break;
      case 'form':
        if (NUMBER_FORMS.includes(x as NumberForm)) e.form = x as NumberForm;
        else bad(key, x, `wants one of ${NUMBER_FORMS.join(', ')}`, e.form);
        break;
      case 'touchstone':
        if (TOUCHSTONE_FORMATS.includes(x as TouchstoneFormat)) e.touchstone = x as TouchstoneFormat;
        else bad(key, x, `wants one of ${TOUCHSTONE_FORMATS.join(', ')}`, e.touchstone);
        break;
      default:
        issues.push(`export: unknown setting ${quote(key)} left out`);
    }
  }
  return e;
}

/** A preset's name, or a detail object (items missing from it taken from its `preset`, default standard). */
function readDetail(x: unknown, issues: string[]): DetailPreset | Detail {
  if (typeof x === 'string') {
    if (DETAIL_NAMES.includes(x as DetailPreset)) return x as DetailPreset;
    issues.push(`export.detail ${quote(x)}: wants ${DETAIL_NAMES.join(', ')} or a list of items; standard is used`);
    return 'standard';
  }
  if (!isObject(x)) { issues.push(`export.detail ${show(x)}: wants a preset or a list of items; standard is used`); return 'standard'; }
  let preset: DetailPreset = 'standard';
  if (x.preset !== undefined) {
    if (DETAIL_NAMES.includes(x.preset as DetailPreset)) preset = x.preset as DetailPreset;
    else issues.push(`export.detail.preset ${show(x.preset)}: wants ${DETAIL_NAMES.join(', ')}; standard is used`);
  }
  const d: Detail = { ...DETAIL_PRESETS[preset] };
  for (const key of Object.keys(x)) {
    if (key === 'preset') continue;
    const value = x[key];
    if (!(DETAIL_KEYS as string[]).includes(key)) { issues.push(`export.detail: unknown item ${quote(key)} left out`); continue; }
    const k = key as keyof Detail;
    const fits = k === 'density' ? DENSITIES.includes(value as Density) : k === 'grid' ? GRIDS.includes(value as GridKind) : typeof value === 'boolean';
    if (fits) (d as unknown as Record<string, unknown>)[k] = value;
    else issues.push(`export.detail.${key} ${show(value)}: ${k === 'density' ? `wants ${DENSITIES.join(', ')}` : k === 'grid' ? `wants ${GRIDS.join(', ')}` : 'wants true or false'}; ${String(d[k])} is used`);
  }
  return d;
}
