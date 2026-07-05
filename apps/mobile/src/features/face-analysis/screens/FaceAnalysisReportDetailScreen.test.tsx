import React from 'react';

import {
  FaceAnalysisReportDetailScreen,
  resolveFaceAnalysisReportHeroImageSource,
} from './FaceAnalysisReportDetailScreen';
import {
  getFaceAnalysisReportCreateFilterButtonPlacements,
  getFaceAnalysisReportAvoidedMakeupRailPresentation,
  getFaceAnalysisReportEditorialPresentation,
  getFaceAnalysisReportLiquidGlassPresentation,
  getFaceAnalysisReportPointGuideItems,
  getFaceAnalysisReportScreenFramePresentation,
  getFaceAnalysisReportSubtitleTextStyle,
  getFaceAnalysisReportSummaryItems,
  faceAnalysisReportCreateFilterButtonAccessibilityLabels,
} from '../services/faceAnalysisReportDetailModel';
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
const editorialPresentation = getFaceAnalysisReportEditorialPresentation();
const screenFramePresentation = getFaceAnalysisReportScreenFramePresentation();
const subtitleTextStyle = getFaceAnalysisReportSubtitleTextStyle();
const report = faceAnalysisReportsMock[0];
const summaryItems = getFaceAnalysisReportSummaryItems(report);
const pointGuideItems = getFaceAnalysisReportPointGuideItems(report);
const longPointGuideItems = getFaceAnalysisReportPointGuideItems({
  ...report,
  baseMakeupGuide:
    '피부 결은 얇은 세미글로우 베이스로 정돈하고, 볼 중앙은 복숭아빛 생기를 넓게 연결해요.',
});
const avoidedRailPresentation = getFaceAnalysisReportAvoidedMakeupRailPresentation();
const capturedPhotoUri = 'file:///tmp/captured-face.jpg';
const heroImageSource = resolveFaceAnalysisReportHeroImageSource(capturedPhotoUri, report) as {
  uri?: string;
};

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
  faceAnalysisReportCreateFilterButtonAccessibilityLabels['floating-bottom'],
  '메이크업 필터 만들기',
  'image analysis report create filter button copy',
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
  (liquidGlassPresentation.cardTargets as readonly string[]).includes('summary'),
  false,
  'image analysis report summary avoids liquid glass cards',
);
expectEqual(
  liquidGlassPresentation.cardTargets.includes('makeup'),
  true,
  'image analysis report makeup cards use liquid glass',
);
expectEqual(
  editorialPresentation.heroTreatment,
  'full-bleed-photo-report',
  'image analysis report uses an editorial photo hero',
);
expectEqual(
  editorialPresentation.summaryTreatment,
  'dark-ribbon-metrics',
  'image analysis report summary uses a dark ribbon treatment',
);
expectEqual(
  editorialPresentation.sectionTreatment,
  'cardless-divided-sections',
  'image analysis report sections avoid stacked card clutter',
);
expectEqual(
  editorialPresentation.heroMinimumHeight,
  420,
  'image analysis report hero keeps a strong visual anchor',
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
  longPointGuideItems[0].point,
  '피부 결은 얇은 세미글로우 베이스로 정돈하고',
  'image analysis report point guide keeps long first clause without ellipsis',
);
expectEqual(
  longPointGuideItems[0].point.includes('...'),
  false,
  'image analysis report point guide does not inject ellipsis',
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
expectEqual(
  heroImageSource.uri,
  capturedPhotoUri,
  'image analysis report detail uses captured photo before report image',
);

<FaceAnalysisReportDetailScreen
  onBack={() => undefined}
  onCreateARFilter={() => undefined}
  reportId="analysis-20260622-bare-face"
/>;
