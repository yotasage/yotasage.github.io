import React, { useEffect, useMemo, useState } from 'react';

import { BandRole, CHIP_SIZES, DrawStyle, colour, drawAxial, drawChip, formatOhms, formatTolerance, seriesContaining } from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import { CloseIcon, Segmented, TurnIcon } from './parts';
import { BandCount, Change, MARK_LABEL, MarkSystem, PartType, Resolved, bandOptions, markingChange, otherEnd, toleranceHasColour, upsideDown } from './view';

interface Props {
  resolved: Resolved;
  drawStyle: DrawStyle;
  onStyle: (style: DrawStyle) => void;
  onChange: (change: Change) => void;
}

const ORDINAL = ['1st', '2nd', '3rd'];

function roleName(role: BandRole, index: number): string {
  if (role === 'digit') return `${ORDINAL[index]} digit`;
  if (role === 'multiplier') return 'Multiplier';
  if (role === 'tolerance') return 'Tolerance';
  return 'Temperature coefficient';
}


const standing = (ohms: number) => (seriesContaining(ohms).length ? 'a standard value' : 'not a standard value');

// The drawing with the controls that change it: the hero of the page. A band is clicked to choose its colour, the
// marking of a chip is typed, and the value follows.
export default function Stage({ resolved: r, drawStyle, onStyle, onChange }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  // The marking while it is being typed; null shows the marking of the value.
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const axial = r.type === 'axial';
  const bands = r.code.ok ? r.code.bands : [];
  const shown = open !== null && open < bands.length && bands.length >= 3 ? open : null;
  const label = axial
    ? `Axial resistor of ${formatOhms(r.ohms)} with ${bands.length} band${bands.length === 1 ? '' : 's'}: ${r.colours.join(', ')}`
    : `Chip resistor ${r.chip.imperial} of ${formatOhms(r.ohms)}${r.marking && !r.unmarked ? `, marked ${r.marking}` : ', without a marking'}`;

  const drawing = useMemo(() => {
    const options = { style: drawStyle, ink: 'currentColor', id: 'hero', interactive: true, label };
    return axial ? drawAxial(r.colours, r.body, r.coat.id, options) : drawChip(r.chip, r.unmarked ? null : r.marking ?? null, options);
  }, [axial, r.colours.join(), r.body, r.coat.id, r.chip, r.unmarked, r.marking, drawStyle, label]); // eslint-disable-line react-hooks/exhaustive-deps

  // A typed marking is dropped when the value changes from elsewhere.
  useEffect(() => { setDraftError(null); }, [r.ohms, r.system]);

  const options = shown === null ? [] : bandOptions(r, shown);
  const other = axial ? otherEnd(r) : null;
  const turned = axial ? null : upsideDown(r);

  const setBands = (n: BandCount) => {
    const tolerance = n === 3 ? 20 : toleranceHasColour(r.tolerance) ? undefined : n === 4 ? 5 : 1;
    onChange({ view: { type: 'axial', bands: n }, tolerance });
    setOpen(null);
  };

  const typeMarking = (text: string) => {
    setDraft(text);
    const change = markingChange(text, r.system);
    if ('error' in change) setDraftError(change.error);
    else { setDraftError(null); onChange(change); }
  };

  const countShown = r.code.ok && bands.length >= 3 ? bands.length : r.count;

  return (
    <div className={styles.stage}>
      <div className={styles.stageBar}>
        <Segmented<PartType>
          label="Kind of resistor"
          value={r.type}
          options={[{ value: 'axial', label: 'Axial' }, { value: 'chip', label: 'Chip' }]}
          onChange={(type) => { onChange({ view: { type } }); setOpen(null); }}
        />
        <Segmented<DrawStyle>
          label="Style of the drawing"
          value={drawStyle}
          options={[{ value: 'realistic', label: 'Realistic' }, { value: 'flat', label: 'Flat' }]}
          onChange={onStyle}
        />
      </div>

      <div className={styles.canvasWrap}>
        {shown !== null && drawing.bands[shown] && (
          <span className={styles.caret} style={{ left: `${((drawing.bands[shown].x + drawing.bands[shown].width / 2) / drawing.width) * 100}%` }} aria-hidden />
        )}
        <div
          className={styles.canvas}
          data-part={r.type}
          data-size={axial ? undefined : r.chip.imperial}
          onClick={(event) => {
            const band = (event.target as Element).closest?.('[data-band]');
            if (band && bands.length >= 3) setOpen(Number(band.getAttribute('data-band')));
          }}
          dangerouslySetInnerHTML={{ __html: drawing.svg }}
        />
      </div>

      {axial ? (
        <>
          <div className={styles.stageBar}>
            <div className={styles.stageGroup}>
              <Segmented<BandCount>
                label="Number of bands"
                value={countShown as BandCount}
                options={[3, 4, 5, 6].map((n) => ({ value: n as BandCount, label: String(n), title: `${n} bands` }))}
                onChange={setBands}
              />
              <span className={styles.stageUnit}>bands</span>
            </div>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={!other?.ok}
              onClick={() => { onChange(other.change); setOpen(null); }}
              title={other?.ok ? `Turn the part around: from the other end it reads ${other.text}` : 'From the other end this is not a code'}
            >
              <TurnIcon /> Read from the other end
            </button>
          </div>

          {bands.length > 0 && (
            <div className={styles.legend} role="group" aria-label="The bands in reading order">
              {bands.map((band, i) => (
                <button
                  key={i}
                  type="button"
                  className={styles.legendBand}
                  data-apart={band.role === 'tolerance' || band.role === 'tcr'}
                  aria-expanded={bands.length >= 3 ? shown === i : undefined}
                  aria-label={`Band ${i + 1}, ${band.colour}, ${band.meaning}${bands.length >= 3 ? ': choose a colour' : ''}`}
                  disabled={bands.length < 3}
                  onClick={() => setOpen(shown === i ? null : i)}
                >
                  <span className={styles.swatch} style={{ background: colour(band.colour).hex }} />
                  <span className={styles.bandName}>{band.colour}</span>
                  <span className={[styles.num, styles.bandMeaning].join(' ')}>{band.meaning}</span>
                </button>
              ))}
            </div>
          )}

          {shown !== null && (
            <div className={styles.picker}>
              <div className={styles.pickerHead}>
                <span className={styles.label}>Band {shown + 1} · {roleName(bands[shown].role, shown)}</span>
                <button type="button" className={styles.pickerClose} onClick={() => setOpen(null)} aria-label="Close the colours"><CloseIcon /></button>
              </div>
              <div className={styles.pickerGrid} role="radiogroup" aria-label={`Colour of band ${shown + 1}`}>
                {options.map((option) => (
                  <button
                    key={option.colour}
                    type="button"
                    role="radio"
                    aria-checked={option.current}
                    aria-disabled={option.disabled ? true : undefined}
                    className={styles.pickerOption}
                    title={option.disabled ?? `${option.colour}: ${option.meaning}`}
                    onClick={() => { if (option.change) onChange(option.change); }}
                  >
                    <span className={styles.pickerSwatch} data-none={option.colour === 'none'} style={{ background: colour(option.colour).hex }} />
                    <span className={styles.pickerName}>{option.colour === 'none' ? 'no band' : option.colour}</span>
                    <span className={[styles.num, styles.pickerMeaning].join(' ')}>{option.meaning}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {r.code.ok === false && <p className={styles.cannot}>{r.code.error}</p>}
          {r.code.ok && r.code.note && <p className={styles.stageNote}>{r.code.note}</p>}
          {r.code.ok && bands.length >= 3 && shown === null && (
            <p className={styles.stageNote}>
              {r.example ? 'An example, 4.7 kΩ. ' : ''}Click a band to choose its colour.{' '}
              {!other ? null
                : !other.ok ? <>Reads one way only. From the other end: {other.text}</>
                  : other.likely === 'more likely' ? <>As it is, this reads <b>{formatOhms(r.ohms)}</b>, which is unusual ({other.givenDoubt}). From the other end it reads <b>{other.text}</b>, which is more likely.</>
                    : other.likely === 'unlikely' ? <>Both directions are codes: <b>{formatOhms(r.ohms)}</b> and, from the other end, <b>{other.text}</b>, which is unlikely ({other.doubt}).</>
                      : other.doubt ? <>Both directions are codes, and both are unusual: <b>{formatOhms(r.ohms)}</b> ({other.givenDoubt}) and, from the other end, <b>{other.text}</b> ({other.doubt}).</>
                        : <>Both directions are codes of standard values: <b>{formatOhms(r.ohms)}</b> and, from the other end, <b>{other.text}</b>.</>}
            </p>
          )}
        </>
      ) : (
        <>
          <div className={styles.stageBar}>
            <label className={styles.stageGroup}>
              <span className={styles.stageUnit}>Size</span>
              <select className={styles.select} value={r.chip.imperial} onChange={(event) => onChange({ view: { type: 'chip', size: event.target.value } })} aria-label="Chip size, imperial and metric name">
                {CHIP_SIZES.map((size) => <option key={size.imperial} value={size.imperial}>{size.imperial} · {size.metric} metric</option>)}
              </select>
            </label>
            <Segmented<MarkSystem>
              label="Marking system"
              value={r.system}
              options={(['three', 'four', 'eia96'] as MarkSystem[]).map((value) => ({ value, label: MARK_LABEL[value] }))}
              onChange={(mark) => { setDraft(null); onChange({ view: { type: 'chip', mark } }); }}
            />
          </div>

          <div className={styles.markRow}>
            <label className={styles.label} htmlFor="resistor-marking">Marking</label>
            <input
              id="resistor-marking"
              className={styles.markInput}
              value={draft ?? r.marking ?? ''}
              placeholder="–"
              maxLength={6}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="characters"
              onChange={(event) => typeMarking(event.target.value)}
              onBlur={() => { setDraft(null); setDraftError(null); }}
              aria-describedby="resistor-marking-how"
            />
            <span className={styles.markHow} id="resistor-marking-how">
              {draftError ?? (r.marking ? <><span className={styles.num}>{r.markingHow}</span> · {r.chip.imperial} is {r.chip.length} × {r.chip.width} mm ({r.chip.metric} metric)</> : null)}
            </span>
          </div>

          {!r.marking && !draftError && (
            <p className={styles.cannot}>{MARK_LABEL[r.system]} cannot show {formatOhms(r.ohms)}: {r.markingWhy ?? 'no code'}.</p>
          )}
          {r.unmarked && (
            <p className={styles.stageNote}>
              {r.chip.marked === 'no' ? `Parts of size ${r.chip.imperial} (${r.chip.metric} metric) carry no marking` : `Most ${r.chip.imperial} (${r.chip.metric} metric) parts carry no marking`}
              , so the drawing has none{r.marking ? <>; a larger part of this value is marked <span className={styles.num}>{r.marking}</span></> : ''}.
            </p>
          )}
          {!r.unmarked && r.chip.marked === 'some' && <p className={styles.stageNote}>Some {r.chip.imperial} parts carry no marking.</p>}
          {r.example && <p className={styles.stageNote}>An example, 4.7 kΩ. Type a marking and the value follows.</p>}
          {turned && (
            <p className={styles.stageNote}>
              Upside down this reads <span className={styles.num}>{turned.code}</span>, <b>{formatOhms(turned.ohms)}</b> ({standing(turned.ohms)}).{' '}
              <button type="button" className={styles.inlineButton} onClick={() => { setDraft(null); onChange(turned.change); }}>Turn it around</button>
            </p>
          )}
        </>
      )}

      {r.fixes.length > 0 && (
        <div className={styles.fixes}>
          {r.fixes.map((fix) => (
            <button key={fix.label} type="button" className={styles.chip} onClick={() => { setDraft(null); onChange(fix); }}>{fix.label}</button>
          ))}
        </div>
      )}
      {axial && r.code.ok && bands.length === 1 && <p className={styles.stageNote}>A 0 Ω link has a single black band.</p>}
      {axial && r.code.ok && bands.length === 3 && shown === null && r.tolerance !== 20 && (
        <p className={styles.stageNote}>Three bands carry no tolerance band, which means {formatTolerance(20)}.</p>
      )}
    </div>
  );
}
