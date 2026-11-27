# FFT / spectrum analyzer tool: architecture

Everything here is a design to be confirmed by S0, not a record of working code. Items marked **SPIKE** have a default and are confirmed in S0. Definitions of every number the tool prints are in [metrics.md](metrics.md); this file says where they are computed.

## 1. Overview

```
yotasage.github.io/fft/main  (static Next.js page, no network)
  |- data      lib/fft/data/     files -> columns -> signals (streaming, chosen columns only)
  |- worker    lib/fft/worker/   scan, load, resample, analyse off the main thread
  |- dsp       lib/fft/dsp/      FFT, windows, spectrum normalisation, estimators
  |- metrics   lib/fft/metrics/  tones, bin sets, SNR/SNDR/THD/SFDR/ENOB, noise, checks, ...
  |- plot      lib/fft/plot/     PlotSpec -> layout -> draw list -> Canvas | SVG | PDF
  |                              PlotSpec -> TikZ/pgfplots, matplotlib script
  |- export    lib/fft/export/   results as CSV, JSON, LaTeX, Markdown
  |- state     lib/fft/state/    settings schema, link (hash) codec, presets
  '- page      components/Fft/   files, signals, setup, results, plots, diagnostics, exports
```

## 2. Data flow

1. **Drop / paste.** `scan` reads only the head of each file (first 64 KiB for text; the footer for Parquet; the header for `.npy`) and returns the column names, a type guess, a row estimate and the format details found (delimiter, header row, comment lines, decimal comma, SI suffixes).
2. **Pick signals.** The page asks for the chosen columns only; `load` streams them into `Float64Array`s. Unpicked columns are never held in memory.
3. **Build signals.** A signal is single-ended (`a`), differential (`a - b`) or common mode (`(a + b) / 2`), each with gain and offset. Digital codes get a full scale in codes. Auto-pairing proposes `outp/outn`, `vop/von`, `/out+`, `/out-`, `V(outp)`-style names; the user can always pick by hand.
4. **Time grid.** `analyseGrid` classifies the time axis as uniform (relative step spread below a threshold, **SPIKE S0** measures on the sample pool), uniform with gaps, or non-uniform. Non-uniform data is resampled (`metrics.md` §6) with the method and the error bound shown. With no time column the sample rate is typed.
5. **Record.** Start index and length `N` (any integer; the tool can snap to a whole number of cycles of the fundamental); `Auto` window rule; optional drag-select on the time plot.
6. **Analyse.** Window, FFT, normalisation, tone detection, bin sets, metrics, checks. All of it runs in the worker; the result is plain numbers plus the decimated spectra needed for plotting.
7. **Plot and export.** The main thread builds `PlotSpec`s from the results, lays them out, and draws them (screen) or exports them.

## 3. Data model

```ts
export interface Dataset { id: string; name: string; format: 'text' | 'parquet' | 'npy'; columns: ColumnInfo[]; rows: number }
export interface ColumnInfo { name: string; kind: 'float' | 'int' | 'bool' | 'text'; unit?: string; sorted?: boolean }

export type SignalKind = 'single' | 'diff' | 'cm';
export interface SignalDef { id: string; kind: SignalKind; a: ColumnRef; b?: ColumnRef; gain: number; offset: number; unit: 'V' | 'A' | 'code' | 'none' }
export interface TimeGrid { kind: 'uniform' | 'gaps' | 'nonuniform' | 'none'; fs?: number; dtMin?: number; dtMax?: number; dtMedian?: number }

export interface Setup {
  fs: number | null; start: number; n: number;
  window: WindowSpec | 'auto'; estimator: 'dft' | 'welch' | 'goertzel' | 'czt';   // v2 estimators
  fullScale: number | null; bits: number | null; f0Hint: number | null;
  harmonics: number; band: [number, number] | null; conventions: Conventions;     // metrics.md §2
  resample: { method: 'linear' | 'cubic'; fs: number } | null;
}

export interface Analysis { setup: Setup; tone: ToneInfo; bins: BinSets; metrics: MetricValue[]; checks: CheckResult[]; spectrum: SpectrumView }
export interface MetricValue { id: string; value: number; unit: string; convention: string; note?: string }
export interface CheckResult { id: string; level: 'info' | 'warn' | 'error'; params: Record<string, number | string> }
```

`MetricValue.convention` is a short code (for example `snr:excl-harm`) that the page turns into the printed text and that every export carries. Warnings carry parameters, not sentences; the sentences live in `lib/ui/i18n/fft.ts`.

## 4. Worker protocol

One dedicated same-origin worker (`lib/fft/worker/dsp.worker.ts`), created from the page through `lib/fft/worker/client.ts`. **SPIKE S0** checks how the repo's other workers are created in the static export (bundled `new Worker(new URL(...), import.meta.url)` versus a prebuilt script in `public/`) and follows the same pattern.

| Request | Reply | Notes |
|---|---|---|
| `scan { file }` | `ColumnInfo[]`, format details | Reads the head only |
| `load { file, columns, limits }` | typed arrays (transferred) | Streams with `file.stream()` and a `TextDecoder`; own tokenizer writing into growing `Float64Array` chunks |
| `grid { signal }` | `TimeGrid` | |
| `resample { signal, method, fs }` | uniform samples + error bound | |
| `analyse { signals, setup }` | `Analysis` | |
| `cancel { id }` | none | Terminates the job; the worker is recreated if a job cannot be interrupted |

Every request has a numeric `id`; replies carry the same `id` plus `progress` messages. Both sides validate message shape (`security.md` P11). Buffers are transferred, not copied.

## 5. DSP and estimators

- **FFT** (`lib/fft/dsp/fft.ts`): iterative radix-2 (power-of-two N) with precomputed twiddles from direct `Math.cos`/`Math.sin` (no recurrence, so no error build-up); mixed radix for N with small prime factors; Bluestein for any other N. A real-input path packs N real samples into an N/2 complex FFT. A plain O(N^2) DFT exists only as the harness's reference.
- **Normalisation** (`spectrum.ts`): the per-bin power spectrum `P[k]` of `metrics.md` §1, plus amplitude (peak), PSD and ASD views derived from it.
- **Windows** (`windows.ts`, `windowMetrics.ts`): periodic (DFT-even) forms. Each window reports coherent gain, ENBW, highest sidelobe, scalloping loss and the main-lobe half-width in bins, **computed numerically** and checked against the published values in `metrics.md` §7.

| Window | Parameters | Phase |
|---|---|---|
| Rectangular | none | v1 |
| Hann, Hamming, Blackman | none | v1 |
| Blackman-Harris (4-term), Nuttall (4-term), flat-top | none | v1 |
| Kaiser | beta | v1 |
| Dolph-Chebyshev | sidelobe attenuation (dB) | v1 |
| Gaussian, Tukey, Bartlett, Welch | sigma / alpha / none | v1 |

| Estimator | What it is | Phase |
|---|---|---|
| Windowed DFT | One record, one window | v1 |
| Welch / Bartlett | Segments, overlap, window, detrend; power averaging, or vector averaging for phase-locked records | v2 |
| Goertzel | One bin, any frequency (cheap harmonic check) | v2 |
| CZT (zoom FFT) | M points between `f1` and `f2`, via Bluestein | v2 |
| Complex (I/Q) input | Two-sided spectrum, -fs/2 to fs/2 | v2 |
| Lomb-Scargle | Unevenly sampled data without resampling | v3 |
| STFT / spectrogram | Window, hop, heat map | v3 |
| Multitaper (DPSS) | NW, K tapers | v3 |
| Sine fit | 3- and 4-parameter least squares | v3 |

## 6. Plot engine (matplotlib look)

```
PlotSpec --layout--> DrawList --> Canvas backend   (screen, PNG)
                              --> SVG backend       (SVG export)
                              --> PDF backend       (PDF export)
PlotSpec ----------> TikZ/pgfplots writer
PlotSpec + data ---> matplotlib script writer (.py + .csv in a ZIP, fflate)
```

- **`PlotSpec`** (`spec.ts`) holds the figure size, style, axes (scale, limits, labels, units), series (decimated arrays, line/marker style), and annotations (markers, labelled points, shaded spans, reference lines). It contains no pixels and no renderer details, so an interactive renderer can be added later.
- **Look.** Defaults copy matplotlib's default style: figure 6.4 x 4.8 in at 100 dpi, axes box at left 0.125, right 0.9, bottom 0.11, top 0.88 of the figure, all four spines, 0.8 pt axes line, outward ticks (3.5 pt major, 2 pt minor), 1.5 pt lines, 10 pt text, the `tab10` colour cycle, legend frame with rounded corners. Variants: `mpl-default`, `mpl-grid`, `mpl-dark`. The look is a spec and the harness checks it against matplotlib output (`milestones.md` F4a).
- **Ticks** (`ticks.ts`): the same algorithm as matplotlib's `MaxNLocator` (nice steps 1, 2, 2.5, 5, 10 times a power of ten) for linear axes and `LogLocator` with minor ticks for log axes. Tick labels use SI prefixes (kHz, MHz) instead of a scientific-notation offset. Tick positions are tested against a fixture of values generated once with real matplotlib (`scripts/harness/fft/gen-fixtures.py`, run by the owner; the JSON is committed).
- **Decimation** (`decimate.ts`): for display, min/max per pixel column (first, min, max, last), so a 4M-point spectrum draws as fast as a 4k one and narrow spurs never disappear. Exports to vector formats use the same decimation at the export width; CSV/`.py` data exports can carry the full-resolution spectrum.
- **Fonts. SPIKE S0 / Q5:** default is a self-hosted subset of DejaVu Sans (Latin, digits, minus, mu, Omega, plus-minus, degree, subscript digits) loaded with `FontFace` for Canvas, and embedded in PDF if Q5 allows. The fallback is Inter.
- **Screen.** Canvas 2D with `devicePixelRatio` scaling; never inline SVG via `innerHTML` (`security.md` P4). Each plot has an `aria-label` and a text summary (peak, floor, SNDR) for screen readers.
- **Exports** (`F4b`): SVG (text as text, XML-escaped), PNG (offscreen Canvas at a chosen dpi, background light/dark/transparent), PDF (vector, one page the size of the figure), TikZ/pgfplots (`.tex` that compiles as it is, like the resistor tool's), and a matplotlib script that rebuilds the figure from the bundled CSV. S0 finds which PDF and TikZ helpers the QR, resistor and EM tools already use and reuses them.

| Plot | Shows | Phase |
|---|---|---|
| Spectrum | dBFS / dBV / dBm / V per sqrt(Hz); fundamental, harmonics `H2..Hn`, worst spur, noise floor, ideal N-bit floor, excluded bins shaded | v1 |
| Time domain | Waveform with the analysed record highlighted; differential and common mode | v1 |
| Harmonics | Bar chart of HDn (dBc) | v1 |
| Window | Window shape and its frequency response with ENBW and sidelobes | v1 |
| Integrated noise | Cumulative noise (rms) against frequency; input-referred option | v2 |
| Compare | Overlaid spectra from several files, with a FoM table | v2 |
| Sweep | SNDR/SNR/ENOB against fin or amplitude; DR and ERBW markers | v2 |
| Spectrogram | STFT heat map | v3 |

## 7. Page

- **Layout.** Desktop: files and signals on the left, setup and results on the right, plots in the centre in `PillTabs` (Spectrum, Time, Harmonics, Window, ...). Phone (390 px): one column, the same tabs.
- **Setup panel** shows derived values live: bin width `fs/N`, cycles `M`, coherent yes/no, ENBW, main-lobe half-width, the ideal N-bit floor.
- **Results table.** Grouped: Fundamental, Distortion, Noise, Combined (SNDR, ENOB), Spurs. Each row has a value, a unit, and an info button that opens the formula, the convention and its source. Rows can be copied or exported.
- **Diagnostics panel** lists every check `C1`-`C12` that fired, with a sentence and the numbers behind it. A check never hides a result; it travels with it into exports.
- **State.** All settings except data live in one `Setup` object per analysis. The link is `#s=<base64url(JSON)>` (settings only, at most 4 KiB, validated against a strict schema, never triggers file access). Presets (settings only) live in `localStorage` under `fft:presets`, in `try/catch`.
- **Multiple files (v2).** Each file keeps its own signals; "apply these settings to all" runs the same `Setup` on each, and the batch table exports as CSV or LaTeX.
- **Integration with Simulation setup.** **SPIKE S0** reads `lib/simsetup/` and the page for how f0, FS, Ncyc and Npts are named. Default: the Simulation setup page gets an "Open in FFT tool" link carrying `fs`, `f0` and `N` in the link, and the FFT tool shows "Check sampling in Simulation setup" with the numbers passed back. Both are small edits made in F6.

## 8. Module map

Target `< 25 KiB` per file (repo hard limit 40 KiB). All `lib/fft/**/*` and `components/Fft/**/*` compile under `tsconfig.strict.json`.

| File | Responsibility |
|---|---|
| `lib/fft/dsp/fft.ts`, `realfft.ts`, `bluestein.ts` | FFT variants and the reference DFT |
| `lib/fft/dsp/windows.ts`, `windowMetrics.ts` | Window catalogue, numeric window metrics |
| `lib/fft/dsp/spectrum.ts` | `P[k]`, amplitude, PSD, ASD, one-sided/two-sided |
| `lib/fft/dsp/welch.ts`, `goertzel.ts`, `czt.ts` | v2 estimators |
| `lib/fft/metrics/tones.ts` | Fundamental detection, frequency refinement, coherence |
| `lib/fft/metrics/bins.ts` | Signal, DC, harmonic (folded), spur and noise bin sets |
| `lib/fft/metrics/adc.ts` | SNR, SNDR, THD, THD+N, SFDR, ENOB, HDn |
| `lib/fft/metrics/noise.ts` | Noise floor, NSD, integrated and input-referred noise, in-band metrics |
| `lib/fft/metrics/imd.ts`, `interleave.ts`, `jitter.ts`, `fom.ts` | v2 metrics |
| `lib/fft/metrics/checks.ts` | Diagnostics `C1`-`C12` |
| `lib/fft/data/text.ts` | Streaming delimited-text parser, header and unit detection |
| `lib/fft/data/parquet.ts`, `npy.ts` | Binary formats |
| `lib/fft/data/signals.ts`, `pairing.ts` | Single/diff/CM signals, auto-pairing, gain and offset |
| `lib/fft/data/timegrid.ts`, `resample.ts` | Grid classification, resampling with error bound |
| `lib/fft/worker/protocol.ts`, `dsp.worker.ts`, `client.ts` | Worker messages, worker, main-thread client |
| `lib/fft/plot/spec.ts`, `layout.ts`, `ticks.ts`, `scale.ts`, `decimate.ts` | Plot description and layout |
| `lib/fft/plot/draw.ts`, `canvas.ts`, `svg.ts`, `pdf.ts` | Draw list and backends |
| `lib/fft/plot/tikz.ts`, `pyscript.ts`, `themes.ts`, `fonts.ts` | Other writers, styles, fonts |
| `lib/fft/export/results.ts` | CSV (with formula-injection guard), JSON, LaTeX, Markdown |
| `lib/fft/state/settings.ts`, `hash.ts`, `presets.ts` | Schema, link codec, presets |
| `pages/fft/main.tsx` | Route entry (`PageHead`, `ToolHeader`, `data-ds="v2"`, home link) |
| `components/Fft/FftTool.tsx` | Top-level state, worker client, abortable jobs |
| `components/Fft/FilePanel.tsx`, `SignalPicker.tsx` | Files, columns, signal building |
| `components/Fft/SetupPanel.tsx`, `ResultsTable.tsx`, `MetricInfo.tsx` | Setup, results, convention popovers |
| `components/Fft/PlotArea.tsx`, `PlotCanvas.tsx` | Tabs and Canvas drawing |
| `components/Fft/ChecksPanel.tsx`, `ExportBar.tsx`, `StatusBanner.tsx` | Diagnostics, exports, `W1`-`W2` |
| `lib/ui/i18n/fft.ts` | EN and NB strings |
| `styles/Fft.module.css` | Design System v2 tokens, phone-width responsive |

## 9. Performance and memory

- All numbers are Float64. Defaults: at most 2^24 samples per signal and a total budget of about 1 GiB of typed arrays; the page states the limits and what it would take to exceed them (`W2`). **SPIKE S0** measures real allocation limits in Chrome, Edge, Firefox and Opera, and parse throughput and peak memory on a 100 MB file.
- FFT sizes up to 2^20 should finish in well under a second in the worker; S0 records the measured times for 2^16 to 2^24 as the reference. Welch and sweeps reuse twiddle tables.
- Plots are decimated before layout, so redraw cost does not depend on N.
- The main thread never parses or transforms; the worker can be cancelled, and the page shows progress for loads over a second.
