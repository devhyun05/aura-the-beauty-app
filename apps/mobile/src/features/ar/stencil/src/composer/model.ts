/**
 * 컴포저 레이어 모델 — "모델은 RN에만, 브리지엔 컴파일된 커맨드만"(설계 섹션 00).
 * 레이어 스택은 순수 UI 모델이고, compileLayers가 기존 브리지 커맨드 재료
 * (FilterParams + OverlayLayer[])로 눌러 편다. 저장 포맷(UserStyle)도 컴파일
 * 결과를 그대로 쓰므로 스토리지 스키마 변경이 없고, 재편집은 seedLayers로
 * 현재 룩을 다시 레이어로 분해해서 연다.
 */
import type {
  EyeshadowLayer,
  EyeshadowLayerV2,
  EyeshadowSurface,
  FilterParams,
  LensLayer,
  OverlayLayer,
} from '../bridge/types';
import {
  migrateLegacyLowerEyeshadowShape,
  normalizeEyeshadowShape,
} from '../bridge/eyeshadowShape';
import { BARE } from '../presets';
import {
  decoRegionFromKind,
  FINISHES,
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
export const MAX_EYESHADOW_LAYERS_V2 = 8;
/** @deprecated 신규 코드는 V2 이름을 사용한다. */
export const MAX_EYESHADOW_LAYERS = MAX_EYESHADOW_LAYERS_V2;

const clamp = (value: number | undefined, lo: number, hi: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(lo, Math.min(hi, value as number)) : fallback;

const normalizeSurface = (value: unknown, fallback: EyeshadowSurface): EyeshadowSurface =>
  value === 0 || value === 1 || value === 2 ? value : fallback;

/** 구 eyeshadowLower 잎을 같은 잎의 단일 eyeshadow+surface=lower로 바꾼다. */
export function migrateLegacyEyeshadowLayer(
  region: RegionKey | 'eyeshadowLower',
  source: Partial<FilterParams>,
): {region: RegionKey; params: Partial<FilterParams>} {
  if (region !== 'eyeshadowLower') return {region, params: {...source}};
  const params: Partial<FilterParams> = {...source, eyeshadowSurface: 1};
  const mapping: [keyof FilterParams, keyof FilterParams][] = [
    ['eyeshadowLowerColor', 'eyeshadowColor'],
    ['eyeshadowLowerIntensity', 'eyeshadowIntensity'],
    ['eyeshadowLowerFinish', 'eyeshadowFinish'],
    ['eyeshadowLowerShimmer', 'eyeshadowShimmer'],
    ['eyeshadowLowerHeight', 'eyeshadowHeight'],
    ['eyeshadowLowerTexture', 'eyeshadowTexture'],
    ['eyeshadowLowerShape', 'eyeshadowShape'],
  ];
  for (const [legacy, current] of mapping) {
    if (source[legacy] !== undefined) {
      (params as any)[current] = legacy === 'eyeshadowLowerShape'
        ? migrateLegacyLowerEyeshadowShape(source[legacy])
        : source[legacy];
    }
    delete (params as any)[legacy];
  }
  return {region: 'eyeshadow', params};
}

/** 아이섀도 잎 params → 밴드 페이로드. 생략 필드는 Unity 규약(0/기본)으로 채운다. */
function eyeshadowLayerFromParams(
  p: Partial<FilterParams>,
  role?: string,
): EyeshadowLayerV2 {
  const surface = normalizeSurface(p.eyeshadowSurface, role === 'base' ? 2 : 0);
  const profile = normalizeEyeshadowShape(p.eyeshadowShape);
  return {
    surface,
    profile,
    shape: profile,
    color: p.eyeshadowColor ?? '#C9A0A0',
    color2: p.eyeshadowColor2 ?? p.eyeshadowColor ?? '#C9A0A0',
    intensity: clamp(p.eyeshadowIntensity, 0, 1.5, 0),
    finish: p.eyeshadowFinish ?? 0,
    gradient: p.eyeshadowGradient ?? 0,
    height: p.eyeshadowHeight ?? 1,
    shimmer: p.eyeshadowShimmer ?? 0.5,
    texture: p.eyeshadowTexture ?? -1,
    glossLo: p.eyeshadowGlossLo ?? 0,
    glossGain: p.eyeshadowGlossGain ?? 0,
    shimmerSize: p.eyeshadowShimmerSize ?? 0,
    shimmerDensity: p.eyeshadowShimmerDensity ?? 0,
    matte: p.eyeshadowMatte ?? 0,
    sheen: p.eyeshadowSheen ?? 0,
    particleSize: p.eyeshadowParticleSize ?? 0,
    particleDensity: p.eyeshadowParticleDensity ?? 0,
    material: p.eyeshadowMaterial ?? 0,
    materialStrength: p.eyeshadowMaterialStrength ?? 0.85,
    particleBrightness: p.eyeshadowParticleBrightness ?? 0.7,
    particleColor: p.eyeshadowParticleColor ?? '#FFF2D9',
    particleTwinkle: p.eyeshadowParticleTwinkle ?? 1,
    particleShape: p.eyeshadowParticleShape ?? 0,
    particleFeather: p.eyeshadowParticleFeather ?? 0,
    particleParallax: p.eyeshadowParticleParallax ?? 0,
    particleConfetti: p.eyeshadowParticleConfetti ?? 0,
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
  /** 제품 컬렉션의 선택 색상. 부재/고아는 제품 기본 colorway로 폴백한다. */
  colorwayId?: string;
  /** 테크닉(§5) — Phase A는 강도만. coverage⊗강도가 부위 intensity로 번역된다 */
  technique?: { strength: number };
}

let seq = 0;

/** 부위를 골라 새 레이어를 만든다. 데코는 내장 점으로 시작(그림은 텍스처 탭에서 교체). */
export function newLayer(region: RegionKey | 'eyeshadowLower', current: FilterParams): ComposerLayer {
  const id = `c${++seq}`;
  // 저장된 구 카탈로그가 legacy lower 키로 새 잎을 요구해도 UI 정의를 다시 노출하지 않고
  // 동일 eyeshadow 잎의 surface=lower로 즉시 승격한다.
  if (region === 'eyeshadowLower') {
    const migrated = migrateLegacyEyeshadowLayer(region, {
      ...REGION_MAP.eyeshadow.defaults,
      eyeshadowLowerColor: current.eyeshadowLowerColor,
      eyeshadowLowerIntensity: .3,
      eyeshadowLowerFinish: current.eyeshadowLowerFinish,
      eyeshadowLowerShimmer: current.eyeshadowLowerShimmer,
      eyeshadowLowerTexture: current.eyeshadowLowerTexture,
      eyeshadowLowerShape: current.eyeshadowLowerShape,
    });
    return {id, region: migrated.region, visible: true, params: migrated.params};
  }
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

/**
 * 저장물/구 시스템 seed의 texture·finish enum을 현재 부위 로컬 도메인으로 제한한다.
 * 입력과 저장 JSON은 변경하지 않으며, 필드 부재는 그대로 둔다(특히 하라이너 texture).
 */
function normalizeRegionEnums(
  region: RegionKey,
  source: Partial<FilterParams>,
): Partial<FilterParams> {
  const result = {...source};
  if (region === 'eyeshadow') {
    result.eyeshadowShape = normalizeEyeshadowShape(result.eyeshadowShape);
  }
  const def = REGION_MAP[region];
  for (const axis of ['texture', 'finish'] as const) {
    for (const control of def.axes[axis] ?? []) {
      const contract =
        control.type === 'segments'
          ? {key: control.key, options: control.options}
          : control.type === 'finish'
            ? {key: control.finishKey, options: control.options ?? FINISHES}
            : null;
      if (!contract) continue;
      const raw = result[contract.key];
      if (raw === undefined) continue;
      if (axis === 'texture' && raw === -1) continue; // W1 필드 부재 sentinel=레거시 무변조
      if (contract.options.some(option => option.value === raw)) continue;
      // 제한된 부위 UI가 일부 버튼을 숨겨도 범용 finish enum(특히 legacy 0=새틴)은
      // 렌더러가 여전히 이해한다. 현재 옵션 subset 밖이라는 이유만으로 룩을 바꾸지 않는다.
      // texture는 부위마다 값 의미가 달라 반드시 현재 region options로만 판정한다.
      if (axis === 'finish' && FINISHES.some(option => option.value === raw)) continue;
      const configuredDefault = def.defaults[contract.key];
      const safeDefault = contract.options.some(
        option => option.value === configuredDefault,
      )
        ? configuredDefault
        : contract.options[0]?.value;
      if (safeDefault !== undefined) {
        (result as Record<string, unknown>)[contract.key] = safeDefault;
      }
    }
  }
  return result;
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
  eyeshadowLayers: EyeshadowLayerV2[];
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
  const eyeshadowLeaves: {params: Partial<FilterParams>; role?: string}[] = [];
  const highlighterZoneLeaves: Partial<FilterParams>[] = [];
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
    const migrated = migrateLegacyEyeshadowLayer(layer.region, layer.params);
    const normalizedParams = normalizeRegionEnums(migrated.region, migrated.params);
    if (migrated.region === 'eyeshadow') {
      eyeshadowLeaves.push({params: normalizedParams, role: layer.role});
      continue; // params 병합은 아래에서 겹 수로 분기
    }
    if (migrated.region === 'highlighter' && normalizedParams.highlightZone !== undefined) {
      highlighterZoneLeaves.push(normalizedParams);
      continue;
    }
    Object.assign(params, normalizedParams);
  }
  // V2는 단 한 겹도 배열로 보내 surface/profile 의미를 잃지 않는다. 최대 8, 자동 병합 없음.
  const retainedEyeshadowLeaves = eyeshadowLeaves.slice(0, MAX_EYESHADOW_LAYERS_V2);
  const eyeshadowLayers: EyeshadowLayerV2[] = retainedEyeshadowLeaves.map(leaf =>
    eyeshadowLayerFromParams(leaf.params, leaf.role));
  if (retainedEyeshadowLeaves.length > 0) {
    // 마스크·마감맵은 밴드별 payload가 아니라 region-global Unity 리소스다. 배열 경로에서도
    // 보이는 잎 중 하나라도 요청하면 compiled.params에 마커를 남겨 App reconcile이 set/clear한다.
    for (const key of [
      'eyeshadowMaskImported',
      'eyeshadowFinishMapImported',
    ] as const) {
      if (retainedEyeshadowLeaves.some(
        leaf => ((leaf.params[key] as number | undefined) ?? 0) > 0,
      )) {
        params[key] = 1;
      }
    }
  }
  if (highlighterZoneLeaves.length > 0) {
    // 존 잎의 공통 색/마감은 가장 낮은 zone 잎을 canonical style로 사용한다. 배열 순서를
    // 바꿔도 결과가 같고, Pink Pearl처럼 동일 제품을 부위별로 나눈 룩은 한 스타일을 유지한다.
    const canonicalStyle = [...highlighterZoneLeaves].sort(
      (a, b) => Math.trunc(Number(a.highlightZone)) - Math.trunc(Number(b.highlightZone)),
    )[0];
    Object.assign(params, canonicalStyle);

    // Unity는 global intensity × zone weight로 렌더한다. 잎별 intensity×weight를 먼저 만든 뒤
    // 하나의 global scale로 정규화해야 한 부위 농도 편집이 다른 부위 출력에 번지지 않는다.
    const effectiveWeights = [0, 0, 0, 0, 0, 0];
    let globalIntensity = 0;
    for (const leaf of highlighterZoneLeaves) {
      const zone = Math.trunc(Number(leaf.highlightZone));
      if (zone >= 0 && zone < effectiveWeights.length) {
        const intensity = clamp(leaf.highlightIntensity, 0, 1, 0);
        effectiveWeights[zone] += intensity * clamp(leaf.highlightZoneWeight, 0, 1, 0);
        globalIntensity = Math.max(globalIntensity, intensity);
      }
    }
    globalIntensity = clamp(Math.max(globalIntensity, ...effectiveWeights), 0, 1, 0);
    const weights = effectiveWeights.map(value =>
      globalIntensity > 0 ? clamp(value / globalIntensity, 0, 1, 0) : 0);
    params.highlightIntensity = globalIntensity;
    params.highlightHasZoneWeights = 1;
    [params.highlightZoneCheek, params.highlightZoneBridge, params.highlightZoneTip,
      params.highlightZoneBrow, params.highlightZoneCupid, params.highlightZoneChin] = weights;
    delete params.highlightZone;
    delete params.highlightZoneWeight;
  }
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
  eyeshadowLayers: (EyeshadowLayerV2 | EyeshadowLayer)[] = [],
): ComposerLayer[] {
  const layers: ComposerLayer[] = [];
  const retainedEyeshadowLayers = eyeshadowLayers.slice(0, MAX_EYESHADOW_LAYERS_V2);
  for (const def of REGION_DEFS) {
    if (isDecoRegion(def.key) || isLensRegion(def.key)) continue;
    // V2 배열이 있으면 스칼라 legacy 잎 복원을 건너뛴다.
    if (def.key === 'eyeshadow' && retainedEyeshadowLayers.length >= 1) continue;
    const on = def.onKeys.some(k => ((params[k] as number) ?? 0) > 0);
    if (!on) continue;
    const normalized = normalizeRegionEnums(def.key, params);
    const own: Partial<FilterParams> = {};
    for (const k of regionOwnKeys(def)) {
      if (normalized[k] !== undefined) {
        (own as Record<string, unknown>)[k] = normalized[k];
      }
    }
    layers.push({ id: `c${++seq}`, region: def.key, visible: true, params: own });
  }
  // tree-less v1 preset/storage adapter: 구 lower 스칼라는 upper 잎과 합치지 않고 별도
  // eyeshadow(surface=lower) 잎으로 승격한다.
  if (retainedEyeshadowLayers.length === 0 && (params.eyeshadowLowerIntensity ?? 0) > 0) {
    const migrated = migrateLegacyEyeshadowLayer('eyeshadowLower', {
      eyeshadowLowerColor: params.eyeshadowLowerColor,
      eyeshadowLowerIntensity: params.eyeshadowLowerIntensity,
      eyeshadowLowerFinish: params.eyeshadowLowerFinish,
      eyeshadowLowerShimmer: params.eyeshadowLowerShimmer,
      eyeshadowLowerHeight: params.eyeshadowLowerHeight,
      eyeshadowLowerTexture: params.eyeshadowLowerTexture,
      eyeshadowLowerShape: params.eyeshadowLowerShape,
    });
    layers.push({
      id: `c${++seq}`, region: 'eyeshadow', visible: true,
      params: normalizeRegionEnums('eyeshadow', migrated.params), role: 'point',
    });
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
  if (retainedEyeshadowLayers.length >= 1) {
    const importedMarkers: Partial<FilterParams> = {};
    for (const key of [
      'eyeshadowMaskImported',
      'eyeshadowFinishMapImported',
    ] as const) {
      if (((params[key] as number | undefined) ?? 0) > 0) importedMarkers[key] = 1;
    }
    retainedEyeshadowLayers.forEach((band, bandIndex) => {
      layers.push({
        id: `c${++seq}`,
        region: 'eyeshadow',
        visible: true,
        params: normalizeRegionEnums('eyeshadow', {
          eyeshadowColor: band.color,
          eyeshadowColor2: band.color2,
          eyeshadowIntensity: band.intensity,
          eyeshadowFinish: band.finish,
          eyeshadowSurface: normalizeSurface(band.surface, 0),
          eyeshadowShape: normalizeEyeshadowShape(band.profile ?? band.shape),
          eyeshadowGradient: band.gradient,
          eyeshadowHeight: band.height,
          eyeshadowShimmer: band.shimmer,
          eyeshadowTexture: band.texture ?? -1,
          eyeshadowGlossLo: band.glossLo,
          eyeshadowGlossGain: band.glossGain,
          eyeshadowShimmerSize: band.shimmerSize,
          eyeshadowShimmerDensity: band.shimmerDensity,
          eyeshadowMatte: band.matte,
          eyeshadowSheen: band.sheen,
          eyeshadowParticleSize: band.particleSize,
          eyeshadowParticleDensity: band.particleDensity,
          eyeshadowMaterial: band.material,
          eyeshadowMaterialStrength: band.materialStrength,
          eyeshadowParticleBrightness: band.particleBrightness,
          eyeshadowParticleColor: band.particleColor,
          eyeshadowParticleTwinkle: band.particleTwinkle,
          eyeshadowParticleShape: band.particleShape,
          eyeshadowParticleFeather: band.particleFeather,
          eyeshadowParticleParallax: band.particleParallax,
          eyeshadowParticleConfetti: band.particleConfetti,
          ...(bandIndex === 0 ? importedMarkers : {}),
        }),
      });
    });
  }
  return layers;
}
