// The results panel of the Trace section (M2.1b): what the static worker's solve gives (lib/emsim/lines.ts
// `LineResults`, with the matrices of jobs.ts `SolveResult`). One line: Z0, εeff, delay. A pair: Zdiff and Zcm by
// definition A (the default) with Zodd, Zeven and, for an asymmetric pair, Zdc; definitions B and Z_TDR, NEXT and FEXT
// and the modes in a details view; the matrices C, L and Zc on demand. Every value with its error, digits never finer
// than the error and the quantity's floor (engine.md §8), the solver's flags with their messages, the definition named.
// While a new solve runs the old values stay, dimmed and marked (data-stale).
// M2.1c: a result of the drag's fast path (one coarse level, no estimate: `quick`) shows its values without an error
// or a status and says that the full solve follows when the drag stops.

import React from 'react';

import type { Matrices, SolveResult } from '../../lib/emsim/jobs';
import type { Q } from '../../lib/emsim/lines';
import type { LengthUnit } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTrace.module.css';
import { EqNum, traceEq } from './eqLinks';
import { FLOOR, qText } from './trace';
import { Why, Whys } from './Why';

export type RunState = 'running' | 'done' | 'invalid' | 'error';

const STATUS_TEXT: Record<string, string> = {
  converged: 'converged',
  regular: '',
  irregular: 'irregular refinement',
  unchecked: 'not checked',
};

// One value with its error (data-q, data-v, data-e for the harness, in SI units as the engine gives them).
// The panel's overall status: a value shows its own status only when it differs (the flags explain the overall one).
const Overall = React.createContext<string>('');
// M4.3a: the result's signals, which decide the numbers with an equation (eqLinks.tsx traceEq).
const Signals = React.createContext(0);
const QUICK = 'quick';

function Val({ q, name, label, unit, floor, scale = 1, big, note }: { q: Q; name: string; label: React.ReactNode; unit: string; floor: number; scale?: number; big?: boolean; note?: React.ReactNode }) {
  const t = qText(q.v, q.e, floor, scale);
  const overall = React.useContext(Overall);
  const quick = overall === QUICK;
  const st = quick || q.status === overall ? '' : STATUS_TEXT[q.status] ?? q.status;
  const eq = traceEq(name, React.useContext(Signals)) !== null;
  return (
    <div className={big ? css.big : css.val} data-q={name} data-v={q.v} data-e={q.e} data-status={q.status}>
      <dt>{label}</dt>
      <dd>
        <span className={css.num}>{eq ? <EqNum section="trace" name={name} label={typeof label === 'string' ? label : name} text={t.v} v={q.v} scale={scale} /> : t.v}</span>
        {t.e && !quick && <span className={css.err}> ± {t.e}</span>}
        <span className={css.qUnit}> {unit}</span>
        {st && <span className={css.qStatus} data-level={q.status === 'irregular' ? 'warn' : 'note'}>{st}</span>}
        {note && <span className={css.qNote}>{note}</span>}
      </dd>
    </div>
  );
}

function Matrix({ name, title, m, e, unit, scale, floor }: { name: string; title: string; m: number[][]; e: number[][] | null; unit: string; scale: number; floor: number }) {
  const n = React.useContext(Signals);
  return (
    <div className={css.matrix} data-matrix={name}>
      <p className={css.matrixTitle}>{title} <span className={css.qUnit}>({unit})</span></p>
      <div className={css.matrixScroll}>
        <table>
          <tbody>
            {m.map((row, i) => (
              <tr key={i}>
                {row.map((x, j) => {
                  const t = qText(x, e ? e[i][j] : 0, floor, scale);
                  const q = `${name}.${i + 1}.${j + 1}`;
                  const v = traceEq(q, n) ? <EqNum section="trace" name={q} label={`${title}, row ${i + 1}, column ${j + 1}`} text={t.v} v={x} scale={scale} /> : t.v;
                  return <td key={j}>{v}{t.e && <span className={css.err}> ±{t.e}</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatrixView({ r, mx, quick }: { r: SolveResult; mx: Matrices | null; quick: boolean }) {
  return (
    <details className={css.details} data-matrices>
      <summary>Matrices per unit length</summary>
      <Why k="matrices" bare />
      <p className={css.small}>Row and column k are signal k as numbered in the drawing; ground is the reference.</p>
      <div className={css.matrices}>
        {mx && <Matrix name="C" title="Capacitance C" m={mx.C} e={quick ? null : mx.errC} unit="pF/m" scale={1e12} floor={FLOOR.perM} />}
        {mx && <Matrix name="L" title="Inductance L" m={mx.L} e={quick ? null : mx.errL} unit="nH/m" scale={1e9} floor={FLOOR.perM} />}
        <Matrix name="Zc" title="Characteristic impedance Zc" m={r.Zc} e={quick ? null : r.errZc} unit="Ω" scale={1} floor={FLOOR.ohm} />
      </div>
    </details>
  );
}

interface Props {
  r: SolveResult | null;
  state: RunState;
  stale: boolean;
  quick?: boolean;
  message: string;
  where: string;
  unit: LengthUnit;
}

export default function TraceResults({ r, state, stale, quick = false, message, where, unit }: Props) {
  const perIn = unit === 'mil';
  const dUnit = perIn ? 'ps/in' : 'ps/mm';
  const dScale = perIn ? 1e9 * 25.4 : 1e9; // s/m → ps per mm or inch
  const shown = r && r.ok ? r : null;
  const pair = shown?.pair ?? null;
  return (
    <section className={css.results} aria-labelledby="results-h" data-results data-state={state} data-stale={stale} data-where={where} data-quick={quick} data-n={shown ? shown.n : 0}>
      <div className={css.resultsHead}>
        <h3 id="results-h" className={base.h3}>Results</h3>
        <span className={css.busy} aria-live="polite" data-busy={stale}>{stale ? (quick ? 'Updating…' : 'Computing…') : quick ? 'Coarse while dragging' : ''}</span>
      </div>
      {state === 'invalid' && <p className={css.small} data-results-invalid>{message}</p>}
      {state === 'error' && <p className={css.reasonText} role="alert">{message}</p>}
      {r && !r.ok && state !== 'invalid' && <p className={css.reasonText} data-results-failed>{r.reason}</p>}
      {shown && state !== 'invalid' && (
        <Overall.Provider value={quick ? QUICK : shown.status}>
        <Signals.Provider value={shown.n}>
        <div className={css.values}>
          {shown.n === 1 && (
            <dl className={css.grid}>
              <Val big q={shown.lines[0].z0} name="z0" label="Z0" unit="Ω" floor={FLOOR.ohm} />
              <Val q={shown.lines[0].eeff} name="eeff" label="εeff" unit="" floor={FLOOR.ratio} />
              <Val q={shown.lines[0].delay} name="delay" label="Delay" unit={dUnit} floor={FLOOR.delay} scale={dScale} />
            </dl>
          )}
          {pair && (
            <>
              <dl className={css.grid}>
                <Val big q={pair.zdiff} name="zdiff" label="Zdiff" unit="Ω" floor={FLOOR.ohm} />
                <Val big q={pair.zcm} name="zcm" label="Zcm" unit="Ω" floor={FLOOR.ohm} />
                <Val q={pair.zodd} name="zodd" label="Zodd" unit="Ω" floor={FLOOR.ohm} note="Zdiff / 2" />
                <Val q={pair.zeven} name="zeven" label="Zeven" unit="Ω" floor={FLOOR.ohm} note="2 · Zcm" />
                {!pair.symmetric && <Val q={pair.zdc} name="zdc" label="Zdc" unit="Ω" floor={FLOOR.ohm} note="(Zc11 − Zc22) / 2: how unequal the lines are" />}
              </dl>
              <p className={css.definition} data-definition="A">
                Definition A (this tool's default): Zdiff = Zc11 + Zc22 − 2·Zc12 and Zcm = (Zc11 + Zc22 + 2·Zc12) / 4, from the
                characteristic impedance matrix Zc.{pair.symmetric ? ' For a symmetric pair the other definitions give the same values.' : ' For an asymmetric pair the definitions differ; see below.'}
              </p>
              <dl className={css.grid}>
                {shown.modes.map((m, k) => (
                  <Val key={k} q={m.eeff} name={`mode${k + 1}.eeff`} label={`εeff ${m.label || `mode ${k + 1}`}`} unit="" floor={FLOOR.ratio} />
                ))}
                {shown.modes.map((m, k) => (
                  <Val key={k} q={m.delay} name={`mode${k + 1}.delay`} label={`Delay ${m.label || `mode ${k + 1}`}`} unit={dUnit} floor={FLOOR.delay} scale={dScale} />
                ))}
              </dl>
              <details className={css.details} data-other-definitions>
                <summary>Other definitions, NEXT and FEXT, each line</summary>
                <dl className={css.grid}>
                  <Val q={pair.zdiffB} name="zdiffB" label="Zdiff (B)" unit="Ω" floor={FLOOR.ohm} note="driven by voltages: 4 / (Yc11 + Yc22 − 2·Yc12)" />
                  <Val q={pair.zcmB} name="zcmB" label="Zcm (B)" unit="Ω" floor={FLOOR.ohm} note="1 / (Yc11 + Yc22 + 2·Yc12)" />
                  <Val q={pair.ztdr} name="ztdr" label="Z_TDR" unit="Ω" floor={FLOOR.ohm} note="what a differential TDR with two 50 Ω sources reads" />
                  <Val q={pair.kb} scale={100} name="kb" label="NEXT kb" unit="%" floor={FLOOR.pct} note="near-end: ¼ (Cm/C + Lm/L), of a step driven on one line" />
                  <Val q={pair.kf} name="kf" label="FEXT kf" unit={dUnit} floor={FLOOR.delay} scale={dScale} note="far-end: (Cm/C − Lm/L) / 2v; the far-end pulse is kf · length · dV/dt" />
                  {shown.lines.map((l, k) => (
                    <Val key={k} q={l.z0} name={`z0.${k + 1}`} label={`Z0 of line ${k + 1}`} unit="Ω" floor={FLOOR.ohm} note="Zc_kk: with the other line carrying no current (not the trace alone)" />
                  ))}
                </dl>
                <Whys ks="zdiff-b ztdr kb kf zc-kk" />
              </details>
            </>
          )}
          {shown.n > 2 && (
            <>
              <dl className={css.grid} data-lines>
                {shown.lines.flatMap((l, k) => [
                  <Val key={`z${k}`} q={l.z0} name={`z0.${k + 1}`} label={`Z0 of line ${k + 1}`} unit="Ω" floor={FLOOR.ohm} />,
                  <Val key={`e${k}`} q={l.eeff} name={`eeff.${k + 1}`} label={`εeff of line ${k + 1}`} unit="" floor={FLOOR.ratio} />,
                ])}
              </dl>
              <p className={css.definition} data-definition="lines">
                Z0 of line k = Zc_kk: its impedance while the other lines carry no current; εeff of line k = C_kk/C0_kk, with the others at 0 V. The {shown.modes.length} modes are below; the matrices C, L and Zc on demand.
              </p>
              <details className={css.details} data-modes>
                <summary>Modes: εeff and delay</summary>
                <dl className={css.grid}>
                  {shown.modes.flatMap((m, k) => [
                    <Val key={`e${k}`} q={m.eeff} name={`mode${k + 1}.eeff`} label={`εeff ${m.label || `mode ${k + 1}`}`} unit="" floor={FLOOR.ratio} />,
                    <Val key={`d${k}`} q={m.delay} name={`mode${k + 1}.delay`} label={`Delay ${m.label || `mode ${k + 1}`}`} unit={dUnit} floor={FLOOR.delay} scale={dScale} />,
                  ])}
                </dl>
                <Why k="modes" />
              </details>
            </>
          )}
          {shown.n === 1 && <p className={css.definition} data-definition="single">Z0 = √(L/C) of the line, from the solved C and L per unit length; εeff = C/C0 (C0 with every dielectric replaced by air).</p>}
          <Whys ks={shown.n === 1 ? 'z0 eeff delay eq-open err solve-status quick' : pair ? `zdiff zcm zodd zeven${pair.symmetric ? '' : ' zdc'} modes eq-open err solve-status quick` : 'lines-each err solve-status quick'} />
          {shown.flags.length > 0 && !quick && (
            <ul className={base.issues} data-flags>
              {shown.flags.map((f) => <li key={f.code} data-flag={f.code}><span className={base.level} data-level="warn">{f.code}</span>{f.message}</li>)}
            </ul>
          )}
          {shown.flags.length > 0 && !quick && <Why k="flags" />}
          <MatrixView r={shown} mx={shown.matrices} quick={quick} />
          <p className={css.small} data-solve-info>
            Boundary elements, level M = {shown.M}, {shown.panels} panels, {Math.round(shown.ms)} ms{where === 'cache' ? ', from this visit\'s results' : where === 'page' ? ', on the page (no worker)' : ', in the background'}.{' '}
            {quick ? 'Solved at one coarse level while you drag, without an error estimate; the full solve with its error follows when you stop.' : "The error is estimated from the solver's coarse and fine levels."}
          </p>
        </div>
        </Signals.Provider>
        </Overall.Provider>
      )}
      {!shown && state === 'running' && <p className={css.small}>Solving…</p>}
    </section>
  );
}
