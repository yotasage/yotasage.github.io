import React from 'react';

import {
  BandCode, BandError, ReadAs, SERIES, SeriesId, colour, encodeBands, encodeMarkings, errorPct, formatError, formatOhms, formatPct,
  formatTolerance, neighbours, series, toleranceLetter, usualSeries,
} from '../../lib/resistor';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/Resistor.module.css';
import Bibliography from '../Bibliography';
import { Ohms, ValueButton } from './parts';
import { colourLabel } from './view';

interface Props {
  // The current value; undefined when nothing is read.
  ohms: number | undefined;
  // A temperature coefficient in ppm/K, when six bands were typed.
  tcr?: number;
  tolerance: number;
  stepSeries: SeriesId;
  // True when the series was chosen, false when it follows the tolerance.
  seriesChosen: boolean;
  onSeries: (id: SeriesId) => void;
  onValue: (ohms: number) => void;
  onExample: (text: string, as?: ReadAs) => void;
  // The page's list of sources, to cite from.
  bib: Bibliography;
}

const SCALES = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];

const SHORT_TOLERANCE: Record<SeriesId, string> = {
  E3: '> 20 %', E6: '20 %', E12: '10 %', E24: '5 %', E48: '2 %', E96: '1 %', E192: '≤ 0.5 %', 'E24+E96': '1 %',
};

// The value below, above and nearest in every series.
function SeriesTable({ ohms, tolerance, stepSeries, onSeries, onValue }: Props) {
  const { t } = useI18n();
  const rows = SERIES.map((s) => {
    const n = neighbours(ohms, s.id);
    return { s, n, error: errorPct(n.nearest, ohms) };
  });
  const largest = Math.max(...rows.map((r) => Math.abs(r.error)));
  const scale = SCALES.find((s) => s >= largest) ?? 100;
  const usual = usualSeries(tolerance);

  return (
    <div className={styles.table} role="table" aria-label={t('res.lu.tableAria')}>
      <div className={styles.headRow} role="row">
        <span className={styles.label} role="columnheader">{t('res.lu.series')}</span>
        <span className={styles.label} role="columnheader">{t('res.lu.nearest')}</span>
        <span className={styles.label} role="columnheader">{t('res.lu.error')}</span>
        <span className={[styles.label, styles.headScale].join(' ')} role="columnheader" title={t('res.lu.scaleTitle')}>
          {largest === 0 ? '' : `±${formatPct(scale)}`}
        </span>
        <span className={[styles.label, styles.headPair].join(' ')} role="columnheader">{t('res.lu.below')}</span>
        <span className={[styles.label, styles.headPair].join(' ')} role="columnheader">{t('res.lu.above')}</span>
      </div>
      {rows.map(({ s, n, error }) => {
        const isUsual = s.id === usual || (s.id === 'E24+E96' && usual === 'E96');
        const width = Math.min(50, (Math.abs(error) / scale) * 50);
        const tolText = t(`res.serTol.${s.id}` as TranslationKey);
        return (
          <div key={s.id} className={styles.row} role="row">
            <button
              type="button"
              role="radio"
              aria-checked={s.id === stepSeries}
              className={styles.seriesCell}
              onClick={() => onSeries(s.id)}
              title={t('res.lu.seriesBtnTitle', { series: s.label, tol: tolText })}
            >
              <span className={styles.seriesMark} />
              <span className={styles.seriesName}>{s.label}</span>
              <span className={styles.seriesTol} data-usual={isUsual}>{SHORT_TOLERANCE[s.id]}</span>
            </button>
            <span role="cell">
              <ValueButton ohms={n.nearest} onPick={onValue} className={styles.nearest} />
            </span>
            <span role="cell" className={[styles.num, styles.error].join(' ')}>
              {n.exact ? <span className={styles.exact}>{t('res.exact')}</span> : formatError(error)}
            </span>
            <span role="cell" className={styles.errorBar} data-exact={n.exact} aria-hidden>
              {n.exact
                ? <span className={styles.errorDot} />
                : <span className={styles.errorFill} style={error < 0 ? { right: '50%', width: `${width}%` } : { left: '50%', width: `${width}%` }} />}
            </span>
            <span className={styles.flanks}>
              {([[t('res.lu.belowLow'), n.below], [t('res.lu.aboveLow'), n.above]] as [string, number][]).map(([name, value]) => (
                <span key={name} className={styles.flank} role="cell">
                  <span className={styles.flankLabel}>{name}</span>
                  <ValueButton ohms={value} onPick={onValue} className={styles.flankValue} />
                  <span className={[styles.num, styles.flankError].join(' ')}>{formatError(errorPct(value, ohms))}</span>
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Strip({ title, code }: { title: string; code: BandCode | BandError }) {
  const { locale } = useI18n();
  return (
    <div>
      <div className={styles.codeHead}>
        <span className={styles.label}>{title}</span>
        {code.ok && <span className={[styles.num, styles.codeFormula].join(' ')}>{code.formula}{code.tolerance !== undefined && code.ohms > 0 ? ` ${formatTolerance(code.tolerance)}` : ''}</span>}
      </div>
      {code.ok ? (
        <>
          <div className={styles.strip} role="list" aria-label={`${title}: ${code.bands.map((b) => colourLabel(b.colour, locale)).join(', ')}`}>
            {code.bands.map((band, i) => (
              <div key={i} className={styles.band} role="listitem" data-apart={band.role === 'tolerance' || band.role === 'tcr'}>
                <span className={styles.swatch} style={{ background: colour(band.colour).hex }} />
                <span className={styles.bandName}>{colourLabel(band.colour, locale)}</span>
                <span className={[styles.num, styles.bandMeaning].join(' ')}>{band.meaning}</span>
              </div>
            ))}
          </div>
          {code.note && <p className={styles.codeNote}>{code.note}</p>}
        </>
      ) : <p className={styles.cannot}>{(code as BandError).error}</p>}
    </div>
  );
}

function Marking({ title, code, how, why, withLetter }: { title: string; code?: string; how?: string; why?: string; withLetter?: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.marking}>
      <span className={styles.label}>{title}</span>
      <span className={[styles.num, styles.markingCode].join(' ')} data-none={!code}>{code ?? '–'}</span>
      <div className={styles.markingHow}>
        {code ? how : t('res.lu.noneWhy', { why: why ?? '' })}
        {code && withLetter && <div>{t('res.lu.withTolerance')} <span className={styles.num}>{code}{withLetter}</span></div>}
      </div>
    </div>
  );
}

function Guide({ onExample }: { onExample: (text: string, as?: ReadAs) => void }) {
  const { t } = useI18n();
  // The third entry is what the examples of the row are read as, where a text could be both.
  const rows: [string[], string, ReadAs?][] = [
    [['4k7', '4.7k', '4,7 kΩ', '4700', '1M5', '10m'], t('res.lu.guide1'), 'value'],
    [['472', '4992', '4R7', '103J', '01C', 'R005'], t('res.lu.guide2'), 'marking'],
    [['yellow violet red gold', 'brn blk blk red brn'], t('res.lu.guide3')],
    [['4k7 1%', '101', '601'], t('res.lu.guide4')],
  ];
  return (
    <dl className={styles.guide}>
      {rows.map(([examples, what, as]) => (
        <React.Fragment key={what}>
          <dt>{examples.map((example) => <button key={example} type="button" className={styles.chip} onClick={() => onExample(example, as)}>{example}</button>)}</dt>
          <dd>{what}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// The Lookup section: standard values, colour bands and markings of the current value.
export default function Lookup(props: Props) {
  const { t } = useI18n();
  const { ohms, tcr, tolerance, stepSeries, seriesChosen, onExample, bib } = props;

  if (ohms === undefined) {
    return (
      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>{t('res.lu.whatType')}</h3>
          <span className={styles.blockMeta}>{t('res.lu.asYouType')}</span>
        </div>
        <Guide onExample={onExample} />
      </div>
    );
  }

  const markings = encodeMarkings(ohms);
  const letter = toleranceLetter(tolerance);
  const stepName = series(stepSeries).label;

  return (
    <>
      {ohms > 0 && (
        <div className={styles.block}>
          <div className={styles.blockHead}>
            <h3>{t('res.lu.stdValues')}</h3>
            <span className={styles.blockMeta}>{t('res.lu.around')} <Ohms ohms={ohms} /></span>
          </div>
          <SeriesTable {...props} />
          <p className={styles.caption}>
            {t('res.lu.errCaptionPre')}<span className={styles.num}>{formatOhms(ohms)}</span>) / <span className={styles.num}>{formatOhms(ohms)}</span>{t('res.lu.errCaptionMid')}
            <span className={styles.keys}><span className={styles.key}>↑</span> <span className={styles.key}>↓</span></span>{t('res.lu.stepThrough')}<b>{stepName}</b>
            {seriesChosen ? '' : t('res.lu.usualFor', { tol: formatTolerance(tolerance) })}{t('res.lu.clickSeries')}
          </p>
          <p className={styles.caption}>
            {t('res.lu.seriesUsualPre')}{bib.cite('VishayBasics')}{t('res.lu.moreIn')}<a href="#theory-series" className={styles.textLink}>{t('res.lu.theoryLink')}</a>.
          </p>
        </div>
      )}

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>{t('res.lu.colourBands')}</h3>
          <span className={styles.blockMeta}>IEC 60062 {bib.cite('IEC60062')}{t('res.lu.iecAt', { tol: formatTolerance(tolerance) })}</span>
        </div>
        {ohms === 0 ? (
          <div className={styles.codes}><Strip title={t('res.lu.link')} code={encodeBands(0, 4)} /></div>
        ) : (
          <div className={styles.codes}>
            <Strip title={t('res.lu.bands4')} code={encodeBands(ohms, 4, tolerance)} />
            <Strip title={t('res.lu.bands5')} code={encodeBands(ohms, 5, tolerance)} />
            {tcr !== undefined && <Strip title={t('res.lu.bands6')} code={encodeBands(ohms, 6, tolerance, tcr)} />}
          </div>
        )}
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>{t('res.lu.smdMarking')}</h3>
          <span className={styles.blockMeta}>{t('res.lu.asPrinted')}</span>
        </div>
        <div className={styles.markings}>
          <Marking title={t('res.lu.chars3')} code={markings.three} how={markings.how.three} why={markings.why.three} withLetter={ohms > 0 ? letter : undefined} />
          <Marking title={t('res.lu.chars4')} code={markings.four} how={markings.how.four} why={markings.why.four} withLetter={ohms > 0 ? letter : undefined} />
          <Marking title={t('res.lu.eia96')} code={markings.eia96} how={markings.how.eia96} why={markings.why.eia96} />
          {markings.milli && <Marking title={t('res.lu.milliohms')} code={markings.milli} how={markings.how.milli} />}
        </div>
        <p className={styles.caption}>
          {t('res.lu.smdNote1')}{bib.cite('YageoRC')}{t('res.lu.smdNote2')}
          {ohms > 0 && markings.eia96 && tolerance !== 1 ? t('res.lu.smdNoteNotAt', { tol: formatTolerance(tolerance) }) : ''}.
        </p>
      </div>
    </>
  );
}
