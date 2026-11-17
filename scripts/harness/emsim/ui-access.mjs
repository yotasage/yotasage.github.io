// The EM simulation page's access in the installed Edge (step M9.1a, milestones.md M9.1; after the Smith chart's
// ui-a11y.mjs, notes-M9.1.md there):
// - contrast (WCAG 2.2 AA): every colour token pair the page uses, in both themes, from styles/EmSim.module.css (4.5:1
//   for text, 3:1 for the plots' lines, the drawings' handles, form-field edges and the focus ring), printed as a table;
//   then every visible text with every section loaded and every <details> open, its colour over its real background,
//   and every form field's edge, in both themes, on the default trace and via and on the pair;
// - names and roles: the accessibility tree (CDP Accessibility.getFullAXTree) has no unnamed control, region, image or
//   dialog, in several states (as loaded, everything open, the pair, the equation panel and its derivation dialog, both
//   3D views, the player after a full-wave run); headings in order (one h1, no level skipped), landmarks (banner,
//   navigation, main, contentinfo); the toggles carry aria-pressed or aria-expanded, the sliders a value text;
// - live regions: results, probes, plot readouts and a run's progress are polite and calm (no announcement per drag
//   frame, per hover move, per progress message or per animation frame: the live texts are counted while a width and a
//   via handle are dragged, a plot's cursor and a probe are swept, a full-wave run runs and the player plays);
// - keyboard alone: one Tab cycle through the whole page (every stop shows its focus; no trap), then every task by
//   Tab, Enter, Space, arrows, Escape and typing (the table "tasks × keyboard / touch");
// - touch: the same tasks by taps and CDP touch drags at 390 px (hasTouch), and the target sizes (WCAG 2.5.8: 24 × 24
//   CSS px or spaced so that a 24 px circle on each does not touch another's), listed when below;
// - reduced motion: nothing animates by itself (player, 3D idle, :target flashes, transitions) and everything works;
// - 200 % zoom (720 px at 2×) and 320 px reflow (WCAG 1.4.10): no horizontal page scroll, no clipped text, every
//   control on the screen; plots, drawings and wide equations may scroll inside their own box.
// - the via's side drawing (M9.1b): every layer label inside the drawing at 320, 390 and 1440 px and at 200 % zoom.
// Screenshots of focus states at 390 px dark and 1440 px light: `emsim-access-focus-*`.
//   tsx ui-access.mjs [screenshot folder | -] [base URL]      (part of npm run ui)
// M9.1b: EMSIM_BROWSER=firefox or webkit runs it in Playwright's Firefox or WebKit (ui-browsers.mjs does, after the
// Edge run): the accessibility tree is Playwright's aria snapshot there (no CDP), a touch drag is touch PointerEvents
// sent to the element under the finger (Playwright has taps but no touch move outside Chromium), and without WebGPU
// every full-wave run is the CPU's quickest case (the trace 1 mm long at 100 ps), set by the same means as the task.
// Screenshots there carry the browser's name. WebKit's Tab skips links (Safari's default; Option+Tab or "Press Tab to
// highlight each item" reaches them, and Playwright's WebKit has no such setting): there a link is focused by script
// and its focus checked the same way, and the Tab cycle starts at the first control instead of the home link. In
// Firefox Tab after the last stop leaves the page (to the browser's own controls, none in a headless window, so the
// focus falls to the page's body); the cycle then goes on from the top as it would after the browser's controls.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, firefox, webkit } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedVia from '../../../lib/emsim/via.ts';

const d = (m) => m.default ?? m;
const LK = d(importedLink), SU = d(importedSetup), V = d(importedVia);
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=d3d11', '--ignore-gpu-blocklist'];
const ONLY = process.env.EMSIM_ACCESS_ONLY ? new Set(process.env.EMSIM_ACCESS_ONLY.split(',')) : null;
const part = (name) => !ONLY || ONLY.has(name);
const BROWSER = process.env.EMSIM_BROWSER || 'chromium';
const CR = BROWSER === 'chromium';
const TAG = CR ? '' : `-${BROWSER}`;

let passed = 0, failed = 0;
const failures = [];
const ok = (condition, what) => {
  if (condition) passed++;
  else { failed++; const w = typeof what === 'function' ? what() : what; failures.push(w); console.log(`FAIL ${w}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const counts = { pairs: 0, texts: 0, fields: 0, marks: 0, axNodes: 0, axStates: 0, tabStops: 0, targets: 0, layouts: 0 };

// The setups: the default (microstrip, C44 via), the pair (C45 with the fixture's feeds, as ui-player).
const pairS = SU.defaultSetup();
{
  const preset = V.presetVia('pair', pairS.stackup);
  pairS.via = { ...preset, feeds: [{ ...preset.feeds[0], angle: 180 }, { ...preset.feeds[1], angle: 0 }] };
}
const PAIR = `${URL0}?${LK.encodeLink(pairS)}`;

// ---------- contrast: the tokens ----------

const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const colour = (s) => {
  s = s.trim();
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  return null;
};
const css = readFileSync(join(repo, 'styles/EmSim.module.css'), 'utf8');
const block = (start) => {
  const i = css.indexOf(start), j = css.indexOf('}', i);
  return Object.fromEntries([...css.slice(i, j).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
};
const LIGHT = block('.root {');
const DARK = { ...LIGHT, ...block(".root[data-theme='dark'] {") };
const DARK_SYSTEM = { ...LIGHT, ...block(".root:not([data-theme='light']) {") };
ok(JSON.stringify(DARK) === JSON.stringify(DARK_SYSTEM), 'the dark tokens are the same by the system and by the switch');
const SURFACES = ['bg', 'field', 'raise'];
// [what, foregrounds, backgrounds, needed]
const PAIRS = [
  ['text', ['ink', 'ink-2', 'ink-3', 'accent', 'warn', 'error', 'air-ink'], SURFACES, 4.5],
  ['text on accent-soft', ['ink', 'ink-2', 'accent'], ['accent-soft'], 4.5],
  ['pressed toggle', ['accent-ink'], ['accent'], 4.5],
  ['drawing labels on air', ['air-ink', 'ink', 'ink-2'], ['air'], 4.5],
  ['plot series and marks', ['accent', 'copper', 'mask', 'warn', 'ink-2'], ['field'], 3],
  ['focus ring', ['accent'], SURFACES, 3],
  ['form-field edge', ['edge'], SURFACES, 3],
  ['copper on laminate', ['copper-edge'], ['core', 'prepreg'], 3],
];
const surface = (t, name) => {
  const c = colour(t[name]);
  return c[3] < 1 ? over(c, colour(t.bg)) : c;
};
const table = [];
for (const [what, fgs, bgs, need] of PAIRS) {
  for (const [theme, t] of [['light', LIGHT], ['dark', DARK]]) {
    let low = null;
    for (const f of fgs) for (const b of bgs) {
      const bg = surface(t, b), fg = over(colour(t[f]), bg), q = ratio(fg, bg);
      counts.pairs++;
      if (!low || q < low.q) low = { f, b, q };
      ok(q >= need, `contrast ${theme}: --${f} on --${b} ${q.toFixed(2)}:1 (needs ${need})`);
    }
    table.push({ what, need, theme, low: `--${low.f} on --${low.b} ${low.q.toFixed(2)}` });
  }
}
console.log('\nToken contrast (lowest pair of each kind):');
console.log('| Kind (need) | Light | Dark |\n| --- | --- | --- |');
for (const [what, , , need] of PAIRS) console.log(`| ${what} (${need}) | ${table.find((r) => r.what === what && r.theme === 'light').low} | ${table.find((r) => r.what === what && r.theme === 'dark').low} |`);

// ---------- the page ----------

const browser = CR ? await chromium.launch({ channel: 'msedge', args: ARGS }) : await (BROWSER === 'firefox' ? firefox : webkit).launch();
// Whether a full-wave run can be on the GPU here; without, every run is the CPU's quickest case (cpuSmall).
const GPU = await (async () => {
  const c = await browser.newContext(); const p = await c.newPage();
  await p.goto(URL0);
  const g = await p.evaluate(async () => { try { return !!(await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })); } catch { return false; } });
  await c.close();
  return g;
})();
console.log(`Browser: ${BROWSER} (${browser.version()}), WebGPU adapter: ${GPU ? 'yes' : 'no: full-wave runs are the CPU\'s quickest case'}`);

async function open(ctx, url = URL0) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  await page.goto(url);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await page.bringToFront();
  return page;
}

/** Loads every lazy section (each scrolled near), then back to the top. */
async function loadAll(page) {
  for (const id of ['via', 'waves', 'export', 'examples', 'theory']) {
    await page.evaluate((i) => document.getElementById(i)?.scrollIntoView(), id);
    await page.waitForSelector(`#${id}[data-loaded="true"]`, { timeout: 30000 }).catch(() => ok(false, `the ${id} section loads`));
  }
  await page.waitForSelector('[data-via-results][data-state="done"]', { timeout: 30000 }).catch(() => {});
  await page.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await frame(page);
}

/** Lays out everything a visitor could open: every <details>, the sections' skipped contents. */
async function openAll(page) {
  await loadAll(page);
  await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
  await page.addStyleTag({ content: '*{content-visibility:visible!important}' });
  await sleep(400);
  await frame(page);
}

// ---------- names and roles ----------

const NAMED = new Set(['button', 'link', 'textbox', 'spinbutton', 'slider', 'checkbox', 'combobox', 'radio', 'searchbox', 'switch', 'listbox', 'menuitem', 'tab', 'region', 'img', 'dialog', 'option', 'radiogroup', 'group', 'progressbar', 'figure', 'table']);
const OPTIONAL = new Set(['group', 'figure', 'table']);
async function axAudit(page, label) {
  const bad = new Map();
  if (!CR) await ariaAudit(page, bad);
  const cdp = CR ? await page.context().newCDPSession(page) : null;
  const { nodes } = CR ? await cdp.send('Accessibility.getFullAXTree') : { nodes: [] };
  for (const n of nodes) {
    if (n.ignored) continue;
    counts.axNodes++;
    const role = n.role?.value, name = (n.name?.value ?? '').trim();
    if (name) continue;
    const focusable = n.properties?.some((p) => p.name === 'focusable' && p.value.value);
    if (OPTIONAL.has(role) && !focusable) continue;
    if (!NAMED.has(role) && !(focusable && role !== 'RootWebArea')) continue;
    let html = '';
    try {
      const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId });
      // A text block given tabindex="-1" only so that the focus can be moved to it is read by its content.
      html = (await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true,
        functionDeclaration: 'function(){return this.tabIndex < 0 && !this.matches("a[href],button,input,select,textarea,summary,[role]") ? "" : this.outerHTML.slice(0,160)}' })).result.value;
      if (!html && !NAMED.has(role)) continue;
    } catch { /* not in the DOM */ }
    const k = `${role} ${html.replace(/class="[^"]*"/g, '')}`;
    bad.set(k, (bad.get(k) ?? 0) + 1);
  }
  // Toggles and sliders: their state is exposed.
  const states = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll('button')) {
      if (b.closest('[hidden]') || !b.getClientRects().length) continue;
      const t = (b.textContent ?? '').trim();
      // A button that looks like a toggle (inside a segmented group) must say whether it is pressed.
      const seg = b.parentElement?.getAttribute('role') === 'group' && b.parentElement.querySelectorAll(':scope > button').length > 1;
      if (seg && !b.hasAttribute('aria-pressed') && !b.hasAttribute('aria-checked')) out.push(`toggle without aria-pressed: ${b.outerHTML.replace(/class="[^"]*"/g, '').slice(0, 100)}`);
      if (b.hasAttribute('aria-controls') && !b.hasAttribute('aria-expanded')) out.push(`aria-controls without aria-expanded: ${t.slice(0, 30)}`);
    }
    for (const s of document.querySelectorAll('[role="slider"]')) {
      if (!s.getClientRects().length) continue;
      if (!s.hasAttribute('aria-valuenow') && !s.hasAttribute('aria-valuetext')) out.push(`slider without a value: ${s.outerHTML.replace(/class="[^"]*"/g, '').slice(0, 100)}`);
    }
    return out;
  });
  await cdp?.detach();
  counts.axStates++;
  ok(bad.size === 0, () => `names (${label}): ${[...bad].slice(0, 6).map(([k, v]) => `${v}× ${k}`).join(' | ')}`);
  ok(states.length === 0, () => `states (${label}): ${states.slice(0, 6).join(' | ')}`);
}

/** Outside Chromium: Playwright's aria snapshot (its own role and name computation in the page, the same in every
 * engine; the browsers' own trees are not reachable): no unnamed control, region, image or dialog. A focusable element
 * without a role is not in the snapshot, so that part of the CDP audit has no equivalent here. */
async function ariaAudit(page, bad) {
  const tree = await page.ariaSnapshotJSON({ mode: 'ai', timeout: 120000 });
  const walk = async (list) => {
    for (const n of list ?? []) {
      if (!n || typeof n !== 'object') continue;
      counts.axNodes++;
      const role = n.role, name = (n.name ?? '').toString().trim();
      if (!name && NAMED.has(role) && !OPTIONAL.has(role)) {
        const html = n.ref ? await page.locator(`aria-ref=${n.ref}`).evaluate((e) => (e.tabIndex < 0 && !e.matches('a[href],button,input,select,textarea,summary,[role]') ? '' : e.outerHTML.slice(0, 160))).catch(() => '(not found)') : '(no ref)';
        if (html) { const k = `${role} ${html.replace(/class="[^"]*"/g, '')}`; bad.set(k, (bad.get(k) ?? 0) + 1); }
      }
      await walk(n.children);
    }
  };
  await walk(Array.isArray(tree) ? tree : [tree]);
}

/** Headings in order and the landmarks. */
async function structure(page, label) {
  const r = await page.evaluate(() => {
    const hs = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => !h.closest('[hidden], [aria-hidden="true"]') && h.getClientRects().length);
    const skips = [];
    let last = 0;
    for (const h of hs) {
      const l = Number(h.tagName[1]);
      if (last && l > last + 1) skips.push(`h${last} → h${l} "${h.textContent.trim().slice(0, 40)}"`);
      last = l;
    }
    return {
      h1: hs.filter((h) => h.tagName === 'H1').length, skips,
      banner: document.querySelectorAll('header:not(main header):not(section header):not(article header)').length,
      nav: document.querySelectorAll('nav').length,
      main: document.querySelectorAll('main').length,
      footer: document.querySelectorAll('footer:not(main footer)').length,
    };
  });
  ok(r.h1 === 1, `${label}: one h1 (${r.h1})`);
  ok(r.skips.length === 0, () => `${label}: no heading level skipped: ${r.skips.slice(0, 5).join(' | ')}`);
  ok(r.banner >= 1 && r.nav >= 1 && r.main === 1 && r.footer >= 1, `${label}: landmarks banner ${r.banner}, navigation ${r.nav}, main ${r.main}, contentinfo ${r.footer}`);
}

/** Colour helpers in the page (window.__ax): parsing, compositing, WCAG ratios, the background behind an element
 * (HTML: through its ancestors; SVG: the painted shapes under a point, in paint order, over the svg's box). */
const installAx = (page) => page.evaluate(() => {
  if (window.__ax) return;
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (s) => {
    const m = s.match(/^rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = s; cv.fillRect(0, 0, 1, 1);
    const d = cv.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const htmlBg = (el) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) { stack.push(c); if (c[3] >= 1) break; }
    }
    let col = rgba(getComputedStyle(document.body).backgroundColor);
    if (col[3] < 1) col = [255, 255, 255, 1];
    for (let i = stack.length - 1; i >= 0; i--) col = over(stack[i], col);
    return col;
  };
  const svgBg = (el, x, y) => {
    const svg = el.ownerSVGElement ?? el.closest('svg');
    let col = htmlBg(svg);
    for (const s of svg.querySelectorAll('rect, path, polygon, circle, ellipse, image')) {
      if (s === el || el.contains(s) || s.contains(el) || (s.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) continue;
      if (s.closest('text, defs, clipPath, mask, pattern, [data-handle], [data-via-handle]')) continue;
      const cs = getComputedStyle(s);
      if (cs.display === 'none' || cs.visibility !== 'visible' || cs.fill === 'none' || cs.fill.startsWith('url')) continue;
      const b = s.getBoundingClientRect();
      if (!(x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)) continue;
      if (s.tagName === 'image') { col = null; continue; }
      if (s.tagName !== 'rect') {
        const m = s.getScreenCTM()?.inverse();
        if (!m) continue;
        const p = new DOMPoint(x, y).matrixTransform(m);
        try { if (!s.isPointInFill(p)) continue; } catch { continue; }
      }
      let op = Number(cs.fillOpacity) * Number(cs.opacity);
      for (let e = s.parentElement; e && e !== svg; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      const c = rgba(cs.fill); c[3] *= op;
      if (col) col = over(c, col);
    }
    return col;
  };
  const name1 = (el) => `${el.tagName.toLowerCase()}${[...(el.classList ?? [])].map((c) => `.${c.replace(/^\w+-module__\w+__/, '')}`).join('')}`;
  const name = (el) => (el.classList?.length || !el.parentElement ? name1(el) : `${name1(el.parentElement)} > ${name1(el)}`);
  window.__ax = { rgba, over, ratio, htmlBg, svgBg, name };
});

const scanContrast = async (page) => {
  await installAx(page);
  return page.evaluate(() => {
    const { rgba, over, ratio, htmlBg, svgBg, name } = window.__ax;
    const bad = new Map();
    let texts = 0, fields = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      const el = t.parentElement;
      if (!el || el.closest('.katex-mathml, script, style, noscript, [hidden], title, desc')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility !== 'visible' || el.closest('button:disabled, input:disabled, select:disabled, fieldset:disabled, [aria-disabled="true"], option')) continue;
      let op = 1;
      for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      if (op === 0) continue;
      const svg = el instanceof SVGElement;
      const fg = rgba(svg ? cs.fill : cs.color); fg[3] *= op * (svg ? Number(cs.fillOpacity) : 1);
      const bg = svg ? svgBg(el, r.left + r.width / 2, r.top + r.height / 2) : htmlBg(el);
      if (!bg) continue; // over a colour map (exempt); the labels there carry a halo
      let back = bg;
      if (svg && cs.paintOrder.startsWith('stroke') && cs.stroke !== 'none' && parseFloat(cs.strokeWidth) >= 2) back = over(rgba(cs.stroke), bg);
      const size = parseFloat(cs.fontSize), large = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66);
      const q = ratio(over(fg, back), back);
      texts++;
      if (q < (large ? 3 : 4.5)) { const k = `${name(el)} "${t.textContent.trim().slice(0, 16)}" ${q.toFixed(2)}:1 (${svg ? cs.fill : cs.color} on rgb(${back.slice(0, 3).map(Math.round)}))`; bad.set(k, (bad.get(k) ?? 0) + 1); }
    }
    for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || el.disabled) continue;
      const cs = getComputedStyle(el), around = htmlBg(el.parentElement), inside = over(rgba(cs.backgroundColor), around);
      const edge = Math.max(ratio(over(rgba(cs.borderTopColor), around), around), ratio(over(rgba(cs.borderBottomColor), around), around));
      fields++;
      if (edge < 3 && ratio(inside, around) < 3) { const k = `field ${name(el)} edge ${edge.toFixed(2)}:1`; bad.set(k, (bad.get(k) ?? 0) + 1); }
    }
    return { texts, fields, bad: [...bad] };
  });
};

/** The essential marks: the plots' lines and cursor against the plot, each drawing handle (its fill or its ring,
 * whichever stands out more) against what is under its centre. */
const scanMarks = async (page) => {
  await installAx(page);
  return page.evaluate(() => {
    const { rgba, over, ratio, htmlBg, svgBg } = window.__ax;
    const out = [];
    let n = 0;
    const paintOf = (el, which) => {
      const cs = getComputedStyle(el);
      const p = which === 'stroke' ? cs.stroke : cs.fill;
      if (!p || p === 'none' || p.startsWith('url') || (which === 'stroke' && !(parseFloat(cs.strokeWidth) > 0))) return null;
      let op = Number(cs.opacity) * Number(which === 'stroke' ? cs.strokeOpacity : cs.fillOpacity);
      for (let e = el.parentElement; e && e.tagName !== 'svg'; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      const c = rgba(p); c[3] *= op;
      return c[3] > 0 ? c : null;
    };
    for (const p of document.querySelectorAll('[data-plot] svg path[class*="line"], [data-plot] svg [data-cursor] line')) {
      if (!p.getClientRects().length) continue;
      const c = paintOf(p, 'stroke');
      if (!c) continue;
      const bg = htmlBg(p.closest('svg')), q = ratio(over(c, bg), bg);
      n++;
      if (q < 3) out.push(`plot ${p.closest('[data-plot]').getAttribute('data-plot')} line ${q.toFixed(2)}:1`);
    }
    for (const h of document.querySelectorAll('[data-handle], [data-via-handle]')) {
      if (!h.getClientRects().length) continue;
      const marks = [...h.querySelectorAll('circle, rect, path, line, polygon')].filter((m) => { const cs = getComputedStyle(m); return cs.display !== 'none' && cs.visibility === 'visible' && !/[Hh]it/.test(m.getAttribute('class') ?? ''); });
      let best = 0;
      for (const m of marks) {
        const r = m.getBoundingClientRect(), bg = svgBg(m, r.left + r.width / 2, r.top + r.height / 2);
        if (!bg) { best = 99; continue; }
        for (const which of ['fill', 'stroke']) { const c = paintOf(m, which); if (c) best = Math.max(best, ratio(over(c, bg), bg)); }
      }
      n++;
      if (best < 3) out.push(`handle ${h.getAttribute('data-handle') ?? h.getAttribute('data-via-handle')} ${best.toFixed(2)}:1`);
    }
    return { n, bad: out };
  });
};

// ---------- keyboard helpers ----------

const linkOf = (page) => page.evaluate(() => window.location.search);
const changed = (page, before, ms = 6000) => page.waitForFunction((b) => window.location.search !== b, before, { timeout: ms }).then(() => true).catch(() => false);
const settled = async (page) => { await page.waitForTimeout(120); await page.waitForFunction(() => !document.querySelector('[data-results][data-state="running"], [data-via-results][data-state="running"]'), null, { timeout: 30000 }).catch(() => {}); await frame(page); };

/** What has the focus, and whether it shows (an outline or ring on it or a close parent, or a handle's ring). */
// A frame first: the page scrolls a Tab stop into view a frame later where the engine left it off screen (EmSimTool's
// focus guard: WebKit does not scroll at all; Edge and Firefox now and then leave a theory citation under the bar as
// the theory is laid out when the focus enters it), as a visitor sees it.
const focusState = async (page) => { await frame(page); return focusNow(page); };
const focusNow = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body || a === document.documentElement) return { none: true };
  const visible = (c) => c && c !== 'none' && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);
  const shows = (e) => { const cs = getComputedStyle(e); return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && visible(cs.outlineColor)) || cs.boxShadow !== 'none'; };
  let shown = shows(a);
  if (!shown && a instanceof SVGElement) for (const d of a.querySelectorAll('[class*="Ring"], [class*="ring"]')) { const cs = getComputedStyle(d); if (visible(cs.stroke) && parseFloat(cs.strokeWidth) > 0) { shown = true; break; } }
  if (!shown) for (const d of a.querySelectorAll('*')) if (shows(d)) { shown = true; break; }
  for (let e = a.parentElement, i = 0; !shown && e && i < 2; e = e.parentElement, i++) shown = shows(e) && e.contains(a);
  const attrs = [...a.attributes].filter((x) => x.name.startsWith('data-') || x.name === 'href' || x.name === 'id' || x.name === 'aria-label').map((x) => `${x.name}=${x.value.slice(0, 24)}`).join(' ');
  const r = a.getBoundingClientRect();
  return { key: `${a.tagName.toLowerCase()} ${attrs}`.trim(), shown, inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && (!!a.closest('header') || r.bottom > (document.querySelector('header')?.getBoundingClientRect().bottom ?? 0) + 1) };
});
/** Firefox: Tab out of the page goes to the browser's own controls (none in a headless window) and leaves the focus on
 * the body; a real window gives it back at the page's start (or end, with Shift+Tab). A focusable span there takes the
 * focus for the next press, then goes. */
const reenter = (page, back) => page.evaluate((b) => { const t = document.createElement('span'); t.id = '__reentry'; t.tabIndex = -1; if (b) document.body.append(t); else document.body.prepend(t); t.focus({ preventScroll: true }); }, back);
/** Presses Tab (or Shift+Tab) until the focused element matches `sel`; the number of presses, or -1. */
async function tabTo(page, sel, max = 1500, back = false) {
  if (BROWSER === 'webkit' && (await page.locator(sel).first().evaluate((e) => e.matches('a[href]')).catch(() => false))) {
    await page.locator(sel).first().focus();
    return 0;
  }
  for (let i = 0; i <= max; i++) {
    const at = await page.evaluate((s) => (document.activeElement?.matches(s) ? 1 : !document.activeElement || document.activeElement === document.body ? 0 : -1), sel);
    if (at === 1) return i;
    // Firefox: out of the page, back in at its start (or end), as after the browser's own controls.
    const re = at === 0 && i > 0 && BROWSER === 'firefox';
    if (re) await reenter(page, back);
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    if (re) await page.evaluate(() => document.getElementById('__reentry')?.remove());
  }
  return -1;
}
const focusIn = (page, sel) => page.evaluate((s) => !!document.activeElement?.closest(s), sel);
const focused = (page, sel) => page.evaluate((s) => !!document.activeElement?.matches(s), sel);

// The table: task → { keys, touch } ('ok', 'FAIL …', or the script that covers it).
const TASKS = new Map();
const KNOWN = []; // engine behaviours that differ and are not the page's (printed at the end)
const mark = (task, how, result) => { const r = TASKS.get(task) ?? {}; r[how] = result; TASKS.set(task, r); };
async function task(page, name, how, fn) {
  let res;
  try { res = await fn(); } catch (e) { res = `threw ${String(e).split('\n')[0].slice(0, 120)}`; }
  const good = res === true;
  ok(good, `${how}: ${name}${good ? '' : ` (${res})`}`);
  mark(name, how, good ? 'ok' : 'FAIL');
  return good;
}
/** Tab to `sel`, check that it shows its focus; false with the reason otherwise. */
async function reach(page, sel, back = false) {
  // Forward (or back) a little way first; then the other way round the whole page.
  let n = await tabTo(page, sel, 150, back);
  if (n < 0) n = await tabTo(page, sel, 4000, !back);
  if (n < 0) return `Tab does not reach ${sel}`;
  const f = await focusState(page);
  if (!f.shown) return `${sel} does not show its focus`;
  if (!f.inView) return `${sel} has the focus out of view`;
  return true;
}
const camera = (page, sel, prop) => page.$eval(sel, (el, p) => { const v = el[p]; const c = (v?.view ?? v)?.camera; return c ? c.position.toArray().map((x) => x.toFixed(4)).join(',') : ''; }, prop);

// ---------- touch helpers ----------

async function touchDrag(page, x, y, dx, dy, steps = 12) {
  if (!CR && !steps) { await page.touchscreen.tap(x, y); return; }
  if (!CR) {
    // Touch PointerEvents to the element under the finger (our handlers in this engine, not its own gestures). A
    // synthetic pointer cannot be captured (setPointerCapture throws NotFoundError, which stops three.js's
    // OrbitControls), so capture is a no-op while the drag runs.
    await page.evaluate(async ([x, y, dx, dy, n]) => {
      const cap = Element.prototype.setPointerCapture, rel = Element.prototype.releasePointerCapture;
      Element.prototype.setPointerCapture = function (id) { try { cap.call(this, id); } catch { /* synthetic */ } };
      Element.prototype.releasePointerCapture = function (id) { try { rel.call(this, id); } catch { /* synthetic */ } };
      const target = document.elementFromPoint(x, y);
      const at = (type, i) => {
        const cx = x + (n ? (dx * i) / n : 0), cy = y + (n ? (dy * i) / n : 0);
        target.dispatchEvent(new PointerEvent(type, { pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy,
          button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, composed: true }));
      };
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      at('pointerdown', 0);
      for (let i = 1; i <= n; i++) { await raf(); at('pointermove', i); }
      await raf();
      at('pointerup', n);
      Element.prototype.setPointerCapture = cap; Element.prototype.releasePointerCapture = rel;
    }, [x, y, dx, dy, steps]);
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const pt = (px, py) => [{ x: px, y: py, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + (dx * i) / steps, y + (dy * i) / steps) }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
/** Without WebGPU: the CPU's quickest case (the trace 1 mm long at 100 ps), set by keys, taps or the mouse. */
async function cpuSmall(page, how) {
  if (GPU) return true;
  if (how === 'keys') {
    let r = await reach(page, '#waves-length'); if (r !== true) return r;
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('1'); await page.keyboard.press('Enter');
    r = await reach(page, '[data-waves-tr-set="100"]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
  } else {
    const press = (sel) => (how === 'touch' ? page.locator(sel).first().tap() : page.locator(sel).first().click());
    await press('#waves-length');
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('1'); await page.keyboard.press('Enter');
    await press('[data-waves-tr-set="100"]');
  }
  await sleep(300);
  await page.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
  const ok1 = await page.$eval('[data-waves-tr]', (e) => e.getAttribute('data-waves-tr')) === '100';
  return ok1 || 'the rise time did not become 100 ps';
}
const centre = async (page, sel) => {
  await page.locator(sel).first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const b = await page.locator(sel).first().boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};

// ---------- live regions ----------

/** Counts what the live regions say: every change of a live region's text (a polite or assertive region, a status or
 * an alert; an alert added counts once). */
const countLive = (page) => page.evaluate(() => {
  if (window.__live) { window.__live.n = 0; window.__live.log = []; return; }
  const sel = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';
  const last = new Map();
  const st = { n: 0, log: [] };
  const look = () => {
    for (const e of document.querySelectorAll(sel)) {
      if (e.parentElement?.closest(sel)) continue;
      const t = (e.textContent ?? '').trim();
      if (last.has(e) ? last.get(e) !== t : t !== '') { if (t) { st.n++; st.log.push(t.slice(0, 60)); } }
      last.set(e, t);
    }
  };
  for (const e of document.querySelectorAll(sel)) last.set(e, (e.textContent ?? '').trim());
  new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: false });
  window.__live = st;
});
const liveSaid = (page) => page.evaluate(() => ({ n: window.__live.n, log: window.__live.log.slice(-6) }));

// ---------- the parts ----------

if (part('audit')) {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    for (const [what, url] of [['default', URL0], ['pair', PAIR]]) {
      const page = await open(ctx, url);
      if (theme === 'light' && what === 'default') { await axAudit(page, `${what}, as loaded`); await structure(page, 'as loaded'); }
      if (theme === 'light') { await loadAll(page); await axAudit(page, `${what}, every section loaded, at the top`); }
      await openAll(page);
      if (theme === 'light') { await axAudit(page, `${what}, everything open`); await structure(page, `${what}, everything open`); }
      const r = await scanContrast(page);
      counts.texts += r.texts; counts.fields += r.fields;
      ok(r.bad.length === 0, () => `contrast on the page (${theme}, ${what}; ${r.texts} texts): ${r.bad.slice(0, 10).map(([k, v]) => `${v}× ${k}`).join(' | ')}`);
      const m = await scanMarks(page);
      counts.marks += m.n;
      ok(m.bad.length === 0, () => `marks (${theme}, ${what}; ${m.n}): ${[...new Set(m.bad)].slice(0, 8).join(' | ')}`);
      // The fields on: the maps' labels and the probe.
      if (what === 'default') {
        await page.click('[data-field-on]');
        await page.waitForSelector('[data-field-overlay]', { state: 'attached', timeout: 20000 }).catch(() => {});
        await sleep(800);
        const f = await scanContrast(page);
        counts.texts += f.texts;
        ok(f.bad.length === 0, () => `contrast with the trace's field map (${theme}): ${f.bad.slice(0, 6).map(([k, v]) => `${v}× ${k}`).join(' | ')}`);
      }
      ok(page.errors.length === 0, () => `no errors (${theme}, ${what}): ${page.errors.slice(0, 3).join(' | ')}`);
      await page.close();
    }
    await ctx.close();
  }
}

// One Tab cycle through the whole page (every section loaded): every stop shows its focus, no trap.
if (part('tab')) for (const [w, theme] of [[1440, 'light'], [390, 'dark']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, colorScheme: theme });
  const page = await open(ctx, URL0);
  await loadAll(page);
  await page.evaluate(() => document.activeElement?.blur());
  const seen = new Map(), hidden = new Map(), out = new Map(), jumps = [];
  await page.keyboard.press('Tab');
  const first = (await focusState(page)).key;
  let back = false, i = 0;
  for (; i < 6000; i++) {
    const f = await focusState(page);
    if (f.none && i > 0 && BROWSER === 'firefox') {
      // Out of the page: back in at its start, as after the browser's own controls (a focus at the body's start).
      await page.evaluate(() => window.scrollTo(0, 0));
      await reenter(page, false);
      await page.keyboard.press('Tab');
      await page.evaluate(() => document.getElementById('__reentry')?.remove());
      continue;
    }
    if (!f.none) {
      if (i > 0 && f.key === first) { back = true; break; }
      seen.set(f.key, (seen.get(f.key) ?? 0) + 1);
      if (!f.shown) hidden.set(f.key, (hidden.get(f.key) ?? 0) + 1);
      // Firefox now and then scrolls the page by several hundred px just after it brought the focused control into
      // view (a different stop each run, not by a script's focus; BL194): up to 3 such stops a cycle are listed.
      if (!f.inView && BROWSER === 'firefox' && jumps.length < 3) jumps.push(f.key);
      else if (!f.inView) out.set(f.key, (out.get(f.key) ?? 0) + 1);
    }
    await page.keyboard.press('Tab');
  }
  counts.tabStops += i;
  ok(back, `${w} px: Tab comes back to the first stop (${first}) after the whole page: no trap (${i} presses)`);
  if (BROWSER === 'webkit') ok(first.includes('data-whys-toggle'), `${w} px: the first Tab stop is the first control, the short lines' switch (WebKit's Tab skips links; ${first})`);
  else ok(first.includes('href=/') && first.includes('aria-label=Home'), `${w} px: the first Tab stop is the home link (${first})`);
  ok(hidden.size === 0, () => `${w} px: every Tab stop shows its focus: ${[...hidden].slice(0, 8).map(([k, v]) => `${v}× ${k}`).join(' | ')}`);
  ok(out.size === 0, () => `${w} px: every Tab stop is scrolled into view (not under the sticky bar or off screen): ${[...out].slice(0, 8).map(([k, v]) => `${v}× ${k}`).join(' | ')}`);
  if (jumps.length) KNOWN.push(`Firefox at ${w} px: ${jumps.length} Tab stop(s) scrolled off by the browser after the focus (BL194): ${jumps.join(' | ')}`);
  console.log(`Tab cycle at ${w} px: ${i} stops, ${seen.size} different`);
  await ctx.close();
}

// Every task by keys alone, in page order, on one page.
let ranWaves = false;
if (part('keys')) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  const page = await open(ctx, URL0);
  await page.evaluate(() => { window.__prints = 0; window.print = () => { window.__prints++; }; });
  await loadAll(page);
  await page.evaluate(() => document.activeElement?.blur());
  const K = 'keys';
  const undoByKeys = async () => { const q = await linkOf(page); await page.keyboard.press('Control+z'); await changed(page, q); await settled(page); };

  await task(page, 'theme and short lines switches', K, async () => {
    let r = await reach(page, '[data-theme-toggle]'); if (r !== true) return r;
    const t0 = await page.$eval('[data-ready]', (e) => e.getAttribute('data-theme'));
    await page.keyboard.press('Enter');
    const t1 = await page.$eval('[data-ready]', (e) => e.getAttribute('data-theme'));
    if (t1 === t0) return 'Enter does not switch the theme';
    await page.keyboard.press('Enter');
    r = await reach(page, '[aria-label^="Short lines"]', true); if (r !== true) return r;
    const p0 = await page.$eval('[aria-label^="Short lines"]', (e) => e.getAttribute('aria-pressed'));
    await page.keyboard.press('Space');
    const p1 = await page.$eval('[aria-label^="Short lines"]', (e) => e.getAttribute('aria-pressed'));
    await page.keyboard.press('Space');
    return p0 !== p1 || 'Space does not switch the short lines';
  });
  await task(page, 'the status note\'s More', K, async () => {
    const r = await reach(page, '[data-status] summary'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    return (await page.$eval('[data-status] details', (d) => d.open)) || 'Enter does not open More';
  });
  await task(page, 'units and digits', K, async () => {
    const r = await reach(page, '[data-unit="mil"]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    const on = await page.$eval('[data-unit="mil"]', (e) => e.getAttribute('aria-pressed'));
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter');
    return on === 'true' || 'Enter does not choose mil';
  });
  await task(page, 'edit a stackup layer, undo and redo', K, async () => {
    const sel = '[data-layer-kind="dielectric"] [data-field$=".t"] input';
    let r = await reach(page, sel); if (r !== true) return r;
    const q = await linkOf(page);
    await page.keyboard.press('Control+a'); await page.keyboard.type('0.3'); await page.keyboard.press('Enter');
    if (!(await changed(page, q))) return 'a typed thickness does not change the setup';
    await settled(page);
    r = await reach(page, '[data-undo]', true); if (r !== true) return r;
    await page.keyboard.press('Enter');
    if (!(await page.waitForFunction((b) => window.location.search === b, q, { timeout: 5000 }).then(() => true).catch(() => false))) return 'Enter on Undo does not go back';
    r = await reach(page, '[data-redo]'); if (r !== true) return r;
    const q2 = await linkOf(page);
    await page.keyboard.press('Enter');
    if (!(await changed(page, q2))) return 'Enter on Redo does not come back';
    await page.keyboard.press('Control+z');
    return (await page.waitForFunction((b) => window.location.search === b, q, { timeout: 5000 }).then(() => true).catch(() => false)) || 'Ctrl+Z does not undo';
  });
  await task(page, 'pick a JLCPCB stackup', K, async () => {
    let r = await reach(page, '[data-jlc-open]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-jlc-key]', { timeout: 15000 });
    r = await reach(page, '[data-jlc-key]:not([aria-current])'); if (r !== true) return r;
    const q = await linkOf(page);
    await page.keyboard.press('Enter');
    if (!(await changed(page, q))) return 'Enter on a row does not pick it';
    await settled(page);
    if (await page.$('[data-jlc-picker]')) { await page.keyboard.press('Escape'); }
    await undoByKeys();
    return (await linkOf(page)) === q || 'undo does not restore the stackup';
  });
  await task(page, 'set the trace (kind, width) and read the results', K, async () => {
    let r = await reach(page, '[data-trace-kind]'); if (r !== true) return r;
    const q = await linkOf(page);
    await page.keyboard.press('ArrowDown');
    if (!(await changed(page, q))) return 'an arrow on the kind does not change it';
    await settled(page); await undoByKeys();
    r = await reach(page, '[data-field="trace.w"] input'); if (r !== true) return r;
    const z0 = await page.$eval('[data-results] [data-q="z0"]', (e) => e.getAttribute('data-v'));
    await page.keyboard.press('Control+a'); await page.keyboard.type('0.2'); await page.keyboard.press('Enter');
    await changed(page, q); await settled(page);
    const z1 = await page.$eval('[data-results] [data-q="z0"]', (e) => e.getAttribute('data-v'));
    await page.keyboard.press('Tab'); await undoByKeys();
    return z1 !== z0 || 'the typed width does not change Z0';
  });
  await task(page, 'drag a trace handle', K, async () => {
    const r = await reach(page, '[data-handle="w"]'); if (r !== true) return r;
    const q = await linkOf(page);
    await page.keyboard.press('ArrowRight');
    if (!(await changed(page, q))) return 'ArrowRight on the width handle does not change it';
    await settled(page); await undoByKeys();
    return true;
  });
  await task(page, 'show the fields and move the probe', K, async () => {
    let r = await reach(page, '[data-field-on]'); if (r !== true) return r;
    await page.keyboard.press('Space');
    await page.waitForSelector('[data-field-overlay]', { state: 'attached', timeout: 20000 });
    r = await reach(page, '[data-field-probe-mode]'); if (r !== true) return r;
    if ((await page.$eval('[data-field-probe-mode]', (e) => e.getAttribute('aria-pressed'))) !== 'true') await page.keyboard.press('Enter');
    r = await reach(page, '[data-trace-view]'); if (r !== true) return r;
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
    const p = await page.$eval('[data-field-probe]', (e) => e.getAttribute('data-field-probe'));
    r = await reach(page, '[data-field-on]', true); await page.keyboard.press('Space');
    return p === 'value' || p === 'none' || `the probe does not move by keys (${p})`;
  });
  await task(page, 'open an equation and its derivation and close them', K, async () => {
    let r = await reach(page, '[data-results] [data-eq-open="z0"]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-eq-panel]', { timeout: 15000 });
    r = await reach(page, '[data-eq-derive]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open]', { timeout: 15000 });
    if (!(await focusIn(page, 'dialog[open]'))) return 'the dialog does not take the focus';
    for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !document.activeElement || document.activeElement === document.body || !!document.activeElement.closest('dialog[open]'));
    if (!inside) return 'Tab leaves the modal dialog for the page behind';
    await page.keyboard.press('Escape');
    if (await page.$('dialog[open]')) return 'Escape does not close the dialog';
    if (!(await focused(page, '[data-eq-derive]'))) return 'the focus does not go back to Derivation';
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-eq-panel]'), null, { timeout: 5000 }).catch(() => {});
    return (await focused(page, '[data-eq-open="z0"]')) || 'Escape does not close the panel back to the number';
  });
  await task(page, 'run a sweep from the tools', K, async () => {
    let r = await reach(page, '[data-tool-tab="sweep"]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    r = await reach(page, '[data-sweep-run]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-sweep-result][data-state="done"]', { timeout: 30000 });
    r = await reach(page, '[data-plot-box]'); if (r !== true) return r;
    const c0 = await page.$eval('[data-plot-readout]', (e) => e.getAttribute('data-cursor'));
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    const c1 = await page.$eval('[data-plot-readout]', (e) => e.getAttribute('data-cursor'));
    return c1 !== c0 || 'the plot\'s cursor does not move by keys';
  });
  await task(page, 'follow a short line\'s link and come back', K, async () => {
    const r = await reach(page, '#via [data-why-link]'); if (r !== true) return r;
    const href = await page.evaluate(() => document.activeElement.getAttribute('href'));
    await page.keyboard.press('Enter');
    await page.waitForFunction((h) => window.location.hash === h, href, { timeout: 5000 });
    await sleep(300);
    const target = await page.evaluate((h) => { const e = document.getElementById(h.slice(1)); const b = e?.getBoundingClientRect(); return !!b && b.top < innerHeight && b.bottom > 0; }, href);
    if (!target) return `${href} is not in view after Enter`;
    await page.keyboard.press('Tab');
    const inTarget = await page.evaluate((h) => !!document.activeElement?.closest(`[id="${h.slice(1)}"]`) || !!document.getElementById(h.slice(1))?.compareDocumentPosition(document.activeElement) & Node.DOCUMENT_POSITION_FOLLOWING, href);
    if (!inTarget && BROWSER === 'webkit') { KNOWN.push('WebKit: Tab after a link to a topic goes on from the link, not from the topic (fragment navigation does not move the focus starting point; BL193)'); return true; }
    if (!inTarget) return 'Tab after the link does not go on from the topic';
    await page.goBack(); // the browser's Back (Alt+←)
    // The browser restores the scroll once the parts above are laid out again: up to 3 s (a fixed 400 ms was missed by
    // Firefox and once by Edge in M9.1b).
    const backInView = await page.waitForFunction((h) => { const e = document.querySelector(`#via [data-why-link][href="${h}"]`); const b = e?.getBoundingClientRect(); return !!b && b.top < innerHeight && b.bottom > 0; }, href, { timeout: 3000 }).then(() => true).catch(() => false);
    if (!backInView) return `Back does not return to the short line (${await page.evaluate(() => `hash "${location.hash}", scrollY ${Math.round(scrollY)}, history ${history.length}`)})`;
    return true;
  });
  await task(page, 'drag a via handle', K, async () => {
    await page.evaluate(() => document.querySelector('#via')?.scrollIntoView());
    await page.focus('#via-h').catch(() => {});
    const r = await reach(page, '[data-via-handle="drill"]'); if (r !== true) return r;
    const q = await linkOf(page);
    await page.keyboard.press('ArrowRight');
    if (!(await changed(page, q))) return 'ArrowRight on the drill does not change it';
    await settled(page); await undoByKeys();
    return true;
  });
  await task(page, 'add and remove a return via', K, async () => {
    let r = await reach(page, '[data-via-add-mode]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    r = await reach(page, '[data-via-view="top"]'); if (r !== true) return r;
    const q = await linkOf(page);
    await page.keyboard.press('Enter');
    if (!(await changed(page, q))) return 'Enter on the top view does not add a return via';
    await settled(page);
    const f = await page.evaluate(() => document.activeElement?.getAttribute('data-via-handle') ?? '');
    if (!f.startsWith('ret:')) return `the new return via does not have the focus (${f})`;
    const q2 = await linkOf(page);
    await page.keyboard.press('ArrowRight');
    if (!(await changed(page, q2))) return 'the new return via does not move by keys';
    await settled(page);
    const q3 = await linkOf(page);
    await page.keyboard.press('Delete');
    if (!(await changed(page, q3))) return 'Delete does not remove it';
    await settled(page);
    r = await reach(page, '[data-via-add-mode]', true); if (r !== true) return r;
    await page.keyboard.press('Enter');
    return true;
  });
  await task(page, 'open the via\'s 3D view and turn it', K, async () => {
    let r = await reach(page, '[data-via3d-open]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    // The view draws only while it is on the screen: Tab to it first (where the engine leaves it below the screen, as
    // WebKit does, it is drawn once the focus brings it in).
    await page.waitForSelector('[data-via3d-host]', { timeout: 20000 });
    r = await reach(page, '[data-via3d-host]'); if (r !== true) return r;
    await page.waitForSelector('[data-via3d-ready="true"]', { timeout: CR ? 20000 : 60000 });
    const c0 = await camera(page, '[data-via3d-host]', 'emsimVia3d');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('+'); await sleep(300);
    const c1 = await camera(page, '[data-via3d-host]', 'emsimVia3d');
    if (c1 === c0) return `the arrow keys do not turn the via's 3D view (${c0})`;
    await page.keyboard.press('Home'); await sleep(300);
    r = await reach(page, '[data-via3d-open]', true); if (r !== true) return r;
    await page.keyboard.press('Enter');
    return true;
  });
  await task(page, 'run, cancel and run a full-wave run', K, async () => {
    let r = await reach(page, '[data-waves-kind-set="trace"]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
    r = await cpuSmall(page, 'keys'); if (r !== true) return r;
    r = await reach(page, '[data-waves-run]:not([disabled])'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-waves-cancel]', { timeout: 20000 });
    r = await reach(page, '[data-waves-cancel]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-waves-phase="cancelled"]', { timeout: 20000 });
    const f = await focusState(page);
    if (f.none) return 'after Cancel the focus is lost (on the page\'s body)';
    if (!(await focused(page, '[data-waves-run]'))) return `after Cancel the focus is not on Run (${f.key})`;
    await page.keyboard.press('Enter');
    // The run ends with the focus on Cancel: the focus goes to Run, not to the page's body.
    await page.waitForSelector('[data-waves-cancel]', { timeout: 20000 });
    r = await reach(page, '[data-waves-cancel]'); if (r !== true) return r;
    await page.waitForSelector('[data-waves-results][data-stale="false"] [data-waves-player]', { timeout: 240000 });
    ranWaves = true;
    await frame(page);
    const g = await focusState(page);
    return (await focused(page, '[data-waves-run]')) || `when the run ends on Cancel the focus is not on Run (${g.none ? 'body' : g.key})`;
  });
  await task(page, 'play, pause and scrub the player', K, async () => {
    if (!ranWaves) return 'no run';
    let r = await reach(page, '[data-player-play]'); if (r !== true) return r;
    const p0 = await page.$eval('[data-waves-player]', (e) => e.getAttribute('data-player-playing'));
    await page.keyboard.press('Enter');
    const p1 = await page.$eval('[data-waves-player]', (e) => e.getAttribute('data-player-playing'));
    if (p0 === p1) return 'Enter does not play or pause';
    if (p1 === 'true') await page.keyboard.press('Enter');
    r = await reach(page, '[data-player-time]'); if (r !== true) return r;
    await page.keyboard.press('End');
    const n = Number(await page.$eval('[data-waves-player]', (e) => e.getAttribute('data-player-frames')));
    const f = Number(await page.$eval('[data-waves-player]', (e) => e.getAttribute('data-player-frame')));
    await page.keyboard.press('Home');
    const f0 = Number(await page.$eval('[data-waves-player]', (e) => e.getAttribute('data-player-frame')));
    return (f === n - 1 && f0 === 0) || `End and Home on the time slider (${f} of ${n}, then ${f0})`;
  });
  await task(page, 'open the waves\' 3D view and turn it', K, async () => {
    if (!ranWaves) return 'no run';
    let r = await reach(page, '[data-waves3d-open]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-waves3d-ready="true"]', { timeout: CR ? 20000 : 60000 });
    r = await reach(page, '[data-waves3d-host]'); if (r !== true) return r;
    const c0 = await camera(page, '[data-waves3d-host]', 'emsimWaves3d');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('-'); await sleep(300);
    const c1 = await camera(page, '[data-waves3d-host]', 'emsimWaves3d');
    r = await reach(page, '[data-waves3d-open]', true); if (r !== true) return r;
    await page.keyboard.press('Enter');
    return c1 !== c0 || 'the arrow keys do not turn the waves\' 3D view';
  });
  await task(page, 'save a figure, a data file and print the report', K, async () => {
    let r = await reach(page, '[data-export-save]'); if (r !== true) return r;
    let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.keyboard.press('Enter')]);
    if (!dl.suggestedFilename()) return 'no figure file';
    r = await reach(page, '[data-data-save]'); if (r !== true) return r;
    [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.keyboard.press('Enter')]);
    if (!dl.suggestedFilename()) return 'no data file';
    r = await reach(page, '[data-report-print]'); if (r !== true) return r;
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__prints > 0, null, { timeout: 15000 });
    return true;
  });
  await task(page, 'open an example and undo it', K, async () => {
    const r = await reach(page, '[data-example-link="ex-lvds-pair/w100"]'); if (r !== true) return r;
    const q = await linkOf(page);
    await page.keyboard.press('Enter');
    if (!(await changed(page, q))) return 'Enter on an example does not open it';
    await settled(page);
    await page.keyboard.press('Control+z');
    return (await page.waitForFunction((b) => window.location.search === b, q, { timeout: 5000 }).then(() => true).catch(() => false)) || 'Ctrl+Z does not undo the example';
  });
  await task(page, 'follow a citation in the theory', K, async () => {
    await page.evaluate(() => document.getElementById('theory')?.scrollIntoView());
    await page.focus('#theory-h').catch(() => {});
    const r = await reach(page, '#theory a[href^="#ref-"]'); if (r !== true) return r;
    const href = await page.evaluate(() => document.activeElement.getAttribute('href'));
    await page.keyboard.press('Enter');
    return (await page.waitForFunction((h) => window.location.hash === h, href, { timeout: 5000 }).then(() => true).catch(() => false)) || 'Enter does not follow the citation';
  });
  await task(page, 'jump to a section from the bar', K, async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.focus('[data-theme-toggle]');
    const r = await reach(page, 'nav a[href="#waves"]', true); if (r !== true) return r;
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.location.hash === '#waves', null, { timeout: 5000 });
    await page.keyboard.press('Tab');
    return (await focusIn(page, '#waves')) || `Tab after the bar's link is not in the section (${(await focusState(page)).key})`;
  });
  ok(page.errors.length === 0, () => `no errors (keys): ${page.errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}


// What the live regions say while a width and a via handle are dragged, a plot's cursor and a probe are swept, a key
// moves a handle, a full-wave run runs and the player plays: once when it settles, never per frame or message.
if (part('live')) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await open(ctx, URL0);
  await loadAll(page);
  const roles = await page.evaluate(() => [...document.querySelectorAll('[data-calm]')].map((e) => `${e.getAttribute('data-calm')}:${e.getAttribute('role')}`));
  ok(['results', 'via-results', 'plot', 'waves'].every((k) => roles.includes(`${k}:status`)), `the results, the via's results, the plots' readouts and the run's progress have calm status regions (${roles.join(', ')})`);
  const said = async (what, act, lo, hi, wait = 1500) => {
    await sleep(1200);
    await countLive(page);
    await act();
    await sleep(wait);
    const s = await liveSaid(page);
    ok(s.n >= lo && s.n <= hi, `live: ${what} is said ${lo === hi ? lo : `${lo} to ${hi}`} time(s) (${s.n}: ${s.log.join(' / ')})`);
  };
  const mouseDrag = async (sel, dx, dy, n = 40) => {
    const [x, y] = await centre(page, sel);
    await page.mouse.move(x, y); await page.mouse.down();
    for (let i = 1; i <= n; i++) { await page.mouse.move(x + (dx * i) / n, y + (dy * i) / n); await page.waitForTimeout(25); }
    await page.mouse.up();
  };
  await page.locator('[data-handle="w"]').scrollIntoViewIfNeeded();
  await said('a width dragged for a second', () => mouseDrag('[data-handle="w"]', 30, 0), 1, 1);
  await said('a key step on the width', async () => { await page.focus('[data-handle="w"]'); await page.keyboard.press('ArrowLeft'); }, 1, 1);
  await page.click('[data-field-on]');
  await page.waitForSelector('[data-field-overlay]', { state: 'attached', timeout: 20000 });
  await said('a probe swept over the drawing', async () => {
    await page.locator('[data-trace-view]').evaluate((e) => e.scrollIntoView({ block: 'center' })); const b = await page.locator('[data-trace-view]').boundingBox();
    for (let i = 0; i < 30; i++) { await page.mouse.move(b.x + b.width * (0.2 + (0.6 * i) / 30), b.y + b.height * 0.5); await page.waitForTimeout(25); }
  }, 1, 1);
  await page.click('[data-field-on]');
  await page.locator('[data-via-handle="pad:L1"]').scrollIntoViewIfNeeded();
  await said('a via pad dragged for a second', () => mouseDrag('[data-via-handle="pad:L1"]', 20, 0), 1, 2);
  await said('a plot\'s cursor swept', async () => {
    await page.locator('[data-via-plots] [data-plot-box]').first().evaluate((e) => e.scrollIntoView({ block: 'center' })); const b = await page.locator('[data-via-plots] [data-plot-box]').first().boundingBox();
    for (let i = 0; i < 30; i++) { await page.mouse.move(b.x + b.width * (0.1 + (0.8 * i) / 30), b.y + b.height * 0.5); await page.waitForTimeout(25); }
  }, 1, 2); // the TDR and TDT share the cursor: each readout once
  await page.click('[data-waves-kind-set="trace"]');
  await page.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
  await cpuSmall(page, 'mouse');
  await page.locator('[data-waves-run]').scrollIntoViewIfNeeded();
  await said('a full-wave run from start to end', async () => {
    await page.click('[data-waves-run]');
    await page.waitForSelector('[data-waves-results][data-stale="false"] [data-waves-player]', { timeout: 240000 });
    await page.mouse.move(0, 0);
  }, 1, 3, 2000); // "Running…" (when a message pause lets it settle) and "Done …"
  await page.locator('[data-waves-player]').scrollIntoViewIfNeeded();
  if ((await page.$eval('[data-waves-player]', (e) => e.getAttribute('data-player-playing'))) !== 'true') await page.click('[data-player-play]');
  await said('the player playing for two seconds', () => sleep(2000), 0, 0, 200);
  ok(page.errors.length === 0, () => `no errors (live): ${page.errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

/** Touch targets (WCAG 2.2 2.5.8): each at least 24 × 24 CSS px, or with a 24 px circle on its centre clear of every
 * other target and of the other small targets' circles. Inline links in a sentence are exempt; a checkbox counts with
 * its label; a target inside another (a handle on a drawing) is not counted against its container. */
const scanTargets = (page) => page.evaluate(() => {
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role="slider"], [tabindex="0"]';
  const vis = (e) => { if (e.closest('[hidden], [inert], dialog:not([open])') || e.disabled) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 2 && r.height > 2 && cs.visibility === 'visible'; };
  const rectOf = (e) => (e.matches('input[type=checkbox], input[type=radio]') && e.closest('label') ? e.closest('label') : e).getBoundingClientRect();
  const inline = (e) => {
    if (e.tagName !== 'A') return false;
    let b = e.parentElement;
    while (b && getComputedStyle(b).display.startsWith('inline')) b = b.parentElement;
    return !!b && b.textContent.trim().length > e.textContent.trim().length + 3;
  };
  const tag = (e) => `${e.tagName.toLowerCase()}${[...e.attributes].filter((a) => a.name.startsWith('data-') || a.name === 'aria-label').slice(0, 2).map((a) => `[${a.name}=${a.value.slice(0, 20)}]`).join('')}${e.textContent.trim() ? ` "${e.textContent.trim().slice(0, 16)}"` : ''}`;
  const ts = [...document.querySelectorAll(sel)].filter(vis).map((e) => ({ e, r: rectOf(e) }));
  const small = ts.filter((t) => !inline(t.e) && (t.r.width < 23.5 || t.r.height < 23.5));
  const c = (r) => [r.left + r.width / 2, r.top + r.height / 2];
  const dist = ([x, y], r) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
  const bad = [];
  for (const s of small) {
    const cs = c(s.r);
    const near = ts.find((t) => t !== s && !t.e.contains(s.e) && !s.e.contains(t.e) && !!t.e.closest("header") === !!s.e.closest("header") && (small.includes(t) ? Math.hypot(cs[0] - c(t.r)[0], cs[1] - c(t.r)[1]) < 24 : dist(cs, t.r) < 12));
    if (near) bad.push(`${tag(s.e)} ${s.r.width.toFixed(0)}×${s.r.height.toFixed(0)} near ${tag(near.e)}`);
  }
  return { n: ts.length, small: small.length, smallList: small.map((s) => `${tag(s.e)} ${s.r.width.toFixed(0)}×${s.r.height.toFixed(0)}`), bad };
});

// The same tasks by touch at 390 px.
if (part('touch')) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark', acceptDownloads: true });
  const page = await open(ctx, URL0);
  await page.evaluate(() => { window.__prints = 0; window.print = () => { window.__prints++; }; });
  await loadAll(page);
  const T = 'touch';
  const tap = (sel) => page.locator(sel).first().tap();
  const undoByTap = async () => { const q = await linkOf(page); await tap('[data-undo]'); await changed(page, q); await settled(page); };
  const targets = async (label) => {
    const t = await scanTargets(page);
    counts.targets += t.n;
    ok(t.bad.length === 0, () => `targets (${label}): ${t.bad.length} of ${t.n} under 24 px and crowded: ${t.bad.slice(0, 8).join(' | ')}`);
    return t;
  };
  const t0 = await targets('390 px, every section');
  console.log(`Targets under 24 px but spaced (390 px): ${t0.small} of ${t0.n}: ${[...new Set(t0.smallList)].slice(0, 30).join('; ')}`);

  await task(page, 'theme and short lines switches', T, async () => {
    const t1 = await page.$eval('[data-ready]', (e) => e.getAttribute('data-theme'));
    await tap('[data-theme-toggle]');
    const t2 = await page.$eval('[data-ready]', (e) => e.getAttribute('data-theme'));
    await tap('[data-theme-toggle]');
    return t1 !== t2 || 'a tap does not switch the theme';
  });
  await task(page, 'the status note\'s More', T, async () => { await tap('[data-status] summary'); return (await page.$eval('[data-status] details', (d) => d.open)) || 'a tap does not open More'; });
  await task(page, 'units and digits', T, async () => { await tap('[data-unit="mil"]'); const on = await page.$eval('[data-unit="mil"]', (e) => e.getAttribute('aria-pressed')); await tap('[data-unit="mm"]'); return on === 'true' || 'a tap does not choose mil'; });
  await task(page, 'edit a stackup layer, undo and redo', T, async () => {
    const q = await linkOf(page);
    await tap('[data-layer-kind="dielectric"] [data-field$=".t"] input');
    await page.keyboard.press('Control+a'); await page.keyboard.type('0.3'); await page.keyboard.press('Enter');
    if (!(await changed(page, q))) return 'a typed thickness does not change the setup';
    await settled(page); await undoByTap();
    return (await linkOf(page)) === q || 'a tap on Undo does not go back';
  });
  await task(page, 'pick a JLCPCB stackup', T, async () => {
    await tap('[data-jlc-open]');
    await page.waitForSelector('[data-jlc-key]', { timeout: 15000 });
    const q = await linkOf(page);
    await tap('[data-jlc-key]:not([aria-current])');
    if (!(await changed(page, q))) return 'a tap on a row does not pick it';
    await settled(page);
    if (await page.$('[data-jlc-close]')) await tap('[data-jlc-close]');
    await undoByTap();
    return (await linkOf(page)) === q || 'undo does not restore the stackup';
  });
  await task(page, 'set the trace (kind, width) and read the results', T, async () => {
    const q = await linkOf(page);
    await tap('[data-trace-kind]');
    const opts = await page.$$eval('[data-trace-kind] option:not([disabled])', (os) => os.map((o) => o.value));
    const cur = await page.$eval('[data-trace-kind]', (s) => s.value);
    await page.selectOption('[data-trace-kind]', opts.find((o) => o !== cur));
    if (!(await changed(page, q))) return 'choosing a kind does not change it';
    await settled(page); await undoByTap();
    const z0 = await page.$eval('[data-results] [data-q="z0"]', (e) => e.getAttribute('data-v'));
    await tap('[data-field="trace.w"] input');
    await page.keyboard.press('Control+a'); await page.keyboard.type('0.2'); await page.keyboard.press('Enter');
    await changed(page, q); await settled(page);
    const z1 = await page.$eval('[data-results] [data-q="z0"]', (e) => e.getAttribute('data-v'));
    await undoByTap();
    return z1 !== z0 || 'the typed width does not change Z0';
  });
  await task(page, 'drag a trace handle', T, async () => {
    const q = await linkOf(page);
    const [x, y] = await centre(page, '[data-handle="w"]');
    await touchDrag(page, x, y, 16, 0);
    if (!(await changed(page, q))) return 'a touch drag of the width handle does not change it';
    await settled(page); await undoByTap();
    return true;
  });
  await task(page, 'show the fields and move the probe', T, async () => {
    await tap('[data-field-on]');
    await page.waitForSelector('[data-field-overlay]', { state: 'attached', timeout: 20000 });
    await page.locator('[data-trace-view]').evaluate((e) => e.scrollIntoView({ block: 'center' })); const b = await page.locator('[data-trace-view]').boundingBox();
    await touchDrag(page, b.x + b.width * 0.3, b.y + b.height * 0.4, 0, 0, 0);
    await sleep(300);
    const p = await page.$eval('[data-field-probe]', (e) => e.getAttribute('data-field-probe'));
    await tap('[data-field-on]');
    return p === 'value' || p === 'none' || `a tap does not place the probe (${p})`;
  });
  await task(page, 'open an equation and its derivation and close them', T, async () => {
    await tap('[data-results] [data-eq-open="z0"]');
    await page.waitForSelector('[data-eq-panel]', { timeout: 15000 });
    await tap('[data-eq-derive]');
    await page.waitForSelector('dialog[open]', { timeout: 15000 });
    await tap('dialog[open] [data-derive-next]');
    await tap('dialog[open] [data-derive-close]');
    if (await page.$('dialog[open]')) return 'a tap on Close does not close the dialog';
    await tap('[data-eq-close]');
    return (await page.waitForFunction(() => !document.querySelector('[data-eq-panel]'), null, { timeout: 5000 }).then(() => true).catch(() => false)) || 'a tap on Close does not close the panel';
  });
  await task(page, 'run a sweep from the tools', T, async () => {
    await tap('[data-tool-tab="sweep"]');
    await tap('[data-sweep-run]');
    await page.waitForSelector('[data-sweep-result][data-state="done"]', { timeout: 30000 });
    const c0 = await page.$eval('[data-sweep-result] [data-plot-readout]', (e) => e.getAttribute('data-cursor'));
    await page.locator('[data-sweep-result] [data-plot-box]').first().evaluate((e) => e.scrollIntoView({ block: 'center' })); const b = await page.locator('[data-sweep-result] [data-plot-box]').first().boundingBox();
    await touchDrag(page, b.x + b.width * 0.8, b.y + b.height * 0.5, 0, 0, 0);
    const c1 = await page.$eval('[data-sweep-result] [data-plot-readout]', (e) => e.getAttribute('data-cursor'));
    await tap('[data-tool-tab="sweep"]');
    return c1 !== c0 || 'a tap on the plot does not move its cursor';
  });
  await task(page, 'follow a short line\'s link and come back', T, async () => {
    const link = page.locator('#via [data-why-link]').first();
    const href = await link.getAttribute('href');
    await link.tap();
    if (!(await page.waitForFunction((h) => window.location.hash === h, href, { timeout: 5000 }).then(() => true).catch(() => false))) return 'a tap does not follow the link';
    await page.goBack(); await sleep(400);
    return (await link.evaluate((e) => { const b = e.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; })) || 'Back does not return to the short line';
  });
  await task(page, 'drag a via handle', T, async () => {
    const q = await linkOf(page);
    const [x, y] = await centre(page, '[data-via-handle="pad:L1"]');
    await touchDrag(page, x, y, 12, 0);
    if (!(await changed(page, q))) return 'a touch drag of the pad does not change it';
    await settled(page); await undoByTap();
    return true;
  });
  await task(page, 'add and remove a return via', T, async () => {
    await tap('[data-via-add-mode]');
    await page.locator('[data-via-view="top"]').evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const b = await page.locator('[data-via-view="top"]').boundingBox();
    const q = await linkOf(page);
    await touchDrag(page, b.x + b.width - 30, b.y + 30, 0, 0, 0);
    if (!(await changed(page, q))) return 'a tap on the top view does not add a return via';
    await settled(page);
    await tap('[data-via-add-mode]');
    const n = await page.$$eval('[data-via-handle^="ret:"]', (es) => es.length);
    await tap(`[data-via-handle="ret:${n - 1}"]`);
    const q2 = await linkOf(page);
    await tap('[data-via-remove-sel]');
    if (!(await changed(page, q2))) return 'a tap on Remove does not remove it';
    await settled(page);
    return true;
  });
  await task(page, 'open the via\'s 3D view and turn it', T, async () => {
    await tap('[data-via3d-open]');
    await page.waitForSelector('[data-via3d-ready="true"]', { timeout: CR ? 20000 : 60000 });
    const c0 = await camera(page, '[data-via3d-host]', 'emsimVia3d');
    const [x, y] = await centre(page, '[data-via3d-host]');
    await touchDrag(page, x, y, 60, 10); await sleep(300);
    const c1 = await camera(page, '[data-via3d-host]', 'emsimVia3d');
    await tap('[data-via3d-open]');
    return c1 !== c0 || 'a touch drag does not turn the view';
  });
  await task(page, 'run, cancel and run a full-wave run', T, async () => {
    await tap('[data-waves-kind-set="trace"]');
    await page.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
    const c = await cpuSmall(page, 'touch'); if (c !== true) return c;
    await tap('[data-waves-run]');
    await page.waitForSelector('[data-waves-cancel]', { timeout: 20000 });
    await tap('[data-waves-cancel]');
    await page.waitForSelector('[data-waves-phase="cancelled"]', { timeout: 20000 });
    await tap('[data-waves-run]');
    await page.waitForSelector('[data-waves-results][data-stale="false"] [data-waves-player]', { timeout: 240000 });
    return true;
  });
  await task(page, 'play, pause and scrub the player', T, async () => {
    await page.locator('[data-waves-player]').scrollIntoViewIfNeeded();
    const p0 = await page.$eval('[data-waves-player]', (e) => e.getAttribute('data-player-playing'));
    await tap('[data-player-play]');
    const p1 = await page.$eval('[data-waves-player]', (e) => e.getAttribute('data-player-playing'));
    if (p1 === 'true') await tap('[data-player-play]');
    await page.locator('[data-player-time]').evaluate((e) => e.scrollIntoView({ block: 'center' })); const b = await page.locator('[data-player-time]').boundingBox();
    await touchDrag(page, b.x + b.width * 0.75, b.y + b.height / 2, 0, 0, 0);
    const n = Number(await page.$eval('[data-waves-player]', (e) => e.getAttribute('data-player-frames')));
    const f = Number(await page.$eval('[data-waves-player]', (e) => e.getAttribute('data-player-frame')));
    return (p0 !== p1 && Math.abs(f / (n - 1) - 0.75) < 0.1) || `play ${p0} → ${p1}, a tap at ¾ of the slider gives frame ${f} of ${n}`;
  });
  await task(page, 'open the waves\' 3D view and turn it', T, async () => {
    await tap('[data-waves3d-open]');
    await page.waitForSelector('[data-waves3d-ready="true"]', { timeout: CR ? 20000 : 60000 });
    const c0 = await camera(page, '[data-waves3d-host]', 'emsimWaves3d');
    const [x, y] = await centre(page, '[data-waves3d-host]');
    await touchDrag(page, x, y, 60, 10); await sleep(300);
    const c1 = await camera(page, '[data-waves3d-host]', 'emsimWaves3d');
    await targets('390 px, after a run with the player and the 3D view');
    await tap('[data-waves3d-open]');
    return c1 !== c0 || 'a touch drag does not turn the view';
  });
  await task(page, 'save a figure, a data file and print the report', T, async () => {
    let [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), tap('[data-export-save]')]);
    if (!dl.suggestedFilename()) return 'no figure file';
    [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), tap('[data-data-save]')]);
    if (!dl.suggestedFilename()) return 'no data file';
    await tap('[data-report-print]');
    return (await page.waitForFunction(() => window.__prints > 0, null, { timeout: 15000 }).then(() => true).catch(() => false)) || 'a tap on Print report does not print';
  });
  await task(page, 'open an example and undo it', T, async () => {
    const q = await linkOf(page);
    await tap('[data-example-link="ex-lvds-pair/w100"]');
    if (!(await changed(page, q))) return 'a tap on an example does not open it';
    await settled(page); await undoByTap();
    return (await linkOf(page)) === q || 'undo does not go back';
  });
  await task(page, 'follow a citation in the theory', T, async () => {
    const a = page.locator('#theory a[href^="#ref-"]').first();
    const href = await a.getAttribute('href');
    await a.tap();
    return (await page.waitForFunction((h) => window.location.hash === h, href, { timeout: 5000 }).then(() => true).catch(() => false)) || 'a tap does not follow the citation';
  });
  await task(page, 'jump to a section from the bar', T, async () => {
    await tap('nav a[href="#waves"]');
    return (await page.waitForFunction(() => window.location.hash === '#waves', null, { timeout: 5000 }).then(() => true).catch(() => false)) || 'a tap does not jump';
  });
  ok(page.errors.length === 0, () => `no errors (touch): ${page.errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}

// Reduced motion: nothing animates by itself; without it the same actions do (so the check sees them).
if (part('motion')) {
  const motion = async (reducedMotion) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
    const page = await open(ctx, URL0);
    await loadAll(page);
    const seen = await page.evaluate(async () => {
      const wait = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      let n = 0;
      const count = () => { n = Math.max(n, document.getAnimations().length); };
      const topic = document.querySelector('#theory [id]:not([id="theory-h"])');
      if (topic) { window.location.hash = topic.id; await wait(); count(); }
      const ex = document.querySelector('[data-example]');
      if (ex?.id) { window.location.hash = ex.id; await wait(); count(); }
      for (const b of [document.querySelector('[data-unit="mil"]'), document.querySelector('[data-unit="mm"]')]) { b?.click(); await wait(); count(); }
      return n;
    });
    const transitions = await page.evaluate(() => {
      let k = 0;
      for (const e of document.querySelectorAll('[data-ready] *')) {
        const cs = getComputedStyle(e);
        if (cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0) || (cs.animationName !== 'none' && cs.animationName !== '')) k++;
      }
      return k;
    });
    // The via's 3D view: after a turn by keys it stands still at once (no damping's glide) with reduced motion.
    await page.evaluate(() => { window.location.hash = ''; document.getElementById('via')?.scrollIntoView(); });
    await page.click('[data-via3d-open]');
    await page.waitForSelector('[data-via3d-ready="true"]', { timeout: CR ? 20000 : 60000 });
    const [x, y] = await centre(page, '[data-via3d-host]');
    await page.mouse.move(x, y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(x + 12 * i, y); await page.waitForTimeout(8); }
    await page.mouse.up();
    const c0 = await camera(page, '[data-via3d-host]', 'emsimVia3d');
    await sleep(400);
    const c1 = await camera(page, '[data-via3d-host]', 'emsimVia3d');
    await ctx.close();
    return { n: seen, transitions, glides: c0 !== c1 };
  };
  const reduced = await motion('reduce'), normal = await motion('no-preference');
  ok(reduced.n === 0 && reduced.transitions === 0, `reduced motion: no animation runs (${reduced.n} running, ${reduced.transitions} elements with a transition or animation)`);
  ok(!reduced.glides, 'reduced motion: the via\'s 3D view stops where a drag leaves it');
  ok(normal.n > 0 && normal.transitions > 0 && normal.glides, `without reduced motion the same actions animate (${normal.n} running, ${normal.transitions} elements, glide ${normal.glides}): the check sees them`);
  console.log('Reduced motion of the player and the 3D views during playback: ui-player.mjs ("reduced motion waits on frame 0") and ui-waves3d.mjs (reduced motion).');
}

// 200 % zoom (1440 px at 2×: 720 px CSS) and 320 px (reflow): no horizontal page scroll, no text cut, every control on
// the screen; plots, drawings, 3D views and wide equations scroll inside their own box.
if (part('layout')) {
  const layout = (page) => page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth > vw + 1;
    const scrolls = (e) => { for (let x = e.parentElement; x; x = x.parentElement) { const o = getComputedStyle(x).overflowX; if ((o === 'auto' || o === 'scroll') && x.scrollWidth > x.clientWidth) return true; } return false; };
    const cut = [], out = [];
    const tag = (e) => `${e.tagName.toLowerCase()}${[...e.classList].map((c) => `.${c.replace(/^\w+-module__\w+__/, '')}`).join('')}[${(e.textContent ?? '').trim().slice(0, 20)}]`;
    for (const e of document.querySelectorAll('#__next *')) {
      if (e.closest('svg, .katex, [hidden], dialog:not([open]), [class*="calm"]')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility !== 'visible') continue;
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own && (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 1) cut.push(tag(e));
      if (own && (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && e.scrollHeight > e.clientHeight + 2 && cs.webkitLineClamp === 'none') cut.push(`${tag(e)} (height)`);
      if (e.matches('button, a[href], input:not([type=file]), select, textarea, summary, [tabindex="0"]') && (r.right > vw + 1 || r.left < -1) && !scrolls(e)) out.push(tag(e));
    }
    return { scroll, sw: document.documentElement.scrollWidth, vw, cut: [...new Set(cut)], out: [...new Set(out)] };
  });
  // The via's side drawing: every layer label's text box inside the SVG's box (M9.1b; it was cut at the right edge).
  const labelsFit = (page) => page.evaluate(() => {
    const bad = [];
    let n = 0;
    for (const svg of document.querySelectorAll('svg[data-via-side]')) {
      const b = svg.getBoundingClientRect();
      for (const t of svg.querySelectorAll('[data-via-label]')) {
        n++;
        const r = t.getBoundingClientRect(), txt = [...t.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('');
        if (r.width < 1 || r.left < b.left - 0.5 || r.right > b.right + 0.5 || r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5) bad.push(`"${txt}" ${r.left.toFixed(1)}–${r.right.toFixed(1)} of ${b.left.toFixed(1)}–${b.right.toFixed(1)}`);
      }
    }
    return { n, bad };
  });
  for (const [what, vp] of [['390 px', { width: 390, height: 844, deviceScaleFactor: 2 }], ['1440 px', { width: 1440, height: 900, deviceScaleFactor: 1 }]]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, hasTouch: vp.width < 500 });
    for (const [setup, url] of [['default', URL0], ['pair', PAIR]]) {
      const page = await open(ctx, url);
      await loadAll(page);
      await page.evaluate(() => document.getElementById('via')?.scrollIntoView());
      await sleep(300);
      const l = await labelsFit(page);
      ok(l.n >= 2 && l.bad.length === 0, () => `${what} (${setup}): the via's ${l.n} layer labels inside the drawing: ${l.bad.slice(0, 4).join(' | ')}`);
      await page.close();
    }
    await ctx.close();
  }
  const cases = [
    ['200 % zoom at 1440 px', { width: 720, height: 450, deviceScaleFactor: 2 }],
    ['320 px', { width: 320, height: 640, deviceScaleFactor: 1 }],
  ];
  for (const [what, vp] of cases) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor, colorScheme: theme, hasTouch: vp.width < 500 });
      for (const [setup, url] of [['default', URL0], ['pair', PAIR]]) {
        const page = await open(ctx, url);
        await openAll(page);
        const r = await layout(page);
        counts.layouts++;
        ok(!r.scroll, `${what} (${theme}, ${setup}): no horizontal scroll (${r.sw} of ${r.vw})`);
        ok(r.cut.length === 0, () => `${what} (${theme}, ${setup}): no text cut: ${r.cut.slice(0, 6).join(' | ')}`);
        ok(r.out.length === 0, () => `${what} (${theme}, ${setup}): every control on the screen: ${r.out.slice(0, 6).join(' | ')}`);
        const l = await labelsFit(page);
        ok(l.n >= 2 && l.bad.length === 0, () => `${what} (${theme}, ${setup}): the via's ${l.n} layer labels inside the drawing: ${l.bad.slice(0, 4).join(' | ')}`);
        if (shots && theme === 'light' && setup === 'default') {
          for (const id of ['stackup', 'via']) {
            await page.evaluate((i) => document.getElementById(i)?.scrollIntoView(), id);
            await sleep(200);
            await page.screenshot({ path: join(shots, `emsim-access${TAG}-${what.replace(/[^a-z0-9]+/gi, '-')}-${id}.png`) });
          }
        }
        await page.close();
      }
      await ctx.close();
    }
  }
}

// Focus states, as a visitor sees them: 390 px dark and 1440 px light.
if (part('shots') && shots) {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(shots, { recursive: true });
  for (const [w, theme] of [[390, 'dark'], [1440, 'light']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, deviceScaleFactor: w < 500 ? 2 : 1, colorScheme: theme });
    const page = await open(ctx, URL0);
    await loadAll(page);
    await page.evaluate(() => document.activeElement?.blur());
    for (const [name, sel] of [['nav', 'nav a[href="#via"]'], ['seg', '[data-unit="mil"]'], ['input', '[data-field="trace.w"] input'], ['handle', '[data-handle="w"]'], ['eqnum', '[data-results] [data-eq-open="z0"]'], ['via-handle', '[data-via-handle="pad:L1"]'], ['via-view', '[data-via-view="top"]'], ['run', '[data-waves-run]']]) {
      const n = await tabTo(page, sel, 4000);
      if (n < 0) { ok(false, `shots: Tab reaches ${sel}`); continue; }
      await sleep(150);
      const b = await page.locator(sel).first().boundingBox();
      const pad = 60, x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
      await page.screenshot({ path: join(shots, `emsim-access${TAG}-focus-${name}-${w}-${theme}.png`), clip: { x, y, width: Math.min(w - x, b.width + 2 * pad, 600), height: Math.min(b.height + 2 * pad, 400) } });
    }
    await ctx.close();
  }
}
await browser.close();
if (TASKS.size) {
  console.log('\nTasks × keyboard / touch:');
  console.log('| Task | Keyboard | Touch |\n| --- | --- | --- |');
  for (const [t, r] of TASKS) console.log(`| ${t} | ${r.keys ?? '–'} | ${r.touch ?? '–'} |`);
}
console.log(`\nChecked ${counts.pairs} token pairs, ${counts.texts} texts, ${counts.fields} fields and ${counts.marks} marks on the page, ${counts.axNodes} accessibility nodes in ${counts.axStates} states, ${counts.tabStops} Tab stops, ${counts.targets} touch targets, ${counts.layouts} layouts.`);
console.log(`${passed} passed, ${failed} failed.`);
for (const f of failures) console.log(`FAILED ${f}`);
for (const k of new Set(KNOWN)) console.log(`KNOWN ${k}`);
console.log(`RESULT ${BROWSER} ${passed} ${failed}`);
process.exit(failed ? 1 : 0);
