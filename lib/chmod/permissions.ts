import type {
  ChmodCommandOptions,
  ChmodPermissions,
  ChmodPreset,
  ParsePermissionResult,
  PermissionAnalysis,
  PermissionRight,
  PermissionRole,
  RolePermissions,
  SecurityWarningCode,
  SpecialBitKey,
  SpecialBits,
  TargetKind,
} from './types';

export const PERMISSION_ROLES: readonly PermissionRole[] = ['owner', 'group', 'others'] as const;

export const PERMISSION_RIGHTS: readonly PermissionRight[] = ['read', 'write', 'execute'] as const;

export const SPECIAL_BIT_KEYS: readonly SpecialBitKey[] = ['setuid', 'setgid', 'sticky'] as const;

export const RIGHT_WEIGHTS: Readonly<Record<PermissionRight, number>> = {
  read: 4,
  write: 2,
  execute: 1,
};

export const SPECIAL_WEIGHTS: Readonly<Record<SpecialBitKey, number>> = {
  setuid: 4,
  setgid: 2,
  sticky: 1,
};

export const DEFAULT_PERMISSIONS: ChmodPermissions = {
  owner: { read: true, write: true, execute: true },
  group: { read: true, write: false, execute: true },
  others: { read: true, write: false, execute: true },
  special: { setuid: false, setgid: false, sticky: false },
};

export const CHMOD_PRESETS: readonly ChmodPreset[] = [
  {
    id: '755',
    octal: '755',
    symbolic: 'rwxr-xr-x',
    category: 'directories',
    safety: 'standard',
    recommendedTarget: 'directory',
    sampleTarget: 'script.sh',
  },
  {
    id: '644',
    octal: '644',
    symbolic: 'rw-r--r--',
    category: 'files',
    safety: 'standard',
    recommendedTarget: 'file',
    sampleTarget: 'index.html',
  },
  {
    id: '600',
    octal: '600',
    symbolic: 'rw-------',
    category: 'private',
    safety: 'private',
    recommendedTarget: 'file',
    sampleTarget: '~/.ssh/id_ed25519',
  },
  {
    id: '700',
    octal: '700',
    symbolic: 'rwx------',
    category: 'private',
    safety: 'private',
    recommendedTarget: 'directory',
    sampleTarget: '~/.ssh',
  },
  {
    id: '640',
    octal: '640',
    symbolic: 'rw-r-----',
    category: 'private',
    safety: 'private',
    recommendedTarget: 'file',
    sampleTarget: 'config.env',
  },
  {
    id: '750',
    octal: '750',
    symbolic: 'rwxr-x---',
    category: 'directories',
    safety: 'shared',
    recommendedTarget: 'directory',
    sampleTarget: '/srv/app',
  },
  {
    id: '664',
    octal: '664',
    symbolic: 'rw-rw-r--',
    category: 'files',
    safety: 'shared',
    recommendedTarget: 'file',
    sampleTarget: 'notes.md',
  },
  {
    id: '775',
    octal: '775',
    symbolic: 'rwxrwxr-x',
    category: 'directories',
    safety: 'shared',
    recommendedTarget: 'directory',
    sampleTarget: '/var/www/shared',
  },
  {
    id: '400',
    octal: '400',
    symbolic: 'r--------',
    category: 'private',
    safety: 'private',
    recommendedTarget: 'file',
    sampleTarget: 'server.pem',
  },
  {
    id: '1777',
    octal: '1777',
    symbolic: 'rwxrwxrwt',
    category: 'special',
    safety: 'special',
    recommendedTarget: 'directory',
    sampleTarget: '/tmp/shared',
  },
  {
    id: '2775',
    octal: '2775',
    symbolic: 'rwxrwsr-x',
    category: 'special',
    safety: 'special',
    recommendedTarget: 'directory',
    sampleTarget: '/srv/team',
  },
  {
    id: '777',
    octal: '777',
    symbolic: 'rwxrwxrwx',
    category: 'special',
    safety: 'caution',
    recommendedTarget: 'file',
    sampleTarget: 'filename',
  },
];

export function roleToOctalDigit(role: RolePermissions): number {
  return (role.read ? 4 : 0) + (role.write ? 2 : 0) + (role.execute ? 1 : 0);
}

export function octalDigitToRole(digit: number): RolePermissions {
  const clamped = digit & 7;
  return {
    read: (clamped & 4) !== 0,
    write: (clamped & 2) !== 0,
    execute: (clamped & 1) !== 0,
  };
}

export function specialBitsToDigit(special: SpecialBits): number {
  return (special.setuid ? 4 : 0) + (special.setgid ? 2 : 0) + (special.sticky ? 1 : 0);
}

export function digitToSpecialBits(digit: number): SpecialBits {
  const clamped = digit & 7;
  return {
    setuid: (clamped & 4) !== 0,
    setgid: (clamped & 2) !== 0,
    sticky: (clamped & 1) !== 0,
  };
}

export function hasAnySpecialBit(special: SpecialBits): boolean {
  return special.setuid || special.setgid || special.sticky;
}

export function permissionsToOctal(perms: ChmodPermissions, forceFourDigits = false): string {
  const s = specialBitsToDigit(perms.special);
  const u = roleToOctalDigit(perms.owner);
  const g = roleToOctalDigit(perms.group);
  const o = roleToOctalDigit(perms.others);
  if (forceFourDigits || s > 0) {
    return `${s}${u}${g}${o}`;
  }
  return `${u}${g}${o}`;
}

export function roleToSymbolicTriplet(
  role: RolePermissions,
  specialFlag = false,
  specialChar: 's' | 't' = 's',
): string {
  const r = role.read ? 'r' : '-';
  const w = role.write ? 'w' : '-';
  let x = role.execute ? 'x' : '-';
  if (specialFlag) {
    x = role.execute ? specialChar : specialChar.toUpperCase();
  }
  return `${r}${w}${x}`;
}

export function permissionsToSymbolic(perms: ChmodPermissions): string {
  const u = roleToSymbolicTriplet(perms.owner, perms.special.setuid, 's');
  const g = roleToSymbolicTriplet(perms.group, perms.special.setgid, 's');
  const o = roleToSymbolicTriplet(perms.others, perms.special.sticky, 't');
  return `${u}${g}${o}`;
}

export function permissionsToLsString(perms: ChmodPermissions, targetKind: TargetKind): string {
  const prefix = targetKind === 'directory' ? 'd' : '-';
  return `${prefix}${permissionsToSymbolic(perms)}`;
}

function roleToClauseLetters(role: RolePermissions, extra?: 's' | 't'): string {
  let out = '';
  if (role.read) out += 'r';
  if (role.write) out += 'w';
  if (role.execute) out += 'x';
  if (extra) out += extra;
  return out;
}

export function permissionsToSymbolicClause(perms: ChmodPermissions): string {
  const uLetters = roleToClauseLetters(perms.owner, perms.special.setuid ? 's' : undefined);
  const gLetters = roleToClauseLetters(perms.group, perms.special.setgid ? 's' : undefined);
  const oLetters = roleToClauseLetters(perms.others, perms.special.sticky ? 't' : undefined);
  const base = `u=${uLetters},g=${gLetters},o=${oLetters}`;
  return base;
}

function digitToBin3(digit: number): string {
  return (digit & 7).toString(2).padStart(3, '0');
}

export function permissionsToBinary(perms: ChmodPermissions): string {
  const s = specialBitsToDigit(perms.special);
  const u = roleToOctalDigit(perms.owner);
  const g = roleToOctalDigit(perms.group);
  const o = roleToOctalDigit(perms.others);
  if (s > 0) {
    return `${digitToBin3(s)} ${digitToBin3(u)} ${digitToBin3(g)} ${digitToBin3(o)}`;
  }
  return `${digitToBin3(u)} ${digitToBin3(g)} ${digitToBin3(o)}`;
}

export function togglePermissionRight(
  perms: ChmodPermissions,
  role: PermissionRole,
  right: PermissionRight,
): ChmodPermissions {
  return {
    ...perms,
    [role]: {
      ...perms[role],
      [right]: !perms[role][right],
    },
  };
}

export function setRoleAllRights(
  perms: ChmodPermissions,
  role: PermissionRole,
  enabled: boolean,
): ChmodPermissions {
  return {
    ...perms,
    [role]: {
      read: enabled,
      write: enabled,
      execute: enabled,
    },
  };
}

export function toggleSpecialBit(perms: ChmodPermissions, bit: SpecialBitKey): ChmodPermissions {
  return {
    ...perms,
    special: {
      ...perms.special,
      [bit]: !perms.special[bit],
    },
  };
}

export function permissionsEqual(a: ChmodPermissions, b: ChmodPermissions): boolean {
  return permissionsToOctal(a, true) === permissionsToOctal(b, true);
}

const SAFE_SHELL_TOKEN_RE = /^[A-Za-z0-9_./~:@%+=,-]+$/;

export function quoteShellTarget(rawTarget: string): string {
  const trimmed = rawTarget.trim();
  if (!trimmed) return 'filename';
  if (SAFE_SHELL_TOKEN_RE.test(trimmed)) return trimmed;
  // Single-quote shell escaping: ' -> '\''
  return `'${trimmed.replace(/'/g, "'\\''")}'`;
}

export function buildChmodCommand(perms: ChmodPermissions, options: ChmodCommandOptions): string {
  const parts: string[] = ['chmod'];
  const flagChars: string[] = [];
  if (options.recursive) flagChars.push('R');
  if (options.verbose) flagChars.push('v');
  if (flagChars.length > 0) {
    parts.push(`-${flagChars.join('')}`);
  }
  const mode =
    options.notation === 'symbolic'
      ? permissionsToSymbolicClause(perms)
      : permissionsToOctal(perms, Boolean(options.alwaysFourDigits));
  parts.push(mode);
  parts.push(quoteShellTarget(options.target));
  return parts.join(' ');
}

function parseSymbolicNine(nine: string): ChmodPermissions | null {
  if (nine.length !== 9) return null;
  const [ur, uw, ux, gr, gw, gx, or_, ow, ox] = nine;

  if (ur !== 'r' && ur !== '-') return null;
  if (uw !== 'w' && uw !== '-') return null;
  if (ux !== 'x' && ux !== '-' && ux !== 's' && ux !== 'S') return null;

  if (gr !== 'r' && gr !== '-') return null;
  if (gw !== 'w' && gw !== '-') return null;
  if (gx !== 'x' && gx !== '-' && gx !== 's' && gx !== 'S') return null;

  if (or_ !== 'r' && or_ !== '-') return null;
  if (ow !== 'w' && ow !== '-') return null;
  if (ox !== 'x' && ox !== '-' && ox !== 't' && ox !== 'T') return null;

  return {
    owner: {
      read: ur === 'r',
      write: uw === 'w',
      execute: ux === 'x' || ux === 's',
    },
    group: {
      read: gr === 'r',
      write: gw === 'w',
      execute: gx === 'x' || gx === 's',
    },
    others: {
      read: or_ === 'r',
      write: ow === 'w',
      execute: ox === 'x' || ox === 't',
    },
    special: {
      setuid: ux === 's' || ux === 'S',
      setgid: gx === 's' || gx === 'S',
      sticky: ox === 't' || ox === 'T',
    },
  };
}

function parseOctalString(token: string): ParsePermissionResult {
  if (!/^\d+$/.test(token)) {
    return { ok: false, errorCode: 'invalid_format', detail: token };
  }
  if (token.length !== 3 && token.length !== 4) {
    return { ok: false, errorCode: 'invalid_length', detail: token };
  }
  const badDigit = token.match(/[89]/);
  if (badDigit) {
    return { ok: false, errorCode: 'invalid_octal_digit', detail: badDigit[0] };
  }

  const digits = token.split('').map((d) => Number.parseInt(d, 10));
  const [s, u, g, o] = digits.length === 4 ? digits : [0, digits[0], digits[1], digits[2]];
  const permissions: ChmodPermissions = {
    special: digitToSpecialBits(s),
    owner: octalDigitToRole(u),
    group: octalDigitToRole(g),
    others: octalDigitToRole(o),
  };

  return {
    ok: true,
    permissions,
    format: digits.length === 4 ? 'octal4' : 'octal3',
    normalizedOctal: permissionsToOctal(permissions),
  };
}

export function parsePermissionInput(raw: string): ParsePermissionResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, errorCode: 'empty' };
  }

  // Support pasting a full chmod command, e.g. `chmod -R 755 /var/www/html`
  if (/^(?:sudo\s+)?chmod\s+/i.test(trimmed)) {
    const withoutPrefix = trimmed.replace(/^(?:sudo\s+)?chmod\s+/i, '').trim();
    const tokens = withoutPrefix.split(/\s+/).filter(Boolean);
    let recursive = false;
    let verbose = false;
    let modeToken: string | null = null;
    const remainingTargets: string[] = [];

    for (const tok of tokens) {
      if (!modeToken && tok.startsWith('-') && tok.length > 1 && !/^-[r-][w-]/.test(tok)) {
        if (tok === '--recursive') recursive = true;
        else if (tok === '--verbose') verbose = true;
        else if (/^-[A-Za-z]+$/.test(tok)) {
          if (tok.includes('R')) recursive = true;
          if (tok.includes('v')) verbose = true;
        }
        continue;
      }
      if (!modeToken) {
        modeToken = tok;
      } else {
        remainingTargets.push(tok);
      }
    }

    if (!modeToken) {
      return { ok: false, errorCode: 'invalid_format', detail: trimmed };
    }

    const inner = parsePermissionInput(modeToken);
    if (!inner.ok) return inner;

    const extractedTarget = remainingTargets.length > 0 ? remainingTargets.join(' ') : undefined;
    return {
      ...inner,
      format: 'command',
      extractedTarget,
      extractedRecursive: recursive || undefined,
      extractedVerbose: verbose || undefined,
    };
  }

  // Pure numeric input (octal 3 or 4 digits)
  if (/^\d+$/.test(trimmed)) {
    return parseOctalString(trimmed);
  }

  // 10-char ls -l format (e.g. -rwxr-xr-x or drwxr-xr-x or lrwxrwxrwx)
  if (trimmed.length === 10 && /^[-dlbcps]/.test(trimmed)) {
    const parsed = parseSymbolicNine(trimmed.slice(1));
    if (parsed) {
      const inferredTargetKind: TargetKind = trimmed[0] === 'd' ? 'directory' : 'file';
      return {
        ok: true,
        permissions: parsed,
        format: 'symbolic',
        normalizedOctal: permissionsToOctal(parsed),
        inferredTargetKind,
      };
    }
    return { ok: false, errorCode: 'invalid_symbolic', detail: trimmed };
  }

  // 9-char symbolic format (e.g. rwxr-xr-x, rw-r--r--, rwsr-xr-x)
  if (trimmed.length === 9 && /^[rwxstST-]+$/.test(trimmed)) {
    const parsed = parseSymbolicNine(trimmed);
    if (parsed) {
      return {
        ok: true,
        permissions: parsed,
        format: 'symbolic',
        normalizedOctal: permissionsToOctal(parsed),
      };
    }
    return { ok: false, errorCode: 'invalid_symbolic', detail: trimmed };
  }

  // Partial or malformed symbolic characters
  if (/^[rwxstSTd-]+$/.test(trimmed)) {
    return { ok: false, errorCode: 'invalid_symbolic', detail: trimmed };
  }

  return { ok: false, errorCode: 'invalid_format', detail: trimmed };
}

export function analyzePermissions(perms: ChmodPermissions): PermissionAnalysis {
  const octal3 = `${roleToOctalDigit(perms.owner)}${roleToOctalDigit(perms.group)}${roleToOctalDigit(perms.others)}`;
  const octal4 = permissionsToOctal(perms, true);
  const hasSpecialBits = hasAnySpecialBit(perms.special);
  const octalDisplay = hasSpecialBits ? octal4 : octal3;
  const symbolic = permissionsToSymbolic(perms);
  const symbolicClause = permissionsToSymbolicClause(perms);
  const binary = permissionsToBinary(perms);

  const matched = CHMOD_PRESETS.find((p) => p.octal === octalDisplay) ?? null;

  const warnings: SecurityWarningCode[] = [];
  if (octal3 === '777' && !perms.special.sticky) {
    warnings.push('world_writable_all');
  } else if (perms.others.write && !perms.special.sticky) {
    warnings.push('world_writable');
  }

  if (octal4 === '0000') {
    warnings.push('no_permissions');
  } else if (roleToOctalDigit(perms.owner) === 0 && (roleToOctalDigit(perms.group) > 0 || roleToOctalDigit(perms.others) > 0)) {
    warnings.push('owner_locked_out');
  }

  if (perms.special.setuid) {
    warnings.push('setuid_active');
  }
  if (perms.special.setgid) {
    warnings.push('setgid_active');
  }

  return {
    hasSpecialBits,
    octal3,
    octal4,
    octalDisplay,
    symbolic,
    symbolicClause,
    binary,
    matchedPresetId: matched?.id ?? null,
    warnings,
  };
}

export const OCTAL_GUIDE_ROWS: readonly {
  digit: number;
  binary: string;
  symbolic: string;
  read: boolean;
  write: boolean;
  execute: boolean;
}[] = [0, 1, 2, 3, 4, 5, 6, 7].map((digit) => {
  const role = octalDigitToRole(digit);
  return {
    digit,
    binary: digitToBin3(digit),
    symbolic: roleToSymbolicTriplet(role),
    read: role.read,
    write: role.write,
    execute: role.execute,
  };
});
