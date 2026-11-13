# Smith chart – notes of step M6.1 (teaching content)

Part of [plan.md](plan.md). No code: the content M6.2 (engine) and M6.3a/b (page) build from, as M3.5a and M4.3c.
Written: [examples.md](examples.md) (16 worked examples, 28 kB), [examples-challenges.md](examples-challenges.md)
(challenge kinds, lesson links, 15 short lines), claims 191–229 in [claims.md](claims.md).

## Checks (scratch scripts, not in the repo)

Run with `npx tsx` from `scripts/harness/smith` against `lib/smith/` as it is at 565ef59.

- **Examples** (`examples-check.mjs`): 277 checks, 0 failures. Every start link decodes with no issue, `linked`, to
  the stated circuit (`sameNetwork`, to the bit) and round-trips through `encodeCircuit`; all 37 link strings of
  examples.md decode with no issue (parsed from the file). Every stated number was compared, at the digits it is
  written with (half a unit of its last decimal), against an independent hand formula (plain complex arithmetic:
  Γ = (Z − Z0)/(Z + Z0), the line's Z_in with tan βℓ, the stubs' tan and cot, the L-match's x = ±√(r − r²), the
  |Γ| circle's crossing of g = 1 at Γr = −|Γ|²) and against the engine (`evaluateCircuit` metrics, `solve`'s values,
  `standardVariants`' |Γ|, `formValue`). Every solution link reaches |Γ_in| < 1e-9 (the E15/E16 rounded ones give the
  stated 0.0208, 0.0492, 0.0267). E8: `solve` gives `none` with the reason quoted, and after `movePart` two solutions
  (the ask moves with the parts: `u=2lc,1lc`). `newPart` gives the stated defaults (line λ/8 of Z0, λ/4 of Zt = Z0).
- **Challenges** (`challenge-sample.mjs`): 1,000 seeds per kind through the generator of examples-challenges.md §1
  (mulberry32), every problem tested with `solve` (and `standardVariants` for `e24`): all solvable, draws per problem
  1.04–1.22 (at most 4), the same seed gave the same circuit, worst residual < 1e-14, at most 0.05 ms per problem.
- **Lesson link** (`lesson-check.mjs`): the example's `lk`, `hd`, `tx` read back with `URLSearchParams` (41 code
  points of text, `Γ` and `≤` included); today `decodeCircuit` reports the three as unknown parameters, as expected.

## For M6.2 (engine, harness only)

### `lib/smith/examples.ts`: the examples as data

```ts
export type TopicId = 'how-to-use' | 'gamma-z-y' | 'reading-the-chart' | 'moving-on-the-chart' | 'transmission-lines'
  | 'how-good-is-a-match' | 'matching-with-two-parts' | 'two-one-or-none' | 'one-value-and-a-point' | 'realisable-values';
export type NodeRef = number | 'in';                 // 0 the load, k after the k-th part, 'in' the input
export type Quantity = 'mag' | 'angle' | 'vswr' | 'rl' | 'r' | 'x' | 'g' | 'b' | 'R' | 'Q';
export type Check =
  | { k: 'kinds'; codes: string }                                   // 'ls,cp', exactly, from the load
  | { k: 'near'; node: NodeRef; r: number; x: number; tol: number } // |Γ_node − Γ(r + jx)| ≤ tol ('in', 1, 0 = centre)
  | { k: 'circle'; node: NodeRef; kind: 'r' | 'g' | 'x'; value: number; tol: number } // goalResidual ≤ tol
  | { k: 'value'; part: number; value: number; rel: number }        // part 1-based; |v/value − 1| ≤ rel
  | { k: 'answer'; quantity: Quantity; node: NodeRef; value: number; tol: number } // typed, absolute tol
  | { k: 'grid'; modes: readonly ('Y' | 'ZY')[] }
  | { k: 'load'; R: number; X: number }
  | { k: 'away'; step: number; node: NodeRef; by: number }          // ≥ by from node's Γ when step was done
  | { k: 'next' };
export interface Step { do: string; done: readonly (readonly Check[])[]; hint: string; topic: TopicId }  // OR of ANDs
export interface Example { id: string; title: string; intro: string; link: string; steps: readonly Step[];
  solutions: readonly string[]; claims: readonly number[] }
export const EXAMPLES: readonly Example[];
export interface GuideContext { grid: 'Z' | 'Y' | 'ZY'; answer: number | null; doneAt: (Float64Array | null)[] } // Γ of every node when each step was done
export function stepDone(step: Step, circuit: Circuit, ctx: GuideContext): boolean;
export function exampleById(id: string): Example | undefined;
```

- Transcribe examples.md exactly (texts as written; `⟨n⟩` markers out; claims per example into `claims`). Tolerances
  are the ones in each `Done`; `in ≈ centre (±t)` is `near` at 'in' with r = 1, x = 0.
- An **answer** must hold twice: the typed number within `tol` of the stated value **and** of the engine's value of
  that quantity at that node of the visitor's circuit now, so the guide never accepts a number the screen contradicts
  (E9 step 2 after a changed line). Angles in degrees, R in ohms, RL in dB; Q is `M_Q`.
- `stepDone` is pure: grid, the typed answer and the Γ at done-time come from the page in `ctx`.
- **Harness** (`check-examples.mjs` in `npm run check`): every link decodes with no issue to its circuit; each
  example's `solutions` make its last step's state hold (and every earlier step's that the solution still meets);
  every stated number is reproduced (port the scratch script's 277 checks: hand formula and engine at the stated
  digits); every topic id exists in the theory; texts fit the short-line rules (no HTML, no `⟨`).
- A link with no `p` keeps D16's parts (decodeCircuit), so every example link carries `p=`; keep that in the data
  check.

### `lib/smith/challenge.ts`

```ts
export type ChallengeKind = 'two' | 'stub' | 'qw' | 'e24' | 'read';
export interface Challenge { kind: ChallengeKind; seed: number; circuit: Circuit; allowed: readonly PartKind[];
  maxParts: number; zcIsZ0: boolean; e24: boolean; goal: Goal;
  read?: { ask: 'z' | 'y' | 'mag' | 'vswr' | 'rl'; r: number; x: number } }
export function makeChallenge(kind: ChallengeKind, seed: number): Challenge;       // examples-challenges.md §1, in order
export function challengeText(kind, seed): string;  readChallenge(text): { kind, seed } | string (why not)
export function reached(ch: Challenge, circuit: Circuit, answer?: number[]): { reached: boolean; why: string };
export interface Hint { text: string; circleNode: number; circles: Float64Array | null; solutions?: Solution[] }
export function hintLadder(ch: Challenge, circuit: Circuit): Hint[];                // 4 steps, §1 "Hint ladder"
```

- Generator: mulberry32 (a few lines, public domain) seeded with the uint32; draws exactly in the order of the §1
  table; redraws from the same stream; bounds L 0.1 nH – 10 µH, C 0.1 pF – 10 nF, Zt 15–150 Ω. Reference: the scratch
  script `challenge-sample.mjs` (described above; copy its logic, not the file).
- `reached` uses `suggest.ts goalHolds` with the goal at the input, plus the kinds, the count, Zc = Z0 within 1e-9
  relative (`stub`, `qw`), and `values.ts around(v, { id: 'E24' }).exact` for every L and C (`e24`). Explain the first
  failing rule in `why` (shown under Check).
- Hints: template = the visitor's two parts if they are allowed kinds, else the first realisable solution's order;
  circles from `solve` of that template (`circles`, `circleNode`); hint 2's sense by the theory's rule (series L
  clockwise up its r circle, etc.: `explain.ts` already has these sentences); hint 3 to two significant digits with
  `lib/quantity.ts`; hint 4 the solutions (for `e24` with `standardVariants`).
- Harness (`check-challenge.mjs`): 1,000 seeds per kind solvable and within ranges, the same seed the same problem
  (JSON), the start state never reached, every revealed solution reached (`e24`: the meeting variant), hints finite.

### `lib/smith/lesson.ts` and `state.ts`

```ts
export type Lock = 'z0' | 'f0' | 'zl' | 'parts' | { kind: number } | { value: number };   // part 0-based in code
export type Panel = 'solve' | 'suggest' | 'reveal';
export interface Lesson { locks: Lock[]; hidden: Panel[]; text: string }
export function readLesson(lk: string | null, hd: string | null, tx: string | null, parts: number, issues: string[]): Lesson | null;
export function lessonParams(lesson: Lesson): string;   // "&lk=…&hd=…&tx=…", '' for none
export function keepLocks(lesson: Lesson, base: Circuit, next: Circuit): Circuit;   // next with base's locked values
export const TEXT_MAX = 500;
```

- Add `ch`, `lk`, `hd`, `tx` to `PARAMS` in state.ts; `Decoded` gains `lesson: Lesson | null` and `challenge:
  { kind, seed } | null` (`linked` still means circuit parameters only). `encodeCircuit` stays the circuit's; the page
  appends `lessonParams` and `ch` (as it appends `vl`). `v` stays 1.
- `keepLocks` is what `commit` calls: it restores each locked parameter from the lesson's circuit, so no path (undo,
  Apply, drags, keys, Start over) can change one. A `k<n>`/`parts` lock with a different part count keeps base's parts.
- Text: cut at 500 code points with an issue; plain text only (the page sets `textContent`).
- Harness: round trips of every lock and panel and of random texts (any characters, emoji, `&`, `%`, newlines, 500
  and 501 code points); broken params with issues; `keepLocks` against random edits.

## For M6.3a and M6.3b (page)

- **Learn** section in the nav (after the chart's panels, before Theory): the index of examples.md in its order with
  titles; one click (or Enter) loads the link as one undo step and opens the **guide panel**: the intro, the current
  step's Do, a tick when `stepDone` holds (then Next; the next step), the answer field for `answer` checks (Enter
  checks), the one Hint, "→ theory" to the step's topic, Back, Close. Keyboard: Tab order intro → answer → Hint → Next;
  touch: 44 px targets; 320 and 390 px. The guide keeps `doneAt` per step for `away`.
- **Challenges** in the Learn section: the five kinds (titles in §1), New, Check (with `why`), Hint (the ladder, its
  circles through solveLayer's drawing), Reveal, progress from `localStorage` `smith.challenges` (per kind: solved,
  revealed, hints, fewest parts). While one runs: Solve panel, suggestions and "Solve for" hidden; for `read` also the
  readout, node table, equation panel and cursor readout. A challenge link (`ch=`) opens it.
- **Lesson links**: "Make a lesson link" (locks as checkboxes per parameter and per part, the three panels, the text
  with a 500 counter, the notice that a lock is not security, Copy link); the Lesson box for a student; locked fields
  `aria-readonly` with a lock mark, locked handles not draggable.
- **Short lines**: the 15 keys of examples-challenges.md §3 in `whys.ts` (ui-why: 58 + 15 = 73), each with its
  claims.md kind. The status note on the page drops "worked examples" from "still to come" when M6.3b is done.
- Harness for M6's "done when": three examples by keyboard (E1, E6, E12) and three by touch (E5, E9, E15), each step
  reaching done; a challenge reached by applying the reveal, not by the start state; lesson links round-trip and a
  locked value cannot change from the page.

## Decisions taken here

- Done states test the visitor's circuit, not the route: E8's last step takes either solution; E11–E13's "other
  solution" uses `away`, so the visitor may find either first.
- Match tolerances |Γ_in| ≤ 0.02 in examples (0.01 in E10), 0.05 in challenges (learning.md's
  default); a drag with Snap on lands on standard values, so the hints say to type or Alt-drag where needed.
- `read` hides the readouts while it runs; without that the challenge would be a copy task.
- E16's load is stated as made up: no source gives a sub-GHz antenna's impedance, so the page claims none.
- Not added: an `ex=` link parameter to open an example directly (BL candidate if wanted).
