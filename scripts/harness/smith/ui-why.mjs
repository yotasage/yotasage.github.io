// Drives /smith-chart/main in the installed Edge (or Chrome) and checks step M3.5c: the short line and "→ theory" link
// beside every control and readout (components/Smith/whys.ts, from docs/smith-chart/theory.md §8). Every one of the
// lines (39 of M3.5c, 5 of M4.3a, 9 of M4.3c) is on the page (the ten kinds' lines in the part card, one kind at a time) with its text, and its link
// points at a topic that exists. By mouse: every info button opens its bubble, its link opens the topic (also when the
// hash is already that topic's), makes it the target, puts the focus on its heading, and "Back to the tool" brings
// the focus and the view back to the button. By keyboard alone: Tab to a button, Enter opens, Tab to the link, Enter
// follows, Tab to "Back to the tool", Enter returns; Escape closes a bubble; a kind's line by keyboard. By touch at 390
// px: a tap opens a bubble inside the screen, a tap elsewhere closes it, a tap on the link opens the folded topic in
// view, and the way back. Only one bubble is open at a time; no horizontal scroll at 320 and 390 px with a bubble open;
// no errors in the console.
//   tsx ui-why.mjs [-] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedWhys from '../../../components/Smith/whys.ts';

const S = importedState.default ?? importedState;
const { WHYS } = importedWhys.default ?? importedWhys;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
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

const TOPICS = ['how-to-use', 'gamma-z-y', 'reading-the-chart', 'moving-on-the-chart', 'transmission-lines', 'how-good-is-a-match', 'matching-with-two-parts',
  'two-one-or-none', 'one-value-and-a-point', 'realisable-values', 'q-and-bandwidth', 'reading-a-trace'];
const KEYS = Object.keys(WHYS);
const KIND_KEYS = KEYS.filter((k) => k.startsWith('kind-'));
// Every kind once, so the card can show each kind's line.
// M4.3a: two unknowns marked (the first as "L or C"), so the Solve panel shows its lines with a solution to apply.
const ALL = S.cleanAsk({ z0: 50, f0: 1e8, loadR: 25, loadX: 25, parts: S.KIND_ORDER.map((kind) => S.newPart(kind, S.defaultCircuit())) },
  { unknowns: [{ part: 0, param: 'value', free: true }, { part: 3, param: 'value' }], goal: { kind: 'point' } });
// M4.3c: the same with a circle goal, so the family's slider (and its line) shows.
const FAM = { ...ALL, ask: { ...ALL.ask, goal: { kind: 'vswr', value: 1.5, within: true } } };
// M4.4b: nothing marked, so the panel shows its suggestions (and their line).
const SUG = S.cleanAsk(ALL, { unknowns: [], goal: { kind: 'point' } });
/** theory.md §8's 39 lines, M4.3a's five of the Solve panel, M4.3c's nine (theory-solver.md), M4.4b's suggestions and M5.2's two (show equation, the equations), M5.3's derivations, M5.4's Explain, M6.3a's five of the Learn section and the guide and M6.3b's ten of the challenges and lesson links, M7.2a's six of the sweep, M7.2b's six of its plot, figures and marker table, M7.3's two of the report, M8.3a's eight of the Export section and M8.3b's four of its data, project and link. */
const LINES = 99;
/** The Standard values setting is folded: open it so its lines are on the page. */
const openLists = (page) => page.evaluate(() => { for (const s of ['[data-lists]', '[data-lesson-maker]']) { const d = document.querySelector(s); if (d) d.open = true; } });

async function open(context, c = null, hash = '', extra = '') {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (msg) => { if (msg.type() === 'error') page.errors.push(msg.text()); });
  await page.goto(`${base}/smith-chart/main${c ? `?${S.encodeCircuit(c)}${extra}` : ''}${hash}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-theory]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
  return page;
}

const state = (page) => page.evaluate(() => ({
  hash: window.location.hash,
  focus: document.activeElement?.closest('[data-topic]')?.id && document.activeElement.tagName === 'SUMMARY' ? document.activeElement.closest('[data-topic]').id : '',
  active: document.activeElement?.getAttribute('data-why') ?? document.activeElement?.getAttribute('data-why-link') ?? (document.activeElement?.hasAttribute('data-back-to-tool') ? 'back' : document.activeElement?.tagName),
  open: [...document.querySelectorAll('[data-topic]')].filter((t) => t.open).map((t) => t.id),
  bubbles: [...document.querySelectorAll('[data-why-bubble]')].map((b) => b.getAttribute('data-why-bubble')),
  backIn: document.querySelector('[data-back-to-tool]')?.closest('[data-topic]')?.id ?? '',
}));
const inView = (page, selector) => page.evaluate((s) => {
  const r = document.querySelector(s)?.getBoundingClientRect();
  return !!r && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < document.documentElement.clientWidth;
}, selector);
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const bubbleBox = (page) => page.evaluate(() => {
  const r = document.querySelector('[data-why-bubble]')?.getBoundingClientRect();
  return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: document.documentElement.clientWidth, vh: window.innerHeight } : null;
});

const counts = { mouse: 0, keys: 0 };
let s;
try {
  // ---------- every line on the page, with its text and a topic that exists ----------
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  // M7.2a: with a band in the link, so the Sweep panel's lines are on the page.
  const p = await open(desk, ALL, '', '&sw=50e6:150e6:101');
  await openLists(p);
  await frame(p);
  ok(KEYS.length === LINES, `whys.ts has the ${LINES} lines (${KEYS.length})`);
  for (const k of KEYS) ok(TOPICS.includes(WHYS[k].topic), `${k}: its topic ${WHYS[k].topic} is a topic of the theory`);
  for (const t of TOPICS) ok(await p.$(`[data-topic][id="${t}"]`) !== null, `topic #${t} exists`);
  const whysNow = () => p.$$eval('[data-why]', (els) => els.map((e) => e.getAttribute('data-why')));
  const seen = new Set(await whysNow());
  for (let i = 0; i < ALL.parts.length; i++) {
    await p.click(`[data-tile="${i}"]`);
    await frame(p);
    for (const k of await whysNow()) seen.add(k);
    const key = `kind-${S.KIND_CODES[ALL.parts[i].kind]}`;
    const line = await p.$eval('[data-card] p[data-why]', (e) => [e.getAttribute('data-why'), e.textContent, e.querySelector('a').getAttribute('href')]);
    ok(line[0] === key, () => `part ${i + 1}: the card shows the line ${key} (${line[0]})`);
    ok(line[1] === `${WHYS[key].text} → theory`, () => `${key}: the text "${line[1]}"`);
    ok(line[2] === `#${WHYS[key].topic}`, `${key}: links to #${WHYS[key].topic}`);
    seen.add(line[0]);
  }
  // The family's line, on a page of its own with a circle goal.
  const pf = await open(desk, FAM);
  const famKeys = new Set();
  for (const k of await pf.$$eval('[data-why]', (els) => els.map((e) => e.getAttribute('data-why')))) if (!seen.has(k)) famKeys.add(k);
  for (const k of famKeys) seen.add(k);
  ok(famKeys.has('solve-family'), 'solve-family: beside the family slider');
  const ps = await open(desk, SUG);
  await ps.waitForSelector('[data-why="solve-suggest"]', { timeout: 15000 }).catch(() => {});
  const sugKeys = new Set();
  for (const k of await ps.$$eval('[data-why]', (els) => els.map((e) => e.getAttribute('data-why')))) if (!seen.has(k)) sugKeys.add(k);
  for (const k of sugKeys) seen.add(k);
  ok(sugKeys.has('solve-suggest'), 'solve-suggest: beside the first suggestion');
  // M6.3a: the guide's lines, with an example loaded (the answer's and the hint's link to the step's topic).
  const pg = await open(desk, ALL);
  await pg.click('[data-example="reading-a-match"]');
  await frame(pg);
  const guideKeys = new Set();
  for (const k of await pg.$$eval('[data-why]', (els) => els.map((e) => e.getAttribute('data-why')))) if (!seen.has(k)) guideKeys.add(k);
  for (const k of guideKeys) seen.add(k);
  ok(['guide', 'guide-answer', 'guide-hint'].every((k) => guideKeys.has(k)), () => `the guide's lines with an example loaded (${[...guideKeys]})`);
  // M6.3b: a running challenge's lines and the Lesson box's, from a link with both.
  const pc = await open(desk, ALL, '', '&ch=two.5&tx=Hi');
  await pc.waitForSelector('[data-challenge]');
  await openLists(pc);
  await frame(pc);
  const chKeys = new Set();
  for (const k of await pc.$$eval('[data-why]', (els) => els.map((e) => e.getAttribute('data-why')))) if (!seen.has(k)) chKeys.add(k);
  for (const k of chKeys) seen.add(k);
  ok(['challenge-check', 'challenge-hint', 'challenge-reveal', 'lesson-box'].every((k) => chKeys.has(k)), () => `the challenge's and the lesson's lines (${[...chKeys]})`);
  for (const k of KEYS) ok(seen.has(k), `${k}: on the page`);
  ok(seen.size === LINES, () => `all ${LINES} lines seen (${seen.size})`);

  // ---------- by mouse: every info button, its bubble, its link and the way back ----------
  // The fields' buttons are in the card of the selected part, so every part is selected in turn.
  const done = new Set();
  const followAll = [];
  const page0 = p;
  for (let i = 0; i < ALL.parts.length; i++) {
    await p.click(`[data-tile="${i}"]`);
    await frame(p);
    for (const k of await p.$$eval('button[data-why]', (els) => els.map((e) => e.getAttribute('data-why')))) if (!done.has(k)) { done.add(k); followAll.push([i, k]); }
  }
  done.clear();
  for (const k of famKeys) followAll.push([-1, k]);
  for (const k of sugKeys) followAll.push([-2, k]);
  for (const k of guideKeys) followAll.push([-3, k]);
  for (const k of chKeys) followAll.push([-4, k]);
  for (const [i, k] of followAll) {
    const p = i === -1 ? pf : i === -2 ? ps : i === -3 ? pg : i === -4 ? pc : page0;
    if (i >= 0 && await p.getAttribute(`[data-tile="${i}"]`, 'aria-pressed') !== 'true') { await p.click(`[data-tile="${i}"]`); await frame(p); }
    done.add(k);
    const sel = `button[data-why="${k}"]`;
    await p.locator(sel).first().scrollIntoViewIfNeeded();
    await p.locator(sel).first().click();
    await frame(p);
    const topic = (await p.getAttribute(sel, 'data-why-topic')) ?? WHYS[k].topic;
    const text = await p.$eval('[data-why-bubble]', (e) => [e.getAttribute('data-why-bubble'), e.textContent, e.querySelector('a').getAttribute('href')]).catch(() => null);
    ok(text && text[0] === k && text[1] === `${WHYS[k].text} → theory` && text[2] === `#${topic}`, () => `${k}: the bubble shows "${text?.[1]}"`);
    const box = await bubbleBox(p);
    ok(box && box.left >= 0 && box.right <= box.vw && box.top >= 0 && box.bottom <= box.vh, () => `${k}: the bubble is on the screen (${JSON.stringify(box)})`);
    await p.click(`[data-why-link="${k}"]`);
    await frame(p);
    s = await state(p);
    ok(s.hash === `#${topic}` && s.open.includes(topic), () => `${k}: the link opens #${topic} (${JSON.stringify(s)})`);
    ok(s.focus === topic, () => `${k}: the focus is on the topic's heading (${s.active})`);
    ok(s.bubbles.length === 0, `${k}: the bubble closed`);
    ok(await inView(p, `#${topic} > summary`), `${k}: the topic is in view`);
    ok(s.backIn === topic, `${k}: the topic offers the way back`);
    await p.click('[data-back-to-tool]');
    await frame(p);
    s = await state(p);
    ok(s.active === k && s.backIn === '', () => `${k}: back puts the focus on the button (${s.active})`);
    ok(await inView(p, sel), `${k}: back brings the button into view`);
    counts.mouse++;
  }
  ok(counts.mouse === LINES - KIND_KEYS.length, () => `every info button was followed (${counts.mouse})`);
  ok(pf.errors.length === 0, () => `family page: no errors in the console (${pf.errors.join(' | ')})`);
  await pf.close();
  ok(ps.errors.length === 0, () => `suggestions page: no errors in the console (${ps.errors.join(' | ')})`);
  await ps.close();
  // Close by a second press and by a press elsewhere; one bubble at a time.
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('button[data-why="snap"]');
  await p.click('button[data-why="snap"]');
  ok((await state(p)).bubbles.length === 0, 'a second press closes the bubble');
  await p.click('button[data-why="snap"]');
  await p.click('button[data-why="grid"]');
  ok(JSON.stringify((await state(p)).bubbles) === '["grid"]', 'opening another bubble closes the first');
  ok(await p.getAttribute('button[data-why="grid"]', 'aria-expanded') === 'true', 'the open button says so (aria-expanded)');
  await p.mouse.click(5, 880);
  ok((await state(p)).bubbles.length === 0, 'a press elsewhere closes the bubble');
  // Hover opens nothing.
  await p.hover('button[data-why="z0"]');
  await frame(p);
  ok((await state(p)).bubbles.length === 0, 'hovering an info button opens nothing');
  // The kind's line by mouse.
  await p.click('[data-tile="0"]');
  await p.click('[data-card] [data-why-link]');
  await frame(p);
  s = await state(p);
  ok(s.focus === 'moving-on-the-chart' && s.backIn === 'moving-on-the-chart', () => `a kind's line opens its topic (${JSON.stringify(s)})`);
  await p.click('[data-back-to-tool]');
  await frame(p);
  ok(await p.evaluate(() => document.activeElement?.matches('[data-card] [data-why-link]')), 'back returns to the kind\'s line');
  ok(p.errors.length === 0, () => `desktop: no errors in the console (${p.errors.join(' | ')})`);
  await p.close();

  // ---------- by keyboard alone ----------
  const k1 = await open(desk);
  await k1.focus('[data-name="z0"] input');
  await k1.keyboard.press('Shift+Tab');
  s = await state(k1);
  ok(s.active === 'z0', () => `Shift+Tab from the Z0 field reaches its info button (${s.active})`);
  await k1.keyboard.press('Enter');
  await frame(k1);
  ok(JSON.stringify((await state(k1)).bubbles) === '["z0"]', 'Enter opens the bubble');
  await k1.keyboard.press('Escape');
  await frame(k1);
  s = await state(k1);
  ok(s.bubbles.length === 0 && s.active === 'z0', 'Escape closes it and keeps the focus on the button');
  await k1.keyboard.press('Space');
  await frame(k1);
  ok(JSON.stringify((await state(k1)).bubbles) === '["z0"]', 'Space opens the bubble');
  await k1.keyboard.press('Tab');
  s = await state(k1);
  ok(s.active === 'z0', () => `Tab moves into the bubble, to its link (${s.active})`);
  ok(await k1.evaluate(() => document.activeElement?.hasAttribute('data-why-link')), 'the focus is on the link');
  await k1.keyboard.press('Enter');
  await frame(k1);
  s = await state(k1);
  ok(s.hash === '#gamma-z-y' && s.open.includes('gamma-z-y') && s.focus === 'gamma-z-y', () => `Enter on the link opens the topic and focuses it (${JSON.stringify(s)})`);
  ok(await inView(k1, '#gamma-z-y > summary'), 'the topic is in view');
  await k1.keyboard.press('Tab');
  s = await state(k1);
  ok(s.active === 'back', () => `Tab reaches "Back to the tool" (${s.active})`);
  await k1.keyboard.press('Enter');
  await frame(k1);
  ok((await state(k1)).active === 'z0' && await inView(k1, 'button[data-why="z0"]'), 'Enter on it brings the focus back to the button, in view');
  // Tab out of an open bubble closes it.
  await k1.keyboard.press('Enter');
  await k1.keyboard.press('Tab');
  await k1.keyboard.press('Tab');
  await frame(k1);
  ok((await state(k1)).bubbles.length === 0, 'focus leaving a bubble closes it');
  // A kind's line: Tab from Remove's info button reaches nothing but the line's link before the fields.
  await k1.focus('button[data-why="card"]');
  await k1.keyboard.press('Tab');
  ok(await k1.evaluate(() => document.activeElement?.matches('[data-card] [data-why-link]')), 'Tab reaches the kind\'s line link');
  await k1.keyboard.press('Enter');
  await frame(k1);
  s = await state(k1);
  ok(s.focus === 'moving-on-the-chart', 'Enter on it opens its topic');
  await k1.keyboard.press('Tab');
  await k1.keyboard.press('Enter');
  await frame(k1);
  ok(await k1.evaluate(() => document.activeElement?.matches('[data-card] [data-why-link]')), 'and back by keyboard');
  // The same link a second time (the hash is the topic's already) opens a topic folded meanwhile.
  await k1.evaluate(() => { document.getElementById('moving-on-the-chart').open = false; });
  await frame(k1);
  await k1.keyboard.press('Enter');
  await frame(k1);
  s = await state(k1);
  ok(s.open.includes('moving-on-the-chart') && s.focus === 'moving-on-the-chart', () => `the same link again opens the folded topic (${JSON.stringify(s)})`);
  counts.keys = 1;
  ok(k1.errors.length === 0, () => `keyboard: no errors in the console (${k1.errors.join(' | ')})`);
  await k1.close();
  await desk.close();

  // ---------- by touch at 390 and 320 px ----------
  for (const scheme of ['light', 'dark']) {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    const t = await open(phone);
    ok((await state(t)).open.length === 0, `${scheme} 390 px: the topics start folded`);
    for (const k of ['grid', 'zoom', 'read-rl', 'goal']) {
      const sel = `button[data-why="${k}"]`;
      if (k === 'goal') { await t.tap('[data-nodes] summary'); await frame(t); }
      await t.locator(sel).scrollIntoViewIfNeeded();
      await t.tap(sel);
      await frame(t);
      const box = await bubbleBox(t);
      ok(box && box.left >= 0 && box.right <= box.vw && box.top >= 0 && box.bottom <= box.vh, () => `${scheme} 390 px ${k}: a tap opens the bubble on the screen (${JSON.stringify(box)})`);
      ok(await noScroll(t), `${scheme} 390 px ${k}: no horizontal scroll with the bubble open`);
      await t.tap(`[data-why-link="${k}"]`);
      await frame(t);
      s = await state(t);
      ok(s.open.includes(WHYS[k].topic) && s.hash === `#${WHYS[k].topic}`, () => `${scheme} 390 px ${k}: a tap on the link opens the folded topic (${JSON.stringify(s)})`);
      ok(await inView(t, `#${WHYS[k].topic} > summary`), `${scheme} 390 px ${k}: the topic is in view`);
      await t.tap('[data-back-to-tool]');
      await frame(t);
      ok(await inView(t, sel), `${scheme} 390 px ${k}: back brings the button into view`);
    }
    await t.tap('button[data-why="snap"]');
    await frame(t);
    await t.tap('[data-name="f0"] input');
    ok((await state(t)).bubbles.length === 0, `${scheme} 390 px: a tap elsewhere closes the bubble`);
    await t.setViewportSize({ width: 320, height: 700 });
    await frame(t);
    await t.locator('button[data-why="read-gammaRect"]').scrollIntoViewIfNeeded();
    await t.tap('button[data-why="read-gammaRect"]');
    await frame(t);
    const box = await bubbleBox(t);
    ok(box && box.left >= 0 && box.right <= 320, () => `${scheme} 320 px: the bubble fits (${JSON.stringify(box)})`);
    ok(await noScroll(t), `${scheme} 320 px: no horizontal scroll with a bubble open`);
    ok(t.errors.length === 0, () => `${scheme} phone: no errors in the console (${t.errors.join(' | ')})`);
    await t.close();
    await phone.close();
  }
} catch (e) {
  ok(false, `the run stopped: ${e.stack ?? e}`);
}

await browser.close();
stopServer();
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`why: ${counts.mouse} info buttons followed by mouse, ${KIND_KEYS.length} kinds' lines, keyboard and touch runs`);
console.log(`why: ${passed} of ${passed + failed} checks passed`);
process.exitCode = failed ? 1 : 0;
