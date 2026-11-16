// The Trace section's tools in the installed Edge (step M2.3a): the target on the owner's C39 (50R_SE microstrip on
// JLC061611-3313A, 50 Ω) and C41 (LVDS_100R pair w 0.11, s 0.2, Zdiff 100 Ω) equal to lib/emsim/inverse.ts in Node
// for the setup the link holds, with the value within its error; "Use this width" and one undo; an unreachable target
// with the engine's reason; a sweep of the width over 50 points that draws before it ends and equals vary.ts's sweep
// at 3 points; Cancel; Monte Carlo's percentiles and the corners' band and ranking equal to vary.ts in Node for the
// same seed and the placeholder tolerances (components/EmSim/tools.ts); the keyboard (target typed and Enter, the
// cursor by arrow keys) and touch (taps); the times of the inverse, a sweep of 100 and Monte Carlo 1000 at 1×; no
// horizontal scroll at 320, 390 and 1440 px in both themes with each tool open; screenshots `emsim-tools-*`.
//   tsx ui-tools.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLines from '../../../lib/emsim/lines.ts';
import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedInverse from '../../../lib/emsim/inverse.ts';
import * as importedVary from '../../../lib/emsim/vary.ts';
import * as importedTools from '../../../components/EmSim/tools.ts';

const LN = importedLines.default ?? importedLines;
const LK = importedLink.default ?? importedLink;
const INV = importedInverse.default ?? importedInverse;
const V = importedVary.default ?? importedVary;
const TL = importedTools.default ?? importedTools;

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;

let pass = 0;
const fails = [];
const times = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const same = (a, b, tol = 1e-9) => Math.abs(Number(a) - b) <= tol * Math.max(1, Math.abs(b));
const linked = (p) => LK.decodeLink(new URL(p.url()).search).setup;
const mainOf = (r, key) => (!r || !r.ok ? null : key === 'z0' ? r.lines[0].z0 : key === 'zdiff' ? r.pair.zdiff : r.pair.zcm);

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  const solved = async (p = page) => {
    await p.waitForTimeout(30);
    await p.waitForSelector('[data-results]:not([data-stale="true"])', { timeout: 30000 });
  };
  const attr = (sel, a, p = page) => p.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [sel, a]);
  // Waits until the attribute differs from `old` (a new result has arrived).
  const changed = async (sel, a, old, p = page, timeout = 60000) => {
    await p.waitForFunction(([s, n, o]) => { const e = document.querySelector(s); return e && e.getAttribute(n) !== o; }, [sel, a, old], { timeout });
    return attr(sel, a, p);
  };
  const openTool = async (k, p = page) => {
    if ((await attr(`[data-tool-tab="${k}"]`, 'aria-pressed', p)) !== 'true') await p.click(`[data-tool-tab="${k}"]`);
    await p.waitForSelector(`[data-tool="${k}"]`, { state: 'visible', timeout: 30000 });
  };

  // ---- the target on C39 by keyboard: typed and Enter ----
  await page.goto(URL0);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved();
  await openTool('target');
  const target = async (text, what, p = page) => {
    const old = await attr('[data-target-result]', 'data-total', p);
    await p.locator('[data-target-input]').fill(text);
    await p.locator('[data-target-input]').press('Enter');
    await changed('[data-target-result]', 'data-total', old, p);
    const g = async (a) => Number(await attr('[data-target-result]', a, p));
    return { reached: (await attr('[data-target-result]', 'data-reached', p)) === 'true', w: await g('data-w'), s: await g('data-s'), v: await g('data-v'), e: await g('data-e'), ms: await g('data-ms'), what };
  };
  const targetCheck = async (key, value, what) => {
    const s0 = linked(page);
    const t = await target(String(value), what);
    const r = INV.inverse(s0, key, value, 'w');
    const q = mainOf(r.result, key);
    check(t.reached && r.reached && same(t.w, r.w) && same(t.v, q.v) && same(t.e, q.e), `${what}: width ${t.w} and ${key} ${t.v} ± ${t.e} equal the engine's ${r.w}, ${q?.v} ± ${q?.e}`);
    check(Math.abs(t.v - value) <= Math.max(t.e, 1e-6 * value), `${what}: the value reached is the target within its error (|${t.v} − ${value}| ≤ ${t.e})`);
    const shown = await page.locator('[data-target-w]').innerText();
    check(Math.abs(Number(shown) - t.w) <= 1e-3 * t.w, `${what}: the shown width ${shown} mm`);
    times.push([`inverse ${what}`, t.ms]);
    return { t, shown };
  };
  const c39 = await targetCheck('z0', 50, 'C39 target Z0 50 Ω');
  console.log(`  C39: w = ${c39.shown} mm (${c39.t.w}), Z0 ${c39.t.v.toFixed(4)} ± ${c39.t.e.toFixed(4)} Ω, ${c39.t.ms} ms`);

  // ---- "Use this width" and undo ----
  const w0 = linked(page).trace.w.v;
  await page.click('[data-target-use]');
  await solved();
  const w1 = linked(page).trace.w.v;
  check(w1 !== w0 && Math.abs(w1 - Number(c39.shown)) < 1e-12, `"Use this width" puts the shown width in the setup (${w0} → ${w1})`);
  const z1 = Number(await attr('[data-results] [data-q="z0"]', 'data-v'));
  const e1 = Number(await attr('[data-results] [data-q="z0"]', 'data-e'));
  check(Math.abs(z1 - 50) <= e1 + 0.02, `the results show the target after "Use this width" (${z1} ± ${e1} Ω)`);
  check(await page.locator('[data-target-result] [data-old]').count() === 1, 'the target result is marked as made for the earlier setup');
  await page.click('[data-undo]');
  await solved();
  check(linked(page).trace.w.v === w0, `one undo returns the width (${linked(page).trace.w.v})`);

  // ---- an unreachable target ----
  const far = await target('500', 'C39 target 500 Ω');
  const rf = INV.inverse(linked(page), 'z0', 500, 'w');
  const reason = await page.locator('[data-target-reason]').innerText();
  check(!far.reached && !rf.reached && reason === rf.reason && reason.length > 10, `an unreachable target shows the engine's reason ("${reason}")`);

  // ---- a sweep of the width over 50 points: drawn as it goes, equal to the engine, the cursor by keys ----
  await openTool('sweep');
  await page.evaluate(() => {
    window.__seen = [];
    new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target;
        if (el.hasAttribute && el.hasAttribute('data-sweep-result')) window.__seen.push([el.getAttribute('data-state'), Number(el.getAttribute('data-points'))]);
      }
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-points', 'data-state'] });
  });
  const sweepRun = async (points, p = page, tap = false) => {
    await p.locator('[data-sweep-points]').fill(String(points));
    const old = await attr('[data-sweep-result]', 'data-ms', p);
    if (tap) await p.tap('[data-sweep-run]'); else await p.click('[data-sweep-run]');
    await p.waitForFunction((o) => { const e = document.querySelector('[data-sweep-result]'); return e && e.getAttribute('data-state') !== 'running' && e.getAttribute('data-ms') !== o; }, old, { timeout: 60000 });
    return { state: await attr('[data-sweep-result]', 'data-state', p), n: Number(await attr('[data-sweep-result]', 'data-points', p)), ms: Number(await attr('[data-sweep-result]', 'data-ms', p)) };
  };
  const sw = await sweepRun(50);
  const seen = await page.evaluate(() => window.__seen);
  const partial = seen.filter(([s, n]) => s === 'running' && n > 0 && n < 50);
  check(sw.state === 'done' && sw.n === 50, `sweep of 50 done (${sw.state}, ${sw.n})`);
  check(partial.length >= 1, `points drawn before the end (${partial.map(([, n]) => n).join(', ')} of 50 while running)`);
  const rows = await page.$$eval('[data-sweep-table] tr[data-i]', (trs) => trs.map((tr) => ({ x: Number(tr.getAttribute('data-x')), v: Number(tr.querySelector('[data-key="z0"]')?.getAttribute('data-v')), e: Number(tr.querySelector('[data-key="z0"]')?.getAttribute('data-e')) })));
  const node = V.runAll(V.sweep(linked(page), 'w', rows.map((r) => r.x)));
  for (const i of [0, 24, 49]) check(rows[i] && same(rows[i].v, node.points[i].values.z0) && same(rows[i].e, node.points[i].err.z0), `sweep point ${i}: Z0 ${rows[i]?.v} ± ${rows[i]?.e} equals the engine's ${node.points[i].values.z0}`);
  check(await page.locator('[data-plot="sweep-z0"] [data-series="0"]').getAttribute('d').then((d) => d && d.startsWith('M') && !/\./.test(d)), 'the plot path is whole numbers');
  check(await page.locator('[data-plot="sweep-z0"] [data-marker]').count() === 1 && await page.locator('[data-plot="sweep-z0"] [data-band="0"]').count() === 1, 'the current value marked and the error band drawn');
  const box = page.locator('[data-plot="sweep-z0"] [data-plot-box]');
  await box.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  const now = Number(await box.getAttribute('aria-valuenow'));
  const read = await page.locator('[data-plot="sweep-z0"] [data-plot-readout]').innerText();
  const v3 = rows[3].v.toFixed(2);
  check(Math.abs(now - rows[3].x) < 1e-12 && read.includes(v3), `the cursor by keys: Home, 3 × → at point 3 (${now}; "${read}")`);
  const s100 = await sweepRun(100);
  check(s100.state === 'done' && s100.n === 100, 'C39 sweep of 100 done');
  times.push(['sweep of 100, C39', s100.ms]);

  // ---- tolerance on C39: corners, ranking, Monte Carlo ----
  const tolCheck = async (what, key) => {
    await openTool('tolerance');
    await page.waitForSelector('[data-tol-corners]', { timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('[data-tol-corners] [data-old]'), null, { timeout: 60000 });
    const ph = TL.withPlaceholders(linked(page));
    const cr = V.runAll(V.corners(ph.setup));
    const corner = cr.corners.find((c) => c.key === key);
    check(same(await attr('[data-tol-corners]', 'data-lo'), corner.lo) && same(await attr('[data-tol-corners]', 'data-hi'), corner.hi), `${what}: worst case ${corner.lo.toFixed(3)} … ${corner.hi.toFixed(3)} Ω equals the engine's`);
    const ids = await page.$$eval('[data-rank-id]', (li) => li.map((l) => l.getAttribute('data-rank-id')));
    check(ids.join(',') === cr.inputs.map((i) => i.id).join(','), `${what}: the ranking ${ids.slice(0, 3).join(', ')} … equals the engine's order`);
    const old = await attr('[data-mc-result]', 'data-ms');
    await page.click('[data-mc-run]');
    await changed('[data-mc-result]', 'data-ms', old, page, 120000);
    const p = (await attr('[data-mc-result]', 'data-p')).split(',').map(Number);
    const mc = V.runAll(V.monteCarlo(ph.setup, { samples: V.MC_SAMPLES, seed: V.MC_SEED, keys: [key] }));
    const np = mc.stats[key].p;
    check(p.length === 5 && p.every((x, i) => same(x, np[i], 1e-12)), `${what}: Monte Carlo percentiles ${p.map((x) => x.toFixed(3)).join(', ')} equal the engine's ${np.map((x) => x.toFixed(3)).join(', ')}`);
    times.push([`Monte Carlo 1000, ${what}`, Number(await attr('[data-mc-result]', 'data-ms'))]);
    console.log(`  ${what}: ranking ${cr.inputs.slice(0, 4).map((i) => `${i.id} ${i.d[key].toFixed(2)}`).join(', ')}; sd ${mc.stats[key].sd.toFixed(3)} Ω`);
  };
  await tolCheck('C39', 'z0');
  check(await page.locator('[data-tol-note]').innerText().then((t) => /placeholders/.test(t)), 'the band says the tolerances are placeholders');

  // ---- C41: the pair w 0.11, s 0.2 ----
  await page.selectOption('[data-trace-kind]', 'pair-microstrip');
  await solved();
  await page.locator('[data-field="trace.w"] input').first().fill('0.11');
  await page.locator('[data-field="trace.w"] input').first().press('Enter');
  await page.locator('[data-field="trace.s"] input').first().fill('0.2');
  await page.locator('[data-field="trace.s"] input').first().press('Enter');
  await solved();
  check(linked(page).trace.w.v === 0.11 && linked(page).trace.s.v === 0.2, 'C41: the pair 0.11 / 0.2 mm');
  await openTool('target');
  check(await page.locator('[data-target-key]').inputValue() === 'zdiff', 'the pair targets Zdiff');
  const c41 = await targetCheck('zdiff', 100, 'C41 target Zdiff 100 Ω');
  console.log(`  C41: w = ${c41.shown} mm (${c41.t.w}), Zdiff ${c41.t.v.toFixed(4)} ± ${c41.t.e.toFixed(4)} Ω, ${c41.t.ms} ms`);
  await openTool('sweep');
  const p100 = await sweepRun(100);
  check(p100.state === 'done' && p100.n === 100, 'C41 sweep of 100 done');
  times.push(['sweep of 100, C41', p100.ms]);
  // Cancel stops a sweep of 200
  await page.locator('[data-sweep-points]').fill('200');
  await page.click('[data-sweep-run]');
  await page.waitForFunction(() => Number(document.querySelector('[data-sweep-result]')?.getAttribute('data-points')) > 0, null, { timeout: 30000 });
  await page.click('[data-sweep-cancel]');
  await page.waitForTimeout(400);
  const cn = Number(await attr('[data-sweep-result]', 'data-points'));
  check(await attr('[data-sweep-result]', 'data-state') === 'cancelled' && cn > 0 && cn < 200, `Cancel stops the sweep (${cn} of 200)`);
  await page.waitForTimeout(400);
  check(Number(await attr('[data-sweep-result]', 'data-points')) === cn, 'no points arrive after Cancel');
  await tolCheck('C41', 'zdiff');
  // Monte Carlo cancelled with its progress shown (a new width, so the result is not in the client's cache)
  await page.locator('[data-field="trace.w"] input').first().fill('0.115');
  await page.locator('[data-field="trace.w"] input').first().press('Enter');
  await solved();
  await page.click('[data-mc-run]');
  await page.waitForSelector('[data-tool="tolerance"] progress', { timeout: 10000 });
  await page.click('[data-mc-cancel]');
  check(await page.locator('[data-tool="tolerance"] progress').count() === 0 && await page.locator('[data-mc-run]').isEnabled(), 'Monte Carlo shows its progress and Cancel stops it');

  // ---- touch: taps on the tabs, the sweep and the plot ----
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tp = await tctx.newPage();
  tp.on('pageerror', (e) => errors.push(String(e)));
  await tp.goto(URL0);
  await tp.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved(tp);
  await tp.locator('[data-tool-tab="sweep"]').scrollIntoViewIfNeeded();
  await tp.tap('[data-tool-tab="sweep"]');
  await tp.waitForSelector('[data-tool="sweep"]', { state: 'visible', timeout: 30000 });
  const ts = await sweepRun(41, tp, true);
  check(ts.state === 'done' && ts.n === 41, 'a tap runs a sweep at 390 px');
  const svg = tp.locator('[data-plot="sweep-z0"] svg');
  await svg.scrollIntoViewIfNeeded();
  const bb = await svg.boundingBox();
  await tp.touchscreen.tap(bb.x + bb.width * 0.6, bb.y + bb.height / 2);
  await tp.waitForTimeout(100);
  const tr = await tp.locator('[data-plot="sweep-z0"] [data-plot-readout]').innerText();
  check(/Ω/.test(tr) && /trace width/.test(tr), `a tap on the plot reads the values ("${tr}")`);
  await tp.tap('[data-tool-tab="target"]');
  await tp.waitForSelector('[data-tool="target"]', { state: 'visible' });
  await tp.tap('[data-target-solve]');
  await tp.waitForSelector('[data-target-result]', { timeout: 30000 });
  check(await attr('[data-target-result]', 'data-reached', tp) === 'true', 'a tap solves the target');
  await tctx.close();

  // ---- widths, themes, screenshots ----
  if (shots) mkdirSync(shots, { recursive: true });
  const shrink = async (buf) => {
    const p = await ctx.newPage();
    const b64 = await p.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, `data:image/png;base64,${buf.toString('base64')}`);
    await p.close();
    return Buffer.from(b64, 'base64');
  };
  // fresh results in every tool for the pictures (C41 at w 0.115 mm)
  await openTool('target');
  await target('100', 'C41 again');
  await openTool('sweep');
  await sweepRun(51);
  await openTool('tolerance');
  await page.waitForFunction(() => !document.querySelector('[data-tol-corners] [data-old]'), null, { timeout: 60000 });
  await page.click('[data-mc-run]');
  await page.waitForFunction(() => document.querySelector('[data-mc-result]') && !document.querySelector('[data-mc-result] [data-old]'), null, { timeout: 120000 });
  await openTool('sweep');
  await page.locator('[data-plot="sweep-zdiff"] [data-plot-box]').focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const k of ['target', 'sweep', 'tolerance']) {
        await openTool(k);
        await page.waitForTimeout(150);
        const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
        check(sw2 <= width, `no horizontal scroll at ${width} px, ${scheme}, ${k} open (${sw2})`);
        if (shots && width !== 320) {
          // the whole page clipped to the tools (a full-page picture keeps the sticky bar at the top, outside the clip)
          await page.evaluate(() => window.scrollTo(0, 0));
          const b = await page.locator('[data-tools]').boundingBox();
          writeFileSync(join(shots, `emsim-tools-${k}-${width}-${scheme}.png`), await shrink(await page.screenshot({ fullPage: true, clip: { x: 0, y: b.y, width, height: b.height } })));
        }
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log('Times at 1× (page round trip):');
for (const [what, ms] of times) console.log(`  ${what.padEnd(34)} ${ms.toFixed(0).padStart(6)} ms`);
console.log(`ui-tools: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
