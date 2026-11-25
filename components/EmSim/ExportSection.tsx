// The Export section (step M8.1b), loaded by EmSimTool with `import()` when it comes near: a figure of what the page
// shows (the stackup, the cross-section, the via from the side and from above, each with its field map once the page
// has one, and the plots of the last sweep and the via's TDR, TDT and S-parameters, from exportFeed.ts) at a width
// and in a colour mode, previewed at true size, copied or saved as TikZ, SVG or PNG. Everything is made here from the
// figure model of lib/emsim/figure/ (M8.1a): the SVG is the preview and the PNG's source (drawn into a canvas at
// 96 px per inch times the scale), TikZ is saved as the `.tex` document alone or, when the figure has a map, as a ZIP
// with its PNG files (fflate). Downloads go through Blob URLs; nothing leaves the device.
// Below the figures, the Data group (DataExport.tsx, M8.2a): CSV, Touchstone, the project file and Copy link; then the
// Report group (Report.tsx, M8.2b): the printable report.
//   The root element carries `emsimExport.args()` for the harness (ui-export.mjs): the inputs of the shown figure in
// plain form, so it can build the same figure in Node and compare the files byte for byte.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { strToU8, zipSync } from 'fflate';

import { stackupFigure, sectionFigure, viaSideFigure, viaTopFigure } from '../../lib/emsim/figure/board';
import type { MapInput } from '../../lib/emsim/figure/field';
import { SIZE_PRESETS, readWidth } from '../../lib/emsim/figure/model';
import type { ColourMode, Figure, FigureOptions } from '../../lib/emsim/figure/model';
import { plotFigure } from '../../lib/emsim/figure/plot';
import { figureSvg } from '../../lib/emsim/figure/svg';
import { figureTikz } from '../../lib/emsim/figure/tikz';
import { setupSection } from '../../lib/emsim/lines';
import type { Setup } from '../../lib/emsim/setup';
import { useI18n } from '../../lib/ui/i18n';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimExport.module.css';
import DataExport, { download } from './DataExport';
import { emT } from './emText';
import Report from './Report';
import { useExportFeed } from './exportFeed';
import type { FedPlot, OpenText, OpenedNote } from './exportFeed';
import type { Painted } from './fieldPaint';
import { lenText, numText } from './format';
import type { ShownUnit } from './format';
import { Whys } from './Why';

type Format = 'tikz' | 'svg' | 'png';
type SizeId = 'column' | 'text' | 'page' | 'linewidth' | 'custom';
interface Choice { id: string; label: string; make: (o: FigureOptions) => Figure; map?: Painted; plot?: FedPlot }

const PX_PER_MM = 96 / 25.4;
const MAX_SIDE = 16384, MAX_AREA = 120e6; // what a canvas holds in every browser
const SVG_ID = 'emx';
const QTY_LABEL: Record<string, string> = { phi: 'φ', E: '|E|', lines: '|E|', H: '|H|', charge: 'σ', current: 'J' };
const COLOUR_IDS: ColourMode[] = ['colour', 'grey', 'bw'];
const FORMATS: [Format, string][] = [['tikz', 'TikZ'], ['svg', 'SVG'], ['png', 'PNG']];

/** The map of a field view as the figure model takes it. */
export function mapInput(p: Painted): MapInput {
  return { view: p.grid.view, values: p.values, cls: p.grid.cls, scale: p.scale, unit: p.unit, label: QTY_LABEL[p.qty] ?? p.qty, contours: p.contours, lines: p.lines };
}
const usable = (p: Painted | null): p is Painted => !!p && (!!p.values || p.lines.length > 0 || p.contours.length > 0);

/** A value with typed arrays in plain form ({ ta, a }), for the harness. */
function plain(x: unknown): unknown {
  if (ArrayBuffer.isView(x)) return { ta: x.constructor.name, a: Array.from(x as unknown as ArrayLike<number>) };
  if (Array.isArray(x)) return x.map(plain);
  if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plain(v)]));
  return x;
}

const safeName = (s: string) => s.trim().replace(/\.(tex|zip|svg|png)$/i, '').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);


/** The SVG drawn into a canvas at `scale` × 96 px per inch, as PNG bytes. */
async function pngOf(svg: string, wMm: number, hMm: number, scale: number): Promise<Blob> {
  const w = Math.max(1, Math.round(wMm * scale * PX_PER_MM)), h = Math.max(1, Math.round(hMm * scale * PX_PER_MM));
  if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_AREA) throw new Error(emT('em.exp.pngTooBig', { w, h }));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error(emT('em.exp.noCanvas'));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(emT('em.exp.noPng')))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ExportSection({ setup, unit, digits, opened, openText }: { setup: Setup; unit: ShownUnit; digits: number; opened: OpenedNote | null; openText: OpenText }) {
  const { t } = useI18n();
  const feed = useExportFeed();
  const [pick, setPick] = useState('section');
  const [size, setSize] = useState<SizeId>('column');
  const [custom, setCustom] = useState('120');
  const [colour, setColour] = useState<ColourMode>('colour');
  const [format, setFormat] = useState<Format>('tikz');
  const [scale, setScale] = useState(2);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const len = useMemo(() => (mm: number) => lenText(mm, unit, 3), [unit]);
  const num = (v: number) => numText(v, 3);
  const choices = useMemo<Choice[]>(() => {
    const s = setup.stackup, sec = setupSection(setup), w = setup.trace.w.v;
    const out: Choice[] = [{ id: 'stackup', label: t('em.exp.ch.stackup'), make: (o) => stackupFigure(s, { ...o, len, num }) }];
    if (typeof sec !== 'string') {
      out.push({ id: 'section', label: t('em.exp.ch.section'), make: (o) => sectionFigure(s, setup.trace, sec, { ...o, len, num }) });
      if (usable(feed.traceMap)) { const m = feed.traceMap; out.push({ id: 'section-map', label: t('em.exp.ch.sectionMap'), map: m, make: (o) => sectionFigure(s, setup.trace, sec, { ...o, len, num, map: mapInput(m) }) }); }
    }
    out.push({ id: 'via-side', label: t('em.exp.ch.viaSide'), make: (o) => viaSideFigure(s, setup.via, w, { ...o, len, num }) });
    if (usable(feed.viaSide)) { const m = feed.viaSide; out.push({ id: 'via-side-map', label: t('em.exp.ch.viaSideMap'), map: m, make: (o) => viaSideFigure(s, setup.via, w, { ...o, len, num, map: mapInput(m) }) }); }
    out.push({ id: 'via-top', label: t('em.exp.ch.viaTop'), make: (o) => viaTopFigure(s, setup.via, w, { ...o, len, num }) });
    if (usable(feed.viaTop)) { const m = feed.viaTop; out.push({ id: 'via-top-map', label: t('em.exp.ch.viaTopMap'), map: m, make: (o) => viaTopFigure(s, setup.via, w, { ...o, len, num, map: mapInput(m) }) }); }
    for (const p of [...feed.sweep, ...feed.via]) out.push({ id: p.id, label: p.label, plot: p, make: (o) => plotFigure(p.spec, o) });
    return out;
    // num is pure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, feed, len, t]);
  const choice = choices.find((c) => c.id === pick) ?? choices.find((c) => c.id === 'section') ?? choices[0];

  const width: string | number | null = size === 'custom' ? (readWidth(custom) && !readWidth(custom).linewidth ? custom : null) : size === 'linewidth' ? '\\linewidth' : SIZE_PRESETS.find((p) => p.id === size)?.mm ?? 88;
  const made = useMemo(() => {
    if (width === null) return { fig: null, svg: '', reason: t('em.exp.badWidth') };
    try {
      const fig = choice.make({ width, colour });
      return { fig, svg: figureSvg(fig, { id: SVG_ID }), reason: '' };
    } catch (e) {
      return { fig: null, svg: '', reason: t('em.exp.drawFail', { msg: e instanceof Error ? e.message : String(e) }) };
    }
  }, [choice, width, colour, t]);
  const fig = made.fig;
  const file = safeName(name) || (fig ? fig.name : 'figure');
  const tikz = useMemo(() => (fig && format === 'tikz' ? figureTikz(fig) : null), [fig, format]);

  useEffect(() => { setMsg(''); }, [choice.id, width, colour, format, scale]);
  useEffect(() => {
    const el = root.current as unknown as { emsimExport?: { args: () => unknown } } | null;
    if (!el) return;
    el.emsimExport = { args: () => plain({ id: choice.id, width, colour, unit, scale, file, format, map: choice.map ? mapInput(choice.map) : null, spec: choice.plot ? choice.plot.spec : null }) };
  });

  const say = (text: string) => setMsg(text);
  const failed = (e: unknown) => say(e instanceof Error ? e.message : String(e));
  const copy = async () => {
    if (!fig) return;
    if (!navigator.clipboard) { say(t('em.exp.noClipboard')); return; }
    setBusy(true);
    try {
      if (format === 'png') {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard.write) { say(t('em.exp.noCopyImg')); return; }
        const blob = await pngOf(made.svg, fig.width, fig.height, scale);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        say(t('em.exp.pngCopied', { w: Math.round(fig.width * scale * PX_PER_MM), h: Math.round(fig.height * scale * PX_PER_MM) }));
      } else if (format === 'svg') {
        await navigator.clipboard.writeText(made.svg);
        say(t('em.exp.svgCopied'));
      } else if (tikz) {
        await navigator.clipboard.writeText(tikz.picture);
        say(tikz.files.length ? t('em.exp.tikzCopiedFiles', { files: tikz.files.map((f) => f.name).join(t('em.exp.and')) }) : t('em.exp.tikzCopiedAlone'));
      }
    } catch (e) {
      failed(e instanceof DOMException && e.name === 'NotAllowedError' ? new Error(t('em.exp.copyDenied')) : e);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!fig) return;
    setBusy(true);
    try {
      if (format === 'png') {
        download(await pngOf(made.svg, fig.width, fig.height, scale), `${file}.png`);
        say(t('em.exp.savedFile', { file: `${file}.png` }));
      } else if (format === 'svg') {
        download(new Blob([made.svg], { type: 'image/svg+xml' }), `${file}.svg`);
        say(t('em.exp.savedFile', { file: `${file}.svg` }));
      } else if (tikz) {
        if (!tikz.files.length) {
          download(new Blob([tikz.document], { type: 'application/x-tex' }), `${file}.tex`);
          say(t('em.exp.savedTex', { file }));
        } else {
          const entries: Record<string, Uint8Array> = { [`${file}.tex`]: strToU8(tikz.document) };
          for (const f of tikz.files) entries[f.name] = f.bytes;
          download(new Blob([zipSync(entries, { level: 6 }) as BlobPart], { type: 'application/zip' }), `${file}.zip`);
          say(t('em.exp.savedZip', { file, files: tikz.files.map((f) => f.name).join(t('em.exp.and')) }));
        }
      }
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  };

  const sizes: [SizeId, string][] = [
    ...SIZE_PRESETS.map((p) => [p.id as SizeId, `${t(`em.exp.size.${p.id}`)} (${p.mm} mm)`] as [SizeId, string]),
    ['linewidth', t('em.exp.size.linewidth')],
    ['custom', t('em.exp.size.custom')],
  ];
  const noMaps = !usable(feed.traceMap) && !usable(feed.viaSide) && !usable(feed.viaTop);
  const pngPx = fig ? `${Math.round(fig.width * scale * PX_PER_MM)} × ${Math.round(fig.height * scale * PX_PER_MM)} px` : '';
  return (
    <div ref={root} className={css.root} data-export-ready data-figure={choice.id} data-format={format}>
      <p className={base.lede}>{t('em.exp.lede')}</p>
      <div className={css.controls}>
        <label className={css.ctl}>
          <span className={css.label}>{t('em.exp.figure')}</span>
          <select className={base.select} value={choice.id} onChange={(e) => setPick(e.target.value)} data-export-figure>
            {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className={css.ctl}>
          <span className={css.label}>{t('em.exp.width')}</span>
          <select className={base.select} value={size} onChange={(e) => setSize(e.target.value as SizeId)} data-export-size>
            {sizes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        {size === 'custom' && (
          <label className={css.ctl}>
            <span className={css.label}>{t('em.exp.widthUnits')}</span>
            <input className={`${base.input} ${css.width}`} value={custom} onChange={(e) => setCustom(e.target.value)} aria-invalid={width === null} inputMode="decimal" data-export-width />
          </label>
        )}
        <div className={css.ctl} role="group" aria-label={t('em.exp.colours')}>
          <span className={css.label}>{t('em.exp.colours')}</span>
          <span className={base.seg}>
            {COLOUR_IDS.map((c) => <button key={c} type="button" aria-pressed={colour === c} onClick={() => setColour(c)} data-export-colour={c}>{t(`em.exp.col.${c}`)}</button>)}
          </span>
        </div>
        <div className={css.ctl} role="group" aria-label={t('em.exp.format')}>
          <span className={css.label}>{t('em.exp.format')}</span>
          <span className={base.seg}>
            {FORMATS.map(([f, label]) => <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)} data-export-format={f}>{label}</button>)}
          </span>
        </div>
        <label className={css.ctl}>
          <span className={css.label}>{t('em.exp.pngScale')}</span>
          <select className={base.select} value={scale} onChange={(e) => setScale(Number(e.target.value))} data-export-scale>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => <option key={k} value={k}>{k}×</option>)}
          </select>
        </label>
        <label className={css.ctl}>
          <span className={css.label}>{t('em.exp.fileName')}</span>
          <input className={`${base.input} ${css.name}`} value={name} placeholder={fig ? fig.name : 'figure'} onChange={(e) => setName(e.target.value)} spellCheck={false} data-export-name />
        </label>
      </div>
      <Whys ks="export-figure export-size export-colour export-format export-scale export-name" />
      {noMaps && <p className={css.note} data-export-maps-note>{t('em.exp.noMaps')}</p>}
      <div className={css.actions}>
        <button type="button" className={base.button} onClick={copy} disabled={!fig || busy} data-export-copy>{t('em.exp.copy')}</button>
        <button type="button" className={base.button} onClick={save} disabled={!fig || busy} data-export-save>
          {format === 'tikz' ? (tikz && tikz.files.length ? t('em.exp.saveZip') : t('em.exp.saveTex')) : format === 'svg' ? t('em.exp.saveSvg') : t('em.exp.savePng')}
        </button>
        <span className={css.msg} role="status" aria-live="polite" data-export-msg>{msg}</span>
      </div>
      <Whys ks="export-copy export-save" />
      {made.reason && <p className={css.reason} data-export-reason>{made.reason}</p>}
      {fig && (
        <figure className={css.figure}>
          <figcaption className={css.caption} data-export-caption>
            {t('em.exp.trueSize', {
              w: fig.width.toFixed(fig.width % 1 ? 1 : 0),
              h: fig.height.toFixed(1),
              lw: fig.linewidth ? t('em.exp.lwNote') : '',
              png: format === 'png' ? t('em.exp.pngNote', { px: pngPx }) : '',
            })}
          </figcaption>
          <div className={css.preview} tabIndex={0} role="img" aria-label={t('em.exp.previewAria', { label: choice.label })} data-export-preview data-width-mm={fig.width} data-height-mm={fig.height} dangerouslySetInnerHTML={{ __html: made.svg }} />
        </figure>
      )}
      <Whys ks="export-preview" />
      <DataExport setup={setup} opened={opened} openText={openText} />
      <Report setup={setup} unit={unit} digits={digits} />
    </div>
  );
}
