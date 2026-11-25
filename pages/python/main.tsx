import PageHead from '../../components/PageHead';
import PythonPlayground from '../../components/Python/PythonPlayground';
import { useI18n } from '../../lib/ui/i18n';

export default function PythonPlaygroundPage() {
  const { t } = useI18n();

  return (
    <>
      <PageHead
        title={t('python.pageTitle')}
        description={t('python.metaDescription')}
        path="/python/main"
        ogImage="/og/python.png"
        ogAlt={t('python.ogAlt')}
      />
      <PythonPlayground />
    </>
  );
}
