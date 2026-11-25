// P4b 3-browser UI & security verification checks for /python/main Plots gallery & File Viewers.
// Imported by scripts/harness/python/ui.mjs to verify:
// 1. Matplotlib 2-plot gallery + unread badge + live SVG vector export
// 2. PIL.Image.show() rendering in Plots gallery
// 3. Canvas-only inline PDF viewer (lib/pdf/pdfjs.ts) with pixel check & 0 COEP errors
// 4. Pure-React CSV table & JSON formatted viewers + Preview/Code toggle to Monaco
// 5. Security §8 viewer XSS isolation (SVG via <img> only; HTML sandbox="" & opt-in allow-scripts)
// 6. 100-plot Blob URL leak check (0 leaked PNG Blob URLs after Clear all)

import { readFileSync } from 'node:fs';

async function setModelTextByPath(page, relPath, code) {
  await page.evaluate(
    ({ path, src }) => {
      const models = window.monaco?.editor?.getModels?.() || [];
      const targetSuffix = `/workspace/${path}`;
      const model = models.find(
        (m) => m.uri.path === targetSuffix || m.uri.toString().endsWith(targetSuffix),
      );
      if (!model) {
        throw new Error(
          `Monaco model for "${path}" not found (have: ${models.map((m) => m.uri.path).join(', ')})`,
        );
      }
      model.setValue(src);
    },
    { path: relPath, src: code },
  );
}

async function waitRunFinished(page, timeoutMs = 45000) {
  await page.waitForFunction(
    () => {
      const runBtn = document.querySelector('[data-testid="python-run-btn"]');
      const pill = document.querySelector('[data-testid="python-status-pill"]');
      return Boolean(runBtn) && !runBtn.disabled && /Ready|Klar/i.test(pill?.textContent || '');
    },
    { timeout: timeoutMs },
  );
}

export async function runPlotsUiSuite(
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

    // P4-1: Matplotlib 2 plots via plt.show() -> unread badge 2 -> stage <img> + live Export SVG
    await record(browserName, 'P4 Plots: 2 matplotlib plots, badge=2, stage <img> & Export SVG', async () => {
      const script = [
        'import matplotlib.pyplot as plt',
        'fig1, ax1 = plt.subplots(figsize=(4, 3), dpi=80)',
        'ax1.plot([0, 1, 2, 3], [0, 1, 4, 9])',
        'ax1.set_title("LinePlot")',
        'plt.show()',
        'fig2, ax2 = plt.subplots(figsize=(4, 3), dpi=80)',
        'ax2.bar(["A", "B", "C"], [3, 7, 5])',
        'ax2.set_title("BarPlot")',
        'plt.show()',
        'print("MPL_TWO_DONE")',
      ].join('\n');
      await setModelTextByPath(page, 'main.py', script);
      await page.getByTestId('python-run-btn').click();
      await waitTerminalContains(page, 'python-console-xterm', 'MPL_TWO_DONE', 35000);
      await waitRunFinished(page, 35000);

      const outputFrame = page.getByTestId('python-program-output-frame');
      const plotsTab = outputFrame.getByRole('tab', { name: /Plots/ });
      await plotsTab.waitFor({ state: 'visible', timeout: 5000 });
      const badgeText = ((await plotsTab.innerText()) || '').trim();
      if (!badgeText.includes('2')) {
        return `Expected Plots tab unread badge "2", got "${badgeText}"`;
      }

      await plotsTab.click();
      await page.getByTestId('python-plots-panel').waitFor({ state: 'visible', timeout: 5000 });

      const thumbCount = await page
        .locator('[data-testid="python-plots-thumbs"] [data-testid^="python-plot-thumb-"]')
        .count();
      if (thumbCount !== 2) {
        return `Expected 2 plot thumbnails, got ${thumbCount}`;
      }

      const stageDims = await page.evaluate(async () => {
        const img = document.querySelector('[data-testid="python-plot-stage-img"]');
        if (!img) return null;
        if (!img.complete) {
          await new Promise((res) => {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
          });
        }
        return { complete: img.complete, w: img.naturalWidth, h: img.naturalHeight };
      });
      if (!stageDims || !stageDims.complete || stageDims.w <= 0 || stageDims.h <= 0) {
        return `Stage image did not load cleanly: ${JSON.stringify(stageDims)}`;
      }

      // Click Export SVG and verify non-empty SVG download
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.getByTestId('python-plot-export-svg').click(),
      ]);
      const suggested = download.suggestedFilename();
      if (!suggested.endsWith('.svg')) {
        return `Expected .svg download, got "${suggested}"`;
      }
      const dlPath = await download.path();
      if (!dlPath) {
        return 'Export SVG download path was empty';
      }
      const svgText = readFileSync(dlPath, 'utf-8');
      if (!svgText.includes('<svg') || svgText.length < 100) {
        return `Exported SVG looks invalid (len=${svgText.length})`;
      }
      return { ok: true, note: `${stageDims.w}x${stageDims.h}, svg ${svgText.length}B` };
    });

    // P4-2: PIL.Image.show() appears in Plots gallery with exact 64x48 natural dimensions
    await record(browserName, 'P4 Plots: PIL.Image.show() renders 64x48 in gallery', async () => {
      await page.getByTestId('python-tab-main.py').click();
      await setModelTextByPath(
        page,
        'main.py',
        'from PIL import Image\nImage.new("RGB", (64, 48), (20, 140, 220)).show(title="BlueBox")\nprint("PIL_SHOW_DONE")\n',
      );
      await page.getByTestId('python-run-btn').click();
      await waitTerminalContains(page, 'python-console-xterm', 'PIL_SHOW_DONE', 25000);
      await waitRunFinished(page, 25000);

      const outputFrame = page.getByTestId('python-program-output-frame');
      await outputFrame.getByRole('tab', { name: /Plots/ }).click();
      await page.getByTestId('python-plots-panel').waitFor({ state: 'visible', timeout: 5000 });

      const pilCheck = await page.evaluate(async () => {
        const img = document.querySelector('[data-testid="python-plot-stage-img"]');
        if (!img) return null;
        if (!img.complete) {
          await new Promise((res) => {
            img.addEventListener('load', res, { once: true });
            img.addEventListener('error', res, { once: true });
          });
        }
        const panelText = document.querySelector('[data-testid="python-plots-panel"]')?.textContent || '';
        return { w: img.naturalWidth, h: img.naturalHeight, hasTitle: panelText.includes('BlueBox') };
      });
      if (!pilCheck || pilCheck.w !== 64 || pilCheck.h !== 48 || !pilCheck.hasTitle) {
        return `PIL plot check failed: ${JSON.stringify(pilCheck)}`;
      }
      return true;
    });

    // P4-3: Inline PDF viewer via lib/pdf/pdfjs.ts renders non-blank canvas with 0 COEP errors
    await record(browserName, 'P4 Viewers: inline PDF canvas renders non-blank pixels (0 errors)', async () => {
      const pdfScript = [
        'import matplotlib.pyplot as plt',
        'fig, ax = plt.subplots(figsize=(4, 3))',
        'ax.plot([0, 1, 2], [0, 3, 1], color="navy", linewidth=4)',
        'ax.set_title("Report PDF")',
        'fig.savefig("report.pdf")',
        'plt.close(fig)',
        'print("PDF_WRITTEN")',
      ].join('\n');
      await setModelTextByPath(page, 'main.py', pdfScript);
      await page.getByTestId('python-run-btn').click();
      await waitTerminalContains(page, 'python-console-xterm', 'PDF_WRITTEN', 25000);
      await waitRunFinished(page, 25000);

      const pdfItem = page.getByTestId('python-tree-item-report.pdf');
      await pdfItem.waitFor({ state: 'visible', timeout: 8000 });
      await pdfItem.click();

      await page.getByTestId('python-pdf-canvas').waitFor({ state: 'visible', timeout: 15000 });
      // Wait until pdf.js finishes rendering opaque white background + non-white plot pixels
      await page.waitForFunction(
        () => {
          const c = document.querySelector('[data-testid="python-pdf-canvas"]');
          if (!c || c.getAttribute('data-rendered') !== 'true') return false;
          if (c.width === 0 || c.height === 0) return false;
          const ctx2d = c.getContext('2d');
          if (!ctx2d) return false;
          const data = ctx2d.getImageData(0, 0, c.width, c.height).data;
          let whiteOpaque = 0;
          let darkOpaque = 0;
          for (let i = 0; i < data.length; i += 16) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            if (a < 240) continue;
            if (r > 240 && g > 240 && b > 240) whiteOpaque += 1;
            else if (r < 220 || g < 220 || b < 220) darkOpaque += 1;
            if (whiteOpaque > 50 && darkOpaque > 40) return true;
          }
          return false;
        },
        undefined,
        { timeout: 15000 },
      );

      const pdfErrVisible = await page.getByTestId('python-pdf-error').isVisible();
      if (pdfErrVisible) {
        return 'PDF viewer displayed an error banner';
      }
      const dims = await page.evaluate(() => {
        const c = document.querySelector('[data-testid="python-pdf-canvas"]');
        return { w: c?.width || 0, h: c?.height || 0 };
      });
      return { ok: true, note: `${dims.w}x${dims.h}` };
    });

    // P4-4: CSV & JSON viewers + Preview/Code toggle to Monaco
    await record(browserName, 'P4 Viewers: CSV table, JSON viewer & Code toggle to Monaco', async () => {
      await page.getByTestId('python-tab-main.py').click();
      const dataScript = [
        'import json',
        'with open("table.csv", "w", encoding="utf-8") as f:',
        '    f.write(\'name,score,note\\nAlpha,42,"hello, world"\\nBeta,99,"ok"\\n\')',
        'with open("info.json", "w", encoding="utf-8") as f:',
        '    json.dump({"tool": "python-v1", "ok": True, "vals": [1, 2, 3]}, f)',
        'print("DATA_FILES_DONE")',
      ].join('\n');
      await setModelTextByPath(page, 'main.py', dataScript);
      await page.getByTestId('python-run-btn').click();
      await waitTerminalContains(page, 'python-console-xterm', 'DATA_FILES_DONE', 20000);
      await waitRunFinished(page, 20000);

      // Open table.csv -> table renders quoted comma cleanly
      await page.getByTestId('python-tree-item-table.csv').waitFor({ state: 'visible', timeout: 8000 });
      await page.getByTestId('python-tree-item-table.csv').click();
      const csvTable = page.getByTestId('python-csv-table');
      await csvTable.waitFor({ state: 'visible', timeout: 5000 });
      const csvText = (await csvTable.innerText()) || '';
      if (!csvText.includes('Alpha') || !csvText.includes('hello, world') || !csvText.includes('99')) {
        return `CSV table content mismatch: "${csvText}"`;
      }

      // Open info.json -> formatted JSON renders, then Code toggle opens Monaco
      await page.getByTestId('python-tree-item-info.json').waitFor({ state: 'visible', timeout: 8000 });
      await page.getByTestId('python-tree-item-info.json').click();
      const jsonPre = page.getByTestId('python-json-pre');
      await jsonPre.waitFor({ state: 'visible', timeout: 5000 });
      const jsonText = (await jsonPre.innerText()) || '';
      if (!jsonText.includes('"tool": "python-v1"') || !jsonText.includes('"ok": true')) {
        return `JSON viewer content mismatch: "${jsonText}"`;
      }

      await page.getByTestId('python-viewer-mode-code').click();
      await page.getByTestId('python-monaco-host').waitFor({ state: 'visible', timeout: 5000 });
      const viewerStillThere = await page.getByTestId('python-viewer-frame').isVisible();
      if (viewerStillThere) {
        return 'Viewer stayed visible after switching info.json to Code mode';
      }
      return true;
    });

    // P4-5: Security §8 viewer XSS tests (SVG via <img> only; HTML sandbox="" & opt-in allow-scripts)
    await record(browserName, 'P4 Security §8: SVG via <img> & HTML sandbox XSS isolation', async () => {
      await page.getByTestId('python-tab-main.py').click();
      const xssScript = [
        'with open("xss.svg", "w", encoding="utf-8") as f:',
        '    f.write(\'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" onload="window.__xssSvg=1"><script>window.__xssSvg=2</script><rect width="20" height="20" fill="red"/></svg>\')',
        'with open("xss.html", "w", encoding="utf-8") as f:',
        '    f.write(\'<p>SAFE</p><script>try{window.parent.__xssHtml=1}catch(e){} document.body.setAttribute("data-ran","1");</script>\')',
        'print("XSS_FILES_READY")',
      ].join('\n');
      await setModelTextByPath(page, 'main.py', xssScript);
      await page.getByTestId('python-run-btn').click();
      await waitTerminalContains(page, 'python-console-xterm', 'XSS_FILES_READY', 20000);
      await waitRunFinished(page, 20000);

      // 5a. SVG check: strictly <img> with blob:, 0 inline <svg>, window.__xssSvg === undefined
      await page.getByTestId('python-tree-item-xss.svg').waitFor({ state: 'visible', timeout: 8000 });
      await page.getByTestId('python-tree-item-xss.svg').click();
      await page.getByTestId('python-viewer-img').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(200);

      const svgCheck = await page.evaluate(() => {
        const frame = document.querySelector('[data-testid="python-viewer-frame"]');
        const img = document.querySelector('[data-testid="python-viewer-img"]');
        const inlineSvgs = frame ? frame.querySelectorAll('svg').length : -1;
        const objects = frame ? frame.querySelectorAll('object, embed, iframe').length : -1;
        return {
          src: img?.getAttribute('src') || '',
          inlineSvgs,
          objects,
          xssFlag: window.__xssSvg,
        };
      });
      if (
        !svgCheck.src.startsWith('blob:') ||
        svgCheck.inlineSvgs !== 0 ||
        svgCheck.objects !== 0 ||
        svgCheck.xssFlag !== undefined
      ) {
        return `SVG XSS hardening failed: ${JSON.stringify(svgCheck)}`;
      }

      // 5b. HTML check: default sandbox="" (no scripts), opt-in sandbox="allow-scripts" (never allow-same-origin)
      await page.getByTestId('python-tree-item-xss.html').waitFor({ state: 'visible', timeout: 8000 });
      await page.getByTestId('python-tree-item-xss.html').click();
      const iframe = page.getByTestId('python-html-iframe');
      await iframe.waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(250);

      const defaultHtml = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="python-html-iframe"]');
        return {
          sandbox: el?.getAttribute('sandbox'),
          xssFlag: window.__xssHtml,
        };
      });
      if (defaultHtml.sandbox !== '' || defaultHtml.xssFlag !== undefined) {
        return `Default HTML sandbox failed: ${JSON.stringify(defaultHtml)}`;
      }

      // Opt-in Allow scripts -> sandbox === "allow-scripts" (never allow-same-origin), parent untouched
      await page.getByTestId('python-html-allow-scripts').check();
      await page.waitForTimeout(300);
      const optInHtml = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="python-html-iframe"]');
        const srcDoc = el?.getAttribute('srcdoc') || '';
        return {
          sandbox: el?.getAttribute('sandbox'),
          hasCspMeta: srcDoc.includes("default-src 'none'"),
          xssFlag: window.__xssHtml,
        };
      });
      if (
        optInHtml.sandbox !== 'allow-scripts' ||
        !optInHtml.hasCspMeta ||
        optInHtml.xssFlag !== undefined
      ) {
        return `Opt-in HTML sandbox failed: ${JSON.stringify(optInHtml)}`;
      }

      // Verify switching away and back to xss.html resets Allow scripts to OFF
      await page.getByTestId('python-tab-main.py').click();
      await page.getByTestId('python-tree-item-xss.html').click();
      const resetChecked = await page.getByTestId('python-html-allow-scripts').isChecked();
      if (resetChecked) {
        return 'Allow scripts checkbox did not reset to false on file switch';
      }
      return true;
    });

    // P4-6: 100-plot Blob URL leak check -> 0 leaked plot Blob URLs after Clear all
    await record(
      browserName,
      'P4 Plots: 100 plots in a row -> Clear all leaves 0 leaked Blob URLs',
      async () => {
        // Clear previous plots & switch editor back to main.py first
        const outputFrame = page.getByTestId('python-program-output-frame');
        await outputFrame.getByRole('tab', { name: /Plots/ }).click();
        const clearBtn = page.getByTestId('python-plots-clear-all');
        if (await clearBtn.isVisible()) {
          await clearBtn.click();
        }
        await page.getByTestId('python-tab-main.py').click();

        // Install PNG Blob URL create/revoke tracker
        await page.evaluate(() => {
          const origCreate = URL.createObjectURL.bind(URL);
          const origRevoke = URL.revokeObjectURL.bind(URL);
          const live = new Set();
          window.__plotBlobTracker = { created: 0, revoked: 0, live };
          URL.createObjectURL = (obj) => {
            const url = origCreate(obj);
            if (obj instanceof Blob && obj.type === 'image/png') {
              window.__plotBlobTracker.created += 1;
              live.add(url);
            }
            return url;
          };
          URL.revokeObjectURL = (url) => {
            if (live.has(url)) {
              live.delete(url);
              window.__plotBlobTracker.revoked += 1;
            }
            return origRevoke(url);
          };
        });

        const loopScript = [
          'import matplotlib.pyplot as plt',
          'for i in range(100):',
          '    fig, ax = plt.subplots(figsize=(2, 1.5), dpi=40)',
          '    ax.plot([0, 1], [i, i + 1])',
          '    plt.show()',
          'print("HUNDRED_PLOTS_DONE")',
        ].join('\n');
        await setModelTextByPath(page, 'main.py', loopScript);
        await page.getByTestId('python-run-btn').click();
        await waitTerminalContains(page, 'python-console-xterm', 'HUNDRED_PLOTS_DONE', 75000);
        await waitRunFinished(page, 75000);

        await outputFrame.getByRole('tab', { name: /Plots/ }).click();
        await page.getByTestId('python-plots-panel').waitFor({ state: 'visible', timeout: 5000 });
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '[data-testid="python-plots-thumbs"] [data-testid^="python-plot-thumb-"]',
            ).length === 100,
          { timeout: 10000 },
        );

        const beforeClear = await page.evaluate(() => ({
          created: window.__plotBlobTracker.created,
          revoked: window.__plotBlobTracker.revoked,
          live: window.__plotBlobTracker.live.size,
        }));

        await page.getByTestId('python-plots-clear-all').click();
        await page.getByTestId('python-plots-empty').waitFor({ state: 'visible', timeout: 5000 });

        const afterClear = await page.evaluate(() => ({
          created: window.__plotBlobTracker.created,
          revoked: window.__plotBlobTracker.revoked,
          live: window.__plotBlobTracker.live.size,
        }));

        if (beforeClear.created !== 100 || afterClear.live !== 0 || afterClear.revoked !== 100) {
          return `Blob URL leak detected: before=${JSON.stringify(beforeClear)} after=${JSON.stringify(afterClear)}`;
        }
        return { ok: true, note: `created=${afterClear.created}, revoked=${afterClear.revoked}, leaked=0` };
      },
      '',
      90000,
    );

    // Filter only the deliberate browser diagnostic emitted when sandbox="" blocks xss.html's <script>.
    const errs = errTracker
      .getErrors()
      .filter((e) => !e.includes("Blocked script execution in 'about:srcdoc'"));
    if (errs.length > 0) {
      await record(browserName, 'P4 Plots/Viewers: zero console/page errors', async () =>
        errs.join(' | '),
      );
    }
  } finally {
    errTracker.detach();
    await ctx.close();
  }
}
