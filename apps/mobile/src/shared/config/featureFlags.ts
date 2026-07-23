// 앱 전역 feature flags.
//
// auradinPrimarySurface — R1(B1) 표면 전환 (아우라딘 종합보고서 §13 R1):
//   true  → 얼굴분석 완료·리포트 상세의 추천 랜딩이 Auradin (personalColor 자동 첨부)
//   false → 레거시 ProductRecommendation 유지 (기본 — 안전)
// 분기는 라우팅 1지점(ProductRecommendationRouteScreen)에서만 일어난다.
// 켜기: EXPO_PUBLIC_AURADIN_PRIMARY_SURFACE=1 (또는 true/on/yes).

const AURADIN_PRIMARY_SURFACE_DEFAULT = false;
// 배포 경로에서 환경값이 누락돼도 성장 달력이 의도치 않게 노출되지 않도록 fail-closed.
// 개발/전용 배포에서는 EAS profile 또는 로컬 env에서 명시적으로 `1`을 지정한다.
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
 * 메이크업 성장 캘린더의 표시 스위치다.
 * 환경값이 없거나 잘못되면 숨겨져, EAS와 로컬 Release가 같은 기본 동작을 유지한다.
 */
export function isMakeupJourneyEnabled(): boolean {
  return parseFeatureFlagValue(
    process.env.EXPO_PUBLIC_MAKEUP_JOURNEY_ENABLED,
    MAKEUP_JOURNEY_DEFAULT,
  );
}
