import React from 'react';

import {
  AXIAL_BODIES, CHIP_SIZES, COLOURS, ColourInfo, decompose, formatOhms, formatTolerance, neighbours, pow10Text, series,
} from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import Bibliography from '../Bibliography';
import { Change, Resolved, bandOptions, markedSize, markingExample, thirdDigit, toleranceHasColour } from './view';

interface Props {
  resolved: Resolved;
  onChange: (change: Change) => void;
  bib: Bibliography;
}

// Digits first, as the code is learnt; then the colours that are only multipliers or tolerances.
const ORDER = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white', 'gold', 'silver', 'pink', 'none'];
const TABLE_COLOURS = ORDER.map((name) => COLOURS.find((c) => c.name === name));

// EIA-96 multiplier letters (docs/resistor/facts.md); the first of two letters is the usual one. S and R as in TT
// Electronics' table; other tables pair them the other way round, which the caption says.
const EIA96_LETTERS: [string, number][] = [['Z', -3], ['Y or S', -2], ['X or R', -1], ['A', 0], ['B or H', 1], ['C', 2], ['D', 3], ['E', 4], ['F', 5]];

const MARKING_RULES: { what: React.ReactNode; examples: [string, string][]; cite?: string }[] = [
  { what: 'Three digits: two digits, then the number of zeros that follow.', cite: 'TTTN004', examples: [['472', '4.7 kΩ'], ['220', '22 Ω'], ['101', '100 Ω'], ['100', '10 Ω']] },
  { what: 'Four digits: three digits, then the number of zeros.', examples: [['4992', '49.9 kΩ'], ['7500', '750 Ω'], ['1001', '1 kΩ']] },
  { what: 'R is the decimal point, and then there is no number of zeros.', cite: 'TTTN004', examples: [['4R7', '4.7 Ω'], ['0R22', '0.22 Ω'], ['R005', '5 mΩ'], ['68R0', '68 Ω']] },
  { what: 'A link (jumper) is marked with zeros only.', examples: [['0', '0 Ω'], ['000', '0 Ω'], ['0000', '0 Ω']] },
  { what: 'A tolerance letter may follow: F ±1 %, G ±2 %, J ±5 %, K ±10 %, M ±20 %.', examples: [['103J', '10 kΩ ±5 %'], ['1001F', '1 kΩ ±1 %']] },
  { what: 'Milliohms: some makers of shunts use M or m as the decimal point, which also means mega, so both readings are shown. Vishay marks values under 0.1 Ω with L as the decimal point of a value in milliohms.', cite: 'VishayMarking', examples: [['5L0', '5 mΩ'], ['1M50', '1.5 mΩ or 1.5 MΩ']] },
  { what: 'EIA-96, on 1 % parts: two digits number the E96 value (table below), and a letter is the multiplier.', cite: 'TTTN004', examples: [['01C', '10 kΩ'], ['68X', '49.9 Ω'], ['47B', '3.01 kΩ']] },
  { what: 'A marking can be another marking upside down. An underline means different things by maker: a 1 % part, which way is up, or a value in milliohms.', examples: [['601', '600 Ω, or 109'], ['109', '1 Ω, or 601']] },
];

function Swatch({ info }: { info: ColourInfo }) {
  return <span className={styles.refSwatch} data-none={info.name === 'none'} style={{ background: info.hex }} />;
}

// The Reference section: the tables behind the tool. The entries of the current value are marked, and a click on a
// colour, a code or a size uses it.
export default function Reference({ resolved: r, onChange, bib }: Props) {
  const live = !r.example;
  const bands = r.code.ok ? r.code.bands : [];
  const coded = bands.length >= 3;
  const at = (role: string) => bands.findIndex((b) => b.role === role);
  const digitCount = coded ? bands.filter((b) => b.role === 'digit').length : 0;
  const PLACES = ['first', 'second', 'third'];

  // A cell of the colour table: whether it is the band of the current part, what a click does, or why it does nothing.
  interface Cell { on: boolean; title: string; change?: Change; off?: string }

  // A digit column: the colour takes that place in the code. The third digit is added to a part with two digits
  // (which then has five bands) and taken away again by a click on the cell that is marked.
  const digitCell = (info: ColourInfo, place: number): Cell => {
    const title = `Use ${info.name} as the ${PLACES[place]} digit`;
    if (!coded) return { on: false, title, off: r.code.ok === false ? r.code.error : 'A link has one black band and no digits.' };
    if (place < digitCount) {
      const option = bandOptions(r, place).find((o) => o.colour === info.name);
      if (place === 2 && option?.current) {
        const without = thirdDigit(r, null);
        return 'error' in without ? { on: true, title, off: without.error } : { on: true, title: 'Take the third digit away: a part with four bands', change: without };
      }
      return { on: !!option?.current, title, change: option?.change, off: option?.disabled ?? (option ? undefined : 'Not a digit here.') };
    }
    const added = thirdDigit(r, info.digit);
    return 'error' in added ? { on: false, title, off: added.error } : { on: false, title: `Add ${info.digit} as a third digit: a part with five bands`, change: added };
  };

  const bandCell = (info: ColourInfo, role: 'multiplier' | 'tolerance' | 'tcr'): Cell => {
    const on = coded && bands.some((b) => b.colour === info.name && b.role === role);
    if (role === 'tolerance') {
      const count = info.name === 'none' ? 3 : bands.length >= 4 ? bands.length as 4 | 5 | 6 : 4;
      return { on: on || (info.name === 'none' && bands.length === 3), title: `Use ${formatTolerance(info.tolerance)}`, change: { tolerance: info.tolerance, view: { type: 'axial', bands: count } } };
    }
    if (role === 'tcr') {
      if (on) return { on, title: 'Take the temperature coefficient away: a part with five bands', change: { view: { type: 'axial', bands: 5, tcr: null } } };
      return { on, title: `Use ${info.tcr} ppm/K, on a part with six bands`, change: { tolerance: toleranceHasColour(r.tolerance) ? undefined : 1, view: { type: 'axial', bands: 6, tcr: info.tcr } } };
    }
    const title = `Use ${info.name} as the multiplier`;
    if (!coded) return { on: false, title, off: r.code.ok === false ? r.code.error : 'A link has one black band and no multiplier.' };
    const option = bandOptions(r, at('multiplier')).find((o) => o.colour === info.name);
    return { on, title, change: option?.change, off: option?.disabled };
  };

  const cell = (c: Cell, content: React.ReactNode) => (
    <td data-on={(live && c.on) || undefined}>
      <button type="button" className={styles.refCell} aria-disabled={c.off ? true : undefined} aria-pressed={live && c.on} title={c.off ?? c.title} onClick={() => { if (!c.off && c.change) onChange(c.change); }}>
        {content}
      </button>
    </td>
  );
  const empty = <td><span className={styles.refNone}>–</span></td>;

  const e96 = series('E96').mantissas;
  const parts = r.ohms > 0 ? decompose(r.ohms, 3) : null;
  const exp = parts && parts.exp >= -3 && parts.exp <= 5 ? parts.exp : 1;
  const mantissa = parts?.exact && e96.includes(parts.mantissa) ? parts.mantissa : null;
  const nearest = mantissa ?? (r.ohms > 0 ? decompose(neighbours(r.ohms, 'E96').nearest, 3).mantissa : 100);
  // As a click on an example of a marking: a chip marked in this system, of a size that carries a marking.
  const useE96 = (m: number, e: number) => onChange({ ohms: Number(`${m}e${e}`), tolerance: 1, view: { type: 'chip', mark: 'eia96', ...markedSize(r) } });

  return (
    <>
      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>Colour code</h3>
          <span className={styles.blockMeta}>IEC 60062:2016 {bib.cite('IEC60062')} {bib.cite('WikiColor')}</span>
        </div>
        <div className={styles.scroll}>
          <table className={[styles.ref, styles.refBands].join(' ')}>
            <thead>
              <tr>
                <th scope="col">Colour</th>
                <th scope="col">1st<br />digit</th>
                <th scope="col">2nd<br />digit</th>
                <th scope="col">3rd<br />digit</th>
                <th scope="col">Multiplier</th>
                <th scope="col">Tolerance</th>
                <th scope="col">TCR<br />ppm/K</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_COLOURS.map((info) => (
                <tr key={info.name}>
                  <th scope="row">
                    <span className={styles.refColour}><Swatch info={info} /><span className={styles.refName}>{info.name === 'none' ? 'No band' : info.name[0].toUpperCase() + info.name.slice(1)}</span><span className={styles.refCode}>{info.code}</span></span>
                  </th>
                  {[0, 1, 2].map((place) => (info.digit !== undefined
                    ? <React.Fragment key={place}>{cell(digitCell(info, place), <span className={styles.num}>{info.digit}</span>)}</React.Fragment>
                    : <React.Fragment key={place}>{empty}</React.Fragment>))}
                  {info.exp !== undefined ? cell(bandCell(info, 'multiplier'), <span className={styles.num}>× {pow10Text(info.exp)}</span>) : empty}
                  {info.tolerance !== undefined
                    ? cell(bandCell(info, 'tolerance'), <><span className={styles.num}>{formatTolerance(info.tolerance)}</span><span className={styles.refLetter}>{info.toleranceLetter}</span></>)
                    : empty}
                  {info.tcr !== undefined
                    ? cell(bandCell(info, 'tcr'), <><span className={styles.num}>{info.tcr}</span><span className={styles.refLetter}>{info.tcrLetter}</span></>)
                    : empty}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>
          Each column is a band: a click sets it, and draws the axial part. A third digit makes a part with five bands and a TCR one with six;
          a click on the marked third digit or TCR takes that band away again.
        </p>
        <ul className={styles.notes}>
          <li><b>3 bands:</b> two digits and a multiplier, ±20 %. <b>4 bands:</b> plus the tolerance. <b>5 bands:</b> three digits. <b>6 bands:</b> plus the temperature coefficient (TCR) {bib.cite('VishayMarking')}.</li>
          <li>The tolerance band is set apart by a wider gap, and gold, silver or pink is never the first band. When a part reads both ways, a reading is unlikely when its value is outside 1 mΩ to 1 GΩ or in no E-series, or when its tolerance does not fit its series: a value found only in E192 is not made at ±1 %.</li>
          <li>A single black band is a <button type="button" className={styles.inlineButton} onClick={() => onChange({ ohms: 0, view: { type: 'axial' } })}>0 Ω link</button> (jumper).</li>
          <li><b>Grey</b> as a tolerance is ±0.01 % in the standard; older EIA tables, still shown by some distributors, read it as ±0.05 % (A) {bib.cite('WikiColor')}.</li>
          <li>The <b>orange</b> and <b>yellow</b> tolerances and the <b>pink</b> multiplier date from the 2016 edition and are missing from many tables. High-voltage parts use yellow for ±5 % and grey for ±10 %, to avoid metallic paint {bib.cite('WikiColor')}.</li>
          <li>The letters are those of the standard for tolerance and temperature coefficient, as printed on parts and in part numbers.</li>
        </ul>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>SMD markings</h3>
          <span className={styles.blockMeta}>click an example to read it and draw it on a chip</span>
        </div>
        <dl className={styles.rules}>
          {MARKING_RULES.map((rule, i) => (
            <React.Fragment key={i}>
              <dt>
                {rule.examples.map(([code, value]) => (
                  <button key={code} type="button" className={styles.ruleExample} onClick={() => onChange(markingExample(code, r))} title={`Try ${code}: read as a marking and drawn on a chip`}>
                    <span className={styles.chip}>{code}</span><span className={styles.ruleValue}>{value}</span>
                  </button>
                ))}
              </dt>
              <dd>{rule.what}{rule.cite && <> {bib.cite(rule.cite)}</>}</dd>
            </React.Fragment>
          ))}
        </dl>
        <p className={styles.caption}>Sizes 01005 to 0402 usually carry no marking; 0603 carries three characters at 5 % and EIA-96 at 1 %, larger sizes four characters at 1 % {bib.cite('YageoRC')}.</p>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>EIA-96 codes</h3>
          <span className={styles.blockMeta}>code, then the E96 value it stands for</span>
        </div>
        <div className={styles.letters} role="group" aria-label="Multiplier letters">
          {EIA96_LETTERS.map(([letter, e]) => (
            <button key={letter} type="button" className={styles.letter} data-on={(live && mantissa !== null && e === parts.exp) || undefined} onClick={() => useE96(nearest, e)} title={`Use the multiplier ${pow10Text(e)}`}>
              <span className={styles.letterName}>{letter}</span>
              <span className={styles.num}>× {e < 0 ? Number(`1e${e}`) : e < 3 ? 10 ** e : `${10 ** (e - 3)} k`}</span>
            </button>
          ))}
        </div>
        <div className={styles.eia} role="group" aria-label="The 96 codes">
          {e96.map((value, i) => (
            <button key={value} type="button" className={styles.eiaCell} data-on={(live && value === mantissa) || undefined} onClick={() => useE96(value, exp)} title={`Use ${formatOhms(Number(`${value}e${exp}`))}`}>
              <span className={styles.eiaCode}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.eiaValue}>{value}</span>
            </button>
          ))}
        </div>
        <p className={styles.caption}>
          The value is the three digits times the multiplier of the letter: <span className={styles.num}>01C</span> is 100 × 100 = 10 kΩ.
          The multiplier F collides with the tolerance letter F, and R and E with the letters used for ohms, so such a code can read two ways.
        </p>
        <p className={styles.caption} data-testid="eia96-note">
          <b>R and S:</b> makers do not agree on which of the two is × 0.01 and which × 0.1. The table follows TT Electronics, with S beside Y and R beside X {bib.cite('TTTN004')};
          other tables pair them the other way round, so a code with R or S is read both ways, this one first. Z and F are not in that table.
        </p>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>Chip sizes</h3>
          <span className={styles.blockMeta}>power and voltage are typical: they differ by maker and series</span>
        </div>
        <div className={styles.scroll}>
          <table className={[styles.ref, styles.refSizes].join(' ')}>
            <thead>
              <tr>
                <th scope="col">Imperial</th>
                <th scope="col">Metric</th>
                <th scope="col">L × W, mm</th>
                <th scope="col">Power at 70 °C</th>
                <th scope="col">Limiting voltage</th>
                <th scope="col">Marked</th>
              </tr>
            </thead>
            <tbody>
              {CHIP_SIZES.map((size) => (
                <tr key={size.imperial} data-on={(r.type === 'chip' && size === r.chip) || undefined} className={styles.refRow} onClick={() => onChange({ view: { type: 'chip', size: size.imperial } })}>
                  <th scope="row"><button type="button" className={[styles.num, styles.refRowButton].join(' ')} title={`Draw a ${size.imperial} chip`}>{size.imperial}{size.unverified ? ' *' : ''}</button></th>
                  <td><span className={styles.num}>{size.metric}</span></td>
                  <td><span className={styles.num}>{size.length} × {size.width}</span></td>
                  <td><span className={styles.num}>{size.power} W</span></td>
                  <td>{size.voltage ? <><span className={styles.num}>{size.voltage} V</span>{size.voltageNote && <span className={styles.refAlso}> ({size.voltageNote})</span>}</> : <span className={styles.refNone}>–</span>}</td>
                  <td>{{ no: 'no', rarely: 'rarely', some: 'mostly', yes: 'yes' }[size.marked]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>
          Imperial 0402 and metric 0402 are different parts, as are 0603 and 0603. Ratings vary: 0603 parts are rated 0.1 or 0.125 W, 0805 parts 0.125 or 0.25 W,
          and 2512 parts up to 2 W. A voltage shown as – was not found. Sizes, powers and voltages are those of general-purpose thick film
          chips {bib.cite('YageoRC')} {bib.cite('VishayCRCW')} {bib.cite('VishayCRCW0201')}; the voltage is Yageo’s, with Vishay’s where it differs.
        </p>
        <p className={styles.caption}>
          The power holds up to 70 °C around the part. Above that it falls in a straight line to nothing at 155 °C, or at 125 °C for the two smallest sizes {bib.cite('YageoRC')}:
          the curve is in <a href="#theory-power" className={styles.textLink}>Theory</a>. * The 1812 row is not verified: no datasheet was found, and makers list 1218 (3.2 × 4.6 mm, 1 W) instead.
        </p>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>Axial bodies</h3>
          <span className={styles.blockMeta}>a carbon film series {bib.cite('YageoCFR')}</span>
        </div>
        <div className={styles.scroll}>
          <table className={[styles.ref, styles.refSizes].join(' ')}>
            <thead>
              <tr>
                <th scope="col">Rating</th>
                <th scope="col">Body length, mm</th>
                <th scope="col">Body ⌀, mm</th>
                <th scope="col">Lead ⌀, mm</th>
              </tr>
            </thead>
            <tbody>
              {AXIAL_BODIES.map((body, i) => (
                <tr key={body.rating} data-on={(r.type === 'axial' && body === r.body) || undefined} className={styles.refRow} onClick={() => onChange({ view: { type: 'axial', body: i } })}>
                  <th scope="row"><button type="button" className={[styles.num, styles.refRowButton].join(' ')} title={`Draw the ${body.rating} body`}>{body.rating}</button></th>
                  <td><span className={styles.num}>{body.length}</span></td>
                  <td><span className={styles.num}>{body.diameter}</span></td>
                  <td><span className={styles.num}>{body.leadDiameter}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>The body size does not fix the rating: a metal film part in the 1/4 W body (6.5 × 2.5 mm at most) is rated 0.6 W {bib.cite('VishayMRS')}. Sizes differ a little by maker.</p>
      </div>
    </>
  );
}
