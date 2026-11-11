import React, { useEffect, useMemo, useState } from 'react';

import {
  AXIAL_BODIES, BODY_COATS, CHIP_SIZES, DrawStyle, IMAGE_FORMATS, ImageFormat, MAX_EXPORT_WIDTH, copyImage, drawAxial, drawChip,
  drawingFileName, exportBlob, exportHeight, exportSvg, formatOhms, formatRkm, formatTolerance, saveBlob, tikzAxial, tikzChip,
} from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import { CopyIcon, SaveIcon, Segmented } from './parts';
import { Change, PartType, Resolved } from './view';

interface Props {
  resolved: Resolved;
  drawStyle: DrawStyle;
  onStyle: (style: DrawStyle) => void;
  onChange: (change: Change) => void;
}

type Background = 'transparent' | 'white' | 'dark' | 'custom';

const WIDTHS = [512, 1024, 2048];
const DARK = '#1a1b19';
const INK_ON_DARK = '#e9e7e0';
const INK_ON_LIGHT = '#2b2a27';

// Whether a colour is dark enough to need light lines on it.
function isDark(hex: string): boolean {
  const [red, green, blue] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * red + 0.587 * green + 0.114 * blue < 110;
}

// The pixels per millimetre that show the chip sizes side by side: the largest is 6.3 mm long.
const SILHOUETTE = 7;

// The Drawing section: the part that is drawn (body and colour, or chip size) and the export of the drawing.
export default function DrawingSection({ resolved: r, drawStyle, onStyle, onChange }: Props) {
  const [width, setWidth] = useState(1024);
  const [scale, setScale] = useState(1);
  const [background, setBackground] = useState<Background>('transparent');
  const [custom, setCustom] = useState('#f6f4ee');
  const [caption, setCaption] = useState(true);
  const [status, setStatus] = useState<{ text: string; failed?: boolean } | null>(null);

  const axial = r.type === 'axial';
  const fill = background === 'transparent' ? null : background === 'white' ? '#ffffff' : background === 'dark' ? DARK : custom;
  const pixels = Math.min(MAX_EXPORT_WIDTH, Math.max(16, Math.round(width || 0) * scale));

  const lines = useMemo(() => {
    const value = `${formatOhms(r.ohms)}${r.ohms > 0 ? ` ${formatTolerance(axial && r.colours.length === 3 ? 20 : r.tolerance)}` : ''}`;
    if (axial) return [value, r.colours.join(' · '), `${r.body.rating} axial, ${r.body.length} × ${r.body.diameter} mm`];
    return [value, r.marking && !r.unmarked ? `marking ${r.marking}` : 'no marking', `${r.chip.imperial} (${r.chip.metric} metric), ${r.chip.length} × ${r.chip.width} mm`];
  }, [axial, r.ohms, r.tolerance, r.colours.join(), r.body, r.marking, r.unmarked, r.chip]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawing = useMemo(() => {
    const options = { style: drawStyle, ink: fill && isDark(fill) ? INK_ON_DARK : INK_ON_LIGHT, background: fill, caption: caption ? lines : undefined, scale: caption, id: 'out' };
    return axial ? drawAxial(r.colours, r.body, r.coat.id, options) : drawChip(r.chip, r.unmarked ? null : r.marking ?? null, options);
  }, [axial, r.colours.join(), r.body, r.coat.id, r.chip, r.unmarked, r.marking, drawStyle, fill, caption, lines]); // eslint-disable-line react-hooks/exhaustive-deps

  const height = exportHeight(drawing, pixels);
  // What was said about the last file no longer holds once the drawing changes.
  useEffect(() => { setStatus(null); }, [drawing, pixels]);
  const name = (format: ImageFormat | 'tex') => drawingFileName(r.ohms, r.partName, format);

  const save = async (format: ImageFormat) => {
    try {
      saveBlob(await exportBlob(drawing, pixels, format), name(format));
      setStatus({ text: `Saved ${name(format)}, ${pixels} × ${height} px${format === 'jpg' && !fill ? ', on white: JPG has no transparency' : ''}.` });
    } catch (error) {
      setStatus({ text: (error as Error).message, failed: true });
    }
  };

  const copyPicture = async () => {
    try {
      await copyImage(drawing, pixels);
      setStatus({ text: `Copied as a PNG of ${pixels} × ${height} px.` });
    } catch (error) {
      setStatus({ text: (error as Error).message || 'The picture could not be copied.', failed: true });
    }
  };

  // TikZ is made from the flat drawing, whatever the style of the picture, with the caption and background chosen.
  const tikz = () => {
    const options = { caption: caption ? lines : undefined, scale: caption, background: fill, title: `Resistor ${formatRkm(r.ohms)}, ${lines.slice(1).join(', ')}` };
    return axial
      ? tikzAxial(r.colours, r.body, r.coat.id, { ...options, bandNotes: r.code.ok ? r.code.bands.map((b) => b.meaning) : undefined })
      : tikzChip(r.chip, r.unmarked ? null : r.marking ?? null, options);
  };

  const saveTikz = () => {
    try {
      const made = tikz();
      saveBlob(new Blob([made.document], { type: 'application/x-tex;charset=utf-8' }), name('tex'));
      setStatus({ text: `Saved ${name('tex')}: it compiles as it is and draws the ${drawStyle === 'flat' ? '' : 'flat '}part ${Math.round(made.width)} mm wide.` });
    } catch (error) {
      setStatus({ text: (error as Error).message, failed: true });
    }
  };

  const copyTikz = async () => {
    try {
      await navigator.clipboard.writeText(tikz().picture);
      setStatus({ text: `Copied the tikzpicture with its colours, to paste into a document that loads TikZ.` });
    } catch {
      setStatus({ text: 'The TikZ could not be copied.', failed: true });
    }
  };

  const copySvg = async () => {
    try {
      await navigator.clipboard.writeText(exportSvg(drawing, pixels));
      setStatus({ text: 'Copied the SVG as text.' });
    } catch {
      setStatus({ text: 'The SVG could not be copied.', failed: true });
    }
  };

  return (
    <>
      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>The part</h3>
          <span className={styles.blockMeta}>what the drawing shows</span>
        </div>
        <div className={styles.optionRow}>
          <span className={styles.label}>Kind</span>
          <Segmented<PartType> label="Kind of resistor" value={r.type} options={[{ value: 'axial', label: 'Axial, through-hole' }, { value: 'chip', label: 'Chip, surface-mount' }]} onChange={(type) => onChange({ view: { type } })} />
        </div>
        <div className={styles.optionRow}>
          <span className={styles.label}>Style</span>
          <Segmented<DrawStyle> label="Style of the drawing" value={drawStyle} options={[{ value: 'realistic', label: 'Realistic' }, { value: 'flat', label: 'Flat, for documents' }]} onChange={onStyle} />
        </div>
        {axial ? (
          <>
            <div className={styles.optionRow}>
              <span className={styles.label}>Body</span>
              <div className={styles.cards} role="radiogroup" aria-label="Body size">
                {AXIAL_BODIES.map((body, i) => (
                  <button key={body.rating} type="button" role="radio" aria-checked={body === r.body} className={styles.card} onClick={() => onChange({ view: { type: 'axial', body: i } })}>
                    <span className={styles.cardShape}><span className={styles.axialShape} style={{ width: body.length * 4, height: body.diameter * 4 }} /></span>
                    <span className={[styles.num, styles.cardName].join(' ')}>{body.rating}</span>
                    <span className={[styles.num, styles.cardMeta].join(' ')}>{body.length} × {body.diameter} mm</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.optionRow}>
              <span className={styles.label}>Colour</span>
              <div className={styles.cards} role="radiogroup" aria-label="Body colour">
                {BODY_COATS.map((coat) => (
                  <button key={coat.id} type="button" role="radio" aria-checked={coat.id === r.coat.id} className={styles.coat} onClick={() => onChange({ view: { type: 'axial', coat: coat.id } })}>
                    <span className={styles.coatSwatch} style={{ background: coat.hex }} />
                    <span>{coat.label}{coat.what && <span className={styles.cardMeta}>, {coat.what}</span>}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className={styles.caption}>The bodies are those of a carbon film series; sizes differ a little by maker. The size does not fix the rating: a metal film part in the 1/4 W body is rated 0.6 W. The sources are with the table in <a href="#reference" className={styles.textLink}>Reference</a>.</p>
          </>
        ) : (
          <>
            <div className={styles.optionRow}>
              <span className={styles.label}>Size</span>
              <div className={styles.cards} role="radiogroup" aria-label="Chip size">
                {CHIP_SIZES.map((size) => (
                  <button key={size.imperial} type="button" role="radio" aria-checked={size === r.chip} className={styles.card} onClick={() => onChange({ view: { type: 'chip', size: size.imperial } })} title={`${size.length} × ${size.width} mm`}>
                    <span className={styles.cardShape}><span className={styles.chipShape} style={{ width: size.length * SILHOUETTE, height: size.width * SILHOUETTE }} /></span>
                    <span className={[styles.num, styles.cardName].join(' ')}>{size.imperial}</span>
                    <span className={[styles.num, styles.cardMeta].join(' ')}>{size.metric} metric</span>
                  </button>
                ))}
              </div>
            </div>
            <p className={styles.caption}>The outlines show the sizes next to each other, at one scale. Imperial 0402 and metric 0402 are different parts, as are 0603 and 0603, so both names are always given.</p>
          </>
        )}
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>Save the drawing</h3>
          <span className={styles.blockMeta}>made in the browser, nothing is uploaded</span>
        </div>
        <div className={styles.export}>
          <div className={styles.preview} data-bg={background} style={fill ? { background: fill } : undefined} dangerouslySetInnerHTML={{ __html: drawing.svg }} />
          <div className={styles.exportControls}>
            <div className={styles.optionRow}>
              <span className={styles.label}>Width</span>
              <div className={styles.inline}>
                <Segmented<number> label="Width in pixels" value={WIDTHS.includes(width) ? width : -1} options={WIDTHS.map((value) => ({ value, label: String(value) }))} onChange={setWidth} />
                <input className={styles.numberInput} type="number" min={16} max={MAX_EXPORT_WIDTH} step={1} value={width || ''} onChange={(event) => setWidth(Number(event.target.value))} aria-label="Width in pixels" />
                <span className={styles.stageUnit}>px</span>
                <Segmented<number> label="Pixel density" value={scale} options={[1, 2, 4].map((value) => ({ value, label: `${value}×` }))} onChange={setScale} />
              </div>
            </div>
            <div className={styles.optionRow}>
              <span className={styles.label}>Background</span>
              <div className={styles.inline}>
                <Segmented<Background>
                  label="Background"
                  value={background}
                  options={[{ value: 'transparent', label: 'None' }, { value: 'white', label: 'White' }, { value: 'dark', label: 'Dark' }, { value: 'custom', label: 'Colour' }]}
                  onChange={setBackground}
                />
                {background === 'custom' && <input className={styles.colourInput} type="color" value={custom} onChange={(event) => setCustom(event.target.value)} aria-label="Background colour" />}
              </div>
            </div>
            <div className={styles.optionRow}>
              <span className={styles.label}>Caption</span>
              <Segmented<number> label="Caption" value={caption ? 1 : 0} options={[{ value: 1, label: 'Value, code and size' }, { value: 0, label: 'None', title: 'The part alone: no caption and no scale bar' }]} onChange={(value) => setCaption(value === 1)} />
            </div>
            <div className={styles.optionRow}>
              <span className={styles.label}>Save as</span>
              <div className={styles.inline}>
                {IMAGE_FORMATS.map((format) => (
                  <button key={format.id} type="button" className={styles.copy} onClick={() => save(format.id)} title={`Save ${name(format.id)}`}>
                    <SaveIcon /><span>{format.label}</span>
                  </button>
                ))}
                <button type="button" className={styles.copy} onClick={saveTikz} title={`Save ${name('tex')}, for LaTeX`}>
                  <SaveIcon /><span>TikZ</span>
                </button>
              </div>
            </div>
            <div className={styles.optionRow}>
              <span className={styles.label}>Copy</span>
              <div className={styles.inline}>
                <button type="button" className={styles.copy} onClick={copyPicture} title="Copy the picture as a PNG"><CopyIcon /><span>Image</span></button>
                <button type="button" className={styles.copy} onClick={copySvg} title="Copy the SVG as text"><CopyIcon /><span>SVG</span></button>
                <button type="button" className={styles.copy} onClick={copyTikz} title="Copy the tikzpicture, for LaTeX"><CopyIcon /><span>TikZ</span></button>
              </div>
            </div>
            {drawStyle !== 'flat' && <p className={styles.exportHint}>TikZ, for LaTeX, is always the flat drawing.</p>}
            <p className={styles.exportStatus} role="status" data-failed={status?.failed ? true : undefined}>
              {status?.text ?? (
                <>
                  <span className={styles.num}>{name('png').replace(/\.png$/, '')}</span>, <span className={styles.num}>{pixels} × {height} px</span>
                  {pixels !== Math.round(width || 0) * scale ? ` (between 16 and ${MAX_EXPORT_WIDTH} px wide)` : ''}.
                  {!fill && ` Without a background the lines${caption ? ' and the caption' : ''} are dark, for light pages; JPG is saved on white.`}
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
