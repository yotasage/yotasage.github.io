# Python Playground — Phase 2 Verification Notes (`P2b`)

Verified on branch `python` against the real Next.js static export (`npm run build:export` -> `out/` served on `http://localhost:3023` with zero server-added security headers) using `npm run ui` ([scripts/harness/python/ui.mjs](../../scripts/harness/python/ui.mjs)), re-verified with `npm run check` ([scripts/harness/python/check.mjs](../../scripts/harness/python/check.mjs)) after the `tiers.ts` / `coi-sw.js` fixes, and confirmed with root `npm run verify`.

## 1. 3-Browser UI Harness Summary (`39 passed, 0 failed`)

| Check | Edge 158.0.4370.33 | Firefox 159.0 | WebKit 27.2 |
| --- | --- | --- | --- |
| Home card (`<a href="/python/main">`) -> `/python/main` (`crossOriginIsolated === true`, 0 errors) -> Home (`crossOriginIsolated === false`) & `/licenses` (Pyodide, Humor Sans / SIL OFL-1.1, FreeType, Adobe AFM, `@xterm/xterm`) | Pass | Pass | Pass |
| W1 first-visit blocking dialog (Scratchpad + W9 + `python:ack-v1` persistence, no worker/Pyodide fetch before ack) & collapsible W2 status note | Pass | Pass | Pass |
| Desktop (`1280×800`): Monaco + Pyodide Ready (`< 15 s`), Run + `input()` (`"The program asks:"`) + NumPy | Pass (`1,277 ms`) | Pass (`1,259 ms`) | Pass (`1,341 ms`) |
| Desktop: REPL tab shares `__main__` namespace from previous Run (D9) | Pass | Pass | Pass |
| Desktop: `ZeroDivisionError` clean traceback (no Pyodide internal frames) & clickable line-jump chip | Pass | Pass | Pass |
| Desktop: Stop infinite loop (`while True: pass`, `< 2 s`) | Pass (`61 ms`) | Pass (`62 ms`) | Pass (`134 ms`) |
| Themes (Light/Dark, zero `#000000` `.xterm-viewport` leak in Light mode) & EN ↔ NB language toggle | Pass | Pass | Pass |
| Security: crafted `?net=all` -> W4 on-load dialog blocks worker/Pyodide (`0` fetches) & Reload with network off -> Off mode (no W3 banner) | Pass | Pass | Pass |
| Security: `?net=pkg` -> W4 on-load approval -> W3 banner (`pypi.org`, `files.pythonhosted.org`, Reload off) + W8 external link dialog (`https://example.com/check`, `0` popups on Cancel) | Pass | Pass | Pass |
| Security: Network settings dialog host validation (rejects `127.0.0.1`, `*.example.com`; accepts `api.example.com`) & `"Everything"` red checkbox gate | Pass | Pass | Pass |
| Security: W9 Clear all data removes `python:*` storage, caches, IndexedDB, unregisters `/python/` SW (first reload `fromServiceWorker === false`), re-isolates, and re-shows W1 | Pass | Pass | Pass |
| Security: W7 fail-closed (`serviceWorkers: 'block'`) keeps Run disabled until `"Run anyway"` is explicitly clicked | Pass | Pass | Pass |
| Phone (`375×812`, `hasTouch: true` on Edge/WebKit): zero horizontal overflow, Editor/Console tabs, Run + `input()` via phone bar, 0 console/page errors | Pass | Pass | Pass |

## 2. Engine & Security Regression Check (`npm run check`: `78 passed, 0 failed`)

- **Part A (Pure-Node):** `6 / 6` PASS.
- **Part B (3-Browser):** `72 / 72` PASS across Edge 158.0.4370.33, Firefox 159.0, and WebKit 27.2 (`SoftStop` median `0.4 ms` / `0.6 ms` / `1.0 ms`; `ForceStop` warm restart `1,137.4 ms` / `1,716.3 ms` / `1,222.7 ms`).

## 3. Real Bugs Uncovered & Fixed During P2b

1. **Edge/Chromium COOP `sessionStorage` reload-guard bug after W9 Clear all data ([lib/python/tiers.ts](../../lib/python/tiers.ts), [components/Python/NetworkDialog.tsx](../../components/Python/NetworkDialog.tsx), [components/Python/PythonPlayground.tsx](../../components/Python/PythonPlayground.tsx)):**
   - Navigating from a `COOP: same-origin` load back to an un-isolated `/python/main` after `r.unregister()` + `window.location.replace('/python/main')` caused Chromium to restore the pre-COOP browsing context group's `sessionStorage` snapshot where `python:coi-reload-attempted` was still `'1'`, blocking the post-reinstall reload and stranding the user out of Tier 1.
   - Fixed by disposing the live Python worker before SW unregistration (`onBeforeClear`) and allowing a single reload in `registerPythonServiceWorker` whenever a brand-new SW just installed (`!hadControllerAtStart && Boolean(reg.installing || reg.waiting)`), preserving full infinite-reload-loop protection when an already-installed SW fails to isolate.
2. **WebKit `Load failed` pageerror during first-visit SW reload ([components/Python/PythonPlayground.tsx](../../components/Python/PythonPlayground.tsx)):**
   - Mounting `<PythonEditor>` and `<PythonTerminal>` before `swSettled` caused Monaco ES modules to start fetching and then abort mid-flight when `coi-sw.js` triggered its single guarded reload, surfacing an unhandled `Load failed` error in WebKit. Deferred mounting editor/terminal until `swSettled` (showing the loading placeholder in the meantime).
3. **`ToolHeader` flag SVGs missing from SW CORP allowlist ([public/python/coi-sw.js](../../public/python/coi-sw.js)):**
   - Added `'/flags/'` to `ALLOWED_PREFIXES` so `/flags/gb.svg` and `/flags/no.svg` receive `Cross-Origin-Resource-Policy: same-origin` under `/python/main`'s `COEP: require-corp`.
4. **Live REPL continuation indicator ([components/Python/PythonTerminal.tsx](../../components/Python/PythonTerminal.tsx)):**
   - Synced a `replContinuation` React state alongside `replContinuationRef` so the fallback REPL input bar immediately switches `>>>` to `...` on multi-line blocks.
