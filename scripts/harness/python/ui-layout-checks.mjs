// L2a 3-browser UI checks of the playground's desktop dock (components/Python/layout/): presets render
// every panel without overlap or overflow at 1280x720 and 1920x1080, the 900–1100 px merge rule, panel
// state kept across preset switches (xterm scrollback, Monaco undo, a running display), splitters by
// keyboard and pointer, persistence, Reset layout, a broken stored layout, phone unchanged, EN/NB.
// Imported by ui.mjs (PYTHON_UI_ONLY=layout runs it alone).

const PRESETS = ['classic', 'consoleBelow', 'wideOutput', 'sideBySide', 'editorFocus', 'displayFocus'];
const KEY = 'python:layout-v1';
const MIN = {
  editor: [320, 200],
  files: [180, 160],
  console: [260, 120],
  repl: [260, 120],
  plots: [260, 160],
  display: [240, 160],
};
const CANVAS = '[data-testid="python-display-canvas"]';

async function acknowledgeW1(page, waitIsolatedMain) {
  await waitIsolatedMain(page, 20000);
  const w1 = page.getByTestId('python-w1-dialog');
  await w1.waitFor({ state: 'visible', timeout: 8000 });
  await page.getByTestId('python-w1-ack').click();
  await w1.waitFor({ state: 'hidden', timeout: 5000 });
}

async function choosePreset(page, id) {
  await page.getByTestId('python-layout-btn').click();
  await page.getByTestId(`python-layout-${id}`).click();
  await page.waitForFunction((m) => document.querySelector('[data-testid="python-dock"]')?.dataset.layoutMode === m, id, {
    timeout: 5000,
  });
  await page.waitForTimeout(120);
}

/** Geometry of the dock: groups, panel hosts, overflow. */
async function measure(page) {
  return page.evaluate((MIN) => {
    const dock = document.querySelector('[data-testid="python-dock"]');
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    };
    const groups = Array.from(dock.querySelectorAll('[data-dock-group]')).map((g) => ({
      id: g.dataset.dockGroup,
      r: rect(g),
      panels: Array.from(g.querySelectorAll(':scope > div > [data-panel]')).map((h) => h.dataset.panel),
    }));
    const hosts = Array.from(document.querySelectorAll('[data-panel]')).map((h) => ({
      p: h.dataset.panel,
      inDock: dock.contains(h),
      shown: h.style.display !== 'none' && h.getBoundingClientRect().width > 0,
      r: rect(h),
    }));
    const problems = [];
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const a = groups[i].r;
        const b = groups[j].r;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 1 && oy > 1) problems.push(`overlap ${groups[i].id}/${groups[j].id}`);
      }
    }
    for (const h of hosts) {
      if (!h.shown) continue;
      const [mw, mh] = MIN[h.p];
      if (h.r.w < mw - 2 || h.r.h < mh - 2) problems.push(`${h.p} ${Math.round(h.r.w)}x${Math.round(h.r.h)} < ${mw}x${mh}`);
      const d = dock.getBoundingClientRect();
      if (h.r.x < d.left - 1 || h.r.x + h.r.w > d.right + 1) problems.push(`${h.p} outside the dock`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth + 1) problems.push('horizontal overflow');
    return { groups, hosts, problems, mode: dock.dataset.layoutMode };
  }, MIN);
}

async function consoleRows(page) {
  return page.evaluate(() => {
    const rows = document.querySelector('[data-testid="python-console-xterm"] .xterm-rows');
    return rows ? Array.from(rows.children).map((r) => r.textContent || '') : [];
  });
}

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

async function waitRunIdle(page, timeoutMs = 15000) {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="python-run-btn"]');
      return Boolean(btn) && !btn.disabled && !document.querySelector('[data-testid="python-stop-btn"]');
    },
    { timeout: timeoutMs },
  );
}

export async function runLayoutUiSuite(
  browserName,
  browser,
  baseUrl,
  { record, waitIsolatedMain, waitMonacoAndPyodideReady, attachErrorTracker },
) {
  const name = (s) => `L2a Layout: ${s}`;

  // ------------------------------------------------------------- 1280x720: presets, state, splitters
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errTracker = attachErrorTracker(page, { allowCspProbe: true });
    try {
      await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
      await acknowledgeW1(page, waitIsolatedMain);
      await waitMonacoAndPyodideReady(page, 20000);

      await record(browserName, name('Classic by default; Layout menu lists 6 presets + Custom (disabled) + Reset'), async () => {
        const m = await measure(page);
        if (m.mode !== 'classic') return `mode ${m.mode}`;
        await page.getByTestId('python-layout-btn').click();
        const menu = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="python-layout-menu"]');
          return {
            role: el?.getAttribute('role'),
            items: Array.from(el.querySelectorAll('[role="menuitemradio"]')).map((b) => [b.textContent.replace('✓', '').trim(), b.getAttribute('aria-checked'), b.disabled]),
            reset: el.querySelector('[role="menuitem"]')?.textContent.trim(),
            focused: document.activeElement?.dataset.testid,
          };
        });
        await page.keyboard.press('Escape');
        const back = await page.evaluate(() => document.activeElement?.dataset.testid);
        const want = ['Classic', 'Console below', 'Wide output below', 'Side by side', 'Editor focus', 'Display focus', 'Custom'];
        if (menu.role !== 'menu' || JSON.stringify(menu.items.map((i) => i[0])) !== JSON.stringify(want)) return JSON.stringify(menu);
        if (menu.items[0][1] !== 'true' || !menu.items[6][2] || menu.reset !== 'Reset layout') return JSON.stringify(menu);
        if (menu.focused !== 'python-layout-classic' || back !== 'python-layout-btn') return `focus ${menu.focused} -> ${back}`;
        return true;
      });

      // Fill the console, type in Monaco: both must survive every preset switch.
      await page.evaluate(() => {
        window.monaco.editor.getModels()[0].setValue('for i in range(300):\n    print(f"row {i:03d}")\n');
      });
      await page.getByTestId('python-run-btn').click();
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('[data-testid="python-console-xterm"] .xterm-rows > div')).some((r) => r.textContent.includes('row 299')),
        null,
        { timeout: 15000 },
      );
      await waitRunIdle(page);
      await page.evaluate(() => {
        const ed = window.monaco.editor.getEditors()[0];
        ed.__layoutTag = 'kept';
        document.querySelector('[data-testid="python-console-xterm"]').__layoutTag = 'kept';
        ed.focus();
        ed.setPosition({ lineNumber: 3, column: 1 });
      });
      await page.keyboard.type('# typed before switching');

      for (const id of PRESETS) {
        await record(browserName, name(`${id} at 1280x720: all panels docked, no overlap, mins kept, no overflow`), async () => {
          await choosePreset(page, id);
          const m = await measure(page);
          if (m.problems.length) return m.problems.join('; ');
          const docked = m.hosts.filter((h) => h.inDock).map((h) => h.p).sort();
          if (docked.length !== 6) return `docked: ${docked.join(',')}`;
          const shown = m.hosts.filter((h) => h.shown).map((h) => h.p);
          if (!shown.includes('editor')) return `shown: ${shown.join(',')}`;
          // Every framed group is labelled "Program output" and holds only output panels' active tab.
          const frames = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-program-output]')).map((g) => g.querySelector('[class*="programOutputLabel"]')?.textContent),
          );
          if (!frames.length || frames.some((f) => f !== 'Program output')) return `frames ${JSON.stringify(frames)}`;
          return true;
        });
      }

      await record(browserName, name('switching presets keeps xterm scrollback, the same Monaco editor and its undo'), async () => {
        await choosePreset(page, 'classic');
        const kept = await page.evaluate(() => ({
          editors: window.monaco.editor.getEditors().length,
          ed: window.monaco.editor.getEditors()[0].__layoutTag,
          xterm: document.querySelector('[data-testid="python-console-xterm"]').__layoutTag,
          text: window.monaco.editor.getModels()[0].getValue(),
        }));
        if (kept.editors !== 1 || kept.ed !== 'kept' || kept.xterm !== 'kept' || !kept.text.includes('# typed before switching')) {
          return JSON.stringify(kept);
        }
        const rows = await consoleRows(page);
        if (!rows.some((r) => r.includes('row 299'))) return `last row missing: ${rows.slice(-3).join('|')}`;
        await page.locator('[data-testid="python-console-xterm"] .xterm-screen').click();
        for (let i = 0; i < 40; i += 1) await page.keyboard.press('Shift+PageUp');
        await page.waitForTimeout(150);
        const up = await consoleRows(page);
        if (!up.some((r) => /row 0[0-4]\d/.test(r))) return `scrollback not reached: ${up.slice(0, 2).join('|')}`;
        const undone = await page.evaluate(() => {
          const ed = window.monaco.editor.getEditors()[0];
          for (let i = 0; i < 40 && ed.getModel().getValue().includes('#'); i += 1) ed.getModel().undo();
          return ed.getModel().getValue();
        });
        if (undone.includes('#')) return `undo failed: ${undone}`;
        return true;
      });

      await record(browserName, name('splitter by keyboard: separator ARIA, arrows, Shift, Enter reset, preset kept'), async () => {
        await choosePreset(page, 'classic');
        const sep = page.getByTestId('python-splitter-root-1');
        const attrs = await sep.evaluate((el) => ({
          role: el.getAttribute('role'),
          o: el.getAttribute('aria-orientation'),
          now: el.getAttribute('aria-valuenow'),
          label: el.getAttribute('aria-label'),
        }));
        if (attrs.role !== 'separator' || attrs.o !== 'vertical' || attrs.now !== '18' || attrs.label !== 'Resize Files and Editor') {
          return JSON.stringify(attrs);
        }
        await sep.focus();
        await page.keyboard.press('ArrowRight');
        const a = await sep.getAttribute('aria-valuenow');
        await page.keyboard.press('Shift+ArrowRight');
        const b = await sep.getAttribute('aria-valuenow');
        await page.keyboard.press('ArrowLeft');
        const c = await sep.getAttribute('aria-valuenow');
        const mode = await page.getByTestId('python-dock').getAttribute('data-layout-mode');
        if (a !== '20' || b !== '30' || c !== '28' || mode !== 'classic') return `${a} ${b} ${c} ${mode}`;
        const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
        if (!stored || stored.presetSizes.classic.root[0] !== 0.28) return JSON.stringify(stored);
        await page.keyboard.press('Home');
        const home = Number(await sep.getAttribute('aria-valuenow'));
        await page.keyboard.press('Enter');
        const reset = await sep.getAttribute('aria-valuenow');
        if (!(home < 18) || reset !== '18') return `home ${home} reset ${reset}`;
        return true;
      });

      await record(browserName, name('splitter by pointer drag; preset and sizes persist across reload'), async () => {
        await choosePreset(page, 'sideBySide');
        const sep = page.getByTestId('python-splitter-right-1');
        const box = await sep.boundingBox();
        const before = Number(await sep.getAttribute('aria-valuenow'));
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 5 });
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 80, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(150);
        const after = Number(await sep.getAttribute('aria-valuenow'));
        if (!(after < before - 5)) return `drag ${before} -> ${after}`;
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitMonacoAndPyodideReady(page, 20000);
        await page.waitForFunction(() => document.querySelector('[data-testid="python-dock"]')?.dataset.layoutMode === 'sideBySide', null, {
          timeout: 8000,
        });
        const again = Number(await page.getByTestId('python-splitter-right-1').getAttribute('aria-valuenow'));
        if (again !== after) return `after reload ${again} (want ${after})`;
        await page.getByTestId('python-layout-btn').click();
        const checked = await page.getByTestId('python-layout-sideBySide').getAttribute('aria-checked');
        await page.keyboard.press('Escape');
        return checked === 'true' || `checked ${checked}`;
      });

      await record(browserName, name('Hide files persists; Reset layout returns to Classic and clears the stored key'), async () => {
        await page.getByTestId('python-toggle-files-btn').click();
        let m = await measure(page);
        if (m.hosts.find((h) => h.p === 'files').inDock) return 'files still docked';
        if (m.problems.length) return m.problems.join('; ');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitMonacoAndPyodideReady(page, 20000);
        await page.waitForFunction(() => document.querySelector('[data-testid="python-dock"]')?.dataset.layoutMode === 'sideBySide', null, {
          timeout: 8000,
        });
        const pressed = await page.getByTestId('python-toggle-files-btn').getAttribute('aria-pressed');
        if (pressed !== 'false') return `files toggle ${pressed}`;
        await page.getByTestId('python-layout-btn').click();
        await page.getByTestId('python-layout-reset').click();
        await page.waitForFunction(() => document.querySelector('[data-testid="python-dock"]')?.dataset.layoutMode === 'classic');
        await page.waitForTimeout(100);
        m = await measure(page);
        const stored = await page.evaluate((k) => localStorage.getItem(k), KEY);
        const now = await page.getByTestId('python-splitter-root-1').getAttribute('aria-valuenow');
        if (stored !== null || !m.hosts.find((h) => h.p === 'files').inDock || now !== '18') return `${stored} ${now}`;
        return true;
      });

      await record(browserName, name('a broken stored layout falls back to Classic and is removed'), async () => {
        await page.evaluate((k) => localStorage.setItem(k, '{"v":1,"mode":"custom","custom":{"kind":"group"}}'), KEY);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitMonacoAndPyodideReady(page, 20000);
        await page.waitForTimeout(200);
        const mode = await page.getByTestId('python-dock').getAttribute('data-layout-mode');
        const stored = await page.evaluate((k) => localStorage.getItem(k), KEY);
        return (mode === 'classic' && stored === null) || `${mode} ${stored}`;
      });

      await record(browserName, name('a running bouncing ball keeps drawing across preset switches'), async () => {
        await page.locator('header [role="tablist"]').getByRole('tab', { name: 'Examples' }).click();
        await page.getByTestId('python-example-load-bouncing_ball').scrollIntoViewIfNeeded();
        await page.getByTestId('python-example-load-bouncing_ball').click();
        await page.waitForFunction(
          () => window.monaco?.editor?.getEditors?.()[0]?.getModel?.()?.uri.path.endsWith('/workspace/bouncing_ball/main.py'),
          null,
          { timeout: 8000 },
        );
        await page.getByTestId('python-run-btn').click();
        await page.waitForFunction((sel) => {
          const c = document.querySelector(sel);
          return Boolean(c) && c.width > 0 && c.getBoundingClientRect().width > 0;
        }, CANVAS, { timeout: 20000 });
        await page.evaluate((sel) => {
          document.querySelector(sel).__layoutTag = 'kept';
        }, CANVAS);
        for (const id of ['displayFocus', 'consoleBelow', 'wideOutput', 'classic']) {
          await choosePreset(page, id);
          // Classic shows the Console after a run only if asked; make the Display the active tab.
          const tab = page.locator('[data-dock-group]').filter({ has: page.locator('[data-panel="display"]') }).getByRole('tab', { name: /^Display/ });
          if (await tab.count()) await tab.click();
          const h1 = await pixelHash(page);
          await page.waitForTimeout(250);
          const h2 = await pixelHash(page);
          const tag = await page.evaluate((sel) => document.querySelector(sel)?.__layoutTag, CANVAS);
          if (tag !== 'kept') return `${id}: canvas re-created`;
          if (h1 === null || h1 === h2) return `${id}: not drawing (${h1} ${h2})`;
        }
        await page.getByTestId('python-stop-btn').click();
        await waitRunIdle(page);
        return true;
      });

      await record(browserName, name('EN/NB labels of the Layout menu'), async () => {
        const langBtn = page.locator('header button', { hasText: 'EN' }).filter({ hasText: 'NB' }).first();
        await langBtn.click();
        await page.waitForTimeout(200);
        await page.getByTestId('python-layout-btn').click();
        const nb = await page.evaluate(() => ({
          btn: document.querySelector('[data-testid="python-layout-btn"]').textContent.replace(/\W+$/, '').trim(),
          items: Array.from(document.querySelectorAll('[data-testid="python-layout-menu"] [role^="menuitem"]')).map((b) => b.textContent.replace('✓', '').trim()),
          sep: document.querySelector('[data-testid="python-splitter-root-1"]').getAttribute('aria-label'),
        }));
        await page.keyboard.press('Escape');
        await langBtn.click();
        await page.waitForTimeout(200);
        const want = {
          btn: 'Oppsett',
          items: ['Klassisk', 'Konsoll under', 'Bred utdata under', 'Side om side', 'Fokus på editoren', 'Fokus på skjermen', 'Egendefinert', 'Tilbakestill oppsettet'],
          sep: 'Endre størrelsen på Filer og Editor',
        };
        return JSON.stringify(nb) === JSON.stringify(want) || JSON.stringify(nb);
      });

      await record(browserName, name('0 page errors (1280x720)'), async () => {
        const errs = errTracker.getErrors();
        return errs.length === 0 || errs.slice(0, 3).join(' | ');
      });
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  // ------------------------------------------------------------- 1920x1080 and the 900–1100 px merge rule
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await ctx.newPage();
    try {
      await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
      await acknowledgeW1(page, waitIsolatedMain);
      await page.getByTestId('python-dock').waitFor({ state: 'visible', timeout: 10000 });
      await record(browserName, name('every preset at 1920x1080: no overlap, mins kept, no overflow'), async () => {
        for (const id of PRESETS) {
          await choosePreset(page, id);
          const m = await measure(page);
          if (m.problems.length) return `${id}: ${m.problems.join('; ')}`;
          if (m.hosts.filter((h) => h.inDock).length !== 6) return `${id}: not all docked`;
        }
        return true;
      });

      await record(browserName, name('Console below merges Plots and Display at 1000 px, splits them again at 1280 px'), async () => {
        await choosePreset(page, 'consoleBelow');
        const groupOf = async (p) => (await measure(page)).groups.find((g) => g.panels.includes(p))?.id;
        await page.setViewportSize({ width: 1000, height: 800 });
        await page.waitForTimeout(250);
        const narrow = await measure(page);
        const a = await groupOf('plots');
        const b = await groupOf('display');
        if (narrow.problems.length) return `1000: ${narrow.problems.join('; ')}`;
        if (!a || a !== b) return `1000 px: plots in ${a}, display in ${b}`;
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(250);
        const c = await groupOf('plots');
        const d = await groupOf('display');
        if (c === d) return `1280 px: still merged (${c})`;
        // The stored layout is unchanged by the merge.
        const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
        if (stored.mode !== 'consoleBelow' || Object.keys(stored.presetSizes).length) return JSON.stringify(stored);
        for (const w of [900, 1100]) {
          await page.setViewportSize({ width: w, height: 800 });
          await page.waitForTimeout(250);
          for (const id of PRESETS) {
            await choosePreset(page, id);
            const m = await measure(page);
            if (m.problems.length) return `${id}@${w}: ${m.problems.join('; ')}`;
          }
        }
        return true;
      });
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  // ------------------------------------------------------------- phone 375x812: unchanged, no dock
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: browserName !== 'firefox' });
    await ctx.addInitScript((k) => {
      try {
        if (!sessionStorage.getItem('layout-seeded')) {
          localStorage.setItem(k, JSON.stringify({ v: 1, mode: 'consoleBelow', custom: null, presetSizes: {}, filesHidden: true }));
          sessionStorage.setItem('layout-seeded', '1');
        }
      } catch {
        // ignore
      }
    }, KEY);
    const page = await ctx.newPage();
    try {
      await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
      await acknowledgeW1(page, waitIsolatedMain);
      await record(browserName, name('phone 375x812: no dock or Layout menu, pane tabs move the same hosts, stored layout kept'), async () => {
        const panes = page.locator('[aria-label="Switch between editor and output panes"]');
        await panes.waitFor({ state: 'visible', timeout: 10000 });
        const state = await page.evaluate(() => ({
          dock: Boolean(document.querySelector('[data-testid="python-dock"]')),
          menu: Boolean(document.querySelector('[data-testid="python-layout-btn"]')),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          hosts: document.querySelectorAll('[data-panel]').length,
        }));
        if (state.dock || state.menu || state.overflow || state.hosts !== 6) return JSON.stringify(state);
        for (const [tab, panel] of [['Files', 'files'], ['Console', 'console'], ['Editor', 'editor']]) {
          await panes.getByRole('tab', { name: tab, exact: true }).click();
          await page.waitForTimeout(150);
          const shown = await page.evaluate(
            () => Array.from(document.querySelectorAll('[data-panel]')).filter((h) => h.style.display !== 'none' && h.getBoundingClientRect().height > 0).map((h) => h.dataset.panel),
          );
          if (shown.length !== 1 || shown[0] !== panel) return `${tab}: shown ${shown.join(',')}`;
        }
        const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
        if (!stored || stored.mode !== 'consoleBelow' || stored.filesHidden !== true) return JSON.stringify(stored);
        return true;
      });
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}
