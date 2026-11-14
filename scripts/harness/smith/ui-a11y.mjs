// Drives /smith-chart/main in the installed Edge (or Chrome) and checks its accessibility (step M9.1, milestones.md M9):
// - contrast: every colour token pair the page uses, in both themes, computed from styles/Smith.module.css (WCAG 2.2
//   AA: 4.5:1 for text, 3:1 for the chart's lines, part colours, form-field edges and the focus ring) and printed as a
//   table; then every visible text on a page with every panel open, its colour over its real background, and every
//   form field's edge, in both themes;
// - names and roles: the accessibility tree (CDP Accessibility.getFullAXTree) has no unnamed button, link, field,
//   slider, checkbox, select, radio, region, image or dialog and no focusable node without a name, on the page as
//   loaded and in eight states (solver, family, suggestions, sweep, derivation, explain, example, challenge); the
//   places that announce results are polite live regions;
// - keyboard alone: one Tab cycle through the whole page (every stop shows its focus; no trap: the cycle comes back
//   to its start), and every task by Tab, Enter, Space, arrows and typing only: build and edit a circuit, a handle's
//   arrows (the drag's equivalent), the chart's cursor, undo and redo, the short lines and their links to the theory
//   and back, the equations (variables, derivation in a modal dialog that keeps the focus and gives it back on
//   Escape), Explain, solve (mark, goal, Apply, suggestions, the family's slider, standard-value variants), sweep
//   (on, marker, plot, chart marker), the report's Print, every export option and file, Learn (example, challenge,
//   lesson link), the theory's topics and citations;
// - reduced motion: no animation or transition runs (and some do without it);
// - 200 % text: browser zoom 200 % (1440 px at 2×) and a 2× root font size at 320, 390 and 1440 px: no horizontal
//   scroll, no text cut by its box, every control inside the screen.
//   tsx ui-a11y.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';

const S = importedState.default ?? importedState;
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
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 80) failures.push(typeof what === 'function' ? what() : what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const counts = { pairs: 0, texts: 0, fields: 0, axNodes: 0, axStates: 0, tabStops: 0, tasks: 0, layouts: 0 };

// ---------- contrast: the tokens ----------

const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const over = (t, u) => [0, 1, 2].map((i) => t[i] * t[3] + u[i] * (1 - t[3])).concat(1);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const colour = (s) => {
  if (s.startsWith('#')) { const h = s.slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1); }
  const p = s.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
  return [p[0], p[1], p[2], p[3] ?? 1];
};
const css = readFileSync(join(repo, 'styles/Smith.module.css'), 'utf8');
const block = (start) => {
  const i = css.indexOf(start), j = css.indexOf('}', i), o = {};
  for (const m of css.slice(i, j).matchAll(/--([\w-]+):\s*([^;]+);/g)) o[m[1]] = m[2].trim();
  return o;
};
const LIGHT = block('.root {');
const DARK = { ...LIGHT, ...block(".root[data-theme='dark'] {") };
const DARK_SYSTEM = { ...LIGHT, ...block(".root:not([data-theme='light']) {") };
ok(JSON.stringify(DARK) === JSON.stringify(DARK_SYSTEM), 'the dark theme by the system and by the switch have the same tokens');
for (const t of [LIGHT, DARK]) t['chart-bg'] = t.field;
// The site footer's colours on this page (pages/smith-chart/main.tsx LIGHT and DARK).
const pageTsx = readFileSync(join(repo, 'pages/smith-chart/main.tsx'), 'utf8');
const footer = (name) => Object.fromEntries([...pageTsx.match(new RegExp(`const ${name} = \\{([^}]+)\\}`))[1].matchAll(/(\w+): '(#[0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]));
const PARTS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `part-${i}`);
// [what, foregrounds, backgrounds, needed]. Text tokens sit on every surface; the chart's inks and lines on the chart.
const PAIRS = [
  ['text', ['ink', 'ink-2', 'ink-3', 'accent', 'warn', ...PARTS], ['bg', 'field', 'raise'], 4.5],
  ['text on a pressed toggle or chip', ['ink', 'ink-2', 'accent'], ['accent-soft/field', 'accent-soft/bg', 'accent-soft/raise'], 4.5],
  ['chart text', ['grid-label', 'grid-y-ink', 'grid-scale-ink', 'ink', 'ink-2'], ['chart-bg'], 4.5],
  ['chart lines and parts', ['grid-axis', 'grid-z-major', 'grid-y-major', 'grid-scale', ...PARTS], ['chart-bg'], 3],
  ['focus ring', ['accent'], ['bg', 'field', 'raise'], 3],
  ['form-field edge', ['edge'], ['bg', 'field'], 3],
];
const surface = (t, name) => {
  if (!name.includes('/')) return colour(t[name]);
  const [top, under] = name.split('/');
  return over(colour(t[top]), colour(t[under]));
};
const table = [];
for (const [theme, t] of [['light', LIGHT], ['dark', DARK]]) {
  for (const [what, fgs, bgs, need] of PAIRS) {
    for (const fg of fgs) {
      for (const bg of bgs) {
        const B = surface(t, bg), q = ratio(over(colour(t[fg]), B), B);
        table.push({ theme, what, fg, bg, q, need });
        counts.pairs++;
        ok(q >= need, `contrast ${theme}: --${fg} on --${bg} is ${q.toFixed(2)}:1, under ${need}:1 (${what})`);
      }
    }
  }
  const f = footer(theme === 'light' ? 'LIGHT' : 'DARK');
  for (const fg of ['quiet', 'link', 'ink']) {
    const q = ratio(colour(f[fg]), colour(f.bg));
    table.push({ theme, what: 'site footer', fg: `footer ${fg}`, bg: 'footer bg', q, need: 4.5 });
    counts.pairs++;
    ok(q >= 4.5, `contrast ${theme}: the footer's ${fg} ${f[fg]} on ${f.bg} is ${q.toFixed(2)}:1`);
  }
}
{
  // The table, worst pair first per kind and theme.
  const kinds = [...new Set(table.map((r) => `${r.theme}|${r.what}`))];
  console.log('Contrast of the token pairs (WCAG 2.2 AA):');
  for (const k of kinds) {
    const rows = table.filter((r) => `${r.theme}|${r.what}` === k).sort((a, b) => a.q - b.q);
    console.log(`  ${k.replace('|', ', ')} (need ${rows[0].need}:1): lowest ${rows.slice(0, 3).map((r) => `--${r.fg} on --${r.bg} ${r.q.toFixed(2)}`).join('; ')}; ${rows.length} pairs`);
  }
  console.log('  not checked (decorative or carried by text too): --rule, --rule-strong (dividers, card and button outlines), --grid-z-minor and --grid-y-minor (density lines between the labelled major circles; the readout gives every point as text)');
}

// ---------- the page ----------

const START = S.encodeCircuit(S.defaultCircuit());
const FULL = `${START}&u=1,2&g=pt:50:0&sw=60e6:160e6:301&mk=95e6,120e6`;
const FAMILY = `${START}&u=1,2&g=vswr:1.5:within`;
const THREE = 'v=1&z0=50&f0=100e6&zl=100:-40&p=ls:20e-9,cp:10e-12,tl:0.1:50&g=pt:40:15';

async function open(context, search = START) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.addInitScript(() => { window.print = () => { window.__printed = (window.__printed ?? 0) + 1; }; });
  await page.goto(`${base}/smith-chart/main?${search}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
  return page;
}
const query = (page) => page.evaluate(() => window.location.search.slice(1));
const linked = async (page) => S.decodeCircuit(await query(page)).circuit;
const changed = (page, before) => page.waitForFunction((b) => window.location.search.slice(1) !== b, before, { timeout: 5000 }).then(() => true).catch(() => false);
const has = async (page, sel) => (await page.$(sel)) !== null;

// ---------- names and roles ----------

const NAMED = new Set(['button', 'link', 'textbox', 'spinbutton', 'slider', 'checkbox', 'combobox', 'radio', 'searchbox', 'switch', 'listbox', 'menuitem', 'tab', 'region', 'img', 'dialog', 'option', 'radiogroup']);
async function axAudit(page, label) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  const bad = new Map();
  for (const n of nodes) {
    if (n.ignored) continue;
    counts.axNodes++;
    const role = n.role?.value, name = (n.name?.value ?? '').trim();
    if (name) continue;
    const focusable = n.properties?.some((p) => p.name === 'focusable' && p.value.value);
    if (!NAMED.has(role) && !(focusable && role !== 'RootWebArea')) continue;
    let html = '';
    try {
      const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendDOMNodeId });
      // A text block given tabindex="-1" only so that a step can move the focus to it (read by its content; ARIA
      // forbids naming a paragraph) is not a control.
      html = (await cdp.send('Runtime.callFunctionOn', { objectId: object.objectId, returnByValue: true,
        functionDeclaration: 'function(){return this.tabIndex < 0 && !this.matches("a[href],button,input,select,textarea,summary,[role]") ? "" : this.outerHTML.slice(0,140)}' })).result.value;
      if (!html && !NAMED.has(role)) continue;
    } catch { /* not in the DOM */ }
    const k = `${role} ${html.replace(/class="[^"]*"/g, '')}`;
    bad.set(k, (bad.get(k) ?? 0) + 1);
  }
  await cdp.detach();
  counts.axStates++;
  ok(bad.size === 0, () => `names (${label}): ${[...bad].slice(0, 4).map(([k, v]) => `${v}× ${k}`).join(' | ')}`);
}

// ---------- contrast on the page ----------

const scanContrast = (page) => page.evaluate(() => {
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
  const bgOf = (el) => {
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
  const name1 = (el) => `${el.tagName.toLowerCase()}${[...(el.classList ?? [])].map((c) => `.${c.replace(/^\w+-module__\w+__/, '')}`).join('')}`;
  const name = (el) => (el.classList?.length || !el.parentElement ? name1(el) : `${name1(el.parentElement)} > ${name1(el)}`);
  const bad = new Map();
  let texts = 0, fields = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || el.closest('.katex-mathml, script, style, noscript, [hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || el.closest('button:disabled, input:disabled, select:disabled, fieldset:disabled, [aria-disabled="true"]')) continue;
    let op = 1;
    for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    if (op === 0) continue;
    const svg = el instanceof SVGElement;
    const fg = rgba(svg ? cs.fill : cs.color); fg[3] *= op;
    const bg = bgOf(svg ? el.closest('svg') ?? el : el);
    const size = parseFloat(cs.fontSize), large = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66);
    const q = ratio(over(fg, bg), bg);
    texts++;
    if (q < (large ? 3 : 4.5)) { const k = `${name(el)} ${q.toFixed(2)}:1 (${svg ? cs.fill : cs.color} on rgb(${bg.slice(0, 3).map(Math.round)}))`; bad.set(k, (bad.get(k) ?? 0) + 1); }
  }
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || el.disabled) continue;
    const cs = getComputedStyle(el), around = bgOf(el.parentElement), inside = over(rgba(cs.backgroundColor), around);
    const edge = Math.max(ratio(over(rgba(cs.borderTopColor), around), around), ratio(over(rgba(cs.borderBottomColor), around), around));
    fields++;
    if (edge < 3 && ratio(inside, around) < 3) { const k = `field ${name(el)} edge ${edge.toFixed(2)}:1`; bad.set(k, (bad.get(k) ?? 0) + 1); }
  }
  return { texts, fields, bad: [...bad] };
});

/** Lays out everything a visitor could open: every <details>, the sections' skipped contents. */
async function openAll(page) {
  await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
  await page.addStyleTag({ content: '*{content-visibility:visible!important}' });
  await page.evaluate(() => document.querySelector('[data-export]')?.scrollIntoView());
  await page.waitForFunction(() => (document.querySelector('[data-export]')?.smithExport?.builds ?? 1) > 0, null, { timeout: 5000 }).catch(() => {});
  await sleep(300);
  await frame(page);
}

for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  for (const [what, link] of [['solved, sweep, markers', FULL], ['family', FAMILY], ['suggestions', THREE]]) {
    const page = await open(ctx, link);
    if (theme === 'light') await axAudit(page, `${what}, as loaded`);
    await openAll(page);
    if (theme === 'light') await axAudit(page, `${what}, everything open`);
    const r = await scanContrast(page);
    counts.texts += r.texts;
    counts.fields += r.fields;
    ok(r.bad.length === 0, () => `contrast on the page (${theme}, ${what}; ${r.texts} texts): ${r.bad.slice(0, 6).map(([k, v]) => `${v}× ${k}`).join(' | ')}`);
    ok(page.errors.length === 0, () => `no errors (${theme}, ${what}): ${page.errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
  await ctx.close();
}

// ---------- live regions ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await open(ctx, FULL);
  const live = await page.evaluate(() => {
    const polite = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return 'absent';
      for (let x = e; x; x = x.parentElement) {
        if (x.getAttribute('aria-live') === 'polite' || x.getAttribute('role') === 'status') return 'polite';
        if (x.getAttribute('aria-live') === 'assertive' || x.getAttribute('role') === 'alert') return 'assertive';
      }
      return 'none';
    };
    return { solve: polite('[data-solve-status]'), exportNote: polite('[data-export-note]') };
  });
  ok(live.solve === 'polite', `the solver's message is a polite live region (${live.solve})`);
  ok(live.exportNote === 'polite', `the export's note is a polite live region (${live.exportNote})`);
  await page.close();
  await ctx.close();
}

// ---------- keyboard alone ----------

/** What has the focus, and whether it shows (an outline or ring on it, a ring drawn for it, or on a close parent). */
const focusState = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body || a === document.documentElement) return { none: true };
  const shows = (e) => { const cs = getComputedStyle(e); return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none'; };
  let shown = shows(a);
  const k = a.getAttribute('data-handle-key');
  if (!shown && k !== null) { const ring = document.querySelector(`[data-handle="${k}"]`); shown = !!ring && shows(ring); }
  if (!shown) for (const d of a.querySelectorAll('*')) if (shows(d)) { shown = true; break; }
  for (let e = a.parentElement, i = 0; !shown && e && i < 3; e = e.parentElement, i++) shown = shows(e);
  const attrs = [...a.attributes].filter((x) => x.name.startsWith('data-') || x.name === 'href' || x.name === 'id').map((x) => `${x.name}=${x.value.slice(0, 24)}`).join(' ');
  return { key: `${a.tagName.toLowerCase()} ${attrs}`.trim(), shown };
});
/** Presses Tab (or Shift+Tab) until the focused element matches `sel`; the number of presses, or -1. */
async function tabTo(page, sel, max = 600, back = false) {
  for (let i = 0; i <= max; i++) {
    if (await page.evaluate((s) => !!document.activeElement?.matches(s), sel)) return i;
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
  }
  return -1;
}
async function task(page, what, sel, back = false) {
  const n = await tabTo(page, sel, 900, back);
  ok(n >= 0, `keys: Tab reaches ${what} (${sel})`);
  if (n >= 0) ok((await focusState(page)).shown, `keys: ${what} shows its focus`);
  counts.tasks++;
  return n >= 0;
}
const focusIn = (page, sel) => page.evaluate((s) => !!document.activeElement?.closest(s), sel);

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });

  // One Tab cycle through the whole page.
  {
    const page = await open(ctx, FULL);
    const seen = new Map(), hidden = new Map();
    await page.keyboard.press('Tab');
    const first = (await focusState(page)).key;
    let back = false, i = 0;
    for (; i < 4000; i++) {
      const f = await focusState(page);
      // Next.js's dev overlay (not in the built site) takes a stop of its own.
      if (!f.none && !f.key.startsWith('nextjs-portal')) {
        if (i > 0 && f.key === first) { back = true; break; }
        seen.set(f.key, (seen.get(f.key) ?? 0) + 1);
        if (!f.shown) hidden.set(f.key, (hidden.get(f.key) ?? 0) + 1);
      }
      await page.keyboard.press('Tab');
    }
    counts.tabStops = i;
    ok(back, `Tab comes back to the first stop (${first}) after the whole page: no trap (${i} presses)`);
    ok(first.startsWith('a href=/'), `the first Tab stop is the home link (${first})`);
    ok(hidden.size === 0, () => `every Tab stop shows its focus: ${[...hidden].slice(0, 6).map(([k, v]) => `${v}× ${k}`).join(' | ')}`);
    console.log(`Tab cycle: ${i} stops, ${seen.size} different`);
    // The bar's "Tool" link takes the focus to the tool: the next Tab is in it (a skip link).
    await page.keyboard.press('Shift+Tab');
    await tabTo(page, 'a[href="#tool"]');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    ok(await focusIn(page, '#tool'), 'Enter on the bar\'s Tool link, then Tab: the focus is in the tool (the skip link)');
    await page.close();
  }

  // Build and edit a circuit, the handles, the chart, undo and redo.
  {
    const page = await open(ctx, START);
    await page.keyboard.press('Tab');
    const n0 = (await linked(page)).parts.length;
    if (await task(page, 'the kind list', '[data-add-kind]')) {
      await page.keyboard.press('ArrowDown');
      await task(page, 'Add', '[data-add]');
      let q = await query(page);
      await page.keyboard.press('Enter');
      await changed(page, q);
      ok((await linked(page)).parts.length === n0 + 1, 'keys: Enter on Add adds a part');
      ok(await focusIn(page, '[data-tile]'), 'keys: the new part has the focus');
      // Open its card and type a value.
      await page.keyboard.press('Enter');
      await frame(page);
      if (await task(page, 'the part\'s value field', '[data-card] input:not([type])')) {
        const text = await page.evaluate(() => document.activeElement.value);
        const m = text.match(/^([\d.]+)\s*(.*)$/);
        q = await query(page);
        await page.keyboard.press('Control+a');
        await page.keyboard.type(m ? `${Number(m[1]) * 2} ${m[2]}` : '2');
        await page.keyboard.press('Enter');
        ok(await changed(page, q), `keys: a typed value (${text} → ×2) changes the circuit`);
      }
    }
    // A handle's arrows: the drag's equivalent.
    if (await task(page, 'a part\'s handle on the chart', '[data-handle-key]', true)) {
      const q = await query(page);
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
      ok(await changed(page, q), 'keys: arrows on a handle change its part');
    }
    // The chart's cursor.
    if (await task(page, 'the chart', '[data-chart]', true)) {
      const before = await page.textContent('[data-readout]');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowUp');
      await frame(page);
      ok((await page.textContent('[data-readout]')) !== before, 'keys: arrows on the chart move the readout\'s point');
    }
    // Undo and redo by keys and by the buttons.
    {
      const q = await query(page);
      await page.keyboard.press('Control+z');
      ok(await changed(page, q), 'keys: Ctrl+Z undoes');
      const q2 = await query(page);
      await page.keyboard.press('Control+y');
      ok(await changed(page, q2) && (await query(page)) === q, 'keys: Ctrl+Y redoes');
      if (await task(page, 'Undo', '[data-undo]')) {
        await page.keyboard.press('Enter');
        ok(await changed(page, q), 'keys: Enter on Undo undoes');
      }
      if (await task(page, 'Redo', '[data-redo]')) {
        await page.keyboard.press('Enter');
        await sleep(50);
        ok((await query(page)) === q, 'keys: Enter on Redo redoes');
      }
    }
    // A short line, its link to the theory, and back.
    if (await task(page, 'a short line\'s button', '#tool [data-why]')) {
      const key = await page.evaluate(() => document.activeElement.getAttribute('data-why'));
      await page.keyboard.press('Enter');
      await frame(page);
      ok(await has(page, `[data-why-bubble="${key}"]`), 'keys: Enter opens the short line');
      await page.keyboard.press('Escape');
      await frame(page);
      ok(!(await has(page, `[data-why-bubble="${key}"]`)) && (await page.evaluate(() => document.activeElement?.getAttribute('data-why'))) === key, 'keys: Escape closes it and the focus stays on its button');
      await page.keyboard.press('Enter');
      await frame(page);
      if (await task(page, 'the short line\'s link to the theory', `[data-why-link="${key}"]`)) {
        await page.keyboard.press('Enter');
        await sleep(300);
        ok((await page.evaluate(() => window.location.hash)).length > 1 && await focusIn(page, '#theory'), 'keys: the link opens the topic with the focus in it');
        if (await task(page, '↩ Back to the tool', '[data-back-to-tool]')) {
          await page.keyboard.press('Enter');
          await sleep(300);
          ok(await page.evaluate((k) => document.activeElement?.getAttribute('data-why') === k, key), 'keys: ↩ Back gives the focus back to the short line\'s button');
        }
      }
    }
    // The equations: a row, its variables, its derivation in a modal dialog.
    if (await task(page, 'an equation', '[data-math-eq]')) {
      await page.keyboard.press('ArrowRight');
      await frame(page);
      ok(await page.evaluate(() => !!document.querySelector('[data-lit]')), 'keys: → steps to a variable and lights up what it stands for');
      await axAudit(page, 'an equation focused');
      if (await task(page, 'Derive', '[data-derive-open]')) {
        await page.keyboard.press('Enter');
        await page.waitForSelector('dialog[open]', { timeout: 3000 }).catch(() => {});
        ok(await has(page, 'dialog[open]'), 'keys: Enter on Derive opens the derivation');
        let inside = true;
        for (let j = 0; j < 25; j++) { await page.keyboard.press('Tab'); inside &&= await page.evaluate(() => !!document.activeElement?.closest('dialog[open]') || document.activeElement === document.body); }
        ok(inside, 'keys: Tab stays in the derivation (a modal dialog; past its last control the focus goes to the browser, never to the page behind)');
        await axAudit(page, 'derivation open');
        await page.keyboard.press('Escape');
        await frame(page);
        ok(!(await has(page, 'dialog[open]')) && await page.evaluate(() => document.activeElement?.hasAttribute('data-derive-open')), 'keys: Escape closes the derivation and gives the focus back to Derive');
      }
    }
    // Explain.
    if (await task(page, 'Explain', '[data-explain-open]', true)) {
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-explain]', { timeout: 3000 }).catch(() => {});
      ok(await has(page, '[data-explain]'), 'keys: Enter on Explain shows the explanation');
      await axAudit(page, 'explain');
      if (await task(page, 'the explanation\'s Derive', '[data-explain-derive]')) {
        await page.keyboard.press('Enter');
        await page.waitForSelector('dialog[open]', { timeout: 3000 }).catch(() => {});
        ok(await has(page, 'dialog[open]'), 'keys: the explanation\'s derivation opens');
        await page.keyboard.press('Escape');
        await frame(page);
        ok(!(await has(page, 'dialog[open]')), 'keys: Escape closes it');
      }
    }
    // The report's Print.
    if (await task(page, 'Print report', '[data-print-report]')) {
      await page.keyboard.press('Enter');
      await sleep(200);
      ok(await page.evaluate(() => window.__printed === 1), 'keys: Enter on Print report prints');
    }
    ok(page.errors.length === 0, () => `keys, circuit: no errors: ${page.errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }

  // Solve: mark, goal, Apply; suggestions; the family; variants.
  {
    const page = await open(ctx, START);
    await page.keyboard.press('Tab');
    for (const [i, u] of [[0, 'u=1'], [1, 'u=1,2']]) {
      // The strip is one Tab stop; its arrows walk the parts.
      if (await task(page, 'the strip', '[data-tile]')) {
        for (let j = 0; j < 10 && !(await page.evaluate((i) => document.activeElement?.getAttribute('data-tile') === String(i), i)); j++) {
          await page.keyboard.press(await page.evaluate((i) => Number(document.activeElement.getAttribute('data-tile')) > i, i) ? 'ArrowRight' : 'ArrowLeft');
        }
        ok(await page.evaluate((i) => document.activeElement?.getAttribute('data-tile') === String(i), i), `keys: arrows reach part ${i + 1} in the strip`);
        await page.keyboard.press('Enter');
        await frame(page);
        if (await task(page, '"Solve for" on its card', '[data-solve-mark="value"]')) {
          const q = await query(page);
          await page.keyboard.press('Space');
          await changed(page, q);
          const now = await query(page);
          ok(now.includes(u), `keys: Space marks part ${i + 1} (${now})`);
        }
      }
    }
    if (await task(page, 'the goal\'s kind', '[data-goal-kind]')) {
      const q = await query(page);
      await page.keyboard.press('ArrowDown');
      await changed(page, q);
      ok((await query(page)).includes('g='), 'keys: the goal by arrow keys');
    }
    await page.waitForFunction(() => document.querySelector('[data-solve-status]')?.getAttribute('data-solve-status') === 'solved', null, { timeout: 8000 }).catch(() => {});
    await axAudit(page, 'solved');
    if (await task(page, 'a solution\'s Apply', '[data-apply]')) {
      const q = await query(page);
      await page.keyboard.press('Enter');
      ok(await changed(page, q), 'keys: Enter on Apply applies the solution');
      await page.keyboard.press('Control+z');
    }
    await page.close();

    const sug = await open(ctx, THREE);
    await sug.keyboard.press('Tab');
    await sug.waitForSelector('[data-suggestion="0"]', { timeout: 8000 }).catch(() => {});
    await axAudit(sug, 'suggestions');
    if (await task(sug, 'a suggestion', '[data-suggestion="0"]') && await task(sug, 'its Apply', '[data-apply-suggestion="0"]')) {
      const q = await query(sug);
      await sug.keyboard.press('Enter');
      ok(await changed(sug, q), 'keys: Enter applies the suggestion');
    }
    await sug.close();

    const fam = await open(ctx, FAMILY);
    await fam.keyboard.press('Tab');
    await fam.waitForSelector('[data-family-slider]', { timeout: 8000 }).catch(() => {});
    await axAudit(fam, 'family');
    if (await task(fam, 'the family\'s slider', '[data-family-slider]')) {
      const t0 = await fam.getAttribute('[data-family-slider]', 'data-t');
      for (let j = 0; j < 10; j++) await fam.keyboard.press('ArrowRight');
      await frame(fam);
      ok((await fam.getAttribute('[data-family-slider]', 'data-t')) !== t0, 'keys: arrows move the family\'s slider');
      if (await task(fam, 'the member\'s Apply', '[data-apply-member]')) {
        const q = await query(fam);
        await fam.keyboard.press('Enter');
        ok(await changed(fam, q), 'keys: Enter applies the family\'s member');
      }
    }
    await fam.close();

    const vr = await open(ctx, `${START}&u=1,2&g=pt:50:0`);
    await vr.keyboard.press('Tab');
    await vr.waitForSelector('[data-variant-fold], [data-apply-variant]', { timeout: 8000 }).catch(() => {});
    if (await has(vr, '[data-variant-fold]') && !(await vr.$eval('[data-variant-fold]', (e) => e.tagName !== 'DETAILS' || e.open))) {
      if (await task(vr, 'the variants\' fold', '[data-variant-fold] > summary, [data-variant-fold]')) await vr.keyboard.press('Enter');
    }
    if (await task(vr, 'a standard-value variant\'s Apply', '[data-apply-variant]')) {
      const q = await query(vr);
      await vr.keyboard.press('Enter');
      ok(await changed(vr, q), 'keys: Enter applies a variant');
    }
    ok(vr.errors.length === 0, () => `keys, solve: no errors: ${vr.errors.slice(0, 3).join(' | ')}`);
    await vr.close();
  }

  // Sweep: on, a marker, the plot, a chart marker.
  {
    const page = await open(ctx, START);
    await page.keyboard.press('Tab');
    if (await task(page, 'the sweep\'s switch', '[data-sweep-on]')) {
      const q = await query(page);
      await page.keyboard.press('Space');
      await changed(page, q);
      ok((await query(page)).includes('sw='), 'keys: Space turns the sweep on');
    }
    if (await task(page, 'Add marker', '[data-sweep-add]')) {
      const q = await query(page);
      await page.keyboard.press('Enter');
      await changed(page, q);
      ok((await query(page)).includes('mk='), 'keys: Enter adds a marker');
    }
    await page.waitForSelector('[data-plot]', { timeout: 5000 }).catch(() => {});
    await axAudit(page, 'sweep');
    if (await task(page, 'the plot', '[data-plot]')) {
      const before = await page.innerHTML('[data-plot]');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await frame(page);
      ok((await page.innerHTML('[data-plot]')) !== before, 'keys: arrows on the plot point at a frequency');
    }
    if (await task(page, 'the plot\'s VSWR switch', '[data-plot-kind="vswr"]', true)) {
      const q = await query(page);
      await page.keyboard.press('Enter');
      ok(await changed(page, q), 'keys: Enter switches the plot to VSWR');
    }
    if (await task(page, 'a marker on the chart', '[data-sweep-marker]', true)) {
      const q = await query(page);
      await page.keyboard.press('ArrowRight');
      ok(await changed(page, q), 'keys: arrows move a marker on the chart');
    }
    await page.close();
  }

  // Export: the toolbar's link, every option, every file.
  {
    const page = await open(ctx, FULL);
    let downloads = 0, choosers = 0;
    page.on('download', () => { downloads++; });
    page.on('filechooser', () => { choosers++; });
    await page.keyboard.press('Tab');
    if (await task(page, 'the toolbar\'s Export link', '[data-export-link]')) {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      ok(await focusIn(page, '[data-export]'), 'keys: Enter on Export, then Tab: the focus is in the export');
    }
    await page.waitForFunction(() => document.querySelector('[data-export]').smithExport?.builds > 0, null, { timeout: 5000 }).catch(() => {});
    const done = { toggles: 0, pressed: 0, checks: 0, selects: 0, files: 0, copies: 0, fields: 0, stops: 0, hidden: [] };
    for (let j = 0; j < 200 && await focusIn(page, '[data-export]'); j++) {
      const f = await page.evaluate(() => {
        const a = document.activeElement;
        return { tag: a.tagName, type: a.type, pressed: a.getAttribute('aria-pressed'), file: [...a.attributes].map((x) => x.name).find((n) => /^data-export-(svg|png|tex-save|csv|s1p|project)$/.test(n)) ?? '',
          copy: a.hasAttribute('data-export-copy') || a.hasAttribute('data-export-link-copy'), open: a.hasAttribute('data-export-open'), checked: a.checked, value: a.value };
      });
      const fs = await focusState(page);
      done.stops++;
      if (!fs.shown) done.hidden.push(fs.key);
      if (f.pressed === 'false') {
        const key = fs.key;
        await page.keyboard.press('Enter');
        await frame(page);
        done.toggles++;
        if (await page.evaluate(() => document.activeElement.getAttribute('aria-pressed') === 'true')) done.pressed++;
        else failures.length < 80 && failures.push(`export: Enter on ${key} does not press it`);
      } else if (f.tag === 'INPUT' && f.type === 'checkbox') {
        await page.keyboard.press('Space');
        ok(await page.evaluate((c) => document.activeElement.checked !== c, f.checked), `export: Space toggles ${fs.key}`);
        await page.keyboard.press('Space');
        done.checks++;
      } else if (f.tag === 'SELECT') {
        await page.keyboard.press('ArrowDown');
        ok(await page.evaluate((v) => document.activeElement.value !== v, f.value), `export: ↓ changes ${fs.key}`);
        done.selects++;
      } else if (f.file) {
        const n = downloads;
        await page.keyboard.press('Enter');
        await page.waitForEvent('download', { timeout: 15000 }).catch(() => {});
        await sleep(50);
        ok(downloads > n, `export: Enter on ${fs.key} saves a file`);
        done.files++;
      } else if (f.copy) {
        await page.evaluate(() => navigator.clipboard.writeText(''));
        await page.keyboard.press('Enter');
        await sleep(300);
        ok((await page.evaluate(() => navigator.clipboard.readText())).length > 20, `export: Enter on ${fs.key} copies`);
        done.copies++;
      } else if (f.open) {
        const n = choosers;
        await page.keyboard.press('Space');
        await sleep(300);
        ok(choosers > n, 'export: Space on Open project opens the file picker');
        done.files++;
      } else if (f.tag === 'INPUT') done.fields++;
      await page.keyboard.press('Tab');
    }
    ok(done.hidden.length === 0, () => `export: every stop shows its focus: ${done.hidden.slice(0, 4).join(' | ')}`);
    ok(done.toggles >= 10 && done.pressed === done.toggles, `export: every option by Enter (${done.pressed} of ${done.toggles})`);
    ok(done.files >= 9 && done.copies >= 2, `export: every file by keys (${done.files} files, ${done.copies} copies)`);
    console.log(`Export by keys: ${done.stops} stops, ${done.toggles} options pressed, ${done.checks} boxes, ${done.selects} lists, ${done.fields} fields, ${done.files} files, ${done.copies} copies`);
    ok(page.errors.length === 0, () => `keys, export: no errors: ${page.errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }

  // Learn: an example, a challenge, the lesson link; the theory's topics and citations.
  {
    const page = await open(ctx, START);
    await page.keyboard.press('Tab');
    if (await task(page, 'the first example', '[data-example]')) {
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-guide]', { timeout: 5000 }).catch(() => {});
      ok(await has(page, '[data-guide]'), 'keys: Enter loads the example\'s guide');
      await axAudit(page, 'example');
      if (await task(page, 'the guide\'s Close', '[data-guide-close]')) {
        await page.keyboard.press('Enter');
        await frame(page);
        ok(!(await has(page, '[data-guide]')), 'keys: Enter closes the guide');
      }
    }
    if (await task(page, 'a challenge', '[data-challenge-kind]')) {
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-challenge]', { timeout: 5000 }).catch(() => {});
      ok(await has(page, '[data-challenge]'), 'keys: Enter starts a challenge');
      await axAudit(page, 'challenge');
      if (await task(page, 'Hint', '[data-challenge-hint]')) {
        await page.keyboard.press('Enter');
        await frame(page);
        ok(await page.evaluate(() => document.querySelectorAll('[data-hints] li, [data-hint]').length > 0), 'keys: Enter shows a hint');
      }
      if (await task(page, 'Check', '[data-challenge-check]')) {
        const before = await page.textContent('[data-challenge-state]');
        await page.keyboard.press('Enter');
        await page.waitForFunction((b) => document.querySelector('[data-challenge-state]')?.textContent !== b, before, { timeout: 3000 }).catch(() => {});
        ok((await page.textContent('[data-challenge-state]')) !== before, `keys: Enter on Check answers in the state line ("${before}")`);
      }
      if (await task(page, 'the challenge\'s Close', '[data-challenge-close]')) {
        await page.keyboard.press('Enter');
        await frame(page);
        ok(!(await has(page, '[data-challenge]')), 'keys: Enter closes the challenge');
      }
    }
    if (await task(page, '"Make a lesson link"', '[data-lesson-maker] > summary')) {
      await page.keyboard.press('Enter');
      await frame(page);
      if (await task(page, 'Copy link', '[data-lesson-copy]')) {
        await page.keyboard.press('Enter');
        await sleep(300);
        ok((await page.evaluate(() => navigator.clipboard.readText())).includes('/smith-chart/main?'), 'keys: Copy link copies the lesson link');
      }
    }
    if (await task(page, 'a theory topic', '#theory [data-topic] > summary')) {
      const id = await page.evaluate(() => document.activeElement.parentElement.id);
      const open0 = await page.evaluate(() => document.activeElement.parentElement.open);
      await page.keyboard.press('Enter');
      await frame(page);
      ok(await page.evaluate(([id, o]) => document.getElementById(id).open !== o, [id, open0]), 'keys: Enter folds or opens a topic');
      await page.keyboard.press('Enter');
    }
    if (await task(page, 'a citation', '#theory a[data-cite], #theory a[href^="#ref-"]')) {
      await page.keyboard.press('Enter');
      await sleep(200);
      ok((await page.evaluate(() => window.location.hash)).startsWith('#ref'), 'keys: Enter on a citation goes to its reference');
    }
    ok(page.errors.length === 0, () => `keys, learn and theory: no errors: ${page.errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
  await ctx.close();
}

// ---------- reduced motion ----------
{
  const motion = async (reducedMotion) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
    const page = await open(ctx, START);
    const seen = await page.evaluate(async () => {
      const wait = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      let n = 0;
      const count = () => { n = Math.max(n, document.getAnimations().length); };
      // A topic's highlight (a #link), a fold's chevron, a button's hover colour.
      const link = document.querySelector('[data-why-link]') ?? document.querySelector('#theory a[href^="#"]');
      const topic = document.querySelector('#theory [data-topic]');
      if (topic) { window.location.hash = topic.id; await wait(); count(); topic.open = !topic.open; await wait(); count(); }
      const button = document.querySelector('[data-snap-toggle]');
      button?.click(); await wait(); count(); button?.click(); await wait(); count();
      const ref = document.querySelector('[id^="ref-"]');
      if (ref) { window.location.hash = ref.id; await wait(); count(); }
      return { n, link: !!link };
    });
    let transitions = await page.evaluate(() => {
      let k = 0;
      for (const e of document.querySelectorAll('.' + CSS.escape(document.querySelector('header').parentElement.classList[0]) + ' *')) {
        const cs = getComputedStyle(e);
        if (cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0) || (cs.animationName !== 'none' && cs.animationName !== '')) k++;
      }
      return k;
    });
    await ctx.close();
    return { ...seen, transitions };
  };
  const reduced = await motion('reduce'), normal = await motion('no-preference');
  ok(reduced.n === 0 && reduced.transitions === 0, `reduced motion: no animation runs (${reduced.n} running, ${reduced.transitions} elements with a transition or animation)`);
  ok(normal.n > 0 && normal.transitions > 0, `without reduced motion the same actions animate (${normal.n} running, ${normal.transitions} elements): the check sees them`);
}

// ---------- 200 % text and narrow screens ----------
{
  const layout = (page) => page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth > vw + 1;
    const scrolls = (e) => { for (let x = e.parentElement; x; x = x.parentElement) { const o = getComputedStyle(x).overflowX; if ((o === 'auto' || o === 'scroll') && x.scrollWidth > x.clientWidth) return true; } return false; };
    const cut = [], out = [];
    const tag = (e) => `${e.tagName.toLowerCase()}${[...e.classList].map((c) => `.${c.replace(/^\w+-module__\w+__/, '')}`).join('')}[${(e.textContent ?? '').trim().slice(0, 20)}]`;
    for (const e of document.querySelectorAll('#__next *')) {
      if (e.closest('svg, .katex, [data-export-frame], [hidden], dialog:not([open])')) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(e);
      if (cs.visibility !== 'visible') continue;
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own && (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 1) cut.push(tag(e));
      if (own && (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && e.scrollHeight > e.clientHeight + 2 && cs.webkitLineClamp === 'none') cut.push(`${tag(e)} (height)`);
      if (e.matches('button, a[href], input:not([type=file]), select, textarea, summary, [tabindex="0"]') && (r.right > vw + 1 || r.left < -1) && !scrolls(e) && !e.closest('[data-why-bubble]')) out.push(tag(e));
    }
    return { scroll, cut: [...new Set(cut)], out: [...new Set(out)] };
  });
  const cases = [
    ['browser zoom 200 % at 1440 px', { width: 720, height: 450, deviceScaleFactor: 2 }, false],
    ['2× text at 320 px', { width: 320, height: 640 }, true],
    ['2× text at 390 px', { width: 390, height: 800 }, true],
    ['2× text at 1440 px', { width: 1440, height: 900 }, true],
    ['320 px', { width: 320, height: 640 }, false],
  ];
  for (const [what, vp, big] of cases) {
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor ?? 1, colorScheme: theme, hasTouch: vp.width < 500 });
      const page = await open(ctx, FULL);
      if (big) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await openAll(page);
      const r = await layout(page);
      counts.layouts++;
      ok(!r.scroll, `${what} (${theme}): no horizontal scroll`);
      ok(r.cut.length === 0, () => `${what} (${theme}): no text cut: ${r.cut.slice(0, 6).join(' | ')}`);
      ok(r.out.length === 0, () => `${what} (${theme}): every control on the screen: ${r.out.slice(0, 6).join(' | ')}`);
      if (big) ok(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-readout]') ?? document.body).fontSize) >= 24), `${what} (${theme}): the text follows the root size`);
      if (shots && theme === 'light') {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: join(shots, `a11y-${what.replace(/[^a-z0-9]+/gi, '-')}.png`), clip: { x: 0, y: 0, width: Math.min(vp.width, 1000), height: Math.min(vp.height, 1000) } });
      }
      await ctx.close();
    }
  }
}

await browser.close();
stopServer();
console.log(`Checked ${counts.pairs} token pairs, ${counts.texts} texts and ${counts.fields} fields on the page, ${counts.axNodes} accessibility nodes in ${counts.axStates} states, ${counts.tabStops} Tab stops, ${counts.tasks} keyboard steps, ${counts.layouts} layouts.`);
console.log(`${passed} passed, ${failed} failed.`);
for (const f of failures) console.log(`FAILED ${f}`);
process.exit(failed ? 1 : 0);
