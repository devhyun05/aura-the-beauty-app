/**
 * 핏 시트(분류체계 §5, A13) — "내 핏": 메이크업 배치·분포의 개인 델타 스타일시트.
 *
 * 모델(CSS 은유): 룩 = HTML(구조·내용), 핏 시트 = CSS(공간 델타만 담은 조정 시트),
 * 겹의 최종 핏 = computed style. 시트 항목이 셀렉터로 잎을 지목한다:
 *   '.부위'        — region 일치. 어느 룩에나 이식 가능(AI 분석 출력 기본형)
 *   '.부위[역할]'  — region+role 일치. 겹마다 다른 전략을 룩 독립적으로("꼬막눈 보정")
 *   '#겹id'       — 잎 인스턴스 지목. 룩 귀속 시트에서만 의미(겹 id는 룩마다 다름)
 *
 * 해석: 필드별 오버라이드 — 구체성(겹id>역할>부위) 우선, 같은 구체성이면 가까운
 * 시트(하위룩>룩>메인) 승리. 합산이 아니라 하나가 이긴다(WYSIWYG). 델타 0 = 룩
 * 그대로(baseline — Finish 0=새틴 규약과 동일).
 *
 * 공간 한정: 색·제품·마감·농도는 만질 수 없다. rules 키는 부위 카탈로그의 골드
 * 슬라이더(axes.fit ∪ gold 플래그)에서 유도한 화이트리스트로 강제(단일 출처 —
 * 부위·필드가 늘어도 드리프트하지 않는다).
 *
 * 적용점은 단일: flattenTree 결과에 applyFitToLayers(사본 반환, 트리 무변경) →
 * compileLayers. 잎별 fitChain(가까운 조상 fitRef 먼저)은 flattenTree가 주석한다.
 *
 * ⚠ 이름 주의: warpPresets.ts의 WarpPreset/applyFitToParams는 보정 레인(얼굴형
 * 워프)이다 — 이 모듈과 별개 개념(§6 용어 규약 '핏' 행, 장래 '워프' 리네임 후보).
 */
import type { FilterParams, RegionAffine, RegionWarp } from '../bridge/types';
import type { ComposerLayer } from './model';
import { isDecoRegion, REGION_DEFS, REGION_MAP } from './regions';
import type { RegionKey } from './regions';

// ── 타입 ─────────────────────────────────────────────────────────────────────

/** 공간 델타 한 벌 — 전부 선택적, 없음/0 = 룩 그대로(baseline). */
export interface FitDelta {
  /** 배치 이동(캐노니컬 UV 상대) — v1 렌더는 데코 오버레이(x·y)가 소비 */
  dx?: number;
  dy?: number;
  /** 크기 배수 델타(0=기준) — 오버레이 scale ×(1+sx) */
  sx?: number;
  /** 세로 크기 배수 델타(0=기준) — 비-데코 아핀 소비자 전용 */
  sy?: number;
  /** 회전 델타(도) — 오버레이 rotation 가산 */
  rot?: number;
  /** 부위 룰 델타 — 키는 그 부위 골드 슬라이더의 FilterParams 필드(가산·클램프) */
  rules?: Record<string, number>;
  /** 부위 로컬 윤곽 제어점 오프셋(고정 8점, 부위 크기 비율). */
  warp?: number[];
}

/** 시트 항목 = 셀렉터(region[+role|+leafId]) + 델타. */
export interface FitEntry extends FitDelta {
  region: RegionKey;
  /** '.부위[역할]' — ROLE_VOCAB의 key. leafId와 동시 지정 불가(leafId가 이김) */
  role?: string;
  /** '#겹id' — 룩 귀속 시트 전용. 잎 삭제 시 고아 항목(무시됨) */
  leafId?: string;
}

/** 핏 시트 한 장 — "내 핏" 라이브러리의 단위. */
export interface FitSheet {
  id: string;
  name: string;
  entries: FitEntry[];
}

/** 앱 전역 핏 상태 — 시트 라이브러리 + 메인 시트(기본 적용) 지정. */
export interface FitSheetsState {
  sheets: FitSheet[];
  mainId: string | null;
}

// ── 역할(role) 표준 어휘 — §5 신설. 잎의 선택 태그(없으면 부위 셀렉터까지만) ──

export const ROLE_VOCAB: Partial<
  Record<RegionKey, readonly { key: string; label: string }[]>
> = {
  // 같은 제품(섀도)의 배치 역할 차이 — 제품 종류가 다르면 세부부위(R2), 역할은 여기.
  // '언더'는 역할이 아니라 세부부위 '아이섀도 하'(A3) 소관 — 상/하 쌍은 이 앱에서
  // 항상 세부부위 분리(아이라인·속눈썹 선례). 역할 = 상 밴드 안의 배치만.
  eyeshadow: [
    { key: 'base', label: '베이스' },
    { key: 'main', label: '메인' },
    { key: 'point', label: '포인트' },
  ],
};

export function rolesOfRegion(
  region: RegionKey,
): readonly { key: string; label: string }[] {
  return ROLE_VOCAB[region] ?? [];
}

// ── 핏 필드 화이트리스트 — 카탈로그(axes.fit ∪ gold 슬라이더)에서 1회 유도 ────

export interface FitFieldDef {
  key: keyof FilterParams;
  label: string;
  min: number;
  max: number;
  fallback: number;
}

const FIELD_CACHE = new Map<RegionKey, FitFieldDef[]>();

/** 이 부위에서 핏이 만질 수 있는 룰 필드들(골드 슬라이더). 공간 한정 강제 지점. */
export function fitFieldsOfRegion(region: RegionKey): FitFieldDef[] {
  const hit = FIELD_CACHE.get(region);
  if (hit) return hit;
  const def = REGION_MAP[region];
  const out: FitFieldDef[] = [];
  const seen = new Set<string>();
  if (def) {
    for (const [axis, controls] of Object.entries(def.axes)) {
      for (const c of controls ?? []) {
        if (c.type !== 'slider') continue;
        // fit 축 슬라이더 전부 + 타 축의 골드(지오메트리) 슬라이더(눈썹 두께/아치 등)
        if (axis !== 'fit' && !c.gold) continue;
        const key = c.key as string;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key: c.key,
          label: c.label,
          min: c.min ?? 0,
          max: c.max ?? 1,
          fallback: c.fallback ?? 0,
        });
      }
    }
  }
  FIELD_CACHE.set(region, out);
  return out;
}

/** 핏을 걸 수 있는 부위 전부 — 골드 필드 보유 또는 데코(배치 아핀). UI 칩 재료. */
export function fitCapableRegions(): RegionKey[] {
  return REGION_DEFS.filter(
    d => d.fitTraits !== undefined,
  ).map(d => d.key);
}

// ── 해석(캐스케이드) ─────────────────────────────────────────────────────────

const AFFINE_FIELDS = ['dx', 'dy', 'sx', 'sy', 'rot'] as const;
type AffineField = typeof AFFINE_FIELDS[number];

const AFFINE_LIMITS: Record<AffineField, readonly [number, number]> = {
  dx: [-0.15, 0.15],
  dy: [-0.15, 0.15],
  sx: [-0.5, 0.5],
  sy: [-0.5, 0.5],
  rot: [-45, 45],
};

export const FIT_WARP_POINT_COUNT = 8;
export const FIT_WARP_RATIO_LIMIT = 0.2;

/** wire/storage 입력을 파일럿 8점 계약으로 고정하고 폭주·non-finite를 막는다. */
export function normalizeFitWarp(warp: readonly number[]): number[] {
  return Array.from({length: FIT_WARP_POINT_COUNT}, (_, index) => {
    const value = warp[index];
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(-FIT_WARP_RATIO_LIMIT, Math.min(FIT_WARP_RATIO_LIMIT, value));
  });
}

/** 좌우 대칭 부위는 동일 로컬 법선값을 반대 순서의 제어점에 적용한다. */
export function mirrorFitWarp(warp: readonly number[]): number[] {
  return normalizeFitWarp(warp).reverse();
}

function boundedAffine(field: AffineField, value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  const [min, max] = AFFINE_LIMITS[field];
  return Math.max(min, Math.min(max, value));
}

function affineFieldsOfRegion(region: RegionKey): Set<AffineField> {
  const backends = new Set(Object.values(REGION_MAP[region].fitTraits ?? {}));
  return new Set(
    AFFINE_FIELDS.filter(field => backends.has(`affine.${field}`)),
  );
}

/** 셀렉터 구체성 — 0=겹id, 1=역할, 2=부위. -1=불일치. */
function matchTier(
  e: FitEntry,
  region: RegionKey,
  role: string | undefined,
  leafId: string,
): number {
  if (e.region !== region) return -1;
  if (e.leafId) return e.leafId === leafId ? 0 : -1;
  if (e.role) return role !== undefined && e.role === role ? 1 : -1;
  return 2;
}

/**
 * 잎 하나의 computed 델타. sheets = 가까운 순(하위룩 → 룩 → 메인).
 * 필드별로 [구체성 → 시트 근접 → 시트 내 선언 순] 첫 매치가 이긴다.
 */
export function resolveLeafFit(
  region: RegionKey,
  role: string | undefined,
  leafId: string,
  sheets: FitSheet[],
): FitDelta | null {
  let out: FitDelta | null = null;
  const taken = new Set<string>();
  for (let tier = 0; tier <= 2; tier++) {
    for (const sheet of sheets) {
      for (const e of sheet.entries) {
        if (matchTier(e, region, role, leafId) !== tier) continue;
        for (const f of AFFINE_FIELDS) {
          const v = e[f];
          if (v !== undefined && !taken.has(f)) {
            (out ??= {})[f] = v;
            taken.add(f);
          }
        }
        if (e.rules) {
          for (const [k, v] of Object.entries(e.rules)) {
            const rk = `r:${k}`;
            if (v !== undefined && !taken.has(rk)) {
              out ??= {};
              (out.rules ??= {})[k] = v;
              taken.add(rk);
            }
          }
        }
        if (e.warp && !taken.has('warp')) {
          out ??= {};
          out.warp = normalizeFitWarp(e.warp);
          taken.add('warp');
        }
      }
    }
  }
  return out;
}

function activeSheetsForLayer(
  layer: ComposerLayer,
  byId: Map<string, FitSheet>,
  main: FitSheet | undefined,
): FitSheet[] {
  const active: FitSheet[] = [];
  for (const id of layer.fitChain ?? []) {
    const sheet = byId.get(id);
    if (sheet && !active.includes(sheet)) active.push(sheet);
  }
  if (main && !active.includes(main)) active.push(main);
  return active;
}

/**
 * 비-데코 잎의 computed 아핀을 부위별 브리지 배열로 컴파일한다.
 * 전량 0/미지정 부위는 싣지 않아 legacy 렌더를 유지하고, 같은 부위의 여러 잎은
 * compileLayers와 같은 순서로 마지막 보이는 잎이 이긴다.
 */
export function assembleRegionAffines(
  layers: ComposerLayer[],
  state: FitSheetsState,
): RegionAffine[] {
  if (state.sheets.length === 0) return [];
  const byId = new Map(state.sheets.map(sheet => [sheet.id, sheet]));
  const main = state.mainId ? byId.get(state.mainId) : undefined;
  const byRegion = new Map<RegionKey, RegionAffine>();
  for (const layer of layers) {
    if (!layer.visible || isDecoRegion(layer.region) || !REGION_MAP[layer.region].fitTraits) {
      continue;
    }
    // compileLayers의 마지막 보이는 잎 승리와 동일: 뒤 잎이 baseline이어도 앞 후보 삭제.
    byRegion.delete(layer.region);
    const active = activeSheetsForLayer(layer, byId, main);
    if (active.length === 0) continue;
    const delta = resolveLeafFit(layer.region, layer.role, layer.id, active);
    const allowed = affineFieldsOfRegion(layer.region);
    const valueOf = (field: AffineField) =>
      allowed.has(field) ? boundedAffine(field, delta?.[field]) : 0;
    const dx = valueOf('dx');
    const dy = valueOf('dy');
    const sx = valueOf('sx');
    const sy = valueOf('sy');
    const rot = valueOf('rot');
    if (dx === 0 && dy === 0 && sx === 0 && sy === 0 && rot === 0) {
      byRegion.delete(layer.region);
      continue;
    }
    byRegion.set(layer.region, {region: layer.region, dx, dy, sx, sy, rot});
  }
  return [...byRegion.values()];
}

/** 다음 full-state에서 사라진, 실제 전송 이력이 있는 부위만 0 reset 항목을 보탠다. */
export function regionAffinesForEmit(
  next: RegionAffine[],
  previous: RegionAffine[],
): RegionAffine[] {
  const active = new Set(next.map(affine => affine.region));
  const resets = previous
    .filter(affine => !active.has(affine.region))
    .map(affine => ({
      region: affine.region,
      dx: 0,
      dy: 0,
      sx: 0,
      sy: 0,
      rot: 0,
    }));
  return resets.length > 0 ? [...next, ...resets] : next;
}

const WARP_PILOT_REGIONS = new Set<RegionKey>(['eyeshadow', 'blush']);

/** 마지막 보이는 파일럿 잎의 computed warp를 부위별 wire 배열로 컴파일한다. */
export function assembleRegionWarps(
  layers: ComposerLayer[],
  state: FitSheetsState,
): RegionWarp[] {
  if (state.sheets.length === 0) return [];
  const byId = new Map(state.sheets.map(sheet => [sheet.id, sheet]));
  const main = state.mainId ? byId.get(state.mainId) : undefined;
  const byRegion = new Map<RegionKey, RegionWarp>();
  for (const layer of layers) {
    if (!layer.visible || !WARP_PILOT_REGIONS.has(layer.region)) continue;
    byRegion.delete(layer.region);
    const active = activeSheetsForLayer(layer, byId, main);
    if (active.length === 0) continue;
    const warp = resolveLeafFit(layer.region, layer.role, layer.id, active)?.warp;
    if (!warp?.some(value => value !== 0)) continue;
    byRegion.set(layer.region, {region: layer.region, warp: normalizeFitWarp(warp)});
  }
  return [...byRegion.values()];
}

/** 다음 full-state에서 사라진, 실제 전송 이력이 있는 warp 부위만 명시적으로 reset한다. */
export function regionWarpsForEmit(
  next: RegionWarp[],
  previous: RegionWarp[],
): RegionWarp[] {
  const active = new Set(next.map(item => item.region));
  const previousByRegion = new Map(previous.map(item => [item.region, item.warp]));
  const changed = next.filter(item => {
    const before = previousByRegion.get(item.region);
    return !before || before.length !== item.warp.length ||
      item.warp.some((value, index) => value !== before[index]);
  });
  const resets = previous
    .filter(item => !active.has(item.region))
    .map(item => ({region: item.region, warp: Array(FIT_WARP_POINT_COUNT).fill(0)}));
  return resets.length > 0 ? [...changed, ...resets] : changed;
}

// ── 적용(단일 지점) — flattenTree 결과 → 핏 얹은 사본 ────────────────────────

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * 잎 배열에 핏을 적용한 사본을 돌려준다(변경 없으면 입력 배열 그대로 — 메모 친화).
 * 룰 델타는 골드 필드 화이트리스트로 강제되고 컨트롤 [min,max]로 클램프된다.
 * 데코 잎은 오버레이 배치(x·y·scale·rotation)에 아핀을 얹는다. 렌즈는 v1 미지원.
 */
export function applyFitToLayers(
  layers: ComposerLayer[],
  state: FitSheetsState,
  baseDeltas: FitEntry[] = [],
): ComposerLayer[] {
  if (state.sheets.length === 0 && baseDeltas.length === 0) return layers;
  const byId = new Map(state.sheets.map(s => [s.id, s]));
  const main = state.mainId ? byId.get(state.mainId) : undefined;
  const baseByRegion = new Map<RegionKey, Record<string, number>>();
  for (const entry of baseDeltas) {
    if (entry.role || entry.leafId || !entry.rules) continue;
    const rules = baseByRegion.get(entry.region) ?? {};
    for (const [key, value] of Object.entries(entry.rules)) {
      if (Number.isFinite(value)) rules[key] = (rules[key] ?? 0) + value;
    }
    baseByRegion.set(entry.region, rules);
  }
  let changed = false;
  const out = layers.map(layer => {
    // 잎의 시트 사슬(가까운 순) + 메인 폴백 — 중복 제거.
    const active = activeSheetsForLayer(layer, byId, main);
    const d = active.length > 0
      ? resolveLeafFit(layer.region, layer.role, layer.id, active)
      : null;
    const baseRules = baseByRegion.get(layer.region);
    if (!d && !baseRules) return layer;

    if (isDecoRegion(layer.region)) {
      if (!layer.overlay || !d) return layer;
      const o = layer.overlay;
      const x = clamp01(o.x + boundedAffine('dx', d.dx));
      const y = clamp01(o.y + boundedAffine('dy', d.dy));
      const scale = Math.max(0.02, o.scale * (1 + boundedAffine('sx', d.sx)));
      const rotation = o.rotation + boundedAffine('rot', d.rot);
      if (x === o.x && y === o.y && scale === o.scale && rotation === o.rotation) {
        return layer;
      }
      changed = true;
      return { ...layer, overlay: { ...o, x, y, scale, rotation } };
    }

    const fields = fitFieldsOfRegion(layer.region);
    if (fields.length === 0) return layer;
    let params: Partial<FilterParams> | null = null;
    for (const f of fields) {
      const baseDelta = baseRules?.[f.key as string];
      const userDelta = d?.rules?.[f.key as string];
      const delta =
        (Number.isFinite(baseDelta) ? baseDelta! : 0) +
        (Number.isFinite(userDelta) ? userDelta! : 0);
      if (delta === 0) continue;
      const raw = layer.params[f.key];
      const base = typeof raw === 'number' && Number.isFinite(raw) ? raw : f.fallback;
      // 자동 기저+사용자 델타를 델타 도메인에서 먼저 합산하고 최종 범위를 한 번만 적용.
      const next = Math.min(f.max, Math.max(f.min, base + delta));
      if (next === base && raw !== undefined) continue;
      (params ??= { ...layer.params })[f.key] = next as never;
    }
    if (!params) return layer;
    changed = true;
    return { ...layer, params };
  });
  return changed ? out : layers;
}

// ── 시트 CRUD 도우미(UI 편집 표면용) ─────────────────────────────────────────

let seq = 0;

export function newFitSheet(name: string): FitSheet {
  return { id: `fs${Date.now().toString(36)}-${++seq}`, name, entries: [] };
}

export interface FitSelector {
  region: RegionKey;
  role?: string;
  leafId?: string;
}

function sameSel(e: FitEntry, sel: FitSelector): boolean {
  return (
    e.region === sel.region &&
    (e.role ?? null) === (sel.role ?? null) &&
    (e.leafId ?? null) === (sel.leafId ?? null)
  );
}

/** 정확히 같은 셀렉터의 항목을 찾는다(UI 슬라이더 현재값 표시용). */
export function entryOf(sheet: FitSheet, sel: FitSelector): FitEntry | undefined {
  return sheet.entries.find(e => sameSel(e, sel));
}

/**
 * 셀렉터 항목 갱신(불변) — 델타 0/undefined 필드는 지운다(0=baseline=부재).
 * 모든 필드가 비면 항목 자체를 제거해 시트를 깨끗하게 유지한다.
 */
export function upsertEntry(
  sheet: FitSheet,
  sel: FitSelector,
  patch: FitDelta,
): FitSheet {
  const prev = entryOf(sheet, sel);
  const merged: FitEntry = {
    region: sel.region,
    ...(sel.role ? { role: sel.role } : {}),
    ...(sel.leafId ? { leafId: sel.leafId } : {}),
  };
  for (const f of AFFINE_FIELDS) {
    const v = patch[f] !== undefined ? patch[f] : prev?.[f];
    if (v !== undefined && v !== 0) merged[f] = v;
  }
  const rules: Record<string, number> = { ...prev?.rules };
  for (const [k, v] of Object.entries(patch.rules ?? {})) {
    if (v === 0) delete rules[k];
    else rules[k] = v;
  }
  if (Object.keys(rules).length > 0) merged.rules = rules;
  const warpSource = patch.warp !== undefined ? patch.warp : prev?.warp;
  if (warpSource) {
    const warp = normalizeFitWarp(warpSource);
    if (warp.some(value => value !== 0)) merged.warp = warp;
  }
  const empty =
    AFFINE_FIELDS.every(f => merged[f] === undefined) && !merged.rules && !merged.warp;
  const rest = sheet.entries.filter(e => !sameSel(e, sel));
  return { ...sheet, entries: empty ? rest : [...rest, merged] };
}

/** 셀렉터 항목 삭제(부위 리셋 버튼). */
export function removeEntry(sheet: FitSheet, sel: FitSelector): FitSheet {
  return { ...sheet, entries: sheet.entries.filter(e => !sameSel(e, sel)) };
}
