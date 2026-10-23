import React from 'react';

import { QrSymbol } from '../../lib/qr/encoder';
import { drawToCanvas, RenderOptions } from '../../lib/qr/render';
import styles from '../../styles/QrGen.module.css';

const PREVIEW_PX = 360;

function SymbolCanvas({ sym, opts }: { sym: QrSymbol; opts: RenderOptions }) {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    const modules = Math.max(sym.width, sym.height) + 2 * opts.quietZone;
    const ratio = window.devicePixelRatio || 1;
    // Whole device pixels per module keep the preview crisp; CSS then scales it to the box.
    const scale = Math.max(1, Math.floor((PREVIEW_PX * ratio) / modules));
    drawToCanvas(ref.current, sym, opts, scale);
    ref.current.style.width = `${ref.current.width / ratio}px`;
  }, [sym, opts]);

  return <canvas ref={ref} className={styles.canvas} />;
}

export default function SymbolPreview({ symbols, opts, selected, onSelect }: {
  symbols: QrSymbol[];
  opts: RenderOptions;
  selected: number;
  onSelect: (i: number) => void;
}) {
  const many = symbols.length > 1;
  return (
    <div className={styles.preview}>
      {symbols.map((sym, i) => (
        <button
          key={i}
          type="button"
          className={[styles.previewItem, many ? styles.previewItemSelectable : '', many && i === selected ? styles.previewItemSelected : ''].join(' ')}
          onClick={() => onSelect(i)}
          disabled={!many}
        >
          <SymbolCanvas sym={sym} opts={opts} />
          {many && <span className={styles.caption}>Symbol {i + 1} of {symbols.length}</span>}
        </button>
      ))}
    </div>
  );
}
