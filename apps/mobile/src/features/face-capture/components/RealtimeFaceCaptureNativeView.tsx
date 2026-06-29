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

export type RealtimeFaceCaptureLandmarkPayload = {
  bounds?: FaceCaptureBounds;
  confidence?: number;
  faceCount: number;
  imageHeight?: number;
  imageWidth?: number;
  landmarks?: FaceLandmarkMap;
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
};

type NativeRealtimeFaceCaptureModule = {
  capture?: (reactTag: number) => Promise<{
    format?: 'jpg' | 'png';
    height?: number;
    uri: string;
    width?: number;
  }>;
};

export type RealtimeFaceCaptureNativeViewHandle = {
  capture: () => Promise<{
    format?: 'jpg' | 'png';
    height?: number;
    uri: string;
    width?: number;
  }>;
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
