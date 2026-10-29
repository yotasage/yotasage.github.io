import { canvasToBytes } from '../pdf/files';

export type ConvertType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ConvertOptions {
  type: ConvertType;
  width: number;
  height: number;
  // 1 to 100, for JPEG and WebP.
  quality: number;
  // Fills transparent areas for JPEG, which has no transparency.
  background: string;
}

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This browser cannot open this image.'));
    };
    img.src = url;
  });
}

// An SVG without width and height has no size of its own; browsers then use 300 × 150 like for other embedded content.
export function imageSize(img: HTMLImageElement): { width: number; height: number } {
  return { width: img.naturalWidth || 300, height: img.naturalHeight || 150 };
}

// Drawing on a canvas also drops metadata such as EXIF and GPS. Browsers that cannot write WebP give PNG instead.
export function convertImage(img: HTMLImageElement, opts: ConvertOptions): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext('2d');
  if (opts.type === 'image/jpeg') {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, opts.width, opts.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, opts.width, opts.height);
  return canvasToBytes(canvas, opts.type, opts.quality / 100);
}

// Only PNG can be put on the clipboard in every browser, so other formats are drawn on a canvas first.
export async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const img = await loadImage(blob);
  const bytes = await convertImage(img, { type: 'image/png', ...imageSize(img), quality: 100, background: '' });
  return new Blob([bytes as BlobPart], { type: 'image/png' });
}
