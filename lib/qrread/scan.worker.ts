// The worker that reads codes in images, so a large photo or a camera frame does not hold up the page. Started by
// scanClient.ts.
//
// In:  { id, image: ImageData, options: ScanOptions }
// Out: { id, detections } or { id, error }

import { scanImageData } from './zxing';
import type { Detection } from './zxing';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = async (event) => {
  const { id, image, options } = event.data;
  try {
    const detections: Detection[] = await scanImageData(image, options);
    const transfer: Transferable[] = [];
    for (const d of detections) {
      transfer.push(d.bytes.buffer as ArrayBuffer, d.bytesECI.buffer as ArrayBuffer);
      if (d.symbol) transfer.push(d.symbol.data.buffer as ArrayBuffer);
    }
    scope.postMessage({ id, detections }, transfer);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
