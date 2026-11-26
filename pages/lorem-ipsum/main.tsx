import React from 'react';

import LoremGuide from '../../components/Lorem/LoremGuide';
import LoremWorkbench from '../../components/Lorem/LoremWorkbench';
import PageHead from '../../components/PageHead';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Lorem.module.css';

type WorkspaceId = 'generator' | 'guide';

export default function LoremIpsumPage() {
  useDesignSystemPage('#b45309', '#f59e0b');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('generator');

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'generator', label: t('lorem.tab.generator') },
    { id: 'guide', label: t('lorem.tab.guide') },
  ];

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('lorem.pageTitle')}
        description={t('lorem.metaDescription')}
        path="/lorem-ipsum/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('lorem.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'generator'}
          aria-label={t('lorem.tab.generator')}
        >
          <p className={styles.lead}>{t('lorem.lead')}</p>

          {mode === 'quick' && (
            <div className={styles.quickBanner}>
              <div className={styles.quickBannerText}>
                <span className={styles.quickBadge}>{t('lorem.quick.badge')}</span>
                <span>{t('lorem.quick.bannerText')}</span>
              </div>
              <div className={styles.quickActions}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setMode('standard')}
                >
                  {t('lorem.quick.switchStandard')}
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setMode('teaching')}
                >
                  {t('lorem.quick.switchTeaching')}
                </button>
              </div>
            </div>
          )}

          <LoremWorkbench quickMode={mode === 'quick'} />

          {mode === 'teaching' && (
            <div className={styles.teachingGrid}>
              <TeachingCallout
                title={t('lorem.teaching.originTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('lorem.teaching.originBody')}
              </TeachingCallout>
              <TeachingCallout
                title={t('lorem.teaching.lengthTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('lorem.teaching.lengthBody')}
              </TeachingCallout>
            </div>
          )}
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'guide'}
          aria-label={t('lorem.tab.guide')}
        >
          <LoremGuide />
        </section>
      </main>
    </div>
  );
}
