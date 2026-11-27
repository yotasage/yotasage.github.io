# FFT / spectrum analyzer tool: steps

Size every step by context: one agent stays under ~200k tokens, engine steps are separated from page steps, and research steps write `docs/fft/notes-<step>.md` (`< 10k` tokens) without modifying product code. Each engine step also writes one line per new file into `docs/fft/modules.md`.

**Harness.** `scripts/harness/fft/` has its own `package.json` (with `node_modules` git-ignored) so harness-only packages never enter the site's `package.json` or `/licenses`. `npm run check` runs the DSP, metrics, parser, resampling, plot-layout and exporter checks in Node; `npm run ui [base URL]` runs browser checks against `next start` on port **`3025`**. Reference data is produced by small Python scripts in the same folder (`gen-reference.py` with numpy/scipy for spectra, windows and Welch; `gen-fixtures.py` with matplotlib for tick positions and a reference figure); the owner runs them, and the small JSON outputs are committed so `npm run check` needs no Python.

## Sample data pool

Real files already exist on the owner's machine and are read in place; **never copied into the repo**. The owner fills in the folder in Q2. Cover:

1. A Nyquist-rate ADC transient with differential outputs on a fixed step (strobed).
2. The same circuit with the simulator's variable time step (exercises resampling).
3. A delta-sigma modulator output (1-bit or multi-bit), at least 2^18 samples.
4. Digital output codes as integers in CSV.
5. A Parquet file written by the owner's Python post-processing.
6. A multi-signal export where each signal carries its own time column, if the owner's exporter does that.
7. A large text file (at least 100 MB) for memory and throughput measurements.
8. A corner or Monte Carlo set of at least 5 runs of the same circuit (for compare and batch).
9. A two-tone run (IMD).
10. An oscillator or PLL output (v3).

Reference results (SNDR, SFDR, THD, ENOB, with the settings used) from the owner's own Python or Virtuoso post-processing are needed for at least files 1, 3 and 4. They are kept next to the files and quoted in `notes-F2.md`, not committed.

## Research

### S0: Survey and preparation (after Q1, Q2)

Read in parts (never read files > 40 KiB whole):

- `CLAUDE.md`, `docs/agent-workflow.md`, `docs/BACKLOG.md` (next free `BL` ID), `scripts/check-repo.mjs` and `scripts/collect-licenses.mjs`: rules for a new route, how fonts and packages are listed on `/licenses`, whether an `fft` route or `docs/fft/` needs registering anywhere.
- How other tools create Web Workers in the static export (`public/3d/occt/`, the Python tool), and the `next` version.
- Existing figure and export code to reuse: `lib/resistor/draw.ts` (SVG), the TikZ, SVG and PNG exporters of the resistor and EM simulation tools, the PDF writer used by the QR code tool (and whether it can draw vector paths and embed a font), `references.bib` and how a page cites it.
- `lib/simsetup/` and its page: names and units of f0, FS, Ncyc and Npts; how to pass them to the FFT tool and back (default: link carrying `fs`, `f0`, `N`).
- `components/UI/{ToolHeader,PillTabs,Fields}.tsx`, `lib/ui/i18n/`, `components/PageHead.tsx`, how Inter and JetBrains Mono are self-hosted.
- The sample pool: capture the real format details of each file (delimiter, header, comments, units, whether time columns repeat per signal, SI suffixes, number formats, Parquet schema and compression) and record them in the notes; settle the time-grid uniformity threshold from files 1 and 2.
- Measurements in Node and in Chromium: FFT time for N from 2^16 to 2^24 (real input, our implementation); text parse throughput and peak memory on file 7; the largest `Float64Array` allocations that succeed in Chrome, Edge, Firefox and Opera.
- Parquet: shortlist packages (for example hyparquet, parquet-wasm; licences and decompression limits to be **checked**, not assumed) and estimate the cost of a minimal own reader for the codecs the owner's files use.
- Feasibility of a meta Content-Security-Policy with `connect-src 'none'` on a static-export page (P1).
- Fonts: DejaVu Sans licence text and a subset size; PDF font embedding options.
- Confirm the window and metric reference values in `metrics.md` §7 (from the cited standards or scipy), the ERBW definition, and the interpolation error bounds.
- Generate the matplotlib fixtures (owner runs `gen-fixtures.py`).

**Done when:** `docs/fft/notes-S0.md` (`< 10k` tokens) answers every item above with file/test references and resolves all **SPIKE** markers in `architecture.md`.

## Phase 1: loading, analysis, plots and exports (v1)

### F1: DSP core (engine)

Implement `lib/fft/dsp/{fft,realfft,bluestein,windows,windowMetrics,spectrum}.ts` (each `< 25 KiB`, added to `tsconfig.strict.json`). Create `scripts/harness/fft/` (`package.json`, `check.mjs`, `gen-reference.py`) and `docs/fft/modules.md`.

**Done when:** FFT output equals `numpy.fft` to 1e-12 relative RMS for N in 2^1 to 2^22 and for N = 1000, 1023, 3·4096 and the primes 1009 and 65537; real-input path equals the complex path; the FFT of a pure coherent sine shows no spur above -250 dBc (rectangular window; the bar is tuned by measurement in this step and recorded); every window's ENBW, highest sidelobe, scalloping loss and main-lobe half-width match `metrics.md` §7 (0.02 bins / 0.2 dB) and `scipy.signal.get_window` samples to 1e-12; `P[k]` obeys Parseval to 1e-12; timings for 2^16 to 2^22 recorded in the notes; `npm run verify` passes.

### F2: Metrics engine (engine, after Q3)

Implement `lib/fft/metrics/{tones,bins,adc,noise,checks}.ts` per `metrics.md` §3-§5 (v1 rows only). Add `reference_metrics.py` (numpy) to the harness.

**Done when:** the exact-solution cases 1-4, 6 and 9 of `metrics.md` §7 pass; folded-harmonic bins agree with brute-force folding on 200 random `(fs, f0, N, H)` combinations; every check `C1`-`C3`, `C5`-`C9`, `C11` and `C12` has a test that fires it and a test that does not; results on the sample pool match the owner's references (case 10) or each difference is explained in `notes-F2.md`; `npm run verify` passes.

### F3a: Text data and time grids (engine, after Q4)

Implement `lib/fft/data/{text,signals,pairing,timegrid,resample,units}.ts`: streaming delimited-text parser (delimiter, header and comment detection, decimal comma, optional SPICE-style suffixes where `m` is milli and `meg` is mega, multiple time columns), single/diff/CM signals with gain and offset, name auto-pairing, grid classification, linear and cubic resampling with the error bound of `metrics.md` §6.

**Done when:** every text file of the sample pool parses to the same numbers as `pandas.read_csv` (to 1e-15 relative; pandas' fast float parser is not always correctly rounded, so differences are examined, not assumed); header and delimiter detection is right on all pool files and on 30 synthetic variants; a 100 MB file with 3 chosen columns loads within the memory budget (measured in Chromium through the harness UI run, numbers in the notes); resampling case 7 of `metrics.md` §7 passes; malformed inputs give typed errors; `npm run verify` passes.

### F3b: Binary data and the worker (engine)

Implement `lib/fft/data/{parquet,npy}.ts` (library or own reader per S0 and Q4) and `lib/fft/worker/{protocol,dsp.worker,client}.ts` with `scan`, `load`, `grid`, `resample`, `analyse` and `cancel`.

**Done when:** the Parquet and `.npy` pool files give the same arrays as `pandas.read_parquet` and `numpy.load`; only the chosen columns are read (verified by a read-bytes counter); all rows of the parser and worker tests in `security.md` §6 pass; cancel returns the worker to idle within 200 ms on a 100 MB load; `npm run verify` passes.

### F4a: Plot engine (engine, after Q5)

Implement `lib/fft/plot/{spec,layout,ticks,scale,decimate,draw,canvas,themes,fonts}.ts`: the `PlotSpec`, matplotlib-style layout and ticks, log axes with minor ticks, SI-prefixed labels, annotations (markers, labelled points, shaded spans, reference lines), min/max decimation, the draw list and the Canvas backend, three styles (`mpl-default`, `mpl-grid`, `mpl-dark`).

**Done when:** tick positions equal the matplotlib fixtures exactly for 200 linear and 100 log ranges; a spectrum plot rendered at 640 x 480 (100 dpi) puts the axes box, tick marks and label baselines within 2 px of the matplotlib reference figure generated by `gen-fixtures.py` (verification bar: looks the same at a glance next to it; no chasing sub-pixel text-metric differences); a 4M-point spectrum decimates and lays out in under 100 ms in Node; narrow spurs survive decimation; `npm run verify` passes.

### F4b: Exporters (engine)

Implement `lib/fft/plot/{svg,pdf,tikz,pyscript}.ts` and `lib/fft/export/results.ts`: SVG, vector PDF, PNG at a chosen dpi with light, dark or transparent background, TikZ/pgfplots, matplotlib script plus CSV in a ZIP (`fflate`), and results as CSV, JSON, LaTeX (booktabs) and Markdown with conventions and checks included.

**Done when:** exported SVG parses as XML and renders the same as the Canvas output in Chromium (visual check recorded); the PDF opens in `pdfinfo` and pdf.js; the TikZ file compiles as it is with `pdflatex` where installed; the generated `.py` runs under the owner's Python and its PNG matches the Canvas PNG (axes box within 3 px); every hostile-name row of `security.md` §6 passes for each exporter; `npm run verify` passes.

### F5a: Page shell (page)

Implement `pages/fft/main.tsx`, `components/Fft/{FftTool,FilePanel,SignalPicker,SetupPanel,ResultsTable,PlotArea,PlotCanvas,StatusBanner}.tsx`, `styles/Fft.module.css` and initial EN/NB strings in `lib/ui/i18n/fft.ts`. Include drop and paste, multiple files, signal building, setup with live derived values (bin width, cycles, coherence, ENBW), spectrum and time plots, the core results, progress and cancel.

**Done when:** a pool file dropped on the page gives a spectrum and results that equal the engine's; a differential pair auto-pairs and gives the common-mode monitor; no request leaves the page (`security.md` §6); desktop and 390 px phone viewports render without overflow in light and dark themes; `npm run ui` (port `3025`) and `npm run verify` pass.

### F5b: Diagnostics, info, exports and state (page)

Implement `components/Fft/{ChecksPanel,MetricInfo,ExportBar}.tsx`, the harmonic and window plots, `lib/fft/state/{settings,hash,presets}.ts`, notices `W1`-`W5` and the link and preset UI.

**Done when:** each check fires in the UI with its parameters and clears when the cause is removed; every result row opens its formula and convention; every export works from the page and carries the conventions and checks; a copied link restores the settings on a fresh page and asks for the same file; hostile and out-of-range links behave as in `security.md` §6; `npm run ui` and `npm run verify` pass.

**End of v1 build.** The owner runs the sample pool through the page and compares with the owner's own numbers before release.

### F6: v1 release (page)

Add the home card (`pages/index.tsx`) and icon (`components/Home/ToolIcon.tsx`), `public/og/fft.png`, `/licenses` entries (font, Parquet reader if used), the theory section (windows, coherence, normalisation, each figure of merit, with citations from `references.bib`), finalised `W1`-`W5` in EN/NB (Q6), `README.md` intro and tools row, `CLAUDE.md` tool entry, `docs/fft/modules.md`, `docs/fft/howto.md`, `docs/backlog/fft.md`, and the "Open in FFT tool" link in Simulation setup.

**Done when:** the card and page show in light and dark and at phone width; the EN/NB parity check passes; every theory statement is cited; `npm run verify` passes.

## Phase 2: estimators, advanced metrics, comparison (v2)

### F7: Estimators (engine)

Implement `lib/fft/dsp/{welch,goertzel,czt}.ts` and complex (I/Q) two-sided spectra; vector averaging for phase-locked records.

**Done when:** Welch equals `scipy.signal.welch` (window, overlap, detrend, scaling) to 1e-9 relative; Goertzel equals the DFT bin to 1e-12; CZT equals the DFT on its grid and an exact sine at off-grid frequencies; the two-sided spectrum of a complex tone is correct; `npm run verify` passes.

### F8: Advanced metrics (engine)

Implement `lib/fft/metrics/{imd,interleave,jitter,fom}.ts` and the v2 rows of `metrics.md` §4 (`M-NINT`, `M-INB`, `M-IMD`, `M-IP3`, `M-ILV`, `M-JIT`, `M-FOMW`, `M-FOMS`, `M-DR`, `M-ERBW`).

**Done when:** two-tone case 8 passes; synthetic noise with known density gives in-band and integrated noise within 0.1 dB of analytic; an interleaved-ADC test signal with known offset, gain and timing mismatch puts each spur in the right class; jitter, Walden and Schreier values equal hand calculations; a behavioural second-order delta-sigma generated by the harness lands within about 3 dB of the textbook SQNR for its OSR (a loose check, because the formula assumes white quantisation noise); `npm run verify` passes.

### F9: Page for v2 (page)

Estimator controls, in-band and two-tone setups, the integrated-noise, compare and sweep plots, multi-file batch ("apply these settings to all", table export as CSV and LaTeX), Nyquist-zone axis if S0 and the owner want it.

**Done when:** the corner/Monte Carlo pool set gives one table and one overlay; a sweep over files gives SNDR vs fin with ERBW marked; all new exports carry conventions; phone width and themes pass; `npm run ui` and `npm run verify` pass.

### F10: Expression signals and more formats (engine, then page)

Own expression parser (fixed grammar, functions `abs`, `sqrt`, `log10`, `min`, `max`, ...; no `eval`) for derived signals; formats chosen from S0 and the owner's files (WAV, SPICE `.raw` ASCII/binary, others), each with its own fuzz tests.

**Done when:** expressions evaluate identically to numpy on 50 cases; hostile expressions are rejected (`security.md` §6); each new format reads its sample files exactly; `npm run verify` passes.

## Phase 3: specialised analysis (v3)

### F11: Lomb-Scargle, STFT, multitaper (engine, then page)

**Done when:** Lomb-Scargle on a jittered-grid sine finds the tone and harmonics at the right frequencies with amplitudes within the stated bound; STFT equals `scipy.signal.stft` to 1e-9; multitaper equals `scipy.signal.windows.dpss`-based spectra to 1e-9; spectrogram plot added and exportable; `npm run verify` passes.

### F12: Sine fit, histogram, bits-to-code (engine, then page)

**Done when:** 3- and 4-parameter fits recover known amplitude, frequency, phase and offset to the noise limit; SINAD from the fit matches the FFT result on coherent records and stays right on non-coherent ones; histogram INL/DNL of a simulated ideal and a known-bad converter matches analytic values; bit columns assemble into codes with arbitrary per-bit weights; `npm run verify` passes.

### F13: Carrier mode (engine, then page)

Phase noise `L(f)` in dBc/Hz from the carrier skirt, integrated rms jitter between offsets, reference-spur table.

**Done when:** a synthetic carrier with known white and 1/f phase noise gives `L(f)` and the integrated jitter within 0.5 dB / 5 % of analytic; spur table matches injected spurs; `npm run verify` passes.
