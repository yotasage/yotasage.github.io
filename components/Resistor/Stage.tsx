import React, { useEffect, useMemo, useState } from 'react';

import { BandRole, CHIP_SIZES, DrawStyle, colour, drawAxial, drawChip, formatOhms, formatTolerance, seriesContaining } from '../../lib/resistor';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Resistor.module.css';
import { CloseIcon, Segmented, TurnIcon } from './parts';
import { BandCount, Change, MarkSystem, PartType, Resolved, bandOptions, colourLabel, markLabel, markingChange, otherEnd, toleranceHasColour, upsideDown } from './view';

interface Props {
  resolved: Resolved;
  drawStyle: DrawStyle;
  onStyle: (style: DrawStyle) => void;
  onChange: (change: Change) => void;
}

// The drawing with the controls that change it: the hero of the page. A band is clicked to choose its colour, the
// marking of a chip is typed, and the value follows.
export default function Stage({ resolved: r, drawStyle, onStyle, onChange }: Props) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  // The marking while it is being typed; null shows the marking of the value.
  const [draft, setDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const roleName = (role: BandRole, index: number): string => {
    const ords = [t('res.st.ord1'), t('res.st.ord2'), t('res.st.ord3')];
    if (role === 'digit') return t('res.st.digitRole', { ord: ords[index] ?? String(index + 1) });
    if (role === 'multiplier') return t('res.st.multiplierRole');
    if (role === 'tolerance') return t('res.st.toleranceRole');
    return t('res.st.tcrRole');
  };
  const standing = (ohms: number) => (seriesContaining(ohms).length ? t('res.st.isStd') : t('res.st.notStd'));

  const axial = r.type === 'axial';
  const bands = r.code.ok ? r.code.bands : [];
  const shown = open !== null && open < bands.length && bands.length >= 3 ? open : null;
  const label = axial
    ? t('res.st.axialAria', { ohms: formatOhms(r.ohms), count: bands.length, colours: r.colours.map((c) => colourLabel(c, locale)).join(', ') })
    : r.marking && !r.unmarked
      ? t('res.st.chipAriaMarked', { imp: r.chip.imperial, ohms: formatOhms(r.ohms), marking: r.marking })
      : t('res.st.chipAriaUnmarked', { imp: r.chip.imperial, ohms: formatOhms(r.ohms) });

  const drawing = useMemo(() => {
    const options = { style: drawStyle, ink: 'currentColor', id: 'hero', interactive: true, label };
    return axial ? drawAxial(r.colours, r.body, r.coat.id, options) : drawChip(r.chip, r.unmarked ? null : r.marking ?? null, options);
  }, [axial, r.colours.join(), r.body, r.coat.id, r.chip, r.unmarked, r.marking, drawStyle, label]); // eslint-disable-line react-hooks/exhaustive-deps

  // A typed marking is dropped when the value changes from elsewhere.
  useEffect(() => { setDraftError(null); }, [r.ohms, r.system]);

  const options = shown === null ? [] : bandOptions(r, shown, locale);
  const other = axial ? otherEnd(r, locale) : null;
  const turned = axial ? null : upsideDown(r);

  const setBands = (n: BandCount) => {
    const tolerance = n === 3 ? 20 : toleranceHasColour(r.tolerance) ? undefined : n === 4 ? 5 : 1;
    onChange({ view: { type: 'axial', bands: n }, tolerance });
    setOpen(null);
  };

  const typeMarking = (text: string) => {
    setDraft(text);
    const change = markingChange(text, r.system, locale);
    if ('error' in change) setDraftError(change.error);
    else { setDraftError(null); onChange(change); }
  };

  const countShown = r.code.ok && bands.length >= 3 ? bands.length : r.count;

  return (
    <div className={styles.stage}>
      <div className={styles.stageBar}>
        <Segmented<PartType>
          label={t('res.st.kindAria')}
          value={r.type}
          options={[{ value: 'axial', label: t('res.st.axial') }, { value: 'chip', label: t('res.st.chip') }]}
          onChange={(type) => { onChange({ view: { type } }); setOpen(null); }}
        />
        <Segmented<DrawStyle>
          label={t('res.st.styleAria')}
          value={drawStyle}
          options={[{ value: 'realistic', label: t('res.st.realistic') }, { value: 'flat', label: t('res.st.flat') }]}
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
                label={t('res.st.bandsAria')}
                value={countShown as BandCount}
                options={[3, 4, 5, 6].map((n) => ({ value: n as BandCount, label: String(n), title: t('res.st.nBands', { n }) }))}
                onChange={setBands}
              />
              <span className={styles.stageUnit}>{t('res.st.bandsUnit')}</span>
            </div>
            <button
              type="button"
              className={styles.ghostButton}
              disabled={!other?.ok}
              onClick={() => { onChange(other.change); setOpen(null); }}
              title={other?.ok ? t('res.st.turnTitleOk', { text: other.text }) : t('res.st.turnTitleNo')}
            >
              <TurnIcon /> {t('res.st.turnBtn')}
            </button>
          </div>

          {bands.length > 0 && (
            <div className={styles.legend} role="group" aria-label={t('res.st.legendAria')}>
              {bands.map((band, i) => {
                const colName = colourLabel(band.colour, locale);
                return (
                  <button
                    key={i}
                    type="button"
                    className={styles.legendBand}
                    data-apart={band.role === 'tolerance' || band.role === 'tcr'}
                    aria-expanded={bands.length >= 3 ? shown === i : undefined}
                    aria-label={bands.length >= 3
                      ? t('res.st.bandAriaChoose', { n: i + 1, colour: colName, meaning: band.meaning })
                      : t('res.st.bandAria', { n: i + 1, colour: colName, meaning: band.meaning })}
                    disabled={bands.length < 3}
                    onClick={() => setOpen(shown === i ? null : i)}
                  >
                    <span className={styles.swatch} style={{ background: colour(band.colour).hex }} />
                    <span className={styles.bandName}>{colName}</span>
                    <span className={[styles.num, styles.bandMeaning].join(' ')}>{band.meaning}</span>
                  </button>
                );
              })}
            </div>
          )}

          {shown !== null && (
            <div className={styles.picker}>
              <div className={styles.pickerHead}>
                <span className={styles.label}>{t('res.st.bandRole', { n: shown + 1, role: roleName(bands[shown].role, shown) })}</span>
                <button type="button" className={styles.pickerClose} onClick={() => setOpen(null)} aria-label={t('res.st.closeColours')}><CloseIcon /></button>
              </div>
              <div className={styles.pickerGrid} role="radiogroup" aria-label={t('res.st.colourOfBand', { n: shown + 1 })}>
                {options.map((option) => {
                  const colName = colourLabel(option.colour, locale);
                  return (
                    <button
                      key={option.colour}
                      type="button"
                      role="radio"
                      aria-checked={option.current}
                      aria-disabled={option.disabled ? true : undefined}
                      className={styles.pickerOption}
                      title={option.disabled ?? `${colName}: ${option.meaning}`}
                      onClick={() => { if (option.change) onChange(option.change); }}
                    >
                      <span className={styles.pickerSwatch} data-none={option.colour === 'none'} style={{ background: colour(option.colour).hex }} />
                      <span className={styles.pickerName}>{colName}</span>
                      <span className={[styles.num, styles.pickerMeaning].join(' ')}>{option.meaning}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {r.code.ok === false && <p className={styles.cannot}>{r.code.error}</p>}
          {r.code.ok && r.code.note && <p className={styles.stageNote}>{r.code.note}</p>}
          {r.code.ok && bands.length >= 3 && shown === null && (
            <p className={styles.stageNote}>
              {r.example ? t('res.st.examplePrefix') : ''}{t('res.st.clickBand')}{' '}
              {!other ? null
                : !other.ok ? t('res.st.oneWay', { text: other.text })
                  : other.likely === 'more likely' ? <>{t('res.st.otherMoreLikelyPre')}<b>{formatOhms(r.ohms)}</b>{t('res.st.otherMoreLikelyMid', { doubt: other.givenDoubt ?? '' })}<b>{other.text}</b>{t('res.st.otherMoreLikelyPost')}</>
                    : other.likely === 'unlikely' ? <>{t('res.st.otherUnlikelyPre')}<b>{formatOhms(r.ohms)}</b>{t('res.st.otherUnlikelyMid')}<b>{other.text}</b>{t('res.st.otherUnlikelyPost', { doubt: other.doubt ?? '' })}</>
                      : other.doubt ? <>{t('res.st.otherBothUnusualPre')}<b>{formatOhms(r.ohms)}</b>{t('res.st.otherBothUnusualMid', { givenDoubt: other.givenDoubt ?? '' })}<b>{other.text}</b>{t('res.st.otherBothUnusualPost', { doubt: other.doubt })}</>
                        : <>{t('res.st.otherBothStdPre')}<b>{formatOhms(r.ohms)}</b>{t('res.st.otherBothStdMid')}<b>{other.text}</b>.</>}
            </p>
          )}
        </>
      ) : (
        <>
          <div className={styles.stageBar}>
            <label className={styles.stageGroup}>
              <span className={styles.stageUnit}>{t('res.st.size')}</span>
              <select className={styles.select} value={r.chip.imperial} onChange={(event) => onChange({ view: { type: 'chip', size: event.target.value } })} aria-label={t('res.st.sizeAria')}>
                {CHIP_SIZES.map((size) => <option key={size.imperial} value={size.imperial}>{size.imperial} · {size.metric} {t('res.metric')}</option>)}
              </select>
            </label>
            <Segmented<MarkSystem>
              label={t('res.st.markSysAria')}
              value={r.system}
              options={(['three', 'four', 'eia96'] as MarkSystem[]).map((value) => ({ value, label: markLabel(value, locale) }))}
              onChange={(mark) => { setDraft(null); onChange({ view: { type: 'chip', mark } }); }}
            />
          </div>

          <div className={styles.markRow}>
            <label className={styles.label} htmlFor="resistor-marking">{t('res.st.marking')}</label>
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
              {draftError ?? (r.marking ? <><span className={styles.num}>{r.markingHow}</span> · {t('res.st.chipDim', { imp: r.chip.imperial, l: r.chip.length, w: r.chip.width, metric: r.chip.metric })}</> : null)}
            </span>
          </div>

          {!r.marking && !draftError && (
            <p className={styles.cannot}>{t('res.st.cannotMark', { sys: markLabel(r.system, locale), ohms: formatOhms(r.ohms), why: r.markingWhy ?? t('res.st.noCode') })}</p>
          )}
          {r.unmarked && (
            <p className={styles.stageNote}>
              {r.chip.marked === 'no'
                ? t('res.st.unmarkedNo', { imp: r.chip.imperial, metric: r.chip.metric })
                : t('res.st.unmarkedMost', { imp: r.chip.imperial, metric: r.chip.metric })}
              {t('res.st.unmarkedMid')}{r.marking ? <>{t('res.st.unmarkedLarger')}<span className={styles.num}>{r.marking}</span></> : ''}.
            </p>
          )}
          {!r.unmarked && r.chip.marked === 'some' && <p className={styles.stageNote}>{t('res.st.someUnmarked', { imp: r.chip.imperial })}</p>}
          {r.example && <p className={styles.stageNote}>{t('res.st.chipExample')}</p>}
          {turned && (
            <p className={styles.stageNote}>
              {t('res.st.upsideDownPre')}<span className={styles.num}>{turned.code}</span>, <b>{formatOhms(turned.ohms)}</b> ({standing(turned.ohms)}).{' '}
              <button type="button" className={styles.inlineButton} onClick={() => { setDraft(null); onChange(turned.change); }}>{t('res.st.upsideDownBtn')}</button>
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
      {axial && r.code.ok && bands.length === 1 && <p className={styles.stageNote}>{t('res.st.zeroLinkNote')}</p>}
      {axial && r.code.ok && bands.length === 3 && shown === null && r.tolerance !== 20 && (
        <p className={styles.stageNote}>{t('res.st.threeBandNote', { tol: formatTolerance(20) })}</p>
      )}
    </div>
  );
}
