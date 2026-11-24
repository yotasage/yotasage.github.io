import { useEffect, useMemo, useState } from 'react';

import { buildSandboxedHtmlSrcDoc } from '../../lib/notepad/htmlPreview';
import { useI18n } from '../../lib/ui/i18n';
import { ResolvedTheme } from '../../lib/ui/theme';
import styles from '../../styles/NotepadPreview.module.css';

export interface HtmlPreviewProps {
  content: string;
  fileName: string;
  theme: ResolvedTheme;
}

type ViewportPreset = 'full' | 'tablet' | 'phone';

const VIEWPORT_WIDTHS: Record<Exclude<ViewportPreset, 'full'>, string> = {
  tablet: '768px',
  phone: '390px',
};

export default function HtmlPreview({ content, fileName, theme }: HtmlPreviewProps) {
  const { t } = useI18n();
  // SECURITY: Scripts are ALWAYS OFF by default and only enabled on explicit user opt-in.
  const [allowScripts, setAllowScripts] = useState(false);
  const [liveUpdate, setLiveUpdate] = useState(true);
  const [viewport, setViewport] = useState<ViewportPreset>('full');
  const [reloadKey, setReloadKey] = useState(0);
  const [debouncedContent, setDebouncedContent] = useState(content);

  useEffect(() => {
    if (!liveUpdate) return;
    const timer = window.setTimeout(() => {
      setDebouncedContent(content);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [content, liveUpdate]);

  const srcDoc = useMemo(
    () =>
      buildSandboxedHtmlSrcDoc(debouncedContent, {
        fileName,
        allowScripts,
        theme,
      }),
    [debouncedContent, fileName, allowScripts, theme],
  );

  const handleReload = () => {
    setDebouncedContent(content);
    setReloadKey((k) => k + 1);
  };

  const isConstrained = viewport !== 'full';

  return (
    <div className={styles.htmlShell}>
      <div className={styles.htmlBar}>
        <div className={styles.htmlBarGroup}>
          <span className={allowScripts ? styles.htmlPillScripts : styles.htmlPillSafe}>
            {allowScripts ? t('notepad.html.sandboxScripts') : t('notepad.html.sandboxSafe')}
          </span>

          <label className={styles.htmlCheckLabel}>
            <input
              type="checkbox"
              checked={allowScripts}
              onChange={(e) => setAllowScripts(e.target.checked)}
            />
            <span>{t('notepad.html.allowScripts')}</span>
          </label>

          <label className={styles.htmlCheckLabel}>
            <input
              type="checkbox"
              checked={liveUpdate}
              onChange={(e) => {
                const next = e.target.checked;
                setLiveUpdate(next);
                if (next) setDebouncedContent(content);
              }}
            />
            <span>{t('notepad.html.live')}</span>
          </label>

          <button type="button" className={styles.htmlActionBtn} onClick={handleReload}>
            {t('notepad.html.reload')}
          </button>
        </div>

        <div
          className={styles.htmlViewportGroup}
          role="group"
          aria-label={t('notepad.html.viewportAria')}
        >
          <button
            type="button"
            aria-pressed={viewport === 'full'}
            className={[
              styles.htmlViewportBtn,
              viewport === 'full' ? styles.htmlViewportBtnActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setViewport('full')}
          >
            {t('notepad.html.viewportFull')}
          </button>
          <button
            type="button"
            aria-pressed={viewport === 'tablet'}
            className={[
              styles.htmlViewportBtn,
              viewport === 'tablet' ? styles.htmlViewportBtnActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setViewport('tablet')}
          >
            768px
          </button>
          <button
            type="button"
            aria-pressed={viewport === 'phone'}
            className={[
              styles.htmlViewportBtn,
              viewport === 'phone' ? styles.htmlViewportBtnActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setViewport('phone')}
          >
            390px
          </button>
        </div>
      </div>

      <div
        className={[styles.htmlStage, isConstrained ? styles.htmlStageConstrained : '']
          .filter(Boolean)
          .join(' ')}
      >
        {/* SECURITY: Never grant allow-same-origin, allow-top-navigation, or allow-popups. */}
        <iframe
          key={reloadKey}
          sandbox={allowScripts ? 'allow-scripts allow-forms' : 'allow-forms'}
          srcDoc={srcDoc}
          title={t('notepad.html.iframeTitle', { name: fileName })}
          className={[styles.htmlFrame, isConstrained ? styles.htmlFrameConstrained : '']
            .filter(Boolean)
            .join(' ')}
          style={isConstrained ? { width: VIEWPORT_WIDTHS[viewport] } : undefined}
        />
      </div>
    </div>
  );
}
