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
import { useI18n } from '../../lib/ui/i18n';
import base from '../../styles/EmSim.module.css';
import xcss from '../../styles/EmSimExport.module.css';
import css from '../../styles/EmSimReport.module.css';
import { emHasKey, kindName, modeLabel } from './emText';
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
const PART_IDS: Part[] = ['stackup', 'trace', 'via', 'fields', 'plots', 'calc'];
const DRAW_W = 120, PLOT_W = 160, MAX_H = 150; // mm: drawings, plots, the tallest figure (a figure and its caption fit a page)
const usable = (p: Painted | null): p is Painted => !!p && (!!p.values || p.lines.length > 0 || p.contours.length > 0);

/** The paper most people near the browser's language use: Letter in the US, Canada, Mexico and the Philippines. */
function localPaper(): Paper {
  try { return /^[a-z]{2,3}-(US|CA|MX|PH)\b/i.test(navigator.language) ? 'letter' : 'a4'; } catch { return 'a4'; }
}

export default function Report({ setup, unit, digits }: { setup: Setup; unit: ShownUnit; digits: number }) {
  const { t } = useI18n();
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
  const parts = PART_IDS.filter((p) => has[p] && !off.includes(p));
  const toggle = (p: Part) => setOff((o) => (o.includes(p) ? o.filter((x) => x !== p) : [...o, p]));
  const print = () => {
    flushSync(() => setPrinting(true));
    window.print();
  };

  return (
    <div className={css.group} data-report-ready data-paper={paper} data-parts={parts.join(' ')} data-printing={printing}>
      <h3 className={`${base.h3} ${xcss.subhead}`} id="export-report">{t('em.rep.heading')}</h3>
      <p className={base.lede}>{t('em.rep.lede')}</p>
      <div className={xcss.controls}>
        <div className={xcss.ctl} role="group" aria-label={t('em.rep.paper')}>
          <span className={xcss.label}>{t('em.rep.paper')}</span>
          <span className={base.seg}>
            {PAPERS.map(([p, label]) => <button key={p} type="button" aria-pressed={paper === p} onClick={() => setPaper(p)} data-report-paper={p}>{label}</button>)}
          </span>
        </div>
        <fieldset className={css.parts}>
          <legend className={xcss.label}>{t('em.rep.include')}</legend>
          {PART_IDS.map((p) => (
            <label key={p} className={css.pick}>
              <input type="checkbox" checked={has[p] && !off.includes(p)} disabled={!has[p]} onChange={() => toggle(p)} data-report-part={p} />
              {t(`em.rep.part.${p}`)}
            </label>
          ))}
        </fieldset>
      </div>
      <Whys ks="report-paper report-parts" />
      <div className={xcss.actions}>
        <button type="button" className={base.button} onClick={print} data-report-print>{t('em.rep.print')}</button>
        <span className={xcss.msg}>{has.fields ? '' : t('em.rep.joinFields')}{has.plots ? '' : t('em.rep.joinPlots')}</span>
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
  const { t } = useI18n();
  const { svg, reason } = svgOf(id, make, width);
  return (
    <figure className={css.fig} data-report-fig={id}>
      {svg ? <div className={css.svg} dangerouslySetInnerHTML={{ __html: svg }} /> : <p className={css.small}>{t('em.exp.drawFail', { msg: reason })}</p>}
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

function QHead() {
  const { t } = useI18n();
  return <thead><tr><th>{t('em.rep.colQty')}</th><th>{t('em.rep.colVal')}</th><th>{t('em.rep.colUnit')}</th><th>{t('em.rep.colNote')}</th></tr></thead>;
}

function ReportBody({ setup, unit, digits, paper, parts, feed }: BodyProps) {
  const { t, locale } = useI18n();
  const on = (p: Part) => parts.includes(p);
  const now = useMemo(() => new Date(), []);
  const link = useMemo(() => fullLink(encodeLink(setup, jlcResolve)), [setup]);
  const len = (mm: number) => lenText(mm, unit, 3);
  const num = (v: number) => numText(v, 3);
  const page = paper === 'letter' ? 'letter' : 'A4';
  const calc = feed.calc && feed.calc.setup === setup ? feed.calc : null;
  return (
    <div className={css.sheet} data-report data-paper={paper} lang={locale}>
      <style>{`@page { size: ${page} portrait; margin: 14mm 15mm 16mm; @bottom-right { content: counter(page) " / " counter(pages); font: 8pt sans-serif; color: #6c6861; } }
@media print { html, body { background: #fff !important; } body > #__next { display: none !important; } }`}</style>
      <header className={css.head}>
        <h1 className={css.h1}>{t('em.rep.title')}</h1>
        <p className={css.meta}>{dateText(now)} · yotasage.github.io/em-sim</p>
        <p className={css.link}>{t('em.rep.setup')}<span data-report-link>{link}</span></p>
        <p className={css.about} data-report-about>{t('em.rep.about')}</p>
      </header>
      {on('stackup') && <StackupPart s={setup.stackup} unit={unit} digits={digits} len={len} num={num} />}
      {on('trace') && <TracePart setup={setup} unit={unit} digits={digits} len={len} num={num} feed={feed} maps={on('fields')} />}
      {on('via') && <ViaPart setup={setup} unit={unit} digits={digits} len={len} num={num} feed={feed} maps={on('fields')} />}
      {on('plots') && (
        <section className={css.part}>
          <h2 className={css.h2}>{t('em.rep.part.plots')}</h2>
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
  const { t } = useI18n();
  const all: Source[] = [];
  for (const l of s.layers) for (const x of layerSources(l)) if (!all.some((y) => srcKey(y) === srcKey(x))) all.push(x);
  return (
    <section className={css.part} data-report-part="stackup">
      <h2 className={css.h2}>{t('em.rep.part.stackup')}</h2>
      <p className={css.p}>
        {s.name || t('em.rep.typedStackup')}{s.finish ? t('em.rep.finish', { v: s.finish }) : ''}{s.thickness ? t('em.rep.board', { v: valLen(s.thickness, unit, digits) }) : ''}{s.controlled ? t('em.rep.controlled') : ''}.
      </p>
      <table className={css.table} data-report-stackup={s.layers.length}>
        <thead><tr><th>{t('em.rep.colLayer')}</th><th>{t('em.rep.colKind')}</th><th>{t('em.rep.colThick')}</th><th>εr</th><th>tan δ</th><th>{t('em.rep.colSource')}</th></tr></thead>
        <tbody>
          {s.layers.map((l) => (
            <tr key={l.id} data-report-layer={l.id}>
              <th scope="row">{l.name || l.id}</th>
              <td>{l.kind === 'mask' ? `${t('em.rep.mask')}${l.material ? `, ${l.material}` : ''}` : l.kind === 'copper' ? t('em.rep.copper') : `${l.role === 'core' ? t('em.rep.core') : t('em.rep.prepreg')}${l.material ? `, ${l.material}` : ''}`}</td>
              <td className={css.num}>
                {l.kind === 'mask' ? <>{t('em.rep.onCopper', { v: valLen(l.onCopper, unit, digits) })}<br />{t('em.rep.onLaminate', { v: valLen(l.onLaminate, unit, digits) })}<br />{t('em.rep.betweenTraces', { v: valLen(l.between, unit, digits) })}</>
                  : l.kind === 'copper' ? <>{valLen(l.t, unit, digits)}{l.base && l.plating ? <><br />{t('em.rep.foilPlating', { foil: lenText(l.base.v, unit, digits), plating: lenText(l.plating.v, unit, digits) })}</> : null}{l.calc ? <><br />{t('em.rep.calculator', { v: lenText(l.calc.v, unit, digits) })}</> : null}{l.etch.kind === 'offset' ? <><br />{t('em.rep.etchSide', { v: lenText(l.etch.side.v, unit, digits) })}</> : l.etch.kind === 'factor' ? <><br />{t('em.rep.etchFactor', { v: numText(l.etch.f.v, digits) })}</> : null}</>
                    : valLen(l.t, unit, digits)}
              </td>
              <td className={css.num}>{l.kind === 'copper' ? '–' : <>{valNum(l.er, digits)}{l.freq ? <><br />{t('em.rep.atGhz', { f: numText(l.freq / 1e9, 3) })}</> : null}</>}</td>
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
              : x.kind === 'kicad' ? <>KiCad: {x.file}{x.absent ? t('em.rep.kicadDefault') : ''}{x.placeholder ? t('em.rep.kicadPlaceholder') : ''}</>
                : <>{t('em.rep.srcTyped')}</>}
          </li>
        ))}
      </ul>
      <Fig id="stackup" caption={t('em.rep.capStackup')} make={(o) => stackupFigure(s, { ...o, len, num })} />
    </section>
  );
}

// ---- the trace ----

function TracePart({ setup, unit, digits, len, num, feed, maps }: { setup: Setup; unit: ShownUnit; digits: number; len: Len; num: (v: number) => string; feed: ExportFeed; maps: boolean }) {
  const { t, locale } = useI18n();
  const st = setup.trace, s = setup.stackup;
  const kind = TRACE_KINDS.find((k) => k.kind === st.kind);
  const kName = kind ? kindName(kind.kind, locale) : st.kind;
  const lname = (id: string) => { const l = s.layers.find((x) => x.id === id); return l ? l.name || l.id : id; };
  const sec = setupSection(setup);
  const r = feed.trace;
  const perIn = unit === 'mil';
  const dUnit = perIn ? 'ps/in' : 'ps/mm', dScale = perIn ? 1e9 * 25.4 : 1e9;
  const pairKind = kind ? kind.signals === 2 : false;
  const pair = r && r.ok ? r.pair : null;
  return (
    <section className={css.part} data-report-part="trace">
      <h2 className={css.h2}>{t('em.rep.part.trace')}</h2>
      <p className={css.p}>
        {st.kind !== 'general'
          ? t('em.rep.traceDesc', {
            kind: kName,
            layer: lname(st.layer),
            layer2: st.layer2 ? t('em.rep.andLayer', { layer: lname(st.layer2) }) : '',
            w: valLen(st.w, unit, digits),
            pair: pairKind ? (st.kind === 'broadside' ? t('em.rep.offset', { v: valLen(st.s, unit, digits) }) : t('em.rep.gap', { v: valLen(st.s, unit, digits) })) : '',
            coplanar: kind && kind.coplanar ? t('em.rep.gndGap', { v: valLen(st.g, unit, digits) }) : '',
            masked: st.masked ? t('em.rep.underMask') : '',
          })
          : t('em.rep.traceGeneral', { kind: kName, n: st.signals.length })}
      </p>
      {typeof sec === 'string' ? <p className={css.small}>{t('em.rep.noSection', { sec })}</p> : (
        <>
          <Fig id="section" caption={t('em.rep.capSection')} make={(o) => sectionFigure(s, st, sec, { ...o, len, num })} />
          {maps && usable(feed.traceMap) && <Fig id="section-map" caption={t('em.rep.capSectionMap')} make={(o) => sectionFigure(s, st, sec, { ...o, len, num, map: mapInput(feed.traceMap) })} />}
        </>
      )}
      <h3 className={css.h3}>{t('em.rep.results')}</h3>
      {!r ? <p className={css.small} data-report-trace="none">{t('em.rep.noTraceRes')}</p> : !r.ok ? <p className={css.small}>{t('em.rep.notSolved', { reason: r.reason })}</p> : (
        <>
          <table className={css.table} data-report-trace={r.n}>
            <QHead />
            <tbody>
              {r.n === 1 && <>
                <QRow k="z0" label="Z0" q={r.lines[0].z0} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteZ0')} />
                <QRow k="eeff" label="εeff" q={r.lines[0].eeff} unit="" floor={FLOOR.ratio} note={t('em.rep.noteEeff')} />
                <QRow k="delay" label={t('em.rep.delay')} q={r.lines[0].delay} unit={dUnit} floor={FLOOR.delay} scale={dScale} />
              </>}
              {pair && <>
                <QRow k="zdiff" label="Zdiff" q={pair.zdiff} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteZdiff')} />
                <QRow k="zcm" label="Zcm" q={pair.zcm} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteZcm')} />
                <QRow k="zodd" label="Zodd" q={pair.zodd} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteZodd')} />
                <QRow k="zeven" label="Zeven" q={pair.zeven} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteZeven')} />
                {!pair.symmetric && <QRow k="zdc" label="Zdc" q={pair.zdc} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteZdc')} />}
                <QRow k="zdiffB" label="Zdiff (B)" q={pair.zdiffB} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteZdiffB')} />
                <QRow k="zcmB" label="Zcm (B)" q={pair.zcmB} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteZcmB')} />
                <QRow k="ztdr" label="Z_TDR" q={pair.ztdr} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteZtdr')} />
                <QRow k="kb" label="NEXT kb" q={{ v: pair.kb.v * 100, e: pair.kb.e * 100 }} unit="%" floor={FLOOR.pct} note={t('em.rep.noteKb')} />
                <QRow k="kf" label="FEXT kf" q={pair.kf} unit={dUnit} floor={FLOOR.delay} scale={dScale} note={t('em.rep.noteKf')} />
              </>}
              {r.n > 1 && r.lines.map((l, k) => <QRow key={`z${k}`} k={`z0.${k + 1}`} label={t('em.rep.z0Line', { n: k + 1 })} q={l.z0} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteZ0Line')} />)}
              {r.n > 2 && r.lines.map((l, k) => <QRow key={`e${k}`} k={`eeff.${k + 1}`} label={t('em.rep.eeffLine', { n: k + 1 })} q={l.eeff} unit="" floor={FLOOR.ratio} />)}
              {r.n > 1 && r.modes.flatMap((m, k) => [
                <QRow key={`me${k}`} k={`mode${k + 1}.eeff`} label={t('em.rep.eeffMode', { mode: modeLabel(m.label, k, locale) })} q={m.eeff} unit="" floor={FLOOR.ratio} />,
                <QRow key={`md${k}`} k={`mode${k + 1}.delay`} label={t('em.rep.delayMode', { mode: modeLabel(m.label, k, locale) })} q={m.delay} unit={dUnit} floor={FLOOR.delay} scale={dScale} />,
              ])}
            </tbody>
          </table>
          {pair && <p className={css.small}>{pair.symmetric ? t('em.rep.defASym') : t('em.rep.defAAsym')}</p>}
          <div className={css.mats}>
            {r.matrices && <Mat title="C (pF/m)" m={r.matrices.C} e={r.matrices.errC} scale={1e12} floor={FLOOR.perM} />}
            {r.matrices && <Mat title="L (nH/m)" m={r.matrices.L} e={r.matrices.errL} scale={1e9} floor={FLOOR.perM} />}
            <Mat title="Zc (Ω)" m={r.Zc} e={r.errZc} scale={1} floor={FLOOR.ohm} />
          </div>
          {r.flags.length > 0 && <ul className={css.list} data-report-flags>{r.flags.map((f) => <li key={f.code}><b>{f.code}</b> {f.message}</li>)}</ul>}
          <p className={css.small}>{t('em.rep.bemFoot', { M: r.M, panels: r.panels, status: r.status })}</p>
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
  const { t } = useI18n();
  const s = setup.stackup, v = setup.via, w = setup.trace.w.v;
  const lname = (id: string) => { const l = s.layers.find((x) => x.id === id); return l ? l.name || l.id : id; };
  const r: ViaModelResult | null = feed.viaRun && feed.viaRun.ok ? feed.viaRun : null;
  return (
    <section className={css.part} data-report-part="via">
      <h2 className={css.h2}>{t('em.rep.part.via')}</h2>
      <p className={css.p}>
        {t('em.rep.viaSummary', {
          kind: v.pitch ? t('em.rep.viaPairDesc', { pitch: valLen(v.pitch, unit, digits) }) : t('em.rep.viaOneDesc'),
          start: lname(v.start),
          end: lname(v.end),
          drill: valLen(v.drill, unit, digits),
          plating: valLen(v.plating, unit, digits),
          entry: lname(v.entry),
          exit: lname(v.exit),
          bd: v.backdrill ? t('em.rep.backdrilled') : '',
          ret: v.returns.length ? (v.returns.length === 1 ? t('em.rep.retOne') : t('em.rep.retMany', { n: v.returns.length })) : '',
        })}
      </p>
      <Fig id="via-side" caption={t('em.rep.capViaSide')} make={(o) => viaSideFigure(s, v, w, { ...o, len, num })} />
      {maps && usable(feed.viaSide) && <Fig id="via-side-map" caption={t('em.rep.capViaSideMap')} make={(o) => viaSideFigure(s, v, w, { ...o, len, num, map: mapInput(feed.viaSide) })} />}
      <Fig id="via-top" caption={t('em.rep.capViaTop')} make={(o) => viaTopFigure(s, v, w, { ...o, len, num })} />
      {maps && usable(feed.viaTop) && <Fig id="via-top-map" caption={t('em.rep.capViaTopMap')} make={(o) => viaTopFigure(s, v, w, { ...o, len, num, map: mapInput(feed.viaTop) })} />}
      <h3 className={css.h3}>{t('em.rep.results')}</h3>
      {!r ? <p className={css.small} data-report-via-none>{t('em.rep.noViaRes')}</p> : <ViaNumbers r={r} s={s} setup={setup} unit={unit} digits={digits} />}
    </section>
  );
}

function ViaNumbers({ r, s, setup, unit, digits }: { r: ViaModelResult; s: Stackup; setup: Setup; unit: ShownUnit; digits: number }) {
  const { t } = useI18n();
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
  const partText = (part: string) => (emHasKey(`em.via.part.${part}`) ? t(`em.via.part.${part}`) : part);
  const lvlText = (lvl: string) => (emHasKey(`em.via.lvl.${lvl}`) ? t(`em.via.lvl.${lvl}`) : lvl);
  const assumeText = (a: string) => (emHasKey(`em.via.assume.${a}`) ? t(`em.via.assume.${a}`) : ASSUME_TEXT[a] ?? a);
  return (
    <>
      <table className={css.table} data-report-via-table>
        <QHead />
        <tbody>
          {pair ? <>
            <QRow attr="via" k="barrel-zdiff" label={t('em.rep.barrelZdiff', { er: core.er })} q={q(core.zdiff, core.zdiff * relD)} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteBarrelPair')} />
            <QRow attr="via" k="barrel-zcm" label={t('em.rep.barrelZcm')} q={q(core.zcm, core.zcm * relC)} unit="Ω" floor={FLOOR.ohm} />
            {L && <QRow attr="via" k="section-zdiff" label={t('em.rep.secZdiff')} q={q(L.zdiff, L.zdiff * (0.5 * relD + 0.5 * (L.lineC * relD + dCe) / Ctot))} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteWholeVia')} />}
            {L && <QRow attr="via" k="section-zcm" label={t('em.rep.secZcm')} q={q(L.zcm, L.zcm * (0.5 * relC + 0.5 * (L.lineC * relC + dCe) / Ctot))} unit="Ω" floor={FLOOR.ohm} />}
          </> : <>
            <QRow attr="via" k="barrel-z" label={t('em.rep.barrelZ', { er: core.er })} q={q(core.z0, core.z0 * rel)} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteBarrelOne')} />
            {L && <QRow attr="via" k="section-z" label={t('em.rep.secZ')} q={q(L.z, L.z * relSec)} unit="Ω" floor={FLOOR.ohm} note={t('em.rep.noteWholeVia')} />}
          </>}
          {L && <QRow attr="via" k="delay" label={t('em.rep.delayThrough')} q={q(ps(L.delay), ps(L.delay) * relSec)} unit="ps" floor={0.01} />}
          {L && <QRow attr="via" k="L" label={pair ? t('em.rep.lEach') : 'L'} q={q(L.L[0][0] * 1e9, L.L[0][0] * 1e9 * rel)} unit="nH" floor={0.001} />}
          {L && <QRow attr="via" k="C" label={pair ? t('em.rep.cEach') : 'C'} q={q(Ctot * 1e15, (L.lineC * rel + dCe) * 1e15)} unit="fF" floor={0.1} note={t('em.rep.cPadsNote', { v: qText(L.dCsum * 1e15, dCe * 1e15, 0.1).v })} />}
        </tbody>
      </table>
      <div className={css.cols}>
        <table className={css.table} data-report-via-segments>
          <caption className={css.matCap}>{t('em.rep.barrelPieces')}</caption>
          <thead><tr><th>{t('em.rep.colThrough')}</th><th>{t('em.rep.colLength')}</th><th>εr</th>{pair ? <><th>Zdiff Ω</th><th>Zcm Ω</th></> : <th>Z Ω</th>}<th>{t('em.rep.colDelayPs')}</th></tr></thead>
          <tbody>
            {pieceRows(s, r.pieces).map((p, i) => (
              <tr key={i}>
                <td>{p.names}{p.part !== 'through' ? ` (${partText(p.part)})` : ''}</td>
                <td className={css.num}>{lenText(p.len, unit, Math.min(digits, 3))}</td>
                <td className={css.num}>{p.er}</td>
                {pair ? <><td className={css.num}>{qText(p.zdiff, p.zdiff * relD, FLOOR.ohm).v}</td><td className={css.num}>{qText(p.zcm, p.zcm * relC, FLOOR.ohm).v}</td></> : <td className={css.num}>{qText(p.z, p.z * rel, FLOOR.ohm).v}</td>}
                <td className={css.num}>{ps(p.delay).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className={css.table} data-report-via-crossings>
          <caption className={css.matCap}>{t('em.rep.padsPlanes')}</caption>
          <thead><tr><th>{t('em.rep.colLayer')}</th><th>{t('em.rep.colDc', { each: pair ? t('em.rep.eachViaParen') : '' })}</th></tr></thead>
          <tbody>{nodes.map((n, i) => <tr key={i}><td>{n.layer}</td><td className={css.num}>{vt(n.dC * 1e15, n.dCErr * 1e15, 0.01)}</td></tr>)}</tbody>
        </table>
      </div>
      <ul className={css.list}>
        {stubs.length ? stubs.map((st) => {
          const side = st.side === 'entry' ? t('em.via.entry') : t('em.via.exit');
          const lenStr = lenText(st.length, unit, Math.min(digits, 3));
          return (
            <li key={st.side}>
              {Number.isFinite(st.fRes)
                ? t('em.rep.stubRes', { side, len: lenStr, fRes: (st.fRes / 1e9).toFixed(2), fBare: (st.fFormula / 1e9).toFixed(2) })
                : t('em.rep.stubNoRes', { side, len: lenStr, fBare: (st.fFormula / 1e9).toFixed(2) })}
            </li>
          );
        }) : <li>{t('em.rep.noStub')}</li>}
        {r.feeds.map((f) => <li key={f.side}>{t('em.rep.feedLine', { dir: f.side === 'entry' ? t('em.rep.feedIn') : t('em.rep.feedOut'), layer: f.layer, len: lenText(f.length, unit, Math.min(digits, 3)), z0: f.z0.toFixed(2), eeff: f.eeff.toFixed(3) })}</li>)}
        <li>{t('em.rep.validLine', { fMax: (r.valid.fMax / 1e9).toFixed(1), reason: r.valid.reason, lumped: (r.valid.lumped / 1e9).toFixed(1), tr: ps(r.tr).toFixed(0), band: (r.band / 1e9).toFixed(1) })}</li>
      </ul>
      <h3 className={css.h3}>{t('em.rep.flagsAssume')}</h3>
      <ul className={css.list} data-report-via-flags={r.flags.length}>
        {r.flags.length ? r.flags.map((f, i) => <li key={i}><b>{lvlText(f.level)}</b> {f.message}</li>) : <li>{t('em.rep.noFlags')}</li>}
        {r.assumptions.map((a) => <li key={a}>{assumeText(a)}</li>)}
      </ul>
    </>
  );
}

// ---- the calculators ----

function CalcPart({ c }: { c: FedCalc }) {
  const { t } = useI18n();
  const ohm = (x: Q | null) => (x ? `${vt(x.v, x.e, FLOOR.ohm)} Ω` : '–');
  const pct = (a: number) => (c.field ? `${a >= c.field.v ? '+' : '−'}${Math.abs((100 * (a - c.field.v)) / c.field.v).toFixed(1)} %` : '');
  return (
    <section className={css.part} data-report-part="calc">
      <h2 className={css.h2}>{t('em.rep.part.calc')}</h2>
      <table className={css.table} data-report-calc>
        <thead><tr><th>{c.name}</th><th>{t('em.rep.calcColVal')}</th><th>{t('em.rep.calcColTo')}</th><th>{t('em.rep.calcColRange')}</th></tr></thead>
        <tbody>
          <tr><th scope="row">{t('em.rep.calcField')}</th><td className={css.num}>{ohm(c.field)}</td><td /><td /></tr>
          {c.jlc && c.jlc !== c.field && <tr><th scope="row">{t('em.rep.calcJlc')}</th><td className={css.num}>{ohm(c.jlc)}</td><td className={css.num}>{pct(c.jlc.v)}</td><td>{t('em.rep.calcJlcNote')}</td></tr>}
          {c.stated && <tr><th scope="row">{t('em.rep.calcStated')}</th><td className={css.num}>{c.stated.target} Ω</td><td className={css.num}>{pct(c.stated.target)}</td><td>{t('em.rep.calcStatedAt', { at: c.stated.at })}</td></tr>}
          {c.forms.map((f) => (
            <tr key={f.name}>
              <th scope="row">{f.name}</th>
              <td className={css.num}>{f.v === null ? '–' : `${f.v.toFixed(2)} Ω`}</td>
              <td className={css.num}>{f.v === null ? '' : pct(f.v)}</td>
              <td>{t('em.rep.calcFormNote', { where: f.inside ? t('em.rep.inside') : t('em.rep.outside'), range: f.range, acc: f.accuracy })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
