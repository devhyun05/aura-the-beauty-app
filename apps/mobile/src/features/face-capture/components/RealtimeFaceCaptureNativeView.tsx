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
  poseSource?: 'matrix' | 'geometry' | 'geometry_unavailable';
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
  faceCount: number;
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
  // 기본 false. true(face-capture-lab 전용)일 때만 네이티브가 TrueDepth/semantic matte
  // delivery를 구성한다 — main 앱 세션 설정은 불변. 네이티브 RCT_EXPORT_VIEW_PROPERTY와
  // 함께 사용해야 하며, 네이티브 구현 전에 이 prop을 전달하면 안 된다.
  semanticMatteCapture?: boolean;
};

type NativeRealtimeFaceCaptureModule = {
  capture?: (reactTag: number) => Promise<RealtimeCameraCaptureResult>;
};

export type RealtimeFaceCaptureNativeViewHandle = {
  capture: () => Promise<RealtimeCameraCaptureResult>;
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
  }));

  if (!NativeRealtimeFaceCaptureView) {
    return null;
  }

  return <NativeRealtimeFaceCaptureView {...props} ref={nativeViewRef as any} />;
});
