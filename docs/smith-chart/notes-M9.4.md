# Smith chart – notes of step M9.4 (docs and re-check), the last step of the plan

Part of [plan.md](plan.md). Checks: `npm run recheck` (new), `npm run check`, `npm run ui`.

## npm run recheck

`scripts/harness/smith/recheck.mjs` runs check.mjs (engine, TikZ compiles), the resistor harness and `ui.mjs --prod`
(next build, size.mjs, the 22 browser scripts on `next start`), showing their output as it comes, then prints a table:
per milestone M1–M9 each "done when" item of [milestones.md](milestones.md) with the checks that prove it, taken from
the roll-ups (notes-M3.5, M4.4b, M5.4, M6.3b, M7.4b, M8.3b; M1 and M2 had none and were mapped here from check.mjs's
sections and ui-grid/ui-chart; M9 from notes-M9.1–M9.3). An engine item passes when each of its check.mjs sections ran
and no FAIL line names it; a UI item when ui.mjs printed "=== <script> passed". Items that are a reading done once
(every claim sourced, the derivations read through, screenshots looked at, the status note) are listed as "record" with
the file that holds them and do not fail. `--no-ui` skips the browser suite (its items then fail as "not run");
`--memory` adds ui-memory.mjs (10 minutes) for the memory budget. Exit 1 if any item fails.

**Result (2026-11-14, this step's code):** 62 of 62 "done when" items pass (4 on record), 0 fail, in 24 minutes:
check.mjs 1,399,628 of 1,399,628 (152 s, the TikZ compiles included), the resistor harness 3,294 of 3,294, size within
budget, 22 of 22 UI scripts on a production build (1,288 s). Per milestone: M1 10, M2 6, M3 10, M4 5, M5 6, M6 7, M7 5,
M8 8, M9 5 items. No timing exception: ui-drag's and ui-chart's 4× guards (production) and ui-path's frame checks pass.

## The flaky WebKit checks (ui-browsers.mjs)

The two single failures the main session saw ("webkit touch learn: locator.scrollIntoViewIfNeeded: Timeout" and "webkit
mouse export: [data-export-svg] saves a file") had one cause. Playwright's `click()` and `tap()` scroll the element into
view again inside the action. In WebKit that scroll landed 723 px off on this page: the Theory, Report and Equations
parts are `content-visibility: auto` with placeholder heights (`contain-intrinsic-size`) that change as they enter the
screen, and WebKit has no scroll anchoring. The press then hit the chart or `<main>`: the Learn example never loaded,
so the guide's answer field never came (the timeout), or an export button got nothing. Shown with a probe: the tap's
events arrived after a scroll from 5106 to 4383 px with the button at y = 1098 in an 844 px window; with
`content-visibility: visible` forced on every element the same tap loaded the example. In this run it failed every
time at 390 px; in the main session's runs now and then, by where the page was scrolled.

Fix in the harness (the page behaves for a person, who scrolls and then taps): `hit()` scrolls the element to the
middle itself, waits until it stands still for two frames, checks that it is in the window, not covered
(`elementFromPoint`) and enabled, and then clicks or taps at its centre with `page.mouse`/`page.touchscreen`. Every press
of the walk goes through it. The Export walk also scrolls the section near the screen before waiting for its figure
(it was waited for off screen, where it is never built, 8 s lost per walk) and checks that it is built. 377 checks (6
new), about 75 s for the three browsers (was about 2½ min). `SMITH_BROWSERS=webkit` runs one browser.

Three consecutive full runs on a production build (`next start`, port 3021): 377 of 377 each (chromium, firefox and
webkit 15 tasks by mouse and 15 by touch, 0 failed).

## Fresh reading check

A Sonnet agent read the status note, the 99 short lines of `whys.ts` against [theory-lines.md](theory-lines.md) and the
theory's topic ids, and a sample of 22 claims of [claims.md](claims.md) against the code and the theory docs. Found:

- The status note's last line still said "checks in other browsers, by touch and of speed come next", done in M9.2 and
  M9.3. Now: "…; it is checked in Edge, Firefox and Safari's engine, by touch, and for speed." (the same length).
- claims.md's count of short lines stopped at 57 (M5.3); now also "99 at the end of the plan".
- Short lines: every line and topic id matches; no dangling topic. Claims: none contradicted by the code or the docs
  (14/110, 56/57, 90/92, 140/141, 151, 177, the sweep's half-power Q among them). Claim 151's "b = −1 ± 0.408" was
  flagged as ambiguous: b is the shunt part's own susceptance and B the node's after it (b plus the susceptance of 1
  that the node had before), so both are right; left as it is.

## Docs

- [howto.md](howto.md): for visitors: what the tool does, quick start, building a circuit, finding a missing value,
  equations and Explain, sweep and report, the export for LaTeX (picture or standalone, `\linewidth`, sizes, detail,
  colour modes) and the data files, Learn, accessibility, and the limits (ideal parts, lossless lines, one real Z0,
  ladders, values at f0, two unknowns, one port).
- README.md's entry adds the Equations panel, derivations, Explain, Learn, keyboard and touch, the browsers and the
  how-to. CLAUDE.md's Smith chart bullet points to the module map and names the three npm scripts.
- BACKLOG.md: BL46 (TikZ export) removed as done; open Smith chart rows whose trigger was a milestone now done (BL37–BL41,
  BL44, BL47, BL49, BL50, BL52, BL54, BL64, BL68) have a trigger that can still happen.
- plan.md: M9 done and "State at the end of the plan".
