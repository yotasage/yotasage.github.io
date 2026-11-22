import katex from 'katex';
import React from 'react';

import styles from '../../styles/Calculator.module.css';

export interface SafeKatexProps extends React.HTMLAttributes<HTMLSpanElement> {
  text: string;
  displayMode?: boolean;
}

/**
 * SSR-safe MathML KaTeX span that tolerates arbitrary or user-edited LaTeX
 * without throwing an exception during render.
 */
export default function SafeKatex({
  text,
  displayMode = false,
  className,
  ...delegated
}: SafeKatexProps) {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(text, {
        output: 'mathml',
        displayMode,
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      return '';
    }
  }, [text, displayMode]);

  const combinedClass = [styles.mathSpan, className ?? ''].filter(Boolean).join(' ');

  if (!html) {
    return (
      <span {...delegated} className={combinedClass}>
        {text}
      </span>
    );
  }
  return <span {...delegated} className={combinedClass} dangerouslySetInnerHTML={{ __html: html }} />;
}
