import React from 'react';

import {
  analyzePermissions,
  DEFAULT_PERMISSIONS,
  hasAnySpecialBit,
  parsePermissionInput,
  permissionsToOctal,
  permissionsToSymbolic,
  setRoleAllRights,
  togglePermissionRight,
  toggleSpecialBit,
} from '../../lib/chmod/permissions';
import type {
  ChmodPermissions,
  ChmodPreset,
  CommandNotation,
  ParseErrorCode,
  PermissionRight,
  PermissionRole,
  SpecialBitKey,
  TargetKind,
} from '../../lib/chmod/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Chmod.module.css';
import CodeInputBar from './CodeInputBar';
import CommandOutputPanel from './CommandOutputPanel';
import PermissionsMatrix from './PermissionsMatrix';
import PresetsSection from './PresetsSection';

const EMPTY_PERMISSIONS: ChmodPermissions = {
  owner: { read: false, write: false, execute: false },
  group: { read: false, write: false, execute: false },
  others: { read: false, write: false, execute: false },
  special: { setuid: false, setgid: false, sticky: false },
};

interface ChmodWorkbenchProps {
  quickMode: boolean;
}

export default function ChmodWorkbench({ quickMode }: ChmodWorkbenchProps) {
  const { t } = useI18n();

  const [permissions, setPermissions] = React.useState<ChmodPermissions>(DEFAULT_PERMISSIONS);
  const [codeInput, setCodeInput] = React.useState<string>('755');
  const [inputError, setInputError] = React.useState<{
    code: ParseErrorCode;
    detail?: string;
  } | null>(null);
  const [appliedNote, setAppliedNote] = React.useState<string | null>(null);

  const [target, setTarget] = React.useState<string>('filename');
  const [targetKind, setTargetKind] = React.useState<TargetKind>('file');
  const [recursive, setRecursive] = React.useState<boolean>(false);
  const [verbose, setVerbose] = React.useState<boolean>(false);
  const [notation, setNotation] = React.useState<CommandNotation>('octal');
  const [specialOpen, setSpecialOpen] = React.useState<boolean>(false);

  const analysis = React.useMemo(() => analyzePermissions(permissions), [permissions]);

  const syncFromPermissions = React.useCallback((next: ChmodPermissions) => {
    setPermissions(next);
    setCodeInput(permissionsToOctal(next));
    setInputError(null);
    setAppliedNote(null);
  }, []);

  const handleToggleRight = React.useCallback((role: PermissionRole, right: PermissionRight) => {
    setPermissions((prev) => {
      const next = togglePermissionRight(prev, role, right);
      setCodeInput(permissionsToOctal(next));
      setInputError(null);
      setAppliedNote(null);
      return next;
    });
  }, []);

  const handleToggleRowAll = React.useCallback((role: PermissionRole) => {
    setPermissions((prev) => {
      const r = prev[role];
      const allOn = r.read && r.write && r.execute;
      const next = setRoleAllRights(prev, role, !allOn);
      setCodeInput(permissionsToOctal(next));
      setInputError(null);
      setAppliedNote(null);
      return next;
    });
  }, []);

  const handleToggleSpecial = React.useCallback((bit: SpecialBitKey) => {
    setPermissions((prev) => {
      const next = toggleSpecialBit(prev, bit);
      setCodeInput(permissionsToOctal(next));
      setInputError(null);
      setAppliedNote(null);
      return next;
    });
  }, []);

  const handleClearAll = React.useCallback(() => {
    syncFromPermissions(EMPTY_PERMISSIONS);
  }, [syncFromPermissions]);

  const handleReset = React.useCallback(() => {
    syncFromPermissions(DEFAULT_PERMISSIONS);
    setTarget('filename');
    setTargetKind('file');
    setRecursive(false);
    setVerbose(false);
    setNotation('octal');
    setSpecialOpen(false);
  }, [syncFromPermissions]);

  const handleCodeChange = React.useCallback(
    (raw: string) => {
      setCodeInput(raw);
      const trimmed = raw.trim();
      if (!trimmed) {
        setInputError(null);
        setAppliedNote(null);
        return;
      }

      const parsed = parsePermissionInput(trimmed);
      if (parsed.ok) {
        setPermissions(parsed.permissions);
        setInputError(null);
        if (hasAnySpecialBit(parsed.permissions.special)) {
          setSpecialOpen(true);
        }
        if (parsed.extractedTarget) {
          setTarget(parsed.extractedTarget);
        }
        if (parsed.extractedRecursive !== undefined) {
          setRecursive(parsed.extractedRecursive);
        }
        if (parsed.extractedVerbose !== undefined) {
          setVerbose(parsed.extractedVerbose);
        }
        if (parsed.inferredTargetKind) {
          setTargetKind(parsed.inferredTargetKind);
        }
        setAppliedNote(
          t('chmod.decode.applied', {
            octal: permissionsToOctal(parsed.permissions),
            symbolic: permissionsToSymbolic(parsed.permissions),
          }),
        );
        return;
      }

      // Show immediate error for clearly invalid octal digits (8/9) or over-length numbers,
      // while letting the user finish typing 1-2 digits before flagging length unless Apply is pressed.
      if ('errorCode' in parsed) {
        if (
          parsed.errorCode === 'invalid_octal_digit' ||
          (parsed.errorCode === 'invalid_length' && /^\d{5,}$/.test(trimmed))
        ) {
          setInputError({ code: parsed.errorCode, detail: parsed.detail });
          setAppliedNote(null);
        } else {
          setInputError(null);
          setAppliedNote(null);
        }
      }
    },
    [t],
  );

  const handleCodeApply = React.useCallback(() => {
    const parsed = parsePermissionInput(codeInput);
    if ('errorCode' in parsed) {
      setInputError({ code: parsed.errorCode, detail: parsed.detail });
      setAppliedNote(null);
      return;
    }

    setPermissions(parsed.permissions);
    setCodeInput(parsed.normalizedOctal);
    setInputError(null);
    if (hasAnySpecialBit(parsed.permissions.special)) {
      setSpecialOpen(true);
    }
    if (parsed.extractedTarget) {
      setTarget(parsed.extractedTarget);
    }
    if (parsed.extractedRecursive !== undefined) {
      setRecursive(parsed.extractedRecursive);
    }
    if (parsed.extractedVerbose !== undefined) {
      setVerbose(parsed.extractedVerbose);
    }
    if (parsed.inferredTargetKind) {
      setTargetKind(parsed.inferredTargetKind);
    }
    setAppliedNote(
      t('chmod.decode.applied', {
        octal: parsed.normalizedOctal,
        symbolic: permissionsToSymbolic(parsed.permissions),
      }),
    );
  }, [codeInput, t]);

  const handleSelectPreset = React.useCallback(
    (preset: ChmodPreset) => {
      const parsed = parsePermissionInput(preset.octal);
      if (!parsed.ok) return;
      setPermissions(parsed.permissions);
      setCodeInput(preset.octal);
      setInputError(null);
      setTargetKind(preset.recommendedTarget);
      if (hasAnySpecialBit(parsed.permissions.special)) {
        setSpecialOpen(true);
      }
      setAppliedNote(
        t('chmod.decode.applied', {
          octal: preset.octal,
          symbolic: preset.symbolic,
        }),
      );
    },
    [t],
  );

  return (
    <div className={styles.workbenchStack}>
      <CodeInputBar
        value={codeInput}
        errorCode={inputError?.code ?? null}
        errorDetail={inputError?.detail}
        appliedNote={appliedNote}
        onChange={handleCodeChange}
        onApply={handleCodeApply}
        onReset={handleReset}
      />

      <div className={styles.topGrid}>
        <PermissionsMatrix
          permissions={permissions}
          analysis={analysis}
          targetKind={targetKind}
          quickMode={quickMode}
          specialOpen={specialOpen}
          onToggleSpecialOpen={() => setSpecialOpen((prev) => !prev)}
          onToggleRight={handleToggleRight}
          onToggleRowAll={handleToggleRowAll}
          onToggleSpecial={handleToggleSpecial}
          onClearAll={handleClearAll}
        />

        <CommandOutputPanel
          permissions={permissions}
          analysis={analysis}
          target={target}
          targetKind={targetKind}
          recursive={recursive}
          verbose={verbose}
          notation={notation}
          onTargetChange={setTarget}
          onTargetKindChange={setTargetKind}
          onRecursiveChange={setRecursive}
          onVerboseChange={setVerbose}
          onNotationChange={setNotation}
        />
      </div>

      <PresetsSection
        activePresetId={analysis.matchedPresetId}
        onSelectPreset={handleSelectPreset}
      />
    </div>
  );
}
