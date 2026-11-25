// W3 high-visibility network warning banner rendered directly under ToolHeader whenever network != 'off'.

import type { NetworkPolicy } from '../../lib/python/network';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Python.module.css';

export interface NetworkBannerProps {
  policy: NetworkPolicy;
  onReloadOff: () => void;
}

export default function NetworkBanner({ policy, onReloadOff }: NetworkBannerProps) {
  const { t } = useI18n();

  if (policy.mode === 'off') return null;

  const isDanger = policy.mode === 'all';
  const message =
    policy.mode === 'all'
      ? t('python.w3All')
      : policy.mode === 'pkg'
        ? t('python.w3Pkg')
        : t('python.w3Hosts', { hosts: policy.hosts.join(', ') });

  return (
    <div
      role="status"
      data-testid="python-w3-banner"
      className={[styles.networkBanner, isDanger ? styles.networkBannerDanger : styles.networkBannerWarn].join(' ')}
    >
      <div className={styles.networkBannerInner}>
        <span className={styles.networkBannerText}>{message}</span>
        <button
          type="button"
          className={styles.networkBannerBtn}
          onClick={onReloadOff}
          data-testid="python-w3-reload-off"
        >
          {t('python.w3ReloadOff')}
        </button>
      </div>
    </div>
  );
}
