import { useMemo } from 'react';

import { renderMarkdownToHtml } from '../../lib/notepad/markdownPreview';
import styles from '../../styles/NotepadPreview.module.css';

export interface MarkdownPreviewProps {
  content: string;
}

// Follows components/KatexSpan.tsx convention: KaTeX MathML output is drawn natively
// by the browser without loading a global KaTeX stylesheet, while .katex-html is
// hidden via NotepadPreview.module.css to prevent duplicate rendering.
export default function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const html = useMemo(() => renderMarkdownToHtml(content), [content]);

  return (
    <div className={styles.mdScroll}>
      <article className={styles.mdBody} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
