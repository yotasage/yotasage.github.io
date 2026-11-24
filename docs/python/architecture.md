# Python playground: architecture

Everything here is a design to be checked by the spikes (S1 to S6), not a record of working code. Items marked **SPIKE** have a default and a step that decides them.

## 1. Overview

```
MAIN THREAD                                          WORKER (module worker)
+----------------------------------------------+     +-------------------------------------+
| components/Python/: panes, Monaco, xterm,    |     | Pyodide (CPython 3.14 WASM)         |
| file tree, viewers, Plots gallery, Display   |<--->| virtual file system (IDBFS)         |
| panel (canvas + widget DOM), package panel   | msg | yotasage_rt (Python package):       |
|                                              |  +  |  stdio, run/stop, repl, packages,   |
| lib/python/: protocol, worker client,        | SAB |  display client, matplotlib backend,|
| framework-free logic                         |     |  tkinter and turtle shims           |
| public/python/coi-sw.js (service worker)     |     | host bridge (blocking calls)        |
+----------------------------------------------+     +-------------------------------------+
```

Follow the existing `<name>.worker.ts` plus `<name>Client.ts` pattern (`lib/pdf/worker.ts`, `workerClient.ts`; the QR reader falls back to the page when no worker can be made). S0 reads how those create their workers and how Ghostscript's worker loads wasm from `public/`.

## 2. Hosting and isolation

**Files in `public/`** (git-ignored, written by `scripts/copy-pyodide-assets.mjs` and `copy-monaco-assets.mjs` on `postinstall`, like the other copy scripts):

- `public/pyodide/`: the core from the `pyodide` npm package (wasm, standard library zip, loader) and a curated set of package files, downloaded by hash from Pyodide's release host and listed in a trimmed `pyodide-lock.json` (Q3). The script is idempotent and does nothing when the files are present.
- `public/monaco/`: Monaco's `min/vs` tree.
- `public/python/`: the service worker (tracked, not generated) and the Python sources of `yotasage_rt` (packed or copied by the script; S0 decides how they reach the worker).

**Service worker** (`public/python/coi-sw.js`, scope `/python/`):

- Adds `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` to every in-scope response. That **includes the worker script's response**, not only page navigations.
- Adds the **network policy** (a `Content-Security-Policy` with `connect-src` set by the mode in the URL: off by default) to the page and to the worker script's response. [security.md](security.md) section 2 has the modes, the headers, the fail-closed self-test and the rule that nested workers always get the strict policy.
- **No runtime code in Cache Storage.** Worker code can write to it, so anything kept there could be replaced and then run with trust. The runtime comes from the HTTP cache, or from a precache checked against a build-time SHA-256 list on every use (S1 decides; if neither is cheap, the tool works online-only after the first visit). The service worker serves only URLs on a build-time allow-list. See security.md section 3.
- The first visit installs the worker and reloads once. Guard against reload loops (at most one automatic reload per session).

**Entering the page must be a full page load.** A client-side Next.js navigation from the home page keeps the home document, which is not isolated. The home card for this tool must therefore be a plain `<a href>` (or the page must hard-reload itself when `crossOriginIsolated` is false and a service worker controls the scope). SPIKE S1 confirms.

**Local testing.** Service workers and SharedArrayBuffer need a secure context: `http://localhost:3020` works, but the dev server opened from a phone by LAN address does not. A phone test needs HTTPS (a tunnel) or the deployed site. On the LAN address the tool runs in tier 3 (below); say so on the page.

**Deployment** is the existing GitHub Actions workflow; nothing changes there. Confirm after the first deploy that isolation works on `github.io` itself (S1 can only test locally).

## 3. Capability tiers

Detected at startup. A degraded tier shows a plain note on the page.

| Tier | Condition | Blocking `input()` | Stop | Display |
|---|---|---|---|---|
| 1 | `crossOriginIsolated` | Yes (`Atomics.wait` in the worker) | Interrupt, then force | Full |
| 2 | Not isolated, JSPI works (`pyodide.ffi.can_run_sync()`) | Yes (`run_sync`) | Force (restart worker) | S3 decides whether it is worth supporting |
| 3 | Neither | No (async helper only) | Force | Off; terminal, files, plots, packages still work |

Tier 3 also happens where service workers are unavailable (some private-browsing modes). Do not rely on JSPI as the main path: Chromium supports it (137 and later); Firefox and Safari were reported as unreliable, and a Safari report says `run_sync` crashes the interpreter.

## 4. Worker protocol

One shared types file in `lib/python/protocol.ts`, used by both sides. Every request has an `id`; responses are typed; unknown messages are logged, never fatal.

- Main to worker: `init`, `run`, `stop {mode}`, `repl.push`, `repl.complete`, `fs.*`, `pkg.*`, `display.*`.
- Worker to main: `ready`, `status {phase, progress}`, `stdout`, `stderr`, `run.start`, `run.end {status, traceback}`, `fs.changed`, `plot.new`, `pkg.progress`, `display.submit`, `widget.ops`.

**SharedArrayBuffer regions** (proposal, tier 1; S3 and S4 settle the details):

| Region | Use |
|---|---|
| `control` (Int32Array) | interrupt flag (Pyodide's interrupt buffer; value 2 means SIGINT; check the exact type in the docs), stdin state, frame counter, RPC state |
| `stdin` | length-prefixed bytes with chunking (or an explicit max-size error in `protocol.ts`) so large pastes do not truncate or deadlock. Main writes then `Atomics.notify`. The worker's stdin callback waits with short timeouts so it also sees the interrupt flag |
| `events` | ring of fixed-size int32 records (type, x, y, button or key code, modifiers, time) with atomic head and tail |
| `rpc` | mailbox for blocking host calls: request id, length, payload, response; uses chunking or an explicit max-size error in `protocol.ts` |
| `framebuffer` | header (frame counter, width, height, stride) plus double-buffered RGBA bytes |

**Blocking host calls.** Python sometimes needs an answer from the page (font metrics, clipboard, a file dialog). `host.call(name, args)` posts a request and blocks on the `rpc` mailbox (tier 1) or awaits through `run_sync` (tier 2). Every blocking wait polls the interrupt flag at least every 100 ms.

## 5. Run and Stop

- **Run:** save dirty files, sync files in, load known packages for the imports found with `ast`, then `runpy.run_path(file, run_name="__main__")`. Handle `SystemExit`. Remove Pyodide-internal frames from tracebacks; turn `File "...", line N` into jump links and Monaco markers.
- **Fresh namespace:** purge project modules from `sys.modules` between runs; keep third-party imports cached.
- **Stop escalation:** (1) write the interrupt flag so a `KeyboardInterrupt` is raised at the next bytecode; (2) wake any blocking wait with an "interrupted" result; (3) after about 1.5 s with no end, **Force stop**: terminate the worker and start a new one (files survive, D5). Native code (a long NumPy call) can't be interrupted, which is why step 3 exists. Ctrl+C in the terminal with nothing selected means Stop.
- **Crash / OOM recovery:** 32-bit WASM linear memory limits and browser OOM killers usually terminate the worker abruptly (or throw `WebAssembly.RuntimeError`) without a reliable pre-warning. Handle unexpected worker termination (`onerror` / crash detection) with a clear "Worker crashed / out of memory" state and a one-click restart while keeping persisted files.
- **Shims:** `time.sleep` (in chunks, interruptible), `input` (through the terminal), `PIL.Image.show` (to the viewer), `webbrowser.open` (disabled while the network is off; otherwise only after a confirmation that shows the full URL), `os.system` and `subprocess` (clear "not supported" error).
- **asyncio (SPIKE S3):** Pyodide's browser event loop may not support `asyncio.run` without JSPI. If so, ship a shim so ordinary asyncio scripts (`run`, `sleep`, `gather`, `create_task`) work in tier 1.
- Python threads and processes do not work in Pyodide; explain that in the page's limitations text.

## 6. Terminal and editor

- **xterm.js** (`@xterm/xterm`, fit and web-links add-ons), loaded with `await import`. **Console tab:** program output and `input()`, with ANSI colours and `\r` progress bars, local echo while an input is pending, Clear and Copy. **REPL tab:** `pyodide.console` (`PyodideConsole`) with multi-line input, history and tab completion; disabled while a script runs. Links printed by a program open only after a confirmation that shows the full URL.
- **Monaco:** Python highlighting is built in. Worker URLs come from `public/monaco/` (same origin, required under COEP). Multi-file tabs, autosave to the virtual file system, Ctrl/Cmd+Enter runs, theme follows the site (light, dark). Diagnostics from a debounced `ast.parse` in the worker become markers. No language server in v1.
- **Phone width:** panes become tabs (Editor, Console, Files, Plots, Display). The status note on the page says Monaco's touch support is limited.

## 7. Files and persistence

- Root is Pyodide's home directory; the project lives there. The data model carries a **workspace id** from day one (one "default" workspace first).
- **Default: IDBFS** mounted in the worker, with explicit `syncfs` after runs and file operations and a restore on boot. Note that explicit post-run `syncfs` cannot flush files written *during* a run that ends in Force stop; **SPIKE S5** compares IDBFS with an OPFS mount (`createSyncAccessHandle`) and a main-thread store by robustness in Edge, Firefox and WebKit (reload, Force stop, files written during a force-stopped run, two tabs, quota).
- Web Locks let only one runtime own a workspace; a second tab gets a notice. Show storage use from `navigator.storage.estimate()` and handle quota errors in words.
- File tree: create, rename, delete, move; drag-drop upload of files and folders; download a file; zip import and export with fflate; run-created files are marked.
- Example programs live in `public/python/examples/` or `lib/python/examples/` (S0 decides) and are copied into the workspace on request.

## 8. Plots and viewers

- **Plots gallery:** a custom matplotlib backend (a `FigureCanvasAgg` subclass), set with `MPLBACKEND` **before matplotlib is first imported**. `plt.show()` renders open figures to PNG and sends them to the gallery. `savefig` to any path also appears in the tree. Cap live figures retained in Python memory (e.g. the last 10–20) so older figures are closed automatically to bound WASM RAM while keeping their rendered PNGs in the gallery; SVG/PDF re-rendering stays available for live figures. History, zoom, pan, copy, download.
- **Image viewer:** PNG, JPEG, GIF, WebP, SVG as Blob URLs (revoked when done), checkerboard background, fit and zoom.
- **PDF viewer:** `lib/pdf/pdfjs.ts` and `public/pdfjs/`. A "send to PDF tools" action can use `lib/pdf/handoff.ts`, which chains outputs between tools in memory. S0 checks the handoff API.
- **Text, CSV, JSON:** read-only Monaco or a simple table. **SVG:** through `<img>` only. **HTML output:** an iframe with `sandbox=""` (no scripts); an "allow scripts" switch adds `allow-scripts` and a meta CSP that blocks all connections; never `allow-same-origin`. **PDF:** pdf.js with scripting and eval off. The full list of rules is in security.md section 4.

## 9. Packages

Three tiers:

| Tier | What | Loaded |
|---|---|---|
| Core | Pyodide, `micropip`, `yotasage_rt` | At boot |
| Bundled | the curated set in `public/pyodide/` (Q4) | On first import (`loadPackagesFromImports`), with progress shown |
| User-added | Pyodide-built packages not bundled (only if hosted), PyPI packages (**only in the Package index network mode**, [security.md](security.md) 2.1), uploaded `.whl` files | micropip or `loadPackage` |

**Manifest** in IndexedDB (keys namespaced `python:`):

```json
{ "pyodideVersion": "314.x.y",
  "entries": [ { "name": "rich", "spec": "rich==14.0", "source": "pypi",
                 "version": "14.0.0", "persist": true, "addedAt": "ISO-8601",
                 "wheelRef": null } ] }
```

- Uploaded wheel bytes go in a separate IndexedDB store keyed by file name and hash.
- A typed `pip install` is session-only by default; each entry has a "keep across sessions" switch. Kept entries are restored **lazily** (when a run first needs them), listed in the panel, and never installed over a network the current mode forbids. A manifest rewritten by user code therefore cannot install anything the mode does not allow. Hashes are checked against the lock file; uploaded wheels are hashed when stored and when used.
- `micropip.freeze()` exports a lock file; loading it with `lockFileContents` restores packages through the faster `loadPackage` path. Import and export `requirements.txt` and lock files.
- If the manifest's Pyodide version differs from the running one, re-resolve and tell the visitor (the wheel platform tag differs between Pyodide lines).
- **Remove** updates the manifest and restarts the worker (imported modules stay loaded otherwise).
- Errors say plainly that only pure-Python and Pyodide-built wheels work, name the package, and explain how to continue. Auto-load only knows the bundled and Pyodide packages; PyPI packages must be declared (import names often differ from package names).
- **UI:** a list with Name, Version, Source (bundled, Pyodide, PyPI, URL, uploaded), Keep, Remove; an install box taking `pkg`, `pkg==x.y`, URLs, several lines; Import, Export, Reset. While the network is off, the install box says so and offers wheel upload; in Package index mode it shows name, version and host in a dialog before installing (security.md W6).

## 10. Display layer

**Principles.** Python runs in the worker and **rendering happens on the main thread**, so a busy Python loop can't stall presentation. Two surfaces share one `vdisplay` API (working name) and one event model.

**Surface A: canvas, immediate mode.**

- Command batches: Python builds a compact list (clear, rect, line, polyline, polygon, arc, text, image, transform, clip, gradient) and calls `present()`. The batch goes to the page as a transferred ArrayBuffer and runs on a Canvas2D context.
- Framebuffer: `blit(rgba)` for NumPy, PIL or bytes. Default transport: the shared double buffer, read by the page's `requestAnimationFrame` loop (`ImageData` cannot wrap shared memory, so one copy on the page). Fallback for non-isolated tiers: transferred `ImageBitmap`s. **SPIKE S4** decides. OffscreenCanvas inside the worker is *not* the default: it presents frames only when the worker returns to its event loop, which a synchronous Python loop never does (S4 confirms).
- Frame pacing: `wait_frame()` blocks until the next refresh; a `Clock` helper; throttle when the tab is hidden. HiDPI, scale-to-fit, screenshot to the Plots gallery.

**Surface B: widgets, retained mode (DOM).** Python holds the widget tree and sends operations (create, configure, destroy, layout) to a DOM renderer on the page. Text input, IME, selection and accessibility come for free. Virtual windows inside the Display panel have a title bar, drag, resize and close (which sends a close event). One window first, several later.

**Events.** Mouse (move, down, up, wheel, enter, leave), keyboard (key, code, text, modifiers, repeat), focus, resize, close. Delivered through the `events` ring. `poll()` is non-blocking; `wait_event(timeout)` blocks and is interruptible.

```python
import vdisplay as vd
win = vd.open(640, 480, title="Demo")
g = win.canvas
g.clear("#202020"); g.fill_rect(10, 10, 100, 50, "tomato")
g.text(20, 200, "Hello", size=24, color="white")
win.present()
while True:
    ev = win.wait_event(timeout=1/60)
    if ev and ev.type == "close": break
```

## 11. tkinter subset and turtle

- Pyodide has no `tkinter`, so a package named `tkinter` on `sys.path` cannot clash. First scope: `Tk`, `Toplevel`, `Frame`, `Label`, `Button`, `Entry`, `Text` (basic), `Canvas` (item API: create, move, coords, delete, tags, bind), `Checkbutton`, `Radiobutton`, `Scale`, `Listbox`, `Scrollbar`, `Menu`, the variable classes, `PhotoImage`, `after`, `bind`, `pack`, `grid`, `place`, `messagebox`, `simpledialog`, `filedialog` (on the virtual file system); then a `ttk` subset.
- `mainloop()` loops on `wait_event`, dispatches callbacks and runs `after` timers. `update()` and `update_idletasks()` drain events.
- **Layout is the main risk of P9.** Map `pack` and `grid` to CSS flex and grid (cheaper; fidelity gaps for sticky, expand and fill) or compute layout in Python with font metrics asked through the blocking host call (higher fidelity, more work). A research sub-step in P9 decides, with a small corpus of layouts compared against real Tk output where the owner has it.
- **turtle:** try CPython's `turtle.py` (PSF) on the Tk Canvas shim; if it is too demanding, write a purpose-built turtle on the canvas surface.
- The page lists what is not supported (Tcl scripts, `root.tk.eval`, platform options).

## 12. Privacy and security

The full design is in [security.md](security.md). In short:

- **The network is off by default.** A CSP with `connect-src 'self'` on the page and the worker, set by the service worker. The visitor can choose Package index, Selected hosts or Everything in a Network dialog; the mode lives in the URL for one page load only, needs a confirmation, and the runtime does not start before it. Before any run the worker checks that the block really works and the tool fails closed if it does not.
- No telemetry and no third-party requests unless the visitor turns the network on.
- The tool starts on the site's own origin; a second origin is required before any share-by-link feature (security.md section 9, Q8). Trusted UI is drawn outside program output, and no worker message carries authority (section 4).
- All tools share one origin. Namespace every key `python:`; never run code from script-writable storage; never auto-run code or auto-install packages from a link; treat every worker message as untrusted input; sandbox HTML output without `allow-same-origin`.
- Clear warnings: a first-visit dialog, a banner whenever the network is on, confirmations for network, links and installs, and an honest note at the top of the page (security.md section 7).

## 13. Performance targets

Initial; revise after the spikes.

- Editor usable under 2 s on broadband; Pyodide ready under 3 s with a warm cache and under 10 s cold, with progress shown; worker restart under 3 s warm.
- Stop under 300 ms for Python-level loops (median of 20).
- Display: 640x480 framebuffer at 60 fps; 1,000 primitives per frame at 60 fps; input event to Python under 20 ms.
- No main-thread task over 50 ms while code runs.
