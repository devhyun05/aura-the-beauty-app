import type { ImageSourcePropType } from 'react-native';
import type { FaceAnalysisReportMeasurements } from '../../features/face-analysis/services/faceAnalysisMeasurements';
import type {FaceAnalysisV2} from '../../features/face-analysis/services/faceAnalysisV2';

export interface FaceAnalysisMakeupGuideline {
  brow: string;
  blush: string;
  highlight: string;
  eyeshadow: string;
  eyeliner: string;
  lip: string;
}

export interface FaceAnalysisMakeupCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  imageSource: ImageSourcePropType;
  imageStatus?: 'pending' | 'ready' | 'failed';
  tags: string[];
}

// AI가 같은 분석 호출에서 함께 생성하는 부위별/전체 인상/스타일링 텍스트 —
// 좌표·수치가 아니라 서술만 담는다(정본 원칙 4: 측정 수치 비노출). 구버전
// 보고서(이 필드 추가 이전 생성분)에는 없을 수 있어 전부 optional.
export interface FaceAnalysisRegionNotes {
  upper: string;
  mid: string;
  lower: string;
  jaw: string;
}

export interface FaceAnalysisImpressionNotes {
  overallMood: string;
  keywords: string[];
  paragraph: string;
}

export type FaceAnalysisStylingLookRowCategory =
  | 'base'
  | 'brow'
  | 'eyeshadow'
  | 'eyeliner'
  | 'blush'
  | 'lip';

export interface FaceAnalysisStylingLookRow {
  category: FaceAnalysisStylingLookRowCategory;
  note: string;
  why: string;
}

export interface FaceAnalysisStylingLook {
  title: string;
  subtitle: string;
  description: string;
  rows: FaceAnalysisStylingLookRow[];
}

export interface FaceAnalysisStylingLooks {
  natural: FaceAnalysisStylingLook;
  glam: FaceAnalysisStylingLook;
}

export interface FaceAnalysisReport {
  id: string;
  title: string;
  reportTitle: string;
  analyzedAt: string;
  imageSource: ImageSourcePropType;
  environmentLabel: string;
  personalColor: string;
  faceShape: string;
  skinType: string;
  toneSummary: string;
  recommendedMood: string;
  tags: string[];
  summary: string;
  shortSummary: string;
  skinAnalysisSummary: string;
  baseMakeupGuide: string;
  makeupGuideline: FaceAnalysisMakeupGuideline;
  recommendedMakeups: FaceAnalysisMakeupCard[];
  avoidedMakeups: FaceAnalysisMakeupCard[];
  // 서버 detail_payload.request.measurements 에서 복원한 온디바이스 측정 원본 —
  // 과거 보고서에서도 측정 섹션을 렌더한다. 구버전 보고서(저장 이전)는 undefined.
  measurements?: FaceAnalysisReportMeasurements;
  faceAnalysisV2?: FaceAnalysisV2;
  // 이 필드 추가 이전에 생성된 보고서에는 없다 — 어댑터는 부재를 "섹션 숨김"으로
  // 처리하고, 없는 값을 지어내지 않는다.
  regionNotes?: FaceAnalysisRegionNotes;
  impressionNotes?: FaceAnalysisImpressionNotes;
  stylingLooks?: FaceAnalysisStylingLooks;
}
