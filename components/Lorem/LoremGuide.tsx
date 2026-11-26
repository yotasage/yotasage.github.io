import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Lorem.module.css';

export default function LoremGuide() {
  const { t } = useI18n();

  return (
    <div className={styles.guideLayout}>
      <div className={styles.guideHeader}>
        <h2>{t('lorem.guide.title')}</h2>
        <p>{t('lorem.guide.lead')}</p>
      </div>

      <div className={styles.guideGrid}>
        <article className={[styles.card, styles.guideCard].join(' ')}>
          <h3 className={styles.cardTitle}>{t('lorem.guide.originTitle')}</h3>
          <p>{t('lorem.guide.originP1')}</p>
          <p>{t('lorem.guide.originP2')}</p>
        </article>

        <article className={[styles.card, styles.guideCard].join(' ')}>
          <h3 className={styles.cardTitle}>{t('lorem.guide.formatsTitle')}</h3>
          <p>{t('lorem.guide.formatsP1')}</p>
          <p>{t('lorem.guide.formatsP2')}</p>
        </article>
      </div>

      <article className={[styles.card, styles.guideCard].join(' ')}>
        <h3 className={styles.cardTitle}>{t('lorem.guide.lengthsTitle')}</h3>
        <p>{t('lorem.guide.lengthsIntro')}</p>
        <div className={styles.tableWrap}>
          <table className={styles.guideTable}>
            <thead>
              <tr>
                <th>{t('lorem.guide.thElement')}</th>
                <th>{t('lorem.guide.thTarget')}</th>
                <th>{t('lorem.guide.thTip')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('lorem.guide.row.button')}</td>
                <td className={styles.monoCell}>{t('lorem.guide.row.buttonLen')}</td>
                <td>{t('lorem.guide.row.buttonTip')}</td>
              </tr>
              <tr>
                <td>{t('lorem.guide.row.card')}</td>
                <td className={styles.monoCell}>{t('lorem.guide.row.cardLen')}</td>
                <td>{t('lorem.guide.row.cardTip')}</td>
              </tr>
              <tr>
                <td>{t('lorem.guide.row.hero')}</td>
                <td className={styles.monoCell}>{t('lorem.guide.row.heroLen')}</td>
                <td>{t('lorem.guide.row.heroTip')}</td>
              </tr>
              <tr>
                <td>{t('lorem.guide.row.article')}</td>
                <td className={styles.monoCell}>{t('lorem.guide.row.articleLen')}</td>
                <td>{t('lorem.guide.row.articleTip')}</td>
              </tr>
              <tr>
                <td>{t('lorem.guide.row.meta')}</td>
                <td className={styles.monoCell}>{t('lorem.guide.row.metaLen')}</td>
                <td>{t('lorem.guide.row.metaTip')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article className={[styles.card, styles.guideCard].join(' ')}>
        <h3 className={styles.cardTitle}>{t('lorem.guide.unicodeTitle')}</h3>
        <p>{t('lorem.guide.unicodeBody')}</p>
      </article>
    </div>
  );
}
