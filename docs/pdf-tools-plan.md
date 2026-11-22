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
  The pdf.js worker and data files are copied into `public/pdfjs/` by `scripts/copy-pdfjs-assets.mjs`, and the Phase 4
  WebAssembly/OCR assets (QPDF in `public/pdf-wasm/`, Ghostscript 10.08.0 in `public/pdf-wasm/gs/`, and Tesseract.js
  worker, WASM cores, and seven `tessdata_fast` languages in `public/ocr/`) are copied by
  `scripts/copy-pdf-wasm-assets.mjs` on `npm install` / `npm ci` (git ignores those folders). QuickJS is left out,
  since scripts in PDFs are never run.
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
| Styles | `styles/PdfTools.module.css` | Form fields reuse `components/UI/Fields.tsx` and `styles/Fields.module.css`. |
| PDF logic | `lib/pdf/` | Framework-free functions, one module per tool, plus `files.ts` (download, ZIP, names) and `pdfjs.ts` (lazy pdf.js, page rendering, thumbnails). |

Libraries:

| Library | Use | Licence |
| --- | --- | --- |
| [`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib) | Read, modify and write PDFs. A maintained fork of pdf-lib with the same API, plus encryption and decryption (needed for Protect/Unlock). | MIT |
| [`pdfjs-dist`](https://github.com/mozilla/pdf.js) | Render pages (thumbnails, rasterizing, PDF to image), extract text. | Apache-2.0 |
| [`fflate`](https://github.com/101arrowz/fflate) | ZIP downloads, deflate/inflate of PDF streams. | MIT |
| [`@neslinesli93/qpdf-wasm`](https://github.com/neslinesli93/qpdf-wasm) | Self-hosted QPDF WebAssembly (`public/pdf-wasm/`) for PDF linearization (Fast Web View), lossless structural repair, deep stream optimization, and structural checks. | Apache-2.0 |
| [`@wasmedia/wghostscript`](https://github.com/wasmedia/wghostscript) | Self-hosted Ghostscript 10.08.0 WebAssembly (`public/pdf-wasm/gs/`, run in a dedicated module Web Worker) for ISO PDF/A-1b/2b/3b conversion and vector-preserving maximum compression. | AGPL-3.0 |
| [`tesseract.js`](https://github.com/naptha/tesseract.js) & `@tesseract.js-data/{eng,nor,swe,dan,deu,fra,spa}` | Self-hosted Tesseract 7 OCR engine (`public/ocr/`) with seven bundled `tessdata_fast` language models plus local custom `.traineddata` support. | Apache-2.0 |

Candidates for later phases: `docx` (writing Word files, MIT), LibreOffice wasm (Office to PDF; very large download,
research needed; MPL-2.0).

**AGPL-3.0 & Ghostscript licensing:** This repository is licensed under the GNU Affero General Public License v3.0 or
later ([`LICENSE.md`](../LICENSE.md), `package.json`: `AGPL-3.0-or-later`), satisfying Ghostscript's AGPL-3.0 terms
while offering complete corresponding source on GitHub. Ghostscript 10.08.0 WebAssembly is served unmodified from
`public/pdf-wasm/gs/` and loaded lazily on demand only when a user invokes Ghostscript maximum compression or PDF/A
conversion. `/licenses` displays the site AGPL-3.0 notice alongside upstream licence texts and source links for
Ghostscript, QPDF, and Tesseract/Leptonica.

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

### Phase 4 – heavier processing (done; WebAssembly + OCR)

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| OCR (searchable PDF) | ✔ | ✔ | ✅ | Self-hosted Tesseract.js 7 (`lib/pdf/ocrRuntime.ts`, `lib/pdf/ocr.ts`, `pages/pdf/ocr.tsx`) with 7 bundled `tessdata_fast` languages (`eng`, `nor`, `swe`, `dan`, `deu`, `fra`, `spa`) plus local custom `.traineddata` loading; injects invisible `3 Tr` searchable text layers respecting `/CropBox` and `/Rotate`, skips pages with existing text, supports cancellation, and exports `.txt`. |
| Redact PDF | ✔ | ✔ | ✅ | Search/regex/PII auto-marking + interactive HiDPI `RedactCanvas` (`lib/pdf/redact.ts`, `components/PdfTools/RedactCanvas.tsx`, `pages/pdf/redact.tsx`); permanently flattens redacted pages to pixels with burned-in fill/overlay text, copies untouched pages losslessly, scrubs metadata, and verifies zero remaining text items on redacted pages. |
| Compare PDFs | ✔ | ✔ | ✅ | Pure reading-order line/word LCS diff and RGBA pixel diff engine (`lib/pdf/compare.ts`, `components/PdfTools/PdfCompareView.tsx`, `pages/pdf/compare.tsx`) with Visual overlay, Side-by-side, Swipe curtain, and Text diff modes, background page-change scanning, per-slot password unlock, and downloadable visual-diff PDF and text reports. |
| Repair PDF | ✔ | ✔ | ✅ | Diagnostic structure scanner + 3-tier recovery (`lib/pdf/repair.ts`, `pages/pdf/repair.tsx`): lossless QPDF structural & xref rebuild, tolerant pdf-lib page recovery, and browser pdf.js visual page rescue, accepting damaged PDFs even when preview fails. |
| PDF to PDF/A | ✔ | ✔ | ✅ | Self-hosted Ghostscript 10.08.0 WebAssembly worker (`lib/pdf/pdfa.ts`, `lib/pdf/ghostscript*.ts`, `pages/pdf/pdfa.tsx`) converting to archival PDF/A-1b, PDF/A-2b, and PDF/A-3b with embedded fonts, sRGB/Grayscale/CMYK ICC OutputIntent, ISO `pdfaid` XMP, pre-flight & post-conversion audits, and QPDF structural verification. |
| Optimize for web (linearize) | ✔ | – | ✅ | Self-hosted QPDF WebAssembly (`lib/pdf/linearize.ts`, `lib/pdf/qpdf.ts`, `pages/pdf/linearize.tsx`) inspecting linearization status and rewriting PDFs for Fast Web View with optional object stream generation, stream recompression, and batch ZIP download. |
| Stronger compression | ✔ | ✔ | ✅ | Content-stream CTM on-page image display-size tracking (including Form XObjects), duplicate image & embedded font stream deduplication, CMYK/Indexed/16-bit decoding, Otsu 1-bit B&W and 8-bit grayscale Flate encoding (`lib/pdf/compressContent.ts`), optional QPDF structural optimization, and vector-preserving Ghostscript (maximum) mode (`Screen`/`eBook`/`Printer`/`Prepress` presets) in `/pdf/compress`. |

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
- **Verification harness (`scripts/harness/pdf/`).** ✅ Implemented (`fixtures.mjs`, `check.mjs`, `check-p4.mjs`, `ui.mjs`, `ui-p4.mjs`). Generates synthetic test PDFs in Node with `@cantoo/pdf-lib` and `fflate` (including synthetic damaged xref PDFs and pure-JS bitmap image-only scan PDFs) and verifies all framework-free `lib/pdf/*` modules (**37 Node checks**) plus headless Edge/Chrome interactive flows across `/licenses` and **all 33 PDF tools** (**39 browser E2E checks**: 390px phone overflow checks, interactive E2E flows for every Phase 1–4 tool, real in-browser Ghostscript WASM compression & PDF/A-2b, QPDF WASM linearization & damaged-PDF repair, Compare PDFs, irreversible Redact PDF, self-hosted Tesseract.js OCR, and zero console/page/network/third-party errors). Re-run when bumping `pdfjs-dist` (`BL203`) or WASM runtimes.

## Module map and execution history

The detailed per-file module map (`lib/pdf/`, `components/PdfTools/`, `styles/`, `pages/pdf/`, `scripts/harness/pdf/`), completed Phase 2–4 execution history tables, and metadata/compression improvement notes live in [pdf-tools-modules.md](pdf-tools-modules.md).
