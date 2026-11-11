import React from 'react';

import {
  BandCode, BandError, ReadAs, SERIES, SeriesId, colour, encodeBands, encodeMarkings, errorPct, formatError, formatOhms, formatPct,
  formatTolerance, neighbours, series, toleranceLetter, usualSeries,
} from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import Bibliography from '../Bibliography';
import { Ohms, ValueButton } from './parts';

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
  const rows = SERIES.map((s) => {
    const n = neighbours(ohms, s.id);
    return { s, n, error: errorPct(n.nearest, ohms) };
  });
  const largest = Math.max(...rows.map((r) => Math.abs(r.error)));
  const scale = SCALES.find((s) => s >= largest) ?? 100;
  const usual = usualSeries(tolerance);

  return (
    <div className={styles.table} role="table" aria-label="Standard values in every series">
      <div className={styles.headRow} role="row">
        <span className={styles.label} role="columnheader">Series</span>
        <span className={styles.label} role="columnheader">Nearest</span>
        <span className={styles.label} role="columnheader">Error</span>
        <span className={[styles.label, styles.headScale].join(' ')} role="columnheader" title="The bar runs from the wanted value in the middle to this error at either end">
          {largest === 0 ? '' : `±${formatPct(scale)}`}
        </span>
        <span className={[styles.label, styles.headPair].join(' ')} role="columnheader">Below</span>
        <span className={[styles.label, styles.headPair].join(' ')} role="columnheader">Above</span>
      </div>
      {rows.map(({ s, n, error }) => {
        const isUsual = s.id === usual || (s.id === 'E24+E96' && usual === 'E96');
        const width = Math.min(50, (Math.abs(error) / scale) * 50);
        return (
          <div key={s.id} className={styles.row} role="row">
            <button
              type="button"
              role="radio"
              aria-checked={s.id === stepSeries}
              className={styles.seriesCell}
              onClick={() => onSeries(s.id)}
              title={`Step through ${s.label} with the arrow keys. Usual tolerance: ${s.tolerance}.`}
            >
              <span className={styles.seriesMark} />
              <span className={styles.seriesName}>{s.label}</span>
              <span className={styles.seriesTol} data-usual={isUsual}>{SHORT_TOLERANCE[s.id]}</span>
            </button>
            <span role="cell">
              <ValueButton ohms={n.nearest} onPick={onValue} className={styles.nearest} />
            </span>
            <span role="cell" className={[styles.num, styles.error].join(' ')}>
              {n.exact ? <span className={styles.exact}>exact</span> : formatError(error)}
            </span>
            <span role="cell" className={styles.errorBar} data-exact={n.exact} aria-hidden>
              {n.exact
                ? <span className={styles.errorDot} />
                : <span className={styles.errorFill} style={error < 0 ? { right: '50%', width: `${width}%` } : { left: '50%', width: `${width}%` }} />}
            </span>
            <span className={styles.flanks}>
              {([['below', n.below], ['above', n.above]] as [string, number][]).map(([name, value]) => (
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
  return (
    <div>
      <div className={styles.codeHead}>
        <span className={styles.label}>{title}</span>
        {code.ok && <span className={[styles.num, styles.codeFormula].join(' ')}>{code.formula}{code.tolerance !== undefined && code.ohms > 0 ? ` ${formatTolerance(code.tolerance)}` : ''}</span>}
      </div>
      {code.ok ? (
        <>
          <div className={styles.strip} role="list" aria-label={`${title}: ${code.bands.map((b) => b.colour).join(', ')}`}>
            {code.bands.map((band, i) => (
              <div key={i} className={styles.band} role="listitem" data-apart={band.role === 'tolerance' || band.role === 'tcr'}>
                <span className={styles.swatch} style={{ background: colour(band.colour).hex }} />
                <span className={styles.bandName}>{band.colour}</span>
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
  return (
    <div className={styles.marking}>
      <span className={styles.label}>{title}</span>
      <span className={[styles.num, styles.markingCode].join(' ')} data-none={!code}>{code ?? '–'}</span>
      <div className={styles.markingHow}>
        {code ? how : `None: ${why}.`}
        {code && withLetter && <div>with tolerance <span className={styles.num}>{code}{withLetter}</span></div>}
      </div>
    </div>
  );
}

function Guide({ onExample }: { onExample: (text: string, as?: ReadAs) => void }) {
  // The third entry is what the examples of the row are read as, where a text could be both.
  const rows: [string[], string, ReadAs?][] = [
    [['4k7', '4.7k', '4,7 kΩ', '4700', '1M5', '10m'], 'A value in any notation: with a decimal point or comma, a multiplier (m, k, M or Meg, G), or the letter in place of the point.', 'value'],
    [['472', '4992', '4R7', '103J', '01C', 'R005'], 'The marking of a chip resistor: three or four digits, R as the decimal point, a tolerance letter, EIA-96 or milliohms. Digits alone are a value first: these examples set “Read as” to Marking, beside the field.', 'marking'],
    [['yellow violet red gold', 'brn blk blk red brn'], 'The colours of 3 to 6 bands, as names or abbreviations, from either end.'],
    [['4k7 1%', '101', '601'], 'A tolerance after the value. A text that reads several ways (101 is 101 Ω, and 100 Ω as a marking), also upside down, shows every reading: pick one.'],
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
  const { ohms, tcr, tolerance, stepSeries, seriesChosen, onExample, bib } = props;

  if (ohms === undefined) {
    return (
      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>What you can type</h3>
          <span className={styles.blockMeta}>Results follow as you type</span>
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
            <h3>Standard values</h3>
            <span className={styles.blockMeta}>around <Ohms ohms={ohms} /></span>
          </div>
          <SeriesTable {...props} />
          <p className={styles.caption}>
            An error is (standard value − <span className={styles.num}>{formatOhms(ohms)}</span>) / <span className={styles.num}>{formatOhms(ohms)}</span>: positive when the standard value is the larger one. Click a value to use it.{' '}
            <span className={styles.keys}><span className={styles.key}>↑</span> <span className={styles.key}>↓</span></span> in the field step through <b>{stepName}</b>
            {seriesChosen ? '' : `, the series usual for ${formatTolerance(tolerance)}`}; click a series to step through that one.
          </p>
          <p className={styles.caption}>
            A series is usual for a tolerance when its steps are about twice that tolerance, so that the ranges of neighbouring values just meet {bib.cite('VishayBasics')}: more
            in <a href="#theory-series" className={styles.textLink}>Theory</a>.
          </p>
        </div>
      )}

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>Colour bands</h3>
          <span className={styles.blockMeta}>IEC 60062 {bib.cite('IEC60062')}, at {formatTolerance(tolerance)}</span>
        </div>
        {ohms === 0 ? (
          <div className={styles.codes}><Strip title="Link" code={encodeBands(0, 4)} /></div>
        ) : (
          <div className={styles.codes}>
            <Strip title="4 bands" code={encodeBands(ohms, 4, tolerance)} />
            <Strip title="5 bands" code={encodeBands(ohms, 5, tolerance)} />
            {tcr !== undefined && <Strip title="6 bands" code={encodeBands(ohms, 6, tolerance, tcr)} />}
          </div>
        )}
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>SMD marking</h3>
          <span className={styles.blockMeta}>as printed on chip resistors</span>
        </div>
        <div className={styles.markings}>
          <Marking title="3 characters" code={markings.three} how={markings.how.three} why={markings.why.three} withLetter={ohms > 0 ? letter : undefined} />
          <Marking title="4 characters" code={markings.four} how={markings.how.four} why={markings.why.four} withLetter={ohms > 0 ? letter : undefined} />
          <Marking title="EIA-96" code={markings.eia96} how={markings.how.eia96} why={markings.why.eia96} />
          {markings.milli && <Marking title="Milliohms" code={markings.milli} how={markings.how.milli} />}
        </div>
        <p className={styles.caption}>
          The last digit of a code is the number of zeros that follow the others. Sizes 01005 to 0402 usually carry no marking; 0603 carries three characters at 5 % and
          EIA-96 at 1 %, larger sizes four characters at 1 % {bib.cite('YageoRC')}.
          EIA-96 is used on 1 % parts{ohms > 0 && markings.eia96 && tolerance !== 1 ? `, so not at ${formatTolerance(tolerance)}` : ''}.
        </p>
      </div>
    </>
  );
}
