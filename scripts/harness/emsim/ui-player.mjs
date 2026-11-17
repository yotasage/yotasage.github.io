// The Waves section's player in the installed Edge with WebGPU on (step M7.1b; the flags of webgpu/runner.mjs), on the
// LVDS via pair (C45 with the fixture's feeds, as ui-waves.mjs):
// (1) after a run the player holds the run's frames and plays them by itself (not under reduced motion, 6); its views
//     and components are the run's slices; the picture of a frame equals lib/emsim/wavesPlayer.ts in Node on the same
//     frame (the scale from all frames, the raster, the pixels: byte for byte) on three slices; the scale's top stays
//     the same from frame to frame;
// (2) Pause holds, Play advances at about FPS_1X frames a second, 2× twice as fast; the Time slider by keys (Home,
//     arrows, End, Page Down) and by a click picks the frame, its time in ps as the frame's; without Loop the play
//     stops on the last frame; the loop rests while the player is off screen or the tab hidden, and comes back;
// (3) smooth playback at 1440 and 390 px (390 at devicePixelRatio 3, as a phone), at 1× and 4× CPU throttle: rAF
//     intervals and main-thread work per frame over 3 s at 2× (a new frame every display frame), as a table;
//     budget at 1×: interval p95 ≤ 20 ms and work p95 ≤ 4 ms;
// (4) a new run during playback lets go of the frames at once, and its Cancel leaves none; after playback likewise;
//     the GPU buffers held at each run's start stay the same, and the JS heap after GC falls by the frames' bytes;
// (5) a setup change that makes the result stale lets go of the frames (the plots stay);
// (6) reduced motion: no autoplay; no horizontal scroll at 320/390/1440 in both themes; screenshots
//     `emsim-player-390-dark` and `emsim-player-1440-light`, and of the differential drive
//     `emsim-player-modes-390-dark` and `emsim-player-modes-1440-light`;
// M7.2a, the pair's drive: the Drive choice is there for the pair (entry A, differential, common) and not for a single
//     via; each drive's picture equals wavesPlayer.ts in Node (trackOf on entry A's and entry B's frames, the scale,
//     the raster, the pixels) byte for byte; a change of drive keeps the frame and the clock (paused and playing); the
//     scale is fixed over the frames in each drive; the TDR/TDT and S plots do not change with the drive; (3) and (4)
//     play and cancel in the differential drive (its combined frames are freed with the rest).
//   tsx ui-player.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedVia from '../../../lib/emsim/via.ts';
import * as importedWp from '../../../lib/emsim/wavesPlayer.ts';

const d = (m) => m.default ?? m;
const LK = d(importedLink), SU = d(importedSetup), V = d(importedVia), WP = d(importedWp);
const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=d3d11', '--ignore-gpu-blocklist'];

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) { pass++; console.log(`ok   ${what}`); } else { fails.push(what); console.log(`FAIL ${what}`); } };
const pairS = SU.defaultSetup();
const preset = V.presetVia('pair', pairS.stackup);
pairS.via = { ...preset, feeds: [{ ...preset.feeds[0], angle: 180 }, { ...preset.feeds[1], angle: 0 }] };
const URL1 = `${URL0}?${LK.encodeLink(pairS)}#waves`;
const P = '[data-waves-player]';
const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };

const browser = await chromium.launch({ channel: 'msedge', args: ARGS });
const errors = [];
try {
  const newPage = async (opt, url = URL1) => {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', ...opt });
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await p.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
    await p.waitForTimeout(300);
    return p;
  };
  const runToPlayer = async (p) => {
    await p.click('[data-waves-run]');
    await p.waitForSelector(`[data-waves-results][data-stale="false"] ${P}`, { timeout: 180000 });
    await p.locator(P).scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
  };
  const A = (p, a) => p.locator(P).getAttribute(a);
  const frame = async (p) => Number(await A(p, 'data-player-frame'));
  const pause = async (p) => { if ((await A(p, 'data-player-playing')) === 'true') await p.click('[data-player-play]'); await p.waitForTimeout(50); };
  const play = async (p) => { if ((await A(p, 'data-player-playing')) !== 'true') await p.click('[data-player-play]'); };
  const key = async (p, k, n = 1) => { await p.locator('[data-player-time]').focus(); for (let i = 0; i < n; i++) await p.keyboard.press(k); await p.waitForTimeout(30); };

  // ---- 1: the player after a run, its picture against Node ----
  const page = await newPage();
  await runToPlayer(page);
  const nWaves = Number(await page.locator('[data-waves]').getAttribute('data-waves-frames'));
  const n = Number(await A(page, 'data-player-frames'));
  const nB = await page.evaluate(() => document.querySelector('[data-waves-player]').emsimPlayer.store.pair.length);
  check(n > 100 && nB === n && n + nB === nWaves, `the player holds the run's ${n} frames of entry A and ${nB} of entry B (the section's count ${nWaves})`);
  const modes = await page.$$eval('[data-player-mode-set]', (es) => es.map((e) => e.getAttribute('data-player-mode-set')));
  check(modes.join() === 'single,diff,common' && (await A(page, 'data-player-mode')) === 'single', `the pair's drives: ${modes.join(', ')}, entry A first`);
  check((await A(page, 'data-player-playing')) === 'true' && (await A(page, 'data-player-running')) === 'true', 'it plays by itself once in view');
  const views = await page.$$eval('[data-player-view-set]', (es) => es.map((e) => e.getAttribute('data-player-view-set')));
  const comps = await page.$$eval('[data-player-comp-set]', (es) => es.map((e) => e.getAttribute('data-player-comp-set')));
  check(views.join() === 'side,entry,cavity,exit' && comps.join() === 'E,Ez,Ex', `views ${views.join(', ')}; components on the side view ${comps.join(', ')}`);

  // the page's raw frames of the shown component's slices (entry A's and entry B's), its raster and picture
  const pageData = (p) => p.evaluate(() => {
    const e = document.querySelector('[data-waves-player]').emsimPlayer;
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    const pack = (fs) => fs.map((f) => ({ t: f.t, step: f.step, scale: e.src.map((s) => f.scale[s]), data: e.src.map((s) => b64(new Uint8Array(f.data[s].buffer, f.data[s].byteOffset, f.data[s].byteLength))), signed: e.src.map((s) => f.data[s] instanceof Int8Array) }));
    const info = JSON.parse(JSON.stringify({ ...e.raster, c0: 0, c1: 0, cw: 0, r0: 0, r1: 0, rw: 0 }));
    const root = document.querySelector('[data-waves-player]');
    const img = e.off.getContext('2d').getImageData(0, 0, e.off.width, e.off.height).data;
    return {
      src: e.src, mode: e.mode, comp: root.getAttribute('data-player-comp'), shown: e.shown, n: e.frames.length,
      A: pack(e.store.frames), B: pack(e.store.pair), t: e.store.frames.map((f) => f.t),
      raster: info, w: e.off.width, h: e.off.height, img: b64(new Uint8Array(img.buffer)), top: e.ps.top,
    };
  });
  const sliceInfo = (p, si) => p.evaluate((si) => {
    // the result's slice (FdtdResult.snap) as the page has it
    const r = window.__emsimWaves.result.snap;
    const s = r.slices[si];
    return { comp: s.comp, normal: s.normal, at: s.at, nu: s.nu, nv: s.nv, u: Array.from(s.u), v: Array.from(s.v), max: r.max[si] };
  }, si);
  const unpack = (fs) => fs.map((f) => ({ step: f.step, t: f.t, scale: Float32Array.from(f.scale), data: f.data.map((b, k) => { const buf = Buffer.from(b, 'base64'); const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.length); return f.signed[k] ? new Int8Array(u8.buffer, u8.byteOffset, u8.length) : u8.slice(); }) }));
  const nodePicture = async (p) => {
    const g = await pageData(p);
    const s = await sliceInfo(p, g.src[0]);
    const tk = WP.trackOf([unpack(g.A), unpack(g.B)], g.src.map((_, k) => k), g.comp, g.mode, [s.max]);
    const ps = WP.playScale(tk.frames, tk.si, g.comp, tk.max);
    const info = { ...s, u: Float32Array.from(s.u), v: Float32Array.from(s.v) };
    const box = { u0: g.raster.u0, u1: g.raster.u1, v0: g.raster.v0, v1: g.raster.v1 };
    const r = WP.rasterOf(info, g.w, g.h, box);
    const out = new Uint32Array(g.w * g.h);
    WP.framePixels(r, tk.frames[g.shown].data[tk.si], tk.frames[g.shown].scale[tk.si], ps, out);
    const mine = new Uint8Array(out.buffer), theirs = Buffer.from(g.img, 'base64');
    let diff = 0;
    for (let i = 0; i < mine.length; i++) if (mine[i] !== theirs[i]) diff++;
    return { diff, bytes: mine.length, top: ps.top, pageTop: g.top, shown: g.shown, comp: g.comp, mode: g.mode, src: g.src, w: g.w, h: g.h, t: g.t };
  };
  const plots = (p) => p.$$eval('[data-plot^="waves-"]', (es) => es.map((e) => `${e.getAttribute('data-plot')}:${e.innerHTML}`).join('\n'));
  const plots0 = await plots(page);
  await pause(page);
  for (const [v, c, k, m] of [['side', 'E', 60, 'single'], ['side', 'Ez', 140, 'single'], ['cavity', 'Ez', 200, 'single'], ['side', 'E', 90, 'diff'], ['entry', 'Ez', 120, 'common'], ['side', 'Ex', 150, 'diff'], ['cavity', 'Ez', 100, 'diff']]) {
    await page.click(`[data-player-view-set="${v}"]`);
    if (c !== 'Ez' || v === 'side') await page.click(`[data-player-comp-set="${c}"]`).catch(() => {});
    await page.click(`[data-player-mode-set="${m}"]`);
    await key(page, 'Home'); await key(page, 'ArrowRight', 5); await key(page, 'PageDown'); // a frame somewhere in the run
    await page.evaluate((k) => document.querySelector('[data-waves-player]').emsimPlayer.seek(k), k);
    await page.waitForTimeout(50);
    const r = await nodePicture(page);
    check(r.diff === 0 && r.shown === k && r.mode === m, `${v} ${c} ${m} (slices ${r.src}), frame ${r.shown}: the ${r.w}×${r.h} picture equals wavesPlayer.ts in Node (${r.diff} of ${r.bytes} bytes differ)`);
    check(r.top === r.pageTop && Number(await A(page, 'data-player-top')) === r.top, `${v} ${c} ${m}: the scale's top ${WP.siText(r.top, 'V/m')} as Node's from all ${n} frames`);
  }
  // a change of drive keeps the frame and the clock; the scale is fixed over the frames in each drive
  await page.click('[data-player-view-set="side"]'); await page.click('[data-player-comp-set="E"]'); await page.click('[data-player-mode-set="single"]');
  await page.evaluate(() => document.querySelector('[data-waves-player]').emsimPlayer.seek(110));
  const t110 = await page.locator('[data-player-time-text]').textContent();
  const keep = [];
  for (const m of ['diff', 'common', 'single']) {
    await page.click(`[data-player-mode-set="${m}"]`);
    await page.waitForTimeout(50);
    keep.push({ m, f: await frame(page), tt: await page.locator('[data-player-time-text]').textContent(), top: await A(page, 'data-player-top'), note: await page.locator('[data-player-drive-note]').textContent() });
  }
  check(keep.every((x) => x.f === 110 && x.tt === t110), `paused, a change of drive keeps the frame and its time (${keep.map((x) => `${x.m} ${x.f}`).join(', ')}; "${t110}")`);
  check(keep[0].note === 'differential drive: A + 1 V, B − 1 V' && keep[1].note === 'common drive: A + 1 V, B + 1 V' && /entry A driven alone/.test(keep[2].note) && keep[0].top !== keep[2].top,
    `the scale's note says the drive ("${keep[0].note}", "${keep[1].note}") and each drive has its own scale (tops ${keep.map((x) => x.top).join(', ')})`);
  await page.click('[data-player-mode-set="diff"]');
  const dtops = [];
  for (const k of [0, Math.floor(n / 2), n - 1]) { await page.evaluate((k) => document.querySelector('[data-waves-player]').emsimPlayer.seek(k), k); dtops.push(await A(page, 'data-player-top')); }
  check(dtops.every((x) => x === dtops[0]), `differential drive: the scale is the same at frames 0, ${Math.floor(n / 2)} and ${n - 1} (top ${dtops[0]})`);
  await page.click('[data-player-speed-set="1"]');
  await page.evaluate(() => document.querySelector('[data-waves-player]').emsimPlayer.seek(20));
  await play(page);
  await page.waitForTimeout(400);
  const fp = await frame(page), c0 = await page.evaluate(() => document.querySelector('[data-waves-player]').emsimPlayer.pos);
  await page.click('[data-player-mode-set="common"]');
  const c1 = await page.evaluate(() => document.querySelector('[data-waves-player]').emsimPlayer.pos);
  await page.waitForTimeout(300);
  const fq = await frame(page);
  check((await A(page, 'data-player-playing')) === 'true' && c1 >= c0 && c1 - c0 < 10 && fq > fp && fq - fp < 25, `playing, a change of drive keeps the clock (position ${c0.toFixed(1)} → ${c1.toFixed(1)}, frame ${fp} → ${fq} 0.3 s later)`);
  await pause(page);
  check(await plots(page) === plots0, 'the TDR/TDT and S plots are the same in every drive (their markup unchanged)');
  await page.click('[data-player-mode-set="single"]');
  // the scale stays the same from frame to frame
  const tops = [], ticks = [];
  for (const k of [0, Math.floor(n / 2), n - 1]) {
    await page.evaluate((k) => document.querySelector('[data-waves-player]').emsimPlayer.seek(k), k);
    tops.push(await A(page, 'data-player-top'));
    ticks.push(await page.locator('[data-player-scale]').textContent());
  }
  check(tops.every((x) => x === tops[0]) && ticks.every((x) => x === ticks[0]), `the colour scale is the same at frames 0, ${Math.floor(n / 2)} and ${n - 1} (top ${tops[0]})`);

  // ---- 2: transport ----
  await page.click('[data-player-view-set="side"]'); await page.click('[data-player-comp-set="Ez"]');
  await key(page, 'Home');
  check(await frame(page) === 0, 'Home: the first frame');
  await key(page, 'ArrowRight', 5);
  check(await frame(page) === 5, `ArrowRight × 5: frame ${await frame(page)}`);
  await key(page, 'End');
  check(await frame(page) === n - 1, `End: frame ${await frame(page)} of ${n}`);
  await key(page, 'PageDown');
  const pd = await frame(page);
  check(pd < n - 1 && pd >= n - 1 - Math.ceil(n / 5), `Page Down: frame ${pd}`);
  const tt = await page.locator('[data-player-time-text]').textContent();
  const tv = await page.locator('[data-player-time]').getAttribute('aria-valuetext');
  const ts = (await pageData(page)).t;
  check(tt.startsWith(WP.psText(ts[pd])) && tv === WP.psText(ts[pd]) && tt.includes(`frame ${pd + 1} of ${n}`), `the time shown is the frame's: "${tt}"`);
  const sb = await page.locator('[data-player-time]').boundingBox();
  await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.waitForTimeout(50);
  const mid = await frame(page);
  check(Math.abs(mid - (n - 1) / 2) <= n * 0.05, `a click in the slider's middle: frame ${mid}`);
  await page.waitForTimeout(400);
  check(await frame(page) === mid, 'paused, the frame stays');
  const rate = async (speed) => {
    await page.click(`[data-player-speed-set="${speed}"]`);
    await key(page, 'Home');
    await play(page);
    const a = await frame(page), t0 = Date.now();
    await page.waitForTimeout(1500);
    const b = await frame(page), dt = (Date.now() - t0) / 1000;
    await pause(page);
    return ((b - a + n) % n) / dt;
  };
  const r1 = await rate(1), r2 = await rate(2);
  check(r1 > 0.7 * WP.FPS_1X && r1 < 1.3 * WP.FPS_1X, `Play at 1×: ${r1.toFixed(1)} frames/s (FPS_1X ${WP.FPS_1X})`);
  check(r2 / r1 > 1.6 && r2 / r1 < 2.4, `2× plays ${(r2 / r1).toFixed(2)} times as fast (${r2.toFixed(1)} frames/s)`);
  await page.click('[data-player-speed-set="1"]');
  await page.click('[data-player-loop-set]');
  await key(page, 'End'); await key(page, 'ArrowLeft', 6);
  await play(page);
  await page.waitForTimeout(800);
  check((await A(page, 'data-player-playing')) === 'false' && await frame(page) === n - 1 && (await A(page, 'data-player-loop')) === 'false', `without Loop the play stops on the last frame (${await frame(page)})`);
  await page.click('[data-player-loop-set]');
  await play(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const off0 = await frame(page);
  await page.waitForTimeout(500);
  check((await A(page, 'data-player-running')) === 'false' && (await A(page, 'data-player-playing')) === 'true' && await frame(page) === off0, 'off screen the loop rests (still set to play, the frame holds)');
  await page.locator(P).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  check((await A(page, 'data-player-running')) === 'true', 'back in view it plays on');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  const hid = await A(page, 'data-player-running');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  check(hid === 'false' && (await A(page, 'data-player-running')) === 'true', 'a hidden tab rests the loop, shown again it plays on');

  // ---- 3: smooth playback ----
  const timing = async (p, rate) => {
    await p.locator(P).scrollIntoViewIfNeeded();
    await p.click('[data-player-view-set="side"]'); await p.click('[data-player-comp-set="E"]'); await p.click('[data-player-mode-set="diff"]');
    await p.click('[data-player-speed-set="2"]');
    await play(p);
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await p.waitForTimeout(300);
    const s0 = await p.evaluate(() => { const s = document.querySelector('[data-waves-player]').emsimPlayer.stats; return { i: s.intervals.length, w: s.work.length, d: s.draws }; });
    await p.waitForTimeout(3000);
    const s = await p.evaluate((s0) => { const e = document.querySelector('[data-waves-player]').emsimPlayer, s = e.stats; return { iv: s.intervals.slice(-(s.intervals.length - s0.i)), wk: s.work.slice(-(s.work.length - s0.w)), draws: s.draws - s0.d, raster: e.off.width + 'x' + e.off.height, canvas: e.canvas.width + 'x' + e.canvas.height }; }, s0);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    await pause(p);
    await p.click('[data-player-speed-set="1"]');
    return { rate, frames: s.iv.length, draws: s.draws, p50: q(s.iv, 0.5), p95: q(s.iv, 0.95), dropped: s.iv.filter((x) => x > 25).length, w50: q(s.wk, 0.5), w95: q(s.wk, 0.95), raster: s.raster, canvas: s.canvas };
  };
  const rows = [];
  for (const r of [1, 4]) rows.push({ label: '1440 px', ...(await timing(page, r)) });
  const phone = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: 'dark' });
  await runToPlayer(phone);
  for (const r of [1, 4]) rows.push({ label: '390 px, dpr 3', ...(await timing(phone, r)) });
  console.log('  playback at 2× (a new frame every display frame), 3 s, side |E| in the differential drive; ms:');
  console.log('  | width | CPU | canvas | raster | ticks | draws | interval p50 | interval p95 | over 25 ms | work p50 | work p95 |');
  for (const r of rows) {
    console.log(`  | ${r.label} | ${r.rate}× | ${r.canvas} | ${r.raster} | ${r.frames} | ${r.draws} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.dropped} | ${r.w50.toFixed(2)} | ${r.w95.toFixed(2)} |`);
    if (r.rate === 1) check(r.frames > 120 && r.p95 <= 20 && r.w95 <= 4, `${r.label} at 1×: interval p95 ${r.p95.toFixed(1)} ms (budget 20), work p95 ${r.w95.toFixed(2)} ms (budget 4), ${r.dropped} of ${r.frames} intervals over 25 ms`);
    else check(r.frames > 30, `${r.label} at ${r.rate}×: it keeps playing (${r.frames} frames, work p95 ${r.w95.toFixed(2)} ms)`);
  }

  // ---- 4: a new run and its cancel let go of the frames; the GPU buffers and the heap ----
  const cdp = await page.context().newCDPSession(page);
  // the JS heap and the ArrayBuffers' backing stores (the frames' bytes live there), after GC
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100); await cdp.send('HeapProfiler.collectGarbage'); const h = await cdp.send('Runtime.getHeapUsage'); return h.usedSize + (h.backingStorageSize ?? 0); };
  // weak references to the frames: none may stay reachable
  const watch = () => page.evaluate(() => {
    const e = document.querySelector('[data-waves-player]').emsimPlayer, s = e.store;
    window.__weak = [new WeakRef(s.frames), new WeakRef(s.frames[0].data[0]), new WeakRef(s.frames[s.frames.length - 1]), new WeakRef(s.pair[0].data[0]), new WeakRef(e.frames), new WeakRef(e.frames[3].data[0])];
    return { key: e.key, track: !!s.track };
  });
  const alive = () => page.evaluate(() => window.__weak.filter((w) => w.deref() !== undefined).length);
  const bytes = async (p) => p.evaluate(() => {
    const e = document.querySelector('[data-waves-player]')?.emsimPlayer;
    const of = (fs) => fs.reduce((a, f) => a + f.data.reduce((b, x) => b + x.byteLength, 0), 0);
    return e ? of(e.store.frames) + of(e.store.pair) + (e.store.track ? of(e.store.track.frames) : 0) : 0;
  });
  const helds = [];
  const runAndCancel = async (what) => {
    const fb = await bytes(page);
    const w = await watch();
    const h1 = await heap();
    await page.click('[data-waves-run]');
    await page.waitForSelector('[data-waves-held]:not([data-waves-held=""])', { timeout: 60000 });
    const gone = await page.locator(P).count() === 0 && await page.locator('[data-waves-player-gone]').count() === 1;
    await page.waitForFunction(() => Number(document.querySelector('[data-waves-progress]')?.getAttribute('data-waves-progress')) > 0.05, null, { timeout: 60000 });
    helds.push(await page.locator('[data-waves]').getAttribute('data-waves-held'));
    const during = Number(await page.locator('[data-waves]').getAttribute('data-waves-frames'));
    await page.click('[data-waves-cancel]');
    await page.waitForTimeout(800);
    const after = Number(await page.locator('[data-waves]').getAttribute('data-waves-frames'));
    const h2 = await heap();
    check(gone && during > 0 && after === 0 && (await page.locator('[data-waves]').getAttribute('data-waves-phase')) === 'cancelled', `${what}: the new run lets go of the player's frames at once, its cancel of its own (${during} → ${after})`);
    const left = await alive();
    check(left === 0 && h1 - h2 >= 0.8 * fb && w.track && w.key, `${what} (${w.key}): after GC no frame is reachable (${left} of 6 watched: entry A's, entry B's and the combined drive's) and the heap with its buffers falls by ${((h1 - h2) / 1048576).toFixed(1)} MiB, the frames held ${(fb / 1048576).toFixed(1)} MiB`);
  };
  await page.locator(P).scrollIntoViewIfNeeded();
  await play(page);
  await runAndCancel('cancel during playback');
  await runToPlayer(page);
  await page.click('[data-player-mode-set="diff"]');
  await page.click('[data-player-loop-set]');
  await key(page, 'End');
  await page.waitForTimeout(200);
  await runAndCancel('cancel after playback');
  await runToPlayer(page);
  await page.click('[data-player-mode-set="common"]');
  await runAndCancel('again');
  const nb = helds.map((h) => Number(h.split('/')[0]));
  check(nb[0] > 0 && helds.every((h) => h === helds[0]), `the GPU buffers held at each run's start stay the same (${helds.join(', ')})`);
  await cdp.detach();

  // ---- 5: a stale result lets go of its frames ----
  await runToPlayer(page);
  await page.click('[data-waves-tr-set="15"]');
  await page.waitForSelector('[data-waves-results][data-stale="true"] [data-waves-player-gone]', { timeout: 10000 });
  await page.click('[data-waves-tr-set="35"]');
  await page.waitForTimeout(300);
  check(await page.locator(P).count() === 0 && Number(await page.locator('[data-waves]').getAttribute('data-waves-frames')) === 0 && await page.locator('[data-plot="waves-tdr"]').count() === 1,
    'a setup change lets go of the frames (they stay gone when it changes back) and keeps the plots');
  await page.context().close();
  await phone.context().close();

  // ---- 6: reduced motion, widths and themes, screenshots ----
  const rm = await newPage({ reducedMotion: 'reduce' });
  await runToPlayer(rm);
  await rm.waitForTimeout(500);
  check((await A(rm, 'data-player-playing')) === 'false' && (await A(rm, 'data-player-running')) === 'false' && await frame(rm) === 0, 'under reduced motion it waits on the first frame');
  await rm.context().close();
  // a single via (the default C44): no drive to choose, entry A's frames only
  const sv = await newPage({ reducedMotion: 'reduce' }, `${URL0}#waves`);
  await runToPlayer(sv);
  const svn = Number(await A(sv, 'data-player-frames')), svw = Number(await sv.locator('[data-waves]').getAttribute('data-waves-frames'));
  check(await sv.locator('[data-player-mode-set]').count() === 0 && await sv.locator('[data-player-modes]').count() === 0 && (await A(sv, 'data-player-mode')) === '' && svn > 100 && svn === svw
    && /a 1 V pulse at the port/.test(await sv.locator('[data-player-drive-note]').textContent()), `a single via: no drive to choose, ${svn} frames of its one run (${svw} held)`);
  await sv.context().close();
  if (shots) mkdirSync(shots, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    const p = await newPage({ colorScheme: scheme });
    await runToPlayer(p);
    for (const width of [320, 390, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      await p.waitForTimeout(300);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme}, with the player (${sw})`);
      if (shots && ((width === 390 && scheme === 'dark') || (width === 1440 && scheme === 'light'))) {
        await pause(p);
        await p.click('[data-player-view-set="side"]'); await p.click('[data-player-comp-set="Ez"]');
        await p.evaluate(() => document.querySelector('[data-waves-player]').emsimPlayer.seek(52));
        await p.evaluate(() => { const e = document.querySelector('[data-waves-player]'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 70); });
        await p.waitForTimeout(150);
        const buf = await p.locator(P).screenshot();
        const small = await p.evaluate(async (src) => {
          const img = new Image(); img.src = src; await img.decode();
          const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
          return c.toDataURL('image/png').split(',')[1];
        }, `data:image/png;base64,${buf.toString('base64')}`);
        writeFileSync(join(shots, `emsim-player-${width}-${scheme}.png`), Buffer.from(small, 'base64'));
        // the differential drive from above at the entry feed (Ez: odd about the pair's mid-plane)
        await p.click('[data-player-view-set="entry"]'); await p.click('[data-player-mode-set="diff"]');
        await p.evaluate(() => document.querySelector('[data-waves-player]').emsimPlayer.seek(70));
        await p.evaluate(() => { const e = document.querySelector('[data-waves-player]'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 70); });
        await p.waitForTimeout(150);
        const buf2 = await p.locator(P).screenshot();
        const small2 = await p.evaluate(async (src) => {
          const img = new Image(); img.src = src; await img.decode();
          const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
          return c.toDataURL('image/png').split(',')[1];
        }, `data:image/png;base64,${buf2.toString('base64')}`);
        writeFileSync(join(shots, `emsim-player-modes-${width}-${scheme}.png`), Buffer.from(small2, 'base64'));
        await p.click('[data-player-mode-set="single"]');
      }
    }
    await p.context().close();
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-player: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
