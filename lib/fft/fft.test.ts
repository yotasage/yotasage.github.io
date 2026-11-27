// Comprehensive node:test suite for the FFT / Spectrum Analyzer engine,
// plot exporters, result exporters, settings state, and security boundaries.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { fftComplex, fftReal, goertzel, refDft, zoomFftCzt } from './dsp/fft';
import { computeWindowMetrics } from './dsp/windows';
import { computeWelchSpectrum, computeWindowedSpectrum } from './dsp/spectrum';
import { analyseTimeGrid, resampleSignal } from './data/timegrid';
import { parseNpyDataset, parseTextDataset } from './data/parsers';
import { generateBuiltinPreset } from './data/presets';
import { analyzeDataset, createDefaultSetup, foldFrequency } from './metrics/analyze';
import { buildPlotSpec } from './plot/engine';
import {
  exportPlotMatplotlibZip,
  exportPlotSvg,
  exportPlotTikz,
  pyStringLiteral,
  sanitizeCsvCell,
} from './plot/exporters';
import { exportResultsCsv, exportResultsLatex } from './export/results';
import { decodeSettingsHash, encodeSettingsHash } from './state/settings';
import type { SignalDef } from './types';

function approx(actual: number, expected: number, tol: number, label = ''): void {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected} ± ${tol}, got ${actual}`,
  );
}

describe('FFT core algorithms (radix-2, Bluestein, Goertzel, CZT)', () => {
  for (const n of [16, 64, 127, 1000, 1009]) {
    it(`matches O(N^2) reference DFT within 1e-11 for N=${n}`, () => {
      const re = new Float64Array(n);
      const im = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        re[i] = Math.cos((2 * Math.PI * 7 * i) / n) + 0.3 * Math.sin((2 * Math.PI * 19 * i) / n);
        im[i] = 0.2 * Math.sin((2 * Math.PI * 3 * i) / n);
      }
      const ref = refDft(re, im);
      const fast = fftComplex(re, im);

      let err2 = 0;
      let ref2 = 0;
      for (let k = 0; k < n; k++) {
        const dr = fast.re[k] - ref.re[k];
        const di = fast.im[k] - ref.im[k];
        err2 += dr * dr + di * di;
        ref2 += ref.re[k] * ref.re[k] + ref.im[k] * ref.im[k];
      }
      const relRms = Math.sqrt(err2 / ref2);
      assert.ok(relRms < 1e-11, `relRms=${relRms} for N=${n}`);
    });
  }

  it('fftReal matches complex FFT on real input', () => {
    const n = 256;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 13 * i) / n) + 0.1 * Math.cos((2 * Math.PI * 41 * i) / n);
    const r = fftReal(x);
    const c = fftComplex(x, new Float64Array(n));
    for (let k = 0; k <= n / 2; k++) {
      approx(r.re[k], c.re[k], 1e-11, `re[${k}]`);
      approx(r.im[k], c.im[k], 1e-11, `im[${k}]`);
    }
  });

  it('Goertzel matches exact DFT at integer bin', () => {
    const n = 200;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 17 * i) / n);
    const g = goertzel(x, 17, n);
    approx(Math.sqrt(g.magSq), n / 2, 1e-9, 'goertzel mag');
  });

  it('Zoom FFT (CZT) peaks sharply at an off-bin tone frequency', () => {
    const n = 512;
    const fs = 1000;
    const f0 = 123.45;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * f0 * i) / fs);
    const z = zoomFftCzt(x, fs, 115, 132, 400);
    let maxIdx = 0;
    let maxMag = 0;
    for (let i = 0; i < z.freqs.length; i++) {
      const m = Math.hypot(z.re[i], z.im[i]);
      if (m > maxMag) {
        maxMag = m;
        maxIdx = i;
      }
    }
    approx(z.freqs[maxIdx], f0, 0.15, 'CZT peak freq');
  });
});

describe('Window functions vs Harris (1978) & Parseval conservation', () => {
  const defaultParams = { kaiserBeta: 14, chebyshevDb: 100, gaussianSigma: 0.4, tukeyAlpha: 0.5 };

  it('computes accurate coherent gain & ENBW for Hann, Blackman-Harris, and Flat-Top', () => {
    const hann = computeWindowMetrics('hann', 1024, defaultParams);
    approx(hann.coherentGain, 0.5, 0.002, 'Hann CG');
    approx(hann.enbwBins, 1.5, 0.005, 'Hann ENBW');

    const bh = computeWindowMetrics('blackman-harris', 1024, defaultParams);
    approx(bh.coherentGain, 0.35875, 0.002, 'BH4 CG');
    approx(bh.enbwBins, 2.004, 0.01, 'BH4 ENBW');
    assert.ok(bh.highestSidelobeDb < -90, `BH4 sidelobe ${bh.highestSidelobeDb}`);

    const ft = computeWindowMetrics('flattop', 1024, defaultParams);
    assert.ok(ft.scallopingLossDb < 0.05, `Flattop scalloping ${ft.scallopingLossDb}`);
  });

  it('satisfies Parseval power identity < 1e-12 across windows', () => {
    const n = 1024;
    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * 37 * i) / n) + 0.25;
    for (const kind of ['rectangular', 'hann', 'blackman-harris'] as const) {
      const spec = computeWindowedSpectrum(x, 1e6, kind, defaultParams);
      assert.ok(spec.parsevalRelError < 1e-12, `Parseval error ${spec.parsevalRelError} for ${kind}`);
    }
  });

  it('Welch PSD recovers white noise total variance', () => {
    const n = 8192;
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const x = new Float64Array(n);
    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const u1 = Math.max(1e-12, rand());
      const u2 = rand();
      x[i] = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      varSum += x[i] * x[i];
    }
    const timeVar = varSum / n;
    const res = computeWelchSpectrum(x, 1e6, 'hann', defaultParams, 8, 0.5, 'mean');
    let freqVar = 0;
    for (let k = 0; k < res.power.length; k++) freqVar += res.power[k];
    approx(freqVar / timeVar, 1.0, 0.15, 'Welch variance ratio');
  });
});

describe('Figures of merit, folded harmonics, presets & diagnostics', () => {
  it('measures ~72.5 dB SNDR and ~11.8 bits ENOB on the 12-bit differential preset (coherently sampled)', () => {
    const ds = generateBuiltinPreset('adc-12bit');
    const sig: SignalDef = {
      kind: ds.defaultKind,
      timeCol: ds.defaultTimeCol,
      colA: ds.defaultSigACol,
      colB: ds.defaultSigBCol,
      gain: 1,
      offset: 0,
      unit: 'V',
    };
    const setup = createDefaultSetup({
      fs: ds.defaultFs!,
      n: ds.rows,
      fullScale: ds.defaultFullScale,
      bits: ds.defaultBits,
      window: 'auto',
    });
    const res = analyzeDataset(ds, sig, setup);
    assert.equal(res.resolvedWindow, 'rectangular');
    assert.equal(res.tone.isCoherent, true);
    const sndr = res.metrics.find((m) => m.id === 'M-SNDR')!.value!;
    const enob = res.metrics.find((m) => m.id === 'M-ENOB')!.value!;
    assert.ok(sndr > 70 && sndr < 75, `12-bit SNDR=${sndr}`);
    assert.ok(enob > 11.4 && enob < 12.2, `12-bit ENOB=${enob}`);
  });

  it('triggers C1 and C10 on non-coherent signal with rectangular window, and recovers clean HD3 with Blackman-Harris', () => {
    const ds = generateBuiltinPreset('non-coherent');
    const sig: SignalDef = {
      kind: 'single',
      timeCol: ds.defaultTimeCol,
      colA: ds.defaultSigACol,
      colB: null,
      gain: 1,
      offset: 0,
      unit: 'V',
    };
    const rectRes = analyzeDataset(
      ds,
      sig,
      createDefaultSetup({ fs: ds.defaultFs!, n: ds.rows, fullScale: ds.defaultFullScale, window: 'rectangular' }),
    );
    assert.ok(rectRes.checks.some((c) => c.id === 'C1'), 'Expected C1 non-coherent warning');
    assert.ok(rectRes.checks.some((c) => c.id === 'C10'), 'Expected C10 rectangular leakage error');

    const bhRes = analyzeDataset(
      ds,
      sig,
      createDefaultSetup({ fs: ds.defaultFs!, n: ds.rows, fullScale: ds.defaultFullScale, window: 'blackman-harris' }),
    );
    const hd3 = bhRes.harmonics.find((h) => h.order === 3)!;
    // Preset injects 3.2e-4 amplitude => 20*log10(3.2e-4) = -69.90 dBc
    approx(hd3.dbc, -69.9, 1.0, 'HD3 dBc');
  });

  it('detects folded harmonics accurately across Nyquist zones', () => {
    const f = foldFrequency(700, 1000);
    approx(f.folded, 300, 1e-9, 'folded 700 Hz @ 1000 Hz fs');
    assert.equal(f.zone, 2);
  });

  it('measures two-tone IMD3 & OIP3 on two-tone preset', () => {
    const ds = generateBuiltinPreset('two-tone');
    const sig: SignalDef = {
      kind: 'single',
      timeCol: ds.defaultTimeCol,
      colA: ds.defaultSigACol,
      colB: null,
      gain: 1,
      offset: 0,
      unit: 'V',
    };
    const res = analyzeDataset(
      ds,
      sig,
      createDefaultSetup({
        fs: ds.defaultFs!,
        n: ds.rows,
        fullScale: ds.defaultFullScale,
        twoToneMode: true,
      }),
    );
    assert.ok(res.secondTone !== null, 'Second tone detected');
    const imd = res.metrics.find((m) => m.id === 'M-IMD');
    assert.ok(imd && imd.value !== null && imd.value < -30, `IMD3=${imd?.value}`);
  });

  it('measures interleaving spurs on 4-channel interleaved preset', () => {
    const ds = generateBuiltinPreset('interleaved-4ch');
    const sig: SignalDef = {
      kind: 'single',
      timeCol: ds.defaultTimeCol,
      colA: ds.defaultSigACol,
      colB: null,
      gain: 1,
      offset: 0,
      unit: 'V',
    };
    const res = analyzeDataset(
      ds,
      sig,
      createDefaultSetup({
        fs: ds.defaultFs!,
        n: ds.rows,
        fullScale: ds.defaultFullScale,
        interleaveChannels: 4,
      }),
    );
    assert.ok(res.interleaveSpurs.length > 0, 'Interleave spurs detected');
    const maxSpur = Math.max(...res.interleaveSpurs.map((s) => s.dbc));
    assert.ok(maxSpur > -75 && maxSpur < -40, `Interleave spur max=${maxSpur} dBc`);
  });

  it('classifies variable-step SPICE data, resamples with cubic spline, and fires C4', () => {
    const ds = generateBuiltinPreset('variable-step');
    const t = ds.data[0];
    const grid = analyseTimeGrid(t);
    assert.equal(grid.kind, 'nonuniform');
    const rs = resampleSignal(t, ds.data[1], 'cubic', ds.defaultFs!);
    assert.equal(rs.report.applied, true);
    assert.ok(rs.report.errorBoundDbBelowSig < -40, `error bound ${rs.report.errorBoundDbBelowSig}`);

    const sig: SignalDef = {
      kind: 'single',
      timeCol: 0,
      colA: 1,
      colB: null,
      gain: 1,
      offset: 0,
      unit: 'V',
    };
    const res = analyzeDataset(
      ds,
      sig,
      createDefaultSetup({ fs: ds.defaultFs!, n: 2048, fullScale: ds.defaultFullScale, resampleMethod: 'cubic' }),
    );
    assert.ok(res.checks.some((c) => c.id === 'C4'), 'Expected C4 resampled notice');
  });
});

describe('Security boundaries & parser/exporter hardening', () => {
  it('rejects NumPy .npy object/pickle arrays and shape overflows', () => {
    const makeNpy = (header: string, payloadBytes = 16): ArrayBuffer => {
      const hBytes = new TextEncoder().encode(header + '\n');
      const pad = (16 - ((10 + hBytes.length) % 16)) % 16;
      const totalH = hBytes.length + pad;
      const buf = new ArrayBuffer(10 + totalH + payloadBytes);
      const u8 = new Uint8Array(buf);
      u8.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 0x01, 0x00], 0);
      new DataView(buf).setUint16(8, totalH, true);
      u8.set(hBytes, 10);
      for (let i = 0; i < pad; i++) u8[10 + hBytes.length + i] = 0x20;
      return buf;
    };

    assert.throws(
      () => parseNpyDataset(makeNpy("{'descr': '|O', 'fortran_order': False, 'shape': (2,), }"), 'evil.npy', 't-evil'),
      /object|pickle|unsupported/i,
    );
    assert.throws(
      () => parseNpyDataset(makeNpy("{'descr': '<f8', 'fortran_order': False, 'shape': (999999999,), }"), 'bomb.npy', 't-bomb'),
      /limit|truncated/i,
    );
  });

  it('auto-detects differential pairs and SPICE suffixes in CSV text', () => {
    const csv = [
      'time,v(outp),v(outn)',
      '0u,1.25,0.75',
      '1u,1.50,0.50',
      '2u,1.25,0.75',
      '3u,1.00,1.00',
    ].join('\n');
    const ds = parseTextDataset(csv, 'diff.csv', 't-diff');
    assert.equal(ds.defaultKind, 'diff');
    assert.equal(ds.defaultTimeCol, 0);
    assert.equal(ds.defaultSigACol, 1);
    assert.equal(ds.defaultSigBCol, 2);
    approx(ds.data[0][1], 1e-6, 1e-12, '1u suffix');
  });

  it('prevents CSV formula injection, SVG XML injection, TikZ LaTeX injection, and Python breakout', () => {
    assert.equal(sanitizeCsvCell('=CMD|"/C calc"!A0'), `"'=CMD|""/C calc""!A0"`);
    assert.equal(sanitizeCsvCell('+1+2'), "'+1+2");
    assert.equal(pyStringLiteral(`evil" + __import__('os').system('id')`), JSON.stringify(`evil" + __import__('os').system('id')`));

    const ds = generateBuiltinPreset('adc-12bit');
    ds.name = '=HYPERLINK("x") <script>alert(1)</script> \\write18{id}';
    const sig: SignalDef = { kind: 'single', timeCol: 0, colA: 1, colB: null, gain: 1, offset: 0, unit: 'V' };
    const res = analyzeDataset(ds, sig, createDefaultSetup({ fs: 1e6, n: 1024, fullScale: 1 }));
    const spec = buildPlotSpec(res, 'spectrum', {
      yUnit: 'dBFS',
      xScale: 'linear',
      themeId: 'mpl-default',
      showMarkers: true,
      showIdealFloor: true,
      showNoiseFloor: true,
    });

    const svg = exportPlotSvg(spec);
    assert.ok(!svg.includes('<script>'), 'SVG must escape <script>');

    const tikz = exportPlotTikz(spec);
    assert.ok(!tikz.includes('\\write18{id}'), 'TikZ must escape \\write18');

    const latex = exportResultsLatex(res);
    assert.ok(!latex.includes('\\write18{id}'), 'LaTeX results must escape \\write18');

    const csv = exportResultsCsv(res);
    assert.ok(csv.includes('Metric,'), 'CSV generated');

    const zipBytes = exportPlotMatplotlibZip(spec);
    assert.ok(zipBytes.byteLength > 200, 'Matplotlib ZIP generated');
  });

  it('rejects malformed or prototype-polluting #s= URL hashes and caps length at 4 KiB', () => {
    const valid = encodeSettingsHash({
      v: 1,
      setup: createDefaultSetup({ fs: 2e6, n: 2048, window: 'hann' }),
      yUnit: 'dBV',
      xScale: 'log',
      plotTheme: 'mpl-grid',
    });
    const decoded = decodeSettingsHash(valid);
    assert.ok(decoded !== null);
    assert.equal(decoded!.setup.fs, 2e6);
    assert.equal(decoded!.setup.window, 'hann');
    assert.equal(decoded!.yUnit, 'dBV');

    assert.equal(decodeSettingsHash('#s=' + 'A'.repeat(5000)), null);
    assert.equal(decodeSettingsHash('#s=not!valid!base64'), null);

    // Prototype pollution payload
    const poisonJson = '{"v":1,"__proto__":{"polluted":true},"setup":{"fs":1000,"window":"evil"}}';
    const poisonHash = `#s=${Buffer.from(poisonJson).toString('base64url')}`;
    const safe = decodeSettingsHash(poisonHash);
    assert.ok(safe !== null);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(safe!.setup.window, 'auto');
  });
});
