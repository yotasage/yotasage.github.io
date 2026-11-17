// The Export section's Report group (step M8.2b, docs/em-sim/notes-M8.2b.md), in the Export chunk: paper size, what to
// include, and Print report. The report itself is built only while printing (Print report, or the browser's own Print:
// `beforeprint`, rendered at once with flushSync; dropped again on `afterprint`), so a drag never pays for it. It is a
// portal straight under <body> with a <style> that, in print only, hides the whole app (#__next: the bar, the nav, the
// controls, the short lines, the status note, the site footer) and sets @page to the paper; on screen it is never
// shown. Light whatever the page's theme: its own colours (not the page's variables) and the figure model's colour
// mode, every drawing and plot an inline SVG (vectors) at its size in mm. Nothing is solved here: the numbers are the
// ones the sections handed to exportFeed.ts, with their errors and the page's digits (qText); nothing is uploaded.
//   Harness hooks (ui-report.mjs): [data-report] with data-paper, tr[data-report-layer], [data-report-q] and
// [data-report-via] with data-v, data-e and the shown text, [data-report-fig] around each SVG.

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';

import { fullLink } from '../../lib/emsim/export/csv';
import { stackupFigure, sectionFigure, viaSideFigure, viaTopFigure } from '../../lib/emsim/figure/board';
import type { Figure, FigureOptions } from '../../lib/emsim/figure/model';
import { plotFigure } from '../../lib/emsim/figure/plot';
import { figureSvg } from '../../lib/emsim/figure/svg';
import type { Q } from '../../lib/emsim/lines';
import { setupSection } from '../../lib/emsim/lines';
import { encodeLink } from '../../lib/emsim/link';
import type { Setup } from '../../lib/emsim/setup';
import type { Layer, Source, Stackup, Val } from '../../lib/emsim/stackup';
import { TRACE_KINDS } from '../../lib/emsim/structure';
import { realStubs } from '../../lib/emsim/viaGeom';
import type { ViaModelResult } from '../../lib/emsim/viamodel';
import base from '../../styles/EmSim.module.css';
import xcss from '../../styles/EmSimExport.module.css';
import css from '../../styles/EmSimReport.module.css';
import { mapInput } from './ExportSection';
import { useExportFeed } from './exportFeed';
import type { ExportFeed, FedCalc } from './exportFeed';
import type { Painted } from './fieldPaint';
import { lenText, numText, sourceTag, tolText } from './format';
import type { ShownUnit } from './format';
import { jlcResolve } from './jlcData';
import { FLOOR, qText } from './trace';
import { ASSUME_TEXT, pieceRows } from './ViaResults';
import { Whys } from './Why';

type Paper = 'a4' | 'letter';
type Part = 'stackup' | 'trace' | 'via' | 'fields' | 'plots' | 'calc';
const PAPERS: [Paper, string, string][] = [['a4', 'A4', 'A4'], ['letter', 'Letter', 'letter']];
const PARTS: [Part, string][] = [['stackup', 'Stackup'], ['trace', 'Trace'], ['via', 'Via'], ['fields', 'Field maps'], ['plots', 'Plots'], ['calc', 'Calculators']];
const DRAW_W = 120, PLOT_W = 160, MAX_H = 150; // mm: drawings, plots, the tallest figure (a figure and its caption fit a page)
const usable = (p: Painted | null): p is Painted => !!p && (!!p.values || p.lines.length > 0 || p.contours.length > 0);

/** The paper most people near the browser's language use: Letter in the US, Canada, Mexico and the Philippines. */
function localPaper(): Paper {
  try { return /^[a-z]{2,3}-(US|CA|MX|PH)\b/i.test(navigator.language) ? 'letter' : 'a4'; } catch { return 'a4'; }
}

export default function Report({ setup, unit, digits }: { setup: Setup; unit: ShownUnit; digits: number }) {
  const feed = useExportFeed();
  const [paper, setPaper] = useState<Paper>(localPaper);
  const [off, setOff] = useState<Part[]>([]);
  const [printing, setPrinting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // The browser's own Print (Ctrl+P, the menu) prints the report too, built before the print layout is taken.
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  const has: Record<Part, boolean> = {
    stackup: true, trace: true, via: true,
    fields: usable(feed.traceMap) || usable(feed.viaSide) || usable(feed.viaTop),
    plots: feed.via.length + feed.sweep.length > 0,
    calc: !!feed.calc && feed.calc.setup === setup,
  };
  const parts = PARTS.map(([p]) => p).filter((p) => has[p] && !off.includes(p));
  const toggle = (p: Part) => setOff((o) => (o.includes(p) ? o.filter((x) => x !== p) : [...o, p]));
  const print = () => {
    flushSync(() => setPrinting(true));
    window.print();
  };

  return (
    <div className={css.group} data-report-ready data-paper={paper} data-parts={parts.join(' ')} data-printing={printing}>
      <h3 className={`${base.h3} ${xcss.subhead}`} id="export-report">Report</h3>
      <p className={base.lede}>Everything above on paper: the stackup, the trace and the via with every result and its error, the drawings and plots. Print it, or choose “Save as PDF” in the print dialog.</p>
      <div className={xcss.controls}>
        <div className={xcss.ctl} role="group" aria-label="Paper">
          <span className={xcss.label}>Paper</span>
          <span className={base.seg}>
            {PAPERS.map(([p, t]) => <button key={p} type="button" aria-pressed={paper === p} onClick={() => setPaper(p)} data-report-paper={p}>{t}</button>)}
          </span>
        </div>
        <fieldset className={css.parts}>
          <legend className={xcss.label}>Include</legend>
          {PARTS.map(([p, t]) => (
            <label key={p} className={css.pick}>
              <input type="checkbox" checked={has[p] && !off.includes(p)} disabled={!has[p]} onChange={() => toggle(p)} data-report-part={p} />
              {t}
            </label>
          ))}
        </fieldset>
      </div>
      <Whys ks="report-paper report-parts" />
      <div className={xcss.actions}>
        <button type="button" className={base.button} onClick={print} data-report-print>Print report</button>
        <span className={xcss.msg}>{has.fields ? '' : 'Field maps join once “Show the fields” has drawn them. '}{has.plots ? '' : 'Plots join once the via has solved or a sweep has run.'}</span>
      </div>
      <Whys ks="report-print" />
      {mounted && printing && createPortal(<ReportBody setup={setup} unit={unit} digits={digits} paper={paper} parts={parts} feed={feed} />, document.body)}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The report

interface BodyProps { setup: Setup; unit: ShownUnit; digits: number; paper: Paper; parts: Part[]; feed: ExportFeed }

const two = (n: number) => String(n).padStart(2, '0');
const dateText = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;

/** A figure at `width` mm in colour, made narrower when it would be taller than MAX_H; '' (and the reason) when it fails. */
function svgOf(id: string, make: (o: FigureOptions) => Figure, width: number): { svg: string; reason: string } {
  try {
    let f = make({ width, colour: 'colour' });
    if (f.height > MAX_H) f = make({ width: Math.max(40, (width * MAX_H) / f.height), colour: 'colour' });
    return { svg: figureSvg(f, { id: `rpt-${id}` }), reason: '' };
  } catch (e) {
    return { svg: '', reason: e instanceof Error ? e.message : String(e) };
  }
}

function Fig({ id, caption, make, width = DRAW_W }: { id: string; caption: string; make: (o: FigureOptions) => Figure; width?: number }) {
  const { svg, reason } = svgOf(id, make, width);
  return (
    <figure className={css.fig} data-report-fig={id}>
      {svg ? <div className={css.svg} dangerouslySetInnerHTML={{ __html: svg }} /> : <p className={css.small}>This figure could not be drawn: {reason}</p>}
      <figcaption className={css.cap}>{caption}</figcaption>
    </figure>
  );
}

/** A value with its error as the page shows it: "50.12 ± 0.03". */
function vt(v: number, e: number, floor: number, scale = 1): string {
  const t = qText(v, e, floor, scale);
  return t.e ? `${t.v} ± ${t.e}` : t.v;
}

function QRow({ k, label, q, unit, floor, scale = 1, note, attr = 'q' }: { k: string; label: React.ReactNode; q: { v: number; e: number }; unit: string; floor: number; scale?: number; note?: string; attr?: 'q' | 'via' }) {
  const a = attr === 'q' ? { 'data-report-q': k } : { 'data-report-via': k };
  return (
    <tr {...a} data-v={q.v} data-e={q.e}>
      <th scope="row">{label}</th>
      <td className={css.num} data-report-text>{vt(q.v, q.e, floor, scale)}</td>
      <td>{unit}</td>
      <td className={css.note}>{note ?? ''}</td>
    </tr>
  );
}

const QHead = () => <thead><tr><th>Quantity</th><th>Value ± error</th><th>Unit</th><th>Note</th></tr></thead>;

function ReportBody({ setup, unit, digits, paper, parts, feed }: BodyProps) {
  const on = (p: Part) => parts.includes(p);
  const now = useMemo(() => new Date(), []);
  const link = useMemo(() => fullLink(encodeLink(setup, jlcResolve)), [setup]);
  const len = (mm: number) => lenText(mm, unit, 3);
  const num = (v: number) => numText(v, 3);
  const page = paper === 'letter' ? 'letter' : 'A4';
  const calc = feed.calc && feed.calc.setup === setup ? feed.calc : null;
  return (
    <div className={css.sheet} data-report data-paper={paper} lang="en">
      <style>{`@page { size: ${page} portrait; margin: 14mm 15mm 16mm; @bottom-right { content: counter(page) " / " counter(pages); font: 8pt sans-serif; color: #6c6861; } }
@media print { html, body { background: #fff !important; } body > #__next { display: none !important; } }`}</style>
      <header className={css.head}>
        <h1 className={css.h1}>EM simulation report</h1>
        <p className={css.meta}>{dateText(now)} · yotasage.github.io/em-sim</p>
        <p className={css.link}>Setup: <span data-report-link>{link}</span></p>
        <p className={css.about} data-report-about>
          These are quasi-static field solutions: no losses, and the same at every frequency; a via is lines and lumped
          capacitances. Each value carries the solver’s own error estimate, not the board’s tolerances. A careful
          estimate: for an order, your board house’s own figures have the last word.
        </p>
      </header>
      {on('stackup') && <StackupPart s={setup.stackup} unit={unit} digits={digits} len={len} num={num} />}
      {on('trace') && <TracePart setup={setup} unit={unit} digits={digits} len={len} num={num} feed={feed} maps={on('fields')} />}
      {on('via') && <ViaPart setup={setup} unit={unit} digits={digits} len={len} num={num} feed={feed} maps={on('fields')} />}
      {on('plots') && (
        <section className={css.part}>
          <h2 className={css.h2}>Plots</h2>
          {[...feed.via, ...feed.sweep].map((p) => <Fig key={p.id} id={p.id} caption={p.label} make={(o) => plotFigure(p.spec, o)} width={PLOT_W} />)}
        </section>
      )}
      {on('calc') && calc && <CalcPart c={calc} />}
    </div>
  );
}

// ---- the stackup ----

type Len = (mm: number) => string;
const valLen = (x: Val, unit: ShownUnit, digits: number) => `${lenText(x.v, unit, digits)}${x.tol ? ` ${tolText(x.tol, unit, digits)}` : ''}`;
const valNum = (x: Val | null, digits: number) => (x ? `${numText(x.v, digits)}${x.tol ? ` ${tolText(x.tol, null, digits)}` : ''}` : '–');
const srcKey = (s: Source) => (s.kind === 'preset' ? `p:${s.ref}` : s.kind === 'kicad' ? `k:${s.file}` : 'typed');

function layerSources(l: Layer): Source[] {
  const vs: (Val | null)[] = l.kind === 'mask' ? [l.er, l.tand, l.onLaminate, l.onCopper, l.between] : l.kind === 'copper' ? [l.t, l.base, l.plating, l.calc] : [l.t, l.er, l.tand];
  const out: Source[] = [];
  for (const v of vs) if (v && !out.some((s) => srcKey(s) === srcKey(v.src))) out.push(v.src);
  return out;
}

function StackupPart({ s, unit, digits, len, num }: { s: Stackup; unit: ShownUnit; digits: number; len: Len; num: (v: number) => string }) {
  const all: Source[] = [];
  for (const l of s.layers) for (const x of layerSources(l)) if (!all.some((y) => srcKey(y) === srcKey(x))) all.push(x);
  return (
    <section className={css.part} data-report-part="stackup">
      <h2 className={css.h2}>Stackup</h2>
      <p className={css.p}>
        {s.name || 'Typed stackup'}{s.finish ? `, finish ${s.finish}` : ''}{s.thickness ? `, board ${valLen(s.thickness, unit, digits)}` : ''}{s.controlled ? ', impedance controlled' : ''}.
      </p>
      <table className={css.table} data-report-stackup={s.layers.length}>
        <thead><tr><th>Layer</th><th>Kind</th><th>Thickness</th><th>εr</th><th>tan δ</th><th>Source</th></tr></thead>
        <tbody>
          {s.layers.map((l) => (
            <tr key={l.id} data-report-layer={l.id}>
              <th scope="row">{l.name || l.id}</th>
              <td>{l.kind === 'mask' ? `Solder mask${l.material ? `, ${l.material}` : ''}` : l.kind === 'copper' ? 'Copper' : `${l.role === 'core' ? 'Core' : 'Prepreg'}${l.material ? `, ${l.material}` : ''}`}</td>
              <td className={css.num}>
                {l.kind === 'mask' ? <>on copper {valLen(l.onCopper, unit, digits)}<br />on laminate {valLen(l.onLaminate, unit, digits)}<br />between traces {valLen(l.between, unit, digits)}</>
                  : l.kind === 'copper' ? <>{valLen(l.t, unit, digits)}{l.base && l.plating ? <><br />foil {lenText(l.base.v, unit, digits)} + plating {lenText(l.plating.v, unit, digits)}</> : null}{l.calc ? <><br />calculator {lenText(l.calc.v, unit, digits)}</> : null}{l.etch.kind === 'offset' ? <><br />etch {lenText(l.etch.side.v, unit, digits)} per side</> : l.etch.kind === 'factor' ? <><br />etch factor {numText(l.etch.f.v, digits)}</> : null}</>
                    : valLen(l.t, unit, digits)}
              </td>
              <td className={css.num}>{l.kind === 'copper' ? '–' : <>{valNum(l.er, digits)}{l.freq ? <><br />at {numText(l.freq / 1e9, 3)} GHz</> : null}</>}</td>
              <td className={css.num}>{l.kind === 'copper' ? '–' : valNum(l.tand, digits)}</td>
              <td>{layerSources(l).map((x) => sourceTag(x).text).join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className={css.list} data-report-sources>
        {all.map((x) => (
          <li key={srcKey(x)}>
            {x.kind === 'preset' ? <>{x.ref}: {x.date ? `${x.date}, ` : ''}<span className={css.url}>{x.url}</span>{x.note ? ` (${x.note})` : ''}</>
              : x.kind === 'kicad' ? <>KiCad: {x.file}{x.absent ? ', KiCad’s default where the board states none' : ''}{x.placeholder ? ', a template value' : ''}</>
                : <>typed: values typed on the page</>}
          </li>
        ))}
      </ul>
      <Fig id="stackup" caption="The stackup (thin layers widened to be seen)." make={(o) => stackupFigure(s, { ...o, len, num })} />
    </section>
  );
}

// ---- the trace ----

function TracePart({ setup, unit, digits, len, num, feed, maps }: { setup: Setup; unit: ShownUnit; digits: number; len: Len; num: (v: number) => string; feed: ExportFeed; maps: boolean }) {
  const st = setup.trace, s = setup.stackup;
  const kind = TRACE_KINDS.find((k) => k.kind === st.kind);
  const lname = (id: string) => { const l = s.layers.find((x) => x.id === id); return l ? l.name || l.id : id; };
  const sec = setupSection(setup);
  const r = feed.trace;
  const perIn = unit === 'mil';
  const dUnit = perIn ? 'ps/in' : 'ps/mm', dScale = perIn ? 1e9 * 25.4 : 1e9;
  const pairKind = kind ? kind.signals === 2 : false;
  const pair = r && r.ok ? r.pair : null;
  return (
    <section className={css.part} data-report-part="trace">
      <h2 className={css.h2}>Trace</h2>
      <p className={css.p}>
        {kind ? kind.name : st.kind}{st.kind !== 'general' ? <> on {lname(st.layer)}{st.layer2 ? ` and ${lname(st.layer2)}` : ''}: width {valLen(st.w, unit, digits)}{pairKind ? `, ${st.kind === 'broadside' ? 'offset' : 'gap'} ${valLen(st.s, unit, digits)}` : ''}{kind && kind.coplanar ? `, ground gap ${valLen(st.g, unit, digits)}` : ''}{st.masked ? ', under solder mask' : ''}</> : ` of ${st.signals.length} traces`}.
      </p>
      {typeof sec === 'string' ? <p className={css.small}>No cross-section: {sec}</p> : (
        <>
          <Fig id="section" caption="The cross-section at true scale, with its dimensions." make={(o) => sectionFigure(s, st, sec, { ...o, len, num })} />
          {maps && usable(feed.traceMap) && <Fig id="section-map" caption="The cross-section with its field map, as the page drew it." make={(o) => sectionFigure(s, st, sec, { ...o, len, num, map: mapInput(feed.traceMap) })} />}
        </>
      )}
      <h3 className={css.h3}>Results</h3>
      {!r ? <p className={css.small} data-report-trace="none">No finished result yet: the Trace section shows one once its solve is done.</p> : !r.ok ? <p className={css.small}>Not solved: {r.reason}</p> : (
        <>
          <table className={css.table} data-report-trace={r.n}>
            <QHead />
            <tbody>
              {r.n === 1 && <>
                <QRow k="z0" label="Z0" q={r.lines[0].z0} unit="Ω" floor={FLOOR.ohm} note="√(L/C) of the line" />
                <QRow k="eeff" label="εeff" q={r.lines[0].eeff} unit="" floor={FLOOR.ratio} note="C/C0, C0 with every dielectric replaced by air" />
                <QRow k="delay" label="Delay" q={r.lines[0].delay} unit={dUnit} floor={FLOOR.delay} scale={dScale} />
              </>}
              {pair && <>
                <QRow k="zdiff" label="Zdiff" q={pair.zdiff} unit="Ω" floor={FLOOR.ohm} note="definition A: Zc11 + Zc22 − 2·Zc12" />
                <QRow k="zcm" label="Zcm" q={pair.zcm} unit="Ω" floor={FLOOR.ohm} note="definition A: (Zc11 + Zc22 + 2·Zc12) / 4" />
                <QRow k="zodd" label="Zodd" q={pair.zodd} unit="Ω" floor={FLOOR.ohm} note="Zdiff / 2" />
                <QRow k="zeven" label="Zeven" q={pair.zeven} unit="Ω" floor={FLOOR.ohm} note="2 · Zcm" />
                {!pair.symmetric && <QRow k="zdc" label="Zdc" q={pair.zdc} unit="Ω" floor={FLOOR.ohm} note="(Zc11 − Zc22) / 2: how unequal the lines are" />}
                <QRow k="zdiffB" label="Zdiff (B)" q={pair.zdiffB} unit="Ω" floor={FLOOR.ohm} note="driven by voltages: 4 / (Yc11 + Yc22 − 2·Yc12)" />
                <QRow k="zcmB" label="Zcm (B)" q={pair.zcmB} unit="Ω" floor={FLOOR.ohm} note="1 / (Yc11 + Yc22 + 2·Yc12)" />
                <QRow k="ztdr" label="Z_TDR" q={pair.ztdr} unit="Ω" floor={FLOOR.ohm} note="what a differential TDR with two 50 Ω sources reads" />
                <QRow k="kb" label="NEXT kb" q={{ v: pair.kb.v * 100, e: pair.kb.e * 100 }} unit="%" floor={FLOOR.pct} note="near-end, of a step on one line" />
                <QRow k="kf" label="FEXT kf" q={pair.kf} unit={dUnit} floor={FLOOR.delay} scale={dScale} note="far-end pulse = kf · length · dV/dt" />
              </>}
              {r.n > 1 && r.lines.map((l, k) => <QRow key={`z${k}`} k={`z0.${k + 1}`} label={`Z0 of line ${k + 1}`} q={l.z0} unit="Ω" floor={FLOOR.ohm} note="Zc_kk: the other lines carrying no current" />)}
              {r.n > 2 && r.lines.map((l, k) => <QRow key={`e${k}`} k={`eeff.${k + 1}`} label={`εeff of line ${k + 1}`} q={l.eeff} unit="" floor={FLOOR.ratio} />)}
              {r.n > 1 && r.modes.flatMap((m, k) => [
                <QRow key={`me${k}`} k={`mode${k + 1}.eeff`} label={`εeff ${m.label || `mode ${k + 1}`}`} q={m.eeff} unit="" floor={FLOOR.ratio} />,
                <QRow key={`md${k}`} k={`mode${k + 1}.delay`} label={`Delay ${m.label || `mode ${k + 1}`}`} q={m.delay} unit={dUnit} floor={FLOOR.delay} scale={dScale} />,
              ])}
            </tbody>
          </table>
          {pair && <p className={css.small}>Definition A is this tool’s default.{pair.symmetric ? ' For a symmetric pair the definitions give the same values.' : ' For an asymmetric pair the definitions differ.'}</p>}
          <div className={css.mats}>
            {r.matrices && <Mat title="C (pF/m)" m={r.matrices.C} e={r.matrices.errC} scale={1e12} floor={FLOOR.perM} />}
            {r.matrices && <Mat title="L (nH/m)" m={r.matrices.L} e={r.matrices.errL} scale={1e9} floor={FLOOR.perM} />}
            <Mat title="Zc (Ω)" m={r.Zc} e={r.errZc} scale={1} floor={FLOOR.ohm} />
          </div>
          {r.flags.length > 0 && <ul className={css.list} data-report-flags>{r.flags.map((f) => <li key={f.code}><b>{f.code}</b> {f.message}</li>)}</ul>}
          <p className={css.small}>
            Boundary elements, level M = {r.M}, {r.panels} panels; status {r.status}. The error is the solver’s estimate from its
            coarse and fine levels. Quasi-static: lossless copper and laminate, the same at every frequency.
          </p>
        </>
      )}
    </section>
  );
}

function Mat({ title, m, e, scale, floor }: { title: string; m: number[][]; e: number[][]; scale: number; floor: number }) {
  return (
    <table className={`${css.table} ${css.mat}`}>
      <caption className={css.matCap}>{title}</caption>
      <tbody>{m.map((row, i) => <tr key={i}>{row.map((x, j) => <td key={j} className={css.num}>{vt(x, e[i][j], floor, scale)}</td>)}</tr>)}</tbody>
    </table>
  );
}

// ---- the via ----

const ps = (s: number) => s * 1e12;

function ViaPart({ setup, unit, digits, len, num, feed, maps }: { setup: Setup; unit: ShownUnit; digits: number; len: Len; num: (v: number) => string; feed: ExportFeed; maps: boolean }) {
  const s = setup.stackup, v = setup.via, w = setup.trace.w.v;
  const lname = (id: string) => { const l = s.layers.find((x) => x.id === id); return l ? l.name || l.id : id; };
  const r: ViaModelResult | null = feed.viaRun && feed.viaRun.ok ? feed.viaRun : null;
  return (
    <section className={css.part} data-report-part="via">
      <h2 className={css.h2}>Via</h2>
      <p className={css.p}>
        {v.pitch ? `A pair at ${valLen(v.pitch, unit, digits)} pitch` : 'One via'}: barrel {lname(v.start)} to {lname(v.end)}, drill {valLen(v.drill, unit, digits)}, plating {valLen(v.plating, unit, digits)}; in on {lname(v.entry)}, out on {lname(v.exit)}{v.backdrill ? ', backdrilled' : ''}{v.returns.length ? `, ${v.returns.length} return via${v.returns.length === 1 ? '' : 's'}` : ''}.
      </p>
      <Fig id="via-side" caption="The via from the side at true scale." make={(o) => viaSideFigure(s, v, w, { ...o, len, num })} />
      {maps && usable(feed.viaSide) && <Fig id="via-side-map" caption="The via from the side with its field map." make={(o) => viaSideFigure(s, v, w, { ...o, len, num, map: mapInput(feed.viaSide) })} />}
      <Fig id="via-top" caption="The via from above at true scale." make={(o) => viaTopFigure(s, v, w, { ...o, len, num })} />
      {maps && usable(feed.viaTop) && <Fig id="via-top-map" caption="The via from above with its field map." make={(o) => viaTopFigure(s, v, w, { ...o, len, num, map: mapInput(feed.viaTop) })} />}
      <h3 className={css.h3}>Results</h3>
      {!r ? <p className={css.small} data-report-via-none>No finished result yet: the Via section shows one once its solve is done.</p> : <ViaNumbers r={r} s={s} setup={setup} unit={unit} digits={digits} />}
    </section>
  );
}

function ViaNumbers({ r, s, setup, unit, digits }: { r: ViaModelResult; s: Stackup; setup: Setup; unit: ShownUnit; digits: number }) {
  // The same errors as ViaResults: the barrel's from the cut, ΔC's from the axisymmetric solve, the section's from both.
  const pair = r.n === 2;
  const core = r.pieces.filter((p) => p.part === 'through').sort((a, b) => b.zTop - b.zBot - (a.zTop - a.zBot))[0] ?? r.pieces[0];
  const rel = Math.abs(r.barrel.zVacErr / r.barrel.zVac) || 0;
  const relD = pair ? Math.abs(r.barrel.zdiffVacErr / r.barrel.zdiffVac) || 0 : 0;
  const relC = pair ? Math.abs(r.barrel.zcmVacErr / r.barrel.zcmVac) || 0 : 0;
  const L = r.lumped;
  const dCe = r.nodes.reduce((a, n) => a + Math.abs(n.dCErr), 0) / r.n;
  const Ctot = L ? L.C[0][0] : NaN;
  const relSec = L ? 0.5 * (rel + (L.lineC * rel + dCe) / Ctot) : 0;
  const nodes = r.nodes.filter((n) => n.layer);
  const stubs = realStubs(s, setup.via, r.stubs);
  const q = (v: number, e: number) => ({ v, e });
  return (
    <>
      <table className={css.table} data-report-via-table>
        <QHead />
        <tbody>
          {pair ? <>
            <QRow attr="via" k="barrel-zdiff" label={`Barrel Zdiff (εr ${core.er})`} q={q(core.zdiff, core.zdiff * relD)} unit="Ω" floor={FLOOR.ohm} note="the barrel pair as a line in the core" />
            <QRow attr="via" k="barrel-zcm" label="Barrel Zcm" q={q(core.zcm, core.zcm * relC)} unit="Ω" floor={FLOOR.ohm} />
            {L && <QRow attr="via" k="section-zdiff" label="Via section Zdiff" q={q(L.zdiff, L.zdiff * (0.5 * relD + 0.5 * (L.lineC * relD + dCe) / Ctot))} unit="Ω" floor={FLOOR.ohm} note="the whole via as one element" />}
            {L && <QRow attr="via" k="section-zcm" label="Via section Zcm" q={q(L.zcm, L.zcm * (0.5 * relC + 0.5 * (L.lineC * relC + dCe) / Ctot))} unit="Ω" floor={FLOOR.ohm} />}
          </> : <>
            <QRow attr="via" k="barrel-z" label={`Barrel Z (εr ${core.er})`} q={q(core.z0, core.z0 * rel)} unit="Ω" floor={FLOOR.ohm} note="the barrel as a line in the core" />
            {L && <QRow attr="via" k="section-z" label="Via section √(L/C)" q={q(L.z, L.z * relSec)} unit="Ω" floor={FLOOR.ohm} note="the whole via as one element" />}
          </>}
          {L && <QRow attr="via" k="delay" label="Delay through" q={q(ps(L.delay), ps(L.delay) * relSec)} unit="ps" floor={0.01} />}
          {L && <QRow attr="via" k="L" label={pair ? 'L (each via)' : 'L'} q={q(L.L[0][0] * 1e9, L.L[0][0] * 1e9 * rel)} unit="nH" floor={0.001} />}
          {L && <QRow attr="via" k="C" label={pair ? 'C (each via)' : 'C'} q={q(Ctot * 1e15, (L.lineC * rel + dCe) * 1e15)} unit="fF" floor={0.1} note={`of which pads and planes ${qText(L.dCsum * 1e15, dCe * 1e15, 0.1).v} fF`} />}
        </tbody>
      </table>
      <div className={css.cols}>
        <table className={css.table} data-report-via-segments>
          <caption className={css.matCap}>Barrel, piece by piece</caption>
          <thead><tr><th>Through</th><th>Length</th><th>εr</th>{pair ? <><th>Zdiff Ω</th><th>Zcm Ω</th></> : <th>Z Ω</th>}<th>Delay ps</th></tr></thead>
          <tbody>
            {pieceRows(s, r.pieces).map((p, i) => (
              <tr key={i}>
                <td>{p.names}{p.part !== 'through' ? ` (${p.part})` : ''}</td>
                <td className={css.num}>{lenText(p.len, unit, Math.min(digits, 3))}</td>
                <td className={css.num}>{p.er}</td>
                {pair ? <><td className={css.num}>{qText(p.zdiff, p.zdiff * relD, FLOOR.ohm).v}</td><td className={css.num}>{qText(p.zcm, p.zcm * relC, FLOOR.ohm).v}</td></> : <td className={css.num}>{qText(p.z, p.z * rel, FLOOR.ohm).v}</td>}
                <td className={css.num}>{ps(p.delay).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className={css.table} data-report-via-crossings>
          <caption className={css.matCap}>Pads and planes</caption>
          <thead><tr><th>Layer</th><th>ΔC{pair ? ' (each via)' : ''} fF</th></tr></thead>
          <tbody>{nodes.map((n, i) => <tr key={i}><td>{n.layer}</td><td className={css.num}>{vt(n.dC * 1e15, n.dCErr * 1e15, 0.01)}</td></tr>)}</tbody>
        </table>
      </div>
      <ul className={css.list}>
        {stubs.length ? stubs.map((st) => (
          <li key={st.side}>The {st.side} stub, {lenText(st.length, unit, Math.min(digits, 3))}, {Number.isFinite(st.fRes) ? `resonates at ${(st.fRes / 1e9).toFixed(2)} GHz with its pads` : 'has no resonance with its pads in the band'} ({(st.fFormula / 1e9).toFixed(2)} GHz bare).</li>
        )) : <li>No stub: the barrel ends on the signal layers.</li>}
        {r.feeds.map((f) => <li key={f.side}>{f.side === 'entry' ? 'In' : 'Out'} on {f.layer}: {lenText(f.length, unit, Math.min(digits, 3))} to the pad, {f.z0.toFixed(2)} Ω, εeff {f.eeff.toFixed(3)}.</li>)}
        <li>The model holds to {(r.valid.fMax / 1e9).toFixed(1)} GHz ({r.valid.reason}); its lumped parts to {(r.valid.lumped / 1e9).toFixed(1)} GHz (λ/8); flags are for a {ps(r.tr).toFixed(0)} ps edge, whose band reaches {(r.band / 1e9).toFixed(1)} GHz.</li>
      </ul>
      <h3 className={css.h3}>Flags and assumptions</h3>
      <ul className={css.list} data-report-via-flags={r.flags.length}>
        {r.flags.length ? r.flags.map((f, i) => <li key={i}><b>{f.level === 'info' ? 'note' : f.level}</b> {f.message}</li>) : <li>No flags: the model holds for this via and edge.</li>}
        {r.assumptions.map((a) => <li key={a}>{ASSUME_TEXT[a] ?? a}</li>)}
      </ul>
    </>
  );
}

// ---- the calculators ----

function CalcPart({ c }: { c: FedCalc }) {
  const ohm = (x: Q | null) => (x ? `${vt(x.v, x.e, FLOOR.ohm)} Ω` : '–');
  const pct = (a: number) => (c.field ? `${a >= c.field.v ? '+' : '−'}${Math.abs((100 * (a - c.field.v)) / c.field.v).toFixed(1)} %` : '');
  return (
    <section className={css.part} data-report-part="calc">
      <h2 className={css.h2}>Calculators</h2>
      <table className={css.table} data-report-calc>
        <thead><tr><th>{c.name}</th><th>Value</th><th>To this tool</th><th>Range and accuracy</th></tr></thead>
        <tbody>
          <tr><th scope="row">This tool (field solver)</th><td className={css.num}>{ohm(c.field)}</td><td /><td /></tr>
          {c.jlc && c.jlc !== c.field && <tr><th scope="row">As JLCPCB’s calculator</th><td className={css.num}>{ohm(c.jlc)}</td><td className={css.num}>{pct(c.jlc.v)}</td><td>the same structure with the inputs JLCPCB’s calculator uses</td></tr>}
          {c.stated && <tr><th scope="row">JLCPCB’s calculator says</th><td className={css.num}>{c.stated.target} Ω</td><td className={css.num}>{pct(c.stated.target)}</td><td>at {c.stated.at}</td></tr>}
          {c.forms.map((f) => (
            <tr key={f.name}>
              <th scope="row">{f.name}</th>
              <td className={css.num}>{f.v === null ? '–' : `${f.v.toFixed(2)} Ω`}</td>
              <td className={css.num}>{f.v === null ? '' : pct(f.v)}</td>
              <td>{f.inside ? 'inside' : 'outside'} its range ({f.range}); accuracy {f.accuracy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
