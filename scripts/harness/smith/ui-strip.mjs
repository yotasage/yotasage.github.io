// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the circuit panel (step M3.1): the start state
// in the link; every part kind added, moved and removed by mouse, and again by keyboard alone (Tab, arrows, Enter,
// Alt+arrows, Delete); after every step the circuit read back from the link (lib/smith/state.ts) and the "circuit
// input" readout compared with the engine's value in the readout's own texts; typing a value updates the circuit
// and the readout while typing, an unreadable value is marked with its reason and leaves the circuit; a reload gives
// the same circuit and readout; no horizontal scroll at 320 and 390 px; screenshots at 390 dark and 1440 light.
//   tsx ui-strip.mjs [screenshot folder] [base URL]      (the third part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedReadout from '../../../components/Smith/readout.ts';

const S = importedState.default ?? importedState;
const R = importedReadout.default ?? importedReadout;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
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
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function open(context, query = '') {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main${query}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-circuit]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  return page;
}

// The circuit in the page's link, read by the library.
const linked = async (page) => S.decodeCircuit(new URL(page.url()).search).circuit;
const INPUT = { z: 0, Z: 1, gamma: 4, vswr: 6, rl: 7 };
// The readout of the circuit input against the engine's value for the circuit in the link.
async function checkReadout(page, what) {
  await frame(page);
  const c = await linked(page);
  const g = [0, 0], want = [];
  S.circuitInputGamma(g, 0, c);
  R.readoutTexts(g[0], g[1], c.z0, want);
  const shown = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-input]')].map((e) => [e.dataset.input, e.textContent])));
  let same = true;
  for (const [key, i] of Object.entries(INPUT)) if (shown[key] !== want[i]) same = false;
  ok(same, `${what}: readout ${JSON.stringify(shown)} is the engine's ${JSON.stringify(Object.fromEntries(Object.entries(INPUT).map(([k, i]) => [k, want[i]])))}`);
  return c;
}
const tileKinds = (page) => page.evaluate(() => [...document.querySelectorAll('[data-tile]')]
  .sort((a, b) => Number(a.dataset.tile) - Number(b.dataset.tile)).map((e) => e.dataset.kind));
const kindsOf = (c) => c.parts.map((p) => S.KIND_CODES[p.kind]);
// Waits (up to 3 s, frame by frame) until test(value) holds for what read gives; the last value either way. The page
// renders a step and moves the focus in its own frames: a fixed delay made the keyboard checks fail about 1 run in 4.
async function settle(page, read, test, ms = 3000) {
  const until = Date.now() + ms;
  let v = await read();
  while (!test(v) && Date.now() < until) { await frame(page); v = await read(); }
  return v;
}
async function checkStrip(page, wantKinds, what) {
  const want = JSON.stringify(wantKinds);
  await settle(page, async () => JSON.stringify(kindsOf(await linked(page))) + JSON.stringify(await tileKinds(page)), (v) => v === want + want);
  const c = await checkReadout(page, what);
  const k = kindsOf(c), t = await tileKinds(page);
  ok(JSON.stringify(k) === JSON.stringify(wantKinds), `${what}: link has ${k.join(' ')}, wanted ${wantKinds.join(' ')}`);
  ok(JSON.stringify(t) === JSON.stringify(wantKinds), `${what}: strip shows ${t.join(' ')}, wanted ${wantKinds.join(' ')}`);
}
const focused = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? { tile: a.dataset.tile ?? null, addKind: a.hasAttribute('data-add-kind'), what: `${a.tagName} ${a.className}`.slice(0, 60) } : {};
});
/** The focus once it holds test (or after 3 s). */
const focusedWhen = (page, test) => settle(page, () => focused(page), test);

try {
  // ---------- start state, mouse ----------
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  let page = await open(context);
  const start = await linked(page);
  ok(S.sameCircuit(start, S.defaultCircuit()), 'the page writes the start state D16 into the link');
  await checkStrip(page, ['cs', 'lp'], 'start');

  let kinds = ['cs', 'lp'];
  for (const kind of S.KIND_ORDER) {
    await page.selectOption('[data-add-kind]', String(kind));
    await page.click('[data-add]');
    kinds = [...kinds, S.KIND_CODES[kind]];
    await checkStrip(page, kinds, `mouse: add ${S.KIND_NAMES[kind]}`);
  }
  // Add at the load end and between parts.
  await page.selectOption('[data-add-kind]', String(S.KIND_ORDER[0]));
  await page.selectOption('[data-add-at]', '0');
  await page.click('[data-add]');
  kinds = ['ls', ...kinds];
  await checkStrip(page, kinds, 'mouse: add at the load end');
  await page.selectOption('[data-add-at]', '2');
  await page.click('[data-add]');
  kinds = [...kinds.slice(0, 2), 'ls', ...kinds.slice(2)];
  await checkStrip(page, kinds, 'mouse: add between 2 and 3');
  // Reorder every part one step towards the load and back, by the card's buttons.
  for (let i = 1; i < kinds.length; i++) {
    await page.click(`[data-tile="${i}"]`);
    await page.click('[data-move="load"]');
    const moved = kinds.slice(); [moved[i - 1], moved[i]] = [moved[i], moved[i - 1]];
    await checkStrip(page, moved, `mouse: move part ${i + 1} towards the load`);
    await page.click('[data-move="source"]');
    await checkStrip(page, kinds, `mouse: move it back towards the source`);
  }
  // Remove every part, from the middle out.
  while (kinds.length) {
    const i = Math.floor(kinds.length / 2);
    await page.click(`[data-tile="${i}"]`);
    await page.click('[data-remove]');
    kinds = kinds.filter((_, j) => j !== i);
    await checkStrip(page, kinds, `mouse: remove part ${i + 1}`);
  }
  ok((await page.$$('[data-tile]')).length === 0 && (await page.textContent('[data-strip]')).includes('no parts'), 'mouse: an empty strip says so');

  // ---------- keyboard alone ----------
  const tabTo = async (test, max = 40) => {
    for (let i = 0; i < max; i++) { if (test(await focused(page))) return true; await page.keyboard.press('Tab'); }
    return test(await focused(page));
  };
  await page.focus('[data-add-kind]');
  for (let j = 0; j < S.KIND_ORDER.length; j++) {
    const kind = S.KIND_ORDER[j];
    ok(await tabTo((f) => f.addKind), `keys: Tab reaches the kind list before adding ${S.KIND_NAMES[kind]}`);
    await page.keyboard.press('Home');
    for (let d = 0; d < j; d++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    kinds = [...kinds, S.KIND_CODES[kind]];
    await checkStrip(page, kinds, `keys: add ${S.KIND_NAMES[kind]}`);
    const n = kinds.length;
    ok((await focusedWhen(page, (f) => f.tile === String(n - 1))).tile === String(n - 1), `keys: the new ${S.KIND_NAMES[kind]} has the focus`);
    if (n > 1) {
      await page.keyboard.press('Alt+ArrowRight');
      const moved = kinds.slice(); [moved[n - 2], moved[n - 1]] = [moved[n - 1], moved[n - 2]];
      await checkStrip(page, moved, `keys: Alt+→ moves ${S.KIND_NAMES[kind]} towards the load`);
      ok((await focusedWhen(page, (f) => f.tile === String(n - 2))).tile === String(n - 2), `keys: the moved part keeps the focus (${JSON.stringify(await focused(page))})`);
      await page.keyboard.press('Alt+ArrowLeft');
      await checkStrip(page, kinds, `keys: Alt+← moves it back`);
      await focusedWhen(page, (f) => f.tile === String(n - 1));
    }
  }
  // Arrows walk the strip; Delete removes the focused part until none is left.
  await page.keyboard.press('ArrowRight');
  ok((await focusedWhen(page, (f) => f.tile === String(kinds.length - 2))).tile === String(kinds.length - 2), 'keys: → goes to the next part towards the load');
  await page.keyboard.press('End');
  ok((await focusedWhen(page, (f) => f.tile === '0')).tile === '0', 'keys: End goes to the part at the load');
  while (kinds.length) {
    const f = await focusedWhen(page, (x) => x.tile !== null);
    const i = Number(f.tile);
    ok(f.tile !== null && i >= 0, `keys: a part has the focus with ${kinds.length} left`);
    await page.keyboard.press('Delete');
    kinds = kinds.filter((_, j) => j !== i);
    await checkStrip(page, kinds, `keys: Delete removes part ${i + 1}`);
  }
  ok((await focusedWhen(page, (f) => f.addKind)).addKind, 'keys: with the last part gone the focus is on the kind list');
  ok(page.errors.length === 0, `no page errors (${page.errors.slice(0, 3).join(' | ')})`);
  await page.close();

  // ---------- typing values ----------
  page = await open(context);
  await page.click('[data-tile="0"]');
  const field = '[data-name="p1-C"] input';
  await page.click(field, { clickCount: 3 });
  let typed = '';
  for (const ch of '47p') {
    typed += ch;
    await page.keyboard.type(ch);
    await checkReadout(page, `typing “${typed}”`);
  }
  let c = await linked(page);
  ok(Math.abs(c.parts[0].value - 47e-12) < 1e-24, `typing 47p sets C to 47 pF (${c.parts[0].value})`);
  const before = page.url();
  await page.click(field, { clickCount: 3 });
  await page.keyboard.type('47 pH');
  await frame(page);
  const bad = await page.evaluate((sel) => { const i = document.querySelector(sel); const e = document.getElementById(i.getAttribute('aria-describedby') ?? ''); return { invalid: i.getAttribute('aria-invalid'), why: e?.textContent ?? '' }; }, field);
  ok(bad.invalid === 'true' && bad.why.length > 5, `an unreadable value is marked and says why (${JSON.stringify(bad)})`);
  ok(page.url() === before, 'an unreadable value leaves the circuit as it was');
  await page.keyboard.press('Escape');
  ok((await page.getAttribute(field, 'aria-invalid')) === null, 'Escape takes the field back to the circuit\'s value');
  // The other forms follow: X in Ω at f0 sets C; the normalised form refuses a sign a C cannot have.
  await page.click('[data-name="p1-X"] input', { clickCount: 3 });
  await page.keyboard.type('-30');
  c = await checkReadout(page, 'typing X = −30 Ω');
  ok(Math.abs(c.parts[0].value - 1 / (2 * Math.PI * 100e6 * 30)) < 1e-24, 'X = −30 Ω gives C = 1/(ω·30 Ω)');
  await page.click('[data-name="p1-n"] input', { clickCount: 3 });
  await page.keyboard.type('0.5');
  ok((await page.getAttribute('[data-name="p1-n"] input', 'aria-invalid')) === 'true', 'x > 0 for a series C is refused');
  await page.click('[data-name="f0"] input', { clickCount: 3 });
  await page.keyboard.type('2.4G');
  c = await checkReadout(page, 'typing f0 = 2.4G');
  ok(c.f0 === 2.4e9, `f0 is 2.4 GHz in the link (${c.f0})`);
  await page.click('[data-name="loadR"] input', { clickCount: 3 });
  await page.keyboard.type('∞');
  c = await checkReadout(page, 'an open load');
  ok(c.loadR === Infinity, 'R = ∞ is the open');
  await page.click('[data-name="loadR"] input', { clickCount: 3 });
  await page.keyboard.type('75');
  await page.selectOption('[data-add-kind]', String(S.KIND_ORDER[6]));
  await page.click('[data-add]');
  await page.click('[data-name="p3-len"] input', { clickCount: 3 });
  await page.keyboard.type('0.2 λ');
  c = await checkReadout(page, 'a line of 0.2 λ');

  // ---------- reload from the link ----------
  const url = page.url();
  const shownBefore = await page.evaluate(() => [...document.querySelectorAll('[data-input],[data-tile]')].map((e) => e.textContent));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-circuit]');
  await frame(page);
  ok(page.url() === url, 'a reload keeps the link');
  ok(S.sameCircuit(await linked(page), c), 'a reload gives the same circuit');
  const shownAfter = await page.evaluate(() => [...document.querySelectorAll('[data-input],[data-tile]')].map((e) => e.textContent));
  ok(JSON.stringify(shownAfter) === JSON.stringify(shownBefore), 'a reload gives the same strip and readout');
  await checkReadout(page, 'after the reload');
  ok(page.errors.length === 0, `no page errors (${page.errors.slice(0, 3).join(' | ')})`);
  await page.close();

  // A broken link says why and still shows a circuit.
  page = await open(context, '?v=1&z0=abc&p=ls:1n,zz:4');
  const issues = await page.textContent('[data-circuit]');
  ok(issues.includes('z0') && issues.includes('unknown kind'), 'a broken link lists its issues on the page');
  await checkStrip(page, ['ls'], 'a broken link');
  await page.close();
  await context.close();

  // ---------- narrow screens and screenshots ----------
  for (const width of [320, 390]) {
    const scheme = width === 390 ? 'dark' : 'light';
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: scheme, hasTouch: true, isMobile: true });
    const p = await open(ctx, '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.125:50,so:0.1:75,qw:35.36,rp:1k');
    await p.click('[data-tile="2"]');
    await frame(p);
    const sw = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
    ok(sw.s <= sw.c, `no horizontal scroll at ${width} px (${sw.s} > ${sw.c})`);
    const below = await p.evaluate(() => document.querySelector('[data-circuit]').getBoundingClientRect().top > document.querySelector('[data-chart]').getBoundingClientRect().bottom);
    ok(below, `the circuit panel is below the chart at ${width} px`);
    if (shots && width === 390) { mkdirSync(shots, { recursive: true }); await p.screenshot({ path: join(shots, 'strip-390-dark.png'), fullPage: true }); }
    await ctx.close();
  }
  const wide = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', deviceScaleFactor: 1000 / 1440 });
  const p = await open(wide);
  const beside = await p.evaluate(() => {
    const a = document.querySelector('[data-circuit]').getBoundingClientRect(), b = document.querySelector('[data-chart]').getBoundingClientRect();
    return a.left >= b.right && a.top < 900 && a.top < b.bottom;
  });
  ok(beside, 'the circuit panel is beside the chart and in view at 1440 × 900');
  if (shots) await p.screenshot({ path: join(shots, 'strip-1440-light.png') });
  await wide.close();
} catch (e) {
  ok(false, `the run stopped: ${e.stack ?? e}`);
}

await browser.close();
stopServer();
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`circuit strip: ${passed} of ${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
