/**
 * 치아 미백 — 기본 모드 전용 슬라이더 백엔드(블러셔 blushTree 준용).
 *
 * 립 슬롯의 '치아' 세부부위는 강도(teethWhitenIntensity) 한 축만 있으므로, 카드 선택 +
 * 슬롯 게인('립 농도')으로는 미백 정도를 직접 조절할 수 없었다(#치아 QA). 이 헬퍼로
 * 치아 세부부위 잎의 teethWhitenIntensity를 직접 읽고/쓰며, 슬라이더 조작만으로 세부부위를
 * 생성(자동 활성)한다. 렌더는 MakeupController.ApplyTo → TeethRenderer.ApplyParams가
 * teethWhitenIntensity를 그대로 받는다(입을 벌렸을 때만 밝은 치아 픽셀 미백).
 */
import {isLeaf, setSubRegion, updateLeaf} from './lookTree';
import type {LookLibrary, LookNode, ProductLeaf} from './lookTree';

/** buildVariantLibrary가 등록하는 단일 치아 룩 잎 id(치아 미백). 저장 호환용 고정. */
export const DEFAULT_TEETH_SUB_LOOK_ID = 'sys:var:teeth:whiten:s0';
export const TEETH_DEFAULT_INTENSITY = 0.5;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** compileLayers의 last-writer-wins와 같은 순서로 마지막 보이는 치아 잎을 찾는다. */
function findVisibleTeethLeaf(root: LookNode | null): ProductLeaf | null {
  if (!root?.visible) return null;
  let found: ProductLeaf | null = null;
  const visit = (node: LookNode) => {
    if (!node.visible) return;
    for (const child of node.kids) {
      if (isLeaf(child)) {
        if (child.visible && child.region === 'teeth') found = child;
      } else {
        visit(child);
      }
    }
  };
  visit(root);
  return found;
}

export type TeethTreeState = {enabled: boolean; intensity: number};

export function readTeethTree(root: LookNode | null): TeethTreeState {
  const leaf = findVisibleTeethLeaf(root);
  if (!leaf) return {enabled: false, intensity: TEETH_DEFAULT_INTENSITY};
  const raw = leaf.params.teethWhitenIntensity;
  return {
    enabled: true,
    intensity: clamp01(typeof raw === 'number' ? raw : TEETH_DEFAULT_INTENSITY),
  };
}

function ensureTeethTree(
  root: LookNode | null,
  library: LookLibrary,
): LookNode | null {
  if (findVisibleTeethLeaf(root)) return root;
  if (!library[DEFAULT_TEETH_SUB_LOOK_ID]) return root;
  return setSubRegion(root, library, '립', 'teeth', DEFAULT_TEETH_SUB_LOOK_ID);
}

/** 미백 강도(0..1)를 직접 설정 — 치아 세부부위가 없으면 생성(자동 활성). */
export function patchTeethTree(
  root: LookNode | null,
  library: LookLibrary,
  intensity: number,
): LookNode | null {
  const ensured = ensureTeethTree(root, library);
  const leaf = findVisibleTeethLeaf(ensured);
  if (!ensured || !leaf) return root;
  return updateLeaf(ensured, leaf.id, {
    params: {teethWhitenIntensity: clamp01(intensity)},
  });
}

export function removeTeethTree(
  root: LookNode | null,
  library: LookLibrary,
): LookNode | null {
  return setSubRegion(root, library, '립', 'teeth', null);
}
