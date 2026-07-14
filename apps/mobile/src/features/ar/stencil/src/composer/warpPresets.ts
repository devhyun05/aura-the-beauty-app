/**
 * 보정 레인(보정 필터) — 목업 v2 "레인 분리" 규약.
 * 보정(얼굴형 워프)은 메이크업 룩 조합에 절대 포함되지 않는 별도 레인이다.
 * 보정 프리셋 = 워프 파라미터 묶음. 내 스타일 저장물은 (메이크업 룩, FIT 세트)
 * 두 레인을 참조하는 한 쌍이 된다(lookStore.UserStyleV2).
 *
 * 워프 필드는 FilterParams 안에 살지만(브리지 계약 유지) 소유는 이 레인이
 * 단독으로 한다 — 컴포저(룩 트리)는 워프 필드를 건드리지 않는다
 * (model.ts PASSTHROUGH와 같은 원칙).
 */
import type { FilterParams } from '../bridge/types';

/** 보정 레인이 소유하는 워프 필드 전부. 새 워프 부위는 여기에만 추가하면
 *  프리셋·에디터·저장이 전부 따라온다. */
export const WARP_KEYS = [
  'eyeEnlarge',
  'chinScale',
  'jawWidth',
  'chinLength',
  'lowerFaceScale',
  'jawCorner',
  'cheekWidth',
  'mouthScale',
  'noseWingScale',
  'noseBridge',
  'foreheadHeight',
  'browLift',
  'browTilt',
  'browGap',
] as const;

export type WarpKey = (typeof WARP_KEYS)[number];
export type WarpParams = Partial<Record<WarpKey, number>>;

/** 보정 프리셋(내장 보정 필터) 한 벌. */
export interface WarpPreset {
  id: string;
  name: string;
  params: WarpParams;
}

/**
 * 워프 에디터 슬라이더 선언 — 오퍼레이터 그룹별(설계 섹션 10: 방사/윤곽밀기).
 * 범위는 기존 '보정' 탭과 동일하게 유지할 것(레거시 UI에서 이관).
 * signed=true → 부호형(−range..+range, 0=원래), false → 0..1.
 */
export interface WarpSliderDef {
  key: WarpKey;
  label: string;
  signed: boolean;
  /** 부호형일 때 절대 최대값 (슬라이더 매핑용). 0..1형은 무시 */
  range?: number;
  /** 부위별 그룹(방사/윤곽밀기 대신 얼굴 부위로 분류) */
  group: '이마' | '눈썹' | '눈' | '코' | '볼' | '입' | '턱';
}

export const WARP_SLIDERS: WarpSliderDef[] = [
  { key: 'foreheadHeight', label: '이마 높이', signed: true, range: 1, group: '이마' },
  { key: 'browLift', label: '눈썹 올리기', signed: true, range: 1, group: '눈썹' },
  { key: 'browTilt', label: '눈썹 꼬리', signed: true, range: 1, group: '눈썹' },
  { key: 'browGap', label: '눈썹 간격', signed: true, range: 1, group: '눈썹' },
  { key: 'eyeEnlarge', label: '눈 확대', signed: false, group: '눈' },
  { key: 'noseWingScale', label: '콧볼', signed: true, range: 1, group: '코' },
  { key: 'noseBridge', label: '콧대 (−=슬림)', signed: true, range: 1, group: '코' },
  { key: 'cheekWidth', label: '광대 폭', signed: true, range: 1, group: '볼' },
  { key: 'mouthScale', label: '입 크기', signed: true, range: 1, group: '입' },
  { key: 'chinScale', label: '턱끝 크기', signed: true, range: 1, group: '턱' },
  { key: 'jawWidth', label: '턱 너비', signed: true, range: 1, group: '턱' },
  { key: 'chinLength', label: '턱 길이', signed: true, range: 1, group: '턱' },
  { key: 'jawCorner', label: '사각턱', signed: true, range: 1, group: '턱' },
  { key: 'lowerFaceScale', label: '하관(동안)', signed: true, range: 1, group: '턱' },
];

/** 워프 부위 그룹(FIT 부위 탭). */
export type WarpGroup = WarpSliderDef['group'];

/** 부위별 보정 프리셋 — 그 부위 키만 건드리는 작은 룩. 메이크업의 부위 룩과 대칭. */
export interface FitPartPreset {
  id: string;
  name: string;
  params: WarpParams;
}

/**
 * 부위별 프리셋 — FIT 부위 탭 카드. 고르면 그 부위 키만 세팅(다른 부위 불변),
 * '없음'은 UI에서 그 부위 키를 0으로. 전체 보정 = 부위 선택들의 합성.
 */
export const PART_PRESETS: Record<WarpGroup, FitPartPreset[]> = {
  이마: [
    { id: 'fh-up', name: '높게', params: { foreheadHeight: 0.4 } },
    { id: 'fh-down', name: '낮게', params: { foreheadHeight: -0.35 } },
  ],
  눈썹: [
    { id: 'bw-lift', name: '올림', params: { browLift: 0.4 } },
    { id: 'bw-arch', name: '아치', params: { browTilt: 0.45 } },
    { id: 'bw-flat', name: '일자', params: { browTilt: -0.3 } },
    { id: 'bw-near', name: '좁게', params: { browGap: -0.3 } },
  ],
  눈: [
    { id: 'eye-soft', name: '살짝', params: { eyeEnlarge: 0.15 } },
    { id: 'eye-big', name: '크게', params: { eyeEnlarge: 0.32 } },
    { id: 'eye-doll', name: '인형눈', params: { eyeEnlarge: 0.5 } },
  ],
  코: [
    { id: 'nose-wing', name: '콧볼축소', params: { noseWingScale: -0.3 } },
    { id: 'nose-slim', name: '슬림', params: { noseBridge: -0.4 } },
    { id: 'nose-tall', name: '오뚝', params: { noseBridge: 0.3, noseWingScale: -0.15 } },
  ],
  볼: [
    { id: 'cheek-slim', name: '갸름', params: { cheekWidth: -0.32 } },
    { id: 'cheek-full', name: '통통', params: { cheekWidth: 0.2 } },
  ],
  입: [
    { id: 'mouth-small', name: '작게', params: { mouthScale: -0.2 } },
    { id: 'mouth-big', name: '크게', params: { mouthScale: 0.25 } },
  ],
  턱: [
    { id: 'jaw-v', name: 'V라인', params: { jawWidth: -0.32, chinLength: 0.15, jawCorner: -0.25 } },
    { id: 'jaw-slim', name: '갸름', params: { lowerFaceScale: -0.22, jawWidth: -0.2 } },
    { id: 'jaw-short', name: '짧게', params: { chinLength: -0.25 } },
    { id: 'jaw-baby', name: '동안', params: { lowerFaceScale: -0.35 } },
  ],
};

/** 내장 보정 프리셋 — 목업 v2 보정 레인 칩. '원본'(fit-none)이 보정 없는 상태. */
export const WARP_PRESETS: WarpPreset[] = [
  { id: 'fit-none', name: '원본', params: {} },
  {
    id: 'fit-natural',
    name: '자연 보정',
    params: { eyeEnlarge: 0.15, lowerFaceScale: -0.12, jawWidth: -0.1 },
  },
  {
    id: 'fit-brighteye',
    name: '또렷한눈',
    params: { eyeEnlarge: 0.45 },
  },
  {
    id: 'fit-vline',
    name: 'V라인',
    params: { jawWidth: -0.45, chinLength: 0.15, chinScale: -0.2, lowerFaceScale: -0.15 },
  },
  {
    id: 'fit-baby',
    name: '동안',
    params: { lowerFaceScale: -0.4, eyeEnlarge: 0.22, mouthScale: 0.08 },
  },
  {
    id: 'fit-doll',
    name: '인형눈',
    params: { eyeEnlarge: 0.6, noseWingScale: -0.12 },
  },
  {
    id: 'fit-slim',
    name: '갸름하게',
    params: { cheekWidth: -0.35, jawWidth: -0.28, jawCorner: -0.2 },
  },
  {
    id: 'fit-nose',
    name: '슬림 코',
    params: { noseBridge: -0.45, noseWingScale: -0.15 },
  },
  {
    id: 'fit-brow',
    name: '시원한 인상',
    params: { browLift: 0.35, browTilt: 0.2, foreheadHeight: 0.25 },
  },
];

/** 보정 레인 상태 — 어떤 필터에서 출발했고(dirty=사본 위 수정 여부) 현재 값. */
export interface WarpLane {
  /** 출발 프리셋/내 필터의 id ('fit-none' 등). 저장 시 dirty면 사본 참조로 분리 */
  ref: string;
  /** 칩 라벨용 이름 */
  name: string;
  params: WarpParams;
  /** 편집 중 무질문 원칙 — 수정되면 true, 칩에 * 표시 */
  dirty: boolean;
}

/** 사용자가 저장한 FIT 필터(내 보정). */
export interface UserWarpFilter {
  id: string;
  name: string;
  createdAt: number;
  params: WarpParams;
}

export function emptyWarpLane(): WarpLane {
  return { ref: 'fit-none', name: '원본', params: {}, dirty: false };
}

export function warpLaneFrom(preset: WarpPreset | UserWarpFilter): WarpLane {
  return { ref: preset.id, name: preset.name, params: { ...preset.params }, dirty: false };
}

/**
 * 보정 레인을 FilterParams에 기입한다(보정 강도 gain 0..1 곱). 워프 필드는
 * 전역 메이크업 농도와 무관 — 이 함수가 유일한 기입 경로다.
 * 레인에 없는 키는 0으로 리셋해 이전 필터 잔재를 지운다.
 */
export function applyWarpToParams(
  params: FilterParams,
  lane: WarpLane,
  gain: number,
): FilterParams {
  const out = { ...params };
  const g = Math.max(0, Math.min(1, gain));
  for (const k of WARP_KEYS) {
    (out as any)[k] = (lane.params[k] ?? 0) * g;
  }
  return out;
}

/** 워프 필드만 뽑는다 — 저장/시드 시 현재 params에서 레인을 복원할 때. */
export function extractWarp(params: FilterParams): WarpParams {
  const out: WarpParams = {};
  for (const k of WARP_KEYS) {
    const v = (params[k] as number) ?? 0;
    if (v !== 0) out[k] = v;
  }
  return out;
}

/** 레인에 실제 효과가 하나라도 있는가 (칩 표시·저장 요약용) */
export function warpLaneActive(lane: WarpLane): boolean {
  return WARP_KEYS.some(k => (lane.params[k] ?? 0) !== 0);
}
