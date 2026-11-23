import katex from 'katex';
import React from 'react';

import { promoteFractionsToDisplay } from '../../lib/ui/mathFormat';
import { useMathSettings } from '../../lib/ui/mathSettings';
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
  const { fullSizeFractions } = useMathSettings();
  const formatted = fullSizeFractions ? promoteFractionsToDisplay(text) : text;
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(formatted, {
        output: 'mathml',
        displayMode,
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      return '';
    }
  }, [formatted, displayMode]);

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
