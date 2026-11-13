// The worked examples of the Smith chart tool's Learn section (step M6.2), transcribed from
// docs/smith-chart/examples.md: each example's circuit as a link, its steps (what to do, the state that counts as done,
// one hint, the theory topic), the links of its finished circuits and the figures its answers state. `stepDone` tests
// the visitor's own circuit, so any route to the state counts (typing, dragging, the solver). Framework-free and pure:
// the grid, the typed answer and the Γ of every node when each step was done come from the page in a GuideContext.

import { METRIC_STRIDE, M_ANGLE, M_MAG, M_Q, M_RL, M_VSWR, M_YI, M_YR, M_ZI, M_ZR, NODE_STRIDE, evaluate, nodeGamma, nodeMetrics } from './network';
import { goalResidual } from './goal';
import { KIND_CODES } from './state';
import type { Circuit } from './state';
import { packParts } from './parts';
import { valueKindOf } from './values';

/** The theory anchors a step's "→ theory" opens (Theory.tsx and TheorySolver.tsx). */
export type TopicId = 'how-to-use' | 'gamma-z-y' | 'reading-the-chart' | 'moving-on-the-chart' | 'transmission-lines'
  | 'how-good-is-a-match' | 'matching-with-two-parts' | 'two-one-or-none' | 'one-value-and-a-point' | 'realisable-values';
/** A node: 0 the load, k after the k-th part from the load, 'in' the input. */
export type NodeRef = number | 'in';
/** What an answer reads at a node: |Γ|, ∠Γ in degrees, VSWR, return loss in dB, normalised r x g b, R in ohms, the node Q. */
export type Quantity = 'mag' | 'angle' | 'vswr' | 'rl' | 'r' | 'x' | 'g' | 'b' | 'R' | 'Q';

export type Check =
  /** The parts from the load are exactly these kinds (the link's codes, 'ls,cp'). */
  | { k: 'kinds'; codes: string }
  /** |Γ_node − Γ(r + jx)| ≤ tol ('in', r 1, x 0 is the centre). */
  | { k: 'near'; node: NodeRef; r: number; x: number; tol: number }
  /** goal.ts goalResidual of the circle at the node ≤ tol. */
  | { k: 'circle'; node: NodeRef; kind: 'r' | 'g' | 'x'; value: number; tol: number }
  /** Part `part` (1-based from the load) is an L or C (`of`) with |v/value − 1| ≤ rel. */
  | { k: 'value'; part: number; of: 'L' | 'C'; value: number; rel: number }
  /** The typed answer is within tol of `value` and of the engine's value of the quantity at the node now. */
  | { k: 'answer'; quantity: Quantity; node: NodeRef; value: number; tol: number }
  | { k: 'grid'; modes: readonly ('Y' | 'ZY')[] }
  /** The load is R + jX to 1e-9 relative. */
  | { k: 'load'; R: number; X: number }
  /** Node's Γ is at least `by` from where it was when step `step` (1-based) was done (the other solution). */
  | { k: 'away'; step: number; node: NodeRef; by: number }
  /** Nothing to check: the visitor presses Next. */
  | { k: 'next' };

export interface Step {
  do: string;
  /** Done when any group holds, a group when all its checks hold (OR of ANDs). */
  done: readonly (readonly Check[])[];
  hint: string;
  topic: TopicId;
  /** The link of a circuit where this step is done, from examples.md's numbers (the harness plays it); absent: the circuit stays. */
  reach?: string;
}

/** A figure the example's answers state, at the digits it is written with (half a unit of its last decimal). */
export type Stated =
  /** At a node of a circuit: `at` −1 the example's link, k ≥ 0 solutions[k], or a link. q: a Quantity, the mismatch loss in dB, Γ's parts. */
  | { at: number | string; node: NodeRef; q: Quantity | 'ml' | 'gr' | 'gi'; text: string }
  /** A part's value (1-based from the load) in its unit: "39.79 nH", "70.71 Ω", a length "0.1520" in λ. */
  | { at: number | string; part: number; text: string };

export interface Example {
  id: string;
  title: string;
  intro: string;
  link: string;
  steps: readonly Step[];
  /** Links of the finished circuits. */
  solutions: readonly string[];
  stated: readonly Stated[];
  /** The claims (claims.md) the example's answers make. */
  claims: readonly number[];
}

// ---------------------------------------------------------------------------------------------------------------
// The data (examples.md, in its order)

const P = 'v=1&z0=50&f0=100e6&zl=';
const kinds = (codes: string): Check => ({ k: 'kinds', codes });
const centre = (tol: number): Check => ({ k: 'near', node: 'in', r: 1, x: 0, tol });
const near = (node: NodeRef, r: number, x: number, tol: number): Check => ({ k: 'near', node, r, x, tol });
const on = (node: NodeRef, kind: 'r' | 'g' | 'x', value: number, tol: number): Check => ({ k: 'circle', node, kind, value, tol });
const val = (part: number, of: 'L' | 'C', value: number, rel: number): Check => ({ k: 'value', part, of, value, rel });
const ans = (quantity: Quantity, node: NodeRef, value: number, tol: number): Check => ({ k: 'answer', quantity, node, value, tol });
const grid: Check = { k: 'grid', modes: ['Y', 'ZY'] };
const away = (step: number, node: NodeRef, by: number): Check => ({ k: 'away', step, node, by });
const all = (...checks: Check[]): readonly (readonly Check[])[] => [checks];
const fig = (at: number | string, node: NodeRef, q: Quantity | 'ml' | 'gr' | 'gi', text: string): Stated => ({ at, node, q, text });
const val$ = (at: number | string, part: number, text: string): Stated => ({ at, part, text });

const E6A = `${P}25:0&p=ls:39.78873577297384e-9,cp:31.83098861837907e-12`;
const E6B = `${P}25:0&p=cs:63.66197723675814e-12,lp:79.57747154594767e-9`;
const E7A = `${P}100:0&p=cp:15.915494309189536e-12,ls:79.57747154594767e-9`;
const E7B = `${P}100:0&p=lp:159.15494309189535e-9,cs:31.83098861837907e-12`;
const E9A = `${P}25:25&p=tl:0.1618959044126083:50`;
const E9B = `${P}25:25&p=tl:0.4118959044126083:50`;

export const EXAMPLES: readonly Example[] = [
  {
    id: 'reading-a-match',
    title: 'Reading |Γ|, VSWR and return loss',
    intro: 'A 75 Ω load on a 50 Ω reference. How far from a match is it, in the three figures engineers use?',
    link: `${P}75:0&p=`,
    steps: [
      { do: 'Read |Γ| of the load from the readout, or as the point’s distance from the centre.', done: all(ans('mag', 0, 0.2, 0.005)),
        hint: 'Γ = (z − 1)/(z + 1) with z = 75/50 = 1.5.', topic: 'gamma-z-y' },
      { do: 'Read the VSWR.', done: all(ans('vswr', 0, 1.5, 0.01)),
        hint: 'VSWR = (1 + |Γ|)/(1 − |Γ|); a real load above Z0 sits on the axis at r = VSWR.', topic: 'how-good-is-a-match' },
      { do: 'Read the return loss.', done: all(ans('rl', 0, 13.98, 0.05)), hint: 'RL = −20 log₁₀|Γ|.', topic: 'how-good-is-a-match' },
      { do: 'Set the load’s R to 25 Ω.', done: all({ k: 'load', R: 25, X: 0 }), hint: 'the Load R field above the strip.',
        topic: 'gamma-z-y', reach: `${P}25:0&p=` },
      { do: 'Read the VSWR now.', done: all(ans('vswr', 0, 2, 0.01)), hint: 'Γ = (0.5 − 1)/(0.5 + 1) = −1/3.', topic: 'how-good-is-a-match' },
    ],
    solutions: [],
    stated: [
      fig(-1, 0, 'mag', '0.2'), fig(-1, 0, 'vswr', '1.5'), fig(-1, 0, 'rl', '13.98'), fig(-1, 0, 'ml', '0.177'),
      fig(`${P}25:0&p=`, 0, 'gr', '-0.3333'), fig(`${P}25:0&p=`, 0, 'vswr', '2'), fig(`${P}25:0&p=`, 0, 'rl', '9.54'),
    ],
    claims: [191, 192, 193],
  },
  {
    id: 'reading-a-point',
    title: 'Reading Γ of a complex load',
    intro: 'The start circuit’s load without its parts: a resistance with some inductance in series. Read where it is.',
    link: `${P}25:25&p=`,
    steps: [
      { do: 'Read |Γ|.', done: all(ans('mag', 0, 0.447, 0.005)), hint: 'z = 25/50 + j25/50 = 0.5 + j0.5.', topic: 'gamma-z-y' },
      { do: 'Read the angle of Γ, from the rim scale or the readout.', done: all(ans('angle', 0, 116.6, 1)),
        hint: 'the angle is measured from the right half of the axis, counter-clockwise.', topic: 'reading-the-chart' },
      { do: 'Read the VSWR.', done: all(ans('vswr', 0, 2.62, 0.02)),
        hint: 'follow the point’s |Γ| circle to the right half of the axis and read r there.', topic: 'how-good-is-a-match' },
      { do: 'Read the return loss.', done: all(ans('rl', 0, 6.99, 0.05)), hint: '−20 log₁₀|Γ|.', topic: 'how-good-is-a-match' },
    ],
    solutions: [],
    stated: [
      fig(-1, 0, 'gr', '-0.2'), fig(-1, 0, 'gi', '0.4'), fig(-1, 0, 'mag', '0.447'), fig(-1, 0, 'angle', '116.6'),
      fig(-1, 0, 'vswr', '2.62'), fig(-1, 0, 'rl', '6.99'), fig(-1, 0, 'ml', '0.97'),
    ],
    claims: [194, 195],
  },
  {
    id: 'admittance',
    title: 'The same load as an admittance: Y and ZY',
    intro: 'Shunt parts add admittance, so a shunt part is read on the Y grid. Read this load as y = g + jb.',
    link: `${P}25:25&p=`,
    steps: [
      { do: 'Switch the grid to Y or ZY.', done: all(grid), hint: 'the Z / Y / ZY switch by the chart.', topic: 'reading-the-chart' },
      { do: 'Read g, the normalised conductance.', done: all(ans('g', 0, 1, 0.02)),
        hint: 'every g circle touches the short at Γ = −1; find the one through L.', topic: 'reading-the-chart' },
      { do: 'Read b, the normalised susceptance.', done: all(ans('b', 0, -1, 0.02)),
        hint: 'on the Y grid a negative b lies in the upper half.', topic: 'gamma-z-y' },
    ],
    solutions: [],
    stated: [fig(-1, 0, 'g', '1'), fig(-1, 0, 'b', '-1')],
    claims: [196, 197, 198],
  },
  {
    id: 'series-or-shunt',
    title: 'Series against shunt: one L, two ways',
    intro: 'The same inductor moves the point differently in series and in shunt. Put one in each way and compare.',
    link: `${P}25:0&p=`,
    steps: [
      { do: 'Add a series L and type L = 39.79 nH in its card.', done: all(kinds('ls'), val(1, 'L', 39.79e-9, 0.005)),
        hint: 'x = ωL/Z0 = 2π·100 MHz·39.79 nH/50 Ω = 0.5.', topic: 'moving-on-the-chart', reach: `${P}25:0&p=ls:39.78873577297384e-9` },
      { do: 'Read x at node 1, the end of its arc.', done: all(ans('x', 1, 0.5, 0.01)),
        hint: 'a series part keeps r = 0.5: the point runs clockwise up its r circle.', topic: 'moving-on-the-chart' },
      { do: 'Remove it and add a shunt L of the same 39.79 nH.', done: all(kinds('lp'), val(1, 'L', 39.79e-9, 0.005)),
        hint: 'in shunt it adds b = −Z0/(ωL) = −2 to the load’s y = 2.', topic: 'moving-on-the-chart', reach: `${P}25:0&p=lp:39.78873577297384e-9` },
      { do: 'Read x at node 1 now.', done: all(ans('x', 1, 0.25, 0.01)), hint: 'y = 2 − j2, and z = 1/y.', topic: 'gamma-z-y' },
    ],
    solutions: [`${P}25:0&p=ls:39.78873577297384e-9`, `${P}25:0&p=lp:39.78873577297384e-9`],
    stated: [
      val$(0, 1, '39.79 nH'), fig(0, 1, 'r', '0.5'), fig(0, 1, 'x', '0.5'), fig(0, 1, 'mag', '0.447'),
      fig(1, 0, 'g', '2'), fig(1, 1, 'r', '0.25'), fig(1, 1, 'x', '0.25'), fig(1, 1, 'g', '2'), fig(1, 1, 'mag', '0.62'),
    ],
    claims: [199, 200],
  },
  {
    id: 'one-shunt-part',
    title: 'One shunt part for a load on g = 1',
    intro: 'E3 found this load on the g = 1 circle. One shunt part then reaches the centre: it moves along g.',
    link: `${P}25:25&p=`,
    steps: [
      { do: 'Switch to the Y or ZY grid and find the load on g = 1.', done: all(grid), hint: 'y = 1 − j1 (E3).', topic: 'reading-the-chart' },
      { do: 'Add a shunt C.', done: all(kinds('cp')), hint: 'a shunt C adds +jb: clockwise along its g circle, downwards.',
        topic: 'moving-on-the-chart', reach: `${P}25:25&p=cp:31.83098861837907e-12` },
      { do: 'Set it so the input is at the centre.', done: all(kinds('cp'), centre(0.02)),
        hint: 'b must cancel −1: C = b/(ωZ0) with b = 1.', topic: 'moving-on-the-chart' },
    ],
    solutions: [`${P}25:25&p=cp:31.83098861837907e-12`],
    stated: [fig(-1, 0, 'g', '1'), fig(-1, 0, 'b', '-1'), val$(0, 1, '31.83 pF'), fig(0, 'in', 'R', '50')],
    claims: [201],
  },
  {
    id: 'l-match-up',
    title: 'L-match from 25 Ω up to 50 Ω, both solutions',
    intro: 'A load below Z0 takes a series part first, onto the g = 1 circle, then a shunt part along g = 1 to the centre. There are two ways.',
    link: `${P}25:0&p=`,
    steps: [
      { do: 'Add a series L and drag it until node 1 is on the g = 1 circle (the ZY grid shows it).', done: all(kinds('ls'), on(1, 'g', 1, 0.02)),
        hint: 'the r = 0.5 circle meets g = 1 at x = ±0.5; the L takes the upper one.', topic: 'matching-with-two-parts',
        reach: `${P}25:0&p=ls:39.78873577297384e-9` },
      { do: 'Add a shunt C at the source end and bring the input to the centre.', done: all(kinds('ls,cp'), centre(0.02)),
        hint: 'node 1 has y = 1 − j1, so the C adds b = +1.', topic: 'matching-with-two-parts', reach: E6A },
      { do: 'Now the other solution: a series C, then a shunt L.', done: all(kinds('cs,lp'), centre(0.02)),
        hint: 'go down to x = −0.5 instead; y is then 1 + j1.', topic: 'two-one-or-none', reach: E6B },
    ],
    solutions: [E6A, E6B],
    stated: [
      fig(0, 1, 'x', '0.5'), fig(1, 1, 'x', '-0.5'),
      val$(0, 1, '39.79 nH'), fig(0, 1, 'g', '1'), fig(0, 1, 'b', '-1'), val$(0, 2, '31.83 pF'),
      val$(1, 1, '63.66 pF'), fig(1, 1, 'g', '1'), fig(1, 1, 'b', '1'), val$(1, 2, '79.58 nH'),
      fig(0, 1, 'Q', '1'), fig(1, 1, 'Q', '1'),
    ],
    claims: [202, 203, 204],
  },
  {
    id: 'l-match-down',
    title: 'L-match from 100 Ω down to 50 Ω, both solutions',
    intro: 'A load above Z0 takes the shunt part first, onto the r = 1 circle, then a series part along r = 1.',
    link: `${P}100:0&p=`,
    steps: [
      { do: 'Add a shunt C and drag it until node 1 is on the r = 1 circle.', done: all(kinds('cp'), on(1, 'r', 1, 0.02)),
        hint: 'the load’s y = 0.5; the g = 0.5 circle meets r = 1 at b = ±0.5.', topic: 'matching-with-two-parts',
        reach: `${P}100:0&p=cp:15.915494309189536e-12` },
      { do: 'Add a series L at the source end and bring the input to the centre.', done: all(kinds('cp,ls'), centre(0.02)),
        hint: 'node 1 has z = 1 − j1, so the L adds x = +1.', topic: 'matching-with-two-parts', reach: E7A },
      { do: 'The other solution: a shunt L, then a series C.', done: all(kinds('lp,cs'), centre(0.02)),
        hint: 'take b = −0.5; z is then 1 + j1.', topic: 'two-one-or-none', reach: E7B },
    ],
    solutions: [E7A, E7B],
    stated: [
      fig(-1, 0, 'g', '0.5'), val$(0, 1, '15.92 pF'), fig(0, 1, 'r', '1'), fig(0, 1, 'x', '-1'), val$(0, 2, '79.58 nH'),
      val$(1, 1, '159.2 nH'), fig(1, 1, 'r', '1'), fig(1, 1, 'x', '1'), val$(1, 2, '31.83 pF'),
      fig(0, 1, 'Q', '1'), fig(1, 1, 'Q', '1'),
    ],
    claims: [205],
  },
  {
    id: 'l-match-none',
    title: 'When an L-match has no answer',
    intro: 'The same two parts as E7’s answer, in the other order. The solver is asked for both values; read its answer, then fix the order.',
    link: `${P}100:0&p=ls:79.57747154594767e-9,cp:15.915494309189536e-12&u=1lc,2lc`,
    steps: [
      { do: 'Read the Solve panel’s message and the two circles on the chart.', done: all({ k: 'next' }),
        hint: 'the series part moves the 100 Ω point along r = 2, a circle right of Γr = 1/3; g = 1 lies left of 0.', topic: 'two-one-or-none' },
      { do: 'Move the series L to the source end (its card’s ←, or Alt + ← on its tile).', done: all(kinds('cp,ls')),
        hint: 'each part acts on what lies on its load side, so order matters.', topic: 'moving-on-the-chart',
        reach: `${E7A}&u=2lc,1lc` },
      { do: 'Apply one of the solver’s solutions.', done: [[kinds('cp,ls'), centre(0.02)], [kinds('lp,cs'), centre(0.02)]],
        hint: 'the marks moved with the parts; E7 has the numbers.', topic: 'two-one-or-none', reach: E7B },
    ],
    solutions: [E7A, E7B],
    stated: [fig(-1, 1, 'r', '2')],
    claims: [206, 207],
  },
  {
    id: 'line-turns',
    title: 'A line turns the load',
    intro: 'A line of Z0 does not change how well the load is matched; it turns the point round the centre. Watch Z change while |Γ| stays.',
    link: `${P}25:25&p=`,
    steps: [
      { do: 'Add a line; it comes as λ/8 of Zc = Z0.', done: all(kinds('tl'), near(1, 2, 1, 0.01)),
        hint: 'λ/8 turns Γ by 2βℓ = 90° clockwise.', topic: 'transmission-lines', reach: `${P}25:25&p=tl:0.125:50` },
      { do: 'Read |Γ| at node 1.', done: all(ans('mag', 1, 0.447, 0.005)),
        hint: 'a line of Z0 keeps the point on its circle round the centre.', topic: 'transmission-lines' },
      { do: 'Lengthen the line until node 1 is on the axis right of the centre.', done: all(kinds('tl'), near(1, 2.618, 0, 0.01)),
        hint: 'the load is at 116.6°, so Γ must turn 116.6° clockwise: ℓ = 116.6°/720° λ.', topic: 'transmission-lines', reach: E9A },
      { do: 'Read the input’s R in ohms.', done: all(ans('R', 'in', 130.9, 1)), hint: 'on the right half of the axis r = VSWR.',
        topic: 'how-good-is-a-match' },
      { do: 'Lengthen it on to the axis left of the centre.', done: all(kinds('tl'), near(1, 0.382, 0, 0.01)),
        hint: 'λ/4 more turns half a circle.', topic: 'transmission-lines', reach: E9B },
    ],
    solutions: [E9A, E9B],
    stated: [
      fig(`${P}25:25&p=tl:0.125:50`, 1, 'gr', '0.4'), fig(`${P}25:25&p=tl:0.125:50`, 1, 'gi', '0.2'),
      fig(`${P}25:25&p=tl:0.125:50`, 1, 'angle', '26.6'), fig(`${P}25:25&p=tl:0.125:50`, 1, 'r', '2'),
      fig(`${P}25:25&p=tl:0.125:50`, 1, 'x', '1'), fig(`${P}25:25&p=tl:0.125:50`, 1, 'mag', '0.447'),
      val$(0, 1, '0.1619'), val$(1, 1, '0.4119'), fig(0, 1, 'vswr', '2.618'), fig(0, 1, 'r', '2.618'),
      fig(0, 1, 'R', '130.9'), fig(1, 1, 'R', '19.10'), fig(1, 1, 'r', '0.382'),
    ],
    claims: [208, 209, 210],
  },
  {
    id: 'quarter-wave',
    title: 'A λ/4 transformer for 100 Ω',
    intro: 'A quarter-wave line of another impedance Zt matches a real load at f0. Find Zt.',
    link: `${P}100:0&p=`,
    steps: [
      { do: 'Add a λ/4 transformer; it comes with Zt = Z0.', done: all(kinds('qw'), near(1, 0.5, 0, 0.01)),
        hint: 'a λ/4 of Z0 inverts: z_in = 1/z_L.', topic: 'transmission-lines', reach: `${P}100:0&p=qw:50` },
      { do: 'Set Zt so the input is at the centre.', done: all(kinds('qw'), centre(0.01)),
        hint: 'Z_in = Zt²/Z_L must be 50 Ω.', topic: 'transmission-lines', reach: `${P}100:0&p=qw:70.71067811865476` },
    ],
    solutions: [`${P}100:0&p=qw:70.71067811865476`],
    stated: [fig(`${P}100:0&p=qw:50`, 1, 'R', '25'), fig(`${P}100:0&p=qw:50`, 1, 'r', '0.5'), val$(0, 1, '70.71 Ω')],
    claims: [211, 212],
  },
  {
    id: 'line-and-quarter-wave',
    title: 'A complex load: a line, then λ/4',
    intro: 'A λ/4 transformer needs a real load. A line first turns this load to the axis, where it is real (E9).',
    link: `${P}25:25&p=`,
    steps: [
      { do: 'Add a line and lengthen it until node 1 is on the axis.', done: all(kinds('tl'), on(1, 'x', 0, 0.01)),
        hint: 'E9: 0.1619 λ to the right half, 0.4119 λ to the left.', topic: 'transmission-lines', reach: E9A },
      { do: 'Add a λ/4 at the source end and set Zt to match.', done: all(kinds('tl,qw'), centre(0.02)),
        hint: 'Zt = √(Z0·R) with R the line’s real input.', topic: 'transmission-lines', reach: `${E9A},qw:80.90169943749474` },
      { do: 'Now the other solution: the line to the other crossing, and Zt again.', done: all(kinds('tl,qw'), centre(0.02), away(2, 1, 0.1)),
        hint: 'a quarter wavelength more or less.', topic: 'two-one-or-none', reach: `${E9B},qw:30.90169943749474` },
    ],
    solutions: [`${E9A},qw:80.90169943749474`, `${E9B},qw:30.90169943749474`],
    stated: [fig(0, 1, 'R', '130.9'), val$(0, 2, '80.90 Ω'), fig(1, 1, 'R', '19.10'), val$(1, 2, '30.90 Ω')],
    claims: [213],
  },
  {
    id: 'open-stub',
    title: 'Single open stub, both solutions',
    intro: 'A line turns the load onto the g = 1 circle; a shunt stub there cancels b. Two places on the circle work.',
    link: `${P}100:0&p=`,
    steps: [
      { do: 'Add a line and lengthen it until node 1 is on g = 1.', done: all(kinds('tl'), on(1, 'g', 1, 0.02)),
        hint: 'the point turns on its |Γ| = 1/3 circle and meets g = 1 where Γr = −|Γ|² = −1/9.', topic: 'transmission-lines',
        reach: `${P}100:0&p=tl:0.1520433619923482:50` },
      { do: 'Add an open stub at the source end and set its length to match.', done: all(kinds('tl,so'), centre(0.02)),
        hint: 'node 1 has y = 1 ± j0.707: the stub adds the opposite b.', topic: 'transmission-lines',
        reach: `${P}100:0&p=tl:0.1520433619923482:50,so:0.4020433619923482:50` },
      { do: 'The other solution.', done: all(kinds('tl,so'), centre(0.02), away(2, 1, 0.1)),
        hint: 'the other crossing of g = 1.', topic: 'two-one-or-none',
        reach: `${P}100:0&p=tl:0.3479566380076518:50,so:0.09795663800765182:50` },
    ],
    solutions: [
      `${P}100:0&p=tl:0.1520433619923482:50,so:0.4020433619923482:50`,
      `${P}100:0&p=tl:0.3479566380076518:50,so:0.09795663800765182:50`,
    ],
    stated: [
      fig(-1, 0, 'mag', '0.3333'), fig(0, 1, 'gr', '-0.1111'), fig(0, 1, 'g', '1'), fig(0, 1, 'b', '0.707'),
      fig(1, 1, 'b', '-0.707'), val$(0, 1, '0.1520'), val$(1, 1, '0.3480'), val$(0, 2, '0.4020'), val$(1, 2, '0.0980'),
    ],
    claims: [214, 215],
  },
  {
    id: 'short-stub',
    title: 'Single short stub, both solutions',
    intro: 'The same construction with a shorted stub and a load that is not real.',
    link: `${P}60:-80&p=`,
    steps: [
      { do: 'Add a line and lengthen it until node 1 is on g = 1.', done: all(kinds('tl'), on(1, 'g', 1, 0.02)),
        hint: 'the load is at |Γ| = 0.593, −46.8°; turn clockwise.', topic: 'transmission-lines',
        reach: `${P}60:-80&p=tl:0.11042321863830028:50` },
      { do: 'Add a short stub at the source end and set its length to match.', done: all(kinds('tl,ss'), centre(0.02)),
        hint: 'a short stub adds b = −cot θ; shorter than λ/4 it acts as an L.', topic: 'transmission-lines',
        reach: `${P}60:-80&p=tl:0.11042321863830028:50,ss:0.09497462163589147:50` },
      { do: 'The other solution.', done: all(kinds('tl,ss'), centre(0.02), away(2, 1, 0.1)),
        hint: 'the other crossing of g = 1.', topic: 'two-one-or-none',
        reach: `${P}60:-80&p=tl:0.25944453062282585:50,ss:0.4050253783641085:50` },
    ],
    solutions: [
      `${P}60:-80&p=tl:0.11042321863830028:50,ss:0.09497462163589147:50`,
      `${P}60:-80&p=tl:0.25944453062282585:50,ss:0.4050253783641085:50`,
    ],
    stated: [
      fig(-1, 0, 'mag', '0.593'), fig(-1, 0, 'angle', '-46.8'), fig(0, 1, 'b', '1.472'), fig(1, 1, 'b', '-1.472'),
      val$(0, 1, '0.1104'), val$(0, 2, '0.0950'), val$(1, 1, '0.2594'), val$(1, 2, '0.4050'),
    ],
    claims: [216, 217],
  },
  {
    id: 'three-part-ladder',
    title: 'A three-part ladder from 10 Ω',
    intro: 'Three parts, shunt C, series L, shunt C (a pi), walked node by node. The first C is a free choice; the other two then follow as in an L-match.',
    link: `${P}10:0&p=`,
    steps: [
      { do: 'Add a shunt C of 159.2 pF.', done: all(kinds('cp'), near(1, 0.1, -0.1, 0.01)),
        hint: 'the load’s y = 5; b = ωC·Z0 = 5 gives y = 5 + j5.', topic: 'moving-on-the-chart', reach: `${P}10:0&p=cp:159.15494309189535e-12` },
      { do: 'Add a series L at the source end and drag it until node 2 is on g = 1.', done: all(kinds('cp,ls'), on(2, 'g', 1, 0.02)),
        hint: 'the r = 0.1 circle meets g = 1 at x = ±0.3; the L goes from −0.1 up to +0.3.', topic: 'matching-with-two-parts',
        reach: `${P}10:0&p=cp:159.15494309189535e-12,ls:31.83098861837907e-9` },
      { do: 'Add a shunt C at the source end and match.', done: all(kinds('cp,ls,cp'), centre(0.02)), hint: 'node 2 has y = 1 − j3.',
        topic: 'matching-with-two-parts', reach: `${P}10:0&p=cp:159.15494309189535e-12,ls:31.83098861837907e-9,cp:95.49296585513721e-12` },
      { do: 'Read the Q of node 2 in the node table.', done: all(ans('Q', 2, 3, 0.05)), hint: 'Q = |x|/r at the node.',
        topic: 'matching-with-two-parts' },
    ],
    solutions: [`${P}10:0&p=cp:159.15494309189535e-12,ls:31.83098861837907e-9,cp:95.49296585513721e-12`],
    stated: [
      fig(0, 1, 'r', '0.1'), fig(0, 1, 'x', '-0.1'), fig(0, 2, 'r', '0.1'), fig(0, 2, 'x', '0.3'), fig(0, 2, 'g', '1'),
      fig(0, 2, 'b', '-3'), val$(0, 1, '159.2 pF'), val$(0, 2, '31.83 nH'), val$(0, 3, '95.49 pF'), fig(0, 1, 'Q', '1'),
      fig(0, 2, 'Q', '3'),
    ],
    claims: [218, 219],
  },
  {
    id: 'e24-values',
    title: 'Matching with E24 values: what rounding costs',
    intro: 'Exact values are not on the shelf. Round E6’s match to E24 parts and see what it costs.',
    link: E6A,
    steps: [
      { do: 'Set the L to 39 nH, the nearest E24 value.', done: all(kinds('ls,cp'), val(1, 'L', 39e-9, 0.001)),
        hint: 'type it, or drag with Snap on: Snap uses each kind’s list, E24 by default.', topic: 'realisable-values',
        reach: `${P}25:0&p=ls:39e-9,cp:31.83098861837907e-12` },
      { do: 'Set the C to 33 pF.', done: all(val(1, 'L', 39e-9, 0.001), val(2, 'C', 33e-12, 0.001)),
        hint: '31.83 pF lies between 30 and 33 pF.', topic: 'realisable-values', reach: `${P}25:0&p=ls:39e-9,cp:33e-12` },
      { do: 'Read |Γ| at the input.', done: all(ans('mag', 'in', 0.0208, 0.001)), hint: 'the Solve panel’s variants list the same pairs.',
        topic: 'how-good-is-a-match' },
      { do: 'Try the far pair, 43 nH and 30 pF, and read |Γ|.', done: all(val(1, 'L', 43e-9, 0.001), val(2, 'C', 30e-12, 0.001), ans('mag', 'in', 0.0492, 0.001)),
        hint: 'both values now err the other way.', topic: 'realisable-values', reach: `${P}25:0&p=ls:43e-9,cp:30e-12` },
    ],
    solutions: [`${P}25:0&p=ls:39e-9,cp:33e-12`, `${P}25:0&p=ls:43e-9,cp:30e-12`],
    stated: [
      fig(0, 'in', 'mag', '0.0208'), fig(0, 'in', 'rl', '33.6'),
      fig(`${P}25:0&p=ls:39e-9,cp:30e-12`, 'in', 'mag', '0.0300'), fig(`${P}25:0&p=ls:39e-9,cp:30e-12`, 'in', 'rl', '30.4'),
      fig(`${P}25:0&p=ls:43e-9,cp:33e-12`, 'in', 'mag', '0.0453'), fig(`${P}25:0&p=ls:43e-9,cp:33e-12`, 'in', 'rl', '26.9'),
      fig(1, 'in', 'mag', '0.0492'), fig(1, 'in', 'rl', '26.2'),
    ],
    claims: [220, 221, 222],
  },
  {
    id: 'sub-ghz-load',
    title: 'A sub-GHz load: 20 − j35 Ω at 868 MHz',
    intro: 'A made-up load, low in resistance and capacitive, at a sub-GHz frequency (an example, not a measured antenna). Match it with two parts the solver finds, then round to E24.',
    link: 'v=1&z0=50&f0=868e6&zl=20:-35&p=',
    steps: [
      { do: 'Read |Γ| of the load.', done: all(ans('mag', 0, 0.589, 0.005)), hint: 'z = 0.4 − j0.7.', topic: 'how-good-is-a-match' },
      { do: 'Add a series L and then a shunt C at the source end, mark both “Solve for” and apply the solution with these kinds.',
        done: all(kinds('ls,cp'), centre(0.02)),
        hint: 'the r = 0.4 circle meets g = 1 at x = ±0.49; from −0.7 the L adds 0.7 + 0.49 = 1.19.', topic: 'two-one-or-none',
        reach: 'v=1&z0=50&f0=868e6&zl=20:-35&p=ls:10.90887904883032e-9,cp:4.491341020931314e-12' },
      { do: 'Round to E24: 11 nH and 4.3 pF.', done: all(val(1, 'L', 11e-9, 0.001), val(2, 'C', 4.3e-12, 0.001)),
        hint: 'the variants under the solution.', topic: 'realisable-values', reach: 'v=1&z0=50&f0=868e6&zl=20:-35&p=ls:11e-9,cp:4.3e-12' },
      { do: 'Read |Γ| at the input.', done: all(ans('mag', 'in', 0.0267, 0.001)), hint: 'then try 10 nH, the other neighbour.',
        topic: 'realisable-values' },
    ],
    solutions: [
      'v=1&z0=50&f0=868e6&zl=20:-35&p=ls:10.90887904883032e-9,cp:4.491341020931314e-12',
      'v=1&z0=50&f0=868e6&zl=20:-35&p=ls:11e-9,cp:4.3e-12',
    ],
    stated: [
      fig(-1, 0, 'mag', '0.589'), fig(-1, 0, 'vswr', '3.87'), fig(-1, 0, 'rl', '4.60'), fig(-1, 0, 'ml', '1.85'),
      fig(-1, 0, 'g', '0.615'), fig(-1, 0, 'b', '1.077'), val$(0, 1, '10.91 nH'), val$(0, 2, '4.491 pF'),
      fig(1, 'in', 'mag', '0.0267'), fig(1, 'in', 'rl', '31.5'),
      fig('v=1&z0=50&f0=868e6&zl=20:-35&p=ls:11e-9,cp:4.7e-12', 'in', 'mag', '0.0337'),
      fig('v=1&z0=50&f0=868e6&zl=20:-35&p=ls:11e-9,cp:4.7e-12', 'in', 'rl', '29.5'),
      fig('v=1&z0=50&f0=868e6&zl=20:-35&p=ls:10e-9,cp:4.3e-12', 'in', 'mag', '0.127'),
      fig('v=1&z0=50&f0=868e6&zl=20:-35&p=ls:10e-9,cp:4.3e-12', 'in', 'rl', '17.9'),
      fig('v=1&z0=50&f0=868e6&zl=20:-35&p=ls:10e-9,cp:4.7e-12', 'in', 'mag', '0.123'),
      fig('v=1&z0=50&f0=868e6&zl=20:-35&p=ls:10e-9,cp:4.7e-12', 'in', 'rl', '18.2'),
    ],
    claims: [223, 224, 225],
  },
];

const BY_ID = new Map(EXAMPLES.map((e) => [e.id, e]));
/** The example of an id. */
export const exampleById = (id: string): Example | undefined => BY_ID.get(id);

// ---------------------------------------------------------------------------------------------------------------
// The guide's test

export interface GuideContext {
  /** The grid the chart shows. */
  grid: 'Z' | 'Y' | 'ZY';
  /** The number typed into the guide's answer field, null when none. */
  answer: number | null;
  /** Per step (0-based), the Γ of every node (nodeGammas) when it was done; null when it was not. */
  doneAt: readonly (Float64Array | null)[];
}

let nodes = new Float64Array(32 * NODE_STRIDE);
const metrics = new Float64Array(METRIC_STRIDE);
const g2 = new Float64Array(2);

/** Evaluates the circuit at f0 into the shared node buffer; the node count. */
function evaluateNodes(c: Circuit): number {
  const n = c.parts.length;
  if ((n + 1) * NODE_STRIDE > nodes.length) nodes = new Float64Array((n + 1) * 2 * NODE_STRIDE);
  evaluate(nodes, packParts(c.parts), n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
  return n;
}

/** Γ of every node (2 numbers per node, the load first) at f0: what the page keeps in GuideContext.doneAt. */
export function nodeGammas(c: Circuit): Float64Array {
  const n = evaluateNodes(c);
  const out = new Float64Array(2 * (n + 1));
  for (let k = 0; k <= n; k++) nodeGamma(out, 2 * k, nodes, k * NODE_STRIDE);
  return out;
}

const DEG = 180 / Math.PI;

/** The engine's value of a quantity from the metrics of a node (z0 for R in ohms). */
export function quantityOf(q: Quantity, m: ArrayLike<number>, o: number, z0: number): number {
  switch (q) {
    case 'mag': return m[o + M_MAG];
    case 'angle': return m[o + M_ANGLE] * DEG;
    case 'vswr': return m[o + M_VSWR];
    case 'rl': return m[o + M_RL];
    case 'r': return m[o + M_ZR];
    case 'x': return m[o + M_ZI];
    case 'g': return m[o + M_YR];
    case 'b': return m[o + M_YI];
    case 'R': return m[o + M_ZR] * z0;
    case 'Q': return m[o + M_Q];
  }
}

/** Whether the typed answer matches `value` within tol (angles on the circle). */
function answerNear(q: Quantity, a: number, value: number, tol: number): boolean {
  let d = a - value;
  if (q === 'angle') d -= 360 * Math.round(d / 360);
  return Math.abs(d) <= tol;
}

/** Γ of z = r + jx into g2. */
function gammaOf(r: number, x: number): void {
  if (r === Infinity) { g2[0] = 1; g2[1] = 0; return; }
  const dr = r + 1, den = dr * dr + x * x;
  g2[0] = ((r - 1) * dr + x * x) / den;
  g2[1] = (x * dr - (r - 1) * x) / den;
}

const LC_OF: Readonly<Record<'L' | 'C', string>> = { L: 'L', C: 'C' };

function checkHolds(ch: Check, c: Circuit, n: number, ctx: GuideContext): boolean {
  const at = (node: NodeRef): number => (node === 'in' ? n : node);
  switch (ch.k) {
    case 'next': return true;
    case 'grid': return ch.modes.includes(ctx.grid as 'Y' | 'ZY');
    case 'kinds': {
      const codes = ch.codes ? ch.codes.split(',') : [];
      if (codes.length !== n) return false;
      for (let i = 0; i < n; i++) if (KIND_CODES[c.parts[i].kind] !== codes[i]) return false;
      return true;
    }
    case 'load': {
      const scale = 1e-9 * Math.max(Math.abs(ch.R), Math.abs(ch.X), 1e-300);
      return Math.abs(c.loadR - ch.R) <= scale && Math.abs(c.loadX - ch.X) <= scale;
    }
    case 'value': {
      const p = c.parts[ch.part - 1];
      if (!p || valueKindOf(p.kind) !== LC_OF[ch.of]) return false;
      return Math.abs(p.value / ch.value - 1) <= ch.rel;
    }
    case 'near': {
      const k = at(ch.node);
      if (k > n) return false;
      nodeGamma(metrics, 0, nodes, k * NODE_STRIDE);
      gammaOf(ch.r, ch.x);
      return Math.hypot(metrics[0] - g2[0], metrics[1] - g2[1]) <= ch.tol;
    }
    case 'circle': {
      const k = at(ch.node);
      if (k > n) return false;
      nodeGamma(metrics, 0, nodes, k * NODE_STRIDE);
      return goalResidual({ kind: ch.kind, value: ch.value }, metrics[0], metrics[1], c.z0) <= ch.tol;
    }
    case 'answer': {
      const a = ctx.answer, k = at(ch.node);
      if (a === null || !Number.isFinite(a) || k > n || !answerNear(ch.quantity, a, ch.value, ch.tol)) return false;
      nodeMetrics(metrics, 0, nodes, k);
      return answerNear(ch.quantity, a, quantityOf(ch.quantity, metrics, 0, c.z0), ch.tol);
    }
    case 'away': {
      const was = ctx.doneAt[ch.step - 1], k = at(ch.node);
      if (!was || k > n || 2 * k + 1 >= was.length) return false;
      nodeGamma(metrics, 0, nodes, k * NODE_STRIDE);
      return Math.hypot(metrics[0] - was[2 * k], metrics[1] - was[2 * k + 1]) >= ch.by;
    }
  }
}

/** Whether the visitor's circuit (at f0), with the page's grid, typed answer and done-time Γs, is at the step's done state. */
export function stepDone(step: Step, circuit: Circuit, ctx: GuideContext): boolean {
  const n = evaluateNodes(circuit);
  for (const group of step.done) {
    let holds = true;
    for (const ch of group) if (!checkHolds(ch, circuit, n, ctx)) { holds = false; break; }
    if (holds) return true;
  }
  return false;
}

/**
 * The figure the guide shows for a step (M6.3a), from the engine at f0: `q` at the node (for 'z', `value` + j`im`), and
 * what the step wants there (`target`, `tim`; for the centre `target` is the largest |Γ| that counts). A typed answer's
 * quantity once the step is done (never before: it would give the answer away), else the first near or circle check.
 */
export interface Figure {
  q: Quantity | 'z';
  node: NodeRef;
  value: number;
  im: number;
  target: number;
  tim: number;
  /** What the figure is for: a typed answer's quantity, a circle's r, g or x, a point's z, or |Γ| for the centre (done when value ≤ target). */
  of: 'answer' | 'circle' | 'near' | 'centre';
}

/** The step's figure for the visitor's circuit now (`done`: whether the step is done), or null when it has none. */
export function guideFigure(step: Step, circuit: Circuit, done: boolean): Figure | null {
  let pick: Check | null = null;
  for (const group of step.done) {
    for (const ch of group) {
      if (ch.k === 'answer' ? done : ch.k === 'near' || ch.k === 'circle') { pick = ch; break; }
    }
    if (pick) break;
  }
  if (!pick) return null;
  const n = evaluateNodes(circuit);
  const k = pick.k === 'answer' || pick.k === 'near' || pick.k === 'circle' ? (pick.node === 'in' ? n : pick.node) : 0;
  if (k > n) return null;
  nodeMetrics(metrics, 0, nodes, k);
  switch (pick.k) {
    case 'answer':
      return { q: pick.quantity, node: pick.node, value: quantityOf(pick.quantity, metrics, 0, circuit.z0), im: 0, target: pick.value, tim: 0, of: 'answer' };
    case 'circle':
      return { q: pick.kind, node: pick.node, value: quantityOf(pick.kind, metrics, 0, circuit.z0), im: 0, target: pick.value, tim: 0, of: 'circle' };
    case 'near':
      if (pick.r === 1 && pick.x === 0) {
        return { q: 'mag', node: pick.node, value: metrics[M_MAG], im: 0, target: pick.tol, tim: 0, of: 'centre' };
      }
      return { q: 'z', node: pick.node, value: metrics[M_ZR], im: metrics[M_ZI], target: pick.r, tim: pick.x, of: 'near' };
    default:
      return null;
  }
}

/** The step's answer check, if it asks for a typed number (the page shows the answer field). */
export function answerCheck(step: Step): Extract<Check, { k: 'answer' }> | null {
  for (const group of step.done) for (const ch of group) if (ch.k === 'answer') return ch;
  return null;
}
