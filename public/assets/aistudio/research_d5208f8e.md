# FFT / spectrum analyzer tool: research and session record

Facts gathered 2026-11-27. Confidence labels: *Verified* = read or tested during planning; *General knowledge* = background knowledge from memory, confirm in S0 before relying on it; *Unverified* = could not be checked yet. `notes-S0.md` overrides this file wherever they disagree. No web search or standards document was consulted when this file was written, so every reference in section 7 is *General knowledge* and must be checked before it goes into `references.bib`.

## 1. Original request and decisions

The owner wanted a new tool on `https://yotasage.github.io/` for spectrum analysis:

- different FFT types, if they exist;
- loading or dropping CSV and other common data files;
- picking the signals to process from those in the loaded files, differential and/or single-ended;
- common figures of merit (SNDR, SFDR, ENOB, and others, including uncommon ones) with wide support;
- plots of the matplotlib type, for now at least, possibly interactive plots later.

After a first round of suggestions the owner decided (2026-11-27):

- the plots only need to **look like** matplotlib's; real matplotlib is not wanted (D2);
- the planning documents follow the JLC parts set (`plan`, `architecture`, `security`, `milestones`, `research`); `metrics.md` was added because the definitions of the figures of merit are the core of the tool.

The suggestions the owner liked, now built into the plan: estimator choices instead of FFT algorithm variants (D7); explicit handling of non-uniform time grids (D8); selectable figure-of-merit conventions shown with every result (D6); diagnostics for non-coherent records, clipping, aliasing harmonics and similar (`metrics.md` §5); a phased scope (v1/v2/v3); validation against exact solutions and the owner's own scripts (D11).

## 2. What was read

- **Read (*Verified*):** the repo's `README.md` (fetched 2026-11-27: Next.js Pages Router static export on GitHub Pages; tools listed with their routes; "Adding a tool" steps; project layout; licence rule), and `plan.md`, `architecture.md`, `security.md`, `milestones.md` and `research.md` of the JLC parts tool, which supplied the document structure and the repo conventions quoted in `plan.md` (design system v2, i18n parity, `check:repo`, 40 KiB file cap, harness layout, ports, commit style, watchdog workflow).
- **Not read yet (for S0):** `CLAUDE.md`, `docs/agent-workflow.md`, `docs/BACKLOG.md`, `scripts/check-repo.mjs`, `scripts/collect-licenses.mjs`, `lib/simsetup/`, `lib/resistor/`, `lib/em-sim/`, the QR tool's PDF export, `components/UI/`, `lib/ui/i18n/`, `references.bib`, `package.json` (versions).
- **Existing tool to integrate with (*Verified* from the README):** Simulation setup (`/simsetup/main`) already calculates sampling parameters for FFTs and simulations (f0, FS, Ncyc, Npts) with coherent-sampling checks. The FFT tool should link to it and back (`architecture.md` §7).

## 3. Background findings (*General knowledge*, confirm in S0)

- **FFT variants.** Radix-2, mixed-radix and Bluestein algorithms compute the same DFT; the number the user sees changes with the *estimator* (window, averaging, tapering, zoom), not with the algorithm. This is why the tool exposes estimators (D7).
- **Window figures.** ENBW (bins): rectangular 1.00, Hann 1.50, Hamming 1.36, Blackman 1.73, 4-term Blackman-Harris 2.00. Highest sidelobe (dB): rectangular -13.3, Hann -31.5, Hamming -42.7, Blackman about -58, Blackman-Harris about -92. Scalloping loss (dB): rectangular 3.92, Hann 1.42, Hamming 1.78, Blackman 1.10, Blackman-Harris 0.83. Source: Harris 1978. These are the harness's expected values (`metrics.md` §7).
- **Coherent sampling.** With `M` cycles in `N` samples, `M` and `N` coprime puts every sample at a different phase and keeps harmonics on distinct bins; a rectangular window is then exact.
- **Bin-sum power accounting.** Defining `P[k] = 2|X[k]|^2/(N·sum(w^2))` makes per-bin white-noise power window independent and makes any tone's power the sum over its main-lobe bins; this is the standard way tools such as vendor ADC analysers and IEEE-style test procedures obtain SNR, SINAD and THD from a windowed record.
- **Quantiser limit.** An ideal N-bit quantiser driven by a full-scale sine gives SQNR = 6.02N + 1.76 dB over the Nyquist band; per FFT bin the floor is lower by `10 log10(N_fft/2)`.
- **Log of mean versus mean of log.** For a chi-square 2-dof noise bin the mean of the dB values is about 2.5 dB below the dB of the mean power (`10 log10(e)` times the Euler-Mascheroni constant).
- **Conventions differ.** SNR with or without harmonics; ENOB with or without full-scale correction; SFDR in dBc or dBFS; the number of harmonics in THD (5, 7, 9, 10 are all in use). Hence D6.
- **Interleaving spurs.** For `M` interleaved channels, offset mismatch gives spurs at multiples of `fs/M`; gain and timing mismatch give spurs at `k·fs/M ± fin`.
- **Jitter-limited SNR.** `SNR = -20 log10(2π·fin·σt)` for rms clock jitter `σt` and sine frequency `fin`.
- **Figures of merit.** Walden: `P/(2^ENOB·fs)` in J per conversion step (with `2·ERBW` in place of `fs` in the original definition when ERBW is lower). Schreier: `SNDR + 10 log10(BW/P)`.
- **Delta-sigma SQNR.** For order `L`, `B` quantiser bits and oversampling ratio `OSR`: `6.02B + 1.76 - 10 log10(π^(2L)/(2L+1)) + (20L + 10) log10(OSR)` dB (assumes white quantisation noise; used only as a loose check).
- **Non-uniform data.** Variable-step transient output is the usual case for circuit simulators; an FFT needs uniform samples. Interpolation error bounds: linear `max|x''|h^2/8`; clamped cubic spline about `(5/384)h^4 max|x''''|`. Lomb-Scargle estimates a spectrum from unevenly sampled data without resampling.
- **Spreadsheet and LaTeX injection.** CSV cells starting with `=`, `+`, `-` or `@` can run as formulas in spreadsheet programs; `\input` and `\write18`-style commands in a `.tex` file are dangerous when compiled. Both matter because names come from untrusted files (`security.md` P4).
- **`.npy` and pickles.** A NumPy file with an object dtype stores pickled data; a reader must refuse it (`security.md` P3).
- **matplotlib defaults.** Figure 6.4 x 4.8 in at 100 dpi; subplot margins left 0.125, right 0.9, bottom 0.11, top 0.88; 1.5 pt lines; 10 pt DejaVu Sans; outward ticks; `tab10` colours (`#1f77b4`, `#ff7f0e`, `#2ca02c`, `#d62728`, `#9467bd`, `#8c564b`, `#e377c2`, `#7f7f7f`, `#bcbd22`, `#17becf`); `MaxNLocator` nice steps 1, 2, 2.5, 5, 10. The harness fixtures from real matplotlib replace this memory as the reference.
- **SPICE suffixes.** In SPICE notation `m`/`M` means milli and `meg` means mega; simulator CSV exports usually use plain scientific notation, which S0 checks on the owner's files.

## 4. Options considered

| Option | Verdict |
|---|---|
| Real matplotlib through Pyodide | Rejected: payload of tens of MB that must be self-hosted, MPL-2.0 core needing a licence decision, slow cold start, and the owner only wants the look (D2). |
| Interactive plotting package (uPlot, Plotly, Chart.js) | Deferred: a later interactive renderer can sit behind the same `PlotSpec` (uPlot, MIT, is the candidate for big time series; licence to be checked). |
| Own plot engine with matplotlib-style layout and ticks | **Chosen (D2, D3):** small, no licence cost, consistent exports, TikZ and matplotlib-script output from one spec. |
| Inline SVG on screen | Rejected: needs `innerHTML` (`security.md` P4); Canvas draws the same draw list. |
| PNG export by rasterising SVG | Rejected: fonts do not load inside an SVG used as an image; the Canvas backend draws PNG directly. |
| DSP library (for example a JS FFT package) | Rejected: radix-2 only in the common ones; arbitrary N, Float64 accuracy and testability are needed (D4). |
| WASM FFT | Not needed: performance of a JS FFT in a worker is expected to be enough (S0 measures); revisit if not. |
| Papa Parse (CSV) | Fallback only: our tokenizer must stream chosen columns straight into `Float64Array`s and detect units and decimal commas. Licence (believed MIT) to be checked if used. |
| Parquet: reader package (hyparquet, parquet-wasm) versus own reader | Open: S0 checks licences and decompression limits; a package is preferred if acceptable (Q4). |
| Resample versus Lomb-Scargle for non-uniform data | Resample first (cheap, familiar, with a stated error bound); Lomb-Scargle in v3 (D8). |
| One metrics convention | Rejected: conventions differ between standards, so they are selectable and printed (D6). |
| A helper or server for large files | Rejected: breaks "no server"; streaming and column selection handle large files in the browser (D1, D9). |

## 5. Why these architecture choices

- **Estimators over algorithms.** The owner's question "different types of FFT" is answered by what changes the result: window, averaging, zoom, tapering, time-frequency analysis.
- **Bin sums.** One accounting rule makes SNR, SNDR, THD, SFDR and in-band metrics consistent with each other and gives a free self-check (Parseval).
- **Diagnostics before numbers.** Most wrong numbers from simulation data come from non-coherent records, variable time steps, clipping and harmonics folding onto the signal, so the tool says so beside the result instead of leaving it to the user.
- **Worker and streaming.** Simulation outputs can be hundreds of MB; parsing and FFTs must not run on the main thread, and only chosen columns may stay in memory.
- **Reuse before building.** The repo already has TikZ/SVG/PNG/PDF export code, a design system, a worker pattern and a Simulation setup tool; S0 finds them so F4b and F6 reuse rather than duplicate.

## 6. Unverified items for S0

- The repo's rules and helpers listed in section 2 under "Not read yet", and any rule that conflicts with `plan.md`.
- The real formats of the owner's data files (delimiters, headers, repeated time columns, suffixes, Parquet schema and compression), the uniformity threshold for time grids, and which formats beyond v1's belong in F10.
- Parquet package candidates: licence, maintenance, decompression limits, size.
- Measured FFT times, parse throughput, peak memory and allocation limits in Chrome, Edge, Firefox and Opera.
- Whether a meta Content-Security-Policy with `connect-src 'none'` works with the static export.
- Worker creation pattern in the static export; PDF writer vector and font-embedding capability; DejaVu Sans licence and subset size.
- The published window values, the ERBW definition, and the interpolation error bounds in `metrics.md`.
- Whether an "Open in FFT tool" link needs anything beyond a link on the Simulation setup page.

## 7. Sources (*General knowledge*: not opened in this session; check before citing)

- IEEE Std 1241 (ADC terminology and test methods; the 2010 revision is the one believed current).
- IEEE Std 1057 (digitizing waveform recorders; sine-fit methods; 2017 revision believed current).
- F. J. Harris, "On the use of windows for harmonic analysis with the discrete Fourier transform", Proc. IEEE 66(1), 1978.
- P. D. Welch, "The use of fast Fourier transform for the estimation of power spectra", IEEE Trans. Audio Electroacoust. 15(2), 1967.
- D. J. Thomson, "Spectrum estimation and harmonic analysis", Proc. IEEE 70(9), 1982 (multitaper).
- N. R. Lomb, Astrophys. Space Sci. 39, 1976; J. D. Scargle, Astrophys. J. 263, 1982 (unevenly sampled spectra).
- L. R. Rabiner, R. W. Schafer, C. M. Rader, "The chirp z-transform algorithm", IEEE Trans. Audio Electroacoust. 17(2), 1969; L. I. Bluestein, 1970 (arbitrary-length FFT).
- R. H. Walden, "Analog-to-digital converter survey and analysis", IEEE J. Sel. Areas Commun. 17(4), 1999.
- W. Kester, Analog Devices tutorial MT-003 on SINAD, ENOB, SNR, THD, THD+N and SFDR.
- R. Schreier and G. C. Temes, *Understanding Delta-Sigma Data Converters*, Wiley/IEEE Press, 2005.
- B. Murmann, ADC Performance Survey (for a later overlay of a design point; BACKLOG).
- matplotlib documentation: default style, `MaxNLocator`, `LogLocator`.
- The repo README (`https://github.com/yotasage/yotasage.github.io`) and the JLC parts plan set, for conventions.
