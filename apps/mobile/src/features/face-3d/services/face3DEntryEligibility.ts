export const FACE_3D_NATIVE_CAPTURE_REQUIRED_MESSAGE =
  'Face3D Lab은 실기기 네이티브 얼굴 촬영 경로가 필요합니다. iOS 앱을 재빌드하세요.';

type Face3DCaptureSource = 'camera' | 'gallery';

type Face3DEntryGreenlightReport = {
  cameraStabilityGreenlight: boolean;
  finalCaptureGreenlight: boolean;
  mediaPipeAlignmentGreenlight: boolean;
  message: string;
  nativeCameraMetadata?: unknown;
};

export type Face3DEntryEligibility =
  | {eligible: true}
  | {eligible: false; message: string};

export function evaluateFace3DEntryEligibility({
  greenlightReport,
  source,
}: {
  greenlightReport?: Face3DEntryGreenlightReport;
  source: Face3DCaptureSource;
}): Face3DEntryEligibility {
  if (
    source !== 'camera' ||
    !greenlightReport ||
    !greenlightReport.nativeCameraMetadata
  ) {
    return {eligible: false, message: FACE_3D_NATIVE_CAPTURE_REQUIRED_MESSAGE};
  }

  if (
    !greenlightReport.finalCaptureGreenlight ||
    !greenlightReport.cameraStabilityGreenlight ||
    !greenlightReport.mediaPipeAlignmentGreenlight
  ) {
    return {
      eligible: false,
      message: `3D 측정 촬영 기준을 통과하지 못했습니다. ${greenlightReport.message}`,
    };
  }

  return {eligible: true};
}
