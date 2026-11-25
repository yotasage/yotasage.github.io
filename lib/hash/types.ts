export type HashAlgorithmId =
  | 'MD5'
  | 'SHA-1'
  | 'SHA-224'
  | 'SHA-256'
  | 'SHA-384'
  | 'SHA-512'
  | 'SHA3-256'
  | 'SHA3-512'
  | 'BLAKE2b-256'
  | 'BLAKE2s-256'
  | 'RIPEMD-160'
  | 'CRC32'
  | 'Adler-32';

export type AlgorithmGroup = 'sha2' | 'modern' | 'legacy' | 'checksum';

export type SecurityStatus = 'recommended' | 'legacy' | 'checksum';

export interface AlgorithmInfo {
  readonly id: HashAlgorithmId;
  readonly label: string;
  readonly bits: number;
  readonly hexLength: number;
  readonly blockSize: number;
  readonly group: AlgorithmGroup;
  readonly status: SecurityStatus;
  readonly supportsHmac: boolean;
  readonly webCryptoName?: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
}

export const HASH_ALGORITHMS: readonly AlgorithmInfo[] = [
  {
    id: 'MD5',
    label: 'MD5',
    bits: 128,
    hexLength: 32,
    blockSize: 64,
    group: 'legacy',
    status: 'legacy',
    supportsHmac: true,
  },
  {
    id: 'SHA-1',
    label: 'SHA-1',
    bits: 160,
    hexLength: 40,
    blockSize: 64,
    group: 'legacy',
    status: 'legacy',
    supportsHmac: true,
    webCryptoName: 'SHA-1',
  },
  {
    id: 'SHA-224',
    label: 'SHA-224',
    bits: 224,
    hexLength: 56,
    blockSize: 64,
    group: 'sha2',
    status: 'recommended',
    supportsHmac: true,
  },
  {
    id: 'SHA-256',
    label: 'SHA-256',
    bits: 256,
    hexLength: 64,
    blockSize: 64,
    group: 'sha2',
    status: 'recommended',
    supportsHmac: true,
    webCryptoName: 'SHA-256',
  },
  {
    id: 'SHA-384',
    label: 'SHA-384',
    bits: 384,
    hexLength: 96,
    blockSize: 128,
    group: 'sha2',
    status: 'recommended',
    supportsHmac: true,
    webCryptoName: 'SHA-384',
  },
  {
    id: 'SHA-512',
    label: 'SHA-512',
    bits: 512,
    hexLength: 128,
    blockSize: 128,
    group: 'sha2',
    status: 'recommended',
    supportsHmac: true,
    webCryptoName: 'SHA-512',
  },
  {
    id: 'SHA3-256',
    label: 'SHA3-256',
    bits: 256,
    hexLength: 64,
    blockSize: 136,
    group: 'modern',
    status: 'recommended',
    supportsHmac: true,
  },
  {
    id: 'SHA3-512',
    label: 'SHA3-512',
    bits: 512,
    hexLength: 128,
    blockSize: 72,
    group: 'modern',
    status: 'recommended',
    supportsHmac: true,
  },
  {
    id: 'BLAKE2b-256',
    label: 'BLAKE2b-256',
    bits: 256,
    hexLength: 64,
    blockSize: 128,
    group: 'modern',
    status: 'recommended',
    supportsHmac: true,
  },
  {
    id: 'BLAKE2s-256',
    label: 'BLAKE2s-256',
    bits: 256,
    hexLength: 64,
    blockSize: 64,
    group: 'modern',
    status: 'recommended',
    supportsHmac: true,
  },
  {
    id: 'RIPEMD-160',
    label: 'RIPEMD-160',
    bits: 160,
    hexLength: 40,
    blockSize: 64,
    group: 'legacy',
    status: 'legacy',
    supportsHmac: true,
  },
  {
    id: 'CRC32',
    label: 'CRC32',
    bits: 32,
    hexLength: 8,
    blockSize: 0,
    group: 'checksum',
    status: 'checksum',
    supportsHmac: false,
  },
  {
    id: 'Adler-32',
    label: 'Adler-32',
    bits: 32,
    hexLength: 8,
    blockSize: 0,
    group: 'checksum',
    status: 'checksum',
    supportsHmac: false,
  },
] as const;

export const ALGORITHM_MAP: Readonly<Record<HashAlgorithmId, AlgorithmInfo>> = HASH_ALGORITHMS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<HashAlgorithmId, AlgorithmInfo>,
);

export const DEFAULT_ALGORITHMS: readonly HashAlgorithmId[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'];

export type DigestEncoding = 'hex-lower' | 'hex-upper' | 'base64';

export type TextInputEncoding = 'utf8' | 'hex' | 'base64';

export type WorkerInputPayload =
  | { kind: 'blob'; blob: Blob }
  | { kind: 'bytes'; bytes: Uint8Array }
  | { kind: 'text'; text: string; textEncoding: TextInputEncoding };

export type FieldInputKind = 'text' | 'file';

export interface HashFileAttachment {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly lastModified: number;
  readonly file?: File;
  readonly bytes?: Uint8Array;
}

export interface HashFieldEntry {
  readonly id: string;
  readonly label: string;
  readonly kind: FieldInputKind;
  readonly text: string;
  readonly textEncoding: TextInputEncoding;
  readonly file: HashFileAttachment | null;
  readonly digests: Partial<Record<HashAlgorithmId, string>>;
  readonly byteLength: number | null;
  readonly error: string | null;
  readonly computing: boolean;
}

export interface ParsedExpectedHash {
  readonly raw: string;
  readonly cleaned: string;
  readonly extractedFilename: string | null;
  readonly format: 'hex' | 'base64' | 'unknown' | 'empty';
  readonly bytes: Uint8Array | null;
  readonly hexLower: string | null;
  readonly bitLength: number | null;
  readonly candidateAlgorithms: readonly HashAlgorithmId[];
}

export interface VerifierMatch {
  readonly fieldId: string;
  readonly fieldLabel: string;
  readonly algorithm: HashAlgorithmId;
  readonly digest: string;
}

export interface VerificationSummary {
  readonly parsed: ParsedExpectedHash;
  readonly status: 'idle' | 'invalid' | 'waiting' | 'match' | 'mismatch';
  readonly matches: readonly VerifierMatch[];
  readonly missingCandidateAlgorithms: readonly HashAlgorithmId[];
}

export interface DigestGroup {
  readonly groupIndex: number;
  readonly fieldIds: readonly string[];
  readonly fieldLabels: readonly string[];
}

export interface CrossFieldSummary {
  readonly activeFieldIds: readonly string[];
  readonly groups: readonly DigestGroup[];
  readonly fieldMatchesByAlgorithm: Readonly<Record<string, Partial<Record<HashAlgorithmId, readonly string[]>>>>;
  readonly fieldGroupIndex: Readonly<Record<string, number>>;
  readonly allIdentical: boolean;
  readonly allDistinct: boolean;
}

export interface DiffSegment {
  readonly text: string;
  readonly same: boolean;
}
