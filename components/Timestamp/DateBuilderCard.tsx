import React from 'react';

import {
  CURATED_TIMEZONES,
  epochNsToZonedParts,
  formatOffsetUtcLabel,
  getSupportedTimezones,
  zonedPartsToEpochNs,
} from '../../lib/timestamp/timezone';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Timestamp.module.css';

interface DateBuilderCardProps {
  epochNs: bigint;
  selectedZone: string;
  localZone: string;
  onZoneChange: (tz: string) => void;
  onEpochChange: (nextEpochNs: bigint) => void;
}

interface DraftFields {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  ms: string;
}

function partsToDraft(epochNs: bigint, zone: string): DraftFields {
  const p = epochNsToZonedParts(epochNs, zone);
  return {
    year: String(p.year),
    month: String(p.month).padStart(2, '0'),
    day: String(p.day).padStart(2, '0'),
    hour: String(p.hour).padStart(2, '0'),
    minute: String(p.minute).padStart(2, '0'),
    second: String(p.second).padStart(2, '0'),
    ms: String(Math.floor(p.nanosecond / 1_000_000)).padStart(3, '0'),
  };
}

export default function DateBuilderCard({
  epochNs,
  selectedZone,
  localZone,
  onZoneChange,
  onEpochChange,
}: DateBuilderCardProps) {
  const { t } = useI18n();
  const [timezones, setTimezones] = React.useState<readonly string[]>(CURATED_TIMEZONES);

  React.useEffect(() => {
    setTimezones(getSupportedTimezones());
  }, []);

  const zonedParts = React.useMemo(
    () => epochNsToZonedParts(epochNs, selectedZone),
    [epochNs, selectedZone],
  );

  const [draft, setDraft] = React.useState<DraftFields>(() => partsToDraft(epochNs, selectedZone));
  const [invalidBuilder, setInvalidBuilder] = React.useState(false);

  // Sync builder draft whenever external epochNs or selectedZone changes
  const epochKey = epochNs.toString();
  React.useEffect(() => {
    setDraft(partsToDraft(epochNs, selectedZone));
    setInvalidBuilder(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epochKey, selectedZone]);

  const handleFieldChange = (field: keyof DraftFields, value: string) => {
    const nextDraft = { ...draft, [field]: value };
    setDraft(nextDraft);

    const year = Number(nextDraft.year);
    const month = Number(nextDraft.month);
    const day = Number(nextDraft.day);
    const hour = Number(nextDraft.hour);
    const minute = Number(nextDraft.minute);
    const second = Number(nextDraft.second);
    const ms = Number(nextDraft.ms);

    if (
      nextDraft.year.trim() === '' ||
      nextDraft.month.trim() === '' ||
      nextDraft.day.trim() === '' ||
      nextDraft.hour.trim() === '' ||
      nextDraft.minute.trim() === '' ||
      nextDraft.second.trim() === '' ||
      !Number.isInteger(ms) ||
      ms < 0 ||
      ms > 999
    ) {
      setInvalidBuilder(true);
      return;
    }

    const subMsNs = zonedParts.nanosecond % 1_000_000;
    const computed = zonedPartsToEpochNs(
      {
        year,
        month,
        day,
        hour,
        minute,
        second,
        nanosecond: ms * 1_000_000 + subMsNs,
      },
      selectedZone,
    );

    if (computed === null) {
      setInvalidBuilder(true);
      return;
    }

    setInvalidBuilder(false);
    onEpochChange(computed);
  };

  return (
    <section className={styles.card} aria-labelledby="ts-builder-heading">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="ts-builder-heading" className={styles.cardTitle}>
            {t('ts.builder.title')}
          </h2>
          <p className={styles.cardSub}>{t('ts.builder.sub')}</p>
        </div>
      </div>

      <div className={styles.tzBar}>
        <label htmlFor="ts-builder-tz" className={styles.fieldLabel}>
          {t('ts.builder.timezone')}
        </label>
        <select
          id="ts-builder-tz"
          className={styles.selectInput}
          value={selectedZone}
          onChange={(e) => onZoneChange(e.target.value)}
        >
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.buttonSmall}
          onClick={() => onZoneChange('UTC')}
          disabled={selectedZone === 'UTC'}
        >
          {t('ts.builder.useUtc')}
        </button>
        {localZone !== 'UTC' && (
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => onZoneChange(localZone)}
            disabled={selectedZone === localZone}
          >
            {t('ts.builder.useLocal', { tz: localZone })}
          </button>
        )}
      </div>

      <div className={styles.fieldsGrid}>
        <div className={styles.field}>
          <label htmlFor="ts-b-year" className={styles.fieldLabel}>
            {t('ts.builder.year')}
          </label>
          <input
            id="ts-b-year"
            type="number"
            min={-9999}
            max={9999}
            className={styles.numInput}
            value={draft.year}
            onChange={(e) => handleFieldChange('year', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="ts-b-month" className={styles.fieldLabel}>
            {t('ts.builder.month')}
          </label>
          <input
            id="ts-b-month"
            type="number"
            min={1}
            max={12}
            className={styles.numInput}
            value={draft.month}
            onChange={(e) => handleFieldChange('month', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="ts-b-day" className={styles.fieldLabel}>
            {t('ts.builder.day')}
          </label>
          <input
            id="ts-b-day"
            type="number"
            min={1}
            max={31}
            className={styles.numInput}
            value={draft.day}
            onChange={(e) => handleFieldChange('day', e.target.value)}
          />
        </div>
      </div>

      <div className={styles.fieldsGridTime}>
        <div className={styles.field}>
          <label htmlFor="ts-b-hour" className={styles.fieldLabel}>
            {t('ts.builder.hour')}
          </label>
          <input
            id="ts-b-hour"
            type="number"
            min={0}
            max={23}
            className={styles.numInput}
            value={draft.hour}
            onChange={(e) => handleFieldChange('hour', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="ts-b-min" className={styles.fieldLabel}>
            {t('ts.builder.minute')}
          </label>
          <input
            id="ts-b-min"
            type="number"
            min={0}
            max={59}
            className={styles.numInput}
            value={draft.minute}
            onChange={(e) => handleFieldChange('minute', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="ts-b-sec" className={styles.fieldLabel}>
            {t('ts.builder.second')}
          </label>
          <input
            id="ts-b-sec"
            type="number"
            min={0}
            max={59}
            className={styles.numInput}
            value={draft.second}
            onChange={(e) => handleFieldChange('second', e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="ts-b-ms" className={styles.fieldLabel}>
            {t('ts.builder.ms')}
          </label>
          <input
            id="ts-b-ms"
            type="number"
            min={0}
            max={999}
            className={styles.numInput}
            value={draft.ms}
            onChange={(e) => handleFieldChange('ms', e.target.value)}
          />
        </div>
      </div>

      {invalidBuilder && (
        <p className={styles.errorBanner} role="alert">
          {t('ts.error.builderInvalid')}
        </p>
      )}

      <p className={styles.offsetNote}>
        {t('ts.builder.offsetNote', {
          offset: formatOffsetUtcLabel(zonedParts.offsetMinutes),
          abbr: zonedParts.tzAbbr,
        })}
      </p>
    </section>
  );
}
