import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
  useWindowDimensions,
} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {X} from 'lucide-react-native';
import {CameraView, type CameraCapturedPicture} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, iconSize, shadows, spacing, typography} from '../../../shared/theme';
import {getBackendApiBaseUrl} from '../../../shared/services/backendApi';
import {useCameraSessionActive} from '../../../shared/hooks/useCameraSessionActive';
import {setUnityMakeupPlayerPaused} from '../../ar/services/unityMakeupBridge';
import {
  CameraCaptureControlRow,
  CameraCaptureButton,
  CameraFacingToggleButton,
  CameraGalleryButton,
  CameraUtilityButton,
  FullscreenOverlayScreen,
  LiveCameraLayer,
} from '../../../shared/ui';
import {mockReadyFaceCaptureChecks} from '../mocks/faceCapture.mock';
import {
  RealtimeFaceCaptureNativeView,
  isRealtimeFaceCaptureAvailable,
  type RealtimeFaceCaptureLandmarkPayload,
  type RealtimeCameraStabilityPayload,
  type RealtimeFaceCaptureNativeViewHandle,
  type RealtimeFaceCaptureScreenPoint,
  type RealtimeMediaPipePayload,
} from '../components/RealtimeFaceCaptureNativeView';
import {
  evaluateFaceCaptureGreenlight,
  type FaceCaptureGreenlightReport,
} from '../services/faceCaptureGreenlight';
import {
  computeFaceEllipseGuideGeometry,
} from '../constants/faceEllipseGuide';
import {
  REALTIME_DEFAULT_POSE_GATE,
  REALTIME_FACE_ANALYSIS_POSE_GATE,
} from '../constants/facePoseGates';
import {
  FACE_PITCH_GATE_MESSAGE,
  evaluateFacePitchGate,
} from '../services/faceCapturePitchGate';
import {evaluateColorLightingGreenlight} from '../../personal-color/services/personalColorCore/colorLightingGreenlight';
import {
  detectFaceLandmarksFromImage,
  isFaceLandmarkDetectorAvailable,
  type NativeFaceLandmarkDetectionResult,
} from '../services/faceLandmarkDetector';
import {
  FACE_CAPTURE_ALIGNMENT_MESSAGE,
  createBlockedFaceCaptureChecks,
  evaluateFaceCaptureChecksFromLandmarks,
  evaluateFaceCaptureGuidance,
  type FaceCaptureGuideBounds,
  type FaceCaptureCheckState,
  type FaceLandmarkPoint,
} from '../services/faceCaptureValidation';
import {
  uploadFaceCaptureImage,
  type FaceCaptureUploadResult,
  type FaceCaptureImageInput,
  type FaceCaptureUploadCaptureType,
} from '../services/faceCaptureUploadService';

type CameraDirection = 'front' | 'back';

const FACE_CAPTURE_UPLOAD_IMAGE_QUALITY = 0.76;

type ScreenLandmarkPoint = {
  left: number;
  top: number;
  x?: number;
  y?: number;
};

type ScreenGuideBounds = {
  centerX: number;
  centerY: number;
  height: number;
  width: number;
};

type FaceCaptureUploadHandler = (
  imageInput: FaceCaptureImageInput,
) => Promise<FaceCaptureUploadResult>;

export type CameraFaceCaptureMode = 'face' | 'reference';

type CameraFaceCaptureScreenProps = {
  allowCameraToggle?: boolean;
  allowGallery?: boolean;
  autoOpenGallery?: boolean;
  captureMode?: CameraFaceCaptureMode;
  captureType?: FaceCaptureUploadCaptureType;
  checks?: FaceCaptureCheckState;
  onCapture?: (
    result?: FaceCaptureUploadResult,
    greenlightReport?: FaceCaptureGreenlightReport,
  ) => void;
  onClose?: () => void;
  onPickImage?: () => void;
  onToggleCamera?: (direction: CameraDirection) => void;
  deferUpload?: boolean;
  // 실험용(face-capture lab)에서 backend 업로드를 로컬 스텁으로 대체할 때만 주입한다.
  uploadImage?: FaceCaptureUploadHandler;
};

export function getCameraFaceCaptureCameraMode(): 'live-camera' {
  return 'live-camera';
}

export function getCameraFaceCaptureCloseButtonPosition(safeAreaTop: number) {
  return {
    position: 'absolute' as const,
    right: spacing.sm,
    top: safeAreaTop,
  };
}

export function shouldValidateCameraFaceCapture(mode: CameraFaceCaptureMode): boolean {
  return mode === 'face';
}

const MEDIAPIPE_CENTERLINE_KEYS = [
  'forehead',
  'noseBridge',
  'noseTip',
  'chin',
] as const;

const FACE_LANDMARK_SCAN_INITIAL_DELAY_MS = 250;
const FACE_LANDMARK_SCAN_INTERVAL_MS = 450;
// 안내 문구 최소 갱신 간격. 게이트가 임계값 근처에서 프레임마다 뒤바뀌어도
// 문구는 이 간격마다만 바뀌어 어지러운 깜빡임을 막는다.
const GUIDANCE_MESSAGE_REFRESH_MS = 700;
const FACE_GUIDE_POINT_CENTER_X_SLACK_RATIO = 0.54;
const FACE_GUIDE_FACE_CENTER_X_SLACK_RATIO = 0.58;
const FACE_GUIDE_FOREHEAD_TOP_MIN_RATIO = -0.04;
const FACE_GUIDE_FOREHEAD_CENTER_MAX_RATIO = -0.04;
const FACE_GUIDE_CHIN_CENTER_MIN_RATIO = 0.26;
const FACE_GUIDE_CHIN_BOTTOM_MAX_RATIO = 0.32;
const FACE_GUIDE_HEIGHT_MIN_RATIO = 0.965;
const FACE_GUIDE_HEIGHT_MAX_RATIO = 1.3;
const FACE_GUIDE_CENTER_Y_SLACK_RATIO = 0.2;

function formatLandmarkPoint(point: FaceLandmarkPoint | undefined) {
  if (!point) {
    return null;
  }

  return {
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3)),
  };
}

function projectImageLandmarkToScreen({
  cameraDirection,
  detection,
  point,
  screenHeight,
  screenWidth,
}: {
  cameraDirection: CameraDirection;
  detection: NativeFaceLandmarkDetectionResult | null;
  point: FaceLandmarkPoint | undefined;
  screenHeight: number;
  screenWidth: number;
}): ScreenLandmarkPoint | null {
  const imageWidth = detection?.imageWidth;
  const imageHeight = detection?.imageHeight;

  if (!point || !imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }

  const scale = Math.max(screenWidth / imageWidth, screenHeight / imageHeight);
  const renderedWidth = imageWidth * scale;
  const renderedHeight = imageHeight * scale;
  const offsetX = (renderedWidth - screenWidth) / 2;
  const offsetY = (renderedHeight - screenHeight) / 2;
  const rawLeft = point.x * imageWidth * scale - offsetX;
  const left = cameraDirection === 'front' ? screenWidth - rawLeft : rawLeft;
  const top = point.y * imageHeight * scale - offsetY;

  return {left, top};
}

function isScreenForeheadInsideGuideBand(
  point: ScreenLandmarkPoint | null,
  guide: ScreenGuideBounds,
): boolean {
  if (!point) {
    return false;
  }

  const guideTop = guide.centerY - guide.height / 2;
  const centerSlack = guide.width * FACE_GUIDE_POINT_CENTER_X_SLACK_RATIO;
  const isHorizontallyNearGuide = Math.abs(point.left - guide.centerX) <= centerSlack;

  if (!isHorizontallyNearGuide) {
    return false;
  }

  return (
    point.top >= guideTop + guide.height * FACE_GUIDE_FOREHEAD_TOP_MIN_RATIO &&
    point.top <= guide.centerY + guide.height * FACE_GUIDE_FOREHEAD_CENTER_MAX_RATIO
  );
}

function isScreenChinInsideGuideBand(
  point: ScreenLandmarkPoint | null,
  guide: ScreenGuideBounds,
): boolean {
  if (!point) {
    return false;
  }

  const guideBottom = guide.centerY + guide.height / 2;
  const centerSlack = guide.width * FACE_GUIDE_POINT_CENTER_X_SLACK_RATIO;
  const isHorizontallyNearGuide = Math.abs(point.left - guide.centerX) <= centerSlack;

  if (!isHorizontallyNearGuide) {
    return false;
  }

  return (
    point.top >= guide.centerY + guide.height * FACE_GUIDE_CHIN_CENTER_MIN_RATIO &&
    point.top <= guideBottom + guide.height * FACE_GUIDE_CHIN_BOTTOM_MAX_RATIO
  );
}

function isScreenFaceFramedInGuide(
  forehead: ScreenLandmarkPoint | null,
  chin: ScreenLandmarkPoint | null,
  guide: ScreenGuideBounds,
): boolean {
  if (!forehead || !chin) {
    return false;
  }

  const centerSlack = guide.width * FACE_GUIDE_FACE_CENTER_X_SLACK_RATIO;
  const faceCenterX = (forehead.left + chin.left) / 2;
  const faceCenterY = (forehead.top + chin.top) / 2;
  const faceHeight = chin.top - forehead.top;
  const hasUsableFaceHeight =
    faceHeight >= guide.height * FACE_GUIDE_HEIGHT_MIN_RATIO &&
    faceHeight <= guide.height * FACE_GUIDE_HEIGHT_MAX_RATIO;
  const isFaceCenteredVertically =
    Math.abs(faceCenterY - guide.centerY) <= guide.height * FACE_GUIDE_CENTER_Y_SLACK_RATIO;

  return (
    Math.abs(faceCenterX - guide.centerX) <= centerSlack &&
    hasUsableFaceHeight &&
    isFaceCenteredVertically &&
    isScreenForeheadInsideGuideBand(forehead, guide) &&
    isScreenChinInsideGuideBand(chin, guide)
  );
}

function formatGuideDebugValue(value: number): number {
  return Number(value.toFixed(3));
}

function getScreenFaceGuideDebug(
  forehead: ScreenLandmarkPoint | null,
  chin: ScreenLandmarkPoint | null,
  guide: ScreenGuideBounds,
) {
  if (!forehead || !chin) {
    return null;
  }

  const guideTop = guide.centerY - guide.height / 2;
  const guideBottom = guide.centerY + guide.height / 2;
  const faceCenterX = (forehead.left + chin.left) / 2;
  const faceCenterY = (forehead.top + chin.top) / 2;
  const faceHeight = chin.top - forehead.top;

  return {
    chinBottomRatio: formatGuideDebugValue((chin.top - guideBottom) / guide.height),
    chinCenterRatio: formatGuideDebugValue((chin.top - guide.centerY) / guide.height),
    faceCenterXOffsetRatio: formatGuideDebugValue((faceCenterX - guide.centerX) / guide.width),
    faceCenterYOffsetRatio: formatGuideDebugValue((faceCenterY - guide.centerY) / guide.height),
    faceHeightRatio: formatGuideDebugValue(faceHeight / guide.height),
    foreheadCenterRatio: formatGuideDebugValue((forehead.top - guide.centerY) / guide.height),
    foreheadTopRatio: formatGuideDebugValue((forehead.top - guideTop) / guide.height),
    thresholds: {
      chinBottomMax: FACE_GUIDE_CHIN_BOTTOM_MAX_RATIO,
      chinCenterMin: FACE_GUIDE_CHIN_CENTER_MIN_RATIO,
      faceCenterXMaxAbs: FACE_GUIDE_FACE_CENTER_X_SLACK_RATIO,
      faceCenterYMaxAbs: FACE_GUIDE_CENTER_Y_SLACK_RATIO,
      faceHeightMax: FACE_GUIDE_HEIGHT_MAX_RATIO,
      faceHeightMin: FACE_GUIDE_HEIGHT_MIN_RATIO,
      foreheadCenterMax: FACE_GUIDE_FOREHEAD_CENTER_MAX_RATIO,
      foreheadTopMin: FACE_GUIDE_FOREHEAD_TOP_MIN_RATIO,
    },
  };
}

function formatScreenLandmarkPoint(point: ScreenLandmarkPoint | null) {
  if (!point) {
    return null;
  }

  return {
    x: Math.round(point.left),
    y: Math.round(point.top),
  };
}

function getScreenLandmarkPoint(
  point: RealtimeFaceCaptureScreenPoint | ScreenLandmarkPoint | undefined,
): ScreenLandmarkPoint | null {
  const left = point && Number.isFinite(point.left) ? point.left : point?.x;
  const top = point && Number.isFinite(point.top) ? point.top : point?.y;

  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top)
  ) {
    return null;
  }

  return {
    left: left as number,
    top: top as number,
  };
}

function createLocalFaceCaptureResult({
  contentType,
  height,
  semanticMattes,
  source,
  uri,
  width,
}: FaceCaptureImageInput): FaceCaptureUploadResult {
  const localId = `local-${Date.now()}`;

  return {
    bucket: 'local',
    cdnUrl: null,
    contentType: contentType ?? 'image/jpeg',
    height: height ?? null,
    imageUri: uri,
    mediaId: localId,
    objectKey: uri,
    photoCaptureId: localId,
    semanticMattes,
    source,
    width: width ?? null,
  };
}

export function CameraFaceCaptureScreen({
  allowCameraToggle = true,
  allowGallery = true,
  autoOpenGallery = false,
  captureMode = 'face',
  captureType,
  checks,
  onCapture,
  onClose,
  onPickImage,
  onToggleCamera,
  deferUpload = false,
  uploadImage = uploadFaceCaptureImage,
}: CameraFaceCaptureScreenProps) {
  const shouldValidateFace = shouldValidateCameraFaceCapture(captureMode);
  const {height, width} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const realtimeCameraRef = useRef<RealtimeFaceCaptureNativeViewHandle>(null);
  const cameraSessionActive = useCameraSessionActive();
  const [cameraDirection, setCameraDirection] = useState<CameraDirection>(() =>
    shouldValidateFace ? 'front' : 'back',
  );
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isPickingImage, setIsPickingImage] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [captureValidationMessage, setCaptureValidationMessage] = useState<string | null>(null);
  const [landmarkDetection, setLandmarkDetection] =
    useState<NativeFaceLandmarkDetectionResult | null>(null);
  const [liveCaptureChecks, setLiveCaptureChecks] =
    useState<FaceCaptureCheckState | null>(null);
  const [latestCameraStability, setLatestCameraStability] =
    useState<RealtimeCameraStabilityPayload | undefined>();
  const [latestMediaPipe, setLatestMediaPipe] =
    useState<RealtimeMediaPipePayload | undefined>();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const landmarkScanInFlightRef = useRef(false);
  const lastRealtimeLogAtRef = useRef(0);
  const hasAutoOpenedGalleryRef = useRef(false);
  // 안내 문구 깜빡임 방지: 최신 목표 문구는 ref에 담고, 표시는 interval로 제한 갱신.
  const guidanceMessageTargetRef = useRef<string | null>(null);
  const [stableGuidanceMessage, setStableGuidanceMessage] = useState<string | null>(null);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setStableGuidanceMessage(previous => {
        const target = guidanceMessageTargetRef.current;
        return target === previous ? previous : target;
      });
    }, GUIDANCE_MESSAGE_REFRESH_MS);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    // ARwithFable Unity(ARKit + MediaPipe + 렌더)가 백그라운드에 상주한 채 이 화면의
    // 무거운 카메라 파이프라인(전면 + Depth + Vision + 매트)이 겹치면 메모리 초과로
    // 앱이 강제 종료된다(jetsam). 이 화면 동안 Unity 플레이어를 pause해 자원·전면
    // 카메라를 넘겨주고, 나갈 때 resume한다. AR 필터의 Unity 생명주기는 안 건드림.
    // Unity 미기동이면 no-op.
    setUnityMakeupPlayerPaused(true);
    return () => {
      setUnityMakeupPlayerPaused(false);
    };
  }, []);

  const realtimeCaptureAvailable = useMemo(
    () => shouldValidateFace && isRealtimeFaceCaptureAvailable(),
    [shouldValidateFace],
  );
  const landmarkDetectorAvailable = useMemo(
    () => shouldValidateFace && !realtimeCaptureAvailable && isFaceLandmarkDetectorAvailable(),
    [realtimeCaptureAvailable, shouldValidateFace],
  );
  // greenlight 게이트는 face 모드 + realtime 네이티브 뷰가 있을 때만 활성화한다.
  // realtime 뷰 없이는 mediaPipe/cameraStability 입력이 오지 않아 영구 차단되기 때문.
  const requireGreenlight = shouldValidateFace && realtimeCaptureAvailable;
  // Apple semantic matte(헤어라인)는 얼굴 분석 촬영에서만 요청한다.
  const semanticMatteCapture =
    requireGreenlight &&
    (captureType === 'face_analysis' ||
      captureType === 'personal_color' ||
      captureType === 'hair_analysis');
  const blockedFaceCaptureChecks = useMemo(() => createBlockedFaceCaptureChecks(), []);
  // 타원 프레이밍 가이드 (기획서 §3.5 비율, 화면 중앙 앵커).
  // 정수리/턱끝이 타원 상하단 점에 맞아야 촬영되므로 얼굴 크기(=촬영 거리)를
  // 간접적으로 제한한다. 크기/허용치 튜닝은 FACE_ELLIPSE_GUIDE_TUNING에서.
  const ellipseGeometry = useMemo(
    () =>
      computeFaceEllipseGuideGeometry({
        previewHeight: height,
        previewWidth: width,
        principalPointInPreview: null,
      }),
    [height, width],
  );
  const guideWidth = ellipseGeometry.width;
  const guideHeight = ellipseGeometry.height;
  const guideScaleY = guideHeight / guideWidth;
  const guideCenterX = ellipseGeometry.centerX;
  const guideCenterY = ellipseGeometry.centerY;
  const closeButtonPosition = getCameraFaceCaptureCloseButtonPosition(insets.top);
  const screenGuideBounds = useMemo<ScreenGuideBounds>(
    () => ({
      centerX: guideCenterX,
      centerY: guideCenterY,
      height: guideHeight,
      width: guideWidth,
    }),
    [guideCenterX, guideCenterY, guideHeight, guideWidth],
  );
  const guideBounds = useMemo<FaceCaptureGuideBounds>(
    () => ({
      centerX: guideCenterX / width,
      centerY: guideCenterY / height,
      height: guideHeight / height,
      width: guideWidth / width,
    }),
    [guideCenterX, guideCenterY, guideHeight, guideWidth, height, width],
  );
  const effectiveChecks = shouldValidateFace
    ? checks ??
      liveCaptureChecks ??
      (landmarkDetectorAvailable || realtimeCaptureAvailable
        ? blockedFaceCaptureChecks
        : mockReadyFaceCaptureChecks)
    : mockReadyFaceCaptureChecks;
  const hasLiveCaptureChecks =
    shouldValidateFace &&
    !requireGreenlight &&
    (checks !== undefined ||
      liveCaptureChecks !== null ||
      landmarkDetectorAvailable ||
      realtimeCaptureAvailable);
  const guidance = useMemo(
    () => evaluateFaceCaptureGuidance(effectiveChecks),
    [effectiveChecks],
  );
  // 촬영 타입별 pose 임계 프로파일. face_analysis 는 사후 품질 게이트와 동치
  // (8/8/5)라 "촬영은 되는데 분석에서 폐기"가 구조적으로 불가능하다.
  // 두 프로파일 모두 모듈 상수(frozen)라 참조가 안정적 — deps 에 넣어도 재계산 없음.
  const realtimePoseGate =
    captureType === 'face_analysis'
      ? REALTIME_FACE_ANALYSIS_POSE_GATE
      : REALTIME_DEFAULT_POSE_GATE;
  const greenlightReport = useMemo(
    () => evaluateFaceCaptureGreenlight({
      cameraStability: latestCameraStability,
      guide: screenGuideBounds,
      mediaPipe: latestMediaPipe,
      poseGate: realtimePoseGate,
    }),
    [latestCameraStability, latestMediaPipe, realtimePoseGate, screenGuideBounds],
  );
  const shouldBlockForGreenlight =
    requireGreenlight && !greenlightReport.finalCaptureGreenlight;
  // 얼굴 세로 비율 촬영에서만 실시간 pitch(고개 숙임/젖힘) 게이트 적용.
  // 세로 비율 최대 왜곡원인데 greenlight는 pitch를 안 보므로 여기서 보강한다.
  const requirePitchGate = requireGreenlight && captureType === 'face_analysis';
  const pitchGate = useMemo(
    () => evaluateFacePitchGate(latestMediaPipe?.pitchDeg),
    [latestMediaPipe],
  );
  const shouldBlockForPitch = requirePitchGate && !pitchGate.pitchOk;

  // 퍼스널 컬러 촬영에서만 조명 게이트 적용. HARD는 AE/AWB 미수렴 하나뿐(≈1초 자기해소),
  // soft(너무 어두움/색조 캐스트)는 계측만 하고 촬영을 막지 않는다.
  const requireColorLighting = requireGreenlight && captureType === 'personal_color';
  const colorLightingReport = useMemo(
    () => evaluateColorLightingGreenlight(latestCameraStability ?? {}),
    [latestCameraStability],
  );
  const shouldBlockForColorLighting =
    requireColorLighting && !colorLightingReport.hardBlockClear;
  const mediaPipeCenterLineX = useMemo(() => {
    const xs = MEDIAPIPE_CENTERLINE_KEYS
      .map(key => getScreenLandmarkPoint(latestMediaPipe?.screenLandmarks?.[key]))
      .filter(Boolean)
      .map(point => (point as ScreenLandmarkPoint).left);

    if (xs.length !== MEDIAPIPE_CENTERLINE_KEYS.length) {
      return null;
    }

    return xs.reduce((sum, x) => sum + x, 0) / xs.length;
  }, [latestMediaPipe]);
  const isMediaPipeCenterAligned =
    mediaPipeCenterLineX !== null &&
    !greenlightReport.failureReasons.includes('not_centered');
  const controlsBottom = Math.max(insets.bottom + 64, height * 0.1);
  const errorBottom = controlsBottom + 98;
  // 게이트 기반 안내 문구(깜빡임 원인). 준비되면 null. 임계값 근처 프레임 지터로
  // 프레임마다 값이 바뀌므로 아래 stableGuidanceMessage로 갱신 빈도를 제한한다.
  const rawGuidanceMessage = !shouldValidateFace
    ? null
    : requireGreenlight
      ? !greenlightReport.finalCaptureGreenlight
        ? greenlightReport.message
        : shouldBlockForPitch
          ? FACE_PITCH_GATE_MESSAGE
          : shouldBlockForColorLighting
            ? colorLightingReport.message
            : null
      : guidance.status === 'blocked'
        ? guidance.message
        : null;
  // 렌더 단계에서 ref.current를 직접 수정하면 렌더 순수성을 해치므로, 값이 바뀔 때만
  // effect로 안전하게 갱신한다. 표시는 위 interval이 이 ref를 읽어 제한 갱신한다.
  useEffect(() => {
    guidanceMessageTargetRef.current = rawGuidanceMessage;
  }, [rawGuidanceMessage]);
  const captureMessage =
    uploadError ??
    (isUploading
      ? '사진을 업로드하는 중이에요'
      : captureValidationMessage ?? stableGuidanceMessage);
  const isCaptureDisabled =
    isUploading ||
    shouldBlockForGreenlight ||
    shouldBlockForPitch ||
    shouldBlockForColorLighting;
  const shouldUseBackendUpload = Boolean(getBackendApiBaseUrl());
  const foreheadDot = useMemo(
    () => {
      const realtimePoint = getScreenLandmarkPoint(
        landmarkDetection?.screenLandmarks?.forehead,
      );

      return realtimePoint ?? projectImageLandmarkToScreen({
        cameraDirection,
        detection: landmarkDetection,
        point: landmarkDetection?.landmarks?.forehead,
        screenHeight: height,
        screenWidth: width,
      });
    },
    [cameraDirection, height, landmarkDetection, width],
  );
  const chinDot = useMemo(
    () => {
      const realtimePoint = getScreenLandmarkPoint(
        landmarkDetection?.screenLandmarks?.chin,
      );

      return realtimePoint ?? projectImageLandmarkToScreen({
        cameraDirection,
        detection: landmarkDetection,
        point: landmarkDetection?.landmarks?.chin,
        screenHeight: height,
        screenWidth: width,
      });
    },
    [cameraDirection, height, landmarkDetection, width],
  );
  const areScreenLandmarksInsideGuide = isScreenFaceFramedInGuide(
    foreheadDot,
    chinDot,
    screenGuideBounds,
  );
  const hasScreenLandmarks = Boolean(foreheadDot && chinDot);
  const shouldBlockForScreenGuide =
    shouldValidateFace &&
    !requireGreenlight &&
    (landmarkDetectorAvailable || realtimeCaptureAvailable) &&
    (!hasScreenLandmarks || !areScreenLandmarksInsideGuide);
  const captureTintColor =
    !shouldValidateFace
      ? uploadError || !isCameraReady
        ? colors.danger
        : colors.white
      : uploadError ||
          !isCameraReady ||
          shouldBlockForScreenGuide ||
          shouldBlockForGreenlight ||
          shouldBlockForPitch ||
          shouldBlockForColorLighting
      ? colors.danger
      : requireGreenlight
        ? colors.guideReady
        : guidance.tintColor;

  useEffect(() => {
    if (realtimeCaptureAvailable) {
      setIsCameraReady(true);
    }
  }, [realtimeCaptureAvailable]);

  useEffect(() => {
    if (guidance.status === 'ready') {
      setCaptureValidationMessage(null);
    }
  }, [guidance.status]);

  useEffect(() => {
    if (shouldValidateFace && !landmarkDetectorAvailable) {
      console.info(
        '[aura:face-capture] landmark-detector:unavailable',
        realtimeCaptureAvailable
          ? 'Using realtime native face capture view.'
          : 'AURAFaceLandmarkDetector native module is missing. Rebuild the iOS app.',
      );
    }
  }, [landmarkDetectorAvailable, realtimeCaptureAvailable, shouldValidateFace]);

  const handleRealtimeLandmarksDetected = useCallback(
    ({nativeEvent}: {nativeEvent: RealtimeFaceCaptureLandmarkPayload}) => {
      const detection: NativeFaceLandmarkDetectionResult = {
        bounds: nativeEvent.bounds,
        confidence: nativeEvent.confidence,
        faceCount: nativeEvent.faceCount,
        imageHeight: nativeEvent.imageHeight,
        imageWidth: nativeEvent.imageWidth,
        landmarks: nativeEvent.landmarks,
        screenLandmarks: nativeEvent.screenLandmarks,
        sequence: nativeEvent.sequence,
        status: nativeEvent.status,
      };
      const detectionInput =
        nativeEvent.status === 'ok' || nativeEvent.status === 'no_landmarks'
          ? {
              bounds: nativeEvent.bounds,
              confidence: nativeEvent.confidence,
              faceCount: nativeEvent.faceCount,
              landmarks: nativeEvent.landmarks,
            }
          : null;
      const landmarkChecks = evaluateFaceCaptureChecksFromLandmarks(
        detectionInput,
        {guide: guideBounds},
      );
      const nextForeheadDot =
        getScreenLandmarkPoint(nativeEvent.screenLandmarks?.forehead) ??
        projectImageLandmarkToScreen({
          cameraDirection,
          detection,
          point: nativeEvent.landmarks?.forehead,
          screenHeight: height,
          screenWidth: width,
        });
      const nextChinDot =
        getScreenLandmarkPoint(nativeEvent.screenLandmarks?.chin) ??
        projectImageLandmarkToScreen({
          cameraDirection,
          detection,
          point: nativeEvent.landmarks?.chin,
          screenHeight: height,
          screenWidth: width,
        });
      const nextForeheadInsideGuide = isScreenForeheadInsideGuideBand(
        nextForeheadDot,
        screenGuideBounds,
      );
      const nextChinInsideGuide = isScreenChinInsideGuideBand(
        nextChinDot,
        screenGuideBounds,
      );
      const nextScreenInsideGuide = isScreenFaceFramedInGuide(
        nextForeheadDot,
        nextChinDot,
        screenGuideBounds,
      );
      const hasNextScreenLandmarks = Boolean(nextForeheadDot && nextChinDot);
      const nextChecks = {
        ...landmarkChecks,
        isFaceCentered: hasNextScreenLandmarks
          ? nextScreenInsideGuide
          : false,
      };
      const nextGuidance = evaluateFaceCaptureGuidance(nextChecks);
      const guideDebug = getScreenFaceGuideDebug(
        nextForeheadDot,
        nextChinDot,
        screenGuideBounds,
      );

      setIsCameraReady(
        nativeEvent.status !== 'permission_denied' &&
          nativeEvent.status !== 'camera_unavailable' &&
          nativeEvent.status !== 'input_unavailable',
      );
      setLandmarkDetection(detection);
      setLiveCaptureChecks(nextChecks);
      setLatestCameraStability(nativeEvent.cameraStability);
      setLatestMediaPipe(nativeEvent.mediaPipe);

      const now = Date.now();
      if (now - lastRealtimeLogAtRef.current > 500) {
        lastRealtimeLogAtRef.current = now;
        const chinScreenPoint = formatScreenLandmarkPoint(nextChinDot);
        const foreheadScreenPoint = formatScreenLandmarkPoint(nextForeheadDot);
        const frameGreenlight = evaluateFaceCaptureGreenlight({
          cameraStability: nativeEvent.cameraStability,
          guide: screenGuideBounds,
          mediaPipe: nativeEvent.mediaPipe,
          poseGate: realtimePoseGate,
        });

        console.info('[aura:face-capture] realtime-landmark-frame', {
          checks: nextChecks,
          chin: formatLandmarkPoint(nativeEvent.landmarks?.chin),
          faceCount: nativeEvent.faceCount,
          forehead: formatLandmarkPoint(nativeEvent.landmarks?.forehead),
          guideDebug,
          message: nextGuidance.message,
          screenDots: {
            chinInsideGuide: nextChinInsideGuide,
            chinX: chinScreenPoint?.x ?? null,
            chinY: chinScreenPoint?.y ?? null,
            foreheadInsideGuide: nextForeheadInsideGuide,
            foreheadX: foreheadScreenPoint?.x ?? null,
            foreheadY: foreheadScreenPoint?.y ?? null,
          },
          cameraStability: nativeEvent.cameraStability ?? null,
          greenlight: {
            cameraStabilityGreenlight: frameGreenlight.cameraStabilityGreenlight,
            failureReasons: frameGreenlight.failureReasons,
            finalCaptureGreenlight: frameGreenlight.finalCaptureGreenlight,
            mediaPipeAlignmentGreenlight: frameGreenlight.mediaPipeAlignmentGreenlight,
            metrics: frameGreenlight.metrics,
          },
          mediaPipe: nativeEvent.mediaPipe
            ? {
                faceWidthRatio: nativeEvent.mediaPipe.faceWidthRatio,
                pitchDeg: nativeEvent.mediaPipe.pitchDeg,
                poseSource: nativeEvent.mediaPipe.poseSource,
                projectionEyeTilt: nativeEvent.mediaPipe.projectionEyeTilt ?? null,
                rollDeg: nativeEvent.mediaPipe.rollDeg,
                status: nativeEvent.mediaPipe.status,
                yawDeg: nativeEvent.mediaPipe.yawDeg,
              }
            : null,
          // 좌표 프레임 자가판정 진단 — 스크린샷 한 장으로 규약 판정/투영
          // 건전성/중앙 오프셋을 원격 판독하기 위한 필드 (fail-safe 원칙).
          frameGeometry: {
            eyeAxis: nativeEvent.eyeAxis ?? null,
            eyeAxisRatio: nativeEvent.eyeAxisRatio ?? null,
            frameRotation: nativeEvent.frameRotation ?? null,
            frameRotationDetected: nativeEvent.frameRotationDetected ?? null,
            frameRotationLocked: nativeEvent.frameRotationLocked ?? null,
            imageHeight: nativeEvent.imageHeight ?? null,
            imageWidth: nativeEvent.imageWidth ?? null,
          },
          screenInsideGuide: nextScreenInsideGuide,
          sequence: nativeEvent.sequence,
          status: nativeEvent.status,
        });
      }
    },
    [cameraDirection, guideBounds, height, realtimePoseGate, screenGuideBounds, width],
  );

  useEffect(() => {
    if (
      realtimeCaptureAvailable ||
      !shouldValidateFace ||
      checks !== undefined ||
      !landmarkDetectorAvailable ||
      !isCameraReady ||
      isPickingImage ||
      isUploading
    ) {
      return;
    }

    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function scheduleNextScan(delayMs: number) {
      if (!isActive) {
        return;
      }

      timeoutId = setTimeout(scanFaceLandmarks, delayMs);
    }

    async function scanFaceLandmarks() {
      const camera = cameraRef.current;

      if (!camera || landmarkScanInFlightRef.current) {
        scheduleNextScan(FACE_LANDMARK_SCAN_INTERVAL_MS);
        return;
      }

      landmarkScanInFlightRef.current = true;

      try {
        const picture = await new Promise<CameraCapturedPicture | undefined>((resolve, reject) => {
          void camera
            .takePictureAsync({
              onPictureSaved: resolve,
              quality: 0,
              shutterSound: false,
              skipProcessing: false,
            })
            .catch(reject);
        });

        if (!picture?.uri || !isActive) {
          return;
        }

        const detection = await detectFaceLandmarksFromImage(picture.uri, {
          deleteAfter: true,
        });

        if (!isActive) {
          return;
        }

        const nextDetectionInput =
          detection.status === 'unsupported'
            ? null
            : {
                bounds: detection.bounds,
                confidence: detection.confidence,
                faceCount: detection.faceCount,
                landmarks: detection.landmarks,
              };
        const landmarkChecks = evaluateFaceCaptureChecksFromLandmarks(
          nextDetectionInput,
          {guide: guideBounds},
        );
        const nextForeheadDot = projectImageLandmarkToScreen({
          cameraDirection,
          detection,
          point: detection.landmarks?.forehead,
          screenHeight: height,
          screenWidth: width,
        });
        const nextChinDot = projectImageLandmarkToScreen({
          cameraDirection,
          detection,
          point: detection.landmarks?.chin,
          screenHeight: height,
          screenWidth: width,
        });
        const nextForeheadInsideGuide = isScreenForeheadInsideGuideBand(
          nextForeheadDot,
          screenGuideBounds,
        );
        const nextChinInsideGuide = isScreenChinInsideGuideBand(
          nextChinDot,
          screenGuideBounds,
        );
        const nextScreenInsideGuide = isScreenFaceFramedInGuide(
          nextForeheadDot,
          nextChinDot,
          screenGuideBounds,
        );
        const hasNextScreenLandmarks = Boolean(nextForeheadDot && nextChinDot);
        const nextChecks = {
          ...landmarkChecks,
          isFaceCentered: hasNextScreenLandmarks
            ? nextScreenInsideGuide
            : false,
        };
        const nextGuidance = evaluateFaceCaptureGuidance(nextChecks);
        const guideDebug = getScreenFaceGuideDebug(
          nextForeheadDot,
          nextChinDot,
          screenGuideBounds,
        );
        const chinScreenPoint = formatScreenLandmarkPoint(nextChinDot);
        const foreheadScreenPoint = formatScreenLandmarkPoint(nextForeheadDot);

        setLandmarkDetection(detection);
        setLiveCaptureChecks(nextChecks);

        console.info('[aura:face-capture] landmark-scan', {
          cameraDirection,
          checks: nextChecks,
          chin: formatLandmarkPoint(detection.landmarks?.chin),
          faceCount: detection.faceCount,
          forehead: formatLandmarkPoint(detection.landmarks?.forehead),
          guide: {
            centerX: Number(guideBounds.centerX.toFixed(3)),
            centerY: Number(guideBounds.centerY.toFixed(3)),
            height: Number(guideBounds.height.toFixed(3)),
            width: Number(guideBounds.width.toFixed(3)),
          },
          guideDebug,
          message: nextGuidance.message,
          screenDots: {
            chinInsideGuide: nextChinInsideGuide,
            chinX: chinScreenPoint?.x ?? null,
            chinY: chinScreenPoint?.y ?? null,
            foreheadInsideGuide: nextForeheadInsideGuide,
            foreheadX: foreheadScreenPoint?.x ?? null,
            foreheadY: foreheadScreenPoint?.y ?? null,
          },
          screenInsideGuide: nextScreenInsideGuide,
          status: detection.status,
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        const nextChecks = createBlockedFaceCaptureChecks();
        setLandmarkDetection(null);
        setLiveCaptureChecks(nextChecks);
        console.info('[aura:face-capture] landmark-scan:error', {
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        landmarkScanInFlightRef.current = false;
        scheduleNextScan(FACE_LANDMARK_SCAN_INTERVAL_MS);
      }
    }

    scheduleNextScan(FACE_LANDMARK_SCAN_INITIAL_DELAY_MS);

    return () => {
      isActive = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    cameraDirection,
    checks,
    guideBounds,
    height,
    isCameraReady,
    isPickingImage,
    isUploading,
    landmarkDetectorAvailable,
    realtimeCaptureAvailable,
    screenGuideBounds,
    shouldValidateFace,
    width,
  ]);

  const triggerBlockedCaptureFeedback = (message: string) => {
    setCaptureValidationMessage(message);
    setUploadError(null);
    Vibration.vibrate([0, 70, 35, 70]);
  };

  const handleToggleCamera = () => {
    const nextDirection = cameraDirection === 'front' ? 'back' : 'front';
    setCameraDirection(nextDirection);
    setIsCameraReady(false);
    setLandmarkDetection(null);
    setLiveCaptureChecks(null);
    setLatestCameraStability(undefined);
    setLatestMediaPipe(undefined);
    setCaptureValidationMessage(null);
    setUploadError(null);
    onToggleCamera?.(nextDirection);
  };

  const handleCapture = async () => {
    if (isCaptureDisabled) {
      return;
    }

    if (!isCameraReady) {
      triggerBlockedCaptureFeedback('카메라를 준비 중이에요. 잠시만 기다려 주세요.');
      return;
    }

    if (shouldValidateFace) {
      if (requireGreenlight && !greenlightReport.finalCaptureGreenlight) {
        triggerBlockedCaptureFeedback(greenlightReport.message);
        return;
      }

      if (requirePitchGate && !pitchGate.pitchOk) {
        triggerBlockedCaptureFeedback(FACE_PITCH_GATE_MESSAGE);
        return;
      }

      if (requireColorLighting && !colorLightingReport.hardBlockClear) {
        triggerBlockedCaptureFeedback(
          colorLightingReport.message ?? '카메라가 조명을 맞추는 중이에요. 잠시만요.',
        );
        return;
      }

      if (!realtimeCaptureAvailable && landmarkScanInFlightRef.current) {
        triggerBlockedCaptureFeedback('얼굴 위치를 확인 중이에요. 잠시 후 다시 촬영해 주세요.');
        return;
      }

      if (!requireGreenlight && shouldBlockForScreenGuide) {
        triggerBlockedCaptureFeedback(FACE_CAPTURE_ALIGNMENT_MESSAGE);
        return;
      }

      if (!requireGreenlight && hasLiveCaptureChecks && !guidance.isCaptureEnabled) {
        triggerBlockedCaptureFeedback(guidance.message ?? FACE_CAPTURE_ALIGNMENT_MESSAGE);
        return;
      }
    }

    setIsUploading(true);
    setCaptureValidationMessage(null);
    setUploadError(null);

    try {
      const picture = realtimeCaptureAvailable
        ? await realtimeCameraRef.current?.capture()
        : await cameraRef.current?.takePictureAsync({
            quality: FACE_CAPTURE_UPLOAD_IMAGE_QUALITY,
            skipProcessing: false,
          });

      if (!picture?.uri) {
        throw new Error('Camera did not return an image file.');
      }

      const nativeCameraMetadata =
        'cameraMetadata' in picture ? picture.cameraMetadata : undefined;
      const pictureFormat = 'format' in picture ? picture.format : undefined;
      const semanticMattes =
        'semanticMattes' in picture ? picture.semanticMattes : undefined;
      const captureGreenlightReport = requireGreenlight
        ? evaluateFaceCaptureGreenlight({
            cameraStability: latestCameraStability,
            guide: screenGuideBounds,
            mediaPipe: latestMediaPipe,
            nativeCameraMetadata,
            poseGate: realtimePoseGate,
          })
        : undefined;
      const imageInput: FaceCaptureImageInput = {
        captureType,
        contentType: pictureFormat === 'heic' ? 'image/heic' : undefined,
        height: picture.height,
        semanticMattes,
        source: 'camera',
        uri: picture.uri,
        width: picture.width,
      };
      let result: FaceCaptureUploadResult;

      try {
        result = deferUpload
          ? createLocalFaceCaptureResult(imageInput)
          : await uploadImage(imageInput);
      } catch (error) {
        setUploadError(
          error instanceof Error
            ? error.message
            : '사진 업로드에 실패했어요. 네트워크를 확인한 뒤 다시 촬영해 주세요.',
        );

        if (shouldUseBackendUpload) {
          return;
        }

        result = createLocalFaceCaptureResult(imageInput);
      }

      onCapture?.(result, captureGreenlightReport);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Photo upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePickImage = async () => {
    if (onPickImage) {
      onPickImage();
      return;
    }

    if (isPickingImage || isUploading) {
      return;
    }

    setIsPickingImage(true);
    setCaptureValidationMessage(null);
    setUploadError(null);

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: FACE_CAPTURE_UPLOAD_IMAGE_QUALITY,
      });

      if (pickerResult.canceled || pickerResult.assets.length === 0) {
        return;
      }

      setIsUploading(true);
      const asset = pickerResult.assets[0];
      const imageInput: FaceCaptureImageInput = {
        captureType,
        contentType: asset.mimeType,
        fileName: asset.fileName,
        height: asset.height,
        source: 'gallery',
        uri: asset.uri,
        width: asset.width,
      };
      let result: FaceCaptureUploadResult;

      try {
        result = deferUpload
          ? createLocalFaceCaptureResult(imageInput)
          : await uploadImage(imageInput);
      } catch (error) {
        setUploadError(
          error instanceof Error
            ? error.message
            : '사진 업로드에 실패했어요. 네트워크를 확인한 뒤 다시 선택해 주세요.',
        );

        if (shouldUseBackendUpload) {
          return;
        }

        result = createLocalFaceCaptureResult(imageInput);
      }

      onCapture?.(result);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Photo upload failed.');
    } finally {
      setIsPickingImage(false);
      setIsUploading(false);
    }
  };

  useEffect(() => {
    if (!cameraSessionActive) {
      setIsCameraReady(false);
    }
  }, [cameraSessionActive]);

  useEffect(() => {
    if (!autoOpenGallery || hasAutoOpenedGalleryRef.current) {
      return;
    }

    hasAutoOpenedGalleryRef.current = true;
    const timeoutId = setTimeout(() => {
      void handlePickImage();
    }, 250);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [autoOpenGallery]);

  return (
    <FullscreenOverlayScreen>
      <StatusBar style="light" />
      {realtimeCaptureAvailable ? (
        cameraSessionActive ? (
          <RealtimeFaceCaptureNativeView
            facing={cameraDirection}
            onLandmarksDetected={handleRealtimeLandmarksDetected}
            ref={realtimeCameraRef}
            semanticMatteCapture={semanticMatteCapture}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={StyleSheet.absoluteFill} />
        )
      ) : (
        <LiveCameraLayer
          active={cameraSessionActive}
          facing={cameraDirection}
          ref={cameraRef}
          onCameraReady={() => setIsCameraReady(true)}
          onMountError={() => setIsCameraReady(false)}
        />
      )}

      <View style={[styles.closeButtonWrap, closeButtonPosition]}>
        <Pressable
          accessibilityLabel="Close capture screen"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          style={styles.closeButton}>
          <X color={colors.white} size={iconSize.xl} strokeWidth={1.8} />
        </Pressable>
      </View>

      {shouldValidateFace ? (
        // 타원 가이드: 정원(width×width) View를 scaleY로 늘려 그린다.
        // scaleY는 View 중심 기준이므로 top은 (centerY - width/2)여야
        // 늘어난 타원의 중심이 guideCenterY에 정확히 온다.
        // 얼굴을 타원 안에 맞추면 촬영(거리·정렬 판정은 greenlight가 담당).
        <View
          pointerEvents="none"
          style={[
            styles.faceGuide,
            {
              borderColor: captureTintColor,
              borderRadius: guideWidth / 2,
              height: guideWidth,
              left: guideCenterX - guideWidth / 2,
              top: guideCenterY - guideWidth / 2,
              transform: [{scaleY: guideScaleY}],
              width: guideWidth,
            },
          ]}
        />
      ) : null}

      {requireGreenlight ? (
        <View
          pointerEvents="none"
          style={[
            styles.guideCenterLine,
            {
              height: guideHeight,
              left: guideCenterX - StyleSheet.hairlineWidth,
              top: guideCenterY - guideHeight / 2,
            },
          ]}
        />
      ) : null}

      {requireGreenlight && mediaPipeCenterLineX !== null ? (
        <View
          pointerEvents="none"
          style={[
            styles.faceCenterLine,
            {
              backgroundColor: isMediaPipeCenterAligned
                ? colors.guideReady
                : colors.danger,
              height: guideHeight,
              left: mediaPipeCenterLineX - 1,
              top: guideCenterY - guideHeight / 2,
            },
          ]}
        />
      ) : null}

      {uploadError || captureValidationMessage || stableGuidanceMessage ? (
        <View pointerEvents="none" style={[styles.errorBar, {bottom: errorBottom}]}>
          <Text style={styles.errorText}>
            {captureMessage ?? FACE_CAPTURE_ALIGNMENT_MESSAGE}
          </Text>
        </View>
      ) : null}

      <CameraCaptureControlRow
        bottom={controlsBottom}
        centerSlot={
          <CameraCaptureButton
            accessibilityLabel={
              isUploading
                ? '촬영 처리 중'
                : shouldBlockForGreenlight
                  ? '촬영 조건 확인 중'
                  : '사진 촬영'
            }
            disabled={isCaptureDisabled}
            innerColor={captureTintColor}
            onPress={handleCapture}
            showInnerDot={!isUploading}
            surfaceStyle={styles.transparentCaptureButtonSurface}>
            {isUploading ? <ActivityIndicator color={colors.white} size="small" /> : null}
          </CameraCaptureButton>
        }
        horizontalPadding={spacing.xxl * 2 + spacing.xs}
        leftSlot={allowGallery ? (
          <CameraGalleryButton
            accessibilityLabel="Pick photo from album"
            disabled={isPickingImage || isUploading}
            onPress={handlePickImage}
          />
        ) : <View style={styles.controlPlaceholder} />}
        rightSlot={allowCameraToggle ? (
          <CameraFacingToggleButton
            accessibilityLabel={`Switch to ${cameraDirection === 'front' ? 'back' : 'front'} camera`}
            cameraFacing={cameraDirection}
            disabled={isUploading}
            onPress={handleToggleCamera}
          />
        ) : <View style={styles.controlPlaceholder} />}
      />
    </FullscreenOverlayScreen>
  );
}

const styles = StyleSheet.create({
  controlPlaceholder: {
    height: 48,
    width: 48,
  },
  errorBar: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.danger,
    justifyContent: 'center',
    minHeight: 66,
    paddingHorizontal: spacing.xxl,
    position: 'absolute',
    width: '100%',
  },
  errorText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  faceCenterLine: {
    opacity: 0.85,
    position: 'absolute',
    width: 2,
  },
  faceGuide: {
    alignItems: 'center',
    backgroundColor: colors.guideSurface,
    borderWidth: 5,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: shadows.guideGlow.shadowColor,
    shadowOffset: shadows.guideGlow.shadowOffset,
    shadowOpacity: shadows.guideGlow.shadowOpacity,
    shadowRadius: shadows.guideGlow.shadowRadius,
  },
  guideCenterLine: {
    backgroundColor: colors.white,
    opacity: 0.45,
    position: 'absolute',
    width: StyleSheet.hairlineWidth * 2,
  },
  closeButtonWrap: {
    zIndex: 20,
  },
  closeButton: {
    alignItems: 'center',
    height: iconSize.xl + spacing.xxl,
    justifyContent: 'center',
    width: iconSize.xl + spacing.xxl,
  },
  transparentCaptureButtonSurface: {
    backgroundColor: 'transparent',
  },
});
