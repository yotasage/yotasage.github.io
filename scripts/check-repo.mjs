// Zero-dependency repository guardrail script.
// Checks static-export/self-hosted bans, exact-case relative imports, 40 KiB file-size budget,
// generated third-party licence freshness, route/tool-card/PDF-registry/PageHead/OG wiring, and EN/NB i18n parity.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, extname, join, posix, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const t0 = performance.now();

const SIZE_LIMIT = 40 * 1024; // 40 KiB = 40,960 bytes
const SIZE_EXCLUDED_FILES = new Set([
  'lib/pcb/font/newstroke-glyphs.ts',
  'lib/emsim/jlcpcbStackups.json',
]);

// Ratcheted byte caps (exact current size + 512 B headroom) for existing >= 40 KiB files.
// High-churn / doc files were split in H3; dormant code/style files stay frozen here until next touched.
const KNOWN_LARGE = new Map([
  ['styles/PdfTools.module.css', 80524 + 512],
  ['lib/pcb/export/kicad.ts', 79872 + 512],
  ['lib/smith/solve.ts', 79085 + 512],
  ['lib/pcb/pads/board.ts', 74115 + 512],
  ['lib/pcb/kicad/board.ts', 63391 + 512],
  ['lib/emsim/viamodel.ts', 57693 + 512],
  ['components/Smith/Theory.tsx', 56972 + 512],
  ['pages/smith-chart/main.tsx', 55621 + 512],
  ['components/Smith/pathLayer.ts', 54682 + 512],
  ['components/PdfTools/PdfReader.tsx', 54031 + 512],
  ['lib/smith/equations.ts', 52686 + 512],
  ['components/PdfTools/PdfCompareView.tsx', 52505 + 512],
  ['pages/pdf/edit.tsx', 51394 + 512],
  ['components/PdfTools/PdfEditor.tsx', 50772 + 512],
  ['components/Smith/SolvePanel.tsx', 46327 + 512],
  ['lib/smith/grid.ts', 45843 + 512],
  ['components/PdfTools/FormFiller.tsx', 45386 + 512],
  ['styles/Resistor.module.css', 45080 + 512],
  ['lib/smith/state.ts', 44914 + 512],
  ['lib/pcb/altium/board.ts', 44678 + 512],
  ['pages/qrcode/main.tsx', 44574 + 512],
  ['styles/Smith.module.css', 43933 + 512],
  ['lib/pdf/pdfToSvg.ts', 43594 + 512],
  ['pages/pdf/extract-images.tsx', 41995 + 512],
]);

const FORBIDDEN_CDN_RE =
  /(?:https?:)?\/\/(?:[\w-]+\.)?(?:unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|esm\.sh)(?:[/"'`\s)]|$)/i;

const JS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const IMPORT_SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.css']);
const PAGE_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js', '.mdx']);
const ALWAYS_LICENSED = ['next', 'react', 'react-dom'];

function toPosix(absPath) {
  return relative(root, absPath).split(sep).join(posix.sep);
}

function walkFiles(relDir, filterFn = null, skipGenerated = false) {
  const start = join(root, relDir);
  if (!existsSync(start)) return [];
  const out = [];
  const stack = [start];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipGenerated && entry.name === 'generated' && toPosix(full) === 'lib/generated') continue;
        stack.push(full);
      } else if (entry.isFile()) {
        if (!filterFn || filterFn(full, entry.name)) out.push(full);
      }
    }
  }
  out.sort((a, b) => toPosix(a).localeCompare(toPosix(b), 'en'));
  return out;
}

// Removes block comments (/* ... */) and full-line // comments without touching URLs inside quotes.
function stripCommentsSimple(source, isCss = false) {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "'" || ch === '"' || (!isCss && ch === '`')) {
      const quote = ch;
      out += ch;
      i++;
      while (i < n) {
        const c = source[i];
        out += c;
        i++;
        if (c === '\\' && i < n) {
          out += source[i];
          i++;
        } else if (c === quote) {
          break;
        } else if (c === '\n' && quote !== '`') {
          break;
        }
      }
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    if (!isCss && ch === '/' && next === '/') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// Exact-case path lookup via cached fs.readdirSync directory listings (works identically on Windows and Linux).
const dirEntriesCache = new Map();
function getDirEntries(absDir) {
  let set = dirEntriesCache.get(absDir);
  if (!set) {
    if (!existsSync(absDir)) {
      set = new Set();
    } else {
      try {
        set = new Set(readdirSync(absDir));
      } catch {
        set = new Set();
      }
    }
    dirEntriesCache.set(absDir, set);
  }
  return set;
}

function existsExactCase(absPath, expectFile = true) {
  const rel = relative(root, absPath);
  if (!rel || rel.startsWith('..') || rel.includes(':')) return false;
  const segments = rel.split(sep).filter(Boolean);
  let cur = root;
  for (const seg of segments) {
    const entries = getDirEntries(cur);
    if (!entries.has(seg)) return false;
    cur = join(cur, seg);
  }
  try {
    const st = statSync(cur);
    return expectFile ? st.isFile() : st.isDirectory();
  } catch {
    return false;
  }
}

function findCaseInsensitiveMatch(absPath) {
  const rel = relative(root, absPath);
  if (!rel || rel.startsWith('..')) return null;
  const segments = rel.split(sep).filter(Boolean);
  let cur = root;
  const actual = [];
  for (const seg of segments) {
    const entries = getDirEntries(cur);
    if (entries.has(seg)) {
      actual.push(seg);
      cur = join(cur, seg);
      continue;
    }
    const lower = seg.toLowerCase();
    let matched = null;
    for (const entry of entries) {
      if (entry.toLowerCase() === lower) {
        matched = entry;
        break;
      }
    }
    if (!matched) return null;
    actual.push(matched);
    cur = join(cur, matched);
  }
  try {
    if (statSync(cur).isFile()) return actual.join('/');
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 1. Static-export & self-hosted bans
// ---------------------------------------------------------------------------
function checkStaticAndSelfHosted() {
  const errors = [];

  if (existsSync(join(root, 'pages', 'api'))) {
    errors.push('pages/api/ directory is forbidden (static export has no server)');
  }

  const pageFiles = walkFiles('pages', (_, name) => JS_EXTENSIONS.has(extname(name)));
  const gsspRe =
    /(?:^|[\s;{}])(?:export\s+)?(?:async\s+)?(?:function|const|let|var)\s+getServerSideProps\b|\bexport\s*\{[^}]*\bgetServerSideProps\b/;
  for (const file of pageFiles) {
    const clean = stripCommentsSimple(readFileSync(file, 'utf8'));
    if (gsspRe.test(clean)) {
      errors.push(`${toPosix(file)}: getServerSideProps is forbidden in static export`);
    }
  }

  const codeFiles = ['pages', 'components', 'lib'].flatMap((dir) =>
    walkFiles(dir, (_, name) => JS_EXTENSIONS.has(extname(name)), true),
  );
  const nextImageRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]next\/image['"]/;
  for (const file of codeFiles) {
    const clean = stripCommentsSimple(readFileSync(file, 'utf8'));
    if (nextImageRe.test(clean) && !/\bunoptimized\b/.test(clean)) {
      errors.push(`${toPosix(file)}: imports next/image without unoptimized`);
    }
  }

  const runtimeFiles = ['pages', 'components', 'lib', 'styles'].flatMap((dir) =>
    walkFiles(dir, (_, name) => JS_EXTENSIONS.has(extname(name)) || extname(name) === '.css', true),
  );
  for (const file of runtimeFiles) {
    const isCss = extname(file) === '.css';
    const clean = stripCommentsSimple(readFileSync(file, 'utf8'), isCss);
    const lines = clean.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(FORBIDDEN_CDN_RE);
      if (m) {
        errors.push(`${toPosix(file)}:${i + 1}: forbidden external CDN URL (${m[0].trim()})`);
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 2. Case-sensitive relative imports
// ---------------------------------------------------------------------------
function resolveRelativeImport(fromFile, rawSpec, isCss) {
  const spec = rawSpec.replace(/[?#].*$/, '');
  const base = resolve(dirname(fromFile), spec);
  const ext = extname(spec);

  const candidates = [];
  if (ext) {
    candidates.push(base);
    if (!isCss) {
      if (ext === '.js') {
        const stem = base.slice(0, -3);
        candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.d.ts`, `${stem}.mjs`);
      } else if (ext === '.jsx') {
        candidates.push(`${base.slice(0, -4)}.tsx`);
      } else if (ext === '.mjs') {
        candidates.push(`${base.slice(0, -4)}.mts`);
      }
    }
  } else {
    const exts = isCss ? ['.css'] : ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.d.ts'];
    for (const e of exts) candidates.push(base + e);
    if (!isCss) {
      for (const idx of ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs']) {
        candidates.push(join(base, idx));
      }
    }
  }

  for (const cand of candidates) {
    if (existsExactCase(cand, true)) return { ok: true };
  }

  for (const cand of candidates) {
    const ci = findCaseInsensitiveMatch(cand);
    if (ci) return { ok: false, reason: `case mismatch (on disk: ${ci})` };
  }

  return { ok: false, reason: 'target file not found' };
}

function checkRelativeImports() {
  const errors = [];
  const files = ['pages', 'components', 'lib', 'styles'].flatMap((dir) =>
    walkFiles(dir, (_, name) => IMPORT_SCAN_EXTENSIONS.has(extname(name)), true),
  );

  const jsPatterns = [
    /\bfrom\s+['"](\.\.?\/[^'"]+)['"]/g,
    /(?:^|[;\n\r])\s*import\s+['"](\.\.?\/[^'"]+)['"]/g,
    /\bimport\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g,
  ];
  const cssPattern = /@import\s+(?:url\(\s*)?['"](\.\.?\/[^'"]+)['"]/g;

  for (const file of files) {
    const isCss = extname(file) === '.css';
    const clean = stripCommentsSimple(readFileSync(file, 'utf8'), isCss);
    const patterns = isCss ? [cssPattern] : jsPatterns;
    const seen = new Set();

    for (const re of patterns) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(clean)) !== null) {
        const spec = match[1];
        if (seen.has(spec)) continue;
        seen.add(spec);
        const res = resolveRelativeImport(file, spec, isCss);
        if (!res.ok) {
          errors.push(`${toPosix(file)}: relative import '${spec}' failed — ${res.reason}`);
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 3. File-size budget (40 KiB = 40,960 bytes)
// ---------------------------------------------------------------------------
function checkFileSizes() {
  const errors = [];
  const dirs = ['docs', 'pages', 'components', 'lib', 'styles'];
  const files = dirs.flatMap((dir) => walkFiles(dir, null, true));

  for (const file of files) {
    const rel = toPosix(file);
    if (rel.startsWith('lib/generated/') || SIZE_EXCLUDED_FILES.has(rel)) continue;
    const size = statSync(file).size;
    const cap = KNOWN_LARGE.get(rel);

    if (cap !== undefined) {
      if (size > cap) {
        errors.push(`${rel}: ${size} B exceeds ratcheted KNOWN_LARGE cap of ${cap} B`);
      }
    } else if (size >= SIZE_LIMIT) {
      errors.push(`${rel}: ${size} B meets or exceeds 40 KiB (${SIZE_LIMIT} B) budget`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 4. Generated-licence freshness
// ---------------------------------------------------------------------------
function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function checkLicenses() {
  const errors = [];
  const licPath = join(root, 'lib', 'generated', 'third-party-licenses.json');
  if (!existsSync(licPath)) {
    return ['lib/generated/third-party-licenses.json is missing (run npm install or node scripts/collect-licenses.mjs)'];
  }

  let data;
  try {
    data = JSON.parse(readFileSync(licPath, 'utf8'));
  } catch (err) {
    return [`lib/generated/third-party-licenses.json is invalid JSON: ${err.message}`];
  }

  if (!Array.isArray(data.packages)) {
    return ['lib/generated/third-party-licenses.json is missing a packages[] array'];
  }

  const covered = new Set(data.packages.map((p) => p?.name).filter(Boolean));
  const imported = new Set(ALWAYS_LICENSED);
  const pattern =
    /(?:from\s*|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)['"]([^'"./\s<>{}()[\]][^'"\s<>{}()[\]]*)['"]/gm;

  const sourceFiles = ['pages', 'components', 'lib'].flatMap((dir) =>
    walkFiles(dir, (_, name) => /\.(m?[jt]sx?)$/.test(name), true),
  );

  for (const file of sourceFiles) {
    const text = readFileSync(file, 'utf8');
    for (const [, spec] of text.matchAll(pattern)) {
      const pkg = packageName(spec);
      if (pkg.startsWith('node:') || builtinModules.includes(pkg) || pkg.startsWith('@types/')) continue;
      imported.add(pkg);
    }
  }

  for (const pkg of [...imported].sort()) {
    if (!covered.has(pkg)) {
      errors.push(
        `package '${pkg}' is imported in source but missing from lib/generated/third-party-licenses.json (run node scripts/collect-licenses.mjs)`,
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 5. Route, tool-card, PDF registry & PageHead / OG consistency
// ---------------------------------------------------------------------------
function checkRoutesAndMeta() {
  const errors = [];
  const pagesDir = join(root, 'pages');

  // 5a. Every pages/<tool>/main.tsx is linked from pages/index.tsx
  const indexText = readFileSync(join(pagesDir, 'index.tsx'), 'utf8');
  for (const entry of readdirSync(pagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name === 'api') continue;
    const toolDir = join(pagesDir, entry.name);
    const hasMain = [...PAGE_EXTENSIONS].some((ext) => existsExactCase(join(toolDir, `main${ext}`), true));
    if (!hasMain) continue;
    const expectedHref = `/${entry.name}/main`;
    if (!indexText.includes(`'${expectedHref}'`) && !indexText.includes(`"${expectedHref}"`)) {
      errors.push(`pages/${entry.name}/main.tsx is not linked ('${expectedHref}') from pages/index.tsx`);
    }
  }

  // 5b. Every pages/pdf/<slug>.tsx (except main.tsx) is registered in lib/pdf/tools.ts
  const pdfDir = join(pagesDir, 'pdf');
  const pdfToolsText = readFileSync(join(root, 'lib', 'pdf', 'tools.ts'), 'utf8');
  if (existsSync(pdfDir)) {
    for (const entry of readdirSync(pdfDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = extname(entry.name);
      if (!PAGE_EXTENSIONS.has(ext)) continue;
      const slug = entry.name.slice(0, -ext.length);
      if (slug === 'main' || slug.startsWith('_')) continue;
      const expectedHref = `/pdf/${slug}`;
      const hrefRe = new RegExp(`href\\s*:\\s*['"]${expectedHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
      if (!hrefRe.test(pdfToolsText)) {
        errors.push(`pages/pdf/${entry.name} is not registered (${expectedHref}) in lib/pdf/tools.ts`);
      }
    }
  }

  // 5c. Every non-_app/_document page renders PageHead (directly or via PdfPage wrapper),
  // and every ogImage referenced exists under public/.
  const wrapperPath = join(root, 'components', 'PdfTools', 'ToolPage.tsx');
  const wrapperText = existsSync(wrapperPath) ? readFileSync(wrapperPath, 'utf8') : '';
  const wrapperHasPageHead = /<PageHead\b/.test(wrapperText);
  if (!wrapperHasPageHead) {
    errors.push('components/PdfTools/ToolPage.tsx does not render <PageHead>');
  }

  const allPageFiles = walkFiles('pages', (_, name) => PAGE_EXTENSIONS.has(extname(name)));
  const ogRefs = [];
  const ogRe = /\bogImage\s*=\s*['"]([^'"]+)['"]/g;

  for (const file of allPageFiles) {
    const rel = toPosix(file);
    const base = rel.split('/').pop();
    const stem = base.slice(0, -extname(base).length);
    if (stem.startsWith('_')) continue;

    const text = readFileSync(file, 'utf8');
    const rendersPageHead = /<PageHead\b/.test(text);
    const rendersPdfPage = wrapperHasPageHead && /<PdfPage\b/.test(text);
    if (!rendersPageHead && !rendersPdfPage) {
      errors.push(`${rel}: page does not render <PageHead> (or <PdfPage>)`);
    }

    for (const m of text.matchAll(ogRe)) {
      ogRefs.push([rel, m[1]]);
    }
  }

  for (const metaFile of ['components/PageHead.tsx', 'components/PdfTools/ToolPage.tsx']) {
    const abs = join(root, metaFile);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf8');
    for (const m of text.matchAll(ogRe)) {
      ogRefs.push([metaFile, m[1]]);
    }
  }

  const checkedOg = new Set();
  for (const [sourceFile, ogPath] of ogRefs) {
    const normalized = ogPath.replace(/^\/+/, '');
    const key = `${sourceFile}::${normalized}`;
    if (checkedOg.has(key)) continue;
    checkedOg.add(key);
    const full = join(root, 'public', normalized);
    if (!existsExactCase(full, true)) {
      errors.push(`${sourceFile}: ogImage '${ogPath}' does not exist at public/${normalized}`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// 6. EN/NB translation parity
// ---------------------------------------------------------------------------
function extractExportedObjectKeys(source, exportName) {
  const declRe = new RegExp(`export\\s+const\\s+${exportName}\\b[^=]*=\\s*\\{`, 'm');
  const match = declRe.exec(source);
  if (!match) return null;

  let i = match.index + match[0].length;
  const n = source.length;
  let depth = 1;
  let expectKey = true;
  const keys = [];
  const duplicates = [];
  const seen = new Set();

  function skipWsAndComments() {
    while (i < n) {
      const ch = source[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === '/' && source[i + 1] === '/') {
        while (i < n && source[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && source[i + 1] === '*') {
        i += 2;
        while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      break;
    }
  }

  function readString(quote) {
    i++; // opening quote
    let val = '';
    while (i < n) {
      const c = source[i];
      if (c === '\\' && i + 1 < n) {
        const next = source[i + 1];
        if (next === 'n') val += '\n';
        else if (next === 't') val += '\t';
        else if (next === 'r') val += '\r';
        else val += next;
        i += 2;
        continue;
      }
      if (c === quote) {
        i++;
        return val;
      }
      val += c;
      i++;
    }
    return val;
  }

  while (i < n && depth > 0) {
    skipWsAndComments();
    if (i >= n) break;
    const ch = source[i];

    if (depth === 1 && expectKey) {
      if (ch === '}') {
        depth = 0;
        break;
      }
      if (ch === ',') {
        i++;
        continue;
      }
      // Spread element (e.g. ...commonEn): advance to next top-level comma or closing brace.
      if (ch === '.' && source.slice(i, i + 3) === '...') {
        i += 3;
        expectKey = false;
        continue;
      }

      let key = null;
      if (ch === "'" || ch === '"') {
        key = readString(ch);
      } else if (/[A-Za-z_$]/.test(ch)) {
        const start = i;
        while (i < n && /[\w$]/.test(source[i])) i++;
        key = source.slice(start, i);
      } else {
        i++;
        continue;
      }

      skipWsAndComments();
      if (source[i] === ':') {
        i++;
        if (seen.has(key)) duplicates.push(key);
        else {
          seen.add(key);
          keys.push(key);
        }
        expectKey = false;
      } else if (source[i] === ',' || source[i] === '}') {
        // Shorthand property
        if (seen.has(key)) duplicates.push(key);
        else {
          seen.add(key);
          keys.push(key);
        }
        if (source[i] === ',') i++;
      }
      continue;
    }

    // Scanning value tokens until top-level ',' or '}'
    if (ch === "'" || ch === '"' || ch === '`') {
      readString(ch);
    } else if (ch === '{' || ch === '[' || ch === '(') {
      depth++;
      i++;
    } else if (ch === '}' || ch === ']' || ch === ')') {
      depth--;
      i++;
      if (depth === 0) break;
    } else if (ch === ',' && depth === 1) {
      i++;
      expectKey = true;
    } else {
      i++;
    }
  }

  return { keys, seen, duplicates };
}

function compareLocalePair(label, enObj, nbObj, errors) {
  if (!enObj) {
    errors.push(`${label}: could not find exported 'en' object`);
    return;
  }
  if (!nbObj) {
    errors.push(`${label}: could not find exported 'nb' object`);
    return;
  }
  for (const dup of enObj.duplicates) errors.push(`${label}: duplicate key '${dup}' in en`);
  for (const dup of nbObj.duplicates) errors.push(`${label}: duplicate key '${dup}' in nb`);

  for (const key of enObj.keys) {
    if (!nbObj.seen.has(key)) errors.push(`${label}: key '${key}' exists in en but is missing from nb`);
  }
  for (const key of nbObj.keys) {
    if (!enObj.seen.has(key)) errors.push(`${label}: key '${key}' exists in nb but is missing from en`);
  }
}

function checkTranslations() {
  const errors = [];
  const barrelPath = join(root, 'lib', 'ui', 'translations.ts');
  if (!existsSync(barrelPath)) {
    return ['lib/ui/translations.ts is missing'];
  }
  const barrelText = readFileSync(barrelPath, 'utf8');

  const splitDir = join(root, 'lib', 'ui', 'i18n');
  if (existsSync(splitDir)) {
    const splitFiles = walkFiles('lib/ui/i18n', (_, name) => extname(name) === '.ts');
    if (splitFiles.length > 0) {
      const globalKeys = new Map();
      for (const file of splitFiles) {
        const rel = toPosix(file);
        const text = readFileSync(file, 'utf8');
        const enObj = extractExportedObjectKeys(text, 'en');
        const nbObj = extractExportedObjectKeys(text, 'nb');
        compareLocalePair(rel, enObj, nbObj, errors);
        if (enObj && enObj.keys.length === 0) {
          errors.push(`${rel}: parsed 0 keys from en`);
        }
        if (enObj) {
          for (const key of enObj.keys) {
            const prev = globalKeys.get(key);
            if (prev) {
              errors.push(`${rel}: duplicate translation key '${key}' (already defined in ${prev})`);
            } else {
              globalKeys.set(key, rel);
            }
          }
        }
        const stem = rel.replace(/^lib\/ui\/i18n\//, '').replace(/\.ts$/, '');
        if (!barrelText.includes(`'./i18n/${stem}'`) && !barrelText.includes(`"./i18n/${stem}"`)) {
          errors.push(`lib/ui/translations.ts: missing import for './i18n/${stem}'`);
        }
      }
      if (globalKeys.size === 0) {
        errors.push('lib/ui/i18n/: parsed 0 translation keys across all modules');
      }
      return errors;
    }
  }

  const enObj = extractExportedObjectKeys(barrelText, 'en');
  const nbObj = extractExportedObjectKeys(barrelText, 'nb');
  compareLocalePair('lib/ui/translations.ts', enObj, nbObj, errors);
  if (enObj && enObj.keys.length === 0) {
    errors.push('lib/ui/translations.ts: parsed 0 keys from en');
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
const checks = [
  ['Static-export & self-hosted bans', checkStaticAndSelfHosted],
  ['Case-sensitive relative imports', checkRelativeImports],
  ['File-size budget (40 KiB)', checkFileSizes],
  ['Generated-licence freshness', checkLicenses],
  ['Routes, tool cards, PDF registry & PageHead/OG', checkRoutesAndMeta],
  ['EN/NB translation parity', checkTranslations],
];

let totalErrors = 0;
for (const [name, fn] of checks) {
  const errs = fn();
  if (errs.length === 0) {
    console.log(`PASS  ${name}`);
  } else {
    totalErrors += errs.length;
    console.error(`FAIL  ${name} (${errs.length})`);
    for (const msg of errs) {
      console.error(`      - ${msg}`);
    }
  }
}

const elapsedMs = Math.round(performance.now() - t0);
if (totalErrors > 0) {
  console.error(`\ncheck:repo failed with ${totalErrors} issue(s) in ${elapsedMs} ms.`);
  process.exit(1);
}
console.log(`\ncheck:repo passed (${checks.length} checks) in ${elapsedMs} ms.`);
