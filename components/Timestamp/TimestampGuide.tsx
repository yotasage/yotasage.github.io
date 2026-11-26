import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Timestamp.module.css';

const CODE_SNIPPETS: readonly { lang: string; code: string }[] = [
  { lang: 'JavaScript / TypeScript', code: 'Math.floor(Date.now() / 1000)   // Date.now() for ms' },
  { lang: 'Python', code: 'import time; int(time.time())   # time.time_ns() for ns' },
  { lang: 'Go', code: 'time.Now().Unix()               // time.Now().UnixMilli()' },
  { lang: 'Rust', code: 'SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs()' },
  { lang: 'Bash / Linux', code: 'date +%s                        # date +%s%3N for ms' },
  { lang: 'PostgreSQL', code: 'EXTRACT(EPOCH FROM NOW())::BIGINT' },
];

export default function TimestampGuide() {
  const { t } = useI18n();

  return (
    <div className={styles.guideLayout}>
      <header className={styles.guideHeader}>
        <h2>{t('ts.guide.title')}</h2>
        <p>{t('ts.guide.lead')}</p>
      </header>

      <section className={styles.card}>
        <h3 id="ts-guide-units" className={styles.cardTitle}>
          {t('ts.guide.unitsTitle')}
        </h3>
        <div className={`${styles.tableWrap} ${styles.tableSpacer}`}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>{t('ts.guide.unitsColUnit')}</th>
                <th>{t('ts.guide.unitsColDigits')}</th>
                <th>{t('ts.guide.unitsColExample')}</th>
                <th>{t('ts.guide.unitsColCommon')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.monoCell}>s (10⁰)</td>
                <td className={styles.monoCell}>10</td>
                <td className={styles.monoCell}>1700000000</td>
                <td>{t('ts.guide.unitsSCommon')}</td>
              </tr>
              <tr>
                <td className={styles.monoCell}>ms (10⁻³)</td>
                <td className={styles.monoCell}>13</td>
                <td className={styles.monoCell}>1700000000000</td>
                <td>{t('ts.guide.unitsMsCommon')}</td>
              </tr>
              <tr>
                <td className={styles.monoCell}>µs (10⁻⁶)</td>
                <td className={styles.monoCell}>16</td>
                <td className={styles.monoCell}>1700000000000000</td>
                <td>{t('ts.guide.unitsUsCommon')}</td>
              </tr>
              <tr>
                <td className={styles.monoCell}>ns (10⁻⁹)</td>
                <td className={styles.monoCell}>19</td>
                <td className={styles.monoCell}>1700000000000000000</td>
                <td>{t('ts.guide.unitsNsCommon')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className={styles.guideGrid}>
        <section className={`${styles.card} ${styles.guideCard}`}>
          <h3 className={styles.cardTitle}>{t('ts.guide.standardsTitle')}</h3>
          <p>{t('ts.guide.standardsBody')}</p>
        </section>

        <section className={`${styles.card} ${styles.guideCard}`}>
          <h3 className={styles.cardTitle}>{t('ts.guide.leapTitle')}</h3>
          <p>{t('ts.guide.leapBody')}</p>
        </section>
      </div>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('ts.guide.altTitle')}</h3>
        <div className={`${styles.tableWrap} ${styles.tableSpacer}`}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>{t('ts.guide.altColSystem')}</th>
                <th>{t('ts.guide.altColEpoch')}</th>
                <th>{t('ts.guide.altColTick')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t('ts.guide.altUnix')}</td>
                <td className={styles.monoCell}>1970-01-01 00:00:00Z</td>
                <td className={styles.monoCell}>1 s / ms / µs / ns</td>
              </tr>
              <tr>
                <td>{t('ts.guide.altFiletime')}</td>
                <td className={styles.monoCell}>1601-01-01 00:00:00Z</td>
                <td className={styles.monoCell}>100 ns</td>
              </tr>
              <tr>
                <td>{t('ts.guide.altCocoa')}</td>
                <td className={styles.monoCell}>2001-01-01 00:00:00Z</td>
                <td className={styles.monoCell}>1 s (float64)</td>
              </tr>
              <tr>
                <td>{t('ts.guide.altNtp')}</td>
                <td className={styles.monoCell}>1900-01-01 00:00:00Z</td>
                <td className={styles.monoCell}>1 s (+ 32-bit frac)</td>
              </tr>
              <tr>
                <td>{t('ts.guide.altGps')}</td>
                <td className={styles.monoCell}>1980-01-06 00:00:00Z</td>
                <td className={styles.monoCell}>1 s (no leap s)</td>
              </tr>
              <tr>
                <td>{t('ts.guide.altExcel')}</td>
                <td className={styles.monoCell}>1899-12-30 00:00:00Z</td>
                <td className={styles.monoCell}>1 day (float)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('ts.guide.codeTitle')}</h3>
        <div className={`${styles.tableWrap} ${styles.tableSpacer}`}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>{t('ts.guide.codeLang')}</th>
                <th>{t('ts.guide.codeSnippet')}</th>
              </tr>
            </thead>
            <tbody>
              {CODE_SNIPPETS.map((item) => (
                <tr key={item.lang}>
                  <td>{item.lang}</td>
                  <td className={styles.monoCell}>
                    <code>{item.code}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
