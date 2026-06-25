import React from 'react';

import {
  FaceAnalysisReportDetailScreen,
  getFaceAnalysisReportCreateFilterButtonPlacements,
  getFaceAnalysisReportAvoidedMakeupRailPresentation,
  getFaceAnalysisReportLiquidGlassPresentation,
  getFaceAnalysisReportPointGuideItems,
  getFaceAnalysisReportScreenFramePresentation,
  getFaceAnalysisReportSubtitleTextStyle,
  getFaceAnalysisReportSummaryItems,
} from './FaceAnalysisReportDetailScreen';
import {faceAnalysisReportsMock} from '../../../shared/mocks/faceAnalysis.mock';
import {colors, shadows, spacing, typography} from '../../../shared/theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

type TypeEquals<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends
  (<Value>() => Value extends Expected ? 1 : 2)
    ? true
    : false;

type ExpectType<Condition extends true> = Condition;

const createFilterButtonPlacements =
  getFaceAnalysisReportCreateFilterButtonPlacements();
const liquidGlassPresentation = getFaceAnalysisReportLiquidGlassPresentation();
const screenFramePresentation = getFaceAnalysisReportScreenFramePresentation();
const subtitleTextStyle = getFaceAnalysisReportSubtitleTextStyle();
const report = faceAnalysisReportsMock[0];
const summaryItems = getFaceAnalysisReportSummaryItems(report);
const pointGuideItems = getFaceAnalysisReportPointGuideItems(report);
const avoidedRailPresentation = getFaceAnalysisReportAvoidedMakeupRailPresentation();

type CreateFilterButtonPlacementsContract = ExpectType<
  TypeEquals<typeof createFilterButtonPlacements, readonly ['floating-bottom']>
>;

expectEqual(
  createFilterButtonPlacements.length,
  1,
  'image analysis report create filter button count',
);
expectEqual(
  createFilterButtonPlacements[0],
  'floating-bottom',
  'image analysis report floating bottom create filter button placement',
);
expectEqual(
  screenFramePresentation.headerPlacement,
  'route-level',
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
  (liquidGlassPresentation.buttonTargets as readonly string[]).includes('header-action'),
  false,
  'image analysis report header actions are route chrome owned',
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
expectEqual(summaryItems.length, 4, 'image analysis report summary item count');
expectEqual(
  summaryItems.some((item) => item.label === '얼굴형'),
  true,
  'image analysis report summary includes face shape',
);
expectEqual(
  summaryItems.some((item) => item.label === '피부 타입'),
  false,
  'image analysis report summary excludes skin type',
);
expectEqual(
  pointGuideItems[0].label,
  '베이스',
  'image analysis report point guide starts with base row',
);
expectEqual(
  pointGuideItems[0].detail,
  report.baseMakeupGuide,
  'image analysis report base guide is inline point guide detail',
);
expectEqual(
  pointGuideItems[1].label,
  '눈썹',
  'image analysis report brow guide follows base row',
);
expectEqual(
  avoidedRailPresentation.title,
  '비추천 메이크업',
  'image analysis report avoided makeup rail title',
);
expectEqual(
  avoidedRailPresentation.showsCornerBadge,
  false,
  'image analysis report avoided makeup rail corner x hidden',
);

<FaceAnalysisReportDetailScreen
  onBack={() => undefined}
  onCreateARFilter={() => undefined}
  reportId="analysis-20260622-bare-face"
/>;
