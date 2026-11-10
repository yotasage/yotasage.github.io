# yotasage.github.io

My own collection of tools, so I don't have to search other people's websites for one that is good enough, without
ads and bad design.

**Site:** https://yotasage.github.io/

Every tool runs entirely in the browser. There is no server: the site is a static export hosted on GitHub Pages, and
files given to a tool never leave the device.

## Tools

Every tool has a card on the main page ([pages/index.tsx](pages/index.tsx)).

| Tool | Page | What it does |
| --- | --- | --- |
| Simulation setup | [/simsetup/main](https://yotasage.github.io/simsetup/main) | Calculates sampling parameters for FFTs and simulations (f0, FS, Ncyc, Npts and what follows from them), with checks for coherent sampling. |
| QR code generator | [/qrcode/main](https://yotasage.github.io/qrcode/main) | QR Code Model 1 and 2, Micro QR and rMQR with control over every parameter. Exports PNG, JPG, SVG and PDF. |
| PDF tools | [/pdf/main](https://yotasage.github.io/pdf/main) | Merge, compress, images to PDF and remove metadata. Planned tools are in [docs/pdf-tools-plan.md](docs/pdf-tools-plan.md). |
| Base64 image converter | [/base64-image/main](https://yotasage.github.io/base64-image/main) | Image to Base64, a data URL or an HTML, CSS or Markdown snippet (optionally converted to PNG, JPEG or WebP first), and Base64 back to an image to view, download or copy. |
| Text case converter | [/text-case/main](https://yotasage.github.io/text-case/main) | Sentence case, lower case, UPPER CASE, Capitalized Case, Title Case (Chicago or APA), alternating and inverse case, and names for code (camelCase, PascalCase, snake_case, CONSTANT_CASE, kebab-case, Train-Case, dot.case), with character, word and line counts. |
| 3D viewer | [/3d-viewer/main](https://yotasage.github.io/3d-viewer/main) | Views STEP, IGES and BREP (with Open CASCADE), STL, 3MF, AMF, OBJ, PLY, OFF, VTK, glTF/GLB, FBX, Collada, KMZ, 3DS, USD/USDZ, VRML, XYZ, PCD, G-code and MagicaVoxel files. Several files can be opened together and moved apart to compare them. Section view, distance measuring, size, surface area and volume, a parts tree, and saving as STL, OBJ, PLY, GLB or PNG. |
| PCB viewer | [/pcb-viewer/main](https://yotasage.github.io/pcb-viewer/main) | Views the Gerber and drill files of a circuit board (Gerber RS-274X and X2, also the old commands of older files; Excellon with slots and routed holes, also without a header, whose format is then found from the pads; Gerber drill files) or a KiCad board (.kicad_pcb of KiCad 4 to 10, and footprints, .kicad_mod), an Altium board (.PcbDoc, binary and ASCII, and binary footprint libraries, .PcbLib), a PADS ASCII board (.asc of PowerPCB V4.0 to current PADS Layout; a binary .pcb is to be exported as ASCII in PADS) or an EAGLE board (.brd of EAGLE 6 to 9 and the EAGLE files Fusion 360 exports, and libraries, .lbr; a binary .brd from before EAGLE 6 is to be saved as XML), opened as files, a folder or ZIP archives. A pick-and-place file opened with Gerber files (KiCad's CSV and .pos, Altium's, JLCPCB's, EAGLE's .mnt and .mnb, Fusion 360's, or any table whose columns are chosen by hand; recognised by content) marks each part on the board with its rotation and designator, top and bottom, and lists the parts; its units, origin and negated bottom X are fitted to the pads when the file does not say, and can be changed. A KiCad board is drawn as KiCad plots it: pads of every shape with their solder mask and paste openings, tracks, vias, zones as last filled, graphics, text in KiCad's stroke font (or the outlines the file stores for TrueType text) and holes; from a project folder the board file is chosen and copies in backups are left out. An Altium board is drawn with its layer stack and mechanical layers, pad stacks, solder mask and paste openings from the pads and the design rules, vias, tracks, fills, regions, polygons as last poured, internal planes (with clearances and thermal reliefs), board cutouts, and text in the stroke font in the place and size of Altium's own. A PADS board is drawn with its layers from the file's layer data, part decals (outlines, copper of pins, labels), pad stacks (round, square, rounded, annular, oval and rectangular fingers with offsets, drills, slots, plating, solder mask and paste entries), routes with arcs, vias and teardrops, copper pours as last flooded, 2D lines, keep-outs and copper cut-outs, the board outline with its cutouts, and text in the stroke font in the place and size of PADS's own; plane areas whose flood the file does not keep are drawn from their outlines, clear of other nets by the design rules, and CAM planes as negative planes with antipads and thermal reliefs. An EAGLE board is drawn with its layer setup and layers, the packages of its elements placed and mirrored for the bottom, pads and vias sized by the design rules (restring, octagon, long and offset pads, SMD roundness, solder stop and cream masks), wires with arcs, holes, plain items, smashed attribute texts, and text in the stroke font in the place and size of EAGLE's vector font; EAGLE stores no copper for its polygons, so they are drawn from their outlines, clear of other signals by their isolation and the design rules, by rank, without thermal reliefs or the removal of islands. The layers are identified from their X2 attributes, the Gerber job file or their file names (KiCad, Altium, EAGLE, OrCAD, DipTrace, EasyEDA, PADS), and each can be shown, hidden, recoloured, made transparent, reordered or given another type. A realistic view shows the top or the bottom as the board looks (board shape with cutouts, solder mask, finish, silkscreen and holes; colours from the job file, the KiCad stackup or chosen). Pan, zoom and pinch, coordinates in mm or inch, measuring in mm and mil that snaps to pads, holes and line ends, the board size, stackup, components and nets, and saving the view as PNG (on screen or the whole board at a chosen resolution, transparent if wanted) or SVG (vectors at 1:1). The shown layers can be saved as a PDF at exactly 1:1 (all on one page or one page per layer; A4, A3, Letter or a page fitted to the board; seen from the top, the bottom or each layer from its own side; in the layer colours, as on screen or black; with a title, a scale bar and the layers as PDF layers) and as DXF (in mm, each layer on a layer of its own), or the board outline and its holes as DXF for mechanical CAD; layers with clear areas (negative planes, EAGLE polygons, Gerber clear polarity) are flattened with polygon booleans, so both stay vectors. A click or tap says what is there (pad, track, via, zone, hole or component, with its net, component, pin, size, layers and drill; for Gerber files from their X2 attributes, else layer, aperture and size), and clicking again steps through what overlaps there. A net or a component can be highlighted on every layer, also in the realistic view and the saved images, from a click or from searchable lists of components and nets that zoom to it. A KiCad, Altium, PADS or EAGLE board's BOM and pick-and-place file can be saved as CSV, as KiCad writes position files, from the file's origin, the drill/place (KiCad) or board (Altium) origin or the board's corner. An Altium, PADS or EAGLE board can be saved as a KiCad board (.kicad_pcb in KiCad 9's format, which KiCad 9 and 10 open), after a warning that the conversion may be incomplete or wrong and must be checked in KiCad: the layers with their names (mechanical and other layers as user layers), nets, a footprint per component with its pads (every shape, pad stacks, holes and slots, solder mask and paste margins), graphics, texts, reference and value, tracks, arcs and vias (blind, buried and micro too), zones with their saved fill, keep-outs and cut-outs as rule areas, and the board outline; planes whose copper the file does not keep (internal and CAM planes, PADS plane areas, EAGLE polygons) are zones filled with the copper drawn here. Other files are listed with what they are. Plan: [docs/pcb-viewer/plan.md](docs/pcb-viewer/plan.md). |
| Resistor lookup | [/resistor/main](https://yotasage.github.io/resistor/main) | Reads a resistance in any notation (4k7, 4,7 kΩ, 4700, 10m), the marking of a chip resistor (three or four characters, EIA-96, milliohm forms, also upside down) or the colours of 3 to 6 bands from either end, shows every reading when a text has several, and gives the value below, above and nearest in E3 to E192 with signed errors, the colour bands and the SMD markings. Draws the part as an axial resistor with 3 to 6 bands (four body sizes and colours) or as a chip resistor of any size from 01005 to 2512 with its marking (3 digits, 4 digits or EIA-96), in a realistic and a flat style: click a band to choose its colour, read the part from the other end, or type the marking, and the value follows. Saves the drawing as SVG, PNG, JPG or WebP at a chosen width and background, with or without a caption, or copies it. Reference tables (colour code, SMD markings, EIA-96, chip and axial sizes) mark the current value and use what is clicked. Light and dark themes, and every result is a link. Planned steps are in [docs/resistor/plan.md](docs/resistor/plan.md). |

The [/licenses](https://yotasage.github.io/licenses) page, linked from the footer of every page, lists the licences
of the packages the site uses.

## Getting started

Needs Node 22 or newer (GitHub builds with Node 22).

```
npm install      # also copies the pdf.js and 3D viewer files and generates the licence list
npm run dev      # http://localhost:3020, also reachable from a phone on the same network
npm run build    # run before pushing; GitHub runs the same build
```

What these commands do, NVM for Windows and keeping packages up to date: [docs/npm-and-node.md](docs/npm-and-node.md).

## Deployment

Pushing to `main` runs [.github/workflows/nextjs.yml](.github/workflows/nextjs.yml), which builds the site as static
files and publishes them to GitHub Pages. The workflow adds the `output: 'export'` setting itself; the repo has no
`next.config` file. If the build fails, nothing is deployed and the previous version stays online.

## Adding a tool

1. Add the page as `pages/<tool>/main.tsx`, with a link back to the main page (`components/icons/home.tsx`).
2. Add a card for it to the `TOOLS` list in [pages/index.tsx](pages/index.tsx), with an icon in
   [components/Home/ToolIcon.tsx](components/Home/ToolIcon.tsx).
3. Keep the logic in `lib/<tool>/`, components in `components/<Tool>/` and styles in `styles/<Tool>.module.css`.
   Every file under `pages/` becomes a page on the site, so nothing else goes there.
4. Only use what works without a server: no API routes, no `getServerSideProps`, and no libraries, fonts or files
   loaded from a CDN. `getStaticProps` is fine, since it runs when the site is built.
5. Check the licence of any new package (MIT, BSD, Apache-2.0 and ISC are fine; GPL, LGPL and AGPL need a decision
   first).

## Project layout

| Folder | Contents |
| --- | --- |
| `pages/` | One file per page (Next.js Pages Router). `_app.tsx` adds the footer to every page. |
| `components/` | React components, one folder per tool. |
| `lib/` | Logic without React, one folder per tool. `bibtex.ts` and `references.ts` read [references.bib](references.bib). |
| `styles/` | CSS modules, one per tool. |
| `scripts/` | Scripts that run on `npm install`. `scripts/harness/` holds test harnesses with packages of their own, which the site does not use. |
| `public/` | Files served as they are (favicon, icons). `public/pdfjs/` and `public/3d/` are copied from `node_modules` on install. |
| `docs/` | Notes and plans. |

Sources cited on the site are in [references.bib](references.bib); the comment at the top of the file explains how
to cite them from a page.
