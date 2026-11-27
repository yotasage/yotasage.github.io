import React from 'react';

import { CHEAT_SHEET_SECTIONS } from '../../lib/regex/cheatsheet';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Regex.module.css';

export default function RegexCheatSheet() {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = React.useMemo(() => {
    if (!normalizedQuery) return CHEAT_SHEET_SECTIONS;

    return CHEAT_SHEET_SECTIONS.map((section) => {
      const sectionTitle = t(section.titleKey as TranslationKey).toLowerCase();
      if (sectionTitle.includes(normalizedQuery)) {
        return section;
      }
      const items = section.items.filter((item) => {
        const desc = t(item.descKey as TranslationKey).toLowerCase();
        const tok = item.token.toLowerCase();
        const note = (item.note ?? '').toLowerCase();
        return (
          tok.includes(normalizedQuery) ||
          desc.includes(normalizedQuery) ||
          note.includes(normalizedQuery)
        );
      });
      return { ...section, items };
    }).filter((section) => section.items.length > 0);
  }, [normalizedQuery, t]);

  const handleCopyToken = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopiedKey(key);
        window.setTimeout(() => {
          setCopiedKey((prev) => (prev === key ? null : prev));
        }, 1400);
      },
      () => {},
    );
  };

  return (
    <div className={styles.cheatSheetWrap}>
      <div className={styles.cheatTopBar}>
        <div>
          <h3 className={styles.cardTitle}>{t('regex.cs.heading')}</h3>
          <p className={styles.theoryProse}>{t('regex.cs.intro')}</p>
        </div>

        <input
          type="search"
          className={styles.cheatSearch}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('regex.cs.filterPlaceholder')}
          aria-label={t('regex.cs.filterAria')}
        />
      </div>

      {filteredSections.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.resultEmpty}>
            {t('regex.cs.empty', { query: query.trim() })}
          </p>
        </div>
      ) : (
        <div className={styles.cheatGrid}>
          {filteredSections.map((section) => (
            <section key={section.id} className={styles.card}>
              <h4 className={styles.cheatSectionTitle}>
                {t(section.titleKey as TranslationKey)}
              </h4>

              <ul className={styles.cheatList}>
                {section.items.map((item) => {
                  const fullKey = `${section.id}-${item.id}`;
                  const isCopied = copiedKey === fullKey;
                  const valueToCopy = item.copyToken ?? item.token;
                  return (
                    <li key={fullKey} className={styles.cheatRow}>
                      <button
                        type="button"
                        className={[styles.cheatTokenBtn, isCopied ? styles.buttonCopied : '']
                          .filter(Boolean)
                          .join(' ')}
                        aria-label={t('regex.cs.copyAria', { token: valueToCopy })}
                        title={t('regex.cs.copyAria', { token: valueToCopy })}
                        onClick={() => handleCopyToken(fullKey, valueToCopy)}
                      >
                        {isCopied ? t('regex.cs.copied') : item.token}
                      </button>

                      <span className={styles.cheatDesc}>
                        {t(item.descKey as TranslationKey)}
                        {item.note && (
                          <span className={styles.cheatNote}> · {item.note}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
