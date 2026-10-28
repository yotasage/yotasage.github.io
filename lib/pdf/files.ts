import { zipSync } from 'fflate';

export interface OutputFile {
  name: string;
  bytes: Uint8Array;
}

let nextId = 0;
export function uid(): string {
  nextId += 1;
  return `f${nextId}`;
}

export async function readBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function isImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif|tiff?|ico)$/i.test(file.name);
}

export function baseName(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}

// Removes characters that are not allowed in file names on common systems.
export function safeFileName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  return cleaned || fallback;
}

// Makes every name unique by adding " (2)", " (3)", ... before the extension.
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const key = name.toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf('.');
    return dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
  });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function download(data: Uint8Array | Blob, name: string, type = 'application/pdf') {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canvasToBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) reject(new Error('The browser could not encode the image.'));
      else resolve(new Uint8Array(await blob.arrayBuffer()));
    }, type, quality);
  });
}

// PDFs and images are already compressed, so the files are stored without compression.
export function zipFiles(files: OutputFile[]): Uint8Array {
  const names = uniqueNames(files.map((f) => f.name));
  return zipSync(Object.fromEntries(files.map((f, i) => [names[i], [f.bytes, { level: 0 }]])));
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

// Lets the browser repaint between heavy steps.
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === 'PasswordException' || e.name === 'EncryptedPDFError' || /encrypt/i.test(e.message)) {
      return 'The PDF is password protected or encrypted, which is not supported yet.';
    }
    if (e.name === 'InvalidPDFException') return 'The file is not a valid PDF.';
    return e.message;
  }
  return String(e);
}
