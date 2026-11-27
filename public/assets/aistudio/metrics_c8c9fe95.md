# FFT / spectrum analyzer tool: figures of merit

This file fixes what every printed number means, so the engine steps (F1, F2, F7, F8, ...) have an exact target and the page can show the same definition next to each result. Items marked *(confirm in S0)* are background facts from memory that S0 checks against the cited standards before the code relies on them. Defaults marked **Q3** await the owner's approval.

## 0. Notation

Record `x[n]`, `n = 0..N-1`, sample rate `fs`, window `w[n]`, `X[k]` the DFT of `x[n]·w[n]`, bins `k = 0..N/2`, bin width `df = fs/N`. Fundamental at `f0`, in bin `k0`, `M = f0·N/fs` cycles in the record. Full scale `FS` is the peak-to-peak span of the signal (differential volts for a differential signal, or `2^bits` codes), so a full-scale sine has peak `FS/2` and power `FS^2/8`. `Pfs = FS^2/8` is the 0 dBFS reference.

## 1. Spectrum normalisation and bin sums (decision D5)

One per-bin power spectrum, in signal units squared (rms):

```
P[k] = 2 |X[k]|^2 / (N * S2)      for 0 < k < N/2        S2 = sum(w[n]^2)
P[0] = |X[0]|^2 / (N * S2)         P[N/2] = |X[N/2]|^2 / (N * S2)
```

Consequences, all checked by the harness:

- **Parseval.** `sum(P[k]) = mean((x·w)^2) * N / S2`, which equals the mean square of `x` for a stationary signal. Check `C7` compares the two.
- **Noise.** White noise of variance `s^2` gives `E[P[k]] = 2 s^2 / N` for every window, so per-bin noise needs no ENBW correction. The noise density is `P[k] / df` (V^2/Hz, one-sided).
- **Tones.** The power of a tone is the sum of `P[k]` over the bins of its main lobe, whether or not the record is coherent. A tone of peak amplitude `A` has power `A^2/2`.
- **Peak amplitude readout** (for the plot label only): `A_peak = 2 |X[k]| / (N * CG)` with `CG = sum(w)/N`. It is exact only for a bin-centred tone; figures of merit use bin sums, never this readout.
- **Ideal N-bit quantiser floor** (reference line): per-bin power `Pfs * 2/(3 * 2^(2*bits)) * 2/N`, which is `-(6.02*bits + 1.76) - 10 log10(N/2)` dBFS per bin. Window independent.
- **Log of the mean, not mean of the log.** A single-record noise bin is chi-square distributed with 2 degrees of freedom, so the mean of `10 log10(P)` sits about 2.5 dB below `10 log10(mean(P))` *(confirm in S0)*. The tool averages power first, then converts to dB, and says so next to the floor.

## 2. Conventions and defaults (**Q3**)

| Setting | Default | Alternatives |
|---|---|---|
| Harmonics counted in THD | 2nd to 10th | any 2 to 50 |
| SNR | Excludes DC, signal and harmonic bins | Harmonics counted as noise |
| SNDR / SINAD | All bins except DC and signal count as noise plus distortion | none |
| THD sign | Negative dBc, also shown in % | positive dB |
| ENOB full-scale correction | On when `FS` is given, off otherwise (shown) | Off always |
| SFDR span | 0 to fs/2 (DC and signal bins excluded) | any band `[f1, f2]` |
| SFDR reference | dBc (also dBFS, both shown) | dBc only |
| Noise-bin compensation | Off | Scale noise to the full band when bins were excluded |
| Window | Auto: rectangular if coherent, else 4-term Blackman-Harris | any window |
| Fundamental | Largest local maximum outside DC bins | typed `f0`, or a click on the plot |
| Signal and harmonic bin half-width | Window's main-lobe half-width (table in §7) | typed |
| DC bins excluded | Same half-width as the signal | typed |
| Coherence test | `abs(M - round(M)) <= 1e-3` and `gcd(round(M), N) = 1` | typed tolerance |

## 3. Tone detection and bin sets (`lib/fft/metrics/tones.ts`, `bins.ts`)

- **Fundamental.** Largest local maximum of `P[k]` outside the DC bins, unless `f0` is given. Its frequency is refined by quadratic interpolation of the log magnitude of the three bins around the maximum (exact for a coherent record, a good estimate otherwise). **Check `C5`/`C8`** fire when the estimate is not good enough: an error of `d` bins in `f0` becomes `h·d` bins at harmonic `h`, so the tool warns when `H·d` exceeds about half the main-lobe half-width, and suggests typing `f0` (or, in v3, a sine fit).
- **Signal bins.** `k0 ± m`, `m` = main-lobe half-width of the window (zero for a rectangular window on a coherent record).
- **DC bins.** `0..m_dc`. Excluded from noise, SNR and SNDR.
- **Harmonic `h` (2..H).** `f_h = h·f0 mod fs`; if `f_h > fs/2` then `f_h = fs - f_h` (folding). Bins `round(f_h·N/fs) ± m`. A harmonic whose bins overlap the signal, DC or an earlier harmonic is assigned to the earlier set and reported by check `C5`.
- **Noise bins.** Everything else between the DC bins and `N/2` (or the chosen band), minus user-excluded bands.
- **Spur.** A local maximum of `P[k]` outside the signal and DC bins; its power is the sum over `±m` bins around it, so spurs and signal are measured the same way.

## 4. Figures of merit

Powers are bin sums of `P[k]` (§1). `Psig` is the signal power, `Pthd` the sum of harmonic powers, `Pnoise` the noise-bin power. ID in the first column is used in code, exports and the info popovers.

| ID | Name | Definition | Phase |
|---|---|---|---|
| `M-FUND` | Fundamental | Frequency `f0`, power `Psig`; amplitude as dBFS, dBV (rms, for the signal unit) and dBm (needs a reference impedance); peak amplitude `sqrt(2·Psig)` | v1 |
| `M-SNR` | SNR | `10 log10(Psig / Pnoise)` | v1 |
| `M-THD` | THD | `10 log10(Pthd / Psig)` (dBc), and `100·sqrt(Pthd/Psig)` % | v1 |
| `M-HD` | HD2..HDn | `10 log10(P_h / Psig)` per harmonic, with its folded frequency | v1 |
| `M-SNDR` | SNDR / SINAD | `10 log10(Psig / (Pnoise + Pthd))` | v1 |
| `M-THDN` | THD+N | `10 log10((Pnoise + Pthd) / Psig)` | v1 |
| `M-SFDR` | SFDR | `10 log10(Psig / Pspur_max)` in dBc and `10 log10(Pfs / Pspur_max)` in dBFS; spur frequency; whether it is a harmonic; also the worst non-harmonic spur | v1 |
| `M-ENOB` | ENOB | `(SNDR - 1.76 + 20 log10(FS / (2·Apk))) / 6.02` with the correction, `(SNDR - 1.76) / 6.02` without; `Apk` is the measured fundamental peak | v1 |
| `M-NF` | Noise floor | Mean noise power per bin (dBFS), noise density `10 log10(mean(P)/df)` (dBFS/Hz or V^2/Hz) and ASD (V per sqrt(Hz)); ideal N-bit floor as a reference | v1 |
| `M-STAT` | Signal statistics | Mean (offset), rms, peak-to-peak, min, max, crest factor, clipped-sample fraction, `M` cycles, coherence | v1 |
| `M-NINT` | Integrated noise | `sqrt(sum P)` over `[f1, f2]`, excluding signal and harmonics; input-referred by dividing by a gain | v2 |
| `M-INB` | In-band SNR/SNDR | Band `[0, fB]`, `OSR = fs/(2·fB)`; only harmonics **inside** the band count as distortion | v2 |
| `M-IMD` | IMD2, IMD3 | Two tones `f1`, `f2`: IM2 at `f2-f1`, `f1+f2`; IM3 at `2f1-f2`, `2f2-f1` (and `2f1+f2`, `2f2+f1`); each in dBc against the weaker tone | v2 |
| `M-IP3` | IIP3, OIP3 | `OIP3 = P_tone,out + (P_tone - P_IM3)/2` (dB differences, one tone's output level); `IIP3 = OIP3 - gain` | v2 |
| `M-ILV` | Interleaving spurs | For `M_ch` channels: offset spurs at `k·fs/M_ch`; gain/timing spurs at `\|k·fs/M_ch ± fin\|`, folded; each classified and reported | v2 |
| `M-JIT` | Jitter-limited SNR | `-20 log10(2π·fin·σt)`; the inverse gives the equivalent rms jitter if the whole noise were jitter (an upper bound) | v2 |
| `M-FOMW` | Walden FoM | `P / (2^ENOB · fs)` in J per conversion step (`fs` replaced by `2·BW` for oversampled converters); needs the power `P` | v2 |
| `M-FOMS` | Schreier FoM | `SNDR + 10 log10(BW / P)` dB, `BW = fs/2` for Nyquist converters, `fB` for oversampled | v2 |
| `M-DR` | Dynamic range | From an amplitude sweep: input level where SNR extrapolates to 0 dB, relative to full scale; or `Pfs` over the small-signal noise power | v2 |
| `M-ERBW` | ERBW | From a fin sweep: input frequency where SNDR has dropped 3 dB (0.5 bit of ENOB) from its low-frequency value *(confirm definition against IEEE 1241 and Walden in S0)* | v2 |
| `M-SINEFIT` | Sine-fit SINAD/ENOB | 3- and 4-parameter least-squares sine fit (IEEE 1057/1241 style); residual rms gives SINAD; robust for non-coherent records | v3 |
| `M-INL` | INL/DNL, offset, gain | Code-density histogram of a sine (arcsine-corrected) or ramp input | v3 |
| `M-PN` | Phase noise, jitter, ref. spurs | Carrier mode: `L(f)` in dBc/Hz from `P[k]`, integrated rms jitter between offsets, spur table | v3 |

`bits` is optional; with it the table also shows the ideal `6.02·bits + 1.76` dB and the ENOB deficit.

## 5. Diagnostics

Each check returns a level, parameters, and an i18n key. A check never removes a result.

| ID | Level | Fires when |
|---|---|---|
| `C1` | info/warn | Record not coherent (`M` not integer within tolerance, or `gcd(M, N) != 1`); warn if the window is rectangular |
| `C2` | warn | Signal bins touch the DC bins or fs/2 |
| `C3` | warn | At least 0.1 % of samples sit at the record's min or max value, or the peak exceeds `FS/2` |
| `C4` | info/warn | Time grid not uniform, so the data was resampled (notice `W3`); warn if the error bound is within 20 dB of the SNDR |
| `C5` | warn | A harmonic overlaps the signal, DC or another harmonic; or the `f0` estimate is too coarse for the harmonic count |
| `C6` | info | DC offset larger than the signal amplitude (leakage from DC) |
| `C7` | error | Parseval sum differs from the time-domain mean square by more than 1e-9 relative (an engine self-check) |
| `C8` | warn | Strongest peak less than 10 dB above the median noise bin, or two peaks within 3 dB (multi-tone suspicion) |
| `C9` | info/warn | ENOB full-scale correction larger than 6 dB in magnitude, or `FS` missing |
| `C10` | warn | Window leakage floor (highest sidelobe plus scalloping) above the measured noise floor on a non-coherent record |
| `C11` | info | SNDR above 100 dB: simulator tolerances (relative and absolute tolerance, integration method, strobe settings) can limit this; compare with a tighter run |
| `C12` | error/warn | Non-finite samples (NaN/Inf) or time-axis gaps found; counts reported; the analysis refuses to run on non-finite samples until they are cut or masked |

## 6. Non-uniform data and resampling

Variable-step transient data cannot go straight into an FFT. `lib/fft/data/resample.ts` resamples to a uniform `fs` (default `1/dt_median`, editable) with linear or cubic-spline interpolation and returns an **error bound** with the data:

- Linear interpolation: `max|x''|·h^2 / 8`, with `h` the largest local step and `x''` estimated numerically.
- Cubic spline: about `(5/384)·h^4·max|x''''|` for a clamped spline *(confirm in S0)*.

The bound is shown in dB below the signal and compared with the SNDR (check `C4`). Resampling cannot recover information finer than the original steps; when the bound is too large the page recommends a strobed (fixed-step) re-run of the simulation or, in v3, Lomb-Scargle on the original samples. A uniform grid with gaps is reported, not repaired.

## 7. Reference values for validation

Used by the harness in `scripts/harness/fft/`. The window numbers are the tabulated values from Harris (1978) as remembered; F1 recomputes them numerically and S0 confirms them *(confirm in S0)*.

| Window | ENBW (bins) | Highest sidelobe (dB) | Scalloping loss (dB) | Main-lobe half-width (bins) |
|---|---|---|---|---|
| Rectangular | 1.00 | -13.3 | 3.92 | 1 (0 used when coherent) |
| Hann | 1.50 | -31.5 | 1.42 | 2 |
| Hamming | 1.36 | -42.7 | 1.78 | 2 |
| Blackman | 1.73 | -58 | 1.10 | 3 |
| Blackman-Harris (4-term) | 2.00 | -92 | 0.83 | 4 |
| Flat-top | about 3.8 | about -90 (varies by definition) | about 0.01 | 5 |

Exact-solution cases (tolerances are starting values F2 may tighten):

1. **Ideal N-bit quantiser.** A coherent full-scale sine, `M` prime, `N = 2^16`, quantised to 8, 10, 12 and 14 bits, gives SNDR within 0.3 dB of `6.02·bits + 1.76`, and ENOB within 0.05 bit of `bits`.
2. **Injected harmonics.** `x = A sin(w t) + a2 sin(2 w t) + a3 sin(3 w t)` on a coherent record with a rectangular window: THD, HD2, HD3 and SFDR equal the analytic values to 1e-6 dB.
3. **Folding.** `fs = 1`, `f0 = 0.3`: harmonics 2..10 land on the bins given by brute-force folding; a harmonic that falls on the fundamental is flagged by `C5`.
4. **Noise.** White Gaussian noise with known variance: per-bin mean power equals `2 s^2/N` (within the statistical error), noise density matches, and the log-mean offset is about 2.5 dB.
5. **Window metrics.** ENBW, sidelobe and scalloping agree with the table above to 0.02 bins / 0.2 dB.
6. **Parseval.** `C7` quantity below 1e-12 on all test records.
7. **Resampling.** A sine on a jittered grid, resampled, stays within the reported error bound.
8. **Two-tone.** Two tones plus a known third-order term give IM3 and OIP3 matching the analytic values.
9. **numpy/scipy parity.** Spectra from `numpy.fft` with `scipy.signal.get_window` windows, and averaged spectra from `scipy.signal.welch`, agree to 1e-9 relative.
10. **Owner references.** Results on the sample pool agree with the owner's reference numbers (Q2) to 0.1 dB, or each difference is explained in `notes-F2.md` (usually a convention: harmonic count, SNR definition, window).
