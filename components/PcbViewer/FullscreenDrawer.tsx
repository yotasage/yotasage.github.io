import React from 'react';

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
  const tabs: Array<{ id: FullscreenTab; label: string }> = [
    { id: 'layers', label: `Layers (${layerCount})` },
    { id: 'stats', label: 'Stats' },
    ...(hasParts ? [{ id: 'parts' as const, label: 'Parts' }] : []),
    { id: 'tools', label: 'Tools' },
  ];

  const effectiveTab: FullscreenTab = activeTab === 'parts' && !hasParts ? 'tools' : activeTab;

  return (
    <>
      <div
        className={styles.fsDrawerBackdrop}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside className={styles.fsDrawer} aria-label="Full screen tools and layers">
        <div className={styles.fsDrawerHeader}>
          <div className={styles.fsDrawerTabs} role="tablist" aria-label="Full screen panels">
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
            aria-label="Close panel"
            title="Close panel"
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
