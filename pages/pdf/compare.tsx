import React from 'react';

import { PdfCompareView } from '../../components/PdfTools/PdfCompareView';
import { PdfPage } from '../../components/PdfTools/ToolPage';
import { COMPARE } from '../../lib/pdf/tools';

export default function ComparePdfPage() {
  return (
    <PdfPage
      title={COMPARE.title}
      showHub
      lead="Compare two PDF documents side-by-side, with pixel diff overlays, a swipe curtain, and reading-order text diffs — all locally in your browser."
    >
      <PdfCompareView />
    </PdfPage>
  );
}
