// P8 3-browser UI checks for the Display panel of /python/main (components/Python/DisplayPanel.tsx,
// useDisplay.ts). Imported by scripts/harness/python/ui.mjs (PYTHON_UI_ONLY=display runs only this).
// Verifies: the empty Display tab; Load + Run of the bouncing ball from the Examples tab opens and
// activates the Display tab with advancing frames; the frame labelled "Program output" with the trusted
// toolbar outside it; Fit vs 100 %; the hidden flag when another output tab or header tab shows (frames
// slow down) and that the tab is not re-activated meanwhile; Screenshot to Plots; Fullscreen and Esc;
// Stop within 1 s; the paint example with a mouse drag, keys (c clears, browser shortcuts not
// prevented, Esc releases focus) and Close ending the program; EN/NB labels; Light/Dark screenshots;
// and on a 375x812 touch phone the auto-selected Display pane, a touch drag that paints and 0 overflow.
// Touch: Edge gets real touch input through CDP; Firefox and WebKit get synthetic touch PointerEvents.
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const shotsDir = process.env.PYTHON_SHOTS_DIR || join(repoRoot, '.local', 'harness', 'python');

const OUTPUT_NAV = '[aria-label="Switch between console, REPL, plots and display"]';
const PANE_NAV = '[aria-label="Switch between editor and output panes"]';
const CANVAS = '[data-testid="python-display-canvas"]';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acknowledgeW1(page, waitIsolatedMain) {
  await waitIsolatedMain(page, 20000);
  const w1 = page.getByTestId('python-w1-dialog');
  await w1.waitFor({ state: 'visible', timeout: 8000 });
  await page.getByTestId('python-w1-ack').click();
  await w1.waitFor({ state: 'hidden', timeout: 5000 });
}

async function waitRunIdle(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="python-run-btn"]');
      return Boolean(btn) && !btn.disabled && !document.querySelector('[data-testid="python-stop-btn"]');
    },
    { timeout: timeoutMs },
  );
}

async function consoleText(page) {
  return page.evaluate(() => {
    const rows = document.querySelector('[data-testid="python-console-xterm"] .xterm-rows');
    return rows ? Array.from(rows.children).map((r) => r.textContent || '').join('\n').trimEnd() : '';
  });
}

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

const headerTab = (page, name) => page.locator('header [role="tablist"]').getByRole('tab', { name });
// Starts with the name: a tab's unread badge (Plots) is part of its accessible name.
const outputTab = (page, name) => page.locator(OUTPUT_NAV).getByRole('tab', { name: new RegExp(`^${name}`) });

/** Loads an example from the Examples tab (copies its files, opens its entry) and presses Run. */
async function loadAndRun(page, id) {
  await headerTab(page, 'Examples').click();
  await page.getByTestId('python-examples-gallery').waitFor({ state: 'visible', timeout: 5000 });
  await page.getByTestId(`python-example-load-${id}`).scrollIntoViewIfNeeded();
  await page.getByTestId(`python-example-load-${id}`).click();
  await page.waitForFunction(
    (exId) => window.monaco?.editor?.getEditors?.()[0]?.getModel?.()?.uri.path.endsWith(`/workspace/${exId}/main.py`),
    id,
    { timeout: 8000 },
  );
  await page.getByTestId('python-run-btn').click();
}

/** A cheap hash of the canvas pixels (every 7th pixel). */
async function pixelHash(page) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel);
    if (!c || !c.width) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 28) h = (Math.imul(h, 31) + d[i] + d[i + 1] * 3 + d[i + 2] * 7) >>> 0;
    return h;
  }, CANVAS);
}

async function pixelAt(page, x, y) {
  return page.evaluate(
    ({ sel, px, py }) => Array.from(document.querySelector(sel).getContext('2d').getImageData(px, py, 1, 1).data),
    { sel: CANVAS, px: x, py: y },
  );
}

async function stats(page) {
  return page.evaluate(() => (window.__pythonDisplayStats ? window.__pythonDisplayStats() : null));
}

async function canvasBox(page) {
  return page.evaluate((sel) => {
    const c = document.querySelector(sel);
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, dw: c.width, dh: c.height };
  }, CANVAS);
}

/** Waits until the canvas shows a frame of the given size and the Display tab is selected. */
async function waitDisplayShown(page, width, height, tabLocator) {
  await page.waitForFunction(
    ({ sel, w, h }) => {
      const c = document.querySelector(sel);
      return Boolean(c) && c.width === w && c.height === h && c.getBoundingClientRect().width > 0;
    },
    { sel: CANVAS, w: width, h: height },
    { timeout: 20000 },
  );
  const selected = await tabLocator.getAttribute('aria-selected');
  if (selected !== 'true') throw new Error(`Display tab not selected (aria-selected=${selected})`);
}

function isBackground(px, bg) {
  return Math.abs(px[0] - bg[0]) + Math.abs(px[1] - bg[1]) + Math.abs(px[2] - bg[2]) < 12;
}

export async function runDisplayUiSuite(
  browserName,
  browser,
  baseUrl,
  { record: recordCheck, waitIsolatedMain, waitMonacoAndPyodideReady, attachErrorTracker },
) {
  const record = recordCheck;
  const name = (s) => `P8 Display: ${s}`;

  // ---------------------------------------------------------------- Desktop 1280x800
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errTracker = attachErrorTracker(page, { allowCspProbe: true });
    // PYTHON_DISPLAY_DEBUG=1 prints the page errors seen after each check.
    const record = process.env.PYTHON_DISPLAY_DEBUG
      ? async (...args) => {
        const r = await recordCheck(...args);
        console.log(`    errors so far: ${JSON.stringify(errTracker.getErrors()).slice(0, 400)}`);
        return r;
      }
      : recordCheck;
    try {
      await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
      await acknowledgeW1(page, waitIsolatedMain);
      await waitMonacoAndPyodideReady(page, 20000);

      await record(browserName, name('empty Display tab shows the vdisplay starter'), async () => {
        await outputTab(page, 'Display').click();
        const empty = page.getByTestId('python-display-empty');
        await empty.waitFor({ state: 'visible', timeout: 5000 });
        const text = (await empty.textContent()) || '';
        const fitDisabled = await page.getByTestId('python-display-fit').isDisabled();
        await outputTab(page, 'Console').click();
        if (!text.includes('import vdisplay as vd') || !text.includes('No display open')) return `empty state: ${text}`;
        if (!fitDisabled) return 'Fit enabled without a display';
        return true;
      });

      await record(browserName, name('Examples > bouncing ball > Run opens and activates the Display tab; frames advance'), async () => {
        await loadAndRun(page, 'bouncing_ball');
        await waitDisplayShown(page, 480, 320, outputTab(page, 'Display'));
        const h1 = await pixelHash(page);
        await sleep(400);
        const h2 = await pixelHash(page);
        const s1 = await stats(page);
        await sleep(500);
        const s2 = await stats(page);
        if (h1 === h2) return 'canvas pixels did not change in 400 ms';
        const drawn = s2.framesDrawn - s1.framesDrawn;
        if (drawn < 15) return `only ${drawn} frames drawn in 500 ms`;
        return { ok: true, note: `${drawn} frames in 0.5 s` };
      }, '', 70000);

      await record(browserName, name('frame labelled "Program output" with the title as text; toolbar outside it'), async () => {
        const s = await page.evaluate(() => {
          const frame = document.querySelector('[data-testid="python-display-frame"]');
          const toolbar = document.querySelector('[data-testid="python-display-toolbar"]');
          const title = document.querySelector('[data-testid="python-display-title"]');
          const canvas = document.querySelector('[data-testid="python-display-canvas"]');
          return {
            label: frame?.querySelector('[data-testid="python-display-frame-label"]')?.textContent,
            toolbarInFrame: Boolean(frame && toolbar && frame.contains(toolbar)),
            canvasInFrame: Boolean(frame && canvas && frame.contains(canvas)),
            title: title?.textContent,
            titleChildren: title ? title.children.length : -1,
            touchAction: canvas ? getComputedStyle(canvas).touchAction : '',
            tabIndex: canvas ? canvas.tabIndex : -1,
          };
        });
        if (s.label !== 'Program output') return `label ${s.label}`;
        if (s.toolbarInFrame || !s.canvasInFrame) return JSON.stringify(s);
        if (s.title !== 'Bouncing ball' || s.titleChildren !== 0) return `title ${JSON.stringify(s)}`;
        if (s.touchAction !== 'none' || s.tabIndex !== 0) return `canvas ${JSON.stringify(s)}`;
        return true;
      });

      await record(browserName, name('Fit and 100% change the element size and keep the aspect'), async () => {
        const fit = await canvasBox(page);
        await page.getByTestId('python-display-100').click();
        await sleep(150);
        const actual = await canvasBox(page);
        await page.getByTestId('python-display-fit').click();
        await sleep(150);
        const back = await canvasBox(page);
        const aspect = (b) => b.w / b.h;
        if (Math.abs(actual.w - 480) > 1 || Math.abs(actual.h - 320) > 1) return `100%: ${actual.w}x${actual.h}`;
        if (Math.abs(aspect(fit) - 1.5) > 0.01) return `Fit aspect ${fit.w}x${fit.h}`;
        if (Math.abs(fit.w - actual.w) < 2) return `Fit equals 100% (${fit.w}x${fit.h})`;
        if (Math.abs(back.w - fit.w) > 1) return `Fit again ${back.w} != ${fit.w}`;
        const pressed = await page.getByTestId('python-display-fit').getAttribute('aria-pressed');
        if (pressed !== 'true') return `Fit aria-pressed=${pressed}`;
        return { ok: true, note: `Fit ${Math.round(fit.w)}x${Math.round(fit.h)}` };
      });

      await record(browserName, name('another output tab or header tab sets hidden (frames slow), back resumes; no re-activation'), async () => {
        const rate = async () => {
          const a = await stats(page);
          await sleep(1000);
          const b = await stats(page);
          return { presented: b.presented - a.presented, hidden: b.hidden };
        };
        await outputTab(page, 'Console').click();
        await sleep(300);
        const hiddenRate = await rate();
        const consoleStill = await outputTab(page, 'Console').getAttribute('aria-selected');
        await outputTab(page, 'Display').click();
        await sleep(300);
        const shownRate = await rate();
        await headerTab(page, 'Examples').click();
        await sleep(300);
        const viewHidden = (await stats(page)).hidden;
        await headerTab(page, 'Workbench').click();
        await sleep(300);
        const viewBack = (await stats(page)).hidden;
        const note = `hidden ${hiddenRate.presented}/s, shown ${shownRate.presented}/s`;
        if (!hiddenRate.hidden || hiddenRate.presented > 10) return `hidden: ${JSON.stringify(hiddenRate)}`;
        if (consoleStill !== 'true') return 'Display tab re-activated while the program ran';
        if (shownRate.hidden || shownRate.presented < 30) return `shown: ${JSON.stringify(shownRate)}`;
        if (!viewHidden || viewBack) return `header tab hidden=${viewHidden}, back=${viewBack}`;
        return { ok: true, note };
      }, '', 30000);

      await record(browserName, name('Screenshot to Plots adds a titled PNG to the Plots gallery'), async () => {
        await page.getByTestId('python-display-screenshot').click();
        await page.waitForFunction(
          () => /Added to Plots/.test(document.querySelector('[data-testid="python-display-hint"]')?.textContent || ''),
          null,
          { timeout: 5000 },
        );
        await outputTab(page, 'Plots').click();
        await page.getByTestId('python-plot-stage-img').waitFor({ state: 'visible', timeout: 5000 });
        const s = await page.evaluate(async () => {
          const img = document.querySelector('[data-testid="python-plot-stage-img"]');
          await img.decode().catch(() => {});
          return { w: img.naturalWidth, h: img.naturalHeight, meta: document.querySelector('[data-testid="python-plots-panel"]').textContent };
        });
        await outputTab(page, 'Display').click();
        if (s.w !== 480 || s.h !== 320) return `screenshot ${s.w}x${s.h}`;
        if (!s.meta.includes('Bouncing ball') || !s.meta.includes('vdisplay')) return `gallery text: ${s.meta.slice(0, 200)}`;
        return true;
      });

      await record(browserName, name('Fullscreen enters on the panel, "Exit fullscreen" stays visible, Esc leaves'), async () => {
        const btn = page.getByTestId('python-display-fullscreen');
        if ((await btn.count()) === 0) return { ok: true, note: 'skipped: document.fullscreenEnabled is false here' };
        await btn.click();
        const entered = await page
          .waitForFunction(() => document.querySelector('[data-testid="python-display-panel"]')?.dataset.fullscreen === 'true', null, { timeout: 3000 })
          .then(() => true, () => false);
        if (!entered) return { ok: true, note: 'skipped: requestFullscreen is refused in this headless browser' };
        const s = await page.evaluate(() => {
          const panel = document.querySelector('[data-testid="python-display-panel"]');
          const b = document.querySelector('[data-testid="python-display-fullscreen"]');
          const r = b.getBoundingClientRect();
          return { isPanel: document.fullscreenElement === panel, text: b.textContent, visible: r.width > 0 && r.bottom <= window.innerHeight };
        });
        await page.keyboard.press('Escape');
        const left = await page
          .waitForFunction(() => !document.fullscreenElement && document.querySelector('[data-testid="python-display-panel"]')?.dataset.fullscreen === 'false', null, { timeout: 3000 })
          .then(() => true, () => false);
        if (!s.isPanel || s.text !== 'Exit fullscreen' || !s.visible) return JSON.stringify(s);
        if (!left) return 'Esc did not leave fullscreen';
        return true;
      });

      await record(browserName, name('Stop ends the running bouncing ball within 1 s'), async () => {
        const t0 = Date.now();
        await page.getByTestId('python-stop-btn').click();
        await waitRunIdle(page, 5000);
        const ms = Date.now() - t0;
        const summary = (await page.getByTestId('python-run-summary').textContent()) || '';
        if (ms > 1000) return `took ${ms} ms`;
        if (!/Interrupted/.test(summary)) return `summary: ${summary}; console: ${(await consoleText(page)).slice(-500)}`;
        return { ok: true, note: `${ms} ms` };
      });

      await record(browserName, name('paint: a mouse drag paints, c clears, keys prevented only for the display, Esc releases'), async () => {
        await loadAndRun(page, 'paint');
        await waitDisplayShown(page, 480, 320, outputTab(page, 'Display'));
        await page.waitForFunction((sel) => {
          const d = document.querySelector(sel).getContext('2d').getImageData(240, 160, 1, 1).data;
          return d[0] === 32 && d[1] === 32 && d[2] === 32;
        }, CANVAS, { timeout: 10000 });
        const hint0 = (await page.getByTestId('python-display-hint').textContent()) || '';
        const b = await canvasBox(page);
        const at = (dx, dy) => [b.x + (dx * b.w) / b.dw, b.y + (dy * b.h) / b.dh];
        await page.mouse.move(...at(100, 160));
        await page.mouse.down();
        for (let i = 1; i <= 14; i++) await page.mouse.move(...at(100 + i * 20, 160), { steps: 1 });
        await page.mouse.up();
        await sleep(400);
        const painted = await pixelAt(page, 240, 160);
        const focused = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), CANVAS);
        const hint1 = (await page.getByTestId('python-display-hint').textContent()) || '';
        const prevented = await page.evaluate((sel) => {
          const c = document.querySelector(sel);
          const fire = (init) => {
            const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
            c.dispatchEvent(e);
            c.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, ...init }));
            return e.defaultPrevented;
          };
          return {
            arrow: fire({ key: 'ArrowLeft', code: 'ArrowLeft' }),
            space: fire({ key: ' ', code: 'Space' }),
            ctrlL: fire({ key: 'l', code: 'KeyL', ctrlKey: true }),
            ctrlW: fire({ key: 'w', code: 'KeyW', ctrlKey: true }),
            f5: fire({ key: 'F5', code: 'F5' }),
            f11: fire({ key: 'F11', code: 'F11' }),
          };
        }, CANVAS);
        await page.keyboard.press('c');
        await sleep(400);
        const cleared = await pixelAt(page, 240, 160);
        await page.keyboard.press('Escape');
        const released = await page.evaluate((sel) => document.activeElement !== document.querySelector(sel), CANVAS);
        if (!hint0.includes('Click the display to type')) return `hint before focus: ${hint0}`;
        if (isBackground(painted, [32, 32, 32])) return `drag did not paint: ${painted}`;
        if (!focused || !hint1.includes('Keys go to the program')) return `focus ${focused}, hint ${hint1}`;
        if (!prevented.arrow || !prevented.space || prevented.ctrlL || prevented.ctrlW || prevented.f5 || prevented.f11) {
          return `preventDefault: ${JSON.stringify(prevented)}`;
        }
        if (!isBackground(cleared, [32, 32, 32])) return `c did not clear: ${cleared}`;
        if (!released) return 'Esc did not release focus';
        return true;
      }, '', 70000);

      await record(browserName, name('Close ends the program loop; the run finishes and the panel says Closed'), async () => {
        const t0 = Date.now();
        await page.getByTestId('python-display-close').click();
        await waitRunIdle(page, 5000);
        const ms = Date.now() - t0;
        const summary = (await page.getByTestId('python-run-summary').textContent()) || '';
        const frame = (await page.getByTestId('python-display-frame').textContent()) || '';
        const closeDisabled = await page.getByTestId('python-display-close').isDisabled();
        if (!/Finished in/.test(summary)) return `summary: ${summary}`;
        if (!frame.includes('Closed') || !closeDisabled) return `frame "${frame}", close disabled ${closeDisabled}`;
        return { ok: true, note: `${ms} ms` };
      });

      await record(browserName, name('EN/NB labels of the tab, toolbar and frame'), async () => {
        const read = () =>
          page.evaluate((nav) => ({
            tab: Array.from(document.querySelectorAll(`${nav} [role="tab"]`)).map((t) => t.textContent.trim()).pop(),
            fit: document.querySelector('[data-testid="python-display-fit"]').textContent,
            shot: document.querySelector('[data-testid="python-display-screenshot"]').textContent,
            close: document.querySelector('[data-testid="python-display-close"]').textContent,
            label: document.querySelector('[data-testid="python-display-frame-label"]').textContent,
          }), nav);
        const nav = '[aria-label="Bytt mellom konsoll, REPL, plott og skjerm"]';
        const langBtn = page.locator('header button', { hasText: 'EN' }).filter({ hasText: 'NB' }).first();
        await langBtn.click();
        await page.waitForTimeout(200);
        const nb = await read();
        await langBtn.click();
        await page.waitForTimeout(200);
        const want = { tab: 'Skjerm', fit: 'Tilpass', shot: 'Skjermbilde til Plott', close: 'Lukk', label: 'Programutdata' };
        if (JSON.stringify(nb) !== JSON.stringify(want)) return `NB: ${JSON.stringify(nb)}`;
        const en = await page.evaluate(() => document.querySelector('[data-testid="python-display-fit"]').textContent);
        return en === 'Fit' ? true : `EN again: ${en}`;
      });

      await record(browserName, name('Light & Dark screenshots of the Display tab (1000 px, fractal)'), async () => {
        mkdirSync(shotsDir, { recursive: true });
        await page.setViewportSize({ width: 1000, height: 820 });
        await loadAndRun(page, 'numpy_fractal');
        await waitDisplayShown(page, 640, 480, outputTab(page, 'Display'));
        await waitRunIdle(page, 20000);
        const saved = [];
        for (const theme of ['Light', 'Dark']) {
          await page.locator(`header button[aria-label="${theme}"]`).click();
          await page.waitForTimeout(250);
          const path = join(shotsDir, `display-${theme.toLowerCase()}-${browserName}.png`);
          await page.screenshot({ path, fullPage: false });
          saved.push(path);
        }
        await page.locator('header button[aria-label="Light"]').click();
        await page.setViewportSize({ width: 1280, height: 800 });
        if (!(await noOverflow(page))) return 'horizontal overflow at 1000 px';
        return { ok: true, note: `saved ${saved.length} in ${shotsDir}` };
      }, '', 70000);

      await record(browserName, name('no console/page errors on desktop'), async () => {
        // Headless WebKit: Monaco's error handler logs a NotAllowedError, and a Monaco promise rejects with
        // Canceled, when the page enters fullscreen (requestFullscreen itself resolves). Not from the panel.
        const monacoFullscreen = /^(console\.error: %c\s+ERR .*NotAllowedError: The request is not allowed|pageerror: Canceled: Canceled$)/;
        const all = errTracker.getErrors();
        const errs = browserName === 'webkit' ? all.filter((e) => !monacoFullscreen.test(e)) : all;
        if (errs.length > 0) return `errors: ${errs.join(' | ')}`;
        return all.length > errs.length ? { ok: true, note: `ignored ${all.length - errs.length} Monaco errors on fullscreen` } : true;
      });
    } finally {
      errTracker.detach();
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- Phone 375x812 with touch
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
    const page = await ctx.newPage();
    const errTracker = attachErrorTracker(page, { allowCspProbe: true });
    try {
      await record(browserName, name('phone 375x812 touch: Display pane auto-selected, a touch drag paints, 0 overflow'), async () => {
        await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
        await acknowledgeW1(page, waitIsolatedMain);
        await waitMonacoAndPyodideReady(page, 20000);
        await loadAndRun(page, 'paint');
        const paneTab = page.locator(PANE_NAV).getByRole('tab', { name: 'Display', exact: true });
        await waitDisplayShown(page, 480, 320, paneTab);
        await page.waitForFunction((sel) => {
          const d = document.querySelector(sel).getContext('2d').getImageData(240, 160, 1, 1).data;
          return d[0] === 32 && d[1] === 32 && d[2] === 32;
        }, CANVAS, { timeout: 10000 });
        await page.locator(CANVAS).scrollIntoViewIfNeeded();
        const b = await canvasBox(page);
        const at = (dx, dy) => ({ x: b.x + (dx * b.w) / b.dw, y: b.y + (dy * b.h) / b.dh });
        const points = Array.from({ length: 15 }, (_, i) => at(100 + i * 20, 160));
        let how;
        if (browserName === 'edge') {
          how = 'CDP touch';
          const cdp = await ctx.newCDPSession(page);
          const tp = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(points[0]) });
          for (const p of points.slice(1)) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(p) });
            await sleep(16);
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          how = 'synthetic touch PointerEvents';
          await page.evaluate(({ sel, pts }) => {
            const c = document.querySelector(sel);
            const fire = (type, p, buttons) =>
              c.dispatchEvent(new PointerEvent(type, {
                bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true,
                clientX: p.x, clientY: p.y, button: type === 'pointermove' ? -1 : 0, buttons,
              }));
            fire('pointerdown', pts[0], 1);
            for (const p of pts.slice(1)) fire('pointermove', p, 1);
            fire('pointerup', pts[pts.length - 1], 0);
          }, { sel: CANVAS, pts: points });
        }
        await sleep(500);
        const painted = await pixelAt(page, 240, 160);
        const geo = await page.evaluate((sel) => {
          const r = document.querySelector(sel).getBoundingClientRect();
          return { right: r.right, width: window.innerWidth, scrollY: window.scrollY };
        }, CANVAS);
        const overflow = !(await noOverflow(page));
        await page.getByTestId('python-stop-btn').click();
        await waitRunIdle(page, 5000);
        if (isBackground(painted, [32, 32, 32])) return `touch drag did not paint (${how}): ${painted}`;
        if (overflow || geo.right > geo.width + 1) return `overflow: ${JSON.stringify(geo)}`;
        const errs = errTracker.getErrors();
        if (errs.length > 0) return `errors: ${errs.join(' | ')}`;
        return { ok: true, note: how };
      }, '', 90000);
    } finally {
      errTracker.detach();
      await ctx.close();
    }
  }
}
