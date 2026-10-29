import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import { PdfTool } from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';
import HomeIcon from '../icons/home';
import ToolIcon from './ToolIcon';

// Page frame shared by the hub and every tool: header with links back, title and lead text.
export function PdfPage({ title, lead, showHub, children }: { title: string; lead?: React.ReactNode; showHub?: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #2b2b2b;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>

      <header className={styles.header}>
        <Link href="/" className={styles.homeLink} aria-label="Home"><HomeIcon /></Link>
        {showHub && <Link href="/pdf/main" className={styles.crumb}>&larr; All PDF tools</Link>}
        <h1 className={styles.title}>{title}</h1>
      </header>
      {lead && <p className={styles.lead}>{lead}</p>}
      {children}
    </div>
  );
}

export function FilePickerButton({ accept, multiple = true, onFiles, className, children }: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className ?? styles.button} onClick={() => input.current?.click()}>{children}</button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className={styles.visuallyHidden}
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

// Accepts files dragged in from the desktop. Reordering cards inside the page does not carry files and is ignored.
// Pages outside the PDF tools pass their own overClassName for the highlight while files are dragged over.
export function DropTarget({ onFiles, className, overClassName = styles.dropOver, children }: {
  onFiles: (files: File[]) => void;
  className: string;
  overClassName?: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = React.useState(false);
  const depth = React.useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  return (
    <div
      className={[className, over ? overClassName : ''].join(' ')}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current -= 1;
        if (depth.current <= 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
    >
      {children}
    </div>
  );
}

export function Progress({ fraction, label }: { fraction: number; label: string }) {
  return (
    <div className={styles.progress} role="status">
      <span>{label}</span>
      <div className={styles.progressTrack}><div style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }} /></div>
    </div>
  );
}

// The layout of a tool: a large drop zone until files are added, then the file grid next to an options sidebar.
export function ToolWorkspace({ tool, accept, selectLabel, dropLabel, hasFiles, onFiles, toolbar, sidebar, children }: {
  tool: PdfTool;
  accept: string;
  selectLabel: string;
  dropLabel: string;
  hasFiles: boolean;
  onFiles: (files: File[]) => void;
  toolbar?: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  if (!hasFiles) {
    return (
      <DropTarget onFiles={onFiles} className={styles.hero}>
        <ToolIcon name={tool.icon} color={tool.color} size={72} />
        <h2>{tool.title}</h2>
        <p>{tool.description}</p>
        <FilePickerButton accept={accept} onFiles={onFiles} className={styles.heroButton}>{selectLabel}</FilePickerButton>
        <span className={styles.hint}>{dropLabel}</span>
        <span className={styles.hint}>Your files are processed in this browser and are never uploaded.</span>
      </DropTarget>
    );
  }
  return (
    <div className={styles.workspace}>
      <DropTarget onFiles={onFiles} className={styles.filesPanel}>
        <div className={styles.toolbar}>
          <FilePickerButton accept={accept} onFiles={onFiles} className={styles.buttonSmall}>+ Add files</FilePickerButton>
          <span className={styles.toolbarSpacer} />
          {toolbar}
        </div>
        {children}
      </DropTarget>
      <aside className={styles.sidebar}>
        <h2>{tool.title}</h2>
        {sidebar}
      </aside>
    </div>
  );
}
