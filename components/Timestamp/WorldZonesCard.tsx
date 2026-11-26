import React from 'react';

import { formatClockTime, formatSqlString } from '../../lib/timestamp/format';
import {
  calendarDayDelta,
  CURATED_TIMEZONES,
  DEFAULT_WORLD_ZONES,
  epochNsToZonedParts,
  formatOffsetUtcLabel,
  getSupportedTimezones,
} from '../../lib/timestamp/timezone';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Timestamp.module.css';

interface WorldZonesCardProps {
  epochNs: bigint;
  selectedZone: string;
  localZone: string;
  onSelectZone: (tz: string) => void;
}

export default function WorldZonesCard({
  epochNs,
  selectedZone,
  localZone,
  onSelectZone,
}: WorldZonesCardProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = React.useState(false);
  const [allTimezones, setAllTimezones] = React.useState<readonly string[]>(CURATED_TIMEZONES);

  React.useEffect(() => {
    setMounted(true);
    setAllTimezones(getSupportedTimezones());
  }, []);

  const defaultList = React.useMemo(() => {
    const base = [...DEFAULT_WORLD_ZONES];
    if (localZone && !base.includes(localZone)) {
      base.splice(1, 0, localZone);
    }
    return base;
  }, [localZone]);

  const [zones, setZones] = React.useState<string[]>(() => [...DEFAULT_WORLD_ZONES]);
  const [use24Hour, setUse24Hour] = React.useState(true);
  const [pendingZone, setPendingZone] = React.useState('');

  // Ensure detected local zone is included once hydrated
  const hydratedLocalRef = React.useRef(false);
  React.useEffect(() => {
    if (!hydratedLocalRef.current && localZone && localZone !== 'UTC') {
      hydratedLocalRef.current = true;
      setZones((prev) => (prev.includes(localZone) ? prev : [prev[0] ?? 'UTC', localZone, ...prev.slice(1)]));
    }
  }, [localZone]);

  const availableToAdd = React.useMemo(
    () => allTimezones.filter((tz) => !zones.includes(tz)),
    [allTimezones, zones],
  );

  const utcParts = React.useMemo(() => epochNsToZonedParts(epochNs, 'UTC'), [epochNs]);

  const handleAddZone = () => {
    if (!pendingZone || zones.includes(pendingZone)) return;
    setZones((prev) => [...prev, pendingZone]);
    setPendingZone('');
  };

  const handleRemoveZone = (tz: string) => {
    setZones((prev) => prev.filter((item) => item !== tz));
  };

  const handleResetZones = () => {
    setZones(defaultList);
    setPendingZone('');
  };

  const formatDelta = (delta: number): string => {
    if (delta === 0) return t('ts.zones.sameDay');
    if (delta === 1) return t('ts.zones.nextDay');
    if (delta === -1) return t('ts.zones.prevDay');
    return t('ts.zones.dayDelta', { delta: delta > 0 ? `+${delta}` : String(delta) });
  };

  return (
    <section className={styles.card} aria-labelledby="ts-zones-heading">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="ts-zones-heading" className={styles.cardTitle}>
            {t('ts.zones.title')}
          </h2>
          <p className={styles.cardSub}>{t('ts.zones.sub')}</p>
        </div>

        <div className={styles.segmented} role="group" aria-label={t('ts.zones.clockAria')}>
          <button
            type="button"
            className={[styles.segBtn, use24Hour ? styles.segBtnActive : '']
              .filter(Boolean)
              .join(' ')}
            aria-pressed={use24Hour}
            onClick={() => setUse24Hour(true)}
          >
            {t('ts.zones.clock24')}
          </button>
          <button
            type="button"
            className={[styles.segBtn, !use24Hour ? styles.segBtnActive : '']
              .filter(Boolean)
              .join(' ')}
            aria-pressed={!use24Hour}
            onClick={() => setUse24Hour(false)}
          >
            {t('ts.zones.clock12')}
          </button>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>{t('ts.zones.colZone')}</th>
              <th>{t('ts.zones.colDateTime')}</th>
              <th>{t('ts.zones.colOffset')}</th>
              <th>{t('ts.zones.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((tz) => {
              const parts = epochNsToZonedParts(epochNs, tz);
              const datePart = formatSqlString(parts).slice(0, 10);
              const timePart = formatClockTime(parts, use24Hour, true);
              const delta = calendarDayDelta(parts, utcParts);
              const isSelected = tz === selectedZone;
              const isLocal = tz === localZone && tz !== 'UTC';

              return (
                <tr key={tz} className={isSelected ? styles.zoneActiveRow : undefined}>
                  <td>
                    <span className={styles.monoCell}>{tz}</span>
                    {isLocal && <span className={styles.subMeta}>{t('ts.zones.localTag')}</span>}
                  </td>
                  <td>
                    <span className={styles.monoCell}>
                      {datePart} {timePart}
                    </span>
                    <span className={styles.subMeta}>{formatDelta(delta)}</span>
                  </td>
                  <td>
                    <span className={styles.monoCell}>
                      {formatOffsetUtcLabel(parts.offsetMinutes)}
                    </span>
                    {mounted && <span className={styles.subMeta}>{parts.tzAbbr}</span>}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.buttonSmall}
                        onClick={() => onSelectZone(tz)}
                        disabled={isSelected}
                      >
                        {t('ts.zones.useZone')}
                      </button>
                      {tz !== 'UTC' && (
                        <button
                          type="button"
                          className={styles.buttonSmall}
                          aria-label={t('ts.zones.removeZone', { tz })}
                          onClick={() => handleRemoveZone(tz)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.zoneAddBar}>
        <select
          className={styles.selectInput}
          aria-label={t('ts.zones.addAria')}
          value={pendingZone}
          onChange={(e) => setPendingZone(e.target.value)}
        >
          <option value="">{t('ts.zones.addPlaceholder')}</option>
          {availableToAdd.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.button}
          onClick={handleAddZone}
          disabled={!pendingZone}
        >
          {t('ts.zones.addBtn')}
        </button>
        <button type="button" className={styles.button} onClick={handleResetZones}>
          {t('ts.zones.resetBtn')}
        </button>
      </div>
    </section>
  );
}
