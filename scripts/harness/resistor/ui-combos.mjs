// The Combinations section of /resistor/main in the browser, compared with the engine. Called by ui.mjs (npm run ui).

import { readFileSync } from 'node:fs';

import * as imported from '../../../lib/resistor/index.ts';

const lib = imported.default ?? imported;
const { searchCombinations, seriesList, networkFormula, formatOhms, formatError, LISTS_KEY } = lib;

export async function combinationChecks({ browser, base, ok }) {
  const errors = [];
  const openPage = async (query, options = {}) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    if (options.noWorker) await context.addInitScript(() => { window.Worker = undefined; });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${base}/resistor/main${query}`, { waitUntil: 'networkidle' });
    return page;
  };
  const section = (page) => page.locator('#combinations');
  // The results are in when the status line is no longer marked busy.
  const searched = async (page) => {
    await page.waitForTimeout(150);
    await page.waitForFunction(() => document.querySelector('#combinations [data-testid=search-status]')?.getAttribute('data-busy') === 'false', null, { timeout: 15000 });
  };
  const formulas = (page) => section(page).locator('ol [data-testid=formula]').allInnerTexts();
  const place = (page) => section(page).getByTestId('search-status').getAttribute('data-place');
  const radio = (page, name) => section(page).getByRole('radio', { name, exact: true });
  const texts = (found, count) => found.results.slice(0, count).map((c) => networkFormula(c.network));
  const e24 = seriesList('E24');

  // 1. 628.75 Ω with E24 and two parts: the list is the engine's, searched in the worker.
  let page = await openPage('?q=628.75&cs=e24');
  await searched(page);
  let engine = searchCombinations(628.75, e24, { maxParts: 2, keep: 50 });
  let shown = await formulas(page);
  ok(shown[0] === networkFormula(engine.results[0].network), `628.75 Ω, E24, two parts: the first result is the engine's: ${shown[0]}`);
  ok(shown.length === 8 && shown.join('|') === texts(engine, 8).join('|'), `the first eight results are the engine's, in its order: ${shown.length}`);
  ok(await place(page) === 'worker', `the search runs in the worker: ${await place(page)}`);
  const first = section(page).locator('ol > li').first();
  ok((await first.innerText()).includes(formatError(engine.results[0].errorPct)) && (await first.innerText()).replace(/\s/g, '').includes(formatOhms(engine.results[0].ohms).replace(/\s/g, '')),
    'a result shows its value and its signed error');
  ok(await first.locator('svg[role=img] rect').count() === engine.results[0].parts, 'a result has a circuit drawing with a rectangle for each resistor');
  ok((await section(page).getByRole('table', { name: /best network/i }).getByRole('row').count()) === 2, 'the summary has the best of one and of two resistors');
  await first.getByRole('button', { name: /^Copy as text/ }).click();
  await page.waitForTimeout(100);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  ok(copied === `${networkFormula(engine.results[0].network)} = ${formatOhms(engine.results[0].ohms)}, ${formatError(engine.results[0].errorPct)}`, `a result is copied as text: ${copied}`);

  // 2. Series only shows no parallel network.
  await radio(page, 'Series only').click();
  await searched(page);
  engine = searchCombinations(628.75, e24, { maxParts: 2, connections: 'series', keep: 50 });
  shown = await formulas(page);
  ok(shown.length > 0 && shown.every((text) => !text.includes('∥')) && shown[0] === networkFormula(engine.results[0].network) && new URL(page.url()).searchParams.get('cc') === 's',
    `series only shows no parallel network and is in the link: ${shown[0]}`);
  await radio(page, 'Any way').click();

  // 3. A result opens: the share of each resistor, and with a voltage the watts and a chip size.
  await searched(page);
  await section(page).locator('ol > li').nth(1).getByRole('button', { name: /^Details/ }).click();
  const shares = section(page).getByRole('table', { name: 'Share of each resistor' });
  ok(await shares.getByRole('row').count() === 3 && !/\d m?W/.test(await shares.innerText()), 'an opened result shows the share of voltage, current and power in each resistor');
  await section(page).getByLabel(/Voltage across the network/).fill('12');
  await page.waitForTimeout(150);
  ok(/\d m?W/.test(await shares.innerText()) && /\b(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)\b/.test(await shares.innerText()) && new URL(page.url()).searchParams.get('cv') === '12',
    'with a voltage it shows the power in watts and the smallest chip size, and the voltage is in the link');

  // 4. An own list: a decimal comma is read, the chips show the readings, and the search uses only its values.
  await section(page).getByRole('button', { name: 'New list' }).click();
  const textarea = section(page).getByLabel('Values', { exact: true });
  await textarea.fill('10k,22k,47k');
  const chips = () => section(page).getByRole('list', { name: 'The values as they were read' }).getByRole('listitem').allInnerTexts();
  ok((await chips()).map((t) => t.trim()).join('|') === '10 kΩ|22 kΩ|47 kΩ', `10k,22k,47k is three values: ${(await chips()).join('|')}`);
  await textarea.fill('4,7k 10k 22k 1k foo');
  ok((await chips()).map((t) => t.trim()).join('|') === '4.7 kΩ|10 kΩ|22 kΩ|1 kΩ|foo' && await section(page).getByText('1 not read').first().isVisible(),
    `4,7k 10k 22k is read with a decimal comma and an unreadable entry is flagged: ${(await chips()).join('|')}`);
  await section(page).getByLabel('Name').fill('Drawer');
  await section(page).getByRole('button', { name: 'Search with this list' }).click();
  await searched(page);
  shown = await formulas(page);
  const own = ['4.7 kΩ', '10 kΩ', '22 kΩ', '1 kΩ'];
  ok(shown.length > 0 && shown.every((text) => text.split(/ [+∥] /).every((part) => own.includes(part.replace(/[()]/g, '')))), `an own list limits the parts to its values: ${shown[0]}`);
  ok((await section(page).getByTestId('value-count').innerText()) === '4 values' && new URL(page.url()).searchParams.get('cl') === '1k_4k7_10k_22k' && new URL(page.url()).searchParams.get('cln') === 'Drawer',
    `the list in use is in the link: ${new URL(page.url()).searchParams.get('cl')}`);
  const stored = JSON.parse(await page.evaluate((key) => window.localStorage.getItem(key), LISTS_KEY));
  ok(stored.v === 1 && stored.lists.length === 1 && stored.lists[0].name === 'Drawer' && stored.lists[0].text === '4,7k 10k 22k 1k foo', 'the list is kept in the browser as it was written');

  // 5. A link with every control and the list gives the same results in a fresh browser.
  await page.locator('#resistor-input').fill('2k9');
  await radio(page, 'up to 3').click();
  await radio(page, 'Parallel only').click();
  await radio(page, 'Once').click();
  await radio(page, 'A through').click();
  await section(page).getByLabel(/Current through the network/).fill('2m');
  await section(page).getByRole('radiogroup', { name: 'Show the networks of' }).getByRole('radio', { name: '3', exact: true }).click();
  await searched(page);
  shown = await formulas(page);
  const link = new URL(page.url());
  const params = link.searchParams;
  ok(params.get('cn') === '3' && params.get('cc') === 'p' && params.get('cu') === '1' && params.get('ci') === '2m' && params.get('cf') === '3' && params.has('cl'),
    `every control is in the link: ${link.search}`);
  engine = searchCombinations(2900, [1000, 4700, 10000, 22000], { maxParts: 3, connections: 'parallel', reuse: false, keep: 50 });
  ok(shown.length > 0 && shown.join('|') === engine.byParts[3].slice(0, 8).map((c) => networkFormula(c.network)).join('|'), `the filtered list is the engine's networks of three: ${shown[0]}`);

  // 6. The CSV has the rows of the list.
  const [download] = await Promise.all([page.waitForEvent('download'), section(page).getByRole('button', { name: 'CSV' }).click()]);
  const rows = readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').trim().split('\r\n');
  ok(download.suggestedFilename() === 'resistor-combinations-2k9.csv' && rows[0].startsWith('Rank,Resistors,Network,Value (ohm),Error (%)') && rows.length - 1 === engine.byParts[3].length
    && shown.every((text, i) => rows[i + 1].split(',')[2] === `"${text}"` && Number(rows[i + 1].split(',')[3]).toPrecision(6) === engine.byParts[3][i].ohms.toPrecision(6)),
  `the CSV has the rows shown: ${rows.length - 1} rows, ${rows[1]}`);
  await page.context().close();

  const fresh = await openPage(link.search);
  await searched(fresh);
  const again = await formulas(fresh);
  ok(again.join('|') === shown.join('|'), `the link gives the same results in a fresh browser: ${again[0]}`);
  ok(await radio(fresh, 'up to 3').isChecked() && await radio(fresh, 'Parallel only').isChecked() && await radio(fresh, 'Once').isChecked() && await radio(fresh, 'A through').isChecked()
    && await section(fresh).getByLabel(/Current through the network/).inputValue() === '2m' && await section(fresh).getByText('from the link, not kept here').isVisible(),
  'the link restores every control and brings the list along');
  await section(fresh).getByRole('button', { name: 'Keep' }).click();
  await fresh.waitForTimeout(150);
  ok(JSON.parse(await fresh.evaluate((key) => window.localStorage.getItem(key), LISTS_KEY)).lists[0].name === 'Drawer' && (await formulas(fresh)).join('|') === shown.join('|'), 'a list from a link can be kept');

  // 7. Edge states.
  await fresh.goto(`${base}/resistor/main`, { waitUntil: 'networkidle' });
  ok(await section(fresh).getByText('Type a value at the top').isVisible() && await section(fresh).locator('ol').count() === 0, 'before a value is typed the section says what will appear');
  await fresh.goto(`${base}/resistor/main?q=0`, { waitUntil: 'networkidle' });
  ok(await section(fresh).getByText('nothing to combine').isVisible(), '0 Ω has nothing to combine');
  await fresh.goto(`${base}/resistor/main?q=100M`, { waitUntil: 'networkidle' });
  await searched(fresh);
  ok(await section(fresh).getByText('these are only the closest').isVisible() && (await formulas(fresh))[0] === '10 MΩ + 10 MΩ', `a target outside the reach shows the closest and says so: ${(await formulas(fresh))[0]}`);
  await fresh.goto(`${base}/resistor/main?q=1k&cl=330R&cln=One&cn=4`, { waitUntil: 'networkidle' });
  await searched(fresh);
  ok(await section(fresh).getByText('The list has one value').isVisible() && (await formulas(fresh))[0] === '330 Ω + 330 Ω + 330 Ω', `a list with one value works: ${(await formulas(fresh))[0]}`);
  await fresh.context().close();

  // 8. Without workers the same search runs on the page.
  page = await openPage('?q=628.75&cs=e24&cn=3', { noWorker: true });
  await searched(page);
  engine = searchCombinations(628.75, e24, { maxParts: 3, keep: 50 });
  shown = await formulas(page);
  ok(await place(page) === 'page' && shown.join('|') === texts(engine, 8).join('|'), `without a worker the search runs on the page with the same results: ${await place(page)}, ${shown[0]}`);
  await page.context().close();

  ok(errors.length === 0, `no errors in the console of the Combinations checks: ${errors.join(' | ')}`);
}
