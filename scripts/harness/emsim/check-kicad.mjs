// KiCad reader: the owner's two boards (facts-cases.md C38–C43), KiCad's demos of the installed version, demos of
// KiCad 5–8 when EMSIM_KICAD_OLD names a folder holding them, and files that must be refused with a reason.
// Files are read where they are and never copied; a missing file is skipped with a note.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as K0 from '../../../lib/emsim/kicad.ts';
import * as T0 from '../../../lib/emsim/structure.ts';
import { checkSection } from './check-geometry.mjs';

const S = S0.default ?? S0;
const K = K0.default ?? K0;
const T = T0.default ?? T0;

const OWNER = [
  ['carrier', 'E:/OneDrive - NTNU/ULDAC/PCB/ARTI-CARRIER-PICO2/ARTI-CARRIER-PICO2'],
  ['mezzanine', 'E:/OneDrive - NTNU/ULDAC/PCB/2026_ARTIFICER_TC1/2026_ARTIFICER_TC1'],
];
const DEMOS = 'C:/Program Files/KiCad/10.0/share/kicad/demos';

// C38: both boards' stackups as KiCad stores them.
const C38 = [
  ['F.Mask', 'mask', 0.01], ['F.Cu', 'copper', 0.035], ['dielectric 1', 'prepreg', 0.092], ['In1.Cu', 'copper', 0.03],
  ['dielectric 2', 'core', 0.13], ['In2.Cu', 'copper', 0.03], ['dielectric 3', 'prepreg', 1.003], ['In3.Cu', 'copper', 0.03],
  ['dielectric 4', 'core', 0.13], ['In4.Cu', 'copper', 0.03], ['dielectric 5', 'prepreg', 0.092], ['B.Cu', 'copper', 0.035],
  ['B.Mask', 'mask', 0.01],
];

function readBoard(t, path, label) {
  const text = readFileSync(path, 'utf8');
  const t0 = performance.now();
  const b = K.readKicadStackup(text, basename(path));
  const ms = performance.now() - t0;
  return { b, ms, mb: text.length / 1e6 };
}

function checkRead(t, b, label) {
  t.ok(b.stackup && !b.reason, () => `${label}: refused: ${b.reason}`);
  if (!b.stackup) return;
  const errs = S.stackupIssues(b.stackup).filter((i) => i.level === 'error');
  t.ok(errs.length === 0, () => `${label}: ${JSON.stringify(errs)}`);
  for (const { where, x } of S.stackupVals(b.stackup)) t.ok(x.src && x.src.kind === 'kicad' && x.src.version === b.version, `${label} ${where}: KiCad source`);
  // Every preset structure that fits draws.
  for (const k of T.TRACE_KINDS) {
    const st = T.presetStructure(k.kind, b.stackup, 0.2);
    if (st && !T.structureIssues(b.stackup, st).some((i) => i.level === 'error')) checkSection(t, b.stackup, st, `${label} ${k.kind}`);
  }
}

export function run(t) {
  // --- The owner's boards ---
  for (const [name, stem] of OWNER) {
    if (!existsSync(`${stem}.kicad_pcb`)) { t.note(`${name}: ${stem}.kicad_pcb not found on this machine; skipped.`); continue; }
    const { b, ms, mb } = readBoard(t, `${stem}.kicad_pcb`, name);
    t.note(`${name}: ${mb.toFixed(1)} MB, stackup read in ${ms.toFixed(1)} ms (file version ${b.version}).`);
    t.eq(b.version, 20260206, `${name}: KiCad 10 file`);
    checkRead(t, b, name);
    const L = b.stackup.layers;
    t.eq(L.length, C38.length, `${name}: 13 layers`);
    C38.forEach(([id, kind, th], i) => {
      const l = L[i];
      const k = l.kind === 'dielectric' ? l.role : l.kind;
      const tv = l.kind === 'mask' ? l.onLaminate.v : l.t.v;
      t.ok(l.id === id && k === kind && tv === th, () => `${name} layer ${i + 1}: ${l.id} ${k} ${tv}, wanted ${id} ${kind} ${th}`);
      if (l.kind === 'dielectric') {
        t.ok(l.er.v === 4.3 && l.tand.v === 0.02 && l.material === 'FR4' && l.er.src.placeholder && l.freq === null, `${name} ${id}: εr 4.3 / tanδ 0.02 "FR4", flagged as a placeholder`);
      }
      if (l.kind === 'mask') {
        t.ok(l.er.v === K.KICAD_DEFAULT_MASK_ER && l.er.src.absent && l.onCopper.v === 0.01 && l.between.v === 0.01, `${name} ${id}: no εr in the file, KiCad's default, one thickness`);
      }
    });
    t.ok(b.issues.some((i) => i.code === 'placeholder'), `${name}: the placeholder warning`);
    t.eq(b.stackup.thickness.v, 1.657, `${name}: general thickness 1.657`);
    t.near(S.totalThickness(b.stackup), 1.657, `${name}: layers add up to 1.657`, 1e-12);
    t.ok(b.stackup.finish === 'None' && b.stackup.controlled === true, `${name}: copper_finish "None", dielectric_constraints yes`);
    t.ok(b.ignored.length === 0, () => `${name}: tokens ignored ${b.ignored}`);
    // C38 (1): KiCad's 1.003 prepreg is JLCPCB's 1080 0.069 + 0.865 + 1080 0.069.
    t.near(0.069 + 0.865 + 0.069, L[6].t.v, `${name}: 1.003 = 0.069 + 0.865 + 0.069`, 1e-12);
    // Net classes.
    const pro = `${stem}.kicad_pro`;
    if (!existsSync(pro)) { t.note(`${name}: .kicad_pro not found; skipped.`); continue; }
    const p = K.readKicadProject(readFileSync(pro, 'utf8'), basename(pro));
    t.ok(!p.reason && p.schema === 5, () => `${name}: project read, schema 5 (${p.reason} ${p.schema})`);
    const cls = Object.fromEntries(p.classes.map((c) => [c.name, c]));
    t.eq(p.classes[0].name, 'Default', `${name}: Default first`);
    const d = cls.Default;
    t.ok(d.diffPairWidth.v === 0.2 && d.diffPairGap.v === 0.25 && d.diffPairViaGap.v === 0.25 && d.trackWidth.v === 0.2, `${name}: C43 default pair 0.2 / 0.25`);
    t.eq(d.clearance.v, name === 'carrier' ? 0.2 : 0.1, `${name}: Default clearance`);
    let single;
    let pair;
    if (name === 'carrier') {
      const c = cls['50R_SE'];
      t.ok(c && c.trackWidth.v === 0.1377 && c.trackWidth.src.kind === 'kicad', 'carrier: C39 50R_SE 0.1377');
      t.ok(c.fromDefault.includes('diff_pair_width') && c.diffPairWidth.v === 0.2, 'carrier: 50R_SE falls back to Default for its pair');
      ({ single, pair } = T.structuresFromClass(b.stackup, c));
      t.ok(single.layer === 'F.Cu' && single.below === 'In1.Cu' && single.w.v === 0.1377, 'carrier: 50R_SE offered as a microstrip on F.Cu over In1.Cu');
    } else {
      const c = cls.LVDS_100R;
      t.ok(c && c.diffPairWidth.v === 0.11 && c.diffPairGap.v === 0.2 && c.trackWidth.v === 0.11 && c.clearance.v === 0.2 && c.viaDiameter.v === 0.5 && c.viaDrill.v === 0.22, 'mezzanine: C41 LVDS_100R 0.11 / 0.2, via 0.5 / 0.22');
      t.ok(cls.PWR && cls.PWR.trackWidth.v === 0.5, 'mezzanine: PWR 0.5');
      ({ single, pair } = T.structuresFromClass(b.stackup, c));
      t.ok(pair.kind === 'pair-microstrip' && pair.w.v === 0.11 && pair.s.v === 0.2 && pair.layer === 'F.Cu' && pair.below === 'In1.Cu', 'mezzanine: LVDS_100R offered as an edge-coupled pair on F.Cu over In1.Cu');
    }
    checkSection(t, b.stackup, single, `${name} class single`);
    checkSection(t, b.stackup, pair, `${name} class pair`);
  }
  // --- KiCad's demos (installed KiCad 10) ---
  const seen = new Map();
  if (existsSync(DEMOS)) {
    for (const dir of readdirSync(DEMOS)) {
      const full = join(DEMOS, dir);
      if (!statSync(full).isDirectory()) continue;
      for (const f of readdirSync(full).filter((x) => x.endsWith('.kicad_pcb'))) demo(t, join(full, f), seen);
    }
  } else t.note(`${DEMOS} not found; KiCad 10's demos skipped.`);
  // --- KiCad 5–8 demos fetched into a scratch folder ---
  const old = process.env.EMSIM_KICAD_OLD;
  if (old && existsSync(old)) {
    for (const f of readdirSync(old)) {
      if (f.endsWith('.kicad_pcb')) demo(t, join(old, f), seen);
      if (f.endsWith('.kicad_pro')) {
        const p = K.readKicadProject(readFileSync(join(old, f), 'utf8'), f);
        t.ok(!p.reason && p.classes[0]?.name === 'Default' && p.classes[0].trackWidth, () => `${f}: net classes (${p.reason})`);
        seen.set(`project schema ${p.schema}`, (seen.get(`project schema ${p.schema}`) ?? 0) + 1);
      }
    }
  } else t.note('EMSIM_KICAD_OLD not set: KiCad 5–8 demo boards skipped.');
  t.note(`Boards by result: ${[...seen].map(([k, n]) => `${k} ×${n}`).sort().join(', ')}.`);
  // --- Refusals and odd input: a reason, never a throw ---
  const refuse = (text, label, pattern) => {
    let b;
    try { b = K.readKicadStackup(text, 'x.kicad_pcb'); } catch (e) { t.ok(false, `${label}: threw ${e}`); return; }
    t.ok(!b.stackup && b.reason && (!pattern || pattern.test(b.reason)), () => `${label}: ${JSON.stringify(b.reason)}`);
  };
  refuse('', 'empty', /empty/);
  refuse('hello', 'not a board', /not a KiCad board/);
  refuse('(module x (layer F.Cu))', 'a footprint', /not a KiCad board/);
  refuse('(kicad_pcb (version 20171130) (general (thickness 1.6)) (setup (last_trace_width 0.25)) (net 0 ""))', 'KiCad 5', /KiCad 5/);
  refuse('(kicad_pcb (version 4) (setup) (net 0 ""))', 'KiCad 4', /KiCad 4/);
  refuse('(kicad_pcb (version 20241229) (general (thickness 1.6)) (setup (pad_to_mask_clearance 0)) (net 0 ""))', 'no stackup', /no stackup/);
  refuse('(kicad_pcb (version 20241229) (net 0 "") (footprint x))', 'no setup', /no setup/);
  refuse('(kicad_pcb (version 20241229) (setup (stackup (layer "F.Cu" (type "copper") (thickness 0.035)', 'cut short', /cannot be read/);
  refuse('(kicad_pcb (version 20241229) (setup (stackup (layer "F.SilkS" (type "Top Silk Screen")))))', 'no copper', /no copper/);
  // Sublayers, the 11.0 tokens and unknown tokens.
  const sub = '(kicad_pcb (version 20261031) (general (thickness 0.5)) (setup (stackup ' +
    '(layer "F.Cu" (type "copper") (thickness 0.035)) ' +
    '(layer "dielectric 1" (type "prepreg") (thickness 0.07 locked) (material "PR1080") (epsilon_r 3.96) (loss_tangent 0.02) (spec_frequency 1000000000) (dielectric_model "djordjevic_sarkar") ' +
    'addsublayer (thickness 0.08) (material "PR2116") (epsilon_r 4.1) (loss_tangent 0.015) (frobnicate 3)) ' +
    '(layer "B.Cu" (type "copper") (thickness 0.035)) (copper_finish "ENIG") (dielectric_constraints no) (edge_connector yes) (castellated_pads yes))) (net 0 ""))';
  const r = K.readKicadStackup(sub, 'sub.kicad_pcb');
  const ds = r.stackup?.layers.filter((l) => l.kind === 'dielectric') ?? [];
  t.ok(ds.length === 2 && ds[0].t.v === 0.07 && ds[1].t.v === 0.08 && ds[1].er.v === 4.1 && ds[1].tand.v === 0.015 && ds[0].material === 'PR1080' && ds[1].id === 'dielectric 1/2', () => `sublayers: ${JSON.stringify(ds.map((d) => [d.id, d.t.v, d.er.v]))}`);
  t.ok(ds[0].freq === 1e9 && ds[1].freq === null, 'spec_frequency read per sublayer');
  t.ok(r.stackup.finish === 'ENIG' && r.stackup.controlled === false, 'finish and constraints');
  t.eq(r.ignored.join(), 'castellated_pads,dielectric_model,edge_connector,frobnicate', 'unknown tokens listed');
  t.ok(r.issues.some((i) => i.code === 'version'), 'a newer file version is noted');
  t.ok(!r.issues.some((i) => i.code === 'placeholder'), 'real εr are not placeholders');
  // Projects that cannot be read.
  for (const [text, label, re] of [['', 'empty', /empty/], ['update=22/05/2019\n[general]\nversion=1', 'KiCad 5 .pro', /KiCad 5/], ['{"board":{}}', 'no classes', /no net classes/], ['{oops', 'bad JSON', /not a KiCad project/]]) {
    let p;
    try { p = K.readKicadProject(text, 'x'); } catch (e) { t.ok(false, `project ${label} threw`); continue; }
    t.ok(p.classes.length === 0 && re.test(p.reason), () => `project ${label}: ${p.reason}`);
  }
}

function demo(t, path, seen) {
  const { b, ms, mb } = readBoard(t, path, basename(path));
  const label = `${basename(path)} (${K.kicadRelease(b.version)})`;
  const key = `${K.kicadRelease(b.version)} ${b.stackup ? 'read' : 'refused'}`;
  seen.set(key, (seen.get(key) ?? 0) + 1);
  if (b.stackup) {
    checkRead(t, b, label);
    t.ok(ms < 2000 + mb * 20, `${label}: read in ${ms.toFixed(0)} ms`);
  } else {
    t.ok(b.reason.length > 20 && !/cannot be read/.test(b.reason), () => `${label}: refused without a useful reason: ${b.reason}`);
  }
}
