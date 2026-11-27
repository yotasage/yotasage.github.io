// FFT & Spectrum Analyzer page (/fft/main)
import { useState } from 'react';
import PageHead from '../../components/PageHead';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import FftTool, { type FftWorkspaceId } from '../../components/Fft/FftTool';
import type { BibEntry } from '../../lib/bibtex';
import { loadReferences } from '../../lib/references';
import { useI18n } from '../../lib/ui/i18n';
import { useWideView } from '../../lib/ui/layout';
import { useDesignSystemPage } from '../../lib/ui/theme';

export async function getStaticProps() {
  return { props: { references: loadReferences() } };
}

export default function FftPage({ references }: { references: BibEntry[] }) {
  useDesignSystemPage('#0284c7', '#38bdf8');
  const { t } = useI18n();
  const { wide } = useWideView();
  const [workspace, setWorkspace] = useState<FftWorkspaceId>('analyzer');

  const workspaces: readonly WorkspaceTab<FftWorkspaceId>[] = [
    { id: 'analyzer', label: t('fft.ws.analyzer') },
    { id: 'compare', label: t('fft.ws.compare') },
    { id: 'theory', label: t('fft.ws.theory') },
  ];

  return (
    <div data-ds="v2" style={{ minHeight: '100vh', background: 'var(--ds-bg)' }}>
      <PageHead
        title={t('fft.pageTitle')}
        description={t('fft.metaDescription')}
        path="/fft/main"
        ogImage="/og/fft.png"
        ogAlt="FFT and Spectrum Analyzer with SNDR, ENOB, SFDR, THD, and Matplotlib-style spectrum plot"
      />

      <ToolHeader<FftWorkspaceId>
        title={t('fft.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        allowWideView
      />

      <FftTool workspace={workspace} wideView={wide} references={references} />
    </div>
  );
}
