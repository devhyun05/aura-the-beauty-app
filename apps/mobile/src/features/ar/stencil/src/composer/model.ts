/**
 * 컴포저 레이어 모델 — "모델은 RN에만, 브리지엔 컴파일된 커맨드만"(설계 섹션 00).
 * 레이어 스택은 순수 UI 모델이고, compileLayers가 기존 브리지 커맨드 재료
 * (FilterParams + OverlayLayer[])로 눌러 편다. 저장 포맷(UserStyle)도 컴파일
 * 결과를 그대로 쓰므로 스토리지 스키마 변경이 없고, 재편집은 seedLayers로
 * 현재 룩을 다시 레이어로 분해해서 연다.
 */
import type {
  EyeshadowLayer,
  FilterParams,
  LensLayer,
  OverlayLayer,
} from '../bridge/types';
import { BARE } from '../presets';
import {
  decoRegionFromKind,
  isDecoRegion,
  isLensRegion,
  LENS_DEFAULTS,
  REGION_DEFS,
  REGION_MAP,
  regionOwnKeys,
} from './regions';
import type { RegionKey } from './regions';

// 캐노니컬 오버레이 스파이크(N장 합성) — Unity 셰이더 슬롯 수와 일치해야 한다.
export const MAX_OVERLAY_LAYERS = 4;

// 렌즈 레이어드(#25) 슬롯 상한 — Unity IrisRenderer.MaxLensLayers·Iris.shader LENS_MAX와 일치.
export const MAX_LENS_LAYERS = 6;

// 아이섀도 멀티밴드(A14) 상한 — Unity IrisRenderer.MaxEyeshadowLayers와 일치.
export const MAX_EYESHADOW_LAYERS = 4;

/** 아이섀도 잎 params → 밴드 페이로드. 생략 필드는 Unity 규약(0/기본)으로 채운다. */
function eyeshadowLayerFromParams(p: Partial<FilterParams>): EyeshadowLayer {
  return {
    color: p.eyeshadowColor ?? '#C9A0A0',
    color2: p.eyeshadowColor2 ?? p.eyeshadowColor ?? '#C9A0A0',
    intensity: p.eyeshadowIntensity ?? 0,
    finish: p.eyeshadowFinish ?? 0,
    shape: p.eyeshadowShape ?? 0,
    gradient: p.eyeshadowGradient ?? 0,
    height: p.eyeshadowHeight ?? 1,
    shimmer: p.eyeshadowShimmer ?? 0.5,
  };
}

// 내장 소프트 점 레이어 경로 (Unity ImageFileLoader.BuiltinDotPath와 일치) —
// 그림 임포트 없이 색소 틴트 점(비대칭 블러셔 등)을 얹는다.
export const BUILTIN_DOT = 'builtin:dot';

/** 컴포저 레이어 한 장. 배열 순서 = 그리기 순서(뒤 원소가 위 = 앞). */
export interface ComposerLayer {
  id: string;
  region: RegionKey;
  /** 눈 아이콘 토글 — 꺼진 레이어는 컴파일에서 제외(필드가 BARE=0으로 남는다) */
  visible: boolean;
  /** 부위 소유 필드만 담는 부분 파라미터(풀강도). 컴파일 시 BARE 위에 병합 */
  params: Partial<FilterParams>;
  /** isDecoRegion(region)일 때 캐노니컬 오버레이 한 장(데코 5종 공통 payload) */
  overlay?: OverlayLayer;
  /** region이 렌즈 세부(lensBase/lensDetail/lensRim, #25)일 때 렌즈 레이어 한 장 */
  lens?: LensLayer;
  /** 역할 태그(§5 A13) — 같은 부위 겹의 배치 역할('.부위[역할]' 핏 셀렉터 대상) */
  role?: string;
  /** 핏 시트 참조 사슬(가까운 조상 먼저) — flattenTree가 주석, applyFitToLayers가 소비 */
  fitChain?: string[];
  /** 제품 참조(§5 A12) — 색·마감·농도의 출처. null/부재=커스텀(잎 params가 전부).
   *  applyProductsToLayers가 컴파일 직전 번역값을 깐다(leaf.params가 이김). */
  productId?: string | null;
  /** 테크닉(§5) — Phase A는 강도만. coverage⊗강도가 부위 intensity로 번역된다 */
  technique?: { strength: number };
}

let seq = 0;

/** 부위를 골라 새 레이어를 만든다. 데코는 내장 점으로 시작(그림은 텍스처 탭에서 교체). */
export function newLayer(region: RegionKey, current: FilterParams): ComposerLayer {
  const id = `c${++seq}`;
  if (isDecoRegion(region)) {
    // 데코 세부부위 5종 — 전부 자유 배치 오버레이. 점(deco)=색소 틴트, 나머지(타투·젬·
    // 페인팅·기타)=그림 데칼(스티커, 원본색)로 시작. kind=region으로 왕복 보존.
    const isDot = region === 'deco';
    return {
      id,
      region,
      visible: true,
      params: {},
      overlay: {
        path: BUILTIN_DOT, // 그림은 텍스처 탭에서 교체
        intensity: 0.7,
        x: 0.35, // 왼볼 근사 시작점 — 배치 슬라이더로 옮겨 쓰는 전제
        y: 0.4,
        scale: 0.3,
        rotation: 0,
        blendMode: isDot ? 1 : 0, // 점=색소 틴트, 그 외=스티커(원본색)
        color: current.blushColor,
        kind: region,
      },
    };
  }
  if (isLensRegion(region)) {
    // 렌즈 세부(#25) — LensLayer payload를 캐리(deco 선례). params는 비운다.
    return { id, region, visible: true, params: {}, lens: { ...LENS_DEFAULTS[region] } };
  }
  return { id, region, visible: true, params: { ...REGION_MAP[region].defaults } };
}

// 어느 부위도 소유하지 않는 필드(얼굴형 워프 6종 등) — 컴포저가 건드리면 안 된다.
// BARE에서 시작하는 컴파일이 이 값들을 0으로 리셋해, 컴포저에서 레이어 하나만
// 편집해도 얼굴형 보정이 소실되던 버그(적대적 리뷰 확정). 카탈로그 선언에서 유도해
// 부위·필드가 늘어도 드리프트하지 않는다. faceOverlayIntensity는 컴파일이 직접 관리.
const REGION_OWNED = new Set<keyof FilterParams>([
  ...REGION_DEFS.flatMap(def => regionOwnKeys(def)),
  'faceOverlayIntensity',
]);
const PASSTHROUGH_KEYS = (Object.keys(BARE) as (keyof FilterParams)[]).filter(
  k => !REGION_OWNED.has(k),
);

/** 구형 하단 아이라인 저장물은 전용 색 없이 공유 eyelinerColor만 소유한다. */
function legacyLowerLinerColor(p: Partial<FilterParams>): string | undefined {
  return p.eyelinerLowerColor == null && typeof p.eyelinerColor === 'string'
    ? p.eyelinerColor
    : undefined;
}

/**
 * 레이어 스택 → 브리지 재료로 컴파일. BARE에서 시작해 보이는 레이어를 순서대로
 * 병합한다(부위 필드가 겹치면 위 레이어가 이긴다). 데코 레이어는 오버레이 배열로
 * 빠지고, 한 장이라도 있으면 마스터 강도를 켠다(레이어별 강도는 overlay.intensity).
 * carry가 있으면 부위 밖 필드(얼굴형 워프 등)를 현재 룩에서 그대로 물려받는다.
 */
export function compileLayers(
  layers: ComposerLayer[],
  carry?: FilterParams,
): {
  params: FilterParams;
  overlayLayers: OverlayLayer[];
  lensLayers: LensLayer[];
  eyeshadowLayers: EyeshadowLayer[];
} {
  const params: FilterParams = { ...BARE };
  if (carry) {
    for (const k of PASSTHROUGH_KEYS) {
      // 선택적 필드 혼재로 인덱스 대입은 any 경유 (scaleParams와 동일 패턴).
      (params as any)[k] = carry[k];
    }
  }
  const overlayLayers: OverlayLayer[] = [];
  const lensLeaves: LensLayer[] = [];
  // 아이섀도 잎은 모아뒀다가(A14) 겹 수로 분기 — 1개는 legacy 스칼라, 2+는 멀티밴드.
  const eyeshadowLeaves: Partial<FilterParams>[] = [];
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (isDecoRegion(layer.region)) {
      // 데코 세부부위 5종 — 전부 오버레이 배열로. kind=세부부위로 왕복 보존(렌더 무관).
      if (layer.overlay && overlayLayers.length < MAX_OVERLAY_LAYERS) {
        overlayLayers.push({ ...layer.overlay, kind: layer.region });
      }
      continue;
    }
    if (isLensRegion(layer.region)) {
      // 렌즈 세부(#25) — payload를 렌즈 배열로(overlay 선례). params 병합 안 함.
      if (layer.lens) lensLeaves.push(layer.lens);
      continue;
    }
    if (layer.region === 'eyeshadow') {
      eyeshadowLeaves.push(layer.params);
      continue; // params 병합은 아래에서 겹 수로 분기
    }
    Object.assign(params, layer.params);
    if (layer.region === 'eyelinerLower') {
      const legacyColor = legacyLowerLinerColor(layer.params);
      if (legacyColor !== undefined) params.eyelinerLowerColor = legacyColor;
    }
  }
  // 아이섀도 겹 수 분기(A14): 1개 이하 = legacy(params 스칼라·배열 빈값 → Unity 스칼라
  // 경로), 2개 이상 = 멀티밴드 배열(params엔 안 실어 Unity가 배열 경로로 감).
  const eyeshadowLayers: EyeshadowLayer[] =
    eyeshadowLeaves.length >= 2
      ? eyeshadowLeaves.slice(0, MAX_EYESHADOW_LAYERS).map(eyeshadowLayerFromParams)
      : [];
  if (eyeshadowLeaves.length === 1) Object.assign(params, eyeshadowLeaves[0]);
  if (overlayLayers.length > 0 && params.faceOverlayIntensity === 0) {
    params.faceOverlayIntensity = 0.85;
  }
  // 세부 순서 고정(베이스<내부<림) + 세부 내 겹 순서 보존(안정 정렬) → Unity가 순서대로
  // over 합성한다. MAX 초과분은 자른다(Unity도 방어하지만 배선 단계에서 상한 준수).
  const lensLayers = lensLeaves
    .map((lens, i) => ({ lens, i }))
    .sort((a, b) => a.lens.part - b.lens.part || a.i - b.i)
    .slice(0, MAX_LENS_LAYERS)
    .map(x => x.lens);
  return { params, overlayLayers, lensLayers, eyeshadowLayers };
}

/**
 * 현재 룩(플랫 파라미터 + 오버레이 스택)을 레이어 스택으로 분해한다 — 컴포저를
 * 열 때의 시드이자 저장된 스타일 재편집 경로. 부위 강도 필드가 하나라도 켜져
 * 있으면 그 부위 소유 필드를 통째로 레이어에 옮긴다.
 */
export function seedLayers(
  params: FilterParams,
  overlayLayers: OverlayLayer[],
  lensLayers: LensLayer[] = [],
  eyeshadowLayers: EyeshadowLayer[] = [],
): ComposerLayer[] {
  const layers: ComposerLayer[] = [];
  for (const def of REGION_DEFS) {
    if (isDecoRegion(def.key) || isLensRegion(def.key)) continue;
    // 아이섀도 멀티밴드(A14)가 있으면 여기서 단일 잎 복원을 건너뛴다(배열로 복원).
    if (def.key === 'eyeshadow' && eyeshadowLayers.length >= 2) continue;
    const on = def.onKeys.some(k => ((params[k] as number) ?? 0) > 0);
    if (!on) continue;
    const own: Partial<FilterParams> = {};
    for (const k of regionOwnKeys(def)) {
      if (params[k] !== undefined) {
        (own as Record<string, unknown>)[k] = params[k];
      }
    }
    if (def.key === 'eyelinerLower') {
      const legacyColor = legacyLowerLinerColor(params);
      if (legacyColor !== undefined) own.eyelinerLowerColor = legacyColor;
    }
    layers.push({ id: `c${++seq}`, region: def.key, visible: true, params: own });
  }
  for (const overlay of overlayLayers) {
    // 데코 세부부위 역매핑 — overlay.kind로 5종 중 하나 복원(미상·legacy는 '점'=deco).
    layers.push({
      id: `c${++seq}`,
      region: decoRegionFromKind(overlay.kind),
      visible: true,
      params: {},
      overlay,
    });
  }
  // 렌즈 세부(#25) — payload part로 부위(lensBase/Detail/Rim) 역매핑해 잎 복원.
  for (const lens of lensLayers) {
    const region: RegionKey =
      lens.part === 2 ? 'lensRim' : lens.part === 1 ? 'lensDetail' : 'lensBase';
    layers.push({ id: `c${++seq}`, region, visible: true, params: {}, lens: { ...lens } });
  }
  // 아이섀도 멀티밴드(A14) — 밴드 배열을 eyeshadow 잎 여럿으로 역복원(배열 순서=겹 순서).
  if (eyeshadowLayers.length >= 2) {
    for (const band of eyeshadowLayers) {
      layers.push({
        id: `c${++seq}`,
        region: 'eyeshadow',
        visible: true,
        params: {
          eyeshadowColor: band.color,
          eyeshadowColor2: band.color2,
          eyeshadowIntensity: band.intensity,
          eyeshadowFinish: band.finish,
          eyeshadowShape: band.shape,
          eyeshadowGradient: band.gradient,
          eyeshadowHeight: band.height,
          eyeshadowShimmer: band.shimmer,
        },
      });
    }
  }
  return layers;
}
