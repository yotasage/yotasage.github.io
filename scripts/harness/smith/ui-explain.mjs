// Drives /smith-chart/main in the installed Edge (or Chrome) and checks "Explain this move" (step M5.4,
// components/Smith/Explain.tsx, lib/smith/explain.ts):
// - after a drag of a handle (none while dragging) and after a typed value, the part card shows the move with the
//   engine's numbers (old and new value, the nodes' z and |Γ|, the change, the sense of explainMove), and the marker
//   runs along the move on the chart;
// - "Explain" shows the part's arc: its numbers equal explainPart's, its equations are the registry's (explainPart's
//   ids), Derive opens the derivation, the theory link points at the topic;
// - with prefers-reduced-motion no marker ever runs and there is no "Trace" control;
// - the keyboard alone: a handle's arrow key makes a move, Tab reaches Explain, Enter opens it, Derive by Enter, Escape;
// - taps at 320 and 390 px (dark): the explanation fits the card, the page does not scroll sideways.
//   tsx ui-explain.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedExplain from '../../../lib/smith/explain.ts';
import * as importedEquations from '../../../lib/smith/equations.ts';

const S = importedState.default ?? importedState;
const X = importedExplain.default ?? importedExplain;
const EQ = importedEquations.default ?? importedEquations;
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
const ok = (condition, what) => { if (condition) passed++; else { if (failed < 60) failures.push(typeof what === 'function' ? what() : what); failed++; } };
const close = (a, b, tol = 1e-9) => a === b || Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const SENSE = (s) => (s === X.CW ? 'clockwise' : s === X.CCW ? 'counter-clockwise' : 'along the real axis');
const MOVE_GAP = 1700; // over MOVE_MS (Strip.tsx), so the next change is a move of its own

async function open(context, query = '') {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-handle="0"]', { state: 'attached' });
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  return page;
}
const linked = async (page) => S.decodeCircuit(new URL(page.url()).search).circuit;
const raws = (page, sel) => page.$$eval(`${sel} [data-ex]`, (els) => els.map((e) => [e.getAttribute('data-ex'), e.getAttribute('data-raw')]));

// Records whether the trace marker shows from now on.
const watchTrace = (page) => page.evaluate(() => {
  const box = document.querySelector('[data-layer="path-marks"]');
  window.__traced = false;
  new MutationObserver(() => { if (box.hasAttribute('data-tracing')) window.__traced = true; }).observe(box, { attributes: true, subtree: true });
});

async function drag(page, i, dx, dy, during) {
  const r = await page.evaluate((k) => { const b = document.querySelector(`[data-handle="${k}"]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, i);
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  for (let s = 1; s <= 8; s++) await page.mouse.move(r.x + (dx * s) / 8, r.y + (dy * s) / 8);
  if (during) await during();
  await page.mouse.up();
}

// The move shown against explainMove on the linked circuit.
async function checkMove(page, i, old, what) {
  await page.waitForSelector('[data-explain-move]', { timeout: 5000 });
  const c = await linked(page);
  const m = X.explainMove(c, i, old);
  const got = Object.fromEntries(await raws(page, '[data-explain-move]'));
  const pair = (s) => s.split(',').map(Number);
  ok(Number(got.old) === old, `${what}: old value ${got.old}, wanted ${old}`);
  ok(Number(got.new) === c.parts[i].value, `${what}: new value ${got.new}, wanted ${c.parts[i].value}`);
  const [ozr, ozi] = pair(got['old-z']), [nzr, nzi] = pair(got['new-z']);
  ok(close(ozr, m.before.end.zr) && close(ozi, m.before.end.zi), `${what}: z before ${got['old-z']} vs ${m.before.end.zr}, ${m.before.end.zi}`);
  ok(close(nzr, m.after.end.zr) && close(nzi, m.after.end.zi), `${what}: z after ${got['new-z']} vs ${m.after.end.zr}, ${m.after.end.zi}`);
  ok(close(Number(got['old-mag']), m.before.end.mag) && close(Number(got['new-mag']), m.after.end.mag), `${what}: |Γ| ${got['old-mag']} → ${got['new-mag']}`);
  if (got.delta !== undefined) ok(close(Number(got.delta), Math.abs(m.delta)), `${what}: change ${got.delta} vs ${m.delta}`);
  const sense = await page.getAttribute('[data-explain-move]', 'data-sense');
  ok(sense === SENSE(m.sense), `${what}: sense ${sense}, explainMove ${SENSE(m.sense)}`);
  return m;
}

const counts = { moves: 0, arcs: 0, eqs: 0 };

try {
  // ---------- 1440 px, motion allowed: a drag, a typed value, the arc ----------
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await open(context);
    await page.click('[data-tile="0"]');
    const before = (await linked(page)).parts[0].value;
    await watchTrace(page);
    let during = -1, tracingDuring = true;
    await drag(page, 0, 60, 80, async () => {
      during = await page.$$eval('[data-explain-move]', (e) => e.length);
      tracingDuring = await page.evaluate(() => window.__traced);
    });
    ok(during === 0 && tracingDuring === false, `nothing is explained or traced during the drag (${during}, ${tracingDuring})`);
    await checkMove(page, 0, before, 'drag'); counts.moves++;
    await page.waitForFunction(() => window.__traced, null, { timeout: 3000 }).catch(() => {});
    ok(await page.evaluate(() => window.__traced), 'the marker runs along the move after the drag');
    // A typed value, after the run of the drag is over.
    await page.waitForTimeout(MOVE_GAP);
    const typedFrom = (await linked(page)).parts[0].value;
    await page.click('[data-name="p1-C"] input', { clickCount: 3 });
    await page.keyboard.type('47p');
    await page.waitForFunction(() => window.location.search.includes('47'), null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(200);
    await checkMove(page, 0, typedFrom, 'typed'); counts.moves++;
    ok((await linked(page)).parts[0].value === 47e-12, 'the typed value is in the circuit');
    // The arc on demand.
    await page.click('[data-explain-open]');
    await page.waitForSelector('[data-explain-arc]');
    for (const i of [0, 1]) {
      if (i === 1) { await page.click('[data-tile="1"]'); if (!(await page.$('[data-explain-arc]'))) await page.click('[data-explain-open]'); await page.waitForSelector('[data-explain-arc]'); }
      const c = await linked(page), e = X.explainPart(c, i);
      const got = Object.fromEntries(await raws(page, '[data-explain-arc]'));
      const pair = (s) => s.split(',').map(Number);
      const [szr, szi] = pair(got['start-z']), [ezr, ezi] = pair(got['end-z']);
      ok(close(szr, e.start.zr) && close(szi, e.start.zi) && close(ezr, e.end.zr) && close(ezi, e.end.zi), `part ${i + 1}: arc's z`);
      ok(close(Number(got.kept), e.kept) && close(Number(got.added), e.added), `part ${i + 1}: kept ${got.kept} and added ${got.added}`);
      ok(close(Number(got.cx), e.circle.cx) && close(Number(got.radius), e.circle.radius), `part ${i + 1}: circle ${got.cx}, ${got.radius}`);
      ok(close(Number(got.from), e.from) && close(Number(got.to), e.to), `part ${i + 1}: from ${got.from} to ${got.to}`);
      ok((await page.getAttribute('[data-explain-arc]', 'data-sense')) === SENSE(e.sense), `part ${i + 1}: sense`);
      const ids = await page.$$eval('[data-explain-eq]', (els) => els.map((x) => x.getAttribute('data-explain-eq')));
      ok(ids.length >= 4 && ids.every((id) => EQ.EQUATION_BY_ID.has(id)) && ids.join() === e.equations.join(), `part ${i + 1}: equations ${ids} vs ${e.equations}`);
      counts.eqs += ids.length;
      const errs = await page.$$eval('[data-explain-arc] .katex-error, [data-explain-arc] merror', (x) => x.length);
      ok(errs === 0, `part ${i + 1}: no TeX errors (${errs})`);
      ok((await page.getAttribute('[data-explain-topic]', 'href')) === `#${e.topic}`, `part ${i + 1}: the theory link`);
      await page.click('[data-explain-derive]');
      await page.waitForSelector('dialog[data-derive][open]');
      ok((await page.$eval('dialog[data-derive]', (d) => d.textContent)).includes(EQ.EQUATION_BY_ID.get(e.derivation).title), `part ${i + 1}: Derive opens ${e.derivation}`);
      await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog[data-derive]').open);
      counts.arcs++;
    }
    ok(await page.$('[data-explain-trace]') !== null, 'the arc has a Trace control when motion is allowed');
    // Hiding the move.
    await page.click('[data-tile="0"]');
    if (await page.$('[data-explain-close]')) {
      await page.click('[data-explain-close]');
      ok((await page.$('[data-explain-move]')) === null, 'Hide move hides the move');
    }
    if (shots) { mkdirSync(shots, { recursive: true }); await page.locator('[data-card]').screenshot({ path: join(shots, 'explain-1440.png') }); }
    ok(page.errors.length === 0, `no page errors: ${page.errors.join(' | ')}`);
    await context.close();
  }

  // ---------- reduced motion: no marker, no Trace control ----------
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await open(context);
    await page.click('[data-tile="1"]');
    const before = (await linked(page)).parts[1].value;
    await watchTrace(page);
    await drag(page, 1, 0, -80);
    await checkMove(page, 1, before, 'reduced motion'); counts.moves++;
    await page.waitForTimeout(1200);
    ok(!(await page.evaluate(() => window.__traced)), 'with reduced motion no marker runs');
    await page.click('[data-explain-open]');
    await page.waitForSelector('[data-explain-arc]');
    ok((await page.$('[data-explain-trace]')) === null, 'with reduced motion there is no Trace control');
    ok(page.errors.length === 0, `reduced motion: no page errors: ${page.errors.join(' | ')}`);
    await context.close();
  }

  // ---------- the keyboard alone ----------
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await open(context);
    const before = (await linked(page)).parts[1].value;
    await page.focus('[data-handle-key="1"]');
    await page.keyboard.press('ArrowUp');
    await checkMove(page, 1, before, 'keyboard'); counts.moves++;
    // From the card's value field, Tab reaches Explain.
    await page.focus('[data-name="p2-L"] input');
    let at = '';
    for (let t = 0; t < 12 && at !== 'open'; t++) {
      await page.keyboard.press('Tab');
      at = await page.evaluate(() => (document.activeElement?.hasAttribute('data-explain-open') ? 'open' : ''));
    }
    ok(at === 'open', 'Tab reaches Explain from the value field');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-explain-arc]');
    for (let t = 0; t < 40; t++) {
      if (await page.evaluate(() => document.activeElement?.hasAttribute('data-explain-derive'))) break;
      await page.keyboard.press('Tab');
    }
    ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-explain-derive')), 'Tab reaches Derive');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[data-derive][open]');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog[data-derive]').open);
    ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-explain-derive')), 'the focus comes back to Derive');
    ok(page.errors.length === 0, `keyboard: no page errors: ${page.errors.join(' | ')}`);
    await context.close();
  }

  // ---------- taps at 320 and 390 px, dark ----------
  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
    const page = await open(context);
    await page.tap('[data-tile="0"]');
    const before = (await linked(page)).parts[0].value;
    await page.tap('[data-name="p1-C"] input');
    await page.fill('[data-name="p1-C"] input', '22p');
    await checkMove(page, 0, before, `${width} px typed`); counts.moves++;
    await page.tap('[data-explain-open]');
    await page.waitForSelector('[data-explain-arc]');
    const fit = await page.evaluate(() => {
      const card = document.querySelector('[data-card]').getBoundingClientRect(), ex = document.querySelector('[data-explain]');
      let worst = 0;
      for (const el of ex.querySelectorAll('p, h4, li, [data-explain-move]')) { const r = el.getBoundingClientRect(); worst = Math.max(worst, r.right - card.right); }
      return { worst, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    ok(fit.worst <= 0.5 && fit.page <= 0, `${width} px: the explanation fits the card (${fit.worst}) and the page does not scroll sideways (${fit.page})`);
    if (shots && width === 390) await page.locator('[data-card]').screenshot({ path: join(shots, 'explain-390-dark.png') });
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
console.log(`ui-explain: ${counts.moves} moves, ${counts.arcs} arcs, ${counts.eqs} equations shown`);
console.log(`ui-explain: ${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
