import { zipSync } from 'fflate';

import { applyEol } from './diffStats';
import { encodeTextWithEncoding } from './encoding';
import { NotepadDoc } from './types';

export interface FileSystemWritable {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

export interface FileSystemFileHandleLike {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<FileSystemWritable>;
}

export interface PickerWindow extends Window {
  showSaveFilePicker?: (opts?: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandleLike>;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDocumentEncoded(doc: NotepadDoc): void {
  const normalized = applyEol(doc.content, doc.eol);
  const { bytes } = encodeTextWithEncoding(normalized, doc.encoding);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  triggerDownload(new Blob([copy], { type: 'application/octet-stream' }), doc.name);
}

export function downloadWorkspaceZip(docs: readonly NotepadDoc[]): void {
  const filesMap: Record<string, Uint8Array> = {};
  const seen = new Map<string, number>();
  for (const doc of docs) {
    const count = seen.get(doc.name) ?? 0;
    seen.set(doc.name, count + 1);
    const finalName = count === 0 ? doc.name : `${count}-${doc.name}`;
    const normalized = applyEol(doc.content, doc.eol);
    filesMap[finalName] = encodeTextWithEncoding(normalized, doc.encoding).bytes;
  }
  const zipped = zipSync(filesMap, { level: 6 });
  const bytes = new Uint8Array(zipped.byteLength);
  bytes.set(zipped);
  triggerDownload(new Blob([bytes], { type: 'application/zip' }), 'scratchpad-workspace.zip');
}
