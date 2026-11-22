import dynamic from 'next/dynamic';
import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Viewer3D.module.css';
import ToolIcon from '../Home/ToolIcon';
import { DropTarget, FilePickerButton } from '../PdfTools/ToolPage';
import TeachingCallout from '../UI/TeachingCallout';
import type WorkspaceComponent from './Workspace';

function LoadingWorkspace() {
  const { t } = useI18n();
  return <div className={styles.loadingWorkspace}>{t('viewer3d.loading')}</div>;
}

// three.js and the viewer are only downloaded once a file is opened. With "module": "node16", TypeScript takes the
// files of the site for CommonJS: it wants a file extension (which Turbopack does not resolve to .tsx) and expects the
// component one level deeper. The bundler gives the ES module.
const Workspace = dynamic(
  // @ts-expect-error TS2835, see above.
  () => import('./Workspace') as Promise<{ default: typeof WorkspaceComponent }>,
  { ssr: false, loading: () => <LoadingWorkspace /> },
);

// No file filter: phones grey out files whose extension they do not know a type for, which is most 3D formats.
const ACCEPT = '';

const FORMAT_CHIPS = [
  'STEP / IGES / BREP',
  'STL / 3MF / AMF',
  'OBJ / PLY / OFF / VTK',
  'glTF / GLB / FBX / USDZ',
  'XYZ / PCD / G-code / VOX',
];

export interface Viewer3DProps {
  onOpenGuide?: () => void;
}

export default function Viewer3D({ onOpenGuide }: Viewer3DProps) {
  const [files, setFiles] = React.useState<File[] | null>(null);
  const [loadingExample, setLoadingExample] = React.useState(false);
  const [exampleError, setExampleError] = React.useState<string | null>(null);
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const handleLoadExample = React.useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (loadingExample) return;
    setLoadingExample(true);
    setExampleError(null);
    try {
      const res = await fetch('/samples/example-part.stl');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const file = new File([buf], 'example-part.stl', { type: 'model/stl' });
      setFiles([file]);
    } catch {
      setExampleError(t('viewer3d.drop.exampleError'));
    } finally {
      setLoadingExample(false);
    }
  }, [loadingExample, t]);

  if (files) return <Workspace files={files} onOpen={setFiles} />;

  return (
    <div className={styles.startWrap}>
      {mode === 'quick' && (
        <div className={styles.quickBanner}>
          <div className={styles.quickBannerText}>
            <span className={styles.quickBadge}>{t('viewer3d.quick.badge')}</span>
            <span>{t('viewer3d.quick.bannerText')}</span>
          </div>
          <div className={styles.quickActions}>
            <button type="button" className={styles.buttonSmall} onClick={() => setMode('standard')}>
              {t('viewer3d.quick.switchStandard')}
            </button>
            <button type="button" className={styles.buttonSmall} onClick={() => setMode('teaching')}>
              {t('viewer3d.quick.switchTeaching')}
            </button>
          </div>
        </div>
      )}

      <DropTarget onFiles={setFiles} className={styles.hero} overClassName={styles.dropOver}>
        <div className={styles.heroBadge} aria-hidden="true">
          <ToolIcon name="viewer3d" color="var(--ds-accent)" size={48} />
        </div>
        <h2>{t('viewer3d.drop.title')}</h2>
        <p>{t('viewer3d.drop.desc')}</p>
        <div className={styles.heroButtons}>
          <FilePickerButton accept={ACCEPT} onFiles={setFiles} className={styles.heroButton}>
            {t('viewer3d.drop.selectBtn')}
          </FilePickerButton>
          <button
            type="button"
            className={styles.heroButtonSecondary}
            onClick={handleLoadExample}
            disabled={loadingExample}
            aria-busy={loadingExample || undefined}
          >
            {loadingExample ? t('viewer3d.drop.loadingExample') : t('viewer3d.drop.tryExample')}
          </button>
        </div>
        {exampleError && (
          <p className={styles.exampleError} role="alert">
            {exampleError}
          </p>
        )}
        <span className={styles.hint}>{t('viewer3d.drop.hint')}</span>

        <div className={styles.formatBar}>
          <ul className={styles.formatChips} aria-label={t('viewer3d.guide.formatsTitle')}>
            {FORMAT_CHIPS.map((chip) => (
              <li key={chip} className={styles.formatChip}>{chip}</li>
            ))}
          </ul>
          {onOpenGuide && (
            <button type="button" className={styles.formatGuideLink} onClick={onOpenGuide}>
              {t('viewer3d.drop.allFormats')}
            </button>
          )}
        </div>

        <span className={styles.localHint}>{t('viewer3d.drop.localHint')}</span>
      </DropTarget>

      {mode === 'teaching' && (
        <div className={styles.teachingGrid}>
          <TeachingCallout
            title={t('viewer3d.teaching.cadTitle')}
            onTheoryClick={onOpenGuide}
            theoryLabel={t('viewer3d.teaching.openGuide')}
          >
            {t('viewer3d.teaching.cadBody')}
          </TeachingCallout>
          <TeachingCallout
            title={t('viewer3d.teaching.sectionTitle')}
            onTheoryClick={onOpenGuide}
            theoryLabel={t('viewer3d.teaching.openGuide')}
          >
            {t('viewer3d.teaching.sectionBody')}
          </TeachingCallout>
        </div>
      )}
    </div>
  );
}
