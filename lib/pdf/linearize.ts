// Optimize for web (PDF linearization / Fast Web View) powered by self-hosted QPDF WebAssembly.
// DOM-free so it runs identically in browsers, Web Workers, and the Node.js verification harness.

import { checkQpdf, runQpdf } from './qpdf';

export interface LinearizeInspection {
  isLinearized: boolean;
  pdfVersion: string | null;
  ok: boolean;
  warnings: string[];
  errors: string[];
  isEncrypted: boolean;
}

export interface LinearizeOptions {
  password?: string;
  /** Repack cross-reference and object definitions into compressed object streams (default true). */
  objectStreams?: boolean;
  /** Recompress Flate streams at level 9 for smaller output (default false). */
  recompressStreams?: boolean;
}

export interface LinearizeResult {
  bytes: Uint8Array;
  isLinearized: boolean;
  warnings: string[];
  beforeBytes: number;
  afterBytes: number;
}

function readHeaderLatin1(bytes: Uint8Array, maxBytes = 1024): string {
  const limit = Math.min(bytes.length, maxBytes);
  let out = '';
  for (let i = 0; i < limit; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Fast header check: scans the first 1024 bytes as Latin-1 for the `/Linearized` dictionary key.
 */
export function hasLinearizedHeader(bytes: Uint8Array): boolean {
  return /\/Linearized\b/.test(readHeaderLatin1(bytes, 1024));
}

/**
 * Extracts the `%PDF-x.y` version string from the first 1024 bytes, or `null` if absent.
 */
export function extractPdfVersion(bytes: Uint8Array): string | null {
  const match = readHeaderLatin1(bytes, 1024).match(/%PDF-(\d+\.\d+)/);
  return match ? match[1] : null;
}

function detectEncrypted(stdout: string, stderr: string): boolean {
  if (/^File is not encrypted$/im.test(stdout)) return false;
  if (/^File is encrypted\b/im.test(stdout)) return true;
  if (/invalid password/i.test(stderr) || /invalid password/i.test(stdout)) return true;
  if (/^(?:User|Owner) password\s*=/im.test(stdout)) return true;
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

function makeQpdfError(stderr: string, stdout: string, exitCode: number): Error {
  const combined = `${stderr}\n${stdout}`.trim();
  if (/invalid password/i.test(combined)) {
    const err = new Error('Incorrect or missing PDF password.') as Error & { isPassword?: boolean };
    err.isPassword = true;
    return err;
  }
  const firstLine = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^WARNING:/i.test(l));
  return new Error(firstLine || `QPDF failed with exit code ${exitCode}.`);
}

/**
 * Inspects a PDF for Fast Web View (linearization) status, PDF version, encryption, and QPDF health.
 */
export async function inspectLinearization(
  bytes: Uint8Array,
  password?: string,
): Promise<LinearizeInspection> {
  const headerLinearized = hasLinearizedHeader(bytes);
  const pdfVersion = extractPdfVersion(bytes);
  const check = await checkQpdf(bytes, password);
  const isEncrypted = detectEncrypted(check.stdout, check.stderr);

  return {
    isLinearized: check.ok ? check.isLinearized : headerLinearized,
    pdfVersion,
    ok: check.ok,
    warnings: check.warnings,
    errors: check.errors,
    isEncrypted,
  };
}

/**
 * Linearizes a PDF for Fast Web View (byte-range streaming) using QPDF WebAssembly,
 * then verifies the output with both a fast header scan and `qpdf --check`.
 */
export async function linearizePdf(
  bytes: Uint8Array,
  opts?: LinearizeOptions,
): Promise<LinearizeResult> {
  const args: string[] = [
    '--linearize',
    ...(opts?.objectStreams !== false ? ['--object-streams=generate'] : []),
    ...(opts?.recompressStreams ? ['--recompress-flate', '--compression-level=9'] : []),
    ...(opts?.password ? [`--password=${opts.password}`] : []),
    '$IN',
    '$OUT',
  ];

  const res = await runQpdf(bytes, args);
  if ((res.exitCode !== 0 && res.exitCode !== 3) || !res.output || res.output.length === 0) {
    throw makeQpdfError(res.stderr, res.stdout, res.exitCode);
  }

  const out = res.output;
  const headerOk = hasLinearizedHeader(out);
  const verify = await checkQpdf(out, opts?.password);

  const warnings = [...parseQpdfWarnings(res.stdout, res.stderr)];
  for (const w of verify.warnings) {
    if (!warnings.includes(w)) warnings.push(w);
  }

  return {
    bytes: out,
    isLinearized: headerOk && verify.isLinearized,
    warnings,
    beforeBytes: bytes.length,
    afterBytes: out.length,
  };
}
