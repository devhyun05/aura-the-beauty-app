import {colors} from '../../../shared/theme';

export const FACE_CAPTURE_READY_COLOR = colors.guideReady;
export const FACE_CAPTURE_ERROR_COLOR = colors.danger;
export const FACE_CAPTURE_ALIGNMENT_MESSAGE = '얼굴을 가이드 라인 안에 맞춰주세요';

export type FaceCaptureCheckKey =
  | 'hasSingleFace'
  | 'isFaceShapeDetected'
  | 'isFaceCentered'
  | 'isLookingForward'
  | 'isFaceUncovered'
  | 'isHairClear'
  | 'isLightingEven';

export type FaceCaptureCheckState = Record<FaceCaptureCheckKey, boolean>;

export type FaceCaptureGuidanceStatus = 'ready' | 'blocked';

export type FaceCaptureGuidance = {
  status: FaceCaptureGuidanceStatus;
  isCaptureEnabled: boolean;
  tintColor: string;
  message: string | null;
  failedChecks: FaceCaptureCheckKey[];
};

export type FaceLandmarkPoint = {
  x: number;
  y: number;
};

export type FaceLandmarkKey =
  | 'leftEye'
  | 'rightEye'
  | 'noseBase'
  | 'mouthLeft'
  | 'mouthRight'
  | 'leftCheek'
  | 'rightCheek'
  | 'leftJaw'
  | 'rightJaw'
  | 'chin'
  | 'forehead';

export type FaceLandmarkMap = Partial<Record<FaceLandmarkKey, FaceLandmarkPoint>>;

export type FaceCaptureBounds = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type FaceCaptureGuideBounds = {
  centerX: number;
  centerY: number;
  height: number;
  width: number;
};

export type FaceLandmarkDetection = {
  bounds?: FaceCaptureBounds;
  confidence?: number;
  faceCount?: number;
  landmarks?: FaceLandmarkMap;
};

export type FaceLandmarkValidationFrame = {
  guide?: FaceCaptureGuideBounds;
  height?: number;
  width?: number;
};

type FaceCaptureRule = {
  blocksCapture?: boolean;
  key: FaceCaptureCheckKey;
  message: string;
};

const FACE_CAPTURE_RULES: readonly FaceCaptureRule[] = [
  {
    blocksCapture: true,
    key: 'hasSingleFace',
    message: FACE_CAPTURE_ALIGNMENT_MESSAGE,
  },
  {
    blocksCapture: true,
    key: 'isFaceShapeDetected',
    message: FACE_CAPTURE_ALIGNMENT_MESSAGE,
  },
  {
    blocksCapture: true,
    key: 'isFaceCentered',
    message: FACE_CAPTURE_ALIGNMENT_MESSAGE,
  },
  {
    key: 'isLookingForward',
    message: '정면을 바라봐 주세요',
  },
  {
    key: 'isFaceUncovered',
    message: '눈, 코, 입이 잘 보이게 맞춰주세요',
  },
  {
    key: 'isHairClear',
    message: '머리카락이 얼굴을 가리지 않게 해주세요',
  },
  {
    key: 'isLightingEven',
    message: '밝은 곳에서 얼굴을 비춰주세요',
  },
];

const REQUIRED_VISIBLE_LANDMARKS: readonly FaceLandmarkKey[] = [
  'leftEye',
  'rightEye',
  'noseBase',
  'mouthLeft',
  'mouthRight',
];

const REQUIRED_SHAPE_LANDMARKS: readonly FaceLandmarkKey[] = [
  'leftCheek',
  'rightCheek',
  'leftJaw',
  'rightJaw',
  'chin',
];

const DEFAULT_GUIDE_BOUNDS: FaceCaptureGuideBounds = {
  centerX: 0.5,
  centerY: 0.5,
  height: 0.62,
  width: 0.48,
};

const MIN_CONFIDENCE = 0.42;

function getLandmark(landmarks: FaceLandmarkMap, key: FaceLandmarkKey): FaceLandmarkPoint | null {
  const point = landmarks[key];

  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }

  return point;
}

function normalizePoint(
  point: FaceLandmarkPoint,
  frame: FaceLandmarkValidationFrame,
): FaceLandmarkPoint {
  const width = frame.width ?? 1;
  const height = frame.height ?? 1;
  const isAlreadyNormalized = Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1;

  if (isAlreadyNormalized) {
    return point;
  }

  return {
    x: point.x / width,
    y: point.y / height,
  };
}

function hasAllLandmarks(landmarks: FaceLandmarkMap, keys: readonly FaceLandmarkKey[]): boolean {
  return keys.every(key => Boolean(getLandmark(landmarks, key)));
}

function getNormalizedLandmarks(
  landmarks: FaceLandmarkMap,
  frame: FaceLandmarkValidationFrame,
): FaceLandmarkMap {
  return Object.fromEntries(
    Object.entries(landmarks).map(([key, point]) => [
      key,
      normalizePoint(point, frame),
    ]),
  ) as FaceLandmarkMap;
}

function getFaceCenter(
  detection: FaceLandmarkDetection,
  landmarks: FaceLandmarkMap,
  frame: FaceLandmarkValidationFrame,
): FaceLandmarkPoint | null {
  if (detection.bounds) {
    const center = {
      x: detection.bounds.x + detection.bounds.width / 2,
      y: detection.bounds.y + detection.bounds.height / 2,
    };

    return normalizePoint(center, frame);
  }

  const points = Object.values(landmarks).filter(Boolean) as FaceLandmarkPoint[];

  if (points.length === 0) {
    return null;
  }

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function isCenteredInGuide(
  center: FaceLandmarkPoint | null,
  guide: FaceCaptureGuideBounds,
): boolean {
  if (!center) {
    return false;
  }

  const allowedXOffset = guide.width * 0.34;
  const allowedYOffset = guide.height * 0.32;

  return (
    Math.abs(center.x - guide.centerX) <= allowedXOffset &&
    Math.abs(center.y - guide.centerY) <= allowedYOffset
  );
}

function isPointInsideGuideEllipse(
  point: FaceLandmarkPoint | null,
  guide: FaceCaptureGuideBounds,
): boolean {
  if (!point) {
    return false;
  }

  const radiusX = guide.width * 0.5;
  const radiusY = guide.height * 0.5;

  if (radiusX <= 0 || radiusY <= 0) {
    return false;
  }

  const normalizedX = (point.x - guide.centerX) / radiusX;
  const normalizedY = (point.y - guide.centerY) / radiusY;

  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
}

function isFaceAlignedInGuide(
  center: FaceLandmarkPoint | null,
  landmarks: FaceLandmarkMap,
  guide: FaceCaptureGuideBounds,
): boolean {
  return (
    isCenteredInGuide(center, guide) &&
    isPointInsideGuideEllipse(getLandmark(landmarks, 'forehead'), guide) &&
    isPointInsideGuideEllipse(getLandmark(landmarks, 'chin'), guide)
  );
}

function isFacingForward(landmarks: FaceLandmarkMap): boolean {
  const leftEye = getLandmark(landmarks, 'leftEye');
  const rightEye = getLandmark(landmarks, 'rightEye');
  const noseBase = getLandmark(landmarks, 'noseBase');
  const mouthLeft = getLandmark(landmarks, 'mouthLeft');
  const mouthRight = getLandmark(landmarks, 'mouthRight');

  if (!leftEye || !rightEye || !noseBase || !mouthLeft || !mouthRight) {
    return false;
  }

  const eyeDistance = Math.max(Math.abs(rightEye.x - leftEye.x), 0.001);
  const eyeLevelDifference = Math.abs(leftEye.y - rightEye.y);
  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const mouthCenterY = (mouthLeft.y + mouthRight.y) / 2;
  const noseOffsetRatio = Math.abs(noseBase.x - eyeCenterX) / eyeDistance;

  return eyeLevelDifference <= 0.075 && noseOffsetRatio <= 0.38 && mouthCenterY > noseBase.y;
}

export function createBlockedFaceCaptureChecks(): FaceCaptureCheckState {
  return {
    hasSingleFace: false,
    isFaceCentered: false,
    isFaceShapeDetected: false,
    isFaceUncovered: false,
    isHairClear: false,
    isLightingEven: false,
    isLookingForward: false,
  };
}

export function evaluateFaceCaptureChecksFromLandmarks(
  detection: FaceLandmarkDetection | null | undefined,
  frame: FaceLandmarkValidationFrame = {},
): FaceCaptureCheckState {
  if (!detection) {
    return createBlockedFaceCaptureChecks();
  }

  const landmarks = getNormalizedLandmarks(detection.landmarks ?? {}, frame);
  const guide = frame.guide ?? DEFAULT_GUIDE_BOUNDS;
  const center = getFaceCenter(detection, landmarks, frame);
  const hasVisibleLandmarks = hasAllLandmarks(landmarks, REQUIRED_VISIBLE_LANDMARKS);
  const hasShapeLandmarks = hasAllLandmarks(landmarks, REQUIRED_SHAPE_LANDMARKS);
  const confidence = detection.confidence ?? (hasVisibleLandmarks ? 1 : 0);

  return {
    hasSingleFace: detection.faceCount === 1,
    isFaceCentered: isFaceAlignedInGuide(center, landmarks, guide),
    isFaceShapeDetected: hasShapeLandmarks,
    isFaceUncovered: hasVisibleLandmarks,
    isHairClear:
      hasShapeLandmarks && Boolean(getLandmark(landmarks, 'forehead') ?? getLandmark(landmarks, 'chin')),
    isLightingEven: confidence >= MIN_CONFIDENCE,
    isLookingForward: isFacingForward(landmarks),
  };
}

export function evaluateFaceCaptureGuidance(
  checks: FaceCaptureCheckState,
): FaceCaptureGuidance {
  const failedRules = FACE_CAPTURE_RULES.filter(rule => !checks[rule.key]);
  const blockingFailedRules = failedRules.filter(rule => rule.blocksCapture);

  if (blockingFailedRules.length === 0) {
    return {
      status: 'ready',
      isCaptureEnabled: true,
      tintColor: FACE_CAPTURE_READY_COLOR,
      message: null,
      failedChecks: [],
    };
  }

  return {
    status: 'blocked',
    isCaptureEnabled: false,
    tintColor: FACE_CAPTURE_ERROR_COLOR,
    message: blockingFailedRules[0].message,
    failedChecks: failedRules.map(rule => rule.key),
  };
}
