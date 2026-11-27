import React from 'react';

import PageHead from '../../components/PageHead';
import NotepadWorkspace from '../../components/Notepad/NotepadWorkspace';
import ExamplesGallery, { type ExampleCardItem } from '../../components/UI/ExamplesGallery';
import ToolHeader, { type WorkspaceTab } from '../../components/UI/ToolHeader';
import {
  SCRATCHPAD_EXAMPLE_PRESETS,
  type ScratchpadExampleId,
} from '../../lib/notepad/examples';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Notepad.module.css';

type WorkspaceId = 'workbench' | 'examples';

export default function ScratchpadPage() {
  useDesignSystemPage('#059669', '#34d399');
  const { t } = useI18n();
  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');
  const [exampleRequest, setExampleRequest] = React.useState<{
    id: ScratchpadExampleId;
    seq: number;
  } | null>(null);

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = React.useMemo(
    () => [
      { id: 'workbench', label: t('notepad.title') },
      { id: 'examples', label: t('ex.tab') },
    ],
    [t],
  );

  const exampleItems: readonly ExampleCardItem<ScratchpadExampleId>[] = React.useMemo(
    () =>
      SCRATCHPAD_EXAMPLE_PRESETS.map((p) => ({
        id: p.id,
        tag: t(`ex.pad.${p.id}.tag` as TranslationKey),
        code: p.code,
        title: t(`ex.pad.${p.id}.title` as TranslationKey),
        description: t(`ex.pad.${p.id}.desc` as TranslationKey),
      })),
    [t],
  );

  const handleSelectExample = React.useCallback((id: ScratchpadExampleId) => {
    setExampleRequest((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
    setWorkspace('workbench');
  }, []);

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('notepad.pageTitle')}
        description={t('notepad.metaDescription')}
        path="/scratchpad/main"
        ogImage="/og/home.png"
        ogAlt="Scratchpad browser text and code editor powered by Monaco Editor with side-by-side and grid views, diff comparison, regex and extended search/replace, CSV and LaTeX highlighting, and local persistence"
      />

      <ToolHeader<WorkspaceId>
        title={t('notepad.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode={false}
      />

      <main className={styles.main}>
        <div className={styles.workbenchWrap} hidden={workspace !== 'workbench'}>
          <NotepadWorkspace exampleRequest={exampleRequest} />
        </div>

        <section
          className={styles.examplesScroll}
          hidden={workspace !== 'examples'}
          aria-label={t('ex.tab')}
        >
          <ExamplesGallery<ScratchpadExampleId>
            title={t('ex.pad.title')}
            subtitle={t('ex.pad.lead')}
            items={exampleItems}
            defaultActionLabel={t('ex.pad.action')}
            padded
            onSelect={handleSelectExample}
          />
        </section>
      </main>
    </div>
  );
}
