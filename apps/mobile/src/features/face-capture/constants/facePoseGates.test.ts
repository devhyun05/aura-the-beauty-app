// facePoseGates 단일 소스 계약 테스트.
//
// (a) 구조 불변식: 실시간 게이트는 어느 축도 사후 게이트보다 헐거울 수 없다.
// (b) 기능 교차 검증: 각 축을 0.25° 스텝으로 스윕하며 "실시간(face_analysis
//     프로파일) 통과 각도는 사후 품질 게이트도 통과"를 실제 게이트로 확인.
// (c) fail-closed: pose 를 못 재면(NaN/Infinity/결측/poseSource unavailable)
//     실시간·사후 모두 차단해야 한다("기울기 못 재면 재촬영" 정책, 코덱스 F10).
//
// 주의: 실시간(Vision pose)과 사후(homuler matrix pose)는 서로 다른 추정기라,
// 유효 pose 라도 지터 마진(REALTIME_POSE_JITTER_MARGIN_DEG)만큼 실시간이 더 엄격.

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
  NativeFaceRatioPose,
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
  (REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsPitchDeg ?? 0) <= POST_CAPTURE_POSE_GATE.maxAbsPitchDeg,
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
expect(
  REALTIME_DEFAULT_POSE_GATE.maxAbsPitchDeg === null && REALTIME_DEFAULT_POSE_GATE.requireValidPose === false,
  '기본(비 face_analysis) 프로파일은 pitch 미검사 + fail-open(재촬영 강요 안 함)이어야 한다',
);
expect(
  REALTIME_FACE_ANALYSIS_POSE_GATE.requireValidPose === true,
  'face_analysis 프로파일은 pose 결측 시 fail-closed(재촬영)여야 한다',
);

// ── (b) 기능 교차 검증: 실시간 통과 ⇒ 사후 통과 ────────────────────────

// 유효 pose(poseSource='vision')를 명시한다 — requireValidPose 하에서 결측 취급을
// 피하고 순수 각도 범위만 스윕하기 위함. pitch 게이트도 production 과 동일하게
// requireValid=true 로 호출.
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
      poseSource: 'vision',
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
  const pitchGate = evaluateFacePitchGate(pitchDeg, undefined, true);

  return report.finalCaptureGreenlight && pitchGate.pitchOk;
}

function keypoint(y: number): VerticalThirdsKeypoint {
  return {confidence: 0.9, method: 'test', provider: 'mediapipe', x: 100, y};
}

function postCapturePasses(
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number,
  poseSource: NativeFaceRatioPose['poseSource'] = 'matrix',
  omitPose = false,
): boolean {
  const nativeResult: NativeFaceRatioAnalyzeResult = {
    faceCount: 1,
    pose: omitPose ? undefined : {pitchDeg, poseSource, rollDeg, yawDeg},
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
const perAxisChecked: Record<string, number> = {yaw: 0, pitch: 0, roll: 0};

for (let angle = 0; angle <= SWEEP_MAX + 1e-9; angle += STEP) {
  for (const sign of [1, -1]) {
    const value = sign * angle;
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
        perAxisChecked[axis] += 1;
      }
    }
  }
}

// 축별로 유효 표본을 실제 검사했는지 — 총합만 보면 한 축이 완전히 퇴화(전부 차단)
// 해도 나머지 두 축 표본으로 초록불이 된다(코덱스 minor). 각 축 독립 검증.
for (const axis of ['yaw', 'pitch', 'roll']) {
  expect(
    perAxisChecked[axis] >= 20,
    `${axis} 축의 실시간-통과 표본이 비정상적으로 적다(${perAxisChecked[axis]}) — 이 축 게이트가 퇴화했는지 확인`,
  );
}

// ── 경계 포함성: 실시간 ±limit 는 통과, 그 너머는 차단 ──────────────────
expect(realtimePasses(REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsYawDeg, 0, 0), '실시간 yaw =limit 는 통과해야 한다');
expect(!realtimePasses(REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsYawDeg + 0.01, 0, 0), '실시간 yaw >limit 는 차단');
expect(realtimePasses(0, 0, REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsRollDeg), '실시간 roll =limit 는 통과해야 한다');
expect(!realtimePasses(0, 0, REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsRollDeg + 0.01), '실시간 roll >limit 는 차단');
// 사후 한계 초과는 실시간에서도 반드시 차단
expect(!realtimePasses(POST_CAPTURE_POSE_GATE.maxAbsYawDeg + 0.5, 0, 0), '사후 yaw 한계 초과가 실시간을 통과한다');
expect(!realtimePasses(0, POST_CAPTURE_POSE_GATE.maxAbsPitchDeg + 0.5, 0), '사후 pitch 한계 초과가 실시간을 통과한다');
expect(!realtimePasses(0, 0, POST_CAPTURE_POSE_GATE.maxAbsRollDeg + 0.5), '사후 roll 한계 초과가 실시간을 통과한다');

// ── (c) fail-closed: pose 를 못 재면 실시간·사후 모두 차단 ──────────────
for (const badValue of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  const label = Number.isNaN(badValue) ? 'NaN' : String(badValue);
  for (const [axis, yaw, pitch, roll] of [
    ['yaw', badValue, 0, 0],
    ['pitch', 0, badValue, 0],
    ['roll', 0, 0, badValue],
  ] as Array<[string, number, number, number]>) {
    expect(
      !realtimePasses(yaw, pitch, roll),
      `비유한 ${axis}=${label} 가 실시간을 통과했다 — face_analysis 는 fail-closed 여야 한다`,
    );
    expect(
      !postCapturePasses(yaw, pitch, roll),
      `비유한 ${axis}=${label} 가 사후를 통과했다 — 0/0/0 fail-open 방지`,
    );
  }
}

// poseSource='unavailable'(→ 0/0/0) 와 pose 결측: 사후는 반드시 차단.
expect(
  !postCapturePasses(0, 0, 0, 'unavailable'),
  "poseSource='unavailable' 의 0/0/0 이 '완벽 정면'으로 통과했다 (fail-open)",
);
expect(
  !postCapturePasses(0, 0, 0, 'matrix', /* omitPose */ true),
  'pose 결측이 사후를 통과했다',
);

console.log(
  `facePoseGates tests passed (per-axis ${perAxisChecked.yaw}/${perAxisChecked.pitch}/${perAxisChecked.roll}, ` +
    `realtime ${REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsYawDeg}/${REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsPitchDeg}/${REALTIME_FACE_ANALYSIS_POSE_GATE.maxAbsRollDeg} ≤ ` +
    `post ${POST_CAPTURE_POSE_GATE.maxAbsYawDeg}/${POST_CAPTURE_POSE_GATE.maxAbsPitchDeg}/${POST_CAPTURE_POSE_GATE.maxAbsRollDeg}, margin ${REALTIME_POSE_JITTER_MARGIN_DEG})`,
);
