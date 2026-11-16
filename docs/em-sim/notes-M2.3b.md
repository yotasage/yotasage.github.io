# Notes of step M2.3b – the calculator comparison and "as JLCPCB's calculator" (2026-11-16)

## The helper: `lib/emsim/jlcCalc.ts`

`asJlcpcbCalculator(setup, parts?)` gives the setup with the inputs JLCPCB's online calculator sends to Polar Si9000
(notes-M1.4c.md), in four parts that the page can switch one at a time:

| Part | Rule | Kept as it is (named in `kept` and on the panel) |
|---|---|---|
| `er` | every **prepreg** εr 4.3 (Er1 in every request read) | cores: every request read had a prepreg under the signal |
| `copper` | outer copper of 1 oz finished (0.035 ± 0.01 mm): t 1.6 mil, base and plating cleared | inner copper; other outer weights (1 oz base would be T1 2.2 mil) |
| `etch` | the same layers: offset 0.25 mil per side (top 0.5 mil narrower) | as above |
| `mask` | every mask: εr 3.8, 1.0 mil on laminate, 0.6 over copper, 1.0 between | a stackup without mask: said so |

Each changed value cites the new ref **S** of `presets.ts` (`REFS.S`: JLCPCB's online calculator, Polar Si9000, read
2026-11-16), so the Sources list names it and the link carries it; a value already equal keeps its own source. The
stackup keeps its id, so the summary shows the preset as edited. The presets are unchanged (main session's decision).
`jlcAllBut(setup, part)` is the calculator's inputs with one part as the stackup has it: the breakdown.
`jlcpcbStated(setup, preset)` gives JLCPCB's stated number only for the owner's C39 (microstrip L1/L2 at 5.42 mil) and
C41 (pair at 4.33–4.36 / 7.87–8 mil) on JLC061611-3313A, as the preset has it or with the calculator's inputs.

## The numbers reproduced (M = 2, `npm run check`, group "JLCPCB calculator (M2.3b)", 40 checks)

| Case | Through the helper | notes-M1.4c.md | Si9000 |
|---|---|---|---|
| C39 at 5.421875 mil | 50.056 ± 0.058 Ω, εeff 3.3631 | 50.056 ± 0.058, 3.3631 | 49.958 |
| C39 at 0.1377 mm (the page's default) | 50.06 ± 0.06 Ω | – | – |
| C41 at 4.35625 / 8 mil | 99.999 ± 0.524 Ω | 99.999 ± 0.524 | 99.951 |
| C41 at 4.36 / 8 mil | 99.96 ± 0.52 Ω | 99.96 | – |
| C41 at 0.11 / 0.2 mm | 100.01 ± 0.53 Ω | 100.01 | – |
| Target 50 Ω, as the calculator | **5.435 mil** (0.1380 mm) | JLCPCB 5.42 (its search stops at ±0.5 %) | |
| Target Zdiff 100 Ω at 0.2 mm gap | 4.332 mil | JLCPCB 4.36 at 8 mil | |

The C39 breakdown from JLCPCB's inputs to the preset, one at a time: εr +0.94, copper +0.51, trapezoid +0.25,
mask −0.27 Ω (all together +1.44 Ω: 51.50 against 50.06), as facts-cases.md "Differences explained".

## The panel: "Calculators", the fourth tool

`components/EmSim/CalcTool.tsx`, in the tools' lazy chunk (first load 166.9 kB gzip, was 167.1). It solves only while
shown, in the worker on the channel `calc`, one after another: the field value, the setup as JLCPCB's calculator, then
one solve per part that changes something (2 + up to 4 solves; cached solves are free). Top to bottom:

1. The field value and the value "as JLCPCB's calculator" (Z0, Zdiff for a pair, line 1's Z0 for more), with the error
   digits of engine.md §8; JLCPCB's stated number when `jlcpcbStated` finds one.
2. The sentence of notes-M1.4c.md, with this stackup's difference in Ω and % and "a little wider/narrower"; for C39/C41
   where Si9000 stopped and its value; the kept parts as a list.
3. "Use JLCPCB's calculator inputs": commits `asJlcpcbCalculator(cur)` as one undo step (then Target gives JLCPCB's
   width directly); when the setup already has them, a note says so and that Undo returns.
4. "From JLCPCB's inputs to this stackup's, one at a time": each part's change and the sum.
5. The closed forms of `closedForms(setup)`: the reduction (mean width, copper, height or planes, series or parallel
   εr), a card per formula with its values and % to the field solution, "inside its range" or each input outside with
   its limit, the published accuracy or "not stated", what it leaves out; IPC-2141's card says it is the crudest;
   pairs get the zero-thickness note for Kirschning–Jansen; one sentence per neglect (mask, copper thickness, finite
   grounds), with the owner's sizes (mask 3.5 / 9 Ω, thickness 16 Ω: BL106 would compute them per setup). Kinds
   without a formula (broadside, general, pair CPW) show `closedForms`' reason.

`npm run ui` runs ui-calc.mjs (43 checks; see modules-page.md). Screenshots `emsim-calc-{390,1440}-{light,dark}.png`.

## For M2.4 (theory)

Link from the panel to the theory once it exists: from the "as JLCPCB's calculator" sentence to the solder mask and
trapezoid topics (why the mask lowers Z and how much), from the reduction paragraph to "how the field solver works"
(what the formulas simplify), from the Kirschning–Jansen note and the copper sentence to "single-ended and differential"
(side-wall coupling), and from the range/accuracy lines to a short "closed forms and their ranges" part. The panel's
sentences are the place for `#links`; `lib/useReplayHighlight.ts` already replays the target's highlight.

Left for later: BL105 (cores, inner copper, other weights as the calculator would take them), BL106 (the neglects'
sizes per setup).
