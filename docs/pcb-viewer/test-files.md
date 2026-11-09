# Test files

Part of the [PCB viewer plan](plan.md).

On the owner's machine. Read them where they are; never copy them into the repo or change them.

| What | Path | Notes |
| --- | --- | --- |
| KiCad Gerber set | `E:\OneDrive - NTNU\ULDAC\PCB\2026_ARTIFICER_TC1\manufacturing\gerbers` | KiCad 10.0.6, X2 with net/pin attributes, `.gbrjob` (6 layers, 1.657 mm, green mask, white silk), PTH and NPTH drills |
| Same set zipped | `…\2026_ARTIFICER_TC1\manufacturing\uploaded\gerbers_v1.zip`, `gerbers_v2.zip` | Two revisions |
| Same board in KiCad | `…\2026_ARTIFICER_TC1\2026_ARTIFICER_TC1.kicad_pcb` | The source of the Gerbers above |
| Its pick-and-place and BOM | `…\2026_ARTIFICER_TC1\manufacturing\assembly\POS.csv`, `BOM.csv` | Made by KiCad from the same board |
| PADS ASCII | `C:\Users\Jonat\Downloads\DC2637A\DC2637A-1_post\DC2637A-1-LAYOUT-ASC.ASC` | `!PADS-POWERPCB-V4.0-BASIC!`, 4 routing layers, pours (HATOUT) included; layers 2 and 3 are mixed planes saved as outlines only (PLANEFLAGS OUTLINE), so their copper is not in the file |
| PADS binary | `…\DC2637A-1_post\DC2637A-1.PCB` | Same design, closed format (`DC2637A-1.txt` is a byte-identical copy) |
| PADS Gerbers | `…\DC2637A-1_post\DC2637A-1-GBR.ZIP` | From the same design: RS-274X `.pho` (L1–L4, TS/TM/TP, BS/BM/BP, FAB), `.rep` reports, `DRILL.drl` without a header (inch) |
| PADS prints, BOM | `…\DC2637A-1_post\DC2637A-1-PDF.ZIP`, `DC2637A-1.XLSX` | References |
| PADS footprint board | `…\DC2637A-1_post\LT3045-1EDD-LIBRARY.ZIP` | `05-08-1725-Rev-A.asc`: a V4.0 board with only the DFN-12 footprint |
| More PADS ASCII | `https://gitlab.com/kicad/code/kicad/-/raw/master/qa/data/pcbnew/plugins/pads/<folder>/<name>.asc` | KiCad's PADS importer test files, each with its LICENSE (MIT, BSD, CERN-OHL-W, GPL-3.0): V5.0 `MAIS_FC`, V2005 `LCORE_2`, V2007 `Dexter_MotorCtrl`, V9.0 `LCORE_4`, V9.4 `Ems4_Rev2` and `MC2_PLUS_REV1`, V9.5 `TMS1mmX19` (basic) and `MC4_PLUS_CSHAPE` (mils), V10.0 `ClaySight_MK1` and `issue23425/controlCARDDockingStation` (250-layer mode), and small ones (`issue*.asc`, `keepout_test.asc`); several folders also hold the binary `.pcb` of the same board ([BL4](../BACKLOG.md)). S6 kept them in its scratch folder. None has a METRIC or INCHES file or a CAM plane |
| Altium ASCII | `C:\Users\Jonat\Downloads\Altium_KERALA_GF130_2026-06-27\KERALA_GF130\v1\PCB1.pcbdoc` | ASCII PcbDoc written by EasyEDA (`gge` ids, the board record in 11 parts on one line, no rules, no text boxes): 2,420 tracks, 376 pads, 714 regions, 5 polygons (not poured), 129 components; an earlier revision of v2. `kicad-cli pcb import` cannot read it |
| Altium binary | `…\KERALA_GF130\v2\PCB1_1.pcbdoc` | Binary PcbDoc (v1 opened and saved by Altium 20 or later): 2,580 tracks, 398 pads, 731 regions, 135 components, 35 rules; text in stroke font and Arial, Arial embedded; 5 polygons not poured; no planes, fills, rounded or octagonal pads, pad or via stacks, inverted text or 3D bodies |
| Altium library | `…\KERALA_GF130\v2\PCB1_1.PcbLib` | One footprint (QFN48_7x7, 41 pads); `altiumts` 0.0.95's `parseAltiumFile` rejects it, its primitive decoders read it record by record (S5) |
| Altium print | `C:\Users\Jonat\Downloads\Altium_KERALA_GF130_2026-06-27\PCB1_1.pdf` | Altium's own print of the v2 board |
| KiCad demos | `C:\Program Files\KiCad\10.0\share\kicad\demos\` | Many boards; `jetson-agx-thor-baseboard` is the large one for speed tests |
| KiCad 4 to 8 boards | `https://gitlab.com/kicad/code/kicad/-/raw/<tag>/demos/<demo>/<demo>.kicad_pcb` | The same demos as saved by the releases 4.0.7, 5.1.12, 6.0.11, 7.0.11 and 8.0.9 (file versions 3, 4, 20171130, 20210722, 20211014, 20221018, 20240108); S3 kept them in its scratch folder |
| KiCad QA boards | `https://gitlab.com/kicad/code/kicad/-/raw/master/qa/data/pcbnew/` | Pad stacks (`padstacks*.kicad_pcb`, `via_stacks`), `custom_pads`, `test_copper_graphics`, `tracks_arcs_vias`, `api_kitchen_sink` (barcodes, tables, text boxes; a KiCad 11 development version) |
| EAGLE 9.5.0, 2 layers | `https://gitlab.com/mutantcybernetics/mutantc-v1/-/raw/master/PCB/main_PCB/mutantC.brd` and `main_gerber_files.zip` beside it (GPL-3.0) | mutantC main board: 51 elements (43 on the bottom, smashed attributes), 2 polygons, 4 holes, octagon and long pads; Gerbers from EAGLE's CAM processor (`CAMOutputs/`) |
| EAGLE 9.3.1, 6 layers | `https://raw.githubusercontent.com/jankae/LibreVNA/13f37c5bf5bc24e1c65d8e11108d4abcfc4cd88d/Hardware/Eagle/VNA.brd` with `Gerber/CAMOutputs/` (GPL-3.0) | LibreVNA: 590 elements (19 on the bottom, angles like R225), 2,853 vias, 134 polygons with ranks 1 to 6 (a GND frame drawn as one polygon with a slit), SMDs with roundness, milled slots, tStop polygons, `VNA.mnt`/`.mnb` (EAGLE's position files); the board is the one the Gerbers of 2022-11-19 were made from |
| EAGLE 6.4, 4 layers | `https://raw.githubusercontent.com/ultimachine/RAMBo/46b47bc42b/board/RAMBo.brd` (the 1.2e commit) and `board/gerbers/RAMBo1-2e.zip` (RAMBo, RepRap) | 266 elements, 1,075 vias, 39 polygons and 82 cutout polygons on 4 layers, net classes with clearances, stop and cream frames that differ from the defaults (20 % and 10 %, a via stop limit of 25 mil); its Gerbers (RS-274X, inch, no X2) are offset by (62.408, 16.873) mm and name the inner layers `.G2L`, `.G3L` (`s7-compare.mjs --align --keys`) |
| Fusion 360 export (9.7.0), 2 layers | `https://raw.githubusercontent.com/stevenbennett/Open-Task-Light/main/Open Task Light/Electronics/Control Board/Source/Control Board.brd`, `control-board-gerbers.zip` and `Assembly/PnP_Control Board_*.csv` (MIT) | Open Task Light control board: 25 elements (5 on the bottom), 1 polygon, TrueType ("custom") fonts, Fusion's design rules; Gerbers from Fusion's CAM |
| EAGLE libraries, binary boards | `https://raw.githubusercontent.com/micropython/pyboard/master/eagle/rcl.lbr` (also `pinhead.lbr`, `pyboard.lbr`); Olimex's `OLINUXINO` repository (`HARDWARE/…/*.brd` are EAGLE 5 binary files) | S7 kept all of these, with `kicad-cli pcb import --format eagle` of the boards, in its scratch folder |

`kicad-cli` 10.0.6 (`C:\Program Files\KiCad\10.0\bin\kicad-cli.exe`) makes reference output: `pcb export
gerbers|drill|svg|pdf|pos|dxf|ipc2581|ipcd356`, `pcb render` (3D picture), and `pcb import --format altium|pads|eagle`,
which turns the Altium, PADS and EAGLE samples into KiCad boards as a second opinion. Write its output to a scratch
folder, never next to the test files.
