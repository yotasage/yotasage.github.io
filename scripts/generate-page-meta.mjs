// Generates lib/generated/page-meta.json with per-route canonical metadata,
// git last-changed date/commit traced across each route's relative import graph,
// and a cross-platform deterministic SHA-256 content integrity fingerprint.
// Runs on `npm install` / `npm ci` via postinstall, before build:export, and via `npm run generate:meta`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ORIGIN = 'https://yotasage.github.io';
const SITE_NAME = 'yotasage.github.io';
const SITE_TITLE = 'yotasage.github.io — Browser Engineering & Utility Tools';
const SITE_AUTHOR = 'yotasage';
const REPOSITORY_URL = 'https://github.com/yotasage/yotasage.github.io';

const PAGE_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js', '.mdx']);
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css']);

// Global shell paths excluded from tool-specific footprints so site-wide chrome edits
// do not reset every individual tool's last-changed date or content fingerprint.
const EXCLUDED_SHELL_FILES = new Set([
  'components/SiteFooter.tsx',
  'components/PageHead.tsx',
  'lib/citation.ts',
  'styles/design-system.css',
  'styles/DesignSystem.module.css',
  'styles/Licenses.module.css',
  'styles/SiteFooter.module.css',
]);
const EXCLUDED_SHELL_PREFIXES = [
  'components/UI/',
  'components/icons/',
  'lib/ui/',
];

const CANONICAL_TITLES = {
  '/': SITE_TITLE,
  '/licenses': 'Open-Source Licenses',
  '/simsetup/main': 'Simulation setup',
  '/resistor/main': 'Resistor lookup',
  '/smith-chart/main': 'Smith chart',
  '/pcb-viewer/main': 'PCB viewer',
  '/em-sim/main': 'EM simulation',
  '/pdf/main': 'PDF tools',
  '/3d-viewer/main': '3D viewer',
  '/qrcode/main': 'QR code generator',
  '/qr-reader/main': 'QR code reader',
  '/base64-image/main': 'Base64 image converter',
  '/paint/main': 'Paint & Image Editor',
  '/text-case/main': 'Text case converter',
  '/calculator/main': 'Smart Calculator',
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = join(root, 'pages');
const outFile = join(root, 'lib', 'generated', 'page-meta.json');

function toPosix(absPath) {
  return relative(root, absPath).split(sep).join(posix.sep);
}

function cmpCodePoint(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function readPackageLicense() {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (typeof pkg.license === 'string' && pkg.license.trim()) {
      return pkg.license.trim();
    }
  } catch {
    // fallback below
  }
  return 'AGPL-3.0-or-later';
}

function unescapeJsString(raw) {
  return raw
    .replaceAll("\\'", "'")
    .replaceAll('\\"', '"')
    .replaceAll('\\n', '\n')
    .replaceAll('\\\\', '\\');
}

function parsePdfToolsMeta() {
  const map = new Map();
  const pdfToolsPath = join(root, 'lib', 'pdf', 'tools.ts');
  if (!existsSync(pdfToolsPath)) return map;

  const text = readFileSync(pdfToolsPath, 'utf8');
  const blockRe = /export\s+const\s+[A-Z0-9_]+\s*:\s*PdfTool\s*=\s*\{([\s\S]*?)\};/g;
  for (const match of text.matchAll(blockRe)) {
    const body = match[1];
    const hrefMatch = body.match(/\bhref\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/);
    const titleMatch = body.match(/\btitle\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/);
    const descMatch = body.match(/\bdescription\s*:\s*(['"])((?:\\.|(?!\1).)*)\1/);
    if (!hrefMatch || !titleMatch) continue;
    const href = unescapeJsString(hrefMatch[2]);
    const title = unescapeJsString(titleMatch[2]);
    const description = descMatch ? unescapeJsString(descMatch[2]) : undefined;
    map.set(href, { title, description });
  }
  return map;
}

function collectPages(dir, list = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    const absPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'api') continue;
      collectPages(absPath, list);
      continue;
    }

    const ext = extname(entry.name);
    if (!PAGE_EXTENSIONS.has(ext)) continue;

    const baseName = entry.name.slice(0, -ext.length);
    if (baseName.startsWith('_') || baseName === '404' || baseName === '500') continue;

    const relFromPages = relative(pagesDir, absPath).split(sep).join(posix.sep);
    const withoutExt = relFromPages.slice(0, -ext.length);

    let route;
    if (withoutExt === 'index') {
      route = '/';
    } else if (withoutExt.endsWith('/index')) {
      route = `/${withoutExt.slice(0, -'/index'.length)}`;
    } else {
      route = `/${withoutExt}`;
    }

    list.push({ route, sourcePath: toPosix(absPath), absPath });
  }
  return list;
}

function humanizeRoute(route) {
  const cleaned = route.replace(/^\/+/, '').replace(/\/main$/, '');
  if (!cleaned) return SITE_TITLE;
  const words = cleaned.split(/[/_-]+/).filter(Boolean);
  if (words.length === 0) return SITE_TITLE;
  const joined = words.join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function makeCiteKey(route) {
  if (route === '/') return 'yotasage_site';
  if (route === '/licenses') return 'yotasage_licenses';
  const cleaned = route
    .replace(/^\/+/, '')
    .replace(/\/main$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned ? `yotasage_${cleaned}` : 'yotasage_page';
}

function isExcludedShellPath(posixPath) {
  if (EXCLUDED_SHELL_FILES.has(posixPath)) return true;
  return EXCLUDED_SHELL_PREFIXES.some((prefix) => posixPath.startsWith(prefix));
}

function stripComments(source, isCss) {
  let out = '';
  let i = 0;
  const len = source.length;
  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    // Preserve string literals
    if (ch === "'" || ch === '"' || (!isCss && ch === '`')) {
      const quote = ch;
      out += ch;
      i++;
      while (i < len) {
        const c = source[i];
        out += c;
        i++;
        if (c === '\\' && i < len) {
          out += source[i];
          i++;
        } else if (c === quote) {
          break;
        }
      }
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }

    // Line comment (JS/TS only)
    if (!isCss && ch === '/' && next === '/') {
      i += 2;
      while (i < len && source[i] !== '\n') i++;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

const fileSpecCache = new Map();
const fileTextCache = new Map();

function readCachedText(absPath) {
  let text = fileTextCache.get(absPath);
  if (text === undefined) {
    text = readFileSync(absPath, 'utf8');
    fileTextCache.set(absPath, text);
  }
  return text;
}

function extractRelativeSpecs(absPath) {
  let specs = fileSpecCache.get(absPath);
  if (specs !== undefined) return specs;

  const ext = extname(absPath).toLowerCase();
  if (!SCAN_EXTENSIONS.has(ext)) {
    fileSpecCache.set(absPath, []);
    return [];
  }

  const isCss = ext === '.css';
  const cleaned = stripComments(readCachedText(absPath), isCss);
  const found = new Set();

  if (isCss) {
    const cssImportRe = /@import\s+(?:url\(\s*)?['"](\.\.?\/[^'"]+)['"]/g;
    for (const m of cleaned.matchAll(cssImportRe)) {
      found.add(m[1]);
    }
  } else {
    const staticRe = /(?:\bfrom\s+|(?:^|;)\s*import\s+)['"](\.\.?\/[^'"]+)['"]/gm;
    for (const m of cleaned.matchAll(staticRe)) {
      found.add(m[1]);
    }
    const callRe = /\b(?:import|require)\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
    for (const m of cleaned.matchAll(callRe)) {
      found.add(m[1]);
    }
    const urlWorkerRe = /\bnew\s+URL\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
    for (const m of cleaned.matchAll(urlWorkerRe)) {
      found.add(m[1]);
    }
  }

  specs = [...found];
  fileSpecCache.set(absPath, specs);
  return specs;
}

const resolveCache = new Map();

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveRelativeSpec(fromAbsPath, rawSpec) {
  const cleanSpec = rawSpec.split(/[?#]/, 1)[0];
  const cacheKey = `${dirname(fromAbsPath)}::${cleanSpec}`;
  if (resolveCache.has(cacheKey)) return resolveCache.get(cacheKey);

  const base = resolve(dirname(fromAbsPath), cleanSpec);
  const relToRoot = relative(root, base);
  if (relToRoot.startsWith('..') || relToRoot === '') {
    resolveCache.set(cacheKey, null);
    return null;
  }

  const candidates = [base];

  // Handle node16 ESM-style .js/.jsx/.mjs/.cjs specifiers targeting TypeScript sources
  const specExt = extname(base).toLowerCase();
  if (specExt === '.js' || specExt === '.jsx' || specExt === '.mjs' || specExt === '.cjs') {
    const stem = base.slice(0, -specExt.length);
    candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}.cts`);
  }

  for (const ext of RESOLVE_EXTENSIONS) {
    candidates.push(`${base}${ext}`);
  }
  for (const ext of RESOLVE_EXTENSIONS) {
    candidates.push(join(base, `index${ext}`));
  }

  let resolved = null;
  for (const candidate of candidates) {
    if (isFile(candidate)) {
      resolved = candidate;
      break;
    }
  }

  resolveCache.set(cacheKey, resolved);
  return resolved;
}

function traceFootprint(entryAbsPath, excludeShell) {
  const visited = new Set();
  const queue = [entryAbsPath];

  while (queue.length > 0) {
    const current = queue.pop();
    const rel = toPosix(current);
    if (visited.has(rel)) continue;
    if (rel.startsWith('lib/generated/') || rel.startsWith('node_modules/')) continue;
    if (excludeShell && current !== entryAbsPath && isExcludedShellPath(rel)) continue;

    visited.add(rel);

    const specs = extractRelativeSpecs(current);
    for (const spec of specs) {
      const target = resolveRelativeSpec(current, spec);
      if (!target) continue;
      const targetRel = toPosix(target);
      if (targetRel.startsWith('lib/generated/') || targetRel.startsWith('node_modules/')) continue;
      if (excludeShell && isExcludedShellPath(targetRel)) continue;
      if (!visited.has(targetRel)) {
        queue.push(target);
      }
    }
  }

  return [...visited].sort(cmpCodePoint);
}

function loadGitHistory() {
  const fileMap = new Map();
  let headCommit = '';
  let headDateIso = '';

  try {
    headCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    headDateIso = execFileSync('git', ['show', '-s', '--format=%cI', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const logOutput = execFileSync(
      'git',
      ['-c', 'core.quotepath=false', 'log', '--name-only', '--format=COMMIT %H %cI'],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );

    let currentCommit = '';
    let currentDateIso = '';
    let currentTimeMs = 0;

    for (const rawLine of logOutput.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('COMMIT ')) {
        const parts = line.split(' ');
        currentCommit = parts[1] ?? '';
        currentDateIso = parts[2] ?? '';
        currentTimeMs = Date.parse(currentDateIso) || 0;
        continue;
      }
      if (!currentCommit) continue;
      const posixPath = line.replaceAll('\\', '/');
      if (!fileMap.has(posixPath)) {
        fileMap.set(posixPath, {
          commit: currentCommit,
          dateIso: currentDateIso,
          timeMs: currentTimeMs,
        });
      }
    }
  } catch {
    // Graceful fallback when .git is unavailable (e.g. exported source archive)
  }

  return { fileMap, headCommit, headDateIso };
}

function hashFiles(sortedRelPaths) {
  const hash = createHash('sha256');
  for (const relPath of sortedRelPaths) {
    const absPath = join(root, relPath);
    const normalized = readCachedText(absPath).replaceAll('\r\n', '\n');
    hash.update(`${relPath}\0${normalized}\0`, 'utf8');
  }
  return hash.digest('hex');
}

function newestMtimeIso(relPaths) {
  let newestMs = 0;
  for (const relPath of relPaths) {
    try {
      const ms = statSync(join(root, relPath)).mtimeMs;
      if (ms > newestMs) newestMs = ms;
    } catch {
      // ignore
    }
  }
  return new Date(newestMs || Date.now()).toISOString();
}

const pdfToolsMeta = parsePdfToolsMeta();
const license = readPackageLicense();
const { fileMap, headCommit, headDateIso } = loadGitHistory();

const pages = collectPages(pagesDir).sort((a, b) => {
  if (a.route === '/') return -1;
  if (b.route === '/') return 1;
  return cmpCodePoint(a.route, b.route);
});

const routes = {};

for (const page of pages) {
  const { route, sourcePath, absPath } = page;
  const kind = route === '/' ? 'project' : route === '/licenses' ? 'page' : 'tool';
  const pdfEntry = pdfToolsMeta.get(route);
  const title = CANONICAL_TITLES[route] ?? pdfEntry?.title ?? humanizeRoute(route);
  const description = pdfEntry?.description;
  const url = route === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${route}`;
  const citeKey = makeCiteKey(route);

  const footprint = traceFootprint(absPath, kind === 'tool');
  const contentHashFull = hashFiles(footprint);
  const contentHash = contentHashFull.slice(0, 12);

  let newestGit = null;
  for (const relPath of footprint) {
    const info = fileMap.get(relPath);
    if (!info) continue;
    if (!newestGit || info.timeMs > newestGit.timeMs) {
      newestGit = info;
    }
  }

  const commit = newestGit?.commit || headCommit || '';
  const commitShort = commit ? commit.slice(0, 7) : 'unknown';
  const lastChangedIso = newestGit?.dateIso || headDateIso || newestMtimeIso(footprint);
  const lastChanged = lastChangedIso.slice(0, 10);

  const entry = {
    route,
    url,
    title,
    ...(description ? { description } : {}),
    kind,
    citeKey,
    sourcePath,
    commit,
    commitShort,
    lastChanged,
    lastChangedIso,
    contentHash,
    contentHashFull,
    fileCount: footprint.length,
  };

  routes[route] = entry;
}

const projectHash = createHash('sha256');
for (const route of Object.keys(routes).sort(cmpCodePoint)) {
  projectHash.update(`${route}:${routes[route].contentHashFull}\n`, 'utf8');
}
const projectContentHashFull = projectHash.digest('hex');
const projectContentHash = projectContentHashFull.slice(0, 12);

const projectLastChangedIso =
  headDateIso ||
  Object.values(routes)
    .map((r) => r.lastChangedIso)
    .sort()
    .at(-1) ||
  new Date().toISOString();

const manifest = {
  project: {
    name: SITE_NAME,
    title: SITE_TITLE,
    author: SITE_AUTHOR,
    origin: SITE_ORIGIN,
    repository: REPOSITORY_URL,
    license,
    commit: headCommit,
    commitShort: headCommit ? headCommit.slice(0, 7) : 'unknown',
    lastChanged: projectLastChangedIso.slice(0, 10),
    lastChangedIso: projectLastChangedIso,
    contentHash: projectContentHash,
    contentHashFull: projectContentHashFull,
    routeCount: pages.length,
  },
  routes,
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  `Generated lib/generated/page-meta.json with ${pages.length} routes (HEAD ${manifest.project.commitShort}, sha256:${manifest.project.contentHash}).`,
);
