import { useRouter } from 'next/router';
import React from 'react';

import { HandoffFile, setHandoff } from '../../lib/pdf/handoff';
import {
  COMPRESS,
  EXTRACT_IMAGES,
  EXTRACT_PAGES,
  MERGE,
  ORGANIZE,
  PDF_TO_IMAGES,
  PdfTool,
  READER,
  REMOVE_METADATA,
  REMOVE_PAGES,
  ROTATE,
  SPLIT,
} from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';

const PDF_TARGETS: PdfTool[] = [
  READER,
  COMPRESS,
  REMOVE_METADATA,
  ORGANIZE,
  ROTATE,
  SPLIT,
  REMOVE_PAGES,
  EXTRACT_PAGES,
  MERGE,
  PDF_TO_IMAGES,
  EXTRACT_IMAGES,
];

export function ContinueWith({ currentToolId, files }: { currentToolId: string; files: HandoffFile[] }) {
  const router = useRouter();
  if (!files.length) return null;

  const targets = PDF_TARGETS.filter((t) => t.id !== currentToolId);

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
