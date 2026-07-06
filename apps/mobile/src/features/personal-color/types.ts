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

// 캡처 → 분석 입력 (face-capture 결과에서 온다)
export type PersonalColorCaptureInput = {
  captureId: string;
  createdAt: string;
  sessionId: string;
  imageUri: string;
  // 촬영 시점 카메라 메타(AE/AWB lock, WB gains 등) — colorLightingGreenlight/디버그용
  cameraMetadata?: Record<string, unknown>;
  frameCount?: number;
  calibrationApplied?: boolean;
  calibrationVersion?: string | null;
};
