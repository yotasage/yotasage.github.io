import React from 'react';

import PageHead from '../../components/PageHead';
import PcbViewer, { PCB_FORMATS } from '../../components/PcbViewer/PcbViewer';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/PcbViewer.module.css';

type WorkspaceId = 'workbench' | 'guide';

export default function PcbViewerPage() {
  useDesignSystemPage('#65a30d', '#9ccc3c');
  const { t } = useI18n();
  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'workbench', label: t('pcb.workbench') },
    { id: 'guide', label: t('pcb.guide') },
  ];

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
      />

      <main className={styles.main}>
        {/* Kept mounted so an opened board is never lost when reading the guide. */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'workbench'}
          aria-label={t('pcb.workbench')}
        >
          <p className={styles.lead}>{t('pcb.lead')}</p>
          <PcbViewer onOpenGuide={() => setWorkspace('guide')} />
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
                {PCB_FORMATS.map((g) => (
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
                <h3>{t('pcb.guide.viewsTitle')}</h3>
                <ul className={styles.guideList}>
                  <li><strong>Layer view:</strong> Show or hide individual copper, mask, silkscreen, paste, drill, and fabrication layers, reorder draw order, and customize layer colours.</li>
                  <li><strong>Realistic view:</strong> Preview solder mask, silkscreen, copper finish (ENIG / HASL / bare), and drilled holes from Top or mirrored Bottom.</li>
                  <li><strong>Navigation:</strong> Drag to pan, scroll or pinch to zoom, press <code>F</code> to fit the board, arrow keys to pan, <code>+</code>/<code>−</code> to zoom, and <code>Esc</code> to clear overlays.</li>
                  <li><strong>Units:</strong> Switch live cursor readout, board dimensions, and measurements between <code>mm</code> and <code>inch</code>.</li>
                </ul>
              </article>

              <article className={styles.guideCard}>
                <h3>{t('pcb.guide.inspectTitle')}</h3>
                <ul className={styles.guideList}>
                  <li><strong>Click to inspect:</strong> Click any pad, track, via, hole, or component to view its layer, size, net, and footprint (click the same spot again to cycle stacked items).</li>
                  <li><strong>Net &amp; part highlight:</strong> Search components or nets in the sidebar to highlight them across every layer and zoom right in.</li>
                  <li><strong>Precision measure:</strong> Enable <code>Measure</code> to snap to pad centres and drill holes for ΔX, ΔY, and straight-line distance.</li>
                  <li><strong>Exports:</strong> Save views as <code>PNG</code> or <code>SVG</code>, print-ready 1:1 <code>PDF</code>, outline or layer <code>DXF</code>, <code>BOM / Pick-and-place CSV</code>, or convert Altium/PADS/EAGLE boards to <code>.kicad_pcb</code>.</li>
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
