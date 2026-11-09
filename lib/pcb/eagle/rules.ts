// EAGLE's design rules (<designrules> of a board, the values of a .dru file) as the reader needs them: the restring
// that sets the copper of pads and vias, the solder stop and cream masks, SMD roundness, pad shapes and elongation,
// and the clearances that polygons keep.
//
// From EAGLE's help on the design rules: a restring is a share of the drill, clamped to a minimum and a maximum, and
// can differ for the top, inner and bottom layers of pads and the outer and inner layers of vias; where a pad's or via's
// own diameter gives a larger ring, that diameter is used on the outer layers (useDiameter: bit 1 pads top, 2 pads
// inner, 4 pads bottom, 8 vias outer, 16 vias inner; 13 by default). Inner layers of pads and vias are always round.
// Stop masks are a share of the smaller side of SMDs, pads and vias, clamped, around SMDs, pads and the vias whose
// drill exceeds the limit; cream masks are made for SMDs only, smaller than the SMD by their share.

const MIL = 0.0254;

// EAGLE's built-in values, used where a board does not give one.
const DEFAULTS: Record<string, string> = {
  layerSetup: '(1*16)',
  mdWireWire: '8mil', mdWirePad: '8mil', mdWireVia: '8mil', mdPadPad: '8mil', mdPadVia: '8mil', mdViaVia: '8mil',
  mdSmdPad: '8mil', mdSmdVia: '8mil', mdSmdSmd: '8mil', mdCopperDimension: '40mil', mdDrill: '8mil',
  msMicroVia: '9.99mm',
  rvPadTop: '0.25', rvPadInner: '0.25', rvPadBottom: '0.25', rvViaOuter: '0.25', rvViaInner: '0.25',
  rvMicroViaOuter: '0.25', rvMicroViaInner: '0.25',
  rlMinPadTop: '10mil', rlMaxPadTop: '20mil', rlMinPadInner: '10mil', rlMaxPadInner: '20mil', rlMinPadBottom: '10mil',
  rlMaxPadBottom: '20mil', rlMinViaOuter: '8mil', rlMaxViaOuter: '20mil', rlMinViaInner: '8mil', rlMaxViaInner: '20mil',
  rlMinMicroViaOuter: '4mil', rlMaxMicroViaOuter: '20mil', rlMinMicroViaInner: '4mil', rlMaxMicroViaInner: '20mil',
  psTop: '-1', psBottom: '-1', psFirst: '-1', psElongationLong: '100', psElongationOffset: '100',
  mvStopFrame: '1', mvCreamFrame: '0', mlMinStopFrame: '4mil', mlMaxStopFrame: '4mil', mlMinCreamFrame: '0mil',
  mlMaxCreamFrame: '0mil', mlViaStopLimit: '0mil',
  srRoundness: '0', srMinRoundness: '0mil', srMaxRoundness: '0mil',
  useDiameter: '13',
};

// A length with its unit ("10mil", "0.1mm", "0.0254inch", "25mic"), in mm; a bare number is in mm.
export function parseLength(s: string | undefined): number | null {
  if (s === undefined) return null;
  const m = /^\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(mil|mm|mic|inch|in)?\s*$/.exec(s);
  if (!m) return null;
  const v = Number(m[1]);
  switch (m[2]) {
    case 'mil': return v * MIL;
    case 'mic': return v / 1000;
    case 'inch':
    case 'in': return v * 25.4;
    default: return v;
  }
}

export type PadSide = 'top' | 'inner' | 'bottom';

// EAGLE's pad shapes of the Shapes tab (psTop, psBottom, psFirst): −1 as in the library.
const FORCED: Record<number, string> = { 0: 'square', 1: 'round', 2: 'octagon' };

export class EagleRules {
  constructor(private params: Map<string, string>, readonly name?: string) {}

  raw(key: string): string {
    return this.params.get(key) ?? DEFAULTS[key] ?? '';
  }

  // A plain number (a share, a count, a flag).
  value(key: string): number {
    const v = Number(this.raw(key));
    if (Number.isFinite(v)) return v;
    const d = Number(DEFAULTS[key]);
    return Number.isFinite(d) ? d : 0;
  }

  // A length in mm.
  length(key: string): number {
    return parseLength(this.raw(key)) ?? parseLength(DEFAULTS[key]) ?? 0;
  }

  private clamp(share: string, min: string, max: string, of: number): number {
    const lo = this.length(min);
    const hi = this.length(max);
    const v = this.value(share) * of;
    return Math.max(lo, Math.min(Math.max(lo, hi), v));
  }

  restring(drill: number, which: 'PadTop' | 'PadInner' | 'PadBottom' | 'ViaOuter' | 'ViaInner' | 'MicroViaOuter' | 'MicroViaInner'): number {
    return this.clamp(`rv${which}`, `rlMin${which}`, `rlMax${which}`, drill);
  }

  private uses(bit: number): boolean {
    return (Math.round(this.value('useDiameter')) & bit) !== 0;
  }

  // The diameter of a pad on a layer: the drill plus twice the restring, or the library's diameter where that is
  // larger and the rules use it there.
  padDiameter(drill: number, library: number, side: PadSide): number {
    const which = side === 'top' ? 'PadTop' : side === 'bottom' ? 'PadBottom' : 'PadInner';
    const ring = drill + 2 * this.restring(drill, which);
    const bit = side === 'top' ? 1 : side === 'inner' ? 2 : 4;
    return library > 0 && this.uses(bit) ? Math.max(library, ring) : ring;
  }

  viaDiameter(drill: number, given: number, inner: boolean, micro: boolean): number {
    const which = micro ? (inner ? 'MicroViaInner' : 'MicroViaOuter') : inner ? 'ViaInner' : 'ViaOuter';
    const ring = drill + 2 * this.restring(drill, which);
    return given > 0 && this.uses(inner ? 16 : 8) ? Math.max(given, ring) : ring;
  }

  // How much a stop mask opening is larger than the pad, SMD or via on each side, from its smaller dimension.
  stopMargin(smaller: number): number {
    return this.clamp('mvStopFrame', 'mlMinStopFrame', 'mlMaxStopFrame', smaller);
  }

  // How much a cream (paste) opening is smaller than the SMD on each side.
  creamMargin(smaller: number): number {
    return this.clamp('mvCreamFrame', 'mlMinCreamFrame', 'mlMaxCreamFrame', smaller);
  }

  // Vias with a larger drill than this get a stop mask opening.
  get viaStopLimit(): number {
    return this.length('mlViaStopLimit');
  }

  // The corner radius of an SMD: the library's roundness (a share of half the smaller side), or the rules' where that is
  // larger.
  smdRadius(dx: number, dy: number, roundness: number): number {
    const half = Math.min(dx, dy) / 2;
    const own = (Math.max(0, Math.min(100, roundness)) / 100) * half;
    const lo = this.length('srMinRoundness');
    const hi = this.length('srMaxRoundness');
    const rule = Math.max(lo, Math.min(Math.max(lo, hi), this.value('srRoundness') * half));
    return Math.min(half, Math.max(own, rule));
  }

  // A pad's shape on the top or bottom layer, after the rules' choices.
  padShape(shape: string, first: boolean, side: 'top' | 'bottom'): string {
    const firstShape = FORCED[Math.round(this.value('psFirst'))];
    if (first && firstShape) return firstShape;
    if (shape === 'long' || shape === 'offset') return shape;
    return FORCED[Math.round(this.value(side === 'top' ? 'psTop' : 'psBottom'))] ?? shape;
  }

  // The length of a long or offset pad as a share of its width.
  elongation(shape: 'long' | 'offset'): number {
    return 1 + Math.max(0, this.value(shape === 'long' ? 'psElongationLong' : 'psElongationOffset')) / 100;
  }

  get microViaDrill(): number {
    return this.length('msMicroVia');
  }
}
