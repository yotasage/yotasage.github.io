// The Trace section's fourth tool, "Calculators" (step M2.3b, in the tools' lazy chunk): the field solver's value; the
// same structure "as JLCPCB's calculator" (lib/emsim/jlcCalc.ts: the inputs JLCPCB's online calculator sends to Polar
// Si9000) with what each of those inputs changes, one at a time, and the button that applies them as one undo step;
// JLCPCB's stated number for the owner's cases; then every closed form of lib/emsim/closedform.ts for the kind, with
// its range, published accuracy, what it leaves out and how the setup was reduced for it. Solves run in the worker
// on the channel `calc`, only while the tool is shown.

import React, { useEffect, useMemo, useState } from 'react';

import { closedForms } from '../../lib/emsim/closedform';
import type { CfKey, CfResult } from '../../lib/emsim/closedform';
import { asJlcpcbCalculator, jlcAllBut, jlcPartsThatChange, jlcpcbStated } from '../../lib/emsim/jlcCalc';
import type { JlcPart } from '../../lib/emsim/jlcCalc';
import type { SolveResult } from '../../lib/emsim/jobs';
import type { LineResults, Q } from '../../lib/emsim/lines';
import { presetStackup } from '../../lib/emsim/presets';
import type { Setup } from '../../lib/emsim/setup';
import type { StaticClient } from '../../lib/emsim/staticClient';
import { UNIT_TEXT, fromMm } from '../../lib/emsim/units';
import type { LengthUnit } from '../../lib/emsim/units';
import { useI18n } from '../../lib/ui/i18n';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTools.module.css';
import { jlcPartLabel, neglectName, neglectText } from './emText';
import type { Commit } from './StackupSection';
import { FLOOR, qText } from './trace';
import { linesOf } from './tools';
import { feedExport } from './exportFeed';
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

export default function CalcTool({ setup, invalid, commit, unit, client, active }: Props) {
  const { t, locale } = useI18n();
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
        if (!x.result.ok) { r.failed = x.result.reason || t('em.calc.solveFailed'); show(); return null; }
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
  const qName = n === 2 ? 'Zdiff' : n === 1 ? 'Z0' : t('em.calc.z0Line1');
  const u = UNIT_TEXT[unit];
  const len = (mm: number) => `${Number(fromMm(mm, unit).toPrecision(4))} ${u}`;
  const state = invalid ? 'invalid' : cur?.failed ? 'failed' : cur?.done ? 'done' : 'running';
  const apply = () => commit((c) => asJlcpcbCalculator(c).setup);
  const together = fq && jq && !already ? fq.v - jq.v : 0;
  // M8.2b: the finished comparison for the report (Export section); none while it runs or after it failed.
  useEffect(() => {
    if (!cur || !cur.done || !fq) { feedExport({ calc: null }); return; }
    const mk: CfKey = n === 2 ? 'zdiff' : 'z0';
    feedExport({
      calc: {
        setup, name: qName, field: fq, jlc: jq, stated: stated ? { target: stated.target, at: stated.at } : null,
        forms: cf.results.map((r) => ({ name: r.name, v: r.values[mk] ?? null, inside: r.validity.inside, range: r.validity.range, accuracy: r.validity.accuracy && !/^not stated/.test(r.validity.accuracy) ? r.validity.accuracy : 'not stated' })),
      },
    });
    // qName and n follow setup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, fq, jq, stated, cf, setup]);
  useEffect(() => () => feedExport({ calc: null }), []);

  return (
    <section className={css.tool} data-tool="calc" aria-label={t('em.calc.aria')} data-state={state}>
      {invalid && <p className={css.small}>{invalid}</p>}
      {cur?.failed && <p className={css.reason}>{cur.failed}</p>}
      <dl className={css.pairs}>
        <div data-calc-row="field" data-v={fq?.v ?? NaN} data-e={fq?.e ?? NaN}>
          <dt>{t('em.calc.thisTool', { q: qName })}</dt><dd className={css.num}>{ohm(fq)}</dd>
        </div>
        <div data-calc-row="jlc" data-v={jq?.v ?? NaN} data-e={jq?.e ?? NaN}>
          <dt>{t('em.calc.asJlc', { q: qName })}</dt><dd className={css.num}>{ohm(jq)}</dd>
        </div>
        {stated && (
          <div data-calc-stated={stated.case} data-v={stated.target}>
            <dt>{t('em.calc.jlcSays')}</dt><dd className={css.num}>{t('em.calc.targetAt', { target: stated.target, at: stated.at })}</dd>
          </div>
        )}
      </dl>
      <Whys ks="calc-field calc-jlc calc-stated calc-use calc-parts" />
      <p className={css.busy} aria-live="polite">{state === 'running' ? t('em.calc.solving') : ''}</p>
      <p className={css.small}>
        {t('em.calc.jlcExplain')}{' '}
        <a href="#solder-mask" data-calc-link="solder-mask">{t('em.calc.linkMask')}</a>,{' '}
        <a href="#trapezoid" data-calc-link="trapezoid">{t('em.calc.linkTrap')}</a>.
        {fq && jq && !already && Math.abs(together) >= 0.005 && (
          t(together > 0 ? 'em.calc.ownDiffWider' : 'em.calc.ownDiffNarrower', {
            diff: sgn(together, 2),
            pct: pct(fq.v, jq.v),
            inside: Math.abs(fq.v - jq.v) < 0.1 * jq.v ? t('em.calc.inside10') : '',
          })
        )}
      </p>
      {stated && jq && (
        <p className={css.small} data-calc-stated-note>
          {t('em.calc.statedNote', { target: stated.target, siAt: stated.siAt, si: stated.si.toFixed(2), jq: ohm(jq) })}
        </p>
      )}
      {variant.kept.length > 0 && <ul className={css.calcList}>{variant.kept.map((k) => <li key={k} className={css.small}>{k}</li>)}</ul>}
      {already ? (
        <p className={css.note} data-calc-applied>{t('em.calc.already')}</p>
      ) : (
        <div className={css.buttons}>
          <button type="button" className={base.button} data-calc-use onClick={apply} disabled={!!invalid}>{t('em.calc.useJlc')}</button>
        </div>
      )}
      {!already && (
        <>
          <h4 className={css.h4}>{t('em.calc.oneAtTime')}</h4>
          <table className={css.calcTable} data-calc-parts>
            <tbody>
              {(cur?.parts ?? []).map(({ part, d }) => (
                <tr key={part} data-calc-part={part} data-d={d}>
                  <th scope="row">{t('em.calc.asStackup', { part: jlcPartLabel(part, locale) })}</th>
                  <td className={css.num}>{sgn(d, 2)} Ω</td>
                </tr>
              ))}
              {cur?.parts && (
                <tr data-calc-part="all" data-d={together}>
                  <th scope="row">{t('em.calc.allTogether')}</th>
                  <td className={css.num}>{sgn(together, 2)} Ω</td>
                </tr>
              )}
            </tbody>
          </table>
          {!cur?.parts && <p className={css.small}>{t('em.calc.solvingEach')}</p>}
        </>
      )}

      <h4 className={css.h4}>{t('em.calc.cfHeading')}</h4>
      <Whys ks={cf.results.length === 0 ? 'calc-none' : 'calc-reduced cf calc-kj calc-neglect'} />
      {cf.results.length === 0 ? (
        <p className={css.small} data-calc-none>{cf.notes[0]}</p>
      ) : (
        <>
          {cf.reduced && (
            <p className={css.small} data-calc-reduced>
              {t('em.calc.reducedBase', {
                w: len(cf.reduced.w),
                t: len(cf.reduced.t),
                s: cf.reduced.s !== null ? t('em.calc.reducedGap', { v: len(cf.reduced.s) }) : '',
                g: cf.reduced.g !== null ? t('em.calc.reducedGnd', { v: len(cf.reduced.g) }) : '',
                h: cf.reduced.hFar !== null ? t('em.calc.reducedPlanes', { h: len(cf.reduced.h), hFar: len(cf.reduced.hFar) }) : t('em.calc.reducedHeight', { h: len(cf.reduced.h) }),
                er: cf.reduced.er.toFixed(3),
                comb: cf.reduced.hFar !== null ? t('em.calc.parallel') : t('em.calc.series'),
              })}{' '}
              <a href="#field-solver" data-calc-link="field-solver">{t('em.calc.linkSolver')}</a>
            </p>
          )}
          <div className={css.cfList}>
            {cf.results.map((r) => <Formula key={r.id} r={r} n={n} field={cur?.field ?? null} />)}
          </div>
          {cf.results.some((r) => r.id === 'kj') && (
            <p className={css.note} data-calc-kj>
              {t('em.calc.kjNote')}{' '}
              <a href="#copper-thickness" data-calc-link="copper-thickness">{t('em.calc.linkCopper')}</a>
            </p>
          )}
          <ul className={css.calcList}>
            {[...new Set(cf.results.flatMap((r) => r.neglects))].map((k) => (
              <li key={k} className={css.small}>
                {neglectText(k, locale)}
                {NEGLECT_TOPIC[k] && <>{' '}<a href={`#${NEGLECT_TOPIC[k]}`} data-calc-link={NEGLECT_TOPIC[k]}>{t('em.calc.linkTheory')}</a></>}
              </li>
            ))}
            {cf.notes.slice(cf.reduced && cf.reduced.etch > 0 ? 2 : 1).map((x) => <li key={x} className={css.small}>{x}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

function Formula({ r, n, field }: { r: CfResult; n: number; field: LineResults | null }) {
  const { t, locale } = useI18n();
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
  const acc = r.validity.accuracy && !/^not stated/.test(r.validity.accuracy) ? r.validity.accuracy : t('em.calc.notStated');
  return (
    <article className={css.cf} data-cf={r.id} data-inside={r.validity.inside} data-v={v[mk] ?? NaN} data-outside={o.map((x) => x.input).join('|')}>
      <h5 className={css.cfName}>{r.name}</h5>
      <dl className={css.cfVals}>
        {keys.filter((k) => v[k] !== undefined).map((k) => {
          const f = fv(k);
          return (
            <div key={k} data-cf-key={k} data-v={v[k]}>
              <dt>{KEY_NAME[k]}</dt>
              <dd><span className={css.num}>{k === 'eeff' ? v[k]!.toFixed(3) : `${v[k]!.toFixed(2)} Ω`}</span>{f !== null && <span className={css.err}>{t('em.calc.toField', { pct: pct(v[k]!, f) })}</span>}</dd>
            </div>
          );
        })}
      </dl>
      <p className={css.small} data-cf-range>
        {r.validity.inside ? <>{t('em.calc.insideRange', { range: r.validity.range })}</> : (
          <span className={css.cfOut}>
            {t('em.calc.outsideRange', {
              range: r.validity.range,
              items: o.map((x) => t('em.calc.outsideItem', {
                input: x.input,
                value: Number(x.value.toPrecision(3)),
                side: x.side === 'below' ? t('em.calc.sideBelow') : t('em.calc.sideAbove'),
                limit: Number(x.limit.toPrecision(3)),
              })).join('; '),
            })}
          </span>
        )}
        {t('em.calc.accuracy', { acc })}
        {r.neglects.length > 0 && t('em.calc.leavesOut', { items: r.neglects.map((x) => neglectName(x, locale)).join(', ') })}
        {r.id === 'ipc-microstrip' && t('em.calc.ipcNote')}
        {' '}<a href="#closed-forms" data-calc-link="closed-forms">{t('em.calc.linkClosedForms')}</a>
      </p>
    </article>
  );
}
