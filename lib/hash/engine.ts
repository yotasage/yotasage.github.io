import { adler32Bytes, crc32Bytes, md5Bytes, ripemd160Bytes, sha1Bytes } from './legacy';
import { sha224Bytes, sha256Bytes, sha384Bytes, sha512Bytes } from './sha2';
import { blake2b256Bytes, blake2s256Bytes, sha3_256Bytes, sha3_512Bytes } from './sha3';
import {
  ALGORITHM_MAP,
  CrossFieldSummary,
  DiffSegment,
  DigestEncoding,
  DigestGroup,
  HASH_ALGORITHMS,
  HashAlgorithmId,
  HashFieldEntry,
  ParsedExpectedHash,
  TextInputEncoding,
  VerificationSummary,
  VerifierMatch,
} from './types';

// ---------------------------------------------------------------------------
// Byte / String Encoding Helpers
// ---------------------------------------------------------------------------

export function bytesToHex(bytes: Uint8Array, upper = false): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return upper ? out.toUpperCase() : out;
}

export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.replace(/[\s:_-]+/g, '');
  if (clean.length === 0) return new Uint8Array(0);
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(input: string): Uint8Array | null {
  const trimmed = input.trim().replace(/\s+/g, '');
  if (trimmed.length === 0) return new Uint8Array(0);
  const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.length % 4 === 0 ? normalized : normalized.padEnd(normalized.length + (4 - (normalized.length % 4)), '=');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) return null;
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

export function formatDigest(bytes: Uint8Array, encoding: DigestEncoding): string {
  if (encoding === 'base64') return bytesToBase64(bytes);
  return bytesToHex(bytes, encoding === 'hex-upper');
}

export function parseTextToBytes(
  text: string,
  encoding: TextInputEncoding,
): { ok: true; bytes: Uint8Array } | { ok: false; error: 'invalidHex' | 'invalidBase64' } {
  if (encoding === 'utf8') {
    return { ok: true, bytes: new TextEncoder().encode(text) };
  }
  if (encoding === 'hex') {
    const bytes = hexToBytes(text);
    if (!bytes) return { ok: false, error: 'invalidHex' };
    return { ok: true, bytes };
  }
  const bytes = base64ToBytes(text);
  if (!bytes) return { ok: false, error: 'invalidBase64' };
  return { ok: true, bytes };
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

// ---------------------------------------------------------------------------
// Digest & HMAC Computation
// ---------------------------------------------------------------------------

export function computeDigestSync(algorithm: HashAlgorithmId, input: Uint8Array): Uint8Array {
  switch (algorithm) {
    case 'MD5':
      return md5Bytes(input);
    case 'SHA-1':
      return sha1Bytes(input);
    case 'SHA-224':
      return sha224Bytes(input);
    case 'SHA-256':
      return sha256Bytes(input);
    case 'SHA-384':
      return sha384Bytes(input);
    case 'SHA-512':
      return sha512Bytes(input);
    case 'SHA3-256':
      return sha3_256Bytes(input);
    case 'SHA3-512':
      return sha3_512Bytes(input);
    case 'BLAKE2b-256':
      return blake2b256Bytes(input);
    case 'BLAKE2s-256':
      return blake2s256Bytes(input);
    case 'RIPEMD-160':
      return ripemd160Bytes(input);
    case 'CRC32':
      return crc32Bytes(input);
    case 'Adler-32':
      return adler32Bytes(input);
  }
}

/**
 * RFC 2104 HMAC over any block-based cryptographic hash algorithm.
 */
export function computeHmacSync(
  algorithm: HashAlgorithmId,
  key: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  const info = ALGORITHM_MAP[algorithm];
  if (!info.supportsHmac || info.blockSize <= 0) {
    return computeDigestSync(algorithm, message);
  }
  const blockSize = info.blockSize;
  const keyBlock = new Uint8Array(blockSize);
  if (key.length > blockSize) {
    keyBlock.set(computeDigestSync(algorithm, key), 0);
  } else {
    keyBlock.set(key, 0);
  }

  const ipad = new Uint8Array(blockSize + message.length);
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = keyBlock[i] ^ 0x36;
  }
  ipad.set(message, blockSize);
  const innerHash = computeDigestSync(algorithm, ipad);

  const opad = new Uint8Array(blockSize + innerHash.length);
  for (let i = 0; i < blockSize; i++) {
    opad[i] = keyBlock[i] ^ 0x5c;
  }
  opad.set(innerHash, blockSize);
  return computeDigestSync(algorithm, opad);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes.buffer;
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

/**
 * Async digest computation that uses native Web Crypto acceleration for SHA-1/256/384/512
 * on larger buffers when running in a secure context, falling back seamlessly to pure TS.
 */
export async function computeDigestAsync(
  algorithm: HashAlgorithmId,
  input: Uint8Array,
  hmacKey: Uint8Array | null = null,
): Promise<Uint8Array> {
  const info = ALGORITHM_MAP[algorithm];
  const subtle = globalThis.crypto?.subtle;

  if (subtle && info.webCryptoName && input.byteLength >= 4096) {
    try {
      const dataBuffer = toArrayBuffer(input);
      if (hmacKey && info.supportsHmac) {
        const keyBuffer = toArrayBuffer(hmacKey);
        const cryptoKey = await subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'HMAC', hash: info.webCryptoName },
          false,
          ['sign'],
        );
        const sig = await subtle.sign('HMAC', cryptoKey, dataBuffer);
        return new Uint8Array(sig);
      }
      const digest = await subtle.digest(info.webCryptoName, dataBuffer);
      return new Uint8Array(digest);
    } catch {
      // Fall through to pure TS implementation
    }
  }

  if (hmacKey && info.supportsHmac) {
    return computeHmacSync(algorithm, hmacKey, input);
  }
  return computeDigestSync(algorithm, input);
}

export async function computeDigestsForAlgorithms(
  input: Uint8Array,
  algorithms: readonly HashAlgorithmId[],
  encoding: DigestEncoding,
  hmacKey: Uint8Array | null = null,
): Promise<Partial<Record<HashAlgorithmId, string>>> {
  const entries = await Promise.all(
    algorithms.map(async (algo) => {
      const raw = await computeDigestAsync(algo, input, hmacKey);
      return [algo, formatDigest(raw, encoding)] as const;
    }),
  );
  const out: Partial<Record<HashAlgorithmId, string>> = {};
  for (const [algo, digest] of entries) {
    out[algo] = digest;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Expected Hash Parsing & Auto-Detection
// ---------------------------------------------------------------------------

const VALID_DIGEST_BYTE_LENGTHS = new Set(HASH_ALGORITHMS.map((a) => a.bits / 8));

function algorithmsForBitLength(bits: number): HashAlgorithmId[] {
  return HASH_ALGORITHMS.filter((a) => a.bits === bits).map((a) => a.id);
}

/**
 * Parses a pasted hash string. Supports:
 * - Plain hex (lowercase or uppercase), optionally separated by spaces/colons/hyphens
 * - Optional 0x prefix
 * - GNU coreutils checksum lines: `<hash>  <filename>` or `<hash> *<filename>`
 * - BSD style checksum lines: `SHA256 (file.txt) = <hash>`
 * - Standard or URL-safe Base64 digests
 */
export function parseExpectedHash(rawInput: string): ParsedExpectedHash {
  const raw = rawInput.trim();
  if (!raw) {
    return {
      raw: rawInput,
      cleaned: '',
      extractedFilename: null,
      format: 'empty',
      bytes: null,
      hexLower: null,
      bitLength: null,
      candidateAlgorithms: [],
    };
  }

  let candidate = raw;
  let extractedFilename: string | null = null;

  // BSD format: e.g. "SHA256 (archive.tar.gz) = abcd..."
  const bsdMatch = raw.match(/^[A-Za-z0-9_-]+\s*\(([^)]+)\)\s*=\s*(\S+)$/);
  if (bsdMatch) {
    extractedFilename = bsdMatch[1].trim();
    candidate = bsdMatch[2].trim();
  } else {
    // GNU checksum format: "<token>  <filename>" or "<token> *<filename>"
    const gnuMatch = raw.match(/^([0-9a-fA-F+/=_-]{8,160})\s+\*?(.+)$/);
    if (gnuMatch && !/^[0-9a-fA-F\s:_-]+$/.test(raw)) {
      candidate = gnuMatch[1].trim();
      extractedFilename = gnuMatch[2].trim();
    }
  }

  const withoutPrefix = candidate.startsWith('0x') || candidate.startsWith('0X') ? candidate.slice(2) : candidate;
  const compactHex = withoutPrefix.replace(/[\s:_-]+/g, '');

  // Check hex first
  if (compactHex.length >= 8 && compactHex.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(compactHex)) {
    const byteLen = compactHex.length / 2;
    const bytes = hexToBytes(compactHex);
    if (bytes && VALID_DIGEST_BYTE_LENGTHS.has(byteLen)) {
      const bitLength = byteLen * 8;
      return {
        raw: rawInput,
        cleaned: compactHex.toLowerCase(),
        extractedFilename,
        format: 'hex',
        bytes,
        hexLower: compactHex.toLowerCase(),
        bitLength,
        candidateAlgorithms: algorithmsForBitLength(bitLength),
      };
    }
  }

  // Check Base64 digest
  const compactB64 = candidate.replace(/\s+/g, '');
  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(compactB64) && compactB64.length >= 6) {
    const bytes = base64ToBytes(compactB64);
    if (bytes && VALID_DIGEST_BYTE_LENGTHS.has(bytes.length)) {
      const bitLength = bytes.length * 8;
      return {
        raw: rawInput,
        cleaned: compactB64,
        extractedFilename,
        format: 'base64',
        bytes,
        hexLower: bytesToHex(bytes, false),
        bitLength,
        candidateAlgorithms: algorithmsForBitLength(bitLength),
      };
    }
  }

  return {
    raw: rawInput,
    cleaned: compactHex || candidate,
    extractedFilename,
    format: 'unknown',
    bytes: null,
    hexLower: null,
    bitLength: null,
    candidateAlgorithms: [],
  };
}

function digestToCanonicalHex(digest: string, encoding: DigestEncoding): string | null {
  if (!digest) return null;
  if (encoding === 'base64') {
    const bytes = base64ToBytes(digest);
    return bytes ? bytesToHex(bytes, false) : null;
  }
  return digest.toLowerCase();
}

/**
 * Verifies the dedicated expected hash against every computed digest across all input fields.
 * Comparison is byte-canonical (case-insensitive hex AND cross-format hex <-> Base64 matching!).
 */
export function verifyExpectedHash(
  expectedInput: string,
  fields: readonly HashFieldEntry[],
  selectedAlgorithms: readonly HashAlgorithmId[],
  encoding: DigestEncoding,
): VerificationSummary {
  const parsed = parseExpectedHash(expectedInput);

  if (parsed.format === 'empty') {
    return {
      parsed,
      status: 'idle',
      matches: [],
      missingCandidateAlgorithms: [],
    };
  }

  if (parsed.format === 'unknown' || !parsed.hexLower) {
    return {
      parsed,
      status: 'invalid',
      matches: [],
      missingCandidateAlgorithms: [],
    };
  }

  const selectedSet = new Set(selectedAlgorithms);
  const missingCandidateAlgorithms = parsed.candidateAlgorithms.filter((a) => !selectedSet.has(a));

  const matches: VerifierMatch[] = [];
  let hasAnyComputedDigest = false;

  for (const field of fields) {
    for (const algo of selectedAlgorithms) {
      const digest = field.digests[algo];
      if (!digest) continue;
      hasAnyComputedDigest = true;
      const canonical = digestToCanonicalHex(digest, encoding);
      if (canonical && canonical === parsed.hexLower) {
        matches.push({
          fieldId: field.id,
          fieldLabel: field.label,
          algorithm: algo,
          digest,
        });
      }
    }
  }

  if (matches.length > 0) {
    return {
      parsed,
      status: 'match',
      matches,
      missingCandidateAlgorithms,
    };
  }

  if (!hasAnyComputedDigest) {
    return {
      parsed,
      status: 'waiting',
      matches: [],
      missingCandidateAlgorithms,
    };
  }

  return {
    parsed,
    status: 'mismatch',
    matches: [],
    missingCandidateAlgorithms,
  };
}

// ---------------------------------------------------------------------------
// Cross-Field Comparison & Digest Diff
// ---------------------------------------------------------------------------

/**
 * Compares digests across all active input fields, grouping identical fields together
 * and computing per-algorithm peer matches for every field.
 */
export function compareFieldDigests(
  fields: readonly HashFieldEntry[],
  selectedAlgorithms: readonly HashAlgorithmId[],
): CrossFieldSummary {
  const activeFields = fields.filter((field) =>
    selectedAlgorithms.some((algo) => Boolean(field.digests[algo])),
  );
  const activeFieldIds = activeFields.map((f) => f.id);

  const fieldMatchesByAlgorithm: Record<string, Partial<Record<HashAlgorithmId, string[]>>> = {};
  for (const field of fields) {
    fieldMatchesByAlgorithm[field.id] = {};
  }

  for (const algo of selectedAlgorithms) {
    const byDigest = new Map<string, HashFieldEntry[]>();
    for (const field of activeFields) {
      const digest = field.digests[algo];
      if (!digest) continue;
      const key = digest.toLowerCase();
      const bucket = byDigest.get(key);
      if (bucket) {
        bucket.push(field);
      } else {
        byDigest.set(key, [field]);
      }
    }
    for (const bucket of byDigest.values()) {
      if (bucket.length < 2) continue;
      for (const field of bucket) {
        fieldMatchesByAlgorithm[field.id][algo] = bucket
          .filter((other) => other.id !== field.id)
          .map((other) => other.label);
      }
    }
  }

  // Group fields whose full computed signature matches across all selected algorithms
  const signatureMap = new Map<string, HashFieldEntry[]>();
  for (const field of activeFields) {
    const sig = selectedAlgorithms
      .map((algo) => `${algo}:${(field.digests[algo] ?? '').toLowerCase()}`)
      .join('|');
    const bucket = signatureMap.get(sig);
    if (bucket) {
      bucket.push(field);
    } else {
      signatureMap.set(sig, [field]);
    }
  }

  const groups: DigestGroup[] = [];
  const fieldGroupIndex: Record<string, number> = {};
  let idx = 0;
  for (const bucket of signatureMap.values()) {
    groups.push({
      groupIndex: idx,
      fieldIds: bucket.map((f) => f.id),
      fieldLabels: bucket.map((f) => f.label),
    });
    for (const field of bucket) {
      fieldGroupIndex[field.id] = idx;
    }
    idx += 1;
  }

  return {
    activeFieldIds,
    groups,
    fieldMatchesByAlgorithm,
    fieldGroupIndex,
    allIdentical: activeFields.length >= 2 && groups.length === 1,
    allDistinct: activeFields.length >= 2 && groups.length === activeFields.length,
  };
}

/**
 * Character-by-character diff segments for comparing two digest strings visually.
 */
export function buildDigestDiff(a: string, b: string): {
  segmentsA: DiffSegment[];
  segmentsB: DiffSegment[];
  matchingChars: number;
  totalChars: number;
} {
  const maxLen = Math.max(a.length, b.length);
  const segA: DiffSegment[] = [];
  const segB: DiffSegment[] = [];
  let matchingChars = 0;

  for (let i = 0; i < maxLen; i++) {
    const ca = a[i] ?? '';
    const cb = b[i] ?? '';
    const same = ca !== '' && cb !== '' && ca.toLowerCase() === cb.toLowerCase();
    if (same) matchingChars += 1;

    if (ca !== '') {
      const lastA = segA[segA.length - 1];
      if (lastA && lastA.same === same) {
        segA[segA.length - 1] = { text: lastA.text + ca, same };
      } else {
        segA.push({ text: ca, same });
      }
    }

    if (cb !== '') {
      const lastB = segB[segB.length - 1];
      if (lastB && lastB.same === same) {
        segB[segB.length - 1] = { text: lastB.text + cb, same };
      } else {
        segB.push({ text: cb, same });
      }
    }
  }

  return {
    segmentsA: segA,
    segmentsB: segB,
    matchingChars,
    totalChars: maxLen,
  };
}

/**
 * Formats active fields as a GNU coreutils checksum manifest (`<digest>  <name>`).
 */
export function formatChecksumManifest(
  fields: readonly HashFieldEntry[],
  algorithm: HashAlgorithmId,
): string {
  const lines: string[] = [];
  for (const field of fields) {
    const digest = field.digests[algorithm];
    if (!digest) continue;
    const name = field.kind === 'file' && field.file ? field.file.name : field.label;
    lines.push(`${digest}  ${name}`);
  }
  return lines.join('\n');
}
