/* eslint-disable no-restricted-globals */
// Option 3B Dedicated Storage Worker (/python/storage-worker.js).
// - Runs under /python/coi-sw.js with strict Off CSP (connect-src 'self', worker-src 'none').
// - Never runs untrusted user Python and is never Force Stopped (eliminates WebKit IDB deadlock).
// - Owns IndexedDB database "python-playground" (v2) storing Uint8Array payloads (never Blob).
// - Enforces path rules and exact uncompressed byte/entry caps outside the untrusted Python worker.
// - Owns the schema: v2 adds the store "wheels" (saved wheel bytes keyed by SHA-256, P5b), which
//   /python/wheel-worker.js reads and writes (a module import here would be refused by this worker's
//   own CSP, worker-src 'none', in Firefox and WebKit).

const DB_NAME = 'python-playground';
const DB_VERSION = 2;
const STORE_WORKSPACES = 'workspaces';
const STORE_FILES = 'files';
const STORE_WHEELS = 'wheels';

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MiB
const MAX_WORKSPACE_BYTES = 150 * 1024 * 1024; // 150 MiB
const MAX_WORKSPACE_ENTRIES = 2_000;
const MAX_PATH_LENGTH = 256;
const MAX_PATH_DEPTH = 16;

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:/;

let db = null;
let dbOpenPromise = null;
let isClosed = false;
let controlChannel = null;

/** @type {Map<string, { entries: Map<string, { isDir: boolean, size: number, mtime: number, createdByRun: boolean }>, totalBytes: number, entryCount: number, loaded: boolean, rev: number }>} */
const ledgers = new Map();
/** @type {Map<string, Promise<unknown>>} */
const queues = new Map();
/** @type {Map<string, MessagePort>} */
const pythonPorts = new Map();

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function normalizePath(raw, allowTrailingSlash = false) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw makeError('INVALID_PATH', 'Path must be a non-empty string');
  }
  if (CONTROL_CHAR_RE.test(raw)) {
    throw makeError('INVALID_PATH', 'Path must not contain NUL or control characters');
  }
  if (WINDOWS_DRIVE_RE.test(raw)) {
    throw makeError('INVALID_PATH', 'Windows drive letters are not allowed');
  }
  if (raw.startsWith('/') || raw.startsWith('\\')) {
    throw makeError('INVALID_PATH', 'Absolute paths are not allowed');
  }
  let cleaned = raw.replace(/\\/g, '/');
  while (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2);
  }
  if (allowTrailingSlash) {
    while (cleaned.endsWith('/')) {
      cleaned = cleaned.slice(0, -1);
    }
  }
  if (cleaned.length === 0 || cleaned.startsWith('/')) {
    throw makeError('INVALID_PATH', 'Path must not be empty or absolute');
  }
  const segments = cleaned.split('/');
  if (segments.length > MAX_PATH_DEPTH) {
    throw makeError('INVALID_PATH', `Path exceeds maximum depth (${MAX_PATH_DEPTH})`);
  }
  for (const seg of segments) {
    if (seg.length === 0 || seg === '.' || seg === '..' || seg.includes(':') || seg.trim().length === 0) {
      throw makeError('INVALID_PATH', `Invalid path segment "${seg}"`);
    }
  }
  const norm = segments.join('/');
  if (norm.length > MAX_PATH_LENGTH) {
    throw makeError('INVALID_PATH', `Path exceeds maximum length (${MAX_PATH_LENGTH})`);
  }
  return norm;
}

function ancestorDirs(path) {
  const parts = path.split('/');
  const out = [];
  for (let i = 1; i < parts.length; i += 1) {
    out.push(parts.slice(0, i).join('/'));
  }
  return out;
}

function getWorkspaceId(raw) {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : 'default';
}

function getLedger(ws) {
  let l = ledgers.get(ws);
  if (!l) {
    l = { entries: new Map(), totalBytes: 0, entryCount: 0, loaded: false, rev: 0 };
    ledgers.set(ws, l);
  }
  return l;
}

function makeStats(ws, ledger) {
  return {
    workspaceId: ws,
    totalBytes: ledger.totalBytes,
    entryCount: ledger.entryCount,
    maxFileBytes: MAX_FILE_BYTES,
    maxWorkspaceBytes: MAX_WORKSPACE_BYTES,
    maxEntries: MAX_WORKSPACE_ENTRIES,
    rev: ledger.rev,
  };
}

function enqueue(ws, task) {
  const prev = queues.get(ws) || Promise.resolve();
  const next = prev.then(task, task);
  queues.set(
    ws,
    next.catch(() => {}),
  );
  return next;
}

function upgradeSchema(database, tx) {
  if (!database.objectStoreNames.contains(STORE_WORKSPACES)) {
    database.createObjectStore(STORE_WORKSPACES, { keyPath: 'id' });
  }
  if (!database.objectStoreNames.contains(STORE_FILES)) {
    const store = database.createObjectStore(STORE_FILES, { keyPath: ['ws', 'path'] });
    store.createIndex('by_ws', 'ws', { unique: false });
  }
  // A "wheels" store someone else made with another shape is replaced (its rows are untrusted anyway).
  if (database.objectStoreNames.contains(STORE_WHEELS)) {
    const existing = tx.objectStore(STORE_WHEELS);
    if (existing.keyPath !== 'sha256' || existing.autoIncrement) database.deleteObjectStore(STORE_WHEELS);
  }
  const wheels = database.objectStoreNames.contains(STORE_WHEELS)
    ? tx.objectStore(STORE_WHEELS)
    : database.createObjectStore(STORE_WHEELS, { keyPath: 'sha256' });
  if (!wheels.indexNames.contains('by_size')) wheels.createIndex('by_size', 'size', { unique: false });
  if (!wheels.indexNames.contains('by_name')) wheels.createIndex('by_name', 'fileName', { unique: false });
}

/** True when every store and index this worker uses exists with the expected shape. */
function schemaOk(database) {
  const names = database.objectStoreNames;
  if (!names.contains(STORE_WORKSPACES) || !names.contains(STORE_FILES) || !names.contains(STORE_WHEELS)) {
    return false;
  }
  try {
    const tx = database.transaction([STORE_FILES, STORE_WHEELS], 'readonly');
    const wheels = tx.objectStore(STORE_WHEELS);
    return (
      tx.objectStore(STORE_FILES).indexNames.contains('by_ws') &&
      wheels.keyPath === 'sha256' &&
      wheels.indexNames.contains('by_size') &&
      wheels.indexNames.contains('by_name')
    );
  } catch {
    return false;
  }
}

/**
 * Opens (and upgrades) the database. v1 → v2 only adds stores, so all v1 data stays. If someone
 * (user code can open this database too) raised the version or left out a store, the database is
 * opened at its own version and upgraded one step further to add what is missing.
 */
function openAt(version) {
  return new Promise((resolve, reject) => {
    const req = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
    req.onupgradeneeded = () => {
      upgradeSchema(req.result, req.transaction);
    };
    req.onblocked = () => {
      // Another tab still holds an older version open; its storage worker closes on versionchange.
      self.postMessage({
        type: 'storage.blocked',
        message: 'Another tab is still using older saved data. Close or reload it to continue.',
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      const err = req.error;
      reject(err && err.name === 'VersionError' ? makeError('VERSION', err.message) : err);
    };
  });
}

function openDb() {
  if (isClosed) {
    return Promise.reject(makeError('WORKER_CLOSED', 'Storage worker has been closed'));
  }
  if (db) return Promise.resolve(db);
  if (dbOpenPromise) return dbOpenPromise;

  dbOpenPromise = (async () => {
    let database;
    try {
      database = await openAt(DB_VERSION);
    } catch (err) {
      if (!err || err.code !== 'VERSION') throw err;
      database = await openAt(undefined);
    }
    if (!schemaOk(database)) {
      const next = database.version + 1;
      database.close();
      database = await openAt(next);
    }
    db = database;
    db.onversionchange = () => {
      closeDbImmediately();
    };
    return db;
  })().catch((err) => {
    dbOpenPromise = null;
    throw err && err.code ? err : makeError('UNKNOWN', err && err.message ? err.message : 'Failed to open IndexedDB');
  });
  return dbOpenPromise;
}

function closeDbImmediately() {
  for (const port of pythonPorts.values()) {
    try {
      port.close();
    } catch {
      // ignore
    }
  }
  pythonPorts.clear();
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    db = null;
  }
  dbOpenPromise = null;
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(classifyIdbError(tx.error));
    tx.onabort = () => reject(classifyIdbError(tx.error));
  });
}

function classifyIdbError(err) {
  if (err && err.code) return err;
  const name = err && err.name ? String(err.name) : '';
  const msg = err && err.message ? String(err.message) : 'IndexedDB transaction failed';
  if (name === 'QuotaExceededError' || msg.toLowerCase().includes('quota')) {
    return makeError('QUOTA_EXCEEDED', `Browser storage quota exceeded: ${msg}`);
  }
  return makeError('UNKNOWN', msg);
}

async function toUint8Array(data) {
  if (data === null || data === undefined) return new Uint8Array(0);
  if (data instanceof Uint8Array) {
    if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
      return data;
    }
    return data.slice();
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    if (data.size > MAX_FILE_BYTES) {
      throw makeError('CAP_EXCEEDED', `File exceeds maximum size of ${MAX_FILE_BYTES} bytes`);
    }
    const buf = await data.arrayBuffer();
    return new Uint8Array(buf);
  }
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }
  throw makeError('UNKNOWN', 'Unsupported file payload type');
}

async function ensureWorkspaceLoaded(ws) {
  const database = await openDb();
  const ledger = getLedger(ws);
  if (ledger.loaded) return { database, ledger };

  const tx = database.transaction([STORE_FILES, STORE_WORKSPACES], 'readwrite');
  const fileStore = tx.objectStore(STORE_FILES);
  const wsStore = tx.objectStore(STORE_WORKSPACES);
  const rows = await reqPromise(fileStore.index('by_ws').getAll(IDBKeyRange.only(ws)));

  ledger.entries.clear();
  let totalBytes = 0;
  for (const row of rows) {
    const size = row.isDir ? 0 : (row.size ?? (row.bytes ? row.bytes.byteLength : 0));
    ledger.entries.set(row.path, {
      isDir: Boolean(row.isDir),
      size,
      mtime: Number(row.mtime) || Date.now(),
      createdByRun: Boolean(row.createdByRun),
    });
    totalBytes += size;
  }
  ledger.totalBytes = totalBytes;
  ledger.entryCount = ledger.entries.size;
  ledger.loaded = true;

  const now = Date.now();
  const existingWs = await reqPromise(wsStore.get(ws));
  wsStore.put({
    id: ws,
    name: existingWs ? existingWs.name : ws === 'default' ? 'Default' : ws,
    createdAt: existingWs ? existingWs.createdAt : now,
    updatedAt: now,
    totalBytes: ledger.totalBytes,
    entryCount: ledger.entryCount,
  });

  await txDone(tx);
  return { database, ledger };
}

function updateWsRecord(wsStore, ws, totalBytes, entryCount) {
  const now = Date.now();
  wsStore.put({
    id: ws,
    name: ws === 'default' ? 'Default' : ws,
    createdAt: now,
    updatedAt: now,
    totalBytes,
    entryCount,
  });
}

function mirrorToPython(ws, message, transfer = []) {
  const port = pythonPorts.get(ws);
  if (!port) return;
  try {
    port.postMessage(message, transfer);
  } catch {
    // Port may belong to a terminated Python worker; ignore cleanly.
  }
}

function notifyMainChange(ws, kind, extra, ledger) {
  self.postMessage({
    type: 'storage.change',
    workspaceId: ws,
    kind,
    ...extra,
    stats: makeStats(ws, ledger),
  });
}

async function doWrite(ws, rawPath, rawData, opts = {}) {
  const path = normalizePath(rawPath);
  const bytes = await toUint8Array(rawData);
  const size = bytes.byteLength;
  if (size > MAX_FILE_BYTES) {
    throw makeError('CAP_EXCEEDED', `File "${path}" (${size} B) exceeds 50 MiB cap`);
  }

  const { database, ledger } = await ensureWorkspaceLoaded(ws);
  const existing = ledger.entries.get(path);
  if (existing && existing.isDir) {
    throw makeError('EXISTS', `Cannot overwrite directory "${path}" with a file`);
  }

  const ancestors = ancestorDirs(path);
  const missingDirs = [];
  for (const dir of ancestors) {
    const cur = ledger.entries.get(dir);
    if (cur && !cur.isDir) {
      throw makeError('EXISTS', `Parent path "${dir}" is a file, not a directory`);
    }
    if (!cur) missingDirs.push(dir);
  }

  const prevSize = existing ? existing.size : 0;
  const newTotalBytes = ledger.totalBytes - prevSize + size;
  const newEntryCount = ledger.entryCount + (existing ? 0 : 1) + missingDirs.length;

  if (newTotalBytes > MAX_WORKSPACE_BYTES) {
    throw makeError('CAP_EXCEEDED', `Workspace exceeds 150 MiB cap (${newTotalBytes} B)`);
  }
  if (newEntryCount > MAX_WORKSPACE_ENTRIES) {
    throw makeError('CAP_EXCEEDED', `Workspace exceeds ${MAX_WORKSPACE_ENTRIES} entry cap`);
  }

  const now = Number(opts.mtime) || Date.now();
  const createdByRun = Boolean(opts.createdByRun);
  const tx = database.transaction([STORE_FILES, STORE_WORKSPACES], 'readwrite');
  const fileStore = tx.objectStore(STORE_FILES);
  const wsStore = tx.objectStore(STORE_WORKSPACES);

  for (const dir of missingDirs) {
    fileStore.put({
      ws,
      path: dir,
      isDir: true,
      size: 0,
      mtime: now,
      bytes: null,
      createdByRun,
    });
  }
  fileStore.put({
    ws,
    path,
    isDir: false,
    size,
    mtime: now,
    bytes,
    createdByRun,
  });
  updateWsRecord(wsStore, ws, newTotalBytes, newEntryCount);
  await txDone(tx);

  // Commit to in-memory ledger only AFTER IDB transaction succeeds.
  for (const dir of missingDirs) {
    ledger.entries.set(dir, { isDir: true, size: 0, mtime: now, createdByRun });
  }
  ledger.entries.set(path, { isDir: false, size, mtime: now, createdByRun });
  ledger.totalBytes = newTotalBytes;
  ledger.entryCount = newEntryCount;
  ledger.rev += 1;

  const entry = { path, isDir: false, size, mtime: now, createdByRun };
  if (opts.mirror !== false) {
    const mirrorCopy = bytes.slice();
    mirrorToPython(
      ws,
      { type: 'mirror.write', rev: ledger.rev, path, bytes: mirrorCopy, mtime: now },
      [mirrorCopy.buffer],
    );
  }
  if (opts.fromPython) {
    notifyMainChange(ws, 'put', { entry }, ledger);
  }
  return { entry, stats: makeStats(ws, ledger) };
}

async function doMkdir(ws, rawPath, opts = {}) {
  const path = normalizePath(rawPath, true);
  const { database, ledger } = await ensureWorkspaceLoaded(ws);

  const existing = ledger.entries.get(path);
  if (existing) {
    if (!existing.isDir) {
      throw makeError('EXISTS', `"${path}" already exists as a file`);
    }
    return {
      entry: { path, isDir: true, size: 0, mtime: existing.mtime, createdByRun: existing.createdByRun },
      stats: makeStats(ws, ledger),
    };
  }

  const dirsToCreate = [];
  for (const dir of [...ancestorDirs(path), path]) {
    const cur = ledger.entries.get(dir);
    if (cur && !cur.isDir) {
      throw makeError('EXISTS', `Parent path "${dir}" is a file, not a directory`);
    }
    if (!cur) dirsToCreate.push(dir);
  }

  const newEntryCount = ledger.entryCount + dirsToCreate.length;
  if (newEntryCount > MAX_WORKSPACE_ENTRIES) {
    throw makeError('CAP_EXCEEDED', `Workspace exceeds ${MAX_WORKSPACE_ENTRIES} entry cap`);
  }

  const now = Number(opts.mtime) || Date.now();
  const createdByRun = Boolean(opts.createdByRun);
  const tx = database.transaction([STORE_FILES, STORE_WORKSPACES], 'readwrite');
  const fileStore = tx.objectStore(STORE_FILES);
  const wsStore = tx.objectStore(STORE_WORKSPACES);

  for (const dir of dirsToCreate) {
    fileStore.put({ ws, path: dir, isDir: true, size: 0, mtime: now, bytes: null, createdByRun });
  }
  updateWsRecord(wsStore, ws, ledger.totalBytes, newEntryCount);
  await txDone(tx);

  for (const dir of dirsToCreate) {
    ledger.entries.set(dir, { isDir: true, size: 0, mtime: now, createdByRun });
  }
  ledger.entryCount = newEntryCount;
  ledger.rev += 1;

  const entry = { path, isDir: true, size: 0, mtime: now, createdByRun };
  if (opts.mirror !== false) {
    mirrorToPython(ws, { type: 'mirror.mkdir', rev: ledger.rev, path });
  }
  if (opts.fromPython) {
    notifyMainChange(ws, 'mkdir', { entry }, ledger);
  }
  return { entry, stats: makeStats(ws, ledger) };
}

async function doDelete(ws, rawPath, opts = {}) {
  const path = normalizePath(rawPath, true);
  const { database, ledger } = await ensureWorkspaceLoaded(ws);

  const prefix = `${path}/`;
  const toDelete = [];
  let bytesFreed = 0;
  for (const [key, meta] of ledger.entries) {
    if (key === path || key.startsWith(prefix)) {
      toDelete.push(key);
      bytesFreed += meta.size;
    }
  }
  if (toDelete.length === 0) {
    return { path, deletedCount: 0, stats: makeStats(ws, ledger) };
  }

  const newTotalBytes = Math.max(0, ledger.totalBytes - bytesFreed);
  const newEntryCount = ledger.entryCount - toDelete.length;

  const tx = database.transaction([STORE_FILES, STORE_WORKSPACES], 'readwrite');
  const fileStore = tx.objectStore(STORE_FILES);
  const wsStore = tx.objectStore(STORE_WORKSPACES);
  for (const key of toDelete) {
    fileStore.delete([ws, key]);
  }
  updateWsRecord(wsStore, ws, newTotalBytes, newEntryCount);
  await txDone(tx);

  for (const key of toDelete) {
    ledger.entries.delete(key);
  }
  ledger.totalBytes = newTotalBytes;
  ledger.entryCount = newEntryCount;
  ledger.rev += 1;

  if (opts.mirror !== false) {
    mirrorToPython(ws, { type: 'mirror.delete', rev: ledger.rev, path });
  }
  if (opts.fromPython) {
    notifyMainChange(ws, 'delete', { path }, ledger);
  }
  return { path, deletedCount: toDelete.length, stats: makeStats(ws, ledger) };
}

async function doRename(ws, rawFrom, rawTo, opts = {}) {
  const from = normalizePath(rawFrom, true);
  const to = normalizePath(rawTo, true);
  if (from === to) {
    const { ledger } = await ensureWorkspaceLoaded(ws);
    return { from, to, movedCount: 0, stats: makeStats(ws, ledger) };
  }
  if (to.startsWith(`${from}/`)) {
    throw makeError('INVALID_PATH', `Cannot move "${from}" inside itself ("${to}")`);
  }

  const { database, ledger } = await ensureWorkspaceLoaded(ws);
  const srcMeta = ledger.entries.get(from);
  if (!srcMeta) {
    throw makeError('NOT_FOUND', `Path "${from}" does not exist`);
  }

  const overwrite = Boolean(opts.overwrite);
  const dstExisting = ledger.entries.get(to);
  if (dstExisting && !overwrite) {
    throw makeError('EXISTS', `Destination "${to}" already exists`);
  }

  const missingDirs = [];
  for (const dir of ancestorDirs(to)) {
    const cur = ledger.entries.get(dir);
    if (cur && !cur.isDir) {
      throw makeError('EXISTS', `Destination parent "${dir}" is a file`);
    }
    if (!cur) missingDirs.push(dir);
  }

  const srcPrefix = `${from}/`;
  const affectedKeys = [];
  for (const key of ledger.entries.keys()) {
    if (key === from || key.startsWith(srcPrefix)) {
      affectedKeys.push(key);
    }
  }

  const dstPrefix = `${to}/`;
  const overwrittenKeys = [];
  let overwrittenBytes = 0;
  if (overwrite && dstExisting) {
    for (const [key, meta] of ledger.entries) {
      if (key === to || key.startsWith(dstPrefix)) {
        if (!affectedKeys.includes(key)) {
          overwrittenKeys.push(key);
          overwrittenBytes += meta.size;
        }
      }
    }
  }

  const newEntryCount = ledger.entryCount - overwrittenKeys.length + missingDirs.length;
  if (newEntryCount > MAX_WORKSPACE_ENTRIES) {
    throw makeError('CAP_EXCEEDED', `Workspace exceeds ${MAX_WORKSPACE_ENTRIES} entry cap`);
  }

  const tx = database.transaction([STORE_FILES, STORE_WORKSPACES], 'readwrite');
  const fileStore = tx.objectStore(STORE_FILES);
  const wsStore = tx.objectStore(STORE_WORKSPACES);

  const srcRows = await Promise.all(affectedKeys.map((k) => reqPromise(fileStore.get([ws, k]))));

  for (const k of overwrittenKeys) {
    fileStore.delete([ws, k]);
  }
  for (const k of affectedKeys) {
    fileStore.delete([ws, k]);
  }
  const now = Date.now();
  for (const dir of missingDirs) {
    fileStore.put({ ws, path: dir, isDir: true, size: 0, mtime: now, bytes: null, createdByRun: false });
  }

  const newRecords = [];
  for (const row of srcRows) {
    if (!row) continue;
    const mappedPath = row.path === from ? to : `${to}${row.path.slice(from.length)}`;
    const updated = { ...row, path: mappedPath, mtime: now };
    fileStore.put(updated);
    newRecords.push(updated);
  }

  const newTotalBytes = Math.max(0, ledger.totalBytes - overwrittenBytes);
  updateWsRecord(wsStore, ws, newTotalBytes, newEntryCount);
  await txDone(tx);

  for (const k of overwrittenKeys) ledger.entries.delete(k);
  for (const k of affectedKeys) ledger.entries.delete(k);
  for (const dir of missingDirs) {
    ledger.entries.set(dir, { isDir: true, size: 0, mtime: now, createdByRun: false });
  }
  for (const rec of newRecords) {
    ledger.entries.set(rec.path, {
      isDir: Boolean(rec.isDir),
      size: rec.isDir ? 0 : rec.size,
      mtime: rec.mtime,
      createdByRun: Boolean(rec.createdByRun),
    });
  }
  ledger.totalBytes = newTotalBytes;
  ledger.entryCount = ledger.entries.size;
  ledger.rev += 1;

  if (opts.mirror !== false) {
    mirrorToPython(ws, { type: 'mirror.rename', rev: ledger.rev, from, to });
  }
  if (opts.fromPython) {
    notifyMainChange(ws, 'rename', { from, to }, ledger);
  }
  return { from, to, movedCount: newRecords.length, stats: makeStats(ws, ledger) };
}

async function doBulkWrite(ws, rawEntries, opts = {}) {
  const replaceWorkspace = Boolean(opts.replaceWorkspace);
  const { database, ledger } = await ensureWorkspaceLoaded(ws);

  const normalized = [];
  for (const item of rawEntries || []) {
    const isDir = Boolean(item.isDir);
    const path = normalizePath(item.path, isDir);
    const bytes = isDir ? null : await toUint8Array(item.bytes);
    const size = bytes ? bytes.byteLength : 0;
    if (size > MAX_FILE_BYTES) {
      throw makeError('CAP_EXCEEDED', `File "${path}" (${size} B) exceeds 50 MiB cap`);
    }
    normalized.push({
      path,
      isDir,
      bytes,
      size,
      createdByRun: Boolean(item.createdByRun),
    });
  }

  // Simulate final ledger state to verify exact aggregate caps before touching IDB.
  const simEntries = replaceWorkspace ? new Map() : new Map(ledger.entries);
  const now = Date.now();
  const puts = new Map();

  for (const item of normalized) {
    for (const dir of ancestorDirs(item.path)) {
      const existing = simEntries.get(dir);
      if (existing && !existing.isDir) {
        throw makeError('EXISTS', `Parent path "${dir}" is a file, not a directory`);
      }
      if (!existing) {
        simEntries.set(dir, { isDir: true, size: 0, mtime: now, createdByRun: item.createdByRun });
        puts.set(dir, {
          ws,
          path: dir,
          isDir: true,
          size: 0,
          mtime: now,
          bytes: null,
          createdByRun: item.createdByRun,
        });
      }
    }
    const cur = simEntries.get(item.path);
    if (cur && cur.isDir !== item.isDir) {
      throw makeError('EXISTS', `Type conflict at "${item.path}"`);
    }
    simEntries.set(item.path, {
      isDir: item.isDir,
      size: item.size,
      mtime: now,
      createdByRun: item.createdByRun,
    });
    puts.set(item.path, {
      ws,
      path: item.path,
      isDir: item.isDir,
      size: item.size,
      mtime: now,
      bytes: item.bytes,
      createdByRun: item.createdByRun,
    });
  }

  let newTotalBytes = 0;
  for (const meta of simEntries.values()) {
    newTotalBytes += meta.size;
  }
  const newEntryCount = simEntries.size;
  if (newTotalBytes > MAX_WORKSPACE_BYTES) {
    throw makeError('CAP_EXCEEDED', `Workspace exceeds 150 MiB cap (${newTotalBytes} B)`);
  }
  if (newEntryCount > MAX_WORKSPACE_ENTRIES) {
    throw makeError('CAP_EXCEEDED', `Workspace exceeds ${MAX_WORKSPACE_ENTRIES} entry cap`);
  }

  const tx = database.transaction([STORE_FILES, STORE_WORKSPACES], 'readwrite');
  const fileStore = tx.objectStore(STORE_FILES);
  const wsStore = tx.objectStore(STORE_WORKSPACES);

  if (replaceWorkspace) {
    for (const oldPath of ledger.entries.keys()) {
      fileStore.delete([ws, oldPath]);
    }
  }
  for (const rec of puts.values()) {
    fileStore.put(rec);
  }
  updateWsRecord(wsStore, ws, newTotalBytes, newEntryCount);
  await txDone(tx);

  ledger.entries = simEntries;
  ledger.totalBytes = newTotalBytes;
  ledger.entryCount = newEntryCount;
  ledger.rev += 1;

  if (opts.mirror !== false && pythonPorts.has(ws)) {
    const mirrorEntries = [];
    const transfers = [];
    for (const rec of puts.values()) {
      if (rec.isDir) {
        mirrorEntries.push({ path: rec.path, isDir: true, mtime: rec.mtime, bytes: null });
      } else {
        const copy = rec.bytes ? rec.bytes.slice() : new Uint8Array(0);
        transfers.push(copy.buffer);
        mirrorEntries.push({ path: rec.path, isDir: false, mtime: rec.mtime, bytes: copy });
      }
    }
    mirrorToPython(
      ws,
      { type: 'mirror.bulkWrite', rev: ledger.rev, replaceWorkspace, entries: mirrorEntries },
      transfers,
    );
  }

  return { count: normalized.length, stats: makeStats(ws, ledger) };
}

async function doClearWorkspace(ws, opts = {}) {
  const { database, ledger } = await ensureWorkspaceLoaded(ws);
  const tx = database.transaction([STORE_FILES, STORE_WORKSPACES], 'readwrite');
  const fileStore = tx.objectStore(STORE_FILES);
  const wsStore = tx.objectStore(STORE_WORKSPACES);
  for (const path of ledger.entries.keys()) {
    fileStore.delete([ws, path]);
  }
  updateWsRecord(wsStore, ws, 0, 0);
  await txDone(tx);

  ledger.entries.clear();
  ledger.totalBytes = 0;
  ledger.entryCount = 0;
  ledger.rev += 1;

  if (opts.mirror !== false) {
    mirrorToPython(ws, { type: 'mirror.clear', rev: ledger.rev });
  }
  return { stats: makeStats(ws, ledger) };
}

async function doRead(ws, rawPath) {
  const path = normalizePath(rawPath, true);
  const { database } = await ensureWorkspaceLoaded(ws);
  const tx = database.transaction(STORE_FILES, 'readonly');
  const row = await reqPromise(tx.objectStore(STORE_FILES).get([ws, path]));
  if (!row) return null;
  const copy = row.bytes ? row.bytes.slice() : null;
  return {
    path: row.path,
    isDir: Boolean(row.isDir),
    size: row.isDir ? 0 : (copy ? copy.byteLength : 0),
    mtime: Number(row.mtime) || 0,
    createdByRun: Boolean(row.createdByRun),
    bytes: copy,
  };
}

async function doList(ws) {
  const { ledger } = await ensureWorkspaceLoaded(ws);
  const list = [];
  for (const [path, meta] of ledger.entries) {
    list.push({
      path,
      isDir: meta.isDir,
      size: meta.size,
      mtime: meta.mtime,
      createdByRun: meta.createdByRun,
    });
  }
  list.sort((a, b) => a.path.localeCompare(b.path));
  return list;
}

async function doHydrate(ws) {
  const { database, ledger } = await ensureWorkspaceLoaded(ws);
  const tx = database.transaction(STORE_FILES, 'readonly');
  const rows = await reqPromise(tx.objectStore(STORE_FILES).index('by_ws').getAll(IDBKeyRange.only(ws)));
  const entries = [];
  const transfers = [];
  for (const row of rows) {
    if (row.isDir) {
      entries.push({ path: row.path, isDir: true, mtime: row.mtime, bytes: null });
    } else {
      const copy = row.bytes ? row.bytes.slice() : new Uint8Array(0);
      transfers.push(copy.buffer);
      entries.push({ path: row.path, isDir: false, mtime: row.mtime, bytes: copy });
    }
  }
  return { entries, transfers, rev: ledger.rev };
}

function attachPythonPort(ws, port) {
  const old = pythonPorts.get(ws);
  if (old && old !== port) {
    try {
      old.close();
    } catch {
      // ignore
    }
  }
  pythonPorts.set(ws, port);

  port.onmessage = (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'hydrate': {
        const reqId = msg.id;
        enqueue(ws, async () => {
          try {
            const { entries, transfers, rev } = await doHydrate(ws);
            port.postMessage({ type: 'hydrate.result', id: reqId, ok: true, rev, entries }, transfers);
          } catch (err) {
            port.postMessage({
              type: 'hydrate.result',
              id: reqId,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });
        break;
      }

      case 'put': {
        const rawPath = msg.path;
        const rawBytes = msg.bytes;
        const mtime = msg.mtime;
        const createdByRun = Boolean(msg.createdByRun);
        enqueue(ws, async () => {
          try {
            await doWrite(ws, rawPath, rawBytes, {
              mtime,
              createdByRun,
              mirror: false,
              fromPython: true,
            });
          } catch (err) {
            emitPortLimitNotice(ws, err);
          }
        });
        break;
      }

      case 'mkdir': {
        const rawPath = msg.path;
        const mtime = msg.mtime;
        const createdByRun = Boolean(msg.createdByRun);
        enqueue(ws, async () => {
          try {
            await doMkdir(ws, rawPath, { mtime, createdByRun, mirror: false, fromPython: true });
          } catch (err) {
            emitPortLimitNotice(ws, err);
          }
        });
        break;
      }

      case 'rename': {
        const from = msg.from;
        const to = msg.to;
        enqueue(ws, async () => {
          try {
            await doRename(ws, from, to, { overwrite: true, mirror: false, fromPython: true });
          } catch (err) {
            emitPortLimitNotice(ws, err);
          }
        });
        break;
      }

      case 'delete': {
        const rawPath = msg.path;
        enqueue(ws, async () => {
          try {
            await doDelete(ws, rawPath, { mirror: false, fromPython: true });
          } catch (err) {
            emitPortLimitNotice(ws, err);
          }
        });
        break;
      }

      case 'flush': {
        const reqId = msg.id;
        enqueue(ws, async () => {
          try {
            const { ledger } = await ensureWorkspaceLoaded(ws);
            port.postMessage({ type: 'flush.ack', id: reqId, ok: true, stats: makeStats(ws, ledger) });
          } catch (err) {
            port.postMessage({
              type: 'flush.ack',
              id: reqId,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });
        break;
      }

      default:
        break;
    }
  };
}

function emitPortLimitNotice(ws, err) {
  const code = err && err.code ? err.code : 'UNKNOWN';
  const message = err instanceof Error ? err.message : String(err);
  if (code === 'QUOTA_EXCEEDED') {
    self.postMessage({ type: 'storage.quotaExceeded', workspaceId: ws, message });
  } else if (code === 'CAP_EXCEEDED') {
    self.postMessage({ type: 'storage.capExceeded', workspaceId: ws, message });
  }
}

// Listen for clearAllPythonData() close signal so IDB handle releases cleanly before deleteDatabase.
if (typeof BroadcastChannel !== 'undefined') {
  try {
    controlChannel = new BroadcastChannel('python:control');
    controlChannel.onmessage = (ev) => {
      if (ev.data && ev.data.type === 'clear-close-db') {
        isClosed = true;
        closeDbImmediately();
      }
    };
  } catch {
    controlChannel = null;
  }
}

self.onmessage = (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || typeof msg.id !== 'number' || typeof msg.op !== 'string') {
    return;
  }

  const { id, op } = msg;
  const ws = getWorkspaceId(msg.workspaceId);

  const replyOk = (result, transfer = []) => {
    self.postMessage({ id, ok: true, result }, transfer);
  };
  const replyErr = (err) => {
    const classified = classifyIdbError(err);
    const code = classified.code || 'UNKNOWN';
    const message = classified.message || String(err);
    if (code === 'QUOTA_EXCEEDED') {
      self.postMessage({ type: 'storage.quotaExceeded', workspaceId: ws, message });
    }
    self.postMessage({ id, ok: false, error: { code, message } });
  };

  if (op === 'close') {
    isClosed = true;
    closeDbImmediately();
    if (controlChannel) {
      try {
        controlChannel.close();
      } catch {
        // ignore
      }
      controlChannel = null;
    }
    replyOk({ closed: true });
    return;
  }

  if (op === 'connectPythonPort') {
    const port = msg.port;
    if (!port || typeof port.postMessage !== 'function') {
      replyErr(makeError('UNKNOWN', 'Missing MessagePort for connectPythonPort'));
      return;
    }
    enqueue(ws, async () => {
      await ensureWorkspaceLoaded(ws);
      attachPythonPort(ws, port);
      return { connected: true, rev: getLedger(ws).rev };
    }).then(replyOk, replyErr);
    return;
  }

  enqueue(ws, async () => {
    switch (op) {
      case 'open': {
        const { ledger } = await ensureWorkspaceLoaded(ws);
        return makeStats(ws, ledger);
      }
      case 'stats': {
        const { ledger } = await ensureWorkspaceLoaded(ws);
        return makeStats(ws, ledger);
      }
      case 'list': {
        return doList(ws);
      }
      case 'read': {
        const entry = await doRead(ws, msg.path);
        const transfer = entry && entry.bytes ? [entry.bytes.buffer] : [];
        return { __transfer: transfer, value: entry };
      }
      case 'write': {
        return doWrite(ws, msg.path, msg.bytes, {
          createdByRun: Boolean(msg.createdByRun),
          mirror: msg.mirrorToPython !== false,
        });
      }
      case 'mkdir': {
        return doMkdir(ws, msg.path, { mirror: msg.mirrorToPython !== false });
      }
      case 'rename':
      case 'move': {
        return doRename(ws, msg.from, msg.to, {
          overwrite: Boolean(msg.overwrite),
          mirror: msg.mirrorToPython !== false,
        });
      }
      case 'delete': {
        return doDelete(ws, msg.path, { mirror: msg.mirrorToPython !== false });
      }
      case 'bulkWrite': {
        return doBulkWrite(ws, msg.entries, {
          replaceWorkspace: Boolean(msg.replaceWorkspace),
          mirror: msg.mirrorToPython !== false,
        });
      }
      case 'clearWorkspace': {
        return doClearWorkspace(ws, { mirror: msg.mirrorToPython !== false });
      }
      default:
        throw makeError('UNKNOWN', `Unknown storage op "${op}"`);
    }
  }).then((res) => {
    if (res && typeof res === 'object' && '__transfer' in res) {
      replyOk(res.value, res.__transfer);
    } else {
      replyOk(res);
    }
  }, replyErr);
};
