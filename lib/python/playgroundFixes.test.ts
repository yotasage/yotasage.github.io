import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PYTHON_SW_ALLOWED_PREFIXES } from './network';
import { checkInstallRequest } from './packageProtocol';
import { parseRequirements, planRequirements } from './requirements';
import { buildSandboxedHtmlSrcDoc, injectMetaCspFallback, SANDBOX_HTML_CSP_META } from './sandboxHtml';
import { splitTokensIntoLines, tokenizeTerminalData } from './terminalInput';
import { PythonWorkerClient } from './workerClient';

test('tokenizeTerminalData strips CSI/SS3/OSC escape sequences without leaking characters', () => {
  // ArrowLeft, ArrowRight, Delete, Home, End, PgUp, Ctrl+Left, SS3 Home, OSC title, bracketed paste
  const input =
    'ab\x1b[D\x1b[C\x1b[3~\x1b[H\x1b[F\x1b[5~\x1b[1;5D\x1bOH\x1b]0;title\x07\x1b[200~cd\x1b[201~';
  const tokens = tokenizeTerminalData(input);
  assert.deepEqual(tokens, [
    { kind: 'text', text: 'ab' },
    { kind: 'text', text: 'cd' },
  ]);
});

test('tokenizeTerminalData preserves ArrowUp, ArrowDown, Backspace, EOF, Tab, and CRLF', () => {
  assert.deepEqual(tokenizeTerminalData('\x1b[A'), [{ kind: 'up' }]);
  assert.deepEqual(tokenizeTerminalData('\x1b[B'), [{ kind: 'down' }]);
  assert.deepEqual(tokenizeTerminalData('x\x7fy\r\nz\x04\t'), [
    { kind: 'text', text: 'x' },
    { kind: 'backspace' },
    { kind: 'text', text: 'y' },
    { kind: 'newline' },
    { kind: 'text', text: 'z' },
    { kind: 'eof' },
    { kind: 'tab' },
  ]);
});

test('splitTokensIntoLines handles multi-line REPL paste with CRLF and trailing line', () => {
  const tokens = tokenizeTerminalData('x = 10\r\ny = 20\n\tprint(x + y)\npart');
  const res = splitTokensIntoLines('', tokens, { tabAsSpaces: true });
  assert.deepEqual(res.lines, ['x = 10', 'y = 20', '    print(x + y)']);
  assert.equal(res.trailing, 'part');
});

test('buildSandboxedHtmlSrcDoc leaves raw HTML unchanged when allowScripts is false', () => {
  const raw = '<!-- <head> --><head><script>alert(1)</script></head>';
  assert.equal(buildSandboxedHtmlSrcDoc(raw, false), raw);
});

test('injectMetaCspFallback ignores <head> inside HTML comments, attributes, and raw-text tags', () => {
  const commentBypass = '<!-- <head> --><head><script>x=1</script></head><body>ok</body>';
  const out1 = injectMetaCspFallback(commentBypass);
  assert.equal(
    out1,
    `<!-- <head> --><head>${SANDBOX_HTML_CSP_META}<script>x=1</script></head><body>ok</body>`,
  );

  const attrBypass = '<head data-x=">"><script>x=1</script></head>';
  const out2 = injectMetaCspFallback(attrBypass);
  assert.equal(out2, `<head data-x=">">${SANDBOX_HTML_CSP_META}<script>x=1</script></head>`);

  const titleBypass = '<html><title><head></title><head><script>x=1</script></head></html>';
  const out3 = injectMetaCspFallback(titleBypass);
  assert.equal(
    out3,
    `<html><title><head></title><head>${SANDBOX_HTML_CSP_META}<script>x=1</script></head></html>`,
  );

  const bareFragment = '<script>fetch("https://evil.example")</script>';
  const out4 = injectMetaCspFallback(bareFragment);
  assert.equal(out4, `<head>${SANDBOX_HTML_CSP_META}</head>\n${bareFragment}`);
});

test('PYTHON_SW_ALLOWED_PREFIXES matches public/python/coi-sw.js ALLOWED_PREFIXES exactly', () => {
  const swSrc = readFileSync(join(process.cwd(), 'public', 'python', 'coi-sw.js'), 'utf8');
  const m = /const\s+ALLOWED_PREFIXES\s*=\s*\[([\s\S]*?)\];/.exec(swSrc);
  assert.ok(m, 'ALLOWED_PREFIXES declaration not found in coi-sw.js');
  const swPrefixes = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.deepEqual([...PYTHON_SW_ALLOWED_PREFIXES], swPrefixes);
});

test('planRequirements forwards --hash values and checkInstallRequest validates them', () => {
  const validSha = 'a'.repeat(64);
  const parsed = parseRequirements(`six==1.16.0 --hash=sha256:${validSha}\n`);
  const plan = planRequirements(parsed, 'pkg', new Map());
  assert.equal(plan.items.length, 1);
  assert.deepEqual(plan.items[0], {
    kind: 'pypi',
    requirement: 'six==1.16.0',
    hashes: [validSha],
  });
  assert.equal(checkInstallRequest(plan.items, 'user'), null);
  assert.equal(
    checkInstallRequest([{ kind: 'pypi', requirement: 'six==1.16.0', hashes: [] }], 'user'),
    'Invalid requirement hashes',
  );
  assert.equal(
    checkInstallRequest([{ kind: 'pypi', requirement: 'six==1.16.0', hashes: ['not-a-hash'] }], 'user'),
    'Invalid requirement hashes',
  );
  assert.equal(
    checkInstallRequest(
      [{ kind: 'pypi', requirement: 'six==1.16.0', hashes: Array(17).fill(validSha) }],
      'user',
    ),
    'Invalid requirement hashes',
  );
});

test('PythonWorkerClient error message rejects pendingRepl and resets activity/state', async () => {
  const client = new PythonWorkerClient();
  const internal = client as unknown as {
    _state: string;
    _activity: string | null;
    _readyInfo: Record<string, unknown>;
    pendingRepl: { id: number; resolve: (v: unknown) => void; reject: (e: Error) => void } | null;
    pendingRun: { id: number; resolve: (v: unknown) => void; reject: (e: Error) => void } | null;
    handleMessage: (msg: unknown) => void;
  };
  internal._readyInfo = { pyodideVersion: '0', pythonVersion: '3.12', tier: 1, crossOriginIsolated: true, canRunSync: false, abiVersion: '', platform: '' };
  internal._state = 'running';
  internal._activity = 'repl';

  let replErr: Error | null = null;
  const p1 = new Promise<void>((resolve) => {
    internal.pendingRepl = {
      id: 42,
      resolve: () => resolve(),
      reject: (e) => {
        replErr = e;
        resolve();
      },
    };
  });
  internal.handleMessage({ type: 'error', id: 42, message: 'Pyodide is not initialized' });
  await p1;
  assert.equal((replErr as Error | null)?.message, 'Pyodide is not initialized');
  assert.equal(client.state, 'ready');
  assert.equal(client.activity, null);

  internal._state = 'running';
  internal._activity = 'run';
  let runErr: Error | null = null;
  const p2 = new Promise<void>((resolve) => {
    internal.pendingRun = {
      id: 43,
      resolve: () => resolve(),
      reject: (e) => {
        runErr = e;
        resolve();
      },
    };
  });
  internal.handleMessage({ type: 'error', id: 43, message: 'Run failed' });
  await p2;
  assert.equal((runErr as Error | null)?.message, 'Run failed');
  assert.equal(client.state, 'ready');
  assert.equal(client.activity, null);
});
