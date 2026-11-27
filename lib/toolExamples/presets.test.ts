import assert from 'node:assert/strict';
import test from 'node:test';

import { parseInBase } from '../base/convert';
import { BASE64_IMAGE_EXAMPLES } from '../base64image/examples';
import { CALC_EXAMPLES } from '../calc/examples';
import { DERIVATIVE_EXAMPLES, INTEGRAL_EXAMPLES } from '../calculus/examples';
import { HASH_ALGORITHMS } from '../hash/types';
import { SCRATCHPAD_EXAMPLE_PRESETS } from '../notepad/examples';
import { PAINT_EXAMPLES } from '../paint/examples';
import { PCB_EXAMPLE_PRESETS } from '../pcb/examples';
import { encode } from '../qr/encoder';
import { QR_GEN_EXAMPLES, QR_READER_EXAMPLES } from '../qr/examples';
import { CONTENT_TYPES, initialValues } from '../qr/payloads';
import { TEXT_CASE_EXAMPLES } from '../textcase/examples';
import { parseTimestampInput } from '../timestamp/parse';
import { TRANSLATIONS } from '../ui/translations';
import { VIEWER3D_EXAMPLE_PRESETS } from '../viewer3d/examples';
import {
  BASE_EXAMPLES,
  COLOR_EXAMPLES,
  HASH_EXAMPLES,
  TIMESTAMP_EXAMPLES,
} from './presets';

const KEYED_CATALOGS = [
  ['paint', PAINT_EXAMPLES],
  ['qrgen', QR_GEN_EXAMPLES],
  ['qrread', QR_READER_EXAMPLES],
  ['base64', BASE64_IMAGE_EXAMPLES],
  ['integral', INTEGRAL_EXAMPLES],
  ['derivative', DERIVATIVE_EXAMPLES],
  ['calc', CALC_EXAMPLES],
  ['hash', HASH_EXAMPLES],
  ['base', BASE_EXAMPLES],
  ['textcase', TEXT_CASE_EXAMPLES],
  ['timestamp', TIMESTAMP_EXAMPLES],
  ['color', COLOR_EXAMPLES],
] as const;

const PREFIX_CATALOGS = [
  ['pcb', 'ex.pcb', PCB_EXAMPLE_PRESETS],
  ['viewer3d', 'ex.v3d', VIEWER3D_EXAMPLE_PRESETS],
  ['scratchpad', 'ex.pad', SCRATCHPAD_EXAMPLE_PRESETS],
] as const;

test('all example catalogs have unique IDs and valid EN/NB translation keys', () => {
  const en = TRANSLATIONS.en as Record<string, string>;
  const nb = TRANSLATIONS.nb as Record<string, string>;

  for (const [name, items] of KEYED_CATALOGS) {
    assert.ok(items.length >= 4, `${name} should provide at least 4 examples`);
    const ids = new Set<string>();
    for (const item of items) {
      assert.ok(!ids.has(item.id), `${name} has duplicate id "${item.id}"`);
      ids.add(item.id);
      for (const key of [item.tagKey, item.titleKey, item.descKey]) {
        assert.equal(typeof en[key], 'string', `${name}: missing en translation for ${key}`);
        assert.ok(en[key].trim().length > 0, `${name}: empty en translation for ${key}`);
        assert.equal(typeof nb[key], 'string', `${name}: missing nb translation for ${key}`);
        assert.ok(nb[key].trim().length > 0, `${name}: empty nb translation for ${key}`);
      }
    }
  }

  for (const [name, prefix, items] of PREFIX_CATALOGS) {
    assert.ok(items.length >= 5, `${name} should provide at least 5 examples`);
    const ids = new Set<string>();
    for (const item of items) {
      assert.ok(!ids.has(item.id), `${name} has duplicate id "${item.id}"`);
      ids.add(item.id);
      for (const suffix of ['tag', 'title', 'desc']) {
        const key = `${prefix}.${item.id}.${suffix}`;
        assert.equal(typeof en[key], 'string', `${name}: missing en translation for ${key}`);
        assert.ok(en[key].trim().length > 0, `${name}: empty en translation for ${key}`);
        assert.equal(typeof nb[key], 'string', `${name}: missing nb translation for ${key}`);
        assert.ok(nb[key].trim().length > 0, `${name}: empty nb translation for ${key}`);
      }
    }
  }
});

test('all QR generator example presets build payloads and encode without errors', async () => {
  for (const ex of QR_GEN_EXAMPLES) {
    const ct = CONTENT_TYPES.find((c) => c.id === ex.typeId);
    assert.ok(ct, `Unknown QR content type ${ex.typeId} in ${ex.id}`);
    const payload = await ct.build({ ...initialValues(ct), ...ex.values });
    const sym = encode(payload.data, {
      symbology: ex.symbology,
      version: 'auto',
      ecLevel: ex.ecLevel,
      mask: 'auto',
      mode: 'auto',
      charset: 'utf-8',
      eci: 'auto',
    });
    assert.ok(sym.width > 0 && sym.height > 0, `${ex.id} should encode a non-empty symbol`);
  }
});

test('all QR reader example symbols encode cleanly', () => {
  for (const ex of QR_READER_EXAMPLES) {
    assert.ok(ex.symbols.length > 0, `${ex.id} must have at least one symbol`);
    for (const s of ex.symbols) {
      const sym = encode(s.text, s.options);
      assert.ok(sym.width > 0 && sym.height > 0);
    }
  }
});

test('all Hash, Base, and Timestamp example presets use valid inputs', () => {
  const validAlgos = new Set(HASH_ALGORITHMS.map((a) => a.id));
  for (const ex of HASH_EXAMPLES) {
    assert.ok(ex.algorithms.length > 0);
    for (const a of ex.algorithms) {
      assert.ok(validAlgos.has(a), `Invalid hash algorithm ${a} in ${ex.id}`);
    }
    assert.ok(ex.fields.length > 0);
  }

  for (const ex of BASE_EXAMPLES) {
    const parsed = parseInBase(ex.value, ex.from.radix, ex.from.alphabetId);
    assert.equal('error' in parsed, false, `Base example ${ex.id} failed to parse`);
  }

  for (const ex of TIMESTAMP_EXAMPLES) {
    if (ex.rawInput !== undefined) {
      const parsed = parseTimestampInput(ex.rawInput, ex.unitOverride ?? 'auto');
      assert.equal(parsed.ok, true, `Timestamp example ${ex.id} failed to parse`);
    }
  }
});
