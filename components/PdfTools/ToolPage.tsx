import Link from 'next/link';
import { useRouter } from 'next/router';
import React from 'react';

import { PdfTool, TOOL_CATEGORIES } from '../../lib/pdf/tools';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/PdfTools.module.css';
import PageHead from '../PageHead';
import ToolHeader from '../UI/ToolHeader';
import ToolIcon from './ToolIcon';

const PDF_HUB_DESCRIPTION =
  'Read, compare, merge, split, compress, OCR, sign, redact, convert, and scrub metadata from PDFs directly in your browser — files never leave your device.';

const PDF_TOOLS_BY_HREF: ReadonlyMap<string, PdfTool> = new Map(
  TOOL_CATEGORIES.flatMap((category) => category.tools.map((tool) => [tool.href, tool] as const)),
);

const FULL_LOCAL_SUFFIX = ' Runs locally in your browser — files never leave your device.';
const SHORT_LOCAL_SUFFIX = ' Runs locally in your browser.';

function resolvePdfDescription(path: string, explicit?: string): string {
  if (explicit) return explicit;
  const tool = PDF_TOOLS_BY_HREF.get(path);
  if (!tool) return PDF_HUB_DESCRIPTION;
  const base = tool.description.trim();
  if (base.length + FULL_LOCAL_SUFFIX.length <= 160) return `${base}${FULL_LOCAL_SUFFIX}`;
  if (base.length + SHORT_LOCAL_SUFFIX.length <= 160) return `${base}${SHORT_LOCAL_SUFFIX}`;
  return base;
}

function ShieldCheckIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

// Page frame shared by the hub and every tool: frosted SaaS header with back navigation, lead text and responsive container.
export function PdfPage({
  title,
  description,
  path,
  ogImage = '/og/pdf-tools.png',
  ogAlt = 'PDF tools hub showing client-side tools to merge, split, compress, OCR, sign, and redact PDFs',
  lead,
  showHub,
  children,
}: {
  title: string;
  description?: string;
  path?: string;
  ogImage?: string;
  ogAlt?: string;
  lead?: React.ReactNode;
  showHub?: boolean;
  children: React.ReactNode;
}) {
  useDesignSystemPage('#dc2626', '#ef6a50');
  const { t } = useI18n();
  const router = useRouter();
  const resolvedPath = path ?? (router.pathname || '/pdf/main');
  const resolvedDescription = resolvePdfDescription(resolvedPath, description);
  const matchedTool = PDF_TOOLS_BY_HREF.get(resolvedPath);
  const displayTitle = matchedTool && title === matchedTool.title
    ? t(`pdf.tool.${matchedTool.id}.title` as TranslationKey)
    : title;

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={displayTitle}
        description={resolvedDescription}
        path={resolvedPath}
        ogImage={ogImage}
        ogAlt={ogAlt}
      />

      <ToolHeader
        title={displayTitle}
        showExperienceMode={false}
        allowWideView
        actions={
          showHub ? (
            <Link href="/pdf/main" className={styles.hubLink}>
              &larr; {t('pdf.allTools')}
            </Link>
          ) : undefined
        }
      />

      <main className={styles.main}>
        {lead && <p className={styles.lead}>{lead}</p>}
        {children}
      </main>
    </div>
  );
}

export function FilePickerButton({
  accept,
  multiple = true,
  onFiles,
  className,
  children,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className ?? styles.button} onClick={() => input.current?.click()}>
        {children}
      </button>
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
export function DropTarget({
  onFiles,
  className,
  overClassName = styles.dropOver,
  children,
}: {
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
      className={[className, over ? overClassName : ''].filter(Boolean).join(' ')}
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
      <div className={styles.progressTrack}>
        <div style={{ width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }} />
      </div>
    </div>
  );
}

// The layout of a tool: a crisp SaaS drop card until files are added, then the file grid next to a sticky options sidebar.
export function ToolWorkspace({
  tool,
  accept,
  multiple = true,
  selectLabel,
  dropLabel,
  addLabel,
  hasFiles,
  onFiles,
  toolbar,
  sidebar,
  children,
}: {
  tool: PdfTool;
  accept: string;
  multiple?: boolean;
  selectLabel: string;
  dropLabel: string;
  addLabel?: string;
  hasFiles: boolean;
  onFiles: (files: File[]) => void;
  toolbar?: React.ReactNode;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const localizedTitle = t(`pdf.tool.${tool.id}.title` as TranslationKey);
  const localizedDesc = t(`pdf.tool.${tool.id}.desc` as TranslationKey);
  const resolvedAddLabel = addLabel ?? t('pdf.ui.addFiles');

  if (!hasFiles) {
    return (
      <DropTarget onFiles={onFiles} className={styles.hero}>
        <span
          className={styles.heroIconBadge}
          style={{ '--tool-accent': tool.color } as React.CSSProperties}
        >
          <ToolIcon name={tool.icon} color={tool.color} size={44} />
        </span>
        <h2>{localizedTitle}</h2>
        <p>{localizedDesc}</p>
        <FilePickerButton accept={accept} multiple={multiple} onFiles={onFiles} className={styles.heroButton}>
          {selectLabel}
        </FilePickerButton>
        <span className={styles.hint}>{dropLabel}</span>
        <span className={styles.privacyBadge}>
          <span className={styles.privacyBadgeIcon}>
            <ShieldCheckIcon />
          </span>
          <span>{t('pdf.localHint')}</span>
        </span>
      </DropTarget>
    );
  }
  return (
    <div className={styles.workspace}>
      <DropTarget onFiles={onFiles} className={styles.filesPanel}>
        <div className={styles.toolbar}>
          <FilePickerButton accept={accept} multiple={multiple} onFiles={onFiles} className={styles.buttonSmall}>
            {resolvedAddLabel}
          </FilePickerButton>
          <span className={styles.toolbarSpacer} />
          {toolbar}
        </div>
        {children}
      </DropTarget>
      <aside className={styles.sidebar}>
        <h2>{localizedTitle}</h2>
        {sidebar}
      </aside>
    </div>
  );
}
