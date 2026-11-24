# Python Playground: S2 Pyodide Self-Hosting & Boot Spike Notes

Verified empirically on branch `python` (no product code, `package.json`, or `public/` modified) using a self-contained spike workspace preserved in the conversation scratch directory (`scratch/pyodide-spike/`) for immediate reuse by S3. Boot, CSP, and corpus tests ran against a zero-header static server on `http://localhost:3023` with S1's exact `coi-sw.js` across **Edge 158.0.4370.33**, **Firefox 159.0**, and **WebKit 27.2** via `playwright-core`.

---

## 1. Headline Findings & Decisions

1. **Pinned release:** **`pyodide@314.0.8`** (`latest` dist-tag, published `2026-11-13T21:27:32Z`). Ships **Python 3.14.2**, **Emscripten 5.0.3** (`emscripten_5_0_3`), ABI **`2026_0`** (`pyemscripten_2026_0_wasm32`). Note: the core glue file in 314.x is **`pyodide.asm.mjs`** (not `.asm.js`).
2. **`npm audit --omit=dev`:** **`found 0 vulnerabilities`** (3 packages total: `pyodide@314.0.8`, `ws@8.23.0` [MIT], `@types/emscripten@1.41.6` [MIT]).
3. **`'unsafe-eval'` is NOT required.** Pyodide 314.0.8 + `micropip`, `numpy`, `pillow`, `matplotlib`, and all 6 no-I/O example corpus tasks boot and pass 100% under S1's exact worker CSP (`script-src 'self' 'wasm-unsafe-eval'`, with `eval('1+1')` verified blocked) across **Edge, Firefox, and WebKit** with **0 CSP violations** and **0 outbound cross-origin requests**.
4. **Compact footprint & fast CI download:**
   - Core (4 files + trimmed 4.1 KiB lock): **13.42 MB (12.80 MiB)**.
   - Curated 13 wheels (`micropip`, `numpy`, `matplotlib`, `pillow` + transitive deps): **13.38 MB (12.76 MiB)**, downloaded & SHA-256 verified in **1.8 s** (idempotent re-run: **0.37 s**).
   - Total `public/pyodide/`: **26.80 MB (25.56 MiB)**. Projected `out/` export = **~137 MB** (**13.7%** of GitHub Pages' 1 GB limit).
   - Q4 optional packages (`scipy`, `pandas`, `sympy` + `mpmath`) add **+22.56 MB** (all BSD-3-Clause, 0 initial boot impact; projected `out/` **~160 MB** / 16% of 1 GB).
5. **Q1 MPL-2.0 compatibility confirmed + bundled licence flags:**
   - Pyodide's MPL-2.0 files carry **no** Exhibit B `"Incompatible With Secondary Licenses"` notice (confirmed compatible with repo `AGPL-3.0-or-later` under MPL-2.0 §3.3).
   - **Zero** GPL-only or LGPL-only libraries anywhere in the curated closure.
   - **Flagged for owner awareness (§6):** `Humor-Sans.ttf` (injected into `matplotlib` by Pyodide's recipe with no licence file in the wheel), plus permissive non-MIT/BSD sub-libraries (`libtiff 4.4.0`, `bzip2 1.0.6`, `BaKoMa` CM fonts, `Adobe AFM` metrics, `CC0-1.0` / `Public Domain` in SQLite/liblzma/NumPy).

---

## 2. Pinned Pyodide Package & Core Files

Checked via `npm view pyodide dist-tags --json`: `latest: "314.0.8"`, `stable-0.29: "0.29.5"`, `next: "315.0.0-alpha.2"`.

| File in `node_modules/pyodide/` | Size (bytes) | Size (MiB) | Copied to `public/pyodide/`? | Role |
|---|---:|---:|:---:|---|
| `pyodide.mjs` | 17,758 | 0.017 | **Yes** | ESM loader imported by worker |
| `pyodide.asm.mjs` | 1,250,259 | 1.192 | **Yes** | Emscripten 5.0.3 JS runtime glue |
| `pyodide.asm.wasm` | 9,597,892 | 9.153 | **Yes** | CPython 3.14.2 + Emscripten WASM core |
| `python_stdlib.zip` | 2,545,550 | 2.428 | **Yes** | Python 3.14.2 standard library (614 entries) |
| `pyodide-lock.json` | 119,077 | 0.114 | **Trimmed** (4,209 B) | Filtered to curated closure only |
| `pyodide.js`, `*.map`, `*.d.ts`, `console*.html`, `README.md`, `package.json` | 346,041 | 0.330 | No | Unused at runtime (classic JS, types, maps, demo HTML) |

*Notes:*
- `node_modules/pyodide/` does **not** ship a `LICENSE` file in its npm `files` array (`package.json` declares `"license": "MPL-2.0"`). For `/licenses`, keep the verbatim upstream MPL-2.0 text from `https://raw.githubusercontent.com/pyodide/pyodide/314.0.8/LICENSE` in `lib/python/licenses/LICENSE.pyodide-mpl2.txt`.
- In 314.0.8, `pyodide-lock.json` contains 357 packages (346 `package` + 11 `shared_library`, zero `cpython_module`). Stdlib modules `sqlite3`, `lzma`, `bz2`, `hashlib`, `ctypes`, `csv`, `asyncio`, `urllib`, `json` are already built into `pyodide.asm.wasm` + `python_stdlib.zip`. `tkinter` and `turtle` are absent (expected; P10–P11 territory).

---

## 3. Asset Pipeline (`scripts/copy-pyodide-assets.mjs`)

### Release host & download behavior
- **Canonical URL template** (extracted from `pyodide.mjs`):
  `https://cdn.jsdelivr.net/pyodide/v${version}/full/${file_name}`
- GitHub Releases (`github.com/pyodide/pyodide/releases/tag/314.0.8`) only hosts whole archives (`pyodide-314.0.8.tar.bz2` is 321.86 MiB), not individual wheels. Downloading the 13 curated wheels directly from Pyodide's jsDelivr release host and verifying each file's **SHA-256** against `node_modules/pyodide/pyodide-lock.json` took **1,812 ms** (4 concurrent fetches) and transfers only **12.76 MiB**.
- `scripts/check-repo.mjs` only scans `pages/`, `components/`, `lib/`, `styles/` for CDN URLs (not `scripts/`), so build-time download in `scripts/copy-pyodide-assets.mjs` complies cleanly with both Q3 and `check:repo`.
- **CI impact (`.github/workflows/nextjs.yml`):** Adding ~2 s to `npm ci` on Ubuntu Node 22 does **not** require a new `actions/cache` step. Every write uses an atomic `.tmp-${pid}` → `renameSync` path, exact-case filenames from `pyodide-lock.json`, and 3-attempt retry with backoff.
- **`.gitignore`:** Add `/public/pyodide/` (never `/public/python/`, because `public/python/coi-sw.js` and `public/python/python-worker.js` are tracked in git).

### Curated closure (13 packages)

Computed transitively from roots `['micropip', 'numpy', 'matplotlib', 'pillow']`:

| Package | Version | Wheel filename | Size (bytes) | Size (MiB) |
|---|---|---|---:|---:|
| `contourpy` | 1.3.3 | `contourpy-1.3.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl` | 118,874 | 0.113 |
| `cycler` | 0.12.1 | `cycler-0.12.1-py3-none-any.whl` | 8,321 | 0.008 |
| `fonttools` | 4.62.1 | `fonttools-4.62.1-py3-none-any.whl` | 1,152,647 | 1.099 |
| `kiwisolver` | 1.5.0 | `kiwisolver-1.5.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl` | 36,616 | 0.035 |
| `matplotlib` | 3.10.8 | `matplotlib-3.10.8-cp314-cp314-pyemscripten_2026_0_wasm32.whl` | 6,982,033 | 6.659 |
| `micropip` | 0.11.1 | `micropip-0.11.1-py3-none-any.whl` | 115,486 | 0.110 |
| `numpy` | 2.4.6 | `numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl` | 2,960,568 | 2.823 |
| `packaging` | 26.1 | `packaging-26.1-py3-none-any.whl` | 95,852 | 0.091 |
| `pillow` | 12.2.0 | `pillow-12.2.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl` | 1,037,806 | 0.990 |
| `pyparsing` | 3.3.2 | `pyparsing-3.3.2-py3-none-any.whl` | 122,781 | 0.117 |
| `python-dateutil` | 2.9.0.post0 | `python_dateutil-2.9.0.post0-py2.py3-none-any.whl` | 229,892 | 0.219 |
| `pytz` | 2026.1.post1 | `pytz-2026.1.post1-py2.py3-none-any.whl` | 510,489 | 0.487 |
| `six` | 1.17.0 | `six-1.17.0-py2.py3-none-any.whl` | 11,050 | 0.011 |
| **Total (13 wheels)** | — | — | **13,382,415** | **12.762** |

### Verified `scripts/copy-pyodide-assets.mjs` prototype

Tested on Windows (Node 26.12.1) and uses only Node 22 built-ins (`node:crypto`, `node:fs`, `node:path`, `node:url`, global `fetch`). Run before `collect-licenses.mjs` in `package.json` `postinstall`:

```js
// Copies Pyodide core runtime files from node_modules/pyodide/ into public/pyodide/,
// downloads the curated package closure from Pyodide's release host with SHA-256
// verification against pyodide-lock.json, and writes a trimmed pyodide-lock.json
// so runtime loadPackage() resolves locally with zero third-party requests.
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync,
  renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', 'pyodide');
const destDir = join(root, 'public', 'pyodide');

const CORE_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip'];
const CURATED_PACKAGES = ['micropip', 'numpy', 'matplotlib', 'pillow'];
const CONCURRENCY = 4;

const sha256Buffer = (buf) => createHash('sha256').update(buf).digest('hex');
const sha256File = (p) => sha256Buffer(readFileSync(p));

function computeClosure(lockPackages, roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const key = queue.shift();
    if (seen.has(key)) continue;
    const entry = lockPackages[key];
    if (!entry) throw new Error(`copy-pyodide-assets: "${key}" not found in pyodide-lock.json`);
    seen.add(key);
    for (const dep of entry.depends ?? []) queue.push(dep);
  }
  return [...seen].sort();
}

async function downloadWithRetry(url, expectedSha256, destPath, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const actual = sha256Buffer(buf);
      if (actual !== expectedSha256) {
        throw new Error(`SHA-256 mismatch for ${url}: expected ${expectedSha256}, got ${actual}`);
      }
      const tmpPath = `${destPath}.tmp-${process.pid}`;
      writeFileSync(tmpPath, buf);
      renameSync(tmpPath, destPath);
      return buf.length;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

if (!existsSync(pkgDir)) {
  console.warn('pyodide is not installed; skipping the copy of Pyodide assets.');
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const releaseBase = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
mkdirSync(destDir, { recursive: true });

const expectedFiles = new Set(['pyodide-lock.json']);
let coreBytes = 0;
let coreCopied = 0;
for (const file of CORE_FILES) {
  expectedFiles.add(file);
  const src = join(pkgDir, file);
  const dst = join(destDir, file);
  if (!existsSync(src)) throw new Error(`copy-pyodide-assets: missing core file ${src}`);
  const srcSize = statSync(src).size;
  coreBytes += srcSize;
  if (existsSync(dst) && statSync(dst).size === srcSize && sha256File(dst) === sha256File(src)) {
    continue;
  }
  copyFileSync(src, dst);
  coreCopied += 1;
}

const fullLock = JSON.parse(readFileSync(join(pkgDir, 'pyodide-lock.json'), 'utf8'));
const closureKeys = computeClosure(fullLock.packages, CURATED_PACKAGES);
const trimmedPackages = {};
const queue = closureKeys.map((key) => {
  const entry = fullLock.packages[key];
  trimmedPackages[key] = entry;
  expectedFiles.add(entry.file_name);
  return entry;
});

let pkgBytes = 0;
let pkgDownloaded = 0;
async function runWorker() {
  while (queue.length > 0) {
    const entry = queue.shift();
    const dst = join(destDir, entry.file_name);
    if (existsSync(dst) && sha256File(dst) === entry.sha256) {
      pkgBytes += statSync(dst).size;
      continue;
    }
    pkgBytes += await downloadWithRetry(`${releaseBase}${entry.file_name}`, entry.sha256, dst);
    pkgDownloaded += 1;
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => runWorker()));

const lockText = JSON.stringify({ info: fullLock.info, packages: trimmedPackages });
const lockDst = join(destDir, 'pyodide-lock.json');
if (!existsSync(lockDst) || readFileSync(lockDst, 'utf8') !== lockText) writeFileSync(lockDst, lockText);

for (const name of readdirSync(destDir)) {
  if (!expectedFiles.has(name)) rmSync(join(destDir, name), { recursive: true, force: true });
}

const totalMB = ((coreBytes + pkgBytes + Buffer.byteLength(lockText, 'utf8')) / 1e6).toFixed(2);
console.log(
  `Pyodide ${version}: copied ${coreCopied}/${CORE_FILES.length} core, `
  + `downloaded ${pkgDownloaded}/${closureKeys.length} packages (${totalMB} MB total in public/pyodide).`,
);
```

---

## 4. Size Budget vs GitHub Pages 1 GB Limit & Q4 Optional Packages

### Q4 optional package sizing (HEAD-verified against `v314.0.8/full/`)

| Optional set | Added packages (beyond curated 13) | Extra size (bytes) | Extra size (MB / MiB) | Licence | Initial boot impact |
|---|---|---:|---:|---|---|
| `+ scipy` | `scipy` 1.18.0 (`depends: ["numpy"]`) | 13,870,724 | 13.87 MB / 13.23 MiB | BSD-3-Clause | 0 ms (lazy) |
| `+ pandas` | `pandas` 3.0.2 (`depends: ["numpy", "python-dateutil", "pytz"]`) | 4,149,566 | 4.15 MB / 3.96 MiB | BSD-3-Clause | 0 ms (lazy) |
| `+ sympy` | `sympy` 1.14.0 + `mpmath` 1.4.1 | 4,543,123 | 4.54 MB / 4.33 MiB | BSD-3-Clause | 0 ms (lazy) |
| **All three combined** | 4 wheels (`scipy`, `pandas`, `sympy`, `mpmath`) | **22,563,413** | **22.56 MB / 21.52 MiB** | All BSD-3-Clause | **0 ms (lazy)** |

*Note:* In Pyodide 314.0.8, `scipy` does not depend on `libopenblas` as a separate `shared_library` zip (its BLAS/LAPACK symbols are statically linked inside the 13.87 MB wheel), and `pandas` reuses `numpy`, `python-dateutil`, and `pytz` already in the curated closure.

### Total projected `out/` export size vs GitHub Pages 1 GB cap

| Component | Size (MB) | Notes |
|---|---:|---|
| Existing `public/` baseline (S0 §3) | 95.5 | Already includes `public/monaco/` (24.38 MB), OCR (37.98 MB), PDF WASM (17.86 MB) |
| Next.js `.next`/HTML/JS chunks + `@xterm/xterm` (S6 est.) | ~15.0 | Conservative upper bound |
| Pyodide 314.0.8 core (4 files + trimmed lock) | 13.4 | Uncompressed on disk |
| Curated 13 wheels (`micropip`, `numpy`, `matplotlib`, `pillow` + deps) | 13.4 | Uncompressed `.whl` zips |
| **Projected `out/` (curated set)** | **~137.3 MB** | **13.7% of 1 GB limit** (~863 MB headroom) |
| **Projected `out/` (+ `scipy`, `pandas`, `sympy`)** | **~159.9 MB** | **16.0% of 1 GB limit** (~840 MB headroom) |

**Q4 recommendation:** Both size (~160 MB total, 16% of 1 GB) and initial boot time (0 ms penalty since packages load lazily) are easily acceptable if the owner wants `scipy`, `pandas`, and `sympy` offline; keeping the initial curated 13-package set (`26.8 MB`) for v1 and flipping one array line in `copy-pyodide-assets.mjs` later is trivial.

---

## 5. Worker Boot, CSP `'unsafe-eval'` Verdict, Timings & Corpus Results

### How the worker imports Pyodide under Turbopack
Per S1 §1, Turbopack cannot bundle the worker entry because it places chunks under `/_next/static/chunks/` (outside `/python/` SW scope) and strips `{ type: 'module' }`. The verified pattern is:
1. Track the module worker entry directly under `public/python/python-worker.js` (or emit a tiny build artifact there in P1), spawned by `new Worker('/python/python-worker.js', { type: 'module' })`.
2. Inside the worker, resolve same-origin URLs from `self.location.origin` and dynamically import Pyodide:
   ```js
   const origin = self.location.origin;
   const { loadPyodide } = await import(new URL('/pyodide/pyodide.mjs', origin).href);
   const pyodide = await loadPyodide({
     indexURL: new URL('/pyodide/', origin).href,
     lockFileURL: new URL('/pyodide/pyodide-lock.json', origin).href,
   });
   ```

### CSP `'unsafe-eval'` verdict: **NOT NEEDED**
- Under S1's exact `coi-sw.js` (mode **Off**: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self' blob: data:; font-src 'self'; worker-src 'none'`):
  - `eval('1 + 1')` threw `EvalError` (`evalBlocked: true`) in Edge, Firefox, and WebKit.
  - S1's fail-closed CSP probe (`https://csp-probe.invalid/`) passed (`cspSelfTestOk: true`) in all 3 browsers.
  - Booting Pyodide, loading `micropip`, `numpy`, `pillow`, `matplotlib`, and executing all 6 corpus tasks produced **0 CSP violations** and **0 outbound cross-origin requests** in all 3 browsers.
- *Implementation note:* `pyodide.asm.mjs` contains 6 `eval(` call sites (Emscripten's dynamic `ASM_CONSTS` / `__em_js__` side-module hooks, `_emscripten_run_script*`, and a Node-only script loader). Neither Pyodide core nor the curated wheels hit any of them; only a future third-party C/C++ wheel using `EM_ASM`/`EM_JS` macros would trigger an `EvalError`. Keep `'unsafe-eval'` out of the worker CSP.

### Cross-browser boot & package load timings (localhost, `Cache-Control: public, max-age=600`)

Cold = fresh browser context (empty HTTP cache, includes first-visit SW install + single reload before worker starts; times below are inside the isolated worker). Warm = page reload in the same context (HTTP cache + SW warm).

| Metric | Edge 158.0.4370.33 (cold / warm) | Firefox 159.0 (cold / warm) | WebKit 27.2 (cold / warm) |
|---|---:|---:|---:|
| `crossOriginIsolated` + `SAB` | `true` / `true` | `true` / `true` | `true` / `true` |
| `eval` blocked / CSP violations | `true` / `0` | `true` / `0` | `true` / `0` |
| Outbound cross-origin requests | `0` | `0` | `0` |
| Server hits (cold → warm reload) | `24 → 4` | `24 → 2` | `23 → 5` |
| `import('/pyodide/pyodide.mjs')` | 6 ms / 3 ms | 121 ms / 14 ms | 17 ms / 2 ms |
| `loadPyodide()` core boot | 1,164 ms / 1,084 ms | 1,146 ms / 1,360 ms | 1,350 ms / 1,096 ms |
| **Total core boot (`import` + `loadPyodide`)** | **1,170 ms / 1,087 ms** | **1,267 ms / 1,374 ms** | **1,367 ms / 1,098 ms** |
| `loadPackage('micropip')` | 84 ms / 84 ms | 86 ms / 106 ms | 87 ms / 75 ms |
| `loadPackage('numpy')` | 139 ms / 128 ms | 165 ms / 175 ms | 168 ms / 103 ms |
| `loadPackage('pillow')` | 47 ms / 44 ms | 54 ms / 61 ms | 62 ms / 36 ms |
| `loadPackage('matplotlib')` *(reusing numpy + pillow)* | 278 ms / 259 ms | 332 ms / 384 ms | 254 ms / 224 ms |
| Matplotlib first Agg plot → PNG | 1,483 ms / 1,514 ms | 1,580 ms / 1,836 ms | 1,397 ms / 1,358 ms |
| Pillow draw + PNG & JPEG save | 18 ms / 21 ms | 19 ms / 32 ms | 17 ms / 16 ms |

*Observations:*
- On localhost (0 ms RTT), warm boot times are dominated by WASM instantiation + CPython startup (~1.1–1.4 s), while HTTP server hits drop from 23–24 to 2–5 — confirming browser HTTP caching works cleanly over a real network without Cache Storage.
- Matplotlib's first render (~1.4–1.8 s) includes first-time font discovery/import overhead; subsequent plots in the same session are much faster.

### No-I/O example corpus verification (all 3 browsers, cold & warm)

| # | Corpus check | Result (Edge / Firefox / WebKit) | Verified output |
|---|---|---|---|
| 1 | `print("hello")` | **Pass / Pass / Pass** | `stdout === "hello"` |
| 2 | Exception with traceback (`1 / 0` inside `boom()`) | **Pass / Pass / Pass** | `ZeroDivisionError: division by zero` with `boom` frame |
| 3 | NumPy trapezoidal integral vs JS reference (`n=1001`) | **Pass / Pass / Pass** | `absDiff = 8.88e-16` (`< 1e-12`, bit-identical across all 3 engines) |
| 4 | Matplotlib `Agg` sine plot → `BytesIO` PNG | **Pass / Pass / Pass** | Valid 8-byte PNG signature, `16,670` bytes (identical across all 3 engines) |
| 5 | Pillow `Image.new` + `ImageDraw` → PNG & JPEG `BytesIO` | **Pass / Pass / Pass** | Valid PNG (`303` B) + valid JPEG (`FFD8`, `1,936` B) |
| 6 | `csv.writer` / `csv.reader` round trip (commas & quotes) | **Pass / Pass / Pass** | Exact `parsed == rows` match |

---

## 6. Q1 Licence Audit

### A. Pyodide MPL-2.0 "Incompatible With Secondary Licenses" check
- Inspected all text files in `node_modules/pyodide/` (`package.json`, `pyodide.mjs`, `pyodide.asm.mjs`, `README.md`) and upstream `pyodide/pyodide@314.0.8` (`LICENSE`, `README.md`, `src/js/pyodide.ts`, `src/core/main.c`, `src/core/pyproxy.c`, `src/py/pyodide/__init__.py`).
- **Verdict: COMPATIBLE with `AGPL-3.0-or-later`.** Exhibit B appears **only** as verbatim boilerplate appendix text at the end of the standard MPL-2.0 `LICENSE` file; no Pyodide source file, `README.md`, or `package.json` attaches Exhibit B. Under MPL-2.0 §3.3, unmodified Pyodide files served separately from `public/pyodide/` with upstream source links on `/licenses` are fully compatible with the repo's `AGPL-3.0-or-later` licence.

### B. npm & curated Python wheels (all 13 wheels inspected via `.dist-info/METADATA` & `LICENSE*`)

| Package | Version | Licence | Upstream URL | Q1 Status |
|---|---|---|---|---|
| `pyodide` (npm) | 314.0.8 | MPL-2.0 | https://github.com/pyodide/pyodide/tree/314.0.8 | Approved (Q1) |
| `ws` (npm dep of pyodide) | 8.23.0 | MIT | https://github.com/websockets/ws | Approved (not shipped to browser) |
| `@types/emscripten` (npm dep) | 1.41.6 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped | Approved (types only) |
| `micropip` | 0.11.1 | MPL-2.0 (vendors `packaging`: Apache-2.0 OR BSD-2-Clause, MIT hatch parser) | https://github.com/pyodide/micropip | Approved (Q1) |
| `numpy` | 2.4.6 | `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0` | https://github.com/numpy/numpy | Approved (see sub-libs below) |
| `matplotlib` | 3.10.8 | Matplotlib (PSF-based) | https://github.com/matplotlib/matplotlib | Approved (Q1; see fonts/C libs below) |
| `Pillow` | 12.2.0 | MIT-CMU (HPND) | https://github.com/python-pillow/Pillow | Approved (Q1; see C libs below) |
| `contourpy` | 1.3.3 | BSD-3-Clause | https://github.com/contourpy/contourpy | Approved |
| `cycler` | 0.12.1 | BSD-3-Clause | https://github.com/matplotlib/cycler | Approved |
| `fonttools` | 4.62.1 | MIT *(note: `LICENSE.external` mentions SIL OFL-1.1 test fonts, but 0 font files are in the wheel)* | https://github.com/fonttools/fonttools | Approved |
| `kiwisolver` | 1.5.0 | BSD-3-Clause (Modified BSD) | https://github.com/nucleic/kiwi | Approved |
| `packaging` | 26.1 | Apache-2.0 OR BSD-2-Clause | https://github.com/pypa/packaging | Approved |
| `pyparsing` | 3.3.2 | MIT | https://github.com/pyparsing/pyparsing | Approved |
| `python-dateutil` | 2.9.0.post0 | Apache-2.0 OR BSD-3-Clause | https://github.com/dateutil/dateutil | Approved |
| `pytz` | 2026.1.post1 | MIT | https://github.com/stub42/pytz | Approved |
| `six` | 1.17.0 | MIT | https://github.com/benjaminp/six | Approved |

### C. Bundled C / C++ / Font sub-libraries (verified in `.wasm`, `.so`, Emscripten 5.0.3 ports, and wheel contents)

| Bundled library | Where bundled | Version | Licence | Upstream URL |
|---|---|---|---|---|
| **CPython** | `pyodide.asm.wasm` + `python_stdlib.zip` | 3.14.2 | PSF-2.0 | https://github.com/python/cpython/tree/v3.14.2 |
| **Emscripten** runtime | `pyodide.asm.mjs` / `.wasm` | 5.0.3 | MIT OR NCSA (elect MIT) | https://github.com/emscripten-core/emscripten/tree/5.0.3 |
| **musl libc** | Emscripten sysroot in `.wasm` | Emscripten 5.0.3 | MIT | https://musl.libc.org/ |
| **zlib** | `pyodide.asm.wasm`, Pillow | 1.3.1 | Zlib | https://github.com/madler/zlib |
| **bzip2** | `pyodide.asm.wasm` | 1.0.6 | bzip2-1.0.6 (BSD-like) | https://sourceware.org/bzip2/ |
| **XZ / liblzma** | `pyodide.asm.wasm` | 5.2.2 | Public Domain / 0BSD | https://tukaani.org/xz/ |
| **Zstandard (zstd)** | `pyodide.asm.wasm` | 1.5.7 | BSD-3-Clause (dual w/ GPL-2.0; elect BSD-3) | https://github.com/facebook/zstd |
| **SQLite** | `pyodide.asm.wasm` | 3.39.0 | Public Domain (`blessing`) | https://www.sqlite.org/ |
| **Expat** | `pyodide.asm.wasm` | 2.7.3 | MIT | https://github.com/libexpat/libexpat |
| **libffi** | `pyodide.asm.wasm` | Pyodide 314.0.8 | MIT | https://github.com/libffi/libffi |
| **libmpdec** | `pyodide.asm.wasm` | CPython 3.14.2 | BSD-2-Clause | https://www.bytereef.org/mpdecimal/ |
| **FreeType** | Pillow `_imagingft.so`, matplotlib `ft2font.so` | 2.13.3 | **FTL** (dual w/ GPL-2.0; elect FTL — **credit line required**) | https://freetype.org/ |
| **libjpeg (IJG)** | Pillow `_imaging.so` (Emscripten port) | 9f | **IJG License** (acknowledgement required) | https://www.ijg.org/ |
| **libpng** | Pillow `_imaging.so` (Emscripten port) | 1.6.55 | libpng License (zlib-like) | https://libpng.sourceforge.io/ |
| **libtiff** | Pillow `_imaging.so` (`LIBTIFF, Version 4.4.0`) | 4.4.0 | libtiff License (MIT/BSD-like) | https://gitlab.com/libtiff/libtiff |
| **libwebp** | Pillow `_webp.so` | 1.2.2 | BSD-3-Clause | https://chromium.googlesource.com/webm/libwebp |
| **Anti-Grain Geometry (Agg)** | matplotlib `_backend_agg.so` | 2.4 | Modified BSD (BSD-3-Clause) | https://github.com/matplotlib/matplotlib |
| **Qhull** | matplotlib `_qhull.so` | bundled in mpl | Qhull License (BSD-like) | http://www.qhull.org/ |
| **NumPy C sub-libs** (`libdivide`, `pythoncapi-compat`, `Highway`, `dragon4`, `x86-simd-sort`, `pocketfft`, `lapack_lite`, PRNGs, `splitmix64`) | `numpy` `.so` files | bundled in 2.4.6 | BSD-3-Clause, 0BSD, MIT, Apache-2.0, Zlib (`libdivide`), NCSA/BSD-3 (`random`), CC0-1.0 (`splitmix64`, Highway `random-inl.h`) | https://github.com/numpy/numpy |
| **DejaVu / Bitstream Vera / Arev fonts** | `matplotlib/mpl-data/fonts/ttf/` | bundled in 3.10.8 | Bitstream Vera License + Public Domain | https://dejavu-fonts.github.io/ |
| **STIX fonts** | `matplotlib/mpl-data/fonts/ttf/` | bundled in 3.10.8 | **SIL OFL-1.1** | https://www.stixfonts.org/ |
| **BaKoMa Computer Modern TTF fonts** (`cmb10..cmtt10.ttf`) | `matplotlib/mpl-data/fonts/ttf/` | 1.1 / 1.2 | **BaKoMa Fonts Licence** (permissive, notice required) | https://ctan.org/pkg/bakoma-fonts |
| **Adobe 14 PDF Core Font AFM metrics** | `matplotlib/mpl-data/fonts/pdfcorefonts/` & `afm/` | bundled in 3.10.8 | **Adobe AFM permissive notice** | https://github.com/matplotlib/matplotlib |
| **ColorBrewer / Solarized / Yorick colormaps** | `matplotlib` data | bundled in 3.10.8 | Apache-2.0 / MIT / BSD-style | https://github.com/matplotlib/matplotlib |
| **Humor Sans font** (`Humor-Sans.ttf`) | `matplotlib/mpl-data/fonts/ttf/` (injected by Pyodide recipe) | 1.0 | **FLAGGED — see box below** | https://github.com/pyodide/pyodide-recipes |

*Confirmed absent:* **OpenSSL is NOT linked** into `pyodide.asm.wasm` (zero `OpenSSL` strings; `ssl` is stubbed in browser WASM). `lcms2`, `openjpeg`, `libimagequant`, and `xcb` are disabled in Pyodide's Pillow recipe.

> [!WARNING]
> **Q1 Licence Flag — Items outside literal `MIT / BSD / Apache-2.0 / ISC / PSF / HPND / MPL-2.0`:**
>
> 1. **Already explicitly approved by owner in Q1:** MPL-2.0 (Pyodide, micropip), PSF-2.0 (CPython), Matplotlib PSF-based licence, HPND/MIT-CMU (Pillow), FreeType FTL (with credit line: *"Portions of this software are copyright © The FreeType Project (www.freetype.org). All rights reserved."*), libjpeg IJG, libpng, zlib, Qhull, Agg 2.4, DejaVu (Bitstream Vera), STIX (SIL OFL-1.1 — also already used by the site's Inter & JetBrains Mono fonts).
> 2. **Additional permissive sub-libraries discovered by S2 audit (recommend owner acknowledgement before P1/P2):**
>    - **`libtiff 4.4.0`** (`libtiff` custom permissive MIT/BSD-like licence, compiled into `PIL/_imaging.so`).
>    - **`bzip2 1.0.6`** (`bzip2-1.0.6` BSD-like permissive licence, compiled into `pyodide.asm.wasm`).
>    - **`BaKoMa Fonts Licence`** (`cmb10..cmtt10.ttf` inside `matplotlib`, permissive with notice requirement).
>    - **`Adobe AFM` permissive notice** (`pdfcorefonts/readme.txt` inside `matplotlib`).
>    - **`CC0-1.0` & `Public Domain`** (`SQLite 3.39.0`, `liblzma 5.2.2`, NumPy `splitmix64` & Highway `random-inl.h` — repo already ships CC0-1.0 Newstroke font & CGATS001 ICC profile).
> 3. **NEEDS EXPLICIT OWNER SIGN-OFF — `Humor-Sans.ttf` inside Pyodide's `matplotlib` wheel:**
>    - Pyodide's `matplotlib` build recipe explicitly copies `extras/Humor-Sans-1.0.ttf` into `matplotlib/mpl-data/fonts/ttf/Humor-Sans.ttf` (for `plt.xkcd()`).
>    - Inside the TTF binary, the copyright string reads `"Copyright (c) Randall Munroe's biggest fan 2009. Created by www.fontifier.com. usa-1lip-4fvu15"`, and the wheel ships **no separate `LICENSE` file** for it (Debian's `fonts-humor-sans` ships it as SIL OFL-1.1, while upstream matplotlib itself does not bundle it for provenance clarity).
>    - Because Q1 mandates serving wheels unmodified, either (a) owner accepts `Humor-Sans.ttf` as bundled in unmodified Pyodide `matplotlib` with an entry on `/licenses`, or (b) owner decides whether to exclude/strip it (which would break SHA-256 lockfile verification and require re-signing the wheel).

### D. Concrete `scripts/collect-licenses.mjs` `python[]` structure (for P1/P2)

Follow the exact pattern of `viewer[]` / `pdfWasm[]` / `pcb[]` in `scripts/collect-licenses.mjs`:
1. Keep upstream licence texts that are absent from `node_modules/` in small checked-in files under `lib/python/licenses/` (each well `< 40 KiB`):
   - `LICENSE.pyodide-mpl2.txt` (Pyodide 314.0.8 MPL-2.0 verbatim)
   - `LICENSE.cpython-psf2.txt` (CPython 3.14.2 PSF-2.0)
   - `LICENSE.freetype-ftl.txt` (FTL + mandatory credit line)
   - `LICENSE.matplotlib-notices.txt` (Matplotlib 1.3+, DejaVu, STIX OFL-1.1, BaKoMa, Adobe AFM, Qhull, Agg 2.4)
   - `LICENSE.pillow-native.txt` (Pillow MIT-CMU, IJG libjpeg 9f, libpng, libtiff, libwebp, zlib)
   - `LICENSE.wasm-core-libs.txt` (Emscripten 5.0.3, musl, bzip2, xz/liblzma, zstd, SQLite, Expat, libffi, libmpdec)
2. In `scripts/collect-licenses.mjs`, build a `python` array only when `resolvePackage('pyodide', root)` exists:
   - Read exact Pyodide version from `node_modules/pyodide/package.json` and curated wheel versions from `public/pyodide/pyodide-lock.json` (falling back to `node_modules/pyodide/pyodide-lock.json`).
   - Emit entries matching `{ name, version?, license, url, text }`:
     - `Pyodide` (`version`, `MPL-2.0`, separate-files unmodified note + `https://github.com/pyodide/pyodide/tree/${version}` source link)
     - `CPython (in Pyodide)` (`3.14.2`, `PSF-2.0`)
     - `Emscripten & Core WASM C Libraries (musl, zlib, bzip2, liblzma, zstd, SQLite, Expat, libffi, libmpdec)`
     - `micropip` (`0.11.1`, `MPL-2.0`)
     - `NumPy & Bundled C/Math Libraries` (`2.4.6`, `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`)
     - `Pillow & Image Codecs (FreeType, libjpeg 9f, libpng, libtiff, libwebp, zlib)` (`12.2.0`, `MIT-CMU / FTL / IJG / libpng / libtiff / BSD-3-Clause / Zlib` — prominently includes the FreeType credit line)
     - `matplotlib, Fonts & Plotting Libraries (Agg 2.4, Qhull, FreeType, DejaVu, STIX, BaKoMa, Adobe AFM, Humor Sans)` (`3.10.8`)
     - `Curated Python Support Packages (contourpy, cycler, fonttools, kiwisolver, packaging, pyparsing, python-dateutil, pytz, six)` (versions read from lockfile, MIT/BSD/Apache-2.0)
   - Note: because the worker loads `/pyodide/pyodide.mjs` via dynamic `import(url)` (not a bare `import 'pyodide'`), `collect-licenses.mjs` will not duplicate `pyodide` in `packages[]`. If TypeScript adds `import type ... from 'pyodide'`, skip `'pyodide'` in `packages[]` so it appears solely in `python[]`.
3. Add `python` to the JSON output (`{ packages: list, assets, pdfWasm, viewer, pcb, qr, fonts, python }`) and render a new `<section>` in `pages/licenses.tsx` with EN/NB headings in `lib/ui/i18n/`.

---

## 7. Handoff Notes for S3, P1 & P2

- **Scratch reuse for S3:** `C:\Users\Jonat\.gemini\antigravity\brain\accb938e-e67e-4dc9-a5aa-f6d77e1c5d01\scratch\pyodide-spike\` is preserved intact with:
  - `public-pyodide/` (Pyodide 314.0.8 core + all 13 verified curated wheels + trimmed lockfile)
  - `site/python/coi-sw.js`, `site/python/python-worker.js`, `site/python/s2.html`
  - `run-s2-browsers.mjs` (zero-header localhost:3023 static server + Playwright Edge/Firefox/WebKit runner)
  S3 can immediately extend `site/python/python-worker.js` and `run-s2-browsers.mjs` to benchmark `SharedArrayBuffer` blocking `input()`, `Pyodide.setInterruptBuffer`, `time.sleep` interruption, worker-restart escalation, and `asyncio` with/without JSPI without re-downloading Pyodide.
- **P1 checklist:**
  - Pin `"pyodide": "314.0.8"` (exact) in `package.json`, add `scripts/copy-pyodide-assets.mjs` before `collect-licenses.mjs` in `postinstall`, and add `/public/pyodide/` to `.gitignore`.
  - Serve worker entry from `public/python/python-worker.js` (in-scope of `/python/coi-sw.js`); keep `'unsafe-eval'` omitted from worker CSP.
  - Check owner's decision on the Q1 `Humor-Sans.ttf` + `libtiff`/`bzip2`/`BaKoMa` flag and on whether to keep Q4 (`scipy`/`pandas`/`sympy`) out of v1 or include them.
