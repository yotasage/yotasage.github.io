// The Trace section's fourth tool, "Calculators" (step M2.3b, in the tools' lazy chunk): the field solver's value; the
// same structure "as JLCPCB's calculator" (lib/emsim/jlcCalc.ts: the inputs JLCPCB's online calculator sends to Polar
// Si9000) with what each of those inputs changes, one at a time, and the button that applies them as one undo step;
// JLCPCB's stated number for the owner's cases; then every closed form of lib/emsim/closedform.ts for the kind, with
// its range, published accuracy, what it leaves out and how the setup was reduced for it. Solves run in the worker
// on the channel `calc`, only while the tool is shown.

import React, { useEffect, useMemo, useState } from 'react';

import { closedForms } from '../../lib/emsim/closedform';
import type { CfKey, CfResult } from '../../lib/emsim/closedform';
import { JLC_PART_LABEL, asJlcpcbCalculator, isJlcpcbCalculator, jlcAllBut, jlcPartsThatChange, jlcpcbStated } from '../../lib/emsim/jlcCalc';
import type { JlcPart } from '../../lib/emsim/jlcCalc';
import type { SolveResult } from '../../lib/emsim/jobs';
import type { LineResults, Q } from '../../lib/emsim/lines';
import { presetStackup } from '../../lib/emsim/presets';
import type { Setup } from '../../lib/emsim/setup';
import type { StaticClient } from '../../lib/emsim/staticClient';
import { UNIT_TEXT, fromMm } from '../../lib/emsim/units';
import type { LengthUnit } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTools.module.css';
import type { Commit } from './StackupSection';
import { FLOOR, qText } from './trace';
import { linesOf } from './tools';
import { feedTheory } from './theoryFeed';
import { Whys } from './Why';

interface Props {
  setup: Setup;
  invalid: string;
  commit: Commit;
  unit: LengthUnit;
  client: () => Promise<StaticClient>;
  active: boolean;
}

interface Run {
  setup: Setup;
  field: LineResults | null;
  jlc: LineResults | null; // null while it runs, or when the setup already is the calculator's
  parts: { part: JlcPart; d: number }[] | null;
  failed: string;
  done: boolean;
}

const main = (r: LineResults | null, n: number): Q | null => (!r || !r.ok ? null : n === 2 && r.pair ? r.pair.zdiff : r.lines[0]?.z0 ?? null);
const ohm = (q: Q | null) => { if (!q) return '–'; const t = qText(q.v, q.e, FLOOR.ohm); return t.e ? `${t.v} ± ${t.e} Ω` : `${t.v} Ω`; };
const sgn = (x: number, dec: number) => `${x < 0 ? '−' : '+'}${Math.abs(x).toFixed(dec)}`;
const pct = (a: number, b: number) => `${sgn((100 * (a - b)) / b, 1)} %`;
const KEY_NAME: Partial<Record<CfKey, string>> = { z0: 'Z0', eeff: 'εeff', zdiff: 'Zdiff', zcm: 'Zcm', zodd: 'Zodd', zeven: 'Zeven' };

// The theory topic each neglect sentence links to (notes-M2.3b.md "For M2.4").
const NEGLECT_TOPIC: Record<string, string> = { 'solder mask': 'solder-mask', 'copper thickness': 'copper-thickness', 'finite ground width': 'coplanar-ground' };

const NEGLECT: Record<string, string> = {
  'solder mask': 'No formula has the solder mask. It adds dielectric over the trace and in the gaps and lowers the impedance (by about 3.5 Ω for a 50 Ω microstrip and 9 Ω for a 100 Ω pair on JLC061611-3313A), so a formula reads high.',
  'copper thickness': 'Kirschning–Jansen and Cohn’s coupled lines take the copper as infinitely thin. Real copper adds capacitance from its side walls, so they read high: 16 Ω on a 100 Ω pair of 0.11 mm traces on JLC061611-3313A from the thickness alone.',
  'finite ground width': 'The coplanar formulas take the grounds beside the trace as unbounded; narrower grounds raise the impedance a little.',
};

export default function CalcTool({ setup, invalid, commit, unit, client, active }: Props) {
  const n = linesOf(setup);
  const cf = useMemo(() => closedForms(setup), [setup]);
  const variant = useMemo(() => asJlcpcbCalculator(setup), [setup]);
  const already = variant.changed.length === 0;
  const stated = useMemo(() => jlcpcbStated(setup, presetStackup(setup.stackup.id)), [setup]);
  const [run, setRun] = useState<Run | null>(null);

  useEffect(() => {
    if (!active || invalid || (run && run.setup === setup && (run.done || run.failed))) return undefined;
    let live = true;
    const r: Run = { setup, field: null, jlc: null, parts: null, failed: '', done: false };
    const show = () => { if (live) setRun({ ...r }); };
    (async () => {
      const c = await client();
      const one = async (s: Setup): Promise<LineResults | null> => {
        const x = await c.run<SolveResult>('calc', { kind: 'solve', setup: s });
        if (!x || !live) return null;
        if (!x.result.ok) { r.failed = x.result.reason || 'The solve failed.'; show(); return null; }
        return x.result;
      };
      r.field = await one(setup); if (!r.field) return; show();
      if (!already) {
        r.jlc = await one(variant.setup); if (!r.jlc) return; show();
        const jv = main(r.jlc, n)!.v;
        const parts: { part: JlcPart; d: number }[] = [];
        for (const p of jlcPartsThatChange(setup)) {
          const x = await one(jlcAllBut(setup, p)); if (!x) return;
          parts.push({ part: p, d: main(x, n)!.v - jv });
        }
        r.parts = parts;
        feedTheory({ calc: { setup, stackup: main(r.field, n)!.v, calculator: jv, parts: Object.fromEntries(parts.map((x) => [x.part, x.d])) } }); // M2.4c
      }
      r.done = true; show();
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, active, invalid]);
  useEffect(() => () => { void client().then((x) => x.cancel('calc')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = run && run.setup === setup ? run : null;
  const fq = main(cur?.field ?? null, n);
  const jq = already ? fq : main(cur?.jlc ?? null, n);
  const qName = n === 2 ? 'Zdiff' : n === 1 ? 'Z0' : 'Z0 of line 1';
  const u = UNIT_TEXT[unit];
  const len = (mm: number) => `${Number(fromMm(mm, unit).toPrecision(4))} ${u}`;
  const state = invalid ? 'invalid' : cur?.failed ? 'failed' : cur?.done ? 'done' : 'running';
  const apply = () => commit((c) => asJlcpcbCalculator(c).setup);
  const together = fq && jq && !already ? fq.v - jq.v : 0;

  return (
    <section className={css.tool} data-tool="calc" aria-label="Calculators" data-state={state}>
      {invalid && <p className={css.small}>{invalid}</p>}
      {cur?.failed && <p className={css.reason}>{cur.failed}</p>}
      <dl className={css.pairs}>
        <div data-calc-row="field" data-v={fq?.v ?? NaN} data-e={fq?.e ?? NaN}>
          <dt>{qName}, this tool</dt><dd className={css.num}>{ohm(fq)}</dd>
        </div>
        <div data-calc-row="jlc" data-v={jq?.v ?? NaN} data-e={jq?.e ?? NaN}>
          <dt>{qName}, as JLCPCB’s calculator</dt><dd className={css.num}>{ohm(jq)}</dd>
        </div>
        {stated && (
          <div data-calc-stated={stated.case} data-v={stated.target}>
            <dt>JLCPCB’s calculator says</dt><dd className={css.num}>{stated.target} Ω at {stated.at}</dd>
          </div>
        )}
      </dl>
      <Whys ks="calc-field calc-jlc calc-stated calc-use calc-parts" />
      <p className={css.busy} aria-live="polite">{state === 'running' ? 'Solving…' : ''}</p>
      <p className={css.small}>
        JLCPCB’s online calculator uses Polar Si9000 with fixed inputs of its own: εr 4.3 for every prepreg, 1.6 mil outer copper, a top 0.5 mil
        narrower than the base and solder mask 1.0 mil on the board and 0.6 mil on the copper (εr 3.8). With those inputs this tool gives the same
        impedance as JLCPCB’s calculator to within about 0.3 %. Why the mask and the narrower top matter:{' '}
        <a href="#solder-mask" data-calc-link="solder-mask">→&nbsp;solder mask</a>,{' '}
        <a href="#trapezoid" data-calc-link="trapezoid">→&nbsp;the trapezoid</a>.
        {fq && jq && !already && Math.abs(together) >= 0.005 && (
          <> With this stackup’s own values it gives {sgn(together, 2)} Ω ({pct(fq.v, jq.v)}), so its widths for a target come out a little
            {together > 0 ? ' wider' : ' narrower'} than JLCPCB’s{Math.abs(fq.v - jq.v) < 0.1 * jq.v ? '; both are well inside JLCPCB’s ±10 %' : ''}.</>
        )}
      </p>
      {stated && jq && (
        <p className={css.small} data-calc-stated-note>
          For this structure JLCPCB’s calculator asks Si9000 for {stated.target} Ω and stops its width search at {stated.siAt}, where Si9000 gives{' '}
          {stated.si.toFixed(2)} Ω. This tool with the same inputs gives {ohm(jq)} at this width: the two solvers agree, and the difference to this
          stackup’s own values comes from the inputs below.
        </p>
      )}
      {variant.kept.length > 0 && <ul className={css.calcList}>{variant.kept.map((k) => <li key={k} className={css.small}>{k}</li>)}</ul>}
      {already ? (
        <p className={css.note} data-calc-applied>This stackup already has JLCPCB’s calculator inputs. Undo returns to its own values.</p>
      ) : (
        <div className={css.buttons}>
          <button type="button" className={base.button} data-calc-use onClick={apply} disabled={!!invalid}>Use JLCPCB’s calculator inputs</button>
        </div>
      )}
      {!already && (
        <>
          <h4 className={css.h4}>From JLCPCB’s inputs to this stackup’s, one at a time</h4>
          <table className={css.calcTable} data-calc-parts>
            <tbody>
              {(cur?.parts ?? []).map(({ part, d }) => (
                <tr key={part} data-calc-part={part} data-d={d}>
                  <th scope="row">{JLC_PART_LABEL[part]}, as this stackup has it</th>
                  <td className={css.num}>{sgn(d, 2)} Ω</td>
                </tr>
              ))}
              {cur?.parts && (
                <tr data-calc-part="all" data-d={together}>
                  <th scope="row">All together (this tool against JLCPCB’s inputs)</th>
                  <td className={css.num}>{sgn(together, 2)} Ω</td>
                </tr>
              )}
            </tbody>
          </table>
          {!cur?.parts && <p className={css.small}>Solving each input in turn…</p>}
        </>
      )}

      <h4 className={css.h4}>Closed-form formulas</h4>
      <Whys ks={cf.results.length === 0 ? 'calc-none' : 'calc-reduced cf calc-kj calc-neglect'} />
      {cf.results.length === 0 ? (
        <p className={css.small} data-calc-none>{cf.notes[0]}</p>
      ) : (
        <>
          {cf.reduced && (
            <p className={css.small} data-calc-reduced>
              The formulas see a rectangle of the trapezoid’s mean width {len(cf.reduced.w)}, copper {len(cf.reduced.t)}
              {cf.reduced.s !== null ? `, gap ${len(cf.reduced.s)}` : ''}{cf.reduced.g !== null ? `, gap to ground ${len(cf.reduced.g)}` : ''},
              {cf.reduced.hFar !== null ? ` planes ${len(cf.reduced.h)} and ${len(cf.reduced.hFar)} away` : ` height ${len(cf.reduced.h)}`} and one εr of{' '}
              {cf.reduced.er.toFixed(3)} for the layers {cf.reduced.hFar !== null ? 'in parallel' : 'in series'}; the field solution takes the trapezoid and every layer as they are.{' '}
              <a href="#field-solver" data-calc-link="field-solver">→&nbsp;how the field solver works</a>
            </p>
          )}
          <div className={css.cfList}>
            {cf.results.map((r) => <Formula key={r.id} r={r} n={n} field={cur?.field ?? null} />)}
          </div>
          {cf.results.some((r) => r.id === 'kj') && (
            <p className={css.note} data-calc-kj>
              Kirschning–Jansen is a zero-thickness value: it is the impedance of copper with no height, so beside a real pair it reads high by
              what the copper’s side walls add (16 Ω on a 100 Ω pair of 0.11 mm traces on JLC061611-3313A).{' '}
              <a href="#copper-thickness" data-calc-link="copper-thickness">→&nbsp;copper thickness</a>
            </p>
          )}
          <ul className={css.calcList}>
            {[...new Set(cf.results.flatMap((r) => r.neglects))].map((k) => <li key={k} className={css.small}>{NEGLECT[k] ?? `Not in the formulas: ${k}.`}{NEGLECT_TOPIC[k] && <>{' '}<a href={`#${NEGLECT_TOPIC[k]}`} data-calc-link={NEGLECT_TOPIC[k]}>→&nbsp;theory</a></>}</li>)}
            {cf.notes.slice(cf.reduced && cf.reduced.etch > 0 ? 2 : 1).map((x) => <li key={x} className={css.small}>{x}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

function Formula({ r, n, field }: { r: CfResult; n: number; field: LineResults | null }) {
  const keys: CfKey[] = n === 2 ? ['zdiff', 'zcm', 'zodd', 'zeven'] : ['z0', 'eeff'];
  const fv = (k: CfKey): number | null => {
    if (!field || !field.ok) return null;
    if (k === 'z0') return field.lines[0].z0.v;
    if (k === 'eeff') return field.lines[0].eeff.v;
    const p = field.pair;
    return p ? (p[k as 'zdiff' | 'zcm' | 'zodd' | 'zeven'] as Q).v : null;
  };
  const mk = n === 2 ? 'zdiff' : 'z0';
  const v = r.values;
  const o = r.validity.outside;
  const acc = r.validity.accuracy && !/^not stated/.test(r.validity.accuracy) ? r.validity.accuracy : 'not stated';
  return (
    <article className={css.cf} data-cf={r.id} data-inside={r.validity.inside} data-v={v[mk] ?? NaN} data-outside={o.map((x) => x.input).join('|')}>
      <h5 className={css.cfName}>{r.name}</h5>
      <dl className={css.cfVals}>
        {keys.filter((k) => v[k] !== undefined).map((k) => {
          const f = fv(k);
          return (
            <div key={k} data-cf-key={k} data-v={v[k]}>
              <dt>{KEY_NAME[k]}</dt>
              <dd><span className={css.num}>{k === 'eeff' ? v[k]!.toFixed(3) : `${v[k]!.toFixed(2)} Ω`}</span>{f !== null && <span className={css.err}> ({pct(v[k]!, f)} to the field solution)</span>}</dd>
            </div>
          );
        })}
      </dl>
      <p className={css.small} data-cf-range>
        {r.validity.inside ? <>Inside its range ({r.validity.range}).</> : (
          <span className={css.cfOut}>Outside its range ({r.validity.range}): {o.map((x) => `${x.input} ${Number(x.value.toPrecision(3))} is ${x.side} ${Number(x.limit.toPrecision(3))}`).join('; ')}.</span>
        )}
        {' '}Published accuracy: {acc}.{r.neglects.length > 0 && <> Leaves out: {r.neglects.join(', ')}.</>}
        {r.id === 'ipc-microstrip' && ' The crudest of the three: on a bare 50 Ω trace on JLC061611-3313A it reads about 9 % low, so close agreement on a masked board is its error and the missing mask cancelling.'}
        {' '}<a href="#closed-forms" data-calc-link="closed-forms">→&nbsp;ranges and accuracy</a>
      </p>
    </article>
  );
}
