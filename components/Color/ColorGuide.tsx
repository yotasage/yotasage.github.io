import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Color.module.css';

export default function ColorGuide() {
  const { t } = useI18n();

  return (
    <div className={styles.guideLayout}>
      <header className={styles.guideHeader}>
        <h2>{t('color.guide.title')}</h2>
        <p>{t('color.guide.intro')}</p>
      </header>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('color.guide.spacesTitle')}</h3>
        <div className={styles.tableWrap}>
          <table className={styles.guideTable}>
            <thead>
              <tr>
                <th>{t('color.guide.thSpace')}</th>
                <th>{t('color.guide.thChannels')}</th>
                <th>{t('color.guide.thPerceptual')}</th>
                <th>{t('color.guide.thBestFor')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>sRGB / HEX</code></td>
                <td><code>R, G, B (0–255)</code></td>
                <td>{t('color.guide.no')}</td>
                <td>{t('color.guide.srgbDesc')}</td>
              </tr>
              <tr>
                <td><code>HSL</code></td>
                <td><code>H (0–360°), S, L (%)</code></td>
                <td>{t('color.guide.no')}</td>
                <td>{t('color.guide.hslDesc')}</td>
              </tr>
              <tr>
                <td><code>HSV / HSB</code></td>
                <td><code>H (0–360°), S, V (%)</code></td>
                <td>{t('color.guide.no')}</td>
                <td>{t('color.guide.hsvDesc')}</td>
              </tr>
              <tr>
                <td><code>CMYK</code></td>
                <td><code>C, M, Y, K (%)</code></td>
                <td>{t('color.guide.no')}</td>
                <td>{t('color.guide.cmykDesc')}</td>
              </tr>
              <tr>
                <td><code>CIE Lab / LCH</code></td>
                <td><code>L* (0–100), a*, b*</code></td>
                <td>{t('color.guide.yes')}</td>
                <td>{t('color.guide.labDesc')}</td>
              </tr>
              <tr>
                <td><code>OKLab / OKLCH</code></td>
                <td><code>L (0–100%), C, H°</code></td>
                <td>{t('color.guide.yes')}</td>
                <td>{t('color.guide.oklchDesc')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className={styles.guideGrid}>
        <article className={[styles.card, styles.guideCard].join(' ')}>
          <h3 className={styles.cardTitle}>{t('color.guide.harmoniesTitle')}</h3>
          <p>{t('color.guide.harmoniesBody')}</p>
        </article>

        <article className={[styles.card, styles.guideCard].join(' ')}>
          <h3 className={styles.cardTitle}>{t('color.guide.deltaTitle')}</h3>
          <p>{t('color.guide.deltaBody')}</p>
        </article>

        <article className={[styles.card, styles.guideCard].join(' ')}>
          <h3 className={styles.cardTitle}>{t('color.guide.gamutTitle')}</h3>
          <p>{t('color.guide.gamutBody')}</p>
        </article>

        <article className={[styles.card, styles.guideCard].join(' ')}>
          <h3 className={styles.cardTitle}>{t('color.teaching.contrastTitle')}</h3>
          <p>{t('color.teaching.contrastBody')}</p>
        </article>
      </div>
    </div>
  );
}
