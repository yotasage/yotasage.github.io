import { useRouter } from 'next/router';
import React from 'react';

import { HandoffFile, setHandoff } from '../../lib/pdf/handoff';
import {
  COMPRESS,
  EDIT_METADATA,
  EXTRACT_IMAGES,
  EXTRACT_PAGES,
  FLATTEN,
  MERGE,
  ORGANIZE,
  PDF_TO_IMAGES,
  PdfTool,
  PROTECT,
  READER,
  REMOVE_ANNOTATIONS,
  REMOVE_METADATA,
  REMOVE_PAGES,
  ROTATE,
  SPLIT,
  UNLOCK,
} from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';

const PDF_TARGETS: PdfTool[] = [
  READER,
  COMPRESS,
  EDIT_METADATA,
  FLATTEN,
  REMOVE_ANNOTATIONS,
  REMOVE_METADATA,
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
