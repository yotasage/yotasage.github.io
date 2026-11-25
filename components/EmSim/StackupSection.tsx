// The Stackup section of the EM simulation page (M2.1a): presets (M1.8c: and every JLCPCB template, JlcPicker.tsx), KiCad files (.kicad_pcb: the stackup, .kicad_pro: the
// net classes; read on the device with File.text(), the reader loaded by import() when a file is opened), the drawing,
// the layer table with every value's source and tolerance (plan.md D8, D9), the stackup's issues and the sources.

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isJlcKey, jlcKey, jlcStackup } from '../../lib/emsim/jlcpcb';
import type { JlcData, JlcEntry } from '../../lib/emsim/jlcpcb';
import { PRESET_IDS, PRESET_KEYS, REFS, presetStackup } from '../../lib/emsim/presets';
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
import { jlcLoaded, jlcResolve, loadJlc } from './jlcData';
import StackupDrawing from './StackupDrawing';
import ValField from './ValField';
import { Why, Whys } from './Why';
import { withKind } from './trace';
import { useI18n } from '../../lib/ui/i18n';
import type { Locale, TFunc } from '../../lib/ui/i18n';
import {
  localizeEmLayerName,
  localizeEmMaterial,
  localizeEmRefWhat,
  localizeEmStackupName,
} from '../../lib/ui/localizeEmStackup';
import { lenText, numText, sourceTag, tolText } from './format';

export type Commit = (next: Setup | ((cur: Setup) => Setup), group?: string) => void;

// What the KiCad files gave (page state, not in the link: M2.1b's trace editor uses the classes).
export interface KicadState {
  board: { file: string; release: string; version: number; reason: string; issues: Issue[]; ignored: string[] } | null;
  project: { file: string; schema: number; reason: string; issues: Issue[]; classes: NetClass[] } | null;
}

export const NO_KICAD: KicadState = { board: null, project: null };

const PRESET_NAMES = new Map(PRESET_IDS.map((id) => [id, presetStackup(id)?.name ?? id]));
// A list entry that is a hand preset is chosen as the preset (its short id in the link, the quick select shows it).
const HAND_OF_KEY = new Map(Object.entries(PRESET_KEYS).map(([id, key]) => [key, id]));
// The picker is a chunk of its own, loaded when it is first opened (the list's data is another, jlcData.ts).
// @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
const JlcPicker = lazy(() => import('./JlcPicker'));

// A new stackup in a setup: the trace and via keep their layers when the copper layers are the same ids. When they are
// not, the trace keeps its kind and dimensions on the new stackup's layers (M2.1b; a microstrip of the same width when
// the kind does not fit), and the via is placed anew.
export function withStackup(prev: Setup, s: Stackup): Setup {
  if (copperIds(prev.stackup).join('\n') === copperIds(s).join('\n')) return { ...prev, stackup: s };
  const t = prev.trace;
  const trace = (t.kind !== 'general' && withKind(t, s, t.kind)) || withKind(t, s, 'microstrip') || presetStructure('microstrip', s, DEFAULT_TRACE_W);
  return { stackup: s, trace: trace ?? prev.trace, via: presetVia('single', s) ?? prev.via };
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
  const { t } = useI18n();
  if (!issues.length) return null;
  const lvl = (l: Issue['level']) => (l === 'warn' ? t('em.issue.warn') : l === 'error' ? t('em.issue.error') : t('em.issue.note'));
  return (
    <ul className={base.issues}>
      {issues.map((x, i) => (
        <li key={i} data-issue={x.code}><span className={base.level} data-level={x.level}>{lvl(x.level)}</span>{x.message}</li>
      ))}
    </ul>
  );
}

function kindText(l: Layer, t: TFunc, locale: Locale): string {
  const mat = l.kind !== 'copper' && l.material ? localizeEmMaterial(l.material, locale) : '';
  if (l.kind === 'mask') return `${t('em.stk.kindMask')}${mat ? ` · ${mat}` : ''}`;
  if (l.kind === 'copper') return t('em.stk.kindCopper');
  const role = l.role === 'core' ? t('em.stk.roleCore') : t('em.stk.rolePrepreg');
  return `${role}${mat ? ` · ${mat}` : ''}`;
}

function swatch(l: Layer): string {
  return l.kind === 'copper' ? 'var(--copper)' : l.kind === 'mask' ? 'var(--mask)' : l.role === 'core' ? 'var(--core)' : 'var(--prepreg)';
}

function freqText(f: number | null, t: TFunc): string {
  if (f === null) return t('em.stk.freqNone');
  return f >= 1e9 ? t('em.stk.freqAt', { val: numText(f / 1e9, 4), unit: 'GHz' }) : t('em.stk.freqAt', { val: numText(f / 1e6, 4), unit: 'MHz' });
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
  const { t, locale } = useI18n();
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
      f('onLaminate', t('em.stk.onLaminate'), l.onLaminate, { length: true, zero: true }),
      f('onCopper', t('em.stk.onCopper'), l.onCopper, { length: true, zero: true }),
      f('between', t('em.stk.between'), l.between, { length: true, zero: true }),
      f('er', 'εr', l.er, { min: 1 }),
      f('tand', 'tanδ', l.tand, { nullable: true, min: 0, max: 1 }),
    ];
    note = t('em.stk.erNote', { freq: freqText(l.freq, t) });
  } else if (l.kind === 'copper') {
    fields = [f('t', t('em.stk.thickness'), l.t, { length: true })];
    const parts: string[] = [];
    if (l.base && l.plating) parts.push(t('em.stk.basePlating', { base: lenText(l.base.v, unit, digits), plating: lenText(l.plating.v, unit, digits) }));
    if (l.calc) parts.push(t('em.stk.fabCalcUses', { val: lenText(l.calc.v, unit, digits) }));
    if (l.etch.kind === 'offset') parts.push(t('em.stk.etchedSide', { val: lenText(l.etch.side.v, unit, digits) }));
    else if (l.etch.kind === 'factor') parts.push(t('em.stk.etchFactor', { val: numText(l.etch.f.v, digits) }));
    else parts.push(t('em.stk.noEtch'));
    note = parts.join(' · ');
  } else {
    fields = [
      f('t', t('em.stk.thickness'), l.t, { length: true }),
      f('er', 'εr', l.er, { min: 1 }),
      f('tand', 'tanδ', l.tand, { nullable: true, min: 0, max: 1 }),
    ];
    note = t('em.stk.erNote', { freq: freqText(l.freq, t) });
  }
  return (
    <li className={css.row} data-layer={l.id} data-layer-kind={l.kind} data-active={active} onPointerDown={() => onActive(i)}>
      <span className={css.swatch} style={{ background: swatch(l) }} aria-hidden="true" />
      <div className={css.rowBody}>
        <div className={css.rowHead}>
          <span className={css.layerName}>{localizeEmLayerName(l.name || l.id, locale)}</span>
          <span className={css.layerKind}>{kindText(l, t, locale)}</span>
        </div>
        <div className={css.fields}>{fields}</div>
        {note && <p className={css.layerNote}>{note}</p>}
      </div>
    </li>
  );
}

// Where the numbers come from: the presets' references with date and URL, the KiCad files, typed values, notes.
function Sources({ s }: { s: Stackup }) {
  const { t, locale } = useI18n();
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
      <h3 className={base.h3}>{t('em.stk.sources')}</h3>
      <Why k="sources" bare />
      <dl>
        {[...refs].map(([ref, r]) => (
          <React.Fragment key={ref}>
            <dt>{ref}</dt>
            <dd>{t('em.stk.sourcePreset', { what: localizeEmRefWhat(ref, REFS[ref]?.what ?? ref, locale), date: r.date })}<a href={r.url} target="_blank" rel="noopener noreferrer">{r.url.replace(/^https:\/\//, '')}</a></dd>
          </React.Fragment>
        ))}
        {[...files].map(([file, v]) => (
          <React.Fragment key={file}>
            <dt>KiCad</dt>
            <dd>{t('em.stk.sourceKicad', { file, ver: v })}</dd>
          </React.Fragment>
        ))}
        {placeholder > 0 && (<><dt>{sourceTag({ kind: 'kicad', file: '', version: 0, placeholder: true }, locale).text}</dt><dd>{placeholder === 1 ? t('em.stk.sourceTmplOne') : t('em.stk.sourceTmplMany', { n: placeholder })}</dd></>)}
        {absent > 0 && (<><dt>{sourceTag({ kind: 'kicad', file: '', version: 0, absent: true }, locale).text}</dt><dd>{absent === 1 ? t('em.stk.sourceDfltOne') : t('em.stk.sourceDfltMany', { n: absent })}</dd></>)}
        {typed > 0 && (<><dt>{sourceTag({ kind: 'typed' }, locale).text}</dt><dd>{typed === 1 ? t('em.stk.sourceTypedOne') : t('em.stk.sourceTypedMany', { n: typed })}</dd></>)}
        {notes.length > 0 && (<><dt>*</dt><dd>{notes.map((n, i) => <div key={i}>{n}</div>)}</dd></>)}
      </dl>
    </div>
  );
}

function ClassCard({ c, unit, digits }: { c: NetClass; unit: LengthUnit; digits: number }) {
  const { t } = useI18n();
  const rows: [keyof NetClass, string][] = [
    ['trackWidth', t('em.stk.nc.trackWidth')], ['clearance', t('em.stk.nc.clearance')], ['diffPairWidth', t('em.stk.nc.diffPairWidth')], ['diffPairGap', t('em.stk.nc.diffPairGap')],
    ['viaDiameter', t('em.stk.nc.viaDiameter')], ['viaDrill', t('em.stk.nc.viaDrill')],
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
              <dt>{label}{inherited && <span className={css.fromDefault}>{t('em.stk.fromDefault')}</span>}</dt>
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
  const { t, locale } = useI18n();
  const s = setup.stackup;
  const [active, setActive] = useState(-1);
  const [widen, setWiden] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState('');
  const [fileError, setFileError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const [picker, setPicker] = useState(false);
  const [jlc, setJlc] = useState<JlcData | null>(jlcLoaded());
  const opener = useRef<HTMLButtonElement>(null);

  // A list stackup (its id is a key) counts as a preset: unedited while equal to jlcStackup of its entry, which needs
  // the list; it is loaded here when such a stackup comes from a link of layers or the history.
  const isHand = PRESET_NAMES.has(s.id);
  const isList = !isHand && isJlcKey(s.id);
  const isPreset = isHand || isList;
  useEffect(() => {
    if (isList && !jlc) loadJlc().then(setJlc, () => { /* shown as not edited; the picker says why when opened */ });
  }, [isList, jlc]);
  const edited = useMemo(() => {
    const pristine = isHand ? presetStackup(s.id) : isList && jlc ? jlcResolve(s.id) : null;
    return !!pristine && !sameStackup(s, pristine);
  }, [s, isHand, isList, jlc]);
  const closePicker = useCallback(() => { setPicker(false); opener.current?.focus(); }, []);
  const pick = (e: JlcEntry, data: JlcData) => {
    const hand = HAND_OF_KEY.get(jlcKey(e));
    const next = (hand && presetStackup(hand)) || jlcStackup(e, data);
    commit((cur) => withStackup(cur, next));
    closePicker();
  };
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
      setFileError(t('em.stk.readErr', { err: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy('');
    }
  };

  const presetValue = isHand ? s.id : '';
  return (
    <section id="stackup" className={base.section} aria-labelledby="stackup-h">
      <h2 id="stackup-h" className={base.h2}>{t('em.stk.title')}</h2>
      <p className={base.lede}>{t('em.stk.lede')}</p>

      <div className={css.tools}>
        <label className={css.toolLabel}>
          {t('em.stk.preset')}
          <select
            className={base.select}
            data-preset
            value={presetValue}
            onChange={(e) => { const p = presetStackup(e.target.value); if (p) commit((cur) => withStackup(cur, p)); }}
          >
            {!isHand && <option value="">{isList ? localizeEmStackupName(s.name, locale) : fromKicad ? t('em.stk.fromKicad', { file: kicad.board?.file ?? t('em.stk.aKicadFile') }) : localizeEmStackupName(s.name, locale) || t('em.stk.custom')}</option>}
            {PRESET_IDS.map((id) => <option key={id} value={id}>{localizeEmStackupName(PRESET_NAMES.get(id) ?? id, locale)}</option>)}
          </select>
        </label>
        <button
          ref={opener}
          type="button"
          className={base.button}
          aria-expanded={picker}
          aria-controls="jlc-picker"
          data-jlc-open
          onClick={() => (picker ? closePicker() : setPicker(true))}
        >
          {t('em.stk.allJlc')}
        </button>
        <div
          className={css.drop}
          data-over={over}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void openFiles(e.dataTransfer.files); }}
        >
          <button type="button" className={base.button} onClick={() => input.current?.click()}>{t('em.stk.openKicad')}</button>
          <span>{busy ? t('em.stk.reading', { files: busy }) : t('em.stk.dropHint')}</span>
          <input
            ref={input}
            className={css.fileInput}
            type="file"
            multiple
            accept=".kicad_pcb,.kicad_pro"
            data-kicad-input
            hidden
            onChange={(e) => { const fl = e.target.files; if (fl) void openFiles([...fl]); e.target.value = ''; }}
          />
        </div>
      </div>
      <Whys ks="preset jlc-open kicad" />
      {fileError && <p className={css.reason} role="alert">{fileError}</p>}
      {picker && (
        <div id="jlc-picker">
          <Suspense fallback={<p className={`${base.notice} ${css.layerNote}`} role="status" data-jlc-loading>{t('em.stk.loadingList')}</p>}>
            <JlcPicker current={PRESET_KEYS[s.id] ?? s.id} unit={unit} digits={digits} onPick={pick} onClose={closePicker} onLoaded={setJlc} />
          </Suspense>
        </div>
      )}

      <p className={css.summary} data-stackup-summary data-layers={s.layers.length} data-copper={copper} data-total={total} data-preset-id={isPreset ? s.id : ''} data-edited={edited} data-list={isList} data-source={fromKicad ? 'kicad' : isPreset ? 'preset' : 'typed'}>
        <b>{s.name ? localizeEmStackupName(s.name, locale) : (fromKicad ? kicad.board?.file : t('em.stk.title'))}</b>
        {edited && <span className={css.edited}>{t('em.stk.edited')}</span>}
        {t('em.stk.summaryStats', { layers: s.layers.length, copper })}<b>{lenText(total, unit, digits)}</b>
        {s.thickness && Math.abs(s.thickness.v - total) > 1e-9 && <>{t('em.stk.stated', { val: lenText(s.thickness.v, unit, digits) })}</>}
        {s.finish && <>{t('em.stk.finish', { finish: s.finish })}</>}
        {s.controlled && <>{t('em.stk.controlled')}</>}
      </p>
      <Why k="summary" bare />

      <div className={css.layout}>
        <div className={css.figure}>
          <StackupDrawing s={s} unit={unit} digits={digits} widen={widen} active={active} />
          <div className={css.figTools}>
            <button type="button" className={base.button} aria-pressed={widen} data-widen-toggle onClick={() => setWiden((w) => !w)}>
              {t('em.stk.widen')}
            </button>
          </div>
          <Whys ks="stackup-drawing stackup-widen" />
        </div>
        <div>
          <ol className={css.layers} aria-label={t('em.stk.layersAria')}>
            {s.layers.map((l, i) => (
              <LayerRow key={l.id} l={l} i={i} unit={unit} digits={digits} active={i === active} onVal={onVal} onActive={setActive} />
            ))}
          </ol>
          <Whys ks="diel-t er tand er-freq cu-t calc-t etch mask-laminate mask-copper mask-between mask-er tol src" />
          {issues.length > 0 && (
            <div className={base.notice} data-stackup-issues>
              <h3 className={base.h3}>{t('em.stk.about')}</h3>
              <Why k="stackup-issues" bare />
              <IssueList issues={issues} />
            </div>
          )}
          <Sources s={s} />
          {kicad.board && (
            <div className={base.notice} data-kicad-board>
              <h3 className={base.h3}>{kicad.board.file}</h3>
              <Why k="kicad-board" bare />
              <p className={css.layerNote}>
                {kicad.board.reason ? kicad.board.reason : t('em.stk.kicadFmt', { ver: kicad.board.version, rel: kicad.board.release })}
                {kicad.board.ignored.length > 0 && t('em.stk.kicadIgnored', { items: kicad.board.ignored.join(', ') })}
              </p>
              <IssueList issues={kicad.board.issues} />
            </div>
          )}
          {kicad.project && (
            <div className={base.notice} data-kicad-project>
              <h3 className={base.h3}>{t('em.stk.netClassesTitle', { file: kicad.project.file })}</h3>
              <Why k="net-classes" bare />
              {kicad.project.reason
                ? <p className={css.reason}>{kicad.project.reason}</p>
                : <p className={css.layerNote}>{t('em.stk.netClassesHint')}</p>}
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
