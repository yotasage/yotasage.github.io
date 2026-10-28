// Lazy access to pdf.js, which is only loaded in the browser. The worker and its data files are copied to
// public/pdfjs by scripts/copy-pdfjs-assets.mjs, so nothing is fetched from other sites.
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

const ASSETS = '/pdfjs/';

let loader: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfjs() {
  if (!loader) {
    loader = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `${ASSETS}pdf.worker.min.mjs`;
      return lib;
    });
  }
  return loader;
}

// Opens a document; call `close` when done to free the worker's memory.
export async function openPdf(bytes: Uint8Array): Promise<{ doc: PDFDocumentProxy; close: () => Promise<void> }> {
  const lib = await loadPdfjs();
  // pdf.js transfers the buffer to its worker, so it gets a copy to keep ours usable.
  const task = lib.getDocument({
    data: bytes.slice(),
    cMapUrl: `${ASSETS}cmaps/`,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  });
  try {
    return { doc: await task.promise, close: () => task.destroy() };
  } catch (e) {
    await task.destroy();
    throw e;
  }
}

// Renders a page on a white background at the given scale (1 = 72 DPI).
export async function renderPage(page: PDFPageProxy, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  await page.render({ canvas, viewport, background: '#ffffff' }).promise;
  return canvas;
}

export interface PdfPreview {
  pageCount: number;
  thumbnail: string;
}

// Previews are made one at a time so that adding many files does not render them all at once.
let queue: Promise<unknown> = Promise.resolve();

export function pdfPreview(bytes: Uint8Array, width = 240): Promise<PdfPreview> {
  const job = queue.then(async () => {
    const { doc, close } = await openPdf(bytes);
    try {
      const page = await doc.getPage(1);
      const scale = width / page.getViewport({ scale: 1 }).width;
      const canvas = await renderPage(page, scale);
      return { pageCount: doc.numPages, thumbnail: canvas.toDataURL('image/png') };
    } finally {
      await close();
    }
  });
  queue = job.catch(() => undefined);
  return job;
}
