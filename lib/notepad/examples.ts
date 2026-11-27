import type { PaneViewState } from './syncMerge';
import type { LayoutMode, NotepadDoc } from './types';

export type ScratchpadExampleId =
  | 'code-diff'
  | 'markdown-spec'
  | 'csv-bom'
  | 'html-card'
  | 'split-ts-json'
  | 'latex-notes';

export interface ScratchpadExamplePreset {
  id: ScratchpadExampleId;
  code: string;
}

export interface ScratchpadExamplePayload {
  docs: Omit<NotepadDoc, 'id' | 'createdAt' | 'updatedAt'>[];
  layout: LayoutMode;
  paneView?: PaneViewState;
}

export const SCRATCHPAD_EXAMPLE_PRESETS: readonly ScratchpadExamplePreset[] = [
  { id: 'code-diff', code: 'Diff · TS' },
  { id: 'markdown-spec', code: 'MD · Preview' },
  { id: 'csv-bom', code: 'CSV · Table' },
  { id: 'html-card', code: 'HTML · Live' },
  { id: 'split-ts-json', code: 'Split · TS + JSON' },
  { id: 'latex-notes', code: 'LaTeX · .tex' },
];

export function buildScratchpadExample(id: ScratchpadExampleId): ScratchpadExamplePayload {
  switch (id) {
    case 'code-diff':
      return {
        layout: 'diff',
        docs: [
          {
            name: 'adc-config-v1.ts',
            language: 'typescript',
            eol: 'LF',
            encoding: 'utf-8',
            encodingConfidence: 'exact',
            direction: 'ltr',
            pinned: false,
            content: [
              'export interface AdcConfig {',
              '  sampleRateHz: number;',
              '  resolutionBits: number;',
              '  window: "hann" | "rect";',
              '  averages: number;',
              '}',
              '',
              'export const DEFAULT_ADC_CONFIG: AdcConfig = {',
              '  sampleRateHz: 1_000_000,',
              '  resolutionBits: 12,',
              '  window: "rect",',
              '  averages: 1,',
              '};',
              '',
              'export function nyquistHz(cfg: AdcConfig): number {',
              '  return cfg.sampleRateHz / 2;',
              '}',
              '',
            ].join('\n'),
          },
          {
            name: 'adc-config-v2.ts',
            language: 'typescript',
            eol: 'LF',
            encoding: 'utf-8',
            encodingConfidence: 'exact',
            direction: 'ltr',
            pinned: false,
            content: [
              'export interface AdcConfig {',
              '  sampleRateHz: number;',
              '  resolutionBits: number;',
              '  window: "hann" | "blackman-harris" | "rect";',
              '  averages: number;',
              '  coherentBins?: number;',
              '}',
              '',
              'export const DEFAULT_ADC_CONFIG: AdcConfig = {',
              '  sampleRateHz: 100_000_000,',
              '  resolutionBits: 14,',
              '  window: "blackman-harris",',
              '  averages: 4,',
              '  coherentBins: 1753,',
              '};',
              '',
              'export function nyquistHz(cfg: AdcConfig): number {',
              '  return cfg.sampleRateHz * 0.5;',
              '}',
              '',
              'export function idealSnrDb(bits: number): number {',
              '  return 6.02 * bits + 1.76;',
              '}',
              '',
            ].join('\n'),
          },
        ],
      };

    case 'markdown-spec':
      return {
        layout: 'single',
        paneView: { mode: 'split', kind: 'markdown' },
        docs: [
          {
            name: 'rf-front-end-spec.md',
            language: 'markdown',
            eol: 'LF',
            encoding: 'utf-8',
            encodingConfidence: 'exact',
            direction: 'ltr',
            pinned: false,
            content: [
              '# 2.4 GHz RF Front-End Specification',
              '',
              'Compact receiver chain for ISM-band telemetry testing.',
              '',
              '## Link Budget Targets',
              '',
              '| Stage | Gain (dB) | Noise Figure (dB) | IIP3 (dBm) |',
              '| --- | ---: | ---: | ---: |',
              '| Bandpass Filter | -1.4 | 1.4 | +45.0 |',
              '| Low-Noise Amp | +16.5 | 0.9 | +4.0 |',
              '| Step Attenuator | -3.0 | 3.0 | +32.0 |',
              '',
              '## Bring-Up Checklist',
              '',
              '- [x] Verify 50 ohm microstrip geometry on 0.8 mm RO4350B',
              '- [x] Measure S11 return loss better than -15 dB across 2.40–2.48 GHz',
              '- [ ] Capture two-tone IMD3 spectrum at -20 dBm input',
              '',
              '```ts',
              'const friisNf = (f1: number, f2: number, g1: number) => f1 + (f2 - 1) / g1;',
              '```',
              '',
            ].join('\n'),
          },
        ],
      };

    case 'csv-bom':
      return {
        layout: 'single',
        paneView: { mode: 'split', kind: 'csv' },
        docs: [
          {
            name: 'pcb-bom.csv',
            language: 'csv',
            eol: 'LF',
            encoding: 'utf-8',
            encodingConfidence: 'exact',
            direction: 'ltr',
            pinned: false,
            content: [
              'Designator,Value,Package,Quantity,Manufacturer,PartNumber,UnitPriceUSD',
              'U1,STM32G431CBU6,UFQFPN-48,1,STMicroelectronics,STM32G431CBU6,3.42',
              'U2,TPS54202,SOT-23-6,1,Texas Instruments,TPS54202DDCR,0.68',
              'L1,10uH 2.5A,SMD-6x6,1,Wurth Elektronik,7447789110,0.95',
              'C1;C2;C3,100nF 50V X7R,0603,3,Murata,GCM188R71H104KA57D,0.03',
              'C4,22uF 25V X5R,1206,1,Samsung,CL31A226KAHNNNE,0.14',
              'R1;R2,4.7k 1%,0603,2,Yageo,RC0603FR-074K7L,0.01',
              'R3,49.9R 0.1%,0603,1,Vishay,TNPW060349R9BEEA,0.29',
              'J1;J2,SMA Edge Launch 50R,SMA-EDGE,2,Amphenol RF,132289,4.15',
              '',
            ].join('\n'),
          },
        ],
      };

    case 'html-card':
      return {
        layout: 'single',
        paneView: { mode: 'split', kind: 'html' },
        docs: [
          {
            name: 'status-widget.html',
            language: 'html',
            eol: 'LF',
            encoding: 'utf-8',
            encodingConfidence: 'exact',
            direction: 'ltr',
            pinned: false,
            content: [
              '<!doctype html>',
              '<html lang="en">',
              '<head>',
              '  <meta charset="utf-8">',
              '  <style>',
              '    body { font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; padding: 24px; }',
              '    .card { max-width: 420px; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; box-shadow: 0 6px 20px rgba(15,23,42,.06); }',
              '    .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; background: #dcfce7; color: #166534; font-size: 12px; font-weight: 600; }',
              '    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }',
              '    .metric { background: #f1f5f9; border-radius: 10px; padding: 10px; }',
              '    .label { font-size: 11px; color: #475569; text-transform: uppercase; letter-spacing: .04em; }',
              '    .val { font-size: 18px; font-weight: 700; margin-top: 4px; }',
              '  </style>',
              '</head>',
              '<body>',
              '  <article class="card">',
              '    <span class="badge">Bench Supply Online</span>',
              '    <h2 style="margin: 10px 0 4px;">Rail A — 3.3V Logic</h2>',
              '    <p style="margin: 0; color: #475569; font-size: 14px;">Live sandboxed HTML preview inside Scratchpad.</p>',
              '    <div class="grid">',
              '      <div class="metric"><div class="label">Voltage</div><div class="val">3.302 V</div></div>',
              '      <div class="metric"><div class="label">Current</div><div class="val">148 mA</div></div>',
              '      <div class="metric"><div class="label">Power</div><div class="val">0.49 W</div></div>',
              '    </div>',
              '  </article>',
              '</body>',
              '</html>',
              '',
            ].join('\n'),
          },
        ],
      };

    case 'split-ts-json':
      return {
        layout: 'split',
        docs: [
          {
            name: 'telemetry-parser.ts',
            language: 'typescript',
            eol: 'LF',
            encoding: 'utf-8',
            encodingConfidence: 'exact',
            direction: 'ltr',
            pinned: false,
            content: [
              'export interface SensorFrame {',
              '  nodeId: string;',
              '  timestampIso: string;',
              '  tempC: number;',
              '  humidityPct: number;',
              '  batteryMv: number;',
              '}',
              '',
              'export function isLowBattery(frame: SensorFrame): boolean {',
              '  return frame.batteryMv < 3400;',
              '}',
              '',
              'export function summarizeFrames(frames: SensorFrame[]) {',
              '  const avgTemp = frames.reduce((s, f) => s + f.tempC, 0) / Math.max(1, frames.length);',
              '  const alerts = frames.filter(isLowBattery).map((f) => f.nodeId);',
              '  return { count: frames.length, avgTempC: Number(avgTemp.toFixed(2)), alerts };',
              '}',
              '',
            ].join('\n'),
          },
          {
            name: 'telemetry-sample.json',
            language: 'json',
            eol: 'LF',
            encoding: 'utf-8',
            encodingConfidence: 'exact',
            direction: 'ltr',
            pinned: false,
            content: JSON.stringify(
              {
                station: 'lab-north-02',
                frames: [
                  {
                    nodeId: 'env-01',
                    timestampIso: '2026-11-27T08:15:00Z',
                    tempC: 22.4,
                    humidityPct: 44.1,
                    batteryMv: 3810,
                  },
                  {
                    nodeId: 'env-02',
                    timestampIso: '2026-11-27T08:15:05Z',
                    tempC: 23.1,
                    humidityPct: 41.8,
                    batteryMv: 3320,
                  },
                ],
              },
              null,
              2,
            ) + '\n',
          },
        ],
      };

    case 'latex-notes':
      return {
        layout: 'single',
        docs: [
          {
            name: 'rc-filter-derivation.tex',
            language: 'latex',
            eol: 'LF',
            encoding: 'utf-8',
            encodingConfidence: 'exact',
            direction: 'ltr',
            pinned: false,
            content: [
              '\\section{First-Order RC Low-Pass Transfer Function}',
              '',
              'Consider a series resistor $R$ and shunt capacitor $C$ driven by $V_{\\text{in}}(s)$.',
              'Applying voltage division in the Laplace domain yields:',
              '',
              '\\begin{equation}',
              '  H(s) = \\frac{V_{\\text{out}}(s)}{V_{\\text{in}}(s)} = \\frac{1}{1 + s R C}',
              '\\end{equation}',
              '',
              'Evaluating on the imaginary axis $s = j\\omega$ gives the $-3\\,\\text{dB}$ cutoff frequency:',
              '',
              '\\begin{align}',
              '  |H(j\\omega)| &= \\frac{1}{\\sqrt{1 + (\\omega R C)^2}}, \\\\',
              '  f_c &= \\frac{1}{2\\pi R C}.',
              '\\end{align}',
              '',
              '% Tip: Press Ctrl+H to try Regex or Extended Find & Replace across open tabs.',
              '',
            ].join('\n'),
          },
        ],
      };
  }
}
