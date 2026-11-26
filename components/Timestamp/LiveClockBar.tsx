import React from 'react';

import { formatIsoString } from '../../lib/timestamp/format';
import { NS_PER_MS } from '../../lib/timestamp/parse';
import { epochNsToZonedParts } from '../../lib/timestamp/timezone';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Timestamp.module.css';

interface LiveClockBarProps {
  nowMs: number;
  paused: boolean;
  onTogglePause: () => void;
  onLoadNow: () => void;
}

export default function LiveClockBar({
  nowMs,
  paused,
  onTogglePause,
  onLoadNow,
}: LiveClockBarProps) {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState(false);

  const sec = Math.floor(nowMs / 1000);
  const utcParts = React.useMemo(
    () => epochNsToZonedParts(BigInt(Math.trunc(nowMs)) * NS_PER_MS, 'UTC'),
    [nowMs],
  );
  const utcIso = formatIsoString(utcParts, 'ms').slice(0, 19) + 'Z';

  const handleCopySec = async () => {
    try {
      await navigator.clipboard.writeText(String(sec));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors in restricted contexts
    }
  };

  return (
    <section className={styles.liveBar} aria-label={t('ts.live.aria')}>
      <div className={styles.liveReadouts}>
        <div className={styles.livePrimary}>
          <span className={styles.liveLabel}>{t('ts.live.label')}</span>
          <span className={styles.liveEpochNum} data-testid="live-epoch-seconds">
            {sec}
          </span>
        </div>

        <div className={styles.liveSecondary}>
          <span>
            {t('ts.live.milliseconds')}: <span className={styles.liveMono}>{nowMs}</span>
          </span>
          <span className={styles.liveSep} aria-hidden="true">
            ·
          </span>
          <span>
            {t('ts.live.utc')}: <span className={styles.liveMono}>{utcIso}</span>
          </span>
          {paused && (
            <>
              <span className={styles.liveSep} aria-hidden="true">
                ·
              </span>
              <span className={styles.livePaused}>{t('ts.live.pausedStatus')}</span>
            </>
          )}
        </div>
      </div>

      <div className={styles.liveActions}>
        <button type="button" className={styles.buttonSmall} onClick={onTogglePause}>
          {paused ? t('ts.live.resume') : t('ts.live.pause')}
        </button>
        <button
          type="button"
          className={[styles.copyBtn, copied ? styles.copyBtnCopied : ''].filter(Boolean).join(' ')}
          onClick={handleCopySec}
        >
          {copied ? t('ts.formats.copied') : t('ts.live.copySec')}
        </button>
        <button type="button" className={styles.primaryButton} onClick={onLoadNow}>
          {t('ts.live.useNow')}
        </button>
      </div>
    </section>
  );
}
