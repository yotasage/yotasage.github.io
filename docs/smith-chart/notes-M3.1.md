# Smith chart – notes of step M3.1 (circuit state and strip)

Part of [plan.md](plan.md). The circuit is the page's state, in the link, edited in the side panel. No arcs yet (M3.2).

## The link (version 1)

```
/smith-chart/main?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83098861837907e-12,lp:79.57747154594767e-9
```

`v` version; `z0` Ω; `f0` Hz; `zl` load `R:X` in Ω (`inf:0` the open); `p` parts **from the load towards the source**,
comma-separated, `code:value` or `code:length:Zc` for lines and stubs. Codes: `rs ls cs` series R L C, `rp lp cp`
shunt, `tl` line, `so` / `ss` open / short stub (length in λ at f0, Zc Ω), `qw` λ/4 (Zt Ω). Numbers are JavaScript's
shortest round-trip digits in engineering form (`numText`: `100e6`, `0.125`, `25e-12`, `inf`), so every double comes
back to the bit (−0 is written `0`). Only characters a query keeps unescaped. Reading (`readNum`) also takes what
`readAmount` reads (`f0=2.4G`, `ls:4n7`) and `1e 21` (a `+` turned into a space).

Reading never throws (`decodeCircuit`): a missing parameter takes its D16 value silently; an unreadable one takes it
with an issue; a bad part is left out with an issue; unknown parameters, repeats, a newer or unknown version and more
than `MAX_PARTS` (24) parts are issues. The page lists issues above the parameters. The page writes the whole link
(`encodeCircuit`) after mount and on every change, so every state is a link.

## State API (`lib/smith/state.ts`)

- `Circuit` = network.ts's `{ z0, f0, loadR, loadX, parts: Part[] }`; `Part` = parts.ts's `{ kind, value, zc? }`.
- `defaultCircuit()` (D16): series C with x = −1, then shunt L with b = −1, both from `valueFor`: C = 1/(ω·50 Ω) =
  31.83 pF, L = 50 Ω/ω = 79.58 nH; Γin is 0 to rounding (harness: < 1e-9; by hand: Zin = 50 Ω).
- `newPart(kind, c)`: lumped adds ±1 normalised (the kind's sign), lines and stubs 1/8 λ of Zc = Z0, λ/4 Zt = Z0.
- Edits return new circuits: `insertPart(c, i, p)`, `removePart(c, i)`, `movePart(c, from, to)`, `withPart(c, i, p)`.
- Value forms (engine.md §2): `formsOf(kind)` → `Form { id, label, hint, unit, infinite }`, ids `R L C X G B n len deg
  zc zt`; `formValue(id, p, c)` at f0; `withForm(id, p, v, c)` → new part or a reason (sign rules: series L x ≥ 0,
  series C x ≤ 0, shunt L b ≤ 0, shunt C b ≥ 0; x = 0 of a C is C = ∞; a stub's ±∞ b is its open/short length);
  `readForm(form, text)` (a field's own unit only; `λ`, `°` may follow the number).
- Checks with reasons: `z0Problem`, `f0Problem`, `loadRProblem`, `loadXProblem`, `valueProblem`, `zcProblem`,
  `partProblem`, `circuitProblem`.
- `circuitInputGamma(out, o, c, f?)` (allocation-free, uses `inputGamma`), `sameCircuit(a, b)` (to the bit).

## Strip API (`components/Smith/Strip.tsx`)

`<Strip circuit onChange issues />`, rendered as `Chart`'s `side` above the readout. Parameters (Z0, f0, load R and X;
R takes ∞), the strip (source left, load right, `←` for the path's direction; tiles `data-tile={index}`,
`data-kind={code}`, coloured `partColour(i)` = `--part-(i mod 8 + 1)` by index from the load), the selected part's card
(`data-card`, every form as a field `data-name="p<n>-<form>"`, `←` / `→` move, Remove), the add row (`data-add-kind`,
`data-add-at`: source end, load end or between n and n+1; `data-add`), the circuit input (`data-input` = z, Z, gamma,
vswr, rl, in `readoutTexts`' texts).

Fields (`Field`): show the circuit's value (4 digits) until typed in; every keystroke is read and, when usable, sent
through `onChange` at once; else the field is `aria-invalid` with the reason under it and the circuit stays. Escape
goes back. Keys on a tile (one tab stop, roving): ← → walk, Home / End go to the source / load end, Alt (or Ctrl,
Shift) + ← → move the part, Delete / Backspace remove it; the focus follows the part or the add list.

Layout: ≥ 960 px the side column is sticky and scrolls on its own (`max-height`, `overflow-y: auto`); below, the panel
is under the chart; the strip scrolls sideways inside itself on phones.

## For M3.2 (path)

- The page holds `circuit` (React state); pass it to whatever draws the path. A value change is one `onChange` →
  `commit(next)` → re-render; draw the arcs from it in `ChartView.world` on `onReframe` and when the circuit changes
  (`request(DIRTY_CONTENT)`), not in React's render. `circuitInputGamma` shows how to evaluate without allocation;
  use `evaluate` with kept buffers for all nodes.
- Arc colours: `partColour(i)` (by index, as the tiles). The goal (§8) is not in the link yet: add a parameter
  (e.g. `goal=`) to `PARAMS` in state.ts and to the encoder, keep `v=1` if old links still read the same.

## For M3.3 (direct manipulation, undo)

- `commit` in `pages/smith-chart/main.tsx` is the one place a new circuit arrives (fields, add, remove, move, link).
  Undo/redo hooks in there: push the previous circuit (they are immutable, so a stack of references), coalescing
  keystrokes of one field and the frames of one drag. A drag should call `withForm`/`withPart` with the projected
  value per frame and commit once more at the end.
- The strip keeps its own ids for React keys (`ids` ref, kept through add/remove/move; regenerated when the part
  count changes from outside, e.g. undo). Undo across a reorder will remount the card; acceptable.

## Checks

`npm run check`: 837,891 (state: 38 — 10,000 round trips to the bit, 20,000 doubles from random bits through
`numText`/`readNum`, 1,000 broken links with 1–3 defects each, all with reasons and usable circuits, 1,000 random
strings, D16, 12,700 form round trips to 1e-12, edits). `npm run ui`: grid 20,719, chart 309 (its Tab test now starts
from the home link, as the side panel adds tab stops after the chart), strip 347.

Left out: physical line lengths with εeff (BL50).
