// The via target (step M3.2b): the antipad diameter or the return vias' distance for a target impedance of the via
// section (√(L/C) of a single via, Zdiff or Zcm of a pair), by the worker's `via-target` job (viamodel.ts `viaTarget`).
// The result shows the value found, the impedance reached with its error, or the engine's reason with the range it
// searched; "Use this" commits the via found as one undo step.

import React, { useEffect, useRef, useState } from 'react';

import type { Setup } from '../../lib/emsim/setup';
import type { LengthUnit } from '../../lib/emsim/units';
import { readPlain } from '../../lib/emsim/units';
import type { ViaStructure } from '../../lib/emsim/via';
import type { ViaTargetKey, ViaTargetResult, ViaTargetVary } from '../../lib/emsim/viamodel';
import base from '../../styles/EmSim.module.css';
import stk from '../../styles/EmSimStackup.module.css';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import { lenText } from './format';
import type { Commit } from './StackupSection';
import { FLOOR, qText } from './trace';
import { getClient } from './TraceSection';
import { NumInput } from './ValField';
import { Whys } from './Why';

const KEY_LABEL: Record<ViaTargetKey, string> = { z: 'Z, the via section’s √(L/C)', zdiff: 'Zdiff of the via section', zcm: 'Zcm of the via section' };
const DEFAULT_TARGET: Record<ViaTargetKey, number> = { z: 50, zdiff: 90, zcm: 30 };

/** The reached value's error, as ViaResults gives the section's. */
function errorOf(r: ViaTargetResult): number {
  const m = r.model;
  if (!m || !m.ok || !m.lumped) return NaN;
  const vac = r.key === 'z' ? [m.barrel.zVacErr, m.barrel.zVac] : r.key === 'zdiff' ? [m.barrel.zdiffVacErr, m.barrel.zdiffVac] : [m.barrel.zcmVacErr, m.barrel.zcmVac];
  const rel = Math.abs(vac[0] / vac[1]) || 0;
  const dCe = m.nodes.reduce((a, n) => a + Math.abs(n.dCErr), 0) / m.n;
  const L = m.lumped;
  return r.value * 0.5 * (rel + (L.lineC * rel + dCe) / L.C[0][0]);
}

export default function ViaTarget({ s, v, commit, unit, digits }: { s: Setup['stackup']; v: ViaStructure; commit: Commit; unit: LengthUnit; digits: number }) {
  const pair = !!v.pitch;
  const [key0, setKey] = useState<ViaTargetKey>('z');
  const key: ViaTargetKey = pair ? (key0 === 'z' ? 'zdiff' : key0) : 'z';
  const [targets, setTargets] = useState<Record<ViaTargetKey, number>>(DEFAULT_TARGET);
  const target = targets[key];
  const [vary, setVary] = useState<ViaTargetVary>('antipad');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ r: ViaTargetResult; v: ViaStructure; s: Setup['stackup'] } | null>(null);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState(0);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; void getClient().then((c) => c.cancel('via-target')); }, []);
  const solve = () => {
    setBusy(true);
    setError('');
    const via = v, st = s;
    void getClient()
      .then((c) => c.run<ViaTargetResult>('via-target', { kind: 'via-target', setup: { stackup: st, via, trace: null }, key, target, vary, opt: { tdr: false, nf: 2 } }))
      .then((rr) => { if (!live.current || !rr) return; setRes({ r: rr.result, v: via, s: st }); setRuns((n) => n + 1); setBusy(false); },
        (e) => { if (!live.current) return; setError(`The target could not be solved: ${e instanceof Error ? e.message : String(e)}`); setBusy(false); });
  };
  const r = res?.r ?? null;
  const used = !!r && !!r.via && r.via === v;
  const stale = !!res && !used && (res.v !== v || res.s !== s);
  const what = vary === 'antipad' ? 'Antipad Ø' : 'Nearest return via at';
  const e = r && r.reached ? errorOf(r) : NaN;
  const q = r && r.reached ? qText(r.value, e, FLOOR.ohm) : null;
  return (
    <div className={vcss.plots} data-via-target data-state={busy ? 'running' : r ? (r.reached ? 'reached' : 'unreached') : 'idle'} data-stale={stale} data-runs={runs}>
      <h4 className={vcss.h4}>Target</h4>
      <div className={vcss.plotControls}>
        {pair && (
          <label className={css.ctl}>
            Quantity
            <select className={base.select} data-via-target-key value={key} onChange={(ev) => setKey(ev.target.value as ViaTargetKey)}>
              {(['zdiff', 'zcm'] as ViaTargetKey[]).map((k) => <option key={k} value={k}>{KEY_LABEL[k]}</option>)}
            </select>
          </label>
        )}
        <div className={stk.field} data-field="via.target">
          <label className={stk.fieldLabel} htmlFor="via-target">{pair ? 'Target' : `Target ${KEY_LABEL.z}`}</label>
          <div className={stk.valueRow}>
            <NumInput id="via-target" className={base.input} shown={String(target)} aria-invalid={reason ? true : undefined}
              parse={(x) => readPlain(x.replace(/\s*(Ω|ohms?)\s*$/i, ''), { min: 1, max: 1000, what: 'The target' })} onReason={setReason}
              onValue={(x) => setTargets((t) => ({ ...t, [key]: x }))} />
            <span className={stk.unit}>Ω</span>
          </div>
          {reason && <p className={stk.reason} role="alert">{reason}</p>}
        </div>
        <label className={css.ctl}>
          By changing
          <select className={base.select} data-via-target-vary value={vary} onChange={(ev) => setVary(ev.target.value as ViaTargetVary)}>
            <option value="antipad">The antipad diameter (every plane)</option>
            <option value="returns" disabled={!v.returns.length}>The return vias’ distance</option>
          </select>
        </label>
        <button type="button" className={base.button} data-via-target-solve onClick={solve} disabled={busy || !!reason}>{busy ? 'Solving…' : 'Find'}</button>
      </div>
      {error && <p className={css.refused} role="alert">{error}</p>}
      {r && !busy && (r.reached ? (
        <p className={vcss.targetResult} data-via-target-result data-x={r.x} data-value={r.value} data-err={e} data-key={r.key} data-vary={r.vary} data-solves={r.solves}>
          {what} {lenText(r.x, unit, digits)} gives {KEY_LABEL[r.key].split(',')[0].split(' of')[0]} {q.v}{q.e ? ` ± ${q.e}` : ''} Ω ({r.solves} solves, {Math.round(r.ms)} ms).{' '}
          {used ? <span data-via-target-used>In use.</span> : stale ? <span data-via-target-stale>The via has changed since; find again.</span> : (
            <button type="button" className={base.button} data-via-target-use onClick={() => { const n = r.via; if (n) commit((cur) => (cur.via ? { ...cur, via: n } : cur)); }}>Use this</button>
          )}
        </p>
      ) : (
        <p className={css.refused} data-via-target-reason>Out of reach: {r.reason}</p>
      ))}
      <Whys ks="via-target via-target-vary via-target-use" />
    </div>
  );
}
