# Python playground: steps

Size every step by context: one agent stays under about 200k tokens. Page steps get less than they seem to need. Research steps (S) write `docs/python/notes-<step>.md` (facts, decisions, open questions; under about 10k tokens) and change no product code. The numbers below are initial targets, to be revised by the spikes. Security and warnings are in [security.md](security.md); its checks (section 8) are part of `npm run check`.

**Harness.** `scripts/harness/python/` has its own `package.json`. `npm run check` is the engine check (protocol round trips, ring buffer logic, manifest logic, and the example corpus run in a headless browser against a static server of the export). `npm run ui [base URL]` runs the page in the browsers the other harnesses use (S0 confirms which) on port 3023. S0 reads `scripts/harness/resistor/` and copies its structure.

**Example corpus** (used by P1 onwards; kept in the harness): hello; an `input()` loop; an exception with a traceback; an infinite loop plus Stop; `time.sleep(30)` plus Stop; a NumPy computation compared with a JavaScript computation; a matplotlib plot saved to PNG; a PIL image; a CSV round trip; an `asyncio` script.

## Research and spikes

### S0: Survey

Read, in parts: `lib/pdf/worker.ts` and `workerClient.ts` (how workers are built), the Ghostscript worker (how wasm in `public/` is loaded), `scripts/copy-*.mjs` (the copy pattern), `scripts/collect-licenses.mjs` (how vendored non-npm assets are listed), `scripts/check-repo.mjs` (rules and the 40 kB budget), `scripts/harness/resistor/` (harness structure, browsers), `pages/index.tsx` (`TOOLS`), `components/Home/ToolIcon.tsx`, `components/PageHead.tsx`, `components/UI/ToolHeader.tsx`, `PillTabs.tsx`, `lib/ui/i18n/` and `translations.ts`, `lib/pdf/pdfjs.ts`, `lib/pdf/handoff.ts`, `.github/workflows/nextjs.yml`, `docs/ui-redesign/plan.md` (the design system), and the structure of one finished plan (`docs/smith-chart/plan.md`).

Output: `notes-S0.md` answering: how a worker is created and how a `public/` file is imported inside it; where the Python sources live and how they reach the worker; where examples live; how licences of vendored non-npm files are listed; the exact browser set and tooling of the harnesses; what `check:repo` needs for a new route (OG image, i18n parity, route list); how the home card and the entry link are written (and how to make the card a plain `<a>`). Also: what every other tool keeps in `localStorage`, IndexedDB, OPFS and Cache Storage (this decides the exact wording of the first warning); whether any tool uses `BroadcastChannel`, `SharedWorker` or messages between tabs; and how `lib/pdf/pdfjs.ts` is configured (scripting, eval). List every other GitHub Pages repository the account publishes (they share the origin) and what each stores; this is the input to Q8 (security.md section 9).

**Done when:** every question above is answered with file references and the notes are under about 10k tokens.

### S1: Isolation and network policy (service worker, COOP/COEP, CSP)

Build a throwaway page under `/python/` (not linked from the home page, removed or reused in P2) with `public/python/coi-sw.js`. Test with a static server of the export (`npm run build:export`, serve `out/`) on `localhost`.

Check: the page **and** a dedicated worker created from it report isolation and can use SharedArrayBuffer and `Atomics.wait`; the first-visit reload happens once; a client-side navigation from the home page into the tool (and the plain `<a>` alternative); behaviour with no service worker (private mode, blocked); cached updates of the service worker; same-origin iframes and Blob URLs under COEP; Edge, Firefox and WebKit.

Network policy (security.md section 2): with the mode Off, every one of these must fail while a same-origin request works: cross-origin `fetch`, XHR, WebSocket, EventSource, `sendBeacon`, `importScripts`, dynamic `import()`, `FontFace` with a URL, starting a nested worker, and WebRTC if the worker exposes it. Check that the worker takes its policy from its own script response; the exact policy that lets Pyodide load (`script-src 'wasm-unsafe-eval'`, and whether `'unsafe-eval'` is needed); the URL-mode flow including the rule that a worker requested by a worker always gets Off (verify `clients.get(event.clientId)` reliably returns a `window` client with the expected URL for module worker fetches in all three browsers, falling back to Off if empty); the `securitypolicyviolation` self-test (or another test if a browser lacks the event), tested in both online and offline states so an offline `TypeError` does not falsely trigger W7; what happens when the worker unregisters the service worker; and that a fake Cache Storage entry under an in-scope URL is not served. Also: `frame-ancestors 'none'` stops framing from another site; the `Permissions-Policy` and `Referrer-Policy` headers arrive; and Pyodide still works without `'unsafe-eval'`.

**Done when:** `notes-S1.md` gives a working service worker, the entry-link rule, the tier-detection code, the exact headers per mode, and a table of API by mode by browser showing what was blocked and what was not (WebRTC especially).

### S2: Pyodide self-hosting and boot (after Q1 and Q3)

Prototype `scripts/copy-pyodide-assets.mjs`: core from the `pyodide` npm package, a curated package set downloaded by hash and a trimmed lock file. Decide how the worker imports the loader from `public/` under Turbopack. Boot Pyodide in a module worker, load NumPy, matplotlib and Pillow, run the example corpus pieces that need no I/O.

Record: pinned version, file sizes, cold and warm boot times, size of the curated set on Pages, total `out/` export size (including Pyodide, curated packages, Monaco, xterm and existing `public/` assets) against GitHub Pages' 1 GB limit and deploy time, what CI downloads, and how `/licenses` can list the vendored files.

**Done when:** `notes-S2.md` has these facts and a script that works from a clean `npm ci` on Node 22 on Linux and on the owner's Windows setup (case-exact paths).

### S6: Monaco and xterm assets

Self-host Monaco (`@monaco-editor/loader` pointed at `public/monaco/`, copy script) and xterm; load both lazily with `await import`. Check workers under COEP, bundle and transfer sizes, light and dark themes, behaviour on a phone-width viewport and on touch.

**Done when:** `notes-S6.md` gives a working setup, sizes, and a list of touch problems for Q5.

### S3: Blocking input, Stop and asyncio

In the S2 worker: blocking `input()` through the shared buffer, the interrupt flag, interruptible `time.sleep`, the escalation to a worker restart, and measured latencies. Test `asyncio.run`, `sleep`, `gather`, `create_task`, importing `threading`, with and without JSPI.

**Done when:** `notes-S3.md` has the measured Stop latencies (median of 20), what works in each tier, and the asyncio decision (use as is or ship a shim).

### S5: Persistence (before P3)

Compare IDBFS, an OPFS mount (`createSyncAccessHandle`) and a main-thread store: reload, Force stop, files written during a force-stopped run, two tabs, quota errors, speed with 1,000 small files and one 50 MB file, in Edge, Firefox and WebKit.

**Done when:** `notes-S5.md` names the winner with measurements.

### S4: Display transport (before P7)

Compare the shared framebuffer, transferred `ImageBitmap`s and OffscreenCanvas-in-worker for 640x480 RGBA with a busy synchronous Python loop: does each present frames, at what fps, with what input latency; also the command-batch path with 1,000 primitives per frame.

**Done when:** `notes-S4.md` names the default and the fallback with numbers.

## Phase 1: smallest useful version

### P1: Engine

`lib/python/` (protocol, worker client, boot, stdio, run, stop, force stop, crash/OOM recovery, REPL backend, tier detection, capability notes), the worker, `yotasage_rt` basics (stdio, run, shims), the copy scripts and service worker from S1 and S2, `scripts/harness/python/` with `npm run check`, and `docs/python/modules.md`. No page yet beyond a bare test page the harness uses. It also holds the network policy: `lib/python/network.ts` (mode parsing, hostname validation, the policy builder shared with the service worker), the service worker's headers, the fail-closed self-test, and the `webbrowser` and link shims. The exfiltration checks of security.md section 8 go in the harness here. `lib/python/origin.ts` is the single place that names the runtime's origin.

**Done when:** the example corpus passes in Edge, Firefox and WebKit; Stop interrupts a Python loop in under 300 ms (median of 20); Force stop and unexpected worker crashes/OOM transition cleanly and restart the worker; `input()` works in tier 1; tracebacks hide Pyodide frames; `npm run verify` passes.

### P2: Page

`pages/python/main.tsx`, `components/Python/`, `styles/Python*.module.css`, `lib/ui/i18n/python.ts` (EN and NB). Panes (phone width: tabs), Monaco with one file, Console and REPL tabs, Run, Stop, status line, tier notes, the honest status note at the top, the home card with icon (plain `<a>`), OG image, `/licenses` entries, `lib/python/**` in `tsconfig.strict.json`. Also the Network dialog and banner, the on-load confirmation, the first-visit dialog and the notices W1 to W9 of security.md section 7, in EN and NB (after Q6 and Q7). Program-output panels are framed and labelled and all trusted UI is drawn outside them (security.md section 4); a Clear all data button with W9.

**Done when:** a visitor can write code, run it, type input and stop it, on a phone-width and a desktop viewport, light and dark, EN and NB; `npm run ui` passes; `npm run verify` passes.

### P3: Files (after S5)

Persistent file system, file tree (create, rename, delete, move), drag-drop upload, download, zip import and export (fflate), multi-tab editor with autosave, Web Locks, storage usage, example programs. Zip import rejects `..` and absolute paths and limits entries and total size; file and workspace size caps with notices (security.md sections 3 and 4).

**Done when:** files survive reload and Force stop (with documented S5 behaviour for files written during a force-stopped run); scripts read and write files; project modules import each other; a second tab gets a clear notice; a 50 MB file uploads without freezing the page.

### P4: Plots and viewers

The matplotlib backend and Plots gallery, image viewer, PDF viewer through `lib/pdf/pdfjs.ts`, text, CSV and JSON viewers, sandboxed HTML viewer, `PIL.Image.show` hook, new-output markers, send-to-PDF-tools if the handoff API fits. Viewer hardening per security.md section 4: SVG through `<img>`, HTML output in a script-free sandbox, pdf.js scripting off, no `innerHTML` for anything from the worker, message validation.

**Done when:** line, bar, scatter, `imshow` and subplot plots appear without touching the disk; a PDF written by a script opens in the viewer; 100 plots in a row leave no Blob URL leaks and stay within bounded WASM memory via the live-figure cap; the corpus plot is compared with a reference image (within the usual tolerance).

**End of v1.** The owner tries it. Later steps are detailed after that.

## Phase 2: packages

### P5: Packages, engine

Manifest, tiers, auto-load on import, micropip in the Package index mode, uploaded wheels, freeze and lock files, version-change handling, hash checks, lazy restore of kept packages, error mapping. Importing a requirements or lock file never installs anything the current network mode cannot reach.

**Done when:** `import numpy` auto-loads; in Package index mode `micropip.install("rich")` works and can be kept; an uploaded wheel installs and persists; with the network Off, no request leaves the site (checked in the harness by listing all requests) and the install box offers only bundled packages and wheel upload; a manifest edited by user code cannot install anything the mode forbids; removal restarts cleanly; a package with no wheel gives a helpful message.

### P6: Packages, page

The Packages panel, install box, requirements import and export, the install dialog W6, privacy note, EN and NB strings.

**Done when:** a visitor can add, keep, list and remove packages from the page on phone width and desktop.

## Phase 3: display

### P7: Display engine (after S4)

The `vdisplay` Python module, command batches, framebuffer path, event ring, frame pacing, one window.

**Done when:** the S4 targets are met on a mid-range laptop; Stop works in the middle of a render loop; a hidden tab does not spin the CPU; examples run (bouncing ball, paint, NumPy fractal, a 60 fps loop).

### P8: Display page

The Display panel (resize, scale-to-fit, screenshot to Plots, fullscreen), examples in the gallery, EN and NB strings, phone layout (a Display tab).

**Done when:** the examples run from the page with keyboard and mouse input on desktop and with touch events on a phone.

## Phase 4: widgets

**Go/no-go gate (before P9, and again after P9's layout sub-step):** review with the owner after P8 whether `vdisplay` already covers enough of the GUI/game goal before committing to a full `tkinter` subset and layout engine.

### P9: Widget surface and core tkinter

A research sub-step first (layout engine choice, with a small corpus of layouts), then the widget operation protocol, the DOM renderer, virtual windows, and the first tkinter widgets with `pack`, `grid`, `place`, events, `after` and `mainloop`. The renderer follows security.md section 4: elements from a fixed list, validated properties only, no `href` or `src` from Python except `blob:` or `data:` URLs made from the virtual file system.

**Done when:** about 8 canonical Tk programs (hello, counter, calculator, form, todo list, canvas drawing, timer, two windows) run with acceptable fidelity; unsupported features raise clear errors.

### P10: tkinter breadth

`ttk` subset, `Menu`, dialogs (`messagebox`, `simpledialog`, `filedialog` on the virtual file system), `Text`, `Listbox`, `Scale`, `PhotoImage`.

**Done when:** about 15 canonical Tk programs run; the list of unsupported features is on the page.

### P11: turtle (and, if wanted, interactive matplotlib)

Try CPython's `turtle.py` on the Canvas shim; else a purpose-built turtle. Stretch: an interactive matplotlib backend on the canvas surface (pan, zoom, toolbar).

**Done when:** spiral, star, a snowflake and a click-handler example run; `speed`, `tracer` and `onscreenclick` work.

## Finish

### P12: Polish and documentation

Optional completions in the editor (Jedi in the worker), `docs/python/howto.md` for visitors (limits, what differs from desktop Python), accessibility pass, performance pass against the targets, a full harness run, and the repo's docs: a Python playground entry in `CLAUDE.md` (layout and conventions, docs list), a row in the `README.md` tools list, the module map, the backlog file `docs/backlog/python.md`. A full run of the security checks of security.md section 8 in all three browsers, and a read-through of every warning with the owner.

**Done when:** `npm run verify` passes; the status note on the page matches what is actually checked; the owner has used it.
