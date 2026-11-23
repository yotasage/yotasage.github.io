import PageHead from '../../components/PageHead';
import NotepadWorkspace from '../../components/Notepad/NotepadWorkspace';
import ToolHeader from '../../components/UI/ToolHeader';
import { useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Notepad.module.css';

export default function ScratchpadPage() {
  useDesignSystemPage('#059669', '#34d399');
  const { t } = useI18n();

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('notepad.pageTitle')}
        description={t('notepad.metaDescription')}
        path="/scratchpad/main"
        ogImage="/og/home.png"
        ogAlt="Scratchpad browser text and code editor powered by Monaco Editor with side-by-side and grid views, diff comparison, regex and extended search/replace, CSV and LaTeX highlighting, and local persistence"
      />

      <ToolHeader title={t('notepad.title')} showExperienceMode={false} />

      <main className={styles.main}>
        <NotepadWorkspace />
      </main>
    </div>
  );
}
