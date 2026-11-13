// Sends images to the scan worker (scan.worker.ts) and gives back what it found. Requests are answered in order;
// the camera only sends a frame when the one before is done (`busy`). Where a worker cannot be made or fails, the
// codes are read on the page itself.

import type { Detection, ScanOptions } from './zxing';

interface Pending {
  resolve: (detections: Detection[]) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let broken = false;
let nextId = 0;
const pending = new Map<number, Pending>();

async function onPage(image: ImageData, options: ScanOptions): Promise<Detection[]> {
  // @ts-expect-error TypeScript wants a .js extension here, which the bundler does not resolve.
  const { scanImageData } = await import('./zxing');
  return scanImageData(image, options);
}

function giveUpWorker() {
  broken = true;
  worker?.terminate();
  worker = null;
  const waiting = [...pending.values()];
  pending.clear();
  for (const p of waiting) p.reject(new Error('The reader stopped.'));
}

function getWorker(): Worker | null {
  if (worker || broken) return worker;
  try {
    if (typeof Worker === 'undefined') throw new Error('No workers here.');
    // @ts-expect-error TypeScript takes this file for CommonJS, where import.meta is not allowed; the bundler needs exactly this form to build the worker as a file of its own.
    worker = new Worker(new URL('./scan.worker.ts', import.meta.url));
    worker.onmessage = (event) => {
      const { id, detections, error } = event.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (detections) p.resolve(detections);
      else p.reject(new Error(error || 'The image could not be read.'));
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      giveUpWorker();
    };
  } catch {
    broken = true;
    worker = null;
  }
  return worker;
}

/** Whether a scan is running (the camera skips frames meanwhile). */
export function busy() {
  return pending.size > 0;
}

/** Reads the codes in an image. The image's pixels are handed to the worker, so the ImageData is empty afterwards. */
export async function scan(image: ImageData, options: ScanOptions): Promise<Detection[]> {
  const w = getWorker();
  if (!w) return onPage(image, options);
  const id = (nextId += 1);
  try {
    return await new Promise<Detection[]>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, image, options }, [image.data.buffer]);
    });
  } catch (error) {
    // The worker failed while reading: the pixels went with it, so the caller has to read the image again.
    if (broken) throw new Error('The reader stopped; please try again.');
    throw error;
  }
}

/** Ends the worker when the page is left; the next scan starts a new one. */
export function stopScanWorker() {
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) p.reject(new Error('Stopped.'));
  pending.clear();
}
