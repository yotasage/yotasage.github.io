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
  ORGANIZE,
  PAGE_NUMBERS,
  PDF_TO_IMAGES,
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
import styles from '../../styles/PdfTools.module.css';

const PDF_TARGETS: PdfTool[] = [
  READER,
  COMPARE,
  EDIT,
  COMPRESS,
  LINEARIZE,
  REPAIR,
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
  const router = useRouter();
  if (!files.length) return null;

  const targets = (customTargets ?? PDF_TARGETS).filter((t) => t.id !== currentToolId);

  return (
    <div className={styles.chainRow}>
      <span className={styles.chainLabel}>Continue with…</span>
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
          {tool.title}
        </button>
      ))}
    </div>
  );
}
