import type {
  FaceVerticalThirdsInput,
  FaceVerticalThirdsQuality,
  FaceVerticalThirdsResult,
  NativeFaceRatioHairline,
  NativeFaceRatioAnalyzeResult,
  NativeFaceRatioKeypointKey,
  NativeFaceRatioPoint,
  VerticalThirdsKeypoint,
  VerticalThirdsKeypointMap,
  VerticalThirdsRatio,
} from '../types';
import {analyzeFacePhoto} from './faceRatioAnalyzerNative';
import type {FaceRatioLandmarkInput} from './faceRatioAnalyzerNative';
import {requestFaceLandmarks} from '../../ar/services/unityMakeupBridge';
import {
  getFaceVerticalThirdsResultJsonUri,
  saveHairlineDebugArtifacts,
  saveOverlayImage,
  saveSourceImage,
  writeResultJson,
} from './faceVerticalThirdsArtifacts';
import {
  buildInterpretation,
  calculateVerticalThirdsRatio,
  getAbnormalDisplayRatioWarnings,
} from './faceVerticalThirdsMath';
import {createFaceRatioLogger, type FaceRatioLogger} from './faceVerticalThirdsLogger';
import {evaluateFaceVerticalThirdsQuality} from './faceVerticalThirdsQualityGate';
import {applyRollCorrectionToKeypoints} from './faceVerticalThirdsRollCorrection';
import {
  APPLE_HAIRLINE_FULL_CONFIDENCE,
  APPLE_HAIRLINE_MIN_CONFIDENCE,
  HAIRLINE_TUNING,
  type HairlineSelectionTier,
} from '../constants';

const EMPTY_KEYPOINTS: VerticalThirdsKeypointMap = {
  G: null,
  H: null,
  Me: null,
  Sn: null,
};

const DEFAULT_FAILED_QUALITY: FaceVerticalThirdsQuality = {
  usable: false,
  warnings: [],
};

type KeypointConfig = {
  confidence: number;
  key: keyof VerticalThirdsKeypointMap;
  method: string;
  provider: VerticalThirdsKeypoint['provider'];
};

type HairlineSelection = {
  keypoint: VerticalThirdsKeypoint | null;
  tier: HairlineSelectionTier;
};

const KEYPOINT_CONFIG: Record<NativeFaceRatioKeypointKey, KeypointConfig> = {
  glabella: {
    confidence: 0.82,
    key: 'G',
    method: 'mediapipe_median_glabella_brow_group',
    provider: 'mediapipe',
  },
  hApprox: {
    confidence: 0.4,
    key: 'H',
    method: 'mediapipe_landmark_10_forehead_approx',
    provider: 'mediapipe_forehead_approx',
  },
  menton: {
    confidence: 0.84,
    key: 'Me',
    method: 'mediapipe_bottom_chin_contour_polyline',
    provider: 'mediapipe',
  },
  subnasale: {
    confidence: 0.82,
    key: 'Sn',
    method: 'mediapipe_median_subnasale_group',
    provider: 'mediapipe',
  },
};

async function logEvent(
  logger: FaceRatioLogger,
  event: string,
  payload?: Record<string, unknown>,
) {
  await logger.log(event, payload);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toPixelKeypoint(
  point: NativeFaceRatioPoint | undefined,
  config: KeypointConfig,
  imageWidth: number,
  imageHeight: number,
): VerticalThirdsKeypoint | null {
  if (
    !point ||
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return null;
  }

  return {
    confidence: config.confidence,
    method: config.method,
    provider: config.provider,
    x: Number((point.x * imageWidth).toFixed(2)),
    y: Number((point.y * imageHeight).toFixed(2)),
  };
}

function toAppleHairlineKeypoint(
  hairline: NativeFaceRatioHairline | null | undefined,
  imageWidth: number,
  imageHeight: number,
): VerticalThirdsKeypoint | null {
  if (
    !hairline ||
    typeof hairline.x !== 'number' ||
    typeof hairline.y !== 'number' ||
    !Number.isFinite(hairline.x) ||
    !Number.isFinite(hairline.y) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return null;
  }

  return {
    confidence: Number(hairline.confidence.toFixed(4)),
    method: hairline.method,
    provider: 'apple_semantic_matte',
    x: Number((hairline.x * imageWidth).toFixed(2)),
    y: Number((hairline.y * imageHeight).toFixed(2)),
  };
}

function selectHairlineKeypoint(
  nativeResult: NativeFaceRatioAnalyzeResult,
  approxKeypoint: VerticalThirdsKeypoint | null,
  imageWidth: number,
  imageHeight: number,
): HairlineSelection {
  const appleHairline = nativeResult.hairline;

  if (
    appleHairline?.visible &&
    appleHairline.confidence >= APPLE_HAIRLINE_MIN_CONFIDENCE
  ) {
    const appleKeypoint = toAppleHairlineKeypoint(appleHairline, imageWidth, imageHeight);

    if (!appleKeypoint) {
      return approxKeypoint
        ? {keypoint: approxKeypoint, tier: 'approx'}
        : {keypoint: null, tier: 'none'};
    }

    return {
      keypoint: appleKeypoint,
      tier:
        appleHairline.confidence >= APPLE_HAIRLINE_FULL_CONFIDENCE
          ? 'apple_full'
          : 'apple_low',
    };
  }

  if (approxKeypoint) {
    return {
      keypoint: approxKeypoint,
      tier: 'approx',
    };
  }

  return {
    keypoint: null,
    tier: 'none',
  };
}

function mapNativeKeypoints(
  nativeResult: NativeFaceRatioAnalyzeResult,
  imageWidth: number,
  imageHeight: number,
): VerticalThirdsKeypointMap {
  const keypoints: VerticalThirdsKeypointMap = {...EMPTY_KEYPOINTS};

  (Object.keys(KEYPOINT_CONFIG) as NativeFaceRatioKeypointKey[]).forEach(nativeKey => {
    const config = KEYPOINT_CONFIG[nativeKey];
    keypoints[config.key] = toPixelKeypoint(
      nativeResult.keypoints?.[nativeKey],
      config,
      imageWidth,
      imageHeight,
    );
  });

  return keypoints;
}

// 얼굴 세로/가로 비율: heightPx(H→Me) / widthPx(양 볼 idx234↔454).
// idx234/454는 네이티브가 debugPoints로 넘겨주는 정규화 윤곽점이라 재빌드 없이 사용.
function computeFaceLength(
  nativeResult: NativeFaceRatioAnalyzeResult,
  keypoints: VerticalThirdsKeypointMap,
  imageWidth: number,
): FaceVerticalThirdsResult['faceLength'] {
  const left = nativeResult.debugPoints?.idx234;
  const right = nativeResult.debugPoints?.idx454;
  const H = keypoints.H;
  const Me = keypoints.Me;

  if (
    !left ||
    !right ||
    !H ||
    !Me ||
    imageWidth <= 0 ||
    typeof left.x !== 'number' ||
    typeof right.x !== 'number'
  ) {
    return undefined;
  }

  const widthPx = Math.abs(right.x - left.x) * imageWidth;
  const heightPx = Me.y - H.y;

  if (widthPx <= 0 || heightPx <= 0) {
    return undefined;
  }

  return {
    heightPx: Number(heightPx.toFixed(2)),
    ratio: Number((heightPx / widthPx).toFixed(3)),
    widthPx: Number(widthPx.toFixed(2)),
  };
}

function createResult({
  artifacts,
  faceLength,
  input,
  keypoints,
  postCorrection,
  quality,
  ratio,
  sourceImage,
  status,
  statusReason,
}: {
  artifacts: FaceVerticalThirdsResult['artifacts'];
  faceLength?: FaceVerticalThirdsResult['faceLength'];
  input: FaceVerticalThirdsInput;
  keypoints: VerticalThirdsKeypointMap;
  postCorrection?: FaceVerticalThirdsResult['postCorrection'];
  quality: FaceVerticalThirdsQuality;
  ratio?: VerticalThirdsRatio;
  sourceImage: FaceVerticalThirdsResult['sourceImage'];
  status: FaceVerticalThirdsResult['status'];
  statusReason?: string;
}): FaceVerticalThirdsResult {
  return {
    artifacts,
    captureId: input.captureId,
    createdAt: input.createdAt,
    faceLength,
    interpretation: buildInterpretation(status, ratio),
    keypoints,
    postCorrection,
    quality,
    schemaVersion: 'aura-face-vertical-thirds-v1',
    sessionId: input.sessionId,
    sourceImage,
    status,
    statusReason,
    verticalThirds: ratio,
  };
}

async function writeResultWithPlannedUri(result: FaceVerticalThirdsResult) {
  const plannedResultJsonUri = getFaceVerticalThirdsResultJsonUri(result.sessionId);
  const resultWithUri: FaceVerticalThirdsResult = {
    ...result,
    artifacts: {
      ...result.artifacts,
      resultJsonUri: plannedResultJsonUri ?? undefined,
    },
  };

  await writeResultJson(resultWithUri);

  return resultWithUri;
}

async function persistTerminalResult(
  result: FaceVerticalThirdsResult,
): Promise<FaceVerticalThirdsResult> {
  try {
    return await writeResultWithPlannedUri(result);
  } catch {
    return result;
  }
}

async function createFailedResult({
  input,
  logger,
  message,
  reason,
  sourceImage,
}: {
  input: FaceVerticalThirdsInput;
  logger: FaceRatioLogger;
  message?: string;
  reason: string;
  sourceImage?: FaceVerticalThirdsResult['sourceImage'];
}) {
  const result = createResult({
    artifacts: {
      logJsonlUri: logger.logFileUri ?? undefined,
    },
    input,
    keypoints: EMPTY_KEYPOINTS,
    quality: {
      ...DEFAULT_FAILED_QUALITY,
      warnings: [reason],
    },
    sourceImage: sourceImage ?? {
      height: 0,
      uri: input.imageUri,
      width: 0,
    },
    status: 'failed',
    statusReason: reason,
  });

  await logEvent(logger, 'analysis:failed', {
    message,
    reason,
  });

  return persistTerminalResult(result);
}

export async function analyzeFaceVerticalThirds(
  input: FaceVerticalThirdsInput,
): Promise<FaceVerticalThirdsResult> {
  const logger = createFaceRatioLogger(input.sessionId);

  await logEvent(logger, 'capture:ready', {
    captureId: input.captureId,
    imageUri: input.imageUri,
  });

  let nativeResult: NativeFaceRatioAnalyzeResult;

  try {
    const shouldAnalyzeHairline = input.semanticMattes
      ? input.semanticMattes.hair ||
        input.semanticMattes.skin ||
        input.semanticMattes.requested
      : true;

    // homuler(Unity IMAGE 모드)에서 얼굴 랜드마크를 받아온다. 퍼스널 컬러와 같은
    // 캡처면 브릿지가 요청을 dedup 해 하나의 Unity 검출을 공유한다.
    // 미탑재/타임아웃/에러는 undefined 로 넘겨 네이티브가 unsupported 로 처리
    // → createFailedResult 경로로 흡수된다(업로드/원격 호출 없음).
    // no_face 는 빈 points 로 그대로 전달한다 — 네이티브가 실제 이미지 크기와 함께
    // no_face 를 방출해야 quality gate 의 face_not_detected(재촬영 신호)와
    // sourceImage 크기가 보존된다.
    let landmarks: FaceRatioLandmarkInput | undefined;
    try {
      const detected = await requestFaceLandmarks(input.imageUri);
      await logEvent(logger, 'landmarks:done', {
        source: 'unity-homuler',
        status: detected.status,
        count: detected.landmarks.length,
        error: detected.error ?? null,
      });
      if (detected.status === 'ok' || detected.status === 'no_face') {
        landmarks = {
          points: detected.landmarks,
          imageWidth: detected.imageWidth,
          imageHeight: detected.imageHeight,
          pose: detected.pose,
        };
      }
    } catch (error) {
      await logEvent(logger, 'landmarks:error', {
        message: getErrorMessage(error),
      });
    }

    nativeResult = await analyzeFacePhoto(input.imageUri, {
      hairline: {
        debugArtifacts: input.debugArtifacts,
        enabled: shouldAnalyzeHairline,
        tuning: HAIRLINE_TUNING,
      },
      landmarks,
    });
  } catch (error) {
    return createFailedResult({
      input,
      logger,
      message: getErrorMessage(error),
      reason: 'native_analyzer_failed',
    });
  }

  const imageWidth = nativeResult.imageWidth ?? 0;
  const imageHeight = nativeResult.imageHeight ?? 0;
  const sourceImage = {
    height: imageHeight,
    uri: input.imageUri,
    width: imageWidth,
  };

  await logEvent(logger, 'landmark:ready', {
    faceCount: nativeResult.faceCount,
    imageHeight,
    imageWidth,
    landmarkCount: nativeResult.landmarkCount,
    nativeStatus: nativeResult.status,
  });

  await logEvent(logger, 'matte:ready', {
    captureRequested: input.semanticMattes?.requested ?? null,
    captureHairAvailable: input.semanticMattes?.hair ?? null,
    captureSkinAvailable: input.semanticMattes?.skin ?? null,
    hairAvailable: nativeResult.matte?.hairAvailable ?? false,
    matteHeight: nativeResult.matte?.matteHeight ?? null,
    matteWidth: nativeResult.matte?.matteWidth ?? null,
    provider: 'apple_avsemanticsegmentationmatte',
    skinAvailable: nativeResult.matte?.skinAvailable ?? false,
  });

  if (nativeResult.status === 'unsupported') {
    return createFailedResult({
      input,
      logger,
      message: nativeResult.error,
      reason: 'native_module_unsupported',
      sourceImage,
    });
  }

  const mappedKeypoints = mapNativeKeypoints(nativeResult, imageWidth, imageHeight);
  const hairlineSelection = selectHairlineKeypoint(
    nativeResult,
    mappedKeypoints.H,
    imageWidth,
    imageHeight,
  );
  mappedKeypoints.H = hairlineSelection.keypoint;

  // 촬영 후 roll 좌표 보정 (기획 §5.2) — quality gate/비율 계산 전에 적용해야
  // y-순서 검사까지 보정 좌표를 쓴다. 분석기 pose.rollDeg(MediaPipe) 기반.
  const rollCorrection = applyRollCorrectionToKeypoints({
    imageHeight,
    imageWidth,
    keypoints: mappedKeypoints,
    rollDeg: nativeResult.pose?.rollDeg,
  });

  await logEvent(logger, 'post_correction:applied', {
    applied: rollCorrection.outcome.applied,
    lensCorrectionApplied: false,
    poseCorrectionApplied: false,
    rollCorrectionDeg: rollCorrection.outcome.rollCorrectionDeg,
    rollCorrectionMethod: rollCorrection.outcome.method,
    skippedReason: rollCorrection.outcome.skippedReason ?? null,
    sourceRollDeg: nativeResult.pose?.rollDeg ?? null,
    trueDepthCorrectionApplied: false,
  });

  const qualityGate = evaluateFaceVerticalThirdsQuality(
    nativeResult,
    rollCorrection.keypoints,
  );

  await logEvent(logger, 'quality:gate', {
    reason: qualityGate.statusReason,
    usable: qualityGate.quality.usable,
    warnings: qualityGate.quality.warnings,
    yaw: qualityGate.quality.yaw,
    pitch: qualityGate.quality.pitch,
    roll: qualityGate.quality.roll,
  });

  if (!qualityGate.quality.usable) {
    const result = createResult({
      artifacts: {
        logJsonlUri: logger.logFileUri ?? undefined,
      },
      input,
      keypoints: qualityGate.keypoints,
      postCorrection: rollCorrection.outcome,
      quality: qualityGate.quality,
      sourceImage,
      status: 'blocked',
      statusReason: qualityGate.statusReason,
    });

    await logEvent(logger, 'analysis:blocked', {
      reason: qualityGate.statusReason,
      warnings: qualityGate.quality.warnings,
    });

    return persistTerminalResult(result);
  }

  await logEvent(logger, 'hairline:ready', {
    boundaryStdPx: nativeResult.hairline?.boundaryStdPx ?? null,
    candidateCount: nativeResult.hairline?.candidateCount ?? 0,
    confidence: qualityGate.keypoints.H?.confidence ?? nativeResult.hairline?.confidence ?? null,
    failureReason: nativeResult.hairlineFailureReason ?? null,
    method: qualityGate.keypoints.H?.method ?? nativeResult.hairline?.method ?? null,
    provider: qualityGate.keypoints.H?.provider ?? null,
    selectionTier: hairlineSelection.tier,
    visible: nativeResult.hairline?.visible ?? false,
  });

  await logEvent(logger, 'keypoint:ready', {
    H: qualityGate.keypoints.H
      ? {
          confidence: qualityGate.keypoints.H.confidence,
          method: qualityGate.keypoints.H.method,
          provider: qualityGate.keypoints.H.provider,
          x: qualityGate.keypoints.H.x,
          y: qualityGate.keypoints.H.y,
        }
      : null,
    G: qualityGate.keypoints.G,
    Me: qualityGate.keypoints.Me,
    Sn: qualityGate.keypoints.Sn,
  });

  const ratio = calculateVerticalThirdsRatio(qualityGate.keypoints);
  const abnormalWarnings = getAbnormalDisplayRatioWarnings(ratio);

  await logEvent(logger, 'ratio:computed', {
    displayRatio: ratio.displayRatio,
    lowerPx: ratio.lowerPx,
    middlePx: ratio.middlePx,
    upperPx: ratio.upperPx,
    warnings: [...ratio.warnings, ...abnormalWarnings],
  });

  try {
    const ratioWithWarnings = {
      ...ratio,
      warnings: [...ratio.warnings, ...abnormalWarnings],
    };
    const qualityWithWarnings = {
      ...qualityGate.quality,
      warnings: [...qualityGate.quality.warnings, ...abnormalWarnings],
    };
    const sourceImageUri = await saveSourceImage(input.sessionId, input.imageUri);
    let hairlineDebugArtifacts: FaceVerticalThirdsResult['artifacts'] = {};

    try {
      hairlineDebugArtifacts = await saveHairlineDebugArtifacts(
        input.sessionId,
        nativeResult.debugArtifacts,
      );
    } catch (error) {
      await logEvent(logger, 'hairline:debug-artifacts-failed', {
        message: getErrorMessage(error),
      });
    }

    const isFullSuccess =
      hairlineSelection.tier === 'apple_full' &&
      qualityGate.keypoints.H?.provider === 'apple_semantic_matte';
    const result = createResult({
      artifacts: {
        ...hairlineDebugArtifacts,
        logJsonlUri: logger.logFileUri ?? undefined,
        sourceImageUri,
      },
      faceLength: computeFaceLength(nativeResult, qualityGate.keypoints, imageWidth),
      input,
      keypoints: qualityGate.keypoints,
      postCorrection: rollCorrection.outcome,
      quality: qualityWithWarnings,
      ratio: ratioWithWarnings,
      sourceImage: {
        ...sourceImage,
        uri: sourceImageUri,
      },
      status: isFullSuccess ? 'full_success' : 'partial_success',
    });
    const persistedResult = await writeResultWithPlannedUri(result);

    await logEvent(logger, 'analysis:partial', {
      artifacts: persistedResult.artifacts,
      status: persistedResult.status,
      warnings: persistedResult.quality.warnings,
    });

    return persistedResult;
  } catch (error) {
    return createFailedResult({
      input,
      logger,
      message: getErrorMessage(error),
      reason: 'artifact_write_failed',
      sourceImage,
    });
  }
}

export async function finalizeOverlayArtifact(
  result: FaceVerticalThirdsResult,
  tmpUri: string,
): Promise<FaceVerticalThirdsResult> {
  const logger = createFaceRatioLogger(result.sessionId);

  try {
    const overlayImageUri = await saveOverlayImage(result.sessionId, tmpUri);
    const resultWithOverlay: FaceVerticalThirdsResult = {
      ...result,
      artifacts: {
        ...result.artifacts,
        overlayImageUri,
      },
    };

    const persistedResult = await writeResultWithPlannedUri(resultWithOverlay);

    await logEvent(logger, 'overlay:saved', {
      overlayImageUri,
      resultJsonUri: persistedResult.artifacts.resultJsonUri,
    });

    return persistedResult;
  } catch (error) {
    await logEvent(logger, 'overlay:failed', {
      message: getErrorMessage(error),
    });

    return result;
  }
}
