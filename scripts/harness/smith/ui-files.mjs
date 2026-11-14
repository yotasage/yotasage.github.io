// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the Export section's data files, the project
// file and the link (step M8.3b, milestones.md M8):
// - the saved CSVs (nodes, trace, markers; the page's digits and every digit, plain and engineering) and the .s1p (RI
//   and MA) equal the writers' output (lib/smith/export/) for the page's state, byte for byte (the .s1p's date taken
//   from the file); the .s1p is read back by check-export.mjs's reference Touchstone reader, Γ to 1e-12 against the
//   trace the harness computes;
// - a saved project opens with no issue to the page's link and is written again to the same text; opened on a fresh
//   page by the file picker and by a drop on the page it restores the same link and the export settings, as one undo
//   step (Undo gives the old circuit back, Redo the project's); a version-0 file (a link as text) is migrated and a
//   version-2 file shows its message and changes nothing;
// - nothing is requested from the network while files are saved and opened (blob: and data: aside);
// - Copy link puts the page's link on the clipboard; without a sweep the trace, markers and .s1p are off and say why;
// - keyboard alone (Save project, Open project's picker, Copy link); 320 and 390 px without horizontal scroll with the
//   message shown; no errors in the console.
//   tsx ui-files.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedSweep from '../../../lib/smith/sweep.ts';
import * as importedValues from '../../../lib/smith/values.ts';
import * as importedCsv from '../../../lib/smith/export/csv.ts';
import * as importedTs from '../../../lib/smith/export/touchstone.ts';
import * as importedProject from '../../../lib/smith/export/project.ts';
import { readTouchstone } from './check-export.mjs';

const S = importedState.default ?? importedState;
const SW = importedSweep.default ?? importedSweep;
const V = importedValues.default ?? importedValues;
const CSV = importedCsv.default ?? importedCsv;
const TS = importedTs.default ?? importedTs;
const PR = importedProject.default ?? importedProject;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
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
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(typeof what === 'function' ? what() : what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** Requests that could carry anything off the device: all but blob:, data: and GETs of the site's own code (a sweep
 *  in an opened project starts the sweep's worker, whose chunks the page loads from its own origin). */
const outside = (page) => page.requests.filter((r) => !r.url.startsWith('blob:') && !r.url.startsWith('data:')
  && !(r.method === 'GET' && !r.body && r.url.startsWith(`${base}/_next/static/`))).map((r) => `${r.method} ${r.url}`);
/** Whether two files are the same but for the last bits of numbers (the browser's Math.atan2 and log10 may round
 *  differently from Node's): every token equal, or both numbers within `rel` of each other. Returns the tokens that
 *  differ in their last digits, or -1 when the files differ otherwise. */
function nearlySame(a, b, rel = 2e-15) {
  if (a === b) return 0;
  const ta = a.split(/([,\s]+)/), tb = b.split(/([,\s]+)/);
  if (ta.length !== tb.length) return -1;
  let n = 0;
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] === tb[i]) continue;
    const x = Number(ta[i]), y = Number(tb[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x - y) > rel * Math.max(Math.abs(x), Math.abs(y), 1e-300)) return -1;
    n++;
  }
  return n;
}

async function open(context, search = '') {
  const page = await context.newPage();
  page.errors = [];
  page.requests = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main${search ? `?${search}` : ''}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-export]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
  page.on('request', (r) => page.requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  return page;
}
async function toExport(page) {
  await page.evaluate(() => document.querySelector('[data-export]').scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => document.querySelector('[data-export]').smithExport.builds > 0, null, { timeout: 5000 }).catch(() => {});
  await frame(page);
}
async function download(page, selector) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(selector)]);
  return { name: dl.suggestedFilename(), text: readFileSync(await dl.path()).toString('utf8') };
}
const searchOf = (page) => page.evaluate(() => window.location.search.slice(1));
/** Waits until the page's link differs from `before` (at most 5 s). */
const linkChanged = (page, before) => page.waitForFunction((b) => window.location.search.slice(1) !== b, before, { timeout: 5000 }).catch(() => {});
const note = (page) => page.evaluate(() => {
  const n = document.querySelector('[data-file-note]');
  return n ? { kind: n.getAttribute('data-file-note'), text: n.textContent } : null;
});
/** Drops a file on the page as a visitor would (dragenter, dragover, drop on the body). */
const drop = (page, name, text, type) => page.evaluate(async ([name, text, type]) => {
  const dt = new DataTransfer();
  dt.items.add(new File([text], name, { type }));
  const fire = (t) => document.body.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
  fire('dragenter');
  fire('dragover');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const zone = !!document.querySelector('[data-drop-zone]');
  const taken = !fire('drop');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { zone, taken, after: !!document.querySelector('[data-drop-zone]') };
}, [name, text, type]);

// ---------- the state ----------

const START = S.encodeCircuit(S.defaultCircuit());
const base0 = S.defaultCircuit();
const asked = S.cleanAsk({ ...base0, loadR: 18, loadX: -32 },
  { unknowns: [{ part: 0, param: 'value' }], goal: { kind: 'vswr', value: 1.5, within: true } });
const lists = { ...V.defaultChoice(), C: { id: 'own', values: [1e-12, 2.2e-12, 4.7e-12, 10e-12] }, R: { id: 'E96' } };
const vl = V.choiceToText(lists).replace(/\+/g, '%2B');
const STATE = `${S.encodeCircuit(asked)}&vl=${vl}&sw=60e6:160e6:301&mk=95e6,120e6`;
const LONG = S.encodeCircuit({ ...base0, loadR: 12, loadX: -40 });
const PREFS = { area: 'whole', size: 'other', other: '120 mm', detail: 'full', colour: 'grey', fontPt: 9, csvAll: false, csvForm: 'eng', ts: 'MA' };

/** The trace and markers the harness computes for a link (as the page: runSweep on a Trace of 1024). */
function sweepOf(search) {
  const d = S.decodeCircuit(`?${search}`), sc = SW.sweepCircuit(d.circuit), tr = new SW.Trace(1024);
  SW.runSweep(tr, d.sweep.band, sc);
  return { d, tr, markers: SW.markersAt(sc, d.sweep.markers) };
}

const results = {};
try {
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  await desk.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });

  // ---------- data files ----------
  const pa = await open(desk, STATE);
  await pa.evaluate((p) => window.localStorage.setItem('smith.export', JSON.stringify(p)), PREFS);
  await pa.reload({ waitUntil: 'networkidle' });
  await pa.waitForSelector('[data-export]');
  await pa.waitForFunction(() => window.location.search.includes('v=1'));
  await toExport(pa);
  pa.requests.length = 0;
  const search = await searchOf(pa);
  const shown = Number(/\((\d+)\)/.exec(await pa.$eval('[data-export-csv-digits] option[value="shown"]', (e) => e.textContent))[1]);
  ok(shown >= 1 && shown <= 17, `the digits setting is read (${shown})`);
  const { d, tr, markers } = sweepOf(search);
  ok(S.sameCircuit(d.circuit, asked) && !!d.circuit.ask, 'the page holds the circuit with its ask');
  for (const [all, form] of [[false, 'eng'], [true, 'plain']]) {
    await pa.selectOption('[data-export-csv-digits]', all ? 'all' : 'shown');
    await pa.selectOption('[data-export-csv-form]', form);
    const o = { digits: all ? 0 : shown, form };
    const what = `${all ? 'every digit' : `${shown} digits`}, ${form}`;
    const nodes = await download(pa, '[data-export-csv="nodes"]');
    // As shown, the files are equal; every digit, they may differ in the last bit of an angle or a dB (see nearlySame).
    const same = (got, want) => (all ? nearlySame(got, want) : got === want ? 0 : -1);
    const dn = same(nodes.text, CSV.nodesCsv(d.circuit, o));
    ok(nodes.name === 'smith-chart-nodes.csv' && dn >= 0, () => `nodes CSV (${what}) equals nodesCsv (${nodes.name}, ${nodes.text.length} chars)`);
    const trace = await download(pa, '[data-export-csv="trace"]');
    const dt = same(trace.text, CSV.traceCsv(tr, d.circuit.z0, o));
    ok(trace.name === 'smith-chart-trace.csv' && dt >= 0, () => `trace CSV (${what}) equals traceCsv (${tr.n} points, ${trace.text.length} chars)`);
    ok(trace.text.split('\r\n').length === tr.n + 2, () => `trace CSV: a header and ${tr.n} rows`);
    const mk = await download(pa, '[data-export-csv="markers"]');
    const dm = same(mk.text, CSV.markersCsv(markers, o));
    ok(mk.name === 'smith-chart-markers.csv' && dm >= 0, () => `markers CSV (${what}) equals markersCsv`);
    results[`CSV ${what}`] = `equal${dn + dt + dm ? ` but ${dn + dt + dm} numbers in their last bit (browser Math)` : ''}`;
    ok(nodes.text.charCodeAt(0) === 0xfeff, 'the CSV starts with a BOM');
  }
  for (const format of ['MA', 'RI', 'DB']) {
    await pa.selectOption('[data-export-ts]', format);
    const f = await download(pa, '[data-export-s1p]');
    const date = /^! Date: (\S+)/m.exec(f.text)?.[1];
    const want = TS.touchstone({ freqs: tr.freqs, gamma: tr.gamma, n: tr.n, z0: d.circuit.z0, link: `${base}/smith-chart/main?${search}`, date: new Date(date), format });
    const ds = nearlySame(f.text, want);
    ok(f.name === 'smith-chart.s1p' && ds >= 0 && (format !== 'RI' || ds === 0), () => `.s1p ${format} equals touchstone() (${f.name}, ${f.text.length} vs ${want.length} chars)`);
    let read = null;
    try { read = readTouchstone(f.text); } catch (e) { ok(false, `.s1p ${format}: the reference reader refused it: ${e.message}`); }
    if (read) {
      let worst = 0, fOk = read.freqs.length === tr.n;
      for (let i = 0; i < Math.min(tr.n, read.freqs.length); i++) {
        if (read.freqs[i] !== tr.freqs[i]) fOk = false;
        worst = Math.max(worst, Math.hypot(read.re[i] - tr.gamma[2 * i], read.im[i] - tr.gamma[2 * i + 1]));
      }
      ok(fOk && worst <= 1e-12, () => `.s1p ${format} read back: ${read.freqs.length} frequencies to the bit (${fOk}), Γ to ${worst}`);
      ok(read.R === d.circuit.z0 && read.format.toUpperCase() === format && read.param.toUpperCase() === 'S', () => `.s1p ${format}: S, the format and R = Z0 (${read.param} ${read.format} ${read.R})`);
      results[`s1p ${format}`] = `read back, Γ to ${worst.toExponential(2)}; ${ds ? `${ds} numbers differ in their last bit` : 'equal'}`;
    }
  }

  // ---------- the project ----------
  await pa.selectOption('[data-export-csv-digits]', 'shown');
  await pa.selectOption('[data-export-csv-form]', 'eng');
  await pa.selectOption('[data-export-ts]', 'MA');
  const proj = await download(pa, '[data-export-project]');
  ok(proj.name === 'smith-chart.smith.json', `the project's name (${proj.name})`);
  const opened = PR.openProject(proj.text);
  ok(opened.project && opened.version === 1 && opened.issues.length === 0, () => `the saved project opens without issues (${opened.message} ${opened.issues.join(' | ')})`);
  if (opened.project) {
    ok(PR.projectLink(opened.project) === search, () => `the project's link is the page's (${PR.projectLink(opened.project)} vs ${search})`);
    const saved = JSON.parse(proj.text).saved;
    ok(PR.projectJson(opened.project, new Date(saved)) === proj.text, 'the project written again is the same text');
    const e = opened.project.exports;
    ok(e.width === 120 && !e.linewidth && e.view === null && e.detail === 'full' && e.colour === 'grey' && e.fontPt === 9 && e.digits === shown && e.form === 'eng' && e.touchstone === 'MA',
      () => `the export settings are the section's (${JSON.stringify(e)})`);
  }
  ok(outside(pa).length === 0, () => `nothing requested while saving (${outside(pa).join(', ')})`);

  // Copy link.
  await pa.click('[data-export-link-copy]');
  await frame(pa);
  const href = await pa.evaluate(() => `${location.origin}${location.pathname}${location.search}`);
  ok((await pa.evaluate(() => navigator.clipboard.readText())) === href && href.endsWith(`?${search}`), 'Copy link puts the page\'s link on the clipboard');
  ok(/Copied the link/.test(await pa.textContent('[data-export-note]')), 'Copy link says so');
  ok(pa.errors.length === 0, () => `data page: no errors (${pa.errors.join(' | ')})`);
  if (shots) {
    await pa.evaluate(() => document.querySelector('[data-export-csv-digits]').scrollIntoView({ block: 'center' }));
    await frame(pa);
    await pa.screenshot({ path: join(shots, 'files-1280-light.png') }).catch(() => {});
  }
  await pa.close();

  // ---------- opening: the picker on a fresh page ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
    const page = await open(ctx, START);
    await toExport(page);
    page.requests.length = 0;
    const before = await searchOf(page);
    await page.setInputFiles('[data-export-open]', { name: 'smith-chart.smith.json', mimeType: 'application/json', buffer: Buffer.from(proj.text) });
    await linkChanged(page, before);
    const got = await searchOf(page);
    ok(got === search, () => `picker: the link is the saved page's (${got})`);
    await page.waitForFunction(() => document.querySelector('[data-export]').smithExport.options?.width === 120, null, { timeout: 5000 }).catch(() => {});
    const o = await page.evaluate(() => document.querySelector('[data-export]').smithExport.options);
    ok(o && o.width === 120 && o.colour === 'grey' && o.fontPt === 9 && o.detail === 'full', () => `picker: the figure's options are the project's (${JSON.stringify(o)})`);
    ok(await page.inputValue('[data-export-csv-form]') === 'eng' && await page.inputValue('[data-export-ts]') === 'MA', 'picker: the CSV form and Touchstone format are the project\'s');
    const n = await note(page);
    ok(n && n.kind === 'opened' && /Opened the project smith-chart\.smith\.json/.test(n.text), () => `picker: the message (${JSON.stringify(n)})`);
    ok(outside(page).length === 0, () => `nothing requested while opening (${outside(page).join(', ')})`);
    if (shots) await page.screenshot({ path: join(shots, 'files-open-1280-dark.png') }).catch(() => {});
    // One undo step: back to the start circuit, and forward again.
    await page.click('[data-undo]');
    await frame(page);
    await page.waitForFunction((b) => window.location.search.slice(1) !== b, search, { timeout: 5000 }).catch(() => {});
    ok(S.sameCircuit(S.decodeCircuit(`?${await searchOf(page)}`).circuit, S.defaultCircuit()), 'Undo gives the circuit before the project back');
    ok(await page.$('[data-undo]:disabled') !== null, 'opening was one undo step');
    await page.click('[data-redo]');
    await frame(page);
    ok(S.sameCircuit(S.decodeCircuit(`?${await searchOf(page)}`).circuit, asked), 'Redo gives the project\'s circuit');
    ok(page.errors.length === 0, () => `picker page: no errors (${page.errors.join(' | ')})`);
    await ctx.close();
  }

  // ---------- opening: a drop, version 0 and version 2 ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await open(ctx, START);
    page.requests.length = 0;
    let before = await searchOf(page);
    const r = await drop(page, 'my project.smith.json', proj.text, 'application/json');
    ok(r.zone && r.taken && !r.after, () => `drop: the drop zone shows while dragging and the drop is taken (${JSON.stringify(r)})`);
    await linkChanged(page, before);
    const gotD = await searchOf(page);
    ok(gotD === search, () => `drop: the link is the saved page's (${gotD})`);
    ok(/Opened the project my project\.smith\.json/.test((await note(page))?.text ?? ''), 'drop: the message names the file');
    // Version 0: a link saved as text.
    before = await searchOf(page);
    await drop(page, 'link.txt', `${base}/smith-chart/main?${LONG}\n`, 'text/plain');
    await linkChanged(page, before);
    const v0 = S.decodeCircuit(`?${await searchOf(page)}`);
    ok(S.sameCircuit(v0.circuit, S.decodeCircuit(`?${LONG}`).circuit) && v0.sweep === null, () => `version 0: the link's circuit, no sweep (${JSON.stringify(v0.issues)})`);
    ok(/Opened the link in link\.txt/.test((await note(page))?.text ?? ''), 'version 0: the message says a link was opened');
    // Version 2: refused, nothing changes.
    before = await searchOf(page);
    const v2 = JSON.stringify({ ...JSON.parse(proj.text), version: 2 });
    await drop(page, 'new.smith.json', v2, 'application/json');
    await page.waitForSelector('[data-file-note="refused"]', { timeout: 5000 }).catch(() => {});
    const n2 = await note(page);
    const msg = PR.openProject(v2).message;
    ok(n2 && n2.kind === 'refused' && n2.text.includes(msg) && /newer version/.test(msg), () => `version 2: its message is shown (${JSON.stringify(n2)})`);
    ok(await searchOf(page) === before, 'version 2: the page is unchanged');
    // An issue: a project with a bad part value is opened and its issue listed under Circuit.
    const bad = JSON.parse(proj.text);
    bad.circuit.parts[0].value = 'banana';
    await drop(page, 'bad.smith.json', JSON.stringify(bad), 'application/json');
    await page.waitForSelector('[data-file-note="opened"]', { timeout: 5000 }).catch(() => {});
    const issue = await page.evaluate(() => document.querySelector('[data-circuit]').textContent);
    ok(/The project file could not be read in full/.test(issue) && /could not be used/.test((await note(page))?.text ?? ''), 'a project with a bad value: its issue is listed and the message says so');
    await page.click('[data-file-note-close]');
    ok(await note(page) === null, 'the message closes');
    ok(outside(page).length === 0, () => `nothing requested while dropping (${outside(page).join(', ')})`);
    ok(page.errors.length === 0, () => `drop page: no errors (${page.errors.join(' | ')})`);
    await ctx.close();
  }

  // ---------- without a sweep; keyboard alone ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const page = await open(ctx, START);
    await toExport(page);
    const off = await page.evaluate(() => ['[data-export-csv="trace"]', '[data-export-csv="markers"]', '[data-export-s1p]'].map((s) => document.querySelector(s).disabled));
    ok(off.every(Boolean) && !(await page.$eval('[data-export-csv="nodes"]', (e) => e.disabled)) && await page.$('[data-export-no-sweep]') !== null,
      () => `no sweep: trace, markers and .s1p are off and say why (${off})`);
    await page.focus('[data-export-csv-digits]');
    const tabTo = async (sel) => {
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab');
        if (await page.evaluate((s) => document.activeElement?.matches(s), sel)) return true;
      }
      return false;
    };
    ok(await tabTo('[data-export-project]'), 'Tab reaches Save project');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.keyboard.press('Enter')]);
    ok(dl.suggestedFilename() === 'smith-chart.smith.json', 'Enter on Save project saves it');
    ok(await tabTo('[data-export-open]'), 'Tab reaches Open project');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), page.keyboard.press('Enter')]);
    ok(chooser !== null, 'Enter on Open project opens the file picker');
    if (chooser) {
      const before = await searchOf(page);
      await chooser.setFiles({ name: 'p.smith.json', mimeType: 'application/json', buffer: Buffer.from(proj.text) });
      await linkChanged(page, before);
      ok(await searchOf(page) === search, 'the project chosen by keyboard opens');
    }
    ok(await tabTo('[data-export-link-copy]'), 'Tab reaches Copy link');
    await page.keyboard.press('Enter');
    await frame(page);
    ok((await page.evaluate(() => navigator.clipboard.readText())) === `${base}/smith-chart/main?${await searchOf(page)}`, 'Enter on Copy link copies the link');
    ok(page.errors.length === 0, () => `keyboard page: no errors (${page.errors.join(' | ')})`);
    await ctx.close();
  }

  // ---------- 320 and 390 px ----------
  for (const width of [320, 390]) {
    const theme = width === 390 ? 'dark' : 'light';
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: theme, hasTouch: true, isMobile: true });
    const page = await open(ctx, STATE);
    await toExport(page);
    await page.evaluate(() => document.querySelector('[data-export-csv-digits]').scrollIntoView({ block: 'start' }));
    await drop(page, 'new.smith.json', JSON.stringify({ ...JSON.parse(proj.text), version: 2 }), 'application/json');
    await page.waitForSelector('[data-file-note]', { timeout: 5000 }).catch(() => {});
    await frame(page);
    const st = await page.evaluate(() => {
      const n = document.querySelector('[data-file-note]').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, left: n.left, right: n.right };
    });
    ok(st.sw <= st.cw, `${width} px: no horizontal scroll (${st.sw} > ${st.cw})`);
    ok(st.left >= 0 && st.right <= st.cw, () => `${width} px: the message fits the screen (${JSON.stringify(st)})`);
    if (shots) await page.screenshot({ path: join(shots, `files-${width}-${theme}.png`) }).catch(() => {});
    ok(page.errors.length === 0, () => `${width} px: no errors (${page.errors.join(' | ')})`);
    await ctx.close();
  }
  await desk.close();
} catch (e) {
  ok(false, `exception: ${e.stack ?? e}`);
} finally {
  await browser.close();
  stopServer();
}

for (const [k, v] of Object.entries(results)) console.log(`${k}: ${v}`);
console.log(`ui-files: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failed ? 1 : 0);
