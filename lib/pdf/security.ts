// PDF encryption inspection, password protection, and decryption (unlocking) via @cantoo/pdf-lib.
import { PDFDict, PDFDocument, PDFName, PDFNumber } from '@cantoo/pdf-lib';

import { N, nameOf, num, removeUnusedObjects } from './objects';

export type ProtectAlgorithm = 'aes256' | 'aes128';

export interface ProtectPermissions {
  printing?: 'highResolution' | 'lowResolution' | false;
  modifying?: boolean;
  copying?: boolean;
  annotating?: boolean;
  fillingForms?: boolean;
  contentAccessibility?: boolean;
  documentAssembly?: boolean;
}

export interface ProtectOptions {
  userPassword?: string;
  ownerPassword?: string;
  algorithm?: ProtectAlgorithm;
  permissions?: ProtectPermissions;
}

export interface SecurityInfo {
  isEncrypted: boolean;
  needsPassword: boolean;
  passwordAccepted: boolean;
  version: number | null;
  revision: number | null;
  keyBits: number | null;
  algorithm: string | null;
  filter: string | null;
}

export interface UnlockResult {
  bytes: Uint8Array;
  wasEncrypted: boolean;
}

function generateStrongPassword(length = 24): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[buf[i] % alphabet.length];
  }
  return out;
}

function hasRestrictedPermissions(perms?: ProtectPermissions): boolean {
  if (!perms) return false;
  if (perms.printing !== undefined && perms.printing !== 'highResolution') return true;
  if (perms.modifying === false) return true;
  if (perms.copying === false) return true;
  if (perms.annotating === false) return true;
  if (perms.fillingForms === false) return true;
  if (perms.contentAccessibility === false) return true;
  if (perms.documentAssembly === false) return true;
  return false;
}

function describeEncryption(encryptDict: PDFDict): {
  version: number | null;
  revision: number | null;
  keyBits: number | null;
  algorithm: string | null;
  filter: string | null;
} {
  const vRaw = encryptDict.lookup(N('V'));
  const rRaw = encryptDict.lookup(N('R'));
  const lenRaw = encryptDict.lookup(N('Length'));
  const version = vRaw instanceof PDFNumber ? vRaw.asNumber() : null;
  const revision = rRaw instanceof PDFNumber ? rRaw.asNumber() : null;
  let keyBits = lenRaw instanceof PDFNumber ? lenRaw.asNumber() : null;
  const filter = nameOf(encryptDict, 'Filter') ?? null;

  let cfm: string | undefined;
  const cf = encryptDict.lookup(N('CF'));
  if (cf instanceof PDFDict) {
    const stmF = nameOf(encryptDict, 'StmF') ?? 'StdCF';
    const targetCf = cf.lookup(N(stmF)) ?? cf.lookup(N('StdCF'));
    if (targetCf instanceof PDFDict) {
      cfm = nameOf(targetCf, 'CFM');
      if (keyBits === null) {
        const cfLen = num(targetCf, 'Length', -1);
        if (cfLen > 0) keyBits = cfLen <= 32 ? cfLen * 8 : cfLen;
      }
    }
  }

  let algorithm: string | null = null;
  if (version === 5 || cfm === 'AESV3') {
    algorithm = 'AES-256';
    if (keyBits === null) keyBits = 256;
  } else if (cfm === 'AESV2') {
    algorithm = 'AES-128';
    if (keyBits === null) keyBits = 128;
  } else if (version === 4 && cfm === 'V2') {
    algorithm = 'RC4-128';
    if (keyBits === null) keyBits = 128;
  } else if (version === 2) {
    algorithm = keyBits === 40 ? 'RC4-40' : 'RC4-128';
    if (keyBits === null) keyBits = 128;
  } else if (version === 1) {
    algorithm = 'RC4-40';
    if (keyBits === null) keyBits = 40;
  } else if (version !== null) {
    algorithm = `Standard V${version}`;
  }

  return { version, revision, keyBits, algorithm, filter };
}

/**
 * Inspects whether a PDF is encrypted, whether an open password is required, and basic /Encrypt details.
 */
export async function inspectSecurity(bytes: Uint8Array, password?: string): Promise<SecurityInfo> {
  const probe = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const encryptObj = probe.context.lookup(probe.context.trailerInfo.Encrypt);
  if (!(encryptObj instanceof PDFDict)) {
    return {
      isEncrypted: false,
      needsPassword: false,
      passwordAccepted: true,
      version: null,
      revision: null,
      keyBits: null,
      algorithm: null,
      filter: null,
    };
  }

  const details = describeEncryption(encryptObj);

  let emptyWorks = false;
  try {
    await PDFDocument.load(bytes, { updateMetadata: false, password: '' });
    emptyWorks = true;
  } catch {
    emptyWorks = false;
  }

  const needsPassword = !emptyWorks;
  let passwordAccepted = false;
  if (password !== undefined) {
    if (password === '' && emptyWorks) {
      passwordAccepted = true;
    } else {
      try {
        await PDFDocument.load(bytes, { updateMetadata: false, password });
        passwordAccepted = true;
      } catch {
        passwordAccepted = false;
      }
    }
  } else {
    passwordAccepted = emptyWorks;
  }

  return {
    isEncrypted: true,
    needsPassword,
    passwordAccepted,
    ...details,
  };
}

/**
 * Encrypts a PDF with user/owner passwords, AES-256 (default) or AES-128, and granular permissions.
 */
export async function protectPdf(
  bytes: Uint8Array,
  options: ProtectOptions,
  password?: string,
): Promise<Uint8Array> {
  const userPwd = options.userPassword ?? '';
  const restricted = hasRestrictedPermissions(options.permissions);

  if (!userPwd && !options.ownerPassword && !restricted) {
    throw new Error('Specify a user password, an owner password, or at least one permission restriction.');
  }

  let ownerPwd = options.ownerPassword;
  if (!ownerPwd) {
    if (restricted || !userPwd) {
      ownerPwd = generateStrongPassword(24);
    } else {
      ownerPwd = userPwd;
    }
  }

  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });

  // Drop stale encryption references and unreachable objects before applying fresh encryption.
  delete doc.context.trailerInfo.Encrypt;
  doc.context.security = undefined;
  removeUnusedObjects(doc.context);

  const algorithm = options.algorithm === 'aes128' ? 'AES-128' : 'AES-256';
  const permissions = options.permissions
    ? {
        printing: options.permissions.printing ?? 'highResolution',
        modifying: options.permissions.modifying ?? true,
        copying: options.permissions.copying ?? true,
        annotating: options.permissions.annotating ?? true,
        fillingForms: options.permissions.fillingForms ?? true,
        contentAccessibility: options.permissions.contentAccessibility ?? true,
        documentAssembly: options.permissions.documentAssembly ?? true,
      }
    : undefined;

  doc.encrypt({
    userPassword: userPwd,
    ownerPassword: ownerPwd,
    algorithm,
    permissions,
  });

  return doc.save({
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
}

/**
 * Unlocks (decrypts) an encrypted PDF using the provided password and saves a clean unencrypted PDF.
 */
export async function unlockPdf(bytes: Uint8Array, password: string): Promise<UnlockResult> {
  const probe = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const wasEncrypted = probe.context.lookup(probe.context.trailerInfo.Encrypt) instanceof PDFDict;

  const doc = await PDFDocument.load(bytes, {
    updateMetadata: false,
    password: wasEncrypted ? (password ?? '') : undefined,
  });

  // Remove encryption trailer entry, security handler, and any orphaned /Encrypt or /XRef objects.
  delete doc.context.trailerInfo.Encrypt;
  doc.context.security = undefined;
  // Clean up /Extensions /ADBE if only added for AES-256 and no longer needed is optional; keep catalog intact.
  if (wasEncrypted) {
    // Also remove any leftover /Encrypt indirect dicts that might still linger in context.
    removeUnusedObjects(doc.context);
    for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict && obj.lookup(N('Filter')) instanceof PDFName) {
        const filterName = nameOf(obj, 'Filter');
        if (filterName === 'Standard' && (obj.has(N('O')) || obj.has(N('U')))) {
          doc.context.delete(ref);
        }
      }
    }
  } else {
    removeUnusedObjects(doc.context);
  }

  const outBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });

  return {
    bytes: outBytes,
    wasEncrypted,
  };
}
