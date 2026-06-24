import React from 'react';

import {IMAGE_ANALYSIS_REPORT_PREVIEW_ACTION_ICON_NAME} from './ImageAnalysisReportPreviewCard';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  IMAGE_ANALYSIS_REPORT_PREVIEW_ACTION_ICON_NAME,
  'ChevronRight',
  'image analysis report preview action icon name',
);
