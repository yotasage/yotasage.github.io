// Part B (5): P4a Plots Engine verification across Edge, Firefox, and WebKit.
// Verifies lazy boot (no PIL/matplotlib at boot), 5 matplotlib plot types without touching disk,
// deterministic RGB pixel comparison via createImageBitmap + Canvas2D, PIL.Image.show() hook,
// on-demand SVG & PDF vector re-export, and 100-plot bounded live-figure eviction (<= 16 live).
import { waitHarnessReady } from './corpus-checks.mjs';

export async function runPlotChecks(browserName, browser, { primaryOrigin, record }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  try {
    await page.goto(`${primaryOrigin}/python/harness`, { waitUntil: 'domcontentloaded' });
    await waitHarnessReady(page, { expectIsolated: true });

    // Start cleanly with an empty workspace
    await page.evaluate(async () => {
      const st = window.__pythonHarness.createStorageClient();
      await st.open();
      await st.clearWorkspace();
      await st.close();
    });

    // Boot one shared client for the P4 plot verification battery
    const bootRes = await page.evaluate(async () => {
      const client = window.__pythonHarness.createClient();
      const ready = await client.start();
      const plots = [];
      const fsChanges = [];
      const dropped = [];
      window.__pythonHarness.onPlot(client, (p) => plots.push(p));
      client.subscribe({
        fsChanged: (c) => fsChanges.push(c),
        droppedMessage: (r) => dropped.push(r),
      });
      window.__p4Test = { client, plots, fsChanges, dropped };

      let stdout = '';
      const unsub = client.subscribe({ stdout: (t) => { stdout += t; } });
      const run = await client.run(
        [
          'import os, sys, yotasage_rt',
          'print("MPLBACKEND=" + os.environ.get("MPLBACKEND", ""))',
          'print("HAS_PIL=" + str("PIL" in sys.modules))',
          'print("HAS_MPL=" + str("matplotlib" in sys.modules))',
          'print("LIVE0=" + str(yotasage_rt.get_live_figure_count()))',
        ].join('\n'),
        { autoLoadPackages: false },
      );
      unsub();
      return { ready, run, stdout };
    });

    // 0. Boot invariants: MPLBACKEND set, PIL & matplotlib NOT eagerly imported
    await record(browserName, 'P4 Plots 0: MPLBACKEND configured & PIL/matplotlib lazy at boot', async () => {
      if (!bootRes.run.ok) return `boot probe failed: ${JSON.stringify(bootRes.run)}`;
      if (!bootRes.stdout.includes('MPLBACKEND=module://yotasage_rt.mpl_backend')) {
        return `unexpected MPLBACKEND: ${bootRes.stdout}`;
      }
      if (!bootRes.stdout.includes('HAS_PIL=False')) return `PIL eagerly imported at boot: ${bootRes.stdout}`;
      if (!bootRes.stdout.includes('HAS_MPL=False')) return `matplotlib eagerly imported at boot: ${bootRes.stdout}`;
      if (!bootRes.stdout.includes('LIVE0=0')) return `expected 0 live figures at boot: ${bootRes.stdout}`;
      return true;
    });

    // 1. 5 Matplotlib plot types (line, bar, scatter, imshow, 2x2 subplots) without touching disk
    await record(browserName, 'P4 Plots 1: 5 matplotlib plot types stream PNGs with zero disk writes', async () => {
      const res = await page.evaluate(async () => {
        const { client, plots, fsChanges } = window.__p4Test;
        plots.length = 0;
        fsChanges.length = 0;
        let stdout = '';
        const unsub = client.subscribe({ stdout: (t) => { stdout += t; } });
        const run = await client.run(
          [
            'import os',
            'import numpy as np',
            'import matplotlib.pyplot as plt',
            '',
            '# 1. Line plot',
            'fig, ax = plt.subplots(figsize=(3, 2), dpi=90)',
            'ax.plot([0, 1, 2, 3], [0, 1, 4, 9])',
            'ax.set_title("Line Plot")',
            'plt.show()',
            '',
            '# 2. Bar plot',
            'fig, ax = plt.subplots(figsize=(3, 2), dpi=90)',
            'ax.bar(["A", "B", "C"], [3, 7, 5])',
            'ax.set_title("Bar Plot")',
            'plt.show()',
            '',
            '# 3. Scatter plot',
            'fig, ax = plt.subplots(figsize=(3, 2), dpi=90)',
            'ax.scatter([1, 2, 3, 4], [4, 2, 3, 1])',
            'ax.set_title("Scatter Plot")',
            'plt.show()',
            '',
            '# 4. imshow',
            'fig, ax = plt.subplots(figsize=(3, 2), dpi=90)',
            'ax.imshow(np.arange(16).reshape(4, 4))',
            'ax.set_title("Imshow Plot")',
            'plt.show()',
            '',
            '# 5. 2x2 subplots',
            'fig, axes = plt.subplots(2, 2, figsize=(3.5, 2.5), dpi=90)',
            'for idx, a in enumerate(axes.flat):',
            '    a.plot([0, 1], [idx, idx + 1])',
            'fig.suptitle("Subplots 2x2")',
            'plt.show()',
            '',
            'files = sorted(f for f in os.listdir("/workspace") if f != "main.py")',
            'print("EXTRA_FILES=" + str(len(files)))',
          ].join('\n'),
        );
        unsub();
        const sigOk = (bytes) =>
          bytes instanceof Uint8Array &&
          bytes.byteLength > 100 &&
          bytes[0] === 0x89 &&
          bytes[1] === 0x50 &&
          bytes[2] === 0x4e &&
          bytes[3] === 0x47 &&
          bytes[4] === 0x0d &&
          bytes[5] === 0x0a &&
          bytes[6] === 0x1a &&
          bytes[7] === 0x0a;
        return {
          run,
          stdout,
          fsChangesCount: fsChanges.length,
          plots: plots.map((p) => ({
            plotId: p.plotId,
            title: p.title,
            width: p.width,
            height: p.height,
            byteLength: p.pngBytes.byteLength,
            sigOk: sigOk(p.pngBytes),
            canExportVector: p.canExportVector,
            source: p.source,
          })),
        };
      });
      if (!res.run.ok) return `5-plot run failed: ${JSON.stringify(res.run)}`;
      if (!res.stdout.includes('EXTRA_FILES=0')) return `unexpected workspace files written: ${res.stdout}`;
      if (res.fsChangesCount !== 0) return `expected 0 fs.changed events, got ${res.fsChangesCount}`;
      if (res.plots.length !== 5) return `expected 5 plots, got ${res.plots.length}`;
      const expectedTitles = ['Line Plot', 'Bar Plot', 'Scatter Plot', 'Imshow Plot', 'Subplots 2x2'];
      for (let i = 0; i < 5; i += 1) {
        const p = res.plots[i];
        if (!p.sigOk) return `plot ${i} missing valid PNG signature`;
        if (p.width <= 0 || p.height <= 0) return `plot ${i} invalid dims ${p.width}x${p.height}`;
        if (p.source !== 'matplotlib' || !p.canExportVector) return `plot ${i} bad metadata: ${JSON.stringify(p)}`;
        if (p.title !== expectedTitles[i]) return `plot ${i} title "${p.title}" !== "${expectedTitles[i]}"`;
      }
      return true;
    });

    // 2. Deterministic reference comparison (decode PNG via createImageBitmap + Canvas2D)
    await record(browserName, 'P4 Plots 2: deterministic matplotlib PNG pixel reference check', async () => {
      const res = await page.evaluate(async () => {
        const { client, plots } = window.__p4Test;
        plots.length = 0;
        const run = await client.run(
          [
            'import matplotlib.pyplot as plt',
            'from matplotlib.patches import Rectangle',
            'fig = plt.figure(figsize=(2, 2), dpi=100)',
            'ax = fig.add_axes([0, 0, 1, 1])',
            'ax.set_xlim(0, 1)',
            'ax.set_ylim(0, 1)',
            'ax.axis("off")',
            '# Bottom half (y in [0, 0.5]) solid blue #2563eb (37, 99, 235)',
            'ax.add_patch(Rectangle((0, 0), 1, 0.5, facecolor="#2563eb", edgecolor="none"))',
            '# Top half (y in [0.5, 1.0]) solid red #dc2626 (220, 38, 38)',
            'ax.add_patch(Rectangle((0, 0.5), 1, 0.5, facecolor="#dc2626", edgecolor="none"))',
            'plt.show()',
          ].join('\n'),
        );
        if (!run.ok || plots.length !== 1) return { run, count: plots.length };
        const plot = plots[0];
        const blob = new Blob([plot.pngBytes], { type: 'image/png' });
        const bmp = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx2d = canvas.getContext('2d');
        ctx2d.drawImage(bmp, 0, 0);
        bmp.close();
        const sample = (fx, fy) => {
          const x = Math.floor(canvas.width * fx);
          const y = Math.floor(canvas.height * fy);
          const d = ctx2d.getImageData(x, y, 1, 1).data;
          return [d[0], d[1], d[2], d[3]];
        };
        return {
          run,
          count: plots.length,
          plotId: plot.plotId,
          width: plot.width,
          height: plot.height,
          bmpW: canvas.width,
          bmpH: canvas.height,
          topPixel: sample(0.5, 0.25),
          bottomPixel: sample(0.5, 0.75),
        };
      });
      if (!res.run.ok) return `reference plot run failed: ${JSON.stringify(res.run)}`;
      if (res.count !== 1) return `expected 1 plot, got ${res.count}`;
      if (res.bmpW !== res.width || res.bmpH !== res.height) {
        return `decoded bitmap ${res.bmpW}x${res.bmpH} !== metadata ${res.width}x${res.height}`;
      }
      const close = (actual, expected, tol = 4) =>
        expected.every((v, i) => Math.abs(actual[i] - v) <= tol);
      if (!close(res.topPixel, [220, 38, 38, 255])) {
        return `top band color mismatch: got ${JSON.stringify(res.topPixel)}, want [220,38,38,255]`;
      }
      if (!close(res.bottomPixel, [37, 99, 235, 255])) {
        return `bottom band color mismatch: got ${JSON.stringify(res.bottomPixel)}, want [37,99,235,255]`;
      }
      return true;
    });

    // 3. PIL.Image.show() hook with pixel verification
    await record(browserName, 'P4 Plots 3: PIL.Image.show() streams PNG with exact dims & pixels', async () => {
      const res = await page.evaluate(async () => {
        const { client, plots } = window.__p4Test;
        plots.length = 0;
        const run = await client.run(
          [
            'from PIL import Image',
            'img = Image.new("RGB", (120, 80))',
            'px = img.load()',
            'for y in range(80):',
            '    for x in range(120):',
            '        px[x, y] = (16, 185, 129) if x < 60 else (245, 158, 11)',
            'img.show(title="Demo")',
          ].join('\n'),
        );
        if (!run.ok || plots.length !== 1) return { run, count: plots.length };
        const plot = plots[0];
        const blob = new Blob([plot.pngBytes], { type: 'image/png' });
        const bmp = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx2d = canvas.getContext('2d');
        ctx2d.drawImage(bmp, 0, 0);
        bmp.close();
        const left = [...ctx2d.getImageData(20, 40, 1, 1).data];
        const right = [...ctx2d.getImageData(100, 40, 1, 1).data];
        // Also confirm vector export cleanly rejects a Pillow plot
        const exp = await window.__pythonHarness.exportPlot(client, plot.plotId, 'svg');
        return {
          run,
          count: plots.length,
          plotId: plot.plotId,
          title: plot.title,
          width: plot.width,
          height: plot.height,
          source: plot.source,
          canExportVector: plot.canExportVector,
          bmpW: canvas.width,
          bmpH: canvas.height,
          left,
          right,
          pillowExportOk: exp.ok,
        };
      });
      if (!res.run.ok) return `PIL.Image.show run failed: ${JSON.stringify(res.run)}`;
      if (res.count !== 1) return `expected 1 pillow plot, got ${res.count}`;
      if (res.source !== 'pillow' || res.canExportVector !== false) {
        return `unexpected pillow metadata: ${JSON.stringify(res)}`;
      }
      if (res.title !== 'Demo') return `unexpected title "${res.title}"`;
      if (res.width !== 120 || res.height !== 80 || res.bmpW !== 120 || res.bmpH !== 80) {
        return `dimension mismatch: meta=${res.width}x${res.height}, bmp=${res.bmpW}x${res.bmpH}`;
      }
      const close = (a, b, tol = 2) => b.every((v, i) => Math.abs(a[i] - v) <= tol);
      if (!close(res.left, [16, 185, 129, 255]) || !close(res.right, [245, 158, 11, 255])) {
        return `pillow pixels mismatch: left=${JSON.stringify(res.left)} right=${JSON.stringify(res.right)}`;
      }
      if (res.pillowExportOk !== false) return 'expected SVG export on Pillow plot to return ok:false';
      return true;
    });

    // 4. Live SVG & PDF vector re-export
    await record(browserName, 'P4 Plots 4: live matplotlib SVG & PDF vector re-export', async () => {
      const res = await page.evaluate(async () => {
        const { client, plots } = window.__p4Test;
        plots.length = 0;
        const run = await client.run(
          [
            'import matplotlib.pyplot as plt',
            'fig, ax = plt.subplots(figsize=(3, 2), dpi=100)',
            'ax.plot([0, 1, 2], [2, 0, 2])',
            'ax.set_title("Vector Export")',
            'plt.show()',
          ].join('\n'),
        );
        if (!run.ok || plots.length !== 1) return { run, count: plots.length };
        const plotId = plots[0].plotId;
        const svg = await window.__pythonHarness.exportPlot(client, plotId, 'svg');
        const pdf = await window.__pythonHarness.exportPlot(client, plotId, 'pdf');
        const dec = new TextDecoder('utf-8');
        const svgText = svg.bytes ? dec.decode(svg.bytes) : '';
        const pdfHead = pdf.bytes ? dec.decode(pdf.bytes.subarray(0, 16)) : '';
        const pdfTail = pdf.bytes ? dec.decode(pdf.bytes.subarray(Math.max(0, pdf.bytes.byteLength - 32))) : '';
        return {
          run,
          svgOk: svg.ok,
          svgLen: svg.bytes ? svg.bytes.byteLength : 0,
          svgTrimStart: svgText.trimStart().slice(0, 24),
          svgHasClose: svgText.includes('</svg>'),
          pdfOk: pdf.ok,
          pdfLen: pdf.bytes ? pdf.bytes.byteLength : 0,
          pdfHead,
          pdfHasEof: pdfTail.includes('%%EOF'),
        };
      });
      if (!res.run.ok) return `vector export plot run failed: ${JSON.stringify(res.run)}`;
      if (!res.svgOk || res.svgLen < 100) return `SVG export failed: ${JSON.stringify(res)}`;
      if (!res.svgTrimStart.startsWith('<?xml') && !res.svgTrimStart.startsWith('<svg')) {
        return `unexpected SVG header: ${res.svgTrimStart}`;
      }
      if (!res.svgHasClose) return 'SVG missing closing </svg>';
      if (!res.pdfOk || res.pdfLen < 100) return `PDF export failed: ${JSON.stringify(res)}`;
      if (!res.pdfHead.startsWith('%PDF-')) return `unexpected PDF header: ${res.pdfHead}`;
      if (!res.pdfHasEof) return 'PDF missing %%EOF trailer';
      return true;
    });

    // 5. 100 plots in a row: bounded live-figure cap (<= 16), zero Gcf leaks, clean eviction
    await record(browserName, 'P4 Plots 5: 100 plots in a row (<= 16 live cap, 0 Gcf leaks, clean eviction)', async () => {
      const res = await page.evaluate(async () => {
        const { client, plots, dropped } = window.__p4Test;
        plots.length = 0;
        dropped.length = 0;
        let stdout = '';
        const unsub = client.subscribe({ stdout: (t) => { stdout += t; } });
        const run = await client.run(
          [
            'import matplotlib.pyplot as plt',
            'from matplotlib._pylab_helpers import Gcf',
            'import yotasage_rt.mpl_backend as mb',
            'for i in range(100):',
            '    fig, ax = plt.subplots(figsize=(2.0, 1.5), dpi=72)',
            '    ax.plot([0, 1, 2], [0, i % 10, (i * 2) % 10])',
            '    ax.set_title(f"Batch {i + 1}")',
            '    plt.show()',
            'print(f"LIVE={mb.get_live_figure_count()}")',
            'print(f"GCF={len(Gcf.get_all_fig_managers())}")',
          ].join('\n'),
        );
        unsub();
        if (!run.ok) return { run, count: plots.length, stdout };
        const allValidPng = plots.every(
          (p) =>
            p.pngBytes instanceof Uint8Array &&
            p.pngBytes.byteLength > 100 &&
            p.pngBytes[0] === 0x89 &&
            p.pngBytes[1] === 0x50 &&
            p.pngBytes[2] === 0x4e &&
            p.pngBytes[3] === 0x47,
        );
        const firstId = plots[0]?.plotId;
        const lastId = plots[plots.length - 1]?.plotId;
        const latestSvg = lastId ? await window.__pythonHarness.exportPlot(client, lastId, 'svg') : null;
        const evictedSvg = firstId ? await window.__pythonHarness.exportPlot(client, firstId, 'svg') : null;
        const latestSvgText = latestSvg?.bytes ? new TextDecoder().decode(latestSvg.bytes) : '';
        return {
          run,
          stdout,
          count: plots.length,
          allValidPng,
          droppedCount: dropped.length,
          firstId,
          lastId,
          latestSvgOk: Boolean(latestSvg?.ok),
          latestSvgValid: latestSvgText.includes('<svg') && latestSvgText.includes('</svg>'),
          evictedSvgOk: evictedSvg?.ok,
          evictedError: evictedSvg?.error || '',
        };
      });
      if (!res.run.ok) return `100-plot run failed: ${JSON.stringify(res.run)}`;
      if (res.count !== 100) return `expected 100 plot.new events, got ${res.count}`;
      if (!res.allValidPng) return 'not all 100 plots had valid PNG signatures';
      if (res.droppedCount !== 0) return `dropped ${res.droppedCount} worker messages during 100-plot batch`;
      const liveMatch = res.stdout.match(/LIVE=(\d+)/);
      const gcfMatch = res.stdout.match(/GCF=(\d+)/);
      const liveCount = liveMatch ? Number(liveMatch[1]) : -1;
      const gcfCount = gcfMatch ? Number(gcfMatch[1]) : -1;
      if (liveCount < 1 || liveCount > 16) return `expected 1..16 live figures, got ${liveCount}`;
      if (gcfCount !== 0) return `expected 0 Gcf managers remaining, got ${gcfCount}`;
      if (!res.latestSvgOk || !res.latestSvgValid) {
        return `latest plot (${res.lastId}) SVG export failed: ${JSON.stringify(res)}`;
      }
      if (res.evictedSvgOk !== false) {
        return `expected evicted plot (${res.firstId}) SVG export to fail cleanly, got ok=${res.evictedSvgOk}`;
      }
      return true;
    });

    await record(browserName, 'P4 Plots 6: zero uncaught pageerror events during plot checks', async () => {
      if (pageErrors.length > 0) return `pageerror: ${pageErrors.join(' | ')}`;
      return true;
    });

    await page.evaluate(() => {
      if (window.__p4Test?.client) {
        window.__p4Test.client.dispose();
        delete window.__p4Test;
      }
    });
  } finally {
    await ctx.close();
  }
}
