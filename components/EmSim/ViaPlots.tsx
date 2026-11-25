// The Via section's plots (step M3.2a; in the Via chunk): the TDR and TDT the via model gives at a chosen rise time
// (lib/emsim/viamodel.ts `tdr`, `tdrCommon`: the feed traces are in the same record, so their impedance shows as the
// flat parts before and after the via when their round trip is longer than the edge), and |S11|, |S21| in dB over the
// model's sweep (0 … the edge spectrum's −60 dB), faded beyond `valid.fMax` where the lumped parts no longer hold; for a
// pair the differential or common TDR and the mixed-mode terms (Sdd, Scc, Scd) on switches. The two time plots share
// one cursor, the two frequency plots another (a time and a frequency are not the same reading). The plots draw only
// the full solves that ViaSolve hands them (never a drag's coarse frames), dimmed while a newer one is on its way.

import React, { useEffect, useMemo, useState } from 'react';

import { DB_FLOOR, dbOf, extent, niceAxis, phaseOf, readAt, timeScale } from '../../lib/emsim/plot';
import { KIND_INFO } from '../../lib/emsim/structure';
import type { Structure } from '../../lib/emsim/structure';
import { readPlain, readTime } from '../../lib/emsim/units';
import type { ViaModelResult } from '../../lib/emsim/viamodel';
import base from '../../styles/EmSim.module.css';
import stk from '../../styles/EmSimStackup.module.css';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import Plot from './Plot';
import type { PlotSeries } from './Plot';
import { feedExport } from './exportFeed';
import { FLOOR, qText } from './trace';
import { NumInput } from './ValField';
import { Why } from './Why';
import { useI18n } from '../../lib/ui/i18n';

export const TR_PRESETS = [15e-12, 35e-12, 100e-12];
export const TR_MIN = 5e-12, TR_MAX = 500e-12;
const CLIGHT = 299792458;

export type TdrMode = 'diff' | 'common';
export type SMode = 'dd' | 'cc' | 'cd';
const S_MODES: { m: SMode; text: string; refl: string; thru: string; ij: [[number, number], [number, number]] }[] = [
  { m: 'dd', text: 'Differential', refl: 'Sdd11', thru: 'Sdd21', ij: [[0, 0], [1, 0]] },
  { m: 'cc', text: 'Common', refl: 'Scc11', thru: 'Scc21', ij: [[2, 2], [3, 2]] },
  { m: 'cd', text: 'Conversion', refl: 'Scd11', thru: 'Scd21', ij: [[2, 0], [3, 0]] },
];

const psText = (t: number) => `${Number((t * 1e12).toPrecision(6))} ps`;
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
/** A small positive number as 1.5·10⁻⁷ (two decimals from 0.01 up). */
export function small(x: number): string {
  if (!(x > 0)) return '0';
  if (x >= 0.01) return x.toFixed(2);
  let e = Math.floor(Math.log10(x));
  let m = Number((x / 10 ** e).toFixed(1));
  if (m >= 10) { m = 1; e += 1; }
  return `${m}·10⁻${String(-e).split('').map((c) => SUP[Number(c)]).join('')}`;
}
const NO_CURSOR = 'Move over a plot, tap it or use the arrow keys on it for a reading.';

interface Props {
  r: ViaModelResult; // a full solve: tdr and the sweep
  stale: boolean;
  trace: Structure;
  tr: number;
  onTr: (tr: number) => void;
  z0: number; // the single-ended port (a pair's differential port is 2·z0)
  onZ0: (z0: number) => void;
}

function ViaPlots({ r, stale, trace, tr, onTr, z0, onZ0 }: Props) {
  const { t: trText } = useI18n();
  const pair = r.n === 2;
  const [tdrMode, setTdrMode] = useState<TdrMode>('diff');
  const [sMode, setSMode] = useState<SMode>('dd');
  const [tCur, setTCur] = useState(NaN);
  const [fCur, setFCur] = useState(NaN);
  const [trReason, setTrReason] = useState('');
  const [zReason, setZReason] = useState('');

  const T = pair && tdrMode === 'common' ? r.tdrCommon : r.tdr;
  const modeName = pair ? trText(tdrMode === 'common' ? 'em.via.modeCommon' : 'em.via.modeDiff') : '';
  const ts = useMemo(() => Array.from(T.t), [T]);
  const zSeries: PlotSeries[] = useMemo(() => [{ name: 'Z', ys: Array.from(T.z) }], [T]);
  const tdtSeries: PlotSeries[] = useMemo(() => [{ name: trText('em.via.stepThrough'), ys: Array.from(T.tdt) }], [T, trText]);
  const tDomain = useMemo(() => [ts[0], ts[ts.length - 1]] as [number, number], [ts]);
  const tScale = useMemo(() => timeScale({ min: tDomain[0], max: tDomain[1] }), [tDomain]);

  // The feed traces' impedance in the record's mode: a single-ended trace feeds each via of a pair on its own
  // (Zdiff = 2·Z0, Zcm = Z0/2); a coupled trace gives its Zdiff, and its Zcm is not in the result (no line then).
  const feedSignals = trace.kind === 'general' ? trace.signals.length : KIND_INFO[trace.kind]?.signals ?? 1;
  const modeZ = (z: number): number => (!pair ? z : tdrMode === 'diff' ? (feedSignals === 1 ? 2 * z : z) : feedSignals === 1 ? z / 2 : NaN);
  const lines = useMemo(() => {
    const out: { y: number; name: string }[] = [{ y: T.zRef, name: trText('em.via.portRef', { z: T.zRef.toFixed(2) }) }];
    const fz = r.feeds.map((f) => ({ side: f.side, z: modeZ(f.z0) })).filter((f) => Number.isFinite(f.z));
    if (fz.length === 2 && Math.abs(fz[0].z - fz[1].z) < 0.005) out.push({ y: fz[0].z, name: trText('em.via.tracesRef', { z: fz[0].z.toFixed(2) }) });
    else for (const f of fz) out.push({ y: f.z, name: trText(f.side === 'entry' ? 'em.via.inTraceRef' : 'em.via.outTraceRef', { z: f.z.toFixed(2) }) });
    return out;
    // modeZ follows pair, tdrMode and the trace's signals
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [T, r.feeds, tdrMode, pair, feedSignals, trText]);
  // The shortest feed's round trip against the edge: under about twice the edge its flat part does not show.
  const trips = r.feeds.map((f) => (2 * f.length * 1e-3 * Math.sqrt(f.eeff)) / CLIGHT);
  const trip = trips.length ? Math.min(...trips) : NaN;

  const tAt = (t: number) => `${Number((t * tScale.k).toFixed(tScale.unit === 'ps' ? 1 : 4))} ${tScale.unit}`;
  const zReadout = (t: number) => {
    if (!Number.isFinite(t)) return trText('em.via.noCursor');
    const z = readAt(ts, zSeries[0].ys, t);
    return `${tAt(t)}: Z${pair ? (tdrMode === 'diff' ? 'diff' : 'cm') : ''} ${qText(z, T.err.z, FLOOR.ohm).v} Ω`;
  };
  const tdtReadout = (t: number) => {
    if (!Number.isFinite(t)) return trText('em.via.noCursor');
    return trText('em.via.tdtRead', { t: tAt(t), v: readAt(ts, tdtSeries[0].ys, t).toFixed(4) });
  };

  // ---- S: the single-ended 2-port, or the pair's mixed-mode 4-port (D1, D2, C1, C2) ----
  const np = pair ? r.mixed : r.nport;
  const sm = S_MODES.find((x) => x.m === sMode) ?? S_MODES[0];
  const ij = pair ? sm.ij : ([[0, 0], [1, 0]] as [[number, number], [number, number]]);
  const names = pair ? [sm.refl, sm.thru] : ['S11', 'S21'];
  const S = useMemo(() => {
    const P = np.ports, nf = np.f.length;
    const fs: number[] = [];
    const parts = ij.map(() => ({ re: [] as number[], im: [] as number[], db: [] as number[] }));
    for (let k = 1; k < nf; k++) { // DC left out: no dB there
      fs.push(np.f[k] / 1e9);
      ij.forEach(([i, j], q) => {
        const o = 2 * ((k * P + i) * P + j);
        parts[q].re.push(np.s[o]); parts[q].im.push(np.s[o + 1]); parts[q].db.push(dbOf(np.s[o], np.s[o + 1]));
      });
    }
    return { fs, parts };
    // ij follows sMode and pair
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [np, sMode, pair]);
  const reflSeries: PlotSeries[] = useMemo(() => [{ name: names[0], ys: S.parts[0].db }], [S, names[0]]);
  const thruSeries: PlotSeries[] = useMemo(() => [{ name: names[1], ys: S.parts[1].db }], [S, names[1]]);
  const fDomain = useMemo(() => [0, S.fs[S.fs.length - 1]] as [number, number], [S]);
  const fValid = np.valid.fMax / 1e9;
  const sReadout = (q: 0 | 1) => (f: number) => {
    if (!Number.isFinite(f)) return trText('em.via.noCursor');
    const db = readAt(S.fs, S.parts[q].db, f);
    const re = readAt(S.fs, S.parts[q].re, f), im = readAt(S.fs, S.parts[q].im, f);
    if (!Number.isFinite(db)) return trText('em.via.noCursor');
    const mag = db <= DB_FLOOR ? trText('em.via.belowDb', { db: DB_FLOOR }) : `${db.toFixed(2)} dB ∠ ${phaseOf(re, im).toFixed(1)}°`;
    return `${f.toFixed(2)} GHz: ${names[q]} ${mag}${f > fValid ? trText('em.via.beyondRange') : ''}`.replace(/-/g, '−');
  };

  // The plots as shown, for the Export section (M8.1b); none while the result is stale.
  useEffect(() => {
    if (stale) { feedExport({ via: [], viaRun: null }); return; }
    const mode = modeName ? ` (${modeName})` : '', zName = pair ? (tdrMode === 'diff' ? 'Zdiff' : 'Zcm') : 'Z';
    const tAx = { min: tDomain[0], max: tDomain[1], label: `t (${tScale.unit})`, k: tScale.k };
    const zAx = niceAxis(...extent(zSeries[0].ys, lines.map((l) => l.y)), 6);
    const dAx = niceAxis(...extent(tdtSeries[0].ys, [0, 1]), 6);
    const sAx = niceAxis(...extent(S.parts[0].db, S.parts[1].db), 6);
    const fMax = fDomain[1];
    feedExport({
      viaRun: r,
      via: [
        { id: 'via-tdr', label: trText('em.via.expTdrLbl', { mode }), spec: { name: 'via-tdr', what: trText('em.via.expTdrWhat', { mode }), x: tAx, y: { ...zAx, label: `${zName} (Ω)` }, series: [{ xs: ts, ys: zSeries[0].ys }], refs: lines.map((l) => ({ y: l.y, label: l.name })) } },
        { id: 'via-tdt', label: trText('em.via.expTdtLbl', { mode }), spec: { name: 'via-tdt', what: trText('em.via.expTdtWhat', { mode }), x: tAx, y: { ...dAx, label: trText('em.via.stepThrough') }, series: [{ xs: ts, ys: tdtSeries[0].ys }] } },
        { id: 'via-s', label: trText('em.via.expSLbl', { a: names[0], b: names[1] }), spec: { name: 'via-s-params', what: trText('em.via.expSWhat', { a: names[0], b: names[1] }), x: { min: 0, max: fMax, label: 'f (GHz)' }, y: { ...sAx, label: '|S| (dB)' }, series: [{ xs: S.fs, ys: S.parts[0].db, label: `|${names[0]}|` }, { xs: S.fs, ys: S.parts[1].db, label: `|${names[1]}|` }], refs: fValid < fMax ? [{ x: fValid, label: trText('em.via.lumpedModel') }] : [] } },
      ],
    });
    // names follow S
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale, r, ts, zSeries, tdtSeries, lines, S, tDomain, tScale, fDomain, fValid, pair, tdrMode, trText]);
  useEffect(() => () => feedExport({ via: [], viaRun: null }), []);

  const portShown = pair ? 2 * z0 : z0;
  const modeParen = modeName ? ` (${modeName})` : '';
  return (
    <div className={vcss.plots} data-via-plots data-stale={stale} data-tr={r.tr} data-z0={r.z0}>
      <h4 className={vcss.h4}>{trText('em.via.tdrTdt')}</h4>
      <Why k="via-tdr" bare />
      <div className={vcss.plotControls}>
        <div className={stk.field} data-field="via.tr">
          <label className={stk.fieldLabel} htmlFor="via-tr">{trText('em.via.riseTime')}</label>
          <div className={stk.valueRow}>
            <NumInput id="via-tr" className={base.input} shown={psText(tr)} aria-invalid={trReason ? true : undefined}
              parse={(x) => readTime(x, { min: TR_MIN, max: TR_MAX, what: trText('em.via.riseWhat') })} onReason={setTrReason} onValue={onTr} />
          </div>
          {trReason && <p className={stk.reason} role="alert">{trReason}</p>}
        </div>
        <div className={vcss.presets} role="group" aria-label={trText('em.via.risePresetsAria')}>
          {TR_PRESETS.map((p) => (
            <button key={p} type="button" className={base.button} aria-pressed={Math.abs(p - tr) < 1e-15} data-via-tr-preset={Math.round(p * 1e12)} onClick={() => onTr(p)}>{Math.round(p * 1e12)} ps</button>
          ))}
        </div>
        <div className={stk.field} data-field="via.port">
          <label className={stk.fieldLabel} htmlFor="via-port">{trText(pair ? 'em.via.portDiff' : 'em.via.port')}</label>
          <div className={stk.valueRow}>
            <NumInput id="via-port" className={base.input} shown={String(Number(portShown.toPrecision(10)))} aria-invalid={zReason ? true : undefined}
              parse={(x) => readPlain(x, { min: 1, max: 1000, what: trText('em.via.portWhat') })} onReason={setZReason} onValue={(v) => onZ0(pair ? v / 2 : v)} />
            <span className={stk.unit}>Ω</span>
          </div>
          {zReason && <p className={stk.reason} role="alert">{zReason}</p>}
        </div>
        {pair && (
          <div className={base.seg} role="group" aria-label={trText('em.via.tdrModeAria')} data-via-tdr-mode={tdrMode}>
            <button type="button" aria-pressed={tdrMode === 'diff'} onClick={() => setTdrMode('diff')} data-via-tdr-mode-set="diff">{trText('em.via.diff')}</button>
            <button type="button" aria-pressed={tdrMode === 'common'} onClick={() => setTdrMode('common')} data-via-tdr-mode-set="common">{trText('em.via.common')}</button>
          </div>
        )}
      </div>
      <div className={vcss.whyRow}>
        <Why k="via-tr" />
        <Why k="via-port" />
        {pair && <Why k="via-tdr-mode" />}
      </div>
      <Plot name="via-tdr" title={trText('em.via.impTitle', { mode: modeParen })} xs={ts} series={zSeries} xDomain={tDomain} xScale={tScale}
        xLabel={trText('em.via.timeBack', { unit: tScale.unit })} cursor={tCur} onCursor={setTCur} readout={zReadout} lines={lines} stale={stale} />
      <Plot name="via-tdt" title={trText('em.via.stepTitle', { mode: modeParen })} xs={ts} series={tdtSeries} xDomain={tDomain} xScale={tScale}
        xLabel={trText('em.via.timeStep', { unit: tScale.unit })} cursor={tCur} onCursor={setTCur} readout={tdtReadout} stale={stale} />
      <p className={css.small} data-via-tdr-err={T.err.z}>
        {trText('em.via.tdrErrNote', { tr: Math.round(r.tr * 1e12 * 100) / 100, err: small(T.err.z) })}
      </p>
      {r.feeds.length === 0 ? (
        <p className={css.small} data-via-tdr-short="none">{trText('em.via.noFeedsNote')}</p>
      ) : trip < 2 * r.tr && (
        <p className={css.small} data-via-tdr-short={trip}>
          {trText('em.via.shortFeedsNote', { trip: (trip * 1e12).toFixed(1) })}
        </p>
      )}
      <Why k="via-tdt" bare />

      <h4 className={vcss.h4}>{trText('em.via.sparams')}</h4>
      <Why k="via-s" bare />
      {pair && (
        <>
          <div className={base.seg} role="group" aria-label={trText('em.via.mixedAria')} data-via-s-mode={sMode}>
            {S_MODES.map((x) => <button key={x.m} type="button" aria-pressed={sMode === x.m} onClick={() => setSMode(x.m)} data-via-s-mode-set={x.m}>{trText(`em.via.sm.${x.m}`)}</button>)}
          </div>
          <div className={vcss.whyRow}><Why k="via-s-mode" /></div>
        </>
      )}
      <Plot name="via-s11" title={`|${names[0]}| (dB)`} xs={S.fs} series={reflSeries} xDomain={fDomain} xLabel={trText('em.via.freqGhz')}
        cursor={fCur} onCursor={setFCur} readout={sReadout(0)} fadeFrom={fValid} stale={stale} />
      <Plot name="via-s21" title={`|${names[1]}| (dB)`} xs={S.fs} series={thruSeries} xDomain={fDomain} xLabel={trText('em.via.freqGhz')}
        cursor={fCur} onCursor={setFCur} readout={sReadout(1)} fadeFrom={fValid} stale={stale} />
      {fValid < fDomain[1] && (
        <p className={css.small} data-via-s-fade={np.valid.fMax}>
          {trText('em.via.fadedAbove', { f: fValid.toFixed(1), reason: np.valid.reason })}
        </p>
      )}
      <Why k="via-s-ports" bare />
      <Why k="via-cursor" bare />
    </div>
  );
}

export default React.memo(ViaPlots);
