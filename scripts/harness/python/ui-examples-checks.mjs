// E1b 3-browser UI checks for the Examples tab of /python/main (components/Python/ExamplesGallery.tsx).
// Imported by scripts/harness/python/ui.mjs. Verifies the Workbench | Examples header tabs (ARIA, EN/NB),
// one card per built-in example, that "Load in workbench" copies and opens without running, Run after
// loading, the network probe in Off mode with external requests routed and counted, that the workbench
// is not remounted by tab switches, the phone layout, and one Light and one Dark screenshot
// (saved under .local/harness/python/, git-ignored, or PYTHON_SHOTS_DIR).
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const shotsDir = process.env.PYTHON_SHOTS_DIR || join(repoRoot, '.local', 'harness', 'python');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const PROBE_CSP_REFUSAL = /Refused to connect to https:\/\/(pypi\.org|api\.github\.com|jsonplaceholder\.typicode\.com)\/.*Content Security Policy/;

function isExternal(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ws:' || u.protocol === 'wss:')
      && !LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Example ids in PYTHON_EXAMPLES order, read from the sources (the harness runs plain Node, not TS). */
function readExampleIds() {
  const dir = join(repoRoot, 'lib', 'python', 'examples');
  const index = readFileSync(join(dir, 'index.ts'), 'utf8');
  const list = index.match(/PYTHON_EXAMPLES:[^=]*=\s*\[([\s\S]*?)\];/);
  if (!list) throw new Error('PYTHON_EXAMPLES not found in lib/python/examples/index.ts');
  const constNames = list[1].split(',').map((s) => s.trim()).filter(Boolean);
  const idByConst = new Map();
  for (const file of ['basics.ts', 'science.ts', 'display.ts', 'files.ts', 'network.ts', 'packages.ts']) {
    const src = readFileSync(join(dir, file), 'utf8');
    for (const m of src.matchAll(/export const (\w+): PythonExample = \{\s*id: '([^']+)'/g)) {
      idByConst.set(m[1], m[2]);
    }
  }
  return constNames.map((name) => {
    const id = idByConst.get(name);
    if (!id) throw new Error(`id of ${name} not found in lib/python/examples/*.ts`);
    return id;
  });
}

async function terminalText(page, testId = 'python-console-xterm') {
  return page.evaluate((id) => {
    const rows = document.querySelector(`[data-testid="${id}"] .xterm-rows`);
    if (!rows) return '';
    return Array.from(rows.children).map((r) => r.textContent || '').join('\n');
  }, testId);
}

async function waitTextMatches(page, patterns, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let txt = '';
  while (Date.now() < deadline) {
    txt = await terminalText(page);
    if (patterns.every((p) => (typeof p === 'string' ? txt.includes(p) : p.test(txt)))) return txt;
    await new Promise((r) => setTimeout(r, 150));
  }
  const missing = patterns.filter((p) => !(typeof p === 'string' ? txt.includes(p) : p.test(txt)));
  throw new Error(`console is missing ${missing.map(String).join(', ')}; got:\n${txt.slice(-700)}`);
}

async function activeEditorInfo(page) {
  return page.evaluate(() => {
    const ed = window.monaco?.editor?.getEditors?.()[0];
    const model = ed?.getModel?.();
    return { path: model ? model.uri.path : '', text: model ? model.getValue() : '' };
  });
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

async function headerTabsState(page) {
  return page.evaluate(() => {
    const list = document.querySelector('header [role="tablist"]');
    const tabs = list ? Array.from(list.querySelectorAll('[role="tab"]')) : [];
    return tabs.map((tab) => {
      const panelId = tab.getAttribute('aria-controls') || '';
      const panel = panelId ? document.getElementById(panelId) : null;
      return {
        id: tab.id,
        label: (tab.textContent || '').trim(),
        selected: tab.getAttribute('aria-selected'),
        panelRole: panel ? panel.getAttribute('role') : null,
        panelLabelledBy: panel ? panel.getAttribute('aria-labelledby') : null,
        panelHidden: panel ? panel.hidden : null,
      };
    });
  });
}

/** Ids of the example cards rendered (the gallery renders only the cards that match the filters). */
async function shownIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="python-example-card-"]'))
      .filter((c) => c.getClientRects().length > 0)
      .map((c) => c.getAttribute('data-testid').replace('python-example-card-', '')),
  );
}

async function countText(page) {
  return ((await page.getByTestId('python-examples-count').textContent()) || '').trim();
}

async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function acknowledgeW1(page, waitIsolatedMain) {
  await waitIsolatedMain(page, 20000);
  const w1 = page.getByTestId('python-w1-dialog');
  await w1.waitFor({ state: 'visible', timeout: 8000 });
  await page.getByTestId('python-w1-ack').click();
  await w1.waitFor({ state: 'hidden', timeout: 5000 });
}

export async function runExamplesUiSuite(
  browserName,
  browser,
  baseUrl,
  { record, waitIsolatedMain, waitMonacoAndPyodideReady, attachErrorTracker },
) {
  const exampleIds = readExampleIds();
  const headerTab = (page, name) => page.locator('header [role="tablist"]').getByRole('tab', { name });

  // ---------------------------------------------------------------- Desktop 1280x800
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const routed = [];
    await ctx.route((url) => isExternal(url.href), async (route) => {
      routed.push(route.request().url());
      await route.abort();
    });
    const page = await ctx.newPage();
    const errTracker = attachErrorTracker(page, { allowCspProbe: true });

    try {
      await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
      await acknowledgeW1(page, waitIsolatedMain);
      await waitMonacoAndPyodideReady(page, 20000);

      await record(browserName, 'E1b Examples: header tabs ARIA (tablist/tab/tabpanel) & EN/NB labels', async () => {
        const s0 = await headerTabsState(page);
        if (s0.length !== 3) return `expected 3 header tabs, got ${JSON.stringify(s0)}`;
        const [wb, ex] = s0;
        if (wb.label !== 'Workbench' || ex.label !== 'Examples' || !s0[2].label.startsWith('Packages')) {
          return `EN labels: ${s0.map((x) => x.label).join(' | ')}`;
        }
        if (wb.selected !== 'true' || ex.selected !== 'false') return `initial aria-selected: ${JSON.stringify(s0)}`;
        for (const tab of s0) {
          if (!tab.id || tab.panelRole !== 'tabpanel' || tab.panelLabelledBy !== tab.id) {
            return `tab/panel wiring: ${JSON.stringify(tab)}`;
          }
        }
        if (wb.panelHidden !== false || ex.panelHidden !== true) return `initial panels: ${JSON.stringify(s0)}`;

        await headerTab(page, 'Examples').click();
        await page.getByTestId('python-examples-gallery').waitFor({ state: 'visible', timeout: 5000 });
        const s1 = await headerTabsState(page);
        if (s1[0].selected !== 'false' || s1[1].selected !== 'true' || s1[0].panelHidden !== true || s1[1].panelHidden !== false) {
          return `after switching to Examples: ${JSON.stringify(s1)}`;
        }
        if (!(await page.evaluate(() => window.location.search === '' && window.location.pathname.startsWith('/python/main')))) {
          return `tab change altered the URL: ${page.url()}`;
        }

        const langBtn = page.locator('header button', { hasText: 'EN' }).filter({ hasText: 'NB' }).first();
        await langBtn.click();
        await page.waitForTimeout(150);
        const nb = await headerTabsState(page);
        const nbLoad = (await page.getByTestId(`python-example-load-${exampleIds[0]}`).textContent())?.trim();
        await langBtn.click();
        await page.waitForTimeout(150);
        if (nb[0]?.label !== 'Arbeidsbenk' || nb[1]?.label !== 'Eksempler') return `NB labels: ${nb.map((x) => x.label).join(' | ')}`;
        if (nbLoad !== 'Last inn på arbeidsbenken') return `NB load button: ${nbLoad}`;
        const en = await headerTabsState(page);
        if (en[0].label !== 'Workbench') return `back to EN failed: ${en[0].label}`;
        return true;
      });

      await record(browserName, 'E1b Examples: one card per example with tag, title, description & Load', async () => {
        const cards = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-testid^="python-example-card-"]')).map((card) => {
            const id = card.getAttribute('data-testid').replace('python-example-card-', '');
            const q = (part) => card.querySelector(`[data-testid="python-example-${part}-${id}"]`);
            const btn = q('load');
            return {
              id,
              tag: (q('tag')?.textContent || '').trim(),
              title: (q('title')?.textContent || '').trim(),
              desc: (q('desc')?.textContent || '').trim(),
              button: btn ? { text: (btn.textContent || '').trim(), disabled: btn.disabled } : null,
              files: card.textContent || '',
            };
          }),
        );
        const ids = cards.map((c) => c.id).join(',');
        if (ids !== exampleIds.join(',')) return `cards ${ids} != examples ${exampleIds.join(',')}`;
        for (const c of cards) {
          if (!c.tag || !c.title || !c.desc) return `card ${c.id} lacks tag/title/description`;
          if (!c.button || c.button.text !== 'Load in workbench' || c.button.disabled) return `card ${c.id} button ${JSON.stringify(c.button)}`;
          if (!c.files.includes(`${c.id}/`)) return `card ${c.id} does not list its files`;
        }
        const modules = cards.find((c) => c.id === 'modules');
        if (!modules.files.includes('modules/main.py, modules/helpers.py')) return 'modules card file list';
        return { ok: true, note: `${cards.length} cards` };
      });

      await record(browserName, 'U1 Examples: search by title, file name, accents, tag chip + text, empty state, NB', async () => {
        const total = exampleIds.length;
        const search = page.getByTestId('python-examples-search');
        const info = await page.evaluate(() => {
          const input = document.querySelector('[data-testid="python-examples-search"]');
          const label = input && document.querySelector(`label[for="${input.id}"]`);
          const count = document.querySelector('[data-testid="python-examples-count"]');
          return { type: input?.type, label: label?.textContent?.trim(), live: count?.getAttribute('aria-live') };
        });
        if (info.type !== 'search' || info.label !== 'Search examples' || info.live !== 'polite') return `search box ${JSON.stringify(info)}`;
        if ((await countText(page)) !== `All ${total} examples are shown.`) return `count: ${await countText(page)}`;
        const expect = async (query, want, what) => {
          await search.fill(query);
          await page.waitForTimeout(60);
          const got = (await shownIds(page)).join(',');
          return got === want.join(',') ? null : `${what} "${query}": ${got} != ${want.join(',')}`;
        };
        let err = await expect('bouncing', ['bouncing_ball'], 'title word');
        if (err) return err;
        if ((await countText(page)) !== `1 of ${total} examples match.`) return `count: ${await countText(page)}`;
        err = (await expect('helpers.py', ['modules'], 'file name')) || (await expect('BOUNCÍNG', ['bouncing_ball'], 'case/accent'));
        if (err) return err;
        err = await expect('', exampleIds, 'empty query');
        if (err) return err;
        await page.getByTestId('python-examples-chip-display').click();
        if ((await page.getByTestId('python-examples-chip-display').getAttribute('aria-pressed')) !== 'true') return 'display chip not pressed';
        err = await expect('numpy', ['numpy_fractal', 'fps_loop'], 'Display chip + text');
        if (err) return err;
        err = await expect('zzqx', [], 'no match');
        if (err) return err;
        if (!(await page.getByTestId('python-examples-empty').isVisible())) return 'empty state not shown';
        if ((await countText(page)) !== `0 of ${total} examples match.`) return `count: ${await countText(page)}`;
        await page.getByTestId('python-examples-clear').click();
        if ((await search.inputValue()) !== '') return 'Clear left the query';
        if ((await page.getByTestId('python-examples-chip-all').getAttribute('aria-pressed')) !== 'true') return 'Clear left a tag chip on';
        if ((await shownIds(page)).length !== total) return 'Clear did not show every card';

        const langBtn = page.locator('header button', { hasText: 'EN' }).filter({ hasText: 'NB' }).first();
        await langBtn.click();
        await page.waitForTimeout(150);
        try {
          err = (await expect('sprettende', ['bouncing_ball'], 'NB title'))
            || (await expect('forhandsvisning', ['html_preview'], 'NB accent-free'))
            || (await expect('skjerm', ['bouncing_ball', 'paint', 'numpy_fractal', 'fps_loop'], 'NB tag label'));
          if (err) return err;
          if ((await countText(page)) !== `4 av ${total} eksempler passer.`) return `NB count: ${await countText(page)}`;
          const nbLabel = (await page.getByTestId('python-examples-chip-all').textContent())?.trim();
          if (nbLabel !== 'Alle') return `NB All chip: ${nbLabel}`;
        } finally {
          await search.fill('');
          await langBtn.click();
          await page.waitForTimeout(150);
        }
        if (!(await page.evaluate(() => window.location.search === '' && window.location.hash === ''))) return `URL changed: ${page.url()}`;
        return true;
      });

      await record(browserName, 'U3 Examples: package pills on cards, searchable by package name, pill click searches', async () => {
        const pills = (id) =>
          page.evaluate((cardId) => {
            const ul = document.querySelector(`[data-testid="python-example-packages-${cardId}"]`);
            const card = document.querySelector(`[data-testid="python-example-card-${cardId}"]`);
            return {
              hasList: Boolean(ul),
              aria: ul?.getAttribute('aria-label') ?? null,
              names: ul ? Array.from(ul.querySelectorAll('li')).map((li) => li.textContent?.trim()) : [],
              mono: ul ? /mono|consolas|courier|menlo/i.test(getComputedStyle(ul.querySelector('button')).fontFamily) : false,
              below: ul && card ? ul.getBoundingClientRect().top > card.querySelector('h3').getBoundingClientRect().bottom : false,
            };
          }, id);
        const mpl = await pills('matplotlib_plot');
        if (!mpl.hasList || mpl.aria !== 'Packages used' || mpl.names.join(',') !== 'matplotlib,numpy' || !mpl.mono || !mpl.below) {
          return `matplotlib card pills ${JSON.stringify(mpl)}`;
        }
        for (const id of ['hello', 'bouncing_ball', 'network_probe']) {
          if ((await pills(id)).hasList) return `${id} shows pills`;
        }
        const search = page.getByTestId('python-examples-search');
        const expectIds = async (query, want) => {
          await search.fill(query);
          await page.waitForTimeout(60);
          const got = (await shownIds(page)).join(',');
          return got === want.join(',') ? null : `"${query}": ${got} != ${want.join(',')}`;
        };
        const err = (await expectIds('sympy', ['science']))
          || (await expectIds('NumPy', ['science', 'matplotlib_plot', 'numpy_fractal', 'fps_loop', 'pdf_report']))
          || (await expectIds('pillow', ['pillow_image']))
          || (await expectIds('rich', ['install_package']));
        if (err) return err;
        await search.fill('');
        await page.getByTestId('python-example-package-pdf_report-matplotlib').click();
        await page.waitForTimeout(60);
        if ((await search.inputValue()) !== 'matplotlib') return `pill click set "${await search.inputValue()}"`;
        const ids = (await shownIds(page)).join(',');
        if (ids !== 'matplotlib_plot,pdf_report') return `pill click shows ${ids}`;
        await search.fill('');
        const langBtn = page.locator('header button', { hasText: 'EN' }).filter({ hasText: 'NB' }).first();
        await langBtn.click();
        await page.waitForTimeout(150);
        try {
          const nb = await pills('matplotlib_plot');
          if (nb.aria !== 'Pakker som brukes') return `NB list label: ${nb.aria}`;
        } finally {
          await langBtn.click();
          await page.waitForTimeout(150);
        }
        return { ok: true };
      });

      await record(browserName, 'E1b Examples: Load modules opens main.py without running, then Run works', async () => {
        const before = await terminalText(page);
        await page.getByTestId('python-example-load-modules').click();
        await page.getByTestId('python-editor-wrap').waitFor({ state: 'visible', timeout: 8000 });
        const tabs = await headerTabsState(page);
        if (tabs[0].selected !== 'true' || tabs[0].panelHidden !== false || tabs[1].panelHidden !== true) {
          return `Workbench not active after Load: ${JSON.stringify(tabs)}`;
        }
        await page.waitForFunction(
          () => window.monaco?.editor?.getEditors?.()[0]?.getModel?.()?.uri.path.endsWith('/workspace/modules/main.py'),
          { timeout: 8000 },
        );
        const ed = await activeEditorInfo(page);
        if (!ed.text.includes('from helpers import moving_average')) return `editor text: ${ed.text.slice(0, 120)}`;
        await page.getByTestId('python-tree-item-modules/helpers.py').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId('python-tab-modules/helpers.py').waitFor({ state: 'visible', timeout: 5000 });
        const runText = (await page.getByTestId('python-run-btn').textContent()) || '';
        if (!runText.includes('main.py')) return `Run target: ${runText}`;
        await page.waitForTimeout(1200);
        const after = await terminalText(page);
        if (after !== before || after.includes('Samples:')) return `console changed on Load (code ran?): ${after.slice(-300)}`;

        await page.getByTestId('python-run-btn').click();
        await waitTextMatches(page, ['Samples: 12.00, 14.50', 'Smoothed signal: 13.17, 14.67, 15.83, 17.33'], 20000);
        await waitRunIdle(page);
        return true;
      });

      await record(browserName, 'E1b Examples: Workbench -> Examples -> Workbench keeps editor & terminal', async () => {
        const marker = '# kept across tab switches\n';
        await page.evaluate((m) => {
          const ed = window.monaco.editor.getEditors()[0];
          window.__e1bEditor = ed;
          ed.getModel().setValue(ed.getModel().getValue() + m);
          const host = document.querySelector('[data-testid="python-console-xterm"]');
          window.__e1bXterm = host?.querySelector('.xterm') || null;
        }, marker);
        const termBefore = await terminalText(page);
        await headerTab(page, 'Examples').click();
        await page.getByTestId('python-examples-gallery').waitFor({ state: 'visible', timeout: 5000 });
        if (await page.getByTestId('python-editor-wrap').isVisible()) return 'editor still visible on the Examples tab';
        await headerTab(page, 'Workbench').click();
        await page.getByTestId('python-editor-wrap').waitFor({ state: 'visible', timeout: 5000 });
        const laidOut = await page
          .waitForFunction(() => window.monaco.editor.getEditors()[0].getLayoutInfo().width >= 100, { timeout: 3000 })
          .then(() => true, () => false);
        const kept = await page.evaluate((m) => {
          const ed = window.monaco.editor.getEditors()[0];
          const host = document.querySelector('[data-testid="python-console-xterm"]');
          return {
            sameEditor: ed === window.__e1bEditor,
            sameXterm: Boolean(window.__e1bXterm) && host?.querySelector('.xterm') === window.__e1bXterm,
            text: ed.getModel().getValue().endsWith(m),
            editorWidth: ed.getLayoutInfo().width,
          };
        }, marker);
        const termAfter = await terminalText(page);
        if (!kept.sameEditor || !kept.sameXterm || !kept.text) return `remounted or lost: ${JSON.stringify(kept)}`;
        if (!laidOut) return `editor not laid out after switching back: ${kept.editorWidth}px`;
        if (!termAfter.includes('Samples: 12.00, 14.50') || termAfter.trim() !== termBefore.trim()) {
          return `terminal history changed: ${termAfter.slice(-300)}`;
        }
        return true;
      });

      await record(browserName, 'E1b Examples: Load network_probe + Run in Off: same-origin PASS, others BLOCKED', async () => {
        routed.length = 0;
        await headerTab(page, 'Examples').click();
        await page.getByTestId('python-example-load-network_probe').click();
        await page.waitForFunction(
          () => window.monaco?.editor?.getEditors?.()[0]?.getModel?.()?.uri.path.endsWith('/workspace/network_probe/main.py'),
          { timeout: 8000 },
        );
        await page.getByTestId('python-run-btn').click();
        await waitTextMatches(page, [
          /PASS\s+this site/,
          /BLOCKED\s+package index\s+pypi\.org/,
          /BLOCKED\s+selected host\s+api\.github\.com/,
          /BLOCKED\s+other host\s+jsonplaceholder\./, // the narrow console may wrap the host name
          'Results match network mode: Off',
        ], 40000);
        await waitRunIdle(page);
        if (routed.length > 0) return `external requests reached the network layer: ${routed.join(', ')}`;
        return true;
      }, browserName === 'webkit' ? 'request count from page only; WebKit routing misses worker requests, the CSP block is shown by BLOCKED' : '', 70000);

      await record(browserName, 'E1b Examples: Light & Dark screenshots of the Examples tab (1000 px)', async () => {
        mkdirSync(shotsDir, { recursive: true });
        await page.setViewportSize({ width: 1000, height: 900 });
        await headerTab(page, 'Examples').click();
        await page.getByTestId('python-examples-gallery').waitFor({ state: 'visible', timeout: 5000 });
        const saved = [];
        for (const theme of ['Light', 'Dark']) {
          await page.locator(`header button[aria-label="${theme}"]`).click();
          await page.waitForTimeout(250);
          const path = join(shotsDir, `examples-${theme.toLowerCase()}-${browserName}.png`);
          await page.screenshot({ path, fullPage: false });
          saved.push(path);
        }
        await page.locator('header button[aria-label="Light"]').click();
        await page.setViewportSize({ width: 1280, height: 800 });
        await headerTab(page, 'Workbench').click();
        if (!(await noOverflow(page))) return 'horizontal overflow at 1000 px';
        return { ok: true, note: `saved ${saved.length} in ${shotsDir}` };
      });

      await record(browserName, 'E1b Examples: no console/page errors on desktop', async () => {
        // WebKit logs the CSP's refusal of the network probe's blocked hosts: that is the block working.
        const errs = errTracker.getErrors().filter((e) => !PROBE_CSP_REFUSAL.test(e));
        return errs.length === 0 ? true : `errors: ${errs.join(' | ')}`;
      });
    } finally {
      errTracker.detach();
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- Phone 375x812
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    const errTracker = attachErrorTracker(page, { allowCspProbe: true });
    try {
      await record(browserName, 'E1b Examples: phone 375x812 one column, 0 overflow, Load -> Editor tab', async () => {
        await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
        await acknowledgeW1(page, waitIsolatedMain);
        await waitMonacoAndPyodideReady(page, 20000);

        const paneTablist = page.locator('[aria-label="Switch between editor and output panes"]');
        await paneTablist.getByRole('tab', { name: 'Files' }).click();
        await page.getByTestId('python-files-panel').waitFor({ state: 'visible', timeout: 5000 });

        await headerTab(page, 'Examples').click();
        await page.getByTestId('python-examples-gallery').waitFor({ state: 'visible', timeout: 5000 });
        if (!(await noOverflow(page))) {
          return `overflow on Examples: ${await page.evaluate(() => `${document.documentElement.scrollWidth} > ${window.innerWidth}`)}`;
        }
        const columns = await page.evaluate(() => {
          const lefts = Array.from(document.querySelectorAll('[data-testid^="python-example-card-"]')).map(
            (c) => Math.round(c.getBoundingClientRect().left),
          );
          return new Set(lefts).size;
        });
        if (columns !== 1) return `expected 1 column of cards, got ${columns}`;

        await page.getByTestId('python-example-load-hello').scrollIntoViewIfNeeded();
        await page.getByTestId('python-example-load-hello').click();
        await page.getByTestId('python-editor-wrap').waitFor({ state: 'visible', timeout: 8000 });
        const editorSelected = await paneTablist.getByRole('tab', { name: 'Editor' }).getAttribute('aria-selected');
        if (editorSelected !== 'true') return `phone Editor tab not selected (aria-selected=${editorSelected})`;
        await page.waitForFunction(
          () => window.monaco?.editor?.getEditors?.()[0]?.getModel?.()?.uri.path.endsWith('/workspace/hello/main.py'),
          { timeout: 8000 },
        );
        if (!(await noOverflow(page))) return 'overflow on the workbench after Load';
        // The sticky Run toolbar must sit below the (taller, tabbed) sticky header when scrolled.
        await page.evaluate(() => window.scrollTo(0, 400));
        await page.waitForTimeout(250);
        const sticky = await page.evaluate(() => ({
          headerBottom: Math.round(document.querySelector('header').getBoundingClientRect().bottom),
          toolbarTop: Math.round(document.querySelector('[role="toolbar"]').getBoundingClientRect().top),
        }));
        await page.evaluate(() => window.scrollTo(0, 0));
        if (sticky.toolbarTop < sticky.headerBottom - 1) return `Run toolbar hidden under the header: ${JSON.stringify(sticky)}`;
        const errs = errTracker.getErrors();
        return errs.length === 0 ? true : `errors: ${errs.join(' | ')}`;
      }, '', 70000);

      await record(browserName, 'U1 Examples: phone 375x812 search and chips, 0 overflow', async () => {
        await headerTab(page, 'Examples').click();
        await page.getByTestId('python-examples-gallery').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId('python-examples-search').fill('plot');
        await page.waitForTimeout(80);
        const ids = await shownIds(page);
        if (!ids.includes('matplotlib_plot') || ids.length >= exampleIds.length) return `phone search: ${ids.join(',')}`;
        await page.getByTestId('python-examples-chip-packages').click();
        await page.getByTestId('python-examples-search').fill('');
        await page.waitForTimeout(80);
        const pk = (await shownIds(page)).join(',');
        const overflow = await noOverflow(page);
        await page.getByTestId('python-examples-chip-all').click();
        await page.getByTestId('python-examples-search').fill('numpy');
        await page.waitForTimeout(80);
        const pillIds = await shownIds(page);
        const pillOverflow = await noOverflow(page);
        await page.getByTestId('python-examples-search').fill('');
        if (!pillIds.includes('science') || pillIds.includes('hello')) return `phone package search: ${pillIds.join(',')}`;
        if (!pillOverflow) return 'overflow with pills';
        await page.getByTestId('python-examples-chip-all').click();
        if (pk !== 'install_package') return `phone chip: ${pk}`;
        if (!overflow) return `overflow: ${await page.evaluate(() => `${document.documentElement.scrollWidth} > ${window.innerWidth}`)}`;
        return true;
      });
    } finally {
      errTracker.detach();
      await ctx.close();
    }
  }
}
