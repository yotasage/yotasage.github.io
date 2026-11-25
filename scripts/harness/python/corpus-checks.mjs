// Part B (1 & 2): Full example corpus, Q4 scientific imports, REPL, SystemExit,
// 20-trial Soft Stop latency, Force Stop & crash recovery, and Tier 2 JSPI check.
import { createHash } from 'node:crypto';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export async function waitHarnessReady(page, { expectIsolated = true } = {}) {
  await page.waitForFunction(
    (needIso) => {
      const h = window.__pythonHarness;
      if (!h || !h.swResult) return false;
      if (needIso) return h.swResult.status === 'isolated' && window.crossOriginIsolated === true;
      return h.swResult.status !== 'reloading';
    },
    expectIsolated,
    { timeout: 30000 },
  );
}

export async function runCorpusChecks(browserName, browser, { primaryOrigin, record }) {
  const metrics = {
    stopTrialsMs: [],
    stopMedianMs: null,
    stopMinMs: null,
    stopP95Ms: null,
    stopMaxMs: null,
    sleepStopMs: null,
    asyncioStopMs: null,
    forceStopTotalMs: null,
    forceStopRestartMs: null,
    tier2Tier: null,
  };

  // --- Context 1: Standard isolated Tier 1 session ---
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  try {
    await page.goto(`${primaryOrigin}/python/harness`, { waitUntil: 'domcontentloaded' });
    await waitHarnessReady(page, { expectIsolated: true });

    // Boot a persistent client on window.__testClient
    const bootInfo = await page.evaluate(async () => {
      const client = window.__pythonHarness.createClient();
      window.__testClient = client;
      const ready = await client.start();
      return {
        ready,
        securityStatus: client.securityStatus,
        state: client.state,
        capabilities: window.__pythonHarness.capabilities,
      };
    });

    await record(browserName, 'Tier 1 boot & CSP confirmed', async () => {
      if (bootInfo.ready.tier !== 1) return `expected tier 1, got ${bootInfo.ready.tier}`;
      if (!bootInfo.ready.crossOriginIsolated) return 'worker crossOriginIsolated was false';
      if (!bootInfo.securityStatus?.cspConfirmed) return 'cspConfirmed was false';
      if (bootInfo.state !== 'ready') return `expected ready state, got ${bootInfo.state}`;
      return true;
    }, `Pyodide ${bootInfo.ready.pyodideVersion} / Python ${bootInfo.ready.pythonVersion}`);

    // Helper inside page to run code and capture stdout/stderr
    const runScript = async (code, options = {}) =>
      page.evaluate(
        async ({ src, opts }) => {
          const client = window.__testClient;
          let stdout = '';
          let stderr = '';
          const unsub = client.subscribe({
            stdout: (t) => { stdout += t; },
            stderr: (t) => { stderr += t; },
          });
          try {
            const res = await client.run(src, opts);
            return { res, stdout, stderr };
          } finally {
            unsub();
          }
        },
        { src: code, opts: options },
      );

    // 1. Hello
    await record(browserName, 'Corpus 1: hello', async () => {
      const r = await runScript('print("hello")');
      if (!r.res.ok || r.res.exitCode !== 0) return `exit ${r.res.exitCode}: ${r.stderr}`;
      if (!r.stdout.includes('hello')) return `stdout missing hello: ${JSON.stringify(r.stdout)}`;
      return true;
    });

    // 2. input() 3-turn loop with Norwegian UTF-8 + >64 KiB chunked paste + EOF
    await record(browserName, 'Corpus 2: input() loop (UTF-8 + 80 KiB paste + EOF)', async () => {
      const bigBase = 'Blåbærsyltetøy-ÆØÅ-0123456789-';
      const bigPaste = bigBase.repeat(Math.ceil(82000 / Buffer.byteLength(bigBase, 'utf8')));
      const bigBytes = Buffer.byteLength(bigPaste, 'utf8');
      const expectedSha = createHash('sha256').update(bigPaste, 'utf8').digest('hex');

      const out = await page.evaluate(
        async ({ big }) => {
          const client = window.__testClient;
          const inputs = ['Ola Nordmann', 'Blåbærsyltetøy ÆØÅ æøå', big];
          const promptsSeen = [];
          let stdout = '';
          let stderr = '';
          let turn = 0;

          const unsub = client.subscribe({
            stdout: (t) => { stdout += t; },
            stderr: (t) => { stderr += t; },
            stdinRequest: (_seq, mode) => {
              promptsSeen.push({ turn, mode, stdoutSoFar: stdout });
              if (turn < inputs.length) {
                client.sendStdin(inputs[turn]);
                turn += 1;
              } else {
                client.sendStdinEof();
              }
            },
          });

          const code = [
            'import hashlib, json',
            'answers = []',
            'for i in range(3):',
            '    answers.append(input(f"P{i}: "))',
            'eof_caught = False',
            'try:',
            '    input("EOF: ")',
            'except EOFError:',
            '    eof_caught = True',
            'payload = {',
            '    "a0": answers[0],',
            '    "a1": answers[1],',
            '    "a2_len": len(answers[2]),',
            '    "a2_bytes": len(answers[2].encode("utf-8")),',
            '    "a2_sha": hashlib.sha256(answers[2].encode("utf-8")).hexdigest(),',
            '    "eof_caught": eof_caught,',
            '}',
            'print("RESULT:" + json.dumps(payload, ensure_ascii=False))',
          ].join('\n');

          try {
            const res = await client.run(code);
            return { res, stdout, stderr, promptsSeen };
          } finally {
            unsub();
          }
        },
        { big: bigPaste },
      );

      if (!out.res.ok) return `run failed: ${out.stderr}`;
      if (out.promptsSeen.length !== 4) return `expected 4 stdin requests, got ${out.promptsSeen.length}`;
      if (!out.promptsSeen[0].stdoutSoFar.includes('P0: ')) return 'prompt P0 not flushed before input()';
      if (!out.promptsSeen[1].stdoutSoFar.includes('P1: ')) return 'prompt P1 not flushed before input()';
      if (!out.promptsSeen[2].stdoutSoFar.includes('P2: ')) return 'prompt P2 not flushed before input()';
      const markerIdx = out.stdout.indexOf('RESULT:');
      if (markerIdx < 0) return `missing RESULT marker in stdout: ${out.stdout.slice(-200)}`;
      const line = out.stdout.slice(markerIdx + 'RESULT:'.length).split('\n')[0].trim();
      const data = JSON.parse(line);
      if (data.a0 !== 'Ola Nordmann') return `turn 0 mismatch: ${data.a0}`;
      if (data.a1 !== 'Blåbærsyltetøy ÆØÅ æøå') return `UTF-8 mismatch: ${data.a1}`;
      if (data.a2_bytes !== bigBytes || data.a2_bytes <= 65536) return `byte length mismatch: ${data.a2_bytes} vs ${bigBytes}`;
      if (data.a2_sha !== expectedSha) return `80 KiB SHA-256 mismatch: ${data.a2_sha} vs ${expectedSha}`;
      if (!data.eof_caught) return 'EOFError was not raised on sendStdinEof()';
      return true;
    });

    // 3. Exception with filtered traceback
    await record(browserName, 'Corpus 3: exception traceback hides internal frames', async () => {
      const code = [
        'def inner(x):',
        '    return 10 / x',
        'def outer():',
        '    return inner(0)',
        'outer()',
      ].join('\n');
      const r = await runScript(code, { filename: 'crash_demo.py' });
      if (r.res.ok) return 'expected failure';
      const err = r.res.error;
      if (!err || err.type !== 'ZeroDivisionError') return `wrong error type: ${err?.type}`;
      const fns = err.frames.map((f) => f.fn);
      if (!fns.includes('outer') || !fns.includes('inner')) return `missing user frames: ${JSON.stringify(fns)}`;
      const files = err.frames.map((f) => f.file);
      if (!files.every((f) => f.endsWith('/crash_demo.py'))) return `unexpected frame files: ${JSON.stringify(files)}`;
      for (const banned of ['_pyodide', 'pyodide/', 'yotasage_rt', '<frozen runpy>']) {
        if (err.formatted.includes(banned)) return `traceback leaked internal frame ${banned}`;
      }
      return true;
    });

    // 4. Infinite loop + Soft Stop (20 trials, median < 300 ms)
    await record(browserName, 'Corpus 4: infinite loop + Soft Stop (20 trials, median < 300 ms)', async () => {
      const trials = [];
      for (let i = 0; i < 20; i += 1) {
        const res = await page.evaluate(async () => {
          const client = window.__testClient;
          let stopStart = 0;
          let stopPromise = null;
          const unsub = client.subscribe({
            stdout: (t) => {
              if (!stopPromise && t.includes('LOOP_READY')) {
                stopStart = performance.now();
                stopPromise = client.stop();
              }
            },
          });
          try {
            const runRes = await client.run('print("LOOP_READY", flush=True)\nwhile True:\n    pass\n');
            const elapsedMs = stopStart > 0 ? performance.now() - stopStart : -1;
            if (stopPromise) await stopPromise;
            return { runRes, elapsedMs };
          } finally {
            unsub();
          }
        });
        if (!res.runRes.interrupted || res.runRes.forceStopped) {
          return `trial ${i + 1}: expected soft interrupt, got ${JSON.stringify(res.runRes)}`;
        }
        if (res.elapsedMs < 0) return `trial ${i + 1}: LOOP_READY never fired`;
        trials.push(res.elapsedMs);
      }
      metrics.stopTrialsMs = trials;
      metrics.stopMinMs = Math.min(...trials);
      metrics.stopMedianMs = median(trials);
      metrics.stopP95Ms = percentile(trials, 95);
      metrics.stopMaxMs = Math.max(...trials);
      if (metrics.stopMedianMs >= 300) {
        return `median ${metrics.stopMedianMs.toFixed(1)} ms >= 300 ms`;
      }
      return true;
    });

    // 5. time.sleep(30) + Soft Stop (< 300 ms)
    await record(browserName, 'Corpus 5: time.sleep(30) + Soft Stop (< 300 ms)', async () => {
      const res = await page.evaluate(async () => {
        const client = window.__testClient;
        let stopStart = 0;
        let stopPromise = null;
        const unsub = client.subscribe({
          stdout: (t) => {
            if (!stopPromise && t.includes('SLEEP_START')) {
              setTimeout(() => {
                stopStart = performance.now();
                stopPromise = client.stop();
              }, 30);
            }
          },
        });
        try {
          const runRes = await client.run('import time\nprint("SLEEP_START", flush=True)\ntime.sleep(30)\n');
          const elapsedMs = stopStart > 0 ? performance.now() - stopStart : -1;
          if (stopPromise) await stopPromise;
          return { runRes, elapsedMs };
        } finally {
          unsub();
        }
      });
      metrics.sleepStopMs = res.elapsedMs;
      if (!res.runRes.interrupted || res.runRes.forceStopped) {
        return `expected soft interrupt, got ${JSON.stringify(res.runRes)}`;
      }
      if (res.elapsedMs < 0 || res.elapsedMs >= 300) {
        return `sleep stop latency ${res.elapsedMs.toFixed(1)} ms >= 300 ms`;
      }
      return true;
    });

    // 6. NumPy vs JS reference (< 1e-12) + scipy, pandas, sympy offline auto-load smoke
    await record(browserName, 'Corpus 6: NumPy vs JS (1e-12) + scipy/pandas/sympy offline', async () => {
      // JS reference calculation
      const n = 200;
      let jsTrigSum = 0;
      let jsDot = 0;
      for (let k = 0; k < n; k += 1) {
        const x = (k + 1) * 0.037;
        const y = Math.cos(x * 1.3);
        jsTrigSum += Math.sin(x) * Math.sin(x) + Math.cos(x) * Math.cos(x);
        jsDot += x * y;
      }
      // Symmetric 2x2 matrix [[4, 1], [1, 3]] eigenvalues: (7 +- sqrt(5)) / 2
      const jsEig0 = (7 - Math.sqrt(5)) / 2;
      const jsEig1 = (7 + Math.sqrt(5)) / 2;

      const code = [
        'import json, numpy as np, scipy.linalg, pandas as pd, sympy as sp',
        'k = np.arange(1, 201, dtype=np.float64)',
        'x = k * 0.037',
        'y = np.cos(x * 1.3)',
        'trig_sum = float(np.sum(np.sin(x) ** 2 + np.cos(x) ** 2))',
        'dot = float(np.dot(x, y))',
        'eigs = np.linalg.eigvalsh(np.array([[4.0, 1.0], [1.0, 3.0]])).tolist()',
        'det = float(scipy.linalg.det(np.array([[3.0, 2.0], [1.0, 4.0]])))',
        'df = pd.DataFrame({"g": ["a", "b", "a"], "v": [10, 20, 5]})',
        'grp = df.groupby("g")["v"].sum().to_dict()',
        's = sp.Symbol("s")',
        'deriv = str(sp.diff(s**3 + 2*s, s))',
        'print("NUMPY_OUT:" + json.dumps({"trig": trig_sum, "dot": dot, "eigs": eigs, "det": det, "grp": grp, "deriv": deriv}))',
      ].join('\n');

      const r = await runScript(code);
      if (!r.res.ok) return `scientific import/run failed: ${r.stderr}`;
      const line = r.stdout.split('\n').find((l) => l.startsWith('NUMPY_OUT:'));
      if (!line) return `missing NUMPY_OUT in ${r.stdout}`;
      const d = JSON.parse(line.slice('NUMPY_OUT:'.length));
      if (Math.abs(d.trig - jsTrigSum) > 1e-12) return `trig diff ${Math.abs(d.trig - jsTrigSum)}`;
      if (Math.abs(d.dot - jsDot) > 1e-12) return `dot diff ${Math.abs(d.dot - jsDot)}`;
      if (Math.abs(d.eigs[0] - jsEig0) > 1e-12 || Math.abs(d.eigs[1] - jsEig1) > 1e-12) {
        return `eig diff ${JSON.stringify(d.eigs)}`;
      }
      if (Math.abs(d.det - 10.0) > 1e-12) return `scipy det wrong: ${d.det}`;
      if (d.grp.a !== 15 || d.grp.b !== 20) return `pandas groupby wrong: ${JSON.stringify(d.grp)}`;
      if (d.deriv !== '3*s**2 + 2') return `sympy diff wrong: ${d.deriv}`;
      return true;
    });

    // 7. Matplotlib Agg plot saved to /workspace/plot.png
    await record(browserName, 'Corpus 7: Matplotlib Agg PNG (> 2 KB, valid header)', async () => {
      const code = [
        'import json, matplotlib',
        'matplotlib.use("Agg")',
        'import matplotlib.pyplot as plt, numpy as np',
        'x = np.linspace(0, 2 * np.pi, 100)',
        'fig, ax = plt.subplots(figsize=(4, 3), dpi=100)',
        'ax.plot(x, np.sin(x), label="sin")',
        'ax.set_title("Harness Plot")',
        'ax.legend()',
        'fig.savefig("/workspace/plot.png")',
        'plt.close(fig)',
        'data = open("/workspace/plot.png", "rb").read()',
        'print("PLOT:" + json.dumps({"size": len(data), "hdr": list(data[:8])}))',
      ].join('\n');
      const r = await runScript(code);
      if (!r.res.ok) return `matplotlib failed: ${r.stderr}`;
      const line = r.stdout.split('\n').find((l) => l.startsWith('PLOT:'));
      if (!line) return 'missing PLOT output';
      const d = JSON.parse(line.slice('PLOT:'.length));
      const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];
      if (JSON.stringify(d.hdr) !== JSON.stringify(pngMagic)) return `bad PNG magic: ${JSON.stringify(d.hdr)}`;
      if (d.size <= 2048) return `PNG too small: ${d.size} bytes`;
      return true;
    });

    // 8. Pillow (PIL.Image) RGB PNG + JPEG round trip
    await record(browserName, 'Corpus 8: Pillow RGB PNG & JPEG round trip', async () => {
      const code = [
        'import json',
        'from PIL import Image',
        'img = Image.new("RGB", (32, 24), (20, 140, 220))',
        'img.putpixel((5, 7), (255, 10, 30))',
        'img.save("/workspace/test.png", format="PNG")',
        'img.save("/workspace/test.jpg", format="JPEG", quality=95)',
        'p1 = Image.open("/workspace/test.png")',
        'p2 = Image.open("/workspace/test.jpg")',
        'print("PIL:" + json.dumps({"png_size": list(p1.size), "png_px": list(p1.getpixel((5, 7))), "png_bg": list(p1.getpixel((0, 0))), "jpg_size": list(p2.size), "jpg_bg": list(p2.getpixel((20, 12)))}))',
      ].join('\n');
      const r = await runScript(code);
      if (!r.res.ok) return `Pillow failed: ${r.stderr}`;
      const line = r.stdout.split('\n').find((l) => l.startsWith('PIL:'));
      if (!line) return 'missing PIL output';
      const d = JSON.parse(line.slice('PIL:'.length));
      if (JSON.stringify(d.png_px) !== '[255,10,30]') return `PNG pixel mismatch: ${JSON.stringify(d.png_px)}`;
      if (JSON.stringify(d.png_bg) !== '[20,140,220]') return `PNG bg mismatch: ${JSON.stringify(d.png_bg)}`;
      if (Math.abs(d.jpg_bg[0] - 20) > 15 || Math.abs(d.jpg_bg[1] - 140) > 15 || Math.abs(d.jpg_bg[2] - 220) > 15) {
        return `JPEG bg drifted too far: ${JSON.stringify(d.jpg_bg)}`;
      }
      return true;
    });

    // 9. CSV round trip
    await record(browserName, 'Corpus 9: CSV round trip (DictReader)', async () => {
      const code = [
        'import csv, json',
        'rows = [{"name": "Ås, Norway", "val": "42", "note": "a \\"quoted\\" field"}, {"name": "Bergen", "val": "99", "note": "plain"}]',
        'with open("/workspace/data.csv", "w", encoding="utf-8", newline="") as f:',
        '    w = csv.DictWriter(f, fieldnames=["name", "val", "note"])',
        '    w.writeheader()',
        '    w.writerows(rows)',
        'with open("/workspace/data.csv", "r", encoding="utf-8", newline="") as f:',
        '    back = list(csv.DictReader(f))',
        'assert back == rows, f"mismatch: {back!r}"',
        'print("CSV_OK:" + json.dumps(back, ensure_ascii=False))',
      ].join('\n');
      const r = await runScript(code);
      if (!r.res.ok || !r.stdout.includes('CSV_OK:')) return `CSV failed: ${r.stderr}`;
      return true;
    });

    // 10. asyncio (sleep, gather, create_task) + asyncio.sleep(30) Soft Stop (< 300 ms)
    await record(browserName, 'Corpus 10: asyncio (gather/create_task) + Soft Stop (< 300 ms)', async () => {
      const code = [
        'import asyncio, json',
        'async def worker(name, delay):',
        '    await asyncio.sleep(delay)',
        '    return f"{name}-done"',
        'async def main():',
        '    t1 = asyncio.create_task(worker("a", 0.05))',
        '    t2 = asyncio.create_task(worker("b", 0.02))',
        '    res = await asyncio.gather(t1, t2)',
        '    return res',
        'print("ASYNC_OUT:" + json.dumps(asyncio.run(main())))',
      ].join('\n');
      const r = await runScript(code);
      if (!r.res.ok) return `asyncio.run failed: ${r.stderr}`;
      if (!r.stdout.includes('ASYNC_OUT:["a-done", "b-done"]')) return `unexpected asyncio output: ${r.stdout}`;

      const stopRes = await page.evaluate(async () => {
        const client = window.__testClient;
        let stopStart = 0;
        let stopPromise = null;
        const unsub = client.subscribe({
          stdout: (t) => {
            if (!stopPromise && t.includes('ASYNC_SLEEP')) {
              setTimeout(() => {
                stopStart = performance.now();
                stopPromise = client.stop();
              }, 30);
            }
          },
        });
        try {
          const runRes = await client.run(
            'import asyncio\nasync def main():\n    print("ASYNC_SLEEP", flush=True)\n    await asyncio.sleep(30)\nasyncio.run(main())\n',
          );
          const elapsedMs = stopStart > 0 ? performance.now() - stopStart : -1;
          if (stopPromise) await stopPromise;
          return { runRes, elapsedMs };
        } finally {
          unsub();
        }
      });
      metrics.asyncioStopMs = stopRes.elapsedMs;
      if (!stopRes.runRes.interrupted || stopRes.runRes.forceStopped) {
        return `asyncio.sleep(30) expected soft interrupt, got ${JSON.stringify(stopRes.runRes)}`;
      }
      if (stopRes.elapsedMs < 0 || stopRes.elapsedMs >= 300) {
        return `asyncio stop latency ${stopRes.elapsedMs.toFixed(1)} ms >= 300 ms`;
      }
      return true;
    });

    // 11. SystemExit(0) and SystemExit(2)
    await record(browserName, 'SystemExit(0) & SystemExit(2) clean handling', async () => {
      const r0 = await runScript('import sys\nsys.exit(0)');
      if (!r0.res.ok || r0.res.exitCode !== 0) return `SystemExit(0) wrong: ${JSON.stringify(r0.res)}`;
      const r2 = await runScript('import sys\nsys.exit(2)');
      if (r2.res.ok || r2.res.exitCode !== 2) return `SystemExit(2) wrong: ${JSON.stringify(r2.res)}`;
      const alive = await runScript('print("still-alive")');
      if (!alive.res.ok || !alive.stdout.includes('still-alive')) return 'worker broken after SystemExit';
      return true;
    });

    // 12. REPL (__main__ sharing, multi-line incomplete/complete, completions)
    await record(browserName, 'REPL: __main__ sharing, multi-line & completions', async () => {
      const r = await runScript('shared_var = 41\ndef my_helper_fn(v): return v * 2\n');
      if (!r.res.ok) return `setup run failed: ${r.stderr}`;

      const replOut = await page.evaluate(async () => {
        const client = window.__testClient;
        let out = '';
        const unsub = client.subscribe({ stdout: (t) => { out += t; } });
        try {
          const p1 = await client.replPush('shared_var + 1');
          const p2 = await client.replPush('def repl_add(a, b):');
          const p3 = await client.replPush('    return a + b');
          const p4 = await client.replPush('');
          const p5 = await client.replPush('repl_add(20, 22)');
          const p6 = await client.replPush('print("repl-print-ok")');
          const comp = await client.replComplete('my_help');
          return { p1, p2, p3, p4, p5, p6, comp, out };
        } finally {
          unsub();
        }
      });

      if (replOut.p1.status !== 'complete') return `p1 status ${replOut.p1.status}`;
      if (replOut.p2.status !== 'incomplete') return `p2 expected incomplete, got ${replOut.p2.status}`;
      if (replOut.p3.status !== 'incomplete') return `p3 expected incomplete, got ${replOut.p3.status}`;
      if (replOut.p4.status !== 'complete') return `p4 expected complete, got ${replOut.p4.status}`;
      if (replOut.p5.status !== 'complete') return `p5 expected complete, got ${replOut.p5.status}`;
      if (replOut.p6.status !== 'complete') return `p6 expected complete, got ${replOut.p6.status}`;
      if (!replOut.out.includes('42') || !replOut.out.includes('repl-print-ok')) {
        return `REPL stdout missing expected output: ${JSON.stringify(replOut.out)}`;
      }
      if (!replOut.comp.completions.some((c) => c.includes('my_helper_fn'))) {
        return `completions missing my_helper_fn: ${JSON.stringify(replOut.comp)}`;
      }
      return true;
    });

    // 13. Force Stop escalation on uninterruptible native NumPy SVD + warm restart (< 3000 ms)
    await record(browserName, 'Force Stop escalation & warm restart (< 3000 ms)', async () => {
      // Preload numpy before timing Force Stop so native SVD runs immediately
      await runScript('import numpy as np; _ = np.zeros(2)');

      const fsRes = await page.evaluate(async () => {
        const client = window.__testClient;
        let stopStart = 0;
        let escalationAt = 0;
        let stopPromise = null;
        const unsub = client.subscribe({
          stdout: (t) => {
            if (!stopPromise && t.includes('SVD_START')) {
              setTimeout(() => {
                stopStart = performance.now();
                stopPromise = client.stop();
              }, 50);
            }
          },
          state: (st) => {
            if (st === 'booting' && stopStart > 0 && escalationAt === 0) {
              escalationAt = performance.now();
            }
          },
        });
        try {
          const code = [
            'import numpy as np',
            'rng = np.random.default_rng(0)',
            'A = rng.standard_normal((1100, 1100))',
            'print("SVD_START", flush=True)',
            'for _ in range(10):',
            '    np.linalg.svd(A)',
          ].join('\n');
          const runRes = await client.run(code);
          if (stopPromise) await stopPromise;
          const readyAt = performance.now();
          let afterOut = '';
          const unsub2 = client.subscribe({ stdout: (t) => { afterOut += t; } });
          const afterRes = await client.run('print("after-force-stop")');
          unsub2();
          return {
            runRes,
            afterRes,
            afterOut,
            totalMs: readyAt - stopStart,
            restartMs: escalationAt > 0 ? readyAt - escalationAt : readyAt - stopStart,
          };
        } finally {
          unsub();
        }
      });

      metrics.forceStopTotalMs = fsRes.totalMs;
      metrics.forceStopRestartMs = fsRes.restartMs;
      if (!fsRes.runRes.forceStopped || !fsRes.runRes.interrupted) {
        return `expected forceStopped=true, got ${JSON.stringify(fsRes.runRes)}`;
      }
      if (!fsRes.afterRes.ok || !fsRes.afterOut.includes('after-force-stop')) {
        return `post-force-stop run failed: ${JSON.stringify(fsRes.afterRes)} out=${fsRes.afterOut}`;
      }
      if (fsRes.restartMs >= 3000) {
        return `warm restart took ${fsRes.restartMs.toFixed(0)} ms >= 3000 ms`;
      }
      return true;
    });

    // 14. Simulated unexpected worker crash/error -> crashed state -> restart() recovery
    await record(browserName, 'Unexpected worker crash & restart() recovery', async () => {
      const crashOut = await page.evaluate(async () => {
        const client = window.__testClient;
        let crashReason = null;
        let sawCrashedState = false;
        const crashPromise = new Promise((resolve) => {
          const unsub = client.subscribe({
            state: (st) => {
              if (st === 'crashed') sawCrashedState = true;
            },
            crash: (reason) => {
              crashReason = reason;
              unsub();
              resolve(reason);
            },
          });
          setTimeout(() => {
            unsub();
            resolve(null);
          }, 5000);
        });

        await client.run([
          'import js',
          'from pyodide.ffi import create_once_callable',
          'def boom():',
          '    raise RuntimeError("simulated-uncaught-worker-crash")',
          'js.setTimeout(create_once_callable(boom), 20)',
        ].join('\n'));

        await crashPromise;
        const stateAfterCrash = client.state;
        const readyAfterRestart = await client.restart();
        let afterOut = '';
        const unsub2 = client.subscribe({ stdout: (t) => { afterOut += t; } });
        const afterRun = await client.run('print("after-crash-recovery")');
        unsub2();
        return {
          crashReason,
          sawCrashedState,
          stateAfterCrash,
          stateAfterRestart: client.state,
          readyAfterRestart,
          afterRun,
          afterOut,
        };
      });

      if (!crashOut.sawCrashedState || crashOut.stateAfterCrash !== 'crashed') {
        return `did not transition to crashed (state=${crashOut.stateAfterCrash}, reason=${crashOut.crashReason})`;
      }
      if (crashOut.stateAfterRestart !== 'ready' || !crashOut.afterRun.ok || !crashOut.afterOut.includes('after-crash-recovery')) {
        return `recovery failed: ${JSON.stringify(crashOut.afterRun)}`;
      }
      return true;
    });

    await record(browserName, 'Zero uncaught pageerrors during corpus run', async () => {
      if (pageErrors.length > 0) return pageErrors.slice(0, 3).join(' | ');
      return true;
    });

    await page.evaluate(() => window.__testClient?.dispose());
  } finally {
    await ctx.close();
  }

  // --- Context 2: Tier 2 JSPI check (serviceWorkers: 'block') ---
  const t2Ctx = await browser.newContext({ serviceWorkers: 'block' });
  const t2Page = await t2Ctx.newPage();
  try {
    await t2Page.goto(`${primaryOrigin}/python/harness`, { waitUntil: 'domcontentloaded' });
    await waitHarnessReady(t2Page, { expectIsolated: false });

    await record(browserName, 'Tier 2 (SW blocked): fail-closed gate & JSPI input()', async () => {
      const res = await t2Page.evaluate(async () => {
        const swStatus = window.__pythonHarness.swResult?.status;
        const client = window.__pythonHarness.createClient();
        const ready = await client.start();
        const securityStatus = client.securityStatus;
        const stateBeforeOverride = client.state;
        const blockedFlag = client.isFailClosedBlocked;

        let blockedError = null;
        try {
          await client.run('print("should-not-run")');
        } catch (err) {
          blockedError = String(err);
        }

        let jspiOut = '';
        let jspiModes = [];
        let jspiRes = null;
        if (ready.tier === 2) {
          const unsub = client.subscribe({
            stdout: (t) => { jspiOut += t; },
            stdinRequest: (_seq, mode) => {
              jspiModes.push(mode);
              client.sendStdin('Ada æøå');
            },
          });
          jspiRes = await client.run(
            'name = input("Who? ")\nprint(f"HI:{name}")\n',
            { allowUnconfirmed: true },
          );
          unsub();
        }
        client.dispose();
        return {
          swStatus,
          ready,
          securityStatus,
          stateBeforeOverride,
          blockedFlag,
          blockedError,
          jspiOut,
          jspiModes,
          jspiRes,
        };
      });

      metrics.tier2Tier = res.ready.tier;
      if (res.swStatus !== 'blocked') return `expected swResult blocked, got ${res.swStatus}`;
      if (res.ready.tier !== 2 && res.ready.tier !== 3) return `expected tier 2 or 3, got ${res.ready.tier}`;
      if (res.securityStatus?.cspConfirmed !== false) return 'expected cspConfirmed === false';
      if (!res.blockedFlag || res.stateBeforeOverride !== 'blocked') {
        return `expected blocked state, got ${res.stateBeforeOverride} / ${res.blockedFlag}`;
      }
      if (!res.blockedError || !res.blockedError.includes('fail-closed')) {
        return `run() was not blocked by fail-closed gate: ${res.blockedError}`;
      }
      if (res.ready.tier === 2) {
        if (!res.jspiRes?.ok) return `Tier 2 JSPI run failed: ${JSON.stringify(res.jspiRes)}`;
        if (res.jspiModes[0] !== 'jspi') return `expected jspi mode, got ${JSON.stringify(res.jspiModes)}`;
        if (!res.jspiOut.includes('Who? ') || !res.jspiOut.includes('HI:Ada æøå')) {
          return `Tier 2 JSPI output mismatch: ${JSON.stringify(res.jspiOut)}`;
        }
      }
      return true;
    });
  } finally {
    await t2Ctx.close();
  }

  return metrics;
}
