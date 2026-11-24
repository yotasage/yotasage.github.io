import { useCallback } from 'react';

import {
  alignDelimitedText,
  AlignOptions,
  DelimiterOption,
  ResolvedDelimiter,
  shrinkDelimitedText,
} from '../../lib/notepad/csvTools';
import { NotepadDoc } from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import type { MonacoPaneHandle } from './MonacoPane';

function formatDelimToast(delim: ResolvedDelimiter): string {
  return delim === '\t' ? 'Tab' : delim;
}

export interface UseCsvActionsOptions {
  activeDoc: NotepadDoc;
  activePaneIdx: number;
  paneDocIds: readonly string[];
  docById: ReadonlyMap<string, NotepadDoc>;
  paneRefs: React.RefObject<(MonacoPaneHandle | null)[]>;
  patchDocById: (docId: string, patchFn: (doc: NotepadDoc) => NotepadDoc) => void;
  showToast: (msg: string) => void;
}

export function useCsvActions({
  activeDoc,
  activePaneIdx,
  paneDocIds,
  docById,
  paneRefs,
  patchDocById,
  showToast,
}: UseCsvActionsOptions) {
  const { t } = useI18n();

  const handleAlignCsv = useCallback(
    (opts: AlignOptions, targetPaneIdx = activePaneIdx) => {
      const targetDocId = paneDocIds[targetPaneIdx] ?? activeDoc.id;
      const targetDoc = docById.get(targetDocId) ?? activeDoc;
      const mergedOpts: AlignOptions = { fileName: targetDoc.name, ...opts };
      const pane = paneRefs.current[targetPaneIdx];
      let meta = { rowCount: 0, colCount: 0, delimiter: ',' as ResolvedDelimiter };

      if (pane) {
        const outcome = pane.applyTransformEdit((input) => {
          const res = alignDelimitedText(input, mergedOpts);
          meta = { rowCount: res.rowCount, colCount: res.colCount, delimiter: res.delimiter };
          return res;
        });
        if (outcome.error) {
          showToast(outcome.error);
          return;
        }
        if (meta.rowCount === 0) {
          showToast(t('notepad.data.noRows'));
          return;
        }
        showToast(
          t(outcome.scope === 'selection' ? 'notepad.data.alignedSelection' : 'notepad.data.alignedDoc', {
            rows: meta.rowCount,
            cols: meta.colCount,
            delim: formatDelimToast(meta.delimiter),
          }),
        );
        return;
      }

      const res = alignDelimitedText(targetDoc.content, mergedOpts);
      if (res.error) {
        showToast(res.error);
        return;
      }
      if (res.rowCount === 0) {
        showToast(t('notepad.data.noRows'));
        return;
      }
      patchDocById(targetDoc.id, (d) => ({ ...d, content: res.output, updatedAt: Date.now() }));
      showToast(
        t('notepad.data.alignedDoc', {
          rows: res.rowCount,
          cols: res.colCount,
          delim: formatDelimToast(res.delimiter),
        }),
      );
    },
    [activeDoc, activePaneIdx, docById, paneDocIds, paneRefs, patchDocById, showToast, t],
  );

  const handleShrinkCsv = useCallback(
    (delimiter?: DelimiterOption, targetPaneIdx = activePaneIdx) => {
      const targetDocId = paneDocIds[targetPaneIdx] ?? activeDoc.id;
      const targetDoc = docById.get(targetDocId) ?? activeDoc;
      const pane = paneRefs.current[targetPaneIdx];
      let meta = { rowCount: 0, delimiter: ',' as ResolvedDelimiter };

      if (pane) {
        const outcome = pane.applyTransformEdit((input) => {
          const res = shrinkDelimitedText(input, delimiter, targetDoc.name);
          meta = { rowCount: res.rowCount, delimiter: res.delimiter };
          return res;
        });
        if (outcome.error) {
          showToast(outcome.error);
          return;
        }
        if (meta.rowCount === 0) {
          showToast(t('notepad.data.noRows'));
          return;
        }
        showToast(
          t(outcome.scope === 'selection' ? 'notepad.data.shrunkSelection' : 'notepad.data.shrunkDoc', {
            rows: meta.rowCount,
            delim: formatDelimToast(meta.delimiter),
          }),
        );
        return;
      }

      const res = shrinkDelimitedText(targetDoc.content, delimiter, targetDoc.name);
      if (res.error) {
        showToast(res.error);
        return;
      }
      if (res.rowCount === 0) {
        showToast(t('notepad.data.noRows'));
        return;
      }
      patchDocById(targetDoc.id, (d) => ({ ...d, content: res.output, updatedAt: Date.now() }));
      showToast(
        t('notepad.data.shrunkDoc', {
          rows: res.rowCount,
          delim: formatDelimToast(res.delimiter),
        }),
      );
    },
    [activeDoc, activePaneIdx, docById, paneDocIds, paneRefs, patchDocById, showToast, t],
  );

  return { handleAlignCsv, handleShrinkCsv };
}
