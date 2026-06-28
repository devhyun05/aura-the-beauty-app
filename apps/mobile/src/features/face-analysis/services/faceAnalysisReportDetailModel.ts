import {colors, shadows, spacing, typography} from '../../../shared/theme';
import type {
  FaceAnalysisMakeupGuideline,
  FaceAnalysisReport,
} from '../../../shared/types/faceAnalysis';

export type FaceAnalysisReportGuideItem = {
  key: keyof FaceAnalysisMakeupGuideline | 'base';
  label: string;
  point: string;
  detail: string;
};

export type FaceAnalysisReportSummaryItem = {
  label: string;
  value: string;
};

export type FaceAnalysisReportCreateFilterButtonPlacement = 'floating-bottom';
type FaceAnalysisReportLiquidGlassButtonTarget = 'create-filter';
type FaceAnalysisReportLiquidGlassCardTarget = 'hero' | 'summary' | 'makeup';

type FaceAnalysisReportGuideLabel = {
  key: keyof FaceAnalysisMakeupGuideline;
  label: string;
};

const guideLabels: FaceAnalysisReportGuideLabel[] = [
  {key: 'brow', label: '눈썹'},
  {key: 'eyeshadow', label: '아이섀도우'},
  {key: 'lip', label: '립'},
  {key: 'highlight', label: '하이라이트'},
  {key: 'eyeliner', label: '아이라이너'},
  {key: 'blush', label: '블러셔'},
];

const createFilterButtonPlacements = [
  'floating-bottom',
] as const satisfies readonly FaceAnalysisReportCreateFilterButtonPlacement[];

export const faceAnalysisReportCreateFilterButtonAccessibilityLabels: Record<
  FaceAnalysisReportCreateFilterButtonPlacement,
  string
> = {
  'floating-bottom': 'AR 필터 만들기',
};

const faceAnalysisReportAvoidedMakeupRailPresentation = {
  showsCornerBadge: false,
  title: '비추천 메이크업',
} as const;

const faceAnalysisReportSubtitleTextStyle = {
  fontSize: typography.fontSize.md,
  lineHeight: typography.lineHeight.md,
} as const;

const faceAnalysisReportScreenFramePresentation = {
  contentTopPadding: spacing.xl,
  headerPlacement: 'route-level',
  headerUsesTopInset: true,
} as const;

export const faceAnalysisReportLiquidGlassSurfaceStyle = {
  backgroundColor: colors.liquidGlassSurface,
  borderColor: colors.liquidGlassBorder,
  borderWidth: 1,
  elevation: 4,
  shadowColor: colors.black,
  shadowOffset: {width: 0, height: 10},
  shadowOpacity: 0.1,
  shadowRadius: shadows.liquidGlassGlow.shadowRadius,
} as const;

export const faceAnalysisReportLiquidGlassButtonStyle = {
  ...faceAnalysisReportLiquidGlassSurfaceStyle,
  elevation: 5,
  shadowOffset: {width: 0, height: 8},
  shadowOpacity: 0.12,
} as const;

const faceAnalysisReportLiquidGlassPresentation = {
  buttonTargets: [
    'create-filter',
  ] as const satisfies readonly FaceAnalysisReportLiquidGlassButtonTarget[],
  cardTargets: [
    'hero',
    'summary',
    'makeup',
  ] as const satisfies readonly FaceAnalysisReportLiquidGlassCardTarget[],
  shadowRadius: faceAnalysisReportLiquidGlassSurfaceStyle.shadowRadius,
  surfaceColor: colors.liquidGlassSurface,
} as const;

export function getFaceAnalysisReportCreateFilterButtonPlacements() {
  return createFilterButtonPlacements;
}

export function getFaceAnalysisReportAvoidedMakeupRailPresentation() {
  return faceAnalysisReportAvoidedMakeupRailPresentation;
}

export function getFaceAnalysisReportSubtitleTextStyle() {
  return faceAnalysisReportSubtitleTextStyle;
}

export function getFaceAnalysisReportScreenFramePresentation() {
  return faceAnalysisReportScreenFramePresentation;
}

export function getFaceAnalysisReportLiquidGlassPresentation() {
  return faceAnalysisReportLiquidGlassPresentation;
}

export function getFaceAnalysisReportSummaryItems(
  report: FaceAnalysisReport,
): FaceAnalysisReportSummaryItem[] {
  return [
    {label: '퍼스널 컬러', value: report.personalColor},
    {label: '얼굴형', value: report.faceShape},
    {label: '톤 요약', value: report.toneSummary},
    {label: '추천 무드', value: report.recommendedMood},
  ];
}

function getGuidePoint(detail: string, fallback: string) {
  const normalized = detail.trim();

  if (!normalized) {
    return fallback;
  }

  const [firstClause] = normalized.split(/[,.，。]/);
  const point = firstClause.trim();

  if (!point) {
    return fallback;
  }

  return point;
}

export function getFaceAnalysisReportPointGuideItems(
  report: FaceAnalysisReport,
): FaceAnalysisReportGuideItem[] {
  return [
    {
      key: 'base',
      label: '베이스',
      point: getGuidePoint(report.baseMakeupGuide, '피부 표현'),
      detail: report.baseMakeupGuide,
    },
    ...guideLabels.map((guide) => {
      const detail = report.makeupGuideline[guide.key];

      return {
        ...guide,
        point: getGuidePoint(detail, guide.label),
        detail,
      };
    }),
  ];
}
