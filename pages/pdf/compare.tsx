import React from 'react';

import { PdfCompareView } from '../../components/PdfTools/PdfCompareView';
import { PdfPage } from '../../components/PdfTools/ToolPage';
import { COMPARE } from '../../lib/pdf/tools';
import { useI18n } from '../../lib/ui/i18n';

export default function ComparePdfPage() {
  const { t } = useI18n();
  return (
    <PdfPage
      title={COMPARE.title}
      showHub
      lead={t('pdf.p.compare.lead')}
    >
      <PdfCompareView />
    </PdfPage>
  );
}
