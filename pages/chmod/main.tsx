import React from 'react';

import ChmodGuide from '../../components/Chmod/ChmodGuide';
import ChmodWorkbench from '../../components/Chmod/ChmodWorkbench';
import PageHead from '../../components/PageHead';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Chmod.module.css';

type WorkspaceId = 'calculator' | 'guide';

export default function ChmodCalculatorPage() {
  useDesignSystemPage('#4338ca', '#818cf8');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('calculator');

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'calculator', label: t('chmod.tab.calculator') },
    { id: 'guide', label: t('chmod.tab.guide') },
  ];

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('chmod.pageTitle')}
        description={t('chmod.metaDescription')}
        path="/chmod/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('chmod.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'calculator'}
          aria-label={t('chmod.tab.calculator')}
        >
          <p className={styles.lead}>{t('chmod.lead')}</p>

          {mode === 'quick' && (
            <div className={styles.quickBanner}>
              <div className={styles.quickBannerText}>
                <span className={styles.quickBadge}>{t('chmod.quick.badge')}</span>
                <span>{t('chmod.quick.bannerText')}</span>
              </div>
              <div className={styles.quickActions}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setMode('standard')}
                >
                  {t('chmod.quick.switchStandard')}
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setMode('teaching')}
                >
                  {t('chmod.quick.switchTeaching')}
                </button>
              </div>
            </div>
          )}

          <ChmodWorkbench quickMode={mode === 'quick'} />

          {mode === 'teaching' && (
            <div className={styles.teachingGrid}>
              <TeachingCallout
                title={t('chmod.teaching.octalTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('chmod.teaching.octalBody')}
              </TeachingCallout>
              <TeachingCallout
                title={t('chmod.teaching.dirExecTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('chmod.teaching.dirExecBody')}
              </TeachingCallout>
            </div>
          )}
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'guide'}
          aria-label={t('chmod.tab.guide')}
        >
          <ChmodGuide />
        </section>
      </main>
    </div>
  );
}
