import { baseName, canvasToBytes, nextFrame, OutputFile, safeFileName } from './files';
import { openPdf, renderPage } from './pdfjs';

export interface PdfToImagesOptions {
  format: 'jpeg' | 'png';
  dpi: number;
  quality: number;
  // Zero-based page indices to render; null/undefined/empty renders every page.
  pages?: number[] | null;
  sourceName: string;
  password?: string;
}

export async function pdfToImages(
  bytes: Uint8Array,
  opts: PdfToImagesOptions,
  onProgress?: (fraction: number, label: string) => void,
): Promise<OutputFile[]> {
  onProgress?.(0, 'Opening PDF');
  await nextFrame();
  const { doc, close } = await openPdf(bytes, opts.password);
  try {
    const indices = opts.pages && opts.pages.length > 0
      ? opts.pages.filter((p) => Number.isInteger(p) && p >= 0 && p < doc.numPages)
      : Array.from({ length: doc.numPages }, (_, i) => i);

    if (!indices.length) return [];

    const scale = Math.max(1, opts.dpi) / 72;
    const isJpeg = opts.format === 'jpeg';
    const mime = isJpeg ? 'image/jpeg' : 'image/png';
    const ext = isJpeg ? 'jpg' : 'png';
    const quality = isJpeg ? Math.min(1, Math.max(0.1, opts.quality / 100)) : undefined;
    const stem = safeFileName(baseName(opts.sourceName), 'page');
    const pad = Math.max(2, String(doc.numPages).length);

    const out: OutputFile[] = [];
    for (let i = 0; i < indices.length; i++) {
      const pageIndex = indices[i];
      onProgress?.(i / indices.length, `Rendering page ${pageIndex + 1} (${i + 1} of ${indices.length})`);
      await nextFrame();
      const page = await doc.getPage(pageIndex + 1);
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = await renderPage(page, scale);
        const encoded = await canvasToBytes(canvas, mime, quality);
        out.push({
          name: `${stem}-p${String(pageIndex + 1).padStart(pad, '0')}.${ext}`,
          bytes: encoded,
        });
      } finally {
        if (canvas) canvas.width = 0;
        page.cleanup();
      }
    }
    onProgress?.(1, 'Done');
    return out;
  } finally {
    await close();
  }
}
