// The KiCad board link of phase 1 (plan.md D9): the stackup from a .kicad_pcb's `(setup (stackup …))` block and the
// net classes from a .kicad_pro. Tokens of KiCad 6.0–10.0 (facts-fab.md §2), unknown ones ignored (and listed).
// Takes the file's text, never reads files itself; never throws: a file that cannot be read gives a reason.

import { SexprReader, child, head, isList, num, str } from '../pcb/kicad/sexpr';
import type { SExpr } from '../pcb/kicad/sexpr';
import { issue } from './stackup';
import type { CopperLayer, DielectricLayer, Issue, Layer, MaskLayer, Source, Stackup, Val } from './stackup';

// The first board file version with a stackup (6.0 development, "Add board physical stackup info in setup section").
export const FIRST_STACKUP_VERSION = 20190905;
// The newest version this reader was written against (KiCad 10.0) and the newest seen (11.0 development).
export const KICAD10_VERSION = 20260206;
export const NEWEST_KNOWN_VERSION = 20261031;

// KiCad's defaults (BOARD_STACKUP_ITEM, facts-fab.md §2.3): what stands in when the file leaves a number out.
export const KICAD_DEFAULT_MASK_ER = 3.3;
export const KICAD_DEFAULT_MASK_T = 0.01;
export const KICAD_DEFAULT_DIELECTRIC_ER = 4.5;

// Top-level items that come after `setup` in every version: reaching one means there is no setup.
const AFTER_SETUP = new Set(['net', 'footprint', 'module', 'segment', 'via', 'zone', 'gr_line', 'gr_text', 'arc', 'net_class', 'gr_rect', 'gr_poly', 'gr_arc', 'gr_circle', 'dimension', 'group']);

export interface KicadBoard {
  stackup: Stackup | null; // null when refused
  version: number; // the file's `(version …)`, 0 when not found
  generator: string;
  reason: string; // why the file was refused ('' when read)
  issues: Issue[];
  ignored: string[]; // tokens of the stackup this reader does not use (sorted, unique)
}

function refuse(version: number, generator: string, reason: string, issues: Issue[] = []): KicadBoard {
  return { stackup: null, version, generator, reason, issues, ignored: [] };
}

// KiCad's versions by board file version (facts-fab.md §2.1), for messages.
export function kicadRelease(version: number): string {
  if (version < 20171130) return 'KiCad 4 or older';
  if (version < FIRST_STACKUP_VERSION) return 'KiCad 5';
  if (version <= 20211014) return 'KiCad 6';
  if (version <= 20221018) return 'KiCad 7';
  if (version <= 20240108) return 'KiCad 8';
  if (version <= 20241229) return 'KiCad 9';
  if (version <= KICAD10_VERSION) return 'KiCad 10';
  return 'a KiCad newer than 10';
}

interface Sub {
  thickness: number;
  material: string;
  er: number;
  tand: number;
  freq: number;
}

function emptySub(): Sub {
  return { thickness: NaN, material: '', er: NaN, tand: NaN, freq: NaN };
}

// Reads the stackup of a .kicad_pcb from its text. Only the items up to `setup` are built; the rest of the file (the
// footprints, tracks and zones, megabytes on a real board) is never parsed.
export function readKicadStackup(text: string, file: string): KicadBoard {
  let version = 0;
  let generator = '';
  try {
    if (typeof text !== 'string' || !text.trim()) return refuse(0, '', 'The file is empty.');
    const r = new SexprReader(text);
    let rootHead: string;
    try {
      rootHead = r.openRoot();
    } catch {
      return refuse(0, '', 'This is not a KiCad board: it does not start with "(kicad_pcb".');
    }
    if (rootHead !== 'kicad_pcb') return refuse(0, '', `This is not a KiCad board: it starts with "(${rootHead}" instead of "(kicad_pcb".`);
    let boardThickness = NaN;
    let setup: SExpr[] | undefined;
    for (let item = r.next(); item !== undefined; item = r.next()) {
      const h = head(item);
      if (!h) continue;
      if (h === 'version') version = num((item as SExpr[])[1], 0);
      else if (h === 'generator') generator = str((item as SExpr[])[1]) ?? '';
      else if (h === 'general') boardThickness = num(child(item as SExpr[], 'thickness')?.[1]);
      else if (h === 'setup') { setup = item as SExpr[]; break; }
      else if (AFTER_SETUP.has(h)) break;
    }
    if (version > 0 && version < FIRST_STACKUP_VERSION) {
      return refuse(version, generator, `${kicadRelease(version)} board (file version ${version}): boards of KiCad 5 and older have no stackup. Open and save it in KiCad 6 or later, set up the stackup in Board Setup, then open it here.`);
    }
    if (!setup) return refuse(version, generator, 'The board has no setup section, so no stackup.');
    const block = child(setup, 'stackup');
    if (!block) return refuse(version, generator, 'The board has no stackup: KiCad writes one only once the physical stackup has been set in Board Setup → Board Stackup.');
    return readBlock(block, file, version, generator, boardThickness);
  } catch (e) {
    return refuse(version, generator, `The board cannot be read: ${e instanceof Error ? e.message : String(e)}.`);
  }
}

function readBlock(block: SExpr[], file: string, version: number, generator: string, boardThickness: number): KicadBoard {
  const issues: Issue[] = [];
  const ignored = new Set<string>();
  const inFile: Source = { kind: 'kicad', file, version };
  const absent: Source = { kind: 'kicad', file, version, absent: true };
  const val = (x: number, s: Source = inFile): Val => ({ v: x, tol: null, src: s });
  if (version > KICAD10_VERSION) issues.push(issue('note', 'version', file, `The board was saved by ${kicadRelease(version)} (file version ${version}); it is read as KiCad 10 writes it.`));
  const layers: Layer[] = [];
  let finish = '';
  let controlled = false;
  for (let i = 1; i < block.length; i += 1) {
    const item = block[i];
    if (!isList(item)) continue;
    const h = head(item);
    if (h === 'copper_finish') { finish = str(item[1]) ?? ''; continue; }
    if (h === 'dielectric_constraints') { controlled = item[1] === 'yes' || item[1] === 'true'; continue; }
    if (h !== 'layer') { if (h) ignored.add(h); continue; }
    const name = str(item[1]) ?? '';
    const type = (str(child(item, 'type')?.[1]) ?? '').toLowerCase();
    // The layer's own tokens and its sublayers (`addsublayer` starts the next one).
    const subs: Sub[] = [emptySub()];
    for (let k = 2; k < item.length; k += 1) {
      const c = item[k];
      const sub = subs[subs.length - 1];
      if (c === 'addsublayer') { subs.push(emptySub()); continue; }
      if (!isList(c)) continue;
      const ch = head(c);
      if (ch === 'thickness') sub.thickness = num(c[1]);
      else if (ch === 'material') sub.material = str(c[1]) ?? '';
      else if (ch === 'epsilon_r') sub.er = num(c[1]);
      else if (ch === 'loss_tangent') sub.tand = num(c[1]);
      else if (ch === 'spec_frequency') sub.freq = num(c[1]);
      else if (ch !== 'type' && ch !== 'color' && ch) ignored.add(ch);
    }
    const s0 = subs[0];
    if (type.includes('silk') || type.includes('paste')) continue;
    if (type.includes('solder mask')) {
      const hasEr = Number.isFinite(s0.er);
      const t = Number.isFinite(s0.thickness) ? val(s0.thickness) : val(KICAD_DEFAULT_MASK_T, absent);
      if (!Number.isFinite(s0.thickness)) issues.push(issue('warn', 'mask', name, `${name} has no thickness in the file; KiCad's default ${KICAD_DEFAULT_MASK_T} mm is used.`));
      if (!hasEr) issues.push(issue('warn', 'mask-er', name, `${name} has no εr in the file (KiCad writes one only for a mask with a material); KiCad's default ${KICAD_DEFAULT_MASK_ER} is used.`));
      const m: MaskLayer = {
        kind: 'mask', id: name, name, material: s0.material,
        er: hasEr ? val(s0.er) : val(KICAD_DEFAULT_MASK_ER, absent),
        tand: Number.isFinite(s0.tand) ? val(s0.tand) : null,
        freq: Number.isFinite(s0.freq) && s0.freq > 0 ? s0.freq : null,
        // KiCad stores one mask thickness: it stands for all three.
        onLaminate: t, onCopper: { ...t }, between: { ...t },
      };
      layers.push(m);
      continue;
    }
    if (type === 'copper') {
      const ok = Number.isFinite(s0.thickness) && s0.thickness > 0;
      if (!ok) issues.push(issue('error', 'copper', name, `${name} has no thickness in the file.`));
      const c: CopperLayer = {
        kind: 'copper', id: name, name, t: ok ? val(s0.thickness) : val(0.035, absent), base: null, plating: null, calc: null,
        etch: { kind: 'none' }, fill: null,
      };
      layers.push(c);
      continue;
    }
    let role: 'core' | 'prepreg';
    if (type === 'core') role = 'core';
    else if (type === 'prepreg') role = 'prepreg';
    else if (/^dielectric/i.test(name)) {
      role = 'core';
      issues.push(issue('warn', 'type', name, `${name} has the type "${type}"; it is read as a core.`));
    } else {
      issues.push(issue('note', 'type', name, `${name} (type "${type}") is not a layer this tool uses; it is left out.`));
      continue;
    }
    subs.forEach((sub, k) => {
      const id = k === 0 ? name : `${name}/${k + 1}`;
      const okT = Number.isFinite(sub.thickness) && sub.thickness > 0;
      if (!okT) issues.push(issue('error', 'dielectric', id, `${id} has no thickness in the file.`));
      const hasEr = Number.isFinite(sub.er);
      if (!hasEr) issues.push(issue('warn', 'er', id, `${id} has no εr in the file; KiCad's default ${KICAD_DEFAULT_DIELECTRIC_ER} is used.`));
      const d: DielectricLayer = {
        kind: 'dielectric', id, name: k === 0 ? name : `${name} (sublayer ${k + 1})`, role, material: sub.material,
        t: okT ? val(sub.thickness) : val(0.1, absent),
        er: hasEr ? val(sub.er) : val(KICAD_DEFAULT_DIELECTRIC_ER, absent),
        tand: Number.isFinite(sub.tand) ? val(sub.tand) : null,
        freq: Number.isFinite(sub.freq) && sub.freq > 0 ? sub.freq : null,
      };
      layers.push(d);
    });
  }
  if (!layers.some((l) => l.kind === 'copper')) {
    return { stackup: null, version, generator, reason: 'The stackup block has no copper layers.', issues, ignored: [...ignored].sort() };
  }
  flagPlaceholders(layers, file, version, issues);
  const stackup: Stackup = {
    id: '', name: file, layers, finish, controlled,
    thickness: Number.isFinite(boardThickness) && boardThickness > 0 ? val(boardThickness) : null,
  };
  return { stackup, version, generator, reason: '', issues, ignored: [...ignored].sort() };
}

// εr 4.5 or 4.3 with tanδ 0.02 and material "FR4" on every dielectric is a template's value, not the fab's
// (facts-fab.md §2.3): such numbers are marked as placeholders.
function flagPlaceholders(layers: Layer[], file: string, version: number, issues: Issue[]): void {
  const ds = layers.filter((l): l is DielectricLayer => l.kind === 'dielectric');
  if (ds.length === 0) return;
  const all = ds.every((d) => (d.er.v === 4.5 || d.er.v === 4.3) && d.tand?.v === 0.02 && /^fr-?4$/i.test(d.material.trim()));
  if (!all) return;
  const ph: Source = { kind: 'kicad', file, version, placeholder: true };
  for (const d of ds) {
    d.er = { ...d.er, src: ph };
    if (d.tand) d.tand = { ...d.tand, src: ph };
  }
  issues.push(issue('warn', 'placeholder', file, `Every dielectric has material "FR4" with εr ${ds[0].er.v} and tanδ 0.02: these are KiCad's or a template's placeholders, not the fab's numbers. Use the fab's stackup (a JLCPCB preset) or type the εr of each layer.`));
}

// --- Net classes (.kicad_pro) ---

export interface NetClass {
  name: string;
  trackWidth: Val | null;
  clearance: Val | null;
  diffPairWidth: Val | null;
  diffPairGap: Val | null;
  diffPairViaGap: Val | null;
  viaDiameter: Val | null;
  viaDrill: Val | null;
  microviaDiameter: Val | null;
  microviaDrill: Val | null;
  fromDefault: string[]; // fields this class does not set, taken from Default (KiCad's own fallback)
}

export interface KicadProject {
  classes: NetClass[]; // Default first
  schema: number; // net_settings.meta.version: 2 (KiCad 6), 3 (7, 8), 4 (9), 5 (10)
  reason: string;
  issues: Issue[];
}

const CLASS_FIELDS: ReadonlyArray<readonly [keyof NetClass, string]> = [
  ['trackWidth', 'track_width'], ['clearance', 'clearance'], ['diffPairWidth', 'diff_pair_width'],
  ['diffPairGap', 'diff_pair_gap'], ['diffPairViaGap', 'diff_pair_via_gap'], ['viaDiameter', 'via_diameter'],
  ['viaDrill', 'via_drill'], ['microviaDiameter', 'microvia_diameter'], ['microviaDrill', 'microvia_drill'],
];

export function readKicadProject(text: string, file: string): KicadProject {
  const fail = (reason: string): KicadProject => ({ classes: [], schema: 0, reason, issues: [] });
  if (typeof text !== 'string' || !text.trim()) return fail('The file is empty.');
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return fail(text.trimStart().startsWith('update=') || text.includes('[general]')
      ? 'This is a KiCad 5 project (.pro); net classes of KiCad 5 are in the board file, which this tool does not read. Open and save the project in KiCad 6 or later.'
      : 'This is not a KiCad project: a .kicad_pro file is JSON.');
  }
  const ns = j && typeof j === 'object' ? j.net_settings : undefined;
  if (!ns || !Array.isArray(ns.classes)) return fail('The project has no net classes (no net_settings.classes).');
  const schema = Number(ns.meta?.version) || 0;
  const issues: Issue[] = [];
  const src: Source = { kind: 'kicad', file, version: schema };
  const raw: any[] = ns.classes.filter((c: any) => c && typeof c === 'object' && typeof c.name === 'string');
  const def = raw.find((c) => c.name === 'Default');
  if (!def) issues.push(issue('warn', 'default', file, 'The project has no Default net class; fields a class leaves out stay empty.'));
  const ordered = def ? [def, ...raw.filter((c) => c !== def)] : raw;
  const classes = ordered.map((c): NetClass => {
    const nc: NetClass = {
      name: c.name, trackWidth: null, clearance: null, diffPairWidth: null, diffPairGap: null, diffPairViaGap: null,
      viaDiameter: null, viaDrill: null, microviaDiameter: null, microviaDrill: null, fromDefault: [],
    };
    for (const [key, field] of CLASS_FIELDS) {
      let x = c[field];
      if (typeof x !== 'number' && def && c !== def) {
        x = def[field];
        if (typeof x === 'number') nc.fromDefault.push(field);
      }
      if (typeof x === 'number' && Number.isFinite(x)) (nc as any)[key] = { v: x, tol: null, src };
      else if (x !== undefined && x !== null) issues.push(issue('warn', 'class', c.name, `${c.name}: ${field} is not a number.`));
    }
    return nc;
  });
  return { classes, schema, reason: '', issues };
}
