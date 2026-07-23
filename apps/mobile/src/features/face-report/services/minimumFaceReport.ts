import type {ReportData} from '../reportTypes';

export type MinimumFaceReportPreview = {
  capturedPhotoUri: string;
  errorMessage?: string;
  faceShape: string;
  has3DModel: boolean;
  personalColor?: string;
  ratioSummary?: string;
  recommendedMood: string;
  skinType: string;
};

export function buildMinimumFaceReportData(
  preview: MinimumFaceReportPreview,
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

  return {
    reportId: 'face-analysis-generating',
    topBarTitle: '맞춤 분석 보고서',
    initialPageId: 'summary:overview',
    generationStatus: preview.errorMessage ? 'failed' : 'loading',
    generationError: preview.errorMessage,
    s1: {
      photo: {
        uri: preview.capturedPhotoUri,
        placeholderLabel: '촬영 사진',
      },
      dateLine: 'AI 맞춤 분석 · 생성 중',
      headline: '먼저 확인된 핵심 결과',
      body: '준비된 결과부터 보여드려요. 상세 내용은 이 화면에서 계속 채워집니다.',
      legacyReport: false,
      legacyBadge: '',
      cards: [
        {label: '얼굴형', value: preview.faceShape},
        {label: '피부 타입', value: preview.skinType},
        {label: '추천 무드', value: preview.recommendedMood},
        ...optionalCards,
      ],
    },
    s2: null,
    s3: null,
    s4: null,
    s5: null,
    s6: null,
    s7: null,
    s8: null,
    s9: null,
    footer: {
      disclaimer: '현재 준비된 항목만 표시하고 있어요.',
      cta: '',
    },
  };
}
