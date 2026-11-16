// The Export section's Data group (step M8.2a, docs/em-sim/notes-M8.2a.md), in the Export chunk: the numbers behind
// the page's results as CSV (the trace's line results and matrices, the last sweep, the via model's results, its TDR
// and TDT, its S-parameters) and the via's S-parameters as Touchstone (.s2p, .s4p), from the raw results the
// sections hand to exportFeed.ts, so nothing is solved here; Copy puts the text on the clipboard, Save downloads it.
// Then the project file: Save project writes the setup as `.emsim.json` (project.ts); Open project reads one by the
// picker (a drop anywhere on the page goes through EmSimTool's own listener) with EmSimTool's openText, which commits
// the setup as one undo step; its note shows here. Copy link copies the page's address, which holds the setup.
//   The root carries `emsimData.last()` for the harness (ui-data.mjs): the inputs of the last text made, in plain
// form, so Node can write the same file and compare it byte for byte.

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { sweepCsv, traceCsv, tdrCsv, sparamCsv, viaCsv } from '../../lib/emsim/export/csv';
import type { DataMeta } from '../../lib/emsim/export/csv';
import { TOUCHSTONE_FORMATS, touchstone, touchstoneExt, touchstoneRefusal } from '../../lib/emsim/export/touchstone';
import type { TouchstoneFormat } from '../../lib/emsim/export/touchstone';
import { encodeLink } from '../../lib/emsim/link';
import type { NPort } from '../../lib/emsim/nport';
import { PROJECT_EXTENSION, PROJECT_MAX_BYTES, projectJson } from '../../lib/emsim/project';
import type { Setup } from '../../lib/emsim/setup';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimExport.module.css';
import { useExportFeed } from './exportFeed';
import type { OpenText, OpenedNote } from './exportFeed';
import { jlcResolve } from './jlcData';
import { IssueList } from './StackupSection';
import { Whys } from './Why';

type Format = 'csv' | 'touchstone';
interface DataSet { id: string; label: string; file: string; raw: unknown; csv: (m: DataMeta) => string; nport?: NPort | null }

/** Downloads a Blob through a temporary link (revoked after 30 s); nothing leaves the device. */
export function download(blob: Blob, file: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** A value in plain JSON form for the harness: typed arrays as { ta, a }, numbers JSON has no form for as { num }. */
export function plain(x: unknown): unknown {
  if (typeof x === 'number') return Number.isFinite(x) ? x : { num: String(x) };
  if (ArrayBuffer.isView(x)) return { ta: x.constructor.name, a: Array.from(x as unknown as ArrayLike<number>, plain) };
  if (Array.isArray(x)) return x.map(plain);
  if (typeof x === 'function') return undefined;
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plain(v)]));
  return x;
}

const FORMATS: [Format, string][] = [['csv', 'CSV'], ['touchstone', 'Touchstone']];
const slug = (s: string) => s.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');

export default function DataExport({ setup, opened, openText }: { setup: Setup; opened: OpenedNote | null; openText: OpenText }) {
  const feed = useExportFeed();
  const [pick, setPick] = useState('trace');
  const [format, setFormat] = useState<Format>('csv');
  const [numbers, setNumbers] = useState<TouchstoneFormat>('RI');
  const [msg, setMsg] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const last = useRef<unknown>(null);

  const sets = useMemo<DataSet[]>(() => {
    const out: DataSet[] = [];
    const tr = feed.trace, sw = feed.sweepRun, v = feed.viaRun;
    if (tr) out.push({ id: 'trace', label: 'Trace: line results and matrices', file: 'trace-results', raw: tr, csv: (m) => traceCsv(tr, m) });
    if (sw) out.push({ id: 'sweep', label: `Sweep of ${sw.label}`, file: `sweep-${slug(sw.input)}`, raw: sw, csv: (m) => sweepCsv(sw, m) });
    if (v && v.ok) {
      out.push({ id: 'via', label: 'Via: model results', file: 'via-results', raw: v, csv: (m) => viaCsv(v, m) });
      if (v.tdr) out.push({ id: 'via-tdr', label: 'Via: TDR and TDT', file: 'via-tdr', raw: v, csv: (m) => tdrCsv(v, m) });
      if (v.nport) out.push({ id: 'via-s', label: v.n === 2 ? 'Via: S-parameters (4-port and mixed-mode)' : 'Via: S-parameters (2-port)', file: 'via-s-params', raw: v, csv: (m) => sparamCsv(v.nport, v.mixed, m), nport: v.nport });
    }
    return out;
  }, [feed.trace, feed.sweepRun, feed.viaRun]);
  const set = sets.find((s) => s.id === pick) ?? sets[0] ?? null;
  const tsWhy = set ? touchstoneRefusal(set.nport ?? null) : 'Nothing solved yet.';
  const fmt: Format = format === 'touchstone' && !tsWhy ? 'touchstone' : 'csv';

  useEffect(() => { setMsg(''); }, [set?.id, fmt, numbers]);
  useEffect(() => {
    const el = root.current as unknown as { emsimData?: { last: () => unknown } } | null;
    if (el) el.emsimData = { last: () => last.current };
  });

  /** The text of the chosen data and its file name, with the date and link it was made with recorded for the harness. */
  const make = (): { text: string; file: string; type: string } | null => {
    if (!set) return null;
    const date = new Date(), link = encodeLink(setup, jlcResolve);
    last.current = plain({ id: set.id, format: fmt, numbers, date: date.toISOString(), link, raw: set.raw });
    if (fmt === 'touchstone' && set.nport) return { text: touchstone(set.nport, { format: numbers, date, link }), file: `via${touchstoneExt(set.nport)}`, type: 'text/plain' };
    return { text: set.csv({ date, link }), file: `${set.file}.csv`, type: 'text/csv' };
  };
  const failed = (e: unknown) => setMsg(e instanceof DOMException && e.name === 'NotAllowedError' ? 'The browser did not allow the copy; use Save.' : e instanceof Error ? e.message : String(e));
  const copy = async () => {
    try {
      const m = make();
      if (!m) return;
      if (!navigator.clipboard) { setMsg('This browser gives the page no clipboard here; use Save.'); return; }
      await navigator.clipboard.writeText(m.text);
      setMsg(`${fmt === 'touchstone' ? 'Touchstone' : 'CSV'} copied (${m.text.split('\r\n').length - 1} lines).`);
    } catch (e) { failed(e); }
  };
  const save = () => {
    try {
      const m = make();
      if (!m) return;
      download(new Blob([m.text], { type: m.type }), m.file);
      setMsg(`Saved ${m.file}.`);
    } catch (e) { failed(e); }
  };

  const [pmsg, setPmsg] = useState('');
  const saveProject = () => {
    const text = projectJson(setup, undefined, jlcResolve);
    last.current = { id: 'project', text };
    download(new Blob([text], { type: 'application/json' }), `em-sim${PROJECT_EXTENSION}`);
    setPmsg(`Saved em-sim${PROJECT_EXTENSION}.`);
  };
  const openFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > PROJECT_MAX_BYTES) { setPmsg(`${f.name} was not opened: the file is too large to be a project of this tool.`); return; }
    f.text().then((t) => openText(t, f.name), (e) => setPmsg(`The file could not be read: ${e instanceof Error ? e.message : String(e)}`));
  };
  const copyLink = async () => {
    try {
      if (!navigator.clipboard) { setPmsg('This browser gives the page no clipboard here; the address bar has the same link.'); return; }
      await navigator.clipboard.writeText(window.location.href);
      setPmsg('Link copied: it opens this page with this setup.');
    } catch (e) { setPmsg(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => { if (opened) setPmsg(''); }, [opened]);

  return (
    <div ref={root} className={css.data} data-data-ready data-set={set ? set.id : ''} data-format={fmt}>
      <h3 className={base.h3} id="export-data">Data</h3>
      <p className={base.lede}>The numbers behind the results as CSV, the via’s S-parameters as Touchstone, and the whole setup as a project file. Made in your browser; nothing is sent anywhere.</p>
      <div className={css.controls}>
        <label className={css.ctl}>
          <span className={css.label}>Data</span>
          <select className={base.select} value={set ? set.id : ''} onChange={(e) => setPick(e.target.value)} disabled={!set} data-data-set>
            {sets.length ? sets.map((s) => <option key={s.id} value={s.id}>{s.label}</option>) : <option value="">Nothing solved yet</option>}
          </select>
        </label>
        <div className={css.ctl} role="group" aria-label="File format">
          <span className={css.label}>File</span>
          <span className={base.seg}>
            {FORMATS.map(([f, t]) => (
              <button key={f} type="button" aria-pressed={fmt === f} disabled={f === 'touchstone' && !!tsWhy} title={f === 'touchstone' && tsWhy ? `For the via’s S-parameters. ${tsWhy}` : undefined} onClick={() => setFormat(f)} data-data-format={f}>{t}</button>
            ))}
          </span>
        </div>
        <div className={css.ctl} role="group" aria-label="Touchstone numbers">
          <span className={css.label}>Numbers</span>
          <span className={base.seg}>
            {TOUCHSTONE_FORMATS.map((n) => <button key={n} type="button" aria-pressed={numbers === n} disabled={fmt !== 'touchstone'} onClick={() => setNumbers(n)} data-data-numbers={n}>{n === 'RI' ? 'Re, Im' : n === 'MA' ? 'Mag, angle' : 'dB, angle'}</button>)}
          </span>
        </div>
      </div>
      <Whys ks="data-set data-format data-numbers" />
      <div className={css.actions}>
        <button type="button" className={base.button} onClick={copy} disabled={!set} data-data-copy>Copy</button>
        <button type="button" className={base.button} onClick={save} disabled={!set} data-data-save>{fmt === 'touchstone' && set?.nport ? `Save ${touchstoneExt(set.nport)}` : 'Save .csv'}</button>
        <span className={css.msg} role="status" aria-live="polite" data-data-msg>{msg}</span>
      </div>
      <Whys ks="data-copy data-save" />
      {!sets.length && <p className={css.note} data-data-none>Results appear here once solved: the trace’s, a finished sweep’s and the via’s.</p>}

      <h3 className={`${base.h3} ${css.subhead}`} id="export-project">Project</h3>
      <div className={css.actions}>
        <button type="button" className={base.button} onClick={saveProject} data-project-save>Save project</button>
        <button type="button" className={base.button} onClick={() => fileInput.current?.click()} data-project-open>Open project…</button>
        <input ref={fileInput} type="file" accept={`${PROJECT_EXTENSION},.json,application/json`} hidden onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ''; }} data-project-input />
        <button type="button" className={base.button} onClick={copyLink} data-project-link>Copy link</button>
        <span className={css.msg} role="status" aria-live="polite" data-project-msg>{pmsg}</span>
      </div>
      <Whys ks="project-save project-open project-link" />
      <p className={css.note}>Or drop a project file anywhere on the page.</p>
      {opened && (
        <div className={`${base.notice} ${opened.ok ? '' : css.refused}`} role="status" data-project-note data-ok={opened.ok} key={opened.at}>
          {opened.ok
            ? <p className={css.noteText}>Opened {opened.name}{opened.issues.length ? ', with these notes:' : '.'} Undo goes back to the setup before.</p>
            : <p className={css.noteText}>{opened.name} was not opened: {opened.message}</p>}
          <IssueList issues={opened.issues} />
        </div>
      )}
    </div>
  );
}
