// Based on:
// https://github.com/kirankulkarni/next-katex
// Author: kirankulkarni
// Updated: 2024-01-12
// Read: 2024-11-30

// https://dev.to/kirankulkarni/next-js-14-katex-web-app-30ld
// Author: Kiran
// Updated: 2024-01-12
// Read: 2024-11-30

import katex from 'katex';
import React from 'react';

// Rendered while the page is built, so the formulas are in the HTML before any script runs.
// MathML output is drawn by the browser itself and does not need the KaTeX stylesheet.
export default function KatexSpan({ text, displayMode = false, ...delegated }: {
  text: string;
  displayMode?: boolean;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const html = React.useMemo(() => katex.renderToString(text, { output: 'mathml', displayMode }), [text, displayMode]);
  return <span {...delegated} dangerouslySetInnerHTML={{ __html: html }} />;
}
