/* eslint-disable no-restricted-globals */
// In-scope ES module Web Worker for Pyodide (/python/python-worker.js).
// Lives under /python/ so /python/coi-sw.js intercepts the worker script fetch and applies
// COOP/COEP + strict worker CSP (without 'unsafe-eval').

// Defense in depth (S1 §7): remove WebRTC constructors before Pyodide or user code runs.
for (const key of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) {
  if (key in self) {
    try {
      delete self[key];
    } catch {
      // best effort
    }
  }
}

// SAB layout constants (must match lib/python/protocol.ts)
const CTRL_INTERRUPT = 0;
const CTRL_STDIN_STATE = 1;
const CTRL_STDIN_LEN = 2;
const CTRL_STDIN_SEQ = 3;

const SIGINT = 2;

const STDIN_IDLE = 0;
const STDIN_REQUEST = 1;
const STDIN_CHUNK_READY = 2;
const STDIN_CHUNK_FINAL = 3;
const STDIN_EOF = 4;
const STDIN_INTERRUPTED = 5;

const RT_FILES = ['__init__.py', 'stdio.py', 'shims.py', 'runner.py', 'repl.py'];

let pyodide = null;
let ctrlView = null;
let stdinView = null;
let networkMode = 'off';
let activeTier = 3;
let stdinSeq = 0;
let pendingStdin = null;
let pendingOffset = 0;

let jspiStdinResolver = null;
let jspiStdinSeq = 0;

const stdoutDecoder = new TextDecoder('utf-8', { fatal: false });
const stderrDecoder = new TextDecoder('utf-8', { fatal: false });

function postStdout(text) {
  if (text) self.postMessage({ type: 'stdout', text });
}

function postStderr(text) {
  if (text) self.postMessage({ type: 'stderr', text });
}

function flushStreamDecoders() {
  const outTail = stdoutDecoder.decode();
  if (outTail) postStdout(outTail);
  const errTail = stderrDecoder.decode();
  if (errTail) postStderr(errTail);
}

function resetRunBuffers() {
  pendingStdin = null;
  pendingOffset = 0;
  if (ctrlView) {
    Atomics.store(ctrlView, CTRL_INTERRUPT, 0);
    Atomics.store(ctrlView, CTRL_STDIN_STATE, STDIN_IDLE);
    Atomics.store(ctrlView, CTRL_STDIN_LEN, 0);
  }
}

async function verifyCspFailClosed(mode) {
  if (mode === 'all') {
    return {
      cspConfirmed: true,
      mode,
      violationDirective: null,
    };
  }

  let violationDirective = null;
  const onViolation = (ev) => {
    const dir = ev.effectiveDirective || ev.violatedDirective || '';
    if (dir.startsWith('connect-src')) {
      violationDirective = dir;
    }
  };
  self.addEventListener('securitypolicyviolation', onViolation);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 1500);
  try {
    await fetch('https://csp-probe.invalid/', {
      mode: 'no-cors',
      cache: 'no-store',
      signal: ac.signal,
    });
  } catch {
    // Expected: TypeError when blocked by CSP (or network failure).
  } finally {
    clearTimeout(timer);
  }

  // Allow queued SecurityPolicyViolationEvent task to deliver.
  await new Promise((resolve) => setTimeout(resolve, 50));
  self.removeEventListener('securitypolicyviolation', onViolation);

  if (violationDirective) {
    return {
      cspConfirmed: true,
      mode,
      violationDirective,
    };
  }
  return {
    cspConfirmed: false,
    mode,
    violationDirective: null,
    reason: 'connect-src securitypolicyviolation did not fire for https://csp-probe.invalid/',
  };
}

function readNextStdinBytesSab() {
  if (!ctrlView || !stdinView) {
    return { eof: true };
  }
  const chunks = [];
  let totalLen = 0;
  stdinSeq += 1;
  const seq = stdinSeq;

  Atomics.store(ctrlView, CTRL_STDIN_SEQ, seq);
  Atomics.store(ctrlView, CTRL_STDIN_LEN, 0);
  Atomics.store(ctrlView, CTRL_STDIN_STATE, STDIN_REQUEST);
  self.postMessage({ type: 'stdin.request', seq, mode: 'sab' });

  while (true) {
    if (Atomics.load(ctrlView, CTRL_INTERRUPT) === SIGINT) {
      Atomics.store(ctrlView, CTRL_STDIN_STATE, STDIN_IDLE);
      return { interrupted: true };
    }

    const state = Atomics.load(ctrlView, CTRL_STDIN_STATE);
    if (state === STDIN_REQUEST) {
      Atomics.wait(ctrlView, CTRL_STDIN_STATE, STDIN_REQUEST, 50);
      continue;
    }
    if (state === STDIN_INTERRUPTED) {
      Atomics.store(ctrlView, CTRL_STDIN_STATE, STDIN_IDLE);
      return { interrupted: true };
    }
    if (state === STDIN_EOF) {
      Atomics.store(ctrlView, CTRL_STDIN_STATE, STDIN_IDLE);
      return { eof: true };
    }
    if (state === STDIN_CHUNK_READY || state === STDIN_CHUNK_FINAL) {
      const len = Math.max(0, Math.min(stdinView.length, Atomics.load(ctrlView, CTRL_STDIN_LEN)));
      const copy = new Uint8Array(len);
      copy.set(stdinView.subarray(0, len));
      chunks.push(copy);
      totalLen += len;

      if (state === STDIN_CHUNK_FINAL) {
        Atomics.store(ctrlView, CTRL_STDIN_STATE, STDIN_IDLE);
        break;
      }
      Atomics.store(ctrlView, CTRL_STDIN_LEN, 0);
      Atomics.store(ctrlView, CTRL_STDIN_STATE, STDIN_REQUEST);
      self.postMessage({ type: 'stdin.chunk_ack', seq });
      continue;
    }

    Atomics.store(ctrlView, CTRL_STDIN_STATE, STDIN_IDLE);
    return { eof: true };
  }

  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of chunks) {
    combined.set(part, offset);
    offset += part.length;
  }
  return { bytes: combined };
}

function tier1StdinRead(buf) {
  // CRITICAL (S3): guard zero-length probes from CPython's readline / BufferedReader.
  if (!buf || buf.length === 0) return 0;

  if (ctrlView && Atomics.load(ctrlView, CTRL_INTERRUPT) === SIGINT) {
    throw { code: 'EINTR' };
  }

  if (!pendingStdin || pendingOffset >= pendingStdin.length) {
    const res = readNextStdinBytesSab();
    if (res.interrupted) {
      throw { code: 'EINTR' };
    }
    if (res.eof || !res.bytes || res.bytes.length === 0) {
      pendingStdin = null;
      pendingOffset = 0;
      return 0;
    }
    pendingStdin = res.bytes;
    pendingOffset = 0;
  }

  const remaining = pendingStdin.length - pendingOffset;
  const n = Math.min(buf.length, remaining);
  buf.set(pendingStdin.subarray(pendingOffset, pendingOffset + n), 0);
  pendingOffset += n;
  if (pendingOffset >= pendingStdin.length) {
    pendingStdin = null;
    pendingOffset = 0;
  }
  return n;
}

function sleepInterruptibleSab(seconds) {
  if (!ctrlView) return;
  const deadline = performance.now() + seconds * 1000;
  while (true) {
    if (Atomics.load(ctrlView, CTRL_INTERRUPT) !== 0) {
      pyodide.checkInterrupt();
      return;
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) return;
    const waitMs = Math.min(remaining, 50);
    const status = Atomics.wait(ctrlView, CTRL_INTERRUPT, 0, waitMs);
    if (status === 'ok' || status === 'not-equal' || Atomics.load(ctrlView, CTRL_INTERRUPT) !== 0) {
      pyodide.checkInterrupt();
      return;
    }
  }
}

function requestStdinJspi() {
  jspiStdinSeq += 1;
  const seq = jspiStdinSeq;
  return new Promise((resolve, reject) => {
    jspiStdinResolver = { seq, resolve, reject };
    self.postMessage({ type: 'stdin.request', seq, mode: 'jspi' });
  });
}

async function installRuntimePackage(runtimeBaseUrl) {
  const base = runtimeBaseUrl.endsWith('/') ? runtimeBaseUrl : `${runtimeBaseUrl}/`;
  const fetched = await Promise.all(
    RT_FILES.map(async (name) => {
      const url = new URL(name, base).href;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch yotasage_rt/${name}: HTTP ${res.status}`);
      }
      return [name, await res.text()];
    }),
  );

  try {
    pyodide.FS.mkdir('/yotasage_rt');
  } catch {
    // Already exists
  }
  for (const [name, source] of fetched) {
    pyodide.FS.writeFile(`/yotasage_rt/${name}`, source, { encoding: 'utf8' });
  }

  pyodide.runPython(`
import sys
if '/' not in sys.path:
    sys.path.insert(0, '/')
import yotasage_rt
yotasage_rt.install_runtime(${activeTier}, ${JSON.stringify(networkMode)})
`);
}

function pyResultToPlain(pyVal) {
  if (!pyVal) return null;
  if (typeof pyVal.toJs === 'function') {
    const plain = pyVal.toJs({ dict_converter: Object.fromEntries });
    pyVal.destroy();
    return plain;
  }
  return pyVal;
}

async function handleInit(msg) {
  const { id, payload } = msg;
  networkMode = payload.networkMode || 'off';

  const hasSab = typeof SharedArrayBuffer === 'function';
  if (hasSab && payload.controlSab instanceof SharedArrayBuffer) {
    ctrlView = new Int32Array(payload.controlSab);
  } else {
    ctrlView = null;
  }
  if (hasSab && payload.stdinSab instanceof SharedArrayBuffer) {
    stdinView = new Uint8Array(payload.stdinSab);
  } else {
    stdinView = null;
  }

  const securityStatus = await verifyCspFailClosed(networkMode);
  self.postMessage({ type: 'security.status', status: securityStatus });

  self.postMessage({ type: 'status', phase: 'booting', message: 'Loading Pyodide runtime…' });

  const origin = self.location.origin;
  const pyodideMjsUrl = new URL('/pyodide/pyodide.mjs', origin).href;
  const indexURL = payload.pyodideIndexUrl || new URL('/pyodide/', origin).href;
  const lockFileURL = payload.pyodideLockUrl || new URL('/pyodide/pyodide-lock.json', origin).href;
  const runtimeBaseUrl = payload.runtimeBaseUrl || new URL('/python/rt/', origin).href;

  const { loadPyodide } = await import(pyodideMjsUrl);
  pyodide = await loadPyodide({ indexURL, lockFileURL });

  const canRunSync = Boolean(
    await pyodide.runPythonAsync('import pyodide.ffi; pyodide.ffi.can_run_sync()'),
  );
  const isolated = self.crossOriginIsolated === true;

  if (isolated && ctrlView && stdinView) {
    activeTier = 1;
  } else if (canRunSync) {
    activeTier = 2;
  } else {
    activeTier = 3;
  }

  if (activeTier === 1 && hasSab && payload.controlSab instanceof SharedArrayBuffer) {
    pyodide.setInterruptBuffer(new Int32Array(payload.controlSab, 0, 1));
  }

  pyodide.setStdout({
    isatty: true,
    write(buf) {
      postStdout(stdoutDecoder.decode(buf, { stream: true }));
      return buf.length;
    },
  });

  pyodide.setStderr({
    isatty: true,
    write(buf) {
      postStderr(stderrDecoder.decode(buf, { stream: true }));
      return buf.length;
    },
  });

  if (activeTier === 1) {
    pyodide.setStdin({
      isatty: true,
      read: tier1StdinRead,
    });
  }

  pyodide.registerJsModule('yotasage_host', {
    tier: activeTier,
    network_mode: networkMode,
    sleep_interruptible: sleepInterruptibleSab,
    sleep_async_promise: (seconds) =>
      new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(seconds) * 1000))),
    check_interrupt: () => {
      if (activeTier === 1 && pyodide) pyodide.checkInterrupt();
    },
    request_stdin_jspi: requestStdinJspi,
    emit_link_request: (url) => {
      self.postMessage({ type: 'link.request', url: String(url) });
    },
  });

  await installRuntimePackage(runtimeBaseUrl);

  const pythonVersion = String(
    pyodide.runPython('import sys; ".".join(map(str, sys.version_info[:3]))'),
  );
  const pyodideVersion = String(pyodide.version || 'unknown');

  self.postMessage({ type: 'status', phase: 'ready', message: 'Python ready' });
  self.postMessage({
    type: 'ready',
    id,
    pyodideVersion,
    pythonVersion,
    tier: activeTier,
    crossOriginIsolated: isolated,
    canRunSync,
  });
}

async function handleRun(msg) {
  if (!pyodide) {
    self.postMessage({ type: 'error', id: msg.id, message: 'Pyodide is not initialized' });
    return;
  }

  const filename = msg.filename || 'main.py';
  const code = String(msg.code ?? '');
  const files = msg.files && typeof msg.files === 'object' ? msg.files : null;
  const autoLoadPackages = msg.autoLoadPackages !== false;

  resetRunBuffers();
  const t0 = performance.now();
  self.postMessage({ type: 'status', phase: 'running', message: `Running ${filename}…` });
  self.postMessage({ type: 'run.start', id: msg.id, filename });

  try {
    if (autoLoadPackages && code.trim()) {
      self.postMessage({
        type: 'status',
        phase: 'loading-packages',
        message: 'Checking imports…',
      });
      try {
        await pyodide.loadPackagesFromImports(code);
      } catch {
        // Let CPython raise its own normal ModuleNotFoundError if an unbundled package is imported.
      }
      self.postMessage({ type: 'status', phase: 'running', message: `Running ${filename}…` });
    }

    // Re-clear any stale interrupt right before entering user code.
    if (ctrlView) Atomics.store(ctrlView, CTRL_INTERRUPT, 0);

    pyodide.globals.set('_yotasage_run_code', code);
    pyodide.globals.set('_yotasage_run_filename', filename);
    pyodide.globals.set('_yotasage_run_files', files ? pyodide.toPy(files) : null);

    let rawResult;
    const expr =
      'import yotasage_rt; yotasage_rt.run_script(_yotasage_run_code, _yotasage_run_filename, _yotasage_run_files)';
    if (activeTier === 1) {
      rawResult = pyodide.runPython(expr);
    } else {
      rawResult = await pyodide.runPythonAsync(expr);
    }
    const result = pyResultToPlain(rawResult) || {
      ok: true,
      exitCode: 0,
      interrupted: false,
    };

    flushStreamDecoders();
    self.postMessage({
      type: 'run.end',
      id: msg.id,
      ok: Boolean(result.ok),
      exitCode: Number.isInteger(result.exitCode) ? result.exitCode : 0,
      interrupted: Boolean(result.interrupted),
      durationMs: Math.max(0, performance.now() - t0),
      ...(result.error ? { error: result.error } : {}),
    });
  } catch (err) {
    flushStreamDecoders();
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({
      type: 'run.end',
      id: msg.id,
      ok: false,
      exitCode: 1,
      interrupted: false,
      durationMs: Math.max(0, performance.now() - t0),
      error: {
        type: 'RuntimeError',
        message,
        formatted: `${message}\n`,
        frames: [],
      },
    });
  } finally {
    try {
      pyodide.globals.delete('_yotasage_run_code');
      pyodide.globals.delete('_yotasage_run_filename');
      pyodide.globals.delete('_yotasage_run_files');
    } catch {
      // ignore cleanup error
    }
    resetRunBuffers();
    self.postMessage({ type: 'status', phase: 'idle', message: 'Python ready' });
  }
}

async function handleReplPush(msg) {
  if (!pyodide) {
    self.postMessage({ type: 'error', id: msg.id, message: 'Pyodide is not initialized' });
    return;
  }

  resetRunBuffers();
  try {
    pyodide.globals.set('_yotasage_repl_line', String(msg.line ?? ''));
    const raw = await pyodide.runPythonAsync(
      'import yotasage_rt; await yotasage_rt.repl_push(_yotasage_repl_line)',
    );
    const res = pyResultToPlain(raw) || { status: 'complete' };
    flushStreamDecoders();
    self.postMessage({
      type: 'repl.result',
      id: msg.id,
      status: res.status || 'complete',
      ...(res.error ? { error: res.error } : {}),
    });
  } catch (err) {
    flushStreamDecoders();
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({
      type: 'repl.result',
      id: msg.id,
      status: 'error',
      error: {
        type: 'RuntimeError',
        message,
        formatted: `${message}\n`,
        frames: [],
      },
    });
  } finally {
    try {
      pyodide.globals.delete('_yotasage_repl_line');
    } catch {
      // ignore
    }
    resetRunBuffers();
  }
}

function handleReplComplete(msg) {
  if (!pyodide) {
    self.postMessage({ type: 'repl.completions', id: msg.id, completions: [], start: 0 });
    return;
  }
  try {
    pyodide.globals.set('_yotasage_repl_src', String(msg.source ?? ''));
    const raw = pyodide.runPython(
      'import yotasage_rt; yotasage_rt.repl_complete(_yotasage_repl_src)',
    );
    const res = pyResultToPlain(raw) || { completions: [], start: 0 };
    self.postMessage({
      type: 'repl.completions',
      id: msg.id,
      completions: Array.isArray(res.completions) ? res.completions : [],
      start: Number.isInteger(res.start) ? res.start : 0,
    });
  } catch {
    self.postMessage({ type: 'repl.completions', id: msg.id, completions: [], start: 0 });
  } finally {
    try {
      pyodide.globals.delete('_yotasage_repl_src');
    } catch {
      // ignore
    }
  }
}

function handleStdinReply(msg) {
  if (!jspiStdinResolver || jspiStdinResolver.seq !== msg.seq) return;
  const resolver = jspiStdinResolver;
  jspiStdinResolver = null;
  if (msg.interrupted) {
    resolver.reject(new Error('KeyboardInterrupt'));
  } else if (msg.eof || msg.text === null) {
    resolver.resolve(null);
  } else {
    resolver.resolve(String(msg.text));
  }
}

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  switch (msg.type) {
    case 'init':
      handleInit(msg).catch((err) => {
        self.postMessage({
          type: 'error',
          id: msg.id,
          message: err instanceof Error ? err.message : String(err),
        });
      });
      break;
    case 'run':
      handleRun(msg);
      break;
    case 'repl.push':
      handleReplPush(msg);
      break;
    case 'repl.complete':
      handleReplComplete(msg);
      break;
    case 'stdin.reply':
      handleStdinReply(msg);
      break;
    default:
      break;
  }
});
