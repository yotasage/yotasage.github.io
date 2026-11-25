// P6 3-browser UI checks for the Packages tab of /python/main (components/Python/PackagesPanel.tsx,
// usePackages.ts). Imported by scripts/harness/python/ui.mjs. The real internet is never contacted:
// pure-Python wheels are built here with fflate; in Edge and Firefox pypi.org and files.pythonhosted.org
// are answered by context routes with canned PEP 691 JSON and those wheels (every other external request
// is aborted and counted). WebKit routes neither a dedicated worker's nor a service-worker-controlled
// page's requests, so there the page's fetch of the two PyPI hosts is mapped by an init script to the
// same-origin mock index of servers.mjs (/__mock-pypi/), and micropip is pointed at it by a script run
// from the workbench, as packages-checks.mjs does from the console. A package installed through the mock
// has no files.pythonhosted.org URL, so in WebKit Keep honestly reports that no saved copy could be made
// and the saved-copy restore is checked in Edge and Firefox (P5b checks the same path with a mapped fetch).
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWheel, isExternal } from './packages-checks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const shotsDir = process.env.PYTHON_SHOTS_DIR || join(repoRoot, '.local', 'harness', 'python');
const PYODIDE_VERSION = JSON.parse(readFileSync(join(repoRoot, 'node_modules', 'pyodide', 'package.json'), 'utf8')).version;
const BUNDLED = Object.keys(JSON.parse(readFileSync(join(repoRoot, 'public', 'pyodide', 'pyodide-lock.json'), 'utf8')).packages).sort();

const WH = {
  uipkg: buildWheel('uipkg', '1.2.0', { body: 'def hello():\n    return "uipkg-ok"\n' }),
  uiwheel: buildWheel('uiwheel', '0.3.0', { body: 'def hello():\n    return "uiwheel-ok"\n' }),
  native: buildWheel('nativeui', '1.0.0', { tag: 'cp311-cp311-manylinux_2_17_x86_64' }),
};
const JSON_HEADERS = { 'Content-Type': 'application/vnd.pypi.simple.v1+json', 'Access-Control-Allow-Origin': '*' };
const WHEEL_HEADERS = { 'Content-Type': 'application/octet-stream', 'Access-Control-Allow-Origin': '*' };
const PROBE_CSP_REFUSAL = /Refused to connect|Content Security Policy|Failed to load resource/;

function simpleJson(name, fileBase) {
  if (name !== 'uipkg') return null;
  const w = WH.uipkg;
  return JSON.stringify({
    meta: { 'api-version': '1.1' },
    name,
    versions: ['0.9.0', w.version],
    files: [
      // An older version with only a compiled wheel, so resolution has to pick 1.2.0.
      { filename: 'uipkg-0.9.0-cp311-cp311-manylinux_2_17_x86_64.whl', url: `${fileBase}uipkg-0.9.0-cp311-cp311-manylinux_2_17_x86_64.whl`, hashes: { sha256: '1'.repeat(64) } },
      { filename: w.fileName, url: `${fileBase}${w.fileName}`, hashes: { sha256: w.sha256 } },
    ],
  });
}

function fulfillPypi(url) {
  const u = new URL(url);
  if (u.hostname === 'pypi.org') {
    const m = /^\/simple\/([^/]+)\/$/.exec(u.pathname);
    const body = m ? simpleJson(m[1], 'https://files.pythonhosted.org/packages/aa/bb/') : null;
    return body ? { status: 200, headers: JSON_HEADERS, body } : { status: 404, headers: WHEEL_HEADERS, body: 'nf' };
  }
  if (u.hostname === 'files.pythonhosted.org' && u.pathname.endsWith(`/${WH.uipkg.fileName}`)) {
    return { status: 200, headers: WHEEL_HEADERS, body: Buffer.from(WH.uipkg.bytes) };
  }
  return null;
}

function mockPypi(origin) {
  return (pathname) => {
    let m = /^\/__mock-pypi\/simple\/([^/]+)\/$/.exec(pathname);
    if (m) {
      const body = simpleJson(m[1], `${origin}/__mock-pypi/files/`);
      return body ? { headers: JSON_HEADERS, body } : null;
    }
    m = /^\/__mock-pypi\/files\/([^/]+)$/.exec(pathname);
    return m && m[1] === WH.uipkg.fileName ? { headers: WHEEL_HEADERS, body: Buffer.from(WH.uipkg.bytes) } : null;
  };
}

async function terminalText(page, testId = 'python-console-xterm') {
  return page.evaluate((id) => {
    const rows = document.querySelector(`[data-testid="${id}"] .xterm-rows`);
    if (!rows) return '';
    return Array.from(rows.children).map((r) => r.textContent || '').join('\n');
  }, testId);
}

async function waitConsole(page, needle, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let txt = '';
  while (Date.now() < deadline) {
    txt = await terminalText(page);
    if (txt.includes(needle)) return txt;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`console is missing "${needle}"; got:\n${txt.slice(-500)}`);
}

async function waitRunIdle(page, timeoutMs = 20000) {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="python-run-btn"]');
      return Boolean(btn) && !btn.disabled && !document.querySelector('[data-testid="python-stop-btn"]');
    },
    { timeout: timeoutMs },
  );
}

async function setCode(page, code) {
  await page.evaluate((src) => window.monaco.editor.getEditors()[0].getModel().setValue(src), code);
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

/** Waits until no busy line is shown and the install button can be used again (or the panel is idle). */
async function waitPanelIdle(page, timeoutMs = 30000) {
  await page.waitForFunction(() => !document.querySelector('[data-testid="python-pkg-busy"]'), { timeout: timeoutMs });
}

async function rowInfo(page, name) {
  return page.evaluate((n) => {
    const row = document.querySelector(`[data-testid="python-pkg-row-${n}"]`);
    if (!row) return null;
    const keep = row.querySelector(`[data-testid="python-pkg-keep-${n}"]`);
    return {
      source: row.getAttribute('data-source'),
      installed: row.getAttribute('data-installed'),
      label: (row.querySelector(`[data-testid="python-pkg-source-${n}"]`)?.textContent || '').trim(),
      keep: keep ? { checked: keep.checked, disabled: keep.disabled } : null,
      text: row.textContent || '',
    };
  }, name);
}

async function waitRow(page, name, pred, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let info = null;
  while (Date.now() < deadline) {
    info = await rowInfo(page, name);
    if (pred(info)) return info;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`row ${name}: ${JSON.stringify(info)}`);
}

async function noticeText(page, testId = 'python-pkg-notice') {
  return ((await page.getByTestId(testId).textContent({ timeout: 2000 }).catch(() => '')) || '').trim();
}

async function waitNotice(page, needle, testId = 'python-pkg-notice', timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let txt = '';
  while (Date.now() < deadline) {
    txt = await noticeText(page, testId);
    if (txt.includes(needle)) return txt;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${testId} is missing "${needle}"; got: ${txt}`);
}

async function installName(page, name) {
  await page.getByTestId('python-pkg-input').fill(name);
  await page.getByTestId('python-pkg-install-btn').click();
}

async function readDownload(download) {
  const path = await download.path();
  return { name: download.suggestedFilename(), text: readFileSync(path, 'utf8') };
}

export async function runPackagesUiSuite(
  browserName,
  browser,
  baseUrl,
  { record, waitIsolatedMain, waitMonacoAndPyodideReady, attachErrorTracker, setMockPypi = null },
) {
  const pkgTab = (page) => page.locator('header [role="tablist"]').getByRole('tab', { name: /Packages|Pakker/ });
  const openPackages = async (page) => {
    await pkgTab(page).click();
    await page.getByTestId('python-packages-panel').waitFor({ state: 'visible', timeout: 5000 });
  };
  const workerRouting = browserName !== 'webkit';
  const name = (s) => `P6 Packages: ${s}`;

  // ---------------------------------------------------------------- Off mode, desktop 1280x800
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
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

      await record(browserName, name('header tab ARIA (tab/tabpanel) & EN/NB labels'), async () => {
        const tab = pkgTab(page);
        if ((await tab.textContent())?.trim() !== 'Packages') return `EN label: ${await tab.textContent()}`;
        await openPackages(page);
        const s = await page.evaluate(() => {
          const t = document.getElementById('python-ws-tab-packages');
          const p = document.getElementById('python-ws-panel-packages');
          const wb = document.getElementById('python-ws-panel-workbench');
          return {
            selected: t?.getAttribute('aria-selected'),
            controls: t?.getAttribute('aria-controls'),
            role: p?.getAttribute('role'),
            labelledBy: p?.getAttribute('aria-labelledby'),
            hidden: p?.hidden,
            workbenchHidden: wb?.hidden,
            workbenchMounted: Boolean(document.querySelector('[data-testid="python-editor-wrap"]')),
          };
        });
        if (s.selected !== 'true' || s.controls !== 'python-ws-panel-packages' || s.role !== 'tabpanel') return JSON.stringify(s);
        if (s.labelledBy !== 'python-ws-tab-packages' || s.hidden !== false || s.workbenchHidden !== true || !s.workbenchMounted) {
          return JSON.stringify(s);
        }
        const langBtn = page.locator('header button', { hasText: 'EN' }).filter({ hasText: 'NB' }).first();
        await langBtn.click();
        await page.waitForTimeout(150);
        const nbTab = (await tab.textContent())?.trim();
        const nbTitle = (await page.getByTestId('python-packages-panel').locator('h2').textContent())?.trim();
        await langBtn.click();
        await page.waitForTimeout(150);
        if (nbTab !== 'Pakker' || nbTitle !== 'Pakker') return `NB labels: ${nbTab} / ${nbTitle}`;
        return true;
      });

      await record(browserName, name('Off: mode line, bundled-only offer, bundled install listed, PyPI name refused, 0 external requests'), async () => {
        routed.length = 0;
        const mode = (await page.getByTestId('python-pkg-mode').textContent()) || '';
        if (!mode.includes('nothing is downloaded') || !mode.includes('Reload in Package index mode')) return `mode line: ${mode}`;
        const offered = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-testid="python-pkg-datalist"] option')).map((o) => o.value).sort(),
        );
        if (offered.join(',') !== BUNDLED.join(',')) return `datalist ${offered.join(',')} != bundled ${BUNDLED.join(',')}`;
        const hint = (await page.getByTestId('python-pkg-install-hint').textContent()) || '';
        if (!hint.includes('only the bundled packages') || !hint.includes('numpy')) return `hint: ${hint}`;
        await installName(page, 'six');
        const six = await waitRow(page, 'six', (r) => r && r.installed === 'true');
        if (six.source !== 'bundled' || six.label !== 'Bundled') return `six row ${JSON.stringify(six)}`;
        await installName(page, 'uipkg');
        const refused = await waitNotice(page, 'Package index mode');
        if (!refused.includes('uipkg is not bundled') || !refused.includes('network access is off')) return `refusal: ${refused}`;
        if (await page.getByTestId('python-w6-dialog').isVisible().catch(() => false)) return 'W6 shown in Off';
        if (await rowInfo(page, 'uipkg')) return 'uipkg listed in Off';
        if (routed.length) return `external requests: ${routed.join(', ')}`;
        return true;
      });

      await record(browserName, name('Off: "Reload in Package index mode" opens the Network dialog on Package index (W4 flow)'), async () => {
        await page.getByTestId('python-pkg-switch').click();
        await page.getByTestId('python-network-dialog').waitFor({ state: 'visible', timeout: 5000 });
        const checked = await page
          .waitForFunction(() => document.querySelector('input[name="python-net-mode"]:checked')?.value === 'pkg', { timeout: 3000 })
          .then(() => 'pkg', () => page.evaluate(() => document.querySelector('input[name="python-net-mode"]:checked')?.value));
        await page.keyboard.press('Escape');
        await page.getByTestId('python-network-dialog').waitFor({ state: 'hidden', timeout: 5000 });
        if (checked !== 'pkg') return `selected mode ${checked}`;
        if (!(await page.evaluate(() => window.location.search === ''))) return `URL changed: ${page.url()}`;
        return true;
      });

      await record(browserName, name('wheel upload installs and lists as Wheel; a manylinux wheel is refused with the reason'), async () => {
        await page.getByTestId('python-pkg-wheel-input').setInputFiles([
          { name: WH.native.fileName, mimeType: 'application/octet-stream', buffer: Buffer.from(WH.native.bytes) },
        ]);
        const refused = await waitNotice(page, 'cannot run here');
        if (!refused.includes(WH.native.fileName) || !refused.includes('manylinux')) return `refusal: ${refused}`;
        await page.getByTestId('python-pkg-wheel-input').setInputFiles([
          { name: WH.uiwheel.fileName, mimeType: 'application/octet-stream', buffer: Buffer.from(WH.uiwheel.bytes) },
        ]);
        const row = await waitRow(page, 'uiwheel', (r) => r && r.installed === 'true');
        if (row.source !== 'wheel' || row.label !== 'Wheel' || !row.keep || row.keep.checked || row.keep.disabled) return JSON.stringify(row);
        const n = await waitNotice(page, 'Installed uiwheel 0.3.0');
        if (!n.includes('Turn on Keep')) return `notice: ${n}`;
        await page.getByTestId('python-pkg-keep-uiwheel').click();
        await waitNotice(page, 'uiwheel is kept');
        const kept = await waitRow(page, 'uiwheel', (r) => r?.keep?.checked === true);
        return kept.keep.checked ? true : JSON.stringify(kept);
      });

      await record(browserName, name('requirements import in Off: preview lists installs and skipped lines with reasons first'), async () => {
        const req = 'six\npyparsing>=3\nuipkg==1.2.0\n-e git+https://example.com/x.git\n--index-url https://example.com/simple\npandas==0.1\n';
        await page.getByTestId('python-pkg-import-input').setInputFiles([{ name: 'requirements.txt', mimeType: 'text/plain', buffer: Buffer.from(req) }]);
        await page.getByTestId('python-pkg-preview').waitFor({ state: 'visible', timeout: 5000 });
        const prev = await page.evaluate(() => ({
          install: Array.from(document.querySelectorAll('[data-testid="python-pkg-preview-install"] li')).map((li) => li.textContent.trim()),
          skipped: Array.from(document.querySelectorAll('[data-testid="python-pkg-preview-skipped"] li')).map((li) => li.textContent.trim()),
        }));
        const has = (list, ...parts) => list.some((x) => parts.every((p) => x.includes(p)));
        if (prev.install.length !== 2 || !has(prev.install, 'six', 'bundled') || !has(prev.install, 'pyparsing', 'bundled')) {
          return `install: ${JSON.stringify(prev.install)}`;
        }
        if (prev.skipped.length !== 4) return `skipped: ${JSON.stringify(prev.skipped)}`;
        if (!has(prev.skipped, 'uipkg', 'network access is off')) return `uipkg skip: ${JSON.stringify(prev.skipped)}`;
        if (!has(prev.skipped, '-e', 'Editable installs')) return `-e skip: ${JSON.stringify(prev.skipped)}`;
        if (!has(prev.skipped, '--index-url', 'Index options are ignored')) return `index skip: ${JSON.stringify(prev.skipped)}`;
        if (!has(prev.skipped, 'pandas', 'bundled version 3.0.2')) return `pandas skip: ${JSON.stringify(prev.skipped)}`;
        if (await rowInfo(page, 'pyparsing')) return 'pyparsing installed before Install was pressed';
        await page.getByTestId('python-pkg-preview-install-btn').click();
        const row = await waitRow(page, 'pyparsing', (r) => r && r.installed === 'true');
        if (row.source !== 'bundled') return JSON.stringify(row);
        if (await page.getByTestId('python-w6-dialog').isVisible().catch(() => false)) return 'W6 shown for bundled-only import';
        return routed.length ? `external requests: ${routed.join(', ')}` : true;
      });

      await record(browserName, name('export downloads requirements.txt and the lock file'), async () => {
        await waitPanelIdle(page);
        const [d1] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByTestId('python-pkg-export-txt').click()]);
        const txt = await readDownload(d1);
        const [d2] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.getByTestId('python-pkg-export-lock').click()]);
        const lock = await readDownload(d2);
        if (txt.name !== 'requirements.txt' || !txt.text.includes(`uiwheel==0.3.0 --hash=sha256:${WH.uiwheel.sha256}`)) return `txt: ${JSON.stringify(txt)}`;
        const parsed = JSON.parse(lock.text);
        if (lock.name !== 'python-packages.lock.json' || parsed.format !== 'yotasage-python-lock/1') return `lock: ${lock.text.slice(0, 200)}`;
        if (!parsed.entries.some((e) => e.name === 'uiwheel' && e.sha256 === WH.uiwheel.sha256)) return `lock entries: ${JSON.stringify(parsed.entries)}`;
        return true;
      });

      await record(browserName, name('a run with a missing import shows a trusted notice outside the Console; Open Packages fills the box'), async () => {
        await page.locator('header [role="tablist"]').getByRole('tab', { name: 'Workbench' }).click();
        await page.getByTestId('python-editor-wrap').waitFor({ state: 'visible', timeout: 5000 });
        await setCode(page, 'import rich\nprint("never")\n');
        await page.getByTestId('python-run-btn').click();
        await page.getByTestId('python-missing-notice').waitFor({ state: 'visible', timeout: 20000 });
        await waitRunIdle(page);
        const where = await page.evaluate(() => {
          const n = document.querySelector('[data-testid="python-missing-notice"]');
          const frame = document.querySelector('[data-testid="python-program-output-frame"]');
          return {
            text: n.textContent,
            insideOutput: Boolean(n.closest('[data-testid="python-program-output-frame"]')),
            beforeOutput: Boolean(frame && n.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING),
          };
        });
        if (!where.text.includes('rich is not installed.') || where.insideOutput || !where.beforeOutput) return JSON.stringify(where);
        await page.getByTestId('python-missing-open').click();
        await page.getByTestId('python-packages-panel').waitFor({ state: 'visible', timeout: 5000 });
        const value = await page.getByTestId('python-pkg-input').inputValue();
        if (value !== 'rich') return `install box: ${value}`;
        if (await rowInfo(page, 'rich')) return 'rich was installed';
        return true;
      });

      await record(browserName, name('Light & Dark screenshots of the Packages tab (1000 px)'), async () => {
        mkdirSync(shotsDir, { recursive: true });
        await page.setViewportSize({ width: 1000, height: 900 });
        await openPackages(page);
        const saved = [];
        for (const theme of ['Light', 'Dark']) {
          await page.locator(`header button[aria-label="${theme}"]`).click();
          await page.waitForTimeout(250);
          const path = join(shotsDir, `packages-${theme.toLowerCase()}-${browserName}.png`);
          await page.screenshot({ path, fullPage: false });
          saved.push(path);
        }
        await page.locator('header button[aria-label="Light"]').click();
        await page.setViewportSize({ width: 1280, height: 800 });
        if (!(await noOverflow(page))) return 'horizontal overflow';
        return { ok: true, note: `saved ${saved.length} in ${shotsDir}` };
      });

      await record(browserName, name('kept wheel restored after a reload in Off; Remove restarts and keeps the files'), async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitIsolatedMain(page, 20000);
        await waitMonacoAndPyodideReady(page, 30000);
        await openPackages(page);
        await waitNotice(page, 'Restored', 'python-pkg-restore-notice');
        const row = await waitRow(page, 'uiwheel', (r) => r && r.installed === 'true');
        if (row.source !== 'wheel' || !row.keep?.checked) return `restored row ${JSON.stringify(row)}`;
        await page.getByTestId('python-pkg-remove-uiwheel').click();
        const confirm = (await page.getByTestId('python-pkg-remove-confirm').textContent()) || '';
        if (!confirm.includes('Your files are kept')) return `confirm: ${confirm}`;
        await page.getByTestId('python-pkg-remove-yes').click();
        await waitNotice(page, 'Removed uiwheel', 'python-pkg-notice', 40000);
        await waitPanelIdle(page, 40000);
        if (await rowInfo(page, 'uiwheel')) return 'uiwheel still listed';
        const manifest = await page.evaluate(() => localStorage.getItem('python:packages-v1') || '');
        if (manifest.includes('uiwheel')) return `manifest still has uiwheel: ${manifest}`;
        await page.locator('header [role="tablist"]').getByRole('tab', { name: 'Workbench' }).click();
        await page.getByTestId('python-tree-item-main.py').waitFor({ state: 'visible', timeout: 8000 });
        await waitMonacoAndPyodideReady(page, 30000);
        await setCode(page, 'try:\n    import uiwheel\n    print("still-there")\nexcept ImportError:\n    print("uiwheel-gone")\n');
        await page.getByTestId('python-run-btn').click();
        await waitConsole(page, 'uiwheel-gone');
        await waitRunIdle(page);
        return routed.length ? `external requests: ${routed.join(', ')}` : true;
      }, '', 120000);

      await record(browserName, name('no console/page errors in Off'), async () => {
        const errs = errTracker.getErrors().filter((e) => !PROBE_CSP_REFUSAL.test(e));
        return errs.length === 0 ? true : `errors: ${errs.join(' | ')}`;
      });
    } finally {
      errTracker.detach();
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- ?net=pkg against canned PyPI
  if (!workerRouting && !setMockPypi) {
    await record(browserName, name('?net=pkg install flow'), async () => ({ ok: true, note: 'skipped: needs the harness servers (mock index) in WebKit' }));
  } else {
    if (setMockPypi) setMockPypi(mockPypi(baseUrl));
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const routed = [];
    await ctx.route((url) => isExternal(url.href), async (route) => {
      const url = route.request().url();
      routed.push(url);
      const canned = fulfillPypi(url);
      if (canned) await route.fulfill(canned);
      else await route.abort();
    });
    if (!workerRouting) {
      // WebKit: map the page's own PyPI fetches (resolve, saved copy) to the same-origin mock.
      await ctx.addInitScript((origin) => {
        const orig = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          let m = /^https:\/\/pypi\.org\/simple\/([^/]+)\/$/.exec(url);
          if (m) return orig(`${origin}/__mock-pypi/simple/${m[1]}/`, init);
          m = /^https:\/\/files\.pythonhosted\.org\/.*\/([^/]+\.whl)$/.exec(url);
          if (m) return orig(`${origin}/__mock-pypi/files/${m[1]}`, init);
          return orig(input, init);
        };
      }, baseUrl);
    }
    const page = await ctx.newPage();
    const errTracker = attachErrorTracker(page, { allowCspProbe: true });
    const via = workerRouting ? 'routed pypi.org' : 'same-origin mock index';
    try {
      await page.goto(`${baseUrl}/python/main?net=pkg`, { waitUntil: 'domcontentloaded' });
      await acknowledgeW1(page, waitIsolatedMain);
      await page.getByTestId('python-w4-load-dialog').waitFor({ state: 'visible', timeout: 8000 });
      await page.getByTestId('python-w4-continue').click();
      await waitMonacoAndPyodideReady(page, 30000);
      if (!workerRouting) {
        await setCode(page, `import micropip\nmicropip.set_index_urls(["${baseUrl}/__mock-pypi/simple/{package_name}/"])\nprint("mock-index-set")\n`);
        await page.getByTestId('python-run-btn').click();
        await waitConsole(page, 'mock-index-set');
        await waitRunIdle(page);
      }

      await record(browserName, name('?net=pkg: W6 names package, version and host; Cancel installs nothing'), async () => {
        await openPackages(page);
        const mode = (await page.getByTestId('python-pkg-mode').textContent()) || '';
        if (!mode.includes('Package index mode') || (await page.getByTestId('python-pkg-switch').count())) return `mode line: ${mode}`;
        await installName(page, 'uipkg');
        await page.getByTestId('python-w6-dialog').waitFor({ state: 'visible', timeout: 15000 });
        const q = (await page.getByTestId('python-w6-question').textContent()) || '';
        const body = (await page.getByTestId('python-w6-dialog').textContent()) || '';
        if (!q.includes('uipkg') || !q.includes('1.2.0') || !q.includes('pypi.org')) return `W6 question: ${q}`;
        if (!body.includes('A package runs code when it is imported')) return `W6 body: ${body}`;
        const outside = await page.evaluate(() => !document.querySelector('[data-testid="python-w6-dialog"]').closest('[data-testid="python-program-output-frame"]'));
        if (!outside) return 'W6 inside program output';
        await page.getByTestId('python-w6-cancel').click();
        await page.getByTestId('python-w6-dialog').waitFor({ state: 'hidden', timeout: 5000 });
        await page.waitForTimeout(800);
        if (await rowInfo(page, 'uipkg')) return 'uipkg installed after Cancel';
        if (workerRouting && routed.some((u) => u.includes('files.pythonhosted.org'))) return 'a wheel was downloaded before Install';
        return true;
      }, via);

      await record(browserName, name('?net=pkg: Install after W6 lists the package as PyPI and it imports'), async () => {
        await page.getByTestId('python-pkg-install-btn').click();
        await page.getByTestId('python-w6-dialog').waitFor({ state: 'visible', timeout: 15000 });
        await page.getByTestId('python-w6-install').click();
        const row = await waitRow(page, 'uipkg', (r) => r && r.installed === 'true', 40000);
        if (row.source !== 'pypi' || row.label !== 'PyPI') return JSON.stringify(row);
        await page.locator('header [role="tablist"]').getByRole('tab', { name: 'Workbench' }).click();
        await setCode(page, 'import uipkg\nprint(uipkg.hello())\n');
        await page.getByTestId('python-run-btn').click();
        await waitConsole(page, 'uipkg-ok');
        await waitRunIdle(page);
        const bad = routed.filter((u) => !/^https:\/\/(pypi\.org|files\.pythonhosted\.org)\//.test(u));
        return bad.length ? `non-PyPI external requests: ${bad.join(', ')}` : true;
      }, via, 90000);

      if (workerRouting) {
        await record(browserName, name('Keep in ?net=pkg, reload in Off: restored as "PyPI (saved copy)" with 0 external requests'), async () => {
          await openPackages(page);
          await page.getByTestId('python-pkg-keep-uipkg').click();
          await waitNotice(page, 'uipkg is kept');
          await page.goto(`${baseUrl}/python/main#packages`, { waitUntil: 'domcontentloaded' });
          await waitIsolatedMain(page, 20000);
          routed.length = 0;
          await waitMonacoAndPyodideReady(page, 30000);
          await page.getByTestId('python-packages-panel').waitFor({ state: 'visible', timeout: 8000 });
          await waitNotice(page, 'Restored', 'python-pkg-restore-notice');
          const row = await waitRow(page, 'uipkg', (r) => r && r.installed === 'true' && r.source === 'pypi-saved');
          if (row.label !== 'PyPI (saved copy)' || !row.keep?.checked) return JSON.stringify(row);
          const mode = (await page.getByTestId('python-pkg-mode').textContent()) || '';
          if (!mode.includes('nothing is downloaded')) return `not Off after reload: ${mode}`;
          return routed.length ? `external requests in Off: ${routed.join(', ')}` : true;
        }, '', 90000);
      } else {
        await record(browserName, name('Keep of a mock-index package says why no saved copy could be made'), async () => {
          await openPackages(page);
          await page.getByTestId('python-pkg-keep-uipkg').click();
          const n = await waitNotice(page, 'could not be kept');
          return n.includes('no copy of its wheel could be saved') ? { ok: true, note: 'saved-copy restore checked in Edge/Firefox' } : n;
        });
      }

      await record(browserName, name('no console/page errors in ?net=pkg'), async () => {
        const errs = errTracker.getErrors().filter((e) => !PROBE_CSP_REFUSAL.test(e));
        return errs.length === 0 ? true : `errors: ${errs.join(' | ')}`;
      });
    } finally {
      errTracker.detach();
      await ctx.close();
      if (setMockPypi) setMockPypi(null);
    }
  }

  // ---------------------------------------------------------------- Phone 375x812, seeded manifest
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const entry = (n, pyodideVersion) => ({
      name: n,
      version: '1.0.0',
      source: 'wheel',
      requested: true,
      keep: true,
      sha256: 'a'.repeat(63) + (n === 'ghostwheel' ? 'b' : 'c'),
      fileName: `${n}-1.0.0-py3-none-any.whl`,
      depends: [],
      imports: [n],
      installedAt: '2026-01-01T00:00:00.000Z',
      pyodideVersion,
      abiVersion: '2026_0',
    });
    const manifest = JSON.stringify({
      v: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      entries: [entry('ghostwheel', PYODIDE_VERSION), entry('stalewheel', '0.1.0')],
    });
    await ctx.addInitScript((m) => {
      try {
        if (!sessionStorage.getItem('p6-seeded')) {
          localStorage.setItem('python:packages-v1', m);
          sessionStorage.setItem('p6-seeded', '1');
        }
      } catch {
        // storage blocked: the check below reports it
      }
    }, manifest);
    const page = await ctx.newPage();
    const errTracker = attachErrorTracker(page, { allowCspProbe: true });
    try {
      await record(browserName, name('restore skips show a tab badge and reasons; stale offers Reinstall; phone 375x812 0 overflow'), async () => {
        await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
        await acknowledgeW1(page, waitIsolatedMain);
        await waitMonacoAndPyodideReady(page, 30000);
        await page.waitForFunction(() => /!/.test(document.getElementById('python-ws-tab-packages')?.textContent || ''), { timeout: 15000 });
        await openPackages(page);
        if (!(await noOverflow(page))) {
          return `overflow: ${await page.evaluate(() => `${document.documentElement.scrollWidth} > ${window.innerWidth}`)}`;
        }
        const n = await waitNotice(page, 'were not restored', 'python-pkg-restore-notice');
        if (!n.includes('ghostwheel: The saved wheel file is missing') || !n.includes('stalewheel: Kept under another Pyodide version')) return `notice: ${n}`;
        const ghost = await waitRow(page, 'ghostwheel', (r) => r && r.installed === 'false');
        if (!ghost.text.includes('Not loaded') || !ghost.keep?.checked) return JSON.stringify(ghost);
        if (!(await page.getByTestId('python-pkg-reinstall-stalewheel').isVisible())) return 'no Reinstall for the stale entry';
        if (await page.getByTestId('python-pkg-reinstall-ghostwheel').count()) return 'Reinstall offered for a missing wheel';
        const layout = await page.evaluate(() => {
          const thead = document.querySelector('[data-testid="python-pkg-table"] thead');
          const row = document.querySelector('[data-testid="python-pkg-row-ghostwheel"]');
          return { thead: thead ? getComputedStyle(thead).display : '', row: row ? getComputedStyle(row).display : '' };
        });
        if (layout.thead !== 'none' || layout.row !== 'grid') return `phone layout ${JSON.stringify(layout)}`;
        if (/!/.test((await pkgTab(page).textContent()) || '')) return 'badge not cleared after opening the tab';
        const errs = errTracker.getErrors().filter((e) => !PROBE_CSP_REFUSAL.test(e));
        return errs.length === 0 ? true : `errors: ${errs.join(' | ')}`;
      }, '', 90000);
    } finally {
      errTracker.detach();
      await ctx.close();
    }
  }
}
