# Python playground: research

Facts verified on 2026-11-23, with where to re-check them. Re-check version-specific claims before relying on them; a spike's notes file overrides this file where they disagree.

## What was read in the repo

Read: `README.md`, `CLAUDE.md`, `docs/agent-workflow.md` and the repo's top-level file listing. They give the stack (Next.js 16 Pages Router, React 19, TypeScript 7, static export through GitHub Actions), the hard constraints, the conventions for tools, docs and agent work, and the licence (`AGPL-3.0-or-later`).

**Not read:** any other plan in `docs/` (two fetches were refused by the fetch tool), `pages/index.tsx`, the worker code, the copy scripts, the harnesses, `scripts/check-repo.mjs`, `scripts/collect-licenses.mjs`, the workflow file. S0 reads these.

## Pyodide

- Versioning follows the Python version: 314.x is Python 3.14; documentation was at 314.0.7; 315.0.0a2 (Python 3.15) is an alpha. Pin an exact stable release at the start of S2. https://pyodide.org, https://github.com/pyodide/pyodide
- `tkinter`, `turtle.py` and `turtledemo` are on the removed-modules list. `threading` and `multiprocessing` import but do not work. https://pyodide.org/en/stable/usage/wasm-constraints.html
- Pyodide 314 uses PEP 783: wheels tagged `pyemscripten_*` can be published on PyPI and micropip installs them. Pyodide 314.x targets `pyemscripten_2026_0`. About 255 packages are ported and hosted by Pyodide. Only about 28 PyPI packages used the new tags in June 2026, so compiled-package coverage from PyPI is thin. https://peps.python.org/pep-0783/, https://simonwillison.net/2026/Jun/13/publishing-wasm-wheels/, https://pyodide.org/en/latest/development/abi.html
- micropip has `install`, `uninstall`, `list` (name, version, source), `freeze` (a lock file) and `set_index_urls`. It handles pure-Python wheels and Emscripten wheels only. Index URLs must support CORS. https://micropip.pyodide.org/en/latest/project/api.html
- `loadPyodide` options include `packages`, `lockFileURL`, `lockFileContents` and `packageBaseUrl`. `loadPackagesFromImports(code)` loads known packages that code imports. `loadPackage` is faster and more consistent than micropip. https://pyodide.org/en/latest/usage/api/js-api.html
- `pyodide-lock.json` lists each package file with a SHA-256, which a build script can use to download and verify a curated set. Check this in S2.
- JSPI (`pyodide.ffi.run_sync`) allows blocking calls without SharedArrayBuffer. Chromium 137 and later works; Firefox and Safari were reported as unreliable, and a Safari report from October 2026 says `run_sync` crashes the interpreter. https://blog.pyodide.org/posts/jspi/, https://github.com/hmaarrfk/wgpudawn/issues/1
- SDL (pygame-ce) in Pyodide is experimental, needs a main-thread `HTMLCanvasElement` with id `canvas`, supports one canvas, and needs loops that yield with `asyncio.sleep`. https://pyodide.org/en/stable/usage/sdl.html
- Pyodide's matplotlib backends render into DOM elements. https://github.com/rth/matplotlib-pyodide

## Licences

- Pyodide is MPL-2.0. https://github.com/pyodide/pyodide
- MPL-2.0 is file-level copyleft: modified MPL files stay under MPL, the rest of a project may be AGPL-3.0. Section 3.3 lets a Larger Work with a Secondary-Licensed work be distributed under that licence if the MPL code is not marked "Incompatible With Secondary Licenses", and section 1.12 names the AGPL v3 as a Secondary License. https://www.mozilla.org/en-US/MPL/2.0/ (this is not legal advice; the owner decides Q1). S2 checks Pyodide's files for the "Incompatible" notice.

## Hosting

- GitHub Pages cannot set custom response headers; the usual workaround is a service worker that adds COOP and COEP and reloads the page once on the first visit. https://github.com/orgs/community/discussions/13309, https://github.com/gzuidhof/coi-serviceworker
- Under COEP `require-corp`, cross-origin subresources need CORP or CORS, and embedded iframes must be COEP-compatible too.
- A client-side (Next.js router) navigation does not load a new document, so it cannot become isolated. This is an inference from how COOP and COEP work; S1 tests it.
- Service workers and SharedArrayBuffer need a secure context: `localhost` is fine, a LAN address over `http` is not.

## Network policy (CSP)

- `connect-src` governs `fetch()`, XHR, WebSocket, EventSource, `sendBeacon` and `<a ping>`. https://www.w3.org/TR/CSP3/, https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy/connect-src
- WebRTC connections are not governed by the fetch directives; a `webrtc` directive exists only in a spec draft with no browser support yet. https://github.com/w3c/webappsec-csp/issues/92. Whether workers expose `RTCPeerConnection` was not established; S1 tests it.
- Under a CSP, WebAssembly needs `script-src 'wasm-unsafe-eval'`, which is narrower than `'unsafe-eval'`. https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy/script-src. At least one project runs Pyodide with only that `script-src`. https://pypi.org/project/splent-feature-generator/ (not verified for this tool; S1).
- A dedicated worker takes its policy from its own script response (from the CSP specification, not re-verified; S1 tests it in each browser).
- Pyodide documents that Python in the browser has full access to the Web APIs, which is why untrusted code needs a policy. https://github.com/pyodide/pyodide

## Other in-browser Python sites (security)

What public statements say. Not found: security designs of the closed sites (Trinket, online-python.com and similar), and any site that blocks the network by default with a CSP.

- PyScript describes the browser tab as a sandbox; the panel-live security page states that Pyodide runs in a worker with no OS access, that source code is visible to users (do not embed secrets), and that COOP and COEP are an additional layer. https://docs.pyscript.net/2026.2.1/user-guide/architecture/, https://panel-extensions.github.io/panel-live/explanation/security
- jupyter-kit's security model: in-browser executors run untrusted code on the visitor's device; the code can fetch anywhere, read and write `localStorage` and `sessionStorage` of the origin, and post messages to other windows; recommended: click-to-run, strict CSP, an isolated origin without cookies you care about. https://jupyter-kit.walkframe.com/reference/security/
- The Jupyter trust model: no code should run just because a document was opened; untrusted HTML is sanitised and untrusted JavaScript is never executed; trust answers "did the current user do this?". https://ipython.readthedocs.io/en/3.x/notebook/security.html, https://www.sonarsource.com/blog/hidden-security-risks-in-jupyter-notebooks/
- JupyterHub: subdomains are "highly encouraged" for untrusted users, and it points to GitHub's move to `github.io`; a stricter page CSP such as `frame-ancestors: 'none'; sandbox allow-same-origin allow-scripts` is suggested for same-origin deployments. https://jupyterhub.readthedocs.io/en/latest/explanation/websecurity.html
- GitHub moved Pages from `github.com` to `github.io` in 2013 to stop user JavaScript reaching its cookies and to stop phishing under its name. https://github.blog/2013-04-09-yummy-cookies-across-domains/. All Pages sites of one account share `localStorage`: https://tomashubelbauer.github.io/github-pages-local-storage, https://github.com/globus/static-search-portal/releases/tag/1.0.0
- JupyterLite 0.6 put the deployment path into its storage key because deployments on one origin shared files. A user showed in 2021 that Pyodide kernel code could read the page's IndexedDB. https://jupyterlite.readthedocs.io/en/stable/migration.html, https://github.com/jupyterlite/jupyterlite/discussions/91
- One project runs JupyterLite on its own origin because a same-origin frame could read the app's session token, and its review notes that `allow-same-origin` is needed for Pyodide and JupyterLite. https://github.com/theimaginaryfoundation/what-iff/pull/463. A sandboxed frame without `allow-same-origin` has an opaque origin, and service workers do not control such frames. https://github.com/w3c/ServiceWorker/issues/1390
- Notion runs custom blocks in a sandboxed iframe on a dedicated origin with a CSP. https://developers.notion.com/custom-blocks/guides/security.md
- Under cross-origin isolation, an embedded cross-origin iframe document needs COEP (and CORP), the whole chain must be isolated, and the frame needs `allow="cross-origin-isolated"`. https://web.dev/coop-coep, https://developer.chrome.com/blog/coep-credentialless-origin-trial
- Share-by-URL: Shinylive encodes the app's code in the link; marimo offers permalinks and saves notebooks to local storage. https://github.com/insightsengineering/roxy.shinylive/pull/13/files, https://docs.marimo.io/guides/wasm/
- `mcp-run-python` installs dependencies first with write access, then runs untrusted code read-only; `mcp-deno-sandbox` allows network access per host. https://pypi.org/project/mcp-run-python/0.0.2/, https://www.npmjs.com/package/mcp-deno-sandbox
- An NVIDIA article suggests running LLM-generated Python in Pyodide in the user's browser to gain the browser sandbox. https://developer.nvidia.com/blog/sandboxing-agentic-ai-workflows-with-webassembly/

## CPython on WebAssembly

- CPython's `Tools/wasm` documentation lists WASI as tier 2 and Emscripten as tier 3. On Emscripten, sockets do not work, signal support is limited, and pthreads need SharedArrayBuffer. https://github.com/python/cpython/tree/main/Tools/wasm
- Conclusion: a custom interpreter build buys nothing this tool needs. If compiled code is ever needed, build a PyEmscripten wheel with `pyodide build` (no Docker needed).

## Rejected: a full Linux VM

CheerpX's terms do not allow hosting its build yourself, and its free use is limited to individuals and non-commercial use. https://github.com/leaningtech/webvm. v86 is BSD-licensed but emulates a roughly Pentium III machine with large disk images.

## OffscreenCanvas

Supported in Chrome 69, Edge 79, Firefox 105 and Safari 16.4. The placeholder canvas updates during the owning worker's rendering update, so a worker stuck in a synchronous Python loop may never present frames. That is why the display is presented from the page by default. S4 checks it. https://developer.mozilla.org/docs/Web/API/OffscreenCanvasRenderingContext2D

## Reference projects (approach only; do not copy code)

- A worker-based turtle shim: Python in a worker sends drawing commands to a main-thread renderer. https://github.com/aaqidmasoodi/CodeScapes (its licence was not checked; it mentions commercial licensing).
- A hosted site that runs tkinter-style programs on Pyodide with DOM-drawn windows: https://www.online-python.com/tkinter. It shows the approach is possible; its source was not confirmed open.
- A Brython tkinter port reports that some widgets (Text) and blocking dialogs were hard or impossible. https://github.com/PierreQuentel/tkinter. With SharedArrayBuffer, blocking dialogs are feasible here.

## Changes from the first draft

- The repo is a Next.js static export with its own conventions, so this plan uses `docs/python/` parts under 40 kB, a harness in `scripts/harness/python/`, step sizes under about 200k tokens, one agent at a time, and per-step commits on a branch.
- "No third-party requests" and "self-hosted only" in CLAUDE.md make the network **off by default**, with PyPI installs possible only in a Package index mode the visitor turns on for one page load (D13), and make the Pyodide packages a build-time download into `public/` (Q3).
- The repo is AGPL-3.0-or-later (the draft said undecided), and Pyodide's MPL-2.0 is outside the approved list (Q1).
- Layouts must work at phone width (the draft said desktop-first).
- Entering from the home page must be a full page load, and a phone on a LAN address gets tier 3.
- The PDF viewer reuses `lib/pdf/pdfjs.ts` instead of the `/pdf/reader` page.
- Tests are harness checks, not unit tests or Playwright suites added to the site.

- A security and warnings part was added: network policy with modes and a fail-closed self-test, no runtime code in script-writable storage, hardened viewers and messages, and warnings W1 to W8 ([security.md](security.md)).

- A second research pass on other in-browser Python sites added the origin decision (D17, Q8), the rules on forged messages and trusted UI (D18), extra headers (D19), the supply-chain notes and Clear all data (W9).
