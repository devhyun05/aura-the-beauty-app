// 실시간 얼굴 기울기(pitch, 고개 숙임/젖힘) 게이트.
// 얼굴 세로 비율 측정에서 pitch는 상/중/하안부 비율을 가장 크게 왜곡시키는 요인인데,
// 기존 greenlight는 yaw/roll만 검사해 실시간 pitch 피드백이 없었다 (ARKit 각도 gate를
// 전제로 미뤄졌던 부분). ARKit 도입이 취소되어, 네이티브가 이미 매 프레임 보내주는
// MediaPipe `pitchDeg`(facial transform matrix 기반)로 실시간 pitch를 막는다.
//
// MediaPipe pitch는 ARKit보다 지터가 크므로 임계값을 넉넉히 둔다. 부호 방향(들었나
// 숙였나)은 기기별 검증이 필요해, 방향별 문구 대신 일반 문구를 쓴다.

export const FACE_PITCH_GATE_MAX_ABS_DEG = 12;

export const FACE_PITCH_GATE_MESSAGE = '고개를 들거나 숙이지 말고 정면을 봐주세요';

export type FacePitchGateResult = {
  pitchDeg: number | null;
  pitchOk: boolean;
};

export function evaluateFacePitchGate(
  pitchDeg: number | undefined,
  maxAbsDeg: number = FACE_PITCH_GATE_MAX_ABS_DEG,
): FacePitchGateResult {
  if (typeof pitchDeg !== 'number' || !Number.isFinite(pitchDeg)) {
    // pitch 값이 없으면(랜드마크 미검출/기하 폴백) 통과시킨다 — 얼굴 미검출 자체는
    // greenlight가 이미 막고, 촬영 후 quality gate(±8°)가 최종 안전망이다.
    return {pitchDeg: null, pitchOk: true};
  }

  return {pitchDeg, pitchOk: Math.abs(pitchDeg) <= maxAbsDeg};
}
