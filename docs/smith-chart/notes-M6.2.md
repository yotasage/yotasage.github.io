# Smith chart – notes of step M6.2 (teaching engine)

Part of [plan.md](plan.md). Engine and harness only, no page: the data and functions M6.3a (Learn section, guide) and
M6.3b (challenges, lesson links) build on. Content from [examples.md](examples.md) and
[examples-challenges.md](examples-challenges.md); shapes from [notes-M6.1.md](notes-M6.1.md).

## Files

- `lib/smith/examples.ts`: the 16 examples, `stepDone`.
- `lib/smith/challenge.ts`: generator, check, hints, reveal.
- `lib/smith/lesson.ts`: lesson part of the link, `keepLocks`, the `ch` parameter's reading.
- `lib/smith/state.ts`: `PARAMS` gains `lk`, `hd`, `tx`, `ch`; `Decoded.lesson`, `Decoded.challenge`.
- `scripts/harness/smith/check-teach.mjs` in `npm run check` (sections `teach: examples` 169, `teach: challenges` 34,
  `teach: lesson links` 15 checks; about 0.3 s).

## API for M6.3a (guide)

```ts
EXAMPLES: readonly Example[]           // examples.md's order; exampleById(id)
Example { id, title, intro, link, steps, solutions, stated, claims }
Step { do, done: Check[][] /* OR of ANDs */, hint, topic: TopicId, reach?: string }
stepDone(step, circuit, { grid: 'Z' | 'Y' | 'ZY', answer: number | null, doneAt: (Float64Array | null)[] }): boolean
nodeGammas(circuit): Float64Array      // Γ of every node (re, im per node, the load first): store in doneAt[i] when step i is done
answerCheck(step)                      // the step's `answer` check or null: show the answer field
```

- Load an example with `decodeCircuit(example.link).circuit` as one undo step; every link has `p=`.
- Call `stepDone` after every change (it evaluates the circuit once; a few µs). `doneAt` is 0-based by step;
  `away.step` is 1-based as examples.md writes it.
- `answer`: the typed number must lie within `tol` of the stated value and of the engine's value at that node now;
  angles in degrees (wrapped), `R` in ohms, `rl` in dB, `Q` the node's Q.
- `next` always holds: the page shows Next at once (E8 step 1).
- `step.reach` is the circuit examples.md's numbers give for that step: the M6.3a harness can play keyboard and touch
  runs against it (E1, E6, E12 / E5, E9, E15).
- `topic` is a Theory.tsx anchor (checked by the harness).

## API for M6.3b (challenges, lesson links)

```ts
makeChallenge(kind, seed): Challenge   // challengeOf(text) for a `ch` text; CHALLENGE_TITLES; challengeTask(ch)
Challenge { kind, seed, circuit, allowed, maxParts, zcIsZ0, e24, goal, read?, complex?, revealed: Revealed[], draws }
reached(ch, circuit, answer?: number[]): { reached, why }   // why: one sentence for under Check
hintLadder(ch, circuit): Hint[4]       // Hint { text, circleNode, circles, revealed?, answer?, equation? }
reveal(ch): Revealed[]                  // Revealed { circuit, solution, standard?: { circuit, variant }[] }
readAnswer(ch): number[]                // read: [r, x], [g, b], [|Γ|], [VSWR] or [RL dB]; READ_TOL
challengeText(kind, seed) / readChallenge(text)

readLesson(lk, hd, tx, parts, issues): Lesson | null      // decodeCircuit does this: Decoded.lesson
lessonParams(lesson): string            // "&lk=…&hd=…&tx=…", append after encodeCircuit (and "&ch=" + challengeText)
keepLocks(lesson, base, next): Circuit  // in commit; returns next itself when nothing changed
valueLocked(lesson, i), kindLocked(lesson, i), hasLock(lesson, lock), lockText(lock), TEXT_MAX
```

- `Decoded.challenge` is `{ kind, seed }`; the page makes it with `makeChallenge` (0.03 ms) and starts from
  `ch.circuit`. "New challenge": a seed from `crypto.getRandomValues`.
- Hint 1's `circles` (8 numbers: two generalised circles; `read` with |Γ|, VSWR, RL: one) at `circleNode` go through
  solveLayer's circle drawing; hints 2–4 have none (keep hint 1's drawn). Hint 4 carries `revealed` (Apply each
  `circuit`; for `e24` the `standard` circuits that meet the goal) or, for `read`, `answer` and `equation` (an
  equations.ts id).
- `reached` also refuses a changed Z0, f0 or load ("Start over brings it back"): the page may also lock them.
- `lessonParams` writes lone surrogates as U+FFFD (encodeURIComponent would throw); text is cut at 500 code points,
  never inside a surrogate pair.

## Decisions and deviations from notes-M6.1.md

- Generator attempts: an attempt draws every number of its kind in §1's order (for `e24` the goal after `two`'s three),
  then tests the load bound and the solver; a failure starts the next attempt from the same stream. This reproduces
  M6.1's sample exactly (draws per problem 1.05/1.04/1.16/1.05/1.22, at most 3/3/4/3/4; solutions per problem 2.28,
  2.00, 1.50). After 4,096 failed attempts (never seen) a fixed problem of the kind is used.
- The solver test uses the centre as a point goal (exact solutions); `two` and `e24` try series-first and shunt-first
  templates with both unknowns free (L or C); `revealed` keeps every realisable solution within the bounds.
- `Check.value` gained `of: 'L' | 'C'` so a value on a part of the wrong kind never counts.
- `Step.reach`, `Example.stated` and `Example.solutions` as links are additions: they make the play-through and the
  stated-figure check data, not harness code.
- `Hint.revealed` replaces `solutions?: Solution[]` (Apply needs the finished circuit); `Hint.answer` and `equation`
  for `read`. Hints for a line follow the shortest line (hint 2 says "the first crossing").
- `keepLocks`: a `k<n>` or `v<n>` lock holds while part n keeps its kind, so parts may be added at the source end of a
  lesson with locked values; a removal, move or kind change at a locked part brings back the lesson's parts (and ask).
  The ask is left alone otherwise (the page hides "Solve for" on locked parts).
- One harness file (`check-teach.mjs`) instead of three (`check-examples`, `check-challenge`, lesson checks).
- examples.md's E16 "10 nH gives 0.123 or 0.127" pairs 4.7 pF with 0.123 and 4.3 pF with 0.127; the data says so.

## Measured

Generation per challenge (mean over 400 seeds): `two` 0.011 ms, `stub` 0.006, `qw` 0.006, `e24` 0.022, `read` < 0.001
(budget 0.5 ms); `e24` with its hint ladder 0.043 ms (budget 5 ms). 1,201 seeds per kind (0–999, 200 random, 2³² − 1),
2,744 / 2,402 / 1,803 / 2,682 revealed solutions, 9,400 E24 variants reached.
