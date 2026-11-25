# Python Playground — Phase 3 Verification Notes (`P3a` + `P3b`)

Phase 3 delivers the persistent Option 3B virtual file system, multi-tab Monaco Editor with autosave, File Tree CRUD, drag-and-drop file/folder upload, safe ZIP import/export, built-in examples, W5 upload notice, storage usage indicator, and single-tab Web Locks ownership on `/python/main`.

## 1. Architecture Summary

- **Option 3B Storage Worker (`P3a`):** [public/python/storage-worker.js](../../public/python/storage-worker.js) owns IndexedDB `python-playground` (v1, `Uint8Array` values) under strict Off CSP and mirrors deltas over a direct `MessageChannel` to [public/python/python-worker.js](../../public/python/python-worker.js) MEMFS `/workspace`. Files survive page reloads and Force Stop warm restarts (including files written and closed mid-run before Force Stop).
- **Files UI & Multi-Tab Editor (`P3b`):**
  - [components/Python/useWorkspace.ts](../../components/Python/useWorkspace.ts): acquires `python:workspace:default` via Web Locks (`acquireWorkspaceLock` + `onWorkspaceLockReleased`), boots `PythonStorageClient`, seeds `main.py` on empty workspaces, persists up to 15 open tabs with clean-LRU eviction (`python:open-tabs-v1`), runs 400 ms debounced autosave + synchronous pre-run flush, handles `fs.changed` sync (reloading clean open tabs and flagging run-created files), and shuts down cleanly before W9 `Clear all data`.
  - [components/Python/FileTree.tsx](../../components/Python/FileTree.tsx) & [components/Python/fileHelpers.ts](../../components/Python/fileHelpers.ts): collapsible desktop sidebar and phone `Files` tab with inline New File/Folder/Rename/Move/Delete forms (zero `window.prompt`, pure React text nodes), direct `File`/`Blob` upload + recursive `webkitGetAsEntry()` folder drag-drop, single-file download, streaming `fflate` ZIP import/export rejecting `..`/absolute paths/zip bombs, 7 built-in examples picker, W5 dismissible notice (`.py`, `.whl`, `.zip`, `.html`, `.htm`), cap/quota error banners, and workspace + browser storage quota readout.
  - [components/Python/PythonEditor.tsx](../../components/Python/PythonEditor.tsx): multi-tab Monaco Editor managing one `ITextModel` + `ICodeEditorViewState` per open text file, auto language detection, dirty dot indicators, multi-file traceback jump & marker support, and a binary/large-file (`> 2 MiB`) placeholder with Download ready for Phase 4 viewers.

## 2. 3-Browser UI Harness Summary (`57 passed, 0 failed`)

Verified against the real static export (`out/` served on `http://localhost:3023` with zero server-added security headers) via `npm --prefix scripts/harness/python run ui` ([scripts/harness/python/ui.mjs](../../scripts/harness/python/ui.mjs) + [scripts/harness/python/ui-files-checks.mjs](../../scripts/harness/python/ui-files-checks.mjs)):

| Check | Edge 158.0.4370.33 | Firefox 159.0 | WebKit 27.2 |
| --- | --- | --- | --- |
| All 13 P2 desktop, phone, theme, i18n & W1–W9 security checks | Pass (`1,445 ms` boot, `62 ms` stop) | Pass (`1,393 ms` boot, `50 ms` stop) | Pass (`2,045 ms` boot, `195 ms` stop) |
| Phone `375×812` `Files` tab switch & zero horizontal overflow | Pass | Pass | Pass |
| Multi-file create (`helper.py`), import from `main.py`, Run (`"Hi P3!"`), full reload persistence & re-run | Pass | Pass | Pass |
| Script writes `generated.txt` → File Tree displays run-created `"New"` badge (`data-created-by-run="true"`) | Pass | Pass | Pass |
| Examples picker (`modules`) copies files, opens `main.py`, and Run prints `"Smoothed signal"` | Pass | Pass | Pass |
| Upload `.py` file → W5 notice appears with exact text and dismisses cleanly | Pass | Pass | Pass |
| Export `.zip`, import valid `.zip` (`pkg/from_zip.py`), and reject malicious `../evil.py` `.zip` (visible alert, 0 escape) | Pass | Pass | Pass |
| Second tab in same context displays Web Locks notice banner and disables writes/Run | Pass | Pass | Pass |

## 3. Real Bugs Uncovered & Fixed During `P3b`

1. **`NetworkDialog` form reset on background re-render ([components/Python/NetworkDialog.tsx](../../components/Python/NetworkDialog.tsx)):** `useEffect([open, currentPolicy, onClose])` re-ran whenever `PythonPlayground` re-rendered during Storage/Worker startup because `onClose` was an inline arrow function, wiping `selectedMode` and `hostsText` mid-edit. Fixed by keeping `onClose` in a ref and memoizing `handleCloseNetworkDialog`.
2. **WebKit `ModalFrame` post-paint `Escape` race ([components/Python/SecurityDialogs.tsx](../../components/Python/SecurityDialogs.tsx), [components/Python/NetworkDialog.tsx](../../components/Python/NetworkDialog.tsx)):** Registering `window.addEventListener('keydown')` only inside the `[open]` `useEffect` left a brief post-paint window on busy WebKit startup where `Escape` on W7 could arrive before the listener attached (or be stopped by focused Monaco/xterm children). Fixed by registering a capture-phase `document.addEventListener('keydown', ..., true)` on mount checking `openRef.current`.
