import type {FaceVerticalThirdsResult} from '../types';
import {APPLE_HAIRLINE_FULL_CONFIDENCE} from '../constants';
import {isActualHairlineProvider} from './faceVerticalThirdsHairlineSelection';

type FaceVerticalThirdsAnalysisPayloadBase = {
  confidence: number | null;
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
  status: string;
  statusReason: string | null;
  summary: string;
  title: string;
};

export type FaceVerticalThirdsAnalysisPayload =
  | (FaceVerticalThirdsAnalysisPayloadBase & {
      displayRatio: {
        lower: number;
        middle: number;
        upper: number;
      };
      dominantPart: string | null;
      faceLength: {heightPx: number; ratio: number; widthPx: number} | null;
      hairline: {
        analysisEligible: true;
        confidence: number;
        provider: string;
      };
      measurementMode: 'full_vertical_thirds';
      ratioDetail: {
        lowerNormalized: number | null;
        lowerPx: number;
        middleNormalized: number | null;
        middlePx: number;
        totalPx: number | null;
        upperNormalized: number | null;
        upperPx: number;
        warnings: string[];
      };
    })
  | (FaceVerticalThirdsAnalysisPayloadBase & {
      measurementMode: 'middle_lower_only';
      middleLowerRatio: {
        lower: number;
        lowerPx: number;
        middle: number;
        middlePx: number;
      };
    });

function buildCommonPayload(
  result: FaceVerticalThirdsResult,
): FaceVerticalThirdsAnalysisPayloadBase {
  return {
    confidence: result.verticalThirds?.confidence ?? null,
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
    status: result.status,
    statusReason: result.statusReason ?? null,
    summary:
      result.measurementMode === 'middle_lower_only'
        ? '헤어라인이 충분히 확인되지 않아 중안부와 하안부만 반영했어요.'
        : result.interpretation.summary,
    title: result.interpretation.title,
  };
}

function hasAuthoritativeHairline(result: FaceVerticalThirdsResult): boolean {
  const hairline = result.keypoints.H;

  return Boolean(
    result.measurementMode === 'full_vertical_thirds' &&
      result.hairlineAnalysis.analysisEligible &&
      hairline &&
      isActualHairlineProvider(hairline.provider) &&
      hairline.confidence >= APPLE_HAIRLINE_FULL_CONFIDENCE &&
      result.verticalThirds?.displayRatio.upper !== null &&
      result.verticalThirds?.upperPx !== null,
  );
}

// DB measurements에는 저신뢰 실제 H를 보존할 수 있지만 AI 요약은 권위 있는
// 실제 H만 3분할로 직렬화한다. 그 밖의 결과에는 중안부:하안부 값만 남기며
// hairline/upper/dominantPart/faceLength 키 자체를 만들지 않는다.
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

  const common = buildCommonPayload(result);

  if (!hasAuthoritativeHairline(result)) {
    return {
      ...common,
      measurementMode: 'middle_lower_only',
      middleLowerRatio: {
        lower: result.verticalThirds.displayRatio.lower,
        lowerPx: result.verticalThirds.lowerPx,
        middle: result.verticalThirds.displayRatio.middle,
        middlePx: result.verticalThirds.middlePx,
      },
    };
  }

  const hairline = result.keypoints.H!;
  const upper = result.verticalThirds.displayRatio.upper!;
  const upperPx = result.verticalThirds.upperPx!;

  return {
    ...common,
    displayRatio: {
      lower: result.verticalThirds.displayRatio.lower,
      middle: result.verticalThirds.displayRatio.middle,
      upper,
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
      analysisEligible: true,
      confidence: hairline.confidence,
      provider: hairline.provider,
    },
    measurementMode: 'full_vertical_thirds',
    ratioDetail: {
      lowerNormalized: result.verticalThirds.lowerNormalized,
      lowerPx: result.verticalThirds.lowerPx,
      middleNormalized: result.verticalThirds.middleNormalized,
      middlePx: result.verticalThirds.middlePx,
      totalPx: result.verticalThirds.totalPx,
      upperNormalized: result.verticalThirds.upperNormalized,
      upperPx,
      warnings: result.verticalThirds.warnings,
    },
  };
}
