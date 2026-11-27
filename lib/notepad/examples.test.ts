import assert from 'node:assert/strict';
import test from 'node:test';

import { buildScratchpadExample, SCRATCHPAD_EXAMPLE_PRESETS } from './examples';

test('Scratchpad has 6 distinct examples covering diff, preview, split, and LaTeX', () => {
  assert.equal(SCRATCHPAD_EXAMPLE_PRESETS.length, 6);
  for (const preset of SCRATCHPAD_EXAMPLE_PRESETS) {
    const payload = buildScratchpadExample(preset.id);
    assert.ok(payload.docs.length >= 1);
    for (const d of payload.docs) {
      assert.ok(d.name.length > 0);
      assert.ok(d.content.length > 30);
    }
  }
  assert.equal(buildScratchpadExample('code-diff').layout, 'diff');
  assert.equal(buildScratchpadExample('code-diff').docs.length, 2);
  assert.equal(buildScratchpadExample('split-ts-json').layout, 'split');
  assert.equal(buildScratchpadExample('split-ts-json').docs.length, 2);
  assert.equal(buildScratchpadExample('markdown-spec').paneView?.kind, 'markdown');
  assert.equal(buildScratchpadExample('csv-bom').paneView?.kind, 'csv');
  assert.equal(buildScratchpadExample('html-card').paneView?.kind, 'html');
});
