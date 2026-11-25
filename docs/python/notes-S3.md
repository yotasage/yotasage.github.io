# Python Playground: S3 Blocking Input, Stop & Asyncio Spike Notes

Verified empirically on branch `python` (no product code, `package.json`, `package-lock.json`, or `public/` modified) reusing S2's self-hosted `pyodide@314.0.8` (Python 3.14.2, Emscripten 5.0.3) assets from `scratch/pyodide-spike/` with S3 test scripts under `scratch/pyodide-spike/s3/`. All measurements ran against a zero-header static server on `http://localhost:3023` (matching GitHub Pages) across **Edge 158.0.4370.33**, **Firefox 159.0**, and **WebKit 27.2** in both **isolated mode** (S1's `coi-sw.js`, Tier 1) and **non-isolated mode** (`serviceWorkers: 'block'`, Tier 2/3).

---

## 1. Headline Findings & Architectural Decisions

1. **CRITICAL BUG FOUND IN PYODIDE 314.0.8 — Non-atomic lost-signal race in `_Py_CheckEmscriptenSignals_Helper()`.**
   - In `pyodide.asm.mjs`, Pyodide polls the interrupt buffer with:
     ```js
     let result = Module.Py_EmscriptenSignalBuffer[0]; // non-atomic load
     Module.Py_EmscriptenSignalBuffer[0] = 0;          // unconditional store of 0!
     return result;
     ```
   - Under a tight Python loop (`while True: pass`), CPython polls this helper ~2.6M times/sec. A single main-thread `Atomics.store(ctrl, 0, 2)` frequently lands between the load (`0`) and unconditional zero-store, permanently wiping out SIGINT (reproduced in Edge trial 1, WebKit trial 2, Firefox trial 14, and Node trial 0).
   - **Zero-overhead fix (verified 100% reliable):** Main thread `softStop()` writes `2` + `Atomics.notify` immediately AND re-asserts `2` every **10 ms** whenever `Atomics.load(ctrl, 0) === 0` until `run.end` arrives (or Force Stop escalates). Caught a live race on Firefox (`1/20` trials, recovering in `11.72 ms`) with **0% runtime overhead** during normal execution.
2. **CRITICAL P1 CATCH — `input(prompt)` bypasses `setStdout` when `isatty: true`.**
   - When both `setStdin({ isatty: true })` and `setStdout({ isatty: true })` are active, CPython's default `builtin_input()` enters C `PyOS_Readline()`, which writes the prompt to Emscripten's C `FILE* stdout` (never reaching `setStdout({ write })` — observed `""` across all 3 browsers) and calls `read()` with `buf.length === 0`.
   - **Fix:** Ship an 8-line `builtins.input` wrapper in `yotasage_rt` (`sys.stdout.write(str(prompt)); sys.stdout.flush(); sys.stdin.readline()`) and guard `if (buf.length === 0) return 0;` in `setStdin({ read })`. Keeps `isatty() == True` on both streams, flushes prompts to xterm.js *before* blocking, and reads in 8 KiB chunks.
3. **All Soft Stop & Force Stop targets pass comfortably in all 3 browsers:**
   - Busy loop (`while True: pass`, median of 20): **0.72 ms** (Edge), **0.78 ms** (Firefox), **14.99 ms** (WebKit) — target `< 300 ms`.
   - Interruptible `time.sleep(30)` shim (median of 20): **1.70 ms** (Edge), **1.50 ms** (Firefox), **15.21 ms** (WebKit) — target `< 300 ms`.
   - Blocked `input()` interrupted by Stop (median of 20): **0.74 ms** (Edge), **0.75 ms** (Firefox), **15.13 ms** (WebKit) — target `< 100 ms`.
   - Force Stop warm worker restart after uninterruptible NumPy SVD: **1,219 ms** (Edge), **1,810 ms** (Firefox), **2,163 ms** (WebKit) — target `< 3,000 ms`.
4. **`asyncio` decision — Ship the `yotasage_rt` pure-Python interruptible `asyncio` shim in Tier 1.**
   - Pyodide's built-in `WebLoop` fails on `asyncio.run()` under synchronous `runPython` / `runpy.run_path` (`RuntimeError: Cannot stack switch...`) AND **cannot be Soft-Stopped** during `await asyncio.sleep(30)` even under `runPythonAsync` (`WebLoop` waits on JS `setTimeout`, never polling the interrupt buffer).
   - A ~45-line `asyncio.BaseEventLoop` subclass (`YotaSyncEventLoop`) using a minimal `selectors.BaseSelector` backed by our interruptible `time.sleep` shim makes `asyncio.run`, `sleep`, `gather`, `create_task`, `wait_for`, and `Queue` work in Tier 1 without JSPI, and interrupts `await asyncio.sleep(30)` in **1.88 ms / 2.32 ms / 15.32 ms**!
5. **Tier 2 (JSPI) decision — Support for blocking `input()` & `asyncio.run()`, NOT for Display.**
   - Modern Edge 158, Firefox 159, and WebKit 27.2 all ship `WebAssembly.Suspending` / `WebAssembly.promising`, report `pyodide.ffi.can_run_sync() === true` inside `runPythonAsync()`, and passed `run_sync()` blocking `input()` (multi-turn, UTF-8, 104 KiB paste, `runpy.run_path`) with zero crashes.
   - Supporting Tier 2 `input()` costs ~15 lines (run via `runPythonAsync` + `run_sync` prompt bridge), giving SW-blocked/private-browsing users on modern engines working `input()` and `asyncio.run()`.
   - **Do NOT support Display in Tier 2:** without `SharedArrayBuffer`, there is no shared framebuffer, no atomic input ring, and no Soft Stop (Stop requires a 1.1–2.2 s worker restart). Keep Display Tier 1 only.

---

## 2. Exact Pyodide 314.0.8 `setInterruptBuffer` Contract

Verified by inspecting `pyodide.asm.mjs` and testing empirically in Edge, Firefox, and WebKit:

- **Accepted TypedArray types:** Both `Int32Array` and `Uint8Array` backed by a `SharedArrayBuffer` work (`int32CaughtOk: true`, `uint8Works: true` in all 3 browsers).
- **Recommended view:** `new Int32Array(controlSab, 0, 1)` (slot `0` of the 64-byte `control` SAB). Using `Int32Array` allows the main thread to `Atomics.store(ctrl, 0, 2)` + `Atomics.notify(ctrl, 0, 1)` on the exact same 32-bit word that the worker's `time.sleep` shim waits on with `Atomics.wait(ctrl, 0, 0, chunkMs)`, yielding immediate `< 2 ms` wakeups without waiting for a polling interval.
- **Signal value:** `2` (`SIGINT`; Pyodide ignores values outside `1..64`; `2` raises `KeyboardInterrupt` by default).
- **Auto-clear semantics & mandatory worker reset:**
  - `_Py_CheckEmscriptenSignals_Helper()` writes `0` back when polled by CPython (`autoClearedAfterPoll: true`).
  - If Stop arrives while the worker is idle or right after a run finishes, slot `0` remains `2` and immediately aborts the *next* run (`staleFlagTriggersWithoutReset: true` in all 3 browsers).
  - **Rule:** The worker MUST run `Atomics.store(ctrl, CTRL_INTERRUPT, 0)` at the **start** (before `runPython`) AND in `finally` at the **end** of every run (`normalRunClearsStaleFlag: true`).
- **Mandatory main-thread 10 ms re-assert (Pyodide race workaround):**
  ```js
  function softStop() {
    const pulse = () => {
      Atomics.store(ctrl, CTRL_INTERRUPT, 2);
      Atomics.notify(ctrl, CTRL_INTERRUPT, 1);
      Atomics.compareExchange(ctrl, CTRL_STDIN_STATE, STDIN_REQUEST, STDIN_INTERRUPTED);
      Atomics.notify(ctrl, CTRL_STDIN_STATE, 1);
    };
    pulse();
    stopRetryTimer = setInterval(() => {
      if (Atomics.load(ctrl, CTRL_INTERRUPT) === 0) pulse();
    }, 10);
  }
  // Clear stopRetryTimer immediately when run.end arrives or worker.terminate() runs.
  ```
- **`checkInterrupt()` vs `EINTR` inside `setStdin({ read })`:**
  - Inside Python-called JS functions (GIL held, e.g. `time.sleep` shim), call `pyodide.checkInterrupt()`, which calls `__PyErr_CheckSignals() && _pythonexc2js()` and throws Python `KeyboardInterrupt`.
  - Inside `pyodide.setStdin({ read(buf) })`, do **not** call `pyodide.checkInterrupt()` (when GIL is held it throws `PythonError`, which `readWriteHelper` catches and converts to `ErrnoError(29)` / `EIO`). Instead, leave `ctrl[0] === 2` intact and `throw { code: 'EINTR' }`! `readWriteHelper` translates `{ code: 'EINTR' }` into `FS.ErrnoError(27)` (`EINTR`), CPython's PEP 475 `read` loop calls `PyErr_CheckSignals()`, clears `ctrl[0]`, and raises `KeyboardInterrupt` cleanly.

---

## 3. Concrete SharedArrayBuffer Binary Layout & Blocking `input()` (Tier 1)

### SAB Regions (S3 finalized layout for `lib/python/protocol.ts`)

1. **`controlSab` — `64` bytes (`Int32Array`, 16 × 4-byte aligned slots):**

| Int32 index | Byte offset | Constant | Owner / Use |
|---:|---:|---|---|
| `0` | `0` | `CTRL_INTERRUPT` | Main writes `2` (SIGINT) + `Atomics.notify`; aliased as `new Int32Array(controlSab, 0, 1)` for `pyodide.setInterruptBuffer()`. Worker waits here in `time.sleep` and resets to `0` before/after each run. |
| `1` | `4` | `CTRL_STDIN_STATE` | Handshake state: `0=IDLE`, `1=REQUEST`, `2=CHUNK_READY`, `3=CHUNK_FINAL`, `4=EOF`, `5=INTERRUPTED`. |
| `2` | `8` | `CTRL_STDIN_LEN` | UTF-8 byte count written into `stdinSab` for the current chunk (`0..65536`). |
| `3` | `12` | `CTRL_STDIN_SEQ` | Monotonic request sequence number (guards against stale chunk ACKs across runs). |
| `4..15` | `16..63` | *(reserved)* | S4 display (`frameCounter`, `eventsHead`, `eventsTail`) and `rpc` state. |

2. **`stdinSab` — `65,536` bytes (`Uint8Array`, 64 KiB raw UTF-8 chunk buffer):**
   - Arbitrary line sizes (including > 64 KiB pastes) transfer in 64 KiB chunks with zero truncation and zero UTF-8 splitting corruption (chunks are reassembled as raw bytes in the worker *before* CPython's `TextIOWrapper` decodes UTF-8):
     1. Worker sets `CTRL_STDIN_SEQ = seq`, `CTRL_STDIN_LEN = 0`, `CTRL_STDIN_STATE = STDIN_REQUEST`, posts `{ type: 'stdin.request', seq }`, and blocks in `Atomics.wait(ctrl, CTRL_STDIN_STATE, STDIN_REQUEST, 50)` (re-checking `CTRL_INTERRUPT` on wakeup).
     2. Main UTF-8-encodes `line + '\n'`, copies up to `65536` bytes into `stdinSab`, stores `CTRL_STDIN_LEN`, stores `STDIN_CHUNK_FINAL` (last slice) or `STDIN_CHUNK_READY` (more slices), and calls `Atomics.notify(ctrl, CTRL_STDIN_STATE, 1)`.
     3. On `STDIN_CHUNK_READY`, worker copies the bytes into a JS chunk list, resets `CTRL_STDIN_STATE = STDIN_REQUEST`, posts `{ type: 'stdin.chunk_ack', seq }`, and waits for the next slice.
     4. On `STDIN_CHUNK_FINAL`, worker concatenates chunks, sets `CTRL_STDIN_STATE = STDIN_IDLE`, and feeds `setStdin({ read(buf) })` from a worker-side byte queue (`pendingStdin` / `pendingOffset`) so CPython's 8 KiB `BufferedReader` consumes the whole line without extra SAB round-trips.
     5. On `STDIN_EOF` (Ctrl+D), `read()` returns `0` (raising `EOFError` in `input()`). On `STDIN_INTERRUPTED` (or `CTRL_INTERRUPT === 2`), worker resets state to `STDIN_IDLE` and throws `{ code: 'EINTR' }` (raising `KeyboardInterrupt`).

### Mandatory `builtins.input` + streaming `stdout` wiring (P1)

```python
import builtins, sys

def _yotasage_input(prompt=""):
    if prompt:
        sys.stdout.write(str(prompt))
        sys.stdout.flush()
    line = sys.stdin.readline()
    if not line:
        raise EOFError("EOF when reading a line")
    return line.rstrip("\r\n")

builtins.input = _yotasage_input
```

Combined with `pyodide.setStdout({ isatty: true, write(buf) { postStdout(decoder.decode(buf, { stream: true })); return buf.length; } })` and `if (buf.length === 0) return 0;` in `setStdin({ isatty: true, read(buf) })`, prompts appear in xterm.js **before** `stdin.request` blocks while preserving `isatty() == True` for ANSI colors and TTY libraries.

### Verified Blocking `input()` Matrix (Tier 1)

| Test case | Edge 158 | Firefox 159 | WebKit 27.2 | Details |
|---|---|---|---|---|
| Prompt flushed before block (with `builtins.input` shim) | **Pass** | **Pass** | **Pass** | Saw `"Q0: "` before turn 1 & `"Q0: Q1: "` before turn 2; `isatty() == True` on stdin & stdout |
| Default CPython `input()` w/ `isatty=True` (no shim) | **Bypassed `setStdout`** | **Bypassed `setStdout`** | **Bypassed `setStdout`** | Prompt went to C `FILE* stdout` (`""` on `setStdout`), proving the shim is mandatory |
| Multi-turn loop (`for i in range(3)`) | **Pass** | **Pass** | **Pass** | `["Alice", "42", "done"]` exact match |
| Multi-byte UTF-8 (`Blåbærsyltetøy ÆØÅ — 日本語 🚀👨‍👩‍👧‍👦 café`) | **Pass** | **Pass** | **Pass** | 42 chars / 81 UTF-8 bytes exact match |
| Large paste chunking (**104,000 UTF-8 B**, multi-byte chars across 64 KiB boundary, 2 chunks) | **Pass** (`3.75 ms`) | **Pass** (`1.54 ms`) | **Pass** (`2.82 ms`) | 100% SHA-256 bit-exact match, zero truncation/deadlock |
| EOF (`STDIN_EOF` / Ctrl+D) | **Pass** | **Pass** | **Pass** | Clean `EOFError` |
| Stop during blocked `input()` + subsequent `input()` recovery | **Pass** (`0.74 ms`) | **Pass** (`0.75 ms`) | **Pass** (`15.13 ms`) | Clean `KeyboardInterrupt`; next `input()` returned `"after-stop"` |

---

## 4. Stop Latency, Sleep Accuracy, Force Stop & Crash/OOM Benchmarks

### Soft Stop & Sleep Latency Table (Tier 1, milliseconds)

| Benchmark | Target | Edge 158.0.4370.33 (min / **med** / p95 / max) | Firefox 159.0 (min / **med** / p95 / max) | WebKit 27.2 (min / **med** / p95 / max) |
|---|---|---:|---:|---:|
| Busy loop `while True: pass` (n=20) | `< 300 ms` | `0.53` / **`0.72`** / `0.91` / `1.10` *(0 retries)* | `0.64` / **`0.78`** / `1.24` / `11.72` *(1 retry)* | `14.38` / **`14.99`** / `15.72` / `16.14` *(0 retries)* |
| Interruptible `time.sleep(30)` shim (n=20) | `< 300 ms` | `1.45` / **`1.70`** / `1.96` / `2.44` | `1.40` / **`1.50`** / `1.82` / `2.24` | `14.78` / **`15.21`** / `15.78` / `15.86` |
| Blocked `input()` interrupted by Stop (n=20) | `< 100 ms` | `0.56` / **`0.74`** / `1.06` / `1.18` | `0.64` / **`0.75`** / `0.98` / `1.28` | `14.46` / **`15.13`** / `15.78` / `16.00` |
| `yotasage_rt` `await asyncio.sleep(30)` Stop (n=5) | `< 300 ms` | `1.76` / **`1.88`** / `7.05` / `7.05` | `2.08` / **`2.32`** / `5.38` / `5.38` | `14.80` / **`15.32`** / `16.26` / `16.26` |
| Short sleep accuracy `time.sleep(0.05)` (n=5) | `~50 ms` | `50.22` / **`50.71`** / `51.39` / `51.39` | `54.18` / **`60.26`** / `61.80` / `61.80` | `50.16` / **`50.18`** / `51.14` / `51.14` |

*Notes:*
- WebKit's ~15 ms floor on Stop latency on Windows reflects WebKit's `Atomics.wait` / worker IPC scheduling tick (~15.6 ms Windows system timer quantum), still **20× faster** than the 300 ms target.
- `time.sleep(0)` returns immediately and `time.sleep(-0.1)` raises `ValueError` in all 3 browsers.
- **Interruptible `time.sleep` algorithm:** loop `Atomics.wait(ctrl, CTRL_INTERRUPT, 0, Math.min(remainingMs, 50))` until `performance.now() >= deadline`; if `Atomics.wait` returns `'ok'` or `'not-equal'` (or `Atomics.load(ctrl, 0) !== 0`), immediately call `pyodide.checkInterrupt()`.

### Force Stop Escalation & Crash / OOM Recovery

| Scenario | Edge 158 | Firefox 159 | WebKit 27.2 |
|---|---:|---:|---:|
| Uninterruptible NumPy `np.linalg.svd(850×850)` × 5: stopped by Soft Stop within 1,500 ms? | `false` *(expected)* | `false` *(expected)* | `false` *(expected)* |
| **Force Stop warm worker restart** (`worker.terminate()` → fresh worker `ready`, target `< 3,000 ms`) | **`1,219 ms`** *(boot 1,211)* | **`1,810 ms`** *(boot 1,800)* | **`2,163 ms`** *(boot 2,107)* |
| Post-Force-Stop script + blocking `input()` recovery | **Pass** | **Pass** | **Pass** |
| Real WASM OOM (`64 MiB` chunks loop up to 4 GiB) | `MemoryError` at **4,032 MiB** *(worker stayed alive)* | `MemoryError` at **4,032 MiB** *(worker stayed alive)* | `MemoryError` at **4,032 MiB** *(worker stayed alive)* |
| Uncaught fatal worker crash → `worker.onerror` caught + restart | **Pass** (`1,115 ms`) | **Pass** (`1,604 ms`) | **Pass** (`1,086 ms`) |

*P1 implementation notes:*
- `bytearray(3_500_000_000)` raises `OverflowError` on wasm32 (`Py_ssize_t` max `2^31 - 1`), whereas incremental allocations hit the 4 GiB wasm32 linear memory ceiling cleanly with Python `MemoryError`. Still keep full `worker.onerror` crash detection (and call `event.preventDefault()` inside `worker.onerror` so Firefox/WebKit do not propagate an uncaught `pageerror`!).
- **P1 `runpy.run_path` & traceback note:** `runpy.run_path(path, run_name="__main__")` works cleanly; `sys.exit(code)` raises catchable `SystemExit` with `e.code`. Leading internal traceback frames before user code are `['<exec>', '<frozen runpy>', '<frozen runpy>', '<frozen runpy>']` (plus `'/lib/python314.zip/_pyodide/'` when uncaught) — strip these prefixes when rendering tracebacks and Monaco markers.

---

## 5. Tier 1 / Tier 2 / Tier 3 Capability Matrix & JSPI Decision

Measured in **isolated mode** (with `coi-sw.js`) and **non-isolated mode** (`serviceWorkers: 'block'`):

| Capability / Probe | Edge 158 (Iso / Non-iso) | Firefox 159 (Iso / Non-iso) | WebKit 27.2 (Iso / Non-iso) |
|---|---|---|---|
| `crossOriginIsolated` + `SharedArrayBuffer` | `true` / `false` | `true` / `false` | `true` / `false` |
| `WebAssembly.Suspending` & `.promising` | `true` / `true` | `true` / `true` | `true` / `true` |
| `pyodide.ffi.can_run_sync()` in `runPython()` | `false` / `false` | `false` / `false` | `false` / `false` |
| `pyodide.ffi.can_run_sync()` in `runPythonAsync()` | `true` / `true` | `true` / `true` | `true` / `true` |
| Detected Tier (Iso / Non-iso) | **Tier 1 / Tier 2** | **Tier 1 / Tier 2** | **Tier 1 / Tier 2** |
| Tier 2 `run_sync` blocking `input()` (multi-turn, UTF-8, `runpy`, 104 KiB paste) | **Pass** (0 crashes) | **Pass** (0 crashes) | **Pass** (0 crashes) |
| Tier 2 `run_sync` `time.sleep(0.05)` via JS `setTimeout` | **Pass** (`50.7 ms`) | **Pass** (`52.0 ms`) | **Pass** (`51.0 ms`) |
| Tier 2/3 `asyncio.run()` in `runPythonAsync()` (built-in `WebLoop`) | **Pass** | **Pass** | **Pass** |
| Tier 3 `await request_async_input()` helper | **Pass** | **Pass** | **Pass** |
| Non-isolated Force Stop restart (`worker.terminate()` → `ready`) | `1,084 ms` | `1,051 ms` | `1,120 ms` |

*JSPI subtlety caught by S3:*
1. `can_run_sync()` is **always `false`** inside synchronous `pyodide.runPython(...)` even when the engine supports JSPI; it is only `true` inside a promising entry point (`pyodide.runPythonAsync(...)` or `fn.callPromising(...)`).
2. In Pyodide 314.0.8 (with default `convertNullToNone: false`), a JS `Promise` resolving to `null` produces `pyodide.ffi.jsnull`, **not** Python `None` — Tier 2's `input()` EOF check must test `val is None or val is pyodide.ffi.jsnull` (or pass a `{ eof: true }` sentinel object).

### Tier 2 Support Decision (Updates `architecture.md` §3)

| Feature | Tier 1 (`crossOriginIsolated`) | Tier 2 (Non-isolated + `can_run_sync()`) | Tier 3 (Neither) |
|---|---|---|---|
| **Blocking `input()`** | **Yes** (`Atomics.wait` over SAB) | **Yes — SUPPORT** (`runPythonAsync` + `run_sync`, ~15 lines; handles modern SW-blocked / private-browsing Edge, Firefox, Safari) | **No** (`await yotasage.async_input()` helper only) |
| **`time.sleep()`** | **Yes** (interruptible `Atomics.wait`) | **Yes** (`run_sync` over JS `setTimeout`; uninterruptible except Force Stop) | Busy/sync or `await asyncio.sleep()` |
| **`asyncio.run()`** | **Yes** (`yotasage_rt` `YotaSyncEventLoop`, Soft-Stoppable) | **Yes** (Pyodide built-in `WebLoop` under `runPythonAsync`) | Top-level `await` only (`runPythonAsync`) |
| **Stop** | **Soft Stop (`< 20 ms`) → Force Stop (`1.5 s`)** | **Force Stop only** (`worker.terminate()`, ~1.1 s) | **Force Stop only** (`worker.terminate()`, ~1.1 s) |
| **Display (P7–P11)** | **Full** (SAB framebuffer + event ring) | **NO — DO NOT SUPPORT** (no SAB, no atomic events, no Soft Stop; unnecessary dual transport for a fallback tier) | **Off** |

---

## 6. `asyncio` & `threading` Decision

### Built-in Pyodide `WebLoop` vs `yotasage_rt` `YotaSyncEventLoop` (Tier 1)

| Test | Built-in `WebLoop` (`runPython`) | Built-in `WebLoop` (`runPythonAsync`) | **`yotasage_rt` `YotaSyncEventLoop`** (`runPython`) |
|---|---|---|---|
| `asyncio.run(main())` | **FAIL** (`RuntimeError: Cannot stack switch because the Python entrypoint was a synchronous function`) | Pass *(requires JSPI)* | **Pass** (all 3 browsers, zero JSPI dependency) |
| `await asyncio.sleep(0.05)` | N/A | Pass | **Pass** (all 3 browsers) |
| `await asyncio.gather(t1(), t2())` | N/A | Pass | **Pass** (`60.6–63.2 ms` for two 60 ms tasks — truly concurrent) |
| `asyncio.create_task` / `wait_for` / `Queue` | N/A | Pass | **Pass** (all 3 browsers, standard CPython 3.14 semantics) |
| **Soft Stop during `await asyncio.sleep(30)`** | N/A | **FAIL** (`done: false` after 600 ms in all 3 browsers — `setTimeout` never polls interrupt buffer!) | **Pass** (**`1.88 ms`** Edge / **`2.32 ms`** Firefox / **`15.32 ms`** WebKit) |

### Decision: Ship `yotasage_rt` `YotaSyncEventLoop` in Tier 1

Subclassing CPython 3.14's `asyncio.BaseEventLoop` with a minimal `selectors.BaseSelector` whose `select(timeout)` calls our interruptible `time.sleep` shim gives full stdlib `asyncio` semantics (`run`, `Runner`, `TaskGroup`, `sleep`, `gather`, `create_task`, `wait_for`, `Queue`, `Lock`, `Event`, cancellation) in ~45 lines of pure Python, works inside synchronous `runpy.run_path` with zero JSPI dependency, and Soft-Stops sleeping coroutines in milliseconds:

```python
import asyncio, selectors, yotasage_host

class _InterruptibleSelector(selectors.BaseSelector):
    def __init__(self):
        self._map = {}
    def register(self, fileobj, events, data=None):
        raise NotImplementedError("OS file descriptor polling is not supported in browser WASM")
    def unregister(self, fileobj):
        raise KeyError(fileobj)
    def select(self, timeout=None):
        if timeout is None:
            yotasage_host.sleep_interruptible(0.05)
        elif timeout > 0:
            yotasage_host.sleep_interruptible(float(timeout))
        else:
            yotasage_host.check_interrupt()
        return []
    def get_map(self):
        return self._map
    def close(self):
        self._map.clear()

class YotaSyncEventLoop(asyncio.BaseEventLoop):
    def __init__(self):
        super().__init__()
        self._selector = _InterruptibleSelector()
    def _write_to_self(self):
        pass
    def _process_events(self, event_list):
        pass
    def close(self):
        super().close()
        if self._selector is not None:
            self._selector.close()
            self._selector = None

def _shim_run(main, *, debug=None, loop_factory=None):
    factory = loop_factory if loop_factory is not None else YotaSyncEventLoop
    with asyncio.Runner(debug=debug, loop_factory=factory) as runner:
        return runner.run(main)

asyncio.run = _shim_run
```

*(Note: In P2's REPL tab, `PyodideConsole` uses `runPythonAsync` for top-level `await` on `WebLoop`, while script runs via `runpy.run_path` in Tier 1 use `YotaSyncEventLoop`. If a user explicitly awaits JS promises like `pyodide.http.pyfetch` inside `asyncio.run`, document that `pyfetch` requires top-level `await` / `WebLoop` or synchronous `urllib` / JS fetch helper.)*

### `threading` Behavior (For P2 / P12 Limitations Text)

Identical across **Edge 158**, **Firefox 159**, and **WebKit 27.2**:
- `import threading` — **succeeds** (locks/events/RLock objects construct cleanly as single-threaded no-ops).
- `threading.Thread(target=lambda: None).start()` — raises:
  ```text
  RuntimeError: can't start new thread
  ```
- P2 / P12 UI limitations note should explain plainly: *"Python threads (`threading.Thread.start()`) and subprocesses (`subprocess`, `os.system`) are not available in browser WebAssembly (`RuntimeError: can't start new thread`). Use `asyncio` for concurrent tasks."*

---

## 7. Handoff Checklist for P1 & S4

- **P1 (`lib/python/protocol.ts` & `public/python/python-worker.js`):**
  - Adopt the `controlSab` (64 B `Int32Array`, slots `0..3`) + `stdinSab` (64 KiB `Uint8Array`, chunked) layout from §3.
  - Include the **10 ms main-thread interrupt re-assert timer** in `softStop()` until `run.end` (mitigates Pyodide 314.0.8's `_Py_CheckEmscriptenSignals_Helper` lost-signal race).
  - Clear `CTRL_INTERRUPT = 0` and reset `CTRL_STDIN_STATE = 0` at both the start and `finally` of every run.
  - Install `yotasage_rt` shims at worker boot: `time.sleep` (chunked `Atomics.wait` on `CTRL_INTERRUPT`), `builtins.input` (flush prompt to `sys.stdout` before `sys.stdin.readline()`), and `YotaSyncEventLoop` (`asyncio.run` in Tier 1).
  - Throw `{ code: 'EINTR' }` (not `checkInterrupt()`) inside `setStdin({ read })` on interrupt, and guard `if (buf.length === 0) return 0;`.
  - Support Tier 2 (`!crossOriginIsolated && can_run_sync()`) for blocking `input()` (checking `pyodide.ffi.jsnull` for EOF) and `asyncio.run()` via `runPythonAsync`; keep Display Tier 1 only.
  - Call `event.preventDefault()` in `worker.onerror` when transitioning to the crash/OOM recovery state.
- **S4 (Display transport):** `controlSab` slots `4..15` (bytes `16..63`) are reserved for S4's frame counter, event ring head/tail, and RPC mailbox state.
