import type {
  FaceVerticalThirdsInput,
  FaceVerticalThirdsHairlineAnalysis,
  FaceVerticalThirdsMeasurementMode,
  FaceVerticalThirdsQuality,
  FaceVerticalThirdsResult,
  NativeFaceRatioHairline,
  NativeFaceRatioAnalyzeResult,
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
  saveFaceRatioPhase1ReplayArtifact,
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
  FACE_RATIO_JUDGMENT_VERSION,
  HAIRLINE_TUNING,
  judgeFaceLength,
} from '../constants';
import {
  selectHairlineForAnalysis,
  type HairlineCandidate,
} from './faceVerticalThirdsHairlineSelection';
import {
  extractFaceRatioMeasurementGeometry,
  type FaceRatioMeasurementGeometry,
  type FaceRatioStructuralPointKey,
} from './faceRatioLandmarkMeasurement';
import {
  applyFaceRatioPoseTransform,
  isFaceRatioPoseNormalizationEnabled,
  normalizeFaceRatioLandmarks,
  type FaceRatioPoseNormalizationResult,
} from './faceRatioPoseNormalization';

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

// MediaPipe FaceLandmarker는 per-landmark confidence를 제공하지 않는다.
// 이 값들은 기존 제품 호환용 미보정 상수이며 "실측 confidence"가 아니다.
// Phase 1 matrix 경로에서는 임의 residual→confidence 매핑 대신 0으로 강등하고
// paired replay 관문 전까지 diagnostic_only_unvalidated로 보존한다.
const LEGACY_UNCALIBRATED_KEYPOINT_CONFIDENCE = {
  glabella: 0.82,
  menton: 0.84,
  subnasale: 0.82,
} as const;

const KEYPOINT_CONFIG: Record<FaceRatioStructuralPointKey, KeypointConfig> = {
  glabella: {
    confidence: LEGACY_UNCALIBRATED_KEYPOINT_CONFIDENCE.glabella,
    key: 'G',
    method: 'mediapipe_median_glabella_brow_group',
    provider: 'mediapipe',
  },
  menton: {
    confidence: LEGACY_UNCALIBRATED_KEYPOINT_CONFIDENCE.menton,
    key: 'Me',
    method: 'mediapipe_bottom_chin_contour_polyline',
    provider: 'mediapipe',
  },
  subnasale: {
    confidence: LEGACY_UNCALIBRATED_KEYPOINT_CONFIDENCE.subnasale,
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
  confidence = config.confidence,
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
    confidence,
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

function toCapturedHairlineCandidate(
  capturedHairline: FaceVerticalThirdsInput['capturedHairline'],
  imageWidth: number,
  imageHeight: number,
): HairlineCandidate | null {
  if (
    !capturedHairline ||
    !Number.isFinite(capturedHairline.confidence) ||
    !Number.isFinite(capturedHairline.normalizedPoint.x) ||
    !Number.isFinite(capturedHairline.normalizedPoint.y) ||
    capturedHairline.normalizedPoint.x < 0 ||
    capturedHairline.normalizedPoint.x > 1 ||
    capturedHairline.normalizedPoint.y < 0 ||
    capturedHairline.normalizedPoint.y > 1 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return null;
  }

  return {
    analysisEligible: capturedHairline.analysisEligible,
    keypoint: {
      confidence: capturedHairline.confidence,
      method: capturedHairline.method,
      provider: capturedHairline.provider,
      x: Number((capturedHairline.normalizedPoint.x * imageWidth).toFixed(2)),
      y: Number((capturedHairline.normalizedPoint.y * imageHeight).toFixed(2)),
    },
  };
}

function mapNativeKeypoints(
  geometry: FaceRatioMeasurementGeometry,
  imageWidth: number,
  imageHeight: number,
  confidenceOverride?: number,
): VerticalThirdsKeypointMap {
  const keypoints: VerticalThirdsKeypointMap = {...EMPTY_KEYPOINTS};

  (Object.keys(KEYPOINT_CONFIG) as FaceRatioStructuralPointKey[]).forEach(nativeKey => {
    const config = KEYPOINT_CONFIG[nativeKey];

    keypoints[config.key] = toPixelKeypoint(
      geometry.keypoints[nativeKey],
      config,
      imageWidth,
      imageHeight,
      confidenceOverride,
    );
  });

  return keypoints;
}

// 얼굴 세로/가로 비율: heightPx(H→Me) / widthPx(양 볼 idx234↔454).
// idx234/454는 478점 순수 추출 코어의 정규화 윤곽점이다.
function computeFaceLength(
  debugPoints: FaceRatioMeasurementGeometry['debugPoints'],
  keypoints: VerticalThirdsKeypointMap,
  imageWidth: number,
): FaceVerticalThirdsResult['faceLength'] {
  const left = debugPoints.idx234;
  const right = debugPoints.idx454;
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

function toPoseNormalizedHairlineKeypoint({
  imageHeight,
  imageWidth,
  keypoint,
  normalization,
  zProxy,
}: {
  imageHeight: number;
  imageWidth: number;
  keypoint: VerticalThirdsKeypoint | null;
  normalization: FaceRatioPoseNormalizationResult;
  zProxy: number | undefined;
}): VerticalThirdsKeypoint | null {
  if (
    !keypoint ||
    !normalization.outcome.applied ||
    !normalization.transform ||
    typeof zProxy !== 'number' ||
    !Number.isFinite(zProxy) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return null;
  }

  // Hair matte 경계 H는 2D이므로 z를 직접 제공하지 않는다. 같은 이마 표면의
  // MediaPipe idx10 z를 명시적 proxy로 사용하되, 이 가설은 paired replay 관문
  // 대상이며 confidence로 승격하지 않는다.
  const normalized = applyFaceRatioPoseTransform(
    {
      i: -10,
      x: keypoint.x / imageWidth,
      y: keypoint.y / imageHeight,
      z: zProxy,
    },
    normalization.transform,
  );

  return {
    ...keypoint,
    method: `${keypoint.method}_pose_matrix_idx10_z_proxy`,
    x: Number((normalized.x * imageWidth).toFixed(2)),
    y: Number((normalized.y * imageHeight).toFixed(2)),
  };
}

function buildPoseNormalizationPostCorrection(
  normalization: FaceRatioPoseNormalizationResult,
): NonNullable<FaceVerticalThirdsResult['postCorrection']> {
  return {
    applied: normalization.outcome.applied,
    center: normalization.transform
      ? {
          x: Number(normalization.transform.centerPx.x.toFixed(2)),
          y: Number(normalization.transform.centerPx.y.toFixed(2)),
        }
      : null,
    method: normalization.outcome.applied
      ? 'mediapipe_facial_transformation_matrix'
      : 'none',
    poseNormalization: {
      confidencePolicy: normalization.outcome.confidencePolicy,
      diagnostics: normalization.outcome.diagnostics,
      requested: normalization.outcome.requested,
    },
    rollCorrectionDeg: null,
    skippedReason: normalization.outcome.skippedReason,
  };
}

function createResult({
  artifacts,
  faceLength,
  hairlineAnalysis = {
    analysisEligible: false,
    confidence: null,
    outcome: 'omitted',
    provider: null,
  },
  input,
  keypoints,
  measurementMode = 'middle_lower_only',
  postCorrection,
  judgmentIndeterminate = false,
  judgmentPose,
  quality,
  ratio,
  sourceImage,
  status,
  statusReason,
}: {
  artifacts: FaceVerticalThirdsResult['artifacts'];
  faceLength?: FaceVerticalThirdsResult['faceLength'];
  hairlineAnalysis?: FaceVerticalThirdsHairlineAnalysis;
  input: FaceVerticalThirdsInput;
  keypoints: VerticalThirdsKeypointMap;
  measurementMode?: FaceVerticalThirdsMeasurementMode;
  postCorrection?: FaceVerticalThirdsResult['postCorrection'];
  judgmentIndeterminate?: boolean;
  judgmentPose?: {pitch: number; yaw: number};
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
    // 판정 스냅샷(Phase 0-5): 측정 시점 pose로 판정해 결과에 동결한다.
    // 화면·서버는 이 스냅샷을 소비하고, 상수 개정은 judgmentVersion으로 감지.
    faceLengthJudgment: faceLength
      ? (() => {
          const judgment = judgeFaceLength(
            faceLength.ratio,
            judgmentPose?.pitch ?? quality.pitch,
            judgmentPose?.yaw ?? quality.yaw,
          );

          return judgmentIndeterminate
            ? {...judgment, verdict: 'indeterminate' as const}
            : judgment;
        })()
      : undefined,
    hairlineAnalysis,
    interpretation: buildInterpretation(status, ratio),
    judgmentVersion: FACE_RATIO_JUDGMENT_VERSION,
    keypoints,
    measurementMode,
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
  artifacts,
  input,
  logger,
  message,
  reason,
  sourceImage,
}: {
  artifacts?: FaceVerticalThirdsResult['artifacts'];
  input: FaceVerticalThirdsInput;
  logger: FaceRatioLogger;
  message?: string;
  reason: string;
  sourceImage?: FaceVerticalThirdsResult['sourceImage'];
}) {
  const result = createResult({
    artifacts: {
      ...artifacts,
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
  let landmarkInput: FaceRatioLandmarkInput | undefined;
  let poseNormalization: FaceRatioPoseNormalizationResult | null = null;
  let poseNormalizationReplayUri: string | undefined;
  const poseNormalizationEnabled = isFaceRatioPoseNormalizationEnabled();

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
    try {
      const detected = await requestFaceLandmarks(input.imageUri);
      poseNormalization = normalizeFaceRatioLandmarks({
        enabled: poseNormalizationEnabled,
        imageHeight: detected.imageHeight,
        imageWidth: detected.imageWidth,
        matrix: detected.transformationMatrix,
        points: detected.landmarks,
      });
      await logEvent(logger, 'landmarks:done', {
        source: 'unity-homuler',
        status: detected.status,
        count: detected.landmarks.length,
        error: detected.error ?? null,
        transformationMatrixAvailable: Boolean(detected.transformationMatrix),
        poseNormalization: {
          applied: poseNormalization.outcome.applied,
          confidencePolicy: poseNormalization.outcome.confidencePolicy,
          diagnostics: poseNormalization.outcome.diagnostics,
          requested: poseNormalization.outcome.requested,
          skippedReason: poseNormalization.outcome.skippedReason ?? null,
        },
      });
      if (detected.status === 'ok' || detected.status === 'no_face') {
        landmarkInput = {
          points: detected.landmarks,
          imageWidth: detected.imageWidth,
          imageHeight: detected.imageHeight,
          pose: detected.pose,
          ...(detected.transformationMatrix
            ? {transformationMatrix: detected.transformationMatrix}
            : {}),
        };
      }
    } catch (error) {
      await logEvent(logger, 'landmarks:error', {
        message: getErrorMessage(error),
      });
    }

    nativeResult = await analyzeFacePhoto(input.imageUri, {
      hairline: {
        // Phase 1 raw replay에는 matte/debug PNG가 필요하지 않다. 헤어라인 계산은
        // 임베드된 matte buffer에서 끝나므로 validation 세션에서는 네이티브 tmp
        // 파일 생성을 원천 차단한다.
        debugArtifacts: input.validationReplay ? false : input.debugArtifacts,
        enabled: shouldAnalyzeHairline,
        tuning: HAIRLINE_TUNING,
      },
      landmarks: landmarkInput,
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

  const rawGeometry = extractFaceRatioMeasurementGeometry(
    landmarkInput?.points ?? [],
  );
  const measurementGeometry = extractFaceRatioMeasurementGeometry(
    poseNormalization?.outcome.applied
      ? poseNormalization.points
      : (landmarkInput?.points ?? []),
  );
  const rawKeypoints = mapNativeKeypoints(
    rawGeometry,
    imageWidth,
    imageHeight,
  );
  const measurementKeypoints = mapNativeKeypoints(
    measurementGeometry,
    imageWidth,
    imageHeight,
    // residual/jitter→confidence 함수는 아직 검증되지 않았다. 보정 경로에서
    // legacy .82/.82/.84를 "실측값"처럼 유지하지 않고 0으로 강등한다.
    poseNormalization?.outcome.applied ? 0 : undefined,
  );
  const appleKeypoint =
    nativeResult.hairline?.visible
      ? toAppleHairlineKeypoint(nativeResult.hairline, imageWidth, imageHeight)
      : null;
  const hairlineSelection = selectHairlineForAnalysis({
    apple: appleKeypoint
      ? {analysisEligible: true, keypoint: appleKeypoint}
      : null,
    captured: toCapturedHairlineCandidate(
      input.capturedHairline,
      imageWidth,
      imageHeight,
    ),
  });
  rawKeypoints.H = hairlineSelection.keypoint;

  const poseNormalizedHairline =
    poseNormalization?.outcome.applied && poseNormalization.transform
      ? toPoseNormalizedHairlineKeypoint({
          imageHeight,
          imageWidth,
          keypoint: hairlineSelection.keypoint,
          normalization: poseNormalization,
          zProxy: rawGeometry.debugPoints.idx10?.z,
        })
      : null;
  measurementKeypoints.H = poseNormalization?.outcome.applied
    ? poseNormalizedHairline
    : hairlineSelection.keypoint;

  const correction =
    poseNormalization?.outcome.applied
      ? {
          keypoints: measurementKeypoints,
          outcome: buildPoseNormalizationPostCorrection(poseNormalization),
        }
      : applyRollCorrectionToKeypoints({
          imageHeight,
          imageWidth,
          keypoints: rawKeypoints,
          rollDeg: nativeResult.pose?.rollDeg,
        });

  await logEvent(logger, 'post_correction:applied', {
    applied: correction.outcome.applied,
    lensCorrectionApplied: false,
    poseCorrectionApplied:
      correction.outcome.method === 'mediapipe_facial_transformation_matrix',
    poseCorrectionMethod: correction.outcome.method,
    poseNormalization:
      'poseNormalization' in correction.outcome
        ? correction.outcome.poseNormalization
        : null,
    rollCorrectionDeg: correction.outcome.rollCorrectionDeg,
    rollCorrectionMethod: correction.outcome.method,
    skippedReason: correction.outcome.skippedReason ?? null,
    sourceRollDeg: nativeResult.pose?.rollDeg ?? null,
    trueDepthCorrectionApplied: false,
  });

  // validation-only 플래그를 켠 세션에서 행렬/478점이 불완전하면 legacy 결과로
  // 조용히 폴백하지 않는다. paired 비교 입력이 섞이는 것을 막는 fail-closed 정책.
  if (
    poseNormalizationEnabled &&
    nativeResult.status === 'ok' &&
    nativeResult.faceCount > 0 &&
    !poseNormalization?.outcome.applied
  ) {
    const skippedReason =
      poseNormalization?.outcome.skippedReason ?? 'matrix_missing';
    const quality: FaceVerticalThirdsQuality = {
      pitch: nativeResult.pose?.pitchDeg,
      roll: nativeResult.pose?.rollDeg,
      usable: false,
      warnings: [
        'pose_normalization_unavailable',
        `pose_normalization_${skippedReason}`,
      ],
      yaw: nativeResult.pose?.yawDeg,
    };
    const result = createResult({
      artifacts: {
        logJsonlUri: logger.logFileUri ?? undefined,
      },
      input,
      keypoints: rawKeypoints,
      postCorrection: poseNormalization
        ? buildPoseNormalizationPostCorrection(poseNormalization)
        : undefined,
      quality,
      sourceImage,
      status: 'blocked',
      statusReason: 'pose_normalization_unavailable',
    });

    await logEvent(logger, 'analysis:blocked', {
      reason: 'pose_normalization_unavailable',
      skippedReason,
      warnings: quality.warnings,
    });

    return persistTerminalResult(result);
  }

  const blockReplayArtifact = async ({
    message,
    reason,
  }: {
    message?: string;
    reason:
      | 'pose_normalization_artifact_write_failed'
      | 'pose_normalization_replay_metadata_missing';
  }) => {
    const quality: FaceVerticalThirdsQuality = {
      pitch: nativeResult.pose?.pitchDeg,
      roll: nativeResult.pose?.rollDeg,
      usable: false,
      warnings: [reason],
      yaw: nativeResult.pose?.yawDeg,
    };
    const result = createResult({
      artifacts: {
        logJsonlUri: logger.logFileUri ?? undefined,
      },
      input,
      keypoints: rawKeypoints,
      postCorrection: correction.outcome,
      quality,
      sourceImage,
      status: 'blocked',
      statusReason: reason,
    });

    await logEvent(logger, 'analysis:blocked', {
      message,
      reason,
      warnings: quality.warnings,
    });

    return persistTerminalResult(result);
  };
  const replayValidation = input.validationReplay;
  const replayTransformationMatrix = landmarkInput?.transformationMatrix;

  if (
    poseNormalization?.outcome.applied &&
    (!replayValidation || !replayTransformationMatrix)
  ) {
    return blockReplayArtifact({
      reason: 'pose_normalization_replay_metadata_missing',
    });
  }

  const qualityGate = evaluateFaceVerticalThirdsQuality(
    nativeResult,
    correction.keypoints,
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
    const displayKeypoints: VerticalThirdsKeypointMap = {
      ...rawKeypoints,
      H: qualityGate.keypoints.H ? rawKeypoints.H : null,
    };
    const result = createResult({
      artifacts: {
        logJsonlUri: logger.logFileUri ?? undefined,
        poseNormalizationReplayUri,
      },
      input,
      keypoints: displayKeypoints,
      postCorrection: correction.outcome,
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

  const selectedMeasurementHairline = qualityGate.keypoints.H;
  const selectedDisplayHairline = selectedMeasurementHairline
    ? rawKeypoints.H
    : null;
  const hairlineAnalysis: FaceVerticalThirdsHairlineAnalysis =
    selectedDisplayHairline
    ? {
        analysisEligible: hairlineSelection.analysis.analysisEligible,
        confidence: selectedDisplayHairline.confidence,
        outcome: hairlineSelection.analysis.analysisEligible
          ? 'detected_high_confidence'
          : 'detected_low_confidence',
        provider: selectedDisplayHairline.provider,
      }
    : {
        analysisEligible: false,
        confidence: null,
        outcome: 'omitted',
        provider: null,
      };
  const measurementMode: FaceVerticalThirdsMeasurementMode =
    hairlineAnalysis.analysisEligible
      ? 'full_vertical_thirds'
      : 'middle_lower_only';
  const analysisKeypoints: VerticalThirdsKeypointMap = {
    ...qualityGate.keypoints,
    H: hairlineAnalysis.analysisEligible ? selectedMeasurementHairline : null,
  };
  const displayKeypoints: VerticalThirdsKeypointMap = {
    ...rawKeypoints,
    // 실제 H가 저신뢰이면 공식 비율에서는 제외하되 로컬/DB 결과의 원본 픽셀
    // 좌표는 보존한다. pose-normalized 좌표로 덮어쓰지 않는다.
    H: selectedDisplayHairline,
  };

  await logEvent(logger, 'hairline:ready', {
    boundaryStdPx: nativeResult.hairline?.boundaryStdPx ?? null,
    candidateCount: nativeResult.hairline?.candidateCount ?? 0,
    confidence:
      selectedDisplayHairline?.confidence ??
      nativeResult.hairline?.confidence ??
      null,
    failureReason: nativeResult.hairlineFailureReason ?? null,
    method: qualityGate.keypoints.H?.method ?? nativeResult.hairline?.method ?? null,
    provider: qualityGate.keypoints.H?.provider ?? null,
    analysisEligible: hairlineAnalysis.analysisEligible,
    outcome: hairlineAnalysis.outcome,
    visible: nativeResult.hairline?.visible ?? false,
  });

  await logEvent(logger, 'keypoint:ready', {
    H: displayKeypoints.H
      ? {
          confidence: displayKeypoints.H.confidence,
          method: displayKeypoints.H.method,
          provider: displayKeypoints.H.provider,
          x: displayKeypoints.H.x,
          y: displayKeypoints.H.y,
        }
      : null,
    G: displayKeypoints.G,
    Me: displayKeypoints.Me,
    Sn: displayKeypoints.Sn,
    measurementFrame:
      poseNormalization?.outcome.applied
        ? {
            G: qualityGate.keypoints.G,
            H: qualityGate.keypoints.H,
            Me: qualityGate.keypoints.Me,
            Sn: qualityGate.keypoints.Sn,
          }
        : null,
  });

  const ratio = calculateVerticalThirdsRatio(analysisKeypoints);
  const abnormalWarnings = getAbnormalDisplayRatioWarnings(ratio);
  const normalizationWarnings = poseNormalization?.outcome.applied
    ? ['pose_normalization_confidence_unvalidated']
    : [];
  const faceLength = computeFaceLength(
    measurementGeometry.debugPoints,
    analysisKeypoints,
    imageWidth,
  );

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
      warnings: [
        ...ratio.warnings,
        ...abnormalWarnings,
        ...normalizationWarnings,
      ],
    };
    const qualityWithWarnings = {
      ...qualityGate.quality,
      warnings: [
        ...qualityGate.quality.warnings,
        ...abnormalWarnings,
        ...normalizationWarnings,
      ],
    };
    // Phase 1 raw replay는 전용 retention root만 사용한다. 일반 결과 디렉터리에
    // 원본 셀피나 matte/debug 이미지를 추가 복사하면 7일 삭제 경계를 우회한다.
    const sourceImageUri = input.validationReplay
      ? input.imageUri
      : await saveSourceImage(input.sessionId, input.imageUri);
    let hairlineDebugArtifacts: FaceVerticalThirdsResult['artifacts'] = {};

    if (!input.validationReplay) {
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
    }

    let result = createResult({
      artifacts: {
        ...hairlineDebugArtifacts,
        logJsonlUri: logger.logFileUri ?? undefined,
        poseNormalizationReplayUri,
        sourceImageUri,
      },
      faceLength,
      hairlineAnalysis,
      input,
      judgmentIndeterminate: Boolean(poseNormalization?.outcome.applied),
      judgmentPose: poseNormalization?.outcome.applied
        ? {pitch: 0, yaw: 0}
        : undefined,
      keypoints: displayKeypoints,
      measurementMode,
      postCorrection: correction.outcome,
      quality: qualityWithWarnings,
      ratio: ratioWithWarnings,
      sourceImage: {
        ...sourceImage,
        uri: sourceImageUri,
      },
      status:
        measurementMode === 'full_vertical_thirds'
          ? 'full_success'
          : 'partial_success',
    });

    // 실패/partial 촬영은 같은 captureId로 재시도할 수 있어야 한다. 따라서 raw
    // append는 quality gate를 통과하고 full 결과와 faceLength가 모두 완성된
    // terminal result가 구성된 뒤에만 수행한다.
    if (
      poseNormalization?.outcome.applied &&
      qualityGate.quality.usable &&
      measurementMode === 'full_vertical_thirds' &&
      faceLength &&
      replayValidation &&
      replayTransformationMatrix
    ) {
      try {
        poseNormalizationReplayUri =
          await saveFaceRatioPhase1ReplayArtifact({
            capturedAtUtc: input.createdAt,
            hairline: rawKeypoints.H,
            imageHeight,
            imageWidth,
            landmarks: landmarkInput?.points ?? [],
            transformationMatrix: replayTransformationMatrix,
            validation: replayValidation,
            zProxy: rawGeometry.debugPoints.idx10?.z,
          });
        result = {
          ...result,
          artifacts: {
            ...result.artifacts,
            poseNormalizationReplayUri,
          },
        };
        await logEvent(logger, 'pose_normalization:raw-artifact-saved', {
          captureId: replayValidation.captureId,
          localOnly: true,
          productPayloadIncluded: false,
          retentionDays: replayValidation.retentionDays,
        });
      } catch (error) {
        return blockReplayArtifact({
          message: getErrorMessage(error),
          reason: 'pose_normalization_artifact_write_failed',
        });
      }
    }

    // raw append가 성공한 뒤 일반 진단 result.json 쓰기 실패를 촬영 실패로
    // 되돌리면 같은 captureId 재시도가 duplicate로 막힌다. 전용 replay가
    // 정본이므로 이 경우 result.json은 best-effort로만 유지한다.
    const persistedResult =
      input.validationReplay && poseNormalizationReplayUri
        ? await persistTerminalResult(result)
        : await writeResultWithPlannedUri(result);

    await logEvent(logger, 'analysis:partial', {
      artifacts: persistedResult.artifacts,
      status: persistedResult.status,
      warnings: persistedResult.quality.warnings,
    });

    return persistedResult;
  } catch (error) {
    return createFailedResult({
      artifacts: {
        poseNormalizationReplayUri,
      },
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
