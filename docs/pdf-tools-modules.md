# PDF tools – module map and execution history

Companion reference to [pdf-tools-plan.md](pdf-tools-plan.md) (ground rules, architecture, feature list, and cross-cutting improvements).

## Module map

### `lib/pdf/`
- `annotations.ts` — Annotation subtype inspection (`inspectAnnotations`), selective removal by subtype/page range (`removeAnnotations`), and AcroForm/appearance-stream flattening (`flattenPdf`).
- `breakdown.ts` — Estimates how a PDF's bytes split across images, fonts, page content, metadata/attachments, and structure.
- `color.ts` — DOM-free lossless BT.709 PDF grayscale conversion (`grayscalePdf` rewriting content-stream colour operators and raw/indexed image streams) and pure RGBA dark-mode/invert/custom-colour pixel transforms (`transformRgbaPixels`).
- `colorRaster.ts` — Browser pdf.js/Canvas raster color transform pipeline (`rasterTransformPdf`) for grayscale and dark-mode PDFs plus JPEG-to-grayscale decoder/re-encoder (`createBrowserJpegToGrayConverter`).
- `compare.ts` — Framework-free reading-order text line reconstruction (`assembleLinesFromTextItems`), line & word LCS diffing (`diffTextLines`, `diffWords`), RGBA pixel overlay/diffing with changed-region bounding boxes (`computePixelDiff`), and plain-text diff report formatting.
- `compress.ts` — Lossless stream re-deflation, unused-object removal, CTM-aware image downsampling/recompression, duplicate object merging, optional QPDF structural optimization, Ghostscript maximum compression dispatch, and optional rasterization.
- `compressContent.ts` — Content-stream CTM display-size analyzer (including nested Form XObjects), duplicate image & embedded font stream deduplicator, CMYK/Indexed/16-bit image decoder, and Otsu adaptive 1-bit B&W and 8-bit grayscale Flate stream encoders.
- `crop.ts` — Visual page box inspection (`getPageBoxes`) and rotation-aware `/CropBox` cropping and MediaBox reset (`cropPdf`).
- `detectFigures.ts` — Spatial operator/text indexer (`analyzePageVectors`), inline vector figure clustering (`detectFiguresOnPage`) ignoring page backgrounds/borders/rules/prose, and tighten-to-content snapping (`tightenRegionToContent`).
- `editPdf.ts` — Lossless vector/text/image editing engine (`applyEdits`, `computeArrowGeometry`) supporting word-wrapped text with optional whiteout background, Multiply-blended highlights, rectangles, cubic-Bezier ellipses, lines, arrows, freehand ink strokes, and deduplicated images across `/CropBox` and `/Rotate`.
- `extractImages.ts` — Extracts embedded JPEGs verbatim and raw/indexed/SMask image streams as lossless PNGs.
- `extractVectors.ts` — Extracts qualifying `/Subtype /Form` XObjects as lossless standalone single-page PDFs (`extractFormXObjects`) and crops arbitrary viewport rectangles into lossless vector PDFs (`extractRegionAsPdf`, `extractRegionsAsPdfs`), accounting for `/CropBox` and `/Rotate`.
- `files.ts` — File I/O, downloads, ZIP bundling (`fflate`), safe filenames, password-error detection, and formatting helpers.
- `forms.ts` — AcroForm field inspection (`inspectFormFields`) with `/CropBox`/`/Rotate` visual widget geometry and `/Annots` page fallback, plus form filling and optional flattening (`fillFormPdf`).
- `ghostscript.ts` — Browser Web Worker RPC client (with automatic main-thread and Node.js fallback) for Ghostscript WebAssembly plus vector-preserving compression (`compressPdfWithGhostscript`).
- `ghostscript.worker.ts` — Dedicated browser module Web Worker executing `ghostscriptCore.ts` off the main UI thread.
- `ghostscriptCore.ts` — Self-hosted Ghostscript 10.08.0 WebAssembly loader (`/pdf-wasm/gs/`) with isolated Emscripten virtual FS per invocation and Node.js harness support.
- `handoff.ts` — In-memory transfer buffer for passing generated PDFs between tools via *Continue with…*.
- `imageDecode.ts` — Shared raw PDF image stream decoding, PNG/TIFF predictor reversal, colour-space inspection, and pure-JS RGBA→PNG encoding (`encodePngRgba`).
- `images.ts` — Images-to-PDF conversion with lossless JPEG/PNG embedding, EXIF orientation, paper sizes, margins, and DPI scaling.
- `jpeg.ts` — Reads and strips JPEG metadata segments (EXIF, XMP, IPTC, comments, trailing data) without re-encoding image scans.
- `linearize.ts` — Fast Web View inspection (`hasLinearizedHeader`, `inspectLinearization`) and lossless QPDF WebAssembly linearization (`linearizePdf`).
- `merge.ts` — Page range parser (`parsePageRanges`) and multi-PDF merging via `copyPages`.
- `metadata.ts` — Standard Info dictionary, ISO date, and custom property reader (`readPdfMetadata`) and writer (`writePdfMetadata`) with optional stale XMP removal.
- `nup.ts` — Multi-page N-up sheet imposition (`nupPdf`) and saddle-stitch duplex booklet ordering and imposition (`computeBookletOrder`, `bookletPdf`).
- `objects.ts` — Low-level pdf-lib object graph traversal (`walkDicts`), filter/name/text helpers, and unreachable-object removal.
- `ocr.ts` — End-to-end client-side OCR pipeline (`ocrPdf`, `injectOcrTextLayer`, `extractWordsFromTesseractResult`, `sanitizeWinAnsiText`) injecting invisible `3 Tr` searchable text layers over original page artwork across `/CropBox` and `/Rotate`.
- `ocrRuntime.ts` — Self-hosted Tesseract.js 7 worker loader (`createSelfHostedOcrWorker`, `OCR_LANGUAGES`, `OCR_ASSET_PATHS`) serving worker/WASM cores/7 `tessdata_fast` languages from `/ocr/` with zero CDN requests and local custom `.traineddata` support.
- `pageNumbers.ts` — Rotation-aware vector page numbering (`addPageNumbers`) with format templates, fonts, margins, page ranges, cover skipping, and duplex odd/even mirroring.
- `pages.ts` — Page range formatting, multi-source page builder (`buildPdfFromPages`), in-place rotation, removal, and extraction.
- `pdfa.ts` — PDF/A-1b, PDF/A-2b, and PDF/A-3b pre-flight & post-conversion compliance auditor (`inspectPdfA`) and Ghostscript WebAssembly converter (`convertToPdfA`) with QPDF structural verification.
- `pdfjs.ts` — Lazy `pdfjs-dist` loader (self-hosted worker/cmaps/fonts), page rendering, and card thumbnails.
- `pdfToImages.ts` — Renders all or selected PDF pages via pdf.js into JPG or lossless PNG images at a chosen DPI.
- `pdfToSvg.ts` — Converts PDF pages, Form XObjects, and cropped viewport regions into standalone editable SVGs (`pdfPageRegionToSvg`, `pdfBytesToSvg`) supporting paths, colors, opacity, clip paths, embedded images, and text labels.
- `qpdf.ts` — Self-hosted QPDF WebAssembly wrapper (`runQpdf`, `checkQpdf`) loading `/pdf-wasm/qpdf.{js,wasm}` in browsers/workers and `@neslinesli93/qpdf-wasm` in Node with isolated virtual FS per run.
- `reader.ts` — Framework-free PDF reader helpers: nested outline extraction (`readOutlineTree`), document metadata (`readDocInfo`), positioned text layout (`extractPageTextLayout`), search text extraction & matching (`findTextMatches`, `splitItemWithMatches`), and link annotation mapping (`extractPageLinks`).
- `redact.ts` — Text/regex/PII redaction match finder (`findTextRedactMatches`, `PII_PRESETS`), RGBA pixel burn-in (`burnRedactionsIntoRgba`), and irreversible page-flattening redactor (`applyRedactions`) with lossless untouched-page copying and metadata scrubbing.
- `repair.ts` — Damaged PDF structure diagnostics (`diagnosePdf`) and 3-tier recovery (`repairPdf`: lossless QPDF rebuild, tolerant pdf-lib page recovery, and browser pdf.js visual rescue).
- `resize.ts` — Vector-preserving paper resizing (`resizePdf`, `RESIZE_PRESETS`, `toPoints`) via `embedPage` with fit, fill, stretch, and center scaling modes.
- `sanitize.ts` — Metadata and hidden-data inspector (`inspectPdf`) and cleaner (`cleanPdf`) with *Metadata only*, *Anonymize*, and *Maximum* presets.
- `security.ts` — Encryption inspection (`inspectSecurity`), AES-256/AES-128 password protection with granular permissions (`protectPdf`), and decryption (`unlockPdf`).
- `sign.ts` — Visual signature and text stamp embedding (`applySignatures`) with `assetId` image deduplication and `/CropBox`/`/Rotate` coordinate mapping.
- `split.ts` — Range-group, every-N, breakpoint, top-level bookmark, and target-size PDF splitting.
- `thumbs.ts` — Lazy page-thumbnail pool (`PdfThumbPool`) with concurrency control, LRU Blob URL eviction, and `page.cleanup()`.
- `tools.ts` — Central `PdfTool` registry and categories powering `/pdf/main` and *Continue with…* navigation (33 tools).
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
- `PdfCompareView.tsx` — Dual-document PDF comparison workspace with Visual overlay, Side-by-side, Swipe curtain, and Text diff views, background page scanning, and visual-diff PDF/text report exports.
- `PdfEditor.tsx` — Interactive HiDPI SVG/HTML page editor canvas supporting text boxes (with inline editing), highlights, shapes, lines/arrows with endpoint handles, freehand ink, and images.
- `PdfReader.tsx` — Full client-side PDF reader component (toolbar, Ctrl+F search bar, collapsible Thumbnails/Contents/Info sidebar, virtualised page canvas/text/link layers, print, fullscreen, dark paper mode).
- `RedactCanvas.tsx` — Interactive HiDPI redaction canvas for drawing, moving, resizing, nudging, and previewing irreversible redaction boxes.
- `SignaturePad.tsx` — Three-tab signature creator (freehand Draw with stroke smoothing, Type in 4 styles, Upload with light-background removal) exporting trimmed transparent PNGs.
- `SignCanvas.tsx` — Interactive HiDPI page canvas for click-to-place signatures/stamps, dragging, aspect-preserving corner resizing, inline text editing, and keyboard nudging.
- `ToolIcon.tsx` — Inline SVG icons for all 33 PDF tool tiles and workspace headers.
- `ToolPage.tsx` — Shared page frame (`PdfPage`), drop-zone/sidebar layout (`ToolWorkspace`), file picker button, and progress indicator (`Progress`).
- `VectorTabs.tsx` — Embedded vectors (Form XObjects) and Detect & crop figures panels, sidebars, and SVG/PDF/PNG export orchestration for `/pdf/extract-images`.

### `styles/`
- `PdfTools.module.css` — Shared workspace, card grid, tab bar, interactive figure-crop/crop/form/sign/edit canvas, and responsive phone styles.
- `PdfReader.module.css` — Reader shell, toolbar, search bar, collapsible sidebar, text/link overlay, and dark-mode reading styles.
- `PdfCompare.module.css` — Dual-slot uploader, diff mode tabs, swipe curtain, side-by-side canvases, and text diff gutter styles.
- `PdfRedact.module.css` — Search/PII auto-mark sidebar, interactive redaction box overlay, colour swatches, and verification badge styles.
- `PdfOcr.module.css` — Language chip grid, custom `.traineddata` loader, OCR progress/cancel bar, and extracted text preview styles.

### `pages/pdf/`
- `main.tsx` — Hub page listing all 33 PDF tools grouped by category.
- `reader.tsx`, `compare.tsx` — View & compare tools.
- `merge.tsx`, `split.tsx`, `organize.tsx`, `rotate.tsx`, `remove-pages.tsx`, `extract-pages.tsx` — Organize tools.
- `compress.tsx`, `linearize.tsx`, `repair.tsx`, `ocr.tsx` — Optimize & OCR tools.
- `edit.tsx`, `sign.tsx`, `fill-forms.tsx`, `page-numbers.tsx`, `watermark.tsx`, `crop.tsx`, `resize.tsx`, `nup.tsx`, `grayscale.tsx`, `invert.tsx`, `edit-metadata.tsx`, `flatten.tsx`, `remove-annotations.tsx` — Edit & annotate tools.
- `images-to-pdf.tsx`, `pdf-to-images.tsx`, `extract-images.tsx`, `pdfa.tsx` — Image, vector & archival PDF/A conversion tools.
- `protect.tsx`, `unlock.tsx`, `redact.tsx`, `remove-metadata.tsx` — Security, redaction & metadata sanitization tools.

### `scripts/harness/pdf/`
- `package.json` — Isolated harness package (`playwright-core`, `tsx`, `check` and `ui` scripts; not part of the site).
- `fixtures.mjs` — Synthetic in-memory PDF (multi-page, images, Form XObjects, inline vectors, metadata/EXIF, rotated, bookmarked, reader, annotated/fillable forms, color/image, compressible, encrypted), RGBA PNG, and EXIF JPEG generators.
- `check.mjs` — Node verification suite for Phase 1–3 `lib/pdf/*` modules (Checks 1–28).
- `check-p4.mjs` — Node verification suite for Phase 4 WASM/OCR/compression/linearize/repair/compare/redact/PDF/A/OCR modules and self-hosted assets (Checks 29–37; `npm run check` runs all **37 checks**).
- `ui.mjs` — Headless Edge/Chrome Playwright suite covering `/pdf/main` and all 33 routes, 390px phone overflow checks, Phase 1–3 interactive E2E flows, and final zero-errors/zero-third-party-requests verification.
- `ui-p4.mjs` — Phase 4 browser E2E suite invoked by `ui.mjs` covering `/licenses`, Ghostscript compression, QPDF linearization & repair, Compare PDFs, Redact PDF, Ghostscript PDF/A-2b, and real self-hosted Tesseract.js OCR (`npm run ui` runs all **39 checks**).

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

## Phase 4 execution history (complete)

All Phase 4 WebAssembly, OCR, comparison, redaction, repair, linearization, PDF/A, and compression upgrades completed with 100% self-hosted assets and zero CDN requests:

| Step | Scope | Status |
| --- | --- | :-: |
| P4.1 | Self-hosted WASM/OCR foundation (`@neslinesli93/qpdf-wasm`, `tesseract.js`, 7 `@tesseract.js-data/*` languages, `scripts/copy-pdf-wasm-assets.mjs`, `lib/pdf/qpdf.ts`, `lib/pdf/ocrRuntime.ts`, `/licenses` entries, Node Check 29) | ✅ |
| P4.2 | Stronger compression engine (`lib/pdf/compressContent.ts` CTM on-page DPI, duplicate font/image dedup, CMYK/Indexed/16-bit decoding, Otsu 1-bit B&W & 8-bit grayscale, optional QPDF pass, upgraded `/pdf/compress`, Node Check 30) | ✅ |
| P4.3 | **Optimize for web** (`lib/pdf/linearize.ts`, `/pdf/linearize`) & **Repair PDF** (`lib/pdf/repair.ts`, `/pdf/repair` 3-tier QPDF / pdf-lib / visual rescue, Node Checks 31–32) | ✅ |
| P4.4 | **Compare PDFs** (`lib/pdf/compare.ts`, `components/PdfTools/PdfCompareView.tsx`, `styles/PdfCompare.module.css`, `/pdf/compare` with 4 views + visual-diff PDF & text report export, Node Check 33) | ✅ |
| P4.5 | **Redact PDF** (`lib/pdf/redact.ts`, `components/PdfTools/RedactCanvas.tsx`, `styles/PdfRedact.module.css`, `/pdf/redact` with search/regex/PII auto-mark, irreversible page flattening, zero-text verification & metadata scrubbing, Node Check 34) | ✅ |
| P4.6a | AGPL-3.0 relicensing (`LICENSE.md`, `package.json`, `/licenses`), self-hosted Ghostscript 10.08.0 WebAssembly runtime (`@wasmedia/wghostscript`, `public/pdf-wasm/gs/`, `lib/pdf/ghostscript*.ts` module worker), and Ghostscript (maximum) mode in `/pdf/compress` (Node Check 35) | ✅ |
| P4.6b | **PDF to PDF/A** (`lib/pdf/pdfa.ts`, `/pdf/pdfa`) supporting PDF/A-1b/2b/3b via Ghostscript WASM with pre-flight & post-conversion audits and QPDF structural verification (Node Check 36) | ✅ |
| P4.7 | **OCR PDF** (`lib/pdf/ocr.ts`, `styles/PdfOcr.module.css`, `/pdf/ocr`) using self-hosted Tesseract.js worker, invisible `3 Tr` text-layer injection across `/CropBox` & `/Rotate`, multi-language & custom `.traineddata` support, and `.txt` export (Node Check 37) | ✅ |
| P4.8 | Final Phase 4 headless browser E2E verification harness (`scripts/harness/pdf/ui-p4.mjs`, `ui.mjs` — 39 checks across `/licenses` and all 33 tools including Ghostscript, QPDF, and Tesseract OCR with zero CDN requests & 390px overflow checks) & `docs/pdf-tools-plan.md` completion QA | ✅ |

### Remove metadata improvements

- Hidden content that is still drawn but invisible: text outside the page box, white text, hidden optional content
  layers, objects covered by other objects. Reporting these is possible; removing them changes content.
- Metadata inside other image formats (JPEG 2000 XML boxes) and in embedded fonts' names.
- Searching the visible text for e-mail addresses, phone numbers and names — ✅ now available in **Redact PDF** (`/pdf/redact`).

### Compression improvements

- ✅ Work out each image's real on-page size from the content streams (`cm` before `Do`, including Form XObjects) instead of assuming it covers the largest page (`lib/pdf/compressContent.ts`).
- ✅ Merge identical objects (duplicate image and embedded font streams repeated after merging).
- ✅ Grayscale and Otsu adaptive 1-bit B&W options for scanned documents.
- ✅ Recompress CMYK, indexed and 16-bit images.
- ✅ Optional QPDF WebAssembly deep structure optimization and Ghostscript WebAssembly "maximum" vector-preserving level (`Screen`/`eBook`/`Printer`/`Prepress`).
- Remaining future ideas: true glyph-level font subsetting without Ghostscript, and CCITT Group 4 / JBIG2 encoders for 1-bit scans.
