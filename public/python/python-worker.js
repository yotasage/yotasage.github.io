/* eslint-disable no-restricted-globals */
// In-scope ES module Web Worker for Pyodide (/python/python-worker.js).
// Lives under /python/ so /python/coi-sw.js intercepts the worker script fetch and applies
// COOP/COEP + strict worker CSP (without 'unsafe-eval').
// Syncs /workspace MEMFS with Option 3B Dedicated Storage Worker over a direct MessageChannel.

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

const WORKSPACE_ROOT = '/workspace';
const MAX_DELTA_FILE_BYTES = 50 * 1024 * 1024;
const MAX_IMPORT_SCAN_BYTES = 256 * 1024;
const RT_FILES = ['__init__.py', 'stdio.py', 'shims.py', 'runner.py', 'repl.py', 'mpl_backend.py', 'packages.py', 'vdisplay.py'];
const WHEEL_DIR = '/tmp/yotasage-wheels';
const WHEEL_NAME_RE = /^[A-Za-z0-9._+-]{1,251}\.whl$/;

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

// Option 3B Storage Worker MessageChannel + MEMFS write-through state
let storagePort = null;
let workspaceRootNode = null;
let suppressWriteThrough = false;
let isRunActive = false;
let runInProgress = false;
let pkgQueue = Promise.resolve();
let appliedStorageRev = 0;
let portReqId = 1;
const pendingPortRpcs = new Map();
const revWaiters = [];

const stdoutDecoder = new TextDecoder('utf-8', { fatal: false });
const stderrDecoder = new TextDecoder('utf-8', { fatal: false });
const textEncoder = new TextEncoder();

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

// --- Workspace MEMFS write-through & Storage Worker sync ---

function normalizeRelPath(raw) {
  let s = String(raw || '').replace(/\\/g, '/');
  if (s.startsWith(`${WORKSPACE_ROOT}/`)) s = s.slice(WORKSPACE_ROOT.length + 1);
  s = s.replace(/^\/+/, '');
  while (s.startsWith('./')) s = s.slice(2);
  s = s.replace(/\/+$/, '');
  if (!s) return null;
  const parts = s.split('/');
  for (const p of parts) {
    if (!p || p === '.' || p === '..') return null;
  }
  return parts.join('/');
}

function getNodeRelPath(node) {
  if (!workspaceRootNode || !node) return null;
  const parts = [];
  let cur = node;
  while (cur && cur !== workspaceRootNode && cur.parent && cur.parent !== cur) {
    if (cur.name) parts.push(cur.name);
    cur = cur.parent;
  }
  if (cur !== workspaceRootNode) return null;
  parts.reverse();
  return parts.join('/');
}

function getChildRelPath(parent, name) {
  const base = getNodeRelPath(parent);
  if (base === null) return null;
  return base ? `${base}/${name}` : String(name);
}

function readNodeBytesCopy(node) {
  const size = Number(node.usedBytes) || 0;
  if (size <= 0 || !node.contents) return new Uint8Array(0);
  if (node.contents instanceof Uint8Array) {
    return node.contents.slice(0, size);
  }
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    out[i] = node.contents[i] & 0xff;
  }
  return out;
}

function emitNodePut(node, forceCreatedByRun) {
  if (!storagePort || !node) return;
  const rel = getNodeRelPath(node);
  if (!rel) return;
  const size = Number(node.usedBytes) || 0;
  if (size > MAX_DELTA_FILE_BYTES) {
    return;
  }
  const copy = readNodeBytesCopy(node);
  node.__lastEmittedSeq = node.__writeSeq || 0;
  try {
    storagePort.postMessage(
      {
        type: 'put',
        path: rel,
        bytes: copy,
        mtime: Date.now(),
        createdByRun: forceCreatedByRun !== undefined ? Boolean(forceCreatedByRun) : isRunActive,
      },
      [copy.buffer],
    );
  } catch {
    // ignore port error
  }
}

function emitMkdir(rel) {
  if (!storagePort || !rel) return;
  try {
    storagePort.postMessage({
      type: 'mkdir',
      path: rel,
      mtime: Date.now(),
      createdByRun: isRunActive,
    });
  } catch {
    // ignore
  }
}

function emitDelete(rel) {
  if (!storagePort || !rel) return;
  try {
    storagePort.postMessage({ type: 'delete', path: rel });
  } catch {
    // ignore
  }
}

function emitRename(fromRel, toRel) {
  if (!storagePort || !fromRel || !toRel) return;
  try {
    storagePort.postMessage({ type: 'rename', from: fromRel, to: toRel });
  } catch {
    // ignore
  }
}

function mountWorkspaceMemfs() {
  const FS = pyodide.FS;
  try {
    FS.mkdir(WORKSPACE_ROOT);
  } catch {
    // already exists
  }

  const workspaceFs = {
    mount(mount) {
      const mnt = FS.filesystems.MEMFS.mount(mount);
      workspaceRootNode = mnt;
      const origNodeOps = mnt.node_ops;
      const wrappedNodeOps = { ...origNodeOps };

      const attachNodeHooks = (node, mode) => {
        node.node_ops = wrappedNodeOps;
        if (FS.isFile(mode)) {
          const origStreamOps = node.stream_ops;
          node.stream_ops = { ...origStreamOps };
          node.stream_ops.write = (stream, buffer, offset, length, position, canOwn) => {
            stream.node.__dirty = true;
            stream.node.__writeSeq = (stream.node.__writeSeq || 0) + 1;
            return origStreamOps.write(stream, buffer, offset, length, position, canOwn);
          };
          node.stream_ops.close = (stream) => {
            const n = stream.node;
            const res = origStreamOps.close ? origStreamOps.close(stream) : 0;
            if (n.__dirty) {
              n.__dirty = false;
              if (!suppressWriteThrough) {
                emitNodePut(n);
              }
            }
            return res;
          };
        }
      };

      wrappedNodeOps.mknod = (parent, name, mode, dev) => {
        const node = origNodeOps.mknod(parent, name, mode, dev);
        attachNodeHooks(node, mode);
        if (FS.isFile(mode)) {
          node.__dirty = true;
          node.__writeSeq = 1;
        } else if (FS.isDir(mode) && !suppressWriteThrough) {
          emitMkdir(getChildRelPath(parent, name));
        }
        return node;
      };

      wrappedNodeOps.setattr = (node, attr) => {
        origNodeOps.setattr(node, attr);
        if (attr && attr.size !== undefined && FS.isFile(node.mode)) {
          node.__dirty = true;
          node.__writeSeq = (node.__writeSeq || 0) + 1;
        }
      };

      wrappedNodeOps.unlink = (parent, name) => {
        const rel = getChildRelPath(parent, name);
        origNodeOps.unlink(parent, name);
        if (!suppressWriteThrough && rel) {
          emitDelete(rel);
        }
      };

      wrappedNodeOps.rmdir = (parent, name) => {
        const rel = getChildRelPath(parent, name);
        origNodeOps.rmdir(parent, name);
        if (!suppressWriteThrough && rel) {
          emitDelete(rel);
        }
      };

      wrappedNodeOps.rename = (oldNode, newDir, newName) => {
        const fromRel = getNodeRelPath(oldNode);
        const toRel = getChildRelPath(newDir, newName);
        origNodeOps.rename(oldNode, newDir, newName);
        if (!suppressWriteThrough && fromRel && toRel) {
          emitRename(fromRel, toRel);
        }
      };

      mnt.node_ops = wrappedNodeOps;
      return mnt;
    },
  };

  FS.mount(workspaceFs, {}, WORKSPACE_ROOT);
}

function ensureParentDirsMemfs(relPath) {
  const FS = pyodide.FS;
  const parts = relPath.split('/');
  let cur = WORKSPACE_ROOT;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cur += `/${parts[i]}`;
    try {
      FS.mkdir(cur);
    } catch {
      // exists
    }
  }
}

function rmTreeMemfs(fullPath) {
  const FS = pyodide.FS;
  let stat;
  try {
    stat = FS.stat(fullPath);
  } catch {
    return;
  }
  if (FS.isDir(stat.mode)) {
    const names = FS.readdir(fullPath);
    for (const name of names) {
      if (name === '.' || name === '..') continue;
      rmTreeMemfs(`${fullPath}/${name}`);
    }
    if (fullPath !== WORKSPACE_ROOT) {
      try {
        FS.rmdir(fullPath);
      } catch {
        // ignore
      }
    }
  } else {
    try {
      FS.unlink(fullPath);
    } catch {
      // ignore
    }
  }
}

function clearWorkspaceMemfs() {
  const FS = pyodide.FS;
  let names = [];
  try {
    names = FS.readdir(WORKSPACE_ROOT);
  } catch {
    return;
  }
  for (const name of names) {
    if (name === '.' || name === '..') continue;
    rmTreeMemfs(`${WORKSPACE_ROOT}/${name}`);
  }
}

function applyMemfsWrite(rawPath, bytes, suppress) {
  const rel = normalizeRelPath(rawPath);
  if (!rel || !pyodide) return;
  const prev = suppressWriteThrough;
  suppressWriteThrough = suppress;
  try {
    ensureParentDirsMemfs(rel);
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    pyodide.FS.writeFile(`${WORKSPACE_ROOT}/${rel}`, data);
  } catch {
    // ignore malformed mirror
  } finally {
    suppressWriteThrough = prev;
  }
}

function applyMemfsMkdir(rawPath, suppress) {
  const rel = normalizeRelPath(rawPath);
  if (!rel || !pyodide) return;
  const prev = suppressWriteThrough;
  suppressWriteThrough = suppress;
  try {
    ensureParentDirsMemfs(rel);
    try {
      pyodide.FS.mkdir(`${WORKSPACE_ROOT}/${rel}`);
    } catch {
      // exists
    }
  } finally {
    suppressWriteThrough = prev;
  }
}

function applyMemfsDelete(rawPath, suppress) {
  const rel = normalizeRelPath(rawPath);
  if (!rel || !pyodide) return;
  const prev = suppressWriteThrough;
  suppressWriteThrough = suppress;
  try {
    rmTreeMemfs(`${WORKSPACE_ROOT}/${rel}`);
  } finally {
    suppressWriteThrough = prev;
  }
}

function applyMemfsRename(rawFrom, rawTo, suppress) {
  const from = normalizeRelPath(rawFrom);
  const to = normalizeRelPath(rawTo);
  if (!from || !to || !pyodide) return;
  const prev = suppressWriteThrough;
  suppressWriteThrough = suppress;
  try {
    ensureParentDirsMemfs(to);
    try {
      rmTreeMemfs(`${WORKSPACE_ROOT}/${to}`);
    } catch {
      // ignore
    }
    pyodide.FS.rename(`${WORKSPACE_ROOT}/${from}`, `${WORKSPACE_ROOT}/${to}`);
  } catch {
    // ignore if missing
  } finally {
    suppressWriteThrough = prev;
  }
}

function applyMemfsEntries(entries, replaceWorkspace) {
  if (!pyodide) return;
  const prev = suppressWriteThrough;
  suppressWriteThrough = true;
  try {
    if (replaceWorkspace) {
      clearWorkspaceMemfs();
    }
    const dirs = [];
    const files = [];
    for (const item of entries || []) {
      const rel = normalizeRelPath(item.path);
      if (!rel) continue;
      if (item.isDir) dirs.push(rel);
      else files.push({ rel, bytes: item.bytes });
    }
    dirs.sort((a, b) => a.split('/').length - b.split('/').length);
    for (const d of dirs) {
      ensureParentDirsMemfs(d);
      try {
        pyodide.FS.mkdir(`${WORKSPACE_ROOT}/${d}`);
      } catch {
        // exists
      }
    }
    for (const f of files) {
      ensureParentDirsMemfs(f.rel);
      const data = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes || 0);
      pyodide.FS.writeFile(`${WORKSPACE_ROOT}/${f.rel}`, data);
    }
  } finally {
    suppressWriteThrough = prev;
  }
}

function markStorageRev(rev) {
  if (typeof rev === 'number' && rev > appliedStorageRev) {
    appliedStorageRev = rev;
  }
  for (let i = revWaiters.length - 1; i >= 0; i -= 1) {
    if (appliedStorageRev >= revWaiters[i].targetRev) {
      const w = revWaiters.splice(i, 1)[0];
      clearTimeout(w.timer);
      w.resolve(true);
    }
  }
}

function attachStoragePort(port) {
  storagePort = port;
  port.onmessage = (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

    if (msg.type === 'hydrate.result' || msg.type === 'flush.ack') {
      const rpc = pendingPortRpcs.get(msg.id);
      if (rpc) {
        pendingPortRpcs.delete(msg.id);
        clearTimeout(rpc.timer);
        rpc.resolve(msg);
      }
      return;
    }

    if (!pyodide) return;
    switch (msg.type) {
      case 'mirror.write':
        applyMemfsWrite(msg.path, msg.bytes, true);
        markStorageRev(msg.rev);
        break;
      case 'mirror.mkdir':
        applyMemfsMkdir(msg.path, true);
        markStorageRev(msg.rev);
        break;
      case 'mirror.delete':
        applyMemfsDelete(msg.path, true);
        markStorageRev(msg.rev);
        break;
      case 'mirror.rename':
        applyMemfsRename(msg.from, msg.to, true);
        markStorageRev(msg.rev);
        break;
      case 'mirror.clear': {
        const prev = suppressWriteThrough;
        suppressWriteThrough = true;
        try {
          clearWorkspaceMemfs();
        } finally {
          suppressWriteThrough = prev;
        }
        markStorageRev(msg.rev);
        break;
      }
      case 'mirror.bulkWrite':
        applyMemfsEntries(msg.entries, Boolean(msg.replaceWorkspace));
        markStorageRev(msg.rev);
        break;
      default:
        break;
    }
  };
}

function portRpc(payload, timeoutMs = 15000) {
  if (!storagePort) return Promise.resolve(null);
  const id = portReqId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingPortRpcs.delete(id);
      resolve(null);
    }, timeoutMs);
    pendingPortRpcs.set(id, { resolve, timer });
    try {
      storagePort.postMessage({ ...payload, id });
    } catch {
      clearTimeout(timer);
      pendingPortRpcs.delete(id);
      resolve(null);
    }
  });
}

async function hydrateWorkspaceFromStorage() {
  if (!storagePort || !pyodide) return;
  const res = await portRpc({ type: 'hydrate' }, 20000);
  if (!res || !res.ok) return;
  applyMemfsEntries(res.entries, true);
  if (typeof res.rev === 'number') {
    markStorageRev(res.rev);
  }
}

async function waitForStorageRev(targetRev) {
  if (!storagePort || typeof targetRev !== 'number' || targetRev <= appliedStorageRev) {
    return;
  }
  const ok = await new Promise((resolve) => {
    const waiter = {
      targetRev,
      resolve,
      timer: setTimeout(() => {
        const idx = revWaiters.indexOf(waiter);
        if (idx >= 0) revWaiters.splice(idx, 1);
        resolve(false);
      }, 1500),
    };
    revWaiters.push(waiter);
  });
  if (!ok) {
    await hydrateWorkspaceFromStorage();
  }
}

async function flushStoragePort() {
  if (!storagePort) return;
  await portRpc({ type: 'flush' }, 10000);
}

function snapshotWorkspace() {
  const map = new Map();
  if (!pyodide) return map;
  const FS = pyodide.FS;

  const walk = (fullDir, relPrefix) => {
    let names;
    try {
      names = FS.readdir(fullDir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name === '.' || name === '..') continue;
      const full = `${fullDir}/${name}`;
      const rel = relPrefix ? `${relPrefix}/${name}` : name;
      let lookup;
      try {
        lookup = FS.lookupPath(full, { follow: false });
      } catch {
        continue;
      }
      const node = lookup.node;
      if (FS.isDir(node.mode)) {
        map.set(rel, { isDir: true, size: 0, mtime: node.timestamp || 0, writeSeq: 0, node });
        walk(full, rel);
      } else if (FS.isFile(node.mode)) {
        map.set(rel, {
          isDir: false,
          size: Number(node.usedBytes) || 0,
          mtime: node.timestamp || 0,
          writeSeq: node.__writeSeq || 0,
          node,
        });
      }
    }
  };
  walk(WORKSPACE_ROOT, '');
  return map;
}

function reconcileAndDiff(preSnap, postSnap) {
  const created = [];
  const modified = [];
  const deleted = [];

  for (const [rel, post] of postSnap) {
    const pre = preSnap.get(rel);
    if (!pre) {
      if (!post.isDir) {
        created.push(rel);
        if (storagePort && post.node.__lastEmittedSeq !== post.writeSeq) {
          emitNodePut(post.node, true);
          post.node.__dirty = false;
        }
      }
    } else if (!post.isDir) {
      const changed =
        pre.isDir !== post.isDir ||
        pre.size !== post.size ||
        pre.writeSeq !== post.writeSeq ||
        post.node.__dirty;
      if (changed) {
        modified.push(rel);
        if (storagePort && (post.node.__dirty || post.node.__lastEmittedSeq !== post.writeSeq)) {
          emitNodePut(post.node, true);
          post.node.__dirty = false;
        }
      }
    }
  }

  for (const [rel, pre] of preSnap) {
    if (!postSnap.has(rel) && !pre.isDir) {
      deleted.push(rel);
    }
  }

  created.sort();
  modified.sort();
  deleted.sort();
  return { created, modified, deleted };
}

function collectPythonSourcesForImportScan(entryCode) {
  const parts = [];
  let total = 0;
  if (typeof entryCode === 'string' && entryCode.trim()) {
    parts.push(entryCode);
    total += entryCode.length;
  }
  if (!pyodide) return parts.join('\n');
  const FS = pyodide.FS;
  const snap = snapshotWorkspace();
  for (const [rel, info] of snap) {
    if (info.isDir || !rel.endsWith('.py')) continue;
    if (info.size <= 0 || total + info.size > MAX_IMPORT_SCAN_BYTES) continue;
    try {
      const src = FS.readFile(`${WORKSPACE_ROOT}/${rel}`, { encoding: 'utf8' });
      parts.push(src);
      total += src.length;
    } catch {
      // ignore
    }
  }
  return parts.join('\n');
}

// --- Security probe, SAB/JSPI stdio, and Pyodide runtime ---

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
yotasage_rt.install_runtime(${activeTier}, ${JSON.stringify(networkMode)}, ${JSON.stringify(self.location.origin)})
`);
}

function dropGlobals(...names) {
  for (const name of names) {
    try {
      pyodide.globals.delete(name);
    } catch {
      // ignore
    }
  }
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

function extractBytesCopy(raw) {
  if (raw instanceof Uint8Array) return raw.slice();
  if (raw && typeof raw.getBuffer === 'function') {
    const buf = raw.getBuffer('u8');
    try {
      return buf.data.slice();
    } finally {
      buf.release();
    }
  }
  if (raw && typeof raw.toJs === 'function') {
    const jsVal = raw.toJs();
    return jsVal instanceof Uint8Array ? jsVal.slice() : new Uint8Array(jsVal);
  }
  return new Uint8Array(raw || 0);
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

  if (payload.storagePort && typeof payload.storagePort.postMessage === 'function') {
    attachStoragePort(payload.storagePort);
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

  // Mount Option 3B MEMFS write-through workspace and hydrate persisted files before ready.
  mountWorkspaceMemfs();
  if (storagePort) {
    await hydrateWorkspaceFromStorage();
  }

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
    emit_plot: (plotId, title, width, height, pngBytesRaw, canExportVector, source) => {
      const pngBytes = extractBytesCopy(pngBytesRaw);
      self.postMessage(
        {
          type: 'plot.new',
          plotId: String(plotId),
          title: String(title || ''),
          width: Math.max(1, Number(width) | 0),
          height: Math.max(1, Number(height) | 0),
          pngBytes,
          canExportVector: Boolean(canExportVector),
          source: source === 'pillow' ? 'pillow' : 'matplotlib',
          createdAt: Date.now(),
        },
        [pngBytes.buffer],
      );
    },
  });

  (await import('./display-host.js')).installDisplayHost(pyodide, ctrlView, activeTier);
  await installRuntimePackage(runtimeBaseUrl);

  const pythonVersion = String(
    pyodide.runPython('import sys; ".".join(map(str, sys.version_info[:3]))'),
  );
  const pyodideVersion = String(pyodide.version || 'unknown');
  const lockInfo = pyResultToPlain(pyodide.runPython('import yotasage_rt.packages as p; p.runtime_info()')) || {};

  self.postMessage({ type: 'status', phase: 'ready', message: 'Python ready' });
  self.postMessage({
    type: 'ready',
    id,
    pyodideVersion,
    pythonVersion,
    tier: activeTier,
    crossOriginIsolated: isolated,
    canRunSync,
    abiVersion: String(lockInfo.abiVersion || ''),
    platform: String(lockInfo.platform || ''),
  });
}

async function postFsDiff(preSnap) {
  const diff = reconcileAndDiff(preSnap, snapshotWorkspace());
  await flushStoragePort();
  if (diff.created.length > 0 || diff.modified.length > 0 || diff.deleted.length > 0) {
    self.postMessage({ type: 'fs.changed', ...diff });
  }
}

async function handleRun(msg) {
  if (!pyodide) {
    self.postMessage({ type: 'error', id: msg.id, message: 'Pyodide is not initialized' });
    return;
  }
  runInProgress = true;
  await pkgQueue;

  const rawFilename = msg.filename || 'main.py';
  const relFilename = normalizeRelPath(rawFilename) || 'main.py';
  const hasExplicitCode = typeof msg.code === 'string';
  const code = hasExplicitCode ? msg.code : null;
  const files = msg.files && typeof msg.files === 'object' ? msg.files : null;
  const autoLoadPackages = msg.autoLoadPackages !== false;

  resetRunBuffers();
  const t0 = performance.now();
  self.postMessage({ type: 'status', phase: 'running', message: `Running ${relFilename}…` });
  self.postMessage({ type: 'run.start', id: msg.id, filename: relFilename });

  let preSnap = null;

  try {
    // Ensure any pending UI edits from the Storage Worker have reached MEMFS before running.
    if (typeof msg.syncRev === 'number') {
      await waitForStorageRev(msg.syncRev);
    }

    // Sync explicit files / inline code before snapshotting so fs.changed reports only script writes.
    isRunActive = false;
    if (files) {
      for (const [rel, content] of Object.entries(files)) {
        applyMemfsWrite(rel, textEncoder.encode(String(content)), false);
      }
    }
    if (hasExplicitCode) {
      applyMemfsWrite(relFilename, textEncoder.encode(code), false);
    }

    if (autoLoadPackages) {
      const scanSource = collectPythonSourcesForImportScan(code);
      if (scanSource.trim()) {
        self.postMessage({
          type: 'status',
          phase: 'loading-packages',
          message: 'Checking imports…',
        });
        try {
          await pyodide.loadPackagesFromImports(scanSource);
        } catch {
          // Let CPython raise its own normal ModuleNotFoundError if an unbundled package is imported.
        }
        self.postMessage({ type: 'status', phase: 'running', message: `Running ${relFilename}…` });
      }
    }

    // Re-clear any stale interrupt right before entering user code.
    if (ctrlView) Atomics.store(ctrlView, CTRL_INTERRUPT, 0);

    preSnap = snapshotWorkspace();
    isRunActive = true;

    pyodide.globals.set('_yotasage_run_filename', relFilename);

    let rawResult;
    const expr = 'import yotasage_rt; yotasage_rt.run_script(None, _yotasage_run_filename, None)';
    if (activeTier === 1) {
      rawResult = pyodide.runPython(expr);
    } else {
      rawResult = await pyodide.runPythonAsync(expr);
    }
    isRunActive = false;

    const result = pyResultToPlain(rawResult) || {
      ok: true,
      exitCode: 0,
      interrupted: false,
    };

    await postFsDiff(preSnap);
    flushStreamDecoders();
    const missing = pyResultToPlain(pyodide.runPython('import yotasage_rt.packages as p; p.take_missing()'));
    self.postMessage({
      type: 'run.end',
      id: msg.id,
      ok: Boolean(result.ok),
      exitCode: Number.isInteger(result.exitCode) ? result.exitCode : 0,
      interrupted: Boolean(result.interrupted),
      durationMs: Math.max(0, performance.now() - t0),
      ...(result.error ? { error: result.error } : {}),
      ...(Array.isArray(missing) && missing.length > 0 ? { missingPackages: missing } : {}),
    });
  } catch (err) {
    isRunActive = false;
    if (preSnap) {
      try {
        await postFsDiff(preSnap);
      } catch {
        // ignore reconciliation error during error path
      }
    }
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
    isRunActive = false;
    runInProgress = false;
    dropGlobals('_yotasage_run_filename');
    resetRunBuffers();
    self.postMessage({ type: 'status', phase: 'idle', message: 'Python ready' });
  }
}

async function handleReplPush(msg) {
  if (!pyodide) {
    self.postMessage({ type: 'error', id: msg.id, message: 'Pyodide is not initialized' });
    return;
  }

  await pkgQueue;
  resetRunBuffers();
  try {
    const line = String(msg.line ?? '');
    if (/import/.test(line)) {
      // Load bundled packages a console line imports, as handleRun does for scripts.
      await pyodide.loadPackagesFromImports(line.trim()).catch(() => {});
    }
    pyodide.globals.set('_yotasage_repl_line', line);
    const raw = await pyodide.runPythonAsync(
      'import yotasage_rt; await yotasage_rt.repl_push(_yotasage_repl_line)',
    );
    const res = pyResultToPlain(raw) || { status: 'complete' };
    await flushStoragePort();
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
    dropGlobals('_yotasage_repl_line');
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
    dropGlobals('_yotasage_repl_src');
  }
}

function handlePlotExport(msg) {
  const id = String(msg.id ?? '');
  const plotId = String(msg.plotId ?? '');
  const format = msg.format === 'pdf' ? 'pdf' : 'svg';
  const fail = (error) =>
    self.postMessage({ type: 'plot.export.result', id, ok: false, plotId, format, error });
  if (!pyodide) {
    fail('Pyodide is not initialized');
    return;
  }
  try {
    pyodide.globals.set('_yotasage_exp_id', plotId);
    pyodide.globals.set('_yotasage_exp_fmt', format);
    const raw = pyodide.runPython(
      'import yotasage_rt; yotasage_rt.export_live_plot(_yotasage_exp_id, _yotasage_exp_fmt)',
    );
    const res = pyResultToPlain(raw);
    if (res && res.ok && res.bytes) {
      const bytes = extractBytesCopy(res.bytes);
      self.postMessage(
        { type: 'plot.export.result', id, ok: true, plotId, format, bytes },
        [bytes.buffer],
      );
    } else {
      fail(String((res && (res.error || res.reason)) || 'Plot export failed'));
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  } finally {
    dropGlobals('_yotasage_exp_id', '_yotasage_exp_fmt');
  }
}

// Package operations run between runs, one at a time; refused while a run is active.
function handlePkg(msg) {
  const isList = msg.type === 'pkg.list';
  const reply = (body) =>
    self.postMessage({ type: isList ? 'pkg.list.result' : 'pkg.result', id: msg.id, ...body });
  const empty = isList ? { packages: [] } : { installed: [], failed: [] };
  if (!pyodide || runInProgress) {
    reply({ ...empty, refused: pyodide ? 'run-active' : 'not-ready' });
    return;
  }
  pkgQueue = pkgQueue.then(async () => {
    try {
      if (isList) {
        const raw = pyodide.runPython('import yotasage_rt.packages as p; p.list_installed()');
        reply({ packages: pyResultToPlain(raw) || [] });
        return;
      }
      self.postMessage({ type: 'status', phase: 'installing', message: 'Installing packages…' });
      const items = [];
      for (const it of Array.isArray(msg.items) ? msg.items.slice(0, 500) : []) {
        if (!it || typeof it !== 'object') continue;
        const { bytes, ...rest } = it;
        if (it.kind === 'wheel' && bytes instanceof Uint8Array && WHEEL_NAME_RE.test(String(it.fileName))) {
          pyodide.FS.mkdirTree(WHEEL_DIR);
          pyodide.FS.writeFile(`${WHEEL_DIR}/${it.fileName}`, bytes);
        }
        items.push(rest);
      }
      pyodide.globals.set('_yotasage_pkg_items', JSON.stringify(items));
      const raw = await pyodide.runPythonAsync(
        'import yotasage_rt.packages as p; await p.install(_yotasage_pkg_items)',
      );
      const res = pyResultToPlain(raw) || {};
      reply({ installed: res.installed || [], failed: res.failed || [] });
    } catch (err) {
      const detail = (err instanceof Error ? err.message : String(err)).slice(0, 8000);
      reply(isList ? empty : {
        installed: [],
        failed: [{ requirement: '', kind: 'other', message: "Packages couldn't be installed.", detail }],
      });
    } finally {
      dropGlobals('_yotasage_pkg_items');
      if (!isList) self.postMessage({ type: 'status', phase: 'idle', message: 'Python ready' });
    }
  });
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
    case 'fs.write':
      applyMemfsWrite(msg.path, msg.bytes, true);
      markStorageRev(msg.rev);
      break;
    case 'fs.mkdir':
      applyMemfsMkdir(msg.path, true);
      markStorageRev(msg.rev);
      break;
    case 'fs.rename':
      applyMemfsRename(msg.from, msg.to, true);
      markStorageRev(msg.rev);
      break;
    case 'fs.delete':
      applyMemfsDelete(msg.path, true);
      markStorageRev(msg.rev);
      break;
    case 'fs.sync':
      void hydrateWorkspaceFromStorage();
      break;
    case 'plot.export':
      handlePlotExport(msg);
      break;
    case 'pkg.install':
    case 'pkg.list':
      handlePkg(msg);
      break;
    default:
      break;
  }
});
