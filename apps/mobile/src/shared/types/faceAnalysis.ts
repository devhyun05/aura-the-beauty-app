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
}
