import React from 'react';

import {
  buildChmodCommand,
  permissionsToLsString,
} from '../../lib/chmod/permissions';
import type {
  ChmodPermissions,
  CommandNotation,
  PermissionAnalysis,
  TargetKind,
} from '../../lib/chmod/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Chmod.module.css';

interface CommandOutputPanelProps {
  permissions: ChmodPermissions;
  analysis: PermissionAnalysis;
  target: string;
  targetKind: TargetKind;
  recursive: boolean;
  verbose: boolean;
  notation: CommandNotation;
  onTargetChange: (value: string) => void;
  onTargetKindChange: (kind: TargetKind) => void;
  onRecursiveChange: (next: boolean) => void;
  onVerboseChange: (next: boolean) => void;
  onNotationChange: (notation: CommandNotation) => void;
}

type CopySlot = 'octal' | 'symbolic' | 'command';

export default function CommandOutputPanel({
  permissions,
  analysis,
  target,
  targetKind,
  recursive,
  verbose,
  notation,
  onTargetChange,
  onTargetKindChange,
  onRecursiveChange,
  onVerboseChange,
  onNotationChange,
}: CommandOutputPanelProps) {
  const { t } = useI18n();
  const targetId = React.useId();
  const [copiedSlot, setCopiedSlot] = React.useState<CopySlot | null>(null);
  const copyTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const command = React.useMemo(
    () =>
      buildChmodCommand(permissions, {
        target,
        recursive,
        verbose,
        notation,
      }),
    [permissions, target, recursive, verbose, notation],
  );

  const lsPreview = React.useMemo(
    () => permissionsToLsString(permissions, targetKind),
    [permissions, targetKind],
  );

  const copyText = React.useCallback((slot: CopySlot, text: string) => {
    const finish = () => {
      setCopiedSlot(slot);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedSlot((prev) => (prev === slot ? null : prev));
      }, 1800);
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(finish, finish);
      return;
    }

    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    } catch {
      // ignore fallback error
    }
    finish();
  }, []);

  return (
    <section className={styles.card} aria-label={t('chmod.summary.title')}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('chmod.summary.title')}</h2>
      </div>

      <div className={styles.outputRows}>
        <div className={styles.commandHero}>
          <div className={styles.commandHeroTop}>
            <span className={styles.commandLabel}>{t('chmod.summary.command')}</span>
            <button
              type="button"
              className={[styles.copyBtn, copiedSlot === 'command' ? styles.copyBtnCopied : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => copyText('command', command)}
              aria-label={t('chmod.summary.copyCommandAria')}
            >
              {copiedSlot === 'command' ? t('chmod.summary.copied') : t('chmod.summary.copy')}
            </button>
          </div>
          <code className={styles.commandCode} data-testid="chmod-final-command">
            {command}
          </code>
        </div>

        <div className={styles.notationPair}>
          <div className={styles.outputRow}>
            <div className={styles.outputMeta}>
              <div className={styles.outputRowTop}>
                <span className={styles.outputLabel}>{t('chmod.summary.octal')}</span>
                <button
                  type="button"
                  className={[styles.copyBtn, copiedSlot === 'octal' ? styles.copyBtnCopied : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => copyText('octal', analysis.octalDisplay)}
                  aria-label={t('chmod.summary.copyOctalAria')}
                >
                  {copiedSlot === 'octal' ? t('chmod.summary.copied') : t('chmod.summary.copy')}
                </button>
              </div>
              <span className={styles.outputValueBig} data-testid="chmod-octal-value">
                {analysis.octalDisplay}
              </span>
              <span className={styles.outputValueSub}>
                {analysis.hasSpecialBits
                  ? analysis.binary
                  : `${analysis.octal4} · ${analysis.binary}`}
              </span>
            </div>
          </div>

          <div className={styles.outputRow}>
            <div className={styles.outputMeta}>
              <div className={styles.outputRowTop}>
                <span className={styles.outputLabel}>{t('chmod.summary.symbolic')}</span>
                <button
                  type="button"
                  className={[styles.copyBtn, copiedSlot === 'symbolic' ? styles.copyBtnCopied : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => copyText('symbolic', analysis.symbolic)}
                  aria-label={t('chmod.summary.copySymbolicAria')}
                >
                  {copiedSlot === 'symbolic' ? t('chmod.summary.copied') : t('chmod.summary.copy')}
                </button>
              </div>
              <span className={styles.outputValueBig} data-testid="chmod-symbolic-value">
                {analysis.symbolic}
              </span>
              <span className={styles.outputValueSub}>
                {lsPreview} · {analysis.symbolicClause}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.commandControls}>
        <div className={styles.targetField}>
          <label htmlFor={targetId} className={styles.fieldLabel}>
            {t('chmod.summary.targetLabel')}
          </label>
          <input
            id={targetId}
            type="text"
            className={styles.textInput}
            value={target}
            onChange={(event) => onTargetChange(event.target.value)}
            placeholder={t('chmod.summary.targetPlaceholder')}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className={styles.optionsBar}>
          <div className={styles.flagGroup}>
            <label className={styles.inlineCheck}>
              <input
                type="checkbox"
                checked={recursive}
                onChange={(event) => onRecursiveChange(event.target.checked)}
              />
              <span>{t('chmod.summary.flagRecursive')}</span>
            </label>

            <label className={styles.inlineCheck}>
              <input
                type="checkbox"
                checked={verbose}
                onChange={(event) => onVerboseChange(event.target.checked)}
              />
              <span>{t('chmod.summary.flagVerbose')}</span>
            </label>
          </div>

          <div
            className={styles.segmented}
            role="group"
            aria-label={t('chmod.summary.notationLabel')}
          >
            <button
              type="button"
              aria-pressed={notation === 'octal'}
              className={[styles.segBtn, notation === 'octal' ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onNotationChange('octal')}
            >
              {t('chmod.summary.notationOctal')}
            </button>
            <button
              type="button"
              aria-pressed={notation === 'symbolic'}
              className={[styles.segBtn, notation === 'symbolic' ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onNotationChange('symbolic')}
            >
              {t('chmod.summary.notationSymbolic')}
            </button>
          </div>
        </div>

        <div className={styles.optionsBar}>
          <span className={styles.fieldLabel}>{t('chmod.summary.targetKindLabel')}</span>
          <div
            className={styles.segmented}
            role="group"
            aria-label={t('chmod.summary.targetKindLabel')}
          >
            <button
              type="button"
              aria-pressed={targetKind === 'file'}
              className={[styles.segBtn, targetKind === 'file' ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onTargetKindChange('file')}
            >
              {t('chmod.summary.kindFile')}
            </button>
            <button
              type="button"
              aria-pressed={targetKind === 'directory'}
              className={[styles.segBtn, targetKind === 'directory' ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onTargetKindChange('directory')}
            >
              {t('chmod.summary.kindDirectory')}
            </button>
          </div>
        </div>
      </div>

      {analysis.warnings.length > 0 && (
        <div className={styles.warningList} role="status" aria-live="polite">
          {analysis.warnings.map((code) => {
            const isDanger = code === 'world_writable_all' || code === 'world_writable';
            return (
              <div
                key={code}
                className={[styles.warningBanner, isDanger ? styles.warningDanger : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {t(`chmod.warn.${code}` as const)}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
