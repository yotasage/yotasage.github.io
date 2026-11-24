# Python playground: S0 Survey Notes

Survey completed on branch `python` (read-only; no product code changed). All file references and line numbers are verified against the current repo state.

---

## 1. Workers & `public/` Asset Loading

### Creating bundled workers (`tsconfig.json` has `"module": "node16"`)
- TypeScript compiles repo `.ts` files as CommonJS (`tsconfig.json:16-17`), which forbids `import.meta`. Under Next.js 16 + Turbopack, every bundled worker uses the exact static `new URL(..., import.meta.url)` form with `// @ts-expect-error`:
  - `lib/pdf/workerClient.ts:82-83`:
    ```ts
    // @ts-expect-error TypeScript takes this file for CommonJS, where import.meta is not allowed; the bundler needs exactly this form to build the worker as a file of its own.
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    ```
  - `lib/pdf/ghostscript.ts:83-84`: identical pattern for `./ghostscript.worker.ts` (`{ type: 'module' }`).
  - `lib/qrread/scanClient.ts:36-37`: classic worker `new Worker(new URL('./scan.worker.ts', import.meta.url))`.
  - Worker files (`lib/pdf/worker.ts:76-79`, `lib/pdf/ghostscript.worker.ts:20-23`, `lib/qrread/scan.worker.ts:10-13`) type the global scope via `const scope = self as unknown as { onmessage: ...; postMessage(...): void }`.
  - Keep core worker logic in a separate acyclic module from the main-thread client (e.g., `ghostscript.worker.ts` → `ghostscriptCore.ts`, while `ghostscript.ts` imports `ghostscriptCore.ts` and spawns `ghostscript.worker.ts`).
  - Type-only imports from ESM-only packages use `import type { ... } from '...' with { 'resolution-mode': 'import' }` (`lib/pdf/ghostscriptCore.ts:12`).

### Loading JS / WASM from `public/` inside a module worker
- **Module worker pattern (`lib/pdf/ghostscriptCore.ts:14-15,52-57,111-114`):**
  1. Resolve absolute same-origin URLs from `self.location.origin`:
     ```ts
     function resolveOriginUrl(path: string): string {
       if (typeof self !== 'undefined' && self.location?.origin && self.location.origin !== 'null') {
         return new URL(path, self.location.origin).href;
       }
       return path;
     }
     ```
  2. Dynamically import the ES module from `public/` via a runtime variable with `/* webpackIgnore: true */`:
     ```ts
     const jsUrl = resolveOriginUrl('/pyodide/pyodide.mjs');
     const mod = await import(/* webpackIgnore: true */ jsUrl);
     ```
     Using a variable + `/* webpackIgnore: true */` prevents Turbopack from bundling it and avoids triggering `scripts/check-repo.mjs`'s relative-import checker (which only matches `'./'` / `'../'` literals).
  3. Pass the same origin-resolved base URL to WASM loaders (`locateFile` in `ghostscriptCore.ts:130`, `indexURL` for `loadPyodide`).
- **Classic/Blob worker alternative (`lib/viewer3d/occt.ts:41-91`):** Uses `URL.createObjectURL(new Blob([WORKER_SOURCE]))` + `importScripts(base + 'occt-import-js.js')`. Not suitable for Pyodide's ESM module worker, and Blob workers complicate service-worker CSP header delivery (see §10).
- **Critical S1 scope note:** A Turbopack-emitted worker chunk is served from `/_next/static/chunks/...`, which is **outside** `/python/`. While a `/python/`-scoped service worker intercepts subresource requests made by a controlled `/python/main` window, S1 must verify across Edge, Firefox, and WebKit that the SW both adds COOP/COEP + worker CSP headers to `/_next/static/chunks/<worker>.js` AND controls subresource fetches initiated *from inside* that worker (otherwise use a thin bootstrapper script inside `public/python/`).

---

## 2. Where `yotasage_rt` Python Sources and Examples Should Live

### `yotasage_rt` Python sources
- **Recommended layout:** Author tracked `.py` files under `lib/python/rt/` (small modules, each strictly `< 40 KiB` because `scripts/check-repo.mjs:332` checks *all* files under `lib/`).
  - `.py` files are ignored by `check-repo.mjs`'s JS/CSS import and CDN scanners (`IMPORT_SCAN_EXTENSIONS` = `.ts/.tsx/.js/.mjs/.css`, `check-repo.mjs:52`), and ignored by `tsc`.
- **Reaching the worker (two clean options; S2/P1 picks one):**
  1. **Generated copy/bundle into `public/python/rt/`** (or a single zip) via `postinstall` (`scripts/copy-pyodide-assets.mjs` or a small companion script), fetched by the worker from `/python/rt/...` (in-scope of `coi-sw.js`, covered by the build-time allow-list) and written into Pyodide's Emscripten FS before boot. **Important:** Only git-ignore `/public/python/rt/` (never `/public/python/` wholesale, since `public/python/coi-sw.js` is tracked in git).
  2. **Inlined TS string map (`lib/python/rt/index.ts` or generated `.ts`):** Imported directly by `python.worker.ts` (zero extra network requests at boot, automatically traced by `scripts/generate-page-meta.mjs` for `/python/main`'s last-changed date and content hash). Works cleanly as long as each file stays `< 40 KiB`.

### Example programs
- **Recommended layout:** Store example metadata + Python source strings in TypeScript modules under `lib/python/examples/` (e.g., `lib/python/examples/index.ts`, split by category if needed to stay `< 40 KiB`), matching `lib/smith/examples.ts` and `lib/calc/layouts.ts`.
  - Advantages: zero runtime fetches, works offline and in the Node/browser harness identically, type-checked under `tsconfig.strict.json`, and EN/NB titles/descriptions plug straight into `lib/ui/i18n/python.ts`.
- Any binary sample data files (e.g., sample CSV/PNG/WAV for demos) can live in `public/samples/python/` alongside the existing tracked demos in `public/samples/` (`CLAUDE.md:65`).

---

## 3. Existing Editor & Runtime Assets in the Repo

### Major finding: Monaco Editor is ALREADY installed and self-hosted
- **`package.json:35`:** `"monaco-editor": "^0.57.0"` (MIT) is already a dependency (used by Scratchpad at `pages/scratchpad/main.tsx`).
- **`scripts/copy-monaco-assets.mjs:1-18`:** Already runs in `postinstall` (`package.json:13`), copying `node_modules/monaco-editor/min/vs` → `public/monaco/vs/` (151 files, **24.38 MB**).
- **`.gitignore:43`:** `/public/monaco/` is already git-ignored.
- **No `@monaco-editor/loader` needed:** Scratchpad wrote a clean 199-line zero-dependency loader in `lib/notepad/monacoLoader.ts`:
  - Lazily injects `<script src="/monaco/vs/loader.js">` (lines 186-195), runs AMD `require.config({ paths: { vs: '/monaco/vs' } })`, and loads `['vs/editor/editor.main']`.
  - Configures `window.MonacoEnvironment.getWorkerUrl` using a same-origin Blob script that calls `importScripts("${window.location.origin}/monaco/vs/base/worker/workerMain.js")` (lines 103-113).
  - Theme mapping in `components/Notepad/MonacoPane.tsx:46-50`: `'light' -> 'vs'`, `'dark' -> 'vs-dark'`, `'hc' -> 'hc-black'`.
  - `monaco-editor` is already listed in `lib/generated/third-party-licenses.json` via `import type * as MonacoApi from 'monaco-editor'` (`lib/notepad/monacoLoader.ts:1`).
- **What S6 still needs to test:**
  1. Whether `lib/notepad/monacoLoader.ts` (Blob worker + `importScripts` of `/monaco/vs/...` + AMD script tag) works cleanly under `/python/`'s COOP/COEP (`require-corp`) headers in Edge, Firefox, and WebKit — and whether Python can reuse/share `monacoLoader.ts` directly (avoiding adding `@monaco-editor/loader` as a new dependency).
  2. `@xterm/xterm` (and `@xterm/addon-fit`, `@xterm/addon-web-links`) — **not** installed yet; S6 adds/tests lazy `await import()` loading and sizing.
  3. Monaco touch/phone UX on 320–390 px viewports (confirming Q5 notes).

### Other reusable dependencies already installed
| Package | Version | Licence | Current asset / reuse |
| --- | --- | --- | --- |
| `monaco-editor` | `^0.57.0` | MIT | `public/monaco/vs/` (24.38 MB), `lib/notepad/monacoLoader.ts` |
| `fflate` | `^0.8.3` | MIT | Zip import/export (no new dep) |
| `pdfjs-dist` | `^6.4.299` | Apache-2.0 | `public/pdfjs/` (3.97 MB), `lib/pdf/pdfjs.ts` |
| `@fontsource-variable/inter` | `^5.3.0` | SIL OFL-1.1 | `public/fonts/` (0.23 MB combined) |
| `@fontsource-variable/jetbrains-mono` | `^5.3.0` | SIL OFL-1.1 | `public/fonts/` |

### Existing `public/` footprint baseline (for S2's 1 GB GitHub Pages limit)
| Directory | Files | Size (MB) | Tracked / git-ignored |
| --- | ---: | ---: | --- |
| `public/ocr` | 14 | 37.98 | git-ignored (`copy-pdf-wasm-assets.mjs`) |
| `public/monaco` | 151 | 24.38 | git-ignored (`copy-monaco-assets.mjs`) |
| `public/pdf-wasm` | 4 | 17.86 | git-ignored (`copy-pdf-wasm-assets.mjs`) |
| `public/3d` | 8 | 8.28 | git-ignored (`copy-3d-assets.mjs`) |
| `public/pdfjs` | 199 | 3.97 | git-ignored (`copy-pdfjs-assets.mjs`) |
| `public/qr` | 1 | 0.90 | git-ignored (`copy-qr-assets.mjs`) |
| `public/og` | 8 | 0.89 | tracked |
| `public/breadboard` | 1 | 0.84 | tracked |
| `public/fonts` | 5 | 0.23 | git-ignored (`copy-fonts.mjs`) |
| `public/samples` | 2 | 0.20 | tracked |
| `public/flags` | 2 | <0.01 | git-ignored (`copy-flags.mjs`) |
| **Total `public/`** | **395+** | **~95.5 MB** | Leaves ~900 MB before Pages' 1 GB artifact cap |

---

## 4. Copy Scripts & `/licenses` Registration

### `postinstall` chain (`package.json:13`)
```
copy-pdfjs-assets.mjs -> copy-pdf-wasm-assets.mjs -> copy-3d-assets.mjs -> copy-qr-assets.mjs
-> copy-monaco-assets.mjs -> copy-fonts.mjs -> copy-flags.mjs
-> collect-licenses.mjs -> generate-sitemap.mjs -> generate-page-meta.mjs
```
- Every copy script is a standalone ESM `.mjs` file using `node:fs` / `node:path` / `node:url`, warns gracefully if its npm package is missing, and writes into a git-ignored folder under `public/` (`.gitignore:27-52`).
- Add `node scripts/copy-pyodide-assets.mjs` before `collect-licenses.mjs` in `postinstall`, and add `/public/pyodide/` (plus `/public/python/rt/` if generated) to `.gitignore`.

### How `scripts/collect-licenses.mjs` & `pages/licenses.tsx` handle vendored non-npm assets (Q1)
- **Automatic npm discovery (`collect-licenses.mjs:32-98`):** Regex-scans `pages/`, `components/`, `lib/` (skipping `lib/generated/`) for bare package specifiers (starting from `ALWAYS = ['next', 'react', 'react-dom', 'flag-icons']`), walks runtime `dependencies` recursively in `node_modules/`, reads `LICENSE*`/`COPYING*`/`NOTICE*`, and emits `packages[]`.
- **Manual non-npm / WASM / bundled sub-library sections (`collect-licenses.mjs:100-303`):**
  - `assets[]` (`pdfjs-dist` CMaps, fonts, OpenJPEG, JBIG2, qcms, ICCs)
  - `pdfWasm[]` (QPDF, Ghostscript 10.08.0 AGPL with source links & separate-files note, Tesseract + Leptonica + `tessdata_fast`)
  - `viewer[]` (`occt-import-js` + Open CASCADE LGPL-2.1 with separate-files & source note, Draco, Basis, Chevrotain, meshoptimizer, ktx-parse, zstddec)
  - `pcb[]` (KiCanvas MIT, Newstroke CC0 — reads checked-in `LICENSE.*.txt` files from `lib/pcb/font/`)
  - `qr[]` (ZXing-C++ with exact commit URL)
  - `fonts[]` (Inter, JetBrains Mono SIL OFL-1.1)
- **Written to** `lib/generated/third-party-licenses.json` (`{ packages, assets, pdfWasm, viewer, pcb, qr, fonts }`) and rendered in `pages/licenses.tsx:41-47,87-158` as collapsible `<details>` cards (`{ name, version?, license, url, text }`).
- **Implementation pattern for Q1:**
  - Add a `python` array in `scripts/collect-licenses.mjs` and a matching `<section>` in `pages/licenses.tsx` (with EN/NB keys in `lib/ui/i18n/common.ts` or `lib/ui/i18n/python.ts`).
  - Keep upstream licence/notice texts that aren't in `node_modules/` in checked-in text files under `lib/python/licenses/` (same pattern as `lib/pcb/font/LICENSE.*.txt` at `collect-licenses.mjs:190-200`) or extract from installed `node_modules/pyodide` + downloaded wheel metadata.
  - List **Pyodide** (MPL-2.0, with unmodified-separate-files & source-URL note), **CPython** (PSF-2.0), **Emscripten** (MIT/NCSA), **NumPy** (BSD-3-Clause), **Pillow** (MIT-CMU / HPND), **matplotlib** (PSF-based), and every bundled sub-library (**FreeType** with credit line, **libjpeg-turbo**, **libpng**, **zlib**, **Qhull**, **Agg**, **DejaVu fonts**, **STIX fonts**, etc.) with upstream source URLs.
  - Note: Because `pyodide` will be loaded at runtime from `public/pyodide/` via `await import(/* webpackIgnore: true */ url)` (not a bare `import 'pyodide'`), `collect-licenses.mjs`'s import scanner won't auto-add `pyodide` to `packages[]` unless `pyodide` is imported (e.g., `import type ... from 'pyodide'`) or explicitly listed in `python[]`. Listing `pyodide` in `python[]` (and avoiding duplicate entries) keeps Q1 cleanly grouped.

---

## 5. Repo Guardrails (`check:repo`, CI, `tsconfig.strict.json`)

Every requirement a new `/python/main` route must satisfy to pass `npm run verify` (`typecheck && check:repo && build:export`) and GitHub Actions CI:

| # | Check / Tool | Source | Requirement for `/python/main` |
| --- | --- | --- | --- |
| 1 | Static-export & CDN bans | `scripts/check-repo.mjs:200-244` | No `pages/api/`, no `getServerSideProps`, no `next/image` without `unoptimized`, no URLs matching `unpkg.com`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com`, `esm.sh` anywhere in `pages/`, `components/`, `lib/`, `styles/`. (`pypi.org` and `files.pythonhosted.org` are allowed.) |
| 2 | Exact-case relative imports | `scripts/check-repo.mjs:289-325` | All relative JS/TS/CSS imports must match disk case exactly (Windows + Ubuntu CI parity). |
| 3 | 40 KiB file-size budget | `scripts/check-repo.mjs:330-351` | Every file under `docs/`, `pages/`, `components/`, `lib/`, `styles/` (including `.md` and `.py`) must be `< 40,960` bytes. |
| 4 | Licence freshness | `scripts/check-repo.mjs:361-406` | Every non-builtin, non-`@types/` npm package imported in `pages/`, `components/`, `lib/` must appear in `lib/generated/third-party-licenses.json`. Run `node scripts/collect-licenses.mjs`. |
| 5 | Home-page link for `main.tsx` | `scripts/check-repo.mjs:415-426` | Whenever `pages/python/main.tsx` exists, `pages/index.tsx` **must** contain `'/python/main'` or `"/python/main"`. **Spike warning:** In S1/P1 (before P2 adds the home card), name any throwaway/harness page `pages/python/spike.tsx` or `pages/python/harness.tsx` — NOT `main.tsx` — so `check:repo` passes. |
| 6 | `<PageHead>` & `ogImage` | `scripts/check-repo.mjs:446-496` | Every non-`_` file under `pages/` must render `<PageHead>` and every `ogImage="/og/..."` must exist with exact case under `public/` (create `public/og/python.png` 1200×630 in P2). |
| 7 | EN/NB translation parity | `scripts/check-repo.mjs:657-708` | `lib/ui/i18n/python.ts` must export `en` and `nb` with identical key sets, no duplicate keys locally or globally across `lib/ui/i18n/*.ts`, and be imported in `lib/ui/translations.ts`. |
| 8 | Page metadata & sitemap | `scripts/check-repo.mjs:738-798`, `generate-page-meta.mjs:38-58`, `generate-sitemap.mjs` | Add `'/python/main': 'Python playground'` to `CANONICAL_TITLES` in `scripts/generate-page-meta.mjs`, and run `npm run generate:meta` (and `node scripts/generate-sitemap.mjs`). `build:export` auto-runs `generate-page-meta.mjs`. |
| 9 | Lockfile sync | `scripts/check-repo.mjs:803-873` | After adding `pyodide` / `@xterm/*` to `package.json`, run `npm install` (or `--package-lock-only`) so `package-lock.json` stays in sync for CI `npm ci`. |
| 10 | Strict TypeScript | `tsconfig.strict.json:9-48` | Add `"lib/python/**/*"`, `"components/Python/**/*"`, `"pages/python/**/*"` to `include` (`strict: true`, `noUnusedLocals: true`). |
| 11 | Local static export | `scripts/build-export.mjs:80-123` | `npm run build:export` writes a temporary `next.config.mjs` (`output: 'export', images: { unoptimized: true }`), runs `next build`, verifies every route emitted HTML in `out/`, removes `next.config.mjs`, and restores `next-env.d.ts`. |
| 12 | GitHub Actions CI | `.github/workflows/nextjs.yml:53-86` | Ubuntu, Node 22, `npm ci` (runs `postinstall`), `npm run typecheck && npm run check:repo`, `npx --no-install next build`, uploads `./out`. Only `.next/cache` is cached (`actions/cache@v6`, lines 67-75). |

---

## 6. Home Card, Plain `<a href>` Entry Link & Design System v2 / i18n

- **Home catalog (`pages/index.tsx`):**
  - `SiteTool` interface (lines 18-32) and `TOOLS` array (lines 37-260) hold all 17 current tools across 3 groups: `'electronics'`, `'documents'`, `'utilities'`.
  - `ToolCard` (lines 314-402) renders `<Link href={tool.href} className={styles.cardLink}>` (line 356), whose `::after` covers the whole card.
  - **Making the Python card a plain `<a href>`:** Add an optional `hardNavigation?: boolean` property on `SiteTool` (`pages/index.tsx:18-32`), set `hardNavigation: true` on the Python entry (`href: '/python/main'`, `group: 'utilities'`), and in `ToolCard` (`pages/index.tsx:356`) render `<a href={tool.href} className={styles.cardLink}>` when `tool.hardNavigation` is true, else `<Link href={tool.href} ...>`. This forces a full-page load so `coi-sw.js` attaches COOP/COEP + CSP on entry, and still satisfies `check-repo.mjs:423`.
  - **Leaving `/python/main` (`components/UI/ToolHeader.tsx:180`):** Currently the Home pill uses `<Link href="/">`. Leaving `/python/main` via client-side `<Link>` keeps the isolated document + Python's CSP headers active on `/` and subsequent SPA-navigated tools! Adding an optional `hardHomeLink?: boolean` prop to `ToolHeader` (rendering `<a href="/">` when true) cleanly exits isolation when returning home. (Note: `SiteFooter` in `pages/_app.tsx:23` also links to `/licenses` — check whether it uses `<Link>` in P2.)
- **Tool icon (`components/Home/ToolIcon.tsx`):** Add `'python'` to `HomeIconName` (line 5) and an entry in `ICONS` (lines 13-184) using the 48×48 `viewBox`, `strokeWidth={2.2}`, `stroke="currentColor"`, `fill="none"` style.
- **Design System v2 (`docs/ui-redesign/plan.md`, `pages/_app.tsx`, `components/UI/`):**
  - `pages/_app.tsx:13-30` wraps every page in `ThemeProvider`, `LayoutProvider`, `ModeProvider`, `MathSettingsProvider`, `I18nProvider`, and renders `<SiteFooter fixed={pathname === '/'} />`.
  - Tool page pattern:
    - Call `useDesignSystemPage(accentLight, accentDark)` (`lib/ui/theme.tsx`).
    - Root `<div className={styles.page} data-ds="v2">`.
    - `<PageHead title={...} description={...} path="/python/main" ogImage="/og/python.png" ogAlt={...} />` (`components/PageHead.tsx`).
    - `<ToolHeader title={...} workspaces={...} activeWorkspace={...} onWorkspaceChange={...} actions={...} allowWideView />` (`components/UI/ToolHeader.tsx`) — provides Home pill, workspace `PillTabs`, Light/Dark/HC toggle, EN/NB toggle, and `SettingsModal`.
    - `PillTabs` (`components/UI/PillTabs.tsx`): accessible `role="tablist"` with Left/Right/Home/End keyboard nav (`variant="segmented" | "subtle"`, `size="sm" | "md"`).
  - **i18n (`lib/ui/translations.ts`, `lib/ui/i18n/*.ts`):** Each module exports `export const en = { ... } as const;` and `export const nb: Record<keyof typeof en, string> = { ... };` (see `lib/ui/i18n/pdf.ts:1-63`), imported and spread into `en` and `nb` in `lib/ui/translations.ts`.

---

## 7. Harness Conventions

- **Package setup** (verified in `scripts/harness/{resistor,smith,emsim,pdf,qr-reader}/package.json`):
  - `"type": "module"`, `"private": true`, `devDependencies`: `playwright-core` (`^1.50.0` in resistor/smith/pdf/qr-reader, `^1.65.1` in emsim) and `tsx` (`^4.19.0`).
  - `/scripts/harness/*/node_modules/` is already git-ignored (`.gitignore:66`).
  - Scripts: `"check": "tsx check.mjs"` (or `node ...`), `"ui": "node ui.mjs"` (accepting optional `[base URL]`).
- **Exact browser set:**
  - Primary/single-browser scripts (`resistor/ui.mjs:15-17`, most `smith`/`emsim` `ui-*.mjs`): **Edge** via `chromium.launch({ channel: 'msedge' })` (with `'chrome'` fallback in resistor).
  - Cross-browser suites (`emsim/ui-browsers.mjs:26,373`, `smith/ui-browsers.mjs`): **Edge** (`chromium.launch({ channel: 'msedge' })`), **Firefox** (`firefox.launch()`), and **WebKit** (`webkit.launch()`) from `playwright-core`.
- **Server & port pattern:**
  - `smith/ui.mjs` uses `next start -p 3021`; `emsim/ui.mjs` uses `next start -p 3022`; `python` uses port **3023** (`plan.md:40`, `milestones.md:5`).
  - **Port notes:** (a) `package.json:5` currently runs `next dev -H 0.0.0.0 -p 3000` (diverging from `CLAUDE.md:53` / `resistor/ui.mjs:13` which say 3020); (b) `scripts/harness/emsim/check.mjs:10` transiently uses `127.0.0.1:3023` for its WebGPU check, so don't run `emsim check` and `python ui` simultaneously.
  - **Static export server for Python:** Unlike `smith`/`emsim` (`next start`), the Python harness (`milestones.md:5`) should run `npm run build:export` and serve `out/` with a minimal Node `http.createServer` static file server on `http://localhost:3023` sending **no** COOP/COEP/CSP headers — matching GitHub Pages exactly so `coi-sw.js` is genuinely exercised. Always stop spawned servers in `finally` (`taskkill /pid ${pid} /T /F` on Windows, `smith/ui.mjs:23-27`).

---

## 8. `lib/pdf/pdfjs.ts` Security Configuration & `lib/pdf/handoff.ts` API

### `lib/pdf/pdfjs.ts` (`pdfjs-dist` `^6.4.299`)
- `loadPdfjs()` (`lib/pdf/pdfjs.ts:9-17`): lazy `import('pdfjs-dist')`, sets `GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs'`.
- `openPdf(bytes, password)` (`lib/pdf/pdfjs.ts:20-37`): calls `lib.getDocument({ data: bytes.slice(), password, cMapUrl: '/pdfjs/cmaps/', standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/' })`.
- `renderPage(page, scale)` (`lib/pdf/pdfjs.ts:40-47`): renders directly onto an HTML `<canvas>` (`page.render({ canvas, viewport, background: '#ffffff' })`).
- **Security audit against `security.md` §4 ("scripting and eval switched off"):**
  - **Eval:** `isEvalSupported` was removed upstream before `pdfjs-dist` 6.4.299 (`node_modules/pdfjs-dist/types/src/display/api.d.ts` has no `isEvalSupported`, and `build/pdf.mjs` contains no `new Function` font-eval paths).
  - **PDF JavaScript / Scripting:** `enableScripting` is an `AnnotationLayer` parameter (`build/pdf.mjs:18555`), not a `getDocument` option. `lib/pdf/pdfjs.ts` renders canvas-only (no `AnnotationLayer`, no `PDFScriptingManager`), **and** `scripts/copy-pdfjs-assets.mjs:19-20` explicitly strips QuickJS (`const skip = (path) => /quickjs/i.test(basename(path))`) so no PDF JS sandbox is shipped in `public/pdfjs/`.
  - **XFA:** `enableXfa` defaults to `false` (`api.d.ts:164`).
  - **Recommended change in P4 (defense-in-depth):** Explicitly pass `enableXfa: false` in `openPdf()` (`lib/pdf/pdfjs.ts:23-30`) with a brief security comment, and ensure Python's PDF viewer uses canvas rendering only (never instantiating `AnnotationLayer` with `enableScripting: true`).

### `lib/pdf/handoff.ts`
- Pure in-memory module state (`let pending: HandoffFile[] | null = null`, 23 lines):
  - `export interface HandoffFile { name: string; bytes: Uint8Array }`
  - `setHandoff(files: HandoffFile[]): void`
  - `consumeHandoff(): HandoffFile[] | null`
  - `handoffToFiles(files: HandoffFile[]): File[]`
- **Isolation caveat:** Because `pending` lives in JS module memory, it only survives Next.js **client-side SPA navigation** (`router.push('/pdf/reader')`), NOT a full-page `<a href>` navigation. Navigating from `/python/main` to `/pdf/*` via `router.push` would keep the isolated document (COOP/COEP + Python's page CSP) alive on `/pdf/*`. S1/P4 must decide whether to test `/pdf/*` under COOP/COEP + Python's page CSP (keeping "Send to PDF tools") or skip handoff in favor of Download + hard navigation out of `/python/main`.

---

## 9. Origin Storage & Cross-Tab Messaging Inventory (Input for W1 & Q8)

### A. Worker-reachable storage & channels across EVERY tool in this repo
A dedicated Web Worker on `https://yotasage.github.io` **CAN** access **IndexedDB**, **OPFS**, **Cache Storage**, and **`BroadcastChannel` / `SharedWorker`** on the origin. It **CANNOT** directly access `localStorage`, `sessionStorage`, cookies, or DOM.

| Mechanism | Reachable from Python worker? | Tool / File | Exact DB / Channel / Store Name | What is stored / sent |
| --- | :---: | --- | --- | --- |
| **IndexedDB** | **YES (read/write/delete)** | **Scratchpad** (`lib/notepad/storage.ts:16-21,335-426`) | DB `yotasage-notepad-db` (v1), store `workspace`, key `'current'` | **Full Scratchpad workspace: all user notes, pasted text/code, multi-tab documents, editor settings.** |
| **IndexedDB** | **YES (transient)** | **PDF OCR** (`lib/pdf/ocrRuntime.ts:50-105,194-246`) | DB `keyval-store`, store `keyval`, keys `ocr-custom-<uuid>/<code>.traineddata` | Transient user-uploaded custom `.traineddata` OCR models during worker init (deleted in `finally`). Bundled languages use `cacheMethod: 'none'`. |
| **BroadcastChannel** | **YES (read & forge!)** | **Scratchpad** (`lib/notepad/storage.ts:21`, `components/Notepad/useWorkspaceSync.ts:292-344`) | Channel `yotasage-notepad-sync-v1` | **Live cross-tab sync of Scratchpad documents & settings (`docs-patch`, `workspace-reset`).** Open Scratchpad tabs apply received patches to live editor state and persist them (including to `localStorage` fallback) within 150 ms! |
| **OPFS** (`navigator.storage`) | YES (if used) | *None* | — | Not used anywhere in the repo. |
| **Cache Storage** (`caches`) | YES (if used) | *None* | — | Not used anywhere in the repo. |
| **SharedWorker** | YES (if used) | *None* | — | Not used anywhere in the repo. |
| **ServiceWorker** | Varies by browser | *None yet* | — | No service worker exists in the repo yet (`public/python/coi-sw.js` will be the first). |

### B. Main-thread-only storage across EVERY tool (NOT directly reachable from worker)
| Mechanism | Tool / File | Exact Keys | What is stored |
| --- | --- | --- | --- |
| `localStorage` | Site-wide UI (`lib/ui/{theme,i18n,mode,layout,mathFormat}.*`, `pages/_document.tsx:8`) | `site.theme` (legacy: `resistor.theme`, `smith.theme`, `emsim.theme`), `site.lang`, `site.mode`, `ds.wide`, `ds.mathScale`, `ds.mathFullFractions` | Theme, language, experience mode, wide view, KaTeX scale/fractions. (`mathSettings.tsx:81` listens to `window` `'storage'` event.) |
| `localStorage` | Smart Calculator (`lib/calc/storage.ts:25-29`) | `smartcalc.v1.workflow`, `smartcalc.v1.history`, `smartcalc.v1.vars`, `smartcalc.v1.notebook`, `smartcalc.v1.customLayouts` | Active tab, up to 150 history items, variables, notebook text, custom equation layouts. |
| `localStorage` | Scratchpad fallback (`lib/notepad/storage.ts:20,393-395`) | `yotasage.notepad.workspace.v1` | Fallback mirror of Scratchpad workspace (`< ~3.5 MB`). *Note: indirectly writable if malicious worker forges a `BroadcastChannel` message to an open Scratchpad tab!* |
| `localStorage` | Paint (`components/Paint/PaintWorkspace.tsx:40`) | `yotasage:paint:panels:v1` | Floating Colors/Layers panel positions & visibility. |
| `localStorage` | Resistor (`lib/resistor/lists.ts:21`, `components/Resistor/ResistorTool.tsx:71`) | `resistor.lists`, `resistor.style` | User-pasted E-series / custom resistor lists, flat/shaded style. |
| `localStorage` | Smith chart (`pages/smith-chart/main.tsx:120,122`, `components/Smith/Challenge.tsx:35`, `ExportPanel.tsx:51`) | `smith.lists`, `smith.digits`, `smith.challenges`, `smith.export` | Custom component lists, readout digits, challenge progress, export prefs. |
| `localStorage` | EM simulation (`components/EmSim/EmSimTool.tsx:44-45`) | `emsim.units`, `emsim.digits` | Display units and readout digits. |
| `localStorage` | Boolean (`components/Boolean/BooleanStepViewer.tsx:9`) | `boolean.stepLayout` | Step viewer layout preference. |
| `localStorage` | Calculus (`components/Calculus/StepViewer.tsx:9`) | `calculus.stepLayout` | Step viewer layout preference (shared by `/integral/main` and `/derivative/main`). |
| `localStorage` | Text case (`components/TextCase/CaseConverter.tsx:15`) | `text-case-terms` | Custom preserved terms list. |
| `sessionStorage` | Scratchpad (`lib/notepad/syncMerge.ts:64,351-362`) | `yotasage.notepad.windowView.v1` | Per-tab split/grid/diff layout state. |
| Cookies | *None* | — | No `document.cookie` usage anywhere in the repo. |
| In-memory only | PDF tools (except transient OCR custom lang), 3D viewer, PCB viewer, QR generator/reader, Base64 image, SimSetup | — | Opened user files live only in page/worker RAM. |

### C. Other GitHub Pages repositories under `yotasage.github.io`
- **Public web check (`site:yotasage.github.io`, `site:github.com/yotasage`):** Only the main user site `https://yotasage.github.io/` (this repository) is publicly indexed. Other public GitHub activity is contributions to external repos (`wulffern/aic*`, `eielsen/DAC-Linearisation`).
- **Owner confirmation required for Q8:** Public search cannot see unindexed or private GitHub Pages deployments under `github.com/yotasage/<repo>`. Before deciding Q8, the owner should confirm in GitHub whether any other repository under the `yotasage` account has GitHub Pages enabled (and if so, whether it stores anything in IndexedDB, OPFS, Cache Storage, or listens on `BroadcastChannel`).

### D. Direct input for Q8 (`security.md` §9) and exact wording for W1
- **`security.md:182` decision rule:** *"use A for v1 **if S0's inventory finds nothing in shared IndexedDB, OPFS or Cache Storage that the owner would mind losing**, and no other Pages repository with data worth protecting."*
- **S0 finding:** **Scratchpad (`yotasage-notepad-db` + `BroadcastChannel('yotasage-notepad-sync-v1')`) DOES store persistent user notes/code in shared IndexedDB and accepts live cross-tab patches over `BroadcastChannel`.** Untrusted Python code on `yotasage.github.io` can:
  1. Read, alter, or wipe all saved Scratchpad documents via IndexedDB (`yotasage-notepad-db`).
  2. Eavesdrop on and overwrite open Scratchpad tabs live via `BroadcastChannel('yotasage-notepad-sync-v1')` (which also triggers Scratchpad to persist the forged payload).
- **Q8 options for the owner:**
  - **Option A (stay on `yotasage.github.io`):** Acceptable *only* if the owner is comfortable with untrusted Python code being able to read/modify/delete Scratchpad documents (and warns visitors plainly in W1). Reuses shared UI, `/licenses`, `public/monaco/`, `lib/pdf/pdfjs.ts`, single deploy.
  - **Option B (separate origin for Python playground):** Eliminates all Scratchpad exposure (and any future IndexedDB/BroadcastChannel tools on `yotasage.github.io`), at the cost of a second repo/deploy and duplicating or syncing shared UI/licenses.
- **Recommended exact wording for W1's bracketed clause (`security.md:127`) if Option A is chosen:**
  - Replace `[data this site has saved in your browser]` with:
    `any notes or files saved in Scratchpad on this site (including open Scratchpad tabs)`
  - Resulting sentence: *"Code written by someone else can read, change and delete every file you put in this tool, and any notes or files saved in Scratchpad on this site (including open Scratchpad tabs)."*
  - *(If Option B is chosen, omit the second clause entirely.)*

---

## 10. Open Questions & Surprises for S1–S3, S6

1. **Q8 blocker — Scratchpad IndexedDB + `BroadcastChannel`:** Needs owner decision (Option A with explicit Scratchpad warning in W1 vs. Option B separate origin) and owner check for any unindexed/private GitHub Pages repos under `github.com/yotasage`.
2. **S1 — Turbopack worker URL vs. `/python/` SW scope:** `new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })` bundles into `/_next/static/chunks/...` (outside `/python/`). S1 must verify in Edge, Firefox, and WebKit whether a `/python/`-scoped `coi-sw.js` intercepts and applies COOP/COEP + worker CSP to that worker script response AND controls fetches originating from inside that worker. If Firefox or WebKit does not treat an out-of-scope worker script as SW-controlled, place the worker entry inside `public/python/` (e.g. a small loader script) or verify exact client/controller behavior.
3. **S1 — Leaving `/python/main` cleanly:** Clicking `<Link href="/">` in `ToolHeader` (or `/licenses` in `SiteFooter`) performs a client-side SPA transition, leaving COOP/COEP + Python's page CSP attached to the document for other tools. S1/P2 should test `hardHomeLink` (`<a href="/">`) on `ToolHeader` and decide how `lib/pdf/handoff.ts` ("Send to PDF tools") interacts with SPA vs. hard navigation.
4. **S1 / P1 — Do not create `pages/python/main.tsx` before P2:** `scripts/check-repo.mjs:415-426` fails if `pages/python/main.tsx` exists without a link in `pages/index.tsx`. Use `pages/python/spike.tsx` (with `<PageHead>`) for S1 and `pages/python/harness.tsx` for P1.
5. **S2 — CI download time & 1 GB export budget:** `public/` is currently ~95.5 MB (Monaco is already included!). `.github/workflows/nextjs.yml` only caches `.next/cache`, so `copy-pyodide-assets.mjs` will download curated packages on every CI run unless S2 also checks whether an `actions/cache` step or `npm ci` download time is fast enough.
6. **S6 — Reuse `lib/notepad/monacoLoader.ts` under COEP:** `monaco-editor@0.57.0` and `public/monaco/vs/` already exist. S6 should test whether Scratchpad's `monacoLoader.ts` (Blob worker + `importScripts` of `/monaco/vs/base/worker/workerMain.js`) works cleanly under COEP `require-corp` in Edge, Firefox, and WebKit — avoiding adding `@monaco-editor/loader`.
7. **Harness port note:** `package.json` `dev` currently binds port `3000` (not `3020` per `CLAUDE.md`), and `scripts/harness/emsim/check.mjs` transiently uses `127.0.0.1:3023` for WebGPU. Python's harness should serve `out/` statically on port `3023` with zero custom headers.
