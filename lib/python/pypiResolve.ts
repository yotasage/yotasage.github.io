// Resolves a requirement typed into the Packages panel against PyPI's simple JSON API (PEP 691), from
// the page and in Package index mode only, so the W6 dialog can name the exact version and host before
// anything is installed (P6). The install itself is still a `pkg.install` of `name==version` that
// micropip resolves and hash-checks in the worker. Framework-free.

import type { NetworkMode } from './network';
import { canonicalName, checkWheelTags, parseWheelFileName } from './packages';
import type { RuntimeInfo } from './packages';
import { compareVersions, satisfies } from './requirements';
import type { Requirement } from './requirements';

export const PYPI_SIMPLE_BASE = 'https://pypi.org/simple/';
export const PYPI_HOST = 'pypi.org';
const PEP691_ACCEPT = 'application/vnd.pypi.simple.v1+json';
const MAX_REPLY_CHARS = 16 * 1024 * 1024;
const MAX_LISTED_VERSIONS = 8;
const PRE_RE = /(?:a|b|c|rc|alpha|beta|pre|preview|dev)\d*(?:$|[.+_-])/i;

export type ResolveProblem = 'network-off' | 'needs-package-index' | 'not-found' | 'offline' | 'version-not-found' | 'no-browser-wheel';

export type ResolveResult =
  | {
      readonly ok: true;
      readonly name: string;
      readonly version: string;
      /** PEP 508 text for pkg.install (`name[extras]==version`). */
      readonly requirement: string;
      readonly host: typeof PYPI_HOST;
      readonly fileName: string;
    }
  | { readonly ok: false; readonly problem: ResolveProblem; readonly name: string; readonly info?: string };

interface SimpleFile {
  readonly filename: string;
  readonly yanked: boolean;
}

function isPreRelease(version: string): boolean {
  return PRE_RE.test(version.replace(/\.?post\d*/gi, ''));
}

/** Wheel files of a PEP 691 JSON reply (anything malformed is skipped). */
export function parseSimpleJson(raw: unknown): SimpleFile[] {
  if (!raw || typeof raw !== 'object') return [];
  const files = (raw as { files?: unknown }).files;
  if (!Array.isArray(files)) return [];
  const out: SimpleFile[] = [];
  for (const f of files.slice(0, 20000)) {
    if (!f || typeof f !== 'object') continue;
    const filename = (f as { filename?: unknown }).filename;
    if (typeof filename !== 'string' || filename.length > 512 || !filename.endsWith('.whl')) continue;
    const yanked = (f as { yanked?: unknown }).yanked;
    out.push({ filename, yanked: yanked === true || (typeof yanked === 'string' && yanked !== '') });
  }
  return out;
}

/**
 * Picks the newest version that satisfies the specifier and has a wheel this Pyodide can install
 * (pre-releases only when the specifier names one or nothing else matches; yanked files never).
 */
export function pickVersion(
  name: string,
  files: readonly SimpleFile[],
  specifier: string,
  runtime: Pick<RuntimeInfo, 'pythonVersion' | 'abiVersion' | 'platform'>,
): ResolveResult {
  const byVersion = new Map<string, { compatible: string | null; any: boolean }>();
  for (const f of files) {
    if (f.yanked) continue;
    const w = parseWheelFileName(f.filename);
    if (!w || w.name !== name) continue;
    const slot = byVersion.get(w.version) ?? { compatible: null, any: false };
    slot.any = true;
    if (!slot.compatible && !checkWheelTags(f.filename, runtime)) slot.compatible = f.filename;
    byVersion.set(w.version, slot);
  }
  const versions = [...byVersion.keys()].sort((a, b) => compareVersions(b, a));
  if (versions.length === 0) return { ok: false, problem: 'not-found', name };
  const matching = versions.filter((v) => satisfies(v, specifier));
  if (matching.length === 0) {
    return { ok: false, problem: 'version-not-found', name, info: versions.slice(0, MAX_LISTED_VERSIONS).join(', ') };
  }
  const wantsPre = /\d(?:a|b|rc|dev)\d*/i.test(specifier);
  const finals = matching.filter((v) => wantsPre || !isPreRelease(v));
  for (const list of [finals, matching]) {
    for (const v of list) {
      const slot = byVersion.get(v);
      if (slot?.compatible) {
        return { ok: true, name, version: v, requirement: `${name}==${v}`, host: PYPI_HOST, fileName: slot.compatible };
      }
    }
  }
  return { ok: false, problem: 'no-browser-wheel', name };
}

/** Looks the requirement up on pypi.org (Package index mode only; never in other modes). */
export async function resolvePypi(
  req: Pick<Requirement, 'name' | 'extras' | 'specifier'>,
  mode: NetworkMode,
  runtime: Pick<RuntimeInfo, 'pythonVersion' | 'abiVersion' | 'platform'>,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<ResolveResult> {
  const name = canonicalName(req.name);
  if (mode === 'off') return { ok: false, problem: 'network-off', name };
  if (mode !== 'pkg') return { ok: false, problem: 'needs-package-index', name };
  let raw: unknown = null;
  try {
    const res = await fetchFn(`${PYPI_SIMPLE_BASE}${encodeURIComponent(name)}/`, {
      headers: { Accept: PEP691_ACCEPT },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    if (res.status === 404) return { ok: false, problem: 'not-found', name };
    if (!res.ok) return { ok: false, problem: 'offline', name };
    const text = await res.text();
    if (text.length > MAX_REPLY_CHARS) return { ok: false, problem: 'offline', name };
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'offline', name };
  }
  const picked = pickVersion(name, parseSimpleJson(raw), req.specifier, runtime);
  if (!picked.ok || req.extras.length === 0) return picked;
  return { ...picked, requirement: `${name}[${req.extras.join(',')}]==${picked.version}` };
}
