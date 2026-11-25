/* eslint-disable no-restricted-globals */
// Wheel Worker (/python/wheel-worker.js), P5b: saved wheel bytes in the store "wheels" of the
// IndexedDB database "python-playground", which /python/storage-worker.js owns and upgrades (the
// page opens that one first, so this worker opens the database at its current version and never
// changes the schema). Runs under coi-sw.js with the Off worker CSP, never runs user Python.
// Rows are keyed by the SHA-256 of their bytes, checked on every put. User code can write IndexedDB
// too, so the page hashes the bytes again against its own manifest (localStorage
// python:packages-v1) before any use (D15, D20, D22). Lists, stats and caps read only keys and index
// values, never the bytes. Caps (separate from the workspace caps): 50 MiB per wheel, 200 MiB and 64
// wheels in all.

const DB_NAME = 'python-playground';
const STORE_WHEELS = 'wheels';
const MAX_WHEEL_BYTES = 50 * 1024 * 1024;
const MAX_WHEELS_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_WHEEL_COUNT = 64;
const SHA256_RE = /^[0-9a-f]{64}$/;
const WHEEL_NAME_RE = /^[A-Za-z0-9._+-]{1,251}\.whl$/;

let db = null;
let dbOpenPromise = null;
let isClosed = false;
let queue = Promise.resolve();

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function closeDb() {
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
  db = null;
  dbOpenPromise = null;
}

function openDb() {
  if (isClosed) return Promise.reject(makeError('WORKER_CLOSED', 'Wheel worker has been closed'));
  if (db) return Promise.resolve(db);
  if (!dbOpenPromise) {
    dbOpenPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME);
      req.onupgradeneeded = () => {
        // The database did not exist: leave creating it to the storage worker.
        req.transaction.abort();
      };
      req.onsuccess = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE_WHEELS)) {
          database.close();
          reject(makeError('UNKNOWN', 'The wheels store is missing; open the storage worker first'));
          return;
        }
        database.onversionchange = () => closeDb();
        db = database;
        resolve(database);
      };
      req.onerror = () => reject(makeError('UNKNOWN', req.error ? req.error.message : 'Failed to open IndexedDB'));
    }).catch((err) => {
      dbOpenPromise = null;
      throw err;
    });
  }
  return dbOpenPromise;
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
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

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(classifyIdbError(tx.error));
    tx.onabort = () => reject(classifyIdbError(tx.error));
  });
}

async function toUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw makeError('UNKNOWN', 'Wheel bytes must be a Uint8Array');
}

function checkSha(raw) {
  if (typeof raw !== 'string' || !SHA256_RE.test(raw)) throw makeError('INVALID_PATH', 'Invalid wheel sha256');
  return raw;
}

async function sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/** Reads key and index values only (never the bytes): sha256 → { size, fileName }. */
async function wheelIndex(store) {
  const keys = await reqPromise(store.getAllKeys());
  const rows = new Map(keys.filter((k) => typeof k === 'string').map((k) => [k, { size: 0, fileName: '' }]));
  const walk = (indexName, field) =>
    new Promise((resolve, reject) => {
      const req = store.index(indexName).openKeyCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve();
        const row = rows.get(cursor.primaryKey);
        if (row) row[field] = cursor.key;
        cursor.continue();
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB cursor failed'));
    });
  await walk('by_size', 'size');
  await walk('by_name', 'fileName');
  return rows;
}

function wheelStats(rows) {
  let totalBytes = 0;
  for (const row of rows.values()) totalBytes += typeof row.size === 'number' && row.size > 0 ? row.size : 0;
  return {
    count: rows.size,
    totalBytes,
    maxWheelBytes: MAX_WHEEL_BYTES,
    maxTotalBytes: MAX_WHEELS_TOTAL_BYTES,
    maxCount: MAX_WHEEL_COUNT,
  };
}

async function doWheelPut(rawSha, rawName, rawBytes) {
  const sha256 = checkSha(rawSha);
  if (typeof rawName !== 'string' || !WHEEL_NAME_RE.test(rawName)) {
    throw makeError('INVALID_PATH', 'Invalid wheel file name');
  }
  const bytes = await toUint8Array(rawBytes);
  if (bytes.byteLength === 0) throw makeError('INVALID_PATH', 'Empty wheel');
  if (bytes.byteLength > MAX_WHEEL_BYTES) {
    throw makeError('CAP_EXCEEDED', `Wheel (${bytes.byteLength} B) exceeds the 50 MiB cap`);
  }
  if ((await sha256Hex(bytes)) !== sha256) throw makeError('HASH_MISMATCH', 'Wheel bytes do not match their sha256');
  const database = await openDb();
  const tx = database.transaction(STORE_WHEELS, 'readwrite');
  const store = tx.objectStore(STORE_WHEELS);
  const rows = await wheelIndex(store);
  rows.delete(sha256);
  const stats = wheelStats(rows);
  if (stats.count + 1 > MAX_WHEEL_COUNT) {
    tx.abort();
    throw makeError('CAP_EXCEEDED', `At most ${MAX_WHEEL_COUNT} wheels can be saved`);
  }
  if (stats.totalBytes + bytes.byteLength > MAX_WHEELS_TOTAL_BYTES) {
    tx.abort();
    throw makeError('CAP_EXCEEDED', 'Saved wheels would exceed the 200 MiB cap');
  }
  store.put({ sha256, fileName: rawName, size: bytes.byteLength, bytes, storedAt: Date.now() });
  await txDone(tx);
  rows.set(sha256, { size: bytes.byteLength, fileName: rawName });
  return { sha256, fileName: rawName, size: bytes.byteLength, stats: wheelStats(rows) };
}

async function doWheelGet(rawSha) {
  const sha256 = checkSha(rawSha);
  const database = await openDb();
  const tx = database.transaction(STORE_WHEELS, 'readonly');
  const row = await reqPromise(tx.objectStore(STORE_WHEELS).get(sha256));
  if (!row || typeof row !== 'object') return null;
  let bytes = row.bytes;
  if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
  if (!(bytes instanceof Uint8Array)) return null;
  if (bytes.byteOffset !== 0 || bytes.byteLength !== bytes.buffer.byteLength) bytes = bytes.slice();
  return {
    sha256,
    fileName: typeof row.fileName === 'string' ? row.fileName : '',
    size: bytes.byteLength,
    storedAt: Number(row.storedAt) || 0,
    bytes,
  };
}

async function doWheelDelete(keys) {
  const database = await openDb();
  const tx = database.transaction(STORE_WHEELS, 'readwrite');
  const store = tx.objectStore(STORE_WHEELS);
  for (const key of keys) store.delete(key);
  await txDone(tx);
  return { deleted: keys.length };
}

async function doWheelList() {
  const database = await openDb();
  const tx = database.transaction(STORE_WHEELS, 'readonly');
  const rows = await wheelIndex(tx.objectStore(STORE_WHEELS));
  const wheels = [];
  for (const [sha256, row] of rows) {
    wheels.push({
      sha256,
      fileName: typeof row.fileName === 'string' ? row.fileName : '',
      size: typeof row.size === 'number' ? row.size : 0,
    });
  }
  return { wheels, stats: wheelStats(rows) };
}

/** Deletes every row whose key is not in `keep` (rows of the page's manifest), including rows user code added. */
async function doWheelPrune(rawKeep) {
  const keep = new Set(Array.isArray(rawKeep) ? rawKeep.filter((k) => typeof k === 'string') : []);
  const database = await openDb();
  const tx = database.transaction(STORE_WHEELS, 'readwrite');
  const store = tx.objectStore(STORE_WHEELS);
  const keys = await reqPromise(store.getAllKeys());
  let deleted = 0;
  for (const key of keys) {
    if (!keep.has(key)) {
      store.delete(key);
      deleted += 1;
    }
  }
  await txDone(tx);
  return { deleted };
}

function handleWheelOp(msg) {
  switch (msg.op) {
    case 'wheel.put':
      return doWheelPut(msg.sha256, msg.fileName, msg.bytes);
    case 'wheel.get':
      return doWheelGet(msg.sha256).then((row) => ({ __transfer: row ? [row.bytes.buffer] : [], value: row }));
    case 'wheel.delete':
      return doWheelDelete([checkSha(msg.sha256)]);
    case 'wheel.list':
      return doWheelList();
    case 'wheel.stats':
      return doWheelList().then((r) => r.stats);
    case 'wheel.prune':
      return doWheelPrune(msg.keep);
    default:
      throw makeError('UNKNOWN', `Unknown storage op "${msg.op}"`);
  }
}

// Clear all data (clearData.ts) asks every storage connection to close before deleteDatabase.
if (typeof BroadcastChannel !== 'undefined') {
  try {
    const channel = new BroadcastChannel('python:control');
    channel.onmessage = (ev) => {
      if (ev.data && ev.data.type === 'clear-close-db') {
        isClosed = true;
        closeDb();
      }
    };
  } catch {
    // ignore
  }
}

self.onmessage = (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || typeof msg.id !== 'number' || typeof msg.op !== 'string') return;
  const { id } = msg;
  if (msg.op === 'close') {
    isClosed = true;
    closeDb();
    self.postMessage({ id, ok: true, result: { closed: true } });
    return;
  }
  const task = () => handleWheelOp(msg);
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  next.then(
    (res) => {
      if (res && typeof res === 'object' && '__transfer' in res) self.postMessage({ id, ok: true, result: res.value }, res.__transfer);
      else self.postMessage({ id, ok: true, result: res });
    },
    (err) => {
      const e = classifyIdbError(err);
      if (e.code === 'QUOTA_EXCEEDED') self.postMessage({ type: 'storage.quotaExceeded', message: e.message });
      self.postMessage({ id, ok: false, error: { code: e.code || 'UNKNOWN', message: e.message || String(err) } });
    },
  );
};
