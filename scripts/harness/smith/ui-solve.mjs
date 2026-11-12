// Drives /smith-chart/main in the installed Edge (or Chrome) and checks step M4.3a, the Solve panel: every message of
// solver.md's counting table reached by a scripted circuit (nothing marked, two solutions, touching circles, none, the
// same job with and without a crossing, every value, a target at a part's fixed point, the best value, ranges, a
// family, rejected, and the slow 2-D search solved after a pause); every shown solution's values equal lib/smith/solve.ts
// for that circuit (1e-12 relative); Apply makes the goal hold (input or node |Γ| from network.ts within 1e-9 of the
// goal) and is one undo step; marking by mouse, by keyboard alone and by tap, a third mark replacing the oldest (and
// saying so), unmarking, the goal's node, kind, typed figure and "or less" all in the link, read back after a reload,
// and undone like the circuit's other edits; no horizontal scroll at 320 and 390 px.
//   tsx ui-solve.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedSolve from '../../../lib/smith/solve.ts';
import * as importedGoal from '../../../lib/smith/goal.ts';
import { runChartChecks, chartCounts } from './ui-solve-chart.mjs';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const V = importedSolve.default ?? importedSolve;
const GL = importedGoal.default ?? importedGoal;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.env.SMITH_SHOTS || (process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null);
const base = process.argv[3] ?? 'http://localhost:3020';

const up = async () => { try { return (await fetch(`${base}/smith-chart/main`)).ok; } catch { return false; } };
let server = null;
const agentsBefore = existsSync(join(repo, 'AGENTS.md'));
if (!(await up())) {
  server = spawn('npm', ['run', 'dev'], { cwd: repo, shell: true, stdio: 'ignore' });
  const until = Date.now() + 180000;
  while (!(await up())) {
    if (Date.now() > until) { console.error('The dev server did not start.'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
const stopServer = () => {
  if (server) {
    try { execSync(process.platform === 'win32' ? `taskkill /pid ${server.pid} /T /F` : `kill ${server.pid}`, { stdio: 'ignore' }); } catch { /* gone */ }
  }
  if (!agentsBefore && existsSync(join(repo, 'AGENTS.md'))) rmSync(join(repo, 'AGENTS.md'));
};

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); stopServer(); process.exit(1); }

let passed = 0, failed = 0;
const failures = [];
// A message may be a function, also an async one (it reads the page's link): failures are awaited when printed.
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(typeof what === 'function' ? what() : what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const rel = (a, b) => (Object.is(a, b) ? 0 : Math.abs(a - b) / Math.max(Math.abs(b), 1e-300));

// ---------- the engine's side ----------

/** Γ at node k of a circuit by network.ts. */
function gammaAt(c, k) {
  const n = c.parts.length, nodes = new Float64Array((n + 1) * N.NODE_STRIDE), g = [0, 0];
  N.evaluate(nodes, P.packParts(c.parts), n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
  N.nodeGamma(g, 0, nodes, k * N.NODE_STRIDE);
  return g;
}
/** How far the circuit is from its goal (goal.ts goalResidual at the goal's node). */
function offGoal(c) {
  const goal = S.askOf(c).goal, g = gammaAt(c, GL.goalNode(goal, c.parts.length));
  return GL.goalResidual(goal, g[0], g[1], c.z0);
}
/** The page's status for a circuit, as SolvePanel's statusOf says it. */
function expected(c) {
  const a = S.askOf(c);
  if (!a.unknowns.length) return { status: 'nothing', r: null };
  const r = V.solve(c, a.unknowns, a.goal);
  let status = r.status;
  if (r.status === 'solved') {
    status = r.solutions.length > 1 ? 'solved' : r.unknowns.length === 1 && a.goal.kind === 'point' ? 'one' : r.circleNode >= 0 && r.nonPassive === 0 ? 'tangent' : 'one';
  } else if (r.status === 'none') status = r.sameJob ? 'samejob' : 'none';
  else if (r.status === 'coincident') status = r.sameJob ? 'samejob-all' : 'coincident';
  return { status, r };
}

/** SolvePanel's distinctEnds: a family's end members without repeats (the same values and kinds). */
const distinctEnds = (list) => list.filter((s, i) => !list.slice(0, i).some((t) => t.values.every((v, j) => v.kind === s.values[j].kind && Object.is(v.value, s.values[j].value))));

const DEF = 'z0=50&f0=100e6&zl=25:25&p=cs:31.83098861837907e-12,lp:79.57747154594767e-9';
const CASES = {
  nothing: `v=1&${DEF}`,
  solved: `v=1&${DEF}&u=1,2`,
  swapped: 'v=1&z0=50&f0=100e6&zl=25:-25&p=cs:31.83e-12,lp:79.58e-9&u=1,2',
  lines: 'v=1&z0=50&f0=100e6&zl=100:50&p=tl:0.1:50,so:0.1:50&u=1,2',
  tangent: 'v=1&z0=50&f0=100e6&zl=150:40&p=ls:10e-9&u=1&g=vswr:3',
  none: 'v=1&z0=50&f0=100e6&zl=25:0&p=ls:10e-9&u=1&g=r:1',
  samejob: 'v=1&z0=50&f0=100e6&zl=25:30&p=ls:10e-9,cs:10e-12&u=1,2',
  'samejob-all': 'v=1&z0=50&f0=100e6&zl=50:30&p=ls:10e-9,cs:10e-12&u=1,2',
  coincident: 'v=1&z0=50&f0=100e6&zl=50:30&p=ls:10e-9&u=1&g=r:1',
  degenerate: 'v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,ls:79.58e-9&u=1,2&g=pt:inf:0',
  best: 'v=1&z0=50&f0=100e6&zl=30:25&p=cs:31.83e-12,lp:79.58e-9&u=2',
  range: 'v=1&z0=50&f0=100e6&zl=25:0&p=ls:10e-9&u=1&g=mag:0.4:within',
  family: `v=1&${DEF}&u=1,2&g=vswr:1.5:within`,
  rejected: `v=1&${DEF}&u=2&g=r:1@1`,
  node: `v=1&${DEF}&u=1&g=r:1@1`,
  point: 'v=1&z0=50&f0=100e6&zl=25:25&p=cs:20e-12,lp:50e-9&u=1lc,2&g=pt:30:-10',
  slow: 'v=1&z0=50&f0=100e6&zl=100:50&p=tl:0.3:75&u=1zc,f0',
};
const MUST = ['nothing', 'solved', 'tangent', 'none', 'samejob', 'samejob-all', 'coincident', 'degenerate', 'best', 'range', 'family', 'rejected'];
const HEAD = {
  nothing: /Nothing is marked yet/, solved: /^Two solutions/, tangent: /circles just touch/, none: /^No solution\. The part.s circle/,
  samejob: /same job/, 'samejob-all': /same job.*any value of one/, coincident: /^Every value works/, degenerate: /Fix one of them/,
  best: /only by chance/, range: /keep the goal/, family: /family of solutions/, rejected: /^Cannot solve this: Part 2 \(shunt L\) is beyond/,
};

// ---------- the page's side ----------

async function load(page, q) {
  await page.goto(`${base}/smith-chart/main?${q}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-solve]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await settle(page);
}
async function open(context, q) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await load(page, q);
  return page;
}
const settle = async (page) => {
  await page.waitForFunction(() => {
    const e = document.querySelector('[data-solve-status]');
    return e && e.getAttribute('data-solve-status') !== 'solving' && !e.hasAttribute('aria-busy');
  }, null, { timeout: 15000 });
  await frame(page);
};
const linked = async (page) => S.decodeCircuit(new URL(page.url()).search).circuit;
const query = async (page) => new URL(page.url()).search;
/** What the panel shows: status, head, suggestion, ranges, and the solutions' values as data attributes. */
const panel = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-solve-status]');
  return {
    status: box.getAttribute('data-solve-status'),
    head: box.querySelector('[data-solve-head]')?.textContent ?? box.textContent,
    suggest: box.querySelector('[data-solve-suggest]')?.textContent ?? '',
    ranges: [...box.querySelectorAll('[data-range]')].map((e) => [e.getAttribute('data-min'), e.getAttribute('data-max'), e.textContent]),
    solutions: [...box.querySelectorAll('[data-solution]')].map((e) => ({
      residual: Number(e.getAttribute('data-residual')),
      values: [...e.querySelectorAll('[data-value]')].map((v) => ({ part: Number(v.getAttribute('data-part')), param: v.getAttribute('data-param'), kind: Number(v.getAttribute('data-kind')), raw: v.getAttribute('data-raw'), text: v.textContent })),
    })),
    count: document.querySelector('[data-solve-count]')?.textContent ?? '',
  };
});
const readRaw = (t) => (t === 'inf' ? Infinity : t === '-inf' ? -Infinity : Number(t));
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

const seen = new Set();
const counts = { solutions: 0, values: 0, applied: 0 };

try {
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const p = await open(desk, CASES.nothing);

  // ---------- every message of the counting table, the values against solve() ----------
  for (const [name, q] of Object.entries(CASES)) {
    await load(p, q);
    const c = await linked(p);
    ok(S.sameCircuit(c, S.decodeCircuit(`?${q}`).circuit), async () => `${name}: the page keeps the link's ask (${await query(p)})`);
    const { status, r } = expected(c);
    const got = await panel(p);
    seen.add(got.status);
    ok(got.status === status, () => `${name}: status ${got.status}, the solver says ${status}`);
    if (HEAD[name]) ok(HEAD[name].test(got.head.trim()), () => `${name}: the message "${got.head.trim()}"`);
    if (r && r.unknowns.length) ok(got.count.length > 20, `${name}: the counting line is shown`);
    if (!r) continue;
    const list = r.status === 'family' ? distinctEnds(r.family?.ends ?? []) : r.solutions;
    ok(got.solutions.length === list.length, () => `${name}: ${got.solutions.length} solutions shown, ${list.length} from solve()`);
    for (let k = 0; k < Math.min(list.length, got.solutions.length); k++) {
      const a = list[k], b = got.solutions[k];
      counts.solutions++;
      ok(a.values.length === b.values.length && (rel(b.residual, a.residual) <= 1e-12 || Math.abs(b.residual - a.residual) < 1e-15), () => `${name} #${k}: residual ${b.residual} vs ${a.residual}`);
      for (let j = 0; j < a.values.length; j++) {
        const u = a.values[j], v = b.values[j];
        counts.values++;
        ok(v && v.part === u.part && v.param === u.param && v.kind === u.kind && rel(readRaw(v.raw), u.value) <= 1e-12,
          () => `${name} #${k}.${j}: shown ${JSON.stringify(v)}, solve() ${u.part}/${u.param}/${u.kind}/${u.value}`);
        if (u.swapped) ok(/true at this frequency only/.test(v.text), `${name}: a swapped value says "true at this frequency only"`);
        if (u.period) ok(/λ\/2/.test(v.text), `${name}: a length has the λ/2 note`);
      }
    }
    if (r.status === 'range' || r.status === 'family') {
      ok(got.ranges.length === r.ranges.length && r.ranges.every((g, k) => rel(readRaw(got.ranges[k][0]), g.min) <= 1e-12 && rel(readRaw(got.ranges[k][1]), g.max) <= 1e-12 && /^any /.test(got.ranges[k][2].trim())),
        () => `${name}: ranges ${JSON.stringify(got.ranges)} vs ${JSON.stringify(r.ranges.map((g) => [g.min, g.max]))}`);
    }
    if (r.status === 'best') ok(/Free a second value .*part 1’s C/.test(got.suggest), () => `${name}: suggests a second value (${got.suggest})`);
  }
  for (const s of MUST) ok(seen.has(s), `the message "${s}" was reached`);
  ok(p.errors.length === 0, () => `no errors: ${p.errors.join(' | ')}`);

  // ---------- Apply: the goal holds, one undo step ----------
  for (const name of ['solved', 'swapped', 'lines', 'tangent', 'point', 'node', 'slow', 'family']) {
    await load(p, CASES[name]);
    const before = await linked(p);
    const { r } = expected(before);
    const list = r.status === 'family' ? distinctEnds(r.family.ends) : r.solutions;
    for (let k = 0; k < list.length; k++) {
      // A solution equal to the circuit changes nothing, so it is no step.
      if (list[k].changed === 0) continue;
      if (k) await load(p, CASES[name]);
      await p.click(`[data-apply="${k}"]`);
      await settle(p);
      const after = await linked(p);
      const off = offGoal(after);
      counts.applied++;
      ok(off < 1e-9, () => `${name} #${k}: after Apply the goal is off by ${off}`);
      ok(!S.sameNetwork(after, before) || name === 'solved', `${name} #${k}: Apply changed the circuit`);
      ok(JSON.stringify(S.askOf(after).unknowns.map((u) => u.param)) === JSON.stringify(S.askOf(before).unknowns.map((u) => u.param)), `${name} #${k}: the marks stay`);
      await p.click('[data-undo]');
      await settle(p);
      ok(S.sameCircuit(await linked(p), before), async () => `${name} #${k}: one Undo brings the circuit back (${await query(p)})`);
      await p.click('[data-redo]');
      await settle(p);
      ok(S.sameCircuit(await linked(p), after), `${name} #${k}: Redo applies it again`);
    }
  }
  ok(counts.applied >= 12, `Apply checked on ${counts.applied} solutions`);

  // ---------- marking by mouse; a third mark replaces the oldest; undo covers marks ----------
  await load(p, CASES.nothing);
  await p.click('[data-tile="0"]');
  await p.click('[data-card] [data-solve-mark="value"]');
  await settle(p);
  ok(/[?&]u=1(&|$)/.test(await query(p)) && await p.getAttribute('[data-card] [data-solve-mark="value"]', 'aria-pressed') === 'true'
    && await p.$('[data-tile="0"][data-unknown]') !== null, async () => `mouse: part 1's value marked (${await query(p)})`);
  ok((await panel(p)).status === 'one', 'one value and the centre, already met: one solution');
  await p.click('[data-tile="1"]');
  await p.click('[data-card] [data-solve-mark="value"]');
  await settle(p);
  ok((await query(p)).includes('u=1,2') && (await panel(p)).status === 'solved', async () => `mouse: two marked, two solutions (${await query(p)})`);
  await p.click('[data-solve-mark="f0"]');
  await settle(p);
  ok((await query(p)).includes('u=2,f0') && /part 1’s C is no longer solved for/.test(await p.textContent('[data-mark-note]') ?? ''), async () => `a third mark replaces the oldest and says so (${await query(p)})`);
  await p.click('[data-undo]');
  await settle(p);
  ok((await query(p)).includes('u=1,2') && await p.$('[data-mark-note]') === null, async () => `Undo takes a mark back; the note goes (${await query(p)})`);
  await p.click('[data-unmark="0"]');
  await settle(p);
  ok((await query(p)).includes('u=2') && !(await query(p)).includes('u=1'), 'a chip unmarks');
  await p.click('[data-card] [data-solve-mark="value"]');
  await settle(p);
  ok(!(await query(p)).includes('u='), async () => `unmarking everything leaves no u in the link (${await query(p)})`);
  // "L or C" on a marked L.
  await p.click('[data-card] [data-solve-mark="value"]');
  await p.check('[data-card] [data-solve-free]');
  await settle(p);
  ok((await query(p)).includes('u=2lc'), async () => `"L or C" goes into the link (${await query(p)})`);

  // ---------- the goal: node, kind, typed figure, "or less", in the link and undone ----------
  await load(p, `${CASES.nothing}&u=1,2`);
  await p.selectOption('[data-goal-kind]', 'vswr');
  await settle(p);
  ok((await query(p)).includes('g=vswr:1.5:within') && (await panel(p)).status === 'family', async () => `VSWR starts at ≤ 1.5 with no typing: a family (${await query(p)})`);
  const field = '[data-name="goal-value"] input';
  await p.click(field, { clickCount: 3 });
  await p.keyboard.type('2.5');
  await settle(p);
  ok((await query(p)).includes('g=vswr:2.5:within'), async () => `the typed VSWR goes into the link (${await query(p)})`);
  await p.uncheck('[data-goal-within]');
  await p.selectOption('[data-goal-node]', '1');
  await settle(p);
  ok((await query(p)).includes('g=vswr:2.5@1'), async () => `"or less" off and node 1 in the link (${await query(p)})`);
  ok((await panel(p)).status === 'rejected', 'part 2 beyond node 1: rejected with its reason');
  // Reload: the link brings back the marks and the goal.
  const q1 = await query(p);
  await p.reload({ waitUntil: 'networkidle' });
  await settle(p);
  ok(await query(p) === q1 && await p.inputValue('[data-goal-kind]') === 'vswr' && await p.inputValue('[data-goal-node]') === '1'
    && await p.inputValue(field) === '2.5' && !(await p.isChecked('[data-goal-within]')), async () => `a reload keeps unknowns and goal (${await query(p)})`);
  ok(await p.isDisabled('[data-undo]'), 'the link read at load is no step');
  await load(p, `${CASES.nothing}&u=1,2`);
  await p.selectOption('[data-goal-kind]', 'vswr');
  await p.click(field, { clickCount: 3 });
  await p.keyboard.type('3.25');
  await settle(p);
  await p.click('[data-undo]'); await settle(p);
  ok((await query(p)).includes('g=vswr:1.5:within'), async () => `a typed figure is one undo step (${await query(p)})`);
  await p.click('[data-undo]'); await settle(p);
  ok(!(await query(p)).includes('g='), async () => `the goal's kind is one undo step (${await query(p)})`);
  await p.selectOption('[data-goal-kind]', 'point');
  await settle(p);
  await p.click('[data-name="goal-R"] input', { clickCount: 3 });
  await p.keyboard.type('30');
  await p.click('[data-name="goal-X"] input', { clickCount: 3 });
  await p.keyboard.type('-10');
  await settle(p);
  ok((await query(p)).includes('g=pt:30:-10'), async () => `a point target in ohms (${await query(p)})`);
  await p.click('[data-apply="0"]'); await settle(p);
  const pt = await linked(p), gp = gammaAt(pt, pt.parts.length), want = [0, 0];
  GL.goalTarget(want, 0, S.askOf(pt).goal, pt.z0);
  ok(Math.hypot(gp[0] - want[0], gp[1] - want[1]) < 1e-9, () => `Apply reaches the point 30 − j10 Ω (|ΔΓ| ${Math.hypot(gp[0] - want[0], gp[1] - want[1])})`);
  ok(p.errors.length === 0, () => `no errors (mouse): ${p.errors.join(' | ')}`);

  // ---------- keyboard alone ----------
  await load(p, CASES.nothing);
  await p.focus('[data-tile="0"]');
  await p.keyboard.press('Enter');
  let tabs = 0;
  while (tabs++ < 40 && !(await p.evaluate(() => document.activeElement?.getAttribute('data-solve-mark') === 'value'))) await p.keyboard.press('Tab');
  ok(tabs < 40, 'Tab reaches "Solve for" on the card');
  ok(await p.evaluate(() => { const e = document.activeElement; return getComputedStyle(e).outlineStyle !== 'none' || getComputedStyle(e).boxShadow !== 'none'; }), 'the focus is visible');
  await p.keyboard.press('Space');
  await settle(p);
  ok((await query(p)).includes('u=1'), async () => `Space marks (${await query(p)})`);
  tabs = 0;
  while (tabs++ < 40 && !(await p.evaluate(() => document.activeElement?.getAttribute('data-solve-mark') === 'f0'))) await p.keyboard.press('Tab');
  await p.keyboard.press('Enter');
  await settle(p);
  ok((await query(p)).includes('u=1,f0'), async () => `Tab to f0 and Enter marks it (${await query(p)})`);
  tabs = 0;
  while (tabs++ < 10 && !(await p.evaluate(() => document.activeElement?.hasAttribute('data-goal-kind')))) await p.keyboard.press('Tab');
  await p.keyboard.press('ArrowDown');
  await settle(p);
  ok((await query(p)).includes('g=pt:50:0'), async () => `the goal's kind by arrow keys (${await query(p)})`);
  await p.keyboard.press('Control+z'); await settle(p);
  ok(!(await query(p)).includes('g='), 'Ctrl+Z takes the goal back');
  tabs = 0;
  while (tabs++ < 40 && !(await p.evaluate(() => document.activeElement?.hasAttribute('data-apply')))) await p.keyboard.press('Tab');
  if (tabs < 40) {
    const before = await linked(p);
    await p.keyboard.press('Enter'); await settle(p);
    ok(!S.sameNetwork(await linked(p), before), 'Apply by Enter');
  } else ok(false, 'Tab reaches Apply');

  // ---------- M4.3b: the circles, goal, previews, family slider, standard values and value lists (ui-solve-chart.mjs) ----------
  await runChartChecks({ p, browser, ok, load, open, settle, linked, query, offGoal, gammaAt, expected, CASES, frame });

  // ---------- touch at 390 and 320 px ----------
  for (const width of [390, 320]) {
    const phone = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
    const t = await open(phone, CASES.nothing);
    await t.locator('[data-tile="1"]').tap();
    await t.locator('[data-card] [data-solve-mark="value"]').tap();
    await t.locator('[data-tile="0"]').tap();
    await t.locator('[data-card] [data-solve-mark="value"]').tap();
    await settle(t);
    ok((await query(t)).includes('u=2,1') && (await panel(t)).status === 'solved', async () => `${width} px: a tap marks (${await query(t)})`);
    ok(await noScroll(t), `${width} px: no horizontal scroll with solutions`);
    await t.locator('[data-solve-mark="f0"]').tap();
    await t.locator('[data-apply="0"]').scrollIntoViewIfNeeded().catch(() => {});
    ok(await noScroll(t), `${width} px: no horizontal scroll with the mark note`);
    for (const name of ['family', 'range', 'best', 'samejob', 'lines']) {
      await load(t, CASES[name]);
      ok(await noScroll(t), `${width} px ${name}: no horizontal scroll`);
    }
    await t.selectOption('[data-goal-kind]', 'point');
    await settle(t);
    ok(await noScroll(t), `${width} px: no horizontal scroll with the point's fields`);
    await load(t, CASES.solved);
    await t.locator('[data-apply="0"]').tap();
    await settle(t);
    ok(offGoal(await linked(t)) < 1e-9, `${width} px: Apply by tap`);
    if (shots && width === 390) {
      await load(t, CASES.family);
      await t.locator('[data-solve]').scrollIntoViewIfNeeded();
      mkdirSync(shots, { recursive: true });
      await t.screenshot({ path: join(shots, 'solve-390-dark.png') });
    }
    ok(t.errors.length === 0, () => `${width} px: no errors: ${t.errors.join(' | ')}`);
    await phone.close();
  }

  if (shots) {
    const wide = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'light', deviceScaleFactor: 1000 / 1440 });
    const w = await open(wide, `${CASES.swapped}`);
    await w.click('[data-tile="0"]');
    await settle(w);
    await w.screenshot({ path: join(shots, 'solve-1440-light.png') });
    const d = await open(await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark', deviceScaleFactor: 1000 / 1440 }), CASES.range);
    await d.screenshot({ path: join(shots, 'solve-1440-dark.png') });
    await wide.close();
  }
  await desk.close();
} catch (e) {
  ok(false, `the run stopped: ${e.stack ?? e}`);
}

await browser.close();
stopServer();
for (const failure of await Promise.all(failures)) console.log(`FAIL ${failure}`);
console.log(`messages reached: ${[...seen].sort().join(', ')}; ${counts.solutions} solutions and ${counts.values} values against solve(), Apply on ${counts.applied}`);
console.log(`on the chart: ${Object.entries(chartCounts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
console.log(`solving: ${passed} of ${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
