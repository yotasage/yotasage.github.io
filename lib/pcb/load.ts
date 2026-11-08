// Turns the files the user opened into a board: ZIP archives are expanded (also nested ones), every file is
// recognised by its content (lib/pcb/detect.ts) and handed to its reader, and the layers are identified
// (lib/pcb/identify.ts). Gerber, drill, job and CSV files form one board; adding files adds to it.
import { unzipSync } from 'fflate';

import { detectFormat, Detected, isOdbPath } from './detect';
import { fitFormat, gerberDrillItems } from './drill';
import { describeFormat, DrillFormat, DrillProgram, formatComplete, formatKey, platedFromName, plotExcellon, PlottedDrill, readExcellon } from './excellon';
import { GerberJob, parseGerberJob } from './gbrjob';
import { parseGerber, ParsedGerber } from './gerber/parse';
import { Identity, identifyLayers, LayerOverride } from './identify';
import { Board, BoardObject, Layer, Stackup } from './model';
import { boardShape } from './outline';

export interface SourceFile {
  // Where the file came from, e.g. "gerbers/F_Cu.gtl" or "gerbers_v2.zip/F_Cu.gtl".
  path: string;
  name: string;
  size: number;
  bytes: Uint8Array;
}

export interface LoadedFile {
  source: SourceFile;
  detected: Detected;
  // An error while reading a file of a supported format.
  error?: string;
  warnings: string[];
  gerber?: ParsedGerber;
  job?: GerberJob;
  // An Excellon drill file, read but not yet plotted: buildBoard plots it with its format.
  drill?: DrillProgram;
  // The format the drill file was last plotted with, and where it came from (set by buildBoard).
  drillState?: DrillState;
  // How far the object indices of this file's items are shifted into Board.objects (see buildBoard).
  objectOffset: number;
}

export interface DrillState {
  format: DrillFormat;
  // The file states it, it was guessed, or the user chose it.
  from: 'file' | 'guess' | 'user';
  // With a guess: the share of holes that land on pads, vias or track ends (undefined without copper layers).
  onPads?: number;
  holes: number;
  // Cache: the plot for this format, and the guess for this set of copper layers.
  plot: PlottedDrill;
  plotKey: string;
  guessKey?: string;
  guess?: { format: DrillFormat; onPads?: number };
}

// How deep ZIP archives inside ZIP archives are opened.
const MAX_DEPTH = 4;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Files of operating systems and version control that are never boards.
function isClutter(path: string): boolean {
  return /(^|\/)(__MACOSX|\.git|\.svn)\//.test(path) || /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i.test(path) || /(^|\/)\._/.test(path);
}

async function expand(source: SourceFile, depth: number, out: LoadedFile[], onStatus: (text: string) => void) {
  const detected = detectFormat(source.name, source.bytes);
  if (detected.id !== 'zip') {
    out.push({ source, detected, warnings: [], objectOffset: 0 });
    return;
  }
  if (depth >= MAX_DEPTH) {
    out.push({ source, detected: { ...detected, status: 'ignored', message: 'Too many archives inside each other; not opened.' }, warnings: [], objectOffset: 0 });
    return;
  }
  onStatus(`Opening ${source.name}…`);
  await yieldToBrowser();
  let entries: Record<string, Uint8Array>;
  try {
    // The names first, without unpacking anything: Office documents (.docx, .xlsx) are ZIP archives too.
    const names: string[] = [];
    unzipSync(source.bytes, { filter: (f) => { names.push(f.name); return false; } });
    if (names.includes('[Content_Types].xml')) {
      out.push({ source: { ...source, bytes: new Uint8Array(0) }, detected: { id: 'binary', name: 'Office document', status: 'ignored', message: 'Not a board or layer file; ignored.' }, warnings: [], objectOffset: 0 });
      return;
    }
    entries = unzipSync(source.bytes);
  } catch (e) {
    out.push({ source, detected, error: `The archive could not be opened: ${errorText(e)}`, warnings: [], objectOffset: 0 });
    return;
  }
  const paths = Object.keys(entries).filter((p) => !p.endsWith('/') && !isClutter(p));
  if (paths.some(isOdbPath)) {
    out.push({
      source,
      detected: { id: 'odb', name: 'ODB++ (in a ZIP archive)', status: 'unsupported', message: 'ODB++ cannot be read: writing software for it needs membership of Siemens\' ODB++ Solutions Alliance. Export Gerber files instead.' },
      warnings: [],
      objectOffset: 0,
    });
    return;
  }
  out.push({ source: { ...source, bytes: new Uint8Array(0) }, detected, warnings: [], objectOffset: 0 });
  for (const p of paths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const bytes = entries[p];
    await expand({ path: `${source.path}/${p}`, name: baseName(p), size: bytes.length, bytes }, depth + 1, out, onStatus);
  }
}

// A file the user opened, with its path inside a folder that was opened or dropped.
export interface PickedFile {
  file: File;
  path: string;
}

// Reads the files a user opened: expands archives, recognises every file and reads the Gerber and job files.
// `known` are paths already open, which are not read again.
export async function readFiles(files: PickedFile[], known: Set<string>, onStatus: (text: string) => void): Promise<LoadedFile[]> {
  const out: LoadedFile[] = [];
  for (const { file, path } of files) {
    if (isClutter(path)) continue;
    onStatus(`Reading ${file.name}…`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    await expand({ path, name: file.name, size: file.size, bytes }, 0, out, onStatus);
  }
  const result: LoadedFile[] = [];
  const toRead = out.filter((f) => f.detected.status === 'read' && !f.error);
  let done = 0;
  for (const f of out) {
    if (known.has(f.source.path)) continue;
    known.add(f.source.path);
    result.push(f);
    if (f.detected.status !== 'read' || f.error) {
      f.source.bytes = new Uint8Array(0);
      continue;
    }
    done += 1;
    onStatus(`Reading ${f.source.name} (${done} of ${toRead.length})…`);
    await yieldToBrowser();
    try {
      const text = new TextDecoder('utf-8').decode(f.source.bytes);
      if (f.detected.id === 'gerber') {
        f.gerber = parseGerber(text);
        f.warnings = f.gerber.warnings;
      } else if (f.detected.id === 'gerber-job') {
        f.job = parseGerberJob(text);
      } else if (f.detected.id === 'excellon') {
        f.drill = readExcellon(text);
        f.warnings = f.drill.warnings;
      }
    } catch (e) {
      f.error = `The file could not be read: ${errorText(e)}`;
    }
    // The text is not needed any more; the items are.
    f.source.bytes = new Uint8Array(0);
  }
  return result;
}

// The longest start that all names share, without a trailing separator ("2026_ARTIFICER_TC1-F_Cu.gtl" and
// "2026_ARTIFICER_TC1-B_Cu.gbl" give "2026_ARTIFICER_TC1").
function commonStart(names: string[]): string {
  if (!names.length) return '';
  let prefix = names[0];
  for (const n of names) {
    let i = 0;
    while (i < prefix.length && i < n.length && prefix[i].toLowerCase() === n[i].toLowerCase()) i += 1;
    prefix = prefix.slice(0, i);
  }
  return prefix.replace(/[-_. ]+$/, '');
}

function mergeStackup(jobs: GerberJob[]): Stackup | undefined {
  const s: Stackup = {};
  for (const j of jobs) Object.assign(s, j.stackup);
  return Object.keys(s).length ? s : undefined;
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

// Plots an Excellon file with the format the user chose, the file states, or the one that fits the copper best, and
// remembers the plot and the guess on the file, so that building the board again is quick.
function plotDrill(f: LoadedFile, user: DrillFormat | undefined, fitTo: Layer[]): DrillState {
  const p = f.drill;
  const old = f.drillState;
  const nameplated = platedFromName(f.source.name);
  let format: DrillFormat;
  let from: DrillState['from'];
  let guessKey = old?.guessKey;
  let guess = old?.guess;
  if (user) {
    format = user;
    from = 'user';
  } else if (formatComplete(p)) {
    format = fitFormat(p, []).format;
    from = 'file';
  } else {
    // Guessed again only when the copper layers change.
    const key = fitTo.map((l) => l.id).join('\n');
    if (!guess || guessKey !== key) {
      guess = fitFormat(p, fitTo);
      guessKey = key;
    }
    format = guess.format;
    from = 'guess';
  }
  const plotKey = `${formatKey(format)}|${nameplated}`;
  const plot = old?.plotKey === plotKey ? old.plot : plotExcellon(p, format, { plated: nameplated ?? true });
  return { format, from, onPads: from === 'guess' ? guess?.onPads : undefined, holes: plot.holes, plot, plotKey, guessKey, guess };
}

// Builds the board from every file read so far. Layer kinds, sides and order are found again each time, with the
// user's choices from the layer panel on top. `drillFormats` are formats the user chose for Excellon files.
export function buildBoard(files: LoadedFile[], overrides: Map<string, LayerOverride>, drillFormats: Map<string, DrillFormat> = new Map()): Board | null {
  const gerbers = files.filter((f) => f.gerber);
  const drills = files.filter((f) => f.drill);
  if (!gerbers.length && !drills.length) return null;
  const jobs = files.filter((f) => f.job).map((f) => f.job);
  const warnings: string[] = [];

  // All object attributes in one list; the items of each file are shifted to their place in it.
  const objects: BoardObject[] = [];
  for (const f of gerbers) {
    const offset = objects.length;
    if (f.objectOffset !== offset) {
      const delta = offset - f.objectOffset;
      for (const item of f.gerber.items) if (item.obj !== undefined) item.obj += delta;
      f.objectOffset = offset;
    }
    for (const o of f.gerber.objects) objects.push(o);
  }

  const gerberLayers: Layer[] = gerbers.map((f) => ({
    id: f.source.path,
    name: f.source.name,
    kind: 'other',
    side: 'none',
    file: f.source.path,
    attrs: f.gerber.attrs,
    items: f.gerber.items,
    apertures: f.gerber.apertures,
    bbox: f.gerber.bbox,
    ...(f.gerber.negative ? { negative: true } : {}),
  }));
  // The Gerber layers first, so that drill files without a format can be fitted to the copper.
  identifyLayers(gerberLayers, jobs, overrides);
  const copper = gerberLayers.filter((l) => l.kind === 'copper');
  const outer = copper.filter((l) => l.side === 'top' || l.side === 'bottom');

  const fixed = new Map<string, Identity>();
  const drillLayers: Layer[] = [];
  for (const f of drills) {
    const state = plotDrill(f, drillFormats.get(f.source.path), outer.length ? outer : copper);
    f.drillState = state;
    f.warnings = state.plot.warnings;
    const p = f.drill;
    // Plated, non-plated or both, from the holes (their tools, the file, its name).
    const kinds = new Set<boolean>();
    for (const item of state.plot.items) if (item.k === 'hole') kinds.add(item.plated);
    const mixed = kinds.size > 1;
    const plated = mixed ? undefined : kinds.size ? [...kinds][0] : p.plated ?? platedFromName(f.source.name) ?? true;
    const span = /^(?:Plated|NonPlated|MixedPlating),(\d+),(\d+)/i.exec(p.attrs['.FileFunction'] ?? '');
    fixed.set(f.source.path, {
      kind: 'drill',
      side: 'none',
      plated,
      mixed,
      label: span ? `L${span[1]}–L${span[2]}` : undefined,
      by: p.attrs['.FileFunction'] ? 'x2' : 'format',
    });
    drillLayers.push({
      id: f.source.path,
      name: f.source.name,
      kind: 'drill',
      side: 'none',
      file: f.source.path,
      attrs: p.attrs,
      items: state.plot.items,
      apertures: [],
      bbox: state.plot.bbox,
    });
    if (state.from === 'guess') {
      const fit = state.onPads === undefined ? 'there are no copper layers to check it against' : `${percent(state.onPads)} of the holes land on pads`;
      warnings.push(`${f.source.name} does not say its format, so it was guessed: ${describeFormat(state.format, p)} (${fit}). Its layer settings can change it.`);
    }
  }

  const layers = [...gerberLayers, ...drillLayers];
  identifyLayers(layers, jobs, overrides, fixed);
  // Gerber drill files hold their holes as flashes and slots as lines; they become holes like Excellon's.
  const fromGerber = new Set(gerbers.map((f) => f.source.path));
  for (const l of layers) if (l.kind === 'drill' && fromGerber.has(l.id)) l.items = gerberDrillItems(l, l.plated !== false);

  const shape = boardShape(layers);
  if (shape) warnings.push(...shape.warnings);

  const archive = files.find((f) => f.detected.id === 'zip');
  const named = gerbers.length ? gerbers : drills;
  const name = jobs.find((j) => j.name)?.name
    || commonStart(named.map((f) => f.source.name))
    || (archive ? archive.source.name.replace(/\.zip$/i, '') : '')
    || named[0].source.name;
  return {
    name,
    source: 'gerber',
    layers,
    ...(shape ? { outline: shape.contours, outlineFrom: shape.from } : {}),
    stackup: mergeStackup(jobs),
    objects,
    placements: [],
    warnings,
  };
}
