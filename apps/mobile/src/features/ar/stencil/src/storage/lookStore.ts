/**
 * 저장 계층 v2 — 레인 분리 저장(분류체계 정의 07-10): 내 룩 = 메이크업 레인
 * 단독 저장물. 보정(워프)은 UserFitFilter로 각자 저장하고, 두 레인을 묶은
 * '스타일'은 장래 개념(헤어·패션 레인 도입 시)으로 유보한다.
 * 트리 스냅샷을 직렬화하므로 재편집 시 구조가 그대로 복원되고(reviveTree),
 * 수정 안 된 노드는 라이브러리 라이브 해석으로 '원본에 반영' 전파를 받는다.
 *
 * 마이그레이션 2단: v1(컴파일 결과만) → v2(두 레인 쌍) → 로드 시 레인 분리
 * (splitWarpLane — 저장물에 얹혀 있던 보정을 내 보정 필터로 이관).
 *
 * styleStore.ts와 같은 원칙: AsyncStorage best-effort + 세션 미러 폴백.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  EyeshadowLayer,
  FilterParams,
  LensLayer,
  OverlayLayer,
} from '../bridge/types';
import {
  migrateLegacyLowerEyeshadowShape,
  normalizeEyeshadowShape,
} from '../bridge/eyeshadowShape';
import type { LookLibrary, LookSnapshot } from '../composer/lookTree';
import type { UserWarpFilter, WarpParams } from '../composer/warpPresets';
import type { FitSheet } from '../composer/fitSheets';
import {
  AUTO_FIT_METRIC_KEYS,
  AUTO_FIT_OUTPUT_RULES,
} from '../composer/autoFit';
import type {AutoFitMetricKey} from '../composer/autoFit';
import type { ProductDef } from '../composer/products';
import { prepareProductsForSave } from '../composer/products';
import { extractWarp } from '../composer/warpPresets';

const STYLES_KEY = 'armakeup.userStyles.v2';
const LEGACY_STYLES_KEY = 'armakeup.userStyles.v1';
const LIBRARY_KEY = 'armakeup.lookLibrary.v1';
const WARP_KEY = 'armakeup.fitFilters.v1';
const FIT_SHEETS_KEY = 'armakeup.fitSheets.v1';
const AUTO_FIT_KEY = 'armakeup.autoFit.v1';
const USER_PRODUCTS_KEY = 'armakeup.userProducts.v1';

/** 내 룩 저장물 — 메이크업 레인 단독(레인 분리 저장). 타입명 V2는 스토리지 스키마 호환용. */
export interface UserStyleV2 {
  id: string;
  name: string;
  createdAt: number;
  /** 메이크업 레인 — 룩 트리 스냅샷 (v1 마이그레이션분은 null) */
  lookTree: LookSnapshot | null;
  /** 레거시 — 보정은 로드 시 UserFitFilter로 이관(splitWarpLane). 신규 저장은 빈 값 고정 */
  warpRef: string;
  warpName: string;
  warpParams: WarpParams;
  /** 메이크업 농도 마스터 (0..1) */
  mkGain: number;
  /** 레거시 — 신규 저장은 1 고정 */
  wpGain: number;
  /** 레거시 — 신규 저장은 includeMk=true·includeWp=false 고정 */
  includeMk: boolean;
  includeWp: boolean;
  /** 컴파일 결과 — 칩 탭 즉시 적용 fast-path + v1 호환 (워프 필드 제외 상태) */
  compiled: {
    params: FilterParams;
    overlayLayers: OverlayLayer[];
    /** 렌즈 레이어드(#25) — 구버전 저장물엔 없어 선택적(읽을 때 ?? [] 보정) */
    lensLayers?: LensLayer[];
    /** 아이섀도 멀티밴드(A14) — 겹 2+ 룩만. 구버전/단일 저장물엔 없어 선택적 */
    eyeshadowLayers?: EyeshadowLayer[];
  };
}

let styleMirror: UserStyleV2[] | null = null;
let libMirror: LookLibrary | null = null;
let warpMirror: UserWarpFilter[] | null = null;

function isStyleV2(v: any): v is UserStyleV2 {
  const compiled = v?.compiled;
  const params = compiled?.params;
  const eyeshadowLayers = compiled?.eyeshadowLayers;
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    !!compiled &&
    typeof compiled === 'object' &&
    !!params &&
    typeof params === 'object' &&
    !Array.isArray(params) &&
    Array.isArray(compiled.overlayLayers) &&
    (eyeshadowLayers === undefined ||
      (Array.isArray(eyeshadowLayers) &&
        eyeshadowLayers.every(
          (layer: unknown) => !!layer && typeof layer === 'object' && !Array.isArray(layer),
        )))
  );
}

/** 트리 없는 저장 룩의 compiled fast-path가 브리지로 직행하기 전 모양 ID를 정규화한다. */
function normalizeStyleEyeshadowShapes(style: UserStyleV2): UserStyleV2 {
  const params = style.compiled.params;
  const stored = style.compiled.eyeshadowLayers;
  const legacyLayers: EyeshadowLayer[] = [];
  if (!Array.isArray(stored) || stored.length === 0) {
    if ((params.eyeshadowIntensity ?? 0) > 0) {
      const profile = normalizeEyeshadowShape(params.eyeshadowShape);
      legacyLayers.push({
        surface: 0, profile, shape: profile,
        color: params.eyeshadowColor, color2: params.eyeshadowColor2 ?? params.eyeshadowColor,
        intensity: Math.min(1.5, Math.max(0, params.eyeshadowIntensity)),
        finish: params.eyeshadowFinish ?? 0, gradient: params.eyeshadowGradient ?? 0,
        height: params.eyeshadowHeight ?? 1, shimmer: params.eyeshadowShimmer ?? .5,
        texture: params.eyeshadowTexture ?? -1, glossLo: params.eyeshadowGlossLo ?? 0,
        glossGain: params.eyeshadowGlossGain ?? 0, shimmerSize: params.eyeshadowShimmerSize ?? 0,
        shimmerDensity: params.eyeshadowShimmerDensity ?? 0, matte: params.eyeshadowMatte ?? 0,
        sheen: params.eyeshadowSheen ?? 0, particleSize: params.eyeshadowParticleSize ?? 0,
        particleDensity: params.eyeshadowParticleDensity ?? 0,
        material: params.eyeshadowMaterial ?? 0,
        materialStrength: params.eyeshadowMaterialStrength ?? .85,
        particleBrightness: params.eyeshadowParticleBrightness ?? .7,
        particleColor: params.eyeshadowParticleColor ?? '#FFF2D9',
        particleTwinkle: params.eyeshadowParticleTwinkle ?? 1,
        particleShape: params.eyeshadowParticleShape ?? 0,
        particleFeather: params.eyeshadowParticleFeather ?? 0,
        particleParallax: params.eyeshadowParticleParallax ?? 0,
        particleConfetti: params.eyeshadowParticleConfetti ?? 0,
      });
    }
  }
  let eyeshadowLayers = (Array.isArray(stored) && stored.length > 0 ? stored : legacyLayers)
    .slice(0, 8)
    .map<EyeshadowLayer>(layer => ({
      ...layer,
      surface: layer.surface === 1 || layer.surface === 2 ? layer.surface : 0,
      profile: normalizeEyeshadowShape(layer.profile ?? layer.shape),
      shape: normalizeEyeshadowShape(layer.profile ?? layer.shape),
      intensity: Math.min(1.5, Math.max(0, Number.isFinite(layer.intensity) ? layer.intensity : 0)),
      material: Number.isFinite(layer.material) ? Math.min(4, Math.max(0, layer.material!)) : 0,
      materialStrength: Number.isFinite(layer.materialStrength) ? layer.materialStrength : .85,
      particleSize: Number.isFinite(layer.particleSize) ? layer.particleSize : 0,
      particleDensity: Number.isFinite(layer.particleDensity) ? layer.particleDensity : 0,
      particleBrightness: Number.isFinite(layer.particleBrightness) ? layer.particleBrightness : .7,
      particleColor:
        typeof layer.particleColor === 'string' && layer.particleColor.length > 0
          ? layer.particleColor
          : '#FFF2D9',
      particleTwinkle: Number.isFinite(layer.particleTwinkle) ? layer.particleTwinkle : 1,
      particleShape: Number.isFinite(layer.particleShape) ? layer.particleShape : 0,
      particleFeather: Number.isFinite(layer.particleFeather) ? layer.particleFeather : 0,
      particleParallax: Number.isFinite(layer.particleParallax) ? layer.particleParallax : 0,
      particleConfetti: Number.isFinite(layer.particleConfetti) ? layer.particleConfetti : 0,
    }));
  if ((params.eyeshadowLowerIntensity ?? 0) > 0 &&
      !eyeshadowLayers.some(layer => layer.surface === 1 || layer.surface === 2)) {
    const profile = migrateLegacyLowerEyeshadowShape(params.eyeshadowLowerShape);
    const lowerLayer: EyeshadowLayer = {
      surface: 1, profile, shape: profile,
      color: params.eyeshadowLowerColor ?? '#7A5A4E',
      color2: params.eyeshadowLowerColor ?? '#7A5A4E',
      intensity: Math.min(1.5, Math.max(0, params.eyeshadowLowerIntensity ?? 0)),
      finish: params.eyeshadowLowerFinish ?? 0, gradient: 0,
      height: params.eyeshadowLowerHeight ?? 1, shimmer: params.eyeshadowLowerShimmer ?? .5,
      texture: params.eyeshadowLowerTexture ?? -1, glossLo: 0, glossGain: 0,
      shimmerSize: 0, shimmerDensity: 0, matte: 0, sheen: 0,
      particleSize: 0, particleDensity: 0,
      material: 0, materialStrength: .85,
      particleBrightness: .7, particleColor: '#FFF2D9', particleTwinkle: 1,
      particleShape: 0, particleFeather: 0, particleParallax: 0,
      particleConfetti: 0,
    };
    if (eyeshadowLayers.length >= 8) eyeshadowLayers = eyeshadowLayers.slice(0, 7);
    eyeshadowLayers.push(lowerLayer);
  }
  const hasExplicitEyelinerProfiles =
    Object.prototype.hasOwnProperty.call(params, 'eyelinerThicknessProfile') ||
    Object.prototype.hasOwnProperty.call(params, 'eyelinerTailProfile');
  const eyelinerHasGeometryProfiles = params.eyelinerHasGeometryProfiles === undefined
    ? (hasExplicitEyelinerProfiles ? 1 : 0)
    : (params.eyelinerHasGeometryProfiles > 0 ? 1 : 0);
  return {
    ...style,
    compiled: {
      ...style.compiled,
      params: {
        ...style.compiled.params,
        eyeshadowShape: normalizeEyeshadowShape(style.compiled.params.eyeshadowShape),
        eyelinerHasGeometryProfiles,
      },
      ...(eyeshadowLayers.length > 0
        ? {
            eyeshadowLayers,
          }
        : {}),
    },
  };
}

async function readJson(key: string): Promise<any> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort — 세션 미러엔 이미 반영됨
  }
}

/** v1 저장물 → v2 (트리 없음, 워프는 params에서 추출해 레인으로 분리) */
function migrateV1(v1: any): UserStyleV2 | null {
  if (!v1 || typeof v1.id !== 'string' || !v1.params) return null;
  const warpParams = extractWarp(v1.params as FilterParams);
  return {
    id: v1.id,
    name: typeof v1.name === 'string' ? v1.name : '내 룩',
    createdAt: typeof v1.createdAt === 'number' ? v1.createdAt : 0,
    lookTree: null,
    warpRef: 'fit-none',
    warpName: Object.keys(warpParams).length > 0 ? '내 보정' : '보정 없음',
    warpParams,
    mkGain: typeof v1.opacity === 'number' ? v1.opacity : 1,
    wpGain: 1,
    includeMk: true,
    includeWp: true,
    compiled: {
      params: v1.params as FilterParams,
      overlayLayers: Array.isArray(v1.overlayLayers) ? v1.overlayLayers : [],
      lensLayers: Array.isArray(v1.lensLayers) ? v1.lensLayers : [],
      eyeshadowLayers: Array.isArray(v1.eyeshadowLayers) ? v1.eyeshadowLayers : [],
    },
  };
}

/**
 * 레인 분리 이관(분류체계 정의 07-10) — 저장물에 얹혀 있던 보정을 내 FIT
 * 필터로 옮기고 저장물을 메이크업 단독으로 만든다. 보정 전용 항목(includeMk
 * =false)은 이관 후 목록에서 제거. id가 결정적(`{id}:wp`)이라 재실행 안전.
 */
async function splitWarpLane(styles: UserStyleV2[]): Promise<UserStyleV2[]> {
  if (styles.every(s => s.includeMk && !s.includeWp)) return styles;
  const filters = await loadUserWarpFilters();
  let filtersDirty = false;
  for (const s of styles) {
    if (!s.includeWp || Object.keys(s.warpParams ?? {}).length === 0) continue;
    const wpId = `${s.id}:wp`;
    if (!filters.some(f => f.id === wpId)) {
      filters.push({
        id: wpId,
        name: `${s.name} 보정`,
        createdAt: s.createdAt,
        params: { ...s.warpParams },
      });
      filtersDirty = true;
    }
  }
  if (filtersDirty) await saveUserWarpFilters([...filters]);
  const cleaned = styles
    .filter(s => s.includeMk)
    .map(s =>
      s.includeWp
        ? { ...s, includeWp: false, warpRef: 'fit-none', warpName: '', warpParams: {} }
        : s,
    );
  await writeJson(STYLES_KEY, cleaned);
  return cleaned;
}

/** 내 룩 목록 (최초 호출 시 v1 자동 마이그레이션 + 레인 분리 이관). */
export async function loadUserStylesV2(): Promise<UserStyleV2[]> {
  if (styleMirror) return styleMirror;
  const v2 = await readJson(STYLES_KEY);
  if (Array.isArray(v2)) {
    styleMirror = await splitWarpLane(
      v2.filter(isStyleV2).map(normalizeStyleEyeshadowShapes),
    );
    return styleMirror;
  }
  // v1 마이그레이션 — 성공 시 v2 키로 다시 쓰고 v1은 남겨둔다(롤백 안전).
  const v1 = await readJson(LEGACY_STYLES_KEY);
  const migrated = Array.isArray(v1)
    ? (v1.map(migrateV1).filter(Boolean) as UserStyleV2[])
        .map(normalizeStyleEyeshadowShapes)
    : [];
  if (migrated.length > 0) await writeJson(STYLES_KEY, migrated);
  styleMirror = await splitWarpLane(migrated);
  return styleMirror;
}

export async function saveUserStylesV2(styles: UserStyleV2[]): Promise<void> {
  styleMirror = styles.map(normalizeStyleEyeshadowShapes);
  await writeJson(STYLES_KEY, styleMirror);
}

/** 사용자 룩 라이브러리(승격·원본반영된 정의). 시스템 정의와 합쳐 쓴다. */
export async function loadUserLibrary(): Promise<LookLibrary> {
  if (libMirror) return libMirror;
  const raw = await readJson(LIBRARY_KEY);
  libMirror = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return libMirror!;
}

export async function saveUserLibrary(lib: LookLibrary): Promise<void> {
  // 시스템 정의는 코드에서 재생성되므로 사용자 소유만 영속화
  const userOnly: LookLibrary = {};
  for (const [id, def] of Object.entries(lib)) {
    if (def.owner === 'user') userOnly[id] = def;
  }
  libMirror = userOnly;
  await writeJson(LIBRARY_KEY, userOnly);
}

/** 내 보정 필터(보정) 목록. */
export async function loadUserWarpFilters(): Promise<UserWarpFilter[]> {
  if (warpMirror) return warpMirror;
  const raw = await readJson(WARP_KEY);
  warpMirror = Array.isArray(raw)
    ? raw.filter(
        (v: any) => !!v && typeof v.id === 'string' && typeof v.name === 'string' && !!v.params,
      )
    : [];
  return warpMirror!;
}

export async function saveUserWarpFilters(filters: UserWarpFilter[]): Promise<void> {
  warpMirror = filters;
  await writeJson(WARP_KEY, filters);
}

// ── 내 핏(§5 A13, 저장물 3종째) — 핏 시트 라이브러리 + 메인 시트 지정 ─────────
// ⚠ UserWarpFilter(위, 보정 레인=워프)와 별개 저장물이다(§6 용어 규약 '핏' 행).

export interface FitSheetsStore {
  sheets: FitSheet[];
  /** 기본 적용 시트(메인) — null이면 핏 미적용 */
  mainId: string | null;
}

let fitSheetsMirror: FitSheetsStore | null = null;
let fitSheetsRevision = 0;
let fitSheetsWriteQueue: Promise<void> = Promise.resolve();

/**
 * 구 핏시트의 대칭 굵기 델타를 상·하 엣지 델타로 무손실 이관한다.
 * applyFitToLayers에서 browThickness는 기준 1에 가산되므로 d만큼 늘어난 전체 폭은
 * 위/아래 각각 d/2씩 확장한 것과 같다. 신규 값이 이미 있으면 그것을 우선하고,
 * legacy 키만 제거해 재실행해도 결과가 바뀌지 않는다.
 */
function migrateBrowCoverageFitSheets(sheets: FitSheet[]): FitSheet[] {
  let changed = false;
  const next = sheets.map(sheet => {
    let sheetChanged = false;
    const entries = sheet.entries.map(entry => {
      const rules = entry.rules;
      const legacy = rules?.browThickness;
      if (
        !entry.region.startsWith('brow') ||
        typeof legacy !== 'number' ||
        !Number.isFinite(legacy)
      ) {
        return entry;
      }
      const edge = Math.max(-0.25, Math.min(0.75, legacy / 2));
      const migrated = {...rules};
      delete migrated.browThickness;
      if (migrated.browExpandLower === undefined) migrated.browExpandLower = edge;
      if (migrated.browExpandUpper === undefined) migrated.browExpandUpper = edge;
      sheetChanged = true;
      return {...entry, rules: migrated};
    });
    if (!sheetChanged) return sheet;
    changed = true;
    return {...sheet, entries};
  });
  return changed ? next : sheets;
}

/** 내 핏 시트 목록 + 메인 지정. */
export async function loadFitSheets(): Promise<FitSheetsStore> {
  if (fitSheetsMirror) return fitSheetsMirror;
  const revision = fitSheetsRevision;
  const raw = await readJson(FIT_SHEETS_KEY);
  if (revision !== fitSheetsRevision) {
    return fitSheetsMirror ?? {sheets: [], mainId: null};
  }
  const loaded: FitSheet[] = Array.isArray(raw?.sheets)
    ? raw.sheets.filter(
        (s: any) =>
          !!s &&
          typeof s.id === 'string' &&
          typeof s.name === 'string' &&
          Array.isArray(s.entries),
      )
    : [];
  const sheets = migrateBrowCoverageFitSheets(loaded);
  const mainId =
    typeof raw?.mainId === 'string' && sheets.some(s => s.id === raw.mainId)
      ? raw.mainId
      : null;
  const store = {sheets, mainId};
  fitSheetsMirror = store;
  if (sheets !== loaded) {
    await saveFitSheets(store);
    return fitSheetsMirror ?? store;
  }
  return store;
}

export async function saveFitSheets(store: FitSheetsStore): Promise<void> {
  const prepared = {...store, sheets: migrateBrowCoverageFitSheets(store.sheets)};
  fitSheetsRevision++;
  fitSheetsMirror = prepared;
  const write = fitSheetsWriteQueue
    .catch(() => undefined)
    .then(() => writeJson(FIT_SHEETS_KEY, prepared));
  fitSheetsWriteQueue = write;
  await write;
}

/** 테스트 격리용 — 이전 테스트/렌더가 시작한 핏시트 쓰기를 모두 기다린다. */
export async function __flushFitSheetsWrites(): Promise<void> {
  await fitSheetsWriteQueue.catch(() => undefined);
}

// ── 자동 핏(W6) — 측정 입력과 수락된 기저 델타 ─────────────────────────────

export interface StoredAutoFitInput {
  value: number;
  confidence: number;
}

export interface AutoFitStore {
  measuredAt: number;
  accepted: boolean;
  inputs: Partial<Record<AutoFitMetricKey, StoredAutoFitInput>>;
  deltas: FitSheet['entries'];
}

let autoFitMirror: AutoFitStore | null | undefined;
let autoFitRevision = 0;
let autoFitWriteQueue: Promise<void> = Promise.resolve();

function normalizeAutoFit(raw: any): AutoFitStore | null {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    typeof raw.measuredAt !== 'number' ||
    !Number.isFinite(raw.measuredAt) ||
    typeof raw.accepted !== 'boolean' ||
    !raw.inputs ||
    typeof raw.inputs !== 'object' ||
    Array.isArray(raw.inputs) ||
    !Array.isArray(raw.deltas)
  ) {
    return null;
  }
  const metricKeys = new Set<string>(AUTO_FIT_METRIC_KEYS);
  const inputs: AutoFitStore['inputs'] = {};
  for (const [key, value] of Object.entries(raw.inputs)) {
    const input = value as any;
    if (
      !metricKeys.has(key) ||
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      typeof input.value !== 'number' ||
      !Number.isFinite(input.value) ||
      typeof input.confidence !== 'number' ||
      !Number.isFinite(input.confidence) ||
      input.confidence < 0 ||
      input.confidence > 1
    ) {
      return null;
    }
    inputs[key as AutoFitMetricKey] = {
      value: input.value,
      confidence: input.confidence,
    };
  }
  const deltas: FitSheet['entries'] = [];
  for (const item of raw.deltas) {
    const allowed = item && AUTO_FIT_OUTPUT_RULES[item.region as keyof typeof AUTO_FIT_OUTPUT_RULES];
    if (
      !allowed ||
      item.role !== undefined ||
      item.leafId !== undefined ||
      !item.rules ||
      typeof item.rules !== 'object' ||
      Array.isArray(item.rules)
    ) {
      return null;
    }
    const rules: Record<string, number> = {};
    for (const [key, value] of Object.entries(item.rules)) {
      if (!allowed.includes(key) || typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
      }
      rules[key] = value;
    }
    deltas.push({region: item.region, rules});
  }
  return {measuredAt: raw.measuredAt, accepted: raw.accepted, inputs, deltas};
}

export async function loadAutoFit(): Promise<AutoFitStore | null> {
  if (autoFitMirror !== undefined) return autoFitMirror;
  const revision = autoFitRevision;
  const loaded = normalizeAutoFit(await readJson(AUTO_FIT_KEY));
  if (revision === autoFitRevision && autoFitMirror === undefined) {
    autoFitMirror = loaded;
  }
  return autoFitMirror === undefined ? loaded : autoFitMirror;
}

export async function saveAutoFit(store: AutoFitStore): Promise<void> {
  const prepared = normalizeAutoFit(store);
  if (!prepared) return;
  autoFitRevision++;
  autoFitMirror = prepared;
  const write = autoFitWriteQueue
    .catch(() => undefined)
    .then(() => writeJson(AUTO_FIT_KEY, prepared));
  autoFitWriteQueue = write;
  await write;
}

export async function __flushAutoFitWrites(): Promise<void> {
  await autoFitWriteQueue.catch(() => undefined);
}

// ── 사용자 제품(§5 A12) — 채널 편집으로 저작한 커스텀 제품 라이브러리 ──────────
// ⚠ 시중품 프리셋(SYSTEM_PRODUCTS)은 코드에서 재생성되므로 사용자 소유만 영속화한다.

let userProductsMirror: ProductDef[] | null = null;
let userProductsWriteQueue: Promise<void> = Promise.resolve();

/** 내가 만든 제품 목록. 불량 항목(id·name·family 비문자열, owner≠user)은 배제. */
export async function loadUserProducts(): Promise<ProductDef[]> {
  if (userProductsMirror) return userProductsMirror;
  const raw = await readJson(USER_PRODUCTS_KEY);
  userProductsMirror = Array.isArray(raw)
    ? raw.filter(
        (v: any) =>
          !!v &&
          typeof v.id === 'string' &&
          typeof v.name === 'string' &&
          typeof v.family === 'string' &&
          v.owner === 'user',
      )
    : [];
  return userProductsMirror!;
}

export async function saveUserProducts(products: ProductDef[]): Promise<void> {
  const prepared = prepareProductsForSave(products);
  userProductsMirror = prepared;
  const write = userProductsWriteQueue
    .catch(() => undefined)
    .then(() => writeJson(USER_PRODUCTS_KEY, prepared));
  userProductsWriteQueue = write;
  await write;
}

/** 테스트용 — 미러 초기화 */
export function __resetLookStoreMirrors(): void {
  styleMirror = null;
  libMirror = null;
  warpMirror = null;
  fitSheetsMirror = null;
  fitSheetsRevision++;
  fitSheetsWriteQueue = Promise.resolve();
  autoFitMirror = undefined;
  autoFitRevision++;
  autoFitWriteQueue = Promise.resolve();
  userProductsMirror = null;
  userProductsWriteQueue = Promise.resolve();
}
