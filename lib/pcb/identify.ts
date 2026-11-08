// Finds the kind, side and copper number of each layer of a Gerber set, in this order: the X2 file function, the
// Gerber job file, then the file name patterns of the common tools (KiCad, Altium/Protel, EAGLE/Fusion,
// OrCAD/Allegro, DipTrace, EasyEDA/JLC, PADS). Also the default order of the layers, from the top of the board down.
import { GerberJob } from './gbrjob';
import { IdentifiedBy, Layer, LayerKind, Side } from './model';

export interface Identity {
  kind: LayerKind;
  side: Side;
  // Copper order, if the source gives it (X2 "Copper,L3,Inr", PADS "L3.pho").
  copper?: number;
  // The n-th inner layer, from names like In2_Cu, .G2 or .ly3 (EAGLE counts the top as 1, so its ly3 is inner 2).
  inner?: number;
  plated?: boolean;
  // A drill file with plated and non-plated holes (each hole says which).
  mixed?: boolean;
  // More about what the layer is, e.g. "Glue" or "ECO1".
  label?: string;
  by: IdentifiedBy;
  // X2 "Other": a file name may say more.
  weak?: boolean;
}

function sideWord(s: string | undefined): Side {
  const v = (s ?? '').toLowerCase();
  if (v === 'top') return 'top';
  if (v === 'bot' || v === 'bottom') return 'bottom';
  if (v === 'inr' || v === 'inner') return 'inner';
  return 'none';
}

// The function of a file as X2 (.FileFunction) or a job file gives it, e.g. "Copper,L1,Top" or "SolderMask,Bot".
export function fromFileFunction(ff: string | undefined, by: IdentifiedBy): Identity | null {
  if (!ff) return null;
  const f = ff.split(',').map((s) => s.trim());
  const type = f[0].toLowerCase().replace(/[\s_-]/g, '');
  switch (type) {
    case 'copper': {
      const n = /^L(\d+)$/i.exec(f[1] ?? '');
      return { kind: 'copper', side: sideWord(f[2]), copper: n ? Number(n[1]) : undefined, label: f[3], by };
    }
    case 'plated':
    case 'nonplated': {
      // Plated,1,6,PTH[,Drill|Rout|Mixed]: the layers the holes go through, blind or buried, and rout or drill.
      const span = f[1] && f[2] ? `L${f[1]}–L${f[2]}` : '';
      const how = /^(blind|buried)$/i.test(f[3] ?? '') ? f[3].toLowerCase() : '';
      const rout = /^(rout|mixed)$/i.test(f[4] ?? '') ? f[4].toLowerCase() : '';
      return { kind: 'drill', side: 'none', plated: type === 'plated', label: [span, how, rout].filter(Boolean).join(', ') || undefined, by };
    }
    case 'mixedplating': {
      // KiCad's Excellon files with both: MixedPlating,1,6.
      const span = f[1] && f[2] ? `L${f[1]}–L${f[2]}` : '';
      return { kind: 'drill', side: 'none', mixed: true, label: span || undefined, by };
    }
    case 'profile':
      return { kind: 'outline', side: 'none', by };
    case 'soldermask':
      return { kind: 'mask', side: sideWord(f[1]), by };
    case 'legend':
      return { kind: 'silk', side: sideWord(f[1]), by };
    case 'paste':
    case 'solderpaste':
      return { kind: 'paste', side: sideWord(f[1]), by };
    case 'keepout':
      return { kind: 'keepout', side: sideWord(f[1]), by };
    case 'assemblydrawing':
      return { kind: 'fab', side: sideWord(f[1]), label: 'Assembly drawing', by };
    case 'fabricationdrawing':
      return { kind: 'fab', side: 'none', label: 'Fabrication drawing', by };
    case 'arraydrawing':
      return { kind: 'fab', side: 'none', label: 'Panel drawing', by };
    case 'drillmap':
      return { kind: 'fab', side: 'none', label: 'Drill map', by };
    case 'drawing':
    case 'otherdrawing':
      return { kind: 'fab', side: 'none', label: f[1] || 'Drawing', by, weak: true };
    case 'depthrout':
    case 'vcut':
    case 'viafill':
      return { kind: 'mechanical', side: sideWord(f[1]), label: f[0], by };
    case 'glue':
    case 'carbonmask':
    case 'goldmask':
    case 'heatsinkmask':
    case 'peelablemask':
    case 'silvermask':
    case 'tinmask':
    case 'pads':
      return { kind: 'other', side: sideWord(f[1]), label: f[0], by };
    case 'component':
      return { kind: 'other', side: sideWord(f[2]), label: 'Components', by };
    case 'other':
      return { kind: 'other', side: 'none', label: f[1], by, weak: true };
    default:
      return null;
  }
}

// --- File names ---

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? { stem: name, ext: '' } : { stem: name.slice(0, dot), ext: name.slice(dot + 1).toLowerCase() };
}

// Words of a file name: split at separators and at lower-to-upper case changes ("TopSilkscreenLayer").
function words(stem: string): string[] {
  return stem
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

const id = (kind: LayerKind, side: Side, extra: Partial<Identity> = {}): Identity => ({ kind, side, by: 'name', ...extra });

// Protel/Altium extensions, which KiCad, EasyEDA/JLC and many others also use.
function fromProtelExtension(ext: string): Identity | null {
  const fixed: Record<string, Identity> = {
    gtl: id('copper', 'top'),
    gbl: id('copper', 'bottom'),
    gto: id('silk', 'top'),
    gbo: id('silk', 'bottom'),
    gts: id('mask', 'top'),
    gbs: id('mask', 'bottom'),
    gtp: id('paste', 'top'),
    gbp: id('paste', 'bottom'),
    gko: id('outline', 'none', { label: 'Keep-out layer' }),
    gml: id('outline', 'none'),
    gm: id('mechanical', 'none'),
    gpt: id('other', 'top', { label: 'Pad master' }),
    gpb: id('other', 'bottom', { label: 'Pad master' }),
    gta: id('other', 'top', { label: 'Glue' }),
    gba: id('other', 'bottom', { label: 'Glue' }),
  };
  if (fixed[ext]) return fixed[ext];
  let m = /^g(\d+)$/.exec(ext);
  if (m) return id('copper', 'inner', { inner: Number(m[1]) });
  m = /^gp(\d+)$/.exec(ext);
  if (m) return id('copper', 'inner', { inner: 100 + Number(m[1]), label: 'Plane' });
  m = /^gm(\d+)$/.exec(ext);
  if (m) return id('mechanical', 'none', { label: `Mechanical ${m[1]}` });
  m = /^g[dg](\d+)$/.exec(ext);
  if (m) return id('fab', 'none', { label: ext.startsWith('gd') ? 'Drill drawing' : 'Drill guide' });
  return null;
}

// EAGLE (CAM processor), OrCAD Layout/Allegro and PADS extensions and short names.
function fromShortName(token: string): Identity | null {
  const fixed: Record<string, Identity> = {
    cmp: id('copper', 'top'),
    sol: id('copper', 'bottom'),
    stc: id('mask', 'top'),
    sts: id('mask', 'bottom'),
    plc: id('silk', 'top'),
    pls: id('silk', 'bottom'),
    crc: id('paste', 'top'),
    crs: id('paste', 'bottom'),
    dim: id('outline', 'none'),
    mil: id('outline', 'none'),
    top: id('copper', 'top'),
    bot: id('copper', 'bottom'),
    bottom: id('copper', 'bottom'),
    smt: id('mask', 'top'),
    smb: id('mask', 'bottom'),
    sst: id('silk', 'top'),
    ssb: id('silk', 'bottom'),
    spt: id('paste', 'top'),
    spb: id('paste', 'bottom'),
    ast: id('fab', 'top', { label: 'Assembly drawing' }),
    asb: id('fab', 'bottom', { label: 'Assembly drawing' }),
    drd: id('fab', 'none', { label: 'Drill drawing' }),
    // PADS (as Linear's TS.pho, BM.pho)
    ts: id('silk', 'top'),
    tm: id('mask', 'top'),
    tp: id('paste', 'top'),
    bs: id('silk', 'bottom'),
    bm: id('mask', 'bottom'),
    bp: id('paste', 'bottom'),
    fab: id('fab', 'none'),
  };
  if (fixed[token]) return fixed[token];
  let m = /^ly(\d+)$/.exec(token);
  if (m) return id('copper', 'inner', { inner: Number(m[1]) - 1 });
  m = /^(?:l|layer|art0*)(\d+)$/.exec(token);
  if (m) return id('copper', 'none', { copper: Number(m[1]) });
  return null;
}

const KIND_WORDS: [LayerKind, RegExp, string?][] = [
  ['outline', /^(outline|boardoutline|profile|border|dimension|dimensions|contour|edgecuts|mill|milling|cuts)$/],
  ['fab', /^(drillmap|map)$/, 'Drill map'],
  ['courtyard', /^(courtyard|crtyd)$/],
  ['fab', /^(fab|fabrication|assembly|assy)$/],
  ['keepout', /^(keepout|keepouts)$/],
  ['paste', /^(paste|cream|stencil|pastemask|solderpaste)$/],
  ['mask', /^(mask|soldermask|stopmask|resist|solderresist|stop)$/],
  ['silk', /^(silk|silks|silkscreen|legend|overlay|print|ss)$/],
  ['other', /^(adhesive|adhes|glue)$/, 'Glue'],
  ['fab', /^(drill|drl|drills|holes|nc)$/, 'Drill drawing'],
  ['copper', /^(cu|copper|signal|plane|gnd|ground|pwr|power|vcc)$/],
  ['mechanical', /^(mech|mechanical|margin)$/],
  ['other', /^(user|dwgs|cmts|eco1|eco2|eco|comments|drawings|notes)$/],
];

function sideFromWords(ws: string[]): { side: Side; inner?: number; copper?: number } {
  for (const w of ws) {
    let m = /^(?:in|inner|mid|int|inr)(\d+)$/.exec(w);
    if (m) return { side: 'inner', inner: Number(m[1]) };
    m = /^(?:layer|l)(\d+)$/.exec(w);
    if (m) return { side: 'none', copper: Number(m[1]) };
  }
  if (ws.some((w) => /^(top|front|f|t|comp|component|cmp)$/.test(w))) return { side: 'top' };
  if (ws.some((w) => /^(bottom|bot|back|b|sol)$/.test(w))) return { side: 'bottom' };
  if (ws.some((w) => /^(inner|inr)$/.test(w))) return { side: 'inner' };
  return { side: 'none' };
}

export function fromFileName(path: string): Identity | null {
  const name = baseName(path);
  const { stem, ext } = splitName(name);
  // KiCad: <project>-F_Cu, -In2_Cu, -B_Mask, -Edge_Cuts, -User_Drawings, with dots in older versions (-F.Cu).
  const kicad = /(?:^|[-_.])(F|B|In\d+|[A-Za-z0-9]+)[._](Cu|Mask|Paste|SilkS|Silkscreen|Fab|CrtYd|Courtyard|Adhes|Adhesive)$/i.exec(stem);
  if (kicad) {
    const [, which, what] = kicad;
    const side: Side = /^F$/i.test(which) ? 'top' : /^B$/i.test(which) ? 'bottom' : /^In\d+$/i.test(which) || what.toLowerCase() === 'cu' ? 'inner' : 'none';
    const kinds: Record<string, [LayerKind, string?]> = {
      cu: ['copper'], mask: ['mask'], paste: ['paste'], silks: ['silk'], silkscreen: ['silk'], fab: ['fab'], crtyd: ['courtyard'],
      courtyard: ['courtyard'], adhes: ['other', 'Glue'], adhesive: ['other', 'Glue'],
    };
    const [kind, label] = kinds[what.toLowerCase()];
    let inner: number | undefined;
    if (side === 'inner') {
      // In2_Cu, or an inner layer with its own name and Protel's extension (GND1_Cu.g1).
      const n = /^In(\d+)$/i.exec(which);
      const g = /^g(\d+)$/.exec(ext);
      inner = n ? Number(n[1]) : g ? Number(g[1]) : undefined;
    }
    return id(kind, side, { inner, label });
  }
  if (/(?:^|[-_.])Edge[._]Cuts$/i.test(stem)) return id('outline', 'none');
  if (/(?:^|[-_.])(User[._]\d+|User[._](Drawings|Comments|Eco1|Eco2)|Dwgs[._]User|Cmts[._]User|Eco[12][._]User)$/i.test(stem)) return id('other', 'none');
  if (/(?:^|[-_.])Margin$/i.test(stem)) return id('mechanical', 'none', { label: 'Margin' });

  const ws = words(stem);
  // A kind from the words of the name, with the side from the other words.
  for (const [kind, pattern, label] of KIND_WORDS) {
    if (!ws.some((w) => pattern.test(w))) continue;
    const s = sideFromWords(ws.filter((w) => !pattern.test(w)));
    if (kind === 'copper' && s.side === 'none' && s.copper === undefined) {
      // GND, PWR or "plane" without a side are inner planes.
      return id('copper', ws.some((w) => /^(gnd|ground|pwr|power|vcc|plane)$/.test(w)) ? 'inner' : 'none', { label });
    }
    return id(kind, kind === 'outline' ? 'none' : s.side, { inner: s.inner, copper: kind === 'copper' ? s.copper : undefined, label });
  }
  // Concatenated words, as "topsilk" or "BottomMask".
  const compact = stem.toLowerCase().replace(/[^a-z0-9]/g, '');
  const compactSide: Side = /^(top|front)/.test(compact) || /(top|front)$/.test(compact) ? 'top' : /^(bot|bottom|back)/.test(compact) || /(bot|bottom|back)$/.test(compact) ? 'bottom' : 'none';
  for (const [kind, word] of [['outline', 'outline'], ['silk', 'silk'], ['silk', 'legend'], ['mask', 'mask'], ['paste', 'paste'], ['copper', 'copper']] as [LayerKind, string][]) {
    if (compact.includes(word)) return id(kind, kind === 'outline' ? 'none' : compactSide);
  }

  // Extensions and short names.
  const protel = fromProtelExtension(ext);
  if (protel) return protel;
  const short = fromShortName(ext) ?? fromShortName(ws[ws.length - 1] ?? '') ?? fromShortName(compact);
  if (short) return short;
  // A name that is only a side: DipTrace's Top.gbr and Bottom.gbr are copper.
  const s = sideFromWords(ws);
  if (s.side === 'inner' || s.copper !== undefined) return id('copper', s.side, { inner: s.inner, copper: s.copper });
  if (ws.length === 1 && (s.side === 'top' || s.side === 'bottom')) return id('copper', s.side);
  return null;
}

// --- The whole set ---

// The order of inner layers named by index (In2_Cu, .G2), for numberCopper.
const innerIndex = new WeakMap<Layer, number | undefined>();

// What the user chose in the layer panel, which wins over everything else.
export interface LayerOverride {
  kind: LayerKind;
  side: Side;
}

// One layer: X2 first, then the job file, then the name. X2 "Other" is weak: a name that clearly says more wins.
export function identifyLayer(file: string, attrs: Record<string, string> | undefined, jobs: GerberJob[]): Identity {
  const name = baseName(file).toLowerCase();
  const jobEntry = jobs.flatMap((j) => j.files).find((f) => baseName(f.path).toLowerCase() === name);
  const x2 = fromFileFunction(attrs?.['.FileFunction'], 'x2');
  const fromJob = fromFileFunction(jobEntry?.function, 'job');
  const byName = fromFileName(file);
  let found = (x2 && !x2.weak ? x2 : null) ?? (fromJob && !fromJob.weak ? fromJob : null);
  if (!found) {
    const sided = ['silk', 'mask', 'paste', 'copper'].includes(byName?.kind);
    const clearName = byName && (!sided || byName.side !== 'none' || byName.copper !== undefined);
    found = (clearName ? byName : null) ?? x2 ?? fromJob ?? byName;
    if (found === byName && byName?.kind === 'other' && !byName.label) found = { ...byName, label: x2?.label ?? fromJob?.label };
  }
  // A name can still tell the side, or which inner layer a copper layer is.
  if (found && byName && found !== byName && found.kind === byName.kind) {
    if (found.side === 'none' && byName.side !== 'none') found = { ...found, side: byName.side };
    if (found.copper === undefined && found.inner === undefined) found = { ...found, inner: byName.inner, copper: byName.copper };
  }
  return found ?? { kind: 'other', side: 'none', by: 'none' };
}

// Identifies every layer of a Gerber set (in place), numbers the copper layers and sorts the layers from the top of
// the board down. `fixed` holds what a reader already knows about a layer (an Excellon file is a drill layer), which
// takes the place of the X2, job file and name rules.
export function identifyLayers(layers: Layer[], jobs: GerberJob[], overrides: Map<string, LayerOverride>, fixed?: Map<string, Identity>): void {
  for (const layer of layers) {
    const found = fixed?.get(layer.id) ?? identifyLayer(layer.file ?? layer.name, layer.attrs, jobs);
    const override = overrides.get(layer.id);
    const changed = override && (override.kind !== found.kind || override.side !== found.side);
    layer.kind = override?.kind ?? found.kind;
    layer.side = override?.side ?? found.side;
    layer.copper = changed ? undefined : found.copper;
    layer.plated = layer.kind === 'drill' && !(found.mixed && !changed) ? found.plated ?? true : undefined;
    layer.label = changed ? undefined : found.label;
    layer.identifiedBy = changed ? 'user' : found.by;
    innerIndex.set(layer, changed ? undefined : found.inner);
  }
  numberCopper(layers);
  layers.sort(compareLayers);
}

// Gives every copper layer its number: top 1, inner layers in order, bottom last.
export function numberCopper(layers: Layer[]): void {
  const copper = layers.filter((l) => l.kind === 'copper');
  if (!copper.length) return;
  // Layer numbers without a side (PADS L1…L4): the first is the top and the highest the bottom.
  const numbered = copper.filter((l) => l.copper !== undefined);
  const highest = Math.max(0, ...numbered.map((l) => l.copper));
  for (const l of copper) {
    if (l.copper !== undefined && l.side === 'none') l.side = l.copper === 1 ? 'top' : l.copper === highest && highest > 1 ? 'bottom' : 'inner';
  }
  const inner = copper.filter((l) => l.side === 'inner' && l.copper === undefined);
  inner.sort((a, b) => (innerIndex.get(a) ?? 1e9) - (innerIndex.get(b) ?? 1e9) || (a.file ?? '').localeCompare(b.file ?? ''));
  const firstInner = Math.max(2, ...copper.filter((l) => l.side === 'inner' && l.copper !== undefined).map((l) => l.copper + 1));
  inner.forEach((l, i) => {
    l.copper = numbered.some((n) => n.side === 'inner') ? firstInner + i : 2 + i;
  });
  const maxNumber = Math.max(copper.length, ...copper.map((l) => l.copper ?? 0));
  for (const l of copper) {
    if (l.copper !== undefined) continue;
    if (l.side === 'top') l.copper = 1;
    else if (l.side === 'bottom') l.copper = Math.max(2, maxNumber);
  }
}

const TOP_ORDER: Partial<Record<LayerKind, number>> = { fab: 0, courtyard: 1, keepout: 2, other: 3, mechanical: 3, silk: 4, paste: 5, mask: 6, copper: 7 };
const BOTTOM_ORDER: Partial<Record<LayerKind, number>> = { copper: 0, mask: 1, paste: 2, silk: 3, other: 4, mechanical: 4, keepout: 5, courtyard: 6, fab: 7 };
const NONE_ORDER: Partial<Record<LayerKind, number>> = { mechanical: 0, fab: 1, keepout: 2, courtyard: 3, other: 4, silk: 5, mask: 5, paste: 5, copper: 5 };

// The default order, from the top of the list: outline and drills, the top side, inner copper, the bottom side, then
// layers of neither side. The top of the list is drawn on top in the top view.
export function layerRank(l: Layer): [number, number] {
  if (l.kind === 'outline') return [0, 0];
  if (l.kind === 'drill') return [1, l.plated === false ? 2 : l.plated === true ? 0 : 1];
  if (l.kind === 'copper') {
    if (l.side === 'top') return [2, 7];
    if (l.side === 'bottom') return [4, 0];
    return [3, l.copper ?? 99];
  }
  if (l.side === 'top') return [2, TOP_ORDER[l.kind] ?? 3];
  if (l.side === 'bottom') return [4, BOTTOM_ORDER[l.kind] ?? 4];
  if (l.side === 'inner') return [3, 100];
  return [5, NONE_ORDER[l.kind] ?? 4];
}

export function compareLayers(a: Layer, b: Layer): number {
  const [ga, oa] = layerRank(a);
  const [gb, ob] = layerRank(b);
  return ga - gb || oa - ob || (a.file ?? a.name).localeCompare(b.file ?? b.name, undefined, { numeric: true });
}

const KIND_NAMES: Record<LayerKind, string> = {
  copper: 'copper',
  mask: 'solder mask',
  paste: 'paste',
  silk: 'silkscreen',
  outline: 'Board outline',
  drill: 'drill',
  mechanical: 'Mechanical',
  fab: 'fabrication',
  courtyard: 'courtyard',
  keepout: 'keep-out',
  other: 'Other',
};

export const KIND_OPTIONS: [LayerKind, string][] = [
  ['copper', 'Copper'],
  ['mask', 'Solder mask'],
  ['paste', 'Paste'],
  ['silk', 'Silkscreen'],
  ['outline', 'Board outline'],
  ['drill', 'Drill'],
  ['fab', 'Fabrication / assembly'],
  ['courtyard', 'Courtyard'],
  ['keepout', 'Keep-out'],
  ['mechanical', 'Mechanical'],
  ['other', 'Other'],
];

export const SIDE_OPTIONS: [Side, string][] = [
  ['top', 'Top'],
  ['inner', 'Inner'],
  ['bottom', 'Bottom'],
  ['none', 'Neither'],
];

// A title for a layer, e.g. "Top copper (L1)", "Inner copper L3", "Bottom solder mask", "Board outline".
export function layerTitle(l: Layer): string {
  const label = l.label;
  if (l.kind === 'copper') {
    const n = l.copper ? ` L${l.copper}` : '';
    if (l.side === 'top') return `Top copper${n && ` (${n.trim()})`}`;
    if (l.side === 'bottom') return `Bottom copper${n && ` (${n.trim()})`}`;
    return `Inner copper${n}`;
  }
  if (l.kind === 'drill') {
    const what = l.plated === false ? 'Non-plated drill' : l.plated === true ? 'Plated drill' : 'Drill, plated and non-plated';
    return `${what}${label ? ` (${label})` : ''}`;
  }
  if (l.kind === 'outline') return 'Board outline';
  if (l.kind === 'other' || l.kind === 'mechanical') {
    const side = l.side === 'top' ? 'Top ' : l.side === 'bottom' ? 'Bottom ' : '';
    const base = label ?? KIND_NAMES[l.kind];
    return side ? `${side}${base.charAt(0).toLowerCase()}${base.slice(1)}` : base;
  }
  const side = l.side === 'top' ? 'Top' : l.side === 'bottom' ? 'Bottom' : l.side === 'inner' ? 'Inner' : '';
  const base = l.kind === 'fab' && label ? label.charAt(0).toLowerCase() + label.slice(1) : KIND_NAMES[l.kind];
  return side ? `${side} ${base}` : base.charAt(0).toUpperCase() + base.slice(1);
}
