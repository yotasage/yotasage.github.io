import { useEffect, useRef, useState } from 'react';

import { BLEND_MODES, type BlendMode, type PaintLayer } from '../../lib/paint/types';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PaintPanels.module.css';
import { EyeIcon } from './icons';

export interface LayersPanelProps {
  layers: readonly PaintLayer[];
  activeLayerId: string;
  renderTick: number;
  onSelectLayer: (id: string) => void;
  onAddLayer: () => void;
  onDuplicateLayer: () => void;
  onDeleteLayer: () => void;
  onMoveLayer: (direction: 'up' | 'down') => void;
  onMergeDown: () => void;
  onFlatten: () => void;
  onClearLayer: () => void;
  onToggleVisibility: (id: string) => void;
  onRenameLayer: (id: string, name: string) => void;
  onChangeOpacity: (id: string, opacity: number) => void;
  onChangeBlendMode: (id: string, mode: BlendMode) => void;
}

function LayerThumb({ layer, renderTick }: { layer: PaintLayer; renderTick: number }) {
  const thumbRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, el.height);
    const scale = Math.min(el.width / Math.max(1, layer.canvas.width), el.height / Math.max(1, layer.canvas.height));
    const dw = Math.max(1, layer.canvas.width * scale);
    const dh = Math.max(1, layer.canvas.height * scale);
    const dx = (el.width - dw) / 2;
    const dy = (el.height - dh) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer.canvas, dx, dy, dw, dh);
  }, [layer, layer.canvas, renderTick]);

  return (
    <canvas
      ref={thumbRef}
      width={40}
      height={30}
      className={styles.layerThumb}
      aria-hidden="true"
    />
  );
}

export default function LayersPanel({
  layers,
  activeLayerId,
  renderTick,
  onSelectLayer,
  onAddLayer,
  onDuplicateLayer,
  onDeleteLayer,
  onMoveLayer,
  onMergeDown,
  onFlatten,
  onClearLayer,
  onToggleVisibility,
  onRenameLayer,
  onChangeOpacity,
  onChangeBlendMode,
}: LayersPanelProps) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const activeIndex = layers.findIndex((l) => l.id === activeLayerId);
  const activeLayer = activeIndex >= 0 ? layers[activeIndex] : layers[layers.length - 1];

  // Display top-most layer first (standard raster layer stack order)
  const displayLayers = [...layers].reverse();

  const startRename = (layer: PaintLayer) => {
    setEditingId(layer.id);
    setNameDraft(layer.name);
  };

  const commitRename = () => {
    if (editingId) {
      const trimmed = nameDraft.trim();
      if (trimmed) onRenameLayer(editingId, trimmed);
    }
    setEditingId(null);
  };

  return (
    <div className={styles.layersPanel}>
      {/* Active layer Blend Mode & Opacity */}
      {activeLayer && (
        <div className={styles.layerControls}>
          <label className={styles.layerControlRow}>
            <span className={styles.layerControlLabel}>{t('paint.layer.blend')}</span>
            <select
              value={activeLayer.blendMode}
              onChange={(e) => onChangeBlendMode(activeLayer.id, e.target.value as BlendMode)}
              className={styles.layerSelect}
              aria-label={t('paint.layer.blend')}
            >
              {BLEND_MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {t(m.labelKey as TranslationKey)}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.layerControlRow}>
            <span className={styles.layerControlLabel}>{t('paint.layer.opacity')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(activeLayer.opacity * 100)}
              onChange={(e) => onChangeOpacity(activeLayer.id, Number(e.target.value) / 100)}
              className={styles.layerRange}
              aria-label={`${t('paint.layer.opacity')} slider`}
            />
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(activeLayer.opacity * 100)}
              onChange={(e) => {
                const v = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
                onChangeOpacity(activeLayer.id, v / 100);
              }}
              className={styles.sliderNumInput}
              aria-label={t('paint.layer.opacity')}
            />
            <span className={styles.sliderUnit}>%</span>
          </div>
        </div>
      )}

      {/* Layer Stack */}
      <ul className={styles.layerList} data-testid="paint-layer-list" aria-label={t('paint.panel.layers')}>
        {displayLayers.map((layer) => {
          const isActive = layer.id === activeLayerId;
          const isEditing = editingId === layer.id;

          return (
            <li
              key={layer.id}
              className={[
                styles.layerItem,
                isActive ? styles.layerItemActive : '',
                !layer.visible ? styles.layerItemHidden : '',
              ].join(' ')}
            >
              <button
                type="button"
                className={styles.layerSelectBtn}
                onClick={() => onSelectLayer(layer.id)}
                onDoubleClick={() => startRename(layer)}
                aria-current={isActive ? 'true' : undefined}
              >
                <LayerThumb layer={layer} renderTick={renderTick} />
                <span className={styles.layerInfo}>
                  {isEditing ? (
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      className={styles.layerRenameInput}
                      aria-label={t('paint.layer.rename')}
                    />
                  ) : (
                    <span className={styles.layerName}>{layer.name}</span>
                  )}
                  <span className={styles.layerSub}>
                    {Math.round(layer.opacity * 100)}%
                    {layer.blendMode !== 'source-over' ? ` · ${layer.blendMode}` : ''}
                  </span>
                </span>
              </button>

              <button
                type="button"
                className={styles.layerEyeBtn}
                onClick={() => onToggleVisibility(layer.id)}
                aria-label={`${layer.visible ? t('paint.layer.hide') : t('paint.layer.show')} ${layer.name}`}
                aria-pressed={layer.visible}
                title={layer.visible ? t('paint.layer.hide') : t('paint.layer.show')}
              >
                <EyeIcon visible={layer.visible} />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Layer Actions Footer */}
      <div className={styles.layerFooter}>
        <button
          type="button"
          className={styles.layerActBtn}
          onClick={onAddLayer}
          title={t('paint.layer.add')}
          aria-label={t('paint.layer.add')}
        >
          +
        </button>
        <button
          type="button"
          className={styles.layerActBtn}
          onClick={onDuplicateLayer}
          title={t('paint.layer.duplicate')}
          aria-label={t('paint.layer.duplicate')}
        >
          ⧉
        </button>
        <button
          type="button"
          className={styles.layerActBtn}
          onClick={() => onMoveLayer('up')}
          disabled={activeIndex >= layers.length - 1}
          title={t('paint.layer.moveUp')}
          aria-label={t('paint.layer.moveUp')}
        >
          ↑
        </button>
        <button
          type="button"
          className={styles.layerActBtn}
          onClick={() => onMoveLayer('down')}
          disabled={activeIndex <= 0}
          title={t('paint.layer.moveDown')}
          aria-label={t('paint.layer.moveDown')}
        >
          ↓
        </button>
        <button
          type="button"
          className={styles.layerActBtn}
          onClick={onMergeDown}
          disabled={activeIndex <= 0}
          title={t('paint.layer.mergeDown')}
          aria-label={t('paint.layer.mergeDown')}
        >
          ⤓
        </button>
        <button
          type="button"
          className={styles.layerActBtn}
          onClick={onClearLayer}
          title={t('paint.layer.clear')}
          aria-label={t('paint.layer.clear')}
        >
          ⌫
        </button>
        <button
          type="button"
          className={[styles.layerActBtn, styles.layerActDanger].join(' ')}
          onClick={onDeleteLayer}
          disabled={layers.length <= 1}
          title={t('paint.layer.delete')}
          aria-label={t('paint.layer.delete')}
        >
          ✕
        </button>
      </div>

      {layers.length > 1 && (
        <button type="button" className={styles.flattenBtn} onClick={onFlatten}>
          {t('paint.layer.flatten')}
        </button>
      )}
    </div>
  );
}
