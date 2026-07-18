import {parseFeatureFlagValue} from '../../../shared/config/featureFlags';

// 통합 촬영은 한 번의 Unity micro-burst에서 사진과 ARKit 3D 데이터를 함께
// 수집하는 촬영 1회 UX 경로다. 네이티브 뷰 미지원·갤러리 입력은 라우팅
// 단계에서 자동으로 레거시 경로를 사용한다. 수집된 3D 값의 분석 적격 여부는
// face3DContract의 별도 신뢰도 게이트가 계속 결정한다.
const UNIFIED_FACE_CAPTURE_DIAGNOSTICS_DEFAULT = false;

export function isUnifiedFaceCaptureEnabled(
  _value: string | null | undefined = process.env.EXPO_PUBLIC_UNIFIED_FACE_CAPTURE,
): boolean {
  // 제품 얼굴 분석은 항상 통합 촬영을 사용한다. 빌드 환경에 남은 이전
  // EXPO_PUBLIC_UNIFIED_FACE_CAPTURE=off 값도 이 경로를 다시 끄지 못하게 한다.
  return true;
}

export function isUnifiedFaceCaptureDiagnosticsEnabled(
  value: string | null | undefined =
    process.env.EXPO_PUBLIC_UNIFIED_FACE_CAPTURE_DIAGNOSTICS,
): boolean {
  return parseFeatureFlagValue(value, UNIFIED_FACE_CAPTURE_DIAGNOSTICS_DEFAULT);
}
