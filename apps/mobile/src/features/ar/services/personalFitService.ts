// 분석 보고서 → AR 개인 핏 기저 델타 조립. AR맞춤핏 계약 v0.2의 데이터 흐름
// ②매핑 엔진(순수) 부분과 ⑤적용(applyFitToLayers baseDeltas 합류) 사이를 잇는다.
//
// buildPersonalFitBaseDeltas는 순수(RN·네트워크 무관 — 계약 러너 실행 가능).
// 입력을 FaceAnalysisReport 전체가 아니라 필요한 필드만의 구조적 타입으로 받아
// RN(ImageSourcePropType) 전이 의존이 계약 러너로 새지 않게 한다.
//
// 안전: deriveFitDeltas의 deltaScale 기본 0(자동 적용 OFF) — 배선돼도 렌더는
// 무변화(no-op). 실기기 슬라이더 실험으로 축별 δ 승인 후 PERSONAL_FIT_DELTA_SCALE을
// 올려 켠다(계약 D-4/D-5). 수동(manual) 핏이 항상 이기는 규칙은 applyFitToLayers의
// 우선순위(개인 시트·핏체인 > 기저 baseDeltas)가 이미 보장한다.

import type {FaceGeometryMetrics} from '../../face-geometry/types';
import type {FaceFeatureObservations} from '../../../shared/contracts/faceFeatureProfile';
import {toFitEntries, type StyleLane} from '../../../shared/contracts/personalFitProfile';
import {buildFaceFeatureProfile} from '../../face-analysis/services/faceFeatureProfileBuilder';
import {deriveFitDeltas} from './deriveFitDeltas';

// 자동 적용 스케일(전역 게이트). 0 = OFF(구조만 흐르고 δ=0 → 렌더 무변화).
// 실기기 시각 검증 통과 후에만 0보다 크게 — 계약 D-5.
export const PERSONAL_FIT_DELTA_SCALE = 0;

// FaceAnalysisReport의 구조적 부분집합(RN 무의존) — 실제 report가 그대로 할당된다.
export type PersonalFitReportInput = {
  id: string;
  analyzedAt: string;
  faceShape?: string | null;
  featureObservations?: FaceFeatureObservations;
  faceAnalysisV2?: {derived: {faceShape?: {label: string}}} | undefined;
  measurements?: {
    faceGeometry2d?: {metrics: FaceGeometryMetrics};
    faceVerticalThirds?: {
      verticalThirds?: {
        displayRatio: {upper: number | null; middle: number; lower: number};
      };
    };
  };
};

// baseDeltas 모양(스텐실 FitEntry 부분집합) — region 문자열이 잎 region과 일치할
// 때만 소비되므로 미지의 region은 자연스럽게 무시된다.
export type PersonalFitBaseDelta = {region: string; rules: Record<string, number>};

/**
 * 보고서 → 프로파일 → 핏 델타(순수). 근거 없으면 빈 배열 — AR을 절대 깨지 않는다.
 */
export function buildPersonalFitBaseDeltas(
  report: PersonalFitReportInput | null,
  styleLane: StyleLane = 'balance',
  deltaScale: number = PERSONAL_FIT_DELTA_SCALE,
): PersonalFitBaseDelta[] {
  if (!report) return [];
  const displayRatio = report.measurements?.faceVerticalThirds?.verticalThirds?.displayRatio;
  const profile = buildFaceFeatureProfile({
    metrics: report.measurements?.faceGeometry2d?.metrics ?? null,
    verticalThirds: displayRatio
      ? {upper: displayRatio.upper, middle: displayRatio.middle, lower: displayRatio.lower}
      : null,
    faceShapeLabel: report.faceAnalysisV2?.derived.faceShape?.label ?? report.faceShape ?? null,
    observations: report.featureObservations ?? null,
    measuredAt: report.analyzedAt,
    sourceReportId: report.id,
  });
  const fit = deriveFitDeltas(profile, styleLane, {
    deltaScale,
    sourceReportId: report.id,
  });
  return toFitEntries(fit);
}
