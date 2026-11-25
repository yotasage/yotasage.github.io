// Part A: Pure-Node unit checks for lib/python/{network,protocol,tiers,paths,zip,examples}
// and public/python/coi-sw.js CSP parity.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { zipSync } from 'fflate';

import {
  getPythonExample,
  getPythonExampleTagKey,
  PYTHON_EXAMPLE_TAGS,
  PYTHON_EXAMPLES,
} from '../../../lib/python/examples/index.ts';
import { en as examplesEn, nb as examplesNb } from '../../../lib/ui/i18n/python-examples.ts';
import {
  buildNetworkPolicyUrl,
  buildPageCsp,
  buildWorkerCsp,
  parseNetworkPolicyFromSearch,
  parseSelectedHosts,
  validateSelectedHost,
} from '../../../lib/python/network.ts';
import {
  ancestorDirs,
  baseName,
  isDangerousUploadExt,
  MAX_PATH_DEPTH,
  MAX_PATH_LENGTH,
  normalizeWorkspacePath,
  parentDir,
} from '../../../lib/python/paths.ts';
import {
  MAX_COMPLETIONS,
  MAX_COMPLETION_ITEM_CHARS,
  MAX_ERROR_TEXT_CHARS,
  MAX_LINK_URL_CHARS,
  MAX_PLOT_BYTES,
  MAX_PLOT_DIM,
  MAX_PLOT_ID_CHARS,
  MAX_PLOT_TITLE_CHARS,
  MAX_STATUS_TEXT_CHARS,
  MAX_STREAM_CHUNK_CHARS,
  MAX_TRACEBACK_FRAMES,
  validateWorkerMessage,
} from '../../../lib/python/protocol.ts';
import { detectCapabilityTier } from '../../../lib/python/tiers.ts';
import { exportWorkspaceZip, importZipBytes } from '../../../lib/python/zip.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function loadServiceWorkerHelpers() {
  const swPath = resolve(repoRoot, 'public/python/coi-sw.js');
  const source = readFileSync(swPath, 'utf8');
  const sandbox = {
    self: {
      location: { origin: 'http://localhost:3023' },
      addEventListener() {},
      clients: { get: async () => null },
    },
    URL,
    Headers,
    Response,
    fetch: async () => new Response(''),
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    `${source}\n;globalThis.__swExports = { parseNetworkMode, buildPageCsp, buildWorkerCsp, buildConnectSrc };`,
    ctx,
    { filename: swPath },
  );
  return sandbox.__swExports;
}

export async function runUnitChecks() {
  let passed = 0;
  let failed = 0;
  const failures = [];

  const check = async (name, fn) => {
    try {
      await fn();
      passed += 1;
      console.log(`  PASS [unit] ${name}`);
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`[unit] ${name}: ${msg}`);
      console.log(`  FAIL [unit] ${name}: ${msg}`);
    }
  };

  // 1. network.ts: parseNetworkPolicyFromSearch
  await check('network.ts: parseNetworkPolicyFromSearch modes & invalid inputs', () => {
    assert.deepEqual(parseNetworkPolicyFromSearch(''), { mode: 'off', hosts: [] });
    assert.deepEqual(parseNetworkPolicyFromSearch('?'), { mode: 'off', hosts: [] });
    assert.deepEqual(parseNetworkPolicyFromSearch('?net=off'), { mode: 'off', hosts: [] });
    assert.deepEqual(parseNetworkPolicyFromSearch('?net=pkg'), { mode: 'pkg', hosts: [] });
    assert.deepEqual(parseNetworkPolicyFromSearch('?net=all'), { mode: 'all', hosts: [] });
    assert.deepEqual(parseNetworkPolicyFromSearch('?net=hosts&hosts=api.example.com,b.org'), {
      mode: 'hosts',
      hosts: ['api.example.com', 'b.org'],
    });
    assert.deepEqual(
      parseNetworkPolicyFromSearch('?net=hosts&hosts=API.Example.COM,b.org,api.example.com'),
      { mode: 'hosts', hosts: ['api.example.com', 'b.org'] },
    );
    assert.deepEqual(parseNetworkPolicyFromSearch('?net=invalid'), { mode: 'off', hosts: [] });
    assert.deepEqual(parseNetworkPolicyFromSearch('?net=hosts'), { mode: 'off', hosts: [] });
    assert.deepEqual(
      parseNetworkPolicyFromSearch('?net=hosts&hosts=127.0.0.1,localhost,*.evil.com,http://a.com'),
      { mode: 'off', hosts: [] },
    );
    const six = parseNetworkPolicyFromSearch(
      '?net=hosts&hosts=a.com,b.com,c.com,d.com,e.com,f.com,g.com',
    );
    assert.equal(six.mode, 'hosts');
    assert.deepEqual(six.hosts, ['a.com', 'b.com', 'c.com', 'd.com', 'e.com']);
  });

  // 2. network.ts: validateSelectedHost & buildNetworkPolicyUrl
  await check('network.ts: validateSelectedHost accept/reject matrix', () => {
    const validCases = [
      ['api.example.com', 'api.example.com'],
      ['B.ORG', 'b.org'],
      ['https://api.example.com', 'api.example.com'],
      ['https://api.example.com/', 'api.example.com'],
      ['sub-1.domain-2.co.uk', 'sub-1.domain-2.co.uk'],
    ];
    for (const [input, expected] of validCases) {
      const res = validateSelectedHost(input);
      assert.equal(res.ok, true, `Expected valid for ${input}`);
      if (res.ok) assert.equal(res.host, expected);
    }

    const invalidCases = [
      '',
      '   ',
      '127.0.0.1',
      '8.8.8.8',
      '[::1]',
      '::1',
      '*.example.com',
      '*',
      'example.com:443',
      'https://example.com:8443',
      'example.com/path',
      'https://example.com/path',
      'example.com?q=1',
      'example.com#frag',
      'user@example.com',
      'http://example.com',
      'ftp://example.com',
      'localhost',
      'sub.localhost',
      'intranet',
      `${'a'.repeat(64)}.example.com`,
      `${'a.'.repeat(130)}com`,
    ];
    for (const bad of invalidCases) {
      const res = validateSelectedHost(bad);
      assert.equal(res.ok, false, `Expected invalid for ${JSON.stringify(bad)}`);
    }

    assert.deepEqual(
      parseSelectedHosts('a.com,a.com,b.com,c.com,d.com,e.com,f.com'),
      ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'],
    );
    const url = buildNetworkPolicyUrl('/python/main', {
      mode: 'hosts',
      hosts: ['https://a.com', 'a.com', 'b.org', '127.0.0.1', 'c.org', 'd.org', 'e.org', 'f.org'],
    });
    assert.equal(url, '/python/main?net=hosts&hosts=a.com%2Cb.org%2Cc.org%2Cd.org%2Ce.org');
  });

  // 3. network.ts <-> public/python/coi-sw.js CSP parity & invariants
  await check('network.ts vs public/python/coi-sw.js CSP parity & security invariants', () => {
    const sw = loadServiceWorkerHelpers();
    const searches = [
      '',
      '?net=pkg',
      '?net=hosts&hosts=api.example.com,b.org',
      '?net=hosts&hosts=127.0.0.1,*.bad.com,a.org,b.org,c.org,d.org,e.org,f.org',
      '?net=all',
      '?net=bogus',
    ];
    for (const s of searches) {
      const tsPolicy = parseNetworkPolicyFromSearch(s);
      const swPolicy = JSON.parse(
        JSON.stringify(sw.parseNetworkMode(`http://localhost:3023/python/harness${s}`)),
      );
      assert.deepEqual(swPolicy, tsPolicy, `Policy mismatch for ${s}`);

      const tsPageCsp = buildPageCsp(tsPolicy);
      const swPageCsp = sw.buildPageCsp(swPolicy);
      assert.equal(swPageCsp, tsPageCsp, `Page CSP mismatch for ${s}`);
      assert.ok(tsPageCsp.includes("frame-ancestors 'none'"), `Missing frame-ancestors in ${s}`);

      const tsWorkerCsp = buildWorkerCsp(tsPolicy);
      const swWorkerCsp = sw.buildWorkerCsp(swPolicy);
      assert.equal(swWorkerCsp, tsWorkerCsp, `Worker CSP mismatch for ${s}`);
      assert.ok(!tsWorkerCsp.includes("'unsafe-eval'"), `Worker CSP must never allow 'unsafe-eval' (${s})`);
      assert.ok(tsWorkerCsp.includes("'wasm-unsafe-eval'"), `Worker CSP needs 'wasm-unsafe-eval' (${s})`);
      assert.ok(tsWorkerCsp.includes("worker-src 'none'"), `Worker CSP needs worker-src 'none' (${s})`);
    }

    const allWorkerCsp = buildWorkerCsp({ mode: 'all', hosts: [] });
    assert.ok(
      allWorkerCsp.includes("connect-src 'self' https: http: wss: ws: data: blob:"),
      `Worker all-mode CSP must include explicit connect-src, got: ${allWorkerCsp}`,
    );
  });

  // 4. protocol.ts: validateWorkerMessage valid & invalid shapes (including fs.changed)
  await check('protocol.ts: validateWorkerMessage accepts all valid WorkerToMainMessage shapes', () => {
    const validMsgs = [
      {
        type: 'security.status',
        status: { cspConfirmed: true, mode: 'off', violationDirective: 'connect-src' },
      },
      {
        type: 'security.status',
        status: { cspConfirmed: false, mode: 'off', violationDirective: null, reason: 'no csp' },
      },
      { type: 'status', phase: 'booting', message: 'Loading…' },
      {
        type: 'ready',
        id: 1,
        pyodideVersion: '314.0.8',
        pythonVersion: '3.14.2',
        tier: 1,
        crossOriginIsolated: true,
        canRunSync: true,
      },
      { type: 'stdout', text: 'hello\n' },
      { type: 'stderr', text: 'warn\n' },
      { type: 'stdin.request', seq: 1, mode: 'sab' },
      { type: 'stdin.request', seq: 2, mode: 'jspi' },
      { type: 'stdin.chunk_ack', seq: 1 },
      { type: 'run.start', id: 2, filename: 'main.py' },
      { type: 'run.end', id: 2, ok: true, exitCode: 0, interrupted: false, durationMs: 12.5 },
      {
        type: 'run.end',
        id: 3,
        ok: false,
        exitCode: 1,
        interrupted: false,
        durationMs: 4,
        error: {
          type: 'ZeroDivisionError',
          message: 'division by zero',
          formatted: 'Traceback...\n',
          frames: [{ file: '/workspace/main.py', line: 3, column: 4, fn: 'inner', text: '1/0' }],
        },
      },
      { type: 'repl.result', id: 4, status: 'complete' },
      { type: 'repl.result', id: 5, status: 'incomplete' },
      {
        type: 'repl.result',
        id: 6,
        status: 'syntax-error',
        error: { type: 'SyntaxError', message: 'bad', formatted: 'bad\n', frames: [] },
      },
      { type: 'repl.completions', id: 7, completions: ['print', 'pow'], start: 0 },
      { type: 'link.request', url: 'https://example.com/docs?x=1' },
      { type: 'link.request', url: 'http://example.com/' },
      { type: 'fs.changed', created: ['out/plot.png'], modified: ['data.csv'], deleted: ['old.txt'] },
      {
        type: 'plot.new',
        plotId: 'plot-1',
        title: 'Sine Wave',
        width: 640,
        height: 480,
        pngBytes: new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
          0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
          0, 0, 2, 0x80, 0, 0, 1, 0xe0,
        ]),
        canExportVector: true,
        source: 'matplotlib',
        createdAt: 1700000000000,
      },
      {
        type: 'plot.new',
        plotId: 'plot-2',
        title: 'Demo',
        width: 120,
        height: 80,
        pngBytes: new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
          0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
          0, 0, 0, 120, 0, 0, 0, 80,
        ]),
        canExportVector: false,
        source: 'pillow',
        createdAt: 1700000000001,
      },
      {
        type: 'plot.export.result',
        id: 'plot-exp-1',
        ok: true,
        plotId: 'plot-1',
        format: 'svg',
        bytes: new TextEncoder().encode('<svg></svg>'),
      },
      {
        type: 'plot.export.result',
        id: 'plot-exp-2',
        ok: false,
        plotId: 'plot-1',
        format: 'pdf',
        error: 'evicted',
      },
      { type: 'error', message: 'boom' },
      { type: 'error', id: 1, message: 'init boom' },
    ];
    for (const msg of validMsgs) {
      const res = validateWorkerMessage(msg);
      assert.equal(res.ok, true, `Expected valid for ${JSON.stringify(msg)}: ${res.ok ? '' : res.reason}`);
    }
  });

  await check('protocol.ts: validateWorkerMessage drops malformed, unknown, wrong-type, oversized cleanly', () => {
    const invalidMsgs = [
      null,
      undefined,
      42,
      'stdout',
      [],
      {},
      { type: 123 },
      { type: 'unknown.cmd' },
      { type: 'network.set', mode: 'all' },
      { type: 'security.status', status: { cspConfirmed: 'yes', mode: 'off', violationDirective: null } },
      { type: 'security.status', status: { cspConfirmed: true, mode: 'evil', violationDirective: null } },
      { type: 'status', phase: 'hacked', message: 'x' },
      { type: 'status', phase: 'ready', message: 'x'.repeat(MAX_STATUS_TEXT_CHARS + 1) },
      { type: 'ready', id: -1, pyodideVersion: '1', pythonVersion: '3', tier: 1, crossOriginIsolated: true, canRunSync: true },
      { type: 'ready', id: 1, pyodideVersion: '1', pythonVersion: '3', tier: 4, crossOriginIsolated: true, canRunSync: true },
      { type: 'stdout', text: 12345 },
      { type: 'stdout', text: 'A'.repeat(MAX_STREAM_CHUNK_CHARS + 1) },
      { type: 'stderr', text: null },
      { type: 'stdin.request', seq: 1.5, mode: 'sab' },
      { type: 'stdin.request', seq: 1, mode: 'other' },
      { type: 'run.end', id: 1, ok: true, exitCode: 0, interrupted: false, durationMs: -5 },
      { type: 'run.end', id: 1, ok: true, exitCode: 0, interrupted: false, durationMs: Number.NaN },
      {
        type: 'run.end',
        id: 1,
        ok: false,
        exitCode: 1,
        interrupted: false,
        durationMs: 1,
        error: {
          type: 'E',
          message: 'm'.repeat(MAX_ERROR_TEXT_CHARS + 1),
          formatted: 'f',
          frames: [],
        },
      },
      {
        type: 'run.end',
        id: 1,
        ok: false,
        exitCode: 1,
        interrupted: false,
        durationMs: 1,
        error: {
          type: 'E',
          message: 'm',
          formatted: 'f',
          frames: Array.from({ length: MAX_TRACEBACK_FRAMES + 1 }, () => ({
            file: 'a.py',
            line: 1,
            fn: 'f',
          })),
        },
      },
      { type: 'repl.result', id: 1, status: 'bogus' },
      {
        type: 'repl.completions',
        id: 1,
        start: 0,
        completions: Array.from({ length: MAX_COMPLETIONS + 1 }, () => 'a'),
      },
      {
        type: 'repl.completions',
        id: 1,
        start: 0,
        completions: ['x'.repeat(MAX_COMPLETION_ITEM_CHARS + 1)],
      },
      { type: 'link.request', url: 'javascript:alert(1)' },
      { type: 'link.request', url: 'data:text/html,<script>alert(1)</script>' },
      { type: 'link.request', url: 'file:///etc/passwd' },
      { type: 'link.request', url: `https://example.com/${'a'.repeat(MAX_LINK_URL_CHARS)}` },
      { type: 'fs.changed', created: ['../escape.py'], modified: [], deleted: [] },
      { type: 'fs.changed', created: ['/etc/passwd'], modified: [], deleted: [] },
      { type: 'fs.changed', created: 'not-an-array', modified: [], deleted: [] },
      // Forged / malformed / oversized plot.new & plot.export.result payloads
      {
        type: 'plot.new',
        plotId: '',
        title: 'empty id',
        width: 100,
        height: 100,
        pngBytes: new Uint8Array(24),
        canExportVector: true,
        source: 'matplotlib',
        createdAt: 1,
      },
      {
        type: 'plot.new',
        plotId: 'p'.repeat(MAX_PLOT_ID_CHARS + 1),
        title: 'id too long',
        width: 100,
        height: 100,
        pngBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(16).fill(0)]),
        canExportVector: true,
        source: 'matplotlib',
        createdAt: 1,
      },
      {
        type: 'plot.new',
        plotId: 'plot-1',
        title: 't'.repeat(MAX_PLOT_TITLE_CHARS + 1),
        width: 100,
        height: 100,
        pngBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(16).fill(0)]),
        canExportVector: true,
        source: 'matplotlib',
        createdAt: 1,
      },
      {
        type: 'plot.new',
        plotId: 'plot-1',
        title: 'bad sig',
        width: 100,
        height: 100,
        pngBytes: new TextEncoder().encode('<script>alert(1)</script>0123456789'),
        canExportVector: true,
        source: 'matplotlib',
        createdAt: 1,
      },
      {
        type: 'plot.new',
        plotId: 'plot-1',
        title: 'zero width',
        width: 0,
        height: 100,
        pngBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(16).fill(0)]),
        canExportVector: true,
        source: 'matplotlib',
        createdAt: 1,
      },
      {
        type: 'plot.new',
        plotId: 'plot-1',
        title: 'huge dim',
        width: MAX_PLOT_DIM + 1,
        height: 100,
        pngBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(16).fill(0)]),
        canExportVector: true,
        source: 'matplotlib',
        createdAt: 1,
      },
      {
        type: 'plot.new',
        plotId: 'plot-1',
        title: 'bad source',
        width: 100,
        height: 100,
        pngBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(16).fill(0)]),
        canExportVector: true,
        source: 'evil',
        createdAt: 1,
      },
      {
        type: 'plot.new',
        plotId: 'plot-1',
        title: 'oversized',
        width: 100,
        height: 100,
        pngBytes: (() => {
          const b = new Uint8Array(MAX_PLOT_BYTES + 1);
          b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
          return b;
        })(),
        canExportVector: true,
        source: 'matplotlib',
        createdAt: 1,
      },
      {
        type: 'plot.export.result',
        id: 'exp-1',
        ok: true,
        plotId: 'plot-1',
        format: 'svg',
        // missing bytes when ok: true
      },
      {
        type: 'plot.export.result',
        id: 'exp-2',
        ok: true,
        plotId: 'plot-1',
        format: 'exe',
        bytes: new Uint8Array([1, 2, 3]),
      },
      {
        type: 'plot.export.result',
        id: 'exp-3',
        ok: true,
        plotId: 'plot-1',
        format: 'pdf',
        bytes: new Uint8Array(MAX_PLOT_BYTES + 1),
      },
      { type: 'error', id: -2, message: 'bad id' },
    ];
    for (const msg of invalidMsgs) {
      const res = validateWorkerMessage(msg);
      assert.equal(res.ok, false, `Expected invalid for ${String(msg && msg.type)}`);
    }
  });

  // 5. tiers.ts: detectCapabilityTier across all combinations
  await check('tiers.ts: detectCapabilityTier across all (crossOriginIsolated, canRunSync) combinations', () => {
    assert.deepEqual(detectCapabilityTier(true, true), {
      tier: 1,
      blockingInput: true,
      softStop: true,
      display: true,
      asyncioSyncLoop: true,
    });
    assert.deepEqual(detectCapabilityTier(true, false), {
      tier: 1,
      blockingInput: true,
      softStop: true,
      display: true,
      asyncioSyncLoop: true,
    });
    assert.deepEqual(detectCapabilityTier(false, true), {
      tier: 2,
      blockingInput: true,
      softStop: false,
      display: false,
      asyncioSyncLoop: false,
    });
    assert.deepEqual(detectCapabilityTier(false, false), {
      tier: 3,
      blockingInput: false,
      softStop: false,
      display: false,
      asyncioSyncLoop: false,
    });
  });

  // 6. paths.ts: normalization, traversal rejection, depth/length caps, helpers
  await check('paths.ts: normalization, traversal/absolute/drive rejection & helpers', () => {
    const validCases = [
      ['main.py', 'main.py'],
      ['./main.py', 'main.py'],
      ['././src/helper.py', 'src/helper.py'],
      ['src\\utils\\math.py', 'src/utils/math.py'],
      ['data/blåbær_2026.csv', 'data/blåbær_2026.csv'],
    ];
    for (const [input, expected] of validCases) {
      const res = normalizeWorkspacePath(input);
      assert.equal(res.ok, true, `Expected valid path for ${input}`);
      if (res.ok) assert.equal(res.path, expected);
    }

    const dirRes = normalizeWorkspacePath('src/sub/', { allowTrailingSlash: true });
    assert.equal(dirRes.ok, true);
    if (dirRes.ok) assert.equal(dirRes.path, 'src/sub');

    const invalidCases = [
      '',
      '   ',
      '.',
      './',
      '..',
      '../secret.py',
      './../secret.py',
      'a/../../b.py',
      'a/./b.py',
      '/etc/passwd',
      '\\windows\\system32',
      'C:\\evil.py',
      'D:relative.py',
      'foo//bar.py',
      'foo/bar/',
      'bad\x00name.py',
      'line\nbreak.py',
      `${'a/'.repeat(MAX_PATH_DEPTH)}leaf.py`,
      `${'x'.repeat(MAX_PATH_LENGTH + 1)}.py`,
    ];
    for (const bad of invalidCases) {
      const res = normalizeWorkspacePath(bad);
      assert.equal(res.ok, false, `Expected invalid path for ${JSON.stringify(bad)}`);
    }

    assert.equal(parentDir('main.py'), '');
    assert.equal(parentDir('a/b/c.py'), 'a/b');
    assert.equal(baseName('a/b/c.py'), 'c.py');
    assert.deepEqual(ancestorDirs('a/b/c.py'), ['a', 'a/b']);
    assert.equal(isDangerousUploadExt('run.py'), true);
    assert.equal(isDangerousUploadExt('pkg.WHL'), true);
    assert.equal(isDangerousUploadExt('bundle.zip'), true);
    assert.equal(isDangerousUploadExt('index.html'), true);
    assert.equal(isDangerousUploadExt('page.htm'), true);
    assert.equal(isDangerousUploadExt('notes.txt'), false);
    assert.equal(isDangerousUploadExt('plot.png'), false);
  });

  // 7. zip.ts: export/import round trip, __MACOSX skip, traversal/absolute/zip-bomb rejection
  await check('zip.ts: round trip, path traversal rejection & zip-bomb caps', async () => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // Round trip
    const exported = exportWorkspaceZip({
      'main.py': 'print("zip-ok")\n',
      'pkg/helpers.py': 'VALUE = 42\n',
      'data/bin.dat': new Uint8Array([0, 1, 2, 255]),
    });
    const imported = await importZipBytes(exported);
    assert.equal(imported.ok, true, imported.error);
    assert.equal(imported.files.length, 3);
    const byPath = new Map(imported.files.map((f) => [f.path, f]));
    assert.equal(dec.decode(byPath.get('main.py').bytes), 'print("zip-ok")\n');
    assert.equal(dec.decode(byPath.get('pkg/helpers.py').bytes), 'VALUE = 42\n');
    assert.deepEqual([...byPath.get('data/bin.dat').bytes], [0, 1, 2, 255]);

    // Skip __MACOSX and .DS_Store cleanly
    const macZip = zipSync({
      'main.py': enc.encode('print(1)'),
      '__MACOSX/._main.py': enc.encode('junk'),
      '.DS_Store': enc.encode('junk'),
    });
    const macRes = await importZipBytes(macZip);
    assert.equal(macRes.ok, true, macRes.error);
    assert.equal(macRes.files.length, 1);
    assert.equal(macRes.skipped.length, 2);

    // Reject ../ traversal
    const traversalZip = zipSync({
      'good.py': enc.encode('x = 1'),
      '../evil.py': enc.encode('boom'),
    });
    const travRes = await importZipBytes(traversalZip);
    assert.equal(travRes.ok, false);
    assert.equal(travRes.errorCode, 'INVALID_PATH');

    // Reject absolute path
    const absZip = zipSync({
      '/etc/passwd': enc.encode('root:x:0:0'),
    });
    const absRes = await importZipBytes(absZip);
    assert.equal(absRes.ok, false);
    assert.equal(absRes.errorCode, 'INVALID_PATH');

    // Reject Windows drive letter
    const driveZip = zipSync({
      'C:/evil.py': enc.encode('boom'),
    });
    const driveRes = await importZipBytes(driveZip);
    assert.equal(driveRes.ok, false);
    assert.equal(driveRes.errorCode, 'INVALID_PATH');

    // Reject zip bomb by entry count
    const manyFiles = {};
    for (let i = 0; i < 12; i += 1) {
      manyFiles[`f${i}.txt`] = enc.encode('x');
    }
    const manyZip = zipSync(manyFiles);
    const countBombRes = await importZipBytes(manyZip, { maxEntries: 10 });
    assert.equal(countBombRes.ok, false);
    assert.equal(countBombRes.errorCode, 'ZIP_BOMB_ENTRIES');

    // Reject zip bomb by total uncompressed bytes (highly compressible zeros)
    const zeroPayload = new Uint8Array(2 * 1024 * 1024); // 2 MiB zeros compresses to ~2 KiB
    const sizeBombZip = zipSync({ 'bomb.bin': zeroPayload }, { level: 9 });
    assert.ok(sizeBombZip.byteLength < 20_000, 'Expected compressed test bomb < 20 KB');
    const sizeBombRes = await importZipBytes(sizeBombZip, {
      maxTotalBytes: 1024 * 1024,
      maxFileBytes: 1024 * 1024,
    });
    assert.equal(sizeBombRes.ok, false);
    assert.equal(sizeBombRes.errorCode, 'ZIP_BOMB_SIZE');
  });

  // 8. examples/: all 12 built-in examples valid & complete, with EN/NB strings
  await check('examples/: 12 built-in examples have valid folders, entries, tags & EN/NB strings', () => {
    const requiredIds = [
      'hello',
      'input_colors',
      'soft_stop',
      'modules',
      'science',
      'matplotlib_plot',
      'pillow_image',
      'pdf_report',
      'csv_json',
      'html_preview',
      'asyncio_gather',
      'network_probe',
    ];
    assert.deepEqual(
      PYTHON_EXAMPLES.map((ex) => ex.id),
      requiredIds,
    );
    for (const tag of PYTHON_EXAMPLE_TAGS) {
      const key = getPythonExampleTagKey(tag);
      assert.ok(examplesEn[key] && examplesNb[key], `Missing tag label ${key}`);
    }
    for (const id of requiredIds) {
      const ex = getPythonExample(id);
      assert.ok(ex, `Missing example "${id}"`);
      assert.ok(PYTHON_EXAMPLE_TAGS.includes(ex.tag), `Unknown tag "${ex.tag}" for ${id}`);
      for (const key of [ex.titleKey, ex.descriptionKey]) {
        assert.ok(examplesEn[key] && examplesNb[key], `Missing EN/NB string ${key}`);
      }
      const entryNorm = normalizeWorkspacePath(ex.entry);
      assert.equal(entryNorm.ok, true, `Invalid entry for ${id}`);
      assert.ok(ex.files[ex.entry], `Entry file missing in files for ${id}`);
      for (const [path, content] of Object.entries(ex.files)) {
        const res = normalizeWorkspacePath(path);
        assert.equal(res.ok, true, `Invalid file path "${path}" in example "${id}"`);
        assert.ok(path.startsWith(`${id}/`), `File "${path}" of "${id}" is outside its folder`);
        assert.ok(typeof content === 'string' && content.trim().length > 0);
        assert.ok(content.startsWith('#') || content.startsWith('"""'), `"${path}" lacks a header comment`);
        assert.ok(!content.includes(String.fromCharCode(9)), `"${path}" contains a tab`);
      }
      // Only the network probe may contact other hosts.
      const text = Object.values(ex.files).join(String.fromCharCode(10));
      if (id !== 'network_probe') {
        assert.ok(!/https?:\/\//.test(text), `"${id}" mentions a URL`);
      }
    }
    const modEx = getPythonExample('modules');
    assert.ok(modEx && modEx.files['modules/main.py'] && modEx.files['modules/helpers.py']);
  });

  return { passed, failed, failures };
}
