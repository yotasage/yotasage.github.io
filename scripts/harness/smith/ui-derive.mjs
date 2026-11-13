// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the derivations (step M5.3): every equation of
// the Equations panel that has a derivation shows "Derive" and opens it, for every part, node and the readout's point
// of three circuits; every derivation of the registry opens from a "derive" link of the theory. Each time the dialog's
// steps are compared with components/Smith/derive.ts for the circuit in the link (the TeX of every symbolic line, line
// with numbers and value, through the MathML's annotation), revealed in order by "Next step", "Back" and "Show all";
// the values put in are checked against the engine here (network.evaluateCircuit, parts.added, convert, goal) and
// every shown step's sides are evaluated with the registry's tree on that binding (to 1e-9) and equal each other.
// Every TeX of every derivation for every subject renders in KaTeX with throwOnError and strict: 'error'. The keyboard
// alone (Enter on a row, Enter on Next, Shift+Tab, ← → in a step, Escape back to the row), and taps at 320 and 390 px
// (dark): the dialog fits, the page and the dialog do not scroll sideways, a tapped variable lights its part.
//   tsx ui-derive.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import katex from 'katex';
import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import * as importedGoal from '../../../lib/smith/goal.ts';
import * as importedEquations from '../../../lib/smith/equations.ts';
import * as importedDerive from '../../../components/Smith/derive.ts';

const S = importedState.default ?? importedState;
const N = importedNetwork.default ?? importedNetwork;
const P = importedParts.default ?? importedParts;
const CV = importedConvert.default ?? importedConvert;
const GL = importedGoal.default ?? importedGoal;
const EQ = importedEquations.default ?? importedEquations;
const D = importedDerive.default ?? importedDerive;
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
const closeC = (a, b, tol = 1e-9) => !!a && !!b && close(a[0], b[0], tol * Math.max(1, Math.hypot(...b))) && close(a[1], b[1], tol * Math.max(1, Math.hypot(...b)));

// The start circuit, ten parts of every kind (with a point target at the input, for mismatch-to-target), 1 kHz.
const TEN = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200,tl:0.125:50';
const CIRCUITS = [
  ['start', ''],
  ['eleven parts, every kind', TEN],
  ['a 1 kHz audio-range circuit', '?v=1&z0=600&f0=1e3&zl=150:-80&p=rs:47,cp:220n,lp:33m,qw:300'],
];

// ---------- the node side: KaTeX on every derivation for every subject ----------
const renders = (s, inline = false) => { try { katex.renderToString(inline ? s : `\\displaystyle ${s}`, { output: 'mathml', throwOnError: true, strict: 'error' }); return true; } catch { return false; } };
const subjectsOf = (c) => [
  ...c.parts.map((_, i) => ({ t: 'part', i })), ...Array.from({ length: c.parts.length + 1 }, (_, k) => ({ t: 'node', k })),
];
let rendered = 0, reasonMath = 0;
for (const [, q] of CIRCUITS) {
  const c = S.decodeCircuit(q || `?${S.encodeCircuit(S.defaultCircuit())}`).circuit;
  for (const id of D.DERIVATION_IDS) {
    for (const s of [null, D.theorySubject(c, id), ...subjectsOf(c), { t: 'point' }]) {
      const d = D.derivation(c, id, s, 4, 0.31, -0.42);
      for (const t of [...d.tex, ...d.steps.flatMap((x) => [...x.tex, ...x.nums, x.value].filter(Boolean))]) {
        rendered++;
        ok(renders(t), () => `${id} (${JSON.stringify(s)}): KaTeX fails on ${t}`);
      }
      // The reasons' maths, inline (notes-M5.3.md, Fixes): every piece at an odd index is TeX that renders.
      for (const x of d.steps) for (let k = 1; k < x.why.length; k += 2) {
        reasonMath++;
        ok(renders(x.why[k], true), () => `${id} (${JSON.stringify(s)}): KaTeX fails on the reason's ${x.why[k]}`);
      }
    }
  }
}
ok(D.DERIVATION_IDS.length >= 26, `${D.DERIVATION_IDS.length} derivations in the registry`);

// ---------- the binding against the engine ----------
const scratch = new Float64Array(2);
/** Checks the values a derivation put in against this run of the engine; returns how many it checked. */
function checkBinding(c, s, b, what, gr, gi) {
  let n = 0;
  const eqc = (name, want) => { if (!(name in b)) return; n++; ok(closeC(b[name], want, 1e-12), () => `${what}: ${name} = ${b[name]} vs the engine's ${want}`); };
  const z0 = c.z0;
  const { metrics } = N.evaluateCircuit(c);
  const at = (k) => {
    const o = k * N.METRIC_STRIDE;
    return { z: [metrics[o + N.M_ZR], metrics[o + N.M_ZI]], y: [metrics[o + N.M_YR], metrics[o + N.M_YI]], G: [metrics[o + N.M_GR], metrics[o + N.M_GI]], m: metrics[o + N.M_MAG] };
  };
  let node = null;
  if (s.t === 'node') node = at(s.k);
  else if (s.t === 'part') node = at(s.i + 1);
  else {
    CV.zFromGamma(scratch, 0, gr, gi); const z = [scratch[0], scratch[1]];
    CV.yFromGamma(scratch, 0, gr, gi);
    node = { z, y: [scratch[0], scratch[1]], G: [gr, gi], m: Math.hypot(gr, gi) };
  }
  eqc('Gamma', node.G); eqc('z', node.z); eqc('y', node.y);
  eqc('Gamma_r', [node.G[0], 0]); eqc('Gamma_i', [node.G[1], 0]);
  // A lumped part's or stub's r, x, g or b is what it adds (its own equation's), a node's or the point's those of its z and y.
  const own = s.t === 'part' && (c.parts[s.i].kind <= P.SHUNT_C || P.isStub(c.parts[s.i].kind));
  if (!own) { eqc('r', [node.z[0], 0]); eqc('x', [node.z[1], 0]); eqc('g', [node.y[0], 0]); eqc('b', [node.y[1], 0]); }
  eqc('Z', [node.z[0] * z0, node.z[1] * z0]); eqc('Z_0', [z0, 0]);
  eqc('VSWR', [CV.vswr(node.m), 0]); eqc('RL', [CV.returnLoss(node.m), 0]); eqc('ML', [CV.mismatchLoss(node.m), 0]);
  if (s.t === 'part') {
    const p = c.parts[s.i], L = at(s.i), In = at(s.i + 1), zc = p.kind === P.QUARTER ? p.value : p.zc ?? z0;
    const a = P.added(p.kind, p.value, zc, c.f0, c.f0, z0), res = p.kind === P.SERIES_R || p.kind === P.SHUNT_R;
    eqc('z_L', L.z); eqc('z_in', In.z); eqc('y_L', L.y); eqc('y_in', In.y);
    eqc('Z_L', [L.z[0] * z0, L.z[1] * z0]); eqc('Z_in', [In.z[0] * z0, In.z[1] * z0]);
    eqc('z_s', res ? [a, 0] : [0, a]); eqc('y_p', res ? [a, 0] : [0, a]);
    if (own) eqc(P.isSeries(p.kind) ? (res ? 'r' : 'x') : res ? 'g' : 'b', [a, 0]);
    eqc('Z_c', [zc, 0]); eqc('Z_t', [zc, 0]);
    if ('Gamma_c' in b) { CV.gammaFromImpedance(scratch, 0, L.z[0] * z0, L.z[1] * z0, zc); eqc('Gamma_c', [scratch[0], scratch[1]]); }
    eqc('Gamma_L', L.G); eqc('Gamma_in', In.G);
  }
  if (s.t === 'node' && s.k === 0) {
    eqc('z_L', node.z); eqc('r_L', [node.z[0], 0]); eqc('x_L', [node.z[1], 0]); eqc('R_L', [c.loadR, 0]);
    // The two-part match: the circuit built from x_s and b_p reaches the centre (network.evaluate).
    if ('x_s' in b) {
      const xs = b.x_s[0], bp = b.b_p[0], f = c.f0, parts = [];
      if (Math.abs(xs) > 1e-12) parts.push({ kind: xs > 0 ? P.SERIES_L : P.SERIES_C, value: P.valueFor(xs > 0 ? P.SERIES_L : P.SERIES_C, xs, 0, f, f, z0) });
      parts.push({ kind: bp > 0 ? P.SHUNT_C : P.SHUNT_L, value: P.valueFor(bp > 0 ? P.SHUNT_C : P.SHUNT_L, bp, 0, f, f, z0) });
      const e = N.evaluateCircuit({ z0, f0: f, loadR: c.loadR, loadX: c.loadX, parts }).metrics, o = parts.length * N.METRIC_STRIDE;
      eqc('y_in', [e[o + N.M_YR], e[o + N.M_YI]]);
      eqc('y_1', [e[(parts.length - 1) * N.METRIC_STRIDE + N.M_YR], e[(parts.length - 1) * N.METRIC_STRIDE + N.M_YI]]);
    }
  }
  if ('m' in b) {
    const goal = S.askOf(c).goal;
    eqc('m', [GL.goalMismatch(goal, node.G[0], node.G[1], z0), 0]);
    GL.goalTarget(scratch, 0, goal, z0); eqc('Gamma_t', [scratch[0], scratch[1]]);
  }
  return n;
}

// ---------- the browser ----------
async function open(context, query = '') {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-math-eq]', { state: 'attached' });
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  return page;
}
const linked = async (page) => S.decodeCircuit(new URL(page.url()).search).circuit;
const subjectKey = (s) => (s.t === 'point' ? 'point' : `${s.t}:${s.t === 'part' ? s.i : s.k}`);
async function select(page, s) {
  if (s.t === 'part') await page.click(`[data-tile="${s.i}"]`);
  else {
    const pressed = await page.getAttribute(`[data-node-row="${s.k}"]`, 'aria-pressed');
    if (pressed !== 'true') await page.click(`[data-node-row="${s.k}"]`);
  }
  await page.waitForFunction((k) => document.querySelector('[data-math]').dataset.mathSubject === k, subjectKey(s));
}
/** What the dialog shows. */
const dialog = (page) => page.evaluate(() => {
  const d = document.querySelector('dialog[data-derive]');
  const tex = (el) => (el ? el.querySelector('annotation')?.textContent ?? null : null);
  const texs = (el) => (el ? [...el.querySelectorAll('annotation')].map((a) => a.textContent) : []);
  return {
    open: !!d?.open, id: d?.dataset.derive ?? '', shown: Number(d?.dataset.deriveShown), bind: d?.dataset.deriveBind ? JSON.parse(d.dataset.deriveBind) : {},
    goal: texs(d?.querySelector('[data-derive-goal]')), count: d?.querySelector('[data-derive-count]')?.textContent ?? '',
    steps: [...(d?.querySelectorAll('[data-derive-step]') ?? [])].map((li) => {
      const why = li.querySelector('[data-derive-why]');
      return {
        sym: texs(li.querySelector('[data-derive-sym]')),
        why: why ? [...why.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('') : '', whyTex: texs(why),
        whyMath: why ? why.querySelectorAll('math').length : 0,
        nums: [...li.querySelectorAll('[data-derive-nums] [data-derive-line]:not([data-derive-value])')].map(tex),
        value: tex(li.querySelector('[data-derive-value]')), sides: JSON.parse(li.dataset.deriveSides),
      };
    }),
    scroll: d ? d.scrollWidth - d.clientWidth : 0,
    body: d?.querySelector('[data-derive-body]') ? d.querySelector('[data-derive-body]').scrollWidth - d.querySelector('[data-derive-body]').clientWidth : 0,
    active: document.activeElement?.hasAttribute('data-derive-next') ? 'next' : document.activeElement?.getAttribute('data-math-eq') ?? document.activeElement?.getAttribute('data-derive-open') ?? document.activeElement?.tagName,
  };
});
const ds = (t) => (t ? `\\displaystyle ${t}` : null);
/** An equation's sides as the dialog prints them, one line each: "= " before every side but the first. */
const lines = (xs) => xs.map((t, k) => `\\displaystyle ${k ? '{}= ' : ''}${t}`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let stepsChecked = 0, numbered = 0, bindingsChecked = 0;
/** The dialog against derive.ts (all steps shown) and the engine. */
async function compareDialog(page, c, id, s, what, gr = NaN, gi = NaN) {
  const g = await dialog(page);
  const want = D.derivation(c, id, s, 4, gr, gi);
  ok(g.open && g.id === id, `${what}: the dialog shows ${g.id} (open ${g.open}), wanted ${id}`);
  ok(same(g.goal, lines(want.tex)), () => `${what}: the equation ${g.goal} vs ${want.tex}`);
  ok(g.steps.length === want.steps.length, `${what}: ${g.steps.length} steps shown of ${want.steps.length}`);
  want.steps.forEach((w, k) => {
    const st = g.steps[k] ?? {};
    stepsChecked++;
    const text = w.why.filter((_, j) => j % 2 === 0).join(''), maths = w.why.filter((_, j) => j % 2 === 1);
    ok(same(st.sym, lines(w.tex)) && st.why === text && same(st.whyTex, maths) && st.whyMath === maths.length,
      () => `${what} step ${k + 1}: ${st.sym} / ${st.why} ${st.whyTex} vs ${w.tex} / ${w.why}`);
    ok(same(st.nums, lines(w.nums)) && st.value === ds(w.value || null), () => `${what} step ${k + 1}: numbers ${st.nums} ${st.value} vs ${w.nums} ${w.value}`);
    if (!w.nums.length) return;
    numbered++;
    // The registry's tree on the page's binding gives every side the page lists, and they are equal.
    const sides = EQ.evaluate(EQ.EQUATION_BY_ID.get(id).steps[k].tree, g.bind);
    ok(sides.length === st.sides.length && sides.every((a, j) => closeC(st.sides[j], [a[0], a[1]])), () => `${what} step ${k + 1}: sides ${JSON.stringify(st.sides)}`);
    const big = Math.max(1, ...st.sides.map((x) => Math.hypot(...x)));
    ok(st.sides.every((x) => Math.hypot(x[0] - st.sides[0][0], x[1] - st.sides[0][1]) <= 1e-9 * big), () => `${what} step ${k + 1}: the sides differ ${JSON.stringify(st.sides)}`);
  });
  if (s) bindingsChecked += checkBinding(c, s, g.bind, what, gr, gi);
}
const closeDialog = async (page) => { await page.click('[data-derive-close]'); await page.waitForFunction(() => !document.querySelector('dialog[data-derive]').open); };
/** Reveals the steps in order: Next one at a time, Back, then Show all. */
async function reveal(page, what) {
  let g = await dialog(page);
  const n = Number(g.count.split(' of ')[1]);
  ok(g.shown === 1 && g.steps.length === 1 && g.active === 'next', `${what}: opens on step 1 with the focus on Next (${g.shown}, ${g.active})`);
  for (let k = 2; k <= Math.min(n, 3); k++) {
    await page.click('[data-derive-next]');
    g = await dialog(page);
    ok(g.shown === k && g.steps.length === k, `${what}: Next shows step ${k} (${g.steps.length})`);
  }
  if (n > 1) {
    await page.click('[data-derive-back]');
    g = await dialog(page);
    ok(g.steps.length === Math.min(n, 3) - 1, `${what}: Back hides the last step (${g.steps.length})`);
  }
  await page.click('[data-derive-all]');
  g = await dialog(page);
  ok(g.steps.length === n && g.count === `Step ${n} of ${n}`, `${what}: Show all shows ${n} (${g.steps.length}, ${g.count})`);
}

const opened = new Set(), fromTheory = new Set();
try {
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  for (const [name, q] of CIRCUITS) {
    const page = await open(desk, q);
    const c = await linked(page);
    const subjects = subjectsOf(c);
    for (const s of subjects) {
      await select(page, s);
      const ids = await page.$$eval('[data-math-eq]', (rows) => rows.map((r) => [r.dataset.mathEq, !!r.querySelector('[data-derive-open]')]));
      for (const [id, has] of ids) {
        ok(has === D.hasDerivation(id), `${name} ${subjectKey(s)} ${id}: Derive ${has ? 'shown' : 'not shown'}`);
        if (!has || opened.has(`${name}|${subjectKey(s)}|${id}`)) continue;
        opened.add(`${name}|${subjectKey(s)}|${id}`);
        await page.click(`[data-math-eq="${id}"] [data-derive-open]`);
        await page.waitForFunction(() => document.querySelector('dialog[data-derive]')?.open);
        if (opened.size <= 4) await reveal(page, `${name} ${subjectKey(s)} ${id}`);
        else await page.click('[data-derive-all]');
        await compareDialog(page, c, id, s, `${name} ${subjectKey(s)} ${id}`);
        await closeDialog(page);
        ok(await page.evaluate((i) => document.activeElement?.getAttribute('data-derive-open') === i, id), `${name} ${id}: the focus is back on Derive`);
      }
    }
    // The readout's point, from the keyboard on the chart.
    await page.click('[data-math-follow="point"]');
    await page.focus('[data-chart]');
    for (let k = 0; k < 4; k++) await page.keyboard.press('ArrowRight');
    await frame(page);
    const [gr, gi] = await page.$eval('[data-chart]', (b) => [b.smithChart.readX, b.smithChart.readY]);
    if (Number.isFinite(gr)) {
      for (const id of ['z-gamma', 'vswr', 'return-loss']) {
        await page.click(`[data-math-eq="${id}"] [data-derive-open]`);
        await page.waitForFunction(() => document.querySelector('dialog[data-derive]')?.open);
        await page.click('[data-derive-all]');
        await compareDialog(page, c, id, { t: 'point' }, `${name} point ${id}`, gr, gi);
        await closeDialog(page);
      }
    } else ok(false, `${name}: the arrow keys gave no readout point`);
    await page.click('[data-math-follow="selection"]');

    // The theory's links: every derivation, with the theory's numbers.
    await page.evaluate(() => document.querySelectorAll('[data-topic]').forEach((t) => { t.open = true; }));
    const links = await page.$$eval('[data-theory] [data-derive-open]', (ls) => ls.map((l) => l.dataset.deriveOpen));
    for (const id of D.DERIVATION_IDS) ok(links.includes(id), `${name}: the theory has a derive link for ${id}`);
    for (const id of [...new Set(links)]) {
      const link = page.locator(`[data-theory] [data-derive-open="${id}"]`).first();
      await link.click();
      await page.waitForFunction(() => document.querySelector('dialog[data-derive]')?.open);
      await page.click('[data-derive-all]');
      await compareDialog(page, c, id, D.theorySubject(c, id), `${name} theory ${id}`);
      fromTheory.add(id);
      await closeDialog(page);
      ok(await page.evaluate((i) => document.activeElement?.getAttribute('data-derive-open') === i, id), `${name} theory ${id}: the focus is back on its link`);
    }
    ok(page.errors.length === 0, () => `${name}: no errors (${page.errors.join(' | ')})`);
    await page.close();
  }
  ok(fromTheory.size === D.DERIVATION_IDS.length, `every derivation opened from the theory (${fromTheory.size})`);

  // ---------- the keyboard alone ----------
  {
    const page = await open(desk, TEN);
    await select(page, { t: 'part', i: 2 });
    await page.focus('[data-math-eq="line-zin"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('dialog[data-derive]')?.open);
    let g = await dialog(page);
    ok(g.id === 'line-zin' && g.active === 'next', `keys: Enter on the row opens line-zin with the focus on Next (${g.id}, ${g.active})`);
    await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    g = await dialog(page);
    ok(g.steps.length === 3, `keys: Enter on Next twice shows three steps (${g.steps.length})`);
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter');
    g = await dialog(page);
    ok(g.steps.length === 2, `keys: Shift+Tab, Enter on Back shows two (${g.steps.length})`);
    // A line wider than the dialog scrolls sideways and takes a Tab stop of its own on the way.
    let back = 0;
    do { await page.keyboard.press('Shift+Tab'); back++; } while (back < 6 && !(await page.evaluate(() => document.activeElement?.hasAttribute('data-derive-step'))));
    ok(await page.evaluate(() => document.activeElement?.getAttribute('data-derive-step') === '1'), `keys: Shift+Tab from Back reaches the last step (${back} presses)`);
    await page.keyboard.press('ArrowRight');
    const lit = await page.evaluate(() => [...document.querySelectorAll('#tool [data-lit]')].filter((e) => !e.closest('dialog')).length);
    ok(lit > 0, `keys: → in a step lights its first variable's place on the page (${lit})`);
    await page.keyboard.press('Escape');
    ok(await page.evaluate(() => document.querySelector('dialog[data-derive]').open), 'keys: the first Escape ends the stepping and keeps the dialog');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog[data-derive]').open);
    ok(await page.evaluate(() => document.activeElement?.getAttribute('data-math-eq') === 'line-zin'), 'keys: Escape closes it and the focus is back on the row');
    ok(await page.evaluate(() => document.querySelectorAll('#tool [data-lit]').length === 0), 'keys: nothing stays lit');
    ok(page.errors.length === 0, () => `keys: no errors (${page.errors.join(' | ')})`);
    await page.close();
  }
  await desk.close();

  // ---------- phones: taps ----------
  for (const width of [320, 390]) {
    const phone = await browser.newContext({ viewport: { width, height: 760 }, colorScheme: 'dark', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await open(phone, TEN);
    await page.tap(`[data-tile="0"]`);
    await page.waitForFunction(() => document.querySelector('[data-math]').dataset.mathSubject === 'part:0');
    await page.evaluate(() => { document.querySelector('[data-math] details').open = true; });
    await page.locator('[data-math-eq="series-adds-z"] [data-derive-open]').tap();
    await page.waitForFunction(() => document.querySelector('dialog[data-derive]')?.open);
    await page.tap('[data-derive-next]');
    await page.tap('[data-derive-all]');
    const g = await dialog(page);
    ok(g.steps.length === 3, `${width} px: taps reveal every step (${g.steps.length})`);
    const box = await page.$eval('dialog[data-derive]', (d) => { const r = d.getBoundingClientRect(); return [r.left, r.right, document.documentElement.clientWidth]; });
    ok(box[0] >= 0 && box[1] <= box[2] + 0.5, `${width} px: the dialog fits the screen (${box})`);
    ok(g.scroll <= 0 && g.body <= 0, `${width} px: the dialog does not scroll sideways (${g.scroll}, ${g.body})`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width} px: no horizontal scroll`);
    const v = page.locator('dialog [data-derive-step="2"] [data-mt~="p0"]').first();
    if (await v.count()) {
      await v.tap();
      ok(await page.evaluate(() => !!document.querySelector('[data-tile="0"][data-lit], [data-card="0"][data-lit]')), `${width} px: a tapped variable lights its part`);
    } else ok(false, `${width} px: step 3 has a variable of part 1`);
    if (shots && width === 390) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: join(shots, 'derive-390-dark.png'), scale: 'css' }); }
    await page.tap('[data-derive-close]');
    await page.waitForFunction(() => !document.querySelector('dialog[data-derive]').open);

    // Every derivation, all steps shown (notes-M5.3.md, Fixes): no equation line overflows its box unless that line
    // scrolls sideways itself and has a Tab stop; the reasons' maths fit their text; no KaTeX error is shown.
    await page.evaluate(() => document.querySelectorAll('[data-topic]').forEach((t) => { t.open = true; }));
    // The same for the Equations panel and the theory: an equation wider than its box is in a box that scrolls
    // sideways with a Tab stop, never clipped (wide.ts), for a line, a lumped part and two nodes.
    for (const sel of ['[data-tile="2"]', '[data-tile="7"]', '[data-node-row="0"]', '[data-node-row="11"]']) {
      await page.evaluate((s) => { document.querySelector(s).click(); document.querySelector('[data-math] details').open = true; }, sel);
      await frame(page);
      const r = await page.evaluate(() => {
        const bad = [];
        let n = 0, wide = 0;
        for (const m of document.querySelectorAll('[data-math] math, [data-theory] math')) {
          const mr = m.getBoundingClientRect();
          if (!mr.width) continue;
          n++;
          let a = m.parentElement;
          while (a !== document.body && getComputedStyle(a).overflowX === 'visible') a = a.parentElement;
          const ar = a.getBoundingClientRect(), ox = getComputedStyle(a).overflowX;
          if (mr.right <= ar.right + 0.5 && mr.left >= ar.left - 0.5) continue;
          const where = m.closest('[data-math-eq]')?.dataset.mathEq ?? m.closest('[data-eq]')?.dataset.eq ?? '?';
          if (ox !== 'auto' && ox !== 'scroll') bad.push(`clipped: ${where} (${ox})`);
          else if (a.tabIndex !== 0) bad.push(`scrolls without a Tab stop: ${where}`);
          else wide++;
        }
        return { n, wide, bad: [...new Set(bad)] };
      });
      ok(r.bad.length === 0 && r.n > 100, () => `${width} px ${sel}: panel and theory ${r.bad.slice(0, 4).join(' | ')} (${r.n} equations)`);
      if (sel.endsWith('"0"]')) console.log(`panel and theory at ${width} px: ${r.n} equations shown, ${r.wide} in a box that scrolls sideways`);
    }
    let lineCount = 0, wideCount = 0;
    for (const id of D.DERIVATION_IDS) {
      await page.evaluate((i) => document.querySelector(`[data-theory] [data-derive-open="${i}"]`).click(), id);
      await page.waitForFunction(() => document.querySelector('dialog[data-derive]')?.open);
      await page.waitForSelector('[data-derive-all]');
      await page.evaluate(() => document.querySelector('[data-derive-all]').click());
      const n = EQ.EQUATION_BY_ID.get(id).steps.length;
      await page.waitForFunction((k) => document.querySelectorAll('dialog [data-derive-step]').length === k, n);
      await frame(page);
      const r = await page.evaluate(() => {
        const d = document.querySelector('dialog[data-derive]'), body = d.querySelector('[data-derive-body]');
        const cs = getComputedStyle(body), b = body.getBoundingClientRect();
        const left = b.left + parseFloat(cs.paddingLeft) - 0.5, right = b.right - parseFloat(cs.paddingRight) + 0.5;
        const bad = [];
        let lines = 0, wide = 0;
        for (const el of d.querySelectorAll('[data-derive-line]')) {
          lines++;
          const e = el.getBoundingClientRect(), what = el.querySelector('annotation')?.textContent.slice(0, 60);
          if (e.left < left || e.right > right) bad.push(`line box outside the body: ${what}`);
          if (el.scrollWidth > el.clientWidth + 1) {
            wide++;
            if (el.tabIndex !== 0 || getComputedStyle(el).overflowX !== 'auto') bad.push(`wide line without a focusable scroll: ${what}`);
            el.scrollLeft = 1e6;
            if (!(el.scrollLeft > 0)) bad.push(`wide line does not scroll: ${what}`);
            el.scrollLeft = 0;
          } else if (el.hasAttribute('tabindex')) bad.push(`a line that fits has a Tab stop: ${what}`);
          // What a line holds stays inside it (scrolled into view where it is wide).
          const m = el.querySelector('math')?.getBoundingClientRect();
          if (m && el.scrollWidth <= el.clientWidth + 1 && (m.left < e.left - 0.5 || m.right > e.right + 0.5)) bad.push(`maths outside its line: ${what}`);
        }
        for (const p of d.querySelectorAll('[data-derive-why]')) {
          const pr = p.getBoundingClientRect();
          if (pr.left < left || pr.right > right) bad.push(`reason box outside the body: ${p.textContent.slice(0, 40)}`);
          for (const m of p.querySelectorAll('math')) {
            const mr = m.getBoundingClientRect();
            if (mr.left < pr.left - 0.5 || mr.right > pr.right + 0.5) bad.push(`reason maths overflow: ${m.querySelector('annotation')?.textContent}`);
          }
        }
        for (const el of d.querySelectorAll('[data-derive-goal], [data-derive-step]')) {
          const e = el.getBoundingClientRect();
          if (e.right > right + 16) bad.push(`box outside the dialog: ${el.tagName}`);
        }
        if (d.querySelector('merror, .katex-error')) bad.push('a KaTeX error is shown');
        if (body.scrollWidth > body.clientWidth || d.scrollWidth > d.clientWidth) bad.push(`the dialog scrolls sideways (${body.scrollWidth - body.clientWidth})`);
        return { lines, wide, bad };
      });
      lineCount += r.lines; wideCount += r.wide;
      ok(r.bad.length === 0 && r.lines > 0, () => `${width} px ${id}: ${r.bad.slice(0, 4).join(' | ')} (${r.lines} lines)`);
      if (shots && width === 390 && id === 'circle-r') {
        await page.evaluate(() => document.querySelector('dialog [data-derive-step="6"]').scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: join(shots, 'derive-390-circle-r.png'), scale: 'css' });
      }
      await page.evaluate(() => document.querySelector('dialog[data-derive]').close());
      // Closed and emptied (the close event, which empties it, comes after the dialog is shut).
      await page.waitForFunction(() => !document.querySelector('dialog[data-derive]').open && !document.querySelector('[data-derive-close]'));
    }
    console.log(`derivations at ${width} px: ${lineCount} equation lines in ${D.DERIVATION_IDS.length} dialogs, ${wideCount} scroll sideways on their own`);
    ok(page.errors.length === 0, () => `${width} px: no errors (${page.errors.join(' | ')})`);
    await phone.close();
  }
} catch (e) {
  ok(false, `crashed: ${e.stack}`);
}
await browser.close();
stopServer();
console.log(`derivations: ${D.DERIVATION_IDS.length} in the registry, ${D.DERIVATION_IDS.reduce((a, id) => a + EQ.EQUATION_BY_ID.get(id).steps.length, 0)} steps; ${rendered} TeX strings and ${reasonMath} pieces of reasons rendered; ${opened.size} opened from the panel, ${fromTheory.size} from the theory; ${stepsChecked} steps compared, ${numbered} with numbers, ${bindingsChecked} values against the engine`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`ui-derive: ${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
