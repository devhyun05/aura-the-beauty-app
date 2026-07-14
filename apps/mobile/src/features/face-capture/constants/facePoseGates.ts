// 얼굴 pose(yaw/pitch/roll) 게이트 임계값의 단일 소스.
//
// 도입 배경: 실시간 게이트(yaw≤10/roll≤8, pitch≤12)가 사후 품질 게이트
// (yaw≤8/pitch≤8/roll≤5)보다 헐거워, 경계 각도(8<yaw≤10, 5<roll≤8,
// 8<pitch≤12)에서 "촬영은 되는데 분석에서 pose_gate_failed 로 폐기되는"
// 구간이 축마다 존재했다. 임계값이 4개 파일에 하드코딩으로 흩어져 있어
// 한쪽만 조정되는 드리프트도 재발 위험이었다. 이 모듈이 유일한 정의처다.
//
// 정책 (2026-07-13 확정): 사후 게이트가 존재하는 face_analysis 촬영의
// 실시간 게이트는 사후와 "동치"로 맞춘다(마진 0) — 실시간을 통과한 각도는
// 사후 게이트도 반드시 통과한다(경계 포함). 현재 값은 실시간·사후 모두
// yaw 8 / pitch 12 / roll 5 (pitch 12 는 셀피 usability 결정 — 아래 참조).
// 셔터 순간의 지터로 경계 탈락이 잦아지면 REALTIME_POSE_JITTER_MARGIN_DEG
// 하나만 올리면 된다(예: 1 이면 실시간 7/11/4). 불변식 "실시간 ≤ 사후"는
// facePoseGates.test.ts 가 CI 에서 강제하므로 역주행은 커밋될 수 없다.

export type PoseGateLimits = {
  maxAbsYawDeg: number;
  // null = 이 축은 실시간에서 검사하지 않음 (사후 게이트가 없는 촬영 타입에서
  // pitch 를 막을 근거가 없을 때 사용)
  maxAbsPitchDeg: number | null;
  maxAbsRollDeg: number;
  // true = pose 를 못 재면(NaN/Infinity/결측/poseSource unavailable) 통과가 아니라
  // 차단(fail-closed). face_analysis 는 "기울기 못 재면 재촬영"이 사용자 확정
  // 정책이므로 true. 0/0/0(결측 기본값)이 "완벽 정면"으로 오인돼 기울어진 얼굴이
  // 통과하던 fail-open 을 막는다. 사후 pose 게이트가 없는 촬영 타입은 false.
  requireValidPose: boolean;
};

// 사후(촬영된 사진 분석) 게이트 — faceVerticalThirdsQualityGate 가 사용.
// 근거:
// - yaw 8°: 세로 삼등분 비율의 원근 왜곡원. 측정 설계 문서 실측 기준값.
// - roll 5°: 사후 수학 보정(faceVerticalThirdsRollCorrection)이 살릴 수 있는
//   상한과 묶임. 5° 초과는 보정 불가 → 반드시 이 값 유지(12°로 못 올림).
// - pitch 12°(2026-07-13 사용자 결정): 핸드헬드 셀피는 폰을 눈높이보다 낮게 드는
//   게 자연스러워 정면 얼굴도 pitch 가 8°를 쉽게 넘는다(실기기 확인). 8°는 촬영을
//   과하게 막았다. 종전 실시간 12°/사후 8° 조합은 8~12° 촬영을 "셔터는 되고 사후
//   폐기"시키던 문제였는데, 실시간·사후를 둘 다 12°로 통일해 그 조용한 폐기를
//   없앤다. 대가: 8~12° pitch 촬영의 세로비율 정확도가 소폭 하락(cos(12°)=0.978
//   vs 0.990, 비율 추가 왜곡 최악 ~2~4%p → 경계 판정만 가끔 영향). usability 우선
//   결정. (헤어라인 confidence 의 별도 pitch 정규화는 AURAFaceRatioHairline.m 에
//   8°로 남아 있어, 8~12° 촬영은 헤어라인 신뢰도가 낮게 잡힐 수 있음 — 별도 검토.)
export const POST_CAPTURE_POSE_GATE = Object.freeze({
  maxAbsYawDeg: 8,
  maxAbsPitchDeg: 12,
  maxAbsRollDeg: 5,
});

// 지터 마진(°): 실시간 = 사후 − 마진. 0 = 실시간과 사후를 동치로(사용자 확정).
// 실시간(Vision pose)과 사후(homuler matrix pose)는 서로 다른 추정기라 마진 0 이면
// 셔터 순간 지터/추정기 편차로 경계 각도에서 "실시간 통과·사후 경계초과 폐기"가
// 드물게 남을 수 있으나(코덱스 F11), 사용자는 촬영 성공률(usability)을 우선한다.
// 경계 폐기가 잦아지면 이 값만 올리면 된다(불변식 "실시간 ≤ 사후"는 유지).
export const REALTIME_POSE_JITTER_MARGIN_DEG = 0;

// face_analysis(얼굴 분석 보고서) 촬영의 실시간 게이트.
// 사후 게이트에서 파생 — 값을 직접 수정하지 말고 마진을 조정할 것.
// 주석 없이 두어 maxAbsPitchDeg 가 number 로 좁게 추론되게 한다(FACE_PITCH_GATE_MAX_ABS_DEG
// 가 이걸 그대로 쓰므로). PoseGateLimits(maxAbsPitchDeg: number|null)에는 구조적으로 대입 가능.
export const REALTIME_FACE_ANALYSIS_POSE_GATE = Object.freeze({
  maxAbsYawDeg: POST_CAPTURE_POSE_GATE.maxAbsYawDeg - REALTIME_POSE_JITTER_MARGIN_DEG,
  maxAbsPitchDeg:
    POST_CAPTURE_POSE_GATE.maxAbsPitchDeg - REALTIME_POSE_JITTER_MARGIN_DEG,
  maxAbsRollDeg:
    POST_CAPTURE_POSE_GATE.maxAbsRollDeg - REALTIME_POSE_JITTER_MARGIN_DEG,
  requireValidPose: true,
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
  requireValidPose: false,
});

// 롤 보정 한계 = 사후 roll 게이트. "5° 초과는 보정으로 살리지 않는다"는
// 품질 근거에 묶여 있으므로 사후 게이트와 반드시 같은 값이어야 한다.
export const ROLL_CORRECTION_MAX_ABS_DEG = POST_CAPTURE_POSE_GATE.maxAbsRollDeg;
