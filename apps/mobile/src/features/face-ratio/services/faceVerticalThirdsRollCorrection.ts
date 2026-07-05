import type {
  FaceVerticalThirdsPostCorrection,
  VerticalThirdsKeypointMap,
} from '../types';

// 촬영 후 roll(카메라 좌우 기울기) 좌표 보정.
// ARKit 취소로 FaceAnchor roll이 없어, 분석기가 facial transform matrix에서 계산한
// MediaPipe pose.rollDeg를 사용한다. 촬영 사진 좌표계에서 얼굴을 수평으로 되돌려
// H/G/Sn/Me 세로 비율이 좌우 기울기에 흔들리지 않게 한다.
//
// 눈 라인 기반 보정은 하지 않는다 — 사람마다 실제 양쪽 눈 높이가 달라, 눈 라인으로
// 보정하면 실제 비대칭을 카메라 기울기로 오해한다 (기획 §5.2).

export type RotatablePoint = {
  x: number;
  y: number;
};

// gate/quality gate roll 한계(±5°)와 맞춘다. 초과분은 보정으로 살리지 않는다.
export const ROLL_CORRECTION_MAX_ABS_DEG = 5;

export function rotatePointAroundCenter(
  point: RotatablePoint,
  angleDeg: number,
  center: RotatablePoint,
): RotatablePoint {
  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function rotateLandmarksAroundPoint<T extends RotatablePoint>({
  landmarks,
  angleDeg,
  center,
}: {
  landmarks: readonly T[];
  angleDeg: number;
  center: RotatablePoint;
}): T[] {
  return landmarks.map(landmark => {
    const rotated = rotatePointAroundCenter(landmark, angleDeg, center);

    return {
      ...landmark,
      x: Number(rotated.x.toFixed(2)),
      y: Number(rotated.y.toFixed(2)),
    };
  });
}

export type RollCorrectionOutcome = FaceVerticalThirdsPostCorrection;

// H/G/Sn/Me px 키포인트 전체에 roll 보정을 적용한다 (H 포함 — 비율 계산에 직접 쓰임).
// quality gate/비율 계산 이전에 호출해야 y-순서 검사까지 보정 좌표를 쓴다.
export function applyRollCorrectionToKeypoints({
  imageHeight,
  imageWidth,
  keypoints,
  rollDeg,
}: {
  imageHeight: number;
  imageWidth: number;
  keypoints: VerticalThirdsKeypointMap;
  rollDeg: number | undefined;
}): {keypoints: VerticalThirdsKeypointMap; outcome: RollCorrectionOutcome} {
  const skip = (
    skippedReason: NonNullable<RollCorrectionOutcome['skippedReason']>,
  ): {keypoints: VerticalThirdsKeypointMap; outcome: RollCorrectionOutcome} => ({
    keypoints,
    outcome: {
      applied: false,
      center: null,
      method: 'none',
      rollCorrectionDeg: null,
      skippedReason,
    },
  });

  if (typeof rollDeg !== 'number' || !Number.isFinite(rollDeg)) {
    return skip('roll_unavailable');
  }

  if (Math.abs(rollDeg) > ROLL_CORRECTION_MAX_ABS_DEG) {
    return skip('roll_out_of_range');
  }

  if (imageWidth <= 0 || imageHeight <= 0) {
    return skip('dimension_invalid');
  }

  // roll을 상쇄하는 방향(-rollDeg)으로 이미지 중심 기준 회전.
  // principal point가 없으므로 이미지 기하 중심을 회전 중심으로 쓴다.
  const angleDeg = -rollDeg;
  const center = {x: imageWidth / 2, y: imageHeight / 2};
  const correctedKeypoints: VerticalThirdsKeypointMap = {...keypoints};

  (Object.keys(correctedKeypoints) as Array<keyof VerticalThirdsKeypointMap>).forEach(
    key => {
      const keypoint = correctedKeypoints[key];

      if (!keypoint) {
        return;
      }

      const [rotated] = rotateLandmarksAroundPoint({
        angleDeg,
        center,
        landmarks: [keypoint],
      });
      correctedKeypoints[key] = rotated;
    },
  );

  return {
    keypoints: correctedKeypoints,
    outcome: {
      applied: true,
      center,
      method: 'mediapipe_pose_roll',
      rollCorrectionDeg: Number(angleDeg.toFixed(3)),
    },
  };
}
