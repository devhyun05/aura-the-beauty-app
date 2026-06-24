import React from 'react';

import {
  ImageAnalysisReportDetailScreen,
  getImageAnalysisReportCreateFilterButtonPlacements,
  getImageAnalysisReportHeaderActions,
  getImageAnalysisReportLiquidGlassPresentation,
  getImageAnalysisReportScreenFramePresentation,
  getImageAnalysisReportSubtitleTextStyle,
} from './ImageAnalysisReportDetailScreen';
import {colors, shadows, spacing, typography} from '../../../shared/theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const createFilterButtonPlacements =
  getImageAnalysisReportCreateFilterButtonPlacements();
const headerActions: readonly string[] = getImageAnalysisReportHeaderActions();
const liquidGlassPresentation = getImageAnalysisReportLiquidGlassPresentation();
const screenFramePresentation = getImageAnalysisReportScreenFramePresentation();
const subtitleTextStyle = getImageAnalysisReportSubtitleTextStyle();

expectEqual(
  createFilterButtonPlacements.length,
  2,
  'image analysis report create filter button count',
);
expectEqual(
  createFilterButtonPlacements[0],
  'photo',
  'image analysis report photo create filter button placement',
);
expectEqual(
  createFilterButtonPlacements[1],
  'report-bottom',
  'image analysis report bottom create filter button placement',
);
expectEqual(
  headerActions.includes('back'),
  false,
  'image analysis report header back action hidden',
);
expectEqual(
  headerActions[0],
  'share',
  'image analysis report header share action',
);
expectEqual(
  headerActions[1],
  'close',
  'image analysis report header close action',
);
expectEqual(
  screenFramePresentation.headerPlacement,
  'fixed',
  'image analysis report header placement',
);
expectEqual(
  screenFramePresentation.headerUsesTopInset,
  true,
  'image analysis report header safe area',
);
expectEqual(
  screenFramePresentation.contentTopPadding,
  spacing.xl,
  'image analysis report content starts below fixed header',
);
expectEqual(
  liquidGlassPresentation.cardTargets.includes('summary'),
  true,
  'image analysis report summary cards use liquid glass',
);
expectEqual(
  liquidGlassPresentation.cardTargets.includes('makeup'),
  true,
  'image analysis report makeup cards use liquid glass',
);
expectEqual(
  liquidGlassPresentation.buttonTargets.includes('create-filter'),
  true,
  'image analysis report create filter buttons use liquid glass',
);
expectEqual(
  liquidGlassPresentation.buttonTargets.includes('header-action'),
  true,
  'image analysis report header action buttons use liquid glass',
);
expectEqual(
  liquidGlassPresentation.shadowRadius,
  shadows.liquidGlassGlow.shadowRadius,
  'image analysis report liquid glass shadow radius',
);
expectEqual(
  liquidGlassPresentation.surfaceColor,
  colors.liquidGlassSurface,
  'image analysis report liquid glass surface token',
);
expectEqual(
  subtitleTextStyle.fontSize,
  typography.fontSize.md,
  'image analysis report date label font size',
);
expectEqual(
  subtitleTextStyle.lineHeight,
  typography.lineHeight.md,
  'image analysis report date label line height',
);

<ImageAnalysisReportDetailScreen
  onBack={() => undefined}
  onCreateARFilter={() => undefined}
  reportId="analysis-20260622-bare-face"
/>;
