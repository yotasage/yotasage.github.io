// Package messages between the page and /python/python-worker.js (P5a): types, caps and the strict
// validators for pkg.result / pkg.list.result, plus the page-side check of a pkg.install request.
// Worker messages are untrusted data: a malformed one is dropped, never repaired (security.md §4).

export const MAX_PACKAGE_ITEMS = 500;
export const MAX_PACKAGE_NAME_CHARS = 128;
export const MAX_REQUIREMENT_CHARS = 512;
export const MAX_PACKAGE_DETAIL_CHARS = 8192;
export const MAX_PACKAGE_MESSAGE_CHARS = 2048;
export const MAX_PACKAGE_INFO_CHARS = 512;
export const MAX_PACKAGE_URL_CHARS = 2048;
export const MAX_PACKAGE_DEPS = 200;
export const MAX_MISSING_PACKAGES = 64;
export const MAX_WHEEL_BYTES = 50 * 1024 * 1024;
export const MAX_INSTALL_BYTES = 150 * 1024 * 1024;
export const MAX_ITEM_HASHES = 16;

export type PackageSource = 'bundled' | 'pypi' | 'wheel' | 'code';
export type PackageInstallReason = 'user' | 'restore' | 'script-header';
export type PackageRefusal = 'run-active' | 'not-ready';
export type PackageErrorKind =
  | 'network-off'
  | 'needs-package-index'
  | 'not-found'
  | 'offline'
  | 'version-not-found'
  | 'no-browser-wheel'
  | 'incompatible-wheel'
  | 'missing-dependency'
  | 'hash-mismatch'
  | 'host-blocked'
  | 'in-script'
  | 'invalid-request'
  | 'other';

export const PACKAGE_ERROR_KINDS: readonly PackageErrorKind[] = [
  'network-off',
  'needs-package-index',
  'not-found',
  'offline',
  'version-not-found',
  'no-browser-wheel',
  'incompatible-wheel',
  'missing-dependency',
  'hash-mismatch',
  'host-blocked',
  'in-script',
  'invalid-request',
  'other',
];

/** One package installed in the worker (data only; the page decides what to keep). */
export interface PackageInfo {
  readonly name: string;
  readonly version: string;
  readonly source: PackageSource;
  readonly sha256?: string;
  /** Only ever an https://files.pythonhosted.org/ URL. */
  readonly url?: string;
  readonly fileName?: string;
  readonly depends: readonly string[];
  readonly imports: readonly string[];
}

export interface PackageFailure {
  readonly requirement: string;
  readonly kind: PackageErrorKind;
  /** Friendly EN text from the worker; the page shows its own translation by `kind`. */
  readonly message: string;
  /** Raw error text (for a "Details" toggle). */
  readonly detail: string;
  /** Kind-specific value: available versions, missing dependency, blocked host or wheel platform. */
  readonly info?: string;
}

export type PackageInstallItem =
  | { readonly kind: 'bundled'; readonly name: string }
  | {
      readonly kind: 'pypi';
      readonly requirement: string;
      /** Restore by URL (Package index mode only): both set, checked by the worker before install. */
      readonly sha256?: string;
      readonly url?: string;
      /** Allowed SHA-256 wheel digests from requirements.txt --hash=sha256:..., checked before install. */
      readonly hashes?: readonly string[];
    }
  | {
      readonly kind: 'wheel';
      readonly fileName: string;
      readonly sha256: string;
      readonly bytes: Uint8Array;
      /** Set for a saved copy of a PyPI wheel, so it is reported with source 'pypi'. */
      readonly url?: string;
    };

export type PackageMainToWorkerMessage =
  | {
      readonly type: 'pkg.install';
      readonly id: number;
      readonly items: readonly PackageInstallItem[];
      readonly reason: PackageInstallReason;
    }
  | { readonly type: 'pkg.list'; readonly id: number };

export type PackageWorkerToMainMessage =
  | {
      readonly type: 'pkg.result';
      readonly id: number;
      readonly installed: readonly PackageInfo[];
      readonly failed: readonly PackageFailure[];
      readonly refused?: PackageRefusal;
    }
  | {
      readonly type: 'pkg.list.result';
      readonly id: number;
      readonly packages: readonly PackageInfo[];
      readonly refused?: PackageRefusal;
    };

const NAME_RE = /^[A-Za-z0-9._-]{1,128}$/;
const VERSION_RE = /^[A-Za-z0-9.+!_-]{0,64}$/;
const IMPORT_RE = /^[A-Za-z_][A-Za-z0-9_.]{0,127}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const WHEEL_NAME_RE = /^[A-Za-z0-9._+-]{1,251}\.whl$/;
const TAG_RE = /^[A-Za-z0-9_.]{0,64}$/;
const SOURCES = new Set<string>(['bundled', 'pypi', 'wheel', 'code']);
const KINDS = new Set<string>(PACKAGE_ERROR_KINDS);
const REFUSALS = new Set<string>(['run-active', 'not-ready']);
const REASONS = new Set<string>(['user', 'restore', 'script-header']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isBounded(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max;
}

function isIntId(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 2147483647;
}

export function isPackageName(v: unknown): v is string {
  return typeof v === 'string' && NAME_RE.test(v);
}

export function isSha256Hex(v: unknown): v is string {
  return typeof v === 'string' && SHA256_RE.test(v);
}

export function isWheelFileName(v: unknown): v is string {
  return typeof v === 'string' && WHEEL_NAME_RE.test(v);
}

/** Only https://files.pythonhosted.org/… with no credentials, port or fragment. */
export function isPythonHostedUrl(v: unknown): v is string {
  if (!isBounded(v, MAX_PACKAGE_URL_CHARS)) return false;
  try {
    const u = new URL(v);
    return (
      u.protocol === 'https:' &&
      u.hostname === 'files.pythonhosted.org' &&
      u.port === '' &&
      u.username === '' &&
      u.password === '' &&
      u.hash === ''
    );
  } catch {
    return false;
  }
}

/** `abiVersion` / `platform` of the ready message (e.g. 2026_0, emscripten_5_0_3). */
export function isLockTag(v: unknown): v is string {
  return typeof v === 'string' && TAG_RE.test(v);
}

/** undefined when absent, the value when it passes `guard`, null when it is present but invalid. */
function optional(v: unknown, guard: (x: unknown) => x is string): string | undefined | null {
  if (v === undefined) return undefined;
  return guard(v) ? v : null;
}

function stringList(v: unknown, re: RegExp, max: number): string[] | null {
  if (!Array.isArray(v) || v.length > max) return null;
  for (const item of v) {
    if (typeof item !== 'string' || !re.test(item)) return null;
  }
  return [...v] as string[];
}

/** Package names of `run.end.missingPackages`. */
export function validateMissingPackages(v: unknown): string[] | null {
  return stringList(v, NAME_RE, MAX_MISSING_PACKAGES);
}

function validatePackageInfo(raw: unknown): PackageInfo | null {
  if (!isRecord(raw)) return null;
  if (!isPackageName(raw.name)) return null;
  if (typeof raw.version !== 'string' || !VERSION_RE.test(raw.version)) return null;
  if (typeof raw.source !== 'string' || !SOURCES.has(raw.source)) return null;
  const sha256 = optional(raw.sha256, isSha256Hex);
  const url = optional(raw.url, isPythonHostedUrl);
  const fileName = optional(raw.fileName, isWheelFileName);
  if (sha256 === null || url === null || fileName === null) return null;
  const depends = raw.depends === undefined ? [] : stringList(raw.depends, NAME_RE, MAX_PACKAGE_DEPS);
  const imports = raw.imports === undefined ? [] : stringList(raw.imports, IMPORT_RE, MAX_PACKAGE_DEPS);
  if (!depends || !imports) return null;
  return {
    name: raw.name,
    version: raw.version,
    source: raw.source as PackageSource,
    ...(sha256 !== undefined ? { sha256 } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(fileName !== undefined ? { fileName } : {}),
    depends,
    imports,
  };
}

function validateFailure(raw: unknown): PackageFailure | null {
  if (!isRecord(raw)) return null;
  if (!isBounded(raw.requirement, MAX_REQUIREMENT_CHARS)) return null;
  if (typeof raw.kind !== 'string' || !KINDS.has(raw.kind)) return null;
  if (!isBounded(raw.message, MAX_PACKAGE_MESSAGE_CHARS)) return null;
  if (!isBounded(raw.detail, MAX_PACKAGE_DETAIL_CHARS)) return null;
  const info = optional(raw.info, (v): v is string => isBounded(v, MAX_PACKAGE_INFO_CHARS));
  if (info === null) return null;
  return {
    requirement: raw.requirement,
    kind: raw.kind as PackageErrorKind,
    message: raw.message,
    detail: raw.detail,
    ...(info !== undefined ? { info } : {}),
  };
}

function validateList<T>(raw: unknown, fn: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_PACKAGE_ITEMS) return null;
  const out: T[] = [];
  for (const item of raw) {
    const parsed = fn(item);
    if (!parsed) return null;
    out.push(parsed);
  }
  return out;
}

type PackageValidation =
  | { readonly ok: true; readonly message: PackageWorkerToMainMessage }
  | { readonly ok: false; readonly reason: string };

/** Validates an untrusted pkg.result / pkg.list.result from the worker. */
export function validatePackageMessage(raw: Record<string, unknown>): PackageValidation {
  if (!isIntId(raw.id)) return { ok: false, reason: `Invalid ${String(raw.type)} id` };
  let refused: PackageRefusal | undefined;
  if (raw.refused !== undefined) {
    if (typeof raw.refused !== 'string' || !REFUSALS.has(raw.refused)) {
      return { ok: false, reason: `Invalid ${String(raw.type)} refused` };
    }
    refused = raw.refused as PackageRefusal;
  }
  const extra = refused !== undefined ? { refused } : {};
  if (raw.type === 'pkg.list.result') {
    const packages = validateList(raw.packages, validatePackageInfo);
    if (!packages) return { ok: false, reason: 'Invalid pkg.list.result packages' };
    return { ok: true, message: { type: 'pkg.list.result', id: raw.id, packages, ...extra } };
  }
  const installed = validateList(raw.installed, validatePackageInfo);
  if (!installed) return { ok: false, reason: 'Invalid pkg.result installed' };
  const failed = validateList(raw.failed, validateFailure);
  if (!failed) return { ok: false, reason: 'Invalid pkg.result failed' };
  return { ok: true, message: { type: 'pkg.result', id: raw.id, installed, failed, ...extra } };
}

/** Checks a pkg.install request built by the page before it is sent; returns a reason or null. */
export function checkInstallRequest(
  items: readonly PackageInstallItem[],
  reason: PackageInstallReason,
): string | null {
  if (!REASONS.has(reason)) return 'Invalid install reason';
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_PACKAGE_ITEMS) {
    return `Between 1 and ${MAX_PACKAGE_ITEMS} items are needed`;
  }
  let total = 0;
  for (const item of items) {
    if (!isRecord(item)) return 'Invalid item';
    if (item.kind === 'bundled') {
      if (!isPackageName(item.name)) return 'Invalid bundled package name';
    } else if (item.kind === 'pypi') {
      if (!isBounded(item.requirement, MAX_REQUIREMENT_CHARS) || !item.requirement.trim()) {
        return 'Invalid requirement';
      }
      const hasUrl = item.url !== undefined;
      if (hasUrl !== (item.sha256 !== undefined)) return 'A restore needs both url and sha256';
      if (hasUrl && (!isPythonHostedUrl(item.url) || !isSha256Hex(item.sha256))) {
        return 'Invalid restore url or sha256';
      }
      if (item.hashes !== undefined) {
        if (
          !Array.isArray(item.hashes) ||
          item.hashes.length === 0 ||
          item.hashes.length > MAX_ITEM_HASHES ||
          !item.hashes.every(isSha256Hex)
        ) {
          return 'Invalid requirement hashes';
        }
      }
    } else if (item.kind === 'wheel') {
      if (!isWheelFileName(item.fileName)) return 'Invalid wheel file name';
      if (!isSha256Hex(item.sha256)) return 'Invalid wheel sha256';
      if (!(item.bytes instanceof Uint8Array) || item.bytes.byteLength === 0) return 'Missing wheel bytes';
      if (item.bytes.byteLength > MAX_WHEEL_BYTES) return 'Wheel exceeds 50 MiB';
      if (item.url !== undefined && !isPythonHostedUrl(item.url)) return 'Invalid wheel url';
      total += item.bytes.byteLength;
    } else {
      return 'Unknown item kind';
    }
  }
  return total > MAX_INSTALL_BYTES ? 'Wheels exceed 150 MiB in total' : null;
}
