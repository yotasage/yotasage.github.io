import React from 'react';

import {
  AXIAL_BODIES, CHIP_SIZES, COLOURS, ColourInfo, decompose, formatOhms, formatTolerance, neighbours, pow10Text, series,
} from '../../lib/resistor';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Resistor.module.css';
import Bibliography from '../Bibliography';
import { Change, Resolved, bandOptions, colourLabel, markedSize, markingExample, thirdDigit, toleranceHasColour } from './view';

interface Props {
  resolved: Resolved;
  onChange: (change: Change) => void;
  bib: Bibliography;
}

const ORDER = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white', 'gold', 'silver', 'pink', 'none'];
const TABLE_COLOURS = ORDER.map((name) => COLOURS.find((c) => c.name === name));

function Swatch({ info }: { info: ColourInfo }) {
  return <span className={styles.refSwatch} data-none={info.name === 'none'} style={{ background: info.hex }} />;
}

export default function Reference({ resolved: r, onChange, bib }: Props) {
  const { locale, t } = useI18n();
  const live = !r.example;
  const bands = r.code.ok ? r.code.bands : [];
  const coded = bands.length >= 3;
  const at = (role: string) => bands.findIndex((b) => b.role === role);
  const digitCount = coded ? bands.filter((b) => b.role === 'digit').length : 0;
  const PLACES = [t('res.r.place0'), t('res.r.place1'), t('res.r.place2')];

  const eia96Letters: [string, number][] = [
    ['Z', -3],
    [t('res.r.ruleOr', { a: 'Y', b: 'S' }), -2],
    [t('res.r.ruleOr', { a: 'X', b: 'R' }), -1],
    ['A', 0],
    [t('res.r.ruleOr', { a: 'B', b: 'H' }), 1],
    ['C', 2],
    ['D', 3],
    ['E', 4],
    ['F', 5],
  ];

  const markingRules: { what: string; examples: [string, string][]; cite?: string }[] = [
    { what: t('res.r.rule0'), cite: 'TTTN004', examples: [['472', '4.7 kΩ'], ['220', '22 Ω'], ['101', '100 Ω'], ['100', '10 Ω']] },
    { what: t('res.r.rule1'), examples: [['4992', '49.9 kΩ'], ['7500', '750 Ω'], ['1001', '1 kΩ']] },
    { what: t('res.r.rule2'), cite: 'TTTN004', examples: [['4R7', '4.7 Ω'], ['0R22', '0.22 Ω'], ['R005', '5 mΩ'], ['68R0', '68 Ω']] },
    { what: t('res.r.rule3'), examples: [['0', '0 Ω'], ['000', '0 Ω'], ['0000', '0 Ω']] },
    { what: t('res.r.rule4'), examples: [['103J', '10 kΩ ±5 %'], ['1001F', '1 kΩ ±1 %']] },
    { what: t('res.r.rule5'), cite: 'VishayMarking', examples: [['5L0', '5 mΩ'], ['1M50', t('res.r.ruleOr', { a: '1.5 mΩ', b: '1.5 MΩ' })]] },
    { what: t('res.r.rule6'), cite: 'TTTN004', examples: [['01C', '10 kΩ'], ['68X', '49.9 Ω'], ['47B', '3.01 kΩ']] },
    { what: t('res.r.rule7'), examples: [['601', t('res.r.ruleOr', { a: '600 Ω', b: '109' })], ['109', t('res.r.ruleOr', { a: '1 Ω', b: '601' })]] },
  ];

  interface Cell { on: boolean; title: string; change?: Change; off?: string }

  const digitCell = (info: ColourInfo, place: number): Cell => {
    const colName = colourLabel(info.name, locale);
    const title = t('res.r.useDigitTitle', { colour: colName, place: PLACES[place] });
    if (!coded) return { on: false, title, off: r.code.ok === false ? r.code.error : t('res.r.linkNoDigits') };
    if (place < digitCount) {
      const option = bandOptions(r, place, locale).find((o) => o.colour === info.name);
      if (place === 2 && option?.current) {
        const without = thirdDigit(r, null, locale);
        return 'error' in without ? { on: true, title, off: without.error } : { on: true, title: t('res.r.removeThird'), change: without };
      }
      return { on: !!option?.current, title, change: option?.change, off: option?.disabled ?? (option ? undefined : t('res.r.notDigitHere')) };
    }
    const added = thirdDigit(r, info.digit, locale);
    return 'error' in added ? { on: false, title, off: added.error } : { on: false, title: t('res.r.addThird', { d: info.digit }), change: added };
  };

  const bandCell = (info: ColourInfo, role: 'multiplier' | 'tolerance' | 'tcr'): Cell => {
    const on = coded && bands.some((b) => b.colour === info.name && b.role === role);
    if (role === 'tolerance') {
      const count = info.name === 'none' ? 3 : bands.length >= 4 ? bands.length as 4 | 5 | 6 : 4;
      return { on: on || (info.name === 'none' && bands.length === 3), title: t('res.r.useTol', { tol: formatTolerance(info.tolerance) }), change: { tolerance: info.tolerance, view: { type: 'axial', bands: count } } };
    }
    if (role === 'tcr') {
      if (on) return { on, title: t('res.r.removeTcr'), change: { view: { type: 'axial', bands: 5, tcr: null } } };
      return { on, title: t('res.r.useTcr', { tcr: info.tcr }), change: { tolerance: toleranceHasColour(r.tolerance) ? undefined : 1, view: { type: 'axial', bands: 6, tcr: info.tcr } } };
    }
    const title = t('res.r.useMult', { colour: colourLabel(info.name, locale) });
    if (!coded) return { on: false, title, off: r.code.ok === false ? r.code.error : t('res.r.linkNoMult') };
    const option = bandOptions(r, at('multiplier'), locale).find((o) => o.colour === info.name);
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
  const useE96 = (m: number, e: number) => onChange({ ohms: Number(`${m}e${e}`), tolerance: 1, view: { type: 'chip', mark: 'eia96', ...markedSize(r) } });

  return (
    <>
      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>{t('res.r.colourCode')}</h3>
          <span className={styles.blockMeta}>IEC 60062:2016 {bib.cite('IEC60062')} {bib.cite('WikiColor')}</span>
        </div>
        <div className={styles.scroll}>
          <table className={[styles.ref, styles.refBands].join(' ')}>
            <thead>
              <tr>
                <th scope="col">{t('res.r.colColour')}</th>
                <th scope="col">{t('res.r.col1st')}<br />{t('res.r.colDigit')}</th>
                <th scope="col">{t('res.r.col2nd')}<br />{t('res.r.colDigit')}</th>
                <th scope="col">{t('res.r.col3rd')}<br />{t('res.r.colDigit')}</th>
                <th scope="col">{t('res.r.colMult')}</th>
                <th scope="col">{t('res.r.colTol')}</th>
                <th scope="col">TCR<br />ppm/K</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_COLOURS.map((info) => {
                const rawLabel = info.name === 'none' ? t('res.col.none') : colourLabel(info.name, locale);
                const capLabel = rawLabel[0].toUpperCase() + rawLabel.slice(1);
                return (
                  <tr key={info.name}>
                    <th scope="row">
                      <span className={styles.refColour}><Swatch info={info} /><span className={styles.refName}>{capLabel}</span><span className={styles.refCode}>{info.code}</span></span>
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
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>{t('res.r.colourCaption')}</p>
        <ul className={styles.notes}>
          <li><b>{t('res.r.note1a')}</b>{t('res.r.note1b')}<b>{t('res.r.note1c')}</b>{t('res.r.note1d')}<b>{t('res.r.note1e')}</b>{t('res.r.note1f')}<b>{t('res.r.note1g')}</b>{t('res.r.note1h')}{bib.cite('VishayMarking')}.</li>
          <li>{t('res.r.note2')}</li>
          <li>{t('res.r.note3a')}<button type="button" className={styles.inlineButton} onClick={() => onChange({ ohms: 0, view: { type: 'axial' } })}>{t('res.r.note3btn')}</button>{t('res.r.note3b')}</li>
          <li><b>{t('res.r.note4a')}</b>{t('res.r.note4b')}{bib.cite('WikiColor')}.</li>
          <li>{t('res.r.note5a')}<b>{t('res.r.note5b')}</b>{t('res.r.note5c')}<b>{t('res.r.note5d')}</b>{t('res.r.note5e')}<b>{t('res.r.note5f')}</b>{t('res.r.note5g')}{bib.cite('WikiColor')}.</li>
          <li>{t('res.r.note6')}</li>
        </ul>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>{t('res.r.smdTitle')}</h3>
          <span className={styles.blockMeta}>{t('res.r.smdMeta')}</span>
        </div>
        <dl className={styles.rules}>
          {markingRules.map((rule, i) => (
            <React.Fragment key={i}>
              <dt>
                {rule.examples.map(([code, value]) => (
                  <button key={code} type="button" className={styles.ruleExample} onClick={() => onChange(markingExample(code, r))} title={t('res.r.tryMarkingTitle', { code })}>
                    <span className={styles.chip}>{code}</span><span className={styles.ruleValue}>{value}</span>
                  </button>
                ))}
              </dt>
              <dd>{rule.what}{rule.cite && <> {bib.cite(rule.cite)}</>}</dd>
            </React.Fragment>
          ))}
        </dl>
        <p className={styles.caption}>{t('res.r.smdCaption')}{bib.cite('YageoRC')}.</p>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>{t('res.r.eiaTitle')}</h3>
          <span className={styles.blockMeta}>{t('res.r.eiaMeta')}</span>
        </div>
        <div className={styles.letters} role="group" aria-label={t('res.r.multLettersAria')}>
          {eia96Letters.map(([letter, e]) => (
            <button key={letter} type="button" className={styles.letter} data-on={(live && mantissa !== null && e === parts.exp) || undefined} onClick={() => useE96(nearest, e)} title={t('res.r.useMultVal', { m: pow10Text(e) })}>
              <span className={styles.letterName}>{letter}</span>
              <span className={styles.num}>× {e < 0 ? Number(`1e${e}`) : e < 3 ? 10 ** e : `${10 ** (e - 3)} k`}</span>
            </button>
          ))}
        </div>
        <div className={styles.eia} role="group" aria-label={t('res.r.codes96Aria')}>
          {e96.map((value, i) => (
            <button key={value} type="button" className={styles.eiaCell} data-on={(live && value === mantissa) || undefined} onClick={() => useE96(value, exp)} title={t('res.r.useTol', { tol: formatOhms(Number(`${value}e${exp}`)) })}>
              <span className={styles.eiaCode}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.eiaValue}>{value}</span>
            </button>
          ))}
        </div>
        <p className={styles.caption}>
          {t('res.r.eiaCap1a')}<span className={styles.num}>01C</span>{t('res.r.eiaCap1b')}
        </p>
        <p className={styles.caption} data-testid="eia96-note">
          <b>{t('res.r.eiaCap2a')}</b>{t('res.r.eiaCap2b')}{bib.cite('TTTN004')}{t('res.r.eiaCap2c')}
        </p>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>{t('res.r.chipTitle')}</h3>
          <span className={styles.blockMeta}>{t('res.r.chipMeta')}</span>
        </div>
        <div className={styles.scroll}>
          <table className={[styles.ref, styles.refSizes].join(' ')}>
            <thead>
              <tr>
                <th scope="col">{t('res.r.colImp')}</th>
                <th scope="col">{t('res.r.colMet')}</th>
                <th scope="col">{t('res.r.colLW')}</th>
                <th scope="col">{t('res.r.colP70')}</th>
                <th scope="col">{t('res.r.colVlim')}</th>
                <th scope="col">{t('res.r.colMarked')}</th>
              </tr>
            </thead>
            <tbody>
              {CHIP_SIZES.map((size) => (
                <tr key={size.imperial} data-on={(r.type === 'chip' && size === r.chip) || undefined} className={styles.refRow} onClick={() => onChange({ view: { type: 'chip', size: size.imperial } })}>
                  <th scope="row"><button type="button" className={[styles.num, styles.refRowButton].join(' ')} title={t('res.r.drawChipTitle', { imp: size.imperial })}>{size.imperial}{size.unverified ? ' *' : ''}</button></th>
                  <td><span className={styles.num}>{size.metric}</span></td>
                  <td><span className={styles.num}>{size.length} × {size.width}</span></td>
                  <td><span className={styles.num}>{size.power} W</span></td>
                  <td>{size.voltage ? <><span className={styles.num}>{size.voltage} V</span>{size.voltageNote && <span className={styles.refAlso}> ({size.voltageNote})</span>}</> : <span className={styles.refNone}>–</span>}</td>
                  <td>{t(`res.r.marked.${size.marked}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>
          {t('res.r.chipCap1a')}{bib.cite('YageoRC')} {bib.cite('VishayCRCW')} {bib.cite('VishayCRCW0201')}{t('res.r.chipCap1b')}
        </p>
        <p className={styles.caption}>
          {t('res.r.chipCap2a')}{bib.cite('YageoRC')}{t('res.r.chipCap2b')}<a href="#theory-power" className={styles.textLink}>{t('res.lu.theoryLink')}</a>{t('res.r.chipCap2c')}
        </p>
      </div>

      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3>{t('res.r.axialTitle')}</h3>
          <span className={styles.blockMeta}>{t('res.r.axialMeta')}{bib.cite('YageoCFR')}</span>
        </div>
        <div className={styles.scroll}>
          <table className={[styles.ref, styles.refSizes].join(' ')}>
            <thead>
              <tr>
                <th scope="col">{t('res.r.colRating')}</th>
                <th scope="col">{t('res.r.colBodyLen')}</th>
                <th scope="col">{t('res.r.colBodyDia')}</th>
                <th scope="col">{t('res.r.colLeadDia')}</th>
              </tr>
            </thead>
            <tbody>
              {AXIAL_BODIES.map((body, i) => (
                <tr key={body.rating} data-on={(r.type === 'axial' && body === r.body) || undefined} className={styles.refRow} onClick={() => onChange({ view: { type: 'axial', body: i } })}>
                  <th scope="row"><button type="button" className={[styles.num, styles.refRowButton].join(' ')} title={t('res.r.drawBodyTitle', { rating: body.rating })}>{body.rating}</button></th>
                  <td><span className={styles.num}>{body.length}</span></td>
                  <td><span className={styles.num}>{body.diameter}</span></td>
                  <td><span className={styles.num}>{body.leadDiameter}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>{t('res.r.axialCap1')}{bib.cite('VishayMRS')}{t('res.r.axialCap2')}</p>
      </div>
    </>
  );
}
