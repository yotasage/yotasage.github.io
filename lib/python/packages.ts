// Kept packages (P5b): the page-only manifest in localStorage `python:packages-v1`, wheel file-name
// tag rules, the bundled index from our own pyodide-lock.json, and planRestore(). Framework-free.
// The manifest lives where the worker cannot reach (it has no localStorage, D22): user code can write
// IndexedDB, so saved wheel bytes are only used when they hash to a manifest entry (D15, D20).

import type { NetworkMode } from './network';
import { getPyodideLockFileUrl } from './origin';
import {
  isPackageName,
  isPythonHostedUrl,
  isSha256Hex,
  isWheelFileName,
  MAX_PACKAGE_DEPS,
} from './packageProtocol';
import type { PackageInfo } from './packageProtocol';

export const PACKAGES_STORAGE_KEY = 'python:packages-v1';
export const MAX_MANIFEST_ENTRIES = 200;
export const MAX_MANIFEST_JSON_CHARS = 64 * 1024;

export type KeptSource = 'bundled' | 'pypi' | 'wheel';

export interface ManifestEntry {
  /** Canonical (PEP 503) distribution name. */
  readonly name: string;
  readonly version: string;
  readonly source: KeptSource;
  /** false for a dependency kept only because another entry needs it. */
  readonly requested: boolean;
  readonly keep: boolean;
  /** pypi and wheel only: lower-case hex of the wheel bytes. */
  readonly sha256?: string;
  /** pypi only (optional): https://files.pythonhosted.org/… */
  readonly url?: string;
  /** pypi and wheel only. */
  readonly fileName?: string;
  readonly depends: readonly string[];
  readonly imports: readonly string[];
  readonly installedAt: string;
  readonly pyodideVersion: string;
  readonly abiVersion: string;
}

export interface PackageManifest {
  readonly v: 1;
  readonly updatedAt: string;
  readonly entries: readonly ManifestEntry[];
}

/** What planRestore and the wheel checks need from `ready`. */
export interface RuntimeInfo {
  readonly pyodideVersion: string;
  readonly pythonVersion: string;
  readonly abiVersion: string;
  readonly platform: string;
}

const VERSION_RE = /^[A-Za-z0-9.+!_-]{1,64}$/;
const IMPORT_RE = /^[A-Za-z_][A-Za-z0-9_.]{0,127}$/;
const TAG_VALUE_RE = /^[A-Za-z0-9._+-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}T[0-9:.]{2,18}Z$/;
const SOURCES = new Set<string>(['bundled', 'pypi', 'wheel']);

export function canonicalName(name: string): string {
  return name.replace(/[-_.]+/g, '-').toLowerCase();
}

export function emptyManifest(): PackageManifest {
  return { v: 1, updatedAt: new Date(0).toISOString(), entries: [] };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function names(v: unknown, re: RegExp | null): string[] | null {
  if (!Array.isArray(v) || v.length > MAX_PACKAGE_DEPS) return null;
  const out: string[] = [];
  for (const item of v) {
    if (re ? typeof item !== 'string' || !re.test(item) : !isPackageName(item)) return null;
    out.push(re ? item : canonicalName(item));
  }
  return out;
}

/** One validated entry (unknown fields dropped), or null. Shared by the manifest and the lock file. */
export function validateEntry(raw: unknown): ManifestEntry | null {
  if (!isRecord(raw)) return null;
  const { name, version, source } = raw;
  if (!isPackageName(name) || canonicalName(name) !== name) return null;
  if (typeof version !== 'string' || !VERSION_RE.test(version)) return null;
  if (typeof source !== 'string' || !SOURCES.has(source)) return null;
  if (typeof raw.requested !== 'boolean' || typeof raw.keep !== 'boolean') return null;
  for (const key of ['installedAt', 'pyodideVersion', 'abiVersion'] as const) {
    if (typeof raw[key] !== 'string') return null;
  }
  if (!DATE_RE.test(raw.installedAt as string)) return null;
  if (!TAG_VALUE_RE.test(raw.pyodideVersion as string) || !TAG_VALUE_RE.test(raw.abiVersion as string)) return null;
  const depends = names(raw.depends, null);
  const imports = names(raw.imports, IMPORT_RE);
  if (!depends || !imports) return null;
  const entry: {
    -readonly [K in keyof ManifestEntry]: ManifestEntry[K];
  } = {
    name,
    version,
    source: source as KeptSource,
    requested: raw.requested,
    keep: raw.keep,
    depends,
    imports,
    installedAt: raw.installedAt as string,
    pyodideVersion: raw.pyodideVersion as string,
    abiVersion: raw.abiVersion as string,
  };
  if (source === 'bundled') {
    if (raw.sha256 !== undefined || raw.url !== undefined || raw.fileName !== undefined) return null;
    return entry;
  }
  if (!isSha256Hex(raw.sha256) || !isWheelFileName(raw.fileName)) return null;
  const parsed = parseWheelFileName(raw.fileName);
  if (!parsed || parsed.name !== name) return null;
  entry.sha256 = raw.sha256;
  entry.fileName = raw.fileName;
  if (raw.url !== undefined) {
    if (source !== 'pypi' || !isPythonHostedUrl(raw.url)) return null;
    if (new URL(raw.url).pathname.split('/').pop() !== raw.fileName) return null;
    entry.url = raw.url;
  }
  return entry;
}

export interface ManifestRead {
  readonly manifest: PackageManifest;
  /** Entries dropped as invalid, duplicate or over the cap. */
  readonly dropped: number;
  /** The stored value was unreadable as a whole (treated as empty). */
  readonly invalid: boolean;
}

/** Strict validation: invalid entries are dropped; an invalid whole is treated as empty. */
export function validateManifest(raw: unknown): ManifestRead {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.entries)) {
    return { manifest: emptyManifest(), dropped: 0, invalid: raw !== null && raw !== undefined };
  }
  const entries: ManifestEntry[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const item of raw.entries) {
    const entry = validateEntry(item);
    if (!entry || seen.has(entry.name) || entries.length >= MAX_MANIFEST_ENTRIES) {
      dropped += 1;
      continue;
    }
    seen.add(entry.name);
    entries.push(entry);
  }
  const updatedAt = typeof raw.updatedAt === 'string' && DATE_RE.test(raw.updatedAt) ? raw.updatedAt : emptyManifest().updatedAt;
  return { manifest: { v: 1, updatedAt, entries }, dropped, invalid: false };
}

function defaultStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readManifest(storage: Storage | null = defaultStorage()): ManifestRead {
  let text: string | null = null;
  try {
    text = storage ? storage.getItem(PACKAGES_STORAGE_KEY) : null;
  } catch {
    text = null;
  }
  if (text === null) return { manifest: emptyManifest(), dropped: 0, invalid: false };
  if (text.length > MAX_MANIFEST_JSON_CHARS) return { manifest: emptyManifest(), dropped: 0, invalid: true };
  try {
    return validateManifest(JSON.parse(text));
  } catch {
    return { manifest: emptyManifest(), dropped: 0, invalid: true };
  }
}

/** Validates every entry again and writes; throws when over the caps or when storage refuses. */
export function writeManifest(entries: readonly ManifestEntry[], storage: Storage | null = defaultStorage()): PackageManifest {
  if (!storage) throw new Error('localStorage is not available');
  if (entries.length > MAX_MANIFEST_ENTRIES) throw new Error(`At most ${MAX_MANIFEST_ENTRIES} packages can be kept`);
  const manifest: PackageManifest = { v: 1, updatedAt: new Date().toISOString(), entries: [...entries] };
  const check = validateManifest(JSON.parse(JSON.stringify(manifest)));
  if (check.dropped || check.manifest.entries.length !== entries.length) throw new Error('Invalid manifest entry');
  const text = JSON.stringify(manifest);
  if (text.length > MAX_MANIFEST_JSON_CHARS) throw new Error('The list of kept packages is too large');
  if (entries.length === 0) storage.removeItem(PACKAGES_STORAGE_KEY);
  else storage.setItem(PACKAGES_STORAGE_KEY, text);
  return manifest;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}

// --- Wheel file names (same rules as micropip's check_compatible in rt/packages.py) ---------------

export interface WheelName {
  /** Canonical distribution name. */
  readonly name: string;
  readonly version: string;
  readonly pythonTags: readonly string[];
  readonly abiTags: readonly string[];
  readonly platformTags: readonly string[];
}

export function parseWheelFileName(fileName: string): WheelName | null {
  if (!isWheelFileName(fileName)) return null;
  const parts = fileName.slice(0, -4).split('-');
  if (parts.length !== 5 && parts.length !== 6) return null;
  const [dist, version] = parts;
  const [py, abi, plat] = parts.slice(-3);
  if (!dist || !version || !py || !abi || !plat) return null;
  return {
    name: canonicalName(dist),
    version,
    pythonTags: py.split('.'),
    abiTags: abi.split('.'),
    platformTags: plat.split('.'),
  };
}

export type WheelTagProblem = 'name' | 'platform' | 'abi' | 'python';

export interface WheelTagCheck {
  readonly problem: WheelTagProblem;
  /** The wheel's platform tag (for the incompatible-wheel text). */
  readonly platform: string;
}

/** null when Pyodide (`runtime`) can install the wheel, else what does not match. */
export function checkWheelTags(fileName: string, runtime: Pick<RuntimeInfo, 'pythonVersion' | 'abiVersion' | 'platform'>): WheelTagCheck | null {
  const w = parseWheelFileName(fileName);
  if (!w) return { problem: 'name', platform: '' };
  const [major, minor] = runtime.pythonVersion.split('.').map((x) => Number.parseInt(x, 10));
  const cp = `cp${major}${minor}`;
  const pyOk = (tag: string, cpAllowed: (n: number) => boolean): boolean => {
    let m = /^py(\d)(\d*)$/.exec(tag);
    if (m) return Number(m[1]) === major && (m[2] === '' || Number(m[2]) <= minor);
    m = /^cp(\d)(\d+)$/.exec(tag);
    return !!m && Number(m[1]) === major && cpAllowed(Number(m[2]));
  };
  const plats = new Set(['any', `pyemscripten_${runtime.abiVersion}_wasm32`, `${runtime.platform}_wasm32`]);
  const platform = w.platformTags.find((p) => plats.has(p)) ?? null;
  if (!platform) return { problem: 'platform', platform: w.platformTags[0] ?? '' };
  const any = platform === 'any';
  const abis = any ? ['none'] : [cp, 'abi3', 'none'];
  if (!w.abiTags.some((a) => abis.includes(a))) return { problem: 'abi', platform };
  for (const abi of w.abiTags) {
    for (const py of w.pythonTags) {
      if (abi === cp && py === cp) return null;
      if (abi === 'abi3' && pyOk(py, (n) => n <= minor && /^cp/.test(py))) return null;
      if (abi === 'none' && pyOk(py, (n) => n === minor)) return null;
    }
  }
  return { problem: 'python', platform };
}

/** Pure-Python wheels (platform `any`) keep working across Pyodide versions after a confirmation. */
export function isPureWheel(fileName: string): boolean {
  const w = parseWheelFileName(fileName);
  return !!w && w.platformTags.every((p) => p === 'any');
}

// --- Bundled index (our own /pyodide/pyodide-lock.json) ------------------------------------------

export interface BundledPackage {
  readonly name: string;
  readonly version: string;
  readonly fileName: string;
  readonly sha256: string;
  readonly depends: readonly string[];
  readonly imports: readonly string[];
}

export type BundledIndex = ReadonlyMap<string, BundledPackage>;

export function parseBundledLock(raw: unknown): BundledIndex {
  const out = new Map<string, BundledPackage>();
  if (!isRecord(raw) || !isRecord(raw.packages)) return out;
  for (const value of Object.values(raw.packages)) {
    if (!isRecord(value) || !isPackageName(value.name) || typeof value.version !== 'string') continue;
    if (!VERSION_RE.test(value.version)) continue;
    const name = canonicalName(value.name);
    out.set(name, {
      name,
      version: value.version,
      fileName: typeof value.file_name === 'string' ? value.file_name : '',
      sha256: isSha256Hex(value.sha256) ? value.sha256 : '',
      depends: names(value.depends, null) ?? [],
      imports: names(value.imports, IMPORT_RE) ?? [],
    });
  }
  return out;
}

let bundledPromise: Promise<BundledIndex> | null = null;

/** Our lock, same origin only (never a CDN); cached for the page's lifetime. */
export function loadBundledIndex(fetchFn: typeof fetch = fetch): Promise<BundledIndex> {
  if (!bundledPromise) {
    bundledPromise = fetchFn(getPyodideLockFileUrl(), { credentials: 'same-origin', cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : null))
      .then(parseBundledLock)
      .catch(() => {
        bundledPromise = null;
        return new Map<string, BundledPackage>();
      });
  }
  return bundledPromise;
}

// --- Manifest entries from installed packages ---------------------------------------------------

export type KeepProblem = 'code' | 'no-hash' | 'invalid';

/** A manifest entry for an installed package (data from pkg.result), or why it cannot be kept. */
export function entryFromInfo(
  info: PackageInfo,
  runtime: RuntimeInfo,
  requested: boolean,
  now: Date = new Date(),
): ManifestEntry | KeepProblem {
  if (info.source === 'code') return 'code';
  const base = {
    name: canonicalName(info.name),
    version: info.version,
    source: info.source,
    requested,
    keep: true,
    depends: info.depends.map(canonicalName),
    imports: [...info.imports],
    installedAt: now.toISOString(),
    pyodideVersion: runtime.pyodideVersion,
    abiVersion: runtime.abiVersion,
  };
  let raw: Record<string, unknown> = base;
  if (info.source !== 'bundled') {
    if (!info.sha256 || !info.fileName) return 'no-hash';
    raw = { ...base, sha256: info.sha256, fileName: info.fileName };
    if (info.source === 'pypi' && info.url) raw.url = info.url;
  }
  return validateEntry(raw) ?? 'invalid';
}

// --- Restore plan --------------------------------------------------------------------------------

/** Codes for i18n (P6). */
export type RestoreSkipReason =
  /** Installed under another Pyodide version: restored only after the visitor confirms. */
  | 'stale'
  /** A compiled wheel for another Pyodide ABI or platform: never installed. */
  | 'incompatible'
  /** A bundled entry our lock no longer has. */
  | 'not-bundled'
  /** A PyPI entry without a saved copy, network Off. */
  | 'network-off'
  /** A PyPI entry without a saved copy, in Selected hosts or Everything. */
  | 'needs-package-index'
  /** No saved bytes for a wheel entry (upload the file again). */
  | 'wheel-missing'
  /** Saved bytes do not hash to the manifest's sha256 (never installed, never fetched instead). */
  | 'hash-mismatch';

export interface RestoreSkip {
  readonly name: string;
  readonly version: string;
  readonly source: KeptSource;
  readonly reason: RestoreSkipReason;
}

export type RestorePlanItem =
  | { readonly kind: 'bundled'; readonly entry: ManifestEntry }
  /** Saved bytes to load and hash; `fallbackUrl` only when they are missing in Package index mode. */
  | { readonly kind: 'saved'; readonly entry: ManifestEntry; readonly fallbackUrl?: string };

export interface RestorePlan {
  readonly items: readonly RestorePlanItem[];
  readonly skipped: readonly RestoreSkip[];
}

export interface PlanRestoreOptions {
  /** sha256 values present in the wheels store (rows still hashed on use). */
  readonly saved: ReadonlySet<string>;
  readonly bundled?: BundledIndex | null;
  /** Names of stale entries the visitor confirmed. */
  readonly confirmStale?: ReadonlySet<string>;
}

const skip = (e: ManifestEntry, reason: RestoreSkipReason): RestoreSkip => ({
  name: e.name,
  version: e.version,
  source: e.source,
  reason,
});

/**
 * What to install for the kept entries in this mode and runtime. Never plans a network fetch outside
 * Package index mode, never re-installs a stale entry from the network on its own, and leaves hashing
 * the saved bytes to the caller (a mismatch becomes 'hash-mismatch').
 */
export function planRestore(
  entries: readonly ManifestEntry[],
  mode: NetworkMode,
  runtime: RuntimeInfo,
  options: PlanRestoreOptions,
): RestorePlan {
  const items: RestorePlanItem[] = [];
  const skipped: RestoreSkip[] = [];
  for (const e of entries) {
    if (!e.keep) continue;
    if (e.source === 'bundled') {
      if (options.bundled && options.bundled.size > 0 && !options.bundled.has(e.name)) skipped.push(skip(e, 'not-bundled'));
      else items.push({ kind: 'bundled', entry: e });
      continue;
    }
    const fileName = e.fileName as string;
    if (checkWheelTags(fileName, runtime)) {
      skipped.push(skip(e, 'incompatible'));
      continue;
    }
    const changed = e.pyodideVersion !== runtime.pyodideVersion || e.abiVersion !== runtime.abiVersion;
    if (changed && !options.confirmStale?.has(e.name)) {
      skipped.push(skip(e, isPureWheel(fileName) || e.abiVersion === runtime.abiVersion ? 'stale' : 'incompatible'));
      continue;
    }
    const hasBytes = options.saved.has(e.sha256 as string);
    const fallbackUrl = e.source === 'pypi' && mode === 'pkg' && e.url ? e.url : undefined;
    if (hasBytes) items.push(fallbackUrl ? { kind: 'saved', entry: e, fallbackUrl } : { kind: 'saved', entry: e });
    else if (fallbackUrl) items.push({ kind: 'saved', entry: e, fallbackUrl });
    else if (e.source === 'wheel') skipped.push(skip(e, 'wheel-missing'));
    else skipped.push(skip(e, mode === 'off' ? 'network-off' : mode === 'pkg' ? 'wheel-missing' : 'needs-package-index'));
  }
  return { items, skipped };
}

/** Entries kept because a requested entry needs them and nothing else; for removal of orphans. */
export function orphanedDependencies(entries: readonly ManifestEntry[]): string[] {
  const needed = new Set<string>();
  const byName = new Map(entries.map((e) => [e.name, e]));
  const visit = (name: string) => {
    if (needed.has(name)) return;
    needed.add(name);
    for (const d of byName.get(name)?.depends ?? []) visit(d);
  };
  for (const e of entries) if (e.requested) visit(e.name);
  return entries.filter((e) => !needed.has(e.name)).map((e) => e.name);
}
