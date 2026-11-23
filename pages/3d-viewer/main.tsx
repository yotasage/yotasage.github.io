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
                {FORMAT_GROUPS.map((g) => (
                  <div key={g.title} className={styles.formatItem}>
                    <dt>{g.title}</dt>
                    <dd>
                      {g.formats}
                      {g.note && <small>{g.note}</small>}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>

            <div className={styles.guideGrid}>
              <article className={styles.guideCard}>
                <h3>{t('viewer3d.guide.controlsTitle')}</h3>
                <ul className={styles.guideList}>
                  <li><strong>Orbit:</strong> Drag with left mouse button (or one finger on touch screens).</li>
                  <li><strong>Pan:</strong> Right-drag or Shift-drag (or two-finger drag on touch).</li>
                  <li><strong>Zoom:</strong> Scroll wheel or pinch gesture.</li>
                  <li><strong>Pivot focus:</strong> Double-click / double-tap any point on the model to orbit around it.</li>
                  <li><strong>Standard views:</strong> Use <code>Fit</code>, <code>Isometric</code>, <code>Front</code>, <code>Top</code>, <code>Right</code>, or click an axis on the orientation gizmo.</li>
                  <li><strong>Projection:</strong> Toggle <code>Orthographic</code> to remove perspective foreshortening when checking alignment.</li>
                </ul>
              </article>

              <article className={styles.guideCard}>
                <h3>{t('viewer3d.guide.toolsTitle')}</h3>
                <ul className={styles.guideList}>
                  <li><strong>Section cuts:</strong> Slice along X, Y, or Z and drag the slider to inspect internal walls; cut interiors highlight in orange.</li>
                  <li><strong>Point-to-point measure:</strong> Enable <code>Measure</code> and click two points on the surface to read total distance and ΔX / ΔY / ΔZ.</li>
                  <li><strong>Multi-file comparison:</strong> Use <code>Add files</code> to open multiple models together and spread them apart in <code>Positions</code>.</li>
                  <li><strong>Part tree &amp; statistics:</strong> Inspect bounding box, triangle count, surface area, and closed-mesh volume, and toggle individual parts.</li>
                  <li><strong>Export:</strong> Save models as <code>STL</code>, <code>OBJ</code>, <code>PLY</code>, or <code>GLB</code>, or capture a PNG screenshot (optionally transparent).</li>
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
