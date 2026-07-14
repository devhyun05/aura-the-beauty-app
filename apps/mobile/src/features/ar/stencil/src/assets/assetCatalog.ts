/**
 * 디자이너 에셋 카탈로그 로더 (§16) — 웹 GUI(docs/에셋-카탈로그-빌더.html)가 export한
 * 매니페스트 JSON을 앱이 읽는 계약. 에셋 4단 중 파일 에셋 3층을 관리한다:
 *   ① 마스크(kind:'mask')      — 모양 축 스텐실. 부위 "존"을 흑백/알파로 교체(어디에).
 *   ② 컬러 아트(kind:'colorArt') — 텍스처 축. 부위에 칠할 그림/패턴(무엇을).
 *   ③ 질감 맵(kind:'textureMap') — 픽셀별 광 지도(#22). 마감 변조(어떻게 빛나는지).
 * ④ 제형 파라미터는 인앱 값이라 카탈로그 밖.
 *
 * 이 모듈은 파싱·검증·필터 순수 함수만 제공한다. 실제 픽커/브리지 배선은 안 한다
 * (App의 pickComposerMask/pickTextureMap 인터페이스와 정합되는 uri만 실어 보낸다).
 * lookStore.ts와 같은 방어 원칙: 불량 매니페스트에 견고(best-effort, 나쁜 항목은 버림).
 */
import type {
  MaskRegion,
  TextureAction,
  TextureMapRegion,
} from '../composer/regions';

// ── 종류(kind) — 파일 에셋 3층 ───────────────────────────────────────────────
export type AssetKind = 'mask' | 'colorArt' | 'textureMap';

export const ASSET_KINDS: readonly AssetKind[] = ['mask', 'colorArt', 'textureMap'];

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  mask: '마스크',
  colorArt: '컬러 아트',
  textureMap: '질감 맵',
};

// ── 종류별 유효 부위 — regions.ts 타입과 컴파일 타임 정합 ─────────────────────
// 아래 배열은 런타임 검증용. 각 배열이 regions.ts의 해당 union과 정확히 일치하지
// 않으면 _Assert* 타입이 컴파일 에러를 낸다(배열이 union에서 드리프트하면 잡힘).
type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y
  ? 1
  : 2
  ? true
  : false;
type AssertTrue<T extends true> = T;

export const MASK_REGIONS = ['blush', 'highlighter', 'contour', 'eyeshadow'] as const;
export const COLOR_ART_REGIONS = ['brow', 'eyeliner', 'lip', 'blush', 'aegyo'] as const;
export const TEXTURE_MAP_REGIONS = ['lip', 'eyeshadow', 'blush'] as const;

// regions.ts 타입 ↔ 위 배열 원소 상호 포함 검증 (한쪽만 늘면 컴파일 에러).
// 타입 전용 가드라 런타임 코드는 없다 — 미사용 경고만 끈다.
/* eslint-disable @typescript-eslint/no-unused-vars */
type _AssertMask = AssertTrue<Equals<(typeof MASK_REGIONS)[number], MaskRegion>>;
type _AssertColorArt = AssertTrue<
  Equals<(typeof COLOR_ART_REGIONS)[number], TextureAction>
>;
type _AssertTextureMap = AssertTrue<
  Equals<(typeof TEXTURE_MAP_REGIONS)[number], TextureMapRegion>
>;
/* eslint-enable @typescript-eslint/no-unused-vars */

export type MaskAssetRegion = (typeof MASK_REGIONS)[number];
export type ColorArtAssetRegion = (typeof COLOR_ART_REGIONS)[number];
export type TextureMapAssetRegion = (typeof TEXTURE_MAP_REGIONS)[number];

/** 카탈로그가 관리하는 모든 부위 값의 합집합 (종류 무관) */
export type AssetRegion =
  | MaskAssetRegion
  | ColorArtAssetRegion
  | TextureMapAssetRegion;

/** 종류별 유효 부위 배열 — GUI 드롭다운·검증 단일 출처 */
export const REGIONS_BY_KIND: Record<AssetKind, readonly string[]> = {
  mask: MASK_REGIONS,
  colorArt: COLOR_ART_REGIONS,
  textureMap: TEXTURE_MAP_REGIONS,
};

export function regionsForKind(kind: AssetKind): readonly string[] {
  return REGIONS_BY_KIND[kind];
}

export function isAssetKind(v: unknown): v is AssetKind {
  return typeof v === 'string' && (ASSET_KINDS as readonly string[]).includes(v);
}

export function isValidRegionForKind(kind: AssetKind, region: unknown): boolean {
  return (
    typeof region === 'string' && REGIONS_BY_KIND[kind].includes(region)
  );
}

// ── 매니페스트 스키마 (웹 GUI export = 앱 import 계약) ────────────────────────
/** 카탈로그 한 항목 = 파일 에셋 하나의 등록 카드. */
export interface AssetCatalogEntry {
  /** 안정 식별자 (룩·저장물이 참조). 매니페스트 내 유일. */
  id: string;
  kind: AssetKind;
  /** 대상 부위 — kind에 따라 REGIONS_BY_KIND[kind] 중 하나. */
  region: AssetRegion;
  name: string;
  tags: string[];
  /** 에셋 리비전(1부터). 같은 id 갱신 시 올린다. */
  version: number;
  /** 앱이 로드할 경로/URI (file://, 번들 상대경로, 또는 원격 uri). */
  uri: string;
  /** 프리뷰 썸네일 — dataURL 또는 uri (선택, 클 수 있음). */
  thumbnail?: string;
  /** 팀 메모 한 줄 (선택). */
  note?: string;
  /** 등록 시각 epoch ms (선택). */
  createdAt?: number;
}

export const CATALOG_SCHEMA_ID = 'armakeup.assetCatalog' as const;
/** 매니페스트 포맷 버전 (스키마가 바뀌면 올린다). */
export const CATALOG_MANIFEST_VERSION = 1;

export interface CatalogManifest {
  schema: typeof CATALOG_SCHEMA_ID;
  version: number;
  /** export 시각 ISO 문자열 (선택). */
  generatedAt?: string;
  entries: AssetCatalogEntry[];
}

// ── 방어적 파싱 (lookStore.readJson/isStyleV2 패턴) ───────────────────────────
function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((t): t is string => typeof t === 'string');
}

/** 한 항목 검증 → 유효하면 정규화 사본, 아니면 null(버림). */
export function normalizeEntry(v: unknown): AssetCatalogEntry | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;

  const id = asString(o.id);
  const name = asString(o.name);
  const uri = asString(o.uri);
  const kind = o.kind;
  const region = o.region;

  if (!id || !name || !uri) return null;
  if (!isAssetKind(kind)) return null;
  if (!isValidRegionForKind(kind, region)) return null;

  const versionRaw = o.version;
  const version =
    typeof versionRaw === 'number' && Number.isFinite(versionRaw) && versionRaw > 0
      ? Math.floor(versionRaw)
      : 1;

  const entry: AssetCatalogEntry = {
    id,
    kind,
    region: region as AssetRegion,
    name,
    tags: asStringArray(o.tags),
    version,
    uri,
  };

  const thumbnail = asString(o.thumbnail);
  if (thumbnail) entry.thumbnail = thumbnail;
  const note = asString(o.note);
  if (note) entry.note = note;
  if (typeof o.createdAt === 'number' && Number.isFinite(o.createdAt)) {
    entry.createdAt = o.createdAt;
  }

  return entry;
}

/**
 * 매니페스트 파싱·검증. 입력은 JSON 문자열 또는 이미 파싱된 객체.
 * best-effort — 파싱 실패/스키마 불일치면 빈 카탈로그, 불량 항목은 버림,
 * 같은 id는 뒤(마지막)가 이긴다.
 */
export function loadCatalog(input: unknown): CatalogManifest {
  let root: unknown = input;
  if (typeof input === 'string') {
    try {
      root = JSON.parse(input);
    } catch {
      return emptyCatalog();
    }
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    return emptyCatalog();
  }

  const o = root as Record<string, unknown>;
  const rawEntries = Array.isArray(o.entries) ? o.entries : [];

  const byId = new Map<string, AssetCatalogEntry>();
  for (const raw of rawEntries) {
    const entry = normalizeEntry(raw);
    if (entry) byId.set(entry.id, entry); // 뒤가 이김(중복 id)
  }

  return {
    schema: CATALOG_SCHEMA_ID,
    version:
      typeof o.version === 'number' && Number.isFinite(o.version)
        ? o.version
        : CATALOG_MANIFEST_VERSION,
    generatedAt: asString(o.generatedAt) ?? undefined,
    entries: Array.from(byId.values()),
  };
}

export function emptyCatalog(): CatalogManifest {
  return {
    schema: CATALOG_SCHEMA_ID,
    version: CATALOG_MANIFEST_VERSION,
    entries: [],
  };
}

/** 카탈로그 → 매니페스트 JSON 문자열 (검증 후 재직렬화, GUI 왕복 대칭). */
export function serializeCatalog(catalog: CatalogManifest): string {
  return JSON.stringify(
    {
      schema: CATALOG_SCHEMA_ID,
      version: catalog.version,
      generatedAt: catalog.generatedAt ?? new Date().toISOString(),
      entries: catalog.entries,
    },
    null,
    2,
  );
}

// ── 필터 헬퍼 ────────────────────────────────────────────────────────────────
export function entriesByKind(
  catalog: CatalogManifest,
  kind: AssetKind,
): AssetCatalogEntry[] {
  return catalog.entries.filter(e => e.kind === kind);
}

export function entriesByRegion(
  catalog: CatalogManifest,
  region: string,
): AssetCatalogEntry[] {
  return catalog.entries.filter(e => e.region === region);
}

export function entriesByKindAndRegion(
  catalog: CatalogManifest,
  kind: AssetKind,
  region: string,
): AssetCatalogEntry[] {
  return catalog.entries.filter(e => e.kind === kind && e.region === region);
}

export function findEntryById(
  catalog: CatalogManifest,
  id: string,
): AssetCatalogEntry | undefined {
  return catalog.entries.find(e => e.id === id);
}

export interface CatalogQuery {
  kind?: AssetKind;
  region?: string;
  tag?: string;
  /** 이름·태그·부위·메모 부분일치(대소문자 무시). */
  text?: string;
}

export function searchEntries(
  catalog: CatalogManifest,
  query: CatalogQuery,
): AssetCatalogEntry[] {
  const text = query.text?.trim().toLowerCase();
  return catalog.entries.filter(e => {
    if (query.kind && e.kind !== query.kind) return false;
    if (query.region && e.region !== query.region) return false;
    if (query.tag && !e.tags.includes(query.tag)) return false;
    if (text) {
      const hay = [e.name, e.region, e.note ?? '', ...e.tags]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

/** 카탈로그 안 모든 태그(정렬·중복제거) — GUI 필터 칩 구성용. */
export function allTags(catalog: CatalogManifest): string[] {
  const set = new Set<string>();
  for (const e of catalog.entries) for (const t of e.tags) set.add(t);
  return Array.from(set).sort();
}

// ── 썸네일 렌더 가능 판별 (§16 번들 방어) ────────────────────────────────────
/** RN <Image>가 실제로 그릴 수 있는 uri 스킴들. 번들 기본 세트 항목은 uri가
 *  `streaming:catalog/…`(앱 번들 StreamingAssets — Unity ImageFileLoader 전용
 *  스킴)라 RN Image로는 못 읽는다. 그런 값을 <Image>에 넣으면 깨진 이미지가 뜨므로
 *  CatalogStrip은 여기 없는 스킴이면 이름 타일로 폴백한다(apply(탭)은 여전히 uri로
 *  동작 — Unity가 해석). 팀이 `thumbnail`에 data: 미리보기를 넣으면 그게 렌더된다. */
const RENDERABLE_THUMB_SCHEMES: readonly string[] = [
  'http:',
  'https:',
  'file:',
  'data:',
  'content:',
  'asset:',
];

/** thumbnail(또는 uri) 값을 RN <Image>가 렌더 가능한가(순수 함수). streaming: 등
 *  네이티브 전용 스킴·스킴 없는 상대경로는 false. */
export function isRenderableThumb(uri: string | null | undefined): boolean {
  if (typeof uri !== 'string') return false;
  const s = uri.trimStart().toLowerCase();
  return RENDERABLE_THUMB_SCHEMES.some(scheme => s.startsWith(scheme));
}
