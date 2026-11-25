# Python playground: P5r packages research notes

Research for P5 (packages, engine). No product code was changed. The measurements come from a throwaway spike
(Playwright, `/python/harness` from the current `out/` export on the harness server `localhost:3023`, the harness's
`PythonWorkerClient`) in **Edge 158, Firefox 159 and WebKit 27.2**, Pyodide **314.0.8**, micropip **0.11.1**. PyPI was
never contacted: `pypi.org` and `files.pythonhosted.org` were answered by Playwright routes with canned PEP 691 JSON
and tiny pure-Python wheels built in Node with `fflate`; every other external request was aborted and counted.
Times are `edge / firefox / webkit` in ms. Source references are to the files at commit `850ddc8`; micropip's
are to the wheel `public/pyodide/micropip-0.11.1-py3-none-any.whl`.

## 1. Headline findings

1. **Auto-load on import already exists** (`python-worker.js:1080-1094`): before every run the worker joins the entry
   file and every workspace `.py` (up to 256 KiB, `:653-677`) and calls `pyodide.loadPackagesFromImports`. It misses
   imports it cannot see: dynamic imports and **optional imports inside packages** (measured in all 3 browsers:
   `pd.DataFrame(...).plot()` without `import matplotlib` raises `ImportError: matplotlib is required for plotting`;
   `importlib.import_module("sym"+"py")` raises `ModuleNotFoundError`). P5 adds a finder that reports these (§2).
2. **A script cannot install in Tier 1.** `asyncio.run(micropip.install(...))` inside a Tier 1 run hangs until Stop
   (5,013 / 5,008 / 5,015 ms, then `KeyboardInterrupt`), with the network on or off and even for a local `emfs:` wheel:
   the worker's JS event loop is blocked, so no promise resolves. `pyodide.ffi.run_sync` fails at once (`RuntimeError:
   Cannot stack switch because the Python entrypoint was a synchronous function`). In **Tier 2** both work
   (`run_sync(micropip.install(...))` 207 / 227 / 270 ms; `asyncio.run(micropip.install(...))` 8 / 11 / 78 ms), because
   Tier 2 runs through `runPythonAsync`. **Everything installs fine between runs** through the async path the REPL
   already uses (`python-worker.js:1189-1201`, `PyodideConsole` with top-level `await`), in Tier 1 too.
3. **Off mode is safe, but unclear, and in WebKit it hangs:** in Edge and Firefox `await micropip.install("rich")`
   fails after 143 / 154 ms with `ValueError: Can't fetch metadata for 'rich'. Please make sure you have entered a
   correct package name …`, the same text as a misspelt name; **0 requests** reached the network (the CSP blocks
   first). **In WebKit a fetch the worker CSP blocks never settles**, so the same call (and a wheel whose dependency
   micropip looks up on PyPI) hangs the console for good (> 20 s, three runs; only a worker restart recovers). With
   the index list emptied first (`index_urls=[]`) micropip makes no fetch at all: it fails in **5 / 8 / 118 ms**, and
   bundled packages still install through our lock (`pytz` 3 / 6 / 120 ms). So the P5 wrapper **must** empty the
   index in Off (and refuse hosts the mode blocks before fetching), and word the error itself.
4. **No request ever goes to the CDN.** Routed lists across all runs contain only `pypi.org/simple/<name>/` and
   `files.pythonhosted.org/...`; bundled installs through micropip (`sympy`: 277 / 330 ms) come from `/pyodide/`.
5. **The worker cannot read `localStorage`** (`hasattr(js, "localStorage") == False` in all 3 browsers) but **can open
   IndexedDB** and Web Crypto. So a manifest in IndexedDB is writable by user code, one in `localStorage` is not (§5).
6. **`blob:` URLs cannot be fetched under the worker CSP** (`connect-src 'self'`): Edge `TypeError: Failed to fetch`,
   Firefox `NetworkError …`, and in WebKit the fetch **never settles** (as in finding 3). Wheels from bytes therefore
   go through MEMFS and `micropip.install("emfs:/…")` (27 / 47 / 326 ms for a tiny wheel, no request), never through
   a blob URL.
7. **`micropip.uninstall` does not unload:** after it, `"tinypkg" in sys.modules` is `True` and `import tinypkg` still
   works. Removal must restart the worker. A fresh worker has none of the session's packages (Firefox 1,619 ms,
   WebKit 1,541 ms to ready, then `No module named 'tinypkg2'`).
8. **Bug found in v1 (P5 must fix):** `PythonWorkerClient.restart()` and `forceStop()` called while the client is
   `ready` return the old `ReadyInfo` and leave **no worker**: `terminateWorkerOnly()` (`workerClient.ts:649-657`)
   does not clear `_readyInfo`/`_state`, so `start()` returns early (`:266-268`). Measured in Edge: `restart()` resolved
   in 0 ms and the next `run()` threw `Python worker is not running`. The page's Restart button
   (`PythonPlayground.tsx:372-387`) hits this when Python is idle. Fix: clear `_readyInfo` and set the state before
   `start()` in both methods; add a harness check.
9. **`micropip.freeze()` is not usable as our lock as it stands:** it throws `PackageNotFoundError` as soon as one
   installed wheel has a requirement that is not installed (a wheel installed with `deps=False`), it lists all 17
   bundled packages, and uploaded wheels appear as `emfs:/tmp/…` URLs that mean nothing in a later session (§7).

## 2. Auto-load on import (question 1)

- Mechanism today: `handleRun` → `collectPythonSourcesForImportScan(code)` → `pyodide.loadPackagesFromImports(src)`
  (`python-worker.js:1080-1094`), which runs `pyodide.code.find_imports` (ast) and loads matching lock entries with
  their `depends`, `checkIntegrity` on (sha256 from our lock). Errors are swallowed so CPython raises its own
  `ModuleNotFoundError`. Cost: `print(1)` run 26 / 26 / 35 ms in total; `import numpy` cold 431 / 438 / 375-570 ms,
  warm 2 / 2 / 2-8 ms; `import pandas` cold (pandas, dateutil, pytz, six) 1.3-2.0 s.
- REPL lines are **not** scanned (`handleReplPush` has no scan); `PyodideConsole` does not load packages either. P5
  should run the same scan on each pushed line (cheap: one `find_imports` call).
- Imports the scan cannot see (dynamic, optional imports inside bundled packages, files over the 256 KiB budget):
  add `yotasage_rt/packages.py` with a `sys.meta_path` finder appended **last** (after the normal finders, so it
  only sees misses). For a top-level name that is an `imports` entry of our lock (`pyodide_js._api.lockfile_packages`)
  it raises `ModuleNotFoundError` with a clear text and records the package name. The worker sends the names with
  `run.end` as `missingPackages`; the page offers "Load {names} and run again" (bundled only; our own files, so no
  authority question). In Tier 2 the finder can instead `run_sync(pyodide_js.loadPackage(name))` and continue
  (works there, finding 2). Making Tier 1 runs enter through a promising call (`callPromising`) would give the same
  in Tier 1, but S3's Stop and `input()` measurements were made on the synchronous path: keep it out of P5 (backlog).
- micropip itself is **not** loaded at boot today (architecture.md §9 says it is); loading it costs about 120-140 ms
  (143 vs 5 ms above). Load it on the first package operation, not at boot.

## 3. micropip per network mode and tier (question 2)

| Situation | Off | Package index | Notes |
|---|---|---|---|
| REPL `await micropip.install("rich")` | fails, 0 requests (WebKit: hangs, finding 3) | works (canned: 279 / 299 / 255 ms incl. micropip load) | all tiers |
| Script, Tier 1, `asyncio.run(micropip.install(...))` | hangs until Stop | hangs until Stop (5,014 / 5,007 / 5,015 ms) | JS loop blocked |
| Script, Tier 1, `run_sync(...)` | `RuntimeError` at once | same | no promising entry |
| Script, Tier 2, `run_sync` / `asyncio.run` | works for `emfs:`/bundled | works | `runPythonAsync` |
| Page-initiated install between runs (worker op) | bundled + wheels | + PyPI | all tiers |
| Other host (`micropip.install("https://example.com/x.whl")`) | blocked | blocked by CSP: `Can't fetch wheel … CORS` | never reached the network |

**Recommendation.**

1. **All page-initiated installs run as a worker operation between runs** (`pkg.install`, executed with
   `runPythonAsync('await yotasage_rt.packages.install(...)')`, the REPL's path), never inside a run. This works in
   every tier. The page only sends it after the visitor's click: the Packages panel's Install (W6 in Package index
   mode), requirements import (one W6 listing everything that will come from PyPI), and the **PEP 723 block** of the
   file being run (`# /// script` … `dependencies = ["rich>=13"]` … `# ///`). The page parses that block itself from
   the file it is about to run (it has the text; no worker message involved); for names that are neither bundled nor
   installed it shows W6, sends `pkg.install`, then `run`. In Off it lists what it skipped and runs anyway.
2. **User code calling micropip.** `yotasage_rt` wraps `micropip.install` (a lazy `sys.meta_path` hook, like the PIL
   hook at `shims.py:103-135`): in **Off** it passes `index_urls=[]` so only our lock and `emfs:` wheels resolve,
   and turns "Can't fetch metadata" into the Off message (5-118 ms, no request; without it WebKit hangs); in
   Package index mode it refuses any index or wheel URL outside the two PyPI hosts before fetching (WebKit would
   hang on the CSP block too); in a **Tier 1 run** it raises at once
   ("micropip can't install while a script runs here; use a `# /// script` block, the Packages panel or the
   console") instead of hanging. In the console (all tiers) and in Tier 2 scripts it works.
3. **Authority.** In Package index mode, a package that *code* installs needs **no W6**: the mode already lets that
   code fetch any file from PyPI and execute it, so a dialog would add nothing. What needs authority is what
   outlives the session: such packages are **session-only, never kept**, and are listed in the panel as "installed by
   code". Keeping one needs the visitor's click (P6), which writes the page-only manifest (§5). The worker reports
   installs only as data (`pkg.list.result`), and no worker message can keep, restore or install anything.

## 4. Index URL, our lock and the CDN (question 3)

- Pyodide's loader sets `cdnUrl = packageBaseUrl ?? "https://cdn.jsdelivr.net/pyodide/v314.0.8/full/"`, but `cdnURL`
  is used only under Node (`packageCacheDir`); in a browser wheels come from `packageBaseUrl`, which defaults to the
  folder of `lockFileURL` = our `/pyodide/` (`python-worker.js:939-944`). `loadPackage` checks the lock's sha256.
- micropip (`micropip/_compat/_compat_in_pyodide.py`) reads the lock that Pyodide loaded (`lockfile_packages`,
  `lockfileBaseUrl`) and installs lock entries with `pyodide.loadPackage`. It searches the lock **first** only when
  `index_urls` is the default `["https://pypi.org/simple"]` (`transaction.py:51-56`), otherwise index first then lock
  (`:216-238`); both paths work (`pytz` with `index_urls=[]`). Its only other network origins are the index URLs and
  the wheel URLs the index returns (`package_index.py:21-22, 270-339`); `cdn.jsdelivr.net` appears only in an error
  branch (`wheelinfo.py:207-234`). Pyodide packages that are not in our trimmed lock (e.g. `regex`, `lxml`) fall
  through to PyPI and fail with "Can't find a pure Python 3 wheel"; they are never fetched from the CDN.
- Nothing to configure. Keep `lockFileURL` pointing at our lock and never pass a user-provided `lockFileContents`.

## 5. Manifest (question 4)

**Where.** Recommendation: the manifest lives in **`localStorage` under `python:packages-v1`**, written only by the
page. The worker has no `localStorage` (finding 5), so user code cannot edit it at all, and `Clear all data` already
removes every `python:*` key (`components/Python/clearData.ts:101-102`). In IndexedDB, rules alone cannot make an
edited manifest harmless: user code could add `{"name": "evil", "source": "pypi", "sha256": <its real hash>,
"keep": true}`, which passes every hash check, and it would be restored in every later Package index session, the
lasting backdoor D15 forbids. Only the **wheel bytes** go to IndexedDB (§6), checked against the hashes in this
manifest.

```json
{ "v": 1, "updatedAt": "2026-11-25T12:00:00Z",
  "entries": [
    { "name": "rich", "version": "14.2.0", "source": "pypi", "requested": true, "keep": true,
      "fileName": "rich-14.2.0-py3-none-any.whl", "sha256": "<64 hex>",
      "url": "https://files.pythonhosted.org/packages/…/rich-14.2.0-py3-none-any.whl",
      "depends": ["markdown-it-py", "pygments"], "imports": ["rich"],
      "installedAt": "2026-11-25T12:00:00Z", "pyodideVersion": "314.0.8", "abi": "2026_0" } ] }
```

- `source`: `bundled` | `pypi` | `wheel`. `requested: false` marks dependencies pulled in by another entry, so
  removal can offer to remove orphans. `name` is the canonical distribution name (PEP 503). `url` only for `pypi`
  and only on `https://files.pythonhosted.org/`. `fileName`, `sha256` (lower-case hex) for `pypi` and `wheel`.
- Fields come from the worker's `pkg.result` (micropip records `PYODIDE_SOURCE`, `PYODIDE_URL`, `PYODIDE_SHA256` in
  each dist-info, measured: `pypi` + the pythonhosted URL + the hash it checked; `emfs:/…` for a local wheel). The
  page validates them (name pattern, sizes, hex, URL host) before writing.
- Caps: 200 entries, 64 KiB of JSON. An unreadable or invalid manifest is treated as empty and shown as such.
- If the coordinator prefers IndexedDB for the manifest after all, these rules are the minimum: bundled entries are
  installed only by name from our lock; `wheel` entries only from stored bytes whose sha256 matches; `pypi` entries
  only in Package index mode, hash-checked, **and only after a W6 listing them on each restore**, which is the step
  that makes injection visible.

## 6. Uploaded wheels (question 5)

- **Store:** new object store `wheels` in `python-playground`, **DB version 1 → 2** in `storage-worker.js:8-11,
  126-158` (the existing `contains()` checks make the upgrade additive; v1 data is untouched). Key `sha256`, value
  `{ sha256, fileName, size, bytes: Uint8Array, addedAt }` (`Uint8Array`, as the files store, never `Blob`). Add
  `req.onblocked` (another tab still on v1) with a notice. Caps: 50 MiB per wheel (as `MAX_FILE_BYTES`), 150 MiB and
  64 wheels in total, separate from the workspace cap. New storage ops: `wheel.put`, `wheel.get`, `wheel.delete`,
  `wheel.list`, `wheel.stats`.
- **Hashing:** the page hashes with `crypto.subtle.digest('SHA-256')` before `wheel.put` and records the hash in the
  manifest; on use it reads the bytes, hashes again and compares with the manifest before sending them. Bytes with
  no manifest entry are never installed (they can only be deleted).
- **Install:** `pkg.install` carries `{ kind: 'wheel', fileName, sha256, bytes }` (transferred). The worker writes
  the bytes to `/tmp/yotasage-wheels/<fileName>` (outside `/workspace`, so not synced) and runs
  `await micropip.install("emfs:/tmp/yotasage-wheels/<fileName>")`, then deletes the file. micropip checks only the
  file name for compatibility; it does **not** check a hash for `emfs:` or URL wheels (`WheelInfo.from_url` has
  `sha256=None`), which is why the page checks it. Not a blob URL (finding 6).
- **Dependencies:** in Off, a wheel whose `Requires-Dist` names something neither bundled nor installed fails with
  `Can't fetch metadata for 'notbundledxyz'` (measured); the page maps it to "needs X: upload its wheel too". Several
  wheels uploaded together are installed in one call so they satisfy each other. `deps=False` works but leaves
  `freeze()` broken (finding 9), so it is not offered.
- **Tags (measured texts):** `…-cp311-cp311-manylinux_2_17_x86_64.whl` → `Wheel platform 'manylinux_2_17_x86_64' is
  not compatible with Pyodide's platform 'emscripten-5.0.3-wasm32'`; `…-pyemscripten_2025_0_wasm32.whl` → `Wheel was
  built with Emscripten vpyemscripten.2025.0 but Pyodide was built with Emscripten v5.0.3`; `…-emscripten_3_1_58_wasm32`
  → `… Emscripten v3.1.58 …`; another CPython ABI → `Wheel abi '…' is not supported` (`_utils.py:155-212`).
  (Edge and Firefox; in WebKit these cases ran after the hang of finding 3 and were not measured, same Python code.)
  `py3-none-any` and `cp314-cp314-pyemscripten_2026_0_wasm32` wheels install. The page can pre-check the file name
  with the same rules before storing, so a wrong wheel is refused at upload.

## 7. Lazy restore, freeze and requirements (questions 6 and 7)

**Restore.** Kept entries are restored **before the first Run or console line after each worker start**, all at
once, in one `pkg.install` from the page, with a status line ("Restoring 3 kept packages…") and the result shown in
the list; never at boot and never again until the next restart. Matching only the packages a run imports would need
import names (which often differ from distribution names) and a round trip per run; kept sets are small (a tiny wheel
installs in 27 / 47 ms from bytes), so restore-all is simpler and predictable. Rules, applied by the page:

| Source | Off | Package index | Selected hosts / Everything |
|---|---|---|---|
| bundled | by name from our lock | same | same |
| wheel | stored bytes, sha256 matches the manifest | same | same |
| pypi | **skipped** (or from cached bytes, open question 1) | fetched from its pythonhosted URL by the worker, sha256 checked by the worker before install | skipped (D6) unless open question 2 says otherwise |

For a `pypi` restore the worker does its own `fetch` + `crypto.subtle` hash + `emfs:` install, because micropip would
not check a hash for a plain URL.

**Freeze.** Measured `micropip.freeze()` entry after a PyPI install: `{"name": "tinypkg", "version": "1.0.0",
"file_name": "https://files.pythonhosted.org/…/tinypkg-1.0.0-py3-none-any.whl", "install_dir": "site", "sha256": "…",
"imports": ["tinypkg"], "depends": []}`, plus `info` and all 17 bundled packages. Useful as a source of `depends`
and `imports`, not as our lock (finding 9). P5 builds its exports from the manifest:

- `requirements.txt`: one `name==version` line per requested entry, `--hash=sha256:…` for `pypi` and `wheel`
  entries (pip's hash-checking format), and a comment per entry with its source (`# bundled`, `# PyPI`,
  `# wheel: rich-14.2.0-py3-none-any.whl`).
- `python-packages.lock.json`: `{ "format": "yotasage-python-lock/1", "pyodideVersion", "abi", "entries": [ …manifest
  fields without keep/installedAt… ] }`, which restores exactly (wheels only when the bytes are in the store).

**Requirements import** (`lib/python/requirements.ts`, max 64 KiB / 500 lines). Supported: blank lines, `#` comments
(also after a requirement), `\` line continuation, PEP 508 names with extras, version specifiers and environment
markers (`name`, `name==1.2`, `name>=1,<2`, `name[extra]; python_version>="3.12"`; micropip evaluates markers), and
`--hash=sha256:` (kept and checked). Skipped with a reason: `-r`/`--requirement` and `-c`/`--constraint` (import
that file too), `-e`/editable, local paths, VCS and direct URLs (`git+…`, `name @ https://…`), `--index-url`,
`--extra-index-url`, `--find-links` (only PyPI is used), and any other option. Per mode: bundled names whose lock
version satisfies the specifier install in every mode (otherwise "the bundled version is X"); PyPI names only in
Package index mode ("needs Package index mode"); lock-file `wheel` entries only when their bytes are stored. Nothing is
installed before the page shows the list (installed / skipped with reasons) and the visitor confirms.

## 8. Pyodide version change and removal (questions 8 and 9)

- The worker adds `abiVersion` (`2026_0`) and `platform` (`emscripten_5_0_3`) from `pyodide_js._api.lockfile_info`
  to `ready` (data only). Each entry stores the `pyodideVersion` and `abi` it was installed under. On `ready` the page
  compares: **bundled** entries are re-resolved by name against the new lock (their version may change; shown);
  **pure-Python** `wheel`/`pypi` entries (`py3-none-any`, `py2.py3-none-any`) are marked *stale* and restored only
  after the visitor confirms one dialog listing them; entries with a **`wasm32` tag of another ABI** are marked
  *incompatible* and never installed (a PyPI one can be reinstalled in Package index mode, which picks a matching
  wheel, through W6).
- **Removal** = remove the entry (and, if the visitor agrees, its orphaned dependencies) from the manifest, delete
  unused wheel bytes, then restart the worker (finding 7). The restart keeps the files: every start hydrates
  `/workspace` from the storage worker before `ready` (`python-worker.js:946-950`), checked by `fs-checks.mjs`
  ("Force Stop … survival"). Kept packages come back by the restore rule above. Needs the `restart()` fix (finding 8).

## 9. Error mapping (question 10)

The worker classifies each failure into a `kind` (in `packages.py`, by exception type and text plus the mode) and
sends `kind`, the requirement and the raw text; the page shows the friendly text (EN below; NB in P6) with the raw
text behind a "Details" toggle. micropip gives the **same text** for "no such package" and "offline", and for
"version not found" and "no browser wheel", so `packages.py` asks the index itself first (one `pyfetch` of
`https://pypi.org/simple/<name>/` with the PEP 691 `Accept` header): 404 → `not-found`, network error → `offline`,
otherwise it compares the versions offered with the specifier.

| kind | Raw text (measured) | Friendly EN |
|---|---|---|
| `network-off` | `Can't fetch metadata for 'rich'…` (Off) | "Network access is off, so only bundled packages and wheel files you upload can be installed. To install rich from PyPI, reload with Package index mode." |
| `not-found` | `Can't fetch metadata for 'nopkg'…` + index 404 | "PyPI has no package called nopkg. Check the spelling: the name you install can differ from the name you import." |
| `offline` | same text + fetch error | "PyPI could not be reached. Check your connection and try again." |
| `version-not-found` | `Can't find a pure Python 3 wheel for 'tinypkg3==9.9'` + no version matches | "tinypkg3 has no version matching ==9.9. Available: 1.0.0, …" |
| `no-browser-wheel` | `Can't find a pure Python 3 wheel for 'nativepkg'` | "nativepkg only has wheels for Windows, macOS or Linux (compiled code), which can't run in the browser. Only pure-Python wheels and wheels built for Pyodide work here." |
| `incompatible-wheel` | `Wheel platform … not compatible`, `Wheel was built with Emscripten …`, `Wheel abi …` | "This wheel is built for {platform} and can't run here. Use a py3-none-any wheel or one built for Pyodide 314 (pyemscripten_2026_0_wasm32)." |
| `missing-dependency` | `Can't fetch metadata for 'dep'` while installing a wheel | "{wheel} needs {dep}, which isn't bundled. Upload a wheel for {dep} as well, or install in Package index mode." |
| `hash-mismatch` | `Invalid checksum: expected …, got …` | "The downloaded file doesn't match the hash PyPI published, so it wasn't installed." |
| `host-blocked` | `Can't fetch wheel from 'https://example.com/…'…CORS…` | "{host} can't be reached in this network mode. Package index mode allows only pypi.org and files.pythonhosted.org." |
| `in-script` | (our wrapper, Tier 1 run) | "Packages can't be installed while a script runs here. Add them to a `# /// script` block at the top of the file, use the Packages panel, or run `await micropip.install(…)` in the console." |

## 10. Recommended design and module list for P5

| File | What |
|---|---|
| `lib/python/rt/packages.py` (new) | micropip wrapper hook (Off: `index_urls=[]` and our message; Tier 1 run: `in-script` error), `install(items)` executor (bundled names, PyPI requirements, `emfs:` wheels; returns installed entries from dist-info and `freeze` data, and failures with `kind`), `list_installed()`, error classification with the index pre-check, missed-import finder; added to `RT_FILES` (`python-worker.js:35`) and `lib/python/rt/bundle.ts` |
| `public/python/python-worker.js` | `pkg.install` / `pkg.list` handlers (refused while a run is active), `pypi` restore fetch + hash, import scan for REPL lines, `missingPackages` on `run.end`, `abiVersion`/`platform` on `ready` |
| `lib/python/protocol.ts` | messages below with validators: names ≤ 128 chars `^[A-Za-z0-9._-]+$`, requirement ≤ 512, sha256 `^[0-9a-f]{64}$`, URL host `files.pythonhosted.org`, ≤ 500 items, raw error text ≤ 8 KiB |
| `lib/python/workerClient.ts` | `installPackages()`, `listPackages()`; **fix `restart()`/`forceStop()`** (finding 8) |
| `lib/python/packages.ts` (new) | manifest types, read/validate/write of `python:packages-v1`, caps, `planRestore(manifest, mode, ready)`, staleness by version/ABI, bundled index from `/pyodide/pyodide-lock.json` (page fetch, same origin), wheel file-name tag check, Web Crypto sha256 |
| `lib/python/requirements.ts` (new) | requirements parse/export, lock JSON import/export, skip reasons per mode |
| `lib/python/pep723.ts` (new) | `# /// script` block reader (`dependencies` only; `requires-python` shown, not enforced) |
| `public/python/storage-worker.js`, `lib/python/storageClient.ts` | DB v2, `wheels` store and ops, caps, `onblocked` |
| `scripts/harness/python/packages-checks.mjs` (new, `PYTHON_PARTS=packages`) | §11 |

Protocol additions:

- Main → worker: `{ type: 'pkg.install', id, items: Array<{ kind: 'bundled', name } | { kind: 'pypi', requirement,
  sha256?, url? } | { kind: 'wheel', fileName, sha256, bytes }>, reason: 'user' | 'restore' | 'script-header' }`
  (bytes transferred; `url` + `sha256` only for restore); `{ type: 'pkg.list', id }`.
- Worker → main: `{ type: 'pkg.result', id, installed: PackageInfo[], failed: Array<{ requirement, kind, detail }> }`,
  `{ type: 'pkg.list.result', id, packages: PackageInfo[] }` with `PackageInfo = { name, version, source:
  'bundled' | 'pypi' | 'wheel' | 'code', sha256?, url?, fileName?, depends, imports }` (`code` = installed by user
  code this session); `run.end` gains `missingPackages?: string[]`; `ready` gains `abiVersion`, `platform`;
  `status.phase` gains `'installing'`.

## 11. Harness (question 11)

- **Wheels and PyPI without the internet:** build pure-Python wheels in the harness with `fflate` (`zipSync`;
  `METADATA`, `WHEEL`, `top_level.txt`, `RECORD`), answer `https://pypi.org/simple/<name>/` with PEP 691 JSON
  (`content-type: application/vnd.pypi.simple.v1+json`, `access-control-allow-origin: *`) and the wheel URLs with
  the bytes, abort and count everything else (the spike's helpers are the model; they are `examples-checks.mjs`'s
  `openHarness` with a `fulfill`). Cases: install, keep, not found (404), version not found, no browser wheel (only a
  `manylinux` file listed), wrong hash, other host blocked, dependency chain.
- **WebKit** does not route a dedicated worker's requests. There, give micropip a **same-origin** index: add a
  `/__mock-pypi/` handler to the primary harness server in `servers.mjs` (served only by the harness, never in `out/`)
  and install with `index_urls=["http://localhost:3023/__mock-pypi/{package_name}.json"]` (PyPI JSON API format; the
  wheel `url`s must be **absolute**, micropip refuses relative ones: `TypeError: Cannot download from a non-remote
  location`). This tests micropip and our wrapper; the CSP side of `?net=pkg` stays covered by `security-checks.mjs`.
- **"0 requests in Off":** in Edge and Firefox the routed list must stay empty (measured: empty after every Off
  test). In all three browsers also count attempts inside the worker: register a `securitypolicyviolation` listener
  from Python (`js.self.addEventListener` with `create_proxy`) before the install and assert 0 violations, which
  proves the wrapper did not even try (still to be confirmed in WebKit in P5). Because a CSP-blocked fetch never
  settles in WebKit, every package call in the harness needs its own timeout, and a case that might hang runs last
  or in a fresh worker (the spike lost a WebKit console that way).
- **Edited storage cannot bypass the mode:** user code writes into IndexedDB (`js.indexedDB.open("python-playground")`):
  fake bytes under an existing manifest hash, extra rows, a fake `manifest` object; asserts `hasattr(js,
  "localStorage") is False`; then reload in Off and in `?net=pkg` and check that restore installs only manifest
  entries, refuses the swapped bytes (`hash-mismatch`), and makes 0 (Off) or only the expected (pkg) requests.
- Also: `import numpy` auto-load; the REPL scan; the missed-import report (`df.plot()`); Tier 1 `in-script` error
  in under 50 ms; Tier 2 (`?nosw=1`) script `run_sync(micropip.install(...))` works; removal → restart → package gone,
  workspace file still there; `restart()` while idle gives a working worker.

## 12. Licences and dependencies (question 12)

- No new npm dependency: micropip is already bundled, `fflate` is already a dependency (and the harness's), SHA-256
  is Web Crypto. Nothing to add to `/licenses`.
- Packages a visitor installs come from PyPI or from their own files, straight into their browser; the site never
  serves or redistributes them, so they are not vendored and need no listing. One sentence in the P6 privacy note
  can say they come under their own licences.

## 13. Open questions for the coordinator (and the owner)

1. **Kept PyPI packages in Off mode.** Cache the wheel bytes of kept PyPI packages in the `wheels` store (hash-checked
   against the page-only manifest) so they restore with the network off? Strictly local and verified, and far more
   useful, but security.md §2.7 says Off allows "bundled packages and uploaded wheels only". Owner's choice;
   recommendation: yes, labelled "PyPI (saved copy)".
2. **PyPI installs in Everything mode.** D6 allows online installs only in Package index mode, although Everything
   also reaches PyPI. Recommendation: keep D6 (the panel says "reload with Package index mode").
3. **Manifest in `localStorage` instead of IndexedDB** (§5). Recommendation: yes; it is the only place the worker
   cannot write.
4. **Code-installed packages without W6** in Package index mode (§3.3). Recommendation: yes, session-only.
5. **PEP 723 `# /// script` blocks** as the script-level way to declare packages (§3.1). Recommendation: yes; the
   page reads it, W6 confirms.
6. The `restart()`/`forceStop()` bug (finding 8) affects v1 now; fix it first in P5a or as a separate small fix.
7. WebKit's never-settling blocked fetch (finding 3) also hangs any user `await pyfetch(...)` to a blocked host in
   the console, curable only by Restart. Worth a backlog item (e.g. a timeout around `pyfetch` in `yotasage_rt`,
   or a note in the limits text); not part of P5.

## 14. Proposed split

- **P5a: install engine.** `rt/packages.py` (wrapper, executor, classification, missed-import finder), worker
  `pkg.install`/`pkg.list` + REPL scan + `ready` additions, protocol + validators, `workerClient` methods and the
  restart fix, `packages-checks.mjs` part 1 (auto-load, Off: 0 requests and fast message, canned PyPI install and
  every error kind, `emfs:` wheel install and tag errors, Tier 1 `in-script`, Tier 2 `run_sync`, restart).
- **P5b: persistence.** `lib/python/packages.ts`, `requirements.ts`, `pep723.ts`, storage DB v2 with `wheels`, restore
  orchestration (page-side, framework-free, for P6 to call), version-change handling, exports, `packages-checks.mjs`
  part 2 (manifest/bytes tampering, restore per mode, stale/incompatible, requirements parse table in the unit
  checks).
- P6 (page) as planned: panel, install box, W6, requirements import/export, PEP 723 prompt, privacy note, EN/NB.
