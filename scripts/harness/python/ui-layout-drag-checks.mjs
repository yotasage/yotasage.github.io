// L2b 3-browser UI checks of moving dock panels (components/Python/layout/useTabDrag.ts, DragOverlay.tsx,
// MoveToMenu.tsx): drag a tab below the Editor (Custom, persisted), into another group, to the full-width
// bottom zone; Esc cancels; a drop onto its own place keeps the preset; xterm scrollback, Monaco undo and a
// running display survive; the overlay covers the display canvas and the HTML preview iframe; Move to… by
// keyboard only; a touch drag; Reset; no overflow; phone unaffected; EN/NB. Run with the L2a layout suite
// (PYTHON_UI_ONLY=layout).
import { acknowledgeW1, CANVAS, choosePreset, consoleRows, KEY, measure, pixelHash, waitRunIdle } from './ui-layout-checks.mjs';

const DOCK = '[data-testid="python-dock"]';

/** Groups of the dock by id (rect, panels), the group of each panel, the mode and what has focus. */
async function geom(page) {
  return page.evaluate((DOCK) => {
    const dock = document.querySelector(DOCK);
    const rect = (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom };
    };
    const groups = {};
    const groupOf = {};
    for (const g of dock.querySelectorAll('[data-dock-group]')) {
      // Panels in tab order (the hosts' DOM order inside a body is not the tab order).
      const hosts = Array.from(g.querySelectorAll(':scope > div > [data-panel]')).map((h) => h.dataset.panel);
      const tabs = Array.from(g.querySelectorAll('[data-dock-header] [role="tab"][data-tab-panel]')).map((t) => t.dataset.tabPanel);
      const panels = tabs.length ? tabs : hosts;
      groups[g.dataset.dockGroup] = { r: rect(g), panels };
      for (const p of panels) groupOf[p] = g.dataset.dockGroup;
    }
    const a = document.activeElement;
    const focus = a?.dataset?.tabPanel ? `${a.getAttribute('role') || 'handle'}:${a.dataset.tabPanel}` : a?.dataset?.testid || a?.tagName;
    return { mode: dock.dataset.layoutMode, dock: rect(dock), groups, groupOf, focus };
  }, DOCK);
}

const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];

async function startDrag(page, panel) {
  const box = await page.locator(`${DOCK} [data-tab-panel="${panel}"]`).boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 12, { steps: 3 });
}

async function dragOver(page, x, y) {
  await page.mouse.move(x, y, { steps: 8 });
  await page.waitForTimeout(80);
}

async function preview(page) {
  return page.evaluate(() => {
    const p = document.querySelector('[data-testid="python-drop-preview"]');
    return {
      overlay: Boolean(document.querySelector('[data-testid="python-drag-overlay"]')),
      drop: p?.dataset.drop ?? null,
      label: p?.textContent ?? null,
    };
  });
}

async function drop(page) {
  await page.mouse.up();
  await page.waitForTimeout(200);
}

const stored = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);

async function menuState(page) {
  return page.evaluate(() => {
    const m = document.querySelector('[data-testid="python-move-menu"]');
    return m
      ? {
        label: m.getAttribute('aria-label'),
        role: m.getAttribute('role'),
        items: Array.from(m.querySelectorAll('[role="menuitem"]')).map((b) => b.textContent),
        focused: document.activeElement?.getAttribute('role'),
      }
      : null;
  });
}

/** True when `g`'s group sits directly under the Editor's group, as wide as it. */
function underEditor(g, panel) {
  const c = g.groups[g.groupOf[panel]];
  const e = g.groups[g.groupOf.editor];
  if (!c || !e || c === e) return false;
  return Math.abs(c.r.y - e.r.b) < 14 && Math.abs(c.r.x - e.r.x) < 3 && Math.abs(c.r.w - e.r.w) < 3;
}

export async function runLayoutDragUiSuite(browserName, browser, baseUrl, { record, waitIsolatedMain, waitMonacoAndPyodideReady, attachErrorTracker }) {
  const name = (s) => `L2b Move panels: ${s}`;
  let customJson = null;

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errTracker = attachErrorTracker(page, { allowCspProbe: true });
    try {
      await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
      await acknowledgeW1(page, waitIsolatedMain);
      await waitMonacoAndPyodideReady(page, 20000);

      // Console lines, an HTML file for the preview iframe and typed text in Monaco must survive the moves.
      await page.evaluate(() => {
        window.monaco.editor
          .getModels()[0]
          .setValue('for i in range(300):\n    print(f"row {i:03d}")\nopen("page.html", "w").write("<h1>preview</h1>")\n');
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
        ed.setPosition({ lineNumber: 4, column: 1 });
      });
      await page.keyboard.type('# typed before dragging');

      await record(browserName, name('drag Console below the Editor: preview, Custom, Console alone under the Editor, focus on its tab'), async () => {
        const g0 = await geom(page);
        if (g0.mode !== 'classic') return `mode ${g0.mode}`;
        const ed = g0.groups[g0.groupOf.editor].r;
        await startDrag(page, 'console');
        await dragOver(page, ed.x + ed.w / 2, ed.b - ed.h * 0.12);
        const pv = await preview(page);
        await drop(page);
        if (!pv.overlay || pv.drop !== `edge-${g0.groupOf.editor}-bottom` || pv.label !== 'Below Editor') return JSON.stringify(pv);
        const g = await geom(page);
        if (g.mode !== 'custom' || !underEditor(g, 'console')) return JSON.stringify(g);
        if (g.groups[g.groupOf.console].panels.join() !== 'console') return `group ${g.groups[g.groupOf.console].panels}`;
        if (g.focus !== 'tab:console') return `focus ${g.focus}`;
        const m = await measure(page);
        if (m.problems.length) return m.problems.join('; ');
        customJson = await stored(page);
        const s = JSON.parse(customJson || 'null');
        if (!s || s.mode !== 'custom' || !s.custom) return customJson;
        const status = await page.getByTestId('python-layout-status').textContent();
        return status === 'Console moved: Below Editor. The layout is now Custom.' || `status ${status}`;
      });

      await record(browserName, name('after the drag: xterm scrollback, the same Monaco editor and its undo'), async () => {
        const kept = await page.evaluate(() => ({
          editors: window.monaco.editor.getEditors().length,
          ed: window.monaco.editor.getEditors()[0].__layoutTag,
          xterm: document.querySelector('[data-testid="python-console-xterm"]').__layoutTag,
          text: window.monaco.editor.getModels()[0].getValue(),
        }));
        if (kept.editors !== 1 || kept.ed !== 'kept' || kept.xterm !== 'kept' || !kept.text.includes('# typed before dragging')) return JSON.stringify(kept);
        await page.locator('[data-testid="python-console-xterm"] .xterm-screen').click();
        for (let i = 0; i < 80; i += 1) await page.keyboard.press('Shift+PageUp');
        await page.waitForTimeout(150);
        const up = await consoleRows(page);
        if (!up.some((r) => /row 0[0-4]\d/.test(r))) return `scrollback not reached: ${up.slice(0, 2).join('|')}`;
        const undone = await page.evaluate(() => {
          const ed = window.monaco.editor.getEditors()[0];
          for (let i = 0; i < 40 && ed.getModel().getValue().includes('# typed'); i += 1) ed.getModel().undo();
          return ed.getModel().getValue();
        });
        return !undone.includes('# typed') || `undo failed: ${undone}`;
      });

      await record(browserName, name('Layout menu shows Custom checked; a preset and back to Custom; Custom survives a reload'), async () => {
        await page.getByTestId('python-layout-btn').click();
        const c = await page.getByTestId('python-layout-custom').evaluate((b) => [b.getAttribute('aria-checked'), b.disabled]);
        await page.keyboard.press('Escape');
        if (c[0] !== 'true' || c[1]) return `custom item ${c}`;
        await choosePreset(page, 'classic');
        let g = await geom(page);
        if (underEditor(g, 'console')) return 'classic still has the custom tree';
        await choosePreset(page, 'custom');
        g = await geom(page);
        if (!underEditor(g, 'console')) return 'custom tree lost';
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitMonacoAndPyodideReady(page, 20000);
        await page.waitForFunction((d) => document.querySelector(d)?.dataset.layoutMode === 'custom', DOCK, { timeout: 8000 });
        g = await geom(page);
        return underEditor(g, 'console') || JSON.stringify(g.groups);
      });

      await record(browserName, name('drag Plots into the Console group: tabbed, Plots active and focused'), async () => {
        const g0 = await geom(page);
        const cg = g0.groupOf.console;
        await startDrag(page, 'plots');
        await dragOver(page, ...center(g0.groups[cg].r));
        const pv = await preview(page);
        await drop(page);
        if (pv.drop !== `tab-${cg}-end` || pv.label !== 'With Console') return JSON.stringify(pv);
        const g = await geom(page);
        if (g.groupOf.plots !== g.groupOf.console || g.groups[g.groupOf.console].panels.join() !== 'console,plots') return JSON.stringify(g.groups);
        const sel = await page.locator(`${DOCK} [role="tab"][data-tab-panel="plots"]`).getAttribute('aria-selected');
        if (sel !== 'true' || g.focus !== 'tab:plots') return `selected ${sel}, focus ${g.focus}`;
        const m = await measure(page);
        return m.problems.length === 0 || m.problems.join('; ');
      });

      await record(browserName, name('running bouncing ball: overlay covers the display canvas and the HTML preview iframe; Display to the full-width bottom keeps drawing'), async () => {
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
        await page.getByTestId('python-tree-item-page.html').click();
        await page.getByTestId('python-html-iframe').waitFor({ state: 'visible', timeout: 5000 });
        const g0 = await geom(page);
        await startDrag(page, 'display');
        await dragOver(page, g0.dock.x + g0.dock.w / 2, g0.dock.b - 10);
        const pv = await preview(page);
        const covered = await page.evaluate((sel) => {
          const hit = (el) => {
            if (!el) return 'missing';
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return Boolean(top?.closest('[data-testid="python-drag-overlay"]'));
          };
          return { canvas: hit(document.querySelector(sel)), iframe: hit(document.querySelector('[data-testid="python-html-iframe"]')) };
        }, CANVAS);
        await drop(page);
        if (pv.drop !== 'page-bottom' || pv.label !== 'Full width at the bottom') return JSON.stringify(pv);
        if (covered.canvas !== true || covered.iframe !== true) return `covered ${JSON.stringify(covered)}`;
        const g = await geom(page);
        const d = g.groups[g.groupOf.display];
        if (d.panels.join() !== 'display' || Math.abs(d.r.w - g.dock.w) > 4 || Math.abs(d.r.b - g.dock.b) > 4) return JSON.stringify(d);
        const h1 = await pixelHash(page);
        await page.waitForTimeout(250);
        const h2 = await pixelHash(page);
        const tag = await page.evaluate((sel) => document.querySelector(sel)?.__layoutTag, CANVAS);
        await page.getByTestId('python-stop-btn').click();
        await waitRunIdle(page);
        if (tag !== 'kept') return 'canvas re-created';
        if (h1 === null || h1 === h2) return `not drawing (${h1} ${h2})`;
        const m = await measure(page);
        return m.problems.length === 0 || m.problems.join('; ');
      });

      await record(browserName, name('Esc mid-drag cancels: overlay gone, layout and stored key unchanged'), async () => {
        const before = await stored(page);
        const g0 = await geom(page);
        const ed = g0.groups[g0.groupOf.editor].r;
        await startDrag(page, 'console');
        await dragOver(page, ed.r - 12, ed.y + ed.h / 2);
        const pv = await preview(page);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(80);
        const gone = await preview(page);
        await page.mouse.move(ed.r - 30, ed.y + ed.h / 2, { steps: 2 });
        await drop(page);
        const after = await stored(page);
        const g = await geom(page);
        if (!pv.overlay || !pv.drop) return `no preview ${JSON.stringify(pv)}`;
        if (gone.overlay) return 'overlay still shown after Esc';
        if (after !== before || JSON.stringify(g.groups) !== JSON.stringify(g0.groups) || g.mode !== g0.mode) return 'layout changed';
        return true;
      });

      await record(browserName, name('a drop onto its own place keeps the preset (Console on its own tab, the Editor handle on its group)'), async () => {
        await choosePreset(page, 'classic');
        const tab = await page.locator(`${DOCK} [role="tab"][data-tab-panel="console"]`).boundingBox();
        await startDrag(page, 'console');
        await dragOver(page, tab.x + tab.width * 0.25, tab.y + tab.height / 2);
        const pv1 = await preview(page);
        await drop(page);
        const g0 = await geom(page);
        const ed = g0.groups[g0.groupOf.editor].r;
        await startDrag(page, 'editor');
        await dragOver(page, ed.x + ed.w * 0.85, ed.y + ed.h / 2);
        const pv2 = await preview(page);
        await drop(page);
        const menu = await menuState(page);
        const g = await geom(page);
        const s = JSON.parse((await stored(page)) || '{}');
        if (!pv1.overlay || pv1.drop !== null || !pv2.overlay || pv2.drop !== null) return `previews ${JSON.stringify([pv1, pv2])}`;
        if (menu) return 'the handle opened its menu after a drag';
        return (g.mode === 'classic' && s.mode === 'classic') || `mode ${g.mode} / ${s.mode}`;
      });

      await record(browserName, name('Move to… by keyboard only: Shift+F10 on a tab, arrows, Enter; focus on the moved tab; Esc returns focus'), async () => {
        await page.locator(`${DOCK} [role="tab"][data-tab-panel="console"]`).focus();
        await page.keyboard.press('Shift+F10');
        const m = await menuState(page);
        const want = [
          'With Files',
          'Below Files',
          'Right of Files',
          'Below Editor',
          'Right of Editor',
          'Below REPL, Plots and Display',
          'Right of REPL, Plots and Display',
          'Full width at the bottom',
          'Full height at the right',
        ];
        if (!m || m.role !== 'menu' || m.label !== 'Move Console to' || m.focused !== 'menuitem' || JSON.stringify(m.items) !== JSON.stringify(want)) return JSON.stringify(m);
        await page.keyboard.press('Escape');
        let g = await geom(page);
        if ((await menuState(page)) || g.focus !== 'tab:console') return `after Esc: focus ${g.focus}`;
        await page.keyboard.press('Shift+F10');
        for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        g = await geom(page);
        if (g.mode !== 'custom' || !underEditor(g, 'console') || g.focus !== 'tab:console') return `after Enter: ${g.mode} ${g.focus}`;
        // Tab reaches the group's Move button; Enter opens its menu, Esc returns to the button.
        await page.keyboard.press('Tab');
        const btn = await page.evaluate(() => document.activeElement?.dataset.testid);
        await page.keyboard.press('Enter');
        const m2 = await menuState(page);
        const expanded = await page.evaluate(() => document.activeElement?.closest('[data-testid="python-move-menu"]') && document.querySelector('[data-testid="python-move-btn"][aria-expanded="true"]')?.getAttribute('aria-label'));
        await page.keyboard.press('Escape');
        const back = await page.evaluate(() => document.activeElement?.dataset.testid);
        if (btn !== 'python-move-btn' || !m2 || expanded !== 'Move Console to…' || back !== 'python-move-btn') return JSON.stringify({ btn, m2, expanded, back });
        // The Editor's handle: Enter opens its menu (only edges and the page edges; nothing joins the Editor).
        await page.getByTestId('python-move-handle-editor').focus();
        await page.keyboard.press('Enter');
        const m3 = await menuState(page);
        await page.keyboard.press('Escape');
        if (!m3 || m3.label !== 'Move Editor to' || m3.items.some((i) => i.startsWith('With'))) return JSON.stringify(m3);
        const m4 = await measure(page);
        return m4.problems.length === 0 || m4.problems.join('; ');
      });

      await record(browserName, name('Reset layout after a custom layout returns to Classic and disables Custom'), async () => {
        await page.getByTestId('python-layout-btn').click();
        await page.getByTestId('python-layout-reset').click();
        await page.waitForFunction((d) => document.querySelector(d)?.dataset.layoutMode === 'classic', DOCK);
        await page.waitForTimeout(100);
        await page.getByTestId('python-layout-btn').click();
        const disabled = await page.getByTestId('python-layout-custom').evaluate((b) => b.disabled);
        await page.keyboard.press('Escape');
        const g = await geom(page);
        const s = await stored(page);
        if (s !== null || !disabled || underEditor(g, 'console')) return `${s} ${disabled}`;
        return g.groups[g.groupOf.console].panels.join() === 'console,repl,plots,display' || JSON.stringify(g.groups);
      });

      await record(browserName, name('a touch drag (10 px threshold) moves Plots below the Editor'), async () => {
        const g0 = await geom(page);
        const ed = g0.groups[g0.groupOf.editor].r;
        const res = await page.evaluate(
          async ({ DOCK, tx, ty }) => {
            const tab = document.querySelector(`${DOCK} [role="tab"][data-tab-panel="plots"]`);
            const r = tab.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            const ev = (type, cx, cy) =>
              new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
            const tick = () => new Promise((f) => requestAnimationFrame(() => setTimeout(f, 0)));
            tab.dispatchEvent(ev('pointerdown', x, y));
            tab.dispatchEvent(ev('pointermove', x + 8, y));
            await tick();
            const early = Boolean(document.querySelector('[data-testid="python-drag-overlay"]'));
            for (let i = 1; i <= 6; i += 1) tab.dispatchEvent(ev('pointermove', x + ((tx - x) * i) / 6, y + ((ty - y) * i) / 6));
            await tick();
            const drop = document.querySelector('[data-testid="python-drop-preview"]')?.dataset.drop ?? null;
            tab.dispatchEvent(ev('pointerup', tx, ty));
            await tick();
            return { early, drop };
          },
          { DOCK, tx: ed.x + ed.w / 2, ty: ed.b - ed.h * 0.12 },
        );
        await page.waitForTimeout(150);
        const g = await geom(page);
        if (res.early || res.drop !== `edge-${g0.groupOf.editor}-bottom`) return JSON.stringify(res);
        return (g.mode === 'custom' && underEditor(g, 'plots')) || JSON.stringify(g.groups);
      });

      await record(browserName, name('EN/NB labels of Move to…, the Move button and the handle'), async () => {
        await choosePreset(page, 'classic');
        const langBtn = page.locator('header button', { hasText: 'EN' }).filter({ hasText: 'NB' }).first();
        await langBtn.click();
        await page.waitForTimeout(200);
        await page.locator(`${DOCK} [role="tab"][data-tab-panel="console"]`).click();
        await page.keyboard.press('Shift+F10');
        const m = await menuState(page);
        await page.keyboard.press('Escape');
        const labels = await page.evaluate(() => ({
          btn: document.querySelector('[data-dock-group] [data-testid="python-move-btn"]')?.getAttribute('aria-label'),
          handle: document.querySelector('[data-testid="python-move-handle-editor"]')?.getAttribute('aria-label'),
        }));
        await langBtn.click();
        await page.waitForTimeout(200);
        const want = [
          'Sammen med Filer',
          'Under Filer',
          'Til høyre for Filer',
          'Under Editor',
          'Til høyre for Editor',
          'Under REPL, Plott og Skjerm',
          'Til høyre for REPL, Plott og Skjerm',
          'Full bredde nederst',
          'Full høyde til høyre',
        ];
        if (!m || m.label !== 'Flytt Konsoll til' || JSON.stringify(m.items) !== JSON.stringify(want)) return JSON.stringify(m);
        if (labels.handle !== 'Flytt Editor' || !/^Flytt .+ til…$/.test(labels.btn || '')) return JSON.stringify(labels);
        return true;
      });

      await record(browserName, name('0 page errors (drag and drop)'), async () => {
        const errs = errTracker.getErrors();
        return errs.length === 0 || errs.slice(0, 3).join(' | ');
      });
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  // ------------------------------------------------------------- phone 375x812 with a stored custom layout
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: browserName !== 'firefox' });
    await ctx.addInitScript(
      ({ k, v }) => {
        try {
          if (v && !sessionStorage.getItem('layout-seeded')) {
            localStorage.setItem(k, v);
            sessionStorage.setItem('layout-seeded', '1');
          }
        } catch {
          // ignore
        }
      },
      { k: KEY, v: customJson },
    );
    const page = await ctx.newPage();
    try {
      await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
      await acknowledgeW1(page, waitIsolatedMain);
      await record(browserName, name('phone 375x812 with a custom layout stored: no dock, no move controls, pane tabs work, layout kept'), async () => {
        const panes = page.locator('[aria-label="Switch between editor and output panes"]');
        await panes.waitFor({ state: 'visible', timeout: 10000 });
        const state = await page.evaluate(() => ({
          dock: Boolean(document.querySelector('[data-testid="python-dock"]')),
          moves: document.querySelectorAll('[data-tab-panel], [data-testid="python-move-btn"]').length,
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        }));
        if (state.dock || state.moves || state.overflow) return JSON.stringify(state);
        await panes.getByRole('tab', { name: 'Console', exact: true }).click();
        await page.waitForTimeout(150);
        const shown = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-panel]')).filter((h) => h.style.display !== 'none' && h.getBoundingClientRect().height > 0).map((h) => h.dataset.panel),
        );
        if (shown.join() !== 'console') return `shown ${shown}`;
        const s = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), KEY)) || 'null');
        return (customJson === null || s?.mode === 'custom') || JSON.stringify(s);
      });
    } finally {
      await ctx.close().catch(() => {});
    }
  }
}
