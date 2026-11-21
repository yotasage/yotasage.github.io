import React from 'react';

import { FormFiller } from '../../components/PdfTools/FormFiller';
import { PdfPage } from '../../components/PdfTools/ToolPage';
import { FILL_FORMS } from '../../lib/pdf/tools';

export default function FillFormsPage() {
  return (
    <PdfPage
      title={FILL_FORMS.title}
      showHub
      lead="Fill interactive AcroForm fields directly on the page or from the field panel, then save as an editable or permanently flattened PDF."
    >
      <FormFiller />
    </PdfPage>
  );
}
