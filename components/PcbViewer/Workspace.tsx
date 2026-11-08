import React from 'react';

import { errorMessage } from '../../lib/pdf/files';
import { centerlineBox } from '../../lib/pcb/geometry';
import { LayerOverride } from '../../lib/pcb/identify';
import { buildBoard, LoadedFile, PickedFile, readFiles } from '../../lib/pcb/load';
import { Board, Box, isEmptyBox, Layer, LayerKind, Pt, Side, unionBox } from '../../lib/pcb/model';
import { defaultColor, defaultStyle } from '../../lib/pcb/render/colors';
import { BoardView, LayerStyle } from '../../lib/pcb/render/view';
import styles from '../../styles/PcbViewer.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import FileList from './FileList';
import LayerPanel, { LayerActions } from './LayerPanel';
import { canPickFolders, DropZone, PickButton } from './pick';

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
  React.useEffect(() => {
    view.onCursor = setPoint;
    return () => {
      view.onCursor = null;
    };
  }, [view]);
  if (!point) return null;
  const perPixel = units === 'in' ? view.mmPerPixel / 25.4 : view.mmPerPixel;
  const decimals = Math.min(6, Math.max(1, Math.ceil(-Math.log10(perPixel))));
  const f = (v: number) => (units === 'in' ? v / 25.4 : v).toFixed(decimals).replace('-', '−');
  return <div className={styles.coords} aria-live="off">{`X ${f(point.x)}  Y ${f(point.y)} ${UNIT_NAME[units]}`}</div>;
}

// The size of the board: from the outline layer if there is one, else from the copper.
function boardSize(board: Board): { box: Box; from: 'outline' | 'copper' | 'layers' } | null {
  const outline = board.layers.find((l) => l.kind === 'outline' && l.items.length);
  if (outline) {
    const box = centerlineBox(outline.items);
    if (!isEmptyBox(box)) return { box, from: 'outline' };
  }
  const pick = board.layers.some((l) => l.kind === 'copper') ? board.layers.filter((l) => l.kind === 'copper') : board.layers;
  let box: Box | null = null;
  for (const l of pick) {
    if (isEmptyBox(l.bbox)) continue;
    box = box ? unionBox(box, l.bbox) : { ...l.bbox };
  }
  return box ? { box, from: pick === board.layers ? 'layers' : 'copper' } : null;
}

function BoardInfo({ board, units, shown }: { board: Board; units: Units; shown: number }) {
  const size = boardSize(board);
  const copper = board.layers.filter((l) => l.kind === 'copper').length;
  const s = board.stackup ?? {};
  return (
    <>
      <p className={styles.boardName} title={board.name}>{board.name}</p>
      <table className={[qrStyles.infoTable, styles.info].join(' ')}>
        <tbody>
          {size && (
            <tr>
              <th>Size{size.from === 'outline' ? '' : size.from === 'copper' ? ' of the copper' : ' of the layers'}</th>
              <td>{formatLength(size.box.maxX - size.box.minX, units)} × {formatLength(size.box.maxY - size.box.minY, units)} {UNIT_NAME[units]}</td>
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
    </>
  );
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
  const [flipped, setFlipped] = React.useState(false);
  const [units, setUnits] = React.useState<Units>('mm');
  const [status, setStatus] = React.useState<Status>({ kind: 'loading', text: 'Reading…' });
  const [busy, setBusy] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [folders, setFolders] = React.useState(false);

  // The latest state, for the asynchronous loading and for actions that build on it.
  const latest = React.useRef({ files, overrides, layerStyles, order });
  latest.current = { files, overrides, layerStyles, order };
  const known = React.useRef(new Set<string>());
  const customOrder = React.useRef(false);
  const customColors = React.useRef(new Set<string>());
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
        }
        const read = await readFiles(picked, known.current, (text) => setStatus({ kind: 'loading', text }));
        const all = replace ? read : [...latest.current.files, ...read];
        const nextOverrides = replace ? new Map<string, LayerOverride>() : latest.current.overrides;
        // A design file (S3 and later) would replace the board here; Gerber, drill, job and CSV files add to it.
        setStatus({ kind: 'loading', text: 'Identifying the layers…' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        const next = buildBoard(all, nextOverrides);
        const hadLayers = !replace && latest.current.files.some((f) => f.gerber);
        latest.current.files = all;
        setFiles(all);
        setOverrides(nextOverrides);
        if (replace) {
          setFlipped(false);
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

  // The view follows the board, the layer styles and order, and the side.
  React.useEffect(() => {
    view?.setLayers(board?.layers ?? []);
  }, [view, board]);
  React.useEffect(() => {
    view?.setStyles(layerStyles, order);
  }, [view, layerStyles, order]);
  React.useEffect(() => {
    view?.setFlipped(flipped);
  }, [view, flipped]);
  React.useEffect(() => {
    if (view && fitPending.current && board) {
      fitPending.current = false;
      view.fit();
    }
  }, [view, board, layerStyles]);

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
      show(buildBoard(files, next), false);
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
            className={styles.canvas}
            tabIndex={0}
            aria-label="Board view. Drag to move, scroll or pinch to zoom; arrow keys move, + and − zoom, F fits the board."
          />
          {view && ready && <CursorReadout view={view} units={units} />}
          {ready && flipped && <span className={styles.sideBadge}>Seen from the bottom</span>}
          {ready && (
            <p className={styles.viewHint}>
              <span className={styles.mouseHint}>Drag to move · Scroll to zoom · F to fit</span>
              <span className={styles.touchHint}>One finger moves · Two fingers zoom</span>
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
              <span>No Gerber layers were found among these files. The file list says what each file is.</span>
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

        {board && (
          <Card title={`Layers (${board.layers.length})`}>
            <LayerPanel layers={layersInOrder} styles={layerStyles} actions={actions} />
            <p className={qrStyles.help}>The top of the list is drawn on top. Seen from the bottom, the layers of the two sides swap places.</p>
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
