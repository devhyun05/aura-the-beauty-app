// 실시간 얼굴 기울기(pitch, 고개 숙임/젖힘) 게이트.
// 얼굴 세로 비율 측정에서 pitch는 상/중/하안부 비율을 가장 크게 왜곡시키는 요인인데,
// 기존 greenlight는 yaw/roll만 검사해 실시간 pitch 피드백이 없었다 (ARKit 각도 gate를
// 전제로 미뤄졌던 부분). ARKit 도입이 취소되어, 네이티브가 이미 매 프레임 보내주는
// MediaPipe `pitchDeg`(facial transform matrix 기반)로 실시간 pitch를 막는다.
//
// 부호 방향(들었나 숙였나)은 기기별 검증이 필요해, 방향별 문구 대신 일반 문구를 쓴다.
//
// 임계값은 facePoseGates 단일 소스에서 온다. 종전 12°는 사후 품질 게이트(8°)보다
// 헐거워 9~12° 구간이 "촬영은 되는데 분석에서 폐기"였다 — 사후와 동치로 강화.

import {REALTIME_FACE_ANALYSIS_POSE_GATE} from '../constants/facePoseGates';

export const FACE_PITCH_GATE_MAX_ABS_DEG =
  REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsPitchDeg;

export const FACE_PITCH_GATE_MESSAGE = '고개를 들거나 숙이지 말고 정면을 봐주세요';

export type FacePitchGateResult = {
  pitchDeg: number | null;
  pitchOk: boolean;
};

export function evaluateFacePitchGate(
  pitchDeg: number | undefined,
  maxAbsDeg: number = FACE_PITCH_GATE_MAX_ABS_DEG,
  // face_analysis 는 "기울기 못 재면 재촬영" 정책이라 결측 pitch 를 차단(fail-closed).
  requireValid = false,
): FacePitchGateResult {
  if (typeof pitchDeg !== 'number' || !Number.isFinite(pitchDeg)) {
    // pitch 값이 없을 때: requireValid 면 차단(pitch 를 확인 못 하면 재촬영),
    // 아니면 통과(사후 게이트가 최종 안전망).
    return {pitchDeg: null, pitchOk: !requireValid};
  }

  return {pitchDeg, pitchOk: Math.abs(pitchDeg) <= maxAbsDeg};
}
