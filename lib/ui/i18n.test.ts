import test from 'node:test';
import assert from 'node:assert/strict';

import { solveDerivative } from '../calculus/differentiate';
import { solveIntegral } from '../calculus/integrate';
import { simplifyBoolean } from '../boolean/simplify';
import { LOCALES, TRANSLATIONS, en, nb } from './translations';
import { translate } from './i18n';
import { localizeCalculusStep } from './localizeCalculusStep';
import { localizeBooleanStep } from './localizeBooleanStep';
import {
  localizeEmLayerName,
  localizeEmMaterial,
  localizeEmStackupName,
} from './localizeEmStackup';

function extractPlaceholders(value: string): string[] {
  const matches = value.match(/\{(\w+)\}/g) ?? [];
  return [...new Set(matches)].sort();
}

test('i18n dictionaries have identical EN and NB key sets', () => {
  const enKeys = Object.keys(en).sort();
  const nbKeys = Object.keys(nb).sort();
  assert.ok(enKeys.length > 0, 'Expected non-empty EN dictionary');
  assert.deepEqual(nbKeys, enKeys, 'NB and EN dictionaries must have identical key sets');
  assert.deepEqual(LOCALES, ['en', 'nb']);
  assert.equal(TRANSLATIONS.en, en);
  assert.equal(TRANSLATIONS.nb, nb);
});

test('all EN and NB translation values are non-empty strings', () => {
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    assert.equal(typeof en[key], 'string', `en[${key}] must be a string`);
    assert.ok(en[key].trim().length > 0, `en[${key}] must not be empty`);
    assert.equal(typeof nb[key], 'string', `nb[${key}] must be a string`);
    assert.ok(nb[key].trim().length > 0, `nb[${key}] must not be empty`);
  }
});

test('all EN and NB translation entries preserve identical {placeholder} tokens', () => {
  const mismatches: string[] = [];
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    const enTokens = extractPlaceholders(en[key]);
    const nbTokens = extractPlaceholders(nb[key]);
    if (enTokens.join(',') !== nbTokens.join(',')) {
      mismatches.push(`${key}: en=${JSON.stringify(enTokens)} nb=${JSON.stringify(nbTokens)}`);
    }
  }
  assert.deepEqual(mismatches, [], `Placeholder mismatches found:\n${mismatches.join('\n')}`);
});

test('translate() resolves locales, interpolates placeholders, and falls back safely', () => {
  assert.equal(translate('en', 'home.title'), en['home.title']);
  assert.equal(translate('nb', 'home.title'), nb['home.title']);
  assert.notEqual(translate('en', 'home.title'), translate('nb', 'home.title'));
  assert.equal(
    translate('nb', 'notepad.grid.cellAria', { rows: 2, cols: 3 }),
    '2 ganger 3 rutenett',
  );
  assert.equal(
    translate('en', 'notepad.grid.cellAria', { rows: 2, cols: 3 }),
    '2 by 3 grid',
  );
  assert.equal(translate('nb', 'nonexistent.key.example'), 'nonexistent.key.example');
  assert.equal(translate('nb', 'notepad.grid.cellAria', { rows: 2 }), '2 ganger {cols} rutenett');
});

test('localizeCalculusStep translates derivative and integral step titles and annotations to NB', () => {
  const d = solveDerivative('x^2 * sin(3x)');
  assert.ok(d.ok);
  const dNb = d.steps.map((s) => localizeCalculusStep(s, 'nb'));
  assert.equal(dNb[0].ruleTitle, 'Oppgave');
  assert.ok(dNb.every((s) => s.ruleTitle !== 'Problem statement' && s.ruleTitle !== 'Product rule'));

  const integ = solveIntegral('x * sin(x)');
  assert.ok(integ.ok);
  const iNb = integ.steps.map((s) => localizeCalculusStep(s, 'nb'));
  assert.equal(iNb[0].ruleTitle, 'Oppsett for ubestemt integral');
  assert.ok(iNb.some((s) => s.ruleTitle.includes('Delvis integrasjon')));
});

test('localizeBooleanStep translates Boolean simplification steps to NB', () => {
  const res = simplifyBoolean("A*B + A'*C + B*C", {
    method: 'heuristic',
    effort: 'medium',
    targetForm: 'auto',
    notation: 'engineering',
  });
  assert.ok(res.ok);
  const nbSteps = res.steps.map((s) => localizeBooleanStep(s, 'nb'));
  assert.equal(nbSteps[0].ruleTitle, 'Gitt boolsk uttrykk');
  assert.equal(nbSteps[0].workLabel, 'Opprinnelig uttrykk');
  assert.ok(nbSteps.some((s) => s.ruleTitle === 'Konsensusteoremet'));
  assert.equal(nbSteps[nbSteps.length - 1].ruleTitle, 'Endelig forenklet uttrykk');
});

test('localizeEmStackup translates preset names, layer names, and materials to NB', () => {
  const samplePresets = [
    'JLCPCB JLC061611-3313A: 6 layers, 1.6 mm, 1 oz outer, 1 oz inner',
    'JLCPCB JLC04161H-7628: 4 layers, 1.6 mm, ½ oz inner (JLCPCB’s default)',
    'JLCPCB JLC06161H-3313A: 6 layers, 1.6 mm, ½ oz inner (marked to be withdrawn, yet JLCPCB’s “No requirement” choice)',
    'JLCPCB JLC0216: 2 layers, 1.6 mm, 1 oz',
  ];
  for (const name of samplePresets) {
    const nbName = localizeEmStackupName(name, 'nb');
    assert.ok(!/\blayers\b|\bouter\b|\binner\b/.test(nbName), `Untranslated stackup name: ${nbName}`);
  }
  assert.equal(localizeEmLayerName('Top mask', 'nb'), 'Toppmaske');
  assert.equal(localizeEmLayerName('L1 (top)', 'nb'), 'L1 (topp)');
  assert.equal(localizeEmMaterial('LPI solder mask', 'nb'), 'LPI-loddemaske');
  assert.equal(localizeEmMaterial('FR-4 core, etched bare (NP-155F)', 'nb'), 'FR-4-kjerne, etset bar (NP-155F)');
});
