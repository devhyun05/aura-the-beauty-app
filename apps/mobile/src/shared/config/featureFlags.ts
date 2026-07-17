// 앱 전역 feature flags.
//
// auradinPrimarySurface — R1(B1) 표면 전환 (아우라딘 종합보고서 §13 R1):
//   true  → 얼굴분석 완료·리포트 상세의 추천 랜딩이 Auradin (personalColor 자동 첨부)
//   false → 레거시 ProductRecommendation 유지 (기본 — 안전)
// 분기는 라우팅 1지점(ProductRecommendationRouteScreen)에서만 일어난다.
// 켜기: EXPO_PUBLIC_AURADIN_PRIMARY_SURFACE=1 (또는 true/on/yes).

const AURADIN_PRIMARY_SURFACE_DEFAULT = false;
const MAKEUP_JOURNEY_DEFAULT = false;

const TRUTHY_FLAG_VALUES = new Set(['1', 'true', 'on', 'yes']);
const FALSY_FLAG_VALUES = new Set(['0', 'false', 'off', 'no']);

// env 문자열 → boolean. 인식 불가 값은 fallback(안전한 기본값)으로 처리한다.
export function parseFeatureFlagValue(
  value: string | null | undefined,
  fallback: boolean,
): boolean {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (TRUTHY_FLAG_VALUES.has(normalized)) {
    return true;
  }

  if (FALSY_FLAG_VALUES.has(normalized)) {
    return false;
  }

  return fallback;
}

export function isAuradinPrimarySurfaceEnabled(): boolean {
  return parseFeatureFlagValue(
    process.env.EXPO_PUBLIC_AURADIN_PRIMARY_SURFACE,
    AURADIN_PRIMARY_SURFACE_DEFAULT,
  );
}

/**
 * 서버 선배포 뒤 앱 표면만 즉시 되돌릴 수 있는 메이크업 성장 롤아웃 스위치다.
 * 환경값이 없거나 잘못되면 숨겨져, 배포 경로가 달라도 롤아웃이 fail-closed다.
 */
export function isMakeupJourneyEnabled(): boolean {
  return parseFeatureFlagValue(
    process.env.EXPO_PUBLIC_MAKEUP_JOURNEY_ENABLED,
    MAKEUP_JOURNEY_DEFAULT,
  );
}
