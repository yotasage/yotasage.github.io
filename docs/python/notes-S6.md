# Python Playground: S6 Monaco & xterm Self-Hosting Spike Notes

Verified empirically on branch `python` by serving the repo's existing `public/monaco/vs/` (`monaco-editor@^0.57.0`) and `public/fonts/` (`@fontsource-variable/jetbrains-mono`) alongside S1's exact `/python/coi-sw.js` (`COOP: same-origin`, `COEP: require-corp`, S1 page CSP) and freshly installed `@xterm/xterm`, `@xterm/addon-fit`, and `@xterm/addon-web-links` (installed in scratch; repo `package.json`, `package-lock.json`, and `public/` untouched) from a local static HTTP server on `http://localhost:3023` with **zero** server-added COOP/COEP/CORP/CSP headers (matching GitHub Pages) across **Edge** (`msedge`), **Firefox** (`firefox-1572`), and **WebKit** (`webkit-2388`) via Playwright.

---

## 1. Headline Findings & Decisions

1. **Drop `@monaco-editor/loader` completely — reuse the repo's existing `monaco-editor@^0.57.0` + `public/monaco/vs/` + zero-dependency loader.**
   - `public/monaco/vs/` (151 files, 24.38 MiB on disk, copied by `scripts/copy-monaco-assets.mjs` in `postinstall`, already git-ignored and in `/licenses`) works cleanly under `/python/coi-sw.js` (`COOP: same-origin`, `COEP: require-corp`, page CSP `connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'`) with **0 console errors, 0 page errors, 0 COEP/CORP errors, 0 failed requests, and 0 CSP violations** in Edge, Firefox, and WebKit.
   - **Zero net disk footprint increase** for Monaco (`0 B` added to `public/` / `out/`).
2. **Important Monaco `0.57.0` worker finding (dead code in `lib/notepad/monacoLoader.ts`):**
   - `public/monaco/vs/base/worker/workerMain.js` (referenced by `lib/notepad/monacoLoader.ts:108`) **does not exist** in `monaco-editor@0.57.0`.
   - `public/monaco/vs/editor/editor.main.js` unconditionally overwrites `self.MonacoEnvironment = { getWorker: ... }` when loaded, creating a classic Blob worker that runs `importScripts("<origin>/monaco/vs/assets/editor.worker-_vAIFJDs.js")`.
   - Verified with a real worker-backed diff (`monaco.editor.createDiffEditor` → `diffChanges === 1`) in **Edge, Firefox, and WebKit**: Monaco's classic Blob worker boots, loads `/monaco/vs/assets/editor.worker-_vAIFJDs.js`, and completes RPC cleanly under `COEP: require-corp` in all three engines.
   - **Recommendation:** Promote `lib/notepad/monacoLoader.ts` to a shared `lib/ui/monacoLoader.ts` (re-exported from `lib/notepad/monacoLoader.ts` for Scratchpad compatibility) and remove the dead `workerMain.js` `getSelfHostedWorkerUrl()` pre-hook, leaving a brief comment noting that Monaco `0.57.0`'s `editor.main.js` configures `MonacoEnvironment.getWorker` itself.
3. **`coi-sw.js` allow-list (`/monaco/` and `/fonts/`):**
   - With `/monaco/` and `/fonts/` in `ALLOWED_PREFIXES`, `coi-sw.js` intercepted **every** Monaco script, `editor.main.css`, `python-CasA8BlK.js`, `jetbrains-mono-latin-wght-normal.woff2`, **and** the Blob worker's `importScripts('/monaco/vs/assets/editor.worker-_vAIFJDs.js')` in all 3 browsers, adding `Cross-Origin-Resource-Policy: same-origin`.
   - Even with `/monaco/` and `/fonts/` explicitly bypassed (`swHasMonaco: false`, `swHasFonts: false`, zero CORP header from the origin server), all 3 browsers still loaded every Monaco asset, worker, and font with **0 errors and 0 failed requests** (Fetch/COEP does not require CORP on same-origin subresources). Still, keep `/monaco/` and `/fonts/` in `coi-sw.js`'s `ALLOWED_PREFIXES` (matching `notes-S1.md` §2) for consistent defense-in-depth CORP headers.
4. **xterm.js (`@xterm/xterm@6.0.0`, `@xterm/addon-fit@0.11.0`, `@xterm/addon-web-links@0.12.0`):**
   - All three are **MIT**, have **0 runtime dependencies**, **0 peer dependencies**, and **0 `npm audit --omit=dev` vulnerabilities**.
   - Combined lazy-loaded payload: **357.2 KiB raw / 90.9 KiB gzipped (level 9)**. Ready in **38.7 ms (Edge), 67.1 ms (Firefox), 155.9 ms (WebKit)**.
   - **Next.js Pages Router CSS rule:** Copy `node_modules/@xterm/xterm/css/xterm.css` (7.1 KiB) → `public/python/xterm.css` in the Python `postinstall` copy script (git-ignored) and inject `<link rel="stylesheet" href="/python/xterm.css" data-xterm-css="true">` lazily inside `lib/python/xtermLoader.ts` (awaiting `onload` in parallel with `await import('@xterm/xterm')`), keeping **0 bytes** of xterm CSS on all other routes.
5. **Three critical `@xterm/xterm@6.0.0` gotchas caught live (must handle in P2):**
   - **Light-mode black background leak:** xterm 6.0.0 uses the DOM renderer (no `<canvas>`) and applies `theme.background` to `.xterm-scrollable-element`, leaving `.xterm-viewport` with `xterm.css`'s hardcoded `background-color: #000`. Override `.xterm .xterm-viewport { background-color: transparent !important; }` and set the host wrapper's background to the active theme color.
   - **iOS Safari auto-zoom trap:** Even when `term.options.fontSize = 16`, `.xterm-helper-textarea` stays at browser default **`13px` (WebKit/Firefox) / `13.33px` (Edge)**, which triggers Safari viewport zoom on focus. Fix with `.xterm .xterm-helper-textarea { font-size: 16px !important; }`.
   - **Touch swipe scrolling is broken out of the box in xterm 6.0.0:** xterm 6.0.0 replaced native `.xterm-viewport` scrolling (`scrollHeight === clientHeight`) with VS Code's `.xterm-scrollable-element`, and its bundled `Gesture.addTarget` is **never called** in `xterm.mjs` (verified empirically via CDP `Input.dispatchTouchEvent` in Edge mobile: `viewportY` stayed stuck at `68 → 68` and `0 → 0`). P2 must attach a lightweight `touchstart`/`touchmove` listener calling `term.scrollLines(deltaLines)` (provided in §5).
6. **Performance targets (`architecture.md` §13) passed comfortably:**
   - Editor usable (cold uncached local server through `coi-sw.js`): **487 ms (Edge), 471 ms (Firefox), 291 ms (WebKit)** — even adding ~400 ms on 25 Mbps broadband for Monaco's 1.24 MiB gzipped payload keeps cold editor-usable under ~0.9 s (target `< 2 s`).

---

## 2. Monaco Verification Matrix (Under S1 `coi-sw.js` + `COEP: require-corp`)

| Check | Edge (`msedge`) | Firefox (`1572`) | WebKit (`2388`) | Notes |
|---|---|---|---|---|
| `window.crossOriginIsolated` + `SharedArrayBuffer` | **Pass** (`true`) | **Pass** (`true`) | **Pass** (`true`) | Tier 1 via S1 `coi-sw.js` |
| Console errors / Page errors / CSP violations / Failed reqs | **0 / 0 / 0 / 0** | **0 / 0 / 0 / 0** | **0 / 0 / 0 / 0** | With `/favicon.ico` present |
| Blob worker (`editor.worker-_vAIFJDs.js`) via `createDiffEditor` | **Pass** (`1` diff) | **Pass** (`1` diff) | **Pass** (`1` diff) | Intercepted by `coi-sw.js` in all 3 |
| Skip `/monaco/` & `/fonts/` in SW allow-list (`skipMonacoFonts=1`) | **0 errors** | **0 errors** | **0 errors** | Same-origin needs no CORP; still keep in allow-list |
| Python syntax highlighting (`python-CasA8BlK.js`) | **Pass** (7 `.mtk*`) | **Pass** (7 `.mtk*`) | **Pass** (7 `.mtk*`) | Includes bracket highlighting |
| `setModelMarkers` diagnostic squiggly (`.squiggly-error`) | **Pass** (`1`) | **Pass** (`1`) | **Pass** (`1`) | Ready for worker `ast.parse` markers |
| `KeyMod.CtrlCmd \| KeyCode.Enter` run action | `Ctrl+Enter` (**Pass**) | `Ctrl+Enter` (**Pass**) | `Meta+Enter` (**Pass**) | Bind `WinCtrl \| Enter` too if macOS should also accept `Ctrl+Enter` |
| Theme switching (`vs` / `vs-dark` / `hc-black`) | `#fffffe` / `#1e1e1e` / `#000` | `#fffffe` / `#1e1e1e` / `#000` | `#fffffe` / `#1e1e1e` / `#000` | Matches `components/Notepad/MonacoPane.tsx:46-50` |
| Codicon icons (`editor.main.css` inline `data:font/ttf`) | **Pass** | **Pass** | **Pass** | Zero extra `.ttf` requests; if page CSP ever adds `font-src`, include `data:` |
| Self-hosted `JetBrains Mono Variable` (`/fonts/*.woff2`) | **Loaded** (`true`) | **Loaded** (`true`) | **Loaded** (`true`) | Reuses `styles/design-system.css` `@font-face` |

### Monaco Transfer Sizes (Python Mode, Measured From Server Hits)

21 files loaded on first visit for Python mode (0 additional files on disk beyond existing `public/monaco/vs/`):

| Asset Group | Files | Raw Bytes | Gzip-6 Bytes | Notes |
|---|---:|---:|---:|---|
| Core AMD loader & editor bundles (`loader.js`, `editor.main.js`, `editor-BdtEMBbM.js`, `toggleHighContrast-DuqAmExZ.js`, `editorWorkerHost-B_VpI68A.js`, `index-DZH_zysX.js`, contributions) | 18 | 4,274,648 B (4.08 MiB) | 1,088,954 B (1.04 MiB) | Cached by browser HTTP cache after 1st load |
| `editor/editor.main.css` (includes inlined base64 codicon TTF + SVGs) | 1 | 390,829 B (381.7 KiB) | 127,302 B (124.3 KiB) | Loaded via `<link>` by `editor.main.js` |
| `assets/editor.worker-_vAIFJDs.js` (classic Blob worker payload) | 1 | 275,633 B (269.2 KiB) | 83,185 B (81.2 KiB) | Loaded lazily when worker first runs |
| `python-CasA8BlK.js` (Python Monarch grammar) | 1 | 3,832 B (3.7 KiB) | 1,523 B (1.5 KiB) | Loaded when `language: 'python'` model mounts |
| **Total Monaco Python transfer** | **21** | **4,944,942 B (4.72 MiB)** | **1,300,964 B (1.24 MiB)** | **0 B net `public/` growth** (already 24.38 MiB in `public/monaco/vs/`) |
| Self-hosted font (`jetbrains-mono-latin-wght-normal.woff2`) | 1 | 40,404 B (39.5 KiB) | 40,404 B (WOFF2) | Already in `public/fonts/` |

### Shared Loader Plan (`lib/ui/monacoLoader.ts`)

- Promote `lib/notepad/monacoLoader.ts` to `lib/ui/monacoLoader.ts` (and keep `lib/notepad/monacoLoader.ts` as a thin re-export plus Scratchpad's `latex`/`csv` Monarch registrations, or keep them shared).
- Remove the obsolete `getSelfHostedWorkerUrl()` pointing at `/monaco/vs/base/worker/workerMain.js` (non-existent in Monaco `0.57.0`), because `editor.main.js` sets `self.MonacoEnvironment.getWorker` unconditionally.
- Keep `import type * as MonacoApi from 'monaco-editor'` so `scripts/collect-licenses.mjs` continues automatic MIT licence discovery with zero extra dependencies (`@monaco-editor/loader` is **not** needed).

---

## 3. xterm.js Packages, Licences, Sizes & Next.js CSS Strategy

### Package Audit (`scratch/xterm-spike/`, `npm audit --omit=dev`: 0 vulnerabilities)

| Package | Version | Licence | Runtime Deps | Peer Deps | ESM File | Raw Size | Gzip-9 Size |
|---|---|---|---|---|---|---:|---:|
| `@xterm/xterm` | `6.0.0` | MIT | `0` | `0` | `lib/xterm.mjs` | 344,970 B (336.9 KiB) | 88,307 B (86.2 KiB) |
| `@xterm/xterm` (CSS) | `6.0.0` | MIT | — | — | `css/xterm.css` | 7,112 B (6.9 KiB) | 2,509 B (2.5 KiB) |
| `@xterm/addon-fit` | `0.11.0` | MIT | `0` | `0` | `lib/addon-fit.mjs` | 1,967 B (1.9 KiB) | 805 B (0.8 KiB) |
| `@xterm/addon-web-links` | `0.12.0` | MIT | `0` | `0` | `lib/addon-web-links.mjs` | 3,148 B (3.1 KiB) | 1,484 B (1.4 KiB) |
| **Combined xterm payload** | — | **MIT** | **`0`** | **`0`** | — | **357,197 B (348.8 KiB)** | **93,105 B (90.9 KiB)** |

*Licence compliance:* Adding bare `await import('@xterm/xterm')`, `await import('@xterm/addon-fit')`, and `await import('@xterm/addon-web-links')` in `lib/python/xtermLoader.ts` means `scripts/collect-licenses.mjs` automatically discovers all three MIT packages and adds them to `lib/generated/third-party-licenses.json` (remember to run `npm install` + `npm run check:repo` in P2).

### Next.js Pages Router CSS Strategy

Next.js Pages Router rejects `import '@xterm/xterm/css/xterm.css'` outside `pages/_app.tsx`. Existing repo precedent:
- `katex` renders native MathML (`output: 'mathml'` in `components/KatexSpan.tsx:27`), so it never loads `katex.min.css`.
- `monaco-editor` copies `editor.main.css` to `public/monaco/vs/editor/` via `postinstall` and injects a `<link rel="stylesheet">` lazily on demand.

**Recommended approach (Option A — Lazy self-hosted CSS in `public/python/xterm.css`):**
1. In the Python `postinstall` copy script (`scripts/copy-python-assets.mjs` or `scripts/copy-pyodide-assets.mjs`), copy `node_modules/@xterm/xterm/css/xterm.css` → `public/python/xterm.css` (add `/public/python/xterm.css` to `.gitignore`).
2. In `lib/python/xtermLoader.ts`, inject `<link rel="stylesheet" href="/python/xterm.css" data-xterm-css="true">` (singleton, awaiting `onload`) in `Promise.all` alongside `await import('@xterm/xterm')`, `await import('@xterm/addon-fit')`, and `await import('@xterm/addon-web-links')` **before** calling `term.open(el)`.
3. **Why Option A beats `_app.tsx` or CSS Modules:** Zero bytes added to the 40+ other routes on the site, stays in `/python/` SW scope (automatically gets CORP headers from `coi-sw.js`), never drifts from `@xterm/xterm` upgrades (unlike hand-porting 285 lines into `:global(...)` inside a `.module.css`), and works identically in `next dev` and `next build` static export. *(Fallback Option B: `import '@xterm/xterm/css/xterm.css'` in `pages/_app.tsx` is valid if simplicity is preferred, adding 2.5 KiB gzip site-wide.)*

### xterm Functional Matrix (Under S1 `coi-sw.js` + `COEP: require-corp`)

| Feature | Edge (`msedge`) | Firefox (`1572`) | WebKit (`2388`) | Verified Behavior |
|---|---|---|---|---|
| Lazy `await import()` + lazy CSS `<link>` | **Pass** (`38.7 ms`) | **Pass** (`67.1 ms`) | **Pass** (`155.9 ms`) | 0 errors, 0 CSP violations |
| ANSI SGR colors (`\x1b[32m`, `\x1b[1;31m`) | **Pass** | **Pass** | **Pass** | Buffer line 0: `Green BoldRed` |
| `\r` carriage-return progress bar (`10%\r50%\r100%`) | **Pass** | **Pass** | **Pass** | Buffer line 1: `Progress: 100%` |
| `FitAddon.fit()` on container resize | **Pass** (`148×13 → 60×10 → 148×13`) | **Pass** (`148×13 → 60×10 → 148×13`) | **Pass** (`148×13 → 60×10 → 148×13`) | Pair with `ResizeObserver` + `requestAnimationFrame` |
| `WebLinksAddon` click intercept (`event.preventDefault()`) | **Pass** (`0` popups) | **Pass** (`0` popups) | **Pass** (`0` popups) | Captured `https://example.com/python-docs`; ready for W8 confirm dialog |
| `Ctrl+C` without selection → Stop interrupt | **Pass** (`stopInt: 1`) | **Pass** (`stopInt: 1`) | **Pass** (`stopInt: 1`) | `attachCustomKeyEventHandler` returns `false` when `!term.hasSelection()` |
| `Ctrl+C` with selection (`"Green"`) → Copy | **Pass** (`copyAllow: 1`) | **Pass** (`copyAllow: 1`) | **Pass** (`copyAllow: 1`) | Returns `true` when `term.hasSelection() === true` |
| Self-hosted `JetBrains Mono Variable` | **Pass** | **Pass** | **Pass** | Call `document.fonts.ready` then `fitAddon.fit()` if font swaps late |

---

## 4. Recommended xterm `ITheme` Palettes (Aligned with `styles/design-system.css`)

Mapped directly from `styles/design-system.css` tokens (`--ds-surface-solid`, `--ds-ink`, `--ds-accent`, `--ds-good`, `--ds-warn`, `--ds-bad`):

```ts
import type { ITheme } from '@xterm/xterm';
import type { ResolvedTheme } from '../ui/theme';

export const XTERM_THEMES: Record<ResolvedTheme, ITheme> = {
  light: {
    background: '#ffffff',
    foreground: '#0f172a',
    cursor: '#2563eb',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(37, 99, 235, 0.22)',
    black: '#0f172a', red: '#dc2626', green: '#059669', yellow: '#b45309',
    blue: '#2563eb', magenta: '#9333ea', cyan: '#0891b2', white: '#64748b',
    brightBlack: '#475569', brightRed: '#ef4444', brightGreen: '#10b981', brightYellow: '#d97706',
    brightBlue: '#3b82f6', brightMagenta: '#a855f7', brightCyan: '#06b6d4', brightWhite: '#0f172a',
  },
  dark: {
    background: '#131316',
    foreground: '#fafafa',
    cursor: '#60a5fa',
    cursorAccent: '#081221',
    selectionBackground: 'rgba(96, 165, 250, 0.30)',
    black: '#1c1c21', red: '#f87171', green: '#34d399', yellow: '#fbbf24',
    blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e4e4e7',
    brightBlack: '#71717a', brightRed: '#fca5a5', brightGreen: '#6ee7b7', brightYellow: '#fde047',
    brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#ffffff',
  },
  hc: {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ffe600',
    cursorAccent: '#000000',
    selectionBackground: 'rgba(255, 230, 0, 0.40)',
    black: '#000000', red: '#ff6b6b', green: '#4ade80', yellow: '#ffe600',
    blue: '#60a5fa', magenta: '#f0abfc', cyan: '#22d3ee', white: '#ffffff',
    brightBlack: '#d4d4d4', brightRed: '#ff8a8a', brightGreen: '#86efac', brightYellow: '#fef08a',
    brightBlue: '#93c5fd', brightMagenta: '#f5d0fe', brightCyan: '#67e8f9', brightWhite: '#ffffff',
  },
};
```

Required companion CSS in `styles/Python.module.css` (fixes the two xterm 6.0.0 gotchas):
```css
.terminalHost :global(.xterm .xterm-viewport) {
  background-color: transparent !important;
}
.terminalHost :global(.xterm .xterm-helper-textarea) {
  font-size: 16px !important; /* prevents iOS Safari auto-zoom on focus */
}
```

---

## 5. Phone-Width Viewport (375×812) & Touch Findings (for Q5)

### Layout & Gutter Measurements (`375×812`, `#monaco-host` width `365 px`)

| Mode / Browser | Horizontal Overflow | Monaco Gutter (`contentLeft`) | Minimap Width | Code Width / Cols | Monaco Input `fontSize` | xterm Cols | xterm Textarea `fontSize` |
|---|---|---|---|---|---|---|---|
| **Default** (Edge / FF / WK) | `false` (`375/375`) | **68 px** | 37 px | 260 px (**29 cols** @ 14px) | `14px` *(Safari zooms!)* | 42 / 42 / 41 | **`13.33px` / `13px` / `13px`** *(Safari zooms!)* |
| **Mobile-tuned** (Edge / FF / WK) | `false` (`375/375`) | **33 px** (-51%) | 0 px | 332 px (**32 cols** @ 16px) | **`16px`** (`.native-edit-context` on Edge; `textarea.inputarea` on FF/WK) | 36 | **`13.33px` / `13px` / `13px`** *(needs CSS override!)* |

**Recommended narrow/touch Monaco options (`@media (max-width: 768px)` or `(pointer: coarse)`):**
```ts
{
  fontSize: 16,               // >= 16px prevents iOS Safari auto-zoom on focus
  lineNumbers: 'on',
  lineNumbersMinChars: 3,     // drops gutter from 68px -> 33px
  glyphMargin: false,
  folding: false,
  lineDecorationsWidth: 4,
  minimap: { enabled: false },
  overviewRulerLanes: 0,
  wordWrap: 'on',
  scrollBeyondLastLine: false,
  hover: { enabled: false },  // avoids 277px hover cards covering 375px editor
}
```

### Concrete Touch & Mobile Limitations (for Q5 Page Note & Backlog)

Document these honestly in the `/python/main` limitations note (and backlog for future mobile editor evaluation, e.g. CodeMirror 6 fallback on coarse pointers):

1. **No native mobile selection handles & unreliable double-tap word selection in Monaco:** Double-tap inside Monaco yielded empty selection (`""`) in both Edge mobile and WebKit mobile (`hasTouch: true`). Dragging selection handles and OS copy/paste callouts do not match native `<textarea>` behavior.
2. **Engine split (`EditContext` vs hidden `<textarea>`) & virtual keyboard quirks:** Monaco `0.57.0` uses `<div class="native-edit-context">` on Chromium (`textarea.inputarea` is absent) and `<textarea class="inputarea">` on WebKit/Firefox. Always check focus via `editor.hasTextFocus()`. Mobile autocorrect, swipe typing, and IME composition can occasionally desync cursor/text in Monaco.
3. **Monaco vertical touch scrolling works (`scrollTop: 0 → 188..211 px` via CDP touch swipe in Edge),** but open hover popups (`~277 px` wide on a `375 px` viewport) cover ~75% of the screen and can steal touch gestures — disable hover on coarse pointers.
4. **xterm.js `6.0.0` touch-swipe scrolling does NOT work out of the box:** Verified via CDP `Input.dispatchTouchEvent` in Edge mobile (`viewportY` unchanged `68 → 68` and `0 → 0`); xterm 6's `.xterm-scrollable-element` never calls `Gesture.addTarget`. **Mitigation for P2:** attach a lightweight touch-swipe handler on `.terminalHost` translating vertical finger deltas into `term.scrollLines(lines)` (plus on-screen Scroll-to-bottom / Copy / Clear controls):
   ```ts
   let lastY: number | null = null;
   let remainderPx = 0;
   const LINE_PX = 20;
   host.addEventListener('touchstart', (e) => {
     if (e.touches.length === 1) { lastY = e.touches[0].clientY; remainderPx = 0; }
   }, { passive: true });
   host.addEventListener('touchmove', (e) => {
     if (lastY === null || e.touches.length !== 1) return;
     const dy = lastY - e.touches[0].clientY; // finger up -> scroll down
     lastY = e.touches[0].clientY;
     remainderPx += dy;
     const lines = Math.trunc(remainderPx / LINE_PX);
     if (lines !== 0) {
       remainderPx -= lines * LINE_PX;
       term.scrollLines(lines);
     }
   }, { passive: true });
   host.addEventListener('touchend', () => { lastY = null; }, { passive: true });
   ```
5. **No hardware `Ctrl+Enter`, `Ctrl+C`, or `Tab` on virtual keyboards:** Mobile/touch layouts must provide dedicated on-screen **Run**, **Stop**, **Clear**, **Copy**, and (optional) **Tab/Indent** toolbar controls alongside tabbed panes (Editor, Console, Files, Plots, Display).
6. **Narrow column budget (`32` Monaco cols / `36` xterm cols at `16 px` on `375 px` width):** Long tracebacks and table prints wrap aggressively; keep `wordWrap: 'on'` in Monaco and offer one-tap Copy in Console.

---

## 6. Performance Against `architecture.md` §13 Targets

Measured cold (`Cache-Control: no-store`, uncached local HTTP server through `coi-sw.js` in Tier 1):

| Metric | Target (`architecture.md` §13) | Edge (`msedge`) | Firefox (`1572`) | WebKit (`2388`) | Est. 25 Mbps Broadband Cold |
|---|---:|---:|---:|---:|---:|
| Monaco AMD load (`loader.js` → `editor.main`) | — | 202.2 ms | 411.8 ms | 240.5 ms | ~600–820 ms |
| **Editor usable** (`loadMonaco` → `editor.create` painted) | **`< 2,000 ms`** | **487.4 ms** | **471.0 ms** | **290.6 ms** | **~0.7–0.9 s (Pass)** |
| xterm lazy `import()` + `xterm.css` | — | 29.3 ms | 50.9 ms | 125.2 ms | ~60–155 ms |
| **xterm ready** (`open` + `FitAddon.fit()`) | — | **38.7 ms** | **67.1 ms** | **155.9 ms** | **~0.07–0.19 s (Pass)** |

---

## 7. Exact P2 Implementation Checklist

1. **Monaco:** Promote `lib/notepad/monacoLoader.ts` → `lib/ui/monacoLoader.ts` (drop dead `workerMain.js` hook; re-export from `lib/notepad/monacoLoader.ts`). Do **not** install `@monaco-editor/loader`.
2. **xterm packages:** Add `"@xterm/xterm": "^6.0.0"`, `"@xterm/addon-fit": "^0.11.0"`, `"@xterm/addon-web-links": "^0.12.0"` to `package.json`, run `npm install` (updates `package-lock.json` and `third-party-licenses.json`).
3. **xterm CSS:** Copy `node_modules/@xterm/xterm/css/xterm.css` → `public/python/xterm.css` (git-ignored) in the Python `postinstall` copy script; load lazily in `lib/python/xtermLoader.ts` via `<link rel="stylesheet" href="/python/xterm.css">` before `term.open()`.
4. **xterm v6 fixes:** Apply the two CSS overrides (`.xterm-viewport` transparent bg, `.xterm-helper-textarea` `16px` font-size) and the touch-swipe `term.scrollLines()` handler (§5).
5. **Security & shortcuts:** Wire `WebLinksAddon` handler with `event.preventDefault()` → W8 confirmation modal; wire `Ctrl+C` (`term.hasSelection()` copy vs Stop interrupt) and Monaco `Ctrl+Enter` / `Cmd+Enter` Run action; keep `/monaco/` and `/fonts/` in `coi-sw.js` `ALLOWED_PREFIXES`.
