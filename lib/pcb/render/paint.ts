// Painting on Canvas 2D, shared by the view on screen (view.ts) and the PNG export (lib/pcb/export/png.ts): one layer
// into a canvas of its own (dark items in the layer's colour, clear ones with destination-out), the board shape, and
// the two ways of putting layer canvases together: stacked with their opacity (layer view), or as the board looks
// (realistic view). A layer canvas holds one colour, so its alpha is the layer's coverage and it can serve as a mask.
import { Pt } from '../model';
import { PreparedLayer, PreparedShape, Run } from './prepare';

// What part of the board a canvas shows: device pixels per millimetre, the board point at the centre, mirrored in X
// (seen from the bottom), and the canvas size in device pixels.
export interface Frame {
  scale: number;
  cx: number;
  cy: number;
  flipped: boolean;
  width: number;
  height: number;
}

export interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export type Matrix = [number, number, number, number, number, number];

// The thinnest line drawn, in device pixels, so thin outlines stay visible when zoomed out.
export const MIN_LINE_PX = 0.8;

export function newSurface(width = 1, height = 1): Surface {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d') };
}

export function sizeSurface(s: Surface, width: number, height: number) {
  if (s.canvas.width !== width || s.canvas.height !== height) {
    s.canvas.width = width;
    s.canvas.height = height;
  }
}

export function freeSurface(s: Surface) {
  s.canvas.width = 0;
  s.canvas.height = 0;
}

// The transform from path coordinates (board mm relative to `origin`) to device pixels.
export function frameMatrix(f: Frame, origin: Pt): Matrix {
  const a = f.scale * (f.flipped ? -1 : 1);
  const d = -f.scale;
  return [a, 0, 0, d, f.width / 2 + (origin.x - f.cx) * a, f.height / 2 + (origin.y - f.cy) * d];
}

// Draws a layer into an empty (cleared) surface the size of the frame.
export function paintLayer(target: Surface, pl: PreparedLayer, color: string, f: Frame, scratch: Surface) {
  const ctx = target.ctx;
  sizeSurface(target, f.width, f.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, f.width, f.height);
  const m = frameMatrix(f, pl.origin);
  const minLine = MIN_LINE_PX / f.scale;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  // The part of the board in the frame, in the coordinates of the paths, to skip tiles that are not.
  const halfW = f.width / 2 / f.scale;
  const halfH = f.height / 2 / f.scale;
  const vx = f.cx - pl.origin.x;
  const vy = f.cy - pl.origin.y;
  const pad = minLine;
  for (const run of pl.runs) {
    ctx.setTransform(...m);
    ctx.globalCompositeOperation = run.dark ? 'source-over' : 'destination-out';
    for (const tile of run.tiles) {
      const t = tile.box;
      if (t.maxX < vx - halfW - pad || t.minX > vx + halfW + pad || t.maxY < vy - halfH - pad || t.minY > vy + halfH + pad) continue;
      if (tile.fill) ctx.fill(tile.fill);
      for (const g of tile.strokes) {
        ctx.lineWidth = Math.max(g.w, minLine);
        ctx.lineCap = g.cap;
        ctx.stroke(g.path);
      }
    }
    if (run.separate.length) paintSeparate(pl, run, m, ctx, color, f, scratch);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

// Flashes whose apertures have holes that cannot be drawn with the non-zero rule: each is drawn into a scratch
// canvas, where its clear parts erase only its own solid parts, and then copied onto the layer.
function paintSeparate(pl: PreparedLayer, run: Run, m: Matrix, ctx: CanvasRenderingContext2D, color: string, f: Frame, scratch: Surface) {
  sizeSurface(scratch, f.width, f.height);
  const sctx = scratch.ctx;
  sctx.fillStyle = color;
  const [a, , , d, e, ff] = m;
  const scale = Math.abs(a);
  for (const fl of run.separate) {
    const x = a * fl.e + e;
    const y = d * fl.f + ff;
    const r = fl.r * scale + 2;
    if (x + r < 0 || y + r < 0 || x - r > f.width || y - r > f.height) continue;
    const parts = pl.apertureParts.get(fl.ap);
    if (!parts) continue;
    if (r < 3) {
      // A few pixels across: the holes do not show, so the solid parts are drawn directly.
      ctx.setTransform(a * fl.a, d * fl.b, a * fl.c, d * fl.d, x, y);
      for (const p of parts) if (p.dark) ctx.fill(p.path);
      continue;
    }
    const x0 = Math.max(0, Math.floor(x - r));
    const y0 = Math.max(0, Math.floor(y - r));
    const x1 = Math.min(f.width, Math.ceil(x + r));
    const y1 = Math.min(f.height, Math.ceil(y + r));
    if (x1 <= x0 || y1 <= y0) continue;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(x0, y0, x1 - x0, y1 - y0);
    sctx.setTransform(a * fl.a, d * fl.b, a * fl.c, d * fl.d, x, y);
    for (const p of parts) {
      sctx.globalCompositeOperation = p.dark ? 'source-over' : 'destination-out';
      sctx.fill(p.path);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scratch.canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  }
  ctx.setTransform(...m);
}

// Paints a layer canvas over in another colour, keeping its coverage.
export function recolor(s: Surface, color: string) {
  const ctx = s.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
  ctx.globalCompositeOperation = 'source-over';
}

function reset(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// The layer view: layer canvases stacked in drawing order, each with its opacity, over the background (none: a
// transparent image).
export function compositeLayers(target: Surface, layers: { canvas: HTMLCanvasElement; opacity: number }[], background: string | null) {
  const ctx = target.ctx;
  reset(ctx);
  ctx.clearRect(0, 0, target.canvas.width, target.canvas.height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, target.canvas.width, target.canvas.height);
  }
  for (const l of layers) {
    ctx.globalAlpha = l.opacity;
    ctx.drawImage(l.canvas, 0, 0);
  }
  ctx.globalAlpha = 1;
}

// The colours of a board seen in the realistic view.
export interface RealisticColors {
  // Bare substrate (in mask openings without copper, or a board without mask).
  substrate: string;
  // Solder mask over substrate, and over copper (lighter, as on real boards).
  maskSubstrate: string;
  maskCopper: string;
  // Exposed copper (pads): the surface finish.
  finish: string;
  silk: string;
}

// The layer canvases the realistic view is made of, for one side. `mask` holds the mask openings (as Gerber files
// draw them); without a mask layer the board has no mask.
export interface RealisticInputs {
  copper: HTMLCanvasElement[];
  mask: HTMLCanvasElement[];
  silk: HTMLCanvasElement[];
  holes: HTMLCanvasElement[];
}

function fillShape(ctx: CanvasRenderingContext2D, shape: PreparedShape, f: Frame, color: string) {
  ctx.setTransform(...frameMatrix(f, shape.origin));
  ctx.fillStyle = color;
  ctx.fill(shape.path);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Copies canvases onto a cleared surface (their union).
function union(s: Surface, sources: HTMLCanvasElement[]) {
  const ctx = s.ctx;
  reset(ctx);
  ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
  for (const c of sources) ctx.drawImage(c, 0, 0);
}

function drawAll(ctx: CanvasRenderingContext2D, op: GlobalCompositeOperation, sources: HTMLCanvasElement[]) {
  ctx.globalCompositeOperation = op;
  for (const c of sources) ctx.drawImage(c, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

function tint(s: Surface, color: string) {
  recolor(s, color);
}

// The realistic view: the board shape in substrate (or mask) colour; mask openings show the substrate; copper under
// the mask in the mask's copper colour; exposed copper in the finish colour; silkscreen where there is mask (it is
// not printed in openings); holes cut through everything. Everything is clipped to the board shape (source-atop), and
// the background, if any, goes behind. Two temporary surfaces the size of the frame are needed. `dim` darkens the
// board (0 to 1), so that a highlight drawn over it stands out.
export function compositeRealistic(target: Surface, input: RealisticInputs, colors: RealisticColors, shape: PreparedShape | null, f: Frame,
  temps: [Surface, Surface], background: string | null, dim = 0) {
  const ctx = target.ctx;
  sizeSurface(target, f.width, f.height);
  reset(ctx);
  ctx.clearRect(0, 0, f.width, f.height);
  const [t, under] = temps;
  sizeSurface(t, f.width, f.height);
  sizeSurface(under, f.width, f.height);
  const hasMask = input.mask.length > 0;
  if (shape) {
    fillShape(ctx, shape, f, hasMask ? colors.maskSubstrate : colors.substrate);
    if (hasMask) {
      // Openings without copper: bare substrate.
      union(t, input.mask);
      tint(t, colors.substrate);
      drawAll(ctx, 'source-atop', [t.canvas]);
    }
    // Copper under the mask (copper minus openings), kept in `under`.
    union(under, input.copper);
    if (hasMask) drawAll(under.ctx, 'destination-out', input.mask);
    // Exposed copper: copper minus what is under the mask.
    union(t, input.copper);
    if (hasMask) drawAll(t.ctx, 'destination-out', [under.canvas]);
    tint(t, colors.finish);
    drawAll(ctx, 'source-atop', [t.canvas]);
    if (hasMask) {
      tint(under, colors.maskCopper);
      drawAll(ctx, 'source-atop', [under.canvas]);
    }
    // Silkscreen, only where the mask is.
    union(t, input.silk);
    if (hasMask) drawAll(t.ctx, 'destination-out', input.mask);
    tint(t, colors.silk);
    drawAll(ctx, 'source-atop', [t.canvas]);
    // Holes through everything.
    drawAll(ctx, 'destination-out', input.holes);
    if (dim > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0, 0, 0, ${dim})`;
      ctx.fillRect(0, 0, f.width, f.height);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  if (background) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, f.width, f.height);
    ctx.globalCompositeOperation = 'source-over';
  }
}

// The selection over the picture: an outline around the selected items (their canvases grown by `px` device pixels
// in eight directions, minus themselves), over a faint fill, so a large zone does not cover the board. Two temporary
// surfaces are needed.
export function compositeOutline(target: Surface, sources: HTMLCanvasElement[], color: string, px: number, fill: number, temps: [Surface, Surface]) {
  if (!sources.length) return;
  const [shape, ring] = temps;
  const w = target.canvas.width;
  const h = target.canvas.height;
  sizeSurface(shape, w, h);
  sizeSurface(ring, w, h);
  union(shape, sources);
  tint(shape, color);
  const ctx = ring.ctx;
  reset(ctx);
  ctx.clearRect(0, 0, w, h);
  const d = px * Math.SQRT1_2;
  for (const [dx, dy] of [[px, 0], [-px, 0], [0, px], [0, -px], [d, d], [d, -d], [-d, d], [-d, -d]]) ctx.drawImage(shape.canvas, dx, dy);
  drawAll(ctx, 'destination-out', [shape.canvas]);
  const t = target.ctx;
  reset(t);
  t.globalAlpha = fill;
  t.drawImage(shape.canvas, 0, 0);
  t.globalAlpha = 1;
  t.drawImage(ring.canvas, 0, 0);
}

// A highlight over the realistic view: the highlighted copper and silkscreen (canvases already in their colours),
// with the holes of the side cut through them. One temporary surface is needed.
export function compositeHighlight(target: Surface, lit: HTMLCanvasElement[], holes: HTMLCanvasElement[], temp: Surface) {
  if (!lit.length) return;
  sizeSurface(temp, target.canvas.width, target.canvas.height);
  union(temp, lit);
  drawAll(temp.ctx, 'destination-out', holes);
  reset(target.ctx);
  target.ctx.drawImage(temp.canvas, 0, 0);
}
