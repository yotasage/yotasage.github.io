// F2 UI checks of Stop in the REPL, called by ui.mjs (PYTHON_UI_ONLY=repl runs only them): a line typed in the
// REPL terminal (while True: pass) makes the toolbar show Stop and disable Run, with the status pill saying a
// REPL line runs; the toolbar's Stop ends it with KeyboardInterrupt and a new prompt, and the namespace is kept;
// Ctrl+C in the REPL terminal stops a running line (time.sleep(100)) too; Ctrl+C at a "... " prompt drops the
// unfinished statement with KeyboardInterrupt, as Python's REPL does; and no page error appears.

async function ackW1(page, waitIsolatedMain) {
  await waitIsolatedMain(page, 20000);
  const w1 = page.getByTestId('python-w1-dialog');
  await w1.waitFor({ state: 'visible', timeout: 8000 });
  await page.getByTestId('python-w1-ack').click();
  await w1.waitFor({ state: 'hidden', timeout: 5000 });
}

async function replText(page) {
  return page.evaluate(() => {
    const rows = document.querySelector('[data-testid="python-repl-xterm"] .xterm-rows');
    return rows ? rows.innerText || rows.textContent || '' : '';
  });
}

async function waitReplText(page, test, what, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let txt = '';
  while (Date.now() < deadline) {
    txt = await replText(page);
    if (test(txt)) return txt;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`REPL never showed ${what}. Got:\n${txt.slice(-600)}`);
}

/** Lines of the REPL with the xterm row padding removed (non-breaking spaces from the DOM renderer included). */
function lines(txt) {
  return txt.split('\n').map((l) => l.replace(/[\s ]+$/, ''));
}

/**
 * Clears the REPL, focuses its terminal and types each line followed by Enter, waiting for the next prompt
 * between lines (the terminal takes no input while a line is being run).
 */
async function typeLines(page, typed, { clear = true } = {}) {
  if (clear) await page.getByTestId('python-repl-clear').click();
  await page.getByTestId('python-repl-xterm').click();
  for (const [i, l] of typed.entries()) {
    const prompts = lines(await replText(page)).filter((x) => x === '>>>' || x === '...').length;
    if (l) await page.keyboard.type(l);
    await page.keyboard.press('Enter');
    if (i < typed.length - 1) {
      // Typing fills the bare prompt line, so the next prompt brings the count back (or one up after an empty line).
      const want = prompts + (l ? 0 : 1);
      await waitReplText(page, (t) => lines(t).filter((x) => x === '>>>' || x === '...').length >= want, 'the next prompt', 5000);
    }
  }
}

async function toolbarBusy(page) {
  return page.evaluate(() => ({
    stop: Boolean(document.querySelector('[data-testid="python-stop-btn"]')),
    runDisabled: Boolean(document.querySelector('[data-testid="python-run-btn"]')?.disabled),
    status: document.querySelector('[data-testid="python-status-pill"]')?.textContent?.trim() || '',
  }));
}

async function waitIdle(page, timeoutMs = 8000) {
  await page.waitForFunction(
    () => {
      const run = document.querySelector('[data-testid="python-run-btn"]');
      return Boolean(run) && !run.disabled && !document.querySelector('[data-testid="python-stop-btn"]');
    },
    { timeout: timeoutMs },
  );
}

/** The last non-empty REPL line is an empty ">>>" prompt and KeyboardInterrupt is on the line before it. */
function interruptedThenPrompt(txt) {
  const ls = lines(txt).filter((l) => l.length > 0);
  return ls.length >= 2 && ls[ls.length - 1] === '>>>' && ls[ls.length - 2] === 'KeyboardInterrupt';
}

export async function runReplUiSuite(browserName, browser, baseUrl, { record, waitIsolatedMain, waitMonacoAndPyodideReady, attachErrorTracker }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errTracker = attachErrorTracker(page, { allowCspProbe: true });
  try {
    await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
    await ackW1(page, waitIsolatedMain);
    await waitMonacoAndPyodideReady(page, 20000);
    await page.getByTestId('python-program-output-frame').getByRole('tab', { name: 'REPL' }).click();
    await page.getByTestId('python-repl-xterm').waitFor({ state: 'visible', timeout: 5000 });

    await record(browserName, 'F2 REPL: while True: pass shows Stop, disables Run; Stop gives KeyboardInterrupt and a prompt', async () => {
      await typeLines(page, ['kept_value = 41']);
      await waitReplText(page, (t) => {
        const ls = lines(t).filter((l) => l.length > 0);
        return ls.length >= 2 && ls[ls.length - 2] === '>>> kept_value = 41' && ls[ls.length - 1] === '>>>';
      }, 'a prompt after kept_value');
      await typeLines(page, ['while True: pass', '']);
      await page.getByTestId('python-stop-btn').waitFor({ state: 'visible', timeout: 5000 });
      await new Promise((r) => setTimeout(r, 300));
      const busy = await toolbarBusy(page);
      if (!busy.stop || !busy.runDisabled) return `while running: ${JSON.stringify(busy)}`;
      if (busy.status !== 'Running REPL line') return `status pill "${busy.status}"`;
      const before = await replText(page);
      if (before.includes('KeyboardInterrupt')) return 'KeyboardInterrupt before Stop';
      const t0 = Date.now();
      await page.getByTestId('python-stop-btn').click();
      await waitReplText(page, interruptedThenPrompt, 'KeyboardInterrupt and a new prompt', 5000);
      await waitIdle(page);
      const ms = Date.now() - t0;
      const after = await replText(page);
      if (after.includes('Traceback') || after.includes('RuntimeError')) return `REPL shows ${JSON.stringify(after.slice(-300))}`;
      if (lines(after).filter((l) => l === 'KeyboardInterrupt').length !== 1) return `KeyboardInterrupt count in ${JSON.stringify(after)}`;
      if (ms > 1400) return `Stop took ${ms} ms (Force Stop escalation?)`;
      await typeLines(page, ['kept_value + 1'], { clear: false });
      await waitReplText(page, (t) => lines(t).includes('42'), '42 (the namespace was lost)');
      return { ok: true, note: `${ms} ms` };
    });

    await record(browserName, 'F2 REPL: Ctrl+C in the REPL terminal stops a running time.sleep(100)', async () => {
      await typeLines(page, ['import time; time.sleep(100)']);
      await page.getByTestId('python-stop-btn').waitFor({ state: 'visible', timeout: 5000 });
      await new Promise((r) => setTimeout(r, 300));
      await page.getByTestId('python-repl-xterm').click();
      const t0 = Date.now();
      await page.keyboard.press('Control+c');
      await waitReplText(page, interruptedThenPrompt, 'KeyboardInterrupt and a new prompt', 5000);
      await waitIdle(page);
      const ms = Date.now() - t0;
      if (ms > 1400) return `Ctrl+C took ${ms} ms (Force Stop escalation?)`;
      await typeLines(page, ['1 + 1'], { clear: false });
      await waitReplText(page, (t) => lines(t).includes('2'), '2 after the interrupted line');
      return { ok: true, note: `${ms} ms` };
    });

    await record(browserName, 'F2 REPL: Ctrl+C at a "..." prompt drops the unfinished statement (KeyboardInterrupt)', async () => {
      await typeLines(page, ['def unfinished():']);
      await waitReplText(page, (t) => lines(t).some((l) => l === '...'), 'the "..." prompt');
      await page.keyboard.type('    return 1');
      await page.keyboard.press('Control+c');
      await waitReplText(page, interruptedThenPrompt, 'KeyboardInterrupt and a new prompt', 3000);
      const busy = await toolbarBusy(page);
      if (busy.stop) return 'Ctrl+C at the prompt started a Stop';
      // Python would still be inside the def without the reset; 3 shows the line ran on its own.
      await typeLines(page, ['1 + 2'], { clear: false });
      await waitReplText(page, (t) => lines(t).includes('3'), '3 (the statement was not dropped)');
      await typeLines(page, ["'unfinished' in globals()"], { clear: false });
      await waitReplText(page, (t) => lines(t).includes('False'), 'False for the dropped def');
      return true;
    });

    await record(browserName, 'F2 REPL: no page errors', async () => {
      const errs = errTracker.getErrors();
      return errs.length === 0 ? true : `errors: ${errs.slice(0, 3).join(' | ')}`;
    });
  } finally {
    errTracker.detach();
    await ctx.close();
  }
}
