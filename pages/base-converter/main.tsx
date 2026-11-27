import React from 'react';

import BaseGuide from '../../components/Base/BaseGuide';
import BaseWorkbench from '../../components/Base/BaseWorkbench';
import PageHead from '../../components/PageHead';
import ExamplesGallery from '../../components/UI/ExamplesGallery';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { BASE_EXAMPLES, type BaseExamplePreset } from '../../lib/toolExamples/presets';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/BaseConverter.module.css';

type WorkspaceId = 'converter' | 'examples' | 'guide';

export default function NumberBaseConverterPage() {
  useDesignSystemPage('#0284c7', '#38bdf8');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('converter');
  const [exampleRequest, setExampleRequest] = React.useState<{ preset: BaseExamplePreset; seq: number } | null>(null);
  const seqRef = React.useRef(0);

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'converter', label: t('base.tab.converter') },
    { id: 'examples', label: t('ex.tab') },
    { id: 'guide', label: t('base.tab.guide') },
  ];

  const exampleItems = React.useMemo(
    () =>
      BASE_EXAMPLES.map((ex) => ({
        id: ex.id,
        tag: t(ex.tagKey as TranslationKey),
        code: ex.code,
        title: t(ex.titleKey as TranslationKey),
        description: t(ex.descKey as TranslationKey),
      })),
    [t],
  );

  const handleSelectExample = React.useCallback((id: string) => {
    const preset = BASE_EXAMPLES.find((ex) => ex.id === id);
    if (!preset) return;
    setExampleRequest({ preset, seq: ++seqRef.current });
    setWorkspace('converter');
  }, []);

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('base.pageTitle')}
        description={t('base.metaDescription')}
        path="/base-converter/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('base.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'converter'}
          aria-label={t('base.tab.converter')}
        >
          <p className={styles.lead}>{t('base.lead')}</p>

          {mode === 'quick' && (
            <div className={styles.quickBanner}>
              <div className={styles.quickBannerText}>
                <span className={styles.quickBadge}>{t('base.quick.badge')}</span>
                <span>{t('base.quick.bannerText')}</span>
              </div>
              <div className={styles.quickActions}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setMode('standard')}
                >
                  {t('base.quick.switchStandard')}
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setMode('teaching')}
                >
                  {t('base.quick.switchTeaching')}
                </button>
              </div>
            </div>
          )}

          <BaseWorkbench
            quickMode={mode === 'quick'}
            teachingMode={mode === 'teaching'}
            exampleRequest={exampleRequest}
          />

          {mode === 'teaching' && (
            <div className={styles.teachingGrid}>
              <TeachingCallout
                title={t('base.teaching.positionalTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('base.teaching.positionalBody')}
              </TeachingCallout>
              <TeachingCallout
                title={t('base.teaching.twosTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('base.teaching.twosBody')}
              </TeachingCallout>
            </div>
          )}
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'examples'}
          aria-label={t('ex.tab')}
        >
          <ExamplesGallery
            title={t('ex.base.title')}
            subtitle={t('ex.base.lead')}
            items={exampleItems}
            defaultActionLabel={t('ex.base.action')}
            onSelect={handleSelectExample}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'guide'}
          aria-label={t('base.tab.guide')}
        >
          <BaseGuide />
        </section>
      </main>
    </div>
  );
}
