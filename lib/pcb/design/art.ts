// The artwork of design graphics and text: lines, arcs, circles, polygons and curves as layer items (dashed lines
// split into dashes as KiCad plots them), and text in the stroke font or from the outlines a file stores for
// TrueType text, with knockout text as a box with the letters cut out.
import { breakLines, knockoutMargin, rotate, strokeText } from '../font/stroke';
import { counterClockwise, DEG, segArc } from '../geometry';
import { ArtItem, Contour, DesignGraphic, DesignText, Pt } from '../model';

// A line this thin is drawn as a hairline (KiCad shows zero-width lines that way).
const HAIRLINE = 0.001;

export interface DashSettings {
  dash: number;
  gap: number;
}

function line(a: Pt, b: Pt, w: number, obj: number | undefined): ArtItem {
  return { k: 'line', a, b, w, cap: 'round', dark: true, ...(obj !== undefined ? { obj } : {}) };
}

function arc(c: Pt, r: number, start: number, sweep: number, w: number, obj: number | undefined): ArtItem {
  return { k: 'arc', c, r, start, sweep, w, dark: true, ...(obj !== undefined ? { obj } : {}) };
}

export function circleContour(c: Pt, r: number): Contour {
  const p = { x: c.x + r, y: c.y };
  return { start: p, segs: [{ to: p, arc: { c, ccw: true } }] };
}

// The pattern of a dashed line: lengths of dashes and gaps, in mm, as KiCad plots them with round ends (a dash is one
// width shorter and a gap one width longer than their ratios, a dot a fifth of the width long).
function pattern(kind: DesignGraphic['dash'], w: number, s: DashSettings): number[] {
  const dash = Math.max(s.dash - 1, 1) * w;
  const gap = (s.gap + 1) * w;
  const dot = 0.2 * w;
  switch (kind) {
    case 'dash':
      return [dash, gap];
    case 'dot':
      return [dot, gap];
    case 'dash_dot':
      return [dash, gap, dot, gap];
    case 'dash_dot_dot':
      return [dash, gap, dot, gap, dot, gap];
    default:
      return [];
  }
}

// A path (lines and arcs, from `from`) cut into dashes. `phase` carries the pattern on from piece to piece.
class Dasher {
  private index = 0;
  private left: number;

  constructor(private pat: number[], private w: number, private obj: number | undefined, private out: ArtItem[]) {
    this.left = pat[0];
  }

  private advance() {
    this.index = (this.index + 1) % this.pat.length;
    this.left = this.pat[this.index];
  }

  lineTo(a: Pt, b: Pt) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let at = 0;
    let guard = 0;
    while (at < len - 1e-9 && guard++ < 100000) {
      const step = Math.min(this.left, len - at);
      const on = this.index % 2 === 0;
      if (on) {
        const p = { x: a.x + ((b.x - a.x) * at) / len, y: a.y + ((b.y - a.y) * at) / len };
        const q = { x: a.x + ((b.x - a.x) * (at + step)) / len, y: a.y + ((b.y - a.y) * (at + step)) / len };
        this.out.push(line(p, q, this.w, this.obj));
      }
      at += step;
      this.left -= step;
      if (this.left <= 1e-9) this.advance();
    }
  }

  arc(c: Pt, r: number, start: number, sweep: number) {
    const len = (Math.abs(sweep) * DEG) * r;
    let at = 0;
    let guard = 0;
    const dir = Math.sign(sweep);
    while (at < len - 1e-9 && guard++ < 100000) {
      const step = Math.min(this.left, len - at);
      if (this.index % 2 === 0) {
        const a0 = start + (dir * at) / r / DEG;
        const sw = (dir * step) / r / DEG;
        if (step > 1e-9) this.out.push(arc(c, r, a0, sw, this.w, this.obj));
        else {
          const p = { x: c.x + r * Math.cos(a0 * DEG), y: c.y + r * Math.sin(a0 * DEG) };
          this.out.push(line(p, p, this.w, this.obj));
        }
      }
      at += step;
      this.left -= step;
      if (this.left <= 1e-9) this.advance();
    }
  }
}

// The lines and arcs along a contour; dashed, each side starts the pattern again (as KiCad plots rectangles and
// polygons).
function strokeContour(c: Contour, w: number, obj: number | undefined, out: ArtItem[], dashes: (() => Dasher) | null) {
  let from = c.start;
  for (const seg of c.segs) {
    const dasher = dashes?.() ?? null;
    if (seg.arc) {
      const { start, sweep } = segArc(from, seg);
      const r = Math.hypot(from.x - seg.arc.c.x, from.y - seg.arc.c.y);
      if (dasher) dasher.arc(seg.arc.c, r, start, sweep);
      else out.push(arc(seg.arc.c, r, start, sweep, w, obj));
    } else if (dasher) dasher.lineTo(from, seg.to);
    else if (from.x !== seg.to.x || from.y !== seg.to.y) out.push(line(from, seg.to, w, obj));
    from = seg.to;
  }
}

export function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt): Pt[] {
  // Enough segments to follow the curve within a few micrometres on board sizes.
  const span = Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const steps = Math.max(8, Math.min(200, Math.ceil(span * 4)));
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

// The items of a graphic. With `forOutline`, zero-width lines are kept and nothing is dashed (for the board shape).
export function graphicItems(g: DesignGraphic, obj: number | undefined, dash: DashSettings, forOutline = false): ArtItem[] {
  const out: ArtItem[] = [];
  const w = g.w > 0 ? g.w : forOutline || !g.filled ? HAIRLINE : 0;
  const dashes = !forOutline && g.dash && g.w > 0 ? () => new Dasher(pattern(g.dash, g.w, dash), g.w, obj, out) : null;
  const dasher = dashes?.() ?? null;
  const s = g.shape;
  if ('line' in s) {
    if (dasher) dasher.lineTo(s.line[0], s.line[1]);
    else if (w > 0) out.push(line(s.line[0], s.line[1], w, obj));
  } else if ('arc' in s) {
    if (dasher) dasher.arc(s.arc.c, s.arc.r, s.arc.start, s.arc.sweep);
    else if (w > 0) out.push(arc(s.arc.c, s.arc.r, s.arc.start, s.arc.sweep, w, obj));
  } else if ('circle' in s) {
    if (g.filled) out.push({ k: 'region', contours: [circleContour(s.circle.c, s.circle.r)], dark: true, ...(obj !== undefined ? { obj } : {}) });
    if (dasher) dasher.arc(s.circle.c, s.circle.r, 0, -360);
    else if (w > 0) out.push(arc(s.circle.c, s.circle.r, 0, 360, w, obj));
  } else if ('poly' in s) {
    if (g.filled) out.push({ k: 'region', contours: [counterClockwise(s.poly)], dark: true, ...(obj !== undefined ? { obj } : {}) });
    if (dashes || w > 0) strokeContour(s.poly, w, obj, out, dashes);
  } else if ('curve' in s) {
    const pts = bezier(...s.curve);
    for (let i = 1; i < pts.length; i += 1) {
      if (dasher) dasher.lineTo(pts[i - 1], pts[i]);
      else if (w > 0) out.push(line(pts[i - 1], pts[i], w, obj));
    }
  }
  return out;
}

// --- Text ---

const NM = 1e6;

function boxContour(minX: number, minY: number, maxX: number, maxY: number, ox: number, oy: number, angle: number): Contour {
  // In internal units with Y down, turned around the anchor, then to millimetres with Y up.
  const corners = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].map(([x, y]) => {
    const p = rotate(x, y, ox, oy, angle);
    return { x: p.x / NM, y: -p.y / NM };
  });
  return counterClockwise({ start: corners[0], segs: [{ to: corners[1] }, { to: corners[2] }, { to: corners[3] }, { to: corners[0] }] });
}

// The items of a text. Knockout text is a box (dark) with the letters erased from it (clear): it must come before
// the other items of its layer, so the letters erase only the box.
export function textItems(t: DesignText, obj: number | undefined): ArtItem[] {
  const out: ArtItem[] = [];
  const o = obj !== undefined ? { obj } : {};
  const margin = knockoutMargin(t.h * NM);
  if (t.outline?.length) {
    if (t.knockout) {
      // The box around the outlines in the text's own frame.
      const ox = t.at.x * NM;
      const oy = -t.at.y * NM;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of t.outline) {
        for (const p of [c.start, ...c.segs.map((s) => s.to)]) {
          const q = rotate(p.x * NM, -p.y * NM, ox, oy, -t.rot);
          minX = Math.min(minX, q.x);
          minY = Math.min(minY, q.y);
          maxX = Math.max(maxX, q.x);
          maxY = Math.max(maxY, q.y);
        }
      }
      out.push({ k: 'region', contours: [boxContour(minX - margin, minY - margin, maxX + margin, maxY + margin, ox, oy, t.rot)], dark: true, ...o });
      out.push({ k: 'region', contours: t.outline, dark: false, ...o });
    } else {
      out.push({ k: 'region', contours: t.outline, dark: true, ...o });
    }
    return out;
  }
  const thickness = t.thick * NM;
  const text = t.wrap ? breakLines(t.s, t.wrap * NM, t.w * NM, t.h * NM, thickness, Boolean(t.italic)) : t.s;
  const stroked = strokeText({
    text,
    x: t.at.x * NM,
    y: -t.at.y * NM,
    angle: t.rot,
    sizeX: t.w * NM,
    sizeY: t.h * NM,
    thickness,
    hAlign: t.just.h,
    vAlign: t.just.v === 'middle' ? 'center' : t.just.v,
    mirror: t.mirror,
    italic: Boolean(t.italic),
    lineSpacing: t.lineSpacing,
  });
  if (t.knockout) {
    const b = stroked.box;
    out.push({ k: 'region', contours: [boxContour(b.minX - margin, b.minY - margin, b.maxX + margin, b.maxY + margin, stroked.origin.x, stroked.origin.y, t.rot)], dark: true, ...o });
  }
  const dark = !t.knockout;
  const w = t.thick > 0 ? t.thick : HAIRLINE;
  for (const s of stroked.strokes) {
    let prev: Pt = { x: s[0] / NM, y: -s[1] / NM };
    if (s.length === 2) {
      out.push({ k: 'line', a: prev, b: prev, w, cap: 'round', dark, ...o });
      continue;
    }
    for (let k = 2; k < s.length; k += 2) {
      const p = { x: s[k] / NM, y: -s[k + 1] / NM };
      out.push({ k: 'line', a: prev, b: p, w, cap: 'round', dark, ...o });
      prev = p;
    }
  }
  return out;
}
