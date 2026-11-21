// Self-hosted runtime helper for Tesseract.js OCR.
//
// Zero external CDN requests: worker, WASM cores, and tessdata_fast language models are all loaded from
// local `/ocr/` paths (copied from node_modules by scripts/copy-pdf-wasm-assets.mjs). User-supplied custom
// `.traineddata` / `.traineddata.gz` buffers are supported locally via per-session readOnly cache entries
// that are deleted immediately after worker initialization.

import type { Worker as TesseractWorker } from 'tesseract.js';

export interface OcrLanguageMeta {
  code: string;
  label: string;
  /** Approximate compressed size of the bundled `.traineddata.gz` file in bytes. */
  approxBytes: number;
}

/** Self-hosted tessdata_fast (4.0.0_best_int) languages bundled in `public/ocr/tessdata/`. */
export const OCR_LANGUAGES: readonly OcrLanguageMeta[] = [
  { code: 'eng', label: 'English', approxBytes: 2_953_000 },
  { code: 'nor', label: 'Norwegian', approxBytes: 2_490_000 },
  { code: 'swe', label: 'Swedish', approxBytes: 2_503_000 },
  { code: 'dan', label: 'Danish', approxBytes: 1_845_000 },
  { code: 'deu', label: 'German', approxBytes: 1_333_000 },
  { code: 'fra', label: 'French', approxBytes: 707_000 },
  { code: 'spa', label: 'Spanish', approxBytes: 2_100_000 },
] as const;

const BUNDLED_CODES = new Set<string>(OCR_LANGUAGES.map((l) => l.code));

export const OCR_ASSET_PATHS = {
  workerPath: '/ocr/worker.min.js',
  corePath: '/ocr/core',
  langPath: '/ocr/tessdata',
} as const;

export interface OcrProgressInfo {
  status: string;
  progress: number;
}

export interface OcrWorkerOptions {
  onProgress?: (info: OcrProgressInfo) => void;
  /**
   * Optional user-provided `.traineddata` or `.traineddata.gz` files, keyed by language code
   * (e.g. `new Map([['jpn', bytes]])`). Never uploaded anywhere; read directly by the local worker.
   */
  customLangFiles?: Map<string, Uint8Array>;
}

const IDB_DB_NAME = 'keyval-store';
const IDB_STORE_NAME = 'keyval';

function idbPut(key: string, value: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(IDB_DB_NAME);
    openReq.onupgradeneeded = () => {
      if (!openReq.result.objectStoreNames.contains(IDB_STORE_NAME)) {
        openReq.result.createObjectStore(IDB_STORE_NAME);
      }
    };
    openReq.onerror = () => reject(openReq.error ?? new Error('Failed to open IndexedDB for custom OCR language.'));
    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Failed to write custom OCR language to IndexedDB.'));
      };
    };
  });
}

function idbDelete(key: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const openReq = indexedDB.open(IDB_DB_NAME);
      openReq.onerror = () => resolve();
      openReq.onsuccess = () => {
        const db = openReq.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
        tx.objectStore(IDB_STORE_NAME).delete(key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      };
    } catch {
      resolve();
    }
  });
}

function normalizeLangs(langs: string | string[]): string[] {
  const parts = Array.isArray(langs) ? langs.flatMap((s) => s.split('+')) : langs.split('+');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const code = raw.trim().toLowerCase();
    if (code && !seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out.length > 0 ? out : ['eng'];
}

function randomSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function resolveNodeTessdataDir(): Promise<string> {
  const fsModName = 'node:' + 'fs';
  const pathModName = 'node:' + 'path';
  const fs = await import(/* webpackIgnore: true */ fsModName);
  const path = await import(/* webpackIgnore: true */ pathModName);

  const starts = [typeof __dirname === 'string' ? __dirname : '', process.cwd()].filter(Boolean);
  const visited = new Set<string>();
  for (const start of starts) {
    let dir = path.resolve(start);
    for (let depth = 0; depth < 6; depth++) {
      if (!visited.has(dir)) {
        visited.add(dir);
        const candidate = path.join(dir, 'public', 'ocr', 'tessdata');
        if (fs.existsSync(candidate)) return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error('Could not locate self-hosted tessdata directory in public/ocr/tessdata/.');
}

/**
 * Creates a self-hosted Tesseract.js worker configured exclusively with local assets (zero CDN URLs).
 * Always call `await worker.terminate()` when finished.
 */
export async function createSelfHostedOcrWorker(
  langs: string | string[],
  options?: OcrWorkerOptions,
): Promise<TesseractWorker> {
  const requested = normalizeLangs(langs);
  const customFiles = options?.customLangFiles;

  // Guard against accidental 404s or unknown language codes before spawning a worker.
  for (const code of requested) {
    if (!BUNDLED_CODES.has(code) && !customFiles?.has(code)) {
      throw new Error(
        `OCR language "${code}" is not bundled locally. Choose one of [${OCR_LANGUAGES.map((l) => l.code).join(', ')}] or provide a custom .traineddata file.`,
      );
    }
  }

  const tesseract = await import('tesseract.js');
  const createWorker = tesseract.createWorker;
  const oemLstmOnly = tesseract.OEM?.LSTM_ONLY ?? 1;

  const isBrowser = typeof window !== 'undefined';
  const logger = options?.onProgress
    ? (m: { status?: string; progress?: number }) => {
        if (typeof m.status === 'string' && typeof m.progress === 'number') {
          options.onProgress?.({ status: m.status, progress: m.progress });
        }
      }
    : () => {};

  const hasCustom = Boolean(customFiles && customFiles.size > 0);
  const sessionKey = `ocr-custom-${randomSessionId()}`;
  const writtenIdbKeys: string[] = [];
  let nodeTmpDir: string | null = null;

  try {
    let workerOpts: Record<string, unknown>;

    if (isBrowser) {
      if (hasCustom && customFiles) {
        for (const [code, bytes] of customFiles.entries()) {
          const normalizedCode = code.trim().toLowerCase();
          const key = `${sessionKey}/${normalizedCode}.traineddata`;
          await idbPut(key, bytes);
          writtenIdbKeys.push(key);
        }
      }

      workerOpts = {
        workerPath: OCR_ASSET_PATHS.workerPath,
        corePath: OCR_ASSET_PATHS.corePath,
        langPath: OCR_ASSET_PATHS.langPath,
        workerBlobURL: false,
        gzip: true,
        legacyCore: false,
        legacyLang: false,
        cacheMethod: hasCustom ? 'readOnly' : 'none',
        ...(hasCustom ? { cachePath: sessionKey } : {}),
        logger,
      };
    } else {
      const langDir = await resolveNodeTessdataDir();
      if (hasCustom && customFiles) {
        const fsModName = 'node:' + 'fs';
        const osModName = 'node:' + 'os';
        const pathModName = 'node:' + 'path';
        const fs = await import(/* webpackIgnore: true */ fsModName);
        const os = await import(/* webpackIgnore: true */ osModName);
        const path = await import(/* webpackIgnore: true */ pathModName);
        nodeTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-ocr-lang-'));
        for (const [code, bytes] of customFiles.entries()) {
          const normalizedCode = code.trim().toLowerCase();
          fs.writeFileSync(path.join(nodeTmpDir, `${normalizedCode}.traineddata`), bytes);
        }
      }

      workerOpts = {
        langPath: langDir,
        gzip: true,
        legacyCore: false,
        legacyLang: false,
        cacheMethod: hasCustom ? 'readOnly' : 'none',
        ...(nodeTmpDir ? { cachePath: nodeTmpDir } : {}),
        logger,
      };
    }

    return await createWorker(requested, oemLstmOnly, workerOpts);
  } finally {
    if (writtenIdbKeys.length > 0) {
      await Promise.all(writtenIdbKeys.map((k) => idbDelete(k)));
    }
    if (nodeTmpDir) {
      try {
        const fsModName = 'node:' + 'fs';
        const fs = await import(/* webpackIgnore: true */ fsModName);
        fs.rmSync(nodeTmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
