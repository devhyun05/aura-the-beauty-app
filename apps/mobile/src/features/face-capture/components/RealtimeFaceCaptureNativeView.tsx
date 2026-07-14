import React, {forwardRef, useImperativeHandle, useRef} from 'react';
import {
  findNodeHandle,
  NativeModules,
  Platform,
  requireNativeComponent,
  UIManager,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';

import type {FaceCaptureBounds, FaceLandmarkMap} from '../services/faceCaptureValidation';

type CameraDirection = 'front' | 'back';

export type RealtimeFaceCaptureScreenPoint = {
  left: number;
  top: number;
  x?: number;
  y?: number;
};

export type RealtimeMediaPipeLandmarkKey =
  | 'forehead'
  | 'noseBridge'
  | 'noseTip'
  | 'chin'
  | 'leftEye'
  | 'rightEye'
  | 'mouthLeft'
  | 'mouthRight'
  | 'upperLip'
  | 'lowerLip';

export type RealtimeMediaPipePoint = {
  x: number;
  y: number;
  z?: number;
};

export type RealtimeMediaPipePayload = {
  error?: string;
  faceWidthRatio?: number;
  landmarkCount?: number;
  landmarks?: Partial<Record<RealtimeMediaPipeLandmarkKey, RealtimeMediaPipePoint>>;
  pitchDeg?: number;
  // geometry 폴백에서만 방출: 입꼬리 쌍이 없어 pitch 를 계측하지 못하면 false.
  // 이때 pitchDeg 는 0(placeholder)이므로 '측정된 0'과 구분해야 한다 — face_analysis
  // pitch 게이트가 false 를 결측으로 보고 재촬영을 유도한다(코덱스 #245-4).
  // vision/matrix 경로는 이 키를 방출하지 않으며(=측정됨) undefined 로 남는다.
  pitchMeasured?: boolean;
  // 'vision': VNFaceObservation 이 직접 제공하는 각도 (Vision 폴백 경로의 기본).
  // 'geometry': 5점 랜드마크 근사 (vision 각도 미제공 시 2차 폴백).
  poseSource?: 'matrix' | 'vision' | 'geometry' | 'geometry_unavailable';
  // 투영 앵커 원격 계측: 화면 공간 눈선 기울기(|Δy|/|Δx|). pose roll≈0 인데
  // 이 값이 크면 정준→device→layer 변환이 틀렸다는 원격 증거 (계측 전용).
  projectionEyeTilt?: number;
  rollDeg?: number;
  screenLandmarks?: Partial<Record<RealtimeMediaPipeLandmarkKey, RealtimeFaceCaptureScreenPoint>>;
  status: 'ok' | 'no_face' | 'landmark_missing';
  yawDeg?: number;
};

export type RealtimeCameraStabilityPayload = {
  adjustingExposure?: boolean;
  adjustingFocus?: boolean;
  adjustingWhiteBalance?: boolean;
  exposureDurationMs?: number;
  focusSupported?: boolean;
  isStable?: boolean | number;
  iso?: number;
  lensPosition?: number;
  stableDurationMs?: number;
  stableThresholdMs?: number;
  status?: 'ok' | 'camera_unavailable';
  whiteBalanceGains?: {
    blue?: number;
    green?: number;
    red?: number;
  };
};

export type NativeCameraCaptureMetadata = RealtimeCameraStabilityPayload & {
  captureLockedAtMs?: number;
  exposureLocked?: boolean;
  focusLocked?: boolean;
  lockError?: string | null;
  whiteBalanceLocked?: boolean;
};

// Apple semantic segmentation matte(hair/skin) 임베드 결과.
// requested: 촬영 시 matte delivery를 요청했는지 (semanticMatteCapture prop + 기기 지원).
// hair/skin: AVCapturePhoto가 실제로 해당 matte를 전달했는지.
export type SemanticMatteAvailability = {
  hair: boolean;
  requested: boolean;
  skin: boolean;
};

export type RealtimeCameraCaptureResult = {
  cameraMetadata?: NativeCameraCaptureMetadata;
  format?: 'jpg' | 'png' | 'heic';
  height?: number;
  // matte:capability probe 결과 (rung/device/preset/availableTypes...) — 로깅용
  matteCapability?: Record<string, unknown>;
  semanticMattes?: SemanticMatteAvailability;
  uri: string;
  width?: number;
};

export type RealtimeFaceCaptureLandmarkPayload = {
  bounds?: FaceCaptureBounds;
  cameraStability?: RealtimeCameraStabilityPayload;
  confidence?: number;
  // raw 눈선 축 진단: ratio = |Δx|/|Δy| (>=1 이면 horizontal). 프레임 회전
  // 자가판정의 입력 증거 — 스크린샷/로그만으로 좌표 규약 문제를 판독하기 위함.
  eyeAxis?: 'horizontal' | 'vertical';
  eyeAxisRatio?: number;
  faceCount: number;
  // 이번 프레임에 적용된 좌표 프레임 회전(hysteresis 잠금값)과 원시 판정값.
  // 'upright' = 종전 동작과 동일. AURARealtimeGeometry.h 계약 참조.
  frameRotation?: 'upright' | 'rot90cw' | 'rot90ccw' | 'rot180' | 'unknown';
  frameRotationDetected?: 'upright' | 'rot90cw' | 'rot90ccw' | 'rot180' | 'unknown';
  frameRotationLocked?: boolean;
  imageHeight?: number;
  imageWidth?: number;
  landmarks?: FaceLandmarkMap;
  mediaPipe?: RealtimeMediaPipePayload;
  screenLandmarks?: Partial<Record<'forehead' | 'chin', RealtimeFaceCaptureScreenPoint>>;
  sequence?: number;
  status:
    | 'ok'
    | 'no_face'
    | 'no_landmarks'
    | 'permission_denied'
    | 'camera_unavailable'
    | 'input_unavailable'
    | 'detection_failed';
};

type NativeRealtimeFaceCaptureProps = ViewProps & {
  facing?: CameraDirection;
  onLandmarksDetected?: (
    event: NativeSyntheticEvent<RealtimeFaceCaptureLandmarkPayload>,
  ) => void;
  // 기본 false. true 면 네이티브가 TrueDepth/semantic matte delivery 를 구성한다.
  // lab 전용이 아니다 — CameraFaceCaptureScreen 이 face_analysis/personal_color/
  // hair_analysis 촬영(greenlight 요구 시)에서 켠다(코덱스 #245-6 으로 주 흐름
  // 편입, 2026-07-13 주석 정정). matte 촬영은 stall 시 watchdog fallback 경로
  // (AURARealtimeFaceCaptureView.m)를 타므로 주 흐름 품질에 직접 영향한다.
  semanticMatteCapture?: boolean;
};

type NativeRealtimeFaceCaptureModule = {
  capture?: (reactTag: number) => Promise<RealtimeCameraCaptureResult>;
  stopSession?: (reactTag: number) => Promise<{stopped: boolean}>;
};

export type RealtimeFaceCaptureNativeViewHandle = {
  capture: () => Promise<RealtimeCameraCaptureResult>;
  stop: () => Promise<void>;
};

const NATIVE_VIEW_NAME = 'AURARealtimeFaceCaptureView';

function getNativeRealtimeFaceCaptureModule(): NativeRealtimeFaceCaptureModule | undefined {
  return NativeModules[NATIVE_VIEW_NAME] as NativeRealtimeFaceCaptureModule | undefined;
}

let NativeRealtimeFaceCaptureView: React.ComponentType<NativeRealtimeFaceCaptureProps> | null = null;

if (Platform.OS === 'ios') {
  try {
    NativeRealtimeFaceCaptureView =
      requireNativeComponent<NativeRealtimeFaceCaptureProps>(NATIVE_VIEW_NAME);
  } catch {
    NativeRealtimeFaceCaptureView = null;
  }
}

export function isRealtimeFaceCaptureAvailable(): boolean {
  if (Platform.OS !== 'ios') {
    return false;
  }

  if (!UIManager.getViewManagerConfig?.(NATIVE_VIEW_NAME)) {
    return false;
  }

  return (
    NativeRealtimeFaceCaptureView !== null &&
    typeof getNativeRealtimeFaceCaptureModule()?.capture === 'function'
  );
}

export const RealtimeFaceCaptureNativeView = forwardRef<
  RealtimeFaceCaptureNativeViewHandle,
  NativeRealtimeFaceCaptureProps
>(function RealtimeFaceCaptureNativeView(props, ref) {
  const nativeViewRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    async capture() {
      const nativeModule = getNativeRealtimeFaceCaptureModule();
      const reactTag = findNodeHandle(nativeViewRef.current);

      if (!nativeModule?.capture || !reactTag) {
        throw new Error('Realtime face capture native view is not available.');
      }

      return nativeModule.capture(reactTag);
    },
    async stop() {
      const nativeModule = getNativeRealtimeFaceCaptureModule();
      const reactTag = findNodeHandle(nativeViewRef.current);

      if (!nativeModule?.stopSession || !reactTag) {
        throw new Error('Realtime face capture camera release is not available.');
      }

      await nativeModule.stopSession(reactTag);
    },
  }));

  if (!NativeRealtimeFaceCaptureView) {
    return null;
  }

  return <NativeRealtimeFaceCaptureView {...props} ref={nativeViewRef as any} />;
});
