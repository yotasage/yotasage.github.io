import React from 'react';

import Decoder from '../../components/Base64Image/Decoder';
import Encoder from '../../components/Base64Image/Encoder';
import PageHead from '../../components/PageHead';
import PillTabs, { PillTabItem } from '../../components/UI/PillTabs';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Base64Image.module.css';

type WorkspaceId = 'workbench' | 'guide';
type DirectionTab = 'encode' | 'decode';

export default function Base64Image() {
  useDesignSystemPage('#16a34a', '#3dbb78');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');
  const [direction, setDirection] = React.useState<DirectionTab>('encode');

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'workbench', label: t('base64.workbench') },
    { id: 'guide', label: t('base64.guide') },
  ];

  const directionTabs: readonly PillTabItem<DirectionTab>[] = [
    { id: 'encode', label: t('base64.tab.encode') },
    { id: 'decode', label: t('base64.tab.decode') },
  ];

  const isQuick = mode === 'quick';

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('base64.pageTitle')}
        description="Convert images to Base64 or ready-to-paste HTML, CSS, and Markdown data URLs, or decode Base64 strings back into downloadable image previews locally."
        path="/base64-image/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('base64.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        <section className={styles.workspacePanel} hidden={workspace !== 'workbench'} aria-label={t('base64.workbench')}>
          <p className={styles.lead}>{t('base64.lead')}</p>

          {isQuick && (
            <>
              <div className={styles.quickBanner}>
                <div className={styles.quickBannerText}>
                  <span className={styles.quickBadge}>{t('base64.quick.badge')}</span>
                  <span>{t('base64.quick.bannerText')}</span>
                </div>
                <div className={styles.quickActions}>
                  <button type="button" className={styles.buttonSmall} onClick={() => setMode('standard')}>
                    {t('base64.quick.switchStandard')}
                  </button>
                  <button type="button" className={styles.buttonSmall} onClick={() => setMode('teaching')}>
                    {t('base64.quick.switchTeaching')}
                  </button>
                </div>
              </div>

              <div className={styles.quickTabBar}>
                <PillTabs<DirectionTab>
                  items={directionTabs}
                  value={direction}
                  onChange={setDirection}
                  ariaLabel={t('base64.tabsAria')}
                  idPrefix="b64-dir"
                />
              </div>
            </>
          )}

          {/* Kept mounted across Quick / Standard / Teaching so loaded files & pasted Base64 never reset. */}
          <div className={isQuick ? styles.quickContainer : styles.layout}>
            <div
              id="b64-dir-panel-encode"
              className={styles.tabPanel}
              hidden={isQuick && direction !== 'encode'}
            >
              <Encoder />
            </div>
            <div
              id="b64-dir-panel-decode"
              className={styles.tabPanel}
              hidden={isQuick && direction !== 'decode'}
            >
              <Decoder />
            </div>
          </div>

          {mode === 'teaching' && (
            <div className={styles.teachingGrid}>
              <TeachingCallout
                title={t('base64.teaching.overheadTitle')}
                formula={<span className={styles.formulaPill}>chars = 4 × ⌈bytes / 3⌉ ≈ 1.333 × bytes</span>}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('base64.teaching.overheadBody')}
              </TeachingCallout>
              <TeachingCallout
                title={t('base64.teaching.dataUrlTitle')}
                formula={<span className={styles.formulaPill}>data:image/png;base64,&lt;payload&gt;</span>}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('base64.teaching.dataUrlBody')}
              </TeachingCallout>
              <TeachingCallout
                title={t('base64.teaching.inlineTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('base64.teaching.inlineBody')}
              </TeachingCallout>
            </div>
          )}
        </section>

        <section className={styles.workspacePanel} hidden={workspace !== 'guide'} aria-label={t('base64.guide')}>
          <div className={styles.guideLayout}>
            <div className={styles.guideHeader}>
              <h2>{t('base64.guide.title')}</h2>
              <p>{t('base64.guide.lead')}</p>
            </div>

            <div className={styles.guideGrid}>
              <article className={styles.card}>
                <h2>{t('base64.guide.encodingTitle')}</h2>
                <p>{t('base64.guide.encodingBody')}</p>
                <pre className={styles.codeBlock}>{`3 bytes (24 bits) → 4 × 6-bit indices (0..63)\nStandard alphabet: A–Z  a–z  0–9  +  /\nURL-safe alphabet: A–Z  a–z  0–9  -  _`}</pre>
              </article>

              <article className={styles.card}>
                <h2>{t('base64.guide.overheadTitle')}</h2>
                <p>{t('base64.guide.overheadBody')}</p>
                <pre className={styles.codeBlock}>{`chars = 4 × ceil(bytes / 3)\n  3 KB PNG  →  ~4.0 KB Base64 (+33.3 %)\n 30 KB JPEG → ~40.0 KB Base64 (+33.3 %)`}</pre>
              </article>

              <article className={styles.card}>
                <h2>{t('base64.guide.mimeTitle')}</h2>
                <p>{t('base64.guide.mimeBody')}</p>
                <table className={styles.guideTable}>
                  <thead>
                    <tr>
                      <th>Format</th>
                      <th>MIME type</th>
                      <th>Best for</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>PNG</td><td><code>image/png</code></td><td>Lossless UI, sharp icons, alpha</td></tr>
                    <tr><td>JPEG</td><td><code>image/jpeg</code></td><td>Photos without transparency</td></tr>
                    <tr><td>WebP</td><td><code>image/webp</code></td><td>Compact photos &amp; alpha</td></tr>
                    <tr><td>SVG</td><td><code>image/svg+xml</code></td><td>Crisp vectors (or percent-encoded)</td></tr>
                  </tbody>
                </table>
              </article>

              <article className={styles.card}>
                <h2>{t('base64.guide.snippetsTitle')}</h2>
                <p>{t('base64.guide.snippetsBody')}</p>
                <pre className={styles.codeBlock}>{`<!-- HTML -->\n<img src="data:image/png;base64,..." width="64" height="64" alt="">\n\n/* CSS */\nbackground-image: url("data:image/svg+xml;base64,...");\n\n<!-- Markdown -->\n![icon](data:image/png;base64,...)`}</pre>
              </article>
            </div>

            <article className={styles.card}>
              <h2>{t('base64.guide.privacyTitle')}</h2>
              <p>{t('base64.guide.privacyBody')}</p>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
