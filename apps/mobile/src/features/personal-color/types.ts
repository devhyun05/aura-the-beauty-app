// 퍼스널 컬러 feature 공개 타입. 순수 계약은 personalColorCore/contracts에서 재노출.

export type {
  AuraPersonalColorResult,
  AuraAxis,
  AuraRegionMeasurement,
  AxisName,
  ColorFamily,
  NativePersonalColorResult,
  NativeRegionStats,
  PaletteItem,
  PersonalColor12Type,
  PersonalColorPrivacy,
  PersonalColorSeason,
  PersonalColorStatus,
  RegionKey,
  ToneResult,
} from './services/personalColorCore/contracts';

export { PERSONAL_COLOR_SCHEMA_VERSION, PERSONAL_COLOR_PRIVACY } from './services/personalColorCore/contracts';

// 촬영 시점 카메라 메타 — 조명 보정(A/B)·greenlight·디버그용. 전부 optional.
export type PersonalColorCameraMetadata = {
  iso?: number;
  exposureDurationMs?: number;
  whiteBalanceGains?: { red?: number; green?: number; blue?: number };
  adjustingWhiteBalance?: boolean;
  adjustingExposure?: boolean;
  adjustingFocus?: boolean;
  isStable?: boolean | number;
};

// 얼굴분석 보고서 카드용 조명 보정 상태 요약 (flowState 경유 전달).
// applied=true 면 보고서가 corrected 결과를 메인으로 표시 중이라는 뜻이고,
// false 면 baseline + 미적용 사유를 표시한다 (조용한 실패 금지 — 사유 항상 노출).
export type PersonalColorCorrectionStatus = {
  applied: boolean;
  reasons: string[];
};

// 캡처 → 분석 입력 (face-capture 결과에서 온다)
export type PersonalColorCaptureInput = {
  captureId: string;
  createdAt: string;
  sessionId: string;
  imageUri: string;
  // 촬영 시점 카메라 메타(AE/AWB lock, WB gains 등) — 조명 보정(A/B)/디버그용
  cameraMetadata?: PersonalColorCameraMetadata | null;
  frameCount?: number;
  calibrationApplied?: boolean;
  calibrationVersion?: string | null;
};
