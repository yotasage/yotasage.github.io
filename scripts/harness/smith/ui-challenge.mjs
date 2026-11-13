// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the challenges and lesson links (step M6.3b,
// components/Smith/Challenge.tsx and Lesson.tsx, lib/smith/challenge.ts and lesson.ts):
// - every kind by keyboard alone: started from the Learn section, its problem the engine's for the seed in the link,
//   Check refuses the start state with the engine's reason, hints 1–4 appear with the engine's texts (hint 1's circles
//   drawn by the solve layer), the reveal's Apply (or, for `read`, the revealed answer typed) makes Check pass, one undo
//   step; the Solve panel, the suggestions and "Solve for" absent while it runs, and for `read` also the readout, the
//   node table, the equation panel, the derivations, the load fields and the circuit input;
// - the same seed through the link gives the same problem; a link with a solved circuit counts as solved;
// - progress in localStorage (tried, solved, revealed, hints, fewest parts) and on the page after a reload;
// - a lesson with the reveal hidden stops the ladder at hint 3;
// - "Make a lesson link" round-trips every lock and hidden panel, one at a time and all together, and the text with
//   emoji, &, =, %, a newline and 501 code points (cut at 500);
// - the locked view: the text as plain text, the hidden panels absent, every locked value unchanged after typing by
//   keyboard and mouse, the handle's keys, a mouse drag and a touch drag of its handle, Delete and Alt+arrows on a
//   kind-locked tile; an unlocked part still moves; Leave the lesson unlocks;
// - 320 and 390 px: no sideways scroll with a challenge, the maker or the Lesson box, 44 px targets.
//   tsx ui-challenge.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedChallenge from '../../../lib/smith/challenge.ts';
import * as importedLesson from '../../../lib/smith/lesson.ts';

const S = importedState.default ?? importedState;
const C = importedChallenge.default ?? importedChallenge;
const L = importedLesson.default ?? importedLesson;
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
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const counts = { kinds: 0, hints: 0, links: 0, roundTrips: 0, refused: 0 };

async function open(context, search = '') {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main${search ? `?${search}` : ''}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-chart]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
  return page;
}
const search = (page) => page.evaluate(() => window.location.search);
const linked = async (page) => S.decodeCircuit(await search(page));
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const has = async (page, sel) => (await page.$(sel)) !== null;
const key = async (page, sel, k = 'Enter') => { await page.focus(sel); await page.keyboard.press(k); await frame(page); };
const progress = async (page) => JSON.parse(await page.evaluate(() => window.localStorage.getItem('smith.challenges')) ?? '{}');
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
/** A number as the visitor would type it. */
const typed = (v) => String(Number(v.toPrecision(6)));

/** What a running challenge must hide (and, for `read`, more). */
async function hiddenWhileRunning(page, kind) {
  for (const sel of ['[data-solve]', '[data-suggest-status]', '[data-solve-row]']) ok(!await has(page, sel), `${kind}: ${sel} is absent while it runs`);
  const readSels = ['[data-readout]', '[data-nodes]', '[data-math]', '[data-input-box]', '[data-name="loadR"]', '[data-name="loadX"]'];
  for (const sel of readSels) ok((await has(page, sel)) === (kind !== 'read'), `${kind}: ${sel} ${kind === 'read' ? 'absent' : 'present'}`);
  if (kind === 'read') ok(!await has(page, '[data-math-live]') && !await has(page, '[data-show-eq]'), 'read: no equations and no "show equation"');
  if (kind === 'read') {
    const s = await search(page);
    ok(!/zl=|p=/.test(s), () => `read: the link holds no circuit (${s})`);
  }
}

/** Plays one kind by keyboard alone; returns the seed. */
async function playKind(page, kind) {
  await page.evaluate(() => document.getElementById('learn').scrollIntoView());
  await key(page, `[data-challenge-kind="${kind}"]`);
  await page.waitForSelector('[data-challenge]');
  await page.waitForFunction((k) => window.location.search.includes(`ch=${k}.`), kind);
  const id = await page.getAttribute('[data-challenge]', 'data-challenge');
  const seed = Number(id.split('.')[1]);
  const ch = C.makeChallenge(kind, seed);
  ok(id === `${kind}.${seed}` && (await search(page)).includes(`ch=${id}`), () => `${kind}: the link holds the challenge (${id})`);
  ok(await page.evaluate(() => document.activeElement?.id) === 'smith-challenge', `${kind}: the focus is on the challenge's heading`);
  ok((await text(page, '[data-challenge-task]')).includes(C.challengeTask(ch)), `${kind}: the task is the engine's`);
  const c0 = kind === 'read' ? ch.circuit : (await linked(page)).circuit;
  if (kind !== 'read') ok(S.sameCircuit(c0, ch.circuit), `${kind}: the circuit is the problem's`);
  await hiddenWhileRunning(page, kind);

  // Check refuses the start state, with the engine's reason.
  await key(page, '[data-challenge-check]');
  const want = C.reached(ch, c0, undefined);
  ok(!want.reached && !await has(page, '[data-challenge][data-reached]'), `${kind}: the start state is not reached`);
  const said = await text(page, '[data-challenge-state]');
  ok(said === want.why, () => `${kind}: Check says "${want.why}" (${said})`);

  // The ladder, one press each.
  const ladder = C.hintLadder(ch, c0);
  for (let k = 1; k <= 4; k++) {
    await key(page, '[data-challenge-hint]');
    ok(await has(page, `[data-hint="${k}"]`), `${kind}: hint ${k} appears`);
    const t = await text(page, `[data-hint="${k}"]`);
    ok(t.includes(ladder[k - 1].text), () => `${kind}: hint ${k} is the engine's ("${ladder[k - 1].text}" in "${t}")`);
    ok(await page.evaluate(() => document.activeElement?.getAttribute('data-hint')) === String(k), `${kind}: the focus is on hint ${k}`);
    if (k === 1) {
      const drawn = await page.evaluate(() => { const l = document.querySelector('[data-chart]').smithSolveLayer; return [l.circleNode, l.shownCircles]; });
      const h = ladder[0];
      ok(h.circles ? drawn[0] === h.circleNode && drawn[1] > 0 : drawn[0] < 0, () => `${kind}: hint 1's circles on the chart (${drawn}, node ${h.circleNode})`);
    }
    counts.hints++;
  }
  ok(await page.isDisabled('[data-challenge-hint]'), `${kind}: no hint after the reveal`);

  // The reveal reaches it.
  if (kind === 'read') {
    const a = C.readAnswer(ch);
    await page.focus('#smith-challenge-answer');
    await page.keyboard.type(a.map(typed).join(', '));
    await page.keyboard.press('Enter');
    await frame(page);
  } else {
    const before = await search(page);
    const sel = kind === 'e24' ? '[data-challenge-apply-std]' : '[data-challenge-apply="0"]';
    ok(await has(page, sel), `${kind}: the reveal offers Apply`);
    await key(page, sel);
    await page.waitForFunction((b) => window.location.search !== b, before);
    const c1 = (await linked(page)).circuit;
    ok(C.reached(ch, c1).reached, `${kind}: the applied circuit reaches it (engine)`);
    await key(page, '[data-challenge-check]');
  }
  ok(await has(page, '[data-challenge][data-reached]'), `${kind}: Check passes after the reveal`);
  ok(/Reached: counted as revealed/.test(await text(page, '[data-challenge-state]')), `${kind}: counted as revealed`);
  if (kind !== 'read') {
    await page.keyboard.press('Control+z');
    await frame(page);
    ok(S.sameCircuit((await linked(page)).circuit, ch.circuit), `${kind}: one Undo brings the problem back`);
    ok(!await has(page, '[data-challenge][data-reached]'), `${kind}: not reached after Undo`);
  }
  counts.kinds++;
  return seed;
}

try {
  // ---------- every kind by keyboard, at 1440 px ----------
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await open(desk);
  ok(await has(page, '[data-solve]'), 'the Solve panel is there before a challenge');
  const seeds = {};
  for (const kind of C.CHALLENGE_KINDS) seeds[kind] = await playKind(page, kind);
  let prog = await progress(page);
  for (const kind of C.CHALLENGE_KINDS) {
    const p = prog[kind] ?? {};
    ok(p.tried === 1 && p.revealed === 1 && p.hints === 3 && p.solved === 0, () => `${kind}: progress after a reveal (${JSON.stringify(p)})`);
  }
  await key(page, '[data-challenge-close]');
  ok(!await has(page, '[data-challenge]') && await has(page, '[data-solve]'), 'Close ends the challenge and the Solve panel is back');
  ok(!(await search(page)).includes('ch='), 'Close takes the challenge out of the link');
  ok(page.errors.length === 0, () => `no page errors: ${page.errors.join(' | ')}`);

  // ---------- the same seed through the link ----------
  for (const kind of C.CHALLENGE_KINDS) {
    const p = await open(desk, `v=1&ch=${kind}.${seeds[kind]}`);
    await p.waitForSelector('[data-challenge]');
    const ch = C.makeChallenge(kind, seeds[kind]);
    ok(await p.getAttribute('[data-challenge]', 'data-challenge') === `${kind}.${seeds[kind]}`, `${kind}: the link opens the challenge`);
    ok((await text(p, '[data-challenge-task]')).includes(C.challengeTask(ch)), `${kind}: the same seed, the same task`);
    if (kind !== 'read') ok(S.sameCircuit((await linked(p)).circuit, ch.circuit), `${kind}: the same seed, the same problem`);
    await hiddenWhileRunning(p, kind);
    counts.links++;
    await p.close();
  }
  // Solved by the visitor's own parts (added and typed, no hint): solved with its fewest parts. A link that already
  // holds a reaching circuit opens reached but counts as tried only (a shared answer is not a solve).
  {
    const ch = C.makeChallenge('two', seeds.two), win = ch.revealed[0].circuit;
    const p = await open(desk, `v=1&ch=two.${seeds.two}`);
    await p.waitForSelector('[data-challenge]');
    for (let i = 0; i < win.parts.length; i++) {
      await p.selectOption('[data-add-kind]', String(win.parts[i].kind));
      await key(p, '[data-add]');
      ok(!await has(p, '[data-challenge][data-reached]'), `two: not reached with ${i + 1} part(s) of ${win.parts.length}`);
      await p.fill(`[data-name^="p${i + 1}-"] input`, String(win.parts[i].value));
      await frame(p);
    }
    ok(C.reached(ch, (await linked(p)).circuit).reached && await has(p, '[data-challenge][data-reached]'), 'two: typed values reach it');
    ok(/^✓ Reached\.$/.test((await text(p, '[data-challenge-state]')).trim()), 'two: counted as solved (no reveal)');
    prog = await progress(p);
    ok(prog.two.solved === 1 && prog.two.fewest === win.parts.length && prog.two.tried === 3, () => `two: solved once with ${win.parts.length} parts (${JSON.stringify(prog.two)})`);
    // The progress after a reload, on the page.
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('[data-progress="two"]');
    await frame(p);
    const shown = await text(p, '[data-progress="two"]');
    ok(shown.includes('tried 4') && shown.includes('solved 1') && shown.includes('revealed 1') && shown.includes('hints 3') && shown.includes(`fewest parts ${win.parts.length}`),
      () => `two: the progress after a reload (${shown})`);
    ok((await text(p, '[data-progress="read"]')).includes('revealed 1'), 'read: the progress after a reload');
    await p.close();
  }
  // A lesson that hides the reveal: hints 1–3 only.
  {
    const ch = C.makeChallenge('stub', seeds.stub);
    const p = await open(desk, `${S.encodeCircuit(ch.circuit)}&hd=reveal&ch=stub.${seeds.stub}`);
    await p.waitForSelector('[data-challenge]');
    for (let k = 0; k < 3; k++) await key(p, '[data-challenge-hint]');
    ok(await has(p, '[data-hint="3"]') && !await has(p, '[data-hint="4"]') && await p.isDisabled('[data-challenge-hint]'), 'hd=reveal: the ladder stops at hint 3');
    ok(!await has(p, '[data-why="challenge-reveal"]'), 'hd=reveal: no line for the reveal');
    ok(await has(p, '[data-lesson-box]'), 'hd=reveal: the Lesson box is there');
    ok(await has(p, '[data-challenge-new]'), 'hd=reveal: a lesson without locks still offers New problem');
    await p.close();
  }

  // ---------- the lesson-link maker ----------
  const c2 = S.defaultCircuit();
  const pm = await open(desk, S.encodeCircuit(c2));
  await pm.evaluate(() => document.querySelector('[data-lesson-maker]').scrollIntoView());
  await key(pm, '[data-lesson-maker] > summary');
  ok(await pm.$eval('[data-lesson-maker]', (d) => d.open), 'the maker opens by keyboard');
  const tokens = ['z0', 'f0', 'zl', 'parts', 'k1', 'v1', 'k2', 'v2'];
  const decodeMade = async () => S.decodeCircuit(new URL(await pm.inputValue('[data-lesson-link]')).search);
  const tokensOf = (lesson) => (lesson ? lesson.locks.map(L.lockText).sort() : []);
  // One at a time (Space on the box), then all together.
  for (const t of tokens) {
    await key(pm, `[data-lock="${t}"]`, 'Space');
    const d = await decodeMade();
    ok(JSON.stringify(tokensOf(d.lesson)) === JSON.stringify([t]) && S.sameCircuit(d.circuit, c2) && !d.issues.length, () => `the lock ${t} alone round-trips (${tokensOf(d.lesson)}; ${d.issues})`);
    await key(pm, `[data-lock="${t}"]`, 'Space');
    counts.roundTrips++;
  }
  for (const pn of L.PANELS) {
    await key(pm, `[data-hide="${pn}"]`, 'Space');
    const d = await decodeMade();
    ok(d.lesson && d.lesson.hidden.join() === pn && !d.lesson.locks.length, () => `hiding ${pn} alone round-trips (${JSON.stringify(d.lesson)})`);
    await key(pm, `[data-hide="${pn}"]`, 'Space');
    counts.roundTrips++;
  }
  for (const t of tokens) await key(pm, `[data-lock="${t}"]`, 'Space');
  for (const pn of L.PANELS) await key(pm, `[data-hide="${pn}"]`, 'Space');
  const words = 'Tune 1 & 2 = 50 % 😀 ✓';
  await pm.focus('[data-lesson-text]');
  await pm.keyboard.type(words);
  await pm.keyboard.press('Enter');
  await pm.keyboard.type('next line: a=b&c%20');
  await frame(pm);
  const want = `${words}\nnext line: a=b&c%20`;
  {
    const d = await decodeMade();
    ok(JSON.stringify(tokensOf(d.lesson)) === JSON.stringify([...tokens].sort()), () => `every lock round-trips (${tokensOf(d.lesson)})`);
    ok(d.lesson.hidden.join() === L.PANELS.join(), () => `every hidden panel round-trips (${d.lesson.hidden})`);
    ok(d.lesson.text === want, () => `the text round-trips (${JSON.stringify(d.lesson.text)})`);
    ok(S.sameCircuit(d.circuit, c2) && !d.issues.length, `the circuit round-trips (${d.issues})`);
    ok((await text(pm, '[data-lesson-count]')) === `${[...want].length} / 500`, 'the counter counts code points');
    counts.roundTrips++;
  }
  // 501 code points: cut at 500, never inside a pair.
  {
    const long = '😀'.repeat(501);
    await pm.fill('[data-lesson-text]', long);
    await frame(pm);
    const d = await decodeMade();
    ok([...d.lesson.text].length === 500 && d.lesson.text === '😀'.repeat(500), () => `501 code points are cut at 500 (${[...d.lesson.text].length})`);
    ok((await text(pm, '[data-lesson-count]')) === '500 / 500', 'the counter shows 500 / 500');
    await pm.fill('[data-lesson-text]', want);
    await frame(pm);
    counts.roundTrips++;
  }
  // Copy link (the clipboard may be refused here; the status says so either way).
  await desk.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await key(pm, '[data-lesson-copy]');
  await sleep(100);
  ok((await text(pm, '[data-lesson-copied]')).length > 0, 'Copy link says what it did');
  ok(await noScroll(pm), '1440 px: no sideways scroll with the maker open');
  const allLink = await pm.inputValue('[data-lesson-link]');
  // A second lesson: only part 1's value and the parts' list locked, the Solve panel and suggestions hidden.
  for (const t of tokens) if (!['v1'].includes(t)) await key(pm, `[data-lock="${t}"]`, 'Space');
  await key(pm, '[data-hide="reveal"]', 'Space');
  const oneLink = await pm.inputValue('[data-lesson-link]');
  ok(/lk=v1&hd=solve,suggest&tx=/.test(oneLink), () => `the second lesson's link (${oneLink})`);
  await pm.close();

  // ---------- the locked view ----------
  async function refusedBy(p, what, act) {
    const before = (await linked(p)).circuit;
    await act();
    await sleep(80);
    await frame(p);
    const after = (await linked(p)).circuit;
    ok(S.sameCircuit(before, after), () => `${what}: the locked circuit did not change`);
    counts.refused++;
  }
  async function mouseDrag(p, i) {
    await p.evaluate(() => document.querySelector('[data-chart]').scrollIntoView({ block: 'start' }));
    await frame(p);
    const h = await p.evaluate((k) => { const b = document.querySelector(`[data-handle="${k}"]`).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, i);
    await p.mouse.move(h[0], h[1]);
    await p.mouse.down();
    for (let j = 1; j <= 12; j++) { await p.mouse.move(h[0] + 6 * j, h[1] - 4 * j); await sleep(16); }
    await p.mouse.up();
    await frame(p);
  }
  {
    const p = await open(desk, new URL(allLink).search.slice(1));
    await p.waitForSelector('[data-lesson-box]');
    ok((await p.$eval('[data-lesson-text-shown]', (e) => e.textContent)) === want, 'the Lesson box shows the text as plain text');
    ok(await p.$eval('[data-lesson-text-shown]', (e) => e.children.length) === 0, 'the text is text, no elements');
    ok(await p.evaluate(() => document.activeElement?.id) === 'smith-lesson', 'the focus is on the Lesson box');
    for (const sel of ['[data-solve]', '[data-suggest-status]', '[data-solve-row]']) ok(!await has(p, sel), `lesson: ${sel} is absent`);
    for (const f of ['z0', 'f0', 'loadR', 'loadX']) {
      ok(await p.$eval(`#smith-f-${f}`, (e) => e.readOnly && e.getAttribute('aria-readonly') === 'true'), `lesson: ${f} is read only`);
      ok(await has(p, `[data-name="${f}"] [data-lock-mark]`), `lesson: ${f} has its padlock`);
      await refusedBy(p, `typing into ${f} by keyboard`, async () => { await p.focus(`#smith-f-${f}`); await p.keyboard.press('End'); await p.keyboard.type('7'); });
      await refusedBy(p, `typing into ${f} after a click`, async () => { await p.click(`#smith-f-${f}`); await p.keyboard.type('9'); });
    }
    for (const i of [0, 1]) {
      await key(p, `[data-tile="${i}"]`);
      ok(await p.$eval(`[data-name^="p${i + 1}-"] input`, (e) => e.readOnly), `lesson: part ${i + 1}'s value is read only`);
      await refusedBy(p, `typing part ${i + 1}'s value`, async () => { await p.click(`[data-name^="p${i + 1}-"] input`); await p.keyboard.type('3'); });
      ok(await p.isDisabled('[data-remove]') && await p.isDisabled('[data-move="source"]') && await p.isDisabled('[data-move="load"]'), `lesson: part ${i + 1} cannot be removed or moved`);
      await refusedBy(p, `Delete on tile ${i + 1}`, () => key(p, `[data-tile="${i}"]`, 'Delete'));
      await refusedBy(p, `Alt+arrow on tile ${i + 1}`, () => key(p, `[data-tile="${i}"]`, i ? 'Alt+ArrowRight' : 'Alt+ArrowLeft'));
      ok(await p.getAttribute(`[data-handle-key="${i}"]`, 'aria-readonly') === 'true', `lesson: handle ${i + 1}'s slider is read only`);
      await refusedBy(p, `the handle's keys on part ${i + 1}`, async () => { await p.focus(`[data-handle-key="${i}"]`); for (const k of ['ArrowUp', 'ArrowUp', 'PageDown']) await p.keyboard.press(k); });
      await refusedBy(p, `a mouse drag of handle ${i + 1}`, () => mouseDrag(p, i));
    }
    ok(await p.isDisabled('[data-add]') && await p.isDisabled('[data-draw]'), 'lesson: Add and Draw are off with the parts locked');
    ok(await p.isDisabled('[data-start-over]'), 'lesson: Start over is off on the lesson\'s circuit');
    ok(await p.isDisabled('[data-challenge-kind="two"]') && await p.isDisabled('[data-example="reading-a-match"]'), 'lesson: challenges and examples wait for Leave the lesson');
    await key(p, '[data-lesson-leave]');
    ok(!await has(p, '[data-lesson-box]') && !(await search(p)).includes('lk='), 'Leave the lesson drops it from the page and the link');
    ok(!await p.$eval('#smith-f-z0', (e) => e.readOnly) && await has(p, '[data-solve]'), 'Leave the lesson unlocks and shows the Solve panel');
    ok(p.errors.length === 0, () => `lesson: no page errors: ${p.errors.join(' | ')}`);
    await p.close();
  }
  {
    const p = await open(desk, new URL(oneLink).search.slice(1));
    await p.waitForSelector('[data-lesson-box]');
    const c0 = (await linked(p)).circuit;
    await p.focus('[data-handle-key="1"]');
    await p.keyboard.press('ArrowUp');
    await frame(p);
    const c1 = (await linked(p)).circuit;
    ok(c1.parts[1].value !== c0.parts[1].value && c1.parts[0].value === c0.parts[0].value, 'lesson v1: part 2 still moves by its keys, part 1 does not');
    await refusedBy(p, 'v1: the keys of handle 1', async () => { await p.focus('[data-handle-key="0"]'); await p.keyboard.press('ArrowDown'); });
    ok(!await has(p, '[data-solve]') && !await has(p, '[data-suggest-status]'), 'lesson v1: Solve and suggestions hidden');
    await p.close();
  }
  await desk.close();

  // ---------- phones: touch, 390 and 320 px ----------
  for (const [width, scheme] of [[390, 'dark'], [320, 'light']]) {
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    const p = await open(ctx, new URL(oneLink).search.slice(1));
    const cdp = await ctx.newCDPSession(p);
    await p.waitForSelector('[data-lesson-box]');
    ok(await noScroll(p), `${width} px: no sideways scroll with the Lesson box`);
    // A touch drag of the locked handle does nothing; of the free one it moves.
    const touchDrag = async (i) => {
      await p.evaluate(() => document.querySelector('[data-chart]').scrollIntoView({ block: 'start' }));
      await frame(p);
      const h = await p.evaluate((k) => { const b = document.querySelector(`[data-handle="${k}"]`).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, i);
      const touch = (type, pt) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pt ? [{ x: pt[0], y: pt[1], id: 0 }] : [] });
      await touch('touchStart', h);
      for (let j = 1; j <= 12; j++) { await sleep(16); await touch('touchMove', [h[0] + 4 * j, h[1] - 3 * j]); }
      await sleep(16);
      await touch('touchEnd', null);
      await sleep(80);
      await frame(p);
    };
    await refusedBy(p, `${width} px: a touch drag of the locked handle`, () => touchDrag(0));
    const before = (await linked(p)).circuit;
    await touchDrag(1);
    ok((await linked(p)).circuit.parts[1].value !== before.parts[1].value, `${width} px: a touch drag of the free handle moves it`);
    await p.tap('[data-lesson-leave]');
    await frame(p);
    await p.evaluate(() => document.getElementById('learn').scrollIntoView());
    await p.tap('[data-challenge-kind="qw"]');
    await p.waitForSelector('[data-challenge]');
    await frame(p);
    ok(await noScroll(p), `${width} px: no sideways scroll with a challenge`);
    for (let k = 0; k < 4; k++) await p.tap('[data-challenge-hint]');
    await frame(p);
    ok(await noScroll(p), `${width} px: no sideways scroll with the reveal`);
    const fit = await p.evaluate(() => { const g = document.querySelector('[data-challenge]').getBoundingClientRect(); return g.left >= 0 && g.right <= document.documentElement.clientWidth; });
    ok(fit, `${width} px: the challenge fits the screen`);
    const small = await p.$$eval('[data-challenge] button:not([data-why]):not(:disabled)', (bs) => bs.filter((b) => { const r = b.getBoundingClientRect(); return r.height < 44 || r.width < 44; }).length);
    ok(small === 0, `${width} px: the challenge's buttons are 44 px targets (${small} smaller)`);
    if (shots && width === 390) {
      await p.evaluate(() => document.querySelector('[data-chart]').scrollIntoView({ block: 'start' }));
      await p.screenshot({ path: join(shots, 'challenge-390.png'), scale: 'css' });
    }
    await p.tap('[data-challenge-apply="0"]');
    await frame(p);
    ok(await has(p, '[data-challenge][data-reached]'), `${width} px: Apply by a tap reaches it`);
    await p.evaluate(() => document.querySelector('[data-lesson-maker]').scrollIntoView());
    await p.tap('[data-lesson-maker] > summary');
    await frame(p);
    ok(await noScroll(p), `${width} px: no sideways scroll with the maker open`);
    const smallM = await p.$$eval('[data-lesson-maker] input[type="checkbox"]', (bs) => bs.filter((b) => b.closest('label').getBoundingClientRect().height < 44).length);
    ok(smallM === 0, `${width} px: the maker's boxes are 44 px rows (${smallM} smaller)`);
    ok(p.errors.length === 0, () => `${width} px: no page errors: ${p.errors.join(' | ')}`);
    await ctx.close();
  }
} catch (e) {
  ok(false, `stopped: ${e.stack ?? e}`);
} finally {
  await browser.close();
  stopServer();
}

for (const f of failures) console.log(`FAIL ${f}`);
console.log(`ui-challenge: ${counts.kinds} kinds by keyboard, ${counts.hints} hints, ${counts.links} challenge links, ${counts.roundTrips} lesson round trips, ${counts.refused} locked changes refused`);
console.log(`ui-challenge: ${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
