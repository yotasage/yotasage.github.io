// The tools listed on /pdf/main. See docs/pdf-tools-plan.md for the tools planned next.
export type ToolIconName = 'merge' | 'compress' | 'images' | 'sanitize';

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

export const TOOL_CATEGORIES: ToolCategory[] = [
  { title: 'Organize', tools: [MERGE] },
  { title: 'Optimize', tools: [COMPRESS] },
  { title: 'Convert to PDF', tools: [IMAGES_TO_PDF] },
  { title: 'Security', tools: [REMOVE_METADATA] },
];
