import type { ImageSourcePropType } from 'react-native';
import type { FaceAnalysisReportMeasurements } from '../../features/face-analysis/services/faceAnalysisMeasurements';
import type {FaceAnalysisV2} from '../../features/face-analysis/services/faceAnalysisV2';
import type {GoldenMaskReportDescriptor} from '../contracts/goldenMask';

export interface FaceAnalysisMakeupGuideline {
  brow: string;
  blush: string;
  highlight: string;
  eyeshadow: string;
  eyeliner: string;
  lip: string;
}

// AR 필터 색 개인화(B) — 분석이 퍼스널 컬러 근거로 낸 부위별 hex. makeupGuideline
// 텍스트와 별개 필드. 부위 키는 AR 레시피 데코 부위와 매칭(foundation 제외).
// 이 필드 추가 이전 보고서엔 없다(어댑터가 부재를 "프리셋 색 유지"로 처리).
export type FaceAnalysisMakeupColorRegion =
  | 'lip'
  | 'blush'
  | 'eyeshadow'
  | 'brow'
  | 'eyeliner';

export type FaceAnalysisMakeupColors = Partial<
  Record<FaceAnalysisMakeupColorRegion, string>
>;

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
// 부위별 근거·인사이트·조언(정본 원칙 완화 2026-07-18: 수치 비노출은 유지하되
// 근거·조언 서술을 담는다). 구버전 보고서는 각 값이 string일 수 있어 어댑터
// 경계에서 {insight, evidence, recommendation}로 승격한다.
export interface FaceAnalysisRegionNote {
  insight: string;
  evidence: string;
  recommendation: string;
}

export interface FaceAnalysisRegionNotes {
  upper: FaceAnalysisRegionNote;
  mid: FaceAnalysisRegionNote;
  lower: FaceAnalysisRegionNote;
  jaw: FaceAnalysisRegionNote;
}

export interface FaceAnalysisImpressionNotes {
  overallMood: string;
  keywords: string[];
  paragraph: string;
  axes?: {key: string; leftLabel: string; rightLabel: string; value: number}[];
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

export interface FaceAnalysisSkinAspect {
  label: string;
  description: string;
}

// 구조화 피부 상세 9부면 — 서버 skinPerception 대응.
export type FaceAnalysisSkinPerceptionAspect =
  | 'texture'
  | 'pores'
  | 'sebumDryness'
  | 'shineDistribution'
  | 'shineType'
  | 'pigmentation'
  | 'redness'
  | 'darkCircles'
  | 'toneUniformity';

export type FaceAnalysisSkinPerception = Record<
  FaceAnalysisSkinPerceptionAspect,
  FaceAnalysisSkinAspect
>;

export interface FaceAnalysisContentStatus {
  coreReadyAt?: string;
  narrativeStatus?: string;
  stylingStatus?: string;
  sources?: {
    core?: 'llm' | 'template';
    narrative?: 'llm' | 'template';
    styling?: 'llm' | 'template';
  };
}

// 사진 판정(VLM) 특징 부면 원본 — 순수 계약(shared/contracts/faceFeatureProfile)에
// 정의하고 여기서 재수출한다. 계약을 RN 무의존으로 유지해 밴드 판정·프로파일 빌더
// (계약 러너가 plain node로 실행)가 이 파일의 react-native 의존을 끌지 않게 한다.
import type {FaceFeatureObservations} from '../contracts/faceFeatureProfile';

export type {
  FaceFeatureObservationRaw,
  FaceFeatureObservationKey,
  FaceFeatureObservations,
} from '../contracts/faceFeatureProfile';

export interface FaceAnalysisReport {
  id: string;
  title: string;
  reportTitle: string;
  createdAt?: string;
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
  // 부위별 hex(퍼스널 컬러 근거) — AR 필터 색 개인화 소스. 구버전 보고서엔 없음.
  makeupColors?: FaceAnalysisMakeupColors;
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
  skinPerception?: FaceAnalysisSkinPerception;
  contentRevision?: number;
  contentStatus?: FaceAnalysisContentStatus;
  // 사진 판정(VLM) 특징 부면 — 이 필드 추가 이전 보고서에는 없다(어댑터가 부재를
  // 생략으로 처리). 1층 프로파일 VLM 슬롯의 소스.
  featureObservations?: FaceFeatureObservations;
  // TrueDepth 촬영에서 실제 ARKit 얼굴 메시를 저장한 선택 자산. 출시 전 보고서나
  // 생성·업로드 실패 보고서는 undefined이며, UI는 해당 카드 전체를 숨긴다.
  goldenMask?: GoldenMaskReportDescriptor;
}
