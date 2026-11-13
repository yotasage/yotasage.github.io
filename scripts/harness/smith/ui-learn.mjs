// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the Learn section and the guide (step M6.3a,
// components/Smith/Learn.tsx, lib/smith/examples.ts):
// - three examples played through by keyboard alone (E1, E6, E12) and three by touch emulation (E5, E9, E15 at 390 and
//   320 px): loading by Enter or a tap, every step "done" after its action and not before, Next to the following step;
//   values typed where typing is the step's action (each step's `reach` link), real drags of the chart's handles
//   (CDP touch events along the part's locus) where the step is a drag, typed answers checked against the stated value;
// - loading is one undo step (Ctrl+Z brings the circuit before back, Ctrl+Y the example), the guide stays;
// - the guide's figure equals the engine's (network.ts, evaluated here) at every step;
// - a wrong answer is refused, the hint shows the step's hint, "→ theory" opens the step's topic and the way back
//   returns the focus to the link;
// - 320 and 390 px: no sideways scroll with the guide open or the Learn section in view.
//   tsx ui-learn.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedExamples from '../../../lib/smith/examples.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedGeometry from '../../../lib/smith/geometry.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedSeries from '../../../lib/resistor/eseries.ts';

const S = importedState.default ?? importedState;
const X = importedExamples.default ?? importedExamples;
const N = importedNetwork.default ?? importedNetwork;
const G = importedGeometry.default ?? importedGeometry;
const P = importedParts.default ?? importedParts;
const E = importedSeries.default ?? importedSeries;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.env.SMITH_SHOTS || (process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null);
const base = process.argv[3] ?? 'http://localhost:3020';
if (shots) mkdirSync(shots, { recursive: true });

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
const ok = (condition, what) => { if (condition) passed++; else { if (failed < 60) failures.push(typeof what === 'function' ? what() : what); failed++; } };
const close = (a, b, tol = 1e-9) => a === b || Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(context) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-handle="0"]', { state: 'attached' });
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
  return page;
}
const linked = async (page) => S.decodeCircuit(new URL(page.url()).search).circuit;
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const guideState = (page) => page.evaluate(() => {
  const g = document.querySelector('[data-guide]');
  if (!g) return null;
  const f = g.querySelector('[data-guide-figure]');
  return {
    id: g.getAttribute('data-guide'), step: Number(g.getAttribute('data-step')), done: g.hasAttribute('data-done'),
    state: g.querySelector('[data-guide-state]').textContent,
    next: g.querySelector('[data-guide-next], [data-guide-next-example]')?.disabled ?? null,
    figure: f ? { of: f.getAttribute('data-guide-figure'), raw: Number(f.getAttribute('data-raw')), im: Number(f.getAttribute('data-raw-im')) } : null,
  };
});

// ---------- the engine's side, independent of guideFigure ----------

const DEG = 180 / Math.PI;
const METRIC = { mag: N.M_MAG, angle: N.M_ANGLE, vswr: N.M_VSWR, rl: N.M_RL, r: N.M_ZR, x: N.M_ZI, g: N.M_YR, b: N.M_YI, R: N.M_ZR, Q: N.M_Q };
function engine(c) {
  const n = c.parts.length, parts = P.packParts(c.parts);
  const nodes = new Float64Array((n + 1) * N.NODE_STRIDE);
  N.evaluate(nodes, parts, n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
  return { n, nodes, parts };
}
function metricsAt(c, node) {
  const e = engine(c), k = node === 'in' ? e.n : node, m = new Float64Array(N.METRIC_STRIDE);
  if (k > e.n) return null;
  N.nodeMetrics(m, 0, e.nodes, k);
  return m;
}
/** What the guide's figure must show for a step: the engine's number at the step's node, or null for none. */
function expected(step, c, done) {
  for (const group of step.done) for (const ch of group) {
    if (ch.k === 'answer' && done) {
      const m = metricsAt(c, ch.node);
      if (!m) return null;
      const v = m[METRIC[ch.quantity]];
      return { of: 'answer', raw: ch.quantity === 'angle' ? v * DEG : ch.quantity === 'R' ? v * c.z0 : v };
    }
    if (ch.k === 'circle') { const m = metricsAt(c, ch.node); return m && { of: 'circle', raw: m[METRIC[ch.kind]] }; }
    if (ch.k === 'near') {
      const m = metricsAt(c, ch.node);
      if (!m) return null;
      return ch.r === 1 && ch.x === 0 ? { of: 'centre', raw: m[N.M_MAG] } : { of: 'near', raw: m[N.M_ZR], im: m[N.M_ZI] };
    }
  }
  return null;
}
async function checkFigure(page, step, what) {
  const g = await guideState(page), c = await linked(page), want = expected(step, c, g.done);
  if (!want) { ok(g.figure === null, `${what}: no figure (${JSON.stringify(g.figure)})`); return; }
  ok(g.figure && g.figure.of === want.of && close(g.figure.raw, want.raw, 1e-12) && (want.im === undefined || close(g.figure.im, want.im, 1e-12)),
    () => `${what}: the figure ${JSON.stringify(g.figure)} equals the engine's ${JSON.stringify(want)}`);
  counts.figures++;
}

// ---------- acting on the page ----------

const valueForm = (kind) => {
  const v = (kind === P.SERIES_L || kind === P.SHUNT_L) ? 'L' : (kind === P.SERIES_C || kind === P.SHUNT_C) ? 'C' : (kind === P.SERIES_R || kind === P.SHUNT_R) ? 'R' : null;
  return v ?? (kind === P.QUARTER ? 'zt' : 'len');
};
const valueText = (kind, v) => {
  const f = valueForm(kind);
  return f === 'L' ? `${v * 1e9}n` : f === 'C' ? `${v * 1e12}p` : String(v);
};
const sameValue = (a, b) => Math.abs(a / b - 1) < 1e-12;

async function act(page, how, sel) {
  if (how === 'key') { await page.focus(sel); await page.keyboard.press('Enter'); } else await page.tap(sel);
  await frame(page);
}
async function type(page, how, sel, text) {
  if (how === 'key') {
    await page.focus(sel);
    await page.keyboard.press('Control+A');
    await page.keyboard.type(text);
    await page.keyboard.press('Tab');
  } else {
    await page.tap(sel);
    await page.fill(sel, text);
  }
  await frame(page);
}
async function selectPart(page, how, i) {
  if (how === 'key') { await page.focus(`[data-tile="${i}"]`); await page.keyboard.press('Enter'); } else await page.tap(`[data-tile="${i}"]`);
  await frame(page);
}
const viewState = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-chart]'), v = box.smithChart, r = box.getBoundingClientRect();
  return { cx: v.cx, cy: v.cy, k: v.k, w: v.w, h: v.h, left: r.left + box.clientLeft, top: r.top + box.clientTop };
});
const client = (vs, [gr, gi]) => [vs.left + vs.w / 2 + (gr - vs.cx) * vs.k, vs.top + vs.h / 2 - (gi - vs.cy) * vs.k];
async function setSnap(page, on) {
  if ((await page.getAttribute('[data-snap-toggle]', 'aria-pressed') === 'true') !== on) await page.tap('[data-snap-toggle]');
  await frame(page);
}
/** A real touch drag of part i's handle from its value to `to`, along the part's locus (CDP touch events). */
async function touchDrag(page, cdp, i, to) {
  const c = await linked(page), from = c.parts[i].value, kind = c.parts[i].kind;
  await setSnap(page, valueForm(kind) !== 'len' && E.series('E24').mantissas.some((m) => [-13, -12, -11, -10, -9, -8].some((d) => sameValue(E.standardValue(m, d), to))));
  await page.evaluate(() => document.querySelector('[data-chart]').scrollIntoView({ block: 'start' }));
  await frame(page);
  const e = engine(c), loc = new Float64Array(G.LOCUS_STRIDE), o = new Float64Array(2);
  G.nodeLocus(loc, 0, e.nodes, e.parts, i, c.z0, c.f0, c.f0);
  const vs = await viewState(page);
  const at = (v) => { G.locusPoint(o, 0, loc, 0, v); return client(vs, [o[0], o[1]]); };
  const h = await page.evaluate((k) => { const b = document.querySelector(`[data-handle="${k}"]`).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, i);
  const start = at(from), dx = h[0] - start[0], dy = h[1] - start[1];
  const geo = valueForm(kind) !== 'len';
  const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p[0], y: p[1], id: 0 }] : [] });
  await touch('touchStart', h);
  const n = 24;
  for (let j = 1; j <= n; j++) {
    const v = geo ? from * (to / from) ** (j / n) : from + ((to - from) * j) / n;
    const p = at(v);
    await sleep(16);
    await touch('touchMove', [p[0] + dx, p[1] + dy]);
  }
  await sleep(16);
  await frame(page);
  await touch('touchEnd', null);
  await sleep(60);
  await frame(page); await frame(page);
  counts.drags++;
}

/** Changes the page's circuit into the step's reach circuit: by keyboard (typed values) or by touch (taps and drags). */
async function reach(page, how, cdp, link) {
  const T = S.decodeCircuit(link).circuit;
  let c = await linked(page);
  if (c.loadR !== T.loadR) await type(page, how, '[data-name="loadR"] input', String(T.loadR));
  if (c.loadX !== T.loadX) await type(page, how, '[data-name="loadX"] input', String(T.loadX));
  c = await linked(page);
  let m = 0;
  while (m < c.parts.length && m < T.parts.length && c.parts[m].kind === T.parts[m].kind) m++;
  for (let i = c.parts.length - 1; i >= m; i--) {
    if (how === 'key') { await page.focus(`[data-tile="${i}"]`); await page.keyboard.press('Delete'); } else { await selectPart(page, how, i); await page.tap('[data-remove]'); }
    await frame(page);
  }
  for (let j = m; j < T.parts.length; j++) {
    await page.selectOption('[data-add-kind]', String(T.parts[j].kind));
    await page.selectOption('[data-add-at]', '-1');
    await act(page, how, '[data-add]');
  }
  c = await linked(page);
  for (let j = 0; j < T.parts.length; j++) {
    const p = c.parts[j], t = T.parts[j];
    if (t.zc !== undefined && p.zc !== t.zc) { await selectPart(page, how, j); await type(page, how, `[data-name="p${j + 1}-zc"] input`, String(t.zc)); }
    if (sameValue(p.value, t.value)) continue;
    if (how === 'key') {
      await selectPart(page, how, j);
      await type(page, how, `[data-name="p${j + 1}-${valueForm(t.kind)}"] input`, valueText(t.kind, t.value));
      counts.typed++;
    } else await touchDrag(page, cdp, j, t.value);
  }
}

/** Plays an example through, step by step; `how` is 'key' or 'touch'. */
async function play(page, how, id, cdp = null) {
  const ex = X.exampleById(id);
  if (how === 'key') { await page.focus(`[data-example="${id}"]`); await page.keyboard.press('Enter'); } else {
    await page.locator(`[data-example="${id}"]`).scrollIntoViewIfNeeded();
    await page.tap(`[data-example="${id}"]`);
  }
  await frame(page);
  let g = await guideState(page);
  ok(g && g.id === id && g.step === 0, () => `${id}: the guide opens at step 1 (${JSON.stringify(g)})`);
  ok(S.sameCircuit(await linked(page), S.decodeCircuit(ex.link).circuit), `${id}: the example's circuit is loaded`);
  ok(await page.evaluate(() => document.activeElement?.id === 'smith-guide'), `${id}: the focus is on the guide's heading`);
  // A smooth scroll may still run: up to a second.
  const seen = await page.waitForFunction(() => { const r = document.querySelector('[data-guide]').getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight - 100; }, null, { timeout: 1500 }).then(() => true, () => false);
  const box = await page.evaluate(() => [document.querySelector('[data-guide]').getBoundingClientRect().top, window.scrollY, window.innerHeight]);
  ok(seen, `${id}: the guide is in view (top, scroll, height ${box})`);
  for (let i = 0; i < ex.steps.length; i++) {
    const s = ex.steps[i], ans = X.answerCheck(s), what = `${id} step ${i + 1} (${how})`;
    g = await guideState(page);
    ok(g.step === i, `${what}: the guide is at it (${g.step})`);
    const acts = !!s.reach || !!ans || s.done.some((gr) => gr.some((ch) => ch.k === 'grid'));
    if (acts) {
      ok(!g.done && g.next === true, () => `${what}: not done before its action, Next disabled (${JSON.stringify(g)})`);
      await checkFigure(page, s, `${what} before`);
    }
    if (s.done.some((gr) => gr.some((ch) => ch.k === 'grid'))) {
      if (how === 'key') { await page.focus('input[name="smith-mode"][value="Z"]'); await page.keyboard.press('ArrowRight'); } else await page.tap('label:has(input[name="smith-mode"][value="Y"])');
      await frame(page);
    }
    if (s.reach) await reach(page, how, cdp, s.reach);
    if (ans) {
      const give = async (text) => {
        if (how === 'key') {
          await page.focus('#smith-guide-answer');
          await page.keyboard.press('Control+A');
          await page.keyboard.type(text);
          await page.keyboard.press('Enter');
        } else {
          await page.tap('#smith-guide-answer');
          await page.fill('#smith-guide-answer', text);
          await page.tap('[data-guide-check]');
        }
        await frame(page);
      };
      // Once wrong (E1 by keyboard): refused, not done.
      if (id === 'reading-a-match' && i === 0) {
        await give('0.3');
        g = await guideState(page);
        ok(!g.done && /Not within/.test(g.state), () => `${what}: a wrong answer is refused (${g.state})`);
      }
      await give(how === 'key' ? String(ans.value).replace('-', '−') : String(ans.value));
      await frame(page);
      counts.answers++;
    }
    g = await guideState(page);
    const now = S.encodeCircuit(await linked(page));
    ok(g.done && /Done/.test(g.state), () => `${what}: done (${JSON.stringify(g)}; circuit ${now})`);
    await checkFigure(page, s, what);
    counts.steps++;
    if (i < ex.steps.length - 1) {
      ok(g.next === false, `${what}: Next enabled`);
      await act(page, how, '[data-guide-next]');
      if (how === 'key') ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-guide-do')), `${what}: Next puts the focus on the next step`);
    }
  }
  ok(/finished/.test((await guideState(page)).state), `${id}: finished`);
  counts.examples[how]++;
}

const counts = { steps: 0, figures: 0, drags: 0, typed: 0, answers: 0, examples: { key: 0, touch: 0 } };

try {
  // ---------- by keyboard, 1440 px: E1 (with undo, hint, theory and back), E6, E12 ----------
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
    const page = await open(context);
    ok(await page.$$eval('[data-example]', (b) => b.map((e) => e.getAttribute('data-example')).join()) === X.EXAMPLES.map((e) => e.id).join(),
      'the Learn section lists the examples in their order');
    ok(await page.$eval('nav a[href="#learn"]', (a) => a.textContent) === 'Learn', 'the nav has Learn');
    const before = await linked(page);
    await page.focus('[data-example="reading-a-match"]');
    await page.keyboard.press('Enter');
    await frame(page);
    const E1 = S.decodeCircuit(X.EXAMPLES[0].link).circuit;
    ok(S.sameCircuit(await linked(page), E1), 'Enter on an example loads it');
    await page.keyboard.press('Control+Z');
    await frame(page);
    ok(S.sameCircuit(await linked(page), before), 'one Undo brings the circuit before back');
    ok((await guideState(page))?.id === 'reading-a-match', 'the guide stays open after Undo');
    await page.keyboard.press('Control+Y');
    await frame(page);
    ok(S.sameCircuit(await linked(page), E1), 'Redo brings the example back');
    await page.keyboard.press('Control+Z');
    await frame(page);
    // The hint, "→ theory" and the way back, by keyboard.
    await page.focus('[data-example="reading-a-match"]');
    await page.keyboard.press('Enter');
    await frame(page);
    await page.focus('[data-guide-hint]');
    await page.keyboard.press('Enter');
    await frame(page);
    ok(await page.$eval('[data-guide-hint-text]', (e) => e.textContent).catch(() => '') === X.EXAMPLES[0].steps[0].hint, 'Hint shows the step\'s hint');
    await page.focus('[data-guide-theory]');
    await page.keyboard.press('Enter');
    await frame(page);
    const t = await page.evaluate(() => ({ hash: location.hash, back: document.querySelector('[data-back-to-tool]')?.closest('[data-topic]')?.id }));
    ok(t.hash === `#${X.EXAMPLES[0].steps[0].topic}` && t.back === X.EXAMPLES[0].steps[0].topic, () => `→ theory opens the step's topic (${JSON.stringify(t)})`);
    await page.focus('[data-back-to-tool]');
    await page.keyboard.press('Enter');
    await frame(page);
    ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-guide-theory')), 'back returns the focus to the guide\'s theory link');
    await page.keyboard.press('Control+Z');
    await frame(page);
    for (const id of ['reading-a-match', 'l-match-up', 'open-stub']) await play(page, 'key', id);
    if (shots) await page.screenshot({ path: join(shots, 'learn-1440-light.png'), clip: { x: 440, y: 0, width: 1000, height: 900 } });
    ok(page.errors.length === 0, `keyboard: no page errors: ${page.errors.join(' | ')}`);
    await context.close();
  }

  // ---------- by touch at 390 (dark) and 320 px: E5, E9, E15 ----------
  for (const [width, scheme, id] of [[390, 'dark', 'one-shunt-part'], [320, 'light', 'line-turns'], [390, 'light', 'e24-values']]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    const page = await open(context);
    const cdp = await context.newCDPSession(page);
    await page.locator('[data-examples]').scrollIntoViewIfNeeded();
    ok(await noScroll(page), `${width} px: the Learn section does not scroll sideways`);
    const nav = await page.$eval('nav[aria-label="Sections"]', (n) => [n.scrollWidth, n.clientWidth]);
    ok(nav[0] <= nav[1], `${width} px: the nav shows its four sections (${nav})`);
    await play(page, 'touch', id, cdp);
    ok(await noScroll(page), `${width} px: no sideways scroll with the guide open`);
    const fit = await page.evaluate(() => {
      const g = document.querySelector('[data-guide]').getBoundingClientRect();
      return g.left >= 0 && g.right <= document.documentElement.clientWidth;
    });
    ok(fit, `${width} px: the guide fits the screen`);
    const small = await page.$$eval('[data-guide] button:not([data-why])', (bs) => bs.filter((b) => { const r = b.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).length);
    ok(small === 0, `${width} px: the guide's buttons are 44 px targets (${small} smaller)`);
    if (shots && width === 390 && scheme === 'dark') {
      await page.evaluate(() => document.querySelector('[data-chart]').scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: join(shots, 'learn-390-dark.png'), scale: 'css' });
    }
    ok(page.errors.length === 0, `${width} px: no page errors: ${page.errors.join(' | ')}`);
    await context.close();
  }
} catch (e) {
  ok(false, `stopped: ${e.stack ?? e}`);
} finally {
  await browser.close();
  stopServer();
}

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`ui-learn: ${counts.examples.key} examples by keyboard, ${counts.examples.touch} by touch, ${counts.steps} steps done, ${counts.typed} values typed, ${counts.drags} drags, ${counts.answers} answers, ${counts.figures} figures`);
console.log(`ui-learn: ${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
