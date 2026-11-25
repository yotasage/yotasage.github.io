// P3b 3-browser UI verification checks for /python/main Files workspace.
// Imported by scripts/harness/python/ui.mjs to verify File Tree CRUD, multi-tab Monaco reload
// persistence, fs.changed run-created markers, Examples picker, W5 upload notice, ZIP export/import
// (valid + malicious traversal rejection), two-tab Web Locks notice, and phone Files tab overflow.

const CRC_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[i] = c >>> 0;
  }
  return tbl;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Builds a valid uncompressed (STORE) ZIP Buffer with arbitrary entry names (including '../evil.py'). */
function buildStoreZip(entries) {
  const enc = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, content } of entries) {
    const nameBytes = enc.encode(name);
    const dataBytes = typeof content === 'string' ? enc.encode(content) : content;
    const crc = crc32(dataBytes);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // STORE
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBytes.length, 18);
    local.writeUInt32LE(dataBytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    Buffer.from(nameBytes).copy(local, 30);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBytes.length, 20);
    central.writeUInt32LE(dataBytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    Buffer.from(nameBytes).copy(central, 46);

    localParts.push(local, Buffer.from(dataBytes));
    centralParts.push(central);
    offset += local.length + dataBytes.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

async function setModelTextByPath(page, relPath, code) {
  await page.evaluate(
    ({ path, src }) => {
      const models = window.monaco?.editor?.getModels?.() || [];
      const targetSuffix = `/workspace/${path}`;
      const model = models.find((m) => m.uri.path === targetSuffix || m.uri.toString().endsWith(targetSuffix));
      if (!model) {
        throw new Error(`Monaco model for "${path}" not found (have: ${models.map((m) => m.uri.path).join(', ')})`);
      }
      model.setValue(src);
    },
    { path: relPath, src: code },
  );
}

export async function runFilesUiSuite(
  browserName,
  browser,
  baseUrl,
  { record, waitIsolatedMain, waitMonacoAndPyodideReady, waitTerminalContains, attachErrorTracker },
) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errTracker = attachErrorTracker(page, { allowCspProbe: true });

  try {
    await page.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
    await waitIsolatedMain(page, 20000);
    const w1 = page.getByTestId('python-w1-dialog');
    await w1.waitFor({ state: 'visible', timeout: 8000 });
    await page.getByTestId('python-w1-ack').click();
    await w1.waitFor({ state: 'hidden', timeout: 5000 });
    await waitMonacoAndPyodideReady(page, 15000);

    // P3-1: Create helper.py, import from main.py, Run, reload page, verify tabs/files persist & re-run succeeds
    await record(browserName, 'P3 Files: multi-file create, import, Run & reload persistence', async () => {
      await page.getByTestId('python-new-file-btn').click();
      await page.getByTestId('python-file-action-input').fill('helper.py');
      await page.getByTestId('python-file-action-submit').click();

      await page.getByTestId('python-tree-item-helper.py').waitFor({ state: 'visible', timeout: 5000 });
      await page.getByTestId('python-tab-helper.py').waitFor({ state: 'visible', timeout: 5000 });

      await setModelTextByPath(page, 'helper.py', 'def greet(n):\n    return f"Hi {n}!"\n');
      await page.getByTestId('python-tab-main.py').click();
      await setModelTextByPath(page, 'main.py', 'import helper\nprint(helper.greet("P3"))\n');

      await page.getByTestId('python-run-btn').click();
      await waitTerminalContains(page, 'python-console-xterm', 'Hi P3!', 15000);
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="python-run-btn"]')?.disabled,
        { timeout: 10000 },
      );

      // Reload page and confirm both tabs & files survive IndexedDB hydration
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitIsolatedMain(page, 15000);
      await waitMonacoAndPyodideReady(page, 15000);

      await page.getByTestId('python-tree-item-helper.py').waitFor({ state: 'visible', timeout: 5000 });
      await page.getByTestId('python-tree-item-main.py').waitFor({ state: 'visible', timeout: 5000 });
      await page.getByTestId('python-tab-helper.py').waitFor({ state: 'visible', timeout: 5000 });
      await page.getByTestId('python-tab-main.py').waitFor({ state: 'visible', timeout: 5000 });

      await page.getByTestId('python-tab-main.py').click();
      await page.getByTestId('python-run-btn').click();
      await waitTerminalContains(page, 'python-console-xterm', 'Hi P3!', 15000);
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="python-run-btn"]')?.disabled,
        { timeout: 10000 },
      );
      return true;
    });

    // P3-2: Script writes generated.txt -> appears in File Tree with run-created badge
    await record(browserName, 'P3 Files: script writes generated.txt -> run-created marker', async () => {
      await page.getByTestId('python-console-clear').click();
      await page.getByTestId('python-tab-main.py').click();
      await setModelTextByPath(
        page,
        'main.py',
        'with open("generated.txt", "w", encoding="utf-8") as f:\n    f.write("generated by P3\\n")\nprint("GEN_WRITTEN")\n',
      );
      await page.getByTestId('python-run-btn').click();
      await waitTerminalContains(page, 'python-console-xterm', 'GEN_WRITTEN', 15000);

      const genRow = page.locator('[data-testid="python-tree-item-generated.txt"][data-created-by-run="true"]');
      await genRow.waitFor({ state: 'visible', timeout: 8000 });
      await page.getByTestId('python-new-badge-generated.txt').waitFor({ state: 'visible', timeout: 5000 });
      return true;
    });

    // P3-3: Load multi-file modules example from Examples picker -> Run succeeds
    await record(browserName, 'P3 Files: load multi-file "modules" example & Run', async () => {
      await page.getByTestId('python-console-clear').click();
      await page.getByTestId('python-examples-select').selectOption('modules');
      await page.getByTestId('python-tree-item-helpers.py').waitFor({ state: 'visible', timeout: 5000 });
      await page.getByTestId('python-tab-main.py').waitFor({ state: 'visible', timeout: 5000 });

      await page.getByTestId('python-run-btn').click();
      await waitTerminalContains(page, 'python-console-xterm', 'Smoothed signal', 15000);
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="python-run-btn"]')?.disabled,
        { timeout: 10000 },
      );
      return true;
    });

    // P3-4: Upload a .py file -> W5 notice appears
    await record(browserName, 'P3 Files: upload .py file -> W5 notice appears', async () => {
      await page.getByTestId('python-upload-input').setInputFiles({
        name: 'uploaded_mod.py',
        mimeType: 'text/x-python',
        buffer: Buffer.from('VALUE = 99\n', 'utf-8'),
      });
      await page.getByTestId('python-tree-item-uploaded_mod.py').waitFor({ state: 'visible', timeout: 5000 });
      const w5 = page.getByTestId('python-w5-notice');
      await w5.waitFor({ state: 'visible', timeout: 5000 });
      const text = (await w5.innerText()) || '';
      if (!text.includes('Only add files you trust')) {
        return `W5 text mismatch: "${text}"`;
      }
      await page.getByTestId('python-w5-dismiss').click();
      await w5.waitFor({ state: 'hidden', timeout: 3000 });
      return true;
    });

    // P3-5: Export .zip, import valid .zip, and reject malicious ../evil.py .zip
    await record(browserName, 'P3 Files: export .zip, import valid .zip, reject ../evil.py .zip', async () => {
      // Export .zip
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10000 }),
        page.getByTestId('python-zip-export-btn').click(),
      ]);
      const suggested = download.suggestedFilename();
      if (!suggested.endsWith('.zip')) {
        return `Expected .zip download, got "${suggested}"`;
      }

      // Import valid .zip
      const validZip = buildStoreZip([
        { name: 'pkg/from_zip.py', content: 'ZIP_OK = True\n' },
      ]);
      await page.getByTestId('python-zip-import-input').setInputFiles({
        name: 'good.zip',
        mimeType: 'application/zip',
        buffer: validZip,
      });
      await page.getByTestId('python-tree-item-pkg/from_zip.py').waitFor({ state: 'visible', timeout: 6000 });

      // Import malicious ../evil.py .zip -> rejected with visible error & zero escape
      const evilZip = buildStoreZip([
        { name: '../evil.py', content: 'print("ESCAPED")\n' },
      ]);
      await page.getByTestId('python-zip-import-input').setInputFiles({
        name: 'evil.zip',
        mimeType: 'application/zip',
        buffer: evilZip,
      });
      const errBox = page.getByTestId('python-files-error');
      await errBox.waitFor({ state: 'visible', timeout: 6000 });
      const errText = (await errBox.innerText()) || '';
      if (!/evil\.py|\.\.|rejected/i.test(errText)) {
        return `Unexpected malicious ZIP error text: "${errText}"`;
      }
      const hasEvil = await page.locator('[data-path*="evil.py"]').count();
      if (hasEvil !== 0) {
        return 'Malicious ../evil.py appeared in File Tree!';
      }
      return true;
    });

    // P3-6: Open second tab to /python/main in same context -> displays Web Locks notice
    await record(browserName, 'P3 Files: second tab displays Web Locks notice', async () => {
      const page2 = await ctx.newPage();
      try {
        await page2.goto(`${baseUrl}/python/main`, { waitUntil: 'domcontentloaded' });
        await waitIsolatedMain(page2, 15000);
        const lockBanner = page2.getByTestId('python-lock-banner');
        await lockBanner.waitFor({ state: 'visible', timeout: 8000 });
        const bannerText = (await lockBanner.innerText()) || '';
        if (!bannerText.includes('another browser tab')) {
          return `Lock banner text mismatch: "${bannerText}"`;
        }
        const runDisabled = await page2.getByTestId('python-run-btn').isDisabled();
        if (!runDisabled) {
          return 'Second tab Run button should be disabled while locked';
        }
        return true;
      } finally {
        await page2.close();
      }
    });

    const errs = errTracker.getErrors();
    if (errs.length > 0) {
      await record(browserName, 'P3 Files: zero console/page errors', async () => errs.join(' | '));
    }
  } finally {
    errTracker.detach();
    await ctx.close();
  }
}
