import React from 'react';

import PageHead from '../../components/PageHead';
import PcbViewer, { PCB_FORMATS } from '../../components/PcbViewer/PcbViewer';
import ExamplesGallery, { type ExampleCardItem } from '../../components/UI/ExamplesGallery';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import {
  loadPcbExampleFiles,
  PCB_EXAMPLE_PRESETS,
  type PcbExampleId,
} from '../../lib/pcb/examples';
import type { PickedFile } from '../../lib/pcb/load';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/PcbViewer.module.css';

type WorkspaceId = 'workbench' | 'examples' | 'guide';

export default function PcbViewerPage() {
  useDesignSystemPage('#65a30d', '#9ccc3c');
  const { t } = useI18n();
  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');
  const [externalLoad, setExternalLoad] = React.useState<{ files: PickedFile[]; seq: number } | null>(null);
  const [loadingExampleId, setLoadingExampleId] = React.useState<PcbExampleId | null>(null);
  const [exampleError, setExampleError] = React.useState<string | null>(null);

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'workbench', label: t('pcb.workbench') },
    { id: 'examples', label: t('ex.tab') },
    { id: 'guide', label: t('pcb.guide') },
  ];

  const exampleItems: readonly ExampleCardItem<PcbExampleId>[] = React.useMemo(
    () =>
      PCB_EXAMPLE_PRESETS.map((p) => ({
        id: p.id,
        tag: t(`ex.pcb.${p.id}.tag` as TranslationKey),
        code: p.code,
        title: t(`ex.pcb.${p.id}.title` as TranslationKey),
        description: t(`ex.pcb.${p.id}.desc` as TranslationKey),
      })),
    [t],
  );

  const handleSelectExample = React.useCallback(
    async (id: PcbExampleId) => {
      if (loadingExampleId) return;
      setLoadingExampleId(id);
      setExampleError(null);
      try {
        const files = await loadPcbExampleFiles(id);
        setExternalLoad((prev) => ({ files, seq: (prev?.seq ?? 0) + 1 }));
        setWorkspace('workbench');
      } catch (e) {
        setExampleError(
          t('ex.errorLoad', { msg: e instanceof Error ? e.message : String(e) }),
        );
      } finally {
        setLoadingExampleId(null);
      }
    },
    [loadingExampleId, t],
  );

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('pcb.pageTitle')}
        description="Inspect Gerber, Excellon, KiCad, Altium, PADS, and EAGLE PCB files locally in layer or realistic view, measure nets, export drawings, or convert to KiCad."
        path="/pcb-viewer/main"
        ogImage="/og/pcb-viewer.png"
        ogAlt="Realistic top view of a four-layer green ENIG printed circuit board in the PCB viewer"
      />

      <ToolHeader<WorkspaceId>
        title={t('pcb.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        {/* Kept mounted so an opened board is never lost when reading the guide or browsing examples. */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'workbench'}
          aria-label={t('pcb.workbench')}
        >
          <p className={styles.lead}>{t('pcb.lead')}</p>
          <PcbViewer
            onOpenGuide={() => setWorkspace('guide')}
            externalLoad={externalLoad}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'examples'}
          aria-label={t('ex.tab')}
        >
          <ExamplesGallery<PcbExampleId>
            title={t('ex.pcb.title')}
            subtitle={t('ex.pcb.lead')}
            items={exampleItems}
            defaultActionLabel={t('ex.pcb.action')}
            loadingLabel={t('ex.loading')}
            loadingId={loadingExampleId}
            error={exampleError}
            onSelect={handleSelectExample}
          />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'guide'}
          aria-label={t('pcb.guide')}
        >
          <div className={styles.guideLayout}>
            <div className={styles.guideHeader}>
              <div>
                <h2>{t('pcb.guide.title')}</h2>
                <p>{t('pcb.guide.lead')}</p>
              </div>
              <button
                type="button"
                className={styles.buttonSmall}
                onClick={() => setWorkspace('workbench')}
              >
                {t('pcb.guide.backToWorkbench')}
              </button>
            </div>

            <article className={styles.guideCard}>
              <h3>{t('pcb.guide.formatsTitle')}</h3>
              <dl className={styles.formatList}>
                {PCB_FORMATS.map((g, idx) => {
                  const fmtMap = [
                    ['pcb.fmt.gerberTitle', 'pcb.fmt.gerberFmt', 'pcb.fmt.gerberNote'],
                    ['pcb.fmt.drillTitle', 'pcb.fmt.drillFmt', 'pcb.fmt.drillNote'],
                    ['pcb.fmt.jobTitle', null, 'pcb.fmt.jobNote'],
                    ['pcb.fmt.pnpTitle', 'pcb.fmt.pnpFmt', 'pcb.fmt.pnpNote'],
                    ['pcb.fmt.kicadTitle', 'pcb.fmt.kicadFmt', 'pcb.fmt.kicadNote'],
                    ['pcb.fmt.altiumTitle', 'pcb.fmt.altiumFmt', 'pcb.fmt.altiumNote'],
                    ['pcb.fmt.padsTitle', 'pcb.fmt.padsFmt', 'pcb.fmt.padsNote'],
                    ['pcb.fmt.eagleTitle', 'pcb.fmt.eagleFmt', 'pcb.fmt.eagleNote'],
                    ['pcb.fmt.archTitle', 'pcb.fmt.archFmt', null],
                  ] as const;
                  const entry = fmtMap[idx];
                  const titleText = entry ? t(entry[0]) : g.title;
                  const formatsText = entry && entry[1] ? t(entry[1]) : g.formats;
                  const noteText = entry && entry[2] ? t(entry[2]) : g.note;
                  return (
                    <div key={g.title} className={styles.formatItem}>
                      <dt>{titleText}</dt>
                      <dd>
                        {formatsText}
                        {noteText && <small>{noteText}</small>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>

            <div className={styles.guideGrid}>
              <article className={styles.guideCard}>
                <h3>{t('pcb.guide.viewsTitle')}</h3>
                <ul className={styles.guideList}>
                  <li><strong>{t('pcb.guide.layerStrong')}</strong>{t('pcb.guide.layerBody')}</li>
                  <li><strong>{t('pcb.guide.realStrong')}</strong>{t('pcb.guide.realBody')}</li>
                  <li>
                    <strong>{t('pcb.guide.navStrong')}</strong>
                    {t('pcb.guide.navPre')}
                    <code>F</code>
                    {t('pcb.guide.navMid1')}
                    <code>+</code>/<code>−</code>
                    {t('pcb.guide.navMid2')}
                    <code>Esc</code>
                    {t('pcb.guide.navPost')}
                  </li>
                  <li>
                    <strong>{t('pcb.guide.unitsStrong')}</strong>
                    {t('pcb.guide.unitsPre')}
                    <code>mm</code>
                    {t('pcb.guide.unitsAnd')}
                    <code>{t('pcb.ws.inch')}</code>
                    {t('pcb.guide.unitsPost')}
                  </li>
                </ul>
              </article>

              <article className={styles.guideCard}>
                <h3>{t('pcb.guide.inspectTitle')}</h3>
                <ul className={styles.guideList}>
                  <li><strong>{t('pcb.guide.clickStrong')}</strong>{t('pcb.guide.clickBody')}</li>
                  <li><strong>{t('pcb.guide.hlStrong')}</strong>{t('pcb.guide.hlBody')}</li>
                  <li>
                    <strong>{t('pcb.guide.measStrong')}</strong>
                    {t('pcb.guide.measPre')}
                    <code>{t('pcb.ws.measure')}</code>
                    {t('pcb.guide.measPost')}
                  </li>
                  <li>
                    <strong>{t('pcb.guide.expStrong')}</strong>
                    {t('pcb.guide.expPre')}
                    <code>PNG</code>
                    {t('pcb.guide.expOr')}
                    <code>SVG</code>
                    {t('pcb.guide.expMid1')}
                    <code>PDF</code>
                    {t('pcb.guide.expMid2')}
                    <code>DXF</code>, <code>BOM / Pick-and-place CSV</code>
                    {t('pcb.guide.expMid3')}
                    <code>.kicad_pcb</code>.
                  </li>
                </ul>
              </article>
            </div>

            <article className={styles.guideCard}>
              <h3>{t('pcb.guide.privacyTitle')}</h3>
              <p>{t('pcb.guide.privacyBody')}</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
