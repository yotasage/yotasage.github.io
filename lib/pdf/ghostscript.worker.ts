// Dedicated browser module Web Worker for Ghostscript WebAssembly.
// Keeps multi-second Ghostscript compression and PDF/A runs off the main UI thread.

import { GhostscriptRunOptions, GhostscriptRunResult, runGhostscriptDirect } from './ghostscriptCore';

interface GsWorkerRequest {
  id: number;
  input: Uint8Array;
  args: string[];
  options?: GhostscriptRunOptions;
}

interface GsWorkerResponse {
  id: number;
  ok: boolean;
  result?: GhostscriptRunResult;
  error?: string;
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<GsWorkerRequest>) => void) | null;
  postMessage: (message: GsWorkerResponse, transfer?: Transferable[]) => void;
};

ctx.onmessage = async (event: MessageEvent<GsWorkerRequest>) => {
  const { id, input, args, options } = event.data;
  try {
    const result = await runGhostscriptDirect(input, args, options);
    const transfer: Transferable[] = result.output ? [result.output.buffer as ArrayBuffer] : [];
    ctx.postMessage({ id, ok: true, result }, transfer);
  } catch (err) {
    ctx.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
