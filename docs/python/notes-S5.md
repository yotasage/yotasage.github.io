# S5: Persistence Spike — Empirical Findings & P3 Design

**Status:** Complete (2026-11-25)  
**Target runtime:** `pyodide@314.0.8` (`public/pyodide/` + `public/python/coi-sw.js` on `http://localhost:3023`, zero custom server headers)  
**Browsers tested:** Microsoft Edge `158.0.4370.33`, Mozilla Firefox `159.0`, WebKit `27.2` (Playwright `1.65.1`)

## 1. Executive Decision

**Winner: Option 3B — Dedicated Storage Worker owning IndexedDB (`python-playground`), synced with the Python worker's MEMFS via direct `MessageChannel` + synchronous write-through deltas.**

Why Option 3B beats both Emscripten `IDBFS` (Option 1), all OPFS variants (Option 2A/2B/2C), and naive Main-Thread IndexedDB (Option 3A):

1. **Works everywhere — including WebKit, Tier 3 (no SW), and ephemeral/private contexts:** OPFS completely fails in WebKit `27.2` (`UnknownError` in ephemeral/private contexts; `NotSupportedError` on `createSyncAccessHandle` even in a persistent WebKit profile; `mountNativeFS` fails with `UnknownError`). IndexedDB works reliably in all three browsers, all isolation tiers, and ephemeral contexts.
2. **Eliminates WebKit's `IDBFS` Force-Stop deadlock:** When `worker.terminate()` kills a WebKit worker holding an Emscripten `IDBFS` connection, `indexedDB.deleteDatabase('/workspace')` hangs indefinitely and permanently deadlocks all subsequent `indexedDB.open('/workspace')` calls in that session (`90 s` boot timeout). With a Dedicated Storage Worker that never runs user Python and is never Force Stopped, Force Stop never leaks an IDB handle, and `clearData.ts` closes the Storage Worker gracefully before deleting `python-playground` (`success` in all 3 browsers).
3. **Eliminates Edge's OPFS Force-Stop lock stall:** After `worker.terminate()` on an open OPFS `FileSystemSyncAccessHandle`, Edge `158` holds the exclusive OS file lock for **`2,044 ms`** (34 retries of `NoModificationAllowedError`), stalling worker recovery.
4. **Preserves files written *during* a Force-Stopped run across all 3 browsers:** Hooking Emscripten `MEMFS` `node_ops` / `stream_ops.close` to synchronously `postMessage` file deltas over a `MessageChannel` to the Storage Worker flushes closed writes off the Python worker *before* `worker.terminate()` hits — unlike `IDBFS` (even with `autoPersist: true`) and post-run OPFS/IDB sync, which lose all mid-run writes.
5. **Fastest cross-browser performance with zero UI jank:** Moving IndexedDB off the main thread into the Dedicated Storage Worker fixes two main-thread Option 3A flaws simultaneously:
   - **1,000 small files in WebKit:** drops from **`15,399 ms`** (main-thread IDB) to **`126 ms`** (**122× faster**, and 2.5× faster than `IDBFS`'s `309 ms`).
   - **50 MB binary upload main-thread lag:** drops from `54–71 ms` (`1` frame gap > 50 ms) in main-thread IDB to **`6.0 ms` (Edge), `5.3 ms` (Firefox), `33.6 ms` (WebKit)** (`0` gaps > 50 ms in all 3 browsers).
6. **Enforces `security.md` §3–§4 by construction:** Uses a single namespaced DB (`python-playground`), never creates an unnamespaced `"/workspace"` DB (unlike Emscripten `IDBFS`), and validates every path and size cap (`50 MB` file / `150 MB` workspace) *outside* the untrusted Python worker before persisting.

---

## 2. Pyodide `314.0.8` Source Inspection

Inspecting the actual vendored `public/pyodide/pyodide.mjs` and `public/pyodide/pyodide.asm.mjs` established the exact APIs compiled into our build:

| Capability | Present in `pyodide@314.0.8`? | Exact implementation details |
| --- | --- | --- |
| `FS.filesystems.IDBFS` | Yes | `IDBFS.getRemoteSet` calls `IDBFS.getDB(mount.mountpoint, ...)`. The IndexedDB name is **hardcoded to the mount path** (`"/workspace"` when mounted at `/workspace`). `DB_VERSION = 21`, single object store `"FILE_DATA"` with `"timestamp"` index. |
| `IDBFS` `{ autoPersist: true }` | Yes | Wraps `MEMFS` `node_ops` and `stream_ops.close` to call `IDBFS.queuePersist`, which schedules `setTimeout(startPersist, 0)`. **Cannot fire during synchronous Python execution**, so it cannot save mid-run writes before Force Stop. |
| `pyodide.mountNativeFS` (`NATIVEFS_ASYNC`) | Yes (in `pyodide.mjs`) | Backed by `MEMFS` + async `syncfs()` using `FileSystemFileHandle.createWritable()`. Still async post-run sync (loses mid-run Force Stop writes) and **fails in WebKit** (`UnknownError`). |
| Emscripten `OPFS` / `WASMFS` | **No** | Neither `OPFS`, `WASMFS`, nor `createSyncAccessHandle` exists in `pyodide.asm.mjs`. Any OPFS sync-access bridge must be custom JS in the worker. |

---

## 3. Candidate Architectures Tested

1. **Option 1 — Emscripten `IDBFS`** mounted at `/workspace`:
   - `1a` default (`autoPersist: false`, explicit `FS.syncfs(false)` after runs/edits).
   - `1b` `{ autoPersist: true }` (tested for mid-run Force Stop).
   - `1c` monkey-patched `IDBFS.getDB` remapping `"/workspace"` → `"python-playground"` (tested for DB namespacing).
2. **Option 2 — OPFS (`navigator.storage.getDirectory()` under `python-playground/workspaces/default/`):**
   - `2a` `pyodide.mountNativeFS('/workspace', dirHandle)` (`createWritable()`).
   - `2b` Custom per-file OPFS sync using `FileSystemSyncAccessHandle` (opens/writes/closes each changed file on `sync`).
   - `2c` Custom single-handle OPFS Write-Ahead Log (`wal.bin` kept open via one `FileSystemSyncAccessHandle` + Emscripten `MEMFS` `node_ops`/`stream_ops` hooks writing & flushing framed binary records synchronously during Python execution).
3. **Option 3 — External IndexedDB (`python-playground`) + Worker `MEMFS`:**
   - `3a-batch` Main-thread IDB synced on boot + post-run diff.
   - `3a-live` Main-thread IDB + synchronous `MEMFS` `node_ops`/`stream_ops.close` `postMessage` deltas during Python execution.
   - `3a-blob` Main-thread IDB storing a `50 MB` `Blob` directly (drag-drop `File` probe).
   - `3b` **Dedicated Storage Worker** owning `python-playground` IDB (never runs Python, never terminated on Force Stop) + `MEMFS` live deltas over `MessageChannel`.

---

## 4. Empirical Results Across Edge, Firefox, and WebKit

### 4.1 Feature, Reload, Force Stop, and Clear-All-Data Matrix

| Architecture | Full Reload CRUD (UTF-8, bin, dirs, del, ren) | Force Stop: pre-run files survive | Force Stop: mid-run files survive | Post-Force-Stop recovery & Clear All Data | Namespaced DB / OPFS path | Tier 3 (no SW, COI=false) |
| --- | --- | --- | --- | --- | --- | --- |
| **1a. `IDBFS` (default)** | Edge/FF/WK: Pass | Edge/FF/WK: **Yes** | Edge/FF/WK: **No** | Edge/FF: Clean. **WebKit: `deleteDatabase('/workspace')` hangs (>3s timeout) & permanently deadlocks all subsequent `open('/workspace')` (90s boot timeout)!** | **No** — creates `"/workspace"` (missed by `clearData.ts`!) | Edge/FF/WK: Pass |
| **1b. `IDBFS` (`autoPersist: true`)** | Same as 1a | Edge/FF: **Yes** (WK deadlocked after 1a) | Edge/FF: **No** (`setTimeout(0)` blocked by sync Python) | Same WebKit deadlock | **No** (`"/workspace"`) | Same as 1a |
| **1c. `IDBFS` (patched `getDB`)** | Edge/FF/WK: Pass | Same as 1a | **No** | Same WebKit deadlock; fragile private Emscripten hook | Yes (`python-playground`) | Same as 1a |
| **2a. OPFS `mountNativeFS`** | Edge/FF: Pass. **WebKit: FAIL** (`UnknownError` in both ephemeral & persistent profiles) | Edge/FF: Yes. **WK: N/A** | **No** (async `syncfs`) | Edge/FF: Clean. **WK: Broken** | Yes (`python-playground/...`) | Edge/FF: Pass. **WK: FAIL** |
| **2b. OPFS per-file (`createSyncAccessHandle`)** | Edge/FF: Pass. **WebKit: FAIL** (`UnknownError` ephemeral / `NotSupportedError` persistent) | Edge/FF: Yes. **WK: FAIL** | **No** (async post-run) | Edge/FF: Clean. **WK: Broken** | Yes (`python-playground/...`) | Edge/FF: Pass. **WK: FAIL** |
| **2c. OPFS sync WAL (`wal.bin`)** | Edge/FF: Pass. **WebKit: FAIL** (`UnknownError` ephemeral / `NotSupportedError` persistent) | FF: Yes. **Edge: Stall!** (`NoModificationAllowedError` for **`2,044 ms`**, 34 retries). **WK: FAIL** | FF: **Yes** (`lockWait: 2.3 ms`). Edge: Yes *only after >2 s retry wait*. **WK: FAIL** | **Edge locks `wal.bin` for ~2 s after `terminate()`**; **WK broken** | Yes (`python-playground/...`) | Edge/FF: Pass. **WK: FAIL** |
| **3a. Main-thread IDB (`batch` / `live`)** | Edge/FF/WK: **Pass** | Edge/FF/WK: **Yes** | `batch`: No. **`live`: Yes in ALL 3 browsers!** | **Clean in ALL 3 browsers** (`deleteDatabase('python-playground')` = `success`; `0` leftover DBs) | **Yes** (`python-playground`) | Edge/FF/WK: **Pass** |
| **3b. Dedicated Storage Worker IDB (`live`) [WINNER]** | Edge/FF/WK: **Pass** | Edge/FF/WK: **Yes** | **Yes in ALL 3 browsers!** | **Clean in ALL 3 browsers** (graceful `close` before `deleteDatabase` → `success`, zero WebKit deadlock!) | **Yes** (`python-playground`) | Edge/FF/WK: **Pass** |

> **Key WebKit Finding (Blob in IDB):** Storing a `50 MB` `Blob` directly in WebKit IDB failed (`mainBlob50.ok = false`), whereas storing `Uint8Array` succeeded cleanly across Edge, Firefox, and WebKit. **P3 must store `Uint8Array` / `ArrayBuffer` (not `Blob`) in IndexedDB.**

### 4.2 Benchmark 1: 1,000 Small Files (1 KB each across 10 nested directories, ~1 MB total)

| Architecture | Metric | Edge `158` | Firefox `159` | WebKit `27.2` |
| --- | --- | ---: | ---: | ---: |
| **1a. `IDBFS`** | Initial write + sync | `78.9 ms` (`22.9` w + `56.0` s) | `110.6 ms` (`13.0` w + `97.5` s) | `315.2 ms` (`6.5` w + `308.7` s)¹ |
| | Single-file edit + sync | `14.5 ms` | `14.1 ms` | `255.6 ms`¹ |
| | Cold restore (worker boot) | `61.8 ms` | `71.3 ms` | `427.2 ms`¹ |
| **2b. OPFS per-file** | Initial write + sync | `1,223.4 ms` (`15.6` w + `1,207.8` s) | `10,825.2 ms` (`12.4` w + `10,812.8` s) | **FAIL** |
| | Single-file edit + sync | `4.2 ms` | `10.9 ms` | **FAIL** |
| | Cold restore (worker boot) | `679.3 ms` | `4,578.1 ms` | **FAIL** |
| **2c. OPFS sync WAL** | Initial write (write-through) | `247.2 ms` | `485.1 ms` | **FAIL** |
| | Single-file edit | `0.6 ms` | `1.0 ms` | **FAIL** |
| | Cold restore (WAL replay) | `16.1 ms` | `23.7 ms` | **FAIL** |
| **3a. Main-thread IDB** | Initial write + sync | `45.8 ms` (`15.1` w + `30.7` s) | `91.2 ms` (`17.4` w + `73.8` s) | **`15,406.7 ms`** (`7.9` w + `15,398.8` s)² |
| | Single-file edit + sync | `3.1 ms` | `2.9 ms` | `59.7 ms` |
| | Cold restore (main read + MEMFS) | `43.7 ms` (`32.3` + `11.5`) | `33.2 ms` (`5.7` + `27.6`) | `24.6 ms` (`12.6` + `11.9`) |
| **3b. Storage Worker IDB [WINNER]** | IDB write 1,000 files (single tx) | **`24.5 ms`** | **`45.0 ms`** | **`126.0 ms`** |
| | Single-file edit (IDB put) | **`0.3 ms`** | **`1.0 ms`** | **`1.0 ms`** |
| | Cold read 1,000 files (`getAll`) | **`26.9 ms`** | **`5.0 ms`** | **`8.0 ms`** |

¹ Measured in a clean WebKit context *before* any Force Stop triggered the WebKit `IDBFS` deadlock.  
² WebKit's main-thread IndexedDB incurs ~15 ms/put IPC overhead on 1,000 puts regardless of key shape (`15,114 ms` compound key vs `15,185 ms` string key); running the exact same transaction in a Dedicated Storage Worker drops it to **`126 ms`** (**120× faster**).

### 4.3 Benchmark 2: One 50 MB Binary File (Upload, Main-Thread Responsiveness, Reload, Force Stop)

Main-thread freeze check uses a 4 ms timer drift monitor across all 3 browsers (recording `maxMainBlockMs` and count of gaps `> 50 ms`).

| Architecture | Metric | Edge `158` | Firefox `159` | WebKit `27.2` |
| --- | --- | ---: | ---: | ---: |
| **1a. `IDBFS`** | Upload + persist total | `102.8 ms` | `213.6 ms` | `269.5 ms`¹ |
| | Max main-thread block (`>50ms` gaps) | `6.0 ms` (`0`) | `4.6 ms` (`0`) | `16.5 ms` (`0`)¹ |
| | Cold restore + verify | `60.9 ms` (ok) | `205.9 ms` (ok) | `106.0 ms` (ok)¹ |
| | Force Stop survival | Yes (`59.3 ms`) | Yes (`194.4 ms`) | Deadlocks on clear/reopen |
| **2b. OPFS per-file** | Upload + persist total | `129.8 ms` | `69.1 ms` | **FAIL** |
| | Max main-thread block (`>50ms` gaps) | `6.1 ms` (`0`) | `4.6 ms` (`0`) | **FAIL** |
| | Cold restore + verify | `58.5 ms` (ok) | `33.3 ms` (ok) | **FAIL** |
| **2c. OPFS sync WAL** | Upload + persist total | `136.7 ms` | `52.7 ms` | **FAIL** |
| | Max main-thread block (`>50ms` gaps) | `6.0 ms` (`0`) | `4.6 ms` (`0`) | **FAIL** |
| | Cold restore + verify | `57.9 ms` (ok) | `32.6 ms` (ok) | **FAIL** |
| **3a. Main-thread IDB (`Uint8Array`)** | Upload + persist total | `121.0 ms` | `241.6 ms` | `138.9 ms` |
| | Max main-thread block (`>50ms` gaps) | **`69.4 ms` (`1`)** | **`71.2 ms` (`1`)** | **`53.9 ms` (`1`)** |
| | Cold restore + verify | `51.9 ms` (ok) | `193.0 ms` (ok) | `45.0 ms` (ok) |
| **3b. Storage Worker IDB [WINNER]** | Upload + persist total | **`97.6 ms`** | **`327.8 ms`** | **`122.3 ms`** |
| | Max main-thread block (`>50ms` gaps) | **`6.0 ms` (`0`)** | **`5.3 ms` (`0`)** | **`33.6 ms` (`0`)** |
| | Cold read (`getAll`, transferable) | **`~50 ms`** (ok) | **`~190 ms`** (ok) | **`56.0 ms`** (ok) |
| | Force Stop survival | **Yes** | **Yes** | **Yes** |

*Note on main-thread `50 MB` upload lag:* In Option 3A, calling `store.put({ bytes: u8 })` on the main thread synchronously structured-clones `50 MB`, causing a `54–71 ms` freeze (`1` dropped frame > 50 ms) in every browser. In Option 3B, transferring the `ArrayBuffer` (`[buf.buffer]`) to the Dedicated Storage Worker is zero-copy, keeping main-thread blocking strictly `< 35 ms` (`0` gaps > 50 ms) in all 3 browsers! For drag-and-drop `File` uploads in P3, the Storage Worker can read `await file.arrayBuffer()` inside the worker itself (passing the `File` object via `postMessage` without even allocating the `50 MB` buffer on the main thread!).

---

## 5. Two Tabs & Web Locks (`navigator.locks`)

Tested `navigator.locks.request('python:workspace:default', { ifAvailable: true }, ...)` across two tabs in the same browser context:

| Browser | `navigator.locks` | Tab 1 acquire | Tab 2 immediate reject (`ifAvailable: true`) | Auto-release on Tab 1 close → Tab 2 acquire |
| --- | --- | ---: | ---: | ---: |
| **Edge `158`** | Supported | `true` (`0.56 ms`) | `false` (`0.42 ms`) | `true` (`0.26 ms`) |
| **Firefox `159`** | Supported | `true` (`0.32 ms`) | `false` (`0.18 ms`) | `true` (`0.14 ms`) |
| **WebKit `27.2`** | Supported | `true` (`0.68 ms`) | `false` (`10.24 ms`) | `true` (`1.32 ms`) |

**Takeaway:** Web Locks works identically and instantaneously (`< 11 ms`) across Edge, Firefox, and WebKit, and automatically releases when Tab 1 closes or crashes without needing `beforeunload` hacks.
- **P3 UX contract:** On mount, request `python:workspace:<wsId>` with `{ ifAvailable: true }`. If `lock === null`, show a clear read-only / "Workspace open in another tab" banner with a **"Take over / Retry"** button (and listen via a `BroadcastChannel('python:workspace')` ping so when Tab 1 closes, Tab 2 can automatically re-acquire the lock or offer one-click activation). Never let two tabs write to `python-playground` simultaneously.

---

## 6. Quota, Storage Reporting, and `QuotaExceededError`

Measured `navigator.storage.estimate()` before and after writing a `50 MB` (`52,428,800` byte) binary file into IndexedDB:

| Browser | `estimate()` available | Reported `quota` (ephemeral context) | `usageDetails` | Reported `usage` delta after 50 MB write | Quirks |
| --- | --- | ---: | --- | ---: | --- |
| **Edge `158`** | Yes | `10.00 GiB` (`10,737,424,441 B`) | Yes (`serviceWorkerRegistrations`, `indexedDB`) | `+73.7 KiB` (Chromium compresses all-zero 50 MB buffer in LevelDB/Snappy!) | Compression makes `estimate().usage` underestimate uncompressed workspace bytes for repetitive/zero data. |
| **Firefox `159`** | Yes | `10.00 GiB` (`10,737,418,240 B`) | No (`undefined`) | `+2.42 MiB` (Firefox Snappy-compresses IDB blobs in SQLite) | Same compression underestimate; `usageDetails` is omitted. |
| **WebKit `27.2`** | Yes | `1.00 GiB` (`1,048,576,000 B`) | No (`undefined`) | **`+50.00 MiB`** (`52,428,970 B` exact uncompressed) | Lower default origin quota (~1 GiB in ephemeral / private mode). |

**Critical P3 conclusion on storage accounting & caps:**
- **Do NOT rely solely on `navigator.storage.estimate().usage`** to enforce P3's workspace size cap! Because Edge and Firefox compress IndexedDB payloads transparently, a `150 MB` compressible workspace could report `< 5 MB` in `estimate().usage` while consuming `150 MB` of WASM `MEMFS` RAM!
- **Enforce explicit exact uncompressed caps in the Storage Worker** (tracked in an in-memory size ledger initialized on DB open):
  - **Max single file:** `50 MiB` (`52,428,800` bytes).
  - **Max workspace total:** `150 MiB` (`157,286,400` bytes).
  - **Max entry count:** `2,000` files/directories (protects zip-bomb import and cold-boot time).
- **UI storage meter:** Show **exact workspace bytes used** (`X.X MB / 150 MB` from the Storage Worker ledger) alongside browser origin estimate (`navigator.storage.estimate()`) when available.
- **`QuotaExceededError` handling:** Catch `err.name === 'QuotaExceededError'` on every IDB `transaction.onerror` and `transaction.onabort` in the Storage Worker. Abort cleanly (keeping previous committed state intact), emit a typed `storage.quotaExceeded` error to the UI, and display an actionable localized banner ("Browser storage quota exceeded — delete unused files or clear data") without crashing the worker.

---

## 7. Security, Namespacing & `clearData.ts` Audit (`security.md` §3–§4)

1. **Database naming:** Option 3B uses **only** `indexedDB.open('python-playground', 1)` — 100% compliant with `security.md` §3 (`one IndexedDB database python-playground`). By contrast, unmodified Emscripten `IDBFS` creates `"/workspace"`, which `components/Python/clearData.ts` (line 48: `info.name.toLowerCase().startsWith('python')`) does **not** match!
2. **Required `clearData.ts` hardening for P3:**
   - **Graceful Storage Worker shutdown before deletion:** Before calling `indexedDB.deleteDatabase('python-playground')`, `clearAllPythonData()` must signal the active Storage Worker (via a registered cleanup hook or `BroadcastChannel('python:control')` `{ type: 'clear-close-db' }`) to call `db.close()` and terminate, AND terminate any active Python worker. Without closing connections first, WebKit can block `deleteDatabase`.
   - **Bounded timeout on `deleteIdbDatabase`:** Add a `3,000 ms` timeout fallback inside `deleteIdbDatabase()` in `components/Python/clearData.ts` so a browser IDB quirk can never hang the "Clear all data" reload flow.
   - **OPFS belt-and-suspenders:** Even though P3 does not use OPFS, `clearData.ts` does not need OPFS cleanup unless a future phase uses it (and calling `navigator.storage.getDirectory()` in WebKit private mode throws `UnknownError`, so omitting it avoids spurious console errors).
3. **Defense-in-depth against forged worker messages (`security.md` §4):**
   - Because Python user code can invoke `self.postMessage` via the `js` module, every delta arriving at the Storage Worker over the `MessageChannel` MUST be treated as untrusted:
     - Canonicalize relative paths (POSIX `/` separators, reject empty, leading `/`, `..` segments, NUL bytes, control chars, or length > 512).
     - Enforce `50 MiB` per-file cap, `150 MiB` total workspace cap, and `2,000` entry cap **inside the Storage Worker** before starting an IDB transaction.
     - Note: in a browser, user JS inside the Python worker technically shares the origin's `indexedDB` API unless shadowed; as defense-in-depth in P3, the Python worker can also `delete self.indexedDB` / `Object.defineProperty` best-effort before user code runs (never relied on as a sole security boundary, since CSP/origin isolation is the real boundary, and `security.md` §3 already forbids executing stored code).
4. **Firefox COI worker import note (discovered during S5):** Under `coi-sw.js` (`COEP: require-corp`), Firefox module workers must load `/pyodide/pyodide.mjs` via dynamic `await import(...)` rather than a static top-level `import` statement (already followed by `public/python/python-worker.js`; the Storage Worker does not import Pyodide and has zero external imports).

---

## 8. Concrete P3 Architecture & Implementation Plan

### 8.1 Process & Worker Topology

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Main Thread (React UI + Monaco + FileTree + Web Lock owner)             │
│  • Acquires navigator.locks('python:workspace:default', ifAvailable)    │
│  • Spawns Storage Worker ONCE per page session (never Force Stopped)    │
│  • Spawns / terminates Python Worker freely on Run / Force Stop / OOM   │
│  • Sends drag-drop File objects directly to Storage Worker (0 MB clone) │
└──────────────────┬───────────────────────────────────┬──────────────────┘
                   │ postMessage (UI tree/read/upload) │ postMessage (run/stdio/stop)
                   ▼                                   ▼
┌────────────────────────────────────┐  MessageChannel  ┌────────────────────────────────┐
│ Storage Worker (/python/storage-   │◄────────────────►│ Python Worker (/python/        │
│ worker.js — trusted, never killed) │  direct port     │ python-worker.js — untrusted)  │
│  • Owns IDB 'python-playground'    │  • cold snapshot │  • Runs Pyodide + user code    │
│  • Validates paths & size caps     │  • live deltas   │  • MEMFS at /workspace         │
│  • Tracks exact workspace bytes    │  • post-run sync │  • MEMFS node_ops/stream_ops   │
│  • Handles zip import/export reads │                  │    hooks post live deltas      │
└────────────────────────────────────┘                  └────────────────────────────────┘
```

### 8.2 IndexedDB Schema (`python-playground`, version `1`)

Single database `python-playground` (ready for P5 package manifest store in version `2`):

- **`workspaces` store** (`keyPath: 'id'`):
  - `{ id: 'default', name: 'Default', createdAt: number, updatedAt: number, totalBytes: number, entryCount: number }`
- **`files` store** (`keyPath: ['ws', 'path']`, index `by_ws` on `'ws'`):
  - `{ ws: 'default', path: 'src/main.py', isDir: boolean, size: number, mtime: number, bytes: Uint8Array | null, createdByRun?: boolean }`
  - `path` is normalized relative to `/workspace` (no leading `/`, no `..`).
  - `bytes` is always `Uint8Array` (never `Blob`, avoiding WebKit's Blob-in-IDB failure).

### 8.3 Write-Through & Sync Lifecycle

1. **Cold boot / Force Stop recovery:**
   - Main thread creates a `MessageChannel`, sends `port1` to Storage Worker and `port2` to the new Python Worker during `init`.
   - Python Worker requests `snapshot` on `port2`. Storage Worker reads `files` for `ws = 'default'` via `by_ws` index (`5–27 ms` for 1,000 files; `~50–190 ms` for 50 MB), clones/copies `ArrayBuffer`s (`Uint8Array.slice()`) and transfers them to the Python Worker, which populates `/workspace` in `MEMFS` (`~11–28 ms`) and installs the `MEMFS` hooks.
2. **During a Python run (Live Deltas):**
   - `MEMFS` `node_ops` (`mknod` dir, `unlink`, `rmdir`, `rename`) and `stream_ops.close` (when `node.__dirty` is set by `write`/`setattr`) synchronously post delta messages to `port2` (`put` copies the file's `Uint8Array` and transfers it).
   - **Large-file throttle during tight loops:** If a script writes to the same file repeatedly in a tight loop without closing, `stream_ops.write` only marks `node.__dirty = true` — the delta fires on `close` (and on `fsync` if called). Additionally, cap queued in-flight delta bytes (e.g. if a file > `50 MiB`, drop with an error notice rather than copying).
   - Storage Worker validates each delta, updates its byte/count ledger, writes to IndexedDB in a serialized queue, and pushes lightweight metadata updates (`path, size, mtime, isDir, createdByRun`) to the main thread so the File Tree updates live.
3. **End of a normal run (Reconciliation barrier):**
   - Python Worker runs a fast metadata walk of `/workspace` vs its last-synced map, flushes any remaining dirty files (e.g. files kept open across statements or created via low-level Emscripten APIs), and awaits an `ack` from the Storage Worker before transitioning UI state to idle.
4. **Force Stop (`worker.terminate()` mid-run) — Documented S5 Contract for P3 "Done when":**
   - **Files saved before the run:** **100% preserved** (already committed in `python-playground`).
   - **Files written and closed during the run before Force Stop:** **Preserved** in Edge, Firefox, and WebKit (synchronously posted over `MessageChannel` on `close()` and committed by the still-running Storage Worker).
   - **Files left open/unflushed when Force Stop fires (or written in the final microsecond before `terminate()`):** **Not guaranteed to survive** (cannot be flushed from a terminated worker's `MEMFS`). P3's status/help text should state this honestly in plain words.
5. **UI-initiated file operations (Editor autosave, File Tree create/rename/delete/move, Drag-drop upload, Zip import):**
   - Main thread sends the operation (including raw `File` handles for drag-drop uploads!) to the **Storage Worker** first.
   - Storage Worker reads `await file.arrayBuffer()`, enforces the `50 MiB` / `150 MiB` / `2,000`-entry caps, commits to IndexedDB, and mirrors the change over `port1` into the Python Worker's `MEMFS` (if idle; or queues until the current run finishes).
   - Result: uploading a `50 MB` file never allocates `50 MB` on the main thread and never blocks the UI `> 50 ms` in Edge, Firefox, or WebKit.
6. **File-tree & download while Python is busy:**
   - Because the Storage Worker holds the authoritative committed workspace independently of the Python Worker, viewing the file tree, previewing files, and downloading files/zips remain responsive even while a Python script is executing.

### 8.4 New Modules for P3

- `public/python/storage-worker.js` — Dedicated Storage Worker served under `/python/` (covered by `coi-sw.js` COOP/COEP/CORP + strict worker CSP; zero external imports).
- `lib/python/storageClient.ts` — Main-thread typed client for the Storage Worker, Web Lock coordinator (`python:workspace:<id>`), `BroadcastChannel('python:workspace')` cross-tab notifications, and `clearData.ts` close hook.
- `lib/python/workspace.ts` — Shared pure-TS path canonicalizer, zip safety validator (rejects `..`, absolute paths, symlinks, > 2,000 entries, > 150 MiB uncompressed), size caps (`50 MiB` / `150 MiB`), and storage usage formatting.
- Updates to `public/python/python-worker.js` — Mount `/workspace` as `MEMFS`, accept `MessageChannel` port on `init`, populate from Storage Worker snapshot, install `MEMFS` write-through hooks, and emit reconciliation barrier on run end.
- Updates to `components/Python/clearData.ts` — Close Storage Worker cleanly before `deleteDatabase('python-playground')` and add a `3,000 ms` timeout guard to `deleteIdbDatabase()`.
