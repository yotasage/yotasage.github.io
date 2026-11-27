# FFT / spectrum analyzer tool: security and warnings

This tool has no helper, no server and no network. The attack surface is therefore small and specific: **untrusted files and links** going through parsers, a worker and exporters, and **numbers a visitor might trust when they should not**. The target is the smallest capability we can verify with automated tests; every requirement below maps to a check in section 6.

## 1. Trust boundaries

| Component | Trust level and exposure |
|---|---|
| Static page (`/fft/main`) | Trusted first-party UI; treats files, link settings, `localStorage` contents and worker replies as **untrusted input**. |
| Dropped or pasted files | Untrusted. Names, column names, units, metadata and numeric content can be hostile or malformed. |
| Worker (`dsp.worker.ts`) | Same-origin first-party code that processes untrusted data; no network, no `importScripts` of external URLs. |
| Link (`#s=...`) | Untrusted; anyone can send a link. |
| `localStorage` (`fft:*`) | User-controlled; validated on read like any other input. |
| Exported files | Written from untrusted names and numbers; opened later by other programs (browser, Excel, LaTeX, Python), so they must be safe in those programs. |
| npm packages and fonts | Build-time supply chain; kept to the minimum (a Parquet reader if S0 approves, a font). |
| Other tools on `yotasage.github.io` | Same origin: share `localStorage` and browser permissions. See residual risks. |

## 2. Requirements (`P1`-`P12`)

- **P1 No network.** No `fetch`, XHR, WebSocket, `sendBeacon`, `EventSource` or dynamic `import()` of a URL in `lib/fft/` or `components/Fft/`. If **SPIKE S0** shows it works with the static export, the page also carries a meta Content-Security-Policy with `connect-src 'none'`. The harness UI run asserts zero requests to other origins and zero `fetch`/XHR after load, including while files are dropped and exported.
- **P2 No dynamic code.** No `eval`, `new Function`, string timers, or `importScripts` from data. The v2 expression language has its own recursive-descent parser with a fixed grammar, a length cap and a nesting cap; it can only read columns and call a fixed list of math functions.
- **P3 Strict parsing of untrusted files.** Caps on file size, row count, column count, header bytes and cell length. Every parser failure maps to a typed error with a plain message, never an uncaught exception. `.npy`: accept only the plain numeric dtypes (`f4`, `f8`, `i1`-`i8`, `u1`-`u8`, `b1`, either byte order), reject object arrays (which are pickles) and Fortran-ordered or multi-dimensional shapes the tool cannot map, and validate the shape against the file length **before** allocating. Parquet: cap row groups, page sizes and decompressed sizes (decompression bombs); read only the chosen columns; reject unsupported encodings with a typed error.
- **P4 Untrusted text is only ever text.** Signal names, file names, units and metadata are rendered as text nodes or Canvas text, never `innerHTML` or `dangerouslySetInnerHTML`. Exports escape on the way out:
  - SVG: XML-escape `& < > " '` and strip control characters.
  - TikZ/LaTeX: escape `\ { } $ & # ^ _ % ~` in every name, so a hostile column name cannot add LaTeX commands such as `\input` or `\write18` to a file the owner will compile.
  - Matplotlib script: names enter the `.py` only as properly escaped string literals (a fixed template, never string interpolation of code); numbers go in the bundled CSV.
  - CSV and LaTeX tables: text cells starting with `=`, `+`, `-`, `@`, tab or carriage return get a leading apostrophe (spreadsheet formula injection); numeric cells are untouched.
- **P5 Resource limits.** Soft limits on samples per signal (default 2^24) and total typed-array memory (about 1 GiB), shown to the visitor (`W2`). Allocation sizes are never taken from file-declared values without checking them against the real file size. Jobs report progress and can be cancelled; a job that cannot be interrupted is terminated with the worker, which is recreated.
- **P6 No silent bad numbers.** Non-finite samples are counted and block the analysis until cut or masked (`C12`); a result that is NaN or infinite is shown as "not defined" with the reason, never as a number. Results are never rounded in a way that hides a failed check.
- **P7 Link state.** `#s=` is base64url JSON of at most 4 KiB, validated against the settings schema: unknown keys ignored, numbers clamped to their ranges, strings length-capped and shown as text. A link never reads a file, changes a preset, or runs anything; it only fills in settings and says which data it expects.
- **P8 Namespaced storage.** Keys `fft:presets` and `fft:prefs` only, every read and write in `try/catch`, validated on read, settings only: no data, no file names, no signal names from files.
- **P9 Zero third-party scripts, fonts or files.** Everything is self-hosted. Chrome's loopback permission appears to be per origin (`docs/jlc-parts/security.md` P5), so no third-party script may ever run on the site.
- **P10 Few dependencies.** The DSP, parsers and plot engine are our own code. Each new package (a Parquet reader is the likely one) needs an accepted licence (MIT, BSD, Apache-2.0, ISC), a pinned version, a read-through for network or `eval` use and for decompression limits, `npm audit` clean, and an entry on `/licenses`. A bundled font needs its licence file listed.
- **P11 Worker messages.** Both sides validate message shape and ignore anything unexpected; buffers are transferred, not shared; the worker never receives code, URLs or HTML.
- **P12 Conventions travel with numbers.** Every result carries the convention that produced it (`metrics.md` §2) and every check that fired, in the UI and in every export. The tool has no "clean" export that drops them.

## 3. Residual risks (stated plainly)

- **Parser bugs.** A third-party Parquet reader may have bugs that a hostile file triggers; mitigations are P3, P10 and running the parser in the worker, but a crash can still lose the analysis.
- **Tab exhaustion.** A very large file can exhaust browser memory and kill the tab despite the soft limits; limits are conservative and measured in S0, not guaranteed.
- **Misread numbers.** Figures of merit are defined differently by different standards; a visitor can still compare numbers made with different conventions. P12 makes the convention visible, not unavoidable.
- **Same-origin neighbours.** Other tools on the same origin share `localStorage` and browser permissions (for example a loopback permission granted to the JLC parts tool). This tool makes no network request and runs no code from data, so it adds no path to those permissions, but it also cannot protect itself from a compromised neighbour; `fft:` namespacing limits accidental collisions only.
- **Meta CSP is partial.** A meta-tag policy cannot cover everything a header can (for example framing); it is an additional guard, not the primary control.
- **Export fidelity.** A PDF, SVG or TikZ file may render slightly differently in another program than on screen; the on-screen figure is the reference.

## 4. Visitor notices and warnings (`W1`-`W5`)

EN drafts below (finalised in Q6); F6 adds NB translations with parity enforced by `check:repo`.

| ID | Where | When |
|---|---|---|
| W1 | Top of page (`StatusBanner`) | Always |
| W2 | File panel | When a file is large, or a limit is reached |
| W3 | Setup panel, next to the sample rate | When the time axis was resampled |
| W4 | Results header | When the record is not coherent |
| W5 | Results header | When a check of level warn or error fired |

## 5. Notice drafts

- **W1:** "Everything is computed in your browser; files you drop here never leave this device. Figures of merit are defined differently by different standards and data sheets, so the convention used is shown next to every result. [Current checked status and known limitations: updated at F6.]"
- **W2:** "This file has {rows} rows and {cols} columns. Only the signals you pick are loaded into memory. Limit: {limit} samples per signal." / when exceeded: "This signal has {n} samples, more than the {limit} this page loads. Use fewer samples or pick another signal."
- **W3:** "The time axis of this signal is not uniform (step from {dtMin} to {dtMax}). An FFT needs uniform samples, so the data was resampled with {method} at {fs}. Worst-case interpolation error: {err} dB below the signal. Results below that level are not trustworthy; a re-run with a fixed output step avoids this."
- **W4:** "This record holds {M} cycles of the input, not a whole number, so energy leaks between bins. A {window} window limits this; SNDR and ENOB are computed from bin sums as described under the info button."
- **W5:** "{count} checks need your attention. The numbers below are shown with the checks that apply to them."

## 6. Security verification matrix

### Engine and harness (F1-F4b, F7-F13; Node, `scripts/harness/fft/`)

| Test | Expected |
|---|---|
| Fuzz the text parser (random bytes, huge lines, unterminated quotes, mixed delimiters, BOM, CRLF/CR, NUL, 1 M columns, deeply repeated headers) | No panic or uncaught exception; typed error or bounded result; memory stays under the cap |
| `.npy` with object dtype, with a shape implying more bytes than the file holds, with a truncated header, with unsupported dtype | Typed error; no large allocation |
| Parquet: truncated footer, absurd row-group count, decompression bomb, unsupported encoding | Typed error within limits |
| Column and file names `<script>`, `"><img onerror>`, `../`, very long, RTL and zero-width characters, lone surrogates | Rendered as text; sanitised in exports |
| SVG export with hostile names | Well-formed XML; no element or attribute injected |
| TikZ export with `\input{x}`, `\write18`, `$`, `%`, `}` in names | Each is escaped; `pdflatex` (where installed) compiles without reading any file |
| Matplotlib script with `"`, `\n`, triple quotes, `'; import os #` in names | Script parses (`python -m py_compile`) and a static scan shows only the template's own statements outside string literals |
| CSV/LaTeX export with names starting `=`, `+`, `-`, `@`, tab | Text cells prefixed; numeric cells unchanged |
| Link fuzz: oversize, invalid base64, wrong types, out-of-range numbers, unknown keys, `__proto__` | Rejected or clamped; settings object has no polluted prototype |
| NaN/Inf/denormals in data | `C12` raised; no NaN in printed results |
| FFT of N = 1, 2, 3, prime, 2^24 | Correct or a typed "too large" error; no hang |
| Expression parser (v2): long input, deep nesting, unknown identifiers, `constructor`, `__proto__`, `eval`, `Function` | Rejected with a message; never evaluated as code |
| Source scan of `lib/fft/` and `components/Fft/` | No `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` |

### Page checks (F5a-F6; `npm run ui`, port `3025`)

- A full session (drop files, pick signals, analyse, export every format) produces no request to another origin and no `fetch`/XHR after load.
- A hostile file (names from the table above) loads and renders as text everywhere, including the results table, plot labels, `aria-label`s and exports.
- Cancel works during a large load; the page stays responsive; memory returns to baseline after dismissing a dataset.
- A link with out-of-range settings opens with clamped values and a note, and reads no file.
- Presets survive reload; corrupt `fft:presets` content is ignored with a note.
- Light and dark themes and a 390 px phone width show every notice without overflow.
