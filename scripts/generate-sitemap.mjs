// Scans pages/ and writes public/sitemap.xml for static GitHub Pages deployment.
// Runs on `npm install` / `npm ci` via postinstall (and can be run standalone).
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ORIGIN = 'https://yotasage.github.io';
const PAGE_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js', '.mdx']);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pagesDir = join(root, 'pages');
const outFile = join(root, 'public', 'sitemap.xml');

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function collectRoutes(dir, routes = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue;
    if (entry.isDirectory()) {
      if (entry.name === 'api') continue;
      collectRoutes(join(dir, entry.name), routes);
      continue;
    }

    const ext = extname(entry.name);
    if (!PAGE_EXTENSIONS.has(ext)) continue;

    const baseName = entry.name.slice(0, -ext.length);
    if (baseName.startsWith('_') || baseName === '404' || baseName === '500') continue;

    const relPath = relative(pagesDir, join(dir, entry.name)).split(sep).join(posix.sep);
    const withoutExt = relPath.slice(0, -ext.length);

    let route;
    if (withoutExt === 'index') {
      route = '/';
    } else if (withoutExt.endsWith('/index')) {
      route = `/${withoutExt.slice(0, -'/index'.length)}`;
    } else {
      route = `/${withoutExt}`;
    }

    routes.push(route);
  }
  return routes;
}

const routes = collectRoutes(pagesDir).sort((a, b) => {
  if (a === '/') return -1;
  if (b === '/') return 1;
  return a.localeCompare(b, 'en');
});

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.map((route) => {
    const loc = route === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${route}`;
    return `  <url><loc>${escapeXml(loc)}</loc></url>`;
  }),
  '</urlset>',
  '',
];

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log(`Generated public/sitemap.xml with ${routes.length} routes.`);
