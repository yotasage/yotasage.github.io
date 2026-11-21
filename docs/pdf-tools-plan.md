# PDF tools – plan

A collection of PDF tools at [`/pdf/main`](../pages/pdf/main.tsx) that run entirely in the browser, so the site keeps
working as a static export on GitHub Pages. Files never leave the user's device, and there are no ads, accounts or
limits other than the device's memory.

The goal is to cover the useful parts of [PDF24 Tools](https://tools.pdf24.org/en/) and
[iLovePDF](https://www.ilovepdf.com/) over time, starting with a small set and adding tools in phases.

## Ground rules

- **No server.** Everything is client-side JavaScript or WebAssembly. Tools that need a server (fetching web pages,
  AI services, cloud storage) are out of scope unless they can be done with a direct browser-to-service connection.
- **Self-hosted assets.** Libraries, workers, fonts and wasm files are served from this site and not from a CDN.
  The pdf.js worker and data files are copied into `public/pdfjs/` by `scripts/copy-pdfjs-assets.mjs` on
  `npm install` / `npm ci` (git ignores the folder). QuickJS is left out, since scripts in PDFs are never run.
- **Licences are shown on the site.** `scripts/collect-licenses.mjs` runs on install and gathers the licence of every
  package the site imports, with their runtime dependencies and the pdf.js data files, into
  `lib/generated/third-party-licenses.json`. The `/licenses` page, linked from the footer of every page, shows it.
  Check the licence of a new dependency before adding it: permissive licences (MIT, BSD, Apache-2.0, ISC) are fine;
  copyleft ones (GPL, AGPL) need a decision first.
- **Same layout for every tool** (as on the reference sites): the hub shows a button (tile) per tool; each tool opens
  with a large drop zone, then shows the files as thumbnail cards next to an options sidebar with one big action
  button and a download button for the result.
- **Lossless by default.** Change only what the tool is about. For example, images are embedded without re-encoding and
  compression keeps text selectable unless the user asks for rasterizing.

## Architecture

| Part | Location | Notes |
| --- | --- | --- |
| Tool registry (hub tiles) | `lib/pdf/tools.ts` | Add a `PdfTool` entry here for each new tool. |
| Hub page | `pages/pdf/main.tsx` | Grid of tool buttons. |
| Tool pages | `pages/pdf/<tool>.tsx` | One static page per tool. |
| Shared UI | `components/PdfTools/` | `PdfPage` (frame), `ToolWorkspace` (drop zone → files + sidebar), `FileGrid`/`FileCard` (sortable thumbnail cards), `ToolIcon`. |
| Styles | `styles/PdfTools.module.css` | Form fields reuse `components/QrGen/fields.tsx` and `styles/QrGen.module.css`. |
| PDF logic | `lib/pdf/` | Framework-free functions, one module per tool, plus `files.ts` (download, ZIP, names) and `pdfjs.ts` (lazy pdf.js, page rendering, thumbnails). |

Libraries:

| Library | Use | Licence |
| --- | --- | --- |
| [`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib) | Read, modify and write PDFs. A maintained fork of pdf-lib with the same API, plus encryption and decryption (needed for Protect/Unlock). | MIT |
| [`pdfjs-dist`](https://github.com/mozilla/pdf.js) | Render pages (thumbnails, rasterizing, PDF to image), extract text. | Apache-2.0 |
| [`fflate`](https://github.com/101arrowz/fflate) | ZIP downloads, deflate/inflate of PDF streams. | MIT |

Candidates for later phases: `tesseract.js` (OCR, Apache-2.0), a Ghostscript wasm build (PDF/A, stronger
compression), `docx` (writing Word files, MIT), LibreOffice wasm (Office to PDF; very large download, research needed;
MPL-2.0).

**Ghostscript is AGPL-3.0** (or a paid commercial licence from Artifex). Serving it from the site counts as conveying
it, so its complete corresponding source must be offered to every user. Whether the page code that loads it then
counts as a combined work that must also be AGPL is not settled for wasm loaded by a web page. Before adopting it,
decide whether the site's own code may be released under AGPL, and keep Ghostscript as an optional, separately loaded
module with a link to its source. qpdf (Apache-2.0) avoids the question for linearization and repair.

## Feature list

Status: ✅ done · 🔜 next phase · 📋 planned · 🔬 needs research · ❌ not possible without a server

### Phase 1 – first tools (done)

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| Merge PDF | ✔ | ✔ | ✅ | pdf-lib `copyPages`. Drag-and-drop ordering, sorting by name, page ranges per file (`1-3, 5, 8-`, reversed `5-1`). |
| Compress PDF | ✔ | ✔ | ✅ | Four levels (lossless / recommended / strong / custom DPI and quality). Removes unreachable objects, re-deflates streams at level 9, writes object streams, downsamples and re-encodes RGB/grey images as JPEG, and keeps the original if the result is not smaller. Optional: rasterize every page, remove metadata. Several files at once, ZIP download. |
| Images to PDF (JPG/PNG/WebP/GIF/BMP/SVG/AVIF to PDF) | ✔ | ✔ | ✅ | JPEG and PNG are embedded unchanged; other formats go through a canvas. EXIF orientation is honoured without re-encoding. Page size (image, A3–A5, Letter, Legal), orientation, margin, fit or actual size at a DPI, per-image rotation, one PDF or one PDF per image (ZIP). |
| Remove metadata / anonymize | ✔ (remove metadata) | – | ✅ | `lib/pdf/sanitize.ts`. Inspects each file and lists what it found: document properties, XMP, document ID, photo EXIF/GPS/XMP/IPTC inside JPEGs, comment authors and dates, digital signatures, page thumbnails, application private data (PieceInfo), JavaScript and risky actions, attachments, comments, form values, earlier revisions and unused objects. Presets *Metadata only*, *Anonymize* (everything except visible content) and *Maximum* (also attachments, comments, form values), or custom. JPEG metadata is removed without re-encoding (`lib/pdf/jpeg.ts`). The cleaned file is inspected again to confirm. Optional neutral output file names. |

### Phase 2 – organize pages (done; pdf-lib and pdf.js only)

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| Split PDF | ✔ | ✔ | ✅ | By ranges / click split points, every N pages, target file size, or top-level bookmarks (`lib/pdf/split.ts`). Single PDF or ZIP download. |
| Remove pages | ✔ | ✔ | ✅ | Page thumbnail grid (`components/PdfTools/PageGrid.tsx`); click, Shift-click, odd/even, or type ranges. |
| Extract pages | ✔ | ✔ | ✅ | Same UI as Remove pages with the selection inverted. One PDF or one PDF per page (ZIP). |
| Organize / rearrange pages | ✔ | ✔ | ✅ | Grid of every page from one or more PDFs; drag/touch reorder, rotate, delete, duplicate, insert blank pages, reverse, undo/redo. Shared grid (`PageGrid`) used by Remove, Extract and Rotate. |
| Rotate PDF | ✔ | ✔ | ✅ | Set `/Rotate` in-place per page, for selected pages, or for all pages (keeps bookmarks and metadata). |
| PDF to images (JPG/PNG) | ✔ | ✔ | ✅ | Render all or selected pages with pdf.js at a chosen DPI (72/150/300/custom) and JPEG quality (`lib/pdf/pdfToImages.ts`); single image or ZIP download. |
| Extract images & vectors | ✔ | ✔ (as PDF to JPG option) | ✅ | Three-tab workspace (`pages/pdf/extract-images.tsx`, `components/PdfTools/VectorTabs.tsx`, `components/PdfTools/FigureCanvas.tsx`): **Raster images** walks page and Form XObject image resources (`lib/pdf/extractImages.ts`, verbatim JPEGs & lossless PNGs via `lib/pdf/imageDecode.ts`), **Embedded vectors** extracts `/Subtype /Form` XObjects as lossless standalone `.pdf`s (`lib/pdf/extractVectors.ts`) and editable `.svg`s (`lib/pdf/pdfToSvg.ts`), and **Detect & crop figures** auto-detects inline vector drawings (`lib/pdf/detectFigures.ts`) or lets users draw/resize/tighten boxes on a page canvas and export as `.svg`, lossless cropped `.pdf`, or high-DPI `.png` (single or ZIP). |
| Read PDF | ✔ (PDF Reader) | – | ✅ | Full client-side viewer (`pages/pdf/reader.tsx`, `components/PdfTools/PdfReader.tsx`, `lib/pdf/reader.ts`): virtualised HiDPI canvas rendering with bounded canvas memory, selectable text layer, Ctrl+F in-document search with `<mark>` highlights, collapsible sidebar (lazy thumbnails, nested table of contents, document info + *Continue with…* handoff), continuous / single / two-page layouts, zoom presets, view rotation, dark-mode reading paper, print, download, fullscreen, keyboard shortcuts, and encrypted PDF unlock. |
| Add blank pages / insert PDF into PDF | ✔ | – | ✅ | Built into Organize pages (`+ Blank page`, per-page `+`, and `+ Add PDFs`). |

### Phase 3 – edit and annotate (done; pdf-lib, pdf.js and fflate only)

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| Add page numbers | ✔ | ✔ | ✅ | Rotation-aware vector page numbering (`lib/pdf/pageNumbers.ts`, `pages/pdf/page-numbers.tsx`) with live preview, 6 positions, format templates (`{n}`, `{total}`, `{page}`, `{pages}`), standard fonts, colour/opacity, margins, start number, page range, skip first page, and duplex odd/even mirroring. |
| Add watermark | ✔ | ✔ | ✅ | Rotation-aware single or tiled text and image watermarks (`lib/pdf/watermark.ts`, `pages/pdf/watermark.tsx`) with live SVG overlay preview, over or under page content, 9-point anchor or tile gaps, opacity, rotation, and page range. |
| Crop PDF | ✔ | ✔ | ✅ | Visual `/CropBox` cropping (`lib/pdf/crop.ts`, `components/PdfTools/CropCanvas.tsx`, `pages/pdf/crop.tsx`) with drag-to-draw/move/8-handle resize, keyboard nudging, trim presets, exact point margins, rotation-aware boxes, per-page or range scopes, and reset to MediaBox. |
| Resize pages / scale to paper size | ✔ | – | ✅ | Vector-preserving `embedPage` resizing (`lib/pdf/resize.ts`, `pages/pdf/resize.tsx`) with A3–A5/Letter/Legal/Tabloid/custom sizes (mm/in/pt), auto/portrait/landscape orientation, fit/fill/stretch/center scaling modes, margins, live SVG layout diagram, and batch ZIP export. |
| Pages per sheet (N-up) and booklet | ✔ | – | ✅ | Vector-preserving N-up grid imposition (2/4/6/9/16/custom, 4 reading orders) and saddle-stitch duplex booklet imposition (`lib/pdf/nup.ts`, `pages/pdf/nup.tsx`) with LTR/RTL binding, short/long-edge duplex flip, fold marks, borders, and live sheet diagrams. |
| Edit metadata | ✔ | – | ✅ | Read and write Title, Author, Subject, Keywords, Creator, Producer, Creation/Mod dates, and custom Info dictionary properties (`lib/pdf/metadata.ts`, `pages/pdf/edit-metadata.tsx`), with optional stale XMP stream removal and post-save verification. |
| Protect PDF (password) | ✔ | ✔ | ✅ | `@cantoo/pdf-lib` AES-256 and AES-128 encryption (`lib/pdf/security.ts`, `pages/pdf/protect.tsx`) with user/owner passwords, granular permissions (printing, modifying, copying, annotating, forms, accessibility, assembly), and batch ZIP export. |
| Unlock PDF | ✔ | ✔ | ✅ | Inspect encryption state and remove user/owner password protection and restrictions (`lib/pdf/security.ts`, `pages/pdf/unlock.tsx`) with shared or per-file passwords and batch ZIP export; encrypted input is also supported across all other tools via `PasswordPrompt`. |
| Flatten PDF (forms and annotations) | ✔ | – | ✅ | Bakes AcroForm fields (`form.flatten()`) and visual annotations via their `/AP /N` Form XObject appearance streams (`lib/pdf/annotations.ts`, `pages/pdf/flatten.tsx`), preserving clickable links and skipping annotations without appearance streams safely. |
| Fill PDF forms | ✔ | – | ✅ | AcroForm inspector & filler (`lib/pdf/forms.ts`, `components/PdfTools/FormFiller.tsx`, `pages/pdf/fill-forms.tsx`) supporting text, multiline, checkbox, radio, dropdown, and option-list fields with `/CropBox`/`/Rotate` canvas overlays, synchronized mobile-friendly sidebar panel, and optional flattening. |
| Sign PDF (visual signature) | ✔ | ✔ | ✅ | Three-mode `SignaturePad` (freehand Draw, Type in 4 styles, Upload with light-background removal), HiDPI `SignCanvas` with click-to-place, drag, aspect-preserving corner resize, inline text/date stamps, undo/redo, apply-to-all-pages, and deduplicated embedding (`lib/pdf/sign.ts`, `pages/pdf/sign.tsx`). |
| Edit PDF (add text, shapes, images, highlights) | ✔ | ✔ | ✅ | Lossless vector/text/image editing engine (`lib/pdf/editPdf.ts`) and interactive HiDPI SVG/HTML editor (`components/PdfTools/PdfEditor.tsx`, `pages/pdf/edit.tsx`) supporting word-wrapped text with optional whiteout fill, Multiply-blended highlights, rectangles, ellipses, lines, arrows, freehand ink, deduplicated images, zoom presets, and undo/redo. |
| Remove annotations | ✔ | – | ✅ | Inspects every `/Subtype` across pages and selectively removes annotations by preset (*All*, *Comments & markup*, *Links only*, or custom subtype checkboxes) and optional page range (`lib/pdf/annotations.ts`, `pages/pdf/remove-annotations.tsx`). |
| Grayscale PDF | ✔ | – | ✅ | Lossless BT.709 content-stream colour operator rewriting + raw/JPEG image conversion keeping text selectable and vectors crisp (`lib/pdf/color.ts`, `lib/pdf/colorRaster.ts`, `pages/pdf/grayscale.tsx`), with live before/after preview, conversion statistics, rasterize fallback, and batch ZIP export. |
| Invert colours / dark mode PDF | ✔ | – | ✅ | Instant live-preview dark-mode transformation (`lib/pdf/color.ts`, `lib/pdf/colorRaster.ts`, `pages/pdf/invert.tsx`) with *Smart dark mode* (hue preservation), *Warm dark*, *Classic invert*, and *Custom colours* presets, DPI/format/quality/page-range options, and batch ZIP export. |

### Phase 4 – heavier processing (WebAssembly)

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| OCR (searchable PDF) | ✔ | ✔ | 📋 | `tesseract.js` with self-hosted language data; invisible text layer on top of each page image. Download each language only when the user selects it. |
| Redact PDF | ✔ | ✔ | 📋 | Draw boxes or search for text; real removal by rasterizing the affected pages (content stream editing later). |
| Compare PDFs | ✔ | ✔ | 📋 | Text diff from pdf.js text content plus a visual overlay or pixel diff per page. |
| Repair PDF | ✔ | ✔ | 📋 | Re-save through the tolerant pdf-lib parser; rebuild from pdf.js rendering as a fallback. |
| PDF to PDF/A | ✔ | ✔ | 🔬 | Needs an output intent, XMP metadata and embedded fonts. Ghostscript wasm is the most realistic route. |
| Optimize for web (linearize) | ✔ | – | 🔬 | No JS library linearizes; would need qpdf or Ghostscript wasm. |
| Stronger compression | ✔ | ✔ | 📋 | See [Compression improvements](#compression-improvements). |

### Phase 5 – conversions to and from other formats

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| PDF to text | ✔ | – | 📋 | pdf.js `getTextContent`, with lines reassembled from positions. |
| PDF to Word (.docx) | ✔ | ✔ | 🔬 | Text and images with positions from pdf.js, written with `docx`. Good for text-heavy documents, weak for complex layouts. |
| PDF to Excel | ✔ | ✔ | 🔬 | Table detection from text positions; output with a small XLSX writer. |
| PDF to PowerPoint | ✔ | ✔ | 🔬 | A slide per page with the page as an image (plus text boxes later). |
| PDF to HTML / ePub | ✔ | ✔ (HTML) | 🔬 | – |
| Word / Excel / PowerPoint to PDF | ✔ | ✔ | 🔬 | Only LibreOffice in wasm gives good fidelity (tens of MB). Check size and load time before committing. |
| Text / Markdown to PDF | ✔ | – | 📋 | Lay out with pdf-lib and embedded fonts. |
| HTML file to PDF | ✔ | ✔ | 🔬 | Possible for local HTML files through an iframe and the browser's print dialog only. |
| Scan to PDF (camera) | – | ✔ | 📋 | `getUserMedia` capture, edge detection and perspective correction, then Images to PDF. |

### Not planned (need a server)

| Tool | Why |
| --- | --- |
| Web page (URL) to PDF | Browsers cannot fetch arbitrary sites (CORS). |
| AI summarize / chat with PDF / translate | Needs an external AI service and API key. |
| Google Drive / Dropbox import and export | Needs registered app keys; possible client-side later if wanted. |

## Cross-cutting improvements

- **Web Worker for heavy work.** ✅ Implemented (`lib/pdf/worker.ts` + `lib/pdf/workerClient.ts`, with automatic main-thread fallback). Offloads pdf-lib merge, lossless compression, metadata inspection/editing/sanitization, password security, annotation removal/flattening, page numbering, watermarking, cropping, resizing, N-up/booklet imposition, lossless grayscale, form inspection/filling, visual signing, PDF editing, page rotation/removal/extraction/reorganization, split, image extraction, and size breakdown off the main thread while keeping canvas/pdf.js rendering on the main thread.
- **Encrypted input.** ✅ Implemented (`components/PdfTools/PasswordPrompt.tsx` and `isPasswordError` in `lib/pdf/files.ts`). All PDF-accepting tools prompt for a password and decrypt with `@cantoo/pdf-lib` / pdf.js instead of rejecting encrypted files.
- **Chain tools.** ✅ Implemented (`lib/pdf/handoff.ts` + `components/PdfTools/ContinueWith.tsx`). "Continue with…" buttons on PDF-producing results pass output bytes directly to the next tool in memory (e.g. Merge → Compress → Remove metadata without downloading and re-selecting).
- **Merge:** keep the sources' bookmarks and add a bookmark per file; allow images in the merge list.
- **Touch reordering & bulk page selection.** ✅ Implemented in `components/PdfTools/PageGrid.tsx`: pointer/arrow reordering alongside drag and drop, plus Shift-click / range / odd-even selection.
- **Thumbnail virtualisation & canvas cleanup.** ✅ Implemented in `lib/pdf/thumbs.ts` and `components/PdfTools/PageGrid.tsx`: lazy `IntersectionObserver` rendering, LRU Blob URL eviction, and `page.cleanup()`.
- **PDF size breakdown (inspector).** ✅ Implemented (`lib/pdf/breakdown.ts`), surfaced inside Compress PDF to show how each file's bytes split across images, fonts, page content, metadata/attachments, and structure before compressing.
- **Remember options** per tool in `localStorage`.
- **Theme & shared form controls.** Form fields currently reuse `components/QrGen/fields.tsx` and
  `styles/QrGen.module.css`; the site-wide [UX polish plan](ux-polish/plan.md) moves these to shared light/dark themed
  components (`ToolShell` and `components/ui/Fields.tsx`).
- **Offline use / PWA.** A service worker would make every tool work offline once loaded.
- **Verification harness (`scripts/harness/pdf/`).** ✅ Implemented (`fixtures.mjs`, `check.mjs`, `ui.mjs`). Generates synthetic test PDFs in Node with `@cantoo/pdf-lib` and `fflate` (multi-page, embedded JPEG/RGBA PNG, Form XObject vectors, inline vector figures with background/rule/prose, metadata/EXIF, rotated pages, bookmarks, reader fixture, annotated/fillable forms, color/image fixture, compressible streams, encrypted) and verifies all framework-free `lib/pdf/*` modules (**28 Node checks**) plus headless Edge/Chrome interactive flows across **all 27 PDF tools** (390px phone overflow checks, interactive E2E flows for every Phase 1–3 tool, vector/figure extraction, Read PDF reader/outline/search/handoff, encrypted unlock, and zero console/page/network/third-party errors). Re-run when bumping `pdfjs-dist` (`BL203`).

## Module map

### `lib/pdf/`
- `annotations.ts` — Annotation subtype inspection (`inspectAnnotations`), selective removal by subtype/page range (`removeAnnotations`), and AcroForm/appearance-stream flattening (`flattenPdf`).
- `breakdown.ts` — Estimates how a PDF's bytes split across images, fonts, page content, metadata/attachments, and structure.
- `color.ts` — DOM-free lossless BT.709 PDF grayscale conversion (`grayscalePdf` rewriting content-stream colour operators and raw/indexed image streams) and pure RGBA dark-mode/invert/custom-colour pixel transforms (`transformRgbaPixels`).
- `colorRaster.ts` — Browser pdf.js/Canvas raster color transform pipeline (`rasterTransformPdf`) for grayscale and dark-mode PDFs plus JPEG-to-grayscale decoder/re-encoder (`createBrowserJpegToGrayConverter`).
- `compress.ts` — Lossless stream re-deflation, unused-object removal, image downsampling/recompression, and optional rasterization.
- `crop.ts` — Visual page box inspection (`getPageBoxes`) and rotation-aware `/CropBox` cropping and MediaBox reset (`cropPdf`).
- `detectFigures.ts` — Spatial operator/text indexer (`analyzePageVectors`), inline vector figure clustering (`detectFiguresOnPage`) ignoring page backgrounds/borders/rules/prose, and tighten-to-content snapping (`tightenRegionToContent`).
- `editPdf.ts` — Lossless vector/text/image editing engine (`applyEdits`, `computeArrowGeometry`) supporting word-wrapped text with optional whiteout background, Multiply-blended highlights, rectangles, cubic-Bezier ellipses, lines, arrows, freehand ink strokes, and deduplicated images across `/CropBox` and `/Rotate`.
- `extractImages.ts` — Extracts embedded JPEGs verbatim and raw/indexed/SMask image streams as lossless PNGs.
- `extractVectors.ts` — Extracts qualifying `/Subtype /Form` XObjects as lossless standalone single-page PDFs (`extractFormXObjects`) and crops arbitrary viewport rectangles into lossless vector PDFs (`extractRegionAsPdf`, `extractRegionsAsPdfs`), accounting for `/CropBox` and `/Rotate`.
- `files.ts` — File I/O, downloads, ZIP bundling (`fflate`), safe filenames, password-error detection, and formatting helpers.
- `forms.ts` — AcroForm field inspection (`inspectFormFields`) with `/CropBox`/`/Rotate` visual widget geometry and `/Annots` page fallback, plus form filling and optional flattening (`fillFormPdf`).
- `handoff.ts` — In-memory transfer buffer for passing generated PDFs between tools via *Continue with…*.
- `imageDecode.ts` — Shared raw PDF image stream decoding, PNG/TIFF predictor reversal, colour-space inspection, and pure-JS RGBA→PNG encoding.
- `images.ts` — Images-to-PDF conversion with lossless JPEG/PNG embedding, EXIF orientation, paper sizes, margins, and DPI scaling.
- `jpeg.ts` — Reads and strips JPEG metadata segments (EXIF, XMP, IPTC, comments, trailing data) without re-encoding image scans.
- `merge.ts` — Page range parser (`parsePageRanges`) and multi-PDF merging via `copyPages`.
- `metadata.ts` — Standard Info dictionary, ISO date, and custom property reader (`readPdfMetadata`) and writer (`writePdfMetadata`) with optional stale XMP removal.
- `nup.ts` — Multi-page N-up sheet imposition (`nupPdf`) and saddle-stitch duplex booklet ordering and imposition (`computeBookletOrder`, `bookletPdf`).
- `objects.ts` — Low-level pdf-lib object graph traversal (`walkDicts`), filter/name/text helpers, and unreachable-object removal.
- `pageNumbers.ts` — Rotation-aware vector page numbering (`addPageNumbers`) with format templates, fonts, margins, page ranges, cover skipping, and duplex odd/even mirroring.
- `pages.ts` — Page range formatting, multi-source page builder (`buildPdfFromPages`), in-place rotation, removal, and extraction.
- `pdfjs.ts` — Lazy `pdfjs-dist` loader (self-hosted worker/cmaps/fonts), page rendering, and card thumbnails.
- `pdfToImages.ts` — Renders all or selected PDF pages via pdf.js into JPG or lossless PNG images at a chosen DPI.
- `pdfToSvg.ts` — Converts PDF pages, Form XObjects, and cropped viewport regions into standalone editable SVGs (`pdfPageRegionToSvg`, `pdfBytesToSvg`) supporting paths, colors, opacity, clip paths, embedded images, and text labels.
- `reader.ts` — Framework-free PDF reader helpers: nested outline extraction (`readOutlineTree`), document metadata (`readDocInfo`), positioned text layout (`extractPageTextLayout`), search text extraction & matching (`findTextMatches`, `splitItemWithMatches`), and link annotation mapping (`extractPageLinks`).
- `resize.ts` — Vector-preserving paper resizing (`resizePdf`, `RESIZE_PRESETS`, `toPoints`) via `embedPage` with fit, fill, stretch, and center scaling modes.
- `sanitize.ts` — Metadata and hidden-data inspector (`inspectPdf`) and cleaner (`cleanPdf`) with *Metadata only*, *Anonymize*, and *Maximum* presets.
- `security.ts` — Encryption inspection (`inspectSecurity`), AES-256/AES-128 password protection with granular permissions (`protectPdf`), and decryption (`unlockPdf`).
- `sign.ts` — Visual signature and text stamp embedding (`applySignatures`) with `assetId` image deduplication and `/CropBox`/`/Rotate` coordinate mapping.
- `split.ts` — Range-group, every-N, breakpoint, top-level bookmark, and target-size PDF splitting.
- `thumbs.ts` — Lazy page-thumbnail pool (`PdfThumbPool`) with concurrency control, LRU Blob URL eviction, and `page.cleanup()`.
- `tools.ts` — Central `PdfTool` registry and categories powering `/pdf/main` and *Continue with…* navigation (27 tools).
- `watermark.ts` — Rotation-aware single and tiled text/image watermarking (`addWatermark`) over or under page content streams.
- `worker.ts` — Dedicated Web Worker executing heavy pdf-lib jobs off the main thread.
- `workerClient.ts` — Typed RPC client for `worker.ts` with progress callbacks and automatic main-thread fallback.

### `components/PdfTools/`
- `ContinueWith.tsx` — *Continue with…* bar handing generated PDFs in memory to other PDF tools.
- `CropCanvas.tsx` — Interactive HiDPI PDF page canvas with drag-to-draw, move, 8-handle resize, rule-of-thirds guides, and keyboard nudging for visual `/CropBox` cropping.
- `FigureCanvas.tsx` — Interactive HiDPI PDF page canvas with drag-to-draw, move, 8-handle resize, tighten, keyboard nudging, and deletion for figure crop boxes.
- `FileGrid.tsx` — Sortable/static file thumbnail grid (`FileGrid`) and `FileCard` for multi-file tools.
- `FormFiller.tsx` — Interactive AcroForm workspace overlaying live form controls on rendered PDF pages synchronized with a filterable sidebar fields panel.
- `PageGrid.tsx` — Virtualised page thumbnail grid (`PageGrid`), drag/touch/arrow reordering, split-cut indicators, and bulk `PageSelectionBar`.
- `PasswordPrompt.tsx` — Inline password prompt for unlocking encrypted PDFs.
- `PdfEditor.tsx` — Interactive HiDPI SVG/HTML page editor canvas supporting text boxes (with inline editing), highlights, shapes, lines/arrows with endpoint handles, freehand ink, and images.
- `PdfReader.tsx` — Full client-side PDF reader component (toolbar, Ctrl+F search bar, collapsible Thumbnails/Contents/Info sidebar, virtualised page canvas/text/link layers, print, fullscreen, dark paper mode).
- `SignaturePad.tsx` — Three-tab signature creator (freehand Draw with stroke smoothing, Type in 4 styles, Upload with light-background removal) exporting trimmed transparent PNGs.
- `SignCanvas.tsx` — Interactive HiDPI page canvas for click-to-place signatures/stamps, dragging, aspect-preserving corner resizing, inline text editing, and keyboard nudging.
- `ToolIcon.tsx` — Inline SVG icons for all 27 PDF tool tiles and workspace headers.
- `ToolPage.tsx` — Shared page frame (`PdfPage`), drop-zone/sidebar layout (`ToolWorkspace`), file picker button, and progress indicator (`Progress`).
- `VectorTabs.tsx` — Embedded vectors (Form XObjects) and Detect & crop figures panels, sidebars, and SVG/PDF/PNG export orchestration for `/pdf/extract-images`.

### `styles/`
- `PdfTools.module.css` — Shared workspace, card grid, tab bar, interactive figure-crop/crop/form/sign/edit canvas, and responsive phone styles.
- `PdfReader.module.css` — Reader shell, toolbar, search bar, collapsible sidebar, text/link overlay, and dark-mode reading styles.

### `pages/pdf/`
- `main.tsx` — Hub page listing all 27 PDF tools grouped by category.
- `reader.tsx` — Read PDF viewer with encrypted-input unlock and *Continue with…* handoff support.
- `merge.tsx`, `split.tsx`, `organize.tsx`, `rotate.tsx`, `remove-pages.tsx`, `extract-pages.tsx` — Organize tools.
- `compress.tsx` — Compress PDF with pre-compression size breakdown.
- `edit.tsx`, `sign.tsx`, `fill-forms.tsx`, `page-numbers.tsx`, `watermark.tsx`, `crop.tsx`, `resize.tsx`, `nup.tsx`, `grayscale.tsx`, `invert.tsx`, `edit-metadata.tsx`, `flatten.tsx`, `remove-annotations.tsx` — Edit & annotate tools.
- `images-to-pdf.tsx`, `pdf-to-images.tsx`, `extract-images.tsx` — Image & vector conversion and extraction tools.
- `protect.tsx`, `unlock.tsx`, `remove-metadata.tsx` — Security & metadata sanitization tools.

### `scripts/harness/pdf/`
- `package.json` — Isolated harness package (`playwright-core`, `tsx`, `check` and `ui` scripts; not part of the site).
- `fixtures.mjs` — Synthetic in-memory PDF (multi-page, images, Form XObjects, inline vectors, metadata/EXIF, rotated, bookmarked, reader, annotated/fillable forms, color/image, compressible, encrypted), RGBA PNG, and EXIF JPEG generators.
- `check.mjs` — Node verification suite (`npm run check`, 28 checks) for all framework-free `lib/pdf/*` modules.
- `ui.mjs` — Headless Edge/Chrome Playwright suite (`npm run ui`, 31 checks) covering `/pdf/main` and all 27 routes, 390px phone overflow checks, interactive E2E flows for every Phase 1–3 tool, vector/figure extraction, Read PDF, encrypted unlock, and zero console/page/network/third-party errors.

## Phase 2 & vector/reader execution history (complete)

All Phase 2, vector extraction, and PDF reader steps completed using only `@cantoo/pdf-lib`, `pdfjs-dist`, and `fflate` (zero new dependencies):

| Step | Scope | Status |
| --- | --- | :-: |
| P2.1 | Shared virtualised `PageGrid` component (lazy thumbnails, Shift/range/odd-even select, touch-friendly reorder) + **Rotate PDF** and **Remove / Extract pages** | ✅ |
| P2.2 | **Organize / rearrange pages** (multi-PDF page grid, reorder, rotate, delete, duplicate, insert blank pages) | ✅ |
| P2.3 | **Split PDF** (by ranges, every N pages, target size, or top-level bookmarks; ZIP output) | ✅ |
| P2.4 | **PDF to images** (JPG/PNG at chosen DPI, ZIP) and **Extract images** (lossless JPEG extraction + PNG re-encode, reusing `lib/pdf/imageDecode.ts`) | ✅ |
| P2.5 | Cross-cutting polish: Web Worker for heavy PDF jobs, encrypted-input password prompt, in-memory *"Continue with…"* tool chaining, size breakdown inspector, and `scripts/harness/pdf/` verification harness | ✅ |
| V1 | Core vector extraction & figure detection engines (`lib/pdf/extractVectors.ts`, `lib/pdf/pdfToSvg.ts`, `lib/pdf/detectFigures.ts`) | ✅ |
| V2 | **Extract images & vectors** 3-tab UI upgrade (`pages/pdf/extract-images.tsx`, `components/PdfTools/VectorTabs.tsx`, `components/PdfTools/FigureCanvas.tsx`) | ✅ |
| R1 | **Read PDF** client-side viewer (`lib/pdf/reader.ts`, `components/PdfTools/PdfReader.tsx`, `styles/PdfReader.module.css`, `pages/pdf/reader.tsx`) | ✅ |
| V3 | Verification harness & docs QA (`scripts/harness/pdf/*`, `docs/pdf-tools-plan.md`) covering Form XObjects, SVG conversion, region cropping, inline figure auto-detection/drag-a-box, and Read PDF | ✅ |

## Phase 3 execution history (complete)

All 15 Phase 3 edit, annotate, layout, colour, form, signature, and security tools completed using only `@cantoo/pdf-lib`, `pdfjs-dist`, and `fflate` (zero new dependencies):

| Step | Scope | Status |
| --- | --- | :-: |
| P3.1 | Engine Pack A (`lib/pdf/security.ts`, `metadata.ts`, `annotations.ts`, `pageNumbers.ts`, `watermark.ts`), Web Worker RPC wiring, and Node harness checks 16–20 | ✅ |
| P3.2 | UI Pack A: **Protect PDF** (`/pdf/protect`), **Unlock PDF** (`/pdf/unlock`), **Edit metadata** (`/pdf/edit-metadata`), **Remove annotations** (`/pdf/remove-annotations`), and **Flatten PDF** (`/pdf/flatten`) | ✅ |
| P3.3 | Engine Pack B (`lib/pdf/crop.ts`, `resize.ts`, `nup.ts`, `color.ts`, `colorRaster.ts`), Web Worker RPC wiring, and Node harness checks 21–25 | ✅ |
| P3.4 | UI Pack B: **Crop PDF** (`/pdf/crop` + `CropCanvas.tsx`), **Add page numbers** (`/pdf/page-numbers`), **Add watermark** (`/pdf/watermark`), **Resize pages** (`/pdf/resize`), and **Pages per sheet & booklet** (`/pdf/nup`) | ✅ |
| P3.5 | UI Pack C: **Grayscale PDF** (`/pdf/grayscale`) and **Invert colours / Dark mode** (`/pdf/invert`) with instant live before/after previews | ✅ |
| P3.6 | **Fill PDF forms** (`lib/pdf/forms.ts`, `components/PdfTools/FormFiller.tsx`, `pages/pdf/fill-forms.tsx`) with canvas-overlaid form controls, sidebar field panel, optional flattening, and Node harness check 26 | ✅ |
| P3.7 | **Sign PDF** (`lib/pdf/sign.ts`, `components/PdfTools/SignaturePad.tsx`, `SignCanvas.tsx`, `pages/pdf/sign.tsx`) with draw/type/upload pad, interactive canvas placement, text/date stamps, and Node harness check 27 | ✅ |
| P3.8 | **Edit PDF** (`lib/pdf/editPdf.ts`, `components/PdfTools/PdfEditor.tsx`, `pages/pdf/edit.tsx`) with lossless text, Multiply highlights, shapes, lines/arrows, freehand ink, deduplicated images, and Node harness check 28 | ✅ |
| P3.9 | Final Phase 3 browser verification harness (`scripts/harness/pdf/ui.mjs`, 31 checks across all 27 PDF tools, 390px phone overflow checks, and zero errors/third-party requests) & `docs/pdf-tools-plan.md` completion QA | ✅ |

### Remove metadata improvements

- Hidden content that is still drawn but invisible: text outside the page box, white text, hidden optional content
  layers, objects covered by other objects. Reporting these is possible; removing them changes content.
- Metadata inside other image formats (JPEG 2000 XML boxes) and in embedded fonts' names.
- Searching the visible text for e-mail addresses, phone numbers and names, as a lead-in to the Redact tool.

### Compression improvements

- Work out each image's real on-page size from the content streams (`cm` before `Do`) instead of assuming it covers the
  largest page, so small images are downsampled further.
- Merge identical objects (fonts and images that are repeated after merging).
- Unembed or subset duplicate fonts.
- Greyscale and 1-bit (CCITT/JBIG2) options for scanned documents.
- Recompress CMYK, indexed and 16-bit images (skipped today).
- Ghostscript wasm as an optional "maximum" level.
