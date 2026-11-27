// Build-time (Node-only) loader that reads references.bib and discovers which tool pages
// cite each entry by tracing the relative import graph of pages that call loadReferences().
//
// Only call this from getStaticProps: it uses node:fs and runs only at build time (or `next dev`).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { loadReferences } from './references';
import { IndexedReference, scanCitedKeysFromSource, ToolRefInfo } from './referencesCatalog';

const PAGE_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js']);
const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

// Preferred display order and translation keys for known citing tools; any future page
// calling loadReferences() is automatically discovered and appended with a humanized title.
const KNOWN_TOOL_META: Record<string, { titleKey: string; fallbackTitle: string; order: number }> = {
  '/simsetup/main': { titleKey: 'home.tool.simsetup.title', fallbackTitle: 'FFT & coherent sampling', order: 1 },
  '/resistor/main': { titleKey: 'home.tool.resistor.title', fallbackTitle: 'Resistor lookup', order: 2 },
  '/smith-chart/main': { titleKey: 'home.tool.smith.title', fallbackTitle: 'Smith chart', order: 3 },
  '/em-sim/main': { titleKey: 'home.tool.emsim.title', fallbackTitle: 'EM simulation', order: 4 },
};

// Shared infrastructure files excluded when scanning a tool's import footprint so example
// keys in comments/docs or Bibliography.tsx itself are never attributed to a tool.
const EXCLUDED_FILES = new Set([
  'components/Bibliography.tsx',
  'components/PageHead.tsx',
  'components/SiteFooter.tsx',
  'lib/bibtex.ts',
  'lib/citation.ts',
  'lib/references.ts',
  'lib/referencesCatalog.ts',
  'lib/referencesIndex.ts',
]);

const EXCLUDED_PREFIXES = ['components/UI/', 'components/icons/', 'lib/ui/', 'lib/generated/'];

export interface ReferencesCatalogData {
  items: IndexedReference[];
  tools: ToolRefInfo[];
}

function toPosix(root: string, absPath: string): string {
  return path.relative(root, absPath).split(path.sep).join(path.posix.sep);
}

function isFile(absPath: string): boolean {
  try {
    return statSync(absPath).isFile();
  } catch {
    return false;
  }
}

function humanizeRoute(route: string): string {
  const cleaned = route.replace(/^\/+/, '').replace(/\/main$/, '');
  const words = cleaned.split(/[/_-]+/).filter(Boolean);
  if (words.length === 0) return route;
  const joined = words.join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function collectPages(
  dir: string,
  pagesRoot: string,
  out: Array<{ route: string; absPath: string }> = [],
): Array<{ route: string; absPath: string }> {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'api') continue;
      collectPages(absPath, pagesRoot, out);
      continue;
    }
    const ext = path.extname(entry.name);
    if (!PAGE_EXTENSIONS.has(ext)) continue;
    const stem = entry.name.slice(0, -ext.length);
    if (stem.startsWith('_') || stem === '404' || stem === '500') continue;

    const rel = path.relative(pagesRoot, absPath).split(path.sep).join(path.posix.sep);
    const withoutExt = rel.slice(0, -ext.length);
    const route =
      withoutExt === 'index'
        ? '/'
        : withoutExt.endsWith('/index')
          ? `/${withoutExt.slice(0, -'/index'.length)}`
          : `/${withoutExt}`;
    out.push({ route, absPath });
  }
  return out;
}

function stripCommentsForImports(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

function extractRelativeSpecs(source: string): string[] {
  const cleaned = stripCommentsForImports(source);
  const specs = new Set<string>();
  const patterns = [
    /(?:\bfrom\s+|(?:^|;)\s*import\s+)['"](\.\.?\/[^'"]+)['"]/gm,
    /\b(?:import|require)\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const match of cleaned.matchAll(re)) {
      specs.add(match[1]);
    }
  }
  return [...specs];
}

function resolveRelativeCodeFile(root: string, fromAbsPath: string, rawSpec: string): string | null {
  const cleanSpec = rawSpec.split(/[?#]/, 1)[0];
  if (cleanSpec.endsWith('.css') || cleanSpec.endsWith('.json')) return null;

  const base = path.resolve(path.dirname(fromAbsPath), cleanSpec);
  const relToRoot = path.relative(root, base);
  if (!relToRoot || relToRoot.startsWith('..')) return null;

  const candidates: string[] = [base];
  const ext = path.extname(base).toLowerCase();
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
    const stem = base.slice(0, -ext.length);
    candidates.push(`${stem}.ts`, `${stem}.tsx`);
  }
  for (const codeExt of CODE_EXTENSIONS) {
    candidates.push(`${base}${codeExt}`);
  }
  for (const codeExt of CODE_EXTENSIONS) {
    candidates.push(path.join(base, `index${codeExt}`));
  }

  for (const cand of candidates) {
    if (isFile(cand) && PAGE_EXTENSIONS.has(path.extname(cand))) {
      return cand;
    }
  }
  return null;
}

function isExcludedPath(posixPath: string): boolean {
  if (EXCLUDED_FILES.has(posixPath)) return true;
  return EXCLUDED_PREFIXES.some((prefix) => posixPath.startsWith(prefix));
}

function traceToolCodeFiles(root: string, entryAbsPath: string): string[] {
  const visited = new Set<string>();
  const queue: string[] = [entryAbsPath];
  const files: string[] = [];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    const rel = toPosix(root, current);
    if (visited.has(rel)) continue;
    if (rel.startsWith('node_modules/') || isExcludedPath(rel)) continue;

    visited.add(rel);
    files.push(current);

    let text: string;
    try {
      text = readFileSync(current, 'utf8');
    } catch {
      continue;
    }

    for (const spec of extractRelativeSpecs(text)) {
      const target = resolveRelativeCodeFile(root, current, spec);
      if (!target) continue;
      const targetRel = toPosix(root, target);
      if (!visited.has(targetRel) && !isExcludedPath(targetRel)) {
        queue.push(target);
      }
    }
  }

  return files;
}

/** Loads all entries from references.bib and maps each entry to every tool page that cites it. */
export function loadIndexedReferences(rootDir = process.cwd()): ReferencesCatalogData {
  const entries = loadReferences();
  const knownKeys = new Set(entries.map((e) => e.key));

  const pagesRoot = path.join(rootDir, 'pages');
  const pages = collectPages(pagesRoot, pagesRoot);

  // Discover every page (except /references itself) that imports loadReferences.
  const citingPages: Array<{ route: string; absPath: string; keys: Set<string> }> = [];
  for (const page of pages) {
    if (page.route === '/references') continue;
    let source: string;
    try {
      source = readFileSync(page.absPath, 'utf8');
    } catch {
      continue;
    }
    if (!/\bloadReferences\b/.test(source)) continue;

    const footprint = traceToolCodeFiles(rootDir, page.absPath);
    const citedKeys = new Set<string>();
    for (const file of footprint) {
      let text: string;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const key of scanCitedKeysFromSource(text, knownKeys)) {
        citedKeys.add(key);
      }
    }

    if (citedKeys.size > 0) {
      citingPages.push({ route: page.route, absPath: page.absPath, keys: citedKeys });
    }
  }

  // Sort tools deterministically: known tools in site order, followed by any new routes alphabetically.
  citingPages.sort((a, b) => {
    const oa = KNOWN_TOOL_META[a.route]?.order ?? 1000;
    const ob = KNOWN_TOOL_META[b.route]?.order ?? 1000;
    if (oa !== ob) return oa - ob;
    return a.route.localeCompare(b.route, 'en');
  });

  const tools: ToolRefInfo[] = citingPages.map((p) => {
    const meta = KNOWN_TOOL_META[p.route];
    return {
      route: p.route,
      ...(meta ? { titleKey: meta.titleKey } : {}),
      fallbackTitle: meta?.fallbackTitle ?? humanizeRoute(p.route),
      count: p.keys.size,
    };
  });

  const items: IndexedReference[] = entries.map((entry, bibIndex) => ({
    entry,
    bibIndex,
    citedBy: citingPages.filter((p) => p.keys.has(entry.key)).map((p) => p.route),
  }));

  return { items, tools };
}
