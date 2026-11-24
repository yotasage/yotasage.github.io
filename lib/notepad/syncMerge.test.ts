import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeMinimalTextEdit,
  mergeRemotePatch,
  reconcileWindowViewState,
  sanitizeWindowViewState,
} from './syncMerge';
import type { SyncMessage, WindowViewState } from './syncMerge';
import { createEqualTrackSizes, MAX_GRID_DIM } from './types';
import type { NotepadDoc } from './types';

function makeDoc(id: string, name: string, content: string, updatedAt = 1000): NotepadDoc {
  return {
    id,
    name,
    content,
    language: 'plaintext',
    eol: 'LF',
    encoding: 'utf-8',
    encodingConfidence: 'exact',
    direction: 'ltr',
    createdAt: 1000,
    updatedAt,
  };
}

function makeViewState(overrides: Partial<WindowViewState> = {}): WindowViewState {
  const slots = MAX_GRID_DIM * MAX_GRID_DIM;
  const ids = ['doc-a', 'doc-b', 'doc-c'];
  return {
    layout: 'grid',
    paneDocIds: Array.from({ length: slots }, (_, idx) => ids[idx % ids.length]),
    activePane: 2,
    gridRows: 2,
    gridCols: 3,
    gridColSizes: [25, 50, 25],
    gridRowSizes: [40, 60],
    diffLeftId: 'doc-a',
    diffRightId: 'doc-b',
    diffStyle: 'inline',
    diffIgnoreWhitespace: true,
    splitRatio: 62,
    paneViews: {
      0: { mode: 'split', kind: 'markdown' },
      2: { mode: 'preview', kind: 'csv' },
    },
    ...overrides,
  };
}

test('mergeRemotePatch updates clean docs immediately from remote edits', () => {
  const localDocs = [
    makeDoc('doc-a', 'a.txt', 'hello', 1000),
    makeDoc('doc-b', 'b.txt', 'world', 1000),
  ];
  const patch: Extract<SyncMessage, { kind: 'docs-patch' }> = {
    sender: 'tab-remote',
    kind: 'docs-patch',
    sentAt: 1500,
    updatedDocs: [makeDoc('doc-b', 'b-renamed.txt', 'world updated', 1500)],
    deletedIds: [],
    docOrder: ['doc-a', 'doc-b'],
  };

  const merged = mergeRemotePatch(localDocs, patch, new Set());
  assert.equal(merged.length, 2);
  assert.equal(merged[0].content, 'hello');
  assert.equal(merged[1].name, 'b-renamed.txt');
  assert.equal(merged[1].content, 'world updated');
});

test('mergeRemotePatch preserves unsaved local edits to Doc A when remote edits Doc B or sends stale Doc A', () => {
  const localDocs = [
    makeDoc('doc-a', 'a.txt', 'local unsaved typing', 2000),
    makeDoc('doc-b', 'b.txt', 'old b', 1000),
  ];
  const patch: Extract<SyncMessage, { kind: 'docs-patch' }> = {
    sender: 'tab-remote',
    kind: 'docs-patch',
    sentAt: 1800,
    updatedDocs: [
      makeDoc('doc-a', 'a.txt', 'stale remote a', 1500),
      makeDoc('doc-b', 'b.txt', 'fresh remote b', 1800),
    ],
    deletedIds: [],
    docOrder: ['doc-a', 'doc-b'],
  };

  const merged = mergeRemotePatch(localDocs, patch, new Set(['doc-a']));
  assert.equal(merged[0].content, 'local unsaved typing');
  assert.equal(merged[1].content, 'fresh remote b');

  // If remote has strictly newer updatedAt even for a dirty doc, remote wins
  const newerPatch: Extract<SyncMessage, { kind: 'docs-patch' }> = {
    sender: 'tab-remote',
    kind: 'docs-patch',
    sentAt: 2500,
    updatedDocs: [makeDoc('doc-a', 'a.txt', 'newer remote a', 2500)],
    deletedIds: [],
    docOrder: ['doc-a', 'doc-b'],
  };
  const mergedNewer = mergeRemotePatch(localDocs, newerPatch, new Set(['doc-a']));
  assert.equal(mergedNewer[0].content, 'newer remote a');
});

test('mergeRemotePatch handles remote creation, deletion, ordering, and locally added unsaved docs', () => {
  const localDocs = [
    makeDoc('doc-a', 'a.txt', 'a', 1000),
    makeDoc('doc-b', 'b.txt', 'b', 1000),
    makeDoc('doc-local-new', 'local.txt', 'unsaved new doc', 2200),
  ];
  const patch: Extract<SyncMessage, { kind: 'docs-patch' }> = {
    sender: 'tab-remote',
    kind: 'docs-patch',
    sentAt: 2000,
    updatedDocs: [makeDoc('doc-c', 'c.txt', 'remote created', 2000)],
    deletedIds: ['doc-b'],
    docOrder: ['doc-c', 'doc-a'],
  };

  const merged = mergeRemotePatch(localDocs, patch, new Set(['doc-local-new']));
  assert.deepEqual(
    merged.map((d) => d.id),
    ['doc-c', 'doc-a', 'doc-local-new'],
  );
  assert.equal(merged[0].content, 'remote created');
  assert.equal(merged[2].content, 'unsaved new doc');
});

test('mergeRemotePatch protects locally dirty doc with newer updatedAt from remote deletion and never returns empty list', () => {
  const localDocs = [
    makeDoc('doc-a', 'a.txt', 'keep me', 3000),
    makeDoc('doc-b', 'b.txt', 'delete me', 1000),
  ];
  const deletePatch: Extract<SyncMessage, { kind: 'docs-patch' }> = {
    sender: 'tab-remote',
    kind: 'docs-patch',
    sentAt: 2000,
    updatedDocs: [],
    deletedIds: ['doc-a', 'doc-b'],
    docOrder: [],
  };

  const keptDirty = mergeRemotePatch(localDocs, deletePatch, new Set(['doc-a']));
  assert.deepEqual(
    keptDirty.map((d) => d.id),
    ['doc-a'],
  );

  const allDeleted = mergeRemotePatch(localDocs, deletePatch, new Set());
  assert.equal(allDeleted.length, 1);
  assert.equal(allDeleted[0].name, 'new 1.txt');
  assert.equal(allDeleted[0].content, '');
});

test('reconcileWindowViewState preserves per-window layout, activePane, panes, diff, and paneViews when docs are edited or added', () => {
  const docs = [
    makeDoc('doc-a', 'a.txt', 'edited a', 2000),
    makeDoc('doc-b', 'b.txt', 'edited b', 2000),
    makeDoc('doc-c', 'c.txt', 'c', 1000),
    makeDoc('doc-d', 'd.txt', 'newly added in other window', 2100),
  ];

  for (const layout of ['single', 'split', 'grid', 'diff'] as const) {
    const view = makeViewState({ layout });
    const reconciled = reconcileWindowViewState(view, docs);
    assert.equal(reconciled, view, `layout=${layout} should remain identical reference when all doc IDs exist`);
    assert.equal(reconciled.layout, layout);
    assert.equal(reconciled.activePane, 2);
    assert.deepEqual(reconciled.gridColSizes, [25, 50, 25]);
    assert.deepEqual(reconciled.gridRowSizes, [40, 60]);
    assert.equal(reconciled.splitRatio, 62);
    assert.equal(reconciled.diffLeftId, 'doc-a');
    assert.equal(reconciled.diffRightId, 'doc-b');
    assert.deepEqual(reconciled.paneViews, {
      0: { mode: 'split', kind: 'markdown' },
      2: { mode: 'preview', kind: 'csv' },
    });
  }
});

test('reconcileWindowViewState replaces ONLY deleted doc IDs while leaving all other window settings untouched', () => {
  const view = makeViewState({
    layout: 'split',
    activePane: 1,
    diffLeftId: 'doc-b',
    diffRightId: 'doc-c',
  });
  const remainingDocs = [
    makeDoc('doc-a', 'a.txt', 'a'),
    makeDoc('doc-c', 'c.txt', 'c'),
  ];

  const reconciled = reconcileWindowViewState(view, remainingDocs);
  assert.notEqual(reconciled, view);
  assert.equal(reconciled.layout, 'split');
  assert.equal(reconciled.activePane, 1);
  assert.equal(reconciled.splitRatio, 62);
  assert.deepEqual(reconciled.paneViews, view.paneViews);
  assert.equal(reconciled.paneDocIds[0], 'doc-a');
  assert.equal(reconciled.paneDocIds[1], 'doc-a'); // doc-b was deleted -> falls back to doc-a
  assert.equal(reconciled.paneDocIds[2], 'doc-c'); // doc-c still exists -> preserved
  assert.equal(reconciled.diffLeftId, 'doc-a'); // doc-b deleted -> falls back
  assert.equal(reconciled.diffRightId, 'doc-c'); // doc-c still exists -> preserved
});

test('sanitizeWindowViewState validates malformed payloads and restores valid fields', () => {
  const docs = [makeDoc('doc-a', 'a.txt', 'a'), makeDoc('doc-b', 'b.txt', 'b')];
  const fallback = makeViewState({
    layout: 'single',
    gridRows: 2,
    gridCols: 2,
    gridColSizes: createEqualTrackSizes(2),
    gridRowSizes: createEqualTrackSizes(2),
    diffLeftId: 'doc-a',
    diffRightId: 'doc-b',
    paneViews: {},
  });

  const sanitized = sanitizeWindowViewState(
    {
      layout: 'split',
      activePane: 1,
      splitRatio: 95,
      paneDocIds: ['doc-b', 'missing-id'],
      diffStyle: 'inline',
      diffIgnoreWhitespace: true,
      paneViews: {
        0: { mode: 'preview', kind: 'html' },
        99: { mode: 'split', kind: 'csv' },
        1: { mode: 'bogus', kind: 'bogus' },
      },
    },
    docs,
    fallback,
  );

  assert.equal(sanitized.layout, 'split');
  assert.equal(sanitized.activePane, 1);
  assert.equal(sanitized.splitRatio, 80); // clamped
  assert.equal(sanitized.paneDocIds[0], 'doc-b');
  assert.equal(sanitized.paneDocIds[1], 'doc-b'); // missing-id fell back to fallback/valid doc
  assert.equal(sanitized.diffStyle, 'inline');
  assert.equal(sanitized.diffIgnoreWhitespace, true);
  assert.deepEqual(sanitized.paneViews, {
    0: { mode: 'preview', kind: 'html' },
    1: { mode: 'editor', kind: 'auto' },
  });
});

test('computeMinimalTextEdit computes exact minimal prefix/suffix edits and returns null for identical strings', () => {
  assert.equal(computeMinimalTextEdit('same text', 'same text'), null);
  assert.equal(computeMinimalTextEdit('', ''), null);

  const cases: Array<{ label: string; oldText: string; newText: string; start: number; end: number; insert: string }> = [
    {
      label: 'insertion in middle',
      oldText: 'hello world',
      newText: 'hello brave world',
      start: 6,
      end: 6,
      insert: 'brave ',
    },
    {
      label: 'deletion in middle',
      oldText: 'hello brave world',
      newText: 'hello world',
      start: 6,
      end: 12,
      insert: '',
    },
    {
      label: 'replacement',
      oldText: 'R1 = 10k 1%',
      newText: 'R1 = 4.7k 1%',
      start: 5,
      end: 7,
      insert: '4.7',
    },
    {
      label: 'append to end',
      oldText: 'line1',
      newText: 'line1\nline2',
      start: 5,
      end: 5,
      insert: '\nline2',
    },
    {
      label: 'empty to text',
      oldText: '',
      newText: 'abc',
      start: 0,
      end: 0,
      insert: 'abc',
    },
    {
      label: 'text to empty',
      oldText: 'abc',
      newText: '',
      start: 0,
      end: 3,
      insert: '',
    },
    {
      label: 'repeated characters',
      oldText: 'aaaa',
      newText: 'aaaaa',
      start: 4,
      end: 4,
      insert: 'a',
    },
    {
      label: 'surrogate pair preservation',
      oldText: 'hi 😀!',
      newText: 'hi 😎!',
      start: 3,
      end: 5,
      insert: '😎',
    },
  ];

  for (const c of cases) {
    const edit = computeMinimalTextEdit(c.oldText, c.newText);
    assert.ok(edit, `${c.label}: expected non-null edit`);
    assert.equal(edit.startOffset, c.start, `${c.label}: startOffset`);
    assert.equal(edit.endOffset, c.end, `${c.label}: endOffset`);
    assert.equal(edit.insertText, c.insert, `${c.label}: insertText`);
    const applied = c.oldText.slice(0, edit.startOffset) + edit.insertText + c.oldText.slice(edit.endOffset);
    assert.equal(applied, c.newText, `${c.label}: reconstructed text must match`);
  }
});
