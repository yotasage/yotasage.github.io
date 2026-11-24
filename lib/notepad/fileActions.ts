import { zipSync } from 'fflate';

import { applyEol, detectEol, guessLanguageFromFilename } from './diffStats';
import { decodeBytesWithEncoding, detectEncodingFromBytes, encodeTextWithEncoding } from './encoding';
import { createDocId } from './storage';
import { NotepadDoc, SearchMode } from './types';

export interface SearchPresetConfig {
  mode: SearchMode;
  findQuery: string;
  replaceText: string;
}

export type SearchPresetId =
  | 'joinComma'
  | 'joinCommaSpace'
  | 'splitComma'
  | 'trimTrailing'
  | 'removeEmpty';

export const SEARCH_PRESETS: Record<SearchPresetId, SearchPresetConfig> = {
  joinComma: { mode: 'extended', findQuery: '\\r\\n', replaceText: ',' },
  joinCommaSpace: { mode: 'extended', findQuery: '\\r\\n', replaceText: ', ' },
  splitComma: { mode: 'extended', findQuery: ',', replaceText: '\\r\\n' },
  trimTrailing: { mode: 'regex', findQuery: '[ \\t]+$', replaceText: '' },
  removeEmpty: { mode: 'regex', findQuery: '^\\s*\\r?\\n', replaceText: '' },
};

export function nextUntitledName(docs: readonly NotepadDoc[]): string {
  const used = new Set(docs.map((d) => d.name.toLowerCase()));
  for (let i = 1; i < 10_000; i++) {
    const candidate = `new ${i}.txt`;
    if (!used.has(candidate)) return candidate;
  }
  return `new ${Date.now()}.txt`;
}

export function createNewNotepadDoc(
  existingDocs: readonly NotepadDoc[],
  initialContent = '',
  customName?: string,
): NotepadDoc {
  const now = Date.now();
  const name = customName?.trim() || nextUntitledName(existingDocs);
  return {
    id: createDocId(),
    name,
    content: initialContent,
    language: guessLanguageFromFilename(name),
    eol: detectEol(initialContent),
    encoding: 'utf-8',
    encodingConfidence: 'exact',
    direction: 'ltr',
    createdAt: now,
    updatedAt: now,
  };
}

export async function readFilesToNotepadDocs(
  files: FileList | File[],
  rawBytesMap: Map<string, Uint8Array>,
): Promise<NotepadDoc[]> {
  const list = Array.from(files);
  const now = Date.now();
  const loaded: NotepadDoc[] = [];
  for (const file of list) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const detected = detectEncodingFromBytes(bytes);
    const text = decodeBytesWithEncoding(bytes, detected.encoding);
    const id = createDocId();
    rawBytesMap.set(id, bytes);
    loaded.push({
      id,
      name: file.name,
      content: text,
      language: guessLanguageFromFilename(file.name),
      eol: detectEol(text),
      encoding: detected.encoding,
      encodingConfidence: detected.confidence,
      direction: 'ltr',
      createdAt: now,
      updatedAt: now,
    });
  }
  return loaded;
}

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
