# Smith chart – notes of step M8.2 (data files)

Part of [plan.md](plan.md) (milestones.md M8). Harness only: nothing on the page yet. New files
`lib/smith/export/csv.ts`, `lib/smith/export/touchstone.ts`, `lib/smith/export/project.ts`,
`scripts/harness/smith/check-export.mjs` (called from `check.mjs`). All framework-free; each returns a string that
the page saves as a file (M8.3b).

## API for M8.3b

### CSV (`csv.ts`)

| Export | What |
|---|---|
| `nodesCsv(circuit, options)` | The nodes at f0, L (load) … In (input): `Node`, `After part` ("2 Shunt L", "Load"), `f (Hz)`, r, x, R (Ω), X (Ω), g, b, G (S), B (S), Re Γ, Im Γ, \|Γ\|, ∠Γ (°), VSWR, Return loss (dB), Q (\|x\|/r) |
| `traceCsv(trace, z0, options)` | A sweep.ts `Trace` (or `{ freqs, gamma, n }`): f (Hz), Re Γ, Im Γ, \|Γ\|, ∠Γ (°), Return loss (dB), VSWR, R (Ω), X (Ω) per point |
| `markersCsv(markers, options)` | sweep.ts `MarkerPoint[]` named M1, M2, …, the trace's columns after `Marker` |
| `CsvOptions` | `digits`: 0 (default) every digit (the shortest that reads back to the double), or 1…`CSV_DIGITS_MAX` 17 significant digits: pass the page's digits setting (`shownDigits()`) for "as shown"; `form`: `'plain'` (default, "0.00000003183") or `'eng'` ("31.83e-9", mantissa 1–999, exponent a multiple of 3; every spreadsheet reads it); `bom` (default true) |
| `csvNumber`, `csvField`, `csvRows` | One number, one RFC 4180 field (quoted when it holds `,` `"` CR LF, quotes doubled), rows joined with CRLF |

RFC 4180 with CRLF after every row and one header row whose names carry the units. A UTF-8 BOM comes first so Excel
reads Γ, Ω and ° (LibreOffice, Google Sheets and pandas skip it). ∞ (VSWR of \|Γ\| = 1, the return loss of a match,
the open's R) is written `inf`, which spreadsheets keep as text; a figure that does not exist would be an empty field.
Trailing zeros of a fraction are left out (the value is the same). Note for the short line: Excel keeps 15
significant digits, so "every digit" may lose the last one or two there.

### Touchstone (`touchstone.ts`)

`touchstone({ freqs, gamma, n, z0, link?, date?, format? })`: S11 at the circuit's input (Γ normalised to Z0) as a
Touchstone 1.1 one-port file, which 2.0 readers take too:

```
! Smith chart, https://yotasage.github.io/smith-chart/main
! S11 at the input of the circuit (one port), normalised to the reference impedance R
! Date: 2026-11-13T12:00:00Z
! Circuit: https://yotasage.github.io/smith-chart/main?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83098861837907e-12,lp:79.57747154594767e-9
! 401 frequencies
# Hz S RI R 50
50000000 -0.29411764705882354 0.8235294117647058
```

One CRLF line per frequency of the trace given (pass the refined trace the page shows, or a plain `sweepBand` of the
band's points for an evenly spaced file); frequencies that do not rise are left out. Every number has the shortest
digits that read back to the same double. `format` `'MA'` and `'DB'` give magnitude or dB with the angle in degrees;
\|Γ\| = 0 in dB is `DB_FLOOR` (−6473.6 dB, the smallest double), as Touchstone has no −∞. The `link` may be the query
(with or without "?") or a full URL; only printable ASCII is written (anything else becomes "?"). Suggested file name:
`smith-chart.s1p`.

### Project (`project.ts`)

- `Project` `{ circuit, sweep, lists, exports }`: the circuit with its ask (state.ts), the `SweepSetting` or null,
  the value lists (values.ts `ValueChoice`), `ExportSettings` `{ width, linewidth, view, detail, colour, fontPt,
  digits, form, touchstone }` (`defaultExportSettings()`; `figureOptions(e)` gives buildFigure's options).
- `projectJson(project, date?)` → the file's text; `PROJECT_EXTENSION` `.smith.json` (MIME `application/json`).
- `openProject(text)` → `Opened` `{ project, issues, version, message }`. Never throws. `project` null with a
  plain `message` when refused (not JSON nor a link, another format, a newer or unknown version, over
  `PROJECT_MAX_BYTES` 1 MB, empty); else `issues` lists what could not be used (shown as the link's issues are).
- `projectLink(project)`: the query the page writes for the same state (circuit, `vl`, sweep: the order of
  Lesson.tsx `linkSearch`); the file's `link` field is this as a URL, for people; it is not read back.

The file (version 1), with numbers as JSON numbers (shortest round-trip digits; ∞ as `"inf"`):

```json
{
  "format": "smith-chart-project",
  "version": 1,
  "tool": "https://yotasage.github.io/smith-chart/main",
  "saved": "2026-11-13T12:00:00.000Z",
  "link": "https://yotasage.github.io/smith-chart/main?v=1&…",
  "circuit": {
    "z0": 50, "f0": 100000000, "load": { "r": 25, "x": 25 },
    "parts": [
      { "kind": "cs", "value": 3.183098861837907e-11 },
      { "kind": "lp", "value": 7.957747154594767e-8 }
    ]
  },
  "solve": { "unknowns": [{ "part": 1, "param": "value" }, …], "goal": { "kind": "vswr", "value": 1.5, "within": true } },
  "sweep": { "start": 50000000, "stop": 150000000, "points": 401, "log": false, "markers": [100000000], "plot": "rl" },
  "lists": { "R": { "id": "E24" }, "C": { "id": "own", "values": [1e-12, 2.2e-12, 4.7e-12] }, … },
  "export": { "width": 88, "linewidth": false, "view": null, "detail": "standard", "colour": "colour", "fontPt": 7,
              "digits": 0, "form": "plain", "touchstone": "RI" }
}
```

(The writer puts every array or object holding no other one on one line.) Part `kind` is the link's code; `value` is
the link's value (lengths in λ at f0, a λ/4's Zt), `zc` for lines and stubs. Unknowns: `part` 1-based, `param`
`value` (with `free: true` for "lc"), `zc`, or `{ "param": "f0" }`. Goal: `kind` (point, mag, vswr, rl, r, g, x, b),
`r`/`x` (point, Ω) or `value`, `within`, `node` (absent: the input). `sweep.limit` only when not 10 dB.

**Reading.** A version-1 file is turned into the link's parameters and read by `decodeCircuit`, so a file and a link
accept the same values and report the same problems; a value may also be link text (`"2.4G"`, `"inf"`). JSON-level
problems (a missing circuit, parts not a list, unknown fields, bad lists or export settings) add their own issues and
take the start or default value. **Version 0** is a Smith chart link: the whole URL or the query, as plain text (its
first line), a JSON string, or `{ "link": … }` with `"version": 0` or none; it is read with `decodeCircuit` and gets
the default export settings; a lesson or challenge in it is not kept (an issue says so). **A newer version** is
refused: "This project was saved by a newer version of the Smith chart (file version 2); this page reads versions up
to 1. Reload the page to get the newest version and open the file again." A future version 2 adds a migration step
from 1 to 2 where `openText` says so, and reads only the newest form.

Left out of the project on purpose: the lesson and challenge (link-only teaching modes), the theme and the digits
setting (the visitor's own, in localStorage), the undo history.

## Checks (`check-export.mjs`, 2,895 in `npm run check`)

- **Reference Touchstone reader**, written in the harness from the Touchstone 1.1 and 2.0 specifications (comments,
  the option line's fields in any order with defaults GHz S MA R 50, units, RI/MA/DB, S and 1-port Y/Z normalised in
  1.1 and in ohms/siemens in 2.0, 2.0's [Version], [Number of Ports], [Number of Frequencies], [Reference],
  [Network Data], [End]). 8 hand-written files of other forms read correctly; 24 malformed ones rejected (no or late
  option line, unknown or repeated option, bad R, G of a one-port, words, short or long lines, falling, repeated or
  negative frequencies, keywords in 1.1, 2.0 without its keywords, a wrong count, no [End], two ports).
- **Our `.s1p`**: 60 random circuits' sweeps (refined or not, linear and log) in RI, MA and DB read back: frequencies
  to the bit, Γ against sweep.ts `gammaAt` at every frequency to 1e-12 (RI to the bit; MA and DB worst 7e-16), the
  option line, the comments, CRLF, ASCII only; a repeat dropped, \|Γ\| = 0 in dB, a link with "?" and a URL.
- **CSV**: an RFC 4180 reader written here reads back 200 random tables of fields with commas, quotes, CR, LF and
  Unicode; about 63,000 numbers (random doubles from random bits and from 1e-15…1e15) at 0, 1, 3, 4, 5, 6, 8, 12, 15
  and 17 digits in both forms read back to the bit (every digit) or within half a unit of the last shown digit, in
  their form; 19 exact cases. The trace, nodes and markers files of 40 random circuits at random digits and forms:
  headers, names, and about 170,000 cells against `gammaAt`, `evaluateCircuit` and figures computed in the harness to
  the shown digits.
- **Project**: 200 random states (circuits, asks from random links, sweeps of 2–10,000 points with markers, limit and
  plot, random lists with own values, random export settings) saved and opened: no issue, the same `projectLink`,
  `sameCircuit`, the same sweep, lists and settings, and the same text when saved again. Version 0 in six forms
  (query, URL with "#", BOM and "?", JSON string, `{link}`, `{version: 0, link}`) migrated and saved again as version
  1 with the same link; a lesson link and a broken link give their issues. Version 2 refused with its message.
  16 inputs that are no project (empty, words, broken JSON, an array, another format, version 1.5 or "1", too large,
  null) refused without a throw. 17 files with bad fields give the expected issues and values. 500 fuzzed files
  (values replaced by other types, keys removed, text cut) never throw and give a usable circuit or a message.
- **Timing** (Node, medians, 10,000 points): Touchstone 1.6 ms (budget 10), trace CSV every digit 6–7 ms and 4
  digits engineering 15–18 ms (budget 40), project save and open 0.05 ms (budget 5).

## For M8.3b (page)

- Save CSV: three buttons or a choice (nodes, trace, markers; the trace and markers only with a sweep), digits
  "as shown" (the digits setting) or "all", plain or engineering; type `text/csv;charset=utf-8`.
- Save `.s1p` from the trace the page holds (the worker's refined one) with `link: linkSearch(…)`; `application/octet-stream`
  or `text/plain`.
- Save project: `projectJson({ circuit, sweep, lists, exports })`; open from a file picker and drop with
  `file.text()` → `openProject`; show `message` (refused) or apply the project as one undo step and list `issues`
  as the link's issues are listed. A pasted link can go through `openProject` too (version 0).
