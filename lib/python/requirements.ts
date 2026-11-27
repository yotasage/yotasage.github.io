// requirements.txt and lock files for the Python playground's packages (P5b). Framework-free.
// Parsing a file never installs anything: plans list what the current network mode can reach and
// every other line with a reason code (for i18n in P6). Bundled packages work in every mode, PyPI only
// in Package index mode, wheels only from bytes the visitor supplied (saved in the wheels store).

import type { NetworkMode } from './network';
import { isPackageName, MAX_REQUIREMENT_CHARS } from './packageProtocol';
import type { PackageInfo, PackageInstallItem } from './packageProtocol';
import { canonicalName, validateEntry } from './packages';
import type { BundledIndex, ManifestEntry, RuntimeInfo } from './packages';

export const MAX_REQUIREMENTS_CHARS = 64 * 1024;
export const MAX_REQUIREMENT_LINES = 500;
export const LOCK_FORMAT = 'yotasage-python-lock/1';

export type RequirementSkipReason =
  /** -r / -c: import that file too. */
  | 'include'
  /** -e / --editable. */
  | 'editable'
  /** Direct URL, VCS link or local path (only PyPI and uploaded wheels are used). */
  | 'url'
  /** --index-url, --extra-index-url, --find-links, --no-index, --trusted-host. */
  | 'index-option'
  /** Any other option. */
  | 'option'
  /** Not a valid requirement. */
  | 'invalid'
  /** The same package named twice (the first line counts). */
  | 'duplicate'
  /** Past 500 requirements, or the file is over 64 KiB. */
  | 'too-many'
  /** Planning: the bundled version does not satisfy the specifier (`info` is that version). */
  | 'bundled-version'
  /** Planning: a PyPI package, network Off. */
  | 'network-off'
  /** Planning: a PyPI package, in Selected hosts or Everything. */
  | 'needs-package-index';

export interface Requirement {
  readonly line: number;
  /** Canonical name. */
  readonly name: string;
  readonly extras: readonly string[];
  /** Normalised specifier, e.g. ">=1.0,<2" ('' for any version). */
  readonly specifier: string;
  readonly marker?: string;
  /** sha256 values from --hash=sha256:… (enforced before install, with post-install defense-in-depth). */
  readonly hashes: readonly string[];
  /** PEP 508 text sent to micropip (without hashes). */
  readonly requirement: string;
}

export interface RequirementSkip {
  readonly line: number;
  readonly text: string;
  readonly reason: RequirementSkipReason;
  readonly name?: string;
  readonly info?: string;
}

export interface ParsedRequirements {
  readonly requirements: readonly Requirement[];
  readonly skipped: readonly RequirementSkip[];
}

const NAME_PART = '[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?';
const REQ_RE = new RegExp(`^(${NAME_PART})\\s*(?:\\[([^\\]]*)\\])?\\s*(.*?)\\s*(?:;\\s*(.*))?$`);
const CLAUSE_RE = /^(~=|===|==|!=|<=|>=|<|>)\s*([A-Za-z0-9.*+!_-]+)$/;
const MARKER_RE = /^[A-Za-z0-9_ .'"<>=!~(),*+-]{1,256}$/;
const URLISH_RE = /^(?:[a-z][a-z0-9+.-]*:|\.{0,2}[\\/]|[A-Za-z]:[\\/])/i;
const ARCHIVE_RE = /\.(?:whl|zip|tar\.gz|tgz|tar\.bz2)$/i;
const INCLUDE_OPTS = new Set(['-r', '--requirement', '-c', '--constraint']);
const EDITABLE_OPTS = new Set(['-e', '--editable']);
const INDEX_OPTS = new Set(['-i', '--index-url', '--extra-index-url', '-f', '--find-links', '--no-index', '--trusted-host']);

function optionReason(token: string): RequirementSkipReason {
  const opt = token.split('=')[0].replace(/^(-[a-zA-Z])\S+$/, '$1');
  if (INCLUDE_OPTS.has(opt)) return 'include';
  if (EDITABLE_OPTS.has(opt)) return 'editable';
  if (INDEX_OPTS.has(opt)) return 'index-option';
  return 'option';
}

/** Logical lines (continuations joined, comments removed) with the number of their first line. */
function logicalLines(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  let buf = '';
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    let s = raw[i];
    if (!buf) start = i + 1;
    // pip: a comment starts at # at the line start or after whitespace.
    s = s.replace(/(^|\s)#.*$/, '$1');
    if (s.endsWith('\\')) {
      buf += `${s.slice(0, -1)} `;
      continue;
    }
    buf += s;
    if (buf.trim()) out.push({ line: start, text: buf.trim().replace(/\s+/g, ' ') });
    buf = '';
  }
  if (buf.trim()) out.push({ line: start, text: buf.trim().replace(/\s+/g, ' ') });
  return out;
}

export function parseRequirementLine(text: string, line = 1): Requirement | RequirementSkip {
  const fail = (reason: RequirementSkipReason, name?: string): RequirementSkip =>
    name ? { line, text, reason, name } : { line, text, reason };
  if (text.length > MAX_REQUIREMENT_CHARS) return fail('invalid');
  if (text.startsWith('-')) return fail(optionReason(text.split(' ')[0]));
  const hashes: string[] = [];
  const tokens = text.split(' ');
  const first = tokens.findIndex((t) => t.startsWith('--'));
  const body = (first < 0 ? tokens : tokens.slice(0, first)).join(' ');
  for (const t of first < 0 ? [] : tokens.slice(first)) {
    const m = /^--hash=sha256:([0-9a-fA-F]{64})$/.exec(t);
    if (m) hashes.push(m[1].toLowerCase());
    else if (t.startsWith('--')) return fail(t.startsWith('--hash') ? 'invalid' : optionReason(t));
    else return fail('invalid');
  }
  if (/\s@\s|^[^\s;]*@/.test(body) || URLISH_RE.test(body) || ARCHIVE_RE.test(body.split(';')[0].trim())) {
    return fail('url');
  }
  const m = REQ_RE.exec(body);
  if (!m || !isPackageName(m[1])) return fail('invalid');
  const name = canonicalName(m[1]);
  const extras = m[2] === undefined ? [] : m[2].split(',').map((x) => x.trim()).filter(Boolean);
  if (extras.some((x) => !/^[A-Za-z0-9._-]{1,64}$/.test(x))) return fail('invalid', name);
  let spec = (m[3] || '').trim();
  if (spec.startsWith('(') && spec.endsWith(')')) spec = spec.slice(1, -1).trim();
  const clauses: string[] = [];
  if (spec) {
    for (const part of spec.split(',')) {
      const c = CLAUSE_RE.exec(part.trim());
      if (!c) return fail('invalid', name);
      if (c[2].includes('*') && c[1] !== '==' && c[1] !== '!=') return fail('invalid', name);
      clauses.push(`${c[1]}${c[2]}`);
    }
  }
  const marker = m[4]?.trim();
  if (marker !== undefined && !MARKER_RE.test(marker)) return fail('invalid', name);
  const specifier = clauses.join(',');
  const requirement = `${name}${extras.length ? `[${extras.join(',')}]` : ''}${specifier}${marker ? `; ${marker}` : ''}`;
  return marker
    ? { line, name, extras, specifier, marker, hashes, requirement }
    : { line, name, extras, specifier, hashes, requirement };
}

export function parseRequirements(text: string): ParsedRequirements {
  if (text.length > MAX_REQUIREMENTS_CHARS) {
    return { requirements: [], skipped: [{ line: 0, text: '', reason: 'too-many' }] };
  }
  const requirements: Requirement[] = [];
  const skipped: RequirementSkip[] = [];
  const seen = new Set<string>();
  for (const { line, text: t } of logicalLines(text)) {
    const r = parseRequirementLine(t, line);
    if ('reason' in r) skipped.push(r);
    else if (seen.has(r.name)) skipped.push({ line, text: t, reason: 'duplicate', name: r.name });
    else if (requirements.length >= MAX_REQUIREMENT_LINES) skipped.push({ line, text: t, reason: 'too-many', name: r.name });
    else {
      seen.add(r.name);
      requirements.push(r);
    }
  }
  return { requirements, skipped };
}

// --- PEP 440 versions (enough for specifiers against our bundled versions) ------------------------

interface ParsedVersion {
  readonly epoch: number;
  readonly release: readonly number[];
  /** [rank, n]: dev < a < b < rc < (final) < post. */
  readonly pre: readonly [number, number];
  readonly post: number;
  readonly dev: number;
}

function parseVersion(v: string): ParsedVersion | null {
  const m = /^v?(?:(\d+)!)?(\d+(?:\.\d+)*)(?:[-_.]?(a|alpha|b|beta|c|rc|pre|preview)[-_.]?(\d*))?(?:-(\d+)|[-_.]?(?:post|rev|r)[-_.]?(\d*))?(?:[-_.]?dev[-_.]?(\d*))?(?:\+[a-z0-9.]+)?$/i.exec(
    v.trim(),
  );
  if (!m) return null;
  const preKind = (m[3] || '').toLowerCase();
  const rank = preKind.startsWith('a') ? 1 : preKind.startsWith('b') ? 2 : preKind ? 3 : 4;
  const post = m[5] ?? m[6];
  return {
    epoch: Number(m[1] || 0),
    release: m[2].split('.').map(Number),
    pre: [rank, Number(m[4] || 0)],
    post: post === undefined ? -1 : Number(post || 0),
    dev: m[7] === undefined ? Infinity : Number(m[7] || 0),
  };
}

export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return a === b ? 0 : a < b ? -1 : 1;
  if (x.epoch !== y.epoch) return x.epoch - y.epoch;
  const n = Math.max(x.release.length, y.release.length);
  for (let i = 0; i < n; i++) {
    const d = (x.release[i] ?? 0) - (y.release[i] ?? 0);
    if (d) return d;
  }
  // A dev release of a final version sorts before its pre-releases.
  const xr = x.pre[0] === 4 && x.post < 0 && x.dev !== Infinity ? 0 : x.pre[0];
  const yr = y.pre[0] === 4 && y.post < 0 && y.dev !== Infinity ? 0 : y.pre[0];
  if (xr !== yr) return xr - yr;
  if (x.pre[1] !== y.pre[1]) return x.pre[1] - y.pre[1];
  if (x.post !== y.post) return x.post - y.post;
  return x.dev === y.dev ? 0 : x.dev < y.dev ? -1 : 1;
}

function prefixMatch(version: string, pattern: string): boolean {
  const v = parseVersion(version);
  const p = parseVersion(pattern.replace(/\.\*$/, ''));
  if (!v || !p) return false;
  return p.release.every((n, i) => (v.release[i] ?? 0) === n) && v.epoch === p.epoch;
}

/** True when `version` satisfies every clause of `specifier` ('' accepts any version). */
export function satisfies(version: string, specifier: string): boolean {
  if (!specifier) return true;
  return specifier.split(',').every((clause) => {
    const c = CLAUSE_RE.exec(clause.trim());
    if (!c) return false;
    const [, op, target] = c;
    if (op === '===') return version === target;
    if (target.endsWith('.*')) return op === '==' ? prefixMatch(version, target) : !prefixMatch(version, target);
    const cmp = compareVersions(version, target);
    switch (op) {
      case '==':
        return cmp === 0;
      case '!=':
        return cmp !== 0;
      case '<=':
        return cmp <= 0;
      case '>=':
        return cmp >= 0;
      case '<':
        return cmp < 0;
      case '>':
        return cmp > 0;
      default: {
        // ~=X.Y.Z → >=X.Y.Z, ==X.Y.*
        const parts = target.split('.');
        return cmp >= 0 && parts.length > 1 && prefixMatch(version, `${parts.slice(0, -1).join('.')}.*`);
      }
    }
  });
}

// --- Planning an import --------------------------------------------------------------------------

export interface RequirementsPlan {
  readonly items: readonly PackageInstallItem[];
  readonly planned: readonly { readonly requirement: Requirement; readonly via: 'bundled' | 'pypi' }[];
  readonly skipped: readonly RequirementSkip[];
}

/** What can be installed in this mode; nothing is installed here. */
export function planRequirements(parsed: ParsedRequirements, mode: NetworkMode, bundled: BundledIndex): RequirementsPlan {
  const items: PackageInstallItem[] = [];
  const planned: { requirement: Requirement; via: 'bundled' | 'pypi' }[] = [];
  const skipped: RequirementSkip[] = [...parsed.skipped];
  for (const r of parsed.requirements) {
    const b = bundled.get(r.name);
    const text = r.requirement;
    if (b) {
      if (satisfies(b.version, r.specifier)) {
        items.push({ kind: 'bundled', name: r.name });
        planned.push({ requirement: r, via: 'bundled' });
      } else {
        skipped.push({ line: r.line, text, reason: 'bundled-version', name: r.name, info: b.version });
      }
    } else if (mode === 'pkg') {
      items.push({
        kind: 'pypi',
        requirement: r.requirement,
        ...(r.hashes.length > 0 ? { hashes: r.hashes } : {}),
      });
      planned.push({ requirement: r, via: 'pypi' });
    } else {
      skipped.push({ line: r.line, text, reason: mode === 'off' ? 'network-off' : 'needs-package-index', name: r.name });
    }
  }
  return { items, planned, skipped };
}

/** Requirements whose `--hash` values do not include the installed wheel's sha256. */
export function hashProblems(installed: readonly PackageInfo[], requirements: readonly Requirement[]): string[] {
  const byName = new Map(installed.map((p) => [canonicalName(p.name), p]));
  return requirements
    .filter((r) => r.hashes.length > 0)
    .filter((r) => {
      const p = byName.get(r.name);
      return !!p && (!p.sha256 || !r.hashes.includes(p.sha256));
    })
    .map((r) => r.name);
}

// --- Export ----------------------------------------------------------------------------------------

type Exportable = Pick<ManifestEntry, 'name' | 'version' | 'source' | 'sha256' | 'fileName'> & {
  readonly requested?: boolean;
};

/** One `name==version` line per requested entry, with pip's --hash for PyPI and wheel entries. */
export function exportRequirements(entries: readonly Exportable[]): string {
  const lines = ['# Python playground packages (requirements.txt)'];
  for (const e of entries) {
    if (e.requested === false) continue;
    const comment = e.source === 'bundled' ? 'bundled' : e.source === 'pypi' ? 'PyPI' : `wheel: ${e.fileName ?? ''}`;
    const hash = e.source !== 'bundled' && e.sha256 ? ` --hash=sha256:${e.sha256}` : '';
    lines.push(`${e.name}==${e.version}${hash}  # ${comment}`);
  }
  return `${lines.join('\n')}\n`;
}

export interface PackageLock {
  readonly format: typeof LOCK_FORMAT;
  readonly pyodideVersion: string;
  readonly abiVersion: string;
  readonly entries: readonly ManifestEntry[];
}

export function exportLock(entries: readonly ManifestEntry[], runtime: Pick<RuntimeInfo, 'pyodideVersion' | 'abiVersion'>): string {
  const lock = {
    format: LOCK_FORMAT,
    pyodideVersion: runtime.pyodideVersion,
    abiVersion: runtime.abiVersion,
    entries: entries.map((e) => {
      const { keep: _keep, installedAt: _at, ...rest } = e;
      return rest;
    }),
  };
  return `${JSON.stringify(lock, null, 2)}\n`;
}

/**
 * Reads a lock file strictly (invalid entries dropped and counted). Entries come back as kept entries
 * stamped with the lock's Pyodide version, so planRestore() decides about them like a manifest.
 */
export function parseLock(text: string): { readonly lock: PackageLock | null; readonly dropped: number } {
  if (text.length > MAX_REQUIREMENTS_CHARS * 4) return { lock: null, dropped: 0 };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { lock: null, dropped: 0 };
  }
  if (typeof raw !== 'object' || raw === null) return { lock: null, dropped: 0 };
  const r = raw as Record<string, unknown>;
  if (r.format !== LOCK_FORMAT || !Array.isArray(r.entries) || r.entries.length > MAX_REQUIREMENT_LINES) {
    return { lock: null, dropped: 0 };
  }
  if (typeof r.pyodideVersion !== 'string' || typeof r.abiVersion !== 'string') return { lock: null, dropped: 0 };
  const entries: ManifestEntry[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const item of r.entries) {
    const e =
      typeof item === 'object' && item !== null
        ? validateEntry({
            ...(item as Record<string, unknown>),
            keep: true,
            installedAt: '1970-01-01T00:00:00.000Z',
            pyodideVersion: r.pyodideVersion,
            abiVersion: r.abiVersion,
          })
        : null;
    if (!e || seen.has(e.name)) {
      dropped += 1;
      continue;
    }
    seen.add(e.name);
    entries.push(e);
  }
  return {
    lock: { format: LOCK_FORMAT, pyodideVersion: r.pyodideVersion, abiVersion: r.abiVersion, entries },
    dropped,
  };
}
