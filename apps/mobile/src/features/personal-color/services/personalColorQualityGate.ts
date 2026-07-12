// 캡처 품질 사전 게이트 (순수). 엔진 실행 전에 명백한 실패를 분류.
// 세밀한 축/신뢰도 게이팅은 엔진(measurementConfidence)이 담당.

import type { NativePersonalColorResult } from './personalColorCore/contracts';

export type PersonalColorQualityGate = {
  usable: boolean;
  warnings: string[];
};

export function evaluatePersonalColorQuality(native: NativePersonalColorResult): PersonalColorQualityGate {
  const warnings: string[] = [];

  if (native.status === 'unsupported') {
    return { usable: false, warnings: ['native_unsupported'] };
  }
  if (native.status === 'error') {
    return { usable: false, warnings: [`native_error_${native.error ?? 'unknown'}`] };
  }
  if (native.status === 'no_face' || native.faceCount < 1) {
    return { usable: false, warnings: ['no_face'] };
  }

  const regions = native.regions ?? {};
  const hasSkin = !!(regions.skinCheekLeft || regions.skinCheekRight || regions.skinForehead);
  if (!hasSkin) warnings.push('skin_region_missing');
  if (!regions.lip) warnings.push('lip_region_missing');
  if (native.matte && !native.matte.skinAvailable) warnings.push('skin_matte_unavailable');

  // 전 부위 과노출/저노출 경향 — 분석 부위(skin/hair/lip)만 집계한다. sclera 는
  // 조명 보정 입력일 뿐 분석 부위가 아니고, 그 노출값(대개 0)이 섞이면 skin/hair/lip
  // 이 모두 과노출이어도 every() 가 false 가 돼 경고가 사라진다(코덱스 minor).
  const analysisStats = [
    regions.skinCheekLeft,
    regions.skinCheekRight,
    regions.skinForehead,
    regions.hair,
    regions.lip,
  ].filter((s): s is NonNullable<typeof s> => !!s);
  const overHeavy = analysisStats.length > 0 && analysisStats.every(s => s.overexposedRatio > 0.25);
  const underHeavy = analysisStats.length > 0 && analysisStats.every(s => s.underexposedRatio > 0.25);
  if (overHeavy) warnings.push('capture_overexposed');
  if (underHeavy) warnings.push('capture_underexposed');

  return { usable: hasSkin, warnings };
}
