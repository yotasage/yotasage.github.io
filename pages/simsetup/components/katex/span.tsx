'use client';

// https://github.com/kirankulkarni/next-katex

import katex from 'katex';
// import renderMathInElement from './../../../../node_modules/katex/dist/contrib/auto-render';
// import 'katex/dist/katex.min.css';
import { useEffect, useRef } from 'react';

export default function KatexSpan({ text, ...delegated }) {
  const katexTextRef = useRef();
  useEffect(() => {
    if (katexTextRef.current) {
      katex.render(text, katexTextRef.current as HTMLElement);
    }
  }, [text]);

  return (
    <div ref={katexTextRef} {...delegated}>
      
    </div>
  );
}