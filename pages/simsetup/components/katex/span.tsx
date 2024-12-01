'use client';

// https://github.com/kirankulkarni/next-katex
// Author: kirankulkarni
// Updated: 2024-01-12
// Read: 2024-11-30

// https://dev.to/kirankulkarni/next-js-14-katex-web-app-30ld
// Author: Kiran
// Updated: 2024-01-12
// Read: 2024-11-30

import katex from 'katex';
// import renderMathInElement from './../../../../node_modules/katex/dist/contrib/auto-render';
// import 'katex/dist/katex.min.css';
import { useEffect, useRef } from 'react';

export default function KatexSpan({ text, ...delegated }) {
  const katexTextRef = useRef();

  useEffect(() => {
    if (katexTextRef.current) {
      katex.render(text, katexTextRef.current as HTMLDivElement, {output: 'mathml'});
    }
  }, [text]);

  return (
    <div ref={katexTextRef} {...delegated}/>
  );
}