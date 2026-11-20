// The tools listed on /pdf/main. See docs/pdf-tools-plan.md for the tools planned next.
export type ToolIconName =
  | 'merge'
  | 'compress'
  | 'images'
  | 'sanitize'
  | 'rotate'
  | 'remove-pages'
  | 'extract-pages'
  | 'organize';

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

export const MERGE: PdfTool = {
  id: 'merge',
  title: 'Merge PDF',
  description: 'Combine several PDFs into one, in the order you choose, with optional page ranges per file.',
  href: '/pdf/merge',
  icon: 'merge',
  color: '#e5533d',
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

export const REMOVE_METADATA: PdfTool = {
  id: 'remove-metadata',
  title: 'Remove metadata',
  description: 'See and remove what a PDF reveals about its author: properties, XMP, photo EXIF and GPS, comment authors, signatures, scripts and old revisions.',
  href: '/pdf/remove-metadata',
  icon: 'sanitize',
  color: '#9b7bf0',
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

export const TOOL_CATEGORIES: ToolCategory[] = [
  { title: 'Organize', tools: [MERGE, ORGANIZE, ROTATE, REMOVE_PAGES, EXTRACT_PAGES] },
  { title: 'Optimize', tools: [COMPRESS] },
  { title: 'Convert to PDF', tools: [IMAGES_TO_PDF] },
  { title: 'Security', tools: [REMOVE_METADATA] },
];
