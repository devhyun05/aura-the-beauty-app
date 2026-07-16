/**
 * 튜토리얼 가이드 — 룩 순서 스텝. 현재 룩 트리의 **잎(제품×바르는곳, 소분류=레이어)**을
 * 바르는 순서대로(하단=먼저, R4) 하나씩 스텝으로 안내한다. 부위로 묶지 않고 잎 하나가
 * 한 스텝(립 4겹=4스텝, 아이섀도 3겹=3스텝) — "이 제품을 여기에 → 다음 제품을 여기에".
 *
 * 각 스텝은 그 잎의 부위에 해당하는 캐노니컬 가이드 윤곽 하나를 격리해 켠다(Unity 무변경
 * 부분은 기존 윤곽 재사용). 잎별 정확한 지오메트리(각 잎 shape/fit 반영)는 후속.
 * 가이드 윤곽이 있는 부위의 잎만 스텝이 된다(피부·파우더·렌즈 등 윤곽 미지원은 제외).
 */
import type { StencilParams } from '../bridge/types';
import { isLeaf } from './lookTree';
import type { LookNode } from './lookTree';
import type { RegionKey } from './regions';

/** StencilParams의 부위 boolean 키(연출·opacity 제외) */
export type StencilKey =
  | 'lips'
  | 'brows'
  | 'eyeshadow'
  | 'eyeliner'
  | 'aegyo'
  | 'blush'
  | 'highlighter'
  | 'contour';

// 잎의 세부부위(RegionKey) → 캐노니컬 스텐실 가이드 부위. 매핑 없는 부위(피부·파우더·
// 하이라이터·속눈썹·렌즈·데코 등)는 윤곽이 없어 스텝에서 제외(후속에서 확장).
const REGION_TO_STENCIL: Partial<Record<RegionKey, StencilKey>> = {
  lipBase: 'lips',
  lip: 'lips',
  lipLiner: 'lips',
  lipGloss: 'lips',
  browConceal: 'brows',
  brow: 'brows',
  browPowder: 'brows',
  browPencil: 'brows',
  browLightener: 'brows',
  browStyle: 'brows',
  eyeshadow: 'eyeshadow',
  eyelinerUpper: 'eyeliner',
  eyelinerLower: 'eyeliner',
  aegyo: 'aegyo',
  blush: 'blush',
  highlighter: 'highlighter',
  highlightCheek: 'highlighter',
  highlightNoseBridge: 'highlighter',
  highlightNoseTip: 'highlighter',
  highlightBrowBone: 'highlighter',
  highlightCupid: 'highlighter',
  contour: 'contour',
};

/** 가이드 부위명(스텝 보조 표기) */
export const STENCIL_ZONE_LABEL: Record<StencilKey, string> = {
  lips: '립',
  brows: '눈썹',
  eyeshadow: '아이섀도',
  eyeliner: '아이라인',
  aegyo: '애교살',
  blush: '블러셔',
  highlighter: '하이라이터',
  contour: '컨투어',
};

export interface StencilStep {
  /** 잎 id — React key·스텝 고유 식별 */
  id: string;
  /** 하이라이트할 가이드 부위 */
  key: StencilKey;
  /** 제품 이름(잎 라벨) — "무엇을" */
  label: string;
  /** 가이드 부위명 — "어디에"(보조) */
  zone: string;
}

/**
 * 룩 트리 → 잎별 스텝(바르는 순서 = DFS, 하단 먼저). 안 보이는 노드/잎은 제외,
 * 가이드 윤곽이 있는 부위의 잎만. 빈 룩이면 빈 배열.
 */
export function stencilStepsFromTree(tree: LookNode | null): StencilStep[] {
  const out: StencilStep[] = [];
  if (!tree || !tree.visible) return out;
  const walk = (node: LookNode) => {
    if (!node.visible) return;
    for (const child of node.kids) {
      if (isLeaf(child)) {
        if (!child.visible) continue;
        const key = REGION_TO_STENCIL[child.region];
        if (key) {
          out.push({
            id: child.id,
            key,
            label: child.label,
            zone: STENCIL_ZONE_LABEL[key],
          });
        }
      } else {
        walk(child);
      }
    }
  };
  walk(tree);
  return out;
}

/**
 * 특정 스텝(부위) 하나만 켠 StencilParams — 나머지 부위 끔, opacity·연출(pulse/dash) 유지.
 * key=null이면 전 부위 끔(가이드 없음).
 */
export function isolateStencilStep(
  base: StencilParams,
  key: StencilKey | null,
): StencilParams {
  return {
    ...base,
    lips: key === 'lips',
    brows: key === 'brows',
    eyeshadow: key === 'eyeshadow',
    eyeliner: key === 'eyeliner',
    aegyo: key === 'aegyo',
    blush: key === 'blush',
    highlighter: key === 'highlighter',
    contour: key === 'contour',
  };
}
