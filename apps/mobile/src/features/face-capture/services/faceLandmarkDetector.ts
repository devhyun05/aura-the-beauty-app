import {NativeModules} from 'react-native';

import type {
  FaceCaptureBounds,
  FaceLandmarkMap,
} from './faceCaptureValidation';

export type NativeFaceLandmarkDetectionStatus =
  | 'ok'
  | 'no_face'
  | 'no_landmarks'
  | 'permission_denied'
  | 'camera_unavailable'
  | 'input_unavailable'
  | 'detection_failed'
  | 'unsupported';

export type NativeFaceScreenLandmarkPoint = {
  left: number;
  top: number;
  x?: number;
  y?: number;
};

export type NativeFaceLandmarkDetectionResult = {
  bounds?: FaceCaptureBounds;
  confidence?: number;
  error?: string;
  faceCount: number;
  imageHeight?: number;
  imageWidth?: number;
  landmarks?: FaceLandmarkMap;
  screenLandmarks?: Partial<Record<'forehead' | 'chin', NativeFaceScreenLandmarkPoint>>;
  sequence?: number;
  status: NativeFaceLandmarkDetectionStatus;
};

type NativeFaceLandmarkDetector = {
  detect?: (
    imageUri: string,
    options?: {deleteAfter?: boolean},
  ) => Promise<NativeFaceLandmarkDetectionResult>;
};

function getNativeFaceLandmarkDetector(): NativeFaceLandmarkDetector | undefined {
  return NativeModules.AURAFaceLandmarkDetector as NativeFaceLandmarkDetector | undefined;
}

export function isFaceLandmarkDetectorAvailable(): boolean {
  return typeof getNativeFaceLandmarkDetector()?.detect === 'function';
}

export async function detectFaceLandmarksFromImage(
  imageUri: string,
  options: {deleteAfter?: boolean} = {},
): Promise<NativeFaceLandmarkDetectionResult> {
  const detector = getNativeFaceLandmarkDetector();

  if (typeof detector?.detect !== 'function') {
    return {
      error: 'AURAFaceLandmarkDetector native module is not available. Rebuild the iOS app.',
      faceCount: 0,
      status: 'unsupported',
    };
  }

  return detector.detect(imageUri, options);
}
