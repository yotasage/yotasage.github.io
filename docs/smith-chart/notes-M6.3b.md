# Smith chart – notes of step M6.3b (challenges and lesson links on the page)

Part of [plan.md](plan.md). The challenges and lesson links on the page, on the engine of M6.2
([notes-M6.2.md](notes-M6.2.md)); content from [examples-challenges.md](examples-challenges.md). The last step of M6;
the milestone's roll-up is at the end.

## Files

- `components/Smith/Challenge.tsx`: `ChallengeList` (the five kinds in the Learn section, after the examples, each with
  its progress) and `ChallengePanel` (the running challenge where the guide goes); the progress helpers.
- `components/Smith/Lesson.tsx`: `linkSearch` (the page's whole link), `LessonBox` (where the guide goes, above it),
  `LessonMaker` (a `<details>` at the end of the Learn section).
- `components/Smith/Learn.tsx`: `LearnSection` renders both after the examples (props `challenges`, `maker`).
- `pages/smith-chart/main.tsx`: the `challenge` and `lesson` state with refs that `commit` reads, `keepLocks` in
  `commit`, `startChallenge`, Apply, Close, Leave the lesson, Start over to the lesson's or the problem's circuit, the
  link, the progress, the hidden panels.
- `components/Smith/Strip.tsx`: `lock`, `noSolve`, `noRead`; `Field`'s `locked` with a padlock that says why.
- `components/Smith/pathLayer.ts`: `setFixed` (a locked value's handle neither drags nor steps by keys).
- `components/Smith/solveLayer.ts`: `setHint` (hint 1's circles drawn as the solver's).
- `components/Smith/SolvePanel.tsx`: `noSuggest`. `components/Smith/Chart.tsx`: `noReadout`.
- `components/Smith/whys.ts`: the ten lines of §3 (73 in all); theory.md §8 has the 15 rows of M6.3a and M6.3b.
- `components/Smith/Status.tsx`: exercises and lesson links in "what it does"; still to come: sweeps and a report,
  export.
- `styles/SmithLearn.module.css`, `styles/Smith.module.css` (`.lockMark`, `.srOnly`, locked fields and tiles, the fixed
  handle dashed).
- `scripts/harness/smith/ui-challenge.mjs` in `npm run ui`; `ui-why.mjs` counts 73 lines.

## Behaviour and decisions

- **Starting** a kind (the Learn section, or New problem) draws a seed with `crypto.getRandomValues`, commits the
  problem's circuit as one undo step, closes the guide and puts the panel where the guide was, with the focus on its
  heading (notes-M6.3a's handling). Loading an example closes a running challenge. The link carries `ch=kind.seed`;
  a `read` problem writes `v=1&ch=read.N` only (its load is the answer). A `ch` link opens its problem unless the link
  also has `zl` (then the visitor's circuit from the link).
- **Locks of a challenge**: Z0, f0 and the load (and for `read` the parts) are kept by `keepLocks` with the problem as
  base, so the fields say "fixed by the challenge" instead of letting `reached` refuse a changed load later.
- **Hidden while one runs**: the Solve panel (its circles cleared from the chart), the suggestions with it and "Solve
  for"; for `read` also the readout, the node table, the equation panel, the derivations, the load fields, the circuit
  input and the theory's live numbers (the theory shows the start circuit), since each prints the answer.
- **Check** shows `reached`'s `why` for the circuit it was pressed for (until the next change); the state line ticks
  as soon as the circuit reaches the goal, whatever the route. For `read` the answer field takes one number (a comma
  may be the point) or two ("0.5, −1", "0.5 − j1").
- **The ladder**: one press per hint, each made from the visitor's circuit at the press (`hintLadder`); hint 1's
  circles go to `solveLayer.setHint` (a preview's still win) and stay until the challenge closes; the fourth press is
  the reveal with Apply (one undo step), for `e24` with the E24 variants that meet the goal. `hd=reveal` stops the
  ladder at hint 3.
- **Progress** (`smith.challenges`, read after mount): tried (each start, also by a link), solved (once per problem,
  only when reached on the page before a reveal: a link that opens already reached counts as tried only, so a shared
  answer or a reload is no solve), revealed, hints 1–3 shown, fewest parts. Shown under each kind.
- **Lesson links**: the maker's link is the circuit as it is, the value lists, the lesson part and, if ticked, the
  running challenge. The Lesson box shows the text through React (plain text, `white-space: pre-wrap`), the locks and
  hidden panels in words, and Leave the lesson. Leaving drops the lesson from the page and the link but is not an undo
  step (the history holds circuits only): a deviation from examples-challenges.md §2.
- **Locked controls**: fields read only with `aria-readonly` and a padlock whose title (and screen-reader text) says
  why; a kind- or value-locked part has Remove and the move buttons off, and Delete and Alt+arrows on its tile do
  nothing; no part moves onto a locked place and the add row offers only places on the source side of locked parts;
  `parts` turns Add and Draw off. A locked value's handle is dashed, `handleAt` skips it (a drag there pans), and its
  slider is `aria-readonly` with keys that do nothing. Behind all of these, `commit` runs `keepLocks`; a change it
  undoes puts the chart's circuit back. While a lesson's locks hold, examples and challenges are off with a note: their
  circuits would be refused by the locks.

## Harness (ui-challenge.mjs)

344 checks: every kind by keyboard alone at 1440 px (started by Enter, the link's seed reproduces the engine's
problem and task, the start state refused with the engine's `why`, hints 1–4 the engine's texts with the focus on each,
hint 1's circles on the chart, Apply or the typed answer passes Check and counts as revealed, one Undo back to the
problem); the hidden panels absent while each runs; each seed reopened through its link; `two` solved by adding and
typing its parts (solved once, fewest parts); progress in localStorage and on the page after a reload; `hd=reveal`;
the maker: each of 8 locks and 3 panels alone, all together, a text with emoji, &, =, %, a newline, and 501 code
points cut at 500; the locked view: 21 refused changes (typing by keys and after a click into all four parameters
and both parts' values, the handle keys, mouse drags of both handles, Delete and Alt+arrows), Add, Draw and Start over
off, Leave the lesson; with only v1 locked, part 2 still moves by keys and by a touch drag while part 1's touch drag
does nothing (390 dark, 320 light); no sideways scroll with the Lesson box, a challenge, the reveal and the maker; 44
px targets.

## Performance

Interleaved A/B with ui-drag.mjs (10 parts, 2 s drag, no challenge or lesson), HEAD's app code (the changed files
stashed) against this step's, in pairs HEAD, after, after, HEAD; main thread per drag frame at 4×, ms (each the median
of its three attempts' medians):

| Pair | HEAD | after | after | HEAD |
| --- | --- | --- | --- | --- |
| 1 | 12.36 | 11.23 | 11.54 | 12.29 |
| 2 | 11.17 | 11.71 | 12.19 | 10.87 |
| 3 | 11.12 | 12.42 | 11.46 | 11.29 |

Means 11.52 (HEAD) and 11.76 (after): +0.24 ms, under the 0.3 ms allowed, with a spread of ±1 ms between runs of the
same code. A first set of two pairs (one HEAD run lost to the log) gave 11.04 and 11.98; all nine runs of each
together give +0.47 ms, within that spread. Nothing of this step runs in a drag frame: the panels are memoised with
stable props (the Learn section's prop objects are memoised on the commit, the challenge panel's change only on a
commit), the fixed-handle test is in `handleAt`, `beginDrag` and `keyStep` only, and `keepLocks` runs in `commit`,
i.e. once at the drag's end. At 1× 2.56–3.01 (HEAD) and 2.60–2.89 (after). ui-drag's absolute 4× budget and 4×
frame-loss checks fail on this machine at HEAD as well (143 of 145 in every run, notes-M4.3a.md).

## Runs

`npm run check`: 1,390,800 of 1,390,800. `npm run ui`: 14 of 15 scripts; ui-drag with only its two 4× checks (143 of
145, as at HEAD); ui-challenge 344 of 344, ui-why 836 of 836 (63 info buttons followed, 73 lines), ui-learn 197 of 197,
ui-edit 3,734 of 3,734 (the status note's "Still to come"). `npx tsc --noEmit` and `npm run build` pass. Looked at in
both themes at 390 and 1440 px with a lesson and a challenge open and the maker unfolded.

## M6 roll-up (milestones.md M6, "done when")

| Item | Evidence |
| --- | --- |
| Every example's stated answer reproduced by the engine to its stated digits | check-teach.mjs: 125 stated figures by the engine and by hand (notes-M6.2.md), in every `npm run check` |
| Three examples played through by keyboard, three by touch emulation, "done" at each step | ui-learn.mjs: E1, E6, E12 by keyboard, E5, E9, E15 by CDP touch at 390/320 px, 23 steps done after their action and not before (notes-M6.3a.md) |
| 1,000 generated challenges per kind solvable and within ranges; same seed, same problem | check-teach.mjs: 1,201 seeds per kind (notes-M6.2.md); on the page ui-challenge.mjs reopens each kind's seed through its link and gets the engine's problem |
| A challenge reached by applying the revealed solution, not by the start state | check-teach.mjs for every seed; on the page ui-challenge.mjs for all five kinds (Check refused at the start, passed after Apply or the revealed answer) |
| Lesson links round-trip (every lock and hidden panel, the text with any characters) | check-teach.mjs with random texts; ui-challenge.mjs through the maker: each lock and panel alone and together, emoji, &, =, %, newline, 501 code points |
| A locked control cannot be changed from the page | ui-challenge.mjs: 21 attempts by keyboard, mouse and touch refused (fields, handle keys, drags, tile keys), Add/Draw off |
| Layouts hold at 320 and 390 px | ui-learn.mjs and ui-challenge.mjs at 320 and 390 px (no sideways scroll, 44 px targets); screenshots below |

Screenshots (scratch, not in the repo): the tool with a lesson and a challenge at 1440 px light and 390 px dark.
