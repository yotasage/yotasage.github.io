// Saving a drawing as a file, in the browser: the SVG as it is, or drawn on a canvas for PNG, JPG and WebP. Nothing
// is sent anywhere. Only the functions that are called touch the document, so the file can be imported anywhere.

import type { Drawing } from './draw';
import { formatRkm } from './format';

export type ImageFormat = 'svg' | 'png' | 'jpg' | 'webp';

export const IMAGE_FORMATS: { id: ImageFormat; label: string; mime: string }[] = [
  { id: 'svg', label: 'SVG', mime: 'image/svg+xml' },
  { id: 'png', label: 'PNG', mime: 'image/png' },
  { id: 'jpg', label: 'JPG', mime: 'image/jpeg' },
  { id: 'webp', label: 'WebP', mime: 'image/webp' },
];

// Browsers limit the size of a canvas; this is safely under the limits.
export const MAX_EXPORT_WIDTH = 8192;

export function exportHeight(drawing: Drawing, width: number): number {
  return Math.max(1, Math.round((width * drawing.height) / drawing.width));
}

// The drawing as an SVG file of a given width in pixels.
export function exportSvg(drawing: Drawing, width: number): string {
  return drawing.svg.replace('<svg ', `<svg width="${width}" height="${exportHeight(drawing, width)}" `);
}

// The drawing as a PNG, JPG or WebP of a given width in pixels. JPG has no transparency: it is drawn on white.
export async function rasterise(drawing: Drawing, width: number, format: Exclude<ImageFormat, 'svg'>): Promise<Blob> {
  const height = exportHeight(drawing, width);
  const url = URL.createObjectURL(new Blob([exportSvg(drawing, width)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The drawing could not be rendered.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The browser gave no canvas to draw on.');
    if (format === 'jpg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    const mime = IMAGE_FORMATS.find((entry) => entry.id === format).mime;
    const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, mime, 0.92); });
    // A browser that cannot write a format answers with a PNG.
    if (!blob || blob.type !== mime) throw new Error(`This browser cannot write ${format.toUpperCase()} files.`);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportBlob(drawing: Drawing, width: number, format: ImageFormat): Promise<Blob> {
  if (format === 'svg') return new Blob([exportSvg(drawing, width)], { type: 'image/svg+xml;charset=utf-8' });
  return rasterise(drawing, width, format);
}

export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// The drawing as a PNG on the clipboard. The picture is handed over as a promise, which Safari asks for.
export async function copyImage(drawing: Drawing, width: number): Promise<void> {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error('This browser cannot copy pictures.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': rasterise(drawing, width, 'png') })]);
}

// resistor-4k7-axial-5-band.svg, resistor-4k7-chip-0603.png, resistor-4k7-chip-0603.tex
export function drawingFileName(ohms: number, part: string, format: ImageFormat | 'tex'): string {
  const value = formatRkm(ohms).replace(/[^0-9A-Za-zµ]/g, '') || '0R';
  return `resistor-${value}-${part}.${format}`;
}
