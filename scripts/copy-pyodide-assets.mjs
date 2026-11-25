// Copies Pyodide core runtime files from node_modules/pyodide/ into public/pyodide/,
// downloads the curated package closure from Pyodide's release host with SHA-256
// verification against pyodide-lock.json, writes a trimmed pyodide-lock.json so runtime
// loadPackage() resolves locally with zero third-party requests, and syncs the
// yotasage_rt Python runtime modules from lib/python/rt/ into public/python/rt/.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', 'pyodide');
const destDir = join(root, 'public', 'pyodide');
const rtSrcDir = join(root, 'lib', 'python', 'rt');
const rtDestDir = join(root, 'public', 'python', 'rt');

const CORE_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip'];
const CURATED_PACKAGES = ['micropip', 'numpy', 'matplotlib', 'pillow', 'scipy', 'pandas', 'sympy'];
const CONCURRENCY = 4;

const sha256Buffer = (buf) => createHash('sha256').update(buf).digest('hex');
const sha256File = (filePath) => sha256Buffer(readFileSync(filePath));

function computeClosure(lockPackages, roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const key = queue.shift();
    if (seen.has(key)) continue;
    const entry = lockPackages[key];
    if (!entry) {
      throw new Error(`copy-pyodide-assets: "${key}" not found in pyodide-lock.json`);
    }
    seen.add(key);
    for (const dep of entry.depends ?? []) queue.push(dep);
  }
  return [...seen].sort();
}

async function downloadWithRetry(url, expectedSha256, destPath, retries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const actual = sha256Buffer(buf);
      if (actual !== expectedSha256) {
        throw new Error(`SHA-256 mismatch for ${url}: expected ${expectedSha256}, got ${actual}`);
      }
      const tmpPath = `${destPath}.tmp-${process.pid}`;
      writeFileSync(tmpPath, buf);
      renameSync(tmpPath, destPath);
      return buf.length;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  throw lastErr;
}

function syncRuntimeModules() {
  if (!existsSync(rtSrcDir)) return;
  mkdirSync(rtDestDir, { recursive: true });
  const pyFiles = readdirSync(rtSrcDir)
    .filter((name) => name.endsWith('.py') && statSync(join(rtSrcDir, name)).isFile())
    .sort();

  const expected = new Set(['manifest.json', ...pyFiles]);
  let copied = 0;
  for (const name of pyFiles) {
    const src = join(rtSrcDir, name);
    const dst = join(rtDestDir, name);
    if (existsSync(dst) && sha256File(dst) === sha256File(src)) continue;
    copyFileSync(src, dst);
    copied += 1;
  }

  const manifestText = `${JSON.stringify({ files: pyFiles }, null, 2)}\n`;
  const manifestPath = join(rtDestDir, 'manifest.json');
  if (!existsSync(manifestPath) || readFileSync(manifestPath, 'utf8') !== manifestText) {
    writeFileSync(manifestPath, manifestText, 'utf8');
  }

  for (const name of readdirSync(rtDestDir)) {
    if (!expected.has(name)) {
      rmSync(join(rtDestDir, name), { recursive: true, force: true });
    }
  }
  console.log(`yotasage_rt: synced ${copied}/${pyFiles.length} Python runtime modules into public/python/rt.`);
}

syncRuntimeModules();

if (!existsSync(pkgDir)) {
  console.warn('pyodide is not installed; skipping the copy of Pyodide assets.');
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const releaseBase = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
mkdirSync(destDir, { recursive: true });

const expectedFiles = new Set(['pyodide-lock.json']);
let coreBytes = 0;
let coreCopied = 0;
for (const file of CORE_FILES) {
  expectedFiles.add(file);
  const src = join(pkgDir, file);
  const dst = join(destDir, file);
  if (!existsSync(src)) {
    throw new Error(`copy-pyodide-assets: missing core file ${src}`);
  }
  const srcSize = statSync(src).size;
  coreBytes += srcSize;
  if (existsSync(dst) && statSync(dst).size === srcSize && sha256File(dst) === sha256File(src)) {
    continue;
  }
  copyFileSync(src, dst);
  coreCopied += 1;
}

const fullLock = JSON.parse(readFileSync(join(pkgDir, 'pyodide-lock.json'), 'utf8'));
const closureKeys = computeClosure(fullLock.packages, CURATED_PACKAGES);
const trimmedPackages = {};
const queue = closureKeys.map((key) => {
  const entry = fullLock.packages[key];
  trimmedPackages[key] = entry;
  expectedFiles.add(entry.file_name);
  return entry;
});

let pkgBytes = 0;
let pkgDownloaded = 0;
async function runWorker() {
  while (queue.length > 0) {
    const entry = queue.shift();
    const dst = join(destDir, entry.file_name);
    if (existsSync(dst) && sha256File(dst) === entry.sha256) {
      pkgBytes += statSync(dst).size;
      continue;
    }
    const downloadedBytes = await downloadWithRetry(
      `${releaseBase}${entry.file_name}`,
      entry.sha256,
      dst,
    );
    pkgBytes += downloadedBytes;
    pkgDownloaded += 1;
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => runWorker()));

const lockText = JSON.stringify({ info: fullLock.info, packages: trimmedPackages });
const lockDst = join(destDir, 'pyodide-lock.json');
if (!existsSync(lockDst) || readFileSync(lockDst, 'utf8') !== lockText) {
  writeFileSync(lockDst, lockText, 'utf8');
}

for (const name of readdirSync(destDir)) {
  if (!expectedFiles.has(name)) {
    rmSync(join(destDir, name), { recursive: true, force: true });
  }
}

const totalMB = ((coreBytes + pkgBytes + Buffer.byteLength(lockText, 'utf8')) / 1e6).toFixed(2);
console.log(
  `Pyodide ${version}: copied ${coreCopied}/${CORE_FILES.length} core, `
  + `downloaded ${pkgDownloaded}/${closureKeys.length} packages (${totalMB} MB total in public/pyodide).`,
);
