// The Design section of /resistor/main in the browser, compared with the engine. Called by ui.mjs (npm run ui).

import * as imported from '../../../lib/resistor/index.ts';
import * as importedState from '../../../components/Resistor/design.ts';

const lib = imported.default ?? imported;
const state = importedState.default ?? importedState;
const { suggestParts, seriesList, usualSeries, series, formatOhms } = lib;
const { designFromParams, designToParams, parseDesign, designOptions, designRange, answerText, candidateText, legsText, outputText, spanText, errorText, specText } = state;

const TEMPS = [-40, 25, 85, 125];
const compact = (text) => text.replace(/\s+/g, ' ').trim();

// What the engine gives for a link, through the page's own reading of it.
function fromLink(query) {
  const design = designFromParams(new URLSearchParams(query));
  const parsed = parseDesign(design);
  const [min, max] = designRange(design);
  const seriesId = design.series ?? usualSeries(parsed.spec.tolerancePct);
  const values = design.list ? design.list.values : seriesList(seriesId, min, max);
  const options = designOptions(design, parsed, values.length);
  const source = `${series(seriesId).label} (${formatOhms(min)} to ${formatOhms(max)})`;
  return { design, parsed, options, values, source, found: suggestParts(parsed.circuit, parsed.target, values, options) };
}

export async function designChecks({ browser, base, ok }) {
  const errors = [];
  const openPage = async (query, options = {}) => {
    const context = await browser.newContext({ viewport: { width: options.width ?? 1280, height: 900 }, colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'] });
    if (options.noWorker) await context.addInitScript(() => { window.Worker = undefined; });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/resistor/main${query}`, { waitUntil: 'networkidle' });
    return page;
  };
  const section = (page) => page.locator('#design');
  const status = (page) => section(page).getByTestId('design-status');
  // The results are in when the status line is no longer marked busy.
  const done = async (page) => {
    await page.waitForTimeout(150);
    await page.waitForFunction(() => document.querySelector('#design [data-testid=design-status]')?.getAttribute('data-busy') === 'false', null, { timeout: 20000 });
  };
  const formulas = (page) => section(page).locator('ol [data-testid=design-formula]').allInnerTexts();
  const answer = async (page) => compact(await section(page).getByTestId('design-answer').locator('p').innerText());
  const rows = (page) => section(page).locator('ol > li');
  const expected = (id, found, count = 6) => found.candidates.slice(0, count).map((c) => legsText(id, c.legs)).join('|');

  // 1. The four circuits: the first suggestion and the numbers of the answer are the engine's, found by hand here.
  const spec = { tolerancePct: 1, tcrPpm: 100 };
  const common = { spec, temperatures: TEMPS, drift: 'independent', trackingPpm: 0, allowedPct: 5, chipSize: '0603', keep: 20 };
  const limits = { total: { min: 1e3, max: 1e6 } };
  const cases = [
    ['5 V and 10 mA', '', { id: 'single-current', inputs: { volts: 5 } }, 0.01, seriesList('E96'), { ...common, maxParts: 2 }, 'E96 (1 Ω to 10 MΩ)'],
    ['a 5 V to 2.5 V divider', '?dc=div&dv=5&dt=2.5', { id: 'divider', inputs: { vin: 5 } }, 2.5, seriesList('E96'), { ...common, legParts: 1, ranges: limits }, 'E96 (1 Ω to 10 MΩ)'],
    ['0.8 V to 3.3 V feedback', '?dc=fb&dv=0.8&dt=3.3', { id: 'feedback', inputs: { vref: 0.8 } }, 3.3, seriesList('E96'), { ...common, legParts: 1, ranges: limits }, 'E96 (1 Ω to 10 MΩ)'],
    ['a 5 A, 50 mV shunt', '?dc=sh&da=5&dt=50m', { id: 'shunt', inputs: { amps: 5 } }, 0.05, seriesList('E96', 0.001, 1), { ...common, maxParts: 2 }, 'E96 (1 mΩ to 1 Ω)'],
  ];
  let page = await openPage('');
  for (const [name, query, circuit, target, values, options, source] of cases) {
    if (query) await page.goto(`${base}/resistor/main${query}`, { waitUntil: 'networkidle' });
    await done(page);
    const found = suggestParts(circuit, target, values, options);
    const first = found.candidates[0];
    const shown = await formulas(page);
    ok(shown[0] === legsText(circuit.id, first.legs) && shown.join('|') === expected(circuit.id, found), `${name}: the first six suggestions are the engine's, in its order: ${shown[0]}`);
    const sentence = await answer(page);
    ok(sentence === answerText(circuit.id, found, options, source).text && sentence.includes(outputText(circuit.id, first.output)) && sentence.includes(spanText(first.minPct, first.maxPct)),
      `${name}: the answer has the engine's output and worst case: ${sentence}`);
    const row = compact(await rows(page).first().innerText());
    ok(row.includes(outputText(circuit.id, first.output)) && row.includes(errorText(first.errorPct)) && row.includes(spanText(first.minPct, first.maxPct)) && row.includes(first.passes ? 'inside' : 'outside'),
      `${name}: the first row has the output, its error, the worst case and the verdict`);
    ok(await section(page).locator('svg[aria-label="Schematic of the circuit"]').count() === 1, `${name}: the circuit has a schematic`);
  }
  ok(await status(page).getAttribute('data-place') === 'worker', `the suggestions are found in the worker: ${await status(page).getAttribute('data-place')}`);

  // The shunt, opened: 250 mW is more than a 0603 carries, and "use this value" makes 10 mΩ the tool's value.
  await rows(page).first().getByRole('button', { name: /^Details/ }).click();
  ok(await section(page).getByTestId('design-over').isVisible() && /250 mW/.test(await section(page).getByTestId('design-over').innerText()), 'a part above the rating of the chosen chip size is warned about');
  await section(page).getByRole('button', { name: /^Use 10 mΩ as the value/ }).click();
  await page.waitForTimeout(200);
  ok(compact(await page.locator('output').innerText()).replace(/ /g, '') === '10mΩ', `"use this value" makes it the tool's value: ${await page.locator('output').innerText()}`);

  // 2. Nothing passes: the needed tolerance and TCR are named, and one click applies them.
  let query = '?dc=div&dv=5&dt=2.5&dp=1&dtol=5&dtcr=200&ds=e24';
  await page.goto(`${base}/resistor/main${query}`, { waitUntil: 'networkidle' });
  await done(page);
  let engine = fromLink(query);
  let sentence = await answer(page);
  ok(engine.found.passing === 0 && engine.found.needed.why === 'tighter' && sentence.startsWith('Nothing from E24') && sentence.includes(`needs about ${specText(engine.found.needed.spec)}`),
    `when nothing passes the answer names the parts needed: ${sentence}`);
  ok(await rows(page).first().getAttribute('data-pass') === 'false', 'the suggestions are then marked as outside');
  await section(page).getByTestId('design-apply').click();
  await done(page);
  sentence = await answer(page);
  const params = () => new URL(page.url()).searchParams;
  ok(await section(page).getByTestId('design-answer').getAttribute('data-kind') === 'pass' && await rows(page).first().getAttribute('data-pass') === 'true'
    && await section(page).getByLabel('Tolerance of the resistors, in percent').inputValue() === String(engine.found.needed.spec.tolerancePct)
    && await section(page).getByLabel('Temperature coefficient of the resistors, in ppm per kelvin').inputValue() === String(engine.found.needed.spec.tcrPpm),
  `applying the needed parts makes a suggestion pass: ${sentence}`);

  // 3. A temperature chip removed takes its row away; "parts track" narrows the spread of a divider.
  query = '?dc=div&dv=5&dt=2.5';
  await page.goto(`${base}/resistor/main${query}`, { waitUntil: 'networkidle' });
  await done(page);
  await rows(page).first().getByRole('button', { name: /^Details/ }).click();
  const temperatures = () => section(page).getByTestId('design-temperature').locator('[role=rowheader]').allInnerTexts();
  ok((await temperatures()).join('|') === '−40 °C|25 °C|85 °C|125 °C', `an opened suggestion has a row for each temperature: ${(await temperatures()).join('|')}`);
  ok(await section(page).getByRole('table', { name: 'What each resistor carries' }).getByRole('row').count() === 3, 'and a row for each resistor with its voltage, current and power');
  await section(page).getByRole('button', { name: 'Remove 125 °C' }).click();
  await done(page);
  ok((await temperatures()).join('|') === '−40 °C|25 °C|85 °C' && params().get('dtemp') === '-40_25_85', `removing a temperature removes its row: ${(await temperatures()).join('|')}`);
  await section(page).getByLabel('A temperature to add, in °C').fill('150');
  await section(page).getByRole('button', { name: 'Add', exact: true }).click();
  await done(page);
  ok((await temperatures()).join('|') === '−40 °C|25 °C|85 °C|150 °C', `a temperature can be added: ${(await temperatures()).join('|')}`);
  await section(page).getByRole('button', { name: /^Back to/ }).click();
  await done(page);
  engine = fromLink(query);
  const wide = engine.found.candidates[0];
  await section(page).getByRole('radio', { name: 'Parts track' }).click();
  await done(page);
  const tracked = fromLink(`${query}&dm=t`).found.candidates[0];
  const row = compact(await rows(page).first().innerText());
  ok(params().get('dm') === 't' && row.includes(spanText(tracked.minPct, tracked.maxPct)) && tracked.maxPct - tracked.minPct < (wide.maxPct - wide.minPct) * 0.75,
    `parts that track narrow the spread of a divider: ${spanText(wide.minPct, wide.maxPct)} becomes ${spanText(tracked.minPct, tracked.maxPct)}`);

  // 4. A suggestion is copied as text.
  await rows(page).first().getByRole('button', { name: /^Copy as text/ }).click();
  await page.waitForTimeout(100);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  ok(copied === candidateText('divider', tracked, 5, TEMPS), `a suggestion is copied as text: ${copied}`);

  // 5. A link with every input gives the same results in a fresh page, and the page writes the same link back.
  query = '?dc=div&dv=9&dl=100k&dt=3%2C3&dp=2&dk=thin-film&dtol=0.5&dtcr=50&dtemp=-20_25_70&dm=t&dts=10&ds=e24e96&dr=100R-1M&dg=2&dtr=5k-200k&dcr=10u-2m&dz=0805';
  await page.goto(`${base}/resistor/main${query}`, { waitUntil: 'networkidle' });
  await done(page);
  engine = fromLink(query);
  let shown = await formulas(page);
  sentence = await answer(page);
  ok(engine.parsed.target === 3.3 && engine.parsed.circuit.inputs.load === 1e5 && engine.options.legParts === 2 && engine.options.ranges.current.max === 0.002 && engine.options.trackingPpm === 10,
    'the link is read: a decimal comma, a load, two values in each resistance, the limits and the tracking spread');
  ok(shown.length === 6 && shown.join('|') === expected('divider', engine.found) && sentence === answerText('divider', engine.found, engine.options, engine.source).text,
    `a link with every input shows the engine's results: ${shown[0]} · ${sentence}`);
  const back = new URLSearchParams();
  designToParams(engine.design, back);
  ok([...back.keys()].every((name) => params().get(name) === back.get(name)) && [...back.keys()].length === 17, `the page keeps every input in the link: ${[...back.keys()].length} parameters`);
  const fresh = await openPage(new URL(page.url()).search);
  await done(fresh);
  ok((await formulas(fresh)).join('|') === shown.join('|') && await answer(fresh) === sentence, 'the link of the page restores the same results in a fresh page');
  await fresh.context().close();

  // 6. Typing stays responsive while two-value legs of E96 are compared: the run is in the worker, the results on
  //    the page are dimmed meanwhile, and no frame of the page waits for the run.
  query = '?dc=div&dv=12&dt=3.3&dg=2&ds=e96&dp=1';
  await page.goto(`${base}/resistor/main${query}`, { waitUntil: 'networkidle' });
  await done(page);
  await page.evaluate(() => {
    window.gaps = [];
    window.dimmed = false;
    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      window.gaps.push(now - last);
      last = now;
      if (document.querySelector('#design [data-busy=true] ol')) window.dimmed = true;
    }, 4);
    new MutationObserver(() => { if (document.querySelector('#design ol')?.parentElement.hasAttribute('data-busy')) window.dimmed = true; }).observe(document.querySelector('#design'), { attributes: true, subtree: true });
  });
  const targetField = section(page).getByLabel('Target, in volts');
  await targetField.focus();
  await targetField.press('End');
  await targetField.pressSequentially('47', { delay: 25 });
  await done(page);
  const measured = await page.evaluate(() => ({ gap: Math.max(...window.gaps), dimmed: window.dimmed }));
  engine = fromLink('?dc=div&dv=12&dt=3.347&dg=2&ds=e96&dp=1');
  shown = await formulas(page);
  ok(await targetField.inputValue() === '3.347' && shown.join('|') === expected('divider', engine.found), `after typing during a run the results are those of the last text: ${shown[0]}`);
  ok(await status(page).getAttribute('data-place') === 'worker' && measured.gap < 250, `typing stays responsive while a search runs in the worker: the longest pause of the page was ${Math.round(measured.gap)} ms`);
  ok(measured.dimmed, 'the results on the page are dimmed while new ones are on the way');

  // 7. What cannot be: a divider above its input, an empty field; and a series too long for two-value legs says why.
  await targetField.fill('15');
  await page.waitForTimeout(200);
  ok(await section(page).getByTestId('design-problem').innerText() === 'The output of a divider lies between zero and the input voltage.' && await rows(page).count() === 0, 'a target that the circuit cannot give says why');
  await targetField.fill('');
  await page.waitForTimeout(200);
  ok((await section(page).getByTestId('design-problem').innerText()).startsWith('Fill in the marked fields') && await targetField.getAttribute('aria-invalid') === 'true', 'an empty field is marked and nothing is suggested');
  await page.goto(`${base}/resistor/main?dc=div&dg=2&ds=e192`, { waitUntil: 'networkidle' });
  await done(page);
  ok(await section(page).getByText('Two values in series or parallel are offered up to 900 values').isVisible() && (await formulas(page)).every((text) => !/[+∥]/.test(text)),
    'with E192 over seven decades each resistance is one value, and the page says why');
  await page.context().close();

  // 8. Without workers the same suggestions are found on the page; at phone width nothing is wider than the window.
  query = '?dc=fb&dt=5&dg=2&ds=e24';
  page = await openPage(query, { noWorker: true, width: 390 });
  await done(page);
  engine = fromLink(query);
  shown = await formulas(page);
  ok(await status(page).getAttribute('data-place') === 'page' && shown.join('|') === expected('feedback', engine.found), `without a worker the suggestions are found on the page: ${shown[0]}`);
  await rows(page).first().getByRole('button', { name: /^Details/ }).click();
  await page.waitForTimeout(200);
  const fits = await page.evaluate(() => {
    const within = [...document.querySelectorAll('#design [role=table]')].every((table) => table.scrollWidth <= table.parentElement.clientWidth + 1 && table.getBoundingClientRect().right <= window.innerWidth);
    return within && document.documentElement.scrollWidth <= document.documentElement.clientWidth;
  });
  ok(fits, 'at 390 px an opened suggestion fits the window: its tables are not cut off');
  await page.goto(`${base}/resistor/main?q=628.75&cs=e24&cv=12`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#combinations [data-testid=search-status]')?.getAttribute('data-busy') === 'false', null, { timeout: 15000 });
  await page.locator('#combinations ol > li').nth(1).getByRole('button', { name: /^Details/ }).click();
  await page.waitForTimeout(200);
  const table = await page.evaluate(() => {
    const shares = document.querySelector('#combinations [aria-label="Share of each resistor"]');
    const cells = [...shares.querySelectorAll('[role=cell]')];
    return { inside: shares.scrollWidth <= shares.parentElement.clientWidth + 1 && cells.every((cell) => cell.getBoundingClientRect().right <= window.innerWidth - 15 && cell.getBoundingClientRect().left >= 15), cells: cells.length };
  });
  ok(table.inside && table.cells === 12, `at 390 px the table of an opened combination shows every column without scrolling: ${table.cells} cells`);
  await page.context().close();

  ok(errors.length === 0, `no errors in the console of the Design checks: ${errors.join(' | ')}`);
}
