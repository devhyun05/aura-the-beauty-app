import {
  AR_BLUSH_DEFAULT_COLOR,
  AR_BLUSH_DEFAULT_SHAPE,
  clampArBlushIntensity,
  getArBlushShapeByValue,
} from '../../../../../shared/contracts/arBlushCatalog';
import type {FilterParams} from '../bridge/types';
import {
  isLeaf,
  setSubRegion,
  subDefsForRegion,
  updateLeaf,
} from './lookTree';
import type {
  LookLibrary,
  LookNode,
  ProductLeaf,
} from './lookTree';

/** buildVariantLibrary가 기존부터 제공하던 카드 ID. 저장 호환을 위해 바꾸지 않는다. */
export const DEFAULT_BLUSH_SUB_LOOK_ID = 'sys:var:blush:classic-rose:s0';

export type BlushTreeState = {
  enabled: boolean;
  leafId: string | null;
  shapeValue: number;
  color: string;
  intensity: number;
};

export type BlushTreePatch = {
  shapeValue?: number;
  color?: string;
  intensity?: number;
};

/** compileLayers의 last-writer-wins와 같은 순서로 마지막 보이는 블러셔 잎을 찾는다. */
function findVisibleBlushLeaf(root: LookNode | null): ProductLeaf | null {
  if (!root?.visible) return null;
  let found: ProductLeaf | null = null;

  const visit = (node: LookNode) => {
    if (!node.visible) return;
    for (const child of node.kids) {
      if (isLeaf(child)) {
        if (child.visible && child.region === 'blush') found = child;
      } else {
        visit(child);
      }
    }
  };

  visit(root);
  return found;
}

export function readBlushTree(root: LookNode | null): BlushTreeState {
  const leaf = findVisibleBlushLeaf(root);
  if (!leaf) {
    return {
      enabled: false,
      leafId: null,
      shapeValue: AR_BLUSH_DEFAULT_SHAPE.value,
      color: AR_BLUSH_DEFAULT_COLOR.hex,
      intensity: 0,
    };
  }

  const storedShape = leaf.params.blushShape;
  return {
    enabled: true,
    leafId: leaf.id,
    shapeValue:
      getArBlushShapeByValue(storedShape)?.value ?? AR_BLUSH_DEFAULT_SHAPE.value,
    color:
      typeof leaf.params.blushColor === 'string'
        ? leaf.params.blushColor
        : AR_BLUSH_DEFAULT_COLOR.hex,
    intensity: clampArBlushIntensity(leaf.params.blushIntensity ?? 0),
  };
}

/**
 * 블러셔가 없는 룩에서 색/모양/농도 중 하나를 처음 고르면 기존 클래식 룩 잎을
 * 시드한다. 이후 patch는 한 필드만 바꿔 나머지 축을 보존한다.
 */
export function ensureBlushTree(
  root: LookNode | null,
  library: LookLibrary,
): LookNode | null {
  if (findVisibleBlushLeaf(root)) return root;
  const defaultDefinitionId = library[DEFAULT_BLUSH_SUB_LOOK_ID]
    ? DEFAULT_BLUSH_SUB_LOOK_ID
    : subDefsForRegion(library, 'blush')[0]?.id;
  if (!defaultDefinitionId) return root;
  return setSubRegion(root, library, '컨투어', 'blush', defaultDefinitionId);
}

export function patchBlushTree(
  root: LookNode | null,
  library: LookLibrary,
  patch: BlushTreePatch,
): LookNode | null {
  const params: Partial<FilterParams> = {};

  if (
    patch.shapeValue !== undefined &&
    getArBlushShapeByValue(patch.shapeValue)
  ) {
    const shape = getArBlushShapeByValue(patch.shapeValue)!;
    params.blushShape = shape.value;
    params.blushLift = shape.lift;
    params.blushSpread = shape.spread;
  }
  if (patch.color !== undefined) params.blushColor = patch.color;
  if (patch.intensity !== undefined) {
    params.blushIntensity = clampArBlushIntensity(patch.intensity);
  }
  if (Object.keys(params).length === 0) return root;

  const ensured = ensureBlushTree(root, library);
  const leaf = findVisibleBlushLeaf(ensured);
  if (!ensured || !leaf) return root;
  return updateLeaf(ensured, leaf.id, {params});
}

export function removeBlushTree(
  root: LookNode | null,
  library: LookLibrary,
): LookNode | null {
  return setSubRegion(root, library, '컨투어', 'blush', null);
}
