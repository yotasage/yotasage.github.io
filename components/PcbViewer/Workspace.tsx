import React from 'react';

import { errorMessage } from '../../lib/pdf/files';
import { DrillFormat } from '../../lib/pcb/excellon';
import { LayerOverride } from '../../lib/pcb/identify';
import { buildBoard, LoadedFile, PickedFile, readFiles } from '../../lib/pcb/load';
import { Board, Layer, LayerKind, Pt, Side } from '../../lib/pcb/model';
import { shapeBox } from '../../lib/pcb/outline';
import {
  defaultColor, defaultStyle, Finish, finishFromName, FINISHES, MASK_COLORS, MaskColor, maskFromName, RealisticStyle, realisticColors, SILK_COLORS, SilkColor,
  silkFromName,
} from '../../lib/pcb/render/colors';
import { BoardView, LayerStyle, ViewMode } from '../../lib/pcb/render/view';
import styles from '../../styles/PcbViewer.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import { Field, Select } from '../QrGen/fields';
import FileList from './FileList';
import LayerPanel, { LayerActions } from './LayerPanel';
import { MeasureCard, MeasureOverlay, MeasurePoint, snapPoint } from './Measure';
import { canPickFolders, DropZone, PickButton } from './pick';
import SaveCard from './SaveCard';

type Status = { kind: 'loading'; text: string } | { kind: 'ready' } | { kind: 'empty' } | { kind: 'error'; text: string };

export type Units = 'mm' | 'in';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.card}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

// A length in the chosen unit, with a number of decimals that fits millimetres or inches.
export function formatLength(mm: number, units: Units, decimals?: number): string {
  if (units === 'in') return (mm / 25.4).toFixed(decimals ?? 3);
  return mm.toFixed(decimals ?? 2);
}

const UNIT_NAME: Record<Units, string> = { mm: 'mm', in: 'in' };

// The board point under the mouse (or the last touch), as precise as one pixel on screen.
function CursorReadout({ view, units }: { view: BoardView; units: Units }) {
  const [point, setPoint] = React.useState<Pt | null>(null);
  React.useEffect(() => view.listenCursor((p) => setPoint(p)), [view]);
  if (!point) return null;
  const perPixel = units === 'in' ? view.mmPerPixel / 25.4 : view.mmPerPixel;
  const decimals = Math.min(6, Math.max(1, Math.ceil(-Math.log10(perPixel))));
  const f = (v: number) => (units === 'in' ? v / 25.4 : v).toFixed(decimals).replace('-', '−');
  return <div className={styles.coords} aria-live="off">{`X ${f(point.x)}  Y ${f(point.y)} ${UNIT_NAME[units]}`}</div>;
}

const SIZE_FROM: Record<NonNullable<Board['outlineFrom']>, string> = {
  outline: 'Size',
  design: 'Size',
  frame: 'Size',
  copper: 'Size of the copper',
  extent: 'Size of the layers',
};

function BoardInfo({ board, units, shown }: { board: Board; units: Units; shown: number }) {
  const box = board.outline?.length ? shapeBox(board.outline) : null;
  const copper = board.layers.filter((l) => l.kind === 'copper').length;
  const s = board.stackup ?? {};
  return (
    <>
      <p className={styles.boardName} title={board.name}>{board.name}</p>
      <table className={[qrStyles.infoTable, styles.info].join(' ')}>
        <tbody>
          {box && (
            <tr>
              <th>{SIZE_FROM[board.outlineFrom ?? 'outline']}</th>
              <td>{formatLength(box.maxX - box.minX, units)} × {formatLength(box.maxY - box.minY, units)} {UNIT_NAME[units]}</td>
            </tr>
          )}
          {copper > 0 && <tr><th>Copper layers</th><td>{s.copperLayers && s.copperLayers !== copper ? `${copper} (the job file says ${s.copperLayers})` : copper}</td></tr>}
          {s.thickness !== undefined && <tr><th>Thickness</th><td>{formatLength(s.thickness, units, units === 'in' ? 4 : 3)} {UNIT_NAME[units]}</td></tr>}
          {s.mask && <tr><th>Solder mask</th><td>{s.mask}</td></tr>}
          {s.silk && <tr><th>Silkscreen</th><td>{s.silk}</td></tr>}
          {s.finish && <tr><th>Finish</th><td>{s.finish}</td></tr>}
          <tr><th>Layers</th><td>{board.layers.length}, {shown} shown</td></tr>
        </tbody>
      </table>
      {board.outlineFrom === 'copper' && <p className={styles.detailNote}>There is no board outline among the files, so the board is taken to be the rectangle around the copper.</p>}
      {board.warnings.map((w) => <p key={w} className={qrStyles.warning}>{w}</p>)}
    </>
  );
}

// The colours of the realistic view, from the job file at first.
function RealisticFields({ value, onChange, board }: { value: RealisticStyle; onChange: (v: RealisticStyle) => void; board: Board }) {
  const s = board.stackup ?? {};
  const fromJob = [s.mask && `${s.mask} mask`, s.silk && `${s.silk} silkscreen`, s.finish && `finish ${s.finish}`].filter(Boolean);
  return (
    <>
      <div className={styles.detailFields}>
        <Field label="Solder mask">
          <Select<MaskColor> value={value.mask} onChange={(mask) => onChange({ ...value, mask })} options={Object.entries(MASK_COLORS).map(([k, v]) => [k as MaskColor, v.label])} />
        </Field>
        <Field label="Silkscreen">
          <Select<SilkColor> value={value.silk} onChange={(silk) => onChange({ ...value, silk })} options={Object.entries(SILK_COLORS).map(([k, v]) => [k as SilkColor, v.label])} />
        </Field>
        <Field label="Finish">
          <Select<Finish> value={value.finish} onChange={(finish) => onChange({ ...value, finish })} options={Object.entries(FINISHES).map(([k, v]) => [k as Finish, v.label])} />
        </Field>
      </div>
      <p className={qrStyles.help}>
        {fromJob.length ? `The job file says: ${fromJob.join(', ')}.` : 'No job file gives the colours; green mask, white silkscreen and ENIG are assumed.'}
        {' '}The view uses the copper, solder mask, silkscreen and drill layers of the side in view, whether they are shown in the layer list or not.
      </p>
    </>
  );
}

function styleFromStackup(board: Board | null): RealisticStyle {
  const s = board?.stackup ?? {};
  return { mask: maskFromName(s.mask), silk: silkFromName(s.silk), finish: finishFromName(s.finish) };
}

// The default order with the user's order on top: layers the user moved stay where they are; new layers go after
// the layer that comes before them in the default order.
function mergeOrder(defaults: string[], current: string[]): string[] {
  const kept = current.filter((id) => defaults.includes(id));
  defaults.forEach((id, i) => {
    if (kept.includes(id)) return;
    const before = defaults.slice(0, i).reverse().find((p) => kept.includes(p));
    kept.splice(before ? kept.indexOf(before) + 1 : 0, 0, id);
  });
  return kept;
}

export default function Workspace({ initial }: { initial: PickedFile[] }) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const viewport = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<BoardView | null>(null);
  const [files, setFiles] = React.useState<LoadedFile[]>([]);
  const [board, setBoard] = React.useState<Board | null>(null);
  const [layerStyles, setLayerStyles] = React.useState<Map<string, LayerStyle>>(() => new Map());
  const [order, setOrder] = React.useState<string[]>([]);
  const [overrides, setOverrides] = React.useState<Map<string, LayerOverride>>(() => new Map());
  const [drillFormats, setDrillFormats] = React.useState<Map<string, DrillFormat>>(() => new Map());
  const [flipped, setFlipped] = React.useState(false);
  const [mode, setMode] = React.useState<ViewMode>('layers');
  const [realistic, setRealistic] = React.useState<RealisticStyle>(() => styleFromStackup(null));
  const [units, setUnits] = React.useState<Units>('mm');
  const [status, setStatus] = React.useState<Status>({ kind: 'loading', text: 'Reading…' });
  const [busy, setBusy] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [folders, setFolders] = React.useState(false);
  const [measuring, setMeasuring] = React.useState(false);
  const [points, setPoints] = React.useState<MeasurePoint[]>([]);
  const [hover, setHover] = React.useState<MeasurePoint | null>(null);

  // The latest state, for the asynchronous loading and for actions that build on it.
  const latest = React.useRef({ files, overrides, layerStyles, order, drillFormats, measuring, points });
  latest.current = { files, overrides, layerStyles, order, drillFormats, measuring, points };
  const known = React.useRef(new Set<string>());
  const customOrder = React.useRef(false);
  const customColors = React.useRef(new Set<string>());
  const customRealistic = React.useRef(false);
  const fitPending = React.useRef(false);
  const queue = React.useRef<Promise<void>>(Promise.resolve());
  const started = React.useRef(false);

  React.useEffect(() => {
    const v = new BoardView(canvas.current);
    v.onBusy = setBusy;
    setView(v);
    setFolders(canPickFolders());
    const onFullscreen = () => setFullscreen(document.fullscreenElement === viewport.current);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      v.dispose();
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, []);

  // Shows a board built from the files: keeps the colours, visibility and order the user chose, and gives new layers
  // their defaults.
  const show = React.useCallback((next: Board | null, fit: boolean) => {
    const prev = latest.current.layerStyles;
    const nextStyles = new Map<string, LayerStyle>();
    const added: string[] = [];
    for (const l of next?.layers ?? []) {
      const old = prev.get(l.id);
      nextStyles.set(l.id, old ? { ...old, color: customColors.current.has(l.id) ? old.color : defaultColor(l) } : defaultStyle(l));
      if (!old) added.push(l.id);
    }
    // New layers that would all start hidden (documentation, unknown files) are shown, so opening them shows something.
    if (added.length && added.every((id) => !nextStyles.get(id).visible)) {
      for (const id of added) nextStyles.set(id, { ...nextStyles.get(id), visible: true });
    }
    const defaults = (next?.layers ?? []).map((l) => l.id);
    const nextOrder = customOrder.current ? mergeOrder(defaults, latest.current.order) : defaults;
    fitPending.current = fit;
    setBoard(next);
    setLayerStyles(nextStyles);
    setOrder(nextOrder);
    if (!customRealistic.current) setRealistic(styleFromStackup(next));
  }, []);

  // Reads files and adds them to the board, or replaces everything. Loads run one after the other.
  const open = React.useCallback((picked: PickedFile[], replace: boolean) => {
    queue.current = queue.current.then(async () => {
      setStatus({ kind: 'loading', text: 'Reading…' });
      try {
        if (replace) {
          known.current = new Set();
          customOrder.current = false;
          customColors.current = new Set();
          customRealistic.current = false;
        }
        const read = await readFiles(picked, known.current, (text) => setStatus({ kind: 'loading', text }));
        const all = replace ? read : [...latest.current.files, ...read];
        const nextOverrides = replace ? new Map<string, LayerOverride>() : latest.current.overrides;
        const nextFormats = replace ? new Map<string, DrillFormat>() : latest.current.drillFormats;
        // A design file (S3 and later) would replace the board here; Gerber, drill, job and CSV files add to it.
        setStatus({ kind: 'loading', text: 'Identifying the layers…' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        const next = buildBoard(all, nextOverrides, nextFormats);
        const hadLayers = !replace && latest.current.files.some((f) => f.gerber || f.drill);
        latest.current.files = all;
        setFiles(all);
        setOverrides(nextOverrides);
        setDrillFormats(nextFormats);
        if (replace) {
          setFlipped(false);
          setMode('layers');
          setPoints([]);
          latest.current.layerStyles = new Map();
          latest.current.order = [];
        }
        show(next, !hadLayers);
        setStatus(next ? { kind: 'ready' } : { kind: 'empty' });
      } catch (e) {
        setStatus({ kind: 'error', text: `The files could not be read: ${errorMessage(e)}` });
      }
    });
  }, [show]);

  React.useEffect(() => {
    if (!view || started.current) return;
    started.current = true;
    open(initial, true);
  }, [view, open, initial]);

  // The view follows the board, the layer styles and order, the side and the mode.
  React.useEffect(() => {
    view?.setLayers(board?.layers ?? []);
    view?.setShape(board?.outline);
  }, [view, board]);
  React.useEffect(() => {
    view?.setStyles(layerStyles, order);
  }, [view, layerStyles, order]);
  React.useEffect(() => {
    view?.setFlipped(flipped);
  }, [view, flipped]);
  React.useEffect(() => {
    view?.setMode(mode, realisticColors(realistic));
  }, [view, mode, realistic]);
  React.useEffect(() => {
    if (view && fitPending.current && board) {
      fitPending.current = false;
      view.fit();
    }
  }, [view, board, layerStyles]);

  // Measuring: a click or tap places a point (snapped), the mouse shows what a click would snap to.
  React.useEffect(() => {
    if (!view) return undefined;
    view.onTap = (p, _css, pointerType) => {
      if (!latest.current.measuring) return;
      const m = snapPoint(view, p, pointerType);
      setPoints((prev) => (prev.length >= 2 ? [m] : [...prev, m]));
    };
    let frame = 0;
    let pending: { p: Pt | null; type: string } | null = null;
    const stop = view.listenCursor((p, type) => {
      if (!latest.current.measuring || type !== 'mouse') return;
      pending = { p, type };
      if (frame) return;
      // At most one snap per frame.
      frame = requestAnimationFrame(() => {
        frame = 0;
        const q = pending;
        pending = null;
        setHover(q?.p ? snapPoint(view, q.p, q.type) : null);
      });
    });
    return () => {
      view.onTap = null;
      stop();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [view]);
  React.useEffect(() => {
    if (!measuring) setHover(null);
  }, [measuring]);
  React.useEffect(() => {
    const c = canvas.current;
    if (!c) return undefined;
    // Escape clears the measurement, and a second one stops measuring.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !latest.current.measuring) return;
      if (latest.current.points.length) setPoints([]);
      else setMeasuring(false);
    };
    c.addEventListener('keydown', onKey);
    return () => c.removeEventListener('keydown', onKey);
  }, []);

  const layersInOrder = React.useMemo(() => {
    const byId = new Map((board?.layers ?? []).map((l) => [l.id, l]));
    return order.map((id) => byId.get(id)).filter((l): l is Layer => Boolean(l));
  }, [board, order]);

  const updateStyle = (id: string, change: Partial<LayerStyle>) => {
    setLayerStyles((prev) => {
      const old = prev.get(id);
      if (!old) return prev;
      return new Map(prev).set(id, { ...old, ...change });
    });
  };

  const actions: LayerActions = {
    toggle: (id) => updateStyle(id, { visible: !layerStyles.get(id)?.visible }),
    color: (id, color) => {
      customColors.current.add(id);
      updateStyle(id, { color });
    },
    opacity: (id, opacity) => updateStyle(id, { opacity }),
    move: (id, by) => {
      customOrder.current = true;
      setOrder((prev) => {
        const i = prev.indexOf(id);
        const j = i + by;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = prev.slice();
        next.splice(i, 1);
        next.splice(j, 0, id);
        return next;
      });
    },
    type: (id, kind: LayerKind, side: Side) => {
      const next = new Map(overrides).set(id, { kind, side });
      setOverrides(next);
      latest.current.overrides = next;
      show(buildBoard(files, next, drillFormats), false);
    },
    drillFormat: (id, format) => {
      const next = new Map(drillFormats);
      if (format) next.set(id, format);
      else next.delete(id);
      setDrillFormats(next);
      latest.current.drillFormats = next;
      show(buildBoard(files, overrides, next), false);
    },
    only: (id) => {
      setLayerStyles((prev) => {
        const next = new Map<string, LayerStyle>();
        for (const [k, s] of prev) next.set(k, { ...s, visible: k === id });
        return next;
      });
    },
    showSet: (which) => {
      const keep = (l: Layer) => {
        if (which === 'all') return true;
        if (which === 'none') return false;
        if (l.kind === 'outline' || l.kind === 'drill') return true;
        if (!['copper', 'mask', 'silk', 'paste'].includes(l.kind)) return false;
        return l.side === which;
      };
      setLayerStyles((prev) => {
        const next = new Map<string, LayerStyle>();
        for (const l of board?.layers ?? []) {
          const s = prev.get(l.id);
          if (s) next.set(l.id, { ...s, visible: keep(l) });
        }
        return next;
      });
      if (which === 'top' || which === 'bottom') setFlipped(which === 'bottom');
    },
  };

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void viewport.current?.requestFullscreen();
  }

  function toggleMeasuring() {
    setMeasuring((m) => !m);
    canvas.current?.focus();
  }

  const ready = status.kind === 'ready' && board;
  const shown = layersInOrder.filter((l) => layerStyles.get(l.id)?.visible).length;
  const openButtons = (
    <div className={qrStyles.buttonRow}>
      <PickButton onFiles={(f) => open(f, false)} className={qrStyles.buttonSmall}>Add files</PickButton>
      {folders && <PickButton folder onFiles={(f) => open(f, false)} className={qrStyles.buttonSmall}>Add folder</PickButton>}
      <PickButton onFiles={(f) => open(f, true)} className={qrStyles.buttonSmall}>Open other files</PickButton>
    </div>
  );

  return (
    <DropZone onFiles={(f) => open(f, false)} className={styles.workspace} overClassName={styles.workspaceDropOver}>
      <div ref={viewport} className={[styles.viewport, fullscreen ? styles.viewportFullscreen : ''].join(' ')}>
        <div className={styles.toolbar} role="toolbar" aria-label="View">
          <button type="button" className={styles.toolButton} disabled={!ready} onClick={() => view?.fit()} title="Show the whole board">Fit</button>
          <span className={styles.segmented} role="group" aria-label="Side">
            <button type="button" className={styles.toolButton} aria-pressed={!flipped} onClick={() => setFlipped(false)} title="Look at the board from the top">Top</button>
            <button type="button" className={styles.toolButton} aria-pressed={flipped} onClick={() => setFlipped(true)} title="Look at the board from the bottom (mirrored)">Bottom</button>
          </span>
          <span className={styles.segmented} role="group" aria-label="View">
            <button type="button" className={styles.toolButton} aria-pressed={mode === 'layers'} onClick={() => setMode('layers')} title="Each layer in its own colour">Layers</button>
            <button type="button" className={styles.toolButton} aria-pressed={mode === 'realistic'} onClick={() => setMode('realistic')} title="The board as it looks: mask, copper, finish, silkscreen and holes">Realistic</button>
          </span>
          <button type="button" className={styles.toolButton} disabled={!ready} aria-pressed={measuring} onClick={toggleMeasuring} title="Measure the distance between two points">Measure</button>
          <button type="button" className={styles.toolButton} disabled={!ready} onClick={() => view?.zoomBy(1 / 1.5)} aria-label="Zoom out">−</button>
          <button type="button" className={styles.toolButton} disabled={!ready} onClick={() => view?.zoomBy(1.5)} aria-label="Zoom in">+</button>
          <span className={styles.toolbarSpacer} />
          <span className={styles.segmented} role="group" aria-label="Units">
            <button type="button" className={styles.toolButton} aria-pressed={units === 'mm'} onClick={() => setUnits('mm')}>mm</button>
            <button type="button" className={styles.toolButton} aria-pressed={units === 'in'} onClick={() => setUnits('in')}>inch</button>
          </span>
          {typeof document !== 'undefined' && document.fullscreenEnabled && (
            <button type="button" className={styles.toolButton} aria-pressed={fullscreen} onClick={toggleFullscreen}>{fullscreen ? 'Exit full screen' : 'Full screen'}</button>
          )}
        </div>
        <div className={styles.canvasBox}>
          <canvas
            ref={canvas}
            className={[styles.canvas, measuring ? styles.canvasMeasure : ''].join(' ')}
            tabIndex={0}
            aria-label="Board view. Drag to move, scroll or pinch to zoom; arrow keys move, + and − zoom, F fits the board."
          />
          {view && ready && (measuring || points.length === 2) && <MeasureOverlay view={view} points={points} hover={measuring ? hover : null} />}
          {view && ready && <CursorReadout view={view} units={units} />}
          {ready && (flipped || mode === 'realistic') && (
            <span className={styles.sideBadge}>{mode === 'realistic' ? `Realistic · ${flipped ? 'bottom' : 'top'}` : 'Seen from the bottom'}</span>
          )}
          {ready && (
            <p className={styles.viewHint}>
              {measuring ? (
                <>
                  <span className={styles.mouseHint}>Click two points to measure · Drag to move · Esc clears</span>
                  <span className={styles.touchHint}>Tap two points to measure · Drag to move</span>
                </>
              ) : (
                <>
                  <span className={styles.mouseHint}>Drag to move · Scroll to zoom · F to fit</span>
                  <span className={styles.touchHint}>One finger moves · Two fingers zoom</span>
                </>
              )}
            </p>
          )}
          {busy && <span className={styles.busy} aria-label="Drawing" />}
          {status.kind === 'loading' && (
            <div className={styles.overlay} role="status">
              <span className={styles.spinner} aria-hidden />
              <span>{status.text}</span>
            </div>
          )}
          {status.kind === 'empty' && (
            <div className={[styles.overlay, styles.overlayError].join(' ')} role="alert">
              <span>No Gerber or drill layers were found among these files. The file list says what each file is.</span>
              {openButtons}
            </div>
          )}
          {status.kind === 'error' && (
            <div className={[styles.overlay, styles.overlayError].join(' ')} role="alert">
              <span>{status.text}</span>
              {openButtons}
            </div>
          )}
        </div>
      </div>

      <aside className={styles.sidebar}>
        <Card title="Board">
          {board ? <BoardInfo board={board} units={units} shown={shown} /> : <p className={qrStyles.help}>{status.kind === 'loading' ? 'Reading the files…' : 'No board.'}</p>}
          {openButtons}
          <p className={qrStyles.help}>Add files adds layers to this board; drop files or folders on the page to do the same.</p>
        </Card>

        {board && mode === 'realistic' && (
          <Card title="Realistic view">
            <RealisticFields
              value={realistic}
              board={board}
              onChange={(v) => {
                customRealistic.current = true;
                setRealistic(v);
              }}
            />
          </Card>
        )}

        {board && (
          <Card title="Measure">
            <MeasureCard measuring={measuring} points={points} onToggle={toggleMeasuring} onClear={() => setPoints([])} />
          </Card>
        )}

        {board && (
          <Card title={`Layers (${board.layers.length})`}>
            <LayerPanel layers={layersInOrder} styles={layerStyles} actions={actions} files={files} />
            <p className={qrStyles.help}>The top of the list is drawn on top. Seen from the bottom, the layers of the two sides swap places.</p>
          </Card>
        )}

        {board && view && (
          <Card title="Save">
            <SaveCard view={view} board={board} mode={mode} flipped={flipped} layerStyles={layerStyles} colors={realisticColors(realistic)} />
          </Card>
        )}

        {files.length > 0 && (
          <Card title={`Files (${files.filter((f) => f.detected.id !== 'zip').length})`}>
            <FileList files={files} layers={board?.layers ?? []} />
          </Card>
        )}
      </aside>
    </DropZone>
  );
}
