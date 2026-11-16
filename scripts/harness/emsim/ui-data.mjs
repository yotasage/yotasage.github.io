// The Export section's Data group in the browser (step M8.2a): every data Save gives a download equal to the Node
// writers of lib/emsim/export/ for the same results, date and link (the page's emsimData.last()), the via's results
// equal Node's viaModel, Copy writes the same text to the clipboard; Touchstone .s2p and .s4p; Save project, then Open
// project in a fresh context restores the setup and its link, a drop on the page does too, a broken file shows its
// reason and changes nothing, undo after Open goes back; keys and taps; no horizontal scroll at 320/390/1440 in both
// themes; screenshots of the Data group at 390 and 1440 in both themes.
//   tsx ui-data.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedStructure from '../../../lib/emsim/structure.ts';
import * as importedVia from '../../../lib/emsim/via.ts';
import * as importedVm from '../../../lib/emsim/viamodel.ts';
import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedProject from '../../../lib/emsim/project.ts';
import * as importedCsv from '../../../lib/emsim/export/csv.ts';
import * as importedTs from '../../../lib/emsim/export/touchstone.ts';

const d = (m) => m.default ?? m;
const SU = d(importedSetup), ST = d(importedStructure), VIA = d(importedVia), VM = d(importedVm), LK = d(importedLink), PJ = d(importedProject), CSV = d(importedCsv), TS = d(importedTs);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const dl = mkdtempSync(join(tmpdir(), 'emsim-data-'));

const revive = (x) => {
  if (Array.isArray(x)) return x.map(revive);
  if (x && typeof x === 'object') {
    if (typeof x.num === 'string' && Object.keys(x).length === 1) return Number(x.num);
    if (x.ta && Array.isArray(x.a)) return new globalThis[x.ta](x.a.map(revive));
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, revive(v)]));
  }
  return x;
};
/** The file Node writes for the page's last made data. */
function nodeText(last) {
  const raw = revive(last.raw), meta = { date: new Date(last.date), link: last.link };
  if (last.format === 'touchstone') return TS.touchstone(raw.nport, { format: last.numbers, ...meta });
  switch (last.id) {
    case 'trace': return CSV.traceCsv(raw, meta);
    case 'sweep': return CSV.sweepCsv(raw, meta);
    case 'via': return CSV.viaCsv(raw, meta);
    case 'via-tdr': return CSV.tdrCsv(raw, meta);
    case 'via-s': return CSV.sparamCsv(raw.nport, raw.mixed, meta);
    default: throw new Error(`unknown data ${last.id}`);
  }
}
const pairSetup = () => {
  const su = SU.defaultSetup();
  const st = ST.presetStructure('pair-microstrip', su.stackup, 0.11);
  st.s.v = 0.2;
  return { ...su, trace: st, via: VIA.presetVia('pair', su.stackup) };
};
// Equal files, or (where Edge's and Node's Math.log10 and atan2 may differ in the last digit: dB and phase) every
// field equal and every number within 1e-12 relative.
function sameFile(a, b) {
  if (a === b) return true;
  const la = a.split(/\r?\n/), lb = b.split(/\r?\n/);
  if (la.length !== lb.length) return false;
  for (let i = 0; i < la.length; i++) {
    if (la[i] === lb[i]) continue;
    const fa = la[i].split(/[ ,]/), fb = lb[i].split(/[ ,]/);
    if (fa.length !== fb.length) return false;
    for (let k = 0; k < fa.length; k++) {
      if (fa[k] === fb[k]) continue;
      const x = Number(fa[k]), y = Number(fb[k]);
      if (!(fa[k] && fb[k] && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-12 * Math.max(Math.abs(y), 1e-300))) return false;
    }
  }
  return true;
}
const query = (p) => new URL(p.url()).search.replace(/^\?/, '');

const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const open = async (url, c = ctx) => {
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await p.locator('#export').scrollIntoViewIfNeeded();
    await p.waitForSelector('[data-data-ready]', { timeout: 30000 });
    return p;
  };
  const last = (p) => p.evaluate(() => document.querySelector('[data-data-ready]').emsimData.last());
  const options = (p) => p.$$eval('[data-data-set] option', (os) => os.map((o) => o.value));
  const waitSet = (p, id) => p.waitForFunction((k) => !!document.querySelector(`[data-data-set] option[value="${k}"]`), id, { timeout: 60000 });
  const pick = async (p, id) => { await p.selectOption('[data-data-set]', id); await p.waitForSelector(`[data-data-ready][data-set="${id}"]`); };
  const download = async (p, sel, how = 'click') => {
    const [d0] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), how === 'tap' ? p.tap(sel) : how === 'key' ? p.keyboard.press('Enter') : p.click(sel)]);
    const path = join(dl, `${Date.now()}-${d0.suggestedFilename()}`);
    await d0.saveAs(path);
    return { name: d0.suggestedFilename(), text: readFileSync(path, 'utf8'), path };
  };
  const saveEqualsNode = async (p, what, name) => {
    const s = await download(p, '[data-data-save]');
    const l = await last(p);
    const want = nodeText(l);
    check(s.name === name && sameFile(s.text, want), `${what}: the saved ${s.name} equals Node's writer (${s.text === want ? 'byte for byte' : 'dB and phase to 1e-12'}, ${s.text.length} of ${want.length} characters)`);
    return { s, l };
  };
  const clip = (p) => p.evaluate(() => navigator.clipboard.readText()).then((t) => t.replace(/\r\n/g, '\n')); // Windows' clipboard has CR LF

  // ---- 1: the trace's results ----
  const p = await open(`${URL0}#export`);
  await waitSet(p, 'trace');
  check(!(await options(p)).includes('sweep'), `no sweep before one has run (${(await options(p)).join(', ')})`);
  await pick(p, 'trace');
  check(await p.locator('[data-data-format="touchstone"]').isDisabled() && await p.locator('[data-data-numbers="RI"]').isDisabled(), 'Touchstone is offered for the via\'s S-parameters only');
  const tr = await saveEqualsNode(p, 'trace', 'trace-results.csv');
  check(tr.l.link === LK.encodeLink(SU.defaultSetup()) && tr.s.text.includes(`# Setup: https://yotasage.github.io/em-sim/main?${tr.l.link}\r\n`), 'the file names the setup\'s link');
  const [tb] = CSV.readCsv(tr.s.text);
  const z0 = tb.rows.find((x) => x[0] === 'z0');
  check(z0 && Math.abs(Number(z0[2]) - 50) < 10 && Number(z0[3]) > 0, `the trace's Z0 ${z0 && z0[2]} ± ${z0 && z0[3]} Ω`);
  await p.click('[data-data-copy]');
  await p.waitForFunction(() => /copied|allow|clipboard/.test(document.querySelector('[data-data-msg]').textContent), null, { timeout: 10000 });
  check(await clip(p) === nodeText(await last(p)).replace(/\r\n/g, '\n'), `Copy puts the CSV on the clipboard (${await p.textContent('[data-data-msg]')})`);

  // ---- 2: the via ----
  await p.locator('#via').scrollIntoViewIfNeeded();
  await p.waitForSelector('[data-via-plots][data-stale="false"]', { timeout: 60000 });
  await p.locator('#export').scrollIntoViewIfNeeded();
  await waitSet(p, 'via-s');
  const vo = await options(p);
  check(['trace', 'via', 'via-tdr', 'via-s'].every((k) => vo.includes(k)), `the via's data after its solve (${vo.join(', ')})`);
  await pick(p, 'via');
  await saveEqualsNode(p, 'via results', 'via-results.csv');
  await pick(p, 'via-tdr');
  await saveEqualsNode(p, 'via TDR', 'via-tdr.csv');
  await pick(p, 'via-s');
  const vs = await saveEqualsNode(p, 'via S CSV', 'via-s-params.csv');
  {
    const r = revive(vs.l.raw), su = SU.defaultSetup();
    const n = VM.viaModel(su.stackup, su.via, su.trace, { tr: r.tr, z0: r.z0, nf: 401 });
    let worst = 0;
    for (let i = 0; i < n.nport.s.length; i++) worst = Math.max(worst, Math.abs(n.nport.s[i] - r.nport.s[i]));
    check(r.nport.s.length === n.nport.s.length && worst <= 1e-9 && Math.abs(r.lumped.z - n.lumped.z) <= 1e-12 * n.lumped.z, `the page's via S equals Node's viaModel (largest difference ${worst.toExponential(1)})`);
  }
  check(!(await p.locator('[data-data-format="touchstone"]').isDisabled()), 'Touchstone is offered for the S-parameters');
  await p.click('[data-data-format="touchstone"]');
  check(await p.textContent('[data-data-save]') === 'Save .s2p', 'Save says .s2p for one via');
  const s2p = await saveEqualsNode(p, 'via .s2p RI', 'via.s2p');
  const back = TS.readTouchstone(s2p.s.text, 2), np = revive(s2p.l.raw).nport;
  check(back.f.length === np.f.length && back.s.every((x, i) => x === np.s[i]), 'the .s2p reads back to the page\'s S exactly');
  await p.click('[data-data-numbers="DB"]');
  await saveEqualsNode(p, 'via .s2p dB', 'via.s2p');
  await p.click('[data-data-copy]');
  await p.waitForFunction(() => /Touchstone copied/.test(document.querySelector('[data-data-msg]').textContent), null, { timeout: 10000 });
  check(sameFile(await clip(p), nodeText(await last(p))), 'Copy puts the Touchstone on the clipboard');
  await p.click('[data-data-numbers="RI"]');
  await p.click('[data-data-format="csv"]');

  // ---- 3: a sweep ----
  await p.locator('[data-tool-tab="sweep"]').scrollIntoViewIfNeeded();
  await p.click('[data-tool-tab="sweep"]');
  await p.click('[data-sweep-run]');
  await p.waitForSelector('[data-sweep-result][data-state="done"]', { timeout: 60000 });
  await p.locator('#export').scrollIntoViewIfNeeded();
  await waitSet(p, 'sweep');
  await pick(p, 'sweep');
  const sw = await download(p, '[data-data-save]');
  const swl = await last(p);
  check(/^sweep-[\w.-]+\.csv$/.test(sw.name) && sw.text === nodeText(swl) && revive(swl.raw).points.length >= 3, `the sweep saved as ${sw.name} equals Node's (${revive(swl.raw).points.length} points)`);

  // ---- 4: keys ----
  await p.focus('[data-data-set]');
  const before = await p.$eval('[data-data-ready]', (el) => el.getAttribute('data-set'));
  await p.keyboard.press('ArrowUp');
  await p.waitForTimeout(80);
  check(await p.$eval('[data-data-ready]', (el) => el.getAttribute('data-set')) !== before, 'the data set chosen by keys');
  await p.focus('[data-data-save]');
  const kd = await download(p, null, 'key');
  check(kd.name.endsWith('.csv') && kd.text === nodeText(await last(p)), `Save by keys (${kd.name})`);
  check(errors.length === 0, `no page errors so far (${errors.slice(0, 2).join(' | ')})`);
  await p.close();

  // ---- 5: a pair: .s4p; Save project; Copy link ----
  const pair = pairSetup();
  const pp = await open(`${URL0}?${LK.encodeLink(pair)}#export`);
  await pp.locator('#via').scrollIntoViewIfNeeded();
  await pp.waitForSelector('[data-via-plots][data-stale="false"]', { timeout: 60000 });
  await pp.locator('#export').scrollIntoViewIfNeeded();
  await waitSet(pp, 'via-s');
  await pick(pp, 'via-s');
  await saveEqualsNode(pp, 'pair S CSV (mixed-mode too)', 'via-s-params.csv');
  await pp.click('[data-data-format="touchstone"]');
  const s4p = await saveEqualsNode(pp, 'pair .s4p', 'via.s4p');
  check(s4p.s.text.includes('! Port 1: A entry\r\n! Port 2: B entry\r\n! Port 3: A exit\r\n! Port 4: B exit\r\n'), 'the .s4p states its port order');
  const pairLink = query(pp);
  const proj = await download(pp, '[data-project-save]');
  const saved = JSON.parse(proj.text);
  check(proj.name === 'em-sim.emsim.json' && saved.format === PJ.PROJECT_FORMAT && proj.text === PJ.projectJson(LK.decodeLink(pairLink).setup, saved.saved), `Save project: ${proj.name} equals projectJson of the shown setup`);
  await pp.click('[data-project-link]');
  await pp.waitForFunction(() => /Link copied/.test(document.querySelector('[data-project-msg]').textContent), null, { timeout: 10000 });
  check(await clip(pp) === pp.url(), 'Copy link copies the page\'s address');
  await pp.close();

  // ---- 6: Open project in a fresh context, undo, drop, broken files ----
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const fp = await open(`${URL0}#export`, fresh);
  const q0 = query(fp);
  await fp.setInputFiles('[data-project-input]', proj.path);
  await fp.waitForSelector('[data-project-note][data-ok="true"]', { timeout: 30000 });
  await fp.waitForFunction((q) => window.location.search === `?${q}`, pairLink, { timeout: 10000 }).catch(() => {});
  check(query(fp) === pairLink, `Open project restores the setup and its link (${query(fp).slice(0, 60)}…)`);
  check(await fp.locator('[data-undo]').isEnabled(), 'Open is an undo step');
  await fp.click('[data-undo]');
  await fp.waitForTimeout(200);
  check(query(fp) === q0 && await fp.locator('[data-undo]').isDisabled(), `undo after Open goes back to the setup before (${query(fp)})`);
  const drop = (pg, text, name) => pg.evaluate(({ text, name }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], name, { type: 'application/json' }));
    const target = document.querySelector('#trace') ?? document.body;
    target.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, { text, name });
  await drop(fp, proj.text, 'dropped.emsim.json');
  await fp.waitForFunction(() => /dropped\.emsim\.json/.test(document.querySelector('[data-project-note]')?.textContent ?? ''), null, { timeout: 30000 });
  await fp.waitForTimeout(200);
  check(query(fp) === pairLink, 'a project dropped on the page opens it');
  const newer = join(dl, 'newer.emsim.json');
  writeFileSync(newer, JSON.stringify({ format: PJ.PROJECT_FORMAT, version: 99, setup: {} }));
  await fp.setInputFiles('[data-project-input]', newer);
  await fp.waitForSelector('[data-project-note][data-ok="false"]', { timeout: 10000 });
  const why = await fp.textContent('[data-project-note]');
  check(/newer version/.test(why) && query(fp) === pairLink, `a newer project file is refused with its reason and changes nothing (${why})`);
  await drop(fp, '{ this is not json', 'broken.emsim.json');
  await fp.waitForFunction(() => /broken\.emsim\.json/.test(document.querySelector('[data-project-note]')?.textContent ?? ''), null, { timeout: 10000 });
  const why2 = await fp.textContent('[data-project-note]');
  check(/not valid JSON/.test(why2) && query(fp) === pairLink && await fp.getAttribute('[data-project-note]', 'data-ok') === 'false', `a broken file dropped shows its reason (${why2})`);
  await fp.close();
  await fresh.close();

  // ---- 7: touch ----
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'light', acceptDownloads: true });
  const ph = await open(`${URL0}#export`, phone);
  await waitSet(ph, 'trace');
  await ph.locator('[data-data-save]').scrollIntoViewIfNeeded();
  const tp = await download(ph, '[data-data-save]', 'tap');
  check(tp.name === 'trace-results.csv' && tp.text === nodeText(await last(ph)), `Save by a tap (${tp.name})`);
  await ph.locator('[data-project-save]').scrollIntoViewIfNeeded();
  const tpj = await download(ph, '[data-project-save]', 'tap');
  check(tpj.name === 'em-sim.emsim.json' && JSON.parse(tpj.text).format === PJ.PROJECT_FORMAT, 'Save project by a tap');
  await phone.close();

  // ---- 8: no horizontal scroll, screenshots ----
  const shrink = async (buf, c) => {
    const s = await c.newPage();
    const b64 = await s.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      return cv.toDataURL('image/png').split(',')[1];
    }, `data:image/png;base64,${buf.toString('base64')}`);
    await s.close();
    return Buffer.from(b64, 'base64');
  };
  if (shots) mkdirSync(shots, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
    const page = await open(`${URL0}#export`, c2);
    await waitSet(page, 'trace');
    await page.setInputFiles('[data-project-input]', newer);
    await page.waitForSelector('[data-project-note]');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw2 <= width, `no horizontal scroll at ${width} px with the Data group, ${scheme} (${sw2})`);
      if (shots && width !== 320) {
        await page.locator('[data-data-ready]').scrollIntoViewIfNeeded();
        const b = await page.$eval('[data-data-ready]', (el) => { const r = el.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }; });
        writeFileSync(join(shots, `emsim-data-${width}-${scheme}.png`), await shrink(await page.screenshot({ fullPage: true, clip: { x: Math.max(0, b.x - 8), y: b.y, width: b.width + 16, height: b.height + 8 } }), c2));
      }
    }
    await page.close();
    await c2.close();
  }
  check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
} finally {
  await browser.close();
  rmSync(dl, { recursive: true, force: true });
}
console.log(`ui-data: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
if (fails.length) process.exit(1);
