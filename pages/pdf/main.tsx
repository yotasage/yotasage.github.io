import Link from 'next/link';
import React from 'react';

import ToolIcon from '../../components/PdfTools/ToolIcon';
import { PdfPage } from '../../components/PdfTools/ToolPage';
import { TOOL_CATEGORIES } from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';

export default function PdfTools() {
  return (
    <PdfPage
      title="PDF tools"
      lead={<>Everything runs in your browser. Files are never uploaded, there are no ads and no limits other than your device's memory.</>}
    >
      <div className={styles.toolGrid}>
        {TOOL_CATEGORIES.flatMap((category) => category.tools.map((tool) => (
          <Link key={tool.id} href={tool.href} className={styles.toolTile}>
            <ToolIcon name={tool.icon} color={tool.color} />
            <span className={styles.toolCategory}>{category.title}</span>
            <h3>{tool.title}</h3>
            <p>{tool.description}</p>
          </Link>
        )))}
      </div>
      <p className={styles.note}>
        More tools are planned, see the{' '}
        <a className={styles.textLink} href="https://github.com/yotasage/yotasage.github.io/blob/main/docs/pdf-tools-plan.md" target="_blank" rel="noopener noreferrer">roadmap</a>.
      </p>
    </PdfPage>
  );
}
