import React from 'react';

import PageHead from '../../components/PageHead';
import CaseConverter from '../../components/TextCase/CaseConverter';
import ExamplesGallery from '../../components/UI/ExamplesGallery';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { TEXT_CASE_EXAMPLES, type TextCaseExamplePreset } from '../../lib/textcase/examples';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/TextCase.module.css';

type WorkspaceId = 'workbench' | 'examples' | 'guide';

export default function TextCase() {
  useDesignSystemPage('#7c3aed', '#a585ff');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');
  const [exampleRequest, setExampleRequest] = React.useState<{ preset: TextCaseExamplePreset; seq: number } | null>(null);
  const seqRef = React.useRef(0);

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'workbench', label: t('textcase.workbench') },
    { id: 'examples', label: t('ex.tab') },
    { id: 'guide', label: t('textcase.guide') },
  ];

  const exampleItems = React.useMemo(
    () =>
      TEXT_CASE_EXAMPLES.map((ex) => ({
        id: ex.id,
        tag: t(ex.tagKey as TranslationKey),
        code: ex.code,
        title: t(ex.titleKey as TranslationKey),
        description: t(ex.descKey as TranslationKey),
      })),
    [t],
  );

  const handleSelectExample = React.useCallback((id: string) => {
    const preset = TEXT_CASE_EXAMPLES.find((ex) => ex.id === id);
    if (!preset) return;
    setExampleRequest({ preset, seq: ++seqRef.current });
    setWorkspace('workbench');
  }, []);

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('textcase.pageTitle')}
        description="Convert text live between Sentence case, Title Case, UPPER, lower, camelCase, PascalCase, snake_case, and kebab-case with word and character counts."
        path="/text-case/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('textcase.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        <section className={styles.workspacePanel} hidden={workspace !== 'workbench'} aria-label={t('textcase.workbench')}>
          <p className={styles.lead}>{t('textcase.lead')}</p>

          {mode === 'quick' && (
            <div className={styles.quickBanner}>
              <div className={styles.quickBannerText}>
                <span className={styles.quickBadge}>{t('textcase.quick.badge')}</span>
                <span>{t('textcase.quick.bannerText')}</span>
              </div>
              <div className={styles.quickActions}>
                <button type="button" className={styles.buttonSmall} onClick={() => setMode('standard')}>
                  {t('textcase.quick.switchStandard')}
                </button>
                <button type="button" className={styles.buttonSmall} onClick={() => setMode('teaching')}>
                  {t('textcase.quick.switchTeaching')}
                </button>
              </div>
            </div>
          )}

          <CaseConverter hideOptions={mode === 'quick'} exampleRequest={exampleRequest} />

          {mode === 'teaching' && (
            <div className={styles.teachingGrid}>
              <TeachingCallout
                title={t('textcase.teaching.titleCaseTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('textcase.teaching.titleCaseBody')}
              </TeachingCallout>
              <TeachingCallout
                title={t('textcase.teaching.codeNamesTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('textcase.teaching.codeNamesBody')}
              </TeachingCallout>
            </div>
          )}
        </section>

        <section className={styles.workspacePanel} hidden={workspace !== 'examples'} aria-label={t('ex.tab')}>
          <ExamplesGallery
            title={t('ex.textcase.title')}
            subtitle={t('ex.textcase.lead')}
            items={exampleItems}
            defaultActionLabel={t('ex.textcase.action')}
            onSelect={handleSelectExample}
          />
        </section>

        <section className={styles.workspacePanel} hidden={workspace !== 'guide'} aria-label={t('textcase.guide')}>
          <div className={styles.guideLayout}>
            <div className={styles.guideHeader}>
              <h2>{t('textcase.guide.title')}</h2>
              <p>{t('textcase.guide.lead')}</p>
            </div>

            <div className={styles.guideGrid}>
              <article className={[styles.card, styles.guideCard].join(' ')}>
                <h2>{t('textcase.guide.proseTitle')}</h2>
                <p>{t('textcase.guide.proseBody')}</p>
              </article>

              <article className={[styles.card, styles.guideCard].join(' ')}>
                <h2>{t('textcase.guide.titleRulesTitle')}</h2>
                <p>{t('textcase.guide.titleRulesBody')}</p>
                <table className={styles.guideTable}>
                  <thead>
                    <tr>
                      <th>{t('textcase.guide.thStyle')}</th>
                      <th>{t('textcase.guide.thPrep')}</th>
                      <th>{t('textcase.guide.thExample')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Chicago</td>
                      <td>{t('textcase.guide.chicagoRule')} (<code>with</code>, <code>between</code>)</td>
                      <td>Signal Flow between Stages with Noise</td>
                    </tr>
                    <tr>
                      <td>APA</td>
                      <td>{t('textcase.guide.apaRule')} (<code>With</code>, <code>Between</code>)</td>
                      <td>Signal Flow Between Stages With Noise</td>
                    </tr>
                  </tbody>
                </table>
              </article>
            </div>

            <article className={[styles.card, styles.guideCard].join(' ')}>
              <h2>{t('textcase.guide.codeTitle')}</h2>
              <p>{t('textcase.guide.codeBody')}</p>
              <table className={styles.guideTable}>
                <thead>
                  <tr>
                    <th>{t('textcase.guide.thConvention')}</th>
                    <th>{t('textcase.guide.thExample')}</th>
                    <th>{t('textcase.guide.thUsage')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td><code>camelCase</code></td><td><code>sampleRateHz</code></td><td>{t('textcase.guide.useCamel')}</td></tr>
                  <tr><td><code>PascalCase</code></td><td><code>SampleRateHz</code></td><td>{t('textcase.guide.usePascal')}</td></tr>
                  <tr><td><code>snake_case</code></td><td><code>sample_rate_hz</code></td><td>{t('textcase.guide.useSnake')}</td></tr>
                  <tr><td><code>CONSTANT_CASE</code></td><td><code>SAMPLE_RATE_HZ</code></td><td>{t('textcase.guide.useConstant')}</td></tr>
                  <tr><td><code>kebab-case</code></td><td><code>sample-rate-hz</code></td><td>{t('textcase.guide.useKebab')}</td></tr>
                  <tr><td><code>dot.case</code></td><td><code>sample.rate.hz</code></td><td>{t('textcase.guide.useDot')}</td></tr>
                </tbody>
              </table>
            </article>

            <article className={[styles.card, styles.guideCard].join(' ')}>
              <h2>{t('textcase.guide.asciiTitle')}</h2>
              <p>{t('textcase.guide.asciiBody')}</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
