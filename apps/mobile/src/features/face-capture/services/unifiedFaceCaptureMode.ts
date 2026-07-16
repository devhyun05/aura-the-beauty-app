import {parseFeatureFlagValue} from '../../../shared/config/featureFlags';

const UNIFIED_FACE_CAPTURE_DEFAULT = false;
const UNIFIED_FACE_CAPTURE_DIAGNOSTICS_DEFAULT = false;

export function isUnifiedFaceCaptureEnabled(
  value: string | null | undefined = process.env.EXPO_PUBLIC_UNIFIED_FACE_CAPTURE,
): boolean {
  return parseFeatureFlagValue(value, UNIFIED_FACE_CAPTURE_DEFAULT);
}

export function isUnifiedFaceCaptureDiagnosticsEnabled(
  value: string | null | undefined =
    process.env.EXPO_PUBLIC_UNIFIED_FACE_CAPTURE_DIAGNOSTICS,
): boolean {
  return parseFeatureFlagValue(value, UNIFIED_FACE_CAPTURE_DIAGNOSTICS_DEFAULT);
}
