import React from 'react';

import Bibliography from '../../components/Bibliography';
import KatexSpan from '../../components/KatexSpan';
import PageHead from '../../components/PageHead';
import CalcBox, { CheckList, CheckText } from '../../components/SimSetup/CalcBox';
import CoherentSampling from '../../components/SimSetup/CoherentSampling';
import ParameterList from '../../components/SimSetup/ParameterList';
import PowerBox from '../../components/SimSetup/PowerBox';
import PrimeBox, { MAX_PRIME_DIGITS } from '../../components/SimSetup/PrimeBox';
import PillTabs, { PillTabItem } from '../../components/UI/PillTabs';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { BibEntry } from '../../lib/bibtex';
import { loadReferences } from '../../lib/references';
import {
  BoxState,
  calculate,
  CHECK_TONES,
  checkNcyc,
  checkNpts,
  defaultBox,
  Param,
  switchSolveFor,
  Tone,
} from '../../lib/simsetup/calc';
import { DigitGrouping, NumberFormat } from '../../lib/simsetup/numbers';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import useReplayHighlight from '../../lib/useReplayHighlight';
import styles from '../../styles/SimSetup.module.css';

type WorkspaceId = 'workbench' | 'examples' | 'theory';
type HelperTabId = 'primes' | 'powers' | 'rules';

const DEFAULT_PRECISION = 11;
// A double holds 15 to 17 significant digits; more would only show rounding noise.
const MAX_PRECISION = 17;

interface Preset {
  id: 'audio' | 'rf' | 'sensor' | 'spice';
  solveFor: Param;
  text: BoxState['text'];
  summary: { f0: string; fs: string; ncyc: string; npts: string; tstart?: string };
}

const PRESETS: readonly Preset[] = [
  {
    id: 'audio',
    solveFor: 'f0',
    text: { f0: '', fs: '48k', ncyc: '83', npts: '4096', tstart: '0' },
    summary: { f0: '972.66 Hz', fs: '48 kHz', ncyc: '83 (prime)', npts: '4096 (2¹²)' },
  },
  {
    id: 'rf',
    solveFor: 'f0',
    text: { f0: '', fs: '100M', ncyc: '1753', npts: '16384', tstart: '0' },
    summary: { f0: '10.70 MHz', fs: '100 MHz', ncyc: '1753 (prime)', npts: '16384 (2¹⁴)' },
  },
  {
    id: 'sensor',
    solveFor: 'f0',
    text: { f0: '', fs: '1k', ncyc: '53', npts: '1024', tstart: '0' },
    summary: { f0: '51.76 Hz', fs: '1 kHz', ncyc: '53 (prime)', npts: '1024 (2¹⁰)' },
  },
  {
    id: 'spice',
    solveFor: 'f0',
    text: { f0: '', fs: '10meg', ncyc: '101', npts: '2048', tstart: '10u' },
    summary: { f0: '493.16 kHz', fs: '10meg', ncyc: '101 (prime)', npts: '2048 (2¹¹)', tstart: '10 µs' },
  },
];

const THEORY_HASHES = new Set([
  'rule-1',
  'rule-2',
  'rule-3',
  'note-1',
  'note-2',
  'note-3',
  'parameters-title',
  'coherent-title',
  'references-title',
]);

function workspaceForHash(rawHash: string): WorkspaceId | null {
  const id = decodeURIComponent(rawHash.replace(/^#/, ''));
  if (!id) return null;
  if (THEORY_HASHES.has(id) || id.startsWith('ref-')) return 'theory';
  if (id === 'usage-title') return 'examples';
  return null;
}

function parsePrecision(text: string): number | null {
  const n = Number(text);
  return text.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= MAX_PRECISION ? n : null;
}

// Reads references.bib when the site is built.
export async function getStaticProps() {
  return { props: { references: loadReferences() } };
}

export default function SimSetup({ references }: { references: BibEntry[] }) {
  useDesignSystemPage('#0891b2', '#3cc4dc');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const nextId = React.useRef(3);
  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');
  const [helperTab, setHelperTab] = React.useState<HelperTabId>('primes');
  const [boxes, setBoxes] = React.useState<BoxState[]>(() => [defaultBox(1), defaultBox(2)]);
  const [precisionText, setPrecisionText] = React.useState(String(DEFAULT_PRECISION));
  const [precision, setPrecision] = React.useState(DEFAULT_PRECISION);
  const [format, setFormat] = React.useState<NumberFormat>('plain');
  const [grouping, setGrouping] = React.useState<DigitGrouping>('none');
  const [primeText, setPrimeText] = React.useState('11');
  const [powerText, setPowerText] = React.useState('16');

  const bib = new Bibliography(references);
  useReplayHighlight();

  // Route deep hash links (#rule-1, #note-1, #parameters-title, #usage-title, #ref-*, ...)
  // to the matching non-destructive workspace and scroll smoothly into view.
  React.useEffect(() => {
    function routeToHash(rawHash: string) {
      const targetWs = workspaceForHash(rawHash);
      if (!targetWs) return;
      const targetId = decodeURIComponent(rawHash.replace(/^#/, ''));
      setWorkspace(targetWs);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    if (window.location.hash) {
      routeToHash(window.location.hash);
    }

    function onHashChange() {
      routeToHash(window.location.hash);
    }

    function onDocClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.('a[href^="#"]');
      const href = anchor?.getAttribute('href');
      if (!href) return;
      const targetWs = workspaceForHash(href);
      if (!targetWs) return;
      routeToHash(href);
    }

    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('click', onDocClick);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      document.removeEventListener('click', onDocClick);
    };
  }, []);

  const precisionValid = parsePrecision(precisionText) !== null;

  function changePrecision(text: string) {
    setPrecisionText(text);
    const n = parsePrecision(text);
    if (n !== null) setPrecision(n);
  }

  function updateBox(box: BoxState) {
    setBoxes((all) => all.map((b) => (b.id === box.id ? box : b)));
  }

  function duplicateBox(id: number) {
    const newId = nextId.current++;
    setBoxes((all) => {
      const i = all.findIndex((b) => b.id === id);
      return [...all.slice(0, i + 1), { ...all[i], id: newId }, ...all.slice(i + 1)];
    });
  }

  function addBox() {
    const newId = nextId.current++;
    setBoxes((all) => [...all, defaultBox(newId)]);
  }

  function removeBox(id: number) {
    setBoxes((all) => all.filter((b) => b.id !== id));
  }

  function applyToBox1(param: 'ncyc' | 'npts', rawValue: string) {
    setBoxes((all) =>
      all.map((box, idx) => {
        if (idx !== 0) return box;
        const base = box.solveFor === param ? switchSolveFor(box, 'fs', grouping) : box;
        return { ...base, text: { ...base.text, [param]: rawValue } };
      }),
    );
  }

  function loadPreset(preset: Preset) {
    setBoxes((all) =>
      all.map((box, idx) =>
        idx === 0 ? { id: box.id, solveFor: preset.solveFor, text: { ...preset.text } } : box,
      ),
    );
    setWorkspace('workbench');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function openTheory(targetId?: string) {
    setWorkspace('theory');
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (targetId) {
          document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  // Live coherence status for Box 1 (used in sticky helper's Rules tab)
  const box1 = boxes[0];
  const box1Result = calculate(box1);
  const box1NcycChecks = checkNcyc(box1Result.values.ncyc, box1Result.values.npts);
  const box1NptsChecks = checkNpts(box1Result.values.npts);
  const allBox1Checks = [...box1NcycChecks, ...box1NptsChecks];

  let overallTone: Tone = 'info';
  let overallLabel = t('simsetup.rules.statusIncomplete');
  let rulesBadge = '–';
  if (allBox1Checks.length > 0) {
    const tones = allBox1Checks.map((c) => CHECK_TONES[c.kind]);
    if (tones.includes('bad')) {
      overallTone = 'bad';
      overallLabel = t('simsetup.rules.statusIssue');
      rulesBadge = '!';
    } else if (tones.includes('ok')) {
      overallTone = 'ok';
      overallLabel = t('simsetup.rules.statusAcceptable');
      rulesBadge = '•';
    } else if (tones.every((tone) => tone === 'good')) {
      overallTone = 'good';
      overallLabel = t('simsetup.rules.statusCoherent');
      rulesBadge = '✓';
    }
  }

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'workbench', label: t('simsetup.workbench') },
    { id: 'examples', label: t('simsetup.examples') },
    { id: 'theory', label: t('simsetup.theory') },
  ];

  const helperTabs: readonly PillTabItem<HelperTabId>[] = [
    { id: 'primes', label: t('simsetup.helper.primes') },
    { id: 'powers', label: t('simsetup.helper.powers') },
    { id: 'rules', label: t('simsetup.helper.rules'), badge: rulesBadge },
  ];

  const isQuick = mode === 'quick';

  return (
    <div data-ds="v2" className={styles.page}>
      <PageHead
        title={t('simsetup.pageTitle')}
        description={t('simsetup.subtitle')}
        path="/simsetup/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('simsetup.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
      />

      <main className={styles.main}>
        {/* ================================================================
            WORKSPACE 1: WORKBENCH
           ================================================================ */}
        <div
          role="tabpanel"
          hidden={workspace !== 'workbench'}
          className={styles.workspacePanel}
        >
          {isQuick ? (
            <div className={styles.quickLayout}>
              <section className={styles.card} aria-labelledby="calculator-title">
                <div className={styles.cardHeader}>
                  <h2 id="calculator-title" className={styles.cardTitle}>
                    {t('simsetup.calc.quickTitle')}
                  </h2>
                  <CheckText tone={overallTone}>{overallLabel}</CheckText>
                </div>

                <CalcBox
                  box={box1}
                  title={t('simsetup.calc.boxTitle', { n: 1 })}
                  precision={precision}
                  format={format}
                  grouping={grouping}
                  canRemove={false}
                  compact
                  onChange={updateBox}
                  onDuplicate={() => duplicateBox(box1.id)}
                  onRemove={() => removeBox(box1.id)}
                />
              </section>

              <aside className={styles.quickBanner} aria-label={t('simsetup.quick.badge')}>
                <div className={styles.quickBannerText}>
                  <span className={styles.quickBadge}>{t('simsetup.quick.badge')}</span>
                  <p>{t('simsetup.quick.bannerText')}</p>
                </div>
                <div className={styles.quickBannerActions}>
                  <button
                    type="button"
                    className={styles.buttonPrimary}
                    onClick={() => setMode('standard')}
                  >
                    {t('simsetup.quick.switchStandard')}
                  </button>
                  <button
                    type="button"
                    className={styles.buttonGhost}
                    onClick={() => setMode('teaching')}
                  >
                    {t('simsetup.quick.switchTeaching')}
                  </button>
                </div>
              </aside>
            </div>
          ) : (
            <div className={styles.splitLayout}>
              {/* Left / Primary column (~65%) */}
              <div className={styles.primaryCol}>
                <TeachingCallout
                  title={t('simsetup.teaching.ratioTitle')}
                  formula={<KatexSpan text={'\\frac{f_0}{F_S} = \\frac{N_{cyc}}{N_{pts}}'} />}
                  onTheoryClick={() => openTheory('coherent-title')}
                >
                  <p>{t('simsetup.teaching.ratioBody')}</p>
                </TeachingCallout>

                <section className={styles.card} aria-labelledby="calculator-title">
                  <div className={styles.cardHeader}>
                    <h2 id="calculator-title" className={styles.cardTitle}>
                      {t('simsetup.calc.title')}
                    </h2>
                    <div className={styles.toolbar}>
                      <label className={styles.inlineField} title={t('simsetup.calc.precisionTitle')}>
                        <span>{t('simsetup.calc.precision')}</span>
                        <input
                          className={[styles.input, styles.precisionInput].join(' ')}
                          type="number"
                          min={1}
                          max={MAX_PRECISION}
                          step={1}
                          value={precisionText}
                          onChange={(e) => changePrecision(e.target.value)}
                          onBlur={() => setPrecisionText(String(precision))}
                          aria-invalid={precisionValid ? undefined : true}
                        />
                        <span className={styles.inlineSuffix}>{t('simsetup.calc.digits')}</span>
                      </label>

                      <label className={styles.inlineField}>
                        <span>{t('simsetup.calc.format')}</span>
                        <select
                          className={styles.select}
                          value={format}
                          onChange={(e) => setFormat(e.target.value as NumberFormat)}
                        >
                          <option value="plain">{t('simsetup.calc.formatPlain')}</option>
                          <option value="si">{t('simsetup.calc.formatSi')}</option>
                        </select>
                      </label>

                      <label className={styles.inlineField} title={t('simsetup.calc.groupingTitle')}>
                        <span>{t('simsetup.calc.grouping')}</span>
                        <select
                          className={styles.select}
                          value={grouping}
                          onChange={(e) => setGrouping(e.target.value as DigitGrouping)}
                        >
                          <option value="none">{t('simsetup.calc.groupNone')}</option>
                          <option value="space">{t('simsetup.calc.groupSpace')}</option>
                          <option value="underscore">{t('simsetup.calc.groupUnderscore')}</option>
                        </select>
                      </label>

                      <button type="button" className={styles.buttonPrimary} onClick={addBox}>
                        + {t('simsetup.calc.addBox')}
                      </button>
                    </div>
                  </div>

                  {!precisionValid && (
                    <p className={styles.fieldError}>
                      {t('simsetup.calc.precisionError', { max: MAX_PRECISION, current: precision })}
                    </p>
                  )}

                  <div className={styles.boxGrid}>
                    {boxes.map((box, i) => (
                      <CalcBox
                        key={box.id}
                        box={box}
                        title={t('simsetup.calc.boxTitle', { n: i + 1 })}
                        precision={precision}
                        format={format}
                        grouping={grouping}
                        canRemove={boxes.length > 1}
                        onChange={updateBox}
                        onDuplicate={() => duplicateBox(box.id)}
                        onRemove={() => removeBox(box.id)}
                      />
                    ))}
                  </div>
                </section>
              </div>

              {/* Right / Sticky Helper column (~35%) */}
              <aside className={styles.helperCol} aria-label={t('simsetup.helperNavAria')}>
                <div className={styles.card}>
                  <div className={styles.helperTabsWrap}>
                    <PillTabs<HelperTabId>
                      items={helperTabs}
                      value={helperTab}
                      onChange={setHelperTab}
                      ariaLabel={t('simsetup.helperNavAria')}
                      size="sm"
                      idPrefix="simsetup-helper"
                    />
                  </div>

                  <div
                    id="simsetup-helper-panel-primes"
                    role="tabpanel"
                    aria-labelledby="simsetup-helper-tab-primes"
                    hidden={helperTab !== 'primes'}
                  >
                    <PrimeBox
                      grouping={grouping}
                      text={primeText}
                      onTextChange={setPrimeText}
                      onApply={(val) => applyToBox1('ncyc', val)}
                      embedded
                    />
                  </div>

                  <div
                    id="simsetup-helper-panel-powers"
                    role="tabpanel"
                    aria-labelledby="simsetup-helper-tab-powers"
                    hidden={helperTab !== 'powers'}
                  >
                    <PowerBox
                      grouping={grouping}
                      text={powerText}
                      onTextChange={setPowerText}
                      onApply={(val) => applyToBox1('npts', val)}
                      embedded
                    />
                  </div>

                  <div
                    id="simsetup-helper-panel-rules"
                    role="tabpanel"
                    aria-labelledby="simsetup-helper-tab-rules"
                    hidden={helperTab !== 'rules'}
                  >
                    <section className={styles.helperSection} aria-labelledby="live-rules-title">
                      <div className={styles.helperHeader}>
                        <h3 id="live-rules-title" className={styles.helperTitle}>
                          {t('simsetup.rules.title')}
                        </h3>
                        <CheckText tone={overallTone}>{overallLabel}</CheckText>
                      </div>
                      <p className={styles.helperSubtext}>{t('simsetup.rules.subtitle')}</p>

                      <div className={styles.liveRuleList}>
                        <div className={styles.liveRuleItem}>
                          <div className={styles.liveRuleHead}>
                            <strong>{t('simsetup.rules.rule1Title')}</strong>
                            <button
                              type="button"
                              className={styles.linkBtn}
                              onClick={() => setHelperTab('primes')}
                            >
                              {t('simsetup.rules.openPrimes')}
                            </button>
                          </div>
                          <p className={styles.liveRuleDesc}>{t('simsetup.rules.rule1Desc')}</p>
                          {box1NcycChecks.length > 0 ? (
                            <CheckList checks={box1NcycChecks} />
                          ) : (
                            <p className={styles.liveRuleEmpty}>{t('simsetup.rules.noData')}</p>
                          )}
                        </div>

                        <div className={styles.liveRuleItem}>
                          <div className={styles.liveRuleHead}>
                            <strong>{t('simsetup.rules.rule2Title')}</strong>
                            <button
                              type="button"
                              className={styles.linkBtn}
                              onClick={() => setHelperTab('powers')}
                            >
                              {t('simsetup.rules.openPowers')}
                            </button>
                          </div>
                          <p className={styles.liveRuleDesc}>{t('simsetup.rules.rule2Desc')}</p>
                          {box1NptsChecks.length > 0 ? (
                            <CheckList checks={box1NptsChecks} />
                          ) : (
                            <p className={styles.liveRuleEmpty}>{t('simsetup.rules.noData')}</p>
                          )}
                        </div>

                        <div className={styles.liveRuleItem}>
                          <div className={styles.liveRuleHead}>
                            <strong>{t('simsetup.rules.rule3Title')}</strong>
                          </div>
                          <p className={styles.liveRuleDesc}>{t('simsetup.rules.rule3Desc')}</p>
                        </div>
                      </div>

                      <div className={styles.helperFooter}>
                        <button
                          type="button"
                          className={styles.buttonGhost}
                          onClick={() => openTheory('coherent-title')}
                        >
                          {t('simsetup.rules.openTheory')}
                        </button>
                      </div>
                    </section>
                  </div>
                </div>

                <TeachingCallout
                  title={t('simsetup.teaching.helperTitle')}
                  formula={<KatexSpan text={'\\gcd(N_{cyc},\\; 2^k) = 1'} />}
                  onTheoryClick={() => openTheory('rule-1')}
                >
                  <p>{t('simsetup.teaching.helperBody')}</p>
                </TeachingCallout>
              </aside>
            </div>
          )}
        </div>

        {/* ================================================================
            WORKSPACE 2: EXAMPLES & GUIDE
           ================================================================ */}
        <div
          role="tabpanel"
          hidden={workspace !== 'examples'}
          className={styles.workspacePanel}
        >
          <div className={styles.examplesLayout}>
            <section className={styles.card} aria-labelledby="presets-title">
              <div className={styles.sectionHeader}>
                <h2 id="presets-title" className={styles.sectionTitle}>
                  {t('simsetup.presets.title')}
                </h2>
                <p className={styles.sectionLead}>{t('simsetup.presets.subtitle')}</p>
              </div>

              <div className={styles.presetGrid}>
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={styles.presetCard}
                    onClick={() => loadPreset(preset)}
                  >
                    <div className={styles.presetTop}>
                      <span className={styles.presetTag}>{t(`simsetup.presets.${preset.id}.tag`)}</span>
                      <span className={styles.presetCta}>{t('simsetup.presets.load')}</span>
                    </div>
                    <h3 className={styles.presetTitle}>{t(`simsetup.presets.${preset.id}.title`)}</h3>
                    <p className={styles.presetDesc}>{t(`simsetup.presets.${preset.id}.desc`)}</p>
                    <dl className={styles.presetSpecs}>
                      <div>
                        <dt>f<sub>0</sub></dt>
                        <dd>{preset.summary.f0}</dd>
                      </div>
                      <div>
                        <dt>F<sub>S</sub></dt>
                        <dd>{preset.summary.fs}</dd>
                      </div>
                      <div>
                        <dt>N<sub>cyc</sub></dt>
                        <dd>{preset.summary.ncyc}</dd>
                      </div>
                      <div>
                        <dt>N<sub>pts</sub></dt>
                        <dd>{preset.summary.npts}</dd>
                      </div>
                      {preset.summary.tstart && (
                        <div>
                          <dt>t<sub>start</sub></dt>
                          <dd>{preset.summary.tstart}</dd>
                        </div>
                      )}
                    </dl>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.card} aria-labelledby="usage-title">
              <div className={styles.sectionHeader}>
                <h2 id="usage-title" className={styles.sectionTitle}>
                  {t('simsetup.guide.title')}
                </h2>
                <p className={styles.sectionLead}>{t('simsetup.guide.subtitle')}</p>
              </div>

              <div className={styles.guideGrid}>
                <article className={styles.guideCard}>
                  <h3>Calculator</h3>
                  <p>
                    Each box works with the four parameters in the equation under{' '}
                    <a href="#parameters-title">Parameters</a>. Choose the one to calculate under{' '}
                    <b>Calculate</b> and type the other three. The calculated value is highlighted. When you
                    choose another parameter to calculate, the value that was calculated moves into its input
                    field with all its digits, so the results stay the same until you change something.
                  </p>
                </article>

                <article className={styles.guideCard}>
                  <h3>Comparing</h3>
                  <p>
                    The boxes are independent of each other. <b>Duplicate</b> copies a box, so you can change
                    one value and compare the two. <b>Add box</b> adds a box with the starting values, and{' '}
                    <b>Remove</b> deletes a box.
                  </p>
                </article>

                <article className={styles.guideCard}>
                  <h3>Typing numbers</h3>
                  <p>
                    Type plain numbers (<code>16384</code>, <code>0.001</code>), exponents (<code>1e3</code>,{' '}
                    <code>2.5E-6</code>) or SI prefixes (<code>1k</code>, <code>2.5M</code>, <code>10m</code>,{' '}
                    <code>100u</code> or <code>100µ</code>). A space before the prefix is fine, and the unit may
                    follow it (<code>1 kHz</code>, <code>10 ms</code>). Prefixes are case sensitive:{' '}
                    <code>m</code> is milli and <code>M</code> is mega. <code>meg</code> also means mega, as in
                    SPICE. Digit groups are fine too (<code>1 000 000</code> or <code>1_000_000</code>), here and
                    in the prime and power of 2 boxes.
                  </p>
                </article>

                <article className={styles.guideCard}>
                  <h3>Results &amp; SPICE formatting</h3>
                  <p>
                    <b>Precision</b> is the number of significant digits shown for calculated values, from 1 to{' '}
                    {MAX_PRECISION}. It only changes how the results are shown, not how they are calculated.{' '}
                    <b>Format</b> shows the results as plain numbers or with SI prefixes. SPICE reads{' '}
                    <code>M</code> as milli, so copy plain numbers, or use <code>meg</code>, when you set up a
                    SPICE simulation. <b>Grouping</b> splits the whole-number part into groups of three digits:
                    none (<code>2340571.4286</code>, which works everywhere), spaces (<code>2 340 571.4286</code>)
                    or underscores (<code>2_340_571.4286</code>, which Python reads as a number). It is also used
                    for the numbers that the prime and power of 2 buttons write.
                  </p>
                </article>

                <article className={styles.guideCard}>
                  <h3>
                    t<sub>start</sub> and t<sub>stop</sub>
                  </h3>
                  <p>
                    Type the time at which sampling starts in t<sub>start</sub>. t<sub>stop</sub> is t
                    <sub>start</sub> plus N<sub>cyc</sub> periods of f<sub>0</sub>.
                  </p>
                </article>

                <article className={styles.guideCard}>
                  <h3>Checks</h3>
                  <p>
                    Next to N<sub>cyc</sub> and N<sub>pts</sub> (below them on phones), each box shows how they
                    match <a href="#rule-1">RULE 1</a> and <a href="#rule-2">RULE 2</a> under Coherent sampling:
                    whether N<sub>cyc</sub> is an integer, a prime or an odd number, and has no common factor
                    with N<sub>pts</sub>, and whether N<sub>pts</sub> is a power of 2.{' '}
                    <CheckText tone="good">Green</CheckText> follows the rule,{' '}
                    <CheckText tone="ok">yellow</CheckText> is acceptable (odd, but not prime) and{' '}
                    <CheckText tone="bad">red</CheckText> breaks it. A calculated value such as{' '}
                    <code>7.000000000000001</code> counts as an integer, since the difference comes from rounding
                    in the computer.
                  </p>
                </article>

                <article className={styles.guideCard}>
                  <h3>Prime numbers</h3>
                  <p>
                    Shows whether the number is prime. <b>Prev</b> and <b>Next</b> go to the closest prime below
                    or above the number. <b>÷2</b>, <b>÷10</b> and <b>÷1000</b> go to the first prime after the
                    number divided by 2, 10 or 1000, and <b>×2</b>, <b>×10</b> and <b>×1000</b> to the first
                    prime after the number multiplied by 2, 10 or 1000. The number itself does not have to be
                    prime. Numbers can have up to {MAX_PRIME_DIGITS} digits. Below 3.3·10<sup>24</sup> the answer
                    is exact. Above that, the test (Miller–Rabin) lets a few rare numbers through that are not
                    prime, so the answer is &ldquo;Probably prime&rdquo;.
                  </p>
                </article>

                <article className={styles.guideCard}>
                  <h3>Powers of 2</h3>
                  <p>
                    Shows whether the number is an exact power of 2, and its exponent: 2<sup>n</sup> = for an
                    exact power of 2, and 2<sup>x</sup> ≈ otherwise. <b>&lt;&lt;1</b> and <b>&lt;&lt;4</b> shift
                    the number left by 1 or 4 bits (multiply by 2 or 16), and <b>&gt;&gt;1</b> and{' '}
                    <b>&gt;&gt;4</b> shift it right (divide by 2 or 16, rounded down). <b>Prev</b> and{' '}
                    <b>Next</b> go to the closest power of 2 below or above the number. You can also type
                    hexadecimal (<code>0x4000</code>) or binary (<code>0b100</code>) numbers.
                  </p>
                </article>
              </div>
            </section>
          </div>
        </div>

        {/* ================================================================
            WORKSPACE 3: THEORY (always mounted so Bibliography is deterministic)
           ================================================================ */}
        <div
          role="tabpanel"
          hidden={workspace !== 'theory'}
          className={styles.workspacePanel}
        >
          <div className={styles.theoryLayout}>
            <section className={styles.card} aria-labelledby="parameters-title">
              <h2 id="parameters-title" className={styles.sectionTitle}>
                {t('simsetup.theory.parametersTitle')}
              </h2>
              <ParameterList />
            </section>

            <section className={styles.card} aria-labelledby="coherent-title">
              <CoherentSampling bib={bib} />
            </section>

            <section className={styles.card} aria-labelledby="references-title">
              <h2 id="references-title" className={styles.sectionTitle}>
                {t('simsetup.theory.referencesTitle')}
              </h2>
              {bib.list()}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
