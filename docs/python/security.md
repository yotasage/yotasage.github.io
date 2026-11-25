# Python playground: security and warnings

The tool runs code the visitor typed, pasted or uploaded. Treat that code as untrusted, because sooner or later someone will run code written by somebody else. This part says what the code can reach, how the network is switched off by default, how the page defends itself, and which warnings the visitor sees. It is a design to be checked by S1 and the harness, not a record of working code.

## 1. What code run in this tool can reach

Code runs in a Web Worker. Pyodide gives Python full access to the browser's Web APIs that a worker has.

| Reachable | What |
|---|---|
| Always | Files the visitor puts in the tool; the tool's own settings and package list; CPU, memory and the browser's storage quota for the whole site |
| If stored in the shared site storage | Whatever other tools of this site keep in IndexedDB, OPFS or Cache Storage, and whatever any **other GitHub Pages repository of the same account** keeps there (all of them share one origin). **S0 lists what each tool and repository stores**, so the warning text can be exact |
| Not reachable from the worker | Files opened in other tools (they live in those pages' memory), `localStorage`, `sessionStorage`, cookies, the DOM, the clipboard, camera, microphone, location |
| Only if the network is open | Sending anything the code can reach to any server; contacting devices on the visitor's local network; downloading more code |

So the main risk is **files the visitor puts into this tool, and anything this site has saved in IndexedDB, OPFS or Cache Storage**. Files used in other tools are not reachable directly. The warning texts (section 7) say exactly this, and the wording is finalised after S0.

## 2. Network policy: off by default

### 2.1 Modes

| Mode | `connect-src` of the page and the worker | Effect |
|---|---|---|
| **Off** (default) | `'self'` | `fetch`, XHR, WebSocket, EventSource and `sendBeacon` to other sites are blocked. Same-origin requests still work. `micropip` and `pyodide.http.pyfetch` to other sites fail |
| **Package index** | `'self' https://pypi.org https://files.pythonhosted.org` | `micropip` can install from PyPI. Nothing else is reachable |
| **Selected hosts** | `'self'` plus up to 5 typed `https://` hostnames | For a program that needs one or two APIs. Each host is shown in the banner |
| **Everything** | no restriction | For code the visitor trusts. Red warnings. Needs a tick-box confirmation |

### 2.2 How it is applied

GitHub Pages cannot send headers, so the service worker (`public/python/coi-sw.js`) adds them, to the page **and to the worker script's response** (a dedicated worker takes its policy from its own script response; S1 verifies this in each browser).

- **Page:** `connect-src <mode>; form-action 'self'; base-uri 'self'; frame-ancestors 'none'`, plus a `Permissions-Policy` that denies camera, microphone, geolocation and the other powerful features the tool never uses, and `Referrer-Policy: no-referrer`. `frame-ancestors` works only as a header, which is why the service worker sets it: no other site can frame the tool. No `script-src` on the page, because the Next.js export uses inline scripts. The page is our own code; the policy is defence in depth against a bug in it.
- **Worker:** stricter. `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src <mode>; img-src 'self' blob: data:; font-src 'self'; worker-src 'none'`. `'wasm-unsafe-eval'` is what lets WebAssembly load under a CSP, and at least one other project runs Pyodide under exactly that `script-src`. Leaving out `'unsafe-eval'` also stops `js.eval` and `new Function` in the worker, which shrinks what hostile code can do (`pyodide.code.run_js` fails too; the page's limits text says so). S1 checks that Pyodide still works and adds `'unsafe-eval'` only if it must. `worker-src 'none'` stops user code from starting nested workers or shared workers.
- **Nested workers get the strict policy.** The service worker gives a relaxed policy only to a worker script requested by a **window** whose URL carries the same mode. It looks the requester up with `clients.get(event.clientId)`, which needs no stored state. If `event.clientId` is empty or does not resolve to a `window` client, it falls back to Off (S1 verifies this across Edge, Firefox and WebKit for module worker fetches). A worker requested by a worker always gets Off.

### 2.3 The mode lives in the URL, for one page load

The mode is **not stored**. Anything stored by the tool in the browser could be rewritten by the code it runs, which would let a script turn the network on for the next visit. Instead:

- The URL carries it: `/python/main` is Off; `?net=pkg`, `?net=hosts&hosts=api.example.com,b.org` and `?net=all` are the others. The service worker reads the URL when it serves the page and the worker.
- The setting is chosen in a **Network** dialog (Settings). Choosing a mode other than Off shows the confirmation (W4 below), then the page does a **full page load** with the new URL ("after a page reload").
- **Whenever the page loads with a mode other than Off, it shows a blocking confirmation before it starts the runtime** (W4, load version). This covers a crafted link such as `?net=all` shared by someone else. "Reload with network off" navigates to the plain URL. No Python runs before the visitor chooses.
- Closing the tab and opening the tool again gives Off. There is no "remember my choice" (backlog item only if the owner wants it, with the downside stated).
- Hostnames are validated: `https` only, plain DNS names, no wildcards, no IP addresses, at most 5.

### 2.4 It fails closed

User code could unregister the service worker (service workers are reachable from workers in some browsers), or the service worker may be missing (private mode, first visit). So the tool never assumes the policy is in force:

1. Before the first run, and each time a worker starts, the worker probes a cross-origin address and waits for the `securitypolicyviolation` event. Because an offline browser also rejects `fetch()` with a `TypeError` without firing `securitypolicyviolation`, S1 tests both online and offline states (and evaluates a header-check fallback or offline handling) so offline visitors are not falsely locked out by W7. (If a browser does not fire the event in workers, S1 finds another test, for example reading back the policy header from the worker script response.)
2. If the mode is Off and the block cannot be confirmed, **Run is disabled** and the visitor sees W7: reload to repair, or run anyway after an explicit confirmation.
3. The page registers the service worker again on every load, and when it reloads to repair it does so at most once.

### 2.5 What CSP does and does not cover

- `connect-src` covers `fetch()`, XHR, WebSocket, EventSource, `sendBeacon` and `<a ping>`, and some sources say WebTransport as well.
- **WebRTC is not covered.** Its connections do not go through the fetch directives; a `webrtc` CSP directive exists only in a spec draft, with no browser support yet. Whether a worker exposes `RTCPeerConnection` differs by browser: **S1 tests it in Edge, Firefox and WebKit.** Defence in depth: delete `RTCPeerConnection` and related constructors from the worker's global object before Python starts (best effort), and `worker-src 'none'` prevents a fresh worker global from supplying them.
- So "Off" is a strong barrier that the browser enforces, **not a mathematical guarantee**. The page says "the browser blocks…", never "impossible".

### 2.6 Other ways out, closed by design

- **Navigation and links.** `webbrowser.open` is disabled in Off; otherwise it opens only after a confirmation showing the full URL. Links printed in the terminal ask the same way in every mode (a URL can carry data).
- **The message channel.** The page never fetches, navigates or opens a URL because the worker asked. Worker messages are data (section 4).
- **Other tabs of this site.** Code could post to a `BroadcastChannel` or `SharedWorker` that another tool listens on. S0 checks whether any tool uses them; the Python tool uses names under `python:` only.
- **Clipboard and downloads.** Write-only, and only from a visitor's click; never read the clipboard.

### 2.7 Packages

- Off: bundled packages, uploaded wheels and **saved copies of kept PyPI wheels** (D20: bytes stored locally and checked against the page-only manifest's SHA-256; nothing is fetched). The install box says so. User code calling `micropip.install` gets an empty index list from `yotasage_rt` (no request at all, which also avoids WebKit's never-settling blocked fetch) and a clear "network access is off" error.
- Package index: `micropip` works against the two hosts above. All Pyodide packages are served from the site itself, so no CDN is needed. `yotasage_rt` refuses any index or wheel URL outside those hosts (and the site's own origin) before fetching. Online installs from the page (panel, requirements import) exist only in this mode (D21); in Everything mode the panel says to reload in Package index mode.
- Packages installed by user code in Package index mode need no W6; they are marked "installed by code", last for the session and can never be kept (D23). Keeping a package takes the visitor's click.
- Page-started installs are a `pkg.install` worker operation between runs, refused while a run is active (D24). In a Tier 1 run, `micropip.install` raises at once instead of hanging. No worker message can keep, restore or install anything: `pkg.result` and `pkg.list.result` are validated data (names, hashes, `files.pythonhosted.org` URLs only).
- Importing a `requirements.txt` or a lock file never installs anything the current mode cannot reach; it shows what was skipped and why.

## 3. Storage and cache rules

- Every key and database name is namespaced (`python:`; one IndexedDB database `python-playground`).
- **Never run code from storage that user code can write.** Cache Storage and IndexedDB are writable by the worker. Therefore: runtime code (Pyodide, the service worker's own files) is not kept in Cache Storage. It comes from the HTTP cache, or from a precache whose entries are checked against a build-time SHA-256 list on every use (S1 decides; if neither is cheap, the tool simply works online-only after the first visit).
- The service worker serves only URLs on a build-time allow-list, never arbitrary cache hits, so a fake entry written into a cache under an in-scope URL is never served.
- Bundled and downloaded packages are verified against the lock file's SHA-256 before installation. Uploaded wheels are hashed when stored and again when used.
- Kept packages are **restored lazily** (before the first run or console line after each worker start) and shown in the list, never silently at boot. The manifest lives in `localStorage` `python:packages-v1`, which the worker cannot reach (D22); only wheel bytes live in IndexedDB (`python-playground` v2, store `wheels`), and bytes are installed only when their SHA-256 matches that manifest. Edited IndexedDB therefore cannot install anything the manifest and the mode do not allow. (P5b: the page hashes the saved bytes before every use; `wheel-worker.js` hashes them on every put and runs under the Off worker CSP; user code has no `localStorage`, checked in all three browsers.)
- Caps: file size, workspace size, number of plots and open tabs, with notices and Force stop. Show storage use. The storage quota is shared by all tools of the site, so a script that fills it affects the other tools; the cap is what protects them.

## 4. Hardening the page against worker output

Everything from the worker is untrusted input.

- Every message is validated against the protocol types and a size limit; a bad message is dropped and logged, never thrown into the UI.
- No `innerHTML` or `dangerouslySetInnerHTML` for anything the worker supplies (file names, tracebacks, titles, widget text). Use text nodes.
- **SVG** is shown through `<img>` (scripts do not run there), never through `<object>`, `<iframe>` or inline.
- **HTML output** is shown in an iframe with `sandbox=""` (no scripts). An "allow scripts" switch uses `sandbox="allow-scripts"` plus a meta CSP in the `srcdoc` that blocks all connections. Never `allow-same-origin`, `allow-top-navigation` or `allow-popups`.
- **PDF** through `lib/pdf/pdfjs.ts` with scripting and eval switched off. S0 checks how that module is configured and reports if it needs a change.
- **Widget surface (P9):** elements are made with `createElement` from a fixed list of types; Python can set only validated properties; no `href` or `src` from Python except `blob:` or `data:` URLs made from the virtual file system; no arbitrary CSS.
- **Zip import:** reject entries with `..` or absolute paths, limit the number and total size of entries (zip bombs), and never overwrite files outside the workspace.
- **No "open code from a URL" and no share-by-link in v1.** Code never runs without the visitor pressing Run.
- **Assume every worker message can be forged.** Python reaches `self.postMessage` through the `js` module and no page can hide it. So no message from the worker may change the network mode, open a link, start an install, write outside the workspace or draw outside the program-output areas. A message carries data to display, never a command with authority.
- **Trusted UI stays outside program output.** Dialogs, banners, the Network dialog and every warning are drawn by the page outside the Console, Plots and Display panels. Those panels are framed and labelled "Program output", and nothing a program draws can overlap or imitate the trusted UI (a program could otherwise show a fake "enter your password" or a fake network dialog). `input()` prompts are labelled "The program asks:".

## 5. Resource abuse

Infinite loops, memory bombs and huge files mostly harm the visitor's own tab. Force stop works on all of them and caps limit files, workspace size and live plots. Because 32-bit WASM linear memory limits and browser OOM killers usually terminate the worker abruptly (or throw `WebAssembly.RuntimeError`) without a reliable pre-warning, the page detects unexpected worker crashes and offers a clean one-click restart while keeping persisted files. A script cannot affect other tabs except through the shared storage quota (section 3).

## 6. Residual risks (said plainly on the page)

- WebRTC may bypass the block in a browser that exposes it to workers (S1 measures).
- Browser bugs in CSP or in the service worker.
- In "Everything" mode nothing is blocked: this is the visitor's choice, with the warnings.
- Social engineering: someone convinces a visitor to paste code, turn the network on and run it. The warnings are the only defence there.
- With the tool on the site's own origin (section 9, option A), code can read whatever other tools and other Pages repositories of the account keep in IndexedDB, OPFS or Cache Storage. S0 lists it; the owner decides whether that is acceptable (Q8).
- The site's promise is worded exactly: **"The site never uploads your files. Code you run here can, if you allow network access."**

## 7. Warnings: where, and what they say

English drafts below. The implementing step writes the Norwegian texts; `check:repo` requires parity. Final wording is settled with the owner (Q6) and after S0.

| ID | Where | When |
|---|---|---|
| W1 | Blocking dialog "Before you start" | First visit, and again when the text changes. Acknowledgement kept in `localStorage` (the worker cannot write it) under `python:ack-v1` |
| W2 | Note at the top of the page | Always (the repo's "honest note" rule): what works, what is checked, what is not done |
| W3 | Banner under the header | Whenever the mode is not Off, with a "Reload with network off" button |
| W4 | Confirmation dialog | When the visitor chooses a mode other than Off, and again on load when the URL asks for one |
| W5 | Small notice when a file is added | `.py`, `.whl`, `.zip`, `.html` added to the workspace: "Files you add can run code when you press Run." |
| W6 | Dialog before an install | Package index mode: name, version, host, "A package runs code when it is imported" |
| W7 | Dialog when the block cannot be confirmed | Fail-closed case of section 2.4 |
| W8 | Confirmation | Opening any link from program output, showing the full URL |
| W9 | Settings, next to **Clear all data**, and one sentence in W1 | Always visible there |

**W1.** "This tool runs Python code in your browser. Only run code you wrote or understand. Code written by someone else can read, change and delete every file you put in this tool, and any notes or files saved in Scratchpad on this site (including open Scratchpad tabs). While network access is off, which is the default, your browser blocks the code from sending anything to the internet. If you turn network access on, the code can send those files to any server you allow. This site never uploads your files itself." Never type passwords or other secrets into a program.

**W2.** "Runs Python locally in your browser (Pyodide). Network access is off by default. [Current capability tier and what is checked vs. not yet implemented—updated at each phase.]"

**W3 (everything).** "Network access is ON for all sites. Code you run can send your files anywhere. [Reload with network off]"
**W3 (package index).** "Network access: package index only (pypi.org, files.pythonhosted.org)."
**W3 (hosts).** "Network access: {hosts} only."

**W4.** "Turn on network access? After the page reloads, code you run here can connect to {PyPI | these sites: {hosts} | any site}. It can send the files in this tool to those servers and download more code. Turn it on only for code you trust. It turns off again every time you open the tool without choosing it. [Reload with network on] [Cancel]" (Everything adds a tick-box: "I understand that code can send my files anywhere.") The on-load version replaces the first sentence with "This link turned network access on." and its buttons are "Continue with network on" and "Reload with network off". The runtime does not start until one is pressed.

**W5.** "Files you add (`.py`, `.whl`, `.zip`, `.html`) can run code when you press Run. Only add files you trust."

**W6.** "Install package `{name}` (`{version}`) from `{host}`? A package runs code when it is imported. Only install packages you trust. [Install] [Cancel]"

**W7.** "The browser's network block could not be confirmed, so code you run now might be able to reach the internet. [Reload to repair] [Run anyway]"

**W8.** "Open external link from program output? `{full_url}` Links can carry data from your session. Only open links you trust. [Open link] [Cancel]"

**W9.** "Your files and package list stay in this browser until you delete them. On a shared computer, use Clear all data. A private window forgets everything when it is closed."

## 8. Checks (in `scripts/harness/python/`)

With the mode Off, each of these must fail while a same-origin request to `/python/...` succeeds. They run in Edge, Firefox and WebKit:

- cross-origin `fetch`, XHR, WebSocket, EventSource, `sendBeacon`; `importScripts` and dynamic `import()` of a cross-origin script; `new FontFace` with a cross-origin URL; starting a nested worker; WebRTC if the worker exposes it;
- from Python: `micropip.install` of a PyPI package, `pyodide.http.pyfetch`, `urllib.request`, `webbrowser.open`.

Also:

- Package index mode reaches PyPI and nothing else; Selected hosts reaches only its hosts.
- Removing the service worker from inside the worker makes the next load fail closed (Run disabled, W7 shown).
- A crafted `?net=all` link shows W4 and starts no Python before it is answered.
- A fake entry written into Cache Storage under an in-scope URL is not served.
- Malformed and oversized worker messages leave the page working; an SVG and an HTML output containing script do not run in the default viewers; a zip with `../` paths is rejected.
- Framing the page from another site is blocked (`frame-ancestors`), and the `Permissions-Policy` and `Referrer-Policy` headers are present on the page.
- A script that posts forged protocol messages cannot change the network mode, open a link, start an install, write outside the workspace or draw outside the program-output areas.
- **Clear all data** removes the tool's database, its caches and its service worker registration.
- Every warning in section 7 exists in both EN and NB and appears in the stated situations.

## 9. Where the tool lives (origin)

Every tool of the site, and every other GitHub Pages repository the account publishes, shares one origin: `localStorage`, IndexedDB, caches and service worker scope all belong to it. Other sites that run untrusted code treat this as the main design question (section 11): GitHub itself moved user pages from `github.com` to `github.io` in 2013 so that user JavaScript could not reach its cookies and could not borrow its name for phishing, and JupyterHub's documentation says subdomains are "highly encouraged" when untrusted users are served.

Two things that look like fixes are not:

- **A sandboxed iframe** gives an opaque origin with no cookies or storage, but then Pyodide cannot persist files, and service workers do not control such frames (a sandboxed JupyterLite needs `allow-same-origin`, which removes the isolation).
- **A cross-origin iframe with the runtime** needs cross-origin isolation to hold across the frame: the iframe document must carry COEP and CORP headers, the whole chain must be isolated and the frame needs `allow="cross-origin-isolated"`. A second GitHub Pages site cannot send those headers on its first load.

So the choices are:

| Option | What it means | Cost | Gain |
|---|---|---|---|
| **A** (proposal for v1) | The tool stays on `yotasage.github.io` with the hardening of this part | None extra | Reuses the shared UI, `/licenses`, i18n, `lib/pdf` and the single deployment |
| **B** | The tool is its own top-level site on a second origin (another GitHub account or organisation, or a custom domain), linked from the home page | A second repository and deployment; the shared UI, i18n, `/licenses` and PDF viewer must be duplicated or shared by a build step | Nothing from other tools is reachable; its own storage and service worker; share-by-link becomes possible |

Rule: use A for v1 **if S0's inventory finds nothing in shared IndexedDB, OPFS or Cache Storage that the owner would mind losing**, and no other Pages repository with data worth protecting. The runtime names its origin in one place (`lib/python/origin.ts`) so that B stays possible. **Before any share-by-link or "open code from a URL" feature, B is required.** This is Q8.

## 10. Supply chain and data left behind

- **Build time.** Pin exact versions of `pyodide`, `monaco-editor`, `@monaco-editor/loader` and `@xterm/xterm`; rely on the `package-lock.json` integrity values; check the downloaded Pyodide packages against the SHA-256 values in `pyodide-lock.json` (Q3); run `npm audit --omit=dev` when adding or upgrading them and put the result in the step's notes; never edit vendored files by hand.
- **Data left behind.** Files and the package list stay in the browser until deleted. A **Clear all data** button in Settings removes the tool's IndexedDB database, its caches and its service worker registration, then reloads (after a confirmation). W9 says so. A private window forgets everything when it is closed.

## 11. What other in-browser Python sites do

Sources are in [research.md](research.md). I found public security statements from a few projects, not from the closed sites (Trinket, online-python.com and similar); those publish no security design that I could find.

| Practice | Who | What we do |
|---|---|---|
| "The browser is the sandbox": code runs client-side, in a worker, with no OS access; a worker crash does not crash the page; do not embed secrets | PyScript docs, panel-live, an NVIDIA article on using Pyodide to isolate LLM-generated code | Same base. It is **not enough alone**: those pages do not cover the page's own storage or the network, which is why the network policy and section 9 exist |
| In-browser code is "untrusted code on the visitor's device": it can fetch anywhere, read and write the origin's `localStorage` and `sessionStorage`, and post messages to other windows. Hardening: click-to-run, strict CSP, isolated origin with no cookies you care about | jupyter-kit's security model | Click-to-run only; CSP with the network off; the origin decision (Q8) |
| Nothing runs just because a document was opened; untrusted HTML is sanitised and untrusted JavaScript never executes. The question is "did the current user do this?" | The Jupyter trust model | Run is always a click; HTML output is script-free; no open-from-URL |
| Untrusted code on a dedicated origin, often in a sandboxed iframe with a CSP | Notion custom blocks; GitHub Pages (`github.io`); JupyterHub subdomains; one project that moved JupyterLite to its own origin after seeing a same-origin frame could read the app's session token | Section 9 |
| Storage keys include the deployment path, because deployments on one origin shared files | JupyterLite 0.6 | One namespace, `python:`, one database name |
| Share-by-URL (the code is in the link) | Shinylive, marimo permalinks | Not in v1; needs option B first |
| Install phase separate from the run phase; network allowed per host | `mcp-run-python` (dependencies installed first with write access, untrusted code then runs read-only); `mcp-deno-sandbox` (`--allow-net=host,host`) | Package index and Selected hosts modes; kept packages restore lazily with hash checks |

Also relevant: JupyterLite kernels run in a Web Worker, and a Pyodide kernel can reach the page's IndexedDB (a user did it in 2021). I found **no site that blocks the network by default with a CSP**, so that part of the design has no precedent to lean on: S1 and the checks of section 8 carry the weight.

## 12. Open questions (resolved 2026-11-24)

- **Q6 (resolved):** W1–W9 draft wording approved (with W1 updated after S0 to name Scratchpad); W1 appears once and again when its text changes.
- **Q7 (resolved):** Keep the "Everything" mode behind the red banner and the tick-box confirmation.
- **Q8 (resolved after S0):** Option A for v1 (stay on `yotasage.github.io` with the explicit Scratchpad warning in W1; owner confirmed no other GitHub Pages repositories under `github.com/yotasage`). `lib/python/origin.ts` keeps Option B possible, and Option B remains required before any share-by-link.
