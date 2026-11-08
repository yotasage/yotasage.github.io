// Turns the files the user opened into a board: ZIP archives are expanded (also nested ones), every file is
// recognised by its content (lib/pcb/detect.ts) and handed to its reader, and the layers are identified
// (lib/pcb/identify.ts). Gerber, drill, job and CSV files form one board; adding files adds to it.
import { unzipSync } from 'fflate';

import { detectFormat, Detected, isOdbPath } from './detect';
import { GerberJob, parseGerberJob } from './gbrjob';
import { parseGerber, ParsedGerber } from './gerber/parse';
import { identifyLayers, LayerOverride } from './identify';
import { Board, BoardObject, Layer, Stackup } from './model';

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
  // How far the object indices of this file's items are shifted into Board.objects (see buildBoard).
  objectOffset: number;
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

// Builds the board from every file read so far. Layer kinds, sides and order are found again each time, with the
// user's choices from the layer panel on top.
export function buildBoard(files: LoadedFile[], overrides: Map<string, LayerOverride>): Board | null {
  const gerbers = files.filter((f) => f.gerber);
  if (!gerbers.length) return null;
  const jobs = files.filter((f) => f.job).map((f) => f.job);

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

  const layers: Layer[] = gerbers.map((f) => ({
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
  identifyLayers(layers, jobs, overrides);

  const archive = files.find((f) => f.detected.id === 'zip');
  const name = jobs.find((j) => j.name)?.name
    || commonStart(gerbers.map((f) => f.source.name))
    || (archive ? archive.source.name.replace(/\.zip$/i, '') : '')
    || gerbers[0].source.name;
  return { name, source: 'gerber', layers, stackup: mergeStackup(jobs), objects, placements: [], warnings: [] };
}
