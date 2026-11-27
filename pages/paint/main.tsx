import React from 'react';

import PageHead from '../../components/PageHead';
import PaintWorkspace from '../../components/Paint/PaintWorkspace';
import ExamplesGallery, { type ExampleCardItem } from '../../components/UI/ExamplesGallery';
import ToolHeader, { type WorkspaceTab } from '../../components/UI/ToolHeader';
import { PAINT_EXAMPLES, type PaintExampleId } from '../../lib/paint/examples';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Paint.module.css';

type WorkspaceId = 'workbench' | 'examples';

export default function PaintPage() {
  useDesignSystemPage('#2563eb', '#60a5fa');
  const { t } = useI18n();
  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');
  const [exampleRequest, setExampleRequest] = React.useState<{
    id: PaintExampleId;
    seq: number;
  } | null>(null);

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = React.useMemo(
    () => [
      { id: 'workbench', label: t('paint.title') },
      { id: 'examples', label: t('ex.tab') },
    ],
    [t],
  );

  const exampleItems: readonly ExampleCardItem<PaintExampleId>[] = React.useMemo(
    () =>
      PAINT_EXAMPLES.map((p) => ({
        id: p.id,
        tag: t(p.tagKey as TranslationKey),
        code: p.code,
        title: t(p.titleKey as TranslationKey),
        description: t(p.descKey as TranslationKey),
      })),
    [t],
  );

  const handleSelectExample = React.useCallback((id: PaintExampleId) => {
    setExampleRequest((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
    setWorkspace('workbench');
  }, []);

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('paint.pageTitle')}
        description={t('paint.metaDescription')}
        path="/paint/main"
        ogImage="/og/home.png"
        ogAlt="Raster image editor with multi-file tabs, thumbnail previews, layers, crop, resize, scale down, rotate, black and white color styles, and dockable panels"
      />

      <ToolHeader<WorkspaceId>
        title={t('paint.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode={false}
      />

      <main className={styles.main}>
        <div className={styles.workbenchWrap} hidden={workspace !== 'workbench'}>
          <PaintWorkspace exampleRequest={exampleRequest} />
        </div>

        <section
          className={styles.examplesScroll}
          hidden={workspace !== 'examples'}
          aria-label={t('ex.tab')}
        >
          <ExamplesGallery<PaintExampleId>
            title={t('ex.paint.title')}
            subtitle={t('ex.paint.lead')}
            items={exampleItems}
            defaultActionLabel={t('ex.paint.action')}
            padded
            onSelect={handleSelectExample}
          />
        </section>
      </main>
    </div>
  );
}
