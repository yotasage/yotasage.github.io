// Clear all Python Playground persisted data (IndexedDB, localStorage/sessionStorage keys,
// Cache Storage entries, and /python/ Service Worker registrations) and hard-reload /python/main.

import { closeAllActiveStorageClients } from '../../lib/python/storageClient';

const IDB_DELETE_TIMEOUT_MS = 3000;

export interface ClearPythonDataOptions {
  /** Optional hook executed before closing storage workers and deleting IndexedDB. */
  readonly beforeDelete?: () => void | Promise<void>;
  /** Hard-reload to /python/main after cleanup (defaults to true). */
  readonly reload?: boolean;
}

function deleteIdbDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    };
    const timer = setTimeout(done, IDB_DELETE_TIMEOUT_MS);
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = done;
      req.onerror = done;
      req.onblocked = done;
    } catch {
      done();
    }
  });
}

function clearPrefixedStorage(storage: Storage | undefined): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith('python:')) {
        keys.push(k);
      }
    }
    for (const k of keys) {
      storage.removeItem(k);
    }
  } catch {
    // Ignore storage access errors in strict private contexts.
  }
}

function broadcastCloseStorageDb(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel('python:control');
    ch.postMessage({ type: 'clear-close-db' });
    ch.close();
  } catch {
    // Ignore BroadcastChannel errors in restricted contexts.
  }
}

export async function clearAllPythonData(options: ClearPythonDataOptions = {}): Promise<void> {
  if (typeof window === 'undefined') return;

  // 0. Run caller cleanup & close all active Storage Workers so WebKit never blocks deleteDatabase.
  if (options.beforeDelete) {
    try {
      await options.beforeDelete();
    } catch {
      // Continue clearing even if caller hook threw.
    }
  }
  broadcastCloseStorageDb();
  await closeAllActiveStorageClients();

  // 1. Delete python-playground and any python* IndexedDB databases.
  const dbNames = new Set<string>(['python-playground']);
  if (typeof indexedDB !== 'undefined') {
    const idbWithList = indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string }>>;
    };
    if (typeof idbWithList.databases === 'function') {
      try {
        const list = await idbWithList.databases();
        for (const info of list) {
          if (info.name && info.name.toLowerCase().startsWith('python')) {
            dbNames.add(info.name);
          }
        }
      } catch {
        // Fallback set already contains python-playground.
      }
    }
    await Promise.all([...dbNames].map((name) => deleteIdbDatabase(name)));
  }

  // 2. Clear python:* keys from localStorage and sessionStorage (including python:ack-v1).
  clearPrefixedStorage(window.localStorage);
  clearPrefixedStorage(window.sessionStorage);

  // 3. Delete any python* Cache Storage entries.
  if (typeof caches !== 'undefined') {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.toLowerCase().startsWith('python'))
          .map((k) => caches.delete(k)),
      );
    } catch {
      // Ignore cache API errors.
    }
  }

  // 4. Unregister all Service Workers scoped under /python/.
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs
          .filter((r) => {
            try {
              const scopePath = new URL(r.scope).pathname;
              return scopePath.startsWith('/python/');
            } catch {
              return false;
            }
          })
          .map((r) => r.unregister()),
      );
    } catch {
      // Ignore SW errors when blocked.
    }
  }

  // 5. Hard-reload to plain /python/main (Off mode) unless caller disabled reload.
  if (options.reload !== false) {
    window.location.replace('/python/main');
  }
}
