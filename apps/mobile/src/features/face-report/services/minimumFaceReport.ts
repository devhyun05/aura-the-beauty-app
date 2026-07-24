import type {ReportData} from '../reportTypes';
import type {FaceVerticalThirdsResult} from '../../face-ratio/types';
import type {Face3DReportProfile} from '../../face-3d/types';
import type {Face3DPhotoEvidence} from '../../face-3d/services/face3DPhotoEvidence';
import type {FaceGeometryMetrics} from '../../face-geometry/types';
import type {RegionVisuals} from '../../face-geometry/services/faceGeometryCore/regionVisualsBuilder';
import type {MeasuredPersonalColorView} from '../../face-analysis/services/faceAnalysisMeasurements';
import type {FaceAnalysisDerivedResult} from '../../face-analysis/services/faceAnalysisV2';
import type {GoldenMaskReportDescriptor} from '../../../shared/contracts/goldenMask';
import {
  buildCoreFeatureSection,
  buildFaceProportionSection,
  buildPersonalColorSection,
} from './fromFaceAnalysisReport';

export type MinimumFaceReportPreview = {
  capturedPhotoUri: string;
  derived?: FaceAnalysisDerivedResult;
  errorMessage?: string;
  faceShape: string;
  goldenMask?: GoldenMaskReportDescriptor;
  has3DModel: boolean;
  personalColor?: string;
  ratioSummary?: string;
  recommendedMood?: string;
  reportId?: string;
  skinType?: string;
};

export function buildMinimumFaceReportData(
  preview: MinimumFaceReportPreview,
  verticalThirds?: FaceVerticalThirdsResult | null,
  local?: {
    face3d?: Face3DReportProfile | null;
    face3dPhotoEvidence?: Face3DPhotoEvidence | null;
    geometryMetrics?: FaceGeometryMetrics | null;
    personalColor?: MeasuredPersonalColorView | null;
    regionVisuals?: RegionVisuals | null;
  },
): ReportData {
  const optionalCards = [
    preview.personalColor
      ? {label: '퍼스널 컬러', value: preview.personalColor}
      : null,
    preview.ratioSummary
      ? {label: '얼굴 비율', value: preview.ratioSummary}
      : null,
    preview.has3DModel
      ? {label: '3D 페이스', value: '모델 준비됨'}
      : null,
  ].filter((card): card is {label: string; value: string} => card !== null);
  const summaryCards = [
    {label: '얼굴형', value: preview.faceShape},
    preview.skinType
      ? {label: '피부 타입', value: preview.skinType}
      : null,
    preview.recommendedMood
      ? {label: '추천 무드', value: preview.recommendedMood}
      : null,
    ...optionalCards,
  ].filter((card): card is {label: string; value: string} => card !== null);
  const coreFeatures = buildCoreFeatureSection({
    photoUri: preview.capturedPhotoUri,
    regionVisuals: local?.regionVisuals,
    geometryMetrics: local?.geometryMetrics,
    face3d: local?.face3d,
    face3dPhotoEvidence: local?.face3dPhotoEvidence,
    derived: preview.derived,
  });

  return {
    reportId: preview.reportId ?? 'face-analysis-generating',
    ...(local?.face3d ? {face3d: local.face3d} : {}),
    contentRevision: 0,
    contentStatus: {
      narrativeStatus: 'processing',
      stylingStatus: 'processing',
    },
    topBarTitle: '맞춤 분석 보고서',
    generationStatus: preview.errorMessage ? 'failed' : 'loading',
    generationError: preview.errorMessage,
    ...(preview.goldenMask ? {goldenMask: preview.goldenMask} : {}),
    s1: {
      photo: {
        uri: preview.capturedPhotoUri,
        placeholderLabel: '촬영 사진',
      },
      dateLine: 'AI 맞춤 분석 · 생성 중',
      headline: preview.recommendedMood ?? '핵심 분석이 먼저 준비됐어요',
      body: '측정값으로 확정된 비율과 이목구비부터 보여드려요. 심층 인사이트와 스타일 제안은 이어서 완성됩니다.',
      legacyReport: false,
      legacyBadge: '',
      cards: summaryCards,
    },
    s2: buildFaceProportionSection(verticalThirds, null),
    s3: coreFeatures,
    s4: buildPersonalColorSection(
      local?.personalColor,
      preview.capturedPhotoUri,
    ),
    s5: null,
    s6: null,
    s7: null,
    s8: null,
    s9: null,
    footer: {
      disclaimer: '현재 준비된 항목만 표시하고 있어요.',
      cta:
        preview.reportId && !preview.errorMessage
          ? '메이크업 추천 받으러 가기'
          : '메이크업 추천 준비 중',
    },
  };
}
