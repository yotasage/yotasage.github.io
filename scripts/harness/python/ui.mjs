// Python Playground 3-Browser UI Harness (`npm run ui [base URL]` in scripts/harness/python/).
// Verifies /python/main against the real static export (out/ served with ZERO custom security headers)
// across Edge (msedge), Firefox, and WebKit: desktop (1280x800) & phone (375x812),
// Light & Dark themes, EN & NB languages, interactive Monaco/xterm/Run/input()/Traceback/Stop/REPL,
// and all W1-W9 security UI flows.
//
// Usage:
//   node ui.mjs                         # builds out/, serves on http://localhost:3023, tests all 3 browsers
//   node ui.mjs --no-build              # reuses existing out/
//   node ui.mjs http://localhost:3023   # runs against an already-running server
//   PYTHON_BROWSERS=edge,firefox,webkit # optional browser filter

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, firefox, webkit } from 'playwright-core';

import { startHarnessServers } from './servers.mjs';
import { runFilesUiSuite } from './ui-files-checks.mjs';
import { runDisplayUiSuite } from './ui-display-checks.mjs';
import { runExamplesUiSuite } from './ui-examples-checks.mjs';
import { runPackagesUiSuite } from './ui-packages-checks.mjs';
import { runPlotsUiSuite } from './ui-plots-checks.mjs';
import { runSelectionUiSuite } from './ui-selection-checks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const outDir = join(repoRoot, 'out');

const rawArgs = process.argv.slice(2);
const noBuild = rawArgs.includes('--no-build');
const externalBaseUrl = rawArgs.find((a) => !a.startsWith('-')) || '';
const BROWSERS = (process.env.PYTHON_BROWSERS || 'edge,firefox,webkit')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const table = new Map();
const allFailures = [];
let totalPassed = 0;
let totalFailed = 0;

function setCell(feature, browser, val) {
  const row = table.get(feature) || {};
  row[browser] = val;
  table.set(feature, row);
}

async function record(browser, name, fn, note = '', timeoutMs = 60000) {
  let res;
  let timer = null;
  try {
    res = await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
      }),
    ]);
  } catch (err) {
    res = `threw ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res === true || (res && typeof res === 'object' && res.ok === true)) {
    const finalNote = (res && typeof res === 'object' && res.note) || note;
    totalPassed += 1;
    setCell(name, browser, finalNote ? `ok (${finalNote})` : 'ok');
    console.log(`  PASS [${browser}] ${name}${finalNote ? ` (${finalNote})` : ''}`);
    return true;
  }
  totalFailed += 1;
  const reason = typeof res === 'string' ? res : 'failed';
  setCell(name, browser, 'FAIL');
  allFailures.push(`[${browser}] ${name}: ${reason}`);
  console.log(`  FAIL [${browser}] ${name}: ${reason}`);
  return false;
}

async function launchBrowser(name) {
  if (name === 'edge' || name === 'msedge' || name === 'chromium') {
    return chromium.launch({ channel: 'msedge' });
  }
  if (name === 'firefox') {
    return firefox.launch();
  }
  if (name === 'webkit') {
    return webkit.launch();
  }
  throw new Error(`Unknown browser: ${name}`);
}

function attachErrorTracker(page, { allowCspProbe = false } = {}) {
  const errors = [];
  const onConsole = (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (allowCspProbe && text.includes('csp-probe.invalid')) return;
    errors.push(`console.error: ${text}`);
  };
  const onPageError = (err) => {
    errors.push(`pageerror: ${err instanceof Error ? err.message : String(err)}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    getErrors: () => [...errors],
    clear: () => {
      errors.length = 0;
    },
    detach: () => {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

/**
 * Waits until /python/main has finished coi-sw.js registration + single guarded reload
 * so window.crossOriginIsolated === true and the page is hydrated and stable.
 */
async function waitIsolatedMain(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const ok = await page.evaluate(() => {
        return (
          window.location.pathname.startsWith('/python/main') &&
          window.crossOriginIsolated === true &&
          Boolean(navigator.serviceWorker?.controller) &&
          Boolean(document.querySelector('[data-testid="python-w2-note"]'))
        );
      });
      if (ok) return;
    } catch {
      // Expected transiently while coi-sw.js triggers its single reload.
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('Timed out waiting for /python/main crossOriginIsolated === true');
}

async function waitMonacoAndPyodideReady(page, timeoutMs = 15000) {
  const t0 = Date.now();
  await page.waitForFunction(
    () => {
      const monacoReady = Boolean(window.monaco && window.monaco.editor?.getModels?.().length > 0);
      const runBtn = document.querySelector('[data-testid="python-run-btn"]');
      const pill = document.querySelector('[data-testid="python-status-pill"]');
      const pyReady =
        Boolean(runBtn) &&
        !runBtn.disabled &&
        Boolean(pill) &&
        /Ready|Klar/i.test(pill.textContent || '');
      return monacoReady && pyReady;
    },
    { timeout: timeoutMs },
  );
  return Date.now() - t0;
}

async function setMonacoCode(page, code) {
  await page.evaluate((src) => {
    const models = window.monaco?.editor?.getModels?.();
    if (!models || models.length === 0) {
      throw new Error('Monaco model not available');
    }
    models[0].setValue(src);
  }, code);
}

async function readTerminalText(page, xtermTestId) {
  return page.evaluate((id) => {
    const host = document.querySelector(`[data-testid="${id}"]`);
    if (!host) return '';
    const rows = host.querySelector('.xterm-rows');
    if (rows) return rows.innerText || rows.textContent || '';
    return host.innerText || host.textContent || '';
  }, xtermTestId);
}

async function waitTerminalContains(page, xtermTestId, needle, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const txt = await readTerminalText(page, xtermTestId);
    if (txt.includes(needle)) return txt;
    await new Promise((r) => setTimeout(r, 100));
  }
  const finalTxt = await readTerminalText(page, xtermTestId);
  throw new Error(`Terminal [${xtermTestId}] did not contain "${needle}". Got:\n${finalTxt.slice(-600)}`);
}

async function runBrowserSuite(browserName, browser, baseUrl) {
  const packagesSuite = () =>
    runPackagesUiSuite(browserName, browser, baseUrl, {
      record,
      waitIsolatedMain,
      waitMonacoAndPyodideReady,
      attachErrorTracker,
      setMockPypi: servers ? servers.setMockPypi : null,
    });
  const displaySuite = () =>
    runDisplayUiSuite(browserName, browser, baseUrl, {
      record,
      waitIsolatedMain,
      waitMonacoAndPyodideReady,
      attachErrorTracker,
    });
  const selectionSuite = () =>
    runSelectionUiSuite(browserName, browser, baseUrl, {
      record,
      waitIsolatedMain,
      waitMonacoAndPyodideReady,
      waitTerminalContains,
      attachErrorTracker,
    });
  // PYTHON_UI_ONLY=packages, =display or =selection runs only that suite (while working on it).
  if (process.env.PYTHON_UI_ONLY === 'packages') {
    await packagesSuite();
    return;
  }
  if (process.env.PYTHON_UI_ONLY === 'display') {
    await displaySuite();
    return;
  }
  if (process.env.PYTHON_UI_ONLY === 'selection') {
    await selectionSuite();
    return;
  }
  // =========================================================================
  // Suite 1: Home entry, clean hard-navigation exit, /licenses, W1, W2,
  //          Monaco + Run + input() + Traceback + Stop + REPL, Themes, i18n
  // =========================================================================
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errTracker = attachErrorTracker(page, { allowCspProbe: false });
    const preAckWorkerHits = [];
    const onPreAckReq = (req) => {
      const p = new URL(req.url()).pathname;
      if (p === '/python/python-worker.js' || p.startsWith('/pyodide/')) {
        preAckWorkerHits.push(p);
      }
    };
    page.on('request', onPreAckReq);

    try {
      // 1. Home entry & clean hard-navigation exit & /licenses
      await record(browserName, 'Home card -> /python/main (COI) -> Home (non-COI) & /licenses', async () => {
        await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
        const cardLink = page.locator('a[href="/python/main"]').first();
        await cardLink.waitFor({ state: 'visible', timeout: 10000 });

        // Verify it is a plain <a href="/python/main"> (hard navigation, not Next SPA Link)
        const cardInfo = await cardLink.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            href: el.getAttribute('href'),
            visible: rect.width > 0 && rect.height > 0,
            text: el.textContent || '',
          };
        });
        if (cardInfo.tag !== 'A' || cardInfo.href !== '/python/main' || !cardInfo.visible) {
          return `invalid home card link: ${JSON.stringify(cardInfo)}`;
        }

        // Click Home card -> arrives at /python/main and becomes crossOriginIsolated
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
          cardLink.click(),
        ]);
        await waitIsolatedMain(page, 20000);

        const errsOnMain = errTracker.getErrors();
        if (errsOnMain.length > 0) {
          return `console/page errors on /python/main entry: ${errsOnMain.join(' | ')}`;
        }

        // Verify Home link in ToolHeader performs clean hard navigation exiting isolation
        // (Dismiss W1 not needed to inspect header, or navigate directly via header home link after checking it)
        // Since W1 modal is blocking pointer events, verify home link href first, ack or use dedicated exit check after W1?
        // Actually check Home exit right after W1? Wait: let's click Home link cleanly after closing or via separate check!
        // Let's verify W1 is visible BEFORE clicking Home, OR verify Home exit right after W1 ack so we test clicking the actual UI button!
        return true;
      });

      // 2. W1 First-visit dialog & W2 honest status note
      await record(browserName, 'W1 first-visit dialog (Scratchpad + W9 + localStorage) & W2 note', async () => {
        const w1 = page.getByTestId('python-w1-dialog');
        await w1.waitFor({ state: 'visible', timeout: 10000 });
        const w1Text = (await w1.innerText()) || '';
        if (!w1Text.includes('Before you start')) {
          return `W1 missing "Before you start": ${w1Text.slice(0, 120)}`;
        }
        if (!w1Text.includes('Scratchpad')) {
          return `W1 missing Scratchpad mention: ${w1Text.slice(0, 200)}`;
        }
        if (!w1Text.includes('Clear all data')) {
          return `W1 missing W9 Clear all data sentence: ${w1Text.slice(0, 200)}`;
        }

        const beforeAck = await page.evaluate(() => localStorage.getItem('python:ack-v1'));
        if (beforeAck !== null) return `expected python:ack-v1 null before click, got ${beforeAck}`;
        if (preAckWorkerHits.length > 0) {
          return `worker/pyodide loaded before W1 ack: ${preAckWorkerHits.join(', ')}`;
        }

        // Switch error tracker to allow deliberate S1 csp-probe.invalid violation during worker boot
        page.off('request', onPreAckReq);
        errTracker.detach();
        const postAckTracker = attachErrorTracker(page, { allowCspProbe: true });
        page.__postAckTracker = postAckTracker;

        await page.getByTestId('python-w1-ack').click();
        await w1.waitFor({ state: 'hidden', timeout: 5000 });

        const afterAck = await page.evaluate(() => localStorage.getItem('python:ack-v1'));
        if (afterAck !== '1') return `expected python:ack-v1 === '1', got ${afterAck}`;

        // Reload and verify W1 does NOT reappear
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitIsolatedMain(page, 15000);
        await page.waitForTimeout(300);
        if (await w1.isVisible()) {
          return 'W1 reappeared after reload despite python:ack-v1=1';
        }

        // Verify W2 honest status note is visible at top and collapsible
        const w2 = page.getByTestId('python-w2-note');
        await w2.waitFor({ state: 'visible', timeout: 5000 });
        const openBefore = await w2.evaluate((el) => el.open);
        await w2.locator('summary').click();
        const openAfterExpand = await w2.evaluate((el) => el.open);
        await w2.locator('summary').click();
        const openAfterCollapse = await w2.evaluate((el) => el.open);
        if (openBefore !== false || openAfterExpand !== true || openAfterCollapse !== false) {
          return `W2 collapsible state unexpected: before=${openBefore} expand=${openAfterExpand} collapse=${openAfterCollapse}`;
        }

        // Now test clicking ToolHeader Home link -> exits isolation cleanly, then /licenses, then back to /python/main
        const homeLink = page.locator('header a[href="/"]').first();
        await homeLink.waitFor({ state: 'visible', timeout: 5000 });
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
          homeLink.click(),
        ]);
        const homeState = await page.evaluate(() => ({
          path: window.location.pathname,
          coi: window.crossOriginIsolated,
        }));
        if (homeState.path !== '/' || homeState.coi !== false) {
          return `Home link did not cleanly exit isolation: ${JSON.stringify(homeState)}`;
        }

        // Verify /licenses lists Pyodide, Humor Sans (SIL OFL-1.1), FreeType, Adobe AFM, @xterm/xterm
        try {
          await page.goto(`${baseUrl}/licenses`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => (document.body.innerText || '').includes('Pyodide'), {
            timeout: 10000,
          });
          const licText = await page.evaluate(() => document.body.innerText || '');
          const requiredLic = [
            ['Pyodide', /Pyodide/],
            ['Humor Sans', /Humor[\s-]Sans/i],
            ['SIL OFL-1.1', /SIL OFL-1\.1/],
            ['FreeType', /FreeType/],
            ['Adobe AFM', /Adobe AFM/],
            ['@xterm/xterm', /@xterm\/xterm/],
          ];
          const missingLic = requiredLic.filter(([, re]) => !re.test(licText)).map(([name]) => name);
          if (missingLic.length > 0) {
            return `/licenses missing required Python notices: ${missingLic.join(', ')}`;
          }
        } finally {
          // Always return to /python/main so subsequent desktop checks run on the playground page
          await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
          await waitIsolatedMain(page, 15000);
          page.__postAckTracker?.clear?.();
        }
        return true;
      });

      // 3a. Wait for Monaco + Pyodide Ready (< 15s) & Run with input() + NumPy
      await record(browserName, 'Desktop: Monaco + Pyodide Ready (< 15s), Run + input() + NumPy', async () => {
        const bootMs = await waitMonacoAndPyodideReady(page, 15000);
        if (bootMs >= 15000) return `boot took ${bootMs}ms (>= 15000ms)`;

        const script = [
          'import numpy as np',
          'arr_sum = int(np.sum(np.arange(1, 6)))',
          'who = input("Your name? ")',
          'shared_x = arr_sum * 10',
          'print(f"GREET:{who}:SUM={arr_sum}:SHARED={shared_x}")',
        ].join('\n');
        await setMonacoCode(page, script);
        await page.getByTestId('python-run-btn').click();

        // Wait for "The program asks:" input bar
        const asks = page.getByTestId('python-program-asks');
        await asks.waitFor({ state: 'visible', timeout: 15000 });
        const asksText = (await asks.innerText()) || '';
        if (!asksText.includes('The program asks:')) {
          return `expected "The program asks:", got "${asksText}"`;
        }

        await page.getByTestId('python-stdin-input').fill('Ada');
        await page.getByTestId('python-stdin-send').click();

        await waitTerminalContains(page, 'python-console-xterm', 'GREET:Ada:SUM=15:SHARED=150', 15000);
        await page.waitForFunction(
          () => !document.querySelector('[data-testid="python-run-btn"]')?.disabled,
          { timeout: 10000 },
        );
        return { ok: true, note: `${bootMs}ms` };
      });

      // 3b. REPL tab with shared __main__ namespace (D9) + multiline continuation
      await record(browserName, 'Desktop: REPL tab shares __main__ namespace (D9)', async () => {
        const outputFrame = page.getByTestId('python-program-output-frame');
        await outputFrame.getByRole('tab', { name: 'REPL' }).click();
        const replInput = page.getByTestId('python-repl-input');
        await replInput.waitFor({ state: 'visible', timeout: 5000 });

        await replInput.fill('shared_x + 7');
        await page.getByTestId('python-repl-submit').click();
        await waitTerminalContains(page, 'python-repl-xterm', '157', 10000);

        // Switch back to Console tab for traceback & stop tests
        await outputFrame.getByRole('tab', { name: 'Console' }).click();
        await page.getByTestId('python-console-xterm').waitFor({ state: 'visible', timeout: 5000 });
        return true;
      });

      // 3c. ZeroDivisionError clean traceback + clickable jump chip
      await record(browserName, 'Desktop: clean traceback (no Pyodide frames) & jump chip', async () => {
        await page.getByTestId('python-console-clear').click();
        const errScript = [
          'def boom():',
          '    return 1 / 0',
          'boom()',
        ].join('\n');
        await setMonacoCode(page, errScript);
        await page.getByTestId('python-run-btn').click();

        await waitTerminalContains(page, 'python-console-xterm', 'ZeroDivisionError', 10000);
        await page.waitForFunction(
          () => !document.querySelector('[data-testid="python-run-btn"]')?.disabled,
          { timeout: 10000 },
        );
        const consoleText = await readTerminalText(page, 'python-console-xterm');
        if (
          consoleText.includes('_pyodide') ||
          consoleText.includes('pyodide/_base.py') ||
          consoleText.includes('yotasage_rt/runner.py')
        ) {
          return `traceback leaked internal frames:\n${consoleText}`;
        }

        const chip = page.getByTestId('python-tb-line-2');
        await chip.waitFor({ state: 'visible', timeout: 5000 });
        await chip.click();
        await page.waitForTimeout(150);
        return true;
      });

      // 3d. Stop infinite loop (< 2s)
      await record(browserName, 'Desktop: Stop infinite loop (< 2s)', async () => {
        await setMonacoCode(page, 'while True:\n    pass\n');
        await page.getByTestId('python-run-btn').click();

        const stopBtn = page.getByTestId('python-stop-btn');
        await stopBtn.waitFor({ state: 'visible', timeout: 5000 });

        const t0 = Date.now();
        await stopBtn.click();
        await page.waitForFunction(
          () => {
            const runBtn = document.querySelector('[data-testid="python-run-btn"]');
            const pill = document.querySelector('[data-testid="python-status-pill"]');
            return Boolean(runBtn) && !runBtn.disabled && /Ready|Klar/i.test(pill?.textContent || '');
          },
          { timeout: 5000 },
        );
        const stopMs = Date.now() - t0;
        if (stopMs >= 2000) return `Stop took ${stopMs}ms (>= 2000ms)`;
        return { ok: true, note: `${stopMs}ms` };
      });

      // 4. Themes (Light & Dark — zero #000000 xterm viewport leak in Light mode) & EN <-> NB i18n
      await record(browserName, 'Themes (Light/Dark, no #000 xterm leak) & EN <-> NB toggle', async () => {
        // Explicit Light mode check
        await page.locator('header button[aria-label="Light"]').click();
        await page.waitForTimeout(200);
        const lightCheck = await page.evaluate(() => {
          const themeAttr = document.documentElement.getAttribute('data-ds-theme');
          const wrap = document.querySelector('[data-testid="python-console-xterm"]')?.parentElement;
          const viewport = document.querySelector('[data-testid="python-console-xterm"] .xterm-viewport');
          const wrapBg = wrap ? getComputedStyle(wrap).backgroundColor : '';
          const vpBg = viewport ? getComputedStyle(viewport).backgroundColor : '';
          return { themeAttr, wrapBg, vpBg };
        });
        if (lightCheck.vpBg === 'rgb(0, 0, 0)' || lightCheck.wrapBg === 'rgb(0, 0, 0)') {
          return `Light mode xterm black leak detected: ${JSON.stringify(lightCheck)}`;
        }
        if (lightCheck.themeAttr !== 'light' || lightCheck.wrapBg !== 'rgb(255, 255, 255)') {
          return `Expected Light mode theme=light & wrap rgb(255, 255, 255), got ${JSON.stringify(lightCheck)}`;
        }

        // Explicit Dark mode check
        await page.locator('header button[aria-label="Dark"]').click();
        await page.waitForTimeout(200);
        const darkCheck = await page.evaluate(() => {
          const themeAttr = document.documentElement.getAttribute('data-ds-theme');
          const wrap = document.querySelector('[data-testid="python-console-xterm"]')?.parentElement;
          return { themeAttr, wrapBg: wrap ? getComputedStyle(wrap).backgroundColor : '' };
        });
        if (darkCheck.themeAttr !== 'dark' || darkCheck.wrapBg !== 'rgb(19, 19, 22)') {
          return `Dark mode mismatch: ${JSON.stringify(darkCheck)}`;
        }

        // Restore Light mode
        await page.locator('header button[aria-label="Light"]').click();
        await page.waitForTimeout(100);

        // Toggle EN -> NB
        const langBtn = page.locator('header button', { hasText: 'EN' }).filter({ hasText: 'NB' }).first();
        await langBtn.click();
        await page.waitForTimeout(150);

        const nbTexts = await page.evaluate(() => ({
          h1: document.querySelector('h1')?.textContent?.trim() || '',
          run: document.querySelector('[data-testid="python-run-btn"]')?.textContent?.trim() || '',
          w2: document.querySelector('[data-testid="python-w2-note"]')?.textContent?.trim() || '',
          outputLabel: document.querySelector('[data-testid="python-program-output-label"]')?.textContent?.trim() || '',
        }));
        if (
          nbTexts.h1 !== 'Python-lekeplass' ||
          !nbTexts.run.includes('Kjør') ||
          !nbTexts.w2.includes('Kjører Python lokalt') ||
          nbTexts.outputLabel !== 'Programutdata'
        ) {
          return `NB i18n check failed: ${JSON.stringify(nbTexts)}`;
        }

        // Toggle NB -> EN
        await langBtn.click();
        await page.waitForTimeout(150);
        const enTexts = await page.evaluate(() => ({
          h1: document.querySelector('h1')?.textContent?.trim() || '',
          run: document.querySelector('[data-testid="python-run-btn"]')?.textContent?.trim() || '',
          outputLabel: document.querySelector('[data-testid="python-program-output-label"]')?.textContent?.trim() || '',
        }));
        if (
          enTexts.h1 !== 'Python Playground' ||
          !enTexts.run.includes('Run') ||
          enTexts.outputLabel !== 'Program output'
        ) {
          return `EN i18n restore failed: ${JSON.stringify(enTexts)}`;
        }

        const errs = page.__postAckTracker?.getErrors?.() ?? [];
        if (errs.length > 0) {
          return `unexpected desktop console/page errors: ${errs.join(' | ')}`;
        }
        return true;
      });
    } finally {
      errTracker.detach();
      page.__postAckTracker?.detach?.();
      await ctx.close();
    }
  }

  // =========================================================================
  // Suite 2: Security UI flows (W4 crafted ?net=all, ?net=pkg + W3 + W8,
  //          Network dialog validation + Everything checkbox, W9 Clear all)
  // =========================================================================
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();

    try {
      // 5a. Crafted ?net=all URL in fresh context -> 0 worker/pyodide requests before answer -> Reload with network off
      await record(browserName, 'Security: crafted ?net=all -> W4 blocks worker & Reload Off works', async () => {
        const forbiddenReqs = [];
        const onReq = (req) => {
          const p = new URL(req.url()).pathname;
          if (p === '/python/python-worker.js' || p.startsWith('/pyodide/')) {
            forbiddenReqs.push(p);
          }
        };
        page.on('request', onReq);
        try {
          await page.goto(`${baseUrl}/python/main?net=all`, { waitUntil: 'domcontentloaded' });
          await waitIsolatedMain(page, 20000);

          // Fresh context shows W1 first; still 0 worker/pyodide requests
          const w1 = page.getByTestId('python-w1-dialog');
          await w1.waitFor({ state: 'visible', timeout: 8000 });
          if (forbiddenReqs.length > 0) {
            return `worker/pyodide loaded during W1 on ?net=all: ${forbiddenReqs.join(', ')}`;
          }
          await page.getByTestId('python-w1-ack').click();
          await w1.waitFor({ state: 'hidden', timeout: 5000 });

          // W4 on-load blocking dialog must appear immediately, with Continue disabled until checkbox checked
          const w4 = page.getByTestId('python-w4-load-dialog');
          await w4.waitFor({ state: 'visible', timeout: 5000 });
          await page.waitForTimeout(400);
          if (forbiddenReqs.length > 0) {
            return `worker/pyodide loaded BEFORE W4 confirmation: ${forbiddenReqs.join(', ')}`;
          }
          const contDisabled = await page.getByTestId('python-w4-continue').isDisabled();
          if (!contDisabled) {
            return 'W4 ?net=all Continue button should be disabled before red checkbox is ticked';
          }

          // Click "Reload with network off" -> navigates to /python/main (Off mode, no W3 banner)
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
            page.getByTestId('python-w4-reload-off').click(),
          ]);
          await waitIsolatedMain(page, 15000);
          const urlSearch = await page.evaluate(() => window.location.search);
          const netLabel = (await page.getByTestId('python-network-btn').innerText()) || '';
          const w3Visible = await page.getByTestId('python-w3-banner').isVisible();
          if (urlSearch !== '' || !netLabel.includes('Off') || w3Visible) {
            return `Reload Off failed: search="${urlSearch}" netLabel="${netLabel}" w3Visible=${w3Visible}`;
          }
          return true;
        } finally {
          page.off('request', onReq);
        }
      });

      // 5b. ?net=pkg approval + W3 banner + W8 External link confirmation (0 popups on Cancel)
      await record(browserName, 'Security: ?net=pkg -> W4 -> W3 banner + W8 link dialog (0 popups)', async () => {
        // Navigate away from the previous Off-mode page first so its worker boot cannot race into our spy
        await page.goto('about:blank');

        const preContinueReqs = [];
        const onReq = (req) => {
          let p = '';
          try {
            p = new URL(req.url()).pathname;
          } catch {
            return;
          }
          if (p === '/python/python-worker.js' || p.startsWith('/pyodide/')) {
            preContinueReqs.push(p);
          }
        };
        page.on('request', onReq);

        await page.goto(`${baseUrl}/python/main?net=pkg`, { waitUntil: 'domcontentloaded' });
        await waitIsolatedMain(page, 15000);

        // W1 already acknowledged -> W4 on-load dialog appears immediately
        const w4 = page.getByTestId('python-w4-load-dialog');
        await w4.waitFor({ state: 'visible', timeout: 8000 });
        await page.waitForTimeout(300);
        if (preContinueReqs.length > 0) {
          page.off('request', onReq);
          return `worker/pyodide loaded before ?net=pkg W4 approval: ${preContinueReqs.join(', ')}`;
        }
        page.off('request', onReq);

        await page.getByTestId('python-w4-continue').click();
        await w4.waitFor({ state: 'hidden', timeout: 5000 });

        // Verify W3 banner under header shows pypi.org & files.pythonhosted.org + Reload off button
        const w3 = page.getByTestId('python-w3-banner');
        await w3.waitFor({ state: 'visible', timeout: 5000 });
        const w3Text = (await w3.innerText()) || '';
        const w3ReloadBtn = page.getByTestId('python-w3-reload-off');
        if (
          !w3Text.includes('pypi.org') ||
          !w3Text.includes('files.pythonhosted.org') ||
          !(await w3ReloadBtn.isVisible())
        ) {
          return `W3 banner content mismatch: "${w3Text}"`;
        }

        // Wait for Monaco + Pyodide Ready, then trigger W8 via webbrowser.open("https://example.com/check")
        await waitMonacoAndPyodideReady(page, 15000);
        let popupCount = 0;
        const onPopup = () => {
          popupCount += 1;
        };
        const onNewPage = (p) => {
          if (p !== page) popupCount += 1;
        };
        page.on('popup', onPopup);
        ctx.on('page', onNewPage);
        try {
          await setMonacoCode(
            page,
            'import webbrowser\nwebbrowser.open("https://example.com/check")\nprint("https://example.com/check")\n',
          );
          await page.getByTestId('python-run-btn').click();

          const w8 = page.getByTestId('python-w8-dialog');
          await w8.waitFor({ state: 'visible', timeout: 10000 });
          const w8Url = ((await page.getByTestId('python-w8-url').innerText()) || '').trim();
          if (w8Url !== 'https://example.com/check') {
            return `W8 URL mismatch: got "${w8Url}"`;
          }
          await page.getByTestId('python-w8-cancel').click();
          await w8.waitFor({ state: 'hidden', timeout: 5000 });
          await page.waitForTimeout(200);
          if (popupCount !== 0) {
            return `expected 0 popups after W8 Cancel, got ${popupCount}`;
          }
        } finally {
          page.off('popup', onPopup);
          ctx.off('page', onNewPage);
        }

        // Return to Off mode via W3 Reload button
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
          w3ReloadBtn.click(),
        ]);
        await waitIsolatedMain(page, 15000);
        if (await page.getByTestId('python-w3-banner').isVisible()) {
          return 'W3 banner still visible after clicking Reload with network off';
        }
        return true;
      });

      // 5c. Network settings dialog (W4 host validation + Everything checkbox)
      await record(browserName, 'Security: Network dialog host validation & Everything checkbox', async () => {
        const curUrl = page.url();
        if (!curUrl.endsWith('/python/main')) {
          await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
          await waitIsolatedMain(page, 15000);
        }
        await page.getByTestId('python-network-btn').click();
        const dlg = page.getByTestId('python-network-dialog');
        await dlg.waitFor({ state: 'visible', timeout: 5000 });

        // Select Selected hosts
        await dlg.locator('input[name="python-net-mode"][value="hosts"]').check();
        const hostsInput = page.getByTestId('python-net-hosts-input');
        const applyBtn = page.getByTestId('python-net-apply');
        await hostsInput.waitFor({ state: 'visible', timeout: 3000 });

        // Invalid IP (127.0.0.1) -> alert shown, Apply disabled
        await hostsInput.fill('127.0.0.1');
        const ipErrVisible = await dlg.locator('[role="alert"]').isVisible();
        const ipApplyDisabled = await applyBtn.isDisabled();
        if (!ipErrVisible || !ipApplyDisabled) {
          return `127.0.0.1 should fail validation: err=${ipErrVisible} disabled=${ipApplyDisabled}`;
        }

        // Invalid wildcard (*.example.com) -> alert shown, Apply disabled
        await hostsInput.fill('*.example.com');
        const wcErrVisible = await dlg.locator('[role="alert"]').isVisible();
        const wcApplyDisabled = await applyBtn.isDisabled();
        if (!wcErrVisible || !wcApplyDisabled) {
          return `*.example.com should fail validation: err=${wcErrVisible} disabled=${wcApplyDisabled}`;
        }

        // Valid hostname (api.example.com) -> no alert, Apply enabled
        await hostsInput.fill('api.example.com');
        const validErrVisible = await dlg.locator('[role="alert"]').isVisible();
        const validApplyDisabled = await applyBtn.isDisabled();
        if (validErrVisible || validApplyDisabled) {
          return `api.example.com should pass validation: err=${validErrVisible} disabled=${validApplyDisabled}`;
        }

        // Select Everything -> Apply stays disabled until red checkbox is ticked
        await dlg.locator('input[name="python-net-mode"][value="all"]').check();
        const allBefore = await applyBtn.isDisabled();
        const allBox = page.getByTestId('python-net-all-checkbox');
        await allBox.check();
        const allAfter = await applyBtn.isDisabled();
        if (!allBefore || allAfter) {
          return `Everything checkbox gate broken: before=${allBefore} after=${allAfter}`;
        }
        return true;
      });

      // 5d. W9 Clear all data -> clears python:ack-v1, caches, IDB, unregisters /python/ SW, W1 reappears
      await record(browserName, 'Security: W9 Clear all data clears storage/SW & re-shows W1', async () => {
        // Seed dummy python* storage/cache/IDB and confirm /python/ SW is currently registered
        const seeded = await page.evaluate(async () => {
          localStorage.setItem('python:ui-test-key', '1');
          const c = await caches.open('python-ui-test-cache');
          await c.put('/python/dummy', new Response('x'));
          await new Promise((res) => {
            const req = indexedDB.open('python-ui-test-db', 1);
            req.onsuccess = () => {
              req.result.close();
              res();
            };
            req.onerror = () => res();
          });
          const regs = await navigator.serviceWorker.getRegistrations();
          return regs.some((r) => new URL(r.scope).pathname.startsWith('/python/'));
        });
        if (!seeded) return 'expected /python/ SW registered before Clear all data';

        // Track /python/main document responses after Clear all data:
        // If /python/ SW was unregistered, the very first reload response must NOT come from SW (fromServiceWorker === false).
        const docFromSw = [];
        const onResp = (res) => {
          let p = '';
          try {
            p = new URL(res.url()).pathname;
          } catch {
            return;
          }
          if (p === '/python/main' && res.request().resourceType() === 'document') {
            docFromSw.push(res.fromServiceWorker());
          }
        };
        page.on('response', onResp);

        try {
          await page.getByTestId('python-clear-all-btn').click();
          const confirmBtn = page.getByTestId('python-clear-all-confirm');
          await confirmBtn.waitFor({ state: 'visible', timeout: 3000 });

          await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
            confirmBtn.click(),
          ]);
          await waitIsolatedMain(page, 20000);

          const postState = await page.evaluate(async () => {
            const ack = localStorage.getItem('python:ack-v1');
            const testKey = localStorage.getItem('python:ui-test-key');
            const cacheKeys = await caches.keys();
            const hasTestCache = cacheKeys.includes('python-ui-test-cache');
            let hasTestDb = false;
            if (typeof indexedDB.databases === 'function') {
              const dbs = await indexedDB.databases();
              hasTestDb = dbs.some((d) => d.name === 'python-ui-test-db');
            }
            return { ack, testKey, hasTestCache, hasTestDb };
          });

          await page.getByTestId('python-w1-dialog').waitFor({ state: 'visible', timeout: 8000 });
          const w1Visible = await page.getByTestId('python-w1-dialog').isVisible();
          const swWasUnregistered = docFromSw.length > 0 && docFromSw[0] === false;
          if (
            postState.ack !== null ||
            postState.testKey !== null ||
            postState.hasTestCache ||
            postState.hasTestDb ||
            !w1Visible ||
            !swWasUnregistered
          ) {
            return `Clear all data incomplete: ${JSON.stringify({ ...postState, w1Visible, docFromSw })}`;
          }
          return true;
        } finally {
          page.off('response', onResp);
        }
      });
    } finally {
      await ctx.close();
    }
  }

  // =========================================================================
  // Suite 3: W7 Fail-closed dialog (serviceWorkers: 'block')
  // =========================================================================
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();

    try {
      await record(browserName, 'Security: W7 fail-closed disables Run until "Run anyway"', async () => {
        await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
        const w1 = page.getByTestId('python-w1-dialog');
        await w1.waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('python-w1-ack').click();
        await w1.waitFor({ state: 'hidden', timeout: 5000 });

        // Wait for W7 fail-closed dialog to open once worker CSP self-test fails
        const w7 = page.getByTestId('python-w7-dialog');
        await w7.waitFor({ state: 'visible', timeout: 15000 });

        // Dismiss W7 via Escape -> Run button MUST remain disabled!
        await page.keyboard.press('Escape');
        await w7.waitFor({ state: 'hidden', timeout: 5000 });

        const runBtn = page.getByTestId('python-run-btn');
        const runDisabledBefore = await runBtn.isDisabled();
        const openW7Btn = page.getByTestId('python-open-w7-btn');
        const openW7Visible = await openW7Btn.isVisible();
        if (!runDisabledBefore || !openW7Visible) {
          return `W7 did not keep Run disabled: runDisabled=${runDisabledBefore} openW7Visible=${openW7Visible}`;
        }

        // Re-open W7 and click "Run anyway" -> Run becomes enabled (once Pyodide finishes booting)
        await openW7Btn.click();
        await w7.waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId('python-w7-run-anyway').click();
        await w7.waitFor({ state: 'hidden', timeout: 5000 });

        await page.waitForFunction(
          () => !document.querySelector('[data-testid="python-run-btn"]')?.disabled,
          { timeout: 15000 },
        );
        return true;
      });
    } finally {
      await ctx.close();
    }
  }

  // =========================================================================
  // Suite 4: Phone viewport (375x812, hasTouch: true on Edge & WebKit)
  // =========================================================================
  {
    const phoneOpts = {
      viewport: { width: 375, height: 812 },
      ...(browserName !== 'firefox' ? { hasTouch: true } : {}),
    };
    const ctx = await browser.newContext(phoneOpts);
    const page = await ctx.newPage();
    const errTracker = attachErrorTracker(page, { allowCspProbe: true });

    try {
      await record(browserName, 'Phone 375x812: zero overflow, pane tabs, Run + input(), 0 errors', async () => {
        await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
        await waitIsolatedMain(page, 20000);

        const w1 = page.getByTestId('python-w1-dialog');
        await w1.waitFor({ state: 'visible', timeout: 8000 });
        await page.getByTestId('python-w1-ack').click();
        await w1.waitFor({ state: 'hidden', timeout: 5000 });

        await waitMonacoAndPyodideReady(page, 15000);

        // Check zero horizontal overflow on Editor pane
        const overflowEditor = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        if (overflowEditor.scrollWidth > overflowEditor.innerWidth + 1) {
          return `Phone horizontal overflow on Editor: ${JSON.stringify(overflowEditor)}`;
        }

        // Switch between Editor and Console mobile tabs
        const paneTablist = page.locator('[aria-label="Switch between editor and output panes"]');
        await paneTablist.waitFor({ state: 'visible', timeout: 5000 });
        await paneTablist.getByRole('tab', { name: 'Console' }).click();
        await page.getByTestId('python-console-xterm').waitFor({ state: 'visible', timeout: 5000 });

        const overflowConsole = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        if (overflowConsole.scrollWidth > overflowConsole.innerWidth + 1) {
          return `Phone horizontal overflow on Console: ${JSON.stringify(overflowConsole)}`;
        }

        // Switch to Files tab on phone -> File Tree visible with 0 horizontal overflow
        await paneTablist.getByRole('tab', { name: 'Files' }).click();
        await page.getByTestId('python-files-panel').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId('python-tree-item-main.py').waitFor({ state: 'visible', timeout: 5000 });
        const overflowFiles = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        if (overflowFiles.scrollWidth > overflowFiles.innerWidth + 1) {
          return `Phone horizontal overflow on Files: ${JSON.stringify(overflowFiles)}`;
        }

        // Switch to Plots tab on phone -> Plots panel visible with 0 horizontal overflow
        await paneTablist.getByRole('tab', { name: /Plots/ }).click();
        await page.getByTestId('python-plots-panel').waitFor({ state: 'visible', timeout: 5000 });
        const overflowPlots = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        if (overflowPlots.scrollWidth > overflowPlots.innerWidth + 1) {
          return `Phone horizontal overflow on Plots: ${JSON.stringify(overflowPlots)}`;
        }

        // Switch back to Editor, set script with input(), Run, submit via phone input bar
        await paneTablist.getByRole('tab', { name: 'Editor' }).click();
        await page.getByTestId('python-editor-wrap').waitFor({ state: 'visible', timeout: 5000 });
        await setMonacoCode(page, 'name = input("Phone name? ")\nprint(f"PHONE_OK:{name}")\n');
        await page.getByTestId('python-run-btn').click();

        // Auto-switches to Console and displays phone-friendly input bar
        const stdinInput = page.getByTestId('python-stdin-input');
        await stdinInput.waitFor({ state: 'visible', timeout: 15000 });
        await stdinInput.fill('Linus');
        await page.getByTestId('python-stdin-send').click();

        await waitTerminalContains(page, 'python-console-xterm', 'PHONE_OK:Linus', 15000);

        const overflowAfter = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        if (overflowAfter.scrollWidth > overflowAfter.innerWidth + 1) {
          return `Phone horizontal overflow after run: ${JSON.stringify(overflowAfter)}`;
        }

        const errs = errTracker.getErrors();
        if (errs.length > 0) {
          return `Phone console/page errors: ${errs.join(' | ')}`;
        }
        return true;
      });
    } finally {
      errTracker.detach();
      await ctx.close();
    }
  }

  // =========================================================================
  // Suite 5: P3b Files Workspace (multi-file CRUD, reload persistence,
  //          fs.changed badges, examples, W5 upload, ZIP import/export, Web Locks)
  // =========================================================================
  await runFilesUiSuite(browserName, browser, baseUrl, {
    record,
    waitIsolatedMain,
    waitMonacoAndPyodideReady,
    waitTerminalContains,
    attachErrorTracker,
  });

  // Suite 5b: U2 multi-selection, delete selection, Reset workspace, phone Select mode
  await selectionSuite();

  // =========================================================================
  // Suite 6: P4b Plots Gallery & Hardened File Viewers
  //          (Matplotlib + SVG export, PIL.Image.show, PDF canvas, CSV/JSON,
  //           SVG/HTML XSS isolation, 100-plot Blob URL leak check)
  // =========================================================================
  await runPlotsUiSuite(browserName, browser, baseUrl, {
    record,
    waitIsolatedMain,
    waitMonacoAndPyodideReady,
    waitTerminalContains,
    attachErrorTracker,
  });

  // Suite 7: E1b Examples tab (header tabs, cards, Load without running, phone, screenshots)
  await runExamplesUiSuite(browserName, browser, baseUrl, {
    record,
    waitIsolatedMain,
    waitMonacoAndPyodideReady,
    attachErrorTracker,
  });

  // Suite 8: P6 Packages tab (install, W6, keep/restore, wheels, requirements, missing-import notice)
  await packagesSuite();

  // Suite 9: P8 Display panel (examples, frames, input, touch, hidden, screenshot, fullscreen, Close, Stop)
  await displaySuite();
}

let servers = null;
let baseUrl = externalBaseUrl.replace(/\/+$/, '');

if (!baseUrl) {
  if (!noBuild || !existsSync(join(outDir, 'python', 'main.html'))) {
    console.log('=== Building Static Export (npm run build:export) ===');
    const build = spawnSync(process.execPath, [join(repoRoot, 'scripts', 'build-export.mjs')], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    if (build.status !== 0) {
      console.error('FAILED: build-export.mjs');
      process.exit(1);
    }
  } else {
    console.log('=== Reusing existing static export in out/ (--no-build) ===');
  }
  servers = await startHarnessServers(outDir, { primaryPort: 3023, secondaryPort: 3024 });
  baseUrl = servers.primaryOrigin;
} else {
  console.log(`=== Using external base URL: ${baseUrl} ===`);
}

try {
  for (const b of BROWSERS) {
    console.log(`\n=== Python UI Harness (${b}) ===`);
    let browser = null;
    try {
      browser = await launchBrowser(b);
      const version = browser.version();
      console.log(`  Launched ${b} ${version}`);
      setCell('Browser version', b, version);
      await runBrowserSuite(b, browser, baseUrl);
    } catch (err) {
      totalFailed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      allFailures.push(`[${b}] browser run crashed: ${msg}`);
      console.log(`  FAIL [${b}] browser run crashed: ${msg}`);
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
} finally {
  if (servers) {
    await servers.stop();
  }
}

console.log('\n=== UI Harness Summary Table ===');
console.log(`| Check | ${BROWSERS.join(' | ')} |`);
console.log(`| --- | ${BROWSERS.map(() => '---').join(' | ')} |`);
for (const [feat, row] of table) {
  console.log(`| ${feat} | ${BROWSERS.map((b) => row[b] || '–').join(' | ')} |`);
}

console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed.`);
if (allFailures.length > 0) {
  console.log('\nFailures:');
  for (const f of allFailures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
