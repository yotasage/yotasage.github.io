// Dedicated Web Worker for hash and HMAC computation so large files, multi-field batches,
// text decoding (UTF-8/hex/Base64), and pure-JS algorithms never block the UI thread.
//
// In:  { jobId, payload: WorkerInputPayload, algorithms, hmacKey }
// Out: { jobId, type: 'digest', algorithm, rawBytes }
//    | { jobId, type: 'done', byteLength }
//    | { jobId, type: 'error', message }

import { computeDigestAsync, parseTextToBytes } from './engine';
import type { HashAlgorithmId, WorkerInputPayload } from './types';

export interface HashWorkerRequest {
  jobId: number;
  payload: WorkerInputPayload;
  algorithms: readonly HashAlgorithmId[];
  hmacKey: Uint8Array | null;
}

const SPEED_RANK: Readonly<Record<HashAlgorithmId, number>> = {
  'SHA-256': 1,
  'SHA-1': 2,
  'SHA-512': 3,
  'SHA-384': 4,
  CRC32: 5,
  'Adler-32': 6,
  MD5: 7,
  'SHA-224': 8,
  'BLAKE2s-256': 9,
  'RIPEMD-160': 10,
  'SHA3-256': 11,
  'BLAKE2b-256': 12,
  'SHA3-512': 13,
};

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<HashWorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = async (event: MessageEvent<HashWorkerRequest>) => {
  const { jobId, payload, algorithms, hmacKey } = event.data;
  try {
    let bytes: Uint8Array;
    if (payload.kind === 'blob') {
      bytes = new Uint8Array(await payload.blob.arrayBuffer());
    } else if (payload.kind === 'text') {
      const parsed = parseTextToBytes(payload.text, payload.textEncoding);
      if ('error' in parsed) {
        scope.postMessage({ jobId, type: 'error', message: parsed.error });
        return;
      }
      bytes = parsed.bytes;
    } else {
      bytes = payload.bytes;
    }

    const ordered = [...algorithms].sort((a, b) => (SPEED_RANK[a] ?? 99) - (SPEED_RANK[b] ?? 99));

    for (const algo of ordered) {
      const rawBytes = await computeDigestAsync(algo, bytes, hmacKey);
      const transfer: Transferable[] =
        rawBytes.buffer instanceof ArrayBuffer ? [rawBytes.buffer] : [];
      scope.postMessage({ jobId, type: 'digest', algorithm: algo, rawBytes }, transfer);
    }

    scope.postMessage({ jobId, type: 'done', byteLength: bytes.byteLength });
  } catch (err) {
    scope.postMessage({
      jobId,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
