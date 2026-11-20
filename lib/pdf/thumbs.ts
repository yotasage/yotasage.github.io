import type { PDFDocumentProxy } from 'pdfjs-dist';

import { openPdf, renderPage } from './pdfjs';

// Sequential queue shared by all open PDFs so scrolling through large documents never renders
// many canvases at once or spikes mobile memory.
interface QueueJob {
  shouldRun: () => boolean;
  run: () => Promise<void>;
}

const pendingJobs: QueueJob[] = [];
let draining = false;

function enqueueThumb(job: QueueJob) {
  pendingJobs.push(job);
  if (!draining) void drainQueue();
}

async function drainQueue() {
  draining = true;
  while (pendingJobs.length > 0) {
    const job = pendingJobs.shift()!;
    if (!job.shouldRun()) continue;
    try {
      await job.run();
    } catch {
      // Individual callers handle errors on their own promises.
    }
  }
  draining = false;
}

function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('Could not encode thumbnail.'));
      else resolve(URL.createObjectURL(blob));
    }, 'image/jpeg', 0.82);
  });
}

// Holds an open pdf.js document for lazy per-page thumbnail rendering, with an LRU cap on Blob URLs
// and automatic canvas/page cleanup so 100+ page documents stay within mobile browser memory.
export class PdfThumbPool {
  private bytes: Uint8Array;
  private password?: string;
  private openPromise: Promise<{ doc: PDFDocumentProxy; close: () => Promise<void> }> | null = null;
  private handle: { doc: PDFDocumentProxy; close: () => Promise<void> } | null = null;
  private cache = new Map<number, string>();
  private inFlight = new Map<number, Promise<string | null>>();
  private listeners = new Map<number, Set<(url: string | null) => void>>();
  private disposed = false;
  private maxCached: number;
  private thumbWidth: number;
  pageCount: number | null = null;

  constructor(bytes: Uint8Array, opts?: { password?: string; maxCached?: number; thumbWidth?: number }) {
    this.bytes = bytes;
    this.password = opts?.password;
    this.maxCached = opts?.maxCached ?? 120;
    this.thumbWidth = opts?.thumbWidth ?? 240;
  }

  async open(): Promise<number> {
    if (this.disposed) throw new Error('Document closed.');
    if (!this.openPromise) {
      this.openPromise = openPdf(this.bytes, this.password).then((h) => {
        if (this.disposed) {
          void h.close();
          throw new Error('Document closed.');
        }
        this.handle = h;
        this.pageCount = h.doc.numPages;
        return h;
      });
    }
    const h = await this.openPromise;
    return h.doc.numPages;
  }

  getCached(pageIndex: number): string | null {
    const url = this.cache.get(pageIndex) ?? null;
    if (url !== null) {
      // Refresh LRU order.
      this.cache.delete(pageIndex);
      this.cache.set(pageIndex, url);
    }
    return url;
  }

  subscribe(pageIndex: number, fn: (url: string | null) => void): () => void {
    let set = this.listeners.get(pageIndex);
    if (!set) {
      set = new Set();
      this.listeners.set(pageIndex, set);
    }
    set.add(fn);
    return () => {
      set!.delete(fn);
      if (set!.size === 0) this.listeners.delete(pageIndex);
    };
  }

  private notify(pageIndex: number, url: string | null) {
    const set = this.listeners.get(pageIndex);
    if (!set) return;
    for (const fn of set) fn(url);
  }

  private evictIfNeeded(keepIndex: number) {
    while (this.cache.size > this.maxCached) {
      const oldestKey = this.cache.keys().next().value as number;
      if (oldestKey === keepIndex) break;
      const oldUrl = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      this.notify(oldestKey, null);
    }
  }

  // Requests a thumbnail for zero-based `pageIndex`. If `stillNeeded()` returns false by the time
  // the render reaches the front of the queue, rendering is skipped cleanly.
  request(pageIndex: number, stillNeeded: () => boolean): Promise<string | null> {
    if (this.disposed) return Promise.resolve(null);
    const cached = this.getCached(pageIndex);
    if (cached) return Promise.resolve(cached);
    const existing = this.inFlight.get(pageIndex);
    if (existing) return existing;

    const promise = new Promise<string | null>((resolve) => {
      enqueueThumb({
        shouldRun: () => !this.disposed && stillNeeded() && !this.cache.has(pageIndex),
        run: async () => {
          try {
            if (!this.openPromise) await this.open();
            const h = await this.openPromise!;
            if (this.disposed || !stillNeeded()) {
              resolve(null);
              return;
            }
            const page = await h.doc.getPage(pageIndex + 1);
            let canvas: HTMLCanvasElement | null = null;
            try {
              const vp1 = page.getViewport({ scale: 1 });
              const scale = this.thumbWidth / Math.max(1, vp1.width);
              canvas = await renderPage(page, scale);
              if (this.disposed) {
                resolve(null);
                return;
              }
              const url = await canvasToObjectUrl(canvas);
              if (this.disposed) {
                URL.revokeObjectURL(url);
                resolve(null);
                return;
              }
              this.cache.set(pageIndex, url);
              this.evictIfNeeded(pageIndex);
              this.notify(pageIndex, url);
              resolve(url);
            } finally {
              if (canvas) canvas.width = 0;
              page.cleanup();
            }
          } catch {
            resolve(null);
          }
        },
      });
    }).finally(() => {
      this.inFlight.delete(pageIndex);
    });

    this.inFlight.set(pageIndex, promise);
    return promise;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const url of this.cache.values()) URL.revokeObjectURL(url);
    this.cache.clear();
    this.listeners.clear();
    if (this.handle) {
      const h = this.handle;
      this.handle = null;
      void h.close();
    } else if (this.openPromise) {
      void this.openPromise.then((h) => h.close()).catch(() => undefined);
    }
  }
}
