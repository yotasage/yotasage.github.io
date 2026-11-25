import React from 'react';

import PageHead from '../../components/PageHead';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import Viewer3D from '../../components/Viewer3D/Viewer3D';
import { useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import { FORMAT_GROUPS } from '../../lib/viewer3d/formats';
import styles from '../../styles/Viewer3D.module.css';

type WorkspaceId = 'workbench' | 'guide';

export default function Viewer3DPage() {
  useDesignSystemPage('#ea580c', '#f08c3c');
  const { t } = useI18n();
  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'workbench', label: t('viewer3d.workbench') },
    { id: 'guide', label: t('viewer3d.guide') },
  ];

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('viewer3d.pageTitle')}
        description="Inspect STEP, IGES, STL, 3MF, OBJ, glTF, FBX, and USDZ 3D models in your browser with section cuts, measurements, and export. Files stay on your device."
        path="/3d-viewer/main"
        ogImage="/og/3d-viewer.png"
        ogAlt="Flanged L-bracket 3D model rendered in the browser 3D viewer with dimensions and mesh statistics"
      />

      <ToolHeader<WorkspaceId>
        title={t('viewer3d.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        {/* Kept mounted so an opened 3D scene is never discarded when reading the guide. */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'workbench'}
          aria-label={t('viewer3d.workbench')}
        >
          <p className={styles.lead}>{t('viewer3d.lead')}</p>
          <Viewer3D onOpenGuide={() => setWorkspace('guide')} />
        </section>

        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'guide'}
          aria-label={t('viewer3d.guide')}
        >
          <div className={styles.guideLayout}>
            <div className={styles.guideHeader}>
              <div>
                <h2>{t('viewer3d.guide.title')}</h2>
                <p>{t('viewer3d.guide.lead')}</p>
              </div>
              <button
                type="button"
                className={styles.buttonSmall}
                onClick={() => setWorkspace('workbench')}
              >
                {t('viewer3d.guide.backToWorkbench')}
              </button>
            </div>

            <article className={styles.guideCard}>
              <h3>{t('viewer3d.guide.formatsTitle')}</h3>
              <dl className={styles.formatList}>
                {FORMAT_GROUPS.map((g, idx) => {
                  const titleKeys = ['viewer3d.fmt.cadTitle', 'viewer3d.fmt.meshTitle', 'viewer3d.fmt.sceneTitle', 'viewer3d.fmt.pointTitle'] as const;
                  const titleText = titleKeys[idx] ? t(titleKeys[idx]) : g.title;
                  const noteText = idx === 0 && g.note ? t('viewer3d.fmt.cadNote') : g.note;
                  return (
                    <div key={g.title} className={styles.formatItem}>
                      <dt>{titleText}</dt>
                      <dd>
                        {g.formats}
                        {noteText && <small>{noteText}</small>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>

            <div className={styles.guideGrid}>
              <article className={styles.guideCard}>
                <h3>{t('viewer3d.guide.controlsTitle')}</h3>
                <ul className={styles.guideList}>
                  <li><strong>{t('viewer3d.guide.orbitStrong')}</strong>{t('viewer3d.guide.orbitBody')}</li>
                  <li><strong>{t('viewer3d.guide.panStrong')}</strong>{t('viewer3d.guide.panBody')}</li>
                  <li><strong>{t('viewer3d.guide.zoomStrong')}</strong>{t('viewer3d.guide.zoomBody')}</li>
                  <li><strong>{t('viewer3d.guide.pivotStrong')}</strong>{t('viewer3d.guide.pivotBody')}</li>
                  <li>
                    <strong>{t('viewer3d.guide.viewsStrong')}</strong>
                    {t('viewer3d.guide.viewsPre')}
                    <code>{t('viewer3d.ws.fit')}</code>, <code>{t('viewer3d.ws.viewIso')}</code>, <code>{t('viewer3d.ws.viewFront')}</code>, <code>{t('viewer3d.ws.viewTop')}</code>, <code>{t('viewer3d.ws.viewRight')}</code>
                    {t('viewer3d.guide.viewsPost')}
                  </li>
                  <li>
                    <strong>{t('viewer3d.guide.projStrong')}</strong>
                    {t('viewer3d.guide.projPre')}
                    <code>{t('viewer3d.ws.ortho')}</code>
                    {t('viewer3d.guide.projPost')}
                  </li>
                </ul>
              </article>

              <article className={styles.guideCard}>
                <h3>{t('viewer3d.guide.toolsTitle')}</h3>
                <ul className={styles.guideList}>
                  <li><strong>{t('viewer3d.guide.secStrong')}</strong>{t('viewer3d.guide.secBody')}</li>
                  <li>
                    <strong>{t('viewer3d.guide.measStrong')}</strong>
                    {t('viewer3d.guide.measPre')}
                    <code>{t('viewer3d.ws.measure')}</code>
                    {t('viewer3d.guide.measPost')}
                  </li>
                  <li>
                    <strong>{t('viewer3d.guide.multiStrong')}</strong>
                    {t('viewer3d.guide.multiPre')}
                    <code>{t('viewer3d.ws.addFiles')}</code>
                    {t('viewer3d.guide.multiMid')}
                    <code>{t('viewer3d.card.positions')}</code>
                    {t('viewer3d.guide.multiPost')}
                  </li>
                  <li><strong>{t('viewer3d.guide.treeStrong')}</strong>{t('viewer3d.guide.treeBody')}</li>
                  <li>
                    <strong>{t('viewer3d.guide.expStrong')}</strong>
                    {t('viewer3d.guide.expPre')}
                    <code>STL</code>, <code>OBJ</code>, <code>PLY</code>
                    {t('viewer3d.guide.expOr')}
                    <code>GLB</code>
                    {t('viewer3d.guide.expPost')}
                  </li>
                </ul>
              </article>
            </div>

            <article className={styles.guideCard}>
              <h3>{t('viewer3d.guide.privacyTitle')}</h3>
              <p>{t('viewer3d.guide.privacyBody')}</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
