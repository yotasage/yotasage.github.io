# Notes from step M1.8c: every JLCPCB stackup on the page

## The picker

- The Stackup section keeps the select of the ten hand presets as the quick choice. Beside it, **"All JLCPCB
  stackups…"** (`data-jlc-open`, `aria-expanded`) opens an inline panel under the tools (`JlcPicker.tsx`, a region,
  not a modal dialog: it works at 320 px without covering the page, and the page behind stays usable).
- Filters are native selects: layers, thickness, outer copper, inner copper ("none (2 layers)"), offer (free /
  standard / special / not named), and "Show withdrawn" (off by default). Each menu lists the values found in the list
  filtered by the *other* menus, so no choice leads to an empty list; "Clear filters" resets. The filter is kept in
  module scope for the visit.
- Rows are in `jlcSort` order (hand presets first, tagged "quick preset"), each a button: the template id, "No
  requirement" (JLCPCB's choice for that), the offer, layers and copper, finished ± tol (or the nominal when JLCPCB
  states no finished thickness) and, in the warning colour, the pressed sum where it is off the nominal by more than
  the tolerance (±10 % when none is stated: 15 of the 22 two-layer templates), then the note (withdrawn, special
  structure, inner copper weights differ). The shown stackup's row has `aria-current`.
- Choosing commits `withStackup(cur, jlcStackup(entry, data))` through `commit`, so undo and redo work as for the
  presets. An entry that *is* a hand preset (`PRESET_KEYS`) is chosen as that preset: short id, the quick select
  shows it. Choosing, Close and Escape (anywhere in the panel) close it and give the focus back to the open button;
  on open the focus goes to the first filter once the list is there.
- JLC06161H-3313A, JLCPCB's "No requirement" 6-layer choice, is marked withdrawn and so hidden until "Show withdrawn";
  it stays in the quick select.

## Loading

- `components/EmSim/jlcData.ts`: `loadJlc()` does `await import('../../lib/emsim/jlcpcbStackups.json')` (no
  `@ts-expect-error` needed: the path has its extension), one promise, the data kept in module scope; a failed load is
  forgotten so the next open tries again. While it loads the panel says so (`role="status"`); a failure is an alert
  with the reason.
- The picker component itself is `React.lazy` (its own chunk, 5.3 kB, 2.2 kB gzip).
- **Data chunk:** one chunk of 890 401 B, **45.1 kB gzip** (`.next/static/chunks/…`, found by a list-only id).
- **First load:** 152.9 kB gzip JS (151.2 before; budget 200). What grew: `jlcpcb.ts` (setup.ts needs `isJlcKey`),
  `jlcData.ts` and the section's wiring.

## The link, the project file and the resolver

- `setup.ts`: `StackupResolver = (key) => Stackup | null`. `toPlain(x, omitDefaults, resolve?)` and
  `plainStackup(s, S, resolve?)` write an **unedited list stackup as its key** (`s=rigid_JLC08161H-1080_1.6_1_0.5`)
  when the resolver knows it; an edited one (or any without a resolver) as layers, as before, keeping the key as the
  stackup id. `fromPlain(raw, resolve?)` reads a string `s` that `isJlcKey` (board_id_thickness_outer[_inner]; hand
  ids have no `_`, KiCad stackups no id) through the resolver: no resolver → "is a JLCPCB stackup and the list of them
  is not loaded", null → "is not in JLCPCB's stackup list", a throw → its message; each is the usual stackup issue
  with the default stackup (fitted trace and via). Never throws.
- `link.ts` (`encodeLink`, `decodeLink`, `linkRoundTrips`) and `project.ts` (`projectJson`, `openProject`) pass the
  optional resolver through; the project file's `setup.s` is the key the same way.
- The page (`EmSimTool.tsx`) decodes once with a resolver that notes whether a key was asked for. If one was and the
  list is not loaded, it loads it, then decodes again with `jlcResolve`; if the load fails, it decodes with a resolver
  that throws "JLCPCB's stackup list could not be loaded: …", so the reason is in the link's issues. `data-ready` is set
  only after that, so the link is not written back before. The link is written with `encodeLink(setup, jlcResolve)`.
- Hand-preset links (including `JLC-2L-1.6`) and the default `v=1` are unchanged.
- The summary: `data-preset-id` is the key for a list stackup, `data-list="true"`, `data-edited` compares with
  `jlcResolve(id)`; when a list stackup arrives as layers (a link made without the list, or the history), the section
  loads the list to judge it.

## Checks

- `check-link.mjs` (+23; `npm run check` 18 587, all pass): a 2-, an 8- and a 16-layer list stackup by key through link
  and project (exact, stable, `s` is the key, no `src`); without a resolver written as layers and read back the same;
  a key read without a resolver → issue and default; edited → layers, exact; every key passes `isJlcKey` and no hand id
  does; an unknown key and a resolver that throws → issue with the reason and the default; hand presets and `v=1`
  unchanged with a resolver.
- `ui-jlcpcb.mjs` (36 checks, in `npm run ui`, 153 in all): the first load holds no script with a list-only id, the
  list arrives in one new chunk when the picker opens; counts and order equal `jlcFilter`/`jlcSort` in Node (withdrawn
  hidden and shown, hand presets first); the 8-layer, 1.6 mm, 1 / ½ oz filter and a pick: summary, drawing labels,
  sources (JLCPCB with the fetch date), the link by key decoding in Node to `jlcStackup`; undo and redo; the link in a
  fresh context; links of layers unedited and edited; an unknown key; keyboard (Enter opens, an arrow key filters, Tab
  to a row, Enter chooses, Escape closes, the focus returns); a tap at 390 px; no horizontal scroll at 320, 390 and
  1440 px in both themes with the picker open; screenshots of the open picker at 390 and 1440.
- Left for later: BL98 (search by id and a layer preview in the picker; a layers link of an unedited list stackup
  becomes the key only after the next change).
