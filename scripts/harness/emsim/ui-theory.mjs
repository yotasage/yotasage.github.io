// The EM simulation page's Theory and References sections in the installed Edge (step M2.4c): the Theory chunk and
// KaTeX are not in the first load (no first-load script holds KaTeX's or the theory's text) and load when the nav's
// Theory link is followed; every topic and sub-anchor exists and the contents links reach them; every citation links
// to a References entry and the numbers follow the first citation on the page; the live equations equal
// lib/emsim/eqvalues.ts's emBinding in Node for the linked setup on the default microstrip and the default pair (at
// least 10 numbers from different equations each); a typed width updates the live numbers; the field figures draw;
// no horizontal scroll at 320/390/1440 in both themes; screenshots `emsim-theory-*` of two topics with equations and
// a figure at 390 and 1440 in both themes. M4.3b: the via topics 7–13 (anchors in the contents, their sources cited and
// numbered with the rest), their equations' numbers equal lib/emsim/eqvaluesVia.ts viaBinding in Node for the default
// (C44) via once the Via section has solved it, their figures drawn; screenshots `emsim-theory-via-*`. M7.2d: topic 14,
// full-wave runs (its ten sub-anchors, its eight sources cited and numbered with the rest; in a second Edge with WebGPU
// on: its equations' and "now" lines' numbers equal lib/emsim/eqvaluesWaves.ts wavesBinding of fullwave.preview in Node
// for the default via, the run time the Waves section's estimate; after a run on the GPU the run's frames, ports' Z and
// last frequency; the derivation dialog of a full-wave entry; the three figures drawn in both themes; links into
// #waves); no horizontal scroll with the topic laid out; screenshots `emsim-theory-full-wave-*`, `emsim-theory-fw-*`.
//   tsx ui-theory.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { chromium } from 'playwright-core';

import * as importedLines from '../../../lib/emsim/lines.ts';
import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedStackup from '../../../lib/emsim/stackup.ts';
import * as importedStructure from '../../../lib/emsim/structure.ts';
import * as importedCf from '../../../lib/emsim/closedform.ts';
import * as importedEv from '../../../lib/emsim/eqvalues.ts';
import * as importedEvVia from '../../../lib/emsim/eqvaluesVia.ts';
import * as importedVm from '../../../lib/emsim/viamodel.ts';
import * as importedFw from '../../../lib/emsim/fullwave.ts';
import * as importedEvW from '../../../lib/emsim/eqvaluesWaves.ts';
import * as importedEq from '../../../lib/emsim/equations.ts';

const d = (m) => m.default ?? m;
const LN = d(importedLines), LK = d(importedLink), SU = d(importedSetup), S = d(importedStackup), ST = d(importedStructure);
const CF = d(importedCf), EV = d(importedEv), EVV = d(importedEvVia), VM = d(importedVm);
const FW = d(importedFw), EVW = d(importedEvW), EQ = d(importedEq);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;

const ANCHORS = ['how-to-use', 'transmission-lines', 'field-solver', 'pairs', 'pair-definitions', 'coupling', 'two-speeds',
  'structures', 'trapezoid', 'solder-mask', 'coplanar-ground', 'copper-thickness', 'calculators', 'closed-forms',
  'jlcpcb-calculator', 'tolerances', 'via-line', 'via-pads', 'via-return', 'via-stubs', 'via-tdr', 'via-sparams', 'via-limits',
  'full-wave', 'fw-why', 'fw-yee', 'fw-mesh', 'fw-edges', 'fw-ports', 'fw-cost', 'fw-read', 'fw-pair', 'fw-3d', 'fw-checked',
  'references'];
// M7.2d: topic 14's sources, figures, and the WebGPU flags of ui-waves.mjs for its run
const WAVES_KEYS = ['WikiFDTD', 'OpenEMSDocs', 'Yee1966', 'TafloveHagness2005', 'CFL1928', 'DeyMittra1997', 'RodenGedney2000', 'PiketMay1994'];
const WAVES_FIGURES = ['fw-yee-cell', 'fw-leapfrog', 'fw-conformal'];
const GPU_ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const VIA_KEYS = ['WikiCapacitance', 'Fan2014', 'Kok1993', 'Vardapetyan2020', 'Chada2009', 'Archambeault2004', 'RimoloDonadio2009b',
  'Miller2004', 'SteerVol2', 'Ellingson2018', 'Huddar2021', 'Zhang2020', 'Park2017', 'BockelmanEisenstadt1995', 'Cartier2007', 'Duan2014'];
const VIA_FIGURES = ['via-side', 'via-cut', 'via-pads', 'via-return', 'via-stub-s21', 'via-backdrill', 'via-tdr', 'via-s', 'via-mixed'];

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300));
const linked = (p) => LK.decodeLink(new URL(p.url()).search).setup;
const urlOf = (s) => `${URL0}?${LK.encodeLink(s)}`;
const pairSetup = () => { const s = SU.defaultSetup(); s.trace = { ...ST.presetStructure('pair-microstrip', s.stackup, 0.11), s: S.val(0.2) }; return s; };

// Node's numbers for a setup, as Theory.tsx builds them (the page solves with the worker's default options).
function nodeBinding(s) {
  const r = LN.solveSetup(s);
  const cf = CF.closedForms(s);
  const key = r.n === 2 ? 'zdiff' : 'z0';
  const field = r.n === 2 ? r.pair?.zdiff.v : r.lines[0]?.z0.v;
  const f = r.n <= 2 ? cf.results.find((x) => x.values[key] !== undefined) : undefined;
  return EV.emBinding({ result: r, kind: s.trace.kind, reduced: cf.reduced, formula: f && field !== undefined ? { value: f.values[key], field } : undefined });
}

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  const scripts = () => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'script' || e.name.endsWith('.js')).map((e) => e.name));
  const textOf = (u) => page.evaluate(async (x) => (await fetch(x)).text(), u);
  const solved = async () => { await page.waitForTimeout(30); await page.waitForSelector('[data-results]:not([data-stale="true"])', { timeout: 30000 }); };

  // ---- the first load: no theory, no KaTeX ----
  await page.goto(URL0);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved();
  const first = await scripts();
  let inFirst = [];
  for (const u of first) {
    const t = await textOf(u);
    if (/KaTeX parse error|Telegrapher|Kirschning and Jansen’s coupled/.test(t)) inFirst.push(u);
  }
  check((await page.locator('#theory').getAttribute('data-loaded')) === 'false' && (await page.locator('[data-theory]').count()) === 0, 'theory not loaded before it is near');
  check(inFirst.length === 0, `no first-load script holds KaTeX or the theory (${inFirst.join(', ')})`);

  // ---- loaded by the nav's link ----
  await page.click('nav[aria-label="Sections"] a[href="#theory"]');
  await page.waitForSelector('[data-theory]', { timeout: 30000 });
  const later = (await scripts()).filter((u) => !first.includes(u));
  let gz = 0, hasKatex = false;
  for (const u of later) { const t = await textOf(u); gz += gzipSync(t, { level: 9 }).length; if (/KaTeX parse error/.test(t)) hasKatex = true; }
  check(hasKatex, `KaTeX arrives with the theory (${later.length} scripts, ${(gz / 1000).toFixed(1)} kB gzip)`);
  console.log(`theory chunks: ${later.length} scripts, ${(gz / 1000).toFixed(1)} kB gzip (with KaTeX and the equations)`);

  // ---- anchors and contents ----
  for (const id of ANCHORS) check(await page.locator(`[id="${id}"]`).count() === 1, `anchor #${id} exists`);
  const hrefs = await page.$$eval('[data-theory-contents] a', (as) => as.map((a) => a.getAttribute('href')));
  check(hrefs.length === ANCHORS.length - 1, `contents has ${hrefs.length} links`);
  check((await page.evaluate((hs) => hs.every((h) => !!document.getElementById(h.slice(1))), hrefs)), 'every contents link has its target');
  for (const id of ['coupling', 'jlcpcb-calculator', 'tolerances', 'fw-cost']) {
    await page.click(`[data-theory-contents] a[href="#${id}"]`);
    await page.waitForTimeout(150);
    const top = await page.evaluate((x) => document.getElementById(x).getBoundingClientRect().top, id);
    check(top >= 0 && top < 160, `contents link reaches #${id} (top ${top.toFixed(0)} px)`);
  }

  // ---- citations: every one resolves, numbered by first citation ----
  const cites = await page.$$eval('[data-theory] [data-cite]', (as) => as.map((a) => ({ key: a.getAttribute('data-cite'), href: a.getAttribute('href'), n: Number(/\[(\d+)/.exec(a.textContent)[1]) })));
  const refs = await page.$$eval('[data-references] li', (ls) => ls.map((l) => l.id));
  const order = [];
  for (const c of cites) if (!order.includes(c.key)) order.push(c.key);
  check(cites.length >= 40, `${cites.length} citations in the theory`);
  check(cites.every((c) => c.href === `#ref-${c.key}` && refs.includes(`ref-${c.key}`)), 'every citation links to its References entry');
  check(cites.every((c) => c.n === order.indexOf(c.key) + 1), 'citations numbered by first citation');
  check(refs.length === order.length && refs.every((id, i) => id === `ref-${order[i]}`), `References lists the ${refs.length} cited sources in that order`);
  const viaCites = await page.$$eval('[data-theory-vias] [data-cite]', (as) => as.map((a) => a.getAttribute('data-cite')));
  check(VIA_KEYS.every((k) => viaCites.includes(k)), `the via topics cite their ${VIA_KEYS.length} sources (${VIA_KEYS.filter((k) => !viaCites.includes(k)).join(', ')})`);
  const wavesCites = await page.$$eval('[data-theory-waves] [data-cite]', (as) => as.map((a) => a.getAttribute('data-cite')));
  check(WAVES_KEYS.every((k) => wavesCites.includes(k)) && wavesCites.length >= 25, `topic 14 cites its ${WAVES_KEYS.length} sources, ${wavesCites.length} citations (${WAVES_KEYS.filter((k) => !wavesCites.includes(k)).join(', ')})`);
  check(WAVES_KEYS.every((k) => cites.some((c) => c.key === k && c.n === order.indexOf(k) + 1)), 'topic 14\'s sources numbered by first citation with the rest');
  check((await page.locator('[data-theory-waves] [data-eq][data-scope="waves"]').count()) === 9, 'topic 14 shows its nine equations');
  const fwLinks = await page.$$eval('[data-theory-waves] a[href^="#"]:not([data-cite])', (as) => as.map((a) => a.getAttribute('href').slice(1)));
  check(fwLinks.length >= 12 && (await page.evaluate((ids) => ids.every((id) => !!document.getElementById(id)), fwLinks)), `every link of topic 14 has its target (${fwLinks.length}: ${[...new Set(fwLinks)].join(', ')})`);
  check((await page.$$eval('[data-fw-link]', (as) => as.map((a) => a.getAttribute('href')))).join(',') === '#waves,#waves,#waves', 'fw-read, fw-pair and fw-3d link to the live player and 3D view in #waves');
  check((await page.locator('#via-limits a[href="#full-wave"]').count()) === 1 && !/later steps/.test(await page.locator('#via-limits').textContent()), 'topic 13 links to topic 14 instead of "later steps"');
  check((await page.locator('[data-theory-vias] [data-eq][data-scope="via"]').count()) >= 25, 'the via topics show their equations');

  // ---- live numbers against Node ----
  const liveCheck = async (what, s, want) => {
    const b = nodeBinding(s);
    const got = await page.$$eval('[data-eq][data-live="true"]:not([data-scope]) [data-sym][data-v]', (es) => es.map((e) => ({ id: e.closest('[data-eq]').getAttribute('data-eq'), sym: e.getAttribute('data-sym'), v: Number(e.getAttribute('data-v')) })));
    const ids = new Set(got.map((g) => g.id));
    let worst = 0, bad = [];
    for (const g of got) { const x = Math.abs(g.v - b[g.sym]) < 1e-12 ? 0 : rel(g.v, b[g.sym]); worst = Math.max(worst, x); if (!(x <= 1e-9)) bad.push(`${g.id}:${g.sym} ${g.v} vs ${b[g.sym]}`); }
    check(bad.length === 0, `${what}: ${got.length} live numbers of ${ids.size} equations equal Node (worst ${worst.toExponential(1)}) ${bad.slice(0, 4).join('; ')}`);
    check(ids.size >= 10, `${what}: at least 10 live equations (${[...ids].join(', ')})`);
    for (const id of want) check(ids.has(id), `${what}: ${id} is live`);
    return got;
  };
  await page.waitForSelector('[data-eq="z0-lc"][data-live="true"]', { timeout: 30000 });
  await liveCheck('default microstrip', linked(page), ['z0-lc', 'delay-lc', 'eeff-c', 'l-c0', 'v-eeff', 'lambda-eeff', 'getsinger', 'getsinger-limit', 'order', 'pct-diff']);
  for (const id of ['zodd-sym', 'kb', 'sens', 'parts-sum']) check((await page.locator(`[data-eq="${id}"]`).getAttribute('data-live')) === 'false', `default microstrip: ${id} printed without numbers`);
  const nowV = async () => Number(await page.locator('[data-theory-now] [data-v]').getAttribute('data-v'));
  const z1 = await nowV();
  check(rel(z1, LN.solveSetup(linked(page)).lines[0].z0.v) < 1e-12, `"your structure now" ${z1} equals Node`);

  // a typed width updates the live numbers
  const wIn = page.locator('[data-field="trace.w"] input').first();
  await wIn.fill('0.2');
  await wIn.press('Tab');
  await solved();
  let z2 = z1;
  for (let i = 0; i < 50 && z2 === z1; i++) { await page.waitForTimeout(100); z2 = await nowV(); }
  check(z2 !== z1 && rel(z2, LN.solveSetup(linked(page)).lines[0].z0.v) < 1e-12, `a typed width updates the theory (${z1} → ${z2})`);
  await liveCheck('microstrip 0.2 mm', linked(page), ['z0-lc', 'getsinger']);

  // the default pair, opened by a link into the theory
  await page.goto(`${urlOf(pairSetup())}#pairs`);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await page.waitForSelector('[data-eq="zodd-sym"][data-live="true"]', { timeout: 30000 });
  const top = await page.evaluate(() => document.getElementById('pairs').getBoundingClientRect().top);
  check(top >= 0 && top < 160, `a link to #pairs opens the theory there (top ${top.toFixed(0)} px)`);
  await liveCheck('default pair', linked(page), ['zodd-sym', 'zeven-sym', 'zdiff-zodd', 'zdd-zc', 'zcc-zc', 'zdiff-b', 'ztdr', 'kb', 'kf', 'fext-pulse', 'eeff-mode', 'mode-skew']);
  check((await page.locator('[data-eq="z0-lc"]').getAttribute('data-live')) === 'false', 'default pair: z0-lc printed without numbers');

  // ---- the figures draw (scrolled through so each mounts) ----
  await page.goto(URL0);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await page.click('nav[aria-label="Sections"] a[href="#theory"]');
  await page.waitForSelector('[data-theory]', { timeout: 30000 });
  for (const f of ['field-lines', 'pair-modes', 'mask']) {
    await page.locator(`[data-figure="${f}"]`).scrollIntoViewIfNeeded();
    let states = [];
    for (let i = 0; i < 120; i++) {
      states = await page.$$eval(`[data-figure="${f}"] [data-field-state]`, (es) => es.map((e) => e.getAttribute('data-field-state')));
      if (states.length && states.every((x) => x === 'done')) break;
      await page.waitForTimeout(250);
    }
    check(states.length >= 1 && states.every((x) => x === 'done'), `figure ${f} drawn (${states.join(', ')})`);
  }
  for (const f of ['ladder', 'parts', 'ranking']) check(await page.locator(`[data-figure="${f}"] svg`).count() >= 1, `figure ${f} present`);
  check((await page.locator('[data-figure="parts"] [data-bar]').count()) === 5, 'the parts figure has four parts and the sum');

  // ---- M4.3b: the via topics' numbers against Node on the default (C44) via, their figures ----
  await page.goto(`${URL0}#via`);
  await page.waitForSelector('[data-via-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
  await page.evaluate(() => { window.location.hash = 'via-line'; });
  await page.waitForSelector('[data-eq="via-section-z"][data-scope="via"][data-live="true"]', { timeout: 60000 });
  {
    const s = linked(page);
    const model = VM.viaModel(s.stackup, s.via, s.trace, { tr: VM.VIA_TR, z0: VM.VIA_Z0, nf: 401 });
    const b = EVV.viaBinding({ model, via: s.via });
    const got = await page.$$eval('[data-eq][data-scope="via"][data-live="true"] [data-sym][data-v]', (es) => es.map((e) => ({ id: e.closest('[data-eq]').getAttribute('data-eq'), sym: e.getAttribute('data-sym'), v: Number(e.getAttribute('data-v')) })));
    const ids = new Set(got.map((g) => g.id));
    let worst = 0;
    const bad = [];
    for (const g of got) { const x = Math.abs(g.v - b[g.sym]) < 1e-12 ? 0 : rel(g.v, b[g.sym]); worst = Math.max(worst, x); if (!(x <= 1e-9)) bad.push(`${g.id}:${g.sym} ${g.v} vs ${b[g.sym]}`); }
    check(got.length > 0 && bad.length === 0, `default via: ${got.length} live numbers of ${ids.size} via equations equal viaBinding in Node (worst ${worst.toExponential(1)}) ${bad.slice(0, 4).join('; ')}`);
    for (const id of ['via-barrel-z', 'via-barrel-delay', 'via-coax', 'via-req', 'via-section-l', 'via-section-c', 'via-section-z', 'via-section-delay', 'via-dc', 'edge-f3', 'edge-band', 'tdr-z', 'lambda8', 'stub-quarter']) check(ids.has(id), `default via: ${id} is live, its result equal to Node`);
    for (const id of ['abcd-line', 's-abcd', 's-db']) check((await page.locator(`[data-eq="${id}"]`).getAttribute('data-live')) === 'true', `default via: ${id} is live (complex values)`);
    for (const id of ['via-section-pair', 'via-pad-coupling', 'via-target']) check((await page.locator(`[data-eq="${id}"]`).getAttribute('data-live')) === 'false', `default via: ${id} printed without numbers, with a note`);
  }
  for (const f of VIA_FIGURES) {
    await page.locator(`[data-figure="${f}"]`).scrollIntoViewIfNeeded();
    let done = 'false';
    for (let i = 0; i < 240 && done !== 'true'; i++) { done = await page.locator(`[data-figure="${f}"] [data-figure-done]`).getAttribute('data-figure-done', { timeout: 1000 }).catch(() => 'false'); if (done !== 'true') await page.waitForTimeout(250); }
    const drawn = await page.locator(`[data-figure="${f}"] svg`).count();
    check(done === 'true' && drawn >= 1, `via figure ${f} drawn (${done}, ${drawn} svg)`);
  }
  check((await page.locator('[data-figure="via-pads"] [data-bar]').count()) === 6, 'the pads figure has a bar per layer of the 0.6/0.3 via');
  check((await page.locator('[data-figure="via-backdrill"] [data-backdrill]').count()) === 1, 'the backdrill figure draws the drilled part');
  {
    const req = Number(await page.locator('[data-figure="via-cut"] [data-req]').getAttribute('data-req'));
    const s = SU.defaultSetup();
    const m = VM.viaModel(s.stackup, s.via, s.trace, { tr: VM.VIA_TR, z0: VM.VIA_Z0, nf: 401 });
    check(rel(req, m.wall.Req) < 1e-12, `the cut's R_eq ${req} equals the model's`);
  }

  // ---- M7.2d: topic 14 against the Waves section's estimate and run, in an Edge with WebGPU on ----
  const gpuBrowser = await chromium.launch({ channel: 'msedge', args: GPU_ARGS });
  const wctx = await gpuBrowser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const wp = await wctx.newPage();
  wp.on('pageerror', (e) => errors.push(String(e)));
  try {
    await wp.goto(`${URL0}#waves`);
    await wp.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
    await wp.evaluate(() => { window.location.hash = 'fw-yee'; });
    await wp.waitForSelector('[data-eq="fdtd-courant"][data-scope="waves"][data-live="true"]', { timeout: 60000 });
    const DEV = { gpu: { ok: false, reason: '' }, js: { backend: 'js' }, mobile: false };
    const pv = FW.preview(SU.defaultSetup(), { kind: 'via', tr: 35e-12, length: 10, backend: 'auto' }, DEV);
    const b = EVW.wavesBinding(pv);
    const seconds = Number(await wp.locator('[data-waves-estimate]').getAttribute('data-seconds'));
    const rate = await wp.$eval('[data-theory-waves] [data-live-text="rate"]', (e) => Number(e.getAttribute('data-v')));
    // the run time and rate are the page's own (its backend's rate), the rest as Node's
    const want = { ...b, R_c: rate, t_run: seconds };
    const waveNums = async () => wp.$$eval('[data-eq][data-scope="waves"][data-live="true"] [data-sym][data-v]', (es) => es.map((e) => ({ id: e.closest('[data-eq]').getAttribute('data-eq'), sym: e.getAttribute('data-sym'), v: Number(e.getAttribute('data-v')) })));
    const cmpEq = (got, w, what) => {
      let worst = 0; const bad = [];
      for (const g of got) { const x = rel(g.v, w[g.sym]); worst = Math.max(worst, x); if (!(x <= 1e-12)) bad.push(`${g.id}:${g.sym} ${g.v} vs ${w[g.sym]}`); }
      const ids = new Set(got.map((g) => g.id));
      check(bad.length === 0 && got.length === 10, `${what}: ${got.length} live numbers of ${ids.size} full-wave equations equal Node (worst ${worst.toExponential(1)}) ${bad.slice(0, 4).join('; ')}`);
      for (const id of ['fdtd-courant', 'fdtd-steps', 'fdtd-cell', 'fdtd-pulse', 'fdtd-cost']) check(ids.has(id), `${what}: ${id} is live`);
    };
    cmpEq(await waveNums(), want, 'default via, estimate');
    for (const id of ['fdtd-update', 'fdtd-dispersion', 'fdtd-waves', 'fdtd-s']) check((await wp.locator(`[data-eq="${id}"]`).getAttribute('data-live')) === 'false', `${id} is a rule, printed without numbers`);
    check(rel(rate * seconds, 1.5 * pv.est.cells * pv.est.steps * pv.ports.length) < 1e-12, `the run time ${seconds.toFixed(2)} s is 1.5 x cells x steps x ports over the page's rate ${rate}`);
    const textWant = (res) => ({
      minCellX: pv.minCell[0], minCellY: pv.minCell[1], minCellZ: pv.minCell[2], dt: pv.est.dt, T: pv.est.T, tauRt: pv.est.tauRt, steps: pv.est.steps,
      hmax: pv.geom.hmax, erMax: pv.geom.erMax, tr: 35e-12, fRun: b.f_run, sigma: b.sigma_p, t0: b.t_0, fS: b.f_S, cells: pv.est.cells, steps2: pv.est.steps,
      ports: pv.ports.length, updates: b.W_u, seconds, rate,
      ...(res ? { frames: res.frames, every: res.every, ...Object.fromEntries(res.z0.map((z, i) => [`z0-${i}`, z])) } : {}),
    });
    const cmpText = async (w, what, n) => {
      const got = await wp.$$eval('[data-theory-waves] [data-live-text]', (es) => es.map((e) => ({ k: e.getAttribute('data-live-text'), v: Number(e.getAttribute('data-v')) })));
      const bad = got.filter((g) => !(g.k in w) || !(rel(g.v, w[g.k]) <= 1e-12)).map((g) => `${g.k} ${g.v} vs ${w[g.k]}`);
      check(bad.length === 0 && got.length === n, `${what}: the ${got.length} numbers of the "now" lines equal Node (${bad.slice(0, 4).join('; ')})`);
    };
    await cmpText(textWant(null), 'default via, estimate', 20);
    // the derivation of a full-wave entry
    await wp.locator('[data-eq-derive-theory="fdtd-courant"]').click();
    const dlg = wp.locator('dialog[data-derive="fdtd-courant"][open]');
    await dlg.waitFor({ timeout: 10000 });
    check(await wp.evaluate(() => document.activeElement?.hasAttribute('data-derive-next')) && (await dlg.getAttribute('aria-labelledby')) === 'em-derive-theory-title', 'Derivation opens the shared dialog with the focus on Next step');
    await dlg.locator('[data-derive-all]').click();
    const nSteps = EQ.EM_EQUATION_BY_ID.get('fdtd-courant').steps.length;
    check(await dlg.locator('[data-derive-step]').count() === nSteps && await dlg.locator('[data-derive-nums]').count() >= 2, `the dialog shows the ${nSteps} steps, those with every quantity bound with numbers`);
    const bind = JSON.parse(await dlg.getAttribute('data-derive-bind'));
    check(bind && rel(bind.Delta_t, b.Delta_t) < 1e-12 && rel(bind.Delta_x, b.Delta_x) < 1e-12, 'the dialog\'s numbers are the estimate\'s');
    await wp.keyboard.press('Escape');
    await wp.waitForTimeout(200);
    check((await wp.locator('dialog[data-derive]').count()) === 0 && await wp.evaluate(() => document.activeElement?.getAttribute('data-eq-derive-theory') === 'fdtd-courant'), 'Escape closes it and gives the focus back to its button');
    // a run on the GPU: the run's own numbers
    await wp.evaluate(() => { window.location.hash = 'waves'; });
    await wp.waitForTimeout(300);
    const gpu = (await wp.locator('[data-waves-estimate]').getAttribute('data-backend')) === 'webgpu';
    check(gpu, 'the Waves section runs on WebGPU here');
    if (gpu) {
      await wp.click('[data-waves-run]');
      await wp.waitForSelector('[data-waves-results][data-stale="false"]', { timeout: 180000 });
      await wp.evaluate(() => { window.location.hash = 'fw-read'; });
      await wp.waitForSelector('[data-waves-now="frames"]', { timeout: 30000 });
      const res = await wp.evaluate(() => { const r = window.__emsimWaves.result; return { frames: r.snap.frames, every: r.snap.every, z0: r.records.ports.map((p) => p.z0), fS: r.nport.f[r.nport.f.length - 1] }; });
      check(res.frames > 100 && res.every > 1 && res.z0.length === 2, `the run recorded ${res.frames} frames, one every ${res.every} steps, ports ${res.z0.map((z) => z.toFixed(2)).join(', ')} ohm`);
      check(rel(res.fS, b.f_S) < 1e-12, `the run's last frequency ${(res.fS / 1e9).toFixed(3)} GHz is 0.816 f_run`);
      const rate2 = await wp.$eval('[data-theory-waves] [data-live-text="rate"]', (e) => Number(e.getAttribute('data-v')));
      const seconds2 = Number(await wp.locator('[data-waves-estimate]').getAttribute('data-seconds'));
      check(rel(rate2 * seconds2, 1.5 * pv.est.cells * pv.est.steps * pv.ports.length) < 1e-12, `after the run the estimate follows the measured rate (${rate2.toExponential(3)}/s)`);
      cmpEq(await waveNums(), { ...b, R_c: rate2, t_run: seconds2, f_S: res.fS }, 'default via, after a run');
      const after = textWant(res); after.seconds = seconds2; after.rate = rate2; after.fS = res.fS;
      await cmpText(after, 'default via, after a run', 24);
    }
    // the figures in both themes
    for (const scheme of ['light', 'dark']) {
      await wp.emulateMedia({ colorScheme: scheme });
      for (const f of WAVES_FIGURES) {
        const el = wp.locator(`[data-figure="${f}"]`);
        await el.scrollIntoViewIfNeeded();
        const r = await el.evaluate((e) => {
          const svg = e.querySelector('svg'), box = svg.getBoundingClientRect();
          const bg = getComputedStyle(document.body).backgroundColor;
          const marks = [...e.querySelectorAll('path, circle, rect')].map((x) => getComputedStyle(x)).filter((c) => (c.fill !== 'none' && c.fill !== bg) || (c.stroke !== 'none' && c.stroke !== bg));
          return { w: box.width, h: box.height, marks: marks.length, texts: e.querySelectorAll('text').length, cut: Number(e.getAttribute('data-cut-edges') ?? 0) };
        });
        check(r.w > 200 && r.h > 80 && r.marks >= 6, `figure ${f} drawn in the ${scheme} theme (${r.w.toFixed(0)} x ${r.h.toFixed(0)} px, ${r.marks} marks)`);
        if (f === 'fw-conformal') check(r.cut >= 12, `the conformal figure marks the ${r.cut} edges the circle cuts`);
      }
    }
    // no horizontal scroll with topic 14 laid out; screenshots of it
    await wp.addStyleTag({ content: 'header { visibility: hidden !important; }' });
    for (const scheme of ['light', 'dark']) {
      await wp.emulateMedia({ colorScheme: scheme });
      for (const width of [320, 390, 1440]) {
        await wp.setViewportSize({ width, height: 900 });
        await wp.locator('#full-wave').scrollIntoViewIfNeeded();
        await wp.waitForTimeout(250);
        const r = await wp.evaluate(() => {
          const t = document.getElementById('full-wave'), vw = document.documentElement.clientWidth;
          const wide = [...t.querySelectorAll('p, figure, svg, [data-eq], h3, h4')].filter((e) => e.getBoundingClientRect().right > vw + 0.5).length;
          return { sw: document.documentElement.scrollWidth, wide };
        });
        check(r.sw <= width && r.wide === 0, `topic 14 at ${width} px, ${scheme}: no horizontal scroll (${r.sw}), nothing past the edge (${r.wide})`);
        if (shots && ((width === 390 && scheme === 'dark') || (width === 1440 && scheme === 'light'))) {
          writeFileSync(join(shots, `emsim-theory-full-wave-${width}-${scheme}.png`), await wp.locator('#full-wave').screenshot());
          for (const sub of ['fw-yee', 'fw-mesh']) writeFileSync(join(shots, `emsim-theory-${sub}-${width}-${scheme}.png`), await wp.locator(`[id="${sub}"]`).screenshot());
        }
      }
    }
  } finally {
    await gpuBrowser.close();
  }

  // ---- widths and themes ----
  const shrink = async (buf) => {
    const p = await ctx.newPage();
    const b64 = await p.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, `data:image/png;base64,${buf.toString('base64')}`);
    await p.close();
    return Buffer.from(b64, 'base64');
  };
  // the pair's page for its topic's screenshots (live numbers); the bar is hidden so it does not cover an element shot
  const pp = await ctx.newPage();
  pp.on('pageerror', (e) => errors.push(String(e)));
  await pp.goto(`${urlOf(pairSetup())}#pair-definitions`);
  await pp.waitForSelector('[data-eq="zodd-sym"][data-live="true"]', { timeout: 30000 });
  for (const p of [page, pp]) await p.addStyleTag({ content: 'header { visibility: hidden !important; }' });
  const shoot = async (p, id, width, scheme) => {
    const el = p.locator(`[id="${id}"]`);
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    for (let i = 0; i < 120; i++) {
      const st = await el.evaluate((e) => [...e.querySelectorAll('[data-field-state]')].map((x) => x.getAttribute('data-field-state')));
      if (st.every((x) => x === 'done')) break;
      await p.waitForTimeout(250);
    }
    writeFileSync(join(shots, `emsim-theory-${id}-${width}-${scheme}.png`), await shrink(await el.screenshot()));
  };
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await pp.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme}, theory open (${sw})`);
      if (shots && width !== 320) {
        await shoot(page, 'transmission-lines', width, scheme);
        await pp.setViewportSize({ width, height: 900 });
        await shoot(pp, 'pair-definitions', width, scheme);
        await shoot(page, 'via-tdr', width, scheme);
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-theory: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
