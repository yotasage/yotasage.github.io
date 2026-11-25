// Pure UI helpers for Python Playground file management:
// - Monaco language mapping & binary-vs-text heuristics
// - Recursive drag-and-drop folder extraction (DataTransferItem.webkitGetAsEntry)
// - Browser Blob download helper (user-initiated only)
// - Multi-file traceback frame extraction

import {
  baseName,
  fileExtension,
  normalizeWorkspacePath,
} from '../../lib/python/paths';
import type { PythonErrorInfo } from '../../lib/python/protocol';

export const MAX_OPEN_TABS = 15;
export const MAX_TEXT_EDITOR_BYTES = 2 * 1024 * 1024; // 2 MiB text cap for Monaco

const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.pdf',
  '.zip',
  '.whl',
  '.gz',
  '.tar',
  '.bz2',
  '.xz',
  '.7z',
  '.wasm',
  '.bin',
  '.dat',
  '.npy',
  '.npz',
  '.parquet',
  '.sqlite',
  '.db',
  '.mp3',
  '.wav',
  '.ogg',
  '.mp4',
  '.webm',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.pyc',
  '.so',
  '.dll',
  '.exe',
]);

const MONACO_LANGUAGE_MAP: Readonly<Record<string, string>> = {
  '.py': 'python',
  '.pyi': 'python',
  '.json': 'json',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.svg': 'xml',
  '.css': 'css',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.tsx': 'typescript',
  '.jsx': 'javascript',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.sh': 'shell',
  '.sql': 'sql',
  '.csv': 'plaintext',
  '.tsv': 'plaintext',
  '.txt': 'plaintext',
  '.log': 'plaintext',
};

export function getMonacoLanguageForPath(path: string): string {
  const ext = fileExtension(path);
  return MONACO_LANGUAGE_MAP[ext] ?? 'plaintext';
}

export function isBinaryFile(path: string, size: number, bytes?: Uint8Array | null): boolean {
  if (BINARY_EXTENSIONS.has(fileExtension(path))) return true;
  if (size > MAX_TEXT_EDITOR_BYTES) return true;
  if (bytes && bytes.byteLength > 0) {
    // Check first 8 KiB for NUL bytes (reliable indicator of binary content)
    const limit = Math.min(bytes.byteLength, 8192);
    for (let i = 0; i < limit; i += 1) {
      if (bytes[i] === 0) return true;
    }
  }
  return false;
}

export function triggerBlobDownload(bytes: Uint8Array, filename: string, mime = 'application/octet-stream'): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = baseName(filename) || 'download';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface DroppedFileItem {
  readonly path: string;
  readonly file: File;
}

export interface DroppedFolderResult {
  readonly files: readonly DroppedFileItem[];
  readonly dirs: readonly string[];
  readonly rejected: readonly string[];
}

interface WebkitFileSystemEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  readonly fullPath?: string;
}

interface WebkitFileEntry extends WebkitFileSystemEntry {
  readonly isFile: true;
  file: (success: (file: File) => void, error?: (err: unknown) => void) => void;
}

interface WebkitDirectoryReader {
  readEntries: (
    success: (entries: WebkitFileSystemEntry[]) => void,
    error?: (err: unknown) => void,
  ) => void;
}

interface WebkitDirectoryEntry extends WebkitFileSystemEntry {
  readonly isDirectory: true;
  createReader: () => WebkitDirectoryReader;
}

function readAllDirectoryEntries(dir: WebkitDirectoryEntry): Promise<WebkitFileSystemEntry[]> {
  return new Promise((resolve) => {
    const reader = dir.createReader();
    const collected: WebkitFileSystemEntry[] = [];
    const readNext = () => {
      reader.readEntries(
        (batch) => {
          if (!batch || batch.length === 0) {
            resolve(collected);
          } else {
            collected.push(...batch);
            readNext();
          }
        },
        () => resolve(collected),
      );
    };
    readNext();
  });
}

function readWebkitFile(entry: WebkitFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (f) => resolve(f),
      () => resolve(null),
    );
  });
}

async function traverseEntry(
  entry: WebkitFileSystemEntry,
  prefix: string,
  outFiles: DroppedFileItem[],
  outDirs: string[],
  rejected: string[],
): Promise<void> {
  const rawPath = prefix ? `${prefix}/${entry.name}` : entry.name;
  const check = normalizeWorkspacePath(rawPath, { allowTrailingSlash: entry.isDirectory });
  if (!check.ok) {
    rejected.push(rawPath);
    return;
  }

  if (entry.isFile) {
    const f = await readWebkitFile(entry as WebkitFileEntry);
    if (f) {
      outFiles.push({ path: check.path, file: f });
    }
    return;
  }

  if (entry.isDirectory) {
    outDirs.push(check.path);
    const children = await readAllDirectoryEntries(entry as WebkitDirectoryEntry);
    for (const child of children) {
      await traverseEntry(child, check.path, outFiles, outDirs, rejected);
    }
  }
}

/**
 * Extracts dropped files AND recursively traverses dropped folders via webkitGetAsEntry().
 * Falls back cleanly to dataTransfer.files on browsers without webkitGetAsEntry.
 */
export async function extractDroppedItems(dataTransfer: DataTransfer): Promise<DroppedFolderResult> {
  const outFiles: DroppedFileItem[] = [];
  const outDirs: string[] = [];
  const rejected: string[] = [];

  const items = dataTransfer.items;
  if (items && items.length > 0) {
    const entries: WebkitFileSystemEntry[] = [];
    let supportsEntry = false;
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] as DataTransferItem & {
        webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
      };
      if (item.kind !== 'file') continue;
      if (typeof item.webkitGetAsEntry === 'function') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          supportsEntry = true;
          entries.push(entry);
        }
      }
    }
    if (supportsEntry && entries.length > 0) {
      for (const entry of entries) {
        await traverseEntry(entry, '', outFiles, outDirs, rejected);
      }
      return { files: outFiles, dirs: outDirs, rejected };
    }
  }

  const fileList = dataTransfer.files;
  if (fileList) {
    for (let i = 0; i < fileList.length; i += 1) {
      const f = fileList[i];
      const rel =
        (f as File & { webkitRelativePath?: string }).webkitRelativePath?.trim() || f.name;
      const check = normalizeWorkspacePath(rel);
      if (!check.ok) {
        rejected.push(rel);
      } else {
        outFiles.push({ path: check.path, file: f });
      }
    }
  }

  return { files: outFiles, dirs: outDirs, rejected };
}

export interface TracebackJump {
  readonly path: string;
  readonly line: number;
  readonly fn: string;
}

function normalizeWorkspaceFramePath(rawFile: string): string | null {
  const cleaned = rawFile.replace(/\\/g, '/').trim();
  if (cleaned.startsWith('/workspace/')) {
    const rel = cleaned.slice('/workspace/'.length);
    const check = normalizeWorkspacePath(rel);
    return check.ok ? check.path : null;
  }
  if (!cleaned.startsWith('/') && !cleaned.startsWith('<')) {
    const check = normalizeWorkspacePath(cleaned);
    return check.ok ? check.path : null;
  }
  return null;
}

export function extractWorkspaceJumps(error: PythonErrorInfo | undefined): TracebackJump[] {
  if (!error) return [];
  const seen = new Set<string>();
  const jumps: TracebackJump[] = [];

  for (const frame of error.frames) {
    const relPath = normalizeWorkspaceFramePath(frame.file);
    if (relPath && frame.line > 0) {
      const key = `${relPath}:${frame.line}`;
      if (!seen.has(key)) {
        seen.add(key);
        jumps.push({ path: relPath, line: frame.line, fn: frame.fn || '<module>' });
      }
    }
  }

  if (jumps.length === 0 && error.formatted) {
    const re = /File "(\/workspace\/[^"]+|[A-Za-z0-9_.\-/]+\.py)", line (\d+)/g;
    for (const match of error.formatted.matchAll(re)) {
      const relPath = normalizeWorkspaceFramePath(match[1]);
      const line = Number(match[2]);
      if (relPath && Number.isInteger(line) && line > 0) {
        const key = `${relPath}:${line}`;
        if (!seen.has(key)) {
          seen.add(key);
          jumps.push({ path: relPath, line, fn: '<module>' });
        }
      }
    }
  }

  return jumps;
}
