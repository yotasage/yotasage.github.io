import React from 'react';

import BaseGuide from '../../components/Base/BaseGuide';
import BaseWorkbench from '../../components/Base/BaseWorkbench';
import PageHead from '../../components/PageHead';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/BaseConverter.module.css';

type WorkspaceId = 'converter' | 'guide';

export default function NumberBaseConverterPage() {
  useDesignSystemPage('#0284c7', '#38bdf8');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('converter');

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'converter', label: t('base.tab.converter') },
    { id: 'guide', label: t('base.tab.guide') },
  ];

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

          <BaseWorkbench quickMode={mode === 'quick'} teachingMode={mode === 'teaching'} />

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
          hidden={workspace !== 'guide'}
          aria-label={t('base.tab.guide')}
        >
          <BaseGuide />
        </section>
      </main>
    </div>
  );
}
