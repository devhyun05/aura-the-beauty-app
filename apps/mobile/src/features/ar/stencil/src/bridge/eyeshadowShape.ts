import type {EyeshadowShape} from './types';

/** RN이 Unity로 넘기는 아이섀도 모양을 유한 정수 ID 0..11로 제한한다. */
export function normalizeEyeshadowShape(value: unknown): EyeshadowShape {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(11, Math.round(value))) as EyeshadowShape;
}

/** 구 하안검 3종 실루엣을 통합 12종 profile로 옮긴다. */
export function migrateLegacyLowerEyeshadowShape(value: unknown): EyeshadowShape {
  if (value === 1) return 10; // wide
  if (value === 2) return 6; // outer/tail
  return 0;
}
