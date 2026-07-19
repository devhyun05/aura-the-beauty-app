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
type FaceAnalysisReportLiquidGlassCardTarget = 'hero' | 'summary';

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
  'floating-bottom': '메이크업 추천',
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

function compactSummaryLabel(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  if (!text) {
    return '측정 보류';
  }
  const normalized = text
    .replace(/에 가까운/g, '')
    .replace(/얼굴/g, '')
    .replace(/부드러운 윤곽/g, '')
    .replace(/상대적으로/g, '')
    .replace(/길어 온/g, '긴')
    .replace(/[,.，。].*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/계란|타원/.test(normalized)) return '계란형';
  if (/긴 타원|세로|긴형|길/.test(normalized)) return '긴형';
  if (/둥근/.test(normalized)) return '둥근형';
  if (/각진|사각/.test(normalized)) return '각진형';
  if (/하트/.test(normalized)) return '하트형';
  if (/다이아/.test(normalized)) return '다이아몬드형';
  if (/중안부/.test(normalized)) return '중안부 강조형';
  if (/상안부/.test(normalized)) return '상안부 강조형';
  if (/하안부/.test(normalized)) return '하안부 강조형';
  if (/균형/.test(normalized)) return '균형형';

  return normalized.length > 12 ? `${normalized.slice(0, 12)}…` : normalized;
}

function resolveCompactFaceShape(report: FaceAnalysisReport): string {
  return compactSummaryLabel(report.faceAnalysisV2?.derived.faceShape.label ?? report.faceShape);
}

function resolveCompactBalance(report: FaceAnalysisReport): string {
  return compactSummaryLabel(report.faceAnalysisV2?.derived.verticalBalance.label);
}

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
    {label: '얼굴형', value: resolveCompactFaceShape(report)},
    {label: '비율 특징', value: resolveCompactBalance(report)},
    {label: '톤 요약', value: measured.toneSummary},
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
