// Safe ZIP import/export for the virtual Python workspace using fflate.
// Uses streaming Unzip (zero Blob Web Workers, 100% CSP/COEP/Node-safe) so zip bombs that lie
// about header sizes are aborted mid-stream before exceeding memory caps (security.md §4).

import { Unzip, UnzipInflate, UnzipPassThrough, zipSync } from 'fflate';

import { MAX_FILE_BYTES, normalizeWorkspacePath } from './paths';

export const DEFAULT_ZIP_MAX_ENTRIES = 500;
export const DEFAULT_ZIP_MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MiB
export const DEFAULT_ZIP_MAX_FILE_BYTES = MAX_FILE_BYTES; // 50 MiB

export interface ZipImportLimits {
  readonly maxEntries?: number;
  readonly maxTotalBytes?: number;
  readonly maxFileBytes?: number;
  /** Skip macOS metadata entries (__MACOSX/* and .DS_Store). Defaults to true. */
  readonly skipMacOsMeta?: boolean;
}

export interface ImportedZipFile {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly isDir: boolean;
}

export interface ZipImportResult {
  readonly ok: boolean;
  readonly files: readonly ImportedZipFile[];
  readonly skipped: readonly string[];
  readonly totalBytes: number;
  readonly error?: string;
  readonly errorCode?: 'INVALID_PATH' | 'ZIP_BOMB_ENTRIES' | 'ZIP_BOMB_SIZE' | 'INVALID_ZIP';
}

export interface ZipExportEntry {
  readonly path: string;
  readonly bytes: Uint8Array | string;
}

const STREAM_CHUNK_BYTES = 256 * 1024;

function isMacOsMetadataEntry(rawName: string): boolean {
  const norm = rawName.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
  if (norm === '__MACOSX' || norm.startsWith('__MACOSX/')) return true;
  const parts = norm.split('/');
  const last = parts[parts.length - 1] || '';
  if (last === '.DS_Store' || last.startsWith('._')) return true;
  return false;
}

function concatChunks(chunks: readonly Uint8Array[], totalLen: number): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1 && chunks[0].byteLength === totalLen) {
    return chunks[0];
  }
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Safely unpacks a ZIP archive into validated workspace entries.
 * - Rejects any entry with `..`, absolute paths, Windows drive letters, or control chars.
 * - Enforces entry count, per-file size, and total uncompressed size caps both on header
 *   metadata AND on actual inflated bytes (defeats header-spoofed zip bombs).
 * - Processes chunks asynchronously so large archives do not freeze the browser UI.
 */
export async function importZipBytes(
  zipBytes: Uint8Array,
  limits: ZipImportLimits = {},
): Promise<ZipImportResult> {
  const maxEntries = limits.maxEntries ?? DEFAULT_ZIP_MAX_ENTRIES;
  const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_ZIP_MAX_TOTAL_BYTES;
  const maxFileBytes = limits.maxFileBytes ?? DEFAULT_ZIP_MAX_FILE_BYTES;
  const skipMacOsMeta = limits.skipMacOsMeta ?? true;

  if (!(zipBytes instanceof Uint8Array) || zipBytes.byteLength === 0) {
    return {
      ok: false,
      files: [],
      skipped: [],
      totalBytes: 0,
      error: 'ZIP archive is empty',
      errorCode: 'INVALID_ZIP',
    };
  }

  const files: ImportedZipFile[] = [];
  const skipped: string[] = [];
  let entryCount = 0;
  let totalBytes = 0;
  let abortError: { code: NonNullable<ZipImportResult['errorCode']>; message: string } | null = null;

  const fail = (code: NonNullable<ZipImportResult['errorCode']>, message: string) => {
    if (!abortError) {
      abortError = { code, message };
    }
  };

  const unzipper = new Unzip((file) => {
    if (abortError) return;

    const rawName = file.name;
    if (skipMacOsMeta && isMacOsMetadataEntry(rawName)) {
      skipped.push(rawName);
      return;
    }

    const isDir = rawName.endsWith('/') || rawName.endsWith('\\');
    const validated = normalizeWorkspacePath(rawName, { allowTrailingSlash: isDir });
    if (!validated.ok) {
      const reason = 'reason' in validated ? validated.reason : 'invalid path';
      fail('INVALID_PATH', `Rejected ZIP entry "${rawName}": ${reason}`);
      return;
    }

    entryCount += 1;
    if (entryCount > maxEntries) {
      fail('ZIP_BOMB_ENTRIES', `ZIP archive exceeds maximum entry limit (${maxEntries})`);
      return;
    }

    if (isDir) {
      files.push({ path: validated.path, bytes: new Uint8Array(0), isDir: true });
      return;
    }

    if (typeof file.originalSize === 'number' && file.originalSize > maxFileBytes) {
      fail(
        'ZIP_BOMB_SIZE',
        `ZIP entry "${validated.path}" exceeds maximum file size (${maxFileBytes} bytes)`,
      );
      return;
    }
    if (typeof file.originalSize === 'number' && totalBytes + file.originalSize > maxTotalBytes) {
      fail(
        'ZIP_BOMB_SIZE',
        `ZIP archive exceeds maximum uncompressed size (${maxTotalBytes} bytes)`,
      );
      return;
    }

    const chunks: Uint8Array[] = [];
    let fileLen = 0;

    file.ondata = (err, chunk, final) => {
      if (abortError) return;
      if (err) {
        fail('INVALID_ZIP', `Failed to decompress "${validated.path}": ${err.message}`);
        return;
      }
      if (chunk && chunk.byteLength > 0) {
        fileLen += chunk.byteLength;
        totalBytes += chunk.byteLength;
        if (fileLen > maxFileBytes) {
          fail(
            'ZIP_BOMB_SIZE',
            `ZIP entry "${validated.path}" exceeds maximum file size (${maxFileBytes} bytes)`,
          );
          return;
        }
        if (totalBytes > maxTotalBytes) {
          fail(
            'ZIP_BOMB_SIZE',
            `ZIP archive exceeds maximum uncompressed size (${maxTotalBytes} bytes)`,
          );
          return;
        }
        chunks.push(chunk);
      }
      if (final) {
        files.push({
          path: validated.path,
          bytes: concatChunks(chunks, fileLen),
          isDir: false,
        });
      }
    };

    try {
      file.start();
    } catch (err) {
      fail(
        'INVALID_ZIP',
        `Unsupported or corrupt ZIP entry "${validated.path}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  });

  unzipper.register(UnzipPassThrough);
  unzipper.register(UnzipInflate);

  try {
    const len = zipBytes.byteLength;
    for (let offset = 0; offset < len; offset += STREAM_CHUNK_BYTES) {
      if (abortError) break;
      const end = Math.min(len, offset + STREAM_CHUNK_BYTES);
      const isFinal = end >= len;
      unzipper.push(zipBytes.subarray(offset, end), isFinal);
      if (!isFinal && typeof setTimeout === 'function') {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  } catch (err) {
    if (!abortError) {
      fail('INVALID_ZIP', err instanceof Error ? err.message : String(err));
    }
  }

  if (abortError !== null) {
    const errInfo: { code: NonNullable<ZipImportResult['errorCode']>; message: string } = abortError;
    return {
      ok: false,
      files: [],
      skipped,
      totalBytes: 0,
      error: errInfo.message,
      errorCode: errInfo.code,
    };
  }

  return {
    ok: true,
    files,
    skipped,
    totalBytes,
  };
}

/** Packs workspace files into a valid `.zip` Uint8Array (validating every path first). */
export function exportWorkspaceZip(
  files: ReadonlyArray<ZipExportEntry> | Readonly<Record<string, Uint8Array | string>>,
): Uint8Array {
  const encoder = new TextEncoder();
  const zipInput: Record<string, Uint8Array> = {};

  const entries: readonly ZipExportEntry[] = Array.isArray(files)
    ? files
    : Object.entries(files).map(([path, bytes]) => ({ path, bytes }));

  for (const entry of entries) {
    const validated = normalizeWorkspacePath(entry.path);
    if (!validated.ok) {
      const reason = 'reason' in validated ? validated.reason : 'invalid path';
      throw new Error(`Invalid export path "${entry.path}": ${reason}`);
    }
    zipInput[validated.path] =
      typeof entry.bytes === 'string' ? encoder.encode(entry.bytes) : entry.bytes;
  }

  return zipSync(zipInput, { level: 6 });
}
