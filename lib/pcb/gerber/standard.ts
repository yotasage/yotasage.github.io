// The standard aperture templates of Gerber: C (circle), R (rectangle), O (obround) and P (regular polygon), each
// with an optional round hole, or a rectangular one as older files may have.
import { AperturePart, Pt } from '../model';
import { circlePoly, obroundPoly, rectPoly, regularPoly } from './shapes';

export interface StandardShape {
  parts: AperturePart[];
  // A circle is stroked when drawn with; other shapes are swept along the draw (deprecated, see the plotter).
  strokeDiameter?: number;
  outline?: Pt[];
}

function hole(args: number[], at: number): AperturePart[] {
  const x = args[at];
  const y = args[at + 1];
  if (!(x > 0)) return [];
  // A second value makes a rectangular hole (deprecated since 2015).
  if (y > 0) return [{ dark: false, poly: rectPoly(0, 0, x, y) }];
  return [{ dark: false, circle: { c: { x: 0, y: 0 }, r: x / 2 } }];
}

// Returns null for a template that is not a standard one. Sizes are in file units.
export function standardAperture(template: string, args: number[]): StandardShape | null {
  const a = (i: number) => (Number.isFinite(args[i]) ? Math.abs(args[i]) : 0);
  switch (template) {
    case 'C': {
      const d = a(0);
      return {
        parts: d > 0 ? [{ dark: true, circle: { c: { x: 0, y: 0 }, r: d / 2 } }, ...hole(args, 1)] : [],
        strokeDiameter: d,
      };
    }
    case 'R': {
      const poly = rectPoly(0, 0, a(0), a(1));
      return { parts: a(0) > 0 && a(1) > 0 ? [{ dark: true, poly }, ...hole(args, 2)] : [], outline: poly };
    }
    case 'O': {
      if (!(a(0) > 0 && a(1) > 0)) return { parts: [], outline: rectPoly(0, 0, a(0), a(1)) };
      const poly = obroundPoly(a(0), a(1));
      return { parts: [{ dark: true, poly }, ...hole(args, 2)], outline: poly };
    }
    case 'P': {
      const n = Math.round(a(1));
      if (!(a(0) > 0) || n < 3) return { parts: [], outline: circlePoly(0, 0, a(0) / 2, 8) };
      const poly = regularPoly(0, 0, a(0), n, Number.isFinite(args[2]) ? args[2] : 0);
      return { parts: [{ dark: true, poly }, ...hole(args, 3)], outline: poly };
    }
    default:
      return null;
  }
}
