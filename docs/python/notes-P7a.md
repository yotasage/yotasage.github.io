# Python playground: P7a display engine core

Built the framebuffer path of the display (`notes-S4.md` §10, P7a). Draw commands, the batch renderer, the
`postMessage` fallback, resize/close events and the examples are P7b; the Display panel is P8.

## What exists

- `import vdisplay as vd` (`lib/python/rt/vdisplay.py`, shipped as `yotasage_rt.vdisplay` with a `/vdisplay.py` alias
  written by the host; a `vdisplay.py` in `/workspace` wins). `Display(w, h, title="Display", scale="fit")`,
  `pixels` (NumPy `uint8 (h, w, 4)`, alpha starts at 255), `present()`, `poll()`, `wait_event(timeout=None)`,
  `wait_frame()`, `size`/`width`/`height`, `close()`/`closed`/`with`, `Event`, `Clock.tick(fps=60)`/`get_fps()`,
  `DisplayError`, `MAX_WIDTH`/`MAX_HEIGHT`, `MOD_*`. `d.canvas` is reserved: it raises `NotImplementedError` until P7b.
- Worker host `public/python/display-host.js` (JS module `yotasage_display`), imported by `python-worker.js` with one
  line. The worker is at the 40 KiB limit (40.65 kB now): put P7b's host code in `display-host.js`, not the worker.
- Page renderer `lib/python/display/renderer.ts` and the protocol `lib/python/displayProtocol.ts`.

## Deviations from notes-S4

- **The worker creates the SABs** and sends them in `display.open`; there is no `display.attach`. A Tier 1 run never
  returns to the worker's event loop, so it could not receive the page's reply. The page still bounds everything:
  `validateDisplayMessage` clamps sizes to 1920x1080 and drops the message unless `fbSab` is exactly
  `3 * w * h * 4` bytes and `eventsSab` exactly 256 x 96 bytes.
- **Event records are 96 bytes**, not 32, to carry `key` (32 bytes UTF-8) and `code` (20 bytes), plus `buttons`,
  wheel `dx`/`dy` (f32) and `repeat`. Layout in `displayProtocol.ts`. `text` is derived in Python (one character,
  keydown, no Ctrl/Meta).
- **`CTRL_FB_MID` carries the display id**: `(id << 3) | FB_NEW | index`. The worker swaps with `Atomics.exchange`,
  the page with `compareExchange` against the id it shows, so a renderer still drawing the previous display can never
  steal a slot of the new one. `CTRL_DISPLAY_STATE` holds the open display's id (0 none); the renderer stops touching
  the slots when it no longer matches.
- `wait_frame()` returns True on a new page frame and False after 100 ms without one (no renderer, rAF stalled); it
  blocks while hidden. `Clock.tick` is the frame limiter (WebKit's rAF ran at 670-800 Hz headless).
- The import scan: `display-host.js` wraps `pyodide.loadPackagesFromImports` so code that mentions `vdisplay` also
  loads NumPy (runs and console lines alike).

## One-window rule

A new `Display` closes the previous one (host posts `display.close` for the old id, then `display.open`); the old
object's `closed` is True and its calls raise `DisplayError`. `close()` keeps the last frame on the canvas
(`info.open` false). A display stays open after the run ends (the last frame stays visible) until a new one opens,
`close()` is called or the worker goes away (`workerClient` emits a synthetic `display.close` with id 0).

## Renderer API (for P8)

`new DisplayRenderer(client, canvas, { onOpen, onClose })`; `info` (id, width, height, title, scale, open);
`setHidden(bool)` (call when the panel is collapsed or off screen; `visibilitychange` is handled already);
`bindInput(target = canvas)` wires pointer/wheel/key events (focus on pointerdown, Tab left alone, wheel and keys
`preventDefault`); `pushPointer('down'|'up'|'move', x, y, {button, buttons, mods})`, `pushWheel`, `pushKey` take CSS
pixels inside the canvas box, so **P8 must size the canvas element to the drawn picture** (letterbox with the
container, not with `object-fit`), or map coordinates itself; `screenshot()` resolves a PNG blob of the shown frame
("screenshot to Plots"); `stats()`/`resetStats()`; `dispose()` clears `CTRL_HIDDEN` and wakes a waiting program.
The title is plain text (controls and bidi marks removed, 200 characters): show it with a text node, inside the
framed "Program output" area. `scale` is `"fit"`, `"pixel"` or 1-8 for P8 to apply in CSS.

## Slots

4 display id (worker), 5 frames presented (worker), 6 framebuffer middle (both), 7 vsync (page; Stop and visibility
changes notify it), 8 hidden (page), 9 events head (page; Stop notifies it), 10 events tail (worker), 13 events
dropped (page). 11 (command middle) and 12 (ack) are defined for P7b; 14-15 stay reserved.

## Measured (headless, `PYTHON_PARTS=display`)

| | Edge | Firefox | WebKit |
|---|---|---|---|
| Paced (`wait_frame`) fps / rAF Hz / worker busy | 60.0 / 59.9 / 0.03 | 60.0 / 60.0 / 0.03 | 794 / 799 / 0.13 |
| Busy `present()` loop: drawn per s, max rAF gap, page ms per 640x480 frame | 59.5, 17.1 ms, 0.20 | 59.5, 18.7 ms, 0.24 | 735, 10.5 ms, 0.28 |
| Stop median / max: busy (20), buffer fallback (10) | 1.1/2.4, 1.0/1.7 ms | 1.2/1.9, 1.3/2.6 ms | 1.4/2.2, 1.2/2.6 ms |
| Stop: hidden `wait_frame` (5), `wait_event` (5) | 1.7/4.7, 1.6/1.8 ms | 1.5/1.6, 1.3/1.5 ms | 1.2/1.7, 1.0/1.1 ms |
| Input median: `wait_event`, paced loop | 0.09, 9.2 ms | 0.10, 7.6 ms | 0.08, 15.1 ms |
| Hidden: `present()` fps, busy; `wait_frame` | 4.5, 0.00; blocks | 4.4, 0.00; blocks | 4.5, 0.00; blocks |

Every Stop gave `KeyboardInterrupt` (0 `ConversionError`, also on the buffer fallback, where the translation in
`vdisplay._host_call` applies). The paced-loop latency is about half a frame because the checks push moves on a
15 ms timer, not on rAF. Hidden is simulated with `setHidden(true)`; P8 must check a real hidden tab by hand.

## For P7b

- Draw commands go through `CTRL_CMD_MID` and a command SAB that `open` should create next to `fbSab` (add it to
  `display.open` and to the validator with an exact size), the page drawing commands after the pixels of the same
  frame. `display.batch` is already validated (ArrayBuffer at most 4 MiB) and ignored by the renderer.
- Event types 7 (resize) and 8 (close) are reserved; the visitor closing the panel should set the display's
  `closed` and wake `wait_frame`/`wait_event` (notify slots 7 and 9).
- Keep every host call numbers-only (ids, addresses, lengths).
