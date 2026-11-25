import React from 'react';
import type { Object3D, Vector3 } from 'three';

import { baseName, download, errorMessage, formatBytes } from '../../lib/pdf/files';
import { useI18n } from '../../lib/ui/i18n';
import { useTheme } from '../../lib/ui/theme';
import type { TranslationKey } from '../../lib/ui/translations';
import { EXPORT_FORMATS, ExportFormat, exportModel } from '../../lib/viewer3d/export';
import { formatCount, formatNumber, withUnit } from '../../lib/viewer3d/format';
import { LoadedModel, loadModel } from '../../lib/viewer3d/load';
import { disposeCadReader, MeshQuality } from '../../lib/viewer3d/occt';
import { isHelper, modelBox, ModelStats, modelStats } from '../../lib/viewer3d/stats';
import { MAX_TRIANGLES } from '../../lib/viewer3d/topology';
import { Axis, createViewer, Display, disposeObject, Offset, Projection, Section, Shading, THEMES, Theme, Tool, Viewer, ViewName } from '../../lib/viewer3d/viewer';
import styles from '../../styles/Viewer3D.module.css';
import fieldStyles from '../../styles/Fields.module.css';
import { DropTarget, FilePickerButton } from '../PdfTools/ToolPage';
import { Checkbox, Field, NumberInput, Select } from '../UI/Fields';
import { AxisGizmo, MeasureLabel } from './Overlays';
import PartTree, { buildTree, countParts } from './PartTree';

type Status = { kind: 'loading'; text: string } | { kind: 'error'; text: string } | { kind: 'ready' };

const VIEW_BUTTONS: [ViewName, TranslationKey][] = [
  ['iso', 'viewer3d.ws.viewIso'],
  ['front', 'viewer3d.ws.viewFront'],
  ['top', 'viewer3d.ws.viewTop'],
  ['right', 'viewer3d.ws.viewRight'],
];

const DEFAULT_SINGLE_COLOR = '#c5ccd6';

const NO_OFFSET: Offset = [0, 0, 0];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.card}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function sizeText(box: { min: Vector3; max: Vector3 }, units: string | null): string {
  const d = box.max.clone().sub(box.min);
  return withUnit([d.x, d.y, d.z].map((v) => formatNumber(v)).join(' × '), units);
}

// For millimetres, the same area or volume in cm² and cm³, or m² and m³ when that is large.
function largerUnit(value: number, units: string | null, power: '²' | '³'): string {
  if (units !== 'mm') return '';
  const [cm, m] = power === '²' ? [1e2, 1e6] : [1e3, 1e9];
  return value >= m ? ` (${formatNumber(value / m)} m${power})` : ` (${formatNumber(value / cm)} cm${power})`;
}

function ModelInfo({ stats, units }: { stats: ModelStats; units: string | null }) {
  const { t } = useI18n();
  const volume = stats.volume === null ? null : withUnit(formatNumber(stats.volume), units, '³') + largerUnit(stats.volume, units, '³');
  return (
    <table className={[fieldStyles.infoTable, styles.info].join(' ')}>
      <tbody>
        {!stats.box.isEmpty() && <tr><th>{t('viewer3d.card.thSize')}</th><td>{sizeText(stats.box, units)}</td></tr>}
        {stats.meshes > 1 && <tr><th>{t('viewer3d.card.thMeshes')}</th><td>{formatCount(stats.meshes)}</td></tr>}
        {stats.triangles > 0 && <tr><th>{t('viewer3d.card.thTriangles')}</th><td>{formatCount(stats.triangles)}</td></tr>}
        {stats.vertices > 0 && <tr><th>{t('viewer3d.card.thVertices')}</th><td>{formatCount(stats.vertices)}</td></tr>}
        {stats.points > 0 && <tr><th>{t('viewer3d.card.thPoints')}</th><td>{formatCount(stats.points)}</td></tr>}
        {stats.lines > 0 && <tr><th>{t('viewer3d.card.thLines')}</th><td>{formatCount(stats.lines)}</td></tr>}
        {stats.triangles > 0 && <tr><th>{t('viewer3d.card.thArea')}</th><td>{withUnit(formatNumber(stats.area), units, '²')}{largerUnit(stats.area, units, '²')}</td></tr>}
        {volume && (
          <tr>
            <th>{t('viewer3d.card.thVolume')}</th>
            <td>
              {stats.closed === false ? t('viewer3d.card.notClosed') : volume}
              {stats.closed === null && <small className={styles.note}>{t('viewer3d.card.notCheckedClosed', { max: formatCount(MAX_TRIANGLES) })}</small>}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default function Workspace({ files, onOpen }: { files: File[]; onOpen: (files: File[]) => void }) {
  const { t } = useI18n();
  const { theme: siteTheme } = useTheme();
  const container = React.useRef<HTMLDivElement>(null);
  const viewport = React.useRef<HTMLDivElement>(null);
  const backdropLocked = React.useRef(false);
  const [viewer, setViewer] = React.useState<Viewer | null>(null);
  const [status, setStatus] = React.useState<Status>(() => ({ kind: 'loading', text: t('viewer3d.ws.starting') }));
  const [model, setModel] = React.useState<LoadedModel | null>(null);
  const [stats, setStats] = React.useState<ModelStats | null>(null);
  const [quality, setQuality] = React.useState<MeshQuality>('normal');
  const [display, setDisplay] = React.useState<Display>(() => ({
    shading: 'shaded',
    singleColor: null,
    grid: true,
    theme: siteTheme === 'light' ? 'light' : 'dark',
  }));
  const [pickedColor, setPickedColor] = React.useState(DEFAULT_SINGLE_COLOR);
  const [gridCell, setGridCell] = React.useState<number | null>(null);
  const [zUp, setZUp] = React.useState(true);
  const [projection, setProjection] = React.useState<Projection>('perspective');
  const [section, setSection] = React.useState<Section>({ axis: null, position: 0.5, flip: false });
  const [tool, setTool] = React.useState<Tool>('select');
  const [measured, setMeasured] = React.useState<Vector3[]>([]);
  const [selected, setSelected] = React.useState<Object3D | null>(null);
  const [animation, setAnimation] = React.useState<number | null>(null);
  const [paused, setPaused] = React.useState(false);
  const [transparent, setTransparent] = React.useState(false);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [fullscreen, setFullscreen] = React.useState(false);
  // Changes when parts are shown or hidden, or late files (textures) arrive, so the page shows it.
  const [, refresh] = React.useReducer((n: number) => n + 1, 0);
  const shownFiles = React.useRef<File[] | null>(null);
  // How far each file is moved in the view, kept when files are added or read again.
  const [offsets, setOffsets] = React.useState<Map<File, Offset>>(() => new Map());
  const offsetsRef = React.useRef(offsets);
  offsetsRef.current = offsets;

  React.useEffect(() => {
    let created: Viewer | null = null;
    let cancelled = false;
    createViewer(container.current)
      .then((v) => {
        if (cancelled) {
          v.dispose();
          return;
        }
        created = v;
        v.onSelect = setSelected;
        v.onMeasure = (points) => setMeasured([...points]);
        setViewer(v);
      })
      .catch((e) => setStatus({ kind: 'error', text: t('viewer3d.ws.webglErr', { msg: errorMessage(e) }) }));
    const onFullscreen = () => setFullscreen(document.fullscreenElement === viewport.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      cancelled = true;
      created?.dispose();
      disposeCadReader();
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, []);

  // Reads the files, and reads them again when the mesh quality of a CAD file changes.
  React.useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    const newFiles = shownFiles.current !== files;
    setStatus({ kind: 'loading', text: t('viewer3d.ws.reading') });
    loadModel(files, {
      renderer: viewer.renderer,
      quality,
      onStatus: (text) => {
        if (!cancelled) setStatus({ kind: 'loading', text });
      },
      onResource: () => {
        viewer.requestRender();
        if (!cancelled) refresh();
      },
    }).then(async (m) => {
      if (cancelled) {
        disposeObject(m.root);
        m.dispose();
        return;
      }
      viewer.setModel(m, m.fileGroups.map(({ file }) => offsetsRef.current.get(file) ?? NO_OFFSET));
      shownFiles.current = files;
      setModel(m);
      setStats(null);
      setSelected(null);
      setMeasured([]);
      setAnimation(null);
      setPaused(false);
      setZUp(m.zUp);
      if (newFiles) {
        setSection((s) => ({ ...s, axis: null }));
        // CAD models are easier to read with the edges of their faces.
        setDisplay((d) => ({ ...d, shading: m.cad ? 'edges' : 'shaded' }));
      }
      setGridCell(viewer.gridCell);
      setStatus({ kind: 'ready' });
      // The model is drawn first; counting and measuring a large one takes a moment.
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (!cancelled) setStats(modelStats(m.root));
    }).catch((e) => {
      if (cancelled) return;
      viewer.setModel(null);
      shownFiles.current = null;
      setModel(null);
      setStats(null);
      setStatus({ kind: 'error', text: errorMessage(e) });
    });
    return () => {
      cancelled = true;
    };
  }, [viewer, files, quality]);

  // Keep the 3D backdrop in sync with the site theme until the user manually chooses one.
  React.useEffect(() => {
    if (backdropLocked.current) return;
    const next: Theme = siteTheme === 'light' ? 'light' : 'dark';
    setDisplay((d) => (d.theme === next ? d : { ...d, theme: next }));
  }, [siteTheme]);

  React.useEffect(() => {
    if (!viewer) return;
    viewer.setDisplay(display);
    setGridCell(viewer.gridCell);
  }, [viewer, display]);
  React.useEffect(() => viewer?.setSection(section), [viewer, section]);
  React.useEffect(() => {
    if (model) viewer?.setOffsets(model.fileGroups.map(({ file }) => offsets.get(file) ?? NO_OFFSET));
  }, [viewer, offsets]);
  React.useEffect(() => viewer?.setProjection(projection), [viewer, projection]);
  React.useEffect(() => viewer?.setTool(tool), [viewer, tool]);

  const tree = React.useMemo(() => (model ? buildTree(model.root) : []), [model]);
  const parts = React.useMemo(() => countParts(tree), [tree]);
  const units = model?.units ?? null;
  const cad = model?.cad ?? files.some((f) => /\.(step|stp|p21|iges|igs|brep|brp)$/i.test(f.name));
  const name = model?.root.name ?? files[0]?.name ?? 'model';
  const base = baseName(model?.formats.length === 1 ? model.root.name : files[0]?.name ?? 'model');
  const totalBytes = files.reduce((n, f) => n + f.size, 0);
  const missing = model ? [...model.missing] : [];

  function changeUp(next: boolean) {
    setZUp(next);
    viewer?.setZUp(next);
    setGridCell(viewer?.gridCell ?? null);
  }

  function select(object: Object3D | null) {
    viewer?.select(object);
    setSelected(object);
  }

  function toggleVisible(object: Object3D) {
    object.visible = !object.visible;
    viewer?.refresh();
    refresh();
  }

  function showAll() {
    model?.root.traverse((o) => {
      if (!isHelper(o)) o.visible = true;
    });
    viewer?.refresh();
    refresh();
  }

  // Hides everything except the selected part (and the groups it is in, which must stay shown for it to show).
  function showOnly(object: Object3D) {
    const keep = new Set<Object3D>();
    for (let o = object; o; o = o.parent) keep.add(o);
    object.traverse((o) => keep.add(o));
    model?.root.traverse((o) => {
      if (!isHelper(o)) o.visible = keep.has(o);
    });
    viewer?.refresh();
    viewer?.fit(object);
    refresh();
  }

  function setOffset(file: File, axis: number, value: number) {
    setOffsets((prev) => {
      const offset: Offset = [...(prev.get(file) ?? NO_OFFSET)];
      offset[axis] = value;
      return new Map(prev).set(file, offset);
    });
  }

  // Sets the offsets of every file at once and fits the view to the files where they now are.
  function placeFiles(next: Offset[]) {
    if (!model || !viewer) return;
    viewer.setOffsets(next);
    viewer.fit();
    setOffsets((prev) => {
      const map = new Map(prev);
      model.fileGroups.forEach(({ file }, i) => map.set(file, next[i]));
      return map;
    });
  }

  async function save(format: ExportFormat) {
    if (!viewer?.root) return;
    setSaving(format);
    setSaveError(null);
    try {
      const bytes = await exportModel(viewer.root, format, model?.animations ?? []);
      download(bytes, `${base}.${format}`, EXPORT_FORMATS.find((f) => f.id === format).mime);
    } catch (e) {
      setSaveError(t('viewer3d.ws.saveErr', { fmt: format.toUpperCase(), msg: errorMessage(e) }));
    } finally {
      setSaving(null);
    }
  }

  async function screenshot() {
    if (!viewer) return;
    setSaveError(null);
    try {
      download(await viewer.screenshot(transparent), `${base}.png`);
    } catch (e) {
      setSaveError(t('viewer3d.ws.imgSaveErr', { msg: errorMessage(e) }));
    }
  }

  function chooseBackdrop(next: Theme) {
    backdropLocked.current = true;
    setDisplay((d) => ({ ...d, theme: next }));
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void viewport.current?.requestFullscreen();
  }

  const [a, b] = measured;
  const distance = a && b ? a.distanceTo(b) : null;
  const selectedBox = selected ? modelBox(selected) : null;
  const sectionBox = stats?.box;
  const sectionAt = section.axis && sectionBox && !sectionBox.isEmpty()
    ? sectionBox.min[section.axis] + section.position * (sectionBox.max[section.axis] - sectionBox.min[section.axis])
    : null;
  const theme = THEMES[display.theme];
  const ready = status.kind === 'ready' && model;

  return (
    <DropTarget onFiles={onOpen} className={styles.workspace} overClassName={styles.workspaceDropOver}>
      <div
        ref={viewport}
        className={[styles.viewport, fullscreen ? styles.viewportFullscreen : '', display.theme === 'light' ? styles.viewportLight : ''].join(' ')}
        style={{ background: `radial-gradient(circle at 50% 40%, ${theme.background[0]}, ${theme.background[1]})` }}
      >
        <div className={styles.toolbar} role="toolbar" aria-label={t('viewer3d.ws.viewAria')}>
          <button type="button" className={styles.toolButton} disabled={!ready} onClick={() => viewer.fit()} title={t('viewer3d.ws.fitTitle')}>{t('viewer3d.ws.fit')}</button>
          {VIEW_BUTTONS.map(([view, labelKey]) => (
            <button key={view} type="button" className={styles.toolButton} disabled={!ready} onClick={() => viewer.view(view)}>{t(labelKey)}</button>
          ))}
          <span className={styles.toolbarSpacer} />
          <button
            type="button"
            className={styles.toolButton}
            disabled={!ready}
            aria-pressed={projection === 'orthographic'}
            title={t('viewer3d.ws.orthoTitle')}
            onClick={() => setProjection((p) => (p === 'perspective' ? 'orthographic' : 'perspective'))}
          >
            {t('viewer3d.ws.ortho')}
          </button>
          <button type="button" className={styles.toolButton} disabled={!ready} aria-pressed={tool === 'measure'} onClick={() => setTool((cur) => (cur === 'measure' ? 'select' : 'measure'))}>
            {t('viewer3d.ws.measure')}
          </button>
          <button
            type="button"
            className={styles.toolButton}
            aria-pressed={display.theme === 'light'}
            title={t('viewer3d.ws.backdropTitle')}
            onClick={() => chooseBackdrop(display.theme === 'light' ? 'dark' : 'light')}
          >
            {display.theme === 'light' ? t('viewer3d.ws.backdropLight') : t('viewer3d.ws.backdropDark')}
          </button>
          {typeof document !== 'undefined' && document.fullscreenEnabled && (
            <button type="button" className={styles.toolButton} aria-pressed={fullscreen} onClick={toggleFullscreen}>{fullscreen ? t('viewer3d.ws.exitFullscreen') : t('viewer3d.ws.fullscreen')}</button>
          )}
        </div>
        <div className={styles.canvasBox}>
          <div ref={container} className={styles.canvasHost} />
          {viewer && ready && <AxisGizmo viewer={viewer} />}
          {viewer && distance !== null && <MeasureLabel viewer={viewer} points={measured} text={withUnit(formatNumber(distance), units)} />}
          {ready && (
            <p className={styles.viewHint}>
              {tool === 'measure' ? (
                <span>{t('viewer3d.ws.measureHint')}</span>
              ) : (
                <>
                  <span className={styles.mouseHint}>{t('viewer3d.ws.mouseHint')}</span>
                  <span className={styles.touchHint}>{t('viewer3d.ws.touchHint')}</span>
                </>
              )}
            </p>
          )}
          {status.kind === 'loading' && (
            <div className={styles.overlay} role="status">
              <span className={styles.spinner} aria-hidden />
              <span>{status.text}</span>
            </div>
          )}
          {status.kind === 'error' && (
            <div className={[styles.overlay, styles.overlayError].join(' ')} role="alert">
              <span>{status.text}</span>
              <FilePickerButton accept="" onFiles={onOpen} className={fieldStyles.button}>{t('viewer3d.ws.openAnother')}</FilePickerButton>
            </div>
          )}
        </div>
      </div>

      <aside className={styles.sidebar}>
        <Card title={t('viewer3d.card.file')}>
          <p className={styles.fileName} title={name}>{name}</p>
          <p className={styles.meta}>
            {model ? [...new Set(model.formats.map((f) => f.name))].join(', ') : t('viewer3d.ws.readingShort')} · {formatBytes(totalBytes)}
            {files.length > 1 && t('viewer3d.ws.filesCount', { n: files.length })}
          </p>
          {cad && (
            <Field label={t('viewer3d.card.meshQuality')} help={t('viewer3d.card.meshQualityHelp')}>
              <Select<MeshQuality> value={quality} onChange={setQuality} disabled={status.kind === 'loading'} options={[['draft', t('viewer3d.card.qDraft')], ['normal', t('viewer3d.card.qNormal')], ['fine', t('viewer3d.card.qFine')]]} />
            </Field>
          )}
          {model?.warnings.map((w) => <p key={w} className={fieldStyles.warning}>{w}</p>)}
          {missing.length > 0 && (
            <p className={fieldStyles.warning}>
              {t('viewer3d.card.missingFiles', { files: missing.join(', ') })}
            </p>
          )}
          <div className={fieldStyles.buttonRow}>
            <FilePickerButton accept="" onFiles={onOpen} className={fieldStyles.buttonSmall}>{t('viewer3d.ws.openAnother')}</FilePickerButton>
            <FilePickerButton accept="" onFiles={(added) => onOpen([...files, ...added])} className={fieldStyles.buttonSmall}>{t('viewer3d.ws.addFiles')}</FilePickerButton>
          </div>
          <p className={fieldStyles.help}>{t('viewer3d.ws.addFilesHelp')}</p>
        </Card>

        {model && (
          <Card title={t('viewer3d.card.model')}>
            {stats ? <ModelInfo stats={stats} units={units} /> : <p className={fieldStyles.help}>{t('viewer3d.card.measuring')}</p>}
            <p className={fieldStyles.help}>
              {units ? t('viewer3d.card.unitsKnown', { units: units === 'mm' ? t('viewer3d.card.unitMm') : units }) : t('viewer3d.card.unitsUnknown')}
              {gridCell !== null && display.grid && t('viewer3d.card.gridCell', { size: withUnit(formatNumber(gridCell), units) })}
            </p>
          </Card>
        )}

        {model && model.fileGroups.length > 1 && (
          <Card title={t('viewer3d.card.positions')}>
            <p className={fieldStyles.help}>
              {t('viewer3d.card.positionsHelp', { unitPart: units ? t('viewer3d.card.positionsUnits', { units }) : '' })}
            </p>
            {model.fileGroups.map(({ file }, index) => {
              const offset = offsets.get(file) ?? NO_OFFSET;
              return (
                <div key={`${index}-${file.name}`} role="group" aria-label={t('viewer3d.card.offsetAria', { name: file.name })} className={styles.offset}>
                  <p className={styles.fileName} title={file.name}>{file.name}</p>
                  <div className={styles.offsetFields}>
                    {['X', 'Y', 'Z'].map((axis, i) => (
                      <label key={axis} className={styles.offsetField}>
                        <span>{axis}</span>
                        <NumberInput value={offset[i]} min={-1e9} max={1e9} step="any" onChange={(v) => setOffset(file, i, v)} />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className={fieldStyles.buttonRow}>
              <button type="button" className={fieldStyles.buttonSmall} onClick={() => placeFiles(viewer.sideBySide())}>{t('viewer3d.card.sideBySide')}</button>
              <button
                type="button"
                className={fieldStyles.buttonSmall}
                disabled={model.fileGroups.every(({ file }) => (offsets.get(file) ?? NO_OFFSET).every((v) => v === 0))}
                onClick={() => placeFiles(model.fileGroups.map(() => NO_OFFSET))}
              >
                {t('viewer3d.card.reset')}
              </button>
            </div>
          </Card>
        )}

        {model && (
          <Card title={t('viewer3d.card.display')}>
            <div className={styles.fields}>
              <Field label={t('viewer3d.card.style')} wide>
                <Select<Shading> value={display.shading} onChange={(shading) => setDisplay((d) => ({ ...d, shading }))} options={[['shaded', t('viewer3d.card.styleShaded')], ['edges', t('viewer3d.card.styleEdges')], ['wireframe', t('viewer3d.card.styleWireframe')]]} />
              </Field>
              <Field label={t('viewer3d.card.up')} wide>
                <Select<'z' | 'y'> value={zUp ? 'z' : 'y'} onChange={(v) => changeUp(v === 'z')} options={[['z', t('viewer3d.card.upZ')], ['y', t('viewer3d.card.upY')]]} />
              </Field>
              <Field label={t('viewer3d.card.colours')}>
                <Select<'file' | 'single'>
                  value={display.singleColor ? 'single' : 'file'}
                  onChange={(v) => setDisplay((d) => ({ ...d, singleColor: v === 'single' ? pickedColor : null }))}
                  options={[['file', t('viewer3d.card.coloursFile')], ['single', t('viewer3d.card.coloursSingle')]]}
                />
              </Field>
              {display.singleColor && (
                <Field label={t('viewer3d.card.colour')}>
                  <input
                    type="color"
                    className={fieldStyles.color}
                    value={pickedColor}
                    onChange={(e) => {
                      setPickedColor(e.target.value);
                      setDisplay((d) => ({ ...d, singleColor: e.target.value }));
                    }}
                  />
                </Field>
              )}
              <Field label={t('viewer3d.card.background')}>
                <Select<Theme> value={display.theme} onChange={chooseBackdrop} options={[['dark', t('viewer3d.card.bgDark')], ['light', t('viewer3d.card.bgLight')]]} />
              </Field>
            </div>
            <Checkbox label={t('viewer3d.card.grid')} checked={display.grid} onChange={(grid) => setDisplay((d) => ({ ...d, grid }))} />
            {display.shading === 'edges' && stats && stats.triangles > 0 && stats.closed === null && (
              <p className={fieldStyles.help}>{t('viewer3d.card.noEdgesNote', { max: formatCount(MAX_TRIANGLES) })}</p>
            )}
          </Card>
        )}

        {model && stats && stats.triangles > 0 && (
          <Card title={t('viewer3d.card.section')}>
            <div className={styles.fields}>
              <Field label={t('viewer3d.card.cutAlong')}>
                <Select<'off' | Axis> value={section.axis ?? 'off'} onChange={(v) => setSection((s) => ({ ...s, axis: v === 'off' ? null : v }))} options={[['off', t('viewer3d.card.cutOff')], ['x', t('viewer3d.card.cutX')], ['y', t('viewer3d.card.cutY')], ['z', t('viewer3d.card.cutZ')]]} />
              </Field>
            </div>
            {section.axis && (
              <>
                <label className={styles.slider}>
                  <span>{t('viewer3d.card.position')}{sectionAt !== null && `: ${section.axis.toUpperCase()} = ${withUnit(formatNumber(sectionAt, 4), units)}`}</span>
                  <input type="range" min={0} max={1000} value={Math.round(section.position * 1000)} onChange={(e) => setSection((s) => ({ ...s, position: Number(e.target.value) / 1000 }))} />
                </label>
                <Checkbox label={t('viewer3d.card.keepOther')} checked={section.flip} onChange={(flip) => setSection((s) => ({ ...s, flip }))} />
                <p className={fieldStyles.help}>{t('viewer3d.card.cutInsideHint')}</p>
              </>
            )}
          </Card>
        )}

        {model && (
          <Card title={t('viewer3d.card.measure')}>
            <p className={fieldStyles.help}>
              {tool === 'measure' ? t('viewer3d.card.measureActive') : t('viewer3d.card.measureIdle')}
            </p>
            {distance !== null && (
              <table className={[fieldStyles.infoTable, styles.info].join(' ')}>
                <tbody>
                  <tr><th>{t('viewer3d.card.distance')}</th><td className={styles.strong}>{withUnit(formatNumber(distance), units)}</td></tr>
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <tr key={axis}><th>{t('viewer3d.card.alongAxis', { axis: axis.toUpperCase() })}</th><td>{withUnit(formatNumber(Math.abs(b[axis] - a[axis])), units)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className={fieldStyles.buttonRow}>
              <button type="button" className={fieldStyles.buttonSmall} aria-pressed={tool === 'measure'} onClick={() => setTool((cur) => (cur === 'measure' ? 'select' : 'measure'))}>
                {tool === 'measure' ? t('viewer3d.card.stopMeasuring') : t('viewer3d.card.startMeasuring')}
              </button>
              {measured.length > 0 && (
                <button type="button" className={fieldStyles.buttonSmall} onClick={() => { viewer?.clearMeasure(); setMeasured([]); }}>{t('viewer3d.card.clear')}</button>
              )}
            </div>
          </Card>
        )}

        {model && parts > 1 && (
          <Card title={t('viewer3d.card.partsTitle', { n: formatCount(parts) })}>
            <PartTree key={model.root.uuid} nodes={tree} selected={selected} onSelect={select} onToggleVisible={toggleVisible} />
            <div className={fieldStyles.buttonRow}>
              <button type="button" className={fieldStyles.buttonSmall} onClick={showAll}>{t('viewer3d.card.showAll')}</button>
            </div>
            {selected && (
              <div className={styles.selection}>
                <p className={styles.fileName} title={selected.name}>{selected.name || t('viewer3d.card.selectedPart')}</p>
                {selectedBox && !selectedBox.isEmpty() && <p className={styles.meta}>{t('viewer3d.card.sizeVal', { size: sizeText(selectedBox, units) })}</p>}
                <div className={fieldStyles.buttonRow}>
                  <button type="button" className={fieldStyles.buttonSmall} onClick={() => viewer?.fit(selected)}>{t('viewer3d.card.zoomTo')}</button>
                  <button type="button" className={fieldStyles.buttonSmall} onClick={() => showOnly(selected)}>{t('viewer3d.card.showOnly')}</button>
                  <button type="button" className={fieldStyles.buttonSmall} onClick={() => toggleVisible(selected)}>{selected.visible ? t('viewer3d.card.hide') : t('viewer3d.card.show')}</button>
                  <button type="button" className={fieldStyles.buttonSmall} onClick={() => select(null)}>{t('viewer3d.card.deselect')}</button>
                </div>
              </div>
            )}
          </Card>
        )}

        {model && model.animations.length > 0 && (
          <Card title={t('viewer3d.card.animation')}>
            <div className={styles.fields}>
              <Field label={t('viewer3d.card.clip')}>
                <Select<string>
                  value={animation === null ? 'none' : String(animation)}
                  onChange={(v) => {
                    const index = v === 'none' ? null : Number(v);
                    setAnimation(index);
                    setPaused(false);
                    viewer?.playAnimation(index);
                  }}
                  options={[['none', t('viewer3d.card.clipNone')], ...model.animations.map((clip, i) => [String(i), clip.name || t('viewer3d.card.clipNum', { n: i + 1 })] as [string, string])]}
                />
              </Field>
            </div>
            {animation !== null && (
              <div className={fieldStyles.buttonRow}>
                <button type="button" className={fieldStyles.buttonSmall} onClick={() => { viewer?.setPaused(!paused); setPaused(!paused); }}>{paused ? t('viewer3d.card.play') : t('viewer3d.card.pause')}</button>
              </div>
            )}
          </Card>
        )}

        {model && (
          <Card title={t('viewer3d.card.save')}>
            <p className={fieldStyles.help}>{t('viewer3d.card.saveHelp', { unitPart: units ? ` (${units})` : '' })}</p>
            <div className={styles.saveGrid}>
              {EXPORT_FORMATS.map((f) => (
                <button key={f.id} type="button" className={fieldStyles.button} title={f.help} disabled={saving !== null || !stats} onClick={() => save(f.id)}>
                  {saving === f.id ? t('viewer3d.card.saving') : f.label}
                </button>
              ))}
            </div>
            <div className={styles.screenshotRow}>
              <button type="button" className={fieldStyles.button} onClick={screenshot}>{t('viewer3d.card.imagePng')}</button>
              <Checkbox label={t('viewer3d.card.transparentBg')} checked={transparent} onChange={setTransparent} />
            </div>
            {saveError && <p className={fieldStyles.warning}>{saveError}</p>}
          </Card>
        )}
      </aside>
    </DropTarget>
  );
}
