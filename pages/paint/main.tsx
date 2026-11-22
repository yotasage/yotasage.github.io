import PageHead from '../../components/PageHead';
import PaintWorkspace from '../../components/Paint/PaintWorkspace';
import ToolHeader from '../../components/UI/ToolHeader';
import { useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Paint.module.css';

export default function PaintPage() {
  useDesignSystemPage('#2563eb', '#60a5fa');
  const { t } = useI18n();

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('paint.pageTitle')}
        description={t('paint.metaDescription')}
        path="/paint/main"
        ogImage="/og/home.png"
        ogAlt="Paint and raster image editor with layers, crop, resize, scale down, rotate, black and white color styles, and dockable panels"
      />

      <ToolHeader title={t('paint.title')} showExperienceMode={false} />

      <main className={styles.main}>
        <PaintWorkspace />
      </main>
    </div>
  );
}
