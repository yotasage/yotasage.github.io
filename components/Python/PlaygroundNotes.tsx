// Small trusted parts of the Python Playground page, split from PythonPlayground.tsx to keep it under
// 40 kB: the W2 honest status note and the header's network-mode button.
import type { NetworkPolicy } from '../../lib/python/network';
import type { CapabilityTier } from '../../lib/python/protocol';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Python.module.css';

export function tierTexts(t: ReturnType<typeof useI18n>['t'], tier: CapabilityTier): { badge: string; desc: string } {
  return tier === 1
    ? { badge: t('python.tier1Badge'), desc: t('python.tier1Desc') }
    : tier === 2
      ? { badge: t('python.tier2Badge'), desc: t('python.tier2Desc') }
      : { badge: t('python.tier3Badge'), desc: t('python.tier3Desc') };
}

/** W2: collapsible so the workspace stays front and centre. */
export function W2StatusNote({ tier }: { tier: CapabilityTier }) {
  const { t } = useI18n();
  const { badge, desc } = tierTexts(t, tier);
  return (
    <details className={styles.statusNote} data-testid="python-w2-note">
      <summary className={styles.statusNoteSummary}>
        <span className={styles.statusNoteLead}>{t('python.w2Summary')}</span>
        <span className={styles.statusNoteBadge}>{badge}</span>
      </summary>
      <div className={styles.statusNoteBody}>
        <p>
          <strong>{t('python.w2WorksLabel')}</strong> {t('python.w2Works')}
        </p>
        <p>
          <strong>{t('python.w2VerifiedLabel')}</strong> {t('python.w2Verified')}
        </p>
        <p>
          <strong>{t('python.w2NotYetLabel')}</strong> {t('python.w2NotYet')}
        </p>
        <p>
          <strong>{t('python.w2MobileLabel')}</strong> {t('python.w2MobileNote')}
        </p>
        <p className={styles.statusNoteTier}>{desc}</p>
        <p className={styles.statusNotePromise}>{t('python.w2Promise')}</p>
      </div>
    </details>
  );
}

/** Header button that opens the Network dialog, coloured by the current mode. */
export function NetworkModeButton({ policy, onClick }: { policy: NetworkPolicy; onClick: () => void }) {
  const { t } = useI18n();
  const label =
    policy.mode === 'off'
      ? t('python.networkOffShort')
      : policy.mode === 'pkg'
        ? t('python.networkPkgShort')
        : policy.mode === 'hosts'
          ? t('python.networkHostsShort', { count: policy.hosts.length })
          : t('python.networkAllShort');
  return (
    <button
      type="button"
      className={[
        styles.headerNetBtn,
        policy.mode === 'all' ? styles.headerNetBtnDanger : policy.mode !== 'off' ? styles.headerNetBtnWarn : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      data-testid="python-network-btn"
    >
      <span
        className={[
          styles.netDot,
          policy.mode === 'off' ? styles.netDotOff : policy.mode === 'all' ? styles.netDotDanger : styles.netDotWarn,
        ].join(' ')}
        aria-hidden="true"
      />
      <span>{label}</span>
    </button>
  );
}
