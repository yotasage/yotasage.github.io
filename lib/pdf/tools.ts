// The tools listed on /pdf/main. See docs/pdf-tools-plan.md for the tools planned next.
export type ToolIconName =
  | 'reader'
  | 'merge'
  | 'split'
  | 'compress'
  | 'images'
  | 'pdf-to-images'
  | 'extract-images'
  | 'sanitize'
  | 'protect'
  | 'unlock'
  | 'edit-metadata'
  | 'remove-annotations'
  | 'flatten'
  | 'rotate'
  | 'remove-pages'
  | 'extract-pages'
  | 'organize'
  | 'page-numbers'
  | 'watermark'
  | 'crop'
  | 'resize'
  | 'nup';

export interface PdfTool {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: ToolIconName;
  color: string;
}

export interface ToolCategory {
  title: string;
  tools: PdfTool[];
}

export const READER: PdfTool = {
  id: 'reader',
  title: 'Read PDF',
  description: 'Open and read PDFs in your browser with text selection, search, table of contents, thumbnails, zoom, dark-mode reading and keyboard shortcuts.',
  href: '/pdf/reader',
  icon: 'reader',
  color: '#4da3ff',
};

export const MERGE: PdfTool = {
  id: 'merge',
  title: 'Merge PDF',
  description: 'Combine several PDFs into one, in the order you choose, with optional page ranges per file.',
  href: '/pdf/merge',
  icon: 'merge',
  color: '#e5533d',
};

export const SPLIT: PdfTool = {
  id: 'split',
  title: 'Split PDF',
  description: 'Split a PDF into separate files by page ranges, every N pages, target file size, or top-level bookmarks.',
  href: '/pdf/split',
  icon: 'split',
  color: '#e59a3a',
};

export const COMPRESS: PdfTool = {
  id: 'compress',
  title: 'Compress PDF',
  description: 'Make PDFs smaller by downsampling images, recompressing streams and removing unused data.',
  href: '/pdf/compress',
  icon: 'compress',
  color: '#2fae6b',
};

export const IMAGES_TO_PDF: PdfTool = {
  id: 'images-to-pdf',
  title: 'Images to PDF',
  description: 'Turn JPG, PNG, WebP, GIF and other images into one PDF or a PDF per image.',
  href: '/pdf/images-to-pdf',
  icon: 'images',
  color: '#e0a526',
};

export const PDF_TO_IMAGES: PdfTool = {
  id: 'pdf-to-images',
  title: 'PDF to images',
  description: 'Render all or selected PDF pages as JPG or lossless PNG images at the DPI you choose.',
  href: '/pdf/pdf-to-images',
  icon: 'pdf-to-images',
  color: '#e0a526',
};

export const EXTRACT_IMAGES: PdfTool = {
  id: 'extract-images',
  title: 'Extract images & vectors',
  description: 'Extract embedded raster images (JPG/PNG), vector graphics (SVG/PDF), and auto-detected or hand-drawn figure crops from PDFs.',
  href: '/pdf/extract-images',
  icon: 'extract-images',
  color: '#4da3ff',
};

export const REMOVE_METADATA: PdfTool = {
  id: 'remove-metadata',
  title: 'Remove metadata',
  description: 'See and remove what a PDF reveals about its author: properties, XMP, photo EXIF and GPS, comment authors, signatures, scripts and old revisions.',
  href: '/pdf/remove-metadata',
  icon: 'sanitize',
  color: '#9b7bf0',
};

export const PROTECT: PdfTool = {
  id: 'protect',
  title: 'Protect PDF',
  description: 'Encrypt PDFs with AES-256 or AES-128 passwords and set permissions for printing, copying, editing and filling forms.',
  href: '/pdf/protect',
  icon: 'protect',
  color: '#e06060',
};

export const UNLOCK: PdfTool = {
  id: 'unlock',
  title: 'Unlock PDF',
  description: 'Remove password protection and permission restrictions from encrypted PDFs when you know the password.',
  href: '/pdf/unlock',
  icon: 'unlock',
  color: '#2fae6b',
};

export const EDIT_METADATA: PdfTool = {
  id: 'edit-metadata',
  title: 'Edit metadata',
  description: 'View and edit PDF title, author, subject, keywords, dates and custom properties, with optional stale XMP removal.',
  href: '/pdf/edit-metadata',
  icon: 'edit-metadata',
  color: '#34b3a0',
};

export const REMOVE_ANNOTATIONS: PdfTool = {
  id: 'remove-annotations',
  title: 'Remove annotations',
  description: 'Inspect and selectively strip comments, highlights, links, form fields and other annotations by type or page range.',
  href: '/pdf/remove-annotations',
  icon: 'remove-annotations',
  color: '#e59a3a',
};

export const FLATTEN: PdfTool = {
  id: 'flatten',
  title: 'Flatten PDF',
  description: 'Bake interactive form fields and visual annotations permanently into static page content so they cannot be edited.',
  href: '/pdf/flatten',
  icon: 'flatten',
  color: '#3aa0e8',
};

export const ROTATE: PdfTool = {
  id: 'rotate',
  title: 'Rotate PDF',
  description: 'Rotate individual pages or the whole PDF by 90° or 180°, without re-encoding anything.',
  href: '/pdf/rotate',
  icon: 'rotate',
  color: '#3aa0e8',
};

export const REMOVE_PAGES: PdfTool = {
  id: 'remove-pages',
  title: 'Remove pages',
  description: 'Delete unwanted pages from a PDF by clicking their thumbnails or entering page ranges.',
  href: '/pdf/remove-pages',
  icon: 'remove-pages',
  color: '#e5537a',
};

export const EXTRACT_PAGES: PdfTool = {
  id: 'extract-pages',
  title: 'Extract pages',
  description: 'Pull selected pages out of a PDF into a new document, or save each selected page as its own PDF.',
  href: '/pdf/extract-pages',
  icon: 'extract-pages',
  color: '#34b3a0',
};

export const ORGANIZE: PdfTool = {
  id: 'organize',
  title: 'Organize pages',
  description: 'Rearrange, rotate, duplicate, delete and insert blank pages across one or more PDFs.',
  href: '/pdf/organize',
  icon: 'organize',
  color: '#f07c3a',
};

export const PAGE_NUMBERS: PdfTool = {
  id: 'page-numbers',
  title: 'Add page numbers',
  description: 'Stamp customizable page numbers with format templates, fonts, margins, skip-cover and duplex mirroring.',
  href: '/pdf/page-numbers',
  icon: 'page-numbers',
  color: '#4da3ff',
};

export const WATERMARK: PdfTool = {
  id: 'watermark',
  title: 'Add watermark',
  description: 'Place single or tiled text and image watermarks over or under PDF pages with custom rotation and opacity.',
  href: '/pdf/watermark',
  icon: 'watermark',
  color: '#9b7bf0',
};

export const CROP: PdfTool = {
  id: 'crop',
  title: 'Crop PDF',
  description: 'Trim page margins visually with an interactive crop box or exact point values across all or selected pages.',
  href: '/pdf/crop',
  icon: 'crop',
  color: '#e59a3a',
};

export const RESIZE: PdfTool = {
  id: 'resize',
  title: 'Resize pages',
  description: 'Resize PDF pages to A4, Letter, A3, A5 or custom dimensions with fit, fill, stretch or actual-size scaling.',
  href: '/pdf/resize',
  icon: 'resize',
  color: '#2fae6b',
};

export const NUP: PdfTool = {
  id: 'nup',
  title: 'Pages per sheet & booklet',
  description: 'Impose 2, 4, 6, 9, 16 or custom pages per sheet, or create ready-to-print saddle-stitch duplex booklets.',
  href: '/pdf/nup',
  icon: 'nup',
  color: '#f07c3a',
};

export const TOOL_CATEGORIES: ToolCategory[] = [
  { title: 'View', tools: [READER] },
  { title: 'Organize', tools: [MERGE, SPLIT, ORGANIZE, ROTATE, REMOVE_PAGES, EXTRACT_PAGES] },
  { title: 'Optimize', tools: [COMPRESS] },
  { title: 'Edit & annotate', tools: [PAGE_NUMBERS, WATERMARK, CROP, RESIZE, NUP, EDIT_METADATA, FLATTEN, REMOVE_ANNOTATIONS] },
  { title: 'Convert to PDF', tools: [IMAGES_TO_PDF] },
  { title: 'Convert from PDF', tools: [PDF_TO_IMAGES, EXTRACT_IMAGES] },
  { title: 'Security', tools: [PROTECT, UNLOCK, REMOVE_METADATA] },
];
