export interface IntegralExamplePreset {
  readonly id: string;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly expr: string;
  readonly variable: string;
  readonly definite: boolean;
  readonly lower?: string;
  readonly upper?: string;
}

export const INTEGRAL_EXAMPLES: readonly IntegralExamplePreset[] = [
  {
    id: 'u-sub-exp',
    tagKey: 'ex.int.usub.tag',
    code: '∫ x·exp(x²) dx',
    titleKey: 'ex.int.usub.title',
    descKey: 'ex.int.usub.desc',
    expr: 'x * exp(x^2)',
    variable: 'x',
    definite: false,
  },
  {
    id: 'by-parts-trig',
    tagKey: 'ex.int.parts.tag',
    code: '∫ x·cos(x) dx',
    titleKey: 'ex.int.parts.title',
    descKey: 'ex.int.parts.desc',
    expr: 'x * cos(x)',
    variable: 'x',
    definite: false,
  },
  {
    id: 'partial-frac',
    tagKey: 'ex.int.partial.tag',
    code: '∫ 1/(x² − 1) dx',
    titleKey: 'ex.int.partial.title',
    descKey: 'ex.int.partial.desc',
    expr: '1 / (x^2 - 1)',
    variable: 'x',
    definite: false,
  },
  {
    id: 'definite-sine',
    tagKey: 'ex.int.definite.tag',
    code: '∫₀^π sin(x) dx',
    titleKey: 'ex.int.definite.title',
    descKey: 'ex.int.definite.desc',
    expr: 'sin(x)',
    variable: 'x',
    definite: true,
    lower: '0',
    upper: 'pi',
  },
  {
    id: 'trig-power',
    tagKey: 'ex.int.trig.tag',
    code: '∫ sin²(x) dx',
    titleKey: 'ex.int.trig.title',
    descKey: 'ex.int.trig.desc',
    expr: 'sin(x)^2',
    variable: 'x',
    definite: false,
  },
  {
    id: 'log-parts',
    tagKey: 'ex.int.log.tag',
    code: '∫₁^e ln(x) dx',
    titleKey: 'ex.int.log.title',
    descKey: 'ex.int.log.desc',
    expr: 'ln(x)',
    variable: 'x',
    definite: true,
    lower: '1',
    upper: 'e',
  },
];

export interface DerivativeExamplePreset {
  readonly id: string;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly expr: string;
  readonly variable: string;
  readonly order: number;
  readonly evaluateAt: string;
}

export const DERIVATIVE_EXAMPLES: readonly DerivativeExamplePreset[] = [
  {
    id: 'product-chain',
    tagKey: 'ex.deriv.prod.tag',
    code: 'd/dx [x²·sin(3x)]',
    titleKey: 'ex.deriv.prod.title',
    descKey: 'ex.deriv.prod.desc',
    expr: 'x^2 * sin(3x)',
    variable: 'x',
    order: 1,
    evaluateAt: '',
  },
  {
    id: 'quotient-rational',
    tagKey: 'ex.deriv.quot.tag',
    code: 'd/dx [(x²+1)/(x−1)]',
    titleKey: 'ex.deriv.quot.title',
    descKey: 'ex.deriv.quot.desc',
    expr: '(x^2 + 1) / (x - 1)',
    variable: 'x',
    order: 1,
    evaluateAt: '',
  },
  {
    id: 'gaussian-chain',
    tagKey: 'ex.deriv.gauss.tag',
    code: 'd/dx [exp(−x²)]',
    titleKey: 'ex.deriv.gauss.title',
    descKey: 'ex.deriv.gauss.desc',
    expr: 'exp(-x^2)',
    variable: 'x',
    order: 1,
    evaluateAt: '0.5',
  },
  {
    id: 'second-order',
    tagKey: 'ex.deriv.second.tag',
    code: 'd²/dt² [t³·exp(−t)]',
    titleKey: 'ex.deriv.second.title',
    descKey: 'ex.deriv.second.desc',
    expr: 't^3 * exp(-t)',
    variable: 't',
    order: 2,
    evaluateAt: '',
  },
  {
    id: 'log-composition',
    tagKey: 'ex.deriv.log.tag',
    code: 'd/dx [ln(x² + 1)]',
    titleKey: 'ex.deriv.log.title',
    descKey: 'ex.deriv.log.desc',
    expr: 'ln(x^2 + 1)',
    variable: 'x',
    order: 1,
    evaluateAt: '1',
  },
  {
    id: 'tangent-trig',
    tagKey: 'ex.deriv.tan.tag',
    code: 'd/dx [arctan(2x)]',
    titleKey: 'ex.deriv.tan.title',
    descKey: 'ex.deriv.tan.desc',
    expr: 'atan(2*x)',
    variable: 'x',
    order: 1,
    evaluateAt: '0',
  },
];
