import {colors, shadows, spacing, typography} from '../../../shared/theme';
import {getMeasuredPersonalColorSummary} from '../../personal-color/services/personalColorCore/presentation';
import type {MeasuredPersonalColorView} from './faceAnalysisMeasurements';
import type {
  FaceAnalysisMakeupCard,
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

export type FaceAnalysisReportPrimaryMakeupRecommendation = {
  makeup: FaceAnalysisMakeupCard;
  guideSummary: string;
  reason: string;
};

export type FaceAnalysisReportCreateFilterButtonPlacement = 'floating-bottom';
type FaceAnalysisReportLiquidGlassButtonTarget = 'create-filter';
type FaceAnalysisReportLiquidGlassCardTarget = 'hero' | 'summary' | 'makeup';

type FaceAnalysisReportGuideLabel = {
  key: keyof FaceAnalysisMakeupGuideline;
  label: string;
};

const guideLabels: FaceAnalysisReportGuideLabel[] = [
  {key: 'brow', label: '\uB208\uC379'},
  {key: 'eyeshadow', label: '\uC544\uC774\uC100\uB3C4'},
  {key: 'eyeliner', label: '\uC544\uC774\uB77C\uC778'},
  {key: 'blush', label: '\uBE14\uB7EC\uC154'},
  {key: 'highlight', label: '\uD558\uC774\uB77C\uC774\uD2B8'},
  {key: 'lip', label: '\uB9BD'},
];

const guidePointLabels: Record<FaceAnalysisReportGuideItem['key'], string> = {
  base: '얇은 피부 표현',
  brow: '결 정돈',
  eyeshadow: '부드러운 음영',
  eyeliner: '가벼운 라인',
  blush: '넓은 생기',
  highlight: '은은한 광',
  lip: '톤 맞춘 립',
};

const createFilterButtonPlacements = [
  'floating-bottom',
] as const satisfies readonly FaceAnalysisReportCreateFilterButtonPlacement[];

export const faceAnalysisReportCreateFilterButtonAccessibilityLabels: Record<
  FaceAnalysisReportCreateFilterButtonPlacement,
  string
> = {
  'floating-bottom': '메이크업 필터 만들기',
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

const faceAnalysisReportEditorialPresentation = {
  heroMinimumHeight: 420,
  heroTreatment: 'full-bleed-photo-report',
  sectionTreatment: 'editorial-glass-sections',
  summaryTreatment: 'light-profile-metrics',
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

export function getFaceAnalysisReportEditorialPresentation() {
  return faceAnalysisReportEditorialPresentation;
}

export function getFaceAnalysisReportSummaryItems(
  report: FaceAnalysisReport,
  personalColor: MeasuredPersonalColorView | null = null,
): FaceAnalysisReportSummaryItem[] {
  const measured = getMeasuredPersonalColorSummary(personalColor ?? {axes: {} as MeasuredPersonalColorView['axes'], tone: null});
  return [
    {label: '퍼스널 컬러', value: measured.personalColor},
    {label: '얼굴형', value: report.faceShape},
    {label: '톤 요약', value: measured.toneSummary},
    {label: '추천 무드', value: report.recommendedMood},
  ];
}

function getGuidePoint(
  key: FaceAnalysisReportGuideItem['key'],
  detail: string,
  fallback: string,
) {
  const normalized = detail.trim();

  if (!normalized) {
    return fallback;
  }

  return guidePointLabels[key] ?? fallback;
}

export function getFaceAnalysisReportPointGuideItems(
  report: FaceAnalysisReport,
): FaceAnalysisReportGuideItem[] {
  return [
    {
      key: 'base',
      label: '베이스',
      point: getGuidePoint('base', report.baseMakeupGuide, '피부 표현'),
      detail: report.baseMakeupGuide,
    },
    ...guideLabels.map((guide) => {
      const detail = report.makeupGuideline[guide.key];

      return {
        ...guide,
        point: getGuidePoint(guide.key, detail, guide.label),
        detail,
      };
    }),
  ];
}

export function getFaceAnalysisReportPrimaryMakeupRecommendation(
  report: FaceAnalysisReport,
  guideItems = getFaceAnalysisReportPointGuideItems(report),
): FaceAnalysisReportPrimaryMakeupRecommendation | null {
  const [makeup] = report.recommendedMakeups;

  if (!makeup) {
    return null;
  }

  const guideSummary = guideItems
    .filter(
      (guide) => guide.key === 'base' || guide.key === 'blush' || guide.key === 'lip',
    )
    .map((guide) => guide.point)
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ');
  const fallbackGuideSummary =
    guideSummary || report.toneSummary || report.recommendedMood;

  return {
    makeup,
    guideSummary: fallbackGuideSummary,
    reason:
      report.shortSummary ||
      `${report.recommendedMood} 흐름을 데일리하게 풀어낸 추천 룩이에요.`,
  };
}
