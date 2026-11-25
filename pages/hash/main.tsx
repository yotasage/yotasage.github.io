import React from 'react';

import HashGuide from '../../components/Hash/HashGuide';
import HashWorkbench from '../../components/Hash/HashWorkbench';
import PageHead from '../../components/PageHead';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Hash.module.css';

type WorkspaceId = 'workbench' | 'guide';

export default function HashGeneratorPage() {
  useDesignSystemPage('#0369a1', '#38bdf8');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'workbench', label: t('hash.workbench') },
    { id: 'guide', label: t('hash.guide') },
  ];

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('hash.pageTitle')}
        description="Generate MD5, SHA-1, SHA-2, SHA-3, BLAKE2, RIPEMD-160, CRC32, and Adler-32 digests across multiple text or file inputs, verify against expected hashes, and compare outputs side by side."
        path="/hash/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('hash.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'workbench'}
          aria-label={t('hash.workbench')}
        >
          <p className={styles.lead}>{t('hash.lead')}</p>

          {mode === 'quick' && (
            <div className={styles.quickBanner}>
              <div className={styles.quickBannerText}>
                <span className={styles.quickBadge}>{t('hash.quick.badge')}</span>
                <span>{t('hash.quick.bannerText')}</span>
              </div>
              <div className={styles.quickActions}>
                <button type="button" className={styles.buttonSmall} onClick={() => setMode('standard')}>
                  {t('hash.quick.switchStandard')}
                </button>
                <button type="button" className={styles.buttonSmall} onClick={() => setMode('teaching')}>
                  {t('hash.quick.switchTeaching')}
                </button>
              </div>
            </div>
          )}

          <HashWorkbench quickMode={mode === 'quick'} />

          {mode === 'teaching' && (
            <div className={styles.teachingGrid}>
              <TeachingCallout
                title={t('hash.teaching.avalancheTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('hash.teaching.avalancheBody')}
              </TeachingCallout>
              <TeachingCallout
                title={t('hash.teaching.securityTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('hash.teaching.securityBody')}
              </TeachingCallout>
            </div>
          )}
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'guide'}
          aria-label={t('hash.guide')}
        >
          <HashGuide />
        </section>
      </main>
    </div>
  );
}
