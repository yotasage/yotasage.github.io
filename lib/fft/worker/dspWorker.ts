// Dedicated Web Worker for heavy FFT / Welch / Resampling computation.
import type { AnalysisResult, ParsedDataset, Setup, SignalDef } from '../types';
import { analyzeDataset } from '../metrics/analyze';

export interface WorkerAnalyzeRequest {
  id: number;
  kind: 'analyze';
  dataset: ParsedDataset;
  signal: SignalDef;
  setup: Setup;
}

export interface WorkerAnalyzeResponse {
  id: number;
  ok: true;
  result: AnalysisResult;
}

export interface WorkerErrorResponse {
  id: number;
  ok: false;
  error: string;
}

self.onmessage = (ev: MessageEvent<WorkerAnalyzeRequest>) => {
  const msg = ev.data;
  if (!msg || msg.kind !== 'analyze') return;
  try {
    const result = analyzeDataset(msg.dataset, msg.signal, msg.setup);
    const resp: WorkerAnalyzeResponse = { id: msg.id, ok: true, result };
    self.postMessage(resp);
  } catch (err) {
    const resp: WorkerErrorResponse = {
      id: msg.id,
      ok: false,
      error: err instanceof Error ? err.message : 'Analysis failed',
    };
    self.postMessage(resp);
  }
};
