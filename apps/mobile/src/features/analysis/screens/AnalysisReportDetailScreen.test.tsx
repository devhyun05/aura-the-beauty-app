import React from 'react';

import {
  AnalysisReportDetailScreen,
  getAnalysisReportCreateFilterButtonPlacements,
  getAnalysisReportHeaderActions,
  getAnalysisReportLiquidGlassPresentation,
  getAnalysisReportScreenFramePresentation,
  getAnalysisReportSubtitleTextStyle,
} from './AnalysisReportDetailScreen';
import {colors, shadows, spacing, typography} from '../../../shared/theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const createFilterButtonPlacements =
  getAnalysisReportCreateFilterButtonPlacements();
const headerActions: readonly string[] = getAnalysisReportHeaderActions();
const liquidGlassPresentation = getAnalysisReportLiquidGlassPresentation();
const screenFramePresentation = getAnalysisReportScreenFramePresentation();
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
  screenFramePresentation.headerPlacement,
  'fixed',
  'analysis report header placement',
);
expectEqual(
  screenFramePresentation.headerUsesTopInset,
  true,
  'analysis report header safe area',
);
expectEqual(
  screenFramePresentation.contentTopPadding,
  spacing.xl,
  'analysis report content starts below fixed header',
);
expectEqual(
  liquidGlassPresentation.cardTargets.includes('summary'),
  true,
  'analysis report summary cards use liquid glass',
);
expectEqual(
  liquidGlassPresentation.cardTargets.includes('makeup'),
  true,
  'analysis report makeup cards use liquid glass',
);
expectEqual(
  liquidGlassPresentation.buttonTargets.includes('create-filter'),
  true,
  'analysis report create filter buttons use liquid glass',
);
expectEqual(
  liquidGlassPresentation.buttonTargets.includes('header-action'),
  true,
  'analysis report header action buttons use liquid glass',
);
expectEqual(
  liquidGlassPresentation.shadowRadius,
  shadows.liquidGlassGlow.shadowRadius,
  'analysis report liquid glass shadow radius',
);
expectEqual(
  liquidGlassPresentation.surfaceColor,
  colors.liquidGlassSurface,
  'analysis report liquid glass surface token',
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
