import React from 'react';

import { FormFiller } from '../../components/PdfTools/FormFiller';
import { PdfPage } from '../../components/PdfTools/ToolPage';
import { FILL_FORMS } from '../../lib/pdf/tools';
import { useI18n } from '../../lib/ui/i18n';

export default function FillFormsPage() {
  const { t } = useI18n();
  return (
    <PdfPage
      title={FILL_FORMS.title}
      showHub
      lead={t('pdf.ffp.lead')}
    >
      <FormFiller />
    </PdfPage>
  );
}
