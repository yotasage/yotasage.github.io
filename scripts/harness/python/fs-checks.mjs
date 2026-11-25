// Part B (4): P3a Files Engine, Option 3B Storage Worker Persistence, Multi-File Imports,
// Force Stop survival, Web Locks, 50 MB non-blocking upload, and size cap verification
// across Edge, Firefox, and WebKit.
import { buildWorkerCsp } from '../../../lib/python/network.ts';
import { waitHarnessReady } from './corpus-checks.mjs';

export async function runFsChecks(browserName, browser, { primaryOrigin, record }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  try {
    // Capture response headers for /python/storage-worker.js
    let storageWorkerHeaders = null;
    page.on('response', (res) => {
      const u = new URL(res.url());
      if (u.origin === primaryOrigin && u.pathname === '/python/storage-worker.js') {
        storageWorkerHeaders = res.headers();
      }
    });

    await page.goto(`${primaryOrigin}/python/harness`, { waitUntil: 'domcontentloaded' });
    await waitHarnessReady(page, { expectIsolated: true });

    // Start cleanly with empty workspace
    await page.evaluate(async () => {
      const st = window.__pythonHarness.createStorageClient();
      await st.open();
      await st.clearWorkspace();
      await st.close();
    });

    // 0. Storage Worker receives COOP/COEP/CORP + strict Off CSP
    await record(browserName, 'P3 FS: storage-worker.js headers (COOP/COEP/CORP + strict Off CSP)', async () => {
      if (!storageWorkerHeaders) return 'did not capture /python/storage-worker.js response headers';
      const expectedCsp = buildWorkerCsp({ mode: 'off', hosts: [] });
      if (storageWorkerHeaders['content-security-policy'] !== expectedCsp) {
        return `CSP mismatch: got "${storageWorkerHeaders['content-security-policy']}", want "${expectedCsp}"`;
      }
      if (storageWorkerHeaders['cross-origin-embedder-policy'] !== 'require-corp') {
        return `COEP mismatch: ${storageWorkerHeaders['cross-origin-embedder-policy']}`;
      }
      if (storageWorkerHeaders['cross-origin-resource-policy'] !== 'same-origin') {
        return `CORP mismatch: ${storageWorkerHeaders['cross-origin-resource-policy']}`;
      }
      return true;
    });

    // 1. Files written via Storage Worker & Python survive a full page reload
    await record(browserName, 'P3 FS 1: Storage Worker & Python files survive full page reload', async () => {
      const before = await page.evaluate(async () => {
        const st = window.__pythonHarness.createStorageClient();
        await st.open();
        await st.write('notes/utf8.txt', 'Blåbærsyltetøy ÆØÅ 2026');
        await st.write('bin/sample.bin', new Uint8Array([1, 2, 3, 42, 255]));
        await st.write('old.txt', 'rename-me');
        await st.rename('old.txt', 'renamed.txt');
        await st.write('temp.txt', 'delete-me');
        await st.delete('temp.txt');

        const client = window.__pythonHarness.createClient({ storageClient: st });
        await client.start();
        const runRes = await client.run(
          [
            'with open("notes/utf8.txt", "r", encoding="utf-8") as f:',
            '    txt = f.read()',
            'with open("py_created.txt", "w", encoding="utf-8") as f:',
            '    f.write("from-python:" + txt)',
          ].join('\n'),
        );
        client.dispose();
        await st.close();
        return { runRes };
      });
      if (!before.runRes.ok) return `initial write run failed: ${JSON.stringify(before.runRes)}`;

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitHarnessReady(page, { expectIsolated: true });

      const after = await page.evaluate(async () => {
        const st = window.__pythonHarness.createStorageClient();
        await st.open();
        const utf8 = await st.readText('notes/utf8.txt');
        const binEntry = await st.read('bin/sample.bin');
        const renamed = await st.readText('renamed.txt');
        const deletedOld = await st.read('old.txt');
        const deletedTemp = await st.read('temp.txt');
        const pyCreated = await st.read('py_created.txt');
        const pyText = pyCreated?.bytes ? new TextDecoder().decode(pyCreated.bytes) : null;

        // Also verify Python worker hydrates them into /workspace on boot
        const client = window.__pythonHarness.createClient({ storageClient: st });
        await client.start();
        let stdout = '';
        const unsub = client.subscribe({ stdout: (t) => { stdout += t; } });
        const runRes = await client.run(
          'print(open("py_created.txt", encoding="utf-8").read())\nprint(list(open("bin/sample.bin", "rb").read()))',
        );
        unsub();
        client.dispose();
        await st.close();
        return {
          utf8,
          binBytes: binEntry?.bytes ? [...binEntry.bytes] : null,
          renamed,
          deletedOld,
          deletedTemp,
          pyCreatedByRun: pyCreated?.createdByRun,
          pyText,
          runRes,
          stdout,
        };
      });

      if (after.utf8 !== 'Blåbærsyltetøy ÆØÅ 2026') return `UTF-8 lost after reload: ${after.utf8}`;
      if (JSON.stringify(after.binBytes) !== '[1,2,3,42,255]') return `binary lost: ${JSON.stringify(after.binBytes)}`;
      if (after.renamed !== 'rename-me') return `renamed file lost: ${after.renamed}`;
      if (after.deletedOld !== null || after.deletedTemp !== null) return 'deleted files reappeared';
      if (after.pyText !== 'from-python:Blåbærsyltetøy ÆØÅ 2026') return `py_created lost: ${after.pyText}`;
      if (after.pyCreatedByRun !== true) return `expected createdByRun=true, got ${after.pyCreatedByRun}`;
      if (!after.runRes.ok || !after.stdout.includes('from-python:Blåbærsyltetøy ÆØÅ 2026')) {
        return `hydrated Python read failed: ${after.stdout}`;
      }
      return true;
    });

    // 2. Pre-run files AND closed mid-run writes survive Force Stop (zero WebKit IDB deadlock)
    await record(browserName, 'P3 FS 2: Pre-run & closed mid-run writes survive Force Stop + clean clear', async () => {
      const res = await page.evaluate(async () => {
        const st = window.__pythonHarness.createStorageClient();
        await st.open();
        await st.clearWorkspace();
        await st.write('pre_run.txt', 'saved-before-run');

        const client = window.__pythonHarness.createClient({ storageClient: st });
        await client.start();

        let forceStopPromise = null;
        const unsub = client.subscribe({
          stdout: (t) => {
            if (!forceStopPromise && t.includes('MID_WRITTEN')) {
              setTimeout(() => {
                forceStopPromise = client.forceStop();
              }, 40);
            }
          },
        });

        const code = [
          'with open("mid_run.txt", "w", encoding="utf-8") as f:',
          '    f.write("closed-before-force-stop")',
          'print("MID_WRITTEN", flush=True)',
          'while True:',
          '    pass',
        ].join('\n');

        const runRes = await client.run(code);
        unsub();
        if (forceStopPromise) await forceStopPromise;

        // Verify both pre_run.txt and mid_run.txt survived in Storage Worker AND restarted Python MEMFS
        const preInIdb = await st.readText('pre_run.txt');
        const midInIdb = await st.readText('mid_run.txt');

        let afterOut = '';
        const unsub2 = client.subscribe({ stdout: (t) => { afterOut += t; } });
        const verifyRun = await client.run(
          'print("VERIFY:" + open("pre_run.txt").read() + "|" + open("mid_run.txt").read())',
        );
        unsub2();
        client.dispose();
        await st.close();

        // Also test clearAllPythonData({ reload: false }) completes cleanly with zero WebKit IDB deadlock!
        await window.__pythonHarness.clearAllPythonData({ reload: false });
        let remainingPythonDbs = [];
        if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
          try {
            const dbs = await indexedDB.databases();
            remainingPythonDbs = dbs
              .map((d) => d.name || '')
              .filter((n) => n.toLowerCase().startsWith('python'));
          } catch {
            // ignore
          }
        }

        return {
          forceStopped: runRes.forceStopped,
          preInIdb,
          midInIdb,
          verifyRun,
          afterOut,
          remainingPythonDbs,
        };
      });

      if (!res.forceStopped) return 'expected forceStopped=true';
      if (res.preInIdb !== 'saved-before-run') return `pre_run.txt lost: ${res.preInIdb}`;
      if (res.midInIdb !== 'closed-before-force-stop') return `mid_run.txt lost: ${res.midInIdb}`;
      if (!res.verifyRun.ok || !res.afterOut.includes('VERIFY:saved-before-run|closed-before-force-stop')) {
        return `restarted MEMFS missing files: ${res.afterOut}`;
      }
      if (res.remainingPythonDbs.length > 0) {
        return `python* IDB databases remained after clear: ${JSON.stringify(res.remainingPythonDbs)}`;
      }
      return true;
    });

    // Close page so unregistered SW finishes tearing down cleanly before opening fresh Tier 1 page
    await page.close();
    const page2 = await ctx.newPage();
    page2.on('pageerror', (err) => pageErrors.push(String(err)));
    await page2.goto(`${primaryOrigin}/python/harness`, { waitUntil: 'domcontentloaded' });
    await waitHarnessReady(page2, { expectIsolated: true });

    // Verify clean DB reopen after clearAllPythonData (confirms zero WebKit IDB deadlock)
    await record(browserName, 'P3 FS 2b: Clean Storage Worker reopen after Force Stop + Clear All Data', async () => {
      const reopen = await page2.evaluate(async () => {
        const st = window.__pythonHarness.createStorageClient();
        const statsAfterClear = await st.open();
        await st.write('reborn.txt', 'ok');
        const reborn = await st.readText('reborn.txt');
        await st.clearWorkspace();
        await st.close();
        return { statsAfterClear, reborn };
      });
      if (reopen.statsAfterClear.entryCount !== 0 || reopen.reborn !== 'ok') {
        return `post-clear reopen failed: ${JSON.stringify(reopen)}`;
      }
      return true;
    });

    // 3. Multi-file project imports (main.py -> helper.py), edit helper.py -> immediate update
    await record(browserName, 'P3 FS 3: Multi-file imports & module purge after editing helper.py', async () => {
      const res = await page2.evaluate(async () => {
        const st = window.__pythonHarness.createStorageClient();
        await st.open();
        await st.clearWorkspace();
        await st.write('helper.py', 'def get_value():\n    return "V1-INITIAL"\n');
        await st.write('main.py', 'import helper\nprint("OUT:" + helper.get_value())\n');

        const client = window.__pythonHarness.createClient({ storageClient: st });
        await client.start();

        let out1 = '';
        const unsub1 = client.subscribe({ stdout: (t) => { out1 += t; } });
        const r1 = await client.run(undefined, { filename: 'main.py' });
        unsub1();

        // Edit helper.py via Storage Worker (mirrors live to MEMFS; no Pyodide reboot!)
        await st.write('helper.py', 'def get_value():\n    return "V2-UPDATED"\n');

        let out2 = '';
        const unsub2 = client.subscribe({ stdout: (t) => { out2 += t; } });
        const r2 = await client.run(undefined, { filename: 'main.py' });
        unsub2();

        client.dispose();
        await st.close();
        return { r1, r2, out1, out2 };
      });

      if (!res.r1.ok || !res.out1.includes('OUT:V1-INITIAL')) {
        return `first run mismatch: ${JSON.stringify(res.r1)} out=${res.out1}`;
      }
      if (!res.r2.ok || !res.out2.includes('OUT:V2-UPDATED')) {
        return `second run did not pick up edited helper.py: ${JSON.stringify(res.r2)} out=${res.out2}`;
      }
      return true;
    });

    // 4. Python writing/modifying/deleting files emits validated fs.changed
    await record(browserName, 'P3 FS 4: Python file writes emit validated fs.changed', async () => {
      const res = await page2.evaluate(async () => {
        const st = window.__pythonHarness.createStorageClient();
        await st.open();
        await st.clearWorkspace();
        await st.write('existing.txt', 'aaa');
        await st.write('victim.txt', 'bye');

        const client = window.__pythonHarness.createClient({ storageClient: st });
        await client.start();

        const changes = [];
        const unsub = client.subscribe({ fsChanged: (c) => changes.push(c) });
        const runRes = await client.run(
          [
            'import os',
            'with open("fresh_output.txt", "w", encoding="utf-8") as f:',
            '    f.write("hello-new")',
            'with open("existing.txt", "w", encoding="utf-8") as f:',
            '    f.write("bbb")',
            'os.remove("victim.txt")',
          ].join('\n'),
        );
        unsub();
        client.dispose();
        await st.close();
        return { runRes, changes };
      });

      if (!res.runRes.ok) return `run failed: ${JSON.stringify(res.runRes)}`;
      if (res.changes.length === 0) return 'fs.changed never fired';
      const last = res.changes[res.changes.length - 1];
      if (!last.created.includes('fresh_output.txt')) return `created missing fresh_output.txt: ${JSON.stringify(last)}`;
      if (!last.modified.includes('existing.txt')) return `modified missing existing.txt: ${JSON.stringify(last)}`;
      if (!last.deleted.includes('victim.txt')) return `deleted missing victim.txt: ${JSON.stringify(last)}`;
      return true;
    });

    // U2: deleteMany removes files and folders in one transaction, reports bad paths per item, keeps
    // the ledger (stats) right, and the Python worker's MEMFS follows; clearWorkspace + reseed too.
    await record(browserName, 'U2 FS: deleteMany (files + folder, nested, bad path, missing) mirrors to Python', async () => {
      const res = await page2.evaluate(async () => {
        const st = window.__pythonHarness.createStorageClient();
        await st.open();
        await st.clearWorkspace();
        await st.write('a.txt', 'aaaa');
        await st.write('b.txt', 'bb');
        await st.write('keep.txt', 'k');
        await st.write('d/x.txt', 'xxx');
        await st.write('d/sub/y.txt', 'y');

        const client = window.__pythonHarness.createClient({ storageClient: st });
        await client.start();
        const before = await st.stats();
        const del = await st.deleteMany(['a.txt', 'b.txt', 'd', 'd/x.txt', 'nope.txt', '../evil', 'a.txt']);
        const after = await st.stats();
        const list = (await st.list()).map((e) => e.path).sort();

        let out = '';
        const unsub = client.subscribe({ stdout: (t) => { out += t; } });
        const run = await client.run(
          'import os\nprint("LS=" + "|".join(sorted(os.listdir("."))))\n',
        );
        unsub();

        // Reset: clear everything, then seed main.py as the page does.
        await st.clearWorkspace();
        await st.write('main.py', 'print("seed")\n');
        let out2 = '';
        const unsub2 = client.subscribe({ stdout: (t) => { out2 += t; } });
        const run2 = await client.run('import os\nprint("LS2=" + "|".join(sorted(os.listdir("."))))\n');
        unsub2();
        const stats2 = await st.stats();
        client.dispose();
        await st.close();
        return { before, del, after, list, run, out, run2, out2, stats2 };
      });

      const { del } = res;
      if (JSON.stringify([...del.deleted].sort()) !== JSON.stringify(['a.txt', 'b.txt', 'd'])) return `deleted: ${JSON.stringify(del.deleted)}`;
      if (JSON.stringify(del.missing) !== JSON.stringify(['nope.txt'])) return `missing: ${JSON.stringify(del.missing)}`;
      if (del.failed.length !== 1 || del.failed[0].path !== '../evil' || del.failed[0].code !== 'INVALID_PATH') {
        return `failed: ${JSON.stringify(del.failed)}`;
      }
      // a, b, d, d/x.txt, d/sub, d/sub/y.txt
      if (del.deletedCount !== 6) return `deletedCount ${del.deletedCount}`;
      if (JSON.stringify(res.list) !== JSON.stringify(['keep.txt'])) return `left: ${JSON.stringify(res.list)}`;
      if (res.after.entryCount !== 1 || res.after.totalBytes !== 1) return `stats after: ${JSON.stringify(res.after)}`;
      if (res.after.rev !== res.before.rev + 1) return `rev ${res.before.rev} -> ${res.after.rev} (one transaction expected)`;
      // client.run(source) writes the source to main.py first.
      if (!res.run.ok || !/^LS=keep\.txt\|main\.py$/m.test(res.out)) return `Python sees: ${res.out} ${JSON.stringify(res.run)}`;
      if (!res.run2.ok || !res.out2.includes('LS2=main.py\n')) return `after reset Python sees: ${res.out2}`;
      if (res.stats2.entryCount !== 1) return `after reset entries ${res.stats2.entryCount}`;
      return true;
    });

    // 5. Second-tab Web Locks (python:workspace:default)
    await record(browserName, 'P3 FS 5: Second-tab Web Locks denies while open, grants after close', async () => {
      const tab1 = await ctx.newPage();
      const tab2 = await ctx.newPage();
      try {
        await tab1.goto(`${primaryOrigin}/python/harness`, { waitUntil: 'domcontentloaded' });
        await waitHarnessReady(tab1, { expectIsolated: true });
        await tab2.goto(`${primaryOrigin}/python/harness`, { waitUntil: 'domcontentloaded' });
        await waitHarnessReady(tab2, { expectIsolated: true });

        const lock1 = await tab1.evaluate(async () => {
          const handle = await window.__pythonHarness.acquireWorkspaceLock('default');
          window.__heldLock = handle;
          return { acquired: handle.acquired, supported: handle.supported, lockName: handle.lockName };
        });
        if (!lock1.supported || !lock1.acquired) {
          return `tab1 failed to acquire lock: ${JSON.stringify(lock1)}`;
        }

        const lock2WhileOpen = await tab2.evaluate(async () => {
          const handle = await window.__pythonHarness.acquireWorkspaceLock('default');
          return { acquired: handle.acquired, supported: handle.supported };
        });
        if (lock2WhileOpen.acquired !== false) {
          return `tab2 should have been denied while tab1 holds lock: ${JSON.stringify(lock2WhileOpen)}`;
        }

        // Close tab1 -> browser auto-releases Web Lock immediately
        await tab1.close();
        await new Promise((r) => setTimeout(r, 80));

        const lock2AfterClose = await tab2.evaluate(async () => {
          const handle = await window.__pythonHarness.acquireWorkspaceLock('default');
          const result = { acquired: handle.acquired, supported: handle.supported };
          handle.release();
          return result;
        });
        if (!lock2AfterClose.acquired) {
          return `tab2 failed to acquire lock after tab1 closed: ${JSON.stringify(lock2AfterClose)}`;
        }
        return true;
      } finally {
        await tab1.close().catch(() => {});
        await tab2.close().catch(() => {});
      }
    });

    // 6. 50 MB binary file upload via Storage Worker (0 main-thread freezes > 50 ms) & reload
    await record(browserName, 'P3 FS 6: 50 MB upload via Storage Worker (0 freezes > 50 ms) & reload', async () => {
      const upload = await page2.evaluate(async () => {
        const size = window.__pythonHarness.MAX_FILE_BYTES; // 50 MiB = 52,428,800 B
        const st = window.__pythonHarness.createStorageClient();
        await st.open();
        await st.clearWorkspace();

        const buf = new Uint8Array(size);
        buf[0] = 0x5a;
        buf[Math.floor(size / 2)] = 0xa5;
        buf[size - 1] = 0x3c;

        // Start 4 ms main-thread drift monitor right before transferable Storage Worker write.
        let lastTick = performance.now();
        let maxGapMs = 0;
        let gapsOver50 = 0;
        const interval = setInterval(() => {
          const now = performance.now();
          const gap = now - lastTick;
          if (gap > maxGapMs) maxGapMs = gap;
          if (gap > 50) gapsOver50 += 1;
          lastTick = now;
        }, 4);

        const t0 = performance.now();
        const writeRes = await st.write('big50.bin', buf);
        const writeMs = performance.now() - t0;
        clearInterval(interval);
        await st.close();

        return {
          writeMs,
          maxGapMs,
          gapsOver50,
          size: writeRes.entry.size,
          totalBytes: writeRes.stats.totalBytes,
        };
      });

      console.log(
        `    [${browserName}] 50 MB upload: write=${upload.writeMs.toFixed(0)} ms, maxMainBlock=${upload.maxGapMs.toFixed(1)} ms, gaps>50ms=${upload.gapsOver50}`,
      );
      if (upload.size !== 52428800 || upload.totalBytes !== 52428800) {
        return `50 MB size mismatch: ${JSON.stringify(upload)}`;
      }
      if (upload.gapsOver50 > 0) {
        return `main thread blocked > 50 ms (${upload.gapsOver50} gaps, max=${upload.maxGapMs.toFixed(1)} ms)`;
      }

      // Reload and verify 50 MB file persisted intact, then delete cleanly
      await page2.reload({ waitUntil: 'domcontentloaded' });
      await waitHarnessReady(page2, { expectIsolated: true });

      const reloaded = await page2.evaluate(async () => {
        const st = window.__pythonHarness.createStorageClient();
        await st.open();
        const entry = await st.read('big50.bin');
        const ok =
          entry !== null &&
          entry.bytes !== null &&
          entry.bytes.byteLength === 52428800 &&
          entry.bytes[0] === 0x5a &&
          entry.bytes[Math.floor(52428800 / 2)] === 0xa5 &&
          entry.bytes[52428800 - 1] === 0x3c;
        await st.delete('big50.bin');
        const statsAfter = await st.stats();
        await st.close();
        return { ok, statsAfter };
      });

      if (!reloaded.ok) return '50 MB file corrupted or missing after reload';
      if (reloaded.statsAfter.totalBytes !== 0) return `50 MB cleanup failed: ${JSON.stringify(reloaded.statsAfter)}`;
      return true;
    });

    // 7. Oversized file (> 50 MiB) rejected cleanly with CAP_EXCEEDED
    await record(browserName, 'P3 FS 7: Oversized file (> 50 MiB) rejected cleanly with CAP_EXCEEDED', async () => {
      const res = await page2.evaluate(async () => {
        const st = window.__pythonHarness.createStorageClient();
        await st.open();
        await st.clearWorkspace();
        const over = new Uint8Array(window.__pythonHarness.MAX_FILE_BYTES + 1);
        let code = null;
        let message = null;
        try {
          await st.write('too_big.bin', over);
        } catch (err) {
          code = err?.code || null;
          message = err?.message || String(err);
        }
        const stats = await st.stats();
        await st.close();
        return { code, message, stats };
      });

      if (res.code !== 'CAP_EXCEEDED') {
        return `expected CAP_EXCEEDED, got code=${res.code} msg=${res.message}`;
      }
      if (res.stats.entryCount !== 0 || res.stats.totalBytes !== 0) {
        return `workspace polluted after rejected write: ${JSON.stringify(res.stats)}`;
      }
      return true;
    });

    await record(browserName, 'P3 FS: Zero uncaught pageerrors during FS checks', async () => {
      if (pageErrors.length > 0) return pageErrors.slice(0, 3).join(' | ');
      return true;
    });
  } finally {
    await ctx.close();
  }
}
