// The Trace section's tools (step M2.3a), loaded by import() when a tool is first opened: the target (the width, the
// gap, or both at a fixed ratio for a target Z0, Zdiff or Zcm, through the worker's `inverse` job, with "Use this
// width"), sweeps of any input (`sweep` job, drawn as its points arrive, cancellable) and the tolerance band (`corners`
// and `montecarlo` jobs over the placeholder tolerances of tools.ts where none is typed) with the sensitivity ranking.
// Every job runs in the static worker on a channel of its own; an edit of the setup cancels what runs and marks what
// is shown as made for the earlier setup. Numbers follow engine.md §8 (digits no finer than the error).

import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { InverseKey, InverseResult, InverseVary } from '../../lib/emsim/inverse';
import type { SolveResult, StaticJob, SweepPartial } from '../../lib/emsim/jobs';
import type { LineResults } from '../../lib/emsim/lines';
import { extent, frac, linspace, niceAxis, readAt, tickText, ticks } from '../../lib/emsim/plot';
import type { Setup } from '../../lib/emsim/setup';
import { TYPED } from '../../lib/emsim/stackup';
import type { StaticClient } from '../../lib/emsim/staticClient';
import { UNIT_TEXT, fromMm, toMm } from '../../lib/emsim/units';
import type { LengthUnit } from '../../lib/emsim/units';
import { MC_SAMPLES, MC_SEED, inputsOf } from '../../lib/emsim/vary';
import type { CornersResult, McResult, SweepPoint, SweepResult } from '../../lib/emsim/vary';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTools.module.css';
import Plot from './Plot';
import type { PlotSeries } from './Plot';
import type { Commit } from './StackupSection';
import { FLOOR, qText } from './trace';
import { PLACEHOLDER, SWEEP_MAX, SWEEP_POINTS, TARGET_DEFAULT, defaultRange, linesOf, mainKeyOf, outputsOf, readTarget, shares, targetChoices, withPlaceholders } from './tools';
import type { Quantity } from './tools';

export type ToolName = 'target' | 'sweep' | 'tolerance';
type GetClient = () => Promise<StaticClient>;

interface Props {
  tool: ToolName | null;
  setup: Setup;
  invalid: string; // why the setup cannot be solved ('' when it can)
  commit: Commit;
  unit: LengthUnit;
  digits: number;
  client: GetClient;
}

const now = () => performance.now();
const keyLabel = (k: string): string => (k === 'z0' ? 'Z0' : k === 'zdiff' ? 'Zdiff' : k === 'zcm' ? 'Zcm' : k === 'z0.1' ? 'Z0 of line 1' : k);
const ohm = (v: number, e = 0) => { const t = qText(v, e, FLOOR.ohm); return t.e ? `${t.v} ± ${t.e} Ω` : `${t.v} Ω`; };
const mainQ = (r: LineResults | null, key: InverseKey) => (!r || !r.ok ? null : key === 'z0' ? r.lines[0].z0 : r.pair ? (key === 'zdiff' ? r.pair.zdiff : r.pair.zcm) : null);

export default function TraceTools({ tool, ...p }: Props) {
  const [seen, setSeen] = useState<Set<ToolName>>(() => new Set(tool ? [tool] : []));
  useEffect(() => { if (tool && !seen.has(tool)) setSeen(new Set([...seen, tool])); }, [tool, seen]);
  return (
    <div className={css.tools} data-tools-panel={tool ?? ''}>
      {seen.has('target') && <div hidden={tool !== 'target'}><TargetTool {...p} /></div>}
      {seen.has('sweep') && <div hidden={tool !== 'sweep'}><SweepTool {...p} /></div>}
      {seen.has('tolerance') && <div hidden={tool !== 'tolerance'}><ToleranceTool {...p} /></div>}
    </div>
  );
}

type ToolProps = Omit<Props, 'tool'>;

// Cancels the channels when the setup changes or the tool goes away.
function useCancelOnChange(setup: Setup, client: GetClient, channels: string[], onChange: () => void) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    for (const c of channels) void client().then((x) => x.cancel(c));
    onChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);
  useEffect(() => () => { for (const c of channels) void client().then((x) => x.cancel(c)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

function Old({ show }: { show: boolean }) {
  return show ? <p className={css.old} data-old>Made for the setup before the last change.</p> : null;
}

// ---------------- the target ----------------

interface TargetRun { r: InverseResult; rel: number; ms: number; total: number; setup: Setup }

function TargetTool({ setup, invalid, commit, unit, client }: ToolProps) {
  const ch = useMemo(() => targetChoices(setup), [setup]);
  const [key, setKey] = useState<InverseKey>(ch.keys[0]?.key ?? 'z0');
  const [vary, setVary] = useState<InverseVary>('w');
  const [text, setText] = useState(String(TARGET_DEFAULT[ch.keys[0]?.key ?? 'z0']));
  const [run, setRun] = useState<TargetRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const k = ch.keys.some((c) => c.key === key) ? key : ch.keys[0]?.key ?? 'z0';
  const v = ch.varies.some((c) => c.vary === vary) ? vary : 'w';
  useEffect(() => { if (k !== key) { setKey(k); setText(String(TARGET_DEFAULT[k])); } }, [k, key]);
  useCancelOnChange(setup, client, ['target'], () => setBusy(false));

  const solve = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = readTarget(text);
    if (target === null) { setMsg('Type the target in Ω, such as 50.'); return; }
    setMsg('');
    setBusy(true);
    const t0 = now();
    const c = await client();
    const rr = await c.run<InverseResult>('target', { kind: 'inverse', setup, key: k, target, vary: v });
    if (!rr) return;
    const ms = now() - t0;
    const r = rr.result;
    // The width's uncertainty: the value's error over the slope, from one more solve 0.1 % wider (or wider apart).
    let rel = NaN;
    const q = mainQ(r.result, k);
    if (r.reached && r.setup && q) {
      const s2: Setup = structuredClone(r.setup);
      const h = 1e-3;
      if (v !== 's') s2.trace.w.v *= 1 + h;
      if (v !== 'w') s2.trace.s.v *= 1 + h;
      const r2 = await c.run<SolveResult>('target-slope', { kind: 'solve', setup: s2 });
      if (!r2) return;
      const q2 = mainQ(r2.result, k);
      if (q2) rel = Math.abs(q.e / ((q2.v - q.v) / h));
    }
    setRun({ r, rel, ms, total: now() - t0, setup });
    setBusy(false);
  };

  const r = run?.r ?? null;
  const q = r ? mainQ(r.result, r.key) : null;
  const sc = fromMm(1, unit);
  const lenFloor = fromMm(1e-4, unit);
  const wT = r && r.reached ? qText(r.w, Number.isFinite(run!.rel) ? r.w * run!.rel : 0, lenFloor, sc) : null;
  const sT = r && r.reached && r.vary !== 'w' ? qText(r.s, Number.isFinite(run!.rel) ? r.s * run!.rel : 0, lenFloor, sc) : null;
  const rounded = (t: { v: string; place: number }) => toMm(Number(t.v.replace('−', '-')), unit);
  const use = () => {
    if (!r || !wT) return;
    const w = rounded(wT), s = sT ? rounded(sT) : null;
    commit((cur) => ({
      ...cur,
      trace: {
        ...cur.trace,
        ...(r.vary !== 's' ? { w: { v: w, tol: cur.trace.w.tol, src: TYPED } } : {}),
        ...(s !== null ? { s: { v: s, tol: cur.trace.s.tol, src: TYPED } } : {}),
      },
    }));
  };
  const useLabel = ch.varies.find((c) => c.vary === (r?.vary ?? v))?.use ?? 'Use this width';
  const u = UNIT_TEXT[unit];
  if (ch.reason) return <section className={css.tool} data-tool="target"><p className={css.small}>{ch.reason}</p></section>;
  return (
    <section className={css.tool} data-tool="target" aria-label="Target">
      <form className={css.row} onSubmit={solve}>
        <label className={css.ctl}>
          Quantity
          <select className={base.select} value={k} data-target-key onChange={(e) => { const x = e.target.value as InverseKey; setKey(x); setText(String(TARGET_DEFAULT[x])); }}>
            {ch.keys.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label className={css.ctl}>
          Solve for
          <select className={base.select} value={v} data-target-vary onChange={(e) => setVary(e.target.value as InverseVary)}>
            {ch.varies.map((c) => <option key={c.vary} value={c.vary}>{c.label}</option>)}
          </select>
        </label>
        <label className={css.ctl}>
          Target (Ω)
          <input className={`${base.input} ${css.num}`} inputMode="decimal" value={text} data-target-input onChange={(e) => setText(e.target.value)} aria-invalid={!!msg} />
        </label>
        <button type="submit" className={base.button} data-target-solve disabled={!!invalid}>Solve</button>
      </form>
      {msg && <p className={css.reason} role="alert">{msg}</p>}
      {invalid && <p className={css.small}>{invalid}</p>}
      <p className={css.busy} aria-live="polite">{busy ? 'Solving…' : ''}</p>
      {r && run && (
        <div className={css.result} data-target-result data-reached={r.reached} data-w={r.w} data-s={r.s} data-v={q?.v ?? NaN} data-e={q?.e ?? NaN} data-ms={run.ms.toFixed(1)} data-total={run.total.toFixed(1)} data-rel={run.rel}>
          <Old show={run.setup !== setup} />
          {r.reached && wT ? (
            <>
              <dl className={css.pairs}>
                <div><dt>Width</dt><dd><span className={css.num} data-target-w>{wT.v}</span>{wT.e && <span className={css.err}> ± {wT.e}</span>} {u}</dd></div>
                {sT && <div><dt>Gap</dt><dd><span className={css.num} data-target-s>{sT.v}</span>{sT.e && <span className={css.err}> ± {sT.e}</span>} {u}</dd></div>}
                {q && <div><dt>{keyLabel(r.key)} there</dt><dd className={css.num}>{ohm(q.v, q.e)}</dd></div>}
              </dl>
              <p className={css.small}>
                The {r.vary === 'ws' ? 'width and gap are' : r.vary === 's' ? 'gap is' : 'width is'} shown to the digits the solver&apos;s error allows: its ± is what the
                error of {keyLabel(r.key)} means for the {r.vary === 's' ? 'gap' : 'width'}. Found in {Math.round(run.ms)} ms.
              </p>
              <button type="button" className={base.button} data-target-use onClick={use} disabled={run.setup !== setup}>{useLabel}</button>
            </>
          ) : (
            <p className={css.reason} data-target-reason>{r.reason || 'The target could not be reached.'}</p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------- sweeps ----------------

interface SweepRun { id: number; input: string; label: string; kind: 'length' | 'er'; xs: number[]; points: (SweepPoint | null)[]; state: 'running' | 'done' | 'cancelled' | 'failed'; reason: string; ms: number; setup: Setup; nominal: number }

function SweepTool({ setup, invalid, unit, client }: ToolProps) {
  const inputs = useMemo(() => inputsOf(setup, true), [setup]);
  const n = linesOf(setup);
  const outs = useMemo(() => outputsOf(n), [n]);
  const [inputId, setInputId] = useState(inputs[0]?.id ?? 'w');
  const inp = inputs.find((i) => i.id === inputId) ?? inputs[0];
  const shownOf = (x: number, kind: 'length' | 'er') => (kind === 'er' ? x : fromMm(x, unit));
  const fmt = (x: number) => String(Number(x.toPrecision(6)));
  const rangeOf = (i: typeof inp) => { const [a, b] = defaultRange(i); return [fmt(shownOf(a, i.kind)), fmt(shownOf(b, i.kind))]; };
  const [lo, setLo] = useState(() => (inp ? rangeOf(inp)[0] : ''));
  const [hi, setHi] = useState(() => (inp ? rangeOf(inp)[1] : ''));
  const [count, setCount] = useState(String(SWEEP_POINTS));
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(outs.slice(0, n === 2 ? 2 : 1).map((o) => o.id)));
  // the chosen outputs that this structure has; the defaults when none is left (a single line became a pair)
  const picked = useMemo(() => {
    const ids = new Set(outs.map((o) => o.id));
    const c = [...chosen].filter((id) => ids.has(id));
    return new Set(c.length ? c : outs.slice(0, n === 2 ? 2 : 1).map((o) => o.id));
  }, [chosen, outs, n]);
  const [run, setRun] = useState<SweepRun | null>(null);
  const [msg, setMsg] = useState('');
  const [cursor, setCursor] = useState(NaN);
  const runId = useRef(0);
  const lastUnit = useRef(unit);
  useEffect(() => { // a new unit or input: the range again from the default
    if (inp && (lastUnit.current !== unit || inp.id !== inputId)) { lastUnit.current = unit; const [a, b] = rangeOf(inp); setLo(a); setHi(b); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);
  useCancelOnChange(setup, client, ['sweep'], () => setRun((r) => (r && r.state === 'running' ? { ...r, state: 'cancelled' } : r)));

  const pickInput = (id: string) => {
    setInputId(id);
    const i = inputs.find((x) => x.id === id);
    if (i) { const [a, b] = rangeOf(i); setLo(a); setHi(b); }
  };
  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inp) return;
    const a = Number(lo.replace(',', '.')), b = Number(hi.replace(',', '.')), m = Math.round(Number(count));
    if (!lo.trim() || !hi.trim() || !Number.isFinite(a) || !Number.isFinite(b) || a === b) { setMsg('Type two different numbers for the range.'); return; }
    if (!(m >= 3 && m <= SWEEP_MAX)) { setMsg(`Points: 3 to ${SWEEP_MAX}.`); return; }
    setMsg('');
    const toIn = (x: number) => (inp.kind === 'er' ? x : toMm(x, unit));
    const xs = linspace(toIn(Math.min(a, b)), toIn(Math.max(a, b)), m);
    const id = ++runId.current;
    const t0 = now();
    setRun({ id, input: inp.id, label: inp.label, kind: inp.kind, xs, points: xs.map(() => null), state: 'running', reason: '', ms: 0, setup, nominal: inp.v });
    setCursor(NaN);
    const c = await client();
    const job: StaticJob = { kind: 'sweep', setup, input: inp.id, xs };
    const rr = await c.run<SweepResult>('sweep', job, (_d, _t, part) => {
      const pt = part as SweepPartial | undefined;
      if (!pt || runId.current !== id) return;
      setRun((r) => {
        if (!r || r.id !== id) return r;
        const points = r.points.slice();
        pt.points.forEach((q, k) => { points[pt.from + k] = q; });
        return { ...r, points };
      });
    });
    if (runId.current !== id) return;
    if (!rr) { setRun((r) => (r && r.id === id ? { ...r, state: 'cancelled', ms: now() - t0 } : r)); return; }
    const res = rr.result;
    setRun((r) => (r && r.id === id ? { ...r, points: res.points, state: res.ok ? 'done' : 'failed', reason: res.reason, ms: now() - t0 } : r));
  };
  const cancel = () => { void client().then((c) => c.cancel('sweep')); };

  const perIn = unit === 'mil';
  const scaleOf = (q: Quantity) => (q === 'delay' ? (perIn ? 1e9 * 25.4 : 1e9) : 1);
  const unitOf = (q: Quantity) => (q === 'ohm' ? 'Ω' : q === 'delay' ? (perIn ? 'ps/in' : 'ps/mm') : '');
  const floorOf = (q: Quantity) => (q === 'ohm' ? FLOOR.ohm : q === 'delay' ? FLOOR.delay : FLOOR.ratio);
  const xsShown = useMemo(() => (run ? run.xs.map((x) => shownOf(x, run.kind)) : []), [run?.xs, run?.kind, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const xUnit = run?.kind === 'er' ? '' : UNIT_TEXT[unit];
  const plots = useMemo(() => {
    if (!run) return [];
    return outs.filter((o) => picked.has(o.id)).map((o) => {
      const sc = scaleOf(o.q);
      const series: (PlotSeries & { e: number[] })[] = o.keys.map((k, i) => {
        const ys = run.points.map((pt) => (pt && pt.ok && Number.isFinite(pt.values[k]) ? pt.values[k] * sc : NaN));
        const e = run.points.map((pt) => (pt && pt.ok ? Math.abs((pt.err[k] ?? 0) * sc) : NaN));
        return { name: o.names[i], ys, e, lo: ys.map((y, j) => y - e[j]), hi: ys.map((y, j) => y + e[j]) };
      });
      return { o, series };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, outs, picked, perIn]);
  const done = run ? run.points.filter(Boolean).length : 0;
  const xText = (x: number) => (run?.kind === 'er' ? x.toFixed(3) : `${Number(x.toPrecision(4))} ${xUnit}`);

  return (
    <section className={css.tool} data-tool="sweep" aria-label="Sweep">
      <form className={css.row} onSubmit={start}>
        <label className={css.ctl}>
          Input
          <select className={base.select} value={inp?.id ?? ''} data-sweep-input onChange={(e) => pickInput(e.target.value)}>
            {inputs.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </label>
        <label className={css.ctl}>
          From{inp && inp.kind === 'length' ? ` (${UNIT_TEXT[unit]})` : ''}
          <input className={`${base.input} ${css.num}`} inputMode="decimal" value={lo} data-sweep-from onChange={(e) => setLo(e.target.value)} />
        </label>
        <label className={css.ctl}>
          To{inp && inp.kind === 'length' ? ` (${UNIT_TEXT[unit]})` : ''}
          <input className={`${base.input} ${css.num}`} inputMode="decimal" value={hi} data-sweep-to onChange={(e) => setHi(e.target.value)} />
        </label>
        <label className={css.ctl}>
          Points
          <input className={`${base.input} ${css.num}`} inputMode="numeric" value={count} data-sweep-points onChange={(e) => setCount(e.target.value)} />
        </label>
        <div className={css.buttons}>
          <button type="submit" className={base.button} data-sweep-run disabled={!!invalid || !inp}>Sweep</button>
          <button type="button" className={base.button} data-sweep-cancel onClick={cancel} disabled={run?.state !== 'running'}>Cancel</button>
        </div>
      </form>
      <fieldset className={css.outs}>
        <legend>Plot</legend>
        {outs.map((o) => (
          <label key={o.id} className={css.check}>
            <input type="checkbox" checked={picked.has(o.id)} data-sweep-out={o.id} onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(o.id); else s.delete(o.id); setChosen(s); }} />
            {o.label}
          </label>
        ))}
      </fieldset>
      {msg && <p className={css.reason} role="alert">{msg}</p>}
      {invalid && <p className={css.small}>{invalid}</p>}
      {run && (
        <div className={css.result} data-sweep-result data-state={run.state} data-points={done} data-total={run.xs.length} data-ms={run.ms.toFixed(1)} data-input={run.input}>
          <Old show={run.setup !== setup} />
          <p className={css.busy} aria-live="polite">
            {run.state === 'running' ? `Sweeping: ${done} of ${run.xs.length} points` : run.state === 'cancelled' ? `Cancelled after ${done} of ${run.xs.length} points` : run.state === 'failed' ? '' : `${run.xs.length} points in ${Math.round(run.ms)} ms`}
          </p>
          {run.state === 'running' && <progress className={css.progress} max={run.xs.length} value={done} />}
          {run.state === 'failed' && <p className={css.reason}>{run.reason}</p>}
          {plots.map(({ o, series }) => (
            <Plot
              key={o.id}
              name={`sweep-${o.id}`}
              title={`${o.label}${unitOf(o.q) ? ` (${unitOf(o.q)})` : ''}`}
              xs={xsShown}
              series={series}
              xDomain={[xsShown[0], xsShown[xsShown.length - 1]]}
              xLabel={`${run.label}${xUnit ? ` (${xUnit})` : ''}; dashed: the current value; the band is the solver's error`}
              marker={shownOf(run.nominal, run.kind)}
              cursor={cursor}
              onCursor={setCursor}
              readout={(x) => {
                if (!Number.isFinite(x)) return 'Move the cursor with the pointer, a tap or the arrow keys to read the values.';
                const parts = series.map((s) => {
                  const v = readAt(xsShown, s.ys, x), e = readAt(xsShown, s.e, x);
                  if (!Number.isFinite(v)) return `${s.name} –`;
                  const t = qText(v, e, floorOf(o.q));
                  return `${s.name} ${t.v}${t.e ? ` ± ${t.e}` : ''}${unitOf(o.q) ? ` ${unitOf(o.q)}` : ''}`;
                });
                return `${run.label} ${xText(x)}: ${parts.join(', ')}`;
              }}
            />
          ))}
          <details className={css.table} data-sweep-table>
            <summary>Values as a table</summary>
            <div className={css.tableScroll}>
              <table>
                <thead><tr><th>{run.label}{xUnit ? ` (${xUnit})` : ''}</th>{plots.flatMap(({ o }) => o.keys.map((k, i) => <th key={k}>{o.keys.length > 1 ? `${o.label.split(' ')[0]} ${o.names[i]}` : o.label}{unitOf(o.q) ? ` (${unitOf(o.q)})` : ''}</th>))}</tr></thead>
                <tbody>
                  {run.points.map((pt, i) => pt && (
                    <tr key={i} data-i={i} data-x={pt.x}>
                      <td>{xText(xsShown[i])}</td>
                      {plots.flatMap(({ o }) => o.keys.map((k) => {
                        if (!pt.ok) return <td key={k}>–</td>;
                        const t = qText(pt.values[k] * scaleOf(o.q), (pt.err[k] ?? 0) * scaleOf(o.q), floorOf(o.q));
                        return <td key={k} data-key={k} data-v={pt.values[k]} data-e={pt.err[k]}>{t.v}{t.e ? ` ± ${t.e}` : ''}</td>;
                      }))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

// ---------------- the tolerance band ----------------

interface TolRun<T> { r: T; ms: number; setup: Setup }

function ToleranceTool({ setup, invalid, unit, digits, client }: ToolProps) {
  const ph = useMemo(() => withPlaceholders(setup), [setup]);
  const n = linesOf(setup);
  const key = mainKeyOf(n);
  const [cr, setCr] = useState<TolRun<CornersResult> | null>(null);
  const [mc, setMc] = useState<TolRun<McResult> | null>(null);
  const [mcBusy, setMcBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [cBusy, setCBusy] = useState(false);
  useCancelOnChange(setup, client, ['corners', 'mc'], () => { setMcBusy(false); });

  useEffect(() => { // the corners are cheap: computed whenever the setup changes while the tool is open
    if (invalid) return undefined;
    let on = true;
    setCBusy(true);
    const t0 = now();
    void client().then((c) => c.run<CornersResult>('corners', { kind: 'corners', setup: ph.setup })).then((rr) => {
      if (!on || !rr) return;
      setCr({ r: rr.result, ms: now() - t0, setup });
      setCBusy(false);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ph, invalid]);

  const runMc = async () => {
    setMcBusy(true);
    setProg(0);
    const t0 = now();
    const c = await client();
    const rr = await c.run<McResult>('mc', { kind: 'montecarlo', setup: ph.setup, opt: { samples: MC_SAMPLES, seed: MC_SEED, keys: [key] } }, (d) => setProg(d));
    setMcBusy(false);
    if (rr) setMc({ r: rr.result, ms: now() - t0, setup });
  };
  const cancelMc = () => { void client().then((c) => c.cancel('mc')); setMcBusy(false); };

  const c = cr?.r.ok ? cr.r : null;
  const corner = c?.corners.find((x) => x.key === key) ?? null;
  const st = mc?.r.ok ? mc.r.stats[key] : undefined;
  const sh = c ? shares(c.inputs.map((i) => i.d[key])) : [];
  const nominal = c ? c.nominal[key] : NaN, nomErr = c ? c.nominalErr[key] : NaN;
  const limText = (id: string, lim: number) => {
    const inp = c?.inputs.find((i) => i.id === id);
    if (!inp) return '';
    return /\.er$/.test(id) ? `± ${lim.toFixed(2)}` : `± ${Number(fromMm(lim, unit).toPrecision(Math.max(2, digits - 1)))} ${UNIT_TEXT[unit]}`;
  };
  return (
    <section className={css.tool} data-tool="tolerance" aria-label="Tolerance">
      <p className={css.note} data-tol-note>
        The tolerances are placeholders until JLCPCB&apos;s or your own figures are entered: where a field has no tolerance,
        the band takes ±{PLACEHOLDER.rel * 100} % for widths, gaps and thicknesses, εr ±{PLACEHOLDER.er} and the mask&apos;s
        thicknesses ±{PLACEHOLDER.mask * 100} %. A tolerance typed in a field (Stackup or Trace) is used as it is.
      </p>
      {invalid && <p className={css.small}>{invalid}</p>}
      <p className={css.busy} aria-live="polite">{cBusy ? 'Computing the corners…' : ''}</p>
      {cr && !cr.r.ok && <p className={css.reason}>{cr.r.reason}</p>}
      {c && corner && (
        <div className={css.result} data-tol-corners data-lo={corner.lo} data-hi={corner.hi} data-nominal={nominal} data-ms={cr!.ms.toFixed(1)}>
          <Old show={cr!.setup !== setup} />
          <dl className={css.pairs}>
            <div><dt>{keyLabel(key)} nominal</dt><dd className={css.num}>{ohm(nominal, nomErr)}</dd></div>
            <div><dt>Worst case (corners)</dt><dd className={css.num}>{ohm(corner.lo)} … {ohm(corner.hi)}</dd></div>
            {st && (
              <>
                <div><dt>Monte Carlo median</dt><dd className={css.num}>{ohm(st.p[2])}</dd></div>
                <div><dt>95 % (±2σ)</dt><dd className={css.num}>{ohm(st.p[1])} … {ohm(st.p[3])}</dd></div>
                <div><dt>99.73 % (±3σ)</dt><dd className={css.num}>{ohm(st.p[0])} … {ohm(st.p[4])}</dd></div>
                <div><dt>Standard deviation</dt><dd className={css.num}>{ohm(st.sd)}</dd></div>
              </>
            )}
          </dl>
          <BandStrip nominal={nominal} corner={[corner.lo, corner.hi]} p={st?.p ?? null} />
        </div>
      )}
      <div className={css.buttons}>
        <button type="button" className={base.button} data-mc-run onClick={() => void runMc()} disabled={!!invalid || mcBusy}>{mc ? 'Run Monte Carlo again' : `Run Monte Carlo (${MC_SAMPLES} samples)`}</button>
        <button type="button" className={base.button} data-mc-cancel onClick={cancelMc} disabled={!mcBusy}>Cancel</button>
      </div>
      {mcBusy && (
        <p className={css.busy} aria-live="polite">
          <progress className={css.progress} max={MC_SAMPLES} value={prog} /> {prog} of {MC_SAMPLES} samples
        </p>
      )}
      {mc && (
        <div data-mc-result data-ok={mc.r.ok} data-p={st ? st.p.join(',') : ''} data-sd={st?.sd ?? NaN} data-mean={st?.mean ?? NaN} data-ms={mc.ms.toFixed(1)} data-failed={mc.r.failed}>
          <Old show={mc.setup !== setup} />
          <p className={css.small}>
            {mc.r.ok
              ? `${mc.r.samples} samples (seed ${mc.r.seed}, each input normal with σ = its tolerance / 3, cut at the tolerance)${mc.r.failed ? `, ${mc.r.failed} failed` : ''}, in ${(mc.ms / 1000).toFixed(1)} s.`
              : mc.r.reason}
          </p>
        </div>
      )}
      {c && (
        <div className={css.rank} data-tol-ranking>
          <h4 className={css.h4}>What moves {keyLabel(key)} most</h4>
          <p className={css.small}>Each input alone at its tolerance: the change of {keyLabel(key)} and its share of the spread (the squares of the changes, summed).</p>
          <ol className={css.rankList}>
            {c.inputs.map((i, k) => (
              <li key={i.id} data-rank-id={i.id} data-d={i.d[key]}>
                <span className={css.rankName}>{i.label} <span className={css.err}>{limText(i.id, i.lim)}</span>{ph.filled.has(i.id) && <span className={css.tag}>placeholder</span>}</span>
                <span className={css.num}>{i.d[key] >= 0 ? '+' : '−'}{qText(Math.abs(i.d[key]), 0, FLOOR.ohm).v} Ω</span>
                <span className={css.share}><i style={{ width: `${(sh[k] * 80).toFixed(1)}%` }} /><b className={css.num}>{(sh[k] * 100).toFixed(sh[k] < 0.1 ? 1 : 0)} %</b></span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

// The band as bars on one axis: worst-case corners, ±3σ and ±2σ of the Monte Carlo, the median and the nominal.
function BandStrip({ nominal, corner, p }: { nominal: number; corner: [number, number]; p: number[] | null }) {
  const [lo, hi] = extent(corner, p ?? undefined, [nominal]);
  const a = niceAxis(lo, hi, 4, { pad: 0.03 });
  const tk = ticks(a, 4);
  const x = (v: number) => `${(frac(v, a) * 100).toFixed(3)}%`;
  const rows: [string, number, number][] = [['Worst case', corner[0], corner[1]]];
  if (p) rows.push(['±3σ', p[0], p[4]], ['±2σ', p[1], p[3]]);
  return (
    <div className={css.strip} aria-hidden="true">
      {rows.map(([name, l, h]) => (
        <div key={name} className={css.stripRow}>
          <span className={css.stripName}>{name}</span>
          <span className={css.stripTrack}>
            <i className={css.stripBar} style={{ left: x(l), width: `${((frac(h, a) - frac(l, a)) * 100).toFixed(3)}%` }} />
            <i className={css.stripNominal} style={{ left: x(nominal) }} />
            {p && name !== 'Worst case' && <i className={css.stripMedian} style={{ left: x(p[2]) }} />}
          </span>
        </div>
      ))}
      <div className={css.stripRow}>
        <span className={css.stripName}>Ω</span>
        <span className={css.stripAxis}>{tk.map((v) => <span key={v} style={{ left: x(v) }}>{tickText(v, tk)}</span>)}</span>
      </div>
    </div>
  );
}
