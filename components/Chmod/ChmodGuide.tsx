import { OCTAL_GUIDE_ROWS } from '../../lib/chmod/permissions';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Chmod.module.css';

export default function ChmodGuide() {
  const { t } = useI18n();

  return (
    <div className={styles.guideLayout}>
      <header className={styles.guideHeader}>
        <h2>{t('chmod.guide.title')}</h2>
        <p>{t('chmod.guide.intro')}</p>
      </header>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('chmod.guide.octalTitle')}</h3>
        <div className={styles.tableWrap}>
          <table className={styles.guideTable}>
            <thead>
              <tr>
                <th scope="col">{t('chmod.guide.octalColDigit')}</th>
                <th scope="col">{t('chmod.guide.octalColBinary')}</th>
                <th scope="col">{t('chmod.guide.octalColSymbolic')}</th>
                <th scope="col">{t('chmod.guide.octalColMeaning')}</th>
              </tr>
            </thead>
            <tbody>
              {OCTAL_GUIDE_ROWS.map((row) => (
                <tr key={row.digit}>
                  <td className={styles.monoCell}>{row.digit}</td>
                  <td className={styles.monoCell}>{row.binary}</td>
                  <td className={styles.monoCell}>{row.symbolic}</td>
                  <td>{t(`chmod.guide.digit.${row.digit}` as 'chmod.guide.digit.0')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('chmod.guide.fileVsDirTitle')}</h3>
        <div className={styles.tableWrap}>
          <table className={styles.guideTable}>
            <thead>
              <tr>
                <th scope="col">{t('chmod.guide.fileVsDirColRight')}</th>
                <th scope="col">{t('chmod.guide.fileVsDirColFile')}</th>
                <th scope="col">{t('chmod.guide.fileVsDirColDir')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.monoCell}>r (4)</td>
                <td>{t('chmod.guide.fvd.rFile')}</td>
                <td>{t('chmod.guide.fvd.rDir')}</td>
              </tr>
              <tr>
                <td className={styles.monoCell}>w (2)</td>
                <td>{t('chmod.guide.fvd.wFile')}</td>
                <td>{t('chmod.guide.fvd.wDir')}</td>
              </tr>
              <tr>
                <td className={styles.monoCell}>x (1)</td>
                <td>{t('chmod.guide.fvd.xFile')}</td>
                <td>{t('chmod.guide.fvd.xDir')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className={styles.guideGrid}>
        <section className={[styles.card, styles.guideCard].join(' ')}>
          <h3 className={styles.cardTitle}>{t('chmod.guide.specialTitle')}</h3>
          <p>{t('chmod.guide.specialBody')}</p>
        </section>
        <section className={[styles.card, styles.guideCard].join(' ')}>
          <h3 className={styles.cardTitle}>{t('chmod.guide.cliTitle')}</h3>
          <p>{t('chmod.guide.cliBody')}</p>
        </section>
      </div>
    </div>
  );
}
