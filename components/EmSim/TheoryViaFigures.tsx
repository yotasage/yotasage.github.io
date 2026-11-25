// The via theory's figures (step M4.3b, in the Theory chunk): the fixed vias of docs/em-sim/theory-vias.md (V, the
// default 0.6/0.3 via; the same with 25 mm feeds; with its exit on L3, and backdrilled; VP, the LVDS via pair), read
// from the worked examples' own links and solved by the via model in the worker, each on a channel of its own and once
// per page (a shared promise), mounted only when the figure comes near the window. The side view, the cut, the pads'
// bars and the return-path sketch are small SVGs of the model's numbers; the TDR and the S-parameters use the page's
// Plot.

import React, { useEffect, useMemo, useState } from 'react';

import { EXAMPLES, EXAMPLE_PATH } from '../../lib/emsim/examples';
import type { StaticJob } from '../../lib/emsim/jobs';
import { decodeLink } from '../../lib/emsim/link';
import { DB_FLOOR, dbOf, readAt } from '../../lib/emsim/plot';
import { defaultSetup } from '../../lib/emsim/setup';
import type { Setup } from '../../lib/emsim/setup';
import type { ViaStructure } from '../../lib/emsim/via';
import { VIA_TR, VIA_Z0 } from '../../lib/emsim/viamodel';
import type { ViaModelResult } from '../../lib/emsim/viamodel';
import { useI18n } from '../../lib/ui/i18n';
import css from '../../styles/EmSimTheory.module.css';
import { emHasKey } from './emText';
import Plot from './Plot';
import type { PlotSeries } from './Plot';
import { Near } from './TheoryFigures';
import { getClient } from './TraceSection';

const linkOf = (ex: string, name: string): Setup => {
  const l = EXAMPLES.find((e) => e.id === ex)?.links.find((x) => x.name === name);
  if (!l) throw new Error(`No link ${ex}/${name} for the via theory's figures.`);
  return decodeLink(l.link.slice(EXAMPLE_PATH.length)).setup;
};

// The fixed setups (each decodes with no issues: check-teach.mjs).
const FIXED = {
  v: () => linkOf('ex-via-stub', 'through'),
  stub: () => linkOf('ex-via-stub', 'stub'),
  backdrill: () => linkOf('ex-via-stub', 'backdrill'),
  vp: () => linkOf('ex-via-pair', 'via'),
} as const;
type FixedKey = keyof typeof FIXED | 'v2';
// V itself (2 mm feeds) is the default setup's via; `v` above is V with 25 mm feeds (the TDR's).
const setupOf = (k: FixedKey): Setup => (k === 'v2' ? defaultSetup() : FIXED[k]());

const solved = new Map<string, Promise<{ r: ViaModelResult; v: ViaStructure } | null>>();
/** The via model of a fixed setup at a rise time, solved once per page on a channel of its own. */
function useFixedVia(k: FixedKey, tr = VIA_TR): { r: ViaModelResult; v: ViaStructure } | null {
  const [got, setGot] = useState<{ r: ViaModelResult; v: ViaStructure } | null>(null);
  useEffect(() => {
    const key = `${k}-${tr}`;
    let p = solved.get(key);
    if (!p) {
      const setup = setupOf(k);
      const job: StaticJob = { kind: 'via', setup, opt: { tr, z0: VIA_Z0, nf: 401 } };
      p = getClient().then((c) => c.run<ViaModelResult>(`theory-via-${key}`, job)).then((rr) => (rr && rr.result.ok ? { r: rr.result, v: setup.via } : null), () => null);
      p.then((x) => { if (!x) solved.delete(key); });
      solved.set(key, p);
    }
    let on = true;
    void p.then((x) => { if (on) setGot(x); });
    return () => { on = false; };
  }, [k, tr]);
  return got;
}

// A figure: its body is mounted (and its via solved) only once the figure comes near; `data-figure-done` once drawn.
// The box keeps about the figure's drawn height from before it mounts until it is drawn (the Wait line keeps it too),
// so a jump to a topic below does not move while the figures above it mount and solve.
const FigH = React.createContext(200);
const Fig = ({ name, minH, children }: { name: string; minH: number; children: React.ReactNode }) => (
  <figure className={css.figure} data-figure={name}>
    <FigH.Provider value={minH}><Near minH={minH}>{children}</Near></FigH.Provider>
  </figure>
);
const Body = ({ done, children, caption }: { done: boolean; children: React.ReactNode; caption: React.ReactNode }) => (
  <div data-figure-done={done ? 'true' : 'false'}>
    {children}
    <p className={css.caption}>{caption}</p>
  </div>
);
function Wait() {
  const { t } = useI18n();
  const h = React.useContext(FigH);
  return <p className={css.figWait} style={{ minHeight: Math.max(0, h - 92) }}>{t('em.th2.vf.wait')}</p>;
}

const ps = (s: number) => (s * 1e12).toFixed(2);

// ---- the side view: layers to scale in height, each barrel piece with its Z and delay ----

function SideSvg({ r, v }: { r: ViaModelResult; v: ViaStructure }) {
  const { t } = useI18n();
  const zs = r.nodes.map((n) => n.z);
  const zTop = Math.max(...zs), zBot = Math.min(...zs);
  const W = 560, H = 330, mt = 14, mb = 14, cx = 190, kx = 60;
  const k = (H - mt - mb) / Math.max(1e-6, zTop - zBot);
  const Y = (z: number) => mt + (zTop - z) * k;
  const drill = v.drill.v;
  const pad = (layer: string) => v.pads.find((p) => p.layer === layer)?.d?.v ?? 0;
  const anti = (layer: string) => v.antipads.find((a) => a.layer === layer)?.d.v ?? 0;
  const bd = v.backdrill;
  const partText = (part: string) => {
    const pk = `em.via.part.${part}`;
    return emHasKey(pk) ? t(pk) : part;
  };
  return (
    <svg className={css.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('em.th2.vf.sideAria')}>
      {r.nodes.map((n) => {
        const y = Y(n.z), plane = v.planes.includes(n.layer), a = anti(n.layer) * kx / 2, p = pad(n.layer) * kx / 2;
        return (
          <g key={n.layer}>
            {plane
              ? <path d={`M70 ${y} H${cx - a} M${cx + a} ${y} H${cx + 110}`} stroke="var(--copper)" strokeWidth={3} />
              : <path d={`M70 ${y} H90`} className={css.svgAxis} />}
            {p > 0 && <rect x={cx - p} y={y - 2} width={2 * p} height={4} fill="var(--copper)" />}
            <text x={8} y={y + 4} className={css.svgText}>{n.layer}{plane ? t('em.th2.vf.plane') : ''}</text>
          </g>
        );
      })}
      {r.pieces.map((q, i) => {
        const y0 = Y(q.zTop), y1 = Y(q.zBot), h = y1 - y0;
        return (
          <g key={i} data-piece={i}>
            <rect x={cx - (drill * kx) / 2} y={y0} width={drill * kx} height={Math.max(0.5, h)} fill={q.part === 'through' ? 'var(--copper)' : 'var(--warn)'} />
            {h >= 11 && <text x={cx + 118} y={(y0 + y1) / 2 + 4} className={css.svgNum}>{q.z0.toFixed(2)} Ω · {ps(q.delay)} ps{q.part !== 'through' ? ` (${partText(q.part)})` : ''}</text>}
          </g>
        );
      })}
      {bd && (() => {
        const z0 = bd.side === 'bottom' ? zBot : zTop - bd.depth.v, z1 = bd.side === 'bottom' ? zBot + bd.depth.v : zTop;
        return <rect x={cx - (bd.d.v * kx) / 2} y={Y(z1)} width={bd.d.v * kx} height={Y(z0) - Y(z1)} fill="none" stroke="var(--ink-2)" strokeDasharray="4 3" data-backdrill="" />;
      })()}
    </svg>
  );
}

function ViaSideBody() {
  const { t } = useI18n();
  const x = useFixedVia('v2');
  return (
    <Body done={!!x} caption={t('em.th2.vf.sideCap')}>
      {x ? <SideSvg r={x.r} v={x.v} /> : <Wait />}
    </Body>
  );
}
export const ViaSideFigure = () => <Fig name="via-side" minH={380}><ViaSideBody /></Fig>;

function BackdrillSideBody() {
  const { t } = useI18n();
  const x = useFixedVia('backdrill');
  return (
    <Body done={!!x} caption={t('em.th2.vf.bdCap')}>
      {x ? <SideSvg r={x.r} v={x.v} /> : <Wait />}
    </Body>
  );
}
export const BackdrillSideFigure = () => <Fig name="via-backdrill" minH={380}><BackdrillSideBody /></Fig>;

// ---- the cut: barrel, return vias, antipad and the equivalent coaxial wall ----

function CutSvg({ v, req, bare = false, w = 280 }: { v: ViaStructure; req: number; bare?: boolean; w?: number }) {
  const { t } = useI18n();
  const H = 240, k = 70, cx = w / 2, cy = H / 2;
  const anti = v.antipads[0]?.d.v ?? 0;
  const pad = v.pads.find((p) => p.layer === v.entry)?.d?.v ?? 0;
  const arrows = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
    const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180), r0 = 0.6 * k, r1 = 1.5 * k;
    const x1 = cx + r1 * c, y1 = cy + r1 * s;
    return <path key={a} d={`M${cx + r0 * c} ${cy + r0 * s} L${x1} ${y1} M${x1 - 7 * c + 4 * s} ${y1 - 7 * s - 4 * c} L${x1} ${y1} L${x1 - 7 * c - 4 * s} ${y1 - 7 * s + 4 * c}`} className={css.svgLine} />;
  });
  return (
    <svg className={css.svg} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={t(bare ? 'em.th2.vf.cutBareAria' : 'em.th2.vf.cutAria')}>
      <circle cx={cx} cy={cy} r={(anti * k) / 2} fill="none" stroke="var(--ink-3)" strokeDasharray="2 3" />
      <circle cx={cx} cy={cy} r={(pad * k) / 2} fill="var(--copper)" opacity={0.45} />
      <circle cx={cx} cy={cy} r={(v.drill.v * k) / 2} fill="var(--copper)" />
      {!bare && v.returns.map((q, i) => (
        <g key={i}>
          {q.pad && <circle cx={cx + q.x.v * k} cy={cy - q.y.v * k} r={(q.pad.v * k) / 2} fill="var(--copper)" opacity={0.45} />}
          <circle cx={cx + q.x.v * k} cy={cy - q.y.v * k} r={(q.drill.v * k) / 2} fill="var(--ink-2)" />
        </g>
      ))}
      {!bare && <circle cx={cx} cy={cy} r={req * k} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6 4" data-req={req} />}
      {bare && arrows}
      <text x={6} y={16} className={css.svgText}>{bare ? t('em.th2.vf.noRet') : `R_eq ${req.toFixed(3)} mm`}</text>
    </svg>
  );
}

function ViaCutBody() {
  const { t } = useI18n();
  const x = useFixedVia('v2');
  return (
    <Body done={!!x} caption={t('em.th2.vf.cutCap')}>
      {x?.r.wall ? <CutSvg v={x.v} req={x.r.wall.Req} w={560} /> : <Wait />}
    </Body>
  );
}
export const ViaCutFigure = () => <Fig name="via-cut" minH={290}><ViaCutBody /></Fig>;

function ViaReturnBody() {
  const { t } = useI18n();
  const x = useFixedVia('v2');
  return (
    <Body done={!!x} caption={t('em.th2.vf.retCap')}>
      {x?.r.wall ? (
        <div className={css.figTwo}>
          <CutSvg v={x.v} req={x.r.wall.Req} />
          <CutSvg v={x.v} req={x.r.wall.Req} bare />
        </div>
      ) : <Wait />}
    </Body>
  );
}
export const ViaReturnFigure = () => <Fig name="via-return" minH={300}><ViaReturnBody /></Fig>;

// ---- the pads' and planes' excess capacitance, a bar per layer ----

function ViaPadsBody() {
  const { t } = useI18n();
  const x = useFixedVia('v2');
  const body = x && (() => {
    const rows = x.r.nodes.filter((n) => n.dC !== 0);
    const max = Math.max(1e-18, ...rows.map((n) => Math.abs(n.dC)));
    const W = 560, L = 110, R = 80, rowH = 24, H = rows.length * rowH + 8, span = W - L - R;
    return (
      <svg className={css.svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('em.th2.vf.padsAria')}>
        {rows.map((n, i) => {
          const y = 4 + i * rowH, plane = x.v.planes.includes(n.layer);
          return (
            <g key={n.layer} data-bar={n.layer} data-d={n.dC}>
              <text x={L - 8} y={y + 14} className={css.svgText} textAnchor="end">{n.layer} {t(plane ? 'em.th2.vf.planeWord' : 'em.th2.vf.padWord')}</text>
              <rect x={L} y={y + 3} width={Math.max(1, (Math.abs(n.dC) / max) * span)} height={rowH - 8} fill={plane ? 'var(--accent)' : 'var(--copper)'} />
              <text x={W - 4} y={y + 14} className={css.svgNum} textAnchor="end">{(n.dC * 1e15).toFixed(1)} fF</text>
            </g>
          );
        })}
      </svg>
    );
  })();
  return (
    <Body done={!!x} caption={t('em.th2.vf.padsCap', { total: x ? t('em.th2.vf.padsTotal', { v: (x.r.lumped.dCsum * 1e15).toFixed(1) }) : '' })}>
      {body ?? <Wait />}
    </Body>
  );
}
export const ViaPadsFigure = () => <Fig name="via-pads" minH={200}><ViaPadsBody /></Fig>;

// ---- plots: |S21| with and without backdrill, the TDR at three edges, S of V, mixed mode of VP ----

const fGHz = (np: { f: Float64Array }) => Array.from(np.f).slice(1).map((f) => f / 1e9);
const sDb = (np: { f: Float64Array; s: Float64Array; ports: number }, i: number, j: number): number[] => {
  const P = np.ports, out: number[] = [];
  for (let k = 1; k < np.f.length; k++) { const o = 2 * ((k * P + i) * P + j); out.push(dbOf(np.s[o], np.s[o + 1])); }
  return out;
};

function PlotBox({ name, title, xs, series, xLabel, unit, fadeFrom, lines }: { name: string; title: string; xs: number[]; series: PlotSeries[]; xLabel: string; unit: string; fadeFrom?: number; lines?: { y: number; name: string }[] }) {
  const { t } = useI18n();
  const [cur, setCur] = useState(NaN);
  const dom = useMemo(() => [xs[0], xs[xs.length - 1]] as [number, number], [xs]);
  const readout = (x: number) => (Number.isFinite(x)
    ? `${x.toFixed(2)} ${unit}: ${series.map((s) => `${s.name} ${readAt(xs, s.ys, x).toFixed(2)}`).join(', ')}`.replace(/-/g, '−')
    : t('em.th2.vf.noCursor'));
  return <Plot name={name} title={title} xs={xs} series={series} xDomain={dom} xLabel={xLabel} cursor={cur} onCursor={setCur} readout={readout} fadeFrom={fadeFrom} lines={lines} />;
}

function StubS21Body() {
  const { t } = useI18n();
  const a = useFixedVia('stub'), b = useFixedVia('backdrill');
  const plot = a && b && a.r.nport && b.r.nport ? (() => {
    const xs = fGHz(a.r.nport), xb = fGHz(b.r.nport), yb = sDb(b.r.nport, 1, 0);
    const series: PlotSeries[] = [{ name: t('em.th2.vf.stub'), ys: sDb(a.r.nport, 1, 0) }, { name: t('em.th2.vf.backdrilled'), ys: xs.map((f) => readAt(xb, yb, f)) }];
    return <PlotBox name="theory-stub-s21" title="|S21| (dB)" xs={xs} series={series} xLabel={t('em.th2.vf.freqGhz')} unit="GHz" />;
  })() : null;
  const f = a?.r.stubs.length ? (a.r.stubs.reduce((m, q) => (q.length > m.length ? q : m)).fRes / 1e9).toFixed(1) : '21.8';
  return (
    <Body done={!!plot} caption={t('em.th2.vf.stubCap', { f })}>
      {plot ?? <Wait />}
    </Body>
  );
}
export const StubS21Figure = () => <Fig name="via-stub-s21" minH={280}><StubS21Body /></Fig>;

const TRS = [15e-12, 35e-12, 100e-12];
function ViaTdrBody() {
  const { t: tr } = useI18n();
  const r15 = useFixedVia('v', TRS[0]), r35 = useFixedVia('v', TRS[1]), r100 = useFixedVia('v', TRS[2]);
  const all = [r15, r35, r100];
  const plot = all.every((x) => x?.r.tdr) ? (() => {
    const t = all[1].r.tdr, xs = Array.from(t.t).map((s) => s * 1e12);
    const series: PlotSeries[] = all.map((x, i) => {
      const tx = Array.from(x.r.tdr.t).map((s) => s * 1e12), z = x.r.tdr.z;
      return { name: `${TRS[i] * 1e12} ps`, ys: xs.map((q) => readAt(tx, z, q)) };
    });
    const zf = all[1].r.feeds[0]?.z0;
    return <PlotBox name="theory-tdr" title="Z (Ω)" xs={xs} series={series} xLabel={tr('em.th2.vf.timePs')} unit="ps" lines={zf ? [{ y: zf, name: tr('em.th2.vf.feedRef', { z: zf.toFixed(2) }) }] : undefined} />;
  })() : null;
  return (
    <Body done={!!plot} caption={tr('em.th2.vf.tdrCap')}>
      {plot ?? <Wait />}
    </Body>
  );
}
export const ViaTdrFigure = () => <Fig name="via-tdr" minH={280}><ViaTdrBody /></Fig>;

function ViaSBody() {
  const { t } = useI18n();
  const x = useFixedVia('v2');
  const plot = x?.r.nport ? (() => {
    const np = x.r.nport, xs = fGHz(np);
    return <PlotBox name="theory-s" title="|S| (dB)" xs={xs} series={[{ name: 'S11', ys: sDb(np, 0, 0) }, { name: 'S21', ys: sDb(np, 1, 0) }]} xLabel={t('em.th2.vf.freqGhz')} unit="GHz" fadeFrom={x.r.valid.fMax / 1e9} />;
  })() : null;
  return (
    <Body done={!!plot} caption={t('em.th2.vf.sCap', { band: x ? (x.r.band / 1e9).toFixed(1) : '25.0', fMax: x ? (x.r.valid.fMax / 1e9).toFixed(1) : '29.5' })}>
      {plot ?? <Wait />}
    </Body>
  );
}
export const ViaSFigure = () => <Fig name="via-s" minH={280}><ViaSBody /></Fig>;

function ViaMixedBody() {
  const { t } = useI18n();
  const x = useFixedVia('vp');
  const plot = x?.r.mixed ? (() => {
    const np = x.r.mixed, xs = fGHz(np);
    return <PlotBox name="theory-mixed" title="|S| (dB)" xs={xs} series={[{ name: 'Sdd21', ys: sDb(np, 1, 0) }, { name: 'Scc21', ys: sDb(np, 3, 2) }]} xLabel={t('em.th2.vf.freqGhz')} unit="GHz" fadeFrom={x.r.valid.fMax / 1e9} />;
  })() : null;
  const scd = x?.r.mixed ? Math.max(...sDb(x.r.mixed, 3, 0)) : NaN;
  const where = Number.isFinite(scd) && scd <= DB_FLOOR ? t('em.th2.vf.mixedFloor', { db: DB_FLOOR }) : t('em.th2.vf.mixedNoise');
  return (
    <Body done={!!plot} caption={t('em.th2.vf.mixedCap', { where })}>
      {plot ?? <Wait />}
    </Body>
  );
}
export const ViaMixedFigure = () => <Fig name="via-mixed" minH={280}><ViaMixedBody /></Fig>;
