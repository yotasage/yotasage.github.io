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
import { useI18n } from '../../lib/ui/i18n';
import Calm, { lineOf } from './Calm';
import { modeLabel } from './emText';
import { EqNum, traceEq } from './eqLinks';
import { FLOOR, qText } from './trace';
import { Why, Whys } from './Why';

export type RunState = 'running' | 'done' | 'invalid' | 'error';

// One value with its error (data-q, data-v, data-e for the harness, in SI units as the engine gives them).
// The panel's overall status: a value shows its own status only when it differs (the flags explain the overall one).
const Overall = React.createContext<string>('');
// M4.3a: the result's signals, which decide the numbers with an equation (eqLinks.tsx traceEq).
const Signals = React.createContext(0);
const QUICK = 'quick';

function Val({ q, name, label, unit, floor, scale = 1, big, note }: { q: Q; name: string; label: React.ReactNode; unit: string; floor: number; scale?: number; big?: boolean; note?: React.ReactNode }) {
  const { t } = useI18n();
  const qt = qText(q.v, q.e, floor, scale);
  const overall = React.useContext(Overall);
  const quick = overall === QUICK;
  const statusText = q.status === 'converged' ? t('em.res.status.converged') : q.status === 'irregular' ? t('em.res.status.irregular') : q.status === 'unchecked' ? t('em.res.status.unchecked') : q.status === 'regular' ? '' : q.status;
  const st = quick || q.status === overall ? '' : statusText;
  const eq = traceEq(name, React.useContext(Signals)) !== null;
  return (
    <div className={big ? css.big : css.val} data-q={name} data-v={q.v} data-e={q.e} data-status={q.status}>
      <dt>{label}</dt>
      <dd>
        <span className={css.num}>{eq ? <EqNum section="trace" name={name} label={typeof label === 'string' ? label : name} text={qt.v} v={q.v} scale={scale} /> : qt.v}</span>
        {qt.e && !quick && <span className={css.err}> ± {qt.e}</span>}
        <span className={css.qUnit}> {unit}</span>
        {st && <span className={css.qStatus} data-level={q.status === 'irregular' ? 'warn' : 'note'}>{st}</span>}
        {note && <span className={css.qNote}>{note}</span>}
      </dd>
    </div>
  );
}

function Matrix({ name, title, m, e, unit, scale, floor }: { name: string; title: string; m: number[][]; e: number[][] | null; unit: string; scale: number; floor: number }) {
  const { t } = useI18n();
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
                  const qt = qText(x, e ? e[i][j] : 0, floor, scale);
                  const q = `${name}.${i + 1}.${j + 1}`;
                  const v = traceEq(q, n) ? <EqNum section="trace" name={q} label={t('em.res.matCell', { title, r: i + 1, c: j + 1 })} text={qt.v} v={x} scale={scale} /> : qt.v;
                  return <td key={j}>{v}{qt.e && <span className={css.err}> ±{qt.e}</span>}</td>;
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
  const { t } = useI18n();
  return (
    <details className={css.details} data-matrices>
      <summary>{t('em.res.matSummary')}</summary>
      <Why k="matrices" bare />
      <p className={css.small}>{t('em.res.matNote')}</p>
      <div className={css.matrices}>
        {mx && <Matrix name="C" title={t('em.res.matC')} m={mx.C} e={quick ? null : mx.errC} unit="pF/m" scale={1e12} floor={FLOOR.perM} />}
        {mx && <Matrix name="L" title={t('em.res.matL')} m={mx.L} e={quick ? null : mx.errL} unit="nH/m" scale={1e9} floor={FLOOR.perM} />}
        <Matrix name="Zc" title={t('em.res.matZc')} m={r.Zc} e={quick ? null : r.errZc} unit="Ω" scale={1} floor={FLOOR.ohm} />
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
  const { t, locale } = useI18n();
  const perIn = unit === 'mil';
  const dUnit = perIn ? 'ps/in' : 'ps/mm';
  const dScale = perIn ? 1e9 * 25.4 : 1e9; // s/m → ps per mm or inch
  const shown = r && r.ok ? r : null;
  const pair = shown?.pair ?? null;
  const whereText = where === 'cache' ? t('em.res.whereCache') : where === 'page' ? t('em.res.wherePage') : t('em.res.whereBg');
  return (
    <section className={css.results} aria-labelledby="results-h" data-results data-state={state} data-stale={stale} data-where={where} data-quick={quick} data-n={shown ? shown.n : 0} data-ms={shown ? shown.ms.toFixed(2) : ''}>
      <div className={css.resultsHead}>
        <h3 id="results-h" className={base.h3}>{t('em.res.title')}</h3>
        <span className={css.busy} data-busy={stale}>{stale ? (quick ? t('em.res.updating') : t('em.res.computing')) : quick ? t('em.res.coarse') : ''}</span>
      </div>
      <Calm name="results" within="#stackup, #trace, header" read={() => (stale ? '' : lineOf(document.querySelector('[data-results] dl')) || lineOf(document.querySelector('[data-results] [data-results-invalid], [data-results] [data-results-failed]')))} />
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
              <Val q={shown.lines[0].delay} name="delay" label={t('em.res.delay')} unit={dUnit} floor={FLOOR.delay} scale={dScale} />
            </dl>
          )}
          {pair && (
            <>
              <dl className={css.grid}>
                <Val big q={pair.zdiff} name="zdiff" label="Zdiff" unit="Ω" floor={FLOOR.ohm} />
                <Val big q={pair.zcm} name="zcm" label="Zcm" unit="Ω" floor={FLOOR.ohm} />
                <Val q={pair.zodd} name="zodd" label="Zodd" unit="Ω" floor={FLOOR.ohm} note="Zdiff / 2" />
                <Val q={pair.zeven} name="zeven" label="Zeven" unit="Ω" floor={FLOOR.ohm} note="2 · Zcm" />
                {!pair.symmetric && <Val q={pair.zdc} name="zdc" label="Zdc" unit="Ω" floor={FLOOR.ohm} note={t('em.res.zdcNote')} />}
              </dl>
              <p className={css.definition} data-definition="A">
                {t('em.res.defA', { sym: pair.symmetric ? t('em.res.defASym') : t('em.res.defAAsym') })}
              </p>
              <dl className={css.grid}>
                {shown.modes.map((m, k) => (
                  <Val key={k} q={m.eeff} name={`mode${k + 1}.eeff`} label={t('em.res.eeffMode', { mode: modeLabel(m.label, k, locale) })} unit="" floor={FLOOR.ratio} />
                ))}
                {shown.modes.map((m, k) => (
                  <Val key={k} q={m.delay} name={`mode${k + 1}.delay`} label={t('em.res.delayMode', { mode: modeLabel(m.label, k, locale) })} unit={dUnit} floor={FLOOR.delay} scale={dScale} />
                ))}
              </dl>
              <details className={css.details} data-other-definitions>
                <summary>{t('em.res.otherDefs')}</summary>
                <dl className={css.grid}>
                  <Val q={pair.zdiffB} name="zdiffB" label="Zdiff (B)" unit="Ω" floor={FLOOR.ohm} note={t('em.res.zdiffBNote')} />
                  <Val q={pair.zcmB} name="zcmB" label="Zcm (B)" unit="Ω" floor={FLOOR.ohm} note="1 / (Yc11 + Yc22 + 2·Yc12)" />
                  <Val q={pair.ztdr} name="ztdr" label="Z_TDR" unit="Ω" floor={FLOOR.ohm} note={t('em.res.ztdrNote')} />
                  <Val q={pair.kb} scale={100} name="kb" label="NEXT kb" unit="%" floor={FLOOR.pct} note={t('em.res.kbNote')} />
                  <Val q={pair.kf} name="kf" label="FEXT kf" unit={dUnit} floor={FLOOR.delay} scale={dScale} note={t('em.res.kfNote')} />
                  {shown.lines.map((l, k) => (
                    <Val key={k} q={l.z0} name={`z0.${k + 1}`} label={t('em.res.z0Line', { n: k + 1 })} unit="Ω" floor={FLOOR.ohm} note={t('em.res.z0LineNote')} />
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
                  <Val key={`z${k}`} q={l.z0} name={`z0.${k + 1}`} label={t('em.res.z0Line', { n: k + 1 })} unit="Ω" floor={FLOOR.ohm} />,
                  <Val key={`e${k}`} q={l.eeff} name={`eeff.${k + 1}`} label={t('em.res.eeffLine', { n: k + 1 })} unit="" floor={FLOOR.ratio} />,
                ])}
              </dl>
              <p className={css.definition} data-definition="lines">
                {t('em.res.defLines', { n: shown.modes.length })}
              </p>
              <details className={css.details} data-modes>
                <summary>{t('em.res.modesSummary')}</summary>
                <dl className={css.grid}>
                  {shown.modes.flatMap((m, k) => [
                    <Val key={`e${k}`} q={m.eeff} name={`mode${k + 1}.eeff`} label={t('em.res.eeffMode', { mode: modeLabel(m.label, k, locale) })} unit="" floor={FLOOR.ratio} />,
                    <Val key={`d${k}`} q={m.delay} name={`mode${k + 1}.delay`} label={t('em.res.delayMode', { mode: modeLabel(m.label, k, locale) })} unit={dUnit} floor={FLOOR.delay} scale={dScale} />,
                  ])}
                </dl>
                <Why k="modes" />
              </details>
            </>
          )}
          {shown.n === 1 && <p className={css.definition} data-definition="single">{t('em.res.defSingle')}</p>}
          <Whys ks={shown.n === 1 ? 'z0 eeff delay eq-open err solve-status quick' : pair ? `zdiff zcm zodd zeven${pair.symmetric ? '' : ' zdc'} modes eq-open err solve-status quick` : 'lines-each err solve-status quick'} />
          {shown.flags.length > 0 && !quick && (
            <ul className={base.issues} data-flags>
              {shown.flags.map((f) => <li key={f.code} data-flag={f.code}><span className={base.level} data-level="warn">{f.code}</span>{f.message}</li>)}
            </ul>
          )}
          {shown.flags.length > 0 && !quick && <Why k="flags" />}
          <MatrixView r={shown} mx={shown.matrices} quick={quick} />
          <p className={css.small} data-solve-info>
            {t('em.res.info', { M: shown.M, panels: shown.panels, ms: Math.round(shown.ms), where: whereText, err: quick ? t('em.res.infoQuick') : t('em.res.infoFull') })}
          </p>
        </div>
        </Signals.Provider>
        </Overall.Provider>
      )}
      {!shown && state === 'running' && <p className={css.small}>{t('em.res.solving')}</p>}
    </section>
  );
}
