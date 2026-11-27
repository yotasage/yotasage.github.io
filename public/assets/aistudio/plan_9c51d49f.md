# FFT / spectrum analyzer tool: plan

| | |
|---|---|
| Page | `/fft/main` (`pages/fft/main.tsx`) |
| Branch | `fft` (one commit per step; agents never push) |
| Written | 2026-11-27, from the repo `README.md` and the JLC parts plan set (`docs/jlc-parts/*`). `CLAUDE.md`, `docs/agent-workflow.md` and `docs/BACKLOG.md` were **not** read: the ground rules below are quoted second-hand from the JLC plan, and S0 reconciles them. |
| Status | Not started. Next: the owner answers Q1-Q2, then S0. Q3 before F2, Q4 before F3a, Q5 before F4a, Q6 before F6 |

## Goal

The visitor drops one or more data files (CSV/TSV text, Parquet, NumPy `.npy`), picks the signals to analyse (single-ended, or a differential pair), sets the sampling and analysis parameters, and gets:

- a spectrum in a plot that looks like matplotlib's, with the fundamental, harmonics, spurs and noise floor marked,
- a table of figures of merit (SNR, SNDR, THD, SFDR, ENOB and many more) with the convention used shown next to every number,
- warnings when something makes the numbers untrustworthy (non-coherent record, clipping, non-uniform time steps, harmonics folding onto the signal, ...),
- exports: SVG, PNG, PDF, TikZ/pgfplots, a matplotlib script with its data, and the results as CSV, JSON, Markdown or a LaTeX table.

Everything runs in the browser. There is no server, no helper and no network request: files given to the tool never leave the device.

The first user is the owner's analog IC work (ADC, delta-sigma, amplifier and oscillator results from Cadence Virtuoso/Spectre post-processed with Python, plus measured data), but nothing in the tool assumes Cadence: any evenly or unevenly sampled data works.

What the visitor sees:

1. Opens the tool and drops files (or pastes text). The file panel lists each file with its columns and a short summary (rows, time range, sample step, whether the time axis is uniform).
2. Picks a signal: one column (single-ended) or two (differential, with the common mode shown as a monitor). Names like `outp`/`outn` are paired automatically; gain and offset can be set per signal.
3. Sets sampling and analysis: sample rate (from the time column or typed), record start and length, window, full scale, number of bits, number of harmonics. The tool says whether the record is coherent and how many cycles it holds.
4. Reads the spectrum plot and the results table; a diagnostics panel lists every check that fired, in plain language.
5. Exports a figure or the numbers, or copies the link (settings only, never data).

## Scope by phase

| Phase | Adds |
|---|---|
| v1 | CSV/TSV, Parquet and `.npy` loading; single-ended/differential/common-mode; non-uniform time detection and resampling; windowed FFT with a window catalogue; coherence detection; SNR, SNDR, THD, SFDR, ENOB, HDn, noise floor and noise density, signal statistics; diagnostics; matplotlib-style spectrum, time-domain, harmonic and window plots; all exports; link and presets |
| v2 | Welch/Bartlett averaging (power and vector), Goertzel, zoom FFT (CZT), complex I/Q input; in-band (delta-sigma) metrics, integrated and input-referred noise, IMD and IP3, interleaving spurs, jitter-limited SNR, Walden and Schreier FoMs; multi-file compare, batch table, sweeps (SNDR vs fin and amplitude, dynamic range, ERBW); expression-derived signals; more formats |
| v3 | Lomb-Scargle for unevenly sampled data, STFT/spectrogram, multitaper; sine fit (IEEE 1057/1241), histogram INL/DNL, bits-to-code with per-bit weights; oscillator/PLL carrier mode (phase noise, integrated jitter, reference spurs) |

Interactive plots (zoom, pan, cursors) are not in scope; the plot engine keeps its plot description separate from the renderer so they can be added later (`docs/backlog/fft.md`).

## Ground rules (from `CLAUDE.md`, as quoted in the JLC plan; S0 confirms)

- **Static export, no server.** No API routes, `getServerSideProps`, middleware, or backend. Local `npm run build` is not a static export; always run `npm run verify`.
- **No network at all (stricter than the site).** The tool makes no request after the page has loaded: no `fetch`, XHR, WebSocket or beacon in `lib/fft/` or `components/Fft/`, and no third-party script, font or file (`security.md` P1, P9). No `CLAUDE.md` exception is needed.
- **Self-hosted assets only.** No CDN scripts, fonts, workers or WASM.
- **Licences.** MIT, BSD, Apache-2.0 and ISC are fine; GPL/LGPL/AGPL needs the owner's decision. The site is `AGPL-3.0-or-later`. A new package or bundled font gets its notice in `/licenses` (S0 verifies how `scripts/collect-licenses.mjs` handles it). The DSP, parsers and plot engine are written in this repo, with no DSP or plotting package.
- **Layout & Design System v2.** Works at phone width (390 px overflow check), `data-ds="v2"` (`styles/design-system.css`, `components/UI/{ToolHeader,PillTabs,Fields}.tsx`), light and dark themes, `components/PageHead.tsx`, a `1200x630` image in `public/og/fft.png`, and a home link (`components/icons/home.tsx`). An honest status note (`W1`) sits at the top of the page.
- **Text.** All UI strings in EN and NB in `lib/ui/i18n/fft.ts`, re-exported by `lib/ui/translations.ts` (`check:repo` enforces parity).
- **Home page.** Add a card to `TOOLS` (`pages/index.tsx`) and an icon in `components/Home/ToolIcon.tsx` in F6 (never add a placeholder card early).
- **Where things go.** `pages/fft/main.tsx`, `lib/fft/` (framework-free logic), `components/Fft/`, `styles/Fft.module.css`, `scripts/harness/fft/` (own `package.json`; `npm run check` and `npm run ui`), `docs/fft/`.
- **TypeScript.** `"module": "node16"` requires `await import(...)` for ESM-only add-ons and `// @ts-expect-error` on dynamic imports of local modules. Include `lib/fft/**/*` and `components/Fft/**/*` in `tsconfig.strict.json`. Load heavy parts (Parquet reader, PDF writer) lazily.
- **Size.** Repo hard cap 40 KiB per file (`check:repo`); target `< 25 KiB` per source, CSS and doc file.
- **Sources.** Every sourced statement on the page is cited from `references.bib` (the comment at the top of that file explains how); the theory section follows the resistor tool's pattern.
- **Verification.** Run `npm run verify` before saying a step is done. Independent checks live in `scripts/harness/fft/` because the owner does not review code.
- **Commits.** One commit per step on branch `fft`, explicit paths, no push; messages are one paragraph of tagged user-facing sentences (`ADDED:`, `CHANGED:`, `FIXED:`, `REMOVED:`, `UPDATED:`).
- **Ports.** Dev server `3020`; harness `next start` uses **`3025`** (`3021` Smith chart, `3022` EM sim, `3023` Python, `3024` JLC parts; take the next free one if that has changed).

## Decisions

| ID | Decision | Reason |
|---|---|---|
| D1 | Everything runs in the page; no helper, no network. | Matches the site's promise; large simulation files stay on the device. |
| D2 | Plots look like matplotlib's (default style, tab10 colours, same tick algorithm, same figure and axes proportions) but are drawn by our own renderer. No real matplotlib, no Pyodide. | Owner decision 2026-11-27. Pyodide is tens of MB, MPL-2.0 at its core, and slow to start. |
| D3 | One layout engine turns a `PlotSpec` into a backend-neutral draw list; backends are Canvas (screen and PNG), SVG and PDF. TikZ/pgfplots and the matplotlib script are written from the `PlotSpec`. | One look everywhere; no `innerHTML`; no SVG-as-image font problems. |
| D4 | The FFT (radix-2, mixed radix, Bluestein), windows, estimators and all metrics are written in `lib/fft/` in Float64, without a DSP package. | Arbitrary N, testable against exact solutions, no licence or size cost. |
| D5 | All power quantities are sums of one per-bin power spectrum `P[k]` (`metrics.md` §1). | One convention for signal, harmonics, noise and spurs; Parseval holds by construction and is checked. |
| D6 | Figures of merit have selectable conventions with documented defaults (`metrics.md` §2); the convention in use is printed beside every result and included in every export. | SNR, ENOB and SFDR are defined differently by different standards and data sheets. |
| D7 | The tool exposes spectral estimators (windowed DFT, Welch, Goertzel, CZT, multitaper, STFT), not FFT algorithm variants. | The algorithm variants give identical numbers; the estimator changes the result. |
| D8 | Non-uniform time grids are detected, resampled explicitly with a stated error bound, and flagged; Lomb-Scargle follows in v3. | Variable-step transient data is the most common source of silently wrong SNDR. |
| D9 | Parsing, resampling and analysis run in a Web Worker on typed arrays; files are streamed and only the chosen columns are kept. | Hundreds of MB of CSV must not freeze or exhaust the tab. |
| D10 | The link carries settings only (never data); presets live in `localStorage` under `fft:`. | Files never leave the device; links stay short. |
| D11 | Validation is against exact solutions (ideal N-bit quantiser, injected harmonics, tabulated window values), numpy/scipy references, and the owner's own reference numbers on the sample pool. | Same approach as the EM simulation tool. |
| D12 | Phases v1/v2/v3 as in the scope table; each step is sized under ~200k tokens with engine and page steps separate. | Matches `docs/agent-workflow.md`. |
| D13 | No `eval` or `new Function` anywhere; the expression language for derived signals (v2) has its own parser with a fixed grammar. | Files and links are untrusted input (`security.md` P2). |

## Questions for the owner

Ask before the named step; do not guess.

- **Q1 (before S0): route and name.** Is `/fft/main` with the home card title "FFT / spectrum analyzer" right, or should the route be `/spectrum/main` (or something else)? Also confirm Norwegian wording for NB strings is reviewed by the owner at F6.
- **Q2 (before S0): sample data pool and reference numbers.** Provide 5-10 representative files, kept on the owner's machine and read in place (see `milestones.md`, "Sample data pool"), and reference results (SNDR, SFDR, THD, ENOB) for at least three of them from the owner's own Python or Virtuoso post-processing, so F2 can be checked against numbers the owner already trusts.
- **Q3 (before F2): default conventions.** Approve or change the defaults in `metrics.md` §2: harmonics counted in THD (proposed 2nd-10th), SNR excluding harmonics, ENOB with full-scale correction when a full scale is given, SFDR over 0 to fs/2 with the worst non-harmonic spur also reported, noise-bin compensation off, window "Auto" (rectangular if coherent, otherwise 4-term Blackman-Harris). These decide every number the tool prints.
- **Q4 (before F3a): formats and the Parquet dependency.** Confirm v1 formats (CSV/TSV, Parquet, `.npy`; the rest in F10) and allow a Parquet reader package if S0 finds one under an accepted licence with sane decompression limits. The alternative is a minimal own reader, which is much more work.
- **Q5 (before F4a): plot font.** Bundle DejaVu Sans (matplotlib's default font; permissive licence, self-hosted, listed on `/licenses`) so the plots look the same as matplotlib's, or use the site's Inter? And should PDF exports embed the font (looks the same, larger file) or use a standard PDF font (smaller, slightly different look)?
- **Q6 (before F6): visitor notice wording.** Approve the EN drafts `W1`-`W5` in `security.md` §5 before finalising EN/NB strings.

## Status

| Step | What | Status |
|---|---|---|
| S0 | Survey, repo and sample-pool inspection, measurements, library licences (`notes-S0.md`) | Not started |
| F1 | DSP core in `lib/fft/dsp/`: FFT, windows, spectrum normalisation + numpy/scipy harness | Not started |
| F2 | Metrics engine in `lib/fft/metrics/`: tones, bin sets, SNR/SNDR/THD/SFDR/ENOB, noise, checks | Not started |
| F3a | Text data loading, signal building, time-grid analysis, resampling | Not started |
| F3b | Parquet and `.npy` loading, worker and streaming | Not started |
| F4a | Plot engine: `PlotSpec`, matplotlib-style layout and ticks, decimation, Canvas backend | Not started |
| F4b | Exporters: SVG, PDF, PNG, TikZ, matplotlib script; results CSV/JSON/LaTeX/Markdown | Not started |
| F5a | Page shell: files, signals, setup, spectrum and time plots, core results | Not started |
| F5b | Diagnostics, metric info, harmonic/window plots, export bar, link and presets. **End of v1 build: owner tries the sample pool** | Not started |
| F6 | v1 release: home card, icon, OG image, `/licenses`, theory section, `README.md`, `CLAUDE.md`, Simulation setup links, `howto.md` | Not started |
| F7 | Estimators: Welch/Bartlett, averaging, Goertzel, CZT, complex input | Not started |
| F8 | Advanced metrics: in-band, integrated noise, IMD/IP3, interleaving, jitter, Walden/Schreier | Not started |
| F9 | Page for v2: estimator UI, multi-file compare, batch table, sweeps | Not started |
| F10 | Expression signals and more formats (WAV, SPICE `.raw`, others per S0) | Not started |
| F11 | Lomb-Scargle, STFT/spectrogram, multitaper | Not started |
| F12 | Sine fit, histogram INL/DNL, bits-to-code | Not started |
| F13 | Carrier mode: phase noise and integrated jitter | Not started |

Details of each step are in [milestones.md](milestones.md).

## How a step is run

Follow `docs/agent-workflow.md`:

- The main session is the coordinator and runs **one step agent at a time**. Set up the watchdog (`CronList` first, then `CronCreate` every 30 minutes away from `:00`/`:30`) when starting multi-step work.
- Heavy steps split into research (`notes-<step>.md`, `< 10k` tokens; web/licence lookups on Haiku), implementation (fresh agent from brief + notes), and check.
- Size every step under ~200k tokens; keep engine and page steps separate.
- Maintain `docs/fft/modules.md` (one line per file with main exports) from F1 onward.
- Deferred items (interactive plots, Nyquist-zone axis, NPR/ACPR, 7-term Blackman-Harris, `.npz`/`.mat`/HDF5 input, Murmann-survey overlay, undersampling helpers) go into `docs/BACKLOG.md` starting at the next free `BL<n>` ID (the JLC plan reserves `BL204+`; check) in `docs/backlog/fft.md`.

## Start here (prompt for a new session)

> Read `CLAUDE.md` and `docs/agent-workflow.md`, then `docs/fft/plan.md`, `docs/fft/architecture.md`, `docs/fft/metrics.md`, `docs/fft/security.md` and `docs/fft/milestones.md`. You are the coordinator. Create branch `fft`. Ask me Q1 and Q2 first. Once answered, run S0 as a research agent writing `docs/fft/notes-S0.md` and report back before starting F1. Set up the watchdog as the workflow describes.

## Files of this plan

- [architecture.md](architecture.md): system diagram, data model, worker protocol, DSP and estimator catalogue, plot engine, page, module map, integration.
- [metrics.md](metrics.md): spectrum normalisation, default conventions, tone and bin handling, every figure of merit with its formula, diagnostics `C1`-`C12`, resampling, validation cases.
- [security.md](security.md): trust boundaries, `P1`-`P12` rules, residual risks, visitor notices `W1`-`W5`, verification matrix.
- [milestones.md](milestones.md): sample data pool, harness setup, step-by-step scope with "Done when" bars.
- [research.md](research.md): background facts with confidence labels, options considered and rejected, unverified items, sources.
