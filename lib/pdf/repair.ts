// PDF diagnosis and 3-tier recovery engine:
//   Tier 1 (qpdf):   Lossless structural rebuild via self-hosted QPDF WebAssembly.
//   Tier 2 (pdflib): Tolerant JS parser copying recoverable pages one-by-one into a fresh document.
//   Tier 3 (raster): Browser-only visual rescue rendering readable pages with pdf.js into a new PDF.

import { PDFDocument } from '@cantoo/pdf-lib';

import type { canvasToBytes as CanvasToBytesFn } from './files';
import type { openPdf as OpenPdfFn, renderPage as RenderPageFn } from './pdfjs';
import { checkQpdf, runQpdf } from './qpdf';

export type RepairStrategy = 'auto' | 'qpdf' | 'pdflib' | 'raster';
export type RepairStrategyUsed = 'qpdf' | 'pdflib' | 'raster';

export interface PdfDiagnosis {
  hasHeader: boolean;
  headerOffset: number;
  hasEof: boolean;
  trailingGarbageBytes: number;
  qpdfOk: boolean;
  isEncrypted: boolean;
  warnings: string[];
  errors: string[];
  issues: string[];
  needsRepair: boolean;
}

export interface RepairOptions {
  password?: string;
  strategy?: RepairStrategy;
  rasterDpi?: number;
  rasterQuality?: number;
  onProgress?: (fraction: number, label: string) => void;
}

export interface RepairResult {
  bytes: Uint8Array;
  strategyUsed: RepairStrategyUsed;
  issuesFound: string[];
  warnings: string[];
  pagesRecovered: number;
  verifiedOk: boolean;
}

const PDF_HEADER_SIG = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PDF_EOF_SIG = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF
const MAX_HEADER_SCAN = 65536;
const MAX_EOF_SCAN = 65536;

function findHeaderOffset(bytes: Uint8Array): number {
  const limit = Math.min(bytes.length - PDF_HEADER_SIG.length, MAX_HEADER_SCAN);
  for (let i = 0; i <= limit; i++) {
    if (
      bytes[i] === PDF_HEADER_SIG[0] &&
      bytes[i + 1] === PDF_HEADER_SIG[1] &&
      bytes[i + 2] === PDF_HEADER_SIG[2] &&
      bytes[i + 3] === PDF_HEADER_SIG[3] &&
      bytes[i + 4] === PDF_HEADER_SIG[4]
    ) {
      return i;
    }
  }
  return -1;
}

function findLastEof(bytes: Uint8Array): { hasEof: boolean; trailingGarbageBytes: number } {
  if (bytes.length < PDF_EOF_SIG.length) {
    return { hasEof: false, trailingGarbageBytes: 0 };
  }
  const minStart = Math.max(0, bytes.length - MAX_EOF_SCAN);
  for (let i = bytes.length - PDF_EOF_SIG.length; i >= minStart; i--) {
    if (
      bytes[i] === PDF_EOF_SIG[0] &&
      bytes[i + 1] === PDF_EOF_SIG[1] &&
      bytes[i + 2] === PDF_EOF_SIG[2] &&
      bytes[i + 3] === PDF_EOF_SIG[3] &&
      bytes[i + 4] === PDF_EOF_SIG[4]
    ) {
      let pos = i + PDF_EOF_SIG.length;
      while (
        pos < bytes.length &&
        (bytes[pos] === 0x0a || bytes[pos] === 0x0d || bytes[pos] === 0x20 || bytes[pos] === 0x09)
      ) {
        pos++;
      }
      return { hasEof: true, trailingGarbageBytes: bytes.length - pos };
    }
  }
  return { hasEof: false, trailingGarbageBytes: 0 };
}

function detectEncrypted(stdout: string, stderr: string): boolean {
  if (/^File is not encrypted$/im.test(stdout)) return false;
  if (/^File is encrypted\b/im.test(stdout)) return true;
  if (/invalid password/i.test(stderr) || /invalid password/i.test(stdout)) return true;
  if (/^(?:User|Owner) password\s*=/im.test(stdout)) return true;
  return false;
}

function isPasswordFailure(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && (err as { isPassword?: boolean }).isPassword === true) return true;
  if (err instanceof Error) {
    if (err.name === 'PasswordException' || err.name === 'EncryptedPDFError') return true;
    if (/invalid password|password|encrypt/i.test(err.message)) return true;
  }
  return false;
}

function parseQpdfWarnings(stdout: string, stderr: string): string[] {
  const warnings: string[] = [];
  const lines = `${stdout}\n${stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^WARNING:/i.test(line)) {
      const cleaned = line.replace(/^WARNING:\s*/i, '');
      if (cleaned && !warnings.includes(cleaned)) warnings.push(cleaned);
    }
  }
  return warnings;
}

function mergeUnique(target: string[], extra: string[]): string[] {
  const out = [...target];
  for (const item of extra) {
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

/**
 * Strips leading non-PDF garbage bytes if a `%PDF-` signature appears within the first 64 KB.
 */
export function trimLeadingJunk(bytes: Uint8Array): Uint8Array {
  const offset = findHeaderOffset(bytes);
  if (offset > 0 && offset <= MAX_HEADER_SCAN) {
    return bytes.subarray(offset);
  }
  return bytes;
}

/**
 * Inspects raw PDF header/EOF framing and runs `qpdf --check` to diagnose structural issues.
 */
export async function diagnosePdf(bytes: Uint8Array, password?: string): Promise<PdfDiagnosis> {
  const headerOffset = findHeaderOffset(bytes);
  const hasHeader = headerOffset >= 0;
  const { hasEof, trailingGarbageBytes } = findLastEof(bytes);
  const check = await checkQpdf(bytes, password);
  const isEncrypted = detectEncrypted(check.stdout, check.stderr);

  const issues: string[] = [];
  if (!hasHeader) {
    issues.push('Missing %PDF- header signature.');
  } else if (headerOffset > 0) {
    issues.push(`${headerOffset} bytes of leading garbage before %PDF- header.`);
  }
  if (!hasEof) {
    issues.push('Missing %%EOF end-of-file marker.');
  }
  if (trailingGarbageBytes > 0) {
    issues.push(`${trailingGarbageBytes} bytes of trailing data after %%EOF.`);
  }
  for (const err of check.errors) {
    if (!issues.includes(err)) issues.push(err);
  }
  for (const warn of check.warnings) {
    if (!issues.includes(warn)) issues.push(warn);
  }

  const needsRepair =
    !hasHeader ||
    headerOffset > 0 ||
    !hasEof ||
    trailingGarbageBytes > 0 ||
    !check.ok ||
    check.warnings.length > 0 ||
    check.errors.length > 0;

  return {
    hasHeader,
    headerOffset,
    hasEof,
    trailingGarbageBytes,
    qpdfOk: check.ok,
    isEncrypted,
    warnings: check.warnings,
    errors: check.errors,
    issues,
    needsRepair,
  };
}

function extractBalancedDict(text: string, openIdx: number): string | null {
  if (text[openIdx] !== '<' || text[openIdx + 1] !== '<') return null;
  let depth = 0;
  let i = openIdx;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '(') {
      // Skip PDF literal string (handling escaped parens and balanced nested parens)
      let parenDepth = 1;
      i++;
      while (i < text.length && parenDepth > 0) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === '(') parenDepth++;
        else if (text[i] === ')') parenDepth--;
        i++;
      }
      continue;
    }
    if (ch === '<' && text[i + 1] === '<') {
      depth++;
      i += 2;
      continue;
    }
    if (ch === '>' && text[i + 1] === '>') {
      depth--;
      i += 2;
      if (depth === 0) return text.slice(openIdx, i);
      continue;
    }
    i++;
  }
  return null;
}

/**
 * Reconstructs a clean textual cross-reference table by scanning indirect object offsets (`N G obj`)
 * and trailer metadata so QPDF can losslessly rewrite PDFs with damaged xref tables or startxref offsets.
 */
function rebuildXrefForQpdf(bytes: Uint8Array): Uint8Array | null {
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const objects = new Map<number, { gen: number; offset: number }>();
  let maxObjNum = 0;
  let lastEndobjEnd = 0;
  let catalogRef: string | null = null;

  const objRe = /(?:^|[\r\n])(\d{1,7})[ \t]+(\d{1,5})[ \t]+obj(?=[\s<\[/(%])/g;
  let match: RegExpExecArray | null;
  while ((match = objRe.exec(latin1)) !== null) {
    const leadingNewline = match[0][0] === '\r' || match[0][0] === '\n' ? 1 : 0;
    const offset = match.index + leadingNewline;
    const objNum = Number(match[1]);
    const gen = Number(match[2]);
    if (!Number.isFinite(objNum) || objNum <= 0 || objNum > 10_000_000) continue;

    objects.set(objNum, { gen, offset });
    if (objNum > maxObjNum) maxObjNum = objNum;

    const bodyStart = match.index + match[0].length;
    const headerSnippet = latin1.slice(bodyStart, Math.min(latin1.length, bodyStart + 512));
    if (/\/Type\s*\/Catalog\b/.test(headerSnippet)) {
      catalogRef = `${objNum} ${gen} R`;
    }

    // Skip over any stream payload so embedded bytes resembling `N G obj` are not misclassified.
    const nextEndobj = latin1.indexOf('endobj', bodyStart);
    const nextStream = latin1.indexOf('stream', bodyStart);
    if (nextStream !== -1 && (nextEndobj === -1 || nextStream < nextEndobj)) {
      const endstream = latin1.indexOf('endstream', nextStream + 6);
      if (endstream !== -1) {
        const afterEndstream = endstream + 9;
        const postStreamEndobj = latin1.indexOf('endobj', afterEndstream);
        const advanceTo =
          postStreamEndobj !== -1 && postStreamEndobj - afterEndstream < 64
            ? postStreamEndobj + 6
            : afterEndstream;
        if (advanceTo > lastEndobjEnd) lastEndobjEnd = advanceTo;
        objRe.lastIndex = advanceTo;
        continue;
      }
    }
    if (nextEndobj !== -1) {
      const endPos = nextEndobj + 6;
      if (endPos > lastEndobjEnd) lastEndobjEnd = endPos;
      objRe.lastIndex = endPos;
    }
  }

  if (objects.size === 0 || maxObjNum === 0) return null;

  // Locate the last valid trailer dictionary; if absent, synthesize one from the Catalog object.
  let trailerDict: string | null = null;
  let searchPos = latin1.length;
  while (searchPos > 0) {
    const idx = latin1.lastIndexOf('trailer', searchPos - 1);
    if (idx === -1) break;
    const dictStart = latin1.indexOf('<<', idx + 7);
    if (dictStart !== -1 && dictStart - idx < 32) {
      const candidate = extractBalancedDict(latin1, dictStart);
      if (candidate && /\/Root\s+\d+\s+\d+\s+R/.test(candidate)) {
        trailerDict = candidate;
        break;
      }
    }
    searchPos = idx;
  }

  const size = maxObjNum + 1;
  if (trailerDict) {
    // Strip stale /Prev and /XRefStm pointers and update /Size to match the rebuilt xref table.
    trailerDict = trailerDict
      .replace(/\/Prev\s+\d+/g, '')
      .replace(/\/XRefStm\s+\d+/g, '');
    if (/\/Size\s+\d+/.test(trailerDict)) {
      trailerDict = trailerDict.replace(/\/Size\s+\d+/, `/Size ${size}`);
    } else {
      trailerDict = trailerDict.replace(/<<\s*/, `<< /Size ${size} `);
    }
  } else if (catalogRef) {
    trailerDict = `<< /Size ${size} /Root ${catalogRef} >>`;
  } else {
    return null;
  }

  const bodyEnd = lastEndobjEnd > 0 ? Math.min(bytes.length, lastEndobjEnd) : bytes.length;
  const prefix = bytes.subarray(0, bodyEnd);
  const needsNewline = prefix.length > 0 && prefix[prefix.length - 1] !== 0x0a;
  const xrefOffset = prefix.length + (needsNewline ? 1 : 0);

  const lines: string[] = [
    needsNewline ? '\nxref\n' : 'xref\n',
    `0 ${size}\n`,
    '0000000000 65535 f \n',
  ];
  for (let i = 1; i <= maxObjNum; i++) {
    const entry = objects.get(i);
    if (entry) {
      lines.push(
        `${String(entry.offset).padStart(10, '0')} ${String(entry.gen).padStart(5, '0')} n \n`,
      );
    } else {
      lines.push('0000000000 65535 f \n');
    }
  }
  lines.push(`trailer\n${trailerDict}\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const tailStr = lines.join('');
  const tailBytes = new Uint8Array(tailStr.length);
  for (let i = 0; i < tailStr.length; i++) tailBytes[i] = tailStr.charCodeAt(i) & 0xff;

  const rebuilt = new Uint8Array(prefix.length + tailBytes.length);
  rebuilt.set(prefix, 0);
  rebuilt.set(tailBytes, prefix.length);
  return rebuilt;
}

async function repairWithQpdf(
  trimmed: Uint8Array,
  password: string | undefined,
  issuesFound: string[],
  onProgress?: (fraction: number, label: string) => void,
): Promise<RepairResult> {
  onProgress?.(0.25, 'Rebuilding PDF structure with QPDF…');
  const args: string[] = [
    '--object-streams=generate',
    ...(password ? [`--password=${password}`] : []),
    '$IN',
    '$OUT',
  ];

  const extraWarnings: string[] = [];
  let res = await runQpdf(trimmed, args);

  if ((res.exitCode !== 0 && res.exitCode !== 3) || !res.output || res.output.length === 0) {
    const combined = `${res.stderr}\n${res.stdout}`.trim();
    if (/invalid password/i.test(combined)) {
      const err = new Error('Incorrect or missing PDF password.') as Error & { isPassword?: boolean };
      err.isPassword = true;
      throw err;
    }

    // If the xref table or startxref offset is damaged, synthesize a clean xref table from object offsets
    // and retry lossless QPDF rewrite.
    onProgress?.(0.45, 'Reconstructing cross-reference table for QPDF…');
    const rebuiltInput = rebuildXrefForQpdf(trimmed);
    if (rebuiltInput) {
      const retry = await runQpdf(rebuiltInput, args);
      if ((retry.exitCode === 0 || retry.exitCode === 3) && retry.output && retry.output.length > 0) {
        res = retry;
        extraWarnings.push('Reconstructed damaged cross-reference table before QPDF structural rebuild.');
      }
    }
  }

  if ((res.exitCode !== 0 && res.exitCode !== 3) || !res.output || res.output.length === 0) {
    const combined = `${res.stderr}\n${res.stdout}`.trim();
    if (/invalid password/i.test(combined)) {
      const err = new Error('Incorrect or missing PDF password.') as Error & { isPassword?: boolean };
      err.isPassword = true;
      throw err;
    }
    const firstLine = combined
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !/^WARNING:/i.test(l));
    throw new Error(firstLine || `QPDF rebuild failed (exit code ${res.exitCode}).`);
  }

  const out = res.output;
  onProgress?.(0.7, 'Verifying rebuilt PDF…');

  const doc = await PDFDocument.load(out, {
    updateMetadata: false,
    ...(password ? { password } : {}),
  });
  const pagesRecovered = doc.getPageCount();
  if (pagesRecovered < 1) {
    throw new Error('QPDF produced a document with zero pages.');
  }

  const verify = await checkQpdf(out, password);
  const warnings = mergeUnique(
    mergeUnique(extraWarnings, parseQpdfWarnings(res.stdout, res.stderr)),
    verify.warnings,
  );

  onProgress?.(1, 'Done');
  return {
    bytes: out,
    strategyUsed: 'qpdf',
    issuesFound,
    warnings,
    pagesRecovered,
    verifiedOk: verify.ok,
  };
}

async function repairWithPdfLib(
  trimmed: Uint8Array,
  password: string | undefined,
  issuesFound: string[],
  onProgress?: (fraction: number, label: string) => void,
): Promise<RepairResult> {
  onProgress?.(0.2, 'Parsing recoverable objects with pdf-lib…');
  const src = await PDFDocument.load(trimmed, {
    updateMetadata: false,
    throwOnInvalidObject: false,
    ...(password ? { password } : {}),
  });

  const total = src.getPageCount();
  if (total < 1) {
    throw new Error('No pages were found by the tolerant JS parser.');
  }

  const fresh = await PDFDocument.create();
  const warnings: string[] = [];
  let pagesRecovered = 0;

  for (let i = 0; i < total; i++) {
    onProgress?.(0.25 + (0.55 * (i + 1)) / total, `Copying page ${i + 1} of ${total}…`);
    try {
      const [copied] = await fresh.copyPages(src, [i]);
      fresh.addPage(copied);
      pagesRecovered++;
    } catch (err) {
      warnings.push(
        `Skipped unrecoverable page ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (pagesRecovered < 1) {
    throw new Error('Could not copy any recoverable pages with pdf-lib.');
  }

  onProgress?.(0.85, 'Saving rebuilt PDF…');
  const out = await fresh.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });

  const verify = await checkQpdf(out);
  onProgress?.(1, 'Done');

  return {
    bytes: out,
    strategyUsed: 'pdflib',
    issuesFound,
    warnings: mergeUnique(warnings, verify.warnings),
    pagesRecovered,
    verifiedOk: verify.ok,
  };
}

async function repairWithRaster(
  trimmed: Uint8Array,
  opts: RepairOptions,
  issuesFound: string[],
): Promise<RepairResult> {
  if (typeof document === 'undefined') {
    throw new Error('Visual rescue (rasterize) requires a browser environment.');
  }

  const dpi = Math.max(72, Math.min(400, opts.rasterDpi ?? 150));
  const quality = Math.max(10, Math.min(100, opts.rasterQuality ?? 85)) / 100;
  const scale = dpi / 72;

  opts.onProgress?.(0.1, 'Loading PDF renderer…');
  // @ts-expect-error TypeScript node16 requires .js on dynamic imports, which Next/Turbopack rejects.
  const pdfjsMod = (await import('./pdfjs')) as { openPdf: typeof OpenPdfFn; renderPage: typeof RenderPageFn };
  // @ts-expect-error TypeScript node16 requires .js on dynamic imports, which Next/Turbopack rejects.
  const filesMod = (await import('./files')) as { canvasToBytes: typeof CanvasToBytesFn };

  const { doc, close } = await pdfjsMod.openPdf(trimmed, opts.password);
  const warnings: string[] = [];
  let pagesRecovered = 0;

  try {
    const fresh = await PDFDocument.create();
    const total = doc.numPages;

    for (let pageNum = 1; pageNum <= total; pageNum++) {
      opts.onProgress?.(0.15 + (0.7 * pageNum) / Math.max(1, total), `Rendering page ${pageNum} of ${total}…`);
      try {
        const page = await doc.getPage(pageNum);
        const ptViewport = page.getViewport({ scale: 1 });
        const canvas = await pdfjsMod.renderPage(page, scale);
        let jpgBytes: Uint8Array;
        try {
          jpgBytes = await filesMod.canvasToBytes(canvas, 'image/jpeg', quality);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
        const img = await fresh.embedJpg(jpgBytes);
        const outPage = fresh.addPage([ptViewport.width, ptViewport.height]);
        outPage.drawImage(img, {
          x: 0,
          y: 0,
          width: ptViewport.width,
          height: ptViewport.height,
        });
        pagesRecovered++;
      } catch (err) {
        warnings.push(
          `Skipped unreadable page ${pageNum}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (pagesRecovered < 1) {
      throw new Error('No pages could be rendered during visual rescue.');
    }

    opts.onProgress?.(0.9, 'Saving rescued PDF…');
    const out = await fresh.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
    const verify = await checkQpdf(out);
    opts.onProgress?.(1, 'Done');

    return {
      bytes: out,
      strategyUsed: 'raster',
      issuesFound,
      warnings: mergeUnique(warnings, verify.warnings),
      pagesRecovered,
      verifiedOk: verify.ok,
    };
  } finally {
    await close();
  }
}

/**
 * Repairs a damaged or malformed PDF using the requested strategy (or automatic 3-tier fallback).
 */
export async function repairPdf(bytes: Uint8Array, opts?: RepairOptions): Promise<RepairResult> {
  const strategy: RepairStrategy = opts?.strategy ?? 'auto';
  const password = opts?.password;
  const onProgress = opts?.onProgress;

  onProgress?.(0.05, 'Diagnosing PDF structure…');
  const diagnosis = await diagnosePdf(bytes, password);
  const issuesFound = diagnosis.issues;
  const trimmed = trimLeadingJunk(bytes);

  if (strategy === 'qpdf') {
    return repairWithQpdf(trimmed, password, issuesFound, onProgress);
  }
  if (strategy === 'pdflib') {
    return repairWithPdfLib(trimmed, password, issuesFound, onProgress);
  }
  if (strategy === 'raster') {
    return repairWithRaster(trimmed, opts ?? {}, issuesFound);
  }

  // Auto cascade: Tier 1 (QPDF) -> Tier 2 (pdf-lib) -> Tier 3 (browser raster rescue).
  const fallbackNotes: string[] = [];

  try {
    return await repairWithQpdf(trimmed, password, issuesFound, onProgress);
  } catch (err) {
    if (isPasswordFailure(err)) throw err;
    fallbackNotes.push(`QPDF rebuild fell back: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const res = await repairWithPdfLib(trimmed, password, issuesFound, onProgress);
    return {
      ...res,
      warnings: mergeUnique(fallbackNotes, res.warnings),
    };
  } catch (err) {
    if (isPasswordFailure(err)) throw err;
    fallbackNotes.push(`Tolerant JS parser fell back: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (typeof document !== 'undefined') {
    try {
      const res = await repairWithRaster(trimmed, opts ?? {}, issuesFound);
      return {
        ...res,
        warnings: mergeUnique(fallbackNotes, res.warnings),
      };
    } catch (err) {
      if (isPasswordFailure(err)) throw err;
      fallbackNotes.push(`Visual rescue failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`Could not repair this PDF. ${fallbackNotes.join(' ')}`);
}
