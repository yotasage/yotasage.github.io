# Python playground: plan

| | |
|---|---|
| Page | `/python/main` (`pages/python/main.tsx`) |
| Branch | `python` (one commit per step; agents never push) |
| Written | 2026-11-23, from `README.md`, `CLAUDE.md` and `docs/agent-workflow.md`; the network policy and security part were added the same day. The other docs and the code were **not** read; step S0 reads what it needs |
| Status | In progress. Q1 and Q3–Q8 answered, S0–S2 and S6 done (2026-11-24). Next: S3, then report before P1 |

This plan replaces an earlier draft that was written without access to the repo. Where the two differ, this one is right.

## Goal

A Python environment that runs entirely in the browser, in the style of the other tools. A visitor can write code in Monaco, run it, and use a terminal for output and input. Files live in a virtual file system with viewers for images, plots and PDFs, so nothing has to be saved to the PC first. Packages can be added and managed from a list. A virtual display built for this site lets visitors try GUIs, drawing and games.

## What the owner asked for

1. A Python tool in this project, running client-side.
2. A virtual display for the Python instance so people can experiment with GUIs and similar. **Decided: build our own display layer.**
3. A file browser and image/PDF viewer for exports such as matplotlib plots, usable without saving to the PC first.
4. Monaco as the code editor.
5. A separate terminal with console input and output.
6. Packages: some preinstalled, some fetched when needed, and visitors can specify packages (pip-style) for the session or keep them in the browser for later. Added packages are managed from a list.

## Ground rules (from CLAUDE.md, applied to this tool)

- **Static export, no server.** No config headers or middleware are possible (CI generates the Next config with `output: 'export'`). Cross-origin isolation therefore comes from a service worker (D2). `npm run build` locally is not the real export: check new code against the constraints by reading it and run `npm run verify`.
- **Self-hosted assets only.** No CDN scripts, fonts, workers or wasm. Pyodide, its packages, Monaco, xterm and the workers are served from `public/`, filled by a `postinstall` copy script whose output is git-ignored, like `public/pdfjs/`, `public/3d/` and `public/qr/`.
- **No third-party requests, no uploads, no analytics.** The tool enforces this with a network policy: the network is **off by default** (CSP `connect-src 'self'`). The visitor can turn it on for one page load (D13, [security.md](security.md)).
- **Security and warnings.** The tool runs untrusted code. Read [security.md](security.md) before touching storage, caching, viewers, messages or packages. Warnings W1 to W9 exist in EN and NB from P2 on.
- **Licences.** MIT, BSD, Apache-2.0 and ISC are fine; anything else needs the owner's decision (Q1). The repo itself is `AGPL-3.0-or-later` (`LICENSE.md`). Vendored non-npm files (like Ghostscript and the OCR models) must be listed on `/licenses`; S0 checks how `scripts/collect-licenses.mjs` finds them.
- **Layout.** It must work at phone width. Use the design system v2 (`styles/design-system.css`, `components/UI/ToolHeader.tsx`, `PillTabs.tsx`, `TeachingCallout.tsx`), light and dark themes, and the self-hosted Inter and JetBrains Mono fonts.
- **Text.** All strings are EN and NB, in `lib/ui/i18n/python.ts`, re-exported by `lib/ui/translations.ts`. `check:repo` checks parity.
- **Home page.** A card in `TOOLS` (`pages/index.tsx`) and an icon in `components/Home/ToolIcon.tsx`, added in step P2 when the page exists (no placeholder cards). The page uses `components/PageHead.tsx` and a 1200x630 image in `public/og/`, and has a home link (`components/icons/home.tsx`). An honest note at the top of the page says what works, what is checked and how, and what is not done.
- **Where things go.** `pages/python/main.tsx`, `lib/python/` (framework-free logic), `components/Python/`, `styles/Python*.module.css`, `scripts/harness/python/` (own `package.json`; `npm run check` and `npm run ui`), docs in `docs/python/`.
- **TypeScript.** `"module": "node16"` makes ESM-only packages load with `await import()`; see `components/Viewer3D/Viewer3D.tsx`. Heavy code (Monaco, xterm, Pyodide) loads only when the page needs it. Add `lib/python/**` to `tsconfig.strict.json`.
- **Size.** No file over 40 kB, source or docs (`check:repo` enforces a budget). Keep Python source modules small too.
- **Verification.** `npm run verify` before saying a step is done. There are no unit-test or lint scripts: the tool's own checks live in `scripts/harness/python/` and compare against independent computations and measured budgets. The owner does not review code.
- **Commits.** Only when asked, except that steps are committed after each step on branch `python`. Messages are one paragraph of tagged, user-facing sentences (`ADDED:`, `CHANGED:`, `FIXED:`, `REMOVED:`, `UPDATED:`). Explicit paths, no push.
- **Ports.** Dev server 3020. The harness's `next start` uses 3023 (Smith chart 3021, EM simulation 3022).

## Decisions

| ID | Decision | Why |
|---|---|---|
| D1 | **Pyodide**, pinned to the stable 314.x line (Python 3.14), in a dedicated module Web Worker | Mature CPython on WebAssembly with the scientific stack. A worker keeps the page responsive and makes Stop possible. A custom CPython build gains nothing the browser allows ([research.md](research.md)) |
| D2 | Cross-origin isolation **and the network policy** by a service worker at `public/python/coi-sw.js`, scope `/python/`, plus capability tiers | GitHub Pages can't send COOP/COEP or CSP headers; SharedArrayBuffer needs the first; the scope keeps other tools unaffected |
| D3 | **Monaco** (through `@monaco-editor/loader` pointed at a local `public/monaco/` copy) and **xterm.js**, loaded lazily | Owner's choice. The loader's default CDN is not allowed. S6 confirms the setup under Turbopack |
| D4 | Own **display layer** with two surfaces: canvas (immediate mode) and widgets (retained mode, DOM). No SDL or pygame-ce | Owner's decision. Pyodide has no Tk; its SDL route is experimental and main-thread only |
| D5 | Persistent virtual file system, default **IDBFS** in the worker (S5 decides) | Files must survive a worker restart and a reload |
| D6 | Packages: a curated set self-hosted in `public/pyodide/`; a manifest in IndexedDB restored lazily; online installs only in the **Package index** network mode (D13) | Keeps "no third-party requests" the default; no separate switch |
| D7 | A custom matplotlib backend feeds a Plots gallery | Pyodide's backends need the DOM, which a worker lacks |
| D8 | PDFs are viewed with the existing `lib/pdf/pdfjs.ts` and `public/pdfjs/`, not an iframe of `/pdf/reader` | An iframe may be blocked under COEP; reuse avoids a second viewer |
| D9 | Run = `runpy.run_path` as `__main__` in a fresh namespace; the REPL shares the last run's namespace | Standard semantics, real tracebacks |
| D10 | Layout works at phone width (tabbed panes). Monaco's touch support is limited and the page says so | CLAUDE.md requires phone layouts |
| D11 | Zip import/export with **fflate** (already a dependency) | No new licence |
| D12 | Built in phases; the owner uses v1 (P1 to P4) before later steps are detailed | `docs/agent-workflow.md`: smallest useful version first |
| D13 | **Network policy:** modes Off (default), Package index, Selected hosts, Everything; set by the URL for one page load, confirmed before the runtime starts, never stored | Stored settings could be rewritten by the code the tool runs; the URL needs a full reload, as the owner asked |
| D14 | **Fail closed:** the worker checks that the block works before any run; if it cannot confirm, Run is disabled until the visitor repairs or confirms | User code might remove the service worker; some browsers lack it |
| D15 | **No code is run from storage that user code can write** (Cache Storage, IndexedDB); the service worker serves an allow-list; kept packages restore lazily and are hash-checked | One malicious run must not become a permanent backdoor |
| D16 | Everything from the worker is untrusted input to the page: validated messages, no `innerHTML`, SVG through `<img>`, script-free HTML sandbox, pdf.js scripting off | The page is the trust boundary |
| D17 | **Origin:** v1 on the site's own origin with the hardening in security.md; the runtime's origin is named in one place so a second origin stays possible; a second origin is **required** before any share-by-link feature (Q8) | Other sites that run untrusted code use a dedicated origin; GitHub Pages cannot do an isolated cross-origin iframe, so a second origin would be a separate site |
| D18 | **Trusted UI stays outside program output**, and no worker message carries authority | A program can forge messages and draw fake dialogs |
| D19 | The service worker also sends `frame-ancestors 'none'`, a `Permissions-Policy` and `Referrer-Policy`; the worker policy leaves out `'unsafe-eval'` | Cheap defence in depth |

## Questions for the owner

Ask before the named step; do not guess.

- **Q1 (resolved 2026-11-24): licences outside the approved list.** **Approved by owner:** MPL-2.0 (Pyodide), PSF-2.0 (CPython), HPND/MIT-CMU (Pillow), and the matplotlib licence, for files served unmodified from `public/pyodide/` with a link to their source on `/licenses`. Also list the licences of the libraries bundled inside those packages and Pyodide's core (e.g. FreeType's credit line, libjpeg, libpng, zlib, Qhull, Agg, DejaVu/STIX fonts, NumPy's BSD-3, Emscripten). Any later package with a licence other than MIT/BSD/Apache-2.0/ISC/PSF/HPND/MPL-2.0 still needs the owner's decision. If a vendored MPL file ever has to be modified, stop and ask first. S2 still checks Pyodide's MPL-2.0 files for any "Incompatible With Secondary Licenses" notice against the repo's `AGPL-3.0-or-later`.
- **Q2: resolved by D13.** Installing from PyPI contacts third parties, so it is only possible in the Package index network mode, which is off by default and needs a confirmation after a page reload.
- **Q3 (resolved 2026-11-24): build-time download.** **Approved by owner:** `scripts/copy-pyodide-assets.mjs` may download the curated set from Pyodide's release host during `npm install` and CI, verify SHA-256 against `pyodide-lock.json`, and write the result to `public/pyodide/` (git-ignored).
- **Q4 (resolved 2026-11-24): the bundled set.** **Approved by owner:** NumPy, matplotlib, and Pillow initially; SciPy, pandas, and SymPy only if size and boot time are acceptable.
- **Q5 (resolved 2026-11-24): phones.** **Approved by owner:** Accept Monaco on touch with a clear note for v1, and consider a plain text-area fallback for narrow/touch screens later.
- **Q6 (resolved 2026-11-24): warning wording.** **Approved by owner:** Draft warning texts W1–W9 in `security.md` section 7 are good; first-visit dialog W1 appears once and again whenever its text changes.
- **Q7 (resolved 2026-11-24): the "Everything" mode.** **Approved by owner:** Keep "Everything" mode behind the red banner and tick-box confirmation.
- **Q8 (resolved 2026-11-24, after S0): the tool's origin.** **Approved by owner:** Option A for v1 — stay on `yotasage.github.io` with the explicit Scratchpad warning in W1 (S0 found Scratchpad uses IndexedDB `yotasage-notepad-db` and `BroadcastChannel('yotasage-notepad-sync-v1')`; owner confirmed no other GitHub Pages repositories exist under `github.com/yotasage`). Keep the runtime origin named in one place (`lib/python/origin.ts`); Option B (second origin) remains required before any share-by-link feature.

## Status

| Step | What | Status |
|---|---|---|
| S0 | Survey of the repo parts this tool touches | Done (`notes-S0.md`) |
| S1 | Isolation and network policy spike: service worker, COOP/COEP, CSP | Done (`notes-S1.md`) |
| S2 | Pyodide self-hosting and boot spike | Done (`notes-S2.md`) |
| S6 | Monaco and xterm self-hosting spike | Done (`notes-S6.md`) |
| S3 | Blocking input, Stop, asyncio spike | Not started |
| P1 | Engine: worker, run/stop, stdio, REPL, network policy | Not started |
| P2 | Page: layout, Monaco, terminal, card, i18n, network settings, warnings | Not started |
| S5 | Persistence spike | Not started |
| P3 | Files | Not started |
| P4 | Plots and viewers. **v1 ends here: the owner tries it** | Not started |
| P5, P6 | Packages: engine, page | Not started |
| S4 | Display transport spike | Not started |
| P7, P8 | Display: engine, page | Not started |
| P9 to P11 | Widget surface, tkinter subset, turtle (after go/no-go gate post-P8) | Not started |
| P12 | Polish, visitor docs, CLAUDE.md and README | Not started |

Details of each step are in [milestones.md](milestones.md). Spikes are run just before the step that needs them.

## How a step is run

Follow `docs/agent-workflow.md`. In short:

- The main session is the coordinator and runs **one step agent at a time**. Set up the watchdog when the session starts (run `CronList` first).
- Heavy steps are split into research (a notes file, `notes-<step>.md`, under about 10k tokens; web or licence lookups on Haiku), code (a fresh agent from the brief and the notes) and check.
- Each step stays under about 200k tokens of context. Page steps get less than they seem to need. Engine and page are separate steps.
- A brief names the goal, scope, files to read and change, the verification bar ("looks right at a glance and passes one reference comparison per feature; do not chase differences under about 1%"), one harness command, the commit rules, and a report under 300 words. Every wait loop has a time limit; the agent stops every background process it started before reporting.
- Keep a module map in `docs/python/modules.md` (one line per file) from P1 on.
- Work left out of a step goes in `docs/BACKLOG.md` as `BL<n>` (new category file `docs/backlog/python.md`; IDs are never reused).

## Start here (prompt for a new session)

> Read `CLAUDE.md` and `docs/agent-workflow.md`, then `docs/python/plan.md` and `docs/python/security.md`. You are the coordinator. Create the branch `python`. Ask me Q1, Q3, Q4, Q5, Q6 and Q7 first, and Q8 after S0. Then run S0, S1, S2, S6 and S3 one at a time, each as its own research agent writing `docs/python/notes-<step>.md`, and report after the last one. Do not start P1 until I confirm. Set up the watchdog as the workflow describes.

## Files of this plan

- [architecture.md](architecture.md): how it fits together (runtime, protocol, display, packages, files, hosting).
- [security.md](security.md): what code can reach, the network policy (off by default), storage and page hardening, the warnings, and the security checks.
- [milestones.md](milestones.md): the steps with scope and "done when".
- [research.md](research.md): verified findings with sources, and what was and wasn't read in the repo.
