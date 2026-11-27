import React from 'react';

import PageHead from '../../components/PageHead';
import RegexTheory from '../../components/Regex/RegexTheory';
import RegexWorkbench, {
  createInitialWorkbenchState,
  RegexWorkbenchState,
} from '../../components/Regex/RegexWorkbench';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { FLAVORS } from '../../lib/regex/flavors';
import { TheoryTrySnippet } from '../../lib/regex/theory';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Regex.module.css';

type WorkspaceId = 'workbench' | 'theory';

export default function RegexToolPage() {
  useDesignSystemPage('#be123c', '#fb7185');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');
  const [workbenchState, setWorkbenchState] = React.useState<RegexWorkbenchState>(
    createInitialWorkbenchState,
  );

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'workbench', label: t('regex.tab.workbench') },
    { id: 'theory', label: t('regex.tab.theory') },
  ];

  const handleTrySnippet = (snippet: TheoryTrySnippet) => {
    const flavor = snippet.flavor ?? 'js';
    setWorkbenchState({
      pattern: snippet.pattern,
      testText: snippet.testText,
      flavor,
      delimiter: snippet.delimiter ?? FLAVORS[flavor].defaultDelimiter,
      flags: [...snippet.flags],
      template: snippet.template,
      extractionMode: snippet.extractionMode ?? 'extract',
      joinMode: 'newline',
      activeExampleId: null,
    });
    setWorkspace('workbench');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('regex.pageTitle')}
        description={t('regex.metaDescription')}
        path="/regex/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('regex.title')}
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
          aria-label={t('regex.tab.workbench')}
        >
          <p className={styles.lead}>{t('regex.lead')}</p>

          {mode === 'quick' && (
            <div className={styles.quickBanner}>
              <div className={styles.quickBannerText}>
                <span className={styles.quickBadge}>{t('regex.quick.badge')}</span>
                <span>{t('regex.quick.bannerText')}</span>
              </div>
              <div className={styles.quickActions}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setMode('standard')}
                >
                  {t('regex.quick.switchStandard')}
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setMode('teaching')}
                >
                  {t('regex.quick.switchTeaching')}
                </button>
              </div>
            </div>
          )}

          <RegexWorkbench
            state={workbenchState}
            onStateChange={setWorkbenchState}
            quickMode={mode === 'quick'}
          />

          {mode === 'teaching' && (
            <div className={styles.teachingGrid}>
              <TeachingCallout
                title={t('regex.teaching.engineTitle')}
                onTheoryClick={() => setWorkspace('theory')}
              >
                {t('regex.teaching.engineBody')}
              </TeachingCallout>
              <TeachingCallout
                title={t('regex.teaching.groupsTitle')}
                onTheoryClick={() => setWorkspace('theory')}
              >
                {t('regex.teaching.groupsBody')}
              </TeachingCallout>
            </div>
          )}
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'theory'}
          aria-label={t('regex.tab.theory')}
        >
          <RegexTheory onTrySnippet={handleTrySnippet} />
        </section>
      </main>
    </div>
  );
}
