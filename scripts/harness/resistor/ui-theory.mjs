// The Theory and References sections of /resistor/main: that they are there, that every citation leads to an entry
// and the entries are numbered by first citation, that the live items follow the value, and that an EIA-96 marking
// with R or S offers both readings. Called by ui.mjs.

const BOLTZMANN = 1.380649e-23;
const compact = (text) => text.replace(/\s/g, '');

// "8.8 nV" as the page writes it, to compare with what the page shows.
function eng(value, unit, digits = 3) {
  const steps = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f']];
  const [scale, prefix] = steps.find(([s]) => value >= s * 0.9995) ?? steps[steps.length - 1];
  return `${Number((value / scale).toPrecision(digits))}${prefix}${unit}`;
}

export async function theoryChecks({ browser, base, ok }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const open = async (query) => { await page.goto(`${base}/resistor/main${query}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(250); };
  const text = async (id) => compact(await page.getByTestId(id).first().innerText());

  // What the citations of the page say: the numbers in the order of the page, and the list of entries.
  const citations = () => page.evaluate(() => {
    const cites = [...document.querySelectorAll('a[href^="#ref-"]')].map((a) => ({ key: a.getAttribute('href').slice(5), number: Number(a.textContent.replace(/[[\]]/g, '')) }));
    const entries = [...document.querySelectorAll('#references li[id^="ref-"]')].map((li) => ({ key: li.id.slice(4), number: Number(li.firstElementChild.textContent.replace(/[[\]]/g, '')), text: li.textContent }));
    return { cites, entries };
  });
  const checkCitations = async (when) => {
    const { cites, entries } = await citations();
    const byKey = new Map(entries.map((e) => [e.key, e.number]));
    const first = [];
    for (const cite of cites) if (!first.some((f) => f.key === cite.key)) first.push(cite);
    ok(cites.length > 40 && cites.every((cite) => byKey.get(cite.key) === cite.number), `${when}: each of the ${cites.length} citations links to the entry with its number`);
    ok(first.every((cite, i) => i === 0 || cite.number > first[i - 1].number), `${when}: the sources are numbered in the order they are first cited: ${first.map((f) => f.number).join(' ')}`);
    ok(entries.length >= 20 && entries.every((entry, i) => entry.number === i + 1) && entries.every((entry) => entry.text.length > 30), `${when}: the list has ${entries.length} entries, numbered 1 to ${entries.length}`);
    return { first, entries };
  };

  // 1. The sections and the nav.
  await open('');
  const nav = await page.locator('nav[aria-label="Sections"] a').allInnerTexts();
  ok(nav.join(' ') === 'Lookup Drawing Combinations Design Reference Theory References', `the nav ends with Theory and References: ${nav.join(' ')}`);
  ok((await page.locator('#theory h2').innerText()).toLowerCase() === 'theory' && (await page.locator('#references h2').innerText()).toLowerCase() === 'references', 'the Theory and References sections are on the page');
  const topics = await page.locator('#theory details').count();
  ok(topics === 14 && await page.locator('#theory ol a').count() === topics, `the theory has ${topics} topics, each in the contents`);
  ok(await page.locator('#theory details[open]').count() === topics, 'on a wide screen every topic is open');
  ok(await page.locator('#theory math').count() >= 25 && await page.locator('#theory svg').count() >= 6, 'formulas and figures are drawn');
  const empty = await checkCitations('before a value is typed');

  // 2. The live items follow the value.
  ok((await text('theory-current')) === 'I=1.06mA' && (await text('theory-power')) === 'P=5.32mW', `the example is 5 V across 4.7 kΩ: ${await text('theory-current')} ${await text('theory-power')}`);
  await open('?q=10k');
  const noise = (ohms) => `${eng(Math.sqrt(4 * BOLTZMANN * 298.15 * ohms), 'V')}/√Hz`;
  ok((await text('theory-current')) === 'I=500µA' && (await text('theory-power')) === 'P=2.5mW', `Ohm's law with 10 kΩ: ${await text('theory-current')} ${await text('theory-power')}`);
  ok((await text('theory-noise')) === noise(1e4) && noise(1e4) === '12.8nV/√Hz', `thermal noise of 10 kΩ: ${await text('theory-noise')}`);
  await page.locator('#resistor-input').fill('1M');
  await page.waitForTimeout(200);
  ok((await text('theory-current')) === 'I=5µA' && (await text('theory-power')) === 'P=25µW' && (await text('theory-noise')) === noise(1e6), `the numbers follow the value to 1 MΩ: ${await text('theory-current')} ${await text('theory-noise')}`);
  await page.getByTestId('theory-volts').fill('12');
  ok((await text('theory-current')) === 'I=12µA' && (await text('theory-power')) === 'P=144µW', `and the voltage to 12 V: ${await text('theory-current')} ${await text('theory-power')}`);
  await page.getByTestId('theory-volts').fill('x');
  ok(await page.getByTestId('theory-current').count() === 0 && await page.getByTestId('theory-volts').getAttribute('aria-invalid') === 'true', 'a voltage that cannot be read is marked');
  ok((await text('theory-series-note')).includes('1MΩ,isavalueofE3,E6,E12,E24,E48,E96andE192') && await page.locator('[data-testid="theory-series"] tr[data-on]').count() === 7, 'the series table marks the series of the value');
  await page.locator('#resistor-input').fill('4k75');
  await page.waitForTimeout(200);
  ok(await page.locator('[data-testid="theory-series"] tr[data-on]').count() === 2, '4.75 kΩ is marked in E96 and E192');

  // 3. The derating curve follows the chip size, and sets it.
  await open('?q=10k&part=chip&size=0603');
  ok((await text('theory-derating')).includes('0603carries100mWupto70°C,82.4mWat85°C,64.7mWat100°C,35.3mWat125°Candnothingat155°C'), `derating of an 0603: ${await text('theory-derating')}`);
  ok((await text('theory-voltage')).includes('31.6V') && (await text('theory-voltage')).includes('75V') && (await text('theory-voltage')).includes('56.3kΩ'), `the limits of 10 kΩ in 0603: ${await text('theory-voltage')}`);
  await page.getByTestId('theory-size').selectOption('0201');
  await page.waitForTimeout(200);
  ok(new URL(page.url()).searchParams.get('size') === '0201' && (await text('theory-derating')).includes('0201carries50mWupto70°C,36.4mWat85°C,22.7mWat100°Candnothingat125°C'), `the size is the one of the drawing: ${await text('theory-derating')}`);
  const full = await checkCitations('with a value and a chip');
  ok(full.first.every((cite, i) => cite.number === i + 1) && full.first.length === full.entries.length, `with a value every listed source is cited, without a gap: ${full.first.length} of ${full.entries.length}`);

  // 4. Folding, and a link to a topic.
  await page.getByRole('button', { name: 'Fold all' }).click();
  ok(await page.locator('#theory details[open]').count() === 0, 'Fold all closes every topic');
  await page.locator('#theory ol a', { hasText: 'Noise' }).click();
  await page.waitForTimeout(150);
  ok(await page.locator('#theory details[open]').count() === 1 && await page.locator('#theory-noise[open]').count() === 1 && new URL(page.url()).hash === '#theory-noise', 'a click in the contents opens that topic');
  await page.locator('#theory-noise a[href^="#ref-"]').first().click();
  await page.waitForTimeout(150);
  ok(new URL(page.url()).hash.startsWith('#ref-') && await page.locator(new URL(page.url()).hash).isVisible(), 'a citation jumps to its entry');

  // 5. EIA-96 with R or S: the usual reading first, the other offered, with a note; the table says so.
  await open('?q=68S&read=marking');
  const readings = await page.locator('#resistor-input').evaluate((element) => element.closest('div').parentElement.innerText);
  ok(compact(await page.locator('output').innerText()) === '4.99Ω', `68S is 4.99 Ω first: ${compact(await page.locator('output').innerText())}`);
  ok(/other reading/.test(readings) && /49\.9/.test(readings) && /Makers do not agree on the EIA-96 letters R and S/.test(await page.locator('main').innerText()), 'the other reading of 68S (49.9 Ω) is offered with the note on R and S');
  await open('?q=68R&read=marking');
  ok(/49\.9/.test(await page.locator('main').innerText()) && /other reading/.test(await page.locator('main').innerText()), '68R offers both readings too');
  const note = await page.getByTestId('eia96-note').innerText();
  const letters = await page.locator('[aria-label="Multiplier letters"]').innerText();
  ok(/makers do not agree/.test(note) && /Y or S/.test(letters) && /X or R/.test(letters), 'the EIA-96 table names the disagreement on R and S');

  // 6. The corrected tables.
  const reference = await page.locator('#reference').innerText();
  ok(/1\/6 W/.test(reference) && !/1\/8 W/.test(reference) && /Vishay 400 V/.test(reference) && /1812 \*/.test(reference) && /not verified/.test(reference), 'the Reference tables have the corrected bodies, voltages and the unverified 1812 row');

  // 7. The headline of the Design section keeps numbers with their units and brackets.
  await open('?dc=div');
  const sentence = await page.getByTestId('design-answer').locator('p').first().evaluate((p) => p.textContent).catch(() => '');
  ok(sentence === '' || (/\(\S* %\)/.test(sentence) && !/\d %/.test(sentence) && !/\d [kMm]?[ΩVAW]\b/.test(sentence)), `the Design sentence does not break between a number and its unit: ${sentence}`);

  // 8. At phone width the topics start folded and nothing is wider than the screen.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true });
  const small = await phone.newPage();
  await small.goto(`${base}/resistor/main?q=4k7`, { waitUntil: 'networkidle' });
  await small.waitForTimeout(300);
  ok(await small.locator('#theory details[open]').count() === 0, 'on a phone the topics start folded');
  await small.getByRole('button', { name: 'Open all' }).click();
  await small.waitForTimeout(150);
  const overflow = await small.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(await small.locator('#theory details[open]').count() === 14 && overflow <= 1, `opened on a phone the page is not wider than the screen: ${overflow} px`);
  await phone.close();

  ok(errors.length === 0, `no errors in the console with the theory: ${errors.join(' | ')}`);
  ok(empty.first.length >= 15, `before a value is typed ${empty.first.length} sources are cited`);
  await context.close();
}
