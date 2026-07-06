import React from 'react';

import {
  FACE_ANALYSIS_REPORT_CARD_LAYOUT,
  FaceAnalysisReportCard,
} from './FaceAnalysisReportCard';
import {faceAnalysisReportsMock} from '../../../shared/mocks/faceAnalysis.mock';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

expectEqual(
  FACE_ANALYSIS_REPORT_CARD_LAYOUT,
  'journal-entry',
  'face analysis report list card uses journal entry layout',
);

<FaceAnalysisReportCard
  onPress={() => undefined}
  report={faceAnalysisReportsMock[0]}
/>;
