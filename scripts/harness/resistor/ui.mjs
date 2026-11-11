// Drives /resistor/main in the installed Edge (or Chrome) and checks what a visitor does: typing, picking a reading,
// stepping, clicking a value, the tolerance, the link and the theme. The dev server must be running (port 3020).
//   tsx ui.mjs [base URL]        (npm run ui; tsx because ui-combos.mjs imports the library)

import { readFileSync } from 'node:fs';

import { chromium } from 'playwright-core';

import { combinationChecks } from './ui-combos.mjs';
import { designChecks } from './ui-design.mjs';
import { theoryChecks } from './ui-theory.mjs';

const base = process.argv[2] ?? 'http://localhost:3020';
let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); process.exit(1); }

let passed = 0;
const failures = [];
const ok = (condition, what) => { if (condition) passed++; else failures.push(what); };

const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

const input = page.locator('#resistor-input');
const compact = (text) => text.replace(/\s/g, '');
const value = async () => compact(await page.locator('output').innerText());
const query = () => new URL(page.url()).searchParams;
const settle = () => page.waitForTimeout(150);

await page.goto(`${base}/resistor/main`, { waitUntil: 'networkidle' });
ok(await input.evaluate((element) => element === document.activeElement), 'the field has focus on load');
ok(await page.locator('output').getAttribute('data-empty') === 'true', 'no value before anything is typed');

await input.pressSequentially('4k7');
await settle();
ok((await value()) === '4.7kΩ', `typing 4k7 shows 4.7 kΩ: ${await value()}`);
ok(query().get('q') === '4k7', 'the text is in the link');
ok(await page.getByRole('row').filter({ hasText: 'E24' }).first().getByText('exact').isVisible(), '4.7 kΩ is exact in E24');

await input.press('ArrowUp');
await settle();
ok((await input.inputValue()) === '5.1 kΩ', `arrow up steps to 5.1 kΩ: ${await input.inputValue()}`);
await input.press('ArrowDown');
await input.press('ArrowDown');
await settle();
ok((await input.inputValue()) === '4.3 kΩ', `arrow down twice steps to 4.3 kΩ: ${await input.inputValue()}`);

await page.getByRole('radio', { name: '±1 %', exact: true }).click();
await settle();
ok(query().get('tol') === '1', 'the tolerance is in the link');
await input.press('ArrowUp');
await settle();
ok((await input.inputValue()) === '4.32 kΩ', `at 1 % the arrows step through E96: ${await input.inputValue()}`);
await page.getByRole('radio', { name: /E12/ }).click();
await input.press('ArrowUp');
await settle();
ok((await input.inputValue()) === '4.7 kΩ' && query().get('e') === 'e12', `a chosen series is stepped through and is in the link: ${await input.inputValue()}`);

await input.fill('4.85k');
await settle();
await page.getByRole('row').filter({ hasText: 'E96' }).first().getByRole('button', { name: /4\.87/ }).first().click();
await settle();
ok((await value()) === '4.87kΩ', `clicking a standard value makes it the value: ${await value()}`);

await input.fill('101');
await settle();
const readings = page.getByRole('radiogroup', { name: 'How to read it' });
ok(await readings.getByRole('radio', { name: /^Value/ }).isChecked() && (await value()) === '101Ω', '101 is first read as the value 101 Ω');
await readings.getByRole('radio', { name: /SMD marking/ }).click();
await settle();
ok((await value()) === '100Ω' && query().get('as') === 'digits3', `the other reading can be picked and is in the link: ${query().get('as')}`);

await input.fill('yel vio red gold');
await settle();
ok((await value()) === '4.7kΩ' && await page.getByRole('radio', { name: '±5 %', exact: true }).isChecked(), 'band colours give the value and set the tolerance');
ok(await page.getByRole('list', { name: /4 bands: yellow, violet, red, gold/ }).isVisible(), 'the four bands are named');

await input.fill('zzz');
await settle();
ok(await page.getByText('is not a colour of the code').isVisible(), 'a text that cannot be read says why');

// A link gives the same result again, also in a new window.
const link = `${base}/resistor/main?q=101&as=digits3&tol=0.1&e=e192`;
const second = await context.newPage();
await second.goto(link, { waitUntil: 'networkidle' });
await second.waitForTimeout(300);
ok(compact(await second.locator('output').innerText()) === '100Ω', 'a link opens with its value and the reading that was picked');
ok(await second.getByRole('radio', { name: '±0.1 %', exact: true }).isChecked() && await second.getByRole('radio', { name: /E192/ }).isChecked(), 'a link opens with its tolerance and series');
ok(second.url() === link, `a link stays as it was: ${second.url()}`);
await second.close();

const themeSwitch = page.getByRole('button', { name: /light and the dark theme/ });
await themeSwitch.click();
await settle();
ok(await page.evaluate(() => document.querySelector('[data-theme="dark"]') !== null && localStorage.getItem('resistor.theme') === 'dark'), 'the switch turns the page dark and remembers it');
await page.reload({ waitUntil: 'networkidle' });
await settle();
ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(20, 21, 19)'), 'the theme is kept after a reload');
await themeSwitch.click();
await settle();
ok(await page.evaluate(() => localStorage.getItem('resistor.theme') === null), 'back on the theme of the system, nothing is stored');

// ---------------------------------------------------------------------------------------------------- step S2
// The drawing: a band is clicked and its colour chosen, the number of bands, the other end, the marking of a chip.
const bandAreas = () => page.locator('[data-part="axial"] [data-band]').count();
const group = (name) => page.getByRole('radiogroup', { name }).first();
await input.fill('4k7');
await settle();
ok(await page.locator('[data-part="axial"] svg').isVisible() && await bandAreas() === 4, '4k7 is drawn as an axial resistor with four bands');
await page.locator('[data-part="axial"] [data-band="2"]').click({ force: true });
await settle();
ok(await page.getByText('Band 3 · Multiplier').isVisible(), 'a click on a band opens its colours');
await page.getByRole('radio', { name: /^orange/ }).click();
await settle();
ok((await value()) === '47kΩ', `choosing orange for the multiplier gives 47 kΩ: ${await value()}`);
await page.getByRole('button', { name: /^Band 1, yellow/ }).click();
await page.getByRole('radio', { name: /^brown/ }).click();
await settle();
ok((await value()) === '17kΩ', `choosing brown for the first band gives 17 kΩ: ${await value()}`);
ok(await page.getByRole('radio', { name: /^black/ }).getAttribute('aria-disabled') === 'true', 'a colour that gives no code cannot be chosen');

await input.fill('10k');
await group('Number of bands').getByRole('radio', { name: '5' }).click();
await page.getByRole('radio', { name: '±1 %', exact: true }).click();
await settle();
ok(await bandAreas() === 5 && query().get('bands') === '5', 'five bands are drawn and are in the link');
ok(await page.getByText('Both directions are codes').isVisible(), 'both reading directions are shown when both are codes');
await page.getByRole('button', { name: /Read from the other end/ }).click();
await settle();
ok((await value()) === '120Ω', `read from the other end, 10 kΩ at 1 % is 120 Ω: ${await value()}`);

await input.fill('49k9');
await group('Number of bands').getByRole('radio', { name: '4' }).click();
await settle();
ok(await page.getByText('49.9 kΩ has more than two digits').first().isVisible(), 'a value four bands cannot show says why');
await page.getByRole('button', { name: 'Use 50 kΩ' }).click();
await settle();
ok((await value()) === '50kΩ' && await bandAreas() === 4, 'and the nearest value that can be shown is offered');

await group('Kind of resistor').getByRole('radio', { name: 'Chip' }).click();
await settle();
ok(query().get('part') === 'chip' && await page.locator('[data-part="chip"] svg').isVisible(), 'the chip is drawn and is in the link');
const marking = page.locator('#resistor-marking');
await marking.fill('1002');
await settle();
ok((await value()) === '10kΩ' && query().get('mark') === '4', `typing the marking 1002 gives 10 kΩ: ${await value()}`);
await marking.fill('68X');
await settle();
ok((await value()) === '49.9Ω' && query().get('mark') === 'eia96', `typing the marking 68X gives 49.9 Ω: ${await value()}`);
await marking.blur();
await page.getByRole('combobox', { name: /Chip size/ }).selectOption('0201');
await settle();
ok(query().get('size') === '0201' && await page.getByText('carry no marking, so the drawing has none').isVisible(), 'a size without a marking says so');
await page.getByRole('combobox', { name: /Chip size/ }).selectOption('0603');

await group('Style of the drawing').getByRole('radio', { name: 'Flat' }).click();
await settle();
ok(await page.evaluate(() => localStorage.getItem('resistor.style') === 'flat' && !document.querySelector('[data-part] svg filter')), 'the flat style is drawn and remembered');

// The exports: every format comes out at the width asked for, under a name that says what it is.
await page.getByRole('spinbutton', { name: 'Width in pixels' }).fill('640');
for (const [format, mime] of [['SVG', 'image/svg+xml'], ['PNG', 'image/png'], ['JPG', 'image/jpeg'], ['WebP', 'image/webp']]) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: format, exact: true }).first().click()]);
  const data = readFileSync(await download.path());
  const width = await page.evaluate(([type, base64]) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth);
    image.onerror = () => resolve(0);
    image.src = `data:${type};base64,${base64}`;
  }), [mime, data.toString('base64')]);
  const name = download.suggestedFilename();
  ok(width === 640 && name === `resistor-49R9-chip-0603.${format.toLowerCase()}`, `${format} is saved 640 px wide as resistor-49R9-chip-0603: ${width} px, ${name}`);
  if (format === 'SVG') {
    const text = data.toString('utf8');
    ok(await page.evaluate((svg) => !new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror'), text) && !/var\(|currentColor|data-band/.test(text), 'the saved SVG is read by the browser and stands alone');
  }
}
await group('Pixel density').getByRole('radio', { name: '2×' }).click();
await settle();
ok(await page.getByText(/1280 × \d+ px/).isVisible(), 'at 2× the file is twice as wide');
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
await page.getByRole('button', { name: 'SVG', exact: true }).nth(1).click();
await settle();
ok((await page.evaluate(() => navigator.clipboard.readText())).startsWith('<svg width="1280"'), 'the SVG is copied as text');
await page.getByRole('button', { name: 'Image', exact: true }).click();
await page.waitForTimeout(700);
ok(await page.getByText(/Copied as a PNG of 1280/).isVisible(), 'the picture is copied as a PNG');

// The reference tables use what is clicked and mark the current value.
await page.getByTitle('Use 10 Ω', { exact: true }).click();
await settle();
ok((await value()) === '10Ω' && await page.locator('#resistor-marking').inputValue() === '01X', `a click on EIA-96 code 01 gives 10 Ω, marked 01X: ${await value()}`);
await page.getByTitle('Draw a 1206 chip').click();
await settle();
ok(query().get('size') === '1206', 'a click on a chip size draws that size');
await page.getByTitle('Use ±2 %', { exact: true }).click();
await settle();
ok(query().get('part') === 'axial' && await page.getByRole('radio', { name: '±2 %', exact: true }).isChecked(), 'a click on a tolerance in the colour table uses it');
await group('Style of the drawing').getByRole('radio', { name: 'Realistic' }).click();

// A link with the choices of the drawing opens as it was.
const drawn = `${base}/resistor/main?q=4k7&part=chip&size=1206&mark=4`;
const third = await context.newPage();
await third.goto(drawn, { waitUntil: 'networkidle' });
await third.waitForTimeout(300);
ok(await third.locator('#resistor-marking').inputValue() === '4701' && await third.locator('[data-part="chip"][data-size="1206"]').isVisible() && third.url() === drawn, 'a link opens with its part, size and marking system');
await third.close();

// --------------------------------------------------------------------------------------------------- step S2b
{
  const open = async (search = '') => {
    await page.goto(`${base}/resistor/main${search}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
  };
  const readAs = page.getByRole('radiogroup', { name: 'Read digits as' });
  const title = (text) => page.getByTitle(text, { exact: true });

  // 4. Read as: the value first, or the marking when chosen; the choice is in the link.
  await open();
  await input.fill('472');
  await settle();
  ok(await readAs.isVisible() && await readAs.getByRole('radio', { name: 'Value' }).isChecked() && (await value()) === '472Ω', `472 is 472 Ω first: ${await value()}`);
  ok(await readings.getByRole('radio', { name: /SMD marking/ }).isVisible() && !query().has('read'), 'the marking is offered below, and the link has no choice in it');
  await readAs.getByRole('radio', { name: 'Marking' }).click();
  await settle();
  ok((await value()) === '4.7kΩ' && query().get('read') === 'marking' && await page.locator('[data-part="chip"]').isVisible(), `read as a marking, 472 is 4.7 kΩ on a chip, and the link says so: ${await value()}`);
  await input.fill('12');
  await settle();
  ok((await value()) === '12Ω', 'what is no marking is still read as a value');
  await input.fill('4k7');
  await settle();
  ok((await value()) === '4.7kΩ', '4k7 is a value whatever the choice');
  await input.fill('101');
  await settle();
  await readings.getByRole('radio', { name: /^Value/ }).click();
  await settle();
  ok((await value()) === '101Ω' && query().get('as') === 'num' && query().get('read') === 'marking', 'a reading can still be picked from the list');
  const kept = `${base}/resistor/main?q=472&read=marking`;
  await open('?q=472&read=marking');
  ok((await value()) === '4.7kΩ' && page.url() === kept && await readAs.getByRole('radio', { name: 'Marking' }).isChecked(), 'a link opens with its choice');
  await open();
  await page.getByRole('button', { name: /^472 as a marking/ }).click();
  await settle();
  ok((await value()) === '4.7kΩ' && query().get('read') === 'marking', 'the example of a marking sets the choice');
  await open('?read=marking');
  await page.getByRole('button', { name: '4700', exact: true }).click();
  await settle();
  ok((await value()) === '4.7kΩ' && !query().has('read') && (await input.inputValue()) === '4700', 'an example of a value sets it back');

  // 5. From the other end: as typed first, the other end labelled.
  await input.fill('yellow white white red brown');
  await settle();
  ok((await value()) === '49.9kΩ' && await readings.getByRole('radio', { name: /From the other end.*unlikely/ }).isVisible() && await readings.getByText('Unlikely: above 1 GΩ.').isVisible(), 'the other end of 49.9 kΩ 1 % is offered as unlikely, with the reason');
  ok(await page.getByText(/from the other end, 129.GΩ.±0\.02.%, which is unlikely \(above 1 GΩ\)/).isVisible(), 'the note by the drawing says the same');
  await input.fill('brown red white white yellow');
  await settle();
  ok((await value()) === '129GΩ' && await readings.getByRole('radio', { name: /^Colour bands/ }).isChecked(), `an unlikely code is still read as it was typed: ${await value()}`);
  ok(await readings.getByRole('radio', { name: /From the other end.*more likely/ }).isVisible() && await readings.getByText('Unusual: above 1 GΩ.').first().isVisible(), 'its other end is offered as more likely, and the typed one says why it is unusual');
  ok(await readings.getByRole('radio', { name: /^Colour bands/ }).getByText('standard value').count() === 0 && await page.getByText(/which is unusual \(above 1 GΩ\)\. From the other end it reads 49\.9.kΩ.±1.%, which is more likely/).isVisible(), 'neither is called a standard value, and the note by the drawing agrees');
  await input.fill('brown black red brown');
  await settle();
  ok(await readings.getByText(/likely/).count() === 0, 'two plausible directions carry no label');

  // 2. The colour table: a column for each band.
  await open('?q=4k7');
  const table = page.locator('table').filter({ hasText: '3rd' });
  const on = () => table.locator('td[data-on]').evaluateAll((cells) => cells.map((cell) => `${cell.cellIndex}:${cell.parentElement.rowIndex}`).join(' '));
  ok(await table.locator('thead th').count() === 7 && (await on()) === '4:3 1:5 2:8 5:11', `seven columns, and the bands of 4.7 kΩ 5 % marked each in its own: ${await on()}`);
  await title('Add 5 as a third digit: a part with five bands').click();
  await settle();
  ok((await value()) === '4.75kΩ' && query().get('bands') === '5' && (await on()).includes('3:6'), `a third digit makes a five-band part: ${await value()}, ${await on()}`);
  await title('Take the third digit away: a part with four bands').click();
  await settle();
  ok((await value()) === '4.7kΩ' && query().get('bands') === '4' && !(await on()).includes('3:'), `a click on the marked third digit takes it away: ${await value()}`);
  await title('Use red as the second digit').click();
  await settle();
  await title('Use brown as the first digit').click();
  await settle();
  ok((await value()) === '1.2kΩ', `the first and the second digit are set in their own columns: ${await value()}`);
  await title('Use 25 ppm/K, on a part with six bands').click();
  await settle();
  ok(query().get('bands') === '6' && query().get('tcr') === '25' && (await on()).includes('6:5'), 'a TCR makes a six-band part');
  await title('Take the temperature coefficient away: a part with five bands').click();
  await settle();
  ok(query().get('bands') === '5' && !query().has('tcr') && !(await on()).includes('6:'), 'a click on the marked TCR takes the band away');
  await open('?q=4k7&part=chip');
  await title('Use orange as the multiplier').click();
  await settle();
  ok((await value()) === '47kΩ' && query().get('part') === 'axial' && await page.locator('[data-part="axial"]').isVisible(), 'a click in the table switches from the chip to the axial part');
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  const fit = await page.evaluate(() => {
    const element = [...document.querySelectorAll('table')].find((t) => t.textContent.includes('3rd'));
    return { page: document.documentElement.scrollWidth, table: element.getBoundingClientRect().width, room: element.parentElement.clientWidth };
  });
  ok(fit.page <= 390 && fit.table <= fit.room + 0.5, `at 390 px the table fits and the page does not scroll sideways: ${JSON.stringify(fit)}`);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 3. Examples of markings and the EIA-96 table: a chip, marked in that system, of a size that is marked.
  await open('?q=4k7&size=0201');
  await title('Try 472: read as a marking and drawn on a chip').click();
  await settle();
  ok((await value()) === '4.7kΩ' && (await input.inputValue()) === '472' && query().get('read') === 'marking' && query().get('part') === 'chip' && query().get('mark') === '3' && !query().has('size'),
    `an example of a marking is read as one and drawn on a marked chip: ${page.url()}`);
  ok(await page.locator('#resistor-marking').inputValue() === '472', 'the chip carries the marking of the example');
  await title('Try 4992: read as a marking and drawn on a chip').click();
  await settle();
  ok((await value()) === '49.9kΩ' && query().get('mark') === '4', 'an example with four digits switches to four digits');
  await title('Try 01C: read as a marking and drawn on a chip').click();
  await settle();
  ok((await value()) === '10kΩ' && query().get('mark') === 'eia96' && await page.getByRole('radio', { name: '±1 %', exact: true }).isChecked(), 'an EIA-96 example switches to EIA-96 at 1 %');
  await open('?q=4k7&size=0201');
  await title('Use 1 kΩ').click();
  await settle();
  ok(query().get('part') === 'chip' && query().get('mark') === 'eia96' && !query().has('size') && await page.locator('#resistor-marking').inputValue() === '01B', `the EIA-96 table does the same from a size without marking: ${page.url()}`);

  // 1. Caption None: the part alone, in the preview and in the files.
  await open('?q=4k7');
  const preview = page.locator('[data-bg] svg');
  const bars = () => preview.evaluate((svg) => svg.querySelectorAll('[opacity="0.8"]').length);
  const tall = () => preview.evaluate((svg) => svg.viewBox.baseVal.height);
  const [barsWith, tallWith] = [await bars(), await tall()];
  await group('Caption').getByRole('radio', { name: 'None' }).click();
  await settle();
  ok(barsWith > 0 && (await bars()) === 0 && (await tall()) < tallWith * 0.8, `without a caption the preview has no scale bar and no scale number: ${barsWith} to ${await bars()}`);
  for (const format of ['SVG', 'PNG']) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: format, exact: true }).first().click()]);
    const data = readFileSync(await download.path());
    if (format === 'SVG') ok(!data.toString('utf8').includes('opacity="0.8"') && !/<path[^>]*stroke-linecap="round"/.test(data.toString('utf8')), 'the saved SVG is the part alone');
    else ok(data.readUInt32BE(16) === 1024 && data.readUInt32BE(20) < 1024 * 0.4, `the saved PNG is the part alone: ${data.readUInt32BE(16)} × ${data.readUInt32BE(20)}`);
  }

  // 6. TikZ: a file that compiles as it is, and the picture for the clipboard; always the flat drawing.
  ok(await page.getByText('TikZ, for LaTeX, is always the flat drawing.').isVisible(), 'in the realistic style the page says that TikZ is the flat drawing');
  let [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'TikZ', exact: true }).first().click()]);
  let tex = readFileSync(await download.path(), 'utf8');
  ok(download.suggestedFilename() === 'resistor-4k7-axial-4-band.tex' && tex.includes('\\documentclass[tikz, border=2mm]{standalone}') && tex.includes('\\definecolor{bandyellow}{HTML}{F2CF1D}') && tex.trimEnd().endsWith('\\end{document}'),
    `TikZ is saved as a standalone .tex: ${download.suggestedFilename()}`);
  ok(!tex.includes('\\node') && !tex.includes('Scale bar'), 'without a caption the TikZ file has no text and no scale bar');
  await group('Caption').getByRole('radio', { name: /Value/ }).click();
  await page.getByRole('button', { name: 'TikZ', exact: true }).nth(1).click();
  await settle();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  ok(copied.startsWith('% Resistor 4k7') && copied.includes('\\begin{tikzpicture}') && copied.trimEnd().endsWith('\\end{tikzpicture}') && !copied.includes('documentclass') && copied.includes('Scale bar') && copied.includes('4.7\\,k\\ensuremath{\\Omega}'),
    'the tikzpicture is copied with its colours, scale bar and caption');
  await open('?q=4k7&part=chip&mark=4&tol=1');
  await group('Style of the drawing').first().getByRole('radio', { name: 'Flat' }).click();
  await settle();
  ok(await page.getByText('TikZ, for LaTeX, is always the flat drawing.').count() === 0, 'in the flat style the remark is not needed');
  [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'TikZ', exact: true }).first().click()]);
  tex = readFileSync(await download.path(), 'utf8');
  ok(download.suggestedFilename() === 'resistor-4k7-chip-0805.tex' && /\\node\[text=chipmarking[^\n]*\{4701\};/.test(tex), 'the marking of a chip is a text node in the TikZ file');
  await group('Style of the drawing').first().getByRole('radio', { name: 'Realistic' }).click();
  await settle();
}

ok(errors.length === 0, `no errors in the console: ${errors.join(' | ')}`);
await context.close();

// The Combinations section, compared with the engine (ui-combos.mjs).
await combinationChecks({ browser, base, ok });
// The Design section, compared with the engine (ui-design.mjs).
await designChecks({ browser, base, ok });
// The Theory and References sections, the citations and the EIA-96 letters R and S (ui-theory.mjs).
await theoryChecks({ browser, base, ok });
await browser.close();
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`resistor page: ${passed} of ${passed + failures.length} checks passed`);
process.exit(failures.length ? 1 : 0);
