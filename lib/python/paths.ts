// Virtual workspace path validation, size cap constants, and file-name helpers.
// Kept in exact sync with public/python/storage-worker.js (security.md §3–§4).

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MiB (52,428,800 B)
export const MAX_WORKSPACE_BYTES = 150 * 1024 * 1024; // 150 MiB (157,286,400 B)
export const MAX_WORKSPACE_ENTRIES = 2_000;
export const MAX_PATH_LENGTH = 256;
export const MAX_PATH_DEPTH = 16;

// Security W5 (security.md §7): extensions that can execute code when run or opened.
export const DANGEROUS_UPLOAD_EXTS: ReadonlySet<string> = new Set([
  '.py',
  '.whl',
  '.zip',
  '.html',
  '.htm',
]);

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:/;

export type PathValidationResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly reason: string };

export interface NormalizePathOptions {
  /** Allow and strip trailing slash (e.g. ZIP directory entry "src/"). */
  readonly allowTrailingSlash?: boolean;
}

/**
 * Validates and normalizes a workspace-relative POSIX path.
 * - Rejects empty strings, NUL/control characters, leading `/` or `\`, Windows drive prefixes (`C:`),
 *   `.` or `..` segments, empty interior segments, paths > 256 chars, and depth > 16.
 * - Strips leading `./` prefixes and converts backslashes to `/`.
 */
export function normalizeWorkspacePath(
  raw: string,
  options: NormalizePathOptions = {},
): PathValidationResult {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'Path must be a string' };
  }
  if (raw.length === 0) {
    return { ok: false, reason: 'Path must not be empty' };
  }
  if (CONTROL_CHAR_RE.test(raw)) {
    return { ok: false, reason: 'Path must not contain NUL or control characters' };
  }
  if (WINDOWS_DRIVE_RE.test(raw)) {
    return { ok: false, reason: 'Windows drive letters are not allowed' };
  }
  if (raw.startsWith('/') || raw.startsWith('\\')) {
    return { ok: false, reason: 'Absolute paths are not allowed' };
  }

  let cleaned = raw.replace(/\\/g, '/');

  // Strip one or more leading "./" prefixes (e.g. "./src/main.py" -> "src/main.py"),
  // while leaving bare "." or "./" to fail the empty/dot check below.
  while (cleaned.startsWith('./')) {
    cleaned = cleaned.slice(2);
  }

  if (options.allowTrailingSlash) {
    while (cleaned.endsWith('/')) {
      cleaned = cleaned.slice(0, -1);
    }
  }

  if (cleaned.length === 0) {
    return { ok: false, reason: 'Path must not be empty' };
  }
  if (cleaned.startsWith('/')) {
    return { ok: false, reason: 'Absolute paths are not allowed' };
  }

  const segments = cleaned.split('/');
  if (segments.length > MAX_PATH_DEPTH) {
    return { ok: false, reason: `Path exceeds maximum depth of ${MAX_PATH_DEPTH}` };
  }

  for (const seg of segments) {
    if (seg.length === 0) {
      return { ok: false, reason: 'Path must not contain empty segments or trailing slash' };
    }
    if (seg === '..') {
      return { ok: false, reason: 'Path traversal ".." is not allowed' };
    }
    if (seg === '.') {
      return { ok: false, reason: 'Relative "." segment is not allowed' };
    }
    if (seg.includes(':')) {
      return { ok: false, reason: 'Path segments must not contain ":"' };
    }
    if (seg.trim().length === 0) {
      return { ok: false, reason: 'Path segments must not be blank whitespace' };
    }
  }

  const normalized = segments.join('/');
  if (normalized.length > MAX_PATH_LENGTH) {
    return { ok: false, reason: `Path exceeds maximum length of ${MAX_PATH_LENGTH} characters` };
  }

  return { ok: true, path: normalized };
}

/** Returns the parent directory path, or '' for a top-level entry. */
export function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '' : path.slice(0, idx);
}

/** Returns the final segment (file or directory name) of a normalized path. */
export function baseName(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? path : path.slice(idx + 1);
}

/** Returns all ancestor directory paths in shallow-to-deep order (e.g. 'a/b/c.py' -> ['a', 'a/b']). */
export function ancestorDirs(path: string): string[] {
  const parts = path.split('/');
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    dirs.push(parts.slice(0, i).join('/'));
  }
  return dirs;
}

/** Returns the lowercased extension including the leading dot (e.g. '.py'), or ''. */
export function fileExtension(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot).toLowerCase();
}

/** Returns true for file extensions covered by security notice W5 (.py, .whl, .zip, .html, .htm). */
export function isDangerousUploadExt(path: string): boolean {
  return DANGEROUS_UPLOAD_EXTS.has(fileExtension(path));
}

/** Formats a byte count into a human-readable string (B, KB, MB, GB). */
export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
