# Python playground: S4 display transport spike

Research for P7 (display engine) and P8 (display page). No product code was changed. Measured on 2026-11-25 on the
owner's Windows laptop (60 Hz screen) in **Edge 158.0.4370.33, Firefox 159.0 and WebKit 27.2** (Playwright 1.65.1,
**headed** in all three, so `requestAnimationFrame` follows the real display; a first headless Edge run gave the same
60 Hz and the same picture).

## 1. Method

- A throwaway page and module worker were copied into `out/python/s4spike/` (from the current `npm run build:export`
  output) and served by `scripts/harness/python/servers.mjs` (`startHarnessServers` on ports 3033/3034, zero custom
  headers), so `/python/coi-sw.js` added the real COOP/COEP to the page and the real **worker CSP** (`default-src 'none';
  script-src 'self' 'wasm-unsafe-eval'; … img-src 'self' blob: data:; worker-src 'none'`) to the worker. Every browser
  reported `crossOriginIsolated === true` in the page and the worker. The folder was removed after every run (try/finally);
  the spike files stay only in the session scratchpad.
- The worker boots Pyodide 314.0.8 from `/pyodide/` exactly as `python-worker.js` does (`loadPyodide`,
  `setInterruptBuffer` on slot 0 of a 64-byte control SAB, NumPy loaded), registers a JS module `s4` with the transport
  helpers, and runs each test with **`pyodide.runPython` (Tier 1, synchronous)**: the worker never returns to its event
  loop while a test runs. Pacing waits use `Atomics.wait`, which does not turn the event loop either.
- Frame content: a 640×480 `uint32` NumPy array (RGBA, 1,228,800 bytes) rewritten every frame with one
  `np.bitwise_or(base, t<<16, out=frame)` (0.11–0.37 ms, "Python compute" below), then handed to a transport.
- Each case runs 3 s; numbers are medians of 3 runs (OffscreenCanvas cases: 1 run with screenshots). "Free" = Python
  produces frames as fast as it can (the worst case: a `while True:` render loop with no wait). "Paced" = Python calls
  `wait_frame()` (section 5) before each frame.
- **Screen fps** = frames the page actually drew per second (counted in its rAF callback). **Worker cost** = time
  inside the JS transport helper per frame. **Page cost** = time in the page's rAF callback per drawn frame.
- **Input latency** = page `pointermove`/`keydown` handler writes the event and `performance.timeOrigin + now()` into a
  SAB ring → Python calls `poll()` (or `wait_event()`), which subtracts the same clock in the worker. Playwright moved
  the mouse every ~15 ms and pressed keys during every case. "Dispatch" = handler time − `event.timeStamp` (the part
  before our code, which we cannot change).
- Stop = the page stores SIGINT in slot 0, calls `Atomics.notify` on every slot the worker can wait on, and re-asserts
  every 10 ms (the S3 rule); latency = Stop pressed → the run's end message reaches the page.

## 2. Pixel transports, 640×480 RGBA, busy synchronous Python loop

Shared framebuffer = Python's array is copied into one of three 1.2 MB slots of a `SharedArrayBuffer` (lock-free
triple buffer, section 7); the page swaps the newest slot in its rAF, copies it out and calls `putImageData`.
"ptr" = the same, but the JS helper reads the array from the wasm heap by address (`frame.ctypes.data`, see 6.2).
ArrayBuffer = a fresh 1.2 MB `Uint8ClampedArray` copy transferred by `postMessage`, drawn with `putImageData`.
ImageBitmap = `putImageData` on a worker `OffscreenCanvas`, `transferToImageBitmap()` (synchronous), transferred by
`postMessage`, shown with a `bitmaprenderer` context. OffscreenCanvas = `transferControlToOffscreen()` of a page
canvas, drawn in the worker with `putImageData`.

### Edge 158

| Transport | Free: worker fps / screen fps | Paced: screen fps | Worker cost / frame (med, p95) | Page cost / frame | Input latency to Python (busy / paced) | Notes |
|---|---|---|---|---|---|---|
| Shared framebuffer | 6,432 / **59.98** | **59.98** | 0.03 ms, 0.04 (paced 0.10) | 0.16 ms | 0.08 / 0.43 ms (max 0.75) | rAF never late (max interval 17.1 ms) |
| Shared framebuffer, ptr | 6,643 / **59.98** | — | 0.03 ms | 0.15 ms | 0.08 ms | Stop is always `KeyboardInterrupt` |
| ArrayBuffer `postMessage` | 4,205 (2,626 sent) / 52.0 | 59.7 | 0.17 ms (paced 0.38) | 0.13 ms | 0.13 / 0.75 ms | free: page rAF dropped to 52 Hz, one 117 ms stall |
| ImageBitmap `postMessage` | 3,077 / 48.3 | 59.7 | 0.11 ms (paced 0.32) | 0.01 ms | 0.13 / 0.64 ms | free: page stalls up to **600 ms**; `createImageBitmap()` never resolved during the run |
| OffscreenCanvas in worker | 4,246 / **0** | **0** | 0.09 ms | — | — | 1 distinct screenshot of 7 during the run; the picture appears only after the run ends |
| Input in `wait_event()` | — | — | — | — | **0.02 ms** (max 0.04) | dispatch 8 ms (pointermove is aligned to rAF) |

### Firefox 159

| Transport | Free: worker fps / screen fps | Paced: screen fps | Worker cost / frame | Page cost / frame | Input latency (busy / paced) | Notes |
|---|---|---|---|---|---|---|
| Shared framebuffer | 6,694 / **59.97** | **60.05** | 0.04 ms (paced 0.10) | 0.88 ms (p95 1.16) | 0.10 / 0.42 ms | rAF steady (16.7 ms) |
| Shared framebuffer, ptr | 7,274 / **59.97** | — | 0.02 ms | 0.74 ms | 0.08 ms | |
| ArrayBuffer `postMessage` | 3,524 (3,073 sent) / 59.97 | 59.7 | 0.18 ms (paced 0.26) | 0.82 ms | 0.08 / 0.56 ms | no stalls |
| ImageBitmap `postMessage` | 1,280 / 59.96 | 59.7 | **0.62 ms** (paced 0.94) | 0.02 ms | 0.42 / 1.22 ms | `createImageBitmap()` never resolved during the run |
| OffscreenCanvas in worker | 5,900 / **0** | **0** | 0.06 ms | — | — | **the whole page froze**: page rAF fell to 7–8 Hz with 3 s gaps and screenshots hung; `commit()` exists but was not called |
| Input in `wait_event()` | — | — | — | — | **0.04 ms** (max 0.18) | dispatch 16.4 ms |

### WebKit 27.2 (Playwright's Windows build)

This build has **no `OffscreenCanvas`** (neither in the worker nor `transferControlToOffscreen`), so the ImageBitmap
and OffscreenCanvas transports cannot run at all here (`createImageBitmap` alone is asynchronous and never resolves in
a busy loop). Its `requestAnimationFrame` is **not tied to the display**: 190–515 Hz while drawing, 62 Hz when idle,
so its fps are not comparable; what matters is that every frame the page asked for was drawn.

| Transport | Free: worker fps / screen fps | Paced: screen fps (= its rAF rate) | Worker cost / frame | Page cost / frame | Input latency (busy / paced) | Notes |
|---|---|---|---|---|---|---|
| Shared framebuffer | 4,044 / 192 (= rAF) | 237 | 0.04 ms (p95 0.20) | 0.54 ms | 0.12 / 1.36 ms (max 13.7) | |
| Shared framebuffer, ptr | 5,563 / 329 (= rAF) | — | 0.04 ms | 0.28 ms | 0.10 ms | |
| ArrayBuffer `postMessage` | 5,435 (2,784 sent) / 429 | 514 | 0.06 ms | 0.20 ms | 0.06 / 0.82 ms | |
| ImageBitmap / OffscreenCanvas | not available | | | | | |
| Input in `wait_event()` | — | — | — | — | **0.02 ms** (max 0.04) | dispatch 0.6 ms |

### What the pixel numbers say

- **All three browsers refuse `new ImageData(<view of a SharedArrayBuffer>)`** (TypeError, in the page and in the
  worker), so the page copies the slot into its own `ImageData` first: copy + `putImageData` costs 0.15 ms (Edge),
  0.3–0.5 ms (WebKit) and 0.75–0.9 ms (Firefox) per frame, well inside a 16.7 ms frame.
- **The worker side of the shared framebuffer is a single memcpy** (0.02–0.04 ms for 1.2 MB): a 60 fps NumPy display
  costs the worker under 1 % of a frame for transport.
- **`postMessage` is delivered while the worker never yields** (every browser, every case: the page received thousands
  of messages per second during the busy runs). But **without backpressure a free-running loop floods the page**:
  Edge's rAF fell to 48–52 Hz with stalls of 117–600 ms although the worker only sent while fewer than 2 frames were
  unacknowledged (the page acknowledges dropped frames too). A SAB counter can stop this, but then it is SAB-only
  anyway, and it still allocates 1.2 MB per frame.
- **OffscreenCanvas from `transferControlToOffscreen()` never presents while Python runs** (Edge and Firefox: 0 frames
  in both the free and the `Atomics.wait`-paced loop; the image appears after the run returns), **and in Firefox it
  froze the page's own rendering** for the whole run. It is ruled out, as `architecture.md` §10 expected.
- **`createImageBitmap()` never resolves during a synchronous run** (Edge, Firefox): only
  `OffscreenCanvas.transferToImageBitmap()` works there, and it costs 0.6–0.9 ms per frame in Firefox and is missing in
  Playwright's WebKit.

## 3. Command batches, 1,000 primitives per frame

Python builds 250 each of `rect`, `line`, `circle` and `text` (a 4-digit label) through a small class whose methods
call `struct.Struct('<B3xffffI').pack_into` on a 64 KiB `bytearray` (24-byte records, text bytes padded to 4;
25,000 bytes per batch). The page decodes with a `DataView` and draws with Canvas 2D (one `fillStyle` change per
colour change, one path per line and circle, `fillText` per text).

| Browser | Python build / batch | (a) `postMessage` transfer: worker cost, free fps sent / screen, paced screen | (b) SAB triple buffer: worker cost, free screen, paced screen | Page draw / batch (med, p95) |
|---|---|---|---|---|
| Edge | 0.45–0.53 ms | 0.02 ms; 2,058 / **59.98**; **59.7** | 0.01 ms; **59.97**; **59.99** | 0.48–0.53 ms (0.62–0.75) |
| Firefox | 0.55–0.69 ms | 0.02 ms; 1,712 / **59.96**; **59.7** | 0.00 ms; **59.96**; **60.0** | 0.64–0.74 ms (1.0–1.3) |
| WebKit | 0.43 ms | 0.02 ms; 1,814 / 322 (= rAF); 342 | 0.00 ms; 333 (= rAF); 341 | 0.60–0.62 ms (0.66–0.72) |

- `postMessage` from the busy loop is delivered (confirmed in all three). Batches are small, so neither path disturbed
  the page's rAF (max interval 17 ms in Edge and Firefox).
- Python building the batch costs ~0.5 µs per primitive, so 1,000 primitives at 60 fps uses ~3–4 % of the worker; the
  limit for "many primitives" will be Python call overhead, not the transport. Page draw time is the recording cost;
  rasterising happens later on the GPU and kept up at 60 Hz.
- `TextDecoder.decode` refuses views of shared memory, so the SAB path copies the batch out of the slot first (25 KB,
  negligible); the page should do that before decoding anyway, so Python cannot change bytes while they are parsed.

## 4. Input latency

- Handler → Python, for the part we own: **0.02–0.04 ms** when Python waits in `wait_event()` (`Atomics.wait` on the
  ring head), **0.06–0.13 ms** in a free-running loop that polls every frame, and **0.4–1.9 ms median** in a loop paced
  by `wait_frame()` (maximum 14 ms in WebKit). Pointer moves arrive just before rAF, so a paced loop usually sees them
  in the same frame; a key press in a paced loop waits for the next frame (at most one frame, 16.7 ms).
- Before our handler runs, the browser adds its own delay (event timestamp → handler): 8 ms median in Edge (pointermove
  is aligned to rAF), 16 ms in Firefox, 0.6 ms in WebKit. The 20 ms target of `architecture.md` §13 is met for the
  part the tool controls; the end-to-end figure depends on the browser's input pipeline.

## 5. Frame pacing, hidden tab and Stop

`wait_frame()` (JS helper, called from Python): returns at once if the page's vsync counter (slot 7, bumped and
notified in every rAF) moved since the last call; otherwise `Atomics.wait` on it in 50 ms chunks (250 ms when hidden),
checking slot 0 for SIGINT after every wake. If the tab is visible but rAF stalls for 100 ms it returns anyway (10 fps
floor). When hidden it either **blocks until visible** ("block") or **returns every 250 ms** ("throttle").

| | Edge | Firefox | WebKit |
|---|---|---|---|
| Paced fps (fb / cmd) | 59.98 / 59.99 | 60.05 / 60.0 | = rAF (237–515, see above) |
| Worker busy fraction while paced, fb / cmd | 0.03 / 0.04 | 0.02 / 0.05 | 0.15–0.17 (at 240–340 fps) |
| Hidden, block: frames / busy fraction while hidden | 0 / ~0 (run total 0.01) | 0 / ~0 (0.01) | 0 / ~0 (0.09) |
| Hidden, throttle: fps / busy fraction while hidden | 3.97 / 0.00 | 3.83 / 0.00 | 3.99 / 0.00 |
| Stop, busy loop, PyProxy argument (n=20) | 0.98 ms, max 3.0; **9/20 `ConversionError`** | 1.06 ms, max 2.5; **11/20** | 0.68 ms, max 12.1; **7/20** |
| Stop, busy loop, pointer argument (n=20) | 1.04 ms, max 2.3; 0/20 | 0.80 ms, max 1.3; 0/20 | 0.98 ms, max 2.3; 0/20 |
| Stop, waiting in `wait_frame` (n=10) | 0.70 ms, max 1.1 | 0.76 ms, max 1.9 | 0.84 ms, max 10.4 |
| Stop, hidden, blocked in `wait_frame` (n=6) | 0.83 ms | 5.14 ms, max 7.1 | 0.60 ms |

- **Hidden tab is simulated.** Playwright keeps every page `visible`: a second tab in front left the page visible, and
  minimising Edge's window through CDP (`Browser.setWindowBounds`) also kept `visibilityState === 'visible'` (it only
  slowed rAF to ~8 Hz, where the 100 ms floor and rAF kept the loop at ~8 fps). So the hidden case was simulated in
  the page exactly as a hidden document behaves: the rAF callback stops doing work (no vsync bumps) and the page stores
  1 in slot 8 and notifies, as its `visibilitychange` handler does. The worker side, which is what spins or not, is
  real. P8 must check a real hidden tab by hand once (switch tabs during a render loop).
- Busy fraction = 1 − (time in `Atomics.wait`) / elapsed, measured in the worker; it is the worker's CPU share. A loop
  that never calls `wait_frame()` stays at 1.0 whatever the tab does, hence the `present()` throttle in section 7.
- Stop: every case is far under the 300 ms target. Waking a waiting worker needs `Atomics.notify` on the slot it waits
  on, so Stop must notify slots 0, 7 (vsync) and 9 (event head), not only slot 0. WebKit did not show S3's 15 ms floor
  here (its rAF ran fast during these runs).

## 6. Findings that change the design

1. **Stop can surface as `pyodide.ffi.ConversionError` instead of `KeyboardInterrupt`** when the interrupt lands while
   Pyodide converts a Python argument (here a NumPy array or `bytearray` becoming a PyProxy) for a JS call: 7–11 of 20
   busy-loop Stops in every browser, with `__cause__` = `KeyboardInterrupt`. A program's `except KeyboardInterrupt:`
   then misses it and the traceback is confusing. Passing only numbers (address and length) removed it (0/60).
2. **Pass addresses, not objects.** `vdisplay` hands the host `arr.ctypes.data` and `arr.nbytes` (for `bytearray`
   batches, a NumPy `uint8` view's address or a `ctypes` buffer), and the host reads `HEAPU8.subarray(ptr, ptr + n)`,
   which was also as fast or faster (free-running worker fps +3 % Edge, +9 % Firefox, +37 % WebKit). `HEAPU8` is reached through `pyodide._module.HEAPU8`, a **private** Pyodide API:
   acceptable because Pyodide is self-hosted and pinned (314.0.8), but it must be feature-checked at boot, re-read on
   every call (it is replaced when wasm memory grows), bounds-checked (`ptr + n <= HEAPU8.length`), and fall back to
   `getBuffer()` with a wrapper that turns a `ConversionError` caused by `KeyboardInterrupt` back into
   `KeyboardInterrupt`. User code in the worker can already read its own heap, so this adds no authority.
3. **`ImageData` never wraps shared memory**: one copy on the page is unavoidable (as `architecture.md` §10 said).
4. **OffscreenCanvas is ruled out** for a busy worker, and Playwright's WebKit lacks it entirely.
5. **Unpaced `postMessage` of frames janks Edge's page**; frames must never be pushed faster than the page draws.

## 7. Recommendation

- **Default (pixels): the shared framebuffer**, a lock-free triple buffer of three 1.2 MB slots in one SAB. The worker
  writes its back slot, then `back = Atomics.exchange(ctrl, FB_MID, back | NEW) & 3`; the page, in rAF, does
  `if (load(FB_MID) & NEW) front = exchange(ctrl, FB_MID, front) & 3`, copies the front slot into its `ImageData` and
  calls `putImageData`. Each side owns one slot; there is no tearing and no lock. 60 fps on screen in Edge and Firefox,
  0.02–0.04 ms worker cost, 0.15–0.9 ms page cost, works in all three browsers, no allocations, no jank.
- **Default (draw commands): the SAB command ring** in the same triple-buffer form (three 64 KiB slots, length in the
  slot header). It is as fast as `postMessage` and keeps one code path; batches that do not fit a slot go by
  `postMessage` with transfer (the measured fallback, 0.02 ms) and the page draws whichever is newest.
- **Fallback: transferred `ArrayBuffer`s by `postMessage`** (pixels and batches), with one frame in flight, counted
  through a SAB acknowledgement counter (or, without SAB, sent only from `wait_frame`-paced loops). It is the only
  other path that works in all three browsers during a busy loop. It matters little in practice: S3 decided the
  display is **Tier 1 only** (no SAB means no events ring, no `wait_frame` and no soft Stop), so the fallback is for a
  slot overflow and for a browser that refuses a shared typed-array copy, not for Tier 2. Transferred `ImageBitmap`s
  are not worth a second path: slower in Firefox, missing in WebKit-on-Windows, and they jank Edge the same way.
- **Input:** an events ring in a SAB (page producer, worker consumer), read by `poll()` and `wait_event(timeout)`;
  `postMessage` cannot reach a busy worker at all.
- **Pacing:** `wait_frame()` on the vsync counter; when hidden, **block** until visible (in 250 ms interruptible
  chunks) by default, and also make `present()` sleep to ~4 fps while hidden so loops that never call `wait_frame()`
  do not spin. Because WebKit-on-Windows runs rAF far above the display rate, `Clock.tick(fps)` (default cap 60) is the
  frame limiter examples use; `wait_frame()` alone means "next page frame".

## 8. `vdisplay` API sketch for P7

```python
import vdisplay as vd
d = vd.Display(640, 480, title="Demo", scale="fit")   # one window in P7; opens the Display panel
px = d.pixels            # NumPy uint8 view, shape (h, w, 4), in wasm memory (no copy until present)
px[..., 0] = 255
d.present()              # pixels: copy into FB back slot + exchange; commands: copy batch + exchange
g = d.canvas             # immediate-mode commands, drawn after the pixels of the same frame
g.clear("#202020"); g.fill_rect(10, 10, 100, 50, "tomato"); g.line(0, 0, 639, 479, "white", width=2)
g.circle(320, 240, 40, "#4060ff"); g.text(20, 200, "Hello", size=24, color="white")
g.polyline(pts), g.polygon(pts), g.arc(...), g.image(x, y, rgba_array), g.save()/g.restore(), g.clip(...)
d.present()
for ev in d.poll():              # non-blocking; Event(type, x, y, button, key, code, text, mods, t)
    ...
ev = d.wait_event(timeout=0.5)   # blocks (Atomics.wait), Stop-interruptible; None on timeout
d.wait_frame()                   # next page frame; blocks while hidden
clock = vd.Clock(); dt = clock.tick(60)   # caps fps, returns seconds since last tick; get_fps()
d.size, d.on_resize, d.close(), d.closed  # close event when the visitor closes the panel
```

Rules: colours are parsed in Python to `u32` RGBA (named colours, `#rgb[a]`, tuples); the page never receives CSS
strings from Python except font family names from a fixed list (D18/§4: no arbitrary CSS); every host call passes only
numbers (`ptr`, `len`, counts).

### Protocol and SAB additions (`lib/python/protocol.ts`)

Control SAB slots 4..15 (reserved by S3):

| Slot | Name | Writer | Use |
|---:|---|---|---|
| 4 | `CTRL_DISPLAY_STATE` | worker | 0 none, 1 open (w, h in the `display.open` message) |
| 5 | `CTRL_FB_SEQ` | worker | frames presented (statistics, screenshot) |
| 6 | `CTRL_FB_MID` | both | triple-buffer middle slot index, bit 2 = new |
| 7 | `CTRL_VSYNC` | page | bumped + notified every rAF while the display is shown |
| 8 | `CTRL_HIDDEN` | page | 1 while the document or the Display panel is hidden |
| 9 | `CTRL_EV_HEAD` | page | events written (notified) |
| 10 | `CTRL_EV_TAIL` | worker | events read |
| 11 | `CTRL_CMD_MID` | both | command triple-buffer middle slot |
| 12 | `CTRL_ACK` | page | frames drawn or dropped (fallback backpressure) |
| 13 | `CTRL_EV_DROPPED` | page | events dropped because the ring was full (pointermove coalesced first) |
| 14–15 | reserved | | resize handshake, RPC |

New SABs, created by the page when a display opens (sent in `display.attach`), sized for the display, at most
4096×4096: `fbSab` = 3 × w × h × 4 bytes; `cmdSab` = 3 × 256 KiB (slot = `u32` length + bytes); `eventsSab` = 256 ×
32 bytes (`i32` type, x, y, button/keyCode, `i32` mods, `i32` reserved, `f64` time). New messages:
`display.open {w, h, title}` (worker → page, validated: sizes clamped, title as text only), `display.attach`
(page → worker, the SABs), `display.batch {buf}` (fallback, transferred, ≤ 4 MiB), `display.close`. Stop notifies
slots 0, 7 and 9. The page validates every batch record (known opcode, finite numbers, lengths inside the batch) and
stops drawing a batch at the first bad record.

## 9. Risks

- `pyodide._module.HEAPU8` is private; a Pyodide upgrade must re-run the display checks (the fallback keeps things
  working, with the `ConversionError` translation).
- Firefox page cost (0.9 ms per 640×480 frame) grows with size: a 1920×1080 framebuffer would be ~6 ms on the main
  thread. P7 should cap the framebuffer (e.g. 1920×1080) and P8 measure a large one.
- The hidden-tab behaviour was simulated (Playwright keeps pages visible); real hiding must be checked by hand.
- WebKit-on-Windows' rAF is not vsync-locked and it lacks OffscreenCanvas; real Safari differs (vsync rAF,
  OffscreenCanvas since 16.4) and is untested here.
- A program can write anything into the framebuffer and the command ring; the page must treat both as untrusted (the
  panel stays framed "Program output", §4 of `security.md`).
- `putImageData` of a hostile size is bounded by the page creating the SABs from clamped sizes.

## 10. Proposed P7 split

One agent at ~150k tokens is unlikely to build the Python module, the host side, the page renderer, the checks in three
browsers and the four examples. Split:

- **P7a, display engine core:** protocol constants and validators, SAB allocation and attach, the worker host
  (`present` with address + length, triple buffers, events ring, `wait_frame`/`wait_event`/`poll`, hidden throttle,
  Stop notifying slots 7 and 9, the `ConversionError` translation), `yotasage_rt` `vdisplay` with `Display`, `pixels`,
  `present`, events and `Clock`, a minimal page renderer on `/python/harness` (framebuffer only), and engine checks
  (fps, Stop in a render loop, hidden busy fraction, input latency) in Edge, Firefox and WebKit.
- **P7b, draw commands and examples:** the command encoder (colours, text, paths, transforms, clip, image), the page's
  validating batch renderer, the `postMessage` fallback for large batches, resize and close events, the four examples
  (bouncing ball, paint, NumPy fractal, 60 fps loop) and their checks.

P8 (the Display panel on the page) stays as planned.
