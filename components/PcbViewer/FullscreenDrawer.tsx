import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PcbViewer.module.css';

export type FullscreenTab = 'layers' | 'stats' | 'parts' | 'tools';

interface FullscreenDrawerProps {
  activeTab: FullscreenTab;
  hasParts: boolean;
  layerCount: number;
  onSelectTab: (tab: FullscreenTab) => void;
  onClose: () => void;
  layersContent: React.ReactNode;
  statsContent: React.ReactNode;
  partsContent: React.ReactNode;
  toolsContent: React.ReactNode;
}

export default function FullscreenDrawer({
  activeTab,
  hasParts,
  layerCount,
  onSelectTab,
  onClose,
  layersContent,
  statsContent,
  partsContent,
  toolsContent,
}: FullscreenDrawerProps) {
  const { t } = useI18n();
  const tabs: Array<{ id: FullscreenTab; label: string }> = [
    { id: 'layers', label: t('pcb.ws.cardLayers', { n: layerCount }) },
    { id: 'stats', label: t('pcb.fs.stats') },
    ...(hasParts ? [{ id: 'parts' as const, label: t('pcb.fs.parts') }] : []),
    { id: 'tools', label: t('pcb.fs.tools') },
  ];

  const effectiveTab: FullscreenTab = activeTab === 'parts' && !hasParts ? 'tools' : activeTab;

  return (
    <>
      <div
        className={styles.fsDrawerBackdrop}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside className={styles.fsDrawer} aria-label={t('pcb.fs.aria')}>
        <div className={styles.fsDrawerHeader}>
          <div className={styles.fsDrawerTabs} role="tablist" aria-label={t('pcb.fs.tabsAria')}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={effectiveTab === tab.id}
                className={[
                  styles.fsDrawerTab,
                  effectiveTab === tab.id ? styles.fsDrawerTabActive : '',
                ].join(' ')}
                onClick={() => onSelectTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.fsDrawerClose}
            aria-label={t('pcb.fs.close')}
            title={t('pcb.fs.close')}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className={styles.fsDrawerBody}>
          {effectiveTab === 'layers' && layersContent}
          {effectiveTab === 'stats' && statsContent}
          {effectiveTab === 'parts' && partsContent}
          {effectiveTab === 'tools' && toolsContent}
        </div>
      </aside>
    </>
  );
}
