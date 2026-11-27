import { FLAVOR_LIST } from '../../lib/regex/flavors';
import { SYNTAX_REFERENCE_GROUPS, TheoryTrySnippet } from '../../lib/regex/theory';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Regex.module.css';

interface RegexTheoryProps {
  onTrySnippet: (snippet: TheoryTrySnippet) => void;
}

export default function RegexTheory({ onTrySnippet }: RegexTheoryProps) {
  const { t } = useI18n();

  return (
    <div className={styles.theoryLayout}>
      <header className={styles.theoryHeader}>
        <h2>{t('regex.theory.heading')}</h2>
        <p>{t('regex.theory.intro')}</p>
      </header>

      <div className={styles.theoryGrid}>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t('regex.theory.engineTitle')}</h3>
          <p className={styles.theoryProse}>{t('regex.theory.engineBody1')}</p>
          <p className={styles.theoryProse}>{t('regex.theory.engineBody2')}</p>
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t('regex.theory.perfTitle')}</h3>
          <p className={styles.theoryProse}>{t('regex.theory.perfBody')}</p>
          <h3 className={styles.cardTitle} style={{ marginTop: 14 }}>
            {t('regex.theory.delimiterTitle')}
          </h3>
          <p className={styles.theoryProse}>{t('regex.theory.delimiterBody')}</p>
        </section>
      </div>

      {SYNTAX_REFERENCE_GROUPS.map((group) => (
        <section key={group.id} className={styles.card}>
          <h3 className={styles.cardTitle}>{t(group.titleKey as TranslationKey)}</h3>
          <p className={styles.theoryProse}>{t(group.introKey as TranslationKey)}</p>

          <div className={styles.tableWrap}>
            <table className={styles.theoryTable}>
              <thead>
                <tr>
                  <th>{t('regex.theory.colToken')}</th>
                  <th>{t('regex.theory.colName')}</th>
                  <th>{t('regex.theory.colDesc')}</th>
                  <th>{t('regex.theory.colExample')}</th>
                  <th>{t('regex.theory.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.token}>
                    <td className={styles.monoCell}>{row.token}</td>
                    <td>{t(row.nameKey as TranslationKey)}</td>
                    <td>{t(row.descKey as TranslationKey)}</td>
                    <td className={styles.monoMuted}>{row.example}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.buttonSmall}
                        onClick={() => onTrySnippet(row.trySnippet)}
                      >
                        {t('regex.theory.tryBtn')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('regex.theory.flavorsTitle')}</h3>
        <p className={styles.theoryProse}>{t('regex.theory.flavorsIntro')}</p>

        <div className={styles.tableWrap}>
          <table className={styles.theoryTable}>
            <thead>
              <tr>
                <th>{t('regex.theory.colFlavor')}</th>
                <th>{t('regex.theory.colEngine')}</th>
                <th>{t('regex.theory.colNamed')}</th>
                <th>{t('regex.theory.colLookbehind')}</th>
                <th>{t('regex.theory.colBackref')}</th>
                <th>{t('regex.theory.colDelimiter')}</th>
              </tr>
            </thead>
            <tbody>
              {FLAVOR_LIST.map((f) => (
                <tr key={f.id}>
                  <td>
                    <strong>{f.name}</strong>
                  </td>
                  <td>
                    {f.engineType === 'dfa'
                      ? t('regex.theory.engineDfa')
                      : t('regex.theory.engineBacktrack')}
                  </td>
                  <td className={styles.monoMuted}>{f.namedGroupSyntax}</td>
                  <td>{f.supportsLookbehind ? t('regex.theory.yes') : t('regex.theory.no')}</td>
                  <td>{f.supportsBackreferences ? t('regex.theory.yes') : t('regex.theory.no')}</td>
                  <td className={styles.monoCell}>
                    {f.literalPrefix}…{f.literalSuffix}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('regex.theory.templatesTitle')}</h3>
        <p className={styles.theoryProse}>{t('regex.theory.templatesIntro')}</p>

        <div className={styles.tableWrap}>
          <table className={styles.theoryTable}>
            <thead>
              <tr>
                <th>{t('regex.theory.colToken')}</th>
                <th>{t('regex.theory.colDesc')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.monoCell}>$0 / $&amp;</td>
                <td>{t('regex.tpl.full')}</td>
              </tr>
              <tr>
                <td className={styles.monoCell}>$1, $2 / \1</td>
                <td>{t('regex.tpl.numbered')}</td>
              </tr>
              <tr>
                <td className={styles.monoCell}>$&lt;name&gt; / \g&lt;name&gt;</td>
                <td>{t('regex.tpl.named')}</td>
              </tr>
              <tr>
                <td className={styles.monoCell}>$i / {'${index}'}</td>
                <td>{t('regex.tpl.index')}</td>
              </tr>
              <tr>
                <td className={styles.monoCell}>\n , \t , $$</td>
                <td>{t('regex.tpl.escapes')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
