# Python playground: P7b display draw commands and examples

Built the draw-command half of the display (`notes-S4.md` §10, P7b) on top of P7a (`notes-P7a.md`). The Display
panel on the playground page is P8; nothing here is on `/python/main` yet.

## What exists

- **`d.canvas`** (`vdisplay.Canvas`, immediate mode): `clear(color)`, `fill_rect`, `rect`, `line`, `polyline`,
  `polygon` (fill or outline), `circle`, `ellipse`, `arc` (stroke, or `fill=True` for a pie), `text(x, y, s, size,
  color, font, align, baseline)`, `image(x, y, uint8 array, width, height, smooth)`, `save`/`restore`, `translate`,
  `rotate`, `scale`, `clip_rect`, `line_width`, `alpha`. Angles in radians, clockwise on screen; round caps and joins;
  `width=None` uses `line_width()` (1 at the start of each frame).
- **Colours** are parsed in Python only (`vd.color(c)` returns `(r, g, b, a)`): the 148 CSS named colours plus
  `transparent`, `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, and `(r, g, b[, a])` tuples or arrays of numbers **0-255,
  alpha included** (pygame style, so `1` and `1.0` mean the same; `alpha(0..1)` is the opacity call). Strings and
  tuples are cached. Records carry `u32` RGBA; the page never receives a CSS string.
- **Fonts** are a fixed list: `sans` → `"Inter Variable"`, Inter, system-ui, sans-serif; `serif` → Georgia, "Times New
  Roman", serif (no self-hosted serif, so a device font, no request); `mono` → `"JetBrains Mono Variable"`,
  ui-monospace, monospace (`DISPLAY_FONT_FAMILIES` in `commands.ts`, index = font field).
- **Frame semantics:** a frame is its pixels, or black when the program never touched `d.pixels` (the getter or
  setter sets the flag, and then `present()` copies 4·w·h bytes; before that it copies none, so a canvas-only display
  costs only its commands), then the frame's commands. Commands do not carry over to the next frame (frames can be
  skipped by the triple buffer, so carrying over would lose drawing); `paint` therefore redraws its strokes each frame.
- **Encoding:** `struct.pack_into` into a NumPy `uint8` buffer that doubles from 64 KiB up to 4 MiB (`DisplayError`
  beyond), passed to the host by address and length. Python checks every argument first (finite numbers with the cheap
  `(x + y + w + h) * 0` test, radii, sizes, fonts, caps); the page checks every record again (`commands.ts`).
- **Transport (deviation from notes-S4 §8):** no separate `CTRL_CMD_MID`. The command SAB has 3 slots of 256 KiB
  (16-byte header: length, flags `CMD_F_PIXELS` / `CMD_F_EXTERNAL`, frame seq), slot *i* belonging to framebuffer slot
  *i*, so the one swap on `CTRL_FB_MID` publishes pixels and commands of the same frame together. Slot 11 is unused.
  Records over 262,128 bytes go by `display.batch {id, seq, buf}` (transferred, ≤ 4 MiB), posted before the swap,
  with at most one in flight: the renderer adds 1 to `CTRL_ACK` on receipt, the host waits for it (Stop wakes it)
  and drops the frame's commands after 100 ms without an ack (no renderer). The renderer keeps the 2 newest batches;
  a frame whose batch has not arrived waits in `front` until it does or a newer frame replaces it.
- **Resize (decision):** the program owns the size; the panel only scales. `d.resize(w, h)` makes new buffers under a
  new display id (`display.open` again, same events ring; the renderer just reopens, no `onClose`), and `d.pixels` is
  a new array with the overlapping part kept. A display opened with `scale="window"` also gets `resize` events
  (`ev.x, ev.y` = the size offered) when the page calls `renderer.requestResize(w, h)`; the program follows with
  `d.resize(ev.x, ev.y)` or ignores it. `requestResize` returns false for any other scale.
- **Close:** `renderer.requestClose()` writes the id into `CTRL_CLOSE_REQ` (slot 14), wakes every wait and closes the
  renderer (last frame stays). The host sees it at the next call (code -6) and posts `display.close`; Python sets
  `closed`, queues one `close` event (`poll`/`wait_event`), and from then on `present()` does nothing and
  `wait_frame()` returns False after 1/60 s (no spin), so `while not d.closed:` ends loops. A display replaced by a
  new one or closed by the program still raises `DisplayError` as in P7a.
- **Examples:** `lib/python/examples/display.ts` exports `DISPLAY_EXAMPLES` (`bouncing_ball`, `paint`,
  `numpy_fractal`, `fps_loop`, tag `display`, EN/NB strings in `python-examples.ts`). They are **not** in
  `PYTHON_EXAMPLES` (the unit checks assert that).

## Measured (headless, `PYTHON_PARTS=display`, Edge / Firefox / WebKit)

| | Edge | Firefox | WebKit |
|---|---|---|---|
| 1,000 primitives (250 each rect, line, circle, 4-digit text + clear), `Clock.tick(60)`: Python fps / drawn per s | 60.3 / 56.7 | 60.2 / 57.8 | 60.2 / 53.0 |
| Python build per 1,000-primitive frame / page draw per frame | 1.3 ms / 0.41 ms | 1.5 ms / 1.62 ms | 1.5 ms / 0.88 ms |
| `display.batch` path: 30 frames of 307,248 bytes | 30 posted, 30 drawn | 30 / 30 | 30 / 30 |
| Visitor close → loop ended / blocked `wait_event` woke | 15.6 / 0.1 ms | 12.2 / 0.1 ms | 15.8 / 0.2 ms |
| Examples: bouncing ball frames in 2 s; fractal whole run; fps loop printed | 117; 0.9 s; 59.4, 59.7 | 117; 0.9 s; 59.3, 60.1 | 118; 0.9 s; 59.9, 59.2 |
| Stop of the four examples (ball, paint, fractal mid-way, fps loop) | 5.9, 2.0, 4.1, 1.7 ms | 3.8, 5.5, 3.1, 2.4 ms | 4.6, 2.8, 2.2, 4.9 ms |

All 149 colour names match the browser's own parser; 22 malformed batches stop with an error and never throw, the
context state is restored and a good batch draws afterwards. Display part: 111/111 checks across the three browsers.

## For P8

- **Renderer API additions:** `requestClose()` (the panel's close button; returns false when nothing is open),
  `requestResize(w, h)` (call on panel resize only when `info.scale === 'window'`; debounce it, every call is an
  event), `screenshot()` now copies the composed canvas (pixels + commands), `stats()` adds `commandsDrawn`,
  `batchErrors`, `lastBatchError`, `batchesReceived`, `externalDrawn`. `setHidden`, `bindInput`, `dispose` and the
  coordinate rule (size the canvas element to the drawn picture) are as in `notes-P7a.md`. `onOpen` also fires on
  `d.resize()` (new id and size) without an `onClose` first.
- **Fonts:** canvas text uses the document's fonts. The playground page loads Inter and JetBrains Mono through
  `design-system.css`; text drawn before the font has loaded falls back for that frame only.
- **Register the examples** by importing `DISPLAY_EXAMPLES` (or the four names) into `PYTHON_EXAMPLES` after the plots
  examples, then update `requiredIds` and the "not listed yet" assertion in `unit-checks.mjs`, and the example lists in
  `ui-examples-checks.mjs` if it counts cards. `numpy_fractal` ends by itself (its picture stays); the other three run
  until Stop or until the panel is closed.
- `docs/python/modules.md` is 38 kB: split it (for example the harness part into `modules-harness.md`) before P8 adds
  its lines.
- Not done: `scale="window"` resizing is only driven by the harness; a canvas `text_width()` (needs a round trip to the
  page) and `d.on_resize` from the S4 sketch were left out.
