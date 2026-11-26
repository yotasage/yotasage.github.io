export interface RGBA {
  /** 0..255 integer */
  r: number;
  /** 0..255 integer */
  g: number;
  /** 0..255 integer */
  b: number;
  /** 0..1 float */
  a: number;
}

export interface HSV {
  /** 0..360 degrees */
  h: number;
  /** 0..100 % */
  s: number;
  /** 0..100 % */
  v: number;
}

export interface HSL {
  /** 0..360 degrees */
  h: number;
  /** 0..100 % */
  s: number;
  /** 0..100 % */
  l: number;
}

export interface HWB {
  /** 0..360 degrees */
  h: number;
  /** 0..100 % */
  w: number;
  /** 0..100 % */
  b: number;
}

export interface CMYK {
  /** 0..100 % */
  c: number;
  /** 0..100 % */
  m: number;
  /** 0..100 % */
  y: number;
  /** 0..100 % */
  k: number;
}

export interface XYZ {
  /** D65, Y = 1.0 for white */
  x: number;
  y: number;
  z: number;
}

export interface Lab {
  /** 0..100 */
  l: number;
  /** approx -128..127 */
  a: number;
  /** approx -128..127 */
  b: number;
}

export interface LCH {
  /** 0..100 */
  l: number;
  /** 0..~150 */
  c: number;
  /** 0..360 */
  h: number;
}

export interface OKLab {
  /** 0..1 */
  l: number;
  /** approx -0.4..0.4 */
  a: number;
  /** approx -0.4..0.4 */
  b: number;
}

export interface OKLCH {
  /** 0..1 */
  l: number;
  /** 0..~0.4 */
  c: number;
  /** 0..360 */
  h: number;
}

export type PickerMode = 'square' | 'wheel' | 'oklch';

export type SliderSpace = 'rgb' | 'hsl' | 'hsv' | 'oklch' | 'cmyk';

export type HarmonyKind =
  | 'complementary'
  | 'analogous'
  | 'triadic'
  | 'split'
  | 'tetradic'
  | 'monochromatic';

export type MixSpace = 'oklch' | 'lab' | 'hsl' | 'srgb';

export type CvdKind = 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

export interface NamedColorMatch {
  name: string;
  hex: string;
  rgb: RGBA;
  deltaE: number;
}

export interface ColorFormatItem {
  id:
    | 'hex'
    | 'rgb'
    | 'hsl'
    | 'hsv'
    | 'hwb'
    | 'cmyk'
    | 'oklch'
    | 'oklab'
    | 'lab'
    | 'lch'
    | 'xyz';
  label: string;
  value: string;
  shortNote?: string;
}

export interface ContrastResult {
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
  aaUi: boolean;
  apcaLc: number;
  apcaLevel: 'fail' | 'spot' | 'large' | 'body' | 'fluent';
}

export interface DominantColor {
  color: RGBA;
  hex: string;
  share: number;
  count: number;
}

export interface SavedSwatch {
  id: string;
  hex: string;
  color: RGBA;
  label?: string;
}

export interface ImagePin {
  id: string;
  /** Normalized 0..1 image coordinates */
  nx: number;
  ny: number;
  /** Integer pixel coordinates */
  px: number;
  py: number;
  color: RGBA;
  hex: string;
}
