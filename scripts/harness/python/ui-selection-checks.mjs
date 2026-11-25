// U2 UI checks of the Files panel called by ui.mjs (PYTHON_UI_ONLY=selection runs only them): selecting
// several files and folders (Ctrl+click, Shift+click, Space, Ctrl+A, Esc), deleting a selection (one
// confirmation, open tabs closed, the Python side and a reload agree), the selection ZIP, Reset workspace
// (off during a run, tick-box, Cancel, reseeded main.py, packages and settings kept), EN/NB labels, and a
// 375x812 touch phone deleting two files in Select mode with no horizontal overflow.

import { readFileSync } from 'node:fs';

const DIALOG_HIDDEN_MS = 8000;

function row(page, path) {
  return page.getByTestId(`python-tree-item-${path}`);
}

function rowButton(page, path) {
  return row(page, path).locator(':scope > button').first();
}

async function treePaths(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="python-file-tree"] [data-path]')).map((el) => el.getAttribute('data-path')),
  );
}

async function selectedPaths(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="python-file-tree"] [data-selected="true"]')).map((el) => el.getAttribute('data-path')),
  );
}

async function tabPaths(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="python-tab-"]:not([data-testid^="python-tab-close-"])'))
      .map((el) => el.getAttribute('data-testid').replace('python-tab-', ''))
      .filter((p) => p.includes('.')),
  );
}

async function setModelText(page, path, code) {
  await page.evaluate(
    ({ p, src }) => {
      const model = (window.monaco?.editor?.getModels?.() || []).find((m) => m.uri.path.endsWith(`/workspace/${p}`));
      if (!model) throw new Error(`no model for ${p}`);
      model.setValue(src);
    },
    { p: path, src: code },
  );
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

/** Runs main.py with `code` and waits for `marker` in the console. */
async function runMain(page, code, marker, waitTerminalContains) {
  await page.getByTestId('python-console-clear').click();
  await page.getByTestId('python-tab-main.py').click();
  await setModelText(page, 'main.py', code);
  await page.getByTestId('python-run-btn').click();
  await waitTerminalContains(page, 'python-console-xterm', marker, 15000);
  await waitRunIdle(page);
}

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function pythonStorageKeys(page) {
  return page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('python:') && k !== 'python:open-tabs-v1') out[k] = localStorage.getItem(k);
    }
    return JSON.stringify(out, Object.keys(out).sort());
  });
}

async function ackW1(page, waitIsolatedMain) {
  await waitIsolatedMain(page, 20000);
  const w1 = page.getByTestId('python-w1-dialog');
  await w1.waitFor({ state: 'visible', timeout: 8000 });
  await page.getByTestId('python-w1-ack').click();
  await w1.waitFor({ state: 'hidden', timeout: 5000 });
}

export async function runSelectionUiSuite(
  browserName,
  browser,
  baseUrl,
  { record, waitIsolatedMain, waitMonacoAndPyodideReady, waitTerminalContains, attachErrorTracker },
) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errTracker = attachErrorTracker(page, { allowCspProbe: true });
  try {
    await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
    await ackW1(page, waitIsolatedMain);
    await waitMonacoAndPyodideReady(page, 20000);

    await record(browserName, 'U2 Files: Ctrl+click 2 files + folder -> Delete -> gone (tabs, Python, reload)', async () => {
      await runMain(
        page,
        [
          'import os',
          'os.makedirs("dir/sub", exist_ok=True)',
          'for p in ["a.txt", "b.txt", "keep.txt", "dir/x.txt", "dir/sub/y.txt"]:',
          '    open(p, "w").write(p)',
          'print("SEEDED")',
        ].join('\n'),
        'SEEDED',
        waitTerminalContains,
      );
      for (const p of ['a.txt', 'b.txt', 'keep.txt', 'dir', 'dir/x.txt']) await row(page, p).waitFor({ state: 'visible', timeout: 8000 });
      await rowButton(page, 'a.txt').click();
      await rowButton(page, 'b.txt').click();
      await page.getByTestId('python-tab-a.txt').waitFor({ state: 'visible', timeout: 5000 });
      await page.getByTestId('python-tab-b.txt').waitFor({ state: 'visible', timeout: 5000 });

      await rowButton(page, 'a.txt').click({ modifiers: ['Control'] });
      await rowButton(page, 'b.txt').click({ modifiers: ['Control'] });
      await rowButton(page, 'dir').click({ modifiers: ['Control'] });
      const count = (await page.getByTestId('python-selection-count').textContent())?.trim();
      if (count !== '3 selected') return `count "${count}"`;
      // Ctrl+click must not fold the folder.
      if (!(await row(page, 'dir/x.txt').isVisible())) return 'Ctrl+click folded the folder';
      const sel = (await selectedPaths(page)).sort().join(',');
      if (sel !== 'a.txt,b.txt,dir') return `selected ${sel}`;

      await page.getByTestId('python-selection-delete').click();
      const dialog = page.getByTestId('python-delete-many-dialog');
      await dialog.waitFor({ state: 'visible', timeout: 5000 });
      const summary = (await page.getByTestId('python-delete-many-summary').textContent()) || '';
      if (!summary.includes('2 files and 1 folder')) return `summary "${summary}"`;
      const names = (await page.getByTestId('python-delete-many-names').textContent()) || '';
      if (!names.includes('a.txt') || !names.includes('dir')) return `names "${names}"`;
      if (!(await dialog.textContent()).includes('3 more items')) return 'no note on the items inside the folder';
      await page.getByTestId('python-delete-many-confirm').click();
      await dialog.waitFor({ state: 'hidden', timeout: DIALOG_HIDDEN_MS });
      await row(page, 'a.txt').waitFor({ state: 'detached', timeout: 5000 });

      const left = (await treePaths(page)).sort().join(',');
      if (left !== 'keep.txt,main.py') return `tree after delete: ${left}`;
      const tabs = await tabPaths(page);
      if (tabs.includes('a.txt') || tabs.includes('b.txt')) return `tabs still open: ${tabs.join(',')}`;
      if (await page.getByTestId('python-selection-bar').count()) return 'selection bar still shown';

      await runMain(
        page,
        'import os\nprint("LS=" + "|".join(sorted(os.listdir("."))))\n',
        'LS=keep.txt|main.py',
        waitTerminalContains,
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitIsolatedMain(page, 15000);
      await waitMonacoAndPyodideReady(page, 20000);
      await row(page, 'keep.txt').waitFor({ state: 'visible', timeout: 8000 });
      const afterReload = (await treePaths(page)).sort().join(',');
      if (afterReload !== 'keep.txt,main.py') return `after reload: ${afterReload}`;
      return true;
    }, '', 90000);

    await record(browserName, 'U2 Files: Shift+click range, Space, Ctrl+A, Esc, selection ZIP', async () => {
      await runMain(
        page,
        'for i in range(1, 5):\n    open(f"r{i}.txt", "w").write(str(i))\nprint("RANGE_OK")\n',
        'RANGE_OK',
        waitTerminalContains,
      );
      await row(page, 'r4.txt').waitFor({ state: 'visible', timeout: 8000 });
      await rowButton(page, 'r1.txt').click();
      await rowButton(page, 'r3.txt').click({ modifiers: ['Shift'] });
      let sel = (await selectedPaths(page)).join(',');
      if (sel !== 'r1.txt,r2.txt,r3.txt') return `Shift range: ${sel}`;
      if ((await tabPaths(page)).includes('r3.txt')) return 'Shift+click opened the file';

      // The selection ZIP holds the selection only.
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        page.getByTestId('python-selection-zip').click(),
      ]);
      if (download.suggestedFilename() !== 'python-selection.zip') return `zip name ${download.suggestedFilename()}`;
      const zip = readFileSync(await download.path()).toString('latin1');
      if (!zip.includes('r1.txt') || !zip.includes('r3.txt') || zip.includes('r4.txt') || zip.includes('keep.txt')) {
        return 'selection ZIP content is not the selection';
      }

      await rowButton(page, 'r2.txt').focus();
      await page.keyboard.press('Escape');
      if ((await selectedPaths(page)).length !== 0) return 'Esc did not clear';
      if (await page.getByTestId('python-selection-bar').count()) return 'bar shown after Esc';

      await rowButton(page, 'r4.txt').focus();
      await page.keyboard.press('Space');
      sel = (await selectedPaths(page)).join(',');
      if (sel !== 'r4.txt') return `Space: ${sel}`;
      if ((await tabPaths(page)).includes('r4.txt')) return 'Space opened the file';
      await rowButton(page, 'r4.txt').focus();
      await page.keyboard.press('Space');
      if ((await selectedPaths(page)).length !== 0) return 'second Space did not unselect';

      await rowButton(page, 'r2.txt').focus();
      await page.keyboard.press('ControlOrMeta+a');
      const all = await selectedPaths(page);
      const visible = await treePaths(page);
      if (all.length !== visible.length) return `Ctrl+A selected ${all.length} of ${visible.length}`;
      await page.keyboard.press('Escape');
      if ((await selectedPaths(page)).length !== 0) return 'Esc after Ctrl+A did not clear';
      return true;
    }, '', 60000);

    await record(browserName, 'U2 Files: Select mode and selection labels in EN and NB', async () => {
      const selectBtn = page.getByTestId('python-select-mode-btn');
      const resetBtn = page.getByTestId('python-reset-btn');
      if ((await selectBtn.textContent())?.trim() !== 'Select') return `EN select "${await selectBtn.textContent()}"`;
      if ((await resetBtn.textContent())?.trim() !== 'Reset workspace…') return `EN reset "${await resetBtn.textContent()}"`;
      await selectBtn.click();
      if ((await selectBtn.getAttribute('aria-pressed')) !== 'true') return 'Select not pressed';
      if ((await page.locator('[data-testid^="python-tree-check-"]').count()) !== (await treePaths(page)).length) return 'not every row has a check box';
      await page.getByTestId('python-tree-check-r1.txt').check();
      const langBtn = page.locator('header button', { hasText: 'EN' }).filter({ hasText: 'NB' }).first();
      await langBtn.click();
      try {
        await page.waitForFunction(() => document.querySelector('[data-testid="python-select-mode-btn"]')?.textContent?.trim() === 'Velg', null, { timeout: 3000 });
        const nbCount = (await page.getByTestId('python-selection-count').textContent())?.trim();
        if (nbCount !== '1 valgt') return `NB count "${nbCount}"`;
        if ((await page.getByTestId('python-selection-clear').textContent())?.trim() !== 'Fjern valget') return 'NB clear label';
        if ((await resetBtn.textContent())?.trim() !== 'Tilbakestill arbeidsområdet …') return `NB reset "${await resetBtn.textContent()}"`;
        const aria = await page.getByTestId('python-tree-check-r1.txt').getAttribute('aria-label');
        if (aria !== 'Velg r1.txt') return `NB check label "${aria}"`;
      } finally {
        await langBtn.click();
        await page.waitForTimeout(150);
      }
      await page.getByTestId('python-selection-clear').click();
      if ((await selectBtn.getAttribute('aria-pressed')) !== 'false') return 'Clear selection left Select mode on';
      if (await page.locator('[data-testid^="python-tree-check-"]').count()) return 'check boxes left after Clear selection';
      return true;
    });

    await record(browserName, 'U2 Files: Reset off during a run, tick-box, Cancel, Reset keeps packages and settings', async () => {
      // A bundled package loaded by a run, to see that Reset leaves packages alone.
      await runMain(page, 'import six\nprint("SIX_OK", six.__name__)\n', 'SIX_OK', waitTerminalContains);

      await page.getByTestId('python-console-clear').click();
      await page.getByTestId('python-tab-main.py').click();
      await setModelText(page, 'main.py', 'import time\nprint("LOOPING")\nwhile True:\n    time.sleep(0.05)\n');
      await page.getByTestId('python-run-btn').click();
      await waitTerminalContains(page, 'python-console-xterm', 'LOOPING', 15000);
      const resetBtn = page.getByTestId('python-reset-btn');
      if (!(await resetBtn.isDisabled())) return 'Reset enabled during a run';
      const reason = (await page.getByTestId('python-reset-reason').textContent()) || '';
      if (!reason.includes('program runs')) return `reason "${reason}"`;
      await page.getByTestId('python-stop-btn').click();
      await waitRunIdle(page);
      if (await resetBtn.isDisabled()) return 'Reset still off after Stop';

      const settingsBefore = await pythonStorageKeys(page);
      const before = (await treePaths(page)).sort().join(',');

      await resetBtn.click();
      const dialog = page.getByTestId('python-reset-dialog');
      await dialog.waitFor({ state: 'visible', timeout: 5000 });
      const confirm = page.getByTestId('python-reset-confirm');
      if (!(await confirm.isDisabled())) return 'Reset enabled before the tick-box';
      const deletes = (await page.getByTestId('python-reset-deletes').textContent()) || '';
      if (!/6 files/.test(deletes)) return `deletes "${deletes}"`;
      if (!/packages/.test((await page.getByTestId('python-reset-keeps').textContent()) || '')) return 'keeps text';
      await page.getByTestId('python-reset-check').check();
      if (await confirm.isDisabled()) return 'Reset off after the tick-box';
      await page.getByTestId('python-reset-cancel').click();
      await dialog.waitFor({ state: 'hidden', timeout: DIALOG_HIDDEN_MS });
      if ((await treePaths(page)).sort().join(',') !== before) return 'Cancel changed the files';

      // Reopened, the tick-box starts unticked again; Download ZIP first works.
      await resetBtn.click();
      await dialog.waitFor({ state: 'visible', timeout: 5000 });
      if (await page.getByTestId('python-reset-check').isChecked()) return 'tick-box kept from last time';
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        page.getByTestId('python-reset-zip').click(),
      ]);
      if (download.suggestedFilename() !== 'python-workspace.zip') return `zip ${download.suggestedFilename()}`;
      await page.getByTestId('python-reset-check').check();
      await confirm.click();
      await dialog.waitFor({ state: 'hidden', timeout: DIALOG_HIDDEN_MS });
      await page.waitForFunction(
        () => document.querySelectorAll('[data-testid="python-file-tree"] [data-path]').length === 1,
        null,
        { timeout: 8000 },
      );
      const after = (await treePaths(page)).join(',');
      if (after !== 'main.py') return `tree after Reset: ${after}`;
      const tabs = await tabPaths(page);
      if (tabs.join(',') !== 'main.py') return `tabs after Reset: ${tabs.join(',')}`;
      const text = await page.evaluate(
        () => (window.monaco?.editor?.getModels?.() || []).find((m) => m.uri.path.endsWith('/workspace/main.py'))?.getValue() ?? '',
      );
      if (!text.includes('running locally in your browser') || text.includes('time.sleep')) return 'main.py is not the default program';
      if ((await pythonStorageKeys(page)) !== settingsBefore) return 'settings in localStorage changed';

      await runMain(page, 'import os\nprint("LS=" + "|".join(sorted(os.listdir("."))))\n', 'LS=main.py', waitTerminalContains);

      const tabsList = page.locator('header [role="tablist"]');
      await tabsList.getByRole('tab', { name: 'Packages' }).click();
      await page.getByTestId('python-pkg-row-six').waitFor({ state: 'visible', timeout: 8000 });
      await tabsList.getByRole('tab', { name: 'Workbench' }).click();
      return true;
    }, '', 90000);

    const errs = errTracker.getErrors();
    if (errs.length > 0) await record(browserName, 'U2 Files: zero console/page errors', async () => errs.join(' | '));
  } finally {
    errTracker.detach();
    await ctx.close();
  }

  // ---------------------------------------------------------------- Phone 375x812 (touch)
  const phoneCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
  const phone = await phoneCtx.newPage();
  const phoneErrs = attachErrorTracker(phone, { allowCspProbe: true });
  try {
    await record(browserName, 'U2 Files: phone 375x812 Select mode deletes two files, 0 overflow', async () => {
      await phone.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
      await ackW1(phone, waitIsolatedMain);
      await waitMonacoAndPyodideReady(phone, 20000);
      await setModelText(phone, 'main.py', 'for n in ["p1", "p2", "p3"]:\n    open(n + ".txt", "w").write(n)\nprint("PHONE_SEEDED")\n');
      await phone.getByTestId('python-run-btn').click();
      await waitTerminalContains(phone, 'python-console-xterm', 'PHONE_SEEDED', 15000);
      await waitRunIdle(phone);

      const panes = phone.locator('[aria-label="Switch between editor and output panes"]');
      await panes.getByRole('tab', { name: 'Files' }).click();
      await phone.getByTestId('python-files-panel').waitFor({ state: 'visible', timeout: 5000 });
      await row(phone, 'p3.txt').waitFor({ state: 'visible', timeout: 8000 });

      await phone.getByTestId('python-select-mode-btn').tap();
      await phone.getByTestId('python-selection-bar').waitFor({ state: 'visible', timeout: 3000 });
      await phone.getByTestId('python-tree-check-p1.txt').tap();
      await phone.getByTestId('python-tree-check-p2.txt').tap();
      const count = (await phone.getByTestId('python-selection-count').textContent())?.trim();
      if (count !== '2 selected') return `count "${count}"`;
      if (!(await noOverflow(phone))) return `overflow in Select mode: ${await phone.evaluate(() => `${document.documentElement.scrollWidth} > ${window.innerWidth}`)}`;
      const box = await phone.getByTestId('python-tree-check-p1.txt').evaluate((el) => {
        const r = el.parentElement.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
      if (box.w < 30 || box.h < 30) return `check box tap target ${box.w}x${box.h}`;

      await phone.getByTestId('python-selection-delete').tap();
      const dialog = phone.getByTestId('python-delete-many-dialog');
      await dialog.waitFor({ state: 'visible', timeout: 5000 });
      if (!(await noOverflow(phone))) return 'overflow with the dialog open';
      await phone.getByTestId('python-delete-many-confirm').tap();
      await dialog.waitFor({ state: 'hidden', timeout: DIALOG_HIDDEN_MS });
      await row(phone, 'p1.txt').waitFor({ state: 'detached', timeout: 5000 });
      const left = (await treePaths(phone)).sort().join(',');
      if (left !== 'main.py,p3.txt') return `left ${left}`;
      if (!(await noOverflow(phone))) return 'overflow after delete';
      const errs = phoneErrs.getErrors();
      return errs.length === 0 ? true : `errors: ${errs.join(' | ')}`;
    }, '', 90000);
  } finally {
    phoneErrs.detach();
    await phoneCtx.close();
  }
}
