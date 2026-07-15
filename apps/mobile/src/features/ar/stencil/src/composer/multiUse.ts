/**
 * 멀티유즈 — 한 제품(잎)을 다른 부위에도 쓰기 (#23 Phase 2).
 *
 * 실제 화장 문화: 립스틱을 볼에(립앤치크), 아이섀도를 셰이딩에. 브리지·Unity는
 * 무변경 — 잎의 **색·마감·농도만** 대상 부위의 브리지 필드로 "번역"하고, 모양·핏은
 * 대상 부위 기본값을 쓴다(모양·핏은 부위 고유라 옮기지 않는다).
 *
 * 번역 대상 3축은 각 부위 RegionDef.axes 선언에서 유도한다(카탈로그가 단일 출처 —
 * 부위/필드가 늘어도 매핑 테이블이 드리프트하지 않는다):
 *   - 색   = axes.color 첫 swatches 컨트롤의 key   (예: lipColor → blushColor)
 *   - 마감 = axes.finish 첫 컨트롤. 'finish' 타입(FINISHES 사다리 0=새틴…3=시머)
 *            끼리만 번역 — segments형(파운데/아이라이너 마감)은 값 규약이 달라 제외.
 *   - 농도 = onKeys[0] (부위 주 강도 = opacity 슬라이더 첫 키, 0..1 정규화 공용)
 *
 * 번역 불가(대상에 색 축이 없음 등)면 canMultiUse=false — UI가 회색 처리·제외한다.
 */
import type { FilterParams } from '../bridge/types';
import { BARE } from '../presets';
import {
  isDecoRegion,
  pickerVisibleRegionDefs,
  REGION_DEFS,
  REGION_MAP,
} from './regions';
import type { RegionDef, RegionKey } from './regions';
import { newRegionNode } from './lookTree';
import type { LookNode, ProductLeaf } from './lookTree';

/** 부위의 색/마감/농도 대표 필드 — axes 선언에서 유도(드리프트 방지). */
export interface CategoryKeys {
  colorKey?: keyof FilterParams;
  finishKey?: keyof FilterParams;
  shimmerKey?: keyof FilterParams;
  /** finish 컨트롤이 FINISHES 사다리('finish' 타입)인가 — segments형(값 규약 상이)과 구분 */
  finishIsLadder: boolean;
  intensityKey?: keyof FilterParams;
}

export function categoryKeys(def: RegionDef): CategoryKeys {
  const out: CategoryKeys = { finishIsLadder: false };
  for (const c of def.axes.color ?? []) {
    if (c.type === 'swatches') {
      out.colorKey = c.key;
      break;
    }
  }
  for (const c of def.axes.finish ?? []) {
    if (c.type === 'finish') {
      out.finishKey = c.finishKey;
      out.shimmerKey = c.shimmerKey;
      out.finishIsLadder = true;
      break;
    }
    if (c.type === 'segments') {
      out.finishKey = c.key;
      out.finishIsLadder = false;
      break;
    }
  }
  out.intensityKey = def.onKeys[0];
  return out;
}

/**
 * 소스 부위 제품을 타깃 부위에도 쓸 수 있는가 — 색이 양쪽에 있어야 의미가 있다
 * (색이 멀티유즈의 핵심 전달값: 립앤치크·섀도셰이딩 모두 "그 색을 다른 데도").
 * 같은 부위·데코(오버레이 전용)는 대상이 아니다.
 */
export function canMultiUse(source: RegionKey, target: RegionKey): boolean {
  if (source === target) return false;
  if (isDecoRegion(source) || isDecoRegion(target)) return false;
  const src = categoryKeys(REGION_MAP[source]);
  const tgt = categoryKeys(REGION_MAP[target]);
  return !!src.colorKey && !!tgt.colorKey;
}

/** 소스 부위 제품을 쓸 수 있는 타깃 부위 목록 (카탈로그 순서). */
export function multiUseTargets(source: RegionKey): RegionKey[] {
  return pickerVisibleRegionDefs(REGION_DEFS)
    .filter(d => canMultiUse(source, d.key))
    .map(d => d.key);
}

/**
 * 잎의 색·마감·농도를 타깃 부위 브리지 필드로 번역한 부분 params.
 * (모양·핏 축 필드는 담지 않는다 — 타깃 기본값을 그대로 쓴다.)
 */
export function translateLeafParams(
  leaf: ProductLeaf,
  target: RegionKey,
): Partial<FilterParams> {
  const src = categoryKeys(REGION_MAP[leaf.region]);
  const tgt = categoryKeys(REGION_MAP[target]);
  const patch: Partial<FilterParams> = {};
  const put = (k: keyof FilterParams, v: unknown) => {
    (patch as Record<string, unknown>)[k] = v;
  };
  // 색 — 소스 값(없으면 BARE 기본)을 타깃 색 필드로
  if (src.colorKey && tgt.colorKey) {
    const c = leaf.params[src.colorKey] ?? BARE[src.colorKey];
    if (typeof c === 'string') put(tgt.colorKey, c);
  }
  // 마감 — FINISHES 사다리끼리만 (0=새틴…3=시머 공용 규약)
  if (src.finishKey && tgt.finishKey && src.finishIsLadder && tgt.finishIsLadder) {
    const f = leaf.params[src.finishKey];
    if (typeof f === 'number') put(tgt.finishKey, f);
    if (src.shimmerKey && tgt.shimmerKey) {
      const s = leaf.params[src.shimmerKey];
      if (typeof s === 'number') put(tgt.shimmerKey, s);
    }
  }
  // 농도 — 0..1 정규화 공용, 그대로 이식
  if (src.intensityKey && tgt.intensityKey) {
    const v = leaf.params[src.intensityKey];
    if (typeof v === 'number') put(tgt.intensityKey, v);
  }
  return patch;
}

/**
 * 멀티유즈 결과 부위 룩 노드 — 타깃 부위의 새 region 룩(기본 모양·핏) 위에
 * 번역된 색·마감·농도를 얹은 잎 1장. 원본 잎은 호출부가 그대로 둔다(복제 개념).
 * 번역 불가면 null.
 */
export function multiUseRegionNode(
  leaf: ProductLeaf,
  target: RegionKey,
  current: FilterParams,
): LookNode | null {
  if (!canMultiUse(leaf.region, target)) return null;
  const region = newRegionNode(target, current);
  const sub = region.kids[0];
  if (!sub || sub.kind !== 'look') return region;
  const inner = sub.kids[0];
  if (!inner || inner.kind !== 'app') return region;
  const patch = translateLeafParams(leaf, target);
  const srcLabel = REGION_MAP[leaf.region].label;
  const newLeaf: ProductLeaf = {
    ...inner,
    params: { ...inner.params, ...patch },
  };
  const newSub: LookNode = { ...sub, kids: [newLeaf] };
  return {
    ...region,
    name: `${REGION_MAP[target].label} (${srcLabel}에서)`,
    kids: [newSub],
  };
}
