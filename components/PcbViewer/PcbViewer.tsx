import dynamic from 'next/dynamic';
import React from 'react';

import type { PickedFile } from '../../lib/pcb/load';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/PcbViewer.module.css';
import ToolIcon from '../Home/ToolIcon';
import TeachingCallout from '../UI/TeachingCallout';
import { canPickFolders, DropZone, PickButton } from './pick';
import type WorkspaceComponent from './Workspace';

function LoadingWorkspace() {
  const { t } = useI18n();
  return <div className={styles.loadingWorkspace}>{t('pcb.loading')}</div>;
}

// The viewer is only downloaded once files are opened. With "module": "node16", TypeScript takes the files of the site
// for CommonJS: it wants a file extension (which Turbopack does not resolve to .tsx) and expects the component one level
// deeper. The bundler gives the ES module.
const Workspace = dynamic(
  // @ts-expect-error TS2835, see above.
  () => import('./Workspace') as Promise<{ default: typeof WorkspaceComponent }>,
  { ssr: false, loading: () => <LoadingWorkspace /> },
);

export const PCB_FORMATS: { title: string; formats: string; note?: string }[] = [
  { title: 'Gerber', formats: 'RS-274X and X2 (.gbr, .gtl, .gbl, .gto, .pho, .art and others)', note: 'Including the old commands of older files.' },
  { title: 'Drill', formats: 'Excellon (.drl, .txt, .xln and others) and Gerber drill files', note: 'Slots and routed holes too; a file without a header gets its format from the pads.' },
  { title: 'Gerber job file', formats: '.gbrjob', note: 'Gives each layer its function and order, and the colours.' },
  { title: 'Pick-and-place', formats: 'KiCad (.csv, .pos), Altium, JLCPCB, EAGLE (.mnt, .mnb), Fusion 360 and other tables', note: 'Opened with Gerber files, the parts are marked on the board; columns, units and origin can be changed.' },
  { title: 'KiCad', formats: 'Boards (.kicad_pcb, KiCad 4 to 10) and footprints (.kicad_mod)', note: 'Drawn as KiCad plots them, zones as last filled; a project folder can be opened as it is.' },
  { title: 'Altium', formats: 'Boards (.PcbDoc, binary and ASCII) and footprint libraries (.PcbLib)', note: 'Pads, polygons as last poured, internal planes; text in a stroke font in the place and size of Altium’s.' },
  { title: 'PADS', formats: 'PADS ASCII boards (.asc, PowerPCB V4.0 to current PADS Layout)', note: 'Pad stacks, pours as last flooded, planes drawn from their outlines; a binary .pcb has to be exported as ASCII in PADS first.' },
  { title: 'EAGLE', formats: 'Boards (.brd of EAGLE 6 to 9 and Fusion 360 exports) and libraries (.lbr)', note: 'Pads by the design rules; polygons drawn from their outlines, as EAGLE stores no pour; a binary .brd from before EAGLE 6 has to be saved as XML first.' },
  { title: 'Archives', formats: 'ZIP, also inside other ZIPs and with folders' },
];

const FORMAT_CHIPS = [
  'Gerber RS-274X / X2',
  'Excellon Drill',
  'KiCad (.kicad_pcb)',
  'Altium (.PcbDoc)',
  'PADS (.asc)',
  'EAGLE (.brd)',
  'Pick-and-place',
  'ZIP Archives',
];

export interface PcbViewerProps {
  onOpenGuide?: () => void;
}

export default function PcbViewer({ onOpenGuide }: PcbViewerProps) {
  const [files, setFiles] = React.useState<PickedFile[] | null>(null);
  const [folders, setFolders] = React.useState(false);
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  React.useEffect(() => setFolders(canPickFolders()), []);

  if (files) return <Workspace initial={files} />;

  return (
    <div className={styles.startWrap}>
      {mode === 'quick' && (
        <div className={styles.quickBanner}>
          <div className={styles.quickBannerText}>
            <span className={styles.quickBadge}>{t('pcb.quick.badge')}</span>
            <span>{t('pcb.quick.bannerText')}</span>
          </div>
          <div className={styles.quickActions}>
            <button type="button" className={styles.buttonSmall} onClick={() => setMode('standard')}>
              {t('pcb.quick.switchStandard')}
            </button>
            <button type="button" className={styles.buttonSmall} onClick={() => setMode('teaching')}>
              {t('pcb.quick.switchTeaching')}
            </button>
          </div>
        </div>
      )}

      <DropZone onFiles={setFiles} className={styles.hero} overClassName={styles.dropOver}>
        <div className={styles.heroBadge} aria-hidden="true">
          <ToolIcon name="pcb" color="var(--ds-accent)" size={48} />
        </div>
        <h2>{t('pcb.drop.title')}</h2>
        <p>{t('pcb.drop.desc')}</p>
        <div className={styles.heroButtons}>
          <PickButton onFiles={setFiles} className={styles.heroButton}>
            {t('pcb.drop.selectFiles')}
          </PickButton>
          {folders && (
            <PickButton folder onFiles={setFiles} className={styles.heroButtonSecondary}>
              {t('pcb.drop.selectFolder')}
            </PickButton>
          )}
        </div>
        <span className={styles.hint}>{t('pcb.drop.hint')}</span>

        <div className={styles.formatBar}>
          <ul className={styles.formatChips} aria-label={t('pcb.guide.formatsTitle')}>
            {FORMAT_CHIPS.map((chip) => (
              <li key={chip} className={styles.formatChip}>{chip}</li>
            ))}
          </ul>
          {onOpenGuide && (
            <button type="button" className={styles.formatGuideLink} onClick={onOpenGuide}>
              {t('pcb.drop.allFormats')}
            </button>
          )}
        </div>

        <span className={styles.localHint}>{t('pcb.drop.localHint')}</span>
      </DropZone>

      {mode === 'teaching' && (
        <div className={styles.teachingGrid}>
          <TeachingCallout
            title={t('pcb.teaching.formatsTitle')}
            onTheoryClick={onOpenGuide}
            theoryLabel={t('pcb.teaching.openGuide')}
          >
            {t('pcb.teaching.formatsBody')}
          </TeachingCallout>
          <TeachingCallout
            title={t('pcb.teaching.viewsTitle')}
            onTheoryClick={onOpenGuide}
            theoryLabel={t('pcb.teaching.openGuide')}
          >
            {t('pcb.teaching.viewsBody')}
          </TeachingCallout>
        </div>
      )}
    </div>
  );
}
