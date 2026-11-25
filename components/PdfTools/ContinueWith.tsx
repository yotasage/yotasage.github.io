import { useRouter } from 'next/router';
import React from 'react';

import { HandoffFile, setHandoff } from '../../lib/pdf/handoff';
import {
  COMPARE,
  COMPRESS,
  CROP,
  EDIT,
  EDIT_METADATA,
  EXTRACT_IMAGES,
  EXTRACT_PAGES,
  FILL_FORMS,
  FLATTEN,
  GRAYSCALE,
  INVERT,
  LINEARIZE,
  MERGE,
  NUP,
  OCR,
  ORGANIZE,
  PAGE_NUMBERS,
  PDF_TO_IMAGES,
  PDFA,
  PdfTool,
  PROTECT,
  READER,
  REDACT,
  REMOVE_ANNOTATIONS,
  REMOVE_METADATA,
  REMOVE_PAGES,
  REPAIR,
  RESIZE,
  ROTATE,
  SIGN,
  SPLIT,
  UNLOCK,
  WATERMARK,
} from '../../lib/pdf/tools';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PdfTools.module.css';

const PDF_TARGETS: PdfTool[] = [
  READER,
  COMPARE,
  EDIT,
  COMPRESS,
  LINEARIZE,
  REPAIR,
  OCR,
  CROP,
  RESIZE,
  PAGE_NUMBERS,
  WATERMARK,
  NUP,
  GRAYSCALE,
  INVERT,
  EDIT_METADATA,
  SIGN,
  FILL_FORMS,
  FLATTEN,
  REMOVE_ANNOTATIONS,
  REMOVE_METADATA,
  REDACT,
  PROTECT,
  UNLOCK,
  ORGANIZE,
  ROTATE,
  SPLIT,
  REMOVE_PAGES,
  EXTRACT_PAGES,
  MERGE,
  PDF_TO_IMAGES,
  EXTRACT_IMAGES,
  PDFA,
];

export function ContinueWith({
  currentToolId,
  files,
  targets: customTargets,
}: {
  currentToolId: string;
  files: HandoffFile[];
  targets?: PdfTool[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  if (!files.length) return null;

  const targets = (customTargets ?? PDF_TARGETS).filter((tool) => tool.id !== currentToolId);

  return (
    <div className={styles.chainRow}>
      <span className={styles.chainLabel}>{t('pdf.ui.continueWith')}</span>
      {targets.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={styles.buttonSmall}
          onClick={() => {
            setHandoff(files);
            void router.push(tool.href);
          }}
        >
          {t(`pdf.tool.${tool.id}.title` as TranslationKey)}
        </button>
      ))}
    </div>
  );
}
