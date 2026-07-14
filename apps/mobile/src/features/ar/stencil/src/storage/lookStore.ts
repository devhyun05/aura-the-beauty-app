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
import type { LookLibrary, LookSnapshot } from '../composer/lookTree';
import type { UserWarpFilter, WarpParams } from '../composer/warpPresets';
import type { FitSheet } from '../composer/fitSheets';
import type { ProductDef } from '../composer/products';
import { extractWarp } from '../composer/warpPresets';

const STYLES_KEY = 'armakeup.userStyles.v2';
const LEGACY_STYLES_KEY = 'armakeup.userStyles.v1';
const LIBRARY_KEY = 'armakeup.lookLibrary.v1';
const WARP_KEY = 'armakeup.fitFilters.v1';
const FIT_SHEETS_KEY = 'armakeup.fitSheets.v1';
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
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    !!v.compiled &&
    typeof v.compiled === 'object' &&
    Array.isArray(v.compiled.overlayLayers)
  );
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
    styleMirror = await splitWarpLane(v2.filter(isStyleV2));
    return styleMirror;
  }
  // v1 마이그레이션 — 성공 시 v2 키로 다시 쓰고 v1은 남겨둔다(롤백 안전).
  const v1 = await readJson(LEGACY_STYLES_KEY);
  const migrated = Array.isArray(v1)
    ? (v1.map(migrateV1).filter(Boolean) as UserStyleV2[])
    : [];
  if (migrated.length > 0) await writeJson(STYLES_KEY, migrated);
  styleMirror = await splitWarpLane(migrated);
  return styleMirror;
}

export async function saveUserStylesV2(styles: UserStyleV2[]): Promise<void> {
  styleMirror = styles;
  await writeJson(STYLES_KEY, styles);
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

/** 내 핏 시트 목록 + 메인 지정. */
export async function loadFitSheets(): Promise<FitSheetsStore> {
  if (fitSheetsMirror) return fitSheetsMirror;
  const raw = await readJson(FIT_SHEETS_KEY);
  const sheets: FitSheet[] = Array.isArray(raw?.sheets)
    ? raw.sheets.filter(
        (s: any) =>
          !!s &&
          typeof s.id === 'string' &&
          typeof s.name === 'string' &&
          Array.isArray(s.entries),
      )
    : [];
  const mainId =
    typeof raw?.mainId === 'string' && sheets.some(s => s.id === raw.mainId)
      ? raw.mainId
      : null;
  fitSheetsMirror = { sheets, mainId };
  return fitSheetsMirror;
}

export async function saveFitSheets(store: FitSheetsStore): Promise<void> {
  fitSheetsMirror = store;
  await writeJson(FIT_SHEETS_KEY, store);
}

// ── 사용자 제품(§5 A12) — 채널 편집으로 저작한 커스텀 제품 라이브러리 ──────────
// ⚠ 시중품 프리셋(SYSTEM_PRODUCTS)은 코드에서 재생성되므로 사용자 소유만 영속화한다.

let userProductsMirror: ProductDef[] | null = null;

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
  userProductsMirror = products;
  await writeJson(USER_PRODUCTS_KEY, products);
}

/** 테스트용 — 미러 초기화 */
export function __resetLookStoreMirrors(): void {
  styleMirror = null;
  libMirror = null;
  warpMirror = null;
  fitSheetsMirror = null;
  userProductsMirror = null;
}
