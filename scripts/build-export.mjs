// Runs a local Next.js static export (`output: 'export'`, `images: { unoptimized: true }`) matching GitHub Pages CI,
// verifies every route under pages/ emitted an HTML file in out/, and cleans up next.config.mjs and next-env.d.ts.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = join(root, 'pages');
const outDir = join(root, 'out');
const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

const CONFIG_CANDIDATES = ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs'];
const PAGE_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js', '.mdx']);

function collectPageRoutes(dir, routes = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    if (entry.isDirectory()) {
      if (entry.name === 'api') continue;
      collectPageRoutes(join(dir, entry.name), routes);
      continue;
    }

    const ext = extname(entry.name);
    if (!PAGE_EXTENSIONS.has(ext)) continue;

    const baseName = entry.name.slice(0, -ext.length);
    if (baseName.startsWith('_')) continue;

    const relPath = relative(pagesDir, join(dir, entry.name)).split(sep).join(posix.sep);
    const withoutExt = relPath.slice(0, -ext.length);

    if (withoutExt === 'index') {
      routes.push('/');
    } else if (withoutExt.endsWith('/index')) {
      routes.push(`/${withoutExt.slice(0, -'/index'.length)}`);
    } else {
      routes.push(`/${withoutExt}`);
    }
  }
  return routes;
}

function hasExportedHtml(route) {
  if (route === '/') {
    return existsSync(join(outDir, 'index.html'));
  }
  const rel = route.replace(/^\/+/, '');
  return (
    existsSync(join(outDir, `${rel}.html`)) ||
    existsSync(join(outDir, rel, 'index.html'))
  );
}

const existingConfigs = CONFIG_CANDIDATES.filter((name) => existsSync(join(root, name)));
if (existingConfigs.length > 0) {
  console.error(
    `build-export: refusing to run because ${existingConfigs.join(', ')} already exists. Remove or move it first so this script never overwrites user config.`,
  );
  process.exit(1);
}

if (!existsSync(nextBin)) {
  console.error(`build-export: Next.js CLI not found at ${nextBin}. Run npm install first.`);
  process.exit(1);
}

const metaGen = spawnSync(process.execPath, [join(root, 'scripts', 'generate-page-meta.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (metaGen.error || metaGen.status !== 0) {
  console.error(
    `build-export: failed to generate page metadata${metaGen.error ? `: ${metaGen.error.message}` : ''}.`,
  );
  process.exit(metaGen.status ?? 1);
}

const tempConfigPath = join(root, 'next.config.mjs');
let createdConfig = false;
let exitCode = 0;

try {
  writeFileSync(
    tempConfigPath,
    "export default { output: 'export', images: { unoptimized: true } };\n",
    'utf8',
  );
  createdConfig = true;

  const build = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: root,
    stdio: 'inherit',
  });

  if (build.error) {
    console.error(`build-export: failed to launch Next.js build: ${build.error.message}`);
    exitCode = 1;
  } else if (build.status !== 0) {
    exitCode = build.status ?? 1;
  } else {
    const routes = collectPageRoutes(pagesDir).sort((a, b) => {
      if (a === '/') return -1;
      if (b === '/') return 1;
      return a.localeCompare(b, 'en');
    });

    const missing = routes.filter((route) => !hasExportedHtml(route));
    if (!existsSync(join(outDir, 'index.html')) && !missing.includes('/')) {
      missing.unshift('/');
    }

    if (missing.length > 0) {
      console.error('build-export: static export did not emit HTML for the following routes:');
      for (const route of missing) {
        console.error(`  - ${route}`);
      }
      exitCode = 1;
    } else {
      console.log(`build-export: verified static export in out/ (${routes.length} HTML routes).`);
    }
  }
} finally {
  if (createdConfig) {
    try {
      rmSync(tempConfigPath, { force: true });
    } catch {
      // ignore cleanup error
    }
  }
  try {
    spawnSync('git', ['checkout', '--', 'next-env.d.ts'], {
      cwd: root,
      stdio: 'ignore',
    });
  } catch {
    // ignore if git is unavailable or next-env.d.ts is unmodified
  }
}

process.exit(exitCode);
