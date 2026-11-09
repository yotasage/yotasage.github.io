# PCB viewer – plan

A viewer for Gerber files and printed circuit board designs at `/pcb-viewer/main`, running entirely in the browser like
the rest of the site.

The owner's goal (2026-11-08): open designs from KiCad, Altium, PADS and EAGLE, and Gerber sets, to understand a
design and get an impression of what it looks like, without installing PADS Viewer or Altium and without ad-filled
websites. Viewing comes first. Exports are for documentation and further work, not for ordering boards. The tool is
made for the owner and public for anyone, as is.

## Files of this plan

Read only the files a task needs; none of them is meant to be read all at once.

| File | What |
| --- | --- |
| [plan.md](plan.md) | This index: goal, ground rules, formats, step status, how a step is run and checked, format notes |
| [test-files.md](test-files.md) | The test files and references, where they are and what they show |
| [architecture.md](architecture.md) | Module layout, drawing, libraries |
| [model.md](model.md) | The shared board model; must match `lib/pcb/model.ts` |
| [s1.md](s1.md) | S1: Viewer shell and Gerber, with its scope and the notes it left for later steps |
| [s2.md](s2.md) | S2: Drill files, realistic view, measuring, PNG and SVG, with its scope and the notes it left for later steps |
| [s3.md](s3.md) | S3: KiCad boards and footprints, design model, stroke font, with its scope and the notes it left for later steps |
| [s4.md](s4.md) | S4: Inspect, highlight, search; BOM and pick-and-place export, with its scope and the notes it left for later steps |
| [s5.md](s5.md) | S5: Altium, with its scope and the notes it left for later steps |
| [s6.md](s6.md) | S6: PADS ASCII, with its scope and the notes it left for later steps |
| [s7.md](s7.md) | S7: EAGLE, with its scope and the notes it left for later steps |
| [s8.md](s8.md) | S8: PDF and DXF export; pick-and-place CSV over Gerbers, with its scope and the notes it left for later steps |
| [s9.md](s9.md) | S9: KiCad export, with its scope and the notes it left for later steps |

## Ground rules

- **The site's hard constraints apply** ([CLAUDE.md](../../CLAUDE.md)): no server, self-hosted assets, files never leave
  the device, licence check for every new dependency.
- **Design files are drawn as they were saved.** Copper pours and zones are shown as last poured or filled. Altium,
  PADS and EAGLE text is drawn with KiCad's stroke font as a stand-in, so it is close but not identical.
- **Formats are recognised by content, not by extension.** `.asc` is PADS or LTspice, `.pcb` is PADS binary or gEDA,
  `.brd` is EAGLE XML, EAGLE binary (before 6.0) or Allegro.
- **A file that cannot be read gets a clear message saying why**, and what to do if there is a way. For example, a PADS
  binary `.pcb`: "export PADS ASCII in PADS Layout (File → Export → .asc)".
- **Conversions carry a warning** that the result may be incomplete or wrong (KiCad export, S9).
- **Phone width and touch work.**
- **No code from GPL projects** (KiCad, altium-toolkit, altium-format) is copied. Their documentation and their programs
  (`kicad-cli`) are fine as references. MIT, BSD, ISC and Apache code may be reused with its notice on `/licenses`.
- **Each card and README entry lists only what works.** Each step updates the card on the main page and the README.

## Formats

| Read | Notes | Step |
| --- | --- | --- |
| Gerber RS-274X and X2 (also Gerber drill files) | Ucamco's specification; X2 attributes give layer functions and, in KiCad's Gerbers, nets, pins and components | S1 |
| Gerber job file (`.gbrjob`) | Layer order, thickness, mask and silkscreen colours, finish | S1 |
| ZIP archives | Of any of these files | S1 |
| Excellon drill | Including files without a header (format guessed, user can correct it) | S2 |
| KiCad `.kicad_pcb` (KiCad 4 to 10), `.kicad_mod` | | S3 |
| Altium `.PcbDoc` (binary and ASCII), binary `.PcbLib` | Through `altiumts` (S5); ASCII `.PcbLib` is not read | S5 |
| PADS ASCII (`.asc`) | PowerPCB V4.0 to current | S6 |
| EAGLE `.brd` (XML, EAGLE 6 to 9, Fusion 360 exports), `.lbr` | Polygons approximated from their outlines (EAGLE stores no pour); libraries with the packages side by side | S7 |
| Pick-and-place file over a Gerber set | KiCad (CSV and `.pos`), Altium, JLCPCB, EAGLE's mount files (`.mnt`, `.mnb`), Fusion 360, other tables by column mapping; recognised by content, also in UTF-16 | S8 |

Not read: PADS binary `.pcb` (closed format; [BL4](../BACKLOG.md)); EAGLE binary (before 6.0); Allegro, OrCAD Layout,
Xpedition, DipTrace, Proteus, EasyEDA and gEDA design files (they all export Gerber); ODB++ (downloading the
specification does not grant a licence to write software for the format, which needs membership of Siemens' ODB++
Solutions Alliance). Maybe later: IPC-2581 ([BL5](../BACKLOG.md)), IPC-D-356 ([BL6](../BACKLOG.md)).

| Export | Step |
| --- | --- |
| PNG: layer view or realistic view, whole board or what is on screen, transparent background as an option | S2 |
| SVG: the same, as vectors | S2 |
| BOM CSV and pick-and-place CSV, from design files | S4 |
| PDF at exactly 1:1 | S8 |
| DXF: board outline and holes for mechanical CAD, or chosen layers | S8 |
| KiCad `.kicad_pcb` from Altium, PADS and EAGLE designs, with a warning | S9 |

Not planned: STEP (needs an Open CASCADE build that writes files; `occt-import-js` only reads), Gerber and drill files
from design files ([BL7](../BACKLOG.md)), 3D view ([BL2](../BACKLOG.md)), revision comparison ([BL3](../BACKLOG.md)).

## Steps

Each step is done by one agent, from reading to commit (see "Running a step").

Status: ✅ done · 🔄 in progress · 📋 planned

| Step | What | Status | Commit |
| --- | --- | :-: | --- |
| [S1](s1.md) | Viewer shell and Gerber | ✅ | 7f75723 |
| [S2](s2.md) | Drill files, realistic view, measuring, PNG and SVG export | ✅ | bf8c4ef |
| [S3](s3.md) | KiCad boards and footprints, design model, stroke font | ✅ | c679764 |
| [S4](s4.md) | Inspect, highlight, search; BOM and pick-and-place export | ✅ | fc5432d |
| [S5](s5.md) | Altium | ✅ | 84130dc |
| [S6](s6.md) | PADS ASCII | ✅ | 5238540 |
| [S7](s7.md) | EAGLE | ✅ | d3a08d4 |
| [S8](s8.md) | PDF and DXF export; pick-and-place CSV over Gerbers | ✅ | aad7e55 |
| [S9](s9.md) | KiCad export | ✅ | bd8f575 |

## Running a step

S1–S9 each ran as one agent, which made every agent's context grow to 600–925k tokens. New work follows
[agent-workflow.md](../agent-workflow.md) instead: steps sized to stay under about 200k tokens, heavy ones split into
research, code and check, and briefs that name the plan sections and files to read rather than everything.

One agent per step, from reading to commit. It:

1. **reads** CLAUDE.md, the sections of this plan its brief names, the code it changes, and where needed the 3D viewer
   (`pages/3d-viewer/main.tsx`, `components/Viewer3D/`) as the closest example of a tool page with a canvas, file
   opening, panels and a phone layout;
2. **does the step's scope.** If something does not fit, it finishes a coherent part and moves the rest to a later step
   or to [BACKLOG.md](../BACKLOG.md);
3. **verifies** (below);
4. **updates** this plan (status table, notes, changes to the model), [BACKLOG.md](../BACKLOG.md), README.md and
   CLAUDE.md where needed;
5. **commits once** on the branch `pcb-viewer`, in the commit style of CLAUDE.md:
   - it stages only its own files; the owner's uncommitted change to `.gitignore` stays out;
   - it restores `next-env.d.ts` after building;
   - it does not push;
6. **reports** what was done, what moved elsewhere, known problems, and what the next step must know.

## Verification

- **Types and build:** `npx tsc --noEmit`, then `npm run build`, then `git checkout -- next-env.d.ts`. Read new code
  against the static-export constraints in CLAUDE.md; a local build does not check them.
- **Look at the result:**
  - Run `npm run dev` (port 3020) and drive the page with `puppeteer-core` or `playwright-core`, using the installed
    Edge (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`) or Chrome
    (`C:\Program Files\Google\Chrome\Application\chrome.exe`).
  - Open test files through the file input, take screenshots and look at them.
  - Keep this tooling in a scratch folder, not in the repo's `package.json`. The owner allows running downloaded
    packages for this work.
  - Headless Edge can also screenshot a single SVG:
    `msedge --headless=new --screenshot=out.png --window-size=1600,1200 file:///C:/…/x.svg`.
  - S1's harness (in its scratch folder `…\scratchpad\pcb\harness\`; recreate it with `npm i puppeteer-core esbuild`
    in an empty folder): `shot.mjs` gives files to `input[type=file]:not([webkitdirectory])`, waits until
    `[role=status]` and `[aria-label="Drawing"]` are gone, and screenshots `div[class*="viewport"]` with the default
    layers, each layer alone (`--layers`, clicking None then one checkbox), the bottom view or a zoom (wheel events);
    `phone.mjs` does 390 × 844 with CDP touch events (pan, pinch); `perf.mjs` times redraws after wheel steps;
    `parse-test.mjs` and `detect-test.mjs` bundle `lib/pcb` with esbuild and run the parser or the recognition in
    Node; `svgshot.mjs` renders `kicad-cli` SVGs to PNG.
  - Ucamco's test files with reference images: `gerber-layer-format-test-files_en.zip` on ucamco.com (Downloads).
- **Compare** with the references in "Test files": `kicad-cli` output, `PCB1_1.pdf`, Linear's PDFs and Gerbers.
- **Phone width:** check a 390 × 844 viewport with touch emulation.

## Format notes

- **Gerber:** Ucamco's "Gerber Layer Format Specification" (free, ucamco.com) is the authority, including its chapter on
  deprecated commands (S1 used revision 2026.05: the image parameters apply in the order MI, SF, OF, IR, and MI and SF
  move coordinates only, not apertures). Ucamco's job file specification covers `.gbrjob`; KiCad writes `SolderPaste`
  and `SolderMask` there where its Gerbers say `Paste` and `Soldermask`. KiCad writes X2 object attributes: 1,271
  `%TO` in the ARTIFICER `F_Cu`. Linear's PADS Gerbers use `%IN`, `%MOIN`, `%FSLAX35Y35`, G74 and G75, coordinates
  without D01 after a D01, and define macros with exposure off (`ANN`, `ODD`, `TER`) without using them.
- **Excellon:** there is no single standard. Ucamco's XNC specification describes a clean subset. Linear's `DRILL.drl`
  starts with `%` and tool lines like `T1C.006F0S0`, with no `M48` header, inch, coordinates like `X02515Y0168`.
- **KiCad:** S-expression file formats at dev-docs.kicad.org (board and footprint). Y points down, so it is negated.
- **Altium:**
  - the types are in `altiumts`'s `dist/index.d.ts`, and KiCad's import-format notes explain the fields;
  - coordinates are in mil (in the ASCII format written as `4249.4417mil`);
  - internal planes are negative;
  - polygon pours are stored as regions and tracks owned by the polygon.
- **PADS ASCII:**
  - Mentor's "PADS Layout ASCII Format Specification" (PADS 9.4: `Ppcb_ASCII.pdf` at www.freecalypso.org; the bare
    host name did not resolve in S6) and KiCad's import-format notes on PADS;
  - the DC2637A file is in the PowerPCB V4.0 format, older than Altium's importer accepts (5.2 and later);
  - the files differ from the specification in places: via thermals (RT, ST) give the outer size before the spoke
    angle, decal thermals the angle first; lines items have no flags field before PADS 2007; a stack can have fewer
    than three lines; arcs of lines and decals are a start corner with start angle, sweep and the box of the circle,
    arcs of pours a centre line with start angle and sweep between two corners (tenths of a degree in both).
- **EAGLE:** XML described by `eagle.dtd` (EAGLE 7.1's copy, CC BY-ND 3.0 for programs that read the format, is in
  openpnp's repository: `src/main/resources/eagle.dtd`; KiCad's import-format notes list the attributes). Polygons
  store only outlines. EAGLE's help on the design rules and the TEXT command (overlines, spin) describe the rest; Fusion
  360's help (Fusion ECAD: design rules, CLI reference) has the newer texts. Coordinates are mm with Y up.
- **Pick-and-place file columns** (S8 reads all of these, `lib/pcb/pnp.ts`):
  - KiCad: `Ref, Val, Package, PosX, PosY, Rot, Side`;
  - Altium: `Designator, Comment, Layer, Footprint, Center-X(mm), Center-Y(mm), Rotation`, …;
  - JLC: `Designator, Mid X, Mid Y, Layer, Rotation`, with the units in the values (`12.5mm`);
  - KiCad's ASCII `.pos`: `## Unit = mm, Angle = deg.`, then `# Ref Val Package PosX PosY Rot Side` as a comment and
    columns separated by blanks; Altium's files start with a preamble (`Units used: mm`) and older ones have `Mid X`,
    `Ref X`, `Pad X` and `TB` in mil (`1234mil`, as EasyEDA, which writes UTF-16 with tabs);
  - EAGLE's `mountsmd.ulp`: no header, `name x y angle value package` separated by blanks, in mm, `.mnt` for the top and
    `.mnb` for the bottom, the centre of the SMDs, bottom angles of the package before mirroring;
  - Fusion 360: `Name,X,Y,Angle,Value,Package` in `PnP_<board>_front.csv` and `_back.csv`, like EAGLE's.
