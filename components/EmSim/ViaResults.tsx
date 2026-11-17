// The Via section's results (step M3.1a): what the worker's `via` job gives (lib/emsim/viamodel.ts ViaModelResult,
// the TDR and the sweep are drawn by ViaPlots, M3.2a). The barrel as a line in the core (Z, or Zdiff
// and Zcm for a pair) and the section as one element (√(L/C), its L, C and delay), each piece of barrel, the extra
// capacitance per crossing, the stubs' resonance with their pads and bare, the feeds, the model's flags with their
// numbers and its assumptions. Digits follow the error (engine.md §8): the barrel's from the cut's estimate, ΔC's from
// the axisymmetric estimate, the section's from both (bounds added: ½ of C's and the lines' relative errors).
// While a new solve runs the old values stay, dimmed (data-stale).

import React from 'react';

import type { Stackup } from '../../lib/emsim/stackup';
import { stackZ } from '../../lib/emsim/stackup';
import type { ViaModelResult, ViaPiece } from '../../lib/emsim/viamodel';
import type { LengthUnit } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import { lenText } from './format';
import { EqNum, viaEq } from './eqLinks';
import { FLOOR, qText } from './trace';
import type { RunState } from './TraceResults';
import { realStubs } from '../../lib/emsim/viaGeom';
import type { ViaStructure } from '../../lib/emsim/via';
import { Why } from './Why';

/** The assumption ids of viaModel as sentences. */
export const ASSUME_TEXT: Readonly<Record<string, string>> = {
  'quasi-static': 'Quasi-static: the barrel, pads and planes are lines and lumped capacitances, right while each part is short against the wavelength.',
  lossless: 'No losses: copper and laminate are ideal.',
  'returns-whole-barrel': 'The return vias run the whole barrel between the planes they join, as a line around it.',
  'solid-barrel': 'The barrel is solid copper of the drill’s diameter.',
  'mask-as-air': 'The solder mask around the pads on the outside is taken as air.',
  'feeds-to-pad-edge': 'The feed traces end at the pad’s edge; their length is counted to the via’s centre.',
  'pad-coupling-estimate': 'The pads’ coupling across the pair is an estimate from the barrel pair’s cut, not yet checked.',
  'antipad-as-round': 'An oblong or joined antipad is solved as a round one of its width around each via (the drawing shows its real shape).',
};

const ps = (s: number) => s * 1e12;
// M4.3a: the via's signals, which decide the numbers with an equation (eqLinks.tsx viaEq).
const Signals = React.createContext(0);
/** A number of the via's results, a button to its equation where it has one (`v` in SI, `scale` to the shown unit). */
function Num({ name, label, text, v, scale = 1 }: { name: string; label: string; text: string; v: number; scale?: number }) {
  const n = React.useContext(Signals);
  return viaEq(name, n) && Number.isFinite(v) ? <EqNum section="via" name={name} label={label} text={text} v={v} scale={scale} /> : <>{text}</>;
}

function V({ name, label, v, e, floor, unit, scale = 1, si = 1, big, note }: { name: string; label: string; v: number; e: number; floor: number; unit: string; scale?: number; si?: number; big?: boolean; note?: React.ReactNode }) {
  const t = qText(v, e, floor, scale);
  return (
    <div className={big ? css.big : css.val} data-via-q={name} data-v={v} data-e={e}>
      <dt>{label}</dt>
      <dd>
        <span className={css.num}><Num name={name} label={label} text={t.v} v={v / si} scale={si * scale} /></span>
        {t.e && <span className={css.err}> ± {t.e}</span>}
        <span className={css.qUnit}> {unit}</span>
        {note && <span className={css.qNote}>{note}</span>}
      </dd>
    </div>
  );
}

// Adjacent pieces of one dielectric with the same line merged, each named by the layers it spans.
export function pieceRows(s: Stackup, pieces: ViaPiece[]): { names: string; len: number; er: number; z: number; zdiff: number; zcm: number; delay: number; part: string; first: number; count: number }[] {
  const z = stackZ(s);
  const nameAt = (zz: number) => { for (let i = 0; i < s.layers.length; i++) if (zz <= z[i] + 1e-12 && zz >= z[i + 1] - 1e-12) return s.layers[i].name || s.layers[i].id; return '?'; };
  const out: ReturnType<typeof pieceRows> = [];
  for (let k = 0; k < pieces.length; k++) {
    const p = pieces[k];
    const nm = nameAt(0.5 * (p.zTop + p.zBot));
    const last = out[out.length - 1];
    if (last && last.part === p.part && last.er === p.er && Math.abs(last.z - p.z0) < 1e-9 * p.z0) {
      last.len += p.zTop - p.zBot;
      last.delay += p.delay;
      last.count++;
      if (!last.names.endsWith(nm)) last.names = `${last.names.split('–')[0]}–${nm}`;
      continue;
    }
    out.push({ names: nm, len: p.zTop - p.zBot, er: p.er, z: p.z0, zdiff: p.zdiff, zcm: p.zcm, delay: p.delay, part: p.part, first: k, count: 1 });
  }
  return out;
}

// M3.1b: `quick` (a drag's fast path, without error estimates): the values without their errors, and a note.
function ViaResults({ r, s, v, state, stale, message, ms, unit, digits, quick = false }: { r: ViaModelResult | null; s: Stackup; v: ViaStructure; state: RunState; stale: boolean; message: string; ms: number; unit: LengthUnit; digits: number; quick?: boolean }) {
  const z = quick ? 0 : 1;
  const ok = r && r.ok;
  const pair = ok && r.n === 2;
  const core = ok ? (r.pieces.filter((p) => p.part === 'through').sort((a, b) => b.zTop - b.zBot - (a.zTop - a.zBot))[0] ?? r.pieces[0]) : null;
  // Relative errors: the cut's (the lines) and the section's.
  const rel = ok ? z * Math.abs(r.barrel.zVacErr / r.barrel.zVac) || 0 : 0;
  const relD = pair ? z * Math.abs(r.barrel.zdiffVacErr / r.barrel.zdiffVac) || 0 : 0;
  const relC = pair ? z * Math.abs(r.barrel.zcmVacErr / r.barrel.zcmVac) || 0 : 0;
  const L = ok ? r.lumped : null;
  const dCe = ok ? z * r.nodes.reduce((a, n) => a + Math.abs(n.dCErr), 0) / r.n : 0;
  const Ctot = L ? L.C[0][0] : NaN;
  const relSec = L ? 0.5 * (rel + (L.lineC * rel + dCe) / Ctot) : 0;
  const nodes = ok ? r.nodes.filter((n) => n.layer) : [];
  const stubs = ok ? realStubs(s, v, r.stubs) : [];
  return (
    <div className={css.results} data-via-results data-state={state} data-stale={stale} data-n={ok ? r.n : 0} data-ms={ok ? r.ms.toFixed(2) : ''} data-rt={ms.toFixed(1)}>
      <div className={css.resultsHead}>
        <h3 className={base.h3}>Results</h3>
        {state === 'running' ? <span className={css.busy} role="status">Solving…</span> : quick && <span className={css.busy} data-via-quick>Coarse while dragging</span>}
      </div>
      <Why k="via-solve" bare />
      {state === 'invalid' && <p className={css.reasonText} data-via-invalid>{message}</p>}
      {state === 'error' && <p className={css.reasonText} role="alert">{message}</p>}
      {r && !r.ok && state === 'done' && <p className={css.reasonText} data-via-reason>{r.reason}</p>}
      {ok && (
        <Signals.Provider value={r.n}>
        <div className={css.values}>
          <dl className={css.grid}>
            {pair ? (
              <>
                <V big name="barrel-zdiff" label={`Barrel Zdiff (εr ${core.er})`} v={core.zdiff} e={core.zdiff * relD} floor={FLOOR.ohm} unit="Ω" />
                <V name="barrel-zcm" label="Barrel Zcm" v={core.zcm} e={core.zcm * relC} floor={FLOOR.ohm} unit="Ω" />
                <V big name="section-zdiff" label="Via section Zdiff" v={L.zdiff} e={L.zdiff * (0.5 * relD + 0.5 * (L.lineC * relD + dCe) / Ctot)} floor={FLOOR.ohm} unit="Ω" />
                <V name="section-zcm" label="Via section Zcm" v={L.zcm} e={L.zcm * (0.5 * relC + 0.5 * (L.lineC * relC + dCe) / Ctot)} floor={FLOOR.ohm} unit="Ω" />
              </>
            ) : (
              <>
                <V big name="barrel-z" label={`Barrel Z (εr ${core.er})`} v={core.z0} e={core.z0 * rel} floor={FLOOR.ohm} unit="Ω" />
                <V big name="section-z" label="Via section √(L/C)" v={L.z} e={L.z * relSec} floor={FLOOR.ohm} unit="Ω" />
              </>
            )}
            <V name="delay" label="Delay through" v={ps(L.delay)} e={ps(L.delay) * relSec} floor={0.01} unit="ps" si={1e12} />
            <V name="L" label={pair ? 'L (each via)' : 'L'} v={L.L[0][0] * 1e9} e={L.L[0][0] * 1e9 * rel} floor={0.001} unit="nH" si={1e9} />
            <V name="C" label={pair ? 'C (each via)' : 'C'} v={Ctot * 1e15} e={(L.lineC * rel + dCe) * 1e15} floor={0.1} unit="fF" si={1e15} note={<>of which pads and planes <Num name="dcsum" label="Pads and planes" text={qText(L.dCsum * 1e15, dCe * 1e15, 0.1).v} v={L.dCsum} scale={1e15} /> fF</>} />
          </dl>
          <div className={vcss.whyRow}><Why k="via-barrel-z" /><Why k="via-section-z" /><Why k="via-delay" /><Why k="via-lc" /><Why k="eq-via-open" /></div>

          <h4 className={vcss.h4}>Barrel, piece by piece</h4>
          <div className={vcss.tableScroll}>
            <table className={vcss.table} data-via-segments={r.pieces.length}>
              <thead><tr><th>Through</th><th>Length</th><th>εr</th>{pair ? <><th>Zdiff Ω</th><th>Zcm Ω</th></> : <th>Z Ω</th>}<th>Delay ps</th></tr></thead>
              <tbody>
                {pieceRows(s, r.pieces).map((p, i) => (
                  <tr key={i} data-via-seg={p.part}>
                    <td>{p.names}{p.part !== 'through' ? ` (${p.part})` : ''}</td>
                    <td>{lenText(p.len, unit, Math.min(digits, 3))}</td>
                    <td>{p.er}</td>
                    {pair ? <><td>{qText(p.zdiff, p.zdiff * relD, FLOOR.ohm).v}</td><td>{qText(p.zcm, p.zcm * relC, FLOOR.ohm).v}</td></> : <td><Num name={`piece.${p.first}.z`} label={`Z of ${p.names}`} text={qText(p.z, p.z * rel, FLOOR.ohm).v} v={p.z} /></td>}
                    <td>{p.count === 1 ? <Num name={`piece.${p.first}.delay`} label={`Delay of ${p.names}`} text={ps(p.delay).toFixed(2)} v={p.delay} scale={1e12} /> : ps(p.delay).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Why k="via-segments" bare />

          <h4 className={vcss.h4}>Pads and planes</h4>
          <div className={vcss.tableScroll}>
            <table className={vcss.table} data-via-crossings={nodes.length}>
              <thead><tr><th>Layer</th><th>ΔC{pair ? ' (each via)' : ''}</th></tr></thead>
              <tbody>
                {nodes.map((n, i) => {
                  const t = qText(n.dC * 1e15, z * n.dCErr * 1e15, 0.01);
                  return <tr key={i} data-via-node={n.layer} data-v={n.dC} data-e={n.dCErr}><td>{n.layer}</td><td>{t.v}{t.e && <span className={css.err}> ± {t.e}</span>} fF</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <Why k="via-crossings" bare />

          <h4 className={vcss.h4}>Stubs</h4>
          {stubs.length ? (
            <ul className={vcss.list}>
              {stubs.map((st) => (
                <li key={st.side} data-via-stub-result={st.side} data-f={st.fRes ?? NaN} data-f0={st.fFormula}>
                  The {st.side} stub, {lenText(st.length, unit, Math.min(digits, 3))}, {Number.isFinite(st.fRes) ? <>resonates at <b className={css.num}>{(st.fRes / 1e9).toFixed(2)} GHz</b> with its pads</> : <>has no resonance with its pads below twice the bare one</>} (<Num name={`stub.${st.side}`} label={`The ${st.side} stub bare`} text={(st.fFormula / 1e9).toFixed(2)} v={st.fFormula} scale={1e-9} /> GHz bare, c₀/4ℓ√εr).
                </li>
              ))}
            </ul>
          ) : <p className={css.small} data-via-stub-result="none">No stub: the barrel ends on the signal layers.</p>}
          <Why k="via-stubs" bare />

          {r.feeds.length > 0 && (
            <>
              <h4 className={vcss.h4}>Feed traces</h4>
              <ul className={vcss.list}>
                {r.feeds.map((f) => (
                  <li key={f.side} data-via-feed-result={f.side} data-z={f.z0}>
                    {f.side === 'entry' ? 'In' : 'Out'} on {f.layer}: {lenText(f.length, unit, Math.min(digits, 3))} to the pad, <b className={css.num}>{f.z0.toFixed(2)} Ω</b>, εeff {f.eeff.toFixed(3)}
                  </li>
                ))}
              </ul>
              <Why k="via-feed-z" bare />
            </>
          )}

          <p className={css.small} data-via-valid={r.valid.fMax}>
            The model holds to <b>{(r.valid.fMax / 1e9).toFixed(1)} GHz</b>{r.valid.cavity <= r.valid.fMax ? ' (the plane cavity: above it the radial wave between the planes takes power past the return vias)' : ''}; its lumped parts to <Num name="valid" label="Lumped parts hold to" text={(r.valid.lumped / 1e9).toFixed(1)} v={r.valid.lumped} scale={1e-9} /> GHz (λ/8). Flags are for a {ps(r.tr).toFixed(0)} ps edge, whose band reaches <Num name="band" label="The edge’s band" text={(r.band / 1e9).toFixed(1)} v={r.band} scale={1e-9} /> GHz.
          </p>
          <Why k="via-valid" bare />

          <h4 className={vcss.h4}>Flags</h4>
          {r.flags.length ? (
            <ul className={base.issues} data-via-flags={r.flags.length}>
              {r.flags.map((f, i) => (
                <li key={i} data-via-flag={f.code} data-numbers={f.numbers.join(' ')}>
                  <span className={base.level} data-level={f.level === 'error' ? 'error' : f.level === 'warning' ? 'warn' : 'note'}>{f.level === 'info' ? 'note' : f.level}</span>{f.message}
                </li>
              ))}
            </ul>
          ) : <p className={css.small} data-via-flags="0">None: the model holds for this via and edge.</p>}
          <Why k="via-flags" bare />

          <details className={css.details} data-via-assumptions>
            <summary>What the model assumes</summary>
            <ul className={vcss.list}>
              {r.assumptions.map((a) => <li key={a} data-via-assume={a}>{ASSUME_TEXT[a] ?? a}</li>)}
            </ul>
          </details>
          <Why k="via-assumptions" bare />
          <p className={css.small} data-via-next>Next: full-wave waves.</p>
          <Why k="via-next" bare />
        </div>
        </Signals.Provider>
      )}
      {r && !r.ok && r.flags.length > 0 && (
        <ul className={base.issues} data-via-flags={r.flags.length}>
          {r.flags.map((f, i) => <li key={i} data-via-flag={f.code} data-numbers={f.numbers.join(' ')}><span className={base.level} data-level="error">{f.level}</span>{f.message}</li>)}
        </ul>
      )}
    </div>
  );
}

export default React.memo(ViaResults);
