// feature flag 파싱 단위 검증 (프로젝트 관례: expectEqual + tsc --noEmit 게이트).
// R1 게이트 3 — auradinPrimarySurface는 env 미설정 시 반드시 false(레거시 유지)여야 한다.

import {isAuradinPrimarySurfaceEnabled, parseFeatureFlagValue} from './featureFlags';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

// truthy 표기 4종
expectEqual(parseFeatureFlagValue('1', false), true, 'parses "1" as on');
expectEqual(parseFeatureFlagValue('true', false), true, 'parses "true" as on');
expectEqual(parseFeatureFlagValue('ON', false), true, 'parses "ON" case-insensitively');
expectEqual(parseFeatureFlagValue(' yes ', false), true, 'trims whitespace');

// falsy 표기 — 명시적 off는 fallback이 true여도 꺼진다
expectEqual(parseFeatureFlagValue('0', true), false, 'parses "0" as off');
expectEqual(parseFeatureFlagValue('false', true), false, 'parses "false" as off');
expectEqual(parseFeatureFlagValue('off', true), false, 'parses "off" as off');

// 미설정/빈 값/인식 불가 값 → fallback (안전한 기본값)
expectEqual(parseFeatureFlagValue(undefined, false), false, 'undefined falls back');
expectEqual(parseFeatureFlagValue(null, false), false, 'null falls back');
expectEqual(parseFeatureFlagValue('', false), false, 'empty falls back');
expectEqual(parseFeatureFlagValue('maybe', false), false, 'unknown value falls back');
expectEqual(parseFeatureFlagValue(undefined, true), true, 'fallback true is honored');

// R1 안전 기본값: env 미설정 환경에서 레거시 표면 유지
if (!process.env.EXPO_PUBLIC_AURADIN_PRIMARY_SURFACE) {
  expectEqual(
    isAuradinPrimarySurfaceEnabled(),
    false,
    'auradinPrimarySurface defaults to false (legacy surface)',
  );
}

console.log('featureFlags contract assertions passed');
