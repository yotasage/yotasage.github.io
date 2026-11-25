# Python playground: P8 Display page

The Display panel is on `/python/main` (`notes-P7a.md`, `notes-P7b.md` for the engine). This note is only what
P9 and later steps must know.

## What exists

- **Tab:** Console | REPL | Plots | **Display** in the program output header, and Editor | Console | Files | Plots
  | **Display** on phones (`components/Python/OutputTabs.tsx`). The tab is always there (empty state with the
  `vdisplay` starter). A program opening a display shows the tab **once per run or REPL line**
  (`displayShownRef` in `PythonPlayground.tsx`, reset in `handleRun` and `handleReplPush`); `d.resize()` and later
  displays of the same run never take the tab back.
- **Panel** (`DisplayPanel.tsx`): trusted toolbar and resize handle outside the frame; the frame labelled "Program
  output" holds the title (text node) and the canvas. Fullscreen is on the whole panel, so the toolbar (with "Exit
  fullscreen") stays visible. The canvas is always mounted (display: none while empty) because the renderer is made
  for it when the worker client exists.
- **Renderer** (`useDisplay.ts`): one `DisplayRenderer` per `PythonWorkerClient` (the client is React state in the
  playground); it survives worker restarts (the client sends a synthetic `display.close`). The hook does **not** use
  `renderer.bindInput()`: it binds its own listeners so that keys are `preventDefault`ed only when no Ctrl, Meta or
  Alt is held and the key is not F1-F12, Esc and Tab are never sent to the program (Esc blurs the canvas and leaves
  fullscreen), and held keys get a `keyup` when the canvas loses focus. `bindInput()` in the renderer still
  prevents every key; the harness page `/python/harness` uses it.
- **Sizing:** the canvas element is always exactly the picture (`displayCssScale`): Fit = largest that fits the
  stage (`pixel` snaps up-scaling to whole numbers, a numeric `scale` is a zoom capped to the stage), 100% = 1.
  `image-rendering: pixelated` for `pixel`, numeric scales and whole up-scales of 2 or more. Phones: the stage takes
  the canvas height, Fit uses the width and 62% of the viewport height.
- **Hidden:** `setHidden(!visible)` where visible = workbench view, output pane shown and Display tab selected.
- **scale="window":** the stage's content size is offered with `requestResize` 200 ms after it changes (clamped to
  1920x1080, never the same size twice in a row, not while hidden). **Not checked on the page** (the display
  harness drives `requestResize` directly); no example uses it yet.
- **Workspace height:** the handle under the panel (drag, or arrow keys in 40 px steps) sets the desktop workspace
  grid's height (420-2400 px) for this page load; no splitter existed before.
- **Screenshots** go to the Plots gallery as source `display` (`GallerySource` in `usePlots.ts`; badge "vdisplay",
  no SVG/PDF export). The protocol's `PlotSource` is unchanged, so a worker cannot claim to be a screenshot.
- **Harness hook:** `window.__pythonDisplayStats()` returns `renderer.stats()` plus `hidden` (page scripts only).

## Measured (`PYTHON_UI_ONLY=display`, headless Edge / Firefox / WebKit)

| | Edge | Firefox | WebKit |
|---|---|---|---|
| Bouncing ball: frames drawn in 0.5 s | 30 | 29 | 30 |
| Presented per s: Display tab hidden / shown | 4 / 61 | 4 / 61 | 4 / 61 |
| Stop / Close until the run ended | 66 / 67 ms | 77 / 52 ms | 159 / 106 ms |
| Touch drag paints (375x812, `hasTouch`) | CDP touch events | synthetic touch PointerEvents | synthetic touch PointerEvents |
| Fullscreen enter, Esc leaves | yes | yes | yes |

Full UI harness: 62/62 checks per browser (186/186), 14 of them the Display's. Headless WebKit: Monaco logs a
NotAllowedError and a Monaco promise rejects with Canceled when the page enters fullscreen (our
`requestFullscreen()` resolves); the error check ignores exactly those two there and says so. Hidden is the page's own flag (tab switches), not a hidden browser tab; the renderer already handles
`visibilitychange`. Neither a real hidden tab nor a real finger on a phone has been tried by hand: the W2 note says so.

## For P9 and later

- Widgets (P9) need trusted-UI rules like the Display: anything a program builds lives inside a frame labelled
  "Program output"; controls of the page stay outside it.
- A program cannot see Esc or Tab. tkinter/turtle (P10/P11) code that binds `<Escape>` needs another key, or a
  setting to send Esc while keeping a visible way out of the canvas.
- `PythonPlayground.tsx` is 36.7 kB: put new page code in components of its own.
- Fullscreen works headless in all three browsers; on iOS Safari the Fullscreen API is missing for elements other
  than video, so the button is hidden there (`fullscreenEnabled` false).
