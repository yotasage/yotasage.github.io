export type PermissionRole = 'owner' | 'group' | 'others';

export type PermissionRight = 'read' | 'write' | 'execute';

export type SpecialBitKey = 'setuid' | 'setgid' | 'sticky';

export interface RolePermissions {
  read: boolean;
  write: boolean;
  execute: boolean;
}

export interface SpecialBits {
  setuid: boolean;
  setgid: boolean;
  sticky: boolean;
}

export interface ChmodPermissions {
  owner: RolePermissions;
  group: RolePermissions;
  others: RolePermissions;
  special: SpecialBits;
}

export type TargetKind = 'file' | 'directory';

export type CommandNotation = 'octal' | 'symbolic';

export interface ChmodCommandOptions {
  target: string;
  recursive: boolean;
  verbose: boolean;
  notation: CommandNotation;
  alwaysFourDigits?: boolean;
}

export type ParseErrorCode =
  | 'empty'
  | 'invalid_octal_digit'
  | 'invalid_length'
  | 'invalid_symbolic'
  | 'invalid_format';

export type ParsedInputFormat = 'octal3' | 'octal4' | 'symbolic' | 'command';

export type ParsePermissionResult =
  | {
      ok: true;
      permissions: ChmodPermissions;
      format: ParsedInputFormat;
      normalizedOctal: string;
      extractedTarget?: string;
      extractedRecursive?: boolean;
      extractedVerbose?: boolean;
      inferredTargetKind?: TargetKind;
    }
  | {
      ok: false;
      errorCode: ParseErrorCode;
      detail?: string;
    };

export type PresetCategory = 'files' | 'directories' | 'private' | 'special';

export type PresetSafety = 'standard' | 'private' | 'shared' | 'special' | 'caution';

export interface ChmodPreset {
  id: string;
  octal: string;
  symbolic: string;
  category: PresetCategory;
  safety: PresetSafety;
  recommendedTarget: TargetKind;
  sampleTarget: string;
}

export type SecurityWarningCode =
  | 'world_writable_all'
  | 'world_writable'
  | 'no_permissions'
  | 'setuid_active'
  | 'setgid_active'
  | 'owner_locked_out';

export interface PermissionAnalysis {
  hasSpecialBits: boolean;
  octal3: string;
  octal4: string;
  octalDisplay: string;
  symbolic: string;
  symbolicClause: string;
  binary: string;
  matchedPresetId: string | null;
  warnings: readonly SecurityWarningCode[];
}
