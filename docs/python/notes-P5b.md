# Python playground: P5b notes (manifest, saved wheels, restore), for P6

What P5b built is in [modules.md](modules.md) (`packages.ts`, `requirements.ts`, `packageRestore.ts`,
`wheel-worker.js`, the v2 schema in `storage-worker.js`) and checked by `package-unit-checks.mjs` (Node) and
`packages-restore-checks.mjs` (part 2 of `PYTHON_PARTS=packages`; `PYTHON_PKG_ONLY=restore` runs only it).
Design: [notes-P5.md](notes-P5.md) §5–§8; decisions D15, D20–D24 in [plan.md](plan.md).

## API for the Packages panel

- **`new PackageRestorer({ client, storage, mode, confirmStale?, onRestoreStart?, onRestore? })`, then
  `attach()`** right after creating the worker client (before its first start). After every `ready` it
  restores the kept entries in one `pkg.install` (reason `restore`); `client.holdUntil()` makes runs and
  console lines wait for it, so P6 does not need to await anything before Run. `onRestore(report)` gives
  `{ installed, failed, skipped, error?, durationMs }`; show it in the list and a status line.
  `whenIdle()` settles when a restore/import is done. `dispose()` on unmount.
- `keepPackages(infos, { installed? })`: keeps installed packages plus every dependency they need (deps get
  `requested: false`). PyPI and wheel entries need a saved copy (D20): uploaded wheels pass their bytes,
  PyPI wheels are fetched by the page from their `files.pythonhosted.org` URL, in Package index mode only.
  Returns `{ kept, failed: [{ name, reason }] }`.
- `installWheelFiles(files, { keep })`: name, size and tag checks first (`rejected`), hashed, installed in one
  call, kept with their bytes when `keep`.
- `removePackage(name)`: removes it and orphaned dependencies, prunes unused saved bytes (also rows user code
  added), restarts the worker (the files stay; what is still kept is restored).
- `importLock(text)` installs a `yotasage-python-lock/1` file under the same rules; `markCurrent(names)` after
  the visitor confirmed stale entries (pass them through `confirmStale`, then `client.restart()`).
- Pure helpers: `readManifest()`, `planRestore()`, `checkWheelTags()`, `loadBundledIndex()` (packages.ts);
  `parseRequirements()`, `planRequirements(parsed, mode, bundled)` → `{ items, planned, skipped }` (send
  `items` with `client.installPackages(items, 'user')` after the visitor confirms), `hashProblems()`,
  `exportRequirements(entries)`, `exportLock(entries, readyInfo)` (requirements.ts).

## Codes for i18n

- Restore skips (`RestoreSkipReason`): `stale` (other Pyodide version, ask), `incompatible` (compiled for
  another ABI/platform), `not-bundled`, `network-off`, `needs-package-index` (PyPI entry without a saved
  copy), `wheel-missing` (upload the file again), `hash-mismatch` (saved bytes changed; never installed and
  never fetched instead).
- Keep failures (`KeepFailureReason`): `code` (D23), `code-dependency`, `missing-dependency`, `no-hash`,
  `no-saved-copy`, `hash-mismatch`, `cap-exceeded`, `storage-error`. Wheel rejects: `invalid-name`,
  `too-large`, `incompatible-wheel` (`info` = the wheel's platform tag).
- Requirements skips (`RequirementSkipReason`): `include` (-r/-c), `editable`, `url`, `index-option`,
  `option`, `invalid`, `duplicate`, `too-many`, `bundled-version` (`info` = bundled version), `network-off`,
  `needs-package-index`.

## Caps and storage

- Manifest: 200 entries, 64 KiB of JSON; an invalid whole is treated as empty, invalid entries are dropped.
- Saved wheels (`wheels` store, separate from the workspace caps): 50 MiB per wheel, 200 MiB and 64 wheels
  in all (`CAP_EXCEEDED`); one restore install carries at most 150 MiB, so larger sets go in several calls
  (dependencies first).
- Requirements: 64 KiB, 500 requirements.
- The wheel store lives in its own worker (`/python/wheel-worker.js`, Off CSP) because the storage worker's
  CSP (`worker-src 'none'`) refuses module imports in Firefox and WebKit and the storage worker is near
  40 kB. `storage-worker.js` owns the schema (v2); the client opens it before starting the wheel worker.
- Clear all data already removes both (`python:*` keys, the whole database); checked in all three browsers.
  It unregisters the service worker, so no new worker can start on that page until it reloads (the page
  reloads anyway).

## Left for later

- A stale entry's confirmation dialog, the "PyPI (saved copy)" label and the `storage.blocked` notice
  (another tab on v1) are P6 UI.
- WebKit's Playwright may not route requests of a service-worker-controlled page, so the harness gives the
  restorer a `fetchFn` that maps `files.pythonhosted.org` to the same-origin mock in WebKit; the
  restore-by-URL fallback (a worker fetch) is checked in Edge and Firefox only.
