// The Stackup section of the EM simulation page (M2.1a): presets, KiCad files (.kicad_pcb: the stackup, .kicad_pro: the
// net classes; read on the device with File.text(), the reader loaded by import() when a file is opened), the drawing,
// the layer table with every value's source and tolerance (plan.md D8, D9), the stackup's issues and the sources.

import React, { useMemo, useRef, useState } from 'react';

import { PRESET_IDS, REFS, presetStackup } from '../../lib/emsim/presets';
import { DEFAULT_TRACE_W } from '../../lib/emsim/setup';
import type { Setup } from '../../lib/emsim/setup';
import { cloneStackup, copperIds, sameStackup, stackupIssues, stackupVals, totalThickness } from '../../lib/emsim/stackup';
import type { Issue, Layer, Stackup, Val } from '../../lib/emsim/stackup';
import { presetStructure } from '../../lib/emsim/structure';
import { presetVia } from '../../lib/emsim/via';
import type { KicadBoard, KicadProject, NetClass } from '../../lib/emsim/kicad';
import type { LengthUnit } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimStackup.module.css';
import StackupDrawing from './StackupDrawing';
import ValField from './ValField';
import { lenText, numText, tolText } from './format';

export type Commit = (next: Setup | ((cur: Setup) => Setup), group?: string) => void;

// What the KiCad files gave (page state, not in the link: M2.1b's trace editor uses the classes).
export interface KicadState {
  board: { file: string; release: string; version: number; reason: string; issues: Issue[]; ignored: string[] } | null;
  project: { file: string; schema: number; reason: string; issues: Issue[]; classes: NetClass[] } | null;
}

export const NO_KICAD: KicadState = { board: null, project: null };

const PRESET_NAMES = new Map(PRESET_IDS.map((id) => [id, presetStackup(id)?.name ?? id]));

// A new stackup in a setup: the trace and via keep their layers when the copper layers are the same ids, and are
// placed anew (the default microstrip and via presets) when they are not.
export function withStackup(prev: Setup, s: Stackup): Setup {
  if (copperIds(prev.stackup).join('\n') === copperIds(s).join('\n')) return { ...prev, stackup: s };
  return { stackup: s, trace: presetStructure('microstrip', s, DEFAULT_TRACE_W) ?? prev.trace, via: presetVia('single', s) ?? prev.via };
}

// One value of one layer replaced. A copper thickness typed over base + plating drops the split, which no longer adds up.
function editLayer(s: Stackup, i: number, key: string, x: Val | null): Stackup {
  const n = cloneStackup(s);
  const l = n.layers[i] as unknown as Record<string, unknown>;
  l[key] = x;
  if (l.kind === 'copper' && key === 't' && x) {
    const b = l.base as Val | null, p = l.plating as Val | null;
    if (b && p && Math.abs(b.v + p.v - x.v) > 1e-12) { l.base = null; l.plating = null; }
  }
  return n;
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className={base.issues}>
      {issues.map((x, i) => (
        <li key={i} data-issue={x.code}><span className={base.level} data-level={x.level}>{x.level === 'warn' ? 'warning' : x.level}</span>{x.message}</li>
      ))}
    </ul>
  );
}

function kindText(l: Layer): string {
  if (l.kind === 'mask') return `solder mask${l.material ? ` · ${l.material}` : ''}`;
  if (l.kind === 'copper') return 'copper';
  return `${l.role}${l.material ? ` · ${l.material}` : ''}`;
}

function swatch(l: Layer): string {
  return l.kind === 'copper' ? 'var(--copper)' : l.kind === 'mask' ? 'var(--mask)' : l.role === 'core' ? 'var(--core)' : 'var(--prepreg)';
}

function freqText(f: number | null): string {
  if (f === null) return 'frequency not stated';
  return f >= 1e9 ? `at ${numText(f / 1e9, 4)} GHz` : `at ${numText(f / 1e6, 4)} MHz`;
}

interface RowProps {
  l: Layer;
  i: number;
  unit: LengthUnit;
  digits: number;
  active: boolean;
  onVal: (i: number, key: string, x: Val | null, part: 'v' | 'tol') => void;
  onActive: (i: number) => void;
}

function LayerRow({ l, i, unit, digits, active, onVal, onActive }: RowProps) {
  const f = (key: string, label: string, x: Val | null, opts: { length?: boolean; zero?: boolean; nullable?: boolean; min?: number; max?: number } = {}) => (
    <ValField
      key={key}
      name={`${l.id}.${key}`}
      label={label}
      x={x}
      unit={opts.length ? unit : null}
      digits={digits}
      zero={opts.zero}
      nullable={opts.nullable}
      min={opts.min}
      max={opts.max}
      onChange={(next, part) => onVal(i, key, next, part)}
      onFocus={() => onActive(i)}
    />
  );
  let fields: React.ReactNode[];
  let note = '';
  if (l.kind === 'mask') {
    fields = [
      f('onLaminate', 'On laminate', l.onLaminate, { length: true, zero: true }),
      f('onCopper', 'Over copper', l.onCopper, { length: true, zero: true }),
      f('between', 'Between traces', l.between, { length: true, zero: true }),
      f('er', 'εr', l.er, { min: 1 }),
      f('tand', 'tanδ', l.tand, { nullable: true, min: 0, max: 1 }),
    ];
    note = `εr ${freqText(l.freq)}.`;
  } else if (l.kind === 'copper') {
    fields = [f('t', 'Thickness', l.t, { length: true })];
    const parts: string[] = [];
    if (l.base && l.plating) parts.push(`base ${lenText(l.base.v, unit, digits)} + plating ${lenText(l.plating.v, unit, digits)}`);
    if (l.calc) parts.push(`the fab's calculator uses ${lenText(l.calc.v, unit, digits)}`);
    if (l.etch.kind === 'offset') parts.push(`etched ${lenText(l.etch.side.v, unit, digits)} per side (top narrower)`);
    else if (l.etch.kind === 'factor') parts.push(`etch factor ${numText(l.etch.f.v, digits)}`);
    else parts.push('no etch trapezoid');
    note = parts.join(' · ');
  } else {
    fields = [
      f('t', 'Thickness', l.t, { length: true }),
      f('er', 'εr', l.er, { min: 1 }),
      f('tand', 'tanδ', l.tand, { nullable: true, min: 0, max: 1 }),
    ];
    note = `εr ${freqText(l.freq)}.`;
  }
  return (
    <li className={css.row} data-layer={l.id} data-layer-kind={l.kind} data-active={active} onPointerDown={() => onActive(i)}>
      <span className={css.swatch} style={{ background: swatch(l) }} aria-hidden="true" />
      <div className={css.rowBody}>
        <div className={css.rowHead}>
          <span className={css.layerName}>{l.name || l.id}</span>
          <span className={css.layerKind}>{kindText(l)}</span>
        </div>
        <div className={css.fields}>{fields}</div>
        {note && <p className={css.layerNote}>{note}</p>}
      </div>
    </li>
  );
}

// Where the numbers come from: the presets' references with date and URL, the KiCad files, typed values, notes.
function Sources({ s }: { s: Stackup }) {
  const refs = new Map<string, { url: string; date: string }>();
  const files = new Map<string, number>();
  const notes: string[] = [];
  let typed = 0, placeholder = 0, absent = 0;
  for (const { where, x } of stackupVals(s)) {
    const src = x.src;
    if (src.kind === 'preset') {
      if (!refs.has(src.ref)) refs.set(src.ref, { url: src.url, date: src.date });
      if (src.note) notes.push(`${where}: ${src.note}`);
    } else if (src.kind === 'kicad') {
      files.set(src.file, src.version);
      if (src.placeholder) placeholder++;
      if (src.absent) absent++;
    } else typed++;
  }
  return (
    <div className={css.sources} data-sources>
      <h3 className={base.h3}>Sources</h3>
      <dl>
        {[...refs].map(([ref, r]) => (
          <React.Fragment key={ref}>
            <dt>{ref}</dt>
            <dd>{REFS[ref]?.what ?? ref}; read {r.date}; <a href={r.url} target="_blank" rel="noopener noreferrer">{r.url.replace(/^https:\/\//, '')}</a></dd>
          </React.Fragment>
        ))}
        {[...files].map(([file, v]) => (
          <React.Fragment key={file}>
            <dt>KiCad</dt>
            <dd>{file} (board file format {v}), read on this device</dd>
          </React.Fragment>
        ))}
        {placeholder > 0 && (<><dt>KiCad tmpl</dt><dd>{placeholder} value{placeholder > 1 ? 's' : ''} in the file that KiCad's template fills in by default: check them against the fab's numbers</dd></>)}
        {absent > 0 && (<><dt>KiCad dflt</dt><dd>{absent} value{absent > 1 ? 's' : ''} not in the file: KiCad's default stands in</dd></>)}
        {typed > 0 && (<><dt>typed</dt><dd>{typed} value{typed > 1 ? 's' : ''} typed on this page</dd></>)}
        {notes.length > 0 && (<><dt>*</dt><dd>{notes.map((n, i) => <div key={i}>{n}</div>)}</dd></>)}
      </dl>
    </div>
  );
}

function ClassCard({ c, unit, digits }: { c: NetClass; unit: LengthUnit; digits: number }) {
  const rows: [keyof NetClass, string][] = [
    ['trackWidth', 'Track width'], ['clearance', 'Clearance'], ['diffPairWidth', 'Pair width'], ['diffPairGap', 'Pair gap'],
    ['viaDiameter', 'Via Ø'], ['viaDrill', 'Via drill'],
  ];
  const mm = (k: keyof NetClass) => { const x = c[k] as Val | null; return x ? String(x.v) : ''; };
  return (
    <div className={css.classCard} data-class={c.name} data-track={mm('trackWidth')} data-clearance={mm('clearance')} data-pair-width={mm('diffPairWidth')} data-pair-gap={mm('diffPairGap')}>
      <p className={css.className}>{c.name}</p>
      <dl>
        {rows.map(([k, label]) => {
          const x = c[k] as Val | null;
          const inherited = c.fromDefault.includes(k as string);
          return (
            <React.Fragment key={k}>
              <dt>{label}{inherited && <span className={css.fromDefault}> (Default)</span>}</dt>
              <dd>{x ? `${lenText(x.v, unit, digits)}${x.tol ? ` ${tolText(x.tol, unit, digits)}` : ''}` : '–'}</dd>
            </React.Fragment>
          );
        })}
      </dl>
    </div>
  );
}

interface Props {
  setup: Setup;
  commit: Commit;
  unit: LengthUnit;
  digits: number;
  kicad: KicadState;
  setKicad: React.Dispatch<React.SetStateAction<KicadState>>;
}

export default function StackupSection({ setup, commit, unit, digits, kicad, setKicad }: Props) {
  const s = setup.stackup;
  const [active, setActive] = useState(-1);
  const [widen, setWiden] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState('');
  const [fileError, setFileError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const isPreset = PRESET_NAMES.has(s.id);
  const edited = useMemo(() => isPreset && !sameStackup(s, presetStackup(s.id)), [s, isPreset]);
  const issues = useMemo(() => stackupIssues(s), [s]);
  const total = totalThickness(s);
  const copper = s.layers.filter((l) => l.kind === 'copper').length;
  const fromKicad = s.layers.some((l) => (l.kind === 'copper' ? l.t : l.kind === 'mask' ? l.er : l.t).src.kind === 'kicad');

  const onVal = (i: number, key: string, x: Val | null, part: 'v' | 'tol') => commit((cur) => withStackup(cur, editLayer(cur.stackup, i, key, x)), `${i}.${key}.${part}`);

  const openFiles = async (list: FileList | File[]) => {
    const files = [...list];
    if (!files.length) return;
    setFileError('');
    setBusy(files.map((f) => f.name).join(', '));
    try {
      // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
      const k = (await import('../../lib/emsim/kicad')) as typeof import('../../lib/emsim/kicad');
      const refused: string[] = [];
      for (const f of files) {
        const text = await f.text();
        const pro = /\.kicad_pro$/i.test(f.name) || (!/\.kicad_pcb$/i.test(f.name) && text.trimStart().startsWith('{'));
        if (pro) {
          const p: KicadProject = k.readKicadProject(text, f.name);
          if (p.reason) refused.push(`${f.name}: ${p.reason}`);
          setKicad((cur) => ({ ...cur, project: { file: f.name, schema: p.schema, reason: p.reason, issues: p.issues, classes: p.classes } }));
        } else {
          const b: KicadBoard = k.readKicadStackup(text, f.name);
          if (b.stackup) commit((cur) => withStackup(cur, b.stackup));
          else refused.push(`${f.name}: ${b.reason}`);
          setKicad((cur) => ({ ...cur, board: { file: f.name, release: k.kicadRelease(b.version), version: b.version, reason: b.reason, issues: b.issues, ignored: b.ignored } }));
        }
      }
      if (refused.length) setFileError(refused.join(' '));
    } catch (e) {
      setFileError(`The file could not be read: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy('');
    }
  };

  const presetValue = isPreset ? s.id : '';
  return (
    <section id="stackup" className={base.section} aria-labelledby="stackup-h">
      <h2 id="stackup-h" className={base.h2}>Stackup</h2>
      <p className={base.lede}>
        The board's layers from top to bottom. Start from a JLCPCB stackup or open your KiCad board; every number can be
        typed over and shows where it comes from and its tolerance (type ±5 % or ±0.1 in the small field).
      </p>

      <div className={css.tools}>
        <label className={css.toolLabel}>
          Preset
          <select
            className={base.select}
            data-preset
            value={presetValue}
            onChange={(e) => { const p = presetStackup(e.target.value); if (p) commit((cur) => withStackup(cur, p)); }}
          >
            {!isPreset && <option value="">{fromKicad ? `From ${kicad.board?.file ?? 'a KiCad file'}` : s.name || 'Custom stackup'}</option>}
            {PRESET_IDS.map((id) => <option key={id} value={id}>{PRESET_NAMES.get(id)}</option>)}
          </select>
        </label>
        <div
          className={css.drop}
          data-over={over}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void openFiles(e.dataTransfer.files); }}
        >
          <button type="button" className={base.button} onClick={() => input.current?.click()}>Open KiCad files…</button>
          <span>{busy ? `Reading ${busy}…` : 'or drop a .kicad_pcb (stackup) and .kicad_pro (net classes) here. Read on this device; nothing is uploaded.'}</span>
          <input
            ref={input}
            className={css.fileInput}
            type="file"
            multiple
            accept=".kicad_pcb,.kicad_pro"
            data-kicad-input
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => { const fl = e.target.files; if (fl) void openFiles([...fl]); e.target.value = ''; }}
          />
        </div>
      </div>
      {fileError && <p className={css.reason} role="alert">{fileError}</p>}

      <p className={css.summary} data-stackup-summary data-layers={s.layers.length} data-copper={copper} data-total={total} data-preset-id={isPreset ? s.id : ''} data-edited={edited} data-source={fromKicad ? 'kicad' : isPreset ? 'preset' : 'typed'}>
        <b>{s.name || (fromKicad ? kicad.board?.file : 'Stackup')}</b>
        {edited && <span className={css.edited}>edited</span>}
        {' '}· {s.layers.length} layers, {copper} copper · total <b>{lenText(total, unit, digits)}</b>
        {s.thickness && Math.abs(s.thickness.v - total) > 1e-9 && <> (stated {lenText(s.thickness.v, unit, digits)})</>}
        {s.finish && <> · finish {s.finish}</>}
        {s.controlled && <> · impedance controlled</>}
      </p>

      <div className={css.layout}>
        <div className={css.figure}>
          <StackupDrawing s={s} unit={unit} digits={digits} widen={widen} active={active} />
          <div className={css.figTools}>
            <button type="button" className={base.button} aria-pressed={widen} data-widen-toggle onClick={() => setWiden((w) => !w)}>
              Widen thin layers
            </button>
          </div>
        </div>
        <div>
          <ol className={css.layers} aria-label="Layers, top to bottom">
            {s.layers.map((l, i) => (
              <LayerRow key={l.id} l={l} i={i} unit={unit} digits={digits} active={i === active} onVal={onVal} onActive={setActive} />
            ))}
          </ol>
          {issues.length > 0 && (
            <div className={base.notice} data-stackup-issues>
              <h3 className={base.h3}>About this stackup</h3>
              <IssueList issues={issues} />
            </div>
          )}
          <Sources s={s} />
          {kicad.board && (
            <div className={base.notice} data-kicad-board>
              <h3 className={base.h3}>{kicad.board.file}</h3>
              <p className={css.layerNote}>
                {kicad.board.reason ? kicad.board.reason : `Board file format ${kicad.board.version} (${kicad.board.release}).`}
                {kicad.board.ignored.length > 0 && ` Not used here: ${kicad.board.ignored.join(', ')}.`}
              </p>
              <IssueList issues={kicad.board.issues} />
            </div>
          )}
          {kicad.project && (
            <div className={base.notice} data-kicad-project>
              <h3 className={base.h3}>Net classes · {kicad.project.file}</h3>
              {kicad.project.reason
                ? <p className={css.reason}>{kicad.project.reason}</p>
                : <p className={css.layerNote}>For the trace editor (next on this page). Values marked (Default) are not set in the class; KiCad takes them from Default.</p>}
              <IssueList issues={kicad.project.issues} />
              <div className={css.classes}>
                {kicad.project.classes.map((c) => <ClassCard key={c.name} c={c} unit={unit} digits={digits} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
