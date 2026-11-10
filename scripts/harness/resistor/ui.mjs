// Drives /resistor/main in the installed Edge (or Chrome) and checks what a visitor does: typing, picking a reading,
// stepping, clicking a value, the tolerance, the link and the theme. The dev server must be running (port 3020).
//   node ui.mjs [base URL]        (npm run ui)

import { readFileSync } from 'node:fs';

import { chromium } from 'playwright-core';

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
ok(await page.getByRole('radio', { name: /SMD marking/ }).first().isChecked() && (await value()) === '100Ω', '101 is first read as the marking of 100 Ω');
await page.getByRole('radio', { name: /^Value/ }).first().click();
await settle();
ok((await value()) === '101Ω' && query().get('as') === 'num', 'the other reading can be picked and is in the link');

await input.fill('yel vio red gold');
await settle();
ok((await value()) === '4.7kΩ' && await page.getByRole('radio', { name: '±5 %', exact: true }).isChecked(), 'band colours give the value and set the tolerance');
ok(await page.getByRole('list', { name: /4 bands: yellow, violet, red, gold/ }).isVisible(), 'the four bands are named');

await input.fill('zzz');
await settle();
ok(await page.getByText('is not a colour of the code').isVisible(), 'a text that cannot be read says why');

// A link gives the same result again, also in a new window.
const link = `${base}/resistor/main?q=101&as=num&tol=0.1&e=e192`;
const second = await context.newPage();
await second.goto(link, { waitUntil: 'networkidle' });
await second.waitForTimeout(300);
ok(compact(await second.locator('output').innerText()) === '101Ω', 'a link opens with its value');
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

ok(errors.length === 0, `no errors in the console: ${errors.join(' | ')}`);
await browser.close();
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`resistor page: ${passed} of ${passed + failures.length} checks passed`);
process.exit(failures.length ? 1 : 0);
