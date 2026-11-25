import { HASH_ALGORITHMS } from '../../lib/hash/types';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Hash.module.css';

export default function HashGuide() {
  const { t } = useI18n();

  return (
    <div className={styles.guideLayout}>
      <div className={styles.guideHeader}>
        <h2>{t('hash.guide.title')}</h2>
        <p>{t('hash.guide.lead')}</p>
      </div>

      <article className={[styles.card, styles.guideCard].join(' ')}>
        <h3 className={styles.cardTitle}>{t('hash.guide.tableTitle')}</h3>
        <div className={styles.tableWrap}>
          <table className={styles.guideTable}>
            <thead>
              <tr>
                <th>{t('hash.guide.thAlgo')}</th>
                <th>{t('hash.guide.thBits')}</th>
                <th>{t('hash.guide.thBlock')}</th>
                <th>{t('hash.guide.thStatus')}</th>
                <th>{t('hash.guide.thNotes')}</th>
              </tr>
            </thead>
            <tbody>
              {HASH_ALGORITHMS.map((algo) => {
                const statusKey: TranslationKey =
                  algo.status === 'recommended'
                    ? 'hash.guide.statusRecommended'
                    : algo.status === 'legacy'
                      ? 'hash.guide.statusLegacy'
                      : 'hash.guide.statusChecksum';
                const statusClass =
                  algo.status === 'recommended'
                    ? styles.statusTagRecommended
                    : algo.status === 'legacy'
                      ? styles.statusTagLegacy
                      : styles.statusTagChecksum;
                const noteKey = `hash.guide.note.${algo.id}` as TranslationKey;

                return (
                  <tr key={algo.id}>
                    <td>
                      <code>{algo.label}</code>
                    </td>
                    <td className={styles.monoNum}>
                      {algo.bits} bit ({algo.hexLength} hex)
                    </td>
                    <td className={styles.monoNum}>
                      {algo.blockSize > 0 ? `${algo.blockSize} B` : '—'}
                    </td>
                    <td>
                      <span className={statusClass}>{t(statusKey)}</span>
                    </td>
                    <td>{t(noteKey)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>

      <div className={styles.guideGrid}>
        <article className={[styles.card, styles.guideCard].join(' ')}>
          <h3 className={styles.cardTitle}>{t('hash.guide.verifyCardTitle')}</h3>
          <p>{t('hash.guide.verifyCardBody')}</p>
        </article>

        <article className={[styles.card, styles.guideCard].join(' ')}>
          <h3 className={styles.cardTitle}>{t('hash.guide.hmacCardTitle')}</h3>
          <p>{t('hash.guide.hmacCardBody')}</p>
        </article>
      </div>
    </div>
  );
}
