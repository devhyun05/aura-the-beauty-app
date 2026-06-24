import React from 'react';

import {
  AnalysisReportDetailScreen,
  getAnalysisReportCreateFilterButtonPlacements,
  getAnalysisReportHeaderActions,
  getAnalysisReportSubtitleTextStyle,
} from './AnalysisReportDetailScreen';
import {typography} from '../../../shared/theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const createFilterButtonPlacements =
  getAnalysisReportCreateFilterButtonPlacements();
const headerActions: readonly string[] = getAnalysisReportHeaderActions();
const subtitleTextStyle = getAnalysisReportSubtitleTextStyle();

expectEqual(
  createFilterButtonPlacements.length,
  2,
  'analysis report create filter button count',
);
expectEqual(
  createFilterButtonPlacements[0],
  'photo',
  'analysis report photo create filter button placement',
);
expectEqual(
  createFilterButtonPlacements[1],
  'report-bottom',
  'analysis report bottom create filter button placement',
);
expectEqual(
  headerActions.includes('back'),
  false,
  'analysis report header back action hidden',
);
expectEqual(
  headerActions[0],
  'share',
  'analysis report header share action',
);
expectEqual(
  headerActions[1],
  'close',
  'analysis report header close action',
);
expectEqual(
  subtitleTextStyle.fontSize,
  typography.fontSize.md,
  'analysis report date label font size',
);
expectEqual(
  subtitleTextStyle.lineHeight,
  typography.lineHeight.md,
  'analysis report date label line height',
);

<AnalysisReportDetailScreen
  onBack={() => undefined}
  onCreateARFilter={() => undefined}
  resultId="analysis-20260622-bare-face"
/>;
