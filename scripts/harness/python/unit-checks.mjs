// Part A: Pure-Node unit checks for lib/python/{network,protocol,tiers}.ts and public/python/coi-sw.js parity.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  buildNetworkPolicyUrl,
  buildPageCsp,
  buildWorkerCsp,
  parseNetworkPolicyFromSearch,
  parseSelectedHosts,
  validateSelectedHost,
} from '../../../lib/python/network.ts';
import {
  MAX_COMPLETIONS,
  MAX_COMPLETION_ITEM_CHARS,
  MAX_ERROR_TEXT_CHARS,
  MAX_LINK_URL_CHARS,
  MAX_STATUS_TEXT_CHARS,
  MAX_STREAM_CHUNK_CHARS,
  MAX_TRACEBACK_FRAMES,
  validateWorkerMessage,
} from '../../../lib/python/protocol.ts';
import { detectCapabilityTier } from '../../../lib/python/tiers.ts';

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

export function runUnitChecks() {
  let passed = 0;
  let failed = 0;
  const failures = [];

  const check = (name, fn) => {
    try {
      fn();
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
  check('network.ts: parseNetworkPolicyFromSearch modes & invalid inputs', () => {
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
    // > 5 hosts capped at 5
    const six = parseNetworkPolicyFromSearch(
      '?net=hosts&hosts=a.com,b.com,c.com,d.com,e.com,f.com,g.com',
    );
    assert.equal(six.mode, 'hosts');
    assert.deepEqual(six.hosts, ['a.com', 'b.com', 'c.com', 'd.com', 'e.com']);
  });

  // 2. network.ts: validateSelectedHost & buildNetworkPolicyUrl
  check('network.ts: validateSelectedHost accept/reject matrix', () => {
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

    // Dedup & > 5 hosts cap in parseSelectedHosts + buildNetworkPolicyUrl
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
  check('network.ts vs public/python/coi-sw.js CSP parity & security invariants', () => {
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

  // 4. protocol.ts: validateWorkerMessage valid & invalid shapes
  check('protocol.ts: validateWorkerMessage accepts all valid WorkerToMainMessage shapes', () => {
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
      { type: 'error', message: 'boom' },
      { type: 'error', id: 1, message: 'init boom' },
    ];
    for (const msg of validMsgs) {
      const res = validateWorkerMessage(msg);
      assert.equal(res.ok, true, `Expected valid for ${JSON.stringify(msg)}: ${res.ok ? '' : res.reason}`);
    }
  });

  check('protocol.ts: validateWorkerMessage drops malformed, unknown, wrong-type, oversized cleanly', () => {
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
      { type: 'error', id: -2, message: 'bad id' },
    ];
    for (const msg of invalidMsgs) {
      const res = validateWorkerMessage(msg);
      assert.equal(res.ok, false, `Expected invalid for ${String(msg && msg.type)}`);
    }
  });

  // 5. tiers.ts: detectCapabilityTier across all combinations
  check('tiers.ts: detectCapabilityTier across all (crossOriginIsolated, canRunSync) combinations', () => {
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

  return { passed, failed, failures };
}
