// facePoseGates 단일 소스 계약 테스트.
//
// (a) 구조 불변식: 실시간 게이트는 어느 축도 사후 게이트보다 헐거울 수 없다.
//     이 불변식이 깨지면 "촬영은 되는데 분석에서 pose_gate_failed 로 폐기"
//     구간이 부활한다 (종전 yaw 8<θ≤10 / roll 5<θ≤8 / pitch 8<θ≤12 사고).
// (b) 기능 교차 검증: 각도를 0.25° 스텝으로 스윕하며 "실시간(face_analysis
//     프로파일) 통과 각도는 사후 품질 게이트도 반드시 통과"를 실제 게이트
//     함수로 확인한다 — 상수 하드코딩이 어느 한쪽에 재유입되면 여기서 잡힌다.

import {
  POST_CAPTURE_POSE_GATE,
  REALTIME_DEFAULT_POSE_GATE,
  REALTIME_FACE_ANALYSIS_POSE_GATE,
  REALTIME_POSE_JITTER_MARGIN_DEG,
  ROLL_CORRECTION_MAX_ABS_DEG,
} from './facePoseGates';
import {evaluateFaceCaptureGreenlight} from '../services/faceCaptureGreenlight';
import {evaluateFacePitchGate} from '../services/faceCapturePitchGate';
import {evaluateFaceVerticalThirdsQuality} from '../../face-ratio/services/faceVerticalThirdsQualityGate';
import type {
  NativeFaceRatioAnalyzeResult,
  VerticalThirdsKeypoint,
  VerticalThirdsKeypointMap,
} from '../../face-ratio/types';

function expect(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

// ── (a) 구조 불변식 ─────────────────────────────────────────────────────

expect(
  REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsYawDeg <= POST_CAPTURE_POSE_GATE.maxAbsYawDeg,
  `실시간 yaw(${REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsYawDeg})가 사후(${POST_CAPTURE_POSE_GATE.maxAbsYawDeg})보다 헐겁다`,
);
expect(
  REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsPitchDeg <= POST_CAPTURE_POSE_GATE.maxAbsPitchDeg,
  `실시간 pitch(${REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsPitchDeg})가 사후(${POST_CAPTURE_POSE_GATE.maxAbsPitchDeg})보다 헐겁다`,
);
expect(
  REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsRollDeg <= POST_CAPTURE_POSE_GATE.maxAbsRollDeg,
  `실시간 roll(${REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsRollDeg})이 사후(${POST_CAPTURE_POSE_GATE.maxAbsRollDeg})보다 헐겁다`,
);
expect(
  ROLL_CORRECTION_MAX_ABS_DEG === POST_CAPTURE_POSE_GATE.maxAbsRollDeg,
  '롤 보정 한계는 사후 roll 게이트와 같은 값이어야 한다 (5° 초과는 보정 불가라는 품질 근거)',
);
expect(
  REALTIME_POSE_JITTER_MARGIN_DEG >= 0,
  '지터 마진은 음수가 될 수 없다 (음수 = 실시간이 사후보다 헐거워짐)',
);
// 사후 게이트가 없는 촬영 타입의 완화 프로파일은 pitch 를 검사하지 않는다는
// 계약 자체를 고정 (실수로 pitch 를 켜면 personal_color 촬영 UX 가 악화됨).
expect(
  REALTIME_DEFAULT_POSE_GATE.maxAbsPitchDeg === null,
  '기본(비 face_analysis) 프로파일은 pitch 를 검사하지 않아야 한다',
);

// ── (b) 기능 교차 검증: 실시간 통과 ⇒ 사후 통과 ────────────────────────

// 실시간 게이트: 정렬·거리·안정 조건은 전부 통과하도록 고정하고 pose 만 스윕.
function realtimePasses(yawDeg: number, pitchDeg: number, rollDeg: number): boolean {
  const report = evaluateFaceCaptureGreenlight({
    cameraStability: {
      isStable: true,
      stableDurationMs: 900,
      stableThresholdMs: 400,
      status: 'ok',
    },
    guide: {centerX: 180, centerY: 360, height: 420, width: 280},
    mediaPipe: {
      faceWidthRatio: 0.46,
      landmarks: {},
      pitchDeg,
      rollDeg,
      screenLandmarks: {
        chin: {left: 181, top: 540},
        forehead: {left: 178, top: 180},
        noseBridge: {left: 180, top: 300},
        noseTip: {left: 182, top: 380},
      },
      status: 'ok',
      yawDeg,
    },
    poseGate: REALTIME_FACE_ANALYSIS_POSE_GATE,
  });
  const pitchGate = evaluateFacePitchGate(pitchDeg);

  return report.finalCaptureGreenlight && pitchGate.pitchOk;
}

// 사후 게이트: 얼굴 1개·키포인트 유효 조건은 고정하고 pose 만 스윕.
function keypoint(y: number): VerticalThirdsKeypoint {
  return {confidence: 0.9, method: 'test', provider: 'mediapipe', x: 100, y};
}

function postCapturePasses(yawDeg: number, pitchDeg: number, rollDeg: number): boolean {
  const nativeResult: NativeFaceRatioAnalyzeResult = {
    faceCount: 1,
    pose: {pitchDeg, poseSource: 'matrix', rollDeg, yawDeg},
    status: 'ok',
  };
  const keypoints: VerticalThirdsKeypointMap = {
    G: keypoint(200),
    H: keypoint(100),
    Me: keypoint(500),
    Sn: keypoint(350),
  };

  return evaluateFaceVerticalThirdsQuality(nativeResult, keypoints).quality.usable;
}

const STEP = 0.25;
const SWEEP_MAX = 12;
let checkedAngles = 0;

for (let angle = 0; angle <= SWEEP_MAX + 1e-9; angle += STEP) {
  for (const sign of [1, -1]) {
    const value = sign * angle;

    // 각 축을 독립적으로 스윕 (다른 두 축은 0°)
    const axes: Array<[string, number, number, number]> = [
      ['yaw', value, 0, 0],
      ['pitch', 0, value, 0],
      ['roll', 0, 0, value],
    ];

    for (const [axis, yaw, pitch, roll] of axes) {
      if (realtimePasses(yaw, pitch, roll)) {
        expect(
          postCapturePasses(yaw, pitch, roll),
          `${axis}=${value}° 가 실시간 게이트는 통과했는데 사후 게이트에서 폐기된다 — ` +
            '실시간/사후 임계값 드리프트 (facePoseGates 단일 소스를 우회한 하드코딩이 있는지 확인)',
        );
        checkedAngles += 1;
      }
    }
  }
}

// 스윕이 실제로 유효 표본을 검사했는지 (게이트 함수 시그니처가 바뀌어 전부
// 실패-통과로 새는 퇴화 방지)
expect(
  checkedAngles > 100,
  `스윕 표본이 비정상적으로 적다(${checkedAngles}) — realtimePasses 픽스처가 pose 외 조건에서 실패 중인지 확인`,
);

// 비유한(NaN/Infinity) pose: 실시간이 통과시키면(결측 취급) 사후도 통과해야 한다.
// NaN 은 realtime greenlight(`?? 0` 미차단)·pitch gate(Number.isFinite)를 통과하는데,
// 사후 게이트가 NaN 을 차단하면 폐기 구간이 다시 열린다(회귀 방지 회로).
for (const badValue of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  const label = Number.isNaN(badValue) ? 'NaN' : String(badValue);
  for (const [axis, yaw, pitch, roll] of [
    ['yaw', badValue, 0, 0],
    ['pitch', 0, badValue, 0],
    ['roll', 0, 0, badValue],
  ] as Array<[string, number, number, number]>) {
    if (realtimePasses(yaw, pitch, roll)) {
      expect(
        postCapturePasses(yaw, pitch, roll),
        `비유한 ${axis}=${label} 가 실시간을 통과했는데 사후 게이트에서 폐기된다 (NaN 결측 취급 불일치)`,
      );
    }
  }
}

// 경계 확인: 사후 한계 초과 각도는 실시간에서도 반드시 차단
expect(
  !realtimePasses(POST_CAPTURE_POSE_GATE.maxAbsYawDeg + 0.5, 0, 0),
  '사후 yaw 한계 초과가 실시간을 통과한다',
);
expect(
  !realtimePasses(0, POST_CAPTURE_POSE_GATE.maxAbsPitchDeg + 0.5, 0),
  '사후 pitch 한계 초과가 실시간을 통과한다',
);
expect(
  !realtimePasses(0, 0, POST_CAPTURE_POSE_GATE.maxAbsRollDeg + 0.5),
  '사후 roll 한계 초과가 실시간을 통과한다',
);

console.log(
  `facePoseGates tests passed (sweep ${checkedAngles} samples, ` +
    `realtime ${REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsYawDeg}/${REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsPitchDeg}/${REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsRollDeg} ≤ ` +
    `post ${POST_CAPTURE_POSE_GATE.maxAbsYawDeg}/${POST_CAPTURE_POSE_GATE.maxAbsPitchDeg}/${POST_CAPTURE_POSE_GATE.maxAbsRollDeg})`,
);
