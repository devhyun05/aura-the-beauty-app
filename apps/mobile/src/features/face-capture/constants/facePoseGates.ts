// 얼굴 pose(yaw/pitch/roll) 게이트 임계값의 단일 소스.
//
// 도입 배경: 실시간 게이트(yaw≤10/roll≤8, pitch≤12)가 사후 품질 게이트
// (yaw≤8/pitch≤8/roll≤5)보다 헐거워, 경계 각도(8<yaw≤10, 5<roll≤8,
// 8<pitch≤12)에서 "촬영은 되는데 분석에서 pose_gate_failed 로 폐기되는"
// 구간이 축마다 존재했다. 임계값이 4개 파일에 하드코딩으로 흩어져 있어
// 한쪽만 조정되는 드리프트도 재발 위험이었다. 이 모듈이 유일한 정의처다.
//
// 정책 (2026-07-13 확정): 사후 게이트가 존재하는 face_analysis 촬영의
// 실시간 게이트는 사후와 "동치"로 맞춘다 — 실시간을 통과한 각도는 사후
// 게이트도 반드시 통과한다(경계 포함). 셔터 순간의 지터로 경계 탈락이
// 잦아지면 REALTIME_POSE_JITTER_MARGIN_DEG 하나만 올리면 된다(예: 1이면
// 실시간 7/7/4). 불변식 "실시간 ≤ 사후"는 facePoseGates.test.ts 가 CI 에서
// 강제하므로 실시간이 사후보다 헐거워지는 역주행은 커밋될 수 없다.

export type PoseGateLimits = {
  maxAbsYawDeg: number;
  // null = 이 축은 실시간에서 검사하지 않음 (사후 게이트가 없는 촬영 타입에서
  // pitch 를 막을 근거가 없을 때 사용)
  maxAbsPitchDeg: number | null;
  maxAbsRollDeg: number;
};

// 사후(촬영된 사진 분석) 게이트 — faceVerticalThirdsQualityGate 가 사용.
// 근거: pitch/yaw 는 세로 삼등분 비율의 원근 왜곡원이고(±8° 이내면 비율
// 판정 임계 0.08 을 뒤집지 못함), roll 은 ±5° 까지만 사후 수학 보정으로
// 살릴 수 있다(faceVerticalThirdsRollCorrection). 셋 다 측정 설계 문서의
// 실측 기준값.
export const POST_CAPTURE_POSE_GATE = Object.freeze({
  maxAbsYawDeg: 8,
  maxAbsPitchDeg: 8,
  maxAbsRollDeg: 5,
});

// 지터 마진(°): 실시간 = 사후 − 마진. 0 = 동치(현행 확정값).
export const REALTIME_POSE_JITTER_MARGIN_DEG = 0;

// face_analysis(얼굴 분석 보고서) 촬영의 실시간 게이트.
// 사후 게이트에서 파생 — 값을 직접 수정하지 말고 마진을 조정할 것.
export const REALTIME_FACE_ANALYSIS_POSE_GATE = Object.freeze({
  maxAbsYawDeg: POST_CAPTURE_POSE_GATE.maxAbsYawDeg - REALTIME_POSE_JITTER_MARGIN_DEG,
  maxAbsPitchDeg:
    POST_CAPTURE_POSE_GATE.maxAbsPitchDeg - REALTIME_POSE_JITTER_MARGIN_DEG,
  maxAbsRollDeg:
    POST_CAPTURE_POSE_GATE.maxAbsRollDeg - REALTIME_POSE_JITTER_MARGIN_DEG,
});

// personal_color / hair_analysis 등 사후 pose 게이트가 없는 촬영 타입의
// 실시간 게이트 — 폐기 리스크가 없으므로 종전 UX(완화값)를 유지한다.
// (퍼스널컬러 품질은 조명 게이트 colorLightingGreenlight 와 노출 게이트
// personalColorQualityGate 가 담당하고, pose 신뢰도는 엔진의
// measurementConfidence 로 흡수된다.)
export const REALTIME_DEFAULT_POSE_GATE: PoseGateLimits = Object.freeze({
  maxAbsYawDeg: 10,
  maxAbsPitchDeg: null,
  maxAbsRollDeg: 8,
});

// 롤 보정 한계 = 사후 roll 게이트. "5° 초과는 보정으로 살리지 않는다"는
// 품질 근거에 묶여 있으므로 사후 게이트와 반드시 같은 값이어야 한다.
export const ROLL_CORRECTION_MAX_ABS_DEG = POST_CAPTURE_POSE_GATE.maxAbsRollDeg;
