import React from 'react';
import type { Object3D, Vector3 } from 'three';

import { baseName, download, errorMessage, formatBytes } from '../../lib/pdf/files';
import { EXPORT_FORMATS, ExportFormat, exportModel } from '../../lib/viewer3d/export';
import { formatCount, formatNumber, withUnit } from '../../lib/viewer3d/format';
import { LoadedModel, loadModel } from '../../lib/viewer3d/load';
import { disposeCadReader, MeshQuality } from '../../lib/viewer3d/occt';
import { isHelper, modelBox, ModelStats, modelStats } from '../../lib/viewer3d/stats';
import { MAX_TRIANGLES } from '../../lib/viewer3d/topology';
import { Axis, createViewer, Display, disposeObject, Offset, Projection, Section, Shading, THEMES, Theme, Tool, Viewer, ViewName } from '../../lib/viewer3d/viewer';
import styles from '../../styles/Viewer3D.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import { DropTarget, FilePickerButton } from '../PdfTools/ToolPage';
import { Checkbox, Field, NumberInput, Select } from '../QrGen/fields';
import { AxisGizmo, MeasureLabel } from './Overlays';
import PartTree, { buildTree, countParts } from './PartTree';

type Status = { kind: 'loading'; text: string } | { kind: 'error'; text: string } | { kind: 'ready' };

const VIEW_BUTTONS: [ViewName, string][] = [['iso', 'Isometric'], ['front', 'Front'], ['top', 'Top'], ['right', 'Right']];

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
  const volume = stats.volume === null ? null : withUnit(formatNumber(stats.volume), units, '³') + largerUnit(stats.volume, units, '³');
  return (
    <table className={[qrStyles.infoTable, styles.info].join(' ')}>
      <tbody>
        {!stats.box.isEmpty() && <tr><th>Size (X × Y × Z)</th><td>{sizeText(stats.box, units)}</td></tr>}
        {stats.meshes > 1 && <tr><th>Meshes</th><td>{formatCount(stats.meshes)}</td></tr>}
        {stats.triangles > 0 && <tr><th>Triangles</th><td>{formatCount(stats.triangles)}</td></tr>}
        {stats.vertices > 0 && <tr><th>Vertices</th><td>{formatCount(stats.vertices)}</td></tr>}
        {stats.points > 0 && <tr><th>Points</th><td>{formatCount(stats.points)}</td></tr>}
        {stats.lines > 0 && <tr><th>Line segments</th><td>{formatCount(stats.lines)}</td></tr>}
        {stats.triangles > 0 && <tr><th>Surface area</th><td>{withUnit(formatNumber(stats.area), units, '²')}{largerUnit(stats.area, units, '²')}</td></tr>}
        {volume && (
          <tr>
            <th>Volume</th>
            <td>
              {stats.closed === false ? 'None: the mesh is not closed' : volume}
              {stats.closed === null && <small className={styles.note}>Not checked whether the mesh is closed (over {formatCount(MAX_TRIANGLES)} triangles).</small>}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default function Workspace({ files, onOpen }: { files: File[]; onOpen: (files: File[]) => void }) {
  const container = React.useRef<HTMLDivElement>(null);
  const viewport = React.useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = React.useState<Viewer | null>(null);
  const [status, setStatus] = React.useState<Status>({ kind: 'loading', text: 'Starting the 3D view…' });
  const [model, setModel] = React.useState<LoadedModel | null>(null);
  const [stats, setStats] = React.useState<ModelStats | null>(null);
  const [quality, setQuality] = React.useState<MeshQuality>('normal');
  const [display, setDisplay] = React.useState<Display>({ shading: 'shaded', singleColor: null, grid: true, theme: 'dark' });
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
      .catch((e) => setStatus({ kind: 'error', text: `This browser could not start the 3D view (WebGL): ${errorMessage(e)}` }));
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
    setStatus({ kind: 'loading', text: 'Reading…' });
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
      setSaveError(`Could not save ${format.toUpperCase()}: ${errorMessage(e)}`);
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
      setSaveError(`Could not save the image: ${errorMessage(e)}`);
    }
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
        <div className={styles.toolbar} role="toolbar" aria-label="View">
          <button type="button" className={styles.toolButton} disabled={!ready} onClick={() => viewer.fit()} title="Show the whole model">Fit</button>
          {VIEW_BUTTONS.map(([view, label]) => (
            <button key={view} type="button" className={styles.toolButton} disabled={!ready} onClick={() => viewer.view(view)}>{label}</button>
          ))}
          <span className={styles.toolbarSpacer} />
          <button
            type="button"
            className={styles.toolButton}
            disabled={!ready}
            aria-pressed={projection === 'orthographic'}
            title="Orthographic: parallel lines stay parallel, and sizes do not shrink with distance"
            onClick={() => setProjection((p) => (p === 'perspective' ? 'orthographic' : 'perspective'))}
          >
            Orthographic
          </button>
          <button type="button" className={styles.toolButton} disabled={!ready} aria-pressed={tool === 'measure'} onClick={() => setTool((t) => (t === 'measure' ? 'select' : 'measure'))}>
            Measure
          </button>
          {typeof document !== 'undefined' && document.fullscreenEnabled && (
            <button type="button" className={styles.toolButton} aria-pressed={fullscreen} onClick={toggleFullscreen}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
          )}
        </div>
        <div className={styles.canvasBox}>
          <div ref={container} className={styles.canvasHost} />
          {viewer && ready && <AxisGizmo viewer={viewer} />}
          {viewer && distance !== null && <MeasureLabel viewer={viewer} points={measured} text={withUnit(formatNumber(distance), units)} />}
          {ready && (
            <p className={styles.viewHint}>
              {tool === 'measure' ? (
                <span>Click two points on the model to measure the distance between them.</span>
              ) : (
                <>
                  <span className={styles.mouseHint}>Drag to turn · Right-drag or Shift-drag to move · Scroll to zoom · Double-click to turn around a point</span>
                  <span className={styles.touchHint}>One finger turns · Two fingers zoom and move · Double-tap to turn around a point</span>
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
              <FilePickerButton accept="" onFiles={onOpen} className={qrStyles.button}>Open another file</FilePickerButton>
            </div>
          )}
        </div>
      </div>

      <aside className={styles.sidebar}>
        <Card title="File">
          <p className={styles.fileName} title={name}>{name}</p>
          <p className={styles.meta}>
            {model ? [...new Set(model.formats.map((f) => f.name))].join(', ') : 'Reading'} · {formatBytes(totalBytes)}
            {files.length > 1 && ` · ${files.length} files`}
          </p>
          {cad && (
            <Field label="Mesh quality" help="CAD files hold exact curved surfaces, which are split into triangles to be shown. Finer follows curves more closely, but takes longer and gives more triangles.">
              <Select<MeshQuality> value={quality} onChange={setQuality} disabled={status.kind === 'loading'} options={[['draft', 'Draft'], ['normal', 'Normal'], ['fine', 'Fine']]} />
            </Field>
          )}
          {model?.warnings.map((w) => <p key={w} className={qrStyles.warning}>{w}</p>)}
          {missing.length > 0 && (
            <p className={qrStyles.warning}>
              The model refers to files that were not opened with it: {missing.join(', ')}. Open them together with the model to see them.
            </p>
          )}
          <div className={qrStyles.buttonRow}>
            <FilePickerButton accept="" onFiles={onOpen} className={qrStyles.buttonSmall}>Open another file</FilePickerButton>
            <FilePickerButton accept="" onFiles={(added) => onOpen([...files, ...added])} className={qrStyles.buttonSmall}>Add files</FilePickerButton>
          </div>
          <p className={qrStyles.help}>Add files opens more models next to the ones that are open, to compare them.</p>
        </Card>

        {model && (
          <Card title="Model">
            {stats ? <ModelInfo stats={stats} units={units} /> : <p className={qrStyles.help}>Measuring the model…</p>}
            <p className={qrStyles.help}>
              {units ? `Lengths are in ${units === 'mm' ? 'millimetres' : units}.` : 'Lengths are in the units of the file (often millimetres for 3D printing).'}
              {gridCell !== null && display.grid && ` The squares of the grid are ${withUnit(formatNumber(gridCell), units)} wide.`}
            </p>
          </Card>
        )}

        {model && model.fileGroups.length > 1 && (
          <Card title="Positions">
            <p className={qrStyles.help}>
              Move the files apart to compare them{units ? ` (offsets in ${units})` : ''}. This only moves them in the view: the
              sizes above and the saved files keep the positions the files give.
            </p>
            {model.fileGroups.map(({ file }, index) => {
              const offset = offsets.get(file) ?? NO_OFFSET;
              return (
                <div key={`${index}-${file.name}`} role="group" aria-label={`Offset of ${file.name}`} className={styles.offset}>
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
            <div className={qrStyles.buttonRow}>
              <button type="button" className={qrStyles.buttonSmall} onClick={() => placeFiles(viewer.sideBySide())}>Side by side</button>
              <button
                type="button"
                className={qrStyles.buttonSmall}
                disabled={model.fileGroups.every(({ file }) => (offsets.get(file) ?? NO_OFFSET).every((v) => v === 0))}
                onClick={() => placeFiles(model.fileGroups.map(() => NO_OFFSET))}
              >
                Reset
              </button>
            </div>
          </Card>
        )}

        {model && (
          <Card title="Display">
            <div className={styles.fields}>
              <Field label="Style" wide>
                <Select<Shading> value={display.shading} onChange={(shading) => setDisplay((d) => ({ ...d, shading }))} options={[['shaded', 'Shaded'], ['edges', 'Shaded with edges'], ['wireframe', 'Wireframe']]} />
              </Field>
              <Field label="Up" wide>
                <Select<'z' | 'y'> value={zUp ? 'z' : 'y'} onChange={(v) => changeUp(v === 'z')} options={[['z', 'Z up (CAD, 3D printing)'], ['y', 'Y up (glTF, games)']]} />
              </Field>
              <Field label="Colours">
                <Select<'file' | 'single'>
                  value={display.singleColor ? 'single' : 'file'}
                  onChange={(v) => setDisplay((d) => ({ ...d, singleColor: v === 'single' ? pickedColor : null }))}
                  options={[['file', 'From the file'], ['single', 'One colour']]}
                />
              </Field>
              {display.singleColor && (
                <Field label="Colour">
                  <input
                    type="color"
                    className={qrStyles.color}
                    value={pickedColor}
                    onChange={(e) => {
                      setPickedColor(e.target.value);
                      setDisplay((d) => ({ ...d, singleColor: e.target.value }));
                    }}
                  />
                </Field>
              )}
              <Field label="Background">
                <Select<Theme> value={display.theme} onChange={(t) => setDisplay((d) => ({ ...d, theme: t }))} options={[['dark', 'Dark'], ['light', 'Light']]} />
              </Field>
            </div>
            <Checkbox label="Grid under the model" checked={display.grid} onChange={(grid) => setDisplay((d) => ({ ...d, grid }))} />
            {display.shading === 'edges' && stats && stats.triangles > 0 && stats.closed === null && (
              <p className={qrStyles.help}>Edges are not drawn on meshes with more than {formatCount(MAX_TRIANGLES)} triangles.</p>
            )}
          </Card>
        )}

        {model && stats && stats.triangles > 0 && (
          <Card title="Section">
            <div className={styles.fields}>
              <Field label="Cut along">
                <Select<'off' | Axis> value={section.axis ?? 'off'} onChange={(v) => setSection((s) => ({ ...s, axis: v === 'off' ? null : v }))} options={[['off', 'No section'], ['x', 'X axis'], ['y', 'Y axis'], ['z', 'Z axis']]} />
              </Field>
            </div>
            {section.axis && (
              <>
                <label className={styles.slider}>
                  <span>Position{sectionAt !== null && `: ${section.axis.toUpperCase()} = ${withUnit(formatNumber(sectionAt, 4), units)}`}</span>
                  <input type="range" min={0} max={1000} value={Math.round(section.position * 1000)} onChange={(e) => setSection((s) => ({ ...s, position: Number(e.target.value) / 1000 }))} />
                </label>
                <Checkbox label="Keep the other side" checked={section.flip} onChange={(flip) => setSection((s) => ({ ...s, flip }))} />
                <p className={qrStyles.help}>The inside of the model, where it is cut, is shown in orange.</p>
              </>
            )}
          </Card>
        )}

        {model && (
          <Card title="Measure">
            <p className={qrStyles.help}>
              {tool === 'measure' ? 'Click two points on the model. A third click starts a new measurement.' : 'Measure the distance between two points on the surface of the model.'}
            </p>
            {distance !== null && (
              <table className={[qrStyles.infoTable, styles.info].join(' ')}>
                <tbody>
                  <tr><th>Distance</th><td className={styles.strong}>{withUnit(formatNumber(distance), units)}</td></tr>
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <tr key={axis}><th>Along {axis.toUpperCase()}</th><td>{withUnit(formatNumber(Math.abs(b[axis] - a[axis])), units)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className={qrStyles.buttonRow}>
              <button type="button" className={qrStyles.buttonSmall} aria-pressed={tool === 'measure'} onClick={() => setTool((t) => (t === 'measure' ? 'select' : 'measure'))}>
                {tool === 'measure' ? 'Stop measuring' : 'Start measuring'}
              </button>
              {measured.length > 0 && (
                <button type="button" className={qrStyles.buttonSmall} onClick={() => { viewer?.clearMeasure(); setMeasured([]); }}>Clear</button>
              )}
            </div>
          </Card>
        )}

        {model && parts > 1 && (
          <Card title={`Parts (${formatCount(parts)})`}>
            <PartTree key={model.root.uuid} nodes={tree} selected={selected} onSelect={select} onToggleVisible={toggleVisible} />
            <div className={qrStyles.buttonRow}>
              <button type="button" className={qrStyles.buttonSmall} onClick={showAll}>Show all</button>
            </div>
            {selected && (
              <div className={styles.selection}>
                <p className={styles.fileName} title={selected.name}>{selected.name || 'Selected part'}</p>
                {selectedBox && !selectedBox.isEmpty() && <p className={styles.meta}>Size {sizeText(selectedBox, units)}</p>}
                <div className={qrStyles.buttonRow}>
                  <button type="button" className={qrStyles.buttonSmall} onClick={() => viewer?.fit(selected)}>Zoom to</button>
                  <button type="button" className={qrStyles.buttonSmall} onClick={() => showOnly(selected)}>Show only this</button>
                  <button type="button" className={qrStyles.buttonSmall} onClick={() => toggleVisible(selected)}>{selected.visible ? 'Hide' : 'Show'}</button>
                  <button type="button" className={qrStyles.buttonSmall} onClick={() => select(null)}>Deselect</button>
                </div>
              </div>
            )}
          </Card>
        )}

        {model && model.animations.length > 0 && (
          <Card title="Animation">
            <div className={styles.fields}>
              <Field label="Clip">
                <Select<string>
                  value={animation === null ? 'none' : String(animation)}
                  onChange={(v) => {
                    const index = v === 'none' ? null : Number(v);
                    setAnimation(index);
                    setPaused(false);
                    viewer?.playAnimation(index);
                  }}
                  options={[['none', 'None (rest pose)'], ...model.animations.map((clip, i) => [String(i), clip.name || `Animation ${i + 1}`] as [string, string])]}
                />
              </Field>
            </div>
            {animation !== null && (
              <div className={qrStyles.buttonRow}>
                <button type="button" className={qrStyles.buttonSmall} onClick={() => { viewer?.setPaused(!paused); setPaused(!paused); }}>{paused ? 'Play' : 'Pause'}</button>
              </div>
            )}
          </Card>
        )}

        {model && (
          <Card title="Save">
            <p className={qrStyles.help}>The parts that are shown, in the coordinates of the file{units ? ` (${units})` : ''}.</p>
            <div className={styles.saveGrid}>
              {EXPORT_FORMATS.map((f) => (
                <button key={f.id} type="button" className={qrStyles.button} title={f.help} disabled={saving !== null || !stats} onClick={() => save(f.id)}>
                  {saving === f.id ? 'Saving…' : f.label}
                </button>
              ))}
            </div>
            <div className={styles.screenshotRow}>
              <button type="button" className={qrStyles.button} onClick={screenshot}>Image (PNG)</button>
              <Checkbox label="Transparent background" checked={transparent} onChange={setTransparent} />
            </div>
            {saveError && <p className={qrStyles.warning}>{saveError}</p>}
          </Card>
        )}
      </aside>
    </DropTarget>
  );
}
