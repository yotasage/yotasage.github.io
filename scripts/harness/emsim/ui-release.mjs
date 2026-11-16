// The EM simulation tool's release (step M2.5) in the installed Edge: the main page has a card that links to
// /em-sim/main, in the Electronics category after the Smith chart, with its icon drawn (the plane, the dielectric, the
// trace and two equipotentials, in the card's colour), a description and tags; following the card opens the page. The
// page's status note has the texts of components/EmSim/statusText.ts, its "More" opens the rest. No horizontal scroll on
// / at 320, 390 and 1440 px in both themes; screenshots `emsim-release-home-*` of the Electronics cards (390 and
// 1440 px) and `emsim-release-status-390-*` of the note, light and dark.
//   tsx ui-release.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedStatus from '../../../components/EmSim/statusText.ts';

const d = (m) => m.default ?? m;
const ST = d(importedStatus);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const HREF = '/em-sim/main';

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const norm = (t) => t.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
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

  // ---- the card ----
  const home = await ctx.newPage();
  home.on('pageerror', (e) => errors.push(String(e)));
  await home.goto(`${base}/`);
  const links = home.locator(`a[href="${HREF}"]`);
  check(await links.count() === 1, `one link to ${HREF} on the main page (${await links.count()})`);
  const card = home.locator('li', { has: home.locator(`a[href="${HREF}"]`) }).last();
  const info = await card.evaluate((li) => {
    const svg = li.querySelector('svg');
    const box = svg?.getBoundingClientRect();
    const shapes = svg ? [...svg.querySelectorAll('path, rect, circle')] : [];
    return {
      title: li.querySelector('h2')?.textContent ?? '',
      category: li.children[1]?.textContent ?? '',
      text: li.querySelector('p')?.textContent ?? '',
      tags: [...li.querySelectorAll('ul li')].map((t) => t.textContent),
      svg: box ? { w: box.width, h: box.height } : null,
      shapes: shapes.length,
      drawn: shapes.filter((s) => { const b = s.getBBox(); return b.width > 0 || b.height > 0; }).length,
      stroke: svg ? getComputedStyle(svg).color : '',
    };
  });
  check(info.title.startsWith('EM simulation'), `the card's title is "EM simulation" (${info.title})`);
  check(info.category === 'Electronics', `the card is in Electronics (${info.category})`);
  check(/impedance/.test(info.text) && /field solver/.test(info.text) && /JLCPCB/.test(info.text) && /KiCad/.test(info.text) && /fields drawn/.test(info.text),
    'the description names the impedance, the field solver, JLCPCB, KiCad and the fields');
  check(info.tags.length >= 5, `the card has its tags (${info.tags.length})`);
  check(info.svg && info.svg.w >= 30 && info.svg.h >= 30, `the icon is drawn at its size (${JSON.stringify(info.svg)})`);
  check(info.shapes >= 5 && info.drawn === info.shapes, `every shape of the icon has a size (${info.drawn} of ${info.shapes})`);
  check(info.stroke === 'rgb(47, 179, 160)', `the icon has the card's colour (${info.stroke})`);
  const order = await home.$$eval('li h2 a', (as) => as.map((a) => a.getAttribute('href')));
  check(order.indexOf(HREF) > order.indexOf('/smith-chart/main') && order.indexOf('/smith-chart/main') >= 0, 'the card comes after the Smith chart');

  // The main page's footer is fixed to the bottom of the window: hidden so it does not cover the cards in the screenshots.
  await home.addStyleTag({ content: 'footer { visibility: hidden !important; }' });
  for (const scheme of ['light', 'dark']) {
    await home.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await home.setViewportSize({ width, height: 900 });
      await home.waitForTimeout(200);
      const sw = await home.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll on / at ${width} px, ${scheme} (${sw})`);
      const cw = await card.evaluate((li) => li.getBoundingClientRect().right);
      check(cw <= width, `the card fits at ${width} px, ${scheme} (right edge ${cw.toFixed(1)})`);
      if (shots && width !== 320) {
        // The Electronics cards: from the first to the last of them.
        const box = await home.evaluate(() => {
          const lis = [...document.querySelectorAll('li')].filter((li) => li.querySelector('h2') && li.children[1]?.textContent === 'Electronics');
          lis[0].scrollIntoView({ block: 'start' });
          const rs = lis.map((li) => li.getBoundingClientRect());
          const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top));
          return { x: x - 8 + window.scrollX, y: y - 8 + window.scrollY, width: Math.max(...rs.map((r) => r.right)) - x + 16, height: Math.max(...rs.map((r) => r.bottom)) - y + 16 };
        });
        await home.waitForTimeout(200);
        writeFileSync(join(shots, `emsim-release-home-${width}-${scheme}.png`), await shrink(await home.screenshot({ clip: box, fullPage: true })));
      }
    }
  }
  await home.emulateMedia({ colorScheme: 'light' });
  await home.setViewportSize({ width: 1440, height: 1000 });
  await links.first().click();
  await home.waitForURL(`**${HREF}`, { timeout: 30000 });
  await home.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  check(true, 'the card opens the page');

  // ---- the status note ----
  const note = home.locator('aside[data-status]');
  check(await note.count() === 1, `one status note on the page (${await note.count()})`);
  const shown = norm(await note.locator('p').first().textContent());
  check(shown === norm(`${ST.STATUS_LEAD} ${ST.STATUS_NOW}`), 'the note\'s first line says what Status.tsx says');
  check(norm(await note.locator('p').nth(1).textContent()) === norm(ST.STATUS_CHECKED), 'the note says how it is checked');
  check(await note.locator('details').evaluate((e) => !e.open), '"More" is closed at first');
  check(!(await note.getByText(ST.STATUS_COMING).isVisible()), 'what comes next is behind "More"');
  await note.locator('summary').click();
  check(await note.getByText(ST.STATUS_ASSUMES).isVisible() && await note.getByText(ST.STATUS_COMING).isVisible(), '"More" shows what it assumes and what comes next');
  check(await note.evaluate((e) => e.getAttribute('aria-label')) === 'Status of this tool', 'the note is labelled for screen readers');
  const top = await home.evaluate(() => {
    const n = document.querySelector('aside[data-status]').getBoundingClientRect().top + window.scrollY;
    const s = document.querySelector('#stackup')?.getBoundingClientRect().top + window.scrollY;
    return { n, s };
  });
  check(top.n < top.s, `the note is above the Stackup section (${top.n.toFixed(0)} < ${top.s.toFixed(0)})`);
  await home.addStyleTag({ content: 'header { visibility: hidden !important; }' });
  for (const scheme of ['light', 'dark']) {
    await home.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390]) {
      await home.setViewportSize({ width, height: 900 });
      await home.waitForTimeout(200);
      const sw = await home.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll on the page at ${width} px with the note open, ${scheme} (${sw})`);
      if (shots && width === 390) {
        await note.scrollIntoViewIfNeeded();
        await home.waitForTimeout(200);
        writeFileSync(join(shots, `emsim-release-status-${width}-${scheme}.png`), await shrink(await note.screenshot()));
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-release: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
if (fails.length) process.exit(1);
