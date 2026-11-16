// Checks of the static worker's message handling (lib/emsim/jobs.ts) and its client (staticClient.ts), step M1.5, in
// Node: the handler as the worker runs it (setTimeout between slices), and the client on its fallback path (no worker
// here), which runs the same handler on the page: results equal direct calls, a cancel stops a running job and drops a
// queued one, a field job is progressive and equals the direct grid, a newer job on a channel overtakes the older
// (stale) one, a job seen before comes from the cache by its hash, channels are independent. Also: no Node API in
// lib/emsim, and the worker file only wires the handler.

import { readFileSync, readdirSync } from 'node:fs';
import * as J0 from '../../../lib/emsim/jobs.ts';
import * as SC0 from '../../../lib/emsim/staticClient.ts';
import * as F0 from '../../../lib/emsim/fields.ts';
import * as LN0 from '../../../lib/emsim/lines.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as ST0 from '../../../lib/emsim/structure.ts';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as V0 from '../../../lib/emsim/vary.ts';

const J = J0.default ?? J0, SC = SC0.default ?? SC0, F = F0.default ?? F0, LN = LN0.default ?? LN0, SU = SU0.default ?? SU0;
const ST = ST0.default ?? ST0, S = S0.default ?? S0, V = V0.default ?? V0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, limitMs = 30000) {
  const t0 = performance.now();
  while (!pred()) {
    if (performance.now() - t0 > limitMs) return false;
    await sleep(2);
  }
  return true;
}
function pairSetup(kind, w, s, g) {
  const su = SU.defaultSetup();
  const st = ST.presetStructure(kind, su.stackup, w);
  st.s.v = s;
  if (g) st.g.v = g;
  return { ...su, trace: st };
}

export async function run(t) {
  const C39 = SU.defaultSetup();
  const CPW = pairSetup('pair-cpw', 0.1, 0.15, 0.3);
  const sec = LN.setupSection(C39);
  const view = F.sectionView(sec, 181);
  const lines = [];

  // ---- hashing ----
  t.eq(J.canonical({ b: 1, a: [1, { d: 2, c: 3 }] }), J.canonical({ a: [1, { c: 3, d: 2 }], b: 1 }), 'canonical JSON ignores key order');
  const h1 = J.hashOf(J.canonical({ kind: 'solve', setup: C39 })), h2 = J.hashOf(J.canonical({ kind: 'solve', setup: CPW }));
  t.ok(h1 !== h2 && /^[0-9a-f]{16}$/.test(h1), `hashes of different setups differ (${h1}, ${h2})`);

  // ---- the handler, as in the worker ----
  const msgs = [];
  const handle = J.createStaticHandler((m) => msgs.push({ ...m, at: performance.now() }), (fn) => setTimeout(fn, 0));
  const of = (id, type) => msgs.filter((m) => m.id === id && (!type || m.type === type));
  // a solve equals the direct solve, without the solver's levels
  handle({ type: 'run', id: 1, job: { kind: 'solve', setup: C39 } });
  await waitFor(() => of(1, 'done').length);
  const direct = LN.solveSetup(C39);
  const r1 = of(1, 'done')[0]?.result;
  t.ok(r1 && r1.lines[0].z0.v === direct.lines[0].z0.v && r1.bem === null, 'solve job: the direct result, without the levels');
  // a running Monte Carlo is stopped by a cancel
  const CPWtol = V.cloneSetup(CPW);
  CPWtol.trace.w.tol = { rel: 0.1 }; CPWtol.trace.s.tol = { rel: 0.1 };
  for (const l of CPWtol.stackup.layers) if (l.kind === 'dielectric') { l.t.tol = { rel: 0.1 }; l.er.tol = { abs: 0.2 }; }
  handle({ type: 'run', id: 2, job: { kind: 'montecarlo', setup: CPWtol, opt: { samples: 1000 } } });
  await waitFor(() => of(2, 'progress').length > 0);
  const tc = performance.now();
  handle({ type: 'cancel', id: 2 });
  await waitFor(() => of(2, 'cancelled').length || of(2, 'done').length);
  const cancelMs = (of(2, 'cancelled')[0]?.at ?? Infinity) - tc;
  await sleep(100);
  t.ok(of(2, 'cancelled').length === 1 && of(2, 'done').length === 0, 'cancel: the running Monte Carlo stops and posts no result');
  t.ok(cancelMs < 200, `cancel: stopped ${cancelMs.toFixed(0)} ms after the message (bar 200)`);
  // a queued job is dropped at once, the running one finishes
  handle({ type: 'run', id: 3, job: { kind: 'sweep', setup: C39, input: 'w', xs: Array.from({ length: 40 }, (_, i) => 0.08 + 0.003 * i) } });
  handle({ type: 'run', id: 4, job: { kind: 'solve', setup: CPW } });
  handle({ type: 'cancel', id: 4 });
  t.ok(of(4, 'cancelled').length === 1, 'cancel: a queued job is dropped at once');
  await waitFor(() => of(3, 'done').length);
  const sw = of(3, 'done')[0]?.result;
  t.ok(sw && sw.ok && sw.points.length === 40 && of(3, 'progress').length >= 2 && of(4, 'done').length === 0, 'sweep job: progress, then 40 points; the dropped job never runs');
  // field job: progressive, equal to the direct grid
  const fjob = { kind: 'field', setup: C39, drive: { name: 'line' }, view };
  handle({ type: 'run', id: 5, job: fjob });
  await waitFor(() => of(5, 'done').length || of(5, 'error').length);
  const parts = of(5, 'progress').map((m) => m.partial).filter(Boolean);
  const fr = of(5, 'done')[0]?.result;
  t.ok(parts.length >= 2 && parts.every((p, i) => i === 0 || p.step < parts[i - 1].step) && parts[0].phi.length === view.nx * view.ny, `field job: ${parts.length} pictures, coarse to fine (steps ${parts.map((p) => p.step).join(', ')})`);
  if (t.ok(fr && fr.ok && fr.grid.done && fr.grid.step === 1, `field job: the final grid ${fr && fr.reason}`)) {
    const r = LN.solveSetup(C39);
    const src = F.electric(F.fieldModel(r.bem, sec), [1]);
    const g = F.fieldGridFull(src, view);
    let same = true;
    for (let i = 0; i < g.phi.length; i++) if (g.phi[i] !== fr.grid.phi[i] || g.fx[i] !== fr.grid.fx[i] || g.fz[i] !== fr.grid.fz[i]) { same = false; break; }
    t.ok(same, 'field job: the grid equals the direct one');
    t.ok(fr.contours.length === 10 && fr.contours.every((c) => c.segs.length > 0) && fr.lines.length === 24 && fr.surface && fr.lineResults.bem === null, 'field job: equipotentials, 24 field lines, the surface charge and the line results');
  }
  // H map, a mode's drive, errors
  handle({ type: 'run', id: 6, job: { kind: 'field', setup: CPW, field: 'H', drive: { mode: 0 }, view: F.sectionView(LN.setupSection(CPW), 121), lines: null } });
  handle({ type: 'run', id: 7, job: { kind: 'field', setup: (() => { const s = V.cloneSetup(C39); s.stackup.layers.find((l) => l.kind === 'copper').t.v = 0; return s; })(), drive: { name: 'line' }, view } });
  handle({ type: 'run', id: 8, job: { kind: 'nonsense' } });
  handle({ type: 'run', id: 9, job: { kind: 'inverse', setup: C39, key: 'z0', target: 50 } });
  await waitFor(() => [6, 7, 8, 9].every((id) => of(id, 'done').length || of(id, 'error').length));
  const h6 = of(6, 'done')[0]?.result;
  t.ok(h6 && h6.ok && h6.grid.kind === 'H' && h6.contours.length === 10 && h6.lines.length === 0 && Math.abs(h6.surface.total[1] - h6.drive[0]) < 1e-6 * Math.abs(h6.drive[0]), 'field job H: Az contours (the H lines), the surface current sums to the mode current');
  const e7 = of(7, 'done')[0]?.result;
  t.ok(e7 && !e7.ok && /copper thickness/i.test(e7.reason), `field job on a refused setup: not ok, with the reason (${e7 && e7.reason})`);
  t.ok(of(8, 'error').length === 1, 'an unknown job: an error message');
  const iv = of(9, 'done')[0]?.result;
  t.ok(iv && iv.reached && Math.abs(iv.value - 50) < 1e-5 && iv.result.bem === null, 'inverse job: reached, without the levels');

  // ---- the client, on its fallback path ----
  const useWorker = typeof Worker === 'undefined' ? undefined : false;
  const client = new SC.StaticClient({ worker: useWorker });
  const jobA = { kind: 'field', setup: CPW, drive: { name: 'odd' }, view: F.sectionView(LN.setupSection(CPW), 241) };
  const jobB = { kind: 'field', setup: CPW, drive: { name: 'even' }, view: F.sectionView(LN.setupSection(CPW), 241) };
  let partialsB = 0;
  const pA = client.run('field', jobA);
  const pB = client.run('field', jobB, (d, tot, part) => { if (part) partialsB++; });
  const [rA, rB] = await Promise.all([pA, pB]);
  t.ok(rA === null, 'client: the older job on a channel resolves null (stale)');
  t.ok(rB && rB.result.ok && !rB.cached && rB.where === 'page' && client.where === 'page' && partialsB >= 2, `client: the newest job runs on the page without a worker (${rB && rB.where}, ${partialsB} pictures)`);
  const t0 = performance.now();
  const rB2 = await client.run('field', JSON.parse(JSON.stringify({ view: jobB.view, drive: jobB.drive, setup: CPW, kind: 'field' })));
  const hitMs = performance.now() - t0;
  t.ok(rB2 && rB2.cached && rB2.where === 'cache' && rB2.result === rB.result && hitMs < 5, `client: the same input (keys in another order) comes from the cache in ${hitMs.toFixed(2)} ms`);
  const [rS, rF] = await Promise.all([client.run('solve', { kind: 'solve', setup: C39 }), client.run('field', jobA)]);
  t.ok(rS && rF && rS.result.ok && rF.result.ok, 'client: jobs on two channels run side by side');
  t.ok(client.stats.cancelled >= 1 && client.stats.hits === 1, `client: ${client.stats.cancelled} cancelled, ${client.stats.hits} cache hit, ${client.stats.stale} stale messages dropped`);
  const pC = client.run('field', { ...jobA, drive: { name: 'line', line: 2 } });
  client.cancel('field');
  t.ok((await pC) === null, 'client: cancel resolves the running job with null');
  client.stop();

  // ---- no Node API in lib/emsim; the worker file ----
  const dir = new URL('../../../lib/emsim/', import.meta.url);
  const bad = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(new URL(f, dir), 'utf8');
    if (/from ['"](node:|fs|path|os|child_process|worker_threads)['"]|require\(|process\.|Buffer\./.test(src)) bad.push(f);
  }
  t.ok(bad.length === 0, `no Node API in lib/emsim (${bad.join(', ')})`);
  const wsrc = readFileSync(new URL('static.worker.ts', dir), 'utf8');
  t.ok(/createStaticHandler/.test(wsrc) && /new URL\('\.\/static\.worker\.ts', import\.meta\.url\)/.test(readFileSync(new URL('staticClient.ts', dir), 'utf8')), 'the worker wires the handler; the client creates it the way the bundler builds it');
  lines.push(`cancel to stopped ${cancelMs.toFixed(0)} ms; field job pictures ${parts.length}; client: ${client.stats.posted} posted, ${client.stats.cancelled} cancelled, ${client.stats.hits} hit, ${client.stats.stale} stale; cache hit ${hitMs.toFixed(2)} ms`);
  t.note(`Static worker (M1.5): ${lines.join('; ')}`);
}
