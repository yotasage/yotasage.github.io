// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the links between the equation panel and the
// page (step M5.2, components/Smith/mathLink.ts):
// - every variable of every equation shown, for every part, node and the readout's point of five circuits (one with a
//   circle goal at a middle node), carries targets that exist on the page (arc, arrow, handle, tile; node marker and
//   row; the circuit input; the goal's ring, mark, line and text; readout rows), equal to mathRows.ts's, with every
//   variable of the registry's equation given one; and each target is right by value: the variable's bound value is
//   the engine's at that node (network.evaluateCircuit), the part's value, parts.added, or the readout's quantity at the
//   point (convert.ts);
// - hover on each variable lights exactly its targets on the page and its places in the panel; leaving clears them;
// - focus on a row lights its left side's target, ← and → step through the row's targets, Escape goes back;
// - a tap (390 px, touch) lights and stays, a second tap clears;
// - the page → the panel: hover on a tile, a node row, an arc and a node marker of the chart lights their variables;
// - "show equation" from every readout row, the circuit input, every node row and the part card sets the subject,
//   opens the panel, focuses the wanted row in view, and "Back to …" returns the focus to the control in view; the same
//   with the keyboard alone (Enter, Tab, Enter); at 320 and 390 px (dark, the panel closed at first) with taps, and no
//   horizontal scroll.
//   tsx ui-math-link.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import * as importedEquations from '../../../lib/smith/equations.ts';
import * as importedRows from '../../../components/Smith/mathRows.ts';
import * as importedLink from '../../../components/Smith/mathLink.ts';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const C = importedConvert.default ?? importedConvert;
const EQ = importedEquations.default ?? importedEquations;
const MR = importedRows.default ?? importedRows;
const { READOUT_ROWS } = importedLink.default ?? importedLink;
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
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(typeof what === 'function' ? what() : what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const counts = { variables: 0, hovers: 0, shows: 0 };

// ---------- the circuits ----------

const TEN = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200';
const tenC = S.decodeCircuit(TEN).circuit;
const GOAL = `?${S.encodeCircuit(S.cleanAsk(tenC, { unknowns: [], goal: { kind: 'vswr', value: 2, within: true, node: 3 } }))}`;
const CIRCUITS = [
  ['start', ''],
  ['ten parts, every kind', TEN],
  ['an open load', '?v=1&z0=75&f0=2.4e9&zl=inf:0&p=ss:0.11:50,ls:3.3n,tl:0.07:60'],
  ['a 1 kHz audio-range circuit', '?v=1&z0=600&f0=1e3&zl=150:-80&p=rs:47,cp:220n,lp:33m,qw:300'],
  ['ten parts, a VSWR goal at node 3', GOAL],
];

async function open(context, query = '') {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await go(page, query);
  return page;
}
async function go(page, query) {
  await page.goto(`${base}/smith-chart/main${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-math-eq]', { state: 'attached' });
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await idle(page);
}
const linked = async (page) => S.decodeCircuit(new URL(page.url()).search).circuit;
const idle = (page) => page.waitForFunction(() => { const m = document.querySelector('[data-math]')?.smithMath; return !!m && m.idle; });
const subjectKey = (s) => (s.t === 'point' ? 'point' : `${s.t}:${s.t === 'part' ? s.i : s.k}`);
async function select(page, s) {
  await page.click('[data-math-follow="selection"]');
  if (s.t === 'part') await page.click(`[data-tile="${s.i}"]`);
  else {
    const pressed = await page.getAttribute(`[data-node-row="${s.k}"]`, 'aria-pressed');
    if (pressed !== 'true') await page.click(`[data-node-row="${s.k}"]`);
  }
  await page.waitForFunction((k) => document.querySelector('[data-math]').dataset.mathSubject === k, subjectKey(s));
  await idle(page);
}
function subjectsOf(c) {
  const out = [];
  for (let i = 0; i < c.parts.length; i++) out.push({ t: 'part', i });
  for (let k = 0; k <= c.parts.length; k++) out.push({ t: 'node', k });
  return out;
}

/** What a page element is, by its marking attribute. */
const IDENT = `(e) => { for (const a of ['data-arc', 'data-arrow', 'data-handle', 'data-node', 'data-tile', 'data-card', 'data-node-row', 'data-read-row', 'data-input-box', 'data-goal-ring', 'data-goal', 'data-goal-line', 'data-goal-text']) if (e.hasAttribute(a)) return a + '=' + e.getAttribute(a); return e.tagName; }`;
/** The page's lit elements outside the panel, and the panel's lit variables. */
const litNow = (page) => page.evaluate((ident) => {
  const id = eval(ident);
  const all = [...document.querySelectorAll('#tool [data-lit]')];
  return {
    page: all.filter((e) => !e.closest('[data-math]')).map(id).sort(),
    panel: all.filter((e) => e.closest('[data-math]')).map((e) => e.getAttribute('data-mt')),
  };
}, IDENT);
/** What the tokens should light, given the circuit's part count and the selected part (its card). */
function wanted(tokens, n, card) {
  const out = [];
  for (const t of tokens.split(' ')) {
    if (t === 'goal') out.push('data-goal-ring=', 'data-goal=', 'data-goal-line=', 'data-goal-text=');
    else if (t[0] === 'p') {
      const i = t.slice(1);
      out.push(`data-arc=${i}`, `data-arrow=${i}`, `data-handle=${i}`, `data-tile=${i}`);
      if (Number(i) === card) out.push(`data-card=${i}`);
    } else if (t[0] === 'n') {
      const k = t.slice(1);
      out.push(`data-node=${k}`, `data-node-row=${k}`);
      if (Number(k) === n) out.push('data-input-box=');
    } else if (t[0] === 'r') {
      out.push(`data-read-row=${t.slice(1)}`);
      if (t === 'rgamma') out.push('data-read-row=gammaRect');
    }
  }
  return out.sort();
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------- each variable's target by value ----------

const sc = new Float64Array(2);
/** The variable's bound value is what its target is: the engine's at the node, the part's value, the readout's quantity. */
function checkValue(c, row, name, token, what, gr, gi) {
  const b = row.binding[name];
  if (!b) return;
  const z0 = c.z0, { metrics } = N.evaluateCircuit(c), M = N.METRIC_STRIDE;
  const t = token.split(' ')[0];
  const eq2 = (re, im) => ok(close(b[0], re, 1e-9) && close(b[1], im, 1e-9), () => `${what} ${row.id}: ${name} = ${b} is not ${t}'s ${re}, ${im}`);
  if (t[0] === 'n') {
    const m = Number(t.slice(1)) * M;
    const zr = metrics[m + N.M_ZR], zi = metrics[m + N.M_ZI];
    if (['z', 'z_L', 'z_in'].includes(name)) eq2(zr, zi);
    else if (['Z', 'Z_L', 'Z_in'].includes(name)) eq2(zr * z0, zi * z0);
    else if (['y_L', 'y_in'].includes(name)) eq2(metrics[m + N.M_YR], metrics[m + N.M_YI]);
    else if (name === 'Gamma') eq2(metrics[m + N.M_GR], metrics[m + N.M_GI]);
    else if (name === 'r') eq2(zr, 0);
    else if (name === 'x') eq2(zi, 0);
    else if (name === 'VSWR') eq2(metrics[m + N.M_VSWR], 0);
    else if (name === 'RL') eq2(metrics[m + N.M_RL], 0);
    else if (name === 'ML') eq2(metrics[m + N.M_ML], 0);
    else if (name === 'Gamma_c') {
      // Γ of the node's Z on the line's own reference.
      const p = c.parts[Number(t.slice(1))], zc = p.zc ?? z0;
      C.gammaFromImpedance(sc, 0, zr * z0, zi * z0, zc);
      eq2(sc[0], sc[1]);
    } else ok(false, `${what} ${row.id}: ${name} has a node target ${t} that is not checked`);
  } else if (t[0] === 'p') {
    const p = c.parts[Number(t.slice(1))], zc = p.kind === P.QUARTER ? p.value : p.zc ?? z0;
    const a = P.added(p.kind, p.value, zc, c.f0, c.f0, z0);
    if (['R', 'L', 'C', 'Z_t'].includes(name)) eq2(p.value, 0);
    else if (name === 'Z_c') eq2(zc, 0);
    else if (name === 'Y_c') eq2(1 / zc, 0);
    else if (['r', 'g', 'x', 'b'].includes(name)) eq2(a, 0);
    else if (name === 'X') eq2(a * z0, 0);
    else if (name === 'B') eq2(a / z0, 0);
    else if (name === 'z_s' || name === 'y_p') eq2(p.kind === P.SERIES_R || p.kind === P.SHUNT_R ? a : 0, p.kind === P.SERIES_R || p.kind === P.SHUNT_R ? 0 : a);
    else if (name === 'ell') eq2(P.turnsAt(p.kind, p.value, c.f0, c.f0), 0);
    else if (name === 'theta') eq2(2 * Math.PI * P.turnsAt(p.kind, p.value, c.f0, c.f0), 0);
    else ok(false, `${what} ${row.id}: ${name} has a part target ${t} that is not checked`);
  } else if (t[0] === 'r') {
    const f = t.slice(1);
    if (f === 'z') { C.zFromGamma(sc, 0, gr, gi); if (name === 'z') eq2(sc[0], sc[1]); else eq2(name === 'r' ? sc[0] : sc[1], 0); }
    else if (f === 'Z') { C.impedanceFromGamma(sc, 0, gr, gi, z0); eq2(sc[0], sc[1]); }
    else if (f === 'y') { C.yFromGamma(sc, 0, gr, gi); if (name === 'y') eq2(sc[0], sc[1]); else eq2(name === 'g' ? sc[0] : sc[1], 0); }
    else if (f === 'Y') { C.admittanceFromGamma(sc, 0, gr, gi, z0); eq2(sc[0], sc[1]); }
    else if (f === 'gamma') eq2(gr, gi);
    else if (f === 'vswr') eq2(C.vswr(C.gammaMag(gr, gi)), 0);
    else if (f === 'rl') eq2(C.returnLoss(C.gammaMag(gr, gi)), 0);
    else ok(false, `${what}: unknown readout target ${t}`);
  }
}

/** The panel's variables: their targets are mathRows' and exist on the page; every equation variable has one. */
async function checkTargets(page, s, what, gr = NaN, gi = NaN) {
  const c = await linked(page);
  const rows = MR.mathRows(c, s, 4, gr, gi);
  const goal = S.askOf(c).goal, gk = goal.node ?? c.parts.length;
  const shown = await page.evaluate(() => [...document.querySelectorAll('[data-math-eq]')].map((li) => ({
    id: li.dataset.mathEq, row: li.dataset.mathT, mt: [...new Set([...li.querySelectorAll('[data-mt]')].map((e) => e.getAttribute('data-mt')))],
  })));
  ok(shown.length === rows.length, `${what}: ${shown.length} rows, ${rows.length} wanted`);
  const tokens = new Set();
  rows.forEach((r, j) => {
    const g = shown[j] ?? { mt: [] };
    const names = Object.keys(MR.specsFor(c, s, gr, gi)[j].vars);
    ok(g.row === r.target && r.target !== '', `${what} ${r.id}: the row's target "${g.row}" vs "${r.target}"`);
    // Every variable of the equation has a target, unless it is a constant.
    for (const v of EQ.variablesOf(EQ.EQUATION_BY_ID.get(r.id).tree)) {
      // Constants, and quantities the panel has no number of (V_max, P_inc: only in the symbolic line), have none.
      if (['Z_0', 'Y_0', 'omega', 'beta', 'lambda'].includes(v) || !names.includes(v)) continue;
      const t = r.targets[names.indexOf(v)];
      ok(!!t, `${what} ${r.id}: ${v} has a target`);
      if (!t) continue;
      counts.variables++;
      checkValue(c, r, v, t, what, gr, gi);
      // The goal's token only on the goal's node.
      if (t.includes('goal')) ok(t.startsWith(`n${gk} `), `${what} ${r.id}: ${v} stands for the goal only at its node ${gk} (${t})`);
    }
    ok(g.mt.every((t) => r.targets.includes(t)) && r.targets.filter(Boolean).every((t) => g.mt.includes(t)),
      () => `${what} ${r.id}: the MathML's targets ${JSON.stringify(g.mt)} vs ${JSON.stringify(r.targets)}`);
    for (const t of g.mt) tokens.add(t);
  });
  // Every token's elements exist on the page.
  const n = c.parts.length;
  for (const t of tokens) {
    const want = wanted(t, n, -1).map((w) => { const [a, v] = w.split('='); return v === '' ? `[${a}]` : `[${a}="${v}"]`; });
    const missing = await page.evaluate((sels) => sels.filter((q) => !document.querySelector(`#tool ${q}`)), want);
    ok(missing.length === 0, `${what}: target ${t} has no ${missing.join(', ')}`);
  }
  return { c, tokens: [...tokens] };
}

/** Hover each token's first variable: exactly its elements lit on the page, its places in the panel; leaving clears. */
async function checkHovers(page, c, tokens, card, what) {
  const n = c.parts.length;
  for (const t of tokens) {
    const el = await page.$(`[data-math-eq] [data-mt="${t}"]`);
    await el.scrollIntoViewIfNeeded();
    await el.hover();
    await frame(page);
    const lit = await litNow(page);
    const w = wanted(t, n, card);
    ok(same(lit.page, w), () => `${what} hover ${t}: lit ${JSON.stringify(lit.page)} vs ${JSON.stringify(w)}`);
    const first = t.split(' ').filter((x) => x !== 'goal');
    const places = await page.$$eval('[data-math] [data-mt]', (els, f) => els.filter((e) => e.getAttribute('data-mt').split(' ').some((x) => f.includes(x))).length, first);
    ok(lit.panel.length === places && places > 0, `${what} hover ${t}: ${lit.panel.length} of its ${places} places lit in the panel`);
    counts.hovers++;
  }
  await page.mouse.move(2, 300);
  await frame(page);
  const lit = await litNow(page);
  ok(lit.page.length === 0 && lit.panel.length === 0, `${what}: nothing lit after the pointer leaves (${JSON.stringify(lit)})`);
}

const inView = (page, sel) => page.evaluate((q) => {
  const e = q === ':focus' ? document.activeElement : document.querySelector(q);
  const r = e?.getBoundingClientRect();
  return !!r && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
}, sel);
const focusInfo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return { eq: a?.dataset?.mathEq ?? null, show: a?.dataset?.showEq ?? null, back: a?.hasAttribute?.('data-math-back') ?? false, backIn: !!a?.querySelector?.('[data-math-back]'), subject: document.querySelector('[data-math]').dataset.mathSubject, open: document.querySelector('[data-math] details').open };
});

/** "Show equation" from a control: the subject, the panel open, the row focused in view, and the way back. */
async function checkShow(page, key, subject, row, what, how = 'click') {
  const sel = `[data-show-eq="${key}"]`;
  if (how === 'keys') { await page.focus(sel); await page.keyboard.press('Enter'); }
  else if (how === 'tap') await page.tap(sel);
  else await page.click(sel);
  await page.waitForFunction((k) => document.querySelector('[data-math]').dataset.mathSubject === k, subjectKey(subject));
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-math-eq'), null, { timeout: 3000 }).catch(() => {});
  const f = await focusInfo(page);
  ok(f.open && f.eq === row && f.backIn, () => `${what}: the panel open with the focus on ${row} and its way back (${JSON.stringify(f)})`);
  ok(await inView(page, ':focus'), `${what}: the focused row is in view`);
  if (how === 'keys') { await page.keyboard.press('Tab'); ok((await focusInfo(page)).back, `${what}: Tab reaches "Back to …"`); await page.keyboard.press('Enter'); }
  else if (how === 'tap') await page.tap('[data-math-back]');
  else await page.click('[data-math-back]');
  await frame(page);
  const b = await focusInfo(page);
  ok(b.show === key, () => `${what}: back on the control (${JSON.stringify(b)})`);
  ok(await inView(page, sel), `${what}: the control is in view again`);
  ok(await page.$('[data-math-back]') === null, `${what}: the way back is gone once used`);
  counts.shows++;
}

try {
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await open(desk);

  // ---------- targets of every variable for every subject of five circuits; hovers on three ----------
  for (const [name, q] of CIRCUITS) {
    if (q) await go(page, q);
    const c = await linked(page);
    const hover = name !== 'an open load' && name !== 'ten parts, every kind';
    for (const s of subjectsOf(c)) {
      await select(page, s);
      const { tokens } = await checkTargets(page, s, `${name}, ${subjectKey(s)}`);
      if (hover) await checkHovers(page, c, tokens, s.t === 'part' ? s.i : -1, `${name}, ${subjectKey(s)}`);
    }
    // The readout's point at one place: its rows' targets are the readout's rows.
    const box = await page.$eval('[data-chart]', (b) => { const r = b.getBoundingClientRect(); return [r.left + r.width * 0.62, r.top + r.height * 0.4]; });
    await page.click('[data-math-follow="point"]');
    await page.mouse.move(box[0], box[1]);
    await frame(page); await idle(page);
    const [gr, gi] = await page.$eval('[data-chart]', (b) => [b.smithChart.readX, b.smithChart.readY]);
    await checkTargets(page, { t: 'point' }, `${name}, the readout's point`, gr, gi);
    await page.click('[data-math-follow="selection"]');
  }
  // Hover on the point's variables: the readout rows (the pointer leaves the chart, the readout keeps its rows).
  {
    await page.click('[data-math-follow="point"]');
    const tokens = await page.$$eval('[data-math-eq] [data-mt]', (els) => [...new Set(els.map((e) => e.getAttribute('data-mt')))]);
    const c = await linked(page);
    await checkHovers(page, c, tokens, -1, 'the readout point');
    await page.click('[data-math-follow="selection"]');
  }

  // ---------- the page → the panel: tile, node row, an arc and a node on the chart ----------
  await go(page, GOAL);
  const gc = await linked(page);
  await select(page, { t: 'part', i: 4 });
  const panelLit = async (t) => { await frame(page); const l = await litNow(page); return l.panel.length > 0 && l.panel.every((m) => m.split(' ').includes(t)); };
  await page.hover('[data-tile="4"]');
  ok(await panelLit('p4'), 'hover on tile 5: its variables lit in the panel');
  await page.hover('[data-node-row="5"]');
  ok(await panelLit('n5'), 'hover on node 5\'s row: its variables lit in the panel');
  await page.mouse.move(2, 300);
  const spot = await page.evaluate(() => {
    const box = document.querySelector('[data-chart]'), path = box.smithPath, r = box.getBoundingClientRect();
    let arc = null, node = null;
    for (let y = 4; y < box.clientHeight && !(arc && node); y += 3) {
      for (let x = 4; x < box.clientWidth; x += 3) {
        const [kind, i] = path.pick(x, y);
        if (!arc && kind === 1 && i === 4) arc = [r.left + box.clientLeft + x, r.top + box.clientTop + y];
        if (!node && kind === 2 && i === 4) node = [r.left + box.clientLeft + x, r.top + box.clientTop + y];
      }
    }
    return { arc, node };
  });
  ok(spot.arc && spot.node, `the arc of part 5 and node 4 are found on the chart (${JSON.stringify(spot)})`);
  if (spot.arc) { await page.mouse.move(spot.arc[0], spot.arc[1]); ok(await panelLit('p4'), 'hover on part 5\'s arc on the chart: its variables lit in the panel'); }
  if (spot.node) { await page.mouse.move(spot.node[0], spot.node[1]); ok(await panelLit('n4'), 'hover on node 4 on the chart: its variables lit in the panel'); }
  await page.mouse.move(2, 300);
  await frame(page);
  ok((await litNow(page)).panel.length === 0, 'nothing lit in the panel once the pointer leaves the chart');

  // ---------- focus and the arrow keys ----------
  await select(page, { t: 'part', i: 2 });
  const rows = MR.mathRows(gc, { t: 'part', i: 2 }, 4);
  // The pointer away from the page (a focus scrolls, and the pointer would be over something else).
  await page.mouse.move(1, 1);
  for (let j = 0; j < rows.length; j++) {
    await page.focus(`[data-math-eq]:nth-child(${j + 1})`);
    await frame(page);
    let lit = await litNow(page);
    ok(same(lit.page, wanted(rows[j].target, gc.parts.length, 2)), () => `focus on ${rows[j].id}: lit ${JSON.stringify(lit.page)}`);
    const stops = [...new Set(rows[j].targets.filter(Boolean))];
    for (let s = 0; s <= stops.length; s++) {
      await page.keyboard.press('ArrowRight');
      await frame(page);
      lit = await litNow(page);
      const t = stops[s % stops.length];
      ok(same(lit.page, wanted(t, gc.parts.length, 2)), () => `${rows[j].id} → step ${s + 1}: lit ${JSON.stringify(lit.page)} vs ${t}`);
    }
    await page.keyboard.press('ArrowLeft');
    await frame(page);
    lit = await litNow(page);
    // stops.length + 1 steps right end on the first target; one step left wraps to the last.
    ok(same(lit.page, wanted(stops[stops.length - 1], gc.parts.length, 2)), () => `${rows[j].id} ←: lit ${JSON.stringify(lit.page)}`);
    await page.keyboard.press('Escape');
    await frame(page);
    lit = await litNow(page);
    ok(same(lit.page, wanted(rows[j].target, gc.parts.length, 2)), () => `${rows[j].id} Escape: back to the row's target (${JSON.stringify(lit.page)})`);
  }
  await page.focus('[data-tile="2"]');
  await frame(page);

  // ---------- "show equation" from every place, by mouse; four by the keyboard alone ----------
  const n = gc.parts.length;
  for (const f of Object.keys(READOUT_ROWS)) await checkShow(page, `read:${f}`, { t: 'point' }, READOUT_ROWS[f], `show from the readout's ${f}`);
  await page.click('[data-math-follow="selection"]');
  await checkShow(page, 'input', { t: 'node', k: n }, MR.rowIds(gc, { t: 'node', k: n })[0], 'show from the circuit input');
  for (let k = 0; k <= n; k++) await checkShow(page, `node:${k}`, { t: 'node', k }, MR.rowIds(gc, { t: 'node', k })[0], `show from node ${k}'s row`);
  for (const i of [0, 4, 9]) {
    await page.click(`[data-tile="${i}"]`);
    await checkShow(page, 'part', { t: 'part', i }, MR.rowIds(gc, { t: 'part', i })[0], `show from part ${i + 1}'s card`);
  }
  await checkShow(page, 'read:vswr', { t: 'point' }, 'vswr', 'keys: show from the readout\'s VSWR', 'keys');
  await page.click('[data-math-follow="selection"]');
  await checkShow(page, 'input', { t: 'node', k: n }, MR.rowIds(gc, { t: 'node', k: n })[0], 'keys: show from the circuit input', 'keys');
  await checkShow(page, 'node:2', { t: 'node', k: 2 }, MR.rowIds(gc, { t: 'node', k: 2 })[0], 'keys: show from node 2', 'keys');
  await page.click('[data-tile="6"]');
  await checkShow(page, 'part', { t: 'part', i: 6 }, MR.rowIds(gc, { t: 'part', i: 6 })[0], 'keys: show from the part card', 'keys');
  ok(page.errors.length === 0, `no errors: ${page.errors.join(' | ')}`);
  await page.close();

  // ---------- phones: taps, show and back, no horizontal scroll ----------
  for (const width of [320, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
    const pp = await open(ctx, GOAL);
    const c = await linked(pp);
    ok(!(await pp.$eval('[data-math] details', (d) => d.open)), `${width} px: the panel starts closed`);
    await pp.tap('[data-tile="3"]');
    await checkShow(pp, 'part', { t: 'part', i: 3 }, MR.rowIds(c, { t: 'part', i: 3 })[0], `${width} px: tap show from the part card`, 'tap');
    await pp.tap('[data-nodes] summary');
    await checkShow(pp, 'node:3', { t: 'node', k: 3 }, MR.rowIds(c, { t: 'node', k: 3 })[0], `${width} px: tap show from node 3`, 'tap');
    // A tap on a variable lights it and stays; a second tap clears it.
    const v = await pp.$('[data-math-eq] [data-mt~="goal"]');
    const t = await v.getAttribute('data-mt');
    await v.scrollIntoViewIfNeeded();
    await v.tap();
    await pp.waitForTimeout(250);
    let lit = await litNow(pp);
    ok(same(lit.page, wanted(t, c.parts.length, 3)), () => `${width} px: a tap on ${t} lights it and it stays (${JSON.stringify(lit.page)})`);
    await v.tap();
    await frame(pp);
    lit = await litNow(pp);
    ok(lit.page.length === 0 || same(lit.page, wanted(await pp.evaluate(() => document.activeElement?.dataset?.mathT ?? ''), c.parts.length, 3)),
      () => `${width} px: a second tap clears it (${JSON.stringify(lit.page)})`);
    const sw = await pp.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    ok(sw[0] <= sw[1], `${width} px: no horizontal scroll (${sw[0]} > ${sw[1]})`);
    if (shots) {
      mkdirSync(shots, { recursive: true });
      await pp.screenshot({ path: join(shots, `smith-math-link-${width}-dark.png`) });
    }
    ok(pp.errors.length === 0, `${width} px: no errors: ${pp.errors.join(' | ')}`);
    await ctx.close();
  }
} catch (e) {
  ok(false, `crashed: ${e.stack}`);
} finally {
  await browser.close();
  stopServer();
}

console.log(`${counts.variables} variables' targets checked by value, ${counts.hovers} hovers, ${counts.shows} show-and-back`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`equation links: ${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
