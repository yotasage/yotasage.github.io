// Trusted Network & Data Settings dialog (security.md §2.3, §7 W4 & W9, §10).

import { useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  buildNetworkPolicyUrl,
  PYTHON_MAX_SELECTED_HOSTS,
  validateSelectedHost,
} from '../../lib/python/network';
import type { NetworkMode, NetworkPolicy } from '../../lib/python/network';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PythonDialogs.module.css';
import { clearAllPythonData } from './clearData';

export interface NetworkDialogProps {
  open: boolean;
  currentPolicy: NetworkPolicy;
  onClose: () => void;
  onBeforeClear?: () => void | Promise<void>;
}

interface ParsedHostsState {
  readonly hosts: readonly string[];
  readonly error: string | null;
}

export default function NetworkDialog({
  open,
  currentPolicy,
  onClose,
  onBeforeClear,
}: NetworkDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  openRef.current = open;
  onCloseRef.current = onClose;

  const [selectedMode, setSelectedMode] = useState<NetworkMode>(currentPolicy.mode);
  const [hostsText, setHostsText] = useState(currentPolicy.hosts.join('\n'));
  const [allConfirmed, setAllConfirmed] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openRef.current) {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedMode(currentPolicy.mode);
    setHostsText(currentPolicy.hosts.join('\n'));
    setAllConfirmed(false);
    setClearConfirmOpen(false);
    setClearing(false);

    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cardRef.current?.focus();

    return () => {
      prev?.focus?.();
    };
  }, [open, currentPolicy]);

  const parsedHosts = useMemo<ParsedHostsState>(() => {
    const tokens = hostsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (tokens.length === 0) {
      return { hosts: [], error: t('python.netHostsEmpty') };
    }
    const valid: string[] = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      const res = validateSelectedHost(token);
      if (!res.ok) {
        const reason = 'reason' in res ? res.reason : 'Invalid hostname';
        return {
          hosts: [],
          error: t('python.netHostsInvalid', { host: token, reason }),
        };
      }
      if (!seen.has(res.host)) {
        seen.add(res.host);
        valid.push(res.host);
      }
    }
    if (valid.length > PYTHON_MAX_SELECTED_HOSTS) {
      return { hosts: [], error: t('python.netHostsMax') };
    }
    return { hosts: valid, error: null };
  }, [hostsText, t]);

  if (!open) return null;

  const currentNormalizedHosts = currentPolicy.hosts.join(',');
  const nextNormalizedHosts = selectedMode === 'hosts' ? parsedHosts.hosts.join(',') : '';
  const hasChanged =
    selectedMode !== currentPolicy.mode ||
    (selectedMode === 'hosts' && nextNormalizedHosts !== currentNormalizedHosts);

  const canApply =
    hasChanged &&
    (selectedMode === 'off' ||
      selectedMode === 'pkg' ||
      (selectedMode === 'hosts' && parsedHosts.error === null && parsedHosts.hosts.length > 0) ||
      (selectedMode === 'all' && allConfirmed));

  const w4Target =
    selectedMode === 'pkg'
      ? t('python.w4TargetPkg')
      : selectedMode === 'hosts'
        ? t('python.w4TargetHosts', { hosts: parsedHosts.hosts.join(', ') || '…' })
        : t('python.w4TargetAll');

  const handleApply = () => {
    if (!canApply) return;
    const nextPolicy: NetworkPolicy =
      selectedMode === 'hosts'
        ? { mode: 'hosts', hosts: parsedHosts.hosts }
        : { mode: selectedMode, hosts: [] };
    const url = buildNetworkPolicyUrl('/python/main', nextPolicy);
    window.location.assign(url);
  };

  const handleClearAll = async () => {
    setClearing(true);
    await clearAllPythonData({ beforeDelete: onBeforeClear });
  };

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="python-network-dialog"
        className={[styles.dialog, styles.dialogWide, selectedMode === 'all' ? styles.dialogDanger : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {t('python.netDialogTitle')}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('python.close')}
          >
            &times;
          </button>
        </div>

        <div className={styles.body}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{t('python.netModeLegend')}</legend>

            <label className={styles.radioCard}>
              <input
                type="radio"
                name="python-net-mode"
                value="off"
                checked={selectedMode === 'off'}
                onChange={() => setSelectedMode('off')}
              />
              <div>
                <div className={styles.radioTitle}>{t('python.netModeOffTitle')}</div>
                <div className={styles.radioDesc}>{t('python.netModeOffDesc')}</div>
              </div>
            </label>

            <label className={styles.radioCard}>
              <input
                type="radio"
                name="python-net-mode"
                value="pkg"
                checked={selectedMode === 'pkg'}
                onChange={() => setSelectedMode('pkg')}
              />
              <div>
                <div className={styles.radioTitle}>{t('python.netModePkgTitle')}</div>
                <div className={styles.radioDesc}>{t('python.netModePkgDesc')}</div>
              </div>
            </label>

            <label className={styles.radioCard}>
              <input
                type="radio"
                name="python-net-mode"
                value="hosts"
                checked={selectedMode === 'hosts'}
                onChange={() => setSelectedMode('hosts')}
              />
              <div>
                <div className={styles.radioTitle}>{t('python.netModeHostsTitle')}</div>
                <div className={styles.radioDesc}>{t('python.netModeHostsDesc')}</div>
              </div>
            </label>

            {selectedMode === 'hosts' && (
              <div className={styles.hostsBox}>
                <label className={styles.hostsLabel} htmlFor="python-net-hosts-input">
                  {t('python.netHostsLabel')}
                </label>
                <textarea
                  id="python-net-hosts-input"
                  className={styles.hostsTextarea}
                  rows={3}
                  value={hostsText}
                  onChange={(e) => setHostsText(e.target.value)}
                  placeholder={t('python.netHostsPlaceholder')}
                  spellCheck={false}
                  data-testid="python-net-hosts-input"
                />
                {parsedHosts.error && (
                  <p className={styles.errorText} role="alert">
                    {parsedHosts.error}
                  </p>
                )}
              </div>
            )}

            <label className={[styles.radioCard, styles.radioCardDanger].join(' ')}>
              <input
                type="radio"
                name="python-net-mode"
                value="all"
                checked={selectedMode === 'all'}
                onChange={() => setSelectedMode('all')}
              />
              <div>
                <div className={styles.radioTitle}>{t('python.netModeAllTitle')}</div>
                <div className={styles.radioDesc}>{t('python.netModeAllDesc')}</div>
              </div>
            </label>
          </fieldset>

          {selectedMode !== 'off' && (
            <div
              className={selectedMode === 'all' ? styles.calloutDanger : styles.calloutWarn}
              data-testid="python-w4-switch-notice"
            >
              <div className={styles.calloutTitle}>{t('python.w4TitleSwitch')}</div>
              <p className={styles.paragraph}>{t('python.w4BodySwitch', { target: w4Target })}</p>
              <p className={styles.mutedNote}>{t('python.lanNote')}</p>
              {selectedMode === 'all' && (
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={allConfirmed}
                    onChange={(e) => setAllConfirmed(e.target.checked)}
                    data-testid="python-net-all-checkbox"
                  />
                  <span>{t('python.w4AllCheckbox')}</span>
                </label>
              )}
            </div>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={onClose}>
              {t('python.cancel')}
            </button>
            <button
              type="button"
              className={selectedMode === 'all' ? styles.dangerBtn : styles.primaryBtn}
              disabled={!canApply}
              onClick={handleApply}
              data-testid="python-net-apply"
            >
              {!hasChanged
                ? t('python.netNoChange')
                : selectedMode === 'off'
                  ? t('python.netApplyOff')
                  : t('python.w4ConfirmSwitch')}
            </button>
          </div>

          <hr className={styles.divider} />

          <section className={styles.storageSection} aria-label={t('python.w9Title')}>
            <h3 className={styles.sectionTitle}>{t('python.w9Title')}</h3>
            <p className={styles.mutedNote} data-testid="python-w9-text">
              {t('python.w9Body')}
            </p>
            {!clearConfirmOpen ? (
              <button
                type="button"
                className={styles.dangerOutlineBtn}
                onClick={() => setClearConfirmOpen(true)}
                data-testid="python-clear-all-btn"
              >
                {t('python.clearAllBtn')}
              </button>
            ) : (
              <div className={styles.clearConfirmBox}>
                <p className={styles.paragraph}>{t('python.clearAllConfirmText')}</p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    disabled={clearing}
                    onClick={() => setClearConfirmOpen(false)}
                  >
                    {t('python.cancel')}
                  </button>
                  <button
                    type="button"
                    className={styles.dangerBtn}
                    disabled={clearing}
                    onClick={() => {
                      void handleClearAll();
                    }}
                    data-testid="python-clear-all-confirm"
                  >
                    {t('python.clearAllConfirmBtn')}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
