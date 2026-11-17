// The Waves section in the installed Edge with WebGPU on (step M7.1a; the flags of webgpu/runner.mjs): the first load
// has neither the full-wave engine (its WGSL) nor three.js; the estimate the page shows for the LVDS via pair (C45, the
// Via section's pair preset) has the cells, steps and memory of estimate.ts in Node for the same problem; the pair runs
// to the end on WebGPU in the worker within 2× of its estimate, and the TDR and |Sdd| the page plots equal
// lib/emsim/fullwave.ts wavesView in Node on the worker's own result (and the model's curve the via model's); Cancel
// mid-run stops it and the GPU buffers are freed (the same count held at the start of each of three runs after
// the first, every earlier one cancelled); the CPU fallback (the "CPU" choice) runs a 3 mm trace section to the end, its steps within its
// estimate (the C45 pair on the CPU is about 25 min, too long for a check); an oversized case (a 500 mm section on the
// CPU) is refused with its reason; a via without returns gets the suggestion, whose link opens the section on the via;
// no horizontal scroll at 320/390/1440 in both themes; screenshots `emsim-waves-{390,1440}-{light,dark}`.
//   tsx ui-waves.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedVia from '../../../lib/emsim/via.ts';
import * as importedModel from '../../../lib/emsim/viamodel.ts';
import * as importedProblem from '../../../lib/emsim/fdtd/problem.ts';
import * as importedFw from '../../../lib/emsim/fullwave.ts';
import * as importedPlot from '../../../lib/emsim/plot.ts';

const d = (m) => m.default ?? m;
const LK = d(importedLink), SU = d(importedSetup), V = d(importedVia), VM = d(importedModel), PR = d(importedProblem), FW = d(importedFw), PL = d(importedPlot);
const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=d3d11', '--ignore-gpu-blocklist'];

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) { pass++; console.log(`ok   ${what}`); } else { fails.push(what); console.log(`FAIL ${what}`); } };
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const urlOf = (s, hash = '#waves') => `${URL0}?${LK.encodeLink(s)}${hash}`;
const pairS = SU.defaultSetup();
// The C45 fixture's feeds (compare-lib.mjs setups): the preset's run over two return vias (BL161), which the page warns of.
const preset = V.presetVia('pair', pairS.stackup);
pairS.via = { ...preset, feeds: [{ ...preset.feeds[0], angle: 180 }, { ...preset.feeds[1], angle: 0 }] };
const presetS = { ...pairS, via: preset };
const noRet = SU.defaultSetup();
noRet.via = { ...noRet.via, returns: [] };
const TR = 35e-12;

const browser = await chromium.launch({ channel: 'msedge', args: ARGS });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const open = async (url, c = ctx) => {
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    return p;
  };
  const attr = (p, sel, a) => p.locator(sel).first().getAttribute(a);
  const estimate = async (p) => { await p.waitForSelector('[data-waves-estimate="ready"], [data-waves-estimate="none"]', { timeout: 60000 }); await p.waitForTimeout(300); };
  const results = async (p, ms) => p.waitForSelector('[data-waves-results][data-stale="false"]', { timeout: ms });

  // ---- 1: the first load ----
  const scripts = [];
  const p0 = await ctx.newPage();
  p0.on('response', (r) => { if (r.url().endsWith('.js')) scripts.push(r); });
  await p0.goto(URL0);
  await p0.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await p0.waitForTimeout(500);
  let engine = 0, three = 0;
  for (const r of scripts) { const t = await r.text().catch(() => ''); if (t.includes('@workgroup_size')) engine++; if (t.includes('WebGLRenderer')) three++; }
  check(scripts.length > 0 && engine === 0 && three === 0, `the first load (${scripts.length} scripts) has no full-wave kernels (${engine}) and no three.js (${three})`);
  check(await attr(p0, '#waves', 'data-loaded') === 'false', 'the Waves section is not loaded at the top of the page');
  await p0.close();

  // ---- 2: the C45 pair: estimate, the run on WebGPU, the plots against wavesView in Node ----
  const page = await open(urlOf(pairS));
  await estimate(page);
  const b = PR.buildProblem(pairS, 'via', { trMin: TR, precision: 'f32', allocate: false });
  const shown = { cells: Number(await attr(page, '[data-waves-estimate]', 'data-cells')), steps: Number(await attr(page, '[data-waves-estimate]', 'data-steps')), mem: Number(await attr(page, '[data-waves-estimate]', 'data-mem')), runs: Number(await attr(page, '[data-waves-estimate]', 'data-runs')) };
  check(shown.cells === b.est.cells && shown.steps === b.est.steps && shown.mem === b.est.memory.total && shown.runs === 4, `C45 estimate as estimate.ts: ${shown.cells} cells, ${shown.steps} steps, ${(shown.mem / 1048576).toFixed(1)} MiB, ${shown.runs} excitations`);
  const gpu = (await attr(page, '[data-waves-estimate]', 'data-backend')) === 'webgpu';
  check(gpu, `the page chooses WebGPU (${await page.locator('[data-waves-backend]').textContent()})`);
  await page.click('[data-waves-run]');
  await results(page, 180000);
  const el = Number(await attr(page, '[data-waves-results]', 'data-elapsed')), est = Number(await attr(page, '[data-waves-results]', 'data-estimate'));
  check((await attr(page, '[data-waves-results]', 'data-backend')) === 'webgpu' && (await attr(page, '[data-waves-results]', 'data-where')) === 'worker', 'the C45 run went on WebGPU in the worker');
  check(el > 0 && el <= 2 * est, `C45 on WebGPU in ${el.toFixed(2)} s, estimate ${est.toFixed(2)} s (within 2×)`);
  check(Number(await attr(page, '[data-waves]', 'data-waves-frames')) > 10, `snapshot frames kept (${await attr(page, '[data-waves]', 'data-waves-frames')})`);
  const got = await page.evaluate(() => {
    const w = window.__emsimWaves, r = w.result, R = r.records;
    const arr = (x) => Array.from(x);
    return {
      spec: w.spec,
      rec: { ...R, runs: R.runs.map((q) => ({ ...q, rec: arr(q.rec) })) },
      np: { ...r.nport, f: arr(r.nport.f), s: arr(r.nport.s) },
      eeff: r.eeff, status: r.status, notes: r.notes,
    };
  });
  const res = { records: { ...got.rec, runs: got.rec.runs.map((q) => ({ ...q, rec: Float64Array.from(q.rec) })) }, nport: { ...got.np, f: Float64Array.from(got.np.f), s: Float64Array.from(got.np.s) }, eeff: got.eeff, status: got.status, notes: got.notes };
  const dev = { gpu: { ok: false, reason: '' }, js: { backend: 'js' }, mobile: false };
  const pv = FW.preview(pairS, got.spec, dev);
  const q = VM.viaModel(pairS.stackup, pairS.via, pairS.trace, { tr: TR, z0: 50, nf: 401 });
  const view = FW.wavesView(res, pv, pairS, got.spec, q);
  const reading = async (name, steps) => {
    const box = page.locator(`[data-plot="${name}"] [data-plot-box]`);
    await box.focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < steps; i++) await page.keyboard.press('Shift+ArrowRight');
    const r = page.locator(`[data-plot="${name}"] [data-plot-readout]`);
    return { x: Number(await r.getAttribute('data-cursor')), ys: (await r.getAttribute('data-values')).split(' ').map(Number) };
  };
  const ts = Array.from(view.fw.tdr.t);
  for (const [name, xs, fw, qs, tol] of [['waves-tdr', ts, view.fw.tdr.z, view.qs.tdr.z, 1e-6], ['waves-s11', view.f, view.fw.db[0], view.qs.db[0], 1e-6], ['waves-s21', view.f, view.fw.db[1], view.qs.db[1], 1e-6]]) {
    for (const st of [4, 9]) {
      const r = await reading(name, st);
      const a = PL.readAt(xs, Array.from(fw), r.x), m = PL.readAt(xs, Array.from(qs), r.x);
      check(near(r.ys[0], a, tol * Math.max(1, Math.abs(a))) && near(r.ys[1], m, tol * Math.max(1, Math.abs(m))), `${name} at ${r.x.toPrecision(4)}: full-wave ${r.ys[0].toFixed(3)} (Node ${a.toFixed(3)}), model ${r.ys[1].toFixed(3)} (Node ${m.toFixed(3)})`);
    }
  }
  const zMax = Math.max(...Array.from(view.fw.tdr.z).filter((_, i) => ts[i] > 0 && ts[i] < 100e-12));
  console.log(`  C45 Sdd TDR peak ${zMax.toFixed(1)} Ω in 0–100 ps (M6.4c: 102.7–108.2 at the fixture's planes); shift ${view.shift.map((x) => x.toFixed(2)).join(', ')} mm`);
  check(zMax > 95 && zMax < 115, `the C45 Sdd TDR peaks at ${zMax.toFixed(1)} Ω near 100 Ω`);

  // ---- 2b: the preset's feeds over return vias are warned of before the run (BL161) ----
  await page.goto(urlOf(presetS));
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await estimate(page);
  check(await page.locator('[data-waves-note="feed-over-return"]').count() === 4, `the pair preset's four feeds over its return vias are warned of (${await page.locator('[data-waves-note="feed-over-return"]').count()})`);
  await page.goto(urlOf(pairS));
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await estimate(page);
  check(await page.locator('[data-waves-note="feed-over-return"]').count() === 0, 'the fixture feeds get no such warning');

  // ---- 3: Cancel mid-run frees the GPU buffers (three runs, each cancelled) ----
  const helds = [];
  for (let k = 0; k < 4; k++) {
    await page.click('[data-waves-run]');
    await page.waitForSelector('[data-waves-held]:not([data-waves-held=""])', { timeout: 60000 });
    await page.waitForFunction(() => Number(document.querySelector('[data-waves-progress]')?.getAttribute('data-waves-progress')) > 0.05, null, { timeout: 60000 });
    helds.push(await attr(page, '[data-waves-held]', 'data-waves-held'));
    await page.click('[data-waves-cancel]');
    await page.waitForTimeout(1500);
    check((await attr(page, '[data-waves]', 'data-waves-phase')) === 'cancelled', `run ${k + 1} cancelled and stays cancelled`);
  }
  // The first run of a worker also calibrates, which leaves its runner one more staging buffer (its own, freed with it).
  const nb = helds.map((h) => Number(h.split('/')[0]));
  check(gpu && nb[1] > 0 && helds.slice(2).every((h) => h === helds[1]) && nb[0] <= nb[1] + 1, `the GPU buffers held at each run's start stay the same over three cancelled runs (${helds.join(', ')}): a cancelled run frees its own`);
  await page.close();

  // ---- 4: the CPU fallback on a 3 mm trace section; the refusal of a 500 mm one ----
  const cp = await open(urlOf(SU.defaultSetup()));
  await estimate(cp);
  await cp.click('[data-waves-kind-set="trace"]');
  await cp.click('[data-waves-backend-set="js"]');
  const len = cp.locator('#waves-length');
  await len.fill('3'); await len.press('Enter');
  await cp.waitForSelector('[data-waves-estimate="ready"][data-backend="js"]', { timeout: 60000 });
  await cp.waitForTimeout(300);
  console.log(`  CPU 3 mm trace: ${await attr(cp, '[data-waves-estimate]', 'data-cells')} cells, estimate ${Number(await attr(cp, '[data-waves-estimate]', 'data-seconds')).toFixed(0)} s from the table`);
  await cp.click('[data-waves-run]');
  await results(cp, 600000);
  const ce = Number(await attr(cp, '[data-waves-results]', 'data-elapsed')), cs = Number(await attr(cp, '[data-waves-results]', 'data-estimate'));
  check((await attr(cp, '[data-waves-results]', 'data-backend')) === 'js', 'the trace ran on the CPU');
  // The estimate is the stepping's (§11.1); the wall time adds the model, the 2D solves and the calibration.
  const cr = Number(await attr(cp, '[data-waves-results]', 'data-run-s'));
  // The trace runs to its cap (no energy stop) and the CPU's rate from 40 calibration steps spreads about ±15 % (estimates
  // of 48–66 s for runs of 48–50 s): within 1.25× of the estimate.
  check(cr > 0 && cr <= 1.25 * cs, `the 3 mm trace on the CPU: its steps in ${cr.toFixed(1)} s (${ce.toFixed(1)} s in all), estimate ${cs.toFixed(1)} s`);
  check(await cp.locator('[data-plot="waves-s21"] path[data-series="1"]').count() === 1, 'the trace has its line (2D solver) beside the run');
  await len.fill('500'); await len.press('Enter');
  await cp.waitForSelector('[data-waves-estimate][data-refused="true"]', { timeout: 60000 });
  const why = await cp.locator('[data-waves-verdict]').first().textContent();
  check(/min|GiB|MB|MiB/.test(why) && await cp.locator('[data-waves-run]').isDisabled(), `a 500 mm section on the CPU is refused: "${why}"`);
  check(await cp.locator('[data-waves-stale]').count() === 1, 'the earlier result is marked stale');
  await cp.close();

  // ---- 5: the suggestion on a via without returns opens the section ----
  const sp = await open(urlOf(noRet, '#via'));
  await sp.waitForSelector('[data-via-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
  const n = Number(await attr(sp, '[data-waves-suggest]', 'data-waves-suggest'));
  const text = await sp.locator('[data-waves-suggest]').textContent();
  check(n > 0 && /no return via/.test(text), `the via without returns suggests a run: "${text}"`);
  await sp.click('[data-waves-open]');
  await sp.waitForSelector('#waves[data-loaded="true"] [data-waves-kind="via"]', { timeout: 30000 });
  await sp.waitForTimeout(400);
  const top = await sp.locator('#waves').evaluate((e) => e.getBoundingClientRect().top);
  check(top < 400, `the link opens the Waves section on the via (top ${top.toFixed(0)} px)`);
  await sp.close();

  // ---- 6: widths, themes, screenshots (the C45 result) ----
  if (shots) mkdirSync(shots, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
    const p = await open(urlOf(pairS), c2);
    await estimate(p);
    await p.click('[data-waves-run]');
    await results(p, 180000);
    for (const width of [320, 390, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      await p.waitForTimeout(300);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme} (${sw})`);
      if (shots && width !== 320) {
        await p.locator('[data-plot="waves-tdr"] [data-plot-box]').focus();
        await p.keyboard.press('Home');
        for (let i = 0; i < 8; i++) await p.keyboard.press('Shift+ArrowRight');
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.waitForTimeout(100);
        const bb = await p.locator('#waves').boundingBox();
        const buf = await p.screenshot({ fullPage: true, clip: { x: bb.x, y: bb.y, width: bb.width, height: bb.height } });
        const small = await p.evaluate(async (src) => {
          const img = new Image(); img.src = src; await img.decode();
          const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
          return c.toDataURL('image/png').split(',')[1];
        }, `data:image/png;base64,${buf.toString('base64')}`);
        writeFileSync(join(shots, `emsim-waves-${width}-${scheme}.png`), Buffer.from(small, 'base64'));
      }
    }
    await c2.close();
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-waves: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
