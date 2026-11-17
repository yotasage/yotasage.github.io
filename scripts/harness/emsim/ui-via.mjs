// The EM simulation page's Via section in the installed Edge (step M3.1a): the section loads only when it comes near
// (or by #via); the default via (C44: barrel 59.71 ± 0.08 Ω, section 50.23 Ω) and the pair preset (C45: barrel Zdiff
// 92.23 Ω, section 83.49 Ω) equal the engine's viaModel in Node with the page's options (barrel Z or Zdiff/Zcm and
// their errors, the section, ΣΔC and every crossing's ΔC, the stub resonance); typed changes (all antipads, the drill,
// an exit layer that leaves a stub) each equal the engine of the setup the link then holds; a return via added and
// removed; a refused text and a refused via (pad not larger than the drill) with their reasons; the flags
// `return-far` (one return 3 mm away, with its numbers), `no-return` and `stub-resonance`; undo; the link in a fresh
// context; the drawings to scale (barrel width, board thickness, antipad width in px against px/mm); keyboard (Enter,
// Space) and touch at 390 px; the time of one via solve on the page (the model in the worker, budget 30 ms, and the
// round trip); no horizontal scroll at 320/390/1440 in both themes; screenshots `emsim-via-{390,1440}-{light,dark}`.
//   tsx ui-via.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedStackup from '../../../lib/emsim/stackup.ts';
import * as importedVia from '../../../lib/emsim/via.ts';
import * as importedModel from '../../../lib/emsim/viamodel.ts';
import * as importedGeom from '../../../lib/emsim/viaGeom.ts';

const d = (m) => m.default ?? m;
const LK = d(importedLink), SU = d(importedSetup), S = d(importedStackup), V = d(importedVia), VM = d(importedModel), G = d(importedGeom);
const OPT = { tdr: false, nf: 2 }; // the values ViaResults shows do not depend on the TDR or the sweep that ViaSection's viaOpt adds (M3.2a)

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const same = (a, b, rel = 1e-9) => (Number.isNaN(Number(a)) && Number.isNaN(b)) || Number.isFinite(Number(a)) && Math.abs(Number(a) - b) <= rel * Math.max(1e-30, Math.abs(b));
const urlOf = (s, hash = '#via') => `${URL0}?${LK.encodeLink(s)}${hash}`;
const core = (r) => r.pieces.filter((p) => p.part === 'through').sort((a, b) => b.zTop - b.zBot - (a.zTop - a.zBot))[0];
const engineOf = (s) => VM.viaModel(s.stackup, s.via, s.trace, OPT);

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const watch = (p) => p.on('pageerror', (e) => errors.push(String(e)));
  const settled = async (p) => {
    await p.waitForTimeout(40);
    await p.waitForSelector('[data-via-results]:not([data-stale="true"])', { timeout: 60000 });
  };
  const open = async (url, c = ctx) => {
    const p = await c.newPage();
    watch(p);
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await p.waitForSelector('[data-via-results]', { timeout: 30000 });
    await settled(p);
    return p;
  };
  const q = async (p, name) => {
    const el = p.locator(`[data-via-results] [data-via-q="${name}"]`);
    if (!(await el.count())) return null;
    return { v: Number(await el.getAttribute('data-v')), e: Number(await el.getAttribute('data-e')), text: (await el.locator('dd').innerText()).replace(/\s+/g, ' ') };
  };
  const linked = async (p) => { await p.waitForTimeout(150); return LK.decodeLink(new URL(p.url()).search.slice(1)).setup; };
  // The page's values against the engine on the setup its link holds.
  const matches = async (p, what) => {
    const s = await linked(p);
    const r = engineOf(s);
    if (!r.ok) { check(false, `${what}: the engine refuses (${r.reason})`); return null; }
    const c = core(r);
    const rel = Math.abs(r.barrel.zVacErr / r.barrel.zVac);
    if (r.n === 1) {
      const bz = await q(p, 'barrel-z'), sz = await q(p, 'section-z');
      check(bz && same(bz.v, c.z0) && same(bz.e, c.z0 * rel), `${what}: barrel Z ${bz?.text} equals the engine's ${c.z0.toFixed(4)} ± ${(c.z0 * rel).toFixed(4)}`);
      check(sz && same(sz.v, r.lumped.z), `${what}: section √(L/C) ${sz?.text} equals the engine's ${r.lumped.z.toFixed(4)}`);
    } else {
      const bz = await q(p, 'barrel-zdiff'), sz = await q(p, 'section-zdiff'), cm = await q(p, 'section-zcm');
      check(bz && same(bz.v, c.zdiff) && same(bz.e, c.zdiff * Math.abs(r.barrel.zdiffVacErr / r.barrel.zdiffVac)), `${what}: barrel Zdiff ${bz?.text} equals the engine's ${c.zdiff.toFixed(4)}`);
      check(sz && same(sz.v, r.lumped.zdiff) && cm && same(cm.v, r.lumped.zcm), `${what}: section Zdiff ${sz?.text}, Zcm ${cm?.text} equal the engine's ${r.lumped.zdiff.toFixed(4)}, ${r.lumped.zcm.toFixed(4)}`);
    }
    const C = await q(p, 'C');
    check(C && same(C.v, r.lumped.C[0][0] * 1e15), `${what}: C ${C?.text} equals the engine's ${(r.lumped.C[0][0] * 1e15).toFixed(2)} fF`);
    const nodes = await p.$$eval('[data-via-node]', (es) => es.map((e) => [e.getAttribute('data-via-node'), Number(e.getAttribute('data-v'))]));
    const want = r.nodes.filter((n) => n.layer);
    check(nodes.length === want.length && want.every((n, i) => nodes[i][0] === n.layer && same(nodes[i][1], n.dC)), `${what}: ${nodes.length} crossings' ΔC equal the engine's (Σ ${(nodes.reduce((a, x) => a + x[1], 0) * 1e15).toFixed(2)} fF, engine ${(want.reduce((a, n) => a + n.dC, 0) * 1e15).toFixed(2)})`);
    const stubs = await p.$$eval('[data-via-stub-result]', (es) => es.map((e) => [e.getAttribute('data-via-stub-result'), Number(e.getAttribute('data-f')), Number(e.getAttribute('data-f0'))]));
    const real = G.realStubs(s.stackup, s.via, r.stubs);
    if (real.length) check(real.length === stubs.length && real.every((st, i) => stubs[i] && stubs[i][0] === st.side && same(stubs[i][1], st.fRes) && same(stubs[i][2], st.fFormula)), `${what}: stub resonance ${stubs.map((x) => `${x[0]} ${(x[1] / 1e9).toFixed(2)} GHz (bare ${(x[2] / 1e9).toFixed(2)})`).join(', ')} equals the engine's`);
    else check(stubs.length === 1 && stubs[0][0] === 'none', `${what}: no stub, as the engine`);
    const flags = await p.$$eval('[data-via-flag]', (es) => es.map((e) => e.getAttribute('data-via-flag')));
    check(flags.join(',') === r.flags.map((f) => f.code).join(','), `${what}: flags ${flags.join(', ') || 'none'} as the engine's`);
    return { r, s };
  };
  const field = (p, name) => p.locator(`[data-field="${name}"] input`).first();
  const type = async (p, name, text) => { const f = field(p, name); await f.fill(text); await f.press('Enter'); await settled(p); };

  // ---- loading: not in the first view, loaded when near ----
  const p0 = await ctx.newPage();
  watch(p0);
  await p0.goto(URL0);
  await p0.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await p0.waitForTimeout(500);
  check(await p0.locator('#via').getAttribute('data-loaded') === 'false', 'the Via section is not loaded at the top of the page');
  check(await p0.locator('nav a[href="#via"]').count() === 1, 'Via in the section nav');
  await p0.click('nav a[href="#via"]');
  await p0.waitForSelector('[data-via-results]', { timeout: 30000 });
  await settled(p0);
  check(await p0.locator('#via').getAttribute('data-loaded') === 'true', 'the nav link loads it');
  await p0.close();

  // ---- C44 ----
  const page = await open(`${URL0}#via`);
  const c44 = await matches(page, 'C44 default');
  const bz = await q(page, 'barrel-z'), sz = await q(page, 'section-z');
  check(/^59\.71 ± 0\.08 Ω/.test(bz?.text ?? ''), `C44 barrel reads 59.71 ± 0.08 Ω (${bz?.text})`);
  check(/^50\.2\d? ± /.test(sz?.text ?? '') && Math.abs(sz.v - 50.23) < 0.005, `C44 section reads 50.23 Ω (${sz?.text})`);
  check(c44 && Math.abs(c44.r.lumped.dCsum * 1e15 - 90.0) < 0.06, `C44 ΣΔC ${(c44?.r.lumped.dCsum * 1e15).toFixed(2)} fF (facts 90.0)`);
  // Timing: the model in the worker (cached pads), and an edit that needs new pads.
  const msOf = async (p) => [Number(await p.locator('[data-via-results]').getAttribute('data-ms')), Number(await p.locator('[data-via-results]').getAttribute('data-rt'))];
  const t0 = await msOf(page);
  // Drawings to scale.
  const k = Number(await page.locator('[data-via-side]').getAttribute('data-px-per-mm'));
  const brl = await page.locator('[data-via-barrel="A"] rect').first().boundingBox();
  check(Math.abs(brl.width - 0.3 * k) < 1, `side view: the barrel is ${brl.width.toFixed(1)} px wide = drill 0.3 mm × ${k.toFixed(1)} px/mm`);
  const thick = S.stackZ(SU.defaultSetup().stackup)[0];
  check(Math.abs(brl.height - (thick - 2 * 0) * k) < 0.12 * thick * k, `side view: the barrel spans ${brl.height.toFixed(1)} px ≈ the copper-to-copper height`);
  const kt = Number(await page.locator('[data-via-top]').getAttribute('data-px-per-mm'));
  const apb = await page.locator('[data-via-antipad]').first().boundingBox();
  check(Math.abs(apb.width - 1.8 * kt) < 1, `top view: the antipad is ${apb.width.toFixed(1)} px wide = Ø1.8 mm × ${kt.toFixed(1)} px/mm`);
  check(await page.locator('[data-via-top] [data-via-return]').count() === 2, 'top view: two return vias');

  // Typed: all antipads 1.2 mm (one undo step), the drill 0.25 mm.
  await type(page, 'via.antipad-all', '1.2');
  await matches(page, 'all antipads Ø1.2');
  const t1 = await msOf(page);
  await type(page, 'via.drill', '0.25');
  await matches(page, 'drill 0.25');
  const t2 = await msOf(page);
  // Undo twice: back to C44.
  await page.click('[data-undo]'); await settled(page);
  await page.click('[data-undo]'); await settled(page);
  const back = await q(page, 'barrel-z');
  check(back && same(back.v, core(c44.r).z0) && SU.sameSetup(await linked(page), SU.defaultSetup()), `two undos give C44 back (${back?.text})`);

  // A refused text and a refused via.
  const f = field(page, 'via.drill');
  await f.fill('abc');
  check(await page.locator('[data-field="via.drill"] [role="alert"]').count() === 1, 'unreadable drill refused with its reason');
  await f.press('Escape');
  await f.press('Enter');
  await type(page, 'via.drill', '0.7');
  const issues = await page.locator('[data-via-issues] li').allInnerTexts();
  check(issues.some((x) => /not larger than the drill/.test(x)), `a drill of 0.7 under 0.6 pads: "${issues.find((x) => /drill/.test(x))}"`);
  check(await page.locator('[data-via-results]').getAttribute('data-state') === 'invalid' && /not larger than the drill/.test(await page.locator('[data-via-invalid]').innerText()), 'the results say why they are not solved');
  await page.click('[data-undo]'); await settled(page);

  // Return vias: add, then remove.
  await page.click('[data-via-ret-add]'); await settled(page);
  check(await page.locator('[data-via-ret]').count() === 3 && await page.locator('[data-via-top]').getAttribute('data-returns') === '3', 'a return via added (row and drawing)');
  await matches(page, 'three return vias');
  await page.click('[data-via-ret-remove="3"]'); await settled(page);
  check(await page.locator('[data-via-ret]').count() === 2 && SU.sameSetup(await linked(page), SU.defaultSetup()), 'and removed again');

  // Exit on L3: a stub to L6, the stub-resonance flag (C44 exit at L3: 21.9 GHz, 27.5 bare).
  await page.click('[data-via-feed-remove="2"]'); await settled(page);
  await page.selectOption('[data-via-exit]', 'L3'); await settled(page);
  const stub = await matches(page, 'exit on L3');
  check(stub && G.realStubs(stub.s.stackup, stub.s.via, stub.r.stubs).length === 1 && Math.abs(G.realStubs(stub.s.stackup, stub.s.via, stub.r.stubs)[0].fRes / 1e9 - 21.9) < 0.2, `exit-L3 stub ${(G.realStubs(stub.s.stackup, stub.s.via, stub.r.stubs)[0]?.fRes / 1e9).toFixed(2)} GHz (notes-M1.7: 21.9 before M1.8b's εr)`);
  check(await page.locator('[data-via-flag="stub-resonance"]').count() === 1, 'the stub-resonance flag with its sentence');
  check(await page.locator('[data-via-side] [data-via-stub]').count() >= 1, 'the stub drawn in the side view');
  await page.check('[data-via-backdrill-on]'); await settled(page);
  await matches(page, 'backdrilled from the bottom');
  check(await page.locator('[data-via-side] [data-via-backdrill]').count() === 1, 'the backdrill drawn');
  const ms3 = await msOf(page);

  // ---- the link in a fresh context ----
  const url = page.url();
  const want = await linked(page);
  const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const fresh = await open(url, ctx2);
  check(V.sameVia((await linked(fresh)).via, want.via), 'the link gives the same via in a fresh context');
  await matches(fresh, 'linked via in a fresh context');
  await ctx2.close();

  // ---- flags on constructed cases ----
  const far = SU.defaultSetup();
  far.via.returns = [{ ...far.via.returns[0], x: S.val(0), y: S.val(3) }];
  const pf = await open(urlOf(far));
  await matches(pf, 'one return 3 mm away');
  const nums = (await pf.locator('[data-via-flag="return-far"]').getAttribute('data-numbers') ?? '').split(' ').map(Number);
  check(Math.abs(nums[0] - 3) < 1e-9 && nums[1] === 1.5 && /3\.00 mm/.test(await pf.locator('[data-via-flag="return-far"]').innerText()), `return-far with its numbers (${nums.join(', ')})`);
  await pf.click('[data-via-ret-remove="1"]'); await settled(pf);
  check(await pf.locator('[data-via-flag="no-return"]').count() === 1, 'no return via: the no-return flag, not solved');
  await pf.close();

  // ---- C45, the pair preset ----
  await page.click('[data-via-preset="pair"]'); await settled(page);
  const c45 = await matches(page, 'C45 pair preset');
  const zd = await q(page, 'barrel-zdiff');
  check(Math.abs(zd.v - 92.23) < 0.005, `C45 barrel Zdiff ${zd.text} (facts 92.23)`);
  check(c45 && Math.abs(c45.r.lumped.zdiff - 83.49) < 0.005, `C45 section Zdiff ${c45?.r.lumped.zdiff.toFixed(2)} (facts 83.49)`);
  check(await page.locator('[data-via-assume="antipad-as-round"]').count() === 1, 'the stadium solved as round is said (BL88)');
  check(await page.locator('[data-via-top] [data-via-return]').count() === 6 && await page.locator('[data-via-top] [data-via-pad]').count() === 2, 'top view: two vias and six returns');
  await page.selectOption('[data-via-shape="L2"]', 'joined'); await settled(page);
  check(await page.locator('[data-field="via.bridge.L2"]').count() === 1, 'a joined antipad asks for its bridge');
  await page.click('[data-undo]'); await settled(page);

  // ---- keyboard ----
  const kp = await open(`${URL0}#via`);
  await kp.focus('[data-via-ret-add]');
  await kp.keyboard.press('Enter'); await settled(kp);
  check(await kp.locator('[data-via-ret]').count() === 3, 'Enter on "Add return via" adds one');
  await kp.focus('[data-via-plane="L3"]');
  await kp.keyboard.press('Space'); await settled(kp);
  check(await kp.locator('[data-field="via.antipad.L3"]').count() === 1, 'Space makes L3 a plane, with its antipad');
  await matches(kp, 'L3 a plane too');
  await kp.focus('[data-via-ret-add]');
  await kp.keyboard.press('Control+z'); await settled(kp);
  check(await kp.locator('[data-field="via.antipad.L3"]').count() === 0, 'Ctrl+Z takes it back');
  await kp.close();

  // ---- touch at 390 px ----
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tp = await open(`${URL0}#via`, tctx);
  await tp.locator('[data-via-preset="pair"]').scrollIntoViewIfNeeded();
  await tp.tap('[data-via-preset="pair"]'); await settled(tp);
  check(await tp.locator('[data-via-kind]').getAttribute('data-via-kind') === 'pair', 'a tap opens the pair');
  await tp.locator('[data-via-backdrill-on]').scrollIntoViewIfNeeded();
  await tp.tap('[data-via-backdrill-on]');
  check(/no stub to backdrill/.test(await tp.locator('[data-via-refused]').innerText()) && !(await tp.locator('[data-via-backdrill-on]').isChecked()), 'a tap on Backdrill for a pair without a stub is refused with its reason');
  await tp.locator('[data-via-ret-add]').scrollIntoViewIfNeeded();
  await tp.tap('[data-via-ret-add]'); await settled(tp);
  check(await tp.locator('[data-via-ret]').count() === 7, 'a tap adds a seventh return via');
  await matches(tp, 'pair with a return via added by touch');
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
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme} (${sw})`);
      if (shots && width !== 320) {
        await page.evaluate(() => window.scrollTo(0, 0));
        const box = await page.locator('#via').boundingBox();
        writeFileSync(join(shots, `emsim-via-${width}-${scheme}.png`), await shrink(await page.screenshot({ fullPage: true, clip: { x: 0, y: box.y, width, height: box.height } })));
      }
    }
  }
  console.log(`  via solve on the page: model ${t0[0].toFixed(2)} ms (C44, the first: feeds and pads solved; round trip ${t0[1].toFixed(1)} ms), ${t1[0].toFixed(2)} ms (new antipads; ${t1[1].toFixed(1)}), ${t2[0].toFixed(2)} ms (new drill; ${t2[1].toFixed(1)}), ${ms3[0].toFixed(2)} ms (backdrilled; ${ms3[1].toFixed(1)})`);
  check(Math.max(t1[0], t2[0], ms3[0]) <= 30, 'one via solve within 30 ms after the first (engine.md §10)');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-via: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
