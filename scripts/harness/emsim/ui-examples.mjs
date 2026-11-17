// The EM simulation page's Examples section in the installed Edge (step M4.3b): the section's chunk is not in the first
// load and loads by the nav's link; every example of lib/emsim/examples.ts is there with its links and steps; every
// link (the long JLCPCB ones of 1.6–1.7 kB too), clicked, applies its state in place: the page's setup (read back from
// its address) equals decodeLink of the link in Node, which has no issues, and the page shows no link issues; the
// numbers its examples' steps read from that state's results are on the page to the digits the step gives; undo
// returns to the state before and redo comes back; a link works by Enter and by touch; the links that open an
// equation show its panel; no horizontal scroll at 320/390/1440 in both themes; screenshots `emsim-examples-*` at 390
// and 1440 in both themes.
//   tsx ui-examples.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedEx from '../../../lib/emsim/examples.ts';
import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';

const d = (m) => m.default ?? m;
const EX = d(importedEx), LK = d(importedLink), SU = d(importedSetup);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };

// The step values a page shows as a result number: engine key → the number's section and name (eqLinks.tsx).
const SHOWN = {
  'lines[0].z0': ['trace', 'z0'], 'lines[0].eeff': ['trace', 'eeff'], 'lines[0].delay': ['trace', 'delay'],
  'pair.zdiff': ['trace', 'zdiff'], 'pair.zcm': ['trace', 'zcm'], 'pair.zodd': ['trace', 'zodd'], 'pair.zeven': ['trace', 'zeven'],
  'lumped.z': ['via', 'section-z'], 'lumped.zdiff': ['via', 'section-zdiff'], 'lumped.zcm': ['via', 'section-zcm'], 'lumped.delay': ['via', 'delay'],
};
// The links that open an equation (Examples.tsx OPENS).
const OPENS = { 'ex-microstrip/stackup': 'z0', 'ex-lvds-pair/pair': 'zdiff', 'ex-via-pair/via': 'section-zdiff', 'ex-via-stub/through': 'section-z', 'ex-via-stub/stub': 'stub.exit' };

const queryOf = (l) => l.link.slice(EX.EXAMPLE_PATH.length);
const setupOf = (p) => LK.decodeLink(new URL(p.url()).search).setup;

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL0);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  check((await page.locator('#examples').getAttribute('data-loaded')) === 'false' && (await page.locator('[data-examples]').count()) === 0, 'examples not loaded before they are needed');
  await page.click('nav[aria-label="Sections"] a[href="#examples"]');
  await page.waitForSelector('[data-examples]', { timeout: 30000 });

  // ---- every example with its links and steps ----
  for (const ex of EX.EXAMPLES) {
    check(await page.locator(`[id="${ex.id}"][data-example]`).count() === 1, `example ${ex.id} is there`);
    check(await page.locator(`[id="${ex.id}"] [data-example-link]`).count() === ex.links.length, `${ex.id}: its ${ex.links.length} links`);
    check(await page.locator(`[id="${ex.id}"] [data-example-step]`).count() === ex.steps.length, `${ex.id}: its ${ex.steps.length} steps`);
  }
  // Every link says what it opens: its label, never an internal id in quotes ("Open “w50”").
  {
    const texts = await page.locator('[data-example-link]').allTextContents();
    const want = EX.EXAMPLES.flatMap((e) => e.links.map((l) => `Open ${l.label}`));
    const ids = new Set(EX.EXAMPLES.flatMap((e) => e.links.map((l) => l.name)));
    const bad = texts.filter((t, i) => t !== want[i] || [...ids].some((id) => new RegExp(`[“"'‘]${id}[”"'’]`).test(t)));
    check(texts.length === want.length && bad.length === 0, `${texts.length} example links read “Open ” + their label, none an internal id in quotes ${bad.join('; ')}`);
  }

  // Waits until the page's address holds `want`, then until the numbers of `vals` show (polled: a solve follows).
  const applied = async (p, want, what) => {
    let ok = false;
    for (let i = 0; i < 100 && !ok; i++) { ok = SU.sameSetup(setupOf(p), want); if (!ok) await p.waitForTimeout(100); }
    check(ok, `${what}: the page's setup equals decodeLink in Node`);
    check(await p.locator('[data-link-issues]').count() === 0, `${what}: no link issues shown`);
  };
  const shownValues = async (p, vals, section, what) => {
    if (!vals.length) return;
    const sel = section === 'via' ? '[data-via-results][data-state="done"]:not([data-stale="true"])' : '[data-results][data-state="done"]:not([data-stale="true"])';
    let bad = [];
    for (let i = 0; i < 240; i++) {
      bad = [];
      if (await p.locator(sel).count() === 0) bad.push('not solved');
      else for (const v of vals) {
        const [sec, name] = SHOWN[v.key];
        const el = p.locator(`[data-eq-section="${sec}"][data-eq-open="${name}"]`).first();
        if (await el.count() === 0) { bad.push(`${v.key}: no number`); continue; }
        const x = Number(await el.getAttribute('data-v')) * Number(await el.getAttribute('data-scale'));
        if (x.toFixed(v.digits) !== v.value.toFixed(v.digits)) bad.push(`${v.key} ${x} for ${v.value}`);
      }
      if (!bad.length) break;
      await p.waitForTimeout(250);
    }
    check(bad.length === 0, `${what}: ${vals.length} numbers of its steps shown to their digits ${bad.join('; ')}`);
  };

  // ---- every link by mouse ----
  let longest = 0;
  for (const ex of EX.EXAMPLES) {
    for (const l of ex.links) {
      const key = `${ex.id}/${l.name}`;
      const q = queryOf(l), dec = LK.decodeLink(q);
      longest = Math.max(longest, l.link.length);
      check(dec.issues.length === 0, `${key}: decodes with no issues in Node`);
      const a = page.locator(`[data-example-link="${key}"]`);
      const section = await a.getAttribute('data-section');
      await a.click();
      await applied(page, dec.setup, key);
      const vals = EX.EXAMPLES.flatMap((e) => e.steps.flatMap((s) => s.values))
        .filter((v) => SHOWN[v.key] && (v.link === key || (v.link === l.name && ex.steps.some((s) => s.values.includes(v)))));
      await shownValues(page, vals, section, key);
      if (OPENS[key]) {
        let open = '';
        for (let i = 0; i < 120 && open !== OPENS[key]; i++) { open = await page.locator('[data-eq-panel]').first().getAttribute('data-eq-name').catch(() => ''); if (open !== OPENS[key]) await page.waitForTimeout(250); }
        check(open === OPENS[key], `${key}: opens the equation of ${OPENS[key]} (${open})`);
        await page.keyboard.press('Escape');
      }
    }
  }
  check(longest > 1600, `the longest link (${longest} characters) was among them`);

  // ---- undo and redo ----
  {
    const before = setupOf(page);
    const l = EX.EXAMPLES.find((e) => e.id === 'ex-lvds-pair').links.find((x) => x.name === 'w100');
    await page.locator('[data-example-link="ex-lvds-pair/w100"]').click();
    await applied(page, LK.decodeLink(queryOf(l)).setup, 'w100 again');
    await page.click('[data-undo]');
    let ok = false;
    for (let i = 0; i < 50 && !ok; i++) { ok = SU.sameSetup(setupOf(page), before); if (!ok) await page.waitForTimeout(100); }
    check(ok, 'undo returns to the state before the link');
    await page.click('[data-redo]');
    ok = false;
    for (let i = 0; i < 50 && !ok; i++) { ok = SU.sameSetup(setupOf(page), LK.decodeLink(queryOf(l)).setup); if (!ok) await page.waitForTimeout(100); }
    check(ok, 'redo applies it again');
  }

  // ---- keyboard and touch ----
  {
    const l = EX.EXAMPLES.find((e) => e.id === 'ex-microstrip').links.find((x) => x.name === 'w50');
    await page.locator('[data-example-link="ex-microstrip/w50"]').focus();
    await page.keyboard.press('Enter');
    await applied(page, LK.decodeLink(queryOf(l)).setup, 'Enter on w50');
    const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
    const tp = await tctx.newPage();
    tp.on('pageerror', (e) => errors.push(String(e)));
    await tp.goto(`${URL0}#examples`);
    await tp.waitForSelector('[data-examples]', { timeout: 30000 });
    const lv = EX.EXAMPLES.find((e) => e.id === 'ex-via-stub').links.find((x) => x.name === 'backdrill');
    await tp.locator('[data-example-link="ex-via-stub/backdrill"]').tap();
    await applied(tp, LK.decodeLink(queryOf(lv)).setup, 'a tap on backdrill');
    await tp.waitForSelector('[data-via-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
    const top = await tp.evaluate(() => document.getElementById('via').getBoundingClientRect().top);
    check(top > -20 && top < 140, `a tap takes you to the Via section (top ${top.toFixed(0)} px)`);
    await tctx.close();
  }

  // ---- widths, themes, screenshots ----
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
  await page.addStyleTag({ content: 'header { visibility: hidden !important; }' });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme}, examples open (${sw})`);
      if (shots && width !== 320) {
        for (const id of ['ex-microstrip', 'ex-via-stub']) {
          const el = page.locator(`[id="${id}"]`);
          await el.scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
          writeFileSync(join(shots, `emsim-examples-${id}-${width}-${scheme}.png`), await shrink(await el.screenshot()));
        }
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-examples: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
