import React from 'react';

import {
  AXIAL_BODIES, CHIP_SIZES, COLOURS, ColourInfo, decompose, formatOhms, formatTolerance, neighbours, pow10Text, series,
} from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import { Change, Resolved, bandOptions, toleranceHasColour } from './view';

interface Props {
  resolved: Resolved;
  onChange: (change: Change) => void;
  // Puts a text into the field, as if typed.
  onText: (text: string) => void;
}

// Digits first, as the code is learnt; then the colours that are only multipliers or tolerances.
const ORDER = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white', 'gold', 'silver', 'pink', 'none'];
const TABLE_COLOURS = ORDER.map((name) => COLOURS.find((c) => c.name === name));

// EIA-96 multiplier letters (docs/resistor/facts.md); the first of two letters is the usual one.
const EIA96_LETTERS: [string, number][] = [['Z', -3], ['Y or R', -2], ['X or S', -1], ['A', 0], ['B or H', 1], ['C', 2], ['D', 3], ['E', 4], ['F', 5]];

const MARKING_RULES: { what: React.ReactNode; examples: [string, string][] }[] = [
  { what: 'Three digits: two digits, then the number of zeros that follow.', examples: [['472', '4.7 kΩ'], ['220', '22 Ω'], ['101', '100 Ω'], ['100', '10 Ω']] },
  { what: 'Four digits: three digits, then the number of zeros.', examples: [['4992', '49.9 kΩ'], ['7500', '750 Ω'], ['1001', '1 kΩ']] },
  { what: 'R is the decimal point, and then there is no number of zeros.', examples: [['4R7', '4.7 Ω'], ['0R22', '0.22 Ω'], ['R005', '5 mΩ'], ['68R0', '68 Ω']] },
  { what: 'A link (jumper) is marked with zeros only.', examples: [['0', '0 Ω'], ['000', '0 Ω'], ['0000', '0 Ω']] },
  { what: 'A tolerance letter may follow: F ±1 %, G ±2 %, J ±5 %, K ±10 %, M ±20 %.', examples: [['103J', '10 kΩ ±5 %'], ['1001F', '1 kΩ ±1 %']] },
  { what: 'Milliohms: L is the decimal point of a value in milliohms. Some makers of shunts use M or m instead, which also means mega: both readings are shown.', examples: [['5L0', '5 mΩ'], ['1M50', '1.5 mΩ or 1.5 MΩ']] },
  { what: 'EIA-96, on 1 % parts: two digits number the E96 value (table below), and a letter is the multiplier.', examples: [['01C', '10 kΩ'], ['68X', '49.9 Ω'], ['47B', '3.01 kΩ']] },
  { what: 'A marking can be another marking upside down. An underline means different things by maker: a 1 % part, which way is up, or a value in milliohms.', examples: [['601', '600 Ω, or 109'], ['109', '1 Ω, or 601']] },
];

function Swatch({ info }: { info: ColourInfo }) {
  return <span className={styles.refSwatch} data-none={info.name === 'none'} style={{ background: info.hex }} />;
}

// The Reference section: the tables behind the tool. The entries of the current value are marked, and a click on a
// colour, a code or a size uses it.
export default function Reference({ resolved: r, onChange, onText }: Props) {
  const live = !r.example;
  const bands = r.code.ok ? r.code.bands : [];
  const coded = bands.length >= 3;
  const at = (role: string) => bands.findIndex((b) => b.role === role);
  const marks = (name: string, role: string) => live && coded && bands.some((b) => b.colour === name && b.role === role);
  // Which digits a colour is: "1st", "2nd 3rd".
  const digitPlaces = (name: string) => bands.map((b, i) => (b.role === 'digit' && b.colour === name ? ['1st', '2nd', '3rd'][i] : null)).filter(Boolean).join(' ');

  // A click on a cell of the colour table: the colour takes that place in the code.
  const pick = (info: ColourInfo, role: 'digit' | 'multiplier' | 'tolerance' | 'tcr') => {
    if (role === 'tolerance') {
      onChange({ tolerance: info.tolerance, view: { type: 'axial', bands: info.name === 'none' ? 3 : bands.length >= 4 ? bands.length as 4 | 5 | 6 : 4 } });
      return;
    }
    if (role === 'tcr') {
      onChange({ tolerance: toleranceHasColour(r.tolerance) ? undefined : 1, view: { type: 'axial', bands: 6, tcr: info.tcr } });
      return;
    }
    if (!coded) return;
    const option = bandOptions(r, role === 'digit' ? 0 : at('multiplier')).find((o) => o.colour === info.name);
    if (option?.change) onChange(option.change);
  };

  const e96 = series('E96').mantissas;
  const parts = r.ohms > 0 ? decompose(r.ohms, 3) : null;
  const exp = parts && parts.exp >= -3 && parts.exp <= 5 ? parts.exp : 1;
  const mantissa = parts?.exact && e96.includes(parts.mantissa) ? parts.mantissa : null;
  const nearest = mantissa ?? (r.ohms > 0 ? decompose(neighbours(r.ohms, 'E96').nearest, 3).mantissa : 100);
  const useE96 = (m: number, e: number) => onChange({ ohms: Number(`${m}e${e}`), tolerance: 1, view: { type: 'chip', mark: 'eia96' } });

  return (
    <>
      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>Colour code</h3>
          <span className={styles.blockMeta}>IEC 60062:2016</span>
        </div>
        <div className={styles.scroll}>
          <table className={styles.ref}>
            <thead>
              <tr>
                <th scope="col">Colour</th>
                <th scope="col">Digit</th>
                <th scope="col">Multiplier</th>
                <th scope="col">Tolerance</th>
                <th scope="col">TCR, ppm/K</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_COLOURS.map((info) => (
                <tr key={info.name}>
                  <th scope="row">
                    <span className={styles.refColour}><Swatch info={info} /><span className={styles.refName}>{info.name === 'none' ? 'No band' : info.name[0].toUpperCase() + info.name.slice(1)}</span><span className={styles.refCode}>{info.code}</span></span>
                  </th>
                  <td data-on={marks(info.name, 'digit') || undefined}>
                    {info.digit !== undefined
                      ? <button type="button" className={styles.refCell} onClick={() => pick(info, 'digit')} title={`Use ${info.name} as the first digit`}><span className={styles.num}>{info.digit}</span>{live && digitPlaces(info.name) && <span className={styles.refPlace}>{digitPlaces(info.name)}</span>}</button>
                      : <span className={styles.refNone}>–</span>}
                  </td>
                  <td data-on={marks(info.name, 'multiplier') || undefined}>
                    {info.exp !== undefined
                      ? <button type="button" className={styles.refCell} onClick={() => pick(info, 'multiplier')} title={`Use ${info.name} as the multiplier`}><span className={styles.num}>× {pow10Text(info.exp)}</span></button>
                      : <span className={styles.refNone}>–</span>}
                  </td>
                  <td data-on={marks(info.name, 'tolerance') || (live && info.name === 'none' && bands.length === 3) || undefined}>
                    {info.tolerance !== undefined
                      ? <button type="button" className={styles.refCell} onClick={() => pick(info, 'tolerance')} title={`Use ${formatTolerance(info.tolerance)}`}><span className={styles.num}>{formatTolerance(info.tolerance)}</span><span className={styles.refLetter}>{info.toleranceLetter}</span></button>
                      : <span className={styles.refNone}>–</span>}
                  </td>
                  <td data-on={marks(info.name, 'tcr') || undefined}>
                    {info.tcr !== undefined
                      ? <button type="button" className={styles.refCell} onClick={() => pick(info, 'tcr')} title={`Use ${info.tcr} ppm/K, on a part with six bands`}><span className={styles.num}>{info.tcr}</span><span className={styles.refLetter}>{info.tcrLetter}</span></button>
                      : <span className={styles.refNone}>–</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className={styles.notes}>
          <li><b>3 bands:</b> two digits and a multiplier, ±20 %. <b>4 bands:</b> plus the tolerance. <b>5 bands:</b> three digits. <b>6 bands:</b> plus the temperature coefficient (TCR).</li>
          <li>The tolerance band is set apart by a wider gap, and gold, silver or pink is never the first band. When a part reads both ways, the reading that gives a standard value is the likely one.</li>
          <li>A single black band is a <button type="button" className={styles.inlineButton} onClick={() => onChange({ ohms: 0, view: { type: 'axial' } })}>0 Ω link</button> (jumper).</li>
          <li><b>Grey</b> as a tolerance is ±0.01 % in the standard; older EIA tables, still shown by some distributors, read it as ±0.05 % (A).</li>
          <li>The <b>orange</b> and <b>yellow</b> tolerances and the <b>pink</b> multiplier date from the 2016 edition and are missing from many tables. High-voltage parts use yellow for ±5 % and grey for ±10 %, to avoid metallic paint.</li>
          <li>The letters are those of the standard for tolerance and temperature coefficient, as printed on parts and in part numbers.</li>
        </ul>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>SMD markings</h3>
          <span className={styles.blockMeta}>click an example to try it</span>
        </div>
        <dl className={styles.rules}>
          {MARKING_RULES.map((rule, i) => (
            <React.Fragment key={i}>
              <dt>
                {rule.examples.map(([code, value]) => (
                  <button key={code} type="button" className={styles.ruleExample} onClick={() => onText(code)} title={`Try ${code}`}>
                    <span className={styles.chip}>{code}</span><span className={styles.ruleValue}>{value}</span>
                  </button>
                ))}
              </dt>
              <dd>{rule.what}</dd>
            </React.Fragment>
          ))}
        </dl>
        <p className={styles.caption}>Sizes 01005 and 0201 carry no marking, most 0402 parts none either, and some 0603 parts.</p>
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
                  <th scope="row"><button type="button" className={[styles.num, styles.refRowButton].join(' ')} title={`Draw a ${size.imperial} chip`}>{size.imperial}</button></th>
                  <td><span className={styles.num}>{size.metric}</span></td>
                  <td><span className={styles.num}>{size.length} × {size.width}</span></td>
                  <td><span className={styles.num}>{size.power} W</span></td>
                  <td>{size.voltage ? <span className={styles.num}>{size.voltage} V</span> : <span className={styles.refNone}>–</span>}</td>
                  <td>{{ no: 'no', rarely: 'rarely', some: 'mostly', yes: 'yes' }[size.marked]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>
          Imperial 0402 and metric 0402 are different parts, as are 0603 and 0603. Ratings vary: 0603 parts are rated 0.1 or 0.125 W, 0805 parts 0.125 or 0.25 W,
          and 2512 parts up to 2 W. A voltage shown as – was not found.
        </p>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>Axial bodies</h3>
          <span className={styles.blockMeta}>typical sizes</span>
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
        <p className={styles.caption}>The body size does not fix the rating: modern metal film in the 1/4 W body is often rated higher. Sizes differ a little by maker.</p>
      </div>
    </>
  );
}
