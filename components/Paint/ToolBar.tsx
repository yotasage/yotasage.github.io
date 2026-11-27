import type { PanelId, PanelLayout, Rect, ShapeFillMode, ToolId, ToolOptions } from '../../lib/paint/types';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Paint.module.css';
import { RedoIcon, ToolSvgIcon, UndoIcon } from './icons';

export type ModalId =
  | null
  | 'new'
  | 'resize'
  | 'scaleDown'
  | 'canvasSize'
  | 'rotate'
  | 'colorStyles'
  | 'adjustments'
  | 'export';

export const TOOL_LIST: readonly { id: ToolId; labelKey: TranslationKey }[] = [
  { id: 'select', labelKey: 'paint.tool.select' },
  { id: 'move', labelKey: 'paint.tool.move' },
  { id: 'crop', labelKey: 'paint.tool.crop' },
  { id: 'brush', labelKey: 'paint.tool.brush' },
  { id: 'pencil', labelKey: 'paint.tool.pencil' },
  { id: 'eraser', labelKey: 'paint.tool.eraser' },
  { id: 'fill', labelKey: 'paint.tool.fill' },
  { id: 'picker', labelKey: 'paint.tool.picker' },
  { id: 'line', labelKey: 'paint.tool.line' },
  { id: 'rect', labelKey: 'paint.tool.rect' },
  { id: 'ellipse', labelKey: 'paint.tool.ellipse' },
  { id: 'text', labelKey: 'paint.tool.text' },
  { id: 'pan', labelKey: 'paint.tool.pan' },
];

export interface TopCommandBarProps {
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  filesLayout: PanelLayout;
  colorsLayout: PanelLayout;
  layersLayout: PanelLayout;
  showTabStrip: boolean;
  showPixelGrid: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenModal: (modal: ModalId) => void;
  onOpenFile: (asLayer: boolean) => void;
  onLoadSample: () => void;
  onCopy: (merged: boolean) => void;
  onPaste: () => void;
  onActivateCrop: () => void;
  onCropToSelection: () => void;
  onTogglePanel: (panel: PanelId) => void;
  onToggleTabStrip: () => void;
  onResetPanels: () => void;
  onTogglePixelGrid: () => void;
}

export function TopCommandBar({
  canUndo,
  canRedo,
  hasSelection,
  filesLayout,
  colorsLayout,
  layersLayout,
  showTabStrip,
  showPixelGrid,
  onUndo,
  onRedo,
  onOpenModal,
  onOpenFile,
  onLoadSample,
  onCopy,
  onPaste,
  onActivateCrop,
  onCropToSelection,
  onTogglePanel,
  onToggleTabStrip,
  onResetPanels,
  onTogglePixelGrid,
}: TopCommandBarProps) {
  const { t } = useI18n();

  return (
    <div className={styles.commandBar} role="toolbar" aria-label={t('paint.toolbar.actionsAria')}>
      <div className={styles.cmdGroup}>
        <button type="button" className={styles.cmdBtn} onClick={() => onOpenModal('new')}>
          {t('paint.action.new')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={() => onOpenFile(false)}>
          {t('paint.action.open')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={() => onOpenFile(true)}>
          {t('paint.action.importLayer')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={onLoadSample}>
          {t('paint.action.sample')}
        </button>
        <button type="button" className={[styles.cmdBtn, styles.cmdBtnPrimary].join(' ')} onClick={() => onOpenModal('export')}>
          {t('paint.action.save')}
        </button>
      </div>

      <span className={styles.cmdSep} aria-hidden="true" />

      <div className={styles.cmdGroup}>
        <button
          type="button"
          className={styles.cmdIconBtn}
          onClick={onUndo}
          disabled={!canUndo}
          title={`${t('paint.action.undo')} (Ctrl+Z)`}
          aria-label={t('paint.action.undo')}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className={styles.cmdIconBtn}
          onClick={onRedo}
          disabled={!canRedo}
          title={`${t('paint.action.redo')} (Ctrl+Y)`}
          aria-label={t('paint.action.redo')}
        >
          <RedoIcon />
        </button>
      </div>

      <span className={styles.cmdSep} aria-hidden="true" />

      <div className={styles.cmdGroup}>
        <button
          type="button"
          className={styles.cmdBtn}
          onClick={() => onCopy(true)}
          title={t('paint.action.copyTooltip')}
        >
          {t('paint.action.copy')}
        </button>
        <button
          type="button"
          className={styles.cmdBtn}
          onClick={onPaste}
          title={t('paint.action.pasteTooltip')}
        >
          {t('paint.action.paste')}
        </button>
      </div>

      <span className={styles.cmdSep} aria-hidden="true" />

      <div className={styles.cmdGroup}>
        <button
          type="button"
          className={styles.cmdBtn}
          onClick={hasSelection ? onCropToSelection : onActivateCrop}
          title={hasSelection ? `${t('paint.action.cropToSel')} (Ctrl+Shift+X)` : `${t('paint.action.crop')} (C)`}
        >
          {hasSelection ? t('paint.action.cropToSel') : t('paint.action.crop')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={() => onOpenModal('resize')}>
          {t('paint.action.resize')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={() => onOpenModal('scaleDown')}>
          {t('paint.action.scaleDown')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={() => onOpenModal('canvasSize')}>
          {t('paint.action.canvasSize')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={() => onOpenModal('rotate')}>
          {t('paint.action.rotate')}
        </button>
      </div>

      <span className={styles.cmdSep} aria-hidden="true" />

      <div className={styles.cmdGroup}>
        <button type="button" className={styles.cmdBtn} onClick={() => onOpenModal('colorStyles')}>
          {t('paint.action.colorStyles')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={() => onOpenModal('adjustments')}>
          {t('paint.action.adjustments')}
        </button>
      </div>

      <span className={styles.cmdSep} aria-hidden="true" />

      <div className={styles.cmdGroup}>
        <button
          type="button"
          className={[styles.cmdBtn, showTabStrip ? styles.cmdBtnActive : ''].join(' ')}
          onClick={onToggleTabStrip}
          aria-pressed={showTabStrip}
        >
          {t('paint.action.tabsBar')}
        </button>
        <button
          type="button"
          className={[styles.cmdBtn, filesLayout.visible ? styles.cmdBtnActive : ''].join(' ')}
          onClick={() => onTogglePanel('files')}
          aria-pressed={filesLayout.visible}
          title="F6"
        >
          {t('paint.action.filesPanel')}
        </button>
        <button
          type="button"
          className={[styles.cmdBtn, colorsLayout.visible ? styles.cmdBtnActive : ''].join(' ')}
          onClick={() => onTogglePanel('colors')}
          aria-pressed={colorsLayout.visible}
          title="F8"
        >
          {t('paint.action.colorsPanel')}
        </button>
        <button
          type="button"
          className={[styles.cmdBtn, layersLayout.visible ? styles.cmdBtnActive : ''].join(' ')}
          onClick={() => onTogglePanel('layers')}
          aria-pressed={layersLayout.visible}
          title="F7"
        >
          {t('paint.action.layersPanel')}
        </button>
        <button
          type="button"
          className={[styles.cmdBtn, showPixelGrid ? styles.cmdBtnActive : ''].join(' ')}
          onClick={onTogglePixelGrid}
          aria-pressed={showPixelGrid}
        >
          {t('paint.action.pixelGrid')}
        </button>
        <button type="button" className={styles.cmdBtn} onClick={onResetPanels}>
          {t('paint.action.resetLayout')}
        </button>
      </div>
    </div>
  );
}

export interface ToolOptionsBarProps {
  activeTool: ToolId;
  options: ToolOptions;
  cropRect: Rect | null;
  selection: Rect | null;
  onChangeOptions: (patch: Partial<ToolOptions>) => void;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDeselect: () => void;
  onCropToSelection: () => void;
}

export function ToolOptionsBar({
  activeTool,
  options,
  cropRect,
  selection,
  onChangeOptions,
  onApplyCrop,
  onCancelCrop,
  onSelectAll,
  onClearSelection,
  onDeselect,
  onCropToSelection,
}: ToolOptionsBarProps) {
  const { t } = useI18n();

  const showSize =
    activeTool === 'brush' ||
    activeTool === 'pencil' ||
    activeTool === 'eraser' ||
    activeTool === 'line' ||
    activeTool === 'rect' ||
    activeTool === 'ellipse';

  const clampNum = (raw: string, min: number, max: number, fallback: number) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
  };

  const maxSize = activeTool === 'pencil' ? 24 : 150;

  return (
    <div className={styles.optionsBar}>
      <span className={styles.activeToolTag}>
        {t(`paint.tool.${activeTool}` as TranslationKey)}
      </span>

      {showSize && (
        <div className={styles.optField}>
          <span>{t('paint.opt.size')}</span>
          <input
            type="range"
            min={1}
            max={maxSize}
            value={Math.min(maxSize, options.brushSize)}
            onChange={(e) => onChangeOptions({ brushSize: Number(e.target.value) })}
            className={styles.optRange}
            aria-label={`${t('paint.opt.size')} slider`}
          />
          <input
            type="number"
            min={1}
            max={maxSize}
            value={options.brushSize}
            onChange={(e) =>
              onChangeOptions({ brushSize: clampNum(e.target.value, 1, maxSize, options.brushSize) })
            }
            className={styles.optNumCompact}
            aria-label={t('paint.opt.size')}
          />
          <span className={styles.optUnit}>px</span>
        </div>
      )}

      {(activeTool === 'brush' || activeTool === 'eraser') && (
        <>
          <div className={styles.optField}>
            <span>{t('paint.opt.hardness')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={options.brushHardness}
              onChange={(e) => onChangeOptions({ brushHardness: Number(e.target.value) })}
              className={styles.optRange}
              aria-label={`${t('paint.opt.hardness')} slider`}
            />
            <input
              type="number"
              min={0}
              max={100}
              value={options.brushHardness}
              onChange={(e) =>
                onChangeOptions({ brushHardness: clampNum(e.target.value, 0, 100, options.brushHardness) })
              }
              className={styles.optNumCompact}
              aria-label={t('paint.opt.hardness')}
            />
            <span className={styles.optUnit}>%</span>
          </div>
          <div className={styles.optField}>
            <span>{t('paint.opt.opacity')}</span>
            <input
              type="range"
              min={1}
              max={100}
              value={options.brushOpacity}
              onChange={(e) => onChangeOptions({ brushOpacity: Number(e.target.value) })}
              className={styles.optRange}
              aria-label={`${t('paint.opt.opacity')} slider`}
            />
            <input
              type="number"
              min={1}
              max={100}
              value={options.brushOpacity}
              onChange={(e) =>
                onChangeOptions({ brushOpacity: clampNum(e.target.value, 1, 100, options.brushOpacity) })
              }
              className={styles.optNumCompact}
              aria-label={t('paint.opt.opacity')}
            />
            <span className={styles.optUnit}>%</span>
          </div>
        </>
      )}

      {activeTool === 'fill' && (
        <div className={styles.optField}>
          <span>{t('paint.opt.tolerance')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={options.fillTolerance}
            onChange={(e) => onChangeOptions({ fillTolerance: Number(e.target.value) })}
            className={styles.optRange}
            aria-label={`${t('paint.opt.tolerance')} slider`}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={options.fillTolerance}
            onChange={(e) =>
              onChangeOptions({ fillTolerance: clampNum(e.target.value, 0, 100, options.fillTolerance) })
            }
            className={styles.optNumCompact}
            aria-label={t('paint.opt.tolerance')}
          />
          <span className={styles.optUnit}>%</span>
        </div>
      )}

      {activeTool === 'line' && (
        <label className={styles.optCheck}>
          <input
            type="checkbox"
            checked={options.lineArrow}
            onChange={(e) => onChangeOptions({ lineArrow: e.target.checked })}
          />
          <span>{t('paint.opt.arrow')}</span>
        </label>
      )}

      {(activeTool === 'rect' || activeTool === 'ellipse') && (
        <div className={styles.optSegmented} role="group" aria-label={t('paint.opt.shapeMode')}>
          {(['stroke', 'fill', 'both'] as ShapeFillMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={[styles.optSegBtn, options.shapeMode === m ? styles.optSegBtnActive : ''].join(' ')}
              onClick={() => onChangeOptions({ shapeMode: m })}
              aria-pressed={options.shapeMode === m}
            >
              {t(`paint.opt.${m}` as TranslationKey)}
            </button>
          ))}
        </div>
      )}

      {activeTool === 'text' && (
        <>
          <label className={styles.optField}>
            <span>{t('paint.opt.fontSize')}</span>
            <input
              type="number"
              min={8}
              max={240}
              value={options.fontSize}
              onChange={(e) => onChangeOptions({ fontSize: Math.max(8, Math.min(240, Number(e.target.value) || 24)) })}
              className={styles.optNum}
            />
          </label>
          <button
            type="button"
            className={[styles.cmdBtn, options.fontBold ? styles.cmdBtnActive : ''].join(' ')}
            onClick={() => onChangeOptions({ fontBold: !options.fontBold })}
            aria-pressed={options.fontBold}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={[styles.cmdBtn, options.fontItalic ? styles.cmdBtnActive : ''].join(' ')}
            onClick={() => onChangeOptions({ fontItalic: !options.fontItalic })}
            aria-pressed={options.fontItalic}
          >
            <em>I</em>
          </button>
          <span className={styles.optHint}>{t('paint.opt.textHint')}</span>
        </>
      )}

      {activeTool === 'picker' && (
        <label className={styles.optCheck}>
          <input
            type="checkbox"
            checked={options.sampleAllLayers}
            onChange={(e) => onChangeOptions({ sampleAllLayers: e.target.checked })}
          />
          <span>{t('paint.opt.sampleAll')}</span>
        </label>
      )}

      {activeTool === 'crop' && (
        <>
          <label className={styles.optField}>
            <span>{t('paint.opt.aspect')}</span>
            <select
              value={options.cropAspect}
              onChange={(e) => onChangeOptions({ cropAspect: e.target.value as ToolOptions['cropAspect'] })}
              className={styles.optSelect}
            >
              <option value="free">{t('paint.opt.aspectFree')}</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="16:9">16:9</option>
              <option value="3:2">3:2</option>
            </select>
          </label>
          {cropRect && cropRect.w > 0 && cropRect.h > 0 && (
            <>
              <span className={styles.optValue}>
                {cropRect.w} × {cropRect.h} px
              </span>
              <button type="button" className={[styles.cmdBtn, styles.cmdBtnPrimary].join(' ')} onClick={onApplyCrop}>
                {t('paint.opt.applyCrop')}
              </button>
              <button type="button" className={styles.cmdBtn} onClick={onCancelCrop}>
                {t('paint.opt.cancelCrop')}
              </button>
            </>
          )}
        </>
      )}

      {activeTool === 'select' && (
        <div className={styles.cmdGroup}>
          <button type="button" className={styles.cmdBtn} onClick={onSelectAll}>
            {t('paint.opt.selectAll')}
          </button>
          {selection && selection.w > 0 && selection.h > 0 && (
            <>
              <button type="button" className={styles.cmdBtn} onClick={onCropToSelection}>
                {t('paint.action.cropToSel')}
              </button>
              <button type="button" className={styles.cmdBtn} onClick={onClearSelection}>
                {t('paint.opt.clearSel')}
              </button>
              <button type="button" className={styles.cmdBtn} onClick={onDeselect}>
                {t('paint.opt.deselect')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function LeftToolStrip({
  activeTool,
  onSelectTool,
}: {
  activeTool: ToolId;
  onSelectTool: (tool: ToolId) => void;
}) {
  const { t } = useI18n();

  return (
    <aside className={styles.toolStrip} aria-label={t('paint.toolbar.toolsAria')}>
      {TOOL_LIST.map((item) => {
        const active = activeTool === item.id;
        const label = t(item.labelKey);
        return (
          <button
            key={item.id}
            type="button"
            className={[styles.toolBtn, active ? styles.toolBtnActive : ''].join(' ')}
            onClick={() => onSelectTool(item.id)}
            aria-label={label}
            aria-pressed={active}
            title={label}
          >
            <ToolSvgIcon tool={item.id} />
          </button>
        );
      })}
    </aside>
  );
}
