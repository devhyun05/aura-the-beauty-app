import type {FaceVerticalThirdsResult} from '../types';

// 보고서 작성 AI(requestPayload.faceVerticalThirds)로 보내는 요약.
// 측정 데이터 3-반영 규칙: 해석 가능한 실측 수치는 전부 싣는다 —
// faceLength(세로/가로 비율)·quality(pose)·postCorrection·ratioDetail(px/normalized)·
// statusReason까지. raw keypoint 좌표는 measurements(저장·복원층)가 담당한다.
export type FaceVerticalThirdsAnalysisPayload = {
  confidence: number | null;
  displayRatio: {
    lower: number;
    middle: number;
    upper: number | null;
  };
  dominantPart: string | null;
  // 얼굴 세로/가로 길이 비율(H→Me / 양볼 폭). 클수록 세로로 긴 얼굴.
  faceLength: {heightPx: number; ratio: number; widthPx: number} | null;
  hairline: {
    confidence: number | null;
    provider: string | null;
  };
  postCorrection: {
    applied: boolean;
    method: string;
    rollCorrectionDeg: number | null;
    skippedReason: string | null;
  } | null;
  quality: {
    pitch: number | null;
    roll: number | null;
    usable: boolean;
    warnings: string[];
    yaw: number | null;
  };
  ratioDetail: {
    lowerNormalized: number | null;
    lowerPx: number;
    middleNormalized: number | null;
    middlePx: number;
    totalPx: number | null;
    upperNormalized: number | null;
    upperPx: number | null;
    warnings: string[];
  };
  status: string;
  statusReason: string | null;
  summary: string;
  title: string;
};

export function buildFaceVerticalThirdsAnalysisPayload(
  result: FaceVerticalThirdsResult | null,
): FaceVerticalThirdsAnalysisPayload | undefined {
  if (
    !result ||
    (result.status !== 'full_success' && result.status !== 'partial_success') ||
    !result.verticalThirds
  ) {
    return undefined;
  }

  return {
    confidence: result.verticalThirds.confidence ?? null,
    displayRatio: {
      lower: result.verticalThirds.displayRatio.lower,
      middle: result.verticalThirds.displayRatio.middle,
      upper: result.verticalThirds.displayRatio.upper,
    },
    dominantPart: result.interpretation.dominantPart ?? null,
    faceLength: result.faceLength
      ? {
          heightPx: result.faceLength.heightPx,
          ratio: result.faceLength.ratio,
          widthPx: result.faceLength.widthPx,
        }
      : null,
    hairline: {
      confidence: result.keypoints.H?.confidence ?? null,
      provider: result.keypoints.H?.provider ?? null,
    },
    postCorrection: result.postCorrection
      ? {
          applied: result.postCorrection.applied,
          method: result.postCorrection.method,
          rollCorrectionDeg: result.postCorrection.rollCorrectionDeg,
          skippedReason: result.postCorrection.skippedReason ?? null,
        }
      : null,
    quality: {
      pitch: result.quality.pitch ?? null,
      roll: result.quality.roll ?? null,
      usable: result.quality.usable,
      warnings: result.quality.warnings,
      yaw: result.quality.yaw ?? null,
    },
    ratioDetail: {
      lowerNormalized: result.verticalThirds.lowerNormalized,
      lowerPx: result.verticalThirds.lowerPx,
      middleNormalized: result.verticalThirds.middleNormalized,
      middlePx: result.verticalThirds.middlePx,
      totalPx: result.verticalThirds.totalPx,
      upperNormalized: result.verticalThirds.upperNormalized,
      upperPx: result.verticalThirds.upperPx,
      warnings: result.verticalThirds.warnings,
    },
    status: result.status,
    statusReason: result.statusReason ?? null,
    summary: result.interpretation.summary,
    title: result.interpretation.title,
  };
}
