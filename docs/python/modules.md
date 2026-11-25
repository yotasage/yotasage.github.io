# Python Playground — Module Map

One-line map of the Python runtime, isolation/security layer, licence notices, and harness entry added in Phase 1a.

## Asset Pipeline & Licences
- [scripts/copy-pyodide-assets.mjs](../../scripts/copy-pyodide-assets.mjs): Copies Pyodide core files to `public/pyodide/`, downloads + SHA-256-verifies the curated 7-root wheel closure (`micropip`, `numpy`, `matplotlib`, `pillow`, `scipy`, `pandas`, `sympy`), writes trimmed `pyodide-lock.json`, and syncs `lib/python/rt/*.py` into `public/python/rt/`.
- [lib/python/licenses/](../../lib/python/licenses/): Checked-in upstream licence texts (`LICENSE.pyodide-mpl2.txt`, `LICENSE.freetype-ftl.txt`, `LICENSE.humor-sans-ofl.txt`, `LICENSE.matplotlib-notices.txt`, `LICENSE.pillow-native.txt`, `LICENSE.wasm-core-libs.txt`, `LICENSE.scientific-bsd.txt`) collected into `python[]` by [scripts/collect-licenses.mjs](../../scripts/collect-licenses.mjs) and rendered on `/licenses`.

## Service Worker & In-Scope Worker
- [public/python/coi-sw.js](../../public/python/coi-sw.js): `/python/`-scoped service worker adding COOP/COEP/CORP, `Permissions-Policy`, `Referrer-Policy: no-referrer`, and per-mode page/worker CSP headers (downgrading nested workers to Off; never reading Cache Storage).
- [public/python/python-worker.js](../../public/python/python-worker.js): In-scope ES module worker that strips WebRTC globals, runs S1's `https://csp-probe.invalid/` fail-closed CSP probe, boots self-hosted Pyodide, bridges SAB/JSPI stdio + SIGINT, installs `yotasage_rt`, and runs scripts/REPL requests.

## TypeScript Engine Client (`lib/python/`)
- [lib/python/origin.ts](../../lib/python/origin.ts): Single origin/URL registry (`getPythonRuntimeOrigin`, `getPythonServiceWorkerUrl`, `getPythonWorkerUrl`, `getPyodideIndexUrl`, `getPyodideLockFileUrl`, `getPythonRuntimeBaseUrl`) keeping Option B origin migration isolated.
- [lib/python/network.ts](../../lib/python/network.ts): `NetworkMode` / `NetworkPolicy`, strict `validateSelectedHost`, URL query parser/builder, and `buildPageCsp` / `buildWorkerCsp` kept in exact sync with `public/python/coi-sw.js`.
- [lib/python/protocol.ts](../../lib/python/protocol.ts): `MainToWorkerMessage` / `WorkerToMainMessage` types, S3 SAB layout constants (`CONTROL_SAB_BYTES`, `STDIN_SAB_BYTES`, slot indices, `SIGINT`), and strict `validateWorkerMessage` payload/size validator.
- [lib/python/tiers.ts](../../lib/python/tiers.ts): `registerPythonServiceWorker` (with blocked-SW `undefined` and reload-once `sessionStorage` guards) and `detectCapabilityTier` / `detectBrowserCapabilities` (Tiers 1–3).
- [lib/python/workerClient.ts](../../lib/python/workerClient.ts): `PythonWorkerClient` managing worker boot, fail-closed W7 execution gate, 64 KiB chunked SAB/JSPI `sendStdin` / `sendStdinEof`, 10 ms SIGINT re-assert + 1.5 s Force Stop escalation, REPL push/complete, and crash/OOM recovery.

## Python Runtime Package (`lib/python/rt/`)
- [lib/python/rt/bundle.ts](../../lib/python/rt/bundle.ts): Manifest (`YOTASAGE_RT_MODULES`, `getYotasageRtModuleUrls`) of the runtime `.py` modules synced to `/python/rt/`.
- [lib/python/rt/__init__.py](../../lib/python/rt/__init__.py): Entry point (`install_runtime`) wiring stdio, shims, workspace, and REPL console.
- [lib/python/rt/stdio.py](../../lib/python/rt/stdio.py): Tier 1 prompt-flushing `builtins.input` wrapper, Tier 2 JSPI `_JspiStdin` (`run_sync` + `jsnull` EOF), and Tier 3 `async_input`.
- [lib/python/rt/shims.py](../../lib/python/rt/shims.py): Interruptible `time.sleep`, Tier 1 `YotaSyncEventLoop` (`asyncio.run`), network-gated `webbrowser.open` (`link.request`), and clear-error `os.system` / `subprocess` stubs.
- [lib/python/rt/runner.py](../../lib/python/rt/runner.py): `/workspace` file sync, user module purging, `runpy.run_path` execution, `SystemExit` handling, internal-frame traceback filtering, and `__main__` namespace capture for the REPL.
- [lib/python/rt/repl.py](../../lib/python/rt/repl.py): `PyodideConsole` wrapper (`repl_push`, `repl_complete`) sharing the last run's `__main__` namespace.

## Bare Verification Page
- [pages/python/harness.tsx](../../pages/python/harness.tsx): Bare `noIndex` page under `/python/harness` registering `coi-sw.js` (with `?noreload=1` / `?nosw=1` test flags) and exposing `window.__pythonHarness` for P1b's cross-browser Playwright verification suite.

## Engine & Security Harness (`scripts/harness/python/`)
- [scripts/harness/python/check.mjs](../../scripts/harness/python/check.mjs): Entry script (`npm run check`) running Part A pure-Node unit checks, building `out/` via `scripts/build-export.mjs`, and executing Part B across Edge (`msedge`), Firefox, and WebKit.
- [scripts/harness/python/unit-checks.mjs](../../scripts/harness/python/unit-checks.mjs): Pure-Node unit checks for `lib/python/{network,protocol,tiers}.ts` and VM-verified CSP parity against `public/python/coi-sw.js`.
- [scripts/harness/python/servers.mjs](../../scripts/harness/python/servers.mjs): Zero-security-header static export server (`http://localhost:3023`) and second-origin HTTP/CORS/WebSocket/SSE/framing probe server (`http://127.0.0.1:3024`).
- [scripts/harness/python/corpus-checks.mjs](../../scripts/harness/python/corpus-checks.mjs): 3-browser verification of all 10 corpus items, Q4 scientific imports (`scipy`, `pandas`, `sympy`), REPL, `SystemExit`, 20-trial Soft Stop latency, Force Stop warm restart, crash recovery, and Tier 2 JSPI fail-closed + `input()`.
- [scripts/harness/python/security-checks.mjs](../../scripts/harness/python/security-checks.mjs): 3-browser `security.md` §8 verification (Off-mode zero-hit exfiltration battery, forged/malformed worker messages, headers & `frame-ancestors`, URL modes `?net=pkg|hosts|all`, offline fail-closed self-test, Cache Storage poisoning, and worker SW unregister).
