# Python Playground — Phase 1 Verification Notes (`P1b`)

Verified on branch `python` by running `npm run check` in [scripts/harness/python/](../../scripts/harness/python/check.mjs) against a fresh Next.js static export (`npm run build:export` -> `out/` served on `http://localhost:3023` with zero server-added COOP/COEP/CORP/CSP/Permissions-Policy/Referrer-Policy headers, plus a second-origin probe server on `http://127.0.0.1:3024` supporting HTTP/CORS, RFC 6455 WebSocket, SSE, and cross-origin framing) across **Edge 158.0.4370.33**, **Firefox 159.0**, and **WebKit 27.2**, followed by root `npm run verify`.

## 1. Pass/Fail Summary (`78 passed, 0 failed`)

- **Part A — Pure-Node unit checks (`6 / 6` PASS):**
  - `lib/python/network.ts`: `parseNetworkPolicyFromSearch`, `validateSelectedHost` accept/reject matrix, `parseSelectedHosts` / `buildNetworkPolicyUrl` dedup & 5-host cap.
  - `lib/python/network.ts` vs `public/python/coi-sw.js` VM-executed CSP parity across all 4 modes (`off`, `pkg`, `hosts`, `all`) and invariants (no `'unsafe-eval'`, `'wasm-unsafe-eval'` present, explicit worker `connect-src` in `all` mode, `frame-ancestors 'none'`, `worker-src 'none'`).
  - `lib/python/protocol.ts`: `validateWorkerMessage` accepts every valid `WorkerToMainMessage` shape and drops malformed, unknown, wrong-type, and oversized payloads cleanly without throwing.
  - `lib/python/tiers.ts`: `detectCapabilityTier` across all `(crossOriginIsolated, canRunSync)` combinations (Tiers 1, 2, 3).

- **Part B — 3-Browser static-export verification (`72 / 72` PASS — `24 / 24` per browser):**

| Check | Edge 158.0.4370.33 | Firefox 159.0 | WebKit 27.2 |
| --- | --- | --- | --- |
| Tier 1 boot & CSP confirmed (`Pyodide 314.0.8 / Python 3.14.2`) | Pass | Pass | Pass |
| Corpus 1: `hello` | Pass | Pass | Pass |
| Corpus 2: `input()` 3-turn loop (Norwegian UTF-8 + 82 KiB chunked paste SHA-256 + EOF) | Pass | Pass | Pass |
| Corpus 3: Nested exception traceback hides Pyodide / `yotasage_rt` / `runpy` frames | Pass | Pass | Pass |
| Corpus 4: Infinite loop + Soft Stop (20 trials, median `< 300 ms`) | Pass | Pass | Pass |
| Corpus 5: `time.sleep(30)` + Soft Stop (`< 300 ms`) | Pass | Pass | Pass |
| Corpus 6: NumPy vs JS (`< 1e-12`) + `scipy`, `pandas`, `sympy` offline auto-load | Pass | Pass | Pass |
| Corpus 7: Matplotlib Agg PNG saved to `/workspace/plot.png` (`> 2 KB`, PNG magic) | Pass | Pass | Pass |
| Corpus 8: Pillow RGB PNG & JPEG round trip | Pass | Pass | Pass |
| Corpus 9: CSV round trip (`csv.DictReader`) | Pass | Pass | Pass |
| Corpus 10: `asyncio` (`sleep`, `gather`, `create_task`) + `asyncio.sleep(30)` Soft Stop | Pass | Pass | Pass |
| `SystemExit(0)` & `SystemExit(2)` clean handling | Pass | Pass | Pass |
| REPL: `__main__` sharing, `print()`, multi-line incomplete/complete & completions | Pass | Pass | Pass |
| Force Stop escalation (uninterruptible `np.linalg.svd`) & warm restart (`< 3,000 ms`) | Pass | Pass | Pass |
| Unexpected worker crash -> `crashed` state -> `restart()` recovery | Pass | Pass | Pass |
| Zero uncaught `pageerror`s during corpus run | Pass | Pass | Pass |
| Tier 2 (`serviceWorkers: 'block'`): fail-closed gate + JSPI `input()` with `allowUnconfirmed` | Pass | Pass | Pass |
| Security Off: **0 hits** on `127.0.0.1:3024` across worker JS & Python APIs; same-origin ok | Pass | Pass | Pass |
| Security: forged & malformed worker messages dropped safely (no state/mode spoof, no popup) | Pass | Pass | Pass |
| Security: `Permissions-Policy`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'` | Pass | Pass | Pass |
| Security: URL modes (`?net=pkg`, `?net=hosts&hosts=example.com`, `?net=all`) exact CSP headers & `pkg` blocks `127.0.0.1:3024` | Pass | Pass | Pass |
| Security: offline fail-closed self-test (`setOffline(true)`) confirms CSP (no false W7) | Pass | Pass | Pass |
| Security: Cache Storage poisoning ignored on reload | Pass | Pass | Pass |
| Security: worker SW unregister -> next unprotected load fails closed (Firefox/WebKit; unexposed in Edge) | Pass | Pass | Pass |

## 2. Measured Latencies & Recovery Times

| Metric (Target) | Edge 158.0.4370.33 | Firefox 159.0 | WebKit 27.2 |
| --- | ---: | ---: | ---: |
| Infinite loop Soft Stop — 20-trial **median** (`< 300 ms`) | **0.4 ms** | **0.5 ms** | **1.0 ms** |
| Infinite loop Soft Stop — min / p95 / max | 0.3 / 1.3 / 10.9 ms | 0.4 / 0.6 / 0.6 ms | 0.9 / 1.4 / 1.6 ms |
| `time.sleep(30)` Soft Stop (`< 300 ms`) | 4.2 ms | 2.4 ms | 2.5 ms |
| `asyncio.sleep(30)` Soft Stop (`< 300 ms`) | 5.0 ms | 7.4 ms | 5.3 ms |
| Force Stop escalation -> warm restart (`< 3,000 ms`) | **1,063.8 ms** *(2,564.9 ms incl. 1.5 s grace)* | **1,644.9 ms** *(3,145.8 ms incl. 1.5 s grace)* | **1,209.5 ms** *(2,719.0 ms incl. 1.5 s grace)* |
| Blocked-SW fallback tier detected | Tier 2 (JSPI) | Tier 2 (JSPI) | Tier 2 (JSPI) |

## 3. Engine Bugs Uncovered & Fixed During P1b

1. **`public/python/python-worker.js` — `SharedArrayBuffer is not defined` crash in Tier 2/3:**
   `payload.controlSab instanceof SharedArrayBuffer` threw `ReferenceError` when `crossOriginIsolated === false` (e.g. `serviceWorkers: 'block'`). Fixed by guarding with `typeof SharedArrayBuffer === 'function'` before `instanceof`.
2. **`lib/python/rt/shims.py` (& `public/python/rt/shims.py`) — `asyncio.run()` failed after boot's `runPythonAsync`:**
   Pyodide's boot-time `runPythonAsync` leaves Pyodide's ambient `WebLoop` registered as `asyncio._get_running_loop()`, causing `YotaSyncEventLoop` to raise `RuntimeError: Cannot run the event loop while another loop is running`. Fixed `_shim_asyncio_run` to suspend any non-`YotaSyncEventLoop` ambient running loop during execution and restore it in `finally`.
3. **`lib/python/rt/stdio.py` & `lib/python/rt/shims.py` (& `public/python/rt/`) — wrong JSPI `run_sync` call convention:**
   Both modules invoked `.run_sync()` as a method on a `PyodideFuture` (`AttributeError` in Pyodide 314.0.8) instead of calling `pyodide.ffi.run_sync(...)`. Fixed both call sites; Tier 2 JSPI `input()` now passes in all 3 browsers.
4. **`lib/python/rt/repl.py` (& `public/python/rt/repl.py`) — infinite recursion on `print()` inside REPL:**
   Passing `stdout_callback=_write_stdout` (which called `sys.stdout.write`) to `PyodideConsole` caused `PyodideConsole`'s `redirect_stdout` wrapper to call `_write_stdout` -> `sys.stdout.write` recursively on any `print()` inside the REPL. Fixed by omitting `stdout_callback`/`stderr_callback` so REPL writes go directly to Pyodide's live streaming `setStdout`/`setStderr`.
5. **`lib/python/workerClient.ts` — forged post-boot control message hardening:**
   Hardened `handleMessage` to drop forged `security.status` messages received after boot, reject unexpected/mismatched `ready` and `run.end` messages, and ensure `stop()` always cleans up its state subscription on Force Stop escalation.
6. **`pages/python/harness.tsx` — `?nosw=1` test flag:**
   Added `?nosw=1` to skip auto-re-registering `coi-sw.js` so the harness can deterministically verify fail-closed lockout on the load immediately following worker-side SW unregistration in Firefox and WebKit.
